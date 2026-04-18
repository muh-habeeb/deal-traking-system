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
  return String(getTelegramUsername() || '').trim().replace(/^@/, '');
}

let pollingModeEnsured = false;

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

async function fetchTelegramUpdates() {
  const endpoint = `${env.telegram.apiBaseUrl}/bot${env.telegram.token}/getUpdates`;
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
          limit: 100,
          timeout: 0,
          allowed_updates: ['message', 'edited_message', 'channel_post', 'callback_query'],
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

      if (!response.ok || !payload || payload.ok === false) {
        const description =
          (payload && payload.description) || bodyText || 'Unknown Telegram API error';
        const apiError = new Error(
          `Telegram API request failed (${response.status}): ${description}`
        );
        apiError.status = response.status >= 500 ? 502 : 400;
        throw apiError;
      }

      return Array.isArray(payload.result) ? payload.result : [];
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

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Telegram updates request failed');
}

function isWebhookConflictError(error) {
  const status = Number(error && error.status);
  const message = String(error && error.message ? error.message : '').toLowerCase();
  return (
    status === 409 ||
    (message.includes("can't use getupdates") && message.includes('webhook is active'))
  );
}

async function deleteWebhookForPolling() {
  const endpoint = `${env.telegram.apiBaseUrl}/bot${env.telegram.token}/deleteWebhook`;
  const timeoutMs = Math.max(1000, Number(env.telegram.requestTimeoutMs || 15000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        drop_pending_updates: false,
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

    if (!response.ok || !payload || payload.ok === false) {
      const description =
        (payload && payload.description) || bodyText || 'Unknown Telegram API error';
      const apiError = new Error(
        `Telegram API request failed (${response.status}): ${description}`
      );
      apiError.status = response.status >= 500 ? 502 : 400;
      throw apiError;
    }

    logger.warn('Telegram webhook was active; automatically deleted webhook to enable username lookup via updates');
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensurePollingModeForUsernameLookup() {
  if (pollingModeEnsured) {
    return;
  }

  await deleteWebhookForPolling();
  pollingModeEnsured = true;
}

async function getChatByUsername(username) {
  const normalized = String(username || '').trim().replace(/^@/, '');
  if (!normalized) {
    return null;
  }

  const endpoint = `${env.telegram.apiBaseUrl}/bot${env.telegram.token}/getChat`;
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
          chat_id: `@${normalized}`,
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

      if (!response.ok || !payload || payload.ok === false) {
        const description =
          (payload && payload.description) || bodyText || 'Unknown Telegram API error';
        const apiError = new Error(
          `Telegram API request failed (${response.status}): ${description}`
        );
        apiError.status = response.status >= 500 ? 502 : 400;
        throw apiError;
      }

      const chatId = payload && payload.result ? payload.result.id : null;
      if (chatId === null || chatId === undefined) {
        return null;
      }

      return String(chatId);
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

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error('Telegram getChat request failed');
}

function collectPotentialUsersFromUpdate(update) {
  const users = [];

  if (update && update.message && update.message.from) {
    users.push(update.message.from);
  }

  if (update && update.edited_message && update.edited_message.from) {
    users.push(update.edited_message.from);
  }

  if (update && update.callback_query && update.callback_query.from) {
    users.push(update.callback_query.from);
  }

  return users;
}

function normalizeAliasValue(value) {
  return String(value || '')
    .trim()
    .replace(/^@/, '')
    .replace(/^swoop_/i, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function extractAliasCommandCandidate(update) {
  const message =
    (update && update.message) ||
    (update && update.edited_message) ||
    null;

  if (!message || !message.from || !Number.isFinite(Number(message.from.id))) {
    return null;
  }

  const text = String(message.text || '').trim();
  if (!text) {
    return null;
  }

  const startWithPayload = text.match(/^\/start(?:@\w+)?\s+(.+)$/i);
  if (startWithPayload && startWithPayload[1]) {
    return {
      alias: normalizeAliasValue(startWithPayload[1]),
      chatId: String(message.from.id),
    };
  }

  const bindCommand = text.match(/^\/(?:swoop|bindrecipient|bind)(?:@\w+)?\s+(.+)$/i);
  if (bindCommand && bindCommand[1]) {
    return {
      alias: normalizeAliasValue(bindCommand[1]),
      chatId: String(message.from.id),
    };
  }

  return null;
}

function resolveAliasLinkedChatId(updates, normalizedUsername) {
  const target = normalizeAliasValue(normalizedUsername);
  if (!target || !Array.isArray(updates) || updates.length === 0) {
    return null;
  }

  for (let i = updates.length - 1; i >= 0; i -= 1) {
    const candidate = extractAliasCommandCandidate(updates[i]);
    if (!candidate || !candidate.alias || !candidate.chatId) {
      continue;
    }

    if (candidate.alias === target) {
      return candidate.chatId;
    }
  }

  return null;
}

async function resolveUsernameChatId(username) {
  const normalized = String(username || '').trim().replace(/^@/, '').toLowerCase();
  if (!normalized) {
    return null;
  }

  try {
    const chatId = await getChatByUsername(normalized);
    if (chatId) {
      return chatId;
    }
  } catch (error) {
    const message = String(error && error.message ? error.message : '').toLowerCase();
    const isResolvableLookupMiss =
      message.includes('chat not found') || message.includes('bad request: chat not found');

    if (!isResolvableLookupMiss) {
      throw error;
    }
  }

  await ensurePollingModeForUsernameLookup();

  let updates = [];
  try {
    updates = await fetchTelegramUpdates();
  } catch (error) {
    if (!isWebhookConflictError(error)) {
      throw error;
    }

    // Telegram can briefly report webhook conflicts after deletion; force one more ensure + retry.
    pollingModeEnsured = false;
    await ensurePollingModeForUsernameLookup();
    updates = await fetchTelegramUpdates();
  }

  for (let i = updates.length - 1; i >= 0; i -= 1) {
    const update = updates[i];
    const users = collectPotentialUsersFromUpdate(update);

    for (const user of users) {
      const candidateUsername = String(user && user.username ? user.username : '')
        .trim()
        .replace(/^@/, '')
        .toLowerCase();

      if (candidateUsername && candidateUsername === normalized && Number.isFinite(Number(user.id))) {
        return String(user.id);
      }
    }
  }

  const aliasLinkedChatId = resolveAliasLinkedChatId(updates, normalized);
  if (aliasLinkedChatId) {
    logger.info(`Resolved Telegram recipient via alias command for @${normalized}`);
    return aliasLinkedChatId;
  }

  return null;
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

  if (username) {
    const resolvedChatId = await resolveUsernameChatId(username);
    if (!resolvedChatId) {
      const error = new Error(
        `Telegram username @${username} could not be resolved. Open the bot and send /start ${username} (or /swoop ${username}) once, then retry.`
      );
      error.status = 400;
      throw error;
    }

    const payload = await sendTelegramMessageToChat(text, resolvedChatId);
    return {
      ...(payload || {}),
      recipientChatId: resolvedChatId,
      recipientMode: 'username_resolved',
      recipientUsername: `@${username}`,
    };
  }

  const fallbackChatId = String(env.telegram.chatId || '').trim();
  if (!fallbackChatId) {
    const error = new Error('Telegram delivery requires either a configured username or TELEGRAM_CHAT_ID env var.');
    error.status = 400;
    throw error;
  }

  const payload = await sendTelegramMessageToChat(text, fallbackChatId);
  return {
    ...(payload || {}),
    recipientChatId: fallbackChatId,
    recipientMode: 'chat_id_fallback',
  };
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
