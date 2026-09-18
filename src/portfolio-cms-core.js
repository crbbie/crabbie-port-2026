export function mapPortfolioProject(row, fallback = {}) {
  const content = row.content || {};
  return { ...fallback, slug: row.slug || fallback.slug || '', title: row.title || fallback.title || row.slug, desc: row.description ?? fallback.desc ?? '', cat: content.cat || fallback.cat || '', tags: Array.isArray(row.tags) ? row.tags : (fallback.tags || []), cover: row.cover_path || fallback.cover || '', thumbnail: row.thumbnail_path || fallback.thumbnail || '', ...content };
}
