import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Focused integration matrix for the nav-motion + asset-gallery batches.
// Runs on Chromium AND WebKit (real engines, not emulation):
//   node scripts/integration-matrix.mjs --browser=chromium
//   node scripts/integration-matrix.mjs --browser=webkit
// Fixture-only: a minimal chainable Supabase stub; CMS records are seeded
// through the production bridges after authoritative hydration settles.

const browserName = (process.argv.find((a) => a.startsWith('--browser=')) || '--browser=chromium').slice(10);
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = browserName === 'webkit' ? webkit : chromium;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const rewrites = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8')).rewrites;
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const rewrite = rewrites.find(({ source }) => source === path || (source.endsWith('/:path*') && path.startsWith(source.slice(0, -7) + '/')));
    if (rewrite) path = rewrite.destination;
    if (path === '/api/public-config.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end('window.__CRABBIE_SUPABASE_CONFIG__={"url":"https://matrix-test.supabase.co","key":"sb_matrix_fixture"};');
      return;
    }
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep) || !['.html', '.js', '.css', '.svg', '.woff2'].includes(extname(file))) {
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
console.log(`Matrix server: ${origin} (${browserName})`);

const stub = `
export function createClient(){
  const chain = () => new Proxy({}, { get: (_, key) => {
    if (key === 'then') return (done) => done ? done({data: [], error: null}) : Promise.resolve({data: [], error: null});
    return (...args) => chain();
  }});
  return {
    from: () => chain(),
    rpc: async () => ({data: null, error: {message: 'unknown'}}),
    storage: { from: (bucket) => ({
      getPublicUrl: (path, options) => ({ data: { publicUrl: options && options.transform
        ? 'https://matrix-test.supabase.co/storage/v1/render/image/public/' + bucket + '/' + path + '?width=480'
        : 'https://matrix-test.supabase.co/' + path } }),
      upload: async () => ({data: null, error: {message: 'no writes in matrix'}}),
      remove: async () => ({data: null, error: {message: 'no writes in matrix'}}),
      list: async () => ({data: [], error: null})
    })},
    auth: {
      getSession: async () => ({data: {session: null}, error: null}),
      getUser: async () => ({data: {user: null}, error: null}),
      onAuthStateChange: () => ({data: {subscription: {unsubscribe(){}}}})
    }
  };
}`;

const browser = await engine.launch({});
const summary = [];
const note = (label, detail = '') => { summary.push(`${browserName} ${label}${detail ? ' — ' + detail : ''}`); console.log(`PASS [${browserName}] ${label}${detail ? ' — ' + detail : ''}`); };

const viewports = [
  [320, 568, 'phone-320'], [375, 667, 'phone-375'], [390, 844, 'phone-390'], [430, 932, 'phone-430'],
  [667, 375, 'landscape-short'], [844, 390, 'landscape-844'],
  [768, 1024, 'tablet'], [820, 1180, 'tablet-tall'],
  [1280, 800, 'desktop'], [1440, 900, 'desktop-wide']
];

for (const mobile of [false, true]) {
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }
      : { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }
  );
  await context.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/javascript', body: stub }));
  // Keep transformed thumbnails loading: WebKit fires onerror quickly and would
  // otherwise swap src to the original before the transform assertion runs.
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  await context.route('**/storage/v1/render/image/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng }));
  await context.route('https://matrix-test.supabase.co/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng }));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack || e.message));
  const mode = mobile ? 'mobile-touch' : 'desktop';

  await page.goto(origin + '/#portfolio', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.CrabbiePortfolio && window.CrabbieAssets));
  await page.waitForFunction(() => window.__CRABBIE_PORTFOLIO_HYDRATED__ === true && window.__CRABBIE_ASSETS_HYDRATED__ === true);
  // Deterministic fixtures through the production bridges (no production data).
  await page.evaluate(() => {
    window.CrabbiePortfolio.apply([
      { slug: 'mx-tall', title: 'Matrix Tall', desc: 'tall cover art', cat: 'Illustration', tags: ['TALL'], thumbnail: '', cover: 'media/mx-tall.png', blocks: [{ type: 'text', text: 'Body one' }, { type: 'text', text: 'Body two' }], credits: '', year: '2026' },
      { slug: 'mx-filler-1', title: 'Filler One', desc: '', cat: 'Chibi', tags: [], thumbnail: '', cover: '', blocks: [], credits: '', year: '' },
      { slug: 'mx-filler-2', title: 'Filler Two', desc: '', cat: 'Chibi', tags: [], thumbnail: '', cover: '', blocks: [], credits: '', year: '' },
      { slug: 'mx-filler-3', title: 'Filler Three', desc: '', cat: 'Chibi', tags: [], thumbnail: '', cover: '', blocks: [], credits: '', year: '' }
    ]);
    const gallery13 = Array.from({ length: 13 }, (_, i) => ({ id: 'g' + i, url: 'media/g' + i + '.png', alt: 'Shot ' + i, caption: i === 0 ? 'First caption' : '' }));
    window.CrabbieAssets.apply([
      { slug: 'mx-asset', title: 'Matrix Asset', cat: 'Brushes', format: 'PNG', icon: '★', description: 'many previews', version: '', date: '', credit: '', license: '', update: '', availability: 'available', downloadUrl: 'media/mx.zip', driveUrl: '', showDirectDownload: true, showDriveDownload: false, featured: false, published: true, tags: [], thumbnail: 'media/mx-cover.png', coverAlt: 'Matrix cover', gallery: gallery13 },
      { slug: 'mx-nocover', title: 'Matrix No Cover', cat: 'Brushes', format: 'PNG', icon: '❀', description: '', version: '', date: '', credit: '', license: '', update: '', availability: 'available', downloadUrl: 'media/mx2.zip', driveUrl: '', showDirectDownload: true, showDriveDownload: false, featured: false, published: true, tags: [], thumbnail: '', coverAlt: '', gallery: [{ id: 'n0', url: 'media/broken-x.png', alt: 'Broken', caption: '' }] },
      { slug: 'mx-single', title: 'Matrix Single', cat: 'Brushes', format: 'PNG', icon: '★', description: '', version: '', date: '', credit: '', license: '', update: '', availability: 'available', downloadUrl: 'media/mx3.zip', driveUrl: '', showDirectDownload: true, showDriveDownload: false, featured: false, published: true, tags: [], thumbnail: 'media/mx-single.png', coverAlt: '', gallery: [] }
    ]);
  });

  // 1. Route × viewport matrix: one active view, no overflow, no scrollX.
  for (const [width, height, label] of viewports) {
    await page.setViewportSize({ width, height });
    for (const route of ['home', 'portfolio', 'free-assets', 'commissions', 'about', 'terms', 'contact']) {
      await page.evaluate((r) => { location.hash = '#' + r; }, route);
      await page.waitForFunction((r) => document.querySelector('.view.is-active')?.dataset.view === r, route);
      await page.evaluate(() => new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(d))));
      const box = await page.evaluate(() => ({
        active: document.querySelectorAll('.view.is-active').length,
        docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth,
        bodySW: document.body.scrollWidth, bodyCW: document.body.clientWidth, x: window.scrollX || 0
      }));
      assert.equal(box.active, 1, `${label} ${route}: exactly one active view`);
      assert.ok(box.docSW <= box.docCW + 1 && box.bodySW <= box.bodyCW + 1 && box.x === 0, `${label} ${route}: width within 1px, scrollX 0`);
    }
  }
  note(`${mode} route×viewport matrix`, '7 routes × 10 viewports, one active view, ≤1px overflow');

  // 2. Detail routes: direct load, cover geometry, missing → 404.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { location.hash = '#project/mx-tall'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'project-detail');
  const cover = await page.evaluate(() => {
    const el = document.getElementById('pdCover');
    const img = el ? el.querySelector(':scope > img') : null;
    const blocks = document.getElementById('pdBlocks');
    const cr = el.getBoundingClientRect();
    const br = blocks.getBoundingClientRect();
    return {
      directImg: Boolean(img), trigger: Boolean(el.querySelector('[data-cover-viewer]')),
      aspect: cr.width / Math.max(1, cr.height), below: br.top >= cr.bottom - 1,
      clip: getComputedStyle(el).overflow
    };
  });
  assert.ok(cover.directImg && cover.trigger, `${mode}: cover art is the direct child with a trigger`);
  assert.ok(Math.abs(cover.aspect - 4 / 3) < 0.08 && cover.below, `${mode}: 4:3 frame, Section 01 below`);
  assert.ok(['hidden', 'clip'].includes(cover.clip), `${mode}: frame clips decor`);
  await page.evaluate(() => { location.hash = '#project/no-such-thing'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === '404');
  note(`${mode} detail geometry + missing→404`);

  // 3. Scroll restoration without animated traversal (Back to Portfolio + browser Back).
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => { location.hash = '#portfolio'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  await page.evaluate(() => window.scrollTo({ top: 600, left: 0, behavior: 'instant' }));
  await page.waitForFunction(() => Math.abs(window.scrollY - 600) < 2);
  await page.evaluate(() => { location.hash = '#project/mx-filler-1'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'project-detail');
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY)) < 2, `${mode}: forward detail starts at top`);
  await page.locator('[data-view="project-detail"] a.back-link[data-goto="portfolio"]').click();
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  const samples = await page.evaluate(() => new Promise((done) => {
    const out = [window.scrollY];
    const tick = (n) => (n <= 0 ? done(out) : requestAnimationFrame(() => { out.push(window.scrollY); tick(n - 1); }));
    tick(10);
  }));
  assert.ok(samples.every((y) => Math.abs(y - 600) <= 3), `${mode}: Back to Portfolio restores instantly (${samples.map(Math.round).join(',')})`);
  // Bottom footnav button restores just as well.
  await page.evaluate(() => { location.hash = '#project/mx-filler-1'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'project-detail');
  await page.locator('[data-view="project-detail"] button.mid[data-goto="portfolio"]').click();
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - 600) <= 3, `${mode}: bottom Back to Portfolio restores too`);
  // Browser Back path.
  await page.evaluate(() => window.scrollTo({ top: 600, left: 0, behavior: 'instant' }));
  await page.evaluate(() => { location.hash = '#project/mx-filler-2'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'project-detail');
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - 600) <= 3, `${mode}: browser Back restores list position`);
  note(`${mode} scroll restoration`, 'Back-to-list + browser Back, no traversal');

  // 4. Same-route refresh keeps position.
  await page.evaluate(() => { location.hash = '#asset/mx-asset'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'free-asset-detail');
  await page.evaluate(() => window.scrollTo({ top: 250, left: 0, behavior: 'instant' }));
  await page.evaluate(() => {
    const rec = window.CrabbieAssets.getPrototype('mx-asset');
    rec.description = 'many previews (refreshed)';
    // Re-apply the full set: snapshots are authoritative, a partial list
    // would read as unpublish for the missing slugs.
    const others = ['mx-nocover', 'mx-single'].map((s) => window.CrabbieAssets.getPrototype(s));
    window.CrabbieAssets.apply([rec].concat(others));
  });
  await page.waitForTimeout(300);
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - 250) <= 3, `${mode}: same-record refresh keeps scroll`);
  note(`${mode} same-route refresh`);

  // 5. Asset gallery: batches, ordering, no-cover, broken fallback.
  const thumbs = await page.locator('#adGallery .ad-thumb').count();
  assert.equal(thumbs, 12, `${mode}: first batch renders 12 thumbs`);
  await page.locator('#adGalleryMore').click();
  assert.equal(await page.locator('#adGallery .ad-thumb').count(), 13, `${mode}: More reveals the last preview`);
  assert.equal(await page.locator('#adGalleryMoreWrap').isVisible(), false, `${mode}: More hides when exhausted`);
  const firstSrc = await page.locator('#adGallery .ad-thumb img').first().getAttribute('src');
  assert.ok(firstSrc.includes('/render/image/'), `${mode}: raster thumbs transform, originals load on demand`);
  await page.evaluate(() => { location.hash = '#asset/mx-nocover'; });
  await page.waitForFunction(() => document.querySelector('#adTitle').textContent === 'Matrix No Cover');
  assert.equal(await page.locator('#adGallery .ad-thumb').count(), 1, `${mode}: no-cover still shows previews`);
  assert.equal(await page.locator('[data-view="free-asset-detail"] .ad-preview img').count(), 0, `${mode}: missing cover falls back to icon`);
  note(`${mode} gallery batches + no-cover`);

  // 6. Viewer: open/zoom/pan/prev-next/Back/focus/lock.
  await page.evaluate(() => { location.hash = '#asset/mx-asset'; });
  await page.waitForFunction(() => document.querySelector('#adTitle').textContent === 'Matrix Asset');
  const opener = page.locator('#adGallery .ad-thumb[data-ad-index="2"]');
  if (mobile) await opener.tap(); else await opener.click();
  await page.waitForFunction(() => !document.getElementById('publicLightbox').hidden);
  assert.ok((await page.locator('#publicLightboxImg').getAttribute('src')).endsWith('g1.png'), `${mode}: viewer opens the selected original`);
  assert.equal(await page.locator('#publicLightboxPosition').innerText(), '3 / 14', `${mode}: position tracks cover-first collection`);
  const lockY = await page.evaluate(() => window.scrollY);
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', `${mode}: background locks while open`);
  await page.locator('#publicLightboxZoomIn').click();
  const zoomed = await page.evaluate(() => document.getElementById('publicLightboxImg').style.transform);
  assert.ok(/scale\((1\.[2-9]|[2-9])/.test(zoomed), `${mode}: discrete zoom scales`);
  await page.locator('#publicLightboxNext').click();
  await page.waitForFunction(() => document.getElementById('publicLightboxPosition').textContent === '4 / 14');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('publicLightbox').hidden);
  assert.equal(await page.evaluate(() => document.body.style.overflow === '' || document.body.style.overflow === 'visible' || getComputedStyle(document.body).overflow === 'visible'), true, `${mode}: lock restores on close`);
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - lockY) <= 2, `${mode}: no scroll jump on close`);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-ad-index')), '2', `${mode}: focus returns to the opener`);
  // Back dismisses before route change.
  if (mobile) await opener.tap(); else await opener.click();
  await page.waitForFunction(() => !document.getElementById('publicLightbox').hidden);
  const vHash = await page.evaluate(() => location.hash);
  await page.goBack();
  await page.waitForFunction(() => document.getElementById('publicLightbox').hidden);
  assert.equal(await page.evaluate(() => location.hash), vHash, `${mode}: Back dismisses viewer without navigating`);
  note(`${mode} viewer open/zoom/step/Back/focus/lock`);

  // 7. Animations: jelly press, hover lift, reduced-motion switch.
  // Jelly is a motion-allowed press effect: opt into motion first.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => { location.hash = '#portfolio'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  const jellySeen = await page.evaluate(() => new Promise((done) => {
    let seen = false;
    const probe = setInterval(() => {
      if (document.querySelector('.is-jelly')) { seen = true; clearInterval(probe); done(true); }
    }, 20);
    setTimeout(() => { clearInterval(probe); done(seen); }, 600);
    const el = document.querySelector('#pfChips .chip');
    if (el) el.click();
  }));
  assert.equal(jellySeen, true, `${mode}: jelly press feedback fires`);
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.is-jelly').count(), 0, `${mode}: jelly releases without resticking`);
  if (!mobile) {
    await page.locator('#pfGrid .work').first().hover();
    const lift = await page.evaluate(() => {
      const el = document.querySelector('#pfGrid .work');
      return el ? getComputedStyle(el).transform : 'none';
    });
    assert.notEqual(lift, 'none', `${mode}: card hover lift applies`);
  }
  await page.evaluate(() => { location.hash = '#commissions'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'commissions');
  const accMotion = await page.evaluate(() => {
    const el = document.querySelector('.acc-btn');
    return el ? getComputedStyle(el).animationName : 'missing';
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const accReduced = await page.evaluate(() => {
    const el = document.querySelector('.acc-btn');
    return el ? getComputedStyle(el).animationName : 'missing';
  });
  assert.equal(accMotion, 'accSheen', `${mode}: decorative loop runs with motion allowed`);
  assert.equal(accReduced, 'none', `${mode}: reduced motion stills decorative loops without reload`);
  note(`${mode} jelly/hover/reduced-motion`);

  assert.deepEqual(errors, [], `${mode}: no uncaught script errors`);
  await context.close();
}

await browser.close();
server.close();
console.log(`\nMATRIX COMPLETE (${browserName}): ${summary.length} checks passed`);
