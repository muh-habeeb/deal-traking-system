const prisma = require('../config/prisma');
const env = require('../config/env');
const { scrapeByFilter } = require('../scrapers/facebookMarketplaceScraper');
const { getAllFilterConfigs, updateFilterLastSeen } = require('./filterService');
const { findExistingListingByIdentity, createListing, updateListing } = require('./listingService');
const { sendNewListingAlert } = require('./emailService');
const { sendNewListingTelegramAlert } = require('./telegramService');
const { getEmailSendingEnabled, getTelegramSendingEnabled } = require('./settingsService');
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

  const corpus = `${listing.title || ''} ${listing.vehicleName || ''} ${listing.description || ''} ${listing.searchableText || ''}`.toLowerCase();
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

function isLikelyVehicleDeal(listing) {
  const title = String(listing.title || '').trim();
  const corpus = `${listing.title || ''} ${listing.vehicleName || ''} ${listing.description || ''} ${listing.searchableText || ''}`.toLowerCase();
  const hasLeadingYear = /^(19\d{2}|20\d{2})\b/.test(title);
  const hasMileage = Number.isFinite(listing.mileageMiles) || Boolean(listing.mileageText);
  const hasVehicleTypeWord =
    /\b(car|sedan|suv|truck|van|pickup|coupe|wagon|hatchback|convertible|motorhome|rv|motorcycle|bike|pilot|civic|accord|camry|corolla|mustang|explorer|rav4|cr-v)\b/i.test(
      corpus
    );

  const partIndicatorRegex =
    /\b(part|parts|accessory|accessories|spoiler|bumper|lip|wing|kit|cover|covers|tail\s*light|headlight|mud\s*flap|gps|tracker|tint|transmission|engine|brochure|glasses|rim|rims|wheel|wheels|tire|tires)\b/i;
  const fitmentIndicatorRegex =
    /\b(fits?|fitment|for all cars|set of|pair of|conversion kit|replacement|aftermarket)\b/i;

  const isPartsStyleListing = partIndicatorRegex.test(corpus) || fitmentIndicatorRegex.test(corpus);
  const lowPriceAccessory = Number.isFinite(listing.price) && listing.price > 0 && listing.price <= 150;

  if (isPartsStyleListing && !hasMileage && (!hasLeadingYear || lowPriceAccessory)) {
    return false;
  }

  return hasLeadingYear || hasMileage || hasVehicleTypeWord;
}

function isWithinLastHours(value, hours) {
  if (!value || !Number.isFinite(hours) || hours <= 0) {
    return true;
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return true;
  }

  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  return timestamp >= cutoff;
}

function isWithinLastMinutes(value, minutes) {
  if (!value || !Number.isFinite(minutes) || minutes <= 0) {
    return true;
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return false;
  }

  const cutoff = Date.now() - minutes * 60 * 1000;
  return timestamp >= cutoff;
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
  const yearUpgrade =
    (existing.modelYear === null || existing.modelYear === undefined) &&
    Number.isFinite(incoming.modelYear);
  const nameUpgrade = !existing.vehicleName && Boolean(incoming.vehicleName);
  const mileageUpgrade =
    (existing.mileageMiles === null || existing.mileageMiles === undefined) &&
    Number.isFinite(incoming.mileageMiles);
  const locationUpgrade = !existing.location && Boolean(incoming.location);
  const descriptionUpgrade = !existing.description && Boolean(incoming.description);
  const postedAtUpgrade = !existing.postedAt && Boolean(incoming.postedAt);
  const postedTextUpgrade = !existing.postedText && Boolean(incoming.postedText);
  const imageUpgrade = !existing.image && Boolean(incoming.image);

  return (
    titleUpgrade ||
    priceUpgrade ||
    yearUpgrade ||
    nameUpgrade ||
    mileageUpgrade ||
    locationUpgrade ||
    descriptionUpgrade ||
    postedAtUpgrade ||
    postedTextUpgrade ||
    imageUpgrade
  );
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
  let nonVehicleMisses = 0;
  let staleMisses = 0;
  const emailEnabled = getEmailSendingEnabled();
  const telegramEnabled = getTelegramSendingEnabled();
  const lastSeenCreatedAt = filterConfig.lastSeenCreatedAt
    ? new Date(filterConfig.lastSeenCreatedAt)
    : null;
  let newestSeenCreatedAt =
    lastSeenCreatedAt && !Number.isNaN(lastSeenCreatedAt.getTime()) ? lastSeenCreatedAt : null;

  for (const scraped of scrapedListings) {
    if (!scraped.url || !scraped.title) {
      continue;
    }

    const postedAt = scraped.postedAt ? new Date(scraped.postedAt) : null;
    const hasValidPostedAt = Boolean(postedAt && !Number.isNaN(postedAt.getTime()));

    if (!hasValidPostedAt && env.requirePostedTime) {
      staleMisses += 1;
      continue;
    }

    if (hasValidPostedAt) {
      if (!newestSeenCreatedAt || postedAt.getTime() > newestSeenCreatedAt.getTime()) {
        newestSeenCreatedAt = postedAt;
      }

      if (!isWithinLastMinutes(postedAt, env.listingLookbackMinutes)) {
        staleMisses += 1;
        continue;
      }

      if (lastSeenCreatedAt && postedAt.getTime() <= lastSeenCreatedAt.getTime()) {
        staleMisses += 1;
        continue;
      }
    }

    if (!matchesFilterKeyword(scraped, filterConfig.keyword)) {
      keywordMisses += 1;
      continue;
    }

    if (!matchesFilterLocation(scraped, filterConfig.location)) {
      locationMisses += 1;
      continue;
    }

    if (!isLikelyVehicleDeal(scraped)) {
      nonVehicleMisses += 1;
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

    if (!emailEnabled && !telegramEnabled) {
      logger.info('Notification delivery paused. Listing saved without sending notification.', {
        listingId: created.id,
        url: created.url,
      });
      continue;
    }

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

      let delivered = false;

      if (emailEnabled) {
        try {
          await sendNewListingAlert(created);
          delivered = true;
        } catch (error) {
          logger.error('Email notification failed for listing', {
            listingId: created.id,
            error: error.message,
          });
        }
      }

      if (telegramEnabled) {
        try {
          const telegramResult = await sendNewListingTelegramAlert(created);
          if (!telegramResult || !telegramResult.skipped) {
            delivered = true;
          }
        } catch (error) {
          logger.error('Telegram notification failed for listing', {
            listingId: created.id,
            error: error.message,
          });
        }
      }

      if (delivered) {
        await prisma.notificationLog.create({
          data: { listingId: created.id },
        });
        await wait(env.notificationDelayMs);
      }
    } catch (error) {
      logger.error('Notification failed for listing', {
        listingId: created.id,
        error: error.message,
      });
    }
  }

  if (newestSeenCreatedAt) {
    await updateFilterLastSeen(filterConfig.id, newestSeenCreatedAt);
  }

  logger.info('Filter processing completed', {
    filterId: filterConfig.id,
    scraped: scrapedListings.length,
    newListings: freshListings.length,
    keywordMisses,
    locationMisses,
    nonVehicleMisses,
    staleMisses,
  });

  return {
    freshListings,
    scrapedCount: scrapedListings.length,
  };
}

async function runFilterScan(filterConfig) {
  const { freshListings, scrapedCount } = await processFilter(filterConfig);

  return {
    filterId: filterConfig.id,
    scannedListings: scrapedCount,
    newListings: freshListings.length,
  };
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
      const result = await runFilterScan(filter);
      newListingsCount += result.newListings;
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
  runFilterScan,
};
