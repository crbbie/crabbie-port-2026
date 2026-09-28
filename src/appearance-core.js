/**
 * appearance-core.js
 *
 * Phase 1 canonical resolver/normalizer for Admin > Appearance.
 * Pure rules only (no DOM/network): HEX validation, normalization,
 * global defaults, resolved values, palette normalization, cache
 * validation, and CSS-variable mapping.
 *
 * Browser: `window.CrabbieAppearance` (also `globalThis`).
 * Node: side-effect import (`import './appearance-core.js'`) then read
 * `globalThis.CrabbieAppearance`; CommonJS gets `module.exports`.
 *
 * Supported format is strict `#RRGGBB` only. Incomplete values such as
 * `#`, `#f`, or `#ff8a` are editing-buffer only and must never enter
 * ADMIN_DRAFT, CSS variables, palettes, cache, or save payloads.
 */
(function (root) {
  'use strict';

  var HEX_RE = /^#[0-9a-fA-F]{6}$/;

  /* Canonical defaults. Typography tokens match the long-standing admin
     defaults; background/pink/lavender match the public pastel primitives
     in `#reference-pastel-theme` so a resolved field always equals what
     Live Preview and the public site show. */
  var APPEARANCE_DEFAULTS = Object.freeze({
    background: '#fffafc',
    pink: '#f6a3cf',
    lavender: '#ca9cf5',
    displayColor: '#7a3d6e',
    accentColor: '#ff5c9a',
    bodyColor: '#7a3d6e',
    decorativeColor: '#ff5c9a',
    mutedColor: '#a87098',
    fieldLabelColor: '#8a5cff',
  });

  var COLOR_KEYS = Object.freeze([
    'background',
    'pink',
    'lavender',
    'displayColor',
    'accentColor',
    'bodyColor',
    'decorativeColor',
    'mutedColor',
    'fieldLabelColor',
  ]);

  /* Appearance-owned CSS variables. Text tokens live on <body> (where the
     tokens are declared); pink/purple primitives live on <body> too so the
     public `body:not(.admin-mode)` palette is actually owned (a local body
     declaration beats an inherited html value). */
  var TEXT_VAR_MAP = Object.freeze({
    displayColor: '--text-display',
    accentColor: '--text-accent',
    bodyColor: '--text-body',
    decorativeColor: '--text-decorative',
    mutedColor: '--text-muted',
    fieldLabelColor: '--text-field-label',
  });

  var PRIMITIVE_VAR_MAP = Object.freeze({
    pink: '--pink',
    lavender: '--purple',
  });

  function isValidHex(value) {
    return typeof value === 'string' && HEX_RE.test(value);
  }

  function normalizeHex(value) {
    if (typeof value !== 'string') return null;
    var v = value.trim();
    if (!HEX_RE.test(v)) return null;
    return '#' + v.slice(1).toLowerCase();
  }

  function defaultFor(key) {
    return Object.prototype.hasOwnProperty.call(APPEARANCE_DEFAULTS, key)
      ? APPEARANCE_DEFAULTS[key]
      : null;
  }

  /* Resolved value: normalized explicit override, else the canonical
     default. Never persists defaults; callers display the resolved value
     while keeping absent keys absent in storage. */
  function resolveColor(theme, key) {
    var raw = theme && theme[key];
    var n = typeof raw === 'string' ? normalizeHex(raw) : null;
    if (n) return n;
    return defaultFor(key);
  }

  function resolvedTheme(theme) {
    var out = {};
    COLOR_KEYS.forEach(function (k) {
      out[k] = resolveColor(theme, k);
    });
    return out;
  }

  /* Palette colors: only valid normalized values survive. Invalid entries
     are dropped (caller falls back to resolved defaults for display and
     never writes invalid data). */
  function normalizePaletteColors(colors) {
    var out = {};
    if (!colors || typeof colors !== 'object') return out;
    COLOR_KEYS.forEach(function (k) {
      var n = typeof colors[k] === 'string' ? normalizeHex(colors[k]) : null;
      if (n) out[k] = n;
    });
    return out;
  }

  function clonePaletteColors(colors) {
    var out = {};
    if (!colors || typeof colors !== 'object') return out;
    Object.keys(colors).forEach(function (k) {
      var v = colors[k];
      out[k] = v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
    });
    return out;
  }

  /* Old v1 cache compatibility: `{ v:1, theme:{...} }` or a bare theme
     object. Only valid colors are kept; unknown keys pass through
     untouched so background/media settings survive. */
  function normalizeCachedTheme(cached) {
    if (!cached || typeof cached !== 'object') return {};
    var hasThemeKey = Object.prototype.hasOwnProperty.call(cached, 'theme');
    var theme;
    if (hasThemeKey) {
      if (!cached.theme || typeof cached.theme !== 'object') return {};
      theme = cached.theme;
    } else if (Object.prototype.hasOwnProperty.call(cached, 'v')) {
      return {};
    } else {
      theme = cached;
    }
    if (!theme || typeof theme !== 'object') return {};
    var out = {};
    Object.keys(theme).forEach(function (k) {
      var v = theme[k];
      if (COLOR_KEYS.indexOf(k) !== -1) {
        var n = typeof v === 'string' ? normalizeHex(v) : null;
        if (n) out[k] = n;
      } else {
        out[k] = v;
      }
    });
    return out;
  }

  /* Authoritative reconciliation plan for a freshly hydrated theme:
     every Appearance-owned variable is either set (valid explicit value)
     or removed (stale inline override cleared, CSS/default resolution
     takes over). Unknown theme keys are never touched here. */
  function planThemeVars(theme) {
    var set = {};
    var remove = [];
    Object.keys(TEXT_VAR_MAP).forEach(function (k) {
      var raw = theme && theme[k];
      var n = typeof raw === 'string' ? normalizeHex(raw) : null;
      if (n) set[TEXT_VAR_MAP[k]] = n;
      else remove.push(TEXT_VAR_MAP[k]);
    });
    Object.keys(PRIMITIVE_VAR_MAP).forEach(function (k) {
      var raw = theme && theme[k];
      var n = typeof raw === 'string' ? normalizeHex(raw) : null;
      if (n) set[PRIMITIVE_VAR_MAP[k]] = n;
      else remove.push(PRIMITIVE_VAR_MAP[k]);
    });
    return { set: set, remove: remove };
  }

  var api = {
    HEX_RE: HEX_RE,
    APPEARANCE_DEFAULTS: APPEARANCE_DEFAULTS,
    COLOR_KEYS: COLOR_KEYS,
    TEXT_VAR_MAP: TEXT_VAR_MAP,
    PRIMITIVE_VAR_MAP: PRIMITIVE_VAR_MAP,
    isValidHex: isValidHex,
    normalizeHex: normalizeHex,
    defaultFor: defaultFor,
    resolveColor: resolveColor,
    resolvedTheme: resolvedTheme,
    normalizePaletteColors: normalizePaletteColors,
    clonePaletteColors: clonePaletteColors,
    normalizeCachedTheme: normalizeCachedTheme,
    planThemeVars: planThemeVars,
  };

  root.CrabbieAppearance = api;

  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
