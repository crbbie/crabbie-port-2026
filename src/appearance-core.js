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
 *
 * Batch 2A adds the Advanced text-color engine: one registry of 24
 * section/component roles stored as optional `theme.textOverrides`.
 * Absent key = inherit (explicit component override → inherited global
 * semantic color or documented state default → current public default).
 * Resolved inherited colors are never materialized into storage.
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

  /* Cache compatibility: v1 `{ v:1, theme:{...} }`, v2 `{ v:2, theme }`
     (v2 may carry `textOverrides`), or a bare theme object. Only valid
     colors are kept and override leaves are validated (invalid cached
     overrides never paint); unknown keys pass through untouched so
     background/media settings survive. */
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
      } else if (k === 'textOverrides') {
        var adv = normalizeTextOverrides(v);
        if (Object.keys(adv).length) out[k] = adv;
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

  /* ------------------------------------------------------------------
   * Advanced text colors (Batch 2A): one registry for all 24 roles.
   * This is the single source of truth for group/key ↔ CSS variable ↔
   * fallback ↔ storage path. Public CSS uses these variable names with
   * `var(--component, var(--global))` fallbacks; JS reconciliation below
   * sets/removes exactly these variables. No second mapping lives in HTML.
   *
   * Fallback kinds:
   * - { kind:'core', key } → inherited global semantic color (follows live
   *   global changes through the CSS fallback chain).
   * - { kind:'fixed', value, label } → documented state default (e.g. the
   *   current candy hover default, selected-state white).
   * ------------------------------------------------------------------ */
  var TEXT_OVERRIDE_GROUPS = Object.freeze([
    { id: 'navigation', label: 'Navigation' },
    { id: 'cards', label: 'Cards' },
    { id: 'detail', label: 'Detail content' },
    { id: 'commission', label: 'Commission' },
    { id: 'forms', label: 'Forms' },
    { id: 'buttons', label: 'Buttons' },
    { id: 'footer', label: 'Footer' },
  ]);

  function coreFallback(key) {
    return Object.freeze({ kind: 'core', key: key });
  }

  function fixedFallback(value, label) {
    return Object.freeze({ kind: 'fixed', value: value, label: label });
  }

  var TEXT_OVERRIDE_ROLES = Object.freeze([
    { group: 'navigation', key: 'normal', label: 'Normal text', cssVar: '--text-nav-normal', fallback: coreFallback('mutedColor'), path: 'textOverrides.navigation.normal' },
    { group: 'navigation', key: 'hover', label: 'Hover text', cssVar: '--text-nav-hover', fallback: fixedFallback('#f077b9', 'current candy hover default'), path: 'textOverrides.navigation.hover' },
    { group: 'navigation', key: 'active', label: 'Active text', cssVar: '--text-nav-active', fallback: fixedFallback('#ffffff', 'selected-state white'), path: 'textOverrides.navigation.active' },
    { group: 'cards', key: 'title', label: 'Card title', cssVar: '--text-card-title', fallback: coreFallback('displayColor'), path: 'textOverrides.cards.title' },
    { group: 'cards', key: 'metadata', label: 'Card metadata', cssVar: '--text-card-meta', fallback: coreFallback('mutedColor'), path: 'textOverrides.cards.metadata' },
    { group: 'cards', key: 'taxonomy', label: 'Category / tag / status', cssVar: '--text-card-taxonomy', fallback: coreFallback('mutedColor'), path: 'textOverrides.cards.taxonomy' },
    { group: 'detail', key: 'heading', label: 'Title / section heading', cssVar: '--text-detail-heading', fallback: coreFallback('displayColor'), path: 'textOverrides.detail.heading' },
    { group: 'detail', key: 'body', label: 'Body', cssVar: '--text-detail-body', fallback: coreFallback('bodyColor'), path: 'textOverrides.detail.body' },
    { group: 'detail', key: 'factsLabel', label: 'Facts label', cssVar: '--text-detail-fact-label', fallback: coreFallback('mutedColor'), path: 'textOverrides.detail.factsLabel' },
    { group: 'detail', key: 'factsValue', label: 'Facts value', cssVar: '--text-detail-fact-value', fallback: coreFallback('bodyColor'), path: 'textOverrides.detail.factsValue' },
    { group: 'detail', key: 'credits', label: 'Credits', cssVar: '--text-detail-credit', fallback: coreFallback('accentColor'), path: 'textOverrides.detail.credits' },
    { group: 'commission', key: 'title', label: 'Title', cssVar: '--text-commission-title', fallback: coreFallback('displayColor'), path: 'textOverrides.commission.title' },
    { group: 'commission', key: 'price', label: 'Price', cssVar: '--text-commission-price', fallback: coreFallback('accentColor'), path: 'textOverrides.commission.price' },
    { group: 'commission', key: 'secondary', label: 'Description / secondary', cssVar: '--text-commission-secondary', fallback: coreFallback('mutedColor'), path: 'textOverrides.commission.secondary' },
    { group: 'forms', key: 'input', label: 'Input text', cssVar: '--text-form-input', fallback: coreFallback('bodyColor'), path: 'textOverrides.forms.input' },
    { group: 'forms', key: 'placeholder', label: 'Placeholder', cssVar: '--text-form-placeholder', fallback: coreFallback('mutedColor'), path: 'textOverrides.forms.placeholder' },
    { group: 'forms', key: 'helper', label: 'Helper text', cssVar: '--text-form-helper', fallback: coreFallback('mutedColor'), path: 'textOverrides.forms.helper' },
    { group: 'forms', key: 'required', label: 'Required marker', cssVar: '--text-form-required', fallback: coreFallback('accentColor'), path: 'textOverrides.forms.required' },
    { group: 'forms', key: 'label', label: 'Question / field label', cssVar: '--text-form-label', fallback: coreFallback('fieldLabelColor'), path: 'textOverrides.forms.label' },
    { group: 'buttons', key: 'solid', label: 'Solid button label', cssVar: '--text-button-solid', fallback: fixedFallback('#ffffff', 'selected-state white'), path: 'textOverrides.buttons.solid' },
    { group: 'buttons', key: 'ghost', label: 'Ghost button label', cssVar: '--text-button-ghost', fallback: coreFallback('bodyColor'), path: 'textOverrides.buttons.ghost' },
    { group: 'footer', key: 'heading', label: 'Brand / heading', cssVar: '--text-footer-heading', fallback: coreFallback('displayColor'), path: 'textOverrides.footer.heading' },
    { group: 'footer', key: 'body', label: 'Body', cssVar: '--text-footer-body', fallback: coreFallback('mutedColor'), path: 'textOverrides.footer.body' },
    { group: 'footer', key: 'link', label: 'Links', cssVar: '--text-footer-link', fallback: coreFallback('mutedColor'), path: 'textOverrides.footer.link' },
  ]);

  /* Human labels for the Admin "Inherited from …" indicator. */
  var CORE_SOURCE_LABELS = Object.freeze({
    displayColor: 'Display',
    accentColor: 'Accent',
    bodyColor: 'Body',
    decorativeColor: 'Decorative',
    mutedColor: 'Muted',
    fieldLabelColor: 'Question label',
    background: 'Background',
    pink: 'Pink',
    lavender: 'Lavender',
  });

  function getTextOverrideRole(group, key) {
    for (var i = 0; i < TEXT_OVERRIDE_ROLES.length; i++) {
      if (TEXT_OVERRIDE_ROLES[i].group === group && TEXT_OVERRIDE_ROLES[i].key === key) {
        return TEXT_OVERRIDE_ROLES[i];
      }
    }
    return null;
  }

  function getRoleByVar(cssVar) {
    for (var i = 0; i < TEXT_OVERRIDE_ROLES.length; i++) {
      if (TEXT_OVERRIDE_ROLES[i].cssVar === cssVar) return TEXT_OVERRIDE_ROLES[i];
    }
    return null;
  }

  function listTextOverrideRoles() {
    return TEXT_OVERRIDE_ROLES.slice();
  }

  function normalizeTextOverrideValue(value) {
    return normalizeHex(value);
  }

  function getStoredTextOverride(theme, group, key) {
    if (!theme || typeof theme !== 'object') return undefined;
    var o = theme.textOverrides;
    if (!o || typeof o !== 'object') return undefined;
    var g = o[group];
    if (!g || typeof g !== 'object') return undefined;
    return g[key];
  }

  /* Resolve one Advanced role against the current theme:
   * explicit valid override → { value, explicit:true, source:'custom' };
   * otherwise the inherited global color or documented state default.
   * Inherited values always track the live theme (nothing materialized). */
  function resolveTextRole(theme, group, key) {
    var role = getTextOverrideRole(group, key);
    if (!role) return { value: null, explicit: false, source: null };
    var raw = getStoredTextOverride(theme, group, key);
    var n = typeof raw === 'string' ? normalizeHex(raw) : null;
    if (n) return { value: n, explicit: true, source: 'custom' };
    var fb = role.fallback;
    if (fb.kind === 'core') {
      return { value: resolveColor(theme, fb.key), explicit: false, source: fb.key };
    }
    return { value: fb.value, explicit: false, source: 'state-default' };
  }

  function inheritanceLabel(info) {
    if (!info) return '';
    if (info.explicit || info.source === 'custom') return 'Custom';
    if (info.source === 'state-default') {
      for (var i = 0; i < TEXT_OVERRIDE_ROLES.length; i++) {
        var fb = TEXT_OVERRIDE_ROLES[i].fallback;
        if (fb.kind === 'fixed' && fb.value === info.value) return fb.label;
      }
      return 'Default state';
    }
    return CORE_SOURCE_LABELS[info.source] || String(info.source || '');
  }

  /* Normalize a textOverrides object: keep only known roles with valid
   * #rrggbb values (normalized), prune empty groups. Returns a fresh
   * object ({} when nothing valid remains). Unknown groups/keys are
   * dropped — the registry is the only writer contract; unknown theme
   * keys elsewhere still pass through untouched. */
  function normalizeTextOverrides(obj) {
    var out = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    TEXT_OVERRIDE_ROLES.forEach(function (role) {
      var g = obj[role.group];
      if (!g || typeof g !== 'object' || Array.isArray(g)) return;
      var n = typeof g[role.key] === 'string' ? normalizeHex(g[role.key]) : null;
      if (n) {
        if (!out[role.group]) out[role.group] = {};
        out[role.group][role.key] = n;
      }
    });
    return out;
  }

  /* Set or clear one override on a theme object (mutates and returns it):
   * a valid hex stores the normalized value; null/undefined/'' deletes the
   * leaf, prunes an emptied group, and prunes textOverrides when empty.
   * Null/empty strings are never canonical saved values. */
  function setTextOverride(theme, group, key, hexOrNull) {
    if (!theme || typeof theme !== 'object') return theme;
    var role = getTextOverrideRole(group, key);
    if (!role) return theme;
    var n = typeof hexOrNull === 'string' ? normalizeHex(hexOrNull) : null;
    if (n) {
      if (!theme.textOverrides || typeof theme.textOverrides !== 'object' || Array.isArray(theme.textOverrides)) {
        theme.textOverrides = {};
      }
      if (!theme.textOverrides[group] || typeof theme.textOverrides[group] !== 'object' || Array.isArray(theme.textOverrides[group])) {
        theme.textOverrides[group] = {};
      }
      theme.textOverrides[group][key] = n;
      return theme;
    }
    if (theme.textOverrides && theme.textOverrides[group] && typeof theme.textOverrides[group] === 'object') {
      delete theme.textOverrides[group][key];
      if (Object.keys(theme.textOverrides[group]).length === 0) {
        delete theme.textOverrides[group];
      }
      if (Object.keys(theme.textOverrides).length === 0) {
        delete theme.textOverrides;
      }
    }
    return theme;
  }

  function cloneTextOverrides(obj) {
    if (!obj || typeof obj !== 'object') return {};
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      return {};
    }
  }

  function countExplicitOverrides(theme) {
    if (!theme || typeof theme !== 'object') return 0;
    var clean = normalizeTextOverrides(theme.textOverrides);
    var count = 0;
    Object.keys(clean).forEach(function (g) {
      count += Object.keys(clean[g]).length;
    });
    return count;
  }

  /* Authoritative Advanced reconciliation: every one of the 24 component
   * variables is set (valid explicit override) or removed (stale inline
   * cleared → CSS `var(--component, var(--global))` inheritance resumes).
   * Only explicit overrides ever need inline body variables. */
  function planAdvancedVars(theme) {
    var set = {};
    var remove = [];
    TEXT_OVERRIDE_ROLES.forEach(function (role) {
      var raw = getStoredTextOverride(theme, role.group, role.key);
      var n = typeof raw === 'string' ? normalizeHex(raw) : null;
      if (n) set[role.cssVar] = n;
      else remove.push(role.cssVar);
    });
    return { set: set, remove: remove };
  }

  /* Palette snapshot: core valid colors plus ONLY explicit Advanced
   * overrides (never resolved inherited values). Old palettes without
   * textOverrides stay valid. */
  function snapshotPaletteColors(theme) {
    var colors = normalizePaletteColors(theme);
    var adv = normalizeTextOverrides(theme && theme.textOverrides);
    if (Object.keys(adv).length) colors.textOverrides = adv;
    return colors;
  }

  /* Palette apply: the palette is the whole supported color configuration.
   * Core colors apply when valid; explicit Advanced overrides are REPLACED
   * (an old palette with no textOverrides clears current overrides back to
   * inheritance — never leaves stale values). Mutates and returns the theme. */
  function applyPaletteColors(theme, colors) {
    if (!theme || typeof theme !== 'object') return theme;
    if (!colors || typeof colors !== 'object') return theme;
    COLOR_KEYS.forEach(function (k) {
      var n = typeof colors[k] === 'string' ? normalizeHex(colors[k]) : null;
      if (n) theme[k] = n;
    });
    if (colors.textOverrides && typeof colors.textOverrides === 'object') {
      var adv = normalizeTextOverrides(colors.textOverrides);
      if (Object.keys(adv).length) theme.textOverrides = adv;
      else delete theme.textOverrides;
    } else {
      delete theme.textOverrides;
    }
    return theme;
  }

  var api = {
    HEX_RE: HEX_RE,
    APPEARANCE_DEFAULTS: APPEARANCE_DEFAULTS,
    COLOR_KEYS: COLOR_KEYS,
    TEXT_VAR_MAP: TEXT_VAR_MAP,
    PRIMITIVE_VAR_MAP: PRIMITIVE_VAR_MAP,
    TEXT_OVERRIDE_GROUPS: TEXT_OVERRIDE_GROUPS,
    TEXT_OVERRIDE_ROLES: TEXT_OVERRIDE_ROLES,
    CORE_SOURCE_LABELS: CORE_SOURCE_LABELS,
    isValidHex: isValidHex,
    normalizeHex: normalizeHex,
    defaultFor: defaultFor,
    resolveColor: resolveColor,
    resolvedTheme: resolvedTheme,
    normalizePaletteColors: normalizePaletteColors,
    clonePaletteColors: clonePaletteColors,
    normalizeCachedTheme: normalizeCachedTheme,
    planThemeVars: planThemeVars,
    getTextOverrideRole: getTextOverrideRole,
    getRoleByVar: getRoleByVar,
    listTextOverrideRoles: listTextOverrideRoles,
    normalizeTextOverrideValue: normalizeTextOverrideValue,
    getStoredTextOverride: getStoredTextOverride,
    resolveTextRole: resolveTextRole,
    inheritanceLabel: inheritanceLabel,
    normalizeTextOverrides: normalizeTextOverrides,
    setTextOverride: setTextOverride,
    cloneTextOverrides: cloneTextOverrides,
    countExplicitOverrides: countExplicitOverrides,
    planAdvancedVars: planAdvancedVars,
    snapshotPaletteColors: snapshotPaletteColors,
    applyPaletteColors: applyPaletteColors,
  };

  root.CrabbieAppearance = api;

  if (typeof module !== 'undefined' && module && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
