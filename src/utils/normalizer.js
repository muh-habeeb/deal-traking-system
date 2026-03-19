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

function normalizeListing(raw) {
  return {
    title: pickTitle(raw),
    price: parsePrice(raw.price),
    location: raw.location ? raw.location.trim() : null,
    url: raw.url ? raw.url.trim() : null,
    image: raw.image ? raw.image.trim() : null,
    externalId: raw.externalId ? raw.externalId.trim() : null,
    searchableText: raw.searchableText ? raw.searchableText.trim() : '',
  };
}

module.exports = {
  parsePrice,
  normalizeListing,
};
