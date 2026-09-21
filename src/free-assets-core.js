export function mapFreeAsset(row, fallback = {}) {
  if (!row) return { ...fallback };
  const meta = row.metadata || {};
  return {
    slug: row.slug ?? '',
    title: row.title ?? '',
    description: row.description ?? '',
    thumbnail: row.thumbnail_path ?? '',
    featured: !!row.featured,
    published: !!row.published,
    sortOrder: row.sort_order ?? 0,
    cat: meta.cat ?? '',
    format: row.file_type ?? '',
    icon: meta.icon ?? '★',
    version: meta.version ?? '',
    date: meta.date ?? '',
    credit: meta.credit ?? '',
    license: meta.license ?? '',
    update: meta.update ?? '',
    availability: row.availability ?? '',
    downloadUrl: row.file_path ?? '',
    driveUrl: meta.driveUrl ?? '',
    showDirectDownload: meta.showDirectDownload !== false,
    showDriveDownload: !!meta.showDriveDownload,
    flowerTag: meta.flowerTag ?? null,
    filterCat: meta.filterCat ?? '',
    category: meta.categorySlug || meta.cat || '',
    tags: Array.isArray(meta.tags) ? meta.tags : []
  };
}

/* Canonical asset taxonomy: the CMS category wins; the legacy filterCat is
 * only a last-resort fallback and never overrides the canonical value. */
export function assetCategorySlug(record) {
  if (!record || typeof record !== 'object') return 'other';
  const canonical = record.category || record.cat || record.categorySlug || '';
  const text = String(canonical).trim().toLowerCase();
  if (text) return text;
  const legacy = String(record.filterCat || '').trim().toLowerCase();
  return legacy || 'other';
}

export function assetFilterChips(records) {
  const seen = {};
  (Array.isArray(records) ? records : []).forEach((record) => {
    const slug = assetCategorySlug(record);
    if (slug && !seen[slug]) seen[slug] = true;
  });
  return Object.keys(seen).sort();
}