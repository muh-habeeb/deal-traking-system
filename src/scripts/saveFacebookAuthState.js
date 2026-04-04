const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { chromium } = require('playwright');
const env = require('../config/env');
const { buildChromiumLaunchOptions } = require('../utils/playwright');

function getStorageStatePath() {
  if (env.proxy.enabled && env.proxy.bindSessionToProxy) {
    const proxyIndex = Math.max(0, Math.trunc(Number(process.env.PROXY_SESSION_INDEX || 0)));
    const fileName = `${env.playwrightSessionPrefix}${env.workerIndex}_proxy${proxyIndex}.json`;
    return path.resolve(process.cwd(), env.playwrightSessionDir, fileName);
  }

  return path.resolve(process.cwd(), env.playwrightStorageStatePath);
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

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

async function main() {
  if (!canLaunchHeadedBrowser()) {
    throw new Error(
      'No GUI display is available for interactive Facebook login. For Docker/VPS, rebuild with ENABLE_REMOTE_LOGIN_TOOLS=true and run with ALLOW_REMOTE_FACEBOOK_LOGIN=true.'
    );
  }

  const browser = await chromium.launch(buildChromiumLaunchOptions({ forceHeadless: false }));
  const context = await browser.newContext();
  const page = await context.newPage();

  const storageStatePath = getStorageStatePath();
  fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });

  await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });

  await ask('Complete Facebook login in the opened browser, then press Enter here to save session...');

  await context.storageState({ path: storageStatePath });
  await browser.close();

  console.log(`Storage state saved to ${storageStatePath}`);
}

main().catch((error) => {
  console.error('Failed to save storage state:', error);
  process.exit(1);
});
