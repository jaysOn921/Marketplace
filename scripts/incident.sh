#!/usr/bin/env bash
# Tools for a suspected data breach (see docs/breach-response.md). Every command is logged to
# incidents/actions.log. Files in incidents/ hold personal data: keep them on the server or an
# encrypted drive, never in git or chat, and delete them when the incident is closed.
#
# Usage: scripts/incident.sh [--local] <command> [options]
#   evidence [--since YYYY-MM-DD]   save the audit log, failed sign-ins by IP, the admin list
#                                   and a full backup to incidents/<time>/ (default: last 14 days)
#   sign-out-all                    sign everyone out at once (deletes all sessions)
#   reset-passwords --ids FILE|--all
#                                   lock passwords so people must use "Forgot password" (asks to confirm)
#   contacts [--ids FILE] [--country TZ|ZM]
#                                   a list of people to notify (TSV): email, name, language, country
#   (--local uses DATABASE_URL instead of the docker-compose.yml stack.)
# FILE has one user id per line.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="${COMPOSE:-docker compose}"

mode=docker
if [ "${1:-}" = --local ]; then mode=local; shift; fi
cmd="${1:-}"
[ -n "$cmd" ] && shift
case "$cmd" in
  evidence | sign-out-all | reset-passwords | contacts) ;;
  -h | --help | "") sed -n '2,16p' "$0"; exit 0 ;;
  *) echo "Unknown command: $cmd" >&2; exit 2 ;;
esac

if [ "$mode" = local ] && [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)"
  export DATABASE_URL
fi

# Runs SQL from stdin and prints tab-separated rows (with a header row).
sql() {
  if [ "$mode" = docker ]; then
    $COMPOSE exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --batch "$MYSQL_DATABASE"'
  else
    # shellcheck source=SCRIPTDIR/lib-db-url.sh
    source "$(dirname "$0")/lib-db-url.sh"
    MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" --batch "$DB_NAME"
  fi
}

mkdir -p incidents
chmod 700 incidents
log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $(whoami) $*" >> incidents/actions.log; }

# User ids from a file, checked to be numbers, as a SQL list.
id_list() {
  [ -f "$1" ] || { echo "No such file: $1" >&2; exit 2; }
  local ids
  ids="$(grep -Eo '^[0-9]+' "$1" | paste -sd, -)"
  [ -n "$ids" ] || { echo "No user ids in $1" >&2; exit 2; }
  echo "$ids"
}

case "$cmd" in
  evidence)
    since="$(date -u -d '14 days ago' +%Y-%m-%d 2>/dev/null || date -u -v-14d +%Y-%m-%d)"
    [ "${1:-}" = --since ] && since="$2"
    [[ "$since" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "--since needs YYYY-MM-DD" >&2; exit 2; }
    dir="incidents/$(date -u +%Y%m%d-%H%M%S)"
    mkdir -p "$dir"
    sql > "$dir/audit-log.tsv" <<SQL
SELECT id, createdAt, action, actorId, targetType, targetId, ip, userAgent
FROM audit_logs WHERE createdAt >= '$since' ORDER BY id;
SQL
    sql > "$dir/failed-sign-ins-by-ip.tsv" <<SQL
SELECT ip, COUNT(*) AS attempts, COUNT(DISTINCT actorId) AS accounts, MIN(createdAt) AS first, MAX(createdAt) AS last
FROM audit_logs WHERE action IN ('auth.login_failed', 'auth.two_step_failed') AND createdAt >= '$since'
GROUP BY ip ORDER BY attempts DESC;
SQL
    sql > "$dir/admin-actions.tsv" <<SQL
SELECT a.createdAt, u.email, a.action, a.targetType, a.targetId, a.ip
FROM audit_logs a JOIN users u ON u.id = a.actorId
WHERE u.role = 'ADMIN' AND a.createdAt >= '$since' ORDER BY a.id;
SQL
    sql > "$dir/admins.tsv" <<'SQL'
SELECT id, email, status, twoStepEnabledAt, lastLoginAt, lastActiveAt FROM users WHERE role = 'ADMIN';
SQL
    if [ "$mode" = docker ]; then scripts/backup-db.sh --label incident; else scripts/backup-db.sh --local --label incident; fi
    log "evidence since $since -> $dir"
    echo "Evidence saved in $dir (and a backup labelled 'incident' in backups/)."
    ;;

  sign-out-all)
    echo "SELECT COUNT(*) AS sessions FROM sessions; DELETE FROM sessions;" | sql
    log "sign-out-all"
    echo "Everyone is signed out. Pages already open will ask them to sign in again."
    ;;

  reset-passwords)
    case "${1:-}" in
      --all) where="role = 'USER' AND status <> 'DELETED'"; what="every non-admin account" ;;
      --ids) where="id IN ($(id_list "$2")) AND status <> 'DELETED'"; what="the accounts in $2" ;;
      *) echo "reset-passwords needs --ids FILE or --all" >&2; exit 2 ;;
    esac
    read -r -p "Lock the passwords of $what? They will need 'Forgot password'. Type yes: " ok
    [ "$ok" = yes ] || { echo "Nothing changed."; exit 1; }
    # '!' is not a valid password hash, so no password matches it until it is reset.
    echo "UPDATE users SET passwordHash = '!' WHERE $where; SELECT ROW_COUNT() AS locked;" | sql
    echo "DELETE FROM sessions WHERE userId IN (SELECT id FROM users WHERE $where);" | sql
    log "reset-passwords $what"
    echo "Done. Tell them to use 'Forgot password' on the sign-in page."
    ;;

  contacts)
    where="u.status = 'ACTIVE'"
    while [ $# -gt 0 ]; do
      case "$1" in
        --ids) where="$where AND u.id IN ($(id_list "$2"))"; shift ;;
        --country)
          [[ "$2" =~ ^(TZ|ZM)$ ]] || { echo "--country is TZ or ZM" >&2; exit 2; }
          where="$where AND c.code = '$2'"; shift ;;
        *) echo "Unknown option: $1" >&2; exit 2 ;;
      esac
      shift
    done
    # Tab-separated (names can contain commas); opens in any spreadsheet.
    file="incidents/contacts-$(date -u +%Y%m%d-%H%M%S).tsv"
    echo "SELECT u.email, u.name, u.locale AS language, c.code AS country FROM users u JOIN countries c ON c.id = u.countryId WHERE $where ORDER BY u.id;" |
      sql > "$file"
    log "contacts ($where) -> $file"
    echo "$(($(wc -l < "$file") - 1)) people in $file"
    ;;
esac
