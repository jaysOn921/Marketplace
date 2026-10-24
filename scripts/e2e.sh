#!/usr/bin/env bash
# Runs every browser smoke test in tests/e2e/ in an order where each one finds the data it
# needs (support before admin, order before review). Starts the dev servers if they aren't
# running, and stops them again afterwards. Screenshots and reports go to tests/artifacts/.
# Usage: scripts/e2e.sh [test names…]   e.g. scripts/e2e.sh journey a11y
# Needs local MySQL with the dev seed, and no SMTP_URL (emails are read from the dev outbox).
# If the dev servers are already running, start them with DISABLE_RATE_LIMITS=true, or the
# repeated sign-ins hit the sign-in limit.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

BASE="${BASE_URL:-http://localhost:5173}"
TESTS=("$@")
[ ${#TESTS[@]} -eq 0 ] && TESTS=(auth-flow listing-flow search-flow order-flow review-flow
  messaging-flow support-flow admin-flow cart-flow problem-flow journey a11y)

started=""
if ! curl -sf -o /dev/null "$BASE" || ! curl -sf -o /dev/null http://127.0.0.1:4000/api/v1/health; then
  echo "Starting dev servers (log: tests/artifacts/e2e-dev-server.log)…"
  set -m # own process group, so the API and web servers can be stopped together
  # The browser tests sign the demo accounts in many times: no rate limits for this run.
  DISABLE_RATE_LIMITS=true npm run dev > tests/artifacts/e2e-dev-server.log 2>&1 &
  started=$!
  set +m
  for _ in $(seq 1 60); do
    curl -sf -o /dev/null "$BASE" && curl -sf -o /dev/null http://127.0.0.1:4000/api/v1/health && break
    sleep 1
  done
fi

failed=()
for t in "${TESTS[@]}"; do
  echo "── $t"
  node "tests/e2e/$t.mjs" "$BASE" || failed+=("$t")
done

if [ -n "$started" ]; then
  kill -- -"$started" 2>/dev/null
fi

if [ ${#failed[@]} -gt 0 ]; then
  echo "Failed: ${failed[*]}"
  exit 1
fi
echo "All ${#TESTS[@]} browser tests passed."
