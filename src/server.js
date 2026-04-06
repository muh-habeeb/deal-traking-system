const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prisma');
const { createQueueWorker } = require('./workers/queueWorker');
const { syncQueueJobs } = require('./services/queueService');
const { verifyEmailTransport } = require('./services/emailService');
const logger = require('./utils/logger');

let embeddedWorker = null;
let embeddedWorkerRestartTimer = null;
let shuttingDown = false;

function startEmbeddedWorker() {
  embeddedWorker = createQueueWorker({
    workerId: `server-${process.pid}`,
    // bootstrap() already syncs queue jobs when enabled.
    skipInitialSync: env.queue.syncOnBoot,
  });

  setImmediate(() => {
    embeddedWorker.runLoop().catch((error) => {
      logger.error('Embedded queue worker crashed', { error: error.message });

      if (shuttingDown) {
        return;
      }

      if (embeddedWorkerRestartTimer) {
        clearTimeout(embeddedWorkerRestartTimer);
      }

      embeddedWorkerRestartTimer = setTimeout(() => {
        logger.warn('Restarting embedded queue worker after crash', {
          delayMs: env.queue.workerRestartDelayMs,
        });
        startEmbeddedWorker();
      }, env.queue.workerRestartDelayMs);
    });
  });
}

async function syncQueueJobsOnBoot() {
  const maxAttempts = 3;
  const retryDelayMs = 2000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await syncQueueJobs();
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }

      logger.warn('Queue sync on boot failed; retrying.', {
        attempt,
        maxAttempts,
        retryDelayMs,
        error: error.message,
      });

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  return { synced: 0, removedOrphans: 0 };
}

async function bootstrap() {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    try {
      await verifyEmailTransport();
    } catch (error) {
      logger.warn('SMTP verification failed. Email alerts may not be delivered.', {
        error: error.message,
      });
    }

    app.listen(env.port, '0.0.0.0', () => {
      logger.info(`Server running on port ${env.port}`);
    });

    if (env.queue.syncOnBoot) {
      try {
        await syncQueueJobsOnBoot();
      } catch (error) {
        logger.error('Failed to sync queue jobs on boot; continuing startup.', {
          error: error.message,
          stack: error.stack,
          phase: 'bootstrap.syncQueueJobs',
        });
      }
    }

    if (env.queue.startWorkerInServer) {
      startEmbeddedWorker();
    }
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack,
      phase: 'bootstrap',
    });
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  shuttingDown = true;
  logger.info('SIGINT received. Closing Prisma connection.');
  if (embeddedWorkerRestartTimer) {
    clearTimeout(embeddedWorkerRestartTimer);
  }
  if (embeddedWorker) {
    embeddedWorker.stop();
  }
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  shuttingDown = true;
  logger.info('SIGTERM received. Closing Prisma connection.');
  if (embeddedWorkerRestartTimer) {
    clearTimeout(embeddedWorkerRestartTimer);
  }
  if (embeddedWorker) {
    embeddedWorker.stop();
  }
  await prisma.$disconnect();
  process.exit(0);
});

bootstrap();
