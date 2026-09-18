import { supabase, isConfigured } from './supabase-client.js';
import { mapPortfolioProject } from './portfolio-cms-core.js';
async function hydratePortfolio() {
  if (!isConfigured || !supabase || !window.CrabbiePortfolio) return;
  const { data, error } = await supabase.from('portfolio_projects').select('slug,title,description,tags,thumbnail_path,cover_path,content,sort_order').eq('published', true).order('sort_order', { ascending: true });
  if (error) { console.error('Portfolio CMS query failed:', error.message); return; }
  window.CrabbiePortfolio.apply((data || []).map((row) => mapPortfolioProject(row, window.CrabbiePortfolio.getPrototype(row.slug))));
}
hydratePortfolio();
