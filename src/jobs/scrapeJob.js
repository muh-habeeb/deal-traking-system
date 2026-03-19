const cron = require('node-cron');
const env = require('../config/env');
const { runDealScan } = require('../services/dealService');
const logger = require('../utils/logger');

function startScrapeJob() {
  if (!cron.validate(env.scrapeCron)) {
    throw new Error(`Invalid cron expression: ${env.scrapeCron}`);
  }

  cron.schedule(env.scrapeCron, async () => {
    logger.info('Scheduled scan started');

    try {
      const result = await runDealScan();
      logger.info('Scheduled scan completed', result);
    } catch (error) {
      logger.error('Scheduled scan failed', { error: error.message });
    }
  });

  logger.info('Scrape job started', { cron: env.scrapeCron });
}

module.exports = {
  startScrapeJob,
};
