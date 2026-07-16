# E2E Test Infra: Guru Tracker (Stock Dashboard)

## Test Philosophy
- **Opaque-box**: We treat the backend routes and the frontend state/hooks as a black box. We do not test private helper functions or implementation internals directly.
- **Requirement-driven**: Every test maps back to a specific requirement in `ORIGINAL_REQUEST.md`.
- **Methodology**: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Interaction Testing + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 (Happy) | Tier 2 (Boundary) | Tier 3 (Cross) |
|---|---------|---------------------|:--------------:|:-----------------:|:--------------:|
| 1 | Data Retrieval & Sync | ORIGINAL_REQUEST §R1, R8 | 5 | 5 | ✓ |
| 2 | Express API Endpoints | ORIGINAL_REQUEST §R3, R7 | 5 | 5 | ✓ |
| 3 | Frontend Hooks & UI | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 4 | Cross-Investor Analytics | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 5 | AI Insights & Auth Gates | ORIGINAL_REQUEST §R6, R7 | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner**: Jest (`backend`) and Vitest (`frontend`). We run backend E2E integration tests using Jest under `backend/routes/__tests__/gurus.e2e.test.js` (using `supertest` to query Express endpoints with actual database entries). We run frontend E2E integration tests using Vitest under `frontend/src/hooks/__tests__/useGuruData.e2e.test.js` to verify state machines, API caching, and queries.
- **Test Database**: A separate SQLite file (e.g. `test-e2e.db`) is configured during test execution to prevent cluttering or modifying the development database.
- **Directory Layout**:
  - `backend/routes/__tests__/gurus.e2e.test.js` - API & Ingestion E2E tests
  - `frontend/src/hooks/__tests__/useGuruData.e2e.test.js` - Frontend hook & caching E2E tests

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥5 test cases per feature (25 total)
- **Tier 2 (Boundary & Corner Cases)**: ≥5 test cases per feature (25 total)
- **Tier 3 (Cross-Feature Combinations)**: 5 pairwise interaction tests (5 total)
- **Tier 4 (Real-World Application Scenarios)**: 5 realistic application workloads (5 total)
- **Total test cases**: 60 test cases.

---

## Complete Test Case Inventory (60 Cases)

### Feature 1: SEC Ingestion and Syncing (F1)
- **Test 1.1 (Tier 1)**: Ingest a valid 13F XML filing, verifying that parsing extracts holding records, share counts, and values correctly.
- **Test 1.2 (Tier 1)**: Ingest a 13D/13G filing, verifying that parser parses event type, date, and updates conviction score.
- **Test 1.3 (Tier 1)**: CUSIP-to-ticker translation: verify that a parsed CUSIP maps to its correct ticker using local mapping cache or Yahoo Finance fallback.
- **Test 1.4 (Tier 1)**: Trigger sync on-demand with a valid CIK, verifying a new profile is created, filings fetched, and stored in SQLite.
- **Test 1.5 (Tier 1)**: Calculate QoQ position differences, verifying that position changes (New, Closed, Increased, Decreased) are calculated accurately based on shares from the prior quarter.
- **Test 1.6 (Tier 2)**: Malformed XML: Ingest a corrupted 13F XML filing, verifying the pipeline catches errors gracefully and logs them without crashing the server.
- **Test 1.7 (Tier 2)**: Empty filing: Ingest a filing with 0 holdings, verifying that the database stores the filing and records 0 AUM.
- **Test 1.8 (Tier 2)**: Sync request with invalid/non-existent CIK, verifying the API returns a 400 Bad Request error.
- **Test 1.9 (Tier 2)**: Rate-limiting compliance: verify that SEC EDGAR calls respect the limit of 10 requests per second.
- **Test 1.10 (Tier 2)**: History pruning: sync an investor with >8 quarters of history, verifying that the database keeps exactly the most recent 8 quarters.

### Feature 2: API Endpoints & Access Control (F2)
- **Test 2.1 (Tier 1)**: `GET /api/gurus` retrieves the complete list of 11 curated legendary investors with required fields (name, fundName, philosophy, tags).
- **Test 2.2 (Tier 1)**: `GET /api/gurus/:id/holdings?quarter=YYYY-Q[1-4]` retrieves exact holding rows (shares, value, weight) for the investor and quarter.
- **Test 2.3 (Tier 1)**: `GET /api/gurus/activity` fetches a combined feed of recent activity across all tracked investors, sorted by date descending.
- **Test 2.4 (Tier 1)**: `GET /api/gurus/ticker/:ticker` performs reverse lookup, returning list of gurus holding the ticker.
- **Test 2.5 (Tier 1)**: `POST /api/gurus/sync` triggers manual sync and returns a 202/200 status code indicating the sync process was initiated.
- **Test 2.6 (Tier 2)**: `GET /api/gurus/:id/holdings` with invalid quarter formats (e.g. `2026-Q5` or `202Q`), verifying Zod validation catches and rejects the request.
- **Test 2.7 (Tier 2)**: Request holdings for a non-existent investor ID, verifying API returns 404 Not Found.
- **Test 2.8 (Tier 2)**: `POST /api/gurus/sync` rate limits: consecutive sync calls within window receive a 429 status code.
- **Test 2.9 (Tier 2)**: `POST /api/gurus/sync` unauthorized: request sync without JWT session cookie, verifying a 401 response.
- **Test 2.10 (Tier 2)**: `GET /api/gurus/:id/history` access verification: guest requests return 403 Forbidden.

### Feature 3: Gurus Web UI & Pages (F3)
- **Test 3.1 (Tier 1)**: Verify `/gurus` route active state in navigation and confirm both Activity Feed and Investor Grid components mount.
- **Test 3.2 (Tier 1)**: Filter Activity Feed transactions using chips (All, New, Exits, Increases, Decreases), verifying lists update appropriately.
- **Test 3.3 (Tier 1)**: Navigate to Investor Detail page, verifying profile header (bio, philosophy, photo, AUM) loads.
- **Test 3.4 (Tier 1)**: Click "Add to Wishlist" on a holdings row, verifying that the stock is persisted to the database watchlist.
- **Test 3.5 (Tier 1)**: Click a holdings ticker row, verifying that Stock Detail Modal opens and loads the "Guru Ownership" section.
- **Test 3.6 (Tier 2)**: Empty holdings UI state: verify detail page handles investors with 0 holdings by showing a friendly placeholder.
- **Test 3.7 (Tier 2)**: Filter toggle race conditions: toggle feed filters rapidly, verifying no component crashes or visual overlaps.
- **Test 3.8 (Tier 2)**: Intercept guest wishlist addition: guest user clicking "Add to Wishlist" is shown login prompt.
- **Test 3.9 (Tier 2)**: Render sector pie chart with 50+ sectors, verifying labels/legend wrap correctly without clipping or overflow.
- **Test 3.10 (Tier 2)**: Load Stock Detail Modal for a ticker with 0 guru owners, verifying "Guru Ownership" section renders clean empty state.

### Feature 4: Cross-Investor Analytics (F4)
- **Test 4.1 (Tier 1)**: Overlap heatmap: verify heatmap loads and cells color correctly based on hold weight/conviction.
- **Test 4.2 (Tier 1)**: Position Timeline: verify historical share count chart maps points across 8 quarters.
- **Test 4.3 (Tier 1)**: HHI concentration: verify portfolio HHI calculation matches expected formula.
- **Test 4.4 (Tier 1)**: Historical price overlay: verify timeline chart displays stock price lines next to holding bars.
- **Test 4.5 (Tier 1)**: Overlap matrix filters: verify sorting by weight or ticker updates matrix display.
- **Test 4.6 (Tier 2)**: Disjoint portfolios: verify overlap matrix handles 0 overlaps without crashing (renders empty state).
- **Test 4.7 (Tier 2)**: Timeline chart with <2 quarters of data, verifying it displays lines for available quarters without interpolation errors.
- **Test 4.8 (Tier 2)**: Concentration calculation for empty portfolio, verifying it return 0 HHI without division by zero.
- **Test 4.9 (Tier 2)**: Timeline overlay with missing price data, verifying it falls back to displaying holding bars only.
- **Test 4.10 (Tier 2)**: Heatmap responsive scaling: verify chart resizes dynamically without layout shifts or text overlaps.

### Feature 5: AI Insights & Tiered Access Control (F5)
- **Test 5.1 (Tier 1)**: AI Strategy generation: verify backend sends structured holdings data to Vertex AI and receives strategy text.
- **Test 5.2 (Tier 1)**: Render AI summaries: verify logged-in user can view Gemini strategy analysis on detail page.
- **Test 5.3 (Tier 1)**: Restrict guest user: verify guest user cannot access AI summaries or history (sees upgrade card).
- **Test 5.4 (Tier 1)**: Redirect on upgrade: verify clicking upgrade redirect button sends guest to `/login`.
- **Test 5.5 (Tier 1)**: AI response caching: verify subsequent requests load from DB cache instead of calling Vertex AI API.
- **Test 5.6 (Tier 2)**: Vertex AI failure: verify that if Gemini service is down, backend returns 503 and UI displays clean fallback text.
- **Test 5.7 (Tier 2)**: No transactions AI prompt: verify generator handles static portfolio without error.
- **Test 5.8 (Tier 2)**: Direct endpoint bypass: guest user hits `/api/gurus/:id/history` directly, verifying response code is 403.
- **Test 5.9 (Tier 2)**: Public endpoint access: verify guest user fetches current quarter holdings without credentials.
- **Test 5.10 (Tier 2)**: Large payload token limits: verify prompt builder truncates holdings list cleanly if total tokens exceed limit.

---

## Real-World Application Scenarios (Tier 4)

### Scenario 1 (Test 4.11): Legendary Investor Portfolio Exploration (User Journey)
- **Steps**:
  1. Guest visits `/gurus` page and views curated list of investors.
  2. Guest clicks Warren Buffett, views current holdings table sorted by weight.
  3. Guest clicks Apple (AAPL) ticker, opening `StockDetailModal`.
  4. Guest sees that Warren Buffett and Michael Burry both hold AAPL in the "Guru Ownership" section.
  5. Guest attempts to view "8-Quarter History" or "AI Strategy Summaries", receives a "Sign-in required" prompt.
  6. Guest registers/logs in, returns to detail page, now views full historical charts and Gemini insights.
  7. Guest adds AAPL to wishlist from the holdings table.

### Scenario 2 (Test 4.12): Custom Investor Benchmarking (Admin Sync Journey)
- **Steps**:
  1. Admin logs in and navigates to Guru dashboard settings.
  2. Admin inputs Scion Asset Management CIK `0001649339` and triggers manual sync.
  3. Backend fetches and parses historical 13F files from SEC EDGAR.
  4. CUSIP mapper successfully resolves holdings CUSIPs to tickers.
  5. App stores 8 quarters of filings, AUM, and computes QoQ difference metrics.
  6. Grid updates to display Scion Asset Management profile and top holdings preview.

### Scenario 3 (Test 4.13): Guest User Progression & Auth Upgrade
- **Steps**:
  1. Guest views Activity Feed, showing recent transactions.
  2. Guest clicks Terry Smith's card, views current holdings.
  3. Guest tries to click "Timeline Analytics" or "AI Summary", upgrade wall appears.
  4. Guest clicks login, authenticates, and is redirected back to Terry Smith's detail view.
  5. Detail page now renders full historical trend graphs, HHI charts, and Gemini summaries.

### Scenario 4 (Test 4.14): Cross-Portfolio Analysis & Wishlist Building
- **Steps**:
  1. User navigates to Guru Overlap Heatmap.
  2. User spots a ticker held with high conviction by Bill Ackman and David Tepper.
  3. User clicks the ticker, displaying the QoQ position timeline chart showing both have increased holdings.
  4. User clicks "Add to Wishlist".
  5. User goes to their Watchlist tab and confirms ticker is listed.

### Scenario 5 (Test 4.15): Automated Daily Ingestion and Feed Updates
- **Steps**:
  1. System daily cron executes sync check for the 11 curated investors.
  2. System detects new 13F filing for Ray Dalio.
  3. System downloads filing XML, parses new holdings, maps CUSIPs, and calculates QoQ metrics.
  4. Global activity feed updates with transaction cards: "Ray Dalio increased weight in Microsoft".
  5. Bridgewater Associates profile displays updated AUM and latest filing date.
