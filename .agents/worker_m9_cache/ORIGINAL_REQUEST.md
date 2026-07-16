## 2026-06-20T17:06:54-07:00
You are the Cache Invalidation Worker. Your working directory is /Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_m9_cache.
Please read /Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_m9_cache/progress.md for instructions and keep it updated during your work.

Your task is to:
1. Implement backend cache invalidation in `backend/routes/gurus.js` sync route:
   - Import `clearAiStrategyCache` from `../services/guruAi.js` (at the top of `backend/routes/gurus.js` along with `generateAiStrategySummary`).
   - In the `POST /api/gurus/sync` route's `.then()` callback of `syncInvestor(CIK)`, query the investor by CIK from the database (`prisma.investor.findUnique({ where: { CIK } })`) and, if the investor is found, call `clearAiStrategyCache(investor.id)`.
2. Implement frontend cache invalidation in `frontend/src/hooks/useGuruData.js`:
   - In the `useSyncGuru` hook's `onSuccess` callback, call `queryClient.invalidateQueries({ queryKey: ["guruAiStrategy"] })`.
3. Run and verify all backend and frontend tests:
   - In the `backend` directory, run the backend tests (e.g. `npm test`) and ensure all 85+ Jest tests pass.
   - In the `frontend` directory, run the frontend tests (e.g. `npx vitest run`) and ensure all 35+ Vitest tests pass.
4. When finished, write a short handoff report to `/Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_m9_cache/handoff.md` and message the orchestrator (conversation ID: 5f2633f2-eb7a-490b-9c9b-729040e3e280) with your completion.
