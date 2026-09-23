/**
 * Public-site decorative background artwork.
 *
 * One fixed, non-interactive layer that crossfades three local `deco-bg` PNGs
 * as the visitor scrolls (top -> ~32% -> ~66% -> bottom) and floats them
 * gently, like lightweight stationery above the site. This module owns only
 * browser wiring (styles, DOM layers, scroll progress, rAF); it never touches
 * layout, CMS data or admin mode.
 *
 * Stacking: the layer uses `z-index:-2` (the same slot as `body::before`, but
 * later in tree order so it paints above the background) which keeps every
 * real page element — nav, content, forms, modals, the candy and pet layers —
 * above the artwork and fully clickable. `pointer-events:none` and
 * `overflow:hidden` guarantee no interaction and no horizontal scrolling.
 */
const DECO_SRC = [
  '/assets/decorations/deco-bg (1).png',
  '/assets/decorations/deco-bg (2).png',
  '/assets/decorations/deco-bg (3).png'
];
const STYLE_ID = 'crabbieDecoStyles';
const LAYER_ID = 'crabbieDecoLayer';

/* Scroll thresholds (fraction of the scrollable range) and the crossfade
   half-width around each one. Windows never overlap, so the three opacities
   always sum to 1 and there is never a blank frame. */
const THRESHOLD_ONE = 0.32;
const THRESHOLD_TWO = 0.66;
const FADE_HALF = 0.09;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isReduced = () => reduceMotion.matches;

function isAdminView() {
  return document.body.classList.contains('admin-mode') ||
    Boolean(document.querySelector('.view.is-active[data-view="admin"]'));
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${LAYER_ID}{position:fixed;inset:0;z-index:-2;overflow:hidden;pointer-events:none;}
body.admin-mode #${LAYER_ID}{display:none !important;}
.crabbie-deco-item{position:absolute;inset:-10%;opacity:0;will-change:opacity,transform;}
.crabbie-deco-float{position:absolute;inset:0;will-change:transform;
  animation:crabbieDecoFloat var(--deco-dur,8.5s) var(--deco-delay,0s) ease-in-out infinite alternate;}
.crabbie-deco-item img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;
  pointer-events:none;user-select:none;-webkit-user-drag:none;}
@keyframes crabbieDecoFloat{
  0%{transform:translate3d(0,0,0) rotate(0deg);}
  50%{transform:translate3d(var(--deco-drift,6px),-8px,0) rotate(-0.5deg);}
  100%{transform:translate3d(0,0,0) rotate(0deg);}
}
@media (max-width:720px){
  /* Same concept, smaller stage: a slightly deeper bleed keeps the composition
     reaching across the phone viewport while staying cropped and overflow-free. */
  .crabbie-deco-item{inset:-16%;}
  .crabbie-deco-item img{object-position:center 42%;}
}
@media (prefers-reduced-motion: reduce){
  .crabbie-deco-float{animation:none !important;}
}
`;
  document.head.appendChild(style);
}

const deco = { layer: null, items: [], max: 1, rafId: 0, observer: null };

function buildLayer() {
  injectStyles();
  if (deco.layer && deco.layer.isConnected) return deco.layer;
  const layer = document.createElement('div');
  layer.id = LAYER_ID;
  layer.setAttribute('aria-hidden', 'true');
  const durations = ['7.6s', '8.8s', '9.6s'];
  const delays = ['0s', '.6s', '1.2s'];
  const drifts = ['6px', '-5px', '7px'];
  const depths = [26, -22, 30];
  DECO_SRC.forEach((src, i) => {
    const item = document.createElement('div');
    item.className = 'crabbie-deco-item';
    item.dataset.deco = String(i + 1);
    const float = document.createElement('div');
    float.className = 'crabbie-deco-float';
    float.style.setProperty('--deco-dur', durations[i]);
    float.style.setProperty('--deco-delay', delays[i]);
    float.style.setProperty('--deco-drift', drifts[i]);
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    float.appendChild(img);
    item.appendChild(float);
    layer.appendChild(item);
    deco.items.push({ el: item, depth: depths[i] });
  });
  document.body.appendChild(layer);
  deco.layer = layer;
  preload();
  return layer;
}

function preload() {
  DECO_SRC.forEach((src) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  });
}

function clamp01(value) {
  return value < 0 ? 0 : (value > 1 ? 1 : value);
}

function smoothstep(x) {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

/* Cache the scrollable range instead of reading scrollHeight on every frame.
   A ResizeObserver + window resize keeps it accurate as views change height. */
function refreshMax() {
  const doc = document.documentElement;
  deco.max = Math.max(1, doc.scrollHeight - window.innerHeight);
}

function applyProgress() {
  if (!deco.layer) return;
  const progress = clamp01(window.scrollY / deco.max);
  const fadeOne = smoothstep((progress - (THRESHOLD_ONE - FADE_HALF)) / (FADE_HALF * 2));
  const fadeTwo = smoothstep((progress - (THRESHOLD_TWO - FADE_HALF)) / (FADE_HALF * 2));
  const opacities = [1 - fadeOne, fadeOne * (1 - fadeTwo), fadeTwo];
  const reduced = isReduced();
  deco.items.forEach((item, i) => {
    item.el.style.opacity = opacities[i].toFixed(3);
    /* Parallax rides the outer wrapper; the CSS float animation owns the inner
       wrapper, so the two transforms can never overwrite each other. */
    if (reduced) {
      item.el.style.transform = 'none';
    } else {
      const offset = (progress - 0.5) * item.depth;
      item.el.style.transform = 'translate3d(0,' + offset.toFixed(1) + 'px,0)';
    }
  });
}

function scheduleUpdate() {
  if (deco.rafId) return;
  deco.rafId = requestAnimationFrame(() => {
    deco.rafId = 0;
    applyProgress();
  });
}

/* The layer is always built; admin mode simply hides it (CSS + this sync),
   so leaving admin reveals the artwork again without a rebuild. */
function syncVisibility() {
  if (!deco.layer) return;
  deco.layer.style.display = isAdminView() ? 'none' : '';
}

function start() {
  if (!document.body) return;
  buildLayer();
  syncVisibility();
  refreshMax();
  applyProgress();
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', () => { refreshMax(); scheduleUpdate(); });
  window.addEventListener('hashchange', () => { syncVisibility(); refreshMax(); scheduleUpdate(); });
  if (typeof ResizeObserver === 'function') {
    deco.observer = new ResizeObserver(refreshMax);
    deco.observer.observe(document.body);
  }
  if (typeof MutationObserver === 'function') {
    new MutationObserver(syncVisibility).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
}

start();
