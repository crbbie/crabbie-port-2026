import { formattedCommissionPrice } from './admin-roundtrip-core.js';
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
    filterCat: rec.filterCat || ''
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

export function formatCommissionRow(rec, sort_order = 0) {
  const numPrice = parseFloat(String(rec.price).replace(/[^0-9.]/g, ''));
  const avail = rec.availability === 'inquiry' ? 'waitlist' : (rec.availability === 'closed' ? 'closed' : 'open');
  const details = {
    formType: rec.form || rec.formType || 'illustration',
    formLabel: rec.formLabel || '',
    priceFormatted: formattedCommissionPrice({ price: rec.price, currency: rec.currency }),
    priceNote: rec.priceNote || '',
    previewLabel: rec.previewLabel || '',
    previewVariant: rec.previewVariant || '',
    chips: Array.isArray(rec.chips) ? rec.chips : [],
    deliveryEstimate: rec.delivery || rec.deliveryEstimate || '',
    includedFiles: rec.includedFiles || '',
    canvas: rec.canvas || '',
    commercialRule: rec.commercialRule || '',
    extraCharacter: rec.extraCharacterFee || rec.extraCharacter || '',
    backgroundRule: rec.backgroundFee || rec.backgroundRule || '',
    tax: rec.tax || '5%',
    rush: rec.rushFee || rec.rush || '+20%',
    privateFee: rec.privateFee || '+20%',
    extraNotes: rec.extraNotes || '',
    alternatePrice: rec.alternatePrice || '',
    alternateCurrency: rec.alternateCurrency || '',
    isOtherService: rec.isOtherService !== undefined ? rec.isOtherService : true
  };
  return {
    slug: rec.slug || rec.id,
    title: rec.title || rec.name || 'Untitled Service',
    description: rec.description || '',
    price: isNaN(numPrice) ? null : numPrice,
    currency: rec.currency || 'USD',
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

export function formatSettingRow(key, value) {
  return {
    key,
    value: value || {}
  };
}
