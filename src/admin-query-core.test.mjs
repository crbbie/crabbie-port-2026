import assert from 'node:assert/strict';
import {
  REQUESTS_PAGE_SIZE,
  MEDIA_PAGE_SIZE,
  ADMIN_SELECT_COLUMNS,
  HYDRATION_MAPPED_COLUMNS,
  missingMappedColumns,
  paginationRange,
  pagedSummary,
  pageAfterDelete,
  sanitizeSearchTerm,
  requestFilterSpec,
  mediaFilterSpec,
  isSelectAll
} from './admin-query-core.js';

// --- page sizes are bounded ------------------------------------------------
assert.ok(REQUESTS_PAGE_SIZE >= 30 && REQUESTS_PAGE_SIZE <= 50, 'requests page size stays in the 30-50 range');
assert.ok(MEDIA_PAGE_SIZE >= 24 && MEDIA_PAGE_SIZE <= 50, 'media page size is a sane grid page');

// --- Test 3/4 core: range math --------------------------------------------
assert.deepEqual(paginationRange(1, 30), { page: 1, pageSize: 30, from: 0, to: 29 });
assert.deepEqual(paginationRange(2, 30), { page: 2, pageSize: 30, from: 30, to: 59 });
assert.deepEqual(paginationRange(4, 25), { page: 4, pageSize: 25, from: 75, to: 99 });
assert.deepEqual(paginationRange(0, 30), { page: 1, pageSize: 30, from: 0, to: 29 }, 'page numbers below 1 clamp');
assert.deepEqual(paginationRange('3', 30), { page: 3, pageSize: 30, from: 60, to: 89 }, 'string page numbers are accepted');
assert.deepEqual(paginationRange(1, 0), { page: 1, pageSize: REQUESTS_PAGE_SIZE, from: 0, to: REQUESTS_PAGE_SIZE - 1 }, 'a bad size falls back');

// --- Test 5: total count handling -----------------------------------------
assert.deepEqual(pagedSummary({ count: 61, page: 2, pageSize: 30 }), { total: 61, page: 2, pageSize: 30, pageCount: 3, hasNext: true, hasPrev: true });
assert.deepEqual(pagedSummary({ count: 61, page: 3, pageSize: 30 }), { total: 61, page: 3, pageSize: 30, pageCount: 3, hasNext: false, hasPrev: true });
assert.deepEqual(pagedSummary({ count: 0, page: 1, pageSize: 30 }), { total: 0, page: 1, pageSize: 30, pageCount: 1, hasNext: false, hasPrev: false });
assert.deepEqual(pagedSummary({ count: 10, page: 9, pageSize: 30 }), { total: 10, page: 1, pageSize: 30, pageCount: 1, hasNext: false, hasPrev: false }, 'an out-of-range page is pulled back');
assert.equal(pagedSummary({ count: null, page: 1, pageSize: 30 }).total, 0, 'a missing count is treated as empty, never as everything');

// --- Test 9: deleting the last item on a page -----------------------------
// Contract: `total` counts the rows left AFTER the deletion, itemsOnPage the
// rows still rendered on the current page.
assert.equal(pageAfterDelete({ page: 2, itemsOnPage: 1, total: 31, pageSize: 30 }), 2, 'a page that still has rows stays put');
assert.equal(pageAfterDelete({ page: 3, itemsOnPage: 1, total: 1, pageSize: 30 }), 1, 'an out-of-range page is pulled back');
assert.equal(pageAfterDelete({ page: 2, itemsOnPage: 5, total: 35, pageSize: 30 }), 2);
assert.equal(pageAfterDelete({ page: 2, itemsOnPage: 0, total: 30, pageSize: 30 }), 1, 'emptying a page falls back one page');
assert.equal(pageAfterDelete({ page: 3, itemsOnPage: 0, total: 1, pageSize: 30 }), 1);
assert.equal(pageAfterDelete({ page: 1, itemsOnPage: 1, total: 1, pageSize: 30 }), 1);

// --- request filters -------------------------------------------------------
assert.deepEqual(requestFilterSpec({}), { status: null, commission: null, search: null });
assert.deepEqual(requestFilterSpec({ status: 'all', search: '  ' }), { status: null, commission: null, search: null }, 'the UI "all" option is not a server filter');
assert.deepEqual(requestFilterSpec({ status: 'new', search: ' ann ' }), { status: 'new', commission: null, search: 'ann' });
assert.deepEqual(requestFilterSpec({ status: 'contacted', search: null }), { status: 'contacted', commission: null, search: null });
assert.deepEqual(requestFilterSpec({ commission: 'Character Design' }), { status: null, commission: 'Character Design', search: null }, 'the commission filter runs server-side as well');

assert.equal(sanitizeSearchTerm('ann, (smith)'), 'ann smith', 'PostgREST grammar characters are stripped');
assert.equal(sanitizeSearchTerm('  '), null);
assert.equal(sanitizeSearchTerm(null), null);
assert.equal(sanitizeSearchTerm('x%_;y'), 'x _ y', 'wildcards and grammar characters become spaces');
assert.equal(sanitizeSearchTerm('a'.repeat(120)).length, 80, 'search terms are length capped');

assert.deepEqual(mediaFilterSpec({ search: 'petal' }), { deletionStatus: 'active', search: 'petal' });
assert.deepEqual(mediaFilterSpec({}), { deletionStatus: 'active', search: null }, 'media pagination is always active-only');

// --- Test 10: explicit columns cover every mapped field --------------------
assert.deepEqual(missingMappedColumns(), [], 'every mapped database column is present in the explicit select list');
assert.ok(!isSelectAll(ADMIN_SELECT_COLUMNS.portfolio_projects), 'no admin read uses select *');
for (const [table, columns] of Object.entries(ADMIN_SELECT_COLUMNS)) {
  assert.ok(Array.isArray(columns) && columns.length > 0, table + ' declares explicit columns');
  assert.ok(!columns.includes('*'), table + ' must not select every column implicitly');
}
const portfolioColumns = ADMIN_SELECT_COLUMNS.portfolio_projects;
for (const required of ['id', 'slug', 'title', 'content', 'thumbnail_path', 'cover_path', 'updated_at']) {
  assert.ok(portfolioColumns.includes(required), 'portfolio select keeps ' + required);
}
assert.ok(portfolioColumns.some((column) => column.startsWith('category:')), 'the nested category selection is kept');
assert.ok(HYDRATION_MAPPED_COLUMNS.cms_categories.includes('updated_at'), 'category stale-save baseline is required mapped coverage');
const mediaColumns = ADMIN_SELECT_COLUMNS.media;
for (const required of ['id', 'storage_path', 'original_name', 'mime_type', 'size_bytes', 'alt_text', 'created_at', 'sha256', 'deletion_status']) {
  assert.ok(mediaColumns.includes(required), 'media select keeps ' + required);
}
const requestColumns = ADMIN_SELECT_COLUMNS.commission_requests;
for (const required of ['id', 'client_name', 'client_email', 'answers', 'status', 'created_at', 'updated_at']) {
  assert.ok(requestColumns.includes(required), 'requests select keeps ' + required);
}

const incomplete = missingMappedColumns({ media: ['id'] });
assert.equal(incomplete.length, 1, 'an incomplete column list is reported');
assert.equal(incomplete[0].table, 'media');
assert.ok(incomplete[0].columns.includes('storage_path'));

console.log('Admin query core tests passed.');
