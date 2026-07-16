# Switch to Standard Gemini API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop using the Vertex AI API in the `stock-dashboard` project and switch to standard Google AI Studio (Gemini Pro subscription) via API key by centralizing all AI calls through `aiClient.js`.

**Architecture:** 
- Centralize all AI initializations to use `getAiClient()` from `backend/services/aiClient.js`.
- Remove any local `GoogleGenAI` initializations with `vertexai: true`, `project`, or `location` configs.
- Ensure standard Google AI Studio configuration is used (relying on `process.env.GEMINI_API_KEY`).

**Tech Stack:** Node.js, ES Modules, `@google/genai` SDK.

---

### Task 1: Update `backend/services/secGuidance.js`

**Files:**
- Modify: `backend/services/secGuidance.js`

- [ ] **Step 1: Replace `@google/genai` import with `getAiClient` import**

Replace:
```javascript
import { GoogleGenAI } from "@google/genai";
```
with:
```javascript
import { getAiClient } from "./aiClient.js";
```

- [ ] **Step 2: Replace local `GoogleGenAI` instantiation with `getAiClient()`**

Replace:
```javascript
    const ai = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || 'dumb-money-dashboard-498800',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });
```
with:
```javascript
    const ai = getAiClient();
```

---

### Task 2: Update `backend/services/earnings.js`

**Files:**
- Modify: `backend/services/earnings.js`

- [ ] **Step 1: Replace `@google/genai` import with `getAiClient` import**

Replace:
```javascript
import { GoogleGenAI } from "@google/genai";
```
with:
```javascript
import { getAiClient } from "./aiClient.js";
```

- [ ] **Step 2: Remove local `getAiClient` and `aiInstance` definitions**

Remove:
```javascript
let aiInstance = null;
function getAiClient() {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || 'dumb-money-dashboard-498800',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });
  }
  return aiInstance;
}
```

---

### Task 3: Update `backend/services/newsService.js`

**Files:**
- Modify: `backend/services/newsService.js`

- [ ] **Step 1: Replace `@google/genai` import with `getAiClient` import**

Replace:
```javascript
import { GoogleGenAI } from "@google/genai";
```
with:
```javascript
import { getAiClient } from "./aiClient.js";
```

- [ ] **Step 2: Remove local `getAiClient` and `aiInstance` definitions**

Remove:
```javascript
let aiInstance = null;
function getAiClient() {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || 'dumb-money-dashboard-498800',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });
  }
  return aiInstance;
}
```

---

### Task 4: Update `backend/services/guruAi.js`

**Files:**
- Modify: `backend/services/guruAi.js`

- [ ] **Step 1: Replace `@google/genai` import with `getAiClient` import**

Replace:
```javascript
import { GoogleGenAI } from "@google/genai";
```
with:
```javascript
import { getAiClient } from "./aiClient.js";
```

- [ ] **Step 2: Remove local `getAiClient` and `aiInstance` definitions**

Remove:
```javascript
let aiInstance = null;
function getAiClient() {
  if (!aiInstance) {
    aiInstance = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT || 'dumb-money-dashboard-498800',
      location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
    });
  }
  return aiInstance;
}
```

---

### Task 5: Update Test Files to Mock `aiClient.js` or Keep `@google/genai` Mocking Consistent

**Files:**
- Modify: `backend/services/__tests__/challenger.test.js`
- Modify: `backend/routes/__tests__/gurus.e2e.test.js`

- [ ] **Step 1: Update `challenger.test.js` to mock `aiClient.js`**

Since `guruAi.js` now imports `getAiClient` from `./aiClient.js`, we should mock `./aiClient.js` instead of `@google/genai` in `challenger.test.js`.

Replace:
```javascript
const mockGenerateContent = jest.fn().mockResolvedValue({
  text: "Mocked AI Strategy summary text for quality leaders."
});
jest.unstable_mockModule("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent
    }
  }))
}));
```
with:
```javascript
const mockGenerateContent = jest.fn().mockResolvedValue({
  text: "Mocked AI Strategy summary text for quality leaders."
});
jest.unstable_mockModule("../aiClient.js", () => ({
  getAiClient: jest.fn().mockReturnValue({
    models: {
      generateContent: mockGenerateContent
    }
  })
}));
```

- [ ] **Step 2: Update `gurus.e2e.test.js` to mock `aiClient.js`**

Replace:
```javascript
const mockGenerateContent = jest.fn().mockResolvedValue({
  text: "Mocked AI Strategy summary text for quality leaders."
});
jest.unstable_mockModule("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent
    }
  }))
}));
```
with:
```javascript
const mockGenerateContent = jest.fn().mockResolvedValue({
  text: "Mocked AI Strategy summary text for quality leaders."
});
jest.unstable_mockModule("../../services/aiClient.js", () => ({
  getAiClient: jest.fn().mockReturnValue({
    models: {
      generateContent: mockGenerateContent
    }
  })
}));
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest services/__tests__/challenger.test.js`
Expected: PASS

---

### Task 6: Fix Pre-existing Test Failure in `backend/services/sec.js`

**Files:**
- Modify: `backend/services/sec.js`

- [ ] **Step 1: Update `pruneHistory` to return 8 elements instead of 20**

Replace:
```javascript
export function pruneHistory(filings) {
  const sorted = [...filings].sort((a, b) => new Date(b.date) - new Date(a.date));
  return sorted.slice(0, 20);
}
```
with:
```javascript
export function pruneHistory(filings) {
  const sorted = [...filings].sort((a, b) => new Date(b.date) - new Date(a.date));
  return sorted.slice(0, 8);
}
```

- [ ] **Step 2: Run all tests to verify they pass**

Run: `npm test` in `backend` directory
Expected: PASS

