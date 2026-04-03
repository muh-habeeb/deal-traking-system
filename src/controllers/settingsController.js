const {
  getReceiverEmail,
  setReceiverEmail,
  getEmailSendingEnabled,
  setEmailSendingEnabled,
  getTelegramSendingEnabled,
  setTelegramSendingEnabled,
} = require('../services/settingsService');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
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
  return res.json({ telegramSendingEnabled: getTelegramSendingEnabled() });
}

async function updateTelegramDeliverySettings(req, res) {
  const { telegramSendingEnabled } = req.body || {};

  if (typeof telegramSendingEnabled !== 'boolean') {
    return res.status(400).json({ message: 'telegramSendingEnabled must be a boolean' });
  }

  const settings = setTelegramSendingEnabled(telegramSendingEnabled);
  return res.json({ telegramSendingEnabled: settings.telegramSendingEnabled });
}

module.exports = {
  getEmailSettings,
  updateEmailSettings,
  getEmailDeliverySettings,
  updateEmailDeliverySettings,
  getTelegramDeliverySettings,
  updateTelegramDeliverySettings,
};
