# Swoop

Swoop is a Facebook Marketplace vehicle-deal tracker with:

- Scheduled scraping with Playwright
- Filter-based deal discovery
- Email notifications
- Admin dashboard for operations and Facebook session management

It is designed for self-hosting with Docker, PostgreSQL, and Nginx.

## Core Features

- Filter CRUD (`keyword`, `location`, `minPrice`, `maxPrice`)
- Automatic cron scans (`SCRAPE_CRON`)
- Listing deduplication and identity matching
- Email delivery controls (pause/resume without stopping scraping)
- Facebook login session workflows (local or hosted noVNC)

## Stack

- Node.js + Express 5
- Prisma 7 + PostgreSQL
- Playwright
- Nodemailer
- Nginx + Certbot (production)

## Local Quick Start

1. Install dependencies

```bash
npm install
```

2. Create environment file

```bash
cp .env.example .env
```

3. Set required values in `.env`

- `DATABASE_URL`
- `APP_AUTH_SECRET`
- `APP_LOGIN_USERNAME`, `APP_LOGIN_PASSWORD`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `ALERT_FROM`, `ALERT_TO`

4. Prepare Prisma

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Start app

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

## Runtime Notes

- Scans run on `SCRAPE_CRON` (default every 10 minutes)
- `RUN_SCAN_ON_BOOT` controls initial startup scan
- Email notifications can be paused from dashboard or API
- Data cleanup runs after scan cycles

## API

Base path: `/api`

- Public: `GET /health`, `POST /auth/login`
- Auth check: `GET /auth/me`
- Protected: filters, listings, notifications, settings, facebook-session

Full API documentation: [docs/API_REFERENCE.md](docs/API_REFERENCE.md)

## Production

For complete production setup (Docker, Nginx, SSL, Cloudflare, 502 troubleshooting), see:

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Scripts

- `npm run dev`
- `npm run start`
- `npm run auth:facebook`
- `npm run prisma:generate`
- `npm run prisma:migrate`
- `npm run prisma:deploy`
- `npm run docker:build`
- `npm run docker:up`
- `npm run docker:down`
- `npm run docker:logs`

## Documentation

- [docs/README.md](docs/README.md)
- [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/FACEBOOK_SESSION.md](docs/FACEBOOK_SESSION.md)
- [docs/CLIENT_UI_GUIDE.md](docs/CLIENT_UI_GUIDE.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
