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
  const query = table => new Proxy({}, { get: (_, key) => key === 'then'
    ? (done) => Promise.resolve({data: (window.__routerRows || {})[table] || [], error: null}).then(done)
    : (...args) => {
        if (['upsert', 'insert', 'update', 'delete'].includes(key)) {
          (window.__routerWrites ||= []).push({table, operation: key});
          if (key === 'upsert') (window.__routerRows ||= {})[table] = Array.isArray(args[0]) ? args[0] : [args[0]];
        }
        return query(table);
      } });
  return {
    from: table => query(table),
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
    const assetThumbnail = page.locator('[data-adm-path$=".thumbnail"]').first();
    const thumbnailPath = await assetThumbnail.getAttribute('data-adm-path');
    await assetThumbnail.fill('https://example.test/content-health-preview.png');
    await page.locator('[data-adm-media-preview="' + thumbnailPath + '"] img').waitFor({state: 'attached'});
    await page.locator('[data-adm-mediaclear="' + thumbnailPath + '"]').click();
    assert.equal(await assetThumbnail.inputValue(), '');
    const assetFile = page.locator('[data-adm-path$=".downloadUrl"]').first();
    const filePath = await assetFile.getAttribute('data-adm-path');
    await assetFile.fill('https://example.test/content-health-file.zip');
    await page.locator('[data-adm-media-preview="' + filePath + '"] .adm-file-chip').waitFor({state: 'visible'});
    await page.locator('[data-adm-mediaclear="' + filePath + '"]').click();
    assert.equal(await assetFile.inputValue(), '');
    assert.equal(await page.locator('[data-adm-mediabrowse="' + filePath + '"]').count(), 1);
    assert.equal(await page.locator('[data-adm-mediaupload="' + filePath + '"]').count(), 1);
    assert.equal(await page.locator('[data-adm-mediaopen="' + filePath + '"]').count(), 1);

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
      const draft = {
        portfolio: [{id:'fixture-project',slug:'fixture-project',title:'Fixture',published:false}],
        assets: [{id:'fixture-asset',slug:'fixture-asset',title:'Fixture',published:false}],
        commissions: [{id:'fixture-service',slug:'fixture-service',title:'Fixture',published:false}],
        forms: [{id:'fixture-form',slug:'fixture-form',title:'Fixture',published:false}],
        pages: { about: {title:'About',bio:'Bio'}, terms: {title:'Terms',content:'Terms'} },
        navigation: [{id:'00000000-0000-0000-0000-000000000001',title:'Nav',url:'#nav',published:true}],
        settings: { branding: {title:'CRABBIE'} },
        requests: [{id:'00000000-0000-0000-0000-000000000002',status:'NEW',notes:'Note'}]
      };
      const results = {};
      for (const scope of ['portfolio', 'assets', 'commissions', 'forms', 'pages.about', 'pages.terms', 'navigation', 'settings', 'requests']) {
        window.__routerWrites = [];
        await window.CrabbieAdminCrud.persistAdminData(draft, scope);
        results[scope] = window.__routerWrites.map(w => w.table);
      }
      return results;
    });
    assert.deepEqual(scopedWrites['portfolio'], ['portfolio_projects']);
    assert.deepEqual(scopedWrites['assets'], ['free_assets']);
    assert.deepEqual(scopedWrites['commissions'], ['commission_services']);
    assert.deepEqual(scopedWrites['forms'], ['commission_forms']);
    assert.deepEqual(scopedWrites['pages.about'], ['cms_pages']);
    assert.deepEqual(scopedWrites['pages.terms'], ['cms_pages']);
    assert.deepEqual(scopedWrites['navigation'], ['cms_navigation']);
    assert.deepEqual(scopedWrites['settings'], ['site_settings']);
    assert.deepEqual(scopedWrites['requests'], ['commission_requests']);
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
    await page.evaluate(() => {
      window.__routerRows = {};
      window.__routerWrites = [];
      location.hash = '#admin/portfolio';
    });
    await page.locator('#adminNav [data-admin-module="portfolio"][aria-current="page"]').waitFor({state:'visible'});
    await page.locator('[data-adm-path="portfolio.color-fiesta.title"]').fill('Saved CMS title');
    await page.locator('[data-adm-path="portfolio.color-fiesta.thumbnail"]').fill('https://example.test/saved-thumb.png');
    await page.locator('[data-adm-save="portfolio"]').click();
    await page.waitForFunction(() => document.querySelector('#pfGrid [data-project="color-fiesta"] .work-title')?.textContent === 'Saved CMS title');
    assert.equal(await page.locator('#pfGrid [data-project="color-fiesta"] .thumb img').getAttribute('src'), 'https://example.test/saved-thumb.png');
    assert.deepEqual(await page.evaluate(() => window.__routerWrites.map(w => w.table)), ['portfolio_projects']);
    assert.deepEqual(errors, [], 'Post-save public refresh must not throw');
    console.log('PASS Admin Save scopes writes and re-fetches mapped Portfolio rows into public DOM (SDK fixture)');
  }
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
