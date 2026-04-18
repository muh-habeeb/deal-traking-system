require('dotenv').config();

const https = require('https');
const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in environment');
  process.exit(1);
}

const url = `https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`;

console.log('🔄 Removing webhook from Telegram bot...');

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      if (response.ok) {
        console.log('✅ Webhook removed successfully!');
        console.log('📝 Result:', response.result);
        console.log('\n✨ Username lookup via polling (getUpdates) is now enabled.');
        console.log('   The bot will now resolve @maya_vi_0 directly without fallback.');
      } else {
        console.error('❌ Telegram API error:', response.description);
        process.exit(1);
      }
    } catch (e) {
      console.error('❌ Failed to parse response:', e.message);
      console.log('Raw response:', data);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('❌ Network error:', err.message);
  process.exit(1);
});
