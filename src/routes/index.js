const express = require('express');
const filterRoutes = require('./filterRoutes');
const listingRoutes = require('./listingRoutes');
const notificationRoutes = require('./notificationRoutes');

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/filters', filterRoutes);
router.use('/listings', listingRoutes);
router.use('/notifications', notificationRoutes);

module.exports = router;
