import { supabase, isConfigured } from './supabase-client.js';
import { selectList } from './admin-query-core.js';
import {
  collectAllPages,
  buildReferenceIndex,
  classifySnapshot,
  planStatePersistence,
  canonicalizeStoragePath,
  SCAN_DB_PAGE_SIZE,
  SCAN_STORAGE_PAGE_SIZE,
  CLEANUP_BUCKET
} from './media-cleanup-scanner-core.js';
import {
  PURGE_BATCH_LIMIT,
  PURGE_GRACE_DAYS_DEFAULT,
  evaluatePurgeEligibility,
  planPurgeBatch,
  nextPurgeStorageStep,
  nextPurgeFinalizeStep,
  summarizePurgeBatch
} from './media-purge-core.js';
import { fetchActiveUploadLeases } from './media-upload-leases.js';

const STATE_TABLE = 'media_cleanup_state';
const STATE_UPSERT_CHUNK = 100;

/**
 * admin-cleanup.js
 * Browser adapter for the Batch 2 read-only media scanner.
 * Fetches FULLY-PAGED authoritative data (every DB page, every Storage
 * prefix/page) and feeds it to the pure scanner core. Any fetch gap forces
 * INCOMPLETE (fail closed). Runs only when the admin presses Scan/Refresh:
 * no polling, no cron, no per-navigation scans.
 */

function assertCleanupReady() {
  const crud = typeof window !== 'undefined' ? window.CrabbieAdminCrud : null;
  if (crud && typeof crud.assertAdminReadyForMutation === 'function') {
    crud.assertAdminReadyForMutation();
  }
}

async function requireAdminUser() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in. You must be signed in as admin.');
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData?.user) throw new Error('Your session has expired. Please sign in again.');
  if (userData.user.app_metadata?.role !== 'admin') throw new Error('Access denied. Admin privileges are required.');
  return userData.user;
}

const TABLE_SOURCES = [
  { key: 'portfolio_projects', label: 'Portfolio', orderBy: 'created_at', columns: 'id,slug,title,description,tags,content,thumbnail_path,cover_path,featured,published,sort_order,updated_at,created_at' },
  { key: 'free_assets', label: 'Assets', orderBy: 'created_at', columns: 'id,slug,title,description,metadata,thumbnail_path,file_path,file_type,availability,featured,published,sort_order,updated_at,created_at' },
  { key: 'commission_services', label: 'Services', orderBy: 'created_at', columns: 'id,slug,title,description,price,currency,availability,form_slug,thumbnail_path,featured,published,sort_order,details,translations,updated_at,created_at' },
  { key: 'commission_forms', label: 'Forms', orderBy: 'created_at', columns: 'id,slug,title,description,fields,published,translations,updated_at,created_at' },
  // ALL lifecycle states: archived/trashed requests still count as references.
  { key: 'commission_requests', label: 'Requests', orderBy: 'created_at', columns: 'id,client_name,contact,answers,status,archived_at,deleted_at,created_at' },
  { key: 'cms_pages', label: 'Pages', orderBy: 'slug', columns: 'id,slug,title,content,published,data,translations,updated_at' },
  { key: 'cms_navigation', label: 'Navigation', orderBy: 'sort_order', columns: 'id,title,url,published,sort_order,updated_at' },
  { key: 'site_settings', label: 'Settings', orderBy: 'key', columns: 'key,value,updated_at' }
];

function tablePageFetcher(table, columns, orderBy) {
  return async ({ from, to }) => {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    return { rows: Array.isArray(data) ? data : [] };
  };
}

async function fetchMediaRows() {
  const columns = selectList('media');
  return collectAllPages(
    async ({ from, to }) => {
      const { data, error } = await supabase
        .from('media')
        .select(columns)
        .order('created_at', { ascending: true })
        .range(from, to);
      if (error) throw new Error(`media: ${error.message}`);
      return { rows: Array.isArray(data) ? data : [] };
    },
    { pageSize: SCAN_DB_PAGE_SIZE }
  );
}

/**
 * Recursive Storage walk: every prefix (nested included), every page.
 * A folder entry is a listing row without an object id.
 */
async function listStorageRecursive() {
  const objects = [];
  const prefixes = [''];
  const seenPrefixes = new Set(['']);
  let complete = true;
  let error = null;
  const failures = [];
  let iterations = 0;
  const MAX_LIST_ITERATIONS = 10000;
  while (prefixes.length) {
    const prefix = prefixes.shift();
    let offset = 0;
    for (;;) {
      iterations += 1;
      if (iterations > MAX_LIST_ITERATIONS) {
        complete = false;
        error = 'storage page cap reached before the walk finished';
        failures.push(error);
        break;
      }
      let listing = null;
      try {
        listing = await supabase.storage.from(CLEANUP_BUCKET).list(prefix || '', {
          limit: SCAN_STORAGE_PAGE_SIZE,
          offset,
          sortBy: { column: 'name', order: 'asc' }
        });
      } catch (err) {
        complete = false;
        error = (err && err.message) || String(err);
        failures.push(`${prefix || '/'}: ${error}`);
        break;
      }
      if (listing.error) {
        complete = false;
        error = listing.error.message;
        failures.push(`${prefix || '/'}: ${listing.error.message}`);
        break;
      }
      const entries = Array.isArray(listing.data) ? listing.data : [];
      entries.forEach((entry) => {
        if (!entry || !entry.name) return;
        // Real Storage entries carry names relative to the listed prefix;
        // test doubles may carry the bucket-relative path instead.
        const fullPath = entry.path || (prefix ? `${prefix}/${entry.name}` : entry.name);
        if (entry.id === null || entry.id === undefined) {
          const sub = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (!seenPrefixes.has(sub)) {
            seenPrefixes.add(sub);
            prefixes.push(sub);
          }
          return;
        }
        objects.push({
          path: fullPath,
          sizeBytes:
            entry.metadata && entry.metadata.size !== undefined && entry.metadata.size !== null
              ? Number(entry.metadata.size)
              : null,
          updatedAt: entry.updated_at || entry.created_at || null,
          mimeType: (entry.metadata && entry.metadata.mimetype) || null
        });
      });
      if (entries.length < SCAN_STORAGE_PAGE_SIZE) break;
      offset += SCAN_STORAGE_PAGE_SIZE;
    }
    if (!complete && failures.length > 8) break;
    if (error === 'storage page cap reached before the walk finished') break;
  }
  return { objects, complete, error: failures.length ? failures.slice(0, 8).join('; ') : error, prefixesWalked: seenPrefixes.size };
}

async function fetchCleanupStates() {
  try {
    const { data, error } = await supabase
      .from(STATE_TABLE)
      .select('storage_path,protected,first_unreferenced_at,object_fingerprint,unreferenced_scan_count,purge_claimed_at,purge_claimed_by');
    if (error) throw new Error(error.message);
    const statesByPath = {};
    (Array.isArray(data) ? data : []).forEach((row) => {
      if (row && row.storage_path) statesByPath[row.storage_path] = row;
    });
    return { statesByPath, complete: true, error: null };
  } catch (err) {
    // Protected state unknown -> the whole scan must stay INCOMPLETE.
    return { statesByPath: {}, complete: false, error: (err && err.message) || String(err) };
  }
}

async function persistCleanupStates(upserts) {
  for (let i = 0; i < upserts.length; i += STATE_UPSERT_CHUNK) {
    const chunk = upserts.slice(i, i + STATE_UPSERT_CHUNK);
    const { error } = await supabase.from(STATE_TABLE).upsert(chunk, { onConflict: 'storage_path' });
    if (error) throw new Error(error.message);
  }
}

/**
 * Full manual scan. Returns { snapshot, sourceSummary, statePersisted,
 * statePersistError, requestCounts }. Throws only when the admin session or
 * configuration itself is unusable; data gaps are reported INCOMPLETE.
 */
export async function runCleanupScan() {
  if (!isConfigured || !supabase) throw new Error('Supabase is not configured.');
  assertCleanupReady();
  await requireAdminUser();

  const sourceSummary = [];
  const sources = [];
  for (const spec of TABLE_SOURCES) {
    const paged = await collectAllPages(tablePageFetcher(spec.table || spec.key, spec.columns, spec.orderBy), {
      pageSize: SCAN_DB_PAGE_SIZE
    });
    sources.push({ key: spec.key, label: spec.label, data: paged.items, complete: paged.complete, error: paged.error });
    sourceSummary.push({ key: spec.key, label: spec.label, rows: paged.items.length, complete: paged.complete, error: paged.error });
  }

  const mediaPaged = await fetchMediaRows();
  sourceSummary.push({ key: 'media', label: 'Media rows', rows: mediaPaged.items.length, complete: mediaPaged.complete, error: mediaPaged.error });

  const storage = await listStorageRecursive();

  const knownPrefixes = [];
  storage.objects.forEach((entry) => {
    const canonical = canonicalizeStoragePath(entry.path, CLEANUP_BUCKET);
    if (!canonical) return;
    const top = canonical.split('/')[0];
    if (top && !knownPrefixes.includes(top)) knownPrefixes.push(top);
  });

  const built = buildReferenceIndex(sources, { bucket: CLEANUP_BUCKET, knownPrefixes });
  const states = await fetchCleanupStates();
  const leases = await fetchActiveUploadLeases();

  const sourceComplete =
    built.complete && mediaPaged.complete && states.complete && leases.complete;
  const sourceReasons = [...built.reasons];
  if (!mediaPaged.complete) sourceReasons.push(`Media rows: ${mediaPaged.error || 'incomplete'}`);
  if (!states.complete) sourceReasons.push(`Cleanup state: ${states.error || 'unreadable'}`);
  if (!leases.complete) sourceReasons.push(`Upload leases: ${leases.error || 'unreadable'}`);

  const snapshot = classifySnapshot({
    bucket: CLEANUP_BUCKET,
    mediaRows: mediaPaged.items,
    storageObjects: storage.objects,
    refIndex: built.index,
    urlCandidates: built.urlCandidates,
    statesByPath: states.statesByPath,
    sourceComplete,
    sourceReasons,
    storageComplete: storage.complete,
    storageError: storage.error,
    nowIso: new Date().toISOString()
  });

  let statePersisted = false;
  let statePersistError = null;
  if (snapshot.complete) {
    try {
      const planned = planStatePersistence({ snapshot, statesByPath: states.statesByPath, nowIso: snapshot.scannedAt });
      if (!planned.skipped && planned.upserts.length) await persistCleanupStates(planned.upserts);
      statePersisted = true;
    } catch (err) {
      statePersistError = (err && err.message) || String(err);
    }
  }

  let requestCounts = {};
  try {
    const crud = typeof window !== 'undefined' ? window.CrabbieAdminCrud : null;
    if (crud && typeof crud.countRequestLifecycles === 'function') {
      requestCounts = (await crud.countRequestLifecycles()) || {};
    }
  } catch (err) {
    requestCounts = { error: (err && err.message) || String(err) };
  }

  return {
    snapshot,
    sourceSummary,
    storagePrefixesWalked: storage.prefixesWalked,
    storageObjectCount: storage.objects.length,
    statePersisted,
    statePersistError,
    requestCounts,
    leasesByPath: leases.leasesByPath,
    leasesComplete: leases.complete
  };
}

/** Admin Protected toggle for one storage path (manual, single record). */
export async function setCleanupProtected(storagePath, isProtected) {
  if (!isConfigured || !supabase) throw new Error('Supabase is not configured.');
  assertCleanupReady();
  await requireAdminUser();
  const canonical = canonicalizeStoragePath(storagePath, CLEANUP_BUCKET);
  if (!canonical) throw new Error('A storage path is required.');
  const { data: existing } = await supabase.from(STATE_TABLE).select('storage_path,protected,first_unreferenced_at,object_fingerprint,unreferenced_scan_count').eq('storage_path', canonical).maybeSingle();
  const { error } = await supabase.from(STATE_TABLE).upsert(
    {
      storage_path: canonical,
      protected: isProtected === true,
      first_unreferenced_at: existing ? existing.first_unreferenced_at : null,
      object_fingerprint: existing ? existing.object_fingerprint : null,
      unreferenced_scan_count: existing ? existing.unreferenced_scan_count || 0 : 0
    },
    { onConflict: 'storage_path' }
  );
  if (error) throw new Error(`Protect update failed: ${error.message}`);
  return { success: true, storagePath: canonical, protected: isProtected === true };
}

/**
 * Indicative eligibility for the candidates of a finished scan (the purge
 * itself always re-verifies against fresh state). Returns per-path verdicts.
 */
export function describePurgeEligibility({ snapshot = null, leasesByPath = {}, nowMs = null } = {}) {
  const now = nowMs === null || nowMs === undefined ? Date.now() : Number(nowMs);
  const out = [];
  if (!snapshot) return out;
  const entries = [...(snapshot.rows || []), ...(snapshot.rowless || [])];
  entries.forEach((entry) => {
    if (!entry || !entry.storagePath) return;
    const verdict = evaluatePurgeEligibility({
      entry: {
        storagePath: entry.storagePath,
        classification: entry.classification,
        sizeBytes: entry.sizeBytes ?? null,
        updatedAt: entry.updatedAt || null
      },
      snapshotComplete: snapshot.complete === true,
      state: entry.state || null,
      leasesByPath,
      nowMs: now
    });
    out.push({
      storagePath: entry.storagePath,
      mediaId: entry.id || null,
      sizeBytes: entry.sizeBytes ?? null,
      eligible: verdict.eligible,
      reasons: verdict.reasons,
      graceEligibleAt: verdict.graceEligibleAt || null
    });
  });
  return out;
}

async function clearPurgeClaim(storagePath) {
  try {
    await supabase.from(STATE_TABLE).update({ purge_claimed_at: null, purge_claimed_by: null }).eq('storage_path', storagePath);
  } catch (_) {
    // Best-effort: an expired/orphan claim never blocks a future retry forever
    // because every purge re-verifies and re-claims first.
  }
}

/**
 * Batch 3 manual purge. Flow per path (max 25/batch, sequential):
 *   fresh scan -> eligibility re-check -> claim -> Storage remove ->
 *   metadata finalize -> state cleanup.
 * Any uncertainty blocks that path with a retryable reason; partial batch
 * results reconcile per record. Storage bytes go through the Storage API
 * only; the media row (when one exists) is deleted after the bytes are gone.
 */
export async function runMediaPurge(storagePaths = []) {
  if (!isConfigured || !supabase) throw new Error('Supabase is not configured.');
  assertCleanupReady();
  const user = await requireAdminUser();

  const wanted = [...new Set((Array.isArray(storagePaths) ? storagePaths : []).map((path) => canonicalizeStoragePath(path, CLEANUP_BUCKET)).filter(Boolean))];
  const batch = wanted.slice(0, PURGE_BATCH_LIMIT);
  const skipped = wanted.length - batch.length;
  const nowMs = Date.now();

  // Authoritative fresh state FIRST: a reference added since the last scan
  // (session B while session A cleans up) must block the purge.
  const fresh = await runCleanupScan();
  if (!fresh.snapshot || fresh.snapshot.complete !== true) {
    return {
      results: batch.map((storagePath) => ({ storagePath, success: false, error: 'fresh re-scan is incomplete; purge refused', retryable: true })),
      summary: summarizePurgeBatch(batch.map((storagePath) => ({ storagePath, success: false }))),
      skipped,
      rescannedAt: (fresh.snapshot && fresh.snapshot.scannedAt) || null
    };
  }
  const freshByPath = new Map();
  [...(fresh.snapshot.rows || []), ...(fresh.snapshot.rowless || [])].forEach((entry) => {
    if (entry && entry.storagePath) freshByPath.set(entry.storagePath, entry);
  });

  const results = [];
  for (const storagePath of batch) {
    const fail = (error, retryable = true) => ({ storagePath, success: false, error, retryable });
    try {
      const entry = freshByPath.get(storagePath);
      if (!entry) {
        results.push(fail('path not found in the fresh scan; it may already be gone', true));
        continue;
      }
      const verdict = evaluatePurgeEligibility({
        entry: {
          storagePath: entry.storagePath,
          classification: entry.classification,
          sizeBytes: entry.sizeBytes ?? null,
          updatedAt: entry.updatedAt || null
        },
        snapshotComplete: true,
        state: entry.state || null,
        leasesByPath: fresh.leasesByPath || {},
        nowMs
      });
      if (!verdict.eligible) {
        results.push(fail(`blocked: ${(verdict.reasons || []).join(', ') || 'ineligible'}`, true));
        continue;
      }
      // Claim with fingerprint guard: a changed row matches zero rows.
      const claim = await supabase
        .from(STATE_TABLE)
        .update({ purge_claimed_at: new Date(nowMs).toISOString(), purge_claimed_by: user.id || null })
        .eq('storage_path', storagePath)
        .eq('object_fingerprint', verdict.fingerprint)
        .select('storage_path');
      if (claim.error) {
        results.push(fail(`claim failed: ${claim.error.message}`, true));
        continue;
      }
      if (!claim.data || !claim.data.length) {
        results.push(fail('state changed under this purge; rescan and retry', true));
        continue;
      }
      // Storage remove (never SQL on storage.objects).
      const removal = await supabase.storage.from(CLEANUP_BUCKET).remove([storagePath]);
      const step = nextPurgeStorageStep({ storagePath, removeError: removal.error || null });
      if (step.phase !== 'storage_removed') {
        await clearPurgeClaim(storagePath);
        results.push(fail(`storage remove failed: ${step.error}`, step.retryable));
        continue;
      }
      // Metadata finalize: delete the media row when one exists. An
      // already-gone row is success (idempotent retry).
      let finalizeError = null;
      let rowMissing = !entry.id;
      if (entry.id) {
        const del = await supabase.from('media').delete().eq('id', entry.id).select('id');
        if (del.error) {
          finalizeError = del.error;
        } else if (!del.data || !del.data.length) {
          const recheck = await supabase.from('media').select('id').eq('id', entry.id).maybeSingle();
          rowMissing = !recheck.data;
          if (!rowMissing) finalizeError = new Error('media row changed under this purge');
        }
      }
      const fin = nextPurgeFinalizeStep({ storagePath, finalizeError, rowMissing });
      if (fin.phase !== 'finalized') {
        results.push(fail(`metadata finalize failed: ${fin.error}`, fin.retryable));
        continue;
      }
      // State cleanup: the anchor is meaningless once the bytes are gone.
      // A leftover state row is cosmetic and never blocks anything, so its
      // failure only warns.
      let stateWarning = null;
      try {
        const wiped = await supabase.from(STATE_TABLE).delete().eq('storage_path', storagePath);
        if (wiped.error) stateWarning = wiped.error.message;
      } catch (err) {
        stateWarning = (err && err.message) || String(err);
      }
      results.push({ storagePath, success: true, alreadyMissing: Boolean(step.alreadyMissing), stateWarning });
    } catch (err) {
      results.push(fail((err && err.message) || String(err), true));
    }
  }

  return { results, summary: summarizePurgeBatch(results), skipped, rescannedAt: fresh.snapshot.scannedAt };
}

if (typeof window !== 'undefined') {
  window.CrabbieAdminCleanup = {
    runCleanupScan,
    setCleanupProtected,
    runMediaPurge,
    describePurgeEligibility,
    purgeLimits: { batch: PURGE_BATCH_LIMIT, graceDays: PURGE_GRACE_DAYS_DEFAULT }
  };
}
