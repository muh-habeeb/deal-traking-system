const {
  getReceiverEmail,
  setReceiverEmail,
  getEmailSendingEnabled,
  setEmailSendingEnabled,
  getTelegramSendingEnabled,
  setTelegramSendingEnabled,
  getTelegramUsername,
  setTelegramUsername,
  normalizeTelegramUsername,
} = require('../services/settingsService');
const env = require('../config/env');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function isValidTelegramUsername(value) {
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(String(value || '').trim());
}

async function getEmailSettings(_req, res) {
  return res.json({ receiverEmail: getReceiverEmail() });
}

async function updateEmailSettings(req, res) {
  const receiverEmail = String(req.body.receiverEmail || '').trim();

  if (!isValidEmail(receiverEmail)) {
    return res.status(400).json({ message: 'Invalid receiverEmail' });
  }

  const settings = setReceiverEmail(receiverEmail);
  return res.json(settings);
}

async function getEmailDeliverySettings(_req, res) {
  return res.json({ emailSendingEnabled: getEmailSendingEnabled() });
}

async function updateEmailDeliverySettings(req, res) {
  const { emailSendingEnabled } = req.body || {};

  if (typeof emailSendingEnabled !== 'boolean') {
    return res.status(400).json({ message: 'emailSendingEnabled must be a boolean' });
  }

  const settings = setEmailSendingEnabled(emailSendingEnabled);
  return res.json({ emailSendingEnabled: settings.emailSendingEnabled });
}

async function getTelegramDeliverySettings(_req, res) {
  const telegramUsername = getTelegramUsername();
  return res.json({
    telegramSendingEnabled: getTelegramSendingEnabled(),
    telegramUsername,
    recipientConfigured: Boolean(telegramUsername),
    usingFallbackRecipient: !telegramUsername,
  });
}

async function updateTelegramDeliverySettings(req, res) {
  const { telegramSendingEnabled } = req.body || {};

  if (typeof telegramSendingEnabled !== 'boolean') {
    return res.status(400).json({ message: 'telegramSendingEnabled must be a boolean' });
  }

  if (telegramSendingEnabled && !(env.telegram.enabled && env.telegram.token && env.telegram.chatId)) {
    return res.status(400).json({
      message: 'Telegram bot is not fully configured in environment (token/chat id missing)',
    });
  }

  const settings = setTelegramSendingEnabled(telegramSendingEnabled);
  return res.json({
    telegramSendingEnabled: settings.telegramSendingEnabled,
    telegramUsername: settings.telegramUsername,
    recipientConfigured: Boolean(settings.telegramUsername),
    usingFallbackRecipient: !settings.telegramUsername,
  });
}

async function getTelegramRecipientSettings(_req, res) {
  const telegramUsername = getTelegramUsername();
  return res.json({
    telegramUsername,
    recipientConfigured: Boolean(telegramUsername),
  });
}

async function updateTelegramRecipientSettings(req, res) {
  const normalized = normalizeTelegramUsername(req.body && req.body.telegramUsername);
  if (!normalized || !isValidTelegramUsername(normalized)) {
    return res.status(400).json({
      message: 'Invalid telegramUsername. Use letters/numbers/underscore, 5-32 chars.',
    });
  }

  const settings = setTelegramUsername(normalized);
  return res.json({
    telegramUsername: settings.telegramUsername,
    recipientConfigured: Boolean(settings.telegramUsername),
  });
}

module.exports = {
  getEmailSettings,
  updateEmailSettings,
  getEmailDeliverySettings,
  updateEmailDeliverySettings,
  getTelegramDeliverySettings,
  updateTelegramDeliverySettings,
  getTelegramRecipientSettings,
  updateTelegramRecipientSettings,
};
