import { formattedCommissionPrice, parseCommissionPrice, formatPriceWithCurrency } from './admin-roundtrip-core.js';
import { serializeAssetGallery, normalizeCoverAlt } from './asset-gallery-core.js';
export function formatPortfolioRow(rec, sort_order = 0) {
  /* One canonical project image: cover is the source of truth and the card
     thumbnail auto-syncs from it. Legacy thumbnail-only rows fall back so
     nothing already published goes blank. */
  const sourceImage = rec.cover || rec.thumbnail || '';
  const content = {
    cat: rec.category || '',
    cardMode: rec.cardMode === 'image' ? 'image' : 'project',
    blocks: rec.blocks || [],
    externalLinks: rec.externalLinks || [],
    placeholder: !!rec.placeholder,
    credits: rec.credits || '',
    peopleCreditLabel: typeof rec.peopleCreditLabel === 'string' ? rec.peopleCreditLabel : '',
    year: rec.year || '',
    intro: rec.intro || '',
    sketch: rec.sketch || '',
    process: rec.process || '',
    body: rec.body || '',
    quote: rec.quote || '',
    link: rec.link || '',
    linkLabel: rec.linkLabel || ''
  };
  return {
    slug: rec.slug || rec.id,
    title: rec.title || 'Untitled Project',
    description: rec.description || '',
    tags: Array.isArray(rec.tags) ? rec.tags : [],
    thumbnail_path: sourceImage || null,
    cover_path: sourceImage || null,
    featured: !!rec.featured,
    published: !!rec.published,
    sort_order,
    content
  };
}

export function formatAssetRow(rec, sort_order = 0) {
  const metadata = {
    cat: rec.category || rec.cat || '',
    format: rec.fileFormat || rec.format || 'PNG',
    icon: rec.icon || '★',
    version: rec.version || '[VERSION]',
    date: rec.dateAdded || rec.date || '[DATE]',
    credit: rec.credit || '[CREDIT REQUIREMENT]',
    license: rec.license || '[LICENSE CONTENT FROM CMS]',
    update: rec.updateNote || rec.update || '[UPDATE NOTE]',
    downloadUrl: rec.downloadUrl || '',
    driveUrl: rec.driveUrl || '',
    showDirectDownload: rec.showDirectDownload !== false,
    showDriveDownload: !!rec.showDriveDownload,
    placeholder: !!rec.placeholder,
    tags: Array.isArray(rec.tags) ? rec.tags : [],
    flowerTag: rec.flowerTag || null,
    filterCat: rec.filterCat || '',
    /* Ordered additional previews persist verbatim (array order, stable ids);
       the cover is never auto-duplicated into this list. */
    gallery: serializeAssetGallery(rec.gallery),
    coverAlt: normalizeCoverAlt(rec.coverAlt, rec.title)
  };
  return {
    slug: rec.slug || rec.id,
    title: rec.title || 'Untitled Asset',
    description: rec.description || '',
    file_type: rec.fileFormat || rec.format || 'PNG',
    file_path: rec.downloadUrl ?? rec.media ?? '',
    thumbnail_path: rec.thumbnail || null,
    availability: rec.availability === 'available' ? 'available' : 'unavailable',
    featured: !!rec.featured,
    published: !!rec.published,
    sort_order,
    metadata
  };
}

export function commissionPriceMeta(rec) {
  const currency = String((rec && rec.currency) || 'USD').trim().toUpperCase() || 'USD';
  const parsed = parseCommissionPrice(rec ? rec.price : null, currency);
  return { value: parsed.value, ambiguous: parsed.ambiguous === true, blank: parsed.blank === true };
}

export function formatCommissionRow(rec, sort_order = 0) {
  const currency = String(rec.currency || 'USD').trim().toUpperCase() || 'USD';
  const parsed = parseCommissionPrice(rec.price, currency);
  const numPrice = parsed.value;
  const alternateParsed = parseCommissionPrice(rec.alternatePrice, rec.alternateCurrency || currency);
  const alternateValue = alternateParsed.value === null ? '' : String(alternateParsed.value);
  const alternateCurrency = String(rec.alternateCurrency || '').trim().toUpperCase();
  const avail = rec.availability === 'inquiry' ? 'waitlist' : (rec.availability === 'closed' ? 'closed' : 'open');
  const details = {
    formType: rec.form || rec.formType || 'illustration',
    formLabel: rec.formLabel || '',
    priceFormatted: formattedCommissionPrice({ price: rec.price, currency }),
    priceNote: rec.priceNote || '',
    previewLabel: rec.previewLabel || '',
    previewVariant: rec.previewVariant || '',
    chips: Array.isArray(rec.chips) ? rec.chips : [],
    deliveryEstimate: rec.delivery ?? rec.deliveryEstimate ?? '',
    includedFiles: rec.includedFiles ?? '',
    canvas: rec.canvas ?? '',
    commercialRule: rec.commercialRule ?? '',
    extraCharacter: rec.extraCharacterFee ?? rec.extraCharacter ?? '',
    backgroundRule: rec.backgroundFee ?? rec.backgroundRule ?? '',
    tax: rec.tax ?? '5%',
    rush: rec.rushFee ?? rec.rush ?? '+20%',
    privateFee: rec.privateFee ?? '+20%',
    extraNotes: rec.extraNotes || '',
    alternatePrice: alternateValue,
    alternatePriceFormatted: alternateValue ? formatPriceWithCurrency(alternateValue, alternateCurrency || currency) : '',
    alternateCurrency,
    isOtherService: rec.isOtherService !== undefined ? rec.isOtherService : true
  };
  return {
    slug: rec.slug || rec.id,
    title: rec.title || rec.name || 'Untitled Service',
    description: rec.description || '',
    price: numPrice,
    currency,
    availability: avail,
    form_slug: rec.form || rec.formType || 'illustration',
    thumbnail_path: rec.thumbnail || null,
    featured: !!rec.featured,
    published: !!rec.published,
    sort_order,
    details
  };
}

export function formatNavigationRow(rec, sort_order = 0) {
  return {
    title: rec.title || 'Untitled',
    url: rec.url || '#',
    published: !!rec.published,
    sort_order
  };
}

export function formatPageRow(slug, pageData) {
  if (slug === 'about') {
    return {
      slug: 'about',
      title: pageData.title || 'About',
      content: pageData.content || '',
      published: !!pageData.published,
      data: {
        profileImage: pageData.profileImage || '',
        name: pageData.name || 'Crabbie',
        bio: pageData.bio || '',
        experience: pageData.experience || [],
        skills: pageData.skills || [],
        values: pageData.values || [],
        links: pageData.links || []
      }
    };
  }
  return {
    slug: 'terms',
    title: pageData.title || 'Terms of Service',
    content: pageData.content || '',
    published: !!pageData.published,
    data: pageData.data || {}
  };
}

export function formatPersonRow(rec, sort_order = 0) {
  const name = String(rec.displayName ?? rec.display_name ?? rec.title ?? '').trim();
  if (!name) throw new Error('Enter a display name before saving this person.');
  const rawUrl = rec.profileUrl ?? rec.profile_url ?? '';
  const url = String(rawUrl || '').trim();
  if (url) {
    const ok = /^https:\/\/[^\/\s@]+(\.[^\/\s@]+)+[^\s]*$/i.test(url)
      && !/^(https:\/\/[^\/]*@)/i.test(url)
      && !/\s/.test(url);
    if (!ok) throw new Error('Profile URL must be a valid https:// link, or left blank.');
  }
  const kinds = ['client', 'collaborator', 'artist', 'studio', 'creator', 'other'];
  const kind = kinds.includes(String(rec.kind || '').toLowerCase()) ? String(rec.kind).toLowerCase() : 'other';
  const avatar = rec.avatar ?? rec.avatar_path ?? '';
  if (rec.published && rec.showInThankYou && !String(avatar || '').trim()) {
    throw new Error('An avatar is required to show this person in the thank-you section.');
  }
  return {
    display_name: name.slice(0, 120),
    avatar_path: String(avatar || '').trim() ? String(avatar).trim() : null,
    avatar_alt: String(rec.avatarAlt ?? rec.avatar_alt ?? '').slice(0, 240),
    profile_url: url ? url : null,
    kind,
    published: !!rec.published,
    show_in_thank_you: !!rec.showInThankYou,
    sort_order
  };
}

export function formatSettingRow(key, value) {
  return {
    key,
    value: value || {}
  };
}
