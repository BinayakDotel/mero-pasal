#!/usr/bin/env bash
# Vercel build (architecture §11). Runs from apps/web.
#
# - With CONVEX_DEPLOY_KEY (production, later): deploy the Convex functions first, then build the
#   web app against the URL Convex returns (ported from the Convex monorepo template).
# - Without it (M1 test deploys): plain build against NEXT_PUBLIC_CONVEX_URL, i.e. Convex dev.
#   Nothing is pushed to Convex from Vercel in that case.
set -euo pipefail

if [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
  cd ../../packages/backend
  pnpm exec convex deploy --cmd 'cd ../../apps/web && pnpm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL
else
  : "${NEXT_PUBLIC_CONVEX_URL:?Set NEXT_PUBLIC_CONVEX_URL (Convex dev URL) or CONVEX_DEPLOY_KEY in Vercel}"
  pnpm run build
fi
