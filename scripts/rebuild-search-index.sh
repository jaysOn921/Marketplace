#!/usr/bin/env bash
# Rebuilds the MySQL full-text search indexes (listings, help articles).
#
# InnoDB keeps recently added rows in an in-memory full-text cache. If MySQL is stopped
# abruptly (e.g. a container is killed), rows added just before can be missing from search
# after restart. Rebuilding the tables fixes that. Safe to run any time; fast on small data,
# but on a large production database run it in a quiet period.
#
# Usage: scripts/rebuild-search-index.sh [database ...]   (default: tzed tzed_test)
set -euo pipefail

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
DATABASES=("$@")
[ ${#DATABASES[@]} -eq 0 ] && DATABASES=(tzed tzed_test)

for db in "${DATABASES[@]}"; do
  tables=$($SUDO mysql -N -e "SELECT GROUP_CONCAT(TABLE_NAME) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${db}' AND TABLE_NAME IN ('listings','faq_articles')")
  if [ -n "$tables" ] && [ "$tables" != "NULL" ]; then
    $SUDO mysql "$db" -e "OPTIMIZE TABLE ${tables//,/, };" >/dev/null
    echo "==> Rebuilt search indexes in ${db} (${tables})"
  fi
done
