import assert from 'node:assert/strict';
import {
  adminTableForScope,
  recordDbId,
  isNewAdminRecord,
  buildAdminWritePlan,
  planCategoryOrderWrites,
  planNavigationOrderWrites,
  planSettingWrites,
  applySettingSaveMeta,
  isUniqueViolation,
  classifyAdminWriteError,
  adminWriteError,
  concurrencyConflictError,
  missingRecordError,
  isConcurrencyConflictResponse,
  applySuccessfulSave,
  normalizeSlug,
  slugFromTitle
} from './admin-record-save-core.js';

// --- scope -> table mapping -------------------------------------------------
assert.equal(adminTableForScope('portfolio'), 'portfolio_projects');
assert.equal(adminTableForScope('assets'), 'free_assets');
assert.equal(adminTableForScope('commissions'), 'commission_services');
assert.equal(adminTableForScope('forms'), 'commission_forms');
assert.equal(adminTableForScope('navigation'), 'cms_navigation');
assert.equal(adminTableForScope('requests'), 'commission_requests');
assert.equal(adminTableForScope('pages.about'), 'cms_pages');
assert.equal(adminTableForScope('nope'), null);

// --- identity --------------------------------------------------------------
assert.equal(recordDbId({ dbId: '00000000-0000-0000-0000-000000000001' }), '00000000-0000-0000-0000-000000000001');
assert.equal(recordDbId({ dbId: null }), null);
assert.equal(recordDbId({ id: 'color-fiesta', slug: 'color-fiesta' }), null, 'a slug is not a DB identity');
assert.equal(isNewAdminRecord({ id: 'client-1', dbId: null, slug: '' }), true);
assert.equal(isNewAdminRecord({ id: 'color-fiesta', dbId: 'uuid-1' }), false);
assert.equal(normalizeSlug('  my-slug  '), 'my-slug');
assert.equal(normalizeSlug(null), '');
assert.equal(slugFromTitle('  Ủa là ao  '), 'ua-la-ao');
assert.equal(slugFromTitle('Project Miku tettt'), 'project-miku-tettt');
assert.equal(slugFromTitle('Đẹp quá!!!'), 'dep-qua');

// --- Test 4/5: INSERT for new records, UPDATE by stable DB ID for existing --
const newProject = buildAdminWritePlan('portfolio', { id: 'client-1', dbId: null, slug: 'brand-new', title: 'New', category: 'illustration', tags: [] }, { sortOrder: 3 });
assert.equal(newProject.mode, 'insert');
assert.equal(newProject.table, 'portfolio_projects');
assert.equal(newProject.payload.slug, 'brand-new');
assert.equal(newProject.payload.sort_order, 3);
assert.equal('id' in newProject.payload, false, 'an insert must not send a DB id');

const existingProject = buildAdminWritePlan('portfolio', { id: 'color-fiesta', dbId: 'uuid-9', originalUpdatedAt: '2026-01-01T00:00:00Z', slug: 'color-fiesta', title: 'Fixture', category: 'illustration', tags: [] });
assert.equal(existingProject.mode, 'update');
assert.equal(existingProject.dbId, 'uuid-9');
assert.equal(existingProject.originalUpdatedAt, '2026-01-01T00:00:00Z');
assert.equal(existingProject.payload.slug, 'color-fiesta');
assert.equal('id' in existingProject.payload, false, 'the id belongs in the filter, not the payload');
assert.equal(existingProject.table, 'portfolio_projects');

const existingAsset = buildAdminWritePlan('assets', { id: 'petal-pack', dbId: 'uuid-10', originalUpdatedAt: '2026-01-01T00:00:00Z', slug: 'petal-pack', title: 'Asset', downloadUrl: 'https://x/y.zip' });
assert.equal(existingAsset.table, 'free_assets');
assert.equal(existingAsset.mode, 'update');
assert.equal(existingAsset.payload.file_path, 'https://x/y.zip');

const existingCommission = buildAdminWritePlan('commissions', { id: 'bust-up', dbId: 'uuid-11', originalUpdatedAt: '2026-01-01T00:00:00Z', slug: 'bust-up', title: 'Service', price: '70' });
assert.equal(existingCommission.table, 'commission_services');
assert.equal(existingCommission.payload.slug, 'bust-up');

const existingForm = buildAdminWritePlan('forms', { id: 'emails', dbId: 'uuid-12', slug: 'emails', title: 'Form', fields: [] });
assert.equal(existingForm.table, 'commission_forms');
assert.equal(existingForm.mode, 'update');
assert.equal(existingForm.originalUpdatedAt, null, 'a missing baseline stays null rather than invented');

// --- Test 3: empty slugs are deterministically generated from the title ----
assert.equal(buildAdminWritePlan('portfolio', { id: 'client-2', dbId: null, slug: '', title: 'Ủa là ao' }, {}).payload.slug, 'ua-la-ao');
assert.equal(buildAdminWritePlan('assets', { id: 'client-3', dbId: null, slug: '   ', title: 'Cute Brush Pack' }, {}).payload.slug, 'cute-brush-pack');
assert.equal(buildAdminWritePlan('portfolio', { id: 'color-fiesta', dbId: 'uuid-9', slug: '', title: 'Color Fiesta' }, {}).payload.slug, 'color-fiesta');
assert.throws(() => buildAdminWritePlan('portfolio', { id: 'client-empty', dbId: null, slug: '', title: '' }, {}), /title|slug/i);

// --- Test 2: saving one request touches only that request ------------------
const requestPlan = buildAdminWritePlan('requests', { id: 'req-uuid', dbId: 'req-uuid', originalUpdatedAt: '2026-02-02T00:00:00Z', status: 'Completed', notes: 'Done' });
assert.equal(requestPlan.mode, 'update');
assert.equal(requestPlan.table, 'commission_requests');
assert.deepEqual(Object.keys(requestPlan.payload).sort(), ['admin_notes', 'status']);
assert.equal(requestPlan.payload.status, 'closed');
assert.equal(requestPlan.payload.admin_notes, 'Done');
assert.throws(() => buildAdminWritePlan('requests', { id: 'local-only', dbId: null, status: 'New' }, {}), /database/i);

// --- unsupported scope ------------------------------------------------------
assert.throws(() => buildAdminWritePlan('dashboard', { id: 'x' }, {}), /Unsupported/);

// --- Test 10: order writes are bounded and partial --------------------------
const categories = [
  { id: 'one', dbId: 'uuid-a', kind: 'portfolio', slug: 'one', title: 'One', published: true },
  { id: 'two', dbId: null, slug: 'two', title: 'Two', published: false },
  { id: 'three', dbId: 'uuid-c', slug: 'three', title: 'Three', published: true }
];
assert.deepEqual(planCategoryOrderWrites('portfolio', categories), [{ id: 'uuid-a', sort_order: 0, originalUpdatedAt: null }, { id: 'uuid-c', sort_order: 2, originalUpdatedAt: null }], 'only saved rows, real list positions, order-only payload');

const navigation = [
  { id: 'uuid-1', dbId: 'uuid-1', title: 'A', url: '#a' },
  { id: 'local-2', dbId: null, title: 'B', url: '#b' },
  { id: 'uuid-3', dbId: 'uuid-3', title: 'C', url: '#c' }
];
assert.deepEqual(planNavigationOrderWrites(navigation), [{ id: 'uuid-1', sort_order: 0, originalUpdatedAt: null }, { id: 'uuid-3', sort_order: 2, originalUpdatedAt: null }]);
// P0-01: order rows carry the hydrated baseline so the writer can guard them.
assert.deepEqual(
  planNavigationOrderWrites([{ id: 'a', dbId: 'uuid-a', originalUpdatedAt: '2026-01-01T00:00:00Z' }]),
  [{ id: 'uuid-a', sort_order: 0, originalUpdatedAt: '2026-01-01T00:00:00Z' }],
  'order rows carry the stale-write baseline'
);
assert.deepEqual(planCategoryOrderWrites('asset', []), []);
assert.deepEqual(planNavigationOrderWrites(null), []);

// --- settings singletons: only touched keys, each under its own baseline ----
const settingsDraft = { branding: { title: 'CRABBIE' }, seo: { title: 'x' } };
assert.deepEqual(planSettingWrites(settingsDraft, {}, ['branding']), [
  { key: 'branding', mode: 'insert', originalUpdatedAt: null, payload: { key: 'branding', value: { title: 'CRABBIE' } } }
], 'a key without a baseline is inserted');
assert.deepEqual(planSettingWrites(settingsDraft, { branding: { originalUpdatedAt: '2026-05-05T00:00:00Z' } }, ['branding']), [
  { key: 'branding', mode: 'update', originalUpdatedAt: '2026-05-05T00:00:00Z', payload: { key: 'branding', value: { title: 'CRABBIE' } } }
], 'a loaded key is updated under its hydrated baseline');
assert.deepEqual(planSettingWrites(settingsDraft, {}, []), [], 'no touched keys means no writes');
assert.deepEqual(planSettingWrites(settingsDraft, {}, ['seo']).map((plan) => plan.key), ['seo'], 'only touched keys are planned');
assert.equal(planSettingWrites(settingsDraft, {}, null).length, 2, 'all keys are written only when the caller asks for all');
assert.deepEqual(planSettingWrites({}, {}, ['branding']), [], 'a key missing from the draft is skipped');
assert.equal(planSettingWrites(settingsDraft, { branding: { originalUpdatedAt: '' } }, ['branding'])[0].mode, 'insert', 'an empty baseline falls back to insert semantics');

const settingsMeta = { branding: { originalUpdatedAt: '2026-05-05T00:00:00Z' } };
applySettingSaveMeta(settingsMeta, 'branding', { key: 'branding', updated_at: '2026-06-06T00:00:00Z' });
assert.equal(settingsMeta.branding.originalUpdatedAt, '2026-06-06T00:00:00Z', 'the settings baseline advances after a confirmed save');
applySettingSaveMeta(settingsMeta, 'branding', { key: 'branding' });
assert.equal(settingsMeta.branding.originalUpdatedAt, '2026-06-06T00:00:00Z', 'a response without updated_at must not invent a baseline');
assert.equal(settingsMeta.branding.title, undefined, 'the baseline map never carries the stored value');
assert.equal(isUniqueViolation({ code: '23505', message: 'duplicate key value violates unique constraint "site_settings_pkey"' }), true);
assert.equal(isUniqueViolation({ message: 'unique constraint violated' }), true);
assert.equal(isUniqueViolation({ message: 'network down' }), false);
assert.equal(concurrencyConflictError('settings').code, 'stale_save', 'settings conflicts reuse the record conflict code');

// --- error classification ---------------------------------------------------
const duplicate = classifyAdminWriteError({ code: '23505', message: 'duplicate key value violates unique constraint "portfolio_projects_slug_key"' });
assert.equal(duplicate.code, 'duplicate_slug');
assert.match(duplicate.message, /slug/i);
assert.match(duplicate.detail, /unique constraint/);
assert.equal(classifyAdminWriteError({ code: '23505', message: 'duplicate key value violates unique constraint "cms_categories_kind_slug_key"' }).code, 'duplicate_slug');
assert.equal(classifyAdminWriteError({ message: 'row-level security policy violated' }).code, 'permission_denied');
assert.equal(classifyAdminWriteError({ code: '42501', message: 'permission denied' }).code, 'permission_denied');
const missingField = classifyAdminWriteError({ code: '23502', message: 'null value in column "slug" violates not-null constraint' });
assert.equal(missingField.code, 'missing_field');
assert.equal(missingField.field, 'slug');
assert.match(missingField.message, /slug/i);
assert.equal(classifyAdminWriteError({ message: 'fetch failed' }).code, 'unknown');
assert.match(classifyAdminWriteError({ message: 'fetch failed' }).message, /fetch failed/);
const wrapped = adminWriteError({ code: '23505', message: 'duplicate key value violates unique constraint "x"' });
assert.ok(wrapped instanceof Error);
assert.equal(wrapped.code, 'duplicate_slug');

// --- concurrency ------------------------------------------------------------
assert.equal(isConcurrencyConflictResponse({ data: null, error: null }), true, '0 rows updated on a guarded update is a conflict');
assert.equal(isConcurrencyConflictResponse({ data: [], error: null }), true);
assert.equal(isConcurrencyConflictResponse({ data: { id: 'x' }, error: null }), false);
assert.equal(isConcurrencyConflictResponse({ data: null, error: { message: 'boom' } }), false, 'errors are not conflicts');
assert.equal(concurrencyConflictError('portfolio').code, 'stale_save');
assert.match(concurrencyConflictError('portfolio').message, /another session|reload/i);
assert.equal(missingRecordError('portfolio').code, 'missing_record');
assert.match(missingRecordError('portfolio').message, /no longer exists/i);

// --- Test 7: baseline update only after DB success --------------------------
const saved = { id: 'color-fiesta', dbId: 'uuid-9', originalUpdatedAt: '2026-01-01T00:00:00Z', slug: 'color-fiesta' };
applySuccessfulSave(saved, { id: 'uuid-9', slug: 'color-fiesta', updated_at: '2026-03-03T00:00:00Z' });
assert.equal(saved.originalUpdatedAt, '2026-03-03T00:00:00Z', 'baseline must advance after a successful save');
const untouched = { id: 'x', dbId: 'uuid-x', originalUpdatedAt: '2026-01-01T00:00:00Z', slug: 'x' };
applySuccessfulSave(untouched, { id: 'uuid-x' });
assert.equal(untouched.originalUpdatedAt, '2026-01-01T00:00:00Z', 'a response without updated_at must not invent a baseline');
const inserted = { id: 'client-1', dbId: null, slug: 'brand-new' };
applySuccessfulSave(inserted, { id: 'uuid-new', slug: 'brand-new', updated_at: '2026-04-04T00:00:00Z' });
assert.equal(inserted.dbId, 'uuid-new', 'a newly inserted record becomes an existing record');
assert.equal(inserted.originalUpdatedAt, '2026-04-04T00:00:00Z');
const newerDraft = { id:'client-2', dbId:'uuid-newer', originalUpdatedAt:'2026-01-01T00:00:00Z', slug:'edited-mid-save' };
applySuccessfulSave(newerDraft, { id:'uuid-newer', slug:'mid-save-base', updated_at:'2026-04-05T00:00:00Z' });
assert.equal(newerDraft.slug, 'edited-mid-save', 'a confirmed version-N response must not overwrite a newer live draft slug');
assert.equal(newerDraft.originalUpdatedAt, '2026-04-05T00:00:00Z');
const savedCategory = { id: 'chibi', dbId: 'uuid-category', originalUpdatedAt: '2026-01-01T00:00:00Z', slug: 'chibi' };
applySuccessfulSave(savedCategory, { id: 'uuid-category', slug: 'chibi', updated_at: '2026-05-05T00:00:00Z' });
assert.equal(savedCategory.originalUpdatedAt, '2026-05-05T00:00:00Z', 'a successful category save advances its baseline');

// --- categories use the composite (kind, slug) DB identity safely ----------
assert.equal(adminTableForScope('portfolioCategories'), 'cms_categories');
assert.equal(adminTableForScope('assetCategories'), 'cms_categories');
const categoryUpdate = buildAdminWritePlan('portfolioCategories', { id: 'chibi', dbId: 'uuid-cat', originalUpdatedAt: '2026-01-01T00:00:00Z', slug: 'chibi', title: 'Chibi', published: true });
assert.equal(categoryUpdate.mode, 'update');
assert.equal(categoryUpdate.table, 'cms_categories');
assert.equal(categoryUpdate.originalUpdatedAt, '2026-01-01T00:00:00Z', 'category updates carry the hydrated stale-save baseline');
assert.equal(concurrencyConflictError('portfolioCategories').code, 'stale_save', 'a stale category update uses the shared stale-save conflict path');
assert.deepEqual(categoryUpdate.payload, { kind: 'portfolio', slug: 'chibi', title: 'Chibi', published: true, sort_order: 0 });
const categoryInsert = buildAdminWritePlan('assetCategories', { id: 'client-9', dbId: null, slug: 'brushes', title: 'Brushes' }, { sortOrder: 2 });
assert.equal(categoryInsert.mode, 'insert');
assert.equal(categoryInsert.payload.kind, 'asset');
assert.equal(categoryInsert.payload.sort_order, 2);
assert.equal(buildAdminWritePlan('portfolioCategories', { id: 'client-9', dbId: null, slug: '', title: 'Cute Stuff' }, {}).payload.slug, 'cute-stuff');

console.log('Admin record save core tests passed.');
