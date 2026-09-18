export function mapCmsPage(row, fallback = {}) {
  const data = row.data || {};
  return {
    ...fallback,
    slug: row.slug || fallback.slug,
    title: row.title || fallback.title || row.slug,
    content: row.content ?? fallback.content ?? '',
    published: row.published !== undefined ? row.published : (fallback.published ?? true),
    ...data,
    data: data,
    title: row.title || fallback.title || row.slug,
    content: row.content ?? fallback.content ?? ''
  };
}

export function mapNavigationItem(row, fallback = {}) {
  return {
    ...fallback,
    id: row.id || fallback.id,
    title: row.title || fallback.title || '',
    url: row.url || fallback.url || '',
    published: row.published !== undefined ? row.published : (fallback.published ?? true),
    sort_order: row.sort_order !== undefined ? row.sort_order : (fallback.sort_order ?? 0)
  };
}

export function mapSiteSettings(rows, fallback = {}) {
  const settings = { ...fallback };
  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      if (row.key) settings[row.key] = row.value || {};
    });
  }
  return settings;
}
