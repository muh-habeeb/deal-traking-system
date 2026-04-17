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

    if (result && result.skipped) {
      return res.status(400).json({
        message: result.reason,
        result,
      });
    }

    return res.json({
      message:
        result && result.recipientMode === 'chat_id_fallback'
          ? 'Telegram test sent using bot chat-id fallback (no username routing).'
          : 'Telegram test sent',
      result,
    });
  } catch (error) {
    const rawMessage = String(error && error.message ? error.message : 'Telegram test failed');
    const lower = rawMessage.toLowerCase();
    const needsStartMessage =
      lower.includes('chat not found') ||
      lower.includes('bot was blocked by the user') ||
      lower.includes('forbidden');
    const webhookConflict =
      lower.includes("can't use getupdates") ||
      (lower.includes('webhook') && lower.includes('active'));

    return res.status(error.status || 502).json({
      message: needsStartMessage
        ? 'Telegram cannot reach this user yet. The user must open your bot and send /start once, then test again.'
        : webhookConflict
          ? 'Webhook mode is active for this bot. Username lookup via getUpdates is blocked. Keep chat-id fallback, or disable webhook (deleteWebhook) if you want polling-based username lookup.'
        : rawMessage,
    });
  }
}

module.exports = {
  sendNotificationTest,
  sendTelegramNotificationTest,
};
