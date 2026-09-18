import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const diagnose = process.argv.includes('--diagnose');
const livePublic = process.argv.includes('--live-public');
if (livePublic) process.loadEnvFile(resolve(root, '.env.local'));
const publicConfig = livePublic
  ? {url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY}
  : {url: 'https://router-test.supabase.co', key: 'sb_publishable_test_fixture'};
if (livePublic && (!publicConfig.url || !publicConfig.key)) throw new Error('Public Supabase configuration is missing.');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const rewrites = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8')).rewrites;
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const rewrite = rewrites.find(({ source }) => source === path || (source.endsWith('/:path*') && path.startsWith(source.slice(0, -7) + '/')));
    if (rewrite) path = rewrite.destination;
    if (path === '/api/public-config.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end(`window.__CRABBIE_SUPABASE_CONFIG__=${JSON.stringify(publicConfig)};`);
      return;
    }
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep) || !['.html', '.js', '.css', '.svg'].includes(extname(file))) {
      response.writeHead(404).end();
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
console.log(`Local SPA server: ${origin}`);

// Only the external SDK boundary is replaced. The actual document, router,
// Auth service, role check, login listener, CMS bridges and rendering execute.
// These test identities/passwords are synthetic; no credentials or DB writes.
const sdkFixture = `
export function createClient(){
  let session = null;
  const subscribers = [];
  const query = new Proxy({}, { get: (_, key) => key === 'then'
    ? (done) => Promise.resolve({data: [], error: null}).then(done)
    : () => query });
  return {
    from: () => query,
    storage: {from: () => ({getPublicUrl: path => ({data: {publicUrl: 'https://router-test.supabase.co/' + path}})})},
    auth: {
      getSession: async () => ({data: {session}, error: null}),
      onAuthStateChange: callback => {subscribers.push(callback); return {data: {subscription: {unsubscribe(){}}}}},
      signInWithPassword: async ({email}) => {
        window.__routerLoginCalls = (window.__routerLoginCalls || 0) + 1;
        if(email === 'invalid@example.test') return {data: {user: null, session: null}, error: {message: 'Invalid login credentials'}};
        const user = {id: 'router-test-user', app_metadata: {role: email === 'admin@example.test' ? 'admin' : 'user'}, user_metadata: {role: 'admin'}};
        session = {user};
        return {data: {user, session}, error: null};
      },
      signOut: async () => {session = null; subscribers.forEach(fn => fn('SIGNED_OUT', null)); return {error: null}}
    }
  };
}`;

let browser;
try {
  browser = await chromium.launch(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {});
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  if (!livePublic) await context.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/javascript', body: sdkFixture }));
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  const cases = [
    ['/', 'home'], ['/#home', 'home'], ['/#portfolio', 'portfolio'],
    ['/#free-assets', 'free-assets'], ['/#commissions', 'commissions'],
    ['/#about', 'about'], ['/#terms', 'terms'], ['/#contact', 'contact'],
    ['/admin', 'admin'], ['/#admin', 'admin'], ['/admin#admin', 'admin'],
    ['/admin/requests', 'admin']
  ];
  for (const [path, expected] of cases) {
    await page.goto('about:blank');
    errors.length = 0;
    await page.goto(origin + path, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    if (diagnose) {
      await page.waitForTimeout(400);
      console.log(JSON.stringify({ path, active: await page.locator('.view.is-active').evaluateAll(views => views.map(v => v.dataset.view)), firstException: errors[0] || null }));
      if (path === '/') await page.screenshot({path: resolve(tmpdir(), 'crabbie-router-before.png')});
      continue;
    }
    await page.waitForFunction(view => {
      const active = document.querySelectorAll('.view.is-active');
      return active.length === 1 && active[0].dataset.view === view;
    }, expected, { timeout: 5000 });
    assert.deepEqual(errors, [], `Uncaught script error on ${path}`);
    assert.equal(await page.locator('.view.is-active').isVisible(), true, path);
    if (expected === 'admin') {
      assert.equal(await page.locator('#adminLoginShell').isVisible(), true, path);
      assert.equal(await page.locator('#adminRealShell').isVisible(), false, path);
      assert.equal(await page.locator('#adminLoginBtn').isEnabled(), true, path);
    }
    console.log(`PASS ${path} -> ${expected} (one visible active view)`);
    if (path === '/') await page.screenshot({path: resolve(tmpdir(), 'crabbie-router-home.png')});
    if (path === '/admin') await page.screenshot({path: resolve(tmpdir(), 'crabbie-router-admin.png')});
  }
  if (!diagnose && !livePublic) {
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    for (const email of ['invalid@example.test', 'member@example.test', 'admin@example.test']) {
      await page.locator('#adminEmail').fill(email);
      await page.locator('#adminPassword').fill('synthetic-router-test-password');
      await page.locator('#adminLoginBtn').click();
      await page.waitForFunction(() => !document.getElementById('adminLoginBtn').disabled);
      if (email === 'admin@example.test') {
        await page.locator('#adminRealShell').waitFor({state: 'visible'});
        assert.equal(await page.locator('#adminLoginShell').isVisible(), false);
      } else {
        assert.equal(await page.locator('#adminLoginShell').isVisible(), true);
        assert.equal(await page.locator('#adminRealShell').isVisible(), false);
        assert.equal(await page.locator('#adminLoginError').isVisible(), true);
      }
    }
    assert.equal(await page.evaluate(() => window.__routerLoginCalls), 3, 'Each submit must have exactly one listener');
    for (const module of ['requests', 'media']) {
      await page.evaluate(module => { location.hash = '#admin/' + module; }, module);
      await page.locator('#adminNav [data-admin-module="' + module + '"][aria-current="page"]').waitFor({state: 'visible'});
      assert.equal(await page.locator('#adminRealShell').isVisible(), true);
      assert.equal(await page.locator('.view.is-active').count(), 1);
    }
    await page.locator('#adminSignOut').click();
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'home');
    assert.deepEqual(errors, [], 'Auth flow must not crash');
    // Leaving an /admin document via hash must not be overridden by a second router.
    await page.evaluate(() => { location.hash = '#portfolio'; });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
    assert.equal(await page.locator('.view.is-active').count(), 1);
    console.log('PASS failed login, metadata-only role denied, authorized login, single submit listener, logout and navigation (SDK fixture)');
  }
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
