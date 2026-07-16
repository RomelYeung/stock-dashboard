# Changes Log - worker_m4_2

## 2026-06-20

### Fixes and Integration

1. **`frontend/src/App.jsx`**:
   - Destructured `portfolio` from the return value of the `usePortfolioItems(user?.id)` hook call.
   - Passed the destructured `portfolio` array as a prop to `<GurusTab ... />`.
   
2. **`frontend/src/components/GurusTab.jsx`**:
   - Destructured `portfolio` from its component props.
   - Replaced the call to the undefined `selectGuru(g.id)` with the correct state setter `setSelectedGuruId(g.id)`.
   - Forwarded `onRemoveFromWishlist={removeFromWishlist}` to `<GuruDetail ... />` so that removals from the wishlist successfully execute.
   - Forwarded `portfolio={portfolio}` to `<GuruDetail ... />` to enable correct check of user's active holdings / watched stocks status badges ("Owned", "Watched").

3. **`frontend/public/release-notes.html`**:
   - Added a fix entry under June 2026 detailing the resolution of the Guru Tracker watchlist integration and selected guru state.

## Verification
- Ran `npm test -- --run` successfully: All 32 tests passed cleanly.
- Ran `npm run build` successfully: Compilation succeeded without warnings/errors, outputting assets in `dist`.
