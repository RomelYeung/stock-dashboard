# Stock Dashboard

A full-stack portfolio monitoring and stock analysis platform with real-time prices, quantitative options scanning, AI-powered valuation debates, and comprehensive market indicators.

## Features

- **Real-time Live Prices** — Auto-polling prices every 5 seconds during market hours via Schwab API (Yahoo Finance fallback), with market session-aware polling (slows to 5 min after close)
- **Portfolio & Wish List** — Persisted watchlist and wish list management with user accounts, separate lists, ticker autocomplete search
- **Stock Detail Modal** — Interactive TradingView-style candlestick chart (Lightweight Charts) with SMA 200, Volume, RSI toggles, timeframe selector, live price overlay, and OHLCV crosshair HUD
- **Fundamentals Analysis** — Revenue history, margins, cash flow, ROE, debt ratios, sector peer comparables with sparklines and YoY trends
- **DCF Valuation w/ Monte Carlo** — Discounted Cash Flow model with adjustable WACC/growth sliders, Monte Carlo distribution, sensitivity matrix, DDM (Gordon Growth) and Residual Income (RIM) models, sector-aware equity risk premiums
- **AI Valuation & Debate** — Gemini-powered streaming SSE debate between simulated personas (Buffett, Graham, Lynch, RenTech, Behavioral Finance Analyst) with conviction scores
- **Options Scanner** — Schwab option chain, SVI volatility surface fitting (Levenberg-Marquardt), IV Rank/Percentile (historical), Gamma Exposure (GEX), spread-adjusted edge ranking, 3D scatter surface, 0DTE filter
- **Insider Trading** — SEC Form 4 filings via EDGAR, 30-day net activity summary
- **Sector Rotation** — Score-based ranking of GICS + thematic ETFs with leaderboard and hero card
- **Market Indicators Dashboard** — 11 macro indicators: VIX, Fed Funds Rate, 10Y Treasury, yield curve spread, credit spreads (BAA-AAA), margin debt, inflation (CPI), Fed balance sheet (WALCL), AAII sentiment, consumer sentiment, unemployment
- **Schwab OAuth Integration** — PKCE OAuth2 flow with auto token refresh, one-click re-auth banner, token health monitoring
- **User Authentication** — JWT + bcryptjs with role-based access (admin), persisted portfolio/wishlist via Prisma+SQLite
- **Admin Dashboard** — Cache stats management, margin debt update trigger, user role management
- **Error Tracking** — Sentry monitoring on both frontend and backend

## Tech Stack

### Frontend
| Dependency | Purpose |
|---|---|
| **React 18** + **Vite** | UI framework and build tool |
| **TanStack React Query** | Server-state fetching and caching |
| **Lightweight Charts** | TradingView-style candlestick charts |
| **Recharts** | Macro indicator line/area charts |
| **Plotly.js** | 3D volatility surface scatter plots |
| **Framer Motion** | Animations and transitions |
| **React TradingView Embed** | Embedded TradingView widgets |
| **Sentry** | Error tracking and performance monitoring |
| **Vitest** | Unit testing |

### Backend
| Dependency | Purpose |
|---|---|
| **Node.js 18+** + **Express** | Runtime and web framework |
| **Prisma ORM** + **SQLite** | Database and migrations |
| **Yahoo Finance 2** | Stock search, historical prices, fundamentals, SEC data |
| **Schwab API** | Real-time quotes, option chains, market data (OAuth2 PKCE) |
| **FRED API** | Macroeconomic indicators (Fed, CPI, yields, unemployment) |
| **Google Generative AI (Gemini)** | AI-powered valuation and multi-agent debate (SSE streaming) |
| **JWT** + **bcryptjs** | Authentication and password hashing |
| **Zod** | Request validation and type coercion |
| **node-cache** | In-memory caching (TTL-based) |
| **node-cron** | Scheduled background jobs (historical IV ingestion) |
| **ml-levenberg-marquardt** + **ml-matrix** | SVI volatility surface fitting |
| **Sentry** | Error tracking and profiling |
| **Jest** | Unit testing |

## Getting Started

### Prerequisites
- Node.js v18+
- npm

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/RomelYeung/stock-dashboard.git
cd stock-dashboard
```

2. **Install backend dependencies**
```bash
cd backend
npm install
```

3. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your API keys (see Configuration section below)
```

4. **Initialize the database**
```bash
npx prisma generate
npx prisma migrate dev
```

5. **Install frontend dependencies**
```bash
cd ../frontend
npm install
```

### Running the Application

1. **Start the backend server**
```bash
cd backend
npm run dev
# Server runs on http://localhost:3001
```

2. **In another terminal, start the frontend dev server**
```bash
cd frontend
npm run dev
# Frontend runs on http://localhost:3002
```

3. **Open your browser** and navigate to `http://localhost:3002`

The Vite dev server proxies `/api` requests to the backend at `localhost:3001`.

## Configuration

Create `backend/.env` based on `.env.example`:

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Random string for signing auth tokens |
| `PORT` | No | Backend port (default: 3001) |
| `FRONTEND_URL` | No | Frontend origin for CORS (default: http://localhost:3002) |
| `DATABASE_URL` | No | SQLite path (default: file:./dev.db) |
| `SCHWAB_CLIENT_ID` | No | Schwab API OAuth client ID (for live prices & options) |
| `SCHWAB_CLIENT_SECRET` | No | Schwab API OAuth client secret |
| `FRED_API_KEY` | No | FRED API key (for macro indicators) |
| `GOOGLE_CLOUD_PROJECT` | No | Google Cloud project for Vertex AI (default: dumb-money-dashboard) |
| `GOOGLE_CLOUD_LOCATION` | No | Google Cloud region for Vertex AI (default: us-central1) |
| `GEMINI_MODEL` | No | Gemini model name (default: gemini-2.5-flash) |

The app works without Schwab/FRED/Gemini keys — live prices fall back to Yahoo Finance, and features that require those APIs will be gracefully unavailable.

## Available Scripts

### Backend
| Script | Command | Description |
|---|---|---|
| `dev` | `nodemon server.js` | Start dev server with auto-restart |
| `start` | `node server.js` | Start production server |
| `test` | `jest` | Run unit tests |
| `test:watch` | `jest --watch` | Run tests in watch mode |

### Frontend
| Script | Command | Description |
|---|---|---|
| `dev` | `vite` | Start Vite dev server (port 3002) |
| `build` | `vite build` | Build for production |
| `preview` | `vite preview` | Preview production build |
| `test` | `vitest` | Run unit tests |

### Database Management
```bash
# Run migrations
npx prisma migrate dev

# View/edit data in browser
npx prisma studio

# Reset database
npx prisma migrate reset
```

## Project Structure

```
stock-dashboard/
├── backend/
│   ├── server.js                    # Express app entry point
│   ├── constants.js                 # Global constants
│   ├── middleware/
│   │   ├── auth.js                  # JWT authentication middleware
│   │   ├── errorHandler.js          # Centralized error handler
│   │   └── validate.js              # Zod-based request validation
│   ├── routes/
│   │   ├── auth.js                  # Register, login, logout, profile
│   │   ├── stocks.js                # Stock search, quotes, fundamentals
│   │   ├── options.js               # Options scanning & SVI fitting
│   │   ├── portfolio.js             # Portfolio/wishlist CRUD
│   │   └── __tests__/               # Route-level tests
│   ├── services/
│   │   ├── yahoofinance.js          # Yahoo Finance data fetching
│   │   ├── schwab-auth.js           # Schwab OAuth2 PKCE flow
│   │   ├── schwab-client.js         # Schwab API client (quotes, options)
│   │   ├── schwab-callback-server.js # OAuth callback HTTP server
│   │   ├── fred.js                  # FRED macro data service
│   │   ├── aiValuation.js           # Gemini DCF cross-validation
│   │   ├── aiDebateEngine.js        # Multi-agent AI debate (SSE)
│   │   ├── dcf.js                   # DCF, DDM, RIM models
│   │   ├── comparables.js           # Peer sector comparison
│   │   ├── indicators.js            # Market indicators computation
│   │   ├── sectorData.js            # Sector ETF data
│   │   ├── sectorScore.js           # Sector rotation scoring
│   │   ├── insiderTrading.js        # SEC EDGAR Form 4 parsing
│   │   ├── historical-iv.js         # Historical IV storage
│   │   ├── marginDebt.js            # FINRA margin debt
│   │   ├── aaii.js                  # AAII sentiment data
│   │   ├── auth.js                  # Auth service (BCrypt + JWT)
│   │   ├── db.js                    # Prisma client singleton
│   │   ├── cache.js                 # node-cache (TTL, segments)
│   │   └── cache-persist.js         # Cache persistence layer
│   ├── src/quant/
│   │   ├── svi.js                   # SVI volatility surface fitting
│   │   ├── mathUtils.js             # Quantitative math utilities
│   │   ├── context.js               # Bayesian context engine
│   │   └── __tests__/               # Quant tests
│   ├── scripts/
│   │   ├── seed.js                  # Database seeding
│   │   ├── promote-user.js          # Promote user to admin
│   │   ├── schwab-auth-cli.js       # CLI-based Schwab auth
│   │   ├── historical-iv-worker.js  # Daily IV ingestion worker
│   │   └── test-schwab-integration.js # Schwab integration test
│   ├── prisma/
│   │   ├── schema.prisma            # Database schema
│   │   ├── dev.db                   # SQLite database (local dev)
│   │   └── migrations/              # Migration history
│   ├── .env.example                 # Environment variable template
│   └── package.json
├── frontend/
│   ├── index.html                   # Vite entry HTML
│   ├── vite.config.js               # Vite config (port 3002, /api proxy)
│   ├── public/
│   │   └── release-notes.html       # Release notes page
│   ├── src/
│   │   ├── main.jsx                 # React entry point
│   │   ├── App.jsx                  # Router & layout
│   │   ├── constants.js             # Frontend constants
│   │   ├── context/
│   │   │   └── AuthContext.jsx       # Auth state management
│   │   ├── components/
│   │   │   ├── StockCard.jsx        # Portfolio/wish stock cards
│   │   │   ├── StockDetailModal.jsx # Detailed stock view
│   │   │   ├── Charts.jsx           # TradingView chart component
│   │   │   ├── TradingViewChart.jsx # Lightweight Charts wrapper
│   │   │   ├── StockAnalysisPage.jsx # Full analysis page
│   │   │   ├── DCFAnalysis.jsx      # DCF/DDM/RIM models
│   │   │   ├── DCFSummary.jsx       # DCF summary bar
│   │   │   ├── MonteCarloChart.jsx  # Monte Carlo distribution
│   │   │   ├── SensitivityMatrix.jsx # WACC×Growth heatmap
│   │   │   ├── FundamentalsTab.jsx  # Financials & peer compare
│   │   │   ├── OptionsScannerTab.jsx # Options chain & surface
│   │   │   ├── InsiderTradingTab.jsx # SEC Form 4 filings
│   │   │   ├── SectorHero.jsx       # Top sector display
│   │   │   ├── SectorLeaderboard.jsx # Sector ranking
│   │   │   ├── SectorSignalsGuide.jsx # Signal interpretations
│   │   │   ├── MarketIndicatorsPage.jsx # Macro dashboard
│   │   │   ├── MetricCard.jsx       # Single metric widget
│   │   │   ├── PortfolioManager.jsx # Portfolio CRUD
│   │   │   ├── TickerAutocomplete.jsx # Search autocomplete
│   │   │   ├── LoginPage.jsx        # Auth UI
│   │   │   ├── AdminDashboard.jsx   # Admin tools
│   │   │   ├── SchwabAuthAlert.jsx  # Token expiry alert
│   │   │   ├── MarketSessionBadge.jsx # Market open/closed
│   │   │   ├── ErrorBoundary.jsx    # Error boundary
│   │   │   └── consolidated/
│   │   │       └── ConsolidatedMetricCard.jsx
│   │   ├── hooks/
│   │   │   ├── useStockData.js      # Data fetching hooks
│   │   │   └── __tests__/
│   │   ├── utils/
│   │   │   ├── formatters.js        # Number/currency formatting
│   │   │   ├── interpretations.js   # Indicator interpretations
│   │   │   ├── aiValuation.js       # AI valuation client
│   │   │   ├── marketStatus.js      # Market hours detection
│   │   │   └── volumeSignals.js     # Volume signal analysis
│   │   └── styles/
│   │       └── index.css            # Global styles
│   └── package.json
└── README.md
```

## API Overview

| Endpoint | Description |
|---|---|
| `POST /api/auth/register` | Create a new user account |
| `POST /api/auth/login` | Log in (sets JWT cookie) |
| `POST /api/auth/logout` | Clear auth cookie |
| `GET /api/auth/me` | Get current user profile |
| `GET /api/stocks/search?q=` | Search tickers (Yahoo Finance) |
| `GET /api/stocks/quote/:ticker` | Stock summary + financials |
| `GET /api/stocks/history/:ticker` | Price history (candles) |
| `GET /api/stocks/fundamentals/:ticker` | Income statement, balance sheet, cash flow |
| `GET /api/stocks/earnings/:ticker` | Earnings history |
| `GET /api/stocks/comparables/:ticker` | Peer sector comparison |
| `GET /api/stocks/insider/:ticker` | SEC Form 4 filings |
| `GET /api/portfolio` | Get user's portfolio/wishlist |
| `POST /api/portfolio/add` | Add ticker to portfolio or wishlist |
| `DELETE /api/portfolio/:id` | Remove ticker |
| `GET /api/portfolio/live` | Live prices for user's tickers |
| `GET /api/dcf/:ticker` | DCF/DDM/RIM valuation |
| `GET /api/valuation/ai/:ticker` | AI cross-validation (Gemini) |
| `GET /api/valuation/debate/:ticker` | AI debate (SSE streaming) |
| `GET /api/options/iv/:ticker` | Current IV + history |
| `GET /api/options/historical-iv/:ticker` | Historical IV data |
| `GET /api/options/scan/:ticker` | Options scan (SVI, GEX, edge) |
| `GET /api/market/status` | Current market session |
| `GET /api/indicators` | All macro indicators |
| `GET /api/margin-debt` | FINRA margin debt |
| `GET /api/fred/*` | FRED economic data |
| `GET /api/sectors` | Sector rotation scores |
| `GET /api/cache/stats` | Cache statistics (admin) |
| `POST /api/cache/flush` | Flush caches (admin) |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open source and available under the MIT License.
