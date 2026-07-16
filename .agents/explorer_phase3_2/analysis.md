# Analysis — Forensic Audit Remediation Strategy

## 1. Problem Identification

### A. Route Bypass in Production Implementation
In `backend/routes/gurus.js` (lines 135–159), there is a test environment bypass and a fallback hardcoded summary:
```javascript
    let summaryText = "";
    if (process.env.NODE_ENV === "test") {
      summaryText = "Combined Activity AI Summary: Gurus have recently maintained stable long-term allocations with selective tech sector optimization.";
    } else {
      // Real Vertex AI call...
    }

    if (!summaryText || !summaryText.trim()) {
      summaryText = "Combined Activity AI Summary: Gurus have recently maintained stable long-term allocations with selective tech sector optimization.";
    }
```
This intercepts test execution requests and intercepts calls to `@google/genai` by returning a predefined static summary text, faking the execution of the AI integration.

### B. Self-Certifying Tests
In `backend/routes/__tests__/gurus.e2e.test.js` (lines 592–600), the E2E test asserts the exact hardcoded response string:
```javascript
  test("Test 3.13: GET /api/gurus/activity/ai-summary caches responses and invalidates on sync", async () => {
    const res1 = await caller("GET", "/api/gurus/activity/ai-summary", {}, { authorization: "user-token" });
    expect(res1.status).toBe(200);
    expect(res1.body.cached).toBe(false);
    expect(res1.body.data).toContain("selective tech sector optimization");
```
Because the test checks against the string hardcoded inside the implementation itself, the logic execution of Vertex AI is never exercised or validated during tests for this endpoint.

---

## 2. Proposed Clean Fix Strategy

### A. Remove the Test Bypass and Fallback Strings from Production Code
Remove the `NODE_ENV === "test"` conditional branch and the fallback string from `backend/routes/gurus.js`. If the AI client fails to return a summary, propagate the error (like other endpoints using Vertex AI do in `backend/services/guruAi.js`).

#### Proposed Diff for `backend/routes/gurus.js`
```javascript
<<<<
    let summaryText = "";
    if (process.env.NODE_ENV === "test") {
      summaryText = "Combined Activity AI Summary: Gurus have recently maintained stable long-term allocations with selective tech sector optimization.";
    } else {
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
    }

    if (!summaryText || !summaryText.trim()) {
      summaryText = "Combined Activity AI Summary: Gurus have recently maintained stable long-term allocations with selective tech sector optimization.";
    }
====
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
>>>>
```

### B. Clean Mocks at the Library Boundary
The E2E test file `backend/routes/__tests__/gurus.e2e.test.js` already defines a clean library-boundary mock for `@google/genai` (lines 4–13):
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
Since the `gurus.js` route dynamically imports `@google/genai`, ES modules under Jest will automatically resolve the dynamic import to this mocked module. Thus, the route will natively run the mocked generator content method and receive the string:
`"Mocked AI Strategy summary text for quality leaders."`

### C. Update Test Assertions
To make the assertions legitimate, check for the mock response string instead of the hardcoded faked bypass.

#### Proposed Diff for `backend/routes/__tests__/gurus.e2e.test.js` (around line 596)
```javascript
<<<<
    expect(res1.body.data).toContain("selective tech sector optimization");
====
    expect(res1.body.data).toContain("Mocked AI Strategy summary text for quality leaders.");
>>>>
```

#### Proposed Diff for `backend/services/__tests__/challenger.test.js`
To ensure the service tests are checking the content from the mock API boundary and not just passing on structure, we should verify the content returned from `generateAiStrategySummary(investorId)`.

Add assertions to `backend/services/__tests__/challenger.test.js` in Test 1 and Test 3:
```javascript
// Test 1 (around line 65)
expect(res1.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");
expect(res2.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");

// Test 3 (around lines 116, 120, 130)
expect(res1.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");
expect(res2.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");
expect(res3.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");
```

---

## 3. Verification Method

To verify these changes:
1. Run backend tests:
   ```bash
   cd backend
   npm test
   ```
2. Verify that `gurus.e2e.test.js` and `challenger.test.js` pass with 100% success.
3. Validate that no faked summary texts (`"selective tech sector optimization"`) or environment bypasses (`process.env.NODE_ENV === "test"`) exist in the production files by grepping:
   ```bash
   grep -rn "selective tech sector optimization" backend/routes/
   grep -rn "NODE_ENV === \"test\"" backend/routes/
   ```
   Both grep commands must return 0 matches inside production code.
