const express = require('express');
const { createFilter, getFilters } = require('../controllers/filterController');

const router = express.Router();

router.post('/', createFilter);
router.get('/', getFilters);

module.exports = router;
