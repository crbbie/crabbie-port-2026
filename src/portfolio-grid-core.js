/**
 * portfolio-grid-core.js
 *
 * Presentation-only, pure Portfolio grid composition. DOM wiring lives in
 * `crabbie-port26.html` (an inline mirror of the same band pattern); this
 * module is the canonical spec and is covered by deterministic fixtures.
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

export const PORTFOLIO_DESKTOP_BANDS = Object.freeze([
  Object.freeze(['pf-l', 'pf-t']),
  Object.freeze(['pf-s', 'pf-s', 'pf-s']),
  Object.freeze(['pf-w', 'pf-w']),
]);

export const PORTFOLIO_COMPACT_VARIANT = 'pf-s';

export const PORTFOLIO_VARIANT_CLASSES = Object.freeze(['pf-l', 'pf-t', 'pf-s', 'pf-w']);

export function planPortfolioVariants(count, mode = 'desktop') {
  const total = Math.max(0, Math.floor(Number(count) || 0));
  if (mode !== 'desktop') return new Array(total).fill(PORTFOLIO_COMPACT_VARIANT);
  const out = [];
  let band = 0;
  while (out.length < total) {
    const next = PORTFOLIO_DESKTOP_BANDS[band % PORTFOLIO_DESKTOP_BANDS.length];
    if (total - out.length < next.length) break;
    out.push(...next);
    band += 1;
  }
  while (out.length < total) out.push(PORTFOLIO_COMPACT_VARIANT);
  return out;
}

export function isPortfolioVariantClass(name) {
  return PORTFOLIO_VARIANT_CLASSES.indexOf(name) !== -1;
}
