# Changes Log

## Frontend Routing and base views for the Guru Tracker

### 1. Updated `frontend/src/App.jsx`
- Wired up the state variables `selectedGuruId` and `previousPage` for correct state tracking.
- Synced state to URL and URL to state for `page=gurus` and `guruId=...` in routing `useEffect` blocks.
- Added a "Guru Tracker" toggle button in the page toggle navigation section.
- Passed `user`, `tickers`, `wishlistTickers`, `addToWishlist`, `removeFromWishlist`, `portfolio`, and callbacks down to `GurusTab`.
- Preserved existing functionality and removed unused variables.

### 2. Created `frontend/src/components/GurusTab.jsx`
- Designed glassmorphism visual layout conforming to the dark theme.
- Added transaction change filter chips (All, New, Exits, Increases, Decreases).
- Displayed recent activity feed table mapping tickers to clickable modals.
- Rendered tracked investor grid using Framer Motion micro-animations, showing Big Initial avatars, fund strategy, estimated AUM, latest filing dates, and a preview of their top 3 holdings by weight.
- Toggled to `GuruDetail` view when a specific investor card is clicked.

### 3. Created `frontend/src/components/GuruDetail.jsx`
- Included a Back button that resets `selectedGuruId`.
- Styled profile header with name, strategy, biography, AUM, and a large initials avatar.
- Implemented sortable holdings table showing shares, value, portfolio weight, option types, and QoQ change badges.
- Rendered indicator badges next to tickers showing `Owned` (if shares > 0), `Watched` (if shares === 0), and `Wishlisted` (if in wishlist).
- Provided toggling star action for Wishlist additions with a maximum limit check of 20, triggering a premium warning toast if exceeded.
- Rendered sector allocation pie chart (using Recharts).
- Integrated `GuruTimeline` (history) and `GuruHeatmap` (overlaps comparison matrix).

### 4. Integrated Ticker Guru Ownership
- Modified `frontend/src/components/StockDetailModal.jsx` to fetch `useGuruReverseLookup` and render a Guru Ownership list below the TradingViewChart showing investor name, fund, and weight.
- Modified `frontend/src/components/StockAnalysisPage.jsx` to add "Guru Ownership" tab and render the GuruOwnershipTab listing tracked gurus holding the stock.

### 5. Added Release Notes
- Added a feature release entry for Milestone 4 under June 2026 month-group in `frontend/public/release-notes.html`.
