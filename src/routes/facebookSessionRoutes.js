const express = require('express');
const {
	getSessionStatus,
	startSessionLogin,
	saveSession,
	logoutSession,
	importSession,
} = require('../controllers/facebookSessionController');

const router = express.Router();

router.get('/status', getSessionStatus);
router.post('/start', startSessionLogin);
router.post('/save', saveSession);
router.post('/import', importSession);
router.post('/logout', logoutSession);

module.exports = router;
