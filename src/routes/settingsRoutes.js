const express = require('express');
const {
  getEmailSettings,
  updateEmailSettings,
  getEmailDeliverySettings,
  updateEmailDeliverySettings,
} = require('../controllers/settingsController');

const router = express.Router();

router.get('/email', getEmailSettings);
router.put('/email', updateEmailSettings);
router.get('/email-delivery', getEmailDeliverySettings);
router.put('/email-delivery', updateEmailDeliverySettings);

module.exports = router;
