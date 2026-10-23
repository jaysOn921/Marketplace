#!/usr/bin/env bash
# Restores a backup made by scripts/backup-db.sh. This REPLACES the current database
# (and, with --uploads, all uploaded photos). A safety backup of the current state is
# taken first (backups/tzed-*-pre-restore-*), so a mistaken restore can be undone.
#
# Usage: scripts/restore-db.sh backups/tzed-db-….sql.gz [--uploads backups/tzed-uploads-….tar.gz]
#                              [--local] [--yes]
#   (default)  the docker-compose.yml stack: the app is stopped during the restore, then
#              started again (it applies any newer migrations on start)
#   --local    MySQL reached through DATABASE_URL; photos go to UPLOAD_DIR (default ./uploads).
#              Stop the app yourself first.
#   --yes      don't ask for confirmation (for scripted restore drills)
set -euo pipefail
cd "$(dirname "$0")/.."
# Override for a different setup, e.g. COMPOSE="docker-compose" or "docker compose -p other".
COMPOSE="${COMPOSE:-docker compose}"

mode=docker
db_file=""
uploads_file=""
assume_yes=no
while [ $# -gt 0 ]; do
  case "$1" in
    --local) mode=local ;;
    --uploads) uploads_file="$2"; shift ;;
    --yes) assume_yes=yes ;;
    -h | --help) sed -n '2,14p' "$0"; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 2 ;;
    *) db_file="$1" ;;
  esac
  shift
done
[ -n "$db_file" ] || { sed -n '2,14p' "$0"; exit 2; }
for f in "$db_file" $uploads_file; do
  [ -f "$f" ] || { echo "No such file: $f" >&2; exit 2; }
  gzip -t "$f" || { echo "$f is not a valid gzip file" >&2; exit 2; }
done

if [ -f .env ]; then
  while IFS='=' read -r key value; do
    [ -z "${!key:-}" ] && export "$key=$value"
  done < <(grep -E '^(DATABASE_URL|UPLOAD_DIR)=' .env)
fi
if [ "$mode" = local ]; then
  # shellcheck source=SCRIPTDIR/lib-db-url.sh
  source "$(dirname "$0")/lib-db-url.sh"
  target="$DB_NAME on $DB_HOST"
else
  target="the tzed database in the Docker stack"
fi

echo "This replaces $target with $db_file${uploads_file:+, and all photos with $uploads_file}."
if [ "$assume_yes" != yes ]; then
  read -r -p 'Type "restore" to continue: ' answer
  [ "$answer" = restore ] || { echo "Cancelled."; exit 1; }
fi

echo "Safety backup of the current state…"
backup_args=(--label pre-restore)
[ "$mode" = local ] && backup_args+=(--local)
[ -z "$uploads_file" ] && backup_args+=(--no-uploads)
scripts/backup-db.sh "${backup_args[@]}"

# Recreating the database also removes tables newer than the backup; the app's grants
# (database-level) survive the drop.
recreate="DROP DATABASE IF EXISTS \`__DB__\`; CREATE DATABASE \`__DB__\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
if [ "$mode" = docker ]; then
  $COMPOSE stop app
  # Single quotes on purpose: these variables are expanded inside the MySQL container.
  # shellcheck disable=SC2016
  $COMPOSE exec -T -e RECREATE="$recreate" mysql sh -c \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "$(echo "$RECREATE" | sed "s/__DB__/$MYSQL_DATABASE/g")"'
  # shellcheck disable=SC2016
  gzip -dc "$db_file" | $COMPOSE exec -T mysql sh -c \
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot "$MYSQL_DATABASE"'
  if [ -n "$uploads_file" ]; then
    $COMPOSE run --rm --no-deps -T --entrypoint sh app \
      -c 'find /data/uploads -mindepth 1 -delete && tar -C /data/uploads --strip-components=1 -xzf -' \
      < "$uploads_file"
  fi
  $COMPOSE start app
else
  MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
    -e "${recreate//__DB__/$DB_NAME}"
  gzip -dc "$db_file" | MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME"
  if [ -n "$uploads_file" ]; then
    dir="${UPLOAD_DIR:-uploads}"
    mkdir -p "$dir"
    find "$dir" -mindepth 1 -delete
    tar -C "$dir" --strip-components=1 -xzf "$uploads_file"
  fi
  echo "Now run pending migrations: npm run db:deploy -w @tzed/api"
fi
echo "Restored $db_file${uploads_file:+ and $uploads_file}."
