import express from "express";
import { z } from "zod";
import * as yf from "../services/yahoofinance.js";
import * as cache from "../services/cache.js";
import * as fred from "../services/fred.js";
import * as marginDebtService from "../services/marginDebt.js";
import * as sectorScore from "../services/sectorScore.js";
import * as aaii from "../services/aaii.js";
import * as insiderTrading from "../services/insiderTrading.js";
import * as comparables from "../services/comparables.js";
import { getQuotes, getPriceHistory, getOptionChain, getMovers } from "../services/schwab-client.js";
import { getTokenHealth } from "../services/schwab-auth.js";
import { startAuthFlow } from "../services/schwab-callback-server.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import NodeCache from "node-cache";
import {
  MAX_PORTFOLIO_TICKERS,
  MAX_WISHLIST_TICKERS,
  VALID_PERIODS,
  TICKER_REGEX,
  YAHOO_FINANCE_DELAY_MS,
} from "../constants.js";
import { calculateWACC, projectFCF, monteCarlo, aggregateDCFInputs } from "../services/dcf.js";

const router = express.Router();
const MAX_BATCH_TICKERS = MAX_PORTFOLIO_TICKERS + MAX_WISHLIST_TICKERS;
const searchCache = new NodeCache({ stdTTL: 300, checkperiod: 60 }); // 5 min TTL

// ─── Zod validation schemas ─────────────────────────────────────────────

const searchQuerySchema = z.object({
  q: z.string().min(1, 'Query parameter "q" is required.'),
});

const priceHistoryQuerySchema = z.object({
  period: z.enum(VALID_PERIODS).optional().default("1y"),
});

const dcfQuerySchema = z.object({
  simulations: z.coerce.number().int().min(100).max(100000).optional().default(1000),
});

const tickersBodySchema = z.object({
  tickers: z
    .array(z.string().min(1).max(10).transform((s) => s.toUpperCase()))
    .min(1, "Provide a non-empty tickers array.")
    .max(MAX_BATCH_TICKERS, `Maximum ${MAX_BATCH_TICKERS} tickers per request.`),
});

const schwabQuotesSchema = z.object({
  symbols: z.array(z.string().min(1)).min(1, "symbols array required"),
  fields: z.any().optional(),
});



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

// GET /api/stocks/search?q=apple
// Search tickers via Yahoo Finance
router.get("/search", validate(searchQuerySchema, "query"), async (req, res) => {
  const { q } = req.query;

  try {
    const cacheKey = `search:${q.trim().toUpperCase()}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const searchPromise = yf.searchTickers(q.trim(), { quotesCount: 8 });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Search timeout")), 5000)
    );
    const tickers = await Promise.race([searchPromise, timeoutPromise]);

    const quotes = tickers
      .filter((item) => item.quoteType === "EQUITY" || item.quoteType === "ETF")
      .map((item) => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        exchange: item.exchange,
        type: item.quoteType,
      }))
      .slice(0, 8);

    searchCache.set(cacheKey, quotes);
    res.json({ success: true, data: quotes });
  } catch (err) {
    console.error("[search] error:", err.message);
    if (err.message === "Search timeout") {
      return res.status(504).json({ success: false, error: "Search timed out. Please try again." });
    }
    res.status(500).json({ success: false, error: "Search failed." });
  }
});

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
router.get("/:ticker/price-history", validate(priceHistoryQuerySchema, "query"), async (req, res) => {
  const { period } = req.query;
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

// GET /api/stocks/:ticker/insider-trading
// Returns insider transaction signal, summary, and recent Form 4 filings
router.get("/:ticker/insider-trading", async (req, res) => {
  try {
    const data = await insiderTrading.getInsiderTrading(req.ticker);
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[insider-trading] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/comparables
// Returns sector peer comparison with valuation, growth, profitability, health metrics + sparklines
router.get("/:ticker/comparables", async (req, res) => {
  try {
    const data = await comparables.getComparables(req.ticker);
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[comparables] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/dcf?simulations=1000
router.get("/:ticker/dcf", validate(dcfQuerySchema, "query"), async (req, res) => {
  const { simulations } = req.query;
  try {
    const [summary, financials, balanceSheet] = await Promise.all([
      yf.getSummary(req.ticker),
      yf.getFinancials(req.ticker),
      yf.getBalanceSheet(req.ticker),
    ]);

    const annualIncome = financials?.annualIncome || [];
    const annualCashFlow = balanceSheet?.annualCashFlow || [];

    const params = aggregateDCFInputs(summary, financials, balanceSheet, annualIncome, annualCashFlow);

    if (!params.fcf || params.fcf <= 0) {
      return res.json({
        success: true,
        data: {
          ticker: req.ticker,
          params,
          dcf: null,
          monteCarlo: null,
          warning: "DCF analysis unavailable — company has zero or negative free cash flow.",
        },
      });
    }

    if (params.wacc <= params.terminalGrowth) {
      return res.json({
        success: true,
        data: {
          ticker: req.ticker,
          params,
          dcf: null,
          monteCarlo: null,
          warning: "DCF analysis unavailable — WACC is less than or equal to terminal growth rate.",
        },
      });
    }

    const dcf = projectFCF(
      params.fcf, params.projectionGrowth, params.terminalGrowth,
      params.wacc, params.cash, params.debt, params.sharesOutstanding
    );

    const currentPrice = summary?.currentPrice || 0;
    const upsidePercent = currentPrice > 0
      ? ((dcf.fairValue - currentPrice) / currentPrice) * 100
      : null;

    const mc = monteCarlo(
      params.fcf, params.projectionGrowth, params.wacc,
      params.cash, params.debt, params.sharesOutstanding, simulations, params.terminalGrowth
    );

    res.json({
      success: true,
      data: {
        ticker: req.ticker,
        params: {
          fcf: params.fcf,
          revenueGrowth: params.revenueGrowth,
          historicalFCFGrowth: params.historicalFCFGrowth,
          projectionGrowth: params.projectionGrowth,
          wacc: Math.round(params.wacc * 10000) / 10000,
          terminalGrowth: params.terminalGrowth,
          sharesOutstanding: params.sharesOutstanding,
          cash: params.cash,
          debt: params.debt,
          beta: params.beta,
          rf: params.rf,
          erp: params.erp,
          sector: params.sector,
          sectorWacc: params.sectorWacc != null ? Math.round(params.sectorWacc * 10000) / 10000 : null,
          sizePremium: params.sizePremium != null ? Math.round(params.sizePremium * 10000) / 10000 : null,
        },
        dcf: {
          fairValue: Math.round(dcf.fairValue * 100) / 100,
          upsidePercent: upsidePercent != null ? Math.round(upsidePercent * 100) / 100 : null,
          projectedFCFs: dcf.projectedFCFs.map(f => Math.round(f)),
          terminalValue: Math.round(dcf.terminalValue),
        },
        monteCarlo: {
          iterations: simulations,
          bear: Math.round(mc.bear * 100) / 100,
          base: Math.round(mc.base * 100) / 100,
          bull: Math.round(mc.bull * 100) / 100,
          histogram: mc.histogram.map(b => ({ bin: Math.round(b.bin * 100) / 100, count: b.count })),
        },
      },
    });
  } catch (err) {
    console.error(`[dcf] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// ─── Portfolio endpoints ──────────────────────────────────────────────────────

// POST /api/stocks/portfolio
// Body: { tickers: ["AAPL", "MSFT", "GOOG"] }
// Returns summary data for all tickers with per-ticker error handling
router.post("/portfolio", validate(tickersBodySchema), async (req, res) => {
  const { tickers } = req.body;

  try {
    const results = await yf.getPortfolioSummaries(tickers);
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

// POST /api/stocks/portfolio/live
// Body: { tickers: ["AAPL", "MSFT", "GOOG"] }
// Returns lightweight live price data (currentPrice, change, changePercent)
// Uses Schwab batch quotes as primary source, falls back to Yahoo Finance
router.post("/portfolio/live", validate(tickersBodySchema), async (req, res) => {
  const { tickers } = req.body;
  const symbols = tickers;

  // Check cache for each symbol first — only fetch missing/stale from Schwab
  const cachedResults = [];
  const missingSymbols = [];
  for (const symbol of symbols) {
    const cached = cache.getLivePrice(symbol);
    if (cached) {
      cachedResults.push({
        ticker: symbol,
        data: {
          currentPrice: cached.currentPrice ?? null,
          change: cached.change ?? null,
          changePercent: cached.changePercent ?? null,
        },
        stale: false,
      });
    } else {
      missingSymbols.push(symbol);
    }
  }

  // All symbols are cached — return immediately
  if (missingSymbols.length === 0) {
    return res.json({ success: true, data: cachedResults });
  }

  // Fetch missing symbols from Schwab
  try {
    const schwabQuotes = await getQuotes(missingSymbols);
    const schwabResults = missingSymbols.map((symbol) => {
      const entry = schwabQuotes[symbol];
      if (entry?.quote) {
        const { quote } = entry;
        const data = {
          currentPrice: quote.extended?.lastPrice ?? quote.lastPrice ?? null,
          change: quote.netChange ?? null,
          changePercent: quote.netPercentChangeInDouble ?? null,
        };
        cache.setLivePrice(symbol, data);
        return { ticker: symbol, data, stale: false };
      }
      return { ticker: symbol, data: null, stale: true };
    });
    return res.json({ success: true, data: [...cachedResults, ...schwabResults] });
  } catch (schwabErr) {
    // Fallback: Yahoo Finance for missing symbols only
    console.error("[portfolio/live] Schwab failed, falling back to Yahoo:", schwabErr.message);
    try {
      const yfResults = await yf.getLivePrices(missingSymbols);
      return res.json({ success: true, data: [...cachedResults, ...yfResults] });
    } catch (yfErr) {
      console.error("[portfolio/live] Yahoo also failed:", yfErr.message);
      // Return cached results, mark missing as stale
      const errorResults = missingSymbols.map(s => ({ ticker: s, data: null, stale: true }));
      return res.json({ success: true, data: [...cachedResults, ...errorResults] });
    }
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

    // 6. AAII Sentiment
    const aaiiSentimentPromise = aaii.getAAIISentiment().catch(err => {
      console.error("[market-indicators] AAII fetch failed:", err);
      return { error: err.message };
    });

    // 7. Fed Balance Sheet
    const fedBalanceSheetPromise = fred.getFedBalanceSheet(period);

    // 8. 10-Year Treasury Yield
    const treasuryYieldPromise = fred.getTreasuryYield(period);

    // 9. Yield Curve (10Y-2Y Spread)
    const yieldCurvePromise = fred.getYieldCurve(period);

    // 10. Consumer Sentiment
    const consumerSentimentPromise = fred.getConsumerSentiment(period);

    // 11. Unemployment Rate
    const unemploymentPromise = fred.getUnemployment(period);

    const [
      vixSummary, vixHistory, fedPolicy, creditSpreads, inflation, aaiiSentiment,
      fedBalanceSheet, treasuryYield, yieldCurve, consumerSentiment, unemployment,
    ] = await Promise.all([
      vixSummaryPromise,
      vixHistoryPromise,
      fedPolicyPromise,
      creditSpreadsPromise,
      inflationPromise,
      aaiiSentimentPromise,
      fedBalanceSheetPromise,
      treasuryYieldPromise,
      yieldCurvePromise,
      consumerSentimentPromise,
      unemploymentPromise,
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
        aaiiSentiment,
        fedBalanceSheet,
        treasuryYield,
        yieldCurve,
        consumerSentiment,
        unemployment,
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
router.post("/market/update-margin-debt", requireAuth, requireAdmin, async (req, res) => {
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
router.get("/cache/stats", requireAuth, requireAdmin, (req, res) => {
  res.json({ success: true, data: cache.stats() });
});

// DELETE /api/stocks/cache
router.delete("/cache", requireAuth, requireAdmin, (req, res) => {
  cache.flush();
  res.json({ success: true, message: "Cache cleared." });
});

// ─── Schwab API routes ────────────────────────────────────────────────────────

// GET /api/schwab/health — token status
router.get("/schwab/health", async (req, res) => {
  try {
    const health = await getTokenHealth();
    res.json(health);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/schwab/auth — initiate OAuth2 authorization flow
router.get("/schwab/auth", async (req, res) => {
  try {
    const { authUrl, promise } = startAuthFlow();
    // Run in background — don't block the response
    promise.catch((err) => console.error("[schwab/auth] Auth flow failed:", err.message));
    res.json({ authUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/schwab/quotes — batch quotes
router.post("/schwab/quotes", validate(schwabQuotesSchema), async (req, res) => {
  try {
    const { symbols, fields } = req.body;
    const quotes = await getQuotes(symbols, fields);
    res.json(quotes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/schwab/price-history/:symbol
router.get("/schwab/price-history/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const { periodType, period, frequencyType, frequency, startDate, endDate, needExtendedHoursData } = req.query;
    const history = await getPriceHistory(symbol, {
      periodType, period: period ? parseInt(period) : undefined,
      frequencyType, frequency: frequency ? parseInt(frequency) : undefined,
      startDate, endDate, needExtendedHoursData,
    });
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/schwab/option-chain/:symbol
router.get("/schwab/option-chain/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const options = await getOptionChain(symbol, req.query);
    res.json(options);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/schwab/movers/:index
router.get("/schwab/movers/:index", async (req, res) => {
  try {
    const { index } = req.params;
    const movers = await getMovers(index, req.query);
    res.json(movers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;