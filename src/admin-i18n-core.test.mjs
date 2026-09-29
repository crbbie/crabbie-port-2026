import assert from 'node:assert/strict';
import './admin-i18n-core.js';

const I18N = globalThis.CrabbieAdminI18n;
assert.ok(I18N, 'the Admin i18n core is exposed');

// --- formatAdminMessage: one parameterized formatter, no English prefixes ----
assert.equal(I18N.formatAdminMessage('Save failed: {message}', { message: 'boom' }), 'Save failed: boom');
assert.equal(I18N.formatAdminMessage('{a} + {b}', { a: 1, b: 2 }), '1 + 2', 'numbers format without surprises');
assert.equal(I18N.formatAdminMessage('{label} picker', { label: 'Cover' }), 'Cover picker');
assert.equal(I18N.formatAdminMessage('no tokens here', { a: 1 }), 'no tokens here', 'params without placeholders change nothing');
assert.equal(I18N.formatAdminMessage('{missing}', {}), '', 'a token without a value never leaks braces into the UI');
assert.equal(I18N.formatAdminMessage('{a}-{b}', { a: 'x' }), 'x-', 'each token resolves independently');
assert.equal(I18N.formatAdminMessage('{a}', { a: null }), '', 'a null value formats to empty, never "null"');
assert.equal(I18N.formatAdminMessage(null, { a: 1 }), '', 'a missing template formats to empty');
assert.equal(I18N.formatAdminMessage(null), '', 'a missing template without params formats to empty');
assert.equal(I18N.formatAdminMessage('{a}'), '');
assert.equal(formatTwice(), formatTwice(), 'formatting is deterministic');
function formatTwice() { return I18N.formatAdminMessage('{a}/{b}', { a: 'x', b: 'y' }); }

// Values pass through verbatim: the caller owns the escaping of its own context.
assert.equal(I18N.formatAdminMessage('{a}', { a: '<b>&"</b>' }), '<b>&"</b>');

// --- auth error routing -----------------------------------------------------
assert.equal(I18N.adminAuthErrorKey('email_required'), 'auth.error.emailRequired');
assert.equal(I18N.adminAuthErrorKey('password_required'), 'auth.error.passwordRequired');
assert.equal(I18N.adminAuthErrorKey('service_unavailable'), 'auth.error.serviceUnavailable');
assert.equal(I18N.adminAuthErrorKey('invalid_credentials'), 'auth.error.invalidCredentials');
assert.equal(I18N.adminAuthErrorKey('not_authorized'), 'auth.error.notAuthorized');
assert.equal(I18N.adminAuthErrorKey('rate_limited'), 'auth.error.rateLimited');
assert.equal(I18N.adminAuthErrorKey('network'), 'auth.error.network');
assert.equal(I18N.adminAuthErrorKey('unknown'), 'auth.error.generic');
for (const unknown of [undefined, null, '', 'provider_said_something_raw']) {
  assert.equal(I18N.adminAuthErrorKey(unknown), 'auth.error.generic', `${unknown} falls back to the localized generic message`);
}

// --- load error routing -----------------------------------------------------
assert.equal(I18N.adminLoadErrorKey('service_unavailable'), 'load.serviceUnavailable');
assert.equal(I18N.adminLoadErrorKey('hydration_failed'), 'load.failed');
assert.equal(I18N.adminLoadErrorKey('anything-else'), 'load.failed');
assert.equal(I18N.adminLoadErrorKey(undefined), 'load.failed');

// --- save error feedback ----------------------------------------------------
assert.deepEqual(I18N.adminSaveErrorFeedback({ code: 'stale_save' }), { key: 'save.error.conflict', params: null });
assert.deepEqual(I18N.adminSaveErrorFeedback({ code: 'duplicate_slug', message: 'raw provider text' }), { key: 'save.error.duplicateSlug', params: null }, 'a known code never leaks the raw detail as primary copy');
assert.deepEqual(I18N.adminSaveErrorFeedback({ code: 'missing_record' }), { key: 'save.error.missingRecord', params: null });
assert.deepEqual(I18N.adminSaveErrorFeedback({ code: 'missing_field' }), { key: 'save.error.missingField', params: null });
assert.deepEqual(I18N.adminSaveErrorFeedback({ code: 'permission_denied' }), { key: 'save.error.permissionDenied', params: null });
assert.deepEqual(I18N.adminSaveErrorFeedback({ code: 'admin_not_ready' }), { key: 'save.error.notReady', params: null });
assert.deepEqual(I18N.adminSaveErrorFeedback({ code: 'no_editable_module' }), { key: 'save.error.noModule', params: null });
assert.deepEqual(I18N.adminSaveErrorFeedback({ code: 'nothing_to_save' }), { key: 'save.error.nothingToSave', params: null });
assert.deepEqual(I18N.adminSaveErrorFeedback({ code: 'admin_service_unavailable' }), { key: 'save.error.serviceUnavailable', params: null });

// An unclassified failure stays parameterized instead of becoming a broken sentence.
assert.deepEqual(I18N.adminSaveErrorFeedback({ message: 'fetch failed' }), { key: 'save.error.generic', params: { message: 'fetch failed' } });
assert.deepEqual(I18N.adminSaveErrorFeedback({ code: 'mystery', message: 'x' }), { key: 'save.error.generic', params: { message: 'x' } });
assert.deepEqual(I18N.adminSaveErrorFeedback(new Error('boom')), { key: 'save.error.generic', params: { message: 'boom' } });
assert.deepEqual(I18N.adminSaveErrorFeedback(null), { key: 'error.unknown', params: null });
assert.deepEqual(I18N.adminSaveErrorFeedback(undefined), { key: 'error.unknown', params: null });
assert.deepEqual(I18N.adminSaveErrorFeedback({ code: 'mystery', message: '' }), { key: 'error.unknown', params: null }, 'no detail at all reports the localized unknown text');

// Every routed key is a real dictionary key name, never copy.
for (const map of ['AUTH_ERROR_KEYS', 'LOAD_ERROR_KEYS', 'SAVE_ERROR_KEYS']) {
  for (const [code, key] of Object.entries(I18N[map])) {
    assert.equal(typeof key, 'string');
    assert.match(key, /^[a-z]+(\.[A-Za-z]+)+$/, `${map}.${code} routes to an i18n key, not a sentence`);
  }
}

console.log('Admin i18n core tests passed.');
