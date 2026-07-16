# Scope: Milestone 4: Frontend Routing & Base Views

## Architecture
- **State management & hooks**: `frontend/src/hooks/useGuruData.js` handles data fetching via `@tanstack/react-query` to access `/api/gurus/*` endpoints (investors, activity feed, holdings, history, reverse lookup).
- **Navigation & Routing**: `frontend/src/App.jsx` handles adding `/gurus` and routing to Gurus view.
- **Views**:
  - `frontend/src/components/GurusTab.jsx`: Main `/gurus` page rendering `ActivityFeed` (top) and `InvestorGrid` (bottom).
  - `frontend/src/components/GuruDetail.jsx`: Rendered when an investor is selected, displaying Profile header, Recharts Sector allocation pie chart, and holdings table with QoQ change badges, wishlist buttons, and overlap highlighting.
- **Integrations**:
  - `StockDetailModal` & `StockAnalysisPage` to query reverse lookup and show which tracked gurus hold the active ticker ("Guru Ownership" section).
- **Styling & Aesthetics**: Extend existing dark theme, glassmorphism, micro-animations (Framer Motion).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Codebase Exploration | Explorer scans existing App, layout, styles, modals, hooks, and tests | None | DONE |
| 2 | React Query Hooks | Create `frontend/src/hooks/useGuruData.js` matching requirements | None | DONE |
| 3 | Base Routing & Nav | Add `/gurus` path and nav link to `App.jsx` | M2 | DONE |
| 4 | Gurus Page, Grid & Feed | Implement `GurusTab.jsx` with Activity Feed and Investor Grid | M2, M3 | DONE |
| 5 | Investor Detail View | Implement `GuruDetail.jsx` with sector pie chart, holdings table, wishlist action, overlap highlighting | M4 | DONE |
| 6 | Stock Detail Integration | Integrate "Guru Ownership" into `StockDetailModal` and `StockAnalysisPage` | M2, M5 | DONE |
| 7 | Verification & Review | Review UI aesthetics, run Vitest tests, perform Forensic Audit | M6 | DONE |

## Interface Contracts
- **`useGuruData.js` hooks**:
  - `useGurus()` -> fetches all investors
  - `useGuruHoldings(id, quarter)` -> fetches holdings for specific investor and quarter
  - `useGuruActivity(type)` -> fetches activity feed (filtered)
  - `useGuruHistory(id)` -> fetches 8-quarter history
  - `useTickerGurus(ticker)` -> fetches reverse lookup of gurus holding a ticker
- **Database Overlap**: Use existing watchlist/portfolio data from hooks to check if user owns a holding.
- **Release notes**: Add release note entry in `frontend/public/release-notes.html` upon completion.
