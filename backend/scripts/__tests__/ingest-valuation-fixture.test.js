import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { PassThrough } from "node:stream";
import {
  calculateBeta,
  adjustSharesToAsOf,
  fetchRiskFreeRate,
  fetchTiingoPrices,
  ingestSnapshot,
  main,
  marketCloseCutoff,
  parseFsdsArchive,
  parseFsdsFacts,
  readArchiveEntry,
  selectFsdsFiling,
} from "../ingest-valuation-fixture.js";
import { validateReplayRow } from "../valuation-backtest.js";

const env = { FRED_API_KEY: "fred-secret" };
const accession = "0000000000-22-000001";
const periodEnd = "2021-12-31";

function fact(tag, value, unit = "USD", extra = {}) {
  return { tag, units: { [unit]: [{ val: value, accn: accession, form: "10-K", filed: "2021-12-15", start: "2021-01-01", end: periodEnd, ...extra }] } };
}

function companyFacts() {
  return {
    entityName: "Fixture Corporation",
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: {
            USD: [
              { ...fact("RevenueFromContractWithCustomerExcludingAssessedTax", 1000).units.USD[0], fp: "FY" },
            ],
          },
        },
        OperatingIncomeLoss: fact("OperatingIncomeLoss", 180),
        ProfitLoss: fact("ProfitLoss", 120),
        IncomeTaxExpenseBenefit: fact("IncomeTaxExpenseBenefit", 30),
        IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: fact("ebt", 150),
        InterestExpenseNonOperating: fact("InterestExpenseNonOperating", 20),
        NetCashProvidedByUsedInOperatingActivities: fact("NetCashProvidedByUsedInOperatingActivities", 250),
        PaymentsToAcquirePropertyPlantAndEquipment: fact("PaymentsToAcquirePropertyPlantAndEquipment", -50),
        CashAndCashEquivalentsAtCarryingValue: {
          units: { USD: [{ val: 500, accn: accession, form: "10-K", filed: "2021-12-15", end: periodEnd }] },
        },
        LongTermDebtNoncurrent: {
          units: { USD: [{ val: 100, accn: accession, form: "10-K", filed: "2021-12-15", end: periodEnd }] },
        },
        ShortTermBorrowings: {
          units: { USD: [{ val: 9, accn: accession, form: "10-K", filed: "2021-12-15", end: periodEnd }] },
        },
        LongTermDebtCurrent: {
          units: { USD: [{ val: 11, accn: accession, form: "10-K", filed: "2021-12-15", end: periodEnd }] },
        },
        StockholdersEquity: {
          units: { USD: [{ val: 200, accn: accession, form: "10-K", filed: "2021-12-15", end: periodEnd }] },
        },
      },
      dei: {
        EntityCommonStockSharesOutstanding: {
          units: { shares: [{ val: 100, accn: accession, form: "10-K", filed: "2021-12-15", end: periodEnd }] },
        },
      },
    },
  };
}

function response(body, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body, text: async () => JSON.stringify(body) };
}

function monthlyQuotes(multiplier = 1) {
  const quotes = [];
  for (let year = 2020, month = 1; year < 2022 || (year === 2022 && month <= 1);) {
    const date = year === 2022 && month === 1 ? "2022-01-03" : `${year}-${String(month).padStart(2, "0")}-28`;
    const index = quotes.length;
    quotes.push({ date, close: (100 + index * 2) * multiplier });
    month += 1;
    if (month === 13) { year += 1; month = 1; }
  }
  return quotes;
}

function yahooClient() {
  const client = {
    requests: [],
    chart: async (ticker, options) => {
      client.requests.push({ ticker, ...options });
      if (options.interval === "1d") {
        return {
          quotes: [
            { date: new Date("2022-01-03T00:00:00Z"), close: 50 },
            { date: new Date("2023-01-03T00:00:00Z"), close: 60 },
          ],
          events: {
            splits: {
              "1641168000": { date: "2022-01-03", numerator: 2, denominator: 1 },
              "1654041600": { date: "2022-06-01", numerator: 2, denominator: 1 },
            },
          },
        };
      }
      if (ticker === "SPY") return { quotes: monthlyQuotes(1.1) };
      return {
        quotes: monthlyQuotes(1),
        events: { splits: { "1641168000": { date: "2022-01-03", numerator: 2, denominator: 1 } } },
      };
    },
  };
  return client;
}

function shortHistoryYahooClient() {
  const client = yahooClient();
  const chart = client.chart;
  client.chart = async (ticker, options) => {
    const result = await chart(ticker, options);
    return options.interval === "1mo" ? { ...result, quotes: result.quotes.slice(0, 12) } : result;
  };
  return client;
}

function fetchImpl(url) {
  if (url.includes("fred")) return Promise.resolve(response({ observations: [{ date: "2022-01-03", value: "1.50" }] }));
  return Promise.reject(new Error("unexpected URL"));
}

function tiingoRows(multiplier = 1) {
  const rows = monthlyQuotes(multiplier).map((quote) => ({ date: quote.date, close: quote.close, splitFactor: quote.date === "2021-06-28" ? 2 : 1 }));
  rows[rows.length - 1].close = 50;
  rows.push({ date: "2022-06-01", close: 30, splitFactor: 2 });
  rows.push({ date: "2023-01-03", close: 30, splitFactor: 1 });
  return rows;
}

function tiingoResponse(body, ok = true) {
  const text = JSON.stringify(body);
  return {
    ok,
    status: ok ? 200 : 503,
    text: async () => text,
  };
}

function tiingoFetch(rows = tiingoRows()) {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return tiingoResponse(url.includes("/SPY/") ? tiingoRows(1.1).filter((row) => row.date <= "2022-01-03") : rows);
  };
  fetcher.requests = requests;
  return fetcher;
}

const mockArchivePath = "/tmp/sec-fsds-2022q1.zip";
function mockArchiveReader(_archivePath, entry, onLine, { postClose = false, omitTag = null } = {}) {
  const currentFacts = companyFacts().facts;
  if (entry === "sub.txt") {
    const headers = ["adsh", "cik", "name", "sic", "form", "period", "fy", "fp", "filed", "accepted", "instance"];
    const rows = postClose
      ? [
        ["0000000000-22-000099", "1", "Fixture Corporation", "7372", "10-K", "20211231", "2021", "FY", "20220103", "2022-01-03 17:00:00.0", "post.xml"],
        [accession, "1", "Fixture Corporation", "7372", "10-K", "20211231", "2021", "FY", "20211215", "2021-12-15 12:00:00.0", "fixture.xml"],
      ]
      : [[accession, "1", "Fixture Corporation", "7372", "10-K", "20211231", "2021", "FY", "20211215", "2021-12-15 12:00:00.0", "fixture.xml"]];
    return Promise.resolve().then(async () => {
      await onLine(headers.join("\t"));
      for (const row of rows) await onLine(row.join("\t"));
    });
  }
  if (entry !== "num.txt") throw new Error(`unexpected archive entry ${entry}`);
  const headers = ["adsh", "tag", "version", "ddate", "qtrs", "uom", "segments", "coreg", "value"];
  return Promise.resolve().then(async () => {
    await onLine(headers.join("\t"));
    for (const namespaceFacts of Object.values(currentFacts)) {
      for (const [tag, definition] of Object.entries(namespaceFacts)) {
        for (const [uom, values] of Object.entries(definition.units)) {
          for (const value of values) {
            if (tag === omitTag) continue;
            const qtrs = value.start ? 4 : 0;
            await onLine([accession, tag, "us-gaap/2022", value.end.replaceAll("-", ""), qtrs, uom, "", "", value.val].join("\t"));
          }
        }
      }
    }
  });
}

function archiveOptions(overrides = {}) {
  return { archiveReader: (path, entry, onLine) => mockArchiveReader(path, entry, onLine, overrides), archiveSha256: "a".repeat(64), archiveHasher: async () => "a".repeat(64) };
}

test("selects an FSDS filing by DST-aware acceptance cutoff", () => {
  const rows = [
    { adsh: "late", cik: "1", form: "10-K", filed: "20220103", accepted: "2022-01-03 17:00:00.0", period: "20211231", fy: "2021", fp: "FY" },
    { adsh: accession, cik: "1", form: "10-K", filed: "20211215", accepted: "2021-12-15 12:00:00.0", period: "20211231", fy: "2021", fp: "FY" },
  ];
  expect(selectFsdsFiling(rows, "1", "2022-01-03", marketCloseCutoff("2022-01-03")).adsh).toBe(accession);
});

test("parses qtrs=4 annual and qtrs=0 instant FSDS facts with raw ddate", () => {
  const parsed = parseFsdsFacts([
    { adsh: accession, tag: "RevenueFromContractWithCustomerExcludingAssessedTax", uom: "USD", ddate: "20211231", qtrs: "4", value: "1000", segments: "", coreg: "" },
    { adsh: accession, tag: "CommonStockSharesOutstanding", uom: "shares", ddate: "20211231", qtrs: "0", value: "100", segments: "", coreg: "" },
  ], { adsh: accession, form: "10-K", filed: "20211215", accepted: "2021-12-15 12:00:00.0" });
  expect(parsed.facts["us-gaap"].RevenueFromContractWithCustomerExcludingAssessedTax.units.USD[0]).toMatchObject({ qtrs: 4, rawDdate: "20211231" });
  expect(parsed.facts["us-gaap"].CommonStockSharesOutstanding.units.shares[0].qtrs).toBe(0);
  const blanks = parseFsdsFacts([
    { adsh: accession, tag: "BlankQtrs", uom: "USD", ddate: "20211231", qtrs: " ", value: "1", segments: "", coreg: "" },
    { adsh: accession, tag: "BlankValue", uom: "USD", ddate: "20211231", qtrs: "4", value: "", segments: "", coreg: "" },
    { adsh: accession, tag: "MissingValue", uom: "USD", ddate: "20211231", qtrs: "0", segments: "", coreg: "" },
  ], { adsh: accession, form: "10-K", filed: "20211215" });
  expect(blanks.facts["us-gaap"]).toEqual({});
});

test("rejects prototype-polluting FSDS keys without modifying Object.prototype", () => {
  for (const field of ["version", "tag", "uom"]) {
    const row = { adsh: accession, tag: "SafeTag", uom: "USD", ddate: "20211231", qtrs: "0", value: "1", segments: "", coreg: "" };
    row[field] = "__proto__";
    expect(() => parseFsdsFacts([row], { adsh: accession, form: "10-K", filed: "20211215" })).toThrow("Unsafe FSDS");
  }
  expect(Object.prototype.polluted).toBeUndefined();
});

test("rejects conflicting duplicate FSDS facts but accepts identical duplicates", () => {
  const base = { adsh: accession, tag: "CashAndCashEquivalentsAtCarryingValue", uom: "USD", ddate: "20211231", qtrs: "0", segments: "", coreg: "" };
  expect(() => parseFsdsFacts([{ ...base, value: "1" }, { ...base, value: "2" }], { adsh: accession, form: "10-K", filed: "20211215" })).toThrow("Conflicting FSDS duplicate");
  expect(parseFsdsFacts([{ ...base, value: "1" }, { ...base, value: "1" }], { adsh: accession, form: "10-K", filed: "20211215" }).facts["us-gaap"].CashAndCashEquivalentsAtCarryingValue.units.USD).toHaveLength(1);
});

test("fails when an archive entry is missing or unzip exits nonzero", async () => {
  await expect(readArchiveEntry("/tmp/does-not-exist-sec-fsds.zip", "sub.txt", () => {})).rejects.toThrow();
});

test("handles an unzip child error as a clean rejection", async () => {
  await expect(readArchiveEntry("archive.zip", "sub.txt", () => {}, {}, () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {
      child.exitCode = 1;
      child.stdout.end();
      child.stderr.end();
      child.emit("close", 1);
      return true;
    };
    queueMicrotask(() => child.emit("error", new Error("EMFILE")));
    return child;
  })).rejects.toThrow("EMFILE");
});

test("rejects a single archive line before readline buffers it", async () => {
  await expect(readArchiveEntry("archive.zip", "num.txt", () => {}, { maxLineBytes: 32 }, () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {
      child.exitCode = 1;
      child.stdout.end();
      child.stderr.end();
      child.emit("close", 1);
      return true;
    };
    queueMicrotask(() => {
      child.stdout.write(Buffer.alloc(64, 65));
      child.stdout.end();
    });
    return child;
  })).rejects.toThrow("single-line byte limit");
});

test("terminates an archive reader that exceeds its timeout", async () => {
  await expect(readArchiveEntry("archive.zip", "num.txt", () => {}, { timeoutMs: 5 }, () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.kill = () => {
      child.exitCode = 1;
      child.stdout.end();
      child.stderr.end();
      child.emit("close", 1);
      return true;
    };
    return child;
  })).rejects.toThrow("Timed out reading");
});

test("caps matched FSDS rows before retaining them", async () => {
  await expect(parseFsdsArchive(mockArchivePath, {
    cik: "1",
    asOfDate: "2022-01-03",
    cutoff: marketCloseCutoff("2022-01-03"),
    archiveReader: mockArchiveReader,
    archiveSha256: "a".repeat(64),
    hasher: async () => "a".repeat(64),
    limits: { maxMatchedRows: 1 },
  })).rejects.toThrow("matched-row limit");
});

test("caps matched target-CIK submissions before retaining them", async () => {
  const headers = ["adsh", "cik", "name", "sic", "form", "period", "fy", "fp", "filed", "accepted", "instance"];
  const row = [accession, "1", "Fixture Corporation", "7372", "10-K", "20211231", "2021", "FY", "20211215", "2021-12-15 12:00:00.0", "fixture.xml"];
  const archiveReader = async (_path, entry, onLine) => {
    if (entry !== "sub.txt") return;
    await onLine(headers.join("\t"));
    await onLine(row.join("\t"));
    await onLine(row.join("\t"));
  };
  await expect(parseFsdsArchive(mockArchivePath, {
    cik: "1",
    asOfDate: "2022-01-03",
    cutoff: marketCloseCutoff("2022-01-03"),
    archiveReader,
    archiveSha256: "a".repeat(64),
    hasher: async () => "a".repeat(64),
    limits: { maxMatchedSubmissions: 1 },
  })).rejects.toThrow("matched-submission limit");
});

test("computes beta directly from Yahoo split-normalized raw closes", () => {
  const ticker = [];
  const benchmark = [];
  for (let index = 0; index < 25; index += 1) {
    const date = index < 24
      ? new Date(Date.UTC(2020, index, 28)).toISOString().slice(0, 10)
      : "2022-01-03";
    ticker.push({ date, close: 100 });
    benchmark.push({ date, close: 100 + index });
  }
  expect(calculateBeta(ticker, benchmark).beta).toBeCloseTo(0);
});

test("allows insufficient beta history only for unsupported rows", async () => {
  const shortTicker = Array.from({ length: 12 }, (_, index) => ({ date: `2020-${String(index + 1).padStart(2, "0")}-28`, close: 100 + index }));
  const shortBenchmark = shortTicker.map((quote, index) => ({ ...quote, close: 110 + index }));
  expect(() => calculateBeta(shortTicker, shortBenchmark)).toThrow("Insufficient aligned monthly returns");
  const fixture = await ingestSnapshot({ ticker: "FIX", cik: "1", "as-of": "2022-01-03", sector: "Technology", industry: "Software", output: "/tmp/unused.json", "sec-archive": mockArchivePath, "expected-cohort": "unsupported" }, {
    env,
    yahooClient: shortHistoryYahooClient(),
    fetchImpl,
    ...archiveOptions(),
  });
  expect(fixture.rows[0].summary.beta).toBeNull();
  expect(fixture.rows[0].provenance.beta).toMatchObject({ status: "unavailable-insufficient-history", alignedReturns: 11, reason: "required-24-observed-11" });
});

test("adjusts reported shares once for pre-as-of splits and preserves provenance", () => {
  const result = adjustSharesToAsOf(100, "2021-01-01", "2022-08-10", [
    { date: "2022-07-15", factor: 20 },
    { date: "2022-07-15", factor: 20 },
  ]);
  expect(result).toMatchObject({ reportedShares: 100, sharePeriod: "2021-01-01", factor: 20, adjustedShares: 2000 });
  expect(result.appliedEvents).toHaveLength(1);
  expect(adjustSharesToAsOf(100, "2021-01-01", "2022-07-14", [{ date: "2022-07-15", factor: 20 }]).factor).toBe(1);
  expect(adjustSharesToAsOf(100, "2022-07-15", "2022-08-10", [{ date: "2022-07-15", factor: 20 }]).factor).toBe(1);
});

test("requests a vintage-bounded FRED observation and converts percent once", async () => {
  let requestedUrl = "";
  const result = await fetchRiskFreeRate("2022-01-03", env, async (url) => {
    requestedUrl = url;
    return response({ observations: [{ date: "2022-01-03", value: "4.10" }] });
  });
  expect(result.value).toBe(0.041);
  expect(JSON.stringify(result.value)).toBe("0.041");
  expect(requestedUrl).toContain("realtime_start=2022-01-03");
  expect(requestedUrl).toContain("realtime_end=2022-01-03");
  expect(result.provenance.url).not.toContain("fred-secret");
});

test("uses Tiingo raw closes and split factors for as-of, outcome, beta, and share history", async () => {
  const envTiingo = { ...env, VALUATION_PRICE_PROVIDER: "tiingo", TIINGO_API_TOKEN: "tiingo-secret" };
  const fetcher = tiingoFetch();
  const price = await fetchTiingoPrices("FIX", "2022-01-03", envTiingo, fetcher, "2026-08-24T00:00:00Z");
  expect(price).toMatchObject({ provider: "Tiingo EOD", asOfDate: "2022-01-03", asOfPrice: 50, outcomeDate: "2023-01-03", outcomePrice: 60, rebaseFactor: 2 });
  expect(price.historicalSplits).toContainEqual({ date: "2021-06-28", factor: 2 });
  expect(Number.isFinite(price.beta)).toBe(true);
  expect(price.requests).toHaveLength(2);
  expect(price.requests.every((request) => !JSON.stringify(request).includes("tiingo-secret"))).toBe(true);
  expect(fetcher.requests.every(({ options }) => options.headers.Authorization === "Token tiingo-secret")).toBe(true);
});

test("rejects malformed Tiingo rows and insufficient coverage", async () => {
  const envTiingo = { ...env, TIINGO_API_TOKEN: "tiingo-secret" };
  await expect(fetchTiingoPrices("FIX", "2022-01-03", envTiingo, tiingoFetch([{ date: "2022-01-03", close: 50, splitFactor: 0 }]), "2026-08-24T00:00:00Z")).rejects.toThrow("splitFactor");
  await expect(fetchTiingoPrices("FIX", "2022-01-03", envTiingo, tiingoFetch([{ date: "2022-01-03", close: 50, splitFactor: 1 }]), "2026-08-24T00:00:00Z")).rejects.toThrow("one-year");
});

test("selects Tiingo only when configured and requires only its token", async () => {
  await expect(ingestSnapshot({ ticker: "FIX", cik: "1", "as-of": "2022-01-03", sector: "Technology", industry: "Software", output: "/tmp/unused.json", "sec-archive": mockArchivePath }, {
    env: { ...env, VALUATION_PRICE_PROVIDER: "tiingo" },
    fetchImpl: tiingoFetch(),
  })).rejects.toThrow("TIINGO_API_TOKEN");
  await expect(ingestSnapshot({ ticker: "FIX", cik: "1", "as-of": "2022-01-03", sector: "Technology", industry: "Software", output: "/tmp/unused.json", "sec-archive": mockArchivePath }, {
    env: { ...env, VALUATION_PRICE_PROVIDER: "bogus" },
  })).rejects.toThrow("Unknown valuation price provider");
});

test("rejects stale, malformed, and non-array FRED observations", async () => {
  await expect(fetchRiskFreeRate("2022-01-03", env, async () => response({ observations: [{ date: "1900-01-01", value: "4.10" }] }))).rejects.toThrow("No finite");
  await expect(fetchRiskFreeRate("2022-01-03", env, async () => response({ observations: [{ date: "not-a-date", value: "4.10" }] }))).rejects.toThrow("date is invalid");
  await expect(fetchRiskFreeRate("2022-01-03", env, async () => response({ observations: {} }))).rejects.toThrow("must be an array");
});

test("ingests a valid row that the valuation harness accepts", async () => {
  const client = yahooClient();
  const fixture = await ingestSnapshot({ ticker: "FIX", cik: "1", "as-of": "2022-01-03", sector: "Technology", industry: "Software", output: "/tmp/unused.json", "sec-archive": mockArchivePath }, {
    env,
    fetchImpl,
    yahooClient: client,
    now: "2026-08-23T12:00:00Z",
    ...archiveOptions(),
  });
  expect(fixture.rows).toHaveLength(1);
  expect(fixture.rows[0]).toMatchObject({ asOfDate: "2022-01-03T21:00:00.000Z", outcomeDate: "2023-01-03T21:00:00.000Z", asOfPrice: 100, outcomePrice: 120, riskFreeRate: 0.015 });
  expect(fixture.rows[0].provenance.price.rebaseFactor).toBe(2);
  expect(fixture.rows[0].provenance.price.rawCloseBasis).toContain("adjclose is intentionally unused");
  expect(fixture.rows[0].summary.beta).toBeCloseTo(1);
  expect(fixture.rows[0].provenance.sec.filing.accession).toBe(accession);
  expect(fixture.rows[0].balanceSheet.totalDebt).toBe(120);
  expect(fixture.rows[0].balanceSheet.provenance.tagsSelected["currentDebt:shortTermBorrowings"].tag).toBe("ShortTermBorrowings");
  expect(fixture.rows[0].balanceSheet.provenance.tagsSelected["currentDebt:currentMaturities"].tag).toBe("LongTermDebtCurrent");
  expect(fixture.rows[0].provenance.sec.filing.url).toContain("https://www.sec.gov/Archives/");
  expect(fixture.sources[0]).toMatchObject({ provider: "SEC FSDS", sourceUrl: expect.stringContaining("2022q1.zip"), localArchiveSha256: "a".repeat(64) });
  expect(fixture.rows[0].provenance.sec.archive.localArchiveSha256).toBe("a".repeat(64));
  expect(client.requests.find((request) => request.interval === "1d").period2).toBe("2026-08-23");
});

test("uses the prior accession when same-day filing acceptance is after the close", async () => {
  const fixture = await ingestSnapshot({ ticker: "FIX", cik: "1", "as-of": "2022-01-03", sector: "Technology", industry: "Software", output: "/tmp/unused.json", "sec-archive": mockArchivePath }, {
    env,
    yahooClient: yahooClient(),
    fetchImpl,
    ...archiveOptions({ postClose: true }),
  });
  expect(marketCloseCutoff("2022-01-03")).toBe("2022-01-03T21:00:00.000Z");
  expect(fixture.rows[0].provenance.sec.filing.accession).toBe(accession);
  expect(validateReplayRow(fixture.rows[0])).toEqual([]);
});

test("does not write output when a source fails", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "valuation-ingest-"));
  const output = resolve(directory, "fixture.json");
  try {
    await expect(main(["--ticker", "FIX", "--cik", "1", "--as-of", "2022-01-03", "--sector", "Technology", "--industry", "Software", "--output", output, "--sec-archive", mockArchivePath], {
      env,
      yahooClient: yahooClient(),
      fetchImpl: async () => response({}, false),
    })).rejects.toThrow();
    expect(existsSync(output)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("does not overwrite an existing output", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "valuation-ingest-"));
  const output = resolve(directory, "fixture.json");
  writeFileSync(output, "sentinel\n");
  try {
    await expect(main(["--ticker", "FIX", "--cik", "1", "--as-of", "2022-01-03", "--sector", "Technology", "--industry", "Software", "--output", output, "--sec-archive", mockArchivePath], {
      env,
      yahooClient: yahooClient(),
      fetchImpl,
      ...archiveOptions(),
    })).rejects.toThrow();
    expect(readFileSync(output, "utf8")).toBe("sentinel\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fails closed when SEC has neither cash nor current investments", async () => {
  await expect(ingestSnapshot({ ticker: "FIX", cik: "1", "as-of": "2022-01-03", sector: "Technology", industry: "Software", output: "/tmp/unused.json", "sec-archive": mockArchivePath }, {
    env,
    yahooClient: yahooClient(),
    fetchImpl,
    ...archiveOptions({ omitTag: "CashAndCashEquivalentsAtCarryingValue" }),
  })).rejects.toThrow("cash and current investments");
});
