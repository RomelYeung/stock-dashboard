import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { validateReplayRow, runValuationBacktest } from "./valuation-backtest.js";

const require = createRequire(import.meta.url);
const backendPackage = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const yahooFinanceVersion = String(backendPackage.dependencies["yahoo-finance2"]).replace(/^[^\d]*/, "");

const SEC_FSDS_BASE = "https://www.sec.gov/files/dera/data/financial-statement-data-sets";
const FRED_BASE = "https://api.stlouisfed.org/fred/series/observations";
const TIINGO_BASE = "https://api.tiingo.com/tiingo/daily";
const DAY_MS = 24 * 60 * 60 * 1000;
const YEAR_DAYS = 365;
const MIN_BETA_RETURNS = 24;
const ARCHIVE_LIMITS = {
  maxBytes: 750_000_000,
  maxLines: 10_000_000,
  maxLineBytes: 4_000_000,
  timeoutMs: 10 * 60 * 1000,
  maxMatchedSubmissions: 10_000,
  maxMatchedRows: 250_000,
};
const FINANCIAL_FORMS = new Set(["10-K", "10-K/A"]);
const ACCESSION_PATTERN = /^\d{10}-\d{2}-\d{6}$/;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const COMMON_SHARE_SEGMENT_PATTERN = /^EquityComponents=CommonStock;?$/;
const COMMON_SHARE_TAGS = new Set(["EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding"]);
const CORE_FIELDS = {
  revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "Revenues", "RevenuesNetOfInterestExpense"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["ProfitLoss", "NetIncomeLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
  tax: ["IncomeTaxExpenseBenefit", "IncomeTaxExpenseBenefitContinuingOperations"],
  ebt: [
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxes",
  ],
  interest: ["InterestExpenseNonOperating", "InterestExpenseDebt", "InterestAndDebtExpense"],
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PurchasesOfPropertyAndEquipmentAndIntangibleAssets", "PaymentsToAcquireOtherProductiveAssets", "PaymentsToAcquirePropertyAndEquipmentAndScooterFleet"],
  cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents", "CashandCashEquivalentsExcludingTimeDepositsatCarryingValue"],
  investments: [
    "MarketableSecuritiesCurrent",
    "ShortTermInvestments",
    "AvailableForSaleSecuritiesCurrent",
    "ShortTermInvestmentsAndMarketableSecurities",
  ],
  currentDebtAggregate: ["DebtCurrent"],
  currentDebtComponents: [
    { name: "shortTermBorrowings", tags: ["ShortTermBorrowings", "CommercialPaper"] },
    { name: "currentMaturities", tags: ["LongTermDebtCurrent", "CurrentPortionOfLongTermDebt"] },
  ],
  noncurrentDebt: ["LongTermDebtNoncurrent", "LongTermDebtAndFinanceLeaseObligationsNoncurrent"],
  debtFallback: ["LongTermDebt"],
  shares: ["EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding", "SharesOutstanding"],
  annualShares: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic"],
  commonNetIncome: ["NetIncomeLossAvailableToCommonStockholdersBasic"],
  preferredDividends: ["DividendsPreferredStock", "PaymentsOfDividendsPreferredStock"],
  nciIncome: ["NetIncomeLossAttributableToNoncontrollingInterest"],
  commonDividends: ["PaymentsOfDividendsCommonStock", "DividendsCommonStockCash", "DividendsCommonStock", "PaymentsOfDividends"],
  totalEquity: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  preferredEquity: ["PreferredStockIncludingAdditionalPaidInCapitalNetOfDiscount", "PreferredStockIncludingAdditionalPaidInCapital", "PreferredStockRedeemableandNonRedeemableValue", "PreferredStockValue", "PreferredStockLiquidationPreferenceValue"],
};

function finite(value) {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const number = Number(typeof value === "string" ? value.trim() : value);
  return Number.isFinite(number) ? number : null;
}

function assertSafeArchiveKey(value, label) {
  if (UNSAFE_KEYS.has(String(value))) throw new Error(`Unsafe FSDS ${label}`);
}

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function marketCloseCutoff(dateOnly) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOnly));
  if (!match) throw new Error(`Invalid trading date: ${dateOnly}`);
  const [year, month, day] = match.slice(1).map(Number);
  const targetLocalAsUtc = Date.UTC(year, month - 1, day, 16);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  let candidate = targetLocalAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]));
    const representedLocalAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    candidate = targetLocalAsUtc - (representedLocalAsUtc - candidate);
  }
  return new Date(candidate).toISOString();
}

function dateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function dateMs(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseArgs(args = []) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    parsed[key] = args[index + 1]?.startsWith("--") ? true : args[++index];
  }
  const required = ["ticker", "cik", "as-of", "sector", "industry", "output", "sec-archive"];
  const missing = required.filter((key) => !parsed[key]);
  if (missing.length) throw new Error(`Missing required arguments: ${missing.join(", ")}`);
  if (!/^\d{1,10}$/.test(String(parsed.cik))) throw new Error("CIK must contain only digits");
  if (!isoDate(parsed["as-of"])) throw new Error("--as-of must be an ISO date");
  if (parsed.accession && !ACCESSION_PATTERN.test(String(parsed.accession))) throw new Error("--accession must be a SEC accession");
  if (parsed["classification-effective-date"]
    && (!isoDate(parsed["classification-effective-date"]) || parsed["classification-effective-date"] > isoDate(parsed["as-of"]))) {
    throw new Error("--classification-effective-date must be on or before --as-of");
  }
  return parsed;
}

function assertCredentials(env = process.env) {
  if (!env.FRED_API_KEY) throw new Error("FRED_API_KEY is not configured");
}

function sanitizeError(error, secret) {
  return String(error?.message || error).replaceAll(secret || "\u0000", "[redacted]");
}

function sha256Text(value) {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

async function fetchJson(url, options = {}, fetchImpl = globalThis.fetch, secret = null) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    throw new Error(`Source fetch failed: ${sanitizeError(error, secret)}`);
  }
  if (!response?.ok) {
    let detail = "";
    try { detail = await response.text(); } catch { /* response body is optional */ }
    throw new Error(`Source fetch failed (${response?.status || "unknown"}): ${sanitizeError(detail, secret)}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`Source returned invalid JSON: ${sanitizeError(error, secret)}`);
  }
}

function normalizedCik(cik) {
  return String(cik).padStart(10, "0");
}

function accessionKey(value) {
  return String(value || "").replaceAll("-", "");
}

function archiveQuarter(archivePath) {
  const match = String(archivePath).match(/(\d{4})q([1-4])\.zip$/i);
  if (!match) throw new Error("--sec-archive basename must contain YYYYqN.zip");
  return `${match[1]}q${match[2]}`;
}

function calendarQuarter(dateOnly) {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  return `${date.getUTCFullYear()}q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function localNewYorkToUtc(rawValue) {
  const match = String(rawValue || "").match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = "0"] = match;
  const targetLocalAsUtc = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  let candidate = targetLocalAsUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]));
    const representedLocalAsUtc = Date.UTC(
      Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second),
    );
    candidate = targetLocalAsUtc - (representedLocalAsUtc - candidate);
  }
  return new Date(candidate).toISOString();
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function readArchiveEntry(archivePath, entry, onLine, limits = {}, spawnImpl = spawn) {
  const maxBytes = limits.maxBytes ?? ARCHIVE_LIMITS.maxBytes;
  const maxLines = limits.maxLines ?? ARCHIVE_LIMITS.maxLines;
  const maxLineBytes = limits.maxLineBytes ?? ARCHIVE_LIMITS.maxLineBytes;
  const timeoutMs = limits.timeoutMs ?? ARCHIVE_LIMITS.timeoutMs;
  const child = spawnImpl("unzip", ["-p", archivePath, entry], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = `${stderr}${chunk}`.slice(-8192);
  });
  let bytes = 0;
  let lineCount = 0;
  let currentLineBytes = 0;
  let processingError = null;
  let childError = null;
  let terminated = false;
  let killTimer = null;
  const terminate = () => {
    if (terminated) return;
    terminated = true;
    child.kill("SIGTERM");
    killTimer = setTimeout(() => {
      if (child.exitCode == null) child.kill("SIGKILL");
    }, 1000);
  };
  const closePromise = new Promise((resolveClose) => {
    child.once("close", (code, signal) => resolveClose({ code, signal }));
  });
  child.once("error", (error) => {
    childError = error;
    terminate();
  });
  child.stdout.on("data", (chunk) => {
    if (processingError) return;
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let start = 0;
    while (start < buffer.length) {
      const newline = buffer.indexOf(10, start);
      const end = newline === -1 ? buffer.length : newline + 1;
      currentLineBytes += end - start;
      if (currentLineBytes > maxLineBytes) {
        processingError = new Error(`SEC archive ${entry} exceeds single-line byte limit`);
        terminate();
        return;
      }
      currentLineBytes = newline === -1 ? currentLineBytes : 0;
      start = end;
    }
  });
  const timeout = timeoutMs > 0 ? setTimeout(() => {
    processingError = new Error(`Timed out reading ${entry} from SEC archive`);
    terminate();
  }, timeoutMs) : null;
  try {
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    for await (const line of lines) {
      lineCount += 1;
      bytes += Buffer.byteLength(line) + 1;
      if (lineCount > maxLines) throw new Error(`SEC archive ${entry} exceeds line limit`);
      if (bytes > maxBytes) throw new Error(`SEC archive ${entry} exceeds byte limit`);
      await onLine(line);
    }
  } catch (error) {
    processingError ||= error;
    terminate();
  }
  const { code: exitCode } = await closePromise;
  if (timeout) clearTimeout(timeout);
  if (killTimer) clearTimeout(killTimer);
  if (processingError) throw processingError;
  if (childError) throw new Error(`Unable to read ${entry} from SEC archive: ${childError.message}`);
  if (exitCode !== 0) throw new Error(`Unable to read ${entry} from SEC archive: ${stderr.trim() || `unzip exit ${exitCode}`}`);
}

function tsvRecord(line, headers) {
  const values = line.split("\t");
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
}

function selectFsdsFiling(rows, cik, asOfDate, cutoff, expectedAccession = null) {
  const padded = normalizedCik(cik);
  const cutoffMs = dateMs(cutoff);
  if (expectedAccession && !ACCESSION_PATTERN.test(expectedAccession)) throw new Error("Expected SEC accession is invalid");
  const asOfTradingDate = isoDate(asOfDate);
  const matching = rows.filter((row) => String(row.cik).padStart(10, "0") === padded
    && (!expectedAccession || row.adsh === expectedAccession));
  if (expectedAccession && matching.length !== 1) {
    throw new Error(`Expected SEC accession ${expectedAccession} matched ${matching.length} submissions`);
  }
  const eligible = matching.filter((row) => {
    if (!FINANCIAL_FORMS.has(row.form)) return false;
    if (!/^\d{8}$/.test(row.filed || "") || `${row.filed.slice(0, 4)}-${row.filed.slice(4, 6)}-${row.filed.slice(6, 8)}` > asOfTradingDate) return false;
    if (row.accepted) return dateMs(localNewYorkToUtc(row.accepted)) <= cutoffMs;
    return row.filed < asOfTradingDate.replaceAll("-", "");
  });
  eligible.sort((a, b) => String(b.filed).localeCompare(String(a.filed)) || String(b.accepted || "").localeCompare(String(a.accepted || "")));
  if (!eligible[0]) throw new Error(`No eligible FSDS 10-K filing found by ${cutoff}`);
  const filing = eligible[0];
  return {
    ...filing,
    accessionNumber: filing.adsh,
    filingDate: `${filing.filed.slice(0, 4)}-${filing.filed.slice(4, 6)}-${filing.filed.slice(6, 8)}`,
    acceptanceDateTime: filing.accepted ? localNewYorkToUtc(filing.accepted) : null,
    acceptedUtc: filing.accepted ? localNewYorkToUtc(filing.accepted) : null,
    periodDate: `${filing.period.slice(0, 4)}-${filing.period.slice(4, 6)}-${filing.period.slice(6, 8)}`,
  };
}

function parseFsdsFacts(rows, filing) {
  const selected = new Map();
  for (const row of rows) {
    assertSafeArchiveKey(row.version, "namespace");
    assertSafeArchiveKey(row.tag, "tag");
    assertSafeArchiveKey(row.uom, "unit");
    const segment = String(row.segments || "").trim();
    const shareSegment = COMMON_SHARE_TAGS.has(row.tag) && COMMON_SHARE_SEGMENT_PATTERN.test(segment);
    if (row.adsh !== filing.adsh || (segment && !shareSegment) || String(row.coreg || "").trim()) continue;
    const rawQtrs = String(row.qtrs ?? "").trim();
    if (!["0", "4"].includes(rawQtrs)) continue;
    const qtrs = Number(rawQtrs);
    if (![0, 4].includes(qtrs) || !row.tag || !row.uom || !/^\d{8}$/.test(row.ddate || "")) continue;
    const value = finite(row.value);
    if (value == null) continue;
    const namespace = String(row.version || "").startsWith("us-gaap/") ? "us-gaap" : String(row.version || "").trim() || "us-gaap";
    const key = `${row.adsh}|${namespace}|${row.tag}|${row.uom}|${row.ddate}|${qtrs}|${segment}`;
    const prior = selected.get(key);
    if (prior && prior.val !== value) throw new Error(`Conflicting FSDS duplicate for ${row.tag} ${row.ddate} qtrs=${qtrs}`);
    if (!prior) selected.set(key, {
      tag: row.tag,
      val: value,
      uom: row.uom,
      accn: row.adsh,
      form: filing.form,
      filed: `${filing.filed.slice(0, 4)}-${filing.filed.slice(4, 6)}-${filing.filed.slice(6, 8)}`,
      fy: filing.fy ? Number(filing.fy) : null,
      fp: filing.fp || null,
      qtrs,
      end: `${row.ddate.slice(0, 4)}-${row.ddate.slice(4, 6)}-${row.ddate.slice(6, 8)}`,
      rawDdate: row.ddate,
      rawValue: row.value,
      namespace,
      ...(segment ? { segment } : {}),
    });
  }
  const facts = {};
  for (const fact of selected.values()) {
    facts[fact.namespace] ||= {};
    facts[fact.namespace][fact.tag] ||= { units: {} };
    facts[fact.namespace][fact.tag].units[fact.uom] ||= [];
    facts[fact.namespace][fact.tag].units[fact.uom].push(fact);
  }
  return { facts: { "us-gaap": {}, ...facts } };
}

async function parseFsdsArchive(archivePath, {
  cik,
  asOfDate,
  cutoff,
  expectedAccession = null,
  archiveReader = readArchiveEntry,
  archiveSha256 = null,
  expectedArchiveSha256 = null,
  hasher = sha256File,
  limits = {},
} = {}) {
  const quarter = archiveQuarter(archivePath);
  const quarterMatchesAsOf = quarter === calendarQuarter(asOfDate);
  if (!quarterMatchesAsOf && !expectedAccession) throw new Error(`SEC archive ${quarter} does not match as-of quarter ${calendarQuarter(asOfDate)}`);
  const expectedHash = expectedArchiveSha256 || archiveSha256;
  const verifiedHash = await hasher(archivePath);
  if (expectedHash && verifiedHash !== expectedHash) throw new Error(`SEC archive SHA-256 mismatch for ${quarter}`);
  const submissions = [];
  const maxMatchedSubmissions = limits.maxMatchedSubmissions ?? ARCHIVE_LIMITS.maxMatchedSubmissions;
  let subHeaders = null;
  await archiveReader(archivePath, "sub.txt", async (line) => {
    if (!subHeaders) { subHeaders = line.split("\t"); return; }
    const record = tsvRecord(line, subHeaders);
    if ((record.cik === String(Number(cik)) || String(record.cik).padStart(10, "0") === normalizedCik(cik))
      && (!expectedAccession || record.adsh === expectedAccession)) {
      if (submissions.length >= maxMatchedSubmissions) throw new Error("SEC archive sub.txt exceeds matched-submission limit");
      submissions.push(record);
    }
  }, limits);
  const filing = selectFsdsFiling(submissions, cik, asOfDate, cutoff, expectedAccession);
  const numRows = [];
  const maxMatchedRows = limits.maxMatchedRows ?? ARCHIVE_LIMITS.maxMatchedRows;
  let numHeaders = null;
  await archiveReader(archivePath, "num.txt", async (line) => {
    if (!numHeaders) { numHeaders = line.split("\t"); return; }
    const record = tsvRecord(line, numHeaders);
    if (record.adsh === filing.adsh) {
      if (numRows.length >= maxMatchedRows) throw new Error(`SEC archive num.txt exceeds matched-row limit for ${filing.adsh}`);
      numRows.push(record);
    }
  }, limits);
  const companyFacts = parseFsdsFacts(numRows, filing);
  const afterHash = await hasher(archivePath);
  if (afterHash !== verifiedHash) throw new Error(`SEC archive changed while reading ${quarter}`);
  return {
    companyFacts,
    filing,
    archive: {
      quarter,
      expectedAccession: expectedAccession || null,
      archiveQuarterOverrideAuthorized: Boolean(expectedAccession && !quarterMatchesAsOf),
      sourceUrl: `${SEC_FSDS_BASE}/${quarter}.zip`,
      localArchiveSha256: verifiedHash,
    },
  };
}

function chartQuotes(chart) {
  return (chart?.quotes || chart?.data?.quotes || []).map((quote) => ({
    date: isoDate(quote.date || quote.timestamp * 1000),
    close: finite(quote.close),
  })).filter((quote) => quote.date && quote.close != null);
}

function parseSplitRatio(value) {
  if (typeof value === "string" && value.includes(":")) {
    const [numerator, denominator] = value.split(":").map(Number);
    return numerator > 0 && denominator > 0 ? numerator / denominator : null;
  }
  if (value && typeof value === "object") {
    const numerator = finite(value.numerator ?? value.splitNumerator);
    const denominator = finite(value.denominator ?? value.splitDenominator);
    return numerator > 0 && denominator > 0 ? numerator / denominator : null;
  }
  return finite(value) > 0 ? finite(value) : null;
}

function chartSplits(chart) {
  const events = chart?.events?.splits || chart?.data?.events?.splits || {};
  const values = Array.isArray(events) ? events : Object.entries(events).map(([timestamp, event]) => ({ timestamp, ...event }));
  return values.map((event) => ({
    date: isoDate(event.date || event.timestamp * 1000 || event.timestamp),
    factor: parseSplitRatio(event.splitRatio ?? event.ratio ?? event),
  })).filter((event) => event.date && event.factor != null);
}

function monthKey(date) {
  return date.slice(0, 7);
}

function monthEndQuotes(quotes) {
  const latest = new Map();
  for (const quote of quotes) {
    const prior = latest.get(monthKey(quote.date));
    if (!prior || quote.date > prior.date) latest.set(monthKey(quote.date), quote);
  }
  return [...latest.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function calculateBeta(tickerQuotes, benchmarkQuotes, { allowInsufficient = false } = {}) {
  const tickerMonths = monthEndQuotes(tickerQuotes);
  const benchmarkMonths = monthEndQuotes(benchmarkQuotes);
  const benchmarkByMonth = new Map(benchmarkMonths.map((quote) => [monthKey(quote.date), quote]));
  const aligned = tickerMonths
    .filter((quote) => benchmarkByMonth.has(monthKey(quote.date)))
    .map((quote) => ({ ticker: quote.close, benchmark: benchmarkByMonth.get(monthKey(quote.date)).close }))
    .filter((quote) => quote.ticker > 0 && quote.benchmark > 0);
  const returns = [];
  for (let index = 1; index < aligned.length; index += 1) {
    returns.push({
      ticker: aligned[index].ticker / aligned[index - 1].ticker - 1,
      benchmark: aligned[index].benchmark / aligned[index - 1].benchmark - 1,
    });
  }
  if (returns.length < MIN_BETA_RETURNS) {
    if (allowInsufficient) {
      return {
        beta: null,
        alignedReturns: returns.length,
        betaStatus: "unavailable-insufficient-history",
        betaReason: `required-${MIN_BETA_RETURNS}-observed-${returns.length}`,
      };
    }
    throw new Error(`Insufficient aligned monthly returns for beta (${returns.length})`);
  }
  const tickerMean = returns.reduce((sum, value) => sum + value.ticker, 0) / returns.length;
  const benchmarkMean = returns.reduce((sum, value) => sum + value.benchmark, 0) / returns.length;
  const covariance = returns.reduce((sum, value) => sum + (value.ticker - tickerMean) * (value.benchmark - benchmarkMean), 0);
  const variance = returns.reduce((sum, value) => sum + (value.benchmark - benchmarkMean) ** 2, 0);
  if (!(variance > 0)) throw new Error("Benchmark monthly returns have zero variance");
  return { beta: covariance / variance, alignedReturns: returns.length, betaStatus: "available", betaReason: null };
}

function sourceFactGroups(companyFacts, filing, knowledgeCutoff) {
  const selectedAccession = accessionKey(filing.accessionNumber);
  const groups = [];
  for (const [namespace, namespaceFacts] of Object.entries(companyFacts?.facts || {})) {
    for (const [tag, definition] of Object.entries(namespaceFacts || {})) {
      for (const [unit, facts] of Object.entries(definition.units || {})) {
        for (const fact of facts || []) {
          if (accessionKey(fact.accn) !== selectedAccession) continue;
          if (!FINANCIAL_FORMS.has(fact.form) || dateMs(fact.filed) > dateMs(knowledgeCutoff)) continue;
          if (fact.end && dateMs(fact.end) > dateMs(knowledgeCutoff)) continue;
          groups.push({ namespace, tag, unit, fact: { ...fact, value: finite(fact.val) } });
        }
      }
    }
  }
  return groups.filter((entry) => entry.fact.value != null);
}

function chooseFact(groups, tags, { unit = null, periodEnd = null, duration = false, segment = null } = {}) {
  let candidates = groups.filter((entry) => tags.includes(entry.tag)
    && (!unit || entry.unit === unit)
    && (!periodEnd || entry.fact.end === periodEnd)
    && (!segment || entry.fact.segment === segment)
    && (!duration || (
      entry.fact.qtrs === 4
      || (entry.fact.start
        && entry.fact.end
        && (dateMs(entry.fact.end) - dateMs(entry.fact.start)) / DAY_MS >= 250
        && (dateMs(entry.fact.end) - dateMs(entry.fact.start)) / DAY_MS <= 450)
    )));
  if (duration && candidates.some((entry) => entry.fact.fp === "FY")) {
    candidates = candidates.filter((entry) => entry.fact.fp === "FY");
  }
  candidates.sort((a, b) => {
    const period = (dateMs(b.fact.end) || 0) - (dateMs(a.fact.end) || 0);
    if (period) return period;
    const filed = String(b.fact.filed || "").localeCompare(String(a.fact.filed || ""));
    return filed || String(tags.indexOf(a.tag) - tags.indexOf(b.tag));
  });
  return candidates[0] || null;
}

function annualPeriodEnds(groups) {
  const ends = new Set();
  for (const entry of groups) {
    const { fact } = entry;
    if (fact.qtrs === 4 && fact.end) { ends.add(fact.end); continue; }
    if (!fact.start || !fact.end) continue;
    const days = (dateMs(fact.end) - dateMs(fact.start)) / DAY_MS;
    if (days >= 250 && days <= 450) ends.add(fact.end);
  }
  return [...ends].sort();
}

function recordValue(groups, tags, periodEnd, units) {
  for (const unit of units) {
    const selected = chooseFact(groups, tags, { unit, periodEnd, duration: true });
    if (selected) return { value: selected.fact.value, source: selected };
  }
  return { value: null, source: null };
}

function instantValue(groups, tags, units, options = {}) {
  for (const unit of units) {
    const selected = chooseFact(groups, tags, { unit, ...options });
    if (selected) return { value: selected.fact.value, source: selected };
  }
  return { value: null, source: null };
}

function pointInTimeCommonShares(groups) {
  const priority = [
    ["EntityCommonStockSharesOutstanding", "unsegmented"],
    ["EntityCommonStockSharesOutstanding", "common"],
    ["CommonStockSharesOutstanding", "common"],
    ["CommonStockSharesOutstanding", "unsegmented"],
    ["SharesOutstanding", "unsegmented"],
  ];
  for (const [tag, segmentKind] of priority) {
    const candidates = groups.filter((entry) => entry.tag === tag && entry.unit === "shares"
      && (segmentKind === "common" ? COMMON_SHARE_SEGMENT_PATTERN.test(entry.fact.segment || "") : !entry.fact.segment));
    const selected = chooseFact(candidates, [tag], { unit: "shares" });
    if (selected) return { value: selected.fact.value, source: selected };
  }
  return { value: null, source: null };
}

function sourceDescription(source) {
  if (!source) return null;
  return {
    namespace: source.namespace,
    tag: source.tag,
    unit: source.unit,
    accession: source.fact.accn,
    ...(source.fact.qtrs != null ? { qtrs: source.fact.qtrs } : {}),
    ...(source.fact.rawDdate ? { rawDdate: source.fact.rawDdate } : {}),
    ...(source.fact.segment ? { segment: source.fact.segment } : {}),
  };
}

function annualBalanceRows(groups, periodEnds, availableDate, tagsSelected) {
  return periodEnds.map((date) => {
    const equity = instantValue(groups, CORE_FIELDS.totalEquity, ["USD"], { periodEnd: date });
    const cash = instantValue(groups, CORE_FIELDS.cash, ["USD"], { periodEnd: date });
    const currentDebtAggregate = instantValue(groups, CORE_FIELDS.currentDebtAggregate, ["USD"], { periodEnd: date });
    const currentDebtComponents = currentDebtAggregate.value == null
      ? CORE_FIELDS.currentDebtComponents
        .map((component) => ({ ...component, value: instantValue(groups, component.tags, ["USD"], { periodEnd: date }) }))
        .filter((component) => component.value.value != null)
      : [];
    const currentDebt = currentDebtAggregate.value != null
      ? currentDebtAggregate.value
      : currentDebtComponents.reduce((sum, component) => sum + component.value.value, 0);
    const noncurrentDebt = instantValue(groups, CORE_FIELDS.noncurrentDebt, ["USD"], { periodEnd: date });
    const debtFallback = noncurrentDebt.value == null
      ? instantValue(groups, CORE_FIELDS.debtFallback, ["USD"], { periodEnd: date })
      : { value: null, source: null };
    const totalDebt = currentDebt + (noncurrentDebt.value ?? debtFallback.value ?? 0);
    if (![equity.value, totalDebt, cash.value].every((value) => Number.isFinite(value))) return null;
    const provenance = {
      availableDate,
      tagsSelected: {
        totalEquity: sourceDescription(equity.source),
        cash: sourceDescription(cash.source),
        ...(currentDebtAggregate.source
          ? { currentDebt: sourceDescription(currentDebtAggregate.source) }
          : Object.fromEntries(currentDebtComponents.map((component) => [
            `currentDebt:${component.name}`, sourceDescription(component.value.source),
          ]))),
        noncurrentDebt: sourceDescription(noncurrentDebt.source || debtFallback.source),
      },
    };
    tagsSelected[`annualBalanceSheet:${date}`] = provenance;
    return { date, periodEnd: date, availableDate, totalEquity: equity.value, totalDebt, cash: cash.value, provenance };
  }).filter(Boolean);
}

function buildStatements(companyFacts, filing, knowledgeCutoff, expectedCohort = null) {
  const groups = sourceFactGroups(companyFacts, filing, knowledgeCutoff);
  const periodEnds = annualPeriodEnds(groups);
  const availableDate = filing.acceptanceDateTime || filing.filingDate;
  const tagsSelected = {};
  const annualBalanceSheet = annualBalanceRows(groups, periodEnds, availableDate, tagsSelected);
  const annualIncome = [];
  const annualCashFlow = [];
  for (const date of periodEnds) {
    const revenue = recordValue(groups, CORE_FIELDS.revenue, date, ["USD"]);
    const operatingIncome = recordValue(groups, CORE_FIELDS.operatingIncome, date, ["USD"]);
    const netIncome = recordValue(groups, CORE_FIELDS.netIncome, date, ["USD"]);
    const tax = recordValue(groups, CORE_FIELDS.tax, date, ["USD"]);
    const ebt = recordValue(groups, CORE_FIELDS.ebt, date, ["USD"]);
    const interest = recordValue(groups, CORE_FIELDS.interest, date, ["USD"]);
    const operatingCashFlow = recordValue(groups, CORE_FIELDS.operatingCashFlow, date, ["USD"]);
    const capex = recordValue(groups, CORE_FIELDS.capex, date, ["USD"]);
    const directCommonNetIncome = recordValue(groups, CORE_FIELDS.commonNetIncome, date, ["USD"]);
    const preferredDividends = recordValue(groups, CORE_FIELDS.preferredDividends, date, ["USD"]);
    const nciIncome = recordValue(groups, CORE_FIELDS.nciIncome, date, ["USD"]);
    const commonNetIncome = directCommonNetIncome.value != null
      ? { ...directCommonNetIncome, basis: "direct", provenance: { basis: "direct", source: sourceDescription(directCommonNetIncome.source) } }
      : netIncome.value != null && preferredDividends.value != null && nciIncome.value != null
        ? {
          value: netIncome.value - Math.abs(preferredDividends.value) - nciIncome.value,
          source: null,
          basis: "derived",
          provenance: {
            basis: "derived",
            netIncome: sourceDescription(netIncome.source),
            preferredDividends: sourceDescription(preferredDividends.source),
            nciIncome: sourceDescription(nciIncome.source),
          },
        }
        : { value: null, source: null, basis: null, provenance: null };
    const commonDividends = recordValue(groups, CORE_FIELDS.commonDividends, date, ["USD"]);
    const income = {
      date,
      periodEnd: date,
      availableDate,
      totalRevenue: revenue.value,
      operatingIncome: operatingIncome.value,
      netIncome: netIncome.value,
      incomeTaxExpense: tax.value,
      ebt: ebt.value,
      interestExpense: interest.value == null ? null : Math.abs(interest.value),
      commonNetIncome: commonNetIncome.value,
      commonDividends: commonDividends.value,
      commonNetIncomeBasis: commonNetIncome.basis,
      commonNetIncomeProvenance: commonNetIncome.provenance,
    };
    const cashFlow = {
      date,
      periodEnd: date,
      availableDate,
      operatingCashFlow: operatingCashFlow.value,
      capitalExpenditures: capex.value == null ? null : Math.abs(capex.value),
      freeCashFlow: operatingCashFlow.value == null || capex.value == null ? null : operatingCashFlow.value - Math.abs(capex.value),
    };
    for (const [name, value] of Object.entries({ revenue, operatingIncome, netIncome, tax, ebt, interest, operatingCashFlow, capex, directCommonNetIncome, preferredDividends, nciIncome, commonDividends })) {
      if (value.source) tagsSelected[`${name}:${date}`] = sourceDescription(value.source);
    }
    if (commonNetIncome.provenance) tagsSelected[`commonNetIncome:${date}`] = commonNetIncome.provenance;
    annualIncome.push(income);
    annualCashFlow.push(cashFlow);
  }
  if (annualIncome.length === 0 || annualCashFlow.length === 0) throw new Error("SEC facts contain no plausible annual periods");
  const latestIncome = annualIncome.at(-1);
  const latestCashFlow = annualCashFlow.find((record) => record.date === latestIncome.date);
  const revenueHistory = annualIncome.map((record) => record.totalRevenue).filter((value) => value > 0);
  const revenueGrowth = revenueHistory.length >= 2
    ? Math.pow(revenueHistory.at(-1) / revenueHistory.at(-2), 1) - 1
    : 0.05;
  const cash = instantValue(groups, CORE_FIELDS.cash, ["USD"]);
  const investments = instantValue(groups, CORE_FIELDS.investments, ["USD"]);
  if (expectedCohort !== "bank-insurer" && cash.value == null && investments.value == null) {
    throw new Error("SEC facts are missing both cash and current investments");
  }
  const currentDebtAggregate = instantValue(groups, CORE_FIELDS.currentDebtAggregate, ["USD"]);
  const currentDebtComponents = currentDebtAggregate.value == null
    ? CORE_FIELDS.currentDebtComponents
      .map((component) => ({ ...component, value: instantValue(groups, component.tags, ["USD"]) }))
      .filter((component) => component.value.value != null)
    : [];
  const currentDebt = currentDebtAggregate.value != null
    ? currentDebtAggregate
    : {
      value: currentDebtComponents.reduce((sum, component) => sum + component.value.value, 0),
      source: null,
    };
  const noncurrentDebt = instantValue(groups, CORE_FIELDS.noncurrentDebt, ["USD"]);
  const debtFallback = noncurrentDebt.value == null ? instantValue(groups, CORE_FIELDS.debtFallback, ["USD"]) : { value: null, source: null };
  const pointShares = pointInTimeCommonShares(groups);
  const annualShares = pointShares.value == null
    ? recordValue(groups, CORE_FIELDS.annualShares, latestIncome.date, ["shares"])
    : { value: null, source: null };
  const shares = pointShares.value == null ? annualShares : pointShares;
  const shareBasis = pointShares.value == null ? "annual-weighted-average" : "point-in-time";
  const sharePeriod = shares.source?.fact.end || null;
  if (expectedCohort !== "bank-insurer"
    && (latestIncome.totalRevenue == null || latestIncome.netIncome == null || latestCashFlow.freeCashFlow == null || shares.value == null)) {
    throw new Error("SEC facts are missing core annual revenue, net income, free cash flow, or shares");
  }
  const totalEquity = instantValue(groups, CORE_FIELDS.totalEquity, ["USD"]);
  const preferredEquity = instantValue(groups, CORE_FIELDS.preferredEquity, ["USD"]);
  const commonEquity = totalEquity.value != null && preferredEquity.value != null
    ? totalEquity.value - preferredEquity.value
    : null;
  if (expectedCohort === "bank-insurer" && !(commonEquity > 0 && latestIncome.commonNetIncome != null && shares.value > 0)) {
    throw new Error("SEC facts are missing bank common net income, positive common equity, or shares");
  }
  for (const [name, value] of Object.entries({ cash, investments, noncurrentDebt, debtFallback, shares, totalEquity, preferredEquity })) {
    if (value.source) tagsSelected[name] = sourceDescription(value.source);
  }
  if (currentDebtAggregate.source) {
    tagsSelected["currentDebt:aggregate"] = sourceDescription(currentDebtAggregate.source);
  } else {
    for (const component of currentDebtComponents) {
      tagsSelected[`currentDebt:${component.name}`] = sourceDescription(component.value.source);
    }
  }
  const totalCash = (cash.value || 0) + (investments.value || 0);
  const totalDebt = (currentDebt.value || 0) + (noncurrentDebt.value ?? debtFallback.value ?? 0);
  return {
    financials: { availableDate, revenueGrowth, provenance: { tagsSelected } },
    balanceSheet: {
      availableDate,
      totalCash,
      cashAndEquivalents: cash.value,
      currentInvestments: investments.value,
      totalDebt,
      currentDebt: currentDebt.value,
      noncurrentDebt: noncurrentDebt.value ?? debtFallback.value,
      operatingCashflow: latestCashFlow.operatingCashFlow,
      capitalExpenditures: latestCashFlow.capitalExpenditures,
      freeCashflow: latestCashFlow.freeCashFlow,
      totalEquity: totalEquity.value,
      preferredEquity: preferredEquity.value,
      commonEquity,
      annualBalanceSheet,
      shareBasis,
      sharePeriod,
      provenance: { tagsSelected },
    },
    annualIncome,
    annualCashFlow,
    sharesOutstanding: shares.value,
    sec: {
      accession: filing.accessionNumber,
      filingDate: filing.filingDate,
      acceptanceDateTime: filing.acceptanceDateTime || null,
      availableDate,
      shareBasis,
      sharePeriod,
      tagsSelected,
    },
  };
}

async function fetchSecData({ cik, knowledgeCutoff, archivePath, archiveReader, archiveSha256, expectedArchiveSha256, archiveHasher, limits, expectedAccession, expectedCohort }) {
  const padded = normalizedCik(cik);
  const parsed = await parseFsdsArchive(archivePath, {
    cik: padded,
    asOfDate: isoDate(knowledgeCutoff),
    cutoff: knowledgeCutoff,
    expectedAccession,
    archiveReader,
    archiveSha256,
    expectedArchiveSha256,
    hasher: archiveHasher,
    limits,
  });
  const { filing, companyFacts, archive } = parsed;
  const statements = buildStatements(companyFacts, filing, knowledgeCutoff, expectedCohort);
  return {
    ...statements,
    metadata: {
      entityName: filing.name || companyFacts.entityName || null,
      cik: padded,
      sic: filing.sic || null,
      sicDescription: filing.sicDescription || null,
      filing: {
        form: filing.form,
        accession: filing.accessionNumber,
        filingDate: filing.filingDate,
        acceptanceDateTime: filing.acceptanceDateTime || null,
        primaryDocument: filing.primaryDocument || null,
        url: `https://www.sec.gov/Archives/edgar/data/${Number(padded)}/${accessionKey(filing.accessionNumber)}/${filing.instance || filing.primaryDocument || ""}`,
        acceptedRaw: filing.accepted || null,
        acceptedUtc: filing.acceptedUtc,
        period: filing.period,
        fy: filing.fy || null,
        fp: filing.fp || null,
      },
      shares: {
        reportedShares: statements.sharesOutstanding,
        shareBasis: statements.balanceSheet.shareBasis,
        sharePeriod: statements.balanceSheet.sharePeriod,
        source: statements.balanceSheet.provenance.tagsSelected.shares || null,
      },
      archive,
    },
  };
}

async function fetchRiskFreeRate(asOfDate, env, fetchImpl) {
  const start = isoDate(new Date(dateMs(asOfDate) - 14 * DAY_MS));
  const params = new URLSearchParams({
    series_id: "DGS10",
    api_key: env.FRED_API_KEY,
    file_type: "json",
    observation_start: start,
    observation_end: asOfDate,
    realtime_start: asOfDate,
    realtime_end: asOfDate,
    units: "lin",
  });
  const data = await fetchJson(`${FRED_BASE}?${params}`, {}, fetchImpl, env.FRED_API_KEY);
  if (!Array.isArray(data.observations)) throw new Error("FRED observations must be an array");
  for (const observation of data.observations) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(observation?.date || "")) || isoDate(observation.date) !== observation.date) {
      throw new Error("FRED observation date is invalid");
    }
  }
  const observations = data.observations
    .filter((observation) => observation.date >= start && observation.date <= asOfDate && observation.value !== ".")
    .map((observation) => ({ date: observation.date, value: finite(observation.value) }))
    .filter((observation) => observation.value != null);
  observations.sort((a, b) => a.date.localeCompare(b.date));
  const latest = observations.at(-1);
  if (!latest) throw new Error(`No finite DGS10 observation on or before ${asOfDate}`);
  return {
    value: Number((latest.value / 100).toFixed(10)),
    observationDate: latest.date,
    provenance: {
      series: "DGS10",
      observationDate: latest.date,
      requestedVintage: { realtimeStart: asOfDate, realtimeEnd: asOfDate },
      url: `${FRED_BASE}?series_id=DGS10&observation_start=${start}&observation_end=${asOfDate}&realtime_start=${asOfDate}&realtime_end=${asOfDate}`,
    },
  };
}

function chartOptions(period1, period2, interval) {
  return { period1, period2, interval, events: "div|split|earn" };
}

function dedupeSplits(splits = []) {
  const unique = new Map();
  for (const split of splits) {
    if (split?.date && Number.isFinite(split.factor) && split.factor > 0) unique.set(`${split.date}|${split.factor}`, split);
  }
  return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function adjustSharesToAsOf(reportedShares, sharePeriod, asOfDate, historicalSplits = []) {
  if (!sharePeriod) throw new Error("SEC share period is required for split-basis adjustment");
  const appliedEvents = dedupeSplits(historicalSplits).filter((split) => split.date > sharePeriod && split.date <= asOfDate);
  const factor = appliedEvents.reduce((value, split) => value * split.factor, 1);
  return { reportedShares, sharePeriod, factor, appliedEvents, adjustedShares: reportedShares * factor };
}

async function fetchPrices(ticker, asOfDate, yahooClient, now, expectedCohort = null) {
  const actualAsOfMs = dateMs(asOfDate);
  const requestedOutcomeTarget = isoDate(new Date(Date.UTC(
    new Date(actualAsOfMs).getUTCFullYear() + 1,
    new Date(actualAsOfMs).getUTCMonth(),
    new Date(actualAsOfMs).getUTCDate(),
  )));
  const minimumRetrievalDate = isoDate(new Date(dateMs(requestedOutcomeTarget) + 7 * DAY_MS));
  const requestedRetrievalDate = isoDate(now) || isoDate(new Date());
  const retrievalDate = requestedRetrievalDate >= minimumRetrievalDate ? requestedRetrievalDate : minimumRetrievalDate;
  const historyStart = isoDate(new Date(actualAsOfMs - 5 * 366 * DAY_MS));
  const [daily, tickerMonthly, benchmarkMonthly] = await Promise.all([
    yahooClient.chart(ticker, chartOptions(asOfDate, retrievalDate, "1d")),
    yahooClient.chart(ticker, chartOptions(historyStart, asOfDate, "1mo")),
    yahooClient.chart("SPY", chartOptions(historyStart, asOfDate, "1mo")),
  ]);
  const dailyQuotes = chartQuotes(daily).sort((a, b) => a.date.localeCompare(b.date));
  const requestedAsOf = dailyQuotes.find((quote) => quote.date >= asOfDate);
  if (!requestedAsOf) throw new Error(`No trading price on or after ${asOfDate}`);
  const actualAsOf = new Date(`${requestedAsOf.date}T00:00:00Z`);
  const actualOutcomeTarget = isoDate(new Date(Date.UTC(
    actualAsOf.getUTCFullYear() + 1,
    actualAsOf.getUTCMonth(),
    actualAsOf.getUTCDate(),
  )));
  const outcome = dailyQuotes.find((quote) => quote.date >= actualOutcomeTarget);
  if (!outcome) throw new Error(`No one-year trading price on or after ${actualOutcomeTarget}`);
  const splits = chartSplits(daily);
  const rebaseEvents = splits.filter((split) =>
    dateMs(split.date) > dateMs(requestedAsOf.date) && dateMs(split.date) <= dateMs(retrievalDate));
  const rebaseFactor = rebaseEvents.reduce((factor, split) => factor * split.factor, 1);
  const beta = calculateBeta(chartQuotes(tickerMonthly), chartQuotes(benchmarkMonthly), { allowInsufficient: expectedCohort === "unsupported" });
  const historicalSplits = chartSplits(tickerMonthly);
  return {
    requestedAsOfDate: asOfDate,
    asOfDate: requestedAsOf.date,
    asOfPrice: requestedAsOf.close * rebaseFactor,
    outcomeDate: outcome.date,
    outcomePrice: outcome.close * rebaseFactor,
    beta: beta.beta,
    betaAlignedReturns: beta.alignedReturns,
    betaStatus: beta.betaStatus,
    betaReason: beta.betaReason,
    splits,
    historicalSplits,
    rebaseEvents,
    rebaseFactor,
    retrievalDate,
    provider: "Yahoo Finance",
    packageVersion: yahooFinanceVersion,
    retrievedAt: now,
    rawCloseBasis: "Yahoo raw close is already split-normalized; adjclose is intentionally unused.",
    splitAdjustment: "None; Yahoo raw close returns are already split-normalized.",
  };
}

function tiingoRequest(ticker, startDate, endDate) {
  const endpoint = `${TIINGO_BASE}/${encodeURIComponent(ticker)}/prices`;
  const params = { endDate, resampleFreq: "daily", startDate };
  const query = new URLSearchParams(params).toString();
  return { endpoint, params, url: `${endpoint}?${query}` };
}

async function fetchTiingoRows(request, token, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(request.url, {
      headers: { Accept: "application/json", Authorization: `Token ${token}` },
    });
  } catch (error) {
    throw new Error(`Tiingo fetch failed: ${sanitizeError(error, token)}`);
  }
  let bytes;
  try {
    bytes = Buffer.from(response?.arrayBuffer
      ? await response.arrayBuffer()
      : await response.text());
  } catch (error) {
    throw new Error(`Tiingo response read failed: ${sanitizeError(error, token)}`);
  }
  const responseHash = createHash("sha256").update(bytes).digest("hex");
  const body = bytes.toString("utf8");
  if (!response?.ok) throw new Error(`Tiingo fetch failed (${response?.status || "unknown"}): ${sanitizeError(body, token)}`);
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`Tiingo returned invalid JSON: ${sanitizeError(error, token)}`);
  }
  if (!Array.isArray(parsed)) throw new Error("Tiingo prices must be an array");
  return { rows: parsed, responseHash };
}

function tiingoRows(rows) {
  if (!Array.isArray(rows)) throw new Error("Tiingo prices must be an array");
  return rows.map((row) => {
    const date = String(row?.date || "").slice(0, 10);
    const close = finite(row?.close);
    const splitFactor = finite(row?.splitFactor);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isoDate(date) !== date) throw new Error("Tiingo price date is invalid");
    if (!(close > 0)) throw new Error("Tiingo raw close must be positive");
    if (!(splitFactor > 0)) throw new Error("Tiingo splitFactor must be positive");
    return { date, close, splitFactor };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function splitFactorBetween(splits, startExclusive, endInclusive) {
  return dedupeSplits(splits)
    .filter((split) => split.date > startExclusive && split.date <= endInclusive)
    .reduce((factor, split) => factor * split.factor, 1);
}

function normalizeTiingoQuotes(rows, splits, asOfDate) {
  return rows.map(({ date, close }) => ({
    date,
    close: close * splitFactorBetween(splits, date, asOfDate),
  }));
}

function tiingoSplits(rows) {
  return dedupeSplits(rows
    .filter(({ splitFactor }) => splitFactor !== 1)
    .map(({ date, splitFactor }) => ({ date, factor: splitFactor })));
}

async function fetchTiingoPrices(ticker, asOfDate, env, fetchImpl, now, expectedCohort = null) {
  if (!String(env?.TIINGO_API_TOKEN || "").trim()) throw new Error("TIINGO_API_TOKEN is not configured");
  const actualAsOfMs = dateMs(asOfDate);
  const requestedOutcomeTarget = isoDate(new Date(Date.UTC(
    new Date(actualAsOfMs).getUTCFullYear() + 1,
    new Date(actualAsOfMs).getUTCMonth(),
    new Date(actualAsOfMs).getUTCDate(),
  )));
  const minimumRetrievalDate = isoDate(new Date(dateMs(requestedOutcomeTarget) + 7 * DAY_MS));
  const requestedRetrievalDate = isoDate(now) || isoDate(new Date());
  const retrievalDate = requestedRetrievalDate >= minimumRetrievalDate ? requestedRetrievalDate : minimumRetrievalDate;
  const historyStart = isoDate(new Date(actualAsOfMs - 5 * 366 * DAY_MS));
  const tickerRequest = tiingoRequest(ticker, historyStart, retrievalDate);
  const benchmarkRequest = tiingoRequest("SPY", historyStart, asOfDate);
  const [tickerResponse, benchmarkResponse] = await Promise.all([
    fetchTiingoRows(tickerRequest, env.TIINGO_API_TOKEN, fetchImpl),
    fetchTiingoRows(benchmarkRequest, env.TIINGO_API_TOKEN, fetchImpl),
  ]);
  const tickerRows = tiingoRows(tickerResponse.rows);
  const benchmarkRows = tiingoRows(benchmarkResponse.rows);
  const requestedAsOf = tickerRows.find((quote) => quote.date >= asOfDate);
  if (!requestedAsOf) throw new Error(`No Tiingo trading price on or after ${asOfDate}`);
  const actualOutcomeTarget = isoDate(new Date(Date.UTC(
    Number(requestedAsOf.date.slice(0, 4)) + 1,
    Number(requestedAsOf.date.slice(5, 7)) - 1,
    Number(requestedAsOf.date.slice(8, 10)),
  )));
  const outcome = tickerRows.find((quote) => quote.date >= actualOutcomeTarget);
  if (!outcome) throw new Error(`No Tiingo one-year trading price on or after ${actualOutcomeTarget}`);
  const splits = tiingoSplits(tickerRows);
  const rebaseEvents = splits.filter((split) => split.date > requestedAsOf.date && split.date <= outcome.date);
  const rebaseFactor = rebaseEvents.reduce((factor, split) => factor * split.factor, 1);
  const tickerBetaRows = normalizeTiingoQuotes(tickerRows.filter((quote) => quote.date <= requestedAsOf.date), splits, requestedAsOf.date);
  const benchmarkBetaRows = normalizeTiingoQuotes(benchmarkRows, tiingoSplits(benchmarkRows), requestedAsOf.date);
  const beta = calculateBeta(tickerBetaRows, benchmarkBetaRows, { allowInsufficient: expectedCohort === "unsupported" });
  const requestHash = sha256Text(tickerRequest.url);
  return {
    requestedAsOfDate: asOfDate,
    asOfDate: requestedAsOf.date,
    asOfPrice: requestedAsOf.close,
    outcomeDate: outcome.date,
    outcomePrice: outcome.close * rebaseFactor,
    beta: beta.beta,
    betaAlignedReturns: beta.alignedReturns,
    betaStatus: beta.betaStatus,
    betaReason: beta.betaReason,
    splits,
    historicalSplits: splits.filter((split) => split.date <= requestedAsOf.date),
    rebaseEvents,
    rebaseFactor,
    retrievalDate,
    provider: "Tiingo EOD",
    packageVersion: null,
    retrievedAt: now,
    rawCloseBasis: "Tiingo EOD raw close; splitFactor is the sole split source.",
    splitAdjustment: "Pre-as-of prices are normalized to actual-as-of share basis; outcome is rebased through actual as-of to outcome.",
    endpoint: tickerRequest.endpoint,
    params: tickerRequest.params,
    requestHash,
    responseHash: tickerResponse.responseHash,
    requests: [
      { endpoint: tickerRequest.endpoint, params: tickerRequest.params, requestHash, responseHash: tickerResponse.responseHash },
      { endpoint: benchmarkRequest.endpoint, params: benchmarkRequest.params, requestHash: sha256Text(benchmarkRequest.url), responseHash: benchmarkResponse.responseHash },
    ],
  };
}

async function ingestSnapshot(args, options = {}) {
  const parsed = typeof args === "string" ? parseArgs(args.split(/\s+/)) : args;
  const env = options.env || process.env;
  const provider = String(env.VALUATION_PRICE_PROVIDER || "yahoo").trim();
  if (provider !== "yahoo" && provider !== "tiingo") throw new Error(`Unknown valuation price provider: ${provider}`);
  if (provider === "tiingo" && !String(env.TIINGO_API_TOKEN || "").trim()) throw new Error("TIINGO_API_TOKEN is not configured");
  assertCredentials(env);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const yahooClient = provider === "yahoo" ? options.yahooClient || new (require("yahoo-finance2").default)() : null;
  const runNow = options.now ? dateTime(options.now) : new Date().toISOString();
  const requestedAsOfDate = isoDate(parsed["as-of"]);
  const price = provider === "tiingo"
    ? await fetchTiingoPrices(parsed.ticker.toUpperCase(), requestedAsOfDate, env, fetchImpl, runNow, parsed["expected-cohort"] || null)
    : await fetchPrices(parsed.ticker.toUpperCase(), requestedAsOfDate, yahooClient, runNow, parsed["expected-cohort"] || null);
  // ponytail: historical early-close calendars are deferred; fixture dates must avoid exchange early closes.
  const asOfCutoff = marketCloseCutoff(price.asOfDate);
  const outcomeCutoff = marketCloseCutoff(price.outcomeDate);
  const sec = await fetchSecData({
    cik: parsed.cik,
    knowledgeCutoff: asOfCutoff,
    archivePath: parsed["sec-archive"],
    archiveReader: options.archiveReader,
    archiveSha256: options.archiveSha256,
    expectedArchiveSha256: parsed["archive-sha256"] || null,
    archiveHasher: options.archiveHasher,
    limits: options.archiveLimits,
    expectedAccession: parsed.accession || null,
    expectedCohort: parsed["expected-cohort"] || null,
  });
  const riskFree = await fetchRiskFreeRate(price.asOfDate, env, fetchImpl);
  const shareAdjustment = adjustSharesToAsOf(
    sec.sharesOutstanding,
    sec.balanceSheet.sharePeriod,
    price.asOfDate,
    price.historicalSplits,
  );
  const adjustedShares = shareAdjustment.adjustedShares;
  const classificationSource = parsed["classification-source"] || null;
  const row = {
    ticker: parsed.ticker.toUpperCase(),
    ...(parsed["expected-cohort"] ? { expectedCohort: parsed["expected-cohort"] } : {}),
    requestedAsOfDate,
    asOfDate: asOfCutoff,
    outcomeDate: outcomeCutoff,
    capturedAt: asOfCutoff,
    priceBasis: "split-adjusted",
    asOfPrice: price.asOfPrice,
    outcomePrice: price.outcomePrice,
    summary: {
      sector: parsed.sector,
      industry: parsed.industry,
      currentPrice: price.asOfPrice,
      asOfPrice: price.asOfPrice,
      sharesOutstanding: adjustedShares,
      reportedSharesOutstanding: sec.sharesOutstanding,
      marketCap: adjustedShares * price.asOfPrice,
      beta: price.beta,
    },
    financials: sec.financials,
    balanceSheet: sec.balanceSheet,
    annualIncome: sec.annualIncome,
    annualCashFlow: sec.annualCashFlow,
    riskFreeRate: riskFree.value,
    provenance: {
      retrievedAt: runNow,
      classification: {
        source: classificationSource ? `CLI/manual: ${classificationSource}` : "CLI/manual",
        effectiveDate: parsed["classification-effective-date"] || null,
      },
      price: {
        provider: price.provider,
        packageVersion: price.packageVersion,
        requestedAsOfDate,
        actualAsOfDate: price.asOfDate,
        actualAsOfCutoff: asOfCutoff,
        outcomeDate: price.outcomeDate,
        outcomeCutoff,
        splitEvents: price.splits,
        retrievalDate: price.retrievalDate,
        rebaseEvents: price.rebaseEvents,
        rebaseFactor: price.rebaseFactor,
        rawCloseBasis: price.rawCloseBasis,
        adjustment: price.splitAdjustment,
        ...(price.endpoint ? {
          endpoint: price.endpoint,
          params: price.params,
          retrievalTime: price.retrievedAt,
          requestHash: price.requestHash,
          responseHash: price.responseHash,
          requests: price.requests,
        } : {}),
      },
      beta: {
        formula: "covariance(ticker monthly returns, SPY monthly returns) / variance(SPY monthly returns)",
        window: "Five years before actual as-of through actual as-of; month-end observations",
        alignedReturns: price.betaAlignedReturns,
        status: price.betaStatus,
        reason: price.betaReason,
        splitAdjustment: price.splitAdjustment,
      },
      sec: sec.metadata,
      shares: {
        reportedShares: sec.sharesOutstanding,
        reportPeriod: sec.balanceSheet.sharePeriod,
        shareBasis: sec.balanceSheet.shareBasis,
        source: sec.balanceSheet.provenance.tagsSelected.shares || null,
        adjustmentFactor: shareAdjustment.factor,
        appliedEvents: shareAdjustment.appliedEvents,
        adjustedShares,
        basis: "actual-as-of share basis",
      },
      fred: riskFree.provenance,
    },
  };
  const reasons = validateReplayRow(row);
  if (reasons.length) throw new Error(`Generated row failed replay validation: ${reasons.join(", ")}`);
  const backtest = runValuationBacktest([row]);
  if (backtest.records.some((record) => record.status === "invalid")) {
    throw new Error(`Generated row failed valuation harness: ${backtest.records[0].reasonCodes.join(", ")}`);
  }
  return {
    format: "valuation-backtest-fixture/v1",
    version: 1,
    generatedAt: runNow,
    methodology: {
      capturedAt: "Historical knowledge cutoff; the actual as-of trading day at the normal 4:00 PM America/New_York market close.",
      requestedAsOfDate,
      actualAsOfDate: price.asOfDate,
      actualAsOfCutoff: asOfCutoff,
      priceBasis: "split-adjusted",
      riskFreeRate: "Historical DGS10 level divided by 100 once, using the as-of vintage.",
    },
    sources: [
      { provider: "SEC FSDS", sourceUrl: sec.metadata.archive.sourceUrl, localArchiveSha256: sec.metadata.archive.localArchiveSha256 },
      { provider: "FRED", series: "DGS10", url: riskFree.provenance.url },
      price.endpoint
        ? {
          provider: price.provider,
          endpoint: price.endpoint,
          params: price.params,
          retrievalTime: price.retrievedAt,
          requestHash: price.requestHash,
          responseHash: price.responseHash,
          requests: price.requests,
        }
        : { provider: "Yahoo Finance", packageVersion: yahooFinanceVersion },
    ],
    rows: [row],
  };
}

function main(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv);
  return ingestSnapshot(args, dependencies).then((fixture) => {
    writeFileSync(resolve(args.output), `${JSON.stringify(fixture, null, 2)}\n`, { flag: "wx" });
    return fixture;
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${sanitizeError(error, process.env.FRED_API_KEY)}\n`);
    process.exitCode = 1;
  });
}

export {
  parseArgs,
  marketCloseCutoff,
  selectFsdsFiling,
  parseFsdsFacts,
  parseFsdsArchive,
  readArchiveEntry,
  localNewYorkToUtc,
  parseSplitRatio,
  chartSplits,
  dedupeSplits,
  adjustSharesToAsOf,
  calculateBeta,
  annualBalanceRows,
  buildStatements,
  fetchRiskFreeRate,
  fetchTiingoPrices,
  ingestSnapshot,
  main,
};
