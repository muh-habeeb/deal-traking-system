# Swoop

Swoop is a Facebook Marketplace vehicle-deal tracker with:

- Scheduled scraping with Playwright
- Queue-based continuous scraping with Postgres jobs
- Filter-based deal discovery
- Email notifications
- Telegram notifications
- Admin dashboard for operations and Facebook session management

It is designed for self-hosting with Docker, PostgreSQL, and Nginx.

## Core Features

- Filter CRUD (`keyword`, `location`, `minPrice`, `maxPrice`, `priority`)
- Continuous queue workers using `FOR UPDATE SKIP LOCKED`
- Listing deduplication and identity matching
- Sliding-window scan tracking via `lastSeenCreatedAt`
- Email and Telegram delivery controls (pause/resume without stopping scraping)
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

6. Start one or more queue workers (optional if `START_QUEUE_WORKER_IN_SERVER=true`)

```bash
npm run worker
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

- Filters are scanned continuously through the `ScrapeJob` queue table
- Delay is dynamic by priority and Toronto peak hours (env values are in seconds)
- Multiple workers can run in parallel safely using `FOR UPDATE SKIP LOCKED`
- Email and Telegram notifications can be paused from dashboard or API
- Data cleanup runs periodically after worker jobs

## Proxy Setup (Webshare)

1. Copy proxy template:

```bash
cp data/proxies.example.json data/proxies.json
```

2. Fill `data/proxies.json` with your Webshare proxy endpoints and credentials.

3. Enable proxies in `.env`:

- `PROXY_ENABLED=true`
- `PROXY_LIST_PATH=data/proxies.json`
- `PROXY_ROTATE_ON_FAILURE=true`
- `PROXY_MAX_FAILOVER_ATTEMPTS=3`
- `PROXY_BIND_SESSION_TO_PROXY=true`

4. Save Facebook auth state per worker/proxy (one-time per session slot):

```bash
WORKER_ID=0 PROXY_SESSION_INDEX=0 npm run auth:facebook
WORKER_ID=1 PROXY_SESSION_INDEX=1 npm run auth:facebook
WORKER_ID=2 PROXY_SESSION_INDEX=2 npm run auth:facebook
```

Saved files are placed in `playwright/sessions/` and ignored by git.

## Multi-Process Run Mode

- Run exactly one API process on the app port.
- Run multiple worker processes separately for parallel scraping.
- Do not run multiple API processes on the same port unless you are behind a load balancer or reverse proxy.

Use PM2 for automatic restart after crashes:

```bash
npm run pm2:start
npm run pm2:logs
```

PM2 config starts:

- 1 API process (`swoop-api`)
- 3 worker processes (`swoop-worker`)

## API

Base path: `/api`

- Public: `GET /health`, `POST /auth/login`
- Auth check: `GET /auth/me`
- Protected: filters, listings, notifications, settings, facebook-session

Full API documentation: [docs/API_REFERENCE.md](docs/API_REFERENCE.md)

## Production

For complete production setup (Docker, Nginx, SSL, Cloudflare, 502 troubleshooting), see:

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/PRODUCTION_VPS_PM2.md](docs/PRODUCTION_VPS_PM2.md)

## Scripts

- `npm run dev`
- `npm run worker`
- `npm run worker:dev`
- `npm run pm2:start`
- `npm run pm2:restart`
- `npm run pm2:stop`
- `npm run pm2:logs`
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
