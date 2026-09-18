import assert from 'node:assert/strict';
import { isAdminUser, validateLoginPayload } from './admin-auth-core.js';

// 1. Legitimate admin with app_metadata
assert.equal(isAdminUser({ id: '1', email: 'admin@example.com', app_metadata: { role: 'admin' } }), true);

// 2. Normal user
assert.equal(isAdminUser({ id: '2', email: 'user@example.com', app_metadata: { role: 'user' } }), false);

// 3. User attempting to spoof admin via user_metadata (MUST BE REJECTED!)
assert.equal(isAdminUser({ id: '3', email: 'hacker@example.com', app_metadata: { role: 'user' }, user_metadata: { role: 'admin' } }), false);

// 4. Missing metadata or null
assert.equal(isAdminUser(null), false);
assert.equal(isAdminUser({}), false);

// 5. Payload validation
assert.equal(validateLoginPayload('', 'secret').valid, false);
assert.equal(validateLoginPayload('admin@test.com', '').valid, false);
assert.equal(validateLoginPayload('admin@test.com', 'secret').valid, true);

console.log('Admin auth core tests passed.');
