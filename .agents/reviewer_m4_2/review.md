# Review Report — Guru Tracker Frontend Implementation

## Review Summary

**Verdict**: REQUEST_CHANGES

The Guru Tracker frontend implementation in Milestone 4 has correct page routing, design compliance (no Tailwind CSS, inline styles utilizing CSS custom properties), and builds successfully. The hook test suite also passes. 

However, there are critical runtime correctness bugs in the components (`GurusTab.jsx` and `GuruDetail.jsx`) that cause immediate application crashes when a user interacts with Curated Investors or attempts to modify the wishlist, and prevent ownership badges from displaying.

---

## Findings

### [Critical] Finding 1: ReferenceError when clicking Curated Investors

- **What**: Click event handler calls an undefined function `selectGuru`.
- **Where**: `frontend/src/components/GurusTab.jsx` line 173:
  ```javascript
  onClick={() => selectGuru(g.id)}
  ```
- **Why**: When a user clicks on any curated investor card, the application crashes immediately with `ReferenceError: selectGuru is not defined` because the function is not imported, defined locally, or received as a prop.
- **Suggestion**: Replace `selectGuru(g.id)` with `setSelectedGuruId(g.id)`.

### [Critical] Finding 2: TypeError when removing item from wishlist

- **What**: Click event handler calls `onRemoveFromWishlist` which is `undefined`.
- **Where**: `frontend/src/components/GuruDetail.jsx` line 187 (called via `handleWishlistToggle` line 176).
- **Why**: The prop `onRemoveFromWishlist` is destructured and used in `GuruDetail.jsx`, but the parent component `<GurusTab>` fails to pass it. In `GurusTab.jsx`, `<GuruDetail>` is rendered as:
  ```javascript
  <GuruDetail
    guru={selectedGuru}
    gurus={gurus}
    userRole={user?.role}
    onBack={() => setSelectedGuruId(null)}
    onSelectTicker={setSelectedTicker}
    wishlistTickers={wishlistTickers}
    onAddToWishlist={addToWishlist}
    onSelectGuru={setSelectedGuruId}
  />
  ```
  Attempting to toggle off a wishlisted item in the holdings table throws a `TypeError: onRemoveFromWishlist is not a function`.
- **Suggestion**: Pass `onRemoveFromWishlist={removeFromWishlist}` to `<GuruDetail>` inside `GurusTab.jsx`.

### [Major] Finding 3: Missing `portfolio` prop breaks holdings ownership badges

- **What**: User ownership badges ("Owned", "Watched") are never shown in the holdings table.
- **Where**: `frontend/src/components/GuruDetail.jsx` line 166 (within `getTickerIndicator`) and `frontend/src/components/GurusTab.jsx`.
- **Why**: `GuruDetail.jsx` destructures `portfolio` from its props and runs `portfolio?.find(...)` to determine if the user owns/watches a stock. However, `portfolio` is never passed to `<GuruDetail>` by `<GurusTab>`, and `<GurusTab>` itself does not receive it from `<App>`. In `App.jsx`, `portfolio` is returned by `usePortfolioItems` but not destructured or forwarded.
- **Suggestion**:
  1. Destructure `portfolio` from `usePortfolioItems` in `App.jsx`.
  2. Pass `portfolio={portfolio}` to `<GurusTab>` in `App.jsx`.
  3. Destructure `portfolio` in `GurusTab` and pass it to `<GuruDetail>`.

---

## Verified Claims

- **Claim**: Build succeeds (`npm run build`) → **Verified** via command execution → **PASS**
- **Claim**: Tests pass (`npm test -- --run`) → **Verified** via command execution → **PASS** (Note: components themselves are not tested)
- **Claim**: No Tailwind CSS used and style guide followed → **Verified** via code review of modified components → **PASS**
- **Claim**: Routing and URL state synchronization works → **Verified** via code review of `App.jsx` → **PASS**
- **Claim**: Wishlist 20-item limit is enforced → **Verified** via code review of `GuruDetail.jsx` → **PASS**
- **Claim**: Release notes entry is added → **Verified** via code review of `release-notes.html` → **PASS**

---

## Coverage Gaps

- **Component test coverage** — **Risk level**: HIGH — **Recommendation**: The test suite only checks the React hooks (`useGuruData.e2e.test.js` and `useLivePrices.test.js`). None of the newly introduced React components have unit or integration tests, allowing major interactive crashes to pass unnoticed. We strongly recommend writing unit tests for `GurusTab` and `GuruDetail` using React Testing Library or Vitest component tests.

---

## Unverified Items

- **Actual backend synchronization behavior for guest users** — **Reason**: The API is mocked in the test suite and requires a running server environment with authentication to test manually. (Accepted risk: minor, since backend constraints are handled).
