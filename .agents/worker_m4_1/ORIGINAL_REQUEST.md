## 2026-06-20T14:17:40Z

You are teamwork_preview_worker. Your working directory is `/Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_m4_1`.

Your task is to implement the frontend routing and base views for the Guru Tracker in the stock-dashboard application.

Please read:
- `/Users/yanchimyeung/Projects/stock-dashboard/PROJECT.md`
- `/Users/yanchimyeung/Projects/stock-dashboard/.agents/sub_orch_m4_frontend/SCOPE.md`

First, you MUST invoke the `modern-web-guidance` tool using npx to check modern patterns for glassmorphism, responsive grids, and components.
Example: `npx -y modern-web-guidance@latest search "glassmorphism"` and retrieve any useful guide.

Here are the specific requirements to implement:
1. Update `frontend/src/App.jsx`:
   - Wire up "gurus" page state in the routing. Make sure the search parameter `page=gurus` (and optionally `guruId=...` for a selected investor) is synchronized correctly in the URL effects.
   - Update the header navigation (in the `pageToggle` div) to render a "Guru Tracker" button that toggles `currentPage` to `"gurus"`.
   - Pass user information, watchlist/portfolio tickers (`tickers`), and wishlist tickers (`wishlistTickers`) down to `GurusTab` and handle wishlist mutations (`addToWishlist` and `removeFromWishlist`).
   - Clean up any unused imports or variables when done.

2. Create `frontend/src/components/GurusTab.jsx`:
   - Main page for the Guru Tracker tab.
   - Render the page inside a wrapper matching the application's layout.
   - **Activity Feed Section (Top)**:
     - Use `useGuruActivity` from `hooks/useGuruData.js` to fetch recent changes.
     - Include filter chips (All, New, Exits, Increases, Decreases).
     - Map the filter chips: 'All' -> all, 'New' -> change === 'New', 'Exits' -> change === 'Closed', 'Increases' -> change === 'Increased', 'Decreases' -> change === 'Decreased'.
     - Display a list of activity entries (investor name, date, ticker symbol, type of change, size, portfolio weight) in a premium cards list or table. Make the ticker symbols clickable to open the stock detail modal.
   - **Investor Grid Section (Bottom)**:
     - Fetch the curated list of investors using `useGurus` from `hooks/useGuruData.js`.
     - Render a responsive grid of investor cards.
     - Each card should show: investor photo placeholder (styled with initials or custom design matching the premium look), name, fund name, strategy, AUM, latest filing date, and a preview of their top 3 holdings (by weight/value).
     - Clicking on an investor card sets the active investor ID, rendering `GuruDetail` inside `GurusTab` or transitioning the view.
   - If an investor is selected, render the `GuruDetail` component.

3. Create `frontend/src/components/GuruDetail.jsx`:
   - Displayed when an investor is selected. Include a "Back to Tracker" button that resets the selected investor ID.
   - **Profile Header**: Show photo/placeholder, name, bio, philosophy, and AUM.
   - **Holdings Table**:
     - Fetch holdings using `useGuruHoldings(id)`.
     - An interactive, sortable holdings table showing shares, value, portfolio weight, and QoQ change badges (e.g. New, Increased, Decreased).
     - Show indicator badges (e.g. "Owned" or "Watched") if the ticker is in the user's watchlist/portfolio, or "Wishlisted" if in the wishlist.
     - Provide a one-click Wishlist star/button for each holding. Check if `wishlistTickers.length >= 20` before adding. If it is already in the wishlist, clicking removes it (toggle action). If adding fails due to the limit, show a premium toast or alert.
     - Clicking a ticker opens the Stock Detail Modal (by setting selected ticker in the parent).
   - **Sector Allocation Chart**: Render a pie chart of the investor's sector allocations using Recharts (from `recharts`). Compute the sector breakdown by grouping holdings by `sector` and summing up their weights or values.
   - **Cross-Investor Analytics**:
     - Render the historical timeline using the existing `GuruTimeline` component (`frontend/src/components/GuruTimeline.jsx`). Pass `history` from `useGuruHistory(id)` and the user's role.
     - Render the overlap comparison matrix using the existing `GuruHeatmap` component (`frontend/src/components/GuruHeatmap.jsx`). Pass the full list of gurus, the current guru's ID, and a selection handler.

4. Integrate Stock Detail modal & page:
   - In `frontend/src/components/StockDetailModal.jsx`: Fetch reverse lookup using `useGuruReverseLookup(ticker)` from `hooks/useGuruData.js`. Render a "Guru Ownership" section below the TradingViewChart, listing the tracked gurus holding the stock and their portfolio weights.
   - In `frontend/src/components/StockAnalysisPage.jsx`: Add a `"Guru Ownership"` tab to `TABS`. Under this tab, fetch the reverse lookup data and display the list of tracking gurus.

5. Visual styling & guidelines:
   - Ensure the UI looks beautiful, premium, and matches the existing dark theme (using the CSS variables from `frontend/src/styles/index.css`).
   - Use custom React inline styles (styles = { ... }) matching the patterns in other components like `MarketIndicatorsPage` and `InsiderTradingTab`.
   - Avoid installing new styling libraries. Use `framer-motion` for transitions and animations.

6. Validation:
   - Run Vitest tests using `npm test -- --run` in the `frontend` directory. Make sure everything builds and all tests pass.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please report your progress and implementation details in `changes.md` in your directory, run tests to verify they pass, and output your handoff report.
