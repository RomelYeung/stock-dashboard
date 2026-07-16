import { jest } from "@jest/globals";

// ─── Mock dependencies ───────────────────────────────────────────────────

const mockIngestHistoricalIV = jest.fn();
const mockCronSchedule = jest.fn();

const mockPortfolioItemFindMany = jest.fn();
const mockWishListItemFindMany = jest.fn();
const mockHistoricalIVCount = jest.fn();

jest.unstable_mockModule("../../services/historical-iv.js", () => ({
  ingestHistoricalIV: mockIngestHistoricalIV,
}));

jest.unstable_mockModule("node-cron", () => ({
  default: { schedule: mockCronSchedule },
  schedule: mockCronSchedule,
}));

jest.unstable_mockModule("../../services/db.js", () => ({
  default: {
    portfolioItem: {
      findMany: mockPortfolioItemFindMany,
    },
    wishListItem: {
      findMany: mockWishListItemFindMany,
    },
    historicalIV: {
      count: mockHistoricalIVCount,
    },
  },
}));

// ─── Import after mocks ─────────────────────────────────────────────────

const {
  ingestAllTickers,
  startCronJob,
  DEFAULT_TICKERS,
  getActiveTickers,
  runStartupCheck,
} = await import("../historical-iv-worker.js");

// ─── Tests ────────────────────────────────────────────────────────────────

describe("historical-iv-worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mocks return empty arrays so they default to DEFAULT_TICKERS
    mockPortfolioItemFindMany.mockResolvedValue([]);
    mockWishListItemFindMany.mockResolvedValue([]);
    mockHistoricalIVCount.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Constants ───────────────────────────────────────────────────────

  describe("DEFAULT_TICKERS", () => {
    test("is a non-empty array of strings", () => {
      expect(Array.isArray(DEFAULT_TICKERS)).toBe(true);
      expect(DEFAULT_TICKERS.length).toBeGreaterThan(0);
      for (const t of DEFAULT_TICKERS) {
        expect(typeof t).toBe("string");
      }
    });
  });

  // ─── getActiveTickers ────────────────────────────────────────────────

  describe("getActiveTickers", () => {
    test("resolves and merges portfolio and wishlist tickers with DEFAULT_TICKERS, sanitizing them", async () => {
      mockPortfolioItemFindMany.mockResolvedValue([
        { ticker: "aapl" },
        { ticker: "MSFT " },
      ]);
      mockWishListItemFindMany.mockResolvedValue([
        { ticker: "GOOG" },
        { ticker: "spy" },
      ]);

      const tickers = await getActiveTickers();

      // Should be unique, trimmed, and capitalized
      expect(tickers).toContain("AAPL");
      expect(tickers).toContain("MSFT");
      expect(tickers).toContain("GOOG");
      expect(tickers).toContain("SPY");

      // Verify no duplicates (e.g. SPY and AAPL are in DEFAULT_TICKERS)
      const spyCount = tickers.filter((t) => t === "SPY").length;
      expect(spyCount).toBe(1);

      // Total count should be DEFAULT_TICKERS + unique new ones (GOOG)
      expect(tickers.length).toBe(DEFAULT_TICKERS.length + 1);
    });

    test("falls back to DEFAULT_TICKERS on database error", async () => {
      mockPortfolioItemFindMany.mockRejectedValue(new Error("DB error"));

      const tickers = await getActiveTickers();
      expect(tickers).toEqual(DEFAULT_TICKERS);
    });
  });

  // ─── ingestAllTickers ────────────────────────────────────────────────

  describe("ingestAllTickers", () => {
    test("calls ingestHistoricalIV once per active ticker and returns results", async () => {
      mockIngestHistoricalIV.mockResolvedValue({ ticker: "SPY", iv: 0.20 });

      const results = await ingestAllTickers();

      expect(mockIngestHistoricalIV).toHaveBeenCalledTimes(
        DEFAULT_TICKERS.length,
      );
      for (const t of DEFAULT_TICKERS) {
        expect(mockIngestHistoricalIV).toHaveBeenCalledWith(t);
      }
      expect(results).toHaveLength(DEFAULT_TICKERS.length);
      for (const r of results) {
        expect(r).toHaveProperty("ticker");
      }
    });

    test("continues processing remaining tickers when one fails", async () => {
      mockIngestHistoricalIV
        .mockResolvedValueOnce({ ticker: "SPY", iv: 0.20 })
        .mockRejectedValueOnce(new Error("API error"))
        .mockResolvedValue({ ticker: "QQQ", iv: 0.25 });

      const results = await ingestAllTickers();

      expect(mockIngestHistoricalIV).toHaveBeenCalledTimes(
        DEFAULT_TICKERS.length,
      );
      expect(results).toHaveLength(DEFAULT_TICKERS.length);
    });

    test("returns results array even when all tickers fail", async () => {
      mockIngestHistoricalIV.mockRejectedValue(new Error("API error"));

      const results = await ingestAllTickers();

      expect(results).toHaveLength(DEFAULT_TICKERS.length);
    });
  });

  // ─── startCronJob ────────────────────────────────────────────────────

  describe("startCronJob", () => {
    test("schedules daily cron at 17:00 America/New_York weekdays (5 PM EST)", () => {
      const mockTask = { start: jest.fn() };
      mockCronSchedule.mockReturnValue(mockTask);

      // Mock runStartupCheck to prevent it calling DB during this test
      mockHistoricalIVCount.mockResolvedValue(1);

      startCronJob();

      expect(mockCronSchedule).toHaveBeenCalledTimes(1);
      expect(mockCronSchedule.mock.calls[0][0]).toBe("0 17 * * 1-5");
      expect(mockCronSchedule.mock.calls[0][2]).toEqual({
        timezone: "America/New_York",
      });
    });

    test("calls start on the scheduled task", () => {
      const mockTask = { start: jest.fn() };
      mockCronSchedule.mockReturnValue(mockTask);

      mockHistoricalIVCount.mockResolvedValue(1);

      startCronJob();

      expect(mockTask.start).toHaveBeenCalledTimes(1);
    });
  });

  // ─── runStartupCheck ─────────────────────────────────────────────────

  describe("runStartupCheck", () => {
    test("skips check on weekends in America/New_York", async () => {
      jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({
        format: () => "Sat",
      }));

      await runStartupCheck();

      expect(mockHistoricalIVCount).not.toHaveBeenCalled();
      expect(mockIngestHistoricalIV).not.toHaveBeenCalled();
    });

    test("skips ingestion if records already exist for today", async () => {
      jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({
        format: () => "Mon",
      }));
      mockHistoricalIVCount.mockResolvedValue(10); // records exist

      await runStartupCheck();

      expect(mockHistoricalIVCount).toHaveBeenCalledTimes(1);
      expect(mockIngestHistoricalIV).not.toHaveBeenCalled();
    });

    test("triggers background ingestion if no records exist for today on a weekday", async () => {
      jest.spyOn(Intl, "DateTimeFormat").mockImplementation(() => ({
        format: () => "Mon",
      }));
      mockHistoricalIVCount.mockResolvedValue(0); // no records
      mockIngestHistoricalIV.mockResolvedValue({ ticker: "SPY", iv: 0.22 });

      await runStartupCheck();

      expect(mockHistoricalIVCount).toHaveBeenCalledTimes(1);
      expect(mockIngestHistoricalIV).toHaveBeenCalled();
    });
  });
});
