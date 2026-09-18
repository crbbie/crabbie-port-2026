export function mapCommissionService(row, fallback = {}) {
  const details = row.details || {};
  const avail = row.availability === 'waitlist' ? 'inquiry' : (row.availability || fallback.availability || 'open');
  const priceFormatted = details.priceFormatted || (row.currency === 'VND' ? `${Number(row.price).toLocaleString()} VND` : `$${row.price}`);

  return {
    ...fallback,
    id: row.slug || fallback.id,
    slug: row.slug || fallback.slug,
    name: row.title || fallback.name || row.title,
    title: row.title || fallback.title || row.title,
    description: row.description ?? fallback.description ?? '',
    thumbnail: row.thumbnail_path || fallback.thumbnail || '',
    featured: row.featured !== undefined ? !!row.featured : !!fallback.featured,
    published: row.published !== undefined ? !!row.published : (fallback.published ?? true),
    sortOrder: row.sort_order !== undefined ? row.sort_order : (fallback.sortOrder || 0),
    price: priceFormatted || fallback.price || '',
    priceNumeric: row.price !== null ? Number(row.price) : fallback.priceNumeric,
    currency: row.currency || fallback.currency || 'USD',
    availability: avail,
    formType: row.form_slug || details.formType || fallback.formType || 'illustration',
    formLabel: details.formLabel || fallback.formLabel || '',
    priceNote: details.priceNote !== undefined ? details.priceNote : (fallback.priceNote || ''),
    previewLabel: details.previewLabel || fallback.previewLabel || '',
    previewVariant: details.previewVariant !== undefined ? details.previewVariant : (fallback.previewVariant || ''),
    chips: Array.isArray(details.chips) ? details.chips : (fallback.chips || []),
    deliveryEstimate: details.deliveryEstimate || fallback.deliveryEstimate || '',
    includedFiles: details.includedFiles || fallback.includedFiles || '',
    canvas: details.canvas || fallback.canvas || '',
    commercialRule: details.commercialRule || fallback.commercialRule || '',
    extraCharacter: details.extraCharacter || fallback.extraCharacter || '',
    backgroundRule: details.backgroundRule || fallback.backgroundRule || '',
    tax: details.tax || fallback.tax || '5%',
    rush: details.rush || fallback.rush || '+20%',
    privateFee: details.privateFee || fallback.privateFee || '+20%',
    extraNotes: details.extraNotes !== undefined ? details.extraNotes : (fallback.extraNotes || ''),
    alternatePrice: details.alternatePrice || fallback.alternatePrice || '',
    alternateCurrency: details.alternateCurrency || fallback.alternateCurrency || '',
    isOtherService: details.isOtherService !== undefined ? details.isOtherService : (fallback.isOtherService ?? true),
    ...details,
    id: row.slug || fallback.id,
    name: row.title || fallback.name,
    title: row.title || fallback.title,
    availability: avail
  };
}

export function mapCommissionForm(row, fallback = {}) {
  return {
    ...fallback,
    id: row.slug || fallback.id,
    slug: row.slug || fallback.slug,
    title: row.title || fallback.title,
    description: row.description ?? fallback.description ?? '',
    fields: Array.isArray(row.fields) ? row.fields : (fallback.fields || []),
    published: row.published !== undefined ? row.published : (fallback.published ?? true)
  };
}
