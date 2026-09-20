/**
 * admin-auth-events-core.js
 * Pure policy for what each Supabase auth event may do to the Admin CMS.
 * Only an initial authenticated entry hydrates; background session events must
 * never reload CMS tables or replace an unsaved draft. No DOM, no Supabase access.
 */

export function decideAdminAuthEvent({ event, hasAdminUser, hasHydrated, hydrationInFlight, dirty }) {
  if (event === 'SIGNED_OUT' || !hasAdminUser) {
    return { clearAdmin: true, hydrate: false, updateUserOnly: false };
  }
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
    const hydrate = !hasHydrated && !hydrationInFlight && !dirty;
    return { clearAdmin: false, hydrate, updateUserOnly: !hydrate };
  }
  // TOKEN_REFRESHED, USER_UPDATED, and any other background event: session
  // state only. Never reload CMS tables, never replace ADMIN_DRAFT.
  return { clearAdmin: false, hydrate: false, updateUserOnly: true };
}
