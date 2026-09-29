import assert from 'node:assert/strict';
import { isAdminUser, validateLoginPayload, classifyAuthProviderError, ADMIN_LOGIN_ERROR_CODES } from './admin-auth-core.js';

// 1. Legitimate admin with app_metadata
assert.equal(isAdminUser({ id: '1', email: 'admin@example.com', app_metadata: { role: 'admin' } }), true);

// 2. Normal user
assert.equal(isAdminUser({ id: '2', email: 'user@example.com', app_metadata: { role: 'user' } }), false);

// 3. User attempting to spoof admin via user_metadata (MUST BE REJECTED!)
assert.equal(isAdminUser({ id: '3', email: 'hacker@example.com', app_metadata: { role: 'user' }, user_metadata: { role: 'admin' } }), false);

// 4. Missing metadata or null
assert.equal(isAdminUser(null), false);
assert.equal(isAdminUser({}), false);

// 5. Payload validation returns stable codes the Admin UI localizes.
assert.equal(validateLoginPayload('', 'secret').valid, false);
assert.equal(validateLoginPayload('', 'secret').code, ADMIN_LOGIN_ERROR_CODES.emailRequired);
assert.equal(validateLoginPayload('   ', 'secret').code, ADMIN_LOGIN_ERROR_CODES.emailRequired, 'a blank email is a missing email');
assert.equal(validateLoginPayload('admin@test.com', '').valid, false);
assert.equal(validateLoginPayload('admin@test.com', '').code, ADMIN_LOGIN_ERROR_CODES.passwordRequired);
assert.equal(validateLoginPayload('admin@test.com', 'secret').valid, true);
assert.equal(validateLoginPayload('admin@test.com', 'secret').code, null, 'a valid payload carries no error code');

// 6. Provider failures become one stable code instead of raw provider text.
assert.equal(classifyAuthProviderError({ message: 'Invalid login credentials' }), ADMIN_LOGIN_ERROR_CODES.invalidCredentials);
assert.equal(classifyAuthProviderError({ message: 'invalid_grant' }), ADMIN_LOGIN_ERROR_CODES.invalidCredentials);
assert.equal(classifyAuthProviderError({ status: 429, message: 'Too many requests' }), ADMIN_LOGIN_ERROR_CODES.rateLimited);
assert.equal(classifyAuthProviderError({ message: 'Failed to fetch' }), ADMIN_LOGIN_ERROR_CODES.network);
assert.equal(classifyAuthProviderError({ message: 'something unexpected happened' }), ADMIN_LOGIN_ERROR_CODES.unknown);
assert.equal(classifyAuthProviderError(null), ADMIN_LOGIN_ERROR_CODES.unknown);
assert.equal(classifyAuthProviderError(undefined), ADMIN_LOGIN_ERROR_CODES.unknown);

console.log('Admin auth core tests passed.');
