/**
 * admin-media-safety-core.js
 * Pure media-safety rules: reference detection, deletion state transitions,
 * storage error classification, audit payloads and integrity diagnostics.
 *
 * No DOM and no Supabase access: the browser adapter (admin-media.js) performs
 * the writes, this module decides what is safe.
 */

export const MEDIA_DELETION_STATUS = Object.freeze({
  ACTIVE: 'active',
  PENDING: 'pending',
  STORAGE_REMOVED: 'storage_removed'
});

// Client-side terminal marker: the database row is gone.
export const MEDIA_DELETED_STATE = 'deleted';

export const PORTFOLIO_MEDIA_FIELDS = Object.freeze([
  { field: 'thumbnail', label: 'Thumbnail' },
  { field: 'cover', label: 'Cover' }
]);

export const ASSET_MEDIA_FIELDS = Object.freeze([
  { field: 'thumbnail', label: 'Thumbnail' },
  { field: 'downloadUrl', label: 'Download file' },
  { field: 'media', label: 'Download file' },
  { field: 'driveUrl', label: 'Drive file' }
]);

export const COMMISSION_MEDIA_FIELDS = Object.freeze([
  { field: 'thumbnail', label: 'Thumbnail' }
]);

export const PAGE_MEDIA_FIELDS = Object.freeze([
  { field: 'profileImage', label: 'Profile image' }
]);

export const PEOPLE_MEDIA_FIELDS = Object.freeze([
  { field: 'avatar', label: 'Avatar' }
]);

export const SETTINGS_MEDIA_FIELDS = Object.freeze([
  { path: 'branding.logo', label: 'Branding logo' },
  { path: 'branding.heroMedia', label: 'Hero media' },
  { path: 'music.url', label: 'Music URL' },
  { path: 'seo.socialImage', label: 'Social image' },
  { path: 'theme.backgroundImage', label: 'Website background' }
]);

export function positiveLabel(count) {
  return count === 1 ? '1 place' : count + ' places';
}

/**
 * A reference matches when it is the media public URL, the bare storage path,
 * or any URL containing that unique storage path (signed/public variants).
 */
export function mediaReferenceMatches(value, media) {
  if (typeof value !== 'string') return false;
  const raw = value.trim();
  if (!raw || !media) return false;
  const path = typeof media.storagePath === 'string' ? media.storagePath.trim() : '';
  const url = typeof media.url === 'string' ? media.url.trim() : '';
  if (!path && !url) return false;
  if (url && raw === url) return true;
  if (path && raw.includes(path)) return true;
  return false;
}

function walkStrings(value, visit, path) {
  if (typeof value === 'string') {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkStrings(entry, visit, path + '[' + index + ']'));
    return;
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      walkStrings(value[key], visit, path ? path + '.' + key : key);
    });
  }
}

function recordKey(record, index) {
  if (!record || typeof record !== 'object') return 'record-' + index;
  return record.slug || record.id || 'record-' + index;
}

function recordName(record, index) {
  if (!record || typeof record !== 'object') return 'Record ' + (index + 1);
  return record.title || record.name || record.slug || record.id || 'Record ' + (index + 1);
}

function collectBlockUsage(entityType, entityId, entityName, blocks, media, usages) {
  if (!Array.isArray(blocks)) return;
  blocks.forEach((block, index) => {
    if (!block || typeof block !== 'object') return;
    walkStrings(block, (value, path) => {
      if (!mediaReferenceMatches(value, media)) return;
      usages.push({
        entityType,
        entityId,
        field: 'blocks[' + index + '].' + path,
        label: entityName + ' · block ' + (index + 1) + ' (' + (block.type || 'block') + ') ' + path
      });
    });
  });
}

function collectFieldUsage(entityType, entityId, record, entityName, fields, media, usages) {
  fields.forEach(({ field, label }) => {
    if (!mediaReferenceMatches(record ? record[field] : '', media)) return;
    usages.push({ entityType, entityId, field, label: entityName + ' · ' + label });
  });
}

function collectLinkArrayUsage(entityType, entityId, entityName, links, media, usages) {
  if (!Array.isArray(links)) return;
  links.forEach((link, index) => {
    if (!link || typeof link !== 'object') return;
    walkStrings(link, (value, path) => {
      if (!mediaReferenceMatches(value, media)) return;
      usages.push({
        entityType,
        entityId,
        field: 'externalLinks[' + index + '].' + path,
        label: entityName + ' · External link ' + (index + 1) + ' ' + path
      });
    });
  });
}

function collectListUsage(list, entityType, fields, media, usages) {
  if (!Array.isArray(list)) return;
  list.forEach((record, index) => {
    const name = recordName(record, index);
    collectFieldUsage(entityType, recordKey(record, index), record, name, fields, media, usages);
    if (!record || typeof record !== 'object') return;
    /* Asset preview galleries: every ordered row is a live reference, in the
       exact array order the editor authored. Walked generically so both URL
       and storage-path forms match. */
    if (entityType === 'assets' && Array.isArray(record.gallery)) {
      record.gallery.forEach((item, galleryIndex) => {
        if (!item || typeof item !== 'object') return;
        walkStrings(item, (value, path) => {
          if (!mediaReferenceMatches(value, media)) return;
          usages.push({
            entityType,
            entityId: recordKey(record, index),
            field: 'gallery[' + galleryIndex + '].' + path,
            label: name + ' · Preview ' + (galleryIndex + 1) + ' ' + path
          });
        });
      });
    }
    // Authoritative public URL references beyond fixed thumbnail/download
    // fields: portfolio externalLinks, portfolio link, asset driveUrl is
    // covered by fields above, page/about links arrays.
    if (Array.isArray(record.externalLinks)) collectLinkArrayUsage(entityType, recordKey(record, index), name, record.externalLinks, media, usages);
    if (Array.isArray(record.links)) collectLinkArrayUsage(entityType, recordKey(record, index), name, record.links, media, usages);
    if (typeof record.link === 'string' && mediaReferenceMatches(record.link, media)) {
      usages.push({ entityType, entityId: recordKey(record, index), field: 'link', label: name + ' · Link' });
    }
    if (entityType === 'portfolio') collectBlockUsage(entityType, recordKey(record, index), name, record.blocks, media, usages);
  });
}

function collectSettingsUsage(settings, media, usages) {
  if (!settings || typeof settings !== 'object') return;
  SETTINGS_MEDIA_FIELDS.forEach(({ path, label }) => {
    const value = path.split('.').reduce((carry, key) => (carry == null ? undefined : carry[key]), settings);
    if (!mediaReferenceMatches(value, media)) return;
    usages.push({ entityType: 'settings', entityId: path.split('.')[0], field: path, label: 'Site settings · ' + label });
  });
}

/**
 * Every place in the saved snapshot and the current draft that still points at
 * this media item. Both are inspected: an unsaved draft reference must block a
 * deletion exactly like a saved one.
 */
export function findMediaUsage(media, adminState) {
  const usages = [];
  if (!media) return usages;
  const state = adminState || {};
  [state.draft, state.saved].forEach((source) => {
    if (!source || typeof source !== 'object') return;
    collectListUsage(source.portfolio, 'portfolio', PORTFOLIO_MEDIA_FIELDS, media, usages);
    collectListUsage(source.assets, 'assets', ASSET_MEDIA_FIELDS, media, usages);
    collectListUsage(source.commissions, 'commissions', COMMISSION_MEDIA_FIELDS, media, usages);
    collectListUsage(source.people, 'people', PEOPLE_MEDIA_FIELDS, media, usages);
    if (source.pages && typeof source.pages === 'object') {
      Object.keys(source.pages).forEach((pageKey) => {
        const page = source.pages[pageKey];
        collectFieldUsage('pages', pageKey, page, 'Page · ' + pageKey, PAGE_MEDIA_FIELDS, media, usages);
        if (page && typeof page === 'object') {
          if (Array.isArray(page.links)) collectLinkArrayUsage('pages', pageKey, 'Page · ' + pageKey, page.links, media, usages);
          if (Array.isArray(page.externalLinks)) collectLinkArrayUsage('pages', pageKey, 'Page · ' + pageKey, page.externalLinks, media, usages);
        }
      });
    }
    collectSettingsUsage(source.settings, media, usages);
  });

  const seen = new Set();
  return usages.filter((usage) => {
    const key = usage.entityType + '|' + usage.entityId + '|' + usage.field;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function mediaUsageMessage(usages) {
  const list = Array.isArray(usages) ? usages : [];
  if (!list.length) return '';
  return 'This file is still used in ' + positiveLabel(list.length) + ' and cannot be deleted.';
}

/**
 * Authoritative cross-session guard (P0-02).
 * `bundle` is freshly fetched server state near delete time (raw DB rows /
 * values, not the session's stale snapshot). Any string that contains the
 * media storage path counts as a live reference — jsonb content included.
 * Returns matched reference descriptors (empty = unused). Pure, no I/O.
 */
export function findAuthoritativeMediaReferences(media, bundle) {
  const path = media && typeof media.storagePath === 'string' ? media.storagePath.trim() : '';
  const url = media && typeof media.url === 'string' ? media.url.trim() : '';
  if (!path && !url) return [];
  const hits = [];
  function scan(value, label) {
    if (typeof value === 'string') {
      if ((path && value.includes(path)) || (url && value === url)) {
        hits.push({ entityType: 'authoritative', entityId: label, field: label, label: 'Live database reference · ' + label });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => scan(entry, label + '[' + index + ']'));
      return;
    }
    if (value && typeof value === 'object') {
      Object.keys(value).forEach((key) => scan(value[key], label + '.' + key));
    }
  }
  const sources = bundle && typeof bundle === 'object' ? bundle : {};
  Object.keys(sources).forEach((key) => scan(sources[key], key));
  return hits;
}

/* -------------------------------------------------------------------------
 * Paged authoritative reads
 *   fetchPage({ from, to, page, pageSize }) -> array of rows (or { rows }).
 * Any throw, short page logic handled by the caller loop below; an error or
 * a hit maxPages cap resolves incomplete (fail closed) while keeping the
 * rows already collected. Callers must refuse deletion unless complete.
 * ---------------------------------------------------------------------- */

export async function collectPagedRows(fetchPage, { pageSize = 500, maxPages = 1000 } = {}) {
  const size = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 500;
  const cap = Number.isFinite(Number(maxPages)) && Number(maxPages) > 0 ? Math.floor(Number(maxPages)) : 1000;
  const rows = [];
  let page = 0;
  let complete = true;
  let error = null;
  while (page < cap) {
    let batch = null;
    try {
      const result = await fetchPage({ from: page * size, to: page * size + size - 1, page, pageSize: size });
      batch = Array.isArray(result) ? result : (result && Array.isArray(result.rows) ? result.rows : []);
    } catch (err) {
      complete = false;
      error = (err && err.message) || String(err);
      break;
    }
    rows.push(...batch);
    page += 1;
    if (batch.length < size) break;
  }
  if (page >= cap) {
    complete = false;
    error = error || 'page cap reached before a short page';
  }
  return { rows, complete, error, pagesFetched: page };
}

/* -------------------------------------------------------------------------
 * Deletion lifecycle
 *   active -> tombstone (pending) -> storage removed -> finalize (row gone)
 * Storage and Postgres are separate systems, so every step is recoverable.
 * ---------------------------------------------------------------------- */

export function mediaDeletionStatus(record) {
  const status = record && typeof record.deletion_status === 'string' ? record.deletion_status : MEDIA_DELETION_STATUS.ACTIVE;
  return Object.values(MEDIA_DELETION_STATUS).includes(status) ? status : MEDIA_DELETION_STATUS.ACTIVE;
}

export function nextMediaDeletionAction(record) {
  if (!record || !record.id) return 'invalid';
  const status = mediaDeletionStatus(record);
  if (status === MEDIA_DELETION_STATUS.ACTIVE) return 'tombstone';
  if (status === MEDIA_DELETION_STATUS.PENDING) return 'remove_storage';
  if (status === MEDIA_DELETION_STATUS.STORAGE_REMOVED) return 'finalize';
  return 'done';
}

/** Pure state transition: the input row is never mutated. */
export function applyMediaDeletionResult(record, result = {}) {
  const next = Object.assign({}, record || {});
  if (result.action === 'tombstone') {
    next.deletion_status = MEDIA_DELETION_STATUS.PENDING;
    next.deleted_at = next.deleted_at || result.at || new Date().toISOString();
    next.deletion_error = null;
    return next;
  }
  if (result.action === 'remove_storage') {
    next.deletion_status = result.storageRemoved ? MEDIA_DELETION_STATUS.STORAGE_REMOVED : MEDIA_DELETION_STATUS.PENDING;
    next.deletion_error = result.storageRemoved ? null : String(result.error || 'Storage removal failed.');
    return next;
  }
  if (result.action === 'finalize') {
    next.deletion_status = result.finalized ? MEDIA_DELETED_STATE : MEDIA_DELETION_STATUS.STORAGE_REMOVED;
    next.deletion_error = result.finalized ? null : String(result.error || 'Final database cleanup failed.');
    return next;
  }
  return next;
}

/** A storage removal that reports a missing object already reached its goal. */
export function isMissingStorageObject(error) {
  if (!error) return false;
  const message = String(error.message || error.error || error || '').toLowerCase();
  const status = String(error.statusCode || error.status || '');
  if (status === '404') return true;
  return /not found|does not exist|no such object|object not found/.test(message);
}

/* --------------------------- audit trail --------------------------------- */

export function buildMediaAuditEntry(action, fields = {}) {
  return {
    actor_id: fields.actorId || null,
    actor_email: fields.actorEmail || null,
    action,
    entity_type: fields.entityType || 'media',
    entity_id: fields.mediaId == null ? null : String(fields.mediaId),
    storage_path: fields.storagePath || null,
    details: fields.details && typeof fields.details === 'object' ? fields.details : {},
    created_at: fields.createdAt || new Date().toISOString()
  };
}

/* ------------------------ integrity diagnostics --------------------------- */

/**
 * Conservative, read-only integrity report.
 *   missingObjects: active row whose storage object is gone
 *   orphanObjects:  storage object that no media row references (candidate only)
 *   pendingCleanup: tombstone that still needs a retry (with object presence)
 * Nothing is deleted: the caller only reports.
 */
export function auditMediaIntegrity({ mediaRows = [], storagePaths = [] } = {}) {
  const rows = Array.isArray(mediaRows) ? mediaRows : [];
  const paths = (Array.isArray(storagePaths) ? storagePaths : []).map((path) => String(path || '')).filter(Boolean);
  const objectSet = new Set(paths);
  const knownPaths = new Set();

  const missingObjects = [];
  const pendingCleanup = [];
  rows.forEach((row) => {
    const path = typeof row.storage_path === 'string' ? row.storage_path : '';
    if (path) knownPaths.add(path);
    const status = mediaDeletionStatus(row);
    const present = Boolean(path) && objectSet.has(path);
    if (status === MEDIA_DELETION_STATUS.ACTIVE) {
      if (path && !present) missingObjects.push({ id: row.id, storagePath: path, title: row.original_name || path });
      return;
    }
    pendingCleanup.push({
      id: row.id,
      storagePath: path,
      status,
      error: row.deletion_error || null,
      storageObjectPresent: present
    });
  });

  const orphanObjects = paths.filter((path) => !knownPaths.has(path)).map((path) => ({ storagePath: path }));

  return { missingObjects, orphanObjects, pendingCleanup };
}


