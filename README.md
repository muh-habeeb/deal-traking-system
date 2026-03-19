# Swoop

Swoop is a Facebook Marketplace deal tracker with an admin UI.

It lets you:
- create and manage search filters (keyword, location, min/max price)
- scrape new listings on a schedule
- deduplicate listings by URL
- send email alerts for new matches
- manage Facebook login session from the dashboard

## Tech Stack

- Node.js + Express
- Prisma 7 + PostgreSQL
- Playwright (Marketplace scraping)
- Nodemailer (email notifications)
- Static web UI (login + dashboard)

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Create `.env` from sample

PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

3. Update key environment values in `.env`

- `DATABASE_URL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- `ALERT_FROM`, `ALERT_TO`
- `APP_LOGIN_USERNAME`, `APP_LOGIN_PASSWORD`
- `APP_AUTH_SECRET`

4. Prepare database

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Start the app

```bash
npm run dev
```

6. Open UI

- Login page: `http://localhost:4000/`
- Dashboard: `http://localhost:4000/dashboard`

## Run Commands

- Dev server: `npm run dev`
- Production start: `npm run start`
- Generate Prisma client: `npm run prisma:generate`
- Create/apply migration (development): `npm run prisma:migrate`
- Reset database (development only): `npm run prisma:reset`
- Apply migrations (deployment): `npm run prisma:deploy`
- Legacy session script: `npm run auth:facebook`

## UI Workflow (Recommended)

1. Login with `APP_LOGIN_USERNAME` and `APP_LOGIN_PASSWORD`
2. In **Receiver Email**, save the destination email and send a test email
3. In **Facebook Session**:
- click **Start Facebook Login**
- complete Facebook login in the opened browser
- return and click **Save Session**
4. Create at least one filter
5. Verify new listings in **Latest Listings**

The scraper runs automatically on the cron schedule in `SCRAPE_CRON` (default every 10 minutes).

## Environment Variables

Default examples are in `.env.example`.

- App
- `NODE_ENV` (default: `development`)
- `PORT` (default: `4000`)
- `APP_AUTH_SECRET`
- `APP_LOGIN_USERNAME`
- `APP_LOGIN_PASSWORD`

- Database
- `DATABASE_URL`

- Scraping
- `SCRAPE_CRON`
- `MAX_LISTINGS_PER_FILTER`
- `PLAYWRIGHT_HEADLESS`
- `PLAYWRIGHT_BASE_URL`
- `PLAYWRIGHT_STORAGE_STATE_PATH`

- Notification
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `ALERT_FROM`
- `ALERT_TO`
- `NOTIFICATION_DELAY_MS`

- Data retention
- `LISTING_RETENTION_HOURS`
- `NOTIFICATION_RETENTION_HOURS`

## API Summary

Base path: `/api`

- Public
- `POST /auth/login`
- `GET /health`

- Protected (Bearer token)
- `GET /auth/me`
- `GET/POST/PUT/DELETE /filters`
- `GET /listings`
- `PUT /settings/email`
- `POST /notifications/test`
- `GET /facebook-session/status`
- `POST /facebook-session/start`
- `POST /facebook-session/save`
- `POST /facebook-session/logout`

## Troubleshooting

- Port already in use
- change `PORT` in `.env` or stop the process using port `4000`

- `npm run dev` exits early
- confirm PostgreSQL is running
- verify `DATABASE_URL` and run `npm run prisma:migrate`

- No email received
- check SMTP credentials and `ALERT_TO`
- use **Send Test Email** in dashboard and inspect server logs

- Facebook session not ready
- complete login in the popup browser before saving session
- confirm `playwright/storageState.json` is created/updated

## Notes for Deployment

- run with `npm run start`
- run migrations with `npm run prisma:deploy`
- keep `.env` out of source control
- use secure values for secrets and SMTP credentials

### Render Setup

- Build Command: `npm install && npm run prisma:deploy`
- Start Command: `npm run start`
- Required env vars at minimum: `DATABASE_URL`, `APP_AUTH_SECRET`, `APP_LOGIN_USERNAME`, `APP_LOGIN_PASSWORD`, SMTP vars

`postinstall` runs `prisma generate`, so Prisma Client is always generated during build.

## Additional Documentation

For a client-friendly UI usage guide, see `docs/CLIENT_UI_GUIDE.md`.
