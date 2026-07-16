# Phase 3 Exploration Handoff Report

## 1. Observation
- `backend/services/guruAi.js` contains a stub for `generateAiStrategySummary(investorId)` returning:
  ```javascript
  const strategyText = `AI strategy insight for portfolio ${investorId}: Maintain long-term allocation in quality leaders.`;
  ```
- `backend/services/sec.js:267` exports `truncateHoldingsForPrompt(holdings, tokenLimit = 100)` which prunes the holdings list based on token limit.
- `backend/routes/gurus.js` registers:
  - `GET /api/gurus/activity` (line 67) which gathers QoQ transactions using `calculateQoQ`.
  - `GET /api/gurus/:id/ai-strategy` (line 242) which is gated by `authenticate`.
- `frontend/src/components/GuruDetail.jsx` vertically renders all sections: holdings table, timeline, overlap heatmap, and the AI Strategy report.
- `frontend/src/components/GurusTab.jsx` contains theCombined Activity Feed list container (`div style={styles.feedSection}`).
- `frontend/src/hooks/useGuruData.js:107` defines `useGuruAiStrategy(id)` using `useQuery` fetching from `/api/gurus/${id}/ai-strategy`.
- Backend tests are run using `npm test` inside `backend/` and frontend tests using `npx vitest run` inside `frontend/`. Both test suites execute and pass successfully.

## 2. Logic Chain
- *Vertex AI Integration*: The existing codebase uses `@google/genai` by initializing a client:
  ```javascript
  new GoogleGenAI({ vertexai: true, project: ..., location: ... })
  ```
  in files like `backend/services/aiFinancialAdviser.js`. The strategy summary service should follow the same paradigm.
- *Route Conflicts*: The route parameter `/api/gurus/:id` conflicts with sub-routes if they are placed after. Adding `/api/gurus/activity/ai-summary` prior to `/api/gurus/:id/holdings` or similar dynamic endpoints ensures Express parses it correctly.
- *UI Tab Refactoring*: Replacing the vertical rendering in `GuruDetail.jsx` with tabs (Holdings, History & Timeline, Overlap Analysis, AI Strategy) will improve visual clarity and reduce unnecessary fetches by only enabling the `useGuruAiStrategy` hook when the AI Strategy tab is active.
- *Auth Gating*: Checking `userRole !== "GUEST"` inside the front-end before triggering fetching allows us to show an upgrade wall overlay for guests and perform requests only for premium users, matching the backend's 403 response for `guest-token`.

## 3. Caveats
- AI responses were simulated/mocked in tests, but real Vertex AI calls require GCP credentials (project and location configuration).
- The token limit in `truncateHoldingsForPrompt` defaults to 100 tokens. Depending on the complexity and size of holdings, this might need adjustments.

## 4. Conclusion
We have mapped out the entire integration pipeline:
- Backend: Real implementation of `generateAiStrategySummary` inside `guruAi.js` using `@google/genai` Vertex AI, and a new `GET /api/gurus/activity/ai-summary` endpoint.
- Frontend: Tabbed view refactoring in `GuruDetail.jsx` and rendering the activity summary feed at the top of the combined activity list in `GurusTab.jsx`.
- Testing: Defined test suites and recommended specific test additions to cover these new endpoints and components.

## 5. Verification Method
1. **Running Tests**:
   - Backend: Run `npm test` inside `backend/` to verify current tests pass.
   - Frontend: Run `npx vitest run` inside `frontend/` to verify existing tests pass.
2. **File Check**: Inspect `analysis.md` in the working directory for precise code proposals and implementation designs.
