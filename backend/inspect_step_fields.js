import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  location: "global",
});

async function run() {
  try {
    const interactionId = "ChA4NDgxNDI3NmQzMmZhN2U3EAgaATAqBG1haW4";
    const interaction = await ai.interactions.get(interactionId);
    
    if (interaction.steps) {
      console.log("=== STEP 3 (INTERMEDIATE) ===");
      console.log(JSON.stringify(interaction.steps[3], null, 2));

      console.log("\n=== STEP 73 (FINAL REPORT) ===");
      console.log(JSON.stringify(interaction.steps[73], null, 2));
    }
  } catch (e) {
    console.error(e);
  }
}
run();
