# Progress

Last visited: 2026-06-20T10:16:15Z

## Ingestion Pipeline Correctness Review Fixes
- [x] Fix E2E rate limit test isolation issue:
  - [x] Export helper `resetSyncRequestTimes()` from `backend/routes/gurus.js`.
  - [x] Import and call `resetSyncRequestTimes()` inside `beforeEach` in `backend/routes/__tests__/gurus.e2e.test.js`.
  - [x] Mock `prisma.$transaction` in E2E tests so transaction calls resolve correctly and prevent foreign key violations.
- [x] Implement database transactions in Ingestion Sync inside `backend/services/sec.js`:
  - [x] Wrap filing creation, holdings creation, and investor update inside `prisma.$transaction(async (tx) => { ... })` using the interactive transaction client `tx` for atomic database operations.
- [x] Run and verify unit and E2E tests:
  - [x] E2E test `backend/routes/__tests__/gurus.e2e.test.js` passes cleanly.
  - [x] Unit test `backend/services/__tests__/sec.test.js` passes cleanly.
