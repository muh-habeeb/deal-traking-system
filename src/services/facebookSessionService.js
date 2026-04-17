const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { getStorageStatePath } = require('../scrapers/facebookMarketplaceScraper');
const env = require('../config/env');
const { buildChromiumLaunchOptions } = require('../utils/playwright');
const logger = require('../utils/logger');

let activeBrowser = null;
let activeContext = null;
let activePage = null;
let startedAt = null;
let autoSaveInterval = null;
let saveInProgress = false;
let lastAutoSavedAt = null;
let consecutiveAuthenticatedPolls = 0;

const FACEBOOK_LOGIN_URL = 'https://www.facebook.com/login';
const FACEBOOK_COOKIE_SCOPE_URL = 'https://www.facebook.com';
const AUTO_SAVE_POLL_MS = 5000;
const REQUIRED_STABLE_POLLS = 2;

function hasLinuxXServer() {
  const display = String(process.env.DISPLAY || '').trim();
  if (!display || !display.startsWith(':')) {
    return false;
  }

  const displayNumber = display.slice(1).split('.')[0];
  if (!/^\d+$/.test(displayNumber)) {
    return false;
  }

  return fs.existsSync(`/tmp/.X11-unix/X${displayNumber}`);
}

function canLaunchHeadedBrowser() {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    return true;
  }

  if (process.platform !== 'linux') {
    return Boolean(process.env.DISPLAY);
  }

  return hasLinuxXServer();
}

function isMissingDisplayError(errorMessage) {
  const message = String(errorMessage || '').toLowerCase();
  return (
    message.includes('missing x server') ||
    message.includes('without having a xserver running') ||
    message.includes('ozone_platform_x11')
  );
}

function buildMissingDisplayMessage() {
  return [
    'Unable to open interactive Facebook login browser: no GUI display is available.',
    'For Docker/VPS, rebuild with ENABLE_REMOTE_LOGIN_TOOLS=true so Xvfb/noVNC tools are installed.',
    'Then keep ALLOW_REMOTE_FACEBOOK_LOGIN=true and start the container again.',
  ].join(' ');
}

function getSessionFileDetails() {
  const storageStatePath = getStorageStatePath();
  const exists = fs.existsSync(storageStatePath);

  if (!exists) {
    return {
      exists: false,
      storageStatePath,
      updatedAt: null,
      size: 0,
      cookieCount: 0,
    };
  }

  const stats = fs.statSync(storageStatePath);
  let cookieCount = 0;

  try {
    const parsed = JSON.parse(fs.readFileSync(storageStatePath, 'utf8'));
    cookieCount = Array.isArray(parsed.cookies) ? parsed.cookies.length : 0;
  } catch (_error) {
    cookieCount = 0;
  }

  return {
    exists: true,
    storageStatePath,
    updatedAt: stats.mtime.toISOString(),
    size: stats.size,
    cookieCount,
  };
}

function getFacebookSessionStatus() {
  return {
    ...getSessionFileDetails(),
    loginInProgress: Boolean(activeBrowser && activeContext && activePage),
    startedAt: startedAt ? startedAt.toISOString() : null,
    autoSaveEnabled: true,
    lastAutoSavedAt: lastAutoSavedAt ? lastAutoSavedAt.toISOString() : null,
  };
}

function clearAutoSaveInterval() {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
}

function isLoginOrCheckpointUrl(urlValue) {
  const url = String(urlValue || '').toLowerCase();
  if (!url) {
    return true;
  }

  return (
    url.includes('/login') ||
    url.includes('/checkpoint') ||
    url.includes('/recover') ||
    url.includes('/two_factor') ||
    url.includes('/security/')
  );
}

async function hasAuthenticatedFacebookSession(context, page) {
  const cookies = await context.cookies(FACEBOOK_COOKIE_SCOPE_URL);
  const hasCUser = cookies.some((cookie) => cookie.name === 'c_user' && cookie.value);
  const hasXs = cookies.some((cookie) => cookie.name === 'xs' && cookie.value);
  if (!hasCUser || !hasXs) {
    return false;
  }

  const currentUrl = page ? page.url() : '';
  return !isLoginOrCheckpointUrl(currentUrl);
}

async function persistActiveSessionState() {
  const storageStatePath = getStorageStatePath();
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  await activeContext.storageState({ path: storageStatePath });
}

async function tryAutoSaveFacebookSession() {
  if (!activeContext || !activePage || saveInProgress) {
    return false;
  }

  const isAuthenticated = await hasAuthenticatedFacebookSession(activeContext, activePage);
  if (!isAuthenticated) {
    consecutiveAuthenticatedPolls = 0;
    return false;
  }

  consecutiveAuthenticatedPolls += 1;
  if (consecutiveAuthenticatedPolls < REQUIRED_STABLE_POLLS) {
    return false;
  }

  saveInProgress = true;

  try {
    await persistActiveSessionState();
    lastAutoSavedAt = new Date();
    consecutiveAuthenticatedPolls = 0;
    logger.info('Facebook session auto-saved after stable authentication checks', {
      pollsRequired: REQUIRED_STABLE_POLLS,
    });
    await closeActiveLoginFlow();
    return true;
  } finally {
    saveInProgress = false;
  }
}

function startAutoSaveWatcher() {
  clearAutoSaveInterval();
  consecutiveAuthenticatedPolls = 0;

  autoSaveInterval = setInterval(async () => {
    try {
      await tryAutoSaveFacebookSession();
    } catch (_error) {
      // Keep polling while user is still completing login.
    }
  }, AUTO_SAVE_POLL_MS);
}

async function startFacebookLoginFlow() {
  if (activeBrowser && activeContext && activePage) {
    return getFacebookSessionStatus();
  }

  consecutiveAuthenticatedPolls = 0;

  const runningOnRender = Boolean(process.env.RENDER);
  const inProduction = env.nodeEnv === 'production';
  if ((runningOnRender || inProduction) && !env.allowRemoteFacebookLogin) {
    const error = new Error(
      'Interactive Facebook login is disabled in hosted mode. Set ALLOW_REMOTE_FACEBOOK_LOGIN=true and ensure noVNC/Xvfb is running.'
    );
    error.status = 400;
    throw error;
  }

  if (!canLaunchHeadedBrowser()) {
    const error = new Error(buildMissingDisplayMessage());
    error.status = 400;
    throw error;
  }

  try {
    activeBrowser = await chromium.launch(buildChromiumLaunchOptions({ forceHeadless: false }));
    activeContext = await activeBrowser.newContext();
    activePage = await activeContext.newPage();
    startedAt = new Date();

    await activePage.goto(FACEBOOK_LOGIN_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    startAutoSaveWatcher();
  } catch (error) {
    await closeActiveLoginFlow();
    const wrapped = new Error(
      isMissingDisplayError(error.message)
        ? `${buildMissingDisplayMessage()} Original error: ${error.message}`
        : `Unable to open interactive Facebook login browser in this environment: ${error.message}`
    );
    wrapped.status = 400;
    throw wrapped;
  }

  return getFacebookSessionStatus();
}

async function saveFacebookSession() {
  if (!activeContext) {
    const error = new Error('No active Facebook login session. Click Start Facebook Login first.');
    error.status = 400;
    throw error;
  }

  await persistActiveSessionState();
  await closeActiveLoginFlow();

  return getFacebookSessionStatus();
}

async function closeActiveLoginFlow() {
  clearAutoSaveInterval();
  consecutiveAuthenticatedPolls = 0;

  if (activePage) {
    await activePage.close().catch(() => {});
  }

  if (activeContext) {
    await activeContext.close().catch(() => {});
  }

  if (activeBrowser) {
    await activeBrowser.close().catch(() => {});
  }

  activeBrowser = null;
  activeContext = null;
  activePage = null;
  startedAt = null;
}

async function logoutFacebookSession() {
  await closeActiveLoginFlow();

  const storageStatePath = getStorageStatePath();
  if (fs.existsSync(storageStatePath)) {
    fs.unlinkSync(storageStatePath);
  }

  return getFacebookSessionStatus();
}

function parseStorageStateInput(input) {
  if (!input) {
    return null;
  }

  if (typeof input === 'string') {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === 'object' ? parsed : null;
  }

  if (typeof input === 'object') {
    return input;
  }

  return null;
}

function normalizeStorageStateShape(storageState) {
  const cookies = Array.isArray(storageState.cookies) ? storageState.cookies : [];
  const origins = Array.isArray(storageState.origins) ? storageState.origins : [];
  return { cookies, origins };
}

async function importFacebookSession(input) {
  let parsed;

  try {
    parsed = parseStorageStateInput(input);
  } catch (_error) {
    const error = new Error('Invalid JSON format for storage state.');
    error.status = 400;
    throw error;
  }

  if (!parsed || typeof parsed !== 'object') {
    const error = new Error('Storage state is required. Paste a valid Playwright storageState JSON.');
    error.status = 400;
    throw error;
  }

  const normalizedState = normalizeStorageStateShape(parsed);
  if (normalizedState.cookies.length === 0) {
    const error = new Error('No cookies found in storage state. Complete Facebook login first.');
    error.status = 400;
    throw error;
  }

  const storageStatePath = getStorageStatePath();
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  fs.writeFileSync(storageStatePath, JSON.stringify(normalizedState, null, 2), 'utf8');

  await closeActiveLoginFlow();
  return getFacebookSessionStatus();
}

module.exports = {
  getFacebookSessionStatus,
  startFacebookLoginFlow,
  saveFacebookSession,
  logoutFacebookSession,
  importFacebookSession,
};
