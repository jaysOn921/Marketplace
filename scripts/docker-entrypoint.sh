#!/bin/sh
# Production container start: apply pending database migrations, then run the app
# (or whatever command was given, e.g. `node dist/seed.js`).
set -e
if [ "${SKIP_MIGRATIONS:-}" != "true" ]; then
  prisma migrate deploy
fi
exec "$@"
