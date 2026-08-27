# Stock Dashboard — LaunchAgent Supervision

## Architecture

The backend server (Express + nodemon) and an off-hours IV backfill job are each supervised by a macOS user LaunchAgent, providing:

- **Automatic startup** at login (`RunAtLoad` / `KeepAlive`)
- **Crash recovery** — nodemon's `--exitcrash` exits on child failure; launchd respawns it
- **Off-hours data repair** — an hourly one-shot wrapper checks whether today's IV data is complete and runs a backfill if needed

### Why hourly wrapper instead of a calendar cron?

The Mac runs in Pacific time (PDT), but market data operates on New York time. `StartCalendarInterval` uses the machine's local timezone. Rather than trying to map ET triggers to PT calendar fields (which breaks across DST boundaries), the wrapper runs every hour and checks whether it's currently within the Mon–Fri 19:00–23:59 ET window. This survives timezone changes and travel.

### Crash recovery story

1. If nodemon's child (node server.js) crashes, nodemon exits with status 1 (`--exitcrash`)
2. launchd detects the exit and respawns nodemon after `ThrottleInterval` (30s)
3. On startup, `startCronJob()` calls `runBackfill()` which repairs any missed trading days within the last 7 calendar days (skipping if >5 days are deficient)
4. The hourly refresh wrapper provides a second layer: even if the backend was down during the ingestion window, the wrapper will backfill missing days on the next hourly fire after 19:00 ET

## Usage

### Install (full cutover)

```bash
cd backend
./launchd/install.sh
```

This will:
- Preflight-check Node, nodemon, .env, .schwab-token.json, SQLite DB
- Render plist templates with absolute paths
- Secure .env and .schwab-token.json to 0600
- Terminate any legacy nodemon processes
- Bootstrap both launchd agents
- Health-check the backend on port 3001

### Dry run (validate without changes)

```bash
./launchd/install.sh --dry-run
```

Renders templates into a temp directory, runs `plutil -lint`, and runs all preflight checks — but touches nothing on the system.

### Rollback

```bash
./launchd/install.sh --rollback
```

Unloads both launchd agents and prints manual restart instructions.

### Status

```bash
./launchd/status.sh
```

Shows launchd state/PID for both labels, /health status, latest IV data counts, marker file contents, and log file sizes.

### Manual stop/start

```bash
# Stop
launchctl bootout gui/$(id -u)/com.stockdashboard.backend
launchctl bootout gui/$(id -u)/com.stockdashboard.refresh

# Start
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.stockdashboard.backend.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.stockdashboard.refresh.plist
```

## Behavior contract

- **Missed evening ingestion**: heals at the next hourly wrapper fire ≥19:00 ET, or instantly on reboot/login (startup backfill handles ≤5-day gaps)
- **Reboot/sleep**: `RunAtLoad` + `KeepAlive` restarts the backend at login; startup backfill covers any gaps
- **Crash**: nodemon `--exitcrash` + launchd `KeepAlive` respawns within 30s; startup backfill repairs data
- **Refresh marker**: written only when the wrapper completes `runBackfill()` AND the independent completeness check passes (exit 0); a failed backfill leaves the marker untouched so the next hourly fire retries
- **Outages longer than the 7-day lookback**: missed days that have aged out of the window are simply gone; only the most recent (≤5) missed weekdays receive live-API backfill attempts. If those attempts fail (e.g. expired-option history unrecoverable), `backfill-once` exits 1, the marker is not written, and the hourly evening wrapper retries until completeness passes or the window moves on
- **Log rotation**: the wrapper truncates any log file exceeding 50MB, keeping the newest ~2MB (in-place to preserve launchd's open file descriptor)
- **Security**: `.env` and `.schwab-token.json` are set to mode 0600 during install; log dir is 0760, log files and plist files are 0640

## Log locations

```
~/Library/Logs/stock-dashboard/backend.out.log
~/Library/Logs/stock-dashboard/backend.err.log
~/Library/Logs/stock-dashboard/refresh.out.log
~/Library/Logs/stock-dashboard/refresh.err.log
```

## Files

| File | Purpose |
|------|---------|
| `com.stockdashboard.backend.plist.template` | Template for the backend LaunchAgent |
| `com.stockdashboard.refresh.plist.template` | Template for the refresh LaunchAgent |
| `refresh-wrapper.sh` | Hourly NY-time-guarded backfill wrapper |
| `install.sh` | Installer with preflight, cutover, rollback, dry-run |
| `status.sh` | Read-only status helper |
| `README.md` | This file |
