const dotenv = require('dotenv');

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  scrapeCron: process.env.SCRAPE_CRON || '*/10 * * * *',
  runScanOnBoot: process.env.RUN_SCAN_ON_BOOT !== 'false',
  maxListingsPerFilter: Number(process.env.MAX_LISTINGS_PER_FILTER || 30),
  listingRetentionHours: Number(process.env.LISTING_RETENTION_HOURS || 24),
  notificationRetentionHours: Number(process.env.NOTIFICATION_RETENTION_HOURS || 12),
  notificationDelayMs: Number(process.env.NOTIFICATION_DELAY_MS || 2500),
  playwrightHeadless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
  allowRemoteFacebookLogin: process.env.ALLOW_REMOTE_FACEBOOK_LOGIN === 'true',
  playwrightBaseUrl: process.env.PLAYWRIGHT_BASE_URL || 'https://www.facebook.com/marketplace',
  playwrightStorageStatePath:
    process.env.PLAYWRIGHT_STORAGE_STATE_PATH || 'playwright/storageState.json',
  playwrightExecutablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '',
  playwrightBrowserArgs:
    process.env.PLAYWRIGHT_BROWSER_ARGS ||
    '--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage',
  noVncPublicUrl: process.env.NO_VNC_PUBLIC_URL || '',
  noVncPort: Number(process.env.NOVNC_PORT || 6080),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  alertFrom: process.env.ALERT_FROM,
  alertTo: process.env.ALERT_TO,
  appAuthSecret: process.env.APP_AUTH_SECRET || 'change-me-in-production',
  appLogin: {
    username: process.env.APP_LOGIN_USERNAME || 'admin',
    password: process.env.APP_LOGIN_PASSWORD || 'admin123',
  },
};

module.exports = env;
