import { buildAnalystBrief, pct } from "../analystBrief.js";

const fixture = {
  ticker: "TEST",
  summary: {
    name: "Test Corp",
    sector: "Technology",
    currentPrice: 100,
    marketCap: 2_000_000_000,
    trailingPE: 28.4,
    forwardPE: 24.1,
    priceToBook: 9.2,
  },
  dcf: { fairValue: 125 },
  financials: {
    annualIncome: [
      { date: "2023-12-31", totalRevenue: 100, netIncome: 25 },
      { date: "2024-12-31", totalRevenue: 120, netIncome: 30 },
    ],
  },
  balanceSheet: {
    annualBalanceSheet: [
      { date: "2023-12-31", cash: 55, totalDebt: 85, receivables: 35 },
      { date: "2024-12-31", cash: 60, totalDebt: 90, receivables: 50 },
    ],
  },
  priceHistory: Array.from({ length: 20 }, (_, index) => ({ close: 100 + index })),
  optionChain: { hasOptions: true },
  insiderData: { transactions: [{ type: "Sell" }, { type: "Sell" }, { type: "Sell" }, { type: "Buy" }] },
};

describe("buildAnalystBrief", () => {
  test("builds bounded labeled output from quant data", () => {
    const { text } = buildAnalystBrief(fixture);
    expect(text).toContain("VALUATION SNAPSHOT");
    expect(text).toContain("GROWTH & PROFITABILITY");
    expect(text).toContain("BALANCE SHEET HEALTH");
    expect(text).toContain("PRICE ACTION");
    expect(text).toContain("+19.0%");
    expect(text).toContain("implied upside +25.0%");
    expect(text.length).toBeLessThanOrEqual(6000);
  });

  test("returns red flags and guards invalid prices", () => {
    expect(buildAnalystBrief(fixture).redFlags.some((flag) => /receivables|insider/i.test(flag))).toBe(true);
    expect(pct(0, 100)).toBeNull();
    expect(buildAnalystBrief({ summary: { currentPrice: 0 }, dcf: { fairValue: 100 } }).text)
      .not.toContain("implied upside +Infinity");
  });

  test("handles empty data without throwing", () => {
    const result = buildAnalystBrief({});
    expect(result.redFlags).toEqual([]);
    expect(result.text).toMatch(/unavailable/i);
  });
});
