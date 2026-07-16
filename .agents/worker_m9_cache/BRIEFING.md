# BRIEFING — 2026-06-20T17:06:54-07:00

## Mission
Implement backend and frontend cache invalidation for guru AI strategies, run and verify all tests.

## 🔒 My Identity
- Archetype: cache worker
- Roles: implementer, qa, specialist
- Working directory: /Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_m9_cache
- Original parent: 5f2633f2-eb7a-490b-9c9b-729040e3e280
- Milestone: m9

## 🔒 Key Constraints
- CODE_ONLY network mode: no external HTTP/wget/curl.
- Simplicity first: minimum code that solves the problem.
- Surgical changes: touch only what is necessary.
- Write release notes in `frontend/public/release-notes.html` if user-visible.

## Current Parent
- Conversation ID: 5f2633f2-eb7a-490b-9c9b-729040e3e280
- Updated: 2026-06-21T00:10:35Z

## Task Summary
- **What to build**: Cache invalidation logic in backend sync route (`backend/routes/gurus.js`) and frontend react-query hook (`frontend/src/hooks/useGuruData.js`).
- **Success criteria**:
  - `clearAiStrategyCache(investor.id)` is called when syncing an investor in the backend.
  - `queryClient.invalidateQueries({ queryKey: ["guruAiStrategy"] })` is called when `useSyncGuru` succeeds in the frontend.
  - All Jest and Vitest tests pass.
- **Interface contracts**: Specified in the prompt.
- **Code layout**: Standard Node/React layout.

## Key Decisions Made
- Chose to import `clearAiStrategyCache` dynamically/statically alongside other imports at the top of routes file.
- Enabled frontend invalidation of `"guruAiStrategy"` query key under `useSyncGuru` onSuccess hook.

## Artifact Index
- `/Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_m9_cache/progress.md` — Progress tracker
- `/Users/yanchimyeung/Projects/stock-dashboard/.agents/worker_m9_cache/handoff.md` — Handoff report

## Change Tracker
- **Files modified**:
  - `backend/routes/gurus.js` — Imported and called `clearAiStrategyCache(investor.id)` inside sync then handler
  - `frontend/src/hooks/useGuruData.js` — Added query invalidation for `"guruAiStrategy"`
  - `frontend/public/release-notes.html` — Documented release note for cache invalidation fix
- **Build status**: Pass
- **Pending issues**: None

## Quality Status
- **Build/test result**: Pass (85/85 Jest backend tests, 35/35 Vitest frontend tests)
- **Lint status**: Pass
- **Tests added/modified**: Verified existing test coverage ensures correctness

## Loaded Skills
- None
