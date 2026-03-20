# Swoop

Swoop is a Facebook Marketplace vehicle-deal tracking backend with an admin UI, scheduled scraping, deduplication, and email alerts.

## What It Does

- Manages search filters (`keyword`, `location`, `minPrice`, `maxPrice`)
- Scrapes recent Facebook Marketplace vehicle listings on a schedule
- Stores and deduplicates listings in PostgreSQL
- Sends email notifications for newly discovered listings
- Provides session tools for Facebook login state (local or hosted/noVNC)

## Tech Stack

- Node.js + Express 5
- Prisma 7 + PostgreSQL
- Playwright (Marketplace scraping)
- Nodemailer (SMTP alerts)
- node-cron (scheduled scans)

## Quick Start (Local)

1. Install dependencies

```bash
npm install
```

2. Create environment file

```bash
cp .env.example .env
```

3. Configure required values in `.env`

- `DATABASE_URL`
- `APP_AUTH_SECRET`
- `APP_LOGIN_USERNAME`
- `APP_LOGIN_PASSWORD`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `ALERT_FROM`
- `ALERT_TO`

4. Generate Prisma client and run migrations

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Start the app

```bash
npm run dev
```

Open:

- `http://localhost:4000/` (login page)
- `http://localhost:4000/dashboard` (admin dashboard)

## Docker Quick Start

```bash
npm run docker:build
npm run docker:up
npm run docker:logs
```

## API Overview

Base path: `/api`

- Public routes: `GET /health`, `POST /auth/login`
- Token route: `GET /auth/me` (requires `Authorization: Bearer <token>`)
- Protected routes: filters, listings, notifications, settings, facebook-session

Full API guide: [docs/API_REFERENCE.md](docs/API_REFERENCE.md)

## Key Runtime Behavior

- Cron scan uses `SCRAPE_CRON` (default: every 10 minutes)
- Optional scan on boot controlled by `RUN_SCAN_ON_BOOT`
- New listing alerts are delayed by `NOTIFICATION_DELAY_MS` between sends
- Old listings/notification logs are cleaned up after each scan cycle

## NPM Scripts

- `npm run dev` - start server with nodemon
- `npm run start` - start production server
- `npm run auth:facebook` - run Facebook auth-state helper script
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:migrate` - run local Prisma migrations
- `npm run prisma:deploy` - run production-safe Prisma migrations
- `npm run docker:build` / `docker:up` / `docker:down` / `docker:logs`

## Project Documentation

- [docs/README.md](docs/README.md)
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- [docs/CLIENT_UI_GUIDE.md](docs/CLIENT_UI_GUIDE.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/FACEBOOK_SESSION.md](docs/FACEBOOK_SESSION.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
