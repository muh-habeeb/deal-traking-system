# Swoop

Swoop is a Facebook Marketplace deal tracker with admin dashboard, category-aware filters, Playwright scraping, and email alerts.

## Features

- Filter CRUD with keyword, location, category, min/max price
- Facebook category search support (vehicles, property, electronics, etc.)
- Scheduled scraping with dedupe and notification logs
- Admin dashboard for filter management, listings, and session management
- Facebook session workflows for local, hosted popup (noVNC), and JSON import

## Stack

- Node.js + Express
- Prisma 7 + PostgreSQL (local or Neon)
- Playwright
- Nodemailer

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Create env file

```bash
cp .env.example .env
```

3. Set required env values in `.env`

- `DATABASE_URL`
- `APP_AUTH_SECRET`
- `APP_LOGIN_USERNAME`, `APP_LOGIN_PASSWORD`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- `ALERT_FROM`, `ALERT_TO`

4. Generate client and run migrations

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Run app

```bash
npm run dev
```

Open:

- `http://localhost:4000/`
- `http://localhost:4000/dashboard`

## Docker Quick Start

```bash
npm run docker:build
npm run docker:up
npm run docker:logs
```

## Main Scripts

- `npm run dev`
- `npm run start`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:deploy`
- `npm run auth:facebook`

## API Snapshot

Base path: `/api`

- Public: `POST /auth/login`, `GET /health`
- Protected: `GET /auth/me`, `GET/POST/PUT/DELETE /filters`, `GET /listings`, `PUT /settings/email`, `POST /notifications/test`
- Facebook session: `GET /facebook-session/status`, `POST /facebook-session/start`, `POST /facebook-session/save`, `POST /facebook-session/import`, `POST /facebook-session/logout`

## Documentation

- [docs/CLIENT_UI_GUIDE.md](docs/CLIENT_UI_GUIDE.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/FACEBOOK_SESSION.md](docs/FACEBOOK_SESSION.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
