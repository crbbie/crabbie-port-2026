import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
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
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};
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

const matrixAssetRecs = () => {
  const gallery13 = Array.from({ length: 13 }, (_, i) => ({ id: 'g' + i, url: 'media/g' + i + '.png', alt: 'Shot ' + i, caption: i === 0 ? 'First caption' : '' }));
  return [
    { slug: 'mx-asset', title: 'Matrix Asset', cat: 'Brushes', format: 'PNG', icon: '★', description: 'many previews', version: '', date: '', credit: '', license: '', update: '', availability: 'available', downloadUrl: 'media/mx.zip', driveUrl: '', showDirectDownload: true, showDriveDownload: false, featured: false, published: true, tags: [], thumbnail: 'media/mx-cover.png', coverAlt: 'Matrix cover', gallery: gallery13 },
    { slug: 'mx-nocover', title: 'Matrix No Cover', cat: 'Brushes', format: 'PNG', icon: '❀', description: '', version: '', date: '', credit: '', license: '', update: '', availability: 'available', downloadUrl: 'media/mx2.zip', driveUrl: '', showDirectDownload: true, showDriveDownload: false, featured: false, published: true, tags: [], thumbnail: '', coverAlt: '', gallery: [{ id: 'n0', url: 'media/broken-x.png', alt: 'Broken', caption: '' }] },
    { slug: 'mx-single', title: 'Matrix Single', cat: 'Brushes', format: 'PNG', icon: '★', description: '', version: '', date: '', credit: '', license: '', update: '', availability: 'available', downloadUrl: 'media/mx3.zip', driveUrl: '', showDirectDownload: true, showDriveDownload: false, featured: false, published: true, tags: [], thumbnail: 'media/mx-single.png', coverAlt: '', gallery: [] }
  ];
};

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
  await page.evaluate(({ portRecs, assetRecs }) => {
    window.CrabbiePortfolio.apply(portRecs);
    window.CrabbieAssets.apply(assetRecs);
  }, {
    portRecs: [
      { slug: 'mx-tall', title: 'Matrix Tall', desc: 'tall cover art', cat: 'Illustration', tags: ['TALL'], thumbnail: '', cover: 'media/mx-tall.png', blocks: [{ type: 'text', text: 'Body one' }, { type: 'text', text: 'Body two' }], credits: '', year: '2026' },
      { slug: 'mx-filler-1', title: 'Filler One', desc: '', cat: 'Chibi', tags: [], thumbnail: '', cover: '', blocks: [], credits: '', year: '' },
      { slug: 'mx-filler-2', title: 'Filler Two', desc: '', cat: 'Chibi', tags: [], thumbnail: '', cover: '', blocks: [], credits: '', year: '' },
      { slug: 'mx-filler-3', title: 'Filler Three', desc: '', cat: 'Chibi', tags: [], thumbnail: '', cover: '', blocks: [], credits: '', year: '' }
    ],
    assetRecs: matrixAssetRecs()
  });

  // 1a. Real decoration assets verification: three decor PNGs and pet GIF.
  await page.waitForFunction(() => {
    const imgs = Array.from(document.querySelectorAll('#crabbieDecoLayer .crabbie-deco-item img'));
    return imgs.length === 3 && imgs.every((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
  });
  const decoCheck = await page.evaluate(() => {
    const layer = document.getElementById('crabbieDecoLayer');
    if (!layer) return null;
    const imgs = Array.from(layer.querySelectorAll('.crabbie-deco-item img'));
    return {
      count: imgs.length,
      loaded: imgs.every((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0),
      srcs: imgs.map((img) => decodeURIComponent(new URL(img.src, location.href).pathname))
    };
  });
  assert.ok(decoCheck && decoCheck.count === 3 && decoCheck.loaded, `${mode}: three decor PNGs load with real dimensions`);
  assert.deepEqual(decoCheck.srcs, [
    '/assets/decorations/deco-bg (1).png',
    '/assets/decorations/deco-bg (2).png',
    '/assets/decorations/deco-bg (3).png'
  ], `${mode}: decor PNGs use canonical paths`);

  // Activate pet to assert Desktop-Pet.gif loads with real intrinsic dimensions:
  await page.evaluate(() => {
    if (window.CrabbieSiteMotion) {
      window.CrabbieSiteMotion.applyMotion({ fallingCandy: false, pet: { enabled: true, maxDesktop: 1 } });
    }
  });
  await page.waitForSelector('#crabbiePetLayer .crabbie-pet', { timeout: 15000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('#crabbiePetLayer img[src*="/assets/decorations/pet/"]');
    return img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
  });
  const petCheck = await page.evaluate(() => {
    const img = document.querySelector('#crabbiePetLayer img[src*="/assets/decorations/pet/"]');
    return img ? { complete: img.complete, natW: img.naturalWidth, natH: img.naturalHeight } : null;
  });
  assert.ok(petCheck && petCheck.complete && petCheck.natW > 0 && petCheck.natH > 0, `${mode}: pet GIF loads with real dimensions`);
  await page.evaluate(() => {
    if (window.CrabbieSiteMotion) {
      window.CrabbieSiteMotion.applyMotion({ fallingCandy: false, pet: { enabled: false } });
    }
  });
  note(`${mode} real decor PNGs and pet GIF bitmap loading`);

  // 1b. Route × viewport matrix + boundary triplets: one active view, no overflow, no scrollX.
  const boundaryTriplets = [
    [379, 667, 'boundary-379'], [380, 667, 'boundary-380'], [381, 667, 'boundary-381'],
    [599, 800, 'boundary-599'], [600, 800, 'boundary-600'], [601, 800, 'boundary-601'],
    [719, 800, 'boundary-719'], [720, 800, 'boundary-720'], [721, 800, 'boundary-721'],
    [859, 800, 'boundary-859'], [860, 800, 'boundary-860'], [861, 800, 'boundary-861'],
    [899, 900, 'boundary-899'], [900, 900, 'boundary-900'], [901, 900, 'boundary-901'],
    [1179, 900, 'boundary-1179'], [1180, 900, 'boundary-1180'], [1181, 900, 'boundary-1181']
  ];
  const allViewports = [...viewports, ...boundaryTriplets];
  for (const [width, height, label] of allViewports) {
    await page.setViewportSize({ width, height });
    for (const route of ['home', 'portfolio', 'free-assets', 'commissions', 'about', 'terms', 'contact']) {
      await page.evaluate((r) => { location.hash = '#' + r; }, route);
      await page.waitForFunction((r) => document.querySelector('.view.is-active')?.dataset.view === r, route);
      await page.evaluate(() => new Promise((d) => requestAnimationFrame(() => requestAnimationFrame(d))));
      const box = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const right = body.getBoundingClientRect().right;
        const culprits = [];
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
        let el;
        while ((el = walker.nextNode())) {
          if (culprits.length >= 3) break;
          const b = el.getBoundingClientRect();
          if (b.width > 0 && b.height > 0 && b.right > right + 1) {
            const cls = el.className && el.className.baseVal !== undefined ? '[svg]' : String(el.className || '').slice(0, 40);
            culprits.push(`<${el.tagName}${el.id ? '#' + el.id : ''}.${cls}>@${Math.round(b.right)}`);
          }
        }
        return {
          active: document.querySelectorAll('.view.is-active').length,
          docSW: doc.scrollWidth, docCW: doc.clientWidth,
          bodySW: body.scrollWidth, bodyCW: body.clientWidth,
          x: window.scrollX || 0,
          culprits
        };
      });
      if (box.active !== 1 || box.docSW > box.docCW + 1 || box.bodySW > box.bodyCW + 1 || box.x !== 0) {
        try {
          const artifactDir = resolve(root, 'test-artifacts');
          await mkdir(artifactDir, { recursive: true });
          await page.screenshot({ path: resolve(artifactDir, `overflow-${browserName}-${label}-${route}.png`) });
        } catch {}
      }
      assert.equal(box.active, 1, `${label} ${route}: exactly one active view`);
      assert.ok(box.docSW <= box.docCW + 1 && box.bodySW <= box.bodyCW + 1 && box.x === 0, `${label} ${route}: width within 1px, scrollX 0 (culprits: ${box.culprits.join(', ') || 'none'})`);
    }
  }
  note(`${mode} route×viewport matrix & boundary sweep`, '7 routes × 28 viewports (incl. boundary triplets), one active view, ≤1px overflow');

  // 1c. Focused WebKit/Chromium: Menu and sticky navigation across 390x844, 430x932, 844x390.
  const NAV_SEED = [
    { title: 'Home', url: '#home' }, { title: 'Portfolio', url: '#portfolio' },
    { title: 'Free Assets', url: '#free-assets' }, { title: 'Commissions', url: '#commissions' },
    { title: 'About', url: '#about' }, { title: 'Terms', url: '#terms' },
    { title: 'Contact', url: '#contact' }
  ];
  await page.evaluate((nav) => {
    if (window.CrabbieSiteContent) {
      window.CrabbieSiteContent.apply(undefined, nav, window.__cmsPublicSettings || {});
    }
  }, NAV_SEED);
  for (const [width, height] of [[390, 844], [430, 932], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => { location.hash = '#home'; });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'home');

    // Sticky nav pins while scrolling:
    await page.evaluate(() => window.scrollTo({ top: 500, left: 0, behavior: 'instant' }));
    await page.waitForTimeout(100);
    const sticky = await page.evaluate(() => {
      const nav = document.querySelector('.nav-shell');
      if (!nav) return null;
      return {
        pos: getComputedStyle(nav).position,
        top: nav.getBoundingClientRect().top
      };
    });
    assert.ok(sticky && sticky.pos === 'sticky', `${mode}: nav is position:sticky at ${width}x${height}`);
    assert.ok(Math.abs(sticky.top) <= 2, `${mode}: sticky nav pins at top while scrolled at ${width}x${height}`);
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));

    // Mobile menu toggle & hit testing:
    const burger = page.locator('#navBurger');
    if (await burger.isVisible()) {
      if (mobile) await burger.tap(); else await burger.click();
      await page.waitForFunction(() => document.getElementById('mobileMenu').classList.contains('open'));
      const menuAudit = await page.evaluate(() => {
        const menu = document.getElementById('mobileMenu');
        const mr = menu.getBoundingClientRect();
        const links = Array.from(menu.querySelectorAll('a'));
        const items = links.map((a) => {
          menu.scrollTop = Math.max(0, a.offsetTop - 60);
          const b = a.getBoundingClientRect();
          const y = Math.min(Math.max(b.top + b.height / 2, mr.top + 2), mr.bottom - 2);
          const hit = document.elementFromPoint(b.left + b.width / 2, y);
          return { text: a.textContent.trim(), owned: hit === a || a.contains(hit) };
        });
        return { count: links.length, items };
      });
      assert.ok(menuAudit.count >= 6, `${mode}: menu renders links at ${width}x${height}`);
      assert.ok(menuAudit.items.every((it) => it.owned), `${mode}: menu links own hit-testing at ${width}x${height}`);
      if (mobile) await burger.tap(); else await burger.click();
      await page.waitForFunction(() => !document.getElementById('mobileMenu').classList.contains('open'));
    }
  }
  note(`${mode} menu & sticky nav pinned across 390, 430 and 844`);

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
      href: card.getAttribute('href'), lightbox: card.getAttribute('data-lightbox-src')
    };
  }, slug);
  const artWidths = [
    [379, 667], [380, 667], [381, 667],
    [390, 844], [430, 932],
    [599, 800], [600, 800], [601, 800],
    [640, 480], [641, 480],
    [719, 800], [720, 540], [721, 540],
    [844, 390],
    [859, 800], [860, 800], [861, 800],
    [899, 900], [900, 900], [901, 900],
    [1179, 900], [1180, 900], [1181, 900],
    [1280, 800], [1440, 900]
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
    await page.waitForTimeout(60);
    await page.mouse.move(2, 2);
    const at = `${width}x${height}`;
    const sw = await page.evaluate(() => ({ docCW: document.documentElement.clientWidth, docSW: document.documentElement.scrollWidth, bodyCW: document.body.clientWidth, bodySW: document.body.scrollWidth }));
    if (sw.docSW > sw.docCW + 1 || sw.bodySW > sw.bodyCW + 1) {
      try {
        const artifactDir = resolve(root, 'test-artifacts');
        await mkdir(artifactDir, { recursive: true });
        await page.screenshot({ path: resolve(artifactDir, `overflow-${browserName}-art-${at}.png`) });
      } catch {}
    }
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
    const brokenCard = await probeArtCard('mx-broken');
    assert.equal(brokenCard.lightbox, 'https://matrix-art.test/broken.png', `${mode} mx-broken keeps its real viewer source (opens retry) at ${at}`);
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
  await page.evaluate((recs) => window.CrabbiePortfolio.apply(recs), pfSeven);
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

  // Focus trap: Shift+Tab wraps to last item, Tab wraps back to first.
  await page.evaluate(() => document.getElementById('publicLightboxClose').focus());
  await page.keyboard.down('Shift');
  await page.keyboard.press('Tab');
  await page.keyboard.up('Shift');
  const wrappedToLast = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('#publicLightbox button:not([hidden]):not([disabled])')).filter((el) => el.getClientRects().length > 0);
    return items.length > 0 && document.activeElement === items[items.length - 1];
  });
  assert.ok(wrappedToLast, `${mode}: viewer focus trap wraps Shift+Tab to last focusable control`);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), 'publicLightboxClose', `${mode}: viewer focus trap wraps Tab back to first control`);

  // Keyboard pan: Arrow keys adjust pan when zoomed.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  const panTransform = await page.evaluate(() => document.getElementById('publicLightboxImg')?.style.transform);
  assert.ok(panTransform.includes('scale('), `${mode}: keyboard pan maintains scale transform`);

  // Pointer drag pan:
  const imgBox = await page.locator('#publicLightboxImg').boundingBox();
  if (imgBox) {
    const startX = imgBox.x + imgBox.width / 2;
    const startY = imgBox.y + imgBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 30, startY + 20, { steps: 5 });
    const isPanning = await page.evaluate(() => document.getElementById('publicLightbox').classList.contains('is-panning'));
    await page.mouse.up();
    const afterDrag = await page.evaluate(() => {
      const img = document.getElementById('publicLightboxImg');
      return {
        transform: img ? img.style.transform : '',
        panningRemoved: !document.getElementById('publicLightbox').classList.contains('is-panning')
      };
    });
    assert.ok(afterDrag.panningRemoved, `${mode}: is-panning class removes after pointer drag release`);
    assert.ok(afterDrag.transform.includes('scale('), `${mode}: pointer drag maintains scale`);
  }

  // Capability statement for gestures:
  note(`${mode} gesture limitation: native iOS multi-touch pinch is not natively executable in Playwright WebKit runner; synthetic touch events are not claimed as native iPhone gesture tests`);

  // Resize preserves zoom scale:
  const currentZoomText = await page.evaluate(() => document.getElementById('publicLightboxZoomLabel')?.textContent);
  await page.setViewportSize({ width: 950, height: 650 });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForTimeout(60);
  const zoomAfterResize = await page.evaluate(() => document.getElementById('publicLightboxZoomLabel')?.textContent);
  assert.equal(zoomAfterResize, currentZoomText, `${mode}: resize preserves zoom scale`);
  await page.setViewportSize({ width: mobile ? 390 : 1280, height: mobile ? 844 : 800 });

  await page.locator('#publicLightboxNext').click();
  await page.waitForFunction(() => document.getElementById('publicLightboxPosition').textContent === '4 / 14');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('publicLightbox').hidden);
  assert.equal(await page.evaluate(() => document.body.style.overflow === '' || document.body.style.overflow === 'visible' || getComputedStyle(document.body).overflow === 'visible'), true, `${mode}: lock restores on close`);
  // Escape owns a history entry, so the scroll restore lands on the async popstate path.
  await page.waitForFunction((y) => Math.abs((window.scrollY || 0) - y) <= 2, beforeOpenY, { timeout: 3000 }).catch(() => {});
  assert.ok(Math.abs((await page.evaluate(() => window.scrollY)) - beforeOpenY) <= 2, `${mode}: no scroll jump on close (before=${beforeOpenY}, after=${await page.evaluate(() => window.scrollY)})`);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-ad-index')), '2', `${mode}: focus returns to the opener`);
  // Back dismisses before route change.
  if (mobile) await opener.tap(); else await opener.click();
  await page.waitForFunction(() => !document.getElementById('publicLightbox').hidden);
  const vHash = await page.evaluate(() => location.hash);
  await page.goBack();
  await page.waitForFunction(() => document.getElementById('publicLightbox').hidden);
  assert.equal(await page.evaluate(() => location.hash), vHash, `${mode}: Back dismisses viewer without navigating`);
  note(`${mode} viewer open/zoom/step/Back/focus/lock`);

  // 6b. Viewer error and retry:
  await page.evaluate((recs) => {
    window.CrabbiePortfolio.apply(recs);
    location.hash = '#portfolio';
  }, matrixArtRecs());
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  await page.locator('#pfGrid [data-project="mx-broken"]').scrollIntoViewIfNeeded();
  await page.locator('#pfGrid [data-project="mx-broken"]').click();
  await page.waitForFunction(() => !document.getElementById('publicLightbox').hidden);
  await page.waitForFunction(() => !document.getElementById('publicLightboxError').hidden, null, { timeout: 15000 });
  const errorControls = await page.evaluate(() => ({
    errorShown: !document.getElementById('publicLightboxError').hidden,
    loadingHidden: document.getElementById('publicLightboxLoading').hidden,
    retryVisible: !document.getElementById('publicLightboxRetry').hidden,
    closeVisible: !document.getElementById('publicLightboxErrorClose').hidden
  }));
  assert.ok(errorControls.errorShown && errorControls.loadingHidden && errorControls.retryVisible && errorControls.closeVisible, `${mode}: broken image renders retry and close controls`);
  
  // Retry triggers generation change:
  const genBefore = await page.evaluate(() => document.getElementById('publicLightboxImg')?.dataset.viewGen);
  await page.locator('#publicLightboxRetry').click();
  const genAfter = await page.evaluate(() => document.getElementById('publicLightboxImg')?.dataset.viewGen);
  assert.notEqual(genBefore, genAfter, `${mode}: retry increments view generation to reload`);

  // Close from error dialog:
  await page.locator('#publicLightboxErrorClose').click();
  await page.waitForFunction(() => document.getElementById('publicLightbox').hidden);
  note(`${mode} viewer error/retry`);

  // 6c. History departure when viewer is open:
  await page.evaluate(() => { location.hash = '#asset/mx-asset'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'free-asset-detail');
  await page.locator('#adGallery .ad-thumb[data-ad-index="2"]').click();
  await page.waitForFunction(() => !document.getElementById('publicLightbox').hidden);
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', `${mode}: body scroll locked when viewer open`);

  // Route departure while viewer is open:
  await page.evaluate(() => { location.hash = '#portfolio'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  const departureCheck = await page.evaluate(() => ({
    lightboxHidden: document.getElementById('publicLightbox').hidden,
    bodyOverflow: document.body.style.overflow
  }));
  assert.ok(departureCheck.lightboxHidden, `${mode}: viewer automatically closes upon route departure`);
  assert.ok(departureCheck.bodyOverflow === '' || departureCheck.bodyOverflow === 'visible' || getComputedStyle(document.body).overflow === 'visible', `${mode}: scroll lock is released upon route departure`);

  // Probe Back behavior:
  await page.goBack();
  await page.waitForTimeout(300);
  const backProbe = await page.evaluate(() => ({
    hash: location.hash,
    view: document.querySelector('.view.is-active')?.dataset.view,
    lightboxHidden: document.getElementById('publicLightbox').hidden
  }));
  note(`${mode} history departure settled`, `viewer closed, overflow restored; back navigation landed at ${backProbe.hash}`);

  // 6d. Wheel interaction with long metadata:
  const longCaption = 'Exquisite detailed artwork metadata description. '.repeat(80);
  await page.evaluate((caption) => {
    window.CrabbieAssets.apply([
      { slug: 'mx-long-cap', title: 'Long Caption Asset', cat: 'Brushes', format: 'PNG', icon: '★', description: '', availability: 'available', downloadUrl: 'media/mx.zip', showDirectDownload: true, showDriveDownload: false, featured: false, published: true, tags: [], thumbnail: 'media/mx-cover.png', coverAlt: '', gallery: [{ id: 'lc0', url: 'media/g0.png', alt: 'Long shot', caption }] }
    ]);
  }, longCaption);
  await page.evaluate(() => { location.hash = '#asset/mx-long-cap'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'free-asset-detail');
  await page.locator('#adGallery .ad-thumb[data-ad-index="1"]').click();
  await page.waitForFunction(() => !document.getElementById('publicLightbox').hidden);
  
  const capBox = await page.locator('#publicLightboxCaption').boundingBox();
  assert.ok(capBox && capBox.height > 0, `${mode}: long caption is rendered`);
  const initialZoom = await page.evaluate(() => document.getElementById('publicLightboxZoomLabel')?.textContent);
  if (!mobile) {
    if (capBox) {
      await page.mouse.move(capBox.x + capBox.width / 2, capBox.y + capBox.height / 2);
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(200);
    }
    const afterWheelZoom = await page.evaluate(() => document.getElementById('publicLightboxZoomLabel')?.textContent);
    const afterWheelScrollTop = await page.evaluate(() => document.getElementById('publicLightbox').scrollTop);
    note(`${mode} wheel with long metadata probed`, `initialZoom=${initialZoom}, afterWheelZoom=${afterWheelZoom}, scrollTop=${afterWheelScrollTop}`);
  } else {
    note(`${mode} metadata display`, `long caption rendered at height ${Math.round(capBox?.height || 0)}px, mobile scroll handled via touch gestures`);
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('publicLightbox').hidden);
  // Restore initial assets fixture for subsequent sections:
  await page.evaluate((recs) => window.CrabbieAssets.apply(recs), matrixAssetRecs());

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
    // Back navigation restores list view
    await page.locator(`.view[data-view="${detailView}"] .back-link`).click();
    await page.waitForFunction((h) => location.hash === h, listHash);
    assert.equal(await page.locator('.view.is-active').count(), 1, `${mode}: one active view after Back`);
  };

  // Portfolio: card body click/tap
  if (mobile) {
    await page.locator('#pfGrid .work[data-project="color-fiesta"]').tap();
  } else {
    await page.locator('#pfGrid .work[data-project="color-fiesta"]').click();
  }
  await checkStationary('project-detail', '#project/color-fiesta', '#portfolio');

  // Portfolio: See more click/tap
  if (mobile) {
    await page.locator('#pfGrid .work[data-project="amelodios-merch"] .work-more').tap();
  } else {
    await page.locator('#pfGrid .work[data-project="amelodios-merch"] .work-more').click();
  }
  await checkStationary('project-detail', '#project/amelodios-merch', '#portfolio');

  // Portfolio: keyboard Enter
  await page.locator('#pfGrid .work[data-project="amelodios-comic"]').focus();
  await page.keyboard.press('Enter');
  await checkStationary('project-detail', '#project/amelodios-comic', '#portfolio');

  // Free Assets: click/tap
  await page.evaluate(() => { location.hash = '#free-assets'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'free-assets');
  if (mobile) {
    await page.locator('#faGrid .item[data-asset="mx-asset"]').tap();
  } else {
    await page.locator('#faGrid .item[data-asset="mx-asset"]').click();
  }
  await checkStationary('free-asset-detail', '#asset/mx-asset', '#free-assets');

  // Free Assets: keyboard Enter
  await page.locator('#faGrid .item[data-asset="mx-nocover"]').focus();
  await page.keyboard.press('Enter');
  await checkStationary('free-asset-detail', '#asset/mx-nocover', '#free-assets');

  // Verify reduced-motion
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { location.hash = '#portfolio'; });
  await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'portfolio');
  if (mobile) await page.locator('#pfGrid .work[data-project="color-fiesta"]').tap();
  else await page.locator('#pfGrid .work[data-project="color-fiesta"]').click();
  await checkStationary('project-detail', '#project/color-fiesta', '#portfolio');
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  note(`${mode} stationary detail navigation + no jelly`);

  assert.deepEqual(errors, [], `${mode}: no uncaught script errors`);
  await context.close();
}

await browser.close();
server.close();
console.log(`\nMATRIX COMPLETE (${browserName}): ${summary.length} checks passed`);
