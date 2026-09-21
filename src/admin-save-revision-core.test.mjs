import assert from 'node:assert/strict';
import { createDraftRevision, shouldFinalizeSave } from './admin-save-revision-core.js';

// 1. edit -> save -> no further edits -> clean.
const tracker = createDraftRevision();
tracker.bump(); // user edits record A
const start = tracker.current;
assert.equal(shouldFinalizeSave(start, tracker.current), true, 'an untouched draft finalizes as clean');

// 2. edit -> save -> edit again before the response -> remains dirty.
tracker.bump(); // version N+1 lands while the version N write is in flight
assert.equal(shouldFinalizeSave(start, tracker.current), false, 'a mid-save edit must never be marked as saved');

// 3. A failed save never finalizes through this gate (callers keep dirty state
// on error); the gate itself stays a pure revision comparison.
assert.equal(shouldFinalizeSave(start, start), true);
assert.equal(shouldFinalizeSave(start, start + 1), false);

// 4. Rapid duplicate actions share one revision line: the second save attempt
// is refused by the single-flight guard while the first owns the transaction,
// and any edit between them invalidates finalization.
const rapid = createDraftRevision();
rapid.bump();
const firstStart = rapid.current;
assert.equal(shouldFinalizeSave(firstStart, rapid.current), true, 'no edit between duplicate attempts keeps the first save finalizable');
rapid.bump();
assert.equal(shouldFinalizeSave(firstStart, rapid.current), false, 'an edit between attempts keeps the draft dirty');

// 5. Route/record switching while a save is active respects unsaved-work
// guards: switching marks structural dirt, which is itself a revision bump.
const routed = createDraftRevision();
routed.bump();
const routeStart = routed.current;
routed.bump(); // structural dirty from the pending navigation
assert.equal(shouldFinalizeSave(routeStart, routed.current), false, 'a pending navigation blocks silent finalization');

// 6. New record first save: insert success with no mid-save edit finalizes.
const fresh = createDraftRevision();
fresh.bump(); // new client record created + fields filled
assert.equal(shouldFinalizeSave(fresh.current, fresh.current), true, 'a clean first save finalizes and may advance baselines');

// 7. Existing record update: same rule, target-kind agnostic.
const existing = createDraftRevision();
existing.bump();
const updateStart = existing.current;
assert.equal(shouldFinalizeSave(updateStart, existing.current), true, 'a clean update finalizes');
existing.bump();
assert.equal(shouldFinalizeSave(updateStart, existing.current), false, 'a mid-save touch on an update stays dirty');

// Revisions are monotonic: resets never rewind an in-flight comparison.
const mono = createDraftRevision();
mono.bump(); mono.bump();
assert.ok(mono.current > 0, 'revisions only move forward');

console.log('Admin save revision core tests passed.');
