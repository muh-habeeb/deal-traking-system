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
  const { forceHeadless, proxy } = options;
  const launchOptions = {
    headless: typeof forceHeadless === 'boolean' ? forceHeadless : env.playwrightHeadless,
  };

  if (proxy && proxy.server) {
    launchOptions.proxy = {
      server: proxy.server,
      ...(proxy.username ? { username: proxy.username } : {}),
      ...(proxy.password ? { password: proxy.password } : {}),
    };
  }

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