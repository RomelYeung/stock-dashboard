import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  buildVintage,
  buildFixedRosterShadow,
  ORDERED_TICKERS,
  publishVintageArtifacts,
  validateManifest,
} from "../build-driver-fcff-vintage.js";
import { renderFixedRosterShadow } from "../render-driver-fcff-fixed-roster-shadow.js";

const fixtureDir = resolve(process.cwd(), "scripts/fixtures");
const sourceFixture = JSON.parse(readFileSync(resolve(fixtureDir, "valuation-baseline-driver-v2.json"), "utf8"));

function manifestFor(year) {
  return JSON.parse(readFileSync(resolve(fixtureDir, `driver-fcff-${year}-11-01.manifest.json`), "utf8"));
}

function ingestFor(manifest, targetTickers) {
  return async (args) => {
    const source = sourceFixture.rows.find(({ ticker }) => ticker === args.ticker);
    const row = structuredClone(source);
    row.expectedCohort = "growth-fcff";
    if (!targetTickers.includes(args.ticker)) {
      row.annualIncome = row.annualIncome.map((record, index) => ({
        ...record,
        totalRevenue: 100_000_000_000 + index * 1_000_000_000,
      }));
    }
    row.asOfDate = `${manifest.asOfDate}T20:00:00.000Z`;
    row.capturedAt = row.asOfDate;
    row.outcomeDate = `${Number(manifest.asOfDate.slice(0, 4)) + 1}-11-01T20:00:00.000Z`;
    row.provenance.sec.filing.accession = args.accession;
    row.provenance.sec.archive.expectedAccession = args.accession;
    row.provenance.sec.archive.localArchiveSha256 = manifest.archiveSha256[args["sec-archive"].split("/").at(-1)];
    return { ...structuredClone(sourceFixture), generatedAt: "2026-08-24T00:00:00.000Z", rows: [row], sources: [] };
  };
}

async function buildFor(year, targetTickers) {
  const manifest = manifestFor(year);
  return buildVintage(manifest, { archiveDir: "/private/tmp", ingest: ingestFor(manifest, targetTickers), now: "2026-08-24T00:00:00.000Z" });
}

test.each(["2023", "2024"])("accepts the fixed seven-company %s target cohort", async (year) => {
  const manifest = manifestFor(year);
  expect(validateManifest(manifest).rows.map(({ ticker }) => ticker)).toEqual(ORDERED_TICKERS);
  const built = await buildFor(year, ORDERED_TICKERS);
  expect(built.fixture.rows.map(({ ticker }) => ticker)).toEqual(ORDERED_TICKERS);
  expect(built.fixture.rows).toHaveLength(7);
  expect(built.results.records).toHaveLength(7);
  expect(built.results.records.every(({ status }) => status === "valued")).toBe(true);
  expect(built.shadow.driverFCFFCohort).toMatchObject({ count: 7, tickers: ORDERED_TICKERS });
  expect(built.shadow.growthDifferences.map(({ ticker }) => ticker)).toEqual(ORDERED_TICKERS);
  expect(built.shadow.nonTargetEquality).toMatchObject({ equal: true, count: 0 });
  expect(built.shadow.driverFCFFCohort.baselineSummary.total).toBe(7);
  expect(built.shadow.driverFCFFCohort.candidateSummary.total).toBe(7);
});

test.each([
  ["2023", ["TSLA", "AMD", "CRM"]],
  ["2024", ["MSFT", "NVDA", "TSLA", "META"]],
])("uses the fixed roster when the default selector omits names in the %s vintage", async (year, targetTickers) => {
  const built = await buildFor(year, targetTickers);
  expect(built.shadow.targeting).toEqual({
    mode: "explicit-fixed-roster",
    scope: "harness-only",
    productionSelector: false,
    tickers: ORDERED_TICKERS,
  });
  expect(built.shadow.driverFCFFCohort.tickers).toEqual(ORDERED_TICKERS);
});

test("rejects a source row whose pinned archive hash does not match the manifest", async () => {
  const manifest = manifestFor("2023");
  const ingest = ingestFor(manifest, ["TSLA", "AMD", "CRM"]);
  await expect(buildVintage(manifest, {
    archiveDir: "/private/tmp",
    ingest: async (args) => {
      const result = await ingest(args);
      result.rows[0].provenance.sec.archive.localArchiveSha256 = "0".repeat(64);
      return result;
    },
  })).rejects.toThrow(/archive provenance mismatch/);
});

test("publishes fixture, baseline, and shadow once with embedded hashes", async () => {
  const built = await buildFor("2023", ORDERED_TICKERS);
  const directory = mkdtempSync(resolve(tmpdir(), "driver-vintage-"));
  const fixturePath = resolve(directory, "fixture.json");
  const resultsPath = resolve(directory, "baseline.json");
  const shadowPath = resolve(directory, "shadow.json");
  try {
    const first = publishVintageArtifacts({ ...built, fixturePath, resultsPath, shadowPath });
    expect(first.fixtureHash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.resultsHash).toMatch(/^[0-9a-f]{64}$/);
    const results = JSON.parse(readFileSync(resultsPath, "utf8"));
    const shadow = JSON.parse(readFileSync(shadowPath, "utf8"));
    expect(results.fixtureSha256).toBe(first.fixtureHash);
    expect(shadow.fixture.sha256).toBe(first.fixtureHash);
    expect(shadow.baseline.sha256).toBe(first.resultsHash);
    expect(existsSync(fixturePath)).toBe(true);
    expect(() => publishVintageArtifacts({ ...built, fixturePath, resultsPath, shadowPath })).toThrow(/Refusing to overwrite/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fails closed when a fixed-roster target cannot make a driver candidate", async () => {
  const manifest = manifestFor("2023");
  await expect(buildVintage(manifest, {
    archiveDir: "/private/tmp",
    ingest: async (args) => {
      const result = await ingestFor(manifest, ORDERED_TICKERS)(args);
      if (args.ticker === "MSFT") result.rows[0].annualIncome = [];
      return result;
    },
  })).rejects.toThrow(/driver-candidate-growth-unavailable/);
});

test("does not leave partial artifacts when Tiingo ingress fails", async () => {
  const manifest = manifestFor("2024");
  const directory = mkdtempSync(resolve(tmpdir(), "driver-vintage-tiingo-failure-"));
  const paths = ["fixture.json", "baseline.json", "shadow.json"].map((name) => resolve(directory, name));
  try {
    await expect(buildVintage(manifest, {
      archiveDir: "/private/tmp",
      ingest: async (args) => {
        if (args.ticker === "NVDA") throw new Error("Tiingo fetch failed (429)");
        return ingestFor(manifest, ["MSFT", "NVDA", "TSLA", "META"])(args);
      },
    })).rejects.toThrow("Tiingo fetch failed");
    expect(paths.every((path) => !existsSync(path))).toBe(true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects a fixed-roster shadow when the supplied baseline does not replay", async () => {
  const built = await buildFor("2024", ORDERED_TICKERS);
  const baseline = structuredClone(built.results);
  baseline.summary["growth-fcff"].medianAbsolutePercentageError += 1;
  expect(() => buildFixedRosterShadow({
    fixture: built.fixture,
    results: baseline,
    fixturePath: "missing-fixture.json",
    resultsPath: "missing-baseline.json",
  })).toThrow(/Baseline replay metadata or records mismatch/);
});

test("renders fixed-roster shadow with source hashes and refuses overwrite", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "driver-fixed-roster-render-"));
  const fixturePath = resolve(fixtureDir, "driver-fcff-2024-11-01.json");
  const resultsPath = resolve(process.cwd(), "scripts/results/driver-fcff-2024-11-01-baseline.json");
  const shadowPath = resolve(directory, "fixed-roster-shadow.json");
  try {
    const first = renderFixedRosterShadow({ fixturePath, resultsPath, shadowPath });
    const shadow = JSON.parse(readFileSync(shadowPath, "utf8"));
    expect(first.fixtureSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.resultsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(shadow.model.modelId).toBe("driver-fcff/v2-fixed-roster-shadow");
    expect(shadow.targeting).toEqual({
      mode: "explicit-fixed-roster",
      scope: "harness-only",
      productionSelector: false,
      tickers: ORDERED_TICKERS,
    });
    expect(shadow.fixture.sha256).toBe(first.fixtureSha256);
    expect(shadow.baseline.sha256).toBe(first.resultsSha256);
    expect(() => renderFixedRosterShadow({ fixturePath, resultsPath, shadowPath })).toThrow(/EEXIST|already exists/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
