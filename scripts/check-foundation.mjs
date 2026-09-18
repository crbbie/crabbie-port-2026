import { Script } from 'node:vm';
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
// Validate all inline JavaScript; runtime view activation is covered by test:router.
for (const [, body] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (body.trim()) new Script(body, { filename: 'crabbie-port26.html' });
}

const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8'));
const rewrites = Array.isArray(vercelConfig.rewrites) ? vercelConfig.rewrites : [];
if (!rewrites.some((r) => r.source === '/admin' && r.destination === '/crabbie-port26.html')) {
  throw new Error('Admin route rewrite missing.');
}

console.log(`Foundation check passed (${files.length} required files + admin entrypoint).`);
