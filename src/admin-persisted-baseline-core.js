/**
 * admin-persisted-baseline-core.js
 * Reconciles ADMIN_DATA with exactly what a save confirmed.
 *
 * Invariant: ADMIN_DATA always represents the latest CONFIRMED persisted
 * state known by this browser, while ADMIN_DRAFT may be newer and dirty.
 * After each successful target write the caller reconciles that target from
 * the version-N snapshot captured at save start plus the confirmed server
 * response — never from the live draft, which may already hold version N+1.
 * Dirty-state clearing stays a separate revision-gated decision.
 * No DOM, no Supabase access.
 */

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function hasOwn(obj, key) {
  return obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

/* Server-generated identity/baseline fields come from the confirmed database
 * response only. Editable field values always come from the captured
 * snapshot, so a newer unsaved draft can never leak into the baseline. */
function applyServerIdentity(entry, row) {
  if (!entry || typeof entry !== 'object') return entry;
  if (!row || typeof row !== 'object') return entry;
  if (typeof row.id === 'string' && row.id) entry.dbId = row.id;
  if (typeof row.slug === 'string' && row.slug) entry.slug = row.slug;
  if (typeof row.updated_at === 'string' && row.updated_at) entry.originalUpdatedAt = row.updated_at;
  return entry;
}

function findRecordIndex(list, entry) {
  return list.findIndex(function (candidate) {
    if (!candidate || typeof candidate !== 'object') return false;
    if (entry.dbId && candidate.dbId) return candidate.dbId === entry.dbId;
    return candidate.id === entry.id;
  });
}

/**
 * Advances the persisted baseline for one successfully written target.
 * `captured` is the version-N snapshot taken before the write; `result` is
 * the adapter's confirmed response ({ row } for records, { savedKeys } for
 * settings, anything for order). Returns true when the baseline advanced.
 */
export function reconcileSavedTarget(saved, target, captured, result) {
  if (!saved || !target || typeof target !== 'object') return false;
  var outcome = result && typeof result === 'object' ? result : {};

  if (target.kind === 'order') {
    if (!Array.isArray(captured)) return false;
    saved[target.scope] = cloneJson(captured);
    return true;
  }

  if (target.kind === 'settings') {
    if (!captured || typeof captured !== 'object') return false;
    if (!saved.settings || typeof saved.settings !== 'object') return false;
    var keys = Array.isArray(outcome.savedKeys) ? outcome.savedKeys
      : (Array.isArray(target.keys) ? target.keys : Object.keys(captured));
    var advanced = false;
    keys.forEach(function (key) {
      if (typeof key === 'string' && hasOwn(captured, key)) {
        saved.settings[key] = cloneJson(captured[key]);
        advanced = true;
      }
    });
    return advanced;
  }

  /* Record targets, including pages.about / pages.terms. */
  if (target.kind !== 'record') return false;
  if (!captured || typeof captured !== 'object' || Array.isArray(captured)) return false;
  var entry = applyServerIdentity(cloneJson(captured), outcome.row);
  if (target.scope === 'pages.about' || target.scope === 'pages.terms') {
    var pageKey = String(target.scope).split('.')[1];
    if (!pageKey) return false;
    if (!saved.pages || typeof saved.pages !== 'object') saved.pages = {};
    saved.pages[pageKey] = entry;
    return true;
  }
  var list = saved[target.scope];
  if (!Array.isArray(list)) return false;
  var index = findRecordIndex(list, entry);
  if (index === -1) list.push(entry);
  else list[index] = entry;
  return true;
}
