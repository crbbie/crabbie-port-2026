import assert from 'node:assert/strict';
import { ADMIN_LOAD_STATES, canMutateAdmin, shouldBlockAdminExit, shouldSetBeforeUnload } from './admin-draft-guard-core.js';

// Test 7: only a complete live snapshot may allow a database mutation.
assert.deepEqual(ADMIN_LOAD_STATES, ['idle', 'loading', 'ready', 'error']);
assert.equal(canMutateAdmin('ready'), true);
for (const state of ['idle', 'loading', 'error', undefined, null, '', 'READY', 'hydrated']) {
  assert.equal(canMutateAdmin(state), false, `${state} must not allow a mutation`);
}

// Test 6: dirty admin work must not be lost when leaving /admin.
assert.equal(shouldBlockAdminExit({ dirty: true, fromAdmin: true, toAdmin: false }), true);
assert.equal(shouldBlockAdminExit({ dirty: true, fromAdmin: true, toAdmin: true }), false);
assert.equal(shouldBlockAdminExit({ dirty: false, fromAdmin: true, toAdmin: false }), false);
assert.equal(shouldBlockAdminExit({ dirty: true, fromAdmin: false, toAdmin: false }), false);
assert.equal(shouldBlockAdminExit({}), false);

// Unload protection is driven by unsaved admin work.
assert.equal(shouldSetBeforeUnload({ dirty: true, inAdmin: true }), true);
assert.equal(shouldSetBeforeUnload({ dirty: true, inAdmin: false }), true);
assert.equal(shouldSetBeforeUnload({ dirty: false, inAdmin: true }), false);
assert.equal(shouldSetBeforeUnload({}), false);

console.log('Admin draft guard core tests passed.');
