/**
 * commission-request-lifecycle-core.js
 * Pure Inbox <-> Archive -> Trash -> Permanent Delete rules for commission requests.
 *
 * Lifecycle is SEPARATE from business status
 * ('new','reviewing','contacted','accepted','declined','closed'):
 * archive/trash/restore never rewrite status.
 *
 * No DOM, no Supabase access. admin-crud.js applies these plans to real queries
 * with UUID + expected updated_at optimistic concurrency.
 */

export const REQUEST_LIFECYCLE_VIEWS = Object.freeze(['inbox', 'archive', 'trash']);

/** Max records per bulk lifecycle operation (manual batch cleanup, not automation). */
export const REQUEST_LIFECYCLE_BULK_LIMIT = 50;

/** Default Trash retention before an admin should even consider a purge. */
export const REQUEST_TRASH_RETENTION_DAYS = 30;

export function lifecycleOfRow(row) {
  if (row && row.deleted_at !== null && row.deleted_at !== undefined && String(row.deleted_at) !== '') {
    return 'trash';
  }
  if (row && row.archived_at !== null && row.archived_at !== undefined && String(row.archived_at) !== '') {
    return 'archive';
  }
  return 'inbox';
}

export function isValidLifecycleView(view) {
  return REQUEST_LIFECYCLE_VIEWS.includes(view);
}

export function normalizeLifecycleView(view) {
  return isValidLifecycleView(view) ? view : 'inbox';
}

/**
 * Builds the column payload for a lifecycle transition.
 * `nowIso` is injected (testability); callers pass new Date().toISOString().
 * Throws on illegal transitions so the UI can never silently no-op.
 */
export function buildLifecyclePayload(action, row, nowIso) {
  const now = nowIso || new Date().toISOString();
  const current = lifecycleOfRow(row);
  if (action === 'archive') {
    if (current === 'trash') {
      throw new Error('A trashed request must be restored before it can be archived.');
    }
    if (current === 'archive') return { archived_at: row.archived_at };
    return { archived_at: now };
  }
  if (action === 'trash') {
    if (current === 'trash') return { deleted_at: row.deleted_at };
    return { deleted_at: now };
  }
  if (action === 'restore') {
    if (current !== 'trash') {
      throw new Error('Only a trashed request can be restored.');
    }
    // archived_at is kept while in Trash: its presence routes back to Archive,
    // its absence routes back to Inbox.
    return { deleted_at: null };
  }
  throw new Error(`Unsupported lifecycle action: ${action}`);
}

/** Where a restore lands, decided by the preserved archived_at marker. */
export function restoreTargetOfRow(row) {
  if (lifecycleOfRow(row) !== 'trash') return null;
  return row && row.archived_at ? 'archive' : 'inbox';
}

/** Permanent delete gate: Trash only, never under retention hold. */
export function canPermanentDeleteRow(row) {
  if (!row || lifecycleOfRow(row) !== 'trash') return false;
  return row.retention_hold !== true;
}

export function permanentDeleteBlockReason(row) {
  if (!row || lifecycleOfRow(row) !== 'trash') return 'not_in_trash';
  if (row.retention_hold === true) return 'retention_hold';
  return null;
}

/** Every lifecycle mutation needs UUID + the hydrated updated_at baseline. */
export function requireLifecycleIdentity(entry) {
  const id = entry && typeof entry.id === 'string' ? entry.id.trim() : '';
  const expectedUpdatedAt =
    entry && typeof entry.expectedUpdatedAt === 'string' && entry.expectedUpdatedAt
      ? entry.expectedUpdatedAt
      : null;
  if (!id) throw new Error('A lifecycle change needs the request id.');
  if (!expectedUpdatedAt) throw new Error('This request changed elsewhere. Reload before retrying.');
  return { id, expectedUpdatedAt };
}

/**
 * Role gate for lifecycle mutations (RLS is the real boundary; this keeps
 * client wiring honest and is unit-testable).
 */
export function assertCanMutateLifecycle(role) {
  if (role === 'admin') return true;
  if (role === 'anon' || role == null) throw new Error('Sign in as an admin to manage requests.');
  throw new Error('Only admins can manage request lifecycle.');
}

/**
 * Plans a bulk lifecycle operation. Returns per-record plans; records past the
 * limit are reported as `skipped` so the UI can reconcile instead of guessing.
 */
export function planBulkLifecycle(action, entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  return list.map((entry, index) => {
    if (index >= REQUEST_LIFECYCLE_BULK_LIMIT) {
      return { id: (entry && entry.id) || null, ok: false, error: 'bulk_limit', skipped: true };
    }
    try {
      const identity = requireLifecycleIdentity(entry);
      if (action === 'permanent_delete') {
        const reason = permanentDeleteBlockReason(entry.row || entry);
        if (reason) return { ...identity, ok: false, error: reason };
        return { ...identity, ok: true, permanentDelete: true };
      }
      const payload = buildLifecyclePayload(action, entry.row || entry, entry.nowIso);
      return { ...identity, ok: true, payload };
    } catch (err) {
      return {
        id: (entry && entry.id) || null,
        ok: false,
        error: err && err.message ? err.message : 'invalid entry'
      };
    }
  });
}

/** Summarizes per-record bulk outcomes for UI reconcile (partial failure safe). */
export function summarizeBulkOutcome(plans = [], results = []) {
  const byId = new Map();
  results.forEach((result) => {
    if (result && result.id) byId.set(result.id, result);
  });
  const succeeded = [];
  const failed = [];
  const skipped = [];
  plans.forEach((plan) => {
    if (!plan || !plan.ok) {
      if (plan && plan.skipped) skipped.push(plan);
      else failed.push({ id: plan ? plan.id : null, error: plan ? plan.error : 'invalid plan' });
      return;
    }
    const result = byId.get(plan.id);
    if (result && result.success) succeeded.push(plan.id);
    else failed.push({ id: plan.id, error: result && result.error ? result.error : 'unknown error' });
  });
  return { succeeded, failed, skipped, total: plans.length };
}

/** Bulk permanent-delete confirmation phrase, e.g. "DELETE 12". */
export function bulkDeleteConfirmText(count) {
  return `DELETE ${Number(count) || 0}`;
}

export function isBulkDeleteConfirmed(input, count) {
  return String(input || '').trim() === bulkDeleteConfirmText(count);
}
