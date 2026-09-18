-- Harden SECURITY DEFINER/trigger helper search_path so object lookup is deterministic.
alter function public.set_updated_at() set search_path = pg_catalog, public;
