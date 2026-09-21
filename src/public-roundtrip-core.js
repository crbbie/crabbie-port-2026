/**
 * public-roundtrip-core.js
 * Pure public-render helpers for Batch 2 (public roundtrip).
 * Mirrored by the pre-module inline renderers in crabbie-port26.html —
 * keep both copies in sync. No DOM, no Supabase access.
 */

/** Stable fee identity: label is bound to its field key, never an array index. */
export const COMMISSION_FEE_FIELDS = Object.freeze([
  { key: 'deliveryEstimate', label: 'Delivery estimate' },
  { key: 'includedFiles', label: 'Included files' },
  { key: 'canvas', label: 'Canvas' },
  { key: 'commercialRule', label: 'Commercial rule' },
  { key: 'extraCharacter', label: 'Extra character' },
  { key: 'backgroundRule', label: 'Background' },
  { key: 'tax', label: 'Tax' },
  { key: 'rush', label: 'Rush' },
  { key: 'privateFee', label: 'Private commission' }
]);

export function cleanFeeValue(value) {
  const text = String(value == null ? '' : value).trim();
  return text && text !== 'undefined' && text !== 'NaN' ? text : '';
}

/**
 * Keyed fee rows: sparse configs keep label<->value alignment because each
 * row carries its own field key. Empty fees produce no junk rows.
 * Returns [{ key, label, value }].
 */
export function commissionFeeRows(service) {
  const source = service && typeof service === 'object' ? service : {};
  return COMMISSION_FEE_FIELDS
    .map(({ key, label }) => ({ key, label, value: cleanFeeValue(source[key]) }))
    .filter((row) => row.value !== '');
}

/**
 * Only real placeholder syntax blanks a value. Ordinary markdown links such
 * as [text](url) are stripped before the check so normal copy never vanishes;
 * link-only markdown is real content and is returned as-is.
 */
const MD_LINK_RE = /\[[^\]\n]+\]\([^)\n]+\)/g;
// Bracketed template tokens: all-caps words only (case-SENSITIVE), so ordinary
// mixed-case copy like "[Read guide]" is never treated as a placeholder.
const PLACEHOLDER_BRACKET_RE = /\[([A-Z][A-Z0-9 /&+._-]*)\]/;
const BARE_YEAR_RE = /^YEAR$/;

export function visibleCmsValue(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  const withoutLinks = text.replace(MD_LINK_RE, ' ').trim();
  // Nothing but markdown links: the links ARE the content.
  if (!withoutLinks) return text;
  return !PLACEHOLDER_BRACKET_RE.test(withoutLinks) && !BARE_YEAR_RE.test(withoutLinks) ? text : '';
}

/**
 * About data contract:
 *   Name    = profile identity (greeting + image alt)
 *   Title   = page heading when the admin provides a custom one
 *   Bio     = hero paragraph
 *   Content = longer page body
 * A custom Title (anything beyond the generic "About") drives the heading so
 * the field is never silently overridden by Name. Otherwise Name
 * personalizes the greeting, and the generic Title is the last fallback.
 */
export function aboutHeading(page = {}) {
  const name = typeof page.name === 'string' ? page.name.trim() : '';
  const title = typeof page.title === 'string' ? page.title.trim() : '';
  const customTitle = title && title.toLowerCase() !== 'about' ? title : '';
  if (customTitle) return customTitle;
  if (name) return "Hello, I'm " + name + '.';
  return title || 'About';
}

export function aboutHeadingName(page = {}) {
  const name = typeof page.name === 'string' ? page.name.trim() : '';
  return name;
}

/** Alt text comes from the normalized About model — never an ambient global. */
export function profileImageAlt(page = {}) {
  const name = typeof page.name === 'string' ? page.name.trim() : '';
  if (name) return name;
  const title = typeof page.title === 'string' ? page.title.trim() : '';
  if (title) return title;
  return 'Crabbie';
}

/**
 * Contact presence semantics: a stored empty string clears public, a missing
 * key leaves public alone.
 * Returns { present, value } where value is '' when clearing.
 */
export function contactFieldState(group, key) {
  if (!group || typeof group !== 'object' || Array.isArray(group)) return { present: false, value: '' };
  if (!Object.prototype.hasOwnProperty.call(group, key)) return { present: false, value: '' };
  const raw = group[key];
  return { present: true, value: typeof raw === 'string' ? raw.trim() : '' };
}
