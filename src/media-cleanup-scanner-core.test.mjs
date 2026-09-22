import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  canonicalizeStoragePath,
  identityOf,
  extractCandidateIdentities,
  collectAllPages,
  buildReferenceIndex,
  fingerprintObject,
  mediaGroupForMime,
  classifySnapshot,
  planStatePersistence,
  ROW_CLASSIFICATION,
  SCAN_STATUS
} from './media-cleanup-scanner-core.js';

const BUCKET = 'media';
const PREFIXES = ['uploads'];

// URL encoding: `uploads/a b.png` and `uploads/a%20b.png` are one identity,
// from both directions (stored path vs referenced URL).
{
  assert.equal(canonicalizeStoragePath('uploads/a b.png', BUCKET), 'uploads/a b.png');
  assert.equal(canonicalizeStoragePath('uploads/a%20b.png', BUCKET), 'uploads/a b.png');
  assert.equal(
    canonicalizeStoragePath('https://proj.supabase.co/storage/v1/object/public/media/uploads/a%20b.png?x=1', BUCKET),
    'uploads/a b.png'
  );
  assert.equal(
    canonicalizeStoragePath('https://proj.supabase.co/storage/v1/object/public/media/uploads/a b.png', BUCKET),
    'uploads/a b.png'
  );
  assert.equal(canonicalizeStoragePath('  /uploads//nested/deep/c.png/  ', BUCKET), 'uploads/nested/deep/c.png');
  assert.equal(canonicalizeStoragePath('', BUCKET), '');
  assert.equal(canonicalizeStoragePath(null, BUCKET), '');
  assert.equal(identityOf(BUCKET, 'uploads/a b.png'), 'media/uploads/a b.png');
}

// A literal `%25` in a filename survives (single decode pass, no over-normalizing).
{
  assert.equal(canonicalizeStoragePath('uploads/100%25off.png', BUCKET), 'uploads/100%off.png');
}

// >1000 objects: the pager loops every page, never just the first 1000.
{
  const total = 2500;
  const pageSize = 500;
  const all = Array.from({ length: total }, (_, i) => ({ path: `uploads/img-${i}.png` }));
  const fetchPage = async ({ from, to }) => ({ rows: all.slice(from, to + 1) });
  const result = await collectAllPages(fetchPage, { pageSize });
  assert.equal(result.items.length, total);
  assert.equal(result.complete, true);
  assert.equal(result.pagesFetched, 6, 'five full pages plus the terminating short page');
}

// A failing page keeps partial rows but forces INCOMPLETE (fail closed).
{
  const fetchPage = async ({ page }) => {
    if (page === 2) throw new Error('permission denied');
    return { rows: Array.from({ length: 10 }, (_, i) => ({ path: `uploads/p${page}-${i}.png` })) };
  };
  const result = await collectAllPages(fetchPage, { pageSize: 10 });
  assert.equal(result.complete, false);
  assert.match(result.error, /permission denied/);
  assert.equal(result.items.length, 20);
}

// Reference sources: portfolio, assets, services, forms, pages, navigation,
// settings, and commission request answers — published AND unpublished,
// archived AND trashed. Nested prefixes and deep JSON are covered.
{
  const sources = [
    {
      key: 'portfolio_projects',
      label: 'Portfolio',
      complete: true,
      data: [
        {
          slug: 'unpub',
          published: false,
          thumbnail_path: 'uploads/thumb-unpub.png',
          content: { blocks: [{ type: 'gallery', items: [{ url: 'uploads/nested/deep/gallery-1.png' }] }] }
        }
      ]
    },
    { key: 'free_assets', label: 'Assets', complete: true, data: [{ slug: 'pack', metadata: { file: 'uploads/pack.zip' } }] },
    { key: 'commission_services', label: 'Services', complete: true, data: [{ slug: 'svc', details: { banner: 'uploads/svc.png' } }] },
    {
      key: 'commission_forms',
      label: 'Forms',
      complete: true,
      data: [{ slug: 'f', fields: [{ help: 'See uploads/form-help.png for sizing' }] }]
    },
    { key: 'cms_pages', label: 'Pages', complete: true, data: [{ slug: 'about', content: 'Photo uploads/about.png here' }] },
    { key: 'cms_navigation', label: 'Navigation', complete: true, data: [{ title: 'Promo', url: 'uploads/nav-promo.png' }] },
    {
      key: 'site_settings',
      label: 'Settings',
      complete: true,
      data: [{ key: 'branding', value: { logo: 'uploads/logo.png', pet: { sprite: 'uploads/pet.gif' } } }]
    },
    {
      key: 'commission_requests',
      label: 'Requests',
      complete: true,
      data: [
        { id: 'r1', archived_at: '2026-01-01T00:00:00Z', deleted_at: '2026-02-01T00:00:00Z', answers: { ref: 'uploads/trashed-ref.png' } },
        { id: 'r2', archived_at: null, deleted_at: null, answers: { ref: 'uploads/inbox-ref.png' } }
      ]
    }
  ];
  const built = buildReferenceIndex(sources, { bucket: BUCKET, knownPrefixes: PREFIXES });
  assert.equal(built.complete, true);
  // Tier-2 bare paths only index when they match known prefixes; every source above qualifies.
  for (const path of [
    'uploads/thumb-unpub.png',
    'uploads/nested/deep/gallery-1.png',
    'uploads/pack.zip',
    'uploads/svc.png',
    'uploads/nav-promo.png',
    'uploads/logo.png',
    'uploads/pet.gif',
    'uploads/trashed-ref.png',
    'uploads/inbox-ref.png'
  ]) {
    assert.ok(built.index.get(identityOf(BUCKET, path)), `indexed ${path}`);
  }
  // Bare prose never manufactures an identity.
  const prose = buildReferenceIndex(
    [{ key: 'cms_pages', label: 'Pages', complete: true, data: [{ content: 'Hello world, no files here' }] }],
    { bucket: BUCKET, knownPrefixes: PREFIXES }
  );
  assert.equal(prose.index.size, 0);
}

// Classification: IN_USE (incl. unpublished + trashed refs), POSSIBLY_UNUSED,
// PROTECTED, rowless objects, missing objects, broken URL references.
{
  const mediaRows = [
    { id: 'm1', storage_path: 'uploads/thumb-unpub.png', original_name: 't.png', mime_type: 'image/png', size_bytes: 100, deletion_status: 'active' },
    { id: 'm2', storage_path: 'uploads/trashed-ref.png', original_name: 't.png', mime_type: 'image/png', size_bytes: 200, deletion_status: 'active' },
    { id: 'm3', storage_path: 'uploads/lonely.png', original_name: 'l.png', mime_type: 'image/png', size_bytes: 300, deletion_status: 'active' },
    { id: 'm4', storage_path: 'uploads/held.png', original_name: 'h.png', mime_type: 'video/mp4', size_bytes: 400, deletion_status: 'active' },
    { id: 'm5', storage_path: 'uploads/gone.png', original_name: 'g.png', mime_type: 'audio/mpeg', size_bytes: 500, deletion_status: 'active' }
  ];
  const storageObjects = [
    { path: 'uploads/thumb-unpub.png', sizeBytes: 100 },
    { path: 'uploads/trashed-ref.png', sizeBytes: 200 },
    { path: 'uploads/lonely.png', sizeBytes: 300 },
    { path: 'uploads/held.png', sizeBytes: 400 },
    { path: 'uploads/nested/deep/rowless.png', sizeBytes: 600 },
    { path: 'uploads/rowless-used.png', sizeBytes: 700 }
  ];
  const sources = [
    { key: 'portfolio_projects', label: 'Portfolio', complete: true, data: [{ slug: 'u', published: false, thumbnail_path: 'uploads/thumb-unpub.png' }] },
    { key: 'commission_requests', label: 'Requests', complete: true, data: [{ id: 'r1', deleted_at: '2026-02-01T00:00:00Z', answers: { ref: 'uploads/trashed-ref.png' } }] },
    { key: 'cms_navigation', label: 'Navigation', complete: true, data: [{ title: 'X', url: 'https://proj.supabase.co/storage/v1/object/public/media/uploads/rowless-used.png' }] },
    { key: 'cms_pages', label: 'Pages', complete: true, data: [{ slug: 'p', content: 'broken https://proj.supabase.co/storage/v1/object/public/media/uploads/no-such-file.png end' }] }
  ];
  const built = buildReferenceIndex(sources, { bucket: BUCKET, knownPrefixes: PREFIXES });
  const snapshot = classifySnapshot({
    mediaRows,
    storageObjects,
    refIndex: built.index,
    urlCandidates: built.urlCandidates,
    statesByPath: { 'uploads/held.png': { protected: true } },
    sourceComplete: built.complete,
    sourceReasons: built.reasons,
    storageComplete: true,
    nowIso: '2026-09-23T00:00:00.000Z'
  });
  assert.equal(snapshot.status, SCAN_STATUS.COMPLETE);
  const byId = new Map(snapshot.rows.map((r) => [r.id, r]));
  assert.equal(byId.get('m1').classification, ROW_CLASSIFICATION.IN_USE, 'unpublished reference counts');
  assert.equal(byId.get('m2').classification, ROW_CLASSIFICATION.IN_USE, 'trashed request reference counts');
  assert.equal(byId.get('m3').classification, ROW_CLASSIFICATION.POSSIBLY_UNUSED);
  assert.equal(byId.get('m4').classification, ROW_CLASSIFICATION.PROTECTED);
  assert.equal(byId.get('m5').classification, ROW_CLASSIFICATION.POSSIBLY_UNUSED, 'row without object still classifies (missing reported separately)');

  // Encoded reference matches the stored spaced path.
  const enc = buildReferenceIndex(
    [{ key: 'cms_pages', label: 'Pages', complete: true, data: [{ content: 'see uploads/a%20b.png ok' }] }],
    { bucket: BUCKET, knownPrefixes: PREFIXES }
  );
  const encSnap = classifySnapshot({
    mediaRows: [{ id: 'e1', storage_path: 'uploads/a b.png', mime_type: 'image/png', size_bytes: 10, deletion_status: 'active' }],
    storageObjects: [{ path: 'uploads/a b.png', sizeBytes: 10 }],
    refIndex: enc.index,
    urlCandidates: enc.urlCandidates,
    sourceComplete: true,
    storageComplete: true
  });
  assert.equal(encSnap.rows[0].classification, ROW_CLASSIFICATION.IN_USE);

  // Rowless: referenced rowless is IN_USE, unreferenced is POSSIBLY_UNUSED.
  const rowlessByPath = new Map(snapshot.rowless.map((r) => [r.storagePath, r]));
  assert.equal(rowlessByPath.get('uploads/nested/deep/rowless.png').classification, ROW_CLASSIFICATION.POSSIBLY_UNUSED);
  assert.equal(rowlessByPath.get('uploads/rowless-used.png').classification, ROW_CLASSIFICATION.IN_USE);

  // Missing object + broken URL reference.
  assert.deepEqual(snapshot.missingObjects.map((m) => m.storagePath), ['uploads/gone.png']);
  assert.equal(snapshot.brokenReferences.length, 1);
  assert.equal(snapshot.brokenReferences[0].identity, 'media/uploads/no-such-file.png');

  // Metrics.
  assert.equal(snapshot.metrics.metadataCount, 5);
  assert.equal(snapshot.metrics.knownBytes, 1500);
  assert.deepEqual(snapshot.metrics.bytesByGroup, { image: 600, video: 400, audio: 500, other: 0 });
  assert.equal(snapshot.metrics.topLargest[0].storagePath, 'uploads/gone.png');
  assert.equal(snapshot.metrics.topLargest.length, 5);
  assert.equal(snapshot.metrics.possiblyUnusedCount, 3);
  assert.equal(snapshot.metrics.possiblyUnusedBytes, 1400);
  assert.equal(snapshot.metrics.rowlessCount, 2);
  assert.equal(snapshot.metrics.missingCount, 1);
  assert.equal(snapshot.metrics.protectedCount, 1);
  assert.equal(snapshot.scannedAt, '2026-09-23T00:00:00.000Z');
}

// Incomplete DB scan: unreferenced items become UNKNOWN, never unused.
{
  const built = buildReferenceIndex(
    [{ key: 'portfolio_projects', label: 'Portfolio', complete: false, error: 'permission denied' }],
    { bucket: BUCKET, knownPrefixes: PREFIXES }
  );
  assert.equal(built.complete, false);
  const snapshot = classifySnapshot({
    mediaRows: [{ id: 'm9', storage_path: 'uploads/x.png', mime_type: 'image/png', size_bytes: 5, deletion_status: 'active' }],
    storageObjects: [{ path: 'uploads/x.png', sizeBytes: 5 }],
    refIndex: built.index,
    urlCandidates: built.urlCandidates,
    sourceComplete: built.complete,
    sourceReasons: built.reasons,
    storageComplete: true
  });
  assert.equal(snapshot.status, SCAN_STATUS.INCOMPLETE);
  assert.equal(snapshot.rows[0].classification, ROW_CLASSIFICATION.UNKNOWN);
  assert.ok(snapshot.reasons.some((reason) => /permission denied/.test(reason)));
  assert.equal(snapshot.metrics.possiblyUnusedCount, 0);
}

// Incomplete Storage scan (network failure): same fail-closed outcome.
{
  const snapshot = classifySnapshot({
    mediaRows: [{ id: 'm9', storage_path: 'uploads/x.png', mime_type: 'image/png', size_bytes: 5, deletion_status: 'active' }],
    storageObjects: [],
    refIndex: new Map(),
    sourceComplete: true,
    storageComplete: false,
    storageError: 'network timeout'
  });
  assert.equal(snapshot.status, SCAN_STATUS.INCOMPLETE);
  assert.equal(snapshot.rows[0].classification, ROW_CLASSIFICATION.UNKNOWN);
  assert.ok(snapshot.reasons.some((reason) => /network timeout/.test(reason)));
}

// Pending tombstones surface separately; mime grouping covers all types.
{
  assert.equal(mediaGroupForMime('image/png'), 'image');
  assert.equal(mediaGroupForMime('video/mp4'), 'video');
  assert.equal(mediaGroupForMime('audio/mpeg'), 'audio');
  assert.equal(mediaGroupForMime('application/pdf'), 'other');
  assert.equal(mediaGroupForMime(null), 'other');
  const snapshot = classifySnapshot({
    mediaRows: [
      { id: 'p1', storage_path: 'uploads/old.png', mime_type: 'image/png', size_bytes: 1, deletion_status: 'pending', deletion_error: 'net' }
    ],
    storageObjects: [{ path: 'uploads/old.png', sizeBytes: 1 }],
    refIndex: new Map(),
    sourceComplete: true,
    storageComplete: true
  });
  assert.equal(snapshot.pendingCleanup.length, 1);
  assert.equal(snapshot.metrics.pendingCount, 1);
}

// State persistence plans only run after COMPLETE scans.
{
  const complete = { complete: true, rows: [{ storagePath: 'uploads/new.png', classification: ROW_CLASSIFICATION.POSSIBLY_UNUSED, sizeBytes: 9 }], rowless: [] };
  const planned = planStatePersistence({ snapshot: complete, statesByPath: {}, nowIso: '2026-09-23T00:00:00.000Z' });
  assert.equal(planned.skipped, false);
  assert.equal(planned.upserts.length, 1);
  assert.equal(planned.upserts[0].first_unreferenced_at, '2026-09-23T00:00:00.000Z');
  assert.ok(planned.upserts[0].object_fingerprint.includes('uploads/new.png'));

  // An existing anchor is kept (grace starts at first sighting, not file age).
  const replanned = planStatePersistence({
    snapshot: complete,
    statesByPath: { 'uploads/new.png': { first_unreferenced_at: '2026-08-01T00:00:00.000Z' } },
    nowIso: '2026-09-23T00:00:00.000Z'
  });
  assert.equal(replanned.upserts[0].first_unreferenced_at, '2026-08-01T00:00:00.000Z');

  // A reference that reappears cancels the candidate.
  const cancelled = planStatePersistence({
    snapshot: { complete: true, rows: [{ storagePath: 'uploads/new.png', classification: ROW_CLASSIFICATION.IN_USE, sizeBytes: 9 }], rowless: [] },
    statesByPath: { 'uploads/new.png': { first_unreferenced_at: '2026-08-01T00:00:00.000Z' } },
    nowIso: '2026-09-23T00:00:00.000Z'
  });
  assert.equal(cancelled.upserts[0].first_unreferenced_at, null);

  // INCOMPLETE scans persist nothing.
  assert.deepEqual(planStatePersistence({ snapshot: { complete: false }, statesByPath: {} }).upserts, []);
  assert.equal(fingerprintObject({ path: 'uploads/a b.png', sizeBytes: 3, updatedAt: 't' }), 'media/uploads/a b.png|3|t');
}

// Migration: small state table, admin-only, no delete authorization.
{
  const sql = await readFile('supabase/migrations/202609230001_media_cleanup_state.sql', 'utf8');
  assert.match(sql, /create table if not exists public\.media_cleanup_state/);
  assert.match(sql, /storage_path text primary key/);
  assert.match(sql, /first_unreferenced_at/);
  assert.match(sql, /alter table public\.media_cleanup_state enable row level security/);
  assert.match(sql, /app_metadata.*role.*admin/);
  assert.match(sql, /revoke all on public\.media_cleanup_state from anon/);
  assert.doesNotMatch(sql, /grant\s+.*\bdelete\b[^;]*on public\.media_cleanup_state to anon/i);
}

console.log('media-cleanup-scanner-core.test.mjs: ok');
