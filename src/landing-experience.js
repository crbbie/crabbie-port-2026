/* ============================================================
   CRABBIE — LANDING EXPERIENCE CONTROLLER
   Reference: landing.html
   Visual & motion flow:
     Landing Opening → Candy Atelier → Drawing Story Sequence →
     "welcome to my tiny corner of the internet" →
     Drawing Line Endpoint reached →
     Ink Bloom / Candy Portal expands outward →
     Reveals REAL Home UI underneath.
   ============================================================ */

(function () {
  'use strict';

  var shell, stage, linePath, bloomEl, spkEl, msgEl;
  var revealEls = [];
  var decos = [];
  var homeEl, heroEl, navShell;

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var reduced = reduceMQ.matches;

  var lineLen = 0;
  var endPoint = { x: 0, y: 0 };
  var target = 0;
  var current = 0;
  var rafId = 0;
  var running = false;
  var resizeTimer = 0;
  var initialized = false;

  /* ---------- Math Helpers ---------- */
  function clamp01(v) { return v <= 0 ? 0 : v >= 1 ? 1 : v; }
  function range(p, a, b) { return clamp01((p - a) / (b - a)); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function n3(v) { return (Math.round(v * 1000) / 1000).toString(); }

  /* ---------- Drawing Line Geometry ---------- */
  /* Desktop path: sweeps past sketch, wip, finished art, flourishing at (0.50, 0.63) */
  var PTS_DESKTOP = [
    [0.50, 0.32], [0.56, 0.40], [0.44, 0.48], [0.33, 0.56],
    [0.38, 0.66], [0.54, 0.72], [0.64, 0.62], [0.56, 0.52],
    [0.46, 0.58], [0.50, 0.63]
  ];

  /* Mobile path: vertical rhythm, clean curves, flourishes below finished art at (0.50, 0.76) */
  var PTS_MOBILE = [
    [0.50, 0.20], [0.62, 0.30], [0.38, 0.42], [0.60, 0.54],
    [0.40, 0.66], [0.50, 0.76]
  ];

  function catmullRomToBezier(pts, w, h) {
    var p = pts.map(function (pt) { return [pt[0] * w, pt[1] * h]; });
    var d = 'M' + p[0][0].toFixed(1) + ',' + p[0][1].toFixed(1);
    for (var i = 0; i < p.length - 1; i++) {
      var p0 = p[i - 1] || p[i];
      var p1 = p[i];
      var p2 = p[i + 1];
      var p3 = p[i + 2] || p[i + 1];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6;
      var c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6;
      var c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += 'C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' +
                  c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' +
                  p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    return d;
  }

  function buildLine() {
    if (!stage || !linePath) return;
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    if (!w || !h) return;

    var pts = window.innerWidth < 760 ? PTS_MOBILE : PTS_DESKTOP;
    linePath.setAttribute('d', catmullRomToBezier(pts, w, h));

    try { lineLen = linePath.getTotalLength(); }
    catch (e) { lineLen = h * 2; }
    if (!lineLen) lineLen = h * 2;

    linePath.style.strokeDasharray = lineLen;
    linePath.style.strokeDashoffset = reduced ? 0 : lineLen;

    /* Endpoint for the portal transition bloom */
    try {
      var pt = linePath.getPointAtLength(lineLen);
      endPoint = { x: pt.x, y: pt.y };
    } catch (err) {
      endPoint = { x: w * 0.5, y: h * (window.innerWidth < 760 ? 0.76 : 0.63) };
    }
  }

  function setReveal(el, t, o) {
    if (!el) return;
    el.style.setProperty('--t', n3(t));
    el.style.setProperty('--t-o', n3(o));
  }

  function toggleDeco(el, p, inA, inB, outA, outB) {
    if (!el) return;
    var on = p > inA && p < outB && range(p, inA, inB) > 0.5;
    el.classList.toggle('is-on', on);
    if (!reduced) {
      el.style.opacity = n3(range(p, inA, inB) * (1 - easeInOut(range(p, outA, outB))));
    }
  }

  /* ---------- Apply Scroll Frame (p: 0.0 → 1.0) ---------- */
  function apply(p) {
    if (!stage || reduced) return;

    var stageW = stage.clientWidth || window.innerWidth;
    var stageH = stage.clientHeight || window.innerHeight;

    /* Phase 1: Hero Type (CRABBIE title & badge) fades up and away */
    var heroOut = easeInOut(range(p, 0.02, 0.16));
    stage.style.setProperty('--ld-o-hero', n3(1 - heroOut));
    stage.style.setProperty('--ld-y-hero', (-heroOut * 44).toFixed(2) + 'px');

    /* Phase 2: Desk Scene (chibi artist, accessories) settles */
    var deskOut = easeInOut(range(p, 0.16, 0.42));
    stage.style.setProperty('--ld-o-desk', n3(1 - deskOut));
    stage.style.setProperty('--ld-y-desk', (-deskOut * 6).toFixed(2) + '%');

    /* Phase 3: Drawing Line progression */
    var draw = easeInOut(range(p, 0.10, 0.86));
    if (!reduced && lineLen) {
      linePath.style.strokeDashoffset = (lineLen * (1 - draw)).toFixed(1);
    }
    var lineOut = 1 - easeInOut(range(p, 0.86, 0.96));
    stage.style.setProperty('--ld-o-line', n3(lineOut));

    /* Decorative moments along the line */
    if (decos.length >= 3) {
      toggleDeco(decos[0], p, 0.20, 0.30, 0.78, 0.88);
      toggleDeco(decos[1], p, 0.36, 0.46, 0.78, 0.88);
      toggleDeco(decos[2], p, 0.52, 0.62, 0.78, 0.88);
    }

    /* Phase 4: Story Cards (sketch → WIP → finished art) */
    var r1 = easeOut(range(p, 0.20, 0.34));
    var r2 = easeOut(range(p, 0.32, 0.47));
    var r3 = easeOut(range(p, 0.44, 0.58));
    var story12Fade = 1 - easeInOut(range(p, 0.66, 0.78));
    var story3Fade = 1 - easeInOut(range(p, 0.84, 0.92));

    if (revealEls[0]) setReveal(revealEls[0], r1, r1 * story12Fade);
    if (revealEls[1]) setReveal(revealEls[1], r2, r2 * story12Fade);
    if (revealEls[2]) setReveal(revealEls[2], r3, r3 * story3Fade);

    /* Phase 5: Welcome message (enters ~0.48, stays readable through ~0.84, dissolves ~0.92) */
    var msgIn = easeOut(range(p, 0.48, 0.62));
    var msgOut = 1 - easeInOut(range(p, 0.84, 0.92));
    stage.style.setProperty('--ld-o-msg', n3(msgIn * msgOut));

    /* Phase 6 & 7: Endpoint Ink Bloom & Portal Reveal */
    if (bloomEl && spkEl) {
      bloomEl.style.setProperty('--bloom-x', endPoint.x.toFixed(1) + 'px');
      bloomEl.style.setProperty('--bloom-y', endPoint.y.toFixed(1) + 'px');
      spkEl.style.setProperty('--bloom-x', endPoint.x.toFixed(1) + 'px');
      spkEl.style.setProperty('--bloom-y', endPoint.y.toFixed(1) + 'px');

      /* Center sparkle flourish */
      var spkIn = range(p, 0.83, 0.86);
      var spkOut = 1 - range(p, 0.92, 0.97);
      spkEl.style.setProperty('--spk-scale', (easeOut(spkIn) * spkOut).toFixed(3));
      spkEl.style.setProperty('--spk-opacity', (spkIn * spkOut).toFixed(3));
      spkEl.style.setProperty('--spk-rot', (spkIn * 180).toFixed(1) + 'deg');

      /* Portal radius expanding outward from the line endpoint */
      var portalT = range(p, 0.86, 0.98);
      var portalEase = easeInOut(portalT);
      var maxR = Math.hypot(stageW, stageH) * 0.85;
      var currentR = 0;
      if (portalT > 0) {
        currentR = 8 + (maxR - 8) * Math.pow(portalEase, 1.6);
      }

      bloomEl.style.setProperty('--bloom-size', (currentR * 2).toFixed(1) + 'px');
      var bloomOpacity = portalT > 0 && portalT < 0.92 ? 1 : (1 - range(portalT, 0.92, 1.0));
      bloomEl.style.setProperty('--bloom-opacity', n3(bloomOpacity));

      /* Stage mask: reveals real Home underneath */
      if (currentR > 0 && p < 0.995) {
        var maskStr = 'radial-gradient(circle at ' + endPoint.x.toFixed(1) + 'px ' + endPoint.y.toFixed(1) + 'px, transparent 0, transparent ' + currentR.toFixed(1) + 'px, black ' + (currentR + 8).toFixed(1) + 'px)';
        stage.style.webkitMaskImage = maskStr;
        stage.style.maskImage = maskStr;
        stage.style.opacity = '1';
        stage.style.visibility = 'visible';
        stage.style.pointerEvents = 'auto';
      } else if (p >= 0.995) {
        stage.style.webkitMaskImage = '';
        stage.style.maskImage = '';
        stage.style.opacity = '0';
        stage.style.visibility = 'hidden';
        stage.style.pointerEvents = 'none';
      } else {
        stage.style.webkitMaskImage = '';
        stage.style.maskImage = '';
        stage.style.opacity = '1';
        stage.style.visibility = 'visible';
        stage.style.pointerEvents = 'auto';
      }
    }

    /* Phase 8: Real Home DOM and Navigation Reveal */
    var homeT = easeOut(range(p, 0.88, 1.0));

    if (shell) {
      shell.classList.toggle('is-completed', p >= 1.0);
    }

    /* Home content position compensation so Home hero is pinned at the top */
    if (homeEl) {
      if (p < 1.0) {
        var maxScroll = (shell ? shell.offsetHeight : 0) - window.innerHeight;
        var pullUp = Math.max(0, maxScroll - (window.scrollY || 0));
        var heroOffset = (1 - homeT) * 28;
        homeEl.style.transform = 'translateY(' + (-pullUp + heroOffset).toFixed(1) + 'px)';
      } else {
        homeEl.style.transform = '';
      }
    }

    /* Hero element subtle fade & lift */
    if (heroEl) {
      if (p < 0.88) {
        heroEl.classList.add('ld-hero-hidden');
        heroEl.classList.remove('ld-hero-revealing');
        heroEl.style.opacity = '0';
        heroEl.style.transform = 'translateY(28px)';
      } else if (p < 1.0) {
        heroEl.classList.remove('ld-hero-hidden');
        heroEl.classList.add('ld-hero-revealing');
        heroEl.style.opacity = n3(homeT);
        heroEl.style.transform = 'translateY(' + ((1 - homeT) * 28).toFixed(1) + 'px)';
      } else {
        heroEl.classList.remove('ld-hero-hidden');
        heroEl.classList.remove('ld-hero-revealing');
        heroEl.style.opacity = '1';
        heroEl.style.transform = '';
      }
    }

    /* Real navigation reveal */
    if (navShell) {
      if (p < 0.88) {
        navShell.classList.add('ld-nav-hidden');
        navShell.classList.remove('ld-nav-revealing');
        navShell.style.opacity = '0';
        navShell.style.transform = 'translateY(-16px)';
        navShell.style.pointerEvents = 'none';
      } else if (p < 1.0) {
        var navT = easeOut(range(p, 0.88, 1.0));
        navShell.classList.remove('ld-nav-hidden');
        navShell.classList.add('ld-nav-revealing');
        navShell.style.opacity = n3(navT);
        navShell.style.transform = 'translateY(' + (-(1 - navT) * 16).toFixed(1) + 'px)';
        navShell.style.pointerEvents = navT > 0.5 ? 'auto' : 'none';
      } else {
        navShell.classList.remove('ld-nav-hidden');
        navShell.classList.remove('ld-nav-revealing');
        navShell.style.opacity = '1';
        navShell.style.transform = '';
        navShell.style.pointerEvents = 'auto';
      }
    }
  }

  /* ---------- Scroll Engine (Lerped) ---------- */
  function computeTarget() {
    if (!shell) { target = 0; return; }
    var total = shell.offsetHeight - window.innerHeight;
    if (total <= 0) { target = 0; return; }
    var top = shell.getBoundingClientRect().top;
    target = clamp01(-top / total);
  }

  function isHomeView() {
    var raw = location.hash.replace(/^#/, '');
    var path = location.pathname.replace(/^\/+|\/+$/g, '');
    return (raw === 'home') || (!raw && !path);
  }

  function frame() {
    if (!isHomeView()) { running = false; return; }
    var k = reduced ? 1 : 0.2;
    current += (target - current) * k;
    if (Math.abs(target - current) < 0.0004) current = target;
    apply(current);
    if (current !== target) {
      rafId = requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function requestFrame() {
    if (!isHomeView()) return;
    if (reduced) { current = target; apply(current); return; }
    if (!running) {
      running = true;
      rafId = requestAnimationFrame(frame);
    }
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    running = false;
  }

  function refresh(snap) {
    if (reduced || !isHomeView()) return;
    syncShellOffset();
    computeTarget();
    if (snap) current = target;
    requestFrame();
  }

  /* ---------- Reduced Motion Mode ---------- */
  function setReduced(isReduced) {
    reduced = isReduced;
    if (isReduced) {
      stopLoop();
      if (lineLen && linePath) linePath.style.strokeDashoffset = 0;
      if (stage) {
        ['--ld-o-hero', '--ld-y-hero', '--ld-o-desk', '--ld-y-desk', '--ld-o-line', '--ld-o-msg']
          .forEach(function (prop) { stage.style.removeProperty(prop); });
        stage.style.webkitMaskImage = '';
        stage.style.maskImage = '';
        stage.style.opacity = '1';
        stage.style.visibility = 'visible';
        stage.style.pointerEvents = 'auto';
      }
      if (homeEl) homeEl.style.transform = '';
      if (heroEl) { heroEl.style.opacity = ''; heroEl.style.transform = ''; }
      if (navShell) { navShell.style.opacity = ''; navShell.style.transform = ''; navShell.style.pointerEvents = ''; }
    } else {
      buildLine();
      refresh(true);
    }
  }

  /* ---------- Event Handlers ---------- */
  function onScroll() {
    if (reduced || !isHomeView()) return;
    computeTarget();
    requestFrame();
  }

  function onResize() {
    if (reduced) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      buildLine();
      refresh(true);
    }, 100);
  }

  /* ---------- Initialization & Teardown ---------- */
  function grabElements() {
    shell = document.getElementById('landingExperience');
    stage = document.getElementById('landingStage');
    linePath = document.getElementById('ldLinePath');
    bloomEl = document.getElementById('landingPortalBloom');
    spkEl = document.getElementById('landingPortalSpk');
    msgEl = document.getElementById('landingMessage');
    homeEl = document.getElementById('ldHomeContent');
    heroEl = document.querySelector('.view[data-view="home"] .hero');
    navShell = document.querySelector('.nav-shell');

    revealEls = Array.prototype.slice.call(document.querySelectorAll('.ld-story__reveal'));
    decos = Array.prototype.slice.call(document.querySelectorAll('.ld-line-deco'));
  }

  function syncShellOffset() {
    if (!shell) return;
    shell.style.marginTop = '';
    var r = shell.getBoundingClientRect();
    var offsetFromTop = r.top + (window.scrollY || window.pageYOffset || 0);
    if (offsetFromTop > 0) {
      shell.style.marginTop = (-offsetFromTop) + 'px';
    }
  }

  function resetHomeState() {
    stopLoop();
    if (shell) {
      shell.classList.remove('is-completed');
      shell.style.marginTop = '';
    }
    if (homeEl) homeEl.style.transform = '';
    if (heroEl) {
      heroEl.classList.remove('ld-hero-hidden', 'ld-hero-revealing');
      heroEl.style.opacity = '';
      heroEl.style.transform = '';
    }
    if (navShell) {
      navShell.classList.remove('ld-nav-hidden', 'ld-nav-revealing');
      navShell.style.opacity = '';
      navShell.style.transform = '';
      navShell.style.pointerEvents = '';
    }
    if (stage) {
      stage.style.webkitMaskImage = '';
      stage.style.maskImage = '';
      stage.style.opacity = '';
      stage.style.visibility = '';
      stage.style.pointerEvents = '';
    }
  }

  function init() {
    grabElements();
    if (!shell || !stage) return;
    initialized = true;

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });

    if (reduceMQ.addEventListener) {
      reduceMQ.addEventListener('change', function (e) { setReduced(e.matches); });
    } else if (reduceMQ.addListener) {
      reduceMQ.addListener(function (e) { setReduced(e.matches); });
    }

    if (reduced) {
      setReduced(true);
    } else if (isHomeView()) {
      syncShellOffset();
      buildLine();
      computeTarget();
      current = target;
      apply(current);
    } else {
      resetHomeState();
    }
  }

  function destroy() {
    stopLoop();
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    resetHomeState();
    initialized = false;
  }

  /* Auto-boot when DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Expose controller API for SPA router integration and review inspection */
  window.CrabbieLandingExperience = {
    init: init,
    destroy: destroy,
    refresh: refresh,
    resetHomeState: resetHomeState,
    get progress() { return current; },
    get target() { return target; },
    get endPoint() { return endPoint; },
    get isReduced() { return reduced; },
    get isRunning() { return running; }
  };

})();
