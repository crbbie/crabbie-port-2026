import { supabase, isConfigured } from './supabase-client.js';
import { mapCmsPage, mapNavigationItem, mapSiteSettings } from './site-content-core.js';

export async function hydrateSiteContent() {
  if (!isConfigured || !supabase) {
    console.warn('Site Content CMS: Supabase client is not configured. Falling back to prototype data.');
    return;
  }
  if (!window.CrabbieSiteContent) return;

  const [pagesRes, navRes, settingsRes] = await Promise.all([
    supabase.from('cms_pages').select('slug,title,content,published,data').eq('published', true),
    supabase.from('cms_navigation').select('id,title,url,published,sort_order').eq('published', true).order('sort_order', { ascending: true }),
    supabase.from('site_settings').select('key,value')
  ]);

  if (pagesRes.error) {
    console.warn('CMS Pages Supabase query failed:', pagesRes.error.message, '— Falling back to prototype.');
  }
  if (navRes.error) {
    console.warn('CMS Navigation Supabase query failed:', navRes.error.message);
  }
  if (settingsRes.error) {
    console.warn('Site Settings Supabase query failed:', settingsRes.error.message);
  }

  const pages = (pagesRes.data || []).map((row) => mapCmsPage(row, {}));
  const nav = (navRes.data || []).map((row) => mapNavigationItem(row, {}));
  const settings = mapSiteSettings(settingsRes.data || [], {});

  window.CrabbieSiteContent.apply(pages, nav, settings);
}

hydrateSiteContent();
