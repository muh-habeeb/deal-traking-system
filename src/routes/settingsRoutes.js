const express = require('express');
const {
  getEmailSettings,
  updateEmailSettings,
  getEmailDeliverySettings,
  updateEmailDeliverySettings,
  getTelegramDeliverySettings,
  updateTelegramDeliverySettings,
} = require('../controllers/settingsController');

const router = express.Router();

router.get('/email', getEmailSettings);
router.put('/email', updateEmailSettings);
router.get('/email-delivery', getEmailDeliverySettings);
router.put('/email-delivery', updateEmailDeliverySettings);
router.get('/telegram-delivery', getTelegramDeliverySettings);
router.put('/telegram-delivery', updateTelegramDeliverySettings);

module.exports = router;
