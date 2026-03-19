const prisma = require('../config/prisma');

async function createFilterConfig(payload) {
  const data = {
    keyword: payload.keyword.trim(),
    minPrice: payload.minPrice ?? null,
    maxPrice: payload.maxPrice ?? null,
    location: payload.location.trim(),
    userId: payload.userId ?? null,
  };

  return prisma.filterConfig.create({ data });
}

async function getAllFilterConfigs() {
  return prisma.filterConfig.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

module.exports = {
  createFilterConfig,
  getAllFilterConfigs,
};
