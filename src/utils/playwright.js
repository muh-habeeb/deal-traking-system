const env = require('../config/env');

function parseBrowserArgs(rawValue) {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, arr) => arr.indexOf(value) === index);
}

function buildConservativeArgs() {
  return ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
}

function buildChromiumLaunchOptions(options = {}) {
  const { forceHeadless, proxy, forceStableChannel = false, conservativeArgs = false } = options;
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

  const args = conservativeArgs ? buildConservativeArgs() : parseBrowserArgs(env.playwrightBrowserArgs);
  if (args.length > 0) {
    launchOptions.args = args;
  }

  if (env.playwrightExecutablePath) {
    launchOptions.executablePath = env.playwrightExecutablePath;
  } else {
    const configuredChannel = String(env.playwrightChannel || '').trim();
    if (configuredChannel) {
      launchOptions.channel = configuredChannel;
    } else if (forceStableChannel || (env.nodeEnv === 'production' && launchOptions.headless !== false)) {
      // In production, prefer full Chromium channel over headless shell for stability.
      launchOptions.channel = 'chromium';
    }
  }

  return launchOptions;
}

module.exports = {
  buildChromiumLaunchOptions,
};