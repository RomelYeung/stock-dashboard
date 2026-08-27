import { classifyLane, DEEP_INTENT_REGEX, SIMPLE_LOOKUP_REGEX, LONG_MESSAGE_THRESHOLD } from "../router.js";

const corpus = [
  ["What is AAPL's current price?", "fast"],
  ["Give me the latest EPS and P/E for MSFT.", "fast"],
  ["What is the 52-week high for NVDA?", "fast"],
  ["Should I buy AAPL at this valuation?", "deep"],
  ["What are the main risks in owning TSLA?", "deep"],
  ["Build an investment thesis for MSFT.", "deep"],
  ["Compare AMZN with its closest peers.", "deep"],
  ["Analyze the competitive moat and outlook for META.", "deep"],
  ["Tell me whether this is a buy, but include the current price.", "fast"],
  ["Summarize the latest market volume for this ticker.", "fast"],
  ["Review this company across its business model, financial resilience, capital allocation, competition, and long-term economics. " + "Focus on concrete evidence and explain the major uncertainties without using any special analysis keyword. ".repeat(4), "deep"],
  ["Hello, what can you do?", "fast"],
];

test("exports the classifier regexes and threshold", () => {
  expect(SIMPLE_LOOKUP_REGEX).toBeInstanceOf(RegExp);
  expect(DEEP_INTENT_REGEX).toBeInstanceOf(RegExp);
  expect(LONG_MESSAGE_THRESHOLD).toBeGreaterThan(0);
});

test.each(corpus)("classifies %j", (message, expected) => {
  expect(classifyLane(message, { autoDeep: true })).toBe(expected);
});

test("the measured classifier corpus is fully green", () => {
  const passed = corpus.filter(([message, expected]) => classifyLane(message, { autoDeep: true }) === expected).length;
  expect(passed).toBe(corpus.length);
  expect(corpus.length).toBe(12);
});

test("forceDeep has precedence over lookup and rollout settings", () => {
  expect(classifyLane("What is the current price?", { forceDeep: true, autoDeep: false })).toBe("deep");
});

test("simple lookup has precedence over deep intent", () => {
  expect(classifyLane("What is the current price and should I buy?", { autoDeep: true })).toBe("fast");
});

test("autoDeep false and unknown values stay fast", () => {
  expect(classifyLane("What are the risks and thesis?", { autoDeep: false })).toBe("fast");
  expect(classifyLane("What are the risks and thesis?", { autoDeep: "true" })).toBe("fast");
});
