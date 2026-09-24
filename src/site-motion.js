/**
 * Public-site motion runtime: music, falling candy and the desktop pet.
 *
 * Pure pet/dialogue rules live in desktop-pet-core.js. This module owns only
 * browser wiring (audio element, DOM layers, pointer/rAF movement) and is
 * exposed as window.CrabbieSiteMotion so the SPA can apply CMS settings.
 */
import { petCountFor, pickDialogueIndex, clampPosition, nextWanderX, randomInt, petGroundY, spawnPetX, initialWanderDir, initialPetCount, planPetSpawn, nextTurnDelayMs } from './desktop-pet-core.js';

const CANDY_SRC = ['/assets/decorations/candy/candy1.svg', '/assets/decorations/candy/candy2.svg'];
const PET_SRC = '/assets/decorations/pet/Desktop-Pet.gif';
const APPEARANCE_STYLE_ID = 'crabbieSiteMotionStyles';
const MUSIC_MUTE_KEY = 'crabbie:music:muted';
const MUSIC_VOLUME_KEY = 'crabbie:music:volume';
const DIALOGUE_FALLBACK = [
  { text: 'Hi hi! Welcome to Crabbie\'s little world ♡' },
  { text: 'Psst… the free shelf has cute goodies!', url: '#free-assets', label: 'Xem thêm' },
  { text: 'I like candy, petals and sparkly hearts.' },
  { text: 'Wanna commission something sweet?', url: '#commissions', label: 'Xem thêm' },
  { text: 'Drag me anywhere you like!' },
  { text: 'Click me again for another line~' }
];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isReduced = () => reduceMotion.matches;

function isAdminView() {
  return document.body.classList.contains('admin-mode') ||
    Boolean(document.querySelector('.view.is-active[data-view="admin"]'));
}

function injectStyles() {
  if (document.getElementById(APPEARANCE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = APPEARANCE_STYLE_ID;
  style.textContent = `
#crabbieCandyLayer{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;}
.crabbie-candy{position:absolute;top:-12vh;will-change:transform,opacity;animation:crabbieCandyFall linear forwards;}
.crabbie-candy img{display:block;width:100%;height:auto;opacity:.9;}
@keyframes crabbieCandyFall{
  0%{transform:translate3d(0,0,0) rotate(0deg);opacity:0;}
  8%{opacity:.95;}
  100%{transform:translate3d(var(--drift,0px),125vh,0) rotate(var(--spin,220deg));opacity:.85;}
}
#crabbiePetLayer{position:fixed;inset:0;z-index:30;pointer-events:none;overflow:hidden;}
.crabbie-pet{position:absolute;left:0;top:0;width:68px;height:68px;pointer-events:auto;cursor:grab;touch-action:none;
  will-change:transform;filter:drop-shadow(0 8px 10px rgba(122,61,110,.22));}
.crabbie-pet-body{display:block;width:100%;height:100%;}
.crabbie-pet-body img{width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none;-webkit-user-drag:none;}
.crabbie-pet.is-dragging{cursor:grabbing;}
.crabbie-pet.is-dropping .crabbie-pet-body{animation:crabbiePetDrop .95s cubic-bezier(.22,.9,.32,1.14) both;}
@keyframes crabbiePetDrop{
  0%{transform:translateY(calc(-1 * var(--fall,150px))) scale(.92);opacity:0;}
  14%{opacity:1;}
  68%{transform:translateY(0) scale(1.05,.95);}
  84%{transform:translateY(-7px) scale(1,1);}
  100%{transform:translateY(0) scale(1);}
}
/* Pet-specific jelly class: the global .is-jelly animation uses !important on
   transform, which would override the pet's positional transform and snap it to
   the corner. The jelly runs on the inner body so position is never touched. */
.crabbie-pet.is-pet-jelly .crabbie-pet-body{animation:crabbiePetJelly .5s ease;}
@keyframes crabbiePetJelly{0%{transform:scale(1,1);}30%{transform:scale(1.14,.86);}55%{transform:scale(.9,1.12);}75%{transform:scale(1.05,.96);}100%{transform:scale(1,1);}}
.crabbie-pet-bubble{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%) scale(.9);
  min-width:140px;max-width:220px;padding:8px 12px;border-radius:14px;background:#fff;color:var(--text-body,#7a3d6e);
  border:2px solid var(--pink,#ffa0c8);box-shadow:0 6px 0 -2px var(--pink-light,#ffd9e8),0 12px 20px -12px rgba(217,74,128,.5);
  font-family:var(--font-body,'DFVN Hogfish'),system-ui,sans-serif;font-size:12.5px;line-height:1.4;text-align:center;
  opacity:0;pointer-events:none;transition:opacity .22s ease,transform .22s ease;}
.crabbie-pet-bubble.show{opacity:1;transform:translateX(-50%) scale(1);pointer-events:auto;}
.crabbie-pet-bubble a{display:inline-block;margin-top:5px;font-weight:700;color:var(--text-accent,#ff5c9a);text-decoration:underline;}
.crabbie-pet-bubble::after{content:"";position:absolute;top:100%;left:50%;transform:translateX(-50%);
  border:7px solid transparent;border-top-color:#fff;}
#crabbieMusicControl{position:fixed;right:18px;bottom:18px;z-index:55;display:none;gap:6px;align-items:center;
  padding:6px;border-radius:999px;background:rgba(255,255,255,.94);border:2px solid var(--pink-light,#ffd9e8);
  box-shadow:0 8px 18px -10px rgba(217,74,128,.55);font-family:var(--font-body,system-ui),sans-serif;}
#crabbieMusicControl.show{display:inline-flex;}
/* The control sits below the nav/menu stack (z-index 55 vs 59/60), and while
   an editable field is focused on touch devices it hides entirely (display
   only — audio, source and mute state are untouched). Ordered after .show
   so it wins at equal specificity. */
#crabbieMusicControl.is-field-focused{display:none;}
#crabbieMusicControl button{width:34px;height:34px;border-radius:50%;border:2px solid var(--pink-light,#ffd9e8);
  background:#fff;color:var(--pink-hot,#ff5c9a);cursor:pointer;display:grid;place-items:center;padding:0;line-height:0;}
#crabbieMusicControl button:hover{border-color:var(--pink-hot,#ff5c9a);}
#crabbieMusicControl button:focus-visible{outline:3px solid var(--purple-hot,#8a5cff);outline-offset:2px;}
#crabbieMusicControl svg{width:16px;height:16px;fill:currentColor;}
@media (pointer:coarse){
  #crabbieMusicControl button{width:44px;height:44px;}
  #crabbieMusicControl svg{width:20px;height:20px;}
}
@media (max-width:720px){
  .crabbie-pet{width:56px;height:56px;}
  #crabbieMusicControl{right:10px;bottom:12px;}
}
`;
  document.head.appendChild(style);
}

/* ------------------------------- MUSIC ---------------------------------- */
const music = { audio: null, control: null, playBtn: null, muteBtn: null, currentSrc: '', armed: false, settings: null };

function readStored(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function writeStored(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } }

function musicIcons() {
  return {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
    muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 5V4L8 9H4zm15.5 3-2-2 1.4-1.4 2 2 2-2L23 8.6l-2 2 2 2-1.4 1.4-2-2-2 2z"/></svg>'
  };
}

function ensureMusicControl() {
  if (music.control && music.control.isConnected) return;
  const icons = musicIcons();
  const wrap = document.createElement('div');
  wrap.id = 'crabbieMusicControl';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Music controls');
  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.setAttribute('aria-label', 'Play music');
  playBtn.innerHTML = icons.play;
  const muteBtn = document.createElement('button');
  muteBtn.type = 'button';
  muteBtn.setAttribute('aria-label', 'Mute music');
  muteBtn.innerHTML = icons.sound;
  wrap.appendChild(playBtn);
  wrap.appendChild(muteBtn);
  document.body.appendChild(wrap);
  music.control = wrap;
  music.playBtn = playBtn;
  music.muteBtn = muteBtn;
  playBtn.addEventListener('click', () => { if (music.audio.paused) attemptPlay(true); else { music.audio.pause(); syncMusicButtons(); } });
  muteBtn.addEventListener('click', () => {
    const nextMuted = !music.audio.muted;
    music.audio.muted = nextMuted;
    writeStored(MUSIC_MUTE_KEY, nextMuted ? '1' : '0');
    if (!nextMuted && music.audio.paused) attemptPlay(true);
    syncMusicButtons();
  });
}

function syncMusicButtons() {
  if (!music.audio || !music.playBtn) return;
  const icons = musicIcons();
  const playing = !music.audio.paused;
  music.playBtn.innerHTML = playing ? icons.pause : icons.play;
  music.playBtn.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
  music.muteBtn.innerHTML = music.audio.muted ? icons.muted : icons.sound;
  music.muteBtn.setAttribute('aria-label', music.audio.muted ? 'Unmute music' : 'Mute music');
}

function attemptPlay(fromGesture) {
  if (!music.audio) return;
  const promise = music.audio.play();
  if (promise && typeof promise.catch === 'function') {
    promise.catch(() => {
      if (fromGesture) return;
      /* Browser blocked autoplay: start on the first user interaction. */
      if (music.armed) return;
      music.armed = true;
      const resume = () => {
        window.removeEventListener('pointerdown', resume, true);
        window.removeEventListener('keydown', resume, true);
        if (music.audio && music.audio.paused && !music.audio.muted) attemptPlay(true);
        syncMusicButtons();
      };
      window.addEventListener('pointerdown', resume, true);
      window.addEventListener('keydown', resume, true);
    });
  }
  syncMusicButtons();
}

function applyMusic(settings) {
  injectStyles();
  music.settings = settings || {};
  const enabled = Boolean(settings && settings.enabled && settings.url);
  if (!enabled) {
    if (music.audio) { music.audio.pause(); }
    if (music.control) { music.control.classList.remove('show'); music.control.setAttribute('data-state', 'off'); }
    return;
  }
  ensureMusicControl();
  if (!music.audio) {
    music.audio = document.createElement('audio');
    music.audio.preload = 'auto';
    music.audio.setAttribute('playsinline', '');
    music.audio.addEventListener('play', syncMusicButtons);
    music.audio.addEventListener('pause', syncMusicButtons);
    music.audio.addEventListener('error', () => { console.warn('Music: the audio source could not be loaded.'); });
    document.body.appendChild(music.audio);
  }
  /* A session uses one stable audio instance: never reload the same source, so
     SPA route changes cannot restart the track. */
  if (music.currentSrc !== settings.url) {
    music.currentSrc = settings.url;
    music.audio.src = settings.url;
  }
  music.audio.loop = settings.loop !== false;
  const storedVolume = readStored(MUSIC_VOLUME_KEY);
  const volume = storedVolume != null ? Number(storedVolume) : (Number(settings.volume) || 0) / 100;
  music.audio.volume = Math.max(0, Math.min(1, isNaN(volume) ? 0.6 : volume));
  const storedMute = readStored(MUSIC_MUTE_KEY);
  music.audio.muted = storedMute === '1';
  music.control.classList.toggle('show', !isAdminView());
  music.control.setAttribute('data-state', music.audio.paused ? 'paused' : 'playing');
  syncMusicFieldFocus();
  if (settings.autoplay !== false && !music.audio.muted) {
    attemptPlay(false);
  } else {
    syncMusicButtons();
  }
}

/* ---------------------------- FALLING CANDY ------------------------------ */
const candy = { layer: null, active: 0, enabled: false, density: 'normal', timer: null, resizeTimer: null };

function candyTargetCount() {
  const base = candy.density === 'low' ? 6 : (candy.density === 'high' ? 20 : 12);
  const factor = window.innerWidth < 720 ? 0.35 : (window.innerWidth < 1100 ? 0.7 : 1);
  return Math.max(window.innerWidth < 720 ? 2 : 4, Math.round(base * factor));
}

function spawnCandy() {
  if (!candy.enabled || isReduced() || isAdminView()) return;
  if (!candy.layer) {
    candy.layer = document.createElement('div');
    candy.layer.id = 'crabbieCandyLayer';
    candy.layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(candy.layer);
  }
  const el = document.createElement('div');
  el.className = 'crabbie-candy';
  const size = randomInt(18, 44);
  const duration = randomInt(6500, 12500);
  el.style.left = randomInt(0, 100) + '%';
  el.style.width = size + 'px';
  el.style.height = size + 'px';
  el.style.setProperty('--drift', randomInt(-70, 70) + 'px');
  el.style.setProperty('--spin', randomInt(120, 420) + 'deg');
  el.style.animationDuration = duration + 'ms';
  el.style.animationDelay = randomInt(0, 2200) + 'ms';
  const img = document.createElement('img');
  img.src = CANDY_SRC[Math.random() < 0.5 ? 0 : 1];
  img.alt = '';
  img.draggable = false;
  el.appendChild(img);
  candy.layer.appendChild(el);
  candy.active += 1;
  const cleanup = () => {
    el.removeEventListener('animationend', cleanup);
    if (el.parentNode) el.parentNode.removeChild(el);
    candy.active -= 1;
    scheduleCandy();
  };
  el.addEventListener('animationend', cleanup);
}

function scheduleCandy() {
  if (candy.timer) { clearTimeout(candy.timer); candy.timer = null; }
  if (!candy.enabled || isReduced() || isAdminView()) return;
  const target = candyTargetCount();
  if (candy.active < target) {
    candy.timer = setTimeout(() => { spawnCandy(); scheduleCandy(); }, randomInt(280, 900));
  } else {
    candy.timer = setTimeout(scheduleCandy, 1500);
  }
}

function stopCandy() {
  if (candy.timer) { clearTimeout(candy.timer); candy.timer = null; }
  if (candy.layer) { candy.layer.innerHTML = ''; }
  candy.active = 0;
}

function applyCandy(enabled, density) {
  candy.enabled = Boolean(enabled);
  candy.density = density === 'low' || density === 'high' ? density : 'normal';
  if (candy.enabled && !isReduced()) scheduleCandy(); else stopCandy();
}

/* ------------------------------ DESKTOP PET ------------------------------ */
const petState = { layer: null, pets: [], enabled: false, maxDesktop: 5, desired: 0, dialogues: [], recentDialogues: [], rafId: 0, lastTime: 0 };

function petMetrics() {
  const nav = document.querySelector('.nav-shell');
  const navVisible = Boolean(nav && nav.offsetParent !== null);
  const navH = navVisible ? nav.getBoundingClientRect().height + 10 : 84;
  const size = window.innerWidth < 720 ? 56 : 68;
  return {
    size,
    navH,
    width: window.innerWidth,
    height: window.innerHeight,
    groundY: petGroundY(window.innerHeight, size, navH)
  };
}

function buildBubble() {
  const bubble = document.createElement('div');
  bubble.className = 'crabbie-pet-bubble';
  bubble.setAttribute('role', 'status');
  return bubble;
}

function showDialogue(pet) {
  const list = petState.dialogues.length ? petState.dialogues : DIALOGUE_FALLBACK;
  /* Per-pet last line + a small shared history so active pets do not all say
     the same thing. */
  const index = pickDialogueIndex(list, pet.dialogueIndex, Math.random, petState.recentDialogues);
  pet.dialogueIndex = index;
  petState.recentDialogues.push(index);
  const historyLimit = Math.max(1, Math.min(3, list.length - 1));
  while (petState.recentDialogues.length > historyLimit) petState.recentDialogues.shift();
  const entry = list[index] || list[0] || {};
  const bubble = pet.bubble;
  if (!bubble) return;
  bubble.textContent = '';
  const text = document.createElement('span');
  text.textContent = entry.text || '';
  bubble.appendChild(text);
  if (entry.url) {
    const a = document.createElement('a');
    const external = !/^#/.test(entry.url);
    a.href = entry.url;
    a.textContent = entry.label || 'Xem thêm';
    if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    bubble.appendChild(a);
  }
  if (pet.bubbleTimer) clearTimeout(pet.bubbleTimer);
  if (pet.bubbleRevealTimer) clearTimeout(pet.bubbleRevealTimer);
  /* A small random reveal delay keeps two pets from popping at the same moment. */
  pet.bubbleRevealTimer = setTimeout(() => {
    bubble.classList.add('show');
    if (pet.bubbleTimer) clearTimeout(pet.bubbleTimer);
    pet.bubbleTimer = setTimeout(() => bubble.classList.remove('show'), randomInt(4200, 5800));
  }, randomInt(0, 320));
}

function applyPetTransform(pet) {
  if (!Number.isFinite(pet.x) || !Number.isFinite(pet.y)) {
    /* Never let an invalid coordinate snap the pet to the CSS origin (the left
       corner). Recover from the last valid position, then the safe ground band. */
    const metrics = petMetrics();
    const fallbackX = Number.isFinite(pet.lastValidX) ? pet.lastValidX : spawnPetX(metrics.width, pet.size);
    const fallbackY = Number.isFinite(pet.lastValidY) ? pet.lastValidY : metrics.groundY;
    if (typeof console !== 'undefined' && console.warn) console.warn('Desktop pet: recovered an invalid position.');
    pet.x = fallbackX;
    pet.y = fallbackY;
    pet.baseY = pet.pinned && Number.isFinite(pet.baseY) ? pet.baseY : metrics.groundY;
    pet.targetY = pet.y;
  }
  pet.lastValidX = pet.x;
  pet.lastValidY = pet.y;
  pet.el.style.transform = 'translate3d(' + Math.round(pet.x) + 'px,' + Math.round(pet.y) + 'px,0)';
}

function startPetDrop(pet) {
  pet.el.style.setProperty('--fall', randomInt(120, 200) + 'px');
  pet.el.classList.add('is-dropping');
  if (pet.dropTimer) clearTimeout(pet.dropTimer);
  pet.dropTimer = setTimeout(() => pet.el.classList.remove('is-dropping'), 1000);
}

function createPet(options) {
  const opts = options || {};
  const metrics = petMetrics();
  const el = document.createElement('div');
  el.className = 'crabbie-pet';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', 'Desktop pet. Click for a message, drag to move.');
  const body = document.createElement('div');
  body.className = 'crabbie-pet-body';
  const img = document.createElement('img');
  img.src = PET_SRC;
  img.alt = '';
  img.draggable = false;
  body.appendChild(img);
  const bubble = buildBubble();
  el.appendChild(body);
  el.appendChild(bubble);
  const x = spawnPetX(metrics.width, metrics.size);
  const pet = {
    el, body, img, bubble, size: metrics.size,
    x, y: metrics.groundY, baseY: metrics.groundY, targetY: metrics.groundY,
    lastValidX: x, lastValidY: metrics.groundY,
    dir: initialWanderDir(x, metrics.width),
    speed: randomInt(10, 34),
    nextTurnAt: 0,
    pinned: false, dragging: false, pointerActive: false, pointerMoved: false, startPointer: null, dragOffset: null,
    dialogueIndex: -1, bubbleTimer: null, bubbleRevealTimer: null, dropTimer: null
  };
  wirePet(pet);
  petState.layer.appendChild(el);
  petState.pets.push(pet);
  applyPetTransform(pet);
  if (opts.drop) startPetDrop(pet);
  return pet;
}

function removePet(pet) {
  if (pet.bubbleTimer) clearTimeout(pet.bubbleTimer);
  if (pet.bubbleRevealTimer) clearTimeout(pet.bubbleRevealTimer);
  if (pet.dropTimer) clearTimeout(pet.dropTimer);
  if (pet.el.parentNode) pet.el.parentNode.removeChild(pet.el);
  const i = petState.pets.indexOf(pet);
  if (i !== -1) petState.pets.splice(i, 1);
}

/**
 * Spawn one pet from an interaction. Below the cap a new pet is added; at the
 * cap the oldest pet leaves first (FIFO) so at most `cap` pets ever exist.
 */
function spawnPetFromInteraction() {
  if (!petState.enabled || isReduced() || isAdminView() || window.innerWidth < 720) return;
  const cap = petCountFor(window.innerWidth, petState.maxDesktop);
  /* A one-pet cap never replaces the only pet: a click is just dialogue. */
  if (cap <= 1) return;
  const plan = planPetSpawn(petState.pets.length, cap);
  if (!plan.add) return;
  if (plan.removeOldest && petState.pets.length) removePet(petState.pets[0]);
  createPet({ drop: true });
  petState.desired = Math.min(cap, petState.pets.length);
}

function wirePet(pet) {
  pet.el.addEventListener('click', (event) => {
    if (pet.pointerMoved) { pet.pointerMoved = false; return; }
    if (event.target.closest('a')) return;
    pet.el.classList.remove('is-pet-jelly');
    void pet.el.offsetWidth;
    pet.el.classList.add('is-pet-jelly');
    setTimeout(() => pet.el.classList.remove('is-pet-jelly'), 520);
    showDialogue(pet);
    /* Every click spawns the next pet; the clicked pet never disappears. */
    spawnPetFromInteraction();
  });
  pet.el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pet.el.click(); }
  });
  pet.el.addEventListener('pointerdown', (event) => {
    if (event.button != null && event.button !== 0) return;
    /* A plain press is not a drag yet: it must not pin or move the pet. */
    pet.pointerActive = true;
    pet.pointerMoved = false;
    pet.startPointer = { x: event.clientX, y: event.clientY };
    pet.dragOffset = { x: event.clientX - pet.x, y: event.clientY - pet.y };
    try { pet.el.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
  });
  pet.el.addEventListener('pointermove', (event) => {
    if (!pet.pointerActive) return;
    const dx = event.clientX - pet.startPointer.x;
    const dy = event.clientY - pet.startPointer.y;
    if (!pet.dragging && Math.abs(dx) + Math.abs(dy) <= 6) return; /* still a click */
    if (!pet.dragging) {
      /* Only a real movement turns the press into a drag, which pins the pet. */
      pet.dragging = true;
      pet.pinned = true;
      pet.pointerMoved = true;
      pet.el.classList.add('is-dragging');
    }
    const metrics = petMetrics();
    const next = clampPosition(event.clientX - pet.dragOffset.x, event.clientY - pet.dragOffset.y,
      { width: metrics.width, height: metrics.height }, { width: pet.size, height: pet.size });
    pet.x = Number.isFinite(next.x) ? next.x : pet.lastValidX;
    pet.y = Math.max(metrics.navH, Number.isFinite(next.y) ? next.y : pet.lastValidY);
    pet.baseY = pet.y;
    pet.targetY = pet.y;
    applyPetTransform(pet);
  });
  const endPointer = (event) => {
    if (!pet.pointerActive) return;
    const wasDragging = pet.dragging;
    pet.pointerActive = false;
    pet.dragging = false;
    pet.el.classList.remove('is-dragging');
    try { if (event && event.pointerId != null) pet.el.releasePointerCapture(event.pointerId); } catch (e) { /* ignore */ }
    /* Stay exactly where the visitor dropped it; never snap or wander back. */
    if (wasDragging) { pet.baseY = pet.y; pet.targetY = pet.y; }
  };
  pet.el.addEventListener('pointerup', endPointer);
  pet.el.addEventListener('pointercancel', endPointer);
}

function focusedFieldRect() {
  const el = document.activeElement;
  if (!el || !el.matches) return null;
  if (!el.matches('input, textarea, select')) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  return rect;
}

function petTick(time) {
  if (!petState.enabled) { petState.rafId = 0; return; }
  const dt = petState.lastTime ? Math.min(0.05, (time - petState.lastTime) / 1000) : 0;
  petState.lastTime = time;
  const metrics = petMetrics();
  const field = focusedFieldRect();
  const active = !isReduced();
  petState.pets.forEach((pet) => {
    if (pet.dragging) return;
    if (!pet.pinned && active) {
      /* Each pet turns on its own schedule so they never march in step. */
      if (time >= pet.nextTurnAt) {
        pet.dir = Math.random() < 0.5 ? -1 : 1;
        pet.nextTurnAt = time + nextTurnDelayMs();
      }
      const step = nextWanderX(pet.x, pet.dir, pet.speed, dt, metrics.width, pet.size);
      if (Number.isFinite(step.x)) pet.x = step.x;
      pet.dir = step.dir;
    }
    if (pet.pinned) {
      pet.targetY = pet.baseY;
    } else {
      let target = metrics.groundY;
      if (field) {
        const overlapsX = pet.x + pet.size > field.left - 6 && pet.x < field.right + 6;
        if (overlapsX) {
          const above = field.top - pet.size - 10;
          target = above >= metrics.navH ? above : Math.min(field.bottom + 10, metrics.groundY);
        }
      }
      pet.targetY = Math.max(metrics.navH, Math.min(target, metrics.height - pet.size));
    }
    pet.y += (pet.targetY - pet.y) * Math.min(1, dt * 6);
    applyPetTransform(pet);
  });
  petState.rafId = requestAnimationFrame(petTick);
}

function startPetLoop() {
  if (petState.rafId) return;
  petState.lastTime = 0;
  petState.rafId = requestAnimationFrame(petTick);
}

function stopPetLoop() {
  if (petState.rafId) { cancelAnimationFrame(petState.rafId); petState.rafId = 0; }
}

/* Re-fit every pet into the viewport after a resize / route change. Pinned pets
   keep their dropped spot (only clamped); free pets return to the ground band. */
function clampAllPets() {
  const metrics = petMetrics();
  petState.pets.forEach((pet) => {
    pet.size = metrics.size;
    const safeX = Number.isFinite(pet.x) ? pet.x : (Number.isFinite(pet.lastValidX) ? pet.lastValidX : metrics.width / 2);
    const safeY = Number.isFinite(pet.y) ? pet.y : (Number.isFinite(pet.lastValidY) ? pet.lastValidY : metrics.groundY);
    const next = clampPosition(safeX, safeY, { width: metrics.width, height: metrics.height }, { width: pet.size, height: pet.size });
    pet.x = next.x;
    pet.y = Math.max(metrics.navH, next.y);
    pet.baseY = pet.pinned ? pet.y : metrics.groundY;
    pet.targetY = pet.baseY;
    applyPetTransform(pet);
  });
}

function reconcilePets() {
  if (!petState.layer) {
    petState.layer = document.createElement('div');
    petState.layer.id = 'crabbiePetLayer';
    petState.layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(petState.layer);
  }
  const active = petState.enabled && !isAdminView();
  const cap = active ? petCountFor(window.innerWidth, petState.maxDesktop) : 0;
  const target = Math.max(0, Math.min(petState.desired, cap));
  while (petState.pets.length > target) removePet(petState.pets[petState.pets.length - 1]);
  while (petState.pets.length < target) createPet({ drop: true });
  clampAllPets();
  if (active && petState.pets.length && !isReduced()) startPetLoop(); else stopPetLoop();
}

function applyPet(petSettings) {
  const cfg = petSettings || {};
  const wasEnabled = petState.enabled;
  petState.enabled = Boolean(cfg.enabled);
  const max = Number(cfg.maxDesktop);
  petState.maxDesktop = Number.isFinite(max) ? Math.max(1, Math.min(5, Math.floor(max))) : 5;
  petState.dialogues = Array.isArray(cfg.dialogues) ? cfg.dialogues.filter((d) => d && d.text) : [];
  /* A changed dialogue list invalidates the shared anti-repeat history. */
  petState.recentDialogues = [];
  if (!petState.enabled) {
    petState.desired = 0;
  } else if (!wasEnabled || !Number.isFinite(petState.desired) || petState.desired <= 0) {
    petState.desired = initialPetCount(window.innerWidth, petState.maxDesktop);
  }
  /* When already enabled, keep the current desired count so pets the visitor
     spawned by clicking survive a settings/public refresh. */
  reconcilePets();
}

function applyMotion(settings) {
  const cfg = settings || {};
  injectStyles();
  applyCandy(Boolean(cfg.fallingCandy), cfg.candyDensity);
  applyPet(cfg.pet);
}

const coarsePointer = window.matchMedia('(pointer:coarse)');
/* While an editable field is focused on touch devices the floating control
   hides so it can never cover the field or the software keyboard. Display
   only: the audio element, source, playback and mute preferences survive;
   blur and route changes restore the control without restarting anything. */
function syncMusicFieldFocus() {
  if (!music.control) return;
  let el = null;
  try { el = document.activeElement; } catch (e) { el = null; }
  const typing = Boolean(el && el.matches && el.matches('input, textarea, select'));
  music.control.classList.toggle('is-field-focused', typing && coarsePointer.matches);
}
document.addEventListener('focusin', () => { syncMusicFieldFocus(); });
document.addEventListener('focusout', () => { setTimeout(syncMusicFieldFocus, 0); });
/* Idempotent reduced-motion lifecycle: toggling the OS preference mid-session
   (no navigation/reload) stops movement and clears candy when reduced, and
   reconciles/restarts only the enabled systems when restored. Pinned pet
   positions, desired counts and the single music instance are untouched. */
function handleReduceChange() {
  if (isReduced()) {
    stopCandy();
    stopPetLoop();
  } else {
    if (candy.enabled && !isAdminView()) scheduleCandy();
    if (petState.enabled) reconcilePets();
  }
}
if (typeof reduceMotion !== 'undefined' && reduceMotion) {
  if (typeof reduceMotion.addEventListener === 'function') reduceMotion.addEventListener('change', handleReduceChange);
  else if (typeof reduceMotion.addListener === 'function') reduceMotion.addListener(handleReduceChange);
}

/* ------------------------------- INIT ----------------------------------- */
injectStyles();
if (window.__CRABBIE_MOTION__) applyMotion(window.__CRABBIE_MOTION__);
if (window.__CRABBIE_MUSIC__) applyMusic(window.__CRABBIE_MUSIC__);

let resizeTimer = null;
window.addEventListener('resize', () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (petState.enabled) reconcilePets();
    if (candy.enabled) scheduleCandy();
  }, 220);
});

/* Route changes never restart music; they only re-evaluate public/admin gating
   (and re-check field focus, since navigation drops focus back to body). */
window.addEventListener('hashchange', () => {
  if (music.control) music.control.classList.toggle('show', Boolean(music.settings && music.settings.enabled && music.settings.url) && !isAdminView());
  syncMusicFieldFocus();
  if (petState.layer) reconcilePets();
  if (candy.enabled && !isAdminView()) scheduleCandy(); else stopCandy();
});

window.CrabbieSiteMotion = { applyMotion, applyMusic, handleReduceChange };
