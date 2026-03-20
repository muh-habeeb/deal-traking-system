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

async function getFilterConfigById(id) {
  return prisma.filterConfig.findUnique({
    where: { id },
  });
}

async function updateFilterConfig(id, payload) {
  const data = {
    keyword: payload.keyword.trim(),
    minPrice: payload.minPrice ?? null,
    maxPrice: payload.maxPrice ?? null,
    location: payload.location.trim(),
  };

  return prisma.filterConfig.update({
    where: { id },
    data,
  });
}

async function deleteFilterConfig(id) {
  return prisma.filterConfig.delete({
    where: { id },
  });
}

module.exports = {
  createFilterConfig,
  getAllFilterConfigs,
  getFilterConfigById,
  updateFilterConfig,
  deleteFilterConfig,
};
