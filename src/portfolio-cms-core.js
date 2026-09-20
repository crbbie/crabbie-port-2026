export function mapPortfolioProject(row, fallback = {}) {
  if (!row) return { ...fallback };
  const content = row.content || {};
  return {
    ...content,
    slug: row.slug ?? '',
    title: row.title ?? '',
    desc: row.description ?? '',
    cat: content.cat ?? '',
    cardMode: content.cardMode === 'image' ? 'image' : 'project',
    tags: Array.isArray(row.tags) ? row.tags : [],
    cover: row.cover_path ?? '',
    thumbnail: row.thumbnail_path ?? '',
    featured: !!row.featured,
    published: !!row.published,
    blocks: Array.isArray(content.blocks) ? content.blocks : [],
    credits: content.credits ?? '',
    year: content.year ?? '',
    intro: content.intro ?? '',
    sketch: content.sketch ?? '',
    process: content.process ?? '',
    body: content.body ?? '',
    quote: content.quote ?? '',
    link: content.link ?? '',
    linkLabel: content.linkLabel ?? '',
    externalLinks: Array.isArray(content.externalLinks) ? content.externalLinks : []
  };
}