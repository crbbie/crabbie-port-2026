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
    tags: Array.isArray(meta.tags) ? meta.tags : []
  };
}