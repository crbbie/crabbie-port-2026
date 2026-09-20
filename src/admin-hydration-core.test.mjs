import assert from 'node:assert/strict';
import { assertAdminHydrationResults, mapAdminCollection, mapAdminHydrationResults, mapAdminPages, mapAdminSettings } from './admin-hydration-core.js';

const names = ['portfolio', 'assets', 'categories', 'commissions', 'forms', 'pages', 'navigation', 'settings', 'requests', 'media'];
const empty = Object.fromEntries(names.map((name) => [name, { data: [] }]));

assert.doesNotThrow(() => assertAdminHydrationResults(empty));
for (const name of names) {
  assert.deepEqual(mapAdminCollection(empty[name].data, (row) => row), [], `${name} must be authoritative when empty`);
}

const failed = { ...empty, portfolio: { error: { message: 'permission denied' } } };
assert.throws(() => assertAdminHydrationResults(failed), /Portfolio load failed: permission denied/);
assert.deepEqual(mapAdminCollection(null, (row) => row), [], 'missing successful data is empty, not fallback');

// --- Test 2/3: an authoritative snapshot never keeps prototype data ---
const snapshotKeys = ['portfolio', 'assets', 'portfolioCategories', 'assetCategories', 'commissions', 'forms', 'pages', 'navigation', 'settings', 'requests', 'media'];
const snapshot = mapAdminHydrationResults(empty, (path) => `https://cdn.test/${path}`);
for (const key of snapshotKeys) assert.ok(key in snapshot, `${key} must always be part of the snapshot`);
for (const key of ['portfolio', 'assets', 'portfolioCategories', 'assetCategories', 'commissions', 'forms', 'navigation', 'requests', 'media']) {
  assert.deepEqual(snapshot[key], [], `empty ${key} must be authoritative, never prototype data`);
}
assert.deepEqual(snapshot.pages, {}, 'empty page records must not keep prototype pages');
assert.deepEqual(snapshot.settings, {}, 'empty settings must not keep prototype settings');

// Test 1: one failed query rejects the whole hydration (no partial merge).
const failedHydration = { ...empty, forms: { error: { message: 'timeout' } } };
assert.throws(() => mapAdminHydrationResults(failedHydration, () => ''), /Commission Forms load failed: timeout/);
assert.throws(() => mapAdminHydrationResults({ ...empty, media: { error: { message: 'denied' } } }, () => ''), /Media load failed: denied/);

// A successful query with null data must behave as empty, not as fallback data.
const nullData = Object.fromEntries(names.map((name) => [name, { data: null }]));
const nullSnapshot = mapAdminHydrationResults(nullData, () => '');
assert.deepEqual(nullSnapshot.portfolio, []);
assert.deepEqual(nullSnapshot.requests, []);
assert.deepEqual(nullSnapshot.pages, {});

// Categories are split by kind from a single successful shared result.
const categorized = { ...empty, categories: { data: [
  { id: 'c1', slug: 'chibi', title: 'Chibi', kind: 'portfolio', published: true, sort_order: 2 },
  { id: 'c2', slug: 'brushes', title: 'Brushes', kind: 'asset', published: false, sort_order: 0 }
] } };
const categorizedSnapshot = mapAdminHydrationResults(categorized, () => '');
assert.deepEqual(categorizedSnapshot.portfolioCategories.map((c) => c.slug), ['chibi']);
assert.deepEqual(categorizedSnapshot.assetCategories.map((c) => c.slug), ['brushes']);
assert.equal(categorizedSnapshot.portfolioCategories[0].dbId, 'c1');
assert.equal(categorizedSnapshot.assetCategories[0].published, false);

// Media rows resolve their public storage URL through the injected resolver.
const withMedia = { ...empty, media: { data: [
  { id: 'm1', storage_path: 'uploads/a.png', original_name: 'a.png', mime_type: 'image/png', size_bytes: 2048, created_at: '2026-01-01T00:00:00Z' }
] } };
const mediaSnapshot = mapAdminHydrationResults(withMedia, (p) => `https://cdn.test/${p}`);
assert.equal(mediaSnapshot.media.length, 1);
assert.equal(mediaSnapshot.media[0].url, 'https://cdn.test/uploads/a.png');
assert.equal(mediaSnapshot.media[0].type, 'image');

// Pages and settings are singletons that stay absent when the table is empty.
const withSingletons = {
  ...empty,
  pages: { data: [{ slug: 'about', title: 'About', content: 'Body', published: true, data: { name: 'Nia', skills: ['art'] } }] },
  settings: { data: [{ key: 'branding', value: { title: 'CRABBIE' } }] }
};
const singletonSnapshot = mapAdminHydrationResults(withSingletons, () => '');
assert.equal(singletonSnapshot.pages.about.name, 'Nia');
assert.deepEqual(singletonSnapshot.pages.about.skills, ['art']);
assert.equal(singletonSnapshot.pages.terms, undefined, 'a missing page record stays absent');
assert.deepEqual(singletonSnapshot.settings.branding, { title: 'CRABBIE' });
assert.deepEqual(mapAdminPages([]), {});
assert.deepEqual(mapAdminSettings([]), {});
assert.deepEqual(mapAdminSettings([{ key: 'x', value: null }]), { x: {} });

// --- Prompt 2: stable DB identity + stale-save baseline survive hydration ---
const identity = mapAdminHydrationResults({
  ...empty,
  portfolio: { data: [{ id: 'uuid-p', slug: 'color-fiesta', title: 'T', updated_at: '2026-01-01T00:00:00Z', content: {} }] },
  assets: { data: [{ id: 'uuid-a', slug: 'petal-pack', title: 'A', updated_at: '2026-01-02T00:00:00Z', metadata: {} }] },
  commissions: { data: [{ id: 'uuid-c', slug: 'bust-up', title: 'C', updated_at: '2026-01-03T00:00:00Z' }] },
  forms: { data: [{ id: 'uuid-f', slug: 'emails', title: 'F', updated_at: '2026-01-04T00:00:00Z' }] },
  navigation: { data: [{ id: 'uuid-n', title: 'N', url: '#n', updated_at: '2026-01-05T00:00:00Z' }] },
  requests: { data: [{ id: 'uuid-r', client_name: 'X', status: 'new', created_at: '2026-01-06T00:00:00Z', updated_at: '2026-01-07T00:00:00Z', answers: {} }] },
  pages: { data: [{ id: 'uuid-pg', slug: 'about', title: 'About', content: '', published: true, updated_at: '2026-01-08T00:00:00Z', data: {} }] }
}, () => '');
assert.equal(identity.portfolio[0].dbId, 'uuid-p');
assert.equal(identity.portfolio[0].originalUpdatedAt, '2026-01-01T00:00:00Z');
assert.equal(identity.portfolio[0].id, 'color-fiesta', 'the local UI identity stays slug based');
assert.equal(identity.assets[0].dbId, 'uuid-a');
assert.equal(identity.assets[0].originalUpdatedAt, '2026-01-02T00:00:00Z');
assert.equal(identity.commissions[0].dbId, 'uuid-c');
assert.equal(identity.forms[0].dbId, 'uuid-f');
assert.equal(identity.navigation[0].dbId, 'uuid-n');
assert.equal(identity.navigation[0].originalUpdatedAt, '2026-01-05T00:00:00Z');
assert.equal(identity.requests[0].dbId, 'uuid-r');
assert.equal(identity.requests[0].originalUpdatedAt, '2026-01-07T00:00:00Z');
assert.equal(identity.pages.about.dbId, 'uuid-pg');
assert.equal(identity.pages.about.originalUpdatedAt, '2026-01-08T00:00:00Z');

// A row without a uuid must stay insertable and must never invent a baseline.
const noUuid = mapAdminHydrationResults({ ...empty, portfolio: { data: [{ slug: 'x', title: 'X', content: {} }] } }, () => '');
assert.equal(noUuid.portfolio[0].dbId, null);
assert.equal(noUuid.portfolio[0].originalUpdatedAt, null);

console.log('Admin hydration safety tests passed.');
