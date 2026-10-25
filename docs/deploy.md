# Deploying TZed

TZed runs as three containers on one Linux server, defined in `docker-compose.yml`:

| Container | What it does                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| `caddy`   | Takes HTTPS on ports 80/443. It gets and renews the certificate automatically and forwards requests to the app. |
| `app`     | The API, which also serves the web app. On every start it applies pending database migrations first.            |
| `mysql`   | MySQL 8.0. It isn't published outside the server: only the app can reach it.                                    |

Data lives in Docker volumes:

- `mysql-data`: the database.
- `uploads`: listing photos.
- `caddy-data`: the HTTPS certificates.

`scripts/backup-db.sh` backs up the database and the photos into `backups/`.

## 1. What you need

- **A Linux server** (Ubuntu 24.04 LTS or Debian 12) with at least 2 vCPU, 2 GB RAM and 40 GB of disk. 4 GB RAM gives room to grow.
- **Docker Engine with the Compose plugin.** Install it with `curl -fsSL https://get.docker.com | sh`, or follow Docker's own guide for your system.
- **A domain name**, e.g. `tzed.co.tz` or `tzed.co.zm`. Create an `A` record (and an `AAAA` record if the server has IPv6) pointing at the server.
- **An SMTP account for outgoing email** (Brevo, Mailgun, Amazon SES, Postmark…). Set up SPF and DKIM for your domain as the provider describes, so emails don't land in spam.
- **Open firewall ports** 22 (SSH), 80 and 443 (TCP), and 443 (UDP, for HTTP/3). Close everything else.

**Where to host is a compliance decision.**

- Tanzania's Personal Data Protection Act 2022 and Zambia's Data Protection Act 2021 both regulate sending personal data abroad. Wherever the server is, one country's data is "abroad".
- Check registration with Tanzania's PDPC and Zambia's Office of the Data Protection Commissioner before launch. PLAN.md has more on this.
- A cloud region in southern Africa (e.g. Johannesburg or Cape Town) keeps response times low for both countries.

## 2. First deploy

On the server:

```bash
sudo mkdir -p /srv/tzed && sudo chown "$USER" /srv/tzed
git clone https://github.com/jaysOn921/Marketplace.git /srv/tzed
cd /srv/tzed
cp .env.production.example .env
chmod 600 .env
nano .env
```

Fill in every value in `.env`:

- `DOMAIN` and `APP_URL`
- New random secrets: run `openssl rand -base64 48` three times, for `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` and `SESSION_SECRET`.
- `SMTP_URL` and `MAIL_FROM`.
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`, for the first admin.

Then:

```bash
docker compose up -d --build                    # build the app image and start everything
docker compose ps                               # wait until app and mysql show "healthy"
docker compose run --rm app node dist/seed.js   # countries, regions, rate, categories, help articles, admin
```

The seed is safe to re-run. It only adds what's missing and never changes an existing admin's password. It doesn't create the demo sellers, buyers or listings used in development.

Then:

1. Open `https://<your domain>` and sign in as the admin.
2. Go to **Account** and change the admin password.
3. Delete `SEED_ADMIN_PASSWORD` from `.env`.
4. Go to **Admin → Exchange rate** and set today's ZMW→TZS rate. The seed starts at 1 ZMW = 131.04 TZS, the rate on 23 Oct 2026.
5. Go to **Admin → Help articles** and check the help centre and the prohibited-items policy before launch.
6. Run the read-only check from any computer with this repo:

   ```bash
   node tests/e2e/production-smoke.mjs https://<your domain>
   ```

7. Schedule backups (section 4).

## 3. Updating to a new version

```bash
cd /srv/tzed
scripts/backup-db.sh --label pre-update   # a backup you can return to
git pull
docker compose up -d --build              # rebuilds the app; migrations run on start
docker compose ps && docker compose logs --tail 50 app
node tests/e2e/production-smoke.mjs https://<your domain>   # from your computer
```

The site is down for the few seconds the app restarts.

**To roll back:**

1. `git checkout <previous commit or tag>`, then `docker compose up -d --build`.
2. If the new version changed the database (a new migration), also restore the pre-update backup (section 5).

## 4. Backups

```bash
scripts/backup-db.sh
```

This writes `backups/tzed-db-<date>.sql.gz` (the whole database) and `backups/tzed-uploads-<date>.tar.gz` (all photos), then keeps the newest `BACKUP_KEEP` (default 14) of each. Each backup is written to a temporary file and checked before it's kept, so a failed run never leaves a broken backup that looks real.

Schedule it daily with cron (`crontab -e`):

```cron
17 2 * * * cd /srv/tzed && scripts/backup-db.sh >> backups/backup.log 2>&1
```

**Keep copies off the server.** A backup on the same disk doesn't survive losing the server. For example, with [rclone](https://rclone.org) set up for any cloud storage:

```cron
47 2 * * * rclone copy /srv/tzed/backups remote:tzed-backups --include "tzed-*.gz" --max-age 48h
```

Backups contain personal data. Keep the storage private, and encrypted if the provider offers it.

**`.env` is not in the backups.** Keep a copy of it in a password manager: without `SESSION_SECRET` everyone is signed out, and without the MySQL passwords a restored database volume can't be reached.

## 5. Restoring

```bash
scripts/restore-db.sh backups/tzed-db-<date>.sql.gz --uploads backups/tzed-uploads-<date>.tar.gz
```

What happens:

1. It asks you to type `restore`.
2. It takes a safety backup of the current state (`tzed-*-pre-restore-*`).
3. It stops the app, replaces the database (and the photos, with `--uploads`), then starts the app again.
4. If the backup is older than the code, the app applies the newer migrations as it starts.

Leave out `--uploads` to restore only the database.

**Practise a restore every few months, so you know backups work before you need one.** Run it on a spare server, or locally with the same commands. Every script in this guide also takes `COMPOSE="docker compose -p tzed-drill --env-file drill.env"`, to run against a separate stack.

**Without Docker** (MySQL on the server or elsewhere): add `--local` to both scripts. They then use `DATABASE_URL` and `UPLOAD_DIR` from the environment or `.env`.

## 6. Day to day

| Task                                  | Command                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| Status and health                     | `docker compose ps`                                                            |
| App logs (JSON, one line per request) | `docker compose logs -f app`                                                   |
| Errors only                           | `docker compose logs app \| grep '"level":50'`                                 |
| Restart the app                       | `docker compose restart app`                                                   |
| MySQL shell                           | `docker compose exec mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" tzed'` |
| Disk use of volumes                   | `docker system df -v`                                                          |
| Run the data retention job now        | `docker compose exec app node dist/retention.js`                               |

Logs are rotated: at most 5 × 20 MB for the app.

**Data retention** runs inside the app once a day (old sessions, sign-in links, notifications and stats; audit-log IPs; dormant accounts, see `docs/data-protection.md`). Its summary is logged as `Retention job finished`. Set `RETENTION_JOB=false` to turn it off, for example when you run it from cron instead.

**Monitoring:** point an uptime monitor (UptimeRobot, Better Stack…) at `https://<your domain>/api/v1/health`. It returns `{"status":"ok","db":"ok"}` with status 200 when the app and database are fine, and 503 otherwise.

## 7. Security checklist

- **SSH:** keys only (`PasswordAuthentication no`), and no root login.
- **System updates:** turn on automatic security updates (`unattended-upgrades` on Ubuntu/Debian).
- **Ports:** only 22, 80 and 443 open. MySQL is never published.
- **`.env`:** permissions `600`. Never commit it.
- **Secrets:** rotate `SESSION_SECRET` if you think it has leaked. Everyone is signed out.
- **Admins:** each admin has their own account. Remove accounts that are no longer needed.
- **Audit log:** review it now and then (**Admin → Audit log**).

## 8. Troubleshooting

| Problem                                                           | What to check                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The browser shows a certificate error                             | `docker compose logs caddy`. DNS must point at this server and ports 80/443 must be open before Caddy can get a certificate.                                                                                                          |
| `app` keeps restarting                                            | `docker compose logs app`. "Invalid environment configuration" names the setting to fix in `.env`.                                                                                                                                    |
| Emails don't arrive                                               | The app logs show SMTP errors. Check `SMTP_URL` and the provider's sending limits and SPF/DKIM.                                                                                                                                       |
| Uploads fail with "too large"                                     | Photos are limited to 10 MB each. Caddy accepts up to 90 MB per request (8 photos).                                                                                                                                                   |
| New listings missing from search after MySQL was stopped abruptly | Rebuild the search indexes: `docker compose exec mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot tzed -e "OPTIMIZE TABLE listings, faq_articles"'` (this is what `scripts/rebuild-search-index.sh` does for a local MySQL) |

## Limits of this setup

It's one server, which is right for launch. To grow beyond it:

- Move MySQL to a managed database.
- Move photos to object storage. The storage layer has a single driver interface, in `apps/api/src/modules/media/storage.ts`.
- Use a shared store such as Redis for rate limits before running more than one app container.
