export function mapPortfolioProject(row, fallback = {}) {
  if (!row) return { ...fallback };
  const content = row.content || {};
  const description = row.description ?? '';
  return {
    ...content,
    slug: row.slug ?? '',
    title: row.title ?? '',
    /* Canonical caption: `description` is the database identity, `desc` the
       legacy public alias. Both are exposed so readers never mismatch. */
    desc: description,
    description,
    cat: content.cat ?? '',
    cardMode: content.cardMode === 'image' ? 'image' : 'project',
    tags: Array.isArray(row.tags) ? row.tags : [],
    cover: row.cover_path ?? '',
    thumbnail: row.thumbnail_path ?? '',
    featured: !!row.featured,
    published: !!row.published,
    blocks: Array.isArray(content.blocks) ? content.blocks : [],
    credits: content.credits ?? '',
    peopleCreditLabel: typeof content.peopleCreditLabel === 'string' ? content.peopleCreditLabel : '',
    peopleIds: [],
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

/* Authoritative membership/order helpers for collection DOM reconcile. */
export function liveSlugSet(records) {
  const set = {};
  (Array.isArray(records) ? records : []).forEach((record) => {
    const slug = record && (record.slug || record.id);
    if (slug) set[slug] = true;
  });
  return set;
}

export function portfolioCaption(record) {
  if (!record || typeof record !== 'object') return '';
  const text = record.desc ?? record.description ?? '';
  return typeof text === 'string' ? text.trim() : String(text).trim();
}