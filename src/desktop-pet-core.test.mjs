import assert from 'node:assert/strict';
import { PET_LIMITS, PET_GROUND_GAP, petCountFor, initialPetCount, petGroundY, spawnPetX, initialWanderDir, pickDialogueIndex, clampPosition, nextWanderX, randomInt } from './desktop-pet-core.js';

// Pet counts: mobile is capped at one, desktop honours the configured max.
assert.equal(petCountFor(390, 5), 1, 'mobile shows exactly one pet');
assert.equal(petCountFor(1440, 5), 5, 'desktop honours the configured maximum');
assert.equal(petCountFor(1440, 99), PET_LIMITS.desktop, 'desktop max is hard-capped at five');
assert.equal(petCountFor(1440, 0), 1, 'a zero/invalid max never removes every pet');
assert.equal(petCountFor(1440, 3), 3, 'a lower configured max is respected');

// Initial count leaves room for click-spawn up to the cap.
assert.equal(initialPetCount(1440, 5), 3, 'desktop starts with three pets');
assert.equal(initialPetCount(1440, 2), 2, 'a lower cap limits the initial count');
assert.equal(initialPetCount(390, 5), 1, 'mobile starts with one pet');

// Dialogue selection never repeats the previous line when alternatives exist.
const dialogues = Array.from({ length: 15 }, (_, i) => ({ text: 'line ' + i }));
let previous = -1;
for (let i = 0; i < 200; i += 1) {
  const next = pickDialogueIndex(dialogues, previous, () => Math.random());
  assert.ok(next >= 0 && next < dialogues.length, 'index stays in range');
  assert.notEqual(next, previous, 'a dialogue is never repeated back-to-back');
  previous = next;
}
assert.equal(pickDialogueIndex([], 3), -1, 'no dialogues yields -1');
assert.equal(pickDialogueIndex([{ text: 'only' }], 0), 0, 'a single dialogue is always returned');
// Forced collision still resolves to a different line.
const forced = pickDialogueIndex(dialogues, 4, () => 4 / dialogues.length);
assert.notEqual(forced, 4, 'a forced repeat advances to another line');
assert.ok(forced >= 0 && forced < dialogues.length, 'the forced result stays in range');

// Clamping keeps the pet inside its safe bounds.
assert.deepEqual(clampPosition(-20, -5, { width: 1000, height: 800 }, { width: 60, height: 60 }), { x: 0, y: 0 });
assert.deepEqual(clampPosition(5000, 5000, { width: 1000, height: 800 }, { width: 60, height: 60 }), { x: 940, y: 740 });
assert.deepEqual(clampPosition(100, 200, { width: 1000, height: 800 }, { width: 60, height: 60 }), { x: 100, y: 200 });

// Wandering reverses at edges and never leaves the bounds.
let x = 10; let dir = -1;
const edge = nextWanderX(x, dir, 60, 1, 500, 50);
assert.equal(edge.x, 0, 'the pet stops at the left edge');
assert.equal(edge.dir, 1, 'direction reverses at the left edge');
x = 445; dir = 1;
const rightEdge = nextWanderX(x, dir, 60, 1, 500, 50);
assert.equal(rightEdge.x, 450, 'the pet stops at the right edge');
assert.equal(rightEdge.dir, -1, 'direction reverses at the right edge');
const middle = nextWanderX(200, 1, 50, 0.5, 500, 50);
assert.equal(middle.x, 225, 'the pet advances by speed * time');
assert.equal(middle.dir, 1, 'direction is unchanged mid-run');

assert.ok(randomInt(2, 2) === 2, 'a single-value range returns that value');
for (let i = 0; i < 100; i += 1) {
  const value = randomInt(3, 7);
  assert.ok(value >= 3 && value <= 7, 'randomInt stays within range');
}

// Ground band: pets rest near the bottom, never above the navigation bar.
assert.equal(petGroundY(900, 68, 96), 900 - 68 - PET_GROUND_GAP, 'desktop ground sits above the bottom gap');
assert.equal(petGroundY(900, 68, 96, 22), 810, 'the ground gap is configurable');
assert.equal(petGroundY(200, 68, 150), 158, 'a short viewport keeps the pet below the nav');
assert.equal(petGroundY(900, 68, 96) > 96, true, 'the ground is below the nav bar');

// Spawn x stays inside the viewport with a margin, biased to the middle.
assert.equal(spawnPetX(1000, 68, 16, () => 0), 16, 'spawn x honours the left margin');
assert.equal(spawnPetX(1000, 68, 16, () => 0.999), 1000 - 68 - 16, 'spawn x honours the right margin');
for (let i = 0; i < 100; i += 1) {
  const x = spawnPetX(390, 56);
  assert.ok(x >= 0 && x <= 390 - 56, 'spawn x never leaves the viewport');
}
assert.equal(initialWanderDir(10, 1000), 1, 'a pet near the left walks right');
assert.equal(initialWanderDir(990, 1000), -1, 'a pet near the right walks left');
assert.equal(initialWanderDir(500, 1000), -1, 'the midpoint walks left (not pinned to an edge)');

console.log('Desktop pet core tests passed.');
