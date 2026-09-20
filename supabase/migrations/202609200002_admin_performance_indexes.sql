-- CRABBIE CMS Batch 4: query-pattern indexes and the SHA-256 digest column.
--
-- Only indexes that match real admin queries (and the FK cascades the admin
-- triggers by deleting categories/services/forms) are added here. Primary key
-- and UNIQUE constraint indexes are never duplicated.

-- 1. Content digest for duplicate detection --------------------------------
alter table public.media add column if not exists sha256 text;

-- Only ACTIVE rows are constrained: a tombstoned or failed upload must never
-- block re-uploading the same artwork later.
create unique index if not exists media_active_sha256_idx
  on public.media (sha256)
  where deletion_status = 'active' and sha256 is not null;

-- 2. Media listing: active rows newest first, one page at a time -------------
-- (deletion_status, created_at desc) supersedes the narrow Batch 3 index.
drop index if exists public.media_deletion_status_idx;
create index if not exists media_active_created_idx
  on public.media (deletion_status, created_at desc);

-- 3. Commission requests: paged inbox queries -------------------------------
create index if not exists commission_requests_created_idx
  on public.commission_requests (created_at desc);
create index if not exists commission_requests_status_created_idx
  on public.commission_requests (status, created_at desc);
-- FK support: deleting a service or form sets requests.service_id/form_id null.
create index if not exists commission_requests_service_idx
  on public.commission_requests (service_id);
create index if not exists commission_requests_form_idx
  on public.commission_requests (form_id);

-- 4. Small CMS tables read in a fixed order --------------------------------
create index if not exists cms_navigation_published_sort_idx
  on public.cms_navigation (published, sort_order);
create index if not exists cms_categories_kind_sort_idx
  on public.cms_categories (kind, sort_order);

-- 5. FK support for category deletion (on delete set null) ------------------
create index if not exists portfolio_projects_category_idx
  on public.portfolio_projects (category_id);
create index if not exists free_assets_category_idx
  on public.free_assets (category_id);
