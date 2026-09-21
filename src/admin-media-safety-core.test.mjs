import assert from 'node:assert/strict';
import {
  MEDIA_DELETION_STATUS,
  mediaDeletionStatus,
  nextMediaDeletionAction,
  applyMediaDeletionResult,
  mediaReferenceMatches,
  findMediaUsage,
  findAuthoritativeMediaReferences,
  mediaUsageMessage,
  isMissingStorageObject,
  buildMediaAuditEntry,
  auditMediaIntegrity
} from './admin-media-safety-core.js';

const media = {
  id: 'media-1',
  storagePath: 'uploads/123_petal.png',
  url: 'https://project.supabase.co/storage/v1/object/public/media/uploads/123_petal.png',
  title: 'petal.png',
  type: 'image'
};

// --- reference matching -----------------------------------------------------
assert.equal(mediaReferenceMatches(media.url, media), true, 'the public URL matches');
assert.equal(mediaReferenceMatches(media.storagePath, media), true, 'the bare storage path matches');
assert.equal(mediaReferenceMatches('https://x/storage/v1/object/public/media/' + media.storagePath + '?token=1', media), true, 'a signed variant matches');
assert.equal(mediaReferenceMatches('https://example.test/other.png', media), false);
assert.equal(mediaReferenceMatches('', media), false);
assert.equal(mediaReferenceMatches(null, media), false);
assert.equal(mediaReferenceMatches('anything', { id: 'x', storagePath: '', url: '' }), false, 'an empty media item matches nothing');

// --- Test 2: top-level references -------------------------------------------
const savedState = {
  portfolio: [
    { id: 'color-fiesta', slug: 'color-fiesta', title: 'Color Fiesta', thumbnail: media.url, cover: '', blocks: [] },
    { id: 'other', slug: 'other', title: 'Other', thumbnail: '', cover: '', blocks: [] }
  ],
  assets: [{ id: 'petal-pack', slug: 'petal-pack', title: 'Petal pack', thumbnail: media.url, downloadUrl: '' }],
  commissions: [{ id: 'bust-up', slug: 'bust-up', title: 'Bust up', thumbnail: media.url }],
  pages: { about: { title: 'About', profileImage: media.url } },
  settings: { branding: { logo: media.url }, seo: { socialImage: media.url }, music: { url: media.url } }
};
const topLevel = findMediaUsage(media, { saved: savedState, draft: null });
assert.deepEqual(
  topLevel.map((usage) => usage.entityType + ':' + usage.entityId + ':' + usage.field).sort(),
  ['assets:petal-pack:thumbnail', 'commissions:bust-up:thumbnail', 'pages:about:profileImage', 'portfolio:color-fiesta:thumbnail', 'settings:branding:branding.logo', 'settings:music:music.url', 'settings:seo:seo.socialImage']
);
assert.equal(topLevel.every((usage) => typeof usage.label === 'string' && usage.label.length > 0), true, 'every usage carries a human label');

// --- Test 3: nested block/gallery references --------------------------------
const nestedState = {
  portfolio: [{
    id: 'color-fiesta', slug: 'color-fiesta', title: 'Color Fiesta', thumbnail: '', cover: '',
    blocks: [
      { type: 'text', text: 'no media here' },
      { type: 'image', url: media.url, alt: 'petal' },
      { type: 'gallery', items: [{ url: media.storagePath, alt: 'a', caption: 'b' }] },
      { type: 'before-after', before: media.url, after: 'https://example.test/after.png' },
      { type: 'image-text', url: '', text: 'x' }
    ]
  }],
  assets: [], commissions: [], pages: {}, settings: {}
};
const nested = findMediaUsage(media, { saved: nestedState, draft: null });
assert.deepEqual(
  nested.map((usage) => usage.field).sort(),
  ['blocks[1].url', 'blocks[2].items[0].url', 'blocks[3].before'],
  'nested block and gallery references are detected'
);
assert.match(nested[0].label, /block 2 \(image\)/i, 'the label names the block');

// --- draft references count too --------------------------------------------
const draftOnly = findMediaUsage(media, {
  saved: { portfolio: [{ id: 'p', slug: 'p', title: 'P', thumbnail: '', cover: '', blocks: [] }], assets: [], commissions: [], pages: {}, settings: {} },
  draft: { portfolio: [{ id: 'p', slug: 'p', title: 'P', thumbnail: media.url, cover: '', blocks: [] }], assets: [], commissions: [], pages: {}, settings: {} }
});
assert.deepEqual(draftOnly.map((usage) => usage.field), ['thumbnail'], 'an unsaved draft reference is detected once');
assert.deepEqual(findMediaUsage(media, { saved: null, draft: null }), [], 'no admin state means no usages');
assert.deepEqual(findMediaUsage({ id: 'x', storagePath: 'uploads/none.png', url: 'https://x/media/uploads/none.png' }, { saved: savedState, draft: null }), [], 'an unreferenced file reports no usages');

assert.match(mediaUsageMessage(topLevel), /used in 7 places/i);
assert.match(mediaUsageMessage(topLevel), /cannot be deleted/i);
assert.match(mediaUsageMessage([nested[0]]), /used in 1 place/i);
assert.equal(mediaUsageMessage([]), '');

// --- deletion state machine -------------------------------------------------
assert.equal(mediaDeletionStatus({}), 'active');
assert.equal(mediaDeletionStatus({ deletion_status: 'pending' }), 'pending');
assert.equal(mediaDeletionStatus({ deletion_status: 'nonsense' }), 'active');
assert.equal(nextMediaDeletionAction({ id: 'm', deletion_status: 'active' }), 'tombstone');
assert.equal(nextMediaDeletionAction({ id: 'm', deletion_status: 'pending' }), 'remove_storage');
assert.equal(nextMediaDeletionAction({ id: 'm', deletion_status: 'storage_removed' }), 'finalize');
assert.equal(nextMediaDeletionAction({}), 'invalid');
assert.deepEqual(Object.values(MEDIA_DELETION_STATUS).sort(), ['active', 'pending', 'storage_removed']);

// --- deletion transitions ---------------------------------------------------
const activeRow = { id: 'm', storage_path: 'uploads/a.png', deletion_status: 'active' };
const tombstoned = applyMediaDeletionResult(activeRow, { action: 'tombstone', at: '2026-09-20T00:00:00Z' });
assert.equal(tombstoned.deletion_status, 'pending');
assert.equal(tombstoned.deleted_at, '2026-09-20T00:00:00Z');
assert.equal(tombstoned.deletion_error, null);
assert.equal(activeRow.deletion_status, 'active', 'transitions never mutate the input row');

const storageFailed = applyMediaDeletionResult(tombstoned, { action: 'remove_storage', storageRemoved: false, error: 'network down' });
assert.equal(storageFailed.deletion_status, 'pending', 'a failed storage removal stays recoverable');
assert.equal(storageFailed.deletion_error, 'network down');

const storageDone = applyMediaDeletionResult(tombstoned, { action: 'remove_storage', storageRemoved: true });
assert.equal(storageDone.deletion_status, 'storage_removed');
assert.equal(storageDone.deletion_error, null);

const finalizeFailed = applyMediaDeletionResult(storageDone, { action: 'finalize', finalized: false, error: 'row delete failed' });
assert.equal(finalizeFailed.deletion_status, 'storage_removed', 'a failed finalize must not return the row to active');
assert.equal(finalizeFailed.deletion_error, 'row delete failed');

const finalized = applyMediaDeletionResult(storageDone, { action: 'finalize', finalized: true });
assert.equal(finalized.deletion_status, 'deleted', 'a successful finalize is a terminal state');
assert.equal(finalized.deletion_error, null);
assert.equal(nextMediaDeletionAction({ id: 'm', deletion_status: 'storage_removed' }), 'finalize', 'a failed finalize can be retried');

// --- storage error classification ------------------------------------------
assert.equal(isMissingStorageObject({ message: 'Object not found' }), true);
assert.equal(isMissingStorageObject({ message: 'The resource was not found', statusCode: '404' }), true);
assert.equal(isMissingStorageObject(new Error('does not exist')), true);
assert.equal(isMissingStorageObject({ message: 'permission denied' }), false);
assert.equal(isMissingStorageObject(null), false);

// --- audit entries ----------------------------------------------------------
const auditEntry = buildMediaAuditEntry('media_delete_requested', {
  actorId: 'user-1', actorEmail: 'admin@example.test', mediaId: 'media-1', storagePath: 'uploads/123_petal.png', details: { usages: 0 }
});
assert.equal(auditEntry.action, 'media_delete_requested');
assert.equal(auditEntry.entity_type, 'media');
assert.equal(auditEntry.entity_id, 'media-1');
assert.equal(auditEntry.storage_path, 'uploads/123_petal.png');
assert.equal(auditEntry.actor_id, 'user-1');
assert.equal(auditEntry.actor_email, 'admin@example.test');
assert.deepEqual(auditEntry.details, { usages: 0 });
assert.equal(typeof auditEntry.created_at, 'string');
assert.deepEqual(buildMediaAuditEntry('media_delete_failed', { details: null }).details, {}, 'details always default to an object');
assert.equal(buildMediaAuditEntry('media_delete_failed', {}).entity_id, null);

// --- Test 14/15: integrity diagnostics -------------------------------------
const integrity = auditMediaIntegrity({
  mediaRows: [
    { id: 'keep', storage_path: 'uploads/keep.png', original_name: 'keep.png', deletion_status: 'active' },
    { id: 'gone', storage_path: 'uploads/gone.png', original_name: 'gone.png', deletion_status: 'active' },
    { id: 'pending', storage_path: 'uploads/pending.png', original_name: 'pending.png', deletion_status: 'pending', deletion_error: 'storage timeout' },
    { id: 'halfway', storage_path: 'uploads/halfway.png', original_name: 'halfway.png', deletion_status: 'storage_removed' },
    { id: 'nopath', storage_path: '', original_name: 'nopath', deletion_status: 'active' }
  ],
  storagePaths: ['uploads/keep.png', 'uploads/pending.png', 'uploads/orphan.png']
});
assert.deepEqual(integrity.missingObjects.map((entry) => entry.id), ['gone'], 'an active row without an object is reported');
assert.deepEqual(integrity.orphanObjects.map((entry) => entry.storagePath), ['uploads/orphan.png'], 'an object with no media row is reported');
assert.deepEqual(integrity.pendingCleanup.map((entry) => entry.id).sort(), ['halfway', 'pending'], 'tombstones needing cleanup are reported');
assert.equal(integrity.pendingCleanup.find((entry) => entry.id === 'pending').storageObjectPresent, true);
assert.equal(integrity.pendingCleanup.find((entry) => entry.id === 'halfway').storageObjectPresent, false);
assert.equal(integrity.pendingCleanup.find((entry) => entry.id === 'pending').error, 'storage timeout');
assert.deepEqual(auditMediaIntegrity({}), { missingObjects: [], orphanObjects: [], pendingCleanup: [] }, 'the diagnostic is safe to run on empty input');
assert.deepEqual(auditMediaIntegrity({ mediaRows: [], storagePaths: ['uploads/x.png'] }).orphanObjects.map((entry) => entry.storagePath), ['uploads/x.png']);

// P0-02: externalLinks and link references block deletion.
{
  const linked = findMediaUsage(media, {
    saved: {
      portfolio: [{ id: 'p', slug: 'p', title: 'P', thumbnail: '', cover: '', blocks: [], link: '', externalLinks: [{ title: 'Ref', url: media.url }] }],
      assets: [], commissions: [], pages: {}, settings: {}
    },
    draft: null
  });
  assert.equal(linked.length, 1, 'a portfolio externalLinks reference blocks deletion');
  assert.match(linked[0].field, /externalLinks/, 'the usage names the externalLinks field');
}
{
  const pageLinked = findMediaUsage(media, {
    saved: {
      portfolio: [], assets: [], commissions: [],
      pages: { about: { title: 'About', profileImage: '', links: [{ label: 'IG', url: media.storagePath }] } },
      settings: {}
    },
    draft: null
  });
  assert.equal(pageLinked.length, 1, 'a page links reference blocks deletion');
}
{
  const driveLinked = findMediaUsage(media, {
    saved: {
      portfolio: [], commissions: [], pages: {}, settings: {},
      assets: [{ id: 'pack', slug: 'pack', title: 'Pack', thumbnail: '', downloadUrl: '', media: '', driveUrl: media.url }]
    },
    draft: null
  });
  assert.equal(driveLinked.length, 1, 'an asset driveUrl reference blocks deletion');
}

console.log('Admin media safety core tests passed.');

// P0-02 cross-session race: Session A snapshot is stale, Session B saved a new
// reference. The authoritative bundle (fresh server read) must still block.
{
  const staleUsage = findMediaUsage(media, {
    saved: { portfolio: [], assets: [], commissions: [], pages: {}, settings: {} },
    draft: null
  });
  assert.deepEqual(staleUsage, [], 'the stale session snapshot sees no reference');
  const authoritative = {
    portfolio_projects: [{ thumbnail_path: media.url, cover_path: null, content: {} }],
    free_assets: [],
    commission_services: [],
    cms_pages: [],
    site_settings: []
  };
  const fresh = findAuthoritativeMediaReferences(media, authoritative);
  assert.equal(fresh.length >= 1, true, 'the fresh authoritative check blocks the delete');
  assert.match(mediaUsageMessage(fresh), /cannot be deleted/i);
  const unused = findAuthoritativeMediaReferences(media, {
    portfolio_projects: [], free_assets: [], commission_services: [], cms_pages: [], site_settings: []
  });
  assert.deepEqual(unused, [], 'a truly unused file still deletes');
  const nestedFresh = findAuthoritativeMediaReferences(media, {
    portfolio_projects: [{ content: { blocks: [{ url: media.storagePath }] } }]
  });
  assert.equal(nestedFresh.length, 1, 'jsonb-nested references are detected');
}
console.log('Media authoritative cross-session regression tests passed.');
