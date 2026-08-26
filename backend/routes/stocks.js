import express from "express";
import { z } from "zod";
import * as yf from "../services/yahoofinance.js";
import * as cache from "../services/cache.js";
import { earningsProfileCache } from "../services/cache.js";
import * as fred from "../services/fred.js";
import * as marginDebtService from "../services/marginDebt.js";
import * as sectorScore from "../services/sectorScore.js";
import * as aaii from "../services/aaii.js";
import * as insiderTrading from "../services/insiderTrading.js";
import * as comparables from "../services/comparables.js";
import * as earnings from "../services/earnings.js";
import * as newsService from "../services/newsService.js";
import * as secGuidance from "../services/secGuidance.js";
import { getQuotes, getPriceHistory, getOptionChain, getMovers } from "../services/schwab-client.js";
import { getTokenHealth } from "../services/schwab-auth.js";
import { startAuthFlow, exchangeManualCode, resetAuthFlow } from "../services/schwab-callback-server.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import NodeCache from "node-cache";
import rateLimit from "express-rate-limit";
import {
  MAX_PORTFOLIO_TICKERS,
  MAX_WISHLIST_TICKERS,
  VALID_PERIODS,
  TICKER_REGEX,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_DCF_MAX,
  CACHE_TTL_INSIDER_EMPTY,
} from "../constants.js";
import {
  DEFAULT_RISK_FREE_RATE,
  projectValuation,
  monteCarlo,
  buildSensitivity,
  aggregateDCFInputs,
  getCompanyModelType,
} from "../services/dcf.js";
import { evaluateAIValuation } from "../services/aiValuation.js";
import { streamAdviserChat, getSessionHistory } from "../services/aiFinancialAdviser.js";
import { getFinancialResidualIncome } from "../services/financialResidualIncome.js";

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
  simulations: z.coerce.number().int().min(100).max(5000).optional().default(1000),
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

// ─── Rate limiters ────────────────────────────────────────────────────

const dcfRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_DCF_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ success: false, error: "DCF rate limit reached. Max 5 requests per minute." });
  },
});

function normalizeTreasuryYield(value) {
  const percentagePoints = Number(value);
  if (!Number.isFinite(percentagePoints) || percentagePoints < 0 || percentagePoints > 20) return null;
  return percentagePoints / 100;
}

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
    const data = await cache.getOrFetch(
      cache.getFundamentals,
      cache.setFundamentals,
      `fundamentals-${req.ticker}`,
      () => yf.getSummary(req.ticker)
    );
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
    const data = await cache.getOrFetch(
      cache.getFundamentals,
      cache.setFundamentals,
      `financials_v3:${req.ticker}`,
      () => yf.getFinancials(req.ticker)
    );
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
    const data = await cache.getOrFetch(
      cache.getFundamentals,
      cache.setFundamentals,
      `balance_v2:${req.ticker}`,
      () => yf.getBalanceSheet(req.ticker)
    );
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
    const data = await cache.getOrFetch(
      cache.getPrice,
      cache.setPrice,
      `priceHistory:${req.ticker}:${period}`,
      () => yf.getPriceHistory(req.ticker, period)
    );
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
      cache.getOrFetch(
        cache.getFundamentals,
        cache.setFundamentals,
        `fundamentals-${req.ticker}`,
        () => yf.getSummary(req.ticker)
      ),
      cache.getOrFetch(
        cache.getFundamentals,
        cache.setFundamentals,
        `financials_v3:${req.ticker}`,
        () => yf.getFinancials(req.ticker)
      ),
      cache.getOrFetch(
        cache.getFundamentals,
        cache.setFundamentals,
        `balance_v2:${req.ticker}`,
        () => yf.getBalanceSheet(req.ticker)
      ),
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
    const data = await cache.getOrFetch(
      cache.getComparables,
      cache.setComparables,
      `comparables:${req.ticker}`,
      () => comparables.getComparables(req.ticker)
    );
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[comparables] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/earnings
// Returns earnings surprises, estimates, peer comparisons (No AI)
router.get("/:ticker/earnings", async (req, res) => {
  try {
    const data = await cache.getOrFetch(
      cache.getComparables,
      cache.setComparables,
      `earnings-insights:${req.ticker}`,
      () => earnings.getEarningsInsights(req.ticker)
    );
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[earnings] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/earnings-sentiment
// Returns deep forensic AI sentiment analysis
router.get("/:ticker/earnings-sentiment", async (req, res) => {
  try {
    const data = await cache.getOrFetch(
      cache.getComparables,
      cache.setComparables,
      `earnings-sentiment:${req.ticker}`,
      () => earnings.getEarningsSentiment(req.ticker)
    );
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[earnings-sentiment] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/sec-guidance
// Returns parsed 8-K filing guidance (Items 2.02, 7.01, forward-looking statements)
router.get("/:ticker/sec-guidance", async (req, res) => {
  try {
    const data = await secGuidance.getSecGuidance(req.ticker);
    res.json({ success: true, data });
  } catch (err) {
    console.error(`[sec-guidance] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/news
// Returns news articles (no AI summary — use /news/summary for that)
router.get("/:ticker/news", async (req, res) => {
  try {
    const articles = await newsService.getStockNews(req.ticker);
    res.json({ success: true, data: { articles } });
  } catch (err) {
    console.error(`[news] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/news/summary
// Returns AI-generated summary and sentiment for the ticker's news
router.get("/:ticker/news/summary", async (req, res) => {
  try {
    const articles = await newsService.getStockNews(req.ticker);
    const aiSummary = await newsService.getNewsAISummary(req.ticker, articles);
    res.json({ success: true, data: { sentiment: aiSummary.sentiment, summary: aiSummary.summary } });
  } catch (err) {
    console.error(`[news-summary] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/dcf?simulations=1000
router.get("/:ticker/dcf", dcfRateLimiter, validate(dcfQuerySchema, "query"), async (req, res) => {
  const { simulations } = req.query;
  try {
    const [summary, financials, balanceSheet] = await Promise.all([
      yf.getSummary(req.ticker),
      yf.getFinancials(req.ticker),
      yf.getBalanceSheet(req.ticker),
    ]);

    const annualIncome = financials?.annualIncome || [];
    const annualCashFlow = balanceSheet?.annualCashFlow || [];

    // Financial companies use the SEC-backed residual-income adapter; never run FCFF for them.
    if (getCompanyModelType(summary) !== "corporate-fcff") {
      let treasury;
      try {
        treasury = await fred.getTreasuryYield("1mo");
      } catch (error) {
        console.error(`[dcf] FRED unavailable for financial ${req.ticker}:`, error.message);
        throw new Error(`FRED unavailable: ${error.message}`);
      }
      const riskFreeRate = normalizeTreasuryYield(treasury?.currentValue);
      const beta = Number(summary?.beta);
      const rim = await getFinancialResidualIncome(req.ticker, {
        summary,
        riskFreeRate,
        beta,
        valuationAsOf: new Date().toISOString(),
      });
      const params = {
        modelType: "financial-residual-income",
        eligible: rim.eligible === true,
        status: rim.status || (rim.eligible ? "valued" : "unvalued"),
        cohort: "bank-insurer",
        financialSubtype: rim.financialSubtype || null,
        reasonCodes: rim.reasonCodes || [],
        cohortReasons: rim.reasonCodes || [],
        riskFreeRate,
        riskFreeRateSource: riskFreeRate == null ? null : "fred:DGS10",
        beta: Number.isFinite(beta) ? beta : null,
        costOfEquity: rim.costOfEquity?.value ?? null,
        diagnostics: rim.reasonCodes || [],
      };
      return res.json({
        success: true,
        data: {
          ticker: req.ticker,
          params,
          dcf: null,
          monteCarlo: null,
          sensitivity: null,
          rim,
          warning: params.diagnostics?.[0] || null,
        },
      });
    }

    const treasury = await fred.getTreasuryYield("1mo").catch((error) => {
      console.warn(`[dcf] Treasury yield unavailable for ${req.ticker}:`, error.message);
      return null;
    });
    const liveRiskFreeRate = normalizeTreasuryYield(treasury?.currentValue);
    const riskFreeRate = liveRiskFreeRate ?? DEFAULT_RISK_FREE_RATE;
    const riskFreeRateSource = liveRiskFreeRate == null ? "fallback-static" : "fred:DGS10";
    const params = aggregateDCFInputs(
      summary,
      financials,
      balanceSheet,
      annualIncome,
      annualCashFlow,
      { riskFreeRate, riskFreeRateSource },
    );

    if (!params.eligible) {
      return res.json({
        success: true,
        data: {
          ticker: req.ticker,
          params,
          dcf: null,
          monteCarlo: null,
          sensitivity: null,
          warning: params.cohortReasons?.join(", ") || "DCF analysis unavailable — inputs are not eligible.",
        },
      });
    }

    const dcf = projectValuation(params);

    const currentPrice = summary?.currentPrice || 0;
    const upsidePercent = currentPrice > 0
      ? ((dcf.fairValue - currentPrice) / currentPrice) * 100
      : null;

    const mc = params.projectionMethod === "driver-fcff"
      ? monteCarlo(params, simulations)
      : monteCarlo(params.fcf, params.projectionGrowth, params.wacc, params.cash, params.debt, params.sharesOutstanding, simulations, params.terminalGrowth, params.projectionYears);
    const terminalValueShare = dcf.enterpriseValue > 0
      ? dcf.pvTerminalValue / dcf.enterpriseValue
      : null;
    const diagnostics = [...(params.diagnostics || [])];
    if (terminalValueShare != null && terminalValueShare > 0.75) {
      diagnostics.push("terminal-value-concentration");
    }
    const sensitivity = params.projectionMethod === "driver-fcff"
      ? buildSensitivity(params)
      : buildSensitivity(params.fcf, params.projectionGrowth, params.wacc, params.terminalGrowth, params.cash, params.debt, params.sharesOutstanding, params.projectionYears);
    const serializedSensitivity = {
      ...sensitivity,
      values: sensitivity.values.map((row) => row.map((value) =>
        value == null ? null : Math.round(value * 100) / 100
      )),
    };

    res.json({
      success: true,
      data: {
        ticker: req.ticker,
        params: {
          fcf: params.fcf,
          modelType: params.modelType,
          eligible: params.eligible,
          cohort: params.cohort,
          cohortReasons: params.cohortReasons,
          cashFlowType: params.cashFlowType,
          cashFlowSource: params.cashFlowSource,
          revenueGrowth: params.revenueGrowth,
          historicalFCFGrowth: params.historicalFCFGrowth,
          projectionGrowth: params.projectionGrowth,
          projectionYears: params.projectionYears,
          projectionMethod: params.projectionMethod,
          drivers: params.drivers,
          wacc: Math.round(params.wacc * 10000) / 10000,
          terminalGrowth: params.terminalGrowth,
          terminalGrowthSource: params.terminalGrowthSource,
          sharesOutstanding: params.sharesOutstanding,
          cash: params.cash,
          debt: params.debt,
          beta: params.beta,
          rf: params.rf,
          riskFreeRate: params.riskFreeRate,
          riskFreeRateSource: params.riskFreeRateSource,
          erp: params.erp,
          marketRiskPremium: params.marketRiskPremium,
          marketRiskPremiumSource: params.marketRiskPremiumSource,
          sector: params.sector,
          industry: params.industry,
          diagnostics,
          sectorWacc: params.sectorWacc != null ? Math.round(params.sectorWacc * 10000) / 10000 : null,
          sizePremium: params.sizePremium != null ? Math.round(params.sizePremium * 10000) / 10000 : null,
        },
        dcf: {
          fairValue: Math.round(dcf.fairValue * 100) / 100,
          upsidePercent: upsidePercent != null ? Math.round(upsidePercent * 100) / 100 : null,
          projectedFCFs: dcf.projectedFCFs.map(f => Math.round(f)),
          terminalValue: Math.round(dcf.terminalValue),
          pvExplicitCashFlows: Math.round(dcf.pvExplicitCashFlows),
          pvTerminalValue: Math.round(dcf.pvTerminalValue),
          terminalValueShare: terminalValueShare == null
            ? null
            : Math.round(terminalValueShare * 10000) / 10000,
        },
        monteCarlo: {
          requestedIterations: mc.requestedIterations,
          iterations: mc.iterations,
          bear: mc.bear == null ? null : Math.round(mc.bear * 100) / 100,
          base: mc.base == null ? null : Math.round(mc.base * 100) / 100,
          bull: mc.bull == null ? null : Math.round(mc.bull * 100) / 100,
          histogram: mc.histogram.map(b => ({ bin: Math.round(b.bin * 100) / 100, count: b.count })),
          ...(mc.warning ? { warning: mc.warning } : {}),
        },
        sensitivity: serializedSensitivity,
        rim: null,
      },
    });
  } catch (err) {
    console.error(`[dcf] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/ai-valuation
// Returns AI debate, quant checks, DDM, and RIM valuations
router.get("/:ticker/ai-valuation", async (req, res) => {
  try {
    const [summary, financials, balanceSheet, priceHistory, optionChain, insiderData] = await Promise.all([
      yf.getSummary(req.ticker).catch(() => null),
      yf.getFinancials(req.ticker).catch(() => null),
      yf.getBalanceSheet(req.ticker).catch(() => null),
      yf.getPriceHistory(req.ticker, "1y").catch(() => null),
      getOptionChain(req.ticker, {}).catch(() => null),
      insiderTrading.getInsiderTrading(req.ticker).catch(() => null)
    ]);

    const valuationResult = evaluateAIValuation({
      ticker: req.ticker,
      summary,
      financials,
      balanceSheet,
      priceHistory,
      optionChain,
      insiderData
    });

    res.json({ success: true, data: valuationResult });
  } catch (err) {
    console.error(`[ai-valuation] ${req.ticker}:`, err.message);
    res.status(502).json({ success: false, error: err.message, ticker: req.ticker });
  }
});

// GET /api/stocks/:ticker/advisor-chat/sessions
router.get("/:ticker/advisor-chat/sessions", async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const { getSessionsList } = await import("../services/aiFinancialAdviser.js");
    const sessions = await getSessionsList(userId, req.ticker);
    res.json({ success: true, data: sessions });
  } catch (err) {
    console.error(`[advisor-chat-sessions] error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stocks/:ticker/advisor-chat/session
router.get("/:ticker/advisor-chat/session", async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    const userId = req.user?.id || null;
    
    const { sessionId: currentSessionId, messages } = await getSessionHistory(sessionId, userId, req.ticker);
    res.json({ success: true, data: { sessionId: currentSessionId, history: messages } });
  } catch (err) {
    console.error(`[advisor-chat-session] error:`, err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/stocks/:ticker/advisor-chat
router.post("/:ticker/advisor-chat", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const { message, sessionId } = req.body;
    const userId = req.user?.id || null;

    const [summary, financials, balanceSheet, priceHistory, optionChain, insiderData] = await Promise.all([
      yf.getSummary(req.ticker).catch(() => null),
      yf.getFinancials(req.ticker).catch(() => null),
      yf.getBalanceSheet(req.ticker).catch(() => null),
      yf.getPriceHistory(req.ticker, "1y").catch(() => null),
      getOptionChain(req.ticker, {}).catch(() => null),
      insiderTrading.getInsiderTrading(req.ticker).catch(() => null)
    ]);

    const quantData = {
      summary, financials, balanceSheet,
      priceHistory: priceHistory ? priceHistory.slice(-20) : [],
      optionChain: optionChain ? { hasOptions: true } : { hasOptions: false },
      insiderData
    };

    for await (const chunk of streamAdviserChat(sessionId, userId, req.ticker, message, quantData)) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      if (res.flush) res.flush();
    }
  } catch (err) {
    console.error(`[advisor-chat] error:`, err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    if (res.flush) res.flush();
  } finally {
    res.write(`data: [DONE]\n\n`);
    if (res.flush) res.flush();
    res.end();
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
        const currentPrice = quote.extended?.lastPrice ?? quote.lastPrice ?? null;
        let change = quote.netChange ?? null;
        let changePercent = quote.netPercentChangeInDouble != null ? quote.netPercentChangeInDouble / 100 : null;

        if (currentPrice != null && quote.closePrice != null && quote.closePrice > 0) {
          change = currentPrice - quote.closePrice;
          changePercent = change / quote.closePrice;
        }

        const data = {
          currentPrice,
          change,
          changePercent,
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
    const aaiiSentimentPromise = aaii.getAAIISentiment(period).catch(err => {
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
    const cacheKey = "earnings-profile";
    const cached = earningsProfileCache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    // Fetch all ETF holdings in parallel
    const holdingsResults = await Promise.allSettled(
      sectorEtfs.map((etf) =>
        yf.getHoldings(etf.ticker).then((holdings) => ({ etf, holdings }))
      )
    );

    // Collect unique holding symbols and their ETF metadata
    const symbolSet = new Set();
    const symbolMeta = new Map();

    for (const result of holdingsResults) {
      if (result.status === "rejected") {
        console.error(`[earnings-profile] holdings fetch failed:`, result.reason?.message);
        continue;
      }
      const { etf, holdings } = result.value;
      for (const holding of holdings) {
        const sym = holding.symbol;
        symbolSet.add(sym);
        if (!symbolMeta.has(sym)) {
          symbolMeta.set(sym, {
            name: holding.name,
            sectorEtfTicker: etf.ticker,
            sectorEtfName: etf.name,
          });
        }
      }
    }

    const uniqueSymbols = [...symbolSet];

    // Fetch financials in parallel with a concurrency limit
    const CONCURRENCY = 5;
    const earningsProfile = [];

    for (let i = 0; i < uniqueSymbols.length; i += CONCURRENCY) {
      const chunk = uniqueSymbols.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((symbol) => yf.getFinancials(symbol))
      );

      for (let j = 0; j < chunk.length; j++) {
        const symbol = chunk[j];
        const result = results[j];
        if (result.status === "rejected") {
          console.error(`[earnings-profile] ${symbol}:`, result.reason?.message);
          continue;
        }
        const financials = result.value;
        const meta = symbolMeta.get(symbol);
        const latestSurprise = financials.epsSurprises?.[0];
        earningsProfile.push({
          ticker: symbol,
          name: meta?.name || symbol,
          sectorEtfTicker: meta?.sectorEtfTicker || null,
          sectorEtfName: meta?.sectorEtfName || null,
          epsActual: latestSurprise?.actual || null,
          epsEstimate: latestSurprise?.estimate || null,
          epsSurprisePercent: latestSurprise?.surprisePercent || null,
          revenue: financials.totalRevenue,
          revenueGrowth: financials.revenueGrowth,
          earningsGrowth: financials.earningsGrowth,
        });
      }
    }

    earningsProfileCache.set(cacheKey, earningsProfile);
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

// POST /api/schwab/exchange — manual callback URL or authorization code exchange
router.post("/schwab/exchange", async (req, res) => {
  try {
    const { url, code } = req.body || {};
    const input = code || url;
    if (!input || typeof input !== "string") {
      return res.status(400).json({ error: "Missing 'url' or 'code' parameter in request body" });
    }
    const tokens = await exchangeManualCode(input.trim());
    const health = await getTokenHealth();
    res.json({ success: true, message: "Schwab authorization successful", health });
  } catch (e) {
    console.error("[schwab/exchange] Exchange failed:", e.message);
    res.status(400).json({ error: e.message });
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
