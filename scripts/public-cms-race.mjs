import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Latest-request ownership regression for the public CMS adapters.
//
// A startup hydration and an explicit CMS refresh can overlap (module import vs
// `refreshPublicCms`). Every adapter must keep the *newest* request
// authoritative: apply, settled/ready events and the hydration flags all belong
// to it, and a superseded response (success or failure) may never publish.
//
// Every race below is driven by controlled promises: the test resolves or
// rejects the exact query the adapter is awaiting, so ordering is deterministic
// and never depends on timing sleeps. The document, router, CMS bridges, mapping
// and rendering all run for real; only the jsDelivr SDK boundary is replaced.
//
//   node scripts/public-cms-race.mjs --browser=chromium
//   node scripts/public-cms-race.mjs --browser=webkit
//
// Offline fixtures only: no production project, database or mutation is touched.

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
      response.end('window.__CRABBIE_SUPABASE_CONFIG__={"url":"https://race-test.supabase.co","key":"sb_race_fixture"};');
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
console.log(`Public CMS race server: ${origin} (${browserName})`);

// Chainable Supabase stub. A query either resolves from window.__cmsRaceRows or
// is handed to the next deferred the test registered for that table, so the
// test owns the exact resolution order of every in-flight request.
const sdkFixture = `
export function createClient(){
  const runQuery = (table, state) => {
    let rows = (window.__cmsRaceRows[table] || []).slice();
    state.filters.forEach((predicate) => { rows = rows.filter(predicate); });
    if (state.order.length) {
      rows.sort((left, right) => {
        for (const entry of state.order) {
          const column = entry[0];
          if (left[column] === right[column]) continue;
          const compared = left[column] > right[column] ? 1 : -1;
          return entry[1] ? compared : -compared;
        }
        return 0;
      });
    }
    if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
    if (state.limit) rows = rows.slice(0, state.limit);
    return state.single ? {data: rows[0] || null, error: null} : {data: rows, error: null};
  };
  const query = (table, state) => new Proxy({}, { get: (_, key) => {
    if (key === 'then') return async (done) => {
      const registry = window.__cmsRace;
      const queue = registry && registry.queues[table];
      let result;
      if (queue && queue.length) {
        const deferred = queue.shift();
        (registry.holds[table] = registry.holds[table] || []).push(deferred);
        registry.counts[table] = (registry.counts[table] || 0) + 1;
        result = await deferred.promise;
      } else {
        result = runQuery(table, state);
      }
      return done ? done(result) : result;
    };
    return (...args) => {
      if (key === 'select') state.select = String(args[0] || '');
      else if (key === 'eq') state.filters.push((row) => String(row[args[0]]) === String(args[1]));
      else if (key === 'neq') state.filters.push((row) => String(row[args[0]]) !== String(args[1]));
      else if (key === 'in') {
        const list = (Array.isArray(args[1]) ? args[1] : [args[1]]).map(String);
        state.filters.push((row) => list.includes(String(row[args[0]])));
      }
      else if (key === 'range') state.range = [Number(args[0]), Number(args[1])];
      else if (key === 'limit') state.limit = Number(args[0]);
      else if (key === 'order') state.order.push([args[0], args[1] ? args[1].ascending !== false : true]);
      else if (key === 'single' || key === 'maybeSingle') state.single = true;
      return query(table, state);
    };
  }});
  return {
    from: (table) => query(table, {filters: [], order: [], range: null, limit: 0, select: '', single: false}),
    rpc: async () => ({data: null, error: {message: 'no rpc in the public race fixture'}}),
    storage: { from: (bucket) => ({
      getPublicUrl: (path, options) => ({data: {publicUrl: options && options.transform
        ? 'https://race-test.supabase.co/storage/v1/render/image/public/' + bucket + '/' + path + '?width=480'
        : 'https://race-test.supabase.co/' + path}}),
      upload: async () => ({data: null, error: {message: 'no writes in the public race fixture'}}),
      remove: async () => ({data: null, error: {message: 'no writes in the public race fixture'}}),
      list: async () => ({data: [], error: null})
    })},
    auth: {
      getSession: async () => ({data: {session: null}, error: null}),
      getUser: async () => ({data: {user: null}, error: null}),
      onAuthStateChange: () => ({data: {subscription: {unsubscribe(){}}}})
    }
  };
}`;

// Installed before any page script runs, so the startup hydration can also be
// held. Every deferred is created up front; the stub hands them to in-flight
// queries in registration order.
const bootstrap = (startupHolds) => {
  const race = {
    queues: {}, holds: {}, counts: {},
    defer(table) {
      let release;
      const promise = new Promise((done) => { release = done; });
      (race.queues[table] = race.queues[table] || []).push({ promise, release });
      return promise;
    },
    settle(table, index, payload) {
      const held = (race.holds[table] || [])[index];
      if (!held) throw new Error('No held ' + table + ' request at index ' + index);
      held.release(payload);
    },
    reset() { race.queues = {}; race.holds = {}; race.counts = {}; }
  };
  window.__cmsRace = race;
  window.__cmsRaceRows = {
    portfolio_projects: [], portfolio_project_people: [], people: [], free_assets: [],
    commission_services: [], commission_forms: [], cms_pages: [], cms_navigation: [], site_settings: []
  };
  window.__cmsRaceApplies = [];
  window.__cmsRaceSettled = [];
  window.__cmsRaceReady = [];
  window.__cmsRacePending = {};
  window.addEventListener('crabbie:site-content-ready', (event) => { window.__cmsRaceReady.push(event.detail || {}); });
  /* Public bridges exist by the time a test installs recorders: apply and
     settled stay the production handlers, only the call is recorded. */
  window.__cmsRaceInstallRecorders = () => {
    const record = (name, bridge) => {
      if (!bridge || bridge.__cmsRaceWrapped) return;
      const apply = bridge.apply;
      bridge.apply = function (...args) {
        const rows = Array.isArray(args[0]) ? args[0].map((row) => (row && (row.slug || row.id)) || '').filter(Boolean) : [];
        window.__cmsRaceApplies.push({ bridge: name, rows });
        return apply.apply(this, args);
      };
      if (typeof bridge.settled === 'function') {
        const settled = bridge.settled;
        bridge.settled = function (...args) { window.__cmsRaceSettled.push(name); return settled.apply(this, args); };
      }
      bridge.__cmsRaceWrapped = true;
    };
    record('assets', window.CrabbieAssets);
    record('portfolio', window.CrabbiePortfolio);
    record('commissions', window.CrabbieCommissions);
    record('siteContent', window.CrabbieSiteContent);
  };
  (startupHolds || []).forEach((table) => race.defer(table));
};

const summary = [];
const note = (label, detail = '') => {
  summary.push(`${browserName} ${label}${detail ? ' — ' + detail : ''}`);
  console.log(`PASS [${browserName}] ${label}${detail ? ' — ' + detail : ''}`);
};

const startRace = (page, options) => page.evaluate((opts) => {
  opts.tables.forEach((table) => { for (let i = 0; i < opts.times; i += 1) window.__cmsRace.defer(table); });
  window.__cmsRacePending[opts.key] = [];
  for (let i = 0; i < opts.times; i += 1) window.__cmsRacePending[opts.key].push(window.CrabbiePublicCmsRefresh.refresh(opts.scope));
}, options);
const waitForHolds = (page, table, count) => page.waitForFunction((expected) => (window.__cmsRace.holds[expected.table] || []).length === expected.count, { table, count });
const heldCount = (page, table) => page.evaluate((t) => (window.__cmsRace.holds[t] || []).length, table);
const settleRequest = (page, table, index, payload) => page.evaluate((opts) => window.__cmsRace.settle(opts.table, opts.index, opts.payload), { table, index, payload });
const awaitRequest = (page, key, index) => page.evaluate((opts) => Promise.resolve(window.__cmsRacePending[opts.key][opts.index]).then((value) => (value === undefined ? null : value)), { key, index });
const resetObservations = (page) => page.evaluate(() => {
  window.__cmsRace.reset();
  window.__cmsRaceApplies = [];
  window.__cmsRaceSettled = [];
  window.__cmsRaceReady = [];
});
const appliesFor = (page, bridge) => page.evaluate((b) => window.__cmsRaceApplies.filter((entry) => entry.bridge === b).map((entry) => entry.rows), bridge);

const raceAsset = (slug, title) => ({ slug, title, description: '', thumbnail_path: null, file_type: 'PNG', file_path: '', availability: 'available', featured: false, published: true, sort_order: 0, metadata: { cat: 'Brushes' } });
const raceProject = (slug, title) => ({ id: slug + '-id', slug, title, description: '', tags: [], thumbnail_path: null, cover_path: '', featured: false, published: true, content: {}, sort_order: 0 });
const raceService = (slug, title) => ({ slug, title, description: '', price: 25, currency: 'USD', availability: 'open', form_slug: '', thumbnail_path: null, featured: false, published: true, sort_order: 0, details: {} });
const raceForm = (slug, title) => ({ slug, title, description: '', fields: [], published: true });
const racePage = (name) => ({ slug: 'about', title: 'About', content: '', published: true, data: { name } });
const raceNav = (title) => ({ id: 'race-nav-home', title, url: '#home', published: true, sort_order: 0 });
const racePerson = () => ({ id: 'race-person-1', display_name: 'Race Person', avatar_path: 'https://race-test.supabase.co/person.png', avatar_alt: '', profile_url: '', kind: 'client', published: true, show_in_thank_you: false, sort_order: 0, updated_at: '2026-02-01T00:00:00Z' });
const raceLink = (projectId) => ({ project_id: projectId, person_id: 'race-person-1', sort_order: 0 });

const browser = await engine.launch({});
const errors = [];

/* ---- Shared page: the real startup hydration settles first ---------------- */
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await context.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/javascript', body: sdkFixture }));
await context.addInitScript(bootstrap, []);
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', (err) => errors.push(String((err && err.message) || err)));
await page.goto(origin + '/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__CRABBIE_SITE_CONTENT_HYDRATED__ === true
  && window.__CRABBIE_PORTFOLIO_HYDRATED__ === true
  && window.__CRABBIE_ASSETS_HYDRATED__ === true
  && Boolean(window.CrabbiePeople && window.CrabbiePeople.settled === true));
await page.evaluate(() => window.__cmsRaceInstallRecorders());
// The explicit refresh entry point is lazily imported by the admin save path.
// Loading it here resolves to the same module instance, so the adapters share
// one latest-request owner between startup hydration and this refresh.
await page.evaluate(async () => { await import('/src/public-cms-refresh.js'); });
await page.waitForFunction(() => Boolean(window.CrabbiePublicCmsRefresh && typeof window.CrabbiePublicCmsRefresh.refresh === 'function'));
note('startup hydration baseline', 'empty authoritative fixture, all bridges settled');

/* ---- 1. Free Assets: A-start → B-start → B-resolve → A-resolve keeps B ----- */
await resetObservations(page);
await page.evaluate(() => { window.__CRABBIE_ASSETS_HYDRATED__ = false; });
await startRace(page, { key: 'assets', scope: 'assets', tables: ['free_assets'], times: 2 });
await waitForHolds(page, 'free_assets', 2);
assert.equal(await page.evaluate(() => window.__cmsRace.counts.free_assets), 2, 'both overlapping refreshes issued exactly one held query each');
// Deferreds are handed out in registration order: A owns hold 0, B owns hold 1.
await settleRequest(page, 'free_assets', 1, { data: [raceAsset('race-b', 'Race B Asset')], error: null });
assert.equal(await awaitRequest(page, 'assets', 1), true, 'the newest free-assets hydration applies');
assert.equal(await page.evaluate(() => window.CrabbieAssets.getPrototype('race-b').title), 'Race B Asset');
await settleRequest(page, 'free_assets', 0, { data: [raceAsset('race-a', 'Race A Asset')], error: null });
assert.equal(await awaitRequest(page, 'assets', 0), true, 'a superseded hydration still reports that its own fetch succeeded');
const assetState = await page.evaluate(() => ({
  newest: window.CrabbieAssets.getPrototype('race-b').title || '',
  stale: window.CrabbieAssets.getPrototype('race-a').title || '',
  grid: Array.from(document.querySelectorAll('#faGrid [data-asset]')).map((el) => el.getAttribute('data-asset')),
  hydrated: window.__CRABBIE_ASSETS_HYDRATED__ === true,
  settled: window.__cmsRaceSettled.slice()
}));
assert.equal(assetState.newest, 'Race B Asset', 'the newest asset snapshot stays public');
assert.equal(assetState.stale, '', 'a superseded asset response never becomes public state');
assert.deepEqual(assetState.grid, ['race-b'], 'the asset grid renders the newest snapshot only');
assert.equal(assetState.hydrated, true, 'the newest request owns the assets hydration flag');
assert.deepEqual(assetState.settled, ['assets'], 'the settled handler runs once, for the newest request');
assert.deepEqual(await appliesFor(page, 'assets'), [['race-b']], 'only the newest response is applied');
note('free assets out-of-order success keeps the newest snapshot');

/* ---- 1b. A superseded failure never settles the newer pending request ------ */
await resetObservations(page);
await page.evaluate(() => { window.__CRABBIE_ASSETS_HYDRATED__ = false; });
await startRace(page, { key: 'assets', scope: 'assets', tables: ['free_assets'], times: 2 });
await waitForHolds(page, 'free_assets', 2);
await settleRequest(page, 'free_assets', 0, { data: null, error: { message: 'fixture superseded failure' } });
assert.equal(await awaitRequest(page, 'assets', 0), false, 'a failed hydration reports false');
const midRace = await page.evaluate(() => ({
  hydrated: window.__CRABBIE_ASSETS_HYDRATED__ === true,
  settled: window.__cmsRaceSettled.slice(),
  applies: window.__cmsRaceApplies.filter((entry) => entry.bridge === 'assets').length,
  previous: window.CrabbieAssets.getPrototype('race-b').title || ''
}));
assert.equal(midRace.hydrated, false, 'a superseded failure never marks the newer pending request hydrated');
assert.deepEqual(midRace.settled, [], 'the superseded finally never calls the public settled handler');
assert.equal(midRace.applies, 0, 'the superseded failure never applies');
assert.equal(midRace.previous, 'Race B Asset', 'the previous authoritative snapshot is left intact');
await settleRequest(page, 'free_assets', 1, { data: [raceAsset('race-b2', 'Race B2 Asset')], error: null });
assert.equal(await awaitRequest(page, 'assets', 1), true);
const settledAfter = await page.evaluate(() => ({
  hydrated: window.__CRABBIE_ASSETS_HYDRATED__ === true,
  settled: window.__cmsRaceSettled.slice(),
  newest: window.CrabbieAssets.getPrototype('race-b2').title || ''
}));
assert.equal(settledAfter.hydrated, true, 'the newest request owns settlement after a superseded failure');
assert.deepEqual(settledAfter.settled, ['assets'], 'settled fires exactly once, from the newest request');
assert.equal(settledAfter.newest, 'Race B2 Asset');
note('superseded free-assets failure never settles the newer request');

/* ---- 2. Portfolio: a slow older association fetch never revives the old ---- */
await resetObservations(page);
await startRace(page, { key: 'portfolio', scope: 'portfolio', tables: ['portfolio_projects', 'portfolio_project_people'], times: 2 });
await waitForHolds(page, 'portfolio_projects', 2);
assert.equal(await heldCount(page, 'portfolio_project_people'), 0, 'no association fetch starts before its own project list resolves');
await settleRequest(page, 'portfolio_projects', 1, { data: [raceProject('race-b', 'Race Project B')], error: null });
await waitForHolds(page, 'portfolio_project_people', 1);
// B reached its association fetch first, so link hold 0 is B's and hold 1 is A's.
await page.evaluate((person) => { window.__cmsRaceRows.people = [person]; }, racePerson());
await settleRequest(page, 'portfolio_project_people', 0, { data: [raceLink('race-b-id')], error: null });
assert.equal(await awaitRequest(page, 'portfolio', 1), true, 'the newest portfolio hydration applies');
let portfolioState = await page.evaluate(() => {
  const record = window.CrabbiePortfolio.getPrototype('race-b');
  return { title: record.title || '', credits: (record.people || []).length };
});
assert.equal(portfolioState.title, 'Race Project B');
assert.equal(portfolioState.credits, 1, 'the newest snapshot keeps its project association');
await settleRequest(page, 'portfolio_projects', 0, { data: [raceProject('race-a', 'Race Project A')], error: null });
await waitForHolds(page, 'portfolio_project_people', 2);
await settleRequest(page, 'portfolio_project_people', 1, { data: [raceLink('race-a-id')], error: null });
assert.equal(await awaitRequest(page, 'portfolio', 0), true, 'a superseded hydration still reports that its own fetch succeeded');
portfolioState = await page.evaluate(() => ({
  newest: window.CrabbiePortfolio.getPrototype('race-b').title || '',
  stale: window.CrabbiePortfolio.getPrototype('race-a').title || '',
  grid: Array.from(document.querySelectorAll('#pfGrid [data-project]')).map((el) => el.getAttribute('data-project')),
  applies: window.__cmsRaceApplies.filter((entry) => entry.bridge === 'portfolio').map((entry) => entry.rows)
}));
assert.equal(portfolioState.newest, 'Race Project B', 'the newest project snapshot stays public');
assert.equal(portfolioState.stale, '', 'the slow older association fetch never revives the superseded snapshot');
assert.deepEqual(portfolioState.grid, ['race-b'], 'the portfolio grid keeps the newest snapshot');
assert.deepEqual(portfolioState.applies, [['race-b']], 'the superseded snapshot is never applied');
note('slow older portfolio association fetch never wins');

/* ---- 3. Commissions: a superseded success never overwrites the newest ------ */
await page.evaluate(() => { location.hash = '#commissions'; });
await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'commissions');
await resetObservations(page);
await startRace(page, { key: 'commissions', scope: 'commissions', tables: ['commission_services', 'commission_forms'], times: 2 });
await waitForHolds(page, 'commission_services', 2);
await waitForHolds(page, 'commission_forms', 2);
// Each hydration issues its services/forms pair immediately: A owns index 0, B index 1.
await settleRequest(page, 'commission_services', 1, { data: [raceService('race-b', 'Race B Service')], error: null });
await settleRequest(page, 'commission_forms', 1, { data: [raceForm('race-b-form', 'Race B Form')], error: null });
assert.equal(await awaitRequest(page, 'commissions', 1), true, 'the newest commissions hydration applies');
assert.equal(await page.evaluate(() => window.CrabbieCommissions.getPrototype('race-b').title), 'Race B Service');
await settleRequest(page, 'commission_services', 0, { data: [raceService('race-a', 'Race A Service')], error: null });
await settleRequest(page, 'commission_forms', 0, { data: [raceForm('race-a-form', 'Race A Form')], error: null });
assert.equal(await awaitRequest(page, 'commissions', 0), true, 'a superseded hydration still reports that its own fetch succeeded');
const commissionState = await page.evaluate(() => ({
  newest: window.CrabbieCommissions.getPrototype('race-b').title || '',
  stale: window.CrabbieCommissions.getPrototype('race-a').title || '',
  applies: window.__cmsRaceApplies.filter((entry) => entry.bridge === 'commissions').map((entry) => entry.rows)
}));
assert.equal(commissionState.newest, 'Race B Service', 'the newest commission snapshot stays public');
assert.equal(commissionState.stale, '', 'a superseded commission response never overwrites the newest one');
assert.deepEqual(commissionState.applies, [['race-b']], 'the superseded commission response never applies');
note('superseded commissions response never overwrites the newest');

/* ---- 4. Site Content: apply and ready belong to the newest request --------- */
await resetObservations(page);
await page.evaluate(() => { window.__CRABBIE_SITE_CONTENT_HYDRATED__ = false; });
await startRace(page, { key: 'site', scope: 'settings', tables: ['cms_pages', 'cms_navigation', 'site_settings'], times: 2 });
await waitForHolds(page, 'cms_pages', 2);
await waitForHolds(page, 'cms_navigation', 2);
await waitForHolds(page, 'site_settings', 2);
// Each hydration issues its pages/navigation/settings trio immediately: A index 0, B index 1.
await settleRequest(page, 'cms_pages', 1, { data: [racePage('Race B Name')], error: null });
await settleRequest(page, 'cms_navigation', 1, { data: [raceNav('Race B Nav')], error: null });
await settleRequest(page, 'site_settings', 1, { data: [{ key: 'branding', value: { title: 'Race B Brand' } }], error: null });
assert.equal(await awaitRequest(page, 'site', 1), true, 'the newest site-content hydration applies');
let siteState = await page.evaluate(() => ({
  brand: document.querySelector('#mainNav .brand span').textContent,
  footer: document.querySelector('footer a[data-goto="home"]').textContent,
  ready: window.__cmsRaceReady.map((detail) => detail.ok),
  hydrated: window.__CRABBIE_SITE_CONTENT_HYDRATED__ === true
}));
assert.equal(siteState.brand, 'Race B Brand', 'the newest branding reaches the public nav');
assert.equal(siteState.footer, 'Race B Nav', 'the newest navigation reaches the footer');
assert.deepEqual(siteState.ready, [true], 'the newest hydration fires ready exactly once');
assert.equal(siteState.hydrated, true, 'the newest request owns the ready flag');
// A resolves later with one failing query: no apply, no second ready event.
await settleRequest(page, 'cms_pages', 0, { data: null, error: { message: 'fixture superseded page failure' } });
await settleRequest(page, 'cms_navigation', 0, { data: [raceNav('Race A Nav')], error: null });
await settleRequest(page, 'site_settings', 0, { data: [{ key: 'branding', value: { title: 'Race A Brand' } }], error: null });
assert.equal(await awaitRequest(page, 'site', 0), false, 'a superseded hydration with a failed query reports false');
siteState = await page.evaluate(() => ({
  brand: document.querySelector('#mainNav .brand span').textContent,
  footer: document.querySelector('footer a[data-goto="home"]').textContent,
  ready: window.__cmsRaceReady.map((detail) => detail.ok),
  applies: window.__cmsRaceApplies.filter((entry) => entry.bridge === 'siteContent').length
}));
assert.equal(siteState.brand, 'Race B Brand', 'a superseded site-content response never overwrites the newest one');
assert.equal(siteState.footer, 'Race B Nav', 'a superseded navigation response never overwrites the newest one');
assert.deepEqual(siteState.ready, [true], 'a superseded (even failing) hydration never fires the ready event again');
assert.equal(siteState.applies, 1, 'the superseded site-content response never publishes');
note('superseded site content never applies, settles or fires ready');

/* ---- 5. Startup deep links resolve on the latest (failing) hydration ------- */
const startupContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await startupContext.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/javascript', body: sdkFixture }));
// Both startup hydrations are held before any page script runs.
await startupContext.addInitScript(bootstrap, ['portfolio_projects', 'free_assets']);
const startupPage = await startupContext.newPage();
startupPage.setDefaultTimeout(10000);
startupPage.on('pageerror', (err) => errors.push(String((err && err.message) || err)));
await startupPage.goto(origin + '/#project/race-missing-project', { waitUntil: 'domcontentloaded' });
await startupPage.waitForFunction(() => window.__CRABBIE_SITE_CONTENT_HYDRATED__ === true);
await startupPage.evaluate(() => window.__cmsRaceInstallRecorders());
await startupPage.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'loading');
const startupPending = await startupPage.evaluate(() => ({
  hydrated: window.__CRABBIE_PORTFOLIO_HYDRATED__ === true,
  holds: (window.__cmsRace.holds.portfolio_projects || []).length
}));
assert.equal(startupPending.hydrated, false, 'a pending startup hydration keeps the deep link in its loading state');
assert.equal(startupPending.holds, 1, 'the startup portfolio hydration issued exactly one held query');
await startupPage.evaluate(() => window.__cmsRace.settle('portfolio_projects', 0, { data: null, error: { message: 'fixture startup failure' } }));
await startupPage.waitForFunction(() => window.__CRABBIE_PORTFOLIO_HYDRATED__ === true);
await startupPage.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === '404');
note('startup project deep link resolves on a failing latest hydration', 'real 404, no infinite loading');
await startupPage.evaluate(() => { location.hash = '#asset/race-missing-asset'; });
await startupPage.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'loading');
const assetsBefore = await startupPage.evaluate(() => document.querySelectorAll('#faGrid [data-asset]').length);
assert.ok(assetsBefore > 0, 'the prototype asset fallback is present while hydration is pending');
assert.equal(await startupPage.evaluate(() => window.__CRABBIE_ASSETS_HYDRATED__ === true), false, 'a pending startup asset hydration keeps the deep link loading');
await startupPage.evaluate(() => window.__cmsRace.settle('free_assets', 0, { data: null, error: { message: 'fixture startup failure' } }));
await startupPage.waitForFunction(() => window.__CRABBIE_ASSETS_HYDRATED__ === true);
await startupPage.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === '404');
const assetFallback = await startupPage.evaluate(() => ({
  grid: document.querySelectorAll('#faGrid [data-asset]').length,
  applies: window.__cmsRaceApplies.filter((entry) => entry.bridge === 'assets').length
}));
assert.equal(assetFallback.grid, assetsBefore, 'a failed latest hydration leaves the prototype asset fallback untouched');
assert.equal(assetFallback.applies, 0, 'a failed latest hydration never publishes an empty authoritative snapshot');
note('startup asset deep link resolves on a failing latest hydration', 'prototype fallback preserved');

/* ---- 6. A startup hydration superseded by an early refresh loses ---------- */
const raceContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await raceContext.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/javascript', body: sdkFixture }));
await raceContext.addInitScript(bootstrap, ['free_assets']);
const refreshPage = await raceContext.newPage();
refreshPage.setDefaultTimeout(10000);
refreshPage.on('pageerror', (err) => errors.push(String((err && err.message) || err)));
await refreshPage.goto(origin + '/', { waitUntil: 'load' });
await refreshPage.waitForFunction(() => window.__CRABBIE_SITE_CONTENT_HYDRATED__ === true
  && window.__CRABBIE_PORTFOLIO_HYDRATED__ === true
  && Boolean(window.CrabbiePeople && window.CrabbiePeople.settled === true));
await refreshPage.evaluate(() => window.__cmsRaceInstallRecorders());
await waitForHolds(refreshPage, 'free_assets', 1);
assert.equal(await refreshPage.evaluate(() => window.__CRABBIE_ASSETS_HYDRATED__ === true), false, 'the held startup asset hydration has not settled yet');
// Only the overlap itself is observed from here on.
await refreshPage.evaluate(() => { window.__cmsRaceApplies = []; window.__cmsRaceSettled = []; });
// The explicit CMS refresh becomes the newest owner while startup is pending.
await refreshPage.evaluate(async () => { await import('/src/public-cms-refresh.js'); });
await refreshPage.waitForFunction(() => Boolean(window.CrabbiePublicCmsRefresh && typeof window.CrabbiePublicCmsRefresh.refresh === 'function'));
await startRace(refreshPage, { key: 'assets', scope: 'assets', tables: ['free_assets'], times: 1 });
await waitForHolds(refreshPage, 'free_assets', 2);
await settleRequest(refreshPage, 'free_assets', 1, { data: [raceAsset('race-refresh', 'Race Refresh Asset')], error: null });
assert.equal(await awaitRequest(refreshPage, 'assets', 0), true, 'the explicit refresh applies');
let overlapState = await refreshPage.evaluate(() => ({
  newest: window.CrabbieAssets.getPrototype('race-refresh').title || '',
  hydrated: window.__CRABBIE_ASSETS_HYDRATED__ === true,
  settled: window.__cmsRaceSettled.slice()
}));
assert.equal(overlapState.newest, 'Race Refresh Asset');
assert.equal(overlapState.hydrated, true, 'the refresh owns settlement');
assert.deepEqual(overlapState.settled, ['assets'], 'the pending startup hydration does not settle the refresh request');
await settleRequest(refreshPage, 'free_assets', 0, { data: [raceAsset('race-startup', 'Race Startup Asset')], error: null });
overlapState = await refreshPage.evaluate(() => ({
  newest: window.CrabbieAssets.getPrototype('race-refresh').title || '',
  startup: window.CrabbieAssets.getPrototype('race-startup').title || '',
  applies: window.__cmsRaceApplies.filter((entry) => entry.bridge === 'assets').length
}));
assert.equal(overlapState.newest, 'Race Refresh Asset', 'the explicit refresh snapshot stays authoritative');
assert.equal(overlapState.startup, '', 'the superseded startup hydration never overwrites the refresh');
assert.equal(overlapState.applies, 1, 'the superseded startup response never applies');
note('startup hydration superseded by an early refresh keeps the refresh');
await raceContext.close();

assert.deepEqual(errors, [], 'no uncaught page errors during any race');
await context.close();
await startupContext.close();
await browser.close();
server.close();
console.log(`\nPUBLIC CMS RACE COMPLETE (${browserName}): ${summary.length} checks passed`);
