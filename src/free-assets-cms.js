import { supabase, isConfigured } from './supabase-client.js';
import { mapFreeAsset } from './free-assets-core.js';

export async function hydrateFreeAssets() {
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
  window.CrabbieAssets.apply((data || []).map((row) => mapFreeAsset(row)));
  return true;
}

hydrateFreeAssets();
