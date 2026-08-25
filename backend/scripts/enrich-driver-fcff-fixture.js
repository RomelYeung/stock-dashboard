import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildStatements,
  parseFsdsArchive,
} from "./ingest-valuation-fixture.js";
import {
  runDriverFCFFBacktest,
  runValuationBacktest,
} from "./valuation-backtest.js";

const TARGET_COHORT = "growth-fcff";
const REQUIRED_TARGETS = 8;
const REQUIRED_DRIVER_TARGETS = 7;
const EXPECTED_DRIVER_TICKERS = new Set(["MSFT", "NVDA", "TSLA", "GOOGL", "META", "AMD", "CRM"]);

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function parseArgs(args = []) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    if (!args[index].startsWith("--")) throw new Error(`Unexpected argument: ${args[index]}`);
    const key = args[index].slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    parsed[key] = value;
    index += 1;
  }
  for (const key of ["fixture", "manifest", "archive-dir", "output", "results"]) {
    if (!parsed[key]) throw new Error(`Missing required argument: --${key}`);
  }
  return parsed;
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(path), "utf8"));
}

function assertBeforeAsOf(record, asOfDate, label) {
  const asOfMs = Date.parse(asOfDate);
  for (const key of ["date", "periodEnd", "availableDate"]) {
    if (!record[key] || !Number.isFinite(Date.parse(record[key])) || Date.parse(record[key]) > asOfMs) {
      throw new Error(`${label} has a future or invalid ${key}`);
    }
  }
}

async function enrichDriverFCFFFixture({ fixturePath, manifestPath, archiveDir, outputPath, resultsPath }) {
  const fixtureBytes = readFileSync(resolve(fixturePath));
  const fixture = JSON.parse(fixtureBytes.toString("utf8"));
  const parentFixtureSha256 = createHash("sha256").update(fixtureBytes).digest("hex");
  const manifest = readJson(manifestPath);
  if (!Array.isArray(fixture.rows) || !Array.isArray(manifest.rows)) throw new Error("Fixture and manifest rows are required");
  if (manifest.rows.length !== fixture.rows.length) throw new Error("Manifest row count mismatch");

  const archives = Object.entries(manifest.archiveSha256 || {}).map(([name, expectedSha256]) => ({
    name,
    expectedSha256,
    path: resolve(archiveDir, name),
  }));
  if (archives.length !== 4) throw new Error("Expected four pinned SEC FSDS archives");
  for (const archive of archives) {
    if (!existsSync(archive.path)) throw new Error(`Missing pinned SEC archive: ${archive.path}`);
    if (await sha256File(archive.path) !== archive.expectedSha256) throw new Error(`SEC archive SHA-256 mismatch: ${archive.name}`);
  }
  const archiveByName = new Map(archives.map((archive) => [archive.name, archive]));
  const enrichedRows = fixture.rows.map((row, index) => {
    const manifestRow = manifest.rows[index];
    if (row.ticker !== manifestRow.ticker || row.expectedCohort !== manifestRow.cohort) throw new Error(`Manifest row mismatch: ${row.ticker}`);
    if (row.expectedCohort !== TARGET_COHORT) return row;
    const archive = archiveByName.get(manifestRow.archive);
    if (!archive || row.provenance?.sec?.filing?.accession !== manifestRow.accession) throw new Error(`Pinned source mismatch: ${row.ticker}`);
    const secMeta = row.provenance.sec;
    return { row, manifestRow, archive, secMeta };
  });

  let targetCount = 0;
  const outputRows = enrichedRows.map((entry) => {
    if (!entry.row) return entry;
    const { row, manifestRow, archive, secMeta } = entry;
    const parsed = entry.parsed;
    if (parsed) return parsed;
    targetCount += 1;
    return { row, manifestRow, archive, secMeta };
  });

  const finalRows = [];
  for (const entry of outputRows) {
    if (!entry.row) {
      finalRows.push(entry);
      continue;
    }
    const { row, manifestRow, archive, secMeta } = entry;
    const parsed = await parseFsdsArchive(archive.path, {
      cik: secMeta.cik,
      asOfDate: row.asOfDate.slice(0, 10),
      cutoff: row.capturedAt,
      expectedAccession: manifestRow.accession,
      expectedArchiveSha256: archive.expectedSha256,
    });
    if (parsed.filing.accessionNumber !== manifestRow.accession) throw new Error(`Selected accession mismatch: ${row.ticker}`);
    const statements = buildStatements(parsed.companyFacts, parsed.filing, row.capturedAt, TARGET_COHORT);
    const annualBalanceSheet = statements.balanceSheet.annualBalanceSheet;
    if (!annualBalanceSheet.length) throw new Error(`No annual capital history: ${row.ticker}`);
    annualBalanceSheet.forEach((record) => assertBeforeAsOf(record, row.asOfDate, `${row.ticker} annual balance`));
    finalRows.push({
      ...row,
      balanceSheet: { ...row.balanceSheet, annualBalanceSheet },
    });
  }
  if (targetCount !== REQUIRED_TARGETS) throw new Error(`Expected ${REQUIRED_TARGETS} growth-fcff targets, got ${targetCount}`);
  for (const archive of archives) {
    if (await sha256File(archive.path) !== archive.expectedSha256) throw new Error(`SEC archive changed while enriching: ${archive.name}`);
  }

  const enrichedFixture = {
    ...fixture,
    format: "valuation-backtest-fixture/v2",
    version: 2,
    parentFixtureSha256,
    dataMethod: {
      provider: "SEC FSDS",
      description: "Annual total equity, total debt, and cash extracted from the same pinned 10-K accession and knowledge cutoff as each v1 row.",
      fallback: "fail-closed; no Yahoo, FRED, or current-data fallback",
      targetCohort: TARGET_COHORT,
      archiveSha256: Object.fromEntries(archives.map(({ name, expectedSha256 }) => [name, expectedSha256])),
    },
    rows: finalRows,
  };
  const defaultReplay = runValuationBacktest(enrichedFixture);
  const candidate = runDriverFCFFBacktest(enrichedFixture);
  const driverTargetIndexes = candidate.driverFCFFTargetIndexes || [];
  const driverRecords = driverTargetIndexes.map((index) => candidate.records[index]);
  const driverTickers = driverRecords.map((record) => record?.ticker);
  if (driverTargetIndexes.length !== REQUIRED_DRIVER_TARGETS
    || new Set(driverTickers).size !== REQUIRED_DRIVER_TARGETS
    || driverTickers.some((ticker) => !EXPECTED_DRIVER_TICKERS.has(ticker))
    || driverRecords.some((record) => record?.status !== "valued" || record?.projectionMethod !== "driver-fcff" || record?.projectionYears !== 10 || record?.driverScheduleYears !== 10)) {
    throw new Error("Expected exactly seven selector-derived 10-year driver-FCFF candidates");
  }
  if (existsSync(resolve(outputPath)) || existsSync(resolve(resultsPath))) throw new Error("v2 artifacts already exist; publication is write-once");
  const result = {
    format: "valuation-backtest-results/v1",
    version: 1,
    baselineId: "valuation-baseline-driver-v2",
    generatedAt: enrichedFixture.generatedAt,
    records: defaultReplay.records,
    summary: defaultReplay.summary,
    fixtureFile: "valuation-baseline-driver-v2.json",
    fixtureSha256: createHash("sha256").update(`${JSON.stringify(enrichedFixture, null, 2)}\n`).digest("hex"),
  };
  writeFileSync(resolve(outputPath), `${JSON.stringify(enrichedFixture, null, 2)}\n`, { flag: "wx" });
  writeFileSync(resolve(resultsPath), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  return { fixtureSha256: result.fixtureSha256, resultsSha256: await sha256File(resolve(resultsPath)), defaultReplay, candidate };
}

async function main(args = process.argv.slice(2)) {
  return enrichDriverFCFFFixture({
    fixturePath: parseArgs(args).fixture,
    manifestPath: parseArgs(args).manifest,
    archiveDir: parseArgs(args)["archive-dir"],
    outputPath: parseArgs(args).output,
    resultsPath: parseArgs(args).results,
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export { assertBeforeAsOf, enrichDriverFCFFFixture, main, parseArgs, sha256File };
