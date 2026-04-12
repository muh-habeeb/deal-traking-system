const prisma = require('../config/prisma');
const { normalizePriority } = require('./scheduleService');
const { upsertJobForFilter, deleteJobForFilter } = require('./queueService');

const FILTER_SELECT = {
  id: true,
  keyword: true,
  minPrice: true,
  maxPrice: true,
  location: true,
  cities: true,
  kmRadius: true,
  yearFrom: true,
  yearTo: true,
  kmDrivenMin: true,
  kmDrivenMax: true,
  priority: true,
  lastSeenCreatedAt: true,
  createdAt: true,
  userId: true,
};

async function createFilterConfig(payload) {
  const priority = normalizePriority(payload.priority);
  const data = {
    keyword: payload.keyword.trim(),
    minPrice: payload.minPrice ?? null,
    maxPrice: payload.maxPrice ?? null,
    location: payload.location.trim(),
    cities: payload.cities ? payload.cities.trim() : null,
    kmRadius: payload.kmRadius ?? null,
    yearFrom: payload.yearFrom ?? null,
    yearTo: payload.yearTo ?? null,
    kmDrivenMin: payload.kmDrivenMin ?? null,
    kmDrivenMax: payload.kmDrivenMax ?? null,
    priority,
    userId: payload.userId ?? null,
  };

  const filter = await prisma.filterConfig.create({ data, select: FILTER_SELECT });
  await upsertJobForFilter(filter.id, filter.priority, true);
  return filter;
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
  const priority = normalizePriority(payload.priority);
  const data = {
    keyword: payload.keyword.trim(),
    minPrice: payload.minPrice ?? null,
    maxPrice: payload.maxPrice ?? null,
    location: payload.location.trim(),
    cities: payload.cities ? payload.cities.trim() : null,
    kmRadius: payload.kmRadius ?? null,
    yearFrom: payload.yearFrom ?? null,
    yearTo: payload.yearTo ?? null,
    kmDrivenMin: payload.kmDrivenMin ?? null,
    kmDrivenMax: payload.kmDrivenMax ?? null,
    priority,
  };

  const updated = await prisma.filterConfig.update({
    where: { id },
    data,
    select: FILTER_SELECT,
  });

  await upsertJobForFilter(updated.id, updated.priority, true);
  return updated;
}

async function deleteFilterConfig(id) {
  const deleted = await prisma.filterConfig.delete({
    where: { id },
    select: { id: true },
  });

  await deleteJobForFilter(id);
  return deleted;
}

async function updateFilterLastSeen(filterId, lastSeenCreatedAt) {
  if (!lastSeenCreatedAt) {
    return;
  }

  await prisma.filterConfig.updateMany({
    where: {
      id: filterId,
      OR: [{ lastSeenCreatedAt: null }, { lastSeenCreatedAt: { lt: lastSeenCreatedAt } }],
    },
    data: {
      lastSeenCreatedAt,
    },
  });
}

module.exports = {
  createFilterConfig,
  getAllFilterConfigs,
  getFilterConfigById,
  updateFilterConfig,
  deleteFilterConfig,
  updateFilterLastSeen,
};
