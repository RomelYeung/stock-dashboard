# Handoff Report — Forensic Audit Integrity Remediation (Phase 3)

## 1. Observation
We observed the following files and contents in our investigation of the forensic audit report findings:

### A. Environment Bypass and Fallback Mock in `backend/routes/gurus.js`
In the initial production implementation, the `GET /api/gurus/activity/ai-summary` endpoint contained an environment bypass checking `NODE_ENV === "test"` (lines 135–140):
```javascript
    let summaryText = "";
    if (process.env.NODE_ENV === "test") {
      summaryText = "Combined Activity AI Summary: Gurus have recently maintained stable long-term allocations with selective tech sector optimization.";
    } else {
```
and also faked the string on fallback (lines 157–159):
```javascript
    if (!summaryText || !summaryText.trim()) {
      summaryText = "Combined Activity AI Summary: Gurus have recently maintained stable long-term allocations with selective tech sector optimization.";
    }
```

### B. Self-Certifying Test Assertions in `backend/routes/__tests__/gurus.e2e.test.js`
In the e2e test suite, `Test 3.13` asserted that the response from the route contained the hardcoded string:
```javascript
  test("Test 3.13: GET /api/gurus/activity/ai-summary caches responses and invalidates on sync", async () => {
    const res1 = await caller("GET", "/api/gurus/activity/ai-summary", {}, { authorization: "user-token" });
    expect(res1.status).toBe(200);
    expect(res1.body.cached).toBe(false);
    expect(res1.body.data).toContain("selective tech sector optimization");
```
Since the production route intercepted the environment and returned the exact string, the test was completely self-certifying.

### C. Current State on Disk
During the investigation, we noted that `/Users/yanchimyeung/Projects/stock-dashboard/backend/routes/gurus.js` on disk had already been cleaned of the `if (process.env.NODE_ENV === "test")` check and faked fallback.
Furthermore, the test file `backend/routes/__tests__/gurus.e2e.test.js` had also been partially updated to assert:
```javascript
    expect(res1.body.data).toContain("Mocked AI Strategy summary text for quality leaders.");
```
which matches the static mock value.

---

## 2. Logic Chain
1. **Rule Constraint**: The integrity forensic standards require that no expected test outputs or mock strings be hardcoded within production implementation code paths (such as `backend/routes/gurus.js`), and that no facade implementations bypass real logic.
2. **Environment Bypass**: The presence of `if (process.env.NODE_ENV === "test")` in `backend/routes/gurus.js` explicitly intercepted test requests and faked the call to Gemini/Vertex AI, returning a predefined string instead.
3. **Assertion Coupling**: The backend e2e test suite (`gurus.e2e.test.js`) directly checked against this string, making the test pass without invoking or validating the Vertex AI SDK client.
4. **Library Mocking**: By removing the bypass from `gurus.js`, the route executes standard SDK code and interacts directly with the `@google/genai` library. Under Jest, this dependency is cleanly intercepted at the library boundary via `jest.unstable_mockModule("@google/genai", ...)`.
5. **Legitimate Verification**: To verify this interaction legitimately, the test mock function `mockGenerateContent` must dynamically return context-appropriate mock responses (matching `"selective tech sector optimization"` for activities feed, and `"quality leaders"` for investor strategies), and the test assertions must explicitly check that `mockGenerateContent` was called.

---

## 3. Caveats
- Since some modifications are already present on disk (likely applied by parallel agents), we assume that our proposed fix strategy should be compared against the latest disk status.
- Testing requires the execution of Jest in an ESM environment (`node --experimental-vm-modules node_modules/.bin/jest`).

---

## 4. Conclusion
The integrity bypass in the production route must be completely rejected. The proposed fix strategy involves:
1. Cleaning `backend/routes/gurus.js` of any `NODE_ENV === "test"` checks and fallback mock strings, throwing a clean 503/500 error instead.
2. Utilizing Jest library-boundary mocking (`jest.unstable_mockModule`) in the tests.
3. Implementing dynamic prompts checking inside the mocked `generateContent` method to support specific assertions (such as `"selective tech sector optimization"` for activity summaries and `"quality leaders"` for strategy summaries).
4. Verifying mock invocation counts (e.g., `expect(mockGenerateContent).toHaveBeenCalled()`) within `gurus.e2e.test.js` and `challenger.test.js`.

---

## 5. Verification Method
1. Inspect the patch file `proposed_fix.patch` in the agent folder to review the proposed code changes.
2. Run the test command:
   ```bash
   cd backend
   npm test
   ```
   Or run the specific tests:
   ```bash
   node --experimental-vm-modules node_modules/.bin/jest routes/__tests__/gurus.e2e.test.js services/__tests__/challenger.test.js
   ```
3. Validation passes if all tests execute successfully, proving that mock-boundary calls are hit and verified.
