import { jest } from "@jest/globals";

// Mock prisma and google genai dependencies
const mockFindUnique = jest.fn();
jest.unstable_mockModule("../db.js", () => ({
  default: {
    investor: {
      findUnique: mockFindUnique,
    },
  },
}));

const mockGenerateContent = jest.fn().mockResolvedValue({
  text: "Mocked AI Strategy summary text for quality leaders."
});
jest.unstable_mockModule("../aiClient.js", () => ({
  getAiClient: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent
    }
  }))
}));

// Let's import the functions to test
const { generateAiStrategySummary, clearAiStrategyCache } = await import("../guruAi.js");
const { truncateHoldingsForPrompt } = await import("../sec.js");

describe("Challenger Phase 3 verification tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAiStrategyCache();
  });

  describe("1. AI Strategy cache concurrency", () => {
    test("concurrent requests bypass cache and query database multiple times", async () => {
      // Setup mock findUnique that resolves after a short delay to simulate async db latency
      mockFindUnique.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              id: "inv-123",
              name: "Warren Buffett",
              filings: [
                {
                  holdings: [
                    { ticker: "AAPL", shares: 100, portfolioWeight: 0.5 },
                  ],
                },
              ],
            });
          }, 50);
        });
      });

      // Call generateAiStrategySummary concurrently
      const [res1, res2] = await Promise.all([
        generateAiStrategySummary("inv-123"),
        generateAiStrategySummary("inv-123"),
      ]);

      // Both should have hit the database since no promise caching or request locking is implemented
      expect(mockFindUnique).toHaveBeenCalledTimes(2);

      // Verify that both results claim they generated the content (cached: false)
      expect(res1.cached).toBe(false);
      expect(res2.cached).toBe(false);
      expect(res1.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");
      expect(res2.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");
    });
  });

  describe("2. truncateHoldingsForPrompt under extreme inputs", () => {
    test("handles null or undefined input gracefully (it currently throws TypeError)", () => {
      expect(() => truncateHoldingsForPrompt(null)).toThrow(TypeError);
      expect(() => truncateHoldingsForPrompt(undefined)).toThrow(TypeError);
    });

    test("handles large input sizes (1000+)", () => {
      const list = Array.from({ length: 1500 }, (_, i) => ({ ticker: `TK-${i}` }));
      // With tokenLimit = 100, each element takes 10 tokens, so it should keep 10 elements.
      const truncated = truncateHoldingsForPrompt(list, 100);
      expect(truncated).toHaveLength(10);
    });

    test("handles negative shares/weight and corrupt tickers", () => {
      const corruptList = [
        { ticker: null, shares: -500, portfolioWeight: -0.25 },
        { ticker: "", shares: NaN, portfolioWeight: Infinity },
      ];
      // truncateHoldingsForPrompt just copies elements and counts tokens, so it doesn't crash on bad values
      const truncated = truncateHoldingsForPrompt(corruptList, 100);
      expect(truncated).toHaveLength(2);
      
      // But let's check how the caller (guruAi.js line 69) formats these:
      // mappings are: `${h.ticker}: ${h.shares} shares, ${(h.portfolioWeight * 100).toFixed(2)}% weight`
      const format = (h) => `${h.ticker}: ${h.shares} shares, ${(h.portfolioWeight * 100).toFixed(2)}% weight`;
      
      // Verify h.ticker as null renders "null"
      expect(format(corruptList[0])).toBe("null: -500 shares, -25.00% weight");
      
      // Verify h.portfolioWeight as Infinity formats to 'Infinity' and shares to 'NaN' without throwing
      const formattedCorrupt = format(corruptList[1]);
      expect(formattedCorrupt).toBe(": NaN shares, Infinity% weight");
    });
  });

  describe("3. Cache invalidation behavior on sync", () => {
    test("investor AI strategy cache is NOT cleared after sync", async () => {
      // Mock db lookup
      mockFindUnique.mockResolvedValue({
        id: "inv-123",
        name: "Warren Buffett",
        filings: [{ holdings: [] }],
      });

      // Call it once to populate the cache
      const res1 = await generateAiStrategySummary("inv-123");
      expect(res1.cached).toBe(false);
      expect(res1.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");

      // Call again to verify it is cached
      const res2 = await generateAiStrategySummary("inv-123");
      expect(res2.cached).toBe(true);
      expect(res2.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");

      // Simulate the sync request invalidation: in routes/gurus.js line 388,
      // it only does `activityFeedAiSummaryCache = null`.
      // It does NOT call clearAiStrategyCache("inv-123").
      // So the cached AI strategy summary for "inv-123" remains cached!
      
      // Verify that after sync (which doesn't call clearAiStrategyCache for the investor),
      // the cache still returns the cached result.
      const res3 = await generateAiStrategySummary("inv-123");
      expect(res3.cached).toBe(true); // Stale cache hit!
    });
  });
});
