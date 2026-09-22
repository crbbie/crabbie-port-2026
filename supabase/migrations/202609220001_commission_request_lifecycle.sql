-- Batch 1: commission request lifecycle (Inbox <-> Archive -> Trash -> Permanent Delete).
--
-- Lifecycle columns are SEPARATE from the business status
-- ('new','reviewing','contacted','accepted','declined','closed').
-- Archive/Trash never rewrites status; restore routes back via archived_at.
--
--   inbox:   archived_at IS NULL AND deleted_at IS NULL
--   archive: archived_at IS NOT NULL AND deleted_at IS NULL
--   trash:   deleted_at IS NOT NULL (archived_at kept so restore knows where to go)
--
-- Permanent delete is only allowed from Trash with retention_hold = false.
-- Deleting a request never removes media/files (no FK from media to requests;
-- service/form FKs stay ON DELETE SET NULL).

alter table public.commission_requests
  add column if not exists archived_at timestamptz null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists retention_hold boolean not null default false;

create index if not exists commission_requests_archived_at_idx
  on public.commission_requests (archived_at);
create index if not exists commission_requests_deleted_at_idx
  on public.commission_requests (deleted_at);
create index if not exists commission_requests_retention_hold_idx
  on public.commission_requests (retention_hold) where deleted_at is not null;

-- Visitor inserts must always land in the Inbox: lifecycle columns are
-- server-defaulted and cannot be smuggled in by anonymous/authenticated inserts.
drop policy if exists "visitor inserts request" on public.commission_requests;
create policy "visitor inserts request" on public.commission_requests
  for insert to anon, authenticated
  with check (
    char_length(trim(client_name)) between 1 and 160
    and char_length(trim(client_email)) between 3 and 320
    and terms_accepted
    and status = 'new'
    and admin_notes = ''
    and archived_at is null
    and deleted_at is null
    and retention_hold = false
  );

-- Admin management stays role-gated (existing policy covers the new columns):
--   "admin manages commission_requests" ... using/with check
--   ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
-- Anonymous has only INSERT (see 20260918190500_tighten_anon_table_grants.sql)
-- and non-admin authenticated users match neither policy, so lifecycle
-- mutations and permanent deletes are admin-only without any new grant.
