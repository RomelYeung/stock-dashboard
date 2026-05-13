import { describe, it, expect } from "vitest";
import { getPollingInterval } from "../useStockData";

describe("getPollingInterval", () => {
  it("returns 30000 ms when market is open", () => {
    expect(getPollingInterval(true)).toBe(30000);
  });

  it("returns 300000 ms when market is closed", () => {
    expect(getPollingInterval(false)).toBe(300000);
  });
});
