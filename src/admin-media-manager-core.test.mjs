import assert from 'node:assert/strict';
import {
  MEDIA_VIEWS,
  normalizeMediaView,
  normalizeMediaType,
  mediaTypeRules,
  MEDIA_SORTS,
  mediaQuerySpec,
  mediaQueryChanged,
  mediaFilterSummary,
  formatDimensions,
  formatUploadDate,
  mediaMetadataRows,
  previewKindFor,
  previewDescriptor,
  acceptMatches,
  mediaTargetAccept,
  mediaItemMatchesTarget,
  mediaInputAccept,
  filterByAccept,
  toggleSelection,
  selectionState,
  reconcilePageSelection,
  resolvePickerSelectedItems,
  createPickerMediaQuery,
  pickerResultFor,
  blockMediaFields,
  blockAcceptsMultiple,
  galleryItemsFor,
  bulkMediaSummary,
  bulkSummaryMessage,
  acceptedDropFiles,
  dropMessage,
  validDimensions,
  mediaLabelPayload,
  keyboardSaveDecision,
  mediaTypeServerClauses
} from './admin-media-manager-core.js';

// --- Test 1 core: view switch never changes the dataset ---------------------
assert.equal(normalizeMediaView('list'), MEDIA_VIEWS.LIST);
assert.equal(normalizeMediaView('grid'), MEDIA_VIEWS.GRID);
assert.equal(normalizeMediaView(undefined), MEDIA_VIEWS.GRID, 'grid is the default view');
assert.equal(normalizeMediaView('nonsense'), MEDIA_VIEWS.GRID);

// --- Test 2 core: filters/sort describe one server query --------------------
assert.deepEqual(mediaQuerySpec({}), { search: null, type: 'all', sort: 'newest', from: null, to: null, page: 1, pageSize: 30 });
assert.deepEqual(mediaQuerySpec({ search: ' petal ', type: 'image', sort: 'oldest', from: '2026-01-01', to: '2026-02-01', page: '3' }), {
  search: 'petal', type: 'image', sort: 'oldest', from: '2026-01-01', to: '2026-02-01', page: 3, pageSize: 30
});
assert.equal(mediaQuerySpec({ type: 'anything' }).type, 'all', 'an unknown type filter falls back to all');
assert.equal(mediaQuerySpec({ sort: 'sideways' }).sort, 'newest');
assert.equal(mediaQuerySpec({ from: '01/01/2026' }).from, null, 'non ISO dates are ignored rather than guessed');
assert.equal(mediaQuerySpec({ to: '2026-02-31' }).to, '2026-02-31', 'date shape is validated, not calendar-checked');
assert.equal(normalizeMediaType('video'), 'video');
assert.deepEqual(mediaTypeRules('document').extensions, ['pdf', 'zip']);
assert.equal(mediaTypeRules('all'), null, 'no filter means no type predicate');
assert.ok(MEDIA_SORTS.length >= 2);

assert.equal(mediaQueryChanged({}, { type: 'image' }), true, 'a type change is a query change');
assert.equal(mediaQueryChanged({ type: 'image' }, { type: 'image', page: 4 }), false, 'paging alone is handled by the range');
assert.equal(mediaQueryChanged({ search: 'a' }, { search: 'a', sort: 'name' }), true);
assert.match(mediaFilterSummary({ search: 'petal', type: 'image' }), /petal/);
assert.equal(mediaFilterSummary({ type: 'all' }), '');

// --- Test 3/4 core: metadata + canonical original ---------------------------
const item = {
  id: 'm1', title: 'petal.png', type: 'image', mimeType: 'image/png', size: '2.1 MB', createdAt: '2026-03-04T10:00:00Z',
  url: 'https://cdn/uploads/petal.png', thumbnailUrl: 'https://cdn/render/petal.png?width=480',
  storagePath: 'uploads/petal.png', alt: 'A petal', sha256: 'abc', deletionStatus: 'active', width: 1200, height: 800
};
assert.equal(formatDimensions(item), '1200 × 800 px');
assert.equal(formatDimensions({ width: 0, height: 10 }), '');
assert.equal(formatDimensions({}), '');
assert.equal(formatUploadDate('2026-03-04T10:00:00Z'), '2026-03-04');
assert.equal(formatUploadDate(''), '');
const readable = mediaMetadataRows(item).map((row) => row.label);
assert.deepEqual(readable, ['File name', 'Type', 'Size', 'Uploaded', 'Dimensions', 'Alt text']);
const technical = mediaMetadataRows(item, { technical: true }).map((row) => row.label);
assert.ok(technical.includes('SHA-256') && technical.includes('Storage path'), 'the digest lives in the technical view');
assert.ok(!readable.includes('SHA-256'), 'the digest is not visual clutter in the normal view');

// --- Test 3 core: preview kinds and canonical originals ---------------------
assert.equal(previewKindFor(item), 'image');
assert.equal(previewKindFor({ url: 'https://cdn/f.gif', title: 'f.gif', mimeType: 'image/gif' }), 'image');
assert.equal(previewKindFor({ url: 'https://cdn/f.mp4', title: 'f.mp4', mimeType: 'video/mp4' }), 'video');
assert.equal(previewKindFor({ url: 'https://cdn/f.mp3', title: 'f.mp3', mimeType: 'audio/mpeg' }), 'audio');
assert.equal(previewKindFor({ url: 'https://cdn/f.pdf', title: 'f.pdf', mimeType: 'application/pdf' }), 'pdf');
assert.equal(previewKindFor({ url: 'https://cdn/f.zip', title: 'f.zip', mimeType: 'application/zip' }), 'unsupported');
assert.equal(previewKindFor({ title: 'f.png' }), 'unsupported', 'without a URL there is nothing to preview');
const preview = previewDescriptor(item);
assert.equal(preview.kind, 'image');
assert.equal(preview.original, 'https://cdn/uploads/petal.png');
assert.notEqual(preview.original, item.thumbnailUrl, 'preview never uses the transformed variant');
assert.match(previewDescriptor({ url: 'https://cdn/f.zip', title: 'f.zip' }).note, /No inline preview/);

// --- Tests 7/8 core: accept filters and single vs multiple selection --------
assert.equal(acceptMatches(item, 'image/*'), true);
assert.equal(acceptMatches(item, '.png'), true);
assert.equal(acceptMatches(item, 'image/png'), true);
assert.equal(acceptMatches(item, 'video/*'), false);
assert.equal(acceptMatches({ mimeType: 'video/mp4', title: 'a.mp4' }, 'image/*'), false);
assert.equal(acceptMatches(item, undefined), true, 'no accept means anything goes');
assert.deepEqual(filterByAccept([item, { mimeType: 'video/mp4', title: 'a.mp4' }], 'image/*').map((entry) => entry.id), ['m1']);
assert.deepEqual(toggleSelection([], 'a'), ['a']);
assert.deepEqual(toggleSelection(['a', 'b'], 'a'), ['b']);
assert.deepEqual(reconcilePageSelection(['a', 'b', 'a', 'missing'], [{ id: 'a' }, { id: 'b' }]), ['a', 'b'], 'a page-scoped selection only retains loaded records');
assert.deepEqual(reconcilePageSelection(['a', 'b'], [{ id: 'c' }]), [], 'changing pages clears selections not present on the new page');
const pickerRecords = [{ id: 'a', url: 'https://cdn/a.png' }, { id: 'b', url: 'https://cdn/b.png' }];
const pickerSelected = ['a', 'b'];
const managerSelected = ['unrelated'];
assert.deepEqual(resolvePickerSelectedItems(pickerSelected, pickerRecords), pickerRecords, 'Apply receives exactly the two records selected in the Picker');
assert.deepEqual(managerSelected, ['unrelated'], 'resolving Picker selection leaves Manager selection untouched');
assert.deepEqual(resolvePickerSelectedItems(pickerSelected, pickerRecords.filter((record) => record.id !== 'b')), null, 'Apply must reject an unresolved selection instead of dropping it');
assert.deepEqual(resolvePickerSelectedItems([], pickerRecords), [], 'an empty Picker selection remains empty regardless of Manager state');
assert.deepEqual(pickerSelected, ['a', 'b'], 'selection remains available until application completes');
assert.deepEqual(createPickerMediaQuery({ search: 'abc', type: 'document', sort: 'name', from: '2026-01-01', to: '2026-02-01', page: 4, pageSize: 50 }), {
  search: null, type: 'all', sort: 'newest', from: null, to: null, page: 1, pageSize: 50
}, 'the picker starts with an isolated, visible-only browse query');
assert.deepEqual(selectionState(['a'], [{ id: 'a', url: 'https://cdn/a.png' }, { id: 'b', url: 'https://cdn/b.png' }]).urls, ['https://cdn/a.png']);
assert.deepEqual(pickerResultFor(['https://cdn/a.png'], { multiple: false }).value, 'https://cdn/a.png');
assert.deepEqual(pickerResultFor(['https://cdn/a.png', 'https://cdn/b.png'], { multiple: true }).value, ['https://cdn/a.png', 'https://cdn/b.png']);
assert.equal(pickerResultFor([], { multiple: false }).value, null);
assert.equal(pickerResultFor(['https://cdn/a.png', 'https://cdn/b.png'], { multiple: false }).value, 'https://cdn/a.png', 'a single field still receives one URL');

// --- Tests 9/10 core: block targets ----------------------------------------
assert.deepEqual(blockMediaFields('image'), ['url']);
assert.deepEqual(blockMediaFields('gallery'), ['items']);
assert.deepEqual(blockMediaFields('grid'), ['items']);
assert.deepEqual(blockMediaFields('before-after'), ['before', 'after']);
assert.deepEqual(blockMediaFields('text'), [], 'text blocks never receive media');
assert.equal(blockAcceptsMultiple('gallery'), true);
assert.equal(blockAcceptsMultiple('image'), false);
assert.equal(blockAcceptsMultiple('before-after'), false, 'before/after targets one slot at a time');
assert.deepEqual(galleryItemsFor(['https://cdn/a.png', 'https://cdn/b.png'], { alt: 'art' }), [
  { url: 'https://cdn/a.png', alt: 'art', caption: '' },
  { url: 'https://cdn/b.png', alt: 'art', caption: '' }
]);

// Patch 3: every editor target has an explicit, narrow media contract.
const mediaRecord = (title, mimeType) => ({ title, mimeType, url: 'https://cdn/' + title });
assert.equal(mediaTargetAccept('portfolio.p.blocks.0.items', 'gallery'), 'image/*');
assert.equal(mediaTargetAccept('portfolio.p.blocks.1.items', 'grid'), 'image/*');
assert.equal(mediaTargetAccept('portfolio.p.blocks.2.url', 'video'), 'video/*');
assert.equal(mediaTargetAccept('portfolio.p.blocks.3.url', 'gif'), 'image/gif');
assert.equal(mediaTargetAccept('portfolio.p.blocks.4.before', 'before-after'), 'image/*');
assert.equal(mediaTargetAccept('settings.music.url'), 'audio/*');
assert.equal(mediaTargetAccept('assets.asset.downloadUrl'), '*');
assert.equal(mediaTargetAccept('settings.branding.heroMedia'), 'image/*');
assert.equal(mediaTargetAccept('settings.theme.backgroundImage'), 'image/*');
assert.equal(mediaTargetAccept('portfolio.p.blocks.5.url', 'youtube'), null);
assert.equal(mediaTargetAccept('settings.unknown'), null);
assert.equal(mediaItemMatchesTarget(mediaRecord('art.png', 'image/png'), 'image/*'), true);
assert.equal(mediaItemMatchesTarget(mediaRecord('clip.mp4', 'video/mp4'), 'image/*'), false);
assert.equal(mediaItemMatchesTarget(mediaRecord('sheet.pdf', 'application/pdf'), 'image/*'), false);
assert.equal(mediaItemMatchesTarget(mediaRecord('song.mp3', 'audio/mpeg'), 'image/*'), false);
assert.equal(mediaItemMatchesTarget(mediaRecord('clip.mp4', 'video/mp4'), 'video/*'), true);
assert.equal(mediaItemMatchesTarget(mediaRecord('art.png', 'image/png'), 'video/*'), false);
assert.equal(mediaItemMatchesTarget(mediaRecord('fake.gif', 'video/mp4'), 'image/gif'), false);
assert.equal(mediaItemMatchesTarget(mediaRecord('art.png', 'image/png'), 'audio/*'), false);
assert.equal(mediaItemMatchesTarget(mediaRecord('clip.mp4', 'video/mp4'), 'audio/*'), false);
assert.equal(mediaItemMatchesTarget(mediaRecord('song.mp3', 'audio/mpeg'), 'audio/*'), true);
assert.equal(mediaItemMatchesTarget(mediaRecord('archive.zip', 'application/zip'), '*'), true);
assert.equal(mediaItemMatchesTarget(mediaRecord('bad.txt', 'text/plain'), '*'), false);
assert.equal(mediaInputAccept('*').includes('audio/mpeg'), true);
assert.equal(mediaInputAccept('*').includes('application/zip'), true);
assert.equal(mediaInputAccept('*').includes('.zip'), true);
assert.equal(mediaInputAccept('image/*').includes('video/mp4'), false);
assert.equal(mediaInputAccept('video/*').includes('video/mp4'), true);
assert.deepEqual(acceptedDropFiles([{ name: 'clip.mp4', type: 'video/mp4' }, { name: 'art.png', type: 'image/png' }], { accept: 'image/*' }).map((file) => file.name), ['art.png']);
assert.deepEqual(acceptedDropFiles([{ name: 'art.png', type: '' }], { accept: 'image/*' }).map((file) => file.name), ['art.png']);
assert.deepEqual(acceptedDropFiles([{ name: 'evil.exe', type: 'image/png' }], { accept: 'image/*' }), []);
// --- Tests 11-13 core: bulk delete summary ---------------------------------
const summary = bulkMediaSummary([
  { id: 'a', title: 'a.png', result: { success: true } },
  { id: 'b', title: 'b.png', result: { success: false, blocked: true, error: 'still used in 2 places' } },
  { id: 'c', title: 'c.png', result: { success: false, pending: true, error: 'storage timeout' } },
  { id: 'd', title: 'd.png', result: { success: false, error: 'boom' } }
]);
assert.deepEqual({ deleted: summary.deleted, blocked: summary.blocked, pending: summary.pending, failed: summary.failed, total: summary.total }, { deleted: 1, blocked: 1, pending: 1, failed: 1, total: 4 });
assert.equal(summary.details.find((entry) => entry.title === 'b.png').status, 'blocked');
assert.match(bulkSummaryMessage(summary), /deleted: 1/);
assert.match(bulkSummaryMessage(summary), /blocked: 1/);
assert.match(bulkSummaryMessage(summary), /needs retry: 1/);
assert.match(bulkSummaryMessage(summary), /failed: 1/);
assert.equal(bulkSummaryMessage(bulkMediaSummary([])), 'Nothing to delete.');
assert.deepEqual(bulkMediaSummary(null).deleted, 0);

// --- Test 5 core: drag and drop validation ---------------------------------
const dropped = acceptedDropFiles([{ name: 'a.png', type: 'image/png' }, { name: 'b.txt', type: 'text/plain' }]);
assert.deepEqual(dropped.map((file) => file.name), ['a.png'], 'only supported files are queued');
assert.deepEqual(acceptedDropFiles([{ name: 'a.mp4', type: 'video/mp4' }], { accept: 'video/*' }).map((file) => file.name), ['a.mp4']);
assert.equal(acceptedDropFiles(new Array(30).fill({ name: 'a.png', type: 'image/png' })).length, 20, 'drops are bounded');
assert.match(dropMessage([{ name: 'a.png' }]), /a\.png/);
assert.match(dropMessage([{ name: 'a.png' }, { name: 'b.png' }]), /2 files/);
assert.match(dropMessage([]), /No supported files/);
assert.deepEqual(validDimensions({ width: 1200.4, height: 800.6 }), { width: 1200, height: 801 });
assert.equal(validDimensions({ width: 0, height: 5 }), null);
assert.equal(validDimensions({ width: 200000, height: 5 }), null);
assert.deepEqual(mediaLabelPayload('  Petal art  '), { alt_text: 'Petal art' });
assert.deepEqual(mediaLabelPayload(null), { alt_text: '' });

// --- Tests 14-16 core: keyboard save decision ------------------------------
assert.deepEqual(keyboardSaveDecision({ key: 's', ctrlKey: true, loadState: 'ready', dirty: true, savedTargets: ['portfolio'] }), { action: 'save', targets: ['portfolio'], reason: 'ok' });
assert.equal(keyboardSaveDecision({ key: 's', metaKey: true, loadState: 'ready', dirty: true, savedTargets: ['portfolio'] }).action, 'save');
assert.equal(keyboardSaveDecision({ key: 's', loadState: 'ready', dirty: true, savedTargets: ['portfolio'] }).action, 'ignore', 'a bare S must never save');
assert.equal(keyboardSaveDecision({ key: 'x', ctrlKey: true, loadState: 'ready', dirty: true, savedTargets: ['portfolio'] }).action, 'ignore');
assert.equal(keyboardSaveDecision({ key: 's', ctrlKey: true, loadState: 'loading', dirty: true, savedTargets: ['portfolio'] }).reason, 'not-ready');
assert.equal(keyboardSaveDecision({ key: 's', ctrlKey: true, loadState: 'ready', dirty: false, savedTargets: ['portfolio'] }).reason, 'nothing-dirty');
assert.equal(keyboardSaveDecision({ key: 's', ctrlKey: true, loadState: 'ready', dirty: true, savedTargets: [] }).reason, 'no-target');
assert.equal(keyboardSaveDecision({ key: 's', ctrlKey: true, loadState: 'ready', dirty: true, savedTargets: ['portfolio'], hasOpenModal: true }).reason, 'modal-open');
assert.equal(keyboardSaveDecision({ key: 's', ctrlKey: true, loadState: 'ready', dirty: true, savedTargets: ['portfolio'], busy: true }).reason, 'busy');

// Server-side type predicates: percent signs stay raw because the Supabase
// builder encodes them; a pre-encoded %25 would reach Postgres as a literal.
const imageClauses = mediaTypeServerClauses('image');
assert.ok(imageClauses.includes('mime_type.like.image/%'), 'MIME prefixes keep a raw wildcard');
assert.ok(imageClauses.includes('original_name.ilike.%.png'), 'PNG falls back to a raw ilike wildcard');
assert.ok(imageClauses.includes('original_name.ilike.%.jpg'), 'JPG falls back to a raw ilike wildcard');
assert.ok(imageClauses.includes('original_name.ilike.%.jpeg'), 'JPEG falls back to a raw ilike wildcard');
assert.ok(imageClauses.includes('original_name.ilike.%.webp'), 'WEBP falls back to a raw ilike wildcard');
assert.ok(imageClauses.includes('original_name.ilike.%.gif'), 'GIF falls back to a raw ilike wildcard');
assert.ok(imageClauses.includes('original_name.ilike.%.svg'), 'SVG falls back to a raw ilike wildcard');
assert.equal(imageClauses.some((clause) => clause.includes('%25')), false, 'no clause may carry a double-encoded wildcard');
const documentClauses = mediaTypeServerClauses('document');
assert.ok(documentClauses.includes('original_name.ilike.%.pdf'), 'PDF falls back to a raw ilike wildcard');
assert.ok(documentClauses.includes('original_name.ilike.%.zip'), 'ZIP falls back to a raw ilike wildcard');
const audioClauses = mediaTypeServerClauses('audio');
assert.ok(audioClauses.includes('mime_type.like.audio/%'), 'audio MIME prefix keeps a raw wildcard');
assert.ok(audioClauses.includes('original_name.ilike.%.mp3'), 'MP3 falls back to a raw ilike wildcard');
const videoClauses = mediaTypeServerClauses('video');
assert.ok(videoClauses.includes('original_name.ilike.%.mp4'), 'MP4 falls back to a raw ilike wildcard');
assert.deepEqual(mediaTypeServerClauses('all'), [], 'no filter means no predicate');
assert.deepEqual(mediaTypeServerClauses('bogus'), [], 'an unknown filter means no predicate');

console.log('Admin media manager core tests passed.');

