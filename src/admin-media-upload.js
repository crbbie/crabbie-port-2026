import { supabase } from './supabase-client.js';
import {
  sanitizeStorageFileName,
  validateUploadFile,
  resolveUploadContentType,
  formatMediaItem,
  canUseThumbnail,
  THUMBNAIL_TRANSFORM
} from './admin-media-core.js';
import {
  chooseUploadStrategy,
  createUploadTask,
  reduceUploadTask,
  isRetryableUploadError,
  classifyUploadFailure,
  retryDelayMs,
  MAX_UPLOAD_RETRIES,
  UPLOAD_CACHE_CONTROL,
  dedupeDecision,
  mediaRowPayload,
  sha256Hex
} from './admin-upload-core.js';
import { selectList } from './admin-query-core.js';

const MEDIA_BUCKET = 'media';
const UPLOAD_PREFIX = 'uploads';
const RESUMABLE_ENDPOINT = '/storage/v1/upload/resumable';
const TUS_CDN_URL = 'https://cdn.jsdelivr.net/npm/tus-js-client@4/+esm';

export function mediaUrlFor(path) {
  if (!supabase || !path) return '';
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Image Transformations URL for the same object (never a stored derivative). */
export function mediaThumbnailUrlFor(path, transform) {
  if (!supabase || !path) return '';
  try {
    const options = transform ? { transform } : { transform: THUMBNAIL_TRANSFORM };
    return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path, options).data.publicUrl;
  } catch (err) {
    return '';
  }
}

export function toMediaItem(row) {
  // formatMediaItem decides internally when a thumbnail is safe (raster + big enough).
  return formatMediaItem(row, mediaUrlFor, mediaThumbnailUrlFor);
}

export function isUniqueViolation(error) {
  if (!error) return false;
  return error.code === '23505' || /duplicate key|unique constraint/i.test(String(error.message || ''));
}

/**
 * Resumable client loader. Injected clients win, so tests and preloaded
 * bundles never need the network; the CDN import is the production fallback.
 */
export async function resolveTusClient() {
  if (typeof window !== 'undefined') {
    if (window.CrabbieTusClient) return window.CrabbieTusClient;
    if (typeof window.CrabbieTusLoader === 'function') {
      try {
        return await window.CrabbieTusLoader();
      } catch (err) {
        return null;
      }
    }
  }
  if (typeof window === 'undefined') return null;
  try {
    const mod = await import(/* @vite-ignore */ TUS_CDN_URL);
    return mod && mod.Upload ? mod : (mod && mod.default ? mod.default : null);
  } catch (err) {
    return null;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cancelledError() {
  const error = new Error('Upload cancelled');
  error.name = 'UploadCancelled';
  return error;
}

/** Active-only digest lookup: tombstones never block re-uploading artwork. */
export async function findActiveMediaByDigest(digest) {
  if (!digest) return null;
  const { data, error } = await supabase
    .from('media')
    .select(selectList('media'))
    .eq('sha256', digest)
    .eq('deletion_status', 'active')
    .maybeSingle();
  if (error) {
    console.warn('Duplicate media lookup failed:', error.message);
    return null;
  }
  return data || null;
}

async function insertMediaRow(payload) {
  const { data, error } = await supabase
    .from('media')
    .insert(payload)
    .select(selectList('media'))
    .single();
  if (error) return { ok: false, error };
  return { ok: true, row: data };
}

/** Standard upload for small files, with bounded retry on transient failures. */
async function standardUpload(path, file, contentType, state) {
  let attempt = 0;
  for (;;) {
    if (state.controller.cancelled) return { ok: false, cancelled: true };
    attempt += 1;
    try {
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, { cacheControl: UPLOAD_CACHE_CONTROL, upsert: false, contentType });
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      const retryable = isRetryableUploadError(err);
      if (!retryable || attempt > MAX_UPLOAD_RETRIES) return { ok: false, error: err };
      state.replace(reduceUploadTask(state.task, { type: 'retry', attempt, error: err }));
      await delay(retryDelayMs(attempt));
      state.replace(reduceUploadTask(state.task, { type: 'start' }));
    }
  }
}

/**
 * Resumable (TUS) upload for large files. Supabase's supported endpoint keeps
 * the authenticated Storage policies in force: the session token is sent as a
 * request header, never as a service key.
 */
async function resumableUpload(path, file, contentType, state) {
  const tus = await resolveTusClient();
  if (!tus || typeof tus.Upload !== 'function') return { ok: false, unavailable: true };

  const { data: { session } } = await supabase.auth.getSession();
  const projectUrl = String(supabase.supabaseUrl || '').replace(/\/$/, '');
  if (!projectUrl || !session || !session.access_token) return { ok: false, unavailable: true };

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const upload = new tus.Upload(file, {
      endpoint: projectUrl + RESUMABLE_ENDPOINT,
      retryDelays: [0, 1000, 3000, 8000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: 'Bearer ' + session.access_token,
        'x-upsert': 'false'
      },
      metadata: {
        bucketName: MEDIA_BUCKET,
        objectName: path,
        contentType,
        cacheControl: UPLOAD_CACHE_CONTROL
      },
      onProgress: (sent, total) => {
        state.replace(reduceUploadTask(state.task, { type: 'progress', loaded: sent, total }));
        if (state.controller.cancelled) {
          try { upload.abort(); } catch (_) {}
        }
      },
      onSuccess: () => finish({ ok: true }),
      onError: (error) => finish({ ok: false, error })
    });

    state.controller.abort = () => {
      try { upload.abort(); } catch (_) {}
    };

    try {
      const previous = typeof upload.findPreviousUploads === 'function' ? upload.findPreviousUploads() : null;
      if (previous && typeof previous.then === 'function') {
        previous
          .then((list) => {
            if (list && list.length && typeof upload.resumeFromPreviousUpload === 'function') {
              upload.resumeFromPreviousUpload(list[0]);
            }
            upload.start();
          })
          .catch(() => upload.start());
      } else {
        upload.start();
      }
    } catch (err) {
      finish({ ok: false, error: err });
    }
  });
}

/**
 * Full upload pipeline.
 *   validate -> digest -> dedupe -> (standard | resumable) -> media row
 * The media row is only created once Storage confirmed the object, and the
 * object is rolled back when the row cannot be created (Batch 3 behaviour).
 */
export async function uploadMediaWithPipeline(file, options = {}) {
  const hooks = options.hooks || {};
  const altText = options.altText || '';
  const controller = { cancelled: false, abort: null };

  if (typeof hooks.onCancelReady === 'function') {
    hooks.onCancelReady(() => {
      controller.cancelled = true;
      if (typeof controller.abort === 'function') {
        try { controller.abort(); } catch (_) {}
      }
    });
  }

  // 1. Batch 3 validation applies to BOTH upload paths.
  const check = validateUploadFile(file);
  if (!check.valid) throw new Error(check.error);

  const strategy = chooseUploadStrategy(file);
  const contentType = resolveUploadContentType(file);
  const storagePath = `${UPLOAD_PREFIX}/${sanitizeStorageFileName(file.name)}`;

  const state = {
    task: createUploadTask({ id: storagePath, fileName: file.name, size: file.size, strategy }),
    controller,
    replace(next) {
      state.task = next;
      if (typeof hooks.onTask === 'function') hooks.onTask(next);
    }
  };
  state.replace(state.task);

  // 2. Content digest (SHA-256, never MD5). Bounded by the 50MB upload limit.
  let digest = null;
  try {
    digest = await sha256Hex(await file.arrayBuffer());
  } catch (err) {
    console.warn('SHA-256 digest unavailable; duplicate detection skipped:', err && err.message);
  }
  if (controller.cancelled) throw cancelledError();

  if (digest) {
    const existing = await findActiveMediaByDigest(digest);
    const decision = dedupeDecision(existing);
    if (decision.reuse) {
      state.replace(reduceUploadTask(state.task, { type: 'done' }));
      return { media: toMediaItem(existing), deduplicated: true, task: state.task, sha256: digest };
    }
  }

  // 3. Transfer: small files plain, large files resumable with a safe fallback.
  state.replace(reduceUploadTask(state.task, { type: 'start' }));
  let transfer = strategy === 'resumable'
    ? await resumableUpload(storagePath, file, contentType, state)
    : { ok: false, unavailable: true };

  if (!transfer.ok && transfer.unavailable) {
    if (strategy === 'resumable') {
      // TUS client unavailable: keep the upload working, but say so.
      state.replace(Object.assign({}, state.task, { resumable: false, resumeUnavailable: true }));
    }
    transfer = await standardUpload(storagePath, file, contentType, state);
  }

  if (controller.cancelled || transfer.cancelled) throw cancelledError();
  if (!transfer.ok) {
    const error = transfer.error instanceof Error ? transfer.error : new Error(String((transfer.error && transfer.error.message) || 'Upload failed.'));
    state.replace(reduceUploadTask(state.task, { type: 'fail', error }));
    throw error;
  }

  // 4. Media row only after Storage confirmed the object.
  const payload = mediaRowPayload({
    storagePath,
    fileName: file.name,
    mimeType: contentType,
    sizeBytes: file.size,
    altText,
    sha256: digest
  });

  const inserted = await insertMediaRow(payload);
  if (!inserted.ok) {
    try {
      await supabase.storage.from(MEDIA_BUCKET).remove([storagePath]);
    } catch (_) {}
    // A concurrent duplicate won the race: reuse it instead of failing.
    if (isUniqueViolation(inserted.error) && digest) {
      const existing = await findActiveMediaByDigest(digest);
      if (existing) {
        state.replace(reduceUploadTask(state.task, { type: 'done' }));
        return { media: toMediaItem(existing), deduplicated: true, task: state.task, sha256: digest };
      }
    }
    const error = new Error('Media record creation failed: ' + (inserted.error && inserted.error.message ? inserted.error.message : 'unknown error'));
    state.replace(reduceUploadTask(state.task, { type: 'fail', error }));
    throw error;
  }

  state.replace(reduceUploadTask(state.task, { type: 'done' }));
  return { media: toMediaItem(inserted.row), deduplicated: false, task: state.task, sha256: digest };
}


