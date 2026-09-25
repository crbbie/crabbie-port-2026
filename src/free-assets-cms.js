import { supabase, isConfigured } from './supabase-client.js';
import { mapFreeAsset } from './free-assets-core.js';

/* Latest-request ownership: startup hydration and an explicit CMS refresh can
   overlap, so only the newest request may apply or settle public state. */
let generation = 0;

export async function hydrateFreeAssets() {
  const gen = ++generation;
  try {
    if (!isConfigured || !supabase) {
      console.warn('Free Assets CMS: Supabase client is not configured. Falling back to prototype data.');
      return false;
    }
    if (!window.CrabbieAssets) return false;
    const { data, error } = await supabase
      .from('free_assets')
      .select('slug,title,description,thumbnail_path,file_type,file_path,availability,featured,published,sort_order,metadata')
      .eq('published', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.warn('Free Assets Supabase query failed:', error.message, '— Falling back to prototype data.');
      return false;
    }
    /* A superseded success never publishes: the newer request owns the
       snapshot even when this one resolves later. */
    if (gen !== generation) return true;
    window.CrabbieAssets.apply((data || []).map((row) => mapFreeAsset(row)));
    return true;
  } finally {
    /* Settled either way: a pending detail route must resolve (record, real
       404, or prototype fallback) instead of waiting forever. Only the newest
       request settles, so a superseded response can never mark a newer pending
       hydration as ready. */
    if (gen === generation) {
      window.__CRABBIE_ASSETS_HYDRATED__ = true;
      if (window.CrabbieAssets && window.CrabbieAssets.settled) window.CrabbieAssets.settled();
    }
  }
}

hydrateFreeAssets();
