import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  location: 'global',
  // Try overriding baseUrl if that exists
  // httpOptions: { baseUrl: "https://aiplatform.googleapis.com" }
});

async function run() {
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: 'Hello'
    });
    console.log("SUCCESS:", res.text);
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}
run();
