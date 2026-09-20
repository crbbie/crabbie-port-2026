import { normalizeRequestFormFields } from './admin-roundtrip-core.js';
/**
 * admin-record-save-core.js
 * Pure identity, payload, ordering and concurrency rules for safe admin saves.
 *
 * Rules encoded here:
 *   - a record with a DB uuid is UPDATEd by that uuid, a record without one is INSERTed
 *   - a slug is never used as the write identity and never silently overwrites a row
 *   - every update carries the hydrated updated_at baseline (optimistic concurrency)
 *   - ordering writes are bounded, order-only payloads
 * No DOM, no Supabase access.
 */
import {
  formatPortfolioRow,
  formatAssetRow,
  formatCommissionRow,
  formatNavigationRow,
  formatPageRow,
  formatSettingRow
} from './admin-crud-core.js';
import { mapAdminStatusToDbStatus } from './commission-requests-core.js';

export const ADMIN_RECORD_TABLES = Object.freeze({
  portfolio: 'portfolio_projects',
  assets: 'free_assets',
  commissions: 'commission_services',
  forms: 'commission_forms',
  navigation: 'cms_navigation',
  requests: 'commission_requests',
  'pages.about': 'cms_pages',
  'pages.terms': 'cms_pages',
  portfolioCategories: 'cms_categories',
  assetCategories: 'cms_categories',
  settings: 'site_settings'
});

const SLUG_SCOPES = new Set(['portfolio', 'assets', 'commissions', 'forms', 'portfolioCategories', 'assetCategories']);

export function adminTableForScope(scope) {
  return ADMIN_RECORD_TABLES[scope] || null;
}

export function recordDbId(record) {
  if (!record || typeof record.dbId !== 'string') return null;
  const trimmed = record.dbId.trim();
  return trimmed ? trimmed : null;
}

export function isNewAdminRecord(record) {
  return recordDbId(record) === null;
}

export function normalizeSlug(value) {
  return value == null ? '' : String(value).trim();
}

function requireSlug(scope, record) {
  const slug = normalizeSlug(record && record.slug);
  if (slug) return slug;
  if (isNewAdminRecord(record)) throw new Error('Enter a slug before saving this new record.');
  throw new Error('This record needs a slug before it can be saved.');
}

function pageSlugForScope(scope) {
  return scope === 'pages.about' ? 'about' : 'terms';
}

/**
 * Builds the single write plan for one admin record.
 * returns { scope, table, mode: 'insert'|'update', dbId, originalUpdatedAt, payload }
 */
export function buildAdminWritePlan(scope, record, options = {}) {
  const table = adminTableForScope(scope);
  if (!table) throw new Error(`Unsupported save target: ${scope}`);
  const source = record || {};
  const dbId = recordDbId(source);
  const sortOrder = Number.isInteger(options.sortOrder) ? options.sortOrder : 0;
  const plan = {
    scope,
    table,
    mode: dbId ? 'update' : 'insert',
    dbId,
    originalUpdatedAt: typeof source.originalUpdatedAt === 'string' && source.originalUpdatedAt ? source.originalUpdatedAt : null
  };

  if (scope === 'requests') {
    if (!dbId) throw new Error('This commission request has not been loaded from the database yet.');
    plan.payload = { status: mapAdminStatusToDbStatus(source.status), admin_notes: source.notes || '' };
    return plan;
  }

  if (scope === 'navigation') {
    plan.payload = formatNavigationRow(source, sortOrder);
    return plan;
  }

  if (scope === 'pages.about' || scope === 'pages.terms') {
    plan.payload = formatPageRow(pageSlugForScope(scope), source);
    return plan;
  }

  if (scope === 'settings') {
    throw new Error('Settings are saved per key, not as a single record.');
  }

  if (scope === 'portfolioCategories' || scope === 'assetCategories') {
    const kind = scope === 'portfolioCategories' ? 'portfolio' : 'asset';
    plan.payload = {
      kind,
      slug: requireSlug(scope, source),
      title: source.title || 'Untitled category',
      published: !!source.published,
      sort_order: sortOrder
    };
    return plan;
  }

  const slug = requireSlug(scope, source);
  const withSlug = { ...source, slug };

  if (scope === 'portfolio') {
    plan.payload = { ...formatPortfolioRow(withSlug, sortOrder), category_id: options.categoryId || null };
    plan.payload.content = { ...(plan.payload.content || {}), categorySlug: source.category || '' };
  } else if (scope === 'assets') {
    plan.payload = { ...formatAssetRow(withSlug, sortOrder), category_id: options.categoryId || null };
    plan.payload.metadata = { ...(plan.payload.metadata || {}), categorySlug: source.category || '' };
  } else if (scope === 'commissions') {
    plan.payload = formatCommissionRow(withSlug, sortOrder);
  } else if (scope === 'forms') {
    plan.payload = {
      slug,
      title: source.title || 'Untitled form',
      description: source.description || '',
      fields: normalizeRequestFormFields(Array.isArray(source.fields) ? source.fields : []),
      published: !!source.published
    };
  }

  return plan;
}

/** Ordering writes: one bounded, order-only payload per saved row. */
export function planCategoryOrderWrites(kind, list) {
  if (!Array.isArray(list)) return [];
  const rows = [];
  list.forEach((record, index) => {
    const dbId = recordDbId(record);
    if (dbId) rows.push({ id: dbId, sort_order: index });
  });
  return rows;
}

export function planRecordOrderWrites(list) {
  if (!Array.isArray(list)) return [];
  const rows = [];
  list.forEach((record, index) => {
    const dbId = recordDbId(record);
    if (dbId) rows.push({ id: dbId, sort_order: index });
  });
  return rows;
}

// Navigation is one of the ordered collections; the rule is shared.
export function planNavigationOrderWrites(list) {
  return planRecordOrderWrites(list);
}

/**
 * Settings are key/value singletons: only the requested keys are planned, and a
 * key that was loaded from the database keeps its own updated_at baseline so a
 * stale settings save changes zero rows instead of overwriting a newer value.
 */
export function planSettingWrites(settings, settingsMeta, keys) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const meta = settingsMeta && typeof settingsMeta === 'object' ? settingsMeta : {};
  const selected = Array.isArray(keys) ? keys : Object.keys(source);
  return selected
    .filter((key) => typeof key === 'string' && Object.prototype.hasOwnProperty.call(source, key))
    .map((key) => {
      const entry = meta[key];
      const baseline = entry && typeof entry.originalUpdatedAt === 'string' && entry.originalUpdatedAt ? entry.originalUpdatedAt : null;
      return {
        key,
        mode: baseline ? 'update' : 'insert',
        originalUpdatedAt: baseline,
        payload: formatSettingRow(key, source[key])
      };
    });
}

/** Only a confirmed database response may advance a settings baseline. */
export function applySettingSaveMeta(settingsMeta, key, row) {
  if (!settingsMeta || typeof settingsMeta !== 'object' || !key || !row) return settingsMeta;
  if (typeof row.updated_at === 'string' && row.updated_at) {
    settingsMeta[key] = Object.assign({}, settingsMeta[key], { originalUpdatedAt: row.updated_at });
  }
  return settingsMeta;
}

/** A primary-key or unique-constraint violation means the row already exists. */
export function isUniqueViolation(error) {
  const detail = String((error && error.message) || '');
  const code = error && error.code ? String(error.code) : '';
  return code === '23505' || /duplicate key|unique constraint/i.test(detail);
}

/** Turns a database error into an action-able user message plus a detail trail. */
export function classifyAdminWriteError(error) {
  const detail = String((error && error.message) || error || 'Unknown database error');
  const code = error && error.code ? String(error.code) : '';
  if (code === '23505' || /duplicate key|unique constraint|already exists/i.test(detail)) {
    return { code: 'duplicate_slug', message: 'That slug is already used by another record. Choose a different slug.', detail };
  }
  if (code === '23503' || /foreign key/i.test(detail)) {
    return { code: 'missing_reference', message: 'A related record is missing, so this change cannot be saved.', detail };
  }
  if (code === '23502' || /null value in column/i.test(detail)) {
    return { code: 'missing_field', message: 'A required field is empty, so this change cannot be saved.', detail };
  }
  if (code === '23514' || /check constraint/i.test(detail)) {
    return { code: 'invalid_value', message: 'One of the values is not allowed by the database.', detail };
  }
  if (code === '42501' || /row-level security|permission denied|not authorized|violates row-level/i.test(detail)) {
    return { code: 'permission_denied', message: 'You do not have permission to change this record.', detail };
  }
  if (code === '42P01' || code === 'PGRST205') {
    return { code: 'missing_table', message: 'The CMS tables are not available in this project.', detail };
  }
  return { code: 'unknown', message: `Save failed: ${detail}`, detail };
}

export function adminWriteError(error) {
  const info = classifyAdminWriteError(error);
  const wrapped = new Error(info.message);
  wrapped.code = info.code;
  wrapped.detail = info.detail;
  return wrapped;
}

export function concurrencyConflictError(scope) {
  const error = new Error('This record was changed in another session. Reload to review the latest version before saving again.');
  error.code = 'stale_save';
  error.scope = scope || null;
  return error;
}

export function missingRecordError(scope) {
  const error = new Error('This record no longer exists in the database. Reload the page to refresh your draft.');
  error.code = 'missing_record';
  error.scope = scope || null;
  return error;
}

/** A guarded update that matched no row means another session changed it first. */
export function isConcurrencyConflictResponse(response) {
  if (!response || response.error) return false;
  const data = response.data;
  if (data === null || data === undefined) return true;
  return Array.isArray(data) && data.length === 0;
}

/** Only a confirmed database response may advance the local baseline. */
export function applySuccessfulSave(record, row) {
  if (!record || !row) return record;
  if (typeof row.id === 'string' && row.id) record.dbId = row.id;
  const slug = normalizeSlug(row.slug);
  if (slug) record.slug = slug;
  if (typeof row.updated_at === 'string' && row.updated_at) record.originalUpdatedAt = row.updated_at;
  return record;
}
