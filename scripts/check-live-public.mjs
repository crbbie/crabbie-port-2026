import assert from 'node:assert/strict';
import { resolve } from 'node:path';

process.loadEnvFile(resolve('.env.local'));
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
assert.ok(url && key, 'Local publishable Supabase configuration is required.');

async function read(table, select, filters = '') {
  const endpoint = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}${filters}`;
  const response = await fetch(endpoint, {headers: {apikey: key}});
  const body = await response.json();
  if (!response.ok) throw new Error(`${table} public read failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

const [portfolio, assets, services, forms, pages, navigation, settings] = await Promise.all([
  read('portfolio_projects', 'slug,title,thumbnail_path,cover_path,content', '&published=eq.true'),
  read('free_assets', 'slug,title,thumbnail_path,file_path,availability,metadata', '&published=eq.true'),
  read('commission_services', 'slug,title,thumbnail_path,details', '&published=eq.true'),
  read('commission_forms', 'slug,title', '&published=eq.true'),
  read('cms_pages', 'slug,title,content,data', '&published=eq.true'),
  read('cms_navigation', 'title,url,sort_order', '&published=eq.true'),
  read('site_settings', 'key,value')
]);
const colorFiesta = portfolio.find(row => row.slug === 'color-fiesta');
assert.ok(colorFiesta, 'Published color-fiesta project must be publicly readable.');
console.log(JSON.stringify({
  portfolio: portfolio.length,
  freeAssets: assets.length,
  commissionServices: services.length,
  commissionForms: forms.length,
  pages: pages.length,
  navigation: navigation.length,
  settings: settings.length,
  colorFiesta: {title: colorFiesta.title, hasThumbnail: !!colorFiesta.thumbnail_path, hasCover: !!colorFiesta.cover_path, blocks: Array.isArray(colorFiesta.content?.blocks) ? colorFiesta.content.blocks.length : 0}
}));
