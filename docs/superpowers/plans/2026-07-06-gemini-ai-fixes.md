# Gemini AI Integration Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix minor issues in the Gemini AI integration, including updating the default fallback model to `gemini-2.5-flash`, cleaning up legacy Vertex AI strings, adding strict API key validation in `aiClient.js`, and adding a defensive check in `ai.js` for deep research status.

**Architecture:** 
- Update default fallback model from `'gemini-3.5-flash'` to `'gemini-2.5-flash'` across all backend services and routes.
- Clean up outdated strings referencing Vertex AI in `newsService.js` and `guruAi.js`.
- Enhance `aiClient.js` to explicitly check for `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` and throw an error if missing.
- Add a defensive check in `ai.js` to return a 404 status if the deep research interaction is not found.
- Add a release note entry in `frontend/public/release-notes.html`.

**Tech Stack:** Node.js, Express, Jest, Google Gen AI SDK

---

### Task 1: Update Default Fallback Model to `gemini-2.5-flash`

**Files:**
- Modify: `backend/services/secGuidance.js:196`
- Modify: `backend/services/earnings.js:58`
- Modify: `backend/services/newsService.js:81`
- Modify: `backend/services/aiFinancialAdviser.js:105`
- Modify: `backend/services/guruAi.js:61`
- Modify: `backend/routes/gurus.js:140`

- [ ] **Step 1: Update `backend/services/secGuidance.js`**
  Change line 196:
  ```javascript
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  ```

- [ ] **Step 2: Update `backend/services/earnings.js`**
  Change line 58:
  ```javascript
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  ```

- [ ] **Step 3: Update `backend/services/newsService.js`**
  Change line 81:
  ```javascript
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  ```

- [ ] **Step 4: Update `backend/services/aiFinancialAdviser.js`**
  Change line 105:
  ```javascript
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  ```

- [ ] **Step 5: Update `backend/services/guruAi.js`**
  Change line 61:
  ```javascript
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  ```

- [ ] **Step 6: Update `backend/routes/gurus.js`**
  Change line 140:
  ```javascript
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  ```

- [ ] **Step 7: Commit changes**
  ```bash
  git add backend/services/secGuidance.js backend/services/earnings.js backend/services/newsService.js backend/services/aiFinancialAdviser.js backend/services/guruAi.js backend/routes/gurus.js
  git commit -m "refactor: update default fallback model to gemini-2.5-flash"
  ```

---

### Task 2: Clean Up Outdated Strings

**Files:**
- Modify: `backend/services/newsService.js:49`
- Modify: `backend/services/guruAi.js:66`

- [ ] **Step 1: Update fallback summary message in `backend/services/newsService.js`**
  Change line 49:
  ```javascript
  summary: "AI summary unavailable — Gemini API call failed.",
  ```

- [ ] **Step 2: Update error log in `backend/services/guruAi.js`**
  Change line 66:
  ```javascript
  console.error("Gemini AI call failed:", err.message);
  ```

- [ ] **Step 3: Commit changes**
  ```bash
  git add backend/services/newsService.js backend/services/guruAi.js
  git commit -m "refactor: clean up legacy Vertex AI strings"
  ```

---

### Task 3: Enhance `aiClient.js` with API Key Check

**Files:**
- Modify: `backend/services/aiClient.js:5-8`

- [ ] **Step 1: Update `backend/services/aiClient.js` to check for API key**
  Replace the `getAiClient` function with:
  ```javascript
  export function getAiClient() {
    if (!aiInstance) {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) {
        throw new Error("Missing Gemini API Key. Please set GEMINI_API_KEY in your environment.");
      }
      aiInstance = new GoogleGenAI({ apiKey });
    }
    return aiInstance;
  }
  ```

- [ ] **Step 2: Commit changes**
  ```bash
  git add backend/services/aiClient.js
  git commit -m "feat: add explicit API key check in aiClient"
  ```

---

### Task 4: Add Defensive Check in `ai.js`

**Files:**
- Modify: `backend/routes/ai.js:48-50`

- [ ] **Step 1: Add check for `!interaction` in `backend/routes/ai.js`**
  Insert the check after fetching the interaction:
  ```javascript
      const ai = getAiClient();
      const interaction = await ai.interactions.get(interactionId);

      if (!interaction) {
        return res.status(404).json({ success: false, error: "Interaction not found." });
      }

      const status = interaction.status || "unknown";
  ```

- [ ] **Step 2: Commit changes**
  ```bash
  git add backend/routes/ai.js
  git commit -m "fix: add defensive check for missing interaction in deep-research status route"
  ```

---

### Task 5: Add Release Note Entry

**Files:**
- Modify: `frontend/public/release-notes.html`

- [ ] **Step 1: Add release note entry under July 2026**
  Insert the following article at the top of the July 2026 section:
  ```html
          <article class="release-entry">
            <div class="entry-meta">
              <time datetime="2026-07-06">July 6, 2026</time>
              <span class="tag tag-improvement">Improvement</span>
            </div>
            <h3>Optimize Gemini AI integration and enhance error handling</h3>
            <p>Updated the default fallback model to Gemini 2.5 Flash to avoid quota limits, cleaned up legacy Vertex AI references, added strict API key validation, and introduced defensive checks for deep research status tracking.</p>
          </article>
  ```

- [ ] **Step 2: Commit changes**
  ```bash
  git add frontend/public/release-notes.html
  git commit -m "docs: add release note for Gemini AI integration fixes"
  ```

---

### Task 6: Verify All Tests Pass

- [ ] **Step 1: Run backend tests**
  Run: `npm test` in `backend/` directory.
  Expected: All tests pass.
