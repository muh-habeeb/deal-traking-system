const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { getStorageStatePath } = require('../scrapers/facebookMarketplaceScraper');

let activeBrowser = null;
let activeContext = null;
let activePage = null;
let startedAt = null;

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
  };
}

async function startFacebookLoginFlow() {
  if (activeBrowser && activeContext && activePage) {
    return getFacebookSessionStatus();
  }

  activeBrowser = await chromium.launch({ headless: false });
  activeContext = await activeBrowser.newContext();
  activePage = await activeContext.newPage();
  startedAt = new Date();

  await activePage.goto('https://www.facebook.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  return getFacebookSessionStatus();
}

async function saveFacebookSession() {
  if (!activeContext) {
    throw new Error('No active Facebook login session. Click Start Facebook Login first.');
  }

  const storageStatePath = getStorageStatePath();
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });

  await activeContext.storageState({ path: storageStatePath });
  await closeActiveLoginFlow();

  return getFacebookSessionStatus();
}

async function closeActiveLoginFlow() {
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

module.exports = {
  getFacebookSessionStatus,
  startFacebookLoginFlow,
  saveFacebookSession,
  logoutFacebookSession,
};
