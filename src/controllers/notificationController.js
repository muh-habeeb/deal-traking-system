const { sendTestEmail } = require('../services/emailService');
const { sendTestTelegramAlert } = require('../services/telegramService');

async function sendNotificationTest(_req, res, next) {
  try {
    const result = await sendTestEmail();
    return res.json({
      message: 'Test email sent',
      result,
    });
  } catch (error) {
    return next(error);
  }
}

async function sendTelegramNotificationTest(_req, res, next) {
  try {
    const result = await sendTestTelegramAlert();
    return res.json({
      message: result && result.skipped ? 'Telegram test skipped' : 'Telegram test sent',
      result,
    });
  } catch (error) {
    return res.status(error.status || 502).json({
      message: error.message || 'Telegram test failed',
    });
  }
}

module.exports = {
  sendNotificationTest,
  sendTelegramNotificationTest,
};
