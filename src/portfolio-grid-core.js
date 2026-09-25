/**
 * portfolio-grid-core.js
 *
 * Single canonical source for the presentation-only Portfolio grid
 * composition. This file is intentionally a classic script (no static
 * `import`/`export` keywords) so the vanilla SPA can load it synchronously
 * via `<script src="/src/portfolio-grid-core.js">` before its inline wiring
 * runs. `initFilter` calls composition synchronously during parse, so an
 * async/deferred module load would race first paint and flash the grid.
 *
 * Browser: `window.CrabbiePortfolioGrid` (also `globalThis`).
 * Node: side-effect import (`import './portfolio-grid-core.js'`) then read
 * `globalThis.CrabbiePortfolioGrid`; CommonJS gets `module.exports`.
 *
 * Desktop (>1180px) uses a small repeating pattern of complete bands:
 *
 *   [large, tall], [small, small, small], [wide, wide]
 *
 * A complete seven-card cycle therefore has exactly one large card. Only
 * complete bands are applied; an incomplete tail falls back to compact small
 * cards. Compact layouts (<=1180px, incl. tablet/mobile) never use the legacy
 * three-row spans, so ordinary cards stay as paired bands and image-only cards
 * keep their own full-width natural-height rows via CSS.
 *
 * The plan is a pure function of the visible ordered count, so the same final
 * records/order/filter yields the same composition regardless of the source
 * slug, DOM history, or an earlier removal/reintroduction.
 */
(function (root) {
  'use strict';

  var PORTFOLIO_DESKTOP_BANDS = Object.freeze([
    Object.freeze(['pf-l', 'pf-t']),
    Object.freeze(['pf-s', 'pf-s', 'pf-s']),
    Object.freeze(['pf-w', 'pf-w']),
  ]);

  var PORTFOLIO_COMPACT_VARIANT = 'pf-s';

  var PORTFOLIO_VARIANT_CLASSES = Object.freeze(['pf-l', 'pf-t', 'pf-s', 'pf-w']);

  function planPortfolioVariants(count, mode) {
    var total = Math.max(0, Math.floor(Number(count) || 0));
    if (mode !== 'desktop') {
      var compact = [];
      for (var k = 0; k < total; k++) compact.push(PORTFOLIO_COMPACT_VARIANT);
      return compact;
    }
    var out = [];
    var band = 0;
    while (out.length < total) {
      var next = PORTFOLIO_DESKTOP_BANDS[band % PORTFOLIO_DESKTOP_BANDS.length];
      if (total - out.length < next.length) break;
      for (var n = 0; n < next.length; n++) out.push(next[n]);
      band += 1;
    }
    while (out.length < total) out.push(PORTFOLIO_COMPACT_VARIANT);
    return out;
  }

  function isPortfolioVariantClass(name) {
    return PORTFOLIO_VARIANT_CLASSES.indexOf(name) !== -1;
  }

  var api = {
    PORTFOLIO_DESKTOP_BANDS: PORTFOLIO_DESKTOP_BANDS,
    PORTFOLIO_COMPACT_VARIANT: PORTFOLIO_COMPACT_VARIANT,
    PORTFOLIO_VARIANT_CLASSES: PORTFOLIO_VARIANT_CLASSES,
    planPortfolioVariants: planPortfolioVariants,
    isPortfolioVariantClass: isPortfolioVariantClass,
  };

  root.CrabbiePortfolioGrid = api;

  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
