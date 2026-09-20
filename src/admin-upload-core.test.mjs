import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  UPLOAD_RESUMABLE_THRESHOLD_BYTES,
  MAX_UPLOAD_RETRIES,
  UPLOAD_CACHE_CONTROL,
  chooseUploadStrategy,
  classifyUploadFailure,
  isRetryableUploadError,
  retryDelayMs,
  createUploadTask,
  reduceUploadTask,
  uploadTaskLabel,
  isTaskActive,
  canStartUpload,
  dedupeDecision,
  mediaRowPayload,
  sha256Hex
} from './admin-upload-core.js';

const MB = 1024 * 1024;

// --- Test 13/14: strategy split --------------------------------------------
assert.equal(UPLOAD_RESUMABLE_THRESHOLD_BYTES, 6 * MB);
assert.equal(chooseUploadStrategy({ size: 1024 }), 'standard');
assert.equal(chooseUploadStrategy({ size: 6 * MB }), 'standard', 'exactly the threshold still uses the standard path');
assert.equal(chooseUploadStrategy({ size: 6 * MB + 1 }), 'resumable');
assert.equal(chooseUploadStrategy({ size: 48 * MB }), 'resumable');
assert.equal(chooseUploadStrategy({}), 'standard', 'an unknown size stays on the safe standard path');
assert.equal(UPLOAD_CACHE_CONTROL, '31536000', 'unique immutable paths get a one year cache');
assert.equal(MAX_UPLOAD_RETRIES, 3);

// --- Test 16/17: retry classification -------------------------------------
assert.equal(isRetryableUploadError({ message: 'TypeError: Failed to fetch' }), true);
assert.equal(isRetryableUploadError({ message: 'Request timeout', statusCode: 408 }), true);
assert.equal(isRetryableUploadError({ message: 'Service unavailable', statusCode: 503 }), true);
assert.equal(isRetryableUploadError({ statusCode: 429, message: 'slow down' }), true);
assert.equal(isRetryableUploadError({ message: 'network error' }), true);
assert.equal(isRetryableUploadError({ message: 'Access denied. Admin privileges are required.' }), false, 'auth failures never loop');
assert.equal(isRetryableUploadError({ message: 'new row violates row-level security policy', code: '42501' }), false);
assert.equal(isRetryableUploadError({ message: 'Not signed in. You must be signed in as admin.' }), false);
assert.equal(isRetryableUploadError({ message: 'Your session has expired.' }), false);
assert.equal(isRetryableUploadError({ message: 'mime type image/tiff is not supported' }), false);
assert.equal(isRetryableUploadError({ message: 'Unsupported file type. Allowed: images' }), false);
assert.equal(isRetryableUploadError({ message: 'File size exceeds 50MB limit.' }), false);
assert.equal(isRetryableUploadError({ message: 'Upload cancelled' }), false);
assert.equal(isRetryableUploadError({ message: 'something unexpected' }), false, 'unknown failures fail closed');
assert.equal(isRetryableUploadError(null), false);

assert.equal(classifyUploadFailure({ message: 'Access denied.' }), 'auth');
assert.equal(classifyUploadFailure({ message: 'row-level security', statusCode: 403 }), 'forbidden');
assert.equal(classifyUploadFailure({ message: 'Unsupported file type. Allowed: images' }), 'mime');
assert.equal(classifyUploadFailure({ message: 'File size exceeds 50MB limit.' }), 'size');
assert.equal(classifyUploadFailure({ message: 'Failed to fetch' }), 'network');
assert.equal(classifyUploadFailure({ statusCode: 503 }), 'server');
assert.equal(classifyUploadFailure({ statusCode: 429 }), 'rate_limited');
assert.equal(classifyUploadFailure({ message: 'Upload cancelled' }), 'cancelled');
assert.equal(classifyUploadFailure({ message: '???' }), 'unknown');

assert.equal(retryDelayMs(1), 1000);
assert.equal(retryDelayMs(2), 2000);
assert.equal(retryDelayMs(3), 4000);
assert.equal(retryDelayMs(9), 8000, 'backoff is capped');
assert.equal(retryDelayMs(0), 1000);

// --- Test 15/18: upload task state machine --------------------------------
const baseTask = createUploadTask({ id: 'task-1', fileName: 'petal.png', size: 3 * MB, strategy: 'standard' });
assert.equal(baseTask.status, 'queued');
assert.equal(baseTask.progress, 0);
assert.equal(baseTask.resumable, false);
assert.equal(createUploadTask({ id: 't', fileName: 'big.mov', size: 20 * MB, strategy: 'resumable' }).resumable, true);

const uploading = reduceUploadTask(baseTask, { type: 'start' });
assert.equal(uploading.status, 'uploading');
const half = reduceUploadTask(uploading, { type: 'progress', loaded: 50, total: 100 });
assert.equal(half.progress, 50);
assert.equal(half.status, 'uploading');
assert.equal(reduceUploadTask(uploading, { type: 'progress', loaded: 300, total: 100 }).progress, 100, 'progress is clamped');
assert.equal(reduceUploadTask(uploading, { type: 'progress', loaded: 10, total: 0 }).progress, 0, 'unknown totals do not fabricate progress');

const retrying = reduceUploadTask(half, { type: 'retry', attempt: 2, error: { message: 'network error' } });
assert.equal(retrying.status, 'retrying');
assert.equal(retrying.attempt, 2);
assert.equal(retrying.progress, 50, 'progress survives a retry');
assert.equal(reduceUploadTask(retrying, { type: 'start' }).status, 'uploading');

const complete = reduceUploadTask(half, { type: 'done' });
assert.equal(complete.status, 'complete');
assert.equal(complete.progress, 100);
assert.equal(complete.error, null);
assert.equal(reduceUploadTask(complete, { type: 'fail', error: { message: 'too late' } }).status, 'complete', 'a finished task cannot fail');
assert.equal(reduceUploadTask(complete, { type: 'cancel' }).status, 'complete', 'a finished task cannot be cancelled');

const cancelled = reduceUploadTask(half, { type: 'cancel' });
assert.equal(cancelled.status, 'cancelled');
assert.equal(cancelled.error, null);
const failed = reduceUploadTask(half, { type: 'fail', error: { message: 'boom' } });
assert.equal(failed.status, 'failed');
assert.equal(failed.error, 'boom');

// Test 18: a cancelled task is never a success and never yielded an item.
assert.equal(isTaskActive(cancelled), false);
assert.equal(isTaskActive(failed), false);
assert.equal(isTaskActive(complete), false);
assert.equal(isTaskActive(half), true);
assert.equal(isTaskActive(baseTask), true);
assert.equal(canStartUpload([complete, cancelled], 'new.png'), true, 'finished tasks do not block a new upload');
assert.equal(canStartUpload([half], 'new.png'), false, 'an active upload blocks a duplicate action');
assert.equal(canStartUpload([], 'new.png'), true);

assert.match(uploadTaskLabel(baseTask), /petal\.png/);
assert.match(uploadTaskLabel(baseTask), /uploading|queued/i);
assert.match(uploadTaskLabel(half), /50%/);
assert.match(uploadTaskLabel(retrying), /retry/i);
assert.match(uploadTaskLabel(failed), /failed/i);
assert.match(uploadTaskLabel(failed), /boom/);
assert.match(uploadTaskLabel(cancelled), /cancel/i);
assert.match(uploadTaskLabel(complete), /complete|uploaded/i);

// --- Test 19/20: digest dedupe and stored metadata -------------------------
assert.deepEqual(dedupeDecision(null), { reuse: false });
assert.deepEqual(dedupeDecision({ id: 'media-9', storage_path: 'uploads/x.png' }), { reuse: true, mediaId: 'media-9', storagePath: 'uploads/x.png' });

const payload = mediaRowPayload({
  storagePath: 'uploads/123_petal.png',
  fileName: 'petal.png',
  mimeType: 'image/png',
  sizeBytes: 204800,
  altText: '',
  sha256: 'abc123'
});
assert.equal(payload.bucket_id, 'media');
assert.equal(payload.storage_path, 'uploads/123_petal.png');
assert.equal(payload.original_name, 'petal.png');
assert.equal(payload.sha256, 'abc123');
assert.equal(payload.alt_text, 'petal.png', 'the alt text falls back to the file name');
assert.equal(payload.deletion_status, undefined, 'uploads never set deletion state explicitly');

// sha256Hex matches the standard digest.
const bytes = new TextEncoder().encode('crabbie');
const expected = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const digest = await sha256Hex(bytes);
assert.equal(digest, expected);
assert.equal(digest.length, 64);
assert.equal((await sha256Hex(new Uint8Array(0))).length, 64, 'an empty buffer still hashes');

console.log('Admin upload core tests passed.');
