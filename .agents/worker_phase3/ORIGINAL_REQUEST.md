## 2026-06-20T22:53:04Z
You are the Worker agent for Phase 3 (AI-Powered Strategy Insights) of the Guru Tracker.
Your working directory is /Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_phase3.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please implement the following changes:
1. **Gemini Vertex AI Pipeline (`backend/services/guruAi.js`)**:
   Implement the real Gemini Vertex AI pipeline in `backend/services/guruAi.js`. Initialize `@google/genai` with Vertex AI (project and location). Query Prisma for the investor, their filings, and holdings (sorted by weight). Call `truncateHoldingsForPrompt` from `sec.js` to truncate holdings before constructing the prompt. Cache results in `aiStrategyCache`.
2. **Activity Feed AI summary endpoint (`backend/routes/gurus.js`)**:
   Create a new endpoint `GET /api/gurus/activity/ai-summary` (authenticated). Place it before dynamic ID parameters to avoid dynamic routing conflicts. In the endpoint, calculate the combined activity feed across all investors, take the top 30 activities, construct a summary prompt, and generate a cohesive summary using Gemini. Use an in-memory variable to cache the activity feed summary. Invalidate the cache when a manual sync `POST /api/gurus/sync` is successful.
3. **Frontend Custom Hook (`frontend/src/hooks/useGuruData.js`)**:
   Add a custom React Query hook `useGuruActivityAiSummary` that fetches the activity feed AI summary.
4. **Detail Views Tabs Refactoring (`frontend/src/components/GuruDetail.jsx`)**:
   Modify the component to use a tabbed interface. Introduce horizontal tabs: Holdings, History & Timeline, Overlap Analysis, AI Strategy. Under the permanent Profile Card, show only the active tab content. Optimize the fetching of AI Strategy so that the hook is only active when `activeTab === "aiStrategy"` and `userRole !== "GUEST"`. Make sure the AI Strategy tab displays the upgrade wall overlay for guests and loading/error/content states for premium users.
5. **Activity Feed AI Summary UI (`frontend/src/components/GurusTab.jsx`)**:
   Render the activity feed AI summary card at the top of the Combined Activity Feed section (above the filter chips). Show an upgrade link/wall for guest users, and fetch/display the AI summary for authenticated users.
6. **Backend and Frontend Test Suite Updates**:
   - In `backend/routes/__tests__/gurus.e2e.test.js`, add test cases for `GET /api/gurus/activity/ai-summary`, testing successful response, auth gating, caching, and cache invalidation on sync.
   - In `frontend/src/hooks/__tests__/useGuruData.e2e.test.js`, add unit/mock tests for the tab transitions, guest upgrade wall, and new hooks.
7. **Run and Verify Tests**:
   Run `npm test` inside `backend/` and `npx vitest run` inside `frontend/` to verify all tests (existing and new ones) pass with exit code 0.
8. **Update Release Notes**:
   Update `frontend/public/release-notes.html` to reflect the complete Phase 1-3 implementation (Guru Tracker database, ingestion pipeline, API, analytics heatmap/timeline/HHI, premium auth gates, Gemini AI strategy summaries, and activity summaries). Ensure you use the established format.

Write a detailed handoff report to /Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_phase3/handoff.md with all implementation details, commands run, test results, and layout verification. Reply when complete.
