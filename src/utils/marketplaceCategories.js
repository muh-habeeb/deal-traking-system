const MARKETPLACE_CATEGORIES = [
  { key: 'all', label: 'All Categories', categoryId: null },
  { key: 'vehicles', label: 'Vehicles', categoryId: '807311116002614' },
  { key: 'property-rentals', label: 'Property Rentals', categoryId: '1468271819871448' },
  { key: 'property-for-sale', label: 'Property For Sale', categoryId: '126488334087718' },
  { key: 'electronics', label: 'Electronics', categoryId: '161145360579581' },
  { key: 'musical-instruments', label: 'Musical Instruments', categoryId: '184556318250570' },
  { key: 'home-garden', label: 'Home and Garden', categoryId: '135390646535370' },
  { key: 'family', label: 'Family', categoryId: '440465182817543' },
  { key: 'hobbies', label: 'Hobbies', categoryId: '133311478676' },
  { key: 'fashion', label: 'Fashion', categoryId: '253668394998465' },
  { key: 'pet-supplies', label: 'Pet Supplies', categoryId: '2230' },
  { key: 'sporting-goods', label: 'Sporting Goods', categoryId: '722863558250787' },
  { key: 'toys-games', label: 'Toys and Games', categoryId: '1331' },
  { key: 'free-stuff', label: 'Free Stuff', categoryId: '3021' },
];

const CATEGORY_MAP = new Map(MARKETPLACE_CATEGORIES.map((category) => [category.key, category]));

function normalizeCategoryKey(categoryKey) {
  if (!categoryKey) {
    return 'all';
  }

  const normalized = String(categoryKey).trim().toLowerCase();
  return CATEGORY_MAP.has(normalized) ? normalized : null;
}

function resolveCategory(categoryKey) {
  const normalizedKey = normalizeCategoryKey(categoryKey);
  if (!normalizedKey) {
    return null;
  }

  return CATEGORY_MAP.get(normalizedKey);
}

module.exports = {
  MARKETPLACE_CATEGORIES,
  normalizeCategoryKey,
  resolveCategory,
};
