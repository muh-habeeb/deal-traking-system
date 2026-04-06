const prisma = require('../config/prisma');
const env = require('../config/env');
const {
  sleep,
  syncQueueJobs,
  acquireNextJob,
  deleteJobForFilter,
  markJobSuccess,
  markJobFailure,
} = require('../services/queueService');
const { getFilterConfigById } = require('../services/filterService');
const { getNextDelayMs, normalizePriority } = require('../services/scheduleService');
const { runFilterScan } = require('../services/dealService');
const { cleanupOldData } = require('../services/cleanupService');
const logger = require('../utils/logger');

function buildWorkerId() {
  return `${process.pid}-${Math.random().toString(16).slice(2, 8)}`;
}

function createQueueWorker(options = {}) {
  const workerId = options.workerId || buildWorkerId();
  const skipInitialSync = Boolean(options.skipInitialSync);
  let stopped = false;
  let processedJobs = 0;

  async function runLoop() {
    if (env.queue.syncOnBoot && !skipInitialSync) {
      try {
        await syncQueueJobs();
      } catch (error) {
        logger.error('Initial queue sync failed; continuing worker loop.', {
          workerId,
          error: error.message,
          phase: 'worker.initialSync',
        });
      }
    }

    logger.info('Queue worker started', {
      workerId,
      idleSleepMs: env.queue.workerIdleSleepMs,
    });

    while (!stopped) {
      let job = null;

      try {
        job = await acquireNextJob(workerId);

        if (!job) {
          await sleep(env.queue.workerIdleSleepMs);
          continue;
        }

        const jobPriority = normalizePriority(job.priority);

        logger.info('Worker running job', {
          workerId,
          jobId: job.id,
          filterId: job.filterId,
          priority: jobPriority,
          attemptCount: job.attemptCount,
        });

        try {
          const filter = await getFilterConfigById(job.filterId);

          if (!filter) {
            await deleteJobForFilter(job.filterId);
            continue;
          }

          const result = await runFilterScan(filter);
          const nextDelayMs = getNextDelayMs(filter.priority);
          const nextRunAt = await markJobSuccess(job.id, filter.priority, nextDelayMs);

          processedJobs += 1;
          if (processedJobs % env.queue.cleanupEveryJobs === 0) {
            await cleanupOldData();
          }

          logger.info('Queue job completed', {
            workerId,
            jobId: job.id,
            filterId: filter.id,
            priority: normalizePriority(filter.priority),
            newListings: result.newListings,
            scannedListings: result.scannedListings,
            nextRunAt: nextRunAt.toISOString(),
          });
        } catch (error) {
          try {
            const nextRunAt = await markJobFailure(
              job.id,
              jobPriority,
              error,
              env.queue.workerErrorRetryMs
            );

            logger.error('Queue job failed', {
              workerId,
              jobId: job.id,
              filterId: job.filterId,
              error: error.message,
              nextRunAt: nextRunAt.toISOString(),
            });
          } catch (markError) {
            logger.error('Queue job failure could not be persisted', {
              workerId,
              jobId: job.id,
              filterId: job.filterId,
              error: error.message,
              markError: markError.message,
            });
          }

          await sleep(env.queue.workerErrorRetryMs);
        }
      } catch (loopError) {
        logger.error('Queue worker loop error', {
          workerId,
          jobId: job ? job.id : null,
          error: loopError.message,
        });

        try {
          await prisma.$connect();
        } catch (_connectError) {
          // Keep retrying with backoff; Prisma/pg pool may recover when network comes back.
        }

        await sleep(env.queue.workerErrorRetryMs);
      }
    }
  }

  function stop() {
    stopped = true;
  }

  return {
    workerId,
    runLoop,
    stop,
  };
}

async function runStandaloneWorker() {
  await prisma.$connect();
  const worker = createQueueWorker();

  const shutdown = async (signal) => {
    logger.info(`Queue worker received ${signal}, shutting down.`, {
      workerId: worker.workerId,
    });
    worker.stop();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT').catch((error) => {
      logger.error('Failed to stop queue worker on SIGINT', { error: error.message });
      process.exit(1);
    });
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch((error) => {
      logger.error('Failed to stop queue worker on SIGTERM', { error: error.message });
      process.exit(1);
    });
  });

  await worker.runLoop();
}

if (require.main === module) {
  runStandaloneWorker().catch(async (error) => {
    logger.error('Standalone queue worker crashed', { error: error.message });
    await prisma.$disconnect();
    process.exit(1);
  });
}

module.exports = {
  createQueueWorker,
  runStandaloneWorker,
};
