const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const env = require('../config/env');
const { buildMarketplaceSearchUrl } = require('../utils/urlBuilder');
const { normalizeListing } = require('../utils/normalizer');
const { buildChromiumLaunchOptions } = require('../utils/playwright');
const { getProxyForWorker } = require('../services/proxyService');
const logger = require('../utils/logger');

function getStorageStatePath(workerIndex = env.workerIndex, proxyIndex = null) {
  const defaultStorageStatePath = path.resolve(process.cwd(), env.playwrightStorageStatePath);

  if (env.proxy.enabled && env.proxy.bindSessionToProxy) {
    const proxySegment = Number.isFinite(proxyIndex) ? `_proxy${proxyIndex}` : '';
    const fileName = `${env.playwrightSessionPrefix}${workerIndex}${proxySegment}.json`;
    const scopedStorageStatePath = path.resolve(process.cwd(), env.playwrightSessionDir, fileName);

    if (fs.existsSync(scopedStorageStatePath)) {
      return scopedStorageStatePath;
    }

    return defaultStorageStatePath;
  }

  return defaultStorageStatePath;
}

async function hasStorageState(storageStatePath) {
  if (!storageStatePath) {
    return false;
  }

  return fs.existsSync(storageStatePath);
}

function buildContextOptions(storageStatePath) {
  const contextOptions = {
    locale: env.playwrightLocale,
    timezoneId: env.playwrightTimezoneId,
  };

  if (storageStatePath) {
    contextOptions.storageState = storageStatePath;
  }

  return contextOptions;
}

async function extractRawListingsFromPage(page, maxListings) {
  return page.evaluate((limit) => {
    const priceHintRegex = /(\b(?:cad|usd|eur|gbp|aud|nzd|ars|mxn|inr|jpy|cny|brl|clp|cop|pen)\b|ca\$|c\$|\$|free\b|gratuit\b)/i;
    const amountRegex = /(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d{2})?/;
    const mileageRegex = /\b(\d{1,3}(?:[,\s]\d{3})*|\d+)(?:\s*[kK])?\s*(miles?|mi|km|kilometers?)\b/i;

    function isPriceLine(line) {
      if (!line) {
        return false;
      }

      const normalized = line.trim();
      if (!normalized || /^listed\s+/i.test(normalized)) {
        return false;
      }

      return priceHintRegex.test(normalized) && amountRegex.test(normalized);
    }

    function isMetaLine(line) {
      if (!line) {
        return true;
      }

      return (
        /^listed\s+/i.test(line) ||
        /^\d+\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)\s+ago$/i.test(
          line
        ) ||
        /^seller'?s description/i.test(line) ||
        /^location is approximate/i.test(line) ||
        /^ships to you/i.test(line) ||
        /^delivery available/i.test(line) ||
        /^save$/i.test(line) ||
        /^hide$/i.test(line)
      );
    }

    function isLikelyLocation(line) {
      return /,\s*[A-Z]{2}\b/i.test(line);
    }

    function isMileageLine(line) {
      return mileageRegex.test(line || '');
    }

    function extractPriceLine(lines) {
      const candidates = lines.filter((line) => isPriceLine(line));

      if (candidates.length > 0) {
        return candidates[0];
      }

      return '';
    }

    function extractTitle(lines, priceLine) {
      const candidate = lines.find((line) => {
        if (!line) {
          return false;
        }

        if (line === priceLine) {
          return false;
        }

        if (isMetaLine(line) || isLikelyLocation(line)) {
          return false;
        }

        return /[A-Za-z]/.test(line);
      });

      if (candidate) {
        return candidate;
      }

      const fallback = lines.find((line) => !isPriceLine(line) && !isMetaLine(line));
      return fallback || 'Untitled Listing';
    }

    function extractLocation(lines, title) {
      const titleLocationMatch = String(title || '').match(/\sin\s([A-Za-z .'-]+,\s*[A-Z]{2})\b/i);
      if (titleLocationMatch?.[1]) {
        return titleLocationMatch[1].trim();
      }

      const listedLine = lines.find((line) => /^listed\s+.+\s+in\s+/i.test(line));
      if (listedLine) {
        const match = listedLine.match(/\sin\s(.+)$/i);
        if (match?.[1]) {
          return match[1].trim();
        }
      }

      const cityProvinceLine = lines.find((line) => /,\s*[A-Z]{2}\b/.test(line));
      if (cityProvinceLine) {
        return cityProvinceLine.trim();
      }

      return lines[lines.length - 1] || '';
    }

    function extractPostedText(lines) {
      const explicit = lines.find((line) => /^listed\s+/i.test(line));
      if (explicit) {
        return explicit.trim();
      }

      // More flexible regex to catch "1 day ago", "2 days ago", "yesterday", etc.
      // Also handles variations like "1d" or "2 days" (without "ago")
      const relative = lines.find((line) => {
        const normalizedLine = line.trim();
        return (
          /^\d+\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)(\s+ago)?$/i.test(normalizedLine) ||
          /^yesterday\b/i.test(normalizedLine) ||
          /^just\s+now\b/i.test(normalizedLine) ||
          /^\d+[smhdw]\b/i.test(normalizedLine)
        );
      });

      if (relative) {
        return `Listed ${relative.trim()}`;
      }

      return null;
    }

    function extractMileage(lines) {
      const mileageLine = lines.find((line) => isMileageLine(line));
      return mileageLine ? mileageLine.trim() : null;
    }

    function extractDescription(lines, title, priceLine, location, mileage) {
      const descriptionMarkerIndex = lines.findIndex((line) => /^seller'?s description/i.test(line));
      if (descriptionMarkerIndex >= 0) {
        const descriptionLines = lines
          .slice(descriptionMarkerIndex + 1, descriptionMarkerIndex + 4)
          .map((line) => line.trim())
          .filter(Boolean);

        if (descriptionLines.length > 0) {
          return descriptionLines.join(' ');
        }
      }

      const candidate = lines.find((line) => {
        if (!line) {
          return false;
        }

        if (
          line === title ||
          line === priceLine ||
          line === location ||
          line === mileage ||
          isMetaLine(line) ||
          isPriceLine(line) ||
          isLikelyLocation(line) ||
          isMileageLine(line)
        ) {
          return false;
        }

        return line.length > 25;
      });

      return candidate ? candidate.trim() : null;
    }

    function extractSearchableText(lines) {
      return lines
        .filter((line) => !isMetaLine(line))
        .join(' ')
        .trim();
    }

    function resolveCardContainer(anchor) {
      const articleContainer = anchor.closest('[role="article"]');
      if (articleContainer) {
        return articleContainer;
      }

      let cursor = anchor;
      for (let i = 0; i < 8 && cursor?.parentElement; i += 1) {
        cursor = cursor.parentElement;
        const listingLinks = cursor.querySelectorAll('a[href*="/marketplace/item/"]');
        if (listingLinks.length === 1) {
          return cursor;
        }
      }

      return anchor.parentElement || anchor;
    }

    const cards = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));
    const seenUrls = new Set();

    const cardLimit = Math.max(30, Math.min(120, Number(limit || 30) + 15));

    return cards.slice(0, cardLimit).map((anchor) => {
      const href = anchor.getAttribute('href') || '';
      const absoluteUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;

      if (!absoluteUrl || seenUrls.has(absoluteUrl)) {
        return null;
      }
      seenUrls.add(absoluteUrl);

      const container = resolveCardContainer(anchor);
      const textContent = container ? container.innerText || '' : anchor.innerText || '';
      const lines = textContent
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const priceLine = extractPriceLine(lines);
      const title = extractTitle(lines, priceLine);
      const location = extractLocation(lines, title);
      const mileage = extractMileage(lines);
      const postedText = extractPostedText(lines);
      const description = extractDescription(lines, title, priceLine, location, mileage);
      const searchableText = extractSearchableText(lines);
      const image = anchor.querySelector('img')?.getAttribute('src') || null;
      const idMatch = absoluteUrl.match(/\/item\/(\d+)/);

      return {
        title,
        price: priceLine,
        location,
        mileage,
        postedText,
        description,
        url: absoluteUrl,
        image,
        externalId: idMatch ? idMatch[1] : null,
        searchableText,
        rawLines: lines,
      };
    }).filter(Boolean);
  }, maxListings);
}

function buildGlobalFallbackUrl({ baseUrl, keyword, location, minPrice, maxPrice }) {
  const url = new URL(`${baseUrl}/search`);
  const normalizedLocation = String(location || '').trim();
  const locationToken = /^(canada|ca)$/i.test(normalizedLocation) ? '' : normalizedLocation;
  const mergedQuery = [String(keyword || '').trim(), locationToken]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (mergedQuery) {
    url.searchParams.set('query', mergedQuery);
  } else {
    url.searchParams.set('query', 'Vehicles');
  }

  url.searchParams.set('sortBy', 'creation_time_descend');
  url.searchParams.set('category_id', '546583916084032');
  url.searchParams.set('exact', 'false');
  url.searchParams.set('radius_in_km', '500');

  if (Number.isFinite(minPrice)) {
    url.searchParams.set('minPrice', String(minPrice));
  }

  if (Number.isFinite(maxPrice)) {
    url.searchParams.set('maxPrice', String(maxPrice));
  }

  return url.toString();
}

async function inspectMarketplacePageState(page) {
  const currentUrl = page.url();
  const atLoginUrl = /\/login(?:\/|\?|$)/i.test(currentUrl);

  const domState = await page.evaluate(() => {
    const bodyText = String(document.body?.innerText || '').toLowerCase();
    const itemAnchorCount = document.querySelectorAll('a[href*="/marketplace/item/"]').length;
    const hasEmailInput = Boolean(document.querySelector('input[name="email"]'));
    const hasPasswordInput = Boolean(document.querySelector('input[name="pass"]'));
    const hasLoginForm = Boolean(document.querySelector('form[action*="/login"]'));
    const hasLoginAnchor = Boolean(
      document.querySelector('a[href*="/login/device-based/regular/login"]')
    );
    const hasGenericLoginAnchor = Boolean(document.querySelector('a[href*="/login"]'));
    const hasRecoveryAnchor = Boolean(document.querySelector('a[href*="/recover/initiate"]'));
    const hasNoResultsMessage = /no listings found/.test(bodyText);

    const hasLoginPromptText =
      /\b(log in|email address or phone number|forgotten account|forgot password|create new account)\b/.test(
        bodyText
      );

    return {
      hasNoResultsMessage,
      requiresLogin:
        hasLoginForm ||
        hasLoginAnchor ||
        ((hasGenericLoginAnchor || hasRecoveryAnchor) && itemAnchorCount === 0) ||
        (hasEmailInput && hasPasswordInput) ||
        hasLoginPromptText,
    };
  });

  return {
    currentUrl,
    ...domState,
    requiresLogin: atLoginUrl || domState.requiresLogin,
  };
}

async function ensureMarketplaceSession(page) {
  const state = await inspectMarketplacePageState(page);
  if (state.requiresLogin) {
    throw new Error(
      `Facebook session appears logged out or expired (url: ${state.currentUrl}). Re-authenticate via dashboard Facebook Login or run npm run auth:facebook.`
    );
  }

  return state;
}

async function extractRawListingsWithRetry(page, maxListings) {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await extractRawListingsFromPage(page, maxListings);
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      const canRetry =
        attempt < maxAttempts &&
        (/Execution context was destroyed/i.test(message) || /navigation/i.test(message));

      if (!canRetry) {
        throw error;
      }

      logger.warn('Raw listing extraction race detected, retrying once', {
        attempt,
        maxAttempts,
        error: message,
      });

      await page.waitForTimeout(1200);
      await ensureMarketplaceSession(page);
    }
  }

  return [];
}

async function loadAndExtractListings(page, url, maxListings) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800 + Math.floor(Math.random() * 1200));

  const currentUrl = page.url();
  if (currentUrl.includes('/marketplace/ineligible')) {
    throw new Error('Facebook Marketplace is ineligible for this session/account. Re-authenticate with a Marketplace-enabled account.');
  }

  await ensureMarketplaceSession(page);

  for (let i = 0; i < 4; i += 1) {
    try {
      await page.waitForSelector('a[href*="/marketplace/item/"]', { timeout: 4000 });
      break;
    } catch (_error) {
      // Keep trying after a small scroll; FB often lazy-renders cards.
      await page.mouse.wheel(0, 2200);
      await page.waitForTimeout(800 + Math.floor(Math.random() * 800));
    }
  }

  let previousCount = 0;
  for (let i = 0; i < 10; i += 1) {
    const currentCount = await page.locator('a[href*="/marketplace/item/"]').count();
    if (currentCount >= maxListings) {
      break;
    }

    if (currentCount > 0 && currentCount === previousCount) {
      logger.info('Scroll stalled, stopping page load', {
        currentCount,
        targetCount: maxListings,
        scrollIteration: i,
      });
      break;
    }

    previousCount = currentCount;
    await page.mouse.wheel(0, 3200);
    await page.waitForTimeout(1500 + Math.floor(Math.random() * 1000));
  }

  const finalCount = await page.locator('a[href*="/marketplace/item/"]').count();
  if (finalCount === 0) {
    const state = await ensureMarketplaceSession(page);
    if (state.hasNoResultsMessage) {
      logger.info('Marketplace returned no listings for query', {
        url,
      });
    }
  }

  return extractRawListingsWithRetry(page, maxListings);
}

async function scrapeWithBrowser(filterConfig, launchProxy, storageStatePath) {
  const browser = await chromium.launch(buildChromiumLaunchOptions({ proxy: launchProxy }));

  let context = null;
  try {
    context = await browser.newContext(buildContextOptions(storageStatePath));
    const page = await context.newPage();

    // Prefer Canada-wide search when no location is specified
    const useGlobalSearch = !filterConfig.location || String(filterConfig.location).trim() === '';

    const targetUrl = useGlobalSearch
      ? buildGlobalFallbackUrl({
          baseUrl: env.playwrightBaseUrl,
          keyword: filterConfig.keyword,
          location: '',
          minPrice: filterConfig.minPrice,
          maxPrice: filterConfig.maxPrice,
        })
      : buildMarketplaceSearchUrl({
          baseUrl: env.playwrightBaseUrl,
          keyword: filterConfig.keyword,
          location: filterConfig.location,
          minPrice: filterConfig.minPrice,
          maxPrice: filterConfig.maxPrice,
        });

    logger.info('Scraping marketplace URL', {
      filterId: filterConfig.id,
      targetUrl,
      proxy: launchProxy ? launchProxy.server : 'direct',
      storageStatePath: storageStatePath || 'none',
      searchScope: useGlobalSearch ? 'canada-wide' : `location:${filterConfig.location}`,
    });

    let rawListings = await loadAndExtractListings(page, targetUrl, env.maxListingsPerFilter);

    // Only use fallback if initial search was location-specific AND returned nothing
    if (rawListings.length === 0 && !useGlobalSearch) {
      const globalFallbackUrl = buildGlobalFallbackUrl({
        baseUrl: env.playwrightBaseUrl,
        keyword: filterConfig.keyword,
        location: filterConfig.location,
        minPrice: filterConfig.minPrice,
        maxPrice: filterConfig.maxPrice,
      });

      logger.info('Location search returned no results, falling back to Canada-wide search', {
        filterId: filterConfig.id,
      });

      rawListings = await loadAndExtractListings(page, globalFallbackUrl, env.maxListingsPerFilter * 1.5);
    }

    const unique = new Map();
    for (const item of rawListings) {
      const normalized = normalizeListing(item);
      if (!normalized.url || unique.has(normalized.url)) {
        continue;
      }
      unique.set(normalized.url, normalized);
    }

    return Array.from(unique.values()).slice(0, env.maxListingsPerFilter);
  } finally {
    if (context) {
      await context.close();
    }

    await browser.close();
  }
}

async function scrapeByFilter(filterConfig) {
  const proxyAttempts = env.proxy.enabled ? env.proxy.maxFailoverAttempts : 1;
  const includeDirectFallback = env.proxy.enabled;
  const maxAttempts = proxyAttempts + (includeDirectFallback ? 1 : 0);
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const isDirectFallbackAttempt = includeDirectFallback && attempt === maxAttempts - 1;
    const rotateOffset = env.proxy.rotateOnFailure ? attempt : 0;
    const selectedProxy = isDirectFallbackAttempt
      ? null
      : getProxyForWorker(env.workerIndex, rotateOffset);
    const proxyIndex = selectedProxy ? selectedProxy.index : null;
    const storageStatePath = getStorageStatePath(env.workerIndex, proxyIndex);
    const stateAvailable = await hasStorageState(storageStatePath);

    try {
      return await scrapeWithBrowser(
        filterConfig,
        selectedProxy,
        stateAvailable ? storageStatePath : null
      );
    } catch (error) {
      lastError = error;
      const canRetry = attempt < maxAttempts - 1;

      logger.warn('Scrape attempt failed', {
        filterId: filterConfig.id,
        attempt: attempt + 1,
        maxAttempts,
        isDirectFallbackAttempt,
        proxy: selectedProxy ? selectedProxy.server : 'direct',
        canRetry,
        error: error.message,
      });

      if (!canRetry) {
        break;
      }
    }
  }

  logger.error('Marketplace scraping failed after retries', {
    filterId: filterConfig.id,
    maxAttempts,
    error: lastError ? lastError.message : 'Unknown scrape error',
  });

  if (lastError) {
    throw lastError;
  }

  throw new Error('Marketplace scraping failed without specific error');
}

module.exports = {
  scrapeByFilter,
  getStorageStatePath,
};
