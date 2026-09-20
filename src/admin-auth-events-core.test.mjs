import assert from 'node:assert/strict';
import { decideAdminAuthEvent } from './admin-auth-events-core.js';

const base = { hasAdminUser: true, hasHydrated: false, hydrationInFlight: false, dirty: false };

// Test 5: the first authenticated entry hydrates exactly once.
assert.deepEqual(decideAdminAuthEvent({ ...base, event: 'INITIAL_SESSION' }), { clearAdmin: false, hydrate: true, updateUserOnly: false });
assert.deepEqual(decideAdminAuthEvent({ ...base, event: 'SIGNED_IN' }), { clearAdmin: false, hydrate: true, updateUserOnly: false });

// A second entry for the same session (manual login plus auth callback) must
// never duplicate the full CMS hydration pass.
assert.equal(decideAdminAuthEvent({ ...base, event: 'SIGNED_IN', hasHydrated: true }).hydrate, false);
assert.equal(decideAdminAuthEvent({ ...base, event: 'INITIAL_SESSION', hasHydrated: true }).hydrate, false);
assert.equal(decideAdminAuthEvent({ ...base, event: 'SIGNED_IN', hydrationInFlight: true }).hydrate, false);
assert.equal(decideAdminAuthEvent({ ...base, event: 'INITIAL_SESSION', hydrationInFlight: true }).hydrate, false);

// Test 4: a token refresh while dirty updates session state only.
const dirty = { ...base, hasHydrated: true, dirty: true };
assert.deepEqual(decideAdminAuthEvent({ ...dirty, event: 'TOKEN_REFRESHED' }), { clearAdmin: false, hydrate: false, updateUserOnly: true });
assert.deepEqual(decideAdminAuthEvent({ ...dirty, event: 'USER_UPDATED' }), { clearAdmin: false, hydrate: false, updateUserOnly: true });
assert.equal(decideAdminAuthEvent({ ...base, event: 'TOKEN_REFRESHED' }).hydrate, false);
assert.equal(decideAdminAuthEvent({ ...base, event: 'USER_UPDATED' }).hydrate, false);
assert.equal(decideAdminAuthEvent({ ...base, event: 'PASSWORD_RECOVERY' }).hydrate, false);

// Automatic hydration must not replace an unsaved draft.
assert.equal(decideAdminAuthEvent({ ...base, event: 'SIGNED_IN', dirty: true }).hydrate, false);
assert.equal(decideAdminAuthEvent({ ...base, event: 'INITIAL_SESSION', dirty: true }).hydrate, false);

// Sign out clears authenticated state without hydrating.
assert.deepEqual(decideAdminAuthEvent({ event: 'SIGNED_OUT', hasAdminUser: false }), { clearAdmin: true, hydrate: false, updateUserOnly: false });
assert.deepEqual(decideAdminAuthEvent({ event: 'SIGNED_OUT', hasAdminUser: true }), { clearAdmin: true, hydrate: false, updateUserOnly: false });
assert.equal(decideAdminAuthEvent({ event: 'INITIAL_SESSION', hasAdminUser: false }).hydrate, false);
assert.equal(decideAdminAuthEvent({ event: 'TOKEN_REFRESHED', hasAdminUser: false }).clearAdmin, true);

console.log('Admin auth event policy tests passed.');
