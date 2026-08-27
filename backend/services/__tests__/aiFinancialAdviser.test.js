import { jest } from "@jest/globals";

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
  },
  chatSession: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  chatMessage: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  adviserDebate: {
    create: jest.fn(),
  },
};
jest.unstable_mockModule("../db.js", () => ({ default: mockPrisma }));

const mockGenerateContentStream = jest.fn();
const mockGenerateContent = jest.fn();
jest.unstable_mockModule("../aiClient.js", () => ({
  getAiClient: () => ({ models: { generateContentStream: mockGenerateContentStream, generateContent: mockGenerateContent } }),
}));

const mockGetStockNews = jest.fn();
const mockGetNewsAISummary = jest.fn();
jest.unstable_mockModule("../newsService.js", () => ({
  getStockNews: mockGetStockNews,
  getNewsAISummary: mockGetNewsAISummary,
}));
jest.unstable_mockModule("../secGuidance.js", () => ({ getSecGuidance: jest.fn() }));
jest.unstable_mockModule("../earnings.js", () => ({ getEarningsSentiment: jest.fn() }));

const {
  streamAdviserChat,
  MAX_GENERATION_ROUNDS,
  MAX_TOOL_CALLS,
  MAX_RESPONSE_CHARS,
  MAX_CONTEXT_CHARS,
} = await import("../aiFinancialAdviser.js");

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
  for await (const event of generator) events.push(event);
  return events;
}

function stream(...chunks) {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}

describe("streamAdviserChat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ADVISER_V2;
    mockPrisma.chatSession.findFirst.mockResolvedValue({ id: "sess-1" });
    mockPrisma.user.findUnique.mockResolvedValue({
      investorRiskTolerance: null,
      investorHorizon: null,
      investorStyle: null,
      investorNotes: null,
    });
    mockPrisma.chatSession.create.mockResolvedValue({ id: "new-sess" });
    mockPrisma.chatMessage.findMany.mockResolvedValue([]);
    mockPrisma.chatMessage.create.mockResolvedValue({});
    mockPrisma.adviserDebate.create.mockResolvedValue({});
    mockGenerateContentStream.mockImplementation(() => stream({ text: "[Alex Meridian]: hello" }));
    mockGenerateContent.mockImplementation(async ({ config, contents }) => {
      if (config.systemInstruction.includes("OUTPUT CONTRACT")) {
        return { text: JSON.stringify({ stance: "neutral", memo: "memo", key_evidence: [], conviction: 3 }) };
      }
      if (contents[0].parts[0].text.includes("Cross-examination")) return { text: "rebuttal" };
      return { text: "synthesis" };
    });
  });

  test("rejects a supplied session that is not owned for the user and ticker", async () => {
    mockPrisma.chatSession.findFirst.mockResolvedValue(null);

    await expect(collect(streamAdviserChat("foreign", "user-1", "AAPL", "hello", quantData)))
      .rejects.toThrow("Session not found");
    expect(mockPrisma.chatSession.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign", userId: "user-1", ticker: "AAPL" },
    });
    expect(mockPrisma.chatSession.create).not.toHaveBeenCalled();
  });

  test("v2 appends the fresh current message and injects the brief once", async () => {
    process.env.ADVISER_V2 = "v2";
    await collect(streamAdviserChat(null, "user-1", "TEST", "fresh question", quantData));

    const config = mockGenerateContentStream.mock.calls[0][0];
    expect(config.config.temperature).toBe(0.9);
    expect(config.config.systemInstruction).toContain("Alex Meridian");
    expect(config.contents.at(-1)).toEqual({
      role: "user",
      parts: [{ text: expect.stringContaining("fresh question") }],
    });
    expect(config.contents.flatMap((item) => item.parts.map((part) => part.text)).join(" ")
      .match(/ANALYST BRIEF/g)).toHaveLength(1);
  });

  test("v2 fast lane includes the saved investor profile", async () => {
    process.env.ADVISER_V2 = "v2";
    mockPrisma.user.findUnique.mockResolvedValue({
      investorRiskTolerance: "CONSERVATIVE",
      investorHorizon: "LONG",
      investorStyle: "INDEX",
      investorNotes: "Prefer low turnover.",
    });

    await collect(streamAdviserChat(null, "user-1", "TEST", "profile question", quantData));

    expect(mockGenerateContentStream.mock.calls[0][0].config.systemInstruction).toContain("Risk tolerance: CONSERVATIVE");
    expect(mockGenerateContentStream.mock.calls[0][0].config.systemInstruction).toContain("Prefer low turnover.");
  });

  test("V2 auto-deep routes measured intent to the panel while lookups stay fast", async () => {
    process.env.ADVISER_V2 = "v2";
    process.env.ADVISER_AUTO_DEEP = "true";

    await collect(streamAdviserChat(null, "user-1", "TEST", "What are the main risks in owning TEST?", quantData));
    expect(mockGenerateContent).toHaveBeenCalledTimes(9);
    expect(mockGenerateContentStream).not.toHaveBeenCalled();

    jest.clearAllMocks();
    mockPrisma.chatSession.findFirst.mockResolvedValue({ id: "sess-1" });
    mockPrisma.chatMessage.findMany.mockResolvedValue([]);
    mockPrisma.chatMessage.create.mockResolvedValue({});
    mockGenerateContentStream.mockImplementation(() => stream({ text: "[Alex Meridian]: lookup" }));

    await collect(streamAdviserChat(null, "user-1", "TEST", "What is the current price?", quantData));
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).not.toHaveBeenCalled();
    delete process.env.ADVISER_AUTO_DEEP;
  });

  test("v2 preserves prior chronological turns and appends the current message explicitly", async () => {
    process.env.ADVISER_V2 = "v2";
    mockPrisma.chatMessage.findMany.mockResolvedValue([
      { role: "user", content: "first question" },
      { role: "model", content: "first answer" },
    ]);

    await collect(streamAdviserChat("sess-1", "user-1", "TEST", "second question", quantData));

    const contents = mockGenerateContentStream.mock.calls[0][0].contents;
    expect(contents.map((item) => item.role)).toEqual(["user", "model", "user"]);
    expect(contents[0].parts[0].text).toContain("first question");
    expect(contents[1].parts[0].text).toBe("first answer");
    expect(contents[2].parts[0].text).toBe("second question");
    expect(contents[0].parts[0].text).toContain("ANALYST BRIEF");
  });

  test("v2 keeps the existing news tool continuation loop", async () => {
    process.env.ADVISER_V2 = "v2";
    mockGetStockNews.mockResolvedValue(["article"]);
    mockGetNewsAISummary.mockResolvedValue({ sentiment: "neutral", summary: "summary" });
    mockGenerateContentStream
      .mockImplementationOnce(() => stream({
        candidates: [{ content: { parts: [{ functionCall: { name: "fetchRecentNews" } }] } }],
        functionCalls: [{ name: "fetchRecentNews" }],
      }))
      .mockImplementationOnce(() => stream({ text: "[Alex Meridian]: final answer" }));

    const events = await collect(streamAdviserChat(null, "user-1", "TEST", "latest news?", quantData));

    expect(mockGenerateContentStream).toHaveBeenCalledTimes(2);
    expect(mockGetStockNews).toHaveBeenCalledWith("TEST");
    expect(events).toContainEqual({ type: "status", message: "Coordinator is running tool: fetchRecentNews..." });
    expect(mockGenerateContentStream.mock.calls[1][0].contents).toEqual(expect.arrayContaining([
      { role: "model", parts: [{ functionCall: { name: "fetchRecentNews" } }] },
      { role: "user", parts: [{ functionResponse: { name: "fetchRecentNews", response: { sentiment: "neutral", summary: "summary" } } }] },
    ]));
  });

  test("only ADVISER_V2=v2 changes the legacy path", async () => {
    for (const flag of [undefined, "legacy", "unknown"]) {
      jest.clearAllMocks();
      if (flag === undefined) delete process.env.ADVISER_V2;
      else process.env.ADVISER_V2 = flag;
      mockPrisma.chatSession.findFirst.mockResolvedValue({ id: "sess-1" });
      mockPrisma.chatMessage.findMany.mockResolvedValue([]);
      mockPrisma.chatMessage.create.mockResolvedValue({});
      mockGenerateContentStream.mockImplementation(() => stream({ text: "legacy response" }));

      await collect(streamAdviserChat(null, "user-1", "TEST", "hello", quantData));
      const config = mockGenerateContentStream.mock.calls[0][0];
      expect(config.config.temperature).toBe(0.7);
      expect(config.config.systemInstruction).toContain("Financial Coordinator Agent");
      expect(config.contents[0].parts[0].text).toContain("Quantitative & Fundamental Data");
    }
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  test("legacy continues past the V2 round and tool caps", async () => {
    process.env.ADVISER_V2 = "legacy";
    let generationCalls = 0;
    mockGenerateContentStream.mockImplementation(() => {
      generationCalls += 1;
      if (generationCalls <= MAX_TOOL_CALLS + 1) {
        return stream({
          candidates: [{ content: { parts: [{ functionCall: { name: "unusedTool" } }] } }],
          functionCalls: [{ name: "unusedTool" }],
        });
      }
      return stream({ text: "legacy finished" });
    });

    const events = await collect(streamAdviserChat(null, "user-1", "TEST", "repeat tools", quantData));

    expect(generationCalls).toBe(MAX_TOOL_CALLS + 2);
    expect(events.filter((event) => event.type === "status")).toHaveLength(MAX_TOOL_CALLS + 1);
    expect(events).not.toEqual(expect.arrayContaining([
      { type: "status", message: "Adviser generation safety limit reached; stopping tool continuation." },
    ]));
    expect(mockPrisma.chatMessage.create.mock.calls[1][0].data.content).toBe("legacy finished");
  });

  test("does not save a model message when generation fails", async () => {
    mockGenerateContentStream.mockImplementation(() => { throw new Error("generation failed"); });

    await expect(collect(streamAdviserChat(null, "user-1", "TEST", "hello", quantData)))
      .rejects.toThrow("generation failed");
    expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.chatMessage.create.mock.calls[0][0].data.role).toBe("user");
  });

  test("deep lane emits stages and saves one synthesized model message after persistence", async () => {
    process.env.ADVISER_V2 = "v2";
    const events = await collect(streamAdviserChat(null, "user-1", "TEST", "deep question", quantData, true));

    expect(events.filter((event) => event.type === "stage").map((event) => event.stage))
      .toEqual(["brief", "memos", "rebuttal", "synthesis"]);
    expect(mockGenerateContent).toHaveBeenCalledTimes(9);
    expect(mockPrisma.adviserDebate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: "sess-1",
        ticker: "TEST",
        question: "deep question",
        synthesis: "synthesis",
      }),
    });
    expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.chatMessage.create.mock.calls[1][0].data).toEqual({
      sessionId: "sess-1",
      role: "model",
      content: "synthesis",
    });
  });

  test("synthesis failure emits fallback status and runs fast lane once without debate persistence", async () => {
    process.env.ADVISER_V2 = "v2";
    mockGenerateContent.mockImplementation(async ({ config, contents }) => {
      if (config.systemInstruction.includes("OUTPUT CONTRACT")) {
        return { text: JSON.stringify({ stance: "neutral", memo: "memo", key_evidence: [], conviction: 3 }) };
      }
      if (contents[0].parts[0].text.includes("Cross-examination")) return { text: "rebuttal" };
      throw new Error("synthesis unavailable");
    });

    const events = await collect(streamAdviserChat(null, "user-1", "TEST", "fallback question", quantData, true));

    expect(events).toEqual(expect.arrayContaining([
      { type: "status", message: "Full Panel synthesis failed; running the fast lane fallback." },
      { type: "error", error: "Deep adviser synthesis failed.", message: "Using the fast lane fallback." },
    ]));
    expect(mockGenerateContent).toHaveBeenCalledTimes(9);
    expect(mockGenerateContentStream).toHaveBeenCalledTimes(1);
    expect(mockPrisma.adviserDebate.create).not.toHaveBeenCalled();
    expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.chatMessage.create.mock.calls[1][0].data.role).toBe("model");
  });

  test("bounds repeated V2 tool-call rounds and still saves one bounded fallback message", async () => {
    process.env.ADVISER_V2 = "v2";
    mockGetStockNews.mockResolvedValue([]);
    mockGetNewsAISummary.mockResolvedValue({ sentiment: "neutral", summary: "" });
    mockGenerateContentStream.mockImplementation(() => stream({
      candidates: [{ content: { parts: [{ functionCall: { name: "fetchRecentNews", args: {} } }] } }],
      functionCalls: [{ name: "fetchRecentNews" }],
    }));

    const events = await collect(streamAdviserChat(null, "user-1", "TEST", "repeat tools", quantData));

    expect(mockGenerateContentStream).toHaveBeenCalledTimes(MAX_GENERATION_ROUNDS);
    expect(events).toEqual(expect.arrayContaining([
      { type: "status", message: "Adviser generation safety limit reached; stopping tool continuation." },
      { type: "error", error: "Adviser generation limit reached.", message: "The response was bounded safely." },
    ]));
    const savedModel = mockPrisma.chatMessage.create.mock.calls[1][0].data.content;
    expect(savedModel.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    expect(mockPrisma.chatMessage.create).toHaveBeenCalledTimes(2);
  });

  test("caps V2 response output and context sent to the model", async () => {
    process.env.ADVISER_V2 = "v2";
    const huge = "x".repeat(MAX_RESPONSE_CHARS * 2);
    mockPrisma.chatMessage.findMany.mockResolvedValue([
      { role: "user", content: "old question" },
      { role: "model", content: "y".repeat(MAX_CONTEXT_CHARS * 2) },
    ]);
    mockGenerateContentStream.mockImplementation(() => stream({ text: huge }));

    const events = await collect(streamAdviserChat("sess-1", "user-1", "TEST", "current question", quantData));

    const request = mockGenerateContentStream.mock.calls[0][0];
    expect(JSON.stringify(request.contents).length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
    expect(request.contents.at(-1).parts[0].text).toContain("current question");
    const savedModel = mockPrisma.chatMessage.create.mock.calls[1][0].data.content;
    expect(savedModel.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    expect(events.filter((event) => event.chunk).map((event) => event.chunk).join("").length)
      .toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
  });
});
