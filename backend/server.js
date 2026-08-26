import dotenv from "dotenv";
dotenv.config(); // Trigger nodemon restart: 2026-07-18T21:37

import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "",
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "development",
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 0.1,
  profilesSampleRate: 0.1,
});

import express from "express";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import stockRoutes from "./routes/stocks.js";
import authRoutes from "./routes/auth.js";
import portfolioRoutes from "./routes/portfolio.js";
import optionsRoutes from "./routes/options.js";
import aiRoutes from "./routes/ai.js";
import gurusRoutes from "./routes/gurus.js";
import errorHandler from "./middleware/errorHandler.js";
import { autoUpdateCheck } from "./services/marginDebt.js";
import { seedAdmin } from "./scripts/seed.js";
import { startCronJob as startHistoricalIVCron } from "./scripts/historical-iv-worker.js";
import { startDailySyncCron } from "./services/sec.js";
import { preloadEarningsCalendar } from "./services/earningsCalendar.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
  methods: ["GET", "POST", "DELETE"],
}));
app.use(express.json());
app.use(cookieParser());

import {
  RATE_LIMIT_GLOBAL_MAX,
  RATE_LIMIT_INDICATORS_MAX,
  RATE_LIMIT_LIVE_PRICES_MAX,
  RATE_LIMIT_WINDOW_MS,
} from "./constants.js";

// Rate limiting
const globalLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_GLOBAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, error: "Too many requests. Please slow down." });
  },
});
const indicatorsLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_INDICATORS_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, error: "Too many requests to indicators endpoint." });
  },
});
// Dedicated limiter for live prices — higher limit since endpoint is cache-backed
// and designed for frequent polling (every 30s during market hours)
const livePricesLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_LIVE_PRICES_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, error: "Live price updates rate limited. Try again shortly." });
  },
});
app.use(compression());
app.use(globalLimiter);
app.use("/api/stocks/market", indicatorsLimiter);
app.use("/api/stocks/portfolio/live", livePricesLimiter);

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────

app.use("/api/auth", authRoutes);
app.use("/api/stocks", stockRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/options", optionsRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/gurus", gurusRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Sentry test route (intentionally throws to verify error tracking)
app.get("/api/debug-sentry", (req, res) => {
  throw new Error("Sentry test error from backend!");
});

// Sentry error handler (must be before our custom error handler)
Sentry.setupExpressErrorHandler(app);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────

// console.log("Attempting to listen on port", PORT);
app.listen(PORT, () => {
  console.log(`\n🚀 Stock Dashboard API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Example:      http://localhost:${PORT}/api/stocks/AAPL/summary\n`);

  // Run auto-update check for margin debt data
  autoUpdateCheck();

  // Seed default admin user if none exists
  seedAdmin();

  // Start daily scheduled IV ingestion cron job
  startHistoricalIVCron();

  // Start daily scheduled SEC filings ingestion cron job
  startDailySyncCron();

  // Preload the Finnhub earnings calendar into cache (non-blocking)
  preloadEarningsCalendar();
});
