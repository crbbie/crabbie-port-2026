-- Batch 2: minimal cleanup state for the read-only media scanner.
--
-- media_cleanup_state is keyed by canonical storage path (not media id) so it
-- can also describe rowless Storage objects. It stores:
--   protected:            admin-marked "do not touch" (external/client use)
--   first_unreferenced_at: first COMPLETE scan that saw no authoritative
--                         reference (grace-period anchor for a future Batch 3)
--   object_fingerprint:   path|size|updated snapshot to detect object change
-- There is no scan-history table and no job queue by design.
-- The scanner is read-only: NOTHING here authorizes deletion.

create table if not exists public.media_cleanup_state (
  storage_path text primary key,
  protected boolean not null default false,
  first_unreferenced_at timestamptz null,
  object_fingerprint text null,
  updated_at timestamptz not null default now()
);

create index if not exists media_cleanup_state_unreferenced_idx
  on public.media_cleanup_state (first_unreferenced_at)
  where first_unreferenced_at is not null;

-- Reuse the standard updated_at trigger when it exists.
do $$ begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    drop trigger if exists media_cleanup_state_updated on public.media_cleanup_state;
    create trigger media_cleanup_state_updated
      before update on public.media_cleanup_state
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.media_cleanup_state enable row level security;

do $$ begin
  create policy "admin manages cleanup state" on public.media_cleanup_state
    for all to authenticated
    using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
exception when duplicate_object then null;
end $$;

revoke all on public.media_cleanup_state from anon;
grant select, insert, update, delete on public.media_cleanup_state to authenticated;
