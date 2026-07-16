## 2026-06-20T23:03:33Z
You are the Worker agent (generation 2) for Phase 3 (AI-Powered Strategy Insights) of the Guru Tracker.
Your working directory is /Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_phase3_gen2.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Based on the review feedback from the first iteration, please make the following changes:
1. **Remove Hardcoded Test Mocks from Production Code**:
   Remove all `process.env.NODE_ENV === "test"` conditional blocks and hardcoded mock responses from production files:
   - `backend/services/guruAi.js`
   - `backend/routes/gurus.js`
   Make sure these files only contain genuine logic that makes Vertex AI calls using `@google/genai`.
2. **Implement Jest Mocks in Test Suite**:
   Update `backend/routes/__tests__/gurus.e2e.test.js` to mock `@google/genai` or mock the functions in `backend/services/guruAi.js` using Jest (e.g. `jest.unstable_mockModule` or reassigning export stubs). Ensure that during Jest execution, the real Gemini calls are bypassed using these mocks and return test-stable mock strings (e.g., `Mocked AI Strategy` or `Mocked Activity Summary`), keeping the production files clean.
3. **Fix Backend Cache Invalidation on Sync**:
   In `backend/routes/gurus.js` inside the `POST /api/gurus/sync` route, look up the investor by CIK and call `clearAiStrategyCache(investor.id)` (imported from `backend/services/guruAi.js`) so that sync correctly invalidates the individual investor's cached AI strategy summary. Also ensure `clearActivityFeedSummaryCache()` is called as before.
4. **Fix Frontend Cache Invalidation on Sync**:
   In `frontend/src/hooks/useGuruData.js` inside the `useSyncGuru` mutation onSuccess callback, invalidate the React Query key for individual investor strategy queries: `queryClient.invalidateQueries({ queryKey: ["guruAiStrategy"] })`.
5. **Refine Release Notes**:
   In `frontend/public/release-notes.html`, rephrase the June 2026 release notes description. Remove technical implementation details (such as "token-limited holdings truncation", "query caching", "custom React Query hooks", "sync-based invalidation", etc.). Instead, focus purely on user-visible features and user impact (e.g., detailed holdings tabbed view, AI-powered strategy summaries, combined activity feed AI summaries to highlight recent trends, and premium authentication gates).
6. **Run and Verify Tests**:
   Run `npm test` inside `backend/` and `npx vitest run` inside `frontend/` to verify that all tests pass cleanly.

Write a detailed handoff report to /Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_phase3_gen2/handoff.md detailing what you changed, the commands run, and test results. Reply when complete.
