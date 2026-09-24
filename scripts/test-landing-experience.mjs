import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const PORT = 4173;
const ROOT = path.resolve('.');

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

function createServer() {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0].split('#')[0];
    if (reqPath === '/' || reqPath.startsWith('/admin')) {
      reqPath = '/crabbie-port26.html';
    }
    const filePath = path.join(ROOT, reqPath.replace(/^\//, ''));
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME_MAP[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function run() {
  const server = await createServer();
  console.log(`Server running at http://127.0.0.1:${PORT}`);

  try {
    /* 1. Desktop Chromium Test */
    console.log('Testing Chromium Desktop (1280x800)...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    await page.goto(`http://127.0.0.1:${PORT}/#home`);
    await page.waitForSelector('#landingExperience');

    // Initial state (p = 0)
    let state0 = await page.evaluate(() => {
      const hero = document.getElementById('landingHero');
      const stage = document.getElementById('landingStage');
      const nav = document.querySelector('.nav-shell');
      const realHero = document.querySelector('.view[data-view="home"] .hero');
      const exp = window.CrabbieLandingExperience;
      return {
        progress: exp ? exp.progress : -1,
        heroOpacity: hero ? getComputedStyle(hero).opacity : null,
        navOpacity: nav ? getComputedStyle(nav).opacity : null,
        navPointerEvents: nav ? getComputedStyle(nav).pointerEvents : null,
        realHeroOpacity: realHero ? getComputedStyle(realHero).opacity : null,
        stageVisible: stage ? getComputedStyle(stage).visibility : null,
        stagePointerEvents: stage ? getComputedStyle(stage).pointerEvents : null
      };
    });

    assert.equal(state0.progress, 0, 'initial scroll progress is 0');
    assert.equal(state0.navOpacity, '0', 'real nav is initially hidden');
    assert.equal(state0.navPointerEvents, 'none', 'real nav initially does not intercept clicks');
    assert.equal(state0.stageVisible, 'visible', 'landing stage is visible at top');
    assert.equal(state0.stagePointerEvents, 'auto', 'landing stage is interactive');

    // Scroll to welcome message (p ~ 0.70)
    const shellHeight = await page.evaluate(() => document.getElementById('landingExperience').offsetHeight);
    const scrollTravel = shellHeight - 800;
    await page.evaluate((y) => window.scrollTo(0, y), scrollTravel * 0.70);
    await page.waitForTimeout(150);

    let state70 = await page.evaluate(() => {
      const msg = document.getElementById('landingMessage');
      const stage = document.getElementById('landingStage');
      const exp = window.CrabbieLandingExperience;
      return {
        progress: exp.progress,
        msgOpacity: msg ? getComputedStyle(msg).opacity : null,
        stageStyleO: stage ? stage.style.getPropertyValue('--ld-o-msg') : null
      };
    });
    assert.ok(state70.progress > 0.6 && state70.progress < 0.8, `progress at welcome message is ~0.70 (got ${state70.progress})`);
    assert.ok(parseFloat(state70.stageStyleO) > 0.8, 'welcome message is prominent at p=0.70');

    // Scroll to portal expansion (p ~ 0.94)
    await page.evaluate((y) => window.scrollTo(0, y), scrollTravel * 0.94);
    await page.waitForFunction(() => window.CrabbieLandingExperience && window.CrabbieLandingExperience.progress >= 0.92);

    let state94 = await page.evaluate(() => {
      const stage = document.getElementById('landingStage');
      const nav = document.querySelector('.nav-shell');
      const realHero = document.querySelector('.view[data-view="home"] .hero');
      const bloom = document.getElementById('landingPortalBloom');
      const exp = window.CrabbieLandingExperience;
      return {
        progress: exp.progress,
        hasMask: !!(stage.style.webkitMaskImage || stage.style.maskImage),
        navOpacity: parseFloat(getComputedStyle(nav).opacity),
        realHeroOpacity: parseFloat(getComputedStyle(realHero).opacity),
        bloomSize: parseFloat(bloom.style.getPropertyValue('--bloom-size') || '0')
      };
    });
    assert.ok(state94.hasMask, 'portal mask is actively carving open the stage at p=0.94');
    assert.ok(state94.bloomSize > 100, `bloom has expanded outward (got ${state94.bloomSize}px)`);
    assert.ok(state94.realHeroOpacity > 0.3, `real Home hero is fading in (got ${state94.realHeroOpacity})`);

    // Scroll to progress 1.0 (past landing, into Home)
    await page.evaluate((y) => window.scrollTo(0, y), scrollTravel + 50);
    await page.waitForFunction(() => window.CrabbieLandingExperience && window.CrabbieLandingExperience.progress >= 1.0);

    let state100 = await page.evaluate(() => {
      const stage = document.getElementById('landingStage');
      const nav = document.querySelector('.nav-shell');
      const realHero = document.querySelector('.view[data-view="home"] .hero');
      return {
        navClass: nav.className,
        navInlineOpacity: nav.style.opacity,
        navInlineCssText: nav.style.cssText,
        htmlClass: document.documentElement.className,
        bodyClass: document.body.className,
        stagePointerEvents: getComputedStyle(stage).pointerEvents,
        stageOpacity: parseFloat(getComputedStyle(stage).opacity),
        navOpacity: parseFloat(getComputedStyle(nav).opacity),
        navPointerEvents: getComputedStyle(nav).pointerEvents,
        realHeroOpacity: parseFloat(getComputedStyle(realHero).opacity),
        overflowX: document.documentElement.scrollWidth <= document.documentElement.clientWidth
      };
    });
    assert.equal(state100.stagePointerEvents, 'none', 'stage pointer events disabled at p=1.0');
    assert.equal(state100.navOpacity, 1, 'real nav is 100% visible at p=1.0');
    assert.equal(state100.navPointerEvents, 'auto', 'real nav is fully clickable at p=1.0');
    assert.equal(state100.realHeroOpacity, 1, 'real Home hero is 100% visible at p=1.0');
    assert.ok(state100.overflowX, 'no horizontal overflow on desktop');

    // Reverse scroll back to top (p = 0)
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForFunction(() => window.CrabbieLandingExperience && window.CrabbieLandingExperience.progress <= 0.05);

    let stateRev = await page.evaluate(() => {
      const exp = window.CrabbieLandingExperience;
      const stage = document.getElementById('landingStage');
      return {
        progress: exp.progress,
        stageVisible: getComputedStyle(stage).visibility,
        stagePointerEvents: getComputedStyle(stage).pointerEvents
      };
    });
    assert.ok(stateRev.progress < 0.05, `reverse scroll smoothly restored progress to ~0 (got ${stateRev.progress})`);
    assert.equal(stateRev.stageVisible, 'visible', 'landing stage is visible again upon reverse scroll');
    assert.equal(stateRev.stagePointerEvents, 'auto', 'landing stage is interactive again');

    // Test direct route navigation (e.g. to #portfolio)
    await page.evaluate(() => { location.hash = '#portfolio'; });
    await page.waitForTimeout(150);

    let statePf = await page.evaluate(() => {
      const pfView = document.querySelector('.view[data-view="portfolio"]');
      const nav = document.querySelector('.nav-shell');
      return {
        pfActive: pfView.classList.contains('is-active'),
        navClass: nav.className,
        navStyle: nav.style.cssText,
        navOpacity: parseFloat(getComputedStyle(nav).opacity),
        navPointerEvents: getComputedStyle(nav).pointerEvents
      };
    });
    assert.ok(statePf.pfActive, 'direct route to #portfolio is active');
    assert.equal(statePf.navOpacity, 1, 'nav is immediately 100% visible on other routes');
    assert.equal(statePf.navPointerEvents, 'auto', 'nav is interactive on other routes');

    await browser.close();

    /* 2. Mobile Viewport Test (WebKit / iPhone viewport 375x812) */
    console.log('Testing WebKit iPhone Viewport (375x812)...');
    const webkitBrowser = await webkit.launch({ headless: true });
    const mobilePage = await webkitBrowser.newPage({ viewport: { width: 375, height: 812 } });

    await mobilePage.goto(`http://127.0.0.1:${PORT}/#home`);
    await mobilePage.waitForSelector('#landingExperience');

    let mobileState = await mobilePage.evaluate(() => {
      const docW = document.documentElement.clientWidth;
      const scrollW = document.documentElement.scrollWidth;
      const bodyW = document.body.scrollWidth;
      return {
        noHorizontalOverflow: scrollW <= docW + 1 && bodyW <= docW + 1,
        docW, scrollW, bodyW
      };
    });
    assert.ok(mobileState.noHorizontalOverflow, `mobile portrait has no horizontal overflow (${mobileState.scrollW} <= ${mobileState.docW})`);

    // Test mobile scroll
    const mobShellH = await mobilePage.evaluate(() => document.getElementById('landingExperience').offsetHeight);
    await mobilePage.evaluate((y) => window.scrollTo(0, y), mobShellH);
    await mobilePage.waitForFunction(() => window.CrabbieLandingExperience && window.CrabbieLandingExperience.progress >= 1.0);

    let mobileDone = await mobilePage.evaluate(() => {
      const nav = document.querySelector('.nav-shell');
      const hero = document.querySelector('.view[data-view="home"] .hero');
      return {
        navOpacity: parseFloat(getComputedStyle(nav).opacity),
        heroOpacity: parseFloat(getComputedStyle(hero).opacity)
      };
    });
    assert.equal(mobileDone.navOpacity, 1, 'mobile real nav visible at end of landing');
    assert.equal(mobileDone.heroOpacity, 1, 'mobile real hero visible at end of landing');

    await webkitBrowser.close();

    /* 3. Reduced Motion Test */
    console.log('Testing Reduced Motion...');
    const rmBrowser = await chromium.launch({ headless: true });
    const rmPage = await rmBrowser.newPage({
      viewport: { width: 1280, height: 800 },
      colorScheme: 'light',
      forcedColors: 'none'
    });
    await rmPage.emulateMedia({ reducedMotion: 'reduce' });
    await rmPage.goto(`http://127.0.0.1:${PORT}/#home`);
    await rmPage.waitForSelector('#landingExperience');

    let rmState = await rmPage.evaluate(() => {
      const nav = document.querySelector('.nav-shell');
      const hero = document.querySelector('.view[data-view="home"] .hero');
      const line = document.querySelector('.ld-line');
      return {
        navOpacity: parseFloat(getComputedStyle(nav).opacity),
        heroOpacity: parseFloat(getComputedStyle(hero).opacity),
        lineDisplay: line ? getComputedStyle(line).display : null
      };
    });
    assert.equal(rmState.navOpacity, 1, 'reduced-motion has nav visible immediately');
    assert.equal(rmState.heroOpacity, 1, 'reduced-motion has real hero visible');
    assert.equal(rmState.lineDisplay, 'none', 'reduced-motion hides heavy svg line animation');

    await rmBrowser.close();

    console.log('ALL LANDING EXPERIENCE BROWSER VERIFICATION CHECKS PASSED!');
  } finally {
    server.close();
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
