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
 * - 'keep': no scroll performed (noScroll option set, or same-route refresh).
 * - 'restore': restore remembered scroll position (detail return or Back/Forward to visited view with memory).
 * - 'top': reset scroll to top (fresh navigation, forceScroll option, or view without memory).
 */
export function decideScroll({
  restore,
  prevView,
  view,
  restoredFlag = false,
  isSame = false,
  noScroll = false,
  forceScroll = false
}) {
  if (noScroll || isSame) return 'keep';
  if (!forceScroll && typeof restore === 'number' && (isDetailReturn(prevView, view) || Boolean(restoredFlag))) {
    return 'restore';
  }
  return 'top';
}
