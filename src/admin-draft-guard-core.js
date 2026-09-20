/**
 * admin-draft-guard-core.js
 * Pure safety rules for the Admin CMS: mutation readiness, dirty-draft
 * navigation guards, and unload warnings. No DOM, no Supabase access.
 */

export const ADMIN_LOAD_STATES = ['idle', 'loading', 'ready', 'error'];

// Only one complete successful live hydration may enable database mutations.
export function canMutateAdmin(loadState) {
  return loadState === 'ready';
}

// Leaving the authenticated admin area with unsaved work must be confirmed.
// Moving between admin modules keeps the same draft, so it stays allowed.
export function shouldBlockAdminExit({ dirty, fromAdmin, toAdmin }) {
  if (!dirty || !fromAdmin) return false;
  return !toAdmin;
}

// Any unsaved admin work must survive a reload or a closed tab.
export function shouldSetBeforeUnload({ dirty }) {
  return Boolean(dirty);
}
