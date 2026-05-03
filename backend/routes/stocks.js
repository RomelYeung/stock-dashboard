import express from "express";
import * as yf from "../services/yahoofinance.js";
import * as cache from "../services/cache.js";
import * as fred from "../services/fred.js";
import * as marginDebtService from "../services/marginDebt.js";
import * as sectorScore from "../services/sectorScore.js";
import {
  MAX_PORTFOLIO_TICKERS,
  VALID_PERIODS,
  TICKER_REGEX,
  YAHOO_FINANCE_DELAY_MS,
} from "../constants.js";

const router = express.Router();

// ETFs for sector tracking (GICS + Thematic)
const sectorEtfs = [
  // GICS Sectors
  { ticker: "XLK", name: "Technology Select Sector SPDR Fund", sector: "Technology", type: "gics" },
  { ticker: "XLV", name: "Health Care Select Sector SPDR Fund", sector: "Healthcare", type: "gics" },
  { ticker: "XLF", name: "Financial Select Sector SPDR Fund", sector: "Financials", type: "gics" },
  { ticker: "XLE", name: "Energy Select Sector SPDR Fund", sector: "Energy", type: "gics" },
  { ticker: "XLI", name: "Industrial Select Sector SPDR Fund", sector: "Industrials", type: "gics" },
  { ticker: "XLP", name: "Consumer Staples Select Sector SPDR Fund", sector: "Consumer Staples", type: "gics" },
  { ticker: "XLY", name: "Consumer Discretionary Select Sector SPDR Fund", sector: "Consumer Discretionary", type: "gics" },
  { ticker: "XLU", name: "Utilities Select Sector SPDR Fund", sector: "Utilities", type: "gics" },
  { ticker: "XLB", name: "Materials Select Sector SPDR Fund", sector: "Materials", type: "gics" },
  { ticker: "XLC", name: "Communication Services Select Sector SPDR Fund", sector: "Communication Services", type: "gics" },
  { ticker: "XLRE", name: "Real Estate Select Sector SPDR Fund", sector: "Real Estate", type: "gics" },
  // Thematic Sectors
  { ticker: "BOTZ", name: "Global X Robotics & Artificial Intelligence ETF", sector: "AI/Robotics", type: "thematic" },
  { ticker: "SOXX", name: "iShares Semiconductor ETF", sector: "Semiconductors", type: "thematic" },
  { ticker: "ICLN", name: "iShares Global Clean Energy ETF", sector: "Clean Energy", type: "thematic" },
  { ticker: "CIBR", name: "First Trust NASDAQ Cybersecurity ETF", sector: "Cybersecurity", type: "thematic" },
  { ticker: "XBI", name: "SPDR S&P Biotech ETF", sector: "Biotech", type: "thematic" },
  { ticker: "ARKK", name: "ARK Innovation ETF", sector: "Innovation", type: "thematic" },
  { ticker: "FINX", name: "Global X FinTech ETF", sector: "Fintech", type: "thematic" },
  { ticker: "METV", name: "Roundhill Ball Metaverse ETF", sector: "Metaverse", type: "thematic" },
  { ticker: "CLOU", name: "Global X Cloud Computing ETF", sector: "Cloud Computing", type: "thematic" },
  { ticker: "ESGU", name: "iShares ESG Aware MSCI USA ETF", sector: "ESG", type: "thematic" },
];

// Normalize and validate ticker
router.param("ticker", (req, res, next, ticker) => {
  const normalized = ticker.toUpperCase();
  if (!TICKER_REGEX.test(normalized)) {
    return res.status(400).json({ success: false, error: `Invalid ticker format: ${ticker}` });
  }
  req.ticker = normalized;
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
  if (!VALID_PERIODS.includes(period)) {
    return res.status(400).json({ success: false, error: `Invalid period. Use one of: ${VALID_PERIODS.join(", ")}` });
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
  if (tickers.length > MAX_PORTFOLIO_TICKERS) {
    return res.status(400).json({ success: false, error: `Maximum ${MAX_PORTFOLIO_TICKERS} tickers per request.` });
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

// ─── Market Indicators ──────────────────────────────────────────────────────

// GET /api/stocks/market/indicators
router.get("/market/indicators", async (req, res) => {
  try {
    const period = req.query.period || '5y';
    console.log(`Market indicators endpoint called (period: ${period})`);

    // Convert period to Yahoo Finance format
    const yfPeriod = period === '5y' ? '5y' : period;

    // 1. VIX
    const vixSummaryPromise = yf.getSummary("^VIX");
    const vixHistoryPromise = yf.getPriceHistory("^VIX", yfPeriod);

    // 2. Fed Policy
    const fedPolicyPromise = fred.getFedFundsRate(period);

    // 3. FINRA Margin Debt (sync)
    const marginDebt = marginDebtService.getMarginDebt(period);

    // 4. Credit Spreads
    const creditSpreadsPromise = fred.getCreditSpreads(period);

    // 5. Inflation
    const inflationPromise = fred.getInflation(period);

    const [vixSummary, vixHistory, fedPolicy, creditSpreads, inflation] = await Promise.all([
      vixSummaryPromise,
      vixHistoryPromise,
      fedPolicyPromise,
      creditSpreadsPromise,
      inflationPromise,
    ]);

    const vix = {
      currentValue: vixSummary.currentPrice,
      history: vixHistory.map(item => ({ date: item.date, value: item.close })),
    };

    res.json({
      success: true,
      data: {
        vix,
        fedPolicy,
        marginDebt,
        creditSpreads,
        inflation,
      },
    });
  } catch (err) {
    console.error("[market-indicators]:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stocks/market/earnings-profile
// Returns earnings surprise and growth data for top holdings of sector ETFs
router.get("/market/earnings-profile", async (req, res) => {
  try {
    const earningsProfile = [];
    for (const etf of sectorEtfs) {
      const holdings = await yf.getHoldings(etf.ticker);
      for (const holding of holdings) {
        try {
          const financials = await yf.getFinancials(holding.symbol);
          const latestSurprise = financials.epsSurprises?.[0];
          earningsProfile.push({
            ticker: holding.symbol,
            name: holding.name,
            sectorEtfTicker: etf.ticker,
            sectorEtfName: etf.name,
            epsActual: latestSurprise?.actual || null,
            epsEstimate: latestSurprise?.estimate || null,
            epsSurprisePercent: latestSurprise?.surprisePercent || null,
            revenue: financials.totalRevenue,
            revenueGrowth: financials.revenueGrowth,
            earningsGrowth: financials.earningsGrowth,
          });
        } catch (err) {
          console.error(`[earnings-profile] ${holding.symbol}:`, err.message);
        }
        await new Promise(resolve => setTimeout(resolve, YAHOO_FINANCE_DELAY_MS));
      }
    }

    res.json({ success: true, data: earningsProfile });
  } catch (err) {
    console.error("[earnings-profile]:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Sector Rotation ──────────────────────────────────────────

// GET /api/stocks/sector-rotation
router.get("/sector-rotation", async (req, res) => {
  try {
    const etfTickers = sectorEtfs.map(e => e.ticker);

    const [summaryResults, spyOhlcv] = await Promise.all([
      yf.getPortfolioSummaries(etfTickers),
      yf.getOhlcv("SPY", "1y"),
    ]);

    const etfsWithData = [];
    for (const [index, etf] of sectorEtfs.entries()) {
      try {
        const ohlcv = await yf.getOhlcv(etf.ticker, "1y");
        etfsWithData.push({
          ...etf,
          summary: summaryResults[index].data,
          ohlcv,
        });
      } catch (err) {
        console.error(`[sector-rotation] ${etf.ticker} OHLCV:`, err.message);
        etfsWithData.push({ ...etf, summary: summaryResults[index].data, ohlcv: null });
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const etfsWithScores = sectorScore.calculateEtfsScores(etfsWithData, spyOhlcv);
    const rankedSectors = sectorScore.rankSectors(etfsWithScores);
    const topSector = rankedSectors[0] || null;

    res.json({
      success: true,
      data: {
        topSector,
        rankedSectors,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[sector-rotation]:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Margin Debt Update ───────────────────────────────────────────────

// POST /api/stocks/market/update-margin-debt
// Manual trigger to refresh margin debt data from FINRA
router.post("/market/update-margin-debt", async (req, res) => {
  try {
    const result = await marginDebtService.updateMarginDebt();
    res.json({ success: true, message: "Margin debt data updated successfully", lastUpdated: result.lastUpdated });
  } catch (err) {
    console.error("[update-margin-debt]:", err.message);
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