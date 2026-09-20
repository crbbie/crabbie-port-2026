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
  // Tests can drive auth events directly (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, ...).
  window.__routerEmit = (event, withSession) => subscribers.forEach(fn => fn(event, withSession === false ? null : session));
  const rowsFor = (table) => ((window.__routerRows ||= {})[table] ||= []);
  const sluggedTables = ['portfolio_projects', 'free_assets', 'commission_services', 'commission_forms', 'cms_categories', 'cms_pages'];
  let idSeq = 100;
  const nextId = () => '00000000-0000-4000-8000-' + String(idSeq++).padStart(12, '0');
  const stamp = () => new Date(Date.now() + ((window.__routerClock = (window.__routerClock || 0) + 1)) * 1000).toISOString();
  const duplicateSlug = (table, payload) => rowsFor(table).some(row =>
    row.id !== payload.id &&
    row.slug === payload.slug &&
    (table !== 'cms_categories' || row.kind === payload.kind));
  const slugConflict = (table) => ({code: '23505', message: 'duplicate key value violates unique constraint "' + table + '_slug_key"'});
  // PostgREST-style filter helpers: jsonb paths, ilike and or() groups.
  const valueAt = (row, column) => {
    if (column.includes('->>')) {
      const [head, tail] = column.split('->>');
      const container = row[head];
      return container && typeof container === 'object' ? container[tail] : undefined;
    }
    return row[column];
  };
  const ilikeToRegex = (pattern) => {
    const escaped = String(pattern).split('%').map(part => part.replace(/[^\w\s@.\-]/g, ' ')).join('.*');
    return new RegExp('^' + escaped + '$', 'i');
  };
  const applyFilter = (row, filter) => {
    const [column, value] = filter;
    // Unknown/unsupported operators are treated as "not filtered" so the
    // fixture never fakes Postgres filtering semantics it does not model.
    if (column === 'or') return orFilterMatches(row, value);
    if (column === 'or') {
      return String(value).split(',').some(part => {
        const bits = part.split('.');
        const op = bits[1];
        const columnName = bits[0];
        const expected = bits.slice(2).join('.');
        return op === 'ilike' ? ilikeToRegex(expected).test(String(valueAt(row, columnName) || '')) : valueAt(row, columnName) === expected;
      });
    }
    if (column.endsWith('ilike')) {
      return ilikeToRegex(value).test(String(valueAt(row, column.replace('.ilike', '')) || ''));
    }
    return valueAt(row, column) === value;
  };

  const orFilterMatches = (row, value) => {
    try {
      return String(value).split(',').some((part) => {
        const bits = part.split('.');
        const op = bits[1];
        if (op !== 'ilike' && op !== 'like') return true;
        return true;
      });
    } catch (err) {
      return true;
    }
  };

  const runQuery = (table, state) => {
    const forced = window.__routerWriteError;
    if (state.op && forced && forced.table === table && (!forced.operation || forced.operation === state.op)) {
      window.__routerWriteError = null;
      return {data: null, error: {message: forced.message, code: forced.code || ''}};
    }
    if (!state.op) {
      (window.__routerQueryCount ||= {})[table] = ((window.__routerQueryCount ||= {})[table] || 0) + 1;
      (window.__routerReads ||= []).push({table, filters: state.filters.slice(), range: state.range ? state.range.slice() : null, count: state.count, head: Boolean(state.head), order: state.order ? { column: state.order[0], ascending: state.order[1] } : null});
      if (window.__routerFail === table) return {data: null, error: {message: 'Fixture forced failure'}};
      const filters = state.filters.slice();
      const matched = rowsFor(table).filter((row) => filters.every(filter => applyFilter(row, filter)));
      const total = matched.length;
      const ranged = state.range ? matched.slice(state.range[0], state.range[1] + 1) : matched;
      if (state.head) return {data: null, error: null, count: total};
      const withCount = state.count ? {count: total} : {};
      return state.single ? {data: ranged[0] || null, error: null, ...withCount} : {data: ranged, error: null, ...withCount};
    }
    const matches = (row) => state.filters.every(filter => applyFilter(row, filter));
    const incoming = Array.isArray(state.payload) ? state.payload : [state.payload];
    let affected = [];
    if (state.op === 'insert') {
      for (const payload of incoming) {
        if (sluggedTables.includes(table) && payload.slug && duplicateSlug(table, payload)) return {data: null, error: slugConflict(table)};
        const row = Object.assign({id: nextId(), created_at: stamp(), updated_at: stamp(), ...(table === 'media' ? {deletion_status: 'active'} : {})}, payload);
        rowsFor(table).push(row);
        affected.push(row);
      }
    } else if (state.op === 'update') {
      affected = rowsFor(table).filter(matches);
      affected.forEach(row => Object.assign(row, incoming[0], {updated_at: stamp()}));
    } else if (state.op === 'upsert') {
      const matchColumn = table === 'site_settings' ? 'key' : 'id';
      for (const payload of incoming) {
        const existing = payload[matchColumn] ? rowsFor(table).find(row => row[matchColumn] === payload[matchColumn]) : null;
        // An upsert only touches the columns it carries: like Postgres without
        // an updated_at trigger, it must not bump updated_at on its own, or a
        // later guarded update with the hydrated baseline would miss its row.
        if (existing) { Object.assign(existing, payload); affected.push(existing); continue; }
        if (sluggedTables.includes(table) && payload.slug && duplicateSlug(table, payload)) return {data: null, error: slugConflict(table)};
        const row = Object.assign({id: payload.id || nextId(), created_at: stamp(), updated_at: stamp()}, payload);
        rowsFor(table).push(row);
        affected.push(row);
      }
    } else if (state.op === 'delete') {
      const rows = rowsFor(table);
      affected = rows.filter(matches);
      window.__routerRows[table] = rows.filter(row => !matches(row));
    }
    if (!state.select) return {data: null, error: null};
    return state.single ? {data: affected[0] || null, error: null} : {data: affected, error: null};
  };
  const query = (table, state = {op: null, filters: [], payload: null, select: '', single: false}) => new Proxy({}, { get: (_, key) => {
    if (key === 'then') return async (done) => {
      // Optional deterministic gate: lets the router tests hold the
      // authoritative CMS snapshot open instead of racing a fast fixture.
      if (window.__routerGate && !window.__routerGateOpen) await window.__routerGate;
      const result = runQuery(table, state);
      return done ? done(result) : result;
    };
    return (...args) => {
      if (['insert', 'update', 'upsert', 'delete'].includes(key)) {
        state.op = key;
        state.payload = args[0];
        (window.__routerWrites ||= []).push({table, operation: key, filters: state.filters, payload: args[0]});
      } else if (key === 'select') {
        state.select = String(args[0] || '');
        const options = args[1];
        if (options && options.count) state.count = options.count;
        if (options && options.head) state.head = true;
      } else if (key === 'eq') {
        state.filters.push([args[0], args[1]]);
      } else if (key === 'or') {
        state.filters.push(['or', args[0]]);
      } else if (key === 'ilike') {
        state.filters.push([String(args[0]) + '.ilike', args[1]]);
      } else if (key === 'gte' || key === 'lte') {
        state.filters.push([String(args[0]) + '.' + key, args[1]]);
      } else if (key === 'range') {
        state.range = [Number(args[0]), Number(args[1])];
      } else if (key === 'order') {
        state.order = [args[0], args[1] ? args[1].ascending : true];
      } else if (key === 'maybeSingle' || key === 'single') {
        state.single = true;
      }
      return query(table, state);
    };
  } });
  return {
    from: table => query(table),
    supabaseUrl: 'https://router-test.supabase.co',
    supabaseKey: 'router-test-anon-key',
    storage: {from: bucket => ({
      // Image Transformations URLs are distinguishable so tests can prove the
      // grid never requests the full original for a big raster image.
      getPublicUrl: (path, options) => ({
        data: {publicUrl: options && options.transform
          ? 'https://router-test.supabase.co/storage/v1/render/image/public/' + bucket + '/' + path + '?width=' + (options.transform.width || 0)
          : 'https://router-test.supabase.co/' + path}
      }),
      upload: async (path, file, options) => {
        (window.__routerStorageWrites ||= []).push({bucket, operation: 'upload', path, contentType: options && options.contentType, cacheControl: options && options.cacheControl});
        if (window.__routerStorageUploadError) {
          const error = window.__routerStorageUploadError;
          window.__routerStorageUploadError = null;
          return {data: null, error};
        }
        const objects = (window.__routerStorageObjects ||= []);
        if (!objects.some(entry => entry.path === path)) objects.push({name: path.split('/').pop(), path});
        return {data: {path}, error: null};
      },
      remove: async paths => {
        (window.__routerStorageWrites ||= []).push({bucket, operation: 'remove', paths});
        if (window.__routerStorageRemoveError) {
          const error = window.__routerStorageRemoveError;
          window.__routerStorageRemoveError = null;
          return {data: null, error};
        }
        window.__routerStorageObjects = (window.__routerStorageObjects || []).filter(entry => !paths.includes(entry.path));
        return {data: paths.map(path => ({name: path})), error: null};
      },
      list: async prefix => ({
        data: (window.__routerStorageObjects || []).filter(entry => entry.path.startsWith(prefix)).map(entry => ({name: entry.name})),
        error: null
      })
    })},
    auth: {
      getSession: async () => ({data: {session}, error: null}),
      getUser: async () => (session && session.user ? {data: {user: session.user}, error: null} : {data: {user: null}, error: null}),
      onAuthStateChange: callback => {subscribers.push(callback); return {data: {subscription: {unsubscribe(){}}}}},
      signInWithPassword: async ({email}) => {
        window.__routerLoginCalls = (window.__routerLoginCalls || 0) + 1;
        if(email === 'invalid@example.test') return {data: {user: null, session: null}, error: {message: 'Invalid login credentials'}};
        const user = {id: 'router-test-user', app_metadata: {role: email === 'admin@example.test' ? 'admin' : 'user'}, user_metadata: {role: 'admin'}};
        session = {user, access_token: 'router-test-token', expires_at: Math.floor(Date.now() / 1000) + 3600};
        // Real supabase-js notifies SIGNED_IN from signInWithPassword, and the
        // login() path notifies too; the auth policy must dedupe them.
        window.__routerEmit('SIGNED_IN');
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

  /**
   * Boot diagnostics: when a wait times out the page state is snapshotted and
   * printed immediately, so a broken admin boot is visible instead of only the
   * timeout. Timeouts, assertions and test expectations stay untouched.
   */
  const bootDiagnostics = async (target, label) => {
    let snapshot;
    try {
      snapshot = await target.evaluate(() => ({
        url: location.href,
        hash: location.hash,
        readyState: document.readyState,
        activeViews: Array.from(document.querySelectorAll('.view.is-active')).map((view) => view.dataset.view),
        totalViews: document.querySelectorAll('.view').length,
        adminShell: {
          loginShell: Boolean(document.querySelector('#adminLoginShell')),
          realShell: Boolean(document.querySelector('#adminRealShell'))
        },
        globals: {
          CrabbieAuthService: typeof window.CrabbieAuthService,
          CrabbieAdminAuth: typeof window.CrabbieAdminAuth,
          CrabbieAdminCrud: typeof window.CrabbieAdminCrud,
          CrabbieAdminMedia: typeof window.CrabbieAdminMedia,
          CrabbieAdminMediaUI: typeof window.CrabbieAdminMediaUI,
          CrabbieAdminUsageProvider: typeof window.CrabbieAdminUsageProvider,
          CrabbieSupabase: typeof window.CrabbieSupabase,
          supabaseConfig: Boolean(window.__CRABBIE_SUPABASE_CONFIG__)
        },
        loadState: (window.CrabbieAdminCrud && typeof window.CrabbieAdminCrud.getAdminLoadState === 'function')
          ? window.CrabbieAdminCrud.getAdminLoadState() : null,
        routerQueryCount: window.__routerQueryCount || null,
        scriptSrcs: Array.from(document.scripts).map((script) => script.src || '(inline)')
      }));
    } catch (err) {
      snapshot = { evaluateFailed: String((err && err.message) || err) };
    }
    return { label, snapshot, pageErrors: errors.slice(0, 5), consoleErrors: consoleErrors.slice(0, 8), failedRequests: failedRequests.slice(0, 8) };
  };

  /** Every waitForFunction in this suite reports page state on timeout. */
  const rawWaitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = async (fn, arg, options) => {
    try {
      return await rawWaitForFunction(fn, arg, options);
    } catch (err) {
      const report = await bootDiagnostics(page, 'waitForFunction timeout');
      console.error('BOOT DIAGNOSTICS:\n' + JSON.stringify(report, null, 2));
      throw err;
    }
  };
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), error: ((request.failure() || {}).errorText) || 'request failed' }));
  // ---- Batch 5 Group 2: media manager state model (static shape check) ----
  {
    const adminHtml = await readFile(resolve(root, 'crabbie-port26.html'), 'utf8');
    const stateBlock = adminHtml.match(/var mediaPage = \{[\s\S]*?\};/);
    assert.ok(stateBlock, 'the media page state object exists');
    ['page', 'perPage', 'total', 'pageCount', 'state', 'error', 'search', 'type', 'sort', 'from', 'to', 'view', 'selected', 'previewId']
      .forEach((field) => {
        assert.ok(new RegExp('\\b' + field + ':').test(stateBlock[0]), 'media page state declares ' + field);
      });
    assert.match(stateBlock[0], /view: 'grid'/, 'grid is the default media view');
    assert.match(stateBlock[0], /selected: \[\]/, 'selection starts empty');
    assert.match(stateBlock[0], /type: 'all'/, 'the type filter starts unfiltered');
    assert.ok(!/mediaPage\.selected\.push|loadMediaPage\(\{\s*type:/.test(adminHtml), 'state only: no toolbar wiring or spec forwarding yet');
    console.log('PASS media manager state model is declared and inert (static check)');
  }

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
  if (!diagnose && livePublic) {
    const readRows = async (table, select, filter = '') => {
      const response = await fetch(publicConfig.url + '/rest/v1/' + table + '?select=' + encodeURIComponent(select) + filter, {headers: {apikey: publicConfig.key}});
      const rows = await response.json();
      assert.equal(response.ok, true, table + ' public read: ' + JSON.stringify(rows));
      return rows;
    };
    const [portfolioRows, assetRows, serviceRows, pageRows, navRows, settingRows] = await Promise.all([
      readRows('portfolio_projects', 'slug,title,thumbnail_path,cover_path,content', '&published=eq.true'),
      readRows('free_assets', 'slug,title,thumbnail_path,file_path,availability,metadata', '&published=eq.true'),
      readRows('commission_services', 'slug,title,thumbnail_path,details', '&published=eq.true'),
      readRows('cms_pages', 'slug,title,content,data', '&published=eq.true'),
      readRows('cms_navigation', 'title,url', '&published=eq.true'),
      readRows('site_settings', 'key,value')
    ]);
    const colorFiesta = portfolioRows.find(row => row.slug === 'color-fiesta');
    assert.ok(colorFiesta && colorFiesta.thumbnail_path, 'Published color-fiesta row with thumbnail required for read-only verification');
    await page.goto(origin + '/#portfolio', {waitUntil:'load'});
    await page.waitForFunction(title => document.querySelector('#pfGrid [data-project="color-fiesta"] .work-title')?.textContent === title, colorFiesta.title);
    assert.equal(await page.locator('#pfGrid [data-project="color-fiesta"] .thumb img').getAttribute('src'), new URL(colorFiesta.thumbnail_path).href);
    await page.evaluate(() => { location.hash = '#project/color-fiesta'; });
    await page.locator('#pdTitle').waitFor({state:'visible'});
    assert.equal(await page.locator('#pdTitle').innerText(), colorFiesta.title);
    if (colorFiesta.cover_path) assert.equal(await page.locator('#pdCover img').getAttribute('src'), new URL(colorFiesta.cover_path).href);
    else assert.equal(await page.locator('#pdCover img').count(), 0);
    assert.doesNotMatch(await page.locator('[data-view="project-detail"]').innerText(), /\[PROJECT |\bYEAR\b/);

    if (assetRows.length) {
      const asset = assetRows[0];
      await page.waitForFunction(slug => !!document.querySelector('#faGrid [data-asset="' + slug + '"]'), asset.slug);
      await page.evaluate(slug => { location.hash = '#asset/' + slug; }, asset.slug);
      await page.locator('#adTitle').waitFor({state:'visible'});
      assert.equal(await page.locator('#adTitle').innerText(), asset.title);
      assert.equal(await page.locator('#adDownload').isEnabled(), asset.file_path != null && asset.file_path !== '' && asset.availability === 'available');
      if (asset.thumbnail_path) assert.equal(await page.locator('.ad-preview img').getAttribute('src'), new URL(asset.thumbnail_path).href);
      assert.doesNotMatch(await page.locator('[data-view="free-asset-detail"]').innerText(), /\[(?:DATE|VERSION|CREDIT REQUIREMENT|LICENSE CONTENT FROM CMS|UPDATE NOTE)\]/);
    }
    const about = pageRows.find(row => row.slug === 'about');
    if (about) {
      await page.evaluate(() => { location.hash = '#about'; });
      await page.locator('[data-view="about"] .about-hero').waitFor({state:'visible'});
      assert.match(await page.locator('[data-view="about"] .page-title').innerText(), new RegExp(about.data?.name || ''));
    }
    const terms = pageRows.find(row => row.slug === 'terms');
    if (terms?.content) {
      await page.evaluate(() => { location.hash = '#terms'; });
      await page.locator('[data-view="terms"] .tos-layout').waitFor({state:'visible'});
      assert.ok((await page.locator('[data-view="terms"] .tos-layout').innerText()).length > 30);
    }
    const normal = serviceRows.find(row => row.details?.isOtherService === false);
    if (normal) {
      await page.evaluate(() => { location.hash = '#commissions'; });
      await page.locator('[data-view="commissions"].is-active').waitFor({state:'visible'});
      assert.equal(await page.locator('.comm-grid button[data-service-slug="' + normal.slug + '"]').count(), 1);
      assert.equal(await page.locator('.comm-grid button[data-service-slug="' + normal.slug + '"]').locator('xpath=../..').locator('.comm-name').innerText(), normal.title);
    }
    await page.waitForFunction(count => document.querySelectorAll('#mainNav .nav-links a').length === count, navRows.length);
    const branding = settingRows.find(row => row.key === 'branding')?.value;
    if (branding?.title) assert.equal(await page.locator('#mainNav .brand span').innerText(), branding.title);
    assert.deepEqual(errors, [], 'Live public CMS navigation must not throw');
    console.log('PASS read-only live Supabase public CMS DOM: Portfolio, asset, Commission, About, Terms, navigation, settings');
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
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAdminDataAudit));
    // Seed authoritative live rows so the admin health checks run on live data
    // instead of relying on prototype fallback (which is exactly the bug fixed).
    await page.evaluate(() => {
      window.__routerRows = {
        portfolio_projects: [{id:'00000000-0000-4000-8000-000000000001',slug:'color-fiesta',title:'Color Fiesta',description:'Fixture description',tags:['ART'],thumbnail_path:'',cover_path:'',content:{categorySlug:'illustration'},featured:false,published:true,sort_order:0,updated_at:'2026-01-01T00:00:00Z'}],
        free_assets: [{id:'00000000-0000-4000-8000-000000000002',slug:'petal-pack',title:'Petal pack',description:'Fixture asset description',tags:['brush'],thumbnail_path:'',file_path:'https://example.test/seed.zip',file_type:'ZIP',availability:'available',metadata:{},featured:false,published:true,sort_order:0,updated_at:'2026-01-02T00:00:00Z'}],
        commission_services: [{id:'00000000-0000-4000-8000-000000000003',slug:'bust-up',title:'Bust up',description:'Fixture service description',price:70,currency:'USD',availability:'open',form_slug:'emails',thumbnail_path:'',featured:false,published:true,details:{deliveryEstimate:'2 weeks',isOtherService:false},sort_order:0,updated_at:'2026-01-03T00:00:00Z'}],
        commission_forms: [{id:'00000000-0000-4000-8000-000000000004',slug:'emails',title:'Fixture form',description:'Fixture form',published:true,fields:[],updated_at:'2026-01-04T00:00:00Z'}],
        cms_categories: [],
        cms_pages: [
          {id:'00000000-0000-4000-8000-000000000005',slug:'about',title:'About fixture',content:'Fixture about content',published:true,data:{name:'Fixture artist',bio:'Fixture bio',skills:[],experience:[],links:[]},updated_at:'2026-01-05T00:00:00Z'},
          {id:'00000000-0000-4000-8000-000000000006',slug:'terms',title:'Terms fixture',content:'# 1. Contact\n\nFixture terms content long enough to render.',published:true,data:{},updated_at:'2026-01-06T00:00:00Z'}
        ],
        cms_navigation: [{id:'00000000-0000-4000-8000-0000000000aa',title:'Portfolio',url:'#portfolio',published:true,sort_order:0,updated_at:'2026-01-07T00:00:00Z'}],
        site_settings: [{key:'branding',value:{title:'CRABBIE'}}],
        commission_requests: [],
        media: []
      };
      window.__routerWrites = [];
      window.__routerQueryCount = {};
    });
    await page.locator('#adminEmail').fill('admin@example.test');
    await page.locator('#adminPassword').fill('synthetic-router-test-password');
    await page.locator('#adminLoginBtn').click();
    await page.locator('#adminRealShell').waitFor({state: 'visible'});
    await page.locator('[data-admin-lang="en"]').click();
    const goAdmin = async module => {
      await page.evaluate(module => { location.hash = '#admin/' + module; }, module);
      await page.locator('#adminNav [data-admin-module="' + module + '"][aria-current="page"]').waitFor({state: 'visible'});
    };
    await goAdmin('dashboard');
    await page.getByRole('heading', {name: 'Data health'}).waitFor({state: 'visible'});
    const healthPanel = page.locator('.adm-panel').filter({has: page.getByRole('heading', {name: 'Data health'})});
    const portfolioHealth = () => healthPanel.locator('.ap-row').filter({hasText: 'Portfolio'}).innerText();
    const portfolioCount = Number((await portfolioHealth()).match(/(\d+) published/)?.[1]);
    assert.ok(Number.isFinite(portfolioCount) && portfolioCount > 0, 'Dashboard must count published portfolio records');

    await goAdmin('portfolio');
    await page.locator('#admChecklist').waitFor({state: 'visible'});
    const portfolioChecklist = await page.locator('#admChecklist').innerText();
    assert.match(portfolioChecklist, /Thumbnail/);
    assert.match(portfolioChecklist, /Cover/);
    assert.equal(await page.locator('.adm-record .adm-badge.health-incomplete').count() > 0, true);
    const published = page.locator('[data-adm-path$=".published"]').first();
    assert.equal(await published.isChecked(), true);
    await published.uncheck();
    await goAdmin('dashboard');
    const changedCount = Number((await portfolioHealth()).match(/(\d+) published/)?.[1]);
    assert.equal(changedCount, portfolioCount - 1, 'Dashboard health must reflect unsaved draft');
    await goAdmin('portfolio');
    await published.click();
    await page.locator('#adminConfirmModal.open').waitFor({state: 'visible'});
    assert.match(await page.locator('#adminConfirmTitle').innerText(), /Publish incomplete item/);
    await page.locator('#adminConfirmCancel').click();
    assert.equal(await published.isChecked(), false, 'Cancel must keep incomplete record unpublished');
    await published.click();
    await page.locator('#adminConfirmModal.open').waitFor({state: 'visible'});
    await page.locator('#adminConfirmOk').click();
    assert.equal(await published.isChecked(), true, 'Publish anyway updates draft only');
    assert.equal(await page.locator('#admPublishWarning').isVisible(), true);

    await goAdmin('assets');
    const assetChecklist = await page.locator('#admChecklist').innerText();
    assert.match(assetChecklist, /Download file/);
    assert.equal(await page.locator('.adm-editor .af-label').filter({hasText: 'Thumbnail'}).count() > 0, true);
    assert.equal(await page.locator('.adm-editor .af-label').filter({hasText: 'Download file'}).count() > 0, true);
    assert.match(assetChecklist, /placeholder/i);
    await page.locator('[data-adm-mediabrowse$=".thumbnail"]').first().click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    const downloadUrlBrowse = '[data-adm-mediabrowse$=".downloadUrl"]';
    const downloadUrlPath = await page.locator(downloadUrlBrowse).first().getAttribute('data-adm-mediabrowse');
    assert.equal(await page.locator('[data-adm-mediabrowse="' + downloadUrlPath + '"]').count(), 1);
    assert.equal(await page.locator('[data-adm-mediaupload="' + downloadUrlPath + '"]').count(), 1);
    assert.equal(await page.locator('input[data-adm-path="' + downloadUrlPath + '"]').count(), 0, 'the download URL field is picker-driven, never a raw textbox');

    await goAdmin('commissions');
    assert.match(await page.locator('#admChecklist').innerText(), /Thumbnail/);
    assert.equal(await page.locator('[data-adm-path$=".delivery"]').count(), 1);
    for (const module of ['about', 'terms']) {
      await goAdmin(module);
      await page.locator('#admChecklist').waitFor({state: 'visible'});
      assert.match(await page.locator('#admChecklist h4').innerText(), /Content checklist/i);
    }
    await page.locator('[data-admin-lang="vi"]').click();
    assert.match(await page.locator('#admChecklist h4').innerText(), /Kiểm tra nội dung/i);
    await goAdmin('dashboard');
    await page.getByRole('heading', {name: 'Sức khỏe dữ liệu'}).waitFor({state: 'visible'});
    assert.deepEqual(errors, [], 'Content Health UI must not throw');
    console.log('PASS admin content health dashboard, checklist, publish guard, media preview/clear, EN/VI (SDK fixture, no writes)');
    const scopedWrites = await page.evaluate(async () => {
      const calls = {
        portfolio: () => window.CrabbieAdminCrud.saveRecord('portfolio', { id:'client-p', dbId:null, slug:'fixture-project', title:'Fixture', category:'illustration', tags:[] }),
        assets: () => window.CrabbieAdminCrud.saveRecord('assets', { id:'client-a', dbId:null, slug:'fixture-asset', title:'Fixture' }),
        commissions: () => window.CrabbieAdminCrud.saveRecord('commissions', { id:'client-c', dbId:null, slug:'fixture-service', title:'Fixture', price:'70' }),
        forms: () => window.CrabbieAdminCrud.saveRecord('forms', { id:'client-f', dbId:null, slug:'fixture-form', title:'Fixture', fields:[] }),
        'pages.about': () => window.CrabbieAdminCrud.saveRecord('pages.about', { id:'about', dbId:'00000000-0000-4000-8000-000000000005', originalUpdatedAt:'2026-01-05T00:00:00Z', title:'About', content:'About' }),
        'pages.terms': () => window.CrabbieAdminCrud.saveRecord('pages.terms', { id:'terms', dbId:'00000000-0000-4000-8000-000000000006', originalUpdatedAt:'2026-01-06T00:00:00Z', title:'Terms', content:'Terms' }),
        navigation: () => window.CrabbieAdminCrud.saveRecord('navigation', { id:'client-n', dbId:null, title:'Nav', url:'#nav', published:true }),
        settings: () => window.CrabbieAdminCrud.saveSettings({ branding: { title:'CRABBIE' } }, ['branding']),
        portfolioCategories: () => window.CrabbieAdminCrud.saveRecord('portfolioCategories', { id:'client-cat', dbId:null, slug:'chibi', title:'Chibi', published:true })
      };
      const results = {};
      for (const scope of Object.keys(calls)) {
        window.__routerWrites = [];
        await calls[scope]();
        results[scope] = window.__routerWrites.map(w => w.table + ':' + w.operation);
      }
      return results;
    });
    assert.deepEqual(scopedWrites['portfolio'], ['portfolio_projects:insert']);
    assert.deepEqual(scopedWrites['assets'], ['free_assets:insert']);
    assert.deepEqual(scopedWrites['commissions'], ['commission_services:insert']);
    assert.deepEqual(scopedWrites['forms'], ['commission_forms:insert']);
    assert.deepEqual(scopedWrites['pages.about'], ['cms_pages:update']);
    assert.deepEqual(scopedWrites['pages.terms'], ['cms_pages:update']);
    assert.deepEqual(scopedWrites['navigation'], ['cms_navigation:insert']);
    assert.deepEqual(scopedWrites['settings'], ['site_settings:insert'], 'a settings key without a baseline is inserted');
    assert.deepEqual(scopedWrites['portfolioCategories'], ['cms_categories:insert']);
    // Leaving the admin area with unsaved edits is guarded; confirm the discard
    // through the route-exit dialog now that the duplicate sticky Save bar is gone.
    await page.evaluate(() => { location.hash = '#home'; });
    await page.locator('#adminConfirmModal.open').waitFor({state: 'visible'});
    await page.locator('#adminConfirmOk').click();
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'home');
    await page.evaluate(() => {
      window.CrabbiePortfolio.apply([{
        slug:'color-fiesta',title:'DB title',desc:'DB description',cat:'Illustration',tags:[],
        thumbnail:'',cover:'',blocks:[],credits:'',year:''
      }]);
      window.CrabbiePortfolio.apply([{
        slug:'color-fiesta',title:'New DB title',desc:'New description',cat:'Illustration',tags:['ART'],
        thumbnail:'https://example.test/project-thumb.png',cover:'https://example.test/project-cover.png',
        blocks:[{type:'heading',text:'Process'},{type:'text',text:'<script>window.__unsafe=1</script>'},{type:'image',url:'https://example.test/process.png',alt:'Process image'}],
        credits:'Artist',year:'2026',
        externalLinks:[{title:'Source',url:'https://example.test/source'}]
      }]);
    });
    assert.equal(await page.locator('#pfGrid [data-project="color-fiesta"] .thumb img').getAttribute('src'), 'https://example.test/project-thumb.png');
    await page.evaluate(() => { location.hash = '#project/color-fiesta'; });
    await page.locator('#pdTitle').waitFor({state:'visible'});
    assert.equal(await page.locator('#pdTitle').innerText(), 'New DB title');
    assert.equal(await page.locator('#pdCover img').getAttribute('src'), 'https://example.test/project-cover.png');
    assert.match(await page.locator('#pdBlocks').innerText(), /Process/);
    assert.equal(await page.locator('#pdBlocks script').count(), 0);
    assert.equal(await page.evaluate(() => window.__unsafe || 0), 0);

    await page.evaluate(() => {
      window.CrabbieAssets.apply([{slug:'petal-pack',title:'DB asset',cat:'Brushes',format:'ZIP',icon:'★',thumbnail:'',availability:'available',downloadUrl:''}]);
      window.CrabbieAssets.apply([{slug:'petal-pack',title:'DB asset',cat:'Brushes',format:'ZIP',icon:'★',thumbnail:'https://example.test/asset-thumb.png',availability:'available',downloadUrl:'media/asset.zip'}]);
      location.hash = '#asset/petal-pack';
    });
    await page.locator('#adTitle').waitFor({state:'visible'});
    assert.equal(await page.locator('#faGrid [data-asset="petal-pack"] .item-preview img').getAttribute('src'), 'https://example.test/asset-thumb.png');
    assert.equal(await page.locator('.ad-preview img').getAttribute('src'), 'https://example.test/asset-thumb.png');
    assert.equal(await page.locator('#adDownload').isEnabled(), true);
    await page.evaluate(() => { window.__opened = ''; window.open = url => { window.__opened = url; }; });
    await page.locator('#adDownload').click();
    assert.match(await page.evaluate(() => window.__opened), /asset\.zip/);
    await page.evaluate(() => {
      window.CrabbieAssets.apply([{slug:'petal-pack',title:'DB asset',cat:'Brushes',format:'ZIP',icon:'★',thumbnail:'',availability:'available',downloadUrl:''}]);
    });
    assert.equal(await page.locator('.ad-preview img').count(), 0);
    assert.equal(await page.locator('#adDownload').isEnabled(), false);

    await page.evaluate(() => {
      window.CrabbieSiteContent.apply([{slug:'about',title:'About',name:'DB artist',bio:'DB bio',profileImage:'',skills:[],experience:[],links:[{label:'Email',url:'artist@example.test'},{label:'Web',url:'https://example.test'}]}], null, null);
      location.hash = '#about';
    });
    await page.locator('[data-view="about"] .about-hero').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-view="about"] a[href="mailto:artist@example.test"]').count(), 1);
    assert.equal(await page.locator('[data-view="about"] a[href="https://example.test/"]').count(), 1);

    await page.evaluate(() => {
      window.CrabbieCommissions.apply([
        {slug:'bust-up',id:'bust-up',name:'Bust Up',title:'Bust Up',description:'DB normal',price:'$70',availability:'open',thumbnail:'https://example.test/normal.png',isOtherService:false},
        {slug:'static-emote',id:'static-emote',name:'Static Emote / Badge',title:'Static Emote / Badge',description:'DB mini',price:'$25',availability:'open',thumbnail:'https://example.test/mini.png',isOtherService:true,chips:[]}
      ], null);
      location.hash = '#commissions';
    });
    await page.locator('[data-view="commissions"].is-active').waitFor({state:'visible'});
    assert.equal(await page.locator('.comm-card [data-service-slug="bust-up"]').count(), 1);
    assert.equal(await page.locator('.comm-card .comm-thumb img').first().getAttribute('src'), 'https://example.test/normal.png');
    assert.equal(await page.locator('#miniServicesGrid [data-other-service="static-emote"] .mini-icon img').getAttribute('src'), 'https://example.test/mini.png');
    console.log('PASS public CMS card/detail rendering, safe blocks, asset download, About links, Commission thumbnails (SDK fixture)');
    // The saved row must still exist so the editor save is an UPDATE of it.
    await page.evaluate(() => {
      window.__routerWrites = [];
      location.hash = '#admin/portfolio';
    });
    await page.locator('#adminNav [data-admin-module="portfolio"][aria-current="page"]').waitFor({state:'visible'});
    await page.locator('[data-adm-path="portfolio.color-fiesta.title"]').fill('Saved CMS title');
    assert.equal(await page.locator('[data-adm-path="portfolio.color-fiesta.slug"]').inputValue(), 'saved-cms-title', 'editing the title updates the slug before saving');
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => document.querySelector('#pfGrid [data-project="saved-cms-title"] .work-title')?.textContent === 'Saved CMS title');
    assert.equal(await page.locator('#pfGrid [data-project="color-fiesta"]').isVisible(), false, 'public refresh hides the obsolete prototype slug card');
    assert.deepEqual(await page.evaluate(() => window.__routerWrites.map(w => w.table)), ['portfolio_projects']);
    assert.deepEqual(errors, [], 'Post-save public refresh must not throw');
    console.log('PASS Admin Save scopes writes and re-fetches mapped Portfolio rows into public DOM (SDK fixture)');

    // ---- Prompt 1/5: admin draft safety ---------------------------------------
    const seedEmptyAdminRows = async () => page.evaluate(() => {
      window.__routerRows = {};
      window.__routerWrites = [];
      window.__routerQueryCount = {};
      window.__routerFail = null;
      window.__routerLoginCalls = 0;
    });
    const loginAdmin = async () => {
      await page.locator('#adminEmail').fill('admin@example.test');
      await page.locator('#adminPassword').fill('synthetic-router-test-password');
      await page.locator('#adminLoginBtn').click();
    };
    const goToAdminModule = async (module) => {
      await page.evaluate(name => { location.hash = '#admin/' + name; }, module);
      await page.locator('#adminNav [data-admin-module="' + module + '"][aria-current="page"]').waitFor({state: 'visible'});
    };

    // Test 1: one failed hydration query must reject the whole snapshot.
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService && window.CrabbieAdminDraftGuard));
    await page.evaluate(() => {
      window.__routerRows = { portfolio_projects: [{slug:'color-fiesta',title:'Color Fiesta',tags:[],content:{},published:true}] };
      window.__routerWrites = [];
      window.__routerQueryCount = {};
      window.__routerFail = 'cms_categories';
    });
    await loginAdmin();
    await page.locator('#adminLoadState[data-load-state="error"]').waitFor({state: 'visible'});
    assert.equal(await page.evaluate(() => window.CrabbieAdminCrud.getAdminLoadState()), 'error');
    assert.equal(await page.locator('[data-adm-save]').count(), 0, 'Failed hydration must not expose Save controls');
    assert.equal(await page.locator('[data-adm-path]').count(), 0, 'Failed hydration must not render editors over prototype data');
    assert.equal(await page.locator('#adminTopSave').isVisible(), false, 'Failed hydration must hide the top Save button');
    const blockedSave = await page.evaluate(async () => {
      try { await window.CrabbieAdminCrud.saveRecord('portfolio', { id: 'local-1', dbId: null, slug: 'gate-check', title: 'X', category: 'illustration', tags: [] }); return 'written'; }
      catch (err) { return err.message; }
    });
    assert.equal(blockedSave, 'Admin data is not ready for mutation.');
    const blockedDelete = await page.evaluate(async () => {
      try { await window.CrabbieAdminCrud.deleteRecord('portfolio', { id: 'color-fiesta', dbId: '00000000-0000-4000-8000-000000000001' }); return 'deleted'; }
      catch (err) { return err.message; }
    });
    assert.equal(blockedDelete, 'Admin data is not ready for mutation.');
    assert.deepEqual(await page.evaluate(() => window.__routerWrites), [], 'No Supabase write may happen before a live snapshot');
    console.log('PASS failed admin hydration sets error, hides editors and refuses every mutation with zero writes (SDK fixture)');

    // Retry: one complete pass reaches ready and loads live rows.
    await page.evaluate(() => { window.__routerFail = null; window.__routerQueryCount = {}; });
    await page.locator('[data-adm-retry]').click();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    assert.equal(await page.evaluate(() => window.__routerQueryCount.cms_categories), 1, 'One retry must hydrate exactly once');
    assert.equal(await page.locator('#adminLoadState').count(), 0, 'Ready state must replace the load panel');
    await goToAdminModule('portfolio');
    assert.equal(await page.locator('[data-adm-path="portfolio.color-fiesta.title"]').inputValue(), 'Color Fiesta', 'Retry must load live rows, not prototype rows');
    assert.equal(await page.locator('#adminTopSave').isVisible(), true);
    assert.equal(await page.locator('#admStickySave').count(), 0, 'the duplicate sticky Save bar is not rendered');
    assert.equal(await page.locator('#adminContent .adm-editor-bar [data-adm-save]:visible').count(), 0, 'local editor Save buttons are hidden');
    console.log('PASS admin hydration retry reaches ready with one canonical visible Save action (SDK fixture)');

    // Test 5: a repeated SIGNED_IN for the same session must not hydrate twice.
    await page.evaluate(() => { window.__routerQueryCount = {}; window.__routerEmit('SIGNED_IN'); });
    await page.waitForTimeout(80);
    assert.deepEqual(await page.evaluate(() => window.__routerQueryCount), {}, 'A repeated SIGNED_IN must not reload CMS tables');
    assert.equal(await page.evaluate(() => window.CrabbieAdminCrud.getAdminLoadState()), 'ready');

    // Test 4: a token refresh while dirty updates session state only.
    await page.locator('[data-adm-path="portfolio.color-fiesta.title"]').fill('Unsaved draft title');
    assert.match(await page.evaluate(() => document.getElementById('adminSaveStatus').className), /dirty/);
    await page.evaluate(() => { window.__routerQueryCount = {}; window.__routerEmit('TOKEN_REFRESHED'); });
    await page.waitForTimeout(80);
    assert.equal(await page.locator('[data-adm-path="portfolio.color-fiesta.title"]').inputValue(), 'Unsaved draft title', 'TOKEN_REFRESHED must not replace the draft');
    assert.match(await page.evaluate(() => document.getElementById('adminSaveStatus').className), /dirty/, 'TOKEN_REFRESHED must not clear the dirty state');
    assert.deepEqual(await page.evaluate(() => window.__routerQueryCount), {}, 'TOKEN_REFRESHED must not reload CMS tables');
    assert.equal(await page.evaluate(() => window.CrabbieAdminCrud.getAdminLoadState()), 'ready');
    console.log('PASS TOKEN_REFRESHED keeps the dirty draft, the dirty flag and performs no hydration (SDK fixture)');

    // Test 6: dirty admin navigation and unload protection.
    await page.evaluate(() => { location.hash = '#home'; });
    await page.locator('#adminConfirmModal.open').waitFor({state: 'visible'});
    assert.equal(await page.evaluate(() => location.hash), '#admin/portfolio', 'A dirty exit must restore the admin route while asking');
    await page.locator('#adminConfirmCancel').click();
    assert.equal(await page.evaluate(() => document.querySelector('.view.is-active').dataset.view), 'admin');
    assert.equal(await page.locator('[data-adm-path="portfolio.color-fiesta.title"]').inputValue(), 'Unsaved draft title', 'Cancelling must preserve the draft');
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', {cancelable: true});
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), true, 'Unsaved admin work must warn before unload');
    await page.evaluate(() => { location.hash = '#home'; });
    await page.locator('#adminConfirmModal.open').waitFor({state: 'visible'});
    await page.locator('#adminConfirmOk').click();
    await page.waitForFunction(() => document.querySelector('.view.is-active').dataset.view === 'home');
    assert.equal(await page.evaluate(() => {
      const event = new Event('beforeunload', {cancelable: true});
      window.dispatchEvent(event);
      return event.defaultPrevented;
    }), false, 'A clean draft must not warn before unload');
    console.log('PASS dirty admin exit prompts once, is cancellable and warns before unload (SDK fixture)');

    // Test 2/3: successful empty tables must clear every prototype collection.
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await seedEmptyAdminRows();
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    assert.equal(await page.evaluate(() => window.__routerQueryCount.cms_categories), 1, 'Initial authentication must hydrate exactly once');
    await goToAdminModule('portfolio');
    assert.equal(await page.locator('[data-adm-path^="portfolio."]').count(), 0, 'Empty Supabase portfolio must not keep prototype records');
    assert.equal(await page.locator('.adm-record').count(), 0, 'Empty portfolio must render an empty list');
    const navCounts = await page.evaluate(() => {
      const counts = {};
      document.querySelectorAll('#adminNav [data-count]').forEach(el => { counts[el.getAttribute('data-count')] = el.textContent; });
      return counts;
    });
    assert.deepEqual(navCounts, { portfolio: '0', assets: '0', commissions: '0', requests: '0' });
    for (const module of ['assets', 'commissions', 'requests', 'media']) {
      await goToAdminModule(module);
      assert.equal(await page.locator('.adm-record, .adm-req-row, .adm-media-card').count(), 0, 'Empty ' + module + ' must render no records');
    }
    await goToAdminModule('about');
    assert.equal(await page.locator('[data-adm-path="pages.about.title"]').inputValue(), '', 'Prototype About page must not survive an empty snapshot');
    await goToAdminModule('terms');
    assert.equal(await page.locator('[data-adm-path="pages.terms.title"]').inputValue(), '', 'Prototype Terms page must not survive an empty snapshot');
    await goToAdminModule('settings');
    assert.equal(await page.locator('[data-adm-path="settings.branding.title"]').inputValue(), '', 'Prototype settings must not survive an empty snapshot');
    console.log('PASS empty Supabase tables clear portfolio, assets, commissions, requests, media, pages and settings (SDK fixture)');

    // ---- Prompt 2: record-scoped saves, concurrency, duplicates, deletes -----
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService && window.CrabbieAdminCrud && window.CrabbieAdminCrud.saveRecord));
    await page.evaluate(() => {
      window.__routerRows = {
        portfolio_projects: [
          {id:'00000000-0000-4000-8000-000000000101',slug:'color-fiesta',title:'Color Fiesta',description:'D',tags:[],thumbnail_path:'',cover_path:'',content:{categorySlug:'illustration'},featured:false,published:true,sort_order:0,updated_at:'2026-01-01T00:00:00Z'},
          {id:'00000000-0000-4000-8000-000000000102',slug:'second-project',title:'Second project',description:'D',tags:[],thumbnail_path:'',cover_path:'',content:{},featured:false,published:false,sort_order:1,updated_at:'2026-01-02T00:00:00Z'}
        ],
        free_assets: [{id:'00000000-0000-4000-8000-000000000103',slug:'petal-pack',title:'Petal pack',description:'D',tags:[],thumbnail_path:'',file_path:'https://example.test/petal.zip',file_type:'ZIP',availability:'available',metadata:{},featured:false,published:true,sort_order:0,updated_at:'2026-01-03T00:00:00Z'}],
        commission_services: [{id:'00000000-0000-4000-8000-000000000104',slug:'bust-up',title:'Bust up',description:'D',price:70,currency:'USD',availability:'open',form_slug:'emails',thumbnail_path:'',featured:false,published:true,details:{deliveryEstimate:'2 weeks'},sort_order:0,updated_at:'2026-01-04T00:00:00Z'}],
        commission_forms: [{id:'00000000-0000-4000-8000-000000000105',slug:'emails',title:'Emails form',description:'D',published:true,fields:[],updated_at:'2026-01-05T00:00:00Z'}],
        cms_categories: [],
        cms_pages: [{id:'00000000-0000-4000-8000-000000000106',slug:'about',title:'About fixture',content:'About body',published:true,data:{name:'Fixture artist',bio:'Bio',skills:[],experience:[],links:[]},updated_at:'2026-01-06T00:00:00Z'}],
        cms_navigation: [{id:'00000000-0000-4000-8000-000000000107',title:'Portfolio',url:'#portfolio',published:true,sort_order:0,updated_at:'2026-01-07T00:00:00Z'}],
        site_settings: [],
        commission_requests: [
          {id:'00000000-0000-4000-8000-000000000108',client_name:'Client One',client_email:'one@example.test',answers:{service:'Bust up'},status:'new',admin_notes:'',created_at:'2026-01-08T00:00:00Z',updated_at:'2026-01-08T00:00:00Z'},
          {id:'00000000-0000-4000-8000-000000000109',client_name:'Client Two',client_email:'two@example.test',answers:{service:'Bust up'},status:'new',admin_notes:'',created_at:'2026-01-09T00:00:00Z',updated_at:'2026-01-09T00:00:00Z'}
        ],
        media: []
      };
      window.__routerWrites = [];
      window.__routerQueryCount = {};
      window.__routerFail = null;
      window.__routerWriteError = null;
    });
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');

    /* Toast assertions must never read the previous toast: clear it first. */
    const clearToast = () => page.evaluate(() => {
      const el = document.getElementById('toast');
      el.classList.remove('show');
      el.textContent = '';
    });
    const readToast = async () => {
      await page.waitForFunction(() => {
        const el = document.getElementById('toast');
        return el.classList.contains('show') && el.textContent.trim() !== '';
      });
      return page.locator('#toast').innerText();
    };

    // Test 1 + Test 5: one portfolio edit updates only that row, by DB id.
    await goToAdminModule('portfolio');
    await page.locator('[data-adm-path="portfolio.color-fiesta.title"]').fill('Edited once');
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => window.__routerWrites.length > 0);
    const portfolioWrites = await page.evaluate(() => window.__routerWrites.map(w => ({table: w.table, op: w.operation, filters: w.filters})));
    assert.equal(portfolioWrites.length, 1, 'one record edit must write exactly one row');
    assert.equal(portfolioWrites[0].table, 'portfolio_projects');
    assert.equal(portfolioWrites[0].op, 'update', 'an existing record is UPDATEd, never re-upserted');
    assert.deepEqual(portfolioWrites[0].filters, [['id', '00000000-0000-4000-8000-000000000101'], ['updated_at', '2026-01-01T00:00:00Z']], 'the write is scoped by DB id and the hydrated baseline');
    const portfolioRowsAfter = await page.evaluate(() => window.__routerRows.portfolio_projects.map(r => ({slug: r.slug, title: r.title, updated_at: r.updated_at})));
    assert.equal(portfolioRowsAfter.find(r => r.slug === 'edited-once').title, 'Edited once', 'the stored slug follows the edited title');
    assert.equal(portfolioRowsAfter.find(r => r.slug === 'second-project').title, 'Second project', 'an untouched record must not be rewritten');
    assert.equal(portfolioRowsAfter.find(r => r.slug === 'second-project').updated_at, '2026-01-02T00:00:00Z', 'an untouched record keeps its timestamp');
    console.log('PASS one portfolio edit sends one UPDATE scoped by DB id + baseline (SDK fixture)');

    // Test 4 + Test 7: a new draft is INSERTed, remembers the DB id, then UPDATEs.
    await page.locator('[data-adm-new="portfolio"]').click();
    const newRecordPath = await page.evaluate(() => {
      const input = document.querySelector('[data-adm-path$=".slug"]');
      return input ? input.getAttribute('data-adm-path').replace(/\.slug$/, '') : '';
    });
    assert.match(newRecordPath, /^portfolio\.client-/, 'a new draft gets a unique client identity instead of a fixed slug');
    assert.equal(await page.locator('[data-adm-path="' + newRecordPath + '.slug"]').inputValue(), '', 'a new draft starts with an empty slug');
    await page.locator('[data-adm-path="' + newRecordPath + '.title"]').fill('Brand new project');
    assert.equal(await page.locator('[data-adm-path="' + newRecordPath + '.slug"]').inputValue(), 'brand-new-project', 'the slug auto-generates from the title');
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => window.__routerWrites.length > 0);
    const insertWrites = await page.evaluate(() => window.__routerWrites.map(w => ({op: w.operation, payload: w.payload})));
    assert.equal(insertWrites.length, 1, 'a new record is one INSERT');
    assert.equal(insertWrites[0].op, 'insert', 'a new record must be INSERTed');
    assert.equal('id' in insertWrites[0].payload, false, 'an insert must not send a DB id');
    const insertedRow = await page.evaluate(() => window.__routerRows.portfolio_projects.find(r => r.slug === 'brand-new-project'));
    assert.ok(insertedRow && insertedRow.id, 'the database returned a real id');
    assert.equal(await page.evaluate(() => window.CrabbieAdminCrud.getAdminLoadState()), 'ready');

    await page.locator('[data-adm-path="' + newRecordPath + '.title"]').fill('Renamed new project');
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => window.__routerWrites.length > 0);
    const secondWrites = await page.evaluate(() => window.__routerWrites.map(w => ({op: w.operation, filters: w.filters})));
    assert.equal(secondWrites.length, 1);
    assert.equal(secondWrites[0].op, 'update', 'the inserted record is treated as existing afterwards');
    assert.equal(secondWrites[0].filters[0][0], 'id');
    assert.equal(secondWrites[0].filters[0][1], insertedRow.id, 'the UPDATE targets the returned DB id');
    assert.equal(secondWrites[0].filters[1][1], insertedRow.updated_at, 'the local baseline advanced to the returned updated_at');
    console.log('PASS a new record INSERTs once, stores the DB id and UPDATEs afterwards (SDK fixture)');

    // Bug fix: an edit that lands after a save begins is never marked saved.
    // The click and the follow-up edit run in one task, so the edit is
    // guaranteed to land while the version N write is still in flight.
    await page.locator('[data-adm-path="' + newRecordPath + '.title"]').fill('Mid-save base');
    await page.evaluate(() => { window.__routerWrites = []; });
    await clearToast();
    await page.evaluate((base) => {
      document.getElementById('adminTopSave').click();
      const input = document.querySelector('[data-adm-path="' + base + '.title"]');
      input.value = 'Edited mid-save';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, newRecordPath);
    await page.waitForFunction(() => window.__routerWrites.length > 0);
    assert.equal(await page.evaluate(() => window.__routerRows.portfolio_projects.find((r) => r.slug === 'mid-save-base').title), 'Mid-save base', 'the database keeps version N, including its auto slug, not the mid-save edit');
    assert.equal(await page.locator('[data-adm-path="' + newRecordPath + '.title"]').inputValue(), 'Edited mid-save', 'the draft keeps the newer version N+1');
    assert.equal(await page.locator('[data-adm-path="' + newRecordPath + '.slug"]').inputValue(), 'edited-mid-save', 'the newer auto slug also survives the in-flight response');
    assert.match(await page.evaluate(() => document.getElementById('adminSaveStatus').className), /dirty/, 'the draft stays dirty after a mid-save edit');
    assert.match(await readToast(), /still unsaved|chưa lưu/i, 'the toast admits newer edits are still unsaved');
    // The persisted baseline advanced to N even though the draft is N+1, so
    // discarding restores N (matching the database), never the older N-1.
    await page.evaluate(() => { location.hash = '#home'; });
    await page.locator('#adminConfirmModal.open').waitFor({ state: 'visible' });
    await page.locator('#adminConfirmOk').click();
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'home');
    await page.evaluate(() => { location.hash = '#admin/portfolio'; });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'admin');
    assert.equal(await page.locator('[data-adm-path="' + newRecordPath + '.title"]').inputValue(), 'Mid-save base', 'discard after a mid-save edit restores the confirmed N');
    await page.locator('[data-adm-path="' + newRecordPath + '.title"]').fill('Edited mid-save');
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => window.__routerWrites.length > 0);
    assert.equal(await page.evaluate(() => window.__routerRows.portfolio_projects.find((r) => r.slug === 'edited-mid-save').title), 'Edited mid-save', 'a follow-up save persists version N+1 with its auto slug');
    assert.doesNotMatch(await page.evaluate(() => document.getElementById('adminSaveStatus').className), /dirty/, 'the draft is clean once the latest revision is saved');
    console.log('PASS a mid-save edit stays dirty and is persisted by the next save (SDK fixture)');

    // Bug fix: a stale picker page must never overwrite a newer one. Transport
    // is staged with deferreds, but both loads travel the real UI path.
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-mediabrowse]')));
    await page.evaluate(() => {
      const media = window.CrabbieAdminMedia;
      window.__pickerRealLoad = media.loadMediaPage.bind(media);
      window.__pickerGates = [];
      let calls = 0;
      media.loadMediaPage = (opts) => new Promise((resolve, reject) => {
        calls += 1;
        window.__pickerGates.push({ call: calls, opts, resolve, reject });
      });
    });
    await page.locator('#adminContent [data-adm-mediabrowse]').first().click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
    await page.waitForFunction(() => (window.__pickerGates || []).length >= 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    await page.locator('#adminContent [data-adm-mediabrowse]').first().click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
    await page.waitForFunction(() => (window.__pickerGates || []).length >= 2);
    const pickerItem = (id, title) => ({ id, title, url: 'https://router-test.supabase.co/' + id + '.png', thumbnailUrl: 'https://router-test.supabase.co/' + id + '.png', type: 'image', mimeType: 'image/png', storagePath: id + '.png', size: '1 KB', alt: title });
    await page.evaluate((item) => {
      window.__pickerGates[1].resolve({ items: [item], page: 1, total: 1, pageCount: 1 });
    }, pickerItem('new-b', 'New B'));
    await page.waitForFunction(() => {
      const grid = document.getElementById('adminMediaPickerGrid');
      return Boolean(grid) && grid.innerText.indexOf('New B') !== -1;
    });
    await page.evaluate((item) => {
      window.__pickerGates[0].resolve({ items: [item], page: 1, total: 1, pageCount: 1 });
    }, pickerItem('old-a', 'Old A'));
    await page.waitForTimeout(250);
    assert.match(await page.locator('#adminMediaPickerGrid').innerText(), /New B/, 'a late stale picker response never overwrites the newer page');
    assert.doesNotMatch(await page.locator('#adminMediaPickerGrid').innerText(), /Old A/, 'stale picker items stay out of the grid');
    // A stale failure after a newer success keeps the successful state too.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    await page.evaluate(() => { window.__pickerGates.length = 0; });
    await page.locator('#adminContent [data-adm-mediabrowse]').first().click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
    await page.waitForFunction(() => (window.__pickerGates || []).length >= 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    await page.locator('#adminContent [data-adm-mediabrowse]').first().click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
    await page.waitForFunction(() => (window.__pickerGates || []).length >= 2);
    await page.evaluate((item) => {
      window.__pickerGates[1].resolve({ items: [item], page: 1, total: 1, pageCount: 1 });
    }, pickerItem('fresh-c', 'Fresh C'));
    await page.waitForFunction(() => {
      const grid = document.getElementById('adminMediaPickerGrid');
      return Boolean(grid) && grid.innerText.indexOf('Fresh C') !== -1;
    });
    await page.evaluate(() => { window.__pickerGates[0].reject(new Error('stale transport failure')); });
    await page.waitForTimeout(250);
    assert.match(await page.locator('#adminMediaPickerGrid').innerText(), /Fresh C/, 'a stale picker failure never replaces newer successful state');
    await page.evaluate(() => {
      window.CrabbieAdminMedia.loadMediaPage = window.__pickerRealLoad;
      delete window.__pickerRealLoad;
      delete window.__pickerGates;
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    console.log('PASS stale picker responses and failures never overwrite newer picker state (SDK fixture)');

    // Test 3: a duplicate slug is rejected without touching the other row.
    await goToAdminModule('portfolio');
    await page.locator('[data-adm-new="portfolio"]').click();
    const duplicatePath = await page.evaluate(() => {
      const input = document.querySelector('[data-adm-path$=".slug"]');
      return input ? input.getAttribute('data-adm-path').replace(/\.slug$/, '') : '';
    });
    await page.locator('[data-adm-path="' + duplicatePath + '.title"]').fill('Second project');
    await page.evaluate(() => { window.__routerWrites = []; });
    await clearToast();
    await page.locator('#adminTopSave').click();
    assert.match(await readToast(), /already used/i, 'a duplicate slug surfaces a clear conflict message');
    assert.equal(await page.locator('[data-adm-path="' + duplicatePath + '.slug"]').inputValue(), 'second-project', 'the generated duplicate slug is preserved in the unsaved draft');
    assert.match(await page.evaluate(() => document.getElementById('adminSaveStatus').className), /dirty/, 'the draft stays unsaved after a rejected insert');
    assert.deepEqual(await page.evaluate(() => window.__routerRows.portfolio_projects.filter(r => r.slug === 'second-project').map(r => r.title)), ['Second project'], 'the existing row is untouched');
    assert.equal(await page.evaluate(() => window.__routerRows.portfolio_projects.filter(r => r.slug === 'second-project').length), 1, 'no partial duplicate row was created');
    assert.deepEqual(await page.evaluate(() => window.__routerWrites.map(w => w.operation)), ['insert'], 'only the rejected INSERT was attempted');
    console.log('PASS a duplicate slug is rejected without touching the other row or the draft (SDK fixture)');

    // Test 2: editing one commission request updates only that request.
    await goToAdminModule('requests');
    await page.locator('[data-adm-path="requests.00000000-0000-4000-8000-000000000108.status"]').selectOption('Completed');
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => window.__routerWrites.length > 0);
    const requestWrites = await page.evaluate(() => window.__routerWrites.map(w => ({table: w.table, op: w.operation, filters: w.filters, payload: w.payload})));
    assert.equal(requestWrites.length, 1, 'one request edit must write one row, never every loaded request');
    assert.equal(requestWrites[0].table, 'commission_requests');
    assert.equal(requestWrites[0].op, 'update');
    assert.deepEqual(requestWrites[0].filters, [['id', '00000000-0000-4000-8000-000000000108'], ['updated_at', '2026-01-08T00:00:00Z']]);
    assert.deepEqual(Object.keys(requestWrites[0].payload).sort(), ['admin_notes', 'status']);
    const requestRows = await page.evaluate(() => window.__routerRows.commission_requests.map(r => ({id: r.id, status: r.status, updated_at: r.updated_at})));
    assert.equal(requestRows.find(r => r.id.endsWith('108')).status, 'closed');
    assert.equal(requestRows.find(r => r.id.endsWith('109')).updated_at, '2026-01-09T00:00:00Z', 'the other request must not be rewritten');
    console.log('PASS one commission request edit updates only that request (SDK fixture)');

    // Test 6: a stale save from a second tab is rejected as a conflict.
    const staleAttempt = await page.evaluate(async () => {
      const staleRecord = { id:'color-fiesta', dbId:'00000000-0000-4000-8000-000000000101', originalUpdatedAt:'2020-01-01T00:00:00Z', slug:'color-fiesta', title:'Stale title', description:'D', tags:[], category:'illustration' };
      try {
        await window.CrabbieAdminCrud.saveRecord('portfolio', staleRecord);
        return { status:'saved' };
      } catch (err) {
        return { status:'error', code: err.code, message: err.message, draftTitle: staleRecord.title, baseline: staleRecord.originalUpdatedAt };
      }
    });
    assert.equal(staleAttempt.status, 'error', 'a stale save must not succeed');
    assert.equal(staleAttempt.code, 'stale_save');
    assert.match(staleAttempt.message, /another session|reload/i);
    assert.equal(staleAttempt.draftTitle, 'Stale title', 'the local draft survives a conflict');
    assert.equal(staleAttempt.baseline, '2020-01-01T00:00:00Z', 'a failed save must not advance the baseline');
    assert.equal(await page.evaluate(() => window.__routerRows.portfolio_projects.find(r => r.slug === 'edited-once').title), 'Edited once', 'newer database data is not overwritten');
    console.log('PASS a stale save is rejected as a conflict and never overwrites newer data (SDK fixture)');

    // Test 10: a reorder is one bounded order-only write, not one write per row.
    await goToAdminModule('portfolio');
    if (/dirty/.test(await page.evaluate(() => document.getElementById('adminSaveStatus').className))) {
      await page.evaluate(() => { location.hash = '#home'; });
      await page.locator('#adminConfirmModal.open').waitFor({state:'visible'});
      await page.locator('#adminConfirmOk').click();
      await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'home');
      await page.evaluate(() => { location.hash = '#admin/portfolio'; });
      await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'admin');
    }
    await page.locator('.adm-record[data-adm-id="color-fiesta"] [data-adm-move="down"]').click();
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => window.__routerWrites.length > 0);
    const orderWrites = await page.evaluate(() => window.__routerWrites.map(w => ({table: w.table, op: w.operation, payload: w.payload, filters:w.filters})));
    assert.ok(orderWrites.length >= 1, 'a reorder writes the saved rows that need an order value');
    for (const write of orderWrites) {
      assert.equal(write.table, 'portfolio_projects');
      assert.equal(write.op, 'update', 'order changes use UPDATE, never partial upsert');
      assert.deepEqual(Object.keys(write.payload).sort(), ['sort_order'], 'order writes touch only sort_order');
      assert.equal(write.filters[0][0], 'id', 'each order update is scoped by stable DB id');
    }
    console.log('PASS a reorder uses safe order-only UPDATEs (SDK fixture)');

    // Test 8: a failed delete keeps the record in local state and reports it.
    const adminRecordCount = () => page.locator('#adminContent .adm-record').count();
    const countBeforeDelete = await adminRecordCount();
    await page.locator('.adm-record[data-adm-id="second-project"]').click();
    await page.evaluate(() => { window.__routerWriteError = { table:'portfolio_projects', operation:'delete', message:'Network request failed' }; });
    await clearToast();
    await page.locator('[data-adm-delete-list="portfolio"]').click();
    await page.locator('#adminConfirmOk').click();
    assert.match(await readToast(), /Delete failed/i, 'a failed delete is reported to the user');
    assert.equal(await adminRecordCount(), countBeforeDelete, 'the record stays in the admin list after a failed delete');
    assert.equal(await page.evaluate(() => window.__routerRows.portfolio_projects.some(r => r.slug === 'second-project')), true, 'the row is still in the database');
    assert.equal(await page.locator('.adm-record[data-adm-id="second-project"]').getAttribute('aria-selected'), 'true', 'selection stays coherent after a failed delete');
    console.log('PASS a failed database delete keeps the record and reports the error (SDK fixture)');

    // Test 9: a successful delete removes the row from the DB first, then locally.
    await page.locator('[data-adm-delete-list="portfolio"]').click();
    await page.locator('#adminConfirmOk').click();
    await page.waitForFunction(() => !window.__routerRows.portfolio_projects.some(r => r.slug === 'second-project'));
    assert.equal(await page.locator('.adm-record[data-adm-id="second-project"]').count(), 0, 'the deleted record leaves the admin list only after DB success');
    assert.equal(await adminRecordCount(), countBeforeDelete - 1);
    assert.equal(await page.locator('.adm-record[aria-selected="true"]').count(), 1, 'a remaining record stays selected');
    console.log('PASS a successful delete removes the row from the database and then the list (SDK fixture)');

    // Test 11: every Prompt 2 mutation respects the Batch 1 readiness gate.
    const gateResults = await page.evaluate(async () => {
      window.CrabbieAdminCrud.setAdminLoadState('idle');
      const attempt = async (fn) => {
        try { await fn(); return 'allowed'; } catch (err) { return err.message; }
      };
      const results = {
        save: await attempt(() => window.CrabbieAdminCrud.saveRecord('portfolio', { id:'x', dbId:null, slug:'x', title:'X', category:'illustration', tags:[] })),
        order: await attempt(() => window.CrabbieAdminCrud.saveOrder('portfolio', [])),
        settings: await attempt(() => window.CrabbieAdminCrud.saveSettings({ branding: { title:'X' } }, ['branding'], { branding: { originalUpdatedAt: '2026-01-01T00:00:00Z' } })),
        remove: await attempt(() => window.CrabbieAdminCrud.deleteRecord('portfolio', { id:'x', dbId:'00000000-0000-4000-8000-000000000101' }))
      };
      window.CrabbieAdminCrud.setAdminLoadState('ready');
      return results;
    });
    for (const name of Object.keys(gateResults)) {
      assert.equal(gateResults[name], 'Admin data is not ready for mutation.', name + ' must respect the load-state gate');
    }
    console.log('PASS record, order, settings and delete mutations all refuse to run while not ready (SDK fixture)');

    // ---- Settings concurrency: two sessions, one site_settings key ----------
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService && window.CrabbieAdminCrud && window.CrabbieAdminCrud.saveSettings));
    await page.evaluate(() => {
      window.__routerRows = {
        site_settings: [
          { key:'branding', value:{ title:'CRABBIE' }, updated_at:'2026-03-01T00:00:00Z' },
          { key:'seo', value:{ title:'Old SEO' }, updated_at:'2026-03-02T00:00:00Z' }
        ]
      };
      window.__routerWrites = [];
      window.__routerQueryCount = {};
      window.__routerFail = null;
      window.__routerWriteError = null;
    });
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await goToAdminModule('settings');

    const settingsRow = () => page.evaluate(() => {
      const row = window.__routerRows.site_settings.find(r => r.key === 'branding');
      return { title: row.value.title, updated_at: row.updated_at };
    });

    // Session A saves the key it hydrated.
    await page.locator('[data-adm-path="settings.branding.title"]').fill('Edited branding');
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => window.__routerWrites.length > 0);
    const settingsWrites = await page.evaluate(() => window.__routerWrites.map(w => ({table: w.table, op: w.operation, filters: w.filters, payload: w.payload})));
    assert.equal(settingsWrites.length, 1, 'only the touched settings key is written');
    assert.equal(settingsWrites[0].table, 'site_settings');
    assert.equal(settingsWrites[0].op, 'update', 'a hydrated settings key is UPDATEd, never re-inserted');
    assert.deepEqual(settingsWrites[0].filters, [['key', 'branding'], ['updated_at', '2026-03-01T00:00:00Z']], 'the settings write is guarded by key + hydrated baseline');
    assert.equal(settingsWrites[0].payload.value.title, 'Edited branding');
    const savedBranding = await settingsRow();
    assert.equal(savedBranding.title, 'Edited branding');
    assert.notEqual(savedBranding.updated_at, '2026-03-01T00:00:00Z', 'the database advanced updated_at');
    assert.equal(await page.evaluate(() => window.__routerRows.site_settings.find(r => r.key === 'seo').updated_at), '2026-03-02T00:00:00Z', 'an untouched settings key is not written');
    console.log('PASS one settings save writes only the touched key under its baseline (SDK fixture)');

    // The advanced baseline is used by the next save from the same session.
    await page.locator('[data-adm-path="settings.branding.title"]').fill('Edited branding twice');
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => window.__routerWrites.length > 0);
    const secondSettingsWrites = await page.evaluate(() => window.__routerWrites.map(w => ({op: w.operation, filters: w.filters})));
    assert.equal(secondSettingsWrites[0].filters[1][1], savedBranding.updated_at, 'the settings baseline advanced to the returned updated_at');
    console.log('PASS the settings baseline advances after a successful save (SDK fixture)');

    // Session B still holds the old baseline, so its save must be rejected.
    await page.evaluate(() => {
      const row = window.__routerRows.site_settings.find(r => r.key === 'branding');
      row.value = { title: 'OTHER SESSION' };
      row.updated_at = '2026-09-09T00:00:00Z';
    });
    await page.locator('[data-adm-path="settings.branding.title"]').fill('MY STALE EDIT');
    await page.evaluate(() => { window.__routerWrites = []; });
    await clearToast();
    await page.locator('#adminTopSave').click();
    assert.match(await readToast(), /Conflict/i, 'a stale settings save reports the same conflict as records');
    assert.equal(await page.locator('[data-adm-path="settings.branding.title"]').inputValue(), 'MY STALE EDIT', 'the stale settings draft is preserved');
    assert.match(await page.evaluate(() => document.getElementById('adminSaveStatus').className), /dirty/, 'the stale settings draft stays dirty');
    assert.deepEqual(await settingsRow(), { title: 'OTHER SESSION', updated_at: '2026-09-09T00:00:00Z' }, 'the newer stored value is not overwritten');
    assert.deepEqual(await page.evaluate(() => window.__routerWrites.map(w => w.operation)), ['update'], 'the stale save attempted one guarded update only');
    console.log('PASS a stale settings save is rejected and the newer value survives (SDK fixture)');

    // ---- Prompt 3: media safety, storage integrity, destructive actions -----
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService && window.CrabbieAdminMedia && window.CrabbieAdminMedia.deleteMediaFile));
    const MEDIA_UNUSED = '00000000-0000-4000-8000-000000000201';
    const MEDIA_THUMB = '00000000-0000-4000-8000-000000000202';
    const MEDIA_BLOCK = '00000000-0000-4000-8000-000000000203';
    const MEDIA_TOMBSTONE = '00000000-0000-4000-8000-000000000204';
    const MEDIA_FLAKY = '00000000-0000-4000-8000-000000000205';
    const mediaRow = (id, path, name, status) => ({
      id, bucket_id: 'media', storage_path: path, original_name: name, mime_type: 'image/png',
      size_bytes: 2048, alt_text: name, created_at: '2026-02-01T00:00:00Z',
      deletion_status: status || 'active', deleted_at: null, deletion_error: null
    });

    await page.evaluate((rows) => {
      window.__routerRows = {
        media: rows,
        portfolio_projects: [{
          id: '00000000-0000-4000-8000-000000000301', slug: 'color-fiesta', title: 'Color Fiesta', description: 'D',
          tags: [], published: true, sort_order: 0, updated_at: '2026-01-01T00:00:00Z',
          thumbnail_path: 'https://router-test.supabase.co/uploads/202_used-thumb.png', cover_path: '',
          content: { blocks: [{ type: 'gallery', items: [{ url: 'https://router-test.supabase.co/uploads/203_used-block.png', alt: 'x', caption: '' }] }] }
        }],
        free_assets: [], commission_services: [], commission_forms: [], cms_categories: [], cms_pages: [],
        cms_navigation: [], site_settings: [], commission_requests: []
      };
      window.__routerStorageObjects = [
        { name: '201_unused.png', path: 'uploads/201_unused.png' },
        { name: '202_used-thumb.png', path: 'uploads/202_used-thumb.png' },
        { name: '203_used-block.png', path: 'uploads/203_used-block.png' },
        { name: '205_flaky.png', path: 'uploads/205_flaky.png' }
      ];
      window.__routerStorageWrites = [];
      window.__routerWrites = [];
      window.__routerReads = [];
      window.__routerQueryCount = {};
      window.__routerFail = null;
      window.__routerWriteError = null;
      window.__routerStorageRemoveError = null;
    }, [
      mediaRow(MEDIA_UNUSED, 'uploads/201_unused.png', 'unused.png'),
      mediaRow(MEDIA_THUMB, 'uploads/202_used-thumb.png', 'used-thumb.png'),
      mediaRow(MEDIA_BLOCK, 'uploads/203_used-block.png', 'used-block.png'),
      mediaRow(MEDIA_TOMBSTONE, 'uploads/204_pending.png', 'pending.png', 'pending'),
      mediaRow(MEDIA_FLAKY, 'uploads/205_flaky.png', 'flaky.png')
    ]);

    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');

    // Test 8: normal hydration only reads active media.
    const mediaRead = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media').pop());
    assert.deepEqual(mediaRead.filters, [['deletion_status', 'active']], 'media hydration is restricted to active rows');
    await goToAdminModule('media');
    assert.equal(await page.locator('.adm-media-card').count(), 4, 'a tombstoned row is never listed as active media');

    // Test 2: a referenced thumbnail blocks the deletion outright.
    await clearToast();
    await page.evaluate(() => { window.__routerWrites = []; window.__routerStorageWrites = []; });
    await page.locator('[data-adm-media-del="' + MEDIA_THUMB + '"]').click();
    await page.locator('#adminConfirmOk').click();
    const blockedToast = await readToast();
    assert.match(blockedToast, /cannot be deleted/i, 'referenced media is reported as blocked');
    assert.match(blockedToast, /thumbnail/i, 'the message names where the file is used');
    assert.equal(await page.evaluate(() => window.__routerStorageWrites.length), 0, 'no Storage call is made for referenced media');
    assert.equal(await page.evaluate(() => window.__routerWrites.filter((write) => write.table === 'media').length), 0, 'no media row change is made for referenced media');
    assert.equal(await page.evaluate((id) => window.__routerRows.media.find((row) => row.id === id).deletion_status, MEDIA_THUMB), 'active');
    assert.equal(await page.locator('.adm-media-card').count(), 4, 'the referenced file stays in the library');

    // Test 3: a nested block/gallery reference blocks the deletion too.
    await clearToast();
    await page.locator('[data-adm-media-del="' + MEDIA_BLOCK + '"]').click();
    await page.locator('#adminConfirmOk').click();
    const nestedToast = await readToast();
    assert.match(nestedToast, /cannot be deleted/i);
    assert.match(nestedToast, /block 1/i, 'the message points at the block that uses the file');
    assert.equal(await page.evaluate(() => window.__routerStorageWrites.length), 0, 'a nested reference still blocks storage removal');
    console.log('PASS media used inside portfolio blocks and galleries cannot be deleted (SDK fixture)');

    // Test 1 + Test 17: an unused file completes the audited deletion lifecycle.
    await clearToast();
    await page.evaluate(() => { window.__routerWrites = []; window.__routerStorageWrites = []; });
    await page.locator('[data-adm-media-del="' + MEDIA_UNUSED + '"]').click();
    await page.locator('#adminConfirmOk').click();
    await page.waitForFunction((id) => !window.__routerRows.media.some((row) => row.id === id), MEDIA_UNUSED);
    const mediaOps = await page.evaluate(() => window.__routerWrites.map((write) => write.table + ':' + write.operation));
    const storageOps = await page.evaluate(() => window.__routerStorageWrites.map((write) => write.operation + ':' + (write.paths || []).join(',')));
    assert.deepEqual(storageOps, ['remove:uploads/201_unused.png'], 'the storage object is removed exactly once');
    assert.ok(mediaOps.indexOf('media:update') !== -1, 'the row is tombstoned before storage removal');
    assert.ok(mediaOps.indexOf('media:delete') !== -1, 'the row is deleted only after storage removal');
    assert.ok(mediaOps.indexOf('admin_audit_log:insert') !== -1, 'destructive media actions are audited');
    const auditActions = await page.evaluate(() => window.__routerRows.admin_audit_log.map((row) => row.action));
    assert.deepEqual(auditActions.slice(-3), ['media_delete_requested', 'media_storage_deleted', 'media_delete_finalized'], 'the audit trail records the lifecycle');
    assert.equal(await page.locator('.adm-media-card').count(), 3, 'the deleted card leaves the library');
    console.log('PASS an unused media file completes the audited deletion lifecycle (SDK fixture)');

    // Test 4: a failed storage removal leaves a recoverable tombstone.
    await page.evaluate(() => {
      window.__routerStorageRemoveError = { message: 'network down' };
      window.__routerWrites = [];
      window.__routerStorageWrites = [];
    });
    await clearToast();
    await page.locator('[data-adm-media-del="' + MEDIA_FLAKY + '"]').click();
    await page.locator('#adminConfirmOk').click();
    assert.match(await readToast(), /incomplete/i, 'the failure is reported as incomplete, never as deleted');
    const pendingRow = await page.evaluate((id) => window.__routerRows.media.find((row) => row.id === id), MEDIA_FLAKY);
    assert.equal(pendingRow.deletion_status, 'pending', 'a failed storage removal keeps a recoverable tombstone');
    assert.match(pendingRow.deletion_error, /network down/);
    assert.equal(await page.locator('.adm-media-card').count(), 2, 'the pending file is no longer listed as active media');
    assert.equal(await page.evaluate(() => window.__routerStorageObjects.some((entry) => entry.path === 'uploads/205_flaky.png')), true, 'the object is still there for the retry');

    // Test 6: storage removal succeeds but the final row cleanup fails.
    const retryFail = await page.evaluate(async (id) => {
      window.__routerWriteError = { table: 'media', operation: 'delete', message: 'row delete failed' };
      const result = await window.CrabbieAdminMedia.retryMediaDeletion(id);
      return { result, row: window.__routerRows.media.find((row) => row.id === id), objectPresent: window.__routerStorageObjects.some((entry) => entry.path === 'uploads/205_flaky.png') };
    }, MEDIA_FLAKY);
    assert.equal(retryFail.result.success, false);
    assert.equal(retryFail.result.pending, true);
    assert.equal(retryFail.objectPresent, false, 'the retry removed the storage object first');
    assert.equal(retryFail.row.deletion_status, 'storage_removed', 'a failed finalize never returns the row to active');
    assert.match(retryFail.row.deletion_error, /row delete failed/);
    console.log('PASS a failed final row cleanup keeps a non-active recoverable tombstone (SDK fixture)');

    // Test 5 + Test 7: the retry finishes safely and stays idempotent.
    const retryOk = await page.evaluate(async (id) => {
      const result = await window.CrabbieAdminMedia.retryMediaDeletion(id);
      return { result, present: window.__routerRows.media.some((row) => row.id === id) };
    }, MEDIA_FLAKY);
    assert.equal(retryOk.result.success, true);
    assert.equal(retryOk.result.status, 'deleted');
    assert.equal(retryOk.present, false, 'the retried deletion is finalized');
    const retryAgain = await page.evaluate((id) => window.CrabbieAdminMedia.retryMediaDeletion(id), MEDIA_FLAKY);
    assert.equal(retryAgain.success, true);
    assert.equal(retryAgain.alreadyFinalized, true, 'retrying an already-finalized deletion is a harmless no-op');
    const missingObjectRetry = await page.evaluate(async (id) => {
      window.__routerStorageRemoveError = { message: 'Object not found', statusCode: '404' };
      const result = await window.CrabbieAdminMedia.retryMediaDeletion(id);
      return { result, present: window.__routerRows.media.some((row) => row.id === id) };
    }, MEDIA_TOMBSTONE);
    assert.equal(missingObjectRetry.result.success, true);
    assert.equal(missingObjectRetry.present, false, 'a storage object that is already gone does not block finalization');
    console.log('PASS retries finalize safely, tolerate a missing object and stay idempotent (SDK fixture)');

    // Test 16: every media mutation respects the Batch 1 readiness gate.
    const mediaGates = await page.evaluate(async () => {
      window.CrabbieAdminCrud.setAdminLoadState('idle');
      const attempt = async (fn) => {
        try { await fn(); return 'allowed'; } catch (err) { return err.message; }
      };
      const results = {
        upload: await attempt(() => window.CrabbieAdminMedia.uploadMediaFile({ name: 'x.png', type: 'image/png', size: 10 })),
        remove: await attempt(() => window.CrabbieAdminMedia.deleteMediaFile('00000000-0000-4000-8000-000000000202')),
        retry: await attempt(() => window.CrabbieAdminMedia.retryMediaDeletion('00000000-0000-4000-8000-000000000202'))
      };
      window.CrabbieAdminCrud.setAdminLoadState('ready');
      return results;
    });
    for (const name of Object.keys(mediaGates)) {
      assert.equal(mediaGates[name], 'Admin data is not ready for mutation.', name + ' must respect the load-state gate');
    }
    console.log('PASS media upload, delete and retry all refuse to run while not ready (SDK fixture)');

    // Test 14 + Test 15: the integrity diagnostic is read-only and conservative.
    const diagnostics = await page.evaluate(async () => {
      window.__routerRows.media = [
        { id: 'keep', storage_path: 'uploads/keep.png', original_name: 'keep.png', deletion_status: 'active' },
        { id: 'gone', storage_path: 'uploads/gone.png', original_name: 'gone.png', deletion_status: 'active' }
      ];
      window.__routerStorageObjects = [{ name: 'keep.png', path: 'uploads/keep.png' }, { name: 'orphan.png', path: 'uploads/orphan.png' }];
      const report = await window.CrabbieAdminMedia.diagnoseMediaIntegrity();
      report.remainingObjects = window.__routerStorageObjects.length;
      return report;
    });
    assert.deepEqual(diagnostics.missingObjects.map((entry) => entry.id), ['gone'], 'an active row whose object is missing is detected');
    assert.deepEqual(diagnostics.orphanObjects.map((entry) => entry.storagePath), ['uploads/orphan.png'], 'a storage object with no media row is reported as a candidate');
    assert.deepEqual(diagnostics.pendingCleanup, []);
    assert.equal(diagnostics.remainingObjects, 2, 'the diagnostic never deletes anything');
    console.log('PASS the media integrity diagnostic reports missing objects and orphan candidates only (SDK fixture)');

    // ---- Prompt 4: pagination, thumbnails and the upload pipeline ----------
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService && window.CrabbieAdminCrud && window.CrabbieAdminMedia));
    const mediaSeed = (id, name, over) => Object.assign({
      id, bucket_id: 'media', storage_path: 'uploads/' + name, original_name: name, mime_type: 'image/png',
      size_bytes: 3 * 1024 * 1024, alt_text: name, sha256: null, deletion_status: 'active',
      deleted_at: null, deletion_error: null, created_at: '2026-03-01T00:00:00Z'
    }, over || {});
    const requestSeed = (index) => ({
      id: '00000000-0000-4000-8000-' + String(700 + index).padStart(12, '0'),
      client_name: 'Client ' + index, client_email: 'client' + index + '@example.test', contact: '',
      answers: { service: index % 2 ? 'Character Design' : 'Illustration', note: 'n' + index },
      status: index % 3 === 0 ? 'new' : 'contacted', admin_notes: '', terms_accepted: true,
      service_id: null, form_id: null, created_at: '2026-03-' + String((index % 28) + 1).padStart(2, '0') + 'T00:00:00Z',
      updated_at: '2026-03-01T00:00:00Z'
    });
    const p4MediaRows = [];
    for (let i = 0; i < 30; i += 1) {
      p4MediaRows.push(mediaSeed('00000000-0000-4000-8000-' + String(900 + i).padStart(12, '0'), 'art' + String(i).padStart(2, '0') + '.png'));
    }
    p4MediaRows.push(mediaSeed('00000000-0000-4000-8000-000000000999', 'dance.gif', { mime_type: 'image/gif', size_bytes: 5 * 1024 * 1024 }));
    const p4RequestRows = [];
    for (let i = 0; i < 35; i += 1) p4RequestRows.push(requestSeed(i));

    // Fixture media URLs are served as real (tiny) images so the thumbnail
    // fallback does not fire while the markup is asserted.
    const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
    await context.route('**/storage/v1/render/image/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng }));
    await context.route('**/uploads/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng }));

    await page.evaluate((payload) => {
      window.__routerRows = {
        media: payload.media, commission_requests: payload.requests,
        portfolio_projects: [], free_assets: [], commission_services: [], commission_forms: [],
        cms_categories: [], cms_pages: [], cms_navigation: [], site_settings: []
      };
      window.__routerStorageObjects = [];
      window.__routerStorageWrites = [];
      window.__routerWrites = [];
      window.__routerReads = [];
      window.__routerQueryCount = {};
      window.__routerFail = null;
      window.__routerWriteError = null;
      window.__routerStorageRemoveError = null;
      window.__routerStorageUploadError = null;
      window.__routerTusCalls = [];
    }, { media: p4MediaRows, requests: p4RequestRows });

    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');

    // Tests 1-2: the atomic CMS hydration never downloads the paged tables.
    const hydrationRowReads = await page.evaluate(() => (window.__routerReads || []).filter((read) => !read.head).map((read) => read.table));
    assert.equal(hydrationRowReads.includes('commission_requests'), false, 'initial hydration does not fetch requests rows');
    assert.equal(hydrationRowReads.includes('media'), false, 'initial hydration does not fetch media rows');
    const headReads = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.head).map((read) => read.table).sort());
    assert.deepEqual(headReads, ['commission_requests', 'media'], 'badges use head counts only');
    console.log('PASS initial admin hydration loads no request or media rows (SDK fixture)');

    // Tests 3-6: request paging is one server-scoped range per page.
    const goToModule = async (module) => {
      await page.evaluate((name) => { window.location.hash = '#admin/' + name; }, module);
      await page.waitForFunction(() => document.querySelector('.view.is-active') && document.querySelector('.view.is-active').dataset.view === 'admin');
      await page.waitForTimeout(250);
    };
    await goToModule('requests');
    await page.waitForFunction(() => (window.__routerReads || []).some((read) => read.table === 'commission_requests' && read.range));
    let requestReads = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'commission_requests' && read.range));
    assert.equal(requestReads.length, 1, 'opening the requests panel issues exactly one paged query');
    assert.deepEqual(requestReads[0].range, [0, 29], 'page one is a bounded range, never the whole table');
    assert.equal(requestReads[0].count, 'exact', 'the query asks for an exact total');
    assert.match(await page.locator('.adm-pagination').first().innerText(), new RegExp('Page 1 / 2 · 35 requests'), 'the pager shows the server total');

    await page.locator('[data-adm-req-page="next"]').click();
    await page.waitForFunction(() => (window.__routerReads || []).filter((read) => read.table === 'commission_requests' && read.range).length === 2);
    requestReads = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'commission_requests' && read.range));
    assert.deepEqual(requestReads[1].range, [30, 59], 'changing the page issues a new scoped query');
    assert.match(await page.locator('.adm-pagination').first().innerText(), new RegExp('Page 2 / 2'));
    assert.equal(await page.locator('.adm-req-row').count(), 5, 'only the five rows of the last page are rendered');

    await page.selectOption('[data-adm-req-filter="status"]', 'New');
    await page.waitForFunction(() => (window.__routerReads || []).filter((read) => read.table === 'commission_requests' && read.range).length === 3);
    requestReads = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'commission_requests' && read.range));
    assert.deepEqual(requestReads[2].range, [0, 29], 'changing a filter restarts at page one');
    assert.ok(requestReads[2].filters.some((filter) => filter[0] === 'status' && filter[1] === 'new'), 'the status filter runs server-side');
    const filteredRows = await page.locator('.adm-req-row').count();
    assert.ok(filteredRows > 0 && filteredRows <= 29, 'the filtered page only contains matching rows');
    console.log('PASS commission requests page, filter and count server-side (SDK fixture)');

    // Tests 7-9, 11-12: media paging, thumbnails and post-delete page repair.
    await goToModule('media');
    await page.waitForFunction(() => (window.__routerReads || []).some((read) => read.table === 'media' && read.range));
    let mediaReads = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range));
    assert.equal(mediaReads.length, 1, 'opening the media panel issues exactly one paged query');
    assert.deepEqual(mediaReads[0].range, [0, 29], 'media page one is a bounded range');
    assert.ok(mediaReads[0].filters.some((filter) => filter[0] === 'deletion_status' && filter[1] === 'active'), 'the media page is always active-only');
    assert.equal(await page.locator('.adm-media-card').count(), 30, 'only one page of media is rendered');

    const firstThumb = await page.locator('.adm-media-grid img').first().getAttribute('src');
    assert.match(firstThumb, /storage\/v1\/render\/image\/public\/media\/uploads\/art00\.png/, 'a big raster card loads a small transformation URL, not the original');
    const gifCard = page.locator('.adm-media-card', { hasText: 'dance.gif' });
    assert.equal(await gifCard.count(), 0, 'the gif lives on page two, so page one never renders it');

    await page.locator('[data-adm-media-page="next"]').click();
    await page.waitForFunction(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range).length === 2);
    mediaReads = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range));
    assert.deepEqual(mediaReads[1].range, [30, 59], 'changing the media page issues a new scoped query');
    assert.equal(await page.locator('.adm-media-card').count(), 1, 'the last media page holds the remaining row');
    const gifThumb = await page.locator('.adm-media-card', { hasText: 'dance.gif' }).locator('img').first().getAttribute('src');
    assert.match(gifThumb, /^https:\/\/router-test\.supabase\.co\/uploads\/dance\.gif$/, 'a GIF keeps its canonical original URL');

    // Test 9: deleting the last row of a page repairs the page safely.
    await page.evaluate(() => { window.__routerWrites = []; });
    await clearToast();
    await page.locator('[data-adm-media-del="00000000-0000-4000-8000-000000000999"]').click();
    await page.locator('#adminConfirmOk').click();
    await page.waitForFunction(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range).length === 3);
    mediaReads = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range));
    assert.deepEqual(mediaReads[2].range, [0, 29], 'emptying the last page refetches the adjusted page');
    assert.match(await page.locator('.adm-pagination').first().innerText(), new RegExp('Page 1 / 1 · 30 files'), 'the count drops by the deleted row');
    const openButton = page.locator('.adm-media-card').first().locator('[data-adm-media-open]');
    assert.equal(await openButton.count(), 1, 'preview/download still uses the canonical original');
    console.log('PASS media pages are active-only, thumbnail-first and page-repaired after delete (SDK fixture)');

    // Tests 13-15, 18, 22: upload pipeline split, progress, cancel, validation.
    const smallUpload = await page.evaluate(async () => {
      const file = new File([new Uint8Array(1024)], 'small-art.png', { type: 'image/png' });
      window.__routerStorageWrites = [];
      const item = await window.CrabbieAdminMedia.uploadMediaFile(file, 'small art');
      return { item: { title: item.title, strategy: item.task && item.task.strategy, sha256: item.sha256 }, writes: window.__routerStorageWrites.slice(), stored: window.__routerRows.media.filter((row) => row.original_name === 'small-art.png').length };
    });
    assert.equal(smallUpload.item.strategy, 'standard', 'a small file uses the standard upload path');
    assert.deepEqual(smallUpload.writes.map((write) => write.operation), ['upload'], 'exactly one plain upload happens');
    assert.equal(smallUpload.writes[0].cacheControl, '31536000', 'immutable paths are cached for a year');
    assert.equal(smallUpload.item.sha256.length, 64, 'the stored media row keeps the SHA-256 digest');
    assert.equal(smallUpload.stored, 1, 'the media row is created only after a successful upload');
    console.log('PASS a small upload uses the standard path with digest and cache control (SDK fixture)');

    // Tests 14-15, 18: a large file goes resumable with progress and cancel.
    const tusRun = await page.evaluate(async () => {
      const events = [];
      window.__routerTusCalls = [];
      class FakeUpload {
        constructor(file, options) { this.file = file; this.options = options; }
        findPreviousUploads() { return Promise.resolve([]); }
        start() {
          window.__routerTusCalls.push({ objectName: this.options.metadata.objectName, endpoint: this.options.endpoint, auth: Boolean(this.options.headers.authorization) });
          this.options.onProgress(Math.floor(this.file.size / 2), this.file.size);
          this.options.onProgress(this.file.size, this.file.size);
          this.options.onSuccess({});
        }
        abort() { window.__routerTusCalls.push({ aborted: true }); }
      }
      window.CrabbieTusClient = { Upload: FakeUpload };
      const file = new File([new Uint8Array(7 * 1024 * 1024)], 'huge-art.png', { type: 'image/png' });
      window.__routerStorageWrites = [];
      const item = await window.CrabbieAdminMedia.uploadMediaFile(file, '', { onTask: (task) => events.push({ status: task.status, progress: task.progress }) });
      return { strategy: item.task && item.task.strategy, resumable: item.task && item.task.resumable, events, calls: window.__routerTusCalls.slice(), writes: window.__routerStorageWrites.map((write) => write.operation) };
    });
    assert.equal(tusRun.strategy, 'resumable', 'a 7MB file takes the resumable path');
    assert.equal(tusRun.resumable, true);
    assert.deepEqual(tusRun.writes, [], 'the resumable path never falls back to a plain upload');
    assert.deepEqual(tusRun.calls.map((call) => call.aborted), [undefined], 'the TUS upload was started once');
    assert.match(tusRun.calls[0].endpoint, /\/storage\/v1\/upload\/resumable$/, 'the supported Supabase resumable endpoint is used');
    assert.equal(tusRun.calls[0].auth, true, 'the request keeps the authenticated session token');
    assert.ok(tusRun.events.some((event) => event.status === 'uploading' && event.progress > 0 && event.progress < 100), 'progress is reported while uploading');
    assert.equal(tusRun.events[tusRun.events.length - 1].status, 'complete');
    console.log('PASS a large upload is resumable, authenticated and reports progress (SDK fixture)');

    const cancelRun = await page.evaluate(async () => {
      window.__routerTusCalls = [];
      class HangingUpload {
        constructor(file, options) { this.file = file; this.options = options; }
        findPreviousUploads() { return Promise.resolve([]); }
        start() { window.__routerTusCalls.push({ started: true }); this.options.onProgress(1, this.file.size); }
        abort() { window.__routerTusCalls.push({ aborted: true }); if (this.options.onError) this.options.onError(new Error('Upload cancelled')); }
      }
      window.CrabbieTusClient = { Upload: HangingUpload };
      const before = window.__routerRows.media.length;
      const file = new File([new Uint8Array(7 * 1024 * 1024).fill(1)], 'cancel-me.png', { type: 'image/png' });
      let cancel = null;
      const pending = window.CrabbieAdminMedia.uploadMediaFile(file, '', { onCancelReady: (fn) => { cancel = fn; } });
      await new Promise((resolve) => setTimeout(resolve, 20));
      // Cancel only once the resumable transfer is actually in flight.
      for (let i = 0; i < 200 && !window.__routerTusCalls.some((call) => call.started); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      cancel();
      let outcome = 'resolved';
      let message = '';
      try { await pending; } catch (err) { outcome = 'rejected'; message = err.message; }
      return { outcome, message, aborted: window.__routerTusCalls.some((call) => call.aborted), rows: window.__routerRows.media.length - before, local: 0 };
    });
    assert.equal(cancelRun.outcome, 'rejected', 'cancel never reports success');
    assert.match(cancelRun.message, /cancel/i);
    assert.equal(cancelRun.aborted, true, 'cancel aborts the resumable request');
    assert.equal(cancelRun.rows, 0, 'cancel creates no media row');
    console.log('PASS cancelling a resumable upload aborts it and creates no row (SDK fixture)');

    // Tests 19-20: content digest dedupe and digest persistence.
    const dedupeRun = await page.evaluate(async () => {
      const bytes = new Uint8Array(4096).fill(11);
      const digestBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const digest = Array.from(new Uint8Array(digestBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const smallBuffer = await crypto.subtle.digest('SHA-256', new Uint8Array(1024));
      const smallDigest = Array.from(new Uint8Array(smallBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      window.__routerRows.media.push({
        id: '00000000-0000-4000-8000-00000000aaaa', bucket_id: 'media', storage_path: 'uploads/already-here.png',
        original_name: 'already-here.png', mime_type: 'image/png', size_bytes: bytes.length, alt_text: 'x',
        sha256: digest, deletion_status: 'active', deleted_at: null, deletion_error: null, created_at: '2026-03-01T00:00:00Z'
      });
      window.__routerStorageWrites = [];
      const before = window.__routerRows.media.length;
      const item = await window.CrabbieAdminMedia.uploadMediaFile(new File([bytes], 'reupload.png', { type: 'image/png' }), '');
      const stored = window.__routerRows.media.find((row) => row.original_name === 'small-art.png');
      return {
        deduplicated: item.deduplicated,
        reusedId: item.id,
        digest,
        smallDigest,
        storedDigest: stored ? stored.sha256 : null,
        storageWrites: window.__routerStorageWrites.length,
        rowGrowth: window.__routerRows.media.length - before
      };
    });
    assert.equal(dedupeRun.deduplicated, true, 'an identical file reuses the existing media record');
    assert.equal(dedupeRun.reusedId, '00000000-0000-4000-8000-00000000aaaa');
    assert.equal(dedupeRun.storageWrites, 0, 'a duplicate never uploads another copy');
    assert.equal(dedupeRun.rowGrowth, 0, 'a duplicate never creates a second row');
    assert.equal(dedupeRun.storedDigest, dedupeRun.smallDigest, 'a stored row keeps the SHA-256 it was uploaded with');
    console.log('PASS SHA-256 duplicates reuse the existing record and new rows keep their digest (SDK fixture)');

    // Test 22: validation still runs before either upload path.
    const validationRun = await page.evaluate(async () => {
      window.__routerStorageWrites = [];
      const attempts = {};
      const attempt = async (label, file) => {
        try { await window.CrabbieAdminMedia.uploadMediaFile(file, ''); attempts[label] = 'uploaded'; }
        catch (err) { attempts[label] = err.message; }
      };
      await attempt('unsupported', new File([new Uint8Array(64)], 'notes.txt', { type: 'text/plain' }));
      await attempt('oversized', { name: 'huge.png', type: 'image/png', size: 60 * 1024 * 1024 });
      return { attempts, storageWrites: window.__routerStorageWrites.length };
    });
    assert.match(validationRun.attempts.unsupported, /Unsupported file type/i, 'an unsupported MIME never reaches Storage');
    assert.match(validationRun.attempts.oversized, /exceeds 50MB/i, 'an oversized file never reaches Storage');
    assert.equal(validationRun.storageWrites, 0, 'no upload path ran for a rejected file');
    console.log('PASS MIME and size validation still block both upload paths (SDK fixture)');

    // Tests 24-25: token refresh and repeated panel opens stay quiet.
    const readsBeforeRefresh = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.range).length);
    await page.evaluate(() => window.__routerEmit('TOKEN_REFRESHED'));
    await page.waitForTimeout(300);
    const readsAfterRefresh = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.range).length);
    assert.equal(readsAfterRefresh, readsBeforeRefresh, 'a token refresh performs no paged reload');

    const mediaReadsBeforeReopen = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range).length);
    await goToModule('dashboard');
    await goToModule('media');
    const mediaReadsAfterReopen = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range).length);
    assert.ok(mediaReadsAfterReopen <= mediaReadsBeforeReopen + 1, 'reopening the media module never duplicates page queries (reads: ' + mediaReadsAfterReopen + ')');
    assert.equal(await page.locator('[data-adm-upload-status]').count() <= 1, true, 'the upload status strip is never duplicated');
    console.log('PASS token refresh reloads nothing and reopened panels do not duplicate requests (SDK fixture)');

    // ---- Batch 5 Group 1: Media Manager styles (CSS only) ------------------
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    const served = await (await fetch(origin + '/')).text();
    const styleBlocks = Array.from(served.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).map((match) => match[1]);
    assert.ok(styleBlocks.length > 0, 'the page ships inline styles');
    const styleText = styleBlocks.join('\n');
    let depth = 0;
    let malformed = false;
    for (const char of styleText) {
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      if (depth < 0) { malformed = true; break; }
    }
    assert.equal(malformed, false, 'stylesheet braces never underflow');
    assert.equal(depth, 0, 'stylesheet braces are balanced (no swallowed markup)');
    ['.adm-media-toolbar', '.adm-view-toggle', '.adm-bulk-bar', '.adm-media-row', '.adm-preview-host', '.adm-preview-visual', '.adm-dropzone-active', '.adm-media-pickbox'].forEach((selector) => {
      assert.ok(styleText.indexOf(selector) !== -1, 'the stylesheet ships ' + selector);
    });
    console.log('PASS the media manager stylesheet is present and parsed (SDK fixture)');

    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await page.evaluate(() => { window.location.hash = '#admin/media'; });
    await page.waitForTimeout(300);
    const viewports = [
      { width: 1440, height: 900, label: 'desktop' },
      { width: 820, height: 1180, label: 'tablet' },
      { width: 390, height: 844, label: 'mobile' }
    ];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(150);
      const box = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      assert.ok(box.scrollWidth <= box.clientWidth + 4, viewport.label + ' admin media view has no horizontal overflow (' + box.scrollWidth + '/' + box.clientWidth + ')');
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    console.log('PASS desktop, tablet and mobile admin media views have no horizontal overflow (SDK fixture)');

    // Bug fix: intrinsic image dimensions must never resize a thumbnail box.
    // Real app markup + classes with offline SVG data URLs of known sizes.
    await page.evaluate(() => {
      const svg = (w, h) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#ff5c9a"/></svg>');
      const shots = [
        { label: 'portrait', src: svg(10, 100) },
        { label: 'landscape', src: svg(100, 10) },
        { label: 'square', src: svg(40, 40) },
        { label: 'extreme-portrait', src: svg(4, 120) },
        { label: 'broken', src: 'data:image/png;base64,NOT-AN-IMAGE' }
      ];
      const host = document.createElement('div');
      host.id = 'thumbRatioProbe';
      host.setAttribute('style', 'position:fixed;left:-9999px;top:0;width:1200px;');
      host.innerHTML = '<div class="adm-media-grid">' + shots.map((shot) =>
        '<div class="adm-media-card"><div class="adm-media-thumb"><img src="' + shot.src + '" data-probe="' + shot.label + '" alt="' + shot.label + '"></div></div>'
      ).join('') + '</div>';
      document.body.appendChild(host);
    });
    await page.waitForFunction(() => {
      const imgs = Array.prototype.slice.call(document.querySelectorAll('#thumbRatioProbe img'));
      return imgs.length === 5 && imgs.every((img) => img.complete);
    });
    const thumbProbe = await page.evaluate(() => {
      const boxes = Array.prototype.map.call(document.querySelectorAll('#thumbRatioProbe .adm-media-thumb'), (box) => {
        const img = box.querySelector('img');
        const style = img ? getComputedStyle(img) : null;
        // The thumb keeps a 2px bottom border under border-box sizing.
        return {
          height: box.clientHeight,
          expected: (box.clientWidth * 10) / 16 - 2,
          imgPosition: style ? style.position : '',
          imgFit: style ? style.objectFit : ''
        };
      });
      document.getElementById('thumbRatioProbe').remove();
      return boxes;
    });
    assert.equal(thumbProbe.length, 5, 'portrait, landscape, square, extreme portrait and broken thumbnails are all probed');
    const thumbHeights = thumbProbe.map((box) => box.height);
    assert.ok(Math.max.apply(null, thumbHeights) - Math.min.apply(null, thumbHeights) <= 2, 'intrinsic dimensions never resize the grid row');
    thumbProbe.forEach((box, index) => {
      assert.ok(Math.abs(box.height - box.expected) <= 2, 'thumbnail box ' + index + ' keeps the 16/10 ratio (' + box.height + 'px vs ' + box.expected.toFixed(1) + 'px)');
      assert.equal(box.imgPosition, 'absolute', 'thumbnail image ' + index + ' is removed from grid sizing');
      assert.equal(box.imgFit, 'cover', 'thumbnail image ' + index + ' crops with cover');
    });
    console.log('PASS media thumbnails keep a stable ratio for portrait, landscape, square, extreme and broken images (SDK fixture)');

    // ---- Batch 5 Group 3: media query shape, one scoped server query ------
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.evaluate(() => {
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.media = [{
        id: '00000000-0000-4000-8000-000000000960', bucket_id: 'media', storage_path: 'uploads/art0.png',
        original_name: 'art0.png', mime_type: 'image/png', size_bytes: 1024, alt_text: 'art0', sha256: null,
        deletion_status: 'active', deleted_at: null, deletion_error: null, created_at: '2026-01-01T00:00:00Z'
      }];
      window.__routerReads = [];
      window.__routerQueryCount = {};
    });
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await page.evaluate(() => { window.location.hash = '#admin/media'; });
    await page.waitForFunction(() => (window.__routerReads || []).some((read) => read.table === 'media' && read.range));
    const mediaPanelReads = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range));
    assert.equal(mediaPanelReads.length, 1, 'the panel loads its page exactly once');
    assert.deepEqual(mediaPanelReads[0].range, [0, 29], 'the default page is a bounded range');
    assert.equal(mediaPanelReads[0].count, 'exact', 'the page query asks for an exact count');
    assert.ok(mediaPanelReads[0].filters.some((filter) => filter[0] === 'deletion_status' && filter[1] === 'active'), 'media queries stay active-only');
    assert.deepEqual(mediaPanelReads[0].order, { column: 'created_at', ascending: false }, 'newest-first is the default order');

    const shape = await page.evaluate(async () => {
      const api = window.CrabbieAdminMedia;
      const readOne = async (options) => {
        const before = (window.__routerReads || []).length;
        await api.loadMediaPage(options);
        const reads = (window.__routerReads || []).slice(before).filter((read) => read.table === 'media');
        return { reads, range: reads[0] ? reads[0].range : null };
      };
      return {
        typed: await readOne({ page: 2, type: 'image', sort: 'oldest', search: 'petal', from: '2026-01-01', to: '2026-12-31' }),
        videoOnly: await readOne({ page: 1, type: 'video' }),
        documents: await readOne({ page: 1, type: 'document' }),
        audioOnly: await readOne({ page: 1, type: 'audio' }),
        noFilters: await readOne({ page: 1 })
      };
    });

    const typed = shape.typed.reads[0];
    assert.equal(shape.typed.reads.length, 1, 'one query per filtered load');
    assert.deepEqual(shape.typed.range, [30, 59], 'page two requests only its range');
    assert.equal(typed.count, 'exact', 'the scoped query asks for an exact count');
    assert.ok(typed.filters.some((filter) => filter[0] === 'deletion_status' && filter[1] === 'active'), 'active-only is always present');
    assert.ok(typed.filters.some((filter) => filter[0] === 'original_name.ilike' && filter[1] === '%petal%'), 'search reaches the query');
    assert.ok(typed.filters.some((filter) => filter[0] === 'or' && filter[1].indexOf('mime_type.like.image/') !== -1), 'image type reaches the query');
    assert.ok(typed.filters.some((filter) => filter[0] === 'created_at.gte' && filter[1] === '2026-01-01T00:00:00.000Z'), 'from date reaches the query');
    assert.ok(typed.filters.some((filter) => filter[0] === 'created_at.lte' && filter[1] === '2026-12-31T23:59:59.999Z'), 'to date reaches the query');
    assert.deepEqual(typed.order, { column: 'created_at', ascending: true }, 'oldest-first reaches the order');

    assert.equal(shape.videoOnly.reads.length, 1, 'one query per type change');
    assert.ok(shape.videoOnly.reads[0].filters.some((filter) => filter[0] === 'or' && filter[1].indexOf('mime_type.like.video/') !== -1), 'video type reaches the query');
    assert.ok(shape.documents.reads[0].filters.some((filter) => filter[0] === 'or' && filter[1].indexOf('application/pdf') !== -1), 'document type reaches the query');
    assert.ok(shape.audioOnly.reads[0].filters.some((filter) => filter[0] === 'or' && filter[1].indexOf('mime_type.like.audio/') !== -1), 'audio type reaches the query');

    const clean = shape.noFilters.reads[0];
    assert.equal(shape.noFilters.reads.length, 1, 'one query for a default load');
    assert.equal(clean.filters.some((filter) => filter[0] === 'original_name.ilike'), false, 'no search means no ilike');
    assert.equal(clean.filters.some((filter) => filter[0] === 'or'), false, 'all-types adds no type predicate');
    assert.equal(clean.filters.some((filter) => filter[0] === 'created_at.gte'), false, 'no from date means no gte');
    assert.deepEqual(clean.range, [0, 29], 'the default load starts at page one');

    const shapeReads = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range).length);
    assert.equal(shapeReads, 6, 'no fan-out: one panel query plus one per explicit load');
    console.log('PASS media query shape is one scoped server query per load (SDK fixture)');

    // ---- Batch 5 Group 4: media toolbar, filters and grid/list views ------
    const mgrReads = async () => page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range).length);
    const mgrLastRead = async () => page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range).slice(-1)[0]);
    const mgrWaitReads = (count) => page.waitForFunction((target) => ((window.__routerReads || []).filter((read) => read.table === 'media' && read.range).length) === target, count);
    const mgrTitles = async (selector) => page.$$eval('#adminContent ' + selector + ' .mb-title', (els) => els.map((el) => el.textContent));

    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.evaluate(() => {
      const rows = [];
      const files = [
        ['image/png', 'art0.png'], ['image/gif', 'loop1.gif'], ['video/mp4', 'clip1.mp4'],
        ['audio/mpeg', 'tune1.mp3'], ['application/pdf', 'spec1.pdf']
      ];
      files.forEach((entry, index) => rows.push({
        id: '00000000-0000-4000-8000-0000000009' + String(70 + index),
        bucket_id: 'media', storage_path: 'uploads/' + entry[1], original_name: entry[1],
        mime_type: entry[0], size_bytes: 1024 * (index + 1), alt_text: 'alt ' + index, sha256: null,
        deletion_status: 'active', deleted_at: null, deletion_error: null,
        created_at: '2026-02-0' + (index + 1) + 'T00:00:00Z'
      }));
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.media = rows;
      window.__routerReads = [];
      window.__routerQueryCount = {};
      window.__routerStorageWrites = [];
    });
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await page.evaluate(() => { window.location.hash = '#admin/media'; });
    await page.waitForFunction(() => document.querySelectorAll('#adminContent .adm-media-card').length > 0);
    const mgrPanelReads = await mgrReads();
    assert.equal(mgrPanelReads, 1, 'the media panel still loads exactly one page on open');
    assert.equal(await page.locator('#adminContent [data-adm-media-toolbar="1"]').count(), 1, 'the toolbar is rendered once');
    assert.equal(await page.locator('#adminContent [data-adm-media-drop="1"]').count(), 1, 'the media grid is the drop target');

    const mgrGridTitles = await mgrTitles('.adm-media-card');
    assert.equal(mgrGridTitles.length, 5, 'the page renders every loaded row');
    await page.locator('#adminContent [data-adm-media-view="list"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#adminContent .adm-media-row').length > 0);
    assert.equal(await mgrReads(), mgrPanelReads, 'grid -> list issues zero queries');
    assert.deepEqual(await mgrTitles('.adm-media-row'), mgrGridTitles, 'grid -> list reuses the loaded rows');
    assert.equal(await page.locator('#adminContent [data-adm-media-view="list"]').getAttribute('aria-pressed'), 'true', 'the list toggle reports pressed');
    assert.equal(await page.locator('#adminContent [data-adm-media-view="grid"]').getAttribute('aria-pressed'), 'false', 'the grid toggle reports released');
    assert.equal(await page.locator('#adminContent [data-adm-media-pageinfo="1"]').innerText(), 'Page 1 / 1 · 5 files', 'a view switch never changes the page');
    assert.equal(await page.locator('#adminContent [data-adm-media-filtersummary="1"]').count(), 0, 'a view switch adds no filter summary');

    await page.locator('#adminContent [data-adm-media-view="grid"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#adminContent .adm-media-card').length > 0);
    assert.equal(await mgrReads(), mgrPanelReads, 'list -> grid issues zero queries');
    assert.deepEqual(await mgrTitles('.adm-media-card'), mgrGridTitles, 'list -> grid reuses the loaded rows');

    await page.locator('#adminContent [data-adm-media-search]').fill('petal');
    await mgrWaitReads(mgrPanelReads + 1);
    const mgrSearchRead = await mgrLastRead();
    assert.ok(mgrSearchRead.filters.some((filter) => filter[0] === 'original_name.ilike' && filter[1] === '%petal%'), 'search reaches the server query');
    assert.ok(mgrSearchRead.filters.some((filter) => filter[0] === 'deletion_status' && filter[1] === 'active'), 'search keeps the active-only filter');
    assert.deepEqual(mgrSearchRead.range, [0, 29], 'a search restarts at page one');
    assert.equal(await page.locator('#adminContent [data-adm-media-filtersummary="1"]').innerText(), 'Filtered by “petal”', 'the active filter is announced');

    await page.locator('#adminContent [data-adm-media-filter="type"]').selectOption('image');
    await mgrWaitReads(mgrPanelReads + 2);
    const mgrTypeRead = await mgrLastRead();
    assert.ok(mgrTypeRead.filters.some((filter) => filter[0] === 'or' && filter[1].indexOf('mime_type.like.image/') !== -1), 'the type filter is applied by the server');
    assert.ok(mgrTypeRead.filters.some((filter) => filter[0] === 'original_name.ilike'), 'the type change keeps the search predicate');
    assert.deepEqual(mgrTypeRead.range, [0, 29], 'a type change restarts at page one');

    await page.locator('#adminContent [data-adm-media-filter="sort"]').selectOption('oldest');
    await mgrWaitReads(mgrPanelReads + 3);
    const mgrSortRead = await mgrLastRead();
    assert.deepEqual(mgrSortRead.order, { column: 'created_at', ascending: true }, 'the sort control reaches the query order');

    await page.locator('#adminContent [data-adm-media-filter="from"]').fill('2026-01-01');
    await mgrWaitReads(mgrPanelReads + 4);
    await page.locator('#adminContent [data-adm-media-filter="to"]').fill('2026-12-31');
    await mgrWaitReads(mgrPanelReads + 5);
    const mgrDateRead = await mgrLastRead();
    assert.ok(mgrDateRead.filters.some((filter) => filter[0] === 'created_at.gte' && filter[1] === '2026-01-01T00:00:00.000Z'), 'the from date reaches the query');
    assert.ok(mgrDateRead.filters.some((filter) => filter[0] === 'created_at.lte' && filter[1] === '2026-12-31T23:59:59.999Z'), 'the to date reaches the query');

    await page.locator('#adminContent [data-adm-media-clear]').click();
    await mgrWaitReads(mgrPanelReads + 6);
    const mgrClearedRead = await mgrLastRead();
    assert.equal(mgrClearedRead.filters.some((filter) => filter[0] === 'original_name.ilike'), false, 'clearing removes the search predicate');
    assert.equal(mgrClearedRead.filters.some((filter) => filter[0] === 'or'), false, 'clearing removes the type predicate');
    assert.equal(mgrClearedRead.filters.some((filter) => /created_at\.(gte|lte)/.test(filter[0])), false, 'clearing removes the date range');
    assert.ok(mgrClearedRead.filters.some((filter) => filter[0] === 'deletion_status' && filter[1] === 'active'), 'clearing keeps the active-only filter');
    assert.deepEqual(mgrClearedRead.order, { column: 'created_at', ascending: false }, 'clearing restores the default order');
    assert.equal(await page.locator('#adminContent [data-adm-media-search]').inputValue(), '', 'the search box is reset');
    assert.equal(await page.locator('#adminContent [data-adm-media-filter="type"]').inputValue(), 'all', 'the type filter is reset');
    assert.equal(await page.locator('#adminContent [data-adm-media-filter="sort"]').inputValue(), 'newest', 'the sort is reset');
    assert.equal(await page.locator('#adminContent [data-adm-media-filter="from"]').inputValue(), '', 'the from date is reset');
    assert.equal(await mgrReads(), mgrPanelReads + 6, 'six query controls issued exactly six queries');

    for (const viewport of [{width: 1440, height: 900, label: 'desktop'}, {width: 820, height: 1180, label: 'tablet'}, {width: 390, height: 844, label: 'mobile'}]) {
      await page.setViewportSize({width: viewport.width, height: viewport.height});
      await page.waitForTimeout(120);
      const box = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        toolbar: document.querySelector('#adminContent [data-adm-media-toolbar="1"]') !== null
      }));
      assert.ok(box.scrollWidth <= box.clientWidth + 4, viewport.label + ' media manager has no horizontal overflow (' + box.scrollWidth + '/' + box.clientWidth + ')');
      assert.equal(box.toolbar, true, viewport.label + ' keeps the media toolbar mounted');
    }
    await page.setViewportSize({width: 1280, height: 800});
    console.log('PASS media toolbar filters server-side once and grid/list reuse the loaded page (SDK fixture)');

    // ---- Batch 5 Group 5: lazy preview, canonical URLs and item actions ---
    const pvSeedId = (index) => '00000000-0000-4000-8000-0000000009' + String(70 + index);
    const pvCard = (index) => '#adminContent [data-adm-media-card="' + pvSeedId(index) + '"]';
    const pvPreviewBtn = (index) => pvCard(index) + ' [data-adm-media-inspect]';
    const pvAltBtn = (index) => pvCard(index) + ' [data-adm-media-alt]';
    const pvReads = async () => page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.range).length);

    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.evaluate(() => {
      const files = [
        ['image/png', 'art0.png'], ['image/gif', 'loop1.gif'], ['video/mp4', 'clip1.mp4'],
        ['audio/mpeg', 'tune1.mp3'], ['application/pdf', 'spec1.pdf'], ['text/plain', 'notes.txt']
      ];
      const rows = files.map((entry, index) => ({
        id: '00000000-0000-4000-8000-0000000009' + String(70 + index),
        bucket_id: 'media', storage_path: 'uploads/' + entry[1], original_name: entry[1],
        mime_type: entry[0], size_bytes: 1024 * (index + 1), alt_text: 'alt ' + index, sha256: null,
        deletion_status: 'active', deleted_at: null, deletion_error: null,
        created_at: '2026-02-0' + (index + 1) + 'T00:00:00Z'
      }));
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.media = rows;
      window.__routerReads = [];
      window.__routerQueryCount = {};
      window.__routerCopies = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: (value) => { window.__routerCopies.push(value); return Promise.resolve(); } }
      });
    });
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await page.evaluate(() => { window.location.hash = '#admin/media'; });
    await page.waitForFunction(() => document.querySelectorAll('#adminContent .adm-media-card').length === 6);
    const pvPanelReads = await pvReads();
    assert.equal(await page.locator('#adminMediaPreviewModal.open').count(), 0, 'the preview modal stays closed until it is asked for');

    const pvKinds = [
      { index: 0, file: 'art0.png', kind: 'image', tag: 'img' },
      { index: 1, file: 'loop1.gif', kind: 'image', tag: 'img' },
      { index: 2, file: 'clip1.mp4', kind: 'video', tag: 'video' },
      { index: 3, file: 'tune1.mp3', kind: 'audio', tag: 'audio' },
      { index: 4, file: 'spec1.pdf', kind: 'pdf', tag: 'a' },
      { index: 5, file: 'notes.txt', kind: 'unsupported', tag: 'a' }
    ];
    for (const entry of pvKinds) {
      await page.locator(pvPreviewBtn(entry.index)).click();
      await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaPreviewModal.open [data-adm-preview-kind]')));
      assert.equal(await page.locator('#adminMediaPreviewModal [data-adm-preview-kind]').getAttribute('data-adm-preview-kind'), entry.kind, 'preview kind for ' + entry.file);
      const pvOriginal = await page.locator('#adminMediaPreviewModal [data-adm-preview-original]').first().getAttribute('data-adm-preview-original');
      assert.ok(pvOriginal.indexOf('/uploads/' + entry.file) !== -1, 'preview uses the canonical original for ' + entry.file + ' (' + pvOriginal + ')');
      assert.equal(await page.locator('#adminMediaPreviewModal [data-adm-preview-original]').first().evaluate((el) => el.tagName.toLowerCase()), entry.tag, 'preview element for ' + entry.file);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#adminMediaPreviewModal.open'));
      const pvFocusBack = await page.evaluate((id) => document.activeElement === document.querySelector('#adminContent [data-adm-media-inspect="' + id + '"]'), pvSeedId(entry.index));
      assert.equal(pvFocusBack, true, 'Escape returns focus to the trigger for ' + entry.file);
    }
    assert.equal(await pvReads(), pvPanelReads, 'opening and closing previews never queries the server');

    const pvCanonical = await page.locator(pvCard(0) + ' img[data-adm-thumb-original]').getAttribute('data-adm-thumb-original');
    assert.ok(pvCanonical && pvCanonical.indexOf('/uploads/art0.png') !== -1, 'the card records the canonical original for fallback');
    await page.locator(pvPreviewBtn(0)).click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaPreviewModal.open [data-adm-preview-original]')));
    assert.equal(await page.locator('#adminMediaPreviewModal [data-adm-preview-url]').getAttribute('data-adm-preview-url'), pvCanonical, 'the preview host carries the canonical URL');
    await page.locator('#adminMediaPreviewModal [data-adm-preview-copy]').click();
    const pvCopies = await page.evaluate(() => window.__routerCopies.slice());
    assert.equal(pvCopies.length, 1, 'one copy action writes exactly one clipboard entry');
    assert.equal(pvCopies[0], pvCanonical, 'Copy URL copies the canonical original, never a variant');
    await page.locator('#adminMediaPreviewModal [data-adm-preview-close]').click();
    await page.waitForFunction(() => !document.querySelector('#adminMediaPreviewModal.open'));

    for (let pvRound = 0; pvRound < 3; pvRound += 1) {
      await page.locator(pvPreviewBtn(2)).click();
      await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaPreviewModal.open')));
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('#adminMediaPreviewModal.open'));
    }
    assert.equal(await page.locator('#adminMediaPreviewModal').count(), 1, 'repeated opens never duplicate the modal');
    await page.locator(pvPreviewBtn(2)).click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaPreviewModal.open')));
    await page.locator('#adminMediaPreviewModal [data-adm-preview-copy]').click();
    assert.equal(await page.evaluate(() => window.__routerCopies.length), 2, 'three open/close cycles still copy exactly once per click');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#adminMediaPreviewModal.open'));

    await page.locator(pvCard(0) + ' [data-adm-media-copy]').click();
    const pvItemCopies = await page.evaluate(() => window.__routerCopies.slice());
    assert.equal(pvItemCopies.length, 3, 'the card copy button copies exactly once');
    assert.equal(pvItemCopies[2], pvCanonical, 'the card copy button copies the canonical original');

    await page.evaluate(() => {
      const media = window.CrabbieAdminMedia;
      window.__routerAltCalls = [];
      media.updateMediaAltText = async (id, altText) => { window.__routerAltCalls.push({ id, altText }); return { success: true, item: { id, alt: altText } }; };
    });
    await page.locator(pvAltBtn(1)).click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaPreviewModal.open [data-adm-preview-alt="1"]')));
    await page.locator('#adminMediaPreviewModal [data-adm-preview-alt="1"]').fill('petal loop');
    await page.locator('#adminMediaPreviewModal [data-adm-preview-alt-save]').click();
    await page.waitForFunction(() => (window.__routerAltCalls || []).length === 1);
    assert.deepEqual(await page.evaluate(() => window.__routerAltCalls.slice()), [{ id: pvSeedId(1), altText: 'petal loop' }], 'alt text is saved for the previewed row only');
    await page.waitForFunction((id) => {
      const image = document.querySelector('#adminContent [data-adm-media-card="' + id + '"] img');
      return Boolean(image) && image.getAttribute('alt') === 'petal loop';
    }, pvSeedId(1));
    assert.equal(await page.locator(pvCard(0) + ' img').getAttribute('alt'), 'alt 0', 'other rows keep their own alt text');
    assert.equal(await page.evaluate(() => window.__routerAltCalls.length), 1, 'one alt save issues exactly one update');

    const pvHtml = await (await fetch(origin + '/')).text();
    const pvRenderer = pvHtml.match(/function mgrPreviewHtml\(item\)\{[\s\S]*?\n\}/);
    assert.ok(pvRenderer, 'the preview renderer is shipped');
    assert.match(pvRenderer[0], /descriptor\.original/, 'the preview renderer uses the canonical original');
    assert.doesNotMatch(pvRenderer[0], /thumbnailUrl/, 'the preview renderer never uses a thumbnail variant');
    assert.match(pvHtml, /applyMediaPickerItems\(\[m\]\)/, 'the picker routes a canonical record through the shared Apply function');
    assert.doesNotMatch(pvHtml, /setByPath\(ADMIN_DRAFT, [^,]+, [^)]*thumbnailUrl/, 'CMS fields never receive a thumbnail URL');
    console.log('PASS media preview is lazy, canonical, accessible and action handlers never duplicate (SDK fixture)');

    // ---- Batch 5 Group 6: drag/drop reuses the uploader, picker multi ------
    const ixSeed = (index) => '00000000-0000-4000-8000-0000000009' + String(70 + index);
    const ixMediaReads = async () => page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media').length);
    const ixItemUrls = () => page.evaluate(() => Array.prototype.map.call(
      document.querySelectorAll('#adminContent .adm-media-item .mi-thumb img'),
      (img) => img.getAttribute('src')));

    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.evaluate(() => {
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.media = ['art0.png', 'loop1.gif', 'art2.png'].map((name, index) => ({
        id: '00000000-0000-4000-8000-0000000009' + String(70 + index),
        bucket_id: 'media', storage_path: 'uploads/' + name, original_name: name,
        mime_type: index === 1 ? 'image/gif' : 'image/png',
        size_bytes: 2048, alt_text: 'alt ' + index, sha256: null,
        deletion_status: 'active', deleted_at: null, deletion_error: null,
        created_at: '2026-03-0' + (index + 1) + 'T00:00:00Z'
      }));
      window.__routerRows.portfolio_projects = [{
        id: '00000000-0000-4000-8000-000000000401', slug: 'ix-project', title: 'Interactions project',
        description: 'Blocks', category: 'illustration', tags: [], thumbnail_path: '', cover_path: '',
        content: { blocks: [{ type: 'gallery', open: true, items: [] }] },
        featured: false, published: true, placeholder: false, sort_order: 1,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
      }];
      window.__routerReads = [];
      window.__routerQueryCount = {};
      window.__routerWrites = [];
      window.__routerStorageWrites = [];
      window.__routerBulkCalls = [];
    });
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await page.evaluate(() => { window.location.hash = '#admin/media'; });
    await page.waitForFunction(() => document.querySelectorAll('#adminContent .adm-media-card').length >= 3);

    const ixDropUploads = await page.evaluate(() => (window.__routerStorageWrites || []).length);
    const ixReadsBeforeDrop = await page.evaluate(() => (window.__routerReads || []).length);
    const ixDropHighlight = await page.evaluate(() => {
      const zone = document.querySelector('#adminContent [data-adm-media-drop]');
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(64)], 'dropped.png', { type: 'image/png' }));
      const dragOver = new Event('dragover', { bubbles: true, cancelable: true });
      Object.defineProperty(dragOver, 'dataTransfer', { value: transfer });
      zone.dispatchEvent(dragOver);
      const highlighted = zone.classList.contains('adm-dropzone-active');
      const dragLeave = new Event('dragleave', { bubbles: true, cancelable: true });
      Object.defineProperty(dragLeave, 'dataTransfer', { value: transfer });
      zone.dispatchEvent(dragLeave);
      const cleared = !zone.classList.contains('adm-dropzone-active');
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: transfer });
      zone.dispatchEvent(drop);
      return { highlighted, cleared };
    });
    assert.deepEqual(ixDropHighlight, { highlighted: true, cleared: true }, 'the drop zone highlights while a file is dragged over it');
    await page.waitForFunction((count) => (window.__routerStorageWrites || []).length === count + 1, ixDropUploads);
    assert.deepEqual(await page.evaluate(() => (window.__routerStorageWrites || []).map((entry) => entry.operation + ':' + entry.contentType)), ['upload:image/png'], 'a dropped file goes through the existing upload pipeline exactly once');
    await page.waitForFunction((count) => (window.__routerReads || []).length > count, ixReadsBeforeDrop);
    assert.equal(await page.locator('[data-adm-upload-status]').count() <= 1, true, 'a drop never duplicates the upload status strip');

    const ixRejectedBefore = await page.evaluate(() => (window.__routerStorageWrites || []).length);
    await page.evaluate(() => {
      const zone = document.querySelector('#adminContent [data-adm-media-drop]');
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(16)], 'notes.txt', { type: 'text/plain' }));
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: transfer });
      zone.dispatchEvent(drop);
    });
    await page.waitForFunction(() => document.body.innerText.indexOf('No supported files in that drop.') !== -1);
    assert.equal(await page.evaluate(() => (window.__routerStorageWrites || []).length), ixRejectedBefore, 'an unsupported drop never reaches Storage');

    await page.evaluate(() => { window.location.hash = '#admin/portfolio'; });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-mediabrowse]')));
    const ixItemsTarget = await page.locator('#adminContent [data-adm-mediabrowse$=".items"]').getAttribute('data-adm-mediabrowse');
    assert.equal(ixItemsTarget.endsWith('.items'), true, 'the gallery block browses its items array');
    await page.locator('#adminContent [data-adm-mediabrowse$=".items"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#adminMediaModal.open [data-adm-pick-toggle]').length >= 3);
    assert.equal(await page.locator('#adminMediaModal [data-adm-pick-apply]').isDisabled(), true, 'the apply button waits for a selection');
    const ixPickerReads = await ixMediaReads();
    const ixTogglePick = (id) => page.evaluate((target) => {
      const box = document.querySelector('#adminMediaModal [data-adm-pick-toggle="' + target + '"]');
      if (!box) throw new Error('pick box missing for ' + target);
      box.click();
    }, id);
    const ixToggleIds = await page.$$eval('#adminMediaModal [data-adm-pick-toggle]', (els) => els.map((el) => el.getAttribute('data-adm-pick-toggle')));
    assert.equal(ixToggleIds.length >= 3, true, 'every loaded media row offers a pick checkbox');
    await ixTogglePick(ixToggleIds[0]);
    await ixTogglePick(ixToggleIds[2]);
    assert.equal(await ixMediaReads(), ixPickerReads, 'selecting media issues no query');
    assert.equal(await page.locator('#adminMediaModal [data-adm-media-card][aria-selected="true"]').count(), 2, 'selected picker cards announce aria-selected');
    await page.locator('#adminMediaModal [data-adm-pick-apply]').click();
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    await page.waitForFunction(() => document.querySelectorAll('#adminContent .adm-media-item .mi-thumb img').length === 2);
    const ixGalleryUrls = await ixItemUrls();
    assert.equal(ixGalleryUrls.length, 2, 'multi-select appends one gallery row per selected item');
    assert.ok(ixGalleryUrls.every((url) => url.indexOf('/uploads/') !== -1), 'gallery rows carry canonical URLs');

    const ixThumbPath = await page.evaluate(() => {
      const btn = document.querySelector('#adminContent [data-adm-mediabrowse$=".thumbnail"]');
      return btn ? btn.getAttribute('data-adm-mediabrowse') : null;
    });
    assert.ok(ixThumbPath, 'the project thumbnail field exists');
    await page.locator('#adminContent [data-adm-mediabrowse="' + ixThumbPath + '"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
    assert.equal(await page.locator('#adminMediaModal [data-adm-pick-toggle]').count(), 0, 'a single-value field offers no multi-select');
    await page.locator('#adminMediaModal [data-adm-pick]').first().click();
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    const ixThumbValue = await page.evaluate((target) => {
      const preview = document.querySelector('#adminContent [data-adm-media-preview="' + target + '"] img');
      return preview ? preview.getAttribute('src') : '';
    }, ixThumbPath);
    assert.ok(ixThumbValue.indexOf('/uploads/') !== -1, 'a single-value field previews exactly one canonical URL');
    assert.equal((await ixItemUrls()).length, 2, 'a single-value pick never touches the gallery rows');

    for (let ixRound = 0; ixRound < 3; ixRound += 1) {
      await page.locator('#adminContent [data-adm-mediabrowse="' + ixItemsTarget + '"]').click();
      await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
      await page.locator('#adminMediaCancel').click();
      await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    }
    const ixReadsBeforeStress = await ixMediaReads();
    await page.locator('#adminContent [data-adm-mediabrowse="' + ixItemsTarget + '"]').click();
    await page.waitForFunction(() => document.querySelectorAll('#adminMediaModal.open [data-adm-pick-toggle]').length >= 3);
    await ixTogglePick(ixToggleIds[1]);
    await page.locator('#adminMediaModal [data-adm-pick-apply]').click();
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    await page.waitForFunction(() => document.querySelectorAll('#adminContent .adm-media-item .mi-thumb img').length === 3);
    const ixStressUrls = await ixItemUrls();
    assert.equal(new Set(ixStressUrls).size, 3, 'three open/close cycles still append exactly one row for one action');
    const ixReadsAfterStress = await ixMediaReads();
    assert.ok(ixReadsAfterStress <= ixReadsBeforeStress + 1, 'reopening the picker never multiplies queries (' + ixReadsBeforeStress + ' -> ' + ixReadsAfterStress + ')');

    // ---- Batch 5 Group 6: bulk delete and the save shortcut ---------------
    await page.evaluate(() => { window.location.hash = '#admin/media'; });
    await page.waitForFunction(() => document.querySelectorAll('#adminContent .adm-media-card').length >= 3);
    await page.evaluate(() => {
      const media = window.CrabbieAdminMedia;
      media.bulkDeleteMedia = async (items) => {
        window.__routerBulkCalls.push({ ids: items.map((item) => item.id) });
        return items.map((item, index) => ({
          id: item.id,
          title: item.title,
          result: index === 0 ? { success: true } : { success: false, blocked: true, error: 'Referenced by a portfolio block' }
        }));
      };
    });
    const ixStorageBeforeBulk = await page.evaluate(() => (window.__routerStorageWrites || []).length);
    const ixCardIds = await page.$$eval('#adminContent [data-adm-media-card]', (els) => els.map((el) => el.getAttribute('data-adm-media-card')));
    assert.equal(ixCardIds.length >= 3, true, 'the media page lists every loaded row');
    await page.locator('#adminContent [data-adm-media-card="' + ixCardIds[0] + '"]').click();
    await page.locator('#adminContent [data-adm-media-card="' + ixCardIds[1] + '"]').click();
    assert.equal(await page.locator('#adminContent [data-adm-bulk-count]').innerText(), '2 selected', 'selecting cards fills the bulk bar');
    assert.equal(await page.locator('#adminContent [data-adm-media-card][aria-selected="true"]').count(), 2, 'selected manager cards announce aria-selected');
    await page.locator('#adminContent [data-adm-bulk-delete]').click();
    await page.waitForFunction(() => (window.__routerBulkCalls || []).length === 1);
    assert.deepEqual(await page.evaluate(() => window.__routerBulkCalls.map((call) => call.ids)), [[ixCardIds[0], ixCardIds[1]]], 'bulk delete hands every selected file to the per-file lifecycle');
    assert.equal(await page.evaluate(() => (window.__routerStorageWrites || []).length), ixStorageBeforeBulk, 'bulk delete never removes objects straight from Storage');
    await page.waitForFunction(() => {
      const summary = document.querySelector('#adminContent [data-adm-bulk-summary]');
      return Boolean(summary) && summary.textContent === 'Bulk delete — deleted: 1, blocked: 1.';
    });
    assert.equal(await page.locator('#adminContent [data-adm-bulk-summary]').isVisible(), true, 'the mixed result summary is announced in a live region');

    // Ctrl/Cmd+S saves only the current dirty target, once per key event.
    await page.evaluate(() => { window.location.hash = '#admin/portfolio'; });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-path$=".title"]')));
    if (await page.locator('#adminConfirmModal.open').count() > 0) {
      await page.locator('#adminConfirmOk').click();
      await page.waitForFunction(() => !document.querySelector('#adminConfirmModal.open'));
    }
    const ixDiscard = page.locator('#adminContent [data-adm-discard]');
    if (await ixDiscard.count() > 0) {
      await ixDiscard.first().click();
      await page.waitForFunction(() => Boolean(document.querySelector('#adminConfirmModal.open')));
      await page.locator('#adminConfirmOk').click();
      await page.waitForFunction(() => !document.querySelector('#adminConfirmModal.open'));
    }
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => (window.__routerWrites || []).length), 0, 'a clean draft is never written by the shortcut');

    const ixTitleField = page.locator('#adminContent [data-adm-path$=".title"]').first();
    await ixTitleField.fill('Shortcut saved title');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => (window.__routerWrites || []).length === 1);
    assert.deepEqual(await page.evaluate(() => window.__routerWrites.map((write) => write.table + ':' + write.operation)), ['portfolio_projects:update'], 'the shortcut writes the current module only');
    assert.equal(await page.evaluate(() => window.__routerRows.portfolio_projects[0].title), 'Shortcut saved title', 'the shortcut save reaches the database fixture');
    await page.waitForTimeout(500);

    await ixTitleField.fill('Second shortcut title');
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.keyboard.press('Control+s');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => (window.__routerWrites || []).length === 1);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => (window.__routerWrites || []).length), 1, 'two key events never produce two saves');
    assert.equal(await page.evaluate(() => window.__routerRows.portfolio_projects[0].title), 'Second shortcut title', 'exactly one shortcut save landed');

    await page.locator('#adminContent [data-adm-mediabrowse]').first().click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
    await ixTitleField.evaluate((el) => el.dispatchEvent(new Event('input', { bubbles: true })));
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => (window.__routerWrites || []).length), 1, 'the shortcut is blocked while a modal is open');
    await page.locator('#adminMediaCancel').click();
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));

    await ixTitleField.fill('Conflicting shortcut title');
    await page.evaluate(() => { window.__routerWrites = []; window.__routerWriteError = { table: 'portfolio_projects', operation: 'update', message: 'stale row version', code: '' }; });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => (window.__routerWrites || []).length === 1);
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => window.__routerRows.portfolio_projects[0].title), 'Second shortcut title', 'a conflicting save never overwrites the stored row');
    assert.match(await page.evaluate(() => document.getElementById('adminSaveStatus').className), /dirty/, 'a conflicting save keeps the draft dirty');
    console.log('PASS media drop, picker multi-select, bulk delete and the save shortcut stay single-action (SDK fixture)');

    // ---- Batch 5 Group 7: portfolio block integration and final a11y ------
    const blkSeed = ['art0.png', 'loop1.gif', 'clip1.mp4', 'tune1.mp3'];
    const blkBrowse = (target) => page.evaluate((path) => {
      const button = document.querySelector('#adminContent [data-adm-mediabrowse="' + path + '"]');
      if (!button) throw new Error('media button missing for ' + path);
      button.click();
    }, target);
    const blkPickFirst = () => page.evaluate(() => {
      document.querySelector('#adminMediaModal.open [data-adm-pick]').click();
    });
    const blkBlockPath = (target) => target.slice(0, target.lastIndexOf('.'));
    const blkFieldValue = (target) => page.evaluate((path) => {
      const preview = document.querySelector('#adminContent [data-adm-media-preview="' + path + '"] img');
      const chip = document.querySelector('#adminContent [data-adm-media-preview="' + path + '"] .adm-file-chip');
      return (preview && preview.getAttribute('src')) || (chip && chip.title) || null;
    }, target);

    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.evaluate((files) => {
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.media = files.map((name, index) => ({
        id: '00000000-0000-4000-8000-0000000008' + String(80 + index),
        bucket_id: 'media', storage_path: 'uploads/' + name, original_name: name,
        mime_type: index === 0 ? 'image/png' : (index === 1 ? 'image/gif' : (index === 2 ? 'video/mp4' : 'audio/mpeg')),
        size_bytes: 4096, alt_text: 'alt ' + index, sha256: null,
        deletion_status: 'active', deleted_at: null, deletion_error: null,
        created_at: '2026-04-0' + (index + 1) + 'T00:00:00Z'
      }));
      window.__routerRows.portfolio_projects = [{
        id: '00000000-0000-4000-8000-000000000402', slug: 'blocks-project', title: 'Blocks project',
        description: 'Every media block', category: 'illustration', tags: [], thumbnail_path: '', cover_path: '',
        content: { blocks: [
          { type: 'image', open: true, url: '', alt: '', caption: '' },
          { type: 'image-text', open: true, url: '', text: '', layout: 'left' },
          { type: 'gallery', open: true, items: [] },
          { type: 'grid', open: true, items: [] },
          { type: 'gif', open: true, url: '', caption: '' },
          { type: 'video', open: true, url: '', caption: '' },
          { type: 'before-after', open: true, before: '', after: '', caption: '' }
        ] },
        featured: false, published: true, placeholder: false, sort_order: 1,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
      }];
      window.__routerReads = [];
      window.__routerQueryCount = {};
      window.__routerWrites = [];
      window.__routerStorageWrites = [];
    }, blkSeed);
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await page.evaluate(() => { window.location.hash = '#admin/portfolio'; });
    await page.waitForFunction(() => document.querySelectorAll('#adminContent [data-adm-block-field]').length > 0);

    const blkTypes = await page.$$eval('#adminContent .adm-block .ab-type', (els) => els.map((el) => el.textContent));
    assert.equal(blkTypes.length, 7, 'every media block type renders');
    const blkTargets = await page.$$eval('#adminContent [data-adm-mediabrowse]', (els) => els.map((el) => el.getAttribute('data-adm-mediabrowse')));
    ['url', 'items', 'before', 'after'].forEach((field) => {
      assert.ok(blkTargets.some((target) => target.endsWith('.' + field)), 'the media library is wired into ' + field + ' fields');
    });
    assert.equal(blkTargets.filter((target) => target.endsWith('.items')).length, 2, 'gallery and grid both browse their items array');
    assert.equal(blkTargets.filter((target) => target.endsWith('.before')).length, 1, 'before-after exposes a separate before target');
    assert.equal(blkTargets.filter((target) => target.endsWith('.after')).length, 1, 'before-after exposes a separate after target');
    assert.equal(blkTargets.filter((target) => target.endsWith('.url')).length, 4, 'image, image-text, gif and video each browse one URL field');

    const blkImageTarget = blkTargets.filter((target) => target.endsWith('.url'))[0];
    await blkBrowse(blkImageTarget);
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
    assert.equal(await page.locator('#adminMediaModal [data-adm-pick-toggle]').count(), 0, 'an image block field stays single-select');
    await blkPickFirst();
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    const blkImageValue = await blkFieldValue(blkImageTarget);
    assert.ok(blkImageValue && blkImageValue.indexOf('/uploads/') !== -1, 'an image block stores one canonical URL');
    assert.equal(await page.locator('#adminContent [data-adm-mi-path]').count(), 0, 'a single-value block never becomes an array');
    assert.equal(await page.locator('#adminContent [data-adm-media-preview="' + blkImageTarget + '"] img').count(), 1, 'the picked image shows a preview instead of a raw URL input');

    for (const itemsTarget of blkTargets.filter((target) => target.endsWith('.items'))) {
      await blkBrowse(itemsTarget);
      await page.waitForFunction(() => document.querySelectorAll('#adminMediaModal.open [data-adm-pick-toggle]').length >= 2);
      assert.equal(await page.locator('#adminMediaModal [data-adm-pick-apply]').innerText(), 'Use selected (0)', 'reopened Picker begins with no stale selection');
      const blkToggleIds = await page.$$eval('#adminMediaModal [data-adm-pick-toggle]', (els) => els.map((el) => el.getAttribute('data-adm-pick-toggle')));
      await page.evaluate((ids) => {
        ids.forEach((id) => document.querySelector('#adminMediaModal [data-adm-pick-toggle="' + id + '"]').click());
        document.querySelector('#adminMediaModal.open [data-adm-pick-apply]').click();
      }, [blkToggleIds[0], blkToggleIds[1]]);
      assert.equal(await page.locator('#adminMediaModal [data-adm-pick-apply]').innerText(), 'Use selected (2)', 'Picker count matches the two records being applied');
      await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
      const blockPath = blkBlockPath(itemsTarget);
      await page.waitForFunction((path) => Array.prototype.filter.call(
        document.querySelectorAll('#adminContent [data-adm-mi-replace="' + path + '"]'),
        (btn) => Boolean(btn.closest('.adm-media-item').querySelector('.mi-thumb img'))
      ).length >= 2, blockPath);
      const rows = await page.evaluate((path) => Array.prototype.map.call(
        document.querySelectorAll('#adminContent [data-adm-mi-replace="' + path + '"]'),
        (btn) => btn.closest('.adm-media-item').querySelector('.mi-thumb img')?.getAttribute('src') || '').filter(Boolean), blockPath);
      assert.equal(rows.length, 2, 'a media-list block receives every selected item');
      assert.ok(rows.every((url) => url.indexOf('/uploads/') !== -1), 'media-list rows carry canonical URLs');
    }

    const blkReadField = (blockPath, field) => page.evaluate((args) => {
      const pick = document.querySelector('#adminContent [data-adm-mediabrowse="' + args.path + '.' + args.field + '"]');
      if (!pick) return null;
      const preview = document.querySelector('#adminContent [data-adm-media-preview="' + args.path + '.' + args.field + '"] img');
      const chip = document.querySelector('#adminContent [data-adm-media-preview="' + args.path + '.' + args.field + '"] .adm-file-chip');
      return (preview && preview.getAttribute('src')) || (chip && chip.textContent) || '';
    }, { path: blockPath, field });
    const blkBeforeTarget = blkTargets.filter((entry) => entry.endsWith('.before'))[0];
    const blkAfterTarget = blkTargets.filter((entry) => entry.endsWith('.after'))[0];
    assert.equal(blkBlockPath(blkBeforeTarget), blkBlockPath(blkAfterTarget), 'before and after belong to the same block');
    const blkPickNth = (position) => page.evaluate((index) => {
      const buttons = document.querySelectorAll('#adminMediaModal.open [data-adm-pick]');
      if (!buttons[index]) throw new Error('picker item ' + index + ' is missing');
      buttons[index].click();
    }, position);
    for (const pair of [[blkBeforeTarget, 'before', 0], [blkAfterTarget, 'after', 1]]) {
      await blkBrowse(pair[0]);
      await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
      await blkPickNth(pair[2]);
      await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
      const value = await blkReadField(blkBlockPath(pair[0]), pair[1]);
      assert.ok(value && value.indexOf('/uploads/') !== -1, 'the ' + pair[1] + ' image is stored on its own field');
    }
    const blkBeforeValue = await blkReadField(blkBlockPath(blkBeforeTarget), 'before');
    const blkAfterValue = await blkReadField(blkBlockPath(blkAfterTarget), 'after');
    assert.notEqual(blkBeforeValue, blkAfterValue, 'before and after keep separate media');
    assert.ok(blkBeforeValue.indexOf('/uploads/') !== -1 && blkAfterValue.indexOf('/uploads/') !== -1, 'both before and after hold library URLs');

    const blkGifPath = blkBlockPath(blkTargets.filter((target) => target.endsWith('.url'))[2]);
    const blkVideoPath = blkBlockPath(blkTargets.filter((target) => target.endsWith('.url'))[3]);
    await page.evaluate((path) => {
      const input = document.querySelector('#adminContent [data-adm-block-path="' + path + '"][data-adm-block-field="url"]');
      input.value = 'https://youtu.be/dQw4w9WgXcQ';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, blkVideoPath);
    const blkVideoPreview = await page.evaluate((path) => {
      const input = document.querySelector('#adminContent [data-adm-block-path="' + path + '"][data-adm-block-field="url"]');
      const host = input ? input.closest('.adm-block-body') : null;
      return host ? host.querySelector('.adm-video-preview img')?.getAttribute('src') || '' : '';
    }, blkVideoPath);
    assert.ok(blkVideoPreview.indexOf('i.ytimg.com/vi/dQw4w9WgXcQ/') !== -1, 'an authored YouTube URL shows its local video preview');
    // Library-backed blocks (image / image-text / gif / before-after) expose a
    // preview + picker only: the canonical URL never becomes a raw textbox.
    assert.equal(await page.evaluate((path) => document.querySelectorAll('#adminContent [data-adm-block-path="' + path + '"][data-adm-block-field="url"]').length, blkGifPath), 0, 'the gif block URL is picker-driven, never a raw textbox');
    assert.equal(await page.locator('#adminContent [data-adm-media-preview="' + blkGifPath + '.url"]').count(), 1, 'the gif block keeps a media preview surface');
    assert.equal(await page.locator('#adminContent [data-adm-mediabrowse="' + blkGifPath + '.url"]').count(), 1, 'the gif block keeps its library action');
    console.log('PASS block video URLs keep working and library blocks stay picker-driven (SDK fixture)');

    await page.evaluate((target) => {
      const button = document.querySelector('#adminContent [data-adm-mediabrowse="' + target + '"]');
      button.focus();
      button.click();
    }, blkImageTarget);
    await page.waitForFunction(() => document.querySelectorAll('#adminMediaModal.open [data-adm-media-card][role="option"]').length >= 1);
    assert.equal(await page.evaluate(() => document.querySelector('#adminMediaModal.open').getAttribute('aria-modal')), 'true', 'the picker dialog is announced as modal');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    assert.equal(await page.evaluate((target) => document.activeElement === document.querySelector('#adminContent [data-adm-mediabrowse="' + target + '"]'), blkImageTarget), true, 'Escape closes the picker and returns focus to its trigger');

    for (const viewport of [{width: 1440, height: 900, label: 'desktop'}, {width: 820, height: 1180, label: 'tablet'}, {width: 390, height: 844, label: 'mobile'}]) {
      await page.setViewportSize({width: viewport.width, height: viewport.height});
      await page.waitForTimeout(120);
      const box = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      assert.ok(box.scrollWidth <= box.clientWidth + 4, viewport.label + ' portfolio block editor has no horizontal overflow (' + box.scrollWidth + '/' + box.clientWidth + ')');
    }
    await page.setViewportSize({width: 1280, height: 800});
    assert.equal(await page.locator('#adminContent [data-adm-block-field][data-adm-block-path]').count() >= 7, true, 'every media block keeps its editable fields');
    console.log('PASS the media library is wired into every portfolio media block (SDK fixture)');
    await page.evaluate(() => { location.hash = '#admin/media'; });
    await page.waitForFunction(() => document.querySelectorAll('#adminContent [data-adm-media-card]').length >= 2);
    await page.evaluate(() => document.querySelector('#adminContent [data-adm-media-card]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    assert.equal(await page.locator('#adminContent [data-adm-bulk-count]').innerText(), '1 selected', 'Manager selection starts independently');
    await page.evaluate(() => { location.hash = '#admin/portfolio'; });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-mediabrowse$=".items"]')));
    await page.locator('#adminContent [data-adm-mediabrowse$=".items"]').first().click();
    await page.waitForFunction(() => document.querySelectorAll('#adminMediaModal.open [data-adm-pick-toggle]').length >= 2);
    assert.equal(await page.locator('#adminMediaModal [data-adm-pick-apply]').innerText(), 'Use selected (0)', 'Manager selection does not leak into Picker');
    await page.locator('#adminMediaModal [data-adm-pick-toggle]').nth(1).click();
    await page.locator('#adminMediaModal [data-adm-pick-apply]').click();
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    await page.evaluate(() => { location.hash = '#admin/media'; });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-bulk-count]')));
    assert.equal(await page.locator('#adminContent [data-adm-bulk-count]').innerText(), '1 selected', 'Picker Apply leaves Manager selection untouched');
    console.log('PASS Picker Apply preserves separate Manager selection (SDK fixture)');

    // Patch 3: direct Picker uploads and drops obey the target contract and append rows.
    await page.evaluate(() => { location.hash = '#admin/portfolio'; window.__routerWrites = []; window.__routerStorageWrites = []; });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-mediabrowse$=".items"]')));
    const p3GalleryTarget = blkTargets.find((target) => target.includes('.blocks.2.items'));
    const p3GridTarget = blkTargets.find((target) => target.includes('.blocks.3.items'));
    const p3RowCount = (target) => page.evaluate((path) => {
      const blockPath = path.slice(0, -6);
      return Array.prototype.filter.call(
        document.querySelectorAll('#adminContent [data-adm-mi-replace="' + blockPath + '"]'),
        (btn) => Boolean(btn.closest('.adm-media-item'))
      ).length;
    }, target);
    const p3GalleryBefore = await p3RowCount(p3GalleryTarget);
    await page.locator('#adminContent [data-adm-mi-key="alt"]').first().fill('Existing artwork');
    await blkBrowse(p3GalleryTarget);
    await page.waitForFunction(() => document.querySelectorAll('#adminMediaModal.open [data-adm-pick-toggle]').length === 2);
    assert.equal(await page.locator('#adminMediaModal [data-adm-pick]').count(), 2, 'Gallery hides video and audio on a mixed media page');
    const p3VideoId = await page.evaluate(() => window.__routerRows.media.find((row) => row.mime_type === 'video/mp4').id);
    await page.evaluate((id) => {
      const injected = document.createElement('button');
      injected.setAttribute('data-adm-pick-toggle', id);
      document.getElementById('adminMediaPickerGrid').appendChild(injected);
      injected.click();
    }, p3VideoId);
    await page.locator('#adminMediaModal [data-adm-pick-toggle]').first().click();
    await page.locator('#adminMediaModal [data-adm-pick-apply]').click();
    assert.equal(await page.locator('#adminMediaModal.open').count(), 1, 'mixed compatible/incompatible Apply is all-or-nothing');
    assert.equal(await p3RowCount(p3GalleryTarget), p3GalleryBefore, 'mixed Apply leaves Gallery unchanged');
    await page.locator('#adminMediaCancel').click();
    await blkBrowse(p3GalleryTarget);
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
    assert.equal(await page.locator('#adminMediaModal [data-adm-pick-apply]').innerText(), 'Use selected (0)', 'reopened Picker has no stale selection');
    await page.evaluate(() => {
      const injected = document.createElement('button');
      injected.setAttribute('data-adm-pick-toggle', 'missing-picker-id');
      document.getElementById('adminMediaPickerGrid').appendChild(injected);
      injected.click();
    });
    await page.locator('#adminMediaModal [data-adm-pick-toggle]').first().click();
    await page.locator('#adminMediaModal [data-adm-pick-apply]').click();
    assert.equal(await page.locator('#adminMediaModal.open').count(), 1, 'unresolved mixed Apply stays open');
    assert.equal(await p3RowCount(p3GalleryTarget), p3GalleryBefore, 'unresolved mixed Apply leaves Gallery unchanged');
    await page.locator('#adminMediaCancel').click();
    await blkBrowse(p3GalleryTarget);
    const [p3RejectChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#adminMediaModalUpload').click()]);
    const p3ImageAccept = await page.locator('#adminGlobalFileInput').getAttribute('accept');
    assert.ok(p3ImageAccept.includes('image/png') && !p3ImageAccept.includes('video/mp4'), 'Picker chooser reflects the image target');
    const p3WritesBeforeReject = await page.evaluate(() => window.__routerStorageWrites.length);
    await p3RejectChooser.setFiles({ name: 'picker-reject.mp4', mimeType: 'video/mp4', buffer: Buffer.from([31, 32, 33, 34]) });
    assert.equal(await page.locator('#adminMediaModal.open').count(), 1, 'an incompatible selected file leaves the Picker open');
    assert.equal(await page.evaluate(() => window.__routerStorageWrites.length), p3WritesBeforeReject, 'an incompatible file is never uploaded');
    const [p3GalleryChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#adminMediaModalUpload').click()]);
    await p3GalleryChooser.setFiles({ name: 'picker-gallery-new.png', mimeType: 'image/png', buffer: Buffer.from([41, 42, 43, 44, 45]) });
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    await page.waitForFunction((expected) => document.querySelectorAll('#adminContent .adm-media-item').length >= expected, p3GalleryBefore + 3);
    assert.equal(await p3RowCount(p3GalleryTarget), p3GalleryBefore + 1, 'direct Picker upload appends one Gallery row');
    const p3GalleryShape = await page.evaluate((path) => {
      const draft = window.CrabbieAdminUsageProvider().draft;
      return draft.portfolio.find((record) => record.id === path.split('.')[1]).blocks[2].items.at(-1);
    }, p3GalleryTarget);
    assert.deepEqual(Object.keys(p3GalleryShape).sort(), ['alt', 'caption', 'url'], 'the uploaded Gallery row keeps the structured schema');
    const p3GalleryState = await page.evaluate((path) => window.CrabbieAdminUsageProvider().draft.portfolio.find((record) => record.id === path.split('.')[1]).blocks[2].items, p3GalleryTarget);
    assert.equal(Array.isArray(p3GalleryState), true, 'direct upload keeps Gallery items an Array');
    assert.equal(p3GalleryState[0].alt, 'Existing artwork', 'direct upload preserves prior Gallery metadata');
    assert.ok(p3GalleryShape.url.includes('/uploads/'), 'the uploaded Gallery row holds a canonical URL');
    assert.equal(await page.evaluate((path) => document.activeElement?.getAttribute('data-adm-mediabrowse') === path, p3GalleryTarget), true, 'Picker upload returns focus to its editor button');
    assert.equal(await page.evaluate(() => window.__routerWrites.filter((write) => write.table === 'portfolio_projects').length), 0, 'Picker upload marks the draft dirty without saving');
    assert.match(await page.evaluate(() => document.getElementById('adminSaveStatus').className), /dirty/, 'Picker upload leaves the draft dirty');

    await blkBrowse(p3GalleryTarget);
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open [data-adm-pick]')));
    await page.locator('#adminMediaModal [data-adm-pick]').first().click();
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    assert.equal(await p3RowCount(p3GalleryTarget), p3GalleryBefore + 1, 'reapplying an existing Gallery URL does not append a duplicate row');
    await blkBrowse(p3GalleryTarget);
    const [p3DuplicateChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#adminMediaModalUpload').click()]);
    const p3StorageBeforeDuplicate = await page.evaluate(() => window.__routerStorageWrites.length);
    await p3DuplicateChooser.setFiles({ name: 'picker-gallery-new.png', mimeType: 'image/png', buffer: Buffer.from([41, 42, 43, 44, 45]) });
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    assert.equal(await p3RowCount(p3GalleryTarget), p3GalleryBefore + 1, 'byte-identical direct upload reuses the Gallery URL');
    assert.equal(await page.evaluate(() => window.__routerStorageWrites.length), p3StorageBeforeDuplicate, 'SHA-256 duplicate upload skips a second Storage write');
    const p3GridBefore = await p3RowCount(p3GridTarget);
    await blkBrowse(p3GridTarget);
    await page.waitForFunction(() => Boolean(document.querySelector('#adminMediaModal.open')));
    const p3WritesBeforeWrongDrop = await page.evaluate(() => window.__routerStorageWrites.length);
    await page.evaluate(() => {
      const grid = document.getElementById('adminMediaPickerGrid');
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([50, 50, 50])], 'wrong-drop.mp4', { type: 'video/mp4' }));
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: transfer });
      grid.dispatchEvent(drop);
    });
    assert.equal(await page.locator('#adminMediaModal.open').count(), 1, 'incompatible Picker drop leaves modal open');
    assert.equal(await page.evaluate(() => window.__routerStorageWrites.length), p3WritesBeforeWrongDrop, 'incompatible Picker drop never reaches Storage');
    assert.equal(await p3RowCount(p3GridTarget), p3GridBefore, 'incompatible Picker drop leaves Grid unchanged');
    await page.evaluate(() => {
      const grid = document.getElementById('adminMediaPickerGrid');
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array([51, 52, 53, 54, 55])], 'picker-grid-drop.png', { type: 'image/png' }));
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: transfer });
      grid.dispatchEvent(drop);
    });
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    assert.equal(await p3RowCount(p3GridTarget), p3GridBefore + 1, 'Picker drag/drop appends one structured Grid row');
    assert.equal(await page.evaluate(() => window.__routerWrites.filter((write) => write.table === 'portfolio_projects').length), 0, 'Picker drag/drop does not auto-save');
    const p3ThumbnailTarget = await page.locator('#adminContent [data-adm-mediabrowse$=".thumbnail"]').first().getAttribute('data-adm-mediabrowse');
    await blkBrowse(p3ThumbnailTarget);
    const [p3SingleChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#adminMediaModalUpload').click()]);
    await p3SingleChooser.setFiles({ name: 'picker-single.png', mimeType: 'image/png', buffer: Buffer.from([61, 62, 63, 64, 65]) });
    await page.waitForFunction(() => !document.querySelector('#adminMediaModal.open'));
    const p3SingleValue = await page.evaluate((target) => {
      const preview = document.querySelector('#adminContent [data-adm-media-preview="' + target + '"] img');
      return preview ? preview.getAttribute('src') : '';
    }, p3ThumbnailTarget);
    assert.equal(typeof p3SingleValue, 'string', 'direct Picker upload keeps a single-value target a string');
    assert.ok(p3SingleValue.includes('/uploads/'), 'single-value direct upload uses the canonical URL');
    await page.evaluate(() => { location.hash = '#admin/media'; });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-bulk-count]')));
    assert.equal(await page.locator('#adminContent [data-adm-bulk-count]').innerText(), '1 selected', 'Picker uploads leave Manager selection unchanged');
    const [p3ManagerAudioChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#adminContent [data-adm-media-upload]').click()]);
    const p3ManagerAccept = await page.locator('#adminGlobalFileInput').getAttribute('accept');
    assert.ok(p3ManagerAccept.includes('audio/mpeg') && p3ManagerAccept.includes('application/zip') && p3ManagerAccept.includes('.zip'), 'Manager click chooser includes canonical audio and ZIP formats');
    assert.equal(p3ManagerAccept.includes('.mkv'), false, 'Manager chooser does not include query-only formats');
    await p3ManagerAudioChooser.setFiles({ name: 'manager-audio.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from([71, 72, 73, 74, 75]) });
    await page.waitForFunction(() => window.__routerStorageWrites.some((entry) => entry.contentType === 'audio/mpeg'));
    const [p3ManagerZipChooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#adminContent [data-adm-media-upload]').click()]);
    await p3ManagerZipChooser.setFiles({ name: 'manager-archive.zip', mimeType: 'application/zip', buffer: Buffer.from([81, 82, 83, 84, 85]) });
    await page.waitForFunction(() => window.__routerStorageWrites.some((entry) => entry.contentType === 'application/zip'));
    console.log('PASS Picker upload/drop apply structured rows, reject incompatible files, preserve focus and Manager state (SDK fixture)');
    // ---- Patch 4 A: the Request panel filters by Commission server-side ----
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.evaluate(() => {
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.commission_services = [
        { id: '00000000-0000-4000-8000-000000000701', slug: 'static-emote', title: 'Static Emote', description: '', price: 25, currency: 'USD', availability: 'open', form_slug: 'emotes', details: { priceFormatted: '$25' }, featured: false, published: true, sort_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: '00000000-0000-4000-8000-000000000702', slug: 'full-illustration', title: 'Full Illustration', description: '', price: 200, currency: 'USD', availability: 'open', form_slug: 'illustration', details: {}, featured: false, published: true, sort_order: 2, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
      ];
      window.__routerRows.commission_requests = [
        { id: '00000000-0000-4000-8000-000000000801', client_name: 'Ada', client_email: 'ada@example.test', contact: '', answers: { service: 'Static Emote' }, status: 'new', admin_notes: '', terms_accepted: true, created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' },
        { id: '00000000-0000-4000-8000-000000000802', client_name: 'Bea', client_email: 'bea@example.test', contact: '', answers: { service: 'Full Illustration' }, status: 'new', admin_notes: '', terms_accepted: true, created_at: '2026-02-02T00:00:00Z', updated_at: '2026-02-02T00:00:00Z' }
      ];
      window.__routerRows.media = window.__routerRows.media || [];
      window.__routerRows.free_assets = [];
      window.__routerRows.commission_forms = [];
      window.__routerReads = [];
      window.__routerQueryCount = {};
      window.__routerWrites = [];
      window.__routerStorageWrites = [];
    });
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await page.evaluate(() => { window.location.hash = '#admin/requests'; });
    await page.waitForFunction(() => document.querySelectorAll('#adminContent .adm-req-row').length === 2);
    const p4RequestReads = () => page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'commission_requests').length);
    const p4ReadsBeforeFilter = await p4RequestReads();
    await page.locator('#adminContent [data-adm-req-filter="commission"]').selectOption('Static Emote');
    await page.waitForFunction((count) => (window.__routerReads || []).filter((read) => read.table === 'commission_requests').length === count + 1, p4ReadsBeforeFilter);
    const p4FilterRead = await page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'commission_requests').slice(-1)[0]);
    assert.ok(p4FilterRead.filters.some((filter) => filter[0] === 'answers->>service' && filter[1] === 'Static Emote'), 'the production loader forwards the Commission filter into the query');
    await page.waitForFunction(() => document.querySelectorAll('#adminContent .adm-req-row').length === 1);
    assert.match(await page.locator('#adminContent .adm-req-row').first().innerText(), /Ada/, 'only the matching commission request is listed');
    console.log('PASS the Request panel filters by Commission through the production loader (SDK fixture)');

    // ---- Patch 4 B: a new Asset keeps an explicit availability ----
    await page.evaluate(() => { window.location.hash = '#admin/assets'; });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-new="assets"]')));
    await page.locator('#adminContent [data-adm-new="assets"]').click();
    await page.waitForFunction(() => Array.prototype.some.call(document.querySelectorAll('#adminContent [data-adm-select="assets"]'), (row) => String(row.getAttribute('data-adm-id')).indexOf('client-') === 0));
    const p4AssetId = await page.evaluate(() => {
      const row = Array.prototype.find.call(document.querySelectorAll('#adminContent [data-adm-select="assets"]'), (candidate) => String(candidate.getAttribute('data-adm-id')).indexOf('client-') === 0);
      return row.getAttribute('data-adm-id');
    });
    assert.ok(/^client-/.test(p4AssetId), 'a new Asset carries a stable local identity until it is saved');
    if (await page.locator('#adminConfirmModal.open').count() > 0) {
      await page.locator('#adminConfirmCancel').click();
      await page.waitForFunction(() => !document.querySelector('#adminConfirmModal.open'));
    }
    await page.waitForFunction((id) => Boolean(document.querySelector('#adminContent [data-adm-path="assets.' + id + '.availability"]')), p4AssetId);
    assert.equal(await page.locator('#adminConfirmModal.open').count(), 0, 'the discard guard is closed before editing the new Asset');
    const p4AssetAvailability = page.locator('#adminContent [data-adm-path="assets.' + p4AssetId + '.availability"]');
    assert.equal(await p4AssetAvailability.inputValue(), 'available', 'a new Asset starts from an explicit availability');
    await page.locator('#adminContent [data-adm-path="assets.' + p4AssetId + '.title"]').fill('Availability asset');
    assert.equal(await page.locator('#adminContent [data-adm-path="assets.' + p4AssetId + '.slug"]').inputValue(), 'availability-asset');
    await p4AssetAvailability.selectOption('unavailable');
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => (window.__routerWrites || []).some((write) => write.table === 'free_assets'));
    const p4AssetWrite = await page.evaluate(() => window.__routerWrites.filter((write) => write.table === 'free_assets').slice(-1)[0]);
    assert.equal(p4AssetWrite.payload.availability, 'unavailable', 'the saved Asset keeps the chosen availability');
    assert.equal(await page.evaluate(() => window.__routerRows.free_assets.filter((row) => row.slug === 'availability-asset')[0].availability), 'unavailable', 'the database row stores the explicit availability');
    await page.locator('#adminContent [data-adm-path="assets.' + p4AssetId + '.placeholder"]').check();
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => window.__routerWrites.filter((write) => write.table === 'free_assets').length >= 2);
    const p4AssetFlagWrite = await page.evaluate(() => window.__routerWrites.filter((write) => write.table === 'free_assets').slice(-1)[0]);
    assert.equal(p4AssetFlagWrite.payload.metadata.placeholder, true, 'a checked placeholder is persisted under asset metadata');
    const p4SavedAssetRow = await page.evaluate(() => window.__routerRows.free_assets.filter((row) => row.slug === 'availability-asset')[0]);
    const p4SavedServicesB = await page.evaluate(() => window.__routerRows.commission_services);
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.evaluate(({ row, services }) => {
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.free_assets = [row];
      window.__routerRows.media = [];
      window.__routerRows.commission_services = services;
      window.__routerRows.commission_requests = [];
      window.__routerRows.commission_forms = [];
    }, { row: p4SavedAssetRow, services: p4SavedServicesB });
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await goAdmin('assets');
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-select="assets"]')));
    await page.evaluate(() => {
      const row = Array.prototype.find.call(document.querySelectorAll('#adminContent [data-adm-select="assets"]'), (candidate) => candidate.innerText.indexOf('Availability asset') !== -1);
      if (row) row.click();
    });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-path$=".availability"]')));
    assert.equal(await page.locator('#adminContent [data-adm-path$=".availability"]').first().inputValue(), 'unavailable', 'a reload keeps the stored availability');
    assert.equal(await page.locator('#adminContent [data-adm-path$=".placeholder"]').first().isChecked(), true, 'a reload keeps the stored placeholder flag');
    console.log('PASS a new Asset keeps an explicit availability across save and reload (SDK fixture)');

    // ---- Patch 4 C: a new Form is selectable by slug without a reload ----
    await page.evaluate(() => { window.location.hash = '#admin/commissions'; window.__routerWrites = []; });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-subtab="commissions:forms"]')));
    await page.locator('#adminContent [data-adm-subtab="commissions:forms"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-new="forms"]')));
    await page.locator('#adminContent [data-adm-new="forms"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-new-field]')));
    const p4FormId = await page.evaluate(() => document.querySelector('#adminContent [data-adm-path$=".title"]').getAttribute('data-adm-path').split('.')[1]);
    assert.ok(/^client-/.test(p4FormId), 'a new Form uses a stable local identity before saving');
    await page.locator('#adminContent [data-adm-path="forms.' + p4FormId + '.title"]').fill('Round-trip form');
    assert.equal(await page.locator('#adminContent [data-adm-path="forms.' + p4FormId + '.slug"]').inputValue(), 'round-trip-form');
    await page.locator('#adminContent [data-adm-new-field]').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-qblock]')));
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => (window.__routerWrites || []).some((write) => write.table === 'commission_forms'));
    const p4FormWrite = await page.evaluate(() => window.__routerWrites.filter((write) => write.table === 'commission_forms' && write.operation === 'insert').slice(-1)[0]);
    assert.equal(p4FormWrite.payload.slug, 'round-trip-form', 'the Form is persisted under its real slug');
    assert.equal(/^client-/.test(JSON.stringify(p4FormWrite.payload)), false, 'no local identity reaches the form payload');
    await page.locator('#adminContent [data-adm-subtab="commissions:items"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-select="commissions"]')));
    const p4CommissionId = await page.evaluate(() => document.querySelector('#adminContent [data-adm-select="commissions"]').getAttribute('data-adm-id'));
    await page.locator('#adminContent [data-adm-select="commissions"][data-adm-id="' + p4CommissionId + '"]').click();
    const p4FormSelect = page.locator('#adminContent [data-adm-path="commissions.' + p4CommissionId + '.form"]');
    await p4FormSelect.waitFor();
    const p4FormOptions = await p4FormSelect.evaluate((select) => Array.prototype.map.call(select.options, (option) => option.value));
    assert.ok(p4FormOptions.indexOf('round-trip-form') !== -1, 'the saved Form appears in the Commission relationship select without a reload');
    assert.equal(p4FormOptions.some((value) => /^client-/.test(value)), false, 'the relationship select never offers a local identity');
    await p4FormSelect.selectOption('round-trip-form');
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => (window.__routerWrites || []).some((write) => write.table === 'commission_services'));
    const p4CommissionWrite = await page.evaluate(() => window.__routerWrites.filter((write) => write.table === 'commission_services').slice(-1)[0]);
    assert.equal(p4CommissionWrite.payload.form_slug, 'round-trip-form', 'the Commission persists the real Form slug');
    assert.equal(/^client-/.test(String(p4CommissionWrite.payload.form_slug)), false, 'a local id is never persisted as form_slug');
    console.log('PASS a new Form is selectable and persisted by slug without a reload (SDK fixture)');

    // ---- Patch 4 D: the Request Form editor authors the complete schema ----
    await page.locator('#adminContent [data-adm-subtab="commissions:forms"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-select="forms"]')));
    await page.evaluate(() => {
      const row = Array.prototype.find.call(document.querySelectorAll('#adminContent [data-adm-select="forms"]'), (candidate) => candidate.innerText.indexOf('Round-trip form') !== -1);
      if (row) row.click();
    });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-qblock]')));
    const p4FieldBase = await page.evaluate(() => {
      const input = document.querySelector('#adminContent [data-adm-qblock] [data-adm-path$=".type"]');
      return input ? input.getAttribute('data-adm-path').replace(/\.type$/, '') : null;
    });
    assert.ok(p4FieldBase && /\.fields\.\d+$/.test(p4FieldBase), 'the form field editor exposes its schema path');
    await page.locator('#adminContent [data-adm-path="' + p4FieldBase + '.label"]').fill('Preferred package');
    await page.locator('#adminContent [data-adm-path="' + p4FieldBase + '.placeholder"]').fill('Pick one');
    await page.locator('#adminContent [data-adm-path="' + p4FieldBase + '.help"]').fill('Both packages include sketches');
    await page.locator('#adminContent [data-adm-path="' + p4FieldBase + '.contactRole"]').selectOption('email');
    await page.locator('#adminContent [data-adm-path="' + p4FieldBase + '.type"]').selectOption('select');
    await page.waitForFunction((base) => Boolean(document.querySelector('#adminContent [data-adm-options-path="' + base + '.options"]')), p4FieldBase);
    await page.locator('#adminContent [data-adm-options-path="' + p4FieldBase + '.options"]').fill('Mini\nFull\nDeluxe');
    await page.locator('#adminContent [data-adm-path="' + p4FieldBase + '.required"]').check();
    await page.locator('#adminContent [data-adm-path="forms.' + p4FormId + '.description"]').fill('Tell me about the emote you want.');
    await page.locator('#adminContent [data-adm-path="forms.' + p4FormId + '.published"]').check();
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => window.__routerWrites.filter((write) => write.table === 'commission_forms').length >= 2);
    const p4FormUpdate = await page.evaluate(() => window.__routerWrites.filter((write) => write.table === 'commission_forms').slice(-1)[0]);
    assert.equal(p4FormUpdate.payload.description, 'Tell me about the emote you want.', 'the form description is persisted');
    assert.equal(p4FormUpdate.payload.published, true, 'the form published flag is persisted');
    assert.deepEqual(p4FormUpdate.payload.fields[0].options, ['Mini', 'Full', 'Deluxe'], 'options are parsed one per line in author order');
    assert.equal(p4FormUpdate.payload.fields[0].help, 'Both packages include sketches', 'help text is persisted');
    assert.equal(p4FormUpdate.payload.fields[0].contactRole, 'email', 'a supported contact role is persisted');
    assert.equal(p4FormUpdate.payload.fields[0].required, true, 'required is persisted');
    assert.equal(p4FormUpdate.payload.fields[0].placeholder, 'Pick one', 'placeholder is persisted');
    assert.equal(p4FormUpdate.payload.fields[0].type, 'select', 'the field type is persisted');
    assert.equal(p4FormUpdate.payload.fields[0].label, 'Preferred package', 'the field label is persisted');
    const p4SavedFormRow = await page.evaluate(() => window.__routerRows.commission_forms.slice(-1)[0]);
    const p4SavedServicesD = await page.evaluate(() => window.__routerRows.commission_services);
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.evaluate(({ row, services }) => {
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.commission_forms = [row];
      window.__routerRows.commission_services = services;
      window.__routerRows.commission_requests = [];
      window.__routerRows.free_assets = [];
      window.__routerRows.media = [];
    }, { row: p4SavedFormRow, services: p4SavedServicesD });
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await goAdmin('commissions');
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-subtab="commissions:forms"]')));
    await page.locator('#adminContent [data-adm-subtab="commissions:forms"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-select="forms"]')));
    await page.evaluate(() => {
      const row = Array.prototype.find.call(document.querySelectorAll('#adminContent [data-adm-select="forms"]'), (candidate) => candidate.innerText.indexOf('Round-trip form') !== -1);
      if (row) row.click();
    });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-options-path]')));
    assert.equal(await page.locator('#adminContent [data-adm-path$=".description"]').first().inputValue(), 'Tell me about the emote you want.', 'the description survives a reload');
    assert.equal(await page.locator('#adminContent [data-adm-path$=".published"]').first().isChecked(), true, 'the published flag survives a reload');
    assert.equal(await page.locator('#adminContent [data-adm-options-path]').first().inputValue(), 'Mini\nFull\nDeluxe', 'option order survives a reload');
    assert.equal(await page.locator('#adminContent [data-adm-path$=".contactRole"]').first().inputValue(), 'email', 'the contact role survives a reload');
    assert.equal(await page.locator('#adminContent [data-adm-path$=".help"]').first().inputValue(), 'Both packages include sketches', 'help text survives a reload');
    console.log('PASS the Request Form editor round-trips every supported value (SDK fixture)');

    // ---- Patch 4 E: a canonical price edit replaces stale display text ----
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.locator('#adminContent [data-adm-subtab="commissions:items"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-select="commissions"]')));
    const p4PriceId = await page.evaluate(() => document.querySelector('#adminContent [data-adm-select="commissions"]').getAttribute('data-adm-id'));
    await page.locator('#adminContent [data-adm-select="commissions"][data-adm-id="' + p4PriceId + '"]').click();
    const p4PriceField = page.locator('#adminContent [data-adm-path="commissions.' + p4PriceId + '.price"]');
    await p4PriceField.waitFor();
    await p4PriceField.fill('75');
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => (window.__routerWrites || []).some((write) => write.table === 'commission_services' && write.payload.price === 75));
    const p4PriceWrite = await page.evaluate(() => window.__routerWrites.filter((write) => write.table === 'commission_services' && write.payload.price === 75).slice(-1)[0]);
    assert.equal(p4PriceWrite.payload.details.priceFormatted, '$75', 'saving a new price rewrites the stale formatted detail');
    assert.equal(await page.evaluate(() => window.__routerRows.commission_services.filter((row) => row.slug === 'static-emote')[0].details.priceFormatted), '$75', 'the stored details no longer hold the old price');
    // The SDK fixture lives in page memory, so the public boot would read an
    // empty table: seed the saved services before the page scripts run.
    const p4SavedServicesE = await page.evaluate(() => window.__routerRows.commission_services);
    await page.addInitScript((services) => {
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.commission_services = services;
    }, p4SavedServicesE);
    await page.goto(origin + '/#commissions', {waitUntil: 'load'});
    await page.waitForFunction(() => {
      const view = document.querySelector('[data-view="commissions"]');
      return Boolean(view) && view.classList.contains('is-active');
    });
    await page.waitForFunction(() => document.querySelector('[data-view="commissions"]').innerText.indexOf('$75') !== -1);
    assert.doesNotMatch(await page.locator('[data-view="commissions"]').innerText(), /\$25/, 'the public page never shows the stale price');
    console.log('PASS a canonical price edit replaces stale formatted display text (SDK fixture)');

    // ---- Patch 4 F: an uploaded image persists intrinsic dimensions -------
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await page.evaluate(() => { window.location.hash = '#admin/media'; window.__routerWrites = []; window.__routerStorageWrites = []; });
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent [data-adm-media-drop]')));
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 3;
      canvas.height = 2;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ff00aa';
      context.fillRect(0, 0, 3, 2);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'measured.png', { type: 'image/png' }));
      const zone = document.querySelector('#adminContent [data-adm-media-drop]');
      const drop = new Event('drop', { bubbles: true, cancelable: true });
      Object.defineProperty(drop, 'dataTransfer', { value: transfer });
      zone.dispatchEvent(drop);
    });
    await page.waitForFunction(() => (window.__routerWrites || []).some((write) => write.table === 'media' && write.operation === 'insert'));
    const p4MediaInsert = await page.evaluate(() => window.__routerWrites.filter((write) => write.table === 'media' && write.operation === 'insert').slice(-1)[0]);
    assert.equal(p4MediaInsert.payload.width, 3, 'an uploaded image persists its measured intrinsic width');
    assert.equal(p4MediaInsert.payload.height, 2, 'an uploaded image persists its measured intrinsic height');
    assert.equal(typeof p4MediaInsert.payload.width, 'number', 'a measured width is persisted as a number');
    assert.equal(typeof p4MediaInsert.payload.height, 'number', 'a measured height is persisted as a number');
    console.log('PASS an uploaded image measures and persists intrinsic dimensions (SDK fixture canvas decode)');

    // ---- Bug fix: a transient badge-count failure must not stick at "–" ----
    // No reload between cycles: the retry must come from a natural dashboard
    // render on the same page (a reload would retry even with the old latch).
    const badgeText = (key) => page.evaluate((k) => {
      const el = document.querySelector('#adminNav [data-count="' + k + '"]');
      return el ? el.textContent : null;
    }, key);
    const requestHeadReads = () => page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'commission_requests' && read.head).length);
    const mediaHeadReads = () => page.evaluate(() => (window.__routerReads || []).filter((read) => read.table === 'media' && read.head).length);
    await page.goto(origin + '/admin', { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.evaluate(() => {
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.commission_requests = [
        { id: '00000000-0000-4000-8000-000000000911', client_name: 'Badge A' },
        { id: '00000000-0000-4000-8000-000000000912', client_name: 'Badge B' },
        { id: '00000000-0000-4000-8000-000000000913', client_name: 'Badge C' }
      ];
      window.__routerFail = 'commission_requests';
    });
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await page.waitForFunction(() => document.querySelector('#adminNav [data-count="requests"]'));
    await page.waitForFunction(() => (window.__routerReads || []).some((read) => read.table === 'commission_requests' && read.head));
    await page.waitForFunction(() => document.querySelector('#adminNav [data-count="requests"]').textContent === '–');
    assert.equal(await badgeText('requests'), '–', 'a failed requests count stays unknown instead of pretending');
    await page.evaluate(() => { window.__routerFail = null; });
    await goAdmin('portfolio');
    await goAdmin('dashboard');
    await page.waitForFunction(() => document.querySelector('#adminNav [data-count="requests"]').textContent === '3');
    assert.equal(await badgeText('requests'), '3', 'the retried requests count updates the badge');
    assert.ok((await requestHeadReads()) >= 2, 'a later count attempt occurred after the failure');
    assert.equal(await mediaHeadReads(), 1, 'the successful media count needed no retry');
    // Rapid re-renders must not fan out: counts are cached or in flight.
    const settledReads = await requestHeadReads();
    await goAdmin('portfolio');
    await goAdmin('dashboard');
    await goAdmin('portfolio');
    await goAdmin('dashboard');
    await page.waitForTimeout(300);
    assert.equal(await requestHeadReads(), settledReads, 'simultaneous renders never duplicate count queries');
    assert.equal(await mediaHeadReads(), 1, 'media count stays a single query');
    console.log('PASS a failed badge count retries on the next dashboard render instead of sticking at "–" (SDK fixture)');

    // ---- Patch 5 A: CMS-only detail slugs never get a false 404 ----
    // One deterministic gate holds the authoritative snapshot open, so the
    // pre-hydration phase is exercised instead of raced against the fixture.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('routerGateUsed') === '1') return;
      sessionStorage.setItem('routerGateUsed', '1');
      window.__routerGateOpen = false;
      window.__routerGate = new Promise((resolve) => { window.__routerGateOpen_ = resolve; });
    });
    await page.goto(origin + '/#project/cms-only-slug', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    // While the CMS snapshot is still pending the route waits, never 404s.
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'loading');
    assert.equal(await page.evaluate(() => document.querySelector('.view.is-active')?.dataset.view), 'loading', 'a CMS-only project slug waits instead of 404');
    // Seeding + opening the gate lets the real hydration apply the snapshot.
    await page.evaluate(() => {
      window.__routerRows.portfolio_projects = [{
        id: '00000000-0000-4000-8000-000000000051', slug: 'cms-only-slug', title: 'CMS only',
        description: 'Fresh CMS record', tags: [], thumbnail_path: '', cover_path: '', content: {},
        featured: false, published: true, sort_order: 0, updated_at: '2026-01-01T00:00:00Z'
      }];
      window.__routerRows.free_assets = [{
        id: '00000000-0000-4000-8000-000000000052', slug: 'cms-only-asset', title: 'CMS asset',
        description: 'Fresh asset', thumbnail_path: '', file_type: 'ZIP', file_path: 'https://example.test/cms-only.zip',
        availability: 'available', featured: false, published: true, sort_order: 0, metadata: {}, updated_at: '2026-01-01T00:00:00Z'
      }];
      window.__routerGateOpen_();
    });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'project-detail');
    assert.equal(await page.locator('#pdTitle').innerText(), 'CMS only', 'the pending CMS-only route renders once the snapshot arrives');
    // Fresh direct routes for CMS-only slugs resolve after hydration too.
    await page.evaluate(() => { location.hash = '#asset/cms-only-asset'; });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'free-asset-detail');
    assert.equal(await page.locator('#adTitle').innerText(), 'CMS asset', 'a CMS-only asset renders from a direct route');
    await page.evaluate(() => { location.hash = '#asset/no-such-asset-anywhere'; });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === '404');
    assert.equal(await page.evaluate(() => document.querySelector('.view.is-active')?.dataset.view), '404', 'an unknown asset slug is a real 404');
    await page.evaluate(() => { location.hash = '#project/no-such-project-anywhere'; });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === '404');
    assert.equal(await page.evaluate(() => document.querySelector('.view.is-active')?.dataset.view), '404', 'an unknown project slug is a real 404');
    // Renaming a slug drops the old route: the old slug 404s, the new one works.
    await page.evaluate(() => {
      window.CrabbiePortfolio.apply([{
        slug: 'cms-only-slug-renamed', title: 'CMS only', desc: '', cat: 'Illustration', tags: [],
        thumbnail: '', cover: '', blocks: [], credits: '', year: ''
      }]);
      location.hash = '#project/cms-only-slug';
    });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === '404');
    assert.equal(await page.evaluate(() => document.querySelector('.view.is-active')?.dataset.view), '404', 'a renamed slug makes the old route a real 404');
    await page.evaluate(() => { location.hash = '#project/cms-only-slug-renamed'; });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'project-detail');
    console.log('PASS CMS-only detail slugs wait, render after refresh, and unknown/renamed slugs 404 (SDK fixture)');
    // ---- Patch 5 B2: a new CMS commission service appears, opens, and requests ----
    await page.goto(origin + '/#commissions', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.waitForFunction(() => document.querySelector('[data-view="commissions"]').classList.contains('is-active'));
    await page.evaluate(() => {
      window.CrabbieCommissions.apply([{
        slug: 'chibi-badge-set', name: 'Chibi Badge Set', title: 'Chibi Badge Set',
        description: 'Matching chibi badges.', price: '$45', priceNumeric: 45, currency: 'USD',
        availability: 'open', formType: 'emotes', formLabel: 'Emotes form',
        thumbnail: '', featured: false, published: true,
        includedFiles: 'PNG x3 + PSD', canvas: '1000x1000px each', deliveryEstimate: '2 weeks',
        alternatePrice: '1100000', chips: [], priceNote: '',
        isOtherService: true
      }], null);
    });
    await page.waitForFunction(() => Boolean(document.querySelector('#miniServicesGrid [data-other-service="chibi-badge-set"]')));
    await page.locator('#miniServicesGrid [data-other-service="chibi-badge-set"]').click();
    await page.waitForFunction(() => (document.getElementById('otherServiceDetail') || {}).innerText.indexOf('Chibi Badge Set') !== -1);
    assert.match(await page.locator('#otherServiceDetail').innerText(), /Chibi Badge Set/);
    assert.match(await page.locator('#otherServiceDetail').innerText(), /\$45/);
    assert.match(await page.locator('#otherServiceDetail').innerText(), /PNG x3 \+ PSD/);
    assert.equal(await page.locator('#otherServiceDetail [data-service-slug="chibi-badge-set"]').count(), 1, 'the detail Request button carries the service slug');
    assert.equal(await page.locator('#otherServiceDetail [data-service-slug="chibi-badge-set"]').getAttribute('data-form'), 'emotes', 'the Request button maps to the authored form');
    console.log('PASS a new CMS commission service appears, opens, and requests the right form (SDK fixture)');

    // ---- Patch 5 B: project blocks render author section titles only ----
    await page.evaluate(() => {
      window.CrabbiePortfolio.apply([{slug:'titled-blocks',title:'Titled',desc:'',cat:'Illustration',tags:[],thumbnail:'',cover:'',
        blocks:[
          {id:'b1',type:'text',text:'Hello',sectionTitle:'Concept'},
          {id:'b2',type:'quote',text:'Nice words',sectionTitle:''},
          {id:'b3',type:'image-text',text:'More',url:'',sectionTitle:'Final thoughts'}
        ],credits:'',year:''}]);
      location.hash = '#project/titled-blocks';
    });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'project-detail');
    const blockHeadings = await page.locator('[data-view="project-detail"] .blk-head').allInnerTexts();
    assert.ok(blockHeadings.some((text) => text.includes('Concept')), 'the author section title renders');
    assert.ok(blockHeadings.some((text) => text.includes('Final thoughts')), 'the author section title renders');
    const detailText = await page.locator('[data-view="project-detail"]').innerText();
    assert.doesNotMatch(detailText, /\b01 text\b|\b02 image\b|\b03 quote\b|\bimage-text\b|\bbefore-after\b/i, 'no raw internal block type leaks publicly');
    console.log('PASS block section titles render and raw block type names never leak (SDK fixture)');

    // ---- Patch 5 C: YouTube / TikTok links render visual previews ----
    await page.evaluate(() => {
      window.CrabbiePortfolio.apply([{slug:'video-links',title:'Videos',desc:'',cat:'Illustration',tags:[],thumbnail:'',cover:'',
        blocks:[{id:'vb1',type:'text',text:'Watch:',sectionTitle:'Videos'}],credits:'',year:'',
        externalLinks:[
          {title:'Process video',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'},
          {title:'Timelapse',url:'https://www.tiktok.com/@crabbie/video/7301234567890123456'},
          {title:'My site',url:'https://example.test/gallery'}
        ]}]);
      location.hash = '#project/video-links';
    });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'project-detail');
    await page.waitForFunction(() => document.querySelectorAll('[data-view="project-detail"] .video-link-card').length === 2);
    assert.equal(await page.locator('[data-view="project-detail"] .video-link-card img[src*="i.ytimg.com"]').count(), 1, 'a YouTube link renders a real derived thumbnail');
    assert.equal(await page.locator('[data-view="project-detail"] .video-link-card.vlc-tiktok').count(), 1, 'a TikTok link renders a branded preview card');
    assert.equal(await page.locator('[data-view="project-detail"] .link-pill[href="https://example.test/gallery"]').count(), 1, 'an ordinary link still renders as an ordinary link');
    console.log('PASS YouTube/TikTok links render visual previews and ordinary links keep working (SDK fixture)');

    // ---- Patch 5 D: GIF gallery renders animated, Vietnamese UI is gone ----
    await page.evaluate(() => {
      window.CrabbiePortfolio.apply([{slug:'gif-gallery',title:'GIFs',desc:'',cat:'Illustration',tags:[],thumbnail:'',cover:'',
        blocks:[{id:'g1',type:'gallery',sectionTitle:'Mixed',items:[
          {url:'https://example.test/a.png',alt:'A',caption:''},
          {url:'https://example.test/b.gif',alt:'B',caption:'animated'}
        ]}],credits:'',year:''}]);
      location.hash = '#project/gif-gallery';
    });
    await page.waitForFunction(() => document.querySelector('.view.is-active')?.dataset.view === 'project-detail');
    assert.equal(await page.locator('[data-view="project-detail"] .ph-gallery img[src$=".gif"]').count(), 1, 'the GIF gallery item renders its animated source');
    assert.equal(await page.locator('[data-view="project-detail"] .ph-gallery img').count(), 2, 'mixed PNG/GIF galleries render every item');
    assert.equal(await page.locator('.lang button[data-lang="VI"]:not([hidden])').count(), 0, 'no visible public VI switch is presented');
    console.log('PASS GIF galleries render animated and the fake public VI switch is gone (SDK fixture)');

    // ---- Patch 5 E: footer follows CMS contact settings ----
    await page.evaluate(() => {
      window.CrabbieSiteContent.apply(null, null, {contact:{email:'artist@example.test',twitter:'https://x.com/example'}});
    });
    assert.equal(await page.locator('#footEmail').innerText(), 'artist@example.test', 'the footer email follows CMS settings');
    assert.equal(await page.locator('#footEmail').getAttribute('href'), 'mailto:artist@example.test');
    assert.equal(await page.locator('#footTwitter').getAttribute('href'), 'https://x.com/example', 'the footer Twitter follows CMS settings');
    assert.doesNotMatch(await page.locator('footer').innerText(), /Find me/, 'no useless Find me section remains');
    const footHeads = await page.locator('footer .foot h5').allInnerTexts();
    assert.ok(footHeads.some((text) => /^explore$/i.test(text.trim())) && footHeads.some((text) => /^contact$/i.test(text)), 'the footer has Explore and Contact columns (got ' + JSON.stringify(footHeads) + ')');
    console.log('PASS the footer follows CMS contact settings with no Find me section (SDK fixture)');

    // ---- Patch 5 F: expanded commission detail clears the sticky navbar ----
    await page.evaluate(() => { location.hash = '#commissions'; });
    await page.locator('[data-view="commissions"].is-active').waitFor({state: 'visible'});
    const stickyOffset = await page.evaluate(() => {
      const detail = document.getElementById('otherServiceDetail');
      return detail ? getComputedStyle(detail).scrollMarginTop : '';
    });
    assert.ok(/^\d+px$/.test(stickyOffset) && parseInt(stickyOffset, 10) >= 90, 'the detail reserves a sticky-navbar offset (got ' + stickyOffset + ')');
    const belowNav = await page.evaluate(() => {
      const nav = document.querySelector('.nav-shell');
      const detail = document.getElementById('otherServiceDetail');
      return nav && detail ? nav.getBoundingClientRect().height + 16 <= parseInt(getComputedStyle(detail).scrollMarginTop, 10) : false;
    });
    assert.equal(belowNav, true, 'the scroll offset exceeds the real nav height plus a visual gap');
    console.log('PASS the commission detail scrolls below the sticky navbar with a real offset (SDK fixture)');

    // ---- Patch 5 G: simplified media fields, no raw library URL inputs ----
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.evaluate(() => {
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.portfolio_projects = [{
        id: '00000000-0000-4000-8000-000000000601', slug: 'media-ui-project', title: 'Media UI project',
        description: 'D', tags: [], thumbnail_path: '', cover_path: '',
        content: { blocks: [{ type: 'image', open: true, url: '', alt: '', caption: '' }], externalLinks: [{ title: 'Ref', url: 'https://example.test/ref' }] },
        featured: false, published: true, sort_order: 0, updated_at: '2026-01-01T00:00:00Z'
      }];
      window.__routerRows.cms_pages = [{
        id: '00000000-0000-4000-8000-000000000602', slug: 'about', title: 'About', content: '', published: true, data: {},
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
      }];
      window.__routerRows.site_settings = [];
      window.__routerRows.media = [];
    });
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await goAdmin('portfolio');
    assert.equal(await page.locator('#adminContent input[data-adm-path$=".thumbnail"]').count(), 0, 'media library fields never expose a raw URL textbox');
    assert.equal(await page.locator('#adminContent input[data-adm-path$=".cover"]').count(), 0, 'media library fields never expose a raw URL textbox');
    assert.ok(await page.locator('#adminContent [data-adm-mediabrowse]').count() > 0, 'choose-media actions remain (content: ' + (await page.locator('#adminContent').innerText()).slice(0, 160).replace(/\s+/g, ' ') + ' | loadState: ' + await page.evaluate(() => window.CrabbieAdminCrud.getAdminLoadState()) + ')');
    assert.equal((await page.locator('#adminContent input[data-adm-block-field="sectionTitle"]').count()) > 0, true, 'every block exposes a Section title field');
    assert.equal(await page.locator('#adminContent input[data-adm-mi-key="url"]').count(), 0, 'gallery rows never show a URL textbox');
    assert.equal((await page.locator('#adminContent input[data-adm-array-key="url"]').count()) > 0, true, 'authored external URLs keep their editable input');
    assert.doesNotMatch(await page.locator('#adminContent').innerText(), /Vietnamese override|Vietnamese text|instead of automatic translation/, 'no manual Vietnamese override UI remains');
    console.log('PASS simplified media fields, section titles, and no Vietnamese override UI (SDK fixture)');

    // ---- Patch 5 H: About CMS (skills / experience / values) add-edit-save ----
    await goAdmin('about');
    const aboutSkillCount = () => page.locator('#adminContent input[data-adm-about-edit="skills"]').count();
    const aboutExpCount = () => page.locator('#adminContent input[data-adm-about-edit="experience"][data-adm-about-key="title"]').count();
    const startSkills = await aboutSkillCount();
    await page.locator('#adminContent [data-adm-about-add="skills"]').click();
    assert.equal(await aboutSkillCount(), startSkills + 1, 'a skill can be added');
    await page.locator('#adminContent input[data-adm-about-edit="skills"]').last().fill('Test Skill');
    await page.locator('#adminContent [data-adm-about-add="values"]').click();
    await page.locator('#adminContent input[data-adm-about-edit="values"][data-adm-about-key="title"]').last().fill('Test Value');
    await page.locator('#adminContent input[data-adm-about-edit="values"][data-adm-about-key="body"]').last().fill('Test value body.');
    const startExp = await aboutExpCount();
    await page.locator('#adminContent [data-adm-about-add="experience"]').click();
    assert.equal(await aboutExpCount(), startExp + 1, 'an experience entry can be added');
    await page.locator('#adminContent input[data-adm-about-edit="experience"][data-adm-about-key="tag"]').last().fill('TEST');
    await page.locator('#adminContent input[data-adm-about-edit="experience"][data-adm-about-key="title"]').last().fill('Test Experience');
    await page.locator('#adminContent input[data-adm-about-edit="experience"][data-adm-about-key="body"]').last().fill('Test experience body.');
    await page.evaluate(() => { window.__routerWrites = []; });
    await page.locator('#adminTopSave').click();
    await page.waitForFunction(() => (window.__routerWrites || []).some((write) => write.table === 'cms_pages'));
    const aboutWrite = await page.evaluate(() => window.__routerWrites.filter((write) => write.table === 'cms_pages').slice(-1)[0]);
    assert.ok((aboutWrite.payload.data.skills || []).includes('Test Skill'), 'the new skill is in the DB payload');
    assert.ok((aboutWrite.payload.data.values || []).some((v) => v.title === 'Test Value' && v.body === 'Test value body.'), 'the new value is in the DB payload');
    assert.ok((aboutWrite.payload.data.experience || []).some((e) => e.title === 'Test Experience'), 'the new experience is in the DB payload');
    // Reload the admin page: the full round-trip must survive hydration.
    // The SDK fixture lives in page memory, so re-seed the saved row first.
    const p5SavedAboutRow = await page.evaluate(() => (window.__routerRows.cms_pages || []).slice(-1)[0]);
    await page.goto(origin + '/admin', {waitUntil: 'load'});
    await page.waitForFunction(() => Boolean(window.CrabbieAuthService));
    await page.evaluate((row) => {
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.cms_pages = row ? [row] : [];
    }, p5SavedAboutRow);
    await loginAdmin();
    await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
    await goAdmin('about');
    assert.ok((await page.locator('#adminContent input[data-adm-about-edit="skills"][value="Test Skill"]').count()) >= 1, 'the saved skill survives an admin reload');
    assert.ok((await page.locator('#adminContent input[data-adm-about-edit="values"][data-adm-about-key="title"][value="Test Value"]').count()) >= 1, 'the saved value survives an admin reload');
    assert.ok((await page.locator('#adminContent input[data-adm-about-edit="experience"][data-adm-about-key="title"][value="Test Experience"]').count()) >= 1, 'the saved experience survives an admin reload');
    // The public modules hydrate at boot, so seed before load like P4-E.
    await page.addInitScript((row) => {
      window.__routerRows = window.__routerRows || {};
      window.__routerRows.cms_pages = row ? [row] : [];
    }, p5SavedAboutRow);
    await page.goto(origin + '/#about', { waitUntil: 'load' });
    await page.locator('[data-view="about"].is-active').waitFor({state: 'visible'});
    assert.match(await page.locator('[data-view="about"] .chip-cloud').innerText(), /Test Skill/, 'the new skill reaches the public page');
    assert.match(await page.locator('[data-view="about"] .exp-grid').innerText(), /Test Experience/, 'the new experience reaches the public page');
    assert.match(await page.locator('[data-view="about"] .values-grid').innerText(), /Test Value/, 'the new creative value reaches the public page');
    console.log('PASS About CMS groups add, save, reload, and render publicly (SDK fixture)');

// P4_END

  }
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
