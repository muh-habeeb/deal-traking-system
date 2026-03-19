const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { chromium } = require('playwright');
const env = require('../config/env');
const { buildChromiumLaunchOptions } = require('../utils/playwright');

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

async function main() {
  const browser = await chromium.launch(buildChromiumLaunchOptions({ forceHeadless: false }));
  const context = await browser.newContext();
  const page = await context.newPage();

  const storageStatePath = path.resolve(process.cwd(), env.playwrightStorageStatePath);
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
