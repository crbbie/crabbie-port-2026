import { supabase, isConfigured } from './supabase-client.js';
import { mapCommissionService, mapCommissionForm } from './commissions-core.js';

/* Latest-request ownership: startup hydration and an explicit CMS refresh can
   overlap, so only the newest request may publish. */
let generation = 0;

export async function hydrateCommissions() {
  const gen = ++generation;

  if (!isConfigured || !supabase) {
    console.warn('Commissions CMS: Supabase client is not configured. Falling back to prototype data.');
    return false;
  }
  if (!window.CrabbieCommissions) return false;

  const [servicesResult, formsResult] = await Promise.all([
    supabase
      .from('commission_services')
      .select('slug,title,description,price,currency,availability,form_slug,thumbnail_path,featured,published,sort_order,details')
      .eq('published', true)
      .order('sort_order', { ascending: true }),
    supabase
      .from('commission_forms')
      .select('slug,title,description,fields,published')
      .eq('published', true)
  ]);

  /* A superseded response never overwrites the newer one. It still reports its
     own fetch result, so an overlapping refresh is never reported as a failure
     that the newest request did not have. */
  if (gen !== generation) return !servicesResult.error && !formsResult.error;

  if (servicesResult.error) {
    console.warn('Commission services Supabase query failed:', servicesResult.error.message, '— Falling back to prototype data.');
  }
  if (formsResult.error) {
    console.warn('Commission forms Supabase query failed:', formsResult.error.message);
  }

  const services = (servicesResult.data || []).map((row) =>
    mapCommissionService(row)
  );
  const forms = (formsResult.data || []).map((row) => mapCommissionForm(row, {}));

  window.CrabbieCommissions.apply(
    servicesResult.error ? null : services,
    formsResult.error ? null : forms
  );
  return !servicesResult.error && !formsResult.error;
}

hydrateCommissions();
