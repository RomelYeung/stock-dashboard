# Analysis — Forensic Audit Integrity Remediation (Phase 3)

## 1. Executive Summary
A forensic audit identified an **integrity violation** in the Guru Tracker implementation:
- Production code in `backend/routes/gurus.js` intercepted test requests via `if (process.env.NODE_ENV === "test")` and bypassed calls to the Google Gen AI SDK (`@google/genai`), returning a hardcoded faked response string.
- Production code also fallback-hardcoded the exact same mock string if the AI returned empty.
- Test suites (`gurus.e2e.test.js`) checked for this specific faked string, making the test self-certifying and bypassing actual integration validation of the AI client.

This document details the analysis and a clean remediation strategy to resolve the integrity violation.

---

## 2. Codebase Investigation Findings

### A. Route Bypass in `backend/routes/gurus.js`
In the original implementation, the `GET /api/gurus/activity/ai-summary` route executed faked mock behavior:
```javascript
// BEFORE REMEDIATION (gurus.js lines 135–140)
    let summaryText = "";
    if (process.env.NODE_ENV === "test") {
      summaryText = "Combined Activity AI Summary: Gurus have recently maintained stable long-term allocations with selective tech sector optimization.";
    } else {
      try {
        const { GoogleGenAI } = await import("@google/genai");
        ...
        summaryText = result.text;
      } catch (err) {
        ...
      }
    }
```
And fallback faked behavior (lines 157–159):
```javascript
// BEFORE REMEDIATION (gurus.js lines 157–159)
    if (!summaryText || !summaryText.trim()) {
      summaryText = "Combined Activity AI Summary: Gurus have recently maintained stable long-term allocations with selective tech sector optimization.";
    }
```
**Impact**: During testing, the `else` block (which imports `@google/genai` and executes AI content generation) is completely skipped. If any library configuration, project environment variable, or prompt structure fails, the test suite still passes, rendering the test suite self-certifying.

### B. Coupled Test Assertions in `gurus.e2e.test.js`
In `backend/routes/__tests__/gurus.e2e.test.js`, the test suite checked for the hardcoded production string:
```javascript
// BEFORE REMEDIATION (gurus.e2e.test.js lines 592–596)
  test("Test 3.13: GET /api/gurus/activity/ai-summary caches responses and invalidates on sync", async () => {
    const res1 = await caller("GET", "/api/gurus/activity/ai-summary", {}, { authorization: "user-token" });
    expect(res1.status).toBe(200);
    expect(res1.body.cached).toBe(false);
    expect(res1.body.data).toContain("selective tech sector optimization");
```
**Impact**: The test assertions did not verify the library-boundary mock returned values, but rather coupled with the faked values hardcoded directly inside production route code.

---

## 3. Clean Fix Strategy

To restore system integrity while maintaining test suite stability and correctness, we propose the following changes:

### Step 1: Clean Production Route Logic in `backend/routes/gurus.js`
Remove environment bypasses and hardcoded test mock strings. The route must always invoke `@google/genai` and handle failures by throwing errors that map to standard HTTP status codes.

**Proposed Production Route Fix**:
```javascript
    let summaryText = "";
    try {
      const { GoogleGenAI } = await import("@google/genai");
      const aiClient = new GoogleGenAI({
        vertexai: true,
        project: process.env.GOOGLE_CLOUD_PROJECT || 'dumb-money-dashboard-498800',
        location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
      });
      const result = await aiClient.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      summaryText = result.text;
    } catch (err) {
      console.error("Gemini call for activity summary failed:", err.message);
      throw new Error("AI service temporarily unavailable");
    }

    if (!summaryText || !summaryText.trim()) {
      throw new Error("AI service temporarily unavailable");
    }
```

### Step 2: Establish Clean Mocking at the Library Boundary in `gurus.e2e.test.js`
Rather than having production route logic faking outputs, the test environment itself must mock the `@google/genai` library dynamically. We can write a context-aware mock implementation that returns different mock strings depending on whether the prompt is for the combined activity feed summary or individual investor strategy summaries.

**Proposed Test Mock Update**:
```javascript
const mockGenerateContent = jest.fn().mockImplementation((args) => {
  const promptText = args?.contents?.[0]?.parts?.[0]?.text || "";
  if (promptText.includes("combined recent activity feed")) {
    return {
      text: "Mocked Combined Activity AI Summary: Gurus have recently maintained stable long-term allocations with selective tech sector optimization."
    };
  }
  return {
    text: "Mocked AI Strategy summary text for quality leaders."
  };
});

jest.unstable_mockModule("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent
    }
  }))
}));
```

### Step 3: Legitimate Verification in Test Assertions
Update the assertions in `gurus.e2e.test.js` and `challenger.test.js` to ensure they:
1. Verify the exact string returned by the library-boundary mock.
2. Verify that the mocked generate content function was actually called.

**Proposed e2e Test Assertion Update (`gurus.e2e.test.js`)**:
```javascript
  test("Test 3.13: GET /api/gurus/activity/ai-summary caches responses and invalidates on sync", async () => {
    // Reset mock history before the test to ensure clean assertions
    mockGenerateContent.mockClear();

    const res1 = await caller("GET", "/api/gurus/activity/ai-summary", {}, { authorization: "user-token" });
    expect(res1.status).toBe(200);
    expect(res1.body.cached).toBe(false);
    expect(res1.body.data).toContain("selective tech sector optimization");
    
    // Legitimate call verification: proves the endpoint reached the library mock rather than faking internally
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);

    const res2 = await caller("GET", "/api/gurus/activity/ai-summary", {}, { authorization: "user-token" });
    expect(res2.status).toBe(200);
    expect(res2.body.cached).toBe(true);

    const syncRes = await caller("POST", "/api/gurus/sync", { CIK: "0001067983" }, { authorization: "admin-token" });
    expect(syncRes.status).toBe(202);

    await new Promise(resolve => setTimeout(resolve, 50));

    const res3 = await caller("GET", "/api/gurus/activity/ai-summary", {}, { authorization: "user-token" });
    expect(res3.status).toBe(200);
    expect(res3.body.cached).toBe(false);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });
```

**Proposed Challenger Test Assertion Update (`challenger.test.js`)**:
```javascript
  describe("1. AI Strategy cache concurrency", () => {
    test("concurrent requests bypass cache and query database multiple times", async () => {
      mockGenerateContent.mockClear();
      ...
      const [res1, res2] = await Promise.all([
        generateAiStrategySummary("inv-123"),
        generateAiStrategySummary("inv-123"),
      ]);

      // Both should have hit the database since no promise caching or request locking is implemented
      expect(mockFindUnique).toHaveBeenCalledTimes(2);

      // Verify that both results claim they generated the content (cached: false)
      expect(res1.cached).toBe(false);
      expect(res2.cached).toBe(false);

      // Verify returned strategy text matches mock response legitimately
      expect(res1.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");
      expect(res2.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    });
  });
```
