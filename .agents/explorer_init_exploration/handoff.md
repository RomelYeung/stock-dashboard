# Handoff Report — Initial Exploration

## 1. Observation
We directly scanned and observed the following properties of the codebase:
- **Backend Entrypoint**: `backend/server.js` (lines 96–101) sets up the API routes:
  ```javascript
  app.use("/api/auth", authRoutes);
  app.use("/api/stocks", stockRoutes);
  app.use("/api/portfolio", portfolioRoutes);
  app.use("/api/options", optionsRoutes);
  app.use("/api/ai", aiRoutes);
  ```
- **Database Schema**: `backend/prisma/schema.prisma` (lines 5–8) defines the SQLite database:
  ```prisma
  datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
  }
  ```
- **Database Models**: Defined in `backend/prisma/schema.prisma` (lines 10–74), comprising `User`, `PortfolioItem`, `WishListItem`, `HistoricalIV`, `ChatSession`, and `ChatMessage`.
- **JWT Auth Middleware**: `backend/middleware/auth.js` (lines 11–13) verifies the cookie:
  ```javascript
  export async function requireAuth(req, res, next) {
    const token = req.cookies?.token;
    if (!token) {
  ```
- **Yahoo Finance Service**: `backend/services/yahoofinance.js` (lines 1–3) imports the library:
  ```javascript
  import * as yfModule from "yahoo-finance2";
  import * as cache from "./cache.js";
  const yahooFinance = new yfModule.default();
  ```
- **Frontend Entrypoint**: `frontend/src/main.jsx` (lines 4–8) sets up the Query client and imports global CSS:
  ```javascript
  import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
  import { AuthProvider } from "./context/AuthContext";
  import App from "./App";
  import ErrorBoundary from "./components/ErrorBoundary";
  import "./styles/index.css";
  ```
- **Frontend Routing**: Custom history URL state sync in `frontend/src/App.jsx` (lines 51–59):
  ```javascript
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const page = params.get("page") || "portfolio";
    ...
  ```
- **Frontend Styles**: `frontend/package.json` contains no tailwind dependencies, and `frontend/src/styles/index.css` defines root CSS custom properties for styling (lines 1–27). Components use local CSS-in-JS style objects referencing these CSS custom properties.
- **Frontend State Management**: `frontend/src/hooks/useStockData.js` uses `@tanstack/react-query`'s `useQuery` for fetching/caching data, and `useLivePrices` implements polling (lines 73–199) with rate limiting backoff.
- **Component Libraries**: `recharts` is imported in `frontend/src/components/Charts.jsx`, `plotly.js-dist-min` is imported in `frontend/src/components/OptionsScannerTab.jsx`, and `framer-motion` is imported in `frontend/src/components/StockDetailModal.jsx`.

---

## 2. Logic Chain
1. By examining `backend/package.json` and `backend/server.js`, we confirmed the backend runs an Express server connecting to standard modular routes and Sentry monitoring.
2. By reviewing `backend/prisma/schema.prisma` and `backend/services/db.js`, we validated that the database layer is managed through Prisma and persists to a local SQLite database (`dev.db`).
3. By checking `backend/middleware/auth.js` and `backend/routes/auth.js`, we established that authentication is cookie-based using JWT tokens stored under the `token` key, and verified on protected endpoints via `requireAuth`.
4. By inspecting `backend/services/yahoofinance.js`, we determined that the market data ingestion layer uses `yahoo-finance2` library calls wrapped in a custom TTL caching layer (`backend/services/cache.js`) consisting of individual memory caches (5s for live price, 24h for prices, 7d for fundamentals).
5. By scanning `frontend/package.json` and `frontend/src/styles/index.css`, we verified the absence of Tailwind CSS, proving the UI relies on vanilla CSS variables combined with React inline CSS-in-JS style objects.
6. By analyzing `frontend/src/App.jsx` and its `useEffect` popstate/pushstate listeners, we deduced the application performs custom conditional page rendering mapped directly to URL search query parameters, avoiding external React router packages.
7. By reading `frontend/src/hooks/useStockData.js` and component files, we proved that TanStack query is the primary server-state caching solution, and that polling updates are controlled via custom hooks with robust rate-limiting and error-backoff protections.
8. By looking at component imports, we confirmed Recharts, Plotly, and Framer Motion are used for rendering visual components, charts, and animations.

---

## 3. Caveats
- We did not run the server locally to check active network endpoints, since we operate in a read-only explorer subagent context.
- We assumed the configuration file values shown in `.env.example` represent the setup expected in the active environment.
- We did not investigate third-party auth setups beyond the standard email/password registration and Schwab OAuth framework code blocks.

---

## 4. Conclusion
The codebase is clean, compact, and follows a custom minimalist design (simplicity first). The frontend manages styling via native CSS variables combined with component-level CSS-in-JS, routing via URL query parameters sync, and server data synchronization using TanStack React Query and polling hooks. The backend utilizes Express, SQLite, and Prisma, leveraging yahoo-finance2 and FRED services for financial and economic market intelligence.

---

## 5. Verification Method
- **Backend Tests**: Verify the backend is functional by running:
  ```bash
  cd backend && npm install && npm run test
  ```
- **Frontend Tests**: Verify the frontend test cases are functional by running:
  ```bash
  cd frontend && npm install && npm run test
  ```
- **Inspection**: Re-inspect `backend/prisma/schema.prisma` and `frontend/src/App.jsx` to independently verify the database design and custom routing mechanisms reported.
