import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';

// The browser loads the exact same bytes synchronously via
// `<script src="/src/portfolio-grid-core.js">` before its inline wiring
// runs, so the unit test exercises the browser-used implementation
// through the shared global (no separate ESM copy, no inline mirror).
import './portfolio-grid-core.js';

const {
  PORTFOLIO_DESKTOP_BANDS,
  PORTFOLIO_COMPACT_VARIANT,
  PORTFOLIO_VARIANT_CLASSES,
  planPortfolioVariants,
  isPortfolioVariantClass,
} = globalThis.CrabbiePortfolioGrid;

assert.ok(planPortfolioVariants, 'the shared planner is exposed on the browser global');

// --- deterministic desktop composition -----------------------------------
const fullCycle = ['pf-l', 'pf-t', 'pf-s', 'pf-s', 'pf-s', 'pf-w', 'pf-w'];

assert.deepEqual(planPortfolioVariants(0, 'desktop'), [], 'no cards -> no variants');
assert.deepEqual(planPortfolioVariants(1, 'desktop'), ['pf-s'], 'a lone card is an incomplete tail (no partial band)');
assert.deepEqual(planPortfolioVariants(2, 'desktop'), ['pf-l', 'pf-t'], 'the large/tall band completes at two');
assert.deepEqual(planPortfolioVariants(3, 'desktop'), ['pf-l', 'pf-t', 'pf-s'], 'an incomplete small band falls back to smalls');
assert.deepEqual(planPortfolioVariants(4, 'desktop'), ['pf-l', 'pf-t', 'pf-s', 'pf-s'], 'four cards fill the small band partially');
assert.deepEqual(planPortfolioVariants(5, 'desktop'), ['pf-l', 'pf-t', 'pf-s', 'pf-s', 'pf-s'], 'five cards complete the small band');
assert.deepEqual(planPortfolioVariants(6, 'desktop'), ['pf-l', 'pf-t', 'pf-s', 'pf-s', 'pf-s', 'pf-s'], 'a lone card cannot open the wide band');
assert.deepEqual(planPortfolioVariants(7, 'desktop'), fullCycle, 'a complete cycle tiles all three bands');
assert.deepEqual(planPortfolioVariants(8, 'desktop'), fullCycle.concat(['pf-s']), 'incomplete tail after full cycle falls back to pf-s');
assert.deepEqual(planPortfolioVariants(9, 'desktop'), fullCycle.concat(['pf-l', 'pf-t']), 'second cycle starts with large/tall band');
assert.deepEqual(planPortfolioVariants(14, 'desktop'), fullCycle.concat(fullCycle), 'cycles repeat exactly');
assert.deepEqual(planPortfolioVariants(21, 'desktop'), fullCycle.concat(fullCycle).concat(fullCycle), '3 cycles repeat exactly');

// At most one large card per complete seven-card cycle.
for (const n of [7, 14, 21]) {
  const plan = planPortfolioVariants(n, 'desktop');
  assert.equal(plan.filter((v) => v === 'pf-l').length, n / 7, `exactly one large card per seven at n=${n}`);
  assert.equal(plan.length, n, `every visible card gets one variant at n=${n}`);
}

// Incomplete tails never open a large/wide band
for (let c = 0; c <= 25; c++) {
  const plan = planPortfolioVariants(c, 'desktop');
  assert.equal(plan.length, c, `plan length matches count for c=${c}`);
  const largeCount = plan.filter((v) => v === 'pf-l').length;
  const cycleCount = Math.floor(c / 7);
  const remainder = c % 7;
  const expectedLarge = cycleCount + (remainder >= 2 ? 1 : 0);
  assert.equal(largeCount, expectedLarge, `expected large count at c=${c}`);
}

// The exact pattern text is the contract, not just the shape.
assert.equal(PORTFOLIO_DESKTOP_BANDS.map((b) => b.join('+')).join('|'), 'pf-l+pf-t|pf-s+pf-s+pf-s|pf-w+pf-w', 'band order is the agreed pattern');

// --- compact + determinism -----------------------------------------------
for (const mode of ['compact', 'tablet', 'mobile', 'unknown']) {
  assert.deepEqual(planPortfolioVariants(5, mode), new Array(5).fill(PORTFOLIO_COMPACT_VARIANT), `${mode} never uses three-row spans`);
}
assert.ok(planPortfolioVariants(9, 'compact').every((v) => v === 'pf-s'), 'compact ordinary cards stay small/paired');

// Same count -> same plan, every time (no DOM-history dependence).
assert.deepEqual(planPortfolioVariants(11, 'desktop'), planPortfolioVariants(11, 'desktop'), 'the same count yields the same composition');

// Every emitted class is a real grid variant.
planPortfolioVariants(20, 'desktop').forEach((v) => assert.ok(isPortfolioVariantClass(v), `${v} is a known variant`));
assert.equal(isPortfolioVariantClass('pf-invalid'), false, 'invalid variant rejected');

// --- single-source runtime guard ------------------------------------------
// The SPA must use this exact implementation at runtime: it loads the same
// file synchronously and forwards planning to the shared global. Changing
// the algorithm in one place without the other failing is the regression
// this guards against, so any second band/planner rule in the HTML fails.
const coreSource = await readFile(new URL('./portfolio-grid-core.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../crabbie-port26.html', import.meta.url), 'utf8');

// The core file must parse as a classic script (synchronous <script src>)
// and therefore cannot use static import/export keywords.
new Script(coreSource, { filename: 'portfolio-grid-core.js' });
assert.ok(!/^\s*(export|import)\b/m.test(coreSource), 'the core stays classic-loadable (no static import/export)');
assert.ok(coreSource.includes('globalThis') && coreSource.includes('CrabbiePortfolioGrid'), 'the core exposes the shared browser global');

// The browser loads the single source before its inline wiring runs.
const coreScriptIndex = html.indexOf('<script src="/src/portfolio-grid-core.js">');
assert.ok(coreScriptIndex !== -1, 'the SPA loads the single planner source synchronously');
assert.ok(
  coreScriptIndex < html.indexOf('function syncPortfolioComposition()'),
  'the planner loads before the composition wiring runs (no race, no flash)'
);

// No second band/planner rule may live inline.
assert.ok(!html.includes('var PORTFOLIO_DESKTOP_BANDS'), 'no inline band mirror remains');
assert.ok(!html.includes('total - out.length < next.length'), 'no inline planner algorithm remains');

// The inline planner is a thin forward to the shared runtime implementation.
assert.ok(
  html.includes('function planPortfolioVariants(count, mode)') &&
    html.includes('window.CrabbiePortfolioGrid.planPortfolioVariants(count, mode)'),
  'the SPA planner forwards to the shared runtime implementation'
);
assert.ok(html.includes('function portfolioGridMode()'), 'breakpoint observation stays in the browser layer');
assert.ok(html.includes('function syncPortfolioComposition()'), 'the SPA exposes one shared composition assignment path');
assert.ok(
  html.includes('planPortfolioVariants(cards.length, portfolioGridMode())'),
  'composition assigns the shared plan through the one shared path'
);

console.log('PASS portfolio grid composition: deterministic bands, compact fallback and single-source runtime sync');
