import { calcRealizedVolatility, calcIVRank, calcIVPercentile } from "../context.js";
import { logStrike, lerp, calcSpreadAdjustedEdge, calcGEX } from "../mathUtils.js";
import { sviTotalVariance, sviImpliedVol, fitSVI } from "../svi.js";

describe("quant/context.js", () => {
  describe("calcRealizedVolatility", () => {
    test("returns null if insufficient close prices", () => {
      expect(calcRealizedVolatility(null)).toEqual({ rv: null, annualized: true, window: 20 });
      expect(calcRealizedVolatility([100, 101], 5)).toEqual({ rv: null, annualized: true, window: 5 });
    });

    test("computes correct annualized realized volatility", () => {
      // 21 close prices = 20 returns
      // If price rises by exactly 1% each day: return = ln(1.01) = 0.0099503
      // Since all returns are identical, standard deviation should be 0.
      const prices = Array.from({ length: 21 }, (_, i) => 100 * Math.pow(1.01, i));
      const res = calcRealizedVolatility(prices, 20);
      expect(res.rv).toBeCloseTo(0, 5);
      expect(res.annualized).toBe(true);
      expect(res.window).toBe(20);
    });

    test("computes volatility for fluctuating series", () => {
      // Simple alternating series
      const prices = [100, 102, 100, 102, 100, 102, 100, 102, 100, 102, 100];
      const res = calcRealizedVolatility(prices, 10);
      expect(res.rv).toBeGreaterThan(0);
      expect(res.rv).toBeCloseTo(0.3314, 2);
    });
  });

  describe("calcIVRank", () => {
    test("handles null or empty history", () => {
      expect(calcIVRank(0.30, null)).toEqual({ ivr: null, minIV: null, maxIV: null, count: 0 });
      expect(calcIVRank(0.30, [])).toEqual({ ivr: null, minIV: null, maxIV: null, count: 0 });
      expect(calcIVRank(null, [0.20, 0.40])).toEqual({ ivr: null, minIV: null, maxIV: null, count: 0 });
    });

    test("computes correct IV Rank", () => {
      const history = [0.10, 0.20, 0.30, 0.40, 0.50];
      const res = calcIVRank(0.30, history);
      expect(res.ivr).toBeCloseTo(0.5, 6); // (0.30 - 0.10) / (0.50 - 0.10) = 0.20 / 0.40 = 0.5
      expect(res.minIV).toBe(0.10);
      expect(res.maxIV).toBe(0.50);
      expect(res.count).toBe(5);
    });

    test("clamps IV Rank to [0, 1]", () => {
      const history = [0.20, 0.30, 0.40];
      const resLow = calcIVRank(0.10, history);
      expect(resLow.ivr).toBe(0);
      const resHigh = calcIVRank(0.50, history);
      expect(resHigh.ivr).toBe(1);
    });

    test("handles identical min and max IV", () => {
      expect(calcIVRank(0.30, [0.30, 0.30])).toEqual({ ivr: 1, minIV: 0.30, maxIV: 0.30, count: 2 });
      expect(calcIVRank(0.40, [0.30, 0.30])).toEqual({ ivr: 1, minIV: 0.30, maxIV: 0.30, count: 2 });
      expect(calcIVRank(0.20, [0.30, 0.30])).toEqual({ ivr: 0, minIV: 0.30, maxIV: 0.30, count: 2 });
    });
  });

  describe("calcIVPercentile", () => {
    test("handles null or empty inputs", () => {
      expect(calcIVPercentile(0.30, null)).toBeNull();
      expect(calcIVPercentile(0.30, [])).toBeNull();
      expect(calcIVPercentile(null, [0.20])).toBeNull();
    });

    test("computes correct IV percentile", () => {
      const history = [0.10, 0.20, 0.30, 0.40, 0.50];
      // 0.35 is above [0.10, 0.20, 0.30] (3 values out of 5)
      expect(calcIVPercentile(0.35, history)).toBe(60);
      // 0.05 is above 0 values
      expect(calcIVPercentile(0.05, history)).toBe(0);
      // 0.60 is above 5 values
      expect(calcIVPercentile(0.60, history)).toBe(100);
    });
  });
});

describe("quant/mathUtils.js", () => {
  test("logStrike computes log(K / F)", () => {
    expect(logStrike(100, 100)).toBe(0);
    expect(logStrike(110, 100)).toBeCloseTo(Math.log(1.1), 6);
  });

  test("lerp interpolates between two points", () => {
    expect(lerp(0.5, 0, 1, 10, 20)).toBe(15);
    expect(lerp(0.2, 0, 1, 10, 20)).toBe(12);
    // Identical boundaries
    expect(lerp(0.5, 2, 2, 10, 20)).toBe(15);
  });

  describe("calcSpreadAdjustedEdge", () => {
    test("floors vega division and calculates spread penalty", () => {
      // rawEdge = 0.05 (5% edge), ask = 2.1, bid = 1.9 (half spread = 0.1)
      // vega = 0.1
      // penalty = 0.1 / (0.1 * 100) = 0.1 / 10 = 0.01
      // adjEdge = 0.05 - 0.01 = 0.04
      expect(calcSpreadAdjustedEdge(0.05, 2.1, 1.9, 0.1)).toBeCloseTo(0.04, 6);
    });

    test("floors adjusted edge at 0 if penalty exceeds edge", () => {
      // penalty = 0.1 / (0.01 * 100) = 0.1 / 1 = 0.1
      // abs(rawEdge) = 0.05. Since 0.1 >= 0.05, returns 0.
      expect(calcSpreadAdjustedEdge(0.05, 2.1, 1.9, 0.01)).toBe(0);
    });

    test("respects negative raw edge signs", () => {
      // rawEdge = -0.05, penalty = 0.01
      // adjEdge = -1 * (0.05 - 0.01) = -0.04
      expect(calcSpreadAdjustedEdge(-0.05, 2.1, 1.9, 0.1)).toBeCloseTo(-0.04, 6);
    });

    test("uses minVega floor when option vega is very low", () => {
      // vega = 0, minVega = 0.001
      // penalty = 0.1 / (0.001 * 100) = 0.1 / 0.1 = 1.0
      // Since penalty (1.0) > edge (0.05), returns 0
      expect(calcSpreadAdjustedEdge(0.05, 2.1, 1.9, 0)).toBe(0);
    });
  });

  describe("calcGEX", () => {
    test("filters to contracts with DTE <= 30 and sums Call/Put GEX", () => {
      const options = [
        { strike: 100, gamma: 0.05, openInterest: 1000, type: "call", dte: 10 },
        { strike: 100, gamma: 0.05, openInterest: 800, type: "put", dte: 20 },
        // This contract should be filtered out (DTE > 30)
        { strike: 100, gamma: 0.05, openInterest: 5000, type: "call", dte: 45 },
      ];
      // spot = 100
      // Call GEX = 0.05 * 1000 * 100 * 100 = 500,000
      // Put GEX = 0.05 * 800 * 100 * 100 = 400,000
      // net GEX = 500,000 - 400,000 = 100,000
      // count = 2
      const result = calcGEX(options, 100);
      expect(result.total).toBe(100000);
      expect(result.callGex).toBe(500000);
      expect(result.putGex).toBe(400000);
      expect(result.contractCount).toBe(2);
    });
  });
});

describe("quant/svi.js", () => {
  const sampleParams = { a: 0.04, b: 0.1, rho: -0.2, m: 0.01, sigma: 0.1 };

  test("sviTotalVariance evaluates formula correctly", () => {
    // k = 0.01 (k - m = 0)
    // w(0.01) = 0.04 + 0.1 * (0 + sqrt(0^2 + 0.1^2)) = 0.04 + 0.1 * 0.1 = 0.05
    expect(sviTotalVariance(0.01, sampleParams)).toBeCloseTo(0.05, 6);
  });

  describe("sviImpliedVol", () => {
    test("computes implied volatility", () => {
      expect(sviImpliedVol(0.01, sampleParams)).toBeCloseTo(Math.sqrt(0.05), 6);
    });

    test("guards against negative total variance", () => {
      const negativeVarParams = { a: -0.05, b: 0.01, rho: 0, m: 0, sigma: 0.1 };
      // w(0) = -0.05 + 0.01 * 0.1 = -0.049. Clamped to 0.
      expect(sviImpliedVol(0, negativeVarParams)).toBe(0);
    });
  });

  describe("fitSVI", () => {
    test("returns null for invalid or small datasets", () => {
      expect(fitSVI(null, [0.3])).toBeNull();
      expect(fitSVI([-0.1, 0, 0.1], [0.3, 0.28, 0.29])).toBeNull(); // Less than 5 points
      expect(fitSVI([-0.2, -0.1, 0, 0.1, 0.2], [0.3, 0.28, 0.29])).toBeNull(); // Length mismatch
    });

    test("fits standard implied volatility smile", () => {
      const kData = [-0.2, -0.1, 0, 0.1, 0.2];
      const ivData = [0.35, 0.32, 0.30, 0.31, 0.33];

      const res = fitSVI(kData, ivData);
      expect(res).not.toBeNull();
      expect(res.a).toBeGreaterThan(0);
      expect(res.b).toBeGreaterThan(0);
      expect(res.rho).toBeLessThan(1);
      expect(res.rho).toBeGreaterThan(-1);
      expect(res.error).toBeLessThan(1e-5);
    });

    test("fits high implied volatility assets and converges", () => {
      // assets with IV > 100% (variance > 1.0)
      const kData = [-0.2, -0.1, 0, 0.1, 0.2];
      const highIvData = [1.50, 1.35, 1.20, 1.25, 1.40];

      const res = fitSVI(kData, highIvData);
      expect(res).not.toBeNull();
      expect(res.a).toBeGreaterThan(1.0); // Minimum variance is 1.2^2 = 1.44
      expect(res.error).toBeLessThan(1e-5);
      expect(res.iterations).toBeLessThan(200); // Should converge without hitting max limit
    });
  });
});
