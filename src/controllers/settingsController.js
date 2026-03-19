const { getReceiverEmail, setReceiverEmail } = require('../services/settingsService');

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

module.exports = {
  getEmailSettings,
  updateEmailSettings,
};
