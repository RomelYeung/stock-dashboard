# Scope: Milestone 2 — Data Ingestion Pipeline

## Architecture
The ingestion pipeline is responsible for fetching filings from the SEC EDGAR API, parsing them (13F XML and 13D/13G), translating security identifiers (CUSIP) to tickers using a multi-tiered lookup (local cache -> Yahoo Finance -> local fallbacks), calculating metrics (value, weight, conviction, and QoQ differences), persisting them to the SQLite database via Prisma, and pruning history to keep exactly 8 quarters.

### Data Flow
1. SEC EDGAR API (Rate-limited, custom User-Agent) -> raw XML/HTML data.
2. Parser (XML parsing for 13F; SGML/HTML metadata parsing for 13D/13G).
3. CUSIP Translation (lookup in Prisma CusipMapping table; fallback to Yahoo Finance ticker lookup or manual map).
4. Calculation Engine (aggregate portfolio total values, compute weights, calculate QoQ changes relative to previous filing, assign conviction).
5. Database Syncer (insert/update Investor, Filings, Holdings, and CusipMapping; prune older filings if filings count > 8).
6. Cron / On-demand Trigger (daily check for 11 curated CIKs; Express route POST /api/gurus/sync trigger).

## Sub-Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M2.1 | Exploration & Architecture | Explore existing services (yahoofinance.js, etc.) and design parser interfaces | None | DONE |
| M2.2 | SEC Client & Parsers | Implement SEC client (10 req/sec, User-Agent) and parsers for 13F (XML) and 13D/13G filings. Write unit tests. | M2.1 | DONE |
| M2.3 | CUSIP & Calculations | Implement CUSIP translator and portfolio metric calculator (QoQ, conviction, weight). | M2.2 | DONE |
| M2.4 | Sync & Pruning Engine | Implement sync database persistence, history pruning (8 quarters max), on-demand sync, and cron task. | M2.3 | DONE |
| M2.5 | Integration & Verification | E2E verification of pipeline, unit/integration test suite run, and auditor verification. | M2.4 | DONE |

## Interface Contracts

### 1. SEC API Client & Parser (`backend/services/sec.js`)
- `fetchFilings(cik)`: Fetch recent filings metadata for CIK.
- `fetchFilingDetails(accessionNumber, submissionFile)`: Fetch raw xml/sgml content.
- `parse13Fxml(xmlString)`: Parse 13F XML into list of raw holdings `{ companyName, CUSIP, shares, value, optionType }`.
- `parse13D_G(filingMetadata)`: Calculate conviction score and event metadata for 13D/13G.

### 2. CUSIP Mapping (`backend/services/sec.js`)
- `translateCusipToTicker(cusip)`: Resolves CUSIP to ticker.
  - Queries local `CusipMapping` table first.
  - Fallback 1: Query Yahoo Finance.
  - Fallback 2: Local hardcoded fallback mapping.

### 3. Metric Calculator & QoQ (`backend/services/sec.js`)
- `calculatePortfolioMetrics(holdings, prevHoldings)`: Compute weights, conviction score, and compare current holdings with previous quarter's holdings to produce QoQ changes (`New`, `Closed`, `Increased`, `Decreased`, and corresponding diffs).

### 4. Sync Coordinator & Pruner (`backend/services/sec.js`)
- `syncInvestor(cik)`: Coordinates complete fetching, parsing, calculation, caching, and database upserts for a given investor CIK. Keeps only the 8 most recent quarters.
- `dailySyncCron()`: Cron job function running daily to sync the 11 curated investors.
