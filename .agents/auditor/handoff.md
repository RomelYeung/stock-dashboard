# Handoff Report — Forensic Audit of Guru Tracker

## 1. Observation
I have performed a thorough review of the Guru Tracker frontend and backend implementation files:
- `backend/services/sec.js`
- `backend/routes/gurus.js`
- `frontend/src/hooks/useGuruData.js`
- `frontend/src/components/GurusTab.jsx`
- `frontend/src/components/GuruDetail.jsx`
- `frontend/src/components/GuruHeatmap.jsx`
- `frontend/src/components/GuruTimeline.jsx`

During the audit, I executed the test suites and analyzed the code structures. Here are the direct observations:

1. **Backend Service Logic (`backend/services/sec.js`)**:
   - `parse13Fxml` (Line 85) parses issuer, CUSIP, shares, values, and options dynamically using `xml2js.Parser`.
   - `syncInvestor` (Line 343) performs real requests to the SEC EDGAR API (`https://data.sec.gov/submissions/CIK...`) to fetch filing metadata and files, then maps CUSIPs, calculates portfolio weights, and stores the results inside a Prisma SQLite database transaction.
   - History pruning (`pruneHistory` and `pruneInvestorHistoryInDB`) retains exactly the 8 most recent filings.

2. **Backend Route Logic (`backend/routes/gurus.js`)**:
   - `/api/gurus` routes fetch dynamic database entries for investors, activities, history, and reverse holdings lookup.
   - Access control is implemented via the `authenticate` middleware (Line 14) which restricts guest users (having `guest-token`) from history and AI strategy endpoints.

3. **Frontend Hook Logic (`frontend/src/hooks/useGuruData.js`)**:
   - Standard React Query hook wrapper functions (`useGurus`, `useGuruHoldings`, `useGuruActivity`, `useGuruHistory`, `useGuruReverseLookup`, `useSyncGuru`, `useGuruAiStrategy`) mapping queries and mutations directly to API fetch requests.

4. **Frontend View Components**:
   - `GuruHeatmap.jsx` (Line 52): Overlap calculations are computed dynamically using actual weights:
     ```javascript
     overlapSum += Math.min(weightA, weightB);
     ```
   - `GuruTimeline.jsx` (Line 55): Maps historical filing records to Recharts area chart data points.
   - `GuruDetail.jsx` (Line 67): Concentrates calculations of HHI score dynamically.

5. **Test Results**:
   - Ran `npm run test` in `/Users/yanchimyeung/Projects/stock-dashboard/backend`. All tests successfully passed:
     ```
     PASS routes/__tests__/gurus.e2e.test.js
     PASS services/__tests__/sec.test.js
     PASS routes/__tests__/options.test.js
     PASS src/quant/__tests__/quant.test.js
     PASS scripts/__tests__/historical-iv-worker.test.js
     ```
   - Ran `npm run test -- --run` in `/Users/yanchimyeung/Projects/stock-dashboard/frontend`. All tests passed:
     ```
     ✓ src/hooks/__tests__/useGuruData.e2e.test.js  (30 tests) 3ms
     ✓ src/hooks/__tests__/useLivePrices.test.js  (2 tests) 1ms
     ```

6. **Frontend Bug Observations**:
   - **Bug 1: ReferenceError in card click in `GurusTab.jsx`** (Line 173):
     ```javascript
     onClick={() => selectGuru(g.id)}
     ```
     `selectGuru` is not defined or imported in this file. It should be `setSelectedGuruId(g.id)`.
   - **Bug 2: Missing Prop for Wishlist Removal in `GurusTab.jsx`** (Lines 69–80):
     `onRemoveFromWishlist` is not passed to the `GuruDetail` component instance in `GurusTab.jsx`, resulting in a crash when a user tries to remove a ticker from the wishlist from the Guru details view.

## 2. Logic Chain
- **Step 1**: If the implementation used hardcoded test outputs or facade functions (e.g., returning constant test values or mock arrays rather than querying the database or SEC EDGAR API), the source files would contain static test constants in place of dynamic logic.
- **Step 2**: The code analysis in `backend/services/sec.js`, `backend/routes/gurus.js`, and the frontend components shows fully fleshed-out dynamic calculations, HTTP requests, DB queries/transactions, and dynamic charts.
- **Step 3**: The test coverage executes route integrations, XML parsing inputs, and state simulations, validating that the tests check genuine API behaviors.
- **Step 4**: The lack of facades, code borrowing of core deliverables, or faked result logs confirms that the system complies with **Benchmark Mode** strictness.
- **Step 5**: However, the presence of the `selectGuru` ReferenceError and the missing `onRemoveFromWishlist` prop on the frontend will cause UI runtime crashes in real-world scenarios.

## 3. Caveats
- Checked dependencies using `package.json` configurations; no prohibited third-party libraries for core logic were detected.
- Verified that all unit/e2e tests pass. Due to the "Audit-only" constraint, I did not modify the implementation code to correct the identified frontend bugs.

## 4. Conclusion
The implementation is **CLEAN** of integrity violations (no hardcoded test results, facade implementations, or other faked behaviors). However, there are two critical **frontend runtime bugs** in `GurusTab.jsx` (ReferenceError on clicking a Guru card, and missing `onRemoveFromWishlist` prop passed to `GuruDetail`).

## 5. Verification Method
To verify this report:
1. Run backend tests:
   ```bash
   cd backend
   npm run test
   ```
2. Run frontend tests:
   ```bash
   cd frontend
   npm run test -- --run
   ```
3. Inspect `frontend/src/components/GurusTab.jsx` at line 173 to confirm the `selectGuru` call, and lines 69-80 to verify the missing `onRemoveFromWishlist` prop.
