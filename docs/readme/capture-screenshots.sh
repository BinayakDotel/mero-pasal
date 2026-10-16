#!/usr/bin/env bash
set -euo pipefail
# One-off capture of mockup screens for README.md. Requires a local static server
# serving docs/mockups (python3 -m http.server 8765 --directory docs/mockups).

CHROME="${CHROME:-$HOME/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing}"
if [[ ! -x "$CHROME" ]]; then
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
fi
OUT="$(cd "$(dirname "$0")" && pwd)"
BASE="${BASE:-http://127.0.0.1:8765}"

shot() {
  local name="$1" url="$2" w="$3" h="$4"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 \
    --window-size="$w,$h" \
    --virtual-time-budget=8000 \
    --screenshot="$OUT/$name.png" \
    "$url"
  echo "wrote $name.png"
}

shot today    "$BASE/father-app.html?shot=today"    430 900
shot preview  "$BASE/father-app.html?shot=preview"  430 900
shot party    "$BASE/father-app.html?shot=party"    430 900
shot amount   "$BASE/father-app.html?shot=amount"   430 900
shot bills    "$BASE/father-app.html?shot=bills"    430 900
shot accounts "$BASE/father-app.html?shot=accounts" 430 900
shot account  "$BASE/father-app.html?shot=account"  430 900
shot bill     "$BASE/father-app.html?shot=bill"     430 900
shot admin-overview "$BASE/admin-console.html?shot=overview" 1440 900
shot admin-bills    "$BASE/admin-console.html?shot=bills"    1440 900
shot admin-accounts "$BASE/admin-console.html?shot=accounts" 1440 900
