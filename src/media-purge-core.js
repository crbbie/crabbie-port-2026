/**
 * media-purge-core.js
 * Pure rules for Batch 3 manual safe media purge.
 *
 * Desired flow: Complete Scan -> Candidate -> Grace Period -> Re-check ->
 * Claim -> Manual Purge. Every gate is evaluated against FRESH state right
 * before deletion; anything uncertain blocks with a reason (fail closed).
 *
 * A purge candidate needs ALL of:
 *   - a COMPLETE scan behind it;
 *   - POSSIBLY_UNUSED classification (no authoritative reference);
 *   - not Protected;
 *   - no active upload lease;
 *   - unchanged object identity/fingerprint;
 *   - grace elapsed since first_unreferenced_at (default 30 days);
 *   - at least 2 consecutive complete scans confirming unreferenced.
 *
 * No DOM, no Supabase access: admin-cleanup.js applies these verdicts.
 */
import { fingerprintObject, ROW_CLASSIFICATION } from './media-cleanup-scanner-core.js';
import { isMissingStorageObject } from './admin-media-safety-core.js';

export const PURGE_GRACE_DAYS_DEFAULT = 30;
export const PURGE_MIN_COMPLETE_SCANS = 2;
export const PURGE_BATCH_LIMIT = 25;
export const UPLOAD_LEASE_TTL_HOURS = 2;
/** Objects touched more recently than this are never purged (upload safety margin). */
export const OBJECT_QUIET_HOURS = 24;

export const PURGE_BLOCK_REASONS = Object.freeze({
  INCOMPLETE_SCAN: 'incomplete_scan',
  IN_USE: 'in_use',
  PROTECTED: 'protected',
  NO_STATE: 'no_state',
  GRACE: 'grace_period',
  NEEDS_SCANS: 'needs_second_scan',
  CHANGED: 'object_changed',
  LEASED: 'active_upload',
  RECENCY_UNKNOWN: 'recency_unknown',
  TOO_FRESH: 'object_too_fresh'
});

/** Null/undefined means "right now"; only finite numbers override the clock. */
function resolveNowMs(nowMs) {
  if (nowMs === null || nowMs === undefined) return Date.now();
  const parsed = Number(nowMs);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/** Lease row payload for a starting upload (pure; the adapter writes it). */
export function uploadLeasePayload({ storagePath = '', nowMs = null, ttlHours = UPLOAD_LEASE_TTL_HOURS, createdBy = null } = {}) {
  const now = resolveNowMs(nowMs);
  const ttl = Number.isFinite(Number(ttlHours)) && Number(ttlHours) > 0 ? Number(ttlHours) : UPLOAD_LEASE_TTL_HOURS;
  return {
    storage_path: String(storagePath || ''),
    started_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttl * 3600 * 1000).toISOString(),
    created_by: createdBy || null
  };
}

export function isLeaseActive(lease, nowMs = null) {
  if (!lease || !lease.expires_at) return false;
  return new Date(lease.expires_at).getTime() > resolveNowMs(nowMs);
}

/**
 * Full eligibility verdict for one snapshot entry.
 * entry: { storagePath, classification, sizeBytes, updatedAt, mediaId }
 * state: media_cleanup_state row (or null).
 * leasesByPath: { path -> lease }.
 */
export function evaluatePurgeEligibility({
  entry = {},
  snapshotComplete = false,
  state = null,
  leasesByPath = {},
  nowMs = null,
  graceDays = PURGE_GRACE_DAYS_DEFAULT,
  minScans = PURGE_MIN_COMPLETE_SCANS
} = {}) {
  const now = resolveNowMs(nowMs);
  const fail = (reason, detail) => ({ eligible: false, reasons: [reason], detail: detail || null });

  if (snapshotComplete !== true) return fail(PURGE_BLOCK_REASONS.INCOMPLETE_SCAN);
  const storagePath = entry.storagePath || '';
  if (!storagePath) return fail(PURGE_BLOCK_REASONS.NO_STATE, 'empty path');
  if (entry.classification !== ROW_CLASSIFICATION.POSSIBLY_UNUSED) {
    if (entry.classification === ROW_CLASSIFICATION.PROTECTED) return fail(PURGE_BLOCK_REASONS.PROTECTED);
    return fail(PURGE_BLOCK_REASONS.IN_USE);
  }
  if (!state) return fail(PURGE_BLOCK_REASONS.NO_STATE, 'no cleanup anchor yet');
  if (state.protected === true) return fail(PURGE_BLOCK_REASONS.PROTECTED);

  const anchor = state.first_unreferenced_at ? new Date(state.first_unreferenced_at).getTime() : NaN;
  if (!Number.isFinite(anchor)) return fail(PURGE_BLOCK_REASONS.NO_STATE, 'no first-sighting anchor');
  const graceMs = (Number.isFinite(Number(graceDays)) ? Number(graceDays) : PURGE_GRACE_DAYS_DEFAULT) * 86400 * 1000;
  if (now - anchor < graceMs) {
    return {
      eligible: false,
      reasons: [PURGE_BLOCK_REASONS.GRACE],
      detail: null,
      graceEligibleAt: new Date(anchor + graceMs).toISOString()
    };
  }
  if ((Number(state.unreferenced_scan_count) || 0) < (minScans || PURGE_MIN_COMPLETE_SCANS)) {
    return fail(PURGE_BLOCK_REASONS.NEEDS_SCANS);
  }

  const current = fingerprintObject({ path: storagePath, sizeBytes: entry.sizeBytes, updatedAt: entry.updatedAt || null });
  if (!state.object_fingerprint || state.object_fingerprint !== current) {
    return fail(PURGE_BLOCK_REASONS.CHANGED);
  }

  const lease = leasesByPath && leasesByPath[storagePath];
  if (isLeaseActive(lease, now)) return fail(PURGE_BLOCK_REASONS.LEASED);

  const updatedAtMs = entry.updatedAt ? new Date(entry.updatedAt).getTime() : NaN;
  if (!Number.isFinite(updatedAtMs)) return fail(PURGE_BLOCK_REASONS.RECENCY_UNKNOWN);
  if (now - updatedAtMs < OBJECT_QUIET_HOURS * 3600 * 1000) return fail(PURGE_BLOCK_REASONS.TOO_FRESH);

  return { eligible: true, reasons: [], fingerprint: current };
}

/** Plan one manual batch (max 25): per-path verdicts, no "purge all". */
export function planPurgeBatch(entries = [], context = {}) {
  const list = Array.isArray(entries) ? entries.slice(0, PURGE_BATCH_LIMIT) : [];
  const skipped = Array.isArray(entries) ? entries.length - list.length : 0;
  return {
    plans: list.map((entry) => ({
      storagePath: entry.storagePath || '',
      mediaId: entry.mediaId || null,
      sizeBytes: entry.sizeBytes ?? null,
      ...evaluatePurgeEligibility({ entry, ...context })
    })),
    skipped
  };
}

/** Bulk purge confirmation phrase, e.g. "PURGE 7". */
export function purgeConfirmText(count) {
  return `PURGE ${Number(count) || 0}`;
}

export function isPurgeConfirmed(input, count) {
  return String(input || '').trim() === purgeConfirmText(count);
}

/**
 * Map a Storage remove() outcome to the next step.
 * A missing object already reached the goal (idempotent finalize path);
 * any other failure stays retryable and never reports success.
 */
export function nextPurgeStorageStep({ storagePath = '', removeError = null } = {}) {
  if (!removeError) return { phase: 'storage_removed', storagePath, retryable: false };
  if (isMissingStorageObject(removeError)) {
    return { phase: 'storage_removed', storagePath, alreadyMissing: true, retryable: false };
  }
  return {
    phase: 'failed',
    step: 'storage_remove',
    storagePath,
    retryable: true,
    error: (removeError && (removeError.message || removeError.error)) || String(removeError)
  };
}

/**
 * Map a metadata finalize outcome. Deleting an already-gone row is success
 * (idempotent retry); other failures stay retryable.
 */
export function nextPurgeFinalizeStep({ storagePath = '', finalizeError = null, rowMissing = false } = {}) {
  if (!finalizeError || rowMissing) return { phase: 'finalized', storagePath, retryable: false };
  return {
    phase: 'failed',
    step: 'finalize',
    storagePath,
    retryable: true,
    error: (finalizeError && (finalizeError.message || finalizeError.error)) || String(finalizeError)
  };
}

/** Per-record batch summary for UI reconcile (partial failure safe). */
export function summarizePurgeBatch(results = []) {
  const succeeded = [];
  const failed = [];
  (Array.isArray(results) ? results : []).forEach((result) => {
    if (result && result.success) succeeded.push(result.storagePath);
    else if (result) {
      failed.push({
        storagePath: result.storagePath || null,
        error: result.error || 'unknown error',
        retryable: result.retryable !== false
      });
    }
  });
  return { succeeded, failed, total: succeeded.length + failed.length };
}
