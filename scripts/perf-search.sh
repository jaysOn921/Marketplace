#!/usr/bin/env bash
# Search performance check on a separate database (tzed_perf) filled with generated listings.
# Your dev and test databases are not touched. Results: tests/artifacts/perf-search.txt
# Usage: scripts/perf-search.sh [listing count, default 20000]
# Needs local MySQL (scripts/setup-local-mysql.sh) with root access over the socket.
set -euo pipefail
cd "$(dirname "$0")/.."

COUNT="${1:-20000}"
DB_USER="${DB_USER:-tzed}"
DB_PASSWORD="${DB_PASSWORD:-tzed_dev_password}"
export DATABASE_URL="mysql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:3306/tzed_perf"

mysql -uroot <<SQL
CREATE DATABASE IF NOT EXISTS tzed_perf CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
GRANT ALL PRIVILEGES ON tzed_perf.* TO '${DB_USER}'@'localhost', '${DB_USER}'@'127.0.0.1';
SQL

(cd apps/api && npx prisma migrate deploy >/dev/null)
(cd apps/api && LOG_LEVEL=silent NODE_ENV=test npx tsx ../../scripts/perf-search.ts "$COUNT")
