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

assert.equal(A.defaultFor('backgroundGradientStart'), '#fdeadd', 'gradient start default matches current public background');
assert.equal(A.defaultFor('backgroundGradientEnd'), '#edd1ff', 'gradient end default matches current public background');

// --- background modes: backward-compatible default/image + solid/gradient ---
assert.equal(A.resolveBackgroundMode({}), 'default', 'old settings without image keep the built-in site background');
assert.equal(A.resolveBackgroundMode({ backgroundImage: 'https://x/bg.jpg' }), 'image', 'old image settings resolve to image mode without migration');
assert.equal(A.resolveBackgroundMode({ backgroundMode: 'GRADIENT' }), 'gradient', 'background mode normalizes case');
assert.equal(A.normalizeBackgroundModeValue('nope'), null, 'unknown background mode is rejected');
assert.equal(A.normalizeBackgroundAngle('999'), 360, 'gradient angle clamps high values');
assert.equal(A.normalizeBackgroundAngle('-20'), 0, 'gradient angle clamps low values');

let bg = A.resolveBackground({ backgroundMode:'solid', background:'#ABCDEF' });
assert.equal(bg.effectiveMode, 'solid', 'solid mode resolves directly');
assert.equal(bg.solid, '#abcdef', 'solid color normalizes');
assert.match(A.buildBackgroundCss({ backgroundMode:'solid', background:'#ABCDEF' }), /background:#abcdef !important/, 'solid mode builds public CSS');

bg = A.resolveBackground({ backgroundMode:'gradient', backgroundGradientStart:'#112233', backgroundGradientEnd:'#AABBCC', backgroundGradientAngle:45 });
assert.equal(bg.gradientStart, '#112233', 'gradient start resolves');
assert.equal(bg.gradientEnd, '#aabbcc', 'gradient end resolves');
assert.equal(bg.gradientAngle, 45, 'gradient angle resolves');
assert.match(A.buildBackgroundCss({ backgroundMode:'gradient', backgroundGradientStart:'#112233', backgroundGradientEnd:'#AABBCC', backgroundGradientAngle:45 }), /linear-gradient\(45deg,#112233 0%,#aabbcc 100%\)/, 'gradient mode builds public CSS');

bg = A.resolveBackground({ backgroundMode:'image', background:'#445566', backgroundImage:'' });
assert.equal(bg.effectiveMode, 'solid', 'image mode without an image safely falls back to solid');
assert.equal(A.backgroundFallbackColor({ backgroundMode:'gradient', backgroundGradientStart:'#123456' }), '#123456', 'overscroll fallback uses gradient start');
assert.equal(A.buildBackgroundCss({}), '', 'default mode leaves the existing decorative public background untouched');


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

// --- Batch 2A: Advanced registry (24 roles, unique vars/paths) ---
assert.equal(A.TEXT_OVERRIDE_GROUPS.length, 7, 'seven advanced groups exist');
assert.deepEqual(A.TEXT_OVERRIDE_GROUPS.map((g) => g.id), ['navigation', 'cards', 'detail', 'commission', 'forms', 'buttons', 'footer'], 'groups are navigation/cards/detail/commission/forms/buttons/footer');
assert.equal(A.TEXT_OVERRIDE_ROLES.length, 24, 'all 24 advanced roles exist');
const vars = A.TEXT_OVERRIDE_ROLES.map((r) => r.cssVar);
assert.equal(new Set(vars).size, 24, 'every role maps to exactly one unique CSS variable');
const paths = A.TEXT_OVERRIDE_ROLES.map((r) => r.path);
assert.equal(new Set(paths).size, 24, 'every storage path is unique');
const groupCounts = {};
A.TEXT_OVERRIDE_ROLES.forEach((r) => { groupCounts[r.group] = (groupCounts[r.group] || 0) + 1; });
assert.deepEqual(groupCounts, { navigation: 3, cards: 3, detail: 5, commission: 3, forms: 5, buttons: 2, footer: 3 }, 'role counts are 3/3/5/3/5/2/3');
assert.ok(A.TEXT_OVERRIDE_ROLES.every((r) => r.group && r.key && r.label && r.cssVar && r.fallback && r.path), 'each role has group/key/label/var/fallback/path');
assert.equal(A.getTextOverrideRole('cards', 'title').cssVar, '--text-card-title', 'registry lookup works');
assert.equal(A.getRoleByVar('--text-form-label').path, 'textOverrides.forms.label', 'reverse lookup by CSS variable works');
assert.equal(A.getTextOverrideRole('nope', 'nope'), null, 'unknown role lookup returns null');

// --- Batch 2A: valid explicit override resolves; absent inherits; invalid ignored ---
let info = A.resolveTextRole({ textOverrides: { cards: { title: '#123456' } } }, 'cards', 'title');
assert.deepEqual(info, { value: '#123456', explicit: true, source: 'custom' }, 'valid explicit override resolves');
info = A.resolveTextRole({ textOverrides: { cards: { title: '#ABCDEF' } } }, 'cards', 'title');
assert.equal(info.value, '#abcdef', 'explicit override normalizes to lowercase');
info = A.resolveTextRole({}, 'cards', 'title');
assert.deepEqual(info, { value: '#7a3d6e', explicit: false, source: 'displayColor' }, 'absent card title inherits the live display color');
info = A.resolveTextRole({ displayColor: '#222222' }, 'cards', 'title');
assert.equal(info.value, '#222222', 'inherited role follows global color changes');
info = A.resolveTextRole({ textOverrides: { cards: { title: '#222222' } }, displayColor: '#111111' }, 'cards', 'title');
assert.deepEqual(info, { value: '#222222', explicit: true, source: 'custom' }, 'explicit override survives global color changes');
info = A.resolveTextRole({ textOverrides: { cards: { title: 'garbage' } }, displayColor: '#111111' }, 'cards', 'title');
assert.deepEqual(info, { value: '#111111', explicit: false, source: 'displayColor' }, 'invalid override is ignored and inherits');
info = A.resolveTextRole({}, 'navigation', 'hover');
assert.deepEqual(info, { value: '#f077b9', explicit: false, source: 'state-default' }, 'nav hover inherits the documented candy default');
info = A.resolveTextRole({}, 'buttons', 'solid');
assert.deepEqual(info, { value: '#ffffff', explicit: false, source: 'state-default' }, 'solid button inherits selected-state white');
assert.equal(A.inheritanceLabel(A.resolveTextRole({}, 'cards', 'title')), 'Display', 'inherited indicator names the source');
assert.equal(A.inheritanceLabel(A.resolveTextRole({}, 'navigation', 'hover')), 'current candy hover default', 'state default indicator is truthful');
assert.equal(A.inheritanceLabel(A.resolveTextRole({ textOverrides: { cards: { title: '#123456' } } }, 'cards', 'title')), 'Custom', 'explicit indicator reads Custom');

// --- Batch 2A: normalization / pruning (return-to-inherited deletes leaves) ---
assert.deepEqual(
  A.normalizeTextOverrides({ cards: { title: '#112233', metadata: 'bad' }, detail: {}, unknown: { x: '#123456' } }),
  { cards: { title: '#112233' } },
  'normalization keeps valid leaves, drops invalid/empty/unknown groups',
);
const pruned = { textOverrides: { cards: { title: '#112233' } } };
A.setTextOverride(pruned, 'cards', 'title', null);
assert.deepEqual(pruned, {}, 'clearing the last leaf prunes the group and textOverrides itself');
const kept = { textOverrides: { cards: { title: '#112233', metadata: '#445566' } } };
A.setTextOverride(kept, 'cards', 'title', '');
assert.deepEqual(kept, { textOverrides: { cards: { metadata: '#445566' } } }, 'empty string is not canonical: it deletes the leaf and keeps siblings');
const stored = {};
A.setTextOverride(stored, 'forms', 'label', '#AABBCC');
assert.deepEqual(stored, { textOverrides: { forms: { label: '#aabbcc' } } }, 'storing normalizes to canonical lowercase');
assert.equal(A.getTextOverrideRole('forms', 'nope'), null, 'unknown keys are never stored');
assert.equal(A.countExplicitOverrides({ textOverrides: { cards: { title: '#112233' }, forms: { label: '#445566', helper: 'bad' } } }), 2, 'explicit override count ignores invalid leaves');

// --- Batch 2A: authoritative Advanced reconciliation ---
let adv = A.planAdvancedVars({ textOverrides: { cards: { title: '#123456' } } });
assert.equal(adv.set['--text-card-title'], '#123456', 'explicit override is set');
assert.ok(adv.remove.includes('--text-card-meta'), 'absent role is removed (stale inline cleared)');
assert.equal(adv.remove.length, 23, 'one explicit role leaves 23 removals');
adv = A.planAdvancedVars({});
assert.equal(Object.keys(adv.set).length, 0, 'empty theme sets no advanced variables');
assert.equal(adv.remove.length, 24, 'empty theme removes all 24 advanced variables');

// --- Batch 2A: cache v1/v2 + invalid cached overrides ---
const v1 = A.normalizeCachedTheme({ v: 1, theme: { displayColor: '#123456', backgroundImage: 'https://x/bg.jpg' } });
assert.deepEqual(v1, { displayColor: '#123456', backgroundImage: 'https://x/bg.jpg' }, 'v1 cache without overrides still works');
const v2 = A.normalizeCachedTheme({ v: 2, theme: { displayColor: '#123456', textOverrides: { cards: { title: '#ABCDEF' }, forms: { label: 'bad' } } } });
assert.deepEqual(v2, { displayColor: '#123456', textOverrides: { cards: { title: '#abcdef' } } }, 'v2 cache carries valid overrides and ignores invalid leaves');
const v2empty = A.normalizeCachedTheme({ v: 2, theme: { textOverrides: { cards: { title: 'nope' } } } });
assert.deepEqual(v2empty, {}, 'a cache with only invalid overrides carries nothing');

// --- Batch 2A: palette snapshot/apply/deep-clone ---
const snap = A.snapshotPaletteColors({ displayColor: '#112233', accentColor: 'bad', textOverrides: { cards: { title: '#445566', metadata: 'bad' } } });
assert.deepEqual(snap, { displayColor: '#112233', textOverrides: { cards: { title: '#445566' } } }, 'snapshots keep valid core colors plus explicit overrides only');
assert.deepEqual(A.snapshotPaletteColors({ displayColor: '#112233' }), { displayColor: '#112233' }, 'snapshots omit textOverrides when nothing is explicit');
const oldPal = { displayColor: '#111111' };
const draftWithStale = { displayColor: '#222222', textOverrides: { cards: { title: '#333333' } } };
A.applyPaletteColors(draftWithStale, oldPal);
assert.deepEqual(draftWithStale, { displayColor: '#111111' }, 'applying an old palette clears stale advanced overrides');
const newPal = { displayColor: '#111111', textOverrides: { cards: { title: '#ABCDEF' } } };
const draftFresh = { displayColor: '#222222', textOverrides: { forms: { label: '#000000' } } };
A.applyPaletteColors(draftFresh, newPal);
assert.deepEqual(draftFresh, { displayColor: '#111111', textOverrides: { cards: { title: '#abcdef' } } }, 'applying a new palette replaces overrides wholesale');
const nestSrc = { textOverrides: { cards: { title: '#112233' } } };
const nestDup = A.clonePaletteColors(nestSrc);
nestDup.textOverrides.cards.title = '#999999';
assert.equal(nestSrc.textOverrides.cards.title, '#112233', 'duplicate deep-clones nested override objects');

console.log('PASS appearance-core');
