import * as yfModule from "yahoo-finance2";
import * as cache from "./cache.js";
const yahooFinance = new yfModule.default();
// Small delay between calls to be polite to Yahoo's servers
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch summary + valuation data for a ticker.
 * Covers: price, market cap, P/E, forward P/E, EV/EBITDA, 52wk range
 */
async function getSummary(ticker) {
  const cacheKey = `summary:${ticker}`;
  const cached = cache.getFundamentals(cacheKey);
  if (cached) return cached;

  const result = await yahooFinance.quoteSummary(ticker, {
    modules: ["price", "summaryDetail", "defaultKeyStatistics"],
  });

  const { price, summaryDetail, defaultKeyStatistics } = result;

  const data = {
    ticker: ticker.toUpperCase(),
    name: price.longName || price.shortName,
    currentPrice: price.regularMarketPrice,
    change: price.regularMarketChange,
    changePercent: price.regularMarketChangePercent,
    marketCap: price.marketCap,
    currency: price.currency,

    // Valuation
    trailingPE: summaryDetail.trailingPE,
    forwardPE: summaryDetail.forwardPE,
    priceToBook: defaultKeyStatistics.priceToBook,
    enterpriseToEbitda: defaultKeyStatistics.enterpriseToEbitda,
    pegRatio: defaultKeyStatistics.pegRatio,

    // Range
    fiftyTwoWeekLow: summaryDetail.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: summaryDetail.fiftyTwoWeekHigh,
    fiftyDayAverage: price.fiftyDayAverage,
    twoHundredDayAverage: price.twoHundredDayAverage,

    // Volume
    volume: price.regularMarketVolume,
    avgVolume: summaryDetail.averageVolume,
  };

  cache.setFundamentals(cacheKey, data);
  return data;
}

/**
 * Fetch profitability + growth data.
 * Covers: gross/net/operating margins, ROE, ROA, revenue, EPS (TTM + historical)
 */
async function getFinancials(ticker) {
  const cacheKey = `financials:${ticker}`;
  const cached = cache.getFundamentals(cacheKey);
  if (cached) return cached;

  const result = await yahooFinance.quoteSummary(ticker, {
    modules: [
      "financialData",
      "incomeStatementHistory",
      "earningsHistory",
      "earningsTrend",
    ],
  });

  const { financialData, incomeStatementHistory, earningsHistory, earningsTrend } = result;

  // Annual income statements — last 4 years
  const annualIncome = (incomeStatementHistory.incomeStatementHistory || []).map((s) => ({
    date: s.endDate,
    totalRevenue: s.totalRevenue,
    grossProfit: s.grossProfit,
    operatingIncome: s.operatingIncome || s.totalOperatingExpenses,
    netIncome: s.netIncome,
    eps: s.dilutedEPS,
    grossMargin: s.grossProfit && s.totalRevenue ? s.grossProfit / s.totalRevenue : null,
    netMargin: s.netIncome && s.totalRevenue ? s.netIncome / s.totalRevenue : null,
  }));

  // EPS surprises — last 4 quarters
  const epsSurprises = (earningsHistory.history || []).map((q) => ({
    date: q.quarter,
    actual: q.epsActual,
    estimate: q.epsEstimate,
    surprisePercent: q.surprisePercent,
  }));

  // Forward EPS estimates
  const trend = earningsTrend?.trend || [];
  const nextQuarterEstimate = trend.find((t) => t.period === "+1q");
  const currentYearEstimate = trend.find((t) => t.period === "0y");
  const nextYearEstimate = trend.find((t) => t.period === "+1y");

  const data = {
    ticker: ticker.toUpperCase(),

    // TTM margins & returns (from financialData)
    grossMargins: financialData.grossMargins,
    operatingMargins: financialData.operatingMargins,
    profitMargins: financialData.profitMargins,
    returnOnEquity: financialData.returnOnEquity,
    returnOnAssets: financialData.returnOnAssets,

    // Growth (TTM)
    revenueGrowth: financialData.revenueGrowth,
    earningsGrowth: financialData.earningsGrowth,

    // Revenue & earnings per share (current)
    totalRevenue: financialData.totalRevenue,
    revenuePerShare: financialData.revenuePerShare,
    earningsPerShare: financialData.earningsPerShare || null,

    // Historical annual data for charts
    annualIncome,

    // EPS beat/miss history
    epsSurprises,

    // Forward estimates
    estimates: {
      nextQuarter: nextQuarterEstimate?.earningsEstimate?.avg ?? null,
      currentYear: currentYearEstimate?.earningsEstimate?.avg ?? null,
      nextYear: nextYearEstimate?.earningsEstimate?.avg ?? null,
    },
  };

  cache.setFundamentals(cacheKey, data);
  return data;
}

/**
 * Fetch balance sheet data.
 * Covers: total debt, cash, D/E ratio, current ratio, free cash flow
 */
async function getBalanceSheet(ticker) {
  const cacheKey = `balance:${ticker}`;
  const cached = cache.getFundamentals(cacheKey);
  if (cached) return cached;

  const result = await yahooFinance.quoteSummary(ticker, {
    modules: ["financialData", "balanceSheetHistory"],
  });

  const { financialData, balanceSheetHistory } = result;

  // Annual balance sheets — last 4 years
  const annualBalanceSheet = (balanceSheetHistory.balanceSheetStatements || []).map((s) => ({
    date: s.endDate,
    totalAssets: s.totalAssets,
    totalLiabilities: s.totalLiab,
    totalEquity: s.totalStockholderEquity,
    cash: s.cash,
    shortTermDebt: s.shortLongTermDebt,
    longTermDebt: s.longTermDebt,
    totalDebt: (s.shortLongTermDebt || 0) + (s.longTermDebt || 0),
    currentAssets: s.totalCurrentAssets,
    currentLiabilities: s.totalCurrentLiabilities,
    currentRatio:
      s.totalCurrentAssets && s.totalCurrentLiabilities
        ? s.totalCurrentAssets / s.totalCurrentLiabilities
        : null,
  }));

  // Annual cash flows — last 4 years using fundamentalsTimeSeries
  const periodStart = new Date();
  periodStart.setFullYear(periodStart.getFullYear() - 5);
  periodStart.setMonth(0, 1);
  const cashflowSeries = await yahooFinance.fundamentalsTimeSeries(ticker, {
    period1: periodStart.toISOString().split("T")[0],
    type: "annual",
    module: "cash-flow",
  });

  const annualCashFlow = (cashflowSeries || [])
    .filter((s) => s.operatingCashFlow != null || s.freeCashFlow != null || s.cashFlowFromContinuingOperatingActivities != null)
    .map((s) => ({
      date: s.date,
      operatingCashFlow:
        s.operatingCashFlow ?? s.cashFlowFromContinuingOperatingActivities ?? null,
      capitalExpenditures: s.capitalExpenditure ?? s.purchaseOfPPE ?? null,
      freeCashFlow: s.freeCashFlow ?? null,
    }));

  const data = {
    ticker: ticker.toUpperCase(),

    // Current snapshot (from financialData)
    totalCash: financialData.totalCash,
    totalDebt: financialData.totalDebt,
    debtToEquity: financialData.debtToEquity,
    currentRatio: financialData.currentRatio,
    quickRatio: financialData.quickRatio,
    freeCashflow: financialData.freeCashflow,
    operatingCashflow: financialData.operatingCashflow,

    // Historical for charts
    annualBalanceSheet,
    annualCashFlow,
  };

  cache.setFundamentals(cacheKey, data);
  return data;
}

/**
 * Fetch OHLCV price history for charting.
 * @param {string} ticker
 * @param {string} period - '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y'
 */
async function getPriceHistory(ticker, period = "1y") {
  const cacheKey = `price:${ticker}:${period}`;
  const cached = cache.getPrice(cacheKey);
  if (cached) return cached;

  const chartData = await yahooFinance.chart(ticker, {
    period1: getPeriodStart(period),
    interval: period === "1mo" || period === "3mo" ? "1d" : "1wk",
  });

  const result = (chartData.quotes || []).map((d) => ({
    date: d.date.toISOString().split("T")[0],
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volume,
  }));

  cache.setPrice(cacheKey, result);
  return result;
}

/**
 * Batch fetch summaries for a portfolio of tickers.
 * Adds a small delay between calls to avoid rate limiting.
 */
async function getPortfolioSummaries(tickers) {
  const results = [];
  for (const ticker of tickers) {
    try {
      const summary = await getSummary(ticker);
      results.push({ ticker, data: summary, error: null });
    } catch (err) {
      results.push({ ticker, data: null, error: err.message });
    }
    await delay(150); // 150ms between calls
  }
  return results;
}

function getPeriodStart(period) {
  const now = new Date();
  switch (period) {
    case "1mo":
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case "3mo":
      return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
    case "6mo":
      return new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
    case "1y":
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    case "2y":
      return new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
    case "5y":
      return new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
    default:
      return new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  }
}

export {
  getSummary,
  getFinancials,
  getBalanceSheet,
  getPriceHistory,
  getPortfolioSummaries,
};