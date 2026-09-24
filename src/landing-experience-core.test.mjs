import assert from 'node:assert/strict';
import test from 'node:test';

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function range(p, a, b) { return clamp01((p - a) / (b - a)); }
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

var PTS_DESKTOP = [
  [0.50, 0.32], [0.56, 0.40], [0.44, 0.48], [0.33, 0.56],
  [0.38, 0.66], [0.54, 0.72], [0.64, 0.62], [0.56, 0.52],
  [0.46, 0.58], [0.50, 0.63]
];

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

test('Landing geometry: Catmull-Rom Bezier produces valid SVG path for desktop and mobile', () => {
  const dDesktop = catmullRomToBezier(PTS_DESKTOP, 1280, 800);
  assert.ok(dDesktop.startsWith('M640.0,256.0C'), 'desktop path starts at first point');
  assert.ok(dDesktop.endsWith('640.0,504.0'), 'desktop path finishes at flourishing endpoint');

  const dMobile = catmullRomToBezier(PTS_MOBILE, 390, 844);
  assert.ok(dMobile.startsWith('M195.0,168.8C'), 'mobile path starts at first point');
  assert.ok(dMobile.endsWith('195.0,641.4'), 'mobile path terminates in lower center below cards');
});

test('Landing timeline: Hero type fades out early (0.02 → 0.16)', () => {
  const atStart = 1 - easeInOut(range(0.0, 0.02, 0.16));
  const atMid = 1 - easeInOut(range(0.09, 0.02, 0.16));
  const atEnd = 1 - easeInOut(range(0.18, 0.02, 0.16));

  assert.equal(atStart, 1, 'hero is fully visible at start');
  assert.ok(atMid > 0.3 && atMid < 0.7, 'hero is fading at midpoint');
  assert.equal(atEnd, 0, 'hero is completely faded out by 0.18');
});

test('Landing timeline: Drawing line finishes and reaches endpoint at ~0.86', () => {
  const drawAt0 = easeInOut(range(0.0, 0.10, 0.86));
  const drawAt50 = easeInOut(range(0.48, 0.10, 0.86));
  const drawAt86 = easeInOut(range(0.86, 0.10, 0.86));

  assert.equal(drawAt0, 0, 'drawing has not begun at 0');
  assert.ok(drawAt50 > 0.4 && drawAt50 < 0.6, 'drawing is halfway at ~0.48');
  assert.equal(drawAt86, 1, 'drawing line reaches 100% completion at 0.86');
});

test('Landing timeline: Welcome message enters, remains readable, dissolves as portal opens', () => {
  const msgCalc = (p) => {
    const msgIn = easeOut(range(p, 0.48, 0.62));
    const msgOut = 1 - easeInOut(range(p, 0.84, 0.92));
    return msgIn * msgOut;
  };

  assert.equal(msgCalc(0.40), 0, 'message is invisible before 0.48');
  assert.ok(msgCalc(0.62) > 0.95, 'message is fully readable at 0.62');
  assert.ok(msgCalc(0.75) > 0.95, 'message remains fully readable at 0.75');
  assert.ok(msgCalc(0.82) > 0.95, 'message has generous reading room through 0.82');
  assert.ok(msgCalc(0.88) < 0.6, 'message dissolves as portal expands');
  assert.equal(msgCalc(0.95), 0, 'message is completely gone before Home handoff finishes');
});

test('Landing timeline: Portal expands from 0.86 to 0.98 and completes at 1.0', () => {
  const portalCalc = (p) => range(p, 0.86, 0.98);

  assert.equal(portalCalc(0.85), 0, 'portal is closed before 0.86');
  assert.ok(portalCalc(0.92) > 0.4 && portalCalc(0.92) < 0.6, 'portal is expanding at 0.92');
  assert.equal(portalCalc(0.98), 1, 'portal fully covers stage at 0.98');
  assert.equal(portalCalc(1.00), 1, 'portal remains at 100% at 1.00');
});

test('Landing timeline: Real Home hero and nav-shell transition into place at 0.88 → 1.00', () => {
  const homeTransition = (p) => easeOut(range(p, 0.88, 1.0));

  assert.equal(homeTransition(0.85), 0, 'Home and nav are hidden during drawing sequence');
  assert.ok(homeTransition(0.94) > 0.4, 'Home hero and nav smoothly rise into place');
  assert.equal(homeTransition(1.00), 1, 'Home hero and nav reach 100% normal state at progress 1');
});
