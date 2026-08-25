import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { basename } from "node:path";
import { aggregateDCFInputs, buildCandidateDriverInputs, projectValuation } from "../services/dcf.js";

const COHORTS = ["bank-insurer", "mature-fcff", "growth-fcff", "unsupported"];
const DAY_MS = 24 * 60 * 60 * 1000;
const RESIDUAL_INCOME_CONFIG = {
  modelId: "finite-fade-residual-income/v1",
  years: 5,
  erp: 0.0605,
  sourceDate: "2022-09-23",
  publicationDate: "2022-09-26",
  sourceUrl: "https://aswathdamodaran.blogspot.com/2022/09/",
  fixtureSha256: "81d02ad6427bceeac482873cae4a6febc28f313b6c3e7997327a9c3951882f70",
  baselineResultsSha256: "73fdf3f80871c991ec26b171361800a23e6fe746cf39789995734e173d0c7043",
};
const DRIVER_FCFF_CONFIG = {
  modelId: "driver-fcff/v2-shadow",
  years: 10,
  fixtureSha256: "0e8698b047a59c9dcc6d7b06e48290a1e4f9407c77dfa0b5950aea9e9947334f",
  baselineResultsSha256: "d8d001356c8c425e992f6e9dfd5fb25bbf74878ed56bab67e47efdd01f2815ba",
};
const RIM_WARNINGS = [
  "Historical beginning-book values unavailable; clean-surplus is approximate.",
  "Insurer GAAP equity lacks statutory surplus, reserve, and embedded-value inputs.",
  "Experimental harness comparison only; no production or dashboard behavior.",
];

function finitePositive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function finiteValue(value) {
  return value != null && !(typeof value === "string" && !value.trim()) && Number.isFinite(Number(value));
}

function dateMs(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function statementRecords(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function validateStatements(row, asOfMs) {
  const reasons = [];
  for (const [name, value] of [
    ["financials", row.financials],
    ["balanceSheet", row.balanceSheet],
    ["annualIncome", row.annualIncome],
    ["annualCashFlow", row.annualCashFlow],
    ["annualBalanceSheet", row.balanceSheet?.annualBalanceSheet],
  ]) {
    for (const record of statementRecords(value)) {
      if (!record || typeof record !== "object") {
        reasons.push(`${name}-malformed`);
        continue;
      }
      const availableMs = dateMs(record.availableDate);
      if (availableMs == null) reasons.push(`${name}-missing-available-date`);
      else if (availableMs > asOfMs) reasons.push(`${name}-available-after-as-of`);

      for (const key of ["date", "period", "periodEnd", "endDate", "fiscalDateEnding"]) {
        if (record[key] == null) continue;
        const periodMs = dateMs(record[key]);
        if (periodMs == null) reasons.push(`${name}-invalid-period-date`);
        else if (periodMs > asOfMs) reasons.push(`${name}-period-after-as-of`);
      }
    }
  }
  return reasons;
}

function validateReplayRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return ["row-malformed"];
  const reasons = [];
  const asOfMs = dateMs(row.asOfDate);
  const outcomeMs = dateMs(row.outcomeDate);
  const capturedMs = dateMs(row.capturedAt);
  if (asOfMs == null) reasons.push("invalid-as-of-date");
  if (outcomeMs == null) reasons.push("invalid-outcome-date");
  if (capturedMs == null) reasons.push("invalid-captured-at");
  if (capturedMs != null && asOfMs != null && capturedMs > asOfMs) reasons.push("captured-after-as-of");
  if (row.priceBasis !== "split-adjusted") reasons.push("price-basis-not-split-adjusted");
  if (!finitePositive(row.asOfPrice)) reasons.push("as-of-price-invalid");
  if (!finitePositive(row.outcomePrice)) reasons.push("outcome-price-invalid");
  if (!(Number.isFinite(row.riskFreeRate) && row.riskFreeRate >= 0 && row.riskFreeRate <= 0.20)) {
    reasons.push("risk-free-rate-invalid");
  }
  if (asOfMs != null && outcomeMs != null) {
    const horizonDays = (outcomeMs - asOfMs) / DAY_MS;
    if (Math.abs(horizonDays - 365) > 7) reasons.push("outcome-horizon-not-one-year");
  }
  if (asOfMs != null) reasons.push(...validateStatements(row, asOfMs));
  return [...new Set(reasons)];
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function emptySummary() {
  return Object.fromEntries(COHORTS.map((cohort) => [cohort, {
    total: 0,
    coverage: null,
    valued: 0,
    unvalued: 0,
    invalid: 0,
    medianAbsolutePercentageError: null,
    directionalAccuracy: null,
  }]));
}

function summarizeBacktest(records) {
  const summary = emptySummary();
  for (const record of records) {
    const bucket = summary[record.cohort];
    bucket.total += 1;
    if (record.status === "valued") bucket.valued += 1;
    if (record.status === "unvalued") bucket.unvalued += 1;
    if (record.status === "invalid") bucket.invalid += 1;
  }

  for (const cohort of Object.keys(summary)) {
    const valued = records.filter((record) => record.cohort === cohort && record.status === "valued");
    summary[cohort].medianAbsolutePercentageError = median(
      valued.map((record) => record.absolutePercentageError).filter(Number.isFinite),
    );
    summary[cohort].directionalAccuracy = valued.length
      ? valued.filter((record) => record.directionalHit).length / valued.length
      : null;
    summary[cohort].coverage = summary[cohort].total
      ? summary[cohort].valued / summary[cohort].total
      : null;
  }
  return summary;
}

function getAggregateForRow(row) {
  try {
    return aggregateDCFInputs(
      row.summary || {},
      row.financials || {},
      row.balanceSheet || {},
      row.annualIncome || [],
      row.annualCashFlow || [],
      { riskFreeRate: row.riskFreeRate },
    );
  } catch {
    return null;
  }
}

function getCandidateAggregateForRow(row) {
  const params = getAggregateForRow(row);
  if (!params || row?.expectedCohort !== "growth-fcff") return params;
  const drivers = buildCandidateDriverInputs(
    row.annualIncome || [],
    row.balanceSheet?.annualBalanceSheet || [],
    params.terminalGrowth,
    params.taxRate,
  );
  return {
    ...params,
    cohort: "growth-fcff",
    drivers,
    projectionMethod: "driver-fcff",
    projectionYears: 10,
    projectionGrowth: drivers.initialGrowth,
    eligible: drivers.eligible,
  };
}

function isDriverFCFFV2Fixture(input) {
  return input && !Array.isArray(input)
    && (input.format === "valuation-backtest-fixture/v2" || input.version === 2);
}

function driverFCFFV2DefaultReason(params) {
  if (!params) return "aggregate-inputs-unavailable";
  if (params.projectionMethod !== "driver-fcff") return `projection-method-${params.projectionMethod || "missing"}`;
  if (!params.drivers?.eligible) return "driver-inputs-ineligible";
  if (params.projectionYears !== 10) return `projection-years-${params.projectionYears ?? "missing"}`;
  if (!Array.isArray(params.drivers.annualSchedule) || params.drivers.annualSchedule.length !== 10) {
    return "driver-schedule-not-exactly-10-years";
  }
  return null;
}

function assertDriverFCFFV2DefaultReplay(input, rows) {
  if (!isDriverFCFFV2Fixture(input)) return;
  for (const row of rows) {
    if (row?.expectedCohort !== "growth-fcff") continue;
    if (getAggregateForRow(row)?.projectionMethod !== "driver-fcff") continue;
    const reason = driverFCFFV2DefaultReason(getAggregateForRow(row));
    if (reason) throw new Error(`Driver-FCFF v2 default replay rejected for ${row.ticker || "unknown"}: ${reason}`);
  }
}

function driverFCFFTargetIndexes(rows, defaults) {
  return rows.map((row, index) => ({ row, index, params: getAggregateForRow(row), record: defaults[index] }))
    .filter(({ params, record }) => record.cohort === "growth-fcff" && params?.projectionMethod === "driver-fcff")
    .map(({ index }) => index);
}

function explicitDriverFCFFTargetIndexes(rows, targetTickers) {
  if (!Array.isArray(targetTickers) || !targetTickers.length || targetTickers.some((ticker) => typeof ticker !== "string" || !ticker.trim())) {
    throw new Error("Explicit driver-FCFF target roster must contain one or more ticker symbols");
  }
  if (new Set(targetTickers).size !== targetTickers.length) throw new Error("Explicit driver-FCFF target roster contains duplicate tickers");
  return targetTickers.map((ticker) => {
    const matches = rows.map((row, index) => row?.ticker === ticker ? index : -1).filter((index) => index >= 0);
    if (matches.length !== 1) throw new Error(`Explicit driver-FCFF target ticker ${ticker} must resolve to exactly one row`);
    return matches[0];
  });
}

function evaluateReplayRow(row, paramsOverride = null) {
  const validationReasons = validateReplayRow(row);
  const params = paramsOverride || getAggregateForRow(row);
  const cohort = row?.expectedCohort || params?.cohort || "unsupported";
  if (validationReasons.length) {
    return {
      ticker: row?.ticker || null,
      asOfDate: row?.asOfDate || null,
      outcomeDate: row?.outcomeDate || null,
      cohort,
      status: "invalid",
      reasonCodes: validationReasons,
    };
  }

  if (cohort === "bank-insurer" || cohort === "unsupported") {
    const reasonCodes = params?.cohortReasons || ["unsupported-cohort"];
    return {
      ticker: row.ticker,
      asOfDate: row.asOfDate,
      outcomeDate: row.outcomeDate,
      cohort,
      status: "unvalued",
      reasonCodes,
    };
  }

  const valuation = projectValuation(params);
  if (!Number.isFinite(valuation.fairValue)) {
    return {
      ticker: row.ticker,
      asOfDate: row.asOfDate,
      outcomeDate: row.outcomeDate,
      cohort,
      status: "invalid",
      reasonCodes: ["fair-value-non-finite"],
    };
  }

  const predictedReturn = valuation.fairValue / Number(row.asOfPrice) - 1;
  const realizedReturn = Number(row.outcomePrice) / Number(row.asOfPrice) - 1;
  const absolutePercentageError = Math.abs(valuation.fairValue / Number(row.outcomePrice) - 1);
  const directionalHit = Math.sign(predictedReturn) === Math.sign(realizedReturn);
  return {
    ticker: row.ticker,
    asOfDate: row.asOfDate,
    outcomeDate: row.outcomeDate,
    cohort,
    status: "valued",
    reasonCodes: [],
    fairValue: valuation.fairValue,
    predictedReturn,
    realizedReturn,
    absolutePercentageError,
    directionalHit,
  };
}

function rimRecordBase(row, status, reasonCodes) {
  return { ticker: row?.ticker || null, asOfDate: row?.asOfDate || null, outcomeDate: row?.outcomeDate || null, cohort: "bank-insurer", status, reasonCodes };
}

function rimInvalid(row, reason, extra = {}) {
  return { ...rimRecordBase(row, "invalid", [reason]), ...extra };
}

function runResidualIncomeRow(row) {
  const validationReasons = validateReplayRow(row);
  if (validationReasons.length) return rimRecordBase(row, "invalid", validationReasons);
  const B0 = Number(row.balanceSheet?.commonEquity);
  const shares = Number(row.summary?.sharesOutstanding);
  const beta = Number(row.summary?.beta);
  const riskFreeRate = Number(row.riskFreeRate);
  if (!finiteValue(row.balanceSheet?.commonEquity) || !(B0 > 0)) return rimInvalid(row, "rim-common-equity-invalid");
  if (!finiteValue(row.summary?.sharesOutstanding) || !(shares > 0)) return rimInvalid(row, "rim-shares-invalid");
  if (!finiteValue(row.summary?.beta)) return rimInvalid(row, "rim-beta-invalid");
  if (!finiteValue(row.riskFreeRate)) return rimInvalid(row, "rim-risk-free-rate-invalid");

  const observations = (Array.isArray(row.annualIncome) ? row.annualIncome : [])
    .filter((record) => record && (record.commonNetIncome != null || record.commonDividends != null))
    .sort((a, b) => dateMs(a.periodEnd || a.date) - dateMs(b.periodEnd || b.date))
    .slice(-3);
  if (observations.length !== 3) return rimInvalid(row, "rim-observations-insufficient");
  const periods = observations.map((record) => record.periodEnd || record.date);
  if (periods.some((period) => dateMs(period) == null)) return rimInvalid(row, "rim-observations-period-invalid");
  if (new Set(periods.map((period) => dateMs(period))).size !== 3) return rimInvalid(row, "rim-observations-period-duplicate");
  if (observations.some((record) => !finiteValue(record.commonNetIncome))) return rimInvalid(row, "rim-common-net-income-invalid", { selectedPeriods: periods });
  if (observations.some((record) => !finiteValue(record.commonDividends) || Number(record.commonDividends) < 0)) return rimInvalid(row, "rim-common-dividends-invalid", { selectedPeriods: periods });

  const normalizedEarnings = median(observations.map((record) => Number(record.commonNetIncome)));
  const normalizedROE = normalizedEarnings / B0;
  if (!(Number.isFinite(normalizedEarnings) && normalizedEarnings > 0)) {
    return { ...rimRecordBase(row, "unvalued", ["normalized-common-earnings-non-positive"]), selectedPeriods: periods, normalizedEarnings, normalizedROE, rawPayout: null, payout: null, shareBasis: row.balanceSheet?.shareBasis || null };
  }
  const payoutObservations = observations
    .filter((record) => Number(record.commonNetIncome) > 0)
    .map((record) => Number(record.commonDividends) / Number(record.commonNetIncome));
  if (!payoutObservations.length) return rimInvalid(row, "rim-payout-unavailable", { selectedPeriods: periods, normalizedEarnings, normalizedROE });
  const rawPayout = median(payoutObservations);
  const payout = Math.min(1, Math.max(0, rawPayout));
  const ke = riskFreeRate + beta * RESIDUAL_INCOME_CONFIG.erp;
  if (!(Number.isFinite(ke) && ke > 0)) return rimInvalid(row, "rim-ke-invalid", { selectedPeriods: periods, normalizedEarnings, normalizedROE, rawPayout, payout });
  const base = { selectedPeriods: periods, normalizedEarnings, normalizedROE, rawPayout, payout, ke, erp: RESIDUAL_INCOME_CONFIG.erp, B0, shares, shareBasis: row.balanceSheet?.shareBasis || null };
  let beginBook = B0;
  let pvResidualIncome = 0;
  let endingBook = B0;
  for (let year = 1; year <= RESIDUAL_INCOME_CONFIG.years; year += 1) {
    if (!(Number.isFinite(beginBook) && beginBook > 0)) return rimInvalid(row, "rim-book-value-invalid", base);
    const roe = ke + (normalizedROE - ke) * (1 - year / (RESIDUAL_INCOME_CONFIG.years + 1));
    const earnings = roe * beginBook;
    const dividends = payout * earnings;
    const residualIncome = (roe - ke) * beginBook;
    const pv = residualIncome / (1 + ke) ** year;
    endingBook = beginBook + earnings - dividends;
    if (![roe, earnings, dividends, residualIncome, pv, endingBook].every(Number.isFinite) || !(endingBook > 0)) return rimInvalid(row, "rim-intermediate-invalid", base);
    pvResidualIncome += pv;
    beginBook = endingBook;
  }
  const equityValue = B0 + pvResidualIncome;
  const fairValue = equityValue / shares;
  if (![pvResidualIncome, endingBook, equityValue, fairValue].every(Number.isFinite) || !(fairValue > 0)) return rimInvalid(row, "rim-fair-value-invalid", base);
  const predictedReturn = fairValue / Number(row.asOfPrice) - 1;
  const realizedReturn = Number(row.outcomePrice) / Number(row.asOfPrice) - 1;
  const warnings = [...RIM_WARNINGS.slice(0, 2)];
  if (/insurance|insurer/i.test(`${row.summary?.sector || ""} ${row.summary?.industry || ""}`)) warnings.push("Experimental insurer RIM: GAAP equity is used as a proxy.");
  return {
    ...rimRecordBase(row, "valued", []),
    fairValue,
    equityValue,
    predictedReturn,
    realizedReturn,
    absolutePercentageError: Math.abs(fairValue / Number(row.outcomePrice) - 1),
    directionalHit: Math.sign(predictedReturn) === Math.sign(realizedReturn),
    modelId: RESIDUAL_INCOME_CONFIG.modelId,
    ...base,
    pvResidualIncome,
    endingBook,
    warnings,
  };
}

function runResidualIncomeBacktest(input) {
  const rows = normalizeRows(input);
  const defaults = rows.map((row) => evaluateReplayRow(row));
  const records = rows.map((row, index) => defaults[index].cohort === "bank-insurer" ? runResidualIncomeRow(row) : defaults[index]);
  return { records, summary: summarizeBacktest(records) };
}

function runDriverFCFFBacktest(input, options = {}) {
  const rows = normalizeRows(input);
  const defaults = rows.map((row) => evaluateReplayRow(row));
  assertDriverFCFFV2DefaultReplay(input, rows);
  const hasExplicitRoster = Array.isArray(options) || Object.prototype.hasOwnProperty.call(options, "targetTickers");
  const targetTickers = Array.isArray(options) ? options : options.targetTickers;
  const targetIndexes = hasExplicitRoster
    ? explicitDriverFCFFTargetIndexes(rows, targetTickers)
    : driverFCFFTargetIndexes(rows, defaults);
  if (!targetIndexes.length) throw new Error("Driver-FCFF v2 comparison requires at least one default driver-fcff row");
  const targetSet = new Set(targetIndexes);
  const records = rows.map((row, index) => {
    if (!targetSet.has(index)) return defaults[index];
    const params = getCandidateAggregateForRow(row);
    if (!params || params.projectionMethod !== "driver-fcff" || params.projectionYears !== 10 || !params.drivers?.eligible) {
      throw new Error(`Driver-FCFF v2 candidate rejected for ${row.ticker || "unknown"}: driver-candidate-growth-unavailable`);
    }
    const valuation = projectValuation(params);
    if (!Array.isArray(valuation.annualSchedule) || valuation.annualSchedule.length !== 10) {
      throw new Error(`Driver-FCFF v2 candidate rejected for ${row.ticker || "unknown"}: driver-candidate-schedule-invalid`);
    }
    const record = evaluateReplayRow(row, params);
    if (record.status !== "valued") {
      throw new Error(`Driver-FCFF v2 candidate rejected for ${row.ticker || "unknown"}: ${record.reasonCodes?.[0] || "candidate-row-invalid"}`);
    }
    return { ...record, projectionMethod: params.projectionMethod, projectionYears: params.projectionYears, driverScheduleYears: valuation.annualSchedule.length };
  });
  return {
    records,
    summary: summarizeBacktest(records),
    driverFCFFTargetIndexes: targetIndexes,
    ...(hasExplicitRoster ? {
      targeting: {
        mode: "explicit-fixed-roster",
        scope: "harness-only",
        productionSelector: false,
        tickers: [...targetTickers],
      },
    } : {}),
  };
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function comparisonArgs(args, requiredMode) {
  const positional = [];
  const modes = ["--residual-income", "--driver-fcff-v2"];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (modes.includes(arg)) continue;
    if (arg === "--baseline-results" || arg === "--output") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) throw new Error(`Unknown comparison option: ${arg}`);
    positional.push(arg);
  }
  if (positional.length !== 1 || args.filter((arg) => modes.includes(arg)).length !== 1 || !args.includes(requiredMode)) {
    throw new Error(`${requiredMode} mode requires one fixture and ${requiredMode}`);
  }
  const valueFor = (flag) => {
    const indexes = args.reduce((list, arg, index) => arg === flag ? [...list, index] : list, []);
    if (indexes.length !== 1 || !args[indexes[0] + 1] || args[indexes[0] + 1].startsWith("--")) throw new Error(`Comparison mode requires exactly one ${flag} value`);
    return args[indexes[0] + 1];
  };
  return { fixturePath: positional[0], baselinePath: valueFor("--baseline-results"), outputPath: valueFor("--output") };
}

function compareMetric(baseline, candidate) {
  return { baseline, candidate, delta: baseline == null || candidate == null ? null : candidate - baseline };
}

function isDeepStrictEqualWithNumericTolerance(expected, actual, tolerance = 1e-12) {
  if (Object.is(expected, actual)) return true;
  if (typeof expected === "number" && typeof actual === "number") {
    if (!Number.isFinite(expected) || !Number.isFinite(actual)) return false;
    const difference = Math.abs(expected - actual);
    return difference <= tolerance || difference <= tolerance * Math.max(Math.abs(expected), Math.abs(actual));
  }
  if (typeof expected !== typeof actual || expected == null || actual == null) return false;
  if (Array.isArray(expected) || Array.isArray(actual)) {
    return Array.isArray(expected) && Array.isArray(actual)
      && expected.length === actual.length
      && expected.every((value, index) => isDeepStrictEqualWithNumericTolerance(value, actual[index], tolerance));
  }
  if (typeof expected !== "object") return false;
  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  return expectedKeys.length === actualKeys.length
    && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(actual, key)
      && isDeepStrictEqualWithNumericTolerance(expected[key], actual[key], tolerance));
}

function runResidualIncomeComparison(args) {
  const { fixturePath, baselinePath, outputPath } = comparisonArgs(args, "--residual-income");
  const fixtureBytes = readFileSync(resolve(fixturePath));
  const baselineBytes = readFileSync(resolve(baselinePath));
  const fixtureHash = sha256Bytes(fixtureBytes);
  const baselineHash = sha256Bytes(baselineBytes);
  if (fixtureHash !== RESIDUAL_INCOME_CONFIG.fixtureSha256) throw new Error("Fixture SHA-256 pin mismatch");
  if (baselineHash !== RESIDUAL_INCOME_CONFIG.baselineResultsSha256) throw new Error("Baseline results SHA-256 pin mismatch");
  const fixture = JSON.parse(fixtureBytes.toString("utf8"));
  const baseline = JSON.parse(baselineBytes.toString("utf8"));
  if (baseline.fixtureSha256 !== RESIDUAL_INCOME_CONFIG.fixtureSha256) throw new Error("Baseline embedded fixture SHA-256 mismatch");
  const defaultReplay = runValuationBacktest(fixture);
  if (!isDeepStrictEqualWithNumericTolerance({ records: baseline.records, summary: baseline.summary }, defaultReplay)) throw new Error("Baseline replay metadata or records mismatch");
  const candidate = runResidualIncomeBacktest(fixture);
  const defaultRecords = defaultReplay.records;
  for (const [index, record] of candidate.records.entries()) {
    if (defaultRecords[index].cohort !== "bank-insurer" && !isDeepStrictEqual(record, defaultRecords[index])) throw new Error(`Nonbank candidate changed: ${record.ticker}`);
  }
  const bankRecords = candidate.records.filter((record) => record.cohort === "bank-insurer");
  if (bankRecords.length !== 8 || bankRecords.some((record) => record.status !== "valued")) throw new Error("Residual-income bank acceptance failed");
  if (candidate.records.some((record) => record.status === "invalid")) throw new Error("Residual-income candidate contains invalid records");
  const comparisons = Object.fromEntries(COHORTS.map((cohort) => [cohort, {
    coverage: compareMetric(baseline.summary[cohort].coverage, candidate.summary[cohort].coverage),
    medianAbsolutePercentageError: compareMetric(baseline.summary[cohort].medianAbsolutePercentageError, candidate.summary[cohort].medianAbsolutePercentageError),
    directionalAccuracy: compareMetric(baseline.summary[cohort].directionalAccuracy, candidate.summary[cohort].directionalAccuracy),
  }]));
  return {
    format: "valuation-backtest-comparison/v1",
    version: 1,
    generatedAt: new Date().toISOString(),
    model: { ...RESIDUAL_INCOME_CONFIG, terminalValue: false, carriedForwardToCutoff: true },
    fixture: { filename: basename(fixturePath), sha256: fixtureHash },
    baseline: { filename: basename(baselinePath), sha256: baselineHash, fixtureSha256: baseline.fixtureSha256, summary: baseline.summary },
    candidate: { records: candidate.records, summary: candidate.summary },
    comparisons,
    warnings: RIM_WARNINGS,
  };
}

function runDriverFCFFComparison(args) {
  const { fixturePath, baselinePath, outputPath } = comparisonArgs(args, "--driver-fcff-v2");
  const fixtureBytes = readFileSync(resolve(fixturePath));
  const baselineBytes = readFileSync(resolve(baselinePath));
  const fixtureHash = sha256Bytes(fixtureBytes);
  const baselineHash = sha256Bytes(baselineBytes);
  if (fixtureHash !== DRIVER_FCFF_CONFIG.fixtureSha256) throw new Error("Fixture SHA-256 pin mismatch");
  if (baselineHash !== DRIVER_FCFF_CONFIG.baselineResultsSha256) throw new Error("Baseline results SHA-256 pin mismatch");
  const fixture = JSON.parse(fixtureBytes.toString("utf8"));
  const baseline = JSON.parse(baselineBytes.toString("utf8"));
  if (baseline.fixtureSha256 !== DRIVER_FCFF_CONFIG.fixtureSha256) throw new Error("Baseline embedded fixture SHA-256 mismatch");
  const defaultReplay = runValuationBacktest(fixture);
  if (!isDeepStrictEqualWithNumericTolerance({ records: baseline.records, summary: baseline.summary }, defaultReplay)) throw new Error("Baseline replay metadata or records mismatch");
  const candidate = runDriverFCFFBacktest(fixture);
  const defaultRecords = defaultReplay.records;
  const targetIndexes = candidate.driverFCFFTargetIndexes;
  const targetSet = new Set(targetIndexes);
  for (const [index, record] of candidate.records.entries()) {
    if (!targetSet.has(index) && !isDeepStrictEqual(record, defaultRecords[index])) throw new Error(`Non-driver candidate changed: ${record.ticker}`);
  }
  const defaultGrowth = targetIndexes.map((index) => defaultRecords[index]);
  const candidateGrowth = targetIndexes.map((index) => candidate.records[index]);
  if (!targetIndexes.length
    || candidateGrowth.length !== defaultGrowth.length
    || candidateGrowth.some((record) => record.status === "invalid"
      || record.projectionMethod !== "driver-fcff"
      || record.projectionYears !== 10
      || record.driverScheduleYears !== 10)) {
    throw new Error("Driver-FCFF candidate cohort acceptance failed");
  }
  const driverBaselineSummary = summarizeBacktest(defaultGrowth)["growth-fcff"];
  const driverCandidateSummary = summarizeBacktest(candidateGrowth)["growth-fcff"];
  if (driverCandidateSummary.coverage !== driverBaselineSummary.coverage) throw new Error("Driver-FCFF candidate coverage changed");
  const comparisons = Object.fromEntries(COHORTS.map((cohort) => [cohort, {
    coverage: compareMetric(cohort === "growth-fcff" ? driverBaselineSummary.coverage : baseline.summary[cohort].coverage, cohort === "growth-fcff" ? driverCandidateSummary.coverage : candidate.summary[cohort].coverage),
    medianAbsolutePercentageError: compareMetric(cohort === "growth-fcff" ? driverBaselineSummary.medianAbsolutePercentageError : baseline.summary[cohort].medianAbsolutePercentageError, cohort === "growth-fcff" ? driverCandidateSummary.medianAbsolutePercentageError : candidate.summary[cohort].medianAbsolutePercentageError),
    directionalAccuracy: compareMetric(cohort === "growth-fcff" ? driverBaselineSummary.directionalAccuracy : baseline.summary[cohort].directionalAccuracy, cohort === "growth-fcff" ? driverCandidateSummary.directionalAccuracy : candidate.summary[cohort].directionalAccuracy),
  }]));
  const differences = defaultRecords.map((record, index) => {
    if (!targetSet.has(index)) return null;
    const candidateRecord = candidate.records[index];
    return {
      ticker: record.ticker,
      baselineFairValue: record.fairValue,
      candidateFairValue: candidateRecord.fairValue,
      fairValueDelta: candidateRecord.fairValue - record.fairValue,
      baselineAbsolutePercentageError: record.absolutePercentageError,
      candidateAbsolutePercentageError: candidateRecord.absolutePercentageError,
      absolutePercentageErrorDelta: candidateRecord.absolutePercentageError - record.absolutePercentageError,
      baselineDirectionalHit: record.directionalHit,
      candidateDirectionalHit: candidateRecord.directionalHit,
    };
  }).filter(Boolean);
  return {
    format: "valuation-backtest-comparison/v1",
    version: 1,
    generatedAt: new Date().toISOString(),
    model: { ...DRIVER_FCFF_CONFIG, terminalValue: true, carriedForwardToCutoff: true },
    fixture: { filename: basename(fixturePath), sha256: fixtureHash },
    baseline: { filename: basename(baselinePath), sha256: baselineHash, fixtureSha256: baseline.fixtureSha256, summary: baseline.summary },
    candidate: { records: candidate.records, summary: candidate.summary },
    comparisons,
    driverFCFFCohort: {
      count: targetIndexes.length,
      tickers: targetIndexes.map((index) => defaultRecords[index].ticker),
      baselineSummary: driverBaselineSummary,
      candidateSummary: driverCandidateSummary,
    },
    growthDifferences: differences,
    warnings: ["Candidate assumptions are shadow-only; production aggregateDCFInputs and routes are unchanged."],
  };
}

function normalizeRows(input) {
  if (Array.isArray(input)) return input;
  if (input && Array.isArray(input.rows)) return input.rows;
  throw new Error("Fixture must be an array or an object with a rows array");
}

function runValuationBacktest(input) {
  const rows = normalizeRows(input);
  const records = rows.map((row) => evaluateReplayRow(row));
  return {
    records,
    summary: summarizeBacktest(records),
  };
}

function main(args = process.argv.slice(2)) {
  if (args.includes("--residual-income")) {
    const comparison = runResidualIncomeComparison(args);
    const outputPath = comparisonArgs(args, "--residual-income").outputPath;
    writeFileSync(resolve(outputPath), `${JSON.stringify(comparison, null, 2)}\n`, { flag: "wx" });
    return 0;
  }
  if (args.includes("--driver-fcff-v2")) {
    const comparison = runDriverFCFFComparison(args);
    const outputPath = comparisonArgs(args, "--driver-fcff-v2").outputPath;
    writeFileSync(resolve(outputPath), `${JSON.stringify(comparison, null, 2)}\n`, { flag: "wx" });
    return 0;
  }
  const fixturePath = args.find((arg) => !arg.startsWith("--"));
  if (!fixturePath) throw new Error("Usage: node valuation-backtest.js <fixture.json> [--output <path>]");
  const input = JSON.parse(readFileSync(resolve(fixturePath), "utf8"));
  const result = runValuationBacktest(input);
  const outputIndex = args.indexOf("--output");
  const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath) writeFileSync(resolve(outputPath), serialized);
  else process.stdout.write(serialized);
  return result.records.some((record) => record.status === "invalid") ? 1 : 0;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

export {
  COHORTS,
  validateReplayRow,
  evaluateReplayRow,
  summarizeBacktest,
  runValuationBacktest,
  runResidualIncomeBacktest,
  runResidualIncomeComparison,
  runDriverFCFFBacktest,
  runDriverFCFFComparison,
  isDeepStrictEqualWithNumericTolerance,
  main,
};
