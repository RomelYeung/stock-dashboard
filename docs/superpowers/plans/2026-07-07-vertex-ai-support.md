# Vertex AI Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `backend/services/aiClient.js` to support Vertex AI mode using the new `@google/genai` SDK, remove dummy API keys, and add a release note entry.

**Architecture:**
- Update `getAiClient()` to check for `GEMINI_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY`. If present and not a dummy key, instantiate `GoogleGenAI` with `apiKey`.
- If not present, check for `GOOGLE_CLOUD_PROJECT` or `GOOGLE_VERTEX_PROJECT` to instantiate `GoogleGenAI` with `vertexai: true`, `project`, and `location`.
- Add a unit test file `backend/services/__tests__/aiClient.test.js` to verify both modes.

**Tech Stack:** Node.js, ES Modules, `@google/genai` SDK, Jest.

---

### Task 1: Update `backend/services/aiClient.js`

**Files:**
- Modify: `backend/services/aiClient.js`

- [ ] **Step 1: Update `getAiClient` implementation**

Update `backend/services/aiClient.js` to support Vertex AI mode and export a `resetAiClient` helper for testing.

```javascript
import { GoogleGenAI } from "@google/genai";

let aiInstance = null;

export function getAiClient() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_VERTEX_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || process.env.GOOGLE_VERTEX_LOCATION || "us-central1";

    if (apiKey && apiKey !== "dummy-key-for-local-dev") {
      aiInstance = new GoogleGenAI({ apiKey });
    } else if (project) {
      aiInstance = new GoogleGenAI({
        vertexai: true,
        project,
        location
      });
    } else {
      throw new Error("Missing AI configuration. Set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT.");
    }
  }
  return aiInstance;
}

export function resetAiClient() {
  aiInstance = null;
}
```

---

### Task 2: Create Unit Tests for `aiClient.js`

**Files:**
- Create: `backend/services/__tests__/aiClient.test.js`

- [ ] **Step 1: Write unit tests for `aiClient.js`**

Create `backend/services/__tests__/aiClient.test.js` to test both API key mode and Vertex AI mode.

```javascript
import { jest } from "@jest/globals";

// Mock @google/genai
const mockGoogleGenAI = jest.fn();
jest.unstable_mockModule("@google/genai", () => ({
  GoogleGenAI: mockGoogleGenAI
}));

const { getAiClient, resetAiClient } = await import("../aiClient.js");

describe("aiClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetAiClient();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("should instantiate with apiKey when GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-api-key";
    delete process.env.GOOGLE_CLOUD_PROJECT;

    getAiClient();

    expect(mockGoogleGenAI).toHaveBeenCalledWith({
      apiKey: "test-api-key"
    });
  });

  test("should instantiate with vertexai when GOOGLE_CLOUD_PROJECT is set and apiKey is missing/dummy", () => {
    delete process.env.GEMINI_API_KEY;
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.GOOGLE_CLOUD_LOCATION = "us-east1";

    getAiClient();

    expect(mockGoogleGenAI).toHaveBeenCalledWith({
      vertexai: true,
      project: "test-project",
      location: "us-east1"
    });
  });

  test("should throw error when both apiKey and project are missing", () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_VERTEX_PROJECT;

    expect(() => getAiClient()).toThrow("Missing AI configuration. Set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT.");
  });
});
```

- [ ] **Step 2: Run the new unit test to verify it passes**

Run: `node --experimental-vm-modules node_modules/.bin/jest services/__tests__/aiClient.test.js`
Expected: PASS

---

### Task 3: Remove dummy API key from `backend/.env`

**Files:**
- Modify: `backend/.env`

- [ ] **Step 1: Remove `GEMINI_API_KEY="dummy-key-for-local-dev"`**

Remove or comment out the dummy key line in `backend/.env`.

---

### Task 4: Run all backend tests and verify server starts

**Files:**
- None

- [ ] **Step 1: Run all backend tests**

Run: `npm test` in `backend` directory
Expected: PASS

- [ ] **Step 2: Start backend server in background**

Run: `npm run dev` in `backend` directory
Expected: Server starts and runs on port 3001

- [ ] **Step 3: Verify server is running**

Run: `curl http://localhost:3001/health` or check logs
Expected: Server is healthy

---

### Task 5: Add Release Note Entry

**Files:**
- Modify: `frontend/public/release-notes.html`

- [ ] **Step 1: Add release note entry under July 2026**

Add the following entry under the `July 2026` section:

```html
        <article class="release-entry">
          <div class="entry-meta">
            <time datetime="2026-07-07">July 7, 2026</time>
            <span class="tag tag-feature">Feature</span>
          </div>
          <h3>Add support for Google Cloud Vertex AI mode</h3>
          <p>Updated the centralized AI client to support Google Cloud Vertex AI mode using the new @google/genai SDK. Users can now configure the application to use Vertex AI by setting GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION, enabling seamless integration with Google Cloud billing.</p>
        </article>
```
