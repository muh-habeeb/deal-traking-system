const prisma = require('../config/prisma');
const env = require('../config/env');
const logger = require('../utils/logger');

async function cleanupOldData() {
  const now = Date.now();
  const notificationCutoff = new Date(now - env.notificationRetentionHours * 60 * 60 * 1000);
  const listingCutoff = new Date(now - env.listingRetentionHours * 60 * 60 * 1000);

  const [notificationResult, listingResult] = await Promise.all([
    prisma.notificationLog.deleteMany({
      where: {
        sentAt: {
          lt: notificationCutoff,
        },
      },
    }),
    prisma.listing.deleteMany({
      where: {
        createdAt: {
          lt: listingCutoff,
        },
      },
    }),
  ]);

  const summary = {
    deletedNotifications: notificationResult.count,
    deletedListings: listingResult.count,
    notificationCutoff: notificationCutoff.toISOString(),
    listingCutoff: listingCutoff.toISOString(),
  };

  if (summary.deletedNotifications > 0 || summary.deletedListings > 0) {
    logger.info('Old data cleanup completed', summary);
  }

  return summary;
}

module.exports = {
  cleanupOldData,
};
