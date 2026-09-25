import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Startup-settlement regression: the app shell (nav + view + footer) must
// become visible and usable on every public route even when the CDN module
// graph is aborted, when the CMS module never evaluates, or when the CMS never
// settles. It also proves a late CMS success still hydrates normally, that the
// settlement is idempotent, and that a healthy load keeps the existing Home
// bloom animation untouched (no prototype flash).
//
//   node scripts/startup-settlement.mjs --browser=chromium
//   node scripts/startup-settlement.mjs --browser=webkit
//
// Offline fixtures only: the jsDelivr SDK boundary is replaced, the local SPA
// runs for real, and no production project or database is contacted.

const browserName = (process.argv.find((a) => a.startsWith('--browser=')) || '--browser=chromium').slice(10);
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = browserName === 'webkit' ? webkit : chromium;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const rewrites = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8')).rewrites;

const html = await readFile(resolve(root, 'crabbie-port26.html'), 'utf8');
// Fixture document without the inline Home bloom animation: proves the shell
// reveal is independent of that animation instead of depending on it.
const htmlWithoutBloom = html.replace(/<script id="home-bloom-transition-script">[\s\S]*?<\/script>/, '');
if (htmlWithoutBloom === html) throw new Error('Home bloom script block not found; the animation-independent fixture cannot be built.');

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/' && url.searchParams.get('nobloom') === '1') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(htmlWithoutBloom);
      return;
    }
    let path = decodeURIComponent(url.pathname);
    const rewrite = rewrites.find(({ source }) => source === path || (source.endsWith('/:path*') && path.startsWith(source.slice(0, -7) + '/')));
    if (rewrite) path = rewrite.destination;
    if (path === '/api/public-config.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end('window.__CRABBIE_SUPABASE_CONFIG__={"url":"https://startup-test.supabase.co","key":"sb_startup_fixture"};');
      return;
    }
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep) || !['.html', '.js', '.css', '.svg', '.woff2'].includes(extname(file))) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': mime[extname(file)] });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
console.log(`Startup settle server: ${origin} (${browserName})`);

// Chainable Supabase stub. `window.__startupFixture` decides the mode:
//   delayMs > 0 -> the whole CMS answer arrives late (late success)
//   mode 'hang' -> queries never settle
const sdkFixture = `
export function createClient(){
  const config = () => window.__startupFixture || {};
  const rowsFor = (table) => {
    const fixture = config();
    return (fixture.tables && fixture.tables[table]) || [];
  };
  const settleAnswer = () => {
    const fixture = config();
    if (fixture.mode === 'hang') return new Promise(() => {});
    if (fixture.delayMs) return new Promise((done) => setTimeout(done, fixture.delayMs));
    return Promise.resolve();
  };
  const chain = (table) => ({
    select: () => chain(table),
    eq: () => chain(table),
    in: () => chain(table),
    is: () => chain(table),
    order: () => chain(table),
    range: () => chain(table),
    limit: () => chain(table),
    single: () => chain(table),
    maybeSingle: () => chain(table),
    then: (done, fail) => settleAnswer().then(() => {
      const rows = rowsFor(table);
      return done({ data: rows, error: null, count: rows.length });
    }, fail)
  });
  return {
    from: (table) => chain(table),
    rpc: async () => ({ data: null, error: { message: 'startup fixture: no rpc' } }),
    storage: { from: (bucket) => ({
      getPublicUrl: (path) => ({ data: { publicUrl: 'https://startup-test.supabase.co/' + bucket + '/' + path } }),
      upload: async () => ({ data: null, error: { message: 'startup fixture: no writes' } }),
      remove: async () => ({ data: null, error: { message: 'startup fixture: no writes' } }),
      list: async () => ({ data: [], error: null })
    }) },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      signOut: async () => ({ error: null })
    }
  };
}
`;

const healthyTables = () => ({
  site_settings: [
    { key: 'branding', value: { title: 'CMS FIXTURE', tagline: 'Fixture tagline' } },
    { key: 'seo', value: { title: '' } }
  ],
  cms_pages: [],
  cms_navigation: [
    { id: 'nav-home', title: 'Home', url: '#home', published: true, sort_order: 0 },
    { id: 'nav-portfolio', title: 'Portfolio', url: '#portfolio', published: true, sort_order: 1 }
  ],
  portfolio_projects: [{
    id: '00000000-0000-4000-8000-0000000000aa', slug: 'late-cms-art', title: 'Late CMS Art',
    description: 'Fixture project', tags: [], thumbnail_path: null, cover_path: '', featured: false,
    published: true, content: {}, sort_order: 0
  }],
  free_assets: [{
    slug: 'late-cms-asset', title: 'Late CMS Asset', description: '', thumbnail_path: null, file_type: 'zip',
    file_path: '', availability: 'available', featured: false, published: true, sort_order: 0, metadata: {}
  }],
  people: [],
  portfolio_project_people: [],
  commission_services: [],
  commission_forms: []
});

const viewports = [
  { width: 390, height: 844, label: 'phone-390', mobile: true },
  { width: 430, height: 932, label: 'phone-430', mobile: true },
  { width: 844, height: 390, label: 'landscape-844', mobile: true },
  { width: 1440, height: 900, label: 'desktop-1440', mobile: false }
];

const browser = await engine.launch({});
const results = [];
const note = (label, detail = '') => {
  results.push(`${browserName} ${label}${detail ? ' — ' + detail : ''}`);
  console.log(`PASS [${browserName}] ${label}${detail ? ' — ' + detail : ''}`);
};

async function openScenario(scenario, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    ...(viewport.mobile ? { hasTouch: true, isMobile: true } : {}),
    reducedMotion: scenario.reducedMotion ? 'reduce' : 'no-preference'
  });
  await context.route('https://cdn.jsdelivr.net/**', async (route) => {
    if (scenario.cdn === 'abort') return route.abort();
    if (scenario.cdn === 'delay') {
      await new Promise((done) => setTimeout(done, scenario.cdnDelayMs || 2500));
      return route.fulfill({ contentType: 'text/javascript', body: sdkFixture });
    }
    return route.fulfill({ contentType: 'text/javascript', body: sdkFixture });
  });
  for (const pattern of scenario.abortRequests || []) {
    await context.route(pattern, (route) => route.abort());
  }
  await context.addInitScript((fixture) => {
    window.__startupFixture = fixture;
    if (fixture.deadlineMs !== null) window.__CRABBIE_STARTUP_TIMEOUT_MS__ = fixture.deadlineMs;
    window.__startupEvents = [];
    window.addEventListener('crabbie:startup-settled', (event) => window.__startupEvents.push(event.detail));
    window.addEventListener('crabbie:site-content-ready', () => { window.__hydrationAt = Math.round(performance.now()); });
    // Applied-view log: route resolution is recorded synchronously with the DOM
    // change, so a late hydration burst cannot hide an earlier resolution.
    window.__viewLog = [];
    const recordView = () => {
      const active = document.querySelector('.view.is-active');
      const view = active ? active.dataset.view : null;
      const last = window.__viewLog[window.__viewLog.length - 1];
      if (!last || last.view !== view) window.__viewLog.push({ view: view, at: Math.round(performance.now()) });
    };
    const viewObserver = new MutationObserver(() => {
      if (!document.documentElement) return;
      viewObserver.disconnect();
      viewObserver.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
      recordView();
    });
    viewObserver.observe(document, { childList: true });
    // Prototype-flash probe: the nav shell must never become visible while the
    // CMS snapshot is still the prototype markup.
    window.__prototypeFlashTicks = 0;
    setInterval(() => {
      const nav = document.querySelector('.nav-shell');
      const brand = document.querySelector('#mainNav .brand span');
      if (!nav || !brand) return;
      const style = getComputedStyle(nav);
      const visible = style.visibility !== 'hidden' && Number(style.opacity) > 0.01;
      if (visible && !window.__CRABBIE_SITE_CONTENT_HYDRATED__) window.__prototypeFlashTicks += 1;
    }, 8);
  }, {
    mode: scenario.fixtureMode || 'ok',
    delayMs: scenario.fixtureDelayMs || 0,
    deadlineMs: scenario.deadlineMs === undefined ? null : scenario.deadlineMs,
    tables: healthyTables()
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(origin + scenario.path, { waitUntil: 'domcontentloaded' });
  return { context, page, pageErrors };
}

const shellState = (page) => page.evaluate(() => {
  const nav = document.querySelector('.nav-shell');
  const navStyle = nav ? getComputedStyle(nav) : null;
  const home = document.querySelector('.view[data-view="home"]');
  const footer = document.querySelector('footer');
  const overlay = document.getElementById('homeBloomTransition');
  const active = document.querySelector('.view.is-active');
  return {
    state: window.CrabbieStartup ? window.CrabbieStartup.snapshot() : null,
    events: window.__startupEvents ? window.__startupEvents.length : 0,
    prototypeFlashTicks: window.__prototypeFlashTicks || 0,
    pending: document.documentElement.classList.contains('cms-content-pending'),
    ready: document.documentElement.classList.contains('cms-content-ready'),
    homePending: document.documentElement.classList.contains('home-transition-pending'),
    revealSequence: document.documentElement.classList.contains('home-reveal-sequence'),
    revealActive: document.documentElement.classList.contains('home-reveal-active'),
    bodyLoading: document.body.classList.contains('is-loading'),
    rootOverflow: getComputedStyle(document.documentElement).overflow,
    navVisible: Boolean(navStyle) && navStyle.visibility !== 'hidden' && Number(navStyle.opacity) > 0.01,
    navBrand: (document.querySelector('#mainNav .brand span') || {}).textContent || '',
    activeView: active ? active.dataset.view : null,
    homeOpacity: home ? getComputedStyle(home).opacity : null,
    footerOpacity: footer ? getComputedStyle(footer).opacity : null,
    overlayHidden: Boolean(overlay) && overlay.classList.contains('is-hidden'),
    overlayDisplay: overlay ? getComputedStyle(overlay).display : null,
    title: document.title,
    portfolioHydrated: window.__CRABBIE_PORTFOLIO_HYDRATED__ === true,
    assetsHydrated: window.__CRABBIE_ASSETS_HYDRATED__ === true
  };
});

const waitForSettled = (page) => page.waitForFunction(() => Boolean(window.CrabbieStartup && window.CrabbieStartup.isSettled()));
// The gate releases immediately; the nav then fades in through its .35s CSS
// transition, so a settled snapshot waits for that to finish.
const waitForNav = (page) => page.waitForFunction(() => {
  const nav = document.querySelector('.nav-shell');
  if (!nav) return false;
  const style = getComputedStyle(nav);
  return style.visibility !== 'hidden' && Number(style.opacity) > 0.9;
});
async function shellReady(page) {
  await waitForSettled(page);
  await waitForNav(page);
  return shellState(page);
}
const waitForHomeShell = (page) => page.waitForFunction(() => {
  const overlay = document.getElementById('homeBloomTransition');
  const footer = document.querySelector('footer');
  return !document.documentElement.classList.contains('home-transition-pending')
    && !document.documentElement.classList.contains('home-reveal-sequence')
    && !document.body.classList.contains('is-loading')
    && Boolean(overlay && overlay.classList.contains('is-hidden'))
    && (!footer || getComputedStyle(footer).opacity === '1');
}, null, { timeout: 20000 });

const DEADLINE_MS = 900;

function assertShellUsable(state, label) {
  assert.equal(state.pending, false, `${label}: first-paint gate released`);
  assert.equal(state.ready, true, `${label}: gate reports ready`);
  assert.equal(state.navVisible, true, `${label}: navigation is visible`);
  assert.ok(state.activeView, `${label}: one view is active (${state.activeView})`);
  assert.equal(state.events, 1, `${label}: exactly one startup settlement`);
}

try {
  for (const viewport of viewports) {
    const tag = viewport.label;
    // Full animation-timeline waits run at the phone and desktop references;
    // every viewport still asserts the settlement invariants.
    const deep = viewport.width <= 390 || viewport.width >= 1000;

    // 1. Healthy load: the CMS module owns the settlement, the bounded fallback
    //    stands down, hydration still beats the gate (no prototype flash) and
    //    the Home bloom animation is never cut short.
    {
      const { context, page, pageErrors } = await openScenario({ path: '/#home' }, viewport);
      await page.waitForFunction(() => window.CrabbieStartup.snapshot().reason === 'cms-settled');
      await waitForNav(page);
      const settled = await shellState(page);
      assertShellUsable(settled, `healthy home ${tag}`);
      assert.equal(settled.state.degraded, false, `${tag}: healthy load is not degraded`);
      assert.equal(settled.navBrand, 'CMS FIXTURE', `${tag}: CMS branding hydrated, not the prototype`);
      assert.equal(settled.prototypeFlashTicks, 0, `${tag}: no prototype nav ever shown before hydration`);
      assert.equal(settled.homePending, true, `${tag}: settlement does not end the Home animation early`);
      if (deep) {
        await waitForHomeShell(page);
        const done = await shellState(page);
        assert.equal(done.revealSequence, false, `${tag}: reveal sequence cleaned up`);
        assert.equal(done.revealActive, false, `${tag}: reveal classes fully removed`);
        assert.equal(done.homeOpacity, '1', `${tag}: Home content visible`);
        assert.equal(done.rootOverflow !== 'hidden', true, `${tag}: page scrollable after the transition`);
      }
      // Idempotent: repeated or late settles never re-settle or rewrite the reason.
      await page.evaluate(() => {
        window.CrabbieStartup.settle('late-report');
        window.CrabbieStartup.settle('module-timeout');
        window.CrabbieStartup.settle('cms-settled');
      });
      const forced = await shellState(page);
      assert.equal(forced.events, 1, `${tag}: extra settles dispatch no second event`);
      assert.equal(forced.state.reason, 'cms-settled', `${tag}: the first settlement reason wins`);
      assert.equal(pageErrors.length, 0, `${tag}: healthy load has no page errors (${pageErrors.join(' | ')})`);
      await context.close();
      note(`healthy home settle + bloom animation (${tag})`);
    }

    // 2. Aborted CDN: the module graph never evaluates. The shell must fail open
    //    immediately, on Home and on a deep detail link alike.
    {
      const { context, page } = await openScenario({ path: '/#home', cdn: 'abort', deadlineMs: DEADLINE_MS }, viewport);
      const state = await shellReady(page);
      assertShellUsable(state, `cdn-aborted home ${tag}`);
      assert.equal(state.state.reason, 'module-error', `${tag}: module failure fails open without waiting`);
      assert.ok(state.state.settledAt <= DEADLINE_MS, `${tag}: settled before the bounded deadline`);
      assert.equal(state.homePending, true, `${tag}: the Home animation still owns its own transition`);
      if (deep) {
        await waitForHomeShell(page);
        const done = await shellState(page);
        assert.equal(done.homeOpacity, '1', `${tag}: Home content visible after the animation gives up`);
        assert.equal(done.footerOpacity, '1', `${tag}: footer visible after the animation gives up`);
        assert.equal(done.rootOverflow !== 'hidden', true, `${tag}: page scrollable after the animation gives up`);
      }
      await context.close();
      note(`cdn-aborted home shell (${tag})`);
    }

    // 3. Reduced motion: there is no Home bloom at all, so the gate must be the
    //    only thing that ever hides content.
    {
      const { context, page } = await openScenario({ path: '/#home', cdn: 'abort', deadlineMs: DEADLINE_MS, reducedMotion: true }, viewport);
      const state = await shellReady(page);
      assertShellUsable(state, `cdn-aborted home reduced-motion ${tag}`);
      assert.equal(state.homePending, false, `${tag}: reduced motion never enters the bloom transition`);
      assert.equal(state.overlayDisplay, 'none', `${tag}: the bloom overlay stays out of the way`);
      assert.equal(state.homeOpacity, '1', `${tag}: Home content visible`);
      assert.equal(state.footerOpacity, '1', `${tag}: footer visible`);
      assert.equal(state.rootOverflow !== 'hidden', true, `${tag}: page scrollable`);
      await context.close();
      note(`cdn-aborted home, reduced motion (${tag})`);
    }

    // 4. Aborted CDN + direct project URL: the CMS will never answer, so the
    //    pending route must resolve to the real 404 instead of looping.
    {
      const { context, page } = await openScenario({ path: '/#project/ghost-project', cdn: 'abort', deadlineMs: DEADLINE_MS }, viewport);
      const state = await shellReady(page);
      assertShellUsable(state, `cdn-aborted project ${tag}`);
      assert.equal(state.activeView, '404', `${tag}: unknown detail resolves to 404, never an endless loading view`);
      assert.equal(state.portfolioHydrated, false, `${tag}: no CMS data was invented`);
      assert.match(state.title, /Page Not Found/, `${tag}: route title follows the resolved view`);
      await context.close();
      note(`cdn-aborted direct project URL (${tag})`);
    }

    // 5. Aborted CDN + direct asset URL: same contract for Free Assets.
    {
      const { context, page } = await openScenario({ path: '/#asset/ghost-asset', cdn: 'abort', deadlineMs: DEADLINE_MS }, viewport);
      const state = await shellReady(page);
      assertShellUsable(state, `cdn-aborted asset ${tag}`);
      assert.equal(state.activeView, '404', `${tag}: unknown asset resolves to 404, never an endless loading view`);
      assert.equal(state.assetsHydrated, false, `${tag}: no CMS data was invented`);
      await context.close();
      note(`cdn-aborted direct asset URL (${tag})`);
    }

    // 6. CMS that never settles: bounded waiting releases the shell and resolves
    //    the pending route instead of pending forever.
    {
      const { context, page } = await openScenario({ path: '/#project/ghost-hang', fixtureMode: 'hang', deadlineMs: DEADLINE_MS }, viewport);
      const state = await shellReady(page);
      assertShellUsable(state, `hanging CMS ${tag}`);
      assert.equal(state.state.reason, 'module-timeout', `${tag}: the bounded deadline is what settled it`);
      assert.equal(state.state.degraded, true, `${tag}: a bounded timeout is degraded`);
      assert.equal(state.activeView, '404', `${tag}: pending detail resolved after the deadline`);
      assert.equal(state.portfolioHydrated, false, `${tag}: CMS never answered`);
      await context.close();
      note(`CMS that never settles (${tag})`);
    }

    // 7. Late CMS success: the degraded settlement resolves the route, then the
    //    real record hydrates and revives it - one settlement, no re-settle.
    {
      const { context, page } = await openScenario({ path: '/#project/late-cms-art', cdn: 'delay', cdnDelayMs: 2500, deadlineMs: DEADLINE_MS }, viewport);
      const degraded = await shellReady(page);
      assertShellUsable(degraded, `late CMS ${tag}`);
      assert.equal(degraded.state.reason, 'module-timeout', `${tag}: the deadline fired while the CMS was in flight`);
      // The pending detail resolves at the deadline - recorded synchronously in
      // the page, so a later hydration burst cannot hide it.
      await page.waitForFunction(() => (window.__viewLog || []).some((entry) => entry.view === '404'), null, { timeout: 15000 });
      await page.waitForFunction(() => {
        const active = document.querySelector('.view.is-active');
        return Boolean(active && active.dataset.view === 'project-detail');
      }, null, { timeout: 15000 });
      await page.locator('#pdTitle').waitFor({ state: 'visible' });
      assert.equal((await page.locator('#pdTitle').innerText()).trim(), 'Late CMS Art', `${tag}: the late record hydrates the detail`);
      const late = await shellState(page);
      const ordering = await page.evaluate(() => ({ viewLog: window.__viewLog, hydrationAt: window.__hydrationAt || null }));
      const fallback = ordering.viewLog.find((entry) => entry.view === '404');
      assert.ok(fallback, `${tag}: the pending detail resolved to a real 404 at the deadline`);
      assert.ok(ordering.hydrationAt && fallback.at < ordering.hydrationAt, `${tag}: it resolved before the late CMS data arrived`);
      assert.equal(ordering.viewLog[ordering.viewLog.length - 1].view, 'project-detail', `${tag}: the late record revives the detail`);
      assert.equal(late.navBrand, 'CMS FIXTURE', `${tag}: the late CMS snapshot applies to the shell`);
      assert.equal(late.portfolioHydrated, true, `${tag}: portfolio hydration completed`);
      assert.equal(late.pending, false, `${tag}: the gate stays released`);
      assert.equal(late.events, 1, `${tag}: a late success never re-settles`);
      assert.equal(late.state.reason, 'module-timeout', `${tag}: the recorded settlement reason is not rewritten`);
      await context.close();
      note(`late CMS success hydrates and revives (${tag})`);
    }

    // 8. The CMS module itself fails while the rest of the graph loads: the
    //    failing import reports itself and the shell still fails open.
    {
      const { context, page } = await openScenario({ path: '/#home', deadlineMs: DEADLINE_MS, abortRequests: ['**/src/site-content-cms.js'] }, viewport);
      const state = await shellReady(page);
      assert.equal(state.state.reason, 'cms-module-error', `${tag}: the failed CMS import reports its own settlement`);
      assertShellUsable(state, `failed CMS module ${tag}`);
      await page.waitForFunction(() => window.__CRABBIE_PORTFOLIO_HYDRATED__ === true, null, { timeout: 15000 });
      assert.equal(state.navBrand, 'Crabbie', `${tag}: no CMS settings were applied (prototype branding retained)`);
      await context.close();
      note(`CMS module failure fails open (${tag})`);
    }

    // 9. The Home animation removed entirely: the shell reveal must not depend on
    //    it. The settlement net clears the Home transition classes on its own.
    {
      const { context, page } = await openScenario({ path: '/?nobloom=1#home', cdn: 'abort', deadlineMs: DEADLINE_MS }, viewport);
      const state = await shellReady(page);
      assertShellUsable(state, `animation-independent home ${tag}`);
      assert.equal(state.homePending, true, `${tag}: the Home transition is still pending without its animation`);
      await page.waitForFunction(() => {
        const footer = document.querySelector('footer');
        return !document.documentElement.classList.contains('home-transition-pending')
          && !document.documentElement.classList.contains('home-reveal-sequence')
          && (!footer || getComputedStyle(footer).opacity === '1');
      }, null, { timeout: 15000 });
      const revealed = await shellState(page);
      assert.equal(revealed.revealSequence, false, `${tag}: reveal sequence never traps the footer`);
      assert.equal(revealed.bodyLoading, false, `${tag}: scroll lock released`);
      assert.equal(revealed.rootOverflow !== 'hidden', true, `${tag}: page scrollable without the animation`);
      assert.equal(revealed.overlayDisplay, 'none', `${tag}: the orphaned overlay is removed from the viewport`);
      assert.equal(revealed.homeOpacity, '1', `${tag}: Home content visible`);
      assert.equal(revealed.footerOpacity, '1', `${tag}: footer visible`);
      assert.equal(revealed.navVisible, true, `${tag}: navigation visible`);
      await context.close();
      note(`Home shell reveal without the Home animation (${tag})`);
    }
  }
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}

console.log(`Startup settlement matrix passed: ${results.length} checks (${browserName}).`);
