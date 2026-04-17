const env = require('../config/env');
const logger = require('../utils/logger');
const { getTelegramUsername } = require('./settingsService');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTelegramReady() {
  return Boolean(env.telegram.enabled && env.telegram.token && env.telegram.chatId);
}

function resolveTelegramUsername() {
  const fromSettings = String(getTelegramUsername() || '').trim().replace(/^@/, '');
  if (fromSettings) {
    return fromSettings;
  }

  return String(env.telegram.username || '').trim().replace(/^@/, '');
}

async function sendTelegramMessageToChat(text, chatId) {
  const endpoint = `${env.telegram.apiBaseUrl}/bot${env.telegram.token}/sendMessage`;
  const retries = Math.max(0, Number(env.telegram.requestRetries || 0));
  const timeoutMs = Math.max(1000, Number(env.telegram.requestTimeoutMs || 15000));

  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      });

      const bodyText = await response.text().catch(() => '');
      let payload = null;
      try {
        payload = bodyText ? JSON.parse(bodyText) : null;
      } catch (_error) {
        payload = null;
      }

      if (!response.ok || (payload && payload.ok === false)) {
        const description =
          (payload && payload.description) || bodyText || 'Unknown Telegram API error';
        const apiError = new Error(
          `Telegram API request failed (${response.status}): ${description}`
        );
        apiError.status = response.status >= 500 ? 502 : 400;
        throw apiError;
      }

      return payload || { ok: true };
    } catch (error) {
      lastError = error;
      const code = error && error.cause && error.cause.code ? error.cause.code : '';
      const isAbort = error && error.name === 'AbortError';
      const isNetworkIssue =
        isAbort || ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code);

      if (attempt < retries && isNetworkIssue) {
        await sleep(350 * (attempt + 1));
        continue;
      }

      if (isNetworkIssue) {
        const networkError = new Error(
          `Telegram network request failed (${code || (isAbort ? 'TIMEOUT' : 'UNKNOWN')}). Check outbound internet/firewall or TELEGRAM_API_BASE_URL.`
        );
        networkError.status = 502;
        throw networkError;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Telegram request failed');
}

function formatPrice(price) {
  if (price === null || price === undefined) {
    return 'N/A';
  }

  return `CA$${Number(price).toLocaleString('en-CA')}`;
}

function formatPostedDate(postedAt, postedText) {
  const candidate = postedAt;

  if (candidate) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    }
  }

  if (postedText && postedText.toLowerCase() !== 'none') {
    return postedText;
  }

  return 'Just scraped';
}

function buildListingMessage(listing) {
  return [
    'New Car Deal',
    '',
    `${listing.vehicleName || listing.title || 'N/A'}`,
    `Price: ${formatPrice(listing.price)}`,
    `Location: ${listing.location || 'N/A'}`,
    `Posted: ${formatPostedDate(listing.postedAt, listing.postedText)}`,
    '',
    listing.url || 'N/A',
  ].join('\n');
}

async function sendTelegramMessage(text) {
  if (!isTelegramReady()) {
    return { skipped: true, reason: 'Telegram disabled or missing credentials' };
  }

  const username = resolveTelegramUsername();
  const recipients = [];

  if (username) {
    recipients.push(`@${username}`);
  }

  recipients.push(env.telegram.chatId);

  const uniqueRecipients = Array.from(new Set(recipients.filter(Boolean)));
  let lastError = null;

  for (let index = 0; index < uniqueRecipients.length; index += 1) {
    const chatId = uniqueRecipients[index];
    try {
      const payload = await sendTelegramMessageToChat(text, chatId);
      return {
        ...(payload || {}),
        recipientChatId: chatId,
        recipientMode: chatId.startsWith('@') ? 'username' : 'chat_id',
      };
    } catch (error) {
      lastError = error;
      const canFallback = index < uniqueRecipients.length - 1;
      if (!canFallback) {
        break;
      }

      logger.warn('Telegram send failed for primary recipient, trying fallback recipient', {
        chatId,
        error: error.message,
      });
    }
  }

  throw lastError || new Error('Telegram request failed');
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
