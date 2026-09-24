import { formatMediaItem } from './admin-media-core.js';
import { formatRequestRowForAdmin } from './commission-requests-core.js';
import { formattedCommissionPrice } from './admin-roundtrip-core.js';
import { normalizeAssetGallery, normalizeCoverAlt } from './asset-gallery-core.js';

const LOAD_LABELS = {
  portfolio: 'Portfolio load failed', assets: 'Free Assets load failed', categories: 'Categories load failed',
  commissions: 'Commission Services load failed', forms: 'Commission Forms load failed', pages: 'CMS Pages load failed',
  navigation: 'Navigation load failed', settings: 'Site Settings load failed', requests: 'Commission Requests load failed', media: 'Media load failed',
  people: 'People load failed', projectPeople: 'Project credits load failed'
};

export function assertAdminHydrationResults(results) {
  for (const [key, response] of Object.entries(results)) {
    if (response?.error) throw new Error(`${LOAD_LABELS[key] || key}: ${response.error.message}`);
  }
}

export function mapAdminCollection(data, mapper) {
  return Array.isArray(data) ? data.map(mapper) : [];
}

// Prompt 2: every hydrated record keeps its DB uuid and the updated_at value it
// was loaded with, so later saves can UPDATE by uuid and detect stale writes
// without inventing an identity or a baseline that the database never returned.
export function recordIdentityFromRow(row) {
  return {
    dbId: row && typeof row.id === 'string' && row.id ? row.id : null,
    originalUpdatedAt: row && typeof row.updated_at === 'string' && row.updated_at ? row.updated_at : null
  };
}

function withRecordIdentity(data, mapper) {
  return mapAdminCollection(data, (row, index, rows) => ({
    ...mapper(row, index, rows),
    ...recordIdentityFromRow(row)
  }));
}

function mapPortfolioRow(row) {
  const content = row.content || {};
  return {
    id: row.slug,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    category: content.categorySlug || (row.category && row.category.slug) || content.cat || 'illustration',
    cardMode: content.cardMode === 'image' ? 'image' : 'project',
    tags: Array.isArray(row.tags) ? row.tags : [],
    thumbnail: row.thumbnail_path || '',
    cover: row.cover_path || '',
    featured: !!row.featured,
    published: !!row.published,
    placeholder: !!content.placeholder,
    viState: 'pending',
    externalLinks: content.externalLinks || [],
    blocks: content.blocks || [],
    credits: content.credits || '',
    peopleCreditLabel: typeof content.peopleCreditLabel === 'string' ? content.peopleCreditLabel : '',
    peopleIds: [],
    year: content.year || '',
    intro: content.intro || '',
    sketch: content.sketch || '',
    process: content.process || '',
    body: content.body || '',
    quote: content.quote || '',
    link: content.link || '',
    linkLabel: content.linkLabel || '',
    titleCopy: { en: row.title, vi: '', viOverride: false },
    descriptionCopy: { en: row.description || '', vi: '', viOverride: false }
  };
}

function mapAssetRow(row) {
  const m = row.metadata || {};
  return {
    id: row.slug,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    category: m.categorySlug || (row.category && row.category.slug) || (m.cat || 'other').toLowerCase(),
    tags: Array.isArray(m.tags) ? m.tags : [],
    assetType: (m.cat || 'other').toLowerCase(),
    icon: m.icon || '★',
    flowerTag: m.flowerTag || null,
    filterCat: m.filterCat || '',
    thumbnail: row.thumbnail_path || '',
    media: row.file_path || '',
    mediaType: 'image',
    downloadUrl: row.file_path || m.downloadUrl || '',
    driveUrl: m.driveUrl || '',
    showDirectDownload: m.showDirectDownload !== false,
    showDriveDownload: !!m.showDriveDownload,
    /* Ordered additional previews (metadata.gallery); absent legacy metadata
       resolves to [] and the cover is never injected here. */
    gallery: normalizeAssetGallery(m.gallery),
    coverAlt: normalizeCoverAlt(m.coverAlt, row.title),
    fileFormat: row.file_type || m.format || 'PNG',
    license: m.license || '[LICENSE CONTENT FROM CMS]',
    credit: m.credit || '[CREDIT REQUIREMENT]',
    version: m.version || '[VERSION]',
    updateNote: m.update || '[UPDATE NOTE]',
    dateAdded: m.date || '[DATE]',
    featured: !!row.featured,
    published: !!row.published,
    /* Absent legacy metadata resolves to false: new drafts and portfolio
       rows already default placeholder off, so hydration must not invent it. */
    placeholder: !!m.placeholder,
    availability: row.availability || 'available',
    titleCopy: { en: row.title, vi: '', viOverride: false },
    descriptionCopy: { en: row.description || '', vi: '', viOverride: false }
  };
}

function mapCategoryRow(row) {
  return {
    id: row.slug,
    dbId: row.id,
    originalUpdatedAt: typeof row.updated_at === 'string' && row.updated_at ? row.updated_at : null,
    slug: row.slug,
    title: row.title,
    published: !!row.published,
    sortOrder: row.sort_order || 0,
    titleCopy: { en: row.title, vi: '', viOverride: false }
  };
}

function mapCommissionRow(row) {
  const d = row.details || {};
  const avail = row.availability === 'waitlist' ? 'inquiry' : row.availability;
  return {
    id: row.slug,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    price: row.price == null ? '' : String(row.price),
    currency: row.currency || 'USD',
    availability: avail,
    form: row.form_slug || d.formType || 'illustration',
    featured: !!row.featured,
    published: !!row.published,
    formLabel: d.formLabel || '',
    priceFormatted: formattedCommissionPrice({ price: row.price, currency: row.currency || 'USD' }),
    priceNote: d.priceNote || '',
    previewLabel: d.previewLabel || '',
    previewVariant: d.previewVariant || '',
    chips: Array.isArray(d.chips) ? d.chips : [],
    commercialRule: d.commercialRule || '',
    extraCharacterFee: d.extraCharacter || '',
    backgroundFee: d.backgroundRule || '',
    rushFee: d.rush ?? '+20%',
    privateFee: d.privateFee ?? '+20%',
    tax: d.tax ?? '5%',
    delivery: d.deliveryEstimate || '',
    includedFiles: d.includedFiles || '',
    canvas: d.canvas || '',
    extraNotes: d.extraNotes || '',
    alternatePrice: d.alternatePrice || '',
    alternateCurrency: d.alternateCurrency || '',
    isOtherService: d.isOtherService !== undefined ? d.isOtherService : true,
    addons: [],
    customFields: [],
    thumbnail: row.thumbnail_path || '',
    titleCopy: { en: row.title, vi: '', viOverride: false },
    descriptionCopy: { en: row.description || '', vi: '', viOverride: false }
  };
}

function mapFormRow(row) {
  return {
    id: row.slug,
    slug: row.slug,
    title: row.title,
    description: row.description || '',
    published: !!row.published,
    fields: Array.isArray(row.fields) ? row.fields : [],
    titleCopy: { en: row.title, vi: '', viOverride: false },
    descriptionCopy: { en: row.description || '', vi: '', viOverride: false }
  };
}

function mapNavigationRow(row) {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    published: !!row.published
  };
}

export function mapPersonRow(row) {
  if (!row) return null;
  const kinds = ['client', 'collaborator', 'artist', 'studio', 'creator', 'other'];
  const kind = kinds.includes(String(row.kind || '').toLowerCase()) ? String(row.kind).toLowerCase() : 'other';
  return {
    id: row.id,
    displayName: String(row.display_name ?? '').trim(),
    avatar: row.avatar_path || '',
    avatarAlt: row.avatar_alt || '',
    profileUrl: typeof row.profile_url === 'string' ? row.profile_url : '',
    kind,
    published: !!row.published,
    showInThankYou: !!row.show_in_thank_you,
    sortOrder: Number(row.sort_order) || 0
  };
}

export function attachProjectPeople(projects, links) {
  const list = Array.isArray(projects) ? projects : [];
  const grouped = {};
  (Array.isArray(links) ? links : []).forEach((link) => {
    const dbId = String(link.project_id || '');
    const personId = String(link.person_id || '');
    if (!dbId || !personId) return;
    if (!grouped[dbId]) grouped[dbId] = [];
    grouped[dbId].push({ id: personId, order: Number(link.sort_order) || 0 });
  });
  Object.keys(grouped).forEach((dbId) => {
    grouped[dbId].sort((a, b) => a.order - b.order);
    grouped[dbId] = grouped[dbId].map((entry) => entry.id);
  });
  list.forEach((project) => {
    if (project && project.dbId && grouped[project.dbId]) project.peopleIds = grouped[project.dbId].slice();
    else if (project && !project.peopleIds) project.peopleIds = [];
  });
  return list;
}

// A successful empty page result is authoritative: a missing page record must
// never fall back to prototype content.
export function mapAdminPages(data) {
  const pages = {};
  mapAdminCollection(data, (row) => {
    const d = row.data || {};
    if (row.slug === 'about') {
      pages.about = {
        ...recordIdentityFromRow(row),
        title: row.title,
        content: row.content,
        published: !!row.published,
        profileImage: d.profileImage || '',
        name: d.name || 'Crabbie',
        bio: d.bio || '',
        experience: d.experience || [],
        skills: d.skills || [],
        values: Array.isArray(d.values) ? d.values : null,
        links: d.links || [],
        titleCopy: { en: row.title, vi: '', viOverride: false },
        contentCopy: { en: row.content, vi: '', viOverride: false }
      };
    } else if (row.slug === 'terms') {
      pages.terms = {
        ...recordIdentityFromRow(row),
        title: row.title,
        content: row.content,
        published: !!row.published,
        titleCopy: { en: row.title, vi: '', viOverride: false },
        contentCopy: { en: row.content, vi: '', viOverride: false }
      };
    }
    return row;
  });
  return pages;
}

// A successful empty settings result is authoritative: prototype settings must
// never survive a live hydration.
export function mapAdminSettings(data) {
  const settings = {};
  mapAdminCollection(data, (row) => {
    settings[row.key] = row.value || {};
    return row;
  });
  return settings;
}

/** Per-key settings baselines, kept beside the value payload so the stored
 *  jsonb value never has to carry bookkeeping fields. */
export function mapSettingsMeta(data) {
  const meta = {};
  mapAdminCollection(data, (row) => {
    meta[row.key] = { originalUpdatedAt: typeof row.updated_at === 'string' && row.updated_at ? row.updated_at : null };
    return row;
  });
  return meta;
}

/**
 * Builds one complete admin snapshot from the raw Supabase query responses.
 * Throws for any failed query and never merges partial results, so callers can
 * replace ADMIN_DATA / ADMIN_DRAFT atomically.
 */
export function mapAdminHydrationResults(results, getPublicUrl) {
  assertAdminHydrationResults(results);

  const categoryRows = Array.isArray(results?.categories?.data) ? results.categories.data : [];
  const urlFor = typeof getPublicUrl === 'function' ? getPublicUrl : () => '';
  const portfolio = withRecordIdentity(results?.portfolio?.data, mapPortfolioRow);
  attachProjectPeople(portfolio, results?.projectPeople?.data);

  return {
    portfolio,
    assets: withRecordIdentity(results?.assets?.data, mapAssetRow),
    portfolioCategories: categoryRows.filter((row) => row.kind === 'portfolio').map(mapCategoryRow),
    assetCategories: categoryRows.filter((row) => row.kind === 'asset').map(mapCategoryRow),
    commissions: withRecordIdentity(results?.commissions?.data, mapCommissionRow),
    forms: withRecordIdentity(results?.forms?.data, mapFormRow),
    pages: mapAdminPages(results?.pages?.data),
    navigation: withRecordIdentity(results?.navigation?.data, mapNavigationRow),
    people: withRecordIdentity(results?.people?.data, mapPersonRow),
    settings: mapAdminSettings(results?.settings?.data),
    settingsMeta: mapSettingsMeta(results?.settings?.data),
    requests: withRecordIdentity(results?.requests?.data, (row) => formatRequestRowForAdmin(row)),
    media: mapAdminCollection(results?.media?.data, (row) => formatMediaItem(row, urlFor))
  };
}

