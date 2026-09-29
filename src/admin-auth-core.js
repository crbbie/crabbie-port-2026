export function isAdminUser(user) {
  if (!user || typeof user !== 'object') return false;
  const appMeta = user.app_metadata;
  return Boolean(appMeta && typeof appMeta === 'object' && appMeta.role === 'admin');
}

/* Stable auth failure codes. The Admin UI maps a code to exactly one localized
   message (`window.CrabbieAdminI18n.adminAuthErrorKey`); the English `error`
   text stays an internal detail for the console/debug path only. */
export const ADMIN_LOGIN_ERROR_CODES = Object.freeze({
  emailRequired: 'email_required',
  passwordRequired: 'password_required',
  serviceUnavailable: 'service_unavailable',
  invalidCredentials: 'invalid_credentials',
  notAuthorized: 'not_authorized',
  rateLimited: 'rate_limited',
  network: 'network',
  unknown: 'unknown'
});

export function validateLoginPayload(email, password) {
  if (!email || !email.trim()) return { valid: false, code: ADMIN_LOGIN_ERROR_CODES.emailRequired, error: 'Email is required.' };
  if (!password) return { valid: false, code: ADMIN_LOGIN_ERROR_CODES.passwordRequired, error: 'Password is required.' };
  return { valid: true, code: null };
}

/**
 * Classifies a Supabase Auth sign-in failure into one stable code.
 * Known provider cases become actionable localized copy in the UI; anything
 * else falls back to the localized generic message, so raw provider text is
 * never the primary user-facing message.
 */
export function classifyAuthProviderError(error) {
  const status = Number(error && error.status);
  const text = String((error && (error.message || error.error_description)) || error || '').toLowerCase();
  if (status === 429 || /rate limit|too many requests|too many attempts/.test(text)) return ADMIN_LOGIN_ERROR_CODES.rateLimited;
  if (/invalid login credentials|invalid_grant|invalid grant|invalid credentials|email not confirmed|user not found/.test(text)) return ADMIN_LOGIN_ERROR_CODES.invalidCredentials;
  if (/failed to fetch|network|timed? ?out|offline|connection/.test(text)) return ADMIN_LOGIN_ERROR_CODES.network;
  return ADMIN_LOGIN_ERROR_CODES.unknown;
}
