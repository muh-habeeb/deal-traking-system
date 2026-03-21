const app = require('./app');
const env = require('./config/env');
const prisma = require('./config/prisma');
const { startScrapeJob, runStartupScan } = require('./jobs/scrapeJob');
const { verifyEmailTransport } = require('./services/emailService');
const logger = require('./utils/logger');

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

    startScrapeJob();

    // Run one scan on boot in the background so initial data does not wait for cron tick.
    setImmediate(() => {
      runStartupScan().catch((error) => {
        logger.error('Unexpected startup scan error', { error: error.message });
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Closing Prisma connection.');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Closing Prisma connection.');
  await prisma.$disconnect();
  process.exit(0);
});

bootstrap();
