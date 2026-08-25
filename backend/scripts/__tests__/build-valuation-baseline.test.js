import { createHash } from "node:crypto";
import { existsSync, linkSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  buildBaseline,
  publishArtifacts,
  readManifest,
  validateManifest,
} from "../build-valuation-baseline.js";
import {
  buildStatements,
  marketCloseCutoff,
  parseFsdsArchive,
  parseFsdsFacts,
} from "../ingest-valuation-fixture.js";
import { runValuationBacktest } from "../valuation-backtest.js";

const accession = "0000000000-22-000001";
const filing = { adsh: accession, accessionNumber: accession, form: "10-K", filed: "20221015", accepted: "2022-10-15 12:00:00.0", acceptanceDateTime: "2022-10-15T16:00:00.000Z", fy: "2022", fp: "FY" };

function fact(tag, value, unit = "USD", extra = {}) {
  return { val: value, accn: accession, form: "10-K", filed: "2022-10-15", start: "2021-10-01", end: "2022-09-30", qtrs: 4, fp: "FY", ...extra };
}

function facts(entries) {
  return { facts: { "us-gaap": Object.fromEntries(entries.map(([tag, value, unit = "USD", extra]) => [tag, { units: { [unit]: [fact(tag, value, unit, extra)] } }])) } };
}

test("validates the fixed roster and cohort counts", () => {
  const manifest = validateManifest(readManifest());
  expect(manifest.rows).toHaveLength(30);
  expect(manifest.counts).toEqual({ "bank-insurer": 8, "mature-fcff": 10, "growth-fcff": 8, unsupported: 4 });
});

test("accepts an explicit accession quarter override and rejects after-close acceptance", async () => {
  const headers = ["adsh", "cik", "name", "sic", "form", "period", "fy", "fp", "filed", "accepted", "instance"];
  const rows = [[accession, "1", "Fixture", "1", "10-K", "20220930", "2022", "FY", "20221015", "2022-10-15 12:00:00.0", "fixture.xml"]];
  const reader = async (_path, entry, onLine) => {
    if (entry === "sub.txt") {
      await onLine(headers.join("\t"));
      for (const row of rows) await onLine(row.join("\t"));
    } else {
      await onLine("adsh\ttag\tversion\tddate\tqtrs\tuom\tsegments\tcoreg\tvalue");
    }
  };
  const parsed = await parseFsdsArchive("/tmp/sec-fsds-2022q1.zip", {
    cik: "1", asOfDate: "2022-11-01", cutoff: marketCloseCutoff("2022-11-01"), expectedAccession: accession, archiveReader: reader, archiveSha256: "a".repeat(64), hasher: async () => "a".repeat(64),
  });
  expect(parsed.archive.archiveQuarterOverrideAuthorized).toBe(true);
  expect(parsed.filing.accessionNumber).toBe(accession);
  const lateReader = async (_path, entry, onLine) => {
    if (entry !== "sub.txt") return;
    await onLine(headers.join("\t"));
    await onLine([accession, "1", "Fixture", "1", "10-K", "20220930", "2022", "FY", "20221101", "2022-11-01 17:00:00.0", "fixture.xml"].join("\t"));
  };
  await expect(parseFsdsArchive("/tmp/sec-fsds-2022q1.zip", {
    cik: "1", asOfDate: "2022-11-01", cutoff: marketCloseCutoff("2022-11-01"), expectedAccession: accession, archiveReader: lateReader, archiveSha256: "a".repeat(64), hasher: async () => "a".repeat(64),
  })).rejects.toThrow("No eligible");
});

test("verifies archive SHA before and after streaming", async () => {
  const reader = async (_path, entry, onLine) => {
    if (entry === "sub.txt") {
      await onLine("adsh\tcik\tform\tperiod\tfy\tfp\tfiled\taccepted");
      await onLine(`${accession}\t1\t10-K\t20220930\t2022\tFY\t20221015\t2022-10-15 12:00:00.0`);
    } else await onLine("adsh\ttag\tversion\tddate\tqtrs\tuom\tsegments\tcoreg\tvalue");
  };
  await expect(parseFsdsArchive("/tmp/sec-fsds-2022q1.zip", { cik: "1", asOfDate: "2022-11-01", cutoff: marketCloseCutoff("2022-11-01"), expectedAccession: accession, expectedArchiveSha256: "a".repeat(64), hasher: async () => "b".repeat(64), archiveReader: reader })).rejects.toThrow("SHA-256 mismatch");
  let calls = 0;
  await expect(parseFsdsArchive("/tmp/sec-fsds-2022q1.zip", { cik: "1", asOfDate: "2022-11-01", cutoff: marketCloseCutoff("2022-11-01"), expectedAccession: accession, expectedArchiveSha256: "a".repeat(64), hasher: async () => (++calls === 1 ? "a" : "b").repeat(64), archiveReader: reader })).rejects.toThrow("changed while reading");
});

test("keeps only the common-share segment and preserves its provenance", () => {
  const parsed = parseFsdsFacts([
    { adsh: accession, tag: "CommonStockSharesOutstanding", uom: "shares", ddate: "20220930", qtrs: "0", segments: "EquityComponents=CommonStock", coreg: "", value: "100" },
    { adsh: accession, tag: "CommonStockSharesOutstanding", uom: "shares", ddate: "20220930", qtrs: "0", segments: "EquityComponents=PreferredStock", coreg: "", value: "500" },
  ], filing);
  expect(parsed.facts["us-gaap"].CommonStockSharesOutstanding.units.shares[0]).toMatchObject({ val: 100, segment: "EquityComponents=CommonStock" });
});

test("uses annual weighted shares and the capex fallback", () => {
  const companyFacts = facts([
    ["RevenueFromContractWithCustomerExcludingAssessedTax", 100], ["OperatingIncomeLoss", 20], ["ProfitLoss", 10],
    ["NetCashProvidedByUsedInOperatingActivities", 100], ["PurchasesOfPropertyAndEquipmentAndIntangibleAssets", -5],
    ["CashAndCashEquivalentsAtCarryingValue", 20, "USD", { qtrs: 0, start: undefined }],
    ["WeightedAverageNumberOfDilutedSharesOutstanding", 10, "shares"],
  ]);
  const result = buildStatements(companyFacts, filing, marketCloseCutoff("2022-11-01"));
  expect(result.sharesOutstanding).toBe(10);
  expect(result.balanceSheet.shareBasis).toBe("annual-weighted-average");
  expect(result.annualCashFlow.at(-1).capitalExpenditures).toBe(5);
  expect(result.annualCashFlow.at(-1).freeCashFlow).toBe(95);
});

test("prefers an unsegmented common-share point fact over annual weighted shares", () => {
  const companyFacts = facts([
    ["RevenueFromContractWithCustomerExcludingAssessedTax", 100], ["ProfitLoss", 10],
    ["NetCashProvidedByUsedInOperatingActivities", 100], ["PaymentsToAcquirePropertyPlantAndEquipment", -5],
    ["CashAndCashEquivalentsAtCarryingValue", 20, "USD", { qtrs: 0, start: undefined }],
    ["CommonStockSharesOutstanding", 11, "shares", { qtrs: 0, start: undefined }], ["WeightedAverageNumberOfDilutedSharesOutstanding", 10, "shares"],
  ]);
  const result = buildStatements(companyFacts, filing, marketCloseCutoff("2022-11-01"));
  expect(result.sharesOutstanding).toBe(11);
  expect(result.balanceSheet.shareBasis).toBe("point-in-time");
});

test("retains bank common equity and common-income fields while allowing null FCFF", () => {
  const companyFacts = facts([
    ["NetIncomeLossAvailableToCommonStockholdersBasic", 30], ["PaymentsOfDividendsCommonStock", 5],
    ["StockholdersEquity", 200, "USD", { qtrs: 0, start: undefined }], ["PreferredStockValue", 20, "USD", { qtrs: 0, start: undefined }],
    ["EntityCommonStockSharesOutstanding", 10, "shares", { qtrs: 0, start: undefined }],
  ]);
  const result = buildStatements(companyFacts, filing, marketCloseCutoff("2022-11-01"), "bank-insurer");
  expect(result.balanceSheet.commonEquity).toBe(180);
  expect(result.annualIncome.at(-1)).toMatchObject({ commonNetIncome: 30, commonDividends: 5 });
});

test("derives C-style common income only from sourced components", () => {
  const result = buildStatements(facts([
    ["NetIncomeLoss", 100], ["DividendsPreferredStock", -5], ["NetIncomeLossAttributableToNoncontrollingInterest", 2],
    ["StockholdersEquity", 200, "USD", { qtrs: 0, start: undefined }], ["PreferredStockValue", 20, "USD", { qtrs: 0, start: undefined }],
    ["EntityCommonStockSharesOutstanding", 10, "shares", { qtrs: 0, start: undefined }],
  ]), filing, marketCloseCutoff("2022-11-01"), "bank-insurer");
  expect(result.annualIncome.at(-1).commonNetIncome).toBe(93);
  expect(result.annualIncome.at(-1).commonNetIncomeBasis).toBe("derived");
  expect(result.annualIncome.at(-1).commonNetIncomeProvenance).toMatchObject({ basis: "derived" });
  expect(result.financials.provenance.tagsSelected["commonNetIncome:2022-09-30"]).toMatchObject({ preferredDividends: expect.any(Object), nciIncome: expect.any(Object) });
});

test("keeps distinct USB share segments and selects exact common stock", () => {
  const parsed = parseFsdsFacts([
    { adsh: accession, tag: "CommonStockSharesOutstanding", uom: "shares", ddate: "20220930", qtrs: "0", segments: "", coreg: "", value: "1400", version: "us-gaap/2022" },
    { adsh: accession, tag: "CommonStockSharesOutstanding", uom: "shares", ddate: "20220930", qtrs: "0", segments: "EquityComponents=CommonStock;", coreg: "", value: "1484", version: "us-gaap/2022" },
  ], filing);
  expect(parsed.facts["us-gaap"].CommonStockSharesOutstanding.units.shares).toHaveLength(2);
  const companyFacts = facts([
    ["RevenueFromContractWithCustomerExcludingAssessedTax", 100], ["ProfitLoss", 10], ["NetCashProvidedByUsedInOperatingActivities", 100],
    ["PaymentsToAcquirePropertyPlantAndEquipment", -5], ["CashAndCashEquivalentsAtCarryingValue", 20, "USD", { qtrs: 0, start: undefined }],
  ]);
  companyFacts.facts["us-gaap"].CommonStockSharesOutstanding = parsed.facts["us-gaap"].CommonStockSharesOutstanding;
  expect(buildStatements(companyFacts, filing, marketCloseCutoff("2022-11-01")).sharesOutstanding).toBe(1484);
});

test("uses cash, capex, and generic share fallbacks with extension namespaces", () => {
  const extension = parseFsdsFacts([{ adsh: accession, tag: "ExtensionCash", version: "lyft/2022", uom: "USD", ddate: "20220930", qtrs: "0", segments: "", coreg: "", value: "1" }], filing);
  expect(extension.facts["lyft/2022"].ExtensionCash.units.USD[0].namespace).toBe("lyft/2022");
  for (const [namespace, tag, value] of [
    ["lyft", "PaymentsToAcquireOtherProductiveAssets", -3],
    ["lyft", "PaymentsToAcquirePropertyAndEquipmentAndScooterFleet", -4],
  ]) {
    const companyFacts = facts([
      ["RevenueFromContractWithCustomerExcludingAssessedTax", 100], ["ProfitLoss", 10], ["NetCashProvidedByUsedInOperatingActivities", 100],
      ["CashAndCashEquivalentsAtCarryingValue", 20, "USD", { qtrs: 0, start: undefined }], ["SharesOutstanding", 10, "shares", { qtrs: 0, start: undefined }],
    ]);
    companyFacts.facts[namespace] = { [tag]: { units: { USD: [fact(tag, value)] } } };
    const result = buildStatements(companyFacts, filing, marketCloseCutoff("2022-11-01"));
    expect(result.annualCashFlow.at(-1).freeCashFlow).toBe(100 - Math.abs(value));
    expect(result.balanceSheet.provenance.tagsSelected[`capex:2022-09-30`].namespace).toBe(namespace);
    expect(result.sharesOutstanding).toBe(10);
  }
  const issuerCash = facts([
    ["RevenueFromContractWithCustomerExcludingAssessedTax", 100], ["ProfitLoss", 10], ["NetCashProvidedByUsedInOperatingActivities", 100], ["PaymentsToAcquirePropertyPlantAndEquipment", -5],
    ["CashandCashEquivalentsExcludingTimeDepositsatCarryingValue", 25, "USD", { qtrs: 0, start: undefined }], ["SharesOutstanding", 10, "shares", { qtrs: 0, start: undefined }],
  ]);
  const result = buildStatements(issuerCash, filing, marketCloseCutoff("2022-11-01"));
  expect(result.balanceSheet.cashAndEquivalents).toBe(25);
  const restrictedCash = facts([
    ["RevenueFromContractWithCustomerExcludingAssessedTax", 100], ["ProfitLoss", 10], ["NetCashProvidedByUsedInOperatingActivities", 100], ["PaymentsToAcquirePropertyPlantAndEquipment", -5],
    ["CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", 26, "USD", { qtrs: 0, start: undefined }], ["SharesOutstanding", 10, "shares", { qtrs: 0, start: undefined }],
  ]);
  expect(buildStatements(restrictedCash, filing, marketCloseCutoff("2022-11-01")).balanceSheet.cashAndEquivalents).toBe(26);
});

function syntheticRow(entry) {
  const bank = entry.cohort === "bank-insurer";
  const unsupported = entry.cohort === "unsupported";
  const row = {
    ticker: entry.ticker, expectedCohort: entry.cohort, asOfDate: "2022-11-01T20:00:00.000Z", outcomeDate: "2023-11-01T20:00:00.000Z", capturedAt: "2022-11-01T20:00:00.000Z", priceBasis: "split-adjusted", asOfPrice: 100, outcomePrice: 110, riskFreeRate: 0.04,
    summary: { sector: entry.sector, industry: entry.industry, sharesOutstanding: 10, currentPrice: 100, asOfPrice: 100, marketCap: 1000, beta: 1 },
    financials: { availableDate: "2022-10-15T16:00:00.000Z", revenueGrowth: entry.cohort === "growth-fcff" ? 0.2 : 0.05 },
    balanceSheet: { availableDate: "2022-10-15T16:00:00.000Z", totalCash: bank ? 0 : 10, cashAndEquivalents: bank ? null : 10, currentInvestments: null, totalDebt: 0, freecashflow: null, commonEquity: bank ? 100 : null },
    annualIncome: [{ date: "2022-09-30", availableDate: "2022-10-15T16:00:00.000Z", totalRevenue: bank ? null : 100, netIncome: bank ? null : 10, commonNetIncome: bank ? 10 : null }],
    annualCashFlow: [{ date: "2022-09-30", availableDate: "2022-10-15T16:00:00.000Z", freeCashFlow: bank ? null : (unsupported ? -1 : 10) }],
    provenance: { sec: { filing: { accession: entry.accession } } },
  };
  return { format: "valuation-backtest-fixture/v1", version: 1, generatedAt: "2022-11-01T20:00:00.000Z", sources: [{ provider: "mock" }], rows: [row] };
}

test("builds all cohorts sequentially and adds coverage", async () => {
  const manifest = validateManifest(readManifest());
  expect(manifest.rows.find((row) => row.ticker === "TSLA")).toMatchObject({ cik: "1318605", accession: "0000950170-22-000796", cohort: "growth-fcff" });
  const built = await buildBaseline(manifest, { archiveDir: "/tmp", now: "2022-11-01T20:00:00.000Z", ingest: async (args) => syntheticRow({ ticker: args.ticker, accession: args.accession, sector: args.sector, industry: args.industry, cohort: args["expected-cohort"] }), yahooClient: { chart: async () => ({ quotes: [] }) }, env: { FRED_API_KEY: "test" } });
  expect(built.fixture.rows).toHaveLength(30);
  expect(built.results.summary["growth-fcff"].coverage).toBe(1);
  expect(built.results.summary.unsupported.coverage).toBe(0);
});

test("classifies the manifest GS industry as a financial cohort without expected passthrough", () => {
  const gs = readManifest().rows.find((row) => row.ticker === "GS");
  const row = syntheticRow({ ticker: gs.ticker, accession: gs.accession, sector: gs.sector, industry: gs.industry, cohort: gs.cohort }).rows[0];
  delete row.expectedCohort;
  expect(runValuationBacktest([row]).records[0].cohort).toBe("bank-insurer");
});

test("wraps a batch source failure with its ticker", async () => {
  await expect(buildBaseline(readManifest(), {
    archiveDir: "/tmp",
    yahooClient: { chart: async () => ({ quotes: [] }) },
    ingest: async () => { throw new Error("source failed"); },
  })).rejects.toThrow("JPM: source failed");
});

test("publishes fixture hash and cleans up on a failed second publication", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "baseline-publish-"));
  const fixturePath = resolve(dir, "fixture.json");
  const blockedDir = resolve(dir, "blocked");
  const resultsPath = resolve(blockedDir, "results.json");
  try {
    const published = publishArtifacts({ fixture: { ok: true }, results: { records: [], summary: {} }, fixturePath, resultsPath });
    const bytes = readFileSync(fixturePath);
    expect(published.fixtureHash).toBe(createHash("sha256").update(bytes).digest("hex"));
    rmSync(fixturePath, { force: true });
    rmSync(blockedDir, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("keeps the first final when the second exclusive link fails", () => {
  const dir = mkdtempSync(resolve(tmpdir(), "baseline-publish-failure-"));
  const fixturePath = resolve(dir, "fixture.json");
  const resultsPath = resolve(dir, "results.json");
  let links = 0;
  try {
    expect(() => publishArtifacts({
      fixture: { ok: true }, results: { records: [], summary: {} }, fixturePath, resultsPath,
      fileOps: { linkSync: (from, to) => { links += 1; if (links === 2) throw new Error("injected publish failure"); linkSync(from, to); } },
    })).toThrow("injected publish failure");
    expect(existsSync(fixturePath)).toBe(true);
    expect(JSON.parse(readFileSync(fixturePath, "utf8"))).toEqual({ ok: true });
    expect(existsSync(resultsPath)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
