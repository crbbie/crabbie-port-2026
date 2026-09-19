export function mapCmsPage(row, fallback = {}) {
  if (!row) return { ...fallback };
  const data = row.data || {};
  return {
    ...data,
    slug: row.slug ?? '',
    title: row.title ?? '',
    content: row.content ?? '',
    published: !!row.published,
    data
  };
}

export function mapNavigationItem(row, fallback = {}) {
  if (!row) return { ...fallback };
  return {
    id: row.id ?? '',
    title: row.title ?? '',
    url: row.url ?? '',
    published: !!row.published,
    sort_order: row.sort_order ?? 0
  };
}

export function mapSiteSettings(rows, fallback = {}) {
  const settings = { ...fallback };
  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      if (row.key) settings[row.key] = row.value ?? {};
    });
  }
  return settings;
}