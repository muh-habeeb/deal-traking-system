const express = require('express');
const { sendNotificationTest } = require('../controllers/notificationController');

const router = express.Router();

router.post('/test', sendNotificationTest);

module.exports = router;
