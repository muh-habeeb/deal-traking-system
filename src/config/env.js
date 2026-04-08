const dotenv = require('dotenv');

dotenv.config();

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
}

function parseSecondsToMs(secondsValue, fallbackSeconds) {
  return Math.round(parseNumber(secondsValue, fallbackSeconds) * 1000);
}

function parseHour(value, fallback) {
  const parsed = Math.trunc(parseNumber(value, fallback));
  if (parsed < 0 || parsed > 23) {
    return fallback;
  }

  return parsed;
}

const notificationDelaySeconds =
  process.env.NOTIFICATION_DELAY_SECONDS !== undefined
    ? parseNumber(process.env.NOTIFICATION_DELAY_SECONDS, 2.5)
    : parseNumber(process.env.NOTIFICATION_DELAY_MS, 2500) / 1000;

const telegramToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
const telegramChatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
const hasTelegramCredentials = Boolean(telegramToken && telegramChatId);
const workerIndexSource =
  process.env.WORKER_ID !== undefined ? process.env.WORKER_ID : process.env.NODE_APP_INSTANCE;

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseNumber(process.env.PORT, 4000),
  databaseUrl: process.env.DATABASE_URL,
  database: {
    connectionTimeoutMs: parseSecondsToMs(process.env.DB_CONNECT_TIMEOUT_SECONDS, 6),
    idleTimeoutMs: parseSecondsToMs(process.env.DB_IDLE_TIMEOUT_SECONDS, 30),
    queryTimeoutMs: parseSecondsToMs(process.env.DB_QUERY_TIMEOUT_SECONDS, 12),
    maxPoolSize: Math.max(1, Math.trunc(parseNumber(process.env.DB_POOL_MAX, 10))),
  },
  workerIndex: Math.max(0, Math.trunc(parseNumber(workerIndexSource, 0))),
  maxListingsPerFilter: parseNumber(process.env.MAX_LISTINGS_PER_FILTER, 25),
  listingLookbackMinutes: parseNumber(
    process.env.LISTING_LOOKBACK_MINUTES,
    parseNumber(process.env.LISTING_LOOKBACK_HOURS, parseNumber(process.env.LISTING_RETENTION_HOURS, 24)) *
      60
  ),
  listingLookbackHours: parseNumber(
    process.env.LISTING_LOOKBACK_HOURS,
    parseNumber(process.env.LISTING_RETENTION_HOURS, 24)
  ),
  requirePostedTime: parseBoolean(process.env.REQUIRE_POSTED_TIME, false),
  listingRetentionHours: parseNumber(process.env.LISTING_RETENTION_HOURS, 24),
  notificationRetentionHours: parseNumber(process.env.NOTIFICATION_RETENTION_HOURS, 12),
  notificationDelaySeconds,
  notificationDelayMs: Math.round(notificationDelaySeconds * 1000),
  playwrightHeadless: parseBoolean(process.env.PLAYWRIGHT_HEADLESS, true),
  playwrightLocale: process.env.PLAYWRIGHT_LOCALE || 'en-CA',
  playwrightTimezoneId: process.env.PLAYWRIGHT_TIMEZONE || 'America/Toronto',
  playwrightSessionDir: process.env.PLAYWRIGHT_SESSION_DIR || 'playwright/sessions',
  playwrightSessionPrefix: process.env.PLAYWRIGHT_SESSION_PREFIX || 'session_',
  allowRemoteFacebookLogin: parseBoolean(process.env.ALLOW_REMOTE_FACEBOOK_LOGIN, false),
  playwrightBaseUrl: process.env.PLAYWRIGHT_BASE_URL || 'https://www.facebook.com/marketplace',
  playwrightStorageStatePath:
    process.env.PLAYWRIGHT_STORAGE_STATE_PATH || 'playwright/storageState.json',
  playwrightExecutablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '',
  playwrightBrowserArgs:
    process.env.PLAYWRIGHT_BROWSER_ARGS ||
    '--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage',
  noVncPublicUrl: process.env.NO_VNC_PUBLIC_URL || '',
  noVncPort: parseNumber(process.env.NOVNC_PORT, 6080),
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseNumber(process.env.SMTP_PORT, 587),
    secure: parseBoolean(process.env.SMTP_SECURE, false),
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
  telegram: {
    enabled:
      process.env.TELEGRAM_ENABLED === undefined
        ? hasTelegramCredentials
        : parseBoolean(process.env.TELEGRAM_ENABLED, false),
    token: telegramToken,
    chatId: telegramChatId,
    apiBaseUrl: process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org',
    requestTimeoutMs: parseSecondsToMs(process.env.TELEGRAM_REQUEST_TIMEOUT_SECONDS, 15),
    requestRetries: Math.max(0, Math.trunc(parseNumber(process.env.TELEGRAM_REQUEST_RETRIES, 2))),
    batchWindowMs: parseSecondsToMs(process.env.TELEGRAM_BATCH_WINDOW_SECONDS, 10),
    maxBatchSize: Math.max(1, Math.trunc(parseNumber(process.env.TELEGRAM_BATCH_MAX_SIZE, 3))),
  },
  proxy: {
    enabled: parseBoolean(process.env.PROXY_ENABLED, false),
    listPath: process.env.PROXY_LIST_PATH || 'data/proxies.json',
    rotateOnFailure: parseBoolean(process.env.PROXY_ROTATE_ON_FAILURE, true),
    maxFailoverAttempts: Math.max(1, Math.trunc(parseNumber(process.env.PROXY_MAX_FAILOVER_ATTEMPTS, 3))),
    bindSessionToProxy: parseBoolean(process.env.PROXY_BIND_SESSION_TO_PROXY, true),
  },
  queue: {
    startWorkerInServer: parseBoolean(process.env.START_QUEUE_WORKER_IN_SERVER, true),
    syncOnBoot: parseBoolean(process.env.SYNC_QUEUE_ON_BOOT, true),
    workerIdleSleepMs: parseSecondsToMs(process.env.WORKER_IDLE_SLEEP_SECONDS, 1),
    workerErrorRetryMs: parseSecondsToMs(process.env.WORKER_ERROR_RETRY_SECONDS, 45),
    workerRestartDelayMs: parseSecondsToMs(process.env.WORKER_RESTART_DELAY_SECONDS, 10),
    staleLockMs: parseSecondsToMs(process.env.WORKER_STALE_LOCK_SECONDS, 300),
    cleanupEveryJobs: Math.max(1, Math.trunc(parseNumber(process.env.CLEANUP_EVERY_JOBS, 10))),
    timezone: process.env.SCAN_TIMEZONE || 'America/Toronto',
    morningPeakStartHour: parseHour(process.env.MORNING_PEAK_START_HOUR, 7),
    morningPeakEndHour: parseHour(process.env.MORNING_PEAK_END_HOUR, 10),
    eveningPeakStartHour: parseHour(process.env.EVENING_PEAK_START_HOUR, 17),
    eveningPeakEndHour: parseHour(process.env.EVENING_PEAK_END_HOUR, 22),
    highPeakDelayMs: parseSecondsToMs(process.env.HIGH_PEAK_DELAY_SECONDS, 30),
    highOffPeakDelayMs: parseSecondsToMs(process.env.HIGH_OFFPEAK_DELAY_SECONDS, 60),
    mediumPeakDelayMs: parseSecondsToMs(process.env.MEDIUM_PEAK_DELAY_SECONDS, 45),
    mediumOffPeakDelayMs: parseSecondsToMs(process.env.MEDIUM_OFFPEAK_DELAY_SECONDS, 120),
    lowPeakDelayMs: parseSecondsToMs(process.env.LOW_PEAK_DELAY_SECONDS, 120),
    lowOffPeakDelayMs: parseSecondsToMs(process.env.LOW_OFFPEAK_DELAY_SECONDS, 300),
  },
  imageAnalysis: {
    enabled: parseBoolean(process.env.IMAGE_ANALYSIS_ENABLED, true),
    timeoutMs: parseSecondsToMs(process.env.IMAGE_ANALYSIS_TIMEOUT_SECONDS, 15),
  },
};

module.exports = env;
