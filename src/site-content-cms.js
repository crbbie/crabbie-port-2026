import { supabase, isConfigured } from './supabase-client.js';
import { mapCmsPage, mapNavigationItem, mapSiteSettings, aboutPublicModel, cmsBrandName, cmsSeoTitle, routeTitleFor, hasSettingsKey, settingsText } from './site-content-core.js';

if (typeof window !== 'undefined') {
  window.CrabbieSiteContentModel = {
    aboutPublicModel,
    cmsBrandName,
    cmsSeoTitle,
    routeTitleFor,
    hasSettingsKey,
    settingsText
  };
}

function markSiteContentReady(ok) {
  window.__CRABBIE_SITE_CONTENT_HYDRATED__ = true;
  document.documentElement.classList.remove('cms-content-pending');
  document.documentElement.classList.add('cms-content-ready');
  /* The startup settlement owns the same first-paint gate: report the CMS
     outcome so its bounded fallback stands down. Idempotent - the first
     settlement wins and a late report never re-settles. */
  if (window.CrabbieStartup && typeof window.CrabbieStartup.settle === 'function') {
    window.CrabbieStartup.settle('cms-settled');
  }
  window.dispatchEvent(new CustomEvent('crabbie:site-content-ready', {
    detail: { ok: Boolean(ok) }
  }));
}

export async function hydrateSiteContent() {
  let ok = false;

  try {
    if (!isConfigured || !supabase) {
      console.warn('Site Content CMS: Supabase client is not configured. Falling back to prototype data.');
      return false;
    }
    if (!window.CrabbieSiteContent) {
      console.warn('Site Content CMS: public content bridge is not ready. Falling back to prototype data.');
      return false;
    }

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

    window.CrabbieSiteContent.apply(
      pagesRes.error ? null : pages,
      navRes.error ? null : nav,
      settingsRes.error ? null : settings
    );

    ok = !pagesRes.error && !navRes.error && !settingsRes.error;
    return ok;
  } catch (err) {
    console.warn('Site Content CMS hydration failed:', err && err.message ? err.message : err);
    return false;
  } finally {
    markSiteContentReady(ok);
  }
}

window.__CRABBIE_SITE_CONTENT_READY_PROMISE__ = hydrateSiteContent();
