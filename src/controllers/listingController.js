const { getRecentListings } = require('../services/listingService');

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
      return res.status(502).json({ message: `Upstream image request failed (${response.status})` });
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
      return res.status(504).json({ message: 'Image request timed out' });
    }

    return next(error);
  }
}

module.exports = {
  getListings,
  getListingImage,
};
