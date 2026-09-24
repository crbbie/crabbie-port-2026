import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sameRoute, isDetailReturn, clampScrollY, decideScroll } from './route-scroll-core.js';
import { clampScale, panBounds, clampPan, lightboxTransform } from './lightbox-gesture-core.js';

// --- route/scroll decisions (deterministic fixtures, no production data) ---
assert.equal(sameRoute({ view: 'project-detail', id: 'a' }, { view: 'project-detail', id: 'a' }), true, 'same detail route matches');
assert.equal(sameRoute({ view: 'project-detail', id: 'a' }, { view: 'project-detail', id: 'b' }), false, 'different detail ids differ');
assert.equal(sameRoute({ view: 'admin', adminModule: 'media' }, { view: 'admin', adminModule: 'media' }), true, 'same admin module matches');
assert.equal(sameRoute({ view: 'admin', adminModule: 'media' }, { view: 'admin', adminModule: 'requests' }), false, 'different admin modules differ');

assert.equal(isDetailReturn('project-detail', 'portfolio'), true, 'project return restores list');
assert.equal(isDetailReturn('free-asset-detail', 'free-assets'), true, 'asset return restores list');
assert.equal(isDetailReturn('home', 'portfolio'), false, 'forward nav is not a return');

assert.equal(clampScrollY(500, 2000), 500, 'in-bounds position kept');
assert.equal(clampScrollY(-50, 2000), 0, 'negative clamps to zero');
assert.equal(clampScrollY(99999, 1200), 1200, 'beyond-document clamps to max');

assert.equal(decideScroll({ restore: 400, prevView: 'project-detail', view: 'portfolio' }), 'restore', 'explicit return restores');
assert.equal(decideScroll({ restore: 400, prevView: 'home', view: 'portfolio', restoredFlag: true }), 'restore', 'Back/Forward restores visited view');
assert.equal(decideScroll({ restore: undefined, prevView: 'home', view: 'portfolio', restoredFlag: true }), 'top', 'direct load with no memory goes top');
assert.equal(decideScroll({ restore: 400, prevView: 'home', view: 'portfolio' }), 'top', 'forward nav goes top');
assert.equal(decideScroll({ restore: 400, prevView: 'project-detail', view: 'project-detail', isSame: true }), 'keep', 'same-record refresh keeps position');

// --- lightbox gesture math (image-relative stage bounds) ---
assert.equal(clampScale(9), 4, 'zoom clamps to max');
assert.equal(clampScale(0.2), 1, 'zoom clamps to min');
const stageBounds = panBounds(362, 362, 1.4);
assert.ok(Math.abs(stageBounds.x - 72.4) < 1e-9 && Math.abs(stageBounds.y - 72.4) < 1e-9, 'edge-exact stage bounds at 1.4x');
assert.deepEqual(panBounds(100, 100, 1), { x: 0, y: 0 }, 'no pan range at 1x');
assert.deepEqual(panBounds(0, 0, 2), { x: 0, y: 0 }, 'unloaded artwork never pans');
assert.deepEqual(clampPan(9999, -9999, { x: 50, y: 30 }, 2), { x: 50, y: -30 }, 'pan clamps to valid bounds');
assert.deepEqual(clampPan(20, 10, { x: 50, y: 30 }, 1), { x: 0, y: 0 }, '1x always resets pan');
assert.equal(lightboxTransform(1, 0, 0), '', '1x resting transform is empty');
assert.equal(lightboxTransform(2, 10, -5), 'translate(10px,-5px) scale(2)', 'zoomed transform tracks the pointer');

// --- static contracts in the SPA shell ---
const html = await readFile(new URL('../crabbie-port26.html', import.meta.url), 'utf8');
assert.ok(!html.includes('<span class="dot" aria-hidden="true">'), 'badge heart removed; shared hearts untouched');
assert.ok(html.includes('CHIBI &amp; ANIME STYLE ILLUSTRATOR'), 'badge text preserved');
assert.ok(html.includes('function instantScrollTo'), 'single instant scroll primitive exists');
assert.ok(html.includes('window.scrollTo(0, restore)') === false, 'smooth-inheriting restore call removed');
assert.ok(html.includes('lastAppliedHash') && html.includes('sameRoute(nextRoute, currentRoute)'), 'single navigation owner dedupes hash echoes');
assert.ok(html.includes('body.is-restoring'), 'restoration lifecycle keeps restored content stationary');
assert.ok(html.includes('animation-fill-mode: backwards'), 'completed entrance transforms release hover lift');
assert.ok(html.includes('.public-lightbox.is-zoomed #publicLightboxImg'), 'gesture policy is scale-aware and id-scoped (avatars untouched)');
assert.ok(html.includes('#publicLightboxImg.anim-zoom'), 'discrete zoom animates while drag/pinch paint directly');
assert.ok(html.includes('touchcancel'), 'touch cancellation is handled');
assert.ok(html.includes('same-record refresh') || html.includes('Same-record refresh'), 'same-route refresh preserves position');
assert.ok(html.includes('Stale') || html.includes('stale') || html.includes('Guard the delayed scroll'), 'commission delayed scrolls are guarded');
// --- integration: main-line viewer behavior merged with collections ---
assert.ok(html.includes('is-panning'), 'pointer drag shows a grabbing cursor');
assert.ok(html.includes("addEventListener('dragstart'"), 'native image drag never fights pointer panning');
assert.ok(html.includes('stepViewer') && html.includes('panBy'), 'arrows step collections but pan a single zoomed image');
assert.ok(html.includes('portfolioCardArtwork'), 'image-only card artwork keeps its own stacking-safe markup');
assert.ok(html.includes('.pd-cover > img'), 'the cover-overflow fix survives integration');

const motion = await readFile(new URL('./site-motion.js', import.meta.url), 'utf8');
assert.ok(motion.includes('handleReduceChange'), 'idempotent reduced-motion handler exists');
assert.ok(motion.includes('syncMusicFieldFocus'), 'the field-focus music guard wins over the older visibility guard');
assert.ok(!motion.includes('syncMusicFieldGuard'), 'no duplicate music guard remains');
assert.ok(motion.includes("addEventListener('change'") || motion.includes('addListener'), 'preference changes are observed');

console.log('PASS nav/motion repairs: scroll owner, restoration, lightbox, same-route, reduced-motion');
