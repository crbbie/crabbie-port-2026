-- CRABBIE CMS Batch 3: safe media deletion, audit trail and least-privilege
-- media access.
--
-- Storage and Postgres are separate systems, so media removal is a recoverable
-- multi-step lifecycle (active -> pending -> storage_removed -> row deleted)
-- rather than one destructive statement.

-- 1. Recoverable deletion state on public.media ------------------------------
alter table public.media add column if not exists deletion_status text not null default 'active';
alter table public.media add column if not exists deleted_at timestamptz;
alter table public.media add column if not exists deletion_error text;

do $$ begin
  alter table public.media
    add constraint media_deletion_status_check
    check (deletion_status in ('active', 'pending', 'storage_removed'));
exception when duplicate_object then null;
end $$;

create index if not exists media_deletion_status_idx on public.media (deletion_status);
create index if not exists media_created_at_idx on public.media (created_at desc);

-- 2. Append-only audit trail for destructive media operations ----------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid(),
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  storage_path text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_entity_idx on public.admin_audit_log (entity_type, entity_id);

alter table public.admin_audit_log enable row level security;

do $$ begin
  create policy "admin reads audit log" on public.admin_audit_log
    for select to authenticated
    using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "admin writes audit log" on public.admin_audit_log
    for insert to authenticated
    with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin' and actor_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- Append-only for clients: no update/delete grants, and anonymous access is
-- revoked outright.
revoke all on public.admin_audit_log from anon;
grant select, insert on public.admin_audit_log to authenticated;

-- 3. The public website never reads the Media Library metadata table ---------
drop policy if exists "public media records" on public.media;
revoke select on public.media from anon;

-- 4. Storage: public object URLs keep working (public bucket) while anonymous
--    object listing is removed. Admins keep select/insert/update/delete.
drop policy if exists "public reads media" on storage.objects;

do $$ begin
  create policy "admin reads media objects" on storage.objects
    for select to authenticated
    using (bucket_id = 'media' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
exception when duplicate_object then null;
end $$;

-- 5. Server-side bucket restrictions mirror the client media policy ----------
-- NOTE (draft vs public media, Batch 3): uploaded media still lives in one
-- public bucket and becomes reachable by URL immediately. A full
-- draft-bucket -> promote-to-public migration would invalidate every existing
-- media URL, so it is deliberately NOT performed here. Staged plan:
--   1. add a private 'media-drafts' bucket plus a promoted_at/published flag,
--   2. upload drafts privately and promote on publish,
--   3. migrate existing objects last, writing new URLs into CMS content.
-- Until step 3 ships, treat unpublished or client-confidential files as
-- publicly reachable and do not upload them.
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array[
         'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif', 'image/bmp',
         'image/x-icon', 'image/vnd.microsoft.icon',
         'video/mp4', 'video/webm', 'video/quicktime',
         'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac',
         'application/pdf', 'application/zip', 'application/x-zip-compressed'
       ]
 where id = 'media';
