## 2026-06-20T10:05:17Z
You are a teamwork_preview_worker agent.
Your working directory is `/Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_m2_ingestion`.
Your mission is to implement data retrieval, parsing, and syncing for SEC 13F and 13D/13G filings for legendary investors and save them to the database.

Please review:
- `/Users/yanchimyeung/Projects/stock-dashboard/PROJECT.md`
- `/Users/yanchimyeung/Projects/stock-dashboard/.agents/sub_orch_m2_ingestion/SCOPE.md`
- `/Users/yanchimyeung/Projects/stock-dashboard/.agents/explorer_m2_ingestion/analysis.md`

Tasks:
1. Implement `backend/services/sec.js` with:
   - SEC EDGAR API Client: Max 10 requests per second (rate limit), using User-Agent header: `StockDashboard/1.0 (contact@example.com)`.
   - SEC Ingestion logic: Fetch recent filings for a given CIK (`https://data.sec.gov/submissions/CIK${cik}.json`). Filter for 13F-HR filings or 13D/13G filings.
   - 13F XML Parser: Locate the XML holding details document via folder directory indexing (`https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/index.json`), download the XML, parse it into an array of `{ companyName, CUSIP, shares, value, optionType }`. Support flexible casing options (e.g. `NameOfIssuer` / `nameOfIssuer`, `sshLevel` / `SshLevel`, etc.) as defined in `gurus.e2e.test.js`.
   - 13D/13G Parser: Extract percentOfClass and date, calculate convictionScore: 8.5 base for 13D, 5.0 base for 13G, plus 1.5 premium if percentOfClass > 10.
   - CUSIP Translation: Translate CUSIPs to tickers by checking local `CusipMapping` model first, then fallback to Yahoo Finance (search API in `yahoofinance.js`), then a local mapping fallback. If successfully resolved via Yahoo Finance, upsert it into the `CusipMapping` table to cache it.
   - Position metrics and QoQ differences: Compute portfolio weights (`value / totalValue`), convictionScore (we can set convictionScore to weight * 10 or similar, but for 13D/13G it has specific formula), and QoQ differences (`New`, `Closed`, `Increased`, `Decreased`) by comparing current holdings with the previous quarter's holdings.
   - History pruning: Keep exactly the 8 most recent quarters (filings) per investor in the database.
   - Dual Sync System:
     - On-demand sync by CIK.
     - Daily cron job check for new filings for the 11 curated investors (Warren Buffett, Ray Dalio, Bill Ackman, David Tepper, Howard Marks, Michael Burry, Seth Klarman, Stanley Druckenmiller, Li Lu, Terry Smith, Chase Coleman). Make sure the cron job is started on server start.
2. Implement `backend/routes/gurus.js` and register it in `backend/server.js`:
   - `GET /api/gurus`: Retrieve all curated/user-added investors from database.
   - `GET /api/gurus/:id/holdings?quarter=YYYY-Q[1-4]`: Get holdings for investor and quarter. Validate quarter format with regex `/^\d{4}-Q[1-4]$/` (return 400 on failure). Return 404 if investor not found.
   - `GET /api/gurus/activity`: Combined activity feed sorted by date descending.
   - `GET /api/gurus/:id/history`: 8-quarter history and QoQ differences. Fails with 403 for guest users.
   - `GET /api/gurus/ticker/:ticker`: Find which investors hold a given ticker.
   - `POST /api/gurus/sync`: Manual sync trigger. Enforce admin/user login (401 if unauthorized). Enforce rate limit of 2 seconds (2000ms) between calls for the same CIK (return 429). Accepts 10-char CIK (return 400 if invalid).
   - `GET /api/gurus/:id/ai-strategy`: Return AI-generated strategy. Fails with 403 for guest users. Uses caching. Simulates AI failure if `x-simulate-ai-failure` header is true (returns 503).
3. Connect the E2E tests in `backend/routes/__tests__/gurus.e2e.test.js` to your real implementation:
   - Import the actual functions (`parse13Fxml`, `parse13D_G`, `translateCusipToTicker`, `calculateQoQ`, `pruneHistory`, and `truncateHoldingsForPrompt`) from `backend/services/sec.js` (and export them from the test file so any external runner gets our real implementations).
   - Modify the route tests to mock the database model calls or mock the prisma/db client to return the mock data, ensuring all 30 tests in the suite pass cleanly.
4. Implement a unit test file `backend/services/__tests__/sec.test.js` verifying correct parsing of sample 13F XML files.
5. Run the tests: `npm test backend/routes/__tests__/gurus.e2e.test.js` and `npm test backend/services/__tests__/sec.test.js` and ensure all tests pass.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Provide a detailed handoff report in `/Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_m2_ingestion/handoff.md` summarizing files created/modified, tests executed and their results, and lay out compliance verification.
