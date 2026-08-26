import { jest } from "@jest/globals";
import * as cache from "../cache.js";
import { buildValuation, ISSUER_MAP, selectLatestFiling, extractInlineFacts, secFetch } from "../financialResidualIncome.js";

function fact(name, value, yearEnd, kind = "instant") {
  return {
    name,
    value,
    unit: "USD",
    contextRef: `${kind}-${yearEnd}`,
    taxonomy: name.split(":")[0],
    context: {
      id: `${kind}-${yearEnd}`,
      instant: kind === "instant" ? yearEnd : undefined,
      start: kind === "duration" ? `${yearEnd.slice(0, 4)}-01-01` : undefined,
      end: kind === "duration" ? yearEnd : undefined,
      dimensions: [],
    },
  };
}

function bacFact(name, value, yearEnd, { kind = "instant", members = [], dimensionMembers = null, contextRef = null } = {}) {
  const selectedMembers = dimensionMembers || members.map((member) => ({
    dimension: "us-gaap:StatementEquityComponentsAxis", member,
  }));
  const openingContextRefs = {
    "us-gaap:CommonStockIncludingAdditionalPaidInCapitalMember": "c-32",
    "us-gaap:RetainedEarningsMember": "c-33",
    "us-gaap:AccumulatedOtherComprehensiveIncomeMember": "c-34",
  };
  const annualContextRefs = { "2023-12-31": "c-24", "2024-12-31": "c-23", "2025-12-31": "c-1" };
  const selectedContextRef = contextRef || (yearEnd === "2022-12-31"
    ? openingContextRefs[members[0]]
    : annualContextRefs[yearEnd]);
  return {
    ...fact(name, value, yearEnd, kind),
    ...(selectedContextRef ? { contextRef: selectedContextRef } : {}),
    context: {
      ...fact(name, value, yearEnd, kind).context,
      dimensions: selectedMembers.map((item) => item.member).sort(),
      dimensionMembers: selectedMembers,
    },
  };
}

function factsForBac({ missingMember = null, mismatch = false } = {}) {
  const source = ISSUER_MAP.BAC.cleanSurplusSource;
  const members = Object.fromEntries(source.components.map((component) => [component.key, component.member]));
  const facts = [];
  const values = {
    "2022-12-31": { commonStockApic: 40, retainedEarnings: 50, aoci: 10 },
    "2023-12-31": { commonStockApic: 40, retainedEarnings: 59.5, aoci: 9.5 },
    "2024-12-31": { commonStockApic: 40, retainedEarnings: 67.5, aoci: 10 },
    "2025-12-31": { commonStockApic: 40, retainedEarnings: 75.5, aoci: 10.5 },
  };
  for (const [yearEnd, components] of Object.entries(values)) {
    for (const [key, value] of Object.entries(components)) {
      if (key === missingMember) continue;
      const contextRef = yearEnd === source.openingYearEnd
        ? source.openingContextRefs[key][0]
        : source.equityComponentContextRefs[yearEnd][key][0];
      facts.push(bacFact("us-gaap:StockholdersEquity", value, yearEnd, { members: [members[key]], contextRef }));
    }
  }
  for (const [yearEnd, income] of [["2023-12-31", 15], ["2024-12-31", 15], ["2025-12-31", 15]]) {
    facts.push(bacFact("us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic", income, yearEnd, { kind: "duration" }));
    facts.push(bacFact("us-gaap:DividendsCommonStockCash", 5, yearEnd, { kind: "duration", members: [members.retainedEarnings], contextRef: source.flows.dividends.contextRefsByYear[yearEnd][0] }));
    facts.push(bacFact("us-gaap:StockIssuedDuringPeriodValueShareBasedCompensation", 1, yearEnd, { kind: "duration", members: [members.commonStockApic], contextRef: source.flows.issuance.contextRefsByYear[yearEnd][0] }));
    facts.push(bacFact("us-gaap:StockRepurchasedAndRetiredDuringPeriodValue", 2, yearEnd, { kind: "duration", members: [members.commonStockApic], contextRef: source.flows.repurchase.contextRefsByYear[yearEnd][0] }));
    facts.push(bacFact("us-gaap:StockIssuedDuringPeriodValueShareBasedCompensation", 1, yearEnd, { kind: "duration", members: [members.retainedEarnings], contextRef: source.flows.stockCompTransfer.contextRefsByYear[yearEnd][0] }));
    facts.push(bacFact("us-gaap:OtherComprehensiveIncomeLossNetOfTaxPortionAttributableToParent", 0.5, yearEnd, { kind: "duration" }));
    facts.push(bacFact("us-gaap:PreferredStockDividendsAndOtherAdjustments", 0.25, yearEnd, { kind: "duration" }));
  }
  facts.push(bacFact("us-gaap:StockholdersEquity", 0.2, "2022-12-31", { contextRef: "c-37", dimensionMembers: [
    { dimension: source.componentAxis, member: members.retainedEarnings },
    { dimension: "srt:CumulativeEffectPeriodOfAdoptionAxis", member: "srt:CumulativeEffectPeriodOfAdoptionAdjustmentMember" },
  ] }));
  facts.push(bacFact("us-gaap:StockholdersEquity", 0.3, "2022-12-31", { contextRef: "c-39", dimensionMembers: [
    { dimension: source.componentAxis, member: members.retainedEarnings },
    { dimension: "srt:RestatementAxis", member: "srt:RevisionOfPriorPeriodChangeInAccountingPrincipleAdjustmentMember" },
  ] }));
  facts.push(fact("dei:EntityCommonStockSharesOutstanding", 10, "2025-12-31"));
  facts.push(fact("us-gaap:CommonEquityTierOneCapital", 20, "2025-12-31"));
  facts.push(fact("us-gaap:CommonEquityTierOneCapitalRatio", 20, "2025-12-31"));
  facts.push(fact("us-gaap:RiskWeightedAssets", 100, "2025-12-31"));
  if (mismatch) {
    const oci = facts.find((item) => item.name === "us-gaap:OtherComprehensiveIncomeLossNetOfTaxPortionAttributableToParent");
    oci.context.dimensionMembers = [{ dimension: source.componentAxis, member: members.aoci }];
    oci.context.dimensions = [members.aoci];
  }
  return facts;
}

function filing() {
  return { accessionNumber: "0000000000-25-000001", form: "10-K", filingDate: "2025-02-01" };
}

function bacFiling(overrides = {}) {
  return {
    ...filing(), accessionNumber: "0000070858-26-000157", primaryDocument: "bac-20251231.htm", ...overrides,
  };
}

function jpmFiling(overrides = {}) {
  return {
    ...filing(), accessionNumber: "0001628280-26-008131", primaryDocument: "jpm-20251231.htm", ...overrides,
  };
}

function scopedFact(name, value, yearEnd, kind, contextRef, dimensionMembers = []) {
  const result = fact(name, value, yearEnd, kind);
  result.contextRef = contextRef;
  result.context.dimensions = dimensionMembers.map((item) => item.member).sort();
  result.context.dimensionMembers = dimensionMembers;
  return result;
}

function factsForBank({
  distributions = true,
  capital = true,
  issuanceTag = "us-gaap:ProceedsFromStockOptionsExercised",
  cet1Tag = "jpm:CommonEquityTier1Capital",
  cet1RatioTag = "jpm:CommonEquityTier1CapitalRatio",
} = {}) {
  const facts = [];
  const source = ISSUER_MAP.JPM.distributionSource;
  for (const [year, equity, income] of [["2023-12-31", 100, 15], ["2024-12-31", 109, 15], ["2025-12-31", 118, 15]]) {
    facts.push(fact("us-gaap:StockholdersEquity", equity, year));
    facts.push(fact("us-gaap:NetIncomeLoss", income, year, "duration"));
    if (distributions) {
      facts.push(scopedFact("us-gaap:DividendsCommonStockCash", 5, year, "duration", source.dividends.contextRefsByYear[year][0], source.dividends.dimensionMembers));
      facts.push(scopedFact("us-gaap:PaymentsForRepurchaseOfCommonStock", 2, year, "duration", source.repurchases.contextRefsByYear[year][0]));
      facts.push(scopedFact("jpm:TreasuryStockValueReissued", 1, year, "duration", source.issuance.contextRefsByYear[year][0], source.issuance.dimensionMembers));
    }
  }
  facts.push(fact("dei:EntityCommonStockSharesOutstanding", 10, "2025-12-31"));
  if (capital) {
    facts.push(fact(cet1Tag, 20, "2025-12-31"));
    facts.push(fact(cet1RatioTag, 20, "2025-12-31"));
    facts.push(fact("us-gaap:RiskWeightedAssets", 100, "2025-12-31"));
  }
  return facts;
}

describe("financial residual-income adapter", () => {
  beforeEach(() => {
    process.env.SEC_USER_AGENT = "StockDashboard/1.0 security-test@example.org";
  });

  test("values a mapped bank without current-price calibration", () => {
    const result = buildValuation({
      ticker: "JPM",
      map: ISSUER_MAP.JPM,
      facts: factsForBank(),
      filing: jpmFiling(),
      url: "https://www.sec.gov/Archives/example.htm",
      summary: { currentPrice: 999, sharesOutstanding: 20 },
      riskFreeRate: 0.04,
      beta: 1,
      valuationAsOf: "2025-02-01T00:00:00.000Z",
    });
    expect(result.eligible).toBe(true);
    expect(Number.isFinite(result.fairValue)).toBe(true);
    expect(result).not.toHaveProperty("currentPrice");
    expect(result.scenarios.base.fairValue).toBe(result.fairValue);
    expect(result.scenarios).toEqual(expect.objectContaining({ bear: expect.any(Object), bull: expect.any(Object) }));
    expect(result.assumptions.payoutSource).toContain("median");
    expect(result.sharesOutstanding).toBe(20);
    expect(result.sharesProvenance).toMatchObject({ source: "market-data:summary" });
    expect(result.provenance.fields[0]).toMatchObject({ source: "sec:inline-xbrl", accession: jpmFiling().accessionNumber });
    expect(result.observations[0].dividends.provenance.contextRef).toBe("c-65");
    expect(result.observations[0].repurchases.provenance.contextRef).toBe("c-29");
    expect(result.observations[0].issuance.provenance.contextRef).toBe("c-79");
  });

  test("rejects duplicate JPM distribution facts in one pinned context", () => {
    const facts = factsForBank();
    facts.unshift(scopedFact(
      "jpm:TreasuryStockValueReissued", 999, "2023-12-31", "duration", "c-79",
      ISSUER_MAP.JPM.distributionSource.issuance.dimensionMembers,
    ));
    const result = buildValuation({
      ticker: "JPM", map: ISSUER_MAP.JPM, facts, filing: jpmFiling(),
      url: "https://sec.test/jpm", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("rim-common-distributions-incomplete");
  });

  test("does not use generic JPM reissuance facts", () => {
    const facts = factsForBank().filter((item) => item.name !== "jpm:TreasuryStockValueReissued");
    for (const yearEnd of ["2023-12-31", "2024-12-31", "2025-12-31"]) {
      facts.push(fact("us-gaap:ProceedsFromStockOptionsExercised", 1, yearEnd, "duration"));
    }
    const result = buildValuation({
      ticker: "JPM", map: ISSUER_MAP.JPM, facts, filing: jpmFiling(),
      url: "https://sec.test/jpm", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("rim-common-distributions-incomplete");
  });

  test("rejects JPM when a pinned distribution context is mismatched", () => {
    const facts = factsForBank();
    facts.find((item) => item.name === "jpm:TreasuryStockValueReissued").contextRef = "c-99";
    const result = buildValuation({
      ticker: "JPM", map: ISSUER_MAP.JPM, facts, filing: jpmFiling(),
      url: "https://sec.test/jpm", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("rim-common-distributions-incomplete");
  });

  test("rejects JPM when the pinned primary document differs", () => {
    const result = buildValuation({
      ticker: "JPM", map: ISSUER_MAP.JPM, facts: factsForBank(),
      filing: jpmFiling({ primaryDocument: "other-20251231.htm" }),
      url: "https://sec.test/jpm", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("rim-clean-surplus-unreconciled");
  });

  test("rejects missing distributions and capital as separate gates", () => {
    const missingDistributions = buildValuation({
      ticker: "JPM", map: ISSUER_MAP.JPM, facts: factsForBank({ distributions: false }),
      filing: jpmFiling(), url: "https://sec.test/jpm", riskFreeRate: 0.04, beta: 1,
    });
    expect(missingDistributions.eligible).toBe(false);
    expect(missingDistributions.reasonCodes).toContain("rim-common-distributions-incomplete");

    const missingCapital = buildValuation({
      ticker: "JPM", map: ISSUER_MAP.JPM, facts: factsForBank({ capital: false }),
      filing: jpmFiling(), url: "https://sec.test/jpm", riskFreeRate: 0.04, beta: 1,
    });
    expect(missingCapital.reasonCodes).toContain("rim-bank-capital-unavailable");
  });

  test("values BAC with the reviewed explicit common-equity bridge", () => {
    const result = buildValuation({
      ticker: "BAC", map: ISSUER_MAP.BAC,
      facts: factsForBac(),
      filing: bacFiling(),
      url: "https://www.sec.gov/Archives/edgar/data/70858/000007085826000157/bac-20251231.htm",
      riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(true);
    expect(result.provenance.fields.find((field) => field.reviewedSource)).toMatchObject({
      reviewedSource: expect.objectContaining({
        accession: "000007085826000157",
        primaryDocument: "bac-20251231.htm",
        selectionRule: expect.stringContaining("common-equity-component-bridge"),
        components: expect.arrayContaining([
          expect.objectContaining({ key: "retainedEarnings" }),
          expect.objectContaining({ key: "aoci" }),
        ]),
      }),
    });
    expect(result.observations.map((row) => row.equity.value)).toEqual([109, 117.5, 126]);
    expect(result.observations[0].equity.provenance.components.map((component) => component.provenance.contextRef)).toEqual(["c-45", "c-46", "c-47"]);
    expect(result.observations[0].reconciledOtherEquityChanges.bridgeBreakdown).toMatchObject({
      commonIncome: 15, dividends: 5, repurchases: 2, issuance: 1, stockCompTransfer: -1, preferredOther: 0.25,
    });
    expect(result.observations[0].reconciledOtherEquityChanges.movement).toBe(9);
  });

  test("accepts lowercase USD units for BAC bridge facts", () => {
    const facts = factsForBac();
    facts.forEach((item) => { item.unit = item.unit.toLowerCase(); });
    const result = buildValuation({
      ticker: "BAC", map: ISSUER_MAP.BAC, facts,
      filing: bacFiling(),
      url: "https://sec.test/bac", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(true);
  });

  test("ignores later non-annual contexts when selecting BAC history", () => {
    const facts = factsForBac();
    facts.push(fact("dei:EntityCommonStockSharesOutstanding", 10, "2026-12-31"));
    const result = buildValuation({
      ticker: "BAC", map: ISSUER_MAP.BAC, facts,
      filing: bacFiling(),
      url: "https://sec.test/bac", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(true);
    expect(result.observations.map((row) => row.yearEnd)).toEqual(ISSUER_MAP.BAC.cleanSurplusSource.annualYearEnds);
  });

  test("rejects duplicate BAC bridge facts in one pinned annual context", () => {
    const facts = factsForBac();
    facts.unshift(bacFact("us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic", 999, "2023-12-31", { kind: "duration" }));
    const result = buildValuation({
      ticker: "BAC", map: ISSUER_MAP.BAC, facts, filing: bacFiling(),
      url: "https://sec.test/bac", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("rim-clean-surplus-unreconciled");
  });

  test("rejects BAC when the pinned primary document differs", () => {
    const result = buildValuation({
      ticker: "BAC", map: ISSUER_MAP.BAC, facts: factsForBac(),
      filing: bacFiling({ primaryDocument: "other-20251231.htm" }),
      url: "https://sec.test/bac", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("rim-clean-surplus-unreconciled");
  });

  test("rejects BAC when an explicit equity component is missing", () => {
    const result = buildValuation({
      ticker: "BAC", map: ISSUER_MAP.BAC,
      facts: factsForBac({ missingMember: "aoci" }),
      filing: filing(), url: "https://sec.test/bac", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("rim-clean-surplus-unreconciled");
  });

  test("rejects BAC when a supposedly unsegmented flow carries an equity member", () => {
    const result = buildValuation({
      ticker: "BAC", map: ISSUER_MAP.BAC, facts: factsForBac({ mismatch: true }),
      filing: filing(), url: "https://sec.test/bac", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("rim-clean-surplus-unreconciled");
  });

  test("rejects BAC when an FY2023 accounting-change axis is mismatched", () => {
    const facts = factsForBac();
    const adoption = facts.find((item) => item.value === 0.2);
    adoption.context.dimensionMembers[1].dimension = "us-gaap:StatementEquityComponentsAxis";
    const result = buildValuation({
      ticker: "BAC", map: ISSUER_MAP.BAC, facts,
      filing: bacFiling(),
      url: "https://sec.test/bac", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("rim-clean-surplus-unreconciled");
  });

  test("rejects BAC when an FY2023 accounting-change member taxonomy is mismatched", () => {
    const facts = factsForBac();
    const adoption = facts.find((item) => item.value === 0.2);
    adoption.context.dimensionMembers[1].member = "us-gaap:CumulativeEffectPeriodOfAdoptionAdjustmentMember";
    const result = buildValuation({
      ticker: "BAC", map: ISSUER_MAP.BAC, facts,
      filing: bacFiling(),
      url: "https://sec.test/bac", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("rim-clean-surplus-unreconciled");
  });

  test("rejects BAC when an FY2023 accounting change is not on the pinned opening date", () => {
    const facts = factsForBac();
    const adoption = facts.find((item) => item.value === 0.2);
    adoption.context.instant = "2023-12-31";
    const result = buildValuation({
      ticker: "BAC", map: ISSUER_MAP.BAC, facts,
      filing: bacFiling(),
      url: "https://sec.test/bac", riskFreeRate: 0.04, beta: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain("rim-clean-surplus-unreconciled");
  });

  test("extracts BAC bridge-only tags from inline XBRL", () => {
    const html = [
      '<xbrli:context id="c1"><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate><xbrldi:explicitMember dimension="us-gaap:StatementEquityComponentsAxis">us-gaap:CommonStockIncludingAdditionalPaidInCapitalMember</xbrldi:explicitMember></xbrli:context>',
      '<ix:nonfraction name="us-gaap:StockRepurchasedAndRetiredDuringPeriodValue" contextRef="c1" unitRef="USD">2</ix:nonfraction>',
    ].join("");
    expect(extractInlineFacts(html, ISSUER_MAP.BAC)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "us-gaap:StockRepurchasedAndRetiredDuringPeriodValue", value: 2 }),
    ]));
  });

  test("extracts JPM issuer-specific reissuance tags from inline XBRL", () => {
    const html = [
      '<xbrli:context id="c-79"><xbrli:startDate>2023-01-01</xbrli:startDate><xbrli:endDate>2023-12-31</xbrli:endDate><xbrldi:explicitMember dimension="us-gaap:StatementEquityComponentsAxis">us-gaap:TreasuryStockCommonMember</xbrldi:explicitMember></xbrli:context>',
      '<ix:nonfraction name="jpm:TreasuryStockValueReissued" contextRef="c-79" unitRef="USD">1</ix:nonfraction>',
    ].join("");
    expect(extractInlineFacts(html, ISSUER_MAP.JPM)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "jpm:TreasuryStockValueReissued", value: 1, contextRef: "c-79" }),
    ]));
  });

  test("does not calibrate BAC to current price", () => {
    const result = buildValuation({
      ticker: "BAC", map: ISSUER_MAP.BAC, facts: factsForBac(),
      filing: filing(), url: "https://sec.test/bac", summary: { currentPrice: 999, sharesOutstanding: 10 },
      riskFreeRate: 0.04, beta: 1,
    });
    expect(result.currentPrice).toBeUndefined();
    expect(result.fairValue).not.toBe(999);
  });

  test("keeps AIG unvalued when statutory solvency mapping is unavailable", () => {
    const result = buildValuation({
      ticker: "AIG", map: ISSUER_MAP.AIG, facts: [], filing: filing(), url: "https://sec.test/aig",
      riskFreeRate: 0.04, beta: 1,
    });
    expect(result).toEqual(expect.objectContaining({ eligible: false, reasonCodes: ["rim-insurer-solvency-unavailable"] }));
  });

  test("short-circuits AIG before SEC configuration or network access", async () => {
    delete process.env.SEC_USER_AGENT;
    const previousFetch = global.fetch;
    global.fetch = jest.fn();
    const { getFinancialResidualIncome } = await import("../financialResidualIncome.js");
    await expect(getFinancialResidualIncome("AIG")).resolves.toMatchObject({
      eligible: false, status: "unvalued", reasonCodes: ["rim-insurer-solvency-unavailable"],
    });
    expect(global.fetch).not.toHaveBeenCalled();
    global.fetch = previousFetch;
  });

  test("requires insurer bridge and normalization fields", () => {
    const result = buildValuation({
      ticker: "ALL", map: ISSUER_MAP.ALL, facts: [], filing: filing(), url: "https://sec.test/all",
      riskFreeRate: 0.04, beta: 1,
    });
    expect(result.reasonCodes).toContain("rim-book-history-insufficient");
  });

  test("rejects CET1 and RWA facts with matching dimensions but different periods", () => {
    const facts = factsForBank();
    const rwa = facts.find((item) => item.name === "us-gaap:RiskWeightedAssets");
    rwa.context.instant = "2023-12-31";
    const result = buildValuation({
      ticker: "JPM", map: ISSUER_MAP.JPM, facts, filing: jpmFiling(), url: "https://sec.test/jpm",
      riskFreeRate: 0.04, beta: 1,
    });
    expect(result.reasonCodes).toContain("rim-bank-capital-unavailable");
  });

  test("selects by acceptance time and preserves available timestamp", () => {
    const result = selectLatestFiling({
      form: ["10-K", "10-K"], accessionNumber: ["old", "new"], filingDate: ["2025-02-02", "2025-02-01"],
      acceptanceDateTime: ["2025-02-02T18:00:00Z", "2025-02-01T18:00:00Z"], primaryDocument: ["old.htm", "new.htm"],
    }, "2025-02-03T00:00:00Z");
    expect(result.accessionNumber).toBe("old");
    expect(result.availableAt).toBe("2025-02-02T18:00:00Z");
  });

  test("rejects oversized streamed SEC bodies and retries after failure", async () => {
    let reads = 0;
    const cancel = jest.fn();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      body: { getReader: () => ({ read: async () => (reads++ === 0 ? { done: false, value: new Uint8Array(16 * 1024 * 1024 + 1) } : { done: true }), cancel, releaseLock() {} }) },
    });
    await expect(secFetch("https://sec.test/oversized", "text")).rejects.toThrow("maximum response size");
    expect(cancel).toHaveBeenCalledTimes(1);
    global.fetch.mockRejectedValueOnce(new Error("retry failure"));
    await expect(secFetch("https://sec.test/retry", "text")).rejects.toThrow("retry failure");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("rejects malformed unclosed inline tags before fact scanning", () => {
    expect(() => extractInlineFacts(
      '<ix:nonfraction name="jpm:CommonEquityTier1Capital" contextRef="c1">1', ISSUER_MAP.JPM,
    )).toThrow("Malformed SEC inline XBRL tags");
  });

  test("clears failed in-flight cache entries", async () => {
    const getter = () => undefined;
    const setter = jest.fn();
    const fetcher = jest.fn().mockRejectedValueOnce(new Error("first failure"));
    await expect(cache.getOrFetch(getter, setter, "rim-security-retry", fetcher)).rejects.toThrow("first failure");
    fetcher.mockResolvedValueOnce("second result");
    await expect(cache.getOrFetch(getter, setter, "rim-security-retry", fetcher)).resolves.toBe("second result");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
