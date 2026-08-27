import { getAiClient } from "../aiClient.js";
import { buildAnalystBrief } from "./analystBrief.js";
import {
  PANEL,
  alexSynthesisPrompt,
  personaRebuttalPrompt,
  personaSystemPrompt,
} from "./personas.js";

const MAX_PROMPT_CHARS = 14000;
const MAX_MEMO_CHARS = 3000;
const MAX_EVIDENCE_CHARS = 400;
const MAX_REBUTTAL_CHARS = 2600;
const MAX_SYNTHESIS_CHARS = 12000;
const PANEL_CONCURRENCY = 2;

function limitText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function responseText(response) {
  if (typeof response?.text === "string") return response.text;
  return response?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("") || "";
}

function extractJsonObject(text) {
  const bounded = limitText(text, MAX_MEMO_CHARS);
  const start = bounded.indexOf("{");
  const end = bounded.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(bounded.slice(start, end + 1));
  } catch {
    return null;
  }
}

function unavailableMemo(persona, reason = "No usable memo was returned.") {
  return {
    personaId: persona.id,
    persona: persona.name,
    available: false,
    stance: "unavailable",
    memo: limitText(`Unavailable: ${reason}`, MAX_MEMO_CHARS),
    key_evidence: [],
    conviction: null,
  };
}

export function normalizeMemo(raw, persona) {
  const parsed = typeof raw === "string" ? extractJsonObject(raw) : raw;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.memo) {
    return unavailableMemo(persona, "Malformed memo JSON.");
  }

  const stance = ["bullish", "bearish", "neutral"].includes(parsed.stance)
    ? parsed.stance
    : "neutral";
  const conviction = Number.isInteger(parsed.conviction) && parsed.conviction >= 1 && parsed.conviction <= 5
    ? parsed.conviction
    : null;
  const keyEvidence = Array.isArray(parsed.key_evidence)
    ? parsed.key_evidence
      .filter((item) => typeof item === "string")
      .slice(0, 5)
      .map((item) => limitText(item, MAX_EVIDENCE_CHARS))
    : [];

  return {
    personaId: persona.id,
    persona: persona.name,
    available: true,
    stance,
    memo: limitText(parsed.memo, MAX_MEMO_CHARS),
    key_evidence: keyEvidence,
    conviction,
  };
}

function normalizeRebuttal(raw, persona, reason = "No usable rebuttal was returned.") {
  const text = limitText(raw, MAX_REBUTTAL_CHARS);
  return {
    personaId: persona.id,
    persona: persona.name,
    available: Boolean(text),
    text: text || limitText(`Unavailable: ${reason}`, MAX_REBUTTAL_CHARS),
  };
}

// ponytail: fixed in-process concurrency; add a distributed quota only if deep traffic needs it.
async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function consume() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return results;
}

async function generateText(aiClient, systemInstruction, prompt) {
  const response = await aiClient.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: limitText(prompt, MAX_PROMPT_CHARS) }] }],
    config: { systemInstruction },
  });
  return responseText(response);
}

function conversationBlock(history = [], userMessage) {
  const prior = history.slice(-10).map((message) =>
    `${message.role === "user" ? "User" : "Panel"}: ${limitText(message.content, 1000)}`
  );
  prior.push(`User: ${limitText(userMessage, 4000)}`);
  return prior.join("\n\n");
}

function memoBlock(memos) {
  return memos.map((memo) => [
    `### ${memo.persona}`,
    `Availability: ${memo.available ? "available" : "unavailable"}`,
    `Stance: ${memo.stance}`,
    `Conviction: ${memo.conviction ?? "n/a"}`,
    `Memo: ${memo.memo}`,
    memo.key_evidence.length ? `Key evidence: ${memo.key_evidence.join(" | ")}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}

function rebuttalBlock(rebuttals) {
  return rebuttals.map((rebuttal) =>
    `### ${rebuttal.persona}\n${rebuttal.available ? rebuttal.text : `Unavailable: ${rebuttal.text}`}`
  ).join("\n\n");
}

function profilePromptBlock(profileBlock) {
  return profileBlock ? `INVESTOR PROFILE:\n${profileBlock}\n\n` : "";
}

export async function* runDeepDebate({ ticker, userMessage, quantData, history = [], profileBlock = "" }) {
  const { text: briefText } = buildAnalystBrief({ ...quantData, ticker });
  const context = conversationBlock(history, userMessage);
  const aiClient = getAiClient();

  yield { type: "stage", stage: "brief" };

  const memos = await mapWithConcurrency(PANEL, PANEL_CONCURRENCY, async (persona) => {
    try {
      const raw = await generateText(
        aiClient,
        personaSystemPrompt(persona, { ticker }),
        `${profilePromptBlock(profileBlock)}ANALYST BRIEF:\n${briefText}\n\nCONVERSATION:\n${context}`,
      );
      return normalizeMemo(raw, persona);
    } catch (error) {
      return unavailableMemo(persona, error.message);
    }
  });
  yield {
    type: "stage",
    stage: "memos",
    available: memos.filter((memo) => memo.available).length,
    total: memos.length,
  };

  const rebuttals = await mapWithConcurrency(PANEL, PANEL_CONCURRENCY, async (persona) => {
    const peersBlock = memoBlock(memos.filter((memo) => memo.personaId !== persona.id));
    try {
      const raw = await generateText(
        aiClient,
        "You are conducting a bounded investment-panel rebuttal round.",
        `${profilePromptBlock(profileBlock)}${personaRebuttalPrompt(persona, { peersBlock })}`,
      );
      return normalizeRebuttal(raw, persona);
    } catch (error) {
      return normalizeRebuttal("", persona, error.message);
    }
  });
  yield {
    type: "stage",
    stage: "rebuttal",
    available: rebuttals.filter((rebuttal) => rebuttal.available).length,
    total: rebuttals.length,
  };

  yield { type: "stage", stage: "synthesis" };
  const synthesis = limitText(await generateText(
    aiClient,
    "You are the Alex Meridian synthesis chair. Follow the output contract exactly.",
    alexSynthesisPrompt({
      briefText,
      profileBlock,
      memosBlock: memoBlock(memos),
      rebuttalsBlock: rebuttalBlock(rebuttals),
    }),
  ), MAX_SYNTHESIS_CHARS);
  if (!synthesis) throw new Error("Deep adviser synthesis returned no text.");

  return { briefText, memos, rebuttals, synthesis };
}
