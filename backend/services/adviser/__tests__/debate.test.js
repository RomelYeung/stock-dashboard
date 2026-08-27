import { jest } from "@jest/globals";

const mockGenerateContent = jest.fn();
jest.unstable_mockModule("../../aiClient.js", () => ({
  getAiClient: () => ({ models: { generateContent: mockGenerateContent } }),
}));

const { runDeepDebate, normalizeMemo } = await import("../debate.js");

const quantData = {
  summary: { name: "Test Corp", currentPrice: 100 },
  financials: { annualIncome: [] },
  balanceSheet: { annualBalanceSheet: [] },
  priceHistory: [{ close: 100 }, { close: 119 }],
  optionChain: { hasOptions: false },
  insiderData: {},
};

async function collect(generator) {
  const events = [];
  let result;
  for await (const event of generator) events.push(event);
  return { events, result };
}

function memoFor(persona) {
  return JSON.stringify({
    stance: persona.includes("Viktor") ? "bearish" : "bullish",
    memo: `${persona} memo with concrete numbers.`,
    key_evidence: ["Price is 100"],
    conviction: 4,
  });
}

describe("runDeepDebate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateContent.mockImplementation(async ({ config, contents }) => {
      const prompt = contents[0].parts[0].text;
      if (config.systemInstruction.includes("OUTPUT CONTRACT")) {
        return { text: memoFor(config.systemInstruction.match(/You are ([^,]+)/)?.[1] || "panelist") };
      }
      if (prompt.includes("Cross-examination")) return { text: "## Rebuttal\nA colleague is wrong.\n## Concession\nA colleague is right." };
      return { text: "## Stance\nBullish synthesis" };
    });
  });

  test("runs brief, four memos, four rebuttals, and synthesis in stage order", async () => {
    const events = [];
    const debate = yieldEvents(events);
    const result = await collect(debate);

    expect(result.events.map((event) => event.stage)).toEqual(["brief", "memos", "rebuttal", "synthesis"]);
    expect(mockGenerateContent).toHaveBeenCalledTimes(9);
    expect(result.events[1]).toMatchObject({ available: 4, total: 4 });
  });

  test("normalizes malformed memos and continues after a memo failure", async () => {
    let memoCalls = 0;
    mockGenerateContent.mockImplementation(async ({ config, contents }) => {
      const prompt = contents[0].parts[0].text;
      if (config.systemInstruction.includes("OUTPUT CONTRACT")) {
        memoCalls += 1;
        if (memoCalls === 1) return { text: "not json" };
        if (memoCalls === 2) throw new Error("memo unavailable");
        return { text: memoFor("available panelist") };
      }
      if (prompt.includes("Cross-examination")) return { text: "rebuttal" };
      return { text: "synthesis" };
    });

    const events = [];
    const result = await collect(yieldEvents(events));
    expect(result.events.map((event) => event.stage)).toEqual(["brief", "memos", "rebuttal", "synthesis"]);
    expect(result.events.find((event) => event.stage === "memos")).toMatchObject({ available: 2, total: 4 });
    expect(mockGenerateContent).toHaveBeenCalledTimes(9);
    expect(normalizeMemo("{}", { id: "x", name: "X" })).toMatchObject({ available: false, stance: "unavailable" });
  });

  test("bounds memo concurrency at two", async () => {
    let active = 0;
    let maxActive = 0;
    mockGenerateContent.mockImplementation(async ({ config, contents }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      const prompt = contents[0].parts[0].text;
      if (config.systemInstruction.includes("OUTPUT CONTRACT")) return { text: memoFor("panelist") };
      if (prompt.includes("Cross-examination")) return { text: "rebuttal" };
      return { text: "synthesis" };
    });

    await collect(yieldEvents([]));
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  test("passes the same investor profile block to memos, rebuttals, and synthesis", async () => {
    const profileBlock = "Risk tolerance: CONSERVATIVE\nInvestment horizon: LONG\nInvestment style: INDEX";
    await collect(runDeepDebate({
      ticker: "TEST",
      userMessage: "Should I buy?",
      quantData,
      history: [],
      profileBlock,
    }));

    expect(mockGenerateContent.mock.calls).toHaveLength(9);
    for (const [request] of mockGenerateContent.mock.calls) {
      expect(request.contents.flatMap((content) => content.parts.map((part) => part.text || "")).join("\n"))
        .toContain(profileBlock);
    }
  });
});

function yieldEvents(events) {
  return (async function* () {
    const generator = runDeepDebate({
      ticker: "TEST",
      userMessage: "Should I buy?",
      quantData,
      history: [],
    });
    for await (const event of generator) {
      events.push(event);
      yield event;
    }
  })();
}
