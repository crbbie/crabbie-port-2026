import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';
import { createAdminSaveSingleFlight } from './admin-save-flight-core.js';
import { createDraftRevision, shouldFinalizeSave } from './admin-save-revision-core.js';
import { reconcileSavedTarget, advanceBaselinesFromOrder } from './admin-persisted-baseline-core.js';
import { enforceFeaturedLimit } from './admin-featured-core.js';
const config = window.__CRABBIE_SUPABASE_CONFIG__ || {};
export const isConfigured = Boolean(config.url && config.key);
export const supabase = isConfigured ? createClient(config.url, config.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
window.CrabbieSupabase = { supabase, isConfigured };
window.CrabbieAdminSaveFlight = createAdminSaveSingleFlight();
window.CrabbieSaveRevision = { createDraftRevision, shouldFinalizeSave };
window.CrabbiePersistedBaseline = { reconcileSavedTarget, advanceBaselinesFromOrder };
window.CrabbieAdminFeatured = { enforceFeaturedLimit };
import('./portfolio-cms.js');
import('./people-cms.js');
import('./free-assets-cms.js');
import('./commissions-cms.js');
import('./site-content-cms.js');
import('./admin-auth.js');
/* The CRUD module may lose the first-load race with session restoration; a
   load failure is recorded so hydration reports a genuine error instead of
   waiting forever, while arrival order otherwise stays independent. */
import('./admin-crud.js').catch((err) => {
  if (typeof window !== 'undefined') window.__crabbieCrudLoadError = err;
  throw err;
});
import('./admin-data-audit.js').then(() => {
  if (typeof window !== 'undefined' && typeof window.__crabbieAuditReady === 'function') window.__crabbieAuditReady();
});
import('./admin-draft-guard.js');
import('./admin-media.js');
import('./admin-cleanup.js');
import('./commission-requests.js');
