#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_CMD="python"
else
  echo "Python 3 is required to start Study Desk." >&2
  exit 1
fi

PORT="${1:-4173}"
URL="http://127.0.0.1:${PORT}/index.html"

"$PYTHON_CMD" serve_app.py "$PORT" --disable-llm &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}

trap cleanup INT TERM

sleep 2

if command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
fi

wait "$SERVER_PID"
