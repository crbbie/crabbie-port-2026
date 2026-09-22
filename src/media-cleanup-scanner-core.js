/**
 * media-cleanup-scanner-core.js
 * Pure read-only media scanner for Batch 2 (Storage & Cleanup overview).
 *
 * SAFETY PRINCIPLE: fail closed. If any source is missing, errored, or
 * partially paged, the scan reports INCOMPLETE and every unreferenced item is
 * UNKNOWN — never "unused", never "safe to delete". This module deletes
 * nothing and authorizes nothing.
 *
 * Identity: comparisons never use raw URLs. Every reference is reduced to the
 * canonical `bucket/normalized-path` identity (percent-decoding aware, so
 * `uploads/a b.png` and `uploads/a%20b.png` are the same object).
 *
 * No DOM, no Supabase access: the browser adapter (admin-cleanup.js) fetches
 * fully-paged data and feeds it here.
 */

export const CLEANUP_BUCKET = 'media';

/** DB page size for full-table scan loops (never "first 1000 and stop"). */
export const SCAN_DB_PAGE_SIZE = 500;

/** Storage list page size per prefix. */
export const SCAN_STORAGE_PAGE_SIZE = 100;

export const SCAN_STATUS = Object.freeze({
  COMPLETE: 'COMPLETE',
  INCOMPLETE: 'INCOMPLETE'
});

export const ROW_CLASSIFICATION = Object.freeze({
  IN_USE: 'IN USE',
  POSSIBLY_UNUSED: 'POSSIBLY UNUSED',
  PROTECTED: 'PROTECTED',
  UNKNOWN: 'UNKNOWN / INCOMPLETE'
});

/**
 * Reduce any stored value/URL to a canonical storage path.
 * Single percent-decode pass only (a literal `%20` in a filename must survive),
 * query/hash stripped, slashes normalized. Returns '' when unusable.
 */
export function canonicalizeStoragePath(raw, bucket = CLEANUP_BUCKET) {
  if (raw === null || raw === undefined) return '';
  let text = String(raw).trim();
  if (!text) return '';
  text = text.split('#')[0].split('?')[0].trim();
  if (!text) return '';
  const bucketPattern = new RegExp(
    '/storage/v1/(?:object|render/image)/(?:public|authenticated|sign)/' +
      String(bucket).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '/(.+)$'
  );
  const embedded = text.match(bucketPattern);
  if (embedded && embedded[1]) text = embedded[1].trim();
  try {
    text = decodeURIComponent(text);
  } catch (_) {
    // Keep the raw text: an undecodable string never becomes a false match.
  }
  text = text.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (!text || text === '.' || text === '..') return '';
  return text;
}

export function identityOf(bucket, canonicalPath) {
  return `${bucket || CLEANUP_BUCKET}/${canonicalPath}`;
}

/**
 * Candidate identities referenced by one source string.
 * Tier 1 (strong): an embedded Supabase Storage URL for our bucket.
 * Tier 2 (path-like): the whole trimmed string, or a bare `prefix/path`
 * token inside prose, when it starts with a known top-level prefix observed
 * in the real listing (e.g. `uploads/`). Tier-2 candidates only ever count
 * when they match a real media row or Storage object (see classifySnapshot),
 * so prose can neither force IN_USE nor spam broken references.
 */
export function extractCandidateIdentities(text, { bucket = CLEANUP_BUCKET, knownPrefixes = [] } = {}) {
  const out = [];
  const seen = new Set();
  const push = (identity, strong) => {
    const key = (strong ? 's:' : 'w:') + identity;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ identity, strong });
  };
  if (typeof text !== 'string') return out;
  const raw = text.trim();
  if (!raw) return out;
  const bucketPattern = new RegExp(
    '/storage/v1/(?:object|render/image)/(?:public|authenticated|sign)/' +
      String(bucket).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      '/([^?#\\s]+)',
    'g'
  );
  let match = null;
  while ((match = bucketPattern.exec(raw)) !== null) {
    const canonical = canonicalizeStoragePath(match[1], bucket);
    if (canonical) push(identityOf(bucket, canonical), true);
  }
  const whole = canonicalizeStoragePath(raw, bucket);
  if (whole && whole.includes('/') && knownPrefixes.includes(whole.split('/')[0])) {
    push(identityOf(bucket, whole), false);
  }
  // Bare `uploads/path/file.ext` tokens embedded in longer text (descriptions,
  // help text, answers). Trailing punctuation is not part of the path.
  const tokenPattern = /(^|[\s"'“”'(\[{<])((?:[A-Za-z0-9_@-]+\/)+[^\s"'“”'()\]{}<>]*[^\s"'“”'()\]{}<>.,;:!?])/g;
  let token = null;
  while ((token = tokenPattern.exec(raw)) !== null) {
    const canonical = canonicalizeStoragePath(token[2], bucket);
    if (!canonical || !canonical.includes('/')) continue;
    if (!knownPrefixes.includes(canonical.split('/')[0])) continue;
    const lastSegment = canonical.split('/').pop();
    if (!lastSegment || lastSegment.indexOf('.') === -1) continue;
    push(identityOf(bucket, canonical), false);
  }
  return out;
}

function walkDeep(value, visit, path) {
  if (typeof value === 'string') {
    visit(value, path || '');
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkDeep(entry, visit, (path ? path + '.' : '') + index));
    return;
  }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach((key) => {
      walkDeep(value[key], visit, path ? path + '.' + key : key);
    });
  }
}

/**
 * Loop a paged fetcher until a short page arrives.
 * fetchPage({ from, to, limit }) -> { rows: [] }. Any throw/short-circuit
 * marks the result incomplete (fail closed) while keeping partial rows.
 */
export async function collectAllPages(fetchPage, { pageSize = SCAN_DB_PAGE_SIZE, maxPages = 100000 } = {}) {
  const items = [];
  let page = 0;
  let complete = true;
  let error = null;
  while (page < maxPages) {
    let result = null;
    try {
      result = await fetchPage({ from: page * pageSize, to: page * pageSize + pageSize - 1, limit: pageSize, page });
    } catch (err) {
      complete = false;
      error = (err && err.message) || String(err);
      break;
    }
    const rows = result && Array.isArray(result.rows) ? result.rows : [];
    items.push(...rows);
    page += 1;
    if (rows.length < pageSize) break;
  }
  if (page >= maxPages) {
    complete = false;
    error = 'page cap reached before a short page';
  }
  return { items, complete, error, pagesFetched: page };
}

/**
 * Build the reference index over authoritative persisted sources.
 * sources: [{ key, label, data, complete, error }] — data is raw rows/objects.
 * Returns { index: Map identity -> hits[], urlBroken: [...], complete, reasons[] }.
 * Only Tier-1 (URL) candidates pointing at nothing known later become
 * BROKEN_REFERENCE; Tier-2 candidates only count when they match something
 * real, so prose can never manufacture a verdict.
 */
export function buildReferenceIndex(sources, { bucket = CLEANUP_BUCKET, knownPrefixes = [] } = {}) {
  const index = new Map();
  const urlCandidates = [];
  const reasons = [];
  let complete = true;
  (Array.isArray(sources) ? sources : []).forEach((source) => {
    if (!source || typeof source !== 'object') return;
    if (source.complete === false) {
      complete = false;
      reasons.push(`${source.label || source.key || 'source'}: ${source.error || 'incomplete'}`);
      // Partial data (if any) is still indexed below: fail-closed classification
      // uses the global `complete` flag, never per-row optimism.
    }
    const data = source.data;
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    rows.forEach((row, rowIndex) => {
      const recordId =
        (row && typeof row === 'object' && (row.slug || row.id || row.key)) || `row-${rowIndex}`;
      walkDeep(row, (text, fieldPath) => {
        const candidates = extractCandidateIdentities(text, { bucket, knownPrefixes });
        candidates.forEach(({ identity, strong }) => {
          if (!index.has(identity)) index.set(identity, []);
          index.get(identity).push({
            source: source.key || 'unknown',
            sourceLabel: source.label || source.key || 'unknown',
            recordId: String(recordId),
            fieldPath: fieldPath || '',
            strong
          });
          if (strong) {
            urlCandidates.push({
              identity,
              source: source.key || 'unknown',
              sourceLabel: source.label || source.key || 'unknown',
              recordId: String(recordId),
              fieldPath: fieldPath || ''
            });
          }
        });
      });
    });
  });
  return { index, urlCandidates, complete, reasons };
}

export function fingerprintObject({ bucket = CLEANUP_BUCKET, path = '', sizeBytes = null, updatedAt = null } = {}) {
  return `${bucket}/${path}|${sizeBytes === null || sizeBytes === undefined ? '' : sizeBytes}|${updatedAt || ''}`;
}

export function mediaGroupForMime(mime) {
  const type = typeof mime === 'string' ? mime.toLowerCase() : '';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'other';
}

/**
 * Classify one full snapshot. `storageComplete` covers the whole recursive
 * Storage walk (every prefix, every page); sourceComplete covers the DB side.
 * Anything short of both COMPLETE forces UNKNOWN for unreferenced items.
 */
export function classifySnapshot({
  bucket = CLEANUP_BUCKET,
  mediaRows = [],
  storageObjects = [],
  refIndex = new Map(),
  urlCandidates = [],
  statesByPath = {},
  sourceComplete = true,
  sourceReasons = [],
  storageComplete = true,
  storageError = null,
  nowIso = null
} = {}) {
  const reasons = [...(Array.isArray(sourceReasons) ? sourceReasons : [])];
  if (!storageComplete) reasons.push(`storage: ${storageError || 'incomplete listing'}`);
  const complete = sourceComplete === true && storageComplete === true;
  const status = complete ? SCAN_STATUS.COMPLETE : SCAN_STATUS.INCOMPLETE;

  const rows = Array.isArray(mediaRows) ? mediaRows : [];
  const objects = Array.isArray(storageObjects) ? storageObjects : [];
  const states = statesByPath && typeof statesByPath === 'object' ? statesByPath : {};

  const objectSet = new Set();
  const objectMeta = new Map();
  objects.forEach((entry) => {
    const canonical = canonicalizeStoragePath(entry && entry.path, bucket);
    if (!canonical) return;
    const identity = identityOf(bucket, canonical);
    objectSet.add(identity);
    if (!objectMeta.has(identity)) {
      objectMeta.set(identity, {
        path: canonical,
        sizeBytes: entry && entry.sizeBytes !== undefined ? entry.sizeBytes : null,
        updatedAt: (entry && entry.updatedAt) || null,
        mimeType: (entry && entry.mimeType) || null
      });
    }
  });

  const rowIdentities = new Set();
  rows.forEach((row) => {
    const canonical = canonicalizeStoragePath(row && row.storage_path, bucket);
    if (canonical) rowIdentities.add(identityOf(bucket, canonical));
  });

  const hitsFor = (identity) => refIndex instanceof Map ? refIndex.get(identity) || [] : [];
  const isProtected = (canonical) => Boolean(states[canonical] && states[canonical].protected === true);

  const rowResults = rows.map((row) => {
    const canonical = canonicalizeStoragePath(row && row.storage_path, bucket);
    const identity = canonical ? identityOf(bucket, canonical) : '';
    const references = identity ? hitsFor(identity) : [];
    let classification = ROW_CLASSIFICATION.UNKNOWN;
    if (canonical && isProtected(canonical)) classification = ROW_CLASSIFICATION.PROTECTED;
    else if (references.length > 0) classification = ROW_CLASSIFICATION.IN_USE;
    else if (complete) classification = ROW_CLASSIFICATION.POSSIBLY_UNUSED;
    return {
      id: (row && row.id) || null,
      storagePath: canonical,
      identity,
      originalName: (row && row.original_name) || canonical,
      mimeType: (row && row.mime_type) || null,
      sizeBytes: row && row.size_bytes !== undefined && row.size_bytes !== null ? Number(row.size_bytes) : null,
      deletionStatus: (row && row.deletion_status) || 'active',
      classification,
      references,
      state: (canonical && states[canonical]) || null
    };
  });

  // Rowless Storage objects: real bytes with no media row.
  const rowless = [];
  objectSet.forEach((identity) => {
    if (rowIdentities.has(identity)) return;
    const meta = objectMeta.get(identity) || {};
    const references = hitsFor(identity);
    let classification = ROW_CLASSIFICATION.UNKNOWN;
    if (isProtected(meta.path)) classification = ROW_CLASSIFICATION.PROTECTED;
    else if (references.length > 0) classification = ROW_CLASSIFICATION.IN_USE;
    else if (complete) classification = ROW_CLASSIFICATION.POSSIBLY_UNUSED;
    rowless.push({
      storagePath: meta.path,
      identity,
      sizeBytes: meta.sizeBytes,
      updatedAt: meta.updatedAt,
      classification,
      references,
      state: states[meta.path] || null
    });
  });

  // Broken references: explicit Storage URLs pointing at nothing known.
  const knownAll = new Set([...objectSet, ...rowIdentities]);
  const brokenMap = new Map();
  (Array.isArray(urlCandidates) ? urlCandidates : []).forEach((candidate) => {
    if (!candidate || knownAll.has(candidate.identity)) return;
    if (!brokenMap.has(candidate.identity)) brokenMap.set(candidate.identity, []);
    brokenMap.get(candidate.identity).push(candidate);
  });
  const brokenReferences = [...brokenMap.entries()].map(([identity, hits]) => ({ identity, hits }));

  // Missing objects: media rows whose bytes are gone from Storage.
  const missingObjects = rowResults
    .filter((entry) => entry.identity && !objectSet.has(entry.identity))
    .map((entry) => ({
      id: entry.id,
      storagePath: entry.storagePath,
      identity: entry.identity,
      originalName: entry.originalName,
      deletionStatus: entry.deletionStatus
    }));

  const pendingCleanup = rowResults.filter((entry) => entry.deletionStatus && entry.deletionStatus !== 'active');

  const possiblyUnusedRows = rowResults.filter((entry) => entry.classification === ROW_CLASSIFICATION.POSSIBLY_UNUSED);
  const possiblyUnusedRowless = rowless.filter((entry) => entry.classification === ROW_CLASSIFICATION.POSSIBLY_UNUSED);
  const protectedCount =
    rowResults.filter((entry) => entry.classification === ROW_CLASSIFICATION.PROTECTED).length +
    rowless.filter((entry) => entry.classification === ROW_CLASSIFICATION.PROTECTED).length;

  const bytesOf = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0);
  const knownBytes = rows.reduce((sum, row) => sum + bytesOf(row && row.size_bytes), 0);
  const bytesByGroup = { image: 0, video: 0, audio: 0, other: 0 };
  rows.forEach((row) => {
    bytesByGroup[mediaGroupForMime(row && row.mime_type)] += bytesOf(row && row.size_bytes);
  });
  const possiblyUnusedBytes =
    possiblyUnusedRows.reduce((sum, entry) => sum + bytesOf(entry.sizeBytes), 0) +
    possiblyUnusedRowless.reduce((sum, entry) => sum + bytesOf(entry.sizeBytes), 0);
  const topLargest = [...rowResults]
    .filter((entry) => bytesOf(entry.sizeBytes) > 0)
    .sort((a, b) => bytesOf(b.sizeBytes) - bytesOf(a.sizeBytes))
    .slice(0, 10)
    .map((entry) => ({
      id: entry.id,
      storagePath: entry.storagePath,
      originalName: entry.originalName,
      sizeBytes: Number(entry.sizeBytes),
      classification: entry.classification
    }));

  return {
    status,
    complete,
    reasons,
    scannedAt: nowIso || new Date().toISOString(),
    rows: rowResults,
    rowless,
    brokenReferences,
    missingObjects,
    pendingCleanup,
    metrics: {
      metadataCount: rows.length,
      knownBytes,
      // Metadata-known bytes only: rowless objects have no media row, so this
      // is NOT the real Supabase quota usage.
      bytesByGroup,
      topLargest,
      inUseCount: rowResults.filter((entry) => entry.classification === ROW_CLASSIFICATION.IN_USE).length,
      possiblyUnusedCount: possiblyUnusedRows.length + possiblyUnusedRowless.length,
      possiblyUnusedBytes,
      possiblyUnusedRows: possiblyUnusedRows.length,
      possiblyUnusedRowless: possiblyUnusedRowless.length,
      protectedCount,
      brokenCount: brokenReferences.length,
      rowlessCount: rowless.length,
      missingCount: missingObjects.length,
      pendingCount: pendingCleanup.length,
      storageObjectCount: objectSet.size
    }
  };
}

/**
 * Plan media_cleanup_state persistence after a COMPLETE scan only.
 * Unreferenced + unprotected identities keep their first anchor
 * (first_unreferenced_at); referenced ones clear it (candidate cancelled).
 * Returns { upserts, skipped } — the adapter applies the upserts.
 */
export function planStatePersistence({ snapshot, statesByPath = {}, nowIso = null } = {}) {
  if (!snapshot || snapshot.complete !== true) return { upserts: [], skipped: true };
  const now = nowIso || new Date().toISOString();
  const states = statesByPath && typeof statesByPath === 'object' ? statesByPath : {};
  const upserts = [];
  const consider = (storagePath, classification, meta) => {
    if (!storagePath) return;
    const existing = states[storagePath] || {};
    if (classification === ROW_CLASSIFICATION.POSSIBLY_UNUSED) {
      upserts.push({
        storage_path: storagePath,
        protected: existing.protected === true,
        first_unreferenced_at: existing.first_unreferenced_at || now,
        object_fingerprint: fingerprintObject({
          path: storagePath,
          sizeBytes: meta && meta.sizeBytes,
          updatedAt: meta && meta.updatedAt
        })
      });
    } else if (classification === ROW_CLASSIFICATION.IN_USE) {
      if (existing.first_unreferenced_at) {
        upserts.push({
          storage_path: storagePath,
          protected: existing.protected === true,
          first_unreferenced_at: null,
          object_fingerprint: fingerprintObject({
            path: storagePath,
            sizeBytes: meta && meta.sizeBytes,
            updatedAt: meta && meta.updatedAt
          })
        });
      }
    }
  };
  (snapshot.rows || []).forEach((entry) =>
    consider(entry.storagePath, entry.classification, { sizeBytes: entry.sizeBytes, updatedAt: null })
  );
  (snapshot.rowless || []).forEach((entry) =>
    consider(entry.storagePath, entry.classification, { sizeBytes: entry.sizeBytes, updatedAt: entry.updatedAt })
  );
  return { upserts, skipped: false };
}
