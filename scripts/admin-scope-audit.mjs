/* Admin scope audit.
 *
 * Answers one question for every rule in the admin visual foundation block:
 * can it match DOM outside the admin boundary? Some admin class names are also
 * used by public components (the public lightbox Retry/Close buttons carry
 * `.adm-btn-sm`), so an unscoped admin rule silently restyles the public site.
 *
 *   node scripts/admin-scope-audit.mjs
 *
 * Loads the real SPA on a public route (no admin mode, no session) and reports
 * every selector whose matches fall outside `.view[data-view="admin"]`,
 * `#adminRealShell`, `#adminLoginShell` and `.adm-modal`. Expected output after
 * the Batch 1.1 scope fix: `LEAKS : 0`.
 *
 * The permanent guards are `npm run check:foundation` (static: every selector in
 * the block must be admin-scoped) and `npm run test:router` (rendered: public
 * lightbox controls keep their own styling). This script is the diagnostic tool
 * for finding and fixing a leak.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const rewrites = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8')).rewrites;
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const rewrite = rewrites.find(({ source }) => source === path || (source.endsWith('/:path*') && path.startsWith(source.slice(0, -7) + '/')));
    if (rewrite) path = rewrite.destination;
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

const html = await readFile(resolve(root, 'crabbie-port26.html'), 'utf8');
const start = html.indexOf('<style id="admin-foundation-styles">');
const block = html.slice(start, html.indexOf('</style>', start));
const selectors = [];
for (const [, prelude] of block.matchAll(/([^{}]+)\{/g)) {
  const trimmed = prelude.trim().replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');
  if (!trimmed || trimmed.startsWith('@') || trimmed.includes('/*')) continue;
  for (const one of trimmed.split(',')) {
    const selector = one.trim();
    if (selector) selectors.push(selector);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(origin + '/', { waitUntil: 'load' });
await page.waitForTimeout(400);
const report = await page.evaluate((list) => {
  const adminRoot = '.view[data-view="admin"], #adminRealShell, #adminLoginShell, .adm-modal';
  const describePath = (el) => {
    const parts = [];
    let node = el;
    while (node && node !== document.body && parts.length < 4) {
      parts.unshift(node.id ? '#' + node.id : (node.className && typeof node.className === 'string' ? '.' + node.className.trim().split(/\s+/).join('.') : node.tagName.toLowerCase()));
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  return list.map((selector) => {
    let matches = [];
    try { matches = Array.from(document.querySelectorAll(selector)); } catch (err) { return { selector, invalid: String(err.message) }; }
    const leaks = matches.filter((el) => !el.closest(adminRoot));
    return {
      selector,
      count: matches.length,
      leaks: leaks.length,
      leakPaths: Array.from(new Set(leaks.map(describePath))).slice(0, 3),
      adminCount: matches.length - leaks.length
    };
  });
}, selectors);

console.log(`selectors audited: ${selectors.length}`);
const leaks = report.filter((entry) => entry.leaks > 0);
console.log(`\n=== LEAKS (match public/concurrent DOM) : ${leaks.length} ===`);
for (const entry of leaks) console.log(`${String(entry.leaks).padStart(3)} leak / ${String(entry.count).padStart(3)} total  ${entry.selector}  -> ${entry.leakPaths.join(' | ')}`);
const adminOnly = report.filter((entry) => entry.leaks === 0 && entry.count > 0);
console.log(`\n=== admin-only matches: ${adminOnly.length} ===`);
const idle = report.filter((entry) => entry.count === 0);
console.log(`=== no match on public route (idle/admin-absent): ${idle.length} ===`);
for (const entry of idle) console.log(`  ${entry.selector}`);
await browser.close();
server.close();
