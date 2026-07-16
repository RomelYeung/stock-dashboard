## 2026-06-21T00:04:02Z
You are the Coder subagent. Your working directory is `/Users/yanchimyeung/Projects/stock-dashboard/.agents/coder_remedy`.
Your task is to implement the corrective fix to resolve the forensic audit failure.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Apply the changes cleanly:
1. Edit `backend/routes/gurus.js`:
   Remove the `process.env.NODE_ENV === "test"` check and the hardcoded faked activity summary text.
   In case the retrieved `summaryText` is empty or null, throw an error `"AI service temporarily unavailable"`.
   Ensure the route unconditionally calls GoogleGenAI to generate content and handles errors by returning a 503 status code.
2. Edit `backend/routes/__tests__/gurus.e2e.test.js`:
   Update `Test 3.13` to expect `res1.body.data` to contain `"Mocked AI Strategy summary text for quality leaders."`.
3. Edit `backend/services/__tests__/challenger.test.js`:
   Assert that `res1.strategyText` and `res2.strategyText` equal `"Mocked AI Strategy summary text for quality leaders."` in the concurrent and cached tests.
4. Run backend tests using `npm test` inside `/Users/yanchimyeung/Projects/stock-dashboard/backend` to verify all 85 Jest tests pass.
5. Run frontend tests using `npx vitest run` inside `/Users/yanchimyeung/Projects/stock-dashboard/frontend` to verify all 35 Vitest tests pass.
Document the exact edits and verification results in your handoff report at `/Users/yanchimyeung/Projects/stock-dashboard/.agents/coder_remedy/handoff.md`.
