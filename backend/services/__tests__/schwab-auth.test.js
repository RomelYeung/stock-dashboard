import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseAuthCode,
  getTokenPath,
  generatePKCE,
  getLastVerifier,
  setLastVerifier,
  exchangeAuthCode,
} from "../schwab-auth.js";
import {
  exchangeManualCode,
  resetAuthFlow,
} from "../schwab-callback-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Schwab Auth & Callback Services", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    resetAuthFlow();
  });

  describe("parseAuthCode", () => {
    test("returns empty string for falsy or non-string inputs", () => {
      expect(parseAuthCode(null)).toBe("");
      expect(parseAuthCode(undefined)).toBe("");
      expect(parseAuthCode("")).toBe("");
      expect(parseAuthCode(123)).toBe("");
    });

    test("parses raw code string", () => {
      expect(parseAuthCode("C0.sampleAuthCode123")).toBe("C0.sampleAuthCode123");
    });

    test("decodes percent-encoded raw code", () => {
      expect(parseAuthCode("C0.sampleAuthCode%40123")).toBe("C0.sampleAuthCode@123");
    });

    test("extracts code parameter from full https URL", () => {
      const url = "https://127.0.0.1:3000/?code=C0.extractedCode123&session=abc";
      expect(parseAuthCode(url)).toBe("C0.extractedCode123");
    });

    test("extracts and decodes code parameter from full URL with percent encoding", () => {
      const url = "https://127.0.0.1:3000/?code=C0.extractedCode%40123&session=abc";
      expect(parseAuthCode(url)).toBe("C0.extractedCode@123");
    });

    test("extracts code from schemeless or host-prefixed URL", () => {
      const url = "127.0.0.1:3000/?code=C0.schemelessCode";
      expect(parseAuthCode(url)).toBe("C0.schemelessCode");
    });

    test("extracts code from query string fragment", () => {
      expect(parseAuthCode("?code=C0.fragmentCode&other=1")).toBe("C0.fragmentCode");
      expect(parseAuthCode("&code=C0.ampCode")).toBe("C0.ampCode");
    });
  });

  describe("getTokenPath", () => {
    test("returns default path anchored in backend/ directory", () => {
      delete process.env.SCHWAB_TOKEN_PATH;
      const expected = path.resolve(__dirname, "..", "..", ".schwab-token.json");
      expect(getTokenPath()).toBe(expected);
    });

    test("resolves relative custom SCHWAB_TOKEN_PATH anchored to backend/", () => {
      process.env.SCHWAB_TOKEN_PATH = "custom/tokens.json";
      const expected = path.resolve(__dirname, "..", "..", "custom", "tokens.json");
      expect(getTokenPath()).toBe(expected);
    });

    test("preserves absolute custom SCHWAB_TOKEN_PATH", () => {
      process.env.SCHWAB_TOKEN_PATH = "/tmp/absolute-token.json";
      expect(getTokenPath()).toBe("/tmp/absolute-token.json");
    });
  });

  describe("PKCE verifier management", () => {
    test("tracks and retrieves active verifier", () => {
      setLastVerifier("test-verifier-123");
      expect(getLastVerifier()).toBe("test-verifier-123");
    });

    test("generatePKCE updates the active verifier", () => {
      const { verifier, challenge } = generatePKCE();
      expect(verifier).toBeDefined();
      expect(challenge).toBeDefined();
      expect(getLastVerifier()).toBe(verifier);
    });
  });

  describe("exchangeAuthCode", () => {
    test("throws error if code is empty", async () => {
      await expect(exchangeAuthCode("")).rejects.toThrow(
        "Invalid or empty authorization code"
      );
    });

    test("throws error if no active verifier exists", async () => {
      setLastVerifier(null);
      await expect(exchangeAuthCode("C0.somecode")).rejects.toThrow(
        "No active PKCE verifier found. Start an auth flow first."
      );
    });
  });

  describe("exchangeManualCode & resetAuthFlow", () => {
    test("throws error when manual code is empty", async () => {
      await expect(exchangeManualCode("")).rejects.toThrow(
        "No authorization code provided"
      );
    });

    test("throws error when verifier is missing", async () => {
      setLastVerifier(null);
      await expect(exchangeManualCode("C0.somecode")).rejects.toThrow(
        "No active PKCE verifier found. Start an auth flow first."
      );
    });

    test("resetAuthFlow safely clears active state", () => {
      expect(() => resetAuthFlow()).not.toThrow();
    });
  });
});
