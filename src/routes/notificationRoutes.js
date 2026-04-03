const express = require('express');
const {
	sendNotificationTest,
	sendTelegramNotificationTest,
} = require('../controllers/notificationController');

const router = express.Router();

router.post('/test', sendNotificationTest);
router.post('/test-telegram', sendTelegramNotificationTest);

module.exports = router;
