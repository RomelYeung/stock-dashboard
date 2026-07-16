import * as yfModule from "yahoo-finance2";
import * as cache from "./cache.js";
import { getNextEarningsDate as getFinnhubNextEarningsDate } from "./earningsCalendar.js";
const yahooFinance = new yfModule.default();
let pendingFetches = {}; // deduplicate in-flight requests per ticker

/**
 * Resolve the next *upcoming* earnings date from Yahoo's `earningsDate` field.
 *
 * Yahoo's `calendarEvents.earnings.earningsDate` is frequently stale for some
 * tickers — it keeps showing the last *reported* quarter even after that date
 * has passed (e.g. FICO showing 2026-04-28 well into July). Displaying a past
 * date as the "next earnings date" is misleading, so when the value is in the
 * past we project forward one quarter (~91 days) at a time until it lands in
 * the future. This assumes the typical quarterly reporting cadence.
 *
 * Returns an ISO string (or null when no date is available).
 */
function resolveNextEarningsDate(rawDate) {
  if (!rawDate) return null;
  const date = new Date(rawDate);
  if (isNaN(date.getTime())) return null;

  const now = Date.now();
  // Already in the future (or today) — use as-is.
  if (date.getTime() >= now) return date.toISOString();

  // Stale/past date: step forward by one quarter until upcoming.
  const QUARTER_MS = 91 * 24 * 60 * 60 * 1000;
  let projected = date.getTime();
  // Guard against pathological loops (max ~8 quarters).
  for (let i = 0; i < 8 && projected < now; i++) {
    projected += QUARTER_MS;
  }
  return new Date(projected).toISOString();
}

/**
 * Fetch summary + valuation data for a ticker.
 * Covers: price, market cap, P/E, forward P/E, EV/EBITDA, 52wk range
 */
/**
 * Fetch fundamentals time series data (quarterly) for sparklines.
 * Uses fundamentalsTimeSeries API since quoteSummary financial statements are broken.
 */
async function getFundamentalsTimeSeries(ticker) {
  const cacheKey = `fund-ts:${ticker}`;
  const cached = cache.getFundamentals(cacheKey);
  if (cached) return cached;

  const [financials, cashflow] = await Promise.all([
    yahooFinance.fundamentalsTimeSeries(ticker, {
      period1: '2020-01-01',
      period2: new Date().toISOString(),
      type: 'quarterly',
      module: 'financials',
    }, { validateResult: false }).catch(() => []),
    yahooFinance.fundamentalsTimeSeries(ticker, {
      period1: '2020-01-01',
      period2: new Date().toISOString(),
      type: 'quarterly',
      module: 'cash-flow',
    }, { validateResult: false }).catch(() => []),
  ]);

  const data = { financials, cashflow };
  cache.setFundamentals(cacheKey, data);
  return data;
}

async function getSummary(ticker) {
  const cacheKey = `summary:v2:${ticker}`;
  const cached = cache.getFundamentals(cacheKey);
  console.error(`[DBG top ${ticker}] cached=${!!cached} ed=${cached ? cached.earningsDate : "n/a"}`);

  // Helper to fetch/extract fresh price details
  const getFreshPrice = async () => {
    // 1. Try to get from live price cache first (5s TTL)
    const cachedLive = cache.getLivePrice(ticker);
    if (cachedLive) {
      return cachedLive;
    }
    // 2. Fetch fresh quote from Yahoo Finance
    const quote = await yahooFinance.quote(ticker, {}, { validateResult: false });
    if (quote) {
      const currentPrice = quote.postMarketPrice ?? quote.preMarketPrice ?? quote.regularMarketPrice ?? null;
      const previousClose = quote.regularMarketPreviousClose ?? null;
      let change = quote.regularMarketChange ?? null;
      let changePercent = quote.regularMarketChangePercent != null ? quote.regularMarketChangePercent / 100 : null;

      if (currentPrice != null && previousClose != null && previousClose > 0) {
        change = currentPrice - previousClose;
        changePercent = change / previousClose;
      }

      const priceData = { currentPrice, change, changePercent };
      // Cache it in live price cache (5s TTL)
      cache.setLivePrice(ticker, priceData);
      return priceData;
    }
    return null;
  };

  if (cached) {
    // Merge fresh price into cached fundamentals if available
    try {
      const freshPrice = await getFreshPrice();
      if (freshPrice) {
        return {
          ...cached,
          currentPrice: freshPrice.currentPrice,
          change: freshPrice.change,
          changePercent: freshPrice.changePercent,
        };
      }
    } catch (err) {
      console.error(`[getSummary] Failed to fetch fresh price for cached ticker ${ticker}:`, err.message);
    }
    return cached;
  }

  const result = await yahooFinance.quoteSummary(ticker, {
    modules: ["price", "summaryDetail", "defaultKeyStatistics", "calendarEvents", "assetProfile"],
  }, { validateResult: false });

  const {
    price = {},
    summaryDetail = {},
    defaultKeyStatistics = {},
    calendarEvents = {},
    assetProfile = {}
  } = result || {};
  const currentPrice = price.postMarketPrice ?? price.preMarketPrice ?? price.regularMarketPrice ?? null;
  const previousClose = price.regularMarketPreviousClose ?? null;
  let change = price.regularMarketChange ?? null;
  let changePercent = price.regularMarketChangePercent != null ? price.regularMarketChangePercent / 100 : null;

  if (currentPrice != null && previousClose != null && previousClose > 0) {
    change = currentPrice - previousClose;
    changePercent = change / previousClose;
  }

  // Earnings date — prefer Finnhub's authoritative calendar; fall back to
  // Yahoo (with quarter projection for stale past dates) when Finnhub has no
  // entry for this ticker.
  const finnhubDate = await getFinnhubNextEarningsDate(ticker).catch(() => null);
  const earningsDate =
    finnhubDate && new Date(finnhubDate).getTime() >= Date.now()
      ? finnhubDate
      : resolveNextEarningsDate(calendarEvents?.earnings?.earningsDate?.[0]);

  const data = {
    ticker: ticker.toUpperCase(),
    name: price.longName || price.shortName,
    currentPrice,
    change,
    changePercent,
    marketCap: price.marketCap,
    currency: price.currency,

    // Valuation
    trailingPE: summaryDetail.trailingPE,
    forwardPE: summaryDetail.forwardPE,
    priceToBook: defaultKeyStatistics.priceToBook,
    enterpriseToEbitda: defaultKeyStatistics.enterpriseToEbitda,
    pegRatio: defaultKeyStatistics.pegRatio,
    netAssets: defaultKeyStatistics?.totalAssets,
    beta: defaultKeyStatistics?.beta,

    // Range
    fiftyTwoWeekLow: summaryDetail.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: summaryDetail.fiftyTwoWeekHigh,
    fiftyDayAverage: price.fiftyDayAverage,
    twoHundredDayAverage: price.twoHundredDayAverage,

    // Volume
    volume: price.regularMarketVolume,
    avgVolume: summaryDetail.averageVolume,

    // Earnings date (resolved above: Finnhub primary, Yahoo+projection fallback)
    earningsDate,

    // Sector / Industry
    sector: assetProfile?.sector || null,
    industry: assetProfile?.industry || null,
  };

  cache.setFundamentals(cacheKey, data);
  // Also store the price data we just fetched in the livePriceCache so it's consistent
  cache.setLivePrice(ticker, { currentPrice, change, changePercent });
  return data;
}

/**
 * Fetch profitability + growth data.
 * Covers: gross/net/operating margins, ROE, ROA, revenue, EPS (TTM + historical)
 */
async function getFinancials(ticker) {
  const cacheKey = `financials_v2:${ticker}`;
  const cached = cache.getFundamentals(cacheKey);
  if (cached) return cached;

  const result = await yahooFinance.quoteSummary(ticker, {
    modules: [
      "financialData",
      "earningsHistory",
      "earningsTrend",
      "recommendationTrend",
      "upgradeDowngradeHistory"
    ],
  }, { validateResult: false });

  const {
    financialData = {},
    earningsHistory = {},
    earningsTrend = {},
    recommendationTrend = {},
    upgradeDowngradeHistory = {}
  } = result || {};

  // Annual income statements — last 4 years using fundamentalsTimeSeries
  const periodStart = new Date();
  periodStart.setFullYear(periodStart.getFullYear() - 5);
  periodStart.setMonth(0, 1);
  const incomeSeries = await yahooFinance.fundamentalsTimeSeries(ticker, {
    period1: periodStart.toISOString().split("T")[0],
    type: "annual",
    module: "financials",
  }, { validateResult: false }).catch(() => []);

  const annualIncome = (incomeSeries || []).map((s) => ({
    date: s.date,
    totalRevenue: s.totalRevenue || 0,
    grossProfit: s.grossProfit || 0,
    operatingIncome: s.operatingIncome || s.operatingExpense || 0,
    netIncome: s.netIncome || 0,
    eps: s.dilutedEPS || s.basicEPS || null,
    interestExpense: s.interestExpense || null,
    incomeTaxExpense: s.taxProvision || null,
    ebt: s.pretaxIncome || null,
    ebit: s.EBIT || s.operatingIncome || null,
    grossMargin: s.grossProfit && s.totalRevenue ? s.grossProfit / s.totalRevenue : null,
    netMargin: s.netIncome && s.totalRevenue ? s.netIncome / s.totalRevenue : null,
  }));

  // EPS surprises — last 4 quarters
  const epsSurprises = (earningsHistory?.history || []).map((q) => ({
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
      nextQuarter: nextQuarterEstimate ? {
        avg: nextQuarterEstimate.earningsEstimate?.avg ?? null,
        low: nextQuarterEstimate.earningsEstimate?.low ?? null,
        high: nextQuarterEstimate.earningsEstimate?.high ?? null,
        numberOfAnalysts: nextQuarterEstimate.earningsEstimate?.numberOfAnalysts ?? null,
        growth: nextQuarterEstimate.earningsEstimate?.growth ?? null,
        revisionUp: nextQuarterEstimate.epsRevisions?.upLast30days ?? null,
        revisionDown: nextQuarterEstimate.epsRevisions?.downLast30days ?? null,
      } : null,
      currentYear: currentYearEstimate ? {
        avg: currentYearEstimate.earningsEstimate?.avg ?? null,
        low: currentYearEstimate.earningsEstimate?.low ?? null,
        high: currentYearEstimate.earningsEstimate?.high ?? null,
        numberOfAnalysts: currentYearEstimate.earningsEstimate?.numberOfAnalysts ?? null,
        growth: currentYearEstimate.earningsEstimate?.growth ?? null,
        revisionUp: currentYearEstimate.epsRevisions?.upLast30days ?? null,
        revisionDown: currentYearEstimate.epsRevisions?.downLast30days ?? null,
      } : null,
      nextYear: nextYearEstimate ? {
        avg: nextYearEstimate.earningsEstimate?.avg ?? null,
        low: nextYearEstimate.earningsEstimate?.low ?? null,
        high: nextYearEstimate.earningsEstimate?.high ?? null,
        numberOfAnalysts: nextYearEstimate.earningsEstimate?.numberOfAnalysts ?? null,
        growth: nextYearEstimate.earningsEstimate?.growth ?? null,
        revisionUp: nextYearEstimate.epsRevisions?.upLast30days ?? null,
        revisionDown: nextYearEstimate.epsRevisions?.downLast30days ?? null,
      } : null,
    },
    recommendationTrend: recommendationTrend?.trend || [],
    upgradesDowngrades: upgradeDowngradeHistory?.history?.slice(0, 10) || [],
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
  }, { validateResult: false });

  const {
    financialData = {},
    balanceSheetHistory = {}
  } = result || {};

  // Annual balance sheets — last 4 years
  const annualBalanceSheet = (balanceSheetHistory?.balanceSheetStatements || []).map((s) => ({
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
  }, { validateResult: false });

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
    interval: period === "1mo" || period === "3mo" || period === "6mo" || period === "1y" ? "1d" : "1wk",
  }, { validateResult: false });

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

async function getOhlcv(ticker, period = "6mo") {
  const cacheKey = `ohlcv:${ticker}:${period}`;
  const cached = cache.getPrice(cacheKey);
  if (cached) return cached;

  const chartData = await yahooFinance.chart(ticker, {
    period1: getPeriodStart(period),
    interval: "1d",
  }, { validateResult: false });

  const result = (chartData.quotes || [])
    .filter((d) =>
      Number.isFinite(d.open) &&
      Number.isFinite(d.high) &&
      Number.isFinite(d.low) &&
      Number.isFinite(d.close) &&
      Number.isFinite(d.volume)
    )
    .map((d) => ({
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
 * Batch fetch summaries for a portfolio of tickers using a single quote call.
 * Fills in fields not available in quote() (enterpriseToEbitda, pegRatio, sector, industry)
 * from the summary cache or via targeted quoteSummary calls for uncached tickers.
 */
async function getPortfolioSummaries(tickers) {
  try {
    // Phase 1: Fast batch quote for price/market data
    const quotes = await yahooFinance.quote(tickers, {}, { validateResult: false });
    const quoteArray = Array.isArray(quotes) ? quotes : [quotes];

    // Phase 2: Resolve missing fields from cache or quoteSummary
    const quoteMap = new Map();
    for (const q of quoteArray) {
      quoteMap.set(q.symbol.toUpperCase(), q);
    }

    // Check cache first for each ticker (getSummary populates summary:${ticker})
    const cachedMissing = new Map();
    const uncachedTickers = [];

    for (const ticker of tickers) {
      const upper = ticker.toUpperCase();
      const cacheKey = `summary:v2:${upper}`;
      const cached = cache.getFundamentals(cacheKey);
      if (cached) {
        cachedMissing.set(upper, {
          enterpriseToEbitda: cached.enterpriseToEbitda ?? null,
          pegRatio: cached.pegRatio ?? null,
          sector: cached.sector ?? null,
          industry: cached.industry ?? null,
        });
      } else {
        uncachedTickers.push(ticker);
      }
    }

    // Phase 3: Fetch missing fields for uncached tickers in parallel
    const fetchedMissing = new Map();
    if (uncachedTickers.length > 0) {
      const results = await Promise.allSettled(
        uncachedTickers.map(async (ticker) => {
          const result = await yahooFinance.quoteSummary(ticker, {
            modules: ["defaultKeyStatistics", "assetProfile"],
          }, { validateResult: false });
          return {
            ticker: ticker.toUpperCase(),
            enterpriseToEbitda: result.defaultKeyStatistics?.enterpriseToEbitda ?? null,
            pegRatio: result.defaultKeyStatistics?.pegRatio ?? null,
            sector: result.assetProfile?.sector ?? null,
            industry: result.assetProfile?.industry ?? null,
          };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          fetchedMissing.set(r.value.ticker, r.value);
        }
      }
    }

    // Build final results
    return Promise.all(tickers.map(async (ticker) => {
      const upper = ticker.toUpperCase();
      const quote = quoteMap.get(upper);
      if (!quote) {
        return { ticker: upper, data: null, error: "No data" };
      }

      const missing = cachedMissing.get(upper) || fetchedMissing.get(upper) || {};

      const currentPrice = quote.postMarketPrice ?? quote.preMarketPrice ?? quote.regularMarketPrice ?? null;
      const previousClose = quote.regularMarketPreviousClose ?? null;
      let change = quote.regularMarketChange ?? null;
      let changePercent = quote.regularMarketChangePercent != null ? quote.regularMarketChangePercent / 100 : null;

      if (currentPrice != null && previousClose != null && previousClose > 0) {
        change = currentPrice - previousClose;
        changePercent = change / previousClose;
      }

      const finnhubDate = await getFinnhubNextEarningsDate(upper).catch(() => null);
      const earningsDate =
        finnhubDate && new Date(finnhubDate).getTime() >= Date.now()
          ? finnhubDate
          : resolveNextEarningsDate(quote.earningsTimestamp);

      return {
        ticker: upper,
        data: {
          ticker: upper,
          name: quote.shortName || quote.longName || null,
          currentPrice,
          change,
          changePercent,
          marketCap: quote.marketCap,
          currency: quote.currency,
          trailingPE: quote.trailingPE,
          forwardPE: quote.forwardPE,
          priceToBook: quote.priceToBook,
          enterpriseToEbitda: missing.enterpriseToEbitda ?? null,
          pegRatio: missing.pegRatio ?? null,
          netAssets: null,
          beta: quote.beta ?? null,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
          fiftyDayAverage: quote.fiftyDayAverage,
          twoHundredDayAverage: quote.twoHundredDayAverage,
          volume: quote.regularMarketVolume,
          avgVolume: quote.averageDailyVolume3Month || quote.averageDailyVolume10Day || null,
          earningsDate,
          sector: missing.sector ?? null,
          industry: missing.industry ?? null,
        },
        error: null,
      };
    }));
  } catch (err) {
    return tickers.map((ticker) => ({
      ticker: ticker.toUpperCase(),
      data: null,
      error: err.message,
    }));
  }
}

async function getLivePrices(tickers) {
  const results = [];
  const staleTickers = [];

  for (const ticker of tickers) {
    const cached = cache.getLivePrice(ticker);
    if (cached) {
      results.push({ ticker, data: cached, stale: false });
    } else {
      staleTickers.push(ticker);
      results.push({ ticker, data: null, stale: true });
    }
  }

  if (staleTickers.length > 0) {
    await refreshLivePrices(staleTickers);
  }

  return results;
}

async function refreshLivePrices(tickers) {
  const unique = tickers.filter((t) => !pendingFetches[t]);
  if (unique.length === 0) return;

  unique.forEach((t) => (pendingFetches[t] = true));

  try {
    const quotes = await yahooFinance.quote(unique, {}, { validateResult: false });
    const quoteArray = Array.isArray(quotes) ? quotes : [quotes];
    for (const quote of quoteArray) {
      const currentPrice = quote.postMarketPrice ?? quote.preMarketPrice ?? quote.regularMarketPrice ?? null;
      const previousClose = quote.regularMarketPreviousClose ?? null;
      let change = quote.regularMarketChange ?? null;
      let changePercent = quote.regularMarketChangePercent != null ? quote.regularMarketChangePercent / 100 : null;

      if (currentPrice != null && previousClose != null && previousClose > 0) {
        change = currentPrice - previousClose;
        changePercent = change / previousClose;
      }

      const data = {
        currentPrice,
        change,
        changePercent,
      };
      cache.setLivePrice(quote.symbol, data);
    }
  } catch (err) {
    console.error(`[live-price] batch fetch failed:`, err.message);
  } finally {
    unique.forEach((t) => delete pendingFetches[t]);
  }
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

async function getHoldings(ticker) {
  const cacheKey = `holdings:${ticker}`;
  const cached = cache.getFundamentals(cacheKey);
  if (cached) return cached;

  const result = await yahooFinance.quoteSummary(ticker, {
    modules: ["topHoldings"],
  }, { validateResult: false });

  const holdings = (result.holdings?.holdings || []).slice(0, 3).map(h => ({
    symbol: h.symbol,
    name: h.name,
  }));
  
  cache.setFundamentals(cacheKey, holdings);
  return holdings;
}

/**
 * Search for tickers by name or symbol.
 * @param {string} query - Search query
 * @param {object} [options] - Search options
 * @param {number} [options.quotesCount=8] - Max results
 * @returns {Promise<Array>} Matched quotes
 */
export async function searchTickers(query, options = {}) {
  const { quotesCount = 8 } = options;
  const results = await yahooFinance.search(query, { quotesCount }, { validateResult: false });
  return results.quotes || [];
}

/**
 * Fetch daily close prices for the past 1 year — used for volatility calculations.
 * Yahoo Finance chart data does not include historical implied volatility.
 * @param {string} ticker
 * @returns {Promise<{ date: string, close: number }[]>}
 */
async function getHistoricalDailyData(ticker) {
  const cacheKey = `vol-prices:${ticker}`;
  const cached = cache.getPrice(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const period1 = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

  const chartData = await yahooFinance.chart(ticker, {
    period1,
    interval: "1d",
  }, { validateResult: false });

  const result = (chartData.quotes || [])
    .filter((d) => Number.isFinite(d.close))
    .map((d) => ({
      date: d.date.toISOString().split("T")[0],
      close: d.close,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date)); // oldest first

  cache.setPrice(cacheKey, result);
  return result;
}

export {
  getSummary,
  getFinancials,
  getBalanceSheet,
  getFundamentalsTimeSeries,
  getPriceHistory,
  getOhlcv,
  getPortfolioSummaries,
  getHoldings,
  getLivePrices,
  getHistoricalDailyData,
};