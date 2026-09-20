/**
 * public-richtext-core.js
 * Minimal safe rich text for portfolio copy: a tiny markdown subset plus a
 * text-size preset. HTML is escaped FIRST, then only allowed tokens are
 * transformed, so authored markup can never become an XSS hole. No links,
 * no images, no raw HTML. No DOM, no network.
 */

const TEXT_SIZES = ['small', 'normal', 'large'];

export function normalizeRichTextSize(value) {
  return TEXT_SIZES.indexOf(String(value || '')) !== -1 ? String(value) : 'normal';
}

function escapeHtml(text) {
  return String(text == null ? '' : text).replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;';
    if (char === '<') return '&lt;';
    if (char === '>') return '&gt;';
    if (char === '"') return '&quot;';
    return '&#39;';
  });
}

function formatInline(escaped) {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

/** Inline formatting only (bold/italic/line breaks), no wrapper element. */
export function renderRichInline(text) {
  return formatInline(escapeHtml(text));
}

/** Block text: blank lines become paragraphs, single breaks stay breaks. */
export function renderRichText(text, size) {
  const mode = normalizeRichTextSize(size);
  const raw = String(text == null ? '' : text);
  if (!raw.trim()) return '';
  const paragraphs = raw.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (!paragraphs.length) return '';
  return paragraphs.map((part) => '<p class="cms rt-size-' + mode + '">' + formatInline(escapeHtml(part)) + '</p>').join('');
}
