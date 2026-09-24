/**
 * Pure lightbox gesture math. DOM/pointer wiring lives in crabbie-port26.html;
 * this module owns only bounds/clamp decisions so pinch, drag, reset and
 * orientation cases are covered with deterministic fixtures.
 */

export const LIGHTBOX_MIN_SCALE = 1;
export const LIGHTBOX_MAX_SCALE = 4;

export function clampScale(next, min = LIGHTBOX_MIN_SCALE, max = LIGHTBOX_MAX_SCALE) {
  return Math.max(min, Math.min(max, Number(next) || min));
}

/**
 * Valid pan half-range for the current zoom, relative to the artwork's own
 * laid-out box (transform-free client size): at full deflection an image
 * edge lands exactly on the stage edge. Matches lightboxBounds() in the SPA.
 */
export function panBounds(layoutW, layoutH, scale) {
  const w = Number(layoutW) || 0;
  const h = Number(layoutH) || 0;
  const s = Number(scale) || 1;
  return { x: Math.max(0, (w * s - w) / 2), y: Math.max(0, (h * s - h) / 2) };
}

export function clampPan(x, y, bounds, scale) {
  if (scale <= 1) return { x: 0, y: 0 };
  const bx = Math.max(0, bounds?.x || 0);
  const by = Math.max(0, bounds?.y || 0);
  return {
    x: Math.max(-bx, Math.min(bx, Number(x) || 0)),
    y: Math.max(-by, Math.min(by, Number(y) || 0)),
  };
}

export function lightboxTransform(scale, x, y) {
  if (scale === 1 && x === 0 && y === 0) return '';
  return `translate(${x}px,${y}px) scale(${scale})`;
}
