/**
 * admin-media-manager-core.js
 * Pure rules for the Media Manager UX: view mode, server-side filter/sort
 * specs, metadata rows, preview kind, selection rules, bulk summaries and the
 * keyboard-save decision. DOM wiring stays in the admin page.
 */
import { MEDIA_PAGE_SIZE } from './admin-query-core.js';
import { isSupportedMediaFile, resolveUploadContentType, supportedMediaInputAccept, SUPPORTED_MEDIA_MIME_TYPES, SUPPORTED_MEDIA_EXTENSIONS } from './admin-media-core.js';

export const MEDIA_VIEWS = Object.freeze({ GRID: 'grid', LIST: 'list' });

export function normalizeMediaView(view) {
  return view === MEDIA_VIEWS.LIST ? MEDIA_VIEWS.LIST : MEDIA_VIEWS.GRID;
}

export const MEDIA_TYPE_FILTERS = Object.freeze([
  { value: 'all', label: 'All types' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'PDF / archives' }
]);

export const MEDIA_SORTS = Object.freeze([
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Filename A–Z' }
]);

// MIME prefixes/extensions per filter: filenames give the server-side fallback
// so a filter never needs a locally loaded full table.
const TYPE_RULES = Object.freeze({
  image: { prefixes: ['image/'], extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'] },
  video: { prefixes: ['video/'], extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] },
  audio: { prefixes: ['audio/'], extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] },
  document: { prefixes: ['application/pdf', 'application/zip', 'application/x-zip'], extensions: ['pdf', 'zip'] }
});

export function normalizeMediaType(type) {
  return Object.prototype.hasOwnProperty.call(TYPE_RULES, type) ? type : 'all';
}

export function mediaTypeRules(type) {
  return TYPE_RULES[normalizeMediaType(type)] || null;
}

/** Server-side `or()` predicates for one media type filter. Percent signs stay
 * raw: the Supabase query builder URL-encodes them, so a pre-encoded `%25`
 * would reach Postgres as a literal and the filename-extension fallback would
 * never match. No DOM, no Supabase access. */
export function mediaTypeServerClauses(type) {
  const rules = mediaTypeRules(type);
  if (!rules) return [];
  const clauses = rules.prefixes.map((prefix) => 'mime_type.like.' + prefix + '%');
  rules.extensions.forEach((extension) => clauses.push('original_name.ilike.' + '%.' + extension));
  return clauses;
}

function cleanDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

/**
 * One scoped server query per interaction: filters and ordering are described
 * here and applied by the query layer, never by slicing locally loaded rows.
 */
export function mediaQuerySpec({ search, type, sort, from, to, page, pageSize } = {}) {
  return {
    search: typeof search === 'string' && search.trim() ? search.trim() : null,
    type: normalizeMediaType(type),
    sort: MEDIA_SORTS.some((entry) => entry.value === sort) ? sort : 'newest',
    from: cleanDate(from),
    to: cleanDate(to),
    page: Number.isFinite(Number(page)) && Number(page) > 1 ? Math.floor(Number(page)) : 1,
    pageSize: Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : MEDIA_PAGE_SIZE
  };
}

export function mediaQueryChanged(previous = {}, next = {}) {
  const keys = ['search', 'type', 'sort', 'from', 'to'];
  return keys.some((key) => (previous[key] || null) !== (next[key] || null));
}

export function mediaFilterSummary(spec = {}) {
  const parts = [];
  if (spec.search) parts.push('“' + spec.search + '”');
  if (spec.type && spec.type !== 'all') parts.push(spec.type);
  if (spec.from || spec.to) parts.push((spec.from || '…') + ' → ' + (spec.to || '…'));
  return parts.join(' · ');
}

/* ------------------------------- metadata --------------------------------- */

export function formatDimensions(item) {
  const width = Number(item && item.width);
  const height = Number(item && item.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '';
  return Math.round(width) + ' × ' + Math.round(height) + ' px';
}

export function formatUploadDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

/** Details rows; the digest only appears in the technical view. */
export function mediaMetadataRows(item, { technical = false } = {}) {
  if (!item) return [];
  const rows = [
    { label: 'File name', value: item.title || '' },
    { label: 'Type', value: item.mimeType || item.type || '' },
    { label: 'Size', value: item.size || '' },
    { label: 'Uploaded', value: formatUploadDate(item.createdAt) },
    { label: 'Dimensions', value: formatDimensions(item) },
    { label: 'Alt text', value: item.alt || '' }
  ];
  if (technical) {
    rows.push({ label: 'Storage path', value: item.storagePath || '' });
    rows.push({ label: 'SHA-256', value: item.sha256 || '(not recorded)' });
    rows.push({ label: 'Deletion state', value: item.deletionStatus || 'active' });
    rows.push({ label: 'Media id', value: item.id || '' });
  }
  return rows.filter((row) => row.value !== '' && row.value != null);
}

/* -------------------------------- preview --------------------------------- */

const PREVIEW_IMAGE_EXTENSIONS = Object.freeze(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico']);
const PREVIEW_VIDEO_EXTENSIONS = Object.freeze(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const PREVIEW_AUDIO_EXTENSIONS = Object.freeze(['mp3', 'wav', 'ogg', 'm4a', 'aac']);

function itemExtension(item) {
  const name = (item && (item.extension || item.title || item.storagePath)) || '';
  const clean = String(name).split('?')[0];
  const dot = clean.lastIndexOf('.');
  return dot > 0 ? clean.slice(dot + 1).toLowerCase() : '';
}

export function previewKindFor(item) {
  if (!item || !item.url) return 'unsupported';
  const mime = String(item.mimeType || '');
  const extension = itemExtension(item);
  if (mime.startsWith('image/') || PREVIEW_IMAGE_EXTENSIONS.includes(extension)) return 'image';
  if (mime.startsWith('video/') || PREVIEW_VIDEO_EXTENSIONS.includes(extension)) return 'video';
  if (mime.startsWith('audio/') || PREVIEW_AUDIO_EXTENSIONS.includes(extension)) return 'audio';
  if (mime === 'application/pdf' || extension === 'pdf') return 'pdf';
  return 'unsupported';
}

/** Preview always uses the canonical original, never a thumbnail variant. */
export function previewDescriptor(item) {
  const kind = previewKindFor(item);
  return {
    kind,
    original: (item && item.url) || '',
    title: (item && item.title) || '',
    downloadable: Boolean(item && item.url),
    note: kind === 'unsupported' ? 'No inline preview for this file type. Use download or copy URL.' : ''
  };
}

/* ------------------------------- selection -------------------------------- */

export function acceptMatches(item, accept) {
  if (!accept || accept === '*' || accept === '*/*') return true;
  const kinds = String(accept).split(',').map((entry) => entry.trim()).filter(Boolean);
  if (!kinds.length) return true;
  const mime = String((item && item.mimeType) || '');
  const extension = itemExtension(item);
  return kinds.some((rule) => {
    if (rule.endsWith('/*')) return mime.startsWith(rule.slice(0, -1));
    if (rule.startsWith('.')) return extension === rule.slice(1).toLowerCase();
    if (rule.includes('/')) return mime === rule;
    return extension === rule.toLowerCase();
  });
}

/** Explicit editor contract; null means a path is not a media target. */
export function mediaTargetAccept(path, blockType = '') {
  const target = String(path || '');
  if (/^assets\.[^.]+\.downloadUrl$/.test(target)) return '*';
  if (target === 'settings.music.url') return 'audio/*';
  const block = target.match(/^portfolio\.[^.]+\.blocks\.\d+\.(url|items|before|after)$/);
  if (block) {
    const field = block[1];
    if ((blockType === 'gallery' || blockType === 'grid') && field === 'items') return 'image/*';
    if (blockType === 'video' && field === 'url') return 'video/*';
    if (blockType === 'gif' && field === 'url') return 'image/gif';
    if (['image', 'image-text'].includes(blockType) && field === 'url') return 'image/*';
    if (blockType === 'before-after' && ['before', 'after'].includes(field)) return 'image/*';
    return null;
  }
  if (/^portfolio\.[^.]+\.(thumbnail|cover)$/.test(target)) return 'image/*';
  if (/^people\.[^.]+\.avatar$/.test(target)) return 'image/*';
  if (/^(assets|commissions)\.[^.]+\.thumbnail$/.test(target)) return 'image/*';
  if (target === 'pages.about.profileImage') return 'image/*';
  if (['settings.branding.logo', 'settings.branding.heroMedia', 'settings.seo.socialImage', 'settings.theme.backgroundImage'].includes(target)) return 'image/*';
  return null;
}

export function mediaItemMatchesTarget(item, accept) {
  if (!accept || !item || !item.url) return false;
  const name = item.title || item.storagePath || '';
  const mime = item.mimeType || resolveUploadContentType({ name });
  return isSupportedMediaFile({ name, type: mime }).supported && acceptMatches({ ...item, mimeType: mime }, accept);
}

/** Canonical chooser hints, narrowed to one editor target when needed. */
export function mediaInputAccept(accept = '*') {
  if (accept === '*') return supportedMediaInputAccept();
  if (!accept) return '';
  const mimes = SUPPORTED_MEDIA_MIME_TYPES.filter((mimeType) => acceptMatches({ mimeType }, accept));
  const extensions = SUPPORTED_MEDIA_EXTENSIONS.filter((extension) => acceptMatches({ mimeType: resolveUploadContentType({ name: 'file.' + extension }), title: 'file.' + extension }, accept));
  return [...mimes, ...extensions.map((extension) => '.' + extension)].join(',');
}
export function filterByAccept(items, accept) {
  return (Array.isArray(items) ? items : []).filter((item) => acceptMatches(item, accept));
}

export function toggleSelection(selected, id) {
  const list = Array.isArray(selected) ? selected.slice() : [];
  const index = list.indexOf(id);
  if (index === -1) list.push(id);
  else list.splice(index, 1);
  return list;
}

/** A paged UI may only act on records loaded for its current page. */
export function reconcilePageSelection(selected, items) {
  const available = new Set((Array.isArray(items) ? items : []).map((item) => String(item && item.id)).filter(Boolean));
  const seen = new Set();
  return (Array.isArray(selected) ? selected : []).map(String).filter((id) => {
    if (!available.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Picker browsing intentionally begins without hidden manager-only filters. */
export function createPickerMediaQuery(managerQuery = {}) {
  return {
    ...mediaQuerySpec({ pageSize: managerQuery.pageSize }),
    page: 1
  };
}
/** Resolve every Picker ID against its own current page before applying. */
export function resolvePickerSelectedItems(selected, items) {
  const ids = Array.isArray(selected) ? selected : [];
  const records = Array.isArray(items) ? items : [];
  const resolved = ids.map((id) => records.find((item) => item && String(item.id) === String(id)));
  return resolved.every(Boolean) ? resolved : null;
}
export function selectionState(selected, items) {
  const ids = new Set((Array.isArray(selected) ? selected : []).map(String));
  return {
    ids,
    count: ids.size,
    urls: (Array.isArray(items) ? items : []).filter((item) => ids.has(String(item.id))).map((item) => item.url)
  };
}

/** Single-value fields stay single; only gallery-style fields receive many. */
export function pickerResultFor(urls, { multiple = false } = {}) {
  const list = (Array.isArray(urls) ? urls : [urls]).filter((url) => typeof url === 'string' && url.trim());
  if (!list.length) return { urls: [], value: null, multiple: Boolean(multiple) };
  return { urls: list, value: multiple ? list : list[0], multiple: Boolean(multiple) };
}

/* ------------------------------- block targets ----------------------------- */

// Only the block fields the current portfolio schema really exposes.
export const BLOCK_MEDIA_TARGETS = Object.freeze({
  image: ['url'],
  'image-text': ['url'],
  gallery: ['items'],
  grid: ['items'],
  gif: ['url'],
  video: ['url'],
  'before-after': ['before', 'after'],
  youtube: ['url']
});

export function blockMediaFields(blockType) {
  return BLOCK_MEDIA_TARGETS[blockType] || [];
}

export function blockAcceptsMultiple(blockType) {
  const fields = blockMediaFields(blockType);
  return fields.length === 1 && fields[0] === 'items';
}

export function galleryItemsFor(urls, { alt = '' } = {}) {
  return (Array.isArray(urls) ? urls : []).filter(Boolean).map((url) => ({ url, alt, caption: '' }));
}

/* --------------------------- bulk delete summary --------------------------- */

export function bulkMediaSummary(results) {
  const list = Array.isArray(results) ? results : [];
  const summary = { total: list.length, deleted: 0, blocked: 0, failed: 0, pending: 0, details: [] };
  list.forEach((entry) => {
    const result = entry && entry.result ? entry.result : {};
    const label = (entry && entry.title) || (entry && entry.id) || 'media';
    if (result.success) {
      summary.deleted += 1;
      summary.details.push({ title: label, status: 'deleted' });
      return;
    }
    if (result.blocked) {
      summary.blocked += 1;
      summary.details.push({ title: label, status: 'blocked', reason: result.error || '' });
      return;
    }
    if (result.pending) {
      summary.pending += 1;
      summary.details.push({ title: label, status: 'pending', reason: result.error || '' });
      return;
    }
    summary.failed += 1;
    summary.details.push({ title: label, status: 'failed', reason: result.error || (entry && entry.error) || '' });
  });
  return summary;
}

export function bulkSummaryMessage(summary) {
  if (!summary) return '';
  const parts = [];
  if (summary.deleted) parts.push('deleted: ' + summary.deleted);
  if (summary.blocked) parts.push('blocked: ' + summary.blocked);
  if (summary.pending) parts.push('needs retry: ' + summary.pending);
  if (summary.failed) parts.push('failed: ' + summary.failed);
  if (!parts.length) return 'Nothing to delete.';
  return 'Bulk delete — ' + parts.join(', ') + '.';
}

/* ------------------------------ upload helpers ---------------------------- */

export const MAX_DROPPED_FILES = 20;

/** Drag/drop reuses the Batch 4 pipeline: this only validates the drop. */
export function acceptedDropFiles(fileList, { accept } = {}) {
  const files = Array.from(fileList || []).filter((file) => file && typeof file.name === 'string');
  const bounded = files.slice(0, MAX_DROPPED_FILES);
  if (accept) return bounded.filter((file) => isSupportedMediaFile(file).supported && acceptMatches({ mimeType: resolveUploadContentType(file), title: file.name }, accept));
  // Without an explicit accept, a drop inherits the Batch 3 upload MIME policy.
  return bounded.filter((file) => isSupportedMediaFile(file).supported);
}

export function dropMessage(files) {
  const list = Array.isArray(files) ? files : [];
  if (!list.length) return 'No supported files in that drop.';
  if (list.length === 1) return 'Drop to upload ' + list[0].name;
  return 'Drop ' + list.length + ' files to upload';
}

export function validDimensions({ width, height } = {}) {
  const w = Number(width);
  const h = Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  if (w > 100000 || h > 100000) return null;
  return { width: Math.round(w), height: Math.round(h) };
}

/** The media table has no display_name column: alt_text is the safe label. */
export function mediaLabelPayload(altText) {
  const value = typeof altText === 'string' ? altText.trim().slice(0, 300) : '';
  return { alt_text: value };
}

/* ------------------------------ keyboard save ----------------------------- */

export function keyboardSaveDecision({ key, ctrlKey, metaKey, loadState, dirty, savedTargets, hasOpenModal, busy } = {}) {
  if (String(key || '').toLowerCase() !== 's') return { action: 'ignore', reason: 'not-save-shortcut' };
  if (!ctrlKey && !metaKey) return { action: 'ignore', reason: 'modifier-required' };
  if (hasOpenModal) return { action: 'blocked', reason: 'modal-open' };
  if (busy) return { action: 'blocked', reason: 'busy' };
  if (loadState !== 'ready') return { action: 'blocked', reason: 'not-ready' };
  if (!dirty) return { action: 'blocked', reason: 'nothing-dirty' };
  const targets = Array.isArray(savedTargets) ? savedTargets : [];
  if (!targets.length) return { action: 'blocked', reason: 'no-target' };
  return { action: 'save', targets, reason: 'ok' };
}


