import { readFile } from 'node:fs/promises';
const files = ['.env.example','vercel.json','api/public-config.js','src/supabase-client.js','supabase/migrations/202609180001_foundation.sql'];
for (const file of files) await readFile(file, 'utf8');
const client = await readFile('src/supabase-client.js', 'utf8');
if (!client.includes('@supabase/supabase-js') || !client.includes('createClient')) throw new Error('Supabase client missing.');

const html = await readFile('crabbie-port26.html', 'utf8');
if (!html.includes('id="adminLoginShell"') || !html.includes('id="adminLoginForm"')) {
  throw new Error('Admin login UI missing.');
}
if (!html.includes('class="admin-entry-link"') || !html.includes('href="#admin"')) {
  throw new Error('Public admin entry link missing.');
}
if (!html.includes('id="admin-route-bootstrap"')) {
  throw new Error('Admin route bootstrap missing.');
}
if (/([^$]|^)\$\([^\n;]+\)\.forEach/gm.test(html)) {
  throw new Error('Single-element $() selector is incorrectly used with .forEach().');
}

const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8'));
const rewrites = Array.isArray(vercelConfig.rewrites) ? vercelConfig.rewrites : [];
if (!rewrites.some((r) => r.source === '/admin' && r.destination === '/crabbie-port26.html')) {
  throw new Error('Admin route rewrite missing.');
}

console.log(`Foundation check passed (${files.length} required files + admin entrypoint).`);
