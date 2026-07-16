import express from "express";
import { z } from "zod";
import { getAiClient } from "../services/aiClient.js";
import { validate } from "../middleware/validate.js";

const router = express.Router();

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const startDeepResearchSchema = z.object({
  ticker: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  prompt: z.string().min(1, "Prompt is required."),
});

// ─── POST /api/ai/deep-research/start ─────────────────────────────────────────
router.post("/deep-research/start", validate(startDeepResearchSchema), async (req, res) => {
  const { ticker, prompt } = req.body;

  try {
    const ai = getAiClient();

    // Build a context-rich prompt for the deep research agent
    const fullPrompt = `Deep research request for ${ticker}:\n\n${prompt}`;

    const response = await ai.interactions.create({
      agent: "deep-research-preview-04-2026",
      background: true,
      input: fullPrompt,
    });

    res.json({ success: true, data: { interactionId: response.id } });
  } catch (err) {
    console.error("[deep-research/start]", err);
    res.status(502).json({ success: false, error: err.message });
  }
});

// ─── GET /api/ai/deep-research/status/:interactionId ──────────────────────────
router.get("/deep-research/status/:interactionId", async (req, res) => {
  const { interactionId } = req.params;

  if (!interactionId) {
    return res.status(400).json({ success: false, error: "interactionId is required." });
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
