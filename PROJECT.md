# Project: Guru Tracker (Institutional Investor Holdings Tracker)

## Architecture
The Guru Tracker is a feature integrated into the `stock-dashboard` application. It allows tracking legendary investors' portfolio changes by fetching, parsing, and persisting SEC 13F and 13D/13G filings.

### Data Flow
1. **Ingestion**: SEC EDGAR API -> Parsing XML/SGML -> CUSIP mapping to Ticker -> Position metric calculation -> Store in SQLite.
2. **API**: Express routes expose endpoints under `/api/gurus`. Uses Zod for validation, JWT auth cookies for access control, and Gemini/Vertex AI for strategy summaries.
3. **Frontend**: Custom URL-synchronized route `/gurus`. Displays recent activity, investor grid, detailed holdings table with overlap highlighting, charts (sector pie, timeline, overlap heatmap), and AI insights. Relies on `@tanstack/react-query` and Custom CSS-in-JS.

## Code Layout
- `backend/prisma/schema.prisma` - DB schema definitions
- `backend/routes/gurus.js` - API routing for Guru Tracker
- `backend/services/sec.js` - EDGAR API client, parser, and CUSIP translation
- `backend/services/guruAi.js` - Gemini AI wrapper for strategy summaries
- `frontend/src/hooks/useGuruData.js` - React Query hooks for API integration
- `frontend/src/components/GurusTab.jsx` - Main `/gurus` page component
- `frontend/src/components/GuruDetail.jsx` - Specific investor details component
- `frontend/src/components/GuruHeatmap.jsx` - Heatmap overlap matrix
- `frontend/src/components/GuruTimeline.jsx` - Holdings history chart
- `frontend/public/release-notes.html` - Release notes entry

## Interface Contracts

### 1. Database Schema Additions
- `Investor`: CIK, name, fundName, philosophy, bio, photoUrl, tags (JSON), currentAum, lastFilingDate.
- `Filing`: date, accessionNumber, periodOfReport, type (13F-HR, 13D, 13G), investorId.
- `Holding`: ticker, CUSIP, shares, value, optionType (PUT, CALL, or none), portfolioWeight, convictionScore, filingId.
- `CusipMapping`: CUSIP (PK), ticker, companyName.

### 2. Express Endpoints (`/api/gurus`)
- `GET /api/gurus`: Fetch all curated/user-added investors.
- `GET /api/gurus/:id/holdings?quarter=YYYY-Q[1-4]`: Get holdings for a specific investor and quarter (guest access allowed for current quarter).
- `GET /api/gurus/activity`: Fetch combined activity feed across all investors (updates, new, exits, increases, decreases).
- `GET /api/gurus/:id/history`: Fetch 8-quarter holdings history and QoQ differences (requires login).
- `GET /api/gurus/ticker/:ticker`: Find which investors hold a given ticker.
- `POST /api/gurus/sync`: Manual sync trigger for a CIK (requires admin or registered user, rate-limited).

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | DB Schema & Migrations | Create SQLite tables for Investor, Filing, Holding, CusipMapping using Prisma | None | DONE |
| M2 | Data Ingestion Pipeline | Fetch and parse SEC EDGAR XML/HTML 13F and 13D/13G filings; CUSIP maps | M1 | DONE |
| M3 | Backend API Endpoints | Zod-validated endpoints under `/api/gurus/*`, caching, security rules | M2 | DONE |
| M4 | Frontend Routing & Base Views | Custom `/gurus` page, Activity Feed, Investor Grid, Investor Details | M3 | DONE |
| M5 | Cross-Investor Analytics | Overlap heatmap, concentration HHI, timeline (AI strategy insights skipped) | M4 | DONE |
| M6 | Authentication Gate | Apply guest vs logged-in restrictions on historical data and timeline charts | M3, M4 | DONE |
| M7 | E2E Integration & Hardening | Final verification using the E2E test suite; complete release notes | M5, M6 | DONE |
