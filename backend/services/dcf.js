// DCF valuation model with Monte Carlo simulation
import { getSectorParams, getSizePremium } from "./sectorData.js";

const DEFAULT_RISK_FREE_RATE = 0.0425;
const MARKET_RISK_PREMIUM = 0.0423;
const MARKET_RISK_PREMIUM_SOURCE = "Damodaran January 2026 implied ERP";
const TERMINAL_GROWTH_SOURCE = "static-sector-prior";
const SENSITIVITY_ADJUSTMENTS = Array.from({ length: 21 }, (_, index) =>
  Math.round((-0.05 + index * 0.005) * 1000) / 1000
);

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function getCompanyModelType(summary = {}) {
  const sector = String(summary.sector || "").toLowerCase();
  const industry = String(summary.industry || "").toLowerCase();
  const bankOrInsuranceIndustry = `${sector} ${industry}`;
  return /\b(?:bank(?:s|ing)?|insurance|insurer(?:s)?|mortgage|depositor(?:y|ies)|savings|thrift)\b/.test(bankOrInsuranceIndustry)
    ? "financial-residual-income"
    : "corporate-fcff";
}

function getDCFIneligibilityReasons(params = {}) {
  if (params.modelType === "financial-residual-income") {
    return ["residual-income-not-implemented"];
  }

  const reasons = [];
  if (!(isFiniteNumber(params.sharesOutstanding) && params.sharesOutstanding > 0)) {
    reasons.push("shares-non-positive");
  }
  if (!(isFiniteNumber(params.wacc) && params.wacc > 0)) reasons.push("wacc-non-positive");
  if (!(isFiniteNumber(params.terminalGrowth) && params.terminalGrowth > 0)) {
    reasons.push("terminal-growth-non-positive");
  }
  if (isFiniteNumber(params.wacc) && isFiniteNumber(params.terminalGrowth)
    && params.wacc <= params.terminalGrowth) {
    reasons.push("wacc-not-above-terminal-growth");
  }
  if (params.projectionMethod === "driver-fcff") {
    if (!params.drivers?.eligible) reasons.push("driver-data-insufficient");
  } else if (!(isFiniteNumber(params.fcf) && params.fcf > 0)) reasons.push("fcf-non-positive");
  return reasons;
}

function classifyValuationCohort(summary = {}, params = {}) {
  if (getCompanyModelType(summary) === "financial-residual-income"
    || params.modelType === "financial-residual-income") {
    return { cohort: "bank-insurer", reasons: ["residual-income-not-implemented"] };
  }

  const reasons = getDCFIneligibilityReasons(params);
  if (reasons.length > 0) return { cohort: "unsupported", reasons };
  return {
    cohort: params.projectionMethod === "driver-fcff" || Number(params.projectionGrowth) > 0.15 ? "growth-fcff" : "mature-fcff",
    reasons: [],
  };
}

/**
 * Calculate WACC using CAPM for cost of equity and debt-based cost of debt.
 * Uses one market ERP plus the existing size premium; sector data supplies
 * terminal-growth priors, not a separate ERP.
 */
function calculateWACC(
  marketCap,
  totalDebt,
  beta,
  interestExpense,
  taxRate,
  riskFreeRate = DEFAULT_RISK_FREE_RATE,
) {
  const Rf = isFiniteNumber(riskFreeRate) ? riskFreeRate : DEFAULT_RISK_FREE_RATE;
  const sizePremium = getSizePremium(marketCap);

  const E = marketCap || 0;
  const D = totalDebt || 0;
  const V = E + D || 1;

  const Ke = Rf + (isFiniteNumber(beta) ? beta : 1) * MARKET_RISK_PREMIUM + sizePremium;
  const hasInterestExpense = isFiniteNumber(interestExpense) && Math.abs(interestExpense) > 0;
  const costOfDebtProxy = D > 0 && !hasInterestExpense;
  const Kd = D > 0 ? (hasInterestExpense ? Math.abs(interestExpense) / D : Rf) : 0;
  const effectiveTaxRate = Math.max(0, Math.min(isFiniteNumber(taxRate) ? taxRate : 0.21, 0.45));

  return {
    wacc: (E / V) * Ke + (D / V) * Kd * (1 - effectiveTaxRate),
    erp: MARKET_RISK_PREMIUM,
    erpSource: MARKET_RISK_PREMIUM_SOURCE,
    sizePremium,
    costOfDebtProxy,
  };
}

/**
 * Project FCF for N years, calculate terminal value, enterprise value, fair value per share.
 */
function projectFCF(currentFCF, growthRate, terminalGrowth, wacc, cash, debt, shares, years = 5) {
  const projectedFCFs = [];
  let fcf = Math.max(currentFCF, 0);
  let pvFCF = 0;

  for (let t = 1; t <= years; t++) {
    let currentGrowthRate = growthRate;
    if (years > 5 && t > 5) {
      // Linear fade from base growth down to terminal growth
      const fadeYears = years - 5;
      const fadeStep = (growthRate - terminalGrowth) / fadeYears;
      currentGrowthRate = Math.max(terminalGrowth, growthRate - fadeStep * (t - 5));
    }
    fcf = fcf * (1 + currentGrowthRate);
    projectedFCFs.push(fcf);
    pvFCF += fcf / Math.pow(1 + wacc, t);
  }

  const terminalValue = fcf * (1 + terminalGrowth) / (wacc - terminalGrowth);
  const pvTerminal = terminalValue / Math.pow(1 + wacc, years);
  const enterpriseValue = pvFCF + pvTerminal;
  const equityValue = enterpriseValue + (cash || 0) - (debt || 0);
  const fairValue = shares > 0 ? equityValue / shares : 0;

  return {
    projectedFCFs,
    terminalValue,
    pvExplicitCashFlows: pvFCF,
    pvTerminalValue: pvTerminal,
    enterpriseValue,
    equityValue,
    fairValue,
  };
}

function sortedRecords(records = []) {
  return (Array.isArray(records) ? records : []).filter((record) => record && typeof record === "object")
    .map((record) => ({ ...record, _date: new Date(record.date || record.periodEnd || record.endDate).getTime() }))
    .filter((record) => Number.isFinite(record._date))
    .sort((a, b) => a._date - b._date);
}

function validPositive(value) {
  return isFiniteNumber(Number(value)) && Number(value) > 0;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clampGrowth(value, fallback = 0.05) {
  const growth = isFiniteNumber(Number(value)) ? Number(value) : fallback;
  return Math.max(-0.15, Math.min(growth, 0.25));
}

function buildDriverInputs(annualIncome = [], annualBalanceSheet = [], terminalGrowth = 0.025, normalizedTaxRate = 0.21) {
  const income = sortedRecords(annualIncome);
  const balance = sortedRecords(annualBalanceSheet);
  const revenueRows = income.filter((row) => validPositive(row.totalRevenue));
  const latest = revenueRows.at(-1);
  const prior = revenueRows.at(-2);
  const latestRevenue = latest ? Number(latest.totalRevenue) : null;
  const initialGrowth = latest && prior && Number(prior.totalRevenue) > 0
    ? Number(latest.totalRevenue) / Number(prior.totalRevenue) - 1
    : null;
  const positiveMargins = income
    .filter((row) => validPositive(row.totalRevenue))
    .map((row) => {
      const ebit = isFiniteNumber(Number(row.operatingIncome))
        ? Number(row.operatingIncome)
        : isFiniteNumber(Number(row.ebit)) ? Number(row.ebit) : null;
      return ebit != null && ebit > 0 ? ebit / Number(row.totalRevenue) : null;
    })
    .filter((margin) => margin != null && isFiniteNumber(margin));
  const latestEbit = latest
    ? (isFiniteNumber(Number(latest.operatingIncome)) ? Number(latest.operatingIncome)
      : isFiniteNumber(Number(latest.ebit)) ? Number(latest.ebit) : null)
    : null;
  const startingMargin = latestEbit != null && latestRevenue > 0 ? latestEbit / latestRevenue : 0.10;
  const targetMargin = positiveMargins.length ? median(positiveMargins) : 0.10;
  const diagnostics = [];
  if (latestEbit == null) diagnostics.push("driver-starting-margin-fallback-10pct");
  if (!positiveMargins.length) diagnostics.push("driver-target-margin-fallback-10pct");

  const capitalRows = balance.map((row) => {
    const equity = Number(row.totalEquity ?? row.equity ?? row.commonEquity);
    const debt = Number(row.totalDebt ?? ((Number(row.shortTermDebt) || 0) + (Number(row.longTermDebt) || 0)));
    const cash = Number(row.cash ?? row.totalCash);
    const investedCapital = equity + debt - cash;
    return { ...row, investedCapital };
  }).filter((row) => isFiniteNumber(row.investedCapital));
  const matched = [];
  for (let index = 1; index < capitalRows.length; index += 1) {
    const current = capitalRows[index];
    const previous = capitalRows[index - 1];
    const currentIncome = income.find((row) => new Date(row.date || row.periodEnd).getFullYear() === new Date(current.date || current.periodEnd).getFullYear());
    const previousIncome = income.find((row) => new Date(row.date || row.periodEnd).getFullYear() === new Date(previous.date || previous.periodEnd).getFullYear());
    if (!currentIncome || !previousIncome) continue;
    const revenueDelta = Number(currentIncome.totalRevenue) - Number(previousIncome.totalRevenue);
    const capitalDelta = current.investedCapital - previous.investedCapital;
    const ratio = capitalDelta > 0 ? revenueDelta / capitalDelta : null;
    if (isFiniteNumber(ratio) && ratio >= 0.25 && ratio <= 10) matched.push(ratio);
  }
  let salesToCapitalRatio = matched.length ? median(matched) : null;
  let salesToCapitalSource = "historical-median-incremental-revenue-to-invested-capital";
  if (!(isFiniteNumber(salesToCapitalRatio) && salesToCapitalRatio >= 0.25 && salesToCapitalRatio <= 10)) {
    const latestCapital = capitalRows.findLast((row) => row.investedCapital > 0);
    if (latestCapital && latestRevenue > 0) {
      salesToCapitalRatio = latestRevenue / latestCapital.investedCapital;
      salesToCapitalSource = "latest-revenue-to-positive-invested-capital-fallback";
    }
    if (!(isFiniteNumber(salesToCapitalRatio) && salesToCapitalRatio >= 0.25 && salesToCapitalRatio <= 10)) {
      salesToCapitalRatio = 2;
      salesToCapitalSource = "static-2.0-fallback";
    }
    diagnostics.push(`driver-sales-to-capital-fallback:${salesToCapitalSource}`);
  }
  // A driver projection needs at least one dated capital observation; without
  // it there is no defensible reinvestment basis (the 2.0 ratio is only a
  // fallback for malformed/insufficient matched deltas).
  const eligible = latestRevenue != null && revenueRows.length >= 2 && initialGrowth != null && capitalRows.length >= 1;
  return {
    latestRevenue,
    initialGrowth: initialGrowth == null ? null : clampGrowth(initialGrowth),
    historicalInitialGrowth: initialGrowth,
    terminalGrowth,
    startingMargin: isFiniteNumber(startingMargin) ? startingMargin : 0.10,
    targetMargin: isFiniteNumber(targetMargin) ? targetMargin : 0.10,
    normalizedTaxRate: isFiniteNumber(normalizedTaxRate) ? Math.max(0, Math.min(normalizedTaxRate, 0.45)) : 0.21,
    salesToCapitalRatio,
    salesToCapitalSource,
    eligible,
    diagnostics,
    sources: {
      revenue: "annualIncome.totalRevenue (latest positive dated observation)",
      growth: "annualIncome.totalRevenue (latest two positive dated observations)",
      startingMargin: latestEbit == null ? "fallback-10-percent" : "annualIncome.operatingIncome-or-ebit",
      targetMargin: positiveMargins.length ? "median positive annual EBIT/revenue" : "fallback-10-percent",
      tax: "normalized annual tax rate; zero in loss years",
      reinvestment: salesToCapitalSource,
    },
  };
}

function buildCandidateDriverInputs(annualIncome = [], annualBalanceSheet = [], terminalGrowth = 0.025, normalizedTaxRate = 0.21) {
  const base = buildDriverInputs(annualIncome, annualBalanceSheet, terminalGrowth, normalizedTaxRate);
  const income = sortedRecords(annualIncome);
  const revenueRows = income.filter((row) => validPositive(row.totalRevenue));
  const recentRevenueRows = revenueRows.slice(-4);
  const growthObservations = recentRevenueRows.slice(1).map((row, index) => {
    const previousRevenue = Number(recentRevenueRows[index].totalRevenue);
    return previousRevenue > 0 ? Number(row.totalRevenue) / previousRevenue - 1 : null;
  }).filter((growth) => isFiniteNumber(growth));
  const recentPositiveMargins = income
    .filter((row) => validPositive(row.totalRevenue))
    .map((row) => {
      const ebit = isFiniteNumber(Number(row.operatingIncome))
        ? Number(row.operatingIncome)
        : isFiniteNumber(Number(row.ebit)) ? Number(row.ebit) : null;
      return ebit != null && ebit > 0 ? ebit / Number(row.totalRevenue) : null;
    })
    .filter((margin) => margin != null && isFiniteNumber(margin))
    .slice(-3);
  const candidateGrowth = growthObservations.length ? median(growthObservations) : null;
  const candidateTargetMargin = recentPositiveMargins.length ? median(recentPositiveMargins) : base.targetMargin;
  return {
    ...base,
    initialGrowth: candidateGrowth == null ? null : clampGrowth(candidateGrowth),
    historicalInitialGrowth: candidateGrowth,
    targetMargin: candidateTargetMargin,
    eligible: base.eligible && candidateGrowth != null,
    diagnostics: [...base.diagnostics, ...(candidateGrowth == null ? ["driver-candidate-growth-unavailable"] : [])],
    sources: {
      ...base.sources,
      growth: "annualIncome.totalRevenue (median latest up to 3 dated annual changes)",
      targetMargin: recentPositiveMargins.length ? "median latest up to 3 positive annual EBIT/revenue" : base.sources.targetMargin,
    },
  };
}

function projectDriverFCFF(drivers, terminalGrowth, wacc, cash, debt, shares, years = 10, initialGrowth = drivers?.initialGrowth) {
  const projectionYears = Number.isInteger(years) && years > 0 ? years : 10;
  if (!drivers || !(drivers.latestRevenue > 0) || !(wacc > terminalGrowth)) {
    return { projectedFCFs: [], fairValue: null, terminalValue: null, pvExplicitCashFlows: null, pvTerminalValue: null, enterpriseValue: null, equityValue: null };
  }
  const growth = clampGrowth(initialGrowth, drivers.initialGrowth ?? 0.05);
  const schedule = [];
  let previousRevenue = drivers.latestRevenue;
  let pvExplicitCashFlows = 0;
  const fadeStartYear = Math.ceil(projectionYears / 2);
  const fadeYears = projectionYears - fadeStartYear;
  for (let year = 1; year <= projectionYears; year += 1) {
    const yearGrowth = year <= fadeStartYear || fadeYears === 0
      ? growth
      : growth + (terminalGrowth - growth) * ((year - fadeStartYear) / fadeYears);
    const revenue = previousRevenue * (1 + yearGrowth);
    const operatingMargin = drivers.startingMargin + (drivers.targetMargin - drivers.startingMargin) * (year / projectionYears);
    const ebit = revenue * operatingMargin;
    const taxRate = ebit > 0 ? drivers.normalizedTaxRate : 0;
    const nopat = ebit * (1 - taxRate);
    const reinvestment = (revenue - previousRevenue) / drivers.salesToCapitalRatio;
    const fcff = nopat - reinvestment;
    schedule.push({ year, growth: yearGrowth, revenue, operatingMargin, ebit, taxRate, nopat, reinvestment, fcff });
    pvExplicitCashFlows += fcff / (1 + wacc) ** year;
    previousRevenue = revenue;
  }
  const terminalRevenue = previousRevenue * (1 + terminalGrowth);
  const terminalEbit = terminalRevenue * drivers.targetMargin;
  const terminalTaxRate = terminalEbit > 0 ? drivers.normalizedTaxRate : 0;
  const terminalNopat = terminalEbit * (1 - terminalTaxRate);
  const terminalReinvestment = (terminalRevenue - previousRevenue) / drivers.salesToCapitalRatio;
  const terminalFCFF = terminalNopat - terminalReinvestment;
  const terminalValue = terminalFCFF / (wacc - terminalGrowth);
  const pvTerminalValue = terminalValue / (1 + wacc) ** projectionYears;
  const enterpriseValue = pvExplicitCashFlows + pvTerminalValue;
  const equityValue = enterpriseValue + (cash || 0) - (debt || 0);
  const fairValue = shares > 0 ? equityValue / shares : 0;
  return {
    projectedFCFs: schedule.map((row) => row.fcff),
    annualSchedule: schedule,
    terminal: { year: projectionYears + 1, revenue: terminalRevenue, operatingMargin: drivers.targetMargin, ebit: terminalEbit, taxRate: terminalTaxRate, nopat: terminalNopat, reinvestment: terminalReinvestment, fcff: terminalFCFF },
    terminalValue,
    pvExplicitCashFlows,
    pvTerminalValue,
    enterpriseValue,
    equityValue,
    fairValue,
  };
}

function projectValuation(params, overrides = {}) {
  const terminalGrowth = overrides.terminalGrowth ?? params.terminalGrowth;
  const wacc = overrides.wacc ?? params.wacc;
  const initialGrowth = overrides.initialGrowth ?? params.projectionGrowth;
  if (params.projectionMethod === "driver-fcff") {
    return projectDriverFCFF(params.drivers, terminalGrowth, wacc, params.cash, params.debt, params.sharesOutstanding, params.projectionYears, initialGrowth);
  }
  return projectFCF(params.fcf, initialGrowth, terminalGrowth, wacc, params.cash, params.debt, params.sharesOutstanding, params.projectionYears);
}

/**
 * Simple Box-Muller transform for normal distribution sampling.
 */
function normalRandom(mean = 0, stdev = 1, random = Math.random) {
  let u = 0, v = 0;
  const boundedRandom = () => Math.min(1, Math.max(Number.MIN_VALUE, Number(random()) || 0));
  u = boundedRandom();
  v = boundedRandom();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

/**
 * Sample from a triangular distribution.
 */
function triangularRandom(min, mode, max, random = Math.random) {
  const safeMode = Math.max(min, Math.min(mode, max));
  const u = random();
  const F = (safeMode - min) / (max - min);
  if (u <= F) {
    return min + Math.sqrt(u * (max - min) * (safeMode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - safeMode));
}

/**
 * Run Monte Carlo simulation.
 */
function monteCarloScalar(
  currentFCF,
  baseGrowth,
  baseWACC,
  cash,
  debt,
  shares,
  iterations = 1000,
  terminalGrowthBase = 0.025,
  years = 5,
  random = Math.random,
) {
  const requestedIterations = iterations;
  const results = [];
  const maxAttempts = Math.max(iterations * 20, iterations);
  let attempts = 0;

  while (results.length < iterations && attempts < maxAttempts) {
    attempts += 1;
    const growthRate = normalRandom(baseGrowth, 0.05, random);
    const wacc = Math.max(normalRandom(baseWACC, 0.015, random), 0.01);
    const terminalGrowth = triangularRandom(0.015, terminalGrowthBase, 0.035, random);
    if (!(wacc > terminalGrowth)) continue;

    const { fairValue } = projectFCF(
      Math.max(currentFCF, 0), growthRate, terminalGrowth, wacc, cash, debt, shares, years
    );
    if (isFiniteNumber(fairValue)) results.push(fairValue);
  }

  results.sort((a, b) => a - b);

  if (results.length === 0) {
    return {
      requestedIterations,
      iterations: 0,
      bear: null,
      base: null,
      bull: null,
      histogram: [],
      warning: "Monte Carlo produced no valid valuations.",
    };
  }

  const min = results[0];
  const max = results[results.length - 1];
  const binCount = 20;
  const binWidth = (max - min) / binCount || 1;
  const histogram = Array.from({ length: binCount }, (_, i) => ({
    bin: Math.round((min + binWidth * i + binWidth / 2) * 100) / 100,
    count: 0,
  }));

  for (const val of results) {
    const idx = Math.min(Math.floor((val - min) / binWidth), binCount - 1);
    histogram[idx].count++;
  }

  const percentile = (percent) => results[Math.floor((results.length - 1) * percent)];
  return {
    requestedIterations,
    iterations: results.length,
    bear: percentile(0.05),
    base: percentile(0.50),
    bull: percentile(0.95),
    histogram,
    ...(results.length < requestedIterations
      ? { warning: `Monte Carlo accepted ${results.length} of ${requestedIterations} requested iterations.` }
      : {}),
  };
}

function buildSensitivityScalar(currentFCF, baseGrowth, baseWACC, terminalGrowth, cash, debt, shares, years) {
  const values = SENSITIVITY_ADJUSTMENTS.map((waccAdjustment) =>
    SENSITIVITY_ADJUSTMENTS.map((growthAdjustment) => {
      const wacc = baseWACC + waccAdjustment;
      const growth = baseGrowth + growthAdjustment;
      if (!(wacc > terminalGrowth)) return null;
      const { fairValue } = projectFCF(currentFCF, growth, terminalGrowth, wacc, cash, debt, shares, years);
      return isFiniteNumber(fairValue) ? fairValue : null;
    }),
  );

  return {
    projectionYears: years,
    waccAdjustments: [...SENSITIVITY_ADJUSTMENTS],
    growthAdjustments: [...SENSITIVITY_ADJUSTMENTS],
    values,
  };
}

function monteCarloDriver(params, iterations = 1000, random = Math.random) {
  const requestedIterations = iterations;
  const results = [];
  const maxAttempts = Math.max(iterations * 20, iterations);
  let attempts = 0;
  while (results.length < iterations && attempts < maxAttempts) {
    attempts += 1;
    const initialGrowth = normalRandom(params.projectionGrowth, 0.05, random);
    const wacc = Math.max(normalRandom(params.wacc, 0.015, random), 0.01);
    const terminalGrowth = triangularRandom(0.015, params.terminalGrowth, 0.035, random);
    if (!(wacc > terminalGrowth)) continue;
    const valuation = projectValuation(params, { initialGrowth, wacc, terminalGrowth });
    if (isFiniteNumber(valuation.fairValue)) results.push(valuation.fairValue);
  }
  results.sort((a, b) => a - b);
  if (!results.length) return { requestedIterations, iterations: 0, bear: null, base: null, bull: null, histogram: [], warning: "Monte Carlo produced no valid valuations." };
  const min = results[0];
  const max = results.at(-1);
  const binCount = 20;
  const binWidth = (max - min) / binCount || 1;
  const histogram = Array.from({ length: binCount }, (_, i) => ({ bin: min + binWidth * i + binWidth / 2, count: 0 }));
  for (const value of results) histogram[Math.min(Math.floor((value - min) / binWidth), binCount - 1)].count += 1;
  const percentile = (percent) => results[Math.floor((results.length - 1) * percent)];
  return { requestedIterations, iterations: results.length, bear: percentile(0.05), base: percentile(0.5), bull: percentile(0.95), histogram, ...(results.length < requestedIterations ? { warning: `Monte Carlo accepted ${results.length} of ${requestedIterations} requested iterations.` } : {}) };
}

function monteCarlo(...args) {
  if (args[0] && typeof args[0] === "object") return monteCarloDriver(args[0], args[1], args[2]);
  return monteCarloScalar(...args);
}

function buildSensitivity(...args) {
  if (args[0] && typeof args[0] === "object") {
    const params = args[0];
    const values = SENSITIVITY_ADJUSTMENTS.map((waccAdjustment) =>
      SENSITIVITY_ADJUSTMENTS.map((growthAdjustment) => {
        const wacc = params.wacc + waccAdjustment;
        const initialGrowth = params.projectionGrowth + growthAdjustment;
        if (!(wacc > params.terminalGrowth)) return null;
        const valuation = projectValuation(params, { initialGrowth, wacc });
        return isFiniteNumber(valuation.fairValue) ? valuation.fairValue : null;
      }),
    );
    return { projectionYears: params.projectionYears, waccAdjustments: [...SENSITIVITY_ADJUSTMENTS], growthAdjustments: [...SENSITIVITY_ADJUSTMENTS], values };
  }
  return buildSensitivityScalar(...args);
}

/**
 * Aggregate all inputs needed for DCF from cached Yahoo Finance data.
 */
function aggregateDCFInputs(summary, financials, balanceSheet, annualIncome, annualCashFlow, options = {}) {
  const modelType = getCompanyModelType(summary);
  const diagnostics = [];
  const riskFreeRate = isFiniteNumber(options.riskFreeRate) ? options.riskFreeRate : DEFAULT_RISK_FREE_RATE;
  const riskFreeRateSource = options.riskFreeRateSource || "fallback-static";
  if (modelType !== "corporate-fcff") {
    return { modelType, eligible: false, cohort: "bank-insurer", cohortReasons: ["residual-income-not-implemented"], cashFlowType: "FCFF", cashFlowSource: null, riskFreeRate, riskFreeRateSource, marketRiskPremium: MARKET_RISK_PREMIUM, marketRiskPremiumSource: MARKET_RISK_PREMIUM_SOURCE, terminalGrowthSource: TERMINAL_GROWTH_SOURCE, diagnostics: ["Corporate FCFF is unsupported for financial companies until residual-income valuation is implemented."], sector: summary?.sector || null, industry: summary?.industry || null };
  }
  const marketCap = Number(summary?.marketCap) || 0;
  const currentPrice = Number(summary?.currentPrice) || 0;
  const reportedShares = Number(summary?.sharesOutstanding);
  const sharesOutstanding = reportedShares > 0 ? reportedShares : currentPrice > 0 && marketCap > 0 ? marketCap / currentPrice : 0;
  const beta = summary?.beta ?? 1;
  const sector = summary?.sector || null;
  const cash = Number(balanceSheet?.totalCash) || 0;
  const debt = Number(balanceSheet?.totalDebt) || 0;
  const freeCashflow = Number(balanceSheet?.freeCashflow) || 0;
  const sortedIncome = sortedRecords(annualIncome);
  const annualBalanceSheet = options.annualBalanceSheet || balanceSheet?.annualBalanceSheet || [];
  const latestIncome = sortedIncome.at(-1);
  let interestExpense = null;
  if (latestIncome && isFiniteNumber(Number(latestIncome.interestExpense))) interestExpense = Math.abs(Number(latestIncome.interestExpense));
  let taxRate = 0.21;
  if (latestIncome) {
    const ebit = Number(latestIncome.operatingIncome ?? latestIncome.ebit);
    const ebt = Number(latestIncome.ebt ?? (ebit - (interestExpense || 0)));
    if (Number(latestIncome.incomeTaxExpense) >= 0 && Number(latestIncome.netIncome) > 0 && ebt > 0) taxRate = Number(latestIncome.incomeTaxExpense) / ebt;
    else if (Number(latestIncome.netIncome) > 0 && ebit > 0 && ebt > 0) taxRate = 1 - Number(latestIncome.netIncome) / ebt;
    taxRate = Math.max(0, Math.min(taxRate, 0.45));
  }
  let smoothedFCF = freeCashflow;
  let projGrowth = Number(financials?.revenueGrowth);
  if (!isFiniteNumber(projGrowth)) projGrowth = 0.05;
  const recentIncome = sortedIncome.slice(-4);
  const revs = recentIncome.map((row) => Number(row.totalRevenue)).filter((value) => value > 0);
  if (revs.length >= 2) projGrowth = Math.pow(revs.at(-1) / revs[0], 1 / (revs.length - 1)) - 1;
  const sortedCF = sortedRecords(annualCashFlow).slice(-4);
  let totalRev = 0; let totalFCF = 0;
  for (const cf of sortedCF) {
    const inc = recentIncome.find((row) => new Date(row.date).getFullYear() === new Date(cf.date).getFullYear());
    if (inc && Number(inc.totalRevenue) > 0 && isFiniteNumber(Number(cf.freeCashFlow))) { totalRev += Number(inc.totalRevenue); totalFCF += Number(cf.freeCashFlow); }
  }
  if (totalRev > 0 && totalFCF / totalRev > 0 && revs.at(-1) > 0) smoothedFCF = revs.at(-1) * totalFCF / totalRev;
  projGrowth = clampGrowth(projGrowth);
  const sectorParams = getSectorParams(sector);
  const waccData = calculateWACC(marketCap, debt, beta, interestExpense, taxRate, riskFreeRate);
  if (waccData.costOfDebtProxy) diagnostics.push("cost-of-debt-risk-free-proxy");
  if (riskFreeRateSource === "fallback-static") diagnostics.push("risk-free-rate-fallback");
  const selectedLeveredFCF = isFiniteNumber(smoothedFCF) ? smoothedFCF : freeCashflow;
  const fcff = selectedLeveredFCF + (interestExpense || 0) * (1 - taxRate);
  const drivers = buildDriverInputs(annualIncome, annualBalanceSheet, sectorParams.terminalGrowth, taxRate);
  diagnostics.push(...drivers.diagnostics);
  const annualGrowth = drivers.historicalInitialGrowth;
  const canUseDriver = drivers.eligible && sharesOutstanding > 0 && waccData.wacc > sectorParams.terminalGrowth;
  const projectionMethod = (canUseDriver && (fcff <= 0 || annualGrowth > 0.15)) ? "driver-fcff" : "scalar-fcff";
  const projectionYears = projectionMethod === "driver-fcff" ? 10 : (projGrowth > 0.15 ? 10 : 5);
  const params = { modelType, fcf: fcff, cashFlowType: "FCFF", cashFlowSource: "Yahoo reported levered FCF plus after-tax interest", revenueGrowth: projGrowth, historicalFCFGrowth: projGrowth, projectionGrowth: projectionMethod === "driver-fcff" ? drivers.initialGrowth : projGrowth, projectionYears, projectionMethod, wacc: waccData.wacc, terminalGrowth: sectorParams.terminalGrowth, terminalGrowthSource: TERMINAL_GROWTH_SOURCE, sharesOutstanding, cash, debt, beta, interestExpense, taxRate, rf: riskFreeRate, riskFreeRate, riskFreeRateSource, erp: waccData.erp, marketRiskPremium: waccData.erp, marketRiskPremiumSource: waccData.erpSource, sizePremium: waccData.sizePremium, sector, industry: summary?.industry || null, sectorWacc: sectorParams.refWacc, drivers, diagnostics };
  if (projectionMethod === "driver-fcff") {
    const projection = projectDriverFCFF(drivers, params.terminalGrowth, params.wacc, params.cash, params.debt, params.sharesOutstanding);
    params.drivers = { ...drivers, assumptions: { explicitYears: 10, initialGrowth: drivers.initialGrowth, terminalGrowth: params.terminalGrowth, startingMargin: drivers.startingMargin, targetMargin: drivers.targetMargin, normalizedTaxRate: drivers.normalizedTaxRate, salesToCapitalRatio: drivers.salesToCapitalRatio }, annualSchedule: projection.annualSchedule, terminal: projection.terminal };
  }
  const cohort = classifyValuationCohort(summary, params);
  return { ...params, eligible: cohort.cohort !== "unsupported", cohort: cohort.cohort, cohortReasons: cohort.reasons };
}

export {
  DEFAULT_RISK_FREE_RATE,
  MARKET_RISK_PREMIUM,
  TERMINAL_GROWTH_SOURCE,
  SENSITIVITY_ADJUSTMENTS,
  getCompanyModelType,
  getDCFIneligibilityReasons,
  classifyValuationCohort,
  calculateWACC,
  projectFCF,
  projectDriverFCFF,
  projectValuation,
  buildCandidateDriverInputs,
  monteCarlo,
  buildSensitivity,
  aggregateDCFInputs,
};
