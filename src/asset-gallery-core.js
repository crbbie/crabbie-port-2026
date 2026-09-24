/**
 * asset-gallery-core.js
 * Pure rules for Free Asset additional preview images (`metadata.gallery`).
 *
 * Contract:
 * - `thumbnail_path` stays the cover; `file_path` stays the download.
 * - `metadata.gallery` is an ordered array of
 *   { id, url, alt, caption, width?, height? } using canonical original refs.
 * - `metadata.coverAlt` is optional; rendering falls back to the asset title.
 * - Missing/null gallery => []; explicit [] stays empty.
 * - Array order is authoritative; ids are stable across edits.
 * - Malformed legacy input never crashes normalization; invalid authored
 *   values are reported by validateGalleryItem (editor feedback) instead of
 *   being silently persisted as good data.
 * - The cover is never auto-duplicated into persisted gallery data.
 *
 * No DOM, no network. Browser wiring lives in crabbie-port26.html and the
 * admin browser services.
 */

let galleryIdSeq = 0;

function defaultGalleryId() {
  galleryIdSeq += 1;
  return 'preview-' + galleryIdSeq + '-' + Date.now().toString(36).slice(-4);
}

function cleanText(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function cleanId(value, idFactory) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw) return raw.slice(0, 80);
  return typeof idFactory === 'function' ? idFactory() : defaultGalleryId();
}

function cleanDimensions(value) {
  if (!value || typeof value !== 'object') return {};
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return {};
  if (width > 100000 || height > 100000) return {};
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Normalize any stored/authored gallery value into ordered item objects.
 * Never truncates: every entry carrying a usable shape survives (including
 * entries with an empty url, which the editor surfaces for correction and
 * public rendering skips). Non-array input (missing/null/legacy scalar)
 * resolves to [].
 */
export function normalizeAssetGallery(input, { idFactory } = {}) {
  if (!Array.isArray(input)) return [];
  const items = [];
  input.forEach((entry) => {
    if (typeof entry === 'string') {
      const url = entry.trim();
      if (!url) return;
      items.push({ id: cleanId('', idFactory), url, alt: '', caption: '' });
      return;
    }
    if (!entry || typeof entry !== 'object') return;
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    items.push({
      id: cleanId(entry.id, idFactory),
      url,
      alt: cleanText(entry.alt, 240),
      caption: cleanText(entry.caption, 500),
      ...cleanDimensions(entry)
    });
  });
  return items;
}

/** Serialize back to the stored shape (no extra keys, no cover injection). */
export function serializeAssetGallery(items) {
  return normalizeAssetGallery(items).map((item) => {
    const out = { id: item.id, url: item.url, alt: item.alt || '', caption: item.caption || '' };
    if (item.width && item.height) {
      out.width = item.width;
      out.height = item.height;
    }
    return out;
  });
}

export function normalizeCoverAlt(value, title = '') {
  const authored = cleanText(value, 240);
  if (authored) return authored;
  return '';
}

export function coverAltFor(record) {
  const authored = cleanText(record && record.coverAlt, 240);
  if (authored) return authored;
  return String((record && record.title) || '').trim();
}

/**
 * Loosely mirror the public safePublicUrl(media) acceptance: https URLs or
 * bare media-library storage paths. Used for editor feedback only.
 */
export function isGalleryUrlSafe(url) {
  const raw = typeof url === 'string' ? url.trim() : '';
  if (!raw) return false;
  if (/^https:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
    } catch (err) {
      return false;
    }
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9/_ .-]*$/.test(raw) && raw.indexOf('..') === -1;
}

/** Editor feedback for one authored row; [] means the row is fine. */
export function validateGalleryItem(item) {
  const errors = [];
  if (!item || typeof item !== 'object') {
    return ['Preview is not a valid image entry.'];
  }
  const url = typeof item.url === 'string' ? item.url.trim() : '';
  if (!url) errors.push('This preview has no image yet. Pick one from the library or upload it.');
  else if (!isGalleryUrlSafe(url)) errors.push('Use an https:// link or a media library image for this preview.');
  return errors;
}

/** Immutable reorder; returns null when the move is out of range. */
export function moveGalleryItem(list, index, dir) {
  const items = Array.isArray(list) ? list.slice() : [];
  const next = index + (dir === 'up' ? -1 : 1);
  if (index < 0 || index >= items.length || next < 0 || next >= items.length) return null;
  const tmp = items[index];
  items[index] = items[next];
  items[next] = tmp;
  return items;
}

/**
 * Swap the image source of one row while preserving its stable id, order,
 * alt and caption. Source dimensions update when provided (and clear when
 * the replacement carries none).
 */
export function replaceGalleryItemSource(item, source = {}) {
  const base = item && typeof item === 'object' ? { ...item } : { id: '', url: '', alt: '', caption: '' };
  base.url = typeof source.url === 'string' ? source.url : base.url;
  delete base.width;
  delete base.height;
  const dims = cleanDimensions(source);
  if (dims.width && dims.height) {
    base.width = dims.width;
    base.height = dims.height;
  }
  return base;
}

/** Assign stable ids to appended picker rows (existing ids survive). */
export function ensureGalleryIds(rows, { idFactory } = {}) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    if (!row || typeof row !== 'object') return row;
    if (typeof row.id === 'string' && row.id.trim()) return row;
    return { ...row, id: cleanId('', idFactory) };
  });
}

/** Collection index step with wrap-around; count<=0 yields 0. */
export function viewerIndexStep(index, dir, count) {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  if (total <= 1) return 0;
  const at = Math.floor(Number(index) || 0);
  return (((at + (dir === 'prev' ? -1 : 1)) % total) + total) % total;
}
