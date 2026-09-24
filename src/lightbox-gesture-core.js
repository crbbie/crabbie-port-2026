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

/** Valid pan half-range for the current zoom (image edge meets dialog edge). */
export function panBounds(imgW, imgH, boxW, boxH, scale) {
  const overX = Math.max(0, ((Number(imgW) || 0) * scale - (Number(boxW) || 0)) / 2);
  const overY = Math.max(0, ((Number(imgH) || 0) * scale - (Number(boxH) || 0)) / 2);
  return { x: overX, y: overY };
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
