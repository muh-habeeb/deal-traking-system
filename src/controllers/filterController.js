const {
  createFilterConfig,
  getAllFilterConfigs,
  getFilterConfigById,
  updateFilterConfig,
  deleteFilterConfig,
} = require('../services/filterService');

function parseNumber(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function createFilter(req, res, next) {
  try {
    const { keyword, location, minPrice, maxPrice, userId } = req.body;

    if (!keyword || !location) {
      return res.status(400).json({
        message: 'keyword and location are required',
      });
    }

    const parsedMin = parseNumber(minPrice);
    const parsedMax = parseNumber(maxPrice);

    if (Number.isNaN(parsedMin) || Number.isNaN(parsedMax)) {
      return res.status(400).json({
        message: 'minPrice and maxPrice must be numbers when provided',
      });
    }

    if (parsedMin !== null && parsedMax !== null && parsedMin > parsedMax) {
      return res.status(400).json({
        message: 'minPrice cannot be greater than maxPrice',
      });
    }

    const filter = await createFilterConfig({
      keyword,
      location,
      minPrice: parsedMin,
      maxPrice: parsedMax,
      userId,
    });

    return res.status(201).json(filter);
  } catch (error) {
    return next(error);
  }
}

async function getFilters(_req, res, next) {
  try {
    const filters = await getAllFilterConfigs();
    return res.json(filters);
  } catch (error) {
    return next(error);
  }
}

async function getFilterById(req, res, next) {
  try {
    const { id } = req.params;
    const filter = await getFilterConfigById(id);

    if (!filter) {
      return res.status(404).json({ message: 'Filter not found' });
    }

    return res.json(filter);
  } catch (error) {
    return next(error);
  }
}

async function updateFilter(req, res, next) {
  try {
    const { id } = req.params;
    const { keyword, location, minPrice, maxPrice } = req.body;

    if (!keyword || !location) {
      return res.status(400).json({
        message: 'keyword and location are required',
      });
    }

    const parsedMin = parseNumber(minPrice);
    const parsedMax = parseNumber(maxPrice);

    if (Number.isNaN(parsedMin) || Number.isNaN(parsedMax)) {
      return res.status(400).json({
        message: 'minPrice and maxPrice must be numbers when provided',
      });
    }

    if (parsedMin !== null && parsedMax !== null && parsedMin > parsedMax) {
      return res.status(400).json({
        message: 'minPrice cannot be greater than maxPrice',
      });
    }

    const updated = await updateFilterConfig(id, {
      keyword,
      location,
      minPrice: parsedMin,
      maxPrice: parsedMax,
    });

    return res.json(updated);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Filter not found' });
    }
    return next(error);
  }
}

async function deleteFilter(req, res, next) {
  try {
    const { id } = req.params;
    await deleteFilterConfig(id);
    return res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Filter not found' });
    }
    return next(error);
  }
}

module.exports = {
  createFilter,
  getFilters,
  getFilterById,
  updateFilter,
  deleteFilter,
};
