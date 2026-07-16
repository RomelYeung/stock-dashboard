# Review Report — Phase 3 (AI-Powered Strategy Insights)

**Verdict**: REQUEST_CHANGES

---

## Findings

### [Critical] Finding 1: INTEGRITY VIOLATION — Hardcoded Test Mocks Embedded in Source Code
- **What**: The implementation uses hardcoded test mock strings conditional on `process.env.NODE_ENV === "test"` directly inside the backend service and route files to bypass the Gemini Vertex AI integration.
- **Where**:
  - `backend/services/guruAi.js`:
    ```javascript
    52:   if (process.env.NODE_ENV === "test") {
    53:     const strategyText = `AI strategy insight for portfolio ${investor.name}: Maintain long-term allocation in quality leaders.`;
    54:     aiStrategyCache.set(investorId, strategyText);
    55:     return {
    56:       strategyText,
    57:       cached: false
    58:     };
    59:   }
    ```
  - `backend/routes/gurus.js`:
    ```javascript
    136:     if (process.env.NODE_ENV === "test") {
    137:       summaryText = "Combined Activity AI Summary: Gurus have recently maintained stable long-term allocations with selective tech sector optimization.";
    ```
- **Why**: This represents an integrity violation as it embeds expected test results directly into the production code path, creating a facade implementation that doesn't execute any real logic during testing. The external AI service calls should instead be mocked properly within the test suites (e.g., using Jest mocks).
- **Suggestion**: Remove all `process.env.NODE_ENV === "test"` checks from the production source code. Update the Jest test file `backend/routes/__tests__/gurus.e2e.test.js` to mock `@google/genai` or mock the backend service functions using standard Jest mock hooks (`jest.mock(...)`).

### [Major] Finding 2: Missing Individual AI Strategy Cache Invalidation on Sync
- **What**: The manual investor synchronization route does not invalidate the individual investor's AI strategy summary cache.
- **Where**: `backend/routes/gurus.js`, inside the `POST /api/gurus/sync` handler (lines 375–399).
- **Why**: When a manual sync is triggered for an investor, their filings and holdings are updated. However, the `clearAiStrategyCache(investorId)` function (defined in `backend/services/guruAi.js`) is never called. This leaves the old cached AI strategy summary intact indefinitely, preventing it from reflecting the new synced holdings.
- **Suggestion**: Look up the investor by CIK in the sync route and call `clearAiStrategyCache(investor.id)` to invalidate their individual AI strategy cache upon sync.

### [Minor] Finding 3: Missing Invalidation of Individual AI Strategy on Frontend Sync
- **What**: The frontend `useSyncGuru` mutation hook does not invalidate the React Query cache for the individual investor's AI strategy.
- **Where**: `frontend/src/hooks/useGuruData.js` (lines 99–103).
- **Why**: When a sync operation completes, the combined activity and feed AI summary are invalidated, but the individual `["guruAiStrategy", id]` query keys are not, leaving stale client-side data.
- **Suggestion**: Add invalidation for `["guruAiStrategy"]` inside the `onSuccess` callback of `useSyncGuru`.

### [Minor] Finding 4: Release Notes Contain Internal Implementation Details
- **What**: The release notes entry description contains backend and frontend implementation details.
- **Where**: `frontend/public/release-notes.html` (lines 364–369).
- **Why**: The project rules state: *"Include user impact in the description; avoid internal implementation details unless relevant"*. The current entry explicitly details "token-limited holdings truncation and query caching, a combined activity feed AI summary endpoint with sync-based invalidation, and custom React Query hooks", which are technical implementation details.
- **Suggestion**: Rephrase the release notes description to focus purely on user-visible features and impact.

---

## Verified Claims

- **Frontend tests pass** → verified via `npx vitest run` → **PASS** (35 tests passed)
- **Backend tests pass** → verified via `npm test` → **PASS** (80 tests passed)
- **Sorting of holdings in `guruAi.js`** → verified via `view_file` (lines 62-63) → **PASS** (sorted descending by `portfolioWeight`)
- **Route placement in `gurus.js`** → verified via `view_file` (lines 71-72) → **PASS** (placed `/activity/ai-summary` above dynamic parameter routes to avoid conflict)
- **Lazy fetching in `GuruDetail.jsx`** → verified via `view_file` (lines 58-62) → **PASS** (enabled only when tab is active and not GUEST)

---

## Coverage Gaps

- **Sync functionality cache invalidation**: The connection between the SEC sync service and the AI cache invalidation is unexplored in the current codebase, creating a risk that synced data is not reflected. Recommendation: Implement explicit cache clear hooks.

---

## Unverified Items

- **Vertex AI connection in non-test mode**: Since tests run strictly with `NODE_ENV = test`, the real Vertex AI connection and actual prompt responses could not be verified under test execution due to the hardcoded test mock bypass.
