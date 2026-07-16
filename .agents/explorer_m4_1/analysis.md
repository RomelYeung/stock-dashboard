# Frontend Codebase Investigation Report: Milestone 4 Prep

This report documents the structure, routing, providers, styling, hooks, and tests in the `stock-dashboard` frontend codebase to prepare for Milestone 4 (Frontend Routing & Base Views for Guru Tracker).

---

## 1. Routing and Navigation
* **Mechanism**: Custom state-based tab routing, synchronized with URL search/query parameters.
* **Relevant File**: `frontend/src/App.jsx`
* **Details**:
  * No external routing library (such as `react-router-dom`) is utilized.
  * Pages are managed via standard React state: `const [currentPage, setCurrentPage] = useState("portfolio")`.
  * Navigation is synced to the URL using a combination of `useEffect` hooks:
    1. **Initialization**: Mount effect reads URL parameters: `const page = params.get("page") || "portfolio"; const ticker = params.get("ticker");` and sets state accordingly.
    2. **State to URL**: A reactive effect pushes history states on page/ticker modifications: `history.pushState({ currentPage, selectedTicker }, "", url)`.
    3. **Browser Back/Forward**: A `popstate` event listener updates state when user navigates using browser history.
  * Pages are conditionally rendered inside the `<main>` tag:
    * `currentPage === "portfolio"`: Portfolio manager grid view.
    * `currentPage === "indicators"`: Market indicators view.
    * `currentPage === "stock" && selectedTicker`: Stock full analysis view (`StockAnalysisPage`).
    * `currentPage === "admin"`: Admin panel.

---

## 2. Providers and Global Context
* **Relevant File**: `frontend/src/main.jsx`
* **Root Configuration**:
  ```jsx
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
  ```
* **Details**:
  * **Sentry**: Initialized at the top of `main.jsx` for client error tracing.
  * **ErrorBoundary**: Custom wrapper from `./components/ErrorBoundary` to catch rendering exceptions.
  * **QueryClientProvider**: Wraps application queries utilizing `@tanstack/react-query`. Default configuration enforces a `staleTime` of 24 hours, `gcTime` of 1 hour, and disables window focus refetching.
  * **AuthProvider**: Provides user credentials and session context via custom hook `useAuth()`.

---

## 3. Stock Detail Rendering & Guru Tracker Integration
* **Relevant Files**:
  * `frontend/src/components/StockDetailModal.jsx`
  * `frontend/src/components/StockAnalysisPage.jsx`
* **Details**:
  * **Detail Modal**: Opens from the portfolio/watchlist grid, rendering a stock summary, price details, and a dynamic `TradingViewChart` widget. It includes an "Open Full Analysis →" teaser button that changes color/text based on the DCF valuation status (e.g. UNDERVALUED/OVERVALUED). Clicking this button invokes `onOpenAnalysis`, switching the parent page route to `"stock"`.
  * **Full Analysis Page**: Managed via `StockAnalysisPage`. It renders a header with current price details and an inline tab bar (`TabBar`) representing specific categories:
    ```javascript
    const TABS = ["Valuation & AI", "Fundamentals", "Earnings", "News", "Options Scanner", "Insider Activity"];
    ```
  * **Integration Path for Guru Ownership**:
    To embed "Guru Ownership" or activity data within a stock's detail view, we can expand `StockAnalysisPage` by:
    1. Appending `"Guru Ownership"` (or similar) to the `TABS` array.
    2. Conditionally rendering a new component (e.g., `<GuruOwnershipTab ticker={ticker} />`) when that tab is active.
    3. Utilizing the existing backend endpoint `GET /api/gurus/ticker/:ticker` (reverse holdings lookup) to populate this view.

---

## 4. Portfolio and Watchlist Access
* **Relevant File**: `frontend/src/hooks/useStockData.js`
* **Key Hooks**:
  * **`usePortfolioItems(userId)`**: Fetches the authenticated user's portfolio and wishlist records from `/api/portfolio`. Exposes parsed lists (`portfolio`, `wishlist`), extracted ticker strings (`tickers`, `wishlistTickers`), loading states, and mutation functions to modify these items:
    * `addToWatchlist(ticker)`
    * `removeFromWatchlist(ticker)`
    * `addToWishlist(ticker)`
    * `removeFromWishlist(ticker)`
  * **`usePortfolio(tickers)`**: Fetches high-level summary cards (fundamentals, valuation status) for a list of tickers from `/api/stocks/portfolio` (POST).
  * **`useLivePrices(tickers)`**: Handles polling of `/api/stocks/portfolio/live` (POST) to update current prices every 5 seconds when the market is open, backing off automatically if failures/rate limits are hit.

---

## 5. CSS & Styling Architecture
* **Relevant File**: `frontend/src/styles/index.css`
* **Details**:
  * **No Tailwind CSS**: Tailwind is not present in the dependencies or configuration.
  * **CSS Custom Properties**: Broadly defined in `:root` inside `index.css`, establishing standard color palettes (e.g., `--bg-base: #05080f`, `--accent-green: #00e5a0`, `--accent-blue: #4f8dff`, `--text-primary: #e8edf5`), font families (`--font-display`, `--font-mono`, `--font-body`), spacing sizes, and animation intervals.
  * **Component Styles**: Defined primarily as local camelCase JS objects within each component file (e.g. `const styles = { ... }`), applied directly using React inline styling: `style={styles.container}`.
  * **Complex/Global styles**: Styled classes (like `.stat-box-modern`, `.section-label`, and scrollbar styles) are written directly in `index.css`.
  * **Responsive design**: Uses CSS Container Queries (e.g. `@container fundamentals (min-width: 600px)`) rather than traditional media queries, enabling components to adapt size based on their parents.

---

## 6. Testing Framework and Configuration
* **Test Tooling**: Vitest (`vitest` version `^1.6.1`).
* **Test Execution**: Configured in `package.json` under script `"test": "vitest"`. Runs relative to Vite config in `vite.config.js`.
* **Existing Tests**:
  * `frontend/src/hooks/__tests__/useLivePrices.test.js`: Validates helper function logic.
  * `frontend/src/hooks/__tests__/useGuruData.e2e.test.js`: A comprehensive 30-case test suite that emulates a pure JavaScript state machine/simulator (`GuruDataHookSimulator`) checking all required Guru tracker UI behaviors (filters, overlap heatmaps, CIK syncs, upgrade wall, etc.). This simulator acts as an executable specification of features to be implemented.

---

## 7. Hooks & Components Code Patterns
* **Components**: Structured as memoized functional components (often using `export default memo(...)` or standard exports).
* **Styling**: Styles are co-located in the same file as the component using inline styling objects, which references CSS variables from `:root`.
* **State & Query**: Asynchronous operations are managed using `@tanstack/react-query` via the query client, providing out-of-the-box caching, loading, error states, and manual refetch capabilities.
* **Transitions**: Utilizes `framer-motion` (specifically `motion.div` and `AnimatePresence`) for page transition, modal entrances, and loading spinners.
