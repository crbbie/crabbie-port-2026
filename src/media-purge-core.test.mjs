import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PURGE_GRACE_DAYS_DEFAULT,
  PURGE_MIN_COMPLETE_SCANS,
  PURGE_BATCH_LIMIT,
  UPLOAD_LEASE_TTL_HOURS,
  OBJECT_QUIET_HOURS,
  uploadLeasePayload,
  isLeaseActive,
  evaluatePurgeEligibility,
  planPurgeBatch,
  purgeConfirmText,
  isPurgeConfirmed,
  nextPurgeStorageStep,
  nextPurgeFinalizeStep,
  summarizePurgeBatch
} from './media-purge-core.js';
import { ROW_CLASSIFICATION } from './media-cleanup-scanner-core.js';

const DAY = 86400 * 1000;
const NOW = new Date('2026-09-24T00:00:00.000Z').getTime();
const OLD_OBJECT = new Date('2026-01-01T00:00:00.000Z').toISOString();
const fp = (size) => `media/uploads/old.png|${size}|${OLD_OBJECT}`;
const eligibleEntry = (over = {}) => ({
  storagePath: 'uploads/old.png',
  classification: ROW_CLASSIFICATION.POSSIBLY_UNUSED,
  sizeBytes: 500,
  updatedAt: OLD_OBJECT,
  mediaId: 'm-old',
  ...over
});
const anchoredState = (over = {}) => ({
  storage_path: 'uploads/old.png',
  protected: false,
  first_unreferenced_at: new Date(NOW - 40 * DAY).toISOString(),
  unreferenced_scan_count: 2,
  object_fingerprint: fp(500),
  ...over
});

// A full candidate passes every gate.
{
  const verdict = evaluatePurgeEligibility({ entry: eligibleEntry(), snapshotComplete: true, state: anchoredState(), nowMs: NOW });
  assert.equal(verdict.eligible, true);
  assert.equal(PURGE_GRACE_DAYS_DEFAULT, 30);
  assert.equal(PURGE_MIN_COMPLETE_SCANS, 2);
  assert.equal(PURGE_BATCH_LIMIT, 25);
}

// Incomplete scan blocks everything.
{
  const verdict = evaluatePurgeEligibility({ entry: eligibleEntry(), snapshotComplete: false, state: anchoredState(), nowMs: NOW });
  assert.equal(verdict.eligible, false);
  assert.deepEqual(verdict.reasons, ['incomplete_scan']);
}

// A reference that appears between scan and purge blocks (fresh IN_USE).
{
  const verdict = evaluatePurgeEligibility({
    entry: eligibleEntry({ classification: ROW_CLASSIFICATION.IN_USE }),
    snapshotComplete: true,
    state: anchoredState(),
    nowMs: NOW
  });
  assert.equal(verdict.eligible, false);
  assert.deepEqual(verdict.reasons, ['in_use']);
}

// Protected media is never a candidate (row flag or state flag).
{
  for (const entry of [
    eligibleEntry({ classification: ROW_CLASSIFICATION.PROTECTED }),
    eligibleEntry()
  ]) {
    const state = entry.classification === ROW_CLASSIFICATION.PROTECTED ? anchoredState() : anchoredState({ protected: true });
    const verdict = evaluatePurgeEligibility({ entry, snapshotComplete: true, state, nowMs: NOW });
    assert.equal(verdict.eligible, false);
    assert.deepEqual(verdict.reasons, ['protected']);
  }
}

// Grace period: 30 days from first sighting, not file age.
{
  const young = evaluatePurgeEligibility({
    entry: eligibleEntry(),
    snapshotComplete: true,
    state: anchoredState({ first_unreferenced_at: new Date(NOW - 5 * DAY).toISOString() }),
    nowMs: NOW
  });
  assert.equal(young.eligible, false);
  assert.deepEqual(young.reasons, ['grace_period']);
  assert.equal(young.graceEligibleAt, new Date(NOW - 5 * DAY + 30 * DAY).toISOString());
}

// One confirming scan is not enough.
{
  const verdict = evaluatePurgeEligibility({
    entry: eligibleEntry(),
    snapshotComplete: true,
    state: anchoredState({ unreferenced_scan_count: 1 }),
    nowMs: NOW
  });
  assert.equal(verdict.eligible, false);
  assert.deepEqual(verdict.reasons, ['needs_second_scan']);
}

// No anchor / no state: not a candidate.
{
  assert.deepEqual(evaluatePurgeEligibility({ entry: eligibleEntry(), snapshotComplete: true, state: null, nowMs: NOW }).reasons, ['no_state']);
  assert.deepEqual(
    evaluatePurgeEligibility({ entry: eligibleEntry(), snapshotComplete: true, state: anchoredState({ first_unreferenced_at: null }), nowMs: NOW }).reasons,
    ['no_state']
  );
}

// Object changed (size/bytes/updated swapped underneath): fingerprint mismatch.
{
  const verdict = evaluatePurgeEligibility({
    entry: eligibleEntry({ sizeBytes: 600 }),
    snapshotComplete: true,
    state: anchoredState(),
    nowMs: NOW
  });
  assert.equal(verdict.eligible, false);
  assert.deepEqual(verdict.reasons, ['object_changed']);
}

// Encoded path: fingerprint uses the canonical identity, so both spellings match.
{
  const verdict = evaluatePurgeEligibility({
    entry: eligibleEntry({ storagePath: 'uploads/a b.png', sizeBytes: 10, updatedAt: OLD_OBJECT }),
    snapshotComplete: true,
    state: {
      storage_path: 'uploads/a b.png',
      protected: false,
      first_unreferenced_at: new Date(NOW - 40 * DAY).toISOString(),
      unreferenced_scan_count: 3,
      object_fingerprint: 'media/uploads/a b.png|10|2026-01-01T00:00:00.000Z'
    },
    nowMs: NOW
  });
  assert.equal(verdict.eligible, true);
}

// Active upload lease blocks; expired leases do not.
{
  assert.equal(UPLOAD_LEASE_TTL_HOURS, 2);
  const lease = uploadLeasePayload({ storagePath: 'uploads/old.png', nowMs: NOW, createdBy: 'admin-1' });
  assert.equal(lease.storage_path, 'uploads/old.png');
  assert.equal(lease.created_by, 'admin-1');
  assert.equal(new Date(lease.expires_at).getTime() - NOW, 2 * 3600 * 1000);
  assert.equal(isLeaseActive(lease, NOW), true);
  assert.equal(isLeaseActive(lease, NOW + 3 * 3600 * 1000), false);
  assert.equal(isLeaseActive(null, NOW), false);
  const blocked = evaluatePurgeEligibility({
    entry: eligibleEntry(),
    snapshotComplete: true,
    state: anchoredState(),
    leasesByPath: { 'uploads/old.png': lease },
    nowMs: NOW
  });
  assert.equal(blocked.eligible, false);
  assert.deepEqual(blocked.reasons, ['active_upload']);
  const free = evaluatePurgeEligibility({
    entry: eligibleEntry(),
    snapshotComplete: true,
    state: anchoredState(),
    leasesByPath: { 'uploads/old.png': lease },
    nowMs: NOW + 3 * 3600 * 1000 + 40 * DAY
  });
  assert.equal(free.eligible, true);
}

// Freshly-touched objects wait out the quiet window; unknown recency blocks.
{
  assert.ok(OBJECT_QUIET_HOURS >= 1);
  const freshAt = new Date(NOW - 3600 * 1000).toISOString();
  const fresh = evaluatePurgeEligibility({
    entry: eligibleEntry({ updatedAt: freshAt }),
    snapshotComplete: true,
    state: anchoredState({ object_fingerprint: `media/uploads/old.png|500|${freshAt}` }),
    nowMs: NOW
  });
  assert.equal(fresh.eligible, false);
  assert.deepEqual(fresh.reasons, ['object_too_fresh']);
  const unknown = evaluatePurgeEligibility({
    entry: eligibleEntry({ updatedAt: null }),
    snapshotComplete: true,
    state: anchoredState(),
    nowMs: NOW
  });
  assert.equal(unknown.eligible, false);
  assert.ok(['recency_unknown', 'object_changed'].includes(unknown.reasons[0]));
}

// A null clock means "right now", never the epoch (regression: Number(null) is 0).
{
  const freshLease = uploadLeasePayload({ storagePath: 'uploads/old.png' });
  assert.equal(isLeaseActive(freshLease), true);
  assert.equal(isLeaseActive(freshLease, null), true);
  const verdict = evaluatePurgeEligibility({
    entry: eligibleEntry(),
    snapshotComplete: true,
    state: anchoredState({ first_unreferenced_at: new Date(Date.now() - 40 * DAY).toISOString() }),
    nowMs: null
  });
  assert.equal(verdict.eligible, true);
}

// Batch planning caps at 25 with per-path verdicts; confirmation is explicit.
{
  const entries = Array.from({ length: 27 }, (_, i) => eligibleEntry({ storagePath: `uploads/f${i}.png` }));
  const batch = planPurgeBatch(entries, { snapshotComplete: true, state: null, nowMs: NOW });
  assert.equal(batch.plans.length, 25);
  assert.equal(batch.skipped, 2);
  assert.ok(batch.plans.every((plan) => plan.eligible === false));
  assert.equal(purgeConfirmText(7), 'PURGE 7');
  assert.equal(isPurgeConfirmed('PURGE 7', 7), true);
  assert.equal(isPurgeConfirmed('purge 7', 7), false);
  assert.equal(isPurgeConfirmed('PURGE 6', 7), false);
}

// Storage remove failure stays retryable; a missing object finalizes idempotently.
{
  assert.deepEqual(nextPurgeStorageStep({ storagePath: 'a' }), { phase: 'storage_removed', storagePath: 'a', retryable: false });
  const missing = nextPurgeStorageStep({ storagePath: 'a', removeError: { statusCode: '404', message: 'not found' } });
  assert.equal(missing.phase, 'storage_removed');
  assert.equal(missing.alreadyMissing, true);
  const failed = nextPurgeStorageStep({ storagePath: 'a', removeError: new Error('network down') });
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.step, 'storage_remove');
  assert.equal(failed.retryable, true);
}

// Finalize failure is retryable; an already-gone row is success (idempotent retry).
{
  assert.deepEqual(nextPurgeFinalizeStep({ storagePath: 'a' }).phase, 'finalized');
  assert.deepEqual(nextPurgeFinalizeStep({ storagePath: 'a', rowMissing: true, finalizeError: new Error('x') }).phase, 'finalized');
  const failed = nextPurgeFinalizeStep({ storagePath: 'a', finalizeError: new Error('db down') });
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.step, 'finalize');
  assert.equal(failed.retryable, true);
}

// Partial batch + duplicate retry reconcile per record.
{
  const summary = summarizePurgeBatch([
    { storagePath: 'a', success: true },
    { storagePath: 'b', success: true },
    { storagePath: 'c', success: false, error: 'conflict: changed, rescan', retryable: true },
    { storagePath: 'd', success: false, error: 'active_upload', retryable: true }
  ]);
  assert.deepEqual(summary.succeeded, ['a', 'b']);
  assert.equal(summary.failed.length, 2);
  assert.equal(summary.total, 4);
  assert.deepEqual(summarizePurgeBatch([]), { succeeded: [], failed: [], total: 0 });
}

// Migration: leases + claim/scan-count columns, admin-only, no automation.
{
  const sql = await readFile('supabase/migrations/202609240001_media_purge_safety.sql', 'utf8');
  assert.match(sql, /create table if not exists public\.media_upload_leases/);
  assert.match(sql, /unreferenced_scan_count/);
  assert.match(sql, /purge_claimed_at/);
  assert.match(sql, /alter table public\.media_upload_leases enable row level security/);
  assert.match(sql, /revoke all on public\.media_upload_leases from anon/);
  assert.doesNotMatch(sql, /cron|pg_cron|job|schedule/i);
  assert.doesNotMatch(sql, /delete\s+from\s+storage/i);
}

console.log('media-purge-core.test.mjs: ok');
