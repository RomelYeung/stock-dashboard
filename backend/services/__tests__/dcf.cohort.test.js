import {
  aggregateDCFInputs,
  classifyValuationCohort,
  getDCFIneligibilityReasons,
} from "../dcf.js";

const corporateSummary = {
  sector: "Technology",
  industry: "Software",
  marketCap: 10_000,
  currentPrice: 50,
  sharesOutstanding: 200,
};

test("classifies bank, mature, growth, and unsupported cohorts", () => {
  expect(classifyValuationCohort(
    { sector: "Financial Services", industry: "Banks - Regional" },
    { modelType: "financial-residual-income", fcf: 100, sharesOutstanding: 10, wacc: 0.1, terminalGrowth: 0.02 },
  )).toEqual({ cohort: "bank-insurer", reasons: ["residual-income-not-implemented"] });
  expect(classifyValuationCohort(corporateSummary, {
    modelType: "corporate-fcff", fcf: 100, sharesOutstanding: 10, wacc: 0.1, terminalGrowth: 0.02, projectionGrowth: 0.1,
  }).cohort).toBe("mature-fcff");
  expect(classifyValuationCohort(corporateSummary, {
    modelType: "corporate-fcff", fcf: 100, sharesOutstanding: 10, wacc: 0.1, terminalGrowth: 0.02, projectionGrowth: 0.2,
  }).cohort).toBe("growth-fcff");
  expect(classifyValuationCohort(corporateSummary, {
    modelType: "corporate-fcff", fcf: 0, sharesOutstanding: 10, wacc: 0.1, terminalGrowth: 0.02, projectionGrowth: 0.1,
  })).toEqual({ cohort: "unsupported", reasons: ["fcf-non-positive"] });
});

test("aggregate output carries the cohort and shared reasons", () => {
  const params = aggregateDCFInputs(
    corporateSummary,
    { availableDate: "2022-12-31", revenueGrowth: 0.1 },
    { availableDate: "2022-12-31", freeCashflow: 0, totalCash: 0, totalDebt: 0 },
    [],
    [],
  );
  expect(params).toMatchObject({ cohort: "unsupported", cohortReasons: ["fcf-non-positive"], eligible: false });
  expect(getDCFIneligibilityReasons(params)).toEqual(["fcf-non-positive"]);

  const valuedParams = aggregateDCFInputs(
    corporateSummary,
    { revenueGrowth: 0.1 },
    { freeCashflow: 100, totalCash: 0, totalDebt: 0 },
    [],
    [],
  );
  expect(valuedParams).toMatchObject({ cohort: "mature-fcff", eligible: true });
});
