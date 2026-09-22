-- Batch 3: guarded manual purge coordination.
--
-- 1. media_cleanup_state gains the Batch 3 verdict inputs:
--      unreferenced_scan_count: consecutive COMPLETE scans with no reference
--      purge_claimed_at/by:     single-flight deletion claim (audit trail)
--    Existing rows start at 0: they genuinely need two more complete scans.
-- 2. media_upload_leases marks in-flight uploads so a purge can never take a
--    file whose bytes are still arriving (or whose metadata insert failed and
--    is being retried). Leases expire on their own; nothing reaps them on a
--    timer by design.
-- Storage bytes are still removed ONLY through the Supabase Storage API, never
-- by direct SQL writes. There is no automatic purge anywhere.

alter table public.media_cleanup_state
  add column if not exists unreferenced_scan_count integer not null default 0,
  add column if not exists purge_claimed_at timestamptz null,
  add column if not exists purge_claimed_by uuid null;

create table if not exists public.media_upload_leases (
  storage_path text primary key,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_by uuid null
);

create index if not exists media_upload_leases_expires_at_idx
  on public.media_upload_leases (expires_at);

alter table public.media_upload_leases enable row level security;

do $$ begin
  create policy "admin manages upload leases" on public.media_upload_leases
    for all to authenticated
    using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
exception when duplicate_object then null;
end $$;

revoke all on public.media_upload_leases from anon;
grant select, insert, update, delete on public.media_upload_leases to authenticated;
