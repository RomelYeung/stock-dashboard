import { getSummary, getFinancials, getBalanceSheet, getFundamentalsTimeSeries } from "./yahoofinance.js";
import * as cache from "./cache.js";

const METRIC_CATEGORIES = {
  valuation: {
    label: "Valuation",
    metrics: [
      { key: "trailingPE", label: "P/E", fmt: "x" },
      { key: "forwardPE", label: "Fwd P/E", fmt: "x" },
      { key: "enterpriseToEbitda", label: "EV/EBITDA", fmt: "x" },
      { key: "priceToBook", label: "P/B", fmt: "x" },
      { key: "pegRatio", label: "PEG", fmt: "x" },
    ],
  },
  growth: {
    label: "Growth",
    metrics: [
      { key: "revenueGrowth", label: "Rev Growth", fmt: "pct", hasSparkline: true },
      { key: "earningsGrowth", label: "Earnings Growth", fmt: "pct", hasSparkline: true },
    ],
  },
  profitability: {
    label: "Profitability",
    metrics: [
      { key: "returnOnEquity", label: "ROE", fmt: "pct", hasSparkline: true },
      { key: "returnOnAssets", label: "ROA", fmt: "pct", hasSparkline: true },
      { key: "grossMargins", label: "Gross Margin", fmt: "pct", hasSparkline: true },
      { key: "operatingMargins", label: "Operating Margin", fmt: "pct", hasSparkline: true },
      { key: "profitMargins", label: "Net Margin", fmt: "pct", hasSparkline: true },
    ],
  },
  health: {
    label: "Health",
    metrics: [
      { key: "debtToEquity", label: "Debt/Eq", fmt: "x", hasSparkline: true },
      { key: "currentRatio", label: "Current Ratio", fmt: "x", hasSparkline: true },
      { key: "freeCashflow", label: "FCF", fmt: "abbr", hasSparkline: true },
    ],
  },
};

const SECTOR_PEER_MAP = {
  Technology: ["MSFT", "GOOGL", "META", "NVDA", "AVGO", "ADBE"],
  "Communication Services": ["GOOGL", "META", "NFLX", "DIS", "VZ", "T"],
  "Consumer Cyclical": ["AMZN", "TSLA", "HD", "NKE", "MCD", "SBUX"],
  "Consumer Defensive": ["WMT", "PG", "KO", "PEP", "COST", "MDLZ"],
  Healthcare: ["JNJ", "UNH", "LLY", "PFE", "ABBV", "MRK"],
  "Financial Services": ["BRK-B", "JPM", "V", "MA", "BAC", "GS"],
  Industrials: ["GE", "CAT", "UNP", "UPS", "HON", "RTX"],
  Energy: ["XOM", "CVX", "COP", "EOG", "SLB", "MPC"],
  Utilities: ["NEE", "SO", "DUK", "AEP", "SRE", "EXC"],
  "Real Estate": ["AMT", "PLD", "CCI", "EQIX", "PSA", "O"],
  "Basic Materials": ["LIN", "APD", "SHW", "NEM", "FCX", "ECL"],
};

function findSectorPeers(sector, excludeTicker) {
  const peers = SECTOR_PEER_MAP[sector] || [];
  return peers.filter((p) => p !== excludeTicker).slice(0, 6);
}

function buildSparklines(fundTsData) {
  const quarterlyFinancials = fundTsData?.financials || [];
  const quarterlyCashFlow = fundTsData?.cashflow || [];

  const sparklines = {};

  // Sort by date ascending
  const finSorted = [...quarterlyFinancials].sort((a, b) => new Date(a.date) - new Date(b.date));
  const cfSorted = [...quarterlyCashFlow].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Revenue Growth (YoY from quarterly totals)
  const revGrowthVals = [];
  for (let i = 4; i < finSorted.length; i++) {
    const curr = finSorted[i].totalRevenue;
    const prev = finSorted[i - 4].totalRevenue;
    if (curr && prev && prev > 0) {
      revGrowthVals.push({
        year: new Date(finSorted[i].date).getFullYear(),
        value: ((curr - prev) / prev) * 100,
      });
    }
  }
  if (revGrowthVals.length > 0) sparklines.revenueGrowth = revGrowthVals;

  // Earnings Growth (YoY from quarterly net income)
  const earnGrowthVals = [];
  for (let i = 4; i < finSorted.length; i++) {
    const curr = finSorted[i].netIncome;
    const prev = finSorted[i - 4].netIncome;
    if (curr && prev && prev > 0) {
      earnGrowthVals.push({
        year: new Date(finSorted[i].date).getFullYear(),
        value: ((curr - prev) / prev) * 100,
      });
    }
  }
  if (earnGrowthVals.length > 0) sparklines.earningsGrowth = earnGrowthVals;

  // Margins from quarterly data
  const grossMarginVals = [];
  const opMarginVals = [];
  const netMarginVals = [];

  for (const q of finSorted) {
    const year = new Date(q.date).getFullYear();
    if (q.grossProfit != null && q.totalRevenue && q.totalRevenue > 0) {
      grossMarginVals.push({ year, value: (q.grossProfit / q.totalRevenue) * 100 });
    }
    if (q.operatingIncome != null && q.totalRevenue && q.totalRevenue > 0) {
      opMarginVals.push({ year, value: (q.operatingIncome / q.totalRevenue) * 100 });
    }
    if (q.netIncome != null && q.totalRevenue && q.totalRevenue > 0) {
      netMarginVals.push({ year, value: (q.netIncome / q.totalRevenue) * 100 });
    }
  }

  if (grossMarginVals.length > 0) sparklines.grossMargins = grossMarginVals;
  if (opMarginVals.length > 0) sparklines.operatingMargins = opMarginVals;
  if (netMarginVals.length > 0) sparklines.profitMargins = netMarginVals;

  // Free Cash Flow from quarterly cash flow data
  const fcfVals = [];
  for (const q of cfSorted) {
    if (q.freeCashFlow != null) {
      fcfVals.push({ year: new Date(q.date).getFullYear(), value: q.freeCashFlow });
    }
  }
  if (fcfVals.length > 0) sparklines.freeCashflow = fcfVals;

  return sparklines;
}

async function fetchPeerData(ticker) {
  try {
    const [summary, financials, balanceSheet, fundTsData] = await Promise.all([
      getSummary(ticker),
      getFinancials(ticker),
      getBalanceSheet(ticker),
      getFundamentalsTimeSeries(ticker),
    ]);
    if (!summary) return null;

    const sparklines = buildSparklines(fundTsData);

    return {
      ticker,
      name: summary.name,
      marketCap: summary.marketCap,
      trailingPE: summary.trailingPE,
      forwardPE: summary.forwardPE,
      enterpriseToEbitda: summary.enterpriseToEbitda,
      priceToBook: summary.priceToBook,
      pegRatio: summary.pegRatio,
      revenueGrowth: financials?.revenueGrowth ?? null,
      earningsGrowth: financials?.earningsGrowth ?? null,
      returnOnEquity: financials?.returnOnEquity ?? null,
      returnOnAssets: financials?.returnOnAssets ?? null,
      grossMargins: financials?.grossMargins ?? null,
      operatingMargins: financials?.operatingMargins ?? null,
      profitMargins: financials?.profitMargins ?? null,
      debtToEquity: balanceSheet?.debtToEquity ?? null,
      currentRatio: balanceSheet?.currentRatio ?? null,
      freeCashflow: balanceSheet?.freeCashflow ?? null,
      sparklines,
    };
  } catch (err) {
    console.error(`[comparables] fetchPeerData ${ticker}:`, err.message);
    return null;
  }
}

function computePeerAverage(peers) {
  const avg = {};
  for (const cat of Object.values(METRIC_CATEGORIES)) {
    for (const m of cat.metrics) {
      const vals = peers.map((p) => p[m.key]).filter((v) => v != null && isFinite(v));
      avg[m.key] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
  }
  return avg;
}

function generateVerdict(ticker, baseValue, peerAvg, fmt) {
  if (baseValue == null || peerAvg == null) return null;
  const diff = ((baseValue - peerAvg) / peerAvg) * 100;
  const absDiff = Math.abs(diff).toFixed(1);

  if (fmt === "x") {
    if (diff > 20) return `${ticker}'s ${absDiff}% above peer avg — expensive`;
    if (diff < -20) return `${ticker}'s ${absDiff}% below peer avg — cheap`;
    return `${ticker} near peer avg`;
  }
  if (fmt === "pct") {
    if (diff > 20) return `${ticker}'s ${absDiff}% above peer avg — strong`;
    if (diff < -20) return `${ticker}'s ${absDiff}% below peer avg — weak`;
    return `${ticker} in line with peers`;
  }
  return null;
}

export async function getComparables(ticker) {
  const cacheKey = `comparables:${ticker}`;
  const cached = cache.getComparables(cacheKey);
  if (cached) return cached;

  const baseSummary = await getSummary(ticker);
  if (!baseSummary?.sector) {
    throw new Error(`No sector data available for ${ticker}`);
  }

  const sector = baseSummary.sector;
  const peerTickers = findSectorPeers(sector, ticker);

  const allResults = await Promise.allSettled(
    peerTickers.map((t) => fetchPeerData(t))
  );
  const validPeers = allResults
    .filter((r) => r.status === "fulfilled" && r.value != null)
    .map((r) => r.value);

  const baseData = await fetchPeerData(ticker);
  const peerAvg = computePeerAverage(validPeers);

  const categories = {};
  for (const [key, cat] of Object.entries(METRIC_CATEGORIES)) {
    categories[key] = {
      label: cat.label,
      metrics: cat.metrics.map((m) => ({
        key: m.key,
        label: m.label,
        fmt: m.fmt,
        hasSparkline: m.hasSparkline || false,
        baseValue: baseData?.[m.key] ?? null,
        peerAvg: peerAvg[m.key],
        sparkline: baseData?.sparklines?.[m.key] ?? null,
        verdict: generateVerdict(ticker, baseData?.[m.key], peerAvg[m.key], m.fmt),
      })),
    };
  }

  const result = {
    ticker,
    sector,
    sectorLabel: sector,
    base: baseData,
    peers: validPeers,
    categories,
    lastUpdated: new Date().toISOString(),
  };

  cache.setComparables(cacheKey, result);
  return result;
}
