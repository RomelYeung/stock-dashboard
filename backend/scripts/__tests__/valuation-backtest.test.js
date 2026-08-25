import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqualWithNumericTolerance, runDriverFCFFBacktest, runResidualIncomeBacktest, runValuationBacktest, validateReplayRow } from "../valuation-backtest.js";

const fixturePath = resolve(process.cwd(), "scripts/fixtures/valuation-backtest.sample.json");
const scriptPath = resolve(process.cwd(), "scripts/valuation-backtest.js");
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const baselineFixturePath = resolve(process.cwd(), "scripts/fixtures/valuation-baseline-v1.json");
const baselineFixture = JSON.parse(readFileSync(baselineFixturePath, "utf8"));
const driverFixturePath = resolve(process.cwd(), "scripts/fixtures/valuation-baseline-driver-v2.json");
const driverFixture = JSON.parse(readFileSync(driverFixturePath, "utf8"));

function bankRow(observations, overrides = {}) {
  return {
    ticker: "BNK",
    asOfDate: "2022-11-01T20:00:00.000Z",
    outcomeDate: "2023-11-01T20:00:00.000Z",
    capturedAt: "2022-11-01T20:00:00.000Z",
    priceBasis: "split-adjusted",
    asOfPrice: 10,
    outcomePrice: 12,
    riskFreeRate: 0.04,
    summary: { sector: "Financial Services", industry: "Banks - Diversified", sharesOutstanding: 10, beta: 1 },
    financials: { availableDate: "2022-10-01T16:00:00.000Z" },
    balanceSheet: { availableDate: "2022-10-01T16:00:00.000Z", commonEquity: 100, shareBasis: "point-in-time" },
    annualIncome: observations.map(([date, commonNetIncome, commonDividends]) => ({ date, periodEnd: date, availableDate: "2022-10-01T16:00:00.000Z", commonNetIncome, commonDividends })),
    annualCashFlow: observations.map(([date]) => ({ date, periodEnd: date, availableDate: "2022-10-01T16:00:00.000Z" })),
    ...overrides,
  };
}

test("replays all four synthetic cohorts", () => {
  const result = runValuationBacktest(fixture);
  expect(result.records.map(({ cohort, status }) => ({ cohort, status }))).toEqual([
    { cohort: "bank-insurer", status: "unvalued" },
    { cohort: "mature-fcff", status: "valued" },
    { cohort: "growth-fcff", status: "valued" },
    { cohort: "unsupported", status: "unvalued" },
  ]);
});

test("rejects statement availability after as-of even when its period is earlier", () => {
  const row = structuredClone(fixture[1]);
  row.annualIncome[0].availableDate = "2023-01-02";
  expect(validateReplayRow(row)).toContain("annualIncome-available-after-as-of");
  expect(runValuationBacktest([row]).records[0].status).toBe("invalid");
});

test("validates availability dates for nested annual balance-sheet records", () => {
  const row = structuredClone(fixture[1]);
  row.balanceSheet.annualBalanceSheet = [{
    date: "2021-12-31",
    availableDate: "2023-01-02",
    totalEquity: 100,
    totalDebt: 20,
    cash: 10,
  }];
  expect(validateReplayRow(row)).toContain("annualBalanceSheet-available-after-as-of");
  expect(runValuationBacktest([row]).records[0].status).toBe("invalid");
});

test("requires a finite historical risk-free rate in the DCF domain", () => {
  for (const riskFreeRate of [undefined, Number.NaN, -0.01, 0.21]) {
    const row = structuredClone(fixture[1]);
    row.riskFreeRate = riskFreeRate;
    expect(validateReplayRow(row)).toContain("risk-free-rate-invalid");
    expect(runValuationBacktest([row]).records[0].status).toBe("invalid");
  }
});

test("computes return, error, hit, and cohort summary metrics", () => {
  const record = runValuationBacktest([fixture[1]]).records[0];
  expect(record.absolutePercentageError).toBeCloseTo(Math.abs(record.fairValue / fixture[1].outcomePrice - 1));
  expect(record.predictedReturn).toBeCloseTo(record.fairValue / fixture[1].asOfPrice - 1);
  expect(record.realizedReturn).toBeCloseTo(fixture[1].outcomePrice / fixture[1].asOfPrice - 1);
  expect(record.directionalHit).toBe(false);
  expect(runValuationBacktest([fixture[1]]).summary["mature-fcff"]).toMatchObject({
    total: 1,
    valued: 1,
    medianAbsolutePercentageError: record.absolutePercentageError,
    directionalAccuracy: 0,
  });
});

test("imports without running the CLI", () => {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `import(${JSON.stringify(scriptPath)})`], {
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("");
});

test("CLI exits nonzero for malformed JSON", () => {
  const tempDir = mkdtempSync(resolve(tmpdir(), "valuation-backtest-"));
  const malformedPath = resolve(tempDir, "malformed.json");
  writeFileSync(malformedPath, "not-json");
  try {
    const result = spawnSync(process.execPath, [scriptPath, malformedPath], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CLI exits nonzero when well-formed JSON contains an invalid row", () => {
  const tempDir = mkdtempSync(resolve(tmpdir(), "valuation-backtest-"));
  const invalidPath = resolve(tempDir, "invalid.json");
  const row = structuredClone(fixture[1]);
  row.riskFreeRate = 0.21;
  writeFileSync(invalidPath, JSON.stringify([row]));
  try {
    const result = spawnSync(process.execPath, [scriptPath, invalidPath], { encoding: "utf8" });
    expect(result.status).not.toBe(0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("finite-fade residual income matches the hand-computed five-year discount", () => {
  const row = bankRow([["2020-12-31", 10, 5], ["2021-12-31", 10, 5], ["2022-09-30", 10, 5]]);
  const result = runResidualIncomeBacktest([row]).records[0];
  const ke = 0.04 + 1 * 0.0605;
  let book = 100;
  let pv = 0;
  for (let year = 1; year <= 5; year += 1) {
    const roe = ke + (0.1 - ke) * (1 - year / 6);
    const earnings = roe * book;
    pv += ((roe - ke) * book) / (1 + ke) ** year;
    book += earnings - 0.5 * earnings;
  }
  expect(result).toMatchObject({ status: "valued", modelId: "finite-fade-residual-income/v1", normalizedEarnings: 10, rawPayout: 0.5, payout: 0.5 });
  expect(result.endingBook).toBeCloseTo(book, 12);
  expect(result.fairValue).toBeCloseTo((100 + pv) / 10, 10);
});

test("uses positive-year payout while retaining negative common earnings", () => {
  const result = runResidualIncomeBacktest([bankRow([["2020-12-31", -10, 0], ["2021-12-31", 10, 5], ["2022-09-30", 20, 10]])]).records[0];
  expect(result).toMatchObject({ status: "valued", normalizedEarnings: 10, rawPayout: 0.5, payout: 0.5 });
});

test("returns valid unvalued for nonpositive normalized earnings and invalid for model fields", () => {
  expect(runResidualIncomeBacktest([bankRow([["2020-12-31", -10, 0], ["2021-12-31", -5, 0], ["2022-09-30", -1, 0]])]).records[0]).toMatchObject({ status: "unvalued", reasonCodes: ["normalized-common-earnings-non-positive"] });
  expect(runResidualIncomeBacktest([bankRow([["2020-12-31", 10, 5], ["2021-12-31", 10, 5], ["2022-09-30", 10, 5]], { balanceSheet: { availableDate: "2022-10-01T16:00:00.000Z", commonEquity: 0 } })]).records[0]).toMatchObject({ status: "invalid", reasonCodes: ["rim-common-equity-invalid"] });
  expect(runResidualIncomeBacktest([bankRow([["2020-12-31", 10, 5], ["2021-12-31", 10, ""], ["2022-09-30", 10, 5]])]).records[0]).toMatchObject({ status: "invalid", reasonCodes: ["rim-common-dividends-invalid"] });
  expect(runResidualIncomeBacktest([bankRow([["2020-12-31", 10, 5], ["2021-12-31", 10, 5], ["2022-09-30", 10, 5]], { summary: { sector: "Financial Services", industry: "Banks - Diversified", sharesOutstanding: 10, beta: null } })]).records[0]).toMatchObject({ status: "invalid", reasonCodes: ["rim-beta-invalid"] });
});

test("sorts observations, rejects duplicate periods, and ignores outcome leakage", () => {
  const row = bankRow([["2022-09-30", 10, 5], ["2020-12-31", 10, 5], ["2021-12-31", 10, 5]]);
  const first = runResidualIncomeBacktest([row]).records[0];
  expect(first.selectedPeriods).toEqual(["2020-12-31", "2021-12-31", "2022-09-30"]);
  const duplicate = runResidualIncomeBacktest([bankRow([["2020-12-31", 10, 5], ["2020-12-31", 10, 5], ["2022-09-30", 10, 5]])]).records[0];
  expect(duplicate).toMatchObject({ status: "invalid", reasonCodes: ["rim-observations-period-duplicate"] });
  const changed = structuredClone(row); changed.outcomePrice = 999; changed.outcomeDate = "2023-11-02T20:00:00.000Z";
  expect(runResidualIncomeBacktest([changed]).records[0].fairValue).toBe(first.fairValue);
});

test("nonbank candidate records remain exactly the default replay", () => {
  const defaults = runValuationBacktest(baselineFixture).records;
  const candidate = runResidualIncomeBacktest(baselineFixture).records;
  for (let index = 0; index < baselineFixture.length; index += 1) {
    if (defaults[index].cohort !== "bank-insurer") expect(candidate[index]).toEqual(defaults[index]);
  }
  expect(candidate.filter((record) => record.cohort === "bank-insurer" && record.status === "valued")).toHaveLength(8);
});

test("driver-FCFF v2 compares only actual driver rows and preserves scalar AAPL", () => {
  const defaults = runValuationBacktest(driverFixture).records;
  const candidate = runDriverFCFFBacktest(driverFixture);
  expect(candidate.driverFCFFTargetIndexes.map((index) => defaults[index].ticker)).toEqual(["MSFT", "NVDA", "TSLA", "GOOGL", "META", "AMD", "CRM"]);
  expect(candidate.driverFCFFTargetIndexes).toHaveLength(7);
  expect(candidate.records.find(({ ticker }) => ticker === "AAPL")).toEqual(defaults.find(({ ticker }) => ticker === "AAPL"));
  expect(candidate.records.filter(({ projectionMethod }) => projectionMethod === "driver-fcff")).toHaveLength(7);
});

test("explicit fixed roster can target a scalar-selected row", () => {
  const defaults = runValuationBacktest(driverFixture).records;
  const aaplIndex = driverFixture.rows.findIndex(({ ticker }) => ticker === "AAPL");
  const candidate = runDriverFCFFBacktest(driverFixture, { targetTickers: ["AAPL"] });
  expect(defaults[aaplIndex].projectionMethod).toBeUndefined();
  expect(candidate.driverFCFFTargetIndexes).toEqual([aaplIndex]);
  expect(candidate.records[aaplIndex]).toMatchObject({ ticker: "AAPL", status: "valued", projectionMethod: "driver-fcff", projectionYears: 10, driverScheduleYears: 10 });
  expect(candidate.targeting).toEqual({ mode: "explicit-fixed-roster", scope: "harness-only", productionSelector: false, tickers: ["AAPL"] });
});

test("explicit fixed roster fails when a requested row cannot make a candidate", () => {
  const row = structuredClone(driverFixture.rows.find(({ ticker }) => ticker === "AAPL"));
  row.annualIncome = [];
  expect(() => runDriverFCFFBacktest({ format: "valuation-backtest-fixture/v2", version: 2, rows: [row] }, { targetTickers: ["AAPL"] }))
    .toThrow("driver-candidate-growth-unavailable");
});

test("fails closed when no actual driver-FCFF cohort exists", () => {
  expect(() => runDriverFCFFBacktest(baselineFixture)).toThrow("at least one default driver-fcff row");
});

test("fails closed when a v2 fixture contains only a scalar growth target", () => {
  const row = structuredClone(driverFixture.rows.find(({ ticker }) => ticker === "AAPL"));
  row.balanceSheet.annualBalanceSheet = row.balanceSheet.annualBalanceSheet.slice();
  expect(() => runDriverFCFFBacktest({ format: "valuation-backtest-fixture/v2", version: 2, rows: [row] }))
    .toThrow("at least one default driver-fcff row");
});

test("baseline replay comparison tolerates floating-point noise but rejects material drift", () => {
  const baseline = { records: [{ fairValue: 160.0068300636548 }], summary: { valued: 1 } };
  expect(isDeepStrictEqualWithNumericTolerance(baseline, { records: [{ fairValue: 160.00683006365483 }], summary: { valued: 1 } })).toBe(true);
  expect(isDeepStrictEqualWithNumericTolerance(baseline, { records: [{ fairValue: 160.006831 }], summary: { valued: 1 } })).toBe(false);
});

test("pinned comparison CLI writes once and refuses overwrite", () => {
  const baselinePath = resolve(process.cwd(), "scripts/results/valuation-baseline-v1.json");
  const tempDir = mkdtempSync(resolve(tmpdir(), "valuation-rim-"));
  const output = resolve(tempDir, "comparison.json");
  try {
    const args = [scriptPath, baselineFixturePath, "--residual-income", "--baseline-results", baselinePath, "--output", output];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(first.status).toBe(0);
    const comparison = JSON.parse(readFileSync(output, "utf8"));
    expect(comparison).toMatchObject({ format: "valuation-backtest-comparison/v1", model: { modelId: "finite-fade-residual-income/v1", terminalValue: false }, fixture: { sha256: "81d02ad6427bceeac482873cae4a6febc28f313b6c3e7997327a9c3951882f70" }, baseline: { sha256: "73fdf3f80871c991ec26b171361800a23e6fe746cf39789995734e173d0c7043" } });
    expect(comparison.candidate.summary["bank-insurer"].coverage).toBe(1);
    expect(spawnSync(process.execPath, args, { encoding: "utf8" }).status).not.toBe(0);
    expect(existsSync(output)).toBe(true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("pinned driver-FCFF shadow CLI writes once and refuses overwrite", () => {
  const baselinePath = resolve(process.cwd(), "scripts/results/valuation-baseline-driver-v2.json");
  const tempDir = mkdtempSync(resolve(tmpdir(), "valuation-driver-fcff-"));
  const output = resolve(tempDir, "comparison.json");
  try {
    const args = [scriptPath, driverFixturePath, "--driver-fcff-v2", "--baseline-results", baselinePath, "--output", output];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    expect(first.status).toBe(0);
    const comparison = JSON.parse(readFileSync(output, "utf8"));
    expect(comparison.driverFCFFCohort).toMatchObject({
      count: 7,
      tickers: ["MSFT", "NVDA", "TSLA", "GOOGL", "META", "AMD", "CRM"],
    });
    expect(comparison.growthDifferences).toHaveLength(7);
    expect(comparison.growthDifferences.some(({ ticker }) => ticker === "AAPL")).toBe(false);
    expect(comparison.driverFCFFCohort.baselineSummary.total).toBe(7);
    expect(comparison.comparisons["growth-fcff"].medianAbsolutePercentageError.baseline)
      .toBe(comparison.driverFCFFCohort.baselineSummary.medianAbsolutePercentageError);
    expect(comparison.comparisons["growth-fcff"].medianAbsolutePercentageError.baseline)
      .not.toBe(comparison.baseline.summary["growth-fcff"].medianAbsolutePercentageError);
    expect(comparison.comparisons["growth-fcff"].coverage).toEqual({ baseline: 1, candidate: 1, delta: 0 });
    expect(comparison.candidate.records.find(({ ticker }) => ticker === "AAPL"))
      .toEqual(runValuationBacktest(driverFixture).records.find(({ ticker }) => ticker === "AAPL"));
    expect(spawnSync(process.execPath, args, { encoding: "utf8" }).status).not.toBe(0);
    expect(existsSync(output)).toBe(true);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
