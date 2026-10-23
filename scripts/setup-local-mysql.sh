#!/usr/bin/env bash
# Installs (if needed) and starts a local MySQL 8 server, then creates the
# dev and test databases plus an app user. Intended for Ubuntu/Debian dev
# machines and Claude Code cloud sessions. If you have Docker, you can use
# `docker compose -f docker-compose.dev.yml up -d` instead.
#
# Usage: scripts/setup-local-mysql.sh
# Override defaults with env vars: DB_USER, DB_PASSWORD, DB_NAME, DB_TEST_NAME
set -euo pipefail

DB_USER="${DB_USER:-tzed}"
DB_PASSWORD="${DB_PASSWORD:-tzed_dev_password}"
DB_NAME="${DB_NAME:-tzed}"
DB_TEST_NAME="${DB_TEST_NAME:-tzed_test}"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

if ! command -v mysqld >/dev/null 2>&1; then
  echo "==> Installing mysql-server"
  $SUDO apt-get update -qq
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq mysql-server >/dev/null
fi

if ! $SUDO mysqladmin ping --silent >/dev/null 2>&1; then
  echo "==> Starting MySQL"
  if command -v systemctl >/dev/null 2>&1 && systemctl is-system-running >/dev/null 2>&1; then
    $SUDO systemctl start mysql
  else
    $SUDO service mysql start >/dev/null
  fi
fi

for _ in $(seq 1 30); do
  $SUDO mysqladmin ping --silent >/dev/null 2>&1 && break
  sleep 1
done

echo "==> Creating databases '${DB_NAME}', '${DB_TEST_NAME}' and user '${DB_USER}'"
$SUDO mysql <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS \`${DB_TEST_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost', '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON \`${DB_TEST_NAME}\`.* TO '${DB_USER}'@'localhost', '${DB_USER}'@'127.0.0.1';
-- Prisma Migrate needs to create a temporary shadow database.
GRANT CREATE, DROP ON *.* TO '${DB_USER}'@'localhost', '${DB_USER}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

echo "==> MySQL ready: mysql://${DB_USER}:***@127.0.0.1:3306/${DB_NAME}"
