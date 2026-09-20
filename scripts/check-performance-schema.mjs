/**
 * check-performance-schema.mjs
 * Static review of the Batch 4 migration: the digest column, the partial unique
 * index that only constrains active rows, indexes matching real admin query
 * patterns, and the guarantee that Batch 3 RLS/media safety is untouched.
 *
 * Static SQL assertions only: they do NOT prove live index/RLS behaviour.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ADMIN_SELECT_COLUMNS } from '../src/admin-query-core.js';
import { REQUESTS_PAGE_SIZE, MEDIA_PAGE_SIZE } from '../src/admin-query-core.js';

const migrationPath = 'supabase/migrations/202609200002_admin_performance_indexes.sql';
const sql = await readFile(migrationPath, 'utf8');
const batch3 = await readFile('supabase/migrations/202609200001_media_deletion_safety.sql', 'utf8');
const checks = [];
const check = (name, assertion) => {
  assertion();
  checks.push(name);
};

check('digest column is added non-destructively', () => {
  assert.match(sql, /alter table public\.media add column if not exists sha256 text/);
  assert.doesNotMatch(sql, /drop column|drop table|truncate|alter column/i);
});

check('duplicate detection only constrains active media', () => {
  const index = sql.match(/create unique index[\s\S]*?media_active_sha256_idx[\s\S]*?;/);
  assert.ok(index, 'the partial unique digest index is missing');
  assert.match(index[0], /where deletion_status = 'active'/);
  assert.match(index[0], /sha256 is not null/);
});

check('media page query has a matching composite index', () => {
  assert.match(sql, /create index if not exists media_active_created_idx[\s\S]*?\(deletion_status, created_at desc\)/);
  assert.match(sql, /drop index if exists public\.media_deletion_status_idx/, 'the superseded narrow index is dropped');
});

check('commission request paging indexes exist', () => {
  assert.match(sql, /commission_requests_created_idx[\s\S]*?\(created_at desc\)/);
  assert.match(sql, /commission_requests_status_created_idx[\s\S]*?\(status, created_at desc\)/);
});

check('foreign key cascades the admin triggers are indexed', () => {
  assert.match(sql, /commission_requests_service_idx[\s\S]*?\(service_id\)/);
  assert.match(sql, /commission_requests_form_idx[\s\S]*?\(form_id\)/);
  assert.match(sql, /portfolio_projects_category_idx[\s\S]*?\(category_id\)/);
  assert.match(sql, /free_assets_category_idx[\s\S]*?\(category_id\)/);
});

check('never duplicates primary key or unique constraint indexes', () => {
  const created = [...sql.matchAll(/create (?:unique )?index if not exists \w+[\s\S]*?;/g)].map((match) => match[0]);
  for (const statement of created) {
    assert.doesNotMatch(statement, /\(\s*id\s*\)/, 'a primary key index must not be recreated');
    assert.doesNotMatch(statement, /\(\s*slug\s*\)|\(\s*kind, ?slug\s*\)|\(\s*storage_path\s*\)/, 'unique constraint indexes must not be recreated');
  }
});

check('batch 3 media safety is untouched', () => {
  assert.doesNotMatch(sql, /drop policy|create policy/i, 'no policy changes in the performance migration');
  assert.doesNotMatch(sql, /\bto anon\b|using \(true\)/i, 'no anonymous or blanket access is introduced');
  assert.doesNotMatch(sql, /service_role/i);
  assert.doesNotMatch(sql, /drop index if exists public\.(media_active_sha256_idx|media_active_created_idx|commission_requests_\w+|cms_\w+|portfolio_projects_category_idx|free_assets_category_idx)/i, 'only the superseded narrow index may be dropped');
  assert.match(batch3, /deletion_status in \('active', 'pending', 'storage_removed'\)/, 'the Batch 3 deletion states are still the source of truth');
});

check('explicit select lists stay in place', () => {
  for (const [table, columns] of Object.entries(ADMIN_SELECT_COLUMNS)) {
    assert.ok(columns.length > 0, table + ' still declares explicit columns');
    assert.ok(!columns.includes('*'), table + ' must not select every column');
  }
  assert.ok(REQUESTS_PAGE_SIZE >= 30 && REQUESTS_PAGE_SIZE <= 50);
  assert.ok(MEDIA_PAGE_SIZE >= 24 && MEDIA_PAGE_SIZE <= 50);
});

console.log(`Admin performance schema check passed (${checks.length} static assertions: ${checks.join(', ')}).`);
console.log('Note: static SQL review only — index usage and RLS require a real Supabase project.');
