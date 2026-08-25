import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { jest } from "@jest/globals";

const mockParseFsdsArchive = jest.fn();
const mockBuildStatements = jest.fn();
const mockRunValuationBacktest = jest.fn();
const mockRunDriverFCFFBacktest = jest.fn();

jest.unstable_mockModule("../ingest-valuation-fixture.js", () => ({
  buildStatements: mockBuildStatements,
  parseFsdsArchive: mockParseFsdsArchive,
}));
jest.unstable_mockModule("../valuation-backtest.js", () => ({
  runDriverFCFFBacktest: mockRunDriverFCFFBacktest,
  runValuationBacktest: mockRunValuationBacktest,
}));

const { enrichDriverFCFFFixture } = await import("../enrich-driver-fcff-fixture.js");

const DRIVER_TICKERS = ["MSFT", "NVDA", "TSLA", "GOOGL", "META", "AMD", "CRM"];
const ALL_TICKERS = [...DRIVER_TICKERS, "AAPL"];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function makeFixture(root) {
  const archiveDir = resolve(root, "archives");
  mkdirSync(archiveDir);
  const archiveSha256 = {};
  for (const index of [0, 1, 2, 3]) {
    const name = `archive-${index}.zip`;
    const bytes = Buffer.from(`pinned archive ${index}`);
    writeFileSync(resolve(archiveDir, name), bytes);
    archiveSha256[name] = sha256(bytes);
  }

  const rows = ALL_TICKERS.map((ticker, index) => ({
    ticker,
    expectedCohort: "growth-fcff",
    asOfDate: "2022-09-30",
    capturedAt: "2022-10-01T00:00:00.000Z",
    provenance: {
      sec: {
        cik: String(index + 1),
        filing: { accession: `0000000000-22-${String(index + 1).padStart(6, "0")}` },
      },
    },
    balanceSheet: {},
  }));
  const manifest = {
    archiveSha256,
    rows: rows.map((row, index) => ({
      ticker: row.ticker,
      cohort: row.expectedCohort,
      archive: `archive-${index % 4}.zip`,
      accession: row.provenance.sec.filing.accession,
    })),
  };
  const fixturePath = resolve(root, "fixture.json");
  const manifestPath = resolve(root, "manifest.json");
  writeFileSync(fixturePath, JSON.stringify({ format: "valuation-backtest-fixture/v1", generatedAt: "2026-08-24T00:00:00.000Z", rows }));
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return { fixturePath, manifestPath, archiveDir, rows };
}

function configureMocks(driverTickers = DRIVER_TICKERS) {
  mockParseFsdsArchive.mockImplementation(async (_path, options) => ({
    filing: { accessionNumber: options.expectedAccession },
    companyFacts: {},
  }));
  mockBuildStatements.mockReturnValue({
    balanceSheet: {
      annualBalanceSheet: [{ date: "2021-12-31", periodEnd: "2021-12-31", availableDate: "2022-01-03" }],
    },
  });
  mockRunValuationBacktest.mockImplementation((fixture) => ({
    records: fixture.rows.map((row) => ({ ticker: row.ticker, cohort: row.expectedCohort, status: "valued" })),
    summary: {},
  }));
  mockRunDriverFCFFBacktest.mockImplementation((fixture) => ({
    records: fixture.rows.map((row) => driverTickers.includes(row.ticker)
      ? {
        ticker: row.ticker,
        cohort: row.expectedCohort,
        status: "valued",
        projectionMethod: "driver-fcff",
        projectionYears: 10,
        driverScheduleYears: 10,
      }
      : { ticker: row.ticker, cohort: row.expectedCohort, status: "valued" }),
    driverFCFFTargetIndexes: driverTickers.map((ticker) => fixture.rows.findIndex((row) => row.ticker === ticker)),
  }));
}

function runWithTempFixture(driverTickers) {
  const root = mkdtempSync(resolve(tmpdir(), "enrich-driver-fcff-"));
  const paths = makeFixture(root);
  const outputPath = resolve(root, "output.json");
  const resultsPath = resolve(root, "results.json");
  configureMocks(driverTickers);
  return enrichDriverFCFFFixture({ ...paths, outputPath, resultsPath }).finally(() => rmSync(root, { recursive: true, force: true }));
}

beforeEach(() => {
  jest.clearAllMocks();
});

test("accepts eight enriched rows when AAPL remains scalar and seven selector rows are drivers", async () => {
  await expect(runWithTempFixture(DRIVER_TICKERS)).resolves.toMatchObject({
    defaultReplay: { records: expect.any(Array) },
    candidate: { driverFCFFTargetIndexes: expect.any(Array) },
  });
  expect(mockBuildStatements).toHaveBeenCalledTimes(8);
});

test.each([
  ["missing driver", DRIVER_TICKERS.slice(0, 6)],
  ["unexpected driver", [...DRIVER_TICKERS.slice(0, 6), "AAPL"]],
])("rejects an actual driver cohort that is %s", async (_label, driverTickers) => {
  await expect(runWithTempFixture(driverTickers)).rejects.toThrow("Expected exactly seven selector-derived 10-year driver-FCFF candidates");
});

test("keeps archive validation fail-closed", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "enrich-driver-fcff-"));
  const paths = makeFixture(root);
  const firstArchive = resolve(paths.archiveDir, "archive-0.zip");
  writeFileSync(firstArchive, Buffer.from("tampered archive"));
  configureMocks();
  await expect(enrichDriverFCFFFixture({ ...paths, outputPath: resolve(root, "output.json"), resultsPath: resolve(root, "results.json") })).rejects.toThrow("SEC archive SHA-256 mismatch");
  rmSync(root, { recursive: true, force: true });
});
