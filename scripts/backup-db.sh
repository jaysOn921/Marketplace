#!/usr/bin/env bash
# Backs up the database (and uploaded photos) into backups/:
#   backups/tzed-db-<label>-YYYYmmdd-HHMMSS.sql.gz
#   backups/tzed-uploads-<label>-YYYYmmdd-HHMMSS.tar.gz
# Keeps the newest $BACKUP_KEEP (default 14) of each kind and deletes older ones.
#
# Usage: scripts/backup-db.sh [--local] [--no-uploads] [--label name]
#   (default)     the docker-compose.yml stack (run from the repo folder on the server)
#   --local       MySQL reached through DATABASE_URL (dev, or an install without Docker);
#                 photos come from UPLOAD_DIR (default ./uploads)
#   --no-uploads  database only
#   --label name  added to the file names, e.g. "pre-restore" (not counted for retention)
# Schedule it with cron, e.g. daily at 02:17:
#   17 2 * * * cd /srv/tzed && scripts/backup-db.sh >> backups/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
# Override for a different setup, e.g. COMPOSE="docker-compose" or "docker compose -p other".
COMPOSE="${COMPOSE:-docker compose}"

mode=docker
uploads=yes
label=""
while [ $# -gt 0 ]; do
  case "$1" in
    --local) mode=local ;;
    --no-uploads) uploads=no ;;
    --label) label="-$2"; shift ;;
    -h | --help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

# Settings from .env, unless already set in the environment.
if [ -f .env ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      BACKUP_KEEP | DATABASE_URL | UPLOAD_DIR) [ -z "${!key:-}" ] && export "$key=$value" ;;
    esac
  done < <(grep -E '^(BACKUP_KEEP|DATABASE_URL|UPLOAD_DIR)=' .env)
fi
KEEP="${BACKUP_KEEP:-14}"
stamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
db_file="backups/tzed-db${label}-${stamp}.sql.gz"
uploads_file="backups/tzed-uploads${label}-${stamp}.tar.gz"
DUMP_OPTS=(--single-transaction --quick --routines --triggers --events --hex-blob --no-tablespaces --set-gtid-purged=OFF)

# Write to a temporary file and rename once complete, so a failed run never leaves a
# half-written backup that looks real.
tmp="$db_file.partial"
trap 'rm -f "$tmp" "$uploads_file.partial"' EXIT

if [ "$mode" = docker ]; then
  $COMPOSE exec -T mysql sh -c \
    "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" exec mysqldump -uroot ${DUMP_OPTS[*]} \"\$MYSQL_DATABASE\"" |
    gzip -9 > "$tmp"
else
  # shellcheck source=SCRIPTDIR/lib-db-url.sh
  source "$(dirname "$0")/lib-db-url.sh"
  MYSQL_PWD="$DB_PASSWORD" mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "${DUMP_OPTS[@]}" "$DB_NAME" |
    gzip -9 > "$tmp"
fi
gzip -t "$tmp"
# A real dump ends with a "Dump completed" line; anything else means it stopped early.
gzip -dc "$tmp" | tail -n 1 | grep -q 'Dump completed' || { echo "Dump looks incomplete" >&2; exit 1; }
mv "$tmp" "$db_file"
echo "Database: $db_file ($(du -h "$db_file" | cut -f1))"

if [ "$uploads" = yes ]; then
  if [ "$mode" = docker ]; then
    $COMPOSE exec -T app tar -C /data -czf - uploads > "$uploads_file.partial"
  else
    dir="${UPLOAD_DIR:-uploads}"
    tar -C "$(dirname "$dir")" -czf "$uploads_file.partial" "$(basename "$dir")"
  fi
  gzip -t "$uploads_file.partial"
  mv "$uploads_file.partial" "$uploads_file"
  echo "Photos:   $uploads_file ($(du -h "$uploads_file" | cut -f1))"
fi

# Retention: only regular (unlabelled) backups are pruned.
if [ -z "$label" ]; then
  for kind in db uploads; do
    # shellcheck disable=SC2012 # our own file names: no spaces or newlines
    ls -1t backups/tzed-"$kind"-[0-9]* 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
  done
fi
echo "Done. Copy backups/ off this server too (see docs/deploy.md)."
