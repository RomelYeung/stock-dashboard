import {
  NYSE_HOLIDAYS,
  isTradingDay,
  getNYTradingDate,
  getNYTradingDateStr,
  getMissedTradingDays,
} from "../trading-calendar.js";

// ─── Tests: isTradingDay ──────────────────────────────────────────────────

describe("isTradingDay", () => {
  test("returns true for a normal weekday (Wed Jul 29 2026)", () => {
    expect(isTradingDay("2026-07-29")).toBe(true);
  });

  test("returns true for a Monday", () => {
    expect(isTradingDay("2026-07-28")).toBe(true);
  });

  test("returns true for a Friday", () => {
    expect(isTradingDay("2026-07-31")).toBe(true);
  });

  test("returns false for a Saturday", () => {
    expect(isTradingDay("2026-07-25")).toBe(false); // Sat
  });

  test("returns false for a Sunday", () => {
    expect(isTradingDay("2026-07-26")).toBe(false); // Sun
  });

  test("returns false for Jul 4 observed holiday (2026 = Jul 3 Fri)", () => {
    expect(isTradingDay("2026-07-03")).toBe(false);
  });

  test("returns false for Christmas (Dec 25 2026, Fri)", () => {
    expect(isTradingDay("2026-12-25")).toBe(false);
  });

  test("returns false for New Year's Day 2026", () => {
    expect(isTradingDay("2026-01-01")).toBe(false);
  });

  test("returns false for Thanksgiving 2026 (Nov 26)", () => {
    expect(isTradingDay("2026-11-26")).toBe(false);
  });

  test("returns false for Good Friday 2026 (Apr 3)", () => {
    expect(isTradingDay("2026-04-03")).toBe(false);
  });

  test("returns false for MLK Day 2026 (Jan 19)", () => {
    expect(isTradingDay("2026-01-19")).toBe(false);
  });

  test("returns true for day after a holiday", () => {
    // Jul 3 is holiday (observed Jul 4), Jul 6 is Mon
    expect(isTradingDay("2026-07-06")).toBe(true);
  });

  test("returns true for a weekday with no holiday data (year 2030)", () => {
    // No holidays defined for 2030, but weekday check still works
    expect(isTradingDay("2030-01-02")).toBe(true); // Wednesday
  });

  test("returns false for a weekend even without holiday data", () => {
    expect(isTradingDay("2030-01-05")).toBe(false); // Sunday
  });
});

// ─── Tests: NYSE_HOLIDAYS ─────────────────────────────────────────────────

describe("NYSE_HOLIDAYS", () => {
  test("has entries for 2025, 2026, and 2027", () => {
    expect(NYSE_HOLIDAYS.has(2025)).toBe(true);
    expect(NYSE_HOLIDAYS.has(2026)).toBe(true);
    expect(NYSE_HOLIDAYS.has(2027)).toBe(true);
  });

  test("each year has 10 holidays", () => {
    expect(NYSE_HOLIDAYS.get(2025).size).toBe(10);
    expect(NYSE_HOLIDAYS.get(2026).size).toBe(10);
    expect(NYSE_HOLIDAYS.get(2027).size).toBe(10);
  });
});

// ─── Tests: getNYTradingDate ──────────────────────────────────────────────

describe("getNYTradingDate", () => {
  test("returns a Date object at UTC midnight", () => {
    const d = getNYTradingDate();
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
  });
});

describe("getNYTradingDateStr", () => {
  test("returns a string in YYYY-MM-DD format", () => {
    const s = getNYTradingDateStr();
    expect(s).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("matches getNYTradingDate ISO date", () => {
    const dateStr = getNYTradingDateStr();
    const dateObj = getNYTradingDate();
    expect(dateObj.toISOString().split("T")[0]).toBe(dateStr);
  });
});

// ─── Tests: getMissedTradingDays ──────────────────────────────────────────

describe("getMissedTradingDays", () => {
  test("returns empty array when since === until", () => {
    expect(getMissedTradingDays("2026-07-29", "2026-07-29")).toEqual([]);
  });

  test("returns the next day if it is a trading day", () => {
    // Mon Jul 28 -> Tue Jul 29 (since is exclusive, until inclusive)
    expect(getMissedTradingDays("2026-07-28", "2026-07-29")).toEqual(["2026-07-29"]);
  });

  test("skips weekends", () => {
    // Fri Jul 24 -> Mon Jul 28 (Sat 25, Sun 26 skipped)
    const result = getMissedTradingDays("2026-07-24", "2026-07-28");
    expect(result).toEqual(["2026-07-27", "2026-07-28"]);
    // Wait, Jul 27 is Monday. Let me double check: Jul 24 2026 is Friday.
    // Jul 25=Sat, 26=Sun, 27=Mon, 28=Tue
    // Range is (24, 28] so includes 25,26,27,28
    // Trading days: 27 (Mon) and 28 (Tue)
  });

  test("skips holidays", () => {
    // Jul 2 Thu -> Jul 7 Tue (Jul 3 is observed Jul 4 holiday, Jul 4 Sat, Jul 5 Sun, Jul 6 Mon)
    const result = getMissedTradingDays("2026-07-02", "2026-07-07");
    expect(result).toEqual(["2026-07-06", "2026-07-07"]);
  });

  test("returns all weekdays across a full week", () => {
    // Sun Jul 19 -> Fri Jul 24
    const result = getMissedTradingDays("2026-07-19", "2026-07-24");
    expect(result).toEqual(["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24"]);
  });

  test("returns empty for a weekend range", () => {
    // Sat Jul 25 -> Sun Jul 26
    expect(getMissedTradingDays("2026-07-25", "2026-07-26")).toEqual([]);
  });
});
