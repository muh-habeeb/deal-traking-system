const prisma = require('../config/prisma');
const { normalizeListingUrl } = require('../utils/normalizer');

async function getRecentListings(limit = 50) {
  return prisma.listing.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
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
