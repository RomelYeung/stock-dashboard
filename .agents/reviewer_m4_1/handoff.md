# Handoff Report — Review of Milestone 4 Guru Tracker Frontend

## 1. Observation
- In `frontend/src/components/GurusTab.jsx` line 173:
  ```javascript
  onClick={() => selectGuru(g.id)}
  ```
- In `frontend/src/components/GurusTab.jsx` lines 69-80:
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
- In `frontend/src/components/GuruDetail.jsx` lines 23-34:
  ```javascript
  export default function GuruDetail({
    guru,
    gurus,
    userRole,
    onBack,
    onSelectTicker,
    wishlistTickers,
    onAddToWishlist,
    onRemoveFromWishlist,
    portfolio,
    onSelectGuru,
  })
  ```
- In `frontend/src/components/GuruDetail.jsx` line 880:
  ```javascript
    ":hover": {
      color: "var(--text-primary)",
    },
  ```
- Producing production build using `npm run build` in `frontend` succeeded with logs:
  ```
  dist/index.html                     0.75 kB │ gzip:     0.42 kB
  dist/assets/index-CP18wwfw.css      7.56 kB │ gzip:     2.58 kB
  dist/assets/index-D33JV9Vt.js   6,506.75 kB │ gzip: 1,943.52 kB
  ```
- Running vitest test suite using `npm test -- --run` in `frontend` succeeded:
  ```
  Test Files  2 passed (2)
        Tests  32 passed (32)
  ```

## 2. Logic Chain
1. We observed that clicking a guru card calls `selectGuru(g.id)`. However, `selectGuru` is not defined anywhere in the `GurusTab` function, which causes a runtime `ReferenceError`.
2. We observed that `GuruDetail` relies on `portfolio` to check if a user owns or tracks a ticker in their watchlist. Since `portfolio` is not passed to `<GuruDetail>` in `GurusTab.jsx`, `portfolio` is always `undefined`, breaking user ownership indicators.
3. We observed that `GuruDetail` calls `onRemoveFromWishlist(ticker)` to remove a stock from the wishlist. Since `onRemoveFromWishlist` is not passed to `<GuruDetail>` in `GurusTab.jsx`, clicking the toggle button for a wishlisted stock will result in a runtime `TypeError`.
4. We observed that the `:hover` pseudo-selector is used in the inline style object `styles.th` of `GuruDetail.jsx`. Since React inline styles do not support pseudo-classes, the table header hover color changes are not working.
5. All automated tests in the frontend passed because the Vitest e2e mock file `useGuruData.e2e.test.js` only exercises hook/state simulation logic without mounting components or triggering click handlers.

## 3. Caveats
- Checked only the frontend code. Backend APIs were inspected briefly to confirm response contract but deep review of SEC filing parsers or DB triggers was skipped as it was out of scope.

## 4. Conclusion
The current implementation of Milestone 4 fails review with verdict `REQUEST_CHANGES` due to critical runtime bugs (`ReferenceError` and `TypeError`) and broken features (missing `portfolio` prop breaking indicators).

## 5. Verification Method
- Execute `npm run build` and `npm test -- --run` in the `frontend` directory.
- Inspect the file `/Users/yanchimyeung/Projects/stock-dashboard/.agents/reviewer_m4_1/review.md` to see the complete detailed findings and recommendations.
