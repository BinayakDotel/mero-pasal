# Mero Pasal: everyday commands. Run `just` to list them.
# Production commands (convex deploy, vercel --prod, prod data) are intentionally NOT here
# (AGENTS.md rule 9): a human runs those by hand.

set shell := ["bash", "-euo", "pipefail", "-c"]

port := "3000"
dev_dir := justfile_directory() / ".dev"
pid_file := dev_dir / "dev.pid"
log_file := dev_dir / "dev.log"

# List recipes
default:
    @just --list --unsorted

# ── Setup ─────────────────────────────────────────────────────────────────────

# Install dependencies and the Playwright browser (first run, or after pulling)
setup:
    pnpm install
    pnpm --filter @mero-pasal/web exec playwright install chromium

# Check local env files are filled in (prints only ✓/✗, never values)
env-check:
    #!/usr/bin/env bash
    set -uo pipefail
    ok=0
    check() { # file key
      if [ -f "$1" ] && grep -Eq "^$2=.+" "$1"; then echo "✓ $2 ($1)"; else echo "✗ $2 missing in $1"; ok=1; fi
    }
    check packages/backend/.env.local CONVEX_DEPLOYMENT
    check apps/web/.env.local NEXT_PUBLIC_CONVEX_URL
    check apps/web/.env.local NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    check apps/web/.env.local NEXT_PUBLIC_CLERK_SIGN_IN_URL
    check apps/web/.env.local CLERK_SECRET_KEY
    exit $ok

# ── Run locally ───────────────────────────────────────────────────────────────

# Web app + Convex dev watcher in this terminal (Ctrl+C stops both)
dev:
    PORT={{port}} pnpm exec turbo run dev

# Start web app + Convex dev watcher in the background (logs: `just logs`)
run:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p "{{dev_dir}}"
    if lsof -nP -iTCP:{{port}} -sTCP:LISTEN >/dev/null 2>&1; then
      echo "Port {{port}} is already in use. Run 'just status', or 'just stop' first."
      exit 1
    fi
    PORT={{port}} nohup pnpm exec turbo run dev --ui=stream > "{{log_file}}" 2>&1 &
    echo $! > "{{pid_file}}"
    echo "Starting… (logs: just logs)"
    for _ in $(seq 1 90); do
      if lsof -nP -iTCP:{{port}} -sTCP:LISTEN >/dev/null 2>&1; then
        echo "✓ App on http://localhost:{{port}}  ·  stop with: just stop"
        exit 0
      fi
      if ! kill -0 "$(cat "{{pid_file}}")" 2>/dev/null; then
        echo "✗ Dev stopped while starting. Last log lines:"
        tail -n 25 "{{log_file}}"
        rm -f "{{pid_file}}"
        exit 1
      fi
      sleep 1
    done
    echo "Still starting after 90 s: check 'just logs'."

# Stop what `just run` started (and anything else serving the app port)
stop:
    #!/usr/bin/env bash
    set -uo pipefail
    stopped=0
    kill_tree() { # pid: children first, so turbo can't respawn them
      local child
      for child in $(pgrep -P "$1"); do kill_tree "$child"; done
      kill "$1" 2>/dev/null && stopped=1
    }
    if [ -f "{{pid_file}}" ]; then
      kill_tree "$(cat "{{pid_file}}")"
      rm -f "{{pid_file}}"
    fi
    for pid in $(lsof -tiTCP:{{port}} -sTCP:LISTEN 2>/dev/null); do kill "$pid" && stopped=1; done
    for pid in $(pgrep -f "{{justfile_directory()}}/node_modules/.*convex.* dev" 2>/dev/null); do
      kill "$pid" && stopped=1
    done
    if [ "$stopped" = 1 ]; then echo "✓ Stopped"; else echo "Nothing was running"; fi

# Stop, then start again in the background
restart: stop run

# Is the app / Convex watcher running?
status:
    #!/usr/bin/env bash
    set -uo pipefail
    if lsof -nP -iTCP:{{port}} -sTCP:LISTEN >/dev/null 2>&1; then
      echo "✓ App running on http://localhost:{{port}}"
    else
      echo "✗ App not running (start: just run)"
    fi
    if pgrep -f "{{justfile_directory()}}/node_modules/.*convex.* dev" >/dev/null 2>&1; then
      echo "✓ Convex dev watcher running (pushes backend changes to the dev deployment)"
    else
      echo "· Convex dev watcher not running"
    fi
    if [ -f "{{pid_file}}" ]; then echo "  started by 'just run' (logs: just logs)"; fi

# Follow the background logs (Ctrl+C stops following, not the app)
logs:
    tail -n 50 -f "{{log_file}}"

# Open the app in Google Chrome (what the Redmi runs), e.g. `just open /spike/voice`
open path="/":
    #!/usr/bin/env bash
    set -euo pipefail
    url="http://localhost:{{port}}{{path}}"
    if open -Ra "Google Chrome" 2>/dev/null; then
      open -a "Google Chrome" "$url"
    else
      echo "Google Chrome not found (brew install --cask google-chrome); using the default browser."
      echo "Note: Brave can't do voice recognition and may block other things Chrome allows."
      open "$url"
    fi

# ── Quality ───────────────────────────────────────────────────────────────────

# Everything a PR needs: lint, typecheck, unit tests
check: lint typecheck test

# Biome lint + format check
lint:
    pnpm lint

# Auto-fix lint and formatting
fix:
    pnpm lint:fix

# TypeScript across all packages
typecheck:
    pnpm typecheck

# Unit tests (shared + backend)
test:
    pnpm test

# Browser tests on a phone-sized viewport (builds and serves on port 3100)
e2e:
    pnpm e2e

# Production build of the web app (local only, deploys nothing)
build:
    pnpm build

# ── Convex (dev deployment only) ──────────────────────────────────────────────

# Push backend functions and schema to the Convex dev deployment once
convex-push:
    pnpm --filter @mero-pasal/backend exec convex dev --once

# Show a table from the dev deployment, e.g. `just data members`
data table:
    pnpm --filter @mero-pasal/backend exec convex data {{table}}

# Open the Convex dashboard for the dev deployment
convex-dashboard:
    pnpm --filter @mero-pasal/backend exec convex dashboard

# ── Git (Graphite) ────────────────────────────────────────────────────────────

# Pull main, delete merged branches, restack
sync:
    gt sync

# Show the current stack
stack:
    gt log short

# ── Housekeeping ──────────────────────────────────────────────────────────────

# Delete build caches (not node_modules, not env files)
clean:
    rm -rf .turbo apps/web/.next apps/web/.turbo packages/*/.turbo apps/web/test-results apps/web/playwright-report
