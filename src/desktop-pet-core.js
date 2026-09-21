/**
 * Pure desktop-pet rules. No DOM or timers here so the behaviour is testable:
 * pet counts per viewport, no-immediate-repeat dialogue selection, edge-aware
 * wandering, and safe-area clamping.
 */

export const PET_LIMITS = Object.freeze({ desktop: 5, mobile: 1 });
export const PET_GROUND_GAP = 0;
/* Only one pet exists on load; every further pet is spawned by interaction. */
export const PET_INITIAL_DESKTOP = 1;

/** Pets allowed at a viewport width. Mobile is capped hard at one pet. */
export function petCountFor(viewportWidth, maxDesktop = PET_LIMITS.desktop) {
  const width = Number.isFinite(viewportWidth) ? viewportWidth : 1440;
  if (width < 720) return PET_LIMITS.mobile;
  const max = Number.isFinite(maxDesktop) ? Math.floor(maxDesktop) : PET_LIMITS.desktop;
  return Math.max(1, Math.min(PET_LIMITS.desktop, max));
}

/**
 * How many pets exist on first load: exactly one. The rest are spawned one at a
 * time by clicking a pet, up to the cap.
 */
export function initialPetCount(viewportWidth, maxDesktop = PET_LIMITS.desktop) {
  const cap = petCountFor(viewportWidth, maxDesktop);
  return Math.min(cap, PET_INITIAL_DESKTOP);
}

/**
 * FIFO spawn plan for one interaction. Below the cap a new pet is simply added;
 * at the cap the oldest pet leaves first so at most `cap` pets ever exist.
 */
export function planPetSpawn(currentCount, cap) {
  const limit = Number.isFinite(cap) ? Math.max(0, Math.floor(cap)) : 0;
  const count = Number.isFinite(currentCount) ? Math.max(0, Math.floor(currentCount)) : 0;
  if (limit <= 0) return { removeOldest: false, add: false };
  return { removeOldest: count >= limit, add: true };
}

/** A random pause before a pet changes direction, so pets do not move in step. */
export function nextTurnDelayMs(random = Math.random) {
  return randomInt(1800, 5200, random);
}

/**
 * The resting y for a pet: flush with the bottom edge of the viewport by
 * default, never above the navigation bar. This makes the pet feel like it is
 * standing on the browser/screen edge like a real desktop pet.
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
 * Picks a dialogue index. A pet never repeats its own previous line, and a
 * shared `recent` history (indices used by any pet lately) is avoided too, so
 * two active pets do not speak the same line. Falls back gracefully when the
 * list is too small to satisfy every exclusion.
 */
export function pickDialogueIndex(dialogues, previousIndex = -1, random = Math.random, recent = []) {
  const list = Array.isArray(dialogues) ? dialogues : [];
  if (!list.length) return -1;
  if (list.length === 1) return 0;
  const recentSet = new Set(Array.isArray(recent) ? recent : []);
  let pool = [];
  for (let i = 0; i < list.length; i += 1) {
    if (i === previousIndex || recentSet.has(i)) continue;
    pool.push(i);
  }
  /* Relax the global history before relaxing the pet's own last line. */
  if (!pool.length) {
    for (let i = 0; i < list.length; i += 1) if (i !== previousIndex) pool.push(i);
  }
  if (!pool.length) {
    for (let i = 0; i < list.length; i += 1) pool.push(i);
  }
  let pick = pool[Math.floor(random() * pool.length)];
  if (!Number.isFinite(pick) || pick < 0 || pick >= list.length) pick = pool[0];
  return pick;
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
