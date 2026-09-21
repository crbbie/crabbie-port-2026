/**
 * Pure desktop-pet rules. No DOM or timers here so the behaviour is testable:
 * pet counts per viewport, no-immediate-repeat dialogue selection, edge-aware
 * wandering, and safe-area clamping.
 */

export const PET_LIMITS = Object.freeze({ desktop: 5, mobile: 1 });
export const PET_GROUND_GAP = 22;
export const PET_INITIAL_DESKTOP = 3;

/** Pets allowed at a viewport width. Mobile is capped hard at one pet. */
export function petCountFor(viewportWidth, maxDesktop = PET_LIMITS.desktop) {
  const width = Number.isFinite(viewportWidth) ? viewportWidth : 1440;
  if (width < 720) return PET_LIMITS.mobile;
  const max = Number.isFinite(maxDesktop) ? Math.floor(maxDesktop) : PET_LIMITS.desktop;
  return Math.max(1, Math.min(PET_LIMITS.desktop, max));
}

/**
 * How many pets appear on first load. Fewer than the cap so clicking can add
 * more (each new pet drops in) up to `maxDesktop`.
 */
export function initialPetCount(viewportWidth, maxDesktop = PET_LIMITS.desktop) {
  const cap = petCountFor(viewportWidth, maxDesktop);
  if (viewportWidth < 720) return 1;
  return Math.min(cap, PET_INITIAL_DESKTOP);
}

/**
 * The resting y for a pet: near the bottom of the viewport, never above the
 * navigation bar. Pets live in this ground band like a real desktop pet.
 */
export function petGroundY(viewportHeight, petHeight, navHeight, gap = PET_GROUND_GAP) {
  const height = Number.isFinite(viewportHeight) ? viewportHeight : 800;
  const size = Number.isFinite(petHeight) ? petHeight : 68;
  const nav = Number.isFinite(navHeight) ? navHeight : 84;
  const floor = height - size - gap;
  const ceiling = nav + 8;
  return Math.max(ceiling, floor);
}

/** Random x inside the viewport with an even margin, never off-screen. */
export function spawnPetX(viewportWidth, petWidth, margin = 16, random = Math.random) {
  const width = Number.isFinite(viewportWidth) ? viewportWidth : 1440;
  const size = Number.isFinite(petWidth) ? petWidth : 68;
  const lo = Math.min(margin, Math.max(0, width - size));
  const hi = Math.max(lo, width - size - margin);
  return randomInt(lo, hi, random);
}

/** Wander toward the middle so a pet near an edge does not hug the corner. */
export function initialWanderDir(x, viewportWidth) {
  const width = Number.isFinite(viewportWidth) ? viewportWidth : 1440;
  return x < width / 2 ? 1 : -1;
}

/**
 * Picks a dialogue index, never returning `previousIndex` twice in a row while
 * more than one dialogue exists. `random` is injectable for tests.
 */
export function pickDialogueIndex(dialogues, previousIndex = -1, random = Math.random) {
  const list = Array.isArray(dialogues) ? dialogues : [];
  if (!list.length) return -1;
  if (list.length === 1) return 0;
  let index = Math.floor(random() * list.length);
  if (!Number.isFinite(index) || index < 0) index = 0;
  if (index >= list.length) index = list.length - 1;
  if (index === previousIndex) {
    index = (previousIndex + 1 + Math.floor(random() * (list.length - 1))) % list.length;
  }
  if (index === previousIndex) index = (previousIndex + 1) % list.length;
  return index;
}

/** Clamps a rectangle's top-left inside bounds. */
export function clampPosition(x, y, bounds, size) {
  const maxX = Math.max(0, (bounds.width || 0) - (size.width || 0));
  const maxY = Math.max(0, (bounds.height || 0) - (size.height || 0));
  return {
    x: Math.min(Math.max(0, x), maxX),
    y: Math.min(Math.max(0, y), maxY)
  };
}

/**
 * One horizontal wander step. Reverses direction at the edges instead of
 * teleporting, so the pet glides back and forth.
 */
export function nextWanderX(x, dir, speed, dtSeconds, boundsWidth, petWidth) {
  const maxX = Math.max(0, (boundsWidth || 0) - (petWidth || 0));
  const direction = dir >= 0 ? 1 : -1;
  const step = Math.abs(speed || 0) * Math.max(0, dtSeconds || 0);
  let nextX = x + direction * step;
  let nextDir = direction;
  if (nextX <= 0) { nextX = 0; nextDir = 1; }
  else if (nextX >= maxX) { nextX = maxX; nextDir = -1; }
  return { x: nextX, dir: nextDir };
}

/** Deterministic-ish random int in [min, max]. */
export function randomInt(min, max, random = Math.random) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(random() * (hi - lo + 1));
}
