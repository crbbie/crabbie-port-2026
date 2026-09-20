import assert from 'node:assert/strict';
import { createAdminSaveSingleFlight } from './admin-save-flight-core.js';

let release;
let transactions = 0;
const gate = new Promise((resolve) => { release = resolve; });
const flight = createAdminSaveSingleFlight();
const first = flight.run(async () => {
  transactions += 1;
  await gate;
  return 'saved';
});

assert.equal(flight.active, true, 'the guard stays active through the pending request');
assert.equal(flight.canReplaceDraft(), false, 'the active draft cannot be replaced while its save is pending');
assert.deepEqual(await flight.run(async () => { transactions += 1; }), { started: false }, 'a concurrent request is ignored');
assert.equal(transactions, 1, 'only one save transaction starts');
release();
assert.deepEqual(await first, { started: true, value: 'saved' });
assert.equal(flight.active, false, 'the guard releases after success');
assert.equal(flight.canReplaceDraft(), true, 'draft replacement is allowed only after the save settles');

const failingFlight = createAdminSaveSingleFlight();
await assert.rejects(failingFlight.run(async () => { throw new Error('write failed'); }), /write failed/);
assert.equal(failingFlight.active, false, 'the guard releases after failure so the dirty draft can retry');

console.log('Admin save single-flight core tests passed.');