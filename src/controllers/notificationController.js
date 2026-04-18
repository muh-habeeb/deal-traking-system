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
          : 'Telegram test sent to @' + (result && result.recipientUsername ? result.recipientUsername.replace('@', '') : 'user'),
      result,
    });
  } catch (error) {
    const rawMessage = String(error && error.message ? error.message : 'Telegram test failed');
    const lower = rawMessage.toLowerCase();
    
    const userNotFound =
      lower.includes('chat not found') ||
      lower.includes('bot was blocked by the user') ||
      lower.includes('forbidden') ||
      lower.includes('user is an administrator of the chat') ||
      lower.includes('user not found');
    
    const webhookConflict =
      lower.includes("can't use getupdates") ||
      (lower.includes('webhook') && lower.includes('active'));
    
    const noFallback = lower.includes('could not be resolved, and no fallback');

    return res.status(error.status || 502).json({
      message: noFallback
        ? 'No Telegram username saved and no fallback chat-id configured. Save a username or set TELEGRAM_CHAT_ID.'
        : userNotFound
          ? 'Telegram cannot reach this user. Ensure they have opened your bot and interacted with it.'
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
