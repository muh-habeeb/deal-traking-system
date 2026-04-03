const fs = require('node:fs');
const path = require('node:path');
const env = require('../config/env');
const logger = require('../utils/logger');

let hasLoggedMissingProxyFile = false;
let hasLoggedInvalidProxyFile = false;

function normalizeServer(server) {
  const value = String(server || '').trim();
  if (!value) {
    return '';
  }

  if (/^[a-z]+:\/\//i.test(value)) {
    return value;
  }

  return `http://${value}`;
}

function resolveProxyListPath() {
  return path.resolve(process.cwd(), env.proxy.listPath);
}

function loadProxyList() {
  if (!env.proxy.enabled) {
    return [];
  }

  const proxyPath = resolveProxyListPath();
  if (!fs.existsSync(proxyPath)) {
    if (!hasLoggedMissingProxyFile) {
      logger.warn('Proxy list file not found. Running without proxy.', {
        proxyPath,
      });
      hasLoggedMissingProxyFile = true;
    }

    return [];
  }

  try {
    const raw = fs.readFileSync(proxyPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error('Proxy list must be a JSON array.');
    }

    const proxies = parsed
      .map((entry) => {
        const server = normalizeServer(entry && entry.server);
        const username = String((entry && entry.username) || '').trim();
        const password = String((entry && entry.password) || '').trim();

        if (!server) {
          return null;
        }

        return {
          server,
          username,
          password,
        };
      })
      .filter(Boolean);

    return proxies;
  } catch (error) {
    if (!hasLoggedInvalidProxyFile) {
      logger.error('Invalid proxy list. Running without proxy.', {
        proxyPath,
        error: error.message,
      });
      hasLoggedInvalidProxyFile = true;
    }

    return [];
  }
}

function getProxyForWorker(workerIndex, offset = 0) {
  const proxies = loadProxyList();
  if (proxies.length === 0) {
    return null;
  }

  const index = Math.abs((workerIndex + offset) % proxies.length);
  return {
    ...proxies[index],
    index,
    total: proxies.length,
  };
}

module.exports = {
  getProxyForWorker,
  loadProxyList,
  resolveProxyListPath,
};
