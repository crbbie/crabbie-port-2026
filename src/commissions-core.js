export function mapCommissionService(row, fallback = {}) {
  if (!row) return { ...fallback };
  const details = row.details || {};
  const availability = row.availability === 'waitlist' ? 'inquiry' : (row.availability ?? '');
  // The canonical price column is authoritative: a persisted formatted string
  // only survives as a fallback for legacy rows without a canonical price.
  const hasCanonicalPrice = row.price != null && String(row.price).trim() !== '';
  const price = hasCanonicalPrice
    ? (row.currency === 'VND' ? `${Number(row.price).toLocaleString()} VND` : `$${row.price}`)
    : (details.priceFormatted || '');
  return {
    id: row.slug ?? '',
    slug: row.slug ?? '',
    name: row.title ?? '',
    title: row.title ?? '',
    description: row.description ?? '',
    thumbnail: row.thumbnail_path ?? '',
    featured: !!row.featured,
    published: !!row.published,
    sortOrder: row.sort_order ?? 0,
    price,
    priceNumeric: row.price == null ? null : Number(row.price),
    currency: row.currency ?? '',
    availability,
    formType: row.form_slug ?? '',
    formLabel: details.formLabel ?? '',
    priceNote: details.priceNote ?? '',
    previewLabel: details.previewLabel ?? '',
    previewVariant: details.previewVariant ?? '',
    chips: Array.isArray(details.chips) ? details.chips : [],
    deliveryEstimate: details.deliveryEstimate ?? '',
    includedFiles: details.includedFiles ?? '',
    canvas: details.canvas ?? '',
    commercialRule: details.commercialRule ?? '',
    extraCharacter: details.extraCharacter ?? '',
    backgroundRule: details.backgroundRule ?? '',
    tax: details.tax ?? '',
    rush: details.rush ?? '',
    privateFee: details.privateFee ?? '',
    extraNotes: details.extraNotes ?? '',
    alternatePrice: details.alternatePrice ?? '',
    alternateCurrency: details.alternateCurrency ?? '',
    isOtherService: details.isOtherService ?? true
  };
}

export function mapCommissionForm(row, fallback = {}) {
  if (!row) return { ...fallback };
  return {
    id: row.slug ?? '',
    slug: row.slug ?? '',
    title: row.title ?? '',
    description: row.description ?? '',
    fields: Array.isArray(row.fields) ? row.fields : [],
    published: !!row.published
  };
}