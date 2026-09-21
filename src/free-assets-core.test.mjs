import assert from 'node:assert/strict';
import { mapFreeAsset, assetCategorySlug, assetFilterChips } from './free-assets-core.js';

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
console.log('Free Assets mapping test passed.');
