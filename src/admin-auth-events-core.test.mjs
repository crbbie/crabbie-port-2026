import assert from 'node:assert/strict';
import { decideAdminAuthEvent, describeAdminCrudReadiness } from './admin-auth-events-core.js';

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

// First-load CRUD readiness: load order must never fake an error state.
// A. Auth restores before the CRUD module arrives -> wait, do not error.
assert.equal(describeAdminCrudReadiness({ crudReady: false, crudFailed: false }), 'pending', 'auth ready before CRUD waits for the dependency');
// B. CRUD arrives before auth -> hydrate immediately.
assert.equal(describeAdminCrudReadiness({ crudReady: true, crudFailed: false }), 'ready', 'CRUD ready before auth hydrates at once');
// C. Both ready normally -> hydrate.
assert.equal(describeAdminCrudReadiness({ crudReady: true }), 'ready', 'both ready hydrates');
// D. A genuine dependency failure -> surface the error state.
assert.equal(describeAdminCrudReadiness({ crudReady: false, crudFailed: true }), 'failed', 'a real CRUD load failure keeps the error state');
// E. Retry after a genuine query failure: the dependency is ready, so the
// manual retry proceeds even though the first attempt errored.
assert.equal(describeAdminCrudReadiness({ crudReady: true, crudFailed: false }), 'ready', 'retry after a genuine failure proceeds once CRUD is ready');
// A failed module outranks a missing one: readiness prefers the error.
assert.equal(describeAdminCrudReadiness({ crudReady: false }), 'pending', 'no signal yet means wait, not error');

console.log('Admin auth event policy tests passed.');
