-- CRABBIE CMS foundation. Admin authorization uses server-controlled
-- auth.app_metadata.role = 'admin' (never user_metadata).
create extension if not exists pgcrypto;

create table public.cms_categories (id uuid primary key default gen_random_uuid(), kind text not null check (kind in ('portfolio','asset')), slug text not null, title text not null, title_i18n jsonb not null default '{}', published boolean not null default false, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(kind,slug));
create table public.portfolio_projects (id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, description text not null default '', category_id uuid references public.cms_categories(id) on delete set null, tags text[] not null default '{}', thumbnail_path text, cover_path text, featured boolean not null default false, published boolean not null default false, sort_order integer not null default 0, content jsonb not null default '{}', translations jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.free_assets (id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, description text not null default '', category_id uuid references public.cms_categories(id) on delete set null, thumbnail_path text, file_path text, file_type text, availability text not null default 'available' check (availability in ('available','unavailable')), featured boolean not null default false, published boolean not null default false, sort_order integer not null default 0, metadata jsonb not null default '{}', translations jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.commission_services (id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, description text not null default '', price numeric(12,2), currency text not null default 'USD', availability text not null default 'open' check (availability in ('open','closed','waitlist')), form_slug text, thumbnail_path text, featured boolean not null default false, published boolean not null default false, sort_order integer not null default 0, details jsonb not null default '{}', translations jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.commission_forms (id uuid primary key default gen_random_uuid(), slug text not null unique, title text not null, description text not null default '', fields jsonb not null default '[]', published boolean not null default false, translations jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.commission_requests (id uuid primary key default gen_random_uuid(), service_id uuid references public.commission_services(id) on delete set null, form_id uuid references public.commission_forms(id) on delete set null, client_name text not null, client_email text not null, contact text, answers jsonb not null default '{}', terms_accepted boolean not null check (terms_accepted), status text not null default 'new' check (status in ('new','reviewing','contacted','accepted','declined','closed')), admin_notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.cms_pages (id uuid primary key default gen_random_uuid(), slug text not null unique check (slug in ('about','terms')), title text not null, content text not null default '', published boolean not null default false, data jsonb not null default '{}', translations jsonb not null default '{}', updated_at timestamptz not null default now());
create table public.cms_navigation (id uuid primary key default gen_random_uuid(), title text not null, url text not null, published boolean not null default false, sort_order integer not null default 0, updated_at timestamptz not null default now());
create table public.site_settings (key text primary key, value jsonb not null default '{}', updated_at timestamptz not null default now());
create table public.media (id uuid primary key default gen_random_uuid(), bucket_id text not null default 'media', storage_path text not null unique, original_name text not null, mime_type text, size_bytes bigint, alt_text text not null default '', created_at timestamptz not null default now());

create index portfolio_projects_public_order on public.portfolio_projects(published,sort_order);
create index free_assets_public_order on public.free_assets(published,sort_order);
create index commission_services_public_order on public.commission_services(published,sort_order);
create index commission_requests_created_at on public.commission_requests(created_at desc);
create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
create trigger portfolio_projects_updated before update on public.portfolio_projects for each row execute function public.set_updated_at();
create trigger free_assets_updated before update on public.free_assets for each row execute function public.set_updated_at();
create trigger commission_services_updated before update on public.commission_services for each row execute function public.set_updated_at();
create trigger commission_forms_updated before update on public.commission_forms for each row execute function public.set_updated_at();
create trigger commission_requests_updated before update on public.commission_requests for each row execute function public.set_updated_at();

alter table public.cms_categories enable row level security; alter table public.portfolio_projects enable row level security; alter table public.free_assets enable row level security; alter table public.commission_services enable row level security; alter table public.commission_forms enable row level security; alter table public.commission_requests enable row level security; alter table public.cms_pages enable row level security; alter table public.cms_navigation enable row level security; alter table public.site_settings enable row level security; alter table public.media enable row level security;
create policy "public categories" on public.cms_categories for select to anon,authenticated using (published);
create policy "public projects" on public.portfolio_projects for select to anon,authenticated using (published);
create policy "public assets" on public.free_assets for select to anon,authenticated using (published);
create policy "public services" on public.commission_services for select to anon,authenticated using (published);
create policy "public forms" on public.commission_forms for select to anon,authenticated using (published);
create policy "public pages" on public.cms_pages for select to anon,authenticated using (published);
create policy "public navigation" on public.cms_navigation for select to anon,authenticated using (published);
create policy "public settings" on public.site_settings for select to anon,authenticated using (true);
create policy "public media records" on public.media for select to anon,authenticated using (true);
create policy "visitor inserts request" on public.commission_requests for insert to anon,authenticated with check (char_length(trim(client_name)) between 1 and 160 and char_length(trim(client_email)) between 3 and 320 and terms_accepted and status='new' and admin_notes='');
do $$ declare t text; begin foreach t in array array['cms_categories','portfolio_projects','free_assets','commission_services','commission_forms','commission_requests','cms_pages','cms_navigation','site_settings','media'] loop execute format('create policy "admin manages %s" on public.%I for all to authenticated using ((auth.jwt()->''app_metadata''->>''role'')=''admin'') with check ((auth.jwt()->''app_metadata''->>''role'')=''admin'')',t,t); end loop; end $$;

insert into storage.buckets(id,name,public) values('media','media',true) on conflict(id) do update set public=excluded.public;
create policy "public reads media" on storage.objects for select to anon,authenticated using(bucket_id='media');
create policy "admin inserts media" on storage.objects for insert to authenticated with check(bucket_id='media' and (auth.jwt()->'app_metadata'->>'role')='admin');
create policy "admin updates media" on storage.objects for update to authenticated using(bucket_id='media' and (auth.jwt()->'app_metadata'->>'role')='admin') with check(bucket_id='media' and (auth.jwt()->'app_metadata'->>'role')='admin');
create policy "admin deletes media" on storage.objects for delete to authenticated using(bucket_id='media' and (auth.jwt()->'app_metadata'->>'role')='admin');
grant usage on schema public to anon,authenticated;
grant select on public.cms_categories,public.portfolio_projects,public.free_assets,public.commission_services,public.commission_forms,public.cms_pages,public.cms_navigation,public.site_settings,public.media to anon,authenticated;
grant insert on public.commission_requests to anon,authenticated;
grant all on public.cms_categories,public.portfolio_projects,public.free_assets,public.commission_services,public.commission_forms,public.commission_requests,public.cms_pages,public.cms_navigation,public.site_settings,public.media to authenticated;
