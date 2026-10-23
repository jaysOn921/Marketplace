# shellcheck shell=bash disable=SC2034 # the variables are used by the scripts that source this
# Sourced by the backup and restore scripts: splits DATABASE_URL
# (mysql://user:password@host:port/database) into DB_USER, DB_PASSWORD, DB_HOST, DB_PORT
# and DB_NAME. Percent-encoded characters in the password (e.g. %40 for @) are decoded.
if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set (in the environment or .env)." >&2
  exit 2
fi
re='^mysql://([^:@/]+)(:([^@]*))?@([^:/]+)(:([0-9]+))?/([^?]+)'
if [[ ! "$DATABASE_URL" =~ $re ]]; then
  echo "DATABASE_URL should look like mysql://user:password@host:3306/database" >&2
  exit 2
fi
DB_USER="${BASH_REMATCH[1]}"
DB_PASSWORD="$(printf '%b' "${BASH_REMATCH[3]//%/\\x}")"
DB_HOST="${BASH_REMATCH[4]}"
DB_PORT="${BASH_REMATCH[6]:-3306}"
DB_NAME="${BASH_REMATCH[7]}"
