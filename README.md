# SMF Truck Scale

A working truck-scale prototype with real sign-in, role-based access (administrator / supervisor / operator, scoped by plant and delivery direction), and local SQLite storage — no external account, cloud service, or database server required. Runs the same way on Windows or Linux.

> Shared-data warning: everyone signed in shares the same workflow data. An administrator can reset all sample visits and tolerances from Settings, which affects every signed-in user.

## Run on Windows

1. Install **Node.js 22 LTS** (or newer) from <https://nodejs.org/en/download> if it is not already installed.
2. Double-click **`RUN_ON_WINDOWS.bat`**.
3. It installs dependencies, builds the app, starts the server in its own window, and opens <http://localhost:3001>.

Run `RUN_ON_WINDOWS.bat` again after pulling new code or changing `package.json` — it reinstalls dependencies and rebuilds every time, which is slow but guarantees a clean state. For routine restarts (reboot, stopped the server, nothing changed) use **`RESTART_ON_WINDOWS.bat`** instead — it skips the install/build step and just starts the app from the existing build, in a few seconds. Data is saved in `data/app.db` (a SQLite file) in this folder — back that file up like any other application data you care about.

By default the app does not come back up on its own after a Windows restart. **`SETUP_AUTO_START.bat`** (run once, **as Administrator** — right-click it and choose "Run as administrator") sets up a Scheduled Task that starts the app automatically every time you sign in to Windows, including after a restart — it does not start before someone signs in. Use `REMOVE_AUTO_START.bat` to turn it off.

Both scripts start the server with `SECURE_COOKIE=false`, so sign-in works over plain HTTP when reached by IP address from another computer on the LAN/VPN, not just from `localhost` on the machine itself. Only remove that if you put an HTTPS reverse proxy in front (see `.env.example`).

## Run on Linux

**Docker (recommended):**

```bash
docker compose up -d --build
```

The app is served on port 3001. Data persists in a named Docker volume across restarts (`docker compose restart`) and rebuilds. Optional SMTP settings (see `.env.example`) can be placed in a `.env` file next to `docker-compose.yml`.

**Plain Node + systemd, without Docker:**

```bash
# Install Node 22 LTS, then:
npm ci
npm run build
```

Create `/etc/systemd/system/smf-truck-scale.service`:

```ini
[Unit]
Description=SMF Truck Scale
After=network.target

[Service]
WorkingDirectory=/opt/smf-truck-scale
Environment=NODE_ENV=production
Environment=DATABASE_PATH=/var/lib/smf-truck-scale/app.db
ExecStart=/usr/bin/npm run start
Restart=always
User=smf-truck-scale

[Install]
WantedBy=multi-user.target
```

Then `systemctl enable --now smf-truck-scale`. Put an HTTPS-terminating reverse proxy (nginx, Caddy, Traefik) in front of port 3001 — in production (`NODE_ENV=production`) the sign-in cookie is marked `Secure`, so it only reaches the browser over HTTPS.

## Included functions

- Daily inbound truck queue using fictional purchase-order and stock-transport-order data
- Outbound queue using fictional delivery orders
- Arrival check-in, queue calling, hold/resume, weighbridge dispatch, and gate completion
- Inbound loaded-first and outbound empty-first weighing flows
- Manual and simulated weighbridge readings
- Net cargo calculation: loaded truck minus empty truck
- Hierarchical tolerance configuration by company, plant, and material, using percentage or kilograms
- Company-specific inbound and outbound process-step labels, sequence, and optional steps
- Multiple product tickets for one truck, with a separate weighing result and tolerance check per product
- Real sign-in with three roles — administrator (global), supervisor and operator (scoped to one plant + delivery direction) — enforced on every read and write, not just in the UI
- Settings > Manage users: create/deactivate accounts and reset passwords; optional SMTP sends the new credentials by email
- Supervisor approval or rejection when a result is outside tolerance, with an exception-email outbox (real send if SMTP is configured, otherwise a preview)
- Individual QR pass and public, read-only progress page for each truck
- Airport-style public Truck Status Board at `/board`, with company, plant, direction and date filters, full-screen mode and automatic 10-second refresh — no sign-in required
- One-click sample-data reset (administrator only)

## What is intentionally disabled

This edition does not connect to SAP S/4HANA or a physical weighbridge — it uses sample orders and weighbridge simulation. Email sending is optional (SMTP) rather than required.

This edition is not a production SAP/weighbridge integration. A production rollout should add corporate SSO/MFA if desired, approved SAP interfaces, device authentication for the weighbridge, audit retention, monitoring, backup/restore for the SQLite file (or migrate to a managed database), and a security review.

## Run locally for development

```bash
npm ci
npm run dev
```

Open <http://localhost:3001>. Local data is saved in `data/app.db` (gitignored).

## Sign-in and users

Seeded accounts (see `lib/auth-server.ts`'s `seedUsers()` for the full list and passwords): one global administrator, plus one supervisor and one operator per plant (Pagbilao, Cebu, Davao). Sign in, then use Settings > Manage users (administrator only) to add real accounts, deactivate old ones, or reset passwords. If SMTP is configured (`.env.example`), the new credentials are emailed automatically; otherwise share the password directly.

## Shared data and QR links

All application data (visits, tolerance rules, login accounts, the session-signing secret) lives in one SQLite file at `DATABASE_PATH` (default `data/app.db`). Every process pointed at the same file shares the same data — there is no separate "preview" vs "production" store.

Use **Reset sample data** in Settings (administrator only) to restore all fictional visits and tolerances. This affects everyone using the same data file.

Each QR pass contains a random tracking URL. The driver page is deliberately public and exposes only delivery progress, site, schedule, ticket, plate, and milestones. It omits order quantities, weights, driver details, supervisor lists, notifications, and decision reasons. A pass expires after seven days and can be renewed; renewal invalidates the previous URL.

## Backup and restore

All data (visits, tolerance rules, accounts, sessions) lives in the one SQLite file at `data/app.db`. Back it up regularly — there is no cloud copy anywhere.

- **`BACKUP_DATA.bat`** — makes a consistent, timestamped copy into a `backups` folder, safe to run while the app is up (`data/app.db` is a live WAL-mode file, so a plain file copy while the server is writing to it could grab a torn/inconsistent snapshot — this uses SQLite's online backup API instead, which does not have that problem). Keeps the 30 most recent backups and removes older ones. Copy the `backups` folder itself somewhere else (a USB drive, another machine) regularly — a local-only backup on the same disk doesn't protect against disk failure.
- **`RESTORE_DATA.bat`** — stop the server first, then run this and pick a backup file to restore. It replaces `data/app.db` with the chosen backup.
- On Linux, back up the Docker named volume (`docker run --rm -v smf-truck-scale_app-data:/data -v "$PWD":/backup alpine tar czf /backup/app-data.tar.gz -C /data .`) or the `data/app.db` file directly if running plain Node + systemd.
- **`SETUP_AUTO_BACKUP.bat`** — sets up an automatic backup on Windows via Task Scheduler. Prompts for how often (daily, weekly, or monthly) and what time, then creates a "SMF Truck Scale Backup" scheduled task that runs `BACKUP_DATA_SILENT.bat` (the same backup, without prompts) unattended. Run it again any time to change the schedule — it replaces the previous one. Its log is `backups/backup.log`. Use **`REMOVE_AUTO_BACKUP.bat`** to turn it off. The task only runs while the Windows account is logged in at the scheduled time unless you additionally enable "Run whether user is logged on or not" on the task in Task Scheduler.

## Remove all data

Stop the server/container, then delete the SQLite file (`data/app.db`, or the Docker named volume via `docker compose down -v`). That removes every visit, user account, and session secret — the app reseeds fresh sample data and the default accounts the next time it starts.

## Verification

The supplied source includes automated checks for the weighing rules, workflow transitions, storage concurrency protection, login/role/plant enforcement, public API access, cross-origin write blocking, QR privacy/rotation, and email preview/sending behavior.

```bash
npm run typecheck
npm test
npm run build
npm run test:integration
```
