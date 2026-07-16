# Milestone 4 Guru Tracker Frontend Review Report

## Review Summary

**Verdict**: REQUEST_CHANGES

The Guru Tracker frontend implementation introduces a solid grid layout, interactive combined activity feeds, and details tabs with clean visualizations (HHI scores, sector pie charts, overlap heatmaps). However, there are multiple critical integration bugs that crash the application at runtime or break features entirely. The overall build (`npm run build`) and test suite (`npm test -- --run`) passed, but this is because the existing tests rely on a simulated pure-JS hook model and do not execute the React component event handlers or prop validation.

---

## Findings

### [Critical] Finding 1: ReferenceError on Investor Card Click

- **What**: The curated investor grid items call `selectGuru(g.id)` on click, which is not defined in the component.
- **Where**: `frontend/src/components/GurusTab.jsx` (line 173)
- **Why**: When a user clicks on an investor card to view details, a runtime `ReferenceError: selectGuru is not defined` is thrown, crashing the application UI.
- **Suggestion**: Change `onClick={() => selectGuru(g.id)}` to `onClick={() => setSelectedGuruId(g.id)}` as `setSelectedGuruId` is the prop passed from `App.jsx`.

### [Major] Finding 2: Missing `portfolio` Prop in GuruDetail

- **What**: The `<GuruDetail>` component expects the `portfolio` prop to determine user holdings/watchlist tracking indicators, but `GurusTab` does not pass it.
- **Where**: `frontend/src/components/GurusTab.jsx` (lines 70-80)
- **Why**: Because `portfolio` is `undefined`, the user ownership badges (`Owned`, `Watched`) in the holdings table never render.
- **Suggestion**: 
  1. Pass the `portfolio` object (retrieved from `usePortfolioItems(user?.id)`) from `App.jsx` to `<GurusTab>`.
  2. Pass it down to `<GuruDetail portfolio={portfolio}>` inside `GurusTab.jsx`.

### [Major] Finding 3: TypeError on Wishlist Item Removal

- **What**: The `<GuruDetail>` component expects `onRemoveFromWishlist` as a prop to handle toggling/removal of a stock, but it is not passed from `GurusTab`.
- **Where**: `frontend/src/components/GurusTab.jsx` (lines 70-80)
- **Why**: Clicking on a wishlisted stock's button ("★ Wishlisted") in the holdings table attempts to remove it from the wishlist, throwing `TypeError: onRemoveFromWishlist is not a function` at runtime and crashing the app.
- **Suggestion**: Pass `onRemoveFromWishlist={removeFromWishlist}` to `<GuruDetail>` inside `GurusTab.jsx`.

### [Minor] Finding 4: Ineffective CSS-in-JS Pseudo-selectors in Inline Styles

- **What**: The inline style definition `styles.th` contains a `":hover"` pseudo-selector.
- **Where**: `frontend/src/components/GuruDetail.jsx` (line 880)
- **Why**: React inline style attributes translate directly to CSS inline properties, which do not support pseudo-classes like `:hover`. As a result, the table header hover color changes do not work.
- **Suggestion**: Use standard CSS class names (in `index.css`) or standard JS state handlers (`onMouseEnter`/`onMouseLeave`) to apply hover styling.

---

## Verified Claims

- **Vite Production Build** → verified via `npm run build` → **PASS** (completed successfully in 9.73s).
- **Vitest Suite** → verified via `npm test -- --run` → **PASS** (32 tests in 2 suites passed).
- **No Tailwind CSS introduced** → verified via `grep_search` on `className` in modified components → **PASS** (all styles use inline objects and CSS custom variables).
- **Release Notes entry conforms to style guide** → verified via inspecting `release-notes.html` → **PASS** (contains correct June 20, 2026 dates, Feature tags, and imperative headlines).
- **20-Wishlist limit checked** → verified via inspecting `GuruDetail.jsx` (line 193) → **PASS** (returns alert toast and halts mutation if wishlist exceeds 20).

---

## Coverage Gaps

- **Component Integration Tests** — risk level: **MEDIUM** — recommendation: **INVESTIGATE**. The test suite tests the simulated state hooks (`useGuruData.e2e.test.js`) but lacks unit/integration tests for actual component rendering (e.g. testing `GurusTab` and `GuruDetail` with React Testing Library). This is how the undefined function calls and missing props slipped through.

---

## Unverified Items

- None. All requirements and codepaths in the scope have been thoroughly verified.

---

# Adversarial Challenge Report

## Challenge Summary

**Overall risk assessment**: MEDIUM

While the application code is robust against unauthorized API calls (e.g. guest role verification guarding history and AI summary calls) and validates inputs (such as CIK formats), the component communication and prop distribution layer is highly fragile due to lack of type checking or integration tests.

## Challenges

### [High] Challenge 1: Double-Click Race Condition on Wishlist Limits
- **Assumption challenged**: User cannot add more than 20 wishlist items.
- **Attack scenario**: The button `onClick={() => handleWishlistToggle(h.ticker)}` does not disable itself or set a loading state during the async `onAddToWishlist` request. If a user has 19 items and double-clicks the "Add Wishlist" button on two different tickers concurrently, both `wishlistTickers.length >= 20` checks can evaluate to false before either network request completes.
- **Blast radius**: The user bypasses the 20-item wishlist limit constraint.
- **Mitigation**: Introduce a local mutating/saving state or disable buttons while a wishlist transaction is pending.

### [Medium] Challenge 2: Search Input Performance / API Hammering
- **Assumption challenged**: Querying reverse holdings for tickers is safe.
- **Attack scenario**: Typing a ticker search triggers `useGuruReverseLookup`. If a user types very fast or holds down backspace, it sends multiple query requests. Although React Query caches by key, it still triggers multiple fetch requests during the initial type.
- **Blast radius**: High client-to-server load, potentially rate-limiting the client.
- **Mitigation**: Debounce the `searchQuery` state before passing it to `useGuruReverseLookup`.
