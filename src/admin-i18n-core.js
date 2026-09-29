/**
 * admin-i18n-core.js
 *
 * Pure presentation helpers for the Admin CMS i18n layer.
 *
 * The Admin dictionary itself stays where it already lives: `ADMIN_I18N` in
 * `crabbie-port26.html`, read through `tAdmin(key)` and rendered through
 * `[data-t]` / `applyAdminLangToDom()`. This module owns only the deterministic
 * parts the browser layer would otherwise re-implement as string concatenation:
 *
 *  1. `formatAdminMessage(template, params)` — the single parameterized-template
 *     formatter behind `tAdminFmt(key, params)`. Messages are authored with
 *     `{token}` placeholders, so no code builds copy like `'Save failed: ' + err`.
 *  2. Stable code → i18n key routing for auth, load and save feedback. Core
 *     modules return a stable code; the UI owns the localized sentence. A raw
 *     provider/internal message is never the primary user-facing copy and stays
 *     in the console/debug path.
 *
 * No second dictionary, no DOM, no network, no Supabase access.
 * Browser: `window.CrabbieAdminI18n` (also `globalThis`).
 * Node: side-effect import (`import './admin-i18n-core.js'`) then read
 * `globalThis.CrabbieAdminI18n`; CommonJS gets `module.exports`.
 */
(function (root) {
  'use strict';

  /* Code → key maps. Values are keys, never copy: the dictionary is the only
     place a user-facing sentence exists, per locale. Always-default entries
     guarantee a localized fallback for anything unknown. */
  var AUTH_ERROR_KEYS = Object.freeze({
    email_required: 'auth.error.emailRequired',
    password_required: 'auth.error.passwordRequired',
    service_unavailable: 'auth.error.serviceUnavailable',
    invalid_credentials: 'auth.error.invalidCredentials',
    not_authorized: 'auth.error.notAuthorized',
    rate_limited: 'auth.error.rateLimited',
    network: 'auth.error.network',
    unknown: 'auth.error.generic'
  });

  var LOAD_ERROR_KEYS = Object.freeze({
    service_unavailable: 'load.serviceUnavailable',
    hydration_failed: 'load.failed'
  });

  /* Save feedback: known domain codes get a complete localized sentence (no raw
     English detail). Only an unclassified failure keeps the parameterized
     generic form, where the caller-supplied detail is the optional suffix. */
  var SAVE_ERROR_KEYS = Object.freeze({
    stale_save: 'save.error.conflict',
    duplicate_slug: 'save.error.duplicateSlug',
    missing_record: 'save.error.missingRecord',
    missing_field: 'save.error.missingField',
    permission_denied: 'save.error.permissionDenied',
    admin_not_ready: 'save.error.notReady',
    no_editable_module: 'save.error.noModule',
    nothing_to_save: 'save.error.nothingToSave',
    admin_service_unavailable: 'save.error.serviceUnavailable'
  });

  var AUTH_FALLBACK_KEY = 'auth.error.generic';
  var LOAD_FALLBACK_KEY = 'load.failed';
  var SAVE_FALLBACK_KEY = 'save.error.generic';
  var UNKNOWN_DETAIL_KEY = 'error.unknown';

  function asCode(code) {
    return code == null ? '' : String(code);
  }

  function asText(value) {
    return value == null ? '' : String(value);
  }

  /**
   * Replaces every `{token}` with its parameter value.
   * - Deterministic: no randomness, no locale-aware formatting.
   * - A token without a matching parameter resolves to an empty string, so a
   *   half-translated message never leaks `{token}` into the UI.
   * - Values are inserted verbatim. Callers rendering into HTML must pass an
   *   already-escaped value (same contract as any other admin template).
   */
  function formatAdminMessage(template, params) {
    var text = asText(template);
    if (!params || typeof params !== 'object') {
      return text.replace(/\{[A-Za-z0-9_]+\}/g, '');
    }
    return text.replace(/\{([A-Za-z0-9_]+)\}/g, function (match, name) {
      if (!Object.prototype.hasOwnProperty.call(params, name)) return '';
      return asText(params[name]);
    });
  }

  function adminAuthErrorKey(code) {
    var key = AUTH_ERROR_KEYS[asCode(code)];
    return key || AUTH_FALLBACK_KEY;
  }

  function adminLoadErrorKey(code) {
    var key = LOAD_ERROR_KEYS[asCode(code)];
    return key || LOAD_FALLBACK_KEY;
  }

  /**
   * One save failure → `{ key, params }`.
   * Known codes return a complete localized sentence (`params: null`); an
   * unclassified failure returns the parameterized generic with the raw detail
   * as an optional suffix; no detail at all returns the localized unknown text.
   */
  function adminSaveErrorFeedback(err) {
    var code = asCode(err && err.code);
    var key = SAVE_ERROR_KEYS[code];
    if (key) return { key: key, params: null };
    var detail = asText(err && err.message);
    if (!detail) return { key: UNKNOWN_DETAIL_KEY, params: null };
    return { key: SAVE_FALLBACK_KEY, params: { message: detail } };
  }

  var api = {
    AUTH_ERROR_KEYS: AUTH_ERROR_KEYS,
    LOAD_ERROR_KEYS: LOAD_ERROR_KEYS,
    SAVE_ERROR_KEYS: SAVE_ERROR_KEYS,
    formatAdminMessage: formatAdminMessage,
    adminAuthErrorKey: adminAuthErrorKey,
    adminLoadErrorKey: adminLoadErrorKey,
    adminSaveErrorFeedback: adminSaveErrorFeedback
  };

  root.CrabbieAdminI18n = api;

  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
