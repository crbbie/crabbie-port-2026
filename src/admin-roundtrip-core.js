// Only the contact roles this repository actually authors (seed + defaults).
export const CONTACT_ROLES = Object.freeze(['none', 'name', 'email']);

import { normalizeAssetGallery, normalizeCoverAlt } from './asset-gallery-core.js';

export function createAssetDraft(values = {}) {
  return {
    ...values,
    availability: values.availability || 'available',
    /* New drafts start with an explicit (possibly empty) preview list so
       later serializers never have to guess between missing and empty. */
    gallery: normalizeAssetGallery(values.gallery),
    coverAlt: normalizeCoverAlt(values.coverAlt, values.title)
  };
}

export function formRelationshipOptions(forms = []) {
  return forms
    .filter((form) => form && form.slug)
    .map((form) => ({
      value: form.slug,
      label: form.title || form.slug
    }));
}

/**
 * The Form writer preserves every supported authored property, keeps authored
 * option order and never invents a contact role.
 */
export function normalizeRequestFormFields(fields = []) {
  return fields.map((field) => {
    const role = typeof field.contactRole === 'string' && field.contactRole.trim()
      ? field.contactRole.trim()
      : 'none';
    const normalized = { ...field, contactRole: role };
    if (Array.isArray(field.options)) {
      normalized.options = field.options.map((option) => String(option).trim()).filter(Boolean);
    }
    return normalized;
  });
}

export const COMMISSION_CURRENCIES = Object.freeze(['USD', 'VND', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD']);

const CURRENCY_SYMBOLS = Object.freeze({
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$'
});

export function currencySymbol(currency) {
  const code = String(currency || '').trim().toUpperCase();
  if (code === 'VND' || !code) return '';
  if (Object.prototype.hasOwnProperty.call(CURRENCY_SYMBOLS, code)) return CURRENCY_SYMBOLS[code];
  return '';
}

function stripThousands(head, sep) {
  const groups = head.split(sep);
  if (groups.length < 2) return null;
  if (!/^[1-9]\d{0,2}$/.test(groups[0])) return null;
  for (let i = 1; i < groups.length; i += 1) {
    if (!/^\d{3}$/.test(groups[i])) return null;
  }
  return groups.join('');
}

/**
 * Explicit numeric parsing for admin price input. Never silently turns an
 * ambiguous input into a wrong number ("1.000.000" must not become 1):
 * thousand-separated groups resolve to their full value, anything genuinely
 * ambiguous resolves to null instead of a misparsed amount.
 * Returns { ok, value, blank, ambiguous }.
 */
export function parseCommissionPrice(input, currencyHint) {
  if (input === null || input === undefined) return { ok: true, value: null, blank: true, ambiguous: false };
  const raw = String(input).trim();
  if (!raw) return { ok: true, value: null, blank: true, ambiguous: false };
  // Admin price inputs may carry a currency symbol/code ("$50", "50.000 VND"):
  // strip one leading/trailing marker so legacy inputs keep parsing.
  let markedCurrency = String(currencyHint || '').trim().toUpperCase();
  let core = raw;
  const markerPattern = /^(CA\$|A\$|[$€£¥])\s*(.+)$/i;
  const markerPrefix = core.match(markerPattern);
  if (markerPrefix) core = markerPrefix[2].trim();
  const markerSuffix = core.match(/^(.+?)\s*(VND|USD|EUR|GBP|JPY|CAD|AUD|CA\$|A\$|[$€£¥])$/i);
  if (markerSuffix) {
    core = markerSuffix[1].trim();
    if (!markedCurrency) markedCurrency = String(markerSuffix[2] || '').replace(/[$]/g, '').trim().toUpperCase();
    if (/^[€£¥]$/.test(markerSuffix[2])) markedCurrency = markedCurrency || markerSuffix[2];
  }
  const compact = core.replace(/[\s_']/g, '');
  if (!/^[-+]?[\d.,]+$/.test(compact)) return { ok: true, value: null, blank: false, ambiguous: false };
  let sign = '';
  let body = compact;
  const signMatch = body.match(/^([-+])/);
  if (signMatch) {
    sign = signMatch[1] === '-' ? '-' : '';
    body = body.slice(1);
  }
  const dots = (body.match(/\./g) || []).length;
  const commas = (body.match(/,/g) || []).length;
  let normalized = null;
  if (dots > 0 && commas > 0) {
    const lastDot = body.lastIndexOf('.');
    const lastComma = body.lastIndexOf(',');
    const decimalSep = lastDot > lastComma ? '.' : ',';
    const thousandSep = decimalSep === '.' ? ',' : '.';
    const head = body.slice(0, body.lastIndexOf(decimalSep));
    const tail = body.slice(body.lastIndexOf(decimalSep) + 1);
    if (!/^\d{1,2}$/.test(tail)) return { ok: true, value: null, blank: false, ambiguous: true };
    const headStripped = head.split(thousandSep).join('');
    if (!/^\d+$/.test(headStripped)) return { ok: true, value: null, blank: false, ambiguous: true };
    normalized = headStripped + '.' + tail;
  } else if (dots > 0) {
    if (dots === 1) {
      const [head, tail] = body.split('.');
      if (/^\d+$/.test(head) && /^\d+$/.test(tail)) {
        // "1.000" alone is ambiguous (1.0 vs 1000): refuse to guess, unless a
        // VND marker disambiguates dots as thousand separators.
        if (/^\d{3}$/.test(tail) && /^[1-9]\d{0,2}$/.test(head)) {
          if (markedCurrency === 'VND' || markedCurrency === '₫') normalized = head + tail;
          else return { ok: true, value: null, blank: false, ambiguous: true };
        } else {
          normalized = head + '.' + tail;
        }
      }
    } else {
      const stripped = stripThousands(body, '.');
      if (stripped !== null) normalized = stripped;
    }
  } else if (commas > 0) {
    if (commas === 1) {
      const [head, tail] = body.split(',');
      if (/^\d+$/.test(head) && /^\d{3}$/.test(tail) && /^[1-9]\d{0,2}$/.test(head)) {
        normalized = head + tail;
      }
    } else {
      const stripped = stripThousands(body, ',');
      if (stripped !== null) normalized = stripped;
    }
  } else {
    normalized = body;
  }
  if (normalized === null || !/^\d+(\.\d+)?$/.test(normalized)) {
    return { ok: true, value: null, blank: false, ambiguous: true };
  }
  const value = Number(sign + normalized);
  if (!Number.isFinite(value)) return { ok: true, value: null, blank: false, ambiguous: true };
  return { ok: true, value, blank: false, ambiguous: false };
}

export function formatPriceWithCurrency(amount, currency) {
  const code = String(currency || '').trim().toUpperCase() || 'USD';
  const text = amount === null || amount === undefined ? '' : String(amount).trim();
  if (!text) return '';
  if (code === 'VND') return `${text} VND`;
  const symbol = currencySymbol(code);
  if (symbol) return `${symbol}${text}`;
  return `${text} ${code}`;
}

export function formattedCommissionPrice({ price, currency }) {
  const canonicalPrice = String(price ?? '').trim();
  if (!canonicalPrice) return '';
  // Never decorate a non-numeric string with a currency symbol.
  if (!/^[-+]?[\d.,\s_']+$/.test(canonicalPrice)) return canonicalPrice;
  return formatPriceWithCurrency(canonicalPrice, currency);
}
