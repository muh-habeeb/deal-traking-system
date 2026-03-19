const express = require('express');
const filterRoutes = require('./filterRoutes');
const listingRoutes = require('./listingRoutes');
const notificationRoutes = require('./notificationRoutes');
const authRoutes = require('./authRoutes');
const settingsRoutes = require('./settingsRoutes');
const facebookSessionRoutes = require('./facebookSessionRoutes');
const { requireAuth } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', authRoutes);

router.use(requireAuth);

router.use('/filters', filterRoutes);
router.use('/listings', listingRoutes);
router.use('/notifications', notificationRoutes);
router.use('/settings', settingsRoutes);
router.use('/facebook-session', facebookSessionRoutes);

module.exports = router;
