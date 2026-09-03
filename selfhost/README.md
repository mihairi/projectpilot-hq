# Running the project portal on your own server

This folder contains everything needed to install and run the application entirely on
local infrastructure: database, authentication with authenticator-app 2FA, the data API,
and mail through Microsoft Exchange Online. Nothing calls out to a hosted platform.

## About SQLite

SQLite cannot run this application. The whole access-control model — every role
restriction you specified for requesters, analysts, developers, testers, project and
business managers — is enforced inside the database with row-level security policies,
security-definer functions, triggers (priority governance, start-date locking, task
numbering, notifications) and enum types. SQLite has none of those features, so moving
to it would mean deleting the security layer and re-implementing it in application code,
where any direct API call bypasses it.

The local install therefore uses **PostgreSQL**, which is just as self-contained: one
container (or one `apt install postgresql`), one data directory, one file to back up. No
cloud account, no licence, no internet connection required at runtime.

## What gets installed

| Component | Purpose | Port |
| --- | --- | --- |
| PostgreSQL 15 | all application data | 5432 |
| Auth service (GoTrue) | username/password sign-in, TOTP 2FA, admin user management | behind the gateway |
| PostgREST | the data API, enforcing every row-level security policy | behind the gateway |
| Nginx gateway | single API entry point at `/auth/v1` and `/rest/v1` | 8000 |
| The web app | built once, served by Node | 3000 |

## Prerequisites

- Linux, macOS or Windows Server with Docker Engine + Docker Compose v2
- Node.js 20+ (or Bun) to build and serve the web app
- 2 vCPU / 4 GB RAM is comfortable for a few hundred users

## Step-by-step installation

**1. Copy the project to the server** (git clone, or copy the folder) and enter it.

**2. Create the environment file**

```bash
cd selfhost
cp .env.example .env
node scripts/gen-keys.mjs      # prints JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY
```

Paste the printed `JWT_SECRET` into `selfhost/.env`, set a strong `POSTGRES_PASSWORD`,
set `PUBLIC_URL` / `APP_URL` to the addresses users will actually type (use the server's
hostname or IP, not `localhost`, if other machines connect), and fill in the Exchange
Online values described in [EXCHANGE-ONLINE.md](./EXCHANGE-ONLINE.md).
Keep `ANON_KEY` and `SERVICE_ROLE_KEY` — step 4 needs them.

**3. Install the database and services**

```bash
chmod +x scripts/*.sh
./scripts/install.sh
```

This starts the containers, waits for them, then applies every migration in
`supabase/migrations/` in order — creating the full schema: profiles, roles, projects,
project members and allocations, tasks with initial/updated/real schedules, task
dependencies (including cross-project), notifications, knowledge base spaces and pages,
plus all the access rules and governance triggers.

**4. Point the web app at the local stack**

Create `.env.local` in the **project root** (not in `selfhost/`):

```
VITE_SUPABASE_URL=http://your-server:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY from step 2>
SUPABASE_URL=http://your-server:8000
SUPABASE_ANON_KEY=<ANON_KEY from step 2>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from step 2>
```

`VITE_*` values are compiled into the browser bundle; the other three are read only by
the server and must never be exposed. The service-role key is what lets the
administration screen create users, reset passwords and reissue 2FA enrolment.

**5. Build and start the web app**

```bash
cd ..
npm install          # or: bun install
npm run build        # or: bun run build
node .output/server/index.mjs     # serves on port 3000
```

Keep it running with systemd (`selfhost/portal.service` below), pm2, or
`docker compose` if you prefer to containerise it too.

**6. First run**

Open `http://your-server:3000`. Because no accounts exist, the sign-in page shows the
one-time setup card: create the first administrator, scan the QR code with Microsoft or
Google Authenticator, and you are in. From **Administration** you then create the real
users, assign roles, and revoke access for leavers.

Usernames are the part before the `@` in the account's email address, exactly as on the
hosted version.

## Files you may need to change

| File | What to change |
| --- | --- |
| `selfhost/.env` | passwords, URLs, signing secret, Exchange Online SMTP settings |
| `.env.local` (project root) | API URL and the two generated keys used by the app |
| `selfhost/docker-compose.yml` | ports, Postgres volume location, sign-up policy, session length |
| `selfhost/gateway/nginx.conf` | TLS termination, hostname, upload limits |
| `selfhost/sql/00-prereqs.sql` | only if your DBA requires different role names |

## Putting it behind HTTPS

Terminate TLS on the Nginx gateway (or a reverse proxy in front of it), then update
`PUBLIC_URL`, `APP_URL` and `VITE_SUPABASE_URL` to the `https://` addresses and restart
both the stack and the web app. Authenticator-app 2FA and secure cookies expect HTTPS in
production.

## Running as a service (systemd)

```ini
# /etc/systemd/system/portal.service
[Unit]
Description=Project portal web app
After=network.target docker.service

[Service]
WorkingDirectory=/opt/portal
EnvironmentFile=/opt/portal/.env.local
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=always
User=portal

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now portal`

## Backups

`./selfhost/scripts/backup.sh` writes a compressed dump to `selfhost/backups/`. Schedule
it nightly with cron and copy the dumps off the machine:

```
0 2 * * * /opt/portal/selfhost/scripts/backup.sh
```

## Emailing the in-app notifications

Three portal notifications are emailed: **deadline approaching**, **task status change**
and **project priority update**. Status and priority notifications are written by database
triggers the moment they happen; deadline notifications are generated by the mailer each
time it runs.

The mailer is `selfhost/scripts/notify.mjs`. It sends every notification that has not been
emailed yet through the same Exchange Online settings in `selfhost/.env`, then stamps
`emailed_at` so nothing is sent twice; a failed send is simply retried on the next run.

```bash
cd selfhost/scripts
npm install                 # nodemailer + pg
npm run notify:dry          # prints what would be sent, sends nothing
npm run notify              # sends for real
```

Schedule it every 10 minutes with cron:

```
*/10 * * * * cd /opt/portal/selfhost/scripts && /usr/bin/node notify.mjs >> /var/log/portal-notify.log 2>&1
```

Settings live in `selfhost/.env`: `NOTIFY_DEADLINE_DAYS` (how far ahead a deadline counts
as approaching, default 3), `NOTIFY_BATCH_SIZE` (messages per run, keep it under the
Exchange Online throttle), and `POSTGRES_HOST` / `POSTGRES_USER` / `POSTGRES_DB` if the
mailer runs somewhere other than the database host. `APP_URL` is used for the "Open in the
portal" button, so set it to the address users actually type.
