# Quality & Adversarial Review Report — Phase 3 (AI-Powered Strategy Insights)

## Review Summary

**Verdict**: APPROVE

Phase 3 (AI-Powered Strategy Insights) of the Guru Tracker is implemented correctly, conforming to the interface contracts, layout conventions, and authentication requirements. All 37 backend Jest tests and 35 frontend Vitest tests pass successfully. The error handling is robust, using proper try-catch guards to prevent application crashes on Vertex AI service failures.

---

## Quality Review Findings

### [Minor] Finding 1: Individual AI Strategy Cache Invalidation Gap

- **What**: The individual investor AI strategy cache is never invalidated when an investor is manually synced.
- **Where**: `backend/routes/gurus.js` (under `POST /api/gurus/sync`) and `backend/services/guruAi.js`.
- **Why**: While `POST /api/gurus/sync` correctly invalidates the combined activity feed AI summary cache (`activityFeedAiSummaryCache = null`), it does not call the exported `clearAiStrategyCache(investorId)` function. Therefore, individual investor AI strategy summaries will remain cached under the old holdings data until the server restarts.
- **Suggestion**: Import `clearAiStrategyCache` and invoke it inside the sync route or during the database sync callbacks.

### [Minor] Finding 2: Status Code for Non-Existent Investor AI Strategy Request

- **What**: Querying the AI strategy of a non-existent investor returns an HTTP 500 status code instead of HTTP 404.
- **Where**: `backend/routes/gurus.js` (lines 351-372).
- **Why**: When an invalid investor ID is provided, `generateAiStrategySummary(id)` throws an error with the message `"Investor not found"`. The controller's catch block only checks for `"unavailable"` (to return 503) and defaults to a 500 Internal Server Error for everything else.
- **Suggestion**: Add a check in the catch block for `"Investor not found"` to return `res.status(404)`.

---

## Verified Claims

- **Claim 1**: All backend and frontend test suites pass successfully.
  - *Verified via*: Executed `npm test` inside `backend/` (37 tests passed) and `npx vitest run` inside `frontend/` (35 tests passed). → **PASS**
- **Claim 2**: Guest users are barred from accessing premium endpoints.
  - *Verified via*: Inspected `authenticate` middleware in `backend/routes/gurus.js` and confirmed guest-token receives a `403 Forbidden` response. Verified using e2e test cases. → **PASS**
- **Claim 3**: Horizontal tabbed UI component dynamically gates and lazily fetches queries.
  - *Verified via*: Inspected `frontend/src/components/GuruDetail.jsx` and confirmed `useGuruAiStrategy` is only enabled when `activeTab === "aiStrategy"` and `userRole !== "GUEST"`. Verified `GuruTimeline.jsx` gates guest users. → **PASS**
- **Claim 4**: Modern `@google/genai` Vertex AI SDK integration is robust.
  - *Verified via*: Inspected `backend/services/guruAi.js`, confirming proper client instantiation, method calls (`aiClient.models.generateContent`), and graceful fallback logic if generation fails or returns empty. → **PASS**

## Coverage Gaps

- **None** — All relevant Phase 3 files, schemas, endpoints, and frontend components were investigated and covered.

## Unverified Items

- **Vertex AI API responses in a live production environment**: Not verified because the tests mock the AI service and use local test stubs. Confirmed SDK integration via source code verification.

---

## Adversarial Review Challenges

**Overall Risk Assessment**: LOW

### [Low] Challenge 1: Vertex AI API Quotas & Rate Limits

- **Assumption challenged**: The Vertex AI API will always accept incoming requests without rate limiting.
- **Attack scenario**: High concurrent traffic requesting AI strategy summaries or activity feed summaries could exhaust the Google Cloud Project's Gemini API quota, causing `429 Too Many Requests`.
- **Blast radius**: User requests would fail with 503 status code.
- **Mitigation**: The current implementation of Map caching and global memory caching (`activityFeedAiSummaryCache`) significantly reduces the number of raw API calls. Applying rate limits to client IPs on the Express layer further mitigates this risk.

### [Low] Challenge 2: Prompt Token Overflows on Large Portfolios

- **Assumption challenged**: The system can safely process portfolios of any size without exceeding context window limits.
- **Attack scenario**: An investor portfolio contains hundreds of holdings, which could exceed model input constraints or increase costs.
- **Blast radius**: Model returns an error or fails to complete the generation.
- **Mitigation**: The system uses `truncateHoldingsForPrompt(holdings, 100)` to enforce a hard maximum of 100 holdings, guaranteeing the prompt size remains well within the safety limit of `gemini-3.5-flash` or `gemini-2.5-flash`.

## Stress Test Results

- **Outage simulation**: `x-simulate-ai-failure` header returns HTTP 503 gracefully. → **PASS**
- **Malformed query input**: `quarter=2026-Q5` returns HTTP 400 validation error. → **PASS**
- **Unauthorized retrieval**: Attempt to fetch history or AI strategy without token returns HTTP 401/403. → **PASS**

## Unchallenged Areas

- **Database migration schemas**: Assumed out of scope as Phase 1 and 2 were already completed and verified.
