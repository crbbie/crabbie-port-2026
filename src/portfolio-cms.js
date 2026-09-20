import { supabase, isConfigured } from './supabase-client.js';
import { mapPortfolioProject } from './portfolio-cms-core.js';
export async function hydratePortfolio() {
  try {
    if (!isConfigured || !supabase || !window.CrabbiePortfolio) return false;
    const { data, error } = await supabase.from('portfolio_projects').select('slug,title,description,tags,thumbnail_path,cover_path,featured,content,sort_order').eq('published', true).order('sort_order', { ascending: true });
    if (error) { console.error('Portfolio CMS query failed:', error.message); return false; }
    window.CrabbiePortfolio.apply((data || []).map((row) => mapPortfolioProject(row)));
    return true;
  } finally {
    /* Settled either way: a pending detail route must resolve (record, real
       404, or prototype fallback) instead of waiting forever. */
    window.__CRABBIE_PORTFOLIO_HYDRATED__ = true;
    if (window.CrabbiePortfolio && window.CrabbiePortfolio.settled) window.CrabbiePortfolio.settled();
  }
}
hydratePortfolio();
