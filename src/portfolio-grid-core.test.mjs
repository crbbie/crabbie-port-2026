import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PORTFOLIO_DESKTOP_BANDS,
  PORTFOLIO_COMPACT_VARIANT,
  planPortfolioVariants,
  isPortfolioVariantClass,
} from './portfolio-grid-core.js';

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
assert.deepEqual(planPortfolioVariants(14, 'desktop'), fullCycle.concat(fullCycle), 'cycles repeat exactly');

// At most one large card per complete seven-card cycle.
for (const n of [7, 14, 21]) {
  const plan = planPortfolioVariants(n, 'desktop');
  assert.equal(plan.filter((v) => v === 'pf-l').length, n / 7, `exactly one large card per seven at n=${n}`);
  assert.equal(plan.length, n, `every visible card gets one variant at n=${n}`);
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

// --- inline mirror drift guard -------------------------------------------
// The SPA cannot import ES modules at parse time, so it mirrors the band
// pattern inline. Catch drift by asserting the exact literal is present.
const html = await readFile(new URL('../crabbie-port26.html', import.meta.url), 'utf8');
assert.ok(
  html.includes("var PORTFOLIO_DESKTOP_BANDS = [['pf-l','pf-t'],['pf-s','pf-s','pf-s'],['pf-w','pf-w']];"),
  'the SPA inline mirror declares the same desktop band pattern'
);
assert.ok(html.includes('function planPortfolioVariants(count, mode)'), 'the SPA inline mirror exposes planPortfolioVariants');
assert.ok(html.includes('function syncPortfolioComposition()'), 'the SPA exposes one shared composition assignment path');

console.log('PASS portfolio grid composition: deterministic bands, compact fallback and inline sync');
