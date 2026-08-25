import {
  MARKET_RISK_PREMIUM,
  SENSITIVITY_ADJUSTMENTS,
  aggregateDCFInputs,
  buildCandidateDriverInputs,
  buildSensitivity,
  calculateWACC,
  getCompanyModelType,
  monteCarlo,
  projectFCF,
  projectDriverFCFF,
  projectValuation,
} from "../dcf.js";

describe("DCF contract", () => {
  test("normalizes reported levered FCF to FCFF and preserves the equity bridge", () => {
    const params = aggregateDCFInputs(
      {
        marketCap: 1_000,
        currentPrice: 10,
        sharesOutstanding: 120,
        beta: 1,
        sector: "Technology",
      },
      { revenueGrowth: 0.1 },
      { freeCashflow: 100, totalCash: 50, totalDebt: 20 },
      [{ date: "2025-12-31", interestExpense: -10, incomeTaxExpense: 2, ebt: 20, netIncome: 18 }],
      [],
      { riskFreeRate: 0.04, riskFreeRateSource: "test" },
    );

    expect(params.cashFlowType).toBe("FCFF");
    expect(params.fcf).toBeCloseTo(109, 8);
    expect(params.sharesOutstanding).toBe(120);
    const dcf = projectFCF(
      params.fcf,
      params.projectionGrowth,
      params.terminalGrowth,
      params.wacc,
      params.cash,
      params.debt,
      params.sharesOutstanding,
      params.projectionYears,
    );
    expect(dcf.equityValue).toBeCloseTo(dcf.enterpriseValue + 30, 8);
    expect(dcf.fairValue).toBeCloseTo(dcf.equityValue / 120, 8);
  });

  test("uses the risk-free rate as a disclosed debt-cost proxy", () => {
    const result = calculateWACC(1_000, 100, 1, null, 0.21, 0.04);
    expect(result.erp).toBe(MARKET_RISK_PREMIUM);
    expect(result.costOfDebtProxy).toBe(true);
    const expectedWacc = (1_000 / 1_100) * (0.04 + MARKET_RISK_PREMIUM + result.sizePremium)
      + (100 / 1_100) * 0.04 * (1 - 0.21);
    expect(result.wacc).toBeCloseTo(expectedWacc, 8);
  });

  test("classifies banks and insurers before corporate FCFF", () => {
    expect(getCompanyModelType({ sector: "Financial Services", industry: "Banks - Regional" }))
      .toBe("financial-residual-income");
    const params = aggregateDCFInputs(
      { sector: "Financial Services", industry: "Insurance - Diversified", marketCap: 100, currentPrice: 10 },
      { revenueGrowth: 0.1 },
      { freeCashflow: 100, totalDebt: 10 },
      [],
      [],
    );
    expect(params).toMatchObject({ modelType: "financial-residual-income", eligible: false });
    expect(params.diagnostics[0]).toMatch(/unsupported/);
  });

  test("does not gate non-bank financial industries", () => {
    expect(getCompanyModelType({ sector: "Financial Services", industry: "Credit Services" }))
      .toBe("corporate-fcff");
    expect(getCompanyModelType({ sector: "Financial Services", industry: "Capital Markets" }))
      .toBe("corporate-fcff");
  });

  test("rejects invalid Monte Carlo draws without emitting non-finite values", () => {
    const result = monteCarlo(100, 0.05, 0.01, 0, 0, 10, 2, 0.025, 5, () => 0.5);
    expect(result.iterations).toBe(0);
    expect(result.bear).toBeNull();
    expect(result.histogram).toEqual([]);
  });

  test("bounds a zero-valued injected RNG without hanging", () => {
    const result = monteCarlo(100, 0.05, 0.1, 0, 0, 10, 2, 0.025, 5, () => 0);
    expect(result.iterations).toBe(2);
    expect([result.bear, result.base, result.bull].every(Number.isFinite)).toBe(true);
    expect(result.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(2);
  });

  test("sensitivity center equals the base DCF", () => {
    const input = [100, 0.08, 0.1, 0.025, 20, 10, 10, 5];
    const base = projectFCF(input[0], input[1], input[3], input[2], ...input.slice(4)).fairValue;
    const sensitivity = buildSensitivity(...input);
    const center = SENSITIVITY_ADJUSTMENTS.indexOf(0);
    expect(sensitivity.values[center][center]).toBeCloseTo(base, 8);
    expect(sensitivity.values.flat().every((value) => value == null || Number.isFinite(value))).toBe(true);
  });

  test("uses genuine operating income and never treats operating expense as EBIT", () => {
    const summary = { marketCap: 1_000, currentPrice: 10, sharesOutstanding: 100, beta: 1, sector: "Technology" };
    const income = [
      { date: "2022-12-31", totalRevenue: 100, operatingIncome: 20, operatingExpense: 80 },
      { date: "2023-12-31", totalRevenue: 150, operatingIncome: 0, ebit: 0, operatingExpense: 90 },
    ];
    const balance = {
      freeCashflow: 100,
      annualBalanceSheet: [{ date: "2023-12-31", totalEquity: 100, totalDebt: 20, cash: 10 }],
    };
    const params = aggregateDCFInputs(summary, {}, balance, income, []);
    expect(params.projectionMethod).toBe("driver-fcff");
    expect(params.drivers.startingMargin).toBe(0);
    expect(params.drivers.sources.startingMargin).toBe("annualIncome.operatingIncome-or-ebit");
    expect(params.drivers.startingMargin).not.toBe(90 / 150);
  });

  test("uses zero tax in projected loss years", () => {
    const params = aggregateDCFInputs(
      { marketCap: 1_000, currentPrice: 10, sharesOutstanding: 100, beta: 1, sector: "Technology" },
      {},
      {
        freeCashflow: -10,
        annualBalanceSheet: [{ date: "2023-12-31", totalEquity: 100, totalDebt: 20, cash: 10 }],
      },
      [
        { date: "2022-12-31", totalRevenue: 100, operatingIncome: -20 },
        { date: "2023-12-31", totalRevenue: 150, operatingIncome: -10 },
      ],
      [],
    );
    expect(params.projectionMethod).toBe("driver-fcff");
    expect(params.drivers.annualSchedule[0].taxRate).toBe(0);
    expect(params.drivers.annualSchedule[0].ebit).toBeLessThan(0);
  });

  test("derives terminal value from terminal-year driver economics", () => {
    const params = aggregateDCFInputs(
      { marketCap: 1_000, currentPrice: 10, sharesOutstanding: 100, beta: 1, sector: "Technology" },
      {},
      {
        freeCashflow: 20,
        annualBalanceSheet: [
          { date: "2022-12-31", totalEquity: 100, totalDebt: 20, cash: 10 },
          { date: "2023-12-31", totalEquity: 110, totalDebt: 20, cash: 10 },
        ],
      },
      [
        { date: "2022-12-31", totalRevenue: 100, operatingIncome: 10 },
        { date: "2023-12-31", totalRevenue: 130, operatingIncome: 13 },
      ],
      [],
    );
    const valuation = projectValuation(params);
    expect(valuation.terminalValue).toBeCloseTo(valuation.terminal.fcff / (params.wacc - params.terminalGrowth), 10);
    expect(valuation.terminal.revenue).toBeCloseTo(params.drivers.annualSchedule.at(-1).revenue * (1 + params.terminalGrowth), 10);
    expect(valuation.terminal.reinvestment).toBeCloseTo((valuation.terminal.revenue - params.drivers.annualSchedule.at(-1).revenue) / params.drivers.salesToCapitalRatio, 10);
  });

  test("requires real driver data before accepting a nonpositive-FCF company", () => {
    const summary = { marketCap: 1_000, currentPrice: 10, sharesOutstanding: 100, beta: 1, sector: "Technology" };
    const income = [
      { date: "2022-12-31", totalRevenue: 100, operatingIncome: -10 },
      { date: "2023-12-31", totalRevenue: 130, operatingIncome: -5 },
    ];
    const withoutDrivers = aggregateDCFInputs(summary, {}, { freeCashflow: -10 }, income, []);
    expect(withoutDrivers.eligible).toBe(false);
    expect(withoutDrivers.cohortReasons).toContain("fcf-non-positive");
    const withDrivers = aggregateDCFInputs(summary, {}, {
      freeCashflow: -10,
      annualBalanceSheet: [{ date: "2023-12-31", totalEquity: 100, totalDebt: 20, cash: 10 }],
    }, income, []);
    expect(withDrivers).toMatchObject({ projectionMethod: "driver-fcff", cohort: "growth-fcff", eligible: true });
  });

  test("driver sensitivity center matches the base valuation and MC is deterministic", () => {
    const params = aggregateDCFInputs(
      { marketCap: 1_000, currentPrice: 10, sharesOutstanding: 100, beta: 1, sector: "Technology" },
      {},
      { freeCashflow: 10, annualBalanceSheet: [{ date: "2023-12-31", totalEquity: 100, totalDebt: 20, cash: 10 }] },
      [{ date: "2022-12-31", totalRevenue: 100, operatingIncome: 10 }, { date: "2023-12-31", totalRevenue: 130, operatingIncome: 15 }],
      [],
    );
    const base = projectValuation(params).fairValue;
    const sensitivity = buildSensitivity(params);
    expect(sensitivity.values[10][10]).toBeCloseTo(base, 10);
    const rng = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const first = monteCarlo(params, 20, rng(7));
    const second = monteCarlo(params, 20, rng(7));
    expect(second).toEqual(first);
    expect(first.histogram.reduce((sum, bin) => sum + bin.count, 0)).toBe(first.iterations);
    expect([first.bear, first.base, first.bull].every(Number.isFinite)).toBe(true);
  });

  test("builds recency-aware candidate drivers without changing production aggregation", () => {
    const income = [
      { date: "2020-12-31", totalRevenue: 100, operatingIncome: 10 },
      { date: "2021-12-31", totalRevenue: 110, operatingIncome: 11 },
      { date: "2022-12-31", totalRevenue: 115, operatingIncome: 23 },
      { date: "2023-12-31", totalRevenue: 140, operatingIncome: 42 },
    ];
    const balance = [{ date: "2023-12-31", totalEquity: 100, totalDebt: 20, cash: 10 }];
    const production = aggregateDCFInputs(
      { marketCap: 1_000, currentPrice: 10, sharesOutstanding: 100, beta: 1, sector: "Technology" },
      {},
      { freeCashflow: -10, annualBalanceSheet: balance },
      income,
      [],
    );
    const candidate = buildCandidateDriverInputs(income, balance, production.terminalGrowth, production.taxRate);
    expect(production.drivers.initialGrowth).toBeCloseTo(140 / 115 - 1, 12);
    expect(candidate.initialGrowth).toBeCloseTo(0.1, 12);
    expect(candidate.targetMargin).toBeCloseTo(0.2, 12);
    expect(production.drivers.targetMargin).toBeCloseTo(0.15, 12);
    expect(production.drivers.initialGrowth).not.toBe(candidate.initialGrowth);
  });

  test("honors non-10-year driver horizons and terminal discount", () => {
    const projection = projectDriverFCFF(
      { latestRevenue: 100, initialGrowth: 0.2, startingMargin: 0.1, targetMargin: 0.2, normalizedTaxRate: 0.2, salesToCapitalRatio: 2 },
      0.025,
      0.1,
      0,
      0,
      10,
      3,
    );
    expect(projection.annualSchedule).toHaveLength(3);
    expect(projection.terminal.year).toBe(4);
    expect(projection.pvTerminalValue).toBeCloseTo(projection.terminalValue / 1.1 ** 3, 12);
  });
});
