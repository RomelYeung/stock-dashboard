# Initial Exploration Report: Stock Dashboard Codebase

This report provides a detailed overview of the backend and frontend structure, database schemas, configurations, and external integrations (such as Yahoo Finance) of the `stock-dashboard` application. All findings have been verified by inspecting the codebase.

---

## 1. Executive Summary
The `stock-dashboard` project is a financial dashboard application built using a **Node.js/Express** backend and a **React/Vite** frontend. It leverages **Prisma with SQLite** for local database management and integrates with **Yahoo Finance**, **FRED (St. Louis Fed)**, and **Charles Schwab API** for market data and macroeconomic indicators. Authentication is cookie-based via JWT.

---

## 2. Backend Structure
The backend codebase is written in modern JavaScript (ESM) and is structured as follows:

*   **Server Entrypoint**: `backend/server.js`
    *   Initializes the Express application, sets up CORS rules, cookie parsing, gzip compression, global and endpoint-specific rate limiters, and error handling.
    *   Integrates **Sentry** for crash and performance monitoring.
    *   Launches daily IV data ingestion, runs margin debt auto-update checks, seeds default admin credentials, and starts the API server (default port `3001`).
*   **Database (Prisma)**:
    *   Prisma schema is located at `backend/prisma/schema.prisma`.
    *   Connector client helper: `backend/services/db.js` exports a shared instance of `PrismaClient`.
*   **API Routes**:
    *   Mounted under `/api/` in `backend/server.js`.
    *   `authRoutes` (`/api/auth`) -> `backend/routes/auth.js`: Handles registration, login, logout, and checking current user session.
    *   `stockRoutes` (`/api/stocks`) -> `backend/routes/stocks.js`: Fetches stock summaries, financials, price history, news, earnings, cash flow valuations (DCF), AI valuation recommendations, and Schwab details.
    *   `portfolioRoutes` (`/api/portfolio`) -> `backend/routes/portfolio.js`: Handles watchlist and wishlist item operations (retrieving, adding, and removing items).
    *   `optionsRoutes` (`/api/options`) -> `backend/routes/options.js`: Implements option chain scanning.
    *   `aiRoutes` (`/api/ai`) -> `backend/routes/ai.js`: AI adviser and assistant routes.
*   **Middleware**:
    *   `backend/middleware/auth.js`:
        *   `requireAuth`: Extracts and verifies JWT from the `token` HttpOnly cookie. Fetches the user from the database and attaches it to `req.user`.
        *   `requireAdmin`: Gates admin routes by checking `req.user.role === 'ADMIN'`.
    *   `backend/middleware/errorHandler.js`: Catch-all middleware for processing uncaught server errors.
    *   `backend/middleware/validate.js`: Implements payload validation using the **Zod** library.
*   **Services**:
    *   Contains the core business logic, such as:
        *   `yahoofinance.js`: Interacts with the `yahoo-finance2` library.
        *   `cache.js` & `cache-persist.js`: Configures multiple independent memory caches using `node-cache` (e.g. `fundamentalsCache`, `priceCache`, `livePriceCache`) and periodic JSON persistence.
        *   `dcf.js`: Computes WACC, FCF projections, and runs Monte Carlo simulations.
        *   `fred.js`: Interfaces with the Federal Reserve Economic Data (FRED) API.
        *   `schwab-auth.js`, `schwab-client.js`: Implements OAuth2/PKCE flows for Charles Schwab integration.
*   **Tests Setup**:
    *   Uses **Jest** as the test runner, configured in `backend/package.json` to run with experimental ESM modules:
        `"test": "node --experimental-vm-modules node_modules/.bin/jest"`
    *   Tests are co-located in `__tests__` directories (e.g., `backend/routes/__tests__/options.test.js`, `backend/services/__tests__/historical-iv.test.js`).

---

## 3. Frontend Structure
The frontend is a single-page application (SPA) built using React, Vite, and custom CSS-in-JS layout systems:

*   **Routing Mechanism**:
    *   Implements a custom URL synchronization and rendering system in `frontend/src/App.jsx` instead of a formal routing library.
    *   Tracks `currentPage` and `selectedTicker` in React state.
    *   Uses a `popstate` event listener and `history.pushState` to dynamically sync these state variables with the browser URL (e.g., `?page=stock&ticker=AAPL`).
*   **Page Layouts**:
    *   `LoginPage.jsx`: User login and registration screen.
    *   `MarketIndicatorsPage.jsx`: Renders macroeconomic charts, margin debt indicators, and sector rotation leaderboards.
    *   `StockAnalysisPage.jsx`: Deep dive tabbed interface for selected tickers containing tabs for Fundamentals, Earnings, Insider Trading, DCF Analysis, Options Scanner, Sentiment, and News.
    *   `AdminDashboard.jsx`: Management panel for admin users.
*   **Styling Paradigm**:
    *   **No Tailwind CSS package** is installed. The application uses a custom styling architecture.
    *   Global design tokens, custom colors, animations, glassmorphism utilities, and ambient orb variables are defined in the root stylesheet `frontend/src/styles/index.css`.
    *   React components style layout and element structure using local CSS-in-JS style objects (`style={styles.container}`) that consume global CSS custom variables (e.g., `var(--bg-surface)`, `var(--text-primary)`, `var(--accent-blue)`).
*   **State Management & Hooks**:
    *   `AuthProvider` (`frontend/src/context/AuthContext.jsx`): Manages authentication state (`user`, `loading`) and exposes callbacks (`login`, `register`, `logout`) via `useAuth()`.
    *   `@tanstack/react-query` (`QueryClientProvider` in `frontend/src/main.jsx`): Handles fetching and caching of server responses.
    *   Custom hooks in `frontend/src/hooks/useStockData.js`:
        *   `usePortfolio(tickers)`: Fetches general statistics for a list of tickers.
        *   `useLivePrices(tickers)`: Polls the backend every 5 seconds during market hours for live price updates. Implements retry backoff (doubling interval up to 5 minutes) and handles 429 rate limits by backing off for 120 seconds.
        *   `usePortfolioItems(userId)`: Handles CRUD operations for portfolio items and wishlist items, syncing with backend endpoints.
*   **Component Libraries**:
    *   **Recharts**: Renders balance sheets, margin debt, inflation, yield curves, and EPS beat/miss charts (e.g., `MonteCarloChart.jsx`, `SectorLeaderboard.jsx`).
    *   **Plotly** (`react-plotly.js` & `plotly.js-dist-min`): Used exclusively in `OptionsScannerTab.jsx` for rendering 3D option volatility surfaces and open interest.
    *   **Framer Motion**: Adds fluid entry/exit animations for modals, charts, adviser chats, and state transitions (e.g. `AnimatePresence` and `motion.div`).
    *   **Lightweight Charts / TradingView**: Renders advanced stock charts (e.g. `TradingViewChart.jsx`).
*   **Stock Modal Overlay**:
    *   `StockDetailModal.jsx`: Animated modal overlay that triggers when a stock card on the dashboard is clicked. Displays basic statistics, a mini status badge indicating whether the stock is undervalued/overvalued based on DCF fair value, and an embedded TradingView interactive chart widget. Includes a button to transition to the full `StockAnalysisPage` deep dive view.
*   **Wishlist & Watchlist Functionality**:
    *   Managed in `PortfolioManager.jsx`.
    *   Users can search and add tickers to either their Watch List or Wish List via `TickerAutocomplete.jsx`.
    *   Ensures watchlist and wishlist lengths do not exceed constraints defined in `frontend/src/constants.js` (`MAX_PORTFOLIO_TICKERS = 20` and `MAX_WISHLIST_TICKERS = 20`).
*   **Tests Setup**:
    *   Uses **Vitest** for testing, run via `npm run test` (maps to `vitest` command).
    *   Test suites are found in `__tests__` (e.g., `frontend/src/hooks/__tests__/useLivePrices.test.js`).

---

## 4. Database Schema and Configurations
The database is managed locally via **Prisma** and backed by **SQLite**. 

### 4.1 Schema Definitions (`backend/prisma/schema.prisma`)
*   `User`:
    *   Represents registered users.
    *   Fields: `id` (UUID primary key), `email` (unique), `passwordHash`, `role` (default `"USER"`), `createdAt`, `updatedAt`.
    *   Relations: `portfolios` (`PortfolioItem[]`), `wishlist` (`WishListItem[]`), `chatSessions` (`ChatSession[]`).
*   `PortfolioItem`:
    *   Tracks stock holdings in the user's watchlist.
    *   Fields: `id` (UUID), `userId` (relation to `User`), `ticker`, `shares` (Float), `averagePrice` (Float), `createdAt`, `updatedAt`.
    *   Index: `@@index([userId])`.
*   `WishListItem`:
    *   Tracks stocks marked for wishlist.
    *   Fields: `id` (UUID), `userId` (relation to `User`), `ticker`, `createdAt`, `updatedAt`.
    *   Index: `@@index([userId])`.
*   `HistoricalIV`:
    *   Stores daily historical implied volatility for option modeling.
    *   Fields: `id` (UUID), `ticker`, `date` (DateTime), `iv` (Float), `createdAt`.
    *   Index: `@@unique([ticker, date])`.
*   `ChatSession`:
    *   Manages AI financial adviser conversation sessions.
    *   Fields: `id` (UUID), `userId` (optional relation to `User`), `ticker`, `createdAt`, `updatedAt`.
*   `ChatMessage`:
    *   Individual message entries inside a chat session.
    *   Fields: `id` (UUID), `sessionId` (relation to `ChatSession`), `role` (`'user'` or `'model'`), `agentName` (e.g., `'Data Analyst'`), `content`, `createdAt`.

### 4.2 Database Configuration (`backend/.env` / `.env.example`)
*   `DATABASE_URL`: Set to `"file:./dev.db"`, which resolves to a local SQLite file in `backend/prisma/dev.db`.

---

## 5. Yahoo Finance Integration
The application retrieves live and historical market data through the **Yahoo Finance** API.

*   **Integration File**: `backend/services/yahoofinance.js`
*   **NPM Dependency**: `yahoo-finance2`
*   **Key Functions Provided**:
    *   `getSummary(ticker)`: Fetches market pricing (regular, pre, post market), trailing and forward P/E, peg ratio, beta, 52-week price range, average volume, sector, and industry details.
    *   `getFinancials(ticker)`: Fetches profit margins, return on equity (ROE), revenue growth, EPS estimates/trends, and quarterly EPS surprises. Also queries annual income statement histories via `fundamentalsTimeSeries`.
    *   `getBalanceSheet(ticker)`: Retrieves debt-to-equity, current ratio, assets, liabilities, and free cash flows (FCF).
    *   `getFundamentalsTimeSeries(ticker)`: Fetches quarterly income statement and cash flow series.
    *   `getPriceHistory(ticker, period)` / `getOhlcv(ticker, period)`: Returns OHLCV quote arrays over periods like `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y` for charting.
    *   `getPortfolioSummaries(tickers)`: Batch fetches summary profiles for lists of portfolio stocks, resolving missing fields (like sector and industry) from the cache or concurrent API queries.
    *   `getLivePrices(tickers)`: Fast lookup of live prices using a low-latency cache layer.
    *   `getHistoricalDailyData(ticker)`: Retrieves daily close price data for historical volatility analysis.
*   **Caching Strategy**:
    *   Implements memory caches with distinct TTL configurations in `backend/services/cache.js` to respect rate limits:
        *   **Fundamentals**: 7 days TTL (`CACHE_TTL_FUNDAMENTALS`).
        *   **Price History**: 1 day TTL (`CACHE_TTL_PRICE`).
        *   **Live Price**: 5 seconds TTL (`CACHE_TTL_LIVE_PRICE`).
        *   **Insider / Comparables**: 24 hours TTL.

---

## 6. Verified Evidence Chain

| Functional Area | File Path | Code Element / Line Range | Detail / Configuration Value |
| :--- | :--- | :--- | :--- |
| **Backend entrypoint** | `backend/server.js` | Lines 30–139 | Express setup, Sentry integration, cron jobs initialization |
| **Database configuration** | `backend/prisma/schema.prisma` | Lines 5–8 | SQLite provider, database url set to `env("DATABASE_URL")` |
| **Database schemas** | `backend/prisma/schema.prisma` | Lines 10–74 | Definitions of `User`, `PortfolioItem`, `WishListItem`, `HistoricalIV`, `ChatSession`, `ChatMessage` |
| **Auth verification** | `backend/middleware/auth.js` | Lines 11–38 | `requireAuth` extracts JWT from `req.cookies.token` |
| **Auth endpoints** | `backend/routes/auth.js` | Lines 29–96 | Endpoints `/register`, `/login`, `/logout`, `/me` with cookie options |
| **Backend testing script** | `backend/package.json` | Line 10 | Runs Jest with ESM: `"test": "node --experimental-vm-modules node_modules/.bin/jest"` |
| **Frontend custom routing** | `frontend/src/App.jsx` | Lines 51–89 | Syncs URL query params `page` and `ticker` to state |
| **Frontend styles** | `frontend/src/styles/index.css` | Lines 1–48 | CSS Variables (`--bg-base`, `--accent-blue`, etc.) |
| **Frontend client config** | `frontend/vite.config.js` | Lines 19–27 | Proxies `/api` requests to `http://localhost:3001` |
| **Portfolio items hooks** | `frontend/src/hooks/useStockData.js` | Lines 404–483 | `usePortfolioItems` calls `GET /api/portfolio` and handles Watchlist/Wishlist additions/deletions |
| **Live price polling** | `frontend/src/hooks/useStockData.js` | Lines 73–199 | `useLivePrices` polls `/api/stocks/portfolio/live` during market hours with rate limit backoffs |
| **Plotly visualization** | `frontend/src/components/OptionsScannerTab.jsx` | Lines 2–3 | Imports `plotly.js-dist-min` and `react-plotly.js/factory` |
| **Recharts charts** | `frontend/src/components/Charts.jsx` | Line 6 | Imports charting elements from `recharts` |
| **TradingView widget** | `frontend/src/components/TradingViewChart.jsx` | Lines 1–2 | Embedding TradingView charts for interactive charts |
| **Yahoo Finance service** | `backend/services/yahoofinance.js` | Lines 1–3 | Instantiates `yahoo-finance2` API module |
| **Low-latency caching** | `backend/services/cache.js` | Lines 14–21 | Configures `fundamentalsCache`, `priceCache`, `insiderCache`, `comparablesCache`, `livePriceCache` |
| **Macro indicators data** | `backend/services/fred.js` | Lines 69–155 | Fetches Fed Funds (`FEDFUNDS`), NYSE Margin Debt (`BOGZ1FLNQ`), High-Yield Spreads (`BAMLH0A0HYM2`), YoY CPI (`CPIAUCSL`), Fed Assets (`WALCL`), 10-Yr Yield (`DGS10`), 10Y-2Y Spread (`T10Y2Y`), Consumer Sentiment (`UMCSENT`), Unemployment (`UNRATE`) |
| **API Limit Constants** | `backend/constants.js` | Lines 13–25 | Defines maximum limits (`MAX_PORTFOLIO_TICKERS = 20`, `MAX_WISHLIST_TICKERS = 20`, `RATE_LIMIT_LIVE_PRICES_MAX = 30`) |
