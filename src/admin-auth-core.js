export function isAdminUser(user) {
  if (!user || typeof user !== 'object') return false;
  const appMeta = user.app_metadata;
  return Boolean(appMeta && typeof appMeta === 'object' && appMeta.role === 'admin');
}

export function validateLoginPayload(email, password) {
  if (!email || !email.trim()) return { valid: false, error: 'Email is required.' };
  if (!password) return { valid: false, error: 'Password is required.' };
  return { valid: true };
}
