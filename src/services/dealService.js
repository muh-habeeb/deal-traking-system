const prisma = require('../config/prisma');
const env = require('../config/env');
const { scrapeByFilter } = require('../scrapers/facebookMarketplaceScraper');
const { getAllFilterConfigs } = require('./filterService');
const { findExistingListingByIdentity, createListing, updateListing } = require('./listingService');
const { sendNewListingAlert } = require('./emailService');
const { cleanupOldData } = require('./cleanupService');
const logger = require('../utils/logger');

function wait(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tokenizeKeyword(keyword) {
  return String(keyword || '')
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function matchesFilterKeyword(listing, keyword) {
  const tokens = tokenizeKeyword(keyword);
  if (tokens.length === 0) {
    return true;
  }

  const corpus = `${listing.title || ''} ${listing.searchableText || ''}`.toLowerCase();
  return tokens.every((token) => corpus.includes(token));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsToken(corpus, token) {
  if (!token) {
    return true;
  }

  if (token.length <= 2) {
    const tokenRegex = new RegExp(`\\b${escapeRegex(token)}\\b`, 'i');
    return tokenRegex.test(corpus);
  }

  return corpus.includes(token);
}

function isCanadaLocation(listing) {
  const corpus = `${listing.location || ''} ${listing.searchableText || ''}`.toLowerCase();
  const canadaProvinceCodes = ['ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'nt', 'nu', 'on', 'pe', 'qc', 'sk', 'yt'];
  const canadaProvinceNames = [
    'ontario',
    'quebec',
    'british columbia',
    'alberta',
    'manitoba',
    'saskatchewan',
    'nova scotia',
    'new brunswick',
    'newfoundland',
    'labrador',
    'prince edward island',
    'northwest territories',
    'nunavut',
    'yukon',
    'canada',
  ];

  if (canadaProvinceNames.some((name) => corpus.includes(name))) {
    return true;
  }

  const codeRegex = new RegExp(`,\\s*(${canadaProvinceCodes.join('|')})\\b`, 'i');
  return codeRegex.test(listing.location || '');
}

function matchesFilterLocation(listing, filterLocation) {
  const rawLocation = String(filterLocation || '').trim().toLowerCase();
  if (!rawLocation) {
    return true;
  }

  if (rawLocation === 'canada' || rawLocation === 'ca') {
    return isCanadaLocation(listing);
  }

  const corpus = `${listing.location || ''} ${listing.searchableText || ''} ${listing.title || ''}`.toLowerCase();
  const tokens = rawLocation
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  return tokens.every((token) => containsToken(corpus, token));
}

function isLikelyPriceTitle(title) {
  return /(ca\$|c\$|cad\b|\$|\bfree\b|\bgratuit\b)/i.test(String(title || '').trim());
}

function shouldRepairExisting(existing, incoming) {
  if (!existing || !incoming) {
    return false;
  }

  const existingTitle = String(existing.title || '').trim();
  const incomingTitle = String(incoming.title || '').trim();

  const titleUpgrade =
    existingTitle && incomingTitle && isLikelyPriceTitle(existingTitle) && !isLikelyPriceTitle(incomingTitle);

  const priceUpgrade = (existing.price === null || existing.price === undefined) && Number.isFinite(incoming.price);
  const locationUpgrade = !existing.location && Boolean(incoming.location);
  const imageUpgrade = !existing.image && Boolean(incoming.image);

  return titleUpgrade || priceUpgrade || locationUpgrade || imageUpgrade;
}

async function hasNotificationMarker(listingIdentity) {
  const clauses = [];

  if (listingIdentity.externalId) {
    clauses.push({ listing: { externalId: listingIdentity.externalId } });
  }

  if (listingIdentity.url) {
    clauses.push({ listing: { url: listingIdentity.url } });
    clauses.push({ listing: { url: { startsWith: `${listingIdentity.url}?` } } });
  }

  if (clauses.length === 0) {
    return false;
  }

  const existingLog = await prisma.notificationLog.findFirst({
    where: {
      OR: clauses,
    },
    orderBy: { sentAt: 'desc' },
  });

  return Boolean(existingLog);
}

async function processFilter(filterConfig) {
  const scrapedListings = await scrapeByFilter(filterConfig);
  const freshListings = [];
  let keywordMisses = 0;
  let locationMisses = 0;

  for (const scraped of scrapedListings) {
    if (!scraped.url || !scraped.title) {
      continue;
    }

    if (!matchesFilterKeyword(scraped, filterConfig.keyword)) {
      keywordMisses += 1;
      continue;
    }

    if (!matchesFilterLocation(scraped, filterConfig.location)) {
      locationMisses += 1;
      continue;
    }

    const existing = await findExistingListingByIdentity({
      url: scraped.url,
      externalId: scraped.externalId,
    });
    if (existing) {
      if (shouldRepairExisting(existing, scraped)) {
        await updateListing(existing.id, scraped);
        logger.info('Repaired existing listing from fresh scrape', {
          listingId: existing.id,
          url: existing.url,
        });
      }
      continue;
    }

    const created = await createListing(scraped);
    freshListings.push(created);

    try {
      const alreadyNotified = await hasNotificationMarker({
        url: created.url,
        externalId: created.externalId,
      });

      if (alreadyNotified) {
        logger.info('Skipping email: marker exists for listing identity', {
          listingId: created.id,
          url: created.url,
          externalId: created.externalId,
        });
        continue;
      }

      await sendNewListingAlert(created);
      await prisma.notificationLog.create({
        data: { listingId: created.id },
      });
    } catch (error) {
      logger.error('Notification failed for listing', {
        listingId: created.id,
        error: error.message,
      });
    }

    await wait(env.notificationDelayMs);
  }

  logger.info('Filter processing completed', {
    filterId: filterConfig.id,
    scraped: scrapedListings.length,
    newListings: freshListings.length,
    keywordMisses,
    locationMisses,
  });

  return freshListings;
}

async function runDealScan() {
  const filters = await getAllFilterConfigs();

  if (filters.length === 0) {
    await cleanupOldData();
    logger.info('No filters configured. Skipping scan run.');
    return { scannedFilters: 0, newListings: 0 };
  }

  let newListingsCount = 0;
  for (const filter of filters) {
    try {
      const fresh = await processFilter(filter);
      newListingsCount += fresh.length;
    } catch (error) {
      logger.error('Filter scan failed', { filterId: filter.id, error: error.message });
    }
  }

  await cleanupOldData();

  return {
    scannedFilters: filters.length,
    newListings: newListingsCount,
  };
}

module.exports = {
  runDealScan,
};
