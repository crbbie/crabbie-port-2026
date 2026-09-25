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
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
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
    const ext = extname(file).toLowerCase();
    if (!file.startsWith(root + sep) || !Object.prototype.hasOwnProperty.call(mime, ext)) {
      response.writeHead(404).end();
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[ext] });
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
const boundaryTriplets = [
  [379, 667, 'boundary-379'], [380, 667, 'boundary-380'], [381, 667, 'boundary-381'],
  [599, 800, 'boundary-599'], [600, 800, 'boundary-600'], [601, 800, 'boundary-601'],
  [719, 800, 'boundary-719'], [720, 800, 'boundary-720'], [721, 800, 'boundary-721'],
  [859, 800, 'boundary-859'], [860, 800, 'boundary-860'], [861, 800, 'boundary-861'],
  [899, 900, 'boundary-899'], [900, 900, 'boundary-900'], [901, 900, 'boundary-901'],
  [1179, 900, 'boundary-1179'], [1180, 900, 'boundary-1180'], [1181, 900, 'boundary-1181']
];
const allViewports = [...viewports, ...boundaryTriplets];

for (const mobile of [false, true]) {
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' }
      : { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }
  );
  await context.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/javascript', body: stub }));
  // Keep transformed thumbnails loading: WebKit fires onerror quickly and would
  // otherwise swap src to the original before the transform assertion runs.
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  await context.route('**/storage/v1/render/image/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng }));
  await context.route('https://matrix-test.supabase.co/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng }));
  // Deterministic artwork with real intrinsic dimensions for ratio/strip checks.
  await context.route('https://matrix-art.test/**', (route) => {
    const dims = route.request().url().match(/art-(\d+)x(\d+)\.svg/);
    const w = dims ? Number(dims[1]) : 800;
    const h = dims ? Number(dims[2]) : 600;
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#ffb8d4"/></svg>` });
  });
  await context.route('https://matrix-art.test/broken.png', (route) => route.abort());
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
      { slug: 'mx-single', title: 'Matrix Single', cat: 'Brushes', format: 'PNG', icon: '★', description: '', version: '', date: '', credit: '', license: '', update: '', availability: 'available', downloadUrl: 'media/mx3.zip', driveUrl: '', showDirectDownload: true, showDriveDownload: false, featured: false, published: true, tags: [], thumbnail: 'media/mx-single.png', coverAlt: '', gallery: [] },
      { slug: 'mx-stream', title: 'Matrix Stream', cat: 'stream overlays', category: 'stream overlays', format: 'PNG', icon: '★', description: '', version: '', date: '', credit: '', license: '', update: '', availability: 'available', downloadUrl: 'media/mx4.zip', driveUrl: '', showDirectDownload: true, showDriveDownload: false, featured: false, published: true, tags: [], thumbnail: '', coverAlt: '', gallery: [] }
    ]);
  });

  // 1. Route × viewport matrix plus exact CSS breakpoint boundaries:
  // 379/380/381, 599/600/601, 719/720/721, 859/860/861,
  // 899/900/901 and 1179/1180/1181.
  for (const [width, height, label] of allViewports) {
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
  note(`${mode} route×viewport matrix + boundary sweep`, '7 routes × 28 viewports, one active view, ≤1px overflow');

  // 1b. Sticky navigation and mobile menu stay usable at the two phone
  // references and landscape. This runs in both Chromium and WebKit.
  const NAV_SEED = [
    { title: 'Home', url: '#home' }, { title: 'Portfolio', url: '#portfolio' },
    { title: 'Free Assets', url: '#free-assets' }, { title: 'Commissions', url: '#commissions' },
    { title: 'About', url: '#about' }, { title: 'Terms', url: '#terms' },
    { title: 'Contact', url: '#contact' }
  ];
  await page.evaluate((nav) => {
    if (window.CrabbieSiteContent) window.CrabbieSiteContent.apply(undefined, nav, window.__cmsPublicSettings || {});
  }, NAV_SEED);
  for (const [width, height] of [[390, 844], [430, 932], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { location.hash = '#home'; });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'home');
    await page.evaluate(() => window.scrollTo({ top: 500, left: 0, behavior: 'instant' }));
    await page.waitForTimeout(80);
    const sticky = await page.evaluate(() => {
      const nav = document.querySelector('.nav-shell');
      if (!nav) return null;
      return { position: getComputedStyle(nav).position, top: nav.getBoundingClientRect().top };
    });
    assert.ok(sticky && sticky.position === 'sticky', `${mode}: nav stays sticky at ${width}x${height}`);
    assert.ok(Math.abs(sticky.top) <= 2, `${mode}: sticky nav pins to viewport top at ${width}x${height}`);
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    const burger = page.locator('#navBurger');
    if (await burger.isVisible()) {
      await page.evaluate(() => document.getElementById('navBurger')?.click());
      await page.waitForFunction(() => document.getElementById('mobileMenu')?.classList.contains('open'));
      const links = await page.locator('#mobileMenu a').count();
      assert.ok(links >= 6, `${mode}: mobile menu exposes navigation links at ${width}x${height}`);
      await page.evaluate(() => document.getElementById('navBurger')?.click());
      await page.waitForFunction(() => !document.getElementById('mobileMenu')?.classList.contains('open'));
    }
  }
  note(`${mode} sticky nav + mobile menu boundary coverage`);

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
  // Browser Back path for detail-to-list.
  await page.evaluate(() => window.scrollTo({ top: 600, left: 0, behavior: 'instant' }));
  await page.evaluate(() => { location.hash = '#project/mx-filler-2'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'project-detail');
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - 600) <= 3, `${mode}: browser Back restores list position`);

  // Browser Back and Forward between ordinary views across target viewports: 390x844, 844x390, 1440x900.
  for (const [vw, vh, vlabel] of [[390, 844, 'phone-390'], [844, 390, 'landscape-844'], [1440, 900, 'desktop-wide']]) {
    await page.setViewportSize({ width: vw, height: vh });
    await page.evaluate(() => { location.hash = '#home'; });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'home');
    await page.evaluate(() => window.scrollTo({ top: 420, left: 0, behavior: 'instant' }));
    await page.waitForFunction(() => Math.abs(window.scrollY - 420) < 2);

    const navigateTo = async (dest) => {
      await page.evaluate((d) => window.navigate(d), dest);
    };

    // Fresh navigation to portfolio: must start at top (0), then scroll to 500.
    await navigateTo('portfolio');
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
    assert.ok(Math.abs(await page.evaluate(() => window.scrollY)) < 2, `${mode} ${vlabel}: fresh navigation to portfolio starts at top`);
    await page.evaluate(() => window.scrollTo({ top: 500, left: 0, behavior: 'instant' }));
    await page.waitForFunction(() => Math.abs(window.scrollY - 500) < 2);

    // Fresh navigation to about: must start at top (0), then scroll to 250.
    await navigateTo('about');
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'about');
    assert.ok(Math.abs(await page.evaluate(() => window.scrollY)) < 2, `${mode} ${vlabel}: fresh navigation to about starts at top`);
    await page.evaluate(() => window.scrollTo({ top: 250, left: 0, behavior: 'instant' }));
    await page.waitForFunction(() => Math.abs(window.scrollY - 250) < 2);

    // Browser Back to portfolio: must restore remembered 500 without animated traversal.
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
    const portSamples = await page.evaluate(() => new Promise((done) => {
      const out = [window.scrollY];
      const tick = (n) => (n <= 0 ? done(out) : requestAnimationFrame(() => { out.push(window.scrollY); tick(n - 1); }));
      tick(8);
    }));
    assert.ok(portSamples.every((y) => Math.abs(y - 500) <= 3), `${mode} ${vlabel}: browser Back to portfolio restores 500 instantly (${portSamples.map(Math.round).join(',')})`);

    // Browser Back to home: must restore remembered 420 without animated traversal.
    await page.goBack();
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'home');
    const homeSamples = await page.evaluate(() => new Promise((done) => {
      const out = [window.scrollY];
      const tick = (n) => (n <= 0 ? done(out) : requestAnimationFrame(() => { out.push(window.scrollY); tick(n - 1); }));
      tick(8);
    }));
    assert.ok(homeSamples.every((y) => Math.abs(y - 420) <= 3), `${mode} ${vlabel}: browser Back to home restores 420 instantly (${homeSamples.map(Math.round).join(',')})`);

    // Browser Forward to portfolio: must restore remembered 500.
    await page.goForward();
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
    const portFwdSamples = await page.evaluate(() => new Promise((done) => {
      const out = [window.scrollY];
      const tick = (n) => (n <= 0 ? done(out) : requestAnimationFrame(() => { out.push(window.scrollY); tick(n - 1); }));
      tick(8);
    }));
    assert.ok(portFwdSamples.every((y) => Math.abs(y - 500) <= 3), `${mode} ${vlabel}: browser Forward to portfolio restores 500 (${portFwdSamples.map(Math.round).join(',')})`);

    // Browser Forward to about: must restore remembered 250.
    await page.goForward();
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'about');
    assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - 250) <= 3, `${mode} ${vlabel}: browser Forward to about restores 250`);

    // Rapid consecutive navigation: rapid back then forward.
    await page.goBack();
    await page.goForward();
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'about');
    assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - 250) <= 3, `${mode} ${vlabel}: rapid back/forward settles on about with restored scroll`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  note(`${mode} scroll restoration`, 'Back-to-list + ordinary Back/Forward across 390x844, 844x390, 1440x900, no traversal');

  // 3b. Canonical asset category filtering: multi-word chip filters correctly.
  await page.evaluate(() => { location.hash = '#free-assets'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'free-assets');
  await page.locator('#faChips .chip[data-filter="stream overlays"]').click();
  assert.equal(await page.locator('#faGrid [data-asset="mx-stream"]:visible').count(), 1, `${mode}: stream overlays asset is visible`);
  assert.equal(await page.locator('#faGrid [data-asset="mx-asset"]:visible').count(), 0, `${mode}: brushes asset is hidden`);
  await page.locator('#faChips .chip[data-filter="all"]').click();
  note(`${mode} canonical category chip filter`);

  // 4. Same-route refresh keeps position.
  await page.evaluate(() => { location.hash = '#asset/mx-asset'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'free-asset-detail');
  await page.evaluate(() => window.scrollTo({ top: 250, left: 0, behavior: 'instant' }));
  await page.evaluate(() => {
    const rec = window.CrabbieAssets.getPrototype('mx-asset');
    rec.description = 'many previews (refreshed)';
    // Re-apply the full set: snapshots are authoritative, a partial list
    // would read as unpublish for the missing slugs.
    const others = ['mx-nocover', 'mx-single', 'mx-stream'].map((s) => window.CrabbieAssets.getPrototype(s));
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

  // 5b. Portfolio image-card geometry + deterministic composition.
  //     The listing image-card model must stay coherent at every required
  //     width: full uncropped ratio, metadata inside the card, no leftover
  //     180px placeholder strip after load, visible protruding category cloud,
  //     no root overflow. Deterministic bands must not depend on DOM history.
  const matrixRatios = [['mx-sq', 800, 800], ['mx-land', 1200, 600], ['mx-port', 400, 1200], ['mx-wide', 1600, 200]];
  const matrixArtRecs = () => {
    const cats = ['Illustration', 'Chibi', 'Vtuber', 'Other'];
    const recs = matrixRatios.map(([slug, w, h], i) => ({ slug, title: 'Art ' + slug, description: '', cat: cats[i % cats.length], tags: [], thumbnail: '', cover: `https://matrix-art.test/art-${w}x${h}.svg`, cardMode: 'image', blocks: [], credits: '', year: '2026', featured: false, published: true }));
    recs.push({ slug: 'mx-missing', title: 'Missing Art', description: '', cat: 'Other', tags: [], thumbnail: '', cover: '', cardMode: 'image', blocks: [], credits: '', year: '2026', featured: false, published: true });
    recs.push({ slug: 'mx-broken', title: 'Broken Art', description: '', cat: 'Other', tags: [], thumbnail: '', cover: 'https://matrix-art.test/broken.png', cardMode: 'image', blocks: [], credits: '', year: '2026', featured: false, published: true });
    return recs;
  };
  const probeArtCard = (slug) => page.evaluate((s) => {
    const card = document.querySelector(`#pfGrid [data-project="${s}"]`);
    if (!card) return null;
    const thumb = card.querySelector('.thumb');
    const img = thumb.querySelector('img');
    const meta = card.querySelector('.meta');
    const badge = card.querySelector('.cloud-tag');
    const b = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
    return {
      card: b(card), thumb: b(thumb), meta: b(meta),
      img: img ? Object.assign(b(img), { natW: img.naturalWidth, natH: img.naturalHeight, fit: getComputedStyle(img).objectFit }) : null,
      thumbPos: getComputedStyle(thumb).position, metaPos: getComputedStyle(meta).position,
      artReady: card.classList.contains('is-art-ready'),
      hasLabel: Boolean(thumb.querySelector('.ph-label')),
      badge: badge ? b(badge) : null,
      href: card.getAttribute('href'), lightbox: card.getAttribute('data-lightbox-src'),
      missing: card.hasAttribute('data-missing-source'),
      ariaLabel: card.getAttribute('aria-label')
    };
  }, slug);
  const artWidths = [
    [379, 667], [380, 667], [381, 667], [390, 844], [430, 932],
    [599, 800], [600, 800], [601, 800], [640, 480], [641, 480],
    [719, 800], [720, 540], [721, 540], [844, 390],
    [859, 800], [860, 800], [861, 800], [899, 900], [900, 900], [901, 900],
    [1179, 900], [1180, 900], [1181, 900], [1280, 800], [1440, 900]
  ];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { location.hash = '#portfolio'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  await page.evaluate((recs) => window.CrabbiePortfolio.apply(recs), matrixArtRecs());
  await page.waitForFunction(() => {
    const imgs = Array.from(document.querySelectorAll('#pfGrid .thumb img')).filter((img) => !/broken/.test(img.src));
    return imgs.length >= 4 && imgs.every((img) => img.complete && img.naturalWidth > 0);
  }, null, { timeout: 25000 });
  // Lazy artwork only fetches when near the viewport; bring the broken card in
  // so its error path runs on every engine (WebKit loads far less eagerly).
  await page.locator('#pfGrid [data-project="mx-broken"]').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => !document.querySelector('#pfGrid [data-project="mx-broken"] .thumb img'), null, { timeout: 15000 });
  for (const [width, height] of artWidths) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { location.hash = '#portfolio'; });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(160);
    await page.mouse.move(2, 2);
    const at = `${width}x${height}`;
    const sw = await page.evaluate(() => ({ docCW: document.documentElement.clientWidth, docSW: document.documentElement.scrollWidth, bodyCW: document.body.clientWidth, bodySW: document.body.scrollWidth }));
    assert.ok(sw.docSW <= sw.docCW + 1 && sw.bodySW <= sw.bodyCW + 1, `${mode} image cards keep the page width at ${at}`);
    for (const [slug] of matrixRatios) {
      const c = await probeArtCard(slug);
      assert.ok(c && c.img && c.img.natW > 0, `${mode} ${slug} artwork loads at ${at}`);
      if (width <= 1180) {
        assert.ok(Math.abs(c.img.h - c.img.w * c.img.natH / c.img.natW) <= 2, `${mode} ${slug} keeps its full ratio at ${at}`);
        assert.equal(c.thumbPos, 'relative', `${mode} ${slug} thumb sizes in flow at ${at}`);
        assert.equal(c.metaPos, 'static', `${mode} ${slug} meta is in flow at ${at}`);
        assert.equal(c.artReady, true, `${mode} ${slug} releases the fallback minimum after load at ${at}`);
        assert.ok(Math.abs(c.thumb.h - c.img.h) <= 2, `${mode} ${slug} has no leftover placeholder strip at ${at} (thumb ${c.thumb.h.toFixed(2)}, img ${c.img.h.toFixed(2)})`);
        assert.ok(c.meta.t >= c.img.b - 1 && c.meta.b <= c.card.b + 1, `${mode} ${slug} meta sits inside the card at ${at}`);
      } else {
        assert.equal(c.img.fit, 'cover', `${mode} ${slug} keeps the desktop cover at ${at}`);
        assert.equal(c.thumbPos, 'absolute', `${mode} ${slug} keeps the desktop overlay at ${at}`);
      }
      assert.ok(c.badge && c.badge.t < c.card.t + 1 && c.badge.b <= c.card.b, `${mode} ${slug} category cloud protrudes and is visible at ${at}`);
      assert.ok(c.card.r <= sw.bodyCW + 1, `${mode} ${slug} stays inside the page at ${at}`);
    }
    for (const slug of ['mx-missing', 'mx-broken']) {
      const c = await probeArtCard(slug);
      assert.equal(c.img, null, `${mode} ${slug} renders no broken image at ${at}`);
      assert.ok(c.hasLabel && c.card.h >= 180, `${mode} ${slug} keeps a sized labeled fallback at ${at}`);
    }
    const missingCard = await probeArtCard('mx-missing');
    assert.equal(missingCard.lightbox, null, `${mode} mx-missing carries no lightbox state at ${at}`);
    assert.equal(missingCard.href, '#portfolio', `${mode} mx-missing never points the lightbox anywhere at ${at}`);
    assert.equal(missingCard.missing, true, `${mode} mx-missing carries the non-navigating marker at ${at}`);
    assert.ok((missingCard.ariaLabel || '').includes('unavailable'), `${mode} mx-missing has a truthful unavailable label at ${at}`);
    const brokenCard = await probeArtCard('mx-broken');
    assert.equal(brokenCard.lightbox, 'https://matrix-art.test/broken.png', `${mode} mx-broken keeps its real viewer source (opens retry) at ${at}`);
    assert.equal(brokenCard.missing, false, `${mode} mx-broken with a source URL is never marked missing at ${at}`);
  }

  // Missing-source cards stay in the list under mouse/touch/keyboard semantics
  // at the mobile/landscape/grid breakpoint edges. DOM click avoids WebKit's
  // known actionability flake while still exercising the delegated click owner.
  for (const [width, height] of [[390, 844], [844, 390], [1180, 900], [1181, 900]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { location.hash = '#portfolio'; });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
    await page.evaluate(() => document.querySelector('#pfGrid [data-project="mx-missing"]')?.click());
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.querySelector('.view.is-active')?.dataset.view), 'portfolio', `${mode} missing-source click stays in list at ${width}x${height}`);
    assert.equal(await page.evaluate(() => document.getElementById('publicLightbox').hidden), true, `${mode} missing-source click never opens viewer at ${width}x${height}`);
    await page.locator('#pfGrid [data-project="mx-missing"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => document.querySelector('.view.is-active')?.dataset.view), 'portfolio', `${mode} missing-source Enter stays in list at ${width}x${height}`);
    assert.equal(await page.evaluate(() => document.getElementById('publicLightbox').hidden), true, `${mode} missing-source Enter never opens viewer at ${width}x${height}`);
  }
  // Deterministic composition: desktop cycle, tablet pairing, no overlap.
  const matrixVariants = () => page.evaluate(() => {
    const order = ['pf-l', 'pf-t', 'pf-s', 'pf-w'];
    return Array.from(document.querySelectorAll('#pfGrid [data-project]')).filter((c) => c.style.display !== 'none').map((c) => order.find((v) => c.classList.contains(v)) || null);
  });
  const pfSeven = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ slug: 'pf-' + i, title: 'PF ' + i, description: '', cat: 'Illustration', tags: [], thumbnail: 'https://matrix-art.test/art-800x600.svg', cover: '', cardMode: 'project', blocks: [], credits: '', year: '2026', featured: false, published: true }));
  const cycle = ['pf-l', 'pf-t', 'pf-s', 'pf-s', 'pf-s', 'pf-w', 'pf-w'];
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { location.hash = '#portfolio'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  await page.evaluate((recs) => window.CrabbiePortfolio.apply(recs), pfSeven);
  assert.deepEqual(await matrixVariants(), cycle, `${mode} a seven-card cycle tiles the desktop bands`);
  await page.setViewportSize({ width: 900, height: 1000 });
  // No re-seed after resize: the debounced recomposition must do the work,
  // otherwise a re-apply would mask a recomposition timing regression.
  await page.waitForFunction(() => {
    const order = ['pf-l', 'pf-t', 'pf-s', 'pf-w'];
    const vis = Array.from(document.querySelectorAll('#pfGrid [data-project]')).filter((c) => c.style.display !== 'none').map((c) => order.find((v) => c.classList.contains(v)) || null);
    return vis.length === 7 && vis.every((v) => v === 'pf-s');
  }, null, { timeout: 5000 });
  assert.ok((await matrixVariants()).every((v) => v === 'pf-s'), `${mode} tablet drops legacy three-row spans`);
  note(`${mode} portfolio image cards + deterministic composition`, '640–1440 + phone landscape, ratios, fallbacks, bands');


  // 6. Viewer: open/zoom/pan/prev-next/Back/focus/lock.
  await page.evaluate(() => { location.hash = '#asset/mx-asset'; });
  await page.waitForFunction(() => document.querySelector('#adTitle').textContent === 'Matrix Asset');
  const opener = page.locator('#adGallery .ad-thumb[data-ad-index="2"]');
  // Open via a synthetic click so no auto-scroll happens; capture the exact
  // resting page position the viewer must restore on close.
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  const beforeOpenY = await page.evaluate(() => window.scrollY || 0);
  await page.evaluate(() => document.querySelector('#adGallery .ad-thumb[data-ad-index="2"]').click());
  await page.waitForFunction(() => !document.getElementById('publicLightbox').hidden);
  assert.ok((await page.locator('#publicLightboxImg').getAttribute('src')).endsWith('g1.png'), `${mode}: viewer opens the selected original`);
  assert.equal(await page.locator('#publicLightboxPosition').innerText(), '3 / 14', `${mode}: position tracks cover-first collection`);
  const stageFit = await page.evaluate(() => {
    const stage = document.getElementById('publicLightboxStage');
    const img = document.getElementById('publicLightboxImg');
    const sr = stage.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const navs = [document.getElementById('publicLightboxPrev'), document.getElementById('publicLightboxNext')].filter((b) => !b.hidden).map((b) => { const r = b.getBoundingClientRect(); return r.top + r.height / 2; });
    const bar = document.getElementById('publicLightboxBar').getBoundingClientRect();
    return {
      dx: (ir.left + ir.width / 2) - (sr.left + sr.width / 2),
      dy: (ir.top + ir.height / 2) - (sr.top + sr.height / 2),
      navOffsets: navs.map((cy) => Math.abs(cy - (sr.top + sr.height / 2))),
      barClears: bar.top >= sr.bottom - 1
    };
  });
  assert.ok(Math.abs(stageFit.dx) <= 2 && Math.abs(stageFit.dy) <= 2, `${mode}: artwork centers on the media stage (dx=${stageFit.dx.toFixed(2)}, dy=${stageFit.dy.toFixed(2)})`);
  assert.ok(stageFit.navOffsets.every((d) => d <= 2), `${mode}: viewer navigation centers on the media stage`);
  assert.equal(stageFit.barClears, true, `${mode}: the toolbar clears the media stage`);
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', `${mode}: background locks while open`);
  await page.locator('#publicLightboxZoomIn').click();
  const zoomed = await page.evaluate(() => document.getElementById('publicLightboxImg').style.transform);
  assert.ok(/scale\((1\.[2-9]|[2-9])/.test(zoomed), `${mode}: discrete zoom scales`);
  await page.locator('#publicLightboxNext').click();
  await page.waitForFunction(() => document.getElementById('publicLightboxPosition').textContent === '4 / 14');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('publicLightbox').hidden);
  assert.equal(await page.evaluate(() => document.body.style.overflow === '' || document.body.style.overflow === 'visible' || getComputedStyle(document.body).overflow === 'visible'), true, `${mode}: lock restores on close`);
  // Escape owns a history entry, so the scroll restore lands on the async popstate path.
  await page.waitForFunction((y) => Math.abs((window.scrollY || 0) - y) <= 2, beforeOpenY, { timeout: 3000 }).catch(() => {});
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - beforeOpenY) <= 2, `${mode}: no scroll jump on close (before=${beforeOpenY}, after=${await page.evaluate(() => window.scrollY)})`);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-ad-index')), '2', `${mode}: focus returns to the opener`);
  // Back dismisses before route change. As with SPA anchor routing above,
  // WebKit can report a false action timeout after the button handler already
  // ran, so use the DOM activation path there; Chromium keeps physical input.
  if (browserName === 'webkit') {
    await page.evaluate(() => document.querySelector('#adGallery .ad-thumb[data-ad-index="2"]')?.click());
  } else if (mobile) {
    await opener.tap();
  } else {
    await opener.click();
  }
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
  await page.waitForSelector('#pfChips .chip', { state: 'visible' });
  // WebKit can lag matchMedia for a tick after emulateMedia.
  await page.waitForFunction(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  let jellySeen = false;
  for (let attempt = 0; attempt < 3 && !jellySeen; attempt += 1) {
    jellySeen = await page.evaluate(() => new Promise((done) => {
      let seen = false;
      const probe = setInterval(() => {
        if (document.querySelector('.is-jelly')) { seen = true; clearInterval(probe); done(true); }
      }, 16);
      setTimeout(() => { clearInterval(probe); done(seen); }, 700);
      const el = document.querySelector('#pfChips .chip');
      if (el) el.click();
    }));
    if (!jellySeen) await page.waitForTimeout(200);
  }
  assert.equal(jellySeen, true, `${mode}: jelly press feedback fires`);
  await page.waitForFunction(() => document.querySelectorAll('.is-jelly').length === 0, null, { timeout: 3000 });
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

  // 8. Navigation motion stability: no jelly on cards, stationary detail activation.
  // Restore initial portfolio prototype records so standard navigation links work
  await page.evaluate(() => {
    location.hash = '#portfolio';
    window.CrabbiePortfolio.apply([
      {slug:'color-fiesta', title:'Color Fiesta Booth', description:'', cat:'Illustration', tags:[], thumbnail:'', cover:'', cardMode:'project', blocks:[], credits:'', year:'2026', featured:true, published:true},
      {slug:'amelodios-merch', title:'Amelodios Merch Table', description:'', cat:'Other', tags:[], thumbnail:'', cover:'', cardMode:'project', blocks:[], credits:'', year:'2026', featured:false, published:true},
      {slug:'amelodios-comic', title:'Amelodios Promo Comic', description:'', cat:'Other', tags:[], thumbnail:'', cover:'', cardMode:'project', blocks:[], credits:'', year:'2026', featured:false, published:true}
    ]);
  });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');

  const checkStationary = async (detailView, detailHash, listHash) => {
    assert.equal(await page.evaluate(() => location.hash), detailHash, `${mode}: correct detail hash`);
    assert.equal(await page.locator('.view.is-active').count(), 1, `${mode}: exactly one active view`);
    assert.equal(await page.locator('.is-jelly').count(), 0, `${mode}: no element has .is-jelly`);
    const st = await page.evaluate((v) => {
      const root = document.querySelector(`.view[data-view="${v}"]`);
      const title = root ? root.querySelector('.page-title') : null;
      const back = root ? root.querySelector('.back-link') : null;
      const eyebrow = root ? root.querySelector('.eyebrow') : null;
      const cs = (el) => el ? { anim: getComputedStyle(el).animationName, opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform, filter: getComputedStyle(el).filter } : null;
      return { root: cs(root), title: cs(title), back: cs(back), eyebrow: cs(eyebrow) };
    }, detailView);
    assert.equal(st.root.anim, 'none', `${mode} ${detailView}: root stationary`);
    assert.equal(st.root.opacity, '1', `${mode} ${detailView}: root full opacity`);
    assert.equal(st.root.transform, 'none', `${mode} ${detailView}: root no translate/scale`);
    assert.ok(st.root.filter === 'none' || st.root.filter === '', `${mode} ${detailView}: root no blur`);
    assert.equal(st.title.anim, 'none', `${mode} ${detailView}: title stationary`);
    assert.equal(st.back.anim, 'none', `${mode} ${detailView}: back-link stationary`);
    assert.equal(st.eyebrow.anim, 'none', `${mode} ${detailView}: eyebrow stationary`);
    // Back navigation restores list view. WebKit's Playwright click/tap can
    // wait on a same-document anchor navigation after the SPA has already
    // handled the click, producing a false timeout. Dispatch the DOM click in
    // WebKit for router semantics; Chromium keeps the physical actionability
    // path, while hit-testing/touch behavior are covered elsewhere.
    const backSelector = `.view[data-view="${detailView}"] .back-link`;
    if (browserName === 'webkit') {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error('Missing navigation control: ' + sel);
        el.click();
      }, backSelector);
    } else {
      await page.locator(backSelector).click();
    }
    await page.waitForFunction((h) => location.hash === h, listHash);
    assert.equal(await page.locator('.view.is-active').count(), 1, `${mode}: one active view after Back`);
  };

  const activateRouteControl = async (selector) => {
    if (browserName === 'webkit') {
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error('Missing navigation control: ' + sel);
        el.click();
      }, selector);
      return;
    }
    if (mobile) await page.locator(selector).tap();
    else await page.locator(selector).click();
  };

  // Portfolio: card body click/tap
  await activateRouteControl('#pfGrid .work[data-project="color-fiesta"]');
  await checkStationary('project-detail', '#project/color-fiesta', '#portfolio');

  // Portfolio: See more click/tap
  await activateRouteControl('#pfGrid .work[data-project="amelodios-merch"] .work-more');
  await checkStationary('project-detail', '#project/amelodios-merch', '#portfolio');

  // Portfolio: keyboard Enter
  await page.locator('#pfGrid .work[data-project="amelodios-comic"]').focus();
  await page.keyboard.press('Enter');
  await checkStationary('project-detail', '#project/amelodios-comic', '#portfolio');

  // Free Assets: click/tap
  await page.evaluate(() => { location.hash = '#free-assets'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'free-assets');
  await activateRouteControl('#faGrid .item[data-asset="mx-asset"]');
  await checkStationary('free-asset-detail', '#asset/mx-asset', '#free-assets');

  // Free Assets: keyboard Enter
  await page.locator('#faGrid .item[data-asset="mx-nocover"]').focus();
  await page.keyboard.press('Enter');
  await checkStationary('free-asset-detail', '#asset/mx-nocover', '#free-assets');

  // Verify reduced-motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { location.hash = '#portfolio'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  await activateRouteControl('#pfGrid .work[data-project="color-fiesta"]');
  await checkStationary('project-detail', '#project/color-fiesta', '#portfolio');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  note(`${mode} stationary detail navigation + no jelly`);

  assert.deepEqual(errors, [], `${mode}: no uncaught script errors`);
  await context.close();
}

await browser.close();
server.close();
console.log(`\nMATRIX COMPLETE (${browserName}): ${summary.length} checks passed`);
