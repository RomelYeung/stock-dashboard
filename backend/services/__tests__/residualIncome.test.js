import { calculateResidualIncome } from "../residualIncome.js";

describe("residual-income kernel", () => {
  test("matches a hand-calculated constant-book case", () => {
    const result = calculateResidualIncome({
      bookValue: 100,
      sharesOutstanding: 10,
      costOfEquity: 0.1,
      startingRoe: 0.2,
      terminalRoe: 0.2,
      payout: 1,
    });
    const explicit = Array.from({ length: 5 }, (_, index) => 10 / 1.1 ** (index + 1))
      .reduce((sum, value) => sum + value, 0);
    const pvTerminal = 100 / 1.1 ** 5;
    expect(result).toMatchObject({ eligible: true, status: "valued", terminalGrowth: 0 });
    expect(result.pvExplicitResidualIncome).toBeCloseTo(explicit, 12);
    expect(result.pvTerminalResidualIncome).toBeCloseTo(pvTerminal, 12);
    expect(result.equityValue).toBeCloseTo(200, 12);
    expect(result.fairValue).toBeCloseTo(20, 12);
    expect(result.projectedYears).toHaveLength(5);
    expect(result.projectedYears.every(({ beginningBook, endingBook, residualIncome }) =>
      beginningBook === 100 && endingBook === 100 && residualIncome === 10)).toBe(true);
  });

  test("keeps terminal growth and terminal residual-income identities", () => {
    const result = calculateResidualIncome({
      bookValue: 250,
      sharesOutstanding: 25,
      costOfEquity: 0.09,
      startingRoe: 0.16,
      terminalRoe: 0.12,
      payout: 0.4,
    });
    const terminal = result.terminal;
    expect(result.terminalGrowth).toBeCloseTo((1 - 0.4) * 0.12, 12);
    expect(terminal.growth).toBe(result.terminalGrowth);
    expect(terminal.residualIncome).toBeCloseTo((terminal.roe - 0.09) * terminal.beginningBook, 12);
    expect(terminal.value).toBeCloseTo(
      terminal.residualIncome / (0.09 - terminal.growth),
      12,
    );
    expect(terminal.pvValue).toBeCloseTo(result.pvTerminalResidualIncome, 12);
  });

  test.each([
    [{ bookValue: 0 }, "rim-book-value-invalid"],
    [{ sharesOutstanding: Infinity }, "rim-shares-invalid"],
    [{ costOfEquity: 0 }, "rim-ke-invalid"],
    [{ startingRoe: NaN }, "rim-starting-roe-invalid"],
    [{ terminalRoe: "0.1" }, "rim-terminal-roe-invalid"],
    [{ payout: 1.1 }, "rim-payout-invalid"],
    [{ years: 0 }, "rim-years-invalid"],
    [{ terminalRoe: 0.2, payout: 0, costOfEquity: 0.1 }, "rim-terminal-assumptions-invalid"],
  ])("returns reason codes for invalid inputs (%o)", (override, reason) => {
    const result = calculateResidualIncome({
      bookValue: 100,
      sharesOutstanding: 10,
      costOfEquity: 0.1,
      startingRoe: 0.15,
      terminalRoe: 0.1,
      payout: 0.4,
      ...override,
    });
    expect(result.eligible).toBe(false);
    expect(result.reasonCodes).toContain(reason);
  });

  test("does not depend on current price or unrelated input fields", () => {
    const inputs = {
      bookValue: 100,
      sharesOutstanding: 10,
      costOfEquity: 0.1,
      startingRoe: 0.15,
      terminalRoe: 0.1,
      payout: 0.4,
    };
    const withoutPrice = calculateResidualIncome(inputs);
    const withPrice = calculateResidualIncome({ ...inputs, currentPrice: 999, ticker: "TEST" });
    expect(withPrice).toEqual(withoutPrice);
  });
});
