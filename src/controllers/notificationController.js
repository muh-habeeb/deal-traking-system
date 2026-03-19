const { sendTestEmail } = require('../services/emailService');

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

module.exports = {
  sendNotificationTest,
};
