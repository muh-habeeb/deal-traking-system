function sanitizeKeyword(keyword) {
  return String(keyword || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildMarketplaceSearchUrl({ baseUrl, keyword, location, minPrice, maxPrice }) {
  const pathKeyword = encodeURIComponent(sanitizeKeyword(keyword));
  const pathLocation = encodeURIComponent(String(location || ''));
  const url = pathLocation
    ? new URL(`${baseUrl}/${pathLocation}/search`)
    : new URL(`${baseUrl}/search`);

  if (pathKeyword) {
    url.searchParams.set('query', sanitizeKeyword(keyword));
  }

  if (Number.isFinite(minPrice)) {
    url.searchParams.set('minPrice', String(minPrice));
  }

  if (Number.isFinite(maxPrice)) {
    url.searchParams.set('maxPrice', String(maxPrice));
  }

  return url.toString();
}

module.exports = {
  buildMarketplaceSearchUrl,
};
