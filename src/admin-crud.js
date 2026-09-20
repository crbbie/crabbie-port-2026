import { supabase, isConfigured } from './supabase-client.js';
import { deleteMediaFile } from './admin-media.js';
import { mapAdminHydrationResults, recordIdentityFromRow } from './admin-hydration-core.js';
import { formatRequestRowForAdmin } from './commission-requests-core.js';
import {
  pageAfterDelete,
  selectList,
  paginationRange,
  pagedSummary,
  requestFilterSpec,
  pendingCountDatasets,
  REQUESTS_PAGE_SIZE,
  MEDIA_PAGE_SIZE
} from './admin-query-core.js';
import { canMutateAdmin } from './admin-draft-guard-core.js';
import {
  adminTableForScope,
  buildAdminWritePlan,
  planCategoryOrderWrites,
  planRecordOrderWrites,
  planSettingWrites,
  applySettingSaveMeta,
  isUniqueViolation,
  adminWriteError,
  concurrencyConflictError,
  missingRecordError,
  isConcurrencyConflictResponse,
  applySuccessfulSave,
  recordDbId
} from './admin-record-save-core.js';

// Single-owner readiness for admin writes. Only one complete successful live
// hydration may enable mutations; a failed hydration blocks every write.
let adminLoadState = 'idle';

export function setAdminLoadState(state) {
  adminLoadState = state;
}

export function getAdminLoadState() {
  return adminLoadState;
}

export function resetAdminReadiness() {
  adminLoadState = 'idle';
}

export function assertAdminReadyForMutation() {
  if (!canMutateAdmin(adminLoadState)) {
    throw new Error('Admin data is not ready for mutation.');
  }
}

export async function loadAllAdminDataFromSupabase() {
  if (!isConfigured || !supabase) {
    adminLoadState = 'error';
    throw new Error('Supabase is not configured.');
  }

  adminLoadState = 'loading';

  try {
    // Prompt 4: the atomic core hydration carries only small CMS/config data,
    // always with explicit columns. commission_requests and media are paged
    // datasets that load on their own (see loadAdminRequestPage / media panel)
    // so a large inbox or library can never block or inflate the CMS snapshot.
    const [
      pRes,
      aRes,
      categoriesRes,
      cRes,
      fRes,
      pagesRes,
      navRes,
      settingsRes
    ] = await Promise.all([
      supabase.from('portfolio_projects').select(selectList('portfolio_projects')).order('sort_order', { ascending: true }),
      supabase.from('free_assets').select(selectList('free_assets')).order('sort_order', { ascending: true }),
      supabase.from('cms_categories').select(selectList('cms_categories')).order('kind', { ascending: true }).order('sort_order', { ascending: true }),
      supabase.from('commission_services').select(selectList('commission_services')).order('sort_order', { ascending: true }),
      supabase.from('commission_forms').select(selectList('commission_forms')),
      supabase.from('cms_pages').select(selectList('cms_pages')),
      supabase.from('cms_navigation').select(selectList('cms_navigation')).order('sort_order', { ascending: true }),
      supabase.from('site_settings').select(selectList('site_settings'))
    ]);

    const snapshot = mapAdminHydrationResults({
      portfolio: pRes,
      assets: aRes,
      categories: categoriesRes,
      commissions: cRes,
      forms: fRes,
      pages: pagesRes,
      navigation: navRes,
      settings: settingsRes
    }, (path) => supabase.storage.from('media').getPublicUrl(path).data.publicUrl);

    adminLoadState = 'ready';
    return snapshot;
  } catch (err) {
    // A failed complete hydration must never fall back to partial or prototype
    // admin data: every mutation stays blocked until a full retry succeeds.
    adminLoadState = 'error';
    console.error('Error loading admin data from Supabase:', err);
    throw err;
  }
}

/* ---------------------------------------------------------------------------
 * Prompt 2: record-scoped writes.
 *
 * A normal editor save writes exactly one record:
 *   - a record with a DB uuid is UPDATEd through that uuid only
 *   - a record without a DB uuid is INSERTed (never upsert-by-slug)
 *   - every update carries the hydrated updated_at baseline, so a save that
 *     loses a race changes zero rows and is reported as a conflict
 *   - no collection is ever re-upserted for a single-record edit
 * ------------------------------------------------------------------------- */

const SLUGGED_TABLES = new Set(['portfolio_projects', 'free_assets', 'commission_services', 'commission_forms', 'cms_pages', 'cms_categories']);
// Only tables that really have a slug column may select it back.
function recordSelectFor(table) {
  return SLUGGED_TABLES.has(table) ? 'id, slug, updated_at' : 'id, updated_at';
}
const DELETABLE_SCOPES = new Set(['portfolio', 'assets', 'commissions', 'forms', 'navigation', 'requests']);

async function insertAdminRow(plan) {
  const response = await supabase.from(plan.table).insert(plan.payload).select(recordSelectFor(plan.table)).maybeSingle();
  if (response.error) throw adminWriteError(response.error);
  if (!response.data) throw missingRecordError(plan.scope);
  return response.data;
}

async function updateAdminRow(plan) {
  let request = supabase.from(plan.table).update(plan.payload).eq('id', plan.dbId);
  if (plan.originalUpdatedAt) request = request.eq('updated_at', plan.originalUpdatedAt);
  const response = await request.select(recordSelectFor(plan.table)).maybeSingle();
  if (response.error) throw adminWriteError(response.error);
  // A guarded update that matched no row means another session changed it first.
  if (isConcurrencyConflictResponse(response)) throw concurrencyConflictError(plan.scope);
  return response.data;
}

export async function saveAdminRecord(scope, record, options = {}) {
  assertAdminReadyForMutation();
  if (!isConfigured || !supabase) throw new Error('Supabase is not configured.');
  if (!record || typeof record !== 'object') throw new Error('Nothing to save.');

  const plan = buildAdminWritePlan(scope, record, options);
  const row = plan.mode === 'insert' ? await insertAdminRow(plan) : await updateAdminRow(plan);
  // Only a confirmed database response may advance the local baseline.
  applySuccessfulSave(record, row);
  return { success: true, mode: plan.mode, table: plan.table, row };
}

function settingsWriteError(error, key) {
  if (isUniqueViolation(error)) {
    // The key appeared in another session between hydration and this save:
    // report the same conflict the record saves report instead of overwriting.
    const conflict = concurrencyConflictError('settings');
    conflict.detail = String((error && error.message) || '');
    conflict.settingKey = key;
    return conflict;
  }
  return adminWriteError(error);
}

/**
 * Settings are written per touched key. A key that was hydrated keeps its own
 * updated_at baseline, so a save that lost a race changes zero rows and is
 * reported as a conflict instead of overwriting the newer stored value.
 */
export async function saveAdminSettings(settings, keys, settingsMeta) {
  assertAdminReadyForMutation();
  if (!isConfigured || !supabase) throw new Error('Supabase is not configured.');

  const plans = planSettingWrites(settings, settingsMeta, keys);
  if (!plans.length) return { success: true, table: 'site_settings', count: 0, savedKeys: [] };

  // One guarded write per touched key: a settings row is a key/value singleton,
  // so the key and its baseline both belong in the statement itself.
  // savedKeys reports exactly the keys the database confirmed, so a later key
  // that fails cannot erase the baseline of an earlier key that succeeded.
  const savedKeys = [];
  for (const plan of plans) {
    if (plan.mode === 'update') {
      let request = supabase.from('site_settings').update({ value: plan.payload.value }).eq('key', plan.key);
      if (plan.originalUpdatedAt) request = request.eq('updated_at', plan.originalUpdatedAt);
      const response = await request.select('key, updated_at').maybeSingle();
      if (response.error) throw adminWriteError(response.error);
      if (isConcurrencyConflictResponse(response)) throw concurrencyConflictError('settings');
      applySettingSaveMeta(settingsMeta, plan.key, response.data);
    } else {
      // A key that was never loaded is inserted; if another session created it
      // first, the key conflict is surfaced instead of an overwrite.
      const response = await supabase.from('site_settings').insert(plan.payload).select('key, updated_at').maybeSingle();
      if (response.error) throw settingsWriteError(response.error, plan.key);
      if (!response.data) throw missingRecordError('settings');
      applySettingSaveMeta(settingsMeta, plan.key, response.data);
    }
    savedKeys.push(plan.key);
  }

  return { success: true, table: 'site_settings', count: plans.length, savedKeys };
}

/**
 * Ordering changes genuinely affect several rows, so they stay a single bounded
 * write: order-only payloads ({ id, sort_order }) for rows that already exist.
 * Rows that are not in the database yet keep their order on their next save.
 */
export async function saveAdminOrder(scope, list) {
  assertAdminReadyForMutation();
  if (!isConfigured || !supabase) throw new Error('Supabase is not configured.');

  let table = null;
  let rows = null;
  if (scope === 'portfolio' || scope === 'assets' || scope === 'commissions' || scope === 'forms' || scope === 'navigation') {
    table = adminTableForScope(scope);
    rows = planRecordOrderWrites(list);
  } else if (scope === 'portfolioCategories' || scope === 'assetCategories') {
    table = 'cms_categories';
    rows = planCategoryOrderWrites(scope === 'portfolioCategories' ? 'portfolio' : 'asset', list);
  } else {
    throw new Error(`Unsupported order target: ${scope}`);
  }

  if (!rows.length) return { success: true, table, count: 0 };

  const response = await supabase.from(table).upsert(rows, { onConflict: 'id' }).select('id');
  if (response.error) throw adminWriteError(response.error);
  return { success: true, table, count: rows.length };
}

export async function deleteAdminRecord(listKey, target) {
  assertAdminReadyForMutation();
  if (!isConfigured || !supabase) throw new Error('Supabase is not configured.');

  if (listKey === 'media') {
    const mediaId = typeof target === 'string' ? target : (target && target.id);
    if (!mediaId) throw new Error('Cannot delete a media item without an id.');
    const mediaResult = await deleteMediaFile(mediaId, target && typeof target === 'object' ? target.storagePath : null);
    if (mediaResult && mediaResult.blocked) {
      const blockedError = new Error(mediaResult.error || 'This media file is still used and cannot be deleted.');
      blockedError.code = 'media_in_use';
      blockedError.usages = mediaResult.usages || [];
      throw blockedError;
    }
    if (mediaResult && mediaResult.pending) {
      const pendingError = new Error(mediaResult.error || 'Media deletion is incomplete.');
      pendingError.code = 'media_delete_pending';
      pendingError.status = mediaResult.status;
      throw pendingError;
    }
    if (!mediaResult || !mediaResult.success) {
      throw new Error(mediaResult && mediaResult.error ? mediaResult.error : 'Media delete failed.');
    }
    return { success: true, table: 'media', status: mediaResult.status || 'deleted' };
  }

  if (!DELETABLE_SCOPES.has(listKey)) throw new Error(`Unsupported delete target: ${listKey}`);
  const table = adminTableForScope(listKey);
  // Deletes use the stable DB uuid, never a slug and never an id-length guess.
  const dbId = recordDbId(target);
  if (!dbId) throw new Error('This record has not been saved to the database yet.');

  const response = await supabase.from(table).delete().eq('id', dbId).select('id');
  if (response.error) throw adminWriteError(response.error);
  const deleted = Array.isArray(response.data) ? response.data : [];
  if (!deleted.length) throw missingRecordError(listKey);
  return { success: true, table, dbId };
}

/**
 * Prompt 4: paged secondary datasets.
 * Commission requests never load as a whole table. One page is fetched with an
 * exact count, ordered server-side and filtered server-side.
 */
export async function loadAdminRequestPage(options = {}) {
  if (!isConfigured || !supabase) throw new Error('Supabase is not configured.');

  const range = paginationRange(options.page, options.pageSize || REQUESTS_PAGE_SIZE);
  const spec = requestFilterSpec({ status: options.status, search: options.search, commission: options.commission });

  let query = supabase
    .from('commission_requests')
    .select(selectList('commission_requests'), { count: 'exact' });

  if (spec.status) query = query.eq('status', spec.status);
  // jsonb answer filter: request rows store the service title in answers.service
  if (spec.commission) query = query.eq('answers->>service', spec.commission);
  if (spec.search) {
    const pattern = '%' + spec.search + '%';
    query = query.or(`client_name.ilike.${pattern},client_email.ilike.${pattern},contact.ilike.${pattern}`);
  }

  const { data, error, count } = await query.order('created_at', { ascending: false }).range(range.from, range.to);
  if (error) throw new Error(`Commission Requests load failed: ${error.message}`);

  const rows = (Array.isArray(data) ? data : []).map((row) => ({
    ...formatRequestRowForAdmin(row),
    ...recordIdentityFromRow(row)
  }));

  return {
    dataset: 'requests',
    items: rows,
    count,
    filters: spec,
    ...pagedSummary({ count, page: range.page, pageSize: range.pageSize })
  };
}

/** Head-count only: badges and dashboards never download a whole table. */
export async function countAdminRows(datasets) {
  if (!isConfigured || !supabase) return {};
  const wanted = Array.isArray(datasets) ? datasets : [datasets];
  const result = {};
  await Promise.all(wanted.map(async (dataset) => {
    try {
      if (dataset === 'requests') {
        const { count, error } = await supabase.from('commission_requests').select('id', { count: 'exact', head: true });
        if (!error) result.requests = count;
      } else if (dataset === 'media') {
        const { count, error } = await supabase.from('media').select('id', { count: 'exact', head: true }).eq('deletion_status', 'active');
        if (!error) result.media = count;
      }
    } catch (err) {
      // An unknown count stays unknown; it must never look like zero rows.
    }
  }));
  return result;
}

window.CrabbieAdminCrud = {
  loadAllAdminData: loadAllAdminDataFromSupabase,
  loadRequestPage: loadAdminRequestPage,
  countRows: countAdminRows,
  pageAfterDelete,
  pendingCountDatasets,
  saveRecord: saveAdminRecord,
  saveSettings: saveAdminSettings,
  saveOrder: saveAdminOrder,
  deleteRecord: deleteAdminRecord,
  setAdminLoadState,
  getAdminLoadState,
  resetAdminReadiness,
  assertAdminReadyForMutation
};

/* First-load race: session restoration may have run before this module
   arrived, deferring hydration. If an admin is already waiting, start the
   deferred pass exactly once; the hydration guards still apply. */
try {
  const authService = typeof window !== 'undefined' ? window.CrabbieAuthService : null;
  const bridge = typeof window !== 'undefined' ? window.CrabbieAdminAuth : null;
  const waiter = authService && typeof authService.getAdmin === 'function' ? authService.getAdmin() : null;
  if (waiter && bridge && typeof bridge.notify === 'function' && getAdminLoadState() !== 'ready') {
    bridge.notify({ event: 'CRUD_READY', adminUser: waiter, hydrate: true });
  }
} catch (err) {
  /* The manual reload control remains available as the fallback path. */
}
