const express = require('express');
const { getEmailSettings, updateEmailSettings } = require('../controllers/settingsController');

const router = express.Router();

router.get('/email', getEmailSettings);
router.put('/email', updateEmailSettings);

module.exports = router;
