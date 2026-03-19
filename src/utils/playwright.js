const env = require('../config/env');

function parseBrowserArgs(rawValue) {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildChromiumLaunchOptions(options = {}) {
  const { forceHeadless } = options;
  const launchOptions = {
    headless: typeof forceHeadless === 'boolean' ? forceHeadless : env.playwrightHeadless,
  };

  const args = parseBrowserArgs(env.playwrightBrowserArgs);
  if (args.length > 0) {
    launchOptions.args = args;
  }

  if (env.playwrightExecutablePath) {
    launchOptions.executablePath = env.playwrightExecutablePath;
  }

  return launchOptions;
}

module.exports = {
  buildChromiumLaunchOptions,
};