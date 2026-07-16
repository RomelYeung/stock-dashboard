# Deep Research Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gemini Deep Research endpoints to the backend using the `@google/genai` Interactions API for background research tasks.

**Architecture:** Two new service functions in the existing `aiFinancialAdviser.js` (reuse the `getAiClient()` singleton), and a new `routes/ai.js` file with two Express routes. The routes are mounted at `/api/ai` in `server.js`.

**Tech Stack:** Express, `@google/genai` Interactions API, Zod validation

---

### Task 1: Add Deep Research Service Functions

**Files:**
- Modify: `backend/services/aiFinancialAdviser.js:1-14` (add exports after existing code)

- [ ] **Step 1: Add `startDeepResearch` and `getDeepResearchStatus` functions**

Add the following at the end of `backend/services/aiFinancialAdviser.js` (before the closing of the file):

```javascript
/**
 * Start a Gemini Deep Research task in the background.
 * @param {string} ticker - The stock ticker to research
 * @param {string} prompt - The full research prompt (built by the frontend)
 * @returns {{ interactionId: string }}
 */
export async function startDeepResearch(ticker, prompt) {
  const aiClient = getAiClient();

  const response = await aiClient.interactions.create({
    agent: 'deep-research-preview-04-2026',
    background: true,
    input: prompt,
  });

  return { interactionId: response.id };
}

/**
 * Get the status and output of a Deep Research interaction.
 * @param {string} interactionId
 * @returns {{ status: string, output?: string, error?: string }}
 */
export async function getDeepResearchStatus(interactionId) {
  const aiClient = getAiClient();

  const interaction = await aiClient.interactions.get(interactionId);

  const statusMap = {
    in_progress: 'running',
    requires_action: 'running',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'failed',
    incomplete: 'failed',
    budget_exceeded: 'failed',
  };

  const status = statusMap[interaction.status] || 'running';

  let output = undefined;
  if (interaction.status === 'completed' && interaction.steps) {
    // Extract text from ModelOutputStep steps
    const outputParts = [];
    for (const step of interaction.steps) {
      if (step.type === 'model-output' && step.content) {
        for (const part of step.content) {
          if (part.text) outputParts.push(part.text);
        }
      }
    }
    output = outputParts.join('\n') || '';
  }

  let error = undefined;
  if (interaction.status === 'failed') {
    error = interaction.error?.message || 'Deep research task failed.';
  }

  return { status, output, error };
}
```

- [ ] **Step 2: Verify syntax**

Run: `node -c backend/services/aiFinancialAdviser.js`
Expected: No output (valid syntax)

- [ ] **Step 3: Commit**

```bash
git add backend/services/aiFinancialAdviser.js
git commit -m "feat: add deep research service functions using Interactions API"
```

---

### Task 2: Create AI Routes

**Files:**
- Create: `backend/routes/ai.js`

- [ ] **Step 1: Create `backend/routes/ai.js`**

```javascript
import express from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { startDeepResearch, getDeepResearchStatus } from "../services/aiFinancialAdviser.js";

const router = express.Router();

// ─── Zod schemas ──────────────────────────────────────────────────────

const startDeepResearchSchema = z.object({
  ticker: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  prompt: z.string().min(1, "Prompt is required."),
});

// ─── Routes ───────────────────────────────────────────────────────────

// POST /api/ai/deep-research/start
// Body: { ticker: "AAPL", prompt: "..." }
// Returns: { success: true, data: { interactionId: "..." } }
router.post("/deep-research/start", validate(startDeepResearchSchema), async (req, res) => {
  try {
    const { ticker, prompt } = req.body;
    const result = await startDeepResearch(ticker, prompt);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("[deep-research/start]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/ai/deep-research/status/:interactionId
// Returns: { success: true, data: { status: "running"|"completed"|"failed", output?: "...", error?: "..." } }
router.get("/deep-research/status/:interactionId", async (req, res) => {
  try {
    const { interactionId } = req.params;
    const result = await getDeepResearchStatus(interactionId);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("[deep-research/status]", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
```

- [ ] **Step 2: Verify syntax**

Run: `node -c backend/routes/ai.js`
Expected: No output (valid syntax)

- [ ] **Step 3: Commit**

```bash
git add backend/routes/ai.js
git commit -m "feat: add /api/ai/deep-research routes"
```

---

### Task 3: Register AI Routes in Server

**Files:**
- Modify: `backend/server.js:20-24` (add import and route mount)

- [ ] **Step 1: Add import for aiRoutes**

In `backend/server.js`, add after the existing route imports (line 23):

```javascript
import aiRoutes from "./routes/ai.js";
```

- [ ] **Step 2: Mount the route**

In `backend/server.js`, add after `app.use("/api/options", optionsRoutes);` (line 99):

```javascript
app.use("/api/ai", aiRoutes);
```

- [ ] **Step 3: Verify syntax**

Run: `node -c backend/server.js`
Expected: No output (valid syntax)

- [ ] **Step 4: Commit**

```bash
git add backend/server.js
git commit -m "feat: mount /api/ai routes in server"
```

---

### Task 4: End-to-End Smoke Test

- [ ] **Step 1: Start the backend**

Run: `cd backend && npm run dev`
Expected: Server starts on port 3001

- [ ] **Step 2: Test status endpoint (should return error for fake ID)**

```bash
curl -s http://localhost:3001/api/ai/deep-research/status/fake-id-123 | jq
```

Expected: JSON response with `success: false` (interaction not found) or a valid status response

- [ ] **Step 3: Test start endpoint (requires valid Gemini credentials)**

```bash
curl -s -X POST http://localhost:3001/api/ai/deep-research/start \
  -H "Content-Type: application/json" \
  -d '{"ticker":"AAPL","prompt":"Research Apple stock outlook"}' | jq
```

Expected: `{ "success": true, "data": { "interactionId": "..." } }`

- [ ] **Step 4: Stop the server**

Press Ctrl+C in the terminal

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "fix: deep research smoke test adjustments"
```
