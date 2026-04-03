const env = require('../config/env');
const logger = require('../utils/logger');

function isTelegramReady() {
  return Boolean(env.telegram.enabled && env.telegram.token && env.telegram.chatId);
}

function formatPrice(price) {
  if (price === null || price === undefined) {
    return 'N/A';
  }

  return `CA$${Number(price).toLocaleString('en-CA')}`;
}

function formatPostedDate(postedAt, postedText, createdAt) {
  const candidate = postedAt || createdAt;

  if (candidate) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    }
  }

  return postedText || 'N/A';
}

function buildListingMessage(listing) {
  return [
    'New Car Deal',
    '',
    `${listing.vehicleName || listing.title || 'N/A'}`,
    `Price: ${formatPrice(listing.price)}`,
    `Location: ${listing.location || 'N/A'}`,
    `Posted: ${formatPostedDate(listing.postedAt, listing.postedText, listing.createdAt)}`,
    '',
    listing.url || 'N/A',
  ].join('\n');
}

async function sendTelegramMessage(text) {
  if (!isTelegramReady()) {
    return { skipped: true, reason: 'Telegram disabled or missing credentials' };
  }

  const endpoint = `${env.telegram.apiBaseUrl}/bot${env.telegram.token}/sendMessage`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: env.telegram.chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const message = `Telegram API request failed (${response.status}): ${body}`;
    throw new Error(message);
  }

  return response.json();
}

async function sendNewListingTelegramAlert(listing) {
  const text = buildListingMessage(listing);
  const result = await sendTelegramMessage(text);

  logger.info('Telegram alert dispatched', {
    listingId: listing.id,
    skipped: Boolean(result && result.skipped),
  });

  return result;
}

async function sendTestTelegramAlert() {
  return sendTelegramMessage('Swoop test alert: Telegram notifications are working.');
}

module.exports = {
  isTelegramReady,
  sendTelegramMessage,
  sendNewListingTelegramAlert,
  sendTestTelegramAlert,
};
