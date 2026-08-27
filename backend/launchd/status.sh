#!/bin/bash
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UID_NUM=$(id -u)
GUI="gui/$UID_NUM"

echo "=== Stock Dashboard Status ==="
echo ""

# launchd state
for LABEL in com.stockdashboard.backend com.stockdashboard.refresh; do
  echo "--- $LABEL ---"
  launchctl print "$GUI/$LABEL" 2>/dev/null | grep -E "state =|pid =|last exit" || echo "  (not loaded)"
  echo ""
done

# Health check
HEALTH=$(curl -sf http://localhost:3001/health 2>/dev/null || echo "(unreachable)")
echo "--- Health ---"
echo "  $HEALTH"
echo ""

# Latest IV data
echo "--- Latest HistoricalIV (last 3 days) ---"
sqlite3 "$ROOT/backend/prisma/dev.db" \
  "SELECT date(\"date\"/1000,'unixepoch','utc'), COUNT(*) FROM HistoricalIV GROUP BY 1 ORDER BY 1 DESC LIMIT 3;" 2>/dev/null || echo "  (unable to query)"
echo ""

# Marker file
MARKER_FILE="$HOME/Library/Application Support/stock-dashboard/last-iv-refresh"
echo "--- Refresh Marker ---"
if [ -f "$MARKER_FILE" ]; then
  echo "  last-iv-refresh: $(cat "$MARKER_FILE")"
else
  echo "  (no marker file)"
fi
echo ""

# Log sizes
LOG_DIR="$HOME/Library/Logs/stock-dashboard"
echo "--- Log Files ---"
for f in backend.out.log backend.err.log refresh.out.log refresh.err.log; do
  fp="$LOG_DIR/$f"
  if [ -f "$fp" ]; then
    SIZE=$(wc -c < "$fp" 2>/dev/null || echo "?")
    echo "  $f: ${SIZE} bytes"
  else
    echo "  $f: (not found)"
  fi
done
