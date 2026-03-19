const express = require('express');
const { getListings } = require('../controllers/listingController');

const router = express.Router();

router.get('/', getListings);

module.exports = router;
