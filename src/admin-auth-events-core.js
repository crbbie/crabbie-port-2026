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

/**
 * First-load readiness for the initial CMS hydration. The auth and CRUD
 * modules load independently, so either may win the race; only a genuine
 * dependency failure may surface the error state, never mere load order.
 * Returns 'ready' (start hydration), 'pending' (wait for the CRUD module and
 * retry exactly when it arrives), or 'failed' (surface the error state).
 * No DOM, no Supabase access.
 */
export function describeAdminCrudReadiness({ crudReady, crudFailed } = {}) {
  if (crudReady) return 'ready';
  if (crudFailed) return 'failed';
  return 'pending';
}
