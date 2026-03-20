const prisma = require('../config/prisma');

const FILTER_SELECT = {
  id: true,
  keyword: true,
  minPrice: true,
  maxPrice: true,
  location: true,
  createdAt: true,
  userId: true,
};

async function createFilterConfig(payload) {
  const data = {
    keyword: payload.keyword.trim(),
    minPrice: payload.minPrice ?? null,
    maxPrice: payload.maxPrice ?? null,
    location: payload.location.trim(),
    userId: payload.userId ?? null,
  };

  return prisma.filterConfig.create({ data, select: FILTER_SELECT });
}

async function getAllFilterConfigs() {
  return prisma.filterConfig.findMany({
    select: FILTER_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

async function getFilterConfigById(id) {
  return prisma.filterConfig.findUnique({
    where: { id },
    select: FILTER_SELECT,
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
    select: FILTER_SELECT,
  });
}

async function deleteFilterConfig(id) {
  return prisma.filterConfig.delete({
    where: { id },
    select: { id: true },
  });
}

module.exports = {
  createFilterConfig,
  getAllFilterConfigs,
  getFilterConfigById,
  updateFilterConfig,
  deleteFilterConfig,
};
