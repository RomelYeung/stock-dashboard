## 2026-06-20T14:13:25Z
You are the Frontend Developer. Please implement the frontend components and hooks for the Guru Tracker feature in the stock-dashboard project.

Follow these steps exactly:
1. Create `frontend/src/hooks/useGuruData.js` to define React Query hooks targeting `/api/gurus` routes:
   - `useGurus()` (GET /api/gurus)
   - `useGuruHoldings(id, quarter)` (GET /api/gurus/:id/holdings?quarter=...)
   - `useGuruActivity()` (GET /api/gurus/activity)
   - `useGuruHistory(id)` (GET /api/gurus/:id/history)
   - `useGuruReverseLookup(ticker)` (GET /api/gurus/ticker/:ticker)
   - `useSyncGuru()` (POST /api/gurus/sync)

2. Create `frontend/src/components/GurusTab.jsx` as the main `/gurus` dashboard tab view:
   - Render the activity feed (Combined Feed of recent transactions) and the curated investor grid (11 investors).
   - Filter the activity feed using chips (All, New, Exits, Increased, Decreased).
   - Support a search bar/input to filter the investor grid or search for specific holdings/tickers.
   - Synchronize with the URL query parameters (e.g. `?page=gurus`).
   - Clicking an investor sets `selectedGuruId` to navigate to the detailed view.

3. Create `frontend/src/components/GuruDetail.jsx` showing details for a selected investor:
   - Header with investor name, fund name, bio, investment philosophy, current AUM, last filing date, and tags.
   - Holdings table: columns for Ticker, Company Name, Shares, Value, Portfolio Weight, Conviction Score, Option Type (PUT, CALL, or none). Clicking a ticker opens the Stock Detail Modal or Stock Analysis page.
   - Add to Wishlist button on each holdings row, persisting the stock to the watchlist.
   - HHI portfolio concentration score and category badge (Low, Moderate, High).
   - Sector pie chart (asset allocation by sector).
   - Integrate `GuruHeatmap` (overlap matrix) and `GuruTimeline` (holdings timeline).
   - Upgrade wall: If the user's role is "GUEST", block access to the timeline and history, showing a sign-in/upgrade wall pointing to `/login`.

4. Create `frontend/src/components/GuruHeatmap.jsx` to render the overlap heatmap matrix. Compute overlap scores (sum of min weights) between the current guru and other gurus in the database.
5. Create `frontend/src/components/GuruTimeline.jsx` to render the holdings history timeline chart over 8 quarters.
6. Integrate the new `GurusTab` and navigation button in `frontend/src/App.jsx`:
   - Add a navigation tab button for "Gurus" in the header.
   - Render `<GurusTab />` when the currentPage is "gurus".
   - Seamlessly link clicking a stock ticker to `setSelectedTicker` and opening the stock detail modal.

7. Run `npm test` inside the `frontend` folder to ensure all Vitest E2E test assertions pass successfully.
8. Run `npm run build` inside `frontend` to verify that there are no compilation or bundling errors.
9. Update `frontend/public/release-notes.html` to add a new Feature release note entry at the top of the June 2026 group, describing the Guru Tracker dashboard, overlap heatmap, position timeline, concentration metrics, and tiered access controls.
10. Document all changes and test results in `/Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_frontend_impl/handoff.md` and send a completion message to the parent orchestrator.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
