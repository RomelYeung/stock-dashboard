import { jest } from "@jest/globals";

// ─── Mock dependencies ───────────────────────────────────────────────────

const mockIngestHistoricalIV = jest.fn();
const mockCronSchedule = jest.fn();

jest.unstable_mockModule("../../services/historical-iv.js", () => ({
  ingestHistoricalIV: mockIngestHistoricalIV,
}));

jest.unstable_mockModule("node-cron", () => ({
  default: { schedule: mockCronSchedule },
  schedule: mockCronSchedule,
}));

// ─── Import after mocks ─────────────────────────────────────────────────

const { ingestAllTickers, startCronJob, DEFAULT_TICKERS } = await import(
  "../historical-iv-worker.js"
);

// ─── Tests ────────────────────────────────────────────────────────────────

describe("historical-iv-worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  // ─── ingestAllTickers ────────────────────────────────────────────────

  describe("ingestAllTickers", () => {
    test("calls ingestHistoricalIV once per ticker and returns results", async () => {
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
    test("schedules daily cron at 22:00 UTC weekdays (5 PM EST)", () => {
      const mockTask = { start: jest.fn() };
      mockCronSchedule.mockReturnValue(mockTask);

      startCronJob();

      expect(mockCronSchedule).toHaveBeenCalledTimes(1);
      expect(mockCronSchedule.mock.calls[0][0]).toBe("0 22 * * 1-5");
    });

    test("calls start on the scheduled task", () => {
      const mockTask = { start: jest.fn() };
      mockCronSchedule.mockReturnValue(mockTask);

      startCronJob();

      expect(mockTask.start).toHaveBeenCalledTimes(1);
    });
  });
});
