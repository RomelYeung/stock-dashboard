import { jest } from "@jest/globals";

// ─── Mock dependencies ────────────────────────────────────────────────────

const mockGetOptionChainParsed = jest.fn();
const mockGetHistoricalDailyData = jest.fn();
const mockGetHistoricalIV = jest.fn();
const mockFitSVI = jest.fn();
const mockSviTotalVariance = jest.fn();
const mockLogStrike = jest.fn();
const mockCalcSpreadAdjustedEdge = jest.fn();
const mockCalcGEX = jest.fn();

jest.unstable_mockModule("../../services/schwab-client.js", () => ({
  getOptionChainParsed: mockGetOptionChainParsed,
}));

jest.unstable_mockModule("../../services/yahoofinance.js", () => ({
  getHistoricalDailyData: mockGetHistoricalDailyData,
}));

jest.unstable_mockModule("../../services/historical-iv.js", () => ({
  getHistoricalIV: mockGetHistoricalIV,
}));

jest.unstable_mockModule("../../src/quant/svi.js", () => ({
  fitSVI: mockFitSVI,
  sviTotalVariance: mockSviTotalVariance,
}));

jest.unstable_mockModule("../../src/quant/mathUtils.js", () => ({
  logStrike: mockLogStrike,
  calcSpreadAdjustedEdge: mockCalcSpreadAdjustedEdge,
  calcGEX: mockCalcGEX,
}));

// ─── Import after mocks ───────────────────────────────────────────────────

const { default: router } = await import("../options.js");

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeChainStub() {
  return {
    underlyingPrice: 100,
    calls: [
      { strike: 100, iv: 0.30, expiration: "2026-06-19", expirationStr: "2026-06-19", dte: 30, bid: 5, ask: 5.2, delta: 0.5, gamma: 0.05, theta: -0.02, vega: 0.15, rho: 0.01, itm: true, type: "call", volume: 1000, openInterest: 5000 },
    ],
    puts: [
      { strike: 100, iv: 0.31, expiration: "2026-06-19", expirationStr: "2026-06-19", dte: 30, bid: 4.5, ask: 4.7, delta: -0.5, gamma: 0.05, theta: -0.02, vega: 0.15, rho: -0.01, itm: false, type: "put", volume: 800, openInterest: 3000 },
    ],
  };
}

function callRoute(ticker) {
  return new Promise((resolve, reject) => {
    const req = {
      params: { ticker },
      method: "GET",
      url: `/scan/${ticker}`,
      path: `/scan/${ticker}`,
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation((body) => resolve(body)),
    };
    router(req, res, (err) => {
      if (err) reject(err);
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("GET /api/options/scan/:ticker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("uses historical IV data for IVR and IVP calculations", async () => {
    // Chain has atmIV=0.30 (strike 100)
    mockGetOptionChainParsed.mockResolvedValue(makeChainStub());
    mockGetHistoricalDailyData.mockResolvedValue([]);

    // Historical IV values: [0.25, 0.28] → min=0.25, max=0.28
    // With currentIV=0.30: ivr = (0.30-0.25)/(0.28-0.25) = 1.67 → clamped to 1
    // With currentIV=0.30: ivp = 2/2*100 = 100
    mockGetHistoricalIV.mockResolvedValue([
      { date: "2026-05-14", iv: 0.25 },
      { date: "2026-05-15", iv: 0.28 },
    ]);

    // SVI/mathUtils stubs
    mockFitSVI.mockReturnValue(null);
    mockSviTotalVariance.mockReturnValue(0);
    mockLogStrike.mockReturnValue(0);
    mockCalcSpreadAdjustedEdge.mockReturnValue(0);
    mockCalcGEX.mockReturnValue({ total: 0, callGex: 0, putGex: 0, contractCount: 0 });

    const body = await callRoute("AAPL");

    expect(body.success).toBe(true);
    expect(mockGetHistoricalIV).toHaveBeenCalledWith("AAPL");
    expect(body.data.context.ivr).toEqual({
      ivr: 1,          // clamped to 1 because currentIV > max historical
      minIV: 0.25,
      maxIV: 0.28,
      count: 2,
      source: "historical",
    });
    expect(body.data.context.ivp).toEqual({
      value: 100,       // currentIV > all historical values
      count: 2,
      source: "historical",
    });
  });

  test("falls back to chain-wide IV distribution when no historical data exists", async () => {
    mockGetOptionChainParsed.mockResolvedValue(makeChainStub());
    mockGetHistoricalDailyData.mockResolvedValue([]);
    mockGetHistoricalIV.mockResolvedValue([]);

    mockFitSVI.mockReturnValue(null);
    mockSviTotalVariance.mockReturnValue(0);
    mockLogStrike.mockReturnValue(0);
    mockCalcSpreadAdjustedEdge.mockReturnValue(0);
    mockCalcGEX.mockReturnValue({ total: 0, callGex: 0, putGex: 0, contractCount: 0 });

    const body = await callRoute("AAPL");

    expect(body.success).toBe(true);
    // With no historical data, should fall back to chain-wide IVs: [0.30, 0.31]
    // atmIV=0.30: min=0.30, max=0.31, ivr=(0.30-0.30)/(0.31-0.30)=0
    // ivp: below=0, total=2, ivp=0
    expect(body.data.context.ivr).toMatchObject({
      ivr: 0,
      source: "chain-proxy",
    });
    expect(body.data.context.ivp).toMatchObject({
      value: 0,
      source: "chain-proxy",
    });
    // Ensure getHistoricalIV was still called
    expect(mockGetHistoricalIV).toHaveBeenCalledWith("AAPL");
  });

  test("returns 400 for invalid ticker", async () => {
    const body = await callRoute("INVALID@TICKER");

    expect(body.success).toBe(false);
    expect(body.error).toContain("Invalid ticker");
  });
});
