/**
 * admin-upload-core.js
 * Pure upload pipeline rules: strategy split (standard vs resumable), failure
 * classification with bounded retry/backoff, the upload task state machine,
 * digest dedupe decisions and the media row payload.
 *
 * No network, no DOM: admin-media-upload.js performs the transfer.
 */

export const UPLOAD_RESUMABLE_THRESHOLD_BYTES = 6 * 1024 * 1024; // ~6 MB
export const MAX_UPLOAD_RETRIES = 3;
// Upload paths are unique (timestamped) and uploads never overwrite, so the
// objects are immutable and safe to cache for a year.
export const UPLOAD_CACHE_CONTROL = '31536000';

export const UPLOAD_TASK_STATES = Object.freeze({
  QUEUED: 'queued',
  UPLOADING: 'uploading',
  RETRYING: 'retrying',
  COMPLETE: 'complete',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

const TERMINAL_STATES = Object.freeze([UPLOAD_TASK_STATES.COMPLETE, UPLOAD_TASK_STATES.FAILED, UPLOAD_TASK_STATES.CANCELLED]);
const ACTIVE_STATES = Object.freeze([UPLOAD_TASK_STATES.QUEUED, UPLOAD_TASK_STATES.UPLOADING, UPLOAD_TASK_STATES.RETRYING]);

/** Small files stay on the plain upload; larger files go resumable. */
export function chooseUploadStrategy(file) {
  const size = file && Number.isFinite(Number(file.size)) ? Number(file.size) : 0;
  return size > UPLOAD_RESUMABLE_THRESHOLD_BYTES ? 'resumable' : 'standard';
}

function failureMessage(error) {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  return String(error.message || error.error || error.statusText || '');
}

export function failureStatus(error) {
  if (!error) return 0;
  const raw = error.statusCode != null ? error.statusCode : error.status;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Failures that must never be retried in a loop: auth, RLS/forbidden, MIME,
 * size, validation and cancellation. Everything else is classified as a
 * transient network/server problem.
 */
export function classifyUploadFailure(error) {
  const message = failureMessage(error).toLowerCase();
  const status = failureStatus(error);
  if (/cancel|abort/.test(message)) return 'cancelled';
  if (status === 429) return 'rate_limited';
  if (status >= 500 && status < 600) return 'server';
  if (/row-level security|violates row-level|policy|forbidden|unauthorized|permission/.test(message) || status === 403) return 'forbidden';
  if (/not signed in|access denied|admin privileges|expired|jwt/.test(message) || status === 401) return 'auth';
  if (/mime|unsupported file type/.test(message) || status === 415) return 'mime';
  if (/exceeds|too large|payload too large/.test(message) || status === 413) return 'size';
  if (/invalid|is required|must be/.test(message) || status === 400 || status === 422) return 'validation';
  if (/network|failed to fetch|timeout|timed out|connection|econnreset|socket|temporar/.test(message) || status === 408) return 'network';
  return 'unknown';
}

const RETRYABLE_CLASSES = Object.freeze(['network', 'server', 'rate_limited']);

export function isRetryableUploadError(error) {
  return RETRYABLE_CLASSES.includes(classifyUploadFailure(error));
}

/** Bounded exponential backoff: 1s, 2s, 4s ... capped at 8s. */
export function retryDelayMs(attempt) {
  const n = Number(attempt);
  const step = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  return Math.min(1000 * 2 ** (step - 1), 8000);
}

/* --------------------------- upload tasks --------------------------------- */

export function createUploadTask({ id, fileName, size, strategy } = {}) {
  return {
    id: id || 'upload',
    fileName: fileName || 'file',
    size: Number.isFinite(Number(size)) ? Number(size) : 0,
    strategy: strategy || 'standard',
    resumable: strategy === 'resumable',
    status: UPLOAD_TASK_STATES.QUEUED,
    progress: 0,
    attempt: 0,
    error: null,
    startedAt: new Date().toISOString()
  };
}

/** Pure, sticky state machine: finished tasks never change again. */
export function reduceUploadTask(task, event = {}) {
  const current = task || createUploadTask();
  if (TERMINAL_STATES.includes(current.status)) return Object.assign({}, current);
  const next = Object.assign({}, current);

  switch (event.type) {
    case 'start':
      next.status = UPLOAD_TASK_STATES.UPLOADING;
      return next;
    case 'progress': {
      const total = Number(event.total);
      const loaded = Number(event.loaded);
      if (Number.isFinite(total) && total > 0 && Number.isFinite(loaded)) {
        next.progress = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
      }
      return next;
    }
    case 'retry':
      next.status = UPLOAD_TASK_STATES.RETRYING;
      next.attempt = Number.isFinite(Number(event.attempt)) ? Number(event.attempt) : current.attempt + 1;
      next.error = failureMessage(event.error) || null;
      return next;
    case 'done':
      next.status = UPLOAD_TASK_STATES.COMPLETE;
      next.progress = 100;
      next.error = null;
      return next;
    case 'fail':
      next.status = UPLOAD_TASK_STATES.FAILED;
      next.error = failureMessage(event.error) || 'Upload failed.';
      return next;
    case 'cancel':
      next.status = UPLOAD_TASK_STATES.CANCELLED;
      next.error = null;
      return next;
    default:
      return next;
  }
}

export function isTaskActive(task) {
  return Boolean(task) && ACTIVE_STATES.includes(task.status);
}

/** Uploads are serialized: an in-flight task blocks a duplicate action. */
export function canStartUpload(tasks) {
  return !(Array.isArray(tasks) ? tasks : []).some(isTaskActive);
}

export function uploadTaskLabel(task) {
  const name = (task && task.fileName) || 'file';
  if (!task) return name;
  switch (task.status) {
    case UPLOAD_TASK_STATES.QUEUED: return name + ' — queued';
    case UPLOAD_TASK_STATES.UPLOADING: return name + ' — uploading ' + (Number(task.progress) || 0) + '%';
    case UPLOAD_TASK_STATES.RETRYING: return name + ' — retrying (attempt ' + (Number(task.attempt) || 1) + ')';
    case UPLOAD_TASK_STATES.COMPLETE: return name + ' — upload complete';
    case UPLOAD_TASK_STATES.FAILED: return name + ' — failed: ' + (task.error || 'unknown error');
    case UPLOAD_TASK_STATES.CANCELLED: return name + ' — cancelled';
    default: return name;
  }
}

/* ------------------------------- dedupe ----------------------------------- */

/** An active media row with the same digest is reused instead of re-uploaded. */
export function dedupeDecision(existingRow) {
  if (!existingRow || !existingRow.id) return { reuse: false };
  return { reuse: true, mediaId: existingRow.id, storagePath: existingRow.storage_path || '' };
}

export function mediaRowPayload({ storagePath, fileName, mimeType, sizeBytes, altText, sha256 } = {}) {
  return {
    bucket_id: 'media',
    storage_path: storagePath,
    original_name: fileName,
    mime_type: mimeType || 'application/octet-stream',
    size_bytes: Number.isFinite(Number(sizeBytes)) ? Number(sizeBytes) : null,
    alt_text: altText || fileName,
    sha256: sha256 || null
  };
}

/** Standards-based SHA-256 (Web Crypto). Never MD5. */
export async function sha256Hex(data) {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

