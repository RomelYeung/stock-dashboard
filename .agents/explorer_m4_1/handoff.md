# Handoff Report - explorer_m4_1

## 1. Observation
* **Routing setup**: In `frontend/src/App.jsx`, routing is implemented manually using custom react state synced with search parameters.
  * Line 28: `const [currentPage, setCurrentPage] = useState("portfolio");`
  * Lines 51-59 (Initialization):
    ```javascript
    useEffect(() => {
      const params = new URLSearchParams(window.location.search);
      const page = params.get("page") || "portfolio";
      const ticker = params.get("ticker");
      if (["portfolio", "indicators", "stock", "admin"].includes(page)) {
        setCurrentPage(page);
      }
      if (ticker) setSelectedTicker(ticker);
    }, []);
    ```
  * Lines 62-77 (Sync to URL):
    ```javascript
    useEffect(() => {
      const url = new URL(window.location);
      if (currentPage === "portfolio") {
        url.searchParams.delete("page");
        url.searchParams.delete("ticker");
      } else if (currentPage === "stock" && selectedTicker) {
        url.searchParams.set("page", "stock");
        url.searchParams.set("ticker", selectedTicker);
      } else if (currentPage === "indicators") {
        url.searchParams.set("page", "indicators");
      } else if (currentPage === "admin") {
        url.searchParams.set("page", "admin");
        url.searchParams.delete("ticker");
      }
      history.pushState({ currentPage, selectedTicker }, "", url);
    }, [currentPage, selectedTicker]);
    ```
  * Lines 80-89 (Sync from URL):
    ```javascript
    useEffect(() => {
      const handler = () => {
        const params = new URLSearchParams(window.location.search);
        const page = params.get("page") || "portfolio";
        setCurrentPage(page);
        setSelectedTicker(params.get("ticker"));
      };
      window.addEventListener("popstate", handler);
      return () => window.removeEventListener("popstate", handler);
    }, []);
    ```
* **Providers setup**: In `frontend/src/main.jsx`, the app is wrapped in strict mode, error boundary, react-query provider, and custom auth context.
  * Lines 29-39:
    ```javascript
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
* **Detail Modal & Analysis Page structure**:
  * In `frontend/src/components/StockDetailModal.jsx` (lines 45-97), the valuation teaser button switches the route to full analysis:
    ```javascript
    onClick={onOpenAnalysis}
    ```
  * In `frontend/src/components/StockAnalysisPage.jsx` (line 12), tabs are defined via:
    ```javascript
    const TABS = ["Valuation & AI", "Fundamentals", "Earnings", "News", "Options Scanner", "Insider Activity"];
    ```
* **Watchlist & Portfolio custom hooks**: In `frontend/src/hooks/useStockData.js`, custom hooks retrieve data:
  * Line 404: `export function usePortfolioItems(userId)`
  * Line 28: `export function usePortfolio(tickers)`
  * Line 73: `export function useLivePrices(tickers)`
* **CSS & Styling structure**:
  * In `frontend/src/styles/index.css`, `:root` colors, layout, and font variables are declared. There are no `@tailwind` directives.
  * In `frontend/src/components/InsiderTradingTab.jsx` (lines 36-44), local CSS styling is structured as plain JS objects:
    ```javascript
    const gauge = {
      wrap: { display: "flex", ... },
      ...
    };
    ```
* **Testing execution**: In `frontend/package.json`, Vitest is configured. Running `npm test -- --run` runs 2 test files, passing all 32 tests (which includes 30 tests in `useGuruData.e2e.test.js` verifying the state machine/simulator for Guru Tracker features).

## 2. Logic Chain
1. We examined `App.jsx` and found that navigation relies on custom react state synced to URL search parameters without `react-router-dom`.
2. We examined `main.jsx` and found the core ReactQuery and Auth contexts wrapped around the root component.
3. We checked `StockDetailModal.jsx` and `StockAnalysisPage.jsx` and established that details are loaded in tab groups. The tabs are hardcoded in a `TABS` array. Consequently, integrating a "Guru Ownership" view is best achieved by adding a tab name to `TABS` and rendering a corresponding subcomponent.
4. We checked `useStockData.js` and confirmed it holds all backend query logic via `useQuery` hooks. Therefore, any new hooks for fetching Guru data should either be appended to this file or placed in a dedicated file (like `useGuruData.js`).
5. We examined `index.css` and individual component styles and confirmed the styling follows raw inline CSS objects referencing CSS variables, avoiding Tailwind CSS completely.
6. We confirmed the testing setup uses Vitest, runs via `npm test`, and that a detailed simulator test for Guru features (`useGuruData.e2e.test.js`) is already present.

## 3. Caveats
* The investigation is read-only.
* We have not implemented any React components or routing views, but the backend routes `/api/gurus/*` have already been verified in code (`backend/routes/gurus.js`).

## 4. Conclusion
* The frontend codebase is well-organized, relying on React Query for API data, custom inline styling, and a custom state/URL syncing mechanism for routing.
* Integrating the Guru Tracker base views in Milestone 4 requires extending the current state-based routing/tabs (or creating a dedicated Guru Tracker page alongside Portfolio and Indicators) and utilizing standard inline CSS styling patterns.

## 5. Verification Method
1. Inspect the analysis report at `/Users/yanchimyeung/Projects/stock-dashboard/.agents/explorer_m4_1/analysis.md` to verify all codebase queries match these findings.
2. Execute the test command `npm test -- --run` in the `frontend` folder to verify that existing vitest tests are correct and pass successfully.
