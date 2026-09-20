-- CRABBIE CMS Batch 5: optional image dimensions for NEW uploads.
--
-- Historical rows are deliberately left NULL: there is no backfill and no
-- remote decoding of old artwork just to populate metadata.

alter table public.media add column if not exists width integer;
alter table public.media add column if not exists height integer;

do $$ begin
  alter table public.media add constraint media_width_positive check (width is null or width > 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.media add constraint media_height_positive check (height is null or height > 0);
exception when duplicate_object then null;
end $$;
