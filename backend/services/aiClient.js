import { GoogleGenAI } from "@google/genai";

let aiInstance = null;

export function getAiClient() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_VERTEX_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || process.env.GOOGLE_VERTEX_LOCATION || "us-central1";

    if (apiKey && apiKey !== "dummy-key-for-local-dev") {
      aiInstance = new GoogleGenAI({ apiKey });
    } else if (project) {
      aiInstance = new GoogleGenAI({ vertexai: { project, location } });
    } else {
      throw new Error("Missing AI configuration. Set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT.");
    }
  }
  return aiInstance;
}
