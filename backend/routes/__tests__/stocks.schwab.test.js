import { jest } from "@jest/globals";
import express from "express";

const mockExchangeManualCode = jest.fn();
const mockResetAuthFlow = jest.fn();
const mockStartAuthFlow = jest.fn();
const mockGetTokenHealth = jest.fn();

jest.unstable_mockModule("../../services/schwab-callback-server.js", () => ({
  exchangeManualCode: mockExchangeManualCode,
  resetAuthFlow: mockResetAuthFlow,
  startAuthFlow: mockStartAuthFlow,
}));

jest.unstable_mockModule("../../services/schwab-auth.js", () => ({
  getTokenHealth: mockGetTokenHealth,
  getValidAccessToken: jest.fn(),
  parseAuthCode: jest.fn(),
  getLastVerifier: jest.fn(),
  setLastVerifier: jest.fn(),
  getTokenPath: jest.fn(),
  loadTokens: jest.fn(),
  saveTokens: jest.fn(),
  exchangeAuthCode: jest.fn(),
  exchangeCodeForToken: jest.fn(),
  refreshAccessToken: jest.fn(),
  buildAuthURL: jest.fn(),
  generatePKCE: jest.fn(),
  CALLBACK_URL: "https://127.0.0.1:3000",
}));

jest.unstable_mockModule("../../services/schwab-client.js", () => ({
  getQuotes: jest.fn(),
  getPriceHistory: jest.fn(),
  getOptionChain: jest.fn(),
  getMovers: jest.fn(),
}));

const { default: router } = await import("../stocks.js");

function callSchwabExchange(body) {
  return new Promise((resolve) => {
    const req = {
      method: "POST",
      url: "/schwab/exchange",
      body,
    };
    let statusCode = 200;
    const res = {
      status: jest.fn().mockImplementation((code) => {
        statusCode = code;
        return res;
      }),
      json: jest.fn().mockImplementation((data) => {
        resolve({ status: statusCode, body: data });
      }),
    };
    router(req, res, (err) => {
      if (err) {
        resolve({ status: 500, body: { error: err.message } });
      }
    });
  });
}

describe("Stocks Route — Schwab Endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /schwab/exchange", () => {
    test("returns 400 when neither code nor url is provided", async () => {
      const { status, body } = await callSchwabExchange({});
      expect(status).toBe(400);
      expect(body.error).toBe("Missing 'url' or 'code' parameter in request body");
    });

    test("successfully exchanges code and returns token health", async () => {
      mockExchangeManualCode.mockResolvedValue({
        access_token: "mock-access-token",
        refresh_token: "mock-refresh-token",
      });
      mockGetTokenHealth.mockResolvedValue({
        status: "healthy",
        accessTokenExpired: false,
        refreshTokenAgeDays: 0.1,
      });

      const { status, body } = await callSchwabExchange({ code: "C0.validCode123" });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.health.status).toBe("healthy");
      expect(mockExchangeManualCode).toHaveBeenCalledWith("C0.validCode123");
    });

    test("successfully exchanges url parameter", async () => {
      mockExchangeManualCode.mockResolvedValue({
        access_token: "mock-access-token",
      });
      mockGetTokenHealth.mockResolvedValue({
        status: "healthy",
      });

      const { status, body } = await callSchwabExchange({ url: "https://127.0.0.1:3000/?code=C0.urlCode" });
      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(mockExchangeManualCode).toHaveBeenCalledWith("https://127.0.0.1:3000/?code=C0.urlCode");
    });

    test("returns 400 when exchangeManualCode throws an error", async () => {
      mockExchangeManualCode.mockRejectedValue(new Error("Invalid authorization code"));

      const { status, body } = await callSchwabExchange({ code: "C0.badCode" });
      expect(status).toBe(400);
      expect(body.error).toBe("Invalid authorization code");
    });
  });
});
