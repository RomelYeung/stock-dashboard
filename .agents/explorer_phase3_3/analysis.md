# Analysis Report — Forensic Audit Phase 3 Corrective Strategy

## Executive Summary
This report analyzes the integrity forensic audit failure of the Guru combined activity AI summary feature. It proposes a clean fix strategy to remove all test environment check (`process.env.NODE_ENV === "test"`) bypasses and hardcoded response strings from production code, ensuring legitimate library-level mocked verification in the test suite.

---

## 1. Direct Observations & Issues

| File Path | Line Range | Issue | Impact |
| --- | --- | --- | --- |
| `backend/routes/gurus.js` | 136–138 | `process.env.NODE_ENV === "test"` conditional bypass returns hardcoded text. | Real AI logic execution is bypassed during tests, masking errors in Vertex AI integration. |
| `backend/routes/gurus.js` | 157–159 | Empty/null fallback returns the same hardcoded faked AI summary string. | Production failures in Vertex AI calls silently fallback to fake mock data instead of propagating an outage error. |
| `backend/routes/__tests__/gurus.e2e.test.js` | 596 | `expect(res1.body.data).toContain("selective tech sector optimization");` | The test asserts on the hardcoded bypass string rather than the library-level mock, making it self-certifying. |

---

## 2. Proposed Fix Strategy

### A. Remove Production Test Bypasses in `backend/routes/gurus.js`
The `process.env.NODE_ENV === "test"` bypass and hardcoded fallback must be removed. The endpoint will unconditionally import `@google/genai` and execute the content generation. If the call fails or returned text is empty, the endpoint will throw a standard `"AI service temporarily unavailable"` error to match adjacent route patterns.

**Proposed Diff:**
```javascript
// backend/routes/gurus.js
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

### B. Update Route-Level Test Assertions in `backend/routes/__tests__/gurus.e2e.test.js`
Since `@google/genai` is mocked at the library boundary at the top of `gurus.e2e.test.js`, the test environment will now cleanly route content generation to the mocked function, returning `"Mocked AI Strategy summary text for quality leaders."`. The assertion must be updated to expect this mocked output.

**Proposed Diff:**
```javascript
// backend/routes/__tests__/gurus.e2e.test.js
<<<<
  test("Test 3.13: GET /api/gurus/activity/ai-summary caches responses and invalidates on sync", async () => {
    const res1 = await caller("GET", "/api/gurus/activity/ai-summary", {}, { authorization: "user-token" });
    expect(res1.status).toBe(200);
    expect(res1.body.cached).toBe(false);
    expect(res1.body.data).toContain("selective tech sector optimization");
====
  test("Test 3.13: GET /api/gurus/activity/ai-summary caches responses and invalidates on sync", async () => {
    const res1 = await caller("GET", "/api/gurus/activity/ai-summary", {}, { authorization: "user-token" });
    expect(res1.status).toBe(200);
    expect(res1.body.cached).toBe(false);
    expect(res1.body.data).toContain("Mocked AI Strategy summary text for quality leaders.");
>>>>
```

### C. Update Service-Level Test Assertions in `backend/services/__tests__/challenger.test.js`
To ensure the service-level tests legitimately check the mocked responses from the mock library interface rather than executing bypassed blocks, verify that the returned `strategyText` in `challenger.test.js` matches the mocked string.

**Proposed Diff:**
```javascript
// backend/services/__tests__/challenger.test.js (Chunk 1)
<<<<
      // Call generateAiStrategySummary concurrently
      const [res1, res2] = await Promise.all([
        generateAiStrategySummary("inv-123"),
        generateAiStrategySummary("inv-123"),
      ]);

      // Both should have hit the database since no promise caching or request locking is implemented
      expect(mockFindUnique).toHaveBeenCalledTimes(2);

      // Verify that both results claim they generated the content (cached: false)
      expect(res1.cached).toBe(false);
      expect(res2.cached).toBe(false);
====
      // Call generateAiStrategySummary concurrently
      const [res1, res2] = await Promise.all([
        generateAiStrategySummary("inv-123"),
        generateAiStrategySummary("inv-123"),
      ]);

      // Both should have hit the database since no promise caching or request locking is implemented
      expect(mockFindUnique).toHaveBeenCalledTimes(2);

      // Verify that both results claim they generated the content (cached: false)
      expect(res1.cached).toBe(false);
      expect(res2.cached).toBe(false);
      expect(res1.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");
      expect(res2.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");
>>>>
```

```javascript
// backend/services/__tests__/challenger.test.js (Chunk 2)
<<<<
      // Call it once to populate the cache
      const res1 = await generateAiStrategySummary("inv-123");
      expect(res1.cached).toBe(false);

      // Call again to verify it is cached
      const res2 = await generateAiStrategySummary("inv-123");
      expect(res2.cached).toBe(true);
====
      // Call it once to populate the cache
      const res1 = await generateAiStrategySummary("inv-123");
      expect(res1.cached).toBe(false);
      expect(res1.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");

      // Call again to verify it is cached
      const res2 = await generateAiStrategySummary("inv-123");
      expect(res2.cached).toBe(true);
      expect(res2.strategyText).toBe("Mocked AI Strategy summary text for quality leaders.");
>>>>
```

---

## 3. Verification Method

To verify these changes independently:
1. Apply the diffs to `backend/routes/gurus.js`, `backend/routes/__tests__/gurus.e2e.test.js`, and `backend/services/__tests__/challenger.test.js`.
2. Execute the tests:
   ```bash
   npm test -- backend/routes/__tests__/gurus.e2e.test.js
   npm test -- backend/services/__tests__/challenger.test.js
   ```
3. Observe that both test suites run successfully and assert cleanly on the mocked responses without encountering bypass logic.
