import assert from 'node:assert/strict';
import {
  normalizeAssetGallery,
  serializeAssetGallery,
  normalizeCoverAlt,
  coverAltFor,
  isGalleryUrlSafe,
  validateGalleryItem,
  moveGalleryItem,
  replaceGalleryItemSource,
  ensureGalleryIds,
  viewerIndexStep
} from './asset-gallery-core.js';
import { mapFreeAsset } from './free-assets-core.js';
import { formatAssetRow } from './admin-crud-core.js';
import { createAssetDraft } from './admin-roundtrip-core.js';
import {
  mediaTargetAccept,
  mediaTargetIsMultiple,
  galleryItemsFor
} from './admin-media-manager-core.js';
import {
  findMediaUsage,
  findAuthoritativeMediaReferences,
  collectPagedRows
} from './admin-media-safety-core.js';
import {
  buildAdminWritePlan,
  concurrencyConflictError,
  isConcurrencyConflictResponse,
  applySuccessfulSave
} from './admin-record-save-core.js';
import { reconcileSavedTarget } from './admin-persisted-baseline-core.js';
import { buildReferenceIndex } from './media-cleanup-scanner-core.js';

const ids = (() => { let n = 0; return () => 'g' + (++n); })();

// --- normalization: legacy cover-only, missing/null/empty/malformed ---
assert.deepEqual(normalizeAssetGallery(undefined), [], 'missing gallery => []');
assert.deepEqual(normalizeAssetGallery(null), [], 'null gallery => []');
assert.deepEqual(normalizeAssetGallery([]), [], 'explicit [] stays empty');
assert.deepEqual(normalizeAssetGallery('nope'), [], 'legacy scalar never crashes');
assert.deepEqual(normalizeAssetGallery({ url: 'x' }), [], 'legacy object never crashes');
const legacy = normalizeAssetGallery([null, '', '  ', { url: '' }, 'https://cdn/a.png'], { idFactory: ids });
assert.equal(legacy.length, 2, 'only nullish/empty entries drop; empty-url objects stay for editor feedback');
assert.equal(legacy[1].url, 'https://cdn/a.png', 'string entries coerce to objects');
assert.ok(legacy.every((item) => item.id), 'every row keeps a stable id');

// --- stable ids, order, dimensions; never truncate ---
const ordered = normalizeAssetGallery([
  { id: 'keep', url: 'https://cdn/1.png', alt: ' one ', caption: 'c', width: 30, height: 20 },
  { id: 'keep', url: 'https://cdn/2.png' },
  { url: 'https://cdn/3.png', width: -4, height: 0 }
], { idFactory: ids });
assert.equal(ordered[0].id, 'keep', 'authored ids survive');
assert.equal(ordered[0].alt, 'one', 'text is trimmed');
assert.deepEqual([ordered[0].width, ordered[0].height], [30, 20], 'valid dimensions survive');
assert.ok(!('width' in ordered[2]), 'invalid dimensions drop without killing the row');
assert.equal(ordered.length, 3, 'stored images are never truncated');
const big = Array.from({ length: 40 }, (_, i) => ({ url: 'https://cdn/' + i + '.png' }));
assert.equal(normalizeAssetGallery(big, { idFactory: ids }).length, 40, 'large galleries keep every image');

// --- cover alt fallback ---
assert.equal(normalizeCoverAlt(' Hi ', 'T'), 'Hi', 'authored alt wins');
assert.equal(normalizeCoverAlt('', 'T'), '', 'empty stays empty (render falls back)');
assert.equal(coverAltFor({ coverAlt: '', title: 'Petal' }), 'Petal', 'render falls back to title');

// --- editor feedback ---
assert.deepEqual(validateGalleryItem({ url: 'https://cdn/a.png' }), [], 'good row passes');
assert.equal(validateGalleryItem({ url: '' }).length, 1, 'empty url is flagged');
assert.equal(validateGalleryItem({ url: 'http://evil/x.png' }).length, 1, 'non-https is flagged');
assert.equal(validateGalleryItem(null).length, 1, 'non-object is flagged');
assert.equal(isGalleryUrlSafe('media/uploads/a.png'), true, 'storage-path form accepted');
assert.equal(isGalleryUrlSafe('../escape.png'), false, 'path traversal rejected');

// --- add / reorder / replace / remove / clear ---
assert.deepEqual(
  moveGalleryItem([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 0, 'down').map((r) => r.id),
  ['b', 'a', 'c'],
  'move down swaps with the next row'
);
assert.deepEqual(
  moveGalleryItem([{ id: 'a' }, { id: 'b' }], 0, 'up'),
  null,
  'out-of-range move refuses instead of corrupting order'
);
const replaced = replaceGalleryItemSource(
  { id: 'r1', url: 'https://cdn/old.png', alt: 'Keep me', caption: 'Note', width: 10, height: 10 },
  { url: 'https://cdn/new.png', width: 40, height: 30 }
);
assert.deepEqual(
  replaced,
  { id: 'r1', url: 'https://cdn/new.png', alt: 'Keep me', caption: 'Note', width: 40, height: 30 },
  'replacement preserves id/order/text and updates dimensions'
);
const clearedDims = replaceGalleryItemSource({ id: 'r1', url: 'a', width: 5, height: 5 }, { url: 'b' });
assert.ok(!('width' in clearedDims), 'replacement without dimensions clears stale sizes');
const ensured = ensureGalleryIds([{ url: 'a' }, { id: 'fixed', url: 'b' }], { idFactory: ids });
assert.ok(ensured[0].id && ensured[0].url === 'a', 'appended rows gain stable ids');
assert.equal(ensured[1].id, 'fixed', 'existing ids survive');

// --- viewer index wrap ---
assert.equal(viewerIndexStep(0, 'next', 1), 0, 'single image never steps');
assert.equal(viewerIndexStep(2, 'next', 3), 0, 'next wraps at the end');
assert.equal(viewerIndexStep(0, 'prev', 3), 2, 'prev wraps at the start');

// --- editor target contracts: image-only galleries ---
assert.equal(mediaTargetAccept('assets.my-asset.gallery'), 'image/*', 'asset galleries accept images only');
assert.equal(mediaTargetAccept('assets.my-asset.downloadUrl'), '*', 'the download field stays unrestricted');
assert.equal(mediaTargetAccept('assets.my-asset.title'), null, 'plain fields are not media targets');
assert.equal(mediaTargetIsMultiple('assets.my-asset.gallery'), true, 'asset galleries accept many');
assert.equal(mediaTargetIsMultiple('portfolio.p.blocks.0.items'), true, 'portfolio galleries stay multiple');
assert.equal(mediaTargetIsMultiple('assets.my-asset.thumbnail'), false, 'single fields stay single');
const picked = galleryItemsFor(['https://cdn/a.png'], { idFactory: ids });
assert.ok(picked[0].id, 'picker appends carry an id factory when supplied');

// --- public mapping carries gallery + cover alt; downloads untouched ---
const mapped = mapFreeAsset({
  slug: 'g-asset', title: 'G', description: '', file_type: 'PNG',
  file_path: 'media/pack.zip', availability: 'available', published: true,
  metadata: {
    cat: 'Brushes', gallery: [{ id: 'p1', url: 'media/prev1.png', alt: 'First', caption: 'Hi' }],
    coverAlt: 'Cover words', driveUrl: 'https://drive.test/x', showDriveDownload: true
  }
});
assert.equal(mapped.gallery.length, 1, 'public mapping carries the gallery');
assert.equal(mapped.gallery[0].url, 'media/prev1.png', 'canonical original reference kept');
assert.equal(mapped.coverAlt, 'Cover words', 'cover alt carried');
assert.equal(mapped.downloadUrl, 'media/pack.zip', 'download untouched');
assert.equal(mapped.driveUrl, 'https://drive.test/x', 'drive untouched');
const legacyMapped = mapFreeAsset({ slug: 'old', title: 'Old', metadata: {} });
assert.deepEqual(legacyMapped.gallery, [], 'legacy cover-only assets map to []');
assert.equal(legacyMapped.coverAlt, '', 'legacy cover alt stays empty');

// --- record-save round trip: add, reorder, replace, remove, clear, reload ---
const draft = createAssetDraft({ id: 'a1', slug: 'a1', title: 'A', thumbnail: 'media/cover.png', gallery: [{ url: 'media/1.png' }] });
assert.equal(draft.gallery.length, 1, 'draft creation keeps authored rows');
assert.equal(draft.availability, 'available', 'draft defaults preserved');
assert.equal(draft.thumbnail, 'media/cover.png', 'draft preserves authored cover');
const saved = formatAssetRow({ ...draft, gallery: [...draft.gallery, { id: 'g9', url: 'media/2.png', alt: 'Two' }] });
assert.equal(saved.metadata.gallery.length, 2, 'save serializes both rows in order');
assert.equal(saved.metadata.gallery[1].alt, 'Two', 'alt survives the save');
assert.equal(saved.file_path, draft.downloadUrl ?? draft.media ?? '', 'download serialization unchanged');
assert.equal(saved.availability, 'available', 'availability serialization unchanged');
assert.equal(saved.thumbnail_path, 'media/cover.png', 'cover serialization unchanged');
assert.ok(!saved.metadata.gallery.some((item) => item.url === saved.thumbnail_path), 'the cover is never injected into the gallery');
const reordered = { ...draft, gallery: moveGalleryItem([...draft.gallery, { id: 'g9', url: 'media/2.png' }], 1, 'up') };
assert.equal(reordered.gallery[0].id, 'g9', 'reorder persists through the draft');
const cleared = formatAssetRow({ ...draft, gallery: [] });
assert.deepEqual(cleared.metadata.gallery, [], 'clearing the gallery persists an explicit empty list');
assert.ok(!cleared.metadata.gallery.some((item) => item.url === cleared.thumbnail_path), 'clearing the gallery never injects the cover');
assert.ok(!('cover' in cleared.metadata), 'metadata does not hold a separate cover property');
assert.equal(cleared.thumbnail_path, draft.thumbnail || null, 'cover serialization unchanged');

// --- conflict / failed-save workflow preserves draft gallery in memory ---
{
  const baselineAsset = {
    id: 'a1',
    dbId: 'uuid-a1',
    slug: 'a1',
    title: 'Asset A',
    thumbnail: 'media/cover.png',
    gallery: [{ id: 'g1', url: 'media/prev-orig.png', alt: 'Original' }],
    originalUpdatedAt: '2026-01-01T00:00:00Z'
  };
  const savedState = { assets: [structuredClone(baselineAsset)] };
  const liveDraft = createAssetDraft(baselineAsset);
  // Author edits gallery in editor:
  liveDraft.gallery = [{ id: 'x', url: 'media/x.png', alt: 'New Preview' }];

  // Execute save workflow through guarded update plan
  const plan = buildAdminWritePlan('assets', liveDraft);
  const target = { kind: 'record', scope: 'assets', recordId: liveDraft.id };
  const captured = structuredClone(liveDraft);

  // Simulate guarded update response hitting 0 rows (stale update conflict)
  const conflictResponse = { data: null, error: null };
  const isConflict = isConcurrencyConflictResponse(conflictResponse);
  assert.equal(isConflict, true, 'zero-row update response is identified as concurrency conflict');

  let saveError = null;
  try {
    if (isConflict) throw concurrencyConflictError(plan.scope);
    applySuccessfulSave(liveDraft, conflictResponse.data);
    reconcileSavedTarget(savedState, target, captured, { success: true, mode: plan.mode, row: conflictResponse.data });
  } catch (err) {
    saveError = err;
  }

  assert.ok(saveError, 'save workflow aborted on conflict');
  assert.equal(saveError.code, 'stale_save', 'conflict error carries stale_save code');
  assert.equal(liveDraft.gallery.length, 1, 'failed save preserves draft gallery length');
  assert.equal(liveDraft.gallery[0].url, 'media/x.png', 'a stale-save conflict keeps the draft gallery in memory');
  assert.equal(liveDraft.originalUpdatedAt, '2026-01-01T00:00:00Z', 'draft baseline is not advanced on failure');
  assert.equal(savedState.assets[0].gallery[0].url, 'media/prev-orig.png', 'persisted baseline is untouched by failed save');
}

// --- media safety: saved AND draft gallery references block deletion ---
const media = { url: 'https://cdn.test/media/prev1.png', storagePath: 'media/prev1.png' };
const galleryState = {
  saved: { portfolio: [], assets: [{ slug: 'a', title: 'A', thumbnail: '', downloadUrl: '', gallery: [{ id: 'p1', url: 'media/prev1.png' }] }], commissions: [], people: [] },
  draft: { portfolio: [], assets: [], commissions: [], people: [] }
};
const savedHits = findMediaUsage(media, galleryState);
assert.ok(savedHits.some((h) => h.field.startsWith('gallery[0]')), 'a saved gallery reference blocks deletion');
const draftState = {
  saved: { portfolio: [], assets: [{ slug: 'a', title: 'A', thumbnail: '', downloadUrl: '' }], commissions: [], people: [] },
  draft: { portfolio: [], assets: [{ slug: 'a', title: 'A', thumbnail: '', downloadUrl: '', gallery: [{ id: 'p9', url: 'media/prev1.png' }] }], commissions: [], people: [] }
};
assert.ok(findMediaUsage(media, draftState).length > 0, 'an unsaved draft gallery reference blocks deletion');
const urlFormState = {
  saved: { portfolio: [], assets: [], commissions: [], people: [] },
  draft: {
    portfolio: [], commissions: [], people: [],
    assets: [{ slug: 'a', title: 'A', gallery: [{ id: 'p1', url: 'https://cdn.test/media/prev1.png' }] }]
  }
};
const urlForm = findMediaUsage(
  { url: 'https://cdn.test/media/prev1.png', storagePath: '' },
  urlFormState
);
assert.ok(urlForm.length > 0, 'URL-form references match without a storage path');
const twoRefs = {
  saved: {
    portfolio: [], commissions: [], people: [],
    assets: [{ slug: 'a', title: 'A', gallery: [{ id: 'p1', url: 'media/prev1.png' }, { id: 'p2', url: 'media/prev1.png' }] }]
  },
  draft: { portfolio: [], assets: [], commissions: [], people: [] }
};
const afterOneRemoved = {
  saved: {
    portfolio: [], commissions: [], people: [],
    assets: [{ slug: 'a', title: 'A', gallery: [{ id: 'p2', url: 'media/prev1.png' }] }]
  },
  draft: { portfolio: [], assets: [], commissions: [], people: [] }
};
assert.equal(findMediaUsage(media, twoRefs).length, 2, 'two references report twice');
assert.equal(findMediaUsage(media, afterOneRemoved).length, 1, 'removing one reference keeps the other blocking');

// --- authoritative + cleanup scans recognize metadata.gallery ---
const bundle = { free_assets: [{ slug: 'a', metadata: { gallery: [{ id: 'p1', url: 'media/prev1.png' }] } }] };
assert.ok(findAuthoritativeMediaReferences(media, bundle).length > 0, 'authoritative scan sees metadata.gallery');
const index = buildReferenceIndex(
  [{ key: 'free_assets', label: 'Assets', complete: true, data: bundle.free_assets }],
  { bucket: 'media', knownPrefixes: ['media'] }
);
assert.ok(index.index.has('media/media/prev1.png'), 'cleanup scan indexes gallery storage paths');

// --- paged reads: beyond a simulated API page limit + fail closed ---
const threePages = Array.from({ length: 1200 }, (_, i) => ({ id: 'r' + i }));
const paged = await collectPagedRows(async ({ from, to }) => threePages.slice(from, to + 1), { pageSize: 500 });
assert.equal(paged.rows.length, 1200, 'a reference beyond the page limit is still collected');
assert.equal(paged.complete, true, 'full pagination reports complete');
assert.equal(paged.pagesFetched, 3, '1200 rows at page size 500 take three fetches');
const failing = await collectPagedRows(async ({ page }) => {
  if (page === 0) return Array.from({ length: 500 }, (_, i) => ({ id: 'r' + i }));
  throw new Error('boom');
}, { pageSize: 500 });
assert.equal(failing.complete, false, 'a page error resolves incomplete (fail closed)');
assert.equal(failing.rows.length, 500, 'partial rows are kept but flagged incomplete');

console.log('PASS asset gallery data contract, editor rules, media safety and paging');
