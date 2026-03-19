const { createFilterConfig, getAllFilterConfigs } = require('../services/filterService');

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

module.exports = {
  createFilter,
  getFilters,
};
