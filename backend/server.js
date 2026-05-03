import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import compression from "compression";
import rateLimit from "express-rate-limit";
import stockRoutes from "./routes/stocks.js";
import { autoUpdateCheck } from "./services/marginDebt.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  methods: ["GET", "POST", "DELETE"],
}));
app.use(express.json());

import {
  RATE_LIMIT_GLOBAL_MAX,
  RATE_LIMIT_INDICATORS_MAX,
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
app.use(compression());
app.use(globalLimiter);
app.use("/api/stocks/market", indicatorsLimiter);

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

app.use("/api/stocks", stockRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ success: false, error: "Internal server error." });
});

// ─── Start ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 Stock Dashboard API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Example:      http://localhost:${PORT}/api/stocks/AAPL/summary\n`);

  // Run auto-update check for margin debt data
  autoUpdateCheck();
});
