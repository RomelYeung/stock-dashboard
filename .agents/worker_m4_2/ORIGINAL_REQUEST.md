## 2026-06-20T14:24:25Z
You are teamwork_preview_worker (worker_m4_2). Your working directory is `/Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_m4_2`.

Your task is to fix the runtime and integration issues identified during review of Milestone 4's implementation.

Here are the specific fixes needed:
1. In `frontend/src/components/GurusTab.jsx`:
   - Replace the call to the undefined `selectGuru(g.id)` with `setSelectedGuruId(g.id)` (or the correct handler to update selected guru state).
   - Ensure you pass `onRemoveFromWishlist` (which maps to `removeFromWishlist` in `App.jsx`) to `<GuruDetail ... />` component.

2. In `frontend/src/App.jsx` and related files:
   - Destructure `portfolio` from `usePortfolioItems(user?.id)`.
   - Pass `portfolio` as a prop to `<GurusTab ... />`.
   - In `<GurusTab ... />`, destructure `portfolio` and pass it to `<GuruDetail ... />` so that user ownership/watchlist indicators ("Owned", "Watched") function correctly.

3. Conformance:
   - Verify that all code changes comply with the styling conventions (custom inline styles, no Tailwind CSS).
   - Run `npm test -- --run` and `npm run build` in the `frontend` folder to make sure the test suite and building both pass cleanly.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Please document your changes in `changes.md` in your directory, verify compilation, and output your handoff report.
