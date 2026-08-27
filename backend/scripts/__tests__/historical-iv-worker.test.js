import { jest } from "@jest/globals";

// ─── Mock dependencies ───────────────────────────────────────────────────

const mockIngestHistoricalIV = jest.fn();
const mockCronSchedule = jest.fn();

const mockPortfolioItemFindMany = jest.fn();
const mockWishListItemFindMany = jest.fn();
const mockHistoricalIVCount = jest.fn();
const mockHistoricalIVFindFirst = jest.fn();

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
      findFirst: mockHistoricalIVFindFirst,
    },
  },
}));

const mockIsTradingDay = jest.fn(() => true);
const mockGetNYTradingDateStr = jest.fn(() => "2026-07-31");
const mockGetMissedTradingDays = jest.fn(() => []);

jest.unstable_mockModule("../../services/trading-calendar.js", () => ({
  isTradingDay: mockIsTradingDay,
  getNYTradingDateStr: mockGetNYTradingDateStr,
  getMissedTradingDays: mockGetMissedTradingDays,
}));

// ─── Import after mocks ─────────────────────────────────────────────────

const {
  ingestAllTickers,
  startCronJob,
  DEFAULT_TICKERS,
  getActiveTickers,
  runBackfill,
  runIngestionWithRetry,
} = await import("../historical-iv-worker.js");

// ─── Tests ────────────────────────────────────────────────────────────────

describe("historical-iv-worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mocks return empty arrays so they default to DEFAULT_TICKERS
    mockPortfolioItemFindMany.mockResolvedValue([]);
    mockWishListItemFindMany.mockResolvedValue([]);
    mockHistoricalIVCount.mockResolvedValue(0);
    mockHistoricalIVFindFirst.mockResolvedValue(null);
    mockIsTradingDay.mockReturnValue(true);
    mockGetNYTradingDateStr.mockReturnValue("2026-07-31");
    mockGetMissedTradingDays.mockReturnValue([]);
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
    test("calls ingestHistoricalIV once per active ticker and passes tradingDate", async () => {
      mockIngestHistoricalIV.mockResolvedValue({ ticker: "SPY", iv: 0.20 });

      const results = await ingestAllTickers("2026-07-31");

      expect(mockIngestHistoricalIV).toHaveBeenCalledTimes(
        DEFAULT_TICKERS.length,
      );
      for (const t of DEFAULT_TICKERS) {
        expect(mockIngestHistoricalIV).toHaveBeenCalledWith(t, "2026-07-31");
      }
      expect(results).toHaveLength(DEFAULT_TICKERS.length);
      for (const r of results) {
        expect(r).toHaveProperty("ticker");
      }
    });

    test("passes null tradingDate when called without argument", async () => {
      mockIngestHistoricalIV.mockResolvedValue({ ticker: "SPY", iv: 0.20 });

      await ingestAllTickers();

      expect(mockIngestHistoricalIV).toHaveBeenCalledWith(
        expect.any(String),
        null,
      );
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
    test("schedules primary cron at 17:00 and safety-net at 18:00 America/New_York", () => {
      const mockTask = { start: jest.fn() };
      mockCronSchedule.mockReturnValue(mockTask);

      startCronJob();

      expect(mockCronSchedule).toHaveBeenCalledTimes(2);
      // Primary cron
      expect(mockCronSchedule.mock.calls[0][0]).toBe("0 17 * * 1-5");
      expect(mockCronSchedule.mock.calls[0][2]).toEqual({
        timezone: "America/New_York",
      });
      // Safety-net cron
      expect(mockCronSchedule.mock.calls[1][0]).toBe("0 18 * * 1-5");
      expect(mockCronSchedule.mock.calls[1][2]).toEqual({
        timezone: "America/New_York",
      });
    });

    test("calls start on both scheduled tasks", () => {
      const mockTask = { start: jest.fn() };
      mockCronSchedule.mockReturnValue(mockTask);

      startCronJob();

      expect(mockTask.start).toHaveBeenCalledTimes(2);
    });
  });

  // ─── runBackfill ────────────────────────────────────────────────────

  describe("runBackfill", () => {
    test("no backfill needed when all recent days have full counts", async () => {
      mockGetMissedTradingDays.mockReturnValue(["2026-07-28", "2026-07-29", "2026-07-30"]);
      mockHistoricalIVCount.mockResolvedValue(10); // >= 10 * 0.8 = 8

      await runBackfill();

      expect(mockIngestHistoricalIV).not.toHaveBeenCalled();
    });

    test("backfill triggers when a day is missing (count === 0) or partial (count < 80% of active tickers)", async () => {
      mockGetMissedTradingDays.mockReturnValue(["2026-07-28", "2026-07-29", "2026-07-30"]);
      mockHistoricalIVCount.mockImplementation(({ where }) => {
        const dateStr = where.date.toISOString().split("T")[0];
        if (dateStr === "2026-07-28") return 10; // Full count
        if (dateStr === "2026-07-29") return 0;  // Completely missing
        if (dateStr === "2026-07-30") return 5;  // Partial (5 < 8)
        return 10;
      });
      mockIngestHistoricalIV.mockResolvedValue({ ticker: "SPY", iv: 0.20 });

      await runBackfill();

      // Should ingest missing day 2026-07-29 and partial day 2026-07-30
      expect(mockIngestHistoricalIV).toHaveBeenCalledWith(expect.any(String), "2026-07-29");
      expect(mockIngestHistoricalIV).toHaveBeenCalledWith(expect.any(String), "2026-07-30");
      // Should NOT ingest fully covered day 2026-07-28
      expect(mockIngestHistoricalIV).not.toHaveBeenCalledWith(expect.any(String), "2026-07-28");
    });

    test("skips backfill when gap is too large (> 5 days)", async () => {
      mockGetMissedTradingDays.mockReturnValue([
        "2026-07-20", "2026-07-21", "2026-07-22",
        "2026-07-23", "2026-07-24", "2026-07-27",
      ]);
      mockHistoricalIVCount.mockResolvedValue(0);

      await runBackfill();

      expect(mockIngestHistoricalIV).not.toHaveBeenCalled();
    });
  });

  // ─── runIngestionWithRetry ──────────────────────────────────────────

  describe("runIngestionWithRetry", () => {
    test("skips ingestion on non-trading days", async () => {
      mockIsTradingDay.mockReturnValue(false);

      await runIngestionWithRetry();

      expect(mockIngestHistoricalIV).not.toHaveBeenCalled();
    });

    test("runs ingestion on trading days", async () => {
      mockIsTradingDay.mockReturnValue(true);
      mockIngestHistoricalIV.mockResolvedValue({ ticker: "SPY", iv: 0.20 });

      await runIngestionWithRetry();

      expect(mockIngestHistoricalIV).toHaveBeenCalled();
    });

    test("triggers runBackfill on attempt 1", async () => {
      mockIsTradingDay.mockReturnValue(true);
      mockGetNYTradingDateStr.mockReturnValue("2026-07-31");
      mockGetMissedTradingDays.mockReturnValue(["2026-07-30"]);
      mockHistoricalIVCount.mockResolvedValue(0);
      mockIngestHistoricalIV.mockResolvedValue({ ticker: "SPY", iv: 0.20 });

      await runIngestionWithRetry(1);

      // Backfill should have been triggered for missed day 2026-07-30
      expect(mockIngestHistoricalIV).toHaveBeenCalledWith(expect.any(String), "2026-07-30");
      // And today's ingestion should also run for 2026-07-31
      expect(mockIngestHistoricalIV).toHaveBeenCalledWith(expect.any(String), "2026-07-31");
    });

    test("does not trigger runBackfill on retry attempts (attempt > 1)", async () => {
      mockIsTradingDay.mockReturnValue(true);
      mockGetNYTradingDateStr.mockReturnValue("2026-07-31");
      mockGetMissedTradingDays.mockReturnValue(["2026-07-30"]);
      mockHistoricalIVCount.mockResolvedValue(0);
      mockIngestHistoricalIV.mockResolvedValue({ ticker: "SPY", iv: 0.20 });

      await runIngestionWithRetry(2);

      // Should NOT backfill 2026-07-30
      expect(mockIngestHistoricalIV).not.toHaveBeenCalledWith(expect.any(String), "2026-07-30");
      // Should only ingest for today 2026-07-31
      expect(mockIngestHistoricalIV).toHaveBeenCalledWith(expect.any(String), "2026-07-31");
    });
  });
});
