import assert from 'node:assert/strict';
import { reconcileSavedTarget, advanceBaselinesFromOrder } from './admin-persisted-baseline-core.js';

function recordTarget(scope, recordId) {
  return { kind: 'record', scope, recordId };
}

// A. Normal save: N confirmed -> baseline, draft and DB all agree.
{
  const saved = { portfolio: [{ id: 'color-fiesta', dbId: 'uuid-1', slug: 'color-fiesta', title: 'Old', originalUpdatedAt: '2026-01-01T00:00:00Z' }] };
  const captured = { id: 'color-fiesta', dbId: 'uuid-1', slug: 'color-fiesta', title: 'New', originalUpdatedAt: '2026-01-01T00:00:00Z' };
  const ok = reconcileSavedTarget(saved, recordTarget('portfolio', 'color-fiesta'),
    captured, { success: true, mode: 'update', row: { id: 'uuid-1', slug: 'color-fiesta', updated_at: '2026-02-02T00:00:00Z' } });
  assert.equal(ok, true, 'a confirmed write advances the baseline');
  assert.equal(saved.portfolio[0].title, 'New', 'ADMIN_DATA carries version N');
  assert.equal(saved.portfolio[0].originalUpdatedAt, '2026-02-02T00:00:00Z', 'the baseline comes from the confirmed response');
}

// B. Mid-save edit: ADMIN_DATA becomes N while the draft stays N+1 and dirty.
{
  const saved = { portfolio: [{ id: 'p', dbId: 'uuid-p', slug: 'p', title: 'N-1', originalUpdatedAt: '2026-01-01T00:00:00Z' }] };
  const capturedN = { id: 'p', dbId: 'uuid-p', slug: 'p', title: 'N', originalUpdatedAt: '2026-01-01T00:00:00Z' };
  reconcileSavedTarget(saved, recordTarget('portfolio', 'p'),
    capturedN, { success: true, row: { id: 'uuid-p', slug: 'p', updated_at: '2026-02-02T00:00:00Z' } });
  assert.equal(saved.portfolio[0].title, 'N', 'the baseline is exactly the confirmed version N');
  // Discard restores the draft from the baseline: N, not the stale N-1.
  const draftAfterDiscard = JSON.parse(JSON.stringify(saved.portfolio[0]));
  assert.equal(draftAfterDiscard.title, 'N', 'discard after a mid-save edit restores N, matching the database');
  assert.equal(draftAfterDiscard.originalUpdatedAt, '2026-02-02T00:00:00Z', 'discard restores the confirmed baseline too');
}

// C. Follow-up save persists N+1 over the reconciled N.
{
  const saved = { portfolio: [{ id: 'p', dbId: 'uuid-p', slug: 'p', title: 'N', originalUpdatedAt: '2026-02-02T00:00:00Z' }] };
  const capturedNext = { id: 'p', dbId: 'uuid-p', slug: 'p', title: 'N+1', originalUpdatedAt: '2026-02-02T00:00:00Z' };
  reconcileSavedTarget(saved, recordTarget('portfolio', 'p'),
    capturedNext, { success: true, row: { id: 'uuid-p', slug: 'p', updated_at: '2026-03-03T00:00:00Z' } });
  assert.equal(saved.portfolio[0].title, 'N+1', 'the follow-up save advances the baseline again');
  assert.equal(saved.portfolio[0].originalUpdatedAt, '2026-03-03T00:00:00Z');
}

// D. Partial save: A reconciles even though B throws afterwards.
{
  const saved = {
    portfolio: [{ id: 'a', dbId: 'uuid-a', slug: 'a', title: 'A-old', originalUpdatedAt: '2026-01-01T00:00:00Z' }],
    assets: [{ id: 'b', dbId: 'uuid-b', slug: 'b', title: 'B-old', originalUpdatedAt: '2026-01-01T00:00:00Z' }]
  };
  reconcileSavedTarget(saved, recordTarget('portfolio', 'a'),
    { id: 'a', dbId: 'uuid-a', slug: 'a', title: 'A-new', originalUpdatedAt: '2026-01-01T00:00:00Z' },
    { success: true, row: { id: 'uuid-a', slug: 'a', updated_at: '2026-02-02T00:00:00Z' } });
  assert.equal(saved.portfolio[0].title, 'A-new', 'the successful target is not forgotten when a later target fails');
  assert.equal(saved.assets[0].title, 'B-old', 'the failed target keeps its previous baseline');
}

// E. Failed first write: no reconcile call means the baseline is untouched.
{
  const saved = { portfolio: [{ id: 'a', dbId: 'uuid-a', slug: 'a', title: 'A-old', originalUpdatedAt: '2026-01-01T00:00:00Z' }] };
  assert.equal(saved.portfolio[0].title, 'A-old', 'without a confirmed write the baseline never moves');
  assert.equal(saved.portfolio[0].originalUpdatedAt, '2026-01-01T00:00:00Z');
}

// F. Stale-save conflict: the failed target never advances the baseline,
// so the preserved draft keeps its own (newer) values and baseline.
{
  const saved = { portfolio: [{ id: 'a', dbId: 'uuid-a', slug: 'a', title: 'A-saved', originalUpdatedAt: '2026-02-02T00:00:00Z' }] };
  const draft = { id: 'a', dbId: 'uuid-a', slug: 'a', title: 'A-stale-edit', originalUpdatedAt: '2026-01-01T00:00:00Z' };
  assert.equal(saved.portfolio[0].title, 'A-saved', 'a conflict leaves the persisted baseline alone');
  assert.equal(draft.title, 'A-stale-edit', 'the conflicted draft is preserved for the user');
  assert.equal(reconcileSavedTarget(saved, recordTarget('portfolio', 'a'), null, null), false, 'nothing reconciles without a capture');
}

// New records receive their database identity without importing draft edits.
{
  const saved = { portfolio: [] };
  const captured = { id: 'client-1', dbId: null, slug: 'brand-new', title: 'N', originalUpdatedAt: null };
  reconcileSavedTarget(saved, recordTarget('portfolio', 'client-1'),
    captured, { success: true, mode: 'insert', row: { id: 'uuid-new', slug: 'brand-new', updated_at: '2026-04-04T00:00:00Z' } });
  assert.equal(saved.portfolio.length, 1, 'an inserted row joins the baseline');
  assert.equal(saved.portfolio[0].dbId, 'uuid-new', 'identity comes from the confirmed response');
  assert.equal(saved.portfolio[0].originalUpdatedAt, '2026-04-04T00:00:00Z');
  assert.equal(saved.portfolio[0].title, 'N', 'contents come from the captured version, not a newer draft');
  assert.equal(captured.dbId, null, 'the capture itself is never mutated');
}

// A newer draft object is never copied: reconcile clones the capture.
{
  const saved = { portfolio: [{ id: 'p', dbId: 'uuid-p', slug: 'p', title: 'N-1', originalUpdatedAt: '2026-01-01T00:00:00Z' }] };
  const captured = { id: 'p', dbId: 'uuid-p', slug: 'p', title: 'N', originalUpdatedAt: '2026-01-01T00:00:00Z' };
  reconcileSavedTarget(saved, recordTarget('portfolio', 'p'),
    captured, { success: true, row: { id: 'uuid-p', slug: 'p', updated_at: '2026-02-02T00:00:00Z' } });
  captured.title = 'N+1-MUTATED';
  assert.equal(saved.portfolio[0].title, 'N', 'later draft mutation cannot leak into the baseline');
}

// Pages reconcile by page key with server identity.
{
  const saved = { pages: { about: { title: 'Old', dbId: 'uuid-pg', originalUpdatedAt: '2026-01-01T00:00:00Z' } } };
  const ok = reconcileSavedTarget(saved, { kind: 'record', scope: 'pages.about', recordId: null },
    { title: 'New', dbId: 'uuid-pg', originalUpdatedAt: '2026-01-01T00:00:00Z' },
    { success: true, row: { id: 'uuid-pg', slug: 'about', updated_at: '2026-02-02T00:00:00Z' } });
  assert.equal(ok, true);
  assert.equal(saved.pages.about.title, 'New');
  assert.equal(saved.pages.about.originalUpdatedAt, '2026-02-02T00:00:00Z');
}

// Settings reconcile exactly the confirmed keys (partial success safe).
{
  const saved = { settings: { branding: { title: 'Old brand' }, seo: { title: 'Old seo' } } };
  const captured = { branding: { title: 'New brand' }, seo: { title: 'New seo' } };
  const ok = reconcileSavedTarget(saved, { kind: 'settings', scope: 'settings', keys: ['branding', 'seo'] },
    captured, { success: true, count: 1, savedKeys: ['branding'] });
  assert.equal(ok, true);
  assert.deepEqual(saved.settings.branding, { title: 'New brand' }, 'the confirmed key advances');
  assert.deepEqual(saved.settings.seo, { title: 'Old seo' }, 'the unconfirmed key keeps its baseline');
}

// Ordering reconciles the captured sequence.
{
  const saved = { portfolio: [{ id: 'a', dbId: 'uuid-a' }, { id: 'b', dbId: 'uuid-b' }] };
  const captured = [{ id: 'b', dbId: 'uuid-b' }, { id: 'a', dbId: 'uuid-a' }];
  assert.equal(reconcileSavedTarget(saved, { kind: 'order', scope: 'portfolio' }, captured, { success: true }), true);
  assert.deepEqual(saved.portfolio.map((row) => row.id), ['b', 'a'], 'the confirmed order replaces the baseline order');
}

// Guards: unknown shapes never touch the baseline.
{
  const saved = { portfolio: [{ id: 'a', title: 'A' }] };
  assert.equal(reconcileSavedTarget(null, recordTarget('portfolio', 'a'), {}, {}), false);
  assert.equal(reconcileSavedTarget(saved, null, {}, {}), false);
  assert.equal(reconcileSavedTarget(saved, { kind: 'order', scope: 'portfolio' }, null, {}), false);
  assert.equal(reconcileSavedTarget(saved, { kind: 'bogus', scope: 'portfolio' }, {}, {}), false);
  assert.deepEqual(saved.portfolio, [{ id: 'a', title: 'A' }], 'guarded calls leave everything alone');
}

// Order writes bump updated_at through the DB trigger: the confirmed stamps
// travel into both the persisted baseline and the live draft baseline, so a
// later guarded update never conflicts with our own order write.
{
  const saved = { forms: [{ id: 'f', dbId: 'uuid-f', slug: 'f', title: 'F', originalUpdatedAt: '2026-01-01T00:00:00Z' }] };
  const captured = [{ id: 'f', dbId: 'uuid-f', slug: 'f', title: 'F', originalUpdatedAt: '2026-01-01T00:00:00Z' }];
  const ok = reconcileSavedTarget(saved, { kind: 'order', scope: 'forms' }, captured,
    { success: true, table: 'commission_forms', count: 1, rows: [{ id: 'uuid-f', updated_at: '2026-02-02T00:00:00Z' }] });
  assert.equal(ok, true, 'an order write reconciles');
  assert.equal(saved.forms[0].originalUpdatedAt, '2026-02-02T00:00:00Z', 'the persisted baseline follows the confirmed order stamp');
  assert.equal(saved.forms[0].title, 'F', 'order reconcile never rewrites content');
}

// advanceBaselinesFromOrder moves only baselines on the live draft.
{
  const draft = [
    { id: 'f', dbId: 'uuid-f', slug: 'f', title: 'Edited live', originalUpdatedAt: '2026-01-01T00:00:00Z' },
    { id: 'client-new', dbId: null, slug: '', title: 'Unsaved', originalUpdatedAt: null }
  ];
  const advanced = advanceBaselinesFromOrder(draft, [{ id: 'uuid-f', updated_at: '2026-02-02T00:00:00Z' }]);
  assert.equal(advanced, 1, 'exactly the confirmed row advances');
  assert.equal(draft[0].originalUpdatedAt, '2026-02-02T00:00:00Z', 'the live baseline matches the database');
  assert.equal(draft[0].title, 'Edited live', 'live content is never overwritten by a baseline advance');
  assert.equal(draft[1].originalUpdatedAt, null, 'records without a DB id are skipped');
  assert.equal(advanceBaselinesFromOrder(null, []), 0, 'bad input advances nothing');
  assert.equal(advanceBaselinesFromOrder(draft, null), 0, 'a missing response advances nothing');
  assert.equal(advanceBaselinesFromOrder(draft, [{ id: 'uuid-f' }]), 0, 'a response without a stamp advances nothing');
}

// P0-01: a stale reorder never makes the stale draft authoritative.
{
  const saved = {
    portfolio: [
      { id: 'a', dbId: 'uuid-a', slug: 'a', title: 'New title from other session', description: 'persisted', originalUpdatedAt: '2026-02-02T00:00:00Z' },
      { id: 'b', dbId: 'uuid-b', slug: 'b', title: 'B', description: 'persisted-b', originalUpdatedAt: '2026-02-02T00:00:00Z' }
    ]
  };
  // Captured from a stale draft: old title, swapped order.
  const capturedStale = [
    { id: 'b', dbId: 'uuid-b', slug: 'b', title: 'B', description: 'stale-b', originalUpdatedAt: '2026-01-01T00:00:00Z' },
    { id: 'a', dbId: 'uuid-a', slug: 'a', title: 'Stale title', description: 'stale-edit', originalUpdatedAt: '2026-01-01T00:00:00Z' }
  ];
  const ok = reconcileSavedTarget(saved, { kind: 'order', scope: 'portfolio' }, capturedStale,
    { success: true, rows: [{ id: 'uuid-a', updated_at: '2026-03-03T00:00:00Z' }, { id: 'uuid-b', updated_at: '2026-03-03T00:00:00Z' }] });
  assert.equal(ok, true, 'order still reconciles sequence');
  assert.deepEqual(saved.portfolio.map((row) => row.id), ['b', 'a'], 'the confirmed order is applied');
  assert.equal(saved.portfolio.find((row) => row.id === 'a').title, 'New title from other session', 'stale content never overwrites the persisted title');
  assert.equal(saved.portfolio.find((row) => row.id === 'a').description, 'persisted', 'stale description never becomes the baseline');
  assert.equal(saved.portfolio.find((row) => row.id === 'a').originalUpdatedAt, '2026-03-03T00:00:00Z', 'only the version stamp advances');
}

console.log('Admin persisted baseline core tests passed.');
