#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UID_NUM=$(id -u)
GUI="gui/$UID_NUM"

DRY_RUN=false
ROLLBACK=false
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --rollback) ROLLBACK=true ;;
    --force) FORCE=true ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

# ─── Rollback ─────────────────────────────────────────────────────────
if [ "$ROLLBACK" = true ]; then
  echo "==> Rolling back launchd agents..."
  launchctl bootout "$GUI/com.stockdashboard.backend" 2>/dev/null || true
  launchctl bootout "$GUI/com.stockdashboard.refresh" 2>/dev/null || true
  echo "==> Agents unloaded. To restart manually:"
  echo "    cd $ROOT/backend && npx nodemon server.js"
  exit 0
fi

# ─── Preflight checks ────────────────────────────────────────────────
echo "==> Running preflight checks..."
ERRORS=0

if [ ! -x /opt/homebrew/bin/node ]; then
  echo "FAIL: /opt/homebrew/bin/node not found or not executable"; ERRORS=$((ERRORS+1))
fi
if [ ! -f "$ROOT/backend/node_modules/nodemon/bin/nodemon.js" ]; then
  echo "FAIL: nodemon not found at $ROOT/backend/node_modules/nodemon/bin/nodemon.js"; ERRORS=$((ERRORS+1))
fi
if [ ! -f "$ROOT/backend/.env" ]; then
  echo "FAIL: $ROOT/backend/.env not found"; ERRORS=$((ERRORS+1))
fi
if [ ! -f "$ROOT/backend/.schwab-token.json" ]; then
  echo "FAIL: $ROOT/backend/.schwab-token.json not found"; ERRORS=$((ERRORS+1))
fi
if ! command -v plutil &>/dev/null; then
  echo "FAIL: plutil not found"; ERRORS=$((ERRORS+1))
fi
if [ ! -f "$ROOT/backend/prisma/dev.db" ]; then
  echo "FAIL: $ROOT/backend/prisma/dev.db not found"; ERRORS=$((ERRORS+1))
fi

if [ "$ERRORS" -gt 0 ]; then
  echo "==> Preflight failed with $ERRORS error(s). Aborting."
  exit 1
fi
echo "    All preflight checks passed."

# ─── Window guard ─────────────────────────────────────────────────────
NY_DOW=$(TZ=America/New_York date +%u)
NY_HOUR=$(TZ=America/New_York date +%H)
if [ "$NY_DOW" -le 5 ] && [ "$NY_HOUR" -ge 17 ]; then
  if [ "$FORCE" = false ]; then
    echo "==> ABORT: It is Mon-Fri 17:00-23:59 ET — ingestion or retry chain may still be in flight."
    echo "    Re-run with --force to override (not recommended)."
    exit 1
  fi
  echo "WARNING: Proceeding during ingestion window (--force)."
fi

# ─── Dry run ──────────────────────────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
  TMPDIR=$(mktemp -d)
  echo "==> Dry run: rendering templates into $TMPDIR"

  sed -e "s|__PROJECT_ROOT__|$ROOT|g" -e "s|__HOME__|$HOME|g" \
    "$ROOT/backend/launchd/com.stockdashboard.backend.plist.template" \
    > "$TMPDIR/com.stockdashboard.backend.plist"

  sed -e "s|__PROJECT_ROOT__|$ROOT|g" -e "s|__HOME__|$HOME|g" \
    "$ROOT/backend/launchd/com.stockdashboard.refresh.plist.template" \
    > "$TMPDIR/com.stockdashboard.refresh.plist"

  echo "==> Validating rendered plists..."
  plutil -lint "$TMPDIR/com.stockdashboard.backend.plist"
  plutil -lint "$TMPDIR/com.stockdashboard.refresh.plist"

  echo "==> Dry run complete. No changes made."
  rm -rf "$TMPDIR"
  exit 0
fi

# ─── Install ──────────────────────────────────────────────────────────
echo "==> Installing launchd agents..."

# 1) Create directories
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/stock-dashboard" "$HOME/Library/Application Support/stock-dashboard"
chmod 760 "$HOME/Library/Logs/stock-dashboard"
find "$HOME/Library/Logs/stock-dashboard" -maxdepth 1 -type f -exec chmod 640 {} + 2>/dev/null || true

# 2) Render templates
BACKEND_PLIST="$HOME/Library/LaunchAgents/com.stockdashboard.backend.plist"
REFRESH_PLIST="$HOME/Library/LaunchAgents/com.stockdashboard.refresh.plist"

sed -e "s|__PROJECT_ROOT__|$ROOT|g" -e "s|__HOME__|$HOME|g" \
  "$ROOT/backend/launchd/com.stockdashboard.backend.plist.template" > "$BACKEND_PLIST"

sed -e "s|__PROJECT_ROOT__|$ROOT|g" -e "s|__HOME__|$HOME|g" \
  "$ROOT/backend/launchd/com.stockdashboard.refresh.plist.template" > "$REFRESH_PLIST"

chmod 640 "$BACKEND_PLIST" "$REFRESH_PLIST"

echo "    Rendered plists:"
plutil -lint "$BACKEND_PLIST"
plutil -lint "$REFRESH_PLIST"

# 3) Secure secrets
chmod 600 "$ROOT/backend/.env" "$ROOT/backend/.schwab-token.json"
echo "    Set .env and .schwab-token.json to 0600."

# 4) Bootout existing agents (idempotent)
echo "    Booting out existing agents (if any)..."
launchctl bootout "$GUI/com.stockdashboard.backend" 2>/dev/null || true
launchctl bootout "$GUI/com.stockdashboard.refresh" 2>/dev/null || true

# 5) Bootstrap refresh agent first (inert — no KeepAlive, no RunAtLoad)
echo "    Bootstrapping refresh agent..."
launchctl bootstrap "$GUI" "$REFRESH_PLIST"

# 6) Legacy shutdown: find and kill existing nodemon processes
echo "    Searching for legacy nodemon processes..."
LEGACY_PIDS=""
for pid in $(pgrep -f 'nodemon|server\.js' 2>/dev/null || true); do
  CMD="$(ps -o command= -p "$pid" 2>/dev/null || true)"
  if printf '%s' "$CMD" | grep -qF "$ROOT/backend" && printf '%s' "$CMD" | grep -qE 'nodemon|server\.js'; then
    LEGACY_PIDS="$LEGACY_PIDS $pid"
  fi
done
LEGACY_PIDS=$(echo "$LEGACY_PIDS" | xargs)  # trim whitespace
if [ -n "$LEGACY_PIDS" ]; then
  echo "    Found legacy PIDs: $LEGACY_PIDS"
  # Find node children of nodemon
  for pid in $LEGACY_PIDS; do
    CHILD_PIDS=$(pgrep -P "$pid" 2>/dev/null || true)
    if [ -n "$CHILD_PIDS" ]; then
      LEGACY_PIDS="$LEGACY_PIDS $CHILD_PIDS"
    fi
  done
  # SIGTERM all
  for pid in $LEGACY_PIDS; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  # Wait up to 20s for exit
  ELAPSED=0
  STILL_ALIVE=""
  for pid in $LEGACY_PIDS; do
    while kill -0 "$pid" 2>/dev/null && [ "$ELAPSED" -lt 20 ]; do
      sleep 1
      ELAPSED=$((ELAPSED+1))
    done
  done
  # SIGKILL stragglers
  for pid in $LEGACY_PIDS; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "    SIGKILL straggler: $pid"
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
else
  echo "    No legacy nodemon processes found."
fi

# Verify port free
echo "    Waiting for port 3001 to free..."
PORT_WAIT=0
while lsof -nP -iTCP:3001 -sTCP:LISTEN &>/dev/null && [ "$PORT_WAIT" -lt 10 ]; do
  sleep 1
  PORT_WAIT=$((PORT_WAIT+1))
done
if lsof -nP -iTCP:3001 -sTCP:LISTEN &>/dev/null; then
  echo "FAIL: Port 3001 still in use after waiting. Aborting."
  launchctl bootout "$GUI/com.stockdashboard.refresh" 2>/dev/null || true
  exit 1
fi
echo "    Port 3001 is free."

# 7) Bootstrap backend agent
echo "    Bootstrapping backend agent..."
launchctl bootstrap "$GUI" "$BACKEND_PLIST"

# 8) Health check
echo "    Waiting for /health to respond..."
HEALTH_OK=false
for i in $(seq 1 30); do
  if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
    HEALTH_OK=true
    break
  fi
  sleep 2
done

if [ "$HEALTH_OK" = true ]; then
  echo ""
  echo "============================================"
  echo "  SUCCESS: Backend is running and healthy."
  echo "============================================"
  echo ""
  launchctl print "$GUI/com.stockdashboard.backend" | grep -E "state|pid" || true
  echo ""
  echo "Both agents installed. Logs at:"
  echo "  $HOME/Library/Logs/stock-dashboard/backend.out.log"
  echo "  $HOME/Library/Logs/stock-dashboard/backend.err.log"
  echo "  $HOME/Library/Logs/stock-dashboard/refresh.out.log"
  echo "  $HOME/Library/Logs/stock-dashboard/refresh.err.log"
  echo ""
  echo "To stop:  launchctl bootout gui/$UID_NUM/com.stockdashboard.backend"
  echo "To start: launchctl bootstrap gui/$UID_NUM \"$HOME/Library/LaunchAgents/com.stockdashboard.backend.plist\""
else
  echo "FAIL: /health did not respond within 60s."
  echo "    Rolling back..."
  launchctl bootout "$GUI/com.stockdashboard.backend" 2>/dev/null || true
  echo "    Backend agent unloaded. To restart manually:"
  echo "    cd $ROOT/backend && npx nodemon server.js"
  exit 1
fi
