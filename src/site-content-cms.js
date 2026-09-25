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

/* Latest-request ownership: startup hydration and an explicit CMS refresh can
   overlap, so only the newest request may publish or fire the ready signal. */
let generation = 0;

function markSiteContentReady(ok) {
  window.__CRABBIE_SITE_CONTENT_HYDRATED__ = true;
  document.documentElement.classList.remove('cms-content-pending');
  document.documentElement.classList.add('cms-content-ready');
  window.dispatchEvent(new CustomEvent('crabbie:site-content-ready', {
    detail: { ok: Boolean(ok) }
  }));
}

export async function hydrateSiteContent() {
  const gen = ++generation;
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

    /* A superseded response never publishes: the newer request owns the pages,
       navigation and settings snapshot even when this one resolves later. */
    if (gen !== generation) {
      return !pagesRes.error && !navRes.error && !settingsRes.error;
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
    /* Ready is a one-shot public signal (content gate + Home bloom): only the
       newest request may fire it, so a superseded response — success or failure
       — can never mark a newer pending hydration as ready. */
    if (gen === generation) markSiteContentReady(ok);
  }
}

window.__CRABBIE_SITE_CONTENT_READY_PROMISE__ = hydrateSiteContent();
