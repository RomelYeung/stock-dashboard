import { jest } from "@jest/globals";

const mockRequireAuth = jest.fn((req, res, next) => {
  if (!req.cookies?.token) return res.status(401).json({ success: false, error: "Authentication required." });
  req.user = { id: req.cookies.token };
  next();
});
jest.unstable_mockModule("../../middleware/auth.js", () => ({ requireAuth: mockRequireAuth }));

const mockGetInvestorProfile = jest.fn();
const mockSaveInvestorProfile = jest.fn();
jest.unstable_mockModule("../../services/adviser/profile.js", () => ({
  MAX_PROFILE_NOTES: 1000,
  getInvestorProfile: mockGetInvestorProfile,
  saveInvestorProfile: mockSaveInvestorProfile,
}));

const { default: router } = await import("../profile.js");

function dispatch(method, body, token) {
  return new Promise((resolve, reject) => {
    const req = {
      method,
      url: "/investor",
      originalUrl: "/api/profile/investor",
      path: "/investor",
      body,
      cookies: token ? { token } : {},
      headers: {},
    };
    let statusCode = 200;
    const res = {
      status: jest.fn((code) => { statusCode = code; return res; }),
      json: jest.fn((payload) => resolve({ status: statusCode, body: payload })),
    };
    const handlers = router.stack.flatMap((layer) => {
      if (!layer.route) return [layer.handle];
      if (!layer.route.methods[method.toLowerCase()] || layer.route.path !== "/investor") return [];
      return layer.route.stack.map((routeLayer) => routeLayer.handle);
    });
    const run = (index, error) => {
      if (error) {
        if (error.name === "ZodError") return res.status(400).json({ success: false, error: "Invalid request data." });
        return reject(error);
      }
      if (!handlers[index]) return reject(new Error(`route did not respond: ${method}`));
      return handlers[index](req, res, (nextError) => run(index + 1, nextError));
    };
    run(0);
  });
}

const validProfile = {
  riskTolerance: "BALANCED",
  horizon: "LONG",
  style: "BLEND",
  notes: "Prefer staged entries.",
};

describe("investor profile routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInvestorProfile.mockResolvedValue(validProfile);
    mockSaveInvestorProfile.mockResolvedValue(validProfile);
  });

  test("requires authentication", async () => {
    const result = await dispatch("GET", undefined);
    expect(result.status).toBe(401);
    expect(mockGetInvestorProfile).not.toHaveBeenCalled();
  });

  test("gets and saves only against the authenticated user", async () => {
    await dispatch("GET", undefined, "user-1");
    await dispatch("PUT", validProfile, "user-2");

    expect(mockGetInvestorProfile).toHaveBeenCalledWith("user-1");
    expect(mockSaveInvestorProfile).toHaveBeenCalledWith("user-2", validProfile);
  });

  test.each([
    { ...validProfile, riskTolerance: "YOLO" },
    { ...validProfile, horizon: "WEEK" },
    { ...validProfile, style: "TRADER" },
    { ...validProfile, notes: "x".repeat(1001) },
    { ...validProfile, userId: "other-user" },
  ])("rejects invalid, overlong, or unknown profile input: %o", async (body) => {
    const result = await dispatch("PUT", body, "user-1");
    expect(result.status).toBe(400);
    expect(mockSaveInvestorProfile).not.toHaveBeenCalled();
  });
});
