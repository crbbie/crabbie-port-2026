/**
 * Public-site decorative background artwork.
 *
 * One fixed, non-interactive layer showing a single local artwork
 * (`assets/decorations/deco-bg (1).png`) persistently from the top to the
 * bottom of the public site. The artwork stays the same while scrolling:
 * no image switching, no crossfade, no fade thresholds. The outer
 * `.crabbie-deco-item` owns the subtle desktop scroll/parallax transform;
 * the inner `.crabbie-deco-float` owns the floating CSS animation, so the
 * two transforms can never overwrite each other. This module owns only
 * browser wiring (styles, DOM layer, scroll parallax, rAF); it never touches
 * layout, CMS data or admin mode.
 *
 * Loading policy: the single image is requested on boot with decode
 * readiness gating — opacity becomes 1 only once decoded, and a failed
 * decode (retried at most twice) keeps the layer mounted without popping.
 *
 * Stacking: the layer uses `z-index:-2` (the same slot as `body::before`, but
 * later in tree order so it paints above the background) which keeps every
 * real page element — nav, content, forms, modals, the candy and pet layers —
 * above the artwork and fully clickable. `pointer-events:none` and
 * `overflow:hidden` guarantee no interaction and no horizontal scrolling.
 */
const DECO_SRC = '/assets/decorations/deco-bg (1).png';
const STYLE_ID = 'crabbieDecoStyles';
const LAYER_ID = 'crabbieDecoLayer';

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
.crabbie-deco-item[data-ready="true"]{opacity:1;}
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

const deco = { layer: null, item: null, img: null, ready: false, loading: false, tries: 0, max: 1, rafId: 0, observer: null };
/* A corrupt asset must not be re-requested on every scroll frame: after
   MAX_DECO_ATTEMPTS failed attempts the layer stays mounted without the
   artwork instead of retrying forever. */
const MAX_DECO_ATTEMPTS = 2;

function markReady(ok) {
  deco.ready = ok;
  deco.loading = false;
  if (deco.item) {
    if (ok) {
      deco.item.dataset.ready = 'true';
      deco.item.style.opacity = '1';
    } else {
      delete deco.item.dataset.ready;
    }
  }
  scheduleUpdate();
}

/* Request the single artwork at most once per attempt; resolve readiness via
   decode (with a load/error fallback). A failure leaves ready false so the
   layer simply stays hidden instead of showing a broken image. */
function ensureLoaded() {
  if (deco.ready || deco.loading || deco.tries >= MAX_DECO_ATTEMPTS) return;
  const img = deco.img;
  if (!img) return;
  if (img.getAttribute('src')) {
    if (img.complete && img.naturalWidth > 0) { markReady(true); return; }
  } else {
    img.src = DECO_SRC;
  }
  deco.tries += 1;
  deco.loading = true;
  const done = (ok) => markReady(ok);
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

function buildLayer() {
  injectStyles();
  if (deco.layer && deco.layer.isConnected) return deco.layer;
  const layer = document.createElement('div');
  layer.id = LAYER_ID;
  layer.setAttribute('aria-hidden', 'true');
  const item = document.createElement('div');
  item.className = 'crabbie-deco-item';
  item.dataset.deco = '1';
  const float = document.createElement('div');
  float.className = 'crabbie-deco-float';
  float.style.setProperty('--deco-dur', '8.5s');
  float.style.setProperty('--deco-delay', '0s');
  float.style.setProperty('--deco-drift', '6px');
  const img = document.createElement('img');
  img.src = DECO_SRC;
  if ('fetchPriority' in img) img.fetchPriority = 'high';
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  float.appendChild(img);
  item.appendChild(float);
  layer.appendChild(item);
  document.body.appendChild(layer);
  deco.layer = layer;
  deco.item = item;
  deco.img = img;
  ensureLoaded();
  return layer;
}

function clamp01(value) {
  return value < 0 ? 0 : (value > 1 ? 1 : value);
}

/* Cache the scrollable range instead of reading scrollHeight on every frame.
   A ResizeObserver + window resize keeps it accurate as views change height. */
function refreshMax() {
  const doc = document.documentElement;
  deco.max = Math.max(1, doc.scrollHeight - window.innerHeight);
}

function applyProgress() {
  if (!deco.layer || !deco.item) return;
  const progress = clamp01(window.scrollY / deco.max);
  const reduced = isReduced();
  /* Parallax rides the outer wrapper; the CSS float animation owns the inner
    wrapper, so the two transforms can never overwrite each other. Opacity
    stays 1 once the single artwork is ready — scrolling never hides it. */
  if (reduced || !hasFinePointer()) {
    deco.item.style.transform = 'none';
  } else {
    const offset = (progress - 0.5) * 26;
    deco.item.style.transform = 'translate3d(0,' + offset.toFixed(1) + 'px,0)';
  }
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
