import { supabase, isConfigured } from './supabase-client.js';
import {
  sanitizeStorageFileName,
  formatFileSize,
  getMediaType,
  formatMediaItem,
  validateUploadFile,
  resolveUploadContentType
} from './admin-media-core.js';
import {
  selectList,
  paginationRange,
  pagedSummary,
  mediaFilterSpec,
  MEDIA_PAGE_SIZE
} from './admin-query-core.js';
import {
  mediaQuerySpec,
  mediaTypeServerClauses,
  mediaLabelPayload,
  bulkMediaSummary
} from './admin-media-manager-core.js';
import { uploadMediaWithPipeline, toMediaItem } from './admin-media-upload.js';
import { uploadTaskLabel, classifyUploadFailure } from './admin-upload-core.js';
import {
  mediaMetadataRows,
  mediaFilterSummary,
  normalizeMediaView,
  MEDIA_VIEWS,
  MEDIA_TYPE_FILTERS,
  MEDIA_SORTS,
  previewDescriptor,
  previewKindFor,
  toggleSelection,
  selectionState,
  reconcilePageSelection,
  resolvePickerSelectedItems,
  createPickerMediaQuery,
  pickerResultFor,
  mediaTargetAccept,
  mediaItemMatchesTarget,
  mediaInputAccept,
  blockMediaFields,
  blockAcceptsMultiple,
  galleryItemsFor,
  acceptedDropFiles,
  dropMessage,
  bulkSummaryMessage,
  keyboardSaveDecision
} from './admin-media-manager-core.js';
import {
  MEDIA_DELETION_STATUS,
  MEDIA_DELETED_STATE,
  mediaDeletionStatus,
  nextMediaDeletionAction,
  applyMediaDeletionResult,
  isMissingStorageObject,
  findMediaUsage,
  findAuthoritativeMediaReferences,
  mediaUsageMessage,
  buildMediaAuditEntry,
  auditMediaIntegrity
} from './admin-media-safety-core.js';

const MEDIA_BUCKET = 'media';
const UPLOAD_PREFIX = 'uploads';

// Media upload/delete are admin database writes: when the CRUD boundary is
// available they must pass the same readiness gate as every other mutation.
function assertMediaMutationReady() {
  const crud = typeof window !== 'undefined' ? window.CrabbieAdminCrud : null;
  if (crud && typeof crud.assertAdminReadyForMutation === 'function') {
    crud.assertAdminReadyForMutation();
  }
}

/** The admin page exposes { saved, draft } so usage checks see both states. */
function currentAdminUsageState() {
  if (typeof window === 'undefined') return null;
  const provider = window.CrabbieAdminUsageProvider;
  if (typeof provider !== 'function') return null;
  try {
    const state = provider();
    return state && (state.saved || state.draft) ? state : null;
  } catch (err) {
    return null;
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

/** Best-effort audit trail: a logging failure never breaks the operation. */
async function writeMediaAudit(user, action, fields = {}) {
  try {
    const entry = buildMediaAuditEntry(action, Object.assign({
      actorId: user && user.id ? user.id : null,
      actorEmail: user && user.email ? user.email : null
    }, fields));
    const { error } = await supabase.from('admin_audit_log').insert(entry);
    if (error) console.warn('Media audit entry failed:', action, error.message);
  } catch (err) {
    console.warn('Media audit entry failed:', action, err && err.message);
  }
}

async function fetchMediaRow(id) {
  if (!id) return null;
  const { data, error } = await supabase.from('media').select(selectList('media')).eq('id', id).maybeSingle();
  if (error) throw new Error(`Media lookup failed: ${error.message}`);
  return data || null;
}

/**
 * P0-02 cross-session guard: re-read reference state from the server as close
 * to delete time as possible instead of trusting the session snapshot alone.
 * CMS reference tables are small config datasets (the same ones hydration
 * loads whole), so one bounded fetch per table is the authoritative check.
 * Fail-closed: when the fresh read fails, deletion is blocked.
 *
 * Residual race (documented, not atomic): Storage + Postgres have no joint
 * transaction, so a reference saved after this check but before the tombstone
 * can still slip through. The tombstone narrows the window to check->claim.
 */
async function fetchAuthoritativeReferenceBundle() {
  const [portfolio, assets, commissions, pages, settings] = await Promise.all([
    supabase.from('portfolio_projects').select('thumbnail_path, cover_path, content'),
    supabase.from('free_assets').select('thumbnail_path, file_path, metadata'),
    supabase.from('commission_services').select('thumbnail_path, details'),
    supabase.from('cms_pages').select('slug, data'),
    supabase.from('site_settings').select('key, value')
  ]);
  const failed = [portfolio, assets, commissions, pages, settings].find((res) => res && res.error);
  if (failed) throw new Error(`Media reference re-check failed: ${failed.error.message}`);
  return {
    portfolio_projects: (portfolio && portfolio.data) || [],
    free_assets: (assets && assets.data) || [],
    commission_services: (commissions && commissions.data) || [],
    cms_pages: (pages && pages.data) || [],
    site_settings: (settings && settings.data) || []
  };
}

async function markMediaTombstone(id) {
  const { data, error } = await supabase
    .from('media')
    .update({ deletion_status: MEDIA_DELETION_STATUS.PENDING, deleted_at: new Date().toISOString(), deletion_error: null })
    .eq('id', id)
    .eq('deletion_status', MEDIA_DELETION_STATUS.ACTIVE)
    .select('id, storage_path, original_name, deletion_status, deleted_at, deletion_error')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'This media record is no longer active, so nothing destructive was attempted.' };
  return { ok: true, row: data };
}

async function setMediaDeletionState(id, patch) {
  const { error } = await supabase.from('media').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function removeStorageObject(path) {
  if (!path) return { ok: true, skipped: true };
  try {
    const { data, error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
    if (error) {
      if (isMissingStorageObject(error)) return { ok: true, alreadyMissing: true };
      return { ok: false, error: `Storage delete failed: ${error.message}` };
    }
    return { ok: true, removed: Array.isArray(data) ? data.length : 0 };
  } catch (err) {
    if (isMissingStorageObject(err)) return { ok: true, alreadyMissing: true };
    return { ok: false, error: `Storage delete failed: ${err.message}` };
  }
}

async function finalizeMediaDeletion(id) {
  const { data, error } = await supabase.from('media').delete().eq('id', id).select('id');
  if (error) return { ok: false, error: error.message };
  const removed = Array.isArray(data) ? data.length : 0;
  if (!removed) return { ok: false, missing: true };
  return { ok: true };
}

/**
 * Recoverable lifecycle: active -> tombstone -> storage removed -> row gone.
 * Every step is resumable, so a failure never leaves an active row pointing at
 * a missing file and never silently returns a tombstone to active state.
 */
async function runMediaDeletionLifecycle(row, user) {
  let current = row;
  let action = nextMediaDeletionAction(current);
  if (action === 'invalid') return { success: false, error: 'Cannot delete media without an id.' };

  if (action === 'tombstone') {
    const tombstone = await markMediaTombstone(current.id);
    if (!tombstone.ok) {
      await writeMediaAudit(user, 'media_delete_failed', { mediaId: current.id, storagePath: current.storage_path, details: { step: 'tombstone', error: tombstone.error } });
      return { success: false, step: 'tombstone', error: `Media deletion was not started: ${tombstone.error}` };
    }
    current = tombstone.row;
    await writeMediaAudit(user, 'media_delete_requested', { mediaId: current.id, storagePath: current.storage_path, details: { deleted_at: current.deleted_at || null } });
    action = nextMediaDeletionAction(current);
  }

  if (action === 'remove_storage') {
    const removal = await removeStorageObject(current.storage_path);
    const next = applyMediaDeletionResult(current, { action: 'remove_storage', storageRemoved: removal.ok, error: removal.error });
    await setMediaDeletionState(current.id, { deletion_status: next.deletion_status, deletion_error: next.deletion_error });
    if (!removal.ok) {
      await writeMediaAudit(user, 'media_delete_failed', { mediaId: current.id, storagePath: current.storage_path, details: { step: 'storage', error: removal.error } });
      return { success: false, pending: true, status: next.deletion_status, error: removal.error };
    }
    current = next;
    await writeMediaAudit(user, 'media_storage_deleted', { mediaId: current.id, storagePath: current.storage_path, details: { alreadyMissing: Boolean(removal.alreadyMissing) } });
    action = nextMediaDeletionAction(current);
  }

  if (action === 'finalize') {
    const finalized = await finalizeMediaDeletion(current.id);
    if (!finalized.ok && !finalized.missing) {
      const next = applyMediaDeletionResult(current, { action: 'finalize', finalized: false, error: finalized.error });
      await setMediaDeletionState(current.id, { deletion_status: next.deletion_status, deletion_error: next.deletion_error });
      await writeMediaAudit(user, 'media_delete_failed', { mediaId: current.id, storagePath: current.storage_path, details: { step: 'finalize', error: next.deletion_error } });
      return { success: false, pending: true, status: next.deletion_status, error: next.deletion_error };
    }
    await writeMediaAudit(user, 'media_delete_finalized', { mediaId: current.id, storagePath: current.storage_path, details: { alreadyMissing: Boolean(finalized.missing) } });
    return { success: true, status: MEDIA_DELETED_STATE };
  }

  return { success: true, status: mediaDeletionStatus(current) };
}

export async function uploadMediaFile(file, altText = '', hooks = {}) {
  assertMediaMutationReady();
  if (!isConfigured || !supabase) {
    throw new Error('Supabase client is not configured.');
  }

  // Digest, dedupe, strategy split, retry/cancel and the media row all live in
  // the pipeline so both upload paths share one safety contract.
  await requireAdminUser();
  const result = await uploadMediaWithPipeline(file, { altText, hooks });

  return Object.assign({}, result.media, {
    deduplicated: Boolean(result.deduplicated),
    sha256: result.sha256 || null,
    task: result.task || null
  });
}

/**
 * Destructive media deletion with reference blocking and a recoverable
 * lifecycle. Returns { success, blocked, usages, pending, status, error }.
 */
export async function deleteMediaFile(id, storagePath, adminState) {
  assertMediaMutationReady();
  if (!isConfigured || !supabase) return { success: false, error: 'Not configured' };

  try {
    const user = await requireAdminUser();
    const row = (await fetchMediaRow(id)) || {
      id,
      storage_path: storagePath || '',
      original_name: storagePath || id,
      deletion_status: MEDIA_DELETION_STATUS.ACTIVE
    };

    if (mediaDeletionStatus(row) === MEDIA_DELETION_STATUS.ACTIVE) {
      // Saved AND draft references both block the destructive work. An unused
      // verdict must come from the authoritative saved snapshot: a draft-only
      // (or missing-saved) state can never prove a file is unreferenced.
      const usageState = adminState || currentAdminUsageState();
      if (!usageState || !usageState.saved) {
        return { success: false, error: 'Media usage could not be verified, so the file was not deleted. Reload the admin page and try again.' };
      }
      const usages = findMediaUsage(toMediaItem(row), usageState);
      if (usages.length) {
        await writeMediaAudit(user, 'media_delete_blocked', { mediaId: row.id, storagePath: row.storage_path, details: { usageCount: usages.length, usages } });
        return { success: false, blocked: true, usages, error: mediaUsageMessage(usages) };
      }
      // Cross-session re-check: another session may have saved a reference
      // after this session hydrated. Never delete on a stale snapshot alone.
      let authoritativeBundle = null;
      try {
        authoritativeBundle = await fetchAuthoritativeReferenceBundle();
      } catch (recheckErr) {
        return { success: false, error: 'Media usage could not be re-verified against the live database, so the file was not deleted. Reload and try again.' };
      }
      const freshUsages = findAuthoritativeMediaReferences(toMediaItem(row), authoritativeBundle);
      if (freshUsages.length) {
        await writeMediaAudit(user, 'media_delete_blocked', { mediaId: row.id, storagePath: row.storage_path, details: { usageCount: freshUsages.length, usages: freshUsages, source: 'authoritative' } });
        return { success: false, blocked: true, usages: freshUsages, error: mediaUsageMessage(freshUsages) };
      }
    }

    return await runMediaDeletionLifecycle(row, user);
  } catch (err) {
    console.warn('Failed to delete media file:', err && err.message);
    return { success: false, error: (err && err.message) || 'Media delete failed.' };
  }
}

/** Idempotent recovery for an incomplete deletion (storage or finalize step). */
export async function retryMediaDeletion(mediaId) {
  assertMediaMutationReady();
  if (!isConfigured || !supabase) return { success: false, error: 'Not configured' };
  if (!mediaId) return { success: false, error: 'A media id is required to retry a deletion.' };

  try {
    const user = await requireAdminUser();
    const row = await fetchMediaRow(mediaId);
    if (!row) return { success: true, status: MEDIA_DELETED_STATE, alreadyFinalized: true };
    if (mediaDeletionStatus(row) === MEDIA_DELETION_STATUS.ACTIVE) {
      return { success: false, error: 'This media file is still active, so there is no deletion to recover.' };
    }
    return await runMediaDeletionLifecycle(row, user);
  } catch (err) {
    return { success: false, error: (err && err.message) || 'Media deletion retry failed.' };
  }
}

/**
 * Display label (alt text) editing. The storage path stays immutable so CMS
 * URLs never break; media has no updated_at, so this is a scoped
 * last-write-wins update of the label only.
 */
export async function updateMediaAltText(id, altText) {
  assertMediaMutationReady();
  if (!isConfigured || !supabase) return { success: false, error: 'Not configured' };
  if (!id) return { success: false, error: 'A media id is required.' };

  try {
    await requireAdminUser();
    const { data, error } = await supabase
      .from('media')
      .update(mediaLabelPayload(altText))
      .eq('id', id)
      .eq('deletion_status', MEDIA_DELETION_STATUS.ACTIVE)
      .select(selectList('media'))
      .maybeSingle();
    if (error) return { success: false, error: 'Media label update failed: ' + error.message };
    if (!data) return { success: false, error: 'That media record is no longer active.' };
    return { success: true, item: toMediaItem(data) };
  } catch (err) {
    return { success: false, error: (err && err.message) || 'Media label update failed.' };
  }
}

/**
 * Bulk delete: every item goes through the Batch 3 lifecycle individually, so a
 * referenced file is blocked instead of silently destroyed. No raw storage
 * bulk-remove shortcut exists here on purpose.
 */
export async function bulkDeleteMedia(items, hooks = {}) {
  assertMediaMutationReady();
  const list = Array.isArray(items) ? items : [];
  const results = [];

  for (const entry of list) {
    const id = typeof entry === 'string' ? entry : (entry && entry.id);
    const title = (entry && entry.title) || id;
    let result;
    try {
      result = await deleteMediaFile(id, entry && entry.storagePath, hooks.usageState);
    } catch (err) {
      result = { success: false, error: (err && err.message) || 'Media delete failed.' };
    }
    results.push({ id, title, result });
    if (typeof hooks.onProgress === 'function') hooks.onProgress(results.slice(), bulkMediaSummary(results));
  }

  return { results, summary: bulkMediaSummary(results) };
}

/** Read-only integrity report. Never deletes or repairs anything. */
export async function diagnoseMediaIntegrity() {
  const empty = { missingObjects: [], orphanObjects: [], pendingCleanup: [] };
  if (!isConfigured || !supabase) return Object.assign({}, empty, { error: 'Not configured' });

  try {
    await requireAdminUser();
    const { data: rows, error } = await supabase
      .from('media')
      .select('id, storage_path, original_name, deletion_status, deletion_error, created_at');
    if (error) throw new Error(`Media rows failed: ${error.message}`);

    const listing = await supabase.storage.from(MEDIA_BUCKET).list(UPLOAD_PREFIX, { limit: 1000 });
    if (listing.error) throw new Error(`Storage listing failed: ${listing.error.message}`);
    const storagePaths = (listing.data || []).map((entry) => `${UPLOAD_PREFIX}/${entry.name}`);

    return auditMediaIntegrity({ mediaRows: rows || [], storagePaths });
  } catch (err) {
    return Object.assign({}, empty, { error: (err && err.message) || 'Media diagnostics failed.' });
  }
}

/** Normal library listing: only active media (tombstones stay hidden). */
/** One page of active media (never the whole library). */
/** One server-scoped page: filters, ordering and range all travel to Postgres. */
export async function loadMediaPage(options = {}) {
  const spec = mediaQuerySpec(options);
  const range = paginationRange(spec.page, spec.pageSize, MEDIA_PAGE_SIZE);
  const filter = mediaFilterSpec({ search: spec.search });

  let query = supabase
    .from('media')
    .select(selectList('media'), { count: 'exact' })
    .eq('deletion_status', filter.deletionStatus);

  if (spec.search) query = query.ilike('original_name', '%' + spec.search + '%');

  const clauses = mediaTypeServerClauses(spec.type);
  if (clauses.length) query = query.or(clauses.join(','));

  if (spec.from) query = query.gte('created_at', spec.from + 'T00:00:00.000Z');
  if (spec.to) query = query.lte('created_at', spec.to + 'T23:59:59.999Z');

  const order = spec.sort === 'name'
    ? { column: 'original_name', ascending: true }
    : { column: 'created_at', ascending: spec.sort === 'oldest' };

  const { data, error, count } = await query.order(order.column, { ascending: order.ascending }).range(range.from, range.to);
  if (error) throw new Error('Media load failed: ' + error.message);

  const items = (Array.isArray(data) ? data : []).map((row) => toMediaItem(row));
  return {
    dataset: 'media',
    items,
    count,
    spec,
    filters: filter,
    ...pagedSummary({ count, page: range.page, pageSize: range.pageSize })
  };
}

/** Convenience wrapper used by panels that only need the first page. */
export async function listMediaFiles(options = {}) {
  if (!isConfigured || !supabase) return [];
  try {
    const page = await loadMediaPage(options);
    return page.items;
  } catch (err) {
    console.warn('Failed to list media files:', err.message);
    return [];
  }
}

if (typeof window !== 'undefined') {
  window.CrabbieAdminMedia = {
    uploadMediaFile,
    deleteMediaFile,
    retryMediaDeletion,
    diagnoseMediaIntegrity,
    listMediaFiles,
    loadMediaPage,
    updateMediaAltText,
    bulkDeleteMedia,
    mediaQuerySpec,
    mediaMetadataRows,
    mediaFilterSummary,
    normalizeMediaView,
    MEDIA_VIEWS,
    MEDIA_TYPE_FILTERS,
    MEDIA_SORTS,
    previewDescriptor,
    previewKindFor,
    toggleSelection,
    selectionState,
    reconcilePageSelection,
    resolvePickerSelectedItems,
    createPickerMediaQuery,
    pickerResultFor,
    mediaTargetAccept,
    mediaItemMatchesTarget,
    mediaInputAccept,
    blockMediaFields,
    blockAcceptsMultiple,
    galleryItemsFor,
    acceptedDropFiles,
    dropMessage,
    bulkMediaSummary,
    bulkSummaryMessage,
    keyboardSaveDecision,
    uploadTaskLabel,
    classifyUploadFailure,
    findMediaUsage,
    formatMediaItem,
    formatFileSize,
    getMediaType,
    sanitizeStorageFileName
  };
}



