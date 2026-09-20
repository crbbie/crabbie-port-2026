/**
 * admin-query-core.js
 * Pure query planning for the admin: explicit select lists, bounded page
 * ranges, page/count math and server-side filter specs.
 *
 * No Supabase access: admin-crud.js applies these specs to real queries.
 */

export const REQUESTS_PAGE_SIZE = 30;
export const MEDIA_PAGE_SIZE = 30;

const NESTED_CATEGORY = 'category:cms_categories(slug,title)';

/**
 * Explicit column lists. Every column here is consumed by an admin mapper or by
 * a Batch 2/3 safety feature (dbId identity, updated_at baselines, media
 * deletion state, digest dedupe).
 */
export const ADMIN_SELECT_COLUMNS = Object.freeze({
  portfolio_projects: Object.freeze([
    'id', 'slug', 'title', 'description', 'tags', 'content', 'thumbnail_path', 'cover_path',
    'featured', 'published', 'sort_order', 'updated_at', NESTED_CATEGORY
  ]),
  free_assets: Object.freeze([
    'id', 'slug', 'title', 'description', 'metadata', 'thumbnail_path', 'file_path', 'file_type',
    'availability', 'featured', 'published', 'sort_order', 'updated_at', NESTED_CATEGORY
  ]),
  cms_categories: Object.freeze(['id', 'kind', 'slug', 'title', 'title_i18n', 'published', 'sort_order', 'updated_at']),
  commission_services: Object.freeze([
    'id', 'slug', 'title', 'description', 'price', 'currency', 'availability', 'form_slug',
    'thumbnail_path', 'featured', 'published', 'sort_order', 'details', 'translations', 'updated_at'
  ]),
  commission_forms: Object.freeze(['id', 'slug', 'title', 'description', 'fields', 'published', 'translations', 'updated_at']),
  cms_pages: Object.freeze(['id', 'slug', 'title', 'content', 'published', 'data', 'translations', 'updated_at']),
  cms_navigation: Object.freeze(['id', 'title', 'url', 'published', 'sort_order', 'updated_at']),
  site_settings: Object.freeze(['key', 'value', 'updated_at']),
  commission_requests: Object.freeze([
    'id', 'client_name', 'client_email', 'contact', 'answers', 'status', 'admin_notes',
    'terms_accepted', 'service_id', 'form_id', 'created_at', 'updated_at'
  ]),
  media: Object.freeze([
    'id', 'bucket_id', 'storage_path', 'original_name', 'mime_type', 'size_bytes', 'alt_text',
    'sha256', 'width', 'height', 'deletion_status', 'deleted_at', 'deletion_error', 'created_at'
  ])
});

/** Database columns each admin mapper/safety feature actually reads. */
export const HYDRATION_MAPPED_COLUMNS = Object.freeze({
  portfolio_projects: Object.freeze(['id', 'slug', 'title', 'description', 'tags', 'content', 'thumbnail_path', 'cover_path', 'featured', 'published', 'updated_at', 'category.slug', 'category.title']),
  free_assets: Object.freeze(['id', 'slug', 'title', 'description', 'metadata', 'thumbnail_path', 'file_path', 'file_type', 'availability', 'featured', 'published', 'updated_at', 'category.slug', 'category.title']),
  cms_categories: Object.freeze(['id', 'kind', 'slug', 'title', 'published', 'sort_order', 'updated_at']),
  commission_services: Object.freeze(['id', 'slug', 'title', 'description', 'price', 'currency', 'availability', 'form_slug', 'thumbnail_path', 'featured', 'published', 'details', 'updated_at']),
  commission_forms: Object.freeze(['id', 'slug', 'title', 'description', 'fields', 'published', 'updated_at']),
  cms_pages: Object.freeze(['id', 'slug', 'title', 'content', 'published', 'data', 'updated_at']),
  cms_navigation: Object.freeze(['id', 'title', 'url', 'published', 'updated_at']),
  site_settings: Object.freeze(['key', 'value', 'updated_at']),
  commission_requests: Object.freeze(['id', 'client_name', 'client_email', 'contact', 'answers', 'status', 'admin_notes', 'terms_accepted', 'created_at', 'updated_at']),
  media: Object.freeze(['id', 'storage_path', 'original_name', 'mime_type', 'size_bytes', 'alt_text', 'sha256', 'width', 'height', 'deletion_status', 'created_at'])
});

export function selectList(table) {
  const columns = ADMIN_SELECT_COLUMNS[table];
  if (!columns) throw new Error('No explicit column list for ' + table);
  return columns.join(',');
}

export function isSelectAll(columns) {
  if (Array.isArray(columns)) return columns.some((column) => String(column).trim() === '*');
  return String(columns || '').split(',').some((column) => column.trim() === '*');
}

/** Reports tables whose explicit list would drop a column a mapper reads. */
export function missingMappedColumns(columnsByTable = ADMIN_SELECT_COLUMNS) {
  const report = [];
  for (const [table, mapped] of Object.entries(HYDRATION_MAPPED_COLUMNS)) {
    const declared = columnsByTable[table];
    if (!Array.isArray(declared)) continue;
    const flat = declared.map((column) => String(column));
    const covers = (name) => {
      if (flat.includes(name)) return true;
      const [head, tail] = name.split('.');
      if (!tail) return false;
      // "category:cms_categories(slug,title)" satisfies category.slug/category.title
      return flat.some((column) => column.startsWith(head + ':') && column.includes(tail));
    };
    const missing = mapped.filter((name) => !covers(name));
    if (missing.length) report.push({ table, columns: missing });
  }
  return report;
}

/** Bounded server-side range for one page: only ever one page is requested. */
export function paginationRange(page, pageSize, fallbackSize = REQUESTS_PAGE_SIZE) {
  const size = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : fallbackSize;
  const parsed = Number(page);
  const safePage = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
  const from = (safePage - 1) * size;
  return { page: safePage, pageSize: size, from, to: from + size - 1 };
}

/** Page bookkeeping from a PostgREST exact count. */
export function pagedSummary({ count, page, pageSize }) {
  const size = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : REQUESTS_PAGE_SIZE;
  const total = Number.isFinite(Number(count)) && Number(count) > 0 ? Math.floor(Number(count)) : 0;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const requested = Number.isFinite(Number(page)) && Number(page) > 1 ? Math.floor(Number(page)) : 1;
  const current = Math.min(requested, pageCount);
  return { total, page: current, pageSize: size, pageCount, hasNext: current < pageCount, hasPrev: current > 1 };
}

/**
 * Which page to request after a deletion finished.
 * `total` is the row count that remains after the deletion and `itemsOnPage`
 * the rows still rendered on the current page.
 */
export function pageAfterDelete({ page, itemsOnPage, total, pageSize }) {
  const summary = pagedSummary({ count: total, page, pageSize });
  if ((Number(itemsOnPage) || 0) > 0) return summary.page;
  return Math.max(1, summary.page - 1);
}

/** PostgREST filter grammar characters and wildcards are stripped. */
export function sanitizeSearchTerm(term) {
  if (term == null) return null;
  const cleaned = String(term)
    .replace(/[,()%*\\"';:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return cleaned || null;
}

export function requestFilterSpec({ status, search, commission } = {}) {
  const cleanStatus = typeof status === 'string' && status && status !== 'all' ? status : null;
  const cleanCommission = typeof commission === 'string' && commission && commission !== 'all' ? commission : null;
  return { status: cleanStatus, commission: cleanCommission, search: sanitizeSearchTerm(search) };
}

export function mediaFilterSpec({ search } = {}) {
  return { deletionStatus: 'active', search: sanitizeSearchTerm(search) };
}

