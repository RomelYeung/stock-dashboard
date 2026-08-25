import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { ingestSnapshot } from "./ingest-valuation-fixture.js";
import { COHORTS, runValuationBacktest, validateReplayRow } from "./valuation-backtest.js";

const require = createRequire(import.meta.url);
const DEFAULT_MANIFEST = resolve(new URL("./fixtures/valuation-baseline-v1.manifest.json", import.meta.url).pathname);
const DEFAULT_FIXTURE = resolve(new URL("./fixtures/valuation-baseline-v1.json", import.meta.url).pathname);
const DEFAULT_RESULTS = resolve(new URL("./results/valuation-baseline-v1.json", import.meta.url).pathname);
const EXPECTED_COUNTS = { "bank-insurer": 8, "mature-fcff": 10, "growth-fcff": 8, unsupported: 4 };
const ARCHIVE_NAME = /^sec-fsds-\d{4}q[1-4]\.zip$/;
const ACCESSION = /^\d{10}-\d{2}-\d{6}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function parseArgs(args = []) {
  const index = args.indexOf("--archive-dir");
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Usage: node build-valuation-baseline.js --archive-dir <path>");
  return { archiveDir: resolve(args[index + 1]) };
}

function readManifest(path = DEFAULT_MANIFEST) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validateManifest(manifest) {
  if (manifest?.baselineId !== "valuation-baseline-v1" || manifest?.asOfDate !== "2022-11-01") throw new Error("Baseline manifest identity or as-of date is invalid");
  const classificationDate = manifest.classificationEffectiveDate;
  const validClassificationDate = /^\d{4}-\d{2}-\d{2}$/.test(String(classificationDate))
    && new Date(`${classificationDate}T00:00:00Z`).toISOString().slice(0, 10) === classificationDate;
  if (!manifest.classificationSource?.trim() || !validClassificationDate || classificationDate > manifest.asOfDate) throw new Error("Baseline classification metadata is invalid");
  if (!manifest.archiveSha256 || typeof manifest.archiveSha256 !== "object") throw new Error("Baseline archive SHA pins are missing");
  for (const [archive, hash] of Object.entries(manifest.archiveSha256)) {
    if (!ARCHIVE_NAME.test(archive) || !SHA256.test(hash)) throw new Error(`Invalid archive SHA pin: ${archive}`);
  }
  if (!Array.isArray(manifest.rows) || manifest.rows.length !== 30) throw new Error("Baseline manifest must contain 30 rows");
  const tickers = new Set();
  const accessions = new Set();
  const counts = Object.fromEntries(COHORTS.map((cohort) => [cohort, 0]));
  for (const row of manifest.rows) {
    if (!row.ticker || tickers.has(row.ticker) || accessions.has(row.accession)) throw new Error(`Duplicate baseline ticker/accession: ${row.ticker}`);
    if (!ACCESSION.test(row.accession) || !/^\d+$/.test(String(row.cik))) throw new Error(`Invalid baseline identity: ${row.ticker}`);
    if (!COHORTS.includes(row.cohort)) throw new Error(`Invalid baseline cohort: ${row.ticker}`);
    if (!ARCHIVE_NAME.test(row.archive) || basename(row.archive) !== row.archive) throw new Error(`Invalid baseline archive: ${row.ticker}`);
    if (!SHA256.test(manifest.archiveSha256[row.archive] || "")) throw new Error(`Missing archive SHA pin: ${row.archive}`);
    if (row.cohort === "unsupported" && JSON.stringify(row.expectedReasonCodes || []) !== JSON.stringify(["fcf-non-positive"])) throw new Error(`Unsupported baseline reason mismatch: ${row.ticker}`);
    tickers.add(row.ticker);
    accessions.add(row.accession);
    counts[row.cohort] += 1;
  }
  for (const cohort of COHORTS) if (counts[cohort] !== EXPECTED_COUNTS[cohort]) throw new Error(`Baseline cohort count mismatch for ${cohort}`);
  return { ...manifest, counts };
}

function archivePath(archiveDir, archive) {
  if (!ARCHIVE_NAME.test(archive) || basename(archive) !== archive) throw new Error(`Unsafe archive basename: ${archive}`);
  const path = resolve(archiveDir, archive);
  if (dirname(path) !== resolve(archiveDir)) throw new Error(`Archive escapes archive directory: ${archive}`);
  return path;
}

function cachedYahooClient(client) {
  const spy = new Map();
  return {
    chart: async (ticker, options) => {
      if (ticker !== "SPY") return client.chart(ticker, options);
      const key = JSON.stringify(options);
      if (!spy.has(key)) spy.set(key, await client.chart(ticker, options));
      return spy.get(key);
    },
  };
}

function qualityGate(row, expectedCohort) {
  const latestIncome = row.annualIncome?.at(-1) || {};
  const latestCashFlow = row.annualCashFlow?.find((record) => record.date === latestIncome.date) || {};
  if (expectedCohort === "bank-insurer") {
    if (!(Number.isFinite(latestIncome.commonNetIncome) && latestIncome.commonNetIncome != null)) throw new Error(`${row.ticker}: missing common net income`);
    if (!(Number.isFinite(row.balanceSheet?.commonEquity) && row.balanceSheet.commonEquity > 0)) throw new Error(`${row.ticker}: missing positive common equity`);
    if (!(Number.isFinite(row.summary?.sharesOutstanding) && row.summary.sharesOutstanding > 0)) throw new Error(`${row.ticker}: missing positive shares`);
  } else if (!(Number.isFinite(latestIncome.totalRevenue)
    && Number.isFinite(latestCashFlow.freeCashFlow)
    && Number.isFinite(row.summary?.sharesOutstanding) && row.summary.sharesOutstanding > 0
    && (Number.isFinite(row.balanceSheet?.cashAndEquivalents) || Number.isFinite(row.balanceSheet?.currentInvestments)))) {
    throw new Error(`${row.ticker}: corporate quality gate failed`);
  }
}

async function buildBaseline(manifest, {
  archiveDir,
  ingest = ingestSnapshot,
  yahooClient,
  fetchImpl,
  env,
  now = new Date().toISOString(),
} = {}) {
  const checked = validateManifest(manifest);
  if (!archiveDir) throw new Error("archiveDir is required");
  const sourceYahoo = yahooClient || new (require("yahoo-finance2").default)();
  const client = cachedYahooClient(sourceYahoo);
  const rows = [];
  const sources = new Map();
  for (const entry of checked.rows) {
    let row;
    try {
      row = await ingest({
        ticker: entry.ticker,
        cik: entry.cik,
        accession: entry.accession,
        "as-of": checked.asOfDate,
        sector: entry.sector,
        industry: entry.industry,
        output: resolve(archiveDir, ".unused-baseline-row.json"),
        "sec-archive": archivePath(archiveDir, entry.archive),
        "archive-sha256": checked.archiveSha256[entry.archive],
        "classification-source": checked.classificationSource,
        "classification-effective-date": checked.classificationEffectiveDate,
        "expected-cohort": entry.cohort,
      }, { env, fetchImpl, yahooClient: client, now });
    } catch (error) {
      throw new Error(`${entry.ticker}: ${error.message}`);
    }
    const rowReasons = validateReplayRow(row.rows?.[0] || row);
    if (rowReasons.length) throw new Error(`${entry.ticker}: ${rowReasons.join(", ")}`);
    const value = row.rows?.[0] || row;
    qualityGate(value, entry.cohort);
    if (value.provenance?.sec?.filing?.accession !== entry.accession) throw new Error(`${entry.ticker}: accession mismatch`);
    rows.push(value);
    for (const source of row.sources || []) sources.set(JSON.stringify(source), source);
  }
  const backtest = runValuationBacktest(rows);
  if (backtest.records.some((record) => record.status === "invalid")) throw new Error("Baseline contains invalid backtest records");
  for (const [index, entry] of checked.rows.entries()) {
    const record = backtest.records[index];
    if (record.cohort !== entry.cohort) throw new Error(`${entry.ticker}: expected ${entry.cohort}, got ${record.cohort}`);
    for (const reason of entry.expectedReasonCodes || []) if (!record.reasonCodes.includes(reason)) throw new Error(`${entry.ticker}: missing expected reason ${reason}`);
  }
  return {
    fixture: {
      format: "valuation-backtest-fixture/v1",
      version: 1,
      generatedAt: now,
      methodology: { baselineId: checked.baselineId, capturedAt: checked.asOfDate, classificationSource: checked.classificationSource, classificationEffectiveDate: checked.classificationEffectiveDate },
      sources: [...sources.values()],
      rows,
    },
    results: { format: "valuation-backtest-results/v1", version: 1, baselineId: checked.baselineId, generatedAt: now, records: backtest.records, summary: backtest.summary },
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function publishArtifacts({ fixture, results, fixturePath = DEFAULT_FIXTURE, resultsPath = DEFAULT_RESULTS, fileOps = {} }) {
  const write = fileOps.writeFileSync || writeFileSync;
  const link = fileOps.linkSync || linkSync;
  const fixtureBytes = `${JSON.stringify(fixture, null, 2)}\n`;
  const fixtureHash = sha256(fixtureBytes);
  const finalResults = { ...results, fixtureFile: basename(fixturePath), fixtureSha256: fixtureHash };
  const resultsBytes = `${JSON.stringify(finalResults, null, 2)}\n`;
  const temp = [];
  try {
    for (const path of [fixturePath, resultsPath]) if (existsSync(path)) throw new Error(`Refusing to overwrite existing artifact: ${path}`);
    mkdirSync(dirname(fixturePath), { recursive: true });
    mkdirSync(dirname(resultsPath), { recursive: true });
    const suffix = `${process.pid}-${Date.now()}`;
    const fixtureTemp = `${fixturePath}.${suffix}.tmp`;
    const resultsTemp = `${resultsPath}.${suffix}.tmp`;
    write(fixtureTemp, fixtureBytes, { flag: "wx" });
    temp.push(fixtureTemp);
    write(resultsTemp, resultsBytes, { flag: "wx" });
    temp.push(resultsTemp);
    link(fixtureTemp, fixturePath);
    link(resultsTemp, resultsPath);
    rmSync(fixtureTemp, { force: true });
    rmSync(resultsTemp, { force: true });
    return { fixtureHash, fixturePath, resultsPath };
  } catch (error) {
    for (const path of temp) rmSync(path, { force: true });
    throw error;
  }
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const { archiveDir } = parseArgs(argv);
  const manifest = validateManifest(readManifest());
  const built = await buildBaseline(manifest, { archiveDir, ...dependencies });
  return publishArtifacts(built);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}

export { DEFAULT_FIXTURE, DEFAULT_MANIFEST, DEFAULT_RESULTS, buildBaseline, main, publishArtifacts, readManifest, validateManifest };
