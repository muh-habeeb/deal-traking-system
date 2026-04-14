const prisma = require('../config/prisma');
const env = require('../config/env');
const { scrapeByFilter } = require('../scrapers/facebookMarketplaceScraper');
const { getAllFilterConfigs, updateFilterLastSeen } = require('./filterService');
const { findExistingListingByIdentity, createListing, updateListing } = require('./listingService');
const { parsePostedAt } = require('../utils/normalizer');
const { sendNewListingAlert } = require('./emailService');
const { sendNewListingTelegramAlert } = require('./telegramService');
const { getEmailSendingEnabled, getTelegramSendingEnabled } = require('./settingsService');
const { cleanupOldData } = require('./cleanupService');
const { isListingImageVehicle } = require('./imageAnalysisService');
const { getFacebookSessionStatus } = require('./facebookSessionService');
const logger = require('../utils/logger');

const HARD_MAX_FRESHNESS_HOURS = 12;

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

function matchesYearRange(listing, yearFrom, yearTo) {
  if (!Number.isFinite(yearFrom) && !Number.isFinite(yearTo)) {
    return true;
  }

  const year = listing.modelYear;
  if (!Number.isFinite(year)) {
    return true;
  }

  if (Number.isFinite(yearFrom) && year < yearFrom) {
    return false;
  }

  if (Number.isFinite(yearTo) && year > yearTo) {
    return false;
  }

  return true;
}

function matchesKmDriven(listing, minKmDriven, maxKmDriven) {
  const km = listing.mileageMiles;
  
  // If km is not available, pass the filter
  if (!Number.isFinite(km)) {
    return true;
  }
  
  // If neither min nor max is set, pass the filter
  if (!Number.isFinite(minKmDriven) && !Number.isFinite(maxKmDriven)) {
    return true;
  }
  
  // Check min boundary
  if (Number.isFinite(minKmDriven) && km < minKmDriven) {
    return false;
  }
  
  // Check max boundary
  if (Number.isFinite(maxKmDriven) && km > maxKmDriven) {
    return false;
  }
  
  return true;
}

function matchesCities(listing, citiesString) {
  if (!citiesString || String(citiesString).trim() === '') {
    return true;
  }

  const cities = String(citiesString)
    .split(',')
    .map(city => city.trim().toLowerCase())
    .filter(Boolean);

  if (cities.length === 0) {
    return true;
  }

  const listingLocation = String(listing.location || '').toLowerCase();
  return cities.some(city => listingLocation.includes(city));
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

  // Check if corpus contains any excluded toy keywords
  const isToyOrMiniature = env.listings.excludedToyKeywords.some(keyword => {
    const escapedKeyword = escapeRegex(keyword);
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    return regex.test(corpus);
  });

  // REJECT: Very low prices for 'cars' (indicates parts or toys, not real vehicles)
  const veryLowPrice = Number.isFinite(listing.price) && listing.price > 0 && listing.price <= 50;

  // Check if corpus contains any excluded part keywords
  const hasExcludedPartKeyword = env.listings.excludedPartKeywords.some(keyword => {
    const escapedKeyword = escapeRegex(keyword);
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    return regex.test(corpus);
  });

  // Check if corpus contains any excluded fitment keywords
  const hasExcludedFitmentKeyword = env.listings.excludedFitmentKeywords.some(keyword => {
    const escapedKeyword = escapeRegex(keyword);
    const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
    return regex.test(corpus);
  });

  // Also check for part number patterns (e.g., "88162-0R03", "ABC-123", etc.)
  const partNumberRegex = /\b[A-Z0-9]{3,}-[A-Z0-9]{2,}\b/i;
  const hasPartNumber = partNumberRegex.test(corpus);
  const lowPriceAccessory = Number.isFinite(listing.price) && listing.price > 0 && listing.price <= 150;

  const isPartsStyleListing = (hasExcludedPartKeyword || hasExcludedFitmentKeyword || hasPartNumber);

  // REJECT if toy/miniature indicators are found
  if (isToyOrMiniature) {
    return false;
  }

  // REJECT if very low price (likely parts/toy)
  if (veryLowPrice && !hasMileage) {
    return false;
  }

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
  return timestamp > cutoff;
}

function getListingsFreshnessHours() {
  const lookbackCandidates = [
    Number(env.listingLookbackHours),
    Number(env.listingLookbackMinutes) / 60,
  ].filter((value) => Number.isFinite(value) && value > 0);

  if (lookbackCandidates.length > 0) {
    return Math.min(HARD_MAX_FRESHNESS_HOURS, ...lookbackCandidates);
  }

  const retention = Number(env.listingRetentionHours);
  if (Number.isFinite(retention) && retention > 0) {
    return Math.min(HARD_MAX_FRESHNESS_HOURS, retention);
  }

  return HARD_MAX_FRESHNESS_HOURS;
}

function isClearlyDayOrOlder(postedText) {
  const text = String(postedText || '').trim().toLowerCase();
  if (!text) {
    return false;
  }

  return (
    /\byesterday\b/.test(text) ||
    /\b(day|days|week|weeks|month|months|year|years)\b/.test(text)
  );
}

function getPostedTextAgeHours(postedText) {
  const text = String(postedText || '').trim().toLowerCase();
  if (!text) {
    return null;
  }

  if (/\byesterday\b/.test(text)) {
    return 24;
  }

  const hourMatch = text.match(/\b(\d+)\s*(hour|hours|hr|hrs|h)\b/i);
  if (hourMatch) {
    const value = Number(hourMatch[1]);
    return Number.isFinite(value) ? value : null;
  }

  const minuteMatch = text.match(/\b(\d+)\s*(minute|minutes|min|mins|m)\b/i);
  if (minuteMatch) {
    const value = Number(minuteMatch[1]);
    return Number.isFinite(value) ? value / 60 : null;
  }

  if (/\b(day|days|week|weeks|month|months|year|years)\b/.test(text)) {
    return 24;
  }

  return null;
}

function resolvePostedTimestamp(listing) {
  const postedAt = listing && listing.postedAt ? new Date(listing.postedAt) : null;
  if (postedAt && !Number.isNaN(postedAt.getTime())) {
    return postedAt;
  }

  const parsed = parsePostedAt(listing ? listing.postedText : null);
  if (parsed && !Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function isListingWithinFreshnessWindow(listing, freshnessHours) {
  const postedAt = resolvePostedTimestamp(listing);
  if (postedAt) {
    return isWithinLastHours(postedAt, freshnessHours);
  }

  const hasPostedText = Boolean(String(listing && listing.postedText ? listing.postedText : '').trim());
  const postedTextAgeHours = getPostedTextAgeHours(listing ? listing.postedText : null);
  if (Number.isFinite(postedTextAgeHours)) {
    return postedTextAgeHours <= freshnessHours;
  }

  if (hasPostedText) {
    return false;
  }

  const createdAt = listing && listing.createdAt ? new Date(listing.createdAt) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    return isWithinLastHours(createdAt, freshnessHours);
  }

  return true;
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
  const sessionStatus = getFacebookSessionStatus();
  if (sessionStatus && sessionStatus.loginInProgress) {
    logger.warn('Skipping filter scan while Facebook login is in progress', {
      filterId: filterConfig.id,
      reason: 'facebook_login_in_progress',
    });

    return {
      freshListings: [],
      scrapedCount: 0,
    };
  }

  const scrapedListings = await scrapeByFilter(filterConfig);
  const freshnessHours = getListingsFreshnessHours();
  
  // Sort by posted time DESC (newest first) to ensure we process latest data first
  const sortedListings = scrapedListings.sort((a, b) => {
    const aTime = a.postedAt ? new Date(a.postedAt).getTime() : 0;
    const bTime = b.postedAt ? new Date(b.postedAt).getTime() : 0;
    return bTime - aTime;  // Descending order (newest first)
  });
  
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

  for (const scraped of sortedListings) {
    if (!scraped.url || !scraped.title) {
      continue;
    }

    // Check if this listing is already in the DB
    const existing = await findExistingListingByIdentity({
      url: scraped.url,
      externalId: scraped.externalId,
    });

    // Handle freshness/stale check: only check if we already have this listing
    if (existing) {
      // For existing listings, only consider repairing with new metadata
      if (shouldRepairExisting(existing, scraped)) {
        await updateListing(existing.id, scraped);
        logger.info('Repaired existing listing from fresh scrape', {
          listingId: existing.id,
          url: existing.url,
        });
      }
      continue;
    }

    // For NEW listings, parse posted time if available
    const postedAt = scraped.postedAt ? new Date(scraped.postedAt) : null;
    const hasValidPostedAt = Boolean(postedAt && !Number.isNaN(postedAt.getTime()));
    const scrapedAtTime = new Date();
    const postedTextAgeHours = getPostedTextAgeHours(scraped.postedText);
    const hasPostedText = Boolean(String(scraped.postedText || '').trim());

    if (hasPostedText && !hasValidPostedAt && !Number.isFinite(postedTextAgeHours)) {
      staleMisses += 1;
      logger.info('Listing rejected: posted text age is not parseable under strict freshness mode', {
        filterId: filterConfig.id,
        url: scraped.url,
        title: scraped.title,
        postedText: scraped.postedText,
      });
      continue;
    }

    if (Number.isFinite(postedTextAgeHours) && postedTextAgeHours > freshnessHours) {
      staleMisses += 1;
      logger.info('Listing outside freshness window by posted text age, rejecting', {
        filterId: filterConfig.id,
        url: scraped.url,
        title: scraped.title,
        postedText: scraped.postedText,
        postedTextAgeHours,
        freshnessHours,
      });
      continue;
    }

    // Log raw lines to see what we're extracting from Facebook cards
    if (scraped.postedText || !hasValidPostedAt) {
      logger.info('Listing freshness check - timestamp analysis', {
        filterId: filterConfig.id,
        title: scraped.title,
        postedText: scraped.postedText,
        postedAt: postedAt ? postedAt.toISOString() : null,
        hasValidPostedAt,
        scrapedAt: scrapedAtTime.toISOString(),
        willUse: hasValidPostedAt ? 'posted_at' : 'scraped_time',
        rawLines: scraped.rawLines ? scraped.rawLines.slice(0, 8) : [],
      });
    }

    // STRICT: Use posted timestamp if available, otherwise fall back to scrape time
    const effectiveTimestamp = hasValidPostedAt ? postedAt : scrapedAtTime;
    const isTimestampFromPosted = hasValidPostedAt;

    // Enforce strict freshness window (from either posted or scraped time)
    if (!isWithinLastHours(effectiveTimestamp, freshnessHours)) {
      staleMisses += 1;
      logger.info('Listing outside freshness window, rejecting', {
        filterId: filterConfig.id,
        url: scraped.url,
        title: scraped.title,
        postedAt: hasValidPostedAt ? postedAt.toISOString() : null,
        postedText: scraped.postedText,
        scrapedAt: scrapedAtTime.toISOString(),
        usedTimestamp: isTimestampFromPosted ? 'posted' : 'scraped',
        freshnessHours,
        ageHours: ((Date.now() - effectiveTimestamp.getTime()) / (60 * 60 * 1000)).toFixed(1),
        effectiveTimestamp: effectiveTimestamp.toISOString(),
      });
      continue;
    }

    // Log timestamp source for transparency
    if (!isTimestampFromPosted) {
      logger.info('Using scraped timestamp (no explicit posted time)', {
        filterId: filterConfig.id,
        url: scraped.url,
        scrapedAt: scrapedAtTime.toISOString(),
      });
    }

    // Track newest timestamp for next run
    if (hasValidPostedAt) {
      if (!newestSeenCreatedAt || postedAt.getTime() > newestSeenCreatedAt.getTime()) {
        newestSeenCreatedAt = postedAt;
      }

      // Skip if we've already seen this exact timestamp (duplicate from previous run)
      if (lastSeenCreatedAt && postedAt.getTime() < lastSeenCreatedAt.getTime()) {
        staleMisses += 1;
        continue;
      }
    }

    if (!matchesFilterKeyword(scraped, filterConfig.keyword)) {
      keywordMisses += 1;
      continue;
    }

    // If cities are specified, use cities matching instead of strict location matching
    if (filterConfig.cities) {
      if (!matchesCities(scraped, filterConfig.cities)) {
        locationMisses += 1;
        continue;
      }
    } else {
      // Fall back to strict location matching if cities not specified
      if (!matchesFilterLocation(scraped, filterConfig.location)) {
        locationMisses += 1;
        continue;
      }
    }

    if (!matchesYearRange(scraped, filterConfig.yearFrom, filterConfig.yearTo)) {
      keywordMisses += 1;
      continue;
    }

    if (!matchesKmDriven(scraped, filterConfig.kmDrivenMin, filterConfig.kmDrivenMax)) {
      keywordMisses += 1;
      continue;
    }

    if (!isLikelyVehicleDeal(scraped)) {
      nonVehicleMisses += 1;
      continue;
    }

    // Image analysis: verify listing image contains actual vehicle
    if (scraped.image) {
      try {
        logger.info('Image analysis starting', {
          filterId: filterConfig.id,
          url: scraped.url,
          imageUrl: scraped.image.substring(0, 100),
        });

        const imageIsVehicle = await isListingImageVehicle(scraped);

        logger.info('Image analysis result', {
          filterId: filterConfig.id,
          url: scraped.url,
          isVehicle: imageIsVehicle,
        });

        // imageIsVehicle can be: true, false, or null (unable to analyze)
        if (imageIsVehicle === false) {
          // Image analysis confirms it's NOT a vehicle (likely parts/toy)
          nonVehicleMisses += 1;
          logger.info('Image analysis rejected listing (not a vehicle)', {
            filterId: filterConfig.id,
            url: scraped.url,
            title: scraped.title,
          });
          continue;
        }

        if (imageIsVehicle === true) {
          logger.info('Image analysis confirmed vehicle', {
            filterId: filterConfig.id,
            url: scraped.url,
          });
        }
        // If null, analysis was inconclusive; proceed with listing
      } catch (imageError) {
        logger.warn('Image analysis error, proceeding anyway', {
          filterId: filterConfig.id,
          url: scraped.url,
          error: imageError.message,
        });
        // Continue processing on error (other filters protect)
      }
    } else {
      logger.info('No image for analysis', {
        filterId: filterConfig.id,
        url: scraped.url,
        hasImage: Boolean(scraped.image),
      });
    }

    // All filters passed - this is a new fresh listing
    const created = await createListing(scraped);
    freshListings.push(created);

    // Send notifications if enabled
    if (emailEnabled || telegramEnabled) {
      try {
        const alreadyNotified = await hasNotificationMarker({
          url: created.url,
          externalId: created.externalId,
        });

        if (alreadyNotified) {
          logger.info('Skipping notification: already sent for this listing', {
            listingId: created.id,
            url: created.url,
          });
          continue;
        }

        if (!isListingWithinFreshnessWindow(created, freshnessHours)) {
          logger.info('Skipping notification: listing outside freshness window', {
            listingId: created.id,
            url: created.url,
            freshnessHours,
            postedAt: created.postedAt,
            postedText: created.postedText,
          });
          continue;
        }

        let delivered = false;

        if (emailEnabled) {
          try {
            await sendNewListingAlert(created);
            delivered = true;
            const ageMinutes = created.postedAt
              ? ((Date.now() - new Date(created.postedAt).getTime()) / 60000).toFixed(1)
              : 'scraped just now';
            logger.info('Email notification sent', {
              listingId: created.id,
              url: created.url,
              postedAt: created.postedAt,
              ageMinutes,
            });
          } catch (error) {
            logger.error('Email notification failed', {
              listingId: created.id,
              error: error.message,
            });
          }
        }

        if (telegramEnabled) {
          try {
            const result = await sendNewListingTelegramAlert(created);
            if (result && !result.skipped) {
              delivered = true;
              const ageMinutes = created.postedAt
                ? ((Date.now() - new Date(created.postedAt).getTime()) / 60000).toFixed(1)
                : 'scraped just now';
              logger.info('Telegram notification sent', {
                listingId: created.id,
                url: created.url,
                postedAt: created.postedAt,
                postedText: created.postedText,
                ageMinutes,
              });
            }
          } catch (error) {
            logger.error('Telegram notification failed', {
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
        logger.error('Notification delivery failed for listing', {
          listingId: created.id,
          url: created.url,
          error: error.message,
        });
      }
    } else {
      logger.info('Notification delivery paused. Listing saved without sending alert.', {
        listingId: created.id,
        url: created.url,
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
