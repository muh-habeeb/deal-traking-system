const express = require('express');
const {
	createFilter,
	getFilters,
	getFilterById,
	updateFilter,
	deleteFilter,
} = require('../controllers/filterController');

const router = express.Router();

router.post('/', createFilter);
router.get('/', getFilters);
router.get('/:id', getFilterById);
router.put('/:id', updateFilter);
router.delete('/:id', deleteFilter);

module.exports = router;
