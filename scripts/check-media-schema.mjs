/**
 * check-media-schema.mjs
 * Static review of the Batch 3 media migration: deletion state, audit table
 * RLS/grants, media metadata privacy, Storage policy changes and the bucket
 * MIME/size limits, cross-checked against the client policy constants.
 *
 * This is a static assertion over migration SQL: it does NOT prove live RLS
 * behaviour, which requires a real Supabase project.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MEDIA_MAX_UPLOAD_BYTES, SUPPORTED_MEDIA_MIME_TYPES } from '../src/admin-media-core.js';

const migrationPath = 'supabase/migrations/202609200001_media_deletion_safety.sql';
const sql = await readFile(migrationPath, 'utf8');
const checks = [];
const check = (name, assertion) => {
  assertion();
  checks.push(name);
};

check('deletion state columns', () => {
  assert.match(sql, /alter table public\.media add column if not exists deletion_status/);
  assert.match(sql, /add column if not exists deleted_at/);
  assert.match(sql, /add column if not exists deletion_error/);
});

check('deletion status constraint', () => {
  assert.match(sql, /check \(deletion_status in \('active', 'pending', 'storage_removed'\)\)/);
});

check('deletion indexes', () => {
  assert.match(sql, /create index if not exists media_deletion_status_idx/);
  assert.match(sql, /create index if not exists media_created_at_idx/);
});

check('audit table with RLS', () => {
  assert.match(sql, /create table if not exists public\.admin_audit_log/);
  assert.match(sql, /alter table public\.admin_audit_log enable row level security/);
});

check('audit access is admin-only via app_metadata', () => {
  assert.match(sql, /create policy "admin reads audit log"[\s\S]*?\(auth\.jwt\(\) -> 'app_metadata' ->> 'role'\) = 'admin'/);
  assert.match(sql, /create policy "admin writes audit log"[\s\S]*?actor_id = auth\.uid\(\)/);
  assert.match(sql, /actor_id uuid not null default auth\.uid\(\)/);
});

check('audit table denies anonymous access', () => {
  assert.match(sql, /revoke all on public\.admin_audit_log from anon/);
  assert.doesNotMatch(sql, /on public\.admin_audit_log[^;]*to anon/);
});

check('audit table is append-only for clients', () => {
  assert.match(sql, /grant select, insert on public\.admin_audit_log to authenticated/);
  assert.doesNotMatch(sql, /grant[^;]*\b(update|delete)\b[^;]*on public\.admin_audit_log/);
});

check('public media metadata exposure removed', () => {
  assert.match(sql, /drop policy if exists "public media records" on public\.media/);
  assert.match(sql, /revoke select on public\.media from anon/);
});

check('anonymous storage listing removed, admin listing kept', () => {
  assert.match(sql, /drop policy if exists "public reads media" on storage\.objects/);
  assert.match(sql, /create policy "admin reads media objects" on storage\.objects[\s\S]*?bucket_id = 'media'/);
  assert.doesNotMatch(sql, /\bto anon\b/);
});

check('bucket MIME allowlist matches the client policy', () => {
  const block = sql.match(/allowed_mime_types = array\[([\s\S]*?)\]/);
  assert.ok(block, 'allowed_mime_types array is missing');
  const serverTypes = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
  const clientTypes = [...SUPPORTED_MEDIA_MIME_TYPES].sort();
  assert.deepEqual(serverTypes, clientTypes);
});

check('bucket size limit matches the client limit', () => {
  assert.match(sql, new RegExp('file_size_limit = ' + MEDIA_MAX_UPLOAD_BYTES));
  assert.match(sql, /where id = 'media'/);
});

check('no service_role exposure and no blanket policies', () => {
  assert.doesNotMatch(sql, /service_role/i);
  assert.doesNotMatch(sql, /using \(true\)/);
});

console.log(`Media schema check passed (${checks.length} static migration assertions: ${checks.join(', ')}).`);
console.log('Note: static SQL review only — live RLS/Storage behaviour requires a real Supabase project.');
