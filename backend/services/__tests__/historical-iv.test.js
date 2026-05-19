import { jest } from "@jest/globals";

// ─── Mock dependencies ────────────────────────────────────────────────────

const mockUpsert = jest.fn();
const mockFindMany = jest.fn();
const mockGetOptionChainParsed = jest.fn();

jest.unstable_mockModule("../db.js", () => ({
  default: {
    historicalIV: {
      upsert: mockUpsert,
      findMany: mockFindMany,
    },
  },
}));

jest.unstable_mockModule("../schwab-client.js", () => ({
  getOptionChainParsed: mockGetOptionChainParsed,
}));

// ─── Import after mocks ───────────────────────────────────────────────────

const { ingestHistoricalIV, getHistoricalIV } = await import(
  "../historical-iv.js"
);

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeOption(strike, iv, type = "call") {
  return { strike, iv, type, expirationStr: "2026-06-19", dte: 30 };
}

function makeChain(underlyingPrice, options) {
  return { underlyingPrice, calls: options, puts: options };
}

// ─── Tests: ingestHistoricalIV ────────────────────────────────────────────

describe("ingestHistoricalIV", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("fetches option chain and upserts ATM IV for the ticker", async () => {
    const options = [
      makeOption(95, 0.35),
      makeOption(100, 0.30),
      makeOption(105, 0.32),
    ];
    mockGetOptionChainParsed.mockResolvedValue(makeChain(100, options));
    mockUpsert.mockResolvedValue({ id: "1", ticker: "AAPL", iv: 0.30 });

    const result = await ingestHistoricalIV("AAPL");

    expect(mockGetOptionChainParsed).toHaveBeenCalledWith("AAPL");
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { ticker_date: { ticker: "AAPL", date: expect.any(Date) } },
      update: { iv: 0.30 },
      create: { ticker: "AAPL", date: expect.any(Date), iv: 0.30 },
    });
    expect(result).toEqual({ ticker: "AAPL", iv: 0.30 });
  });

  test("returns null when option chain has no options", async () => {
    mockGetOptionChainParsed.mockResolvedValue(makeChain(100, []));

    const result = await ingestHistoricalIV("AAPL");

    expect(result).toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("returns null when no options have valid IV", async () => {
    const options = [makeOption(100, null), makeOption(105, NaN)];
    mockGetOptionChainParsed.mockResolvedValue(makeChain(100, options));

    const result = await ingestHistoricalIV("AAPL");

    expect(result).toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("returns null when Schwab client throws", async () => {
    mockGetOptionChainParsed.mockRejectedValue(new Error("API error"));

    const result = await ingestHistoricalIV("AAPL");

    expect(result).toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  test("uses today's date (UTC) for the upsert key", async () => {
    const options = [makeOption(100, 0.28)];
    mockGetOptionChainParsed.mockResolvedValue(makeChain(100, options));
    mockUpsert.mockResolvedValue({ id: "1", ticker: "AAPL", iv: 0.28 });

    await ingestHistoricalIV("AAPL");

    const callArg = mockUpsert.mock.calls[0][0];
    const dateArg = callArg.where.ticker_date.date;
    const today = new Date();
    expect(dateArg.getUTCFullYear()).toBe(today.getUTCFullYear());
    expect(dateArg.getUTCMonth()).toBe(today.getUTCMonth());
    expect(dateArg.getUTCDate()).toBe(today.getUTCDate());
  });
});

// ─── Tests: getHistoricalIV ────────────────────────────────────────────────

describe("getHistoricalIV", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns IV data sorted by date descending within lookback", async () => {
    const rows = [
      { date: new Date("2026-05-15"), iv: 0.30 },
      { date: new Date("2026-05-14"), iv: 0.28 },
      { date: new Date("2026-05-13"), iv: 0.32 },
    ];
    mockFindMany.mockResolvedValue(rows);

    const result = await getHistoricalIV("AAPL", 10);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        ticker: "AAPL",
        date: { gte: expect.any(Date) },
      },
      orderBy: { date: "desc" },
    });

    expect(result).toEqual([
      { date: "2026-05-15", iv: 0.30 },
      { date: "2026-05-14", iv: 0.28 },
      { date: "2026-05-13", iv: 0.32 },
    ]);
  });

  test("returns empty array when no data exists", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getHistoricalIV("AAPL", 30);

    expect(result).toEqual([]);
  });

  test("returns available data when less than requested days exist", async () => {
    const rows = [
      { date: new Date("2026-05-15"), iv: 0.30 },
      { date: new Date("2026-05-14"), iv: 0.28 },
    ];
    mockFindMany.mockResolvedValue(rows);

    const result = await getHistoricalIV("TSLA", 60);

    expect(result).toHaveLength(2);
    expect(result[0].iv).toBe(0.30);
    expect(result[1].iv).toBe(0.28);
  });

  test("defaults lookback to 252 trading days when days param omitted", async () => {
    mockFindMany.mockResolvedValue([]);

    await getHistoricalIV("AAPL");

    const callArg = mockFindMany.mock.calls[0][0];
    // Should use ~1 year lookback (252 trading days)
    const lookbackDate = callArg.where.date.gte;
    const now = new Date();
    const diffMs = now.getTime() - lookbackDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(250);
    expect(diffDays).toBeLessThan(253);
  });
});
