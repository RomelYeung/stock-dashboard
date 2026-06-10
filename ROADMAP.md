# Roadmap

> Last updated: June 2026

---

## Completed — Sprints 1–3 & Core Systems

The foundational infrastructure and major feature pillars are built and shipped.

### Authentication & Data Persistence
- JWT auth with HttpOnly cookies and bcryptjs
- Role-based access control (RBAC) with admin role
- SQLite database via Prisma ORM
- Portfolio and wishlist persisted to DB (migrated from localStorage)

### Live Market Data
- Real-time price polling with 429 handling and retry logic
- Yahoo Finance integration (fundamentals, financials, balance sheet)
- Schwab API integration (quotes, option chains, price history)
- Data freshness indicators and cache TTL management

### Valuation & Analysis
- Sector-aware DCF model with interactive WACC/growth sliders
- Monte Carlo simulation with histogram visualization
- Gordon Growth (DDM) and Residual Income (RIM) models
- RenTech quantitative checks
- TradingView charting integration

### Options & Derivatives
- Options chain scanner with Greeks
- Historical implied volatility worker (daily cron)
- IV Rank (IVR) and IV Percentile (IVP) calculations

### AI-Powered Intelligence
- AI Debate Committee (Warren Buffett, Benjamin Graham, Peter Lynch, RenTech personas)
- Live streaming debate via Server-Sent Events (SSE)
- Behavioral Finance Analyst agent
- AI-powered news digest with sentiment scoring

### Insider Trading Signals
- SEC EDGAR Form 4 filing ingestion
- Buy-weighted scoring algorithm with role multipliers and time decay
- Signal gauge, textual summary, and transaction table UI

### Macro Indicators
- FRED API (GDP, inflation, yield curves, margin debt)
- AAII Sentiment Survey
- FINRA margin debt data
- Sector rotation analysis

### Production Infrastructure
- Sentry error tracking (frontend + backend)
- Structured logging with Pino
- Zod schema validation middleware
- Admin dashboard with cache management
- Nodemon for development

---

## Current Focus — Sprint 4 Polish & Earnings Insights

### Earnings Call Intelligence
- [ ] **Earnings Call Transcripts & Summaries**: Integrate transcript data with AI-generated summaries of key takeaways, management guidance, and analyst Q&A highlights
- [ ] **Earnings Surprise Analysis Dashboard**: Visualize historical beat/miss patterns over time with trend charts and consensus vs. actual comparisons
- [ ] **Forward Guidance Tracker**: Track and display management's forward guidance from earnings calls vs. actual results in subsequent quarters

### Sentiment & Scoring
- [ ] **Earnings Sentiment Scoring**: Auto-score earnings sentiment (bullish/bearish/neutral) based on report language, guidance tone, and analyst reactions
- [ ] **Peer Earnings Comparison**: Side-by-side earnings performance comparison against sector peers on earnings release dates

### Calendar & Notifications
- [ ] **Earnings Calendar with Notifications**: Enhanced calendar with push/email notifications for held stocks, plus pre-earnings analyst estimate revisions

### UX Polish
- [ ] Performance optimization: lazy-load tab data, code-split heavy components
- [ ] Prefetch tab data on mount and hover for instant switching
- [ ] Empty states and onboarding flows for new users
- [ ] Data freshness badges on all data sources
- [ ] Mobile responsiveness refinements

---

## Backlog — Future Considerations

Lower-priority items for when capacity allows.

### Notifications & Alerts
- [ ] Price alerts with browser notifications
- [ ] Portfolio threshold alerts (e.g., drop > 5%)

### Export & Reporting
- [ ] PDF report generation (portfolio snapshot + analysis)
- [ ] CSV export for portfolio data

### Accessibility & UX
- [ ] WCAG AA accessibility compliance
- [ ] Keyboard shortcuts (Cmd+K command palette)
- [ ] Dark/light theme toggle

### Portfolio Analytics
- [ ] Portfolio performance tracking (returns, Sharpe, drawdown)
- [ ] Historical performance charting

### Data & Integration
- [ ] Real-time WebSocket price updates (upgrade from polling)
- [ ] News integration from additional sources
- [ ] Improved search and discovery

---

*This roadmap is a living document. Priorities shift based on user feedback and technical constraints.*
