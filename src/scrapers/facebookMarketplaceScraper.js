const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const env = require('../config/env');
const { buildMarketplaceSearchUrl } = require('../utils/urlBuilder');
const { normalizeListing } = require('../utils/normalizer');
const { buildChromiumLaunchOptions } = require('../utils/playwright');
const logger = require('../utils/logger');

function getStorageStatePath() {
  return path.resolve(process.cwd(), env.playwrightStorageStatePath);
}

async function hasStorageState() {
  const storageStatePath = getStorageStatePath();
  return fs.existsSync(storageStatePath);
}

async function extractRawListingsFromPage(page) {
  return page.evaluate(() => {
    const priceHintRegex = /(ca\$|c\$|cad\b|\$|free\b|gratuit\b)/i;
    const amountRegex = /(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d{2})?/;

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
        /^seller'?s description/i.test(line) ||
        /^location is approximate/i.test(line) ||
        /^ships to you/i.test(line) ||
        /^delivery available/i.test(line)
      );
    }

    function isLikelyLocation(line) {
      return /,\s*[A-Z]{2}\b/.test(line);
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

    function extractLocation(lines) {
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

    function extractSearchableText(lines) {
      return lines
        .filter((line) => !isMetaLine(line))
        .join(' ')
        .trim();
    }

    const cards = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));

    return cards.slice(0, 120).map((anchor) => {
      const container = anchor.closest('div[role="main"] div') || anchor.parentElement;
      const textContent = container ? container.innerText || '' : anchor.innerText || '';
      const lines = textContent
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const priceLine = extractPriceLine(lines);
      const title = extractTitle(lines, priceLine);
      const location = extractLocation(lines);
      const searchableText = extractSearchableText(lines);
      const image = anchor.querySelector('img')?.getAttribute('src') || null;
      const href = anchor.getAttribute('href') || '';
      const absoluteUrl = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
      const idMatch = absoluteUrl.match(/\/item\/(\d+)/);

      return {
        title,
        price: priceLine,
        location,
        url: absoluteUrl,
        image,
        externalId: idMatch ? idMatch[1] : null,
        searchableText,
        rawLines: lines,
      };
    });
  });
}

async function scrapeByFilter(filterConfig) {
  const stateAvailable = await hasStorageState();
  const browser = await chromium.launch(buildChromiumLaunchOptions());

  const context = await browser.newContext(
    stateAvailable ? { storageState: getStorageStatePath() } : {}
  );

  const page = await context.newPage();
  const targetUrl = buildMarketplaceSearchUrl({
    baseUrl: env.playwrightBaseUrl,
    keyword: filterConfig.keyword,
    location: filterConfig.location,
    categoryKey: filterConfig.categoryKey,
    minPrice: filterConfig.minPrice,
    maxPrice: filterConfig.maxPrice,
  });

  logger.info('Scraping marketplace URL', { filterId: filterConfig.id, targetUrl });

  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(3000);
    let rawListings = await extractRawListingsFromPage(page);

    if (rawListings.length === 0 && filterConfig.categoryKey && filterConfig.categoryKey !== 'all') {
      const fallbackUrl = buildMarketplaceSearchUrl({
        baseUrl: env.playwrightBaseUrl,
        keyword: filterConfig.keyword,
        location: filterConfig.location,
        categoryKey: 'all',
        minPrice: filterConfig.minPrice,
        maxPrice: filterConfig.maxPrice,
      });

      logger.info('Category search returned zero listings, retrying with location search URL', {
        filterId: filterConfig.id,
        fallbackUrl,
      });

      await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(3000);
      rawListings = await extractRawListingsFromPage(page);
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
  } catch (error) {
    logger.error('Marketplace scraping failed', {
      filterId: filterConfig.id,
      error: error.message,
    });
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

module.exports = {
  scrapeByFilter,
  getStorageStatePath,
};
