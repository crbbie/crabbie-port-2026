/**
 * admin-data-audit-core.js
 * Pure content-completeness auditing for the Admin CMS.
 * No DOM, no i18n, no Supabase access. Records are the plain draft
 * objects already loaded from Supabase (see admin-crud.js mapping).
 *
 * Every audit returns:
 *   {
 *     status: 'complete' | 'warning' | 'incomplete',
 *     required:    [fieldKey...]   // required fields that were checked
 *     missing:     [fieldKey...]   // required fields that are empty
 *     placeholders:[fieldKey...]   // fields whose value looks like a template placeholder
 *     warnings:    [code...]       // recommended/soft issues
 *     critical:    [code...]       // high-priority issues (e.g. published without a file)
 *   }
 * Field/codes are stable identifiers; the Admin UI translates them.
 */

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const MD_LINK_RE = /\[[^\]\n]+\]\([^)\n]+\)/g;
// Whole-word template remnants that are unambiguous even outside brackets.
const BARE_RE = /\b(TODO|TBD|PLACEHOLDER|LOREM IPSUM|FROM CMS|ADD CONTENT|LICENSE CONTENT|CREDIT REQUIREMENT|UPDATE NOTE|COMING SOON|INSERT [A-Z]+ HERE)\b/gi;
// Bracketed tokens: conservative — all-caps words only, so ordinary text
// containing brackets or mixed-case mentions is never flagged.
const BRACKET_RE = /\[([A-Z0-9][A-Z0-9 .\/&'+-]*)\]/g;
// Single all-caps words that are template-ish; other single words (e.g. "[Info]")
// are left alone.
const BRACKET_SINGLE_OK = new Set(['TODO', 'TBD', 'DATE', 'VERSION', 'PLACEHOLDER', 'WIP', 'DRAFT', 'TITLE', 'HEADING', 'NAME', 'DESCRIPTION', 'LICENSE', 'CREDIT', 'UPDATE', 'NOTE', 'CONTENT']);

export function findPlaceholders(text) {
  if (typeof text !== 'string' || !text.trim()) return [];
  const withoutLinks = text.replace(MD_LINK_RE, ' ');
  const found = [];
  let m;
  BRACKET_RE.lastIndex = 0;
  while ((m = BRACKET_RE.exec(withoutLinks))) {
    const inner = m[1].trim();
    if (!/[A-Z]/.test(inner)) continue; // digits/punctuation only → not a template token
    const words = inner.split(/\s+/).filter(Boolean);
    const allCapsWords = words.every((w) => w === w.toUpperCase() && /[A-Z]/.test(w));
    if (!allCapsWords) continue;
    if (words.length >= 2 || BRACKET_SINGLE_OK.has(inner)) found.push('[' + inner + ']');
  }
  BARE_RE.lastIndex = 0;
  while ((m = BARE_RE.exec(withoutLinks))) {
    const token = m[1].toUpperCase();
    // skip bare hits already contained in a bracketed placeholder hit
    if (!found.some((f) => f.indexOf(token) !== -1)) found.push(token);
  }
  return [...new Set(found)];
}

export function hasPlaceholderText(value) {
  if (typeof value === 'string') return findPlaceholders(value).length > 0;
  if (Array.isArray(value)) return value.some((v) => hasPlaceholderText(v));
  return false;
}

function isBlank(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function scanFields(rec, fields) {
  const placeholders = [];
  fields.forEach((key) => {
    const value = key.split('.').reduce((obj, part) => obj == null ? undefined : obj[part], rec);
    if (!isBlank(value) && hasPlaceholderText(value)) placeholders.push(key);
  });
  return placeholders;
}

function finalize(result) {
  const bad = result.missing.length > 0 || result.critical.length > 0;
  const soft = result.placeholders.length > 0 || result.warnings.length > 0;
  result.status = bad ? 'incomplete' : soft ? 'warning' : 'complete';
  return result;
}

const hasSubstantialProjectContent = (rec) =>
  (Array.isArray(rec.blocks) && rec.blocks.length > 0) ||
  !isBlank(rec.intro) || !isBlank(rec.sketch) || !isBlank(rec.process) || !isBlank(rec.body);

export function auditPortfolioRecord(rec = {}) {
  const required = ['title', 'slug', 'category', 'thumbnail', 'cover', 'description'];
  const missing = required.filter((k) => isBlank(rec[k]));
  const warnings = [];
  if (isBlank(rec.tags)) warnings.push('no-tags');
  if (isBlank(rec.date) && isBlank(rec.year)) warnings.push('no-date');
  if (!hasSubstantialProjectContent(rec)) warnings.push('no-content-blocks');
  if (rec.placeholder) warnings.push('record-flagged-placeholder');
  return finalize({
    status: 'complete',
    required,
    missing,
    placeholders: scanFields(rec, ['title', 'description', 'thumbnail', 'cover']),
    warnings,
    critical: []
  });
}

const assetDownload = (rec) => rec.downloadUrl !== undefined ? rec.downloadUrl : rec.media;

export function auditAssetRecord(rec = {}) {
  const required = ['title', 'slug', 'category', 'thumbnail', 'media', 'description', 'fileFormat', 'license', 'availability'];
  const hasDownload = !isBlank(assetDownload(rec));
  const missing = required.filter((k) => {
    if (k === 'media') return !hasDownload;
    return isBlank(rec[k]);
  });
  const warnings = [];
  const critical = [];
  if (isBlank(rec.tags)) warnings.push('no-tags');
  if (rec.published && !hasDownload) critical.push('published-without-file');
  return finalize({
    status: 'complete',
    required,
    missing,
    placeholders: scanFields(rec, ['title', 'description', 'thumbnail', 'media', 'downloadUrl', 'license', 'credit', 'version', 'updateNote', 'dateAdded']),
    warnings,
    critical
  });
}

export function auditCommissionRecord(rec = {}, ctx = {}) {
  const required = ['title', 'slug', 'description', 'price', 'availability', 'form', 'thumbnail', 'delivery'];
  const missing = required.filter((k) => {
    if (k === 'price' && isBlank(rec.price) && !isBlank(rec.priceFormatted)) return false;
    if (k === 'delivery' && !isBlank(rec.deliveryEstimate)) return false;
    return isBlank(rec[k]);
  });
  const warnings = [];
  const critical = [];
  const knownForms = Array.isArray(ctx.formIds) ? ctx.formIds : null;
  if (isBlank(rec.form) || (knownForms && !knownForms.includes(rec.form))) {
    critical.push('no-form-mapping');
  }

  if (isBlank(rec.chips)) warnings.push('no-chips');
  if (isBlank(rec.includedFiles)) warnings.push('no-included-files');
  return finalize({
    status: 'complete',
    required,
    missing,
    placeholders: scanFields(rec, ['title', 'description', 'thumbnail', 'priceNote']),
    warnings,
    critical
  });
}

export function auditPageRecord(page = {}, kind, ctx = {}) {
  if (kind === 'about') return auditAboutPage(page, ctx);
  if (kind === 'terms') return auditTermsPage(page, ctx);
  throw new Error('Unknown page kind: ' + kind);
}

function pageContactLinks(page = {}, ctx = {}) {
  const contact = ctx.settings && ctx.settings.contact ? ctx.settings.contact : {};
  return {
    email: contact.email || '',
    twitter: contact.twitter || '',
    links: Array.isArray(page.links) ? page.links : []
  };
}

function auditAboutPage(page, ctx) {
  const required = ['name', 'bio', 'content'];
  const missing = required.filter((k) => isBlank(page[k]));
  const warnings = [];
  const contact = pageContactLinks(page, ctx);
  if (isBlank(page.profileImage)) warnings.push('no-profile-image');
  if (isBlank(contact.email) && isBlank(contact.twitter) && contact.links.length === 0) {
    warnings.push('no-contact-link');
  }
  if (!isBlank(page.content) && EMAIL_RE.test(page.content) && !new RegExp('mailto:', 'i').test(page.content)) {
    warnings.push('raw-email-not-clickable');
  }
  if (isBlank(page.skills)) warnings.push('no-skills');
  if (isBlank(page.experience)) warnings.push('no-experience');
  return finalize({
    status: 'complete',
    required,
    missing,
    placeholders: scanFields(page, ['name', 'bio', 'content', 'profileImage']),
    warnings,
    critical: []
  });
}

const TERMS_SECTION_RE = [
  ['contact-method', /contact|work process|twitter|dm|email/i],
  ['payment', /payment|refund/i],
  ['edits', /edit|feedback|revision/i],
  ['turnaround', /turnaround|deadline/i],
  ['formats', /files?\s*&?\s*format|transparent png|\bpsd\b|png/i],
  ['copyright', /copyright|usage|commercial/i],
  ['artist-rights', /artist rights/i]
];

function auditTermsPage(page, ctx) {
  const required = ['title', 'content'];
  const missing = required.filter((k) => isBlank(page[k]));
  const warnings = [];
  const content = typeof page.content === 'string' ? page.content : '';
  const sectionHeaders = (content.match(/(^|\n)#{1,6}\s+\S/g) || []).length;
  if (content && sectionHeaders < 5) warnings.push('few-sections');
  if (content) {
    const words = content.split(/\s+/).filter(Boolean).length;
    if (words < 60) warnings.push('thin-content');
    TERMS_SECTION_RE.forEach(([code, re]) => {
      if (!re.test(content)) warnings.push('missing-section:' + code);
    });
  }
  const contact = pageContactLinks({}, ctx);
  if (isBlank(contact.email) && isBlank(contact.twitter) && !EMAIL_RE.test(content)) {
    warnings.push('no-contact-method');
  }
  if (content && EMAIL_RE.test(content) && !/mailto:/i.test(content)) {
    warnings.push('raw-email-not-clickable');
  }
  return finalize({
    status: 'complete',
    required,
    missing,
    placeholders: scanFields(page, ['title', 'content']),
    warnings,
    critical: []
  });
}

export function auditSettingsRecord(settings = {}) {
  const warnings = [];
  const contact = settings.contact || {};
  if (isBlank(contact.email)) warnings.push('no-contact-email');
  else if (!EMAIL_RE.test(String(contact.email))) warnings.push('bad-contact-email');
  if (isBlank(contact.twitter)) warnings.push('no-contact-twitter');
  const branding = settings.branding || {};
  if (isBlank(branding.logo)) warnings.push('no-logo');
  if (isBlank(branding.heroMedia)) warnings.push('no-hero-media');
  const seo = settings.seo || {};
  if (isBlank(seo.socialImage)) warnings.push('no-seo-image');
  return finalize({
    status: 'complete',
    required: ['contact.email'],
    missing: isBlank(contact.email) ? ['contact.email'] : [],
    placeholders: scanFields(settings, ['branding.title', 'branding.tagline', 'branding.intro', 'seo.title', 'seo.description']),
    warnings,
    critical: []
  });
}

function countIssues(audit) {
  return audit.missing.length + audit.placeholders.length + audit.warnings.length + audit.critical.length;
}

export function auditSiteData(data = {}) {
  const portfolio = Array.isArray(data.portfolio) ? data.portfolio : [];
  const assets = Array.isArray(data.assets) ? data.assets : [];
  const commissions = Array.isArray(data.commissions) ? data.commissions : [];
  const forms = Array.isArray(data.forms) ? data.forms : [];
  const formIds = forms.map((f) => f.id);
  const ctx = { formIds, settings: data.settings };
  const audits = {
    portfolio: portfolio.map(auditPortfolioRecord),
    assets: assets.map((r) => auditAssetRecord(r)),
    commissions: commissions.map((r) => auditCommissionRecord(r, ctx))
  };
  const summarize = (recs, auditsFor) => ({
    total: recs.length,
    published: recs.filter((r) => r.published).length,
    needAttention: auditsFor.filter((a) => a.status !== 'complete').length,
    missingThumbnails: auditsFor.filter((a) => a.missing.includes('thumbnail')).length
  });
  const assetsAudit = audits.assets;
  return {
    portfolio: summarize(portfolio, audits.portfolio),
    assets: Object.assign(summarize(assets, assetsAudit), {
      missingFiles: assets.filter((r) => r.published && isBlank(assetDownload(r))).length
    }),
    commissions: Object.assign(summarize(commissions, audits.commissions), {
      missingForms: audits.commissions.filter((a) => a.critical.includes('no-form-mapping')).length
    }),
    about: { issues: countIssues(auditPageRecord(data.pages && data.pages.about || {}, 'about', ctx)) },
    terms: { issues: countIssues(auditPageRecord(data.pages && data.pages.terms || {}, 'terms', ctx)) },
    media: { total: Array.isArray(data.media) ? data.media.length : 0 }
  };
}
