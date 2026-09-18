-- Idempotently restore the public media bucket if an earlier SQL Editor run
-- created CMS tables but did not persist the Storage bucket statement.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = excluded.public;
