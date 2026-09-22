import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  REQUEST_LIFECYCLE_BULK_LIMIT,
  lifecycleOfRow,
  normalizeLifecycleView,
  buildLifecyclePayload,
  restoreTargetOfRow,
  canPermanentDeleteRow,
  permanentDeleteBlockReason,
  requireLifecycleIdentity,
  assertCanMutateLifecycle,
  planBulkLifecycle,
  summarizeBulkOutcome,
  bulkDeleteConfirmText,
  isBulkDeleteConfirmed
} from './commission-request-lifecycle-core.js';
import { pageAfterDelete } from './admin-query-core.js';

const NOW = '2026-09-22T00:00:00.000Z';
const row = (over = {}) => ({
  id: 'req-1',
  status: 'closed',
  archived_at: null,
  deleted_at: null,
  retention_hold: false,
  updated_at: '2026-09-21T00:00:00.000Z',
  ...over
});

// Archive keeps business status (payload touches lifecycle columns only).
{
  const payload = buildLifecyclePayload('archive', row(), NOW);
  assert.deepEqual(payload, { archived_at: NOW });
  assert.ok(!('status' in payload));
}

// Double archive is a safe retry (idempotent, keeps original marker).
{
  const payload = buildLifecyclePayload('archive', row({ archived_at: '2026-09-20T00:00:00.000Z' }));
  assert.deepEqual(payload, { archived_at: '2026-09-20T00:00:00.000Z' });
}

// Trash keeps the record; archived marker survives for restore routing.
{
  const payload = buildLifecyclePayload('trash', row({ archived_at: '2026-09-20T00:00:00.000Z' }), NOW);
  assert.deepEqual(payload, { deleted_at: NOW });
  assert.equal(lifecycleOfRow({ archived_at: 'a', deleted_at: NOW }), 'trash');
}

// Restore routes Trash -> Archive when archived_at survived, else Trash -> Inbox.
{
  assert.equal(restoreTargetOfRow({ archived_at: '2026-09-20T00:00:00.000Z', deleted_at: NOW }), 'archive');
  assert.equal(restoreTargetOfRow({ archived_at: null, deleted_at: NOW }), 'inbox');
  const payload = buildLifecyclePayload('restore', { archived_at: 'x', deleted_at: NOW });
  assert.deepEqual(payload, { deleted_at: null });
}

// Restore outside Trash is rejected, never a silent no-op.
{
  assert.throws(() => buildLifecyclePayload('restore', row()), /Only a trashed request/);
  assert.equal(restoreTargetOfRow(row()), null);
}

// Archive from Trash is rejected: restore first.
{
  assert.throws(() => buildLifecyclePayload('archive', row({ deleted_at: NOW })), /restored before/);
}

// Retention hold blocks purge; non-trash blocks purge.
{
  assert.equal(canPermanentDeleteRow({ archived_at: null, deleted_at: NOW, retention_hold: false }), true);
  assert.equal(canPermanentDeleteRow({ archived_at: null, deleted_at: NOW, retention_hold: true }), false);
  assert.equal(canPermanentDeleteRow(row()), false);
  assert.equal(permanentDeleteBlockReason({ deleted_at: NOW, retention_hold: true }), 'retention_hold');
  assert.equal(permanentDeleteBlockReason(row()), 'not_in_trash');
  assert.equal(permanentDeleteBlockReason({ deleted_at: NOW, retention_hold: false }), null);
}

// Stale identity: UUID + expected updated_at required, no fake success.
{
  assert.throws(() => requireLifecycleIdentity({ id: '', expectedUpdatedAt: 'x' }), /request id/);
  assert.throws(() => requireLifecycleIdentity({ id: 'req-1' }), /changed elsewhere/);
  assert.deepEqual(requireLifecycleIdentity({ id: 'req-1', expectedUpdatedAt: 'u' }), {
    id: 'req-1',
    expectedUpdatedAt: 'u'
  });
}

// Role gate: anon and non-admin denied, admin allowed.
{
  assert.equal(assertCanMutateLifecycle('admin'), true);
  assert.throws(() => assertCanMutateLifecycle('anon'), /Sign in as an admin/);
  assert.throws(() => assertCanMutateLifecycle(null), /Sign in as an admin/);
  assert.throws(() => assertCanMutateLifecycle('authenticated'), /Only admins/);
}

// Bulk is capped at 50 with per-record outcomes for reconcile.
{
  assert.equal(REQUEST_LIFECYCLE_BULK_LIMIT, 50);
  const entries = Array.from({ length: 52 }, (_, i) => ({
    id: `req-${i}`,
    expectedUpdatedAt: 'u',
    row: row({ id: `req-${i}` })
  }));
  const plans = planBulkLifecycle('archive', entries);
  assert.equal(plans.length, 52);
  assert.equal(plans.filter((p) => p.ok).length, 50);
  assert.equal(plans[50].skipped, true);
  assert.equal(plans[51].error, 'bulk_limit');
}

// Partial bulk failure surfaces per-record outcomes.
{
  const plans = [
    { id: 'a', ok: true },
    { id: 'b', ok: true },
    { id: 'c', ok: false, error: 'retention_hold' }
  ];
  const summary = summarizeBulkOutcome(plans, [
    { id: 'a', success: true },
    { id: 'b', success: false, error: 'conflict: request changed elsewhere' }
  ]);
  assert.deepEqual(summary.succeeded, ['a']);
  assert.deepEqual(summary.failed, [
    { id: 'b', error: 'conflict: request changed elsewhere' },
    { id: 'c', error: 'retention_hold' }
  ]);
  assert.equal(summary.total, 3);
}

// Bulk permanent-delete plans respect the hold per record.
{
  const plans = planBulkLifecycle('permanent_delete', [
    { id: 'a', expectedUpdatedAt: 'u', row: { deleted_at: NOW, retention_hold: false } },
    { id: 'b', expectedUpdatedAt: 'u', row: { deleted_at: NOW, retention_hold: true } },
    { id: 'c', expectedUpdatedAt: 'u', row: row() }
  ]);
  assert.equal(plans[0].ok, true);
  assert.equal(plans[0].permanentDelete, true);
  assert.equal(plans[1].error, 'retention_hold');
  assert.equal(plans[2].error, 'not_in_trash');
}

// Bulk permanent delete requires typing "DELETE N".
{
  assert.equal(bulkDeleteConfirmText(12), 'DELETE 12');
  assert.equal(isBulkDeleteConfirmed('DELETE 12', 12), true);
  assert.equal(isBulkDeleteConfirmed('delete 12', 12), false);
  assert.equal(isBulkDeleteConfirmed('DELETE 11', 12), false);
}

// Empty last page after cleanup steps back instead of rendering a dead page.
{
  assert.equal(pageAfterDelete({ page: 2, itemsOnPage: 0, total: 30, pageSize: 30 }), 1);
  assert.equal(pageAfterDelete({ page: 3, itemsOnPage: 0, total: 60, pageSize: 30 }), 1);
  assert.equal(pageAfterDelete({ page: 2, itemsOnPage: 5, total: 35, pageSize: 30 }), 2);
  assert.equal(normalizeLifecycleView('trash'), 'trash');
  assert.equal(normalizeLifecycleView('bogus'), 'inbox');
}

// Migration: forward-only lifecycle columns, visitor inserts pinned to Inbox,
// no cascade toward media/files, admin-only management.
{
  const sql = await readFile('supabase/migrations/202609220001_commission_request_lifecycle.sql', 'utf8');
  assert.match(sql, /add column if not exists archived_at/);
  assert.match(sql, /add column if not exists deleted_at/);
  assert.match(sql, /add column if not exists retention_hold/);
  assert.match(sql, /archived_at is null/);
  assert.match(sql, /deleted_at is null/);
  assert.match(sql, /retention_hold = false/);
  assert.doesNotMatch(sql, /on delete cascade/i);
  assert.doesNotMatch(sql, /grant\s+.*to anon/i);
  assert.match(sql, /for insert to anon, authenticated/);
  assert.doesNotMatch(sql, /for (select|update|delete|all) to anon/i);
}

// Permanent delete touches only commission_requests (never media/files).
{
  const crud = await readFile('src/admin-crud.js', 'utf8');
  const start = crud.indexOf('export async function permanentDeleteRequest');
  assert.ok(start !== -1, 'permanentDeleteRequest exists in admin-crud.js');
  const end = crud.indexOf('export async function', start + 10);
  const body = crud.slice(start, end === -1 ? undefined : end);
  assert.match(body, /from\('commission_requests'\)/);
  assert.doesNotMatch(body, /from\('media'\)/);
  assert.doesNotMatch(body, /storage\.from/);
}

console.log('commission-request-lifecycle-core.test.mjs: ok');
