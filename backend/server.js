import express from "express";
import cors from "cors";
import stockRoutes from "./routes/stocks.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  methods: ["GET", "POST", "DELETE"],
}));
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────

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

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🚀 Stock Dashboard API running on http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Example:      http://localhost:${PORT}/api/stocks/AAPL/summary\n`);
});