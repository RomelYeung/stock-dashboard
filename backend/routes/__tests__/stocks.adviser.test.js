import { jest } from "@jest/globals";

const mockRequireAuth = jest.fn((req, res, next) => {
  if (!req.cookies?.token) return res.status(401).json({ success: false, error: "Authentication required." });
  req.user = { id: req.cookies.token };
  next();
});
jest.unstable_mockModule("../../middleware/auth.js", () => ({
  requireAuth: mockRequireAuth,
  requireAdmin: jest.fn((req, res, next) => next()),
}));

const mockFindOwnedSession = jest.fn();
const mockStreamAdviserChat = jest.fn(async function* () { yield { type: "sessionId", sessionId: "sess-1" }; });
jest.unstable_mockModule("../../services/aiFinancialAdviser.js", () => ({
  findOwnedSession: mockFindOwnedSession,
  getSessionsList: jest.fn().mockResolvedValue([]),
  getSessionHistory: jest.fn().mockResolvedValue({ sessionId: null, messages: [] }),
  streamAdviserChat: mockStreamAdviserChat,
}));

const mockGetSummary = jest.fn().mockResolvedValue(null);
const mockGetFinancials = jest.fn().mockResolvedValue(null);
const mockGetBalanceSheet = jest.fn().mockResolvedValue(null);
const mockGetPriceHistory = jest.fn().mockResolvedValue([]);
jest.unstable_mockModule("../../services/yahoofinance.js", () => ({
  getSummary: mockGetSummary,
  getFinancials: mockGetFinancials,
  getBalanceSheet: mockGetBalanceSheet,
  getPriceHistory: mockGetPriceHistory,
  getFundamentalsTimeSeries: jest.fn(),
}));
jest.unstable_mockModule("../../services/dcf.js", () => ({
  DEFAULT_RISK_FREE_RATE: 0.04,
  projectValuation: jest.fn(),
  monteCarlo: jest.fn(),
  buildSensitivity: jest.fn(),
  aggregateDCFInputs: jest.fn(),
  getCompanyModelType: jest.fn(() => "corporate-fcff"),
}));
jest.unstable_mockModule("../../services/aiValuation.js", () => ({ evaluateAIValuation: jest.fn() }));
jest.unstable_mockModule("../../services/financialResidualIncome.js", () => ({ getFinancialResidualIncome: jest.fn() }));
jest.unstable_mockModule("../../services/cache.js", () => ({
  getFundamentals: jest.fn(),
  setFundamentals: jest.fn(),
  getPrice: jest.fn(),
  setPrice: jest.fn(),
  getInsider: jest.fn(),
  setInsider: jest.fn(),
  getComparables: jest.fn(),
  setComparables: jest.fn(),
  getLivePrice: jest.fn(),
  setLivePrice: jest.fn(),
  getEarningsProfile: jest.fn(),
  setEarningsProfile: jest.fn(),
  getOrFetch: jest.fn(),
  stats: jest.fn(),
  flush: jest.fn(),
  earningsProfileCache: { get: jest.fn(), set: jest.fn() },
}));
jest.unstable_mockModule("../../services/schwab-client.js", () => ({
  getOptionChain: jest.fn().mockResolvedValue(null),
  getQuotes: jest.fn(),
  getPriceHistory: jest.fn(),
  getMovers: jest.fn(),
}));
jest.unstable_mockModule("../../services/insiderTrading.js", () => ({
  getInsiderTrading: jest.fn().mockResolvedValue(null),
}));

const { default: router } = await import("../stocks.js");

function dispatch(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const [path, queryString] = url.split("?");
    const query = Object.fromEntries(new URLSearchParams(queryString || ""));
    const req = {
      method,
      url,
      originalUrl: url,
      path,
      query,
      body,
      cookies: token ? { token } : {},
      headers: {},
      ip: "127.0.0.1",
      app: { get: jest.fn(() => false) },
    };
    const routePath = method === "POST"
      ? "/:ticker/advisor-chat"
      : path.endsWith("/sessions")
        ? "/:ticker/advisor-chat/sessions"
        : "/:ticker/advisor-chat/session";
    const routeLayer = router.stack.find((layer) => layer.route?.path === routePath && layer.route.methods[method.toLowerCase()]);
    req.ticker = "AAPL";
    let statusCode = 200;
    let headersSent = false;
    const res = {
      status: jest.fn((code) => { statusCode = code; return res; }),
      setHeader: jest.fn(),
      getHeader: jest.fn(),
      write: jest.fn(() => { headersSent = true; }),
      flush: jest.fn(),
      end: jest.fn(() => resolve({ status: statusCode, headersSent, res })),
      json: jest.fn((payload) => resolve({ status: statusCode, body: payload, headersSent, res })),
    };
    const run = async (index, error) => {
      if (error) {
        if (error.name === "ZodError") return res.status(400).json({ success: false, error: "Invalid request data." });
        return reject(error);
      }
      const handler = routeLayer?.route.stack[index]?.handle;
      if (!handler) return reject(new Error(`route did not respond: ${method} ${url}`));
      return handler(req, res, (nextError) => run(index + 1, nextError));
    };
    run(0).catch(reject);
  });
}

describe("adviser route security and contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ADVISER_V2;
    mockFindOwnedSession.mockResolvedValue({ id: "sess-1" });
    mockStreamAdviserChat.mockImplementation(async function* () { yield { type: "sessionId", sessionId: "sess-1" }; });
  });

  test.each([
    ["GET", "/AAPL/advisor-chat/sessions"],
    ["GET", "/AAPL/advisor-chat/session"],
    ["POST", "/AAPL/advisor-chat"],
  ])("requires auth for %s %s", async (method, url) => {
    const result = await dispatch(method, url, method === "POST" ? { message: "hello" } : undefined);
    expect(result.status).toBe(401);
  });

  test("rejects malformed chat bodies with 400", async () => {
    const result = await dispatch("POST", "/AAPL/advisor-chat", { message: "   " }, "user-1");
    expect(result.status).toBe(400);
  });

  test("does not commit SSE headers or create a new session for an out-of-scope id", async () => {
    mockFindOwnedSession.mockResolvedValue(null);
    const result = await dispatch("POST", "/AAPL/advisor-chat", { message: "hello", sessionId: "foreign" }, "user-1");

    expect(result.status).toBe(404);
    expect(result.headersSent).toBe(false);
    expect(result.res.setHeader).not.toHaveBeenCalled();
    expect(mockGetSummary).not.toHaveBeenCalled();
  });

  test("keeps forceDeep behind the V2 rollout flag", async () => {
    const result = await dispatch("POST", "/AAPL/advisor-chat", { message: "hello", forceDeep: true }, "user-1");
    expect(result.status).toBe(501);
    expect(result.body.error).toMatch(/ADVISER_V2=v2/);
    expect(mockStreamAdviserChat).not.toHaveBeenCalled();
  });

  test("passes forceDeep to the authenticated V2 stream", async () => {
    process.env.ADVISER_V2 = "v2";
    const result = await dispatch("POST", "/AAPL/advisor-chat", { message: "hello", forceDeep: true }, "user-1");

    expect(result.status).toBe(200);
    expect(mockStreamAdviserChat).toHaveBeenCalledWith(
      undefined,
      "user-1",
      "AAPL",
      "hello",
      expect.objectContaining({ summary: null, priceHistory: [] }),
      true,
    );
  });

  test("emits a typed safe SSE error and [DONE] when streaming fails", async () => {
    mockStreamAdviserChat.mockImplementation(async function* () {
      throw new Error("internal adviser failure");
    });

    const result = await dispatch("POST", "/AAPL/advisor-chat", { message: "hello" }, "user-1");
    const writes = result.res.write.mock.calls.map(([chunk]) => chunk);

    expect(writes).toContain(`data: ${JSON.stringify({
      type: "error",
      error: "Unable to complete adviser response.",
      message: "Unable to complete adviser response.",
    })}\n\n`);
    expect(writes.at(-1)).toBe("data: [DONE]\n\n");
    expect(writes.join("")).not.toContain("internal adviser failure");
  });
});
