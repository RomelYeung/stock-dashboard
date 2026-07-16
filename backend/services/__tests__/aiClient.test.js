import { jest } from "@jest/globals";

// Mock @google/genai
const mockGoogleGenAI = jest.fn();
jest.unstable_mockModule("@google/genai", () => ({
  GoogleGenAI: mockGoogleGenAI
}));

describe("aiClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("should instantiate with apiKey when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    delete process.env.GOOGLE_CLOUD_PROJECT;

    const { getAiClient } = await import(`../aiClient.js?test1`);
    getAiClient();

    expect(mockGoogleGenAI).toHaveBeenCalledWith({
      apiKey: "test-api-key"
    });
  });

  test("should instantiate with vertexai when GOOGLE_CLOUD_PROJECT is set and apiKey is missing/dummy", async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.GOOGLE_CLOUD_LOCATION = "us-east1";

    const { getAiClient } = await import(`../aiClient.js?test2`);
    getAiClient();

    expect(mockGoogleGenAI).toHaveBeenCalledWith({
      vertexai: {
        project: "test-project",
        location: "us-east1"
      }
    });
  });

  test("should throw error when both apiKey and project are missing", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_VERTEX_PROJECT;

    const { getAiClient } = await import(`../aiClient.js?test3`);
    expect(() => getAiClient()).toThrow("Missing AI configuration. Set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT.");
  });
});
