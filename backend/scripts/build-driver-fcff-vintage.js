import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { basename, dirname, resolve } from "node:path";
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ingestSnapshot } from "./ingest-valuation-fixture.js";
import { runDriverFCFFBacktest, runValuationBacktest } from "./valuation-backtest.js";

const ORDERED_TICKERS = ["MSFT", "NVDA", "TSLA", "GOOGL", "META", "AMD", "CRM"];
const ARCHIVE_NAME = /^sec-fsds-\d{4}q[1-4]\.zip$/;
const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COHORTS = ["bank-insurer", "mature-fcff", "growth-fcff", "unsupported"];

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function validateManifest(manifest) {
  if (manifest?.format !== "driver-fcff-vintage-manifest/v1" || manifest.version !== 1) throw new Error("Vintage manifest format is invalid");
  if (!/^driver-fcff-\d{4}-\d{2}-\d{2}$/.test(manifest.baselineId) || !/^\d{4}-\d{2}-\d{2}$/.test(manifest.asOfDate)) throw new Error("Vintage manifest identity is invalid");
  if (!manifest.classificationSource?.trim() || manifest.classificationEffectiveDate !== manifest.asOfDate) throw new Error("Vintage classification metadata is invalid");
  if (!manifest.archiveSha256 || typeof manifest.archiveSha256 !== "object") throw new Error("Vintage archive SHA pins are missing");
  for (const [archive, hash] of Object.entries(manifest.archiveSha256)) {
    if (!ARCHIVE_NAME.test(archive) || !SHA256.test(hash)) throw new Error(`Invalid archive SHA pin: ${archive}`);
  }
  if (!Array.isArray(manifest.rows) || manifest.rows.length !== ORDERED_TICKERS.length) throw new Error("Vintage manifest must contain seven rows");
  const tickers = manifest.rows.map((row) => row.ticker);
  if (JSON.stringify(tickers) !== JSON.stringify(ORDERED_TICKERS)) throw new Error(`Vintage cohort order must be ${ORDERED_TICKERS.join(",")}`);
  const accessions = new Set();
  for (const row of manifest.rows) {
    if (!row.ticker || !ACCESSION.test(row.accession) || !/^\d+$/.test(String(row.cik)) || accessions.has(row.accession)) throw new Error(`Invalid vintage source identity: ${row.ticker}`);
    if (row.cohort !== "growth-fcff" || !ARCHIVE_NAME.test(row.archive) || basename(row.archive) !== row.archive) throw new Error(`Invalid vintage cohort/source: ${row.ticker}`);
    if (!SHA256.test(manifest.archiveSha256[row.archive] || "")) throw new Error(`Missing archive SHA pin: ${row.archive}`);
    accessions.add(row.accession);
  }
  return manifest;
}

function archivePath(archiveDir, archive) {
  const path = resolve(archiveDir, archive);
  if (basename(path) !== archive || dirname(path) !== resolve(archiveDir)) throw new Error(`Unsafe archive path: ${archive}`);
  return path;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compareMetric(baseline, candidate) {
  return { baseline, candidate, delta: baseline == null || candidate == null ? null : candidate - baseline };
}

function summarizeRecords(records) {
  const summary = Object.fromEntries(COHORTS.map((cohort) => [cohort, {
    total: 0,
    coverage: null,
    valued: 0,
    unvalued: 0,
    invalid: 0,
    medianAbsolutePercentageError: null,
    directionalAccuracy: null,
  }]));
  for (const record of records) {
    const bucket = summary[record.cohort];
    if (!bucket) continue;
    bucket.total += 1;
    if (record.status === "valued") bucket.valued += 1;
    if (record.status === "unvalued") bucket.unvalued += 1;
    if (record.status === "invalid") bucket.invalid += 1;
  }
  for (const cohort of COHORTS) {
    const bucket = summary[cohort];
    const valued = records.filter((record) => record.cohort === cohort && record.status === "valued");
    const errors = valued.map((record) => record.absolutePercentageError).filter(Number.isFinite).sort((a, b) => a - b);
    bucket.medianAbsolutePercentageError = errors.length
      ? errors.length % 2 ? errors[(errors.length - 1) / 2] : (errors[errors.length / 2 - 1] + errors[errors.length / 2]) / 2
      : null;
    bucket.directionalAccuracy = valued.length ? valued.filter((record) => record.directionalHit).length / valued.length : null;
    bucket.coverage = bucket.total ? bucket.valued / bucket.total : null;
  }
  return summary;
}

function comparisonShadow({ fixture, results, candidate, targetIndexes, fixturePath, resultsPath }) {
  const defaultRecords = results.records;
  const targetSet = new Set(targetIndexes);
  const targetBaseline = targetIndexes.map((index) => defaultRecords[index]);
  const targetCandidate = targetIndexes.map((index) => candidate.records[index]);
  const baselineSummary = summarizeRecords(targetBaseline)["growth-fcff"];
  const candidateSummary = summarizeRecords(targetCandidate)["growth-fcff"];
  const nonTargetRecords = defaultRecords.filter((_, index) => !targetSet.has(index));
  const nonTargetEquality = nonTargetRecords.every((record) => {
    const index = defaultRecords.indexOf(record);
    return isDeepStrictEqual(candidate.records[index], record);
  });
  if (!nonTargetEquality) throw new Error("Non-driver candidate changed a non-target record");
  const differences = targetIndexes.map((index) => {
    const baseline = defaultRecords[index];
    const current = candidate.records[index];
    return {
      ticker: baseline.ticker,
      baselineFairValue: baseline.fairValue,
      candidateFairValue: current.fairValue,
      fairValueDelta: current.fairValue - baseline.fairValue,
      baselineAbsolutePercentageError: baseline.absolutePercentageError,
      candidateAbsolutePercentageError: current.absolutePercentageError,
      absolutePercentageErrorDelta: current.absolutePercentageError - baseline.absolutePercentageError,
      baselineDirectionalHit: baseline.directionalHit,
      candidateDirectionalHit: current.directionalHit,
    };
  });
  const comparisons = Object.fromEntries(COHORTS.map((cohort) => {
    const baseline = cohort === "growth-fcff" ? baselineSummary : results.summary[cohort];
    const current = cohort === "growth-fcff" ? candidateSummary : candidate.summary[cohort];
    return [cohort, {
      coverage: compareMetric(baseline.coverage, current.coverage),
      medianAbsolutePercentageError: compareMetric(baseline.medianAbsolutePercentageError, current.medianAbsolutePercentageError),
      directionalAccuracy: compareMetric(baseline.directionalAccuracy, current.directionalAccuracy),
    }];
  }));
  return {
    format: "valuation-backtest-comparison/v1",
    version: 1,
    generatedAt: results.generatedAt,
    model: { modelId: "driver-fcff/v2-shadow", years: 10, terminalValue: true, carriedForwardToCutoff: true },
    fixture: { filename: basename(fixturePath), sha256: null },
    baseline: { filename: basename(resultsPath), sha256: null, fixtureSha256: null, summary: results.summary },
    candidate: { records: candidate.records, summary: candidate.summary },
    comparisons,
    driverFCFFCohort: {
      count: targetIndexes.length,
      tickers: targetIndexes.map((index) => defaultRecords[index].ticker),
      baselineSummary,
      candidateSummary,
    },
    growthDifferences: differences,
    nonTargetEquality: { equal: true, count: nonTargetRecords.length, tickers: nonTargetRecords.map(({ ticker }) => ticker) },
    warnings: ["Candidate assumptions are shadow-only; production aggregateDCFInputs and routes are unchanged."],
  };
}

async function buildVintage(manifest, {
  archiveDir,
  ingest = ingestSnapshot,
  yahooClient,
  fetchImpl,
  env,
  now = new Date().toISOString(),
} = {}) {
  const checked = validateManifest(manifest);
  if (!archiveDir) throw new Error("archiveDir is required");
  const rows = [];
  const sources = new Map();
  for (const entry of checked.rows) {
    const rowFixture = await ingest({
      ticker: entry.ticker,
      cik: entry.cik,
      accession: entry.accession,
      "as-of": checked.asOfDate,
      sector: entry.sector,
      industry: entry.industry,
      output: resolve(archiveDir, ".unused-driver-vintage-row.json"),
      "sec-archive": archivePath(archiveDir, entry.archive),
      "archive-sha256": checked.archiveSha256[entry.archive],
      "classification-source": checked.classificationSource,
      "classification-effective-date": checked.classificationEffectiveDate,
      "expected-cohort": entry.cohort,
    }, { env, fetchImpl, yahooClient, now });
    const row = rowFixture.rows?.[0] || rowFixture;
    if (row.ticker !== entry.ticker
      || row.provenance?.sec?.filing?.accession !== entry.accession
      || row.provenance?.sec?.archive?.expectedAccession !== entry.accession
      || row.provenance?.sec?.archive?.localArchiveSha256 !== checked.archiveSha256[entry.archive]) {
      throw new Error(`${entry.ticker}: source identity or archive provenance mismatch`);
    }
    rows.push(row);
    for (const source of rowFixture.sources || []) sources.set(JSON.stringify(source), source);
  }
  const fixture = {
    format: "valuation-backtest-fixture/v2",
    version: 2,
    generatedAt: now,
    methodology: {
      baselineId: checked.baselineId,
      capturedAt: checked.asOfDate,
      classificationSource: checked.classificationSource,
      classificationEffectiveDate: checked.classificationEffectiveDate,
    },
    sources: [...sources.values()],
    rows,
  };
  const defaults = runValuationBacktest(fixture);
  if (defaults.records.some((record) => record.status === "invalid")) throw new Error("Vintage default replay contains invalid records");
  const candidate = runDriverFCFFBacktest(fixture);
  const targetIndexes = candidate.driverFCFFTargetIndexes;
  const targetTickers = targetIndexes.map((index) => candidate.records[index]?.ticker);
  if (!targetIndexes.length
    || targetIndexes.some((index) => {
      const record = candidate.records[index];
      return record?.status !== "valued" || record.projectionMethod !== "driver-fcff" || record.projectionYears !== 10 || record.driverScheduleYears !== 10;
    })) {
    throw new Error(`Vintage selector must produce nonempty ordered 10-year driver-fcff rows; got ${targetTickers.join(",")}`);
  }
  if (rows.length !== ORDERED_TICKERS.length) throw new Error("Vintage fixture must retain seven rows");
  const shadow = comparisonShadow({ fixture, results: {
    format: "valuation-backtest-results/v1",
    version: 1,
    baselineId: checked.baselineId,
    generatedAt: now,
    records: defaults.records,
    summary: defaults.summary,
  }, candidate, targetIndexes, fixturePath: `${checked.baselineId}.json`, resultsPath: `${checked.baselineId}-baseline.json` });
  return {
    fixture,
    results: {
      format: "valuation-backtest-results/v1",
      version: 1,
      baselineId: checked.baselineId,
      generatedAt: now,
      records: defaults.records,
      summary: defaults.summary,
    },
    shadow,
  };
}

function parseArgs(args = []) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--") || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Usage: node build-driver-fcff-vintage.js --manifest <path> --archive-dir <path> --fixture <path> --results <path> --shadow <path>");
    parsed[arg.slice(2)] = args[++index];
  }
  for (const key of ["manifest", "archive-dir", "fixture", "results", "shadow"]) if (!parsed[key]) throw new Error(`Missing required argument: --${key}`);
  return parsed;
}

function publishVintageArtifacts({ fixture, results, shadow, fixturePath, resultsPath, shadowPath, fileOps = {} }) {
  const write = fileOps.writeFileSync || writeFileSync;
  const link = fileOps.linkSync || linkSync;
  const remove = fileOps.rmSync || rmSync;
  const paths = [fixturePath, resultsPath, shadowPath];
  if (paths.some((path) => existsSync(path))) throw new Error("Refusing to overwrite existing artifact");
  const fixtureBytes = `${JSON.stringify(fixture, null, 2)}\n`;
  const fixtureHash = sha256Bytes(fixtureBytes);
  const finalResults = { ...results, fixtureFile: basename(fixturePath), fixtureSha256: fixtureHash };
  const resultsBytes = `${JSON.stringify(finalResults, null, 2)}\n`;
  const resultsHash = sha256Bytes(resultsBytes);
  const finalShadow = {
    ...shadow,
    fixture: { ...shadow.fixture, filename: basename(fixturePath), sha256: fixtureHash },
    baseline: { ...shadow.baseline, filename: basename(resultsPath), sha256: resultsHash, fixtureSha256: fixtureHash },
    model: { ...shadow.model, fixtureSha256: fixtureHash, baselineResultsSha256: resultsHash },
  };
  const shadowBytes = `${JSON.stringify(finalShadow, null, 2)}\n`;
  const temp = [];
  const linked = [];
  try {
    for (const path of paths) mkdirSync(dirname(path), { recursive: true });
    const suffix = `${process.pid}-${Date.now()}`;
    for (const [path, bytes] of [[fixturePath, fixtureBytes], [resultsPath, resultsBytes], [shadowPath, shadowBytes]]) {
      const tempPath = `${path}.${suffix}.tmp`;
      write(tempPath, bytes, { flag: "wx" });
      temp.push(tempPath);
      link(tempPath, path);
      linked.push(path);
    }
    for (const path of temp) remove(path, { force: true });
    return { fixtureHash, resultsHash, fixturePath, resultsPath, shadowPath };
  } catch (error) {
    for (const path of temp) remove(path, { force: true });
    for (const path of linked) remove(path, { force: true });
    throw error;
  }
}

async function main(args = process.argv.slice(2), dependencies = {}) {
  const parsed = parseArgs(args);
  const built = await buildVintage(readJson(parsed.manifest), { archiveDir: parsed["archive-dir"], ...dependencies });
  return publishVintageArtifacts({ fixture: built.fixture, results: built.results, shadow: built.shadow, fixturePath: resolve(parsed.fixture), resultsPath: resolve(parsed.results), shadowPath: resolve(parsed.shadow) });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

export { ORDERED_TICKERS, buildVintage, main, parseArgs, publishVintageArtifacts, validateManifest, sha256Bytes };
