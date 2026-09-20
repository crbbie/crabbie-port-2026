import assert from 'node:assert/strict';
import { assertAdminHydrationResults, mapAdminCollection, mapAdminHydrationResults, mapAdminPages, mapAdminSettings, mapSettingsMeta } from './admin-hydration-core.js';

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


// --- Patch 4: assets, commissions and media hydrate faithful canonical values ---
const roundTrip = mapAdminHydrationResults({
  ...empty,
  assets: { data: [{
    id: 'a1', slug: 'petal-pack', title: 'Petal Pack', description: '', availability: 'unavailable',
    file_path: 'uploads/petal.zip', file_type: 'ZIP', thumbnail_path: null,
    metadata: { driveUrl:'https://drive.google.com/file/d/example/view', showDirectDownload:false, showDriveDownload:true },
    published: true, sort_order: 1, updated_at: '2026-09-20T00:00:00Z'
  }, {
    id: 'a2', slug: 'free-pack', title: 'Free Pack', description: '', file_path: '', file_type: 'PNG',
    thumbnail_path: null, metadata: {}, published: true, sort_order: 2, updated_at: '2026-09-20T00:00:00Z'
  }] },
  commissions: { data: [{
    id: 'c1', slug: 'static-emote', title: 'Static Emote', description: '', price: 75, currency: 'USD',
    availability: 'open', form_slug: 'emotes', details: { priceFormatted: '$25' }, sort_order: 1,
    updated_at: '2026-09-20T00:00:00Z'
  }] },
  media: { data: [{
    id: 'm1', bucket_id: 'media', storage_path: 'uploads/art.png', original_name: 'art.png', mime_type: 'image/png',
    size_bytes: 1024, alt_text: 'art', width: 1200, height: 800, deletion_status: 'active',
    created_at: '2026-09-20T00:00:00Z'
  }, {
    id: 'm2', bucket_id: 'media', storage_path: 'uploads/clip.mp4', original_name: 'clip.mp4', mime_type: 'video/mp4',
    size_bytes: 2048, alt_text: 'clip', deletion_status: 'active', created_at: '2026-09-20T00:00:00Z'
  }] }
}, (path) => `https://cdn.test/${path}`);

assert.equal(roundTrip.assets[0].availability, 'unavailable', 'a hydrated unavailable asset stays unavailable');
assert.equal(roundTrip.assets[0].driveUrl, 'https://drive.google.com/file/d/example/view');
assert.equal(roundTrip.assets[0].showDirectDownload, false);
assert.equal(roundTrip.assets[0].showDriveDownload, true);
assert.equal(roundTrip.assets[1].availability, 'available', 'a missing asset availability resolves explicitly');
assert.equal(roundTrip.commissions[0].price, '75', 'the canonical price column outranks a legacy formatted detail');
assert.equal(roundTrip.commissions[0].priceFormatted, '$75', 'hydration derives fresh display text from the canonical price');
assert.equal(roundTrip.media[0].width, 1200, 'media width is mapped from the row');
assert.equal(roundTrip.media[0].height, 800, 'media height is mapped from the row');
assert.equal(roundTrip.media[1].width, null, 'a row without dimensions stays null');
assert.equal(roundTrip.media[1].height, null, 'a row without dimensions never gains a fake height');

// A successful query with null data must behave as empty, not as fallback data.
const nullData = Object.fromEntries(names.map((name) => [name, { data: null }]));
const nullSnapshot = mapAdminHydrationResults(nullData, () => '');
assert.deepEqual(nullSnapshot.portfolio, []);
assert.deepEqual(nullSnapshot.requests, []);
assert.deepEqual(nullSnapshot.pages, {});

// Categories are split by kind from a single successful shared result.
const categorized = { ...empty, categories: { data: [
  { id: 'c1', slug: 'chibi', title: 'Chibi', kind: 'portfolio', published: true, sort_order: 2, updated_at: '2026-09-20T00:00:00Z' },
  { id: 'c2', slug: 'brushes', title: 'Brushes', kind: 'asset', published: false, sort_order: 0 }
] } };
const categorizedSnapshot = mapAdminHydrationResults(categorized, () => '');
assert.deepEqual(categorizedSnapshot.portfolioCategories.map((c) => c.slug), ['chibi']);
assert.deepEqual(categorizedSnapshot.assetCategories.map((c) => c.slug), ['brushes']);
assert.equal(categorizedSnapshot.portfolioCategories[0].dbId, 'c1');
assert.equal(categorizedSnapshot.portfolioCategories[0].originalUpdatedAt, '2026-09-20T00:00:00Z', 'categories retain the stale-save baseline returned by hydration');
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

// Settings keep a per-key updated_at baseline beside the value payload.
const settingsSnapshot = mapAdminHydrationResults({
  ...empty,
  settings: { data: [
    { key: 'branding', value: { title: 'CRABBIE' }, updated_at: '2026-07-07T00:00:00Z' },
    { key: 'seo', value: { title: 'SEO' } }
  ] }
}, () => '');
assert.deepEqual(settingsSnapshot.settings.branding, { title: 'CRABBIE' });
assert.deepEqual(settingsSnapshot.settingsMeta, {
  branding: { originalUpdatedAt: '2026-07-07T00:00:00Z' },
  seo: { originalUpdatedAt: null }
}, 'settings baselines never leak into the stored value');
assert.equal('settingsMeta' in mapAdminHydrationResults(empty, () => ''), true, 'an empty snapshot still carries the baseline map');
assert.deepEqual(mapAdminHydrationResults(empty, () => '').settingsMeta, {});
assert.deepEqual(mapSettingsMeta([]), {});

// Asset placeholder hydrates from stored metadata, never hard-coded: legacy
// rows without the key resolve to false, matching new drafts and portfolio.
const placeholderSnapshot = mapAdminHydrationResults({
  ...empty,
  assets: { data: [
    { id: 'p1', slug: 'flagged', title: 'Flagged', metadata: { placeholder: true }, updated_at: '2026-09-20T00:00:00Z' },
    { id: 'p2', slug: 'clear', title: 'Clear', metadata: { placeholder: false }, updated_at: '2026-09-20T00:00:00Z' },
    { id: 'p3', slug: 'legacy', title: 'Legacy', metadata: {}, updated_at: '2026-09-20T00:00:00Z' },
    { id: 'p4', slug: 'nometa', title: 'NoMeta', updated_at: '2026-09-20T00:00:00Z' }
  ] }
}, () => '');
const flags = Object.fromEntries(placeholderSnapshot.assets.map((asset) => [asset.slug, asset.placeholder]));
assert.deepEqual(flags, { flagged: true, clear: false, legacy: false, nometa: false }, 'placeholder survives save and reload without inventing flags');

console.log('Admin hydration safety tests passed.');
