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
  embeddedWorker = createQueueWorker({ workerId: `server-${process.pid}` });

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
      await syncQueueJobs();
    }

    if (env.queue.startWorkerInServer) {
      startEmbeddedWorker();
    }
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
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
