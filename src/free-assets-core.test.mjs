import assert from 'node:assert/strict';
import {
  mapFreeAsset,
  assetCategorySlug,
  assetFilterChips,
  normalizeAssetCategory,
  matchesAssetCategory,
  resolveAssetCategoryFilter
} from './free-assets-core.js';

const fallback = {
  slug: 'proto-asset',
  title: 'Prototype Asset',
  description: 'Prototype description',
  cat: 'Brushes',
  format: 'PNG',
  icon: '❀',
  version: '1.0',
  date: '2026-01-01',
  credit: 'Credit Crabbie',
  license: 'Personal use',
  update: 'Initial release',
  availability: 'available',
  downloadUrl: 'https://example.com/asset.png'
};

const liveRow = {
  slug: 'live-asset',
  title: 'Live Asset',
  description: 'Live asset description from Supabase',
  file_type: 'SVG',
  file_path: 'https://supabase.co/storage/asset.svg',
  availability: 'available',
  published: true,
  metadata: {
    cat: 'Elements',
    icon: '★',
    version: '2.0',
    tags: ['Elements', 'SVG'],
    driveUrl: 'https://drive.google.com/file/d/example/view',
    showDirectDownload: false,
    showDriveDownload: true
  }
};

const mapped = mapFreeAsset(liveRow, fallback);
assert.equal(mapped.slug, 'live-asset');
assert.equal(mapped.title, 'Live Asset');
assert.equal(mapped.description, 'Live asset description from Supabase');
assert.equal(mapped.cat, 'Elements');
assert.equal(mapped.format, 'SVG');
assert.equal(mapped.icon, '★');
assert.equal(mapped.version, '2.0');
assert.equal(mapped.downloadUrl, 'https://supabase.co/storage/asset.svg');
assert.equal(mapped.driveUrl, 'https://drive.google.com/file/d/example/view');
assert.equal(mapped.showDirectDownload, false);
assert.equal(mapped.showDriveDownload, true);
assert.equal(mapped.credit, ''); // DB row is authoritative when metadata is absent.
assert.deepEqual(mapped.tags, ['Elements', 'SVG']);

// Batch 5 (P2-05): the CMS category is the source of truth.
assert.equal(assetCategorySlug({ category: 'Brushes', filterCat: 'other' }), 'brushes', 'a stale filterCat never wins');
assert.equal(assetCategorySlug({ cat: 'Elements' }), 'elements');
assert.equal(assetCategorySlug({ filterCat: 'Legacy' }), 'legacy', 'a legacy-only row still filters');
assert.equal(assetCategorySlug({}), 'other');
assert.deepEqual(assetFilterChips([{ category: 'Brushes' }, { cat: 'brushes' }, { cat: 'Audio' }]), ['audio', 'brushes'], 'chips follow the live taxonomy');

// Canonical asset category normalization
assert.equal(normalizeAssetCategory(''), '');
assert.equal(normalizeAssetCategory(null), '');
assert.equal(normalizeAssetCategory('  Stream   Overlays  '), 'stream overlays');
assert.equal(normalizeAssetCategory('Nhãn Dán'), 'nhãn dán');
assert.equal(normalizeAssetCategory('PSD/PNG'), 'psd/png');

// Canonical category matching: whole canonical value, not tokenized
assert.equal(matchesAssetCategory('stream overlays', 'all'), true);
assert.equal(matchesAssetCategory('stream overlays', 'stream overlays'), true);
assert.equal(matchesAssetCategory('Stream Overlays', 'stream overlays'), true);
assert.equal(matchesAssetCategory('stream overlays', 'Stream Overlays'), true);
assert.equal(matchesAssetCategory('stream overlays', 'stream'), false, 'multi-word category must not match single word token');
assert.equal(matchesAssetCategory('stream overlays', 'overlays'), false, 'multi-word category must not match single word token');
assert.equal(matchesAssetCategory('nhãn dán', 'Nhãn Dán'), true, 'unicode categories match canonical values');
assert.equal(matchesAssetCategory('psd/png', 'PSD/PNG'), true, 'punctuation categories match canonical values');

// Selection retention across hydration/reorder and deletion
assert.equal(resolveAssetCategoryFilter('stream overlays', ['brushes', 'stream overlays', 'elements']), 'stream overlays');
assert.equal(resolveAssetCategoryFilter('Stream Overlays', ['brushes', 'stream overlays', 'elements']), 'stream overlays');
assert.equal(resolveAssetCategoryFilter('deleted-category', ['brushes', 'stream overlays', 'elements']), 'all', 'removed category resets to all');
assert.equal(resolveAssetCategoryFilter('all', ['brushes', 'stream overlays']), 'all');

console.log('Free Assets mapping test passed.');
