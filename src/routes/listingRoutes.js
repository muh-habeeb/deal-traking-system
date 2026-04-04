const express = require('express');
const { getListings, getListingImage } = require('../controllers/listingController');

const router = express.Router();

router.get('/', getListings);
router.get('/image', getListingImage);

module.exports = router;
