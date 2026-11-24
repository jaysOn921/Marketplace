#!/usr/bin/env bash
# Checks the installable app against a production build (offline reading only works with
# built files, not the dev server): builds, runs the API in production mode on port 4100
# with the dev database, and runs tests/e2e/pwa-flow.mjs. The test goes offline for real by
# stopping this server, then starts it again.
# Usage: scripts/pwa-check.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PWA_CHECK_PORT:-4100}"
npm run build >/dev/null
mkdir -p tests/artifacts
pidfile=tests/artifacts/pwa-check-server.pid
cat > tests/artifacts/pwa-check-server.sh <<SH
#!/usr/bin/env bash
# Database and VAPID keys from .env; a throwaway session secret; no real email or clean-up job.
set -a; source .env; set +a
NODE_ENV=production PORT=$PORT SESSION_SECRET=$(openssl rand -hex 32) \\
  SMTP_URL=smtp://127.0.0.1:9 RETENTION_JOB=false ADMIN_TWO_STEP=false LOG_LEVEL=warn \\
  nohup node apps/api/dist/server.js >> tests/artifacts/pwa-check-server.log 2>&1 &
echo \$! > $pidfile
for _ in \$(seq 1 60); do curl -sf http://localhost:$PORT/api/v1/health >/dev/null && exit 0; sleep 0.5; done
echo "server did not start" >&2; exit 1
SH
chmod +x tests/artifacts/pwa-check-server.sh
stop="kill \$(cat $pidfile) && while curl -sf http://localhost:$PORT/api/v1/health >/dev/null; do sleep 0.2; done"
trap 'kill $(cat $pidfile) 2>/dev/null || true' EXIT
tests/artifacts/pwa-check-server.sh
# The real site sits behind Caddy, which tells the app the request came over HTTPS.
BEHIND_HTTPS_PROXY=1 STOP_SERVER="$stop" START_SERVER=tests/artifacts/pwa-check-server.sh \
  node tests/e2e/pwa-flow.mjs "http://localhost:$PORT"
