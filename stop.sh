#!/usr/bin/env bash
# Stop WebTerm server
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/webterm.pid"

if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill "$PID" 2>/dev/null; then
    echo "✓ WebTerm stopped (PID $PID)"
    rm -f "$PID_FILE"
  else
    echo "⚠ Process $PID not running"
    rm -f "$PID_FILE"
  fi
else
  pkill -f "node.*server.js" && echo "✓ Stopped" || echo "⚠ Not running"
fi
