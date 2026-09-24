/**
 * Pure navigation/scroll rules for the vanilla SPA router.
 * DOM ownership stays in crabbie-port26.html; this module holds only the
 * testable decisions so regressions use deterministic fixtures.
 */

export function sameRoute(a, b) {
  if (!a || !b) return false;
  return a.view === b.view
    && (a.id || null) === (b.id || null)
    && (a.adminModule || null) === (b.adminModule || null);
}

export function isDetailReturn(prevView, view) {
  return (prevView === 'project-detail' && view === 'portfolio')
    || (prevView === 'free-asset-detail' && view === 'free-assets');
}

export function clampScrollY(y, maxScroll) {
  const value = Number(y) || 0;
  const max = Math.max(0, Number(maxScroll) || 0);
  return Math.max(0, Math.min(value, max));
}

/**
 * Decide the scroll outcome for a route application.
 * - same route -> 'keep' (same-record refresh preserves position/focus)
 * - remembered list position available and (explicit return or Back/Forward) -> 'restore'
 * - otherwise -> 'top' (forward navigation, direct loads with no memory)
 */
export function decideScroll({ restore, prevView, view, restoredFlag = false, isSame = false }) {
  if (isSame) return 'keep';
  if (typeof restore === 'number' && (isDetailReturn(prevView, view) || restoredFlag)) return 'restore';
  return 'top';
}
