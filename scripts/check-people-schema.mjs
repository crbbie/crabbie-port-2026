import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase', 'migrations');
const target = join(dir, '202609250001_people.sql');
assert.ok(existsSync(target), 'people migration is missing');
const sql = readFileSync(target, 'utf8');

for (const needle of [
  'create table if not exists public.people',
  'create table if not exists public.portfolio_project_people',
  'people_thank_you_needs_avatar',
  'on delete cascade',
  'on delete restrict',
  'alter table public.people enable row level security',
  'alter table public.portfolio_project_people enable row level security',
  'people_public_read',
  'people_admin_all',
  'ppp_public_read',
  'ppp_admin_all',
  "app_metadata' ->> 'role') = 'admin'",
  'save_project_with_people',
  'move_person',
  'security invoker',
  'set search_path = public, pg_temp',
  'revoke all on function public.save_project_with_people',
  'revoke all on function public.move_person',
  'grant execute on function public.save_project_with_people',
  'grant execute on function public.move_person',
  'people_public_order_idx',
  'people_admin_order_idx',
  'portfolio_project_people_person_idx'
]) {
  assert.ok(sql.includes(needle), `people migration missing: ${needle}`);
}
// RLS: junction public read requires BOTH published sides.
assert.ok(sql.includes('p.published = true') && sql.includes('pe.published = true'), 'junction policy must require both sides published');
// people reads limited to published for anon.
assert.ok(/people_public_read[\s\S]*?published = true/.test(sql), 'public people reads must be published-only');

console.log('check:people-schema passed');
