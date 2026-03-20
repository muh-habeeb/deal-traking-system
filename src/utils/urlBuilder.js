const { resolveCategory } = require('./marketplaceCategories');

function sanitizeKeyword(keyword) {
  return String(keyword || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildMarketplaceSearchUrl({ baseUrl, keyword, location, minPrice, maxPrice, categoryKey }) {
  const pathKeyword = encodeURIComponent(sanitizeKeyword(keyword));
  const pathLocation = encodeURIComponent(String(location || ''));
  const category = resolveCategory(categoryKey || 'all');

  const url = category && category.categoryId
    ? new URL(`${baseUrl}/category/search`)
    : new URL(`${baseUrl}/${pathLocation}/search`);

  if (pathKeyword) {
    url.searchParams.set('query', sanitizeKeyword(keyword));
  }

  if (category && category.categoryId) {
    url.searchParams.set('category_id', category.categoryId);
    url.searchParams.set('exact', 'false');
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
