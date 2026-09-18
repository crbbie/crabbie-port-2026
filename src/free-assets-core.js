export function mapFreeAsset(row, fallback = {}) {
  const meta = row.metadata || {};
  const cat = meta.cat || fallback.cat || '';
  const format = row.file_type || meta.format || fallback.format || '';
  return {
    ...fallback,
    slug: row.slug || fallback.slug || '',
    title: row.title || fallback.title || row.slug || '',
    description: row.description ?? fallback.description ?? '',
    thumbnail: row.thumbnail_path || fallback.thumbnail || '',
    featured: row.featured !== undefined ? !!row.featured : !!fallback.featured,
    published: row.published !== undefined ? !!row.published : (fallback.published ?? true),
    sortOrder: row.sort_order !== undefined ? row.sort_order : (fallback.sortOrder || 0),
    cat: cat,
    format: format,
    icon: meta.icon || fallback.icon || '★',
    version: meta.version || fallback.version || '[VERSION]',
    date: meta.date || fallback.date || '[DATE]',
    credit: meta.credit || fallback.credit || '[CREDIT REQUIREMENT]',
    license: meta.license || fallback.license || '[LICENSE CONTENT FROM CMS]',
    update: meta.update || fallback.update || '[UPDATE NOTE]',
    availability: row.availability || fallback.availability || 'available',
    downloadUrl: row.file_path || meta.downloadUrl || fallback.downloadUrl || '',
    flowerTag: meta.flowerTag !== undefined ? meta.flowerTag : (fallback.flowerTag || null),
    filterCat: meta.filterCat || fallback.filterCat || '',
    tags: Array.isArray(meta.tags) && meta.tags.length ? meta.tags : (fallback.tags || (cat ? [cat] : [])),
    ...meta,
    title: row.title || fallback.title || row.slug || '',
    description: row.description ?? fallback.description ?? '',
    availability: row.availability || fallback.availability || 'available',
    downloadUrl: row.file_path || meta.downloadUrl || fallback.downloadUrl || '',
    format: format,
    cat: cat
  };
}
