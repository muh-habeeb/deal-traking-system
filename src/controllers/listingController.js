const { getRecentListings } = require('../services/listingService');
const { runDealScan } = require('../services/dealService');
const logger = require('../utils/logger');

const ALLOWED_IMAGE_HOST_SUFFIXES = ['fbcdn.net'];

function isAllowedImageHost(hostname) {
  const normalized = String(hostname || '').toLowerCase();
  return ALLOWED_IMAGE_HOST_SUFFIXES.some(
    (suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`)
  );
}

async function getListings(req, res, next) {
  try {
    const limit = Number(req.query.limit || 50);
    const refresh = ['1', 'true', 'yes'].includes(String(req.query.refresh || '').toLowerCase());

    if (refresh) {
      const scanSummary = await runDealScan();
      logger.info('Manual listings refresh scan completed', {
        scannedFilters: scanSummary.scannedFilters,
        newListings: scanSummary.newListings,
      });
    }

    const listings = await getRecentListings(Number.isFinite(limit) ? limit : 50);

    return res.json(listings);
  } catch (error) {
    return next(error);
  }
}

async function getListingImage(req, res, next) {
  const rawUrl = String(req.query.url || '').trim();
  if (!rawUrl) {
    return res.status(400).json({ message: 'Image URL is required' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch (_error) {
    return res.status(400).json({ message: 'Invalid image URL' });
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return res.status(400).json({ message: 'Unsupported URL protocol' });
  }

  if (!isAllowedImageHost(parsedUrl.hostname)) {
    return res.status(403).json({ message: 'Image host is not allowed' });
  }

  const fallbackToDirectImage = () => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.redirect(302, parsedUrl.toString());
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(parsedUrl.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'image/*,*/*;q=0.8',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      logger.warn('Image proxy upstream returned non-OK, falling back to direct URL', {
        status: response.status,
        url: parsedUrl.toString(),
      });
      return fallbackToDirectImage();
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) {
      return res.status(415).json({ message: 'Upstream response is not an image' });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(buffer);
  } catch (error) {
    if (error && error.name === 'AbortError') {
      logger.warn('Image proxy timed out, falling back to direct URL', {
        url: parsedUrl.toString(),
      });
      return fallbackToDirectImage();
    }

    logger.warn('Image proxy failed, falling back to direct URL', {
      url: parsedUrl.toString(),
      error: error && error.message ? error.message : String(error),
    });
    return fallbackToDirectImage();
  }
}

module.exports = {
  getListings,
  getListingImage,
};
