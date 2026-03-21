const {
  getReceiverEmail,
  setReceiverEmail,
  getEmailSendingEnabled,
  setEmailSendingEnabled,
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

module.exports = {
  getEmailSettings,
  updateEmailSettings,
  getEmailDeliverySettings,
  updateEmailDeliverySettings,
};
