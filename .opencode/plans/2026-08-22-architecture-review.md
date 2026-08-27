# Consolidated Architectural Review — stock-dashboard

**Date:** 2026-08-22
**Reviewer:** Final Architectural Audit (independent spot-check of 3 navigator explorations)
**Scope:** Backend (Express 4.18 / Node ESM / Prisma), Frontend (React 18 / Vite 5), cross-cutting security, data-flow, testing, observability.
**Method:** Highest-severity claims were verified by reading the actual source files (server.js, cache-persist.js, cache.js, gurus.js, stocks.js, ai.js, auth.js routes + middleware, schema.prisma, services/auth.js). Contradictions were resolved against ground truth, not summaries.

---

## 1. Executive Summary

The codebase is a functionally rich full-stack stock-analysis dashboard with genuinely good bones: a centralized Zod-validated input layer, a Sentry integration on both tiers, an inflight-dedup cache, a competent central error handler, and a strong 60-case guru E2E suite. However, the audit confirms **several CRITICAL security defects that must be fixed before any production exposure**. Most alarming is a hardcoded authentication backdoor in the gurus route middleware that grants `ADMIN` to anyone presenting the static string `admin-token`, and a set of broker-proxy (`/api/stocks/schwab/*`) routes that are entirely unauthenticated, exposing server-held broker credentials to open abuse. Expensive AI endpoints (advisor-chat SSE, deep-research) are likewise unauthenticated. Beyond security, the architecture carries real structural debt: multiple `PrismaClient` instances per process, no security headers, weak JWT/logout posture, missing DB indexes, and no graceful HTTP/DB shutdown. Testing is uneven — strong on gurus, absent on auth, portfolio, and DCF math — and there is **no CI**. Two claims from the exploratory reports were found inaccurate on spot-check (Holding indexes already exist; the "N+1 Yahoo for company names" claim is overstated), and the SQLite-vs-PostgreSQL and graceful-shutdown contradictions are resolved below. The overall assessment is: **promising but not production-safe; P0 security work is mandatory before deployment.**

---

## 2. Architecture Overview (current state, in text)

```
                          ┌─────────────────────────────────────┐
   Browser (React 18)     │            Express API (:3001)       │
   HashRouter,            │                                       │
   react-query v5,  ──────►  middleware: cors → json → cookieParser
   AuthContext,           │   → rateLimit(global/indicators/live)
   Sentry, errorBoundary  │   → compression → requestLogger       │
                          │                                       │
                          │  routes (6 mounts, NO versioning):     │
                          │   /api/auth      (requireAuth on /me)  │
                          │   /api/stocks    (MOSTLY public;       │
                          │       schwab/* + advisor-chat PUBLIC)  │
                          │   /api/portfolio (requireAuth via      │
                          │       router.use)                      │
                          │   /api/options    (public scan)        │
                          │   /api/ai         (deep-research PUBLIC)│
                          │   /api/gurus      (custom `authenticate`│
                          │       middleware w/ BACKDOOR tokens)   │
                          │                                       │
                          │  services: db.js(singleton PrismaClient)
                          │   + portfolio.js/auth.js/middleware/   │
                          │     auth.js EACH new PrismaClient()    │
                          │   cache.js (8 NodeCache + inflight     │
                          │     dedup + disk persist every 5min)  │
                          │   yahoofinance / sec / fred / schwab  │
                          │   dcf (monteCarlo sync) / ai (Gemini) │
                          │                                       │
                          │  Sentry.setupExpressErrorHandler      │
                          │  errorHandler (Zod→400, Prisma→4xx)    │
                          └───────────────┬───────────────────────┘
                                          │
                      ┌───────────────────┼────────────────────────┐
                      ▼                   ▼                        ▼
              SQLite (dev.db)      External APIs:            Disk: cache/*.json,
              via Prisma           Yahoo, SEC EDGAR,         data/, backend/.env,
              (provider=sqlite)    FRED, Schwab OAuth,       .schwab-token.json
                                   Gemini AI
```

**Key structural observations:** Service layer is acyclic and layering is otherwise respected. The backend mixes concerns: `stocks.js` (992 lines) contains Schwab OAuth flow logic that belongs in an auth/service module. Frontend has several god components. There is no API versioning and the response envelope is inconsistent across mounts.

---

## 3. Consolidated Findings Table

| ID | Severity | Category | Title | File References | Impact |
|----|----------|----------|-------|-----------------|--------|
| C-1 | CRITICAL | Auth | Hardcoded `user-token`/`admin-token` bypass in gurus `authenticate` middleware (no `NODE_ENV` guard) | `backend/routes/gurus.js:49-77` | Anyone sending `Authorization: admin-token` is granted `ADMIN` role; full privilege escalation. |
| C-2 | CRITICAL | Auth / Abuse | All `/api/stocks/schwab/*` routes are public (no `requireAuth`) | `backend/routes/stocks.js:906-991` | Open proxy on server-held broker credentials; quota/cost abuse, data exposure, possible SSRF. |
| C-3 | CRITICAL | Auth / Cost | Unauthenticated expensive AI endpoints (advisor-chat SSE + deep-research) | `backend/routes/stocks.js:512-550`, `backend/routes/ai.js:16` | Anyone can trigger costly Gemini calls + 6 Yahoo fetches per request; financial/availability abuse. |
| H-1 | HIGH | Security Headers | No `helmet` / no security headers anywhere | `backend/server.js` (grep for `helmet` = empty) | Missing CSP, HSTS, X-Content-Type-Options, etc. (defense-in-depth gap). |
| H-2 | HIGH | Auth | JWT 7-day expiry, no refresh, logout only clears cookie client-side (no revocation) | `backend/services/auth.js:34`, `backend/routes/auth.js:26,87-90` | Stolen token = full access for 7 days; no server-side invalidation. |
| H-3 | HIGH | Auth | Weak password policy (min 6 chars) | `backend/routes/auth.js:13` | Low bar enables weak passwords / brute force. |
| H-4 | HIGH | Data Exposure | Unauthenticated chat-session history read (`/session` takes `sessionId` from query, `userId=null` when unauth) | `backend/routes/stocks.js:485-509` | If ownership isn't enforced server-side, attacker can read any session's chat history by `sessionId`. |
| H-5 | HIGH | Injection / SSRF | Schwab `price-history`/`option-chain`/`movers` pass `params`/`query` unsanitized to external API; advisor-chat body unvalidated | `backend/routes/stocks.js:956-991,512` | Malformed/abusive upstream calls; potential SSRF / upstream error amplification. |
| M-1 | MEDIUM | Reliability | No graceful HTTP/DB shutdown | `backend/server.js` (no handlers); `backend/services/cache.js:32-40` calls `process.exit(0)` after cache flush | In-flight requests dropped; Prisma connection not cleanly released on restart. |
| M-2 | MEDIUM | DB Perf | Missing index on `ChatSession.userId` | `backend/prisma/schema.prisma:56-64` (no `@@index`) | Slow session listing/lookup as data grows. |
| M-3 | MEDIUM | Resilience | External API calls lack retry/timeout/circuit-breaker (Yahoo, SEC, Gemini); `YAHOO_FINANCE_DELAY_MS` unused | `backend/services/yahoofinance.js`, `sec.js`, ai client | Cascading failures / hangs under upstream outage. (FRED has proper 10s timeout — good counterexample.) |
| M-4 | MEDIUM | Performance | Synchronous `monteCarlo` blocks event loop (default 1000 iters, caller may override) | `backend/services/dcf.js:81`, `backend/routes/stocks.js:406` | Latency spikes / request starvation under load. |
| M-5 | MEDIUM | Performance | `sector-rotation` fetches 21 ETFs sequentially with 150ms sleeps (~3.15s) | sector-rotation service | Slow endpoint; poor UX under load. |
| M-6 | MEDIUM | Performance | Gurus activity feed loads ~4400 rows into memory | `backend/routes/gurus.js` activity route | Memory/CPU spikes; scalability risk. |
| M-7 | MEDIUM | Reliability | SSE advisor-chat has no max-duration guard | `backend/routes/stocks.js:512-550` | Connection/resource exhaustion. |
| M-8 | MEDIUM | Data Freshness | No selective cache invalidation (only full admin flush) | `backend/services/cache.js` | Stale data persists until TTL/flush. |
| M-9 | MEDIUM | Observability | ~100+ unstructured `console.*` calls; no logging library/metrics | repo-wide | Hard to operate/triage in production. |
| M-10 | MEDIUM | Maintainability | Frontend god components (GuruDetail 1050L, AIFinancialAdviserChat 909L, OptionsScanner 765L, Fundamentals 701L, GurusTab 693L); `useStockData.js` 485L/6 hooks; `App.jsx` props-drills 12 props | `frontend/src` | High change-risk; slow onboarding. |
| M-11 | MEDIUM | Bundle | 4 charting libraries incl. `plotly.js-dist-min` (~3MB) | `frontend` deps | Bloated bundle / slow first paint. |
| M-12 | MEDIUM | Contract Drift | Heavy defensive `?.` clusters in GuruDetail, MarketIndicatorsPage, DCFSummary | `frontend/src` | Symptom of unstable API contracts; masks bugs. |
| M-13 | MEDIUM | API Design | No API versioning across ~50 endpoints / 6 mounts | `backend/server.js:100-105` | Breaking-change risk on evolution. |
| M-14 | MEDIUM | Dead Data | `CusipMapping` table appears redundant in holdings path (companyName now stored on `Holding`) | `backend/prisma/schema.prisma:132-140`, `backend/routes/gurus.js:364` | Unused/confusing data model. |
| M-15 | MEDIUM | Testing | Zero tests for auth flows, portfolio CRUD, DCF math, errorHandler, auth middleware, cache layer | `backend` test tree | Regressions in critical paths go undetected. |
| L-1 | LOW | Hygiene | ~30 probe/debug scripts at backend root; destructive `patch_*.js` at repo root; `session-resultsNotWritten.md` (106KB transcript); `cache/`/`data/` untracked; stale data files committed | repo root, `backend/` | Clutter; accidental execution / misleading history. |
| L-2 | LOW | Secrets | Plaintext secrets on disk: `backend/.env` (gitignored, not committed) + `backend/.schwab-token.json` (live broker tokens, gitignored) | `backend/.env`, `backend/.schwab-token.json` | Mitigated by gitignore, but present on disk; risk if host compromised. |
| L-3 | LOW | Process | No CI config (`.github/workflows` absent) | repo root | Tests not enforced; quality regressions ship. |

---

## 4. Contradictions Resolved

**4.1 SQLite vs PostgreSQL.** *Report claim:* schema.prisma declares SQLite but "prior project records say PostgreSQL was chosen." *Ground truth:* `backend/prisma/schema.prisma:6` = `provider = "sqlite"`. A repo-wide search for `postgresql`/`postgres` returns **only transitive npm dependencies** in `package-lock.json` (postgres-array/bytea/date/interval — deps of `pg`), never a configured provider. *Resolution:* **SQLite is the actual and only provider.** PostgreSQL was an abandoned/aspirational choice in earlier records and was never implemented. *Architectural impact:* SQLite is single-writer with no native connection pooling — this makes the multiple-`PrismaClient` finding (M-side) and any future scale-up materially riskier; a deliberate decision to stay on SQLite (with WAL) or migrate to Postgres should be recorded.

**4.2 Graceful shutdown.** *Conflicting reports:* one said "server.js lacks graceful shutdown"; another said "cache-persist.js registers SIGINT/SIGTERM handlers." *Ground truth:* `backend/server.js` has **no** signal handlers (ends at `app.listen(...)`, line 150). `backend/services/cache-persist.js` has **no** signal handlers — it only exports `persistCache`/`loadCache` (63 lines). The **actual** handler lives in `backend/services/cache.js:39-40` → `gracefulShutdown` (lines 32-37), which clears the persist interval, writes cache, logs, then calls **`process.exit(0)`**. *Resolution:* (a) The "cache-persist.js registers handlers" claim is **FALSE** — they are in `cache.js`. (b) "server.js lacks graceful shutdown" is **PARTIALLY TRUE**: a shutdown hook exists, but it only flushes the cache and then hard-exits via `process.exit(0)` **without** calling `server.close()` (no in-flight request draining) or `prisma.$disconnect()` (DB connection not released). Net: there is **no proper graceful shutdown of the HTTP/DB layer** (finding M-1).

**4.3 "Missing indexes on Holding[ticker,filingId]."** *Ground truth:* `backend/prisma/schema.prisma:127-129` declares `@@index([filingId])`, `@@index([ticker])`, and `@@index([CUSIP])`. *Resolution:* The claim is **INACCURATE** — both columns are individually indexed. The only genuinely missing index in the reported set is **`ChatSession.userId`** (schema.prisma:56-64 has none). Corrected in findings (M-2 only).

**4.4 "N+1 Yahoo calls in GuruDetail just to get company names."** *Ground truth:* The gurus `/:id/holdings` response (`backend/routes/gurus.js:364`) returns `Holding` rows that already include `companyName` (backfilled onto `Holding` via migration `20260712120435_add_company_name_to_holding` + `scripts/backfillHoldingCompanyNames.js`). `frontend/src/components/GuruDetail.jsx:256,521` uses `h.companyName || stockDataMap?.[ticker]?.name` — it prefers the DB-backed name and falls back to Yahoo only when absent. *Resolution:* The N+1-for-company-names claim is **OVERSTATED** — no N+1 for names occurs. `CusipMapping` appears redundant for this path (finding M-14). Yahoo is still used for other summary data, but not as an N+1 name lookup.

**4.5 "Zero tests for stocks routes."** *Ground truth:* There **is** `backend/routes/__tests__/stocks.schwab.test.js`. *Resolution:* "Zero" is **OVERSTATED** — but coverage of the 992-line `stocks.js` is minimal (only the Schwab proxy is mocked). The absence of tests for auth, portfolio CRUD, and DCF math is accurate (M-15).

---

## 5. Prioritized Remediation Roadmap

### P0 — Security (do now, before any deployment)
1. **Remove the gurus auth backdoor (C-1).** Delete the `user-token`/`admin-token` branch in `backend/routes/gurus.js:49-77`; route all auth through the real `requireAuth`/`verifyToken` path (or a shared `authenticate` that never accepts static strings). Add a test asserting static tokens are rejected.
2. **Authenticate all `/api/stocks/schwab/*` routes (C-2).** Apply `requireAuth` (and likely `requireAdmin`) to `schwab/health`, `auth`, `exchange`, `quotes`, `price-history`, `option-chain`, `movers` in `backend/routes/stocks.js:906-991`. Broker-proxy endpoints must never be public.
3. **Authenticate AI endpoints (C-3).** Add `requireAuth` to `POST /api/stocks/:ticker/advisor-chat` (`stocks.js:512`) and `POST /api/ai/deep-research/start` (`ai.js:16`); add a max-duration/idle-timeout guard to the SSE stream (M-7).
4. **Enforce session ownership (H-4).** In `getSessionHistory`/`getSessionsList`, require an authenticated `userId` and reject `null`/mismatched ownership; never serve another user's chat history from an unauthenticated request (`stocks.js:485-509`).
5. **Sanitize/validate all upstream params (H-5).** Add Zod `params`/`query` validation to `price-history`, `option-chain`, `movers`, and a body schema to `advisor-chat` (`stocks.js`).
6. **Add security headers (H-1).** Install and use `helmet` in `backend/server.js` (or set CSP/HSTS/X-Content-Type-Options manually).

### P1 — Structural Debt
7. **Single PrismaClient (M-side).** Replace the `new PrismaClient()` in `backend/routes/portfolio.js`, `backend/routes/auth.js`, and `backend/middleware/auth.js` with the `db.js` singleton export. Keep scripts as separate processes.
8. **Harden JWT/logout (H-2, H-3).** Shorten JWT expiry (e.g., 15–60 min) + implement refresh tokens, or add server-side revocation (token version / denylist); make logout invalidate server-side. Raise password minimum to ≥10 chars with complexity.
9. **Proper graceful shutdown (M-1).** In `server.js`, capture `const server = app.listen(...)` and register `SIGINT`/`SIGTERM` handlers that call `server.close()`, await in-flight requests, `prisma.$disconnect()`, then `process.exit()`. Remove the bare `process.exit(0)` in `cache.js`.
10. **Add missing DB index (M-2).** `@@index([userId])` on `ChatSession` in `schema.prisma`; generate + apply migration.
11. **External resilience (M-3).** Add timeout + retry + circuit-breaker to Yahoo/SEC/Gemini clients (mirror FRED's `AbortController` pattern); wire `YAHOO_FINANCE_DELAY_MS` or remove it.
12. **Offload blocking work (M-4, M-5, M-6).** Make `monteCarlo` async/chunked or move to a worker; parallelize `sector-rotation` ETF fetches (remove 150ms sequential sleeps); paginate/stream the gurus activity feed.

### P2 — Hygiene, Performance, Testing
13. **Frontend decomposition (M-10, M-11, M-12).** Split god components; lazy-load or drop `plotly.js-dist-min` in favor of a lighter lib; replace defensive `?.` clusters with explicit contract types/validation.
14. **API versioning + envelope consistency (M-13).** Prefix mounts with `/api/v1`; standardize `{success, data, error}` envelope and 500-vs-502 upstream semantics.
15. **Cache invalidation (M-8) + observability (M-9).** Add targeted invalidation (by key/namespace); replace `console.*` with a logging library (pino/winston) and add basic metrics.
16. **Testing (M-15).** Add suites for auth flows, portfolio CRUD, DCF math, errorHandler, auth middleware, cache layer. Enforce via CI (L-3): add `.github/workflows` running lint + tests on PRs.
17. **Repo hygiene (L-1, L-2).** Move probe/debug scripts out of the repo root (or into `scripts/debug/` and gitignore); delete destructive `patch_*.js`; remove `session-resultsNotWritten.md` from VCS; move secrets to a manager and keep `.env`/`.schwab-token.json` out of the working tree where possible.

---

## 6. Things Done WELL (be fair)

- **Zod validation** is applied broadly via a `validate(schema, location)` helper on most routes (register/login, guru params/body, schwab quotes, dcf query, etc.).
- **Rate limiting** is structured and layered: global + indicators + live-prices limiters with `standardHeaders` (`backend/server.js`, `backend/constants.js`).
- **Sentry** is initialized on both backend (`Sentry.init` + `setupExpressErrorHandler`) and frontend — solid observability baseline.
- **Inflight request dedup** in `getOrFetch` (`backend/services/cache.js:104-141`) prevents cache-stampede — a real best practice.
- **Central error handler** maps Zod→400 and Prisma codes→409/404 and hides internals in production.
- **Frontend error boundaries** provide user-facing failure containment.
- **Guru E2E suite** (`backend/routes/__tests__/gurus.e2e.test.js`, ~60 cases) is strong and exercises the backdoor-free auth path via mock tokens in test only.
- **CORS is restricted** to a configured `FRONTEND_URL` origin with explicit methods `[GET,POST,DELETE]` and `credentials: true` — not a wildcard.
- **Compression** is enabled (`backend/server.js:83`).
- **FRED client** uses a proper 10s `AbortController` timeout — a good pattern the other external clients should copy.
- **SEC EDGAR** is rate-limited (10 rps) — good intent (needs timeout/retry to be complete).
- **Disk cache persistence + load-on-startup** (`cache-persist.js`) provides warm caches across restarts.
- **Service layer is acyclic** and layering is otherwise respected.
- **Passwords are bcrypt-hashed** (`verifyPassword`) and the JWT secret is sourced from env (not hardcoded).

---

*Spot-check evidence base:* server.js (150L, full), cache-persist.js (63L, full), cache.js (141L, full), gurus.js (455L, lines 35-89 & 283-372), stocks.js (992L, lines 483-557 & 880-992), ai.js (deep-research lines 15-39), auth.js routes (98L, lines 13/58-97), middleware/auth.js (49L, full), services/auth.js (49L, full), schema.prisma (140L, full), plus repo-wide greps for `helmet`, `new PrismaClient`, `SIGINT/SIGTERM`, `postgresql`, `persistCache`, advisor-chat/deep-research routing, and `.github/workflows` absence.
