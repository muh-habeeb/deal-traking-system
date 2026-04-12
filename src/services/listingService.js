const prisma = require('../config/prisma');
const env = require('../config/env');
const { normalizeListingUrl, parsePostedAt } = require('../utils/normalizer');

function getListingsWindowHours() {
  const candidates = [
    Number(env.listingLookbackHours),
    Number(env.listingRetentionHours),
    Number(env.listingLookbackMinutes) / 60,
  ].filter((value) => Number.isFinite(value) && value > 0);

  const configuredHours = candidates.length > 0 ? Math.max(...candidates) : 24;
  return Math.max(24, configuredHours);
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

function resolvePostedTime(listing) {
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

async function getRecentListings(limit = 50) {
  const windowHours = getListingsWindowHours();
  const postedCutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);
  const cutoffMs = postedCutoff.getTime();
  const requirePostedTime = ['true', '1', 'yes'].includes(String(env.requirePostedTime || '').toLowerCase());

  const candidates = await prisma.listing.findMany({
    where: {
      OR: [
        {
          postedAt: {
            gt: postedCutoff,
          }
        },
        {
          createdAt: {
            gt: postedCutoff,
          },
        },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: Math.max(limit * 6, limit),
  });

  return candidates
    .map((listing) => {
      const resolvedPostedTime = resolvePostedTime(listing);
      return { listing, resolvedPostedTime };
    })
    .filter(({ listing, resolvedPostedTime }) => {
      // If posted time is required, filter strictly
      if (requirePostedTime) {
        if (!resolvedPostedTime) {
          return false;
        }

        if (isClearlyDayOrOlder(listing.postedText)) {
          return false;
        }

        return resolvedPostedTime.getTime() > cutoffMs;
      }

      // If posted time is NOT required, just check creation time
      return listing.createdAt && new Date(listing.createdAt).getTime() > cutoffMs;
    })
    .sort((left, right) => {
      const leftTime = left.resolvedPostedTime ? left.resolvedPostedTime.getTime() : new Date(left.listing.createdAt).getTime();
      const rightTime = right.resolvedPostedTime ? right.resolvedPostedTime.getTime() : new Date(right.listing.createdAt).getTime();
      return rightTime - leftTime;
    })
    .slice(0, limit)
    .map(({ listing }) => listing);
}

async function findExistingListingByUrl(url) {
  if (!url) {
    return null;
  }

  return prisma.listing.findUnique({ where: { url } });
}

async function findExistingListingByIdentity({ url, externalId }) {
  const normalizedUrl = normalizeListingUrl(url);
  if (!normalizedUrl && !externalId) {
    return null;
  }

  const identityClauses = [];

  if (externalId) {
    identityClauses.push({ externalId });
  }

  if (normalizedUrl) {
    identityClauses.push({ url: normalizedUrl });
    identityClauses.push({ url: { startsWith: `${normalizedUrl}?` } });
  }

  return prisma.listing.findFirst({
    where: {
      OR: identityClauses,
    },
    orderBy: { createdAt: 'desc' },
  });
}

async function createListing(data) {
  return prisma.listing.create({
    data: {
      title: data.title,
      vehicleName: data.vehicleName,
      modelYear: data.modelYear,
      price: data.price,
      mileageText: data.mileageText,
      mileageMiles: data.mileageMiles,
      location: data.location,
      description: data.description,
      postedText: data.postedText,
      postedAt: data.postedAt,
      url: data.url,
      image: data.image,
      externalId: data.externalId,
    },
  });
}

async function updateListing(id, data) {
  return prisma.listing.update({
    where: { id },
    data: {
      title: data.title,
      vehicleName: data.vehicleName,
      modelYear: data.modelYear,
      price: data.price,
      mileageText: data.mileageText,
      mileageMiles: data.mileageMiles,
      location: data.location,
      description: data.description,
      postedText: data.postedText,
      postedAt: data.postedAt,
      image: data.image,
      externalId: data.externalId,
    },
  });
}

module.exports = {
  getRecentListings,
  findExistingListingByUrl,
  findExistingListingByIdentity,
  createListing,
  updateListing,
};
