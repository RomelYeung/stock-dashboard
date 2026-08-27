import express from "express";
import { z } from "zod";
import { getAiClient } from "../services/aiClient.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { buildDeepResearchPrompt } from "../services/deepResearchPrompts.js";

const router = express.Router();
const deepResearchOwnership = new Map();
const MAX_DEEP_RESEARCH_OWNERS = 1000;

function rememberDeepResearchOwner(interactionId, userId) {
  deepResearchOwnership.set(interactionId, userId);
  while (deepResearchOwnership.size > MAX_DEEP_RESEARCH_OWNERS) {
    deepResearchOwnership.delete(deepResearchOwnership.keys().next().value);
  }
}

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const startDeepResearchSchema = z.object({
  ticker: z.string().trim().regex(/^[A-Za-z0-9.-]{1,10}$/, "Invalid ticker.").transform((s) => s.toUpperCase()),
});

// ─── POST /api/ai/deep-research/start ─────────────────────────────────────────
router.post("/deep-research/start", requireAuth, validate(startDeepResearchSchema), async (req, res) => {
  const { ticker } = req.body;

  try {
    const ai = getAiClient();

    const response = await ai.interactions.create({
      agent: "deep-research-preview-04-2026",
      background: true,
      input: buildDeepResearchPrompt(ticker),
    });

    rememberDeepResearchOwner(response.id, req.user.id);
    res.json({ success: true, data: { interactionId: response.id } });
  } catch (err) {
    console.error("[deep-research/start]", err);
    res.status(502).json({ success: false, error: err.message });
  }
});

// ─── GET /api/ai/deep-research/status/:interactionId ──────────────────────────
router.get("/deep-research/status/:interactionId", requireAuth, async (req, res) => {
  const { interactionId } = req.params;

  if (!interactionId) {
    return res.status(400).json({ success: false, error: "interactionId is required." });
  }

  // ponytail: process-local ownership resets on restart; use durable ownership when persistence is added.
  if (deepResearchOwnership.get(interactionId) !== req.user.id) {
    return res.status(404).json({ success: false, error: "Interaction not found." });
  }

  try {
    const ai = getAiClient();
    const interaction = await ai.interactions.get(interactionId);

    if (!interaction) {
      return res.status(404).json({ success: false, error: "Interaction not found." });
    }

    const status = interaction.status || "unknown";

    if (status === "completed" || status === "COMPLETED") {
      // The Interactions API output_text can sometimes only return the last step
      // if the agent interleaves text outputs with images/charts. We reconstruct the full report
      // by scanning backward to find the last step starting with a level-1 heading ("# "),
      // and joining all text blocks from all model_output steps starting from that index to the end.
      let startIndex = 0;
      if (interaction.steps && Array.isArray(interaction.steps)) {
        for (let i = interaction.steps.length - 1; i >= 0; i--) {
          const step = interaction.steps[i];
          if (step.type === "model_output" && step.content) {
            const parts = Array.isArray(step.content)
              ? step.content
              : typeof step.content === "object"
                ? Object.values(step.content)
                : [];
            let firstText = "";
            for (const part of parts) {
              if (part && part.text) {
                firstText = part.text.trim();
                break;
              }
            }
            if (firstText.startsWith("# ")) {
              startIndex = i;
              break;
            }
          }
        }
      }

      let fullText = "";
      if (interaction.steps && Array.isArray(interaction.steps)) {
        for (let i = startIndex; i < interaction.steps.length; i++) {
          const step = interaction.steps[i];
          if (step.type === "model_output" && step.content) {
            const contentArray = Array.isArray(step.content)
              ? step.content
              : typeof step.content === "object"
                ? Object.values(step.content)
                : [];
            for (const part of contentArray) {
              if (part && part.text) {
                fullText += part.text;
              }
            }
          }
        }
      }

      const outputText = fullText.trim() || interaction.output_text || interaction.output || null;
      return res.json({ success: true, data: { status: "completed", result: outputText } });
    }

    if (status === "failed" || status === "FAILED") {
      return res.json({
        success: false,
        data: { status: "failed", error: interaction.error || "Research task failed." },
      });
    }

    // Still in progress
    res.json({ success: true, data: { status } });
  } catch (err) {
    console.error("[deep-research/status]", err);
    res.status(502).json({ success: false, error: err.message });
  }
});

export default router;
