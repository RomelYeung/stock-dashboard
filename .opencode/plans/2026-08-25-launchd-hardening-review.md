# Review: launchd hardening for historical IV ingestion

**Date:** 2026-08-25  
**Verdict:** **APPROVED WITH CHANGES**

## Executive summary

The overall direction is sound for a single-user development Mac. A user LaunchAgent supervising the existing nodemon workflow can preserve hot reload while recovering from login, process, and nodemon failures. The documented launchd sleep behavior is real: missed `StartCalendarInterval` events are coalesced and run once on wake.

Two load-bearing details need correction. First, 20:00 is not a proven upper bound for ingestion completion: retries wait 30 minutes *after* each sequential batch finishes, while Schwab fetches have no timeout. A forced restart can interrupt ingestion, and the app has no ingestion-aware graceful shutdown. Second, `StartCalendarInterval` uses the Mac's local timezone. The current shell reports `PDT -0700`, not America/New_York, so a local 20:00 trigger cannot currently be described as 20:00 ET.

## Verified facts

1. **Schedule and coverage:** `backend/scripts/historical-iv-worker.js:173-212` schedules 17:00 and 18:00 Mon-Fri in `America/New_York`. The 18:00 safety net only retries when the same-day count is exactly zero; it does not repair a partial day. Startup backfill repairs days below 80% of the current active-ticker count.
2. **Retry timing:** `historical-iv-worker.js:78-103` permits three total attempts. Each 30-minute delay begins after the preceding sequential all-ticker batch finishes. Thus “finishes around 18:30” is not a worst-case guarantee. `services/schwab-client.js:28-76` uses unbounded `fetch` calls and can also sleep for a server-provided `Retry-After`.
3. **Startup backfill:** `startCronJob()` calls `runBackfill()` asynchronously. It considers seven calendar days and skips the entire backfill if more than five trading days are deficient. `HistoricalIV` has `@@unique([ticker, date])`, so repeated upserts do not duplicate rows.
4. **CWD:** `backend/server.js:1-2` calls `dotenv.config()` without a path. Installed dotenv resolves this as `process.cwd()/.env`; `WorkingDirectory=.../backend` is therefore load-bearing. IV scheduling starts only inside the `app.listen` callback, so a port-bind failure prevents backfill.
5. **nodemon:** the lockfile installs nodemon 3.1.14. Its local CLI and parser confirm `--exitcrash`; on a nonzero/signal child crash it exits nodemon with status 1. Official nodemon guidance supports using `--exitcrash` with an outer supervisor and recommends SIGTERM from that supervisor. Its macOS code signals the child/subtree; no zombie-child blocker was found.
6. **Shutdown behavior:** the app does not close its HTTP server or track active ingestion on SIGTERM. `services/cache.js:36-44` handles SIGINT/SIGTERM by persisting caches and calling `process.exit(0)`. A nightly termination can therefore abort a network request or batch. SQLite protects transaction integrity, but not data completeness.
7. **Wake behavior:** the local `launchd.plist(5)` explicitly says a calendar event missed during sleep runs on next wake and multiple missed events coalesce into one. It does not promise persistence across power-off/reboot; the backend agent's login/load startup backfill covers that case. Dark-wake behavior can vary, so completion should be verified on full wake rather than assumed during sleep.
8. **Timezone:** launchd calendar fields are local time. The current environment reports `PDT -0700`. There is no timezone field in `StartCalendarInterval`.
9. **Logs/secrets:** launchd does not rotate `StandardOutPath`/`StandardErrorPath`. The repo already has an ignored root `backend.log` around 4.2 MB. `backend/.env` and `.schwab-token.json` are git-ignored but currently mode `0644` (world-readable).

## Decision review

### D1 — LaunchAgent supervises nodemon

**Assessment: Option A is appropriate, with hardening.** It preserves the explicitly relied-upon hot-reload workflow. Bare Node is simpler but changes that workflow.

`KeepAlive=true` and `--exitcrash` are complementary, not inherently a dangerous double-supervision loop: nodemon owns file-change child restarts, while launchd owns nodemon exits. Persistent startup errors can still generate repeated logs. launchd defaults to a ten-second throttle; set an explicit 30–60 second `ThrottleInterval` so this behavior is intentional. `RunAtLoad` is redundant with unconditional KeepAlive but harmless.

Use absolute paths for Node, nodemon, working directory, and logs. Plists do not expand `~`, `$UID`, or shell syntax. The installer must render the numeric UID into `gui/<uid>/...`, pre-create the log directory, and fail if Node, nodemon, `.env`, or the working directory is missing. Because nodemon is a devDependency, `npm install --omit=dev` would break this setup.

### D2 — nightly self-heal

**Assessment: the calendar agent is reasonable; unconditional whole-server restart is not yet safe enough.**

The wake-coalescing premise is documented. However, 20:00 only provides a likely buffer; it is not guaranteed to follow ingestion completion. A preferable, simpler data-reliability design is a one-shot script that imports `runBackfill()`, awaits it, disconnects Prisma in `finally`, and exits. The refresh LaunchAgent can run that script without HTTP downtime, nodemon signal interactions, or killing an active batch. This is a tiny app-level entry point, not a rewrite or hourly poller.

If the no-app-code constraint is retained, the restart path must at least add bounded Schwab request durations and an ingestion-active/graceful-shutdown mechanism, or otherwise prove that restart is skipped while ingestion/backfill is active. The design must call 20:00 a buffer, not a worst-case completion bound.

`launchctl kickstart -k` means terminate an already-running service and instruct launchd to run it. With unconditional KeepAlive, launchd remains the lifecycle manager; adding a separate manual kill or marker touch would add races rather than remove them. `kickstart -kp` is not safer—`-p` only prints the new PID. The help text does not specify the termination signal, so verify behavior on the target mac and give the service a finite `ExitTimeOut`. `launchctl kill SIGTERM gui/<uid>/<label>` expresses the desired signal more clearly and relies on KeepAlive to respawn, but still does not solve in-flight work without graceful shutdown.

For timezone correctness, either enforce/verify America/New_York at install time, or use a periodically triggered one-shot wrapper that checks New York date/hour plus an idempotency marker. The latter survives travel and system-timezone changes. Do not label local 20:00 as ET without a guard.

### D3 — crash behavior and cutover

**Assessment: `--exitcrash` is correct; stop-old-then-bootstrap-new is the correct backend order.**

Do not bootstrap the new backend first. KeepAlive starts it immediately, it collides on port 3001, and `--exitcrash` plus KeepAlive creates a throttled failure loop. It is safe to bootstrap the inert refresh agent first. Then, outside the ingestion/retry window, SIGTERM the discovered old nodemon PID (do not hard-code 4129), wait for nodemon and its Node child to exit, verify port 3001 is free, and bootstrap the backend agent.

After bootstrap, verify `launchctl print`, both nodemon/Node processes, `/health`, and a startup-backfill completion log. The installer needs rollback if health does not become ready in a bounded period. Document modern `bootout`/`bootstrap` stop/start commands rather than only the deprecated “unload” wording.

## Required changes

1. **Make refresh safe against active ingestion.** Prefer a one-shot awaited backfill job. If forced restart remains, add bounded Schwab requests plus ingestion-aware graceful shutdown/skip logic; do not claim 20:00 is a guaranteed post-retry time.
2. **Fix the timezone contract.** Enforce/verify America/New_York or make the wrapper New-York-time-aware and idempotent. The current system reports PDT.
3. **Harden plists/install:** absolute paths and rendered numeric UID; pre-create logs; `plutil` validation; preflight Node, nodemon, `.env`, and port; explicit `ThrottleInterval` and finite `ExitTimeOut`; health check and rollback.
4. **Make cutover ingestion-aware:** bootstrap refresh first, cut over outside 17:00–00:00 ET, stop old nodemon, wait for port 3001 to clear, then bootstrap backend. Never start the new backend while the old listener is bound.
5. **Add log and secret hygiene:** bounded log rotation/retention that accounts for open launchd descriptors; restrictive log umask; set/validate `0600` on `.env` and `.schwab-token.json`; never copy secrets into plist files.

## Optional suggestions

- Add a status command showing launchd state, child PID, health, and latest ingestion/backfill summary.
- Add acceptance tests: kill the Node child and confirm full-tree recovery; touch a watched file and confirm child-only restart; test a missed calendar trigger across sleep/wake.
- Use `ProcessType=Standard`; do not select Interactive merely to avoid background throttling.

## Sources

- Local macOS `launchd.plist(5)` and `launchctl help kickstart`
- Nodemon FAQ: https://github.com/remy/nodemon/blob/master/faq.md
- Nodemon package docs: https://www.npmjs.com/package/nodemon
- Apple Developer Forum dark-wake discussion: https://developer.apple.com/forums/thread/815034
