# Original User Request

## Initial Request — 2026-06-20T09:35:46Z

An institutional investor holdings tracker (Guru Tracker) integrated into the stock-dashboard application. It tracks SEC 13F and 13D/13G filings for curated legendary investors, visualizes portfolio concentration and overlaps, provides AI-powered strategy summaries, and integrates with the existing watchlist and stock detail views.

Working directory: `/Users/yanchimyeung/Projects/stock-dashboard`
Integrity mode: `benchmark`

## Requirements

### R1. Data Retrieval and Ingestion Pipeline
- Fetch and parse quarterly 13F filings (in XML/SGML/HTML formats) and 13D/13G filings from the SEC EDGAR API.
- Maintain a local mapping of CUSIPs to tickers, utilizing Yahoo Finance or local mapping fallbacks.
- Build a dual sync system:
  - Daily cron job that checks for new filings for the 11 curated investors (Warren Buffett, Ray Dalio, Bill Ackman, David Tepper, Howard Marks, Michael Burry, Seth Klarman, Stanley Druckenmiller, Li Lu, Terry Smith, Chase Coleman).
  - An on-demand sync mechanism for custom CIK inputs.
- Parse and calculate position metrics: share count, total value, portfolio weight, conviction scores, and quarter-over-quarter differences (New, Closed, Increased, Decreased).
- Maintain 8 quarters (2 years) of historical filings.

### R2. Database Schema
- Create schema migrations using Prisma+SQLite to store:
  - `Investor` (profiles, AUM, tags, bio, philosophy, fund name).
  - `Filing` (date, accession number, period of report).
  - `Holding` (ticker, CUSIP, shares, value, option/put/call markers).
  - `CusipMapping` (CUSIP to ticker cache).

### R3. API Endpoints
- Expose Express endpoints under `/api/gurus`:
  - Fetch list of curated/user-added investors.
  - Get detailed holdings for a specific investor and quarter.
  - Get a combined recent activity feed across all investors.
  - Get 8-quarter history and QoQ differences for an investor.
  - Reverse lookup for a ticker: see which investors hold it.
  - Trigger manual sync for a specific CIK.

### R4. Frontend Pages and Components
- Add `/gurus` route to the frontend app, and include it in the main navigation.
- **Activity Feed Section (Top)**: Interactive feed of recent portfolio changes across all investors with filter chips (All, New, Exits, Increases, Decreases).
- **Investor Grid Section (Bottom)**: Responsive grid of investor cards with photos, quick stats (AUM, strategy, latest filing date), and top holdings preview.
- **Investor Detail View**:
  - Profile header with photo, bio, philosophy, and AUM.
  - Interactive, sortable holdings table showing shares, value, portfolio weight, and QoQ change badges.
  - One-click wishlist addition for any holding.
  - Sector allocation pie chart (using Recharts).
  - Overlap highlighting showing indicator badges if the user owns any of the holdings.
- **Stock Detail Modal Integration**: Add a "Guru Ownership" section inside the existing `StockDetailModal` and `StockAnalysisPage` displaying which tracked gurus hold the active ticker.

### R5. Cross-Investor Analytics
- **Guru Overlap Matrix**: A heatmap visualization showing which tickers are held by multiple investors, colored by weight/conviction.
- **Position Timeline**: A historical line/bar chart displaying share counts over the last 8 quarters overlaid with stock price trends for a selected holding.
- **Concentration Analytics**: A visual representation of top holdings concentration and portfolio Herfindahl-Hirschman Index.

### R6. AI-Powered Strategy Insights
- Utilize the existing Gemini/Vertex AI pipeline to generate natural-language strategy analyses explaining the quarterly moves of each investor.
- Display the generated insights inside the investor detail page and provide one-line AI summaries in the activity feed.

### R7. Tiered Authentication & Access Control
- Configure access control: basic pages and current-quarter holdings are public (accessible to guest users).
- Historical details, timeline analytics, and AI summaries require a logged-in user. Redirect guest users to the login screen or display an upgrade prompt.

### R8. Infrastructure & Compliance Constraints
- All SEC EDGAR API calls must comply with the SEC rate limit (max 10 requests per second) and include descriptive user-agent headers identifying the application.

### R9. UI Aesthetics & Guidelines
- **Premium Design Required**: The UI must look beautiful and premium, extending the dashboard's existing dark theme with rich glassmorphism, custom micro-animations (Framer Motion), smooth transitions, vibrant tailored colors for strategies, and curated typography.
- **Guidance Skills**: For any UI related tasks, the UI design subagents MUST invoke the relevant UI design skills (specifically `modern-web-guidance`) and read it before building.

## Verification Plan

### Automated Tests
- Run `npm run test` in the backend directory. There must be route-level integration tests checking the `/api/gurus/*` endpoints (validation, auth checks, and pagination/filtering).
- Implement unit tests for the EDGAR parser verifying correct parsing of sample 13F XML files.
- Run `npm run test` in the frontend directory to verify custom hooks and state management under `useGuruData.js`.

### Manual Verification Checklist
- [ ] Parse a sample Berkshire Hathaway 13F filing and verify the results match the SEC filing exactly.
- [ ] Verify that clicking a ticker on the holdings table correctly triggers the existing `StockDetailModal` overlay.
- [ ] Verify that clicking the "Add to Wishlist" button successfully persists the stock to the user's wishlist in the database.
- [ ] Verify that guest users are restricted from viewing the AI summaries and 8-quarter history, and are prompted to log in.
- [ ] Verify that the sector breakdown pie chart renders correctly without visual overflow.

### Acceptance Criteria

### Technical & Code Quality
- [ ] Schema migrations applied cleanly without data loss.
- [ ] Backend routes validate request payloads using Zod.
- [ ] The app uses existing tailwind/css variables and matches the project style guide.
- [ ] Every user-visible change has a corresponding release note entry in `frontend/public/release-notes.html` in reverse chronological order.

### Functional Completeness
- [ ] Main feed lists recent transactions across all 11 curated investors.
- [ ] Custom investor CIK input successfully triggers an EDGAR sync and creates a new profile.
- [ ] Heatmap matrix highlights stocks held by multiple investors.
- [ ] Click-through from holdings table to existing stock detail modal works seamlessly.
- [ ] User portfolio overlap is highlighted on holdings rows.

## Follow-up — 2026-06-20T10:06:36Z

The user has requested to stop execution once Phase 2 (Cross-Investor Analytics) is completed to avoid hitting token/usage limits. Please adjust the roadmap to skip Phase 3 (AI strategy insights/Gemini integration and final polish) and conclude the run once Phase 2 requirements (database schema, ingestion pipeline, API endpoints, frontend pages, deep-linking, heatmap matrix, position timeline, and concentration metrics) are fully implemented and verified. Ensure that the E2E tests pass and release notes are updated.

## Follow-up — 2026-06-20T22:25:45Z

The user's usage limit has reset, and we can now proceed to implement Phase 3 (AI-Powered Strategy Insights). 

Please resume execution to fulfill the Phase 3 requirements:
1. AI-Powered Strategy Insights (R6): Utilize the existing Gemini/Vertex AI pipeline to generate natural-language strategy analyses explaining the quarterly moves of each investor.
2. Display the generated insights inside the investor detail page (under a new "AI Strategy" tab) and provide one-line AI summaries in the activity feed.
3. Verify all routes and tests, update the release notes in `frontend/public/release-notes.html` to reflect the complete Phase 1-3 implementation, and trigger a final Victory Audit.
