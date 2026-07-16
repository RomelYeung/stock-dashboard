## Review Summary

**Verdict**: REQUEST_CHANGES

The ingestion pipeline implementation is robust, correct, and conforms to code conventions. All core requirements are met. However, the E2E tests (`backend/routes/__tests__/gurus.e2e.test.js`) fail on two cases: "Test 4.12: Admin Sync Journey (Scenario 2)" and "Test 3.11: Combined sync and API cache invalidation (Tier 3 Cross)". Both fail with a `429 Rate limit exceeded` status code. This is due to a test isolation issue: the route handler in `backend/routes/gurus.js` enforces a 2-second rate limit per CIK using a private `syncRequestTimes` Map, but the tests run sequentially within milliseconds and make duplicate requests for the same CIKs without resetting the map.

## Findings

### [Major] Finding 1: E2E Test Failures due to Rate Limiter (429)

- **What**: E2E test suite fails with status 429 instead of 202 on duplicate CIK sync requests.
- **Where**: `backend/routes/__tests__/gurus.e2e.test.js` lines 545 and 560.
- **Why**: `backend/routes/gurus.js` implements a rate-limiting check:
  ```javascript
  const now = Date.now();
  const lastSyncTime = syncRequestTimes.get(CIK) || 0;
  if (now - lastSyncTime < 2000) {
    return res.status(429).json({ success: false, error: "Rate limit exceeded" });
  }
  ```
  The map `syncRequestTimes` is a private, module-scoped variable in `backend/routes/gurus.js`. The test file tries to clear a local `syncRequestTimes` map in its `beforeEach` hook, which has no effect on the map inside the actual router. Therefore, tests running within 2 seconds of each other that request syncs for the same CIK (e.g., Warren Buffett `0001067983` or Michael Burry `0001649339`) receive a 429 response.
- **Suggestion**: Export a mechanism to reset the rate limiter map from the router (e.g., exposing a helper function `clearSyncRequestTimes` or exporting the map itself under `process.env.NODE_ENV === 'test'`), or introduce a short delay / use unique CIKs for each test case.

### [Minor] Finding 2: Lack of Database Transactions in Ingestion Sync

- **What**: No transaction guards around database writes in `syncInvestor`.
- **Where**: `backend/services/sec.js` lines 470-506 and 535-564.
- **Why**: During 13F or 13D/13G sync, the database writes are performed in multiple separate Prisma queries (creating `Filing`, creating many `Holding`s, updating `Investor`'s AUM and last filing date). If a crash or network interruption occurs mid-process, the database will be left in an inconsistent state (e.g., a `Filing` exists with no `Holding`s). On subsequent syncs, the filing will be skipped because it already exists (`existing` is true), leaving the holdings missing forever.
- **Suggestion**: Wrap the filing insertion, holdings creation, and investor update inside a Prisma transaction block: `await prisma.$transaction(async (tx) => { ... })`.

## Verified Claims

- SEC rate limit complying → verified via `view_file` on `backend/services/sec.js` and running tests. It implements a 10 req/sec limiter. → **pass**
- Descriptive User-Agent headers → verified via `view_file` on `backend/services/sec.js`. Configured as `StockDashboard/1.0 (contact@example.com)`. → **pass**
- CUSIP translation with fallbacks and database mapping update → verified via `view_file` on `backend/services/sec.js` and unit tests. Queries database mapping first, then falls back to `LOCAL_CUSIP_MAP`, then searches Yahoo Finance and upserts. → **pass**
- QoQ difference calculations → verified via `view_file` on `backend/services/sec.js` and unit/E2E tests. Correctly categorizes positions as "New", "Increased", "Decreased", "Closed". → **pass**
- History pruning to exactly 8 quarters → verified via `view_file` on `backend/services/sec.js` and tests. Retains exactly the 8 most recent filings in the database and prunes older ones. → **pass**
- Dual sync with daily cron and CIK on-demand → verified via `view_file` on `backend/services/sec.js` and `backend/server.js`. Syncs daily at 1:00 AM and supports `POST /api/gurus/sync` endpoint. → **pass**
- Code layout complies with `PROJECT.md` → verified directory structure. Co-located tests and correct paths. → **pass**
- AI strategy insights endpoint behaves per adjusted scope → verified via `view_file` on `backend/services/guruAi.js`. Returns a static/cached response to save tokens. → **pass**

## Coverage Gaps

- Yahoo Finance Search Reliability — risk level: **medium** — Yahoo Finance API searches can sometimes return incorrect matches or fail under heavy rate-limiting. Recommendation: Accept risk, as this is a fallback mechanism.

## Unverified Items

- Real SEC network requests — reason not verified: Mocked out in E2E tests and rate-limited in production to prevent IP ban.
