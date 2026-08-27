# Frontend Refactoring — App.jsx Decomposition & Routing (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the monolithic `src/App.jsx` (768 lines) into focused, route-driven modules. Extract the inline Portfolio view into `src/pages/PortfolioPage.jsx`, extract the navigation drawer into `src/components/NavigationDrawer.jsx`, replace the manual `URLSearchParams` + `history.pushState` routing with `react-router-dom`, and introduce code splitting via `React.lazy()` + `<Suspense>` at the route level.

**Architecture:** `App.jsx` becomes a thin shell: it owns the auth gate, the persistent layout (header + drawer + ambient orbs), and the `<Routes>` declaration. Each top-level view becomes a lazily-loaded page. The drawer is a controlled, self-contained component driven by `react-router` navigation (`useNavigate` / `useLocation`) instead of local `currentPage` state. URL state for `ticker` and `guruId` is preserved via route params / search params, keeping deep-linkable URLs working.

**Tech Stack:** React 18, `react-router-dom` v6 (to be added to `package.json`), `framer-motion` (already present) for drawer animation, `React.lazy`/`Suspense` (built-in), Vite (already configured — code splitting happens automatically via dynamic `import()`).

---

## Current State (Audit)

| Concern | Current location | Notes |
|---------|------------------|-------|
| Auth gate (`authLoading`, `!user`) | `App.jsx` lines 135–150 | Returns `<LoginPage />` when no user |
| Drawer markup + nav logic | `App.jsx` lines 163–260 | Inline `AnimatePresence` + `motion.div`, reads `currentPage`, calls `setCurrentPage` |
| Header (hamburger + logo + `MarketSessionBadge`) | `App.jsx` lines 263–286 | Hamburger toggles `isDrawerOpen` |
| Portfolio view (inline) | `App.jsx` lines 289–362 | Watch List + Wish List grids, `StockCard`, `ListSectionHeader` |
| `indicators` / `gurus` / `stock` / `admin` branches | `App.jsx` lines 364–411 | Conditional `{currentPage === "x" && ...}` |
| Detail modal (`StockDetailModal`) | `App.jsx` lines 416–427 | Shown when `selectedTicker && currentPage !== "stock"` |
| URL sync (read/write/popstate) | `App.jsx` lines 60–115 | Manual `URLSearchParams` + `history.pushState` + `popstate` |
| Market status polling | `App.jsx` lines 52–58 | 60s interval |
| Portfolio data hooks | `App.jsx` lines 21–40 | `usePortfolioItems`, `usePortfolio`, `useLivePrices` |

**Existing page/component signatures (must be preserved):**
- `LoginPage()` — no props
- `MarketIndicatorsPage()` — no props
- `AdminDashboard()` — no props
- `StockAnalysisPage({ ticker, livePriceData, onBack })` — `onBack` currently calls `handleBackFromAnalysis`
- `GurusTab({ user, tickers, wishlistTickers, addToWishlist, removeFromWishlist, selectedGuruId, setSelectedGuruId, setSelectedTicker, portfolio })`

**New pages referenced in the task but not yet existing as `src/pages/*`:** `AdviserPage`, `GuruPage`, `SecPage`. These are referenced by the routing task; see "Open Questions / Assumptions" — the spec routes to them but the actual page bodies are out of scope for this decomposition (they may wrap existing components or be stubs).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/package.json` | Modify | Add `react-router-dom` dependency |
| `frontend/src/main.jsx` | Modify | Wrap `<App />` in `<BrowserRouter>` (or `<HashRouter>` — see assumption A2) |
| `frontend/src/App.jsx` | Rewrite | Thin shell: auth gate, layout, `<Routes>`, Suspense fallback |
| `frontend/src/components/NavigationDrawer.jsx` | Create | Extracted drawer (logo, nav items, user footer, logout) |
| `frontend/src/pages/PortfolioPage.jsx` | Create | Extracted inline Portfolio view |
| `frontend/src/pages/IndicatorsPage.jsx` | Create | Thin wrapper re-exporting `MarketIndicatorsPage` (or lazy-import directly) |
| `frontend/src/pages/GurusPage.jsx` | Create | Wrapper that supplies `GurusTab` its required props from hooks/context |
| `frontend/src/pages/StockAnalysisPage.jsx` | Create | Re-export of existing `components/StockAnalysisPage` OR route wrapper reading `:ticker` param |
| `frontend/src/pages/AdminPage.jsx` | Create | Wrapper re-exporting `AdminDashboard` + ADMIN role guard |
| `frontend/src/pages/AdviserPage.jsx` | Create | New route target (see assumption A3) |
| `frontend/src/pages/GuruPage.jsx` | Create | New route target (see assumption A3) |
| `frontend/src/pages/SecPage.jsx` | Create | New route target (see assumption A3) |
| `frontend/src/pages/LoginPage.jsx` | Create (move) | Move `components/LoginPage.jsx` → `pages/LoginPage.jsx` (keep old re-export or update import) |

> Note: `components/LoginPage.jsx` currently lives in `components/`. The task lists `LoginPage` among lazy pages. Decision: relocate to `pages/LoginPage.jsx` and update the `App.jsx` import. Keep a thin re-export at `components/LoginPage.jsx` only if other files import it (grep shows only `App.jsx` imports it — safe to move).

---

## Routing Design

### Route table

| Path | Element (lazy) | Source component |
|------|----------------|------------------|
| `/` | `PortfolioPage` | extracted inline view |
| `/indicators` | `IndicatorsPage` | `MarketIndicatorsPage` |
| `/gurus` | `GurusPage` | `GurusTab` |
| `/gurus/:guruId` | `GurusPage` | `GurusTab` (reads `:guruId`) |
| `/stock/:ticker` | `StockAnalysisPage` | `components/StockAnalysisPage` |
| `/admin` | `AdminPage` | `AdminDashboard` (ADMIN guard) |
| `/adviser` | `AdviserPage` | new |
| `/sec` | `SecPage` | new |
| `/login` | `LoginPage` | `components/LoginPage` |
| `*` | redirect to `/` | `<Navigate to="/" />` |

### URL-state preservation (replaces manual `URLSearchParams`)
- **Ticker deep link:** `/stock/:ticker` (was `?page=stock&ticker=AAA`). `StockAnalysisPage` reads `useParams().ticker`.
- **Guru deep link:** `/gurus/:guruId` (was `?page=gurus&guruId=123`). `GurusPage` reads `useParams().guruId`.
- **Back navigation:** `StockAnalysisPage`'s `onBack` becomes `() => navigate(-1)` (or `navigate("/")`), replacing `handleBackFromAnalysis`.
- **Browser back/forward:** handled natively by `react-router` — the manual `popstate` listener (lines 105–115) is deleted.
- **Initial load:** `react-router` reads the URL directly; the "Initialize from URL" effect (lines 61–71) is deleted.

### Drawer navigation (replaces `setCurrentPage`)
- `NavigationDrawer` uses `useNavigate()` + `useLocation()` instead of receiving `currentPage`/`setCurrentPage` props.
- Active item derived from `useLocation().pathname` (e.g. `pathname.startsWith("/gurus")`).
- Clicking an item calls `navigate("/gurus")` and closes the drawer.
- Admin item rendered conditionally on `user?.role === "ADMIN"` (drawer receives `user` + `logout` as props, or reads `useAuth()` itself — see assumption A1).

---

## Code Splitting Design

In `App.jsx`, declare lazy pages:

```jsx
const PortfolioPage = React.lazy(() => import("./pages/PortfolioPage"));
const IndicatorsPage = React.lazy(() => import("./pages/IndicatorsPage"));
const GurusPage = React.lazy(() => import("./pages/GurusPage"));
const StockAnalysisPage = React.lazy(() => import("./pages/StockAnalysisPage"));
const AdminPage = React.lazy(() => import("./pages/AdminPage"));
const AdviserPage = React.lazy(() => import("./pages/AdviserPage"));
const GuruPage = React.lazy(() => import("./pages/GuruPage"));
const SecPage = React.lazy(() => import("./pages/SecPage"));
const LoginPage = React.lazy(() => import("./pages/LoginPage"));
```

Wrap the `<Routes>` in a single `<Suspense fallback={<PageLoader />}>` (reuse the existing `loadingScreen`/`loadingSpinner` styles). Vite automatically emits a separate chunk per dynamic `import()`, achieving the code-splitting goal.

> The detail modal (`StockDetailModal`) stays in `App.jsx` (or a layout component) because it overlays any page when a ticker is selected from the portfolio grid but the user is not on the stock route. It reads `selectedTicker` from shared state. See "Shared State" below.

---

## Shared State & Props Strategy

The Portfolio view, Gurus view, and the detail modal currently share: `tickers`, `wishlistTickers`, `addToWatchlist`, `removeFromWatchlist`, `addToWishlist`, `removeFromWishlist`, `portfolio`, `mergedData`, `selectedTicker`, `setSelectedTicker`, `period`, `setPeriod`, `liveData`.

Two viable strategies (pick one — see assumption A4):

**Option A — Lift shared state into `App.jsx` and pass as props.**
`App.jsx` (or a `DashboardLayout` component) calls `usePortfolioItems`, `usePortfolio`, `useLivePrices`, owns `selectedTicker`/`period`, and passes them down. Pages become pure presentational components. This mirrors today's data flow most closely and minimizes hook duplication.

**Option B — Pages call hooks directly.**
Each page calls the hooks it needs. `selectedTicker`/`period` for the modal would need to live in context or a small Zustand/Context store so the modal (rendered above `<Routes>`) can read them.

**Recommended: Option A** — keep `App.jsx` (or extracted `DashboardLayout`) as the data owner; pass props to `PortfolioPage` and `GurusPage`. The detail modal is rendered by the layout and reads `selectedTicker`/`period` from the same owner. This avoids introducing new global state and keeps the refactor surgical.

---

## Task Breakdown

### Task 1: Add `react-router-dom`
- [ ] Add `"react-router-dom": "^6.26.0"` to `frontend/package.json` `dependencies`
- [ ] Run `npm install` in `frontend/`
- [ ] Verify no peer-dependency conflicts with React 18

### Task 2: Wrap app in Router (`main.jsx`)
- [ ] Import `BrowserRouter` (or `HashRouter` per A2) from `react-router-dom`
- [ ] Wrap `<AuthProvider>` (or `<App />`) so `useNavigate`/`useLocation` are available inside `App`
- [ ] Keep `ErrorBoundary` + `QueryClientProvider` + `AuthProvider` nesting order intact

### Task 3: Create `NavigationDrawer.jsx`
- [ ] Move drawer markup (lines 166–257) + `drawer-nav-item` CSS (lines 447–504) into the new component
- [ ] Replace `currentPage`/`setCurrentPage` with `useNavigate`/`useLocation`
- [ ] Accept `user`, `logout`, `isOpen`, `onClose` as props (or read `useAuth()` internally — A1)
- [ ] Preserve `AnimatePresence` + `motion.div` animation; backdrop click closes drawer
- [ ] Export the component as default

### Task 4: Create `PortfolioPage.jsx`
- [ ] Move the inline portfolio block (lines 289–362) into the new page
- [ ] Accept props: `tickers`, `wishlistTickers`, `mergedData`, `errors`, `loading`, `data`, `liveData`, `addToWatchlist`, `removeFromWatchlist`, `addToWishlist`, `removeFromWishlist`, `setSelectedTicker`, `period`, `setPeriod`
- [ ] Keep `<ErrorBoundary>` wrapper (or move boundary to `App` route element — see A5)
- [ ] Export default

### Task 5: Create wrapper pages (`IndicatorsPage`, `GurusPage`, `AdminPage`, `StockAnalysisPage`)
- [ ] `IndicatorsPage` → renders `<MarketIndicatorsPage />`
- [ ] `GurusPage` → supplies `GurusTab` props from `usePortfolioItems(user?.id)` + `useAuth()` + `useParams().guruId`; passes `setSelectedTicker` (from layout) and `setSelectedGuruId` (local or layout state)
- [ ] `AdminPage` → ADMIN role guard + `<AdminDashboard />`; non-admin shows existing "Access Denied" block
- [ ] `StockAnalysisPage` (pages) → reads `useParams().ticker`, `liveData[ticker]` (from layout), `onBack={() => navigate(-1)}`; renders `components/StockAnalysisPage`

### Task 6: Create new route pages (`AdviserPage`, `GuruPage`, `SecPage`)
- [ ] Implement minimal page shells (or wrap existing components if they exist — A3)
- [ ] Each default-exports a component suitable for `React.lazy`

### Task 7: Move `LoginPage`
- [ ] Move `components/LoginPage.jsx` → `pages/LoginPage.jsx`
- [ ] Update import in `App.jsx`; confirm no other importers (grep: only `App.jsx`)

### Task 8: Rewrite `App.jsx` as thin shell
- [ ] Keep auth gate (`authLoading` → loader; `!user` → `<LoginPage />` via `<Navigate to="/login" />` or direct render)
- [ ] Keep ambient orbs + `SchwabAuthAlert` + header (hamburger toggles drawer state)
- [ ] Own shared state (`selectedTicker`, `period`, portfolio hooks) — Option A
- [ ] Declare `React.lazy` pages + `<Suspense>` + `<Routes>` per route table
- [ ] Render `StockDetailModal` above `<Routes>` (reads `selectedTicker`/`period` from owner; only when not on `/stock/:ticker`)
- [ ] Delete manual URL sync effects (lines 52–58 market polling may stay; lines 60–115 URL effects deleted)
- [ ] Delete `currentPage`/`previousPage`/`isDrawerOpen`-as-page-state; `isDrawerOpen` remains for drawer toggle only

### Task 9: Verify & wire release note
- [ ] `npm run build` succeeds; confirm separate chunks emitted in `dist/assets`
- [ ] `npm run dev` smoke test: navigate each route, deep-link `/stock/AAPL` and `/gurus/123`, browser back/forward
- [ ] Add release-note entry to `frontend/public/release-notes.html` (feature: "Add client-side routing and code-split pages")

---

## Open Questions / Assumptions

- **A1 — Drawer data source:** Drawer will read `user`/`logout` via `useAuth()` internally (simplest, avoids prop drilling). Fallback: pass as props from `App`.
- **A2 — Router type:** Use `BrowserRouter` (clean URLs). If the app is ever served from a static file host without SPA fallback, switch to `HashRouter`. Current Vite dev server + backend proxy support SPA fallback, so `BrowserRouter` is default.
- **A3 — `AdviserPage` / `GuruPage` / `SecPage` bodies:** The task lists these as lazy route targets but the codebase has no matching top-level components (there is `AIFinancialAdviserChat`, `GuruDetail`/`GurusTab`, and SEC-related tabs inside `StockAnalysisPage`). This spec routes to them and provides minimal shells; fleshing out their real content is a follow-up (likely Phase 3). Flag if they should wrap existing components instead.
- **A4 — Shared state strategy:** Option A (lift to layout, pass props) is recommended and assumed in Tasks 4–5. Switch to Option B only if a global store is desired.
- **A5 — ErrorBoundary placement:** Keep per-route `<ErrorBoundary>` (today's pattern) vs. one boundary in `App`. Keeping per-route preserves current isolation behavior; recommended.

## Risks

- **Deep-link regression:** Old URLs using `?page=stock&ticker=AAPL` will break. Mitigation: add a redirect in `App` that parses legacy query params and `navigate()`s to the new path on first load (optional, low priority).
- **`selectedTicker` modal vs. `/stock/:ticker` route:** Ensure the modal does not render on the stock route (current guard `currentPage !== "stock"` → becomes `!pathname.startsWith("/stock")`).
- **framer-motion `AnimatePresence`** must remain inside the drawer component for exit animations to play.
- **Sentry:** `react-router` navigation does not break Sentry; consider `Sentry.withSentryRouterRouting` only if desired (out of scope).
