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

      const relative = lines.find((line) =>
        /^\d+\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)\s+ago$/i.test(
          line
        )
      );

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

    return cards.slice(0, 180).map((anchor) => {
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
  });
}

function buildGlobalFallbackUrl({ baseUrl, keyword, location, minPrice, maxPrice }) {
  const url = new URL(`${baseUrl}/search`);
  const mergedQuery = [String(keyword || '').trim(), String(location || '').trim()]
    .filter(Boolean)
    .join(' ')
    .trim();

  if (mergedQuery) {
    url.searchParams.set('query', mergedQuery);
  }

  if (Number.isFinite(minPrice)) {
    url.searchParams.set('minPrice', String(minPrice));
  }

  if (Number.isFinite(maxPrice)) {
    url.searchParams.set('maxPrice', String(maxPrice));
  }

  return url.toString();
}

async function loadAndExtractListings(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(1500);

  return extractRawListingsFromPage(page);
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
    minPrice: filterConfig.minPrice,
    maxPrice: filterConfig.maxPrice,
  });

  logger.info('Scraping marketplace URL', { filterId: filterConfig.id, targetUrl });

  try {
    let rawListings = await loadAndExtractListings(page, targetUrl);

    if (rawListings.length === 0) {
      const globalFallbackUrl = buildGlobalFallbackUrl({
        baseUrl: env.playwrightBaseUrl,
        keyword: filterConfig.keyword,
        location: filterConfig.location,
        minPrice: filterConfig.minPrice,
        maxPrice: filterConfig.maxPrice,
      });

      logger.info('No listings found in primary URLs, retrying with global search URL', {
        filterId: filterConfig.id,
        globalFallbackUrl,
      });

      rawListings = await loadAndExtractListings(page, globalFallbackUrl);
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
