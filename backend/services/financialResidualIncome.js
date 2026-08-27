import * as cache from "./cache.js";
import { getCIK } from "./secGuidance.js";
import { secLimiter } from "../utils/rateLimiter.js";
import { calculateResidualIncome } from "./residualIncome.js";

const SEC_BASE = "https://www.sec.gov";
const RIM_CACHE_TTL = 900;
const RIM_CACHE_NAMESPACE = "rim-production-v13";
const ERP = 0.055;
const SEC_TIMEOUT_MS = 15_000;
const MAX_SEC_BODY_BYTES = 16 * 1024 * 1024;

// Deliberately explicit: adding an issuer requires a reviewed filing map.
export const ISSUER_MAP = Object.freeze({
  JPM: {
    cik: "0000019617", subtype: "bank",
    distributionSource: {
      sourcePinned: true, accession: "000162828026008131", primaryDocument: "jpm-20251231.htm",
      selectionRule: "JPM-2025-10-K:explicit-common-distributions:FY2023-FY2025",
      dividends: { tag: "us-gaap:DividendsCommonStockCash", dimensionMembers: [{ dimension: "us-gaap:StatementEquityComponentsAxis", member: "us-gaap:RetainedEarningsMember" }], contextRefsByYear: { "2023-12-31": ["c-65"], "2024-12-31": ["c-64"], "2025-12-31": ["c-63"] } },
      repurchases: { tag: "us-gaap:PaymentsForRepurchaseOfCommonStock", unsegmentedOnly: true, contextRefsByYear: { "2023-12-31": ["c-29"], "2024-12-31": ["c-28"], "2025-12-31": ["c-1"] } },
      issuance: { tag: "jpm:TreasuryStockValueReissued", dimensionMembers: [{ dimension: "us-gaap:StatementEquityComponentsAxis", member: "us-gaap:TreasuryStockCommonMember" }], contextRefsByYear: { "2023-12-31": ["c-79"], "2024-12-31": ["c-78"], "2025-12-31": ["c-77"] } },
    },
    capitalMinimum: { value: 0.115, source: "JPM-2025-10-K", accession: "000162828026008131", table: "R210", note: "Issuer-disclosed CET1 threshold" },
    scenarioAssumptions: {
      bear: { startingRoeDelta: -0.02, terminalRoe: 0.10, payoutMultiplier: 0.8, source: "static:jpm-bear-v1" },
      bull: { startingRoeDelta: 0.02, terminalRoe: 0.14, payoutMultiplier: 1, source: "static:jpm-bull-v1" },
    },
    tags: {
      equity: ["jpm:CommonStockholdersEquity", "jpm:CommonEquity", "us-gaap:StockholdersEquity"],
      income: ["us-gaap:NetIncomeLoss", "us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic"],
      dividends: ["us-gaap:PaymentsOfDividendsCommonStock", "us-gaap:DividendsCommonStockCash"],
      repurchases: ["us-gaap:PaymentsForRepurchaseOfCommonStock"], issuance: ["us-gaap:ProceedsFromStockOptionsExercised"],
      shares: ["dei:EntityCommonStockSharesOutstanding"],
      cet1: ["jpm:CommonEquityTier1Capital"], cet1Ratio: ["jpm:CommonEquityTier1CapitalRatio"],
      rwa: ["us-gaap:RiskWeightedAssets"],
    },
  },
  BAC: {
    cik: "0000070858", subtype: "bank",
    capitalMinimum: { value: 0.10, source: "BAC-2025-10-K", accession: "000007085826000157", table: "R141", note: "Issuer-disclosed CET1 threshold" },
    distributionSource: {
      accession: "000007085826000157", primaryDocument: "bac-20251231.htm",
      selectionRule: "BAC-2025-10-K:unsegmented-annual-contexts:c-1,c-23,c-24",
      issuanceTag: "us-gaap:StockIssuedDuringPeriodValueShareBasedCompensation", unsegmentedOnly: true,
    },
    cleanSurplusSource: {
      accession: "000007085826000157", primaryDocument: "bac-20251231.htm", currency: "USD",
      selectionRule: "BAC-2025-10-K:common-equity-component-bridge:v1:FY2023-FY2025:c-24,c-23,c-1:opening-c-32,c-33,c-34",
      annualYearEnds: ["2023-12-31", "2024-12-31", "2025-12-31"], openingYearEnd: "2022-12-31",
      annualContextRefs: { "2023-12-31": ["c-24"], "2024-12-31": ["c-23"], "2025-12-31": ["c-1"] },
      openingContextRefs: { commonStockApic: ["c-32"], retainedEarnings: ["c-33"], aoci: ["c-34"] },
      equityComponentContextRefs: {
        "2023-12-31": { commonStockApic: ["c-45"], retainedEarnings: ["c-46"], aoci: ["c-47"] },
        "2024-12-31": { commonStockApic: ["c-54"], retainedEarnings: ["c-55"], aoci: ["c-56"] },
        "2025-12-31": { commonStockApic: ["c-62"], retainedEarnings: ["c-63"], aoci: ["c-64"] },
      },
      accountingChangePolicy: "FY2023 facts required; later-period absence is source-pinned zero",
      componentAxis: "us-gaap:StatementEquityComponentsAxis",
      components: [
        { key: "commonStockApic", member: "us-gaap:CommonStockIncludingAdditionalPaidInCapitalMember" },
        { key: "retainedEarnings", member: "us-gaap:RetainedEarningsMember" },
        { key: "aoci", member: "us-gaap:AccumulatedOtherComprehensiveIncomeMember" },
      ],
      income: { tag: "us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic", unsegmentedOnly: true },
      flows: {
        dividends: { tag: "us-gaap:DividendsCommonStockCash", member: "us-gaap:RetainedEarningsMember", contextRefsByYear: { "2023-12-31": ["c-41"], "2024-12-31": ["c-49"], "2025-12-31": ["c-57"] } },
        issuance: { tag: "us-gaap:StockIssuedDuringPeriodValueShareBasedCompensation", member: "us-gaap:CommonStockIncludingAdditionalPaidInCapitalMember", contextRefsByYear: { "2023-12-31": ["c-43"], "2024-12-31": ["c-52"], "2025-12-31": ["c-60"] } },
        repurchase: { tag: "us-gaap:StockRepurchasedAndRetiredDuringPeriodValue", member: "us-gaap:CommonStockIncludingAdditionalPaidInCapitalMember", contextRefsByYear: { "2023-12-31": ["c-43"], "2024-12-31": ["c-52"], "2025-12-31": ["c-60"] } },
        stockCompTransfer: { tag: "us-gaap:StockIssuedDuringPeriodValueShareBasedCompensation", member: "us-gaap:RetainedEarningsMember", contextRefsByYear: { "2023-12-31": ["c-41"], "2024-12-31": ["c-49"], "2025-12-31": ["c-57"] } },
        oci: { tag: "us-gaap:OtherComprehensiveIncomeLossNetOfTaxPortionAttributableToParent", unsegmentedOnly: true },
        preferredOther: { tag: "us-gaap:PreferredStockDividendsAndOtherAdjustments", unsegmentedOnly: true },
        cumulativeAdoption: { tag: "us-gaap:StockholdersEquity", dimensionMembers: [
          { dimension: "us-gaap:StatementEquityComponentsAxis", member: "us-gaap:RetainedEarningsMember" },
          { dimension: "srt:CumulativeEffectPeriodOfAdoptionAxis", member: "srt:CumulativeEffectPeriodOfAdoptionAdjustmentMember" },
        ], fiscalYear: 2023, instantDate: "2022-12-31", contextRefs: ["c-37"] },
        priorPeriodRevision: { tag: "us-gaap:StockholdersEquity", dimensionMembers: [
          { dimension: "us-gaap:StatementEquityComponentsAxis", member: "us-gaap:RetainedEarningsMember" },
          { dimension: "srt:RestatementAxis", member: "srt:RevisionOfPriorPeriodChangeInAccountingPrincipleAdjustmentMember" },
        ], fiscalYear: 2023, instantDate: "2022-12-31", contextRefs: ["c-39"] },
      },
    },
    scenarioAssumptions: {
      bear: { startingRoeDelta: -0.02, terminalRoe: 0.10, payoutMultiplier: 0.8, source: "static:bac-bear-v1" },
      bull: { startingRoeDelta: 0.02, terminalRoe: 0.14, payoutMultiplier: 1, source: "static:bac-bull-v1" },
    },
    tags: {
      equity: ["us-gaap:StockholdersEquity", "us-gaap:CommonStockholdersEquity"],
      income: ["us-gaap:NetIncomeLoss", "us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic"],
      dividends: ["us-gaap:PaymentsOfDividendsCommonStock", "us-gaap:DividendsCommonStockCash"],
      repurchases: ["us-gaap:PaymentsForRepurchaseOfCommonStock"], issuance: ["us-gaap:StockIssuedDuringPeriodValueShareBasedCompensation"],
      shares: ["dei:EntityCommonStockSharesOutstanding"],
      cet1: ["us-gaap:CommonEquityTierOneCapital"], cet1Ratio: ["us-gaap:CommonEquityTierOneCapitalRatio"], rwa: ["us-gaap:RiskWeightedAssets"],
    },
  },
  AIG: {
    cik: "0000005272", subtype: "insurer", alwaysUnvalued: "rim-insurer-solvency-unavailable",
    tags: {
      equity: ["us-gaap:StockholdersEquity"], income: ["us-gaap:NetIncomeLoss"],
      dividends: ["us-gaap:PaymentsOfDividendsCommonStock"], repurchases: ["us-gaap:PaymentsForRepurchaseOfCommonStock"], issuance: ["us-gaap:ProceedsFromStockOptionsExercised"], shares: ["dei:EntityCommonStockSharesOutstanding"],
      statutorySurplus: ["aig:StatutorySurplus"], rbc: ["aig:AuthorizedControlLevelRiskBasedCapital"],
      gaapSapBridge: ["aig:GAAPToSAPNetAdjustment"], reserveFlag: ["aig:ReserveDevelopment"], catastropheFlag: ["aig:CatastropheLosses"], investmentFlag: ["aig:RealizedInvestmentGainsLosses"],
    },
  },
  ALL: {
    cik: "0000899051", subtype: "insurer",
    scenarioAssumptions: {
      bear: { startingRoeDelta: -0.02, terminalRoe: 0.08, payoutMultiplier: 0.8, source: "static:all-bear-v1" },
      bull: { startingRoeDelta: 0.02, terminalRoe: 0.12, payoutMultiplier: 1, source: "static:all-bull-v1" },
    },
    tags: {
      equity: ["us-gaap:StockholdersEquity", "us-gaap:CommonStockholdersEquity"],
      income: ["us-gaap:NetIncomeLoss"],
      dividends: ["us-gaap:PaymentsOfDividendsCommonStock", "us-gaap:DividendsCommonStockCash"],
      repurchases: ["us-gaap:PaymentsForRepurchaseOfCommonStock"], issuance: ["us-gaap:ProceedsFromStockOptionsExercised"],
      shares: ["dei:EntityCommonStockSharesOutstanding"],
      statutorySurplus: ["us-gaap:StatutoryAccountingPracticesStatutoryCapitalAndSurplusBalance"],
      rbc: ["all:AuthorizedControlLevelRiskBasedCapital"],
      gaapSapBridge: ["all:GAAPToSAPNetAdjustment"], reserveFlag: ["all:ReserveDevelopment"], catastropheFlag: ["all:CatastropheLosses"], investmentFlag: ["all:RealizedInvestmentGainsLosses"],
    },
  },
});

function finite(value) { return typeof value === "number" && Number.isFinite(value); }

function median(values) {
  const sorted = values.filter(finite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function userAgent() {
  const value = String(process.env.SEC_USER_AGENT || "").trim();
  if (!value || /contact@example\.com/i.test(value)) {
    throw new Error("SEC_USER_AGENT is required for residual-income SEC access");
  }
  return value;
}

function attrs(source = "") {
  const out = {};
  const re = /([:\w-]+)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = re.exec(source))) out[match[1]] = match[3];
  return out;
}

function decode(value = "") {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}

function numberFrom(value, scale = 0, sign = "") {
  const raw = decode(value).replace(/[$,\s]/g, "");
  if (!raw || /^-$|^—$/.test(raw)) return null;
  const negative = sign === "-" || /^\(.*\)$/.test(raw);
  const numeric = Number(raw.replace(/[()]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  const result = numeric * 10 ** (Number(scale) || 0) * (negative ? -1 : 1);
  return Number.isFinite(result) ? result : null;
}

function parseContexts(html) {
  const contexts = new Map();
  const re = /<(?:xbrli:)?context\b([^>]*)>([\s\S]*?)<\/(?:xbrli:)?context>/gi;
  let match;
  while ((match = re.exec(html))) {
    const a = attrs(match[1]);
    const body = match[2];
    const instant = body.match(/<(?:xbrli:)?instant\b[^>]*>([^<]+)</i)?.[1]?.trim();
    const start = body.match(/<(?:xbrli:)?startDate\b[^>]*>([^<]+)</i)?.[1]?.trim();
    const end = body.match(/<(?:xbrli:)?endDate\b[^>]*>([^<]+)</i)?.[1]?.trim();
    const memberMatches = [...body.matchAll(/<(?:xbrldi:)?explicitMember\b([^>]*)>([^<]+)</gi)];
    const dimensionMembers = memberMatches.map((m) => ({ dimension: attrs(m[1]).dimension || null, member: m[2].trim() }))
      .sort((left, right) => `${left.dimension}=${left.member}`.localeCompare(`${right.dimension}=${right.member}`));
    const dimensions = dimensionMembers.map((item) => item.member).sort();
    contexts.set(a.id, { id: a.id, instant, start, end, dimensions, dimensionMembers });
  }
  return contexts;
}

export function extractInlineFacts(html, issuerMap = {}) {
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") > MAX_SEC_BODY_BYTES) {
    throw new Error("SEC inline filing exceeds maximum response size");
  }
  const tokenRe = /<\/?ix:(nonfraction|nonnumeric)\b[^>]*>/gi;
  const stack = [];
  let token;
  while ((token = tokenRe.exec(html))) {
    const closing = token[0][1] === "/";
    const kind = token[1].toLowerCase();
    if (closing) {
      if (stack.pop() !== kind) throw new Error("Malformed SEC inline XBRL tags");
    } else if (!/\/\s*>$/.test(token[0])) {
      stack.push(kind);
    }
  }
  if (stack.length) throw new Error("Malformed SEC inline XBRL tags");
  const contexts = parseContexts(html);
  const sourceTags = issuerMap.cleanSurplusSource ? [
    "us-gaap:StockholdersEquity",
    issuerMap.cleanSurplusSource.income?.tag,
    ...Object.values(issuerMap.cleanSurplusSource.flows || {}).map((config) => config.tag),
  ] : [];
  const distributionTags = issuerMap.distributionSource?.sourcePinned ? [
    issuerMap.distributionSource.dividends?.tag,
    issuerMap.distributionSource.repurchases?.tag,
    issuerMap.distributionSource.issuance?.tag,
  ] : [];
  const wanted = new Set([...Object.values(issuerMap.tags || {}).flat(), ...sourceTags, ...distributionTags].filter(Boolean));
  const facts = [];
  const re = /<ix:(nonfraction|nonNumeric)\b([^>]*)>([\s\S]*?)<\/ix:\1>/gi;
  let match;
  while ((match = re.exec(html))) {
    const kind = match[1].toLowerCase();
    const a = attrs(match[2]);
    if (!wanted.has(a.name) || !a.contextRef) continue;
    const context = contexts.get(a.contextRef);
    if (!context) continue;
    const value = kind === "nonfraction" ? numberFrom(match[3], a.scale, a.sign) : null;
    if (value == null) continue;
    facts.push({
      name: a.name, value, unit: a.unitRef || null, contextRef: a.contextRef,
      context, decimals: a.decimals || null, taxonomy: a.name.split(":")[0],
    });
  }
  return facts;
}

function chooseFact(facts, tags, predicate) {
  const candidates = facts.filter((fact) => tags?.includes(fact.name) && (!predicate || predicate(fact)));
  candidates.sort((a, b) => {
    const aDim = a.context.dimensions.length ? 1 : 0;
    const bDim = b.context.dimensions.length ? 1 : 0;
    return aDim - bDim;
  });
  return candidates[0] || null;
}

function provenance(fact, filing, url, selectionRule) {
  return {
    source: "sec:inline-xbrl", sourceUrl: url, accession: filing.accessionNumber,
    form: filing.form, filed: filing.filingDate, accepted: filing.accepted || null,
    periodEnd: fact.context.instant || fact.context.end || null, taxonomy: fact.taxonomy,
    tag: fact.name, unit: fact.unit, contextRef: fact.contextRef,
    dimensions: fact.context.dimensions, dimensionMembers: fact.context.dimensionMembers || [], selectionRule,
  };
}

function annualFact(facts, tags, yearEnd, type, options = {}) {
  const predicate = (fact) => {
    const c = fact.context;
    if (options.unsegmentedOnly && c.dimensions.length) return false;
    if (options.dimensionMembers) {
      const actual = c.dimensionMembers || [];
      if (actual.length !== options.dimensionMembers.length || options.dimensionMembers.some((wanted) => (
        !actual.some((item) => item.dimension === wanted.dimension && item.member === wanted.member)
      ))) return false;
    }
    if (options.contextRefs && !options.contextRefs.includes(fact.contextRef)) return false;
    if (options.currency) {
      const unit = String(fact.unit || "").toLowerCase();
      const expected = [options.currency, `iso4217:${options.currency}`].map((value) => value.toLowerCase());
      if (!expected.includes(unit)) return false;
    }
    if (type === "instant") return c.instant === (options.instantDate || yearEnd);
    if (!c.start || c.end !== yearEnd) return false;
    const days = (Date.parse(c.end) - Date.parse(c.start)) / 86400000;
    return days >= 300 && days <= 380;
  };
  if (options.requireUnique && facts.filter((fact) => tags?.includes(fact.name) && predicate(fact)).length !== 1) return null;
  return chooseFact(facts, tags, predicate);
}

function asObservation(fact, filing, url, field, yearEnd) {
  const value = field === "common-distributions" ? Math.abs(fact?.value) : fact?.value;
  return fact ? { value, provenance: provenance(fact, filing, url, `${field}:explicit-issuer-map`) } : null;
}

function distributionObservation(dividend, repurchase, issuance, filing, url, sourceMetadata) {
  if (!dividend || !repurchase || !issuance) return null;
  return {
    value: Math.abs(dividend.value) + Math.abs(repurchase.value) - Math.abs(issuance.value),
    provenance: {
      ...dividend.provenance,
      selectionRule: "common-distributions:dividends+repurchases-issuance:explicit-issuer-map",
      reviewedSource: sourceMetadata || null,
      components: [dividend.provenance, repurchase.provenance, issuance.provenance],
    },
  };
}

function explicitDistributionFact(facts, source, config, yearEnd) {
  return annualFact(facts, [config.tag], yearEnd, "duration", {
    unsegmentedOnly: config.unsegmentedOnly,
    dimensionMembers: config.dimensionMembers,
    contextRefs: config.contextRefsByYear?.[yearEnd],
    requireUnique: true,
  });
}

function bacDimensionMembers(source, members) {
  return members.map((member) => ({ dimension: source.componentAxis, member }));
}

function bacFact(facts, source, config, yearEnd, type) {
  const dimensionMembers = config.dimensionMembers || (config.member
    ? bacDimensionMembers(source, [config.member])
    : config.members ? bacDimensionMembers(source, config.members) : undefined);
  return annualFact(facts, [config.tag], yearEnd, type, {
    unsegmentedOnly: config.unsegmentedOnly,
    currency: source.currency,
    dimensionMembers,
    contextRefs: config.contextRefs || config.contextRefsByYear?.[yearEnd] || source.annualContextRefs?.[yearEnd],
    instantDate: config.instantDate,
    requireUnique: true,
  });
}

function bacObservation(fact, filing, url, source, field) {
  if (!fact) return null;
  return { value: fact.value, provenance: provenance(fact, filing, url, `${source.selectionRule}:${field}`) };
}

function bacComponentEquity(facts, filing, url, source, yearEnd) {
  const components = source.components.map((component) => ({
    ...component,
    fact: annualFact(facts, ["us-gaap:StockholdersEquity"], yearEnd, "instant", {
      currency: source.currency,
      dimensionMembers: bacDimensionMembers(source, [component.member]),
      contextRefs: yearEnd === source.openingYearEnd
        ? source.openingContextRefs?.[component.key]
        : source.equityComponentContextRefs?.[yearEnd]?.[component.key],
      requireUnique: true,
    }),
  }));
  if (components.some((component) => !component.fact)) return null;
  const observations = components.map((component) => ({
    key: component.key,
    value: component.fact.value,
    provenance: provenance(component.fact, filing, url, `${source.selectionRule}:equity-component:${component.key}`),
  }));
  return {
    value: observations.reduce((sum, component) => sum + component.value, 0),
    provenance: {
      ...observations[0].provenance,
      selectionRule: source.selectionRule,
      reviewedSource: source,
      components: observations,
    },
  };
}

function bacBridgeForYear(facts, filing, url, source, yearEnd) {
  const flow = source.flows;
  const income = bacFact(facts, source, source.income, yearEnd, "duration");
  const dividends = bacFact(facts, source, flow.dividends, yearEnd, "duration");
  const issuance = bacFact(facts, source, flow.issuance, yearEnd, "duration");
  const repurchase = bacFact(facts, source, flow.repurchase, yearEnd, "duration");
  const stockCompTransfer = bacFact(facts, source, flow.stockCompTransfer, yearEnd, "duration");
  const oci = bacFact(facts, source, flow.oci, yearEnd, "duration");
  const preferredOther = bacFact(facts, source, flow.preferredOther, yearEnd, "duration");
  const accountingChanges = [flow.cumulativeAdoption, flow.priorPeriodRevision].map((config) => (
    config.fiscalYear === Number(yearEnd.slice(0, 4)) ? bacFact(facts, source, config, yearEnd, "instant") : null
  ));
  const required = [income, dividends, issuance, repurchase, stockCompTransfer, oci, preferredOther];
  if (Number(yearEnd.slice(0, 4)) === 2023) required.push(...accountingChanges);
  const observations = Object.fromEntries([
    ["income", income], ["dividends", dividends], ["issuance", issuance], ["repurchases", repurchase],
    ["stockCompTransfer", stockCompTransfer], ["oci", oci], ["preferredOther", preferredOther],
    ["cumulativeAdoption", accountingChanges[0]], ["priorPeriodRevision", accountingChanges[1]],
  ].map(([field, fact]) => [field, bacObservation(fact, filing, url, source, field)]));
  if (required.some((fact) => !fact)) return { ...observations, distributions: null, movement: null, complete: false };
  const bridgeBreakdown = {
    commonIncome: income.value,
    dividends: Math.abs(dividends.value),
    repurchases: Math.abs(repurchase.value),
    issuance: Math.abs(issuance.value),
    stockCompTransfer: -Math.abs(stockCompTransfer.value),
    oci: oci.value,
    preferredOther: preferredOther.value,
    cumulativeAdoption: accountingChanges[0]?.value ?? 0,
    priorPeriodRevision: accountingChanges[1]?.value ?? 0,
  };
  return {
    ...observations,
    distributions: distributionObservation(observations.dividends, observations.repurchases, observations.issuance, filing, url, source),
    bridgeBreakdown,
    movement: bridgeBreakdown.commonIncome - bridgeBreakdown.dividends - bridgeBreakdown.repurchases
      + bridgeBreakdown.issuance + bridgeBreakdown.stockCompTransfer + bridgeBreakdown.oci
      + bridgeBreakdown.cumulativeAdoption + bridgeBreakdown.priorPeriodRevision,
    complete: true,
  };
}

function buildBacObservations(facts, filing, url, source) {
  const yearEnds = [...new Set([source.openingYearEnd, ...source.annualYearEnds])];
  const annual = yearEnds.map((yearEnd) => ({
    yearEnd,
    equity: bacComponentEquity(facts, filing, url, source, yearEnd),
    bridge: bacBridgeForYear(facts, filing, url, source, yearEnd),
  }));
  const observations = source.annualYearEnds.map((yearEnd) => annual.find((row) => row.yearEnd === yearEnd)).filter(Boolean);
  const opening = annual.find((row) => row.yearEnd === source.openingYearEnd);
  if (!opening || observations.length !== 3 || observations.some((row) => !row.equity || !row.bridge.complete)) return null;
  const rows = observations.map((row, index) => {
    const previous = index === 0 ? opening : observations[index - 1];
    const expected = previous.equity.value + row.bridge.movement;
    if (expected !== row.equity.value) return { ...row, previousEquity: previous.equity, reconciled: false };
    return { ...row, previousEquity: previous.equity, reconciled: true };
  });
  if (rows.some((row) => !row.reconciled)) return null;
  return rows.map((row) => ({
    yearEnd: row.yearEnd,
    equity: row.equity,
    income: row.bridge.income,
    distributions: row.bridge.distributions,
    dividends: row.bridge.dividends,
    repurchases: row.bridge.repurchases,
    issuance: row.bridge.issuance,
    bridgeBreakdown: row.bridge.bridgeBreakdown,
    reconciledOtherEquityChanges: row.bridge,
  }));
}

function reasonResult(map, reasonCodes, extra = {}) {
  return { eligible: false, status: "unvalued", financialSubtype: map?.subtype || null, reasonCodes: [...new Set(reasonCodes)], ...extra };
}

async function readSecBody(response, mode) {
  const contentLength = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_SEC_BODY_BYTES) {
    throw new Error("SEC response exceeds maximum response size");
  }
  if (!response.body?.getReader) throw new Error("SEC response stream unavailable");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > MAX_SEC_BODY_BYTES) {
        await reader.cancel?.();
        throw new Error("SEC response exceeds maximum response size");
      }
      chunks.push(Buffer.from(part.value));
    }
  } finally {
    reader.releaseLock?.();
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return mode === "json" ? JSON.parse(text) : text;
}

export async function secFetch(url, mode = "json") {
  await secLimiter.throttle();
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent(), Accept: "text/html,application/json" },
    signal: AbortSignal.timeout(SEC_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`SEC request failed: ${response.status}`);
  return readSecBody(response, mode);
}

async function fetchFiling(ticker, map, valuationAsOf) {
  userAgent();
  const cik = await getCIK(ticker);
  if (cik !== map.cik) throw new Error(`SEC CIK mismatch for ${ticker}`);
  const submissions = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const filing = selectLatestFiling(submissions.filings?.recent || {}, valuationAsOf);
  if (!filing) throw new Error(`No eligible 10-K found for ${ticker}`);
  const accession = filing.accessionNumber.replace(/-/g, "");
  const url = `${SEC_BASE}/Archives/edgar/data/${Number(cik)}/${accession}/${filing.primaryDocument}`;
  return { filing, url, html: await secFetch(url, "text") };
}

export function selectLatestFiling(recent = {}, valuationAsOf) {
  const filings = (recent.form || []).map((form, index) => ({
    form, accessionNumber: recent.accessionNumber?.[index], filingDate: recent.filingDate?.[index],
    accepted: recent.acceptanceDateTime?.[index] || recent.acceptanceDate?.[index] || recent.acceptedDate?.[index],
    primaryDocument: recent.primaryDocument?.[index],
  })).map((filing) => ({ ...filing, availableAt: filing.accepted || `${filing.filingDate}T23:59:59Z` }))
    .filter((filing) => (filing.form === "10-K" || filing.form === "10-K/A") && filing.primaryDocument)
    .filter((filing) => !valuationAsOf || new Date(filing.availableAt) <= new Date(valuationAsOf));
  filings.sort((a, b) => new Date(b.availableAt) - new Date(a.availableAt));
  return filings[0] || null;
}

function buildValuation({ ticker, map, facts, filing, url, summary = {}, riskFreeRate, beta, valuationAsOf }) {
  if (map.alwaysUnvalued) return reasonResult(map, [map.alwaysUnvalued]);
  if (map.distributionSource?.sourcePinned && (
    String(filing?.accessionNumber || "").replace(/-/g, "") !== map.distributionSource.accession
    || filing?.primaryDocument !== map.distributionSource.primaryDocument
  )) return reasonResult(map, ["rim-clean-surplus-unreconciled"]);
  if (map.cleanSurplusSource && (
    String(filing?.accessionNumber || "").replace(/-/g, "") !== map.cleanSurplusSource.accession
    || filing?.primaryDocument !== map.cleanSurplusSource.primaryDocument
  )) {
    return reasonResult(map, ["rim-clean-surplus-unreconciled"]);
  }
  if (!finite(riskFreeRate) || !finite(beta) || beta <= 0) return reasonResult(map, ["rim-cost-of-equity-unavailable"]);
  const observations = map.cleanSurplusSource ? buildBacObservations(facts, filing, url, map.cleanSurplusSource) : (() => {
    const periods = [...new Set(facts.flatMap((fact) => fact.context.end ? [fact.context.end] : []))]
      .filter((period) => /^\d{4}-\d{2}-\d{2}$/.test(period)).sort();
    const annual = [];
    for (const yearEnd of periods) {
      const equity = asObservation(annualFact(facts, map.tags.equity, yearEnd, "instant"), filing, url, "common-equity", yearEnd);
      const income = asObservation(annualFact(facts, map.tags.income, yearEnd, "duration"), filing, url, "common-income", yearEnd);
      const source = map.distributionSource?.sourcePinned ? map.distributionSource : null;
      const distributionOptions = source ? null : (map.distributionSource?.unsegmentedOnly ? { unsegmentedOnly: true } : {});
      const dividends = asObservation(source ? explicitDistributionFact(facts, source, source.dividends, yearEnd) : annualFact(facts, map.tags.dividends, yearEnd, "duration", distributionOptions), filing, url, "common-dividends", yearEnd);
      const repurchases = asObservation(source ? explicitDistributionFact(facts, source, source.repurchases, yearEnd) : annualFact(facts, map.tags.repurchases, yearEnd, "duration", distributionOptions), filing, url, "common-repurchases", yearEnd);
      const issuance = asObservation(source ? explicitDistributionFact(facts, source, source.issuance, yearEnd) : annualFact(facts, map.tags.issuance, yearEnd, "duration", distributionOptions), filing, url, "common-issuance", yearEnd);
      const distributions = distributionObservation(dividends, repurchases, issuance, filing, url, source || map.distributionSource);
      annual.push({ yearEnd, equity, income, distributions, dividends, repurchases, issuance });
    }
    return annual.slice(-3);
  })();
  if (map.cleanSurplusSource && !observations) return reasonResult(map, ["rim-clean-surplus-unreconciled"]);
  if (!observations || observations.length < 3) {
    const missing = [];
    if (!observations || observations.length < 3) missing.push("rim-book-history-insufficient");
    if (!observations || !observations.every((row) => row.equity)) missing.push("rim-common-equity-unavailable");
    if (!observations || !observations.every((row) => row.income)) missing.push("rim-common-earnings-unavailable");
    if (!observations || !observations.every((row) => row.distributions)) missing.push("rim-common-distributions-incomplete");
    return reasonResult(map, missing);
  }
  const missing = [];
  if (!observations.every((row) => row.equity)) missing.push("rim-common-equity-unavailable");
  if (!observations.every((row) => row.income)) missing.push("rim-common-earnings-unavailable");
  if (!observations.every((row) => row.distributions)) missing.push("rim-common-distributions-incomplete");
  if (missing.length) return reasonResult(map, missing);

  const contextAligned = map.cleanSurplusSource || map.distributionSource?.sourcePinned || observations.every((row) => {
    const dimensions = JSON.stringify(row.equity.provenance.dimensions || []);
    return dimensions === JSON.stringify(row.income.provenance.dimensions || [])
      && dimensions === JSON.stringify(row.distributions.provenance.dimensions || []);
  });
  if (!contextAligned) return reasonResult(map, ["rim-clean-surplus-unreconciled"]);

  const cleanSurplus = map.cleanSurplusSource || observations.slice(1).every((row, index) => {
    const previous = observations[index].equity.value;
    const expected = previous + row.income.value - row.distributions.value;
    return Math.abs(expected - row.equity.value) <= Math.max(1, Math.abs(row.equity.value) * 0.01);
  });
  if (!cleanSurplus) return reasonResult(map, ["rim-clean-surplus-unreconciled"]);

  let capitalGate;
  if (map.subtype === "bank") {
    const capital = chooseFact(facts, map.tags.cet1, (fact) => !!fact.context.instant);
    const rwa = chooseFact(facts, map.tags.rwa, (fact) => !!fact.context.instant);
    const ratioFact = chooseFact(facts, map.tags.cet1Ratio, (fact) => !!fact.context.instant);
    const sameContext = capital && rwa
      && capital.context.instant === rwa.context.instant
      && JSON.stringify(capital.context.dimensions) === JSON.stringify(rwa.context.dimensions);
    const ratioAligned = ratioFact && capital && rwa
      && JSON.stringify(ratioFact.context.dimensions) === JSON.stringify(capital.context.dimensions)
      && JSON.stringify(ratioFact.context.dimensions) === JSON.stringify(rwa.context.dimensions)
      && ratioFact.context.instant === capital.context.instant
      && ratioFact.context.instant === rwa.context.instant;
    const ratio = ratioAligned ? (ratioFact.value > 1 ? ratioFact.value / 100 : ratioFact.value)
      : sameContext && rwa.value > 0 ? capital.value / rwa.value : null;
    if (!capital || !rwa || !finite(ratio)) return reasonResult(map, ["rim-bank-capital-unavailable"]);
    const capitalProvenance = provenance(ratioAligned ? ratioFact : capital, filing, url, ratioAligned ? "bank-cet1-ratio:explicit-issuer-map" : "bank-cet1-capital/rwa:same-context-derived");
    if (ratio < map.capitalMinimum.value) return reasonResult(map, ["rim-bank-capital-buffer-breached"], {
      capital: { cet1: capital.value, rwa: rwa.value, ratio, ratioProvenance: capitalProvenance, threshold: map.capitalMinimum },
    });
    capitalGate = { cet1: capital.value, rwa: rwa.value, ratio, ratioProvenance: capitalProvenance, threshold: map.capitalMinimum };
  } else {
    const surplus = chooseFact(facts, map.tags.statutorySurplus, (fact) => !!fact.context.instant);
    const rbc = chooseFact(facts, map.tags.rbc, (fact) => !!fact.context.instant);
    if (!surplus || !rbc) return reasonResult(map, ["rim-insurer-solvency-unavailable"]);
    const bridge = chooseFact(facts, map.tags.gaapSapBridge, (fact) => !!fact.context.instant);
    if (!bridge) return reasonResult(map, ["rim-insurer-gaap-sap-bridge-unresolved"]);
    const normalizationFlags = [
      chooseFact(facts, map.tags.reserveFlag, (fact) => !!fact.context.instant),
      chooseFact(facts, map.tags.catastropheFlag, (fact) => !!fact.context.instant),
      chooseFact(facts, map.tags.investmentFlag, (fact) => !!fact.context.instant),
    ];
    if (normalizationFlags.some((fact) => !fact)) return reasonResult(map, ["rim-insurer-normalization-unavailable"]);
    capitalGate = {
      statutorySurplus: surplus.value, rbc: rbc.value, gaapSapBridge: bridge.value,
      provenance: [surplus, rbc, bridge, ...normalizationFlags].map((fact) => provenance(fact, filing, url, "insurer-solvency-normalization:explicit-issuer-map")),
    };
  }

  const shareFact = chooseFact(facts, map.tags.shares, (fact) => !!fact.context.instant);
  const marketShares = Number(summary.sharesOutstanding);
  const shares = finite(marketShares) && marketShares > 0 ? marketShares : shareFact?.value;
  if (!finite(shares) || shares <= 0) return reasonResult(map, ["rim-shares-unavailable"]);
  const shareProvenance = finite(marketShares) && marketShares > 0
    ? { source: "market-data:summary", basis: "current-point-in-time-common-shares" }
    : provenance(shareFact, filing, url, "sec:inline-xbrl:current-point-in-time-common-shares-fallback");
  const bookValue = observations[observations.length - 1].equity.value;
  const roes = observations.map((row) => row.income.value / row.equity.value).filter(finite);
  const startingRoe = median(roes);
  const payouts = observations.map((row) => row.distributions.value / row.income.value).filter((value) => finite(value) && value >= 0 && value <= 1);
  const payout = median(payouts);
  if (!finite(bookValue) || bookValue <= 0 || !finite(startingRoe) || !finite(payout)) return reasonResult(map, ["rim-common-earnings-unavailable"]);
  const costOfEquity = riskFreeRate + beta * ERP;
  const terminalRoe = map.subtype === "bank" ? 0.12 : 0.10;
  const result = calculateResidualIncome({ bookValue, sharesOutstanding: shares, costOfEquity, startingRoe, terminalRoe, payout, years: 5 });
  if (!result.eligible) return reasonResult(map, result.reasonCodes);
  const scenarios = { base: { ...result, assumptions: { source: "sec-derived-base", startingRoe, terminalRoe, payout, costOfEquity } } };
  for (const [name, assumptions] of Object.entries(map.scenarioAssumptions || {})) {
    const scenarioStartingRoe = startingRoe + assumptions.startingRoeDelta;
    const scenarioPayout = Math.min(1, Math.max(0, payout * assumptions.payoutMultiplier));
    const scenario = calculateResidualIncome({
      bookValue, sharesOutstanding: shares, costOfEquity, startingRoe: scenarioStartingRoe,
      terminalRoe: assumptions.terminalRoe, payout: scenarioPayout, years: 5,
    });
    if (!scenario.eligible) return reasonResult(map, scenario.reasonCodes);
    scenarios[name] = { ...scenario, assumptions: { source: assumptions.source, startingRoe: scenarioStartingRoe, terminalRoe: assumptions.terminalRoe, payout: scenarioPayout, costOfEquity } };
  }
  return {
    ...result, ticker, eligible: true, status: "valued", financialSubtype: map.subtype,
    valuationAsOf: valuationAsOf || new Date().toISOString(), assumptionSetId: "rim-production-v1",
    assumptions: { explicitYears: 5, marketRiskPremium: ERP, marketRiskPremiumSource: "static:rim-production-v1", terminalRoeSource: `static:${map.subtype}-steady-state-v1`, payoutSource: "sec:inline-xbrl:three-year-median", scenarioSources: Object.fromEntries(Object.entries(map.scenarioAssumptions || {}).map(([name, value]) => [name, value.source])) },
    costOfEquity: { value: costOfEquity, riskFreeRate, beta, marketRiskPremium: ERP, source: "fred:DGS10+market-beta+static:rim-production-v1" },
    capital: capitalGate,
    sharesProvenance: shareProvenance,
    observations, provenance: {
      filing: { ...filing, sourceUrl: url, availableAt: filing.availableAt || filing.accepted || filing.filingDate },
      fields: [...observations.flatMap((row) => [
        row.equity.provenance,
        ...(map.cleanSurplusSource
          ? Object.values(row.reconciledOtherEquityChanges || {}).filter((field) => field?.provenance).map((field) => field.provenance)
          : [row.income.provenance, row.distributions.provenance]),
      ]), shareProvenance],
    },
    scenarios,
  };
}

export async function getFinancialResidualIncome(ticker, options = {}) {
  const normalized = String(ticker || "").toUpperCase();
  const map = ISSUER_MAP[normalized];
  if (!map) return reasonResult(null, ["rim-classification-unsupported"]);
  if (map.alwaysUnvalued) return reasonResult(map, [map.alwaysUnvalued]);
  const valuationDate = options.valuationAsOf ? new Date(options.valuationAsOf).toISOString().slice(0, 10) : "latest";
  const valuationKey = `${valuationDate}:${options.riskFreeRate ?? "na"}:${options.beta ?? "na"}`;
  return cache.getOrFetch(cache.getFundamentals, cache.setFundamentals, `${RIM_CACHE_NAMESPACE}:${normalized}:${valuationKey}`, async () => {
    const { filing, url, html } = await fetchFiling(normalized, map, options.valuationAsOf);
    const facts = extractInlineFacts(html, map);
    return buildValuation({ ticker: normalized, map, facts, filing, url, ...options });
  }, RIM_CACHE_TTL);
}

export { buildValuation };
