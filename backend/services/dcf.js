// DCF valuation model with Monte Carlo simulation
import { getSectorParams, getSizePremium } from "./sectorData.js";

/**
 * Calculate WACC using CAPM for cost of equity and debt-based cost of debt.
 * Applies sector-adjusted ERP and size premium when sector is provided.
 */
function calculateWACC(marketCap, totalDebt, beta, interestExpense, taxRate, sector) {
  const Rf = 0.0425;
  const sectorParams = getSectorParams(sector);
  const erp = sectorParams.erp;
  const sizePremium = getSizePremium(marketCap);

  const E = marketCap || 0;
  const D = totalDebt || 0;
  const V = E + D || 1;

  const Ke = Rf + (beta ?? 1) * erp + sizePremium;
  const Kd = (D > 0 && interestExpense > 0) ? interestExpense / D : 0;
  const effectiveTaxRate = taxRate ?? 0.21;

  return { wacc: (E / V) * Ke + (D / V) * Kd * (1 - effectiveTaxRate), erp, sizePremium };
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

  return { projectedFCFs, terminalValue, enterpriseValue, fairValue };
}

/**
 * Simple Box-Muller transform for normal distribution sampling.
 */
function normalRandom(mean = 0, stdev = 1) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

/**
 * Sample from a triangular distribution.
 */
function triangularRandom(min, mode, max) {
  const u = Math.random();
  const F = (mode - min) / (max - min);
  if (u <= F) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/**
 * Run Monte Carlo simulation.
 */
function monteCarlo(currentFCF, baseGrowth, baseWACC, cash, debt, shares, iterations = 1000, terminalGrowthBase = 0.025, years = 5) {
  const results = [];

  for (let i = 0; i < iterations; i++) {
    const growthRate = normalRandom(baseGrowth, 0.05);
    const wacc = Math.max(normalRandom(baseWACC, 0.015), 0.01);
    const terminalGrowth = triangularRandom(0.015, terminalGrowthBase, 0.035);

    const { fairValue } = projectFCF(
      Math.max(currentFCF, 0), growthRate, terminalGrowth, wacc, cash, debt, shares, years
    );
    results.push(fairValue);
  }

  results.sort((a, b) => a - b);

  const p5 = results[Math.floor(iterations * 0.05)];
  const p50 = results[Math.floor(iterations * 0.50)];
  const p95 = results[Math.floor(iterations * 0.95)];

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

  return { bear: p5, base: p50, bull: p95, histogram };
}

/**
 * Aggregate all inputs needed for DCF from cached Yahoo Finance data.
 */
function aggregateDCFInputs(summary, financials, balanceSheet, annualIncome, annualCashFlow) {
  const marketCap = summary?.marketCap || 0;
  const currentPrice = summary?.currentPrice || 0;
  const sharesOutstanding = currentPrice > 0 ? marketCap / currentPrice : 0;
  const beta = summary?.beta ?? 1;
  const revenueGrowth = financials?.revenueGrowth ?? 0.05;
  const sector = summary?.sector || null;

  const cash = balanceSheet?.totalCash || 0;
  const debt = balanceSheet?.totalDebt || 0;
  const freeCashflow = balanceSheet?.freeCashflow || 0;

  let interestExpense = 0;
  if (annualIncome?.length) {
    const latest = annualIncome[annualIncome.length - 1];
    // Try to use actual interest expense if available, otherwise approximate
    if (latest.interestExpense != null && latest.interestExpense >= 0) {
      interestExpense = latest.interestExpense;
    } else {
      // Fallback: EBIT - EBT approximation (less reliable)
      // Operating Income is close to EBIT, use conservatively
      const ebit = latest.operatingIncome || 0;
      const netIncome = latest.netIncome || 0;
      const approximated = Math.max(ebit - netIncome, 0);
      interestExpense = Math.min(approximated, ebit * 0.5);
    }
  }

  let taxRate = 0.21;
  if (annualIncome?.length) {
    const latest = annualIncome[annualIncome.length - 1];
    // Prefer actual tax expense if available
    if (latest.incomeTaxExpense != null && latest.netIncome > 0) {
      const ebt = latest.ebt || (latest.operatingIncome - interestExpense);
      if (ebt > 0) {
        taxRate = latest.incomeTaxExpense / ebt;
      }
    } else if (latest.netIncome && latest.operatingIncome && latest.operatingIncome > 0) {
      // Fallback: estimate from available data
      const ebit = latest.operatingIncome;
      const ebt = Math.max(ebit - interestExpense, 0);
      if (ebt > 0) {
        taxRate = 1 - (latest.netIncome / ebt);
      }
    }
    taxRate = Math.max(0, Math.min(taxRate, 0.45));
  }

  let smoothedFCF = freeCashflow;
  let projGrowth = revenueGrowth || 0.05;

  if (annualIncome?.length >= 2 && annualCashFlow?.length >= 2) {
    // 1. Sort chronologically (oldest first) to ensure correct CAGR math
    const sortedIncome = [...annualIncome].sort((a, b) => new Date(a.date) - new Date(b.date));
    const sortedCF = [...annualCashFlow].sort((a, b) => new Date(a.date) - new Date(b.date));

    // 2. Calculate historical Revenue CAGR
    const recentIncome = sortedIncome.slice(-4);
    const revs = recentIncome.map(y => y.totalRevenue).filter(r => r != null && r > 0);
    
    if (revs.length >= 2) {
      const firstRev = revs[0];
      const lastRev = revs[revs.length - 1];
      const years = revs.length - 1;
      projGrowth = Math.pow(lastRev / firstRev, 1 / years) - 1;
    }

    // 3. Calculate Average FCF Margin
    const recentCF = sortedCF.slice(-4);
    let totalRev = 0;
    let totalFCF = 0;
    
    for (const cf of recentCF) {
      const cfYear = new Date(cf.date).getFullYear();
      const inc = recentIncome.find(i => new Date(i.date).getFullYear() === cfYear);
      if (inc && inc.totalRevenue > 0 && cf.freeCashFlow != null) {
        totalRev += inc.totalRevenue;
        totalFCF += cf.freeCashFlow;
      }
    }

    if (totalRev > 0) {
      const avgFCFMargin = totalFCF / totalRev;
      const latestRev = revs.length > 0 ? revs[revs.length - 1] : 0;
      
      // 3. Smooth FCF based on margin
      if (latestRev > 0 && avgFCFMargin > 0) {
        smoothedFCF = latestRev * avgFCFMargin;
      }
    }
  }

  // 4. Winsorize (Cap) the growth rate
  projGrowth = Math.max(-0.15, Math.min(projGrowth, 0.25));

  const projectionYears = projGrowth > 0.15 ? 10 : 5;

  const sectorParams = getSectorParams(sector);
  const { wacc, erp, sizePremium } = calculateWACC(marketCap, debt, beta, interestExpense, taxRate, sector);

  return {
    fcf: smoothedFCF > 0 ? smoothedFCF : freeCashflow,
    revenueGrowth: projGrowth,
    historicalFCFGrowth: projGrowth,
    projectionGrowth: projGrowth,
    projectionYears,
    wacc,
    terminalGrowth: sectorParams.terminalGrowth,
    sharesOutstanding,
    cash,
    debt,
    beta,
    interestExpense,
    taxRate,
    rf: 0.0425,
    erp,
    sizePremium,
    sector,
    sectorWacc: sectorParams.refWacc,
  };
}

export { calculateWACC, projectFCF, monteCarlo, aggregateDCFInputs };
