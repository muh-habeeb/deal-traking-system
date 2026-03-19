const prisma = require('../config/prisma');
const { scrapeByFilter } = require('../scrapers/facebookMarketplaceScraper');
const { getAllFilterConfigs } = require('./filterService');
const { findExistingListingByUrl, createListing, updateListing } = require('./listingService');
const { sendNewListingAlert } = require('./emailService');
const logger = require('../utils/logger');

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

async function processFilter(filterConfig) {
  const scrapedListings = await scrapeByFilter(filterConfig);
  const freshListings = [];
  let keywordMisses = 0;

  for (const scraped of scrapedListings) {
    if (!scraped.url || !scraped.title) {
      continue;
    }

    if (!matchesFilterKeyword(scraped, filterConfig.keyword)) {
      keywordMisses += 1;
      continue;
    }

    const existing = await findExistingListingByUrl(scraped.url);
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
  }

  logger.info('Filter processing completed', {
    filterId: filterConfig.id,
    scraped: scrapedListings.length,
    newListings: freshListings.length,
    keywordMisses,
  });

  return freshListings;
}

async function runDealScan() {
  const filters = await getAllFilterConfigs();

  if (filters.length === 0) {
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

  return {
    scannedFilters: filters.length,
    newListings: newListingsCount,
  };
}

module.exports = {
  runDealScan,
};
