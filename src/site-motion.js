/**
 * Public-site motion runtime: music, falling candy and the desktop pet.
 *
 * Pure pet/dialogue rules live in desktop-pet-core.js. This module owns only
 * browser wiring (audio element, DOM layers, pointer/rAF movement) and is
 * exposed as window.CrabbieSiteMotion so the SPA can apply CMS settings.
 */
import { petCountFor, pickDialogueIndex, clampPosition, nextWanderX, randomInt } from './desktop-pet-core.js';

const CANDY_SRC = ['/deco/candy1.svg', '/deco/candy2.svg'];
const PET_SRC = '/deco/Desktop-Pet.gif';
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
.crabbie-pet img{width:100%;height:100%;object-fit:contain;image-rendering:auto;pointer-events:none;user-select:none;-webkit-user-drag:none;}
.crabbie-pet.is-dragging{cursor:grabbing;}
.crabbie-pet.is-jelly img{animation:crabbiePetJelly .5s ease;}
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
#crabbieMusicControl{position:fixed;right:18px;bottom:18px;z-index:70;display:none;gap:6px;align-items:center;
  padding:6px;border-radius:999px;background:rgba(255,255,255,.94);border:2px solid var(--pink-light,#ffd9e8);
  box-shadow:0 8px 18px -10px rgba(217,74,128,.55);font-family:var(--font-body,system-ui),sans-serif;}
#crabbieMusicControl.show{display:inline-flex;}
#crabbieMusicControl button{width:34px;height:34px;border-radius:50%;border:2px solid var(--pink-light,#ffd9e8);
  background:#fff;color:var(--pink-hot,#ff5c9a);cursor:pointer;display:grid;place-items:center;padding:0;line-height:0;}
#crabbieMusicControl button:hover{border-color:var(--pink-hot,#ff5c9a);}
#crabbieMusicControl button:focus-visible{outline:3px solid var(--purple-hot,#8a5cff);outline-offset:2px;}
#crabbieMusicControl svg{width:16px;height:16px;fill:currentColor;}
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
  if (music.control) return;
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
  music.settings = settings || {};
  const enabled = Boolean(settings && settings.enabled && settings.url);
  if (!enabled) {
    if (music.audio) { music.audio.pause(); }
    if (music.control) music.control.classList.remove('show');
    return;
  }
  ensureMusicControl();
  if (!music.audio) {
    music.audio = document.createElement('audio');
    music.audio.preload = 'auto';
    music.audio.setAttribute('playsinline', '');
    music.audio.addEventListener('play', syncMusicButtons);
    music.audio.addEventListener('pause', syncMusicButtons);
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
const petState = { layer: null, pets: [], enabled: false, maxDesktop: 5, dialogues: [], rafId: 0, lastTime: 0, resizeTimer: null };

function petSafeBounds() {
  const nav = document.querySelector('.nav-shell');
  const navH = nav ? nav.getBoundingClientRect().height + 12 : 96;
  const bottom = 96;
  return { top: navH, bottom: Math.max(navH + 80, window.innerHeight - bottom) };
}

function buildBubble(pet) {
  const bubble = document.createElement('div');
  bubble.className = 'crabbie-pet-bubble';
  bubble.setAttribute('role', 'status');
  return bubble;
}

function showDialogue(pet) {
  const list = petState.dialogues.length ? petState.dialogues : DIALOGUE_FALLBACK;
  const index = pickDialogueIndex(list, pet.dialogueIndex);
  pet.dialogueIndex = index;
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
  bubble.classList.add('show');
  if (pet.bubbleTimer) clearTimeout(pet.bubbleTimer);
  pet.bubbleTimer = setTimeout(() => bubble.classList.remove('show'), 4800);
}

function createPet() {
  const el = document.createElement('div');
  el.className = 'crabbie-pet';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', 'Desktop pet. Click for a message, drag to move.');
  const img = document.createElement('img');
  img.src = PET_SRC;
  img.alt = '';
  img.draggable = false;
  const bubble = buildBubble();
  el.appendChild(img);
  el.appendChild(bubble);
  const bounds = petSafeBounds();
  const size = window.innerWidth < 720 ? 56 : 68;
  const start = clampPosition(randomInt(20, Math.max(40, window.innerWidth - size - 20)), randomInt(bounds.top, Math.max(bounds.top + 20, bounds.bottom - size)), { width: window.innerWidth, height: bounds.bottom + size }, { width: size, height: size });
  const pet = {
    el, img, bubble, size,
    x: start.x, y: start.y, homeY: start.y, targetY: start.y,
    dir: Math.random() < 0.5 ? -1 : 1,
    speed: randomInt(12, 26),
    dialogueIndex: -1,
    bubbleTimer: null,
    dragging: false,
    resumeTimer: null,
    pointerMoved: false,
    startPointer: null
  };
  wirePet(pet);
  petState.layer.appendChild(el);
  petState.pets.push(pet);
  applyPetTransform(pet);
  return pet;
}

function applyPetTransform(pet) {
  pet.el.style.transform = 'translate3d(' + pet.x + 'px,' + pet.y + 'px,0)';
}

function removePet(pet) {
  if (pet.bubbleTimer) clearTimeout(pet.bubbleTimer);
  if (pet.resumeTimer) clearTimeout(pet.resumeTimer);
  if (pet.el.parentNode) pet.el.parentNode.removeChild(pet.el);
  const i = petState.pets.indexOf(pet);
  if (i !== -1) petState.pets.splice(i, 1);
}

function wirePet(pet) {
  pet.el.addEventListener('click', (event) => {
    if (pet.pointerMoved) { pet.pointerMoved = false; return; }
    if (event.target.closest('a')) return;
    pet.el.classList.remove('is-jelly');
    void pet.el.offsetWidth;
    pet.el.classList.add('is-jelly');
    setTimeout(() => pet.el.classList.remove('is-jelly'), 520);
    showDialogue(pet);
    if (!isReduced() && window.innerWidth >= 720 && petState.pets.length < petCountFor(window.innerWidth, petState.maxDesktop)) {
      setTimeout(() => { if (petState.pets.length < petCountFor(window.innerWidth, petState.maxDesktop)) createPet(); }, 420);
    }
  });
  pet.el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pet.el.click(); }
  });
  pet.el.addEventListener('pointerdown', (event) => {
    if (event.button != null && event.button !== 0) return;
    pet.dragging = true;
    pet.pointerMoved = false;
    pet.startPointer = { x: event.clientX, y: event.clientY };
    pet.dragOffset = { x: event.clientX - pet.x, y: event.clientY - pet.y };
    pet.el.classList.add('is-dragging');
    try { pet.el.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
    if (pet.resumeTimer) { clearTimeout(pet.resumeTimer); pet.resumeTimer = null; }
  });
  pet.el.addEventListener('pointermove', (event) => {
    if (!pet.dragging) return;
    const dx = event.clientX - pet.startPointer.x;
    const dy = event.clientY - pet.startPointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) pet.pointerMoved = true;
    const bounds = petSafeBounds();
    const next = clampPosition(event.clientX - pet.dragOffset.x, event.clientY - pet.dragOffset.y,
      { width: window.innerWidth, height: bounds.bottom + pet.size }, { width: pet.size, height: pet.size });
    pet.x = next.x;
    pet.y = next.y;
    pet.homeY = Math.min(Math.max(next.y, bounds.top), Math.max(bounds.top, bounds.bottom - pet.size));
    pet.targetY = pet.y;
    applyPetTransform(pet);
  });
  const endDrag = (event) => {
    if (!pet.dragging) return;
    pet.dragging = false;
    pet.el.classList.remove('is-dragging');
    try { if (event && event.pointerId != null) pet.el.releasePointerCapture(event.pointerId); } catch (e) { /* ignore */ }
    /* Settle smoothly, then let the pet resume wandering. */
    const bounds = petSafeBounds();
    pet.targetY = Math.min(Math.max(pet.y, bounds.top), Math.max(bounds.top, bounds.bottom - pet.size));
    pet.resumeTimer = setTimeout(() => { pet.homeY = pet.targetY; }, 400);
  };
  pet.el.addEventListener('pointerup', endDrag);
  pet.el.addEventListener('pointercancel', endDrag);
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
  const field = focusedFieldRect();
  const bounds = petSafeBounds();
  const width = window.innerWidth;
  const active = !isReduced();
  petState.pets.forEach((pet) => {
    if (pet.dragging) return;
    if (active) {
      const step = nextWanderX(pet.x, pet.dir, pet.speed, dt, width, pet.size);
      pet.x = step.x;
      pet.dir = step.dir;
    }
    let target = pet.homeY;
    if (field) {
      const overlapsX = pet.x + pet.size > field.left - 6 && pet.x < field.right + 6;
      if (overlapsX) {
        const above = field.top - pet.size - 10;
        const below = field.bottom + 10;
        target = above >= bounds.top ? above : Math.min(below, bounds.bottom - pet.size);
      }
    }
    pet.targetY = Math.max(bounds.top, Math.min(target, Math.max(bounds.top, bounds.bottom - pet.size)));
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

function reconcilePets() {
  if (!petState.layer) {
    petState.layer = document.createElement('div');
    petState.layer.id = 'crabbiePetLayer';
    petState.layer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(petState.layer);
  }
  const active = petState.enabled && !isAdminView();
  const target = active ? petCountFor(window.innerWidth, petState.maxDesktop) : 0;
  while (petState.pets.length > target) removePet(petState.pets[petState.pets.length - 1]);
  while (petState.pets.length < target) createPet();
  if (active && petState.pets.length && !isReduced()) startPetLoop(); else stopPetLoop();
}

function applyPet(petSettings) {
  const cfg = petSettings || {};
  petState.enabled = Boolean(cfg.enabled);
  const max = Number(cfg.maxDesktop);
  petState.maxDesktop = Number.isFinite(max) ? Math.max(1, Math.min(5, Math.floor(max))) : 5;
  petState.dialogues = Array.isArray(cfg.dialogues) ? cfg.dialogues.filter((d) => d && d.text) : [];
  reconcilePets();
}

function applyMotion(settings) {
  const cfg = settings || {};
  injectStyles();
  applyCandy(Boolean(cfg.fallingCandy), cfg.candyDensity);
  applyPet(cfg.pet);
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

/* Route changes never restart music; they only re-evaluate public/admin gating. */
window.addEventListener('hashchange', () => {
  if (music.control) music.control.classList.toggle('show', Boolean(music.settings && music.settings.enabled && music.settings.url) && !isAdminView());
  if (petState.layer) reconcilePets();
  if (candy.enabled && !isAdminView()) scheduleCandy(); else stopCandy();
});

window.CrabbieSiteMotion = { applyMotion, applyMusic };
