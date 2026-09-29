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
// The portfolio planner is a synchronous classic script: it must parse as
// one and load before the inline composition wiring (no race, no flash).
const planner = await readFile('src/portfolio-grid-core.js', 'utf8');
new Script(planner, { filename: 'src/portfolio-grid-core.js' });
// Appearance canonical rules are a synchronous classic script too: admin
// controls, preview, and public hydration share one defaults/validation
// source instead of independent copies.
const appearanceCore = await readFile('src/appearance-core.js', 'utf8');
new Script(appearanceCore, { filename: 'src/appearance-core.js' });
if (!html.includes('<script src="/src/appearance-core.js">')) {
  throw new Error('Appearance core script tag missing.');
}
if (html.indexOf('<script src="/src/appearance-core.js">') > html.indexOf('<script src="/src/portfolio-grid-core.js">')) {
  throw new Error('Appearance core must load before the portfolio planner.');
}
if (!html.includes('<script src="/src/portfolio-grid-core.js">')) {
  throw new Error('Portfolio planner script tag missing.');
}
if (html.indexOf('<script src="/src/portfolio-grid-core.js">') > html.indexOf('function syncPortfolioComposition()')) {
  throw new Error('Portfolio planner must load before the composition wiring.');
}

const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8'));
const rewrites = Array.isArray(vercelConfig.rewrites) ? vercelConfig.rewrites : [];
if (!rewrites.some((r) => r.source === '/admin' && r.destination === '/crabbie-port26.html')) {
  throw new Error('Admin route rewrite missing.');
}

/* Admin visual foundation scope guard.
   The Batch 1 / Batch 1.1 admin visual layer must never match DOM outside the
   admin boundary: some admin class names are also used by public components (the
   public lightbox Retry/Close buttons use `.adm-btn-sm`), so an unscoped admin
   rule silently restyles the public site. Every rule in the block must therefore
   be scoped to `body.admin-mode` (the existing admin/public boundary, the inverse
   of the `body:not(.admin-mode)` rules that own public-only styling), and the
   block must not declare `:root` tokens. */
const adminStyles = html.match(/<style id="admin-foundation-styles">([\s\S]*?)<\/style>/);
if (!adminStyles) throw new Error('Admin foundation style block missing.');
const unscoped = [];
for (const [, prelude] of adminStyles[1].matchAll(/([^{}]+)\{/g)) {
  const trimmed = prelude.trim();
  if (trimmed.startsWith('@')) continue;
  const afterComment = trimmed.includes('*/') ? trimmed.slice(trimmed.lastIndexOf('*/') + 2).trim() : trimmed;
  if (!afterComment || afterComment.startsWith('@')) continue;
  for (const selector of afterComment.split(',')) {
    if (selector.trim() && !selector.trim().startsWith('body.admin-mode')) unscoped.push(selector.trim());
  }
}
if (unscoped.length) {
  throw new Error('Admin foundation rules must be scoped to body.admin-mode; unscoped: ' + unscoped.slice(0, 3).join(' / '));
}
if (/:root\s*\{/.test(adminStyles[1])) {
  throw new Error('Admin foundation block must not declare :root tokens (they leak to public DOM).');
}
if (/body\.admin-mode\s+@/.test(adminStyles[1])) {
  throw new Error('An at-rule prelude was mis-scoped inside the admin foundation block.');
}

console.log(`Foundation check passed (${files.length} required files + admin entrypoint + admin scope guard).`);
