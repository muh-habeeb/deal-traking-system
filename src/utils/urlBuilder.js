function sanitizeKeyword(keyword) {
  return String(keyword || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeLocationForPath(location) {
  const text = sanitizeKeyword(location);
  if (!text) {
    return '';
  }

  const lower = text.toLowerCase();
  const aliasesToCity = {
    bc: 'vancouver',
    'british columbia': 'vancouver',
    ab: 'calgary',
    alberta: 'calgary',
    on: 'toronto',
    ontario: 'toronto',
    qc: 'montreal',
    quebec: 'montreal',
    ns: 'halifax',
    'nova scotia': 'halifax',
    nb: 'fredericton',
    'new brunswick': 'fredericton',
    mb: 'winnipeg',
    manitoba: 'winnipeg',
    sk: 'saskatoon',
    saskatchewan: 'saskatoon',
    nl: "st-john's",
    'newfoundland and labrador': "st-john's",
  };

  return aliasesToCity[lower] || lower;
}

function buildMarketplaceSearchUrl({ baseUrl, keyword, location, minPrice, maxPrice }) {
  const normalizedKeyword = sanitizeKeyword(keyword);
  const normalizedLocation = sanitizeKeyword(location);
  const locationPathSegment = normalizeLocationForPath(normalizedLocation);
  const looksLikePlaceId = /^\d{8,}$/.test(locationPathSegment);
  const hasLocationPath = Boolean(locationPathSegment);
  const url = hasLocationPath
    ? new URL(
        looksLikePlaceId
          ? `${baseUrl}/${locationPathSegment}/search/`
          : `${baseUrl}/${encodeURIComponent(locationPathSegment)}/search/`
      )
    : new URL(`${baseUrl}/search/`);

  // Match proven FB link shape for fresher results in vehicle-only category.
  if (normalizedKeyword) {
    url.searchParams.set('query', normalizedKeyword);
  } else if (normalizedLocation && !hasLocationPath) {
    url.searchParams.set('query', normalizedLocation);
  } else {
    url.searchParams.set('query', 'Vehicles');
  }

  url.searchParams.set('sortBy', 'creation_time_descend');
  url.searchParams.set('category_id', '546583916084032');
  url.searchParams.set('exact', 'false');
  url.searchParams.set('radius_in_km', '500');

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
