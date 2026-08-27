# AI Financial Adviser 2.0 — Corrected Implementation Plan

**Status:** proposal; implementation is not approved by this document.

**Supersedes:** the implementation steps in `2026-08-25-ai-financial-adviser-2.0-plan.md` where they conflict with this plan.

## Review decision

The current branch contains the data foundation and persona definitions only. The original plan must not be implemented verbatim because it leaves a session-ownership gap, can omit the current user message, drops the existing tool-call continuation loop, defaults V2 on, and contains self-contradictory tests.

The smallest coherent delivery is a secure, authenticated fast lane first. Deep debate, profile UX, automatic routing, and Deep Research cleanup follow only after the fast lane is measured and stable.

## Scope

### In scope

- Preserve the existing SSE envelope and legacy behavior.
- Add a deterministic analyst brief and a V2 fast lane.
- Enforce adviser session ownership and validate request bodies.
- Add an explicit Full Panel (`forceDeep`) path behind a safe rollout flag.
- Add tests for security, message/history ordering, tool continuation, failure fallback, and legacy parity.

### Out of scope for the first slice

- Automatic deep-lane routing.
- Silent LLM extraction of investor profiles.
- Moving the unrelated Deep Research prompt to the backend (old Task 10).
- New dependencies, a new rate-limit abstraction, or a fifth persona.

## Decisions

1. **Rollout flag:** unset or unknown `ADVISER_V2` keeps the current legacy path. Only `ADVISER_V2=v2` enables the new path. `ADVISER_V2=legacy` remains an explicit legacy value.
2. **Identity:** adviser session/history/profile endpoints require `requireAuth`. A V2 request always uses `req.user.id`; anonymous persistent adviser sessions are not supported in this slice. A supplied session ID must match both the authenticated user and ticker, otherwise return not-found without leaking ownership.
3. **Routing:** V2 defaults to fast lane. `forceDeep: true` is the only deep trigger until QA supplies measured evidence for automatic classification.
4. **Profile capture:** use an explicit profile form/endpoints after the core lane works; never make a background model call to infer or save profile fields.
5. **Persistence:** persist completed deep debates only after synthesis succeeds. If synthesis fails, emit an error/status and run the fast lane once as the user-visible fallback; do not save a false verdict.

## Implementation sequence

### Phase 0 — security and request contract

Files: `backend/routes/stocks.js`, `backend/middleware/auth.js`, `backend/services/aiFinancialAdviser.js`, adviser route tests.

- Apply `requireAuth` to adviser sessions, history, and chat routes.
- Validate `message` as a bounded non-empty string, `sessionId` as an optional bounded string, and `forceDeep` as a boolean.
- Load an existing session with `id + userId + ticker`; create new sessions for the authenticated user only.
- Keep SSE error/DONE behavior deterministic and avoid writing a model message after a failed generation.

Acceptance: unauthenticated requests return 401; cross-user and cross-ticker session IDs behave as not-found; malformed bodies return 400; existing authenticated history still loads.

### Phase 1 — deterministic brief and V2 fast lane

Files: create `backend/services/adviser/analystBrief.js` and its test; create `backend/services/adviser/router.js` only if needed for the explicit `forceDeep` decision; update `backend/services/aiFinancialAdviser.js` and tests.

- Build a bounded brief from the already supplied quant data. Reuse existing data shapes; do not add fetches.
- Correct the brief fixture arithmetic: price history `100..119` is `+19.0%`, or change the fixture endpoint to 120. Prefer correcting the expectation to the supplied data.
- Calculate DCF upside as `(fairValue - price) / price`; add a zero/missing-price guard.
- Construct history in chronological order, inject the brief once, and append the current user message after prior turns. Never use `history.slice(0, -1)` as a substitute for explicitly appending the current message.
- Preserve the current function-call loop for news, SEC, and earnings tools. Test one tool round-trip.
- Reuse the existing prefix splitter behavior or extract it only when the facade needs it; do not require an empty initial chunk. The test should assert emitted text and agent transitions, not an incidental zero-length event.
- Keep legacy prompt, temperature, flattened history, and tool behavior unchanged when V2 is not explicitly enabled.

Acceptance: fresh and multi-turn fast-lane requests contain the current message; tool calls continue to a final response; legacy parity passes; brief output is bounded and numerically correct; V2 is opt-in.

### Phase 2 — explicit Full Panel deep lane

Files: create `backend/services/adviser/debate.js` and tests; update the facade and route wiring; reuse `backend/utils/rateLimiter.js` if request limiting is required.

- Run independent persona memos, rebuttals, and one Alex synthesis with additive `stage` events.
- Bound concurrency, prompt sizes, retries, and output sizes.
- On memo failure, continue with a marked unavailable memo. On synthesis failure, fall back to one fast-lane response and do not persist an incomplete debate.
- Persist `AdviserDebate` only after a complete synthesis and associate it with the already ownership-checked session.

Acceptance: `forceDeep` is authenticated, rate-limited, observable through stage events, persisted only on success, and has a tested synthesis-failure fallback.

### Phase 3 — explicit investor profile UX

Files: profile service/routes and `frontend/src/components/AIFinancialAdviserChat.jsx`.

- Add read/update endpoints scoped to `req.user.id`.
- Add a small explicit setup form and header summary; keep the form optional and non-blocking for chat.
- Pass the saved profile into prompts only after the profile route and ownership tests pass.

Acceptance: profile data cannot cross users, survives reload, and changes suitability language in a deterministic mock test plus a manual UI check.

### Phase 4 — measured automatic routing and release

- Keep automatic routing disabled until fast/deep QA produces evidence for its false-positive and false-negative behavior.
- Defer the Deep Research prompt move until separately approved.
- Add the release-note entry only when the shipped behavior matches the entry.
- Run the manual scenarios from the original plan, plus auth/session and terminal-failure cases.

## Required validation gates

- Backend ownership, request validation, current-message/history, tool continuation, brief arithmetic, splitter boundaries, V2 flag, legacy parity, deep fallback, and persistence tests.
- Backend full suite passes and exits cleanly; investigate the existing cache-persist open handle before release.
- Frontend tests and `npm run build` pass.
- Manual SSE/UI checks cover reconnect/disconnect, old sessions, explicit Full Panel, and profile reload.
- Worktree is clean except for deliberately committed data snapshots; resolve the current uncommitted `backend/prisma/dev.db` before final delivery.

## Approval gate

Before product-code edits, confirm the recommended identity decision (authenticated-only adviser routes for this slice) and the opt-in flag semantics. Once approved, implement Phase 0 and Phase 1 as one writer-owned change, then run independent QA before Phase 2.
