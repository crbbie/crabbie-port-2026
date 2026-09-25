/**
 * Public-site decorative background artwork.
 *
 * One fixed, non-interactive layer that crossfades three local `deco-bg` PNGs
 * as the visitor scrolls (top -> ~32% -> ~66% -> bottom) and floats them
 * gently, like lightweight stationery above the site. This module owns only
 * browser wiring (styles, DOM layers, scroll progress, rAF); it never touches
 * layout, CMS data or admin mode.
 *
 * Loading policy (progressive, no eager fan-out): only state 1 is requested
 * on cold boot. States 2/3 are requested once scroll progress comes within
 * PREFETCH_MARGIN of the range where they start fading in, so a cold initial
 * route never downloads unneeded states (mobile included). The duplicate
 * eager `preload()` of all three URLs was removed. Opacity is gated on
 * decode readiness, so a crossfade never targets a layer that is not ready:
 * missing shares collapse onto the ready layers (never a blank frame), and a
 * failed decode keeps the last valid layer instead of popping (a corrupt
 * asset is retried at most twice, never re-requested on every scroll frame).
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
/* States 2/3 start fading in at THRESHOLD - FADE_HALF (0.23 / 0.57).
   Request each one PREFETCH_MARGIN of progress earlier (i.e. from 0.08 /
   0.42) so it is decoded before its first blended frame under normal
   scroll speeds, while a cold boot at the top requests nothing extra. */
const PREFETCH_MARGIN = 0.15;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isReduced = () => reduceMotion.matches;
/* Phones/tablets (coarse pointers) keep the artwork visible and viewport-fixed,
   but the scroll parallax and float drift are desktop-only: on a phone the
   moving background reads as the whole page shifting while scrolling. */
const finePointer = window.matchMedia('(pointer: fine)');
const hasFinePointer = () => finePointer.matches;

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
/* Coarse pointers (phones/tablets): artwork stays visible and fixed, but the
   continuous float (incl. its horizontal drift) stops so the background never
   feels like it is sliding sideways under the content. Desktop keeps floating. */
@media (pointer:coarse){
  .crabbie-deco-float{animation:none !important;}
}
@media (prefers-reduced-motion: reduce){
  .crabbie-deco-float{animation:none !important;}
}
`;
  document.head.appendChild(style);
}

const deco = { layer: null, items: [], imgs: [], ready: [false, false, false], loading: [false, false, false], tries: [0, 0, 0], lastOp: null, max: 1, rafId: 0, observer: null };
/* A corrupt asset must not be re-requested on every scroll frame: after
   MAX_DECO_ATTEMPTS failed attempts the state stays unready and the opacity
   gate keeps the last valid layer indefinitely. */
const MAX_DECO_ATTEMPTS = 2;

function markReady(i, ok) {
  deco.ready[i] = ok;
  deco.loading[i] = false;
  const entry = deco.items[i];
  if (entry) {
    if (ok) entry.el.dataset.ready = 'true';
    else delete entry.el.dataset.ready;
  }
  scheduleUpdate();
}

/* Request state `i` at most once per attempt; resolve readiness via decode
   (with a load/error fallback). A failure leaves ready[i] false so the
   opacity gate keeps the last valid layer instead of crossfading into a
   broken image. */
function ensureLoaded(i) {
  if (deco.ready[i] || deco.loading[i] || deco.tries[i] >= MAX_DECO_ATTEMPTS) return;
  const img = deco.imgs[i];
  if (!img) return;
  if (img.getAttribute('src')) {
    if (img.complete && img.naturalWidth > 0) { markReady(i, true); return; }
  } else {
    img.src = DECO_SRC[i];
  }
  deco.tries[i] += 1;
  deco.loading[i] = true;
  const done = (ok) => markReady(i, ok);
  if (typeof img.decode === 'function') {
    img.decode().then(() => done(img.naturalWidth > 0), () => {
      /* decode() can reject while the resource still loads (or for a
         corrupt payload); fall through to the element events below. */
      if (img.complete) done(img.naturalWidth > 0);
    });
  }
  img.addEventListener('load', () => done(img.naturalWidth > 0), { once: true });
  img.addEventListener('error', () => done(false), { once: true });
}

/* Prefetch states 2/3 ahead of the scroll range where they are needed.
   A deep jump (fast scroll, restored position, short page) requests both at
   once from the same frame — no blank crossfade while they decode. */
function maybeLoadFor(progress) {
  ensureLoaded(0);
  if (progress > THRESHOLD_ONE - FADE_HALF - PREFETCH_MARGIN) ensureLoaded(1);
  if (progress > THRESHOLD_TWO - FADE_HALF - PREFETCH_MARGIN) ensureLoaded(2);
}

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
    /* Progressive policy: only state 1 gets a src on boot. States 2/3 are
       assigned their src by ensureLoaded() shortly before first use. */
    if (i === 0) {
      img.src = src;
      if ('fetchPriority' in img) img.fetchPriority = 'high';
    }
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    float.appendChild(img);
    item.appendChild(float);
    layer.appendChild(item);
    deco.items.push({ el: item, depth: depths[i] });
    deco.imgs.push(img);
  });
  document.body.appendChild(layer);
  deco.layer = layer;
  ensureLoaded(0);
  return layer;
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
  maybeLoadFor(progress);
  const fadeOne = smoothstep((progress - (THRESHOLD_ONE - FADE_HALF)) / (FADE_HALF * 2));
  const fadeTwo = smoothstep((progress - (THRESHOLD_TWO - FADE_HALF)) / (FADE_HALF * 2));
  let opacities = [1 - fadeOne, fadeOne * (1 - fadeTwo), fadeTwo];
  /* Never crossfade into a layer that has not decoded yet: collapse the
     missing share onto the ready layers (renormalised, still summing to 1)
     so fast/deep scroll holds a valid layer instead of blanking. A failed
     decode keeps its share at zero permanently. */
  const gated = opacities.map((value, i) => (deco.ready[i] ? value : 0));
  const total = gated[0] + gated[1] + gated[2];
  if (total > 0) {
    opacities = gated.map((value) => value / total);
    deco.lastOp = opacities;
  } else if (deco.lastOp) {
    /* A later state failed after earlier frames already showed a valid
       blend (e.g. corrupt state 3 at the bottom): hold that blend instead
       of snapping elsewhere, so there is never a blank or popping frame. */
    opacities = deco.lastOp;
  } else {
    /* Cold error path (state 1 itself failed): keep the layer mounted with
       the nominal blend so layout/style stay intact, showing nothing rather
       than a half-applied state. */
    opacities = [1, 0, 0];
  }
    const reduced = isReduced();
    deco.items.forEach((item, i) => {
      item.el.style.opacity = opacities[i].toFixed(3);
      /* Parallax rides the outer wrapper; the CSS float animation owns the inner
        wrapper, so the two transforms can never overwrite each other. */
      if (reduced || !hasFinePointer()) {
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
