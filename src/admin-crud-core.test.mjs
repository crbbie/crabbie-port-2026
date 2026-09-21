import assert from 'node:assert/strict';
import {
  formatPortfolioRow,
  formatAssetRow,
  formatCommissionRow,
  formatNavigationRow,
  formatPageRow,
  formatSettingRow
} from './admin-crud-core.js';

// 1. Portfolio
const p = formatPortfolioRow({
  id: 'test-p',
  slug: 'test-p',
  title: 'Test P',
  description: 'Desc',
  category: 'chibi',
  tags: ['CHIBI', 'PASTEL'],
  year: '2026',
  cardMode: 'image',
  published: true
}, 2);
assert.equal(p.slug, 'test-p');
assert.equal(p.title, 'Test P');
assert.equal(p.sort_order, 2);
assert.equal(p.content.cat, 'chibi');
assert.deepEqual(p.tags, ['CHIBI', 'PASTEL'], 'portfolio tags survive the save payload as an array');
assert.equal(p.content.year, '2026', 'portfolio date/year survives the save payload');
assert.equal(p.content.cardMode, 'image', 'portfolio card display mode survives the save payload');

// 1b. Unified project image: cover is the source of truth.
const unified = formatPortfolioRow({ id: 'u', slug: 'u', title: 'U', cover: 'https://cdn.test/cover.png', thumbnail: 'https://cdn.test/old-thumb.png' }, 0);
assert.equal(unified.cover_path, 'https://cdn.test/cover.png', 'cover persists');
assert.equal(unified.thumbnail_path, 'https://cdn.test/cover.png', 'thumbnail auto-syncs from cover');
const legacyThumb = formatPortfolioRow({ id: 'u', slug: 'u', title: 'U', cover: '', thumbnail: 'https://cdn.test/legacy.png' }, 0);
assert.equal(legacyThumb.cover_path, 'https://cdn.test/legacy.png', 'a legacy thumbnail-only row falls back instead of going blank');
assert.equal(legacyThumb.thumbnail_path, 'https://cdn.test/legacy.png', 'legacy thumbnail survives the unify step');
const noImage = formatPortfolioRow({ id: 'u', slug: 'u', title: 'U', cover: '', thumbnail: '' }, 0);
assert.equal(noImage.cover_path, null, 'no image stays empty');
assert.equal(noImage.thumbnail_path, null, 'no image stays empty on both columns');

// 2. Asset
const a = formatAssetRow({
  id: 'test-a',
  title: 'Test A',
  category: 'brushes',
  fileFormat: 'PNG',
  availability: 'available',
  tags: ['brushes', 'cute'],
  flowerTag: 'NEW',
  version: '1.2',
  dateAdded: '2026-09-20',
  credit: 'Credit Crabbie',
  license: 'Personal use',
  updateNote: 'New brushes',
  driveUrl: 'https://drive.google.com/file/d/example/view',
  showDirectDownload: false,
  showDriveDownload: true
}, 0);
assert.equal(a.slug, 'test-a');
assert.equal(a.availability, 'available');
assert.equal(a.metadata.cat, 'brushes');
assert.deepEqual(a.metadata.tags, ['brushes', 'cute']);
assert.equal(a.metadata.flowerTag, 'NEW');
assert.equal(a.metadata.version, '1.2');
assert.equal(a.metadata.date, '2026-09-20');
assert.equal(a.metadata.credit, 'Credit Crabbie');
assert.equal(a.metadata.license, 'Personal use');
assert.equal(a.metadata.update, 'New brushes');
assert.equal(a.metadata.driveUrl, 'https://drive.google.com/file/d/example/view');
assert.equal(a.metadata.showDirectDownload, false);
assert.equal(a.metadata.showDriveDownload, true);
assert.equal(formatAssetRow({ id: 'cleared', media: 'stale.zip', downloadUrl: '' }).file_path, '', 'Clearing the editor download URL must persist');

// 3. Commission
const c = formatCommissionRow({
  id: 'test-c',
  title: 'Test C',
  price: '$50',
  availability: 'inquiry',
  form: 'emotes'
}, 1);
assert.equal(c.slug, 'test-c');
assert.equal(c.price, 50);
assert.equal(c.availability, 'waitlist'); // mapped to DB check
assert.equal(c.form_slug, 'emotes');

// 4. Nav
const n = formatNavigationRow({ title: 'Home', url: '#home', published: true }, 0);
assert.equal(n.title, 'Home');
assert.equal(n.sort_order, 0);

// 5. Page
const pg = formatPageRow('about', { title: 'About Me', bio: 'Artist bio', skills: ['Art'] });
assert.equal(pg.slug, 'about');
assert.equal(pg.data.bio, 'Artist bio');

// 6. Setting
const st = formatSettingRow('branding', { title: 'CRABBIE' });
assert.equal(st.key, 'branding');
assert.equal(st.value.title, 'CRABBIE');

// 7. Asset placeholder round-trips through metadata, never a column.
const phOn = formatAssetRow({ id: 'test-ph', title: 'PH', placeholder: true }, 0);
assert.equal(phOn.metadata.placeholder, true, 'a checked placeholder is persisted under metadata');
const phOff = formatAssetRow({ id: 'test-ph', title: 'PH', placeholder: false }, 0);
assert.equal(phOff.metadata.placeholder, false, 'an unchecked placeholder persists as false, not absent');

console.log('Admin CRUD core formatting tests passed.');
