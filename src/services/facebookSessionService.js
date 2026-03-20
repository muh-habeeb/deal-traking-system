const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { getStorageStatePath } = require('../scrapers/facebookMarketplaceScraper');
const env = require('../config/env');
const { buildChromiumLaunchOptions } = require('../utils/playwright');

let activeBrowser = null;
let activeContext = null;
let activePage = null;
let startedAt = null;
let autoSaveInterval = null;
let saveInProgress = false;
let lastAutoSavedAt = null;

const FACEBOOK_LOGIN_URL = 'https://www.facebook.com/login';
const FACEBOOK_COOKIE_SCOPE_URL = 'https://www.facebook.com';
const AUTO_SAVE_POLL_MS = 3000;

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

async function hasAuthenticatedFacebookSession(context) {
  const cookies = await context.cookies(FACEBOOK_COOKIE_SCOPE_URL);
  return cookies.some((cookie) => cookie.name === 'c_user' && cookie.value);
}

async function persistActiveSessionState() {
  const storageStatePath = getStorageStatePath();
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
  await activeContext.storageState({ path: storageStatePath });
}

async function tryAutoSaveFacebookSession() {
  if (!activeContext || saveInProgress) {
    return false;
  }

  const isAuthenticated = await hasAuthenticatedFacebookSession(activeContext);
  if (!isAuthenticated) {
    return false;
  }

  saveInProgress = true;

  try {
    await persistActiveSessionState();
    lastAutoSavedAt = new Date();
    await closeActiveLoginFlow();
    return true;
  } finally {
    saveInProgress = false;
  }
}

function startAutoSaveWatcher() {
  clearAutoSaveInterval();

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

  const runningOnRender = Boolean(process.env.RENDER);
  const inProduction = env.nodeEnv === 'production';
  if ((runningOnRender || inProduction) && !env.allowRemoteFacebookLogin) {
    const error = new Error(
      'Interactive Facebook login is disabled in hosted mode. Run login locally or set ALLOW_REMOTE_FACEBOOK_LOGIN=true if your environment supports headed browsers.'
    );
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
      `Unable to open interactive Facebook login browser in this environment: ${error.message}`
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
