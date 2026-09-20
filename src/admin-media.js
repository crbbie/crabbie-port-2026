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
  MEDIA_DELETION_STATUS,
  MEDIA_DELETED_STATE,
  mediaDeletionStatus,
  nextMediaDeletionAction,
  applyMediaDeletionResult,
  isMissingStorageObject,
  findMediaUsage,
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

function publicUrlFor(path) {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
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
  const { data, error } = await supabase.from('media').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Media lookup failed: ${error.message}`);
  return data || null;
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

export async function uploadMediaFile(file, altText = '') {
  assertMediaMutationReady();
  if (!isConfigured || !supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const check = validateUploadFile(file);
  if (!check.valid) {
    throw new Error(check.error);
  }

  await requireAdminUser();

  const storagePath = `${UPLOAD_PREFIX}/${sanitizeStorageFileName(file.name)}`;

  const { error: uploadErr } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      // The bucket enforces the same MIME allowlist server-side.
      contentType: resolveUploadContentType(file)
    });

  if (uploadErr) {
    const isRls = uploadErr.message?.toLowerCase().includes('row-level security') ||
                  uploadErr.message?.toLowerCase().includes('policy') ||
                  uploadErr.message?.toLowerCase().includes('unauthorized') ||
                  uploadErr.statusCode === 403 ||
                  uploadErr.statusCode === '403';
    const isMime = uploadErr.message?.toLowerCase().includes('mime type');
    const prefix = isRls ? 'Storage upload failed (RLS / access denied)'
      : isMime ? 'Storage upload failed (unsupported file type)'
      : 'Storage upload failed';
    throw new Error(`${prefix}: ${uploadErr.message}`);
  }

  const { data: mediaRow, error: dbErr } = await supabase
    .from('media')
    .insert({
      bucket_id: MEDIA_BUCKET,
      storage_path: storagePath,
      original_name: file.name,
      mime_type: resolveUploadContentType(file),
      size_bytes: file.size,
      alt_text: altText || file.name
    })
    .select()
    .single();

  if (dbErr) {
    // Clean up the uploaded object when the database row cannot be created.
    try {
      await removeStorageObject(storagePath);
    } catch (_) {}
    const isRls = dbErr.message?.toLowerCase().includes('row-level security') ||
                  dbErr.message?.toLowerCase().includes('policy') ||
                  dbErr.code === '42501';
    const prefix = isRls ? 'Media record creation failed (RLS / access denied)' : 'Media record creation failed';
    throw new Error(`${prefix}: ${dbErr.message}`);
  }

  return formatMediaItem(mediaRow, publicUrlFor);
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
      // Saved AND draft references both block the destructive work.
      const usageState = adminState || currentAdminUsageState();
      if (!usageState) {
        return { success: false, error: 'Media usage could not be verified, so the file was not deleted. Reload the admin page and try again.' };
      }
      const usages = findMediaUsage(formatMediaItem(row, publicUrlFor), usageState);
      if (usages.length) {
        await writeMediaAudit(user, 'media_delete_blocked', { mediaId: row.id, storagePath: row.storage_path, details: { usageCount: usages.length, usages } });
        return { success: false, blocked: true, usages, error: mediaUsageMessage(usages) };
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
export async function listMediaFiles() {
  if (!isConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .eq('deletion_status', MEDIA_DELETION_STATUS.ACTIVE)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Media list failed: ${error.message}`);
    }
    if (!Array.isArray(data)) return [];

    return data.map((row) => formatMediaItem(row, publicUrlFor));
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
    findMediaUsage,
    formatMediaItem,
    formatFileSize,
    getMediaType,
    sanitizeStorageFileName
  };
}



