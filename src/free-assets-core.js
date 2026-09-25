import { normalizeAssetGallery, normalizeCoverAlt } from './asset-gallery-core.js';

export function mapFreeAsset(row, fallback = {}) {
  if (!row) return { ...fallback, gallery: [], coverAlt: '' };
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
    tags: Array.isArray(meta.tags) ? meta.tags : [],
    /* Ordered additional previews live in metadata.gallery; the cover
       (thumbnail_path) is never auto-duplicated into this list. */
    gallery: normalizeAssetGallery(meta.gallery),
    coverAlt: normalizeCoverAlt(meta.coverAlt, row.title)
  };
}

export function normalizeAssetCategory(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/* Canonical asset taxonomy: the CMS category wins; the legacy filterCat is
 * only a last-resort fallback and never overrides the canonical value. */
export function assetCategorySlug(record) {
  if (!record || typeof record !== 'object') return 'other';
  const canonical = record.category || record.cat || record.categorySlug || '';
  const text = normalizeAssetCategory(canonical);
  if (text) return text;
  const legacy = normalizeAssetCategory(record.filterCat || '');
  return legacy || 'other';
}

export function matchesAssetCategory(cardCategory, selectedCategory) {
  const selected = normalizeAssetCategory(selectedCategory);
  if (!selected || selected === 'all') return true;
  const card = normalizeAssetCategory(cardCategory);
  return card === selected;
}

export function resolveAssetCategoryFilter(currentCategory, availableCategories) {
  const current = normalizeAssetCategory(currentCategory);
  if (!current || current === 'all') return 'all';
  const available = Array.isArray(availableCategories) ? availableCategories : [];
  const match = available.find((cat) => normalizeAssetCategory(cat) === current);
  return match || 'all';
}

export function assetFilterChips(records) {
  const seen = {};
  (Array.isArray(records) ? records : []).forEach((record) => {
    const slug = assetCategorySlug(record);
    if (slug && !seen[slug]) seen[slug] = true;
  });
  return Object.keys(seen).sort();
}