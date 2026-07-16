import { GoogleGenAI } from "@google/genai";

console.log("GoogleGenAI constructor:", GoogleGenAI.toString());
const ai = new GoogleGenAI({ apiKey: "dummy" });
console.log("ai keys:", Object.keys(ai));
console.log("ai.models keys:", Object.keys(ai.models));
console.log("ai.models.generateContent:", ai.models.generateContent.toString());
