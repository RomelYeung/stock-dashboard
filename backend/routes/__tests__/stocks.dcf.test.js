import { jest } from "@jest/globals";

const mockGetSummary = jest.fn();
const mockGetFinancials = jest.fn();
const mockGetBalanceSheet = jest.fn();
const mockGetTreasuryYield = jest.fn();
const mockGetFinancialResidualIncome = jest.fn();

jest.unstable_mockModule("../../services/yahoofinance.js", () => ({
  getSummary: mockGetSummary,
  getFinancials: mockGetFinancials,
  getBalanceSheet: mockGetBalanceSheet,
  getPriceHistory: jest.fn(),
  getOhlcv: jest.fn(),
  getHoldings: jest.fn(),
  getLivePrices: jest.fn(),
  getPortfolioSummaries: jest.fn(),
  getFundamentalsTimeSeries: jest.fn(),
  searchTickers: jest.fn(),
}));

jest.unstable_mockModule("../../services/fred.js", () => ({
  getTreasuryYield: mockGetTreasuryYield,
  getConsumerSentiment: jest.fn(),
  getCreditSpreads: jest.fn(),
  getFedBalanceSheet: jest.fn(),
  getFedFundsRate: jest.fn(),
  getInflation: jest.fn(),
  getUnemployment: jest.fn(),
  getYieldCurve: jest.fn(),
}));

jest.unstable_mockModule("../../services/financialResidualIncome.js", () => ({
  getFinancialResidualIncome: mockGetFinancialResidualIncome,
}));

const { default: router } = await import("../stocks.js");

function request(ticker) {
  return new Promise((resolve, reject) => {
    const req = {
      method: "GET",
      url: `/${ticker}/dcf?simulations=100`,
      path: `/${ticker}/dcf`,
      params: { ticker },
      query: { simulations: "100" },
      ip: "127.0.0.1",
      headers: {},
      app: { get: jest.fn(() => false) },
    };
    let statusCode = 200;
    const res = {
      status: jest.fn().mockImplementation((code) => {
        statusCode = code;
        return res;
      }),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      json: jest.fn().mockImplementation((body) => resolve({ status: statusCode, body })),
    };
    router(req, res, (error) => reject(error || new Error("route did not respond")));
  });
}

describe("GET /api/stocks/:ticker/dcf", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFinancials.mockResolvedValue({ revenueGrowth: 0.08, annualIncome: [] });
    mockGetBalanceSheet.mockResolvedValue({ freeCashflow: 100, totalCash: 10, totalDebt: 0 });
    mockGetTreasuryYield.mockResolvedValue({ currentValue: 4.5 });
    mockGetFinancialResidualIncome.mockResolvedValue({
      eligible: false,
      status: "unvalued",
      financialSubtype: "bank",
      reasonCodes: ["rim-bank-capital-unavailable"],
    });
  });

  test("gates financial companies before corporate FCFF valuation", async () => {
    mockGetSummary.mockResolvedValue({
      ticker: "JPM",
      sector: "Financial Services",
      industry: "Banks - Diversified",
      marketCap: 1_000,
      currentPrice: 100,
    });

    const result = await request("JPM");
    expect(result.status).toBe(200);
    expect(result.body.data.params).toMatchObject({
      modelType: "financial-residual-income",
      eligible: false,
    });
    expect(result.body.data.dcf).toBeNull();
    expect(mockGetTreasuryYield).toHaveBeenCalledWith("1mo");
    expect(mockGetFinancialResidualIncome).toHaveBeenCalled();
    expect(mockGetFinancialResidualIncome.mock.calls[0][1].valuationAsOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.body.data.rim).toMatchObject({ eligible: false, status: "unvalued", reasonCodes: ["rim-bank-capital-unavailable"] });
  });

  test("converts FRED percentage points to a decimal and falls back non-fatally", async () => {
    mockGetSummary.mockResolvedValue({
      ticker: "MSFT",
      sector: "Technology",
      marketCap: 1_000,
      currentPrice: 10,
      sharesOutstanding: 100,
      beta: 1,
    });
    mockGetTreasuryYield.mockResolvedValue({ currentValue: 4.74 });

    let result = await request("MSFT");
    expect(result.status).toBe(200);
    expect(result.body.data.params.rf).toBeCloseTo(0.0474, 8);
    expect(result.body.data.params.riskFreeRateSource).toBe("fred:DGS10");
    expect(result.body.data.params.terminalGrowthSource).toBe("static-sector-prior");
    expect(result.body.data.sensitivity.values[10][10]).toBe(result.body.data.dcf.fairValue);

    mockGetTreasuryYield.mockRejectedValue(new Error("FRED unavailable"));
    result = await request("MSFT");
    expect(result.status).toBe(200);
    expect(result.body.data.params.rf).toBeCloseTo(0.0425, 8);
    expect(result.body.data.params.riskFreeRateSource).toBe("fallback-static");
    expect(result.body.data.params.diagnostics).toContain("risk-free-rate-fallback");
  });

  test("returns additive driver metadata while retaining legacy scalar fields", async () => {
    mockGetSummary.mockResolvedValue({
      ticker: "GROW",
      sector: "Technology",
      industry: "Software",
      marketCap: 1_000,
      currentPrice: 10,
      sharesOutstanding: 100,
      beta: 1,
    });
    mockGetFinancials.mockResolvedValue({
      revenueGrowth: 0.3,
      annualIncome: [
        { date: "2022-12-31", totalRevenue: 100, operatingIncome: 10 },
        { date: "2023-12-31", totalRevenue: 130, operatingIncome: 15 },
      ],
    });
    mockGetBalanceSheet.mockResolvedValue({
      freeCashflow: 10,
      totalCash: 10,
      totalDebt: 20,
      annualBalanceSheet: [
        { date: "2022-12-31", totalEquity: 100, totalDebt: 20, cash: 10 },
        { date: "2023-12-31", totalEquity: 110, totalDebt: 20, cash: 10 },
      ],
    });
    mockGetTreasuryYield.mockResolvedValue({ currentValue: 4 });

    const result = await request("GROW");
    expect(result.status).toBe(200);
    expect(result.body.data.params).toMatchObject({
      projectionMethod: "driver-fcff",
      modelType: "corporate-fcff",
      fcf: expect.any(Number),
      wacc: expect.any(Number),
      terminalGrowth: expect.any(Number),
      drivers: {
        assumptions: expect.any(Object),
        annualSchedule: expect.any(Array),
        sources: expect.any(Object),
      },
    });
    expect(result.body.data.dcf.projectedFCFs).toHaveLength(10);
    expect(result.body.data.sensitivity.values[10][10]).toBe(result.body.data.dcf.fairValue);
  });
});
