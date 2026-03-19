const prisma = require('../config/prisma');

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

async function createListing(data) {
  return prisma.listing.create({
    data: {
      title: data.title,
      price: data.price,
      location: data.location,
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
      price: data.price,
      location: data.location,
      image: data.image,
      externalId: data.externalId,
    },
  });
}

module.exports = {
  getRecentListings,
  findExistingListingByUrl,
  createListing,
  updateListing,
};
