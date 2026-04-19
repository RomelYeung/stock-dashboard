import express from "express";
import * as yf from "../services/yahoofinance.js";
import * as cache from "../services/cache.js";

const router = express.Router();

// Normalize ticker to uppercase
router.param("ticker", (req, res, next, ticker) => {
  req.ticker = ticker.toUpperCase();
  next();
});

// ─── Single ticker endpoints ──────────────────────────────────────────────────

// GET /api/stocks/:ticker/summary
// Returns price, valuation metrics (P/E, P/B, EV/EBITDA), 52wk range
router.get("/:ticker/summary", async (req, res) => {
  try {
    const data = await yf.getSummary(req.ticker);
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[summary] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/financials
// Returns margins, ROE, revenue, EPS, growth rates, annual income history
router.get("/:ticker/financials", async (req, res) => {
  try {
    const data = await yf.getFinancials(req.ticker);
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[financials] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/balance-sheet
// Returns debt, cash, current ratio, FCF, annual balance sheet history
router.get("/:ticker/balance-sheet", async (req, res) => {
  try {
    const data = await yf.getBalanceSheet(req.ticker);
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[balance-sheet] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/price-history?period=1y
// Returns OHLCV data. period: 1mo | 3mo | 6mo | 1y | 2y | 5y
router.get("/:ticker/price-history", async (req, res) => {
  const period = req.query.period || "1y";
  const validPeriods = ["1mo", "3mo", "6mo", "1y", "2y", "5y"];
  if (!validPeriods.includes(period)) {
    return res.status(400).json({ success: false, error: `Invalid period. Use one of: ${validPeriods.join(", ")}` });
  }
  try {
    const data = await yf.getPriceHistory(req.ticker, period);
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[price-history] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/all
// Convenience endpoint: fetches summary + financials + balance sheet in parallel
router.get("/:ticker/all", async (req, res) => {
  try {
    const [summary, financials, balanceSheet] = await Promise.all([
      yf.getSummary(req.ticker),
      yf.getFinancials(req.ticker),
      yf.getBalanceSheet(req.ticker),
    ]);
    res.json({ success: true, data: { summary, financials, balanceSheet } });
  } catch (err) {
    console.error(`[all] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// ─── Portfolio endpoints ──────────────────────────────────────────────────────

// POST /api/stocks/portfolio
// Body: { tickers: ["AAPL", "MSFT", "GOOG"] }
// Returns summary data for all tickers with per-ticker error handling
router.post("/portfolio", async (req, res) => {
  const { tickers } = req.body;

  if (!Array.isArray(tickers) || tickers.length === 0) {
    return res.status(400).json({ success: false, error: "Provide a non-empty 'tickers' array in the request body." });
  }
  if (tickers.length > 20) {
    return res.status(400).json({ success: false, error: "Maximum 20 tickers per request." });
  }

  try {
    const results = await yf.getPortfolioSummaries(tickers.map((t) => t.toUpperCase()));
    const errors = results.filter((r) => r.error);
    res.json({
      success: true,
      data: results,
      meta: {
        total: results.length,
        succeeded: results.length - errors.length,
        failed: errors.length,
      },
    });
  } catch (err) {
    console.error("[portfolio]:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Cache management ─────────────────────────────────────────────────────────

// GET /api/stocks/cache/stats
router.get("/cache/stats", (req, res) => {
  res.json({ success: true, data: cache.stats() });
});

// DELETE /api/stocks/cache
router.delete("/cache", (req, res) => {
  cache.flush();
  res.json({ success: true, message: "Cache cleared." });
});

export default router;