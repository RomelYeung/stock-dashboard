import { jest } from "@jest/globals";

const mockRequireAuth = jest.fn((req, res, next) => {
  if (!req.cookies?.token) return res.status(401).json({ success: false, error: "Authentication required." });
  req.user = { id: req.cookies.token };
  next();
});
jest.unstable_mockModule("../../middleware/auth.js", () => ({ requireAuth: mockRequireAuth }));

const mockCreate = jest.fn();
const mockGet = jest.fn();
jest.unstable_mockModule("../../services/aiClient.js", () => ({
  getAiClient: () => ({ interactions: { create: mockCreate, get: mockGet } }),
}));

const { default: router } = await import("../ai.js");
let interactionSequence = 0;

function dispatch(path, { body = {}, token, interactionId } = {}) {
  return new Promise((resolve, reject) => {
    const layer = router.stack.find((item) => item.route?.path === path);
    const req = { body, params: { interactionId }, cookies: token ? { token } : {} };
    let statusCode = 200;
    const res = {
      status: jest.fn((code) => { statusCode = code; return res; }),
      json: jest.fn((payload) => resolve({ status: statusCode, body: payload })),
    };
    const run = (index, error) => {
      if (error) {
        if (error.name === "ZodError") return res.status(400).json({ success: false, error: "Invalid request data." });
        return reject(error);
      }
      const handler = layer?.route.stack[index]?.handle;
      if (!handler) return reject(new Error("route did not respond"));
      return Promise.resolve(handler(req, res, (nextError) => run(index + 1, nextError))).catch(reject);
    };
    run(0);
  });
}

async function start(token, body = { ticker: "AAPL" }) {
  return dispatch("/deep-research/start", { body, token });
}

describe("deep research routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockImplementation(async () => ({ id: `interaction-${++interactionSequence}` }));
  });

  test("requires authentication on start and status", async () => {
    expect((await start()).status).toBe(401);
    expect((await dispatch("/deep-research/status/:interactionId", { interactionId: "unknown" })).status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  test("fails closed for unknown and differently owned interactions", async () => {
    expect((await dispatch("/deep-research/status/:interactionId", {
      token: "user-1",
      interactionId: "unknown",
    })).status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();

    const started = await start("user-1");
    const interactionId = started.body.data.interactionId;
    expect((await dispatch("/deep-research/status/:interactionId", {
      token: "user-2",
      interactionId,
    })).status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  test("returns completed status only to the owner", async () => {
    const started = await start("user-1");
    mockGet.mockResolvedValue({ status: "completed", output_text: "owned report" });

    const result = await dispatch("/deep-research/status/:interactionId", {
      token: "user-1",
      interactionId: started.body.data.interactionId,
    });

    expect(result).toEqual({
      status: 200,
      body: { success: true, data: { status: "completed", result: "owned report" } },
    });
    expect(mockGet).toHaveBeenCalledWith(started.body.data.interactionId);
  });

  test("always uses the server-owned prompt and ignores the removed prompt field", async () => {
    await start("user-1", { ticker: "aapl" });
    const serverPrompt = mockCreate.mock.calls[0][0].input;
    expect(serverPrompt).toContain("on AAPL (AAPL)");
    expect(serverPrompt).toContain("6. Valuation & Thesis");

    jest.clearAllMocks();
    await start("user-1", { ticker: "AAPL", prompt: "custom attacker instructions" });
    expect(mockCreate.mock.calls[0][0].input).toBe(serverPrompt);
    expect(mockCreate.mock.calls[0][0].input).not.toContain("custom attacker instructions");
  });
});
