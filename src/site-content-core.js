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

/* Batch 4: a key that exists with an intentionally empty value is different
 * from a key that was never stored. Clearing a setting must clear public. */
export function hasSettingsKey(group, key) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) return false;
  return Object.prototype.hasOwnProperty.call(group, key);
}

export function settingsText(group, key) {
  if (!hasSettingsKey(group, key)) return null;
  const value = group[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function cmsBrandName(settings) {
  const title = settings && settings.branding ? settingsText(settings.branding, 'title') : null;
  return title || 'CRABBIE';
}

export function cmsSeoTitle(settings) {
  const title = settings && settings.seo ? settingsText(settings.seo, 'title') : null;
  return title || '';
}

/* Route titles use the CMS SEO/branding baseline: navigation never resets the
 * title to a hard-coded brand string. */
export function routeTitleFor(view, id, options = {}) {
  const brand = options.brand || 'CRABBIE';
  const seoTitle = options.seoTitle || '';
  const projects = options.projects || {};
  const assets = options.assets || {};
  const adminLabel = options.adminLabel || null;
  switch (view) {
    case 'home': return seoTitle || (brand + ' — Art made with candy, petals & the sparkliest of hearts');
    case 'portfolio': return 'Portfolio — ' + brand;
    case 'project-detail': return ((projects[id] && projects[id].title) || 'Project') + ' — ' + brand;
    case 'free-assets': return 'Free Assets — ' + brand;
    case 'free-asset-detail': return ((assets[id] && assets[id].title) || 'Asset') + ' — ' + brand;
    case 'commissions': return 'Commissions — ' + brand;
    case 'about': return 'About — ' + brand;
    case 'terms': return 'Terms of Service — ' + brand;
    case 'contact': return 'Contact — ' + brand;
    case '404': return 'Page Not Found — ' + brand;
    case 'loading': return 'Loading… — ' + brand;
    case 'admin': return 'Admin · ' + (adminLabel || 'Dashboard') + ' — ' + brand;
    default: return seoTitle || brand;
  }
}

/* About field roles: title names the page, bio is the hero paragraph,
 * content is the longer page body. Bio must never swallow content.
 * A custom Title (beyond the generic "About") drives the heading so the
 * editor field is never silently overridden by Name; otherwise Name
 * personalizes the greeting. Mirrors public-roundtrip-core.js. */
export function aboutPublicModel(page = {}) {
  const name = typeof page.name === 'string' ? page.name.trim() : '';
  const title = typeof page.title === 'string' ? page.title.trim() : '';
  const bio = typeof page.bio === 'string' ? page.bio.trim() : '';
  const content = typeof page.content === 'string' ? page.content.trim() : '';
  const customTitle = title && title.toLowerCase() !== 'about' ? title : '';
  return {
    heading: customTitle || (name ? ("Hello, I'm " + name + '.') : (title || 'About')),
    headingName: name,
    bio,
    content
  };
}