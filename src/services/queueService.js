const prisma = require('../config/prisma');
const env = require('../config/env');
const { normalizePriority } = require('./scheduleService');
const logger = require('../utils/logger');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addDelay(date, delayMs) {
  return new Date(date.getTime() + delayMs);
}

async function syncQueueJobs() {
  const filters = await prisma.filterConfig.findMany({
    select: { id: true, priority: true },
  });

  if (filters.length === 0) {
    await prisma.scrapeJob.deleteMany({});
    return { synced: 0, removedOrphans: 0 };
  }

  for (const filter of filters) {
    const priority = normalizePriority(filter.priority);
    await prisma.scrapeJob.upsert({
      where: { filterId: filter.id },
      create: {
        filterId: filter.id,
        priority,
        status: 'pending',
        nextRunAt: new Date(),
      },
      update: {
        priority,
      },
    });
  }

  const validFilterIds = filters.map((filter) => filter.id);
  const removed = await prisma.scrapeJob.deleteMany({
    where: {
      filterId: {
        notIn: validFilterIds,
      },
    },
  });

  logger.info('Queue jobs synced with filters', {
    synced: filters.length,
    removedOrphans: removed.count,
  });

  return { synced: filters.length, removedOrphans: removed.count };
}

async function acquireNextJob(workerId) {
  const staleCutoff = new Date(Date.now() - env.queue.staleLockMs);

  const pickedRows = await prisma.$queryRaw`
    WITH candidate AS (
      SELECT j."id"
      FROM "ScrapeJob" j
      WHERE
        (j."status" = 'pending' AND j."nextRunAt" <= NOW())
        OR (j."status" = 'running' AND j."lockedAt" IS NOT NULL AND j."lockedAt" < ${staleCutoff})
      ORDER BY
        CASE j."priority"
          WHEN 'high' THEN 0
          WHEN 'medium' THEN 1
          ELSE 2
        END ASC,
        j."nextRunAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "ScrapeJob" j
    SET
      "status" = 'running',
      "lockedAt" = NOW(),
      "workerId" = ${workerId},
      "lastStartedAt" = NOW(),
      "updatedAt" = NOW(),
      "attemptCount" = j."attemptCount" + 1,
      "lastError" = NULL
    FROM candidate
    WHERE j."id" = candidate."id"
    RETURNING j.*;
  `;

  if (!pickedRows || pickedRows.length === 0) {
    return null;
  }

  return pickedRows[0];
}

async function upsertJobForFilter(filterId, priority, runNow = true) {
  const normalizedPriority = normalizePriority(priority);
  const nextRunAt = runNow ? new Date() : undefined;

  return prisma.scrapeJob.upsert({
    where: { filterId },
    create: {
      filterId,
      priority: normalizedPriority,
      status: 'pending',
      nextRunAt: nextRunAt || new Date(),
    },
    update: {
      priority: normalizedPriority,
      status: 'pending',
      lockedAt: null,
      workerId: null,
      ...(nextRunAt ? { nextRunAt } : {}),
    },
  });
}

async function deleteJobForFilter(filterId) {
  await prisma.scrapeJob.deleteMany({
    where: { filterId },
  });
}

async function markJobSuccess(jobId, priority, delayMs) {
  const nextRunAt = addDelay(new Date(), delayMs);

  await prisma.scrapeJob.update({
    where: { id: jobId },
    data: {
      status: 'pending',
      priority: normalizePriority(priority),
      nextRunAt,
      lockedAt: null,
      workerId: null,
      lastFinishedAt: new Date(),
      lastError: null,
    },
  });

  return nextRunAt;
}

async function markJobFailure(jobId, priority, error, retryDelayMs) {
  const nextRunAt = addDelay(new Date(), retryDelayMs);

  await prisma.scrapeJob.update({
    where: { id: jobId },
    data: {
      status: 'pending',
      priority: normalizePriority(priority),
      nextRunAt,
      lockedAt: null,
      workerId: null,
      lastFinishedAt: new Date(),
      lastError: error ? String(error.message || error) : 'Unknown queue worker error',
    },
  });

  return nextRunAt;
}

module.exports = {
  sleep,
  syncQueueJobs,
  acquireNextJob,
  upsertJobForFilter,
  deleteJobForFilter,
  markJobSuccess,
  markJobFailure,
};
