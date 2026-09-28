import assert from 'node:assert/strict';
import './appearance-core.js';

const A = globalThis.CrabbieAppearance;
assert.ok(A, 'appearance core is exposed');

// --- HEX validation / normalization (strict #RRGGBB only) ---
assert.equal(A.isValidHex('#ff5c9a'), true, 'lowercase 6-digit hex is valid');
assert.equal(A.isValidHex('#FF5C9A'), true, 'uppercase 6-digit hex is valid');
assert.equal(A.isValidHex('#ff8a'), false, 'incomplete hex is invalid');
assert.equal(A.isValidHex('#'), false, 'lone hash is invalid');
assert.equal(A.isValidHex('#f'), false, 'single digit is invalid');
assert.equal(A.isValidHex('#fff'), false, '3-digit shorthand is not supported');
assert.equal(A.isValidHex('red'), false, 'named colors are invalid');
assert.equal(A.isValidHex('#gggggg'), false, 'non-hex digits are invalid');
assert.equal(A.isValidHex(''), false, 'empty is invalid');
assert.equal(A.isValidHex(null), false, 'null is invalid');

assert.equal(A.normalizeHex('#FF5C9A'), '#ff5c9a', 'normalizes to lowercase canonical');
assert.equal(A.normalizeHex('  #123456  '), '#123456', 'trims surrounding whitespace');
assert.equal(A.normalizeHex('#ff8a'), null, 'partial stays invalid (editing-buffer only)');
assert.equal(A.normalizeHex('#'), null, 'lone hash stays invalid');
assert.equal(A.normalizeHex('oops'), null, 'garbage stays invalid');

// --- defaults / resolved values (absent key shows default, never persists) ---
assert.equal(A.defaultFor('displayColor'), '#7a3d6e', 'display default is canonical');
assert.equal(A.defaultFor('pink'), '#f6a3cf', 'pink default matches public pastel primitive');
assert.equal(A.defaultFor('lavender'), '#ca9cf5', 'lavender default matches public pastel primitive');
assert.equal(A.resolveColor({}, 'displayColor'), '#7a3d6e', 'absent key resolves to default');
assert.equal(A.resolveColor({ displayColor: '#123456' }, 'displayColor'), '#123456', 'explicit value wins');
assert.equal(A.resolveColor({ displayColor: '#ABCDEF' }, 'displayColor'), '#abcdef', 'explicit value normalizes');
assert.equal(A.resolveColor({ displayColor: 'nope' }, 'displayColor'), '#7a3d6e', 'invalid falls back to default');
const resolved = A.resolvedTheme({});
assert.equal(resolved.displayColor, '#7a3d6e', 'resolved theme fills defaults');
assert.equal(resolved.pink, '#f6a3cf', 'resolved theme fills pink default');

// --- palette normalization / clone isolation ---
const pal = A.normalizePaletteColors({ displayColor: '#112233', accentColor: 'bad', pink: '#ABCDEF' });
assert.deepEqual(pal, { displayColor: '#112233', pink: '#abcdef' }, 'palettes keep only valid normalized colors');
const src = { displayColor: '#112233', nested: { a: 1 } };
const dup = A.clonePaletteColors(src);
dup.nested.a = 2;
assert.equal(src.nested.a, 1, 'duplicate must not share mutable nested structures');

// --- cache validation (v1 compatible) ---
const oldCache = A.normalizeCachedTheme({ v: 1, theme: { displayColor: '#123456', accentColor: 'bad', backgroundImage: 'https://x/bg.jpg' } });
assert.deepEqual(oldCache, { displayColor: '#123456', backgroundImage: 'https://x/bg.jpg' }, 'old cache stays compatible, invalid colors dropped, media keys preserved');
assert.deepEqual(A.normalizeCachedTheme(null), {}, 'null cache normalizes to empty');
assert.deepEqual(A.normalizeCachedTheme({ theme: 'nope' }), {}, 'non-object theme normalizes to empty');

// --- authoritative reconciliation plan ---
let plan = A.planThemeVars({ displayColor: '#111111' });
assert.equal(plan.set['--text-display'], '#111111', 'valid explicit value is set');
assert.ok(plan.remove.includes('--text-accent'), 'absent key is removed (stale inline cleared)');
assert.ok(plan.remove.includes('--pink'), 'absent pink primitive is removed');
plan = A.planThemeVars({ pink: '#f6a3cf', lavender: '#ca9cf5' });
assert.equal(plan.set['--pink'], '#f6a3cf', 'pink primitive is set');
assert.equal(plan.set['--purple'], '#ca9cf5', 'lavender maps to --purple');
plan = A.planThemeVars({});
assert.equal(Object.keys(plan.set).length, 0, 'empty theme sets nothing');
assert.ok(plan.remove.length >= 8, 'empty theme clears every owned variable');

console.log('PASS appearance-core');
