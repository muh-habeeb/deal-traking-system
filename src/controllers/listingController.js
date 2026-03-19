const { getRecentListings } = require('../services/listingService');

async function getListings(req, res, next) {
  try {
    const limit = Number(req.query.limit || 50);
    const listings = await getRecentListings(Number.isFinite(limit) ? limit : 50);

    return res.json(listings);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getListings,
};
