# Swoop Deal Tracker Backend

Production-ready backend for scraping Facebook Marketplace with Playwright, storing listings in PostgreSQL via Prisma, and sending email alerts for new matching deals.

## Architecture

- Runtime: Node.js + Express (REST)
- Scraping: Playwright
- ORM: Prisma
- Database: PostgreSQL
- Scheduler: node-cron
- Notifications: Nodemailer

## Folder Structure

```
swoop/
  prisma.config.ts
  prisma/
    schema.prisma
  playwright/
    .gitkeep
  src/
    app.js
    server.js
    config/
      env.js
      prisma.js
    controllers/
      filterController.js
      listingController.js
    jobs/
      scrapeJob.js
    models/
      index.js
    routes/
      index.js
      filterRoutes.js
      listingRoutes.js
    scrapers/
      facebookMarketplaceScraper.js
    scripts/
      saveFacebookAuthState.js
    services/
      dealService.js
      emailService.js
      filterService.js
      listingService.js
    utils/
      logger.js
      normalizer.js
      urlBuilder.js
  .env.example
  .gitignore
  package.json
```

## Prisma Data Model

- `User` (optional, supports future multi-user growth)
- `FilterConfig` (keyword, location, min/max price)
- `Listing` (unique `url`, normalized listing data)
- `NotificationLog` (tracks delivered alerts)

Key constraints and indexes:
- `Listing.url` is unique for dedupe
- Indexed fields on filter/search and time columns (`createdAt`, `keyword`, `location`, `price`)
- Relation `NotificationLog -> Listing` with cascade delete

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Update `.env` values:
- `DATABASE_URL`
- SMTP credentials (`SMTP_*`, `ALERT_FROM`, `ALERT_TO`)
- Scrape schedule (`SCRAPE_CRON`)

Prisma 7 note:
- Migration connection URL is read from `prisma.config.ts` (not from `datasource.url` in schema)
- Runtime database connection uses `PrismaClient({ adapter })` with `@prisma/adapter-pg`

4. Generate Prisma client and migrate DB:

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Save Facebook login session for Playwright:

```bash
npm run auth:facebook
```

This opens a browser. Log in manually, then press Enter in terminal to save `playwright/storageState.json`.

6. Start service:

```bash
npm run dev
```

## API Endpoints

Base URL: `http://localhost:4000/api`

1. Create filter
- `POST /filters`
- Body:

```json
{
  "keyword": "honda civic",
  "location": "toronto",
  "minPrice": 2000,
  "maxPrice": 12000
}
```

2. Get filters
- `GET /filters`

3. Get listings
- `GET /listings?limit=50`

4. Health check
- `GET /health`

## Scraping + Detection Flow

1. Cron triggers `runDealScan()` every `SCRAPE_CRON` interval (default every 10 minutes)
2. Loads all filter configs
3. Builds Facebook Marketplace search URL per filter
4. Scrapes result cards with Playwright
5. Normalizes listing fields (`title`, `price`, `location`, `url`, `image`)
6. Dedupes against DB by unique `url`
7. Persists unseen listings
8. Sends email alert for each new listing
9. Writes `NotificationLog`

## Reliability Notes

- Structured error handling in controllers/services
- Cron expression validation before scheduling
- Prisma connect/disconnect lifecycle management
- Deduplication at both service logic and DB unique constraint levels

## Deployment Notes (VPS)

- Use PM2 or systemd to run `npm run start`
- Run `npm run prisma:deploy` during deployment
- Keep `.env` outside source control
- Rotate SMTP credentials and use app passwords when required by provider
