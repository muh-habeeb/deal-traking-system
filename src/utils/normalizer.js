function parsePrice(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  if (/\b(free|gratuit)\b/i.test(text)) {
    return 0;
  }

  // Avoid interpreting years or model numbers as prices.
  const hasCurrencyHint = /(ca\$|c\$|cad\b|\$)/i.test(text);
  if (!hasCurrencyHint) {
    return null;
  }

  const amountMatch = text.match(/(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d{2})?/);
  if (!amountMatch) {
    return null;
  }

  const numeric = amountMatch[1].replace(/[,\s]/g, '');

  if (!numeric) {
    return null;
  }

  return Number(numeric);
}

function normalizeListingUrl(value) {
  if (!value) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw);
    const normalizedPath = parsed.pathname.endsWith('/')
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname;
    return `${parsed.origin}${normalizedPath}`;
  } catch (_error) {
    return raw;
  }
}

function parseModelYear(value) {
  const match = String(value || '').match(/\b(19\d{2}|20\d{2})\b/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function isLikelyPriceText(value) {
  if (!value) {
    return false;
  }

  const text = String(value).trim();
  const hasCurrencyHint = /(ca\$|c\$|cad\b|\$|\bfree\b|\bgratuit\b)/i.test(text);
  const hasAmount = /(\d{1,3}(?:[,\s]\d{3})+|\d+)/.test(text);
  return hasCurrencyHint && hasAmount;
}

function isMetaOrLocationLine(value) {
  if (!value) {
    return true;
  }

  return (
    /^listed\s+/i.test(value) ||
    /^seller'?s description/i.test(value) ||
    /^location is approximat/i.test(value) ||
    /,\s*[A-Z]{2}\b/.test(value)
  );
}

function extractLocationFromTitle(title) {
  const text = String(title || '').trim();
  if (!text) {
    return null;
  }

  const withState = text.match(/\sin\s([A-Za-z .'-]+,\s*[A-Z]{2})\b/i);
  if (withState?.[1]) {
    return withState[1].trim();
  }

  return null;
}

function stripTrailingLocationFromTitle(title) {
  return String(title || '')
    .replace(/\sin\s[A-Za-z .'-]+,\s*[A-Z]{2}\b.*$/i, '')
    .trim();
}

function pickTitle(raw) {
  const baseTitle = (raw.title || '').trim();

  if (baseTitle && !isLikelyPriceText(baseTitle)) {
    return baseTitle;
  }

  const rawLines = Array.isArray(raw.rawLines) ? raw.rawLines : [];
  const fromLines = rawLines.find((line) => {
    const value = String(line || '').trim();
    if (!value || isLikelyPriceText(value) || isMetaOrLocationLine(value)) {
      return false;
    }

    return /[A-Za-z]/.test(value);
  });

  if (fromLines) {
    return fromLines.trim();
  }

  const fallbackFromSearch = String(raw.searchableText || '')
    .split(/\s{2,}|\n/)
    .map((line) => line.trim())
    .find((line) => line && !isLikelyPriceText(line) && /[A-Za-z]/.test(line));

  if (fallbackFromSearch) {
    return fallbackFromSearch;
  }

  return baseTitle || 'Untitled Listing';
}

function parseVehicleNameFromTitle(title, modelYear) {
  const clean = stripTrailingLocationFromTitle(title);
  if (!clean) {
    return null;
  }

  const withoutYear = modelYear
    ? clean.replace(new RegExp(`^${modelYear}\\s+`), '').trim()
    : clean;

  const normalized = withoutYear.replace(/[.-]\s*$/, '').trim();
  return normalized || null;
}

function pickMileageText(raw) {
  const candidates = [];

  if (raw.mileage) {
    candidates.push(raw.mileage);
  }

  if (Array.isArray(raw.rawLines)) {
    candidates.push(...raw.rawLines);
  }

  if (raw.searchableText) {
    candidates.push(...String(raw.searchableText).split(/\n+/));
  }

  const mileageRegex = /\b(\d{1,3}(?:[,\s]\d{3})*|\d+)(?:\s*([kK]))?\s*(miles?|mi|km|kilometers?)\b/i;

  for (const candidate of candidates) {
    const text = String(candidate || '').trim();
    if (!text) {
      continue;
    }

    const match = text.match(mileageRegex);
    if (!match) {
      continue;
    }

    const amountRaw = match[1].replace(/[,\s]/g, '');
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount)) {
      continue;
    }

    const kilo = Boolean(match[2]);
    const unit = /km|kilometers?/i.test(match[3]) ? 'km' : 'miles';
    const displayAmount = kilo ? `${amount}K` : `${amount}`;

    if (unit === 'km') {
      return `${displayAmount} km`;
    }

    return `${displayAmount} miles`;
  }

  return null;
}

function parseMileageMiles(mileageText) {
  const text = String(mileageText || '').trim();
  if (!text) {
    return null;
  }

  const match = text.match(/(\d{1,3}(?:[,\s]\d{3})*|\d+)(?:\s*([kK]))?\s*(miles?|mi|km|kilometers?)\b/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(/[,\s]/g, ''));
  if (!Number.isFinite(amount)) {
    return null;
  }

  const amountExpanded = match[2] ? amount * 1000 : amount;
  const isKm = /km|kilometers?/i.test(match[3]);

  if (isKm) {
    return Math.round(amountExpanded * 0.621371);
  }

  return Math.round(amountExpanded);
}

function pickPostedText(raw) {
  const lines = Array.isArray(raw.rawLines) ? raw.rawLines : [];

  if (raw.postedText) {
    return String(raw.postedText).trim();
  }

  const listedLine = lines.find((line) => /^listed\s+/i.test(String(line || '').trim()));
  if (listedLine) {
    return String(listedLine).trim();
  }

  return null;
}

function parsePostedAt(postedText, now = new Date()) {
  const text = String(postedText || '').trim();
  if (!text) {
    return null;
  }

  const normalized = text
    .replace(/^listed\s+/i, '')
    .replace(/^posted\s+/i, '')
    .replace(/\sin\s.+$/i, '')
    .replace(/^about\s+/i, '')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  if (/^(just now|moments ago|now)$/i.test(normalized)) {
    return now;
  }

  if (/^yesterday\b/i.test(normalized)) {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const relativeMatch = normalized.match(
    /^(an?|one|\d+)\s+(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks|month|months|year|years)\s+ago$/
  );

  if (relativeMatch) {
    const amountToken = relativeMatch[1];
    const amount = /^\d+$/.test(amountToken) ? Number(amountToken) : 1;
    const unit = relativeMatch[2];

    const unitMsMap = {
      minute: 60 * 1000,
      minutes: 60 * 1000,
      min: 60 * 1000,
      mins: 60 * 1000,
      hour: 60 * 60 * 1000,
      hours: 60 * 60 * 1000,
      hr: 60 * 60 * 1000,
      hrs: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      days: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      weeks: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      months: 30 * 24 * 60 * 60 * 1000,
      year: 365 * 24 * 60 * 60 * 1000,
      years: 365 * 24 * 60 * 60 * 1000,
    };

    const unitMs = unitMsMap[unit];
    if (unitMs) {
      return new Date(now.getTime() - amount * unitMs);
    }
  }

  const absoluteParsed = new Date(normalized);
  if (!Number.isNaN(absoluteParsed.getTime())) {
    return absoluteParsed;
  }

  return null;
}

function pickDescription(raw, title, mileageText, location) {
  if (raw.description) {
    return String(raw.description).trim();
  }

  const rawLines = Array.isArray(raw.rawLines) ? raw.rawLines : [];
  const firstUsefulLine = rawLines.find((line) => {
    const value = String(line || '').trim();
    if (!value || isLikelyPriceText(value) || isMetaOrLocationLine(value)) {
      return false;
    }

    if (value === title || value === mileageText || value === location) {
      return false;
    }

    return value.length > 25;
  });

  return firstUsefulLine ? firstUsefulLine.trim() : null;
}

function normalizeListing(raw) {
  const title = pickTitle(raw);
  const modelYear = parseModelYear(title);
  const vehicleName = parseVehicleNameFromTitle(title, modelYear);
  const titleLocation = extractLocationFromTitle(title);
  const location = raw.location ? raw.location.trim() : titleLocation;
  const mileageText = pickMileageText(raw);
  const mileageMiles = parseMileageMiles(mileageText);
  const postedText = pickPostedText(raw);
  const postedAt = parsePostedAt(postedText);
  const description = pickDescription(raw, title, mileageText, location);

  return {
    title,
    vehicleName,
    modelYear,
    price: parsePrice(raw.price),
    mileageText,
    mileageMiles,
    location: location || null,
    description: description || null,
    postedText: postedText || null,
    postedAt,
    url: normalizeListingUrl(raw.url),
    image: raw.image ? raw.image.trim() : null,
    externalId: raw.externalId ? raw.externalId.trim() : null,
    searchableText: raw.searchableText ? raw.searchableText.trim() : '',
  };
}

module.exports = {
  parsePrice,
  normalizeListingUrl,
  parsePostedAt,
  normalizeListing,
};
