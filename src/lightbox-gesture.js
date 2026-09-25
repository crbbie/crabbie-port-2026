/**
 * Browser bridge for the pure lightbox gesture math.
 *
 * The SPA viewer controller (crabbie-port26.html) keeps DOM ownership:
 * measuring the artwork's transform-free client size, owning the gesture
 * state machine, and painting the transform. This module only exposes the
 * pure geometry decisions from lightbox-gesture-core.js as
 * window.CrabbieLightboxGesture so the running viewer uses the exact
 * implementation covered by unit tests.
 */
import {
  LIGHTBOX_MIN_SCALE,
  LIGHTBOX_MAX_SCALE,
  clampScale,
  panBounds,
  clampPan,
  lightboxTransform,
} from './lightbox-gesture-core.js';

if (typeof window !== 'undefined') {
  window.CrabbieLightboxGesture = Object.freeze({
    LIGHTBOX_MIN_SCALE,
    LIGHTBOX_MAX_SCALE,
    clampScale,
    panBounds,
    clampPan,
    lightboxTransform,
  });
}
