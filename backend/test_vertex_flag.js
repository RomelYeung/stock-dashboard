import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

console.log("With env vars from .env:");
const ai1 = new GoogleGenAI({ apiKey: "dummy-key" });
console.log("ai1.vertexai:", ai1.vertexai);
console.log("ai1.apiKey:", ai1.apiKey);
console.log("ai1.project:", ai1.project);
console.log("ai1.location:", ai1.location);

console.log("\nWithout GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION:");
delete process.env.GOOGLE_CLOUD_PROJECT;
delete process.env.GOOGLE_CLOUD_LOCATION;
const ai2 = new GoogleGenAI({ apiKey: "dummy-key" });
console.log("ai2.vertexai:", ai2.vertexai);
console.log("ai2.apiKey:", ai2.apiKey);
console.log("ai2.project:", ai2.project);
console.log("ai2.location:", ai2.location);
