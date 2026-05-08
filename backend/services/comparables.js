import { getSummary, getFinancials, getBalanceSheet } from "./yahoofinance.js";
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

function buildSparklines(summary, financials, balanceSheet) {
  const annualIncome = financials?.annualIncome || [];
  const annualBalance = balanceSheet?.annualBalanceSheet || [];
  const annualCashFlow = balanceSheet?.annualCashFlow || [];

  const years = {};
  for (const s of annualIncome) {
    const y = s.date ? new Date(s.date).getFullYear() : null;
    if (y) years[y] = { ...years[y], income: s };
  }
  for (const s of annualBalance) {
    const y = s.date ? new Date(s.date).getFullYear() : null;
    if (y) years[y] = { ...years[y], balance: s };
  }
  for (const s of annualCashFlow) {
    const y = s.date ? new Date(s.date).getFullYear() : null;
    if (y) years[y] = { ...years[y], cashflow: s };
  }

  const sparklines = {};

  // Growth rates from annual income
  const sortedIncome = [...annualIncome].reverse();
  const revGrowthVals = [];
  for (let i = 1; i < sortedIncome.length; i++) {
    const curr = sortedIncome[i].totalRevenue;
    const prev = sortedIncome[i - 1].totalRevenue;
    if (curr && prev && prev > 0) {
      revGrowthVals.push({
        year: new Date(sortedIncome[i].date).getFullYear(),
        value: ((curr - prev) / prev) * 100,
      });
    }
  }
  if (revGrowthVals.length > 0) sparklines.revenueGrowth = revGrowthVals;

  const earnGrowthVals = [];
  for (let i = 1; i < sortedIncome.length; i++) {
    const curr = sortedIncome[i].netIncome;
    const prev = sortedIncome[i - 1].netIncome;
    if (curr && prev && prev > 0) {
      earnGrowthVals.push({
        year: new Date(sortedIncome[i].date).getFullYear(),
        value: ((curr - prev) / prev) * 100,
      });
    }
  }
  if (earnGrowthVals.length > 0) sparklines.earningsGrowth = earnGrowthVals;

  // Profitability from annual income
  const roeVals = [];
  const roaVals = [];
  const grossMarginVals = [];
  const opMarginVals = [];
  const netMarginVals = [];

  for (const [y, data] of Object.entries(years)) {
    if (data.income && data.balance) {
      if (data.income.netIncome && data.balance.totalEquity && data.balance.totalEquity > 0) {
        roeVals.push({ year: Number(y), value: (data.income.netIncome / data.balance.totalEquity) * 100 });
      }
      if (data.income.netIncome && data.balance.totalAssets && data.balance.totalAssets > 0) {
        roaVals.push({ year: Number(y), value: (data.income.netIncome / data.balance.totalAssets) * 100 });
      }
    }
    if (data.income) {
      if (data.income.grossMargin != null) {
        grossMarginVals.push({ year: Number(y), value: data.income.grossMargin * 100 });
      }
      if (data.income.ebit != null && data.income.totalRevenue && data.income.totalRevenue > 0) {
        opMarginVals.push({ year: Number(y), value: (data.income.ebit / data.income.totalRevenue) * 100 });
      }
      if (data.income.netMargin != null) {
        netMarginVals.push({ year: Number(y), value: data.income.netMargin * 100 });
      }
    }
  }

  if (roeVals.length > 0) sparklines.returnOnEquity = roeVals;
  if (roaVals.length > 0) sparklines.returnOnAssets = roaVals;
  if (grossMarginVals.length > 0) sparklines.grossMargins = grossMarginVals;
  if (opMarginVals.length > 0) sparklines.operatingMargins = opMarginVals;
  if (netMarginVals.length > 0) sparklines.profitMargins = netMarginVals;

  // Health metrics from annual balance sheet + cash flow
  const deVals = [];
  const crVals = [];
  const fcfVals = [];

  for (const [y, data] of Object.entries(years)) {
    if (data.balance) {
      if (data.balance.totalDebt != null && data.balance.totalEquity && data.balance.totalEquity > 0) {
        deVals.push({ year: Number(y), value: data.balance.totalDebt / data.balance.totalEquity });
      }
      if (data.balance.currentRatio != null) {
        crVals.push({ year: Number(y), value: data.balance.currentRatio });
      }
    }
    if (data.cashflow && data.cashflow.freeCashFlow != null) {
      fcfVals.push({ year: Number(y), value: data.cashflow.freeCashFlow });
    }
  }

  if (deVals.length > 0) sparklines.debtToEquity = deVals;
  if (crVals.length > 0) sparklines.currentRatio = crVals;
  if (fcfVals.length > 0) sparklines.freeCashflow = fcfVals;

  return sparklines;
}

async function fetchPeerData(ticker) {
  try {
    const [summary, financials, balanceSheet] = await Promise.all([
      getSummary(ticker),
      getFinancials(ticker),
      getBalanceSheet(ticker),
    ]);
    if (!summary) return null;

    const sparklines = buildSparklines(summary, financials, balanceSheet);

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
