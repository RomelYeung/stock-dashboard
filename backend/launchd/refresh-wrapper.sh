#!/bin/bash
set -u

PATH=/opt/homebrew/bin:/usr/bin:/bin

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# NY guards: only run Mon-Fri 19:00-23:59 ET
NY_DATE=$(TZ=America/New_York date +%F)
NY_DOW=$(TZ=America/New_York date +%u)
NY_HOUR=$(TZ=America/New_York date +%H)

if [ "$NY_DOW" -le 5 ] && [ "$NY_HOUR" -ge 19 ]; then
  : # proceed
else
  exit 0
fi

# Marker dedupe: skip if already ran today
MARKER_DIR="$HOME/Library/Application Support/stock-dashboard"
mkdir -p "$MARKER_DIR"
MARKER_FILE="$MARKER_DIR/last-iv-refresh"
if [ -f "$MARKER_FILE" ] && [ "$(cat "$MARKER_FILE" 2>/dev/null)" = "$NY_DATE" ]; then
  exit 0
fi

# Log hygiene: truncate logs >50MB, keeping newest ~2MB
LOG_DIR="$HOME/Library/Logs/stock-dashboard"
mkdir -p "$LOG_DIR"
for f in backend.out.log backend.err.log refresh.out.log refresh.err.log; do
  fp="$LOG_DIR/$f"
  if [ -f "$fp" ]; then
    fsize=$(wc -c < "$fp" 2>/dev/null || echo 0)
    if [ "$fsize" -gt 52428800 ]; then
      tail -c 2097152 "$fp" > "$fp.tmp" && cat "$fp.tmp" > "$fp" && rm -f "$fp.tmp"
    fi
  fi
done

# Run backfill
RC=0
node "$ROOT/backend/scripts/backfill-once.js" >>"$LOG_DIR/refresh.out.log" 2>>"$LOG_DIR/refresh.err.log" || RC=$?

# Only mark success
if [ "$RC" -eq 0 ]; then
  printf '%s' "$NY_DATE" > "$MARKER_FILE"
fi

# Always exit 0 — never let launchd mark the job failed
exit 0
