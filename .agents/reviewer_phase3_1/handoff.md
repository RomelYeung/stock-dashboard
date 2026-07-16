# Handoff Report — Phase 3 (AI-Powered Strategy Insights) Review

## 1. Observation
- **File**: `backend/services/guruAi.js`
  - Lines 52–59:
    ```javascript
    if (process.env.NODE_ENV === "test") {
      const strategyText = `AI strategy insight for portfolio ${investor.name}: Maintain long-term allocation in quality leaders.`;
      aiStrategyCache.set(investorId, strategyText);
      return {
        strategyText,
        cached: false
      };
    }
    ```
- **File**: `backend/routes/gurus.js`
  - Lines 136–138:
    ```javascript
    if (process.env.NODE_ENV === "test") {
      summaryText = "Combined Activity AI Summary: Gurus have recently maintained stable long-term allocations with selective tech sector optimization.";
    }
    ```
- **File**: `backend/routes/gurus.js`
  - Lines 375–399 (POST `/sync` route):
    - `activityFeedAiSummaryCache = null;` is called, but no call to `clearAiStrategyCache(investorId)` exists.
- **File**: `frontend/src/hooks/useGuruData.js`
  - Lines 99–103 (`useSyncGuru` mutation):
    - Query keys `gurus`, `guruActivity`, and `guruActivityAiSummary` are invalidated, but `guruAiStrategy` is not.
- **File**: `frontend/public/release-notes.html`
  - Lines 364–369:
    - Release notes description includes implementation details: "token-limited holdings truncation and query caching, a combined activity feed AI summary endpoint with sync-based invalidation, and custom React Query hooks."
- **Command Output**: `npx vitest run` in `frontend/`
  - Output: `35 passed`
- **Command Output**: `npm test` in `backend/`
  - Output: `80 passed`

## 2. Logic Chain
- **Step 1**: The conditional checks for `process.env.NODE_ENV === "test"` (Observation 1) bypass the real Gemini Vertex AI integration pathways during tests. This constitutes a facade/dummy implementation that cheats verification.
- **Step 2**: The lack of `clearAiStrategyCache` calls in the sync route (Observation 2) and the missing `guruAiStrategy` query invalidation in the frontend hook (Observation 3) mean that manually synced investor data will display stale AI summaries to the user.
- **Step 3**: The inclusion of technical details in the release notes (Observation 4) violates the AGENTS.md rule requiring descriptions to focus on user impact and avoid internal details.
- **Step 4**: Together, these design flaws require changes to satisfy correctness, completeness, and design integrity.

## 3. Caveats
- Real Vertex AI calls were not execution-tested during this review due to network mode restrictions (CODE_ONLY) and lack of active Vertex AI credentials.

## 4. Conclusion
The current implementation fails to meet design integrity and correctness standards because it embeds test mocks in production code, neglects cache invalidation for individual AI strategies upon synchronization, and includes internal details in the release notes.

**Verdict**: REQUEST_CHANGES

## 5. Verification Method
- **Backend tests**: Run `npm test` inside `backend/`
- **Frontend tests**: Run `npx vitest run` inside `frontend/`
- **Inspect cache clearing**: Search the codebase for `clearAiStrategyCache` to verify it is called in `backend/routes/gurus.js` on successful sync.
