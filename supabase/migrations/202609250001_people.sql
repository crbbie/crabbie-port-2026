-- 202609250001_people.sql
-- Reusable People / Clients + project collaborator credits.
-- Additive forward migration: never edit prior migrations.
--
-- Tables:
--   public.people: reusable identities (clients, collaborators, artists...)
--   public.portfolio_project_people: ordered project <-> person junction
-- Project label lives in portfolio_projects.content.peopleCreditLabel (JSONB,
-- no schema change). No name/avatar/url copies in the junction.

-- ===========================================================================
-- people table
-- ===========================================================================
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  avatar_path text,
  avatar_alt text not null default '',
  profile_url text,
  kind text not null default 'other',
  published boolean not null default false,
  show_in_thank_you boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_display_name_len check (char_length(display_name) between 1 and 120),
  constraint people_avatar_alt_len check (char_length(avatar_alt) <= 240),
  constraint people_kind_check check (kind in ('client', 'collaborator', 'artist', 'studio', 'creator', 'other')),
  constraint people_thank_you_needs_avatar check (
    not (published and show_in_thank_you)
    or (avatar_path is not null and char_length(btrim(avatar_path)) > 0)
  )
);

-- Trim display_name on write; keep empty check meaningful.
create or replace function public.people_trim_display_name()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.display_name := btrim(new.display_name);
  new.avatar_alt := coalesce(new.avatar_alt, '');
  return new;
end;
$$;

drop trigger if exists trg_people_trim_display_name on public.people;
create trigger trg_people_trim_display_name
  before insert or update of display_name, avatar_alt on public.people
  for each row execute function public.people_trim_display_name();

-- Reuse the hardened updated_at trigger pattern when present, else a local one.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'handle_updated_at'
  ) then
    drop trigger if exists trg_people_updated_at on public.people;
    create trigger trg_people_updated_at
      before update on public.people
      for each row execute function public.handle_updated_at();
  else
    create or replace function public.people_set_updated_at()
    returns trigger language plpgsql set search_path = public as $fn$
    begin new.updated_at := now(); return new; end $fn$;
    drop trigger if exists trg_people_updated_at on public.people;
    create trigger trg_people_updated_at
      before update on public.people
      for each row execute function public.people_set_updated_at();
  end if;
end
$$;

create index if not exists people_public_order_idx
  on public.people (published, show_in_thank_you, sort_order, id);
create index if not exists people_admin_order_idx
  on public.people (sort_order, id);

-- ===========================================================================
-- junction table
-- ===========================================================================
create table if not exists public.portfolio_project_people (
  project_id uuid not null references public.portfolio_projects (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (project_id, person_id)
);

create index if not exists portfolio_project_people_person_idx
  on public.portfolio_project_people (person_id);
create index if not exists portfolio_project_people_project_order_idx
  on public.portfolio_project_people (project_id, sort_order);

-- ===========================================================================
-- RLS
-- ===========================================================================
alter table public.people enable row level security;
alter table public.portfolio_project_people enable row level security;

-- Clean slate: drop pre-existing policies if this migration is re-run.
drop policy if exists people_public_read on public.people;
drop policy if exists people_admin_all on public.people;
drop policy if exists ppp_public_read on public.portfolio_project_people;
drop policy if exists ppp_admin_all on public.portfolio_project_people;

-- Anonymous / non-admin: published People only. (Admins also match this, plus
-- the admin policy below; public adapters must still filter published.)
create policy people_public_read on public.people
  for select to anon, authenticated
  using (published = true);

-- Admin: full access via server-controlled JWT role.
create policy people_admin_all on public.people
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Junction public read: BOTH parent project and person must be published.
create policy ppp_public_read on public.portfolio_project_people
  for select to anon, authenticated
  using (
    exists (select 1 from public.portfolio_projects p where p.id = project_id and p.published = true)
    and exists (select 1 from public.people pe where pe.id = person_id and pe.published = true)
  );

create policy ppp_admin_all on public.portfolio_project_people
  for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Explicit grants; revoke inappropriate defaults.
revoke all on public.people from public, anon;
grant select on public.people to anon, authenticated;
grant all on public.people to authenticated;
revoke all on public.portfolio_project_people from public, anon;
grant select on public.portfolio_project_people to anon, authenticated;
grant all on public.portfolio_project_people to authenticated;

-- ===========================================================================
-- Project save RPC (SECURITY INVOKER, admin only)
-- One transaction: project row + ordered junction replacement.
-- ===========================================================================
create or replace function public.save_project_with_people(
  p_project jsonb,
  p_people_ids uuid[],
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean;
  v_id uuid;
  v_slug text;
  v_updated timestamptz;
  v_ids uuid[];
  v_pid uuid;
  v_ord integer := 0;
begin
  v_is_admin := coalesce(((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'), false);
  if not v_is_admin then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_project is null or jsonb_typeof(p_project) <> 'object' then
    raise exception 'Invalid project payload' using errcode = '22023';
  end if;

  -- Whitelisted project fields only.
  v_slug := btrim(coalesce(p_project ->> 'slug', ''));
  if v_slug = '' then
    raise exception 'Project slug is required' using errcode = '23502';
  end if;

  -- Normalize + dedupe ordered ids, preserving first-seen order.
  v_ids := coalesce(p_people_ids, array[]::uuid[]);
  v_ids := (
    select coalesce(array_agg(x order by n), array[]::uuid[])
    from (select distinct on (x) x, n from unnest(v_ids) with ordinality as u(x, n) order by x, n) s
  );

  -- Validate every referenced person exists.
  if array_length(v_ids, 1) is not null then
    foreach v_pid in array v_ids loop
      if not exists (select 1 from public.people where id = v_pid) then
        raise exception 'Unknown person id: %', v_pid using errcode = '23503';
      end if;
    end loop;
  end if;

  v_id := nullif(btrim(coalesce(p_project ->> 'id', '')), '')::uuid;

  if v_id is null then
    insert into public.portfolio_projects
      (slug, title, description, tags, thumbnail_path, cover_path, featured, published, sort_order, content, category_id)
    values (
      v_slug,
      coalesce(p_project ->> 'title', 'Untitled Project'),
      coalesce(p_project ->> 'description', ''),
      coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_project -> 'tags', '[]'::jsonb)) as t(x)), array[]::text[]),
      nullif(p_project ->> 'thumbnail_path', ''),
      nullif(p_project ->> 'cover_path', ''),
      coalesce((p_project ->> 'featured')::boolean, false),
      coalesce((p_project ->> 'published')::boolean, false),
      coalesce((p_project ->> 'sort_order')::integer, 0),
      coalesce(p_project -> 'content', '{}'::jsonb),
      nullif(p_project ->> 'category_id', '')::uuid
    )
    returning id, slug, updated_at into v_id, v_slug, v_updated;
  else
    if p_expected_updated_at is null then
      raise exception 'Missing concurrency baseline' using errcode = '23514';
    end if;
    update public.portfolio_projects set
      slug = v_slug,
      title = coalesce(p_project ->> 'title', title),
      description = coalesce(p_project ->> 'description', description),
      tags = coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_project -> 'tags', '[]'::jsonb)) as t(x)), tags),
      thumbnail_path = nullif(p_project ->> 'thumbnail_path', ''),
      cover_path = nullif(p_project ->> 'cover_path', ''),
      featured = coalesce((p_project ->> 'featured')::boolean, featured),
      published = coalesce((p_project ->> 'published')::boolean, published),
      sort_order = coalesce((p_project ->> 'sort_order')::integer, sort_order),
      content = coalesce(p_project -> 'content', content),
      category_id = case when p_project ? 'category_id' then nullif(p_project ->> 'category_id', '')::uuid else category_id end,
      updated_at = now()
    where id = v_id and updated_at = p_expected_updated_at;
    if not found then
      raise exception 'Project save conflict or missing record' using errcode = '23505';
    end if;
    select slug, updated_at into v_slug, v_updated from public.portfolio_projects where id = v_id;
  end if;

  -- Replace ordered relationships in the same transaction.
  delete from public.portfolio_project_people where project_id = v_id;
  if array_length(v_ids, 1) is not null then
    foreach v_pid in array v_ids loop
      insert into public.portfolio_project_people (project_id, person_id, sort_order)
      values (v_id, v_pid, v_ord);
      v_ord := v_ord + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_id,
    'slug', v_slug,
    'updated_at', v_updated,
    'people', coalesce((select jsonb_agg(x) from unnest(v_ids) as u(x)), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.save_project_with_people(jsonb, uuid[], timestamptz) from public, anon;
grant execute on function public.save_project_with_people(jsonb, uuid[], timestamptz) to authenticated;

-- ===========================================================================
-- Adjacent people reorder RPC (global order, page-boundary safe)
-- ===========================================================================
create or replace function public.move_person(
  p_person_id uuid,
  p_direction text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean;
  v_cur integer;
  v_id uuid;
  v_swap_id uuid;
  v_swap_ord integer;
  v_rows jsonb;
begin
  v_is_admin := coalesce(((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'), false);
  if not v_is_admin then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_direction not in ('up', 'down') then
    raise exception 'Invalid direction' using errcode = '22023';
  end if;

  -- Lock the ordered set for a stable adjacent swap.
  perform 1 from public.people order by sort_order, id for update;

  select id, sort_order into v_id, v_cur from public.people where id = p_person_id;
  if not found then
    raise exception 'Person not found' using errcode = '23503';
  end if;
  if p_expected_updated_at is not null then
    if not exists (select 1 from public.people where id = p_person_id and updated_at = p_expected_updated_at) then
      raise exception 'Person changed in another session' using errcode = '23505';
    end if;
  end if;

  if p_direction = 'up' then
    select id, sort_order into v_swap_id, v_swap_ord from public.people
    where (sort_order < v_cur) or (sort_order = v_cur and id < p_person_id::text::uuid)
    order by sort_order desc, id desc limit 1;
  else
    select id, sort_order into v_swap_id, v_swap_ord from public.people
    where (sort_order > v_cur) or (sort_order = v_cur and id > p_person_id::text::uuid)
    order by sort_order asc, id asc limit 1;
  end if;

  if v_swap_id is null then
    return jsonb_build_object('moved', false, 'id', p_person_id);
  end if;

  update public.people set sort_order = v_swap_ord, updated_at = now() where id = p_person_id;
  update public.people set sort_order = v_cur, updated_at = now() where id = v_swap_id;

  -- Normalize ranks transactionally so ties cannot accumulate.
  with ordered as (
    select id, row_number() over (order by sort_order, id) - 1 as rn from public.people
  )
  update public.people p set sort_order = o.rn, updated_at = now()
  from ordered o where o.id = p.id and p.sort_order <> o.rn;

  select jsonb_agg(jsonb_build_object('id', id, 'sort_order', sort_order, 'updated_at', updated_at) order by sort_order, id)
    into v_rows from public.people;
  return jsonb_build_object('moved', true, 'id', p_person_id, 'rows', coalesce(v_rows, '[]'::jsonb));
end;
$$;

revoke all on function public.move_person(uuid, text, timestamptz) from public, anon;
grant execute on function public.move_person(uuid, text, timestamptz) to authenticated;
