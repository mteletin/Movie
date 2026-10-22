/* LONG DUSK — shots_chars.js
 * Characters: faces, figures, hands and prop inserts.
 * Procedural cel-anime drawing on a 2D canvas. Deterministic for (t, p, w, h).
 * All drawing happens in a virtual 1920x1080 space scaled to (w, h).
 */
(function () {
'use strict';
var SH = window.LD_SHOTS = window.LD_SHOTS || {};
var VW = 1920, VH = 1080, TAU = Math.PI * 2;

/* ------------------------------------------------------------------ utils */
function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
function lerp(a, b, t) { return a + (b - a) * t; }
function sm(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function hash(n) {
  n = (n | 0) ^ 0x2c1b3c6d;
  n = Math.imul(n ^ (n >>> 16), 0x297a2d39);
  n = Math.imul(n ^ (n >>> 15), 0x5bd1e995);
  n ^= n >>> 13;
  return (n >>> 0) / 4294967296;
}
function rng(seed) {
  var a = (seed | 0) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function strHash(s) {
  var h = 2166136261;
  s = String(s);
  for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/* limited animation: hair, smoke and small motions update "on twos" (12 fps) */
function q12(t) { return Math.floor(t * 12) / 12; }
function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
function bool(v, d) { return v === undefined || v === null ? d : !!v; }

/* ----------------------------------------------------------------- colors */
var _rgb = {};
function rgb(c) {
  if (typeof c !== 'string') return c;
  var r = _rgb[c];
  if (r) return r;
  var h = c.charAt(0) === '#' ? c.slice(1) : c;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  r = [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  _rgb[c] = r;
  return r;
}
function css(a, al) {
  var r = Math.round(clamp(a[0], 0, 255)), g = Math.round(clamp(a[1], 0, 255)), b = Math.round(clamp(a[2], 0, 255));
  return (al === undefined || al === null || al >= 1) ? 'rgb(' + r + ',' + g + ',' + b + ')' :
    'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, al).toFixed(3) + ')';
}
function mixa(a, b, t) { a = rgb(a); b = rgb(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function mixc(a, b, t, al) { return css(mixa(a, b, t), al); }
function mixHex(a, b, t) { var r = mixa(a, b, t); return '#' + r.map(function (v) { var h = Math.round(clamp(v, 0, 255)).toString(16); return h.length < 2 ? '0' + h : h; }).join(''); }
function rgba(c, al) { return css(rgb(c), al); }

/* ------------------------------------------------------------- lighting
 * A light L maps a base (flat) color to a lit cel tone, a shadow tone and a rim.
 */
var LIGHTS = {};
var BG_RIM = {
  apartment: '#ffd6a8', hall: '#ffe2a6', garden: '#ffb0ec', terrace: '#ffb872', ship: '#9ae4ff',
  dock: '#b0ccff', detention: '#eef6ff', spine: '#fff4dc', observation: '#ffcc9c', dark: '#ffae52'
};
function light(kind, dark, opt) {
  var key = kind + '|' + (dark ? 1 : 0) + '|' + (opt || '');
  var L = LIGHTS[key];
  if (L) return L;
  L = { c: {}, dark: !!dark, kind: kind };
  if (dark) {
    L.key = [0.58, 0.54, 0.86]; L.amb = rgb('#3e2f7c'); L.ambA = 0.2;
    L.sh = [0.22, 0.31, 0.44]; L.shAmb = rgb('#0d2a3a'); L.shA = 0.38;
    L.rim = '#ffae52'; L.ink = '#150e20'; L.rimA = 0.95; L.hi = '#c9b8ff';
  } else {
    L.key = [1, 0.985, 0.96]; L.amb = null; L.ambA = 0;
    L.sh = [0.74, 0.6, 0.7]; L.shAmb = rgb('#3a2850'); L.shA = 0.1;
    L.rim = BG_RIM[kind] || '#fff0dc'; L.ink = '#2a1b1f'; L.rimA = 0.85; L.hi = '#fff6ea';
  }
  if (opt === 'warm') { L.key = [1.04, 0.95, 0.84]; L.rim = '#ffd09a'; }
  if (opt === 'fire') { L.key = [0.5, 0.4, 0.62]; L.amb = rgb('#3a2050'); L.ambA = 0.3; L.sh = [0.2, 0.18, 0.32]; L.shAmb = rgb('#140c24'); L.shA = 0.4; L.rim = '#ff8a2a'; L.rimA = 1; L.ink = '#120a14'; }
  if (opt === 'backlit') { L.key = [0.3, 0.27, 0.4]; L.amb = rgb('#1c1830'); L.ambA = 0.35; L.sh = [0.16, 0.15, 0.24]; L.shAmb = rgb('#0c0a18'); L.shA = 0.5; L.rimA = 1; L.ink = '#0c0812'; if (!dark && kind !== 'ship') L.rim = '#ffd8a8'; }
  if (opt === 'dawnback') { L.key = [0.42, 0.36, 0.44]; L.amb = rgb('#2c2034'); L.ambA = 0.3; L.sh = [0.2, 0.17, 0.25]; L.shAmb = rgb('#140c1c'); L.shA = 0.45; L.rim = '#ffd49a'; L.rimA = 1; L.ink = '#120a10'; }
  if (opt === 'lampBack') { L.key = [0.5, 0.42, 0.5]; L.amb = rgb('#241a34'); L.ambA = 0.3; L.sh = [0.24, 0.2, 0.3]; L.shAmb = rgb('#100a1a'); L.shA = 0.4; L.rim = '#ffb060'; L.rimA = 1; L.ink = '#0e0810'; }
  if (opt === 'red') { L.key = [0.95, 0.5, 0.5]; L.amb = rgb('#5a1018'); L.ambA = 0.2; L.sh = [0.35, 0.16, 0.2]; L.shAmb = rgb('#200610'); L.shA = 0.3; L.rim = '#ff6040'; L.ink = '#1a0608'; }
  if (opt === 'lamp') { L.key = [1.05, 0.9, 0.7]; L.sh = [0.45, 0.36, 0.42]; L.shAmb = rgb('#1c1420'); L.shA = 0.25; L.rim = '#ffc070'; }
  if (opt === 'memory') { L.key = [1.04, 1.0, 0.94]; L.wash = rgb('#e8d6b4'); L.washA = 0.38; L.desat = 0.5; L.sh = [0.82, 0.74, 0.76]; L.rim = '#fff4dc'; L.ink = '#5a4a44'; }
  if (opt === 'gallery') { L.key = [0.56, 0.54, 0.7]; L.amb = rgb('#141a30'); L.ambA = 0.3; L.sh = [0.14, 0.15, 0.24]; L.shAmb = rgb('#06080f'); L.shA = 0.5; L.rim = dark ? '#ffae52' : '#ffd890'; L.ink = '#07060c'; }
  LIGHTS[key] = L;
  return L;
}
function post(L, r) {
  if (L.desat) { var g = r[0] * 0.3 + r[1] * 0.59 + r[2] * 0.11; r = [lerp(r[0], g, L.desat), lerp(r[1], g, L.desat), lerp(r[2], g, L.desat)]; }
  if (L.wash) r = mixa(r, L.wash, L.washA);
  return r;
}
function lc(L, c) {
  var v = L.c['l' + c];
  if (v) return v;
  var a = rgb(c);
  var r = [a[0] * L.key[0], a[1] * L.key[1], a[2] * L.key[2]];
  if (L.amb) r = mixa(r, L.amb, L.ambA);
  v = css(post(L, r));
  L.c['l' + c] = v;
  return v;
}
function ls(L, c) {
  var v = L.c['s' + c];
  if (v) return v;
  var a = rgb(c);
  var r = [a[0] * L.sh[0], a[1] * L.sh[1], a[2] * L.sh[2]];
  r = mixa(r, L.shAmb, L.shA);
  v = css(post(L, r));
  L.c['s' + c] = v;
  return v;
}
function lhi(L, c, amt) {
  var k = 'h' + c + amt;
  var v = L.c[k];
  if (v) return v;
  var a = rgb(c);
  var r = [a[0] * L.key[0], a[1] * L.key[1], a[2] * L.key[2]];
  if (L.amb) r = mixa(r, L.amb, L.ambA);
  r = mixa(r, rgb(L.hi), amt);
  v = css(post(L, r));
  L.c[k] = v;
  return v;
}
function rimc(L, a) { return rgba(L.rim, (a === undefined ? 1 : a) * L.rimA); }

/* ------------------------------------------------------- offscreen cache */
var CACHE = new Map();
function mkCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}
function layer(key, w, h, fn) {
  key = key + '|' + Math.round(w) + 'x' + Math.round(h);
  var c = CACHE.get(key);
  if (c) { CACHE.delete(key); CACHE.set(key, c); return c; }
  c = mkCanvas(w, h);
  var x = c.getContext('2d');
  x.scale(c.width / VW, c.height / VH);
  fn(x);
  CACHE.set(key, c);
  if (CACHE.size > 56) CACHE.delete(CACHE.keys().next().value);
  return c;
}
/* soft painted backdrop: painted small, then blurred up */
function softLayer(key, w, h, blur, fn) {
  return layer('soft:' + key, w, h, function (x) {
    var sc = mkCanvas(480, 270), sx = sc.getContext('2d');
    sx.scale(480 / VW, 270 / VH);
    fn(sx);
    x.save();
    var b = blur * (w / VW);
    try { x.filter = 'blur(' + b.toFixed(1) + 'px)'; } catch (e) {}
    x.drawImage(sc, -30, -30, VW + 60, VH + 60);
    x.restore();
  });
}
function begin(ctx, w, h) { ctx.save(); ctx.scale(w / VW, h / VH); }
function end(ctx) { ctx.restore(); }
function blit(ctx, c, zoom, cx, cy, ox, oy) {
  zoom = zoom || 1; cx = cx === undefined ? VW / 2 : cx; cy = cy === undefined ? VH / 2 : cy;
  ctx.save();
  ctx.translate(cx + (ox || 0), cy + (oy || 0));
  ctx.scale(zoom, zoom);
  ctx.drawImage(c, -cx, -cy, VW, VH);
  ctx.restore();
}

/* ------------------------------------------------------- path helpers */
/* Catmull-Rom spline through points [x, y, corner?]. Corner points get straight tangents. */
function spl(path, pts, closed, k) {
  k = k === undefined ? 1 / 6 : k;
  var n = pts.length;
  function P(i) { return closed ? pts[((i % n) + n) % n] : pts[clamp(i, 0, n - 1)]; }
  path.moveTo(pts[0][0], pts[0][1]);
  var last = closed ? n : n - 1;
  for (var i = 0; i < last; i++) {
    var p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    var c1x, c1y, c2x, c2y;
    if (p1[2]) { c1x = p1[0] + (p2[0] - p1[0]) / 3; c1y = p1[1] + (p2[1] - p1[1]) / 3; }
    else { c1x = p1[0] + (p2[0] - p0[0]) * k; c1y = p1[1] + (p2[1] - p0[1]) * k; }
    if (p2[2]) { c2x = p2[0] + (p1[0] - p2[0]) / 3; c2y = p2[1] + (p1[1] - p2[1]) / 3; }
    else { c2x = p2[0] - (p3[0] - p1[0]) * k; c2y = p2[1] - (p3[1] - p1[1]) * k; }
    path.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
  if (closed) path.closePath();
  return path;
}
function P2(pts, open, k) { return spl(new Path2D(), pts, !open, k); }
function polyP(pts) {
  var p = new Path2D();
  p.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.closePath();
  return p;
}
function tr(pts, dx, dy, sx, sy) {
  sx = sx === undefined ? 1 : sx; sy = sy === undefined ? sx : sy;
  return pts.map(function (q) { return [q[0] * sx + dx, q[1] * sy + dy, q[2]]; });
}
var BIG = 20000;
/* fill the part of `path` not covered by `path` shifted by (dx, dy): a crescent on the opposite edge */
function crescent(ctx, path, dx, dy, style) {
  ctx.save();
  ctx.clip(path);
  var q = new Path2D();
  q.rect(-BIG, -BIG, 2 * BIG, 2 * BIG);
  q.addPath(path, new DOMMatrix([1, 0, 0, 1, dx, dy]));
  ctx.fillStyle = style;
  ctx.fill(q, 'evenodd');
  ctx.restore();
}
/* standard cel fill: flat base, hard shadow crescent, rim crescent, ink line */
function cel(ctx, path, L, base, o) {
  o = o || {};
  ctx.fillStyle = lc(L, base);
  ctx.fill(path);
  if (o.sh) crescent(ctx, path, o.sh[0], o.sh[1], ls(L, base));
  if (o.shFn) { ctx.save(); ctx.clip(path); ctx.fillStyle = ls(L, base); o.shFn(ctx); ctx.restore(); }
  if (o.hiFn) { ctx.save(); ctx.clip(path); ctx.fillStyle = lhi(L, base, o.hiA || 0.35); o.hiFn(ctx); ctx.restore(); }
  if (o.rim) crescent(ctx, path, o.rim[0], o.rim[1], rimc(L, o.rimA));
  if (o.lw) { ctx.strokeStyle = o.ink || L.ink; ctx.lineWidth = o.lw; ctx.stroke(path); }
}
/* outlined capsule chain (limbs, fingers): ink, shadow tone, then lit core shifted toward the light */
function limb(ctx, pts, wd, L, base, lw, lx, ly, noInk) {
  if (wd && wd.length) return limbT(ctx, pts, wd[0], wd[1], L, base, lw, lx, ly);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  function line() { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
  if (!noInk) { line(); ctx.strokeStyle = L.ink; ctx.lineWidth = wd + lw * 2; ctx.stroke(); }
  line(); ctx.strokeStyle = ls(L, base); ctx.lineWidth = wd; ctx.stroke();
  ctx.save(); ctx.translate(-(lx === undefined ? 1 : lx) * wd * 0.16, -(ly === undefined ? 0.3 : ly) * wd * 0.16);
  line(); ctx.strokeStyle = lc(L, base); ctx.lineWidth = wd * 0.62; ctx.stroke();
  ctx.restore();
}

function limbT(ctx, pts, w0, w1, L, base, lw, lx, ly) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  var n = pts.length - 1, i, wi;
  lx = lx === undefined ? 1 : lx; ly = ly === undefined ? 0.3 : ly;
  for (var pass = 0; pass < 3; pass++) {
    for (i = 0; i < n; i++) {
      wi = lerp(w0, w1, n > 1 ? i / (n - 1) : 0);
      ctx.beginPath();
      if (pass < 2) { ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); }
      else { var ox = -lx * wi * 0.16, oy = -ly * wi * 0.16; ctx.moveTo(pts[i][0] + ox, pts[i][1] + oy); ctx.lineTo(pts[i + 1][0] + ox, pts[i + 1][1] + oy); }
      ctx.strokeStyle = pass === 0 ? L.ink : (pass === 1 ? ls(L, base) : lc(L, base));
      ctx.lineWidth = pass === 0 ? wi + lw * 2 : (pass === 1 ? wi : wi * 0.62);
      ctx.stroke();
    }
  }
}
/* ------------------------------------------------------------- blinks
 * Deterministic schedule; a blink is three drawings (half, shut, half) like a cel blink.
 */
function blinkAt(t, seed) {
  var per = 4.3, k = Math.floor(t / per);
  for (var j = k - 1; j <= k + 1; j++) {
    if (j < 0) continue;
    var tb = j * per + 1.1 + hash(seed * 131 + j * 7) * 2.2;
    var d = t - tb;
    if (d >= 0 && d < 0.2) return d < 0.05 ? 0.55 : (d < 0.12 ? 1 : 0.5);
    if (hash(seed * 17 + j) > 0.78) { d -= 0.34; if (d >= 0 && d < 0.17) return d < 0.04 ? 0.55 : (d < 0.1 ? 1 : 0.5); }
  }
  return 0;
}

/* --------------------------------------------------------------- moods
 * lid: upper lid closure 0..1, low: lower lid raise, bi/bo: inner/outer brow y shift (neg = up),
 * mc: mouth corner droop (neg = smile), mo: mouth open, mw: mouth width, iris: iris scale
 */
var MOODS = {
  neutral: { lid: 0.2, low: 0.06, bi: 0, bo: 0, mc: 0.4, mo: 0, mw: 1, iris: 1 },
  tired:   { lid: 0.44, low: 0.12, bi: 0.8, bo: 2.2, mc: 1.4, mo: 0, mw: 0.95, iris: 1, bags: 1 },
  grief:   { lid: 0.4, low: 0.22, bi: -6.5, bo: 2.6, mc: 2.6, mo: 0.12, mw: 0.88, iris: 1, tear: 1, crease: 1, gaze: 0.3 },
  resolve: { lid: 0.3, low: 0.17, bi: 3.2, bo: -0.6, mc: 1.1, mo: 0, mw: 0.86, iris: 1, press: 1 },
  anger:   { lid: 0.24, low: 0.27, bi: 6.4, bo: -2.6, mc: 1.8, mo: 0.28, mw: 0.92, iris: 0.94, teeth: 1, crease: 1, knit: 1 },
  soft:    { lid: 0.33, low: 0.15, bi: -2.4, bo: 0.4, mc: -1.7, mo: 0, mw: 1.04, iris: 1 },
  fear:    { lid: -0.06, low: 0, bi: -6, bo: -4.4, mc: 0.6, mo: 0.4, mw: 0.74, iris: 0.8, crease: 1 },
  smile:   { lid: 0.3, low: 0.3, bi: -2, bo: 0, mc: -3.2, mo: 0.18, mw: 1.12, iris: 1, teeth: 1 },
  laugh:   { lid: 1, low: 0.3, bi: -3, bo: 0, mc: -3.6, mo: 0.75, mw: 1.15, iris: 1, teeth: 1, shut: 1 }
};
function mood(name) { return MOODS[name] || MOODS.neutral; }

/* ========================================================= CHARACTERS
 * Face units: head drawn facing screen-left (3/4 view), crown y≈-62, chin y≈60.
 * facing: +1 = faces screen-left (as designed), -1 = mirrored to face screen-right.
 */
var CH = {
  ilse: {
    id: 'ilse', fem: 1, age: 0.6, seed: 11, facing: -1, bg: 'apartment',
    skin: '#eecbb3', hair: '#6c2b1f', hairHi: '#b0553b', brow: '#4b1d14', eye: '#8f99a1', eyeDark: '#3d454c',
    style: 'bob', cloth: 'ilse', eyeW: 10.6, eyeH: 5.9, tilt: 0.5, browW: 2.0, lidAdd: 0.13, lash: 1, build: 0.93,
    face: { jx: 28.5, jy: 40, cx: -15, cy: 59 }, lines: 1,
    fig: { coat: '#3a3d45', coatLen: 70, pants: '#26282e', shoe: '#1c1a1c', sleeve: '#3a3d45', sw: 9.4, collar: 'high', pin: 1 }
  },
  mira: {
    id: 'mira', fem: 1, age: 0, seed: 23, facing: 1, bg: 'apartment',
    skin: '#f5d6c0', hair: '#7a3220', hairHi: '#c46a46', brow: '#55210f', eye: '#7d9086', eyeDark: '#36443d',
    style: 'long', cloth: 'mira', eyeW: 11, eyeH: 7.1, tilt: 0.9, browW: 1.8, lidAdd: 0, lash: 1.15, build: 0.9, earring: 1,
    face: { jx: 27.5, jy: 39, cx: -15.5, cy: 58 },
    fig: { coat: '#5d6a3b', coatLen: 52, pants: '#2f3a3e', shoe: '#4a3426', sleeve: '#5d6a3b', sw: 9.6, collar: 'jacket', baggy: 1 }
  },
  kasimir: {
    id: 'kasimir', male: 1, age: 0.6, seed: 37, facing: 1, bg: 'hall',
    skin: '#7a4932', hair: '#1d1613', hairHi: '#4a3a32', brow: '#160f0c', eye: '#3e2618', eyeDark: '#140c08',
    style: 'crop', cloth: 'kasimir', eyeW: 10.2, eyeH: 5.7, tilt: -0.2, browW: 2.9, lidAdd: 0.04, lash: 0.4, build: 1.1,
    face: { jx: 33, jy: 42, cx: -14, cy: 62, sq: 1 }, scar: 1, grey: 1, nose: 'broad', sheen: 1, lines: 1,
    fig: { coat: '#8a4026', coatLen: 76, pants: '#2e231e', shoe: '#1e1612', sleeve: '#8a4026', sw: 11.6, collar: 'fur', trim: '#c58b3c' }
  },
  severin: {
    id: 'severin', male: 1, age: 1, seed: 53, facing: 1, bg: 'garden',
    skin: '#ebc7ae', hair: '#dedbd5', hairHi: '#fbfaf6', brow: '#cdc8c0', eye: '#62819c', eyeDark: '#2c3b48',
    style: 'swept', cloth: 'severin', eyeW: 9.8, eyeH: 5.0, tilt: -0.7, browW: 2.9, lidAdd: 0.14, lash: 0.3, build: 1.05,
    face: { jx: 32, jy: 44, cx: -14, cy: 61, jowl: 1 }, mustache: 1, glasses: 1, nose: 'long', lines: 2,
    fig: { coat: '#1f2a48', coatLen: 50, pants: '#1b2340', shoe: '#0e0e12', sleeve: '#1f2a48', sw: 11, collar: 'gold', gold: '#d1a54a' }
  },
  juno: {
    id: 'juno', fem: 1, age: 0.3, seed: 71, facing: -1, bg: 'ship',
    skin: '#f1cdac', hair: '#dfb95c', hairHi: '#fff2b8', brow: '#9a7636', eye: '#4b8fb4', eyeDark: '#1f3e52',
    style: 'undercut', cloth: 'juno', eyeW: 10.4, eyeH: 5.7, tilt: 0.3, browW: 1.9, lidAdd: 0.03, lash: 0.8, build: 0.98,
    face: { jx: 30, jy: 41, cx: -14.5, cy: 59.5 }, freckles: 1,
    fig: { coat: '#5c3d2a', coatLen: 48, pants: '#4a4c3e', shoe: '#2a2018', sleeve: '#5c3d2a', sw: 10, collar: 'jacket', patches: 1 }
  },
  teo: {
    id: 'teo', male: 1, age: 0, seed: 89, facing: -1, bg: 'detention',
    skin: '#dfb592', hair: '#141016', hairHi: '#3c3444', brow: '#141016', eye: '#3a281c', eyeDark: '#140c08',
    style: 'curly', cloth: 'teo', eyeW: 10.2, eyeH: 5.9, tilt: 0.15, browW: 2.4, lidAdd: 0.02, lash: 0.6, build: 0.84,
    face: { jx: 28, jy: 41, cx: -14, cy: 61, thin: 2.4 }, thinNeck: 1,
    fig: { coat: '#7a7e86', coatLen: 48, pants: '#2a2c30', shoe: '#222022', sleeve: '#7a7e86', sw: 9, collar: 'crew', thin: 1 }
  },
  daniel: {
    id: 'daniel', male: 1, age: 0.1, seed: 97, facing: 1, bg: 'hall',
    skin: '#f0cdb0', hair: '#e2c06c', hairHi: '#fff4c4', brow: '#a8843e', eye: '#4f86b8', eyeDark: '#1c3550',
    style: 'pilot', cloth: 'pilot', eyeW: 10.2, eyeH: 5.4, tilt: 0.1, browW: 2.4, lidAdd: 0, lash: 0.4, build: 1.05,
    face: { jx: 31, jy: 42, cx: -14, cy: 61, sq: 1 },
    fig: { coat: '#2a3a5e', coatLen: 50, pants: '#22304e', shoe: '#111', sleeve: '#2a3a5e', sw: 11, collar: 'gold', gold: '#d1a54a' }
  },
  chair: {
    id: 'chair', fem: 1, age: 1, seed: 101, facing: 1, bg: 'hall',
    skin: '#e9cfba', hair: '#c9c5bf', hairHi: '#f4f2ee', brow: '#9c958c', eye: '#6c6a62', eyeDark: '#2c2a26',
    style: 'bun', cloth: 'chair', eyeW: 9.8, eyeH: 4.8, tilt: -0.4, browW: 2.0, lidAdd: 0.2, lash: 0.6, build: 0.95, lines: 2,
    face: { jx: 29, jy: 42, cx: -15, cy: 59, jowl: 1 },
    fig: { coat: '#e6dec8', coatLen: 92, pants: '#2a2a30', shoe: '#1a1a1a', sleeve: '#e6dec8', sw: 9.6, collar: 'stole', gold: '#c9a046' }
  }
};
function variant(base, over) { var o = {}, k; for (k in base) o[k] = base[k]; for (k in over) o[k] = over[k]; o._g = null; return o; }
CH.ilseYoung = variant(CH.ilse, { id: 'ilseYoung', age: 0, lidAdd: 0.02, lines: 0, cloth: 'concordat', eyeH: 6.4, style: 'bobLong' });
CH.kasimirYoung = variant(CH.kasimir, { id: 'kasimirYoung', age: 0.1, scar: 0, grey: 0, lines: 0, cloth: 'pilot', lidAdd: 0, fig: CH.daniel.fig });
CH.officer = variant(CH.kasimir, { id: 'officer', skin: '#d9b498', hair: '#2a2420', grey: 0, scar: 0, sheen: 0, cloth: 'severin', fig: { coat: '#1c2440', coatLen: 50, pants: '#161c34', shoe: '#0c0c10', sleeve: '#1c2440', sw: 11, collar: 'gold', gold: '#b89040', cap: 1 } });
function chr(k) { return CH[k] || CH.ilse; }

/* ----------------------------------------------------- hair styles */
function tipsWedges(pts, cx, cy, len) {
  var out = [];
  for (var i = 0; i < pts.length; i++) {
    var q = pts[i];
    if (!q[2]) continue;
    var dx = cx - q[0], dy = cy - q[1], d = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / d, uy = dy / d, L = d * len;
    out.push(polyP([[q[0] + ux * 2, q[1] + uy * 2], [q[0] + ux * L - uy * 2.4, q[1] + uy * L + ux * 2.4], [q[0] + ux * L * 1.1, q[1] + uy * L * 1.1], [q[0] + ux * L + uy * 1.2, q[1] + uy * L - ux * 1.2]]));
  }
  return out;
}
var HAIR = {
  bob: function () {
    var back = [[-36, -48], [-22, -64], [2, -70], [28, -66], [48, -50], [57, -24], [60, 4], [59, 30], [57, 47, 1], [51, 41], [46, 53, 1], [40, 43], [33, 51, 1], [27, 38], [10, 30], [-20, 32], [-37, 40], [-44, 53, 1], [-46.5, 36], [-47, 12], [-45, -14], [-42, -34]];
    var front = [[16, -64], [34, -60], [48, -44], [54, -18], [55, 10], [53, 32], [49, 48, 1], [44, 39], [38, 50, 1], [33, 38], [27, 47, 1], [24.5, 30], [23.5, 12], [25, -4], [22, -20], [16, -21], [9, -15, 1], [4, -27], [-4, -19, 1], [-10, -30], [-20, -17, 1], [-24, -31], [-34, -15], [-41.5, -3, 1], [-42, -22], [-40, -40], [-31, -56], [-12, -67], [6, -67]];
    var hi = [[-31, -48], [-16, -59], [4, -62], [24, -59], [40, -48], [44, -38], [36, -42, 1], [31, -37], [25, -46, 1], [19, -40], [12, -50, 1], [5, -43], [-2, -52, 1], [-9, -44], [-16, -51, 1], [-22, -43], [-30, -41]];
    var bv = [[-46, -30], [-38, -58], [-10, -72], [22, -72], [48, -58], [56, -30], [57, 10], [56, 44, 1], [48, 40], [42, 50, 1], [34, 42], [24, 50, 1], [16, 42], [6, 50, 1], [-4, 42], [-14, 50, 1], [-22, 42], [-32, 50, 1], [-38, 40], [-44, 46, 1], [-48, 14]];
    return { back: back, front: front, hi: hi, bv: bv, tipC: [0, -62], strands: [[[-30, -40], [-40, -18], [-44, 2]], [[40, -40], [50, -10], [52, 20]]] };
  },
  bobLong: function () {
    var h = HAIR.bob();
    h.back = tr(h.back, 0, 0, 1, 1).map(function (q) { return q[1] > 20 ? [q[0], q[1] + 14, q[2]] : q; });
    h.front = h.front.map(function (q) { return q[1] > 20 ? [q[0], q[1] + 10, q[2]] : q; });
    return h;
  },
  long: function () {
    var back = [[-38, -46], [-24, -66], [4, -72], [30, -68], [50, -52], [58, -24], [60, 8], [63, 46], [68, 86], [72, 124], [66, 150, 1], [60, 132], [54, 156, 1], [48, 128], [40, 146, 1], [36, 110], [30, 60], [0, 40], [-30, 60], [-40, 96], [-44, 128, 1], [-48, 104], [-56, 136, 1], [-56, 100], [-52, 60], [-49, 24], [-47, -8], [-44, -30]];
    var front = [[4, -66], [22, -64], [38, -55], [46, -38], [44, -20], [39, -8], [33.5, -5], [28, -8], [24, -16, 1], [21, -6, 1], [17, -20], [10, -12, 1], [6, -27], [-2, -16, 1], [-8, -28], [-14, -11, 1], [-18, -26], [-26, -13, 1], [-30, -22], [-34, -4], [-35, 20], [-34, 42], [-38, 64, 1], [-42, 44], [-45, 16], [-45, -14], [-42, -34], [-32, -54], [-14, -68]];
    var hi = [[-34, -46], [-18, -60], [2, -64], [22, -61], [38, -50], [42, -42], [34, -44, 1], [28, -38], [22, -48, 1], [16, -41], [8, -52, 1], [1, -44], [-6, -53, 1], [-12, -45], [-19, -51, 1], [-25, -42], [-33, -40]];
    var bv = [[-46, -30], [-38, -58], [-10, -72], [22, -72], [48, -58], [56, -30], [56, 0], [48, 30], [30, 50], [24, 58], [32, 92], [38, 140], [30, 166, 1], [22, 150], [14, 172, 1], [6, 148], [-4, 164, 1], [-8, 130], [-14, 100], [-8, 60], [-16, 50], [-36, 30], [-46, 0]];
    return { back: back, front: front, hi: hi, bv: bv, tipC: [2, -62], tie: [24, 56],
      strands: [[[14, -64], [22, -70], [30, -69]], [[30.5, -6], [32.5, 8], [30, 26]], [[-40, -22], [-47, 10], [-50, 42]]] };
  },
  crop: function () {
    var front = [[-31.5, -43], [-31, -50], [-20, -60], [2, -66], [28, -62], [45, -46], [50, -22], [48, 0], [43, 13], [40, 4, 1], [38, -1], [33, -4], [28, -5], [25.5, 8], [22.5, 9, 1], [22, -6], [18, -24], [8, -33], [-6, -38], [-20, -40]];
    var bv = [[-40, -20], [-36, -50], [-12, -66], [18, -66], [44, -52], [52, -24], [50, 6], [40, 18], [6, 22], [-30, 18]];
    return { back: null, front: front, hi: null, bv: bv, tipC: [0, -60], short: 1, strands: [] };
  },
  swept: function () {
    var front = [[-30, -46], [-31.5, -53], [-24, -61], [-8, -66], [12, -66.5], [32, -60], [46, -49], [53, -34], [55, -16], [52, 0], [47, 9, 1], [44, 2], [40, -1], [35, -4], [30, -7], [25.5, -14], [22.5, -24, 1], [12, -33], [-2, -40], [-16, -44]];
    var hi = [[-27, -52], [-10, -60], [10, -61], [28, -56], [40, -48], [34, -48, 1], [26, -51], [20, -47, 1], [12, -55], [5, -49, 1], [-4, -56], [-11, -50, 1], [-20, -51]];
    var bv = [[-42, -20], [-38, -50], [-12, -64], [18, -64], [46, -52], [54, -24], [52, 10], [42, 24], [6, 26], [-34, 20]];
    return { back: null, front: front, hi: hi, bv: bv, tipC: [10, -60], comb: [
      [[-24, -52], [-4, -60], [20, -59], [40, -49], [50, -35]], [[-14, -46], [8, -52], [30, -48], [45, -34], [51, -16]], [[2, -40], [24, -40], [39, -28], [47, -8]]],
      strands: [[[-26, -58], [-16, -66], [-2, -67]]] };
  },
  bun: function () {
    var h = HAIR.swept();
    h.back = [[38, -60], [56, -64], [66, -50], [64, -34], [52, -28], [42, -36]];
    h.bv = h.bv.slice();
    return h;
  },
  undercut: function () {
    var front = [[44, -36], [44, -52], [26, -68], [2, -74], [-22, -68], [-37, -52], [-44, -30], [-44, -8], [-39, 15, 1], [-37, -6], [-31, -15], [-27, -1, 1], [-22, -20], [-12, -25], [-5, -16, 1], [-1, -28], [8, -33], [20, -37], [34, -38]];
    var shave = [[20, -34], [40, -44], [47.5, -30], [48, -8], [45, 6], [40, 12], [34, 0], [28, -6], [23, -16]];
    var hi = [[-36, -46], [-20, -62], [2, -67], [22, -62], [34, -52], [28, -50, 1], [22, -55], [16, -47, 1], [10, -57], [3, -48, 1], [-4, -58], [-10, -48, 1], [-18, -56], [-26, -44]];
    var bv = [[-36, -40], [-24, -62], [-4, -72], [22, -72], [42, -58], [48, -36], [42, -14], [24, -22], [6, -26], [-14, -22], [-30, -26]];
    return { back: null, front: front, hi: hi, bv: bv, shave: shave, tipC: [10, -64], strands: [[[-34, -32], [-41, -8], [-38, 16]], [[-8, -40], [-12, -26], [-8, -14]]] };
  },
  curly: function () {
    return { curly: 1, tipC: [0, -60],
      backC: [[-38, -38, 12], [-30, -52, 13], [-14, -61, 13], [6, -64, 14], [26, -61, 13], [42, -50, 13], [53, -34, 12], [57, -16, 11], [54, 2, 10], [47, 14, 8.5], [-44, -22, 10], [-10, -46, 16], [16, -46, 16], [34, -32, 14], [-42, -6, 7]],
      frontC: [[-22, -50, 12], [-2, -55, 13], [18, -52, 13], [35, -42, 12], [44, -27, 10.5], [46, -12, 9], [-36, -40, 10.5], [-37, -18, 7], [-33, -30, 8.5], [-24, -36, 9], [-14, -33, 8.5], [-4, -36, 9], [6, -31, 8.5], [16, -35, 9], [25, -28, 8], [30, -16, 7], [-12, -22, 6.2], [9, -21, 5.6], [-26, -24, 5.5], [32, -5, 5.5]],
      strands: [] };
  },
  pilot: function () {
    var front = [[-31, -44], [-34, -54], [-22, -68], [2, -73], [28, -67], [46, -51], [51, -27], [47, -4], [41, 3, 1], [37, -3], [31, -6], [26, -12], [22, -24], [12, -30], [4, -26], [-2, -18, 1], [-6, -30], [-16, -34], [-22, -26, 1], [-24, -38]];
    var hi = [[-30, -52], [-14, -64], [6, -66], [26, -61], [38, -52], [30, -50, 1], [24, -55], [18, -47, 1], [10, -57], [2, -49, 1], [-6, -57], [-12, -48, 1], [-22, -52]];
    var bv = [[-40, -20], [-36, -52], [-12, -68], [18, -68], [44, -54], [52, -24], [50, 6], [40, 16], [6, 18], [-30, 14]];
    return { back: null, front: front, hi: hi, bv: bv, tipC: [6, -62], strands: [[[-4, -30], [-6, -22], [-3, -15]]] };
  }
};

/* --------------------------------------------------------- geometry */
function geo(ch) {
  if (ch._g) return ch._g;
  var f = ch.face, th = f.thin || 0, g = {};
  var pts = [[-31, -46], [-36.8, -26], [-38.2, -9], [-35.8, 1.5, 1], [-38.8, 12], [-36.4 + th, 23], [-32.4 + th * 0.6, 35], [-27.6 + (f.sq ? 1 : 0), 46.5]];
  if (f.sq) pts.push([f.cx - 8, f.cy - 2.5, 1], [f.cx + 2.5, f.cy, 1]);
  else pts.push([f.cx - 6.5, f.cy - 4.5], [f.cx, f.cy, 1]);
  pts.push([f.cx + 11, f.cy - 2.5], [f.jx - 8, f.jy + 8.5]);
  pts.push(f.jowl ? [f.jx, f.jy] : [f.jx, f.jy, 1]);
  pts.push([f.jx + 5, 22], [44, 2], [46.5, -22], [38, -47], [16, -61.5], [-12, -59]);
  g.facePts = pts;
  g.face = P2(pts);
  var nk = ch.male ? (ch.thinNeck ? [[-11.5, 48], [-12.5, 70], [-14, 100], [22, 100], [21.5, 70], [21, 30]] : [[-13.5, 48], [-14.5, 70], [-16, 100], [29, 100], [28, 70], [27, 32]])
    : [[-10.5, 46], [-11.5, 68], [-13, 100], [23.5, 100], [23, 68], [22.5, 30]];
  g.neck = polyP(nk);
  g.ear = P2([[29.5, -1], [33.5, -4.2], [38.6, -1.2], [40.6, 7], [39.2, 16], [35.2, 22.4], [31, 21.6], [30.4, 14]]);
  g.sideSh = polyP([[32, -64], [27, -34], [25, -8], [28, 6], [23, 22], [13, 38], [1, 51], [-6, 66], [80, 66], [80, -64]]);
  g.sideShDark = polyP([[22, -64], [16, -34], [15, -6], [18, 6], [10, 22], [0, 36], [-10, 50], [-16, 66], [80, 66], [80, -64]]);
  var H = HAIR[ch.style]();
  g.hair = H;
  if (H.back) g.hairBack = P2(H.back);
  if (H.front) { g.hairFront = P2(H.front); g.wedges = tipsWedges(H.front, H.tipC[0], H.tipC[1], 0.32); }
  if (H.back) g.wedgesB = tipsWedges(H.back, 6, -20, 0.22);
  if (H.hi) g.hairHi = P2(H.hi);
  if (H.bv) g.hairBV = P2(H.bv);
  if (H.shave) g.shave = P2(H.shave);
  if (H.back && ch.style === 'bun') g.hairBack = P2(H.back);
  var r = rng(ch.seed * 7 + 3);
  g.flecks = [];
  if (ch.grey) for (var i = 0; i < 90; i++) {
    var a = r(), b = r();
    var x = lerp(-32, 50, a), y = lerp(-66, 12, b);
    var temple = (x > 14 && y > -40) || (x < -20) ? 1 : 0.45;
    if (r() < temple) g.flecks.push([x, y, (r() - 0.5) * 1.2, 1.4 + r() * 1.6]);
  }
  g.freck = [];
  if (ch.freckles) {
    for (var j = 0; j < 34; j++) {
      var zx = r(), zy = r(), side = r();
      var fx = side < 0.55 ? lerp(-12, 14, zx) : (side < 0.8 ? lerp(-35, -27, zx) : lerp(-23, -15, zx));
      var fy = lerp(11, 25, zy);
      if (fx > -24 && fx < -12 && fy > 21) continue;
      g.freck.push([fx, fy, 0.38 + r() * 0.42]);
    }
  }
  g.stubble = [];
  if (g.shave) for (var s = 0; s < 70; s++) g.stubble.push([lerp(20, 48, r()), lerp(-44, 12, r())]);
  ch._g = g;
  return g;
}

/* ============================================================= HEAD
 * st = { L, lw (ink width in face units), m (mood), bl (blink 0..1), t, detail (0..2),
 *        rimW, dark, glint }
 */
function bez(a, b, c, d, t) {
  var u = 1 - t;
  return [u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
          u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]];
}
function bezLine(ctx, a, b, c, d, t0, t1, dy, n) {
  n = n || 10;
  ctx.beginPath();
  for (var i = 0; i <= n; i++) {
    var q = bez(a, b, c, d, lerp(t0, t1, i / n));
    if (i === 0) ctx.moveTo(q[0], q[1] + (dy || 0)); else ctx.lineTo(q[0], q[1] + (dy || 0));
  }
}

function hairCel(ctx, path, ch, st, wedges, hi) {
  var L = st.L;
  ctx.fillStyle = lc(L, ch.hair);
  ctx.fill(path);
  crescent(ctx, path, -5, -7.5, ls(L, ch.hair));
  if (st.detail > 0 && wedges && wedges.length) {
    ctx.save(); ctx.clip(path); ctx.fillStyle = ls(L, ch.hair);
    for (var i = 0; i < wedges.length; i++) ctx.fill(wedges[i]);
    ctx.restore();
  }
  if (st.detail > 0 && hi) {
    ctx.save(); ctx.clip(path); ctx.fillStyle = lc(L, ch.hairHi); ctx.globalAlpha = L.dark ? 0.55 : 0.8; ctx.fill(hi); ctx.restore();
  }
  crescent(ctx, path, -st.rimW, st.rimW * 0.55, rimc(L, 0.95));
  ctx.lineWidth = st.lw; ctx.strokeStyle = L.ink; ctx.stroke(path);
}

function curls(ctx, list, ch, st, rimSide) {
  var L = st.L, i, c;
  ctx.fillStyle = L.ink;
  for (i = 0; i < list.length; i++) { c = list[i]; ctx.beginPath(); ctx.arc(c[0], c[1], c[2] + st.lw, 0, TAU); ctx.fill(); }
  for (i = 0; i < list.length; i++) {
    c = list[i];
    ctx.fillStyle = ls(L, ch.hair); ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, TAU); ctx.fill();
    ctx.fillStyle = lc(L, ch.hair); ctx.beginPath(); ctx.arc(c[0] - c[2] * 0.2, c[1] - c[2] * 0.24, c[2] * 0.8, 0, TAU); ctx.fill();
  }
  if (st.detail > 0) {
    ctx.lineCap = 'round';
    for (i = 0; i < list.length; i++) {
      c = list[i];
      ctx.strokeStyle = lc(L, ch.hairHi); ctx.lineWidth = st.lw * 1.1;
      ctx.beginPath(); ctx.arc(c[0] - c[2] * 0.2, c[1] - c[2] * 0.2, c[2] * 0.55, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
      ctx.strokeStyle = L.ink; ctx.lineWidth = st.lw * 0.7;
      ctx.beginPath(); ctx.arc(c[0] + c[2] * 0.15, c[1] + c[2] * 0.1, c[2] * 0.45, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
      if (c[0] > rimSide) {
        ctx.strokeStyle = rimc(L, 0.9); ctx.lineWidth = st.rimW * 0.8;
        ctx.beginPath(); ctx.arc(c[0], c[1], c[2] - st.rimW * 0.3, -Math.PI * 0.45, Math.PI * 0.2); ctx.stroke();
      }
    }
  }
}

function strands(ctx, ch, st) {
  var H = geo(ch).hair, L = st.L;
  if (!H.strands || !H.strands.length || st.detail < 1) return;
  var tq = q12(st.t);
  ctx.lineCap = 'round';
  for (var i = 0; i < H.strands.length; i++) {
    var s = H.strands[i];
    var sw = Math.sin(tq * 1.5 + i * 1.9) * 1.3 + Math.sin(tq * 0.83 + i * 4.1) * 0.7;
    var a = s[0], b = [s[1][0] + sw * 0.5, s[1][1] + Math.abs(sw) * 0.15], c = [s[2][0] + sw, s[2][1] + sw * 0.25];
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? lc(L, ch.hair) : L.ink;
      ctx.lineWidth = pass ? 1.1 : 1.1 + st.lw * 1.6;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], (b[0] + c[0]) / 2, (b[1] + c[1]) / 2); ctx.stroke();
      ctx.lineWidth = pass ? 0.55 : 0.55 + st.lw * 1.4;
      ctx.beginPath(); ctx.moveTo((b[0] + c[0]) / 2, (b[1] + c[1]) / 2); ctx.lineTo(c[0], c[1]); ctx.stroke();
    }
  }
}

function drawHairBack(ctx, ch, st) {
  var g = geo(ch);
  if (g.hair.curly) { curls(ctx, g.hair.backC, ch, st, 20); return; }
  if (g.hairBack) hairCel(ctx, g.hairBack, ch, st, g.wedgesB, null);
}

function drawFaceBase(ctx, ch, st) {
  var g = geo(ch), L = st.L;
  ctx.fillStyle = lc(L, ch.skin);
  ctx.fill(g.face);
  ctx.save();
  ctx.clip(g.face);
  if (g.shave) {
    ctx.fillStyle = lc(L, mixHex(ch.skin, ch.hair, 0.42));
    ctx.fill(g.shave);
    if (st.detail > 1) {
      ctx.fillStyle = ls(L, ch.hair);
      for (var s = 0; s < g.stubble.length; s++) ctx.fillRect(g.stubble[s][0], g.stubble[s][1], 0.5, 0.5);
    }
  }
  ctx.fillStyle = ls(L, ch.skin);
  ctx.fill(st.dark ? g.sideShDark : g.sideSh);
  if (g.hairFront && !g.hair.short) { ctx.save(); ctx.translate(2.5, 6.5); ctx.fill(g.hairFront); ctx.restore(); }
  if (g.hair.curly) {
    var fc = g.hair.frontC;
    for (var i = 0; i < fc.length; i++) { ctx.beginPath(); ctx.arc(fc[i][0] + 2.5, fc[i][1] + 5.5, fc[i][2], 0, TAU); ctx.fill(); }
  }
  if (g.hair.short && g.hairFront) { ctx.save(); ctx.translate(1.5, 3); ctx.fill(g.hairFront); ctx.restore(); }
  if (ch.sheen && st.detail > 0) {
    ctx.fillStyle = lhi(L, ch.skin, 0.32);
    ctx.beginPath(); ctx.ellipse(-16, -27, 8, 2.6, -0.15, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-31, 11, 2.2, 4.5, 0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-19, 13, 1.2, 4.2, 0.45, 0, TAU); ctx.fill();
  }
  ctx.restore();
  crescent(ctx, g.face, -st.rimW, 0, rimc(L, 0.95));
  ctx.lineWidth = st.lw; ctx.strokeStyle = L.ink; ctx.stroke(g.face);
  /* ear (near side) */
  cel(ctx, g.ear, L, ch.skin, { sh: [-2, -1.5], rim: [-st.rimW * 0.8, 0], lw: st.lw });
  if (st.detail > 0) {
    ctx.strokeStyle = ls(L, ch.skin); ctx.lineWidth = st.lw * 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(36, 2); ctx.quadraticCurveTo(32.5, 9, 35, 16); ctx.stroke();
    ctx.strokeStyle = L.ink; ctx.lineWidth = st.lw * 0.7;
    ctx.beginPath(); ctx.moveTo(35.5, 3.5); ctx.quadraticCurveTo(33, 9.5, 34.5, 15.5); ctx.stroke();
  }
  if (ch.earring && st.detail > 0) {
    ctx.strokeStyle = L.ink; ctx.lineWidth = 1.5 + st.lw;
    ctx.beginPath(); ctx.arc(33.2, 25.2, 2.3, 0, TAU); ctx.stroke();
    ctx.strokeStyle = lhi(L, '#cfd6de', 0.4); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(33.2, 25.2, 2.3, 0, TAU); ctx.stroke();
    ctx.fillStyle = rimc(L, 1); ctx.beginPath(); ctx.arc(34.6, 24.2, 0.6, 0, TAU); ctx.fill();
  }
}

/* ------------------------------------------------------------- eyes */
function drawEye(ctx, ch, st, cx, cy, side, sx) {
  var L = st.L, m = st.m, W = ch.eyeW, H = ch.eyeH, lw = st.lw;
  var lid = m.lid + (m.shut ? 0 : (ch.lidAdd || 0) * (m.lid < 0.05 ? 0.3 : 1));
  if (m.shut) lid = 1;
  lid = lid + (1 - clamp(lid, 0, 1)) * st.bl;
  var low = m.low * (1 - st.bl);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(side * sx, 1);
  var I = [-W, 0.8], O = [W, -ch.tilt];
  var a = clamp(lid, 0, 1), wide = lid < 0 ? -lid : 0;
  var cl1 = m.shut ? [-0.5 * W, -0.9 * H] : [-0.5 * W, 0.62 * H], cl2 = m.shut ? [0.4 * W, -0.95 * H] : [0.4 * W, 0.55 * H];
  var u1 = [lerp(-0.62 * W, cl1[0], a), lerp(-1.32 * H * (1 + wide), cl1[1], a)];
  var u2 = [lerp(0.32 * W, cl2[0], a), lerp(-1.38 * H * (1 + wide), cl2[1], a)];
  var l1 = [-0.42 * W, 0.84 * H * (1 - low)], l2 = [0.48 * W, 0.9 * H * (1 - low)];
  var ink = L.ink;
  if (st.detail < 1) {
    ctx.strokeStyle = ink; ctx.lineCap = 'round'; ctx.lineWidth = lw * 2.2;
    ctx.beginPath(); ctx.moveTo(I[0], I[1]); ctx.bezierCurveTo(u1[0], u1[1], u2[0], u2[1], O[0], O[1]); ctx.stroke();
    if (a < 0.8) { ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(-0.15 * W, 0.15 * H, H * 0.55, H * 0.75, 0, 0, TAU); ctx.fill(); }
    ctx.restore();
    return;
  }
  if (a < 0.93) {
    var white = new Path2D();
    white.moveTo(I[0], I[1]);
    white.bezierCurveTo(u1[0], u1[1], u2[0], u2[1], O[0], O[1]);
    white.bezierCurveTo(l2[0], l2[1], l1[0], l1[1], I[0], I[1]);
    ctx.fillStyle = lc(L, '#f7f2ea');
    ctx.fill(white);
    ctx.save();
    ctx.clip(white);
    var R = H * 1.04 * m.iris, gx = -0.13 * W + (m.gaze || 0) * W * 0.25, gy = 0.1 * H + (m.gaze ? H * 0.2 : 0);
    ctx.fillStyle = lc(L, ch.eye);
    ctx.beginPath(); ctx.arc(gx, gy, R, 0, TAU); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(gx, gy, R, 0, TAU); ctx.clip();
    ctx.fillStyle = ls(L, ch.eye); ctx.fillRect(gx - R, gy - R, 2 * R, R * 0.95);
    if (st.detail > 1) {
      ctx.fillStyle = lhi(L, ch.eye, 0.35);
      ctx.beginPath(); ctx.ellipse(gx + R * 0.1 * side, gy + R * 0.62, R * 0.62, R * 0.36, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = ls(L, ch.eye); ctx.lineWidth = lw * 0.5;
      for (var k = 0; k < 7; k++) {
        var an = Math.PI * (0.15 + k * 0.1);
        ctx.beginPath(); ctx.moveTo(gx + Math.cos(an) * R * 0.48, gy + Math.sin(an) * R * 0.48); ctx.lineTo(gx + Math.cos(an) * R * 0.85, gy + Math.sin(an) * R * 0.85); ctx.stroke();
      }
    }
    ctx.restore();
    ctx.fillStyle = lc(L, ch.eyeDark);
    ctx.beginPath(); ctx.arc(gx, gy, R * (m.iris < 0.9 ? 0.32 : 0.42), 0, TAU); ctx.fill();
    ctx.strokeStyle = lc(L, ch.eyeDark); ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.arc(gx, gy, R, 0, TAU); ctx.stroke();
    /* lid shadow band */
    ctx.fillStyle = ls(L, '#f2e6dc');
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(I[0], I[1]); ctx.bezierCurveTo(u1[0], u1[1], u2[0], u2[1], O[0], O[1]);
    ctx.lineTo(O[0], O[1] + H * 0.32);
    ctx.bezierCurveTo(u2[0], u2[1] + H * 0.36, u1[0], u1[1] + H * 0.36, I[0], I[1] + H * 0.25);
    ctx.fill();
    ctx.globalAlpha = 1;
    /* highlights (world-consistent: toward the light) */
    var hx = -0.36 * R * side;
    ctx.fillStyle = L.dark ? rimc(L, 1) : '#ffffff';
    ctx.beginPath(); ctx.ellipse(gx + hx, gy - R * 0.38, R * 0.27, R * 0.22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = L.dark ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(gx - hx * 0.55, gy + R * 0.42, R * 0.11, 0, TAU); ctx.fill();
    if (m.tear) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = lw * 1.1; ctx.lineCap = 'round';
      bezLine(ctx, I, l1, l2, O, 0.15, 0.8, -lw * 0.9, 10); ctx.stroke();
    }
    ctx.restore();
  }
  /* lid line, lash wedge, lower lid, crease */
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;
  ctx.lineWidth = lw * (a >= 0.93 ? 2.0 : 2.5);
  ctx.beginPath(); ctx.moveTo(I[0] + 0.6, I[1]);
  ctx.bezierCurveTo(u1[0], u1[1], u2[0], u2[1], O[0], O[1]);
  ctx.stroke();
  var pm = bez(I, u1, u2, O, 0.62), pq = bez(I, u1, u2, O, 0.85);
  var lash = ch.lash || 0.5;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(pm[0], pm[1] - lw * 0.9);
  ctx.quadraticCurveTo(pq[0], pq[1] - lw * 1.3, O[0] + W * 0.12 * lash, O[1] - H * 0.22 * lash - (a >= 0.93 ? -H * 0.25 : 0));
  ctx.lineTo(O[0] - W * 0.04, O[1] + lw * 0.5);
  ctx.quadraticCurveTo(pq[0], pq[1] + lw * 0.6, pm[0], pm[1] + lw * 0.6);
  ctx.closePath(); ctx.fill();
  if (st.detail > 1 && lash > 0.5) {
    ctx.lineWidth = lw * 0.7;
    ctx.beginPath();
    for (var fl = 0; fl < 4; fl++) {
      var tt = 0.58 + fl * 0.11, qa = bez(I, u1, u2, O, tt);
      var up = a >= 0.93 ? 0.6 : -1;
      ctx.moveTo(qa[0], qa[1] - lw * 0.5);
      ctx.quadraticCurveTo(qa[0] + W * 0.08, qa[1] + up * H * 0.12, qa[0] + W * (0.1 + fl * 0.04) * lash, qa[1] + up * H * (0.26 + fl * 0.03) * lash);
    }
    ctx.stroke();
  }
  if (a < 0.93) {
    ctx.strokeStyle = mixc(rgb(ch.skin), rgb('#3a2020'), 0.62);
    if (L.dark) ctx.strokeStyle = ls(L, '#6a4040');
    ctx.lineWidth = lw * 0.95;
    bezLine(ctx, I, l1, l2, O, 0.38, 0.97, 0, 8); ctx.stroke();
    if (st.detail > 1) {
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.75; ctx.lineWidth = lw * 0.75;
      var cz = -H * (0.5 + 0.25 * (1 - a));
      bezLine(ctx, I, u1, u2, O, 0.3, 0.92, cz, 8); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  if (st.detail > 1 && (m.bags || ch.age > 0.5)) {
    ctx.strokeStyle = ls(L, ch.skin); ctx.lineWidth = lw * 0.9;
    bezLine(ctx, I, l1, l2, O, 0.25, 0.75, H * (0.55 + (m.bags ? 0.1 : 0)), 8); ctx.stroke();
    if (ch.lines > 1) {
      ctx.strokeStyle = ink; ctx.globalAlpha = 0.35; ctx.lineWidth = lw * 0.6;
      ctx.beginPath(); ctx.moveTo(W * 1.1, -H * 0.2); ctx.lineTo(W * 1.45, -H * 0.5); ctx.moveTo(W * 1.12, H * 0.25); ctx.lineTo(W * 1.5, H * 0.35); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function drawBrow(ctx, ch, st, side) {
  var m = st.m, L = st.L, th = ch.browW;
  var knit = m.knit ? 1.8 : 0;
  var p = side > 0 ? [[-6.5 - knit, -9.6 + m.bi], [5, -13.6 + (m.bi + m.bo) * 0.3 + (m.bi < -3 ? m.bi * 0.25 : 0)], [17.5, -10.6 + m.bo]]
    : [[-17.6 + knit, -9.6 + m.bi], [-25, -11.8 + (m.bi + m.bo) * 0.3], [-31.4, -8.6 + m.bo]];
  var t = [th * 0.6, th * 0.5, th * 0.16];
  var pts = [[p[0][0], p[0][1] - t[0], 1], [p[1][0], p[1][1] - t[1]], [p[2][0], p[2][1] - t[2], 1], [p[2][0], p[2][1] + t[2], 1], [p[1][0], p[1][1] + t[1]], [p[0][0], p[0][1] + t[0], 1]];
  var path = P2(pts);
  ctx.fillStyle = lc(L, ch.brow);
  ctx.fill(path);
  if (ch.id === 'severin' || ch.id === 'chair') { ctx.strokeStyle = ls(L, ch.brow); ctx.lineWidth = st.lw * 0.7; ctx.stroke(path); }
}

function drawFeatures(ctx, ch, st) {
  var L = st.L, m = st.m, lw = st.lw, g = geo(ch);
  /* far eye first, then near eye */
  drawEye(ctx, ch, st, -25, 4, -1, 0.6);
  drawEye(ctx, ch, st, 5, 4, 1, 1);
  if (st.detail > 0) { drawBrow(ctx, ch, st, -1); drawBrow(ctx, ch, st, 1); }
  else {
    ctx.strokeStyle = lc(L, ch.brow); ctx.lineWidth = ch.browW * 0.9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6, -10 + m.bi); ctx.lineTo(16, -11 + m.bo); ctx.moveTo(-18, -10 + m.bi); ctx.lineTo(-30, -9 + m.bo); ctx.stroke();
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  /* forehead creases */
  if (st.detail > 1 && m.crease) {
    ctx.strokeStyle = ls(L, ch.skin); ctx.lineWidth = lw * 0.9;
    ctx.beginPath();
    if (m.knit) { ctx.moveTo(-12.6, -11); ctx.lineTo(-12, -4); ctx.moveTo(-10.4, -10); ctx.lineTo(-10.2, -5.5); }
    else { ctx.moveTo(-15, -19); ctx.quadraticCurveTo(-11, -21.5, -6, -19.5); ctx.moveTo(-14, -23); ctx.quadraticCurveTo(-10, -25, -5, -23.5); }
    ctx.stroke();
  }
  /* nose */
  var nl = ch.nose === 'long' ? 2.2 : 0;
  if (st.detail > 0) {
    ctx.fillStyle = ls(L, ch.skin);
    ctx.beginPath(); ctx.moveTo(-14, 4); ctx.lineTo(-21.5 - nl * 0.4, 22.5 + nl); ctx.lineTo(-18, 26.5 + nl); ctx.lineTo(-13.2, 24 + nl); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = L.ink; ctx.lineWidth = lw * 1.25;
  ctx.beginPath(); ctx.moveTo(-24 - nl * 0.5, 20.5 + nl); ctx.quadraticCurveTo(-30 - nl, 25.5 + nl, -26 - nl * 0.5, 27.6 + nl); ctx.stroke();
  ctx.lineWidth = lw;
  ctx.beginPath();
  if (ch.nose === 'broad') { ctx.moveTo(-23, 28.6); ctx.quadraticCurveTo(-19.5, 27.2, -17, 28.4); ctx.moveTo(-15, 23.5); ctx.quadraticCurveTo(-12, 28, -16.5, 30); }
  else { ctx.moveTo(-21.5, 28.2 + nl); ctx.quadraticCurveTo(-19, 27.2 + nl, -17, 28.6 + nl); }
  ctx.stroke();
  /* age lines */
  if (st.detail > 1 && ch.lines) {
    ctx.strokeStyle = ink2(L, ch); ctx.lineWidth = lw * 0.8; ctx.globalAlpha = ch.lines > 1 ? 0.6 : 0.38;
    ctx.beginPath(); ctx.moveTo(-12.5, 27.5 + nl); ctx.quadraticCurveTo(-7.5, 33, -5.2, 40); ctx.stroke();
    if (ch.lines > 1) {
      ctx.beginPath(); ctx.moveTo(-26, -24); ctx.quadraticCurveTo(-10, -27, 8, -24); ctx.moveTo(-22, -30); ctx.quadraticCurveTo(-6, -33, 10, -30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-28, 46); ctx.quadraticCurveTo(-24, 50, -26, 53); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  /* scar along the left jaw (near side) */
  if (ch.scar && st.detail > 0) {
    ctx.strokeStyle = lc(L, '#b07a64'); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(6, 47); ctx.quadraticCurveTo(17, 44.5, 27.5, 36.5); ctx.stroke();
    ctx.strokeStyle = L.ink; ctx.lineWidth = lw * 0.6; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.moveTo(6.5, 48.3); ctx.quadraticCurveTo(17, 46, 27.5, 38); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12, 44); ctx.lineTo(13, 48); ctx.moveTo(19, 41.5); ctx.lineTo(20.5, 45.5); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (ch.freckles && st.detail > 0) {
    ctx.fillStyle = lc(L, '#b97650');
    for (var i = 0; i < g.freck.length; i++) { var fq = g.freck[i]; ctx.beginPath(); ctx.arc(fq[0], fq[1], fq[2], 0, TAU); ctx.fill(); }
  }
  drawMouth(ctx, ch, st);
  if (ch.mustache) drawMustache(ctx, ch, st);
}
function ink2(L, ch) { return L.dark ? L.ink : mixc(rgb(ch.skin), rgb('#2a1416'), 0.7); }

function drawMouth(ctx, ch, st) {
  var m = st.m, L = st.L, lw = st.lw;
  var mw = m.mw * (ch.male ? 1.08 : 1);
  var cx = -17.5, cy = 41.6 + (ch.mustache ? 0.6 : 0);
  var Lx = cx - 9 * mw, Rx = cx + 11 * mw;
  var Ly = cy + m.mc * 0.7, Ry = cy + m.mc * 0.95;
  var my = cy - m.mc * 0.3;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (st.detail < 1) {
    ctx.strokeStyle = L.ink; ctx.lineWidth = lw * 1.4;
    ctx.beginPath(); ctx.moveTo(Lx + 3, Ly); ctx.quadraticCurveTo(cx, my, Rx - 3, Ry); ctx.stroke();
    return;
  }
  if (m.mo > 0.02) {
    var open = m.mo * 7.5;
    var mp = new Path2D();
    mp.moveTo(Lx, Ly); mp.quadraticCurveTo(cx, my - 1, Rx, Ry);
    mp.quadraticCurveTo(cx + 1.5, my + open * 1.7, Lx, Ly);
    ctx.fillStyle = lc(L, '#5a2426'); ctx.fill(mp);
    ctx.save(); ctx.clip(mp);
    ctx.fillStyle = lc(L, '#a8545a'); ctx.beginPath(); ctx.ellipse(cx + 1.5, my + open * 1.15, 5 * mw, open * 0.5, 0, 0, TAU); ctx.fill();
    if (m.teeth) { ctx.fillStyle = lc(L, '#f4eee6'); ctx.fillRect(Lx, my - 3, Rx - Lx, 1.6 + open * 0.38); }
    ctx.restore();
    ctx.strokeStyle = L.ink; ctx.lineWidth = lw * 1.5;
    ctx.beginPath(); ctx.moveTo(Lx, Ly); ctx.quadraticCurveTo(cx, my - 1, Rx, Ry); ctx.stroke();
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.moveTo(Lx + 2, Ly + 1); ctx.quadraticCurveTo(cx + 1.5, my + open * 1.7, Rx - 2, Ry + 1); ctx.stroke();
    ctx.strokeStyle = ls(L, ch.skin); ctx.lineWidth = lw * 1.1;
    ctx.beginPath(); ctx.moveTo(cx - 3.5, my + open + 4.4); ctx.lineTo(cx + 4.5, my + open + 4.6); ctx.stroke();
  } else {
    ctx.strokeStyle = L.ink; ctx.lineWidth = lw * (m.press ? 1.9 : 1.5);
    ctx.beginPath(); ctx.moveTo(Lx, Ly); ctx.quadraticCurveTo(cx, my + (m.press ? 0.6 : 0), Rx, Ry); ctx.stroke();
    ctx.strokeStyle = ls(L, ch.skin); ctx.lineWidth = lw * 1.2;
    ctx.beginPath(); ctx.moveTo(cx - 3.8, cy + 4.6); ctx.quadraticCurveTo(cx + 0.5, cy + 5.4, cx + 4.6, cy + 4.6); ctx.stroke();
  }
  ctx.strokeStyle = L.ink; ctx.lineWidth = lw * 0.8;
  if (m.mc < -1) { ctx.beginPath(); ctx.moveTo(Rx - 0.4, Ry + 0.2); ctx.quadraticCurveTo(Rx + 1.6, Ry - 0.6, Rx + 2, Ry - 2.2); ctx.stroke(); }
  if (m.press || m.mc > 2) { ctx.beginPath(); ctx.moveTo(Rx + 0.6, Ry - 1.2); ctx.lineTo(Rx + 1, Ry + 1.6); ctx.stroke(); }
}

function drawMustache(ctx, ch, st) {
  var L = st.L, m = st.m;
  var d = m.mc * 0.5;
  var p = P2([[-32, 36 + d, 1], [-26, 31.5], [-18, 33], [-11, 31], [-3, 33.5], [1.5, 39 + d, 1], [-4, 38], [-11, 38.4], [-17.5, 37.6], [-25, 38.4]]);
  cel(ctx, p, L, ch.hair, { sh: [-2, -2], rim: [-st.rimW * 0.7, 0], lw: st.lw });
  if (st.detail > 1) {
    ctx.strokeStyle = ls(L, ch.hair); ctx.lineWidth = st.lw * 0.6;
    ctx.beginPath(); ctx.moveTo(-24, 34); ctx.lineTo(-27, 37); ctx.moveTo(-18, 34.5); ctx.lineTo(-19, 37.5); ctx.moveTo(-10, 33.5); ctx.lineTo(-8, 37); ctx.moveTo(-4, 35); ctx.lineTo(-1, 38); ctx.stroke();
  }
}

function drawHairFront(ctx, ch, st) {
  var g = geo(ch), L = st.L;
  if (g.hair.curly) { curls(ctx, g.hair.frontC, ch, st, 18); return; }
  if (!g.hairFront) return;
  hairCel(ctx, g.hairFront, ch, st, g.wedges, g.hairHi);
  if (g.flecks.length && st.detail > 0) {
    ctx.save(); ctx.clip(g.hairFront);
    ctx.strokeStyle = lc(L, '#a9a59f'); ctx.lineWidth = 0.55; ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < g.flecks.length; i++) { var f = g.flecks[i]; ctx.moveTo(f[0], f[1]); ctx.lineTo(f[0] + f[2], f[1] + f[3]); }
    ctx.stroke(); ctx.restore();
  }
  if (g.hair.comb && st.detail > 0) {
    ctx.save(); ctx.clip(g.hairFront);
    ctx.strokeStyle = ls(L, ch.hair); ctx.lineWidth = st.lw * 0.9;
    for (var c = 0; c < g.hair.comb.length; c++) { var cp = P2(g.hair.comb[c], true); ctx.stroke(cp); }
    ctx.restore();
  }
}

function drawGlasses(ctx, ch, st) {
  var L = st.L, lw = st.lw;
  var near = P2([[-5, 7.5, 1], [16.5, 6.5, 1], [15.6, 12], [9.5, 15.6], [0, 15.2], [-4.4, 12.2]]);
  var far = P2([[-30.4, 7.6, 1], [-20.2, 7.6, 1], [-20.8, 12.2], [-24.2, 15.2], [-28.8, 14.2], [-30.8, 11]]);
  ctx.fillStyle = rgba(L.dark ? '#7a6ac0' : '#cfe4f0', 0.16);
  ctx.fill(near); ctx.fill(far);
  var gl = st.glint === undefined ? -1 : st.glint;
  if (gl >= 0 && gl <= 1) {
    [near, far].forEach(function (pp, ii) {
      ctx.save(); ctx.clip(pp);
      ctx.fillStyle = rgba(L.dark ? L.rim : '#ffffff', 0.85);
      var gx = lerp(-36, 22, gl) + ii * 4;
      ctx.beginPath(); ctx.moveTo(gx, 4); ctx.lineTo(gx + 4, 4); ctx.lineTo(gx - 2, 18); ctx.lineTo(gx - 6, 18); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
  }
  var gold = lc(L, '#c9a24a');
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (var pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass ? gold : L.ink;
    ctx.lineWidth = pass ? lw * 0.75 : lw * 1.7;
    ctx.stroke(near); ctx.stroke(far);
    ctx.beginPath(); ctx.moveTo(-5, 8.2); ctx.quadraticCurveTo(-12, 4.8, -20.2, 8.3); ctx.moveTo(16.5, 7.4); ctx.lineTo(33, 3.6); ctx.stroke();
  }
}

/* ------------------------------------------------------------ BODIES (bust, face units) */
function bodyPath(b, top) {
  top = top || [[-15 * b, 88], [6, 97], [27 * b, 80]];
  return P2(top.concat([[72 * b, 90], [112 * b, 103], [134 * b, 134], [142 * b, 250, 1], [-108 * b, 250, 1], [-100 * b, 136], [-80 * b, 106], [-44 * b, 95]]));
}
function bodyShade(ch, st) {
  var g = geo(ch);
  return function (c) {
    c.beginPath(); c.moveTo(38, 70); c.lineTo(46, 140); c.lineTo(58, 260); c.lineTo(400, 260); c.lineTo(400, 70); c.fill();
    c.save(); c.translate(5, 13); c.fill(g.face); c.restore();
  };
}
function bodyCel(ctx, ch, st, path, color) {
  cel(ctx, path, st.L, color, { shFn: bodyShade(ch, st), rim: [-st.rimW * 1.5, st.rimW * 0.6], lw: st.lw });
}
function neckCel(ctx, ch, st) {
  var g = geo(ch), L = st.L;
  ctx.fillStyle = lc(L, ch.skin); ctx.fill(g.neck);
  ctx.save(); ctx.clip(g.neck); ctx.fillStyle = ls(L, ch.skin);
  ctx.save(); ctx.translate(4, 11); ctx.fill(g.face); ctx.restore();
  ctx.fillRect(16, 20, 40, 100);
  ctx.restore();
  crescent(ctx, g.neck, -st.rimW, 0, rimc(L, 0.9));
  ctx.lineWidth = st.lw; ctx.strokeStyle = L.ink; ctx.stroke(g.neck);
  if (ch.thinNeck && st.detail > 1) {
    ctx.strokeStyle = ls(L, ch.skin); ctx.lineWidth = st.lw * 1.1;
    ctx.beginPath(); ctx.moveTo(-11, 66); ctx.quadraticCurveTo(-8.5, 70, -10.5, 74); ctx.stroke();
  }
}
function line(ctx, pts, lw, col) {
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}
function furBall(ctx, list, L, col, lw, rimW) {
  var i, c;
  ctx.fillStyle = L.ink;
  for (i = 0; i < list.length; i++) { c = list[i]; ctx.beginPath(); ctx.arc(c[0], c[1], c[2] + lw, 0, TAU); ctx.fill(); }
  for (i = 0; i < list.length; i++) {
    c = list[i];
    ctx.fillStyle = ls(L, col); ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, TAU); ctx.fill();
    ctx.fillStyle = lc(L, col); ctx.beginPath(); ctx.arc(c[0] - c[2] * 0.22, c[1] - c[2] * 0.26, c[2] * 0.78, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = ls(L, col); ctx.lineWidth = lw * 0.9; ctx.lineCap = 'round';
  for (i = 0; i < list.length; i++) {
    c = list[i];
    ctx.beginPath(); ctx.moveTo(c[0] - c[2] * 0.3, c[1] + c[2] * 0.1); ctx.lineTo(c[0] - c[2] * 0.1, c[1] + c[2] * 0.5);
    ctx.moveTo(c[0] + c[2] * 0.2, c[1] - c[2] * 0.1); ctx.lineTo(c[0] + c[2] * 0.4, c[1] + c[2] * 0.35); ctx.stroke();
  }
  ctx.strokeStyle = rimc(L, 0.9); ctx.lineWidth = rimW;
  for (i = 0; i < list.length; i++) { c = list[i]; if (c[0] > 20) { ctx.beginPath(); ctx.arc(c[0], c[1], c[2] - rimW * 0.4, -1.2, 0.5); ctx.stroke(); } }
}

/* zig-zag an outline: inserts alternating tips along each segment (fur, frayed edges) */
function jag(pts, step, amp, seed, closed) {
  var out = [], r = rng(seed), n = pts.length, last = closed ? n : n - 1;
  for (var i = 0; i < last; i++) {
    var a = pts[i], b = pts[(i + 1) % n];
    var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy), k = Math.max(1, Math.round(d / step));
    var nx = dy / d, ny = -dx / d;
    for (var j = 0; j < k; j++) {
      var f = j / k, o = (j % 2 ? -0.25 : 1) * amp * (0.6 + r() * 0.7);
      if (!a[3] || j === 0) out.push([a[0] + dx * f + (j ? nx * o : 0), a[1] + dy * f + (j ? ny * o : 0), j % 2 ? 1 : 0]);
      else out.push([a[0] + dx * f, a[1] + dy * f]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
var FUR = null;
function furCollar(ctx, L, col, lw, rimW) {
  if (!FUR) {
    var far = jag([[-18, 152], [-30, 108], [-42, 93], [-66, 94], [-92, 108], [-100, 126, 0, 1], [-70, 136, 0, 1], [-40, 152, 0, 1]], 6, 3.4, 3, true);
    var near = jag([[22, 152], [24, 108], [26, 80], [44, 68], [72, 78], [104, 94], [128, 114], [132, 130, 0, 1], [90, 138, 0, 1], [50, 152, 0, 1]], 6, 3.4, 8, true);
    FUR = [P2(far), P2(near)];
    FUR.tufts = [[[-50, 108], [-58, 116]], [[-34, 120], [-40, 128]], [[-76, 118], [-82, 126]], [[44, 92], [52, 98]], [[66, 98], [76, 104]], [[90, 112], [98, 118]], [[40, 116], [46, 126]], [[34, 136], [40, 144]]];
  }
  for (var i = 0; i < 2; i++) cel(ctx, FUR[i], L, col, { sh: [-6, -7], rim: [-rimW * 1.2, rimW * 0.5], lw: lw });
  ctx.strokeStyle = ls(L, col); ctx.lineWidth = lw * 1.2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (var k = 0; k < FUR.tufts.length; k++) { var q = FUR.tufts[k]; ctx.moveTo(q[0][0], q[0][1]); ctx.quadraticCurveTo(q[0][0] + 5, q[0][1] + 2, q[1][0], q[1][1]); }
  ctx.stroke();
}
var CLOTH = {
  ilse: function (ctx, ch, st) {
    var L = st.L, b = ch.build, lw = st.lw, coat = '#3a3d45';
    bodyCel(ctx, ch, st, bodyPath(b), coat);
    line(ctx, [[-26, 97], [-29, 150], [-34, 250]], lw, L.ink);
    line(ctx, [[44, 96], [70, 104], [100, 116]], lw * 0.8, ls(L, coat));
    var col = P2([[-25, 63, 1], [-12, 67.5], [6, 68], [22, 63], [33, 53.5], [40.5, 46, 1], [43, 70], [41, 97], [14, 101], [-12, 100], [-29, 96, 1]]);
    cel(ctx, col, L, '#33363e', { shFn: function (c) { c.fillRect(24, 40, 40, 70); c.save(); c.translate(4, 10); c.fill(geo(ch).face); c.restore(); }, rim: [-st.rimW * 1.3, 0], lw: lw });
    line(ctx, [[-19, 67.5], [-20.5, 99]], lw, L.ink);
    line(ctx, [[-24, 64], [-12, 68.5], [6, 69], [22, 64], [33, 54.5]], lw * 0.8, lhi(L, '#33363e', 0.12));
    var pin = polyP([[17, 74.5], [20.6, 80], [17, 85.5], [13.4, 80]]);
    cel(ctx, pin, L, '#d6dce4', { lw: lw * 0.8, hiFn: function (c) { c.fillRect(13, 74, 4, 6); }, hiA: 0.7 });
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(16, 78, 0.7, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  },
  concordat: function (ctx, ch, st) {
    var L = st.L;
    bodyCel(ctx, ch, st, bodyPath(ch.build), '#3c4152');
    var col = P2([[-24, 66, 1], [-8, 70], [10, 70], [26, 64], [38, 54, 1], [40, 76], [38, 96], [-26, 96, 1]]);
    cel(ctx, col, L, '#343a4a', { rim: [-st.rimW, 0], lw: st.lw });
    line(ctx, [[-24, 67], [-8, 71], [10, 71], [26, 65], [38, 55]], st.lw, lc(L, '#c8a050'));
    cel(ctx, polyP([[14, 78], [18, 82], [14, 86], [10, 82]]), L, '#d6dce4', { lw: st.lw * 0.7 });
  },
  mira: function (ctx, ch, st) {
    var L = st.L, b = ch.build * 1.1, lw = st.lw, jk = '#5d6a3b', tee = '#2f3a3f';
    var teeP = P2([[-30, 92], [-14, 93], [6, 97], [28, 88], [34, 250, 1], [-40, 250, 1]]);
    cel(ctx, teeP, L, tee, { shFn: bodyShade(ch, st), lw: lw });
    line(ctx, [[-13, 93], [-2, 101], [10, 101], [27, 89]], lw * 1.2, L.ink);
    var far = P2([[-28, 90], [-46, 99], [-74 * b, 114], [-92 * b, 146], [-100 * b, 250, 1], [-38, 250, 1], [-32, 160], [-26, 118]]);
    var near = P2([[25, 85], [72 * b, 98], [106 * b, 114], [124 * b, 146], [132 * b, 250, 1], [30, 250, 1], [28, 160], [32, 112]]);
    bodyCel(ctx, ch, st, far, jk);
    bodyCel(ctx, ch, st, near, jk);
    var cf = P2([[-29, 86, 1], [-44, 95], [-34, 128, 1], [-24, 104]]);
    var cn = P2([[24, 83, 1], [46, 90], [52, 110], [34, 130, 1], [29, 104]]);
    cel(ctx, cf, L, '#66733f', { sh: [-3, -3], lw: lw });
    cel(ctx, cn, L, '#66733f', { sh: [-3, -3], rim: [-st.rimW, 0], lw: lw });
    line(ctx, [[56, 150], [96, 146], [100, 176], [58, 180]], lw * 0.8, ls(L, jk));
    line(ctx, [[70, 100], [108, 120]], lw * 0.8, ls(L, jk));
  },
  kasimir: function (ctx, ch, st) {
    var L = st.L, b = ch.build, lw = st.lw, coat = '#8a4026';
    bodyCel(ctx, ch, st, bodyPath(b), coat);
    var sh = P2([[-16, 96], [2, 106], [18, 100], [10, 150, 1], [-8, 150, 1]]);
    cel(ctx, sh, L, '#2c2420', { lw: lw });
    line(ctx, [[-12, 120], [-24, 250]], lw * 2.6, lc(L, ch.fig.trim));
    line(ctx, [[-10, 120], [-22, 250]], lw * 0.8, L.ink);
    furCollar(ctx, L, '#e4d9c6', lw, st.rimW);
  },
  severin: function (ctx, ch, st) {
    var L = st.L, b = ch.build, lw = st.lw, navy = '#1f2a48', gold = '#d1a54a';
    bodyCel(ctx, ch, st, bodyPath(b), navy);
    line(ctx, [[-25, 96], [-28, 250]], lw, L.ink);
    var col = P2([[-24, 64, 1], [-8, 68.5], [10, 69], [26, 63], [37, 53, 1], [40, 74], [40, 104], [-28, 104, 1]]);
    cel(ctx, col, L, '#1a2440', { shFn: function (c) { c.fillRect(24, 40, 40, 70); }, rim: [-st.rimW, 0], lw: lw });
    line(ctx, [[-23.4, 65], [-8, 69.5], [10, 70], [26, 64], [37, 54]], lw * 1.4, lc(L, gold));
    cel(ctx, P2([[12, 76], [20, 72], [26, 78], [18, 84]]), L, gold, { lw: lw * 0.7 });
    var sb = polyP([[46, 98], [100 * b, 113], [104 * b, 126], [48, 110]]);
    cel(ctx, sb, L, gold, { sh: [-2, -2], rim: [-st.rimW, 0], lw: lw });
    line(ctx, [[58, 103], [60, 112]], lw, ls(L, gold)); line(ctx, [[70, 106], [72, 115]], lw, ls(L, gold));
    cel(ctx, polyP([[-42, 101], [-74 * b, 115], [-74 * b, 121], [-42, 108]]), L, gold, { lw: lw });
    for (var i = 0; i < 4; i++) cel(ctx, (function () { var p = new Path2D(); p.arc(-22, 116 + i * 32, 2.6, 0, TAU); return p; })(), L, gold, { lw: lw * 0.7 });
    var cols = ['#9a2a2a', '#2a4a8a', '#d1a54a', '#2a6a4a', '#d1a54a', '#7a2a5a'];
    for (var k = 0; k < 6; k++) { ctx.fillStyle = lc(L, cols[k]); ctx.fillRect(40 + (k % 3) * 9, 140 + Math.floor(k / 3) * 5, 8.4, 4.4); }
    ctx.strokeStyle = L.ink; ctx.lineWidth = lw * 0.6; ctx.strokeRect(40, 140, 27, 10);
  },
  juno: function (ctx, ch, st) {
    var L = st.L, b = ch.build, lw = st.lw, lea = '#5c3d2a', tee = '#cbc6bb';
    var teeP = P2([[-28, 92], [-12, 92], [6, 96], [26, 88], [30, 250, 1], [-36, 250, 1]]);
    cel(ctx, teeP, L, tee, { shFn: bodyShade(ch, st), lw: lw });
    line(ctx, [[-12, 92], [0, 104], [12, 103], [26, 89]], lw * 1.2, L.ink);
    var far = P2([[-26, 90], [-44, 99], [-72 * b, 114], [-90 * b, 146], [-98 * b, 250, 1], [-34, 250, 1], [-30, 160], [-24, 116]]);
    var near = P2([[24, 86], [72 * b, 100], [104 * b, 114], [122 * b, 146], [128 * b, 250, 1], [28, 250, 1], [26, 160], [30, 112]]);
    bodyCel(ctx, ch, st, far, lea);
    bodyCel(ctx, ch, st, near, lea);
    cel(ctx, P2([[-27, 86, 1], [-46, 96], [-36, 124, 1], [-22, 104]]), L, '#4d3222', { sh: [-3, -3], lw: lw });
    cel(ctx, P2([[23, 83, 1], [48, 91], [54, 110], [36, 126, 1], [28, 104]]), L, '#4d3222', { sh: [-3, -3], rim: [-st.rimW, 0], lw: lw });
    var moth = new Path2D(); moth.arc(66, 156, 13, 0, TAU);
    cel(ctx, moth, L, '#2c465a', { lw: lw });
    ctx.fillStyle = lc(L, '#d9b25c');
    ctx.beginPath(); ctx.moveTo(66, 150); ctx.quadraticCurveTo(56, 144, 57, 156); ctx.quadraticCurveTo(62, 158, 66, 162); ctx.quadraticCurveTo(70, 158, 75, 156); ctx.quadraticCurveTo(76, 144, 66, 150); ctx.fill();
    ctx.setLineDash([1.6, 1.4]); ctx.strokeStyle = lc(L, '#e8dcc0'); ctx.lineWidth = lw * 0.6;
    ctx.beginPath(); ctx.arc(66, 156, 11, 0, TAU); ctx.stroke();
    var sq = polyP([[-80, 150], [-58, 146], [-55, 168], [-77, 172]]);
    cel(ctx, sq, L, '#b8862c', { lw: lw });
    ctx.strokeStyle = lc(L, '#3a2a18'); ctx.beginPath(); ctx.moveTo(-77, 153); ctx.lineTo(-60, 150); ctx.lineTo(-58, 165); ctx.lineTo(-75, 168); ctx.closePath(); ctx.stroke();
    var pt = polyP([[86, 196], [110, 194], [112, 214], [88, 216]]);
    cel(ctx, pt, L, '#4a3020', { lw: lw * 0.8 });
    ctx.beginPath(); ctx.moveTo(89, 199); ctx.lineTo(108, 197); ctx.lineTo(109, 211); ctx.lineTo(90, 213); ctx.closePath(); ctx.strokeStyle = lc(L, '#9a7a5a'); ctx.stroke();
    ctx.setLineDash([]);
  },
  teo: function (ctx, ch, st) {
    var L = st.L, b = ch.build, lw = st.lw, th = '#7a7e86';
    var body = bodyPath(b, [[-13, 90], [4, 97], [25, 86]]);
    bodyCel(ctx, ch, st, body, th);
    if (st.detail > 1) {
      ctx.save(); ctx.clip(body);
      ctx.strokeStyle = ls(L, th); ctx.globalAlpha = 0.45; ctx.lineWidth = lw * 0.6;
      ctx.beginPath();
      for (var x = -100; x < 140; x += 7) { ctx.moveTo(x, 100); ctx.lineTo(x + 6, 250); }
      for (var y = 104; y < 250; y += 7) { ctx.moveTo(-100, y); ctx.lineTo(140, y + 3); }
      ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
    }
    var rib = P2([[-14, 88], [4, 95], [26, 84], [27, 90], [4, 102], [-16, 95]]);
    cel(ctx, rib, L, '#6e727a', { lw: lw });
    line(ctx, [[-60, 110], [-62, 126]], lw * 0.8, ls(L, th));
  },
  pilot: function (ctx, ch, st) {
    var L = st.L, b = ch.build, lw = st.lw, navy = ch.fig.coat;
    bodyCel(ctx, ch, st, bodyPath(b), navy);
    var col = P2([[-24, 66, 1], [-8, 70], [10, 71], [26, 65], [38, 55, 1], [42, 76], [40, 96], [-27, 96, 1]]);
    cel(ctx, col, L, '#24324f', { rim: [-st.rimW, 0], lw: lw });
    line(ctx, [[-23.4, 67], [-8, 71], [10, 72], [26, 66], [38, 56]], lw * 1.2, lc(L, '#d1a54a'));
    ctx.fillStyle = lc(L, '#d1a54a');
    ctx.beginPath(); ctx.moveTo(30, 140); ctx.quadraticCurveTo(46, 130, 62, 134); ctx.quadraticCurveTo(48, 138, 46, 142); ctx.quadraticCurveTo(44, 138, 30, 140); ctx.fill();
    ctx.beginPath(); ctx.arc(46, 140, 2.6, 0, TAU); ctx.fill();
    line(ctx, [[-25, 96], [-28, 250]], lw, L.ink);
  },
  chair: function (ctx, ch, st) {
    var L = st.L, b = ch.build, lw = st.lw;
    bodyCel(ctx, ch, st, bodyPath(b), '#e6dec8');
    var stole = P2([[-24, 92, 1], [-8, 100], [-14, 250, 1], [-36, 250, 1], [-32, 140]]);
    cel(ctx, stole, L, '#b8902e', { lw: lw });
    var stole2 = P2([[28, 86, 1], [44, 92], [40, 250, 1], [20, 250, 1], [22, 140]]);
    cel(ctx, stole2, L, '#b8902e', { rim: [-st.rimW, 0], lw: lw });
  }
};
CLOTH.officer = CLOTH.severin;

/* full bust: hair back, body, face, features, hair front, glasses */
function drawBust(ctx, ch, st) {
  drawHairBack(ctx, ch, st);
  neckCel(ctx, ch, st);
  (CLOTH[ch.cloth] || CLOTH.ilse)(ctx, ch, st);
  drawHeadOnly(ctx, ch, st);
}
function drawHeadOnly(ctx, ch, st) {
  drawFaceBase(ctx, ch, st);
  drawFeatures(ctx, ch, st);
  drawHairFront(ctx, ch, st);
  strands(ctx, ch, st);
  if (ch.glasses) drawGlasses(ctx, ch, st);
}
/* head seen from behind (face units) */
function drawHeadBack(ctx, ch, st) {
  var g = geo(ch), L = st.L, lw = st.lw;
  var nk = polyP([[-14, 20], [-15, 80], [28, 80], [26, 20]]);
  cel(ctx, nk, L, ch.skin, { sh: [-6, 0], rim: [-st.rimW, 0], lw: lw });
  var skull = new Path2D(); skull.ellipse(6, -10, 43, 56, 0, 0, TAU);
  cel(ctx, skull, L, ch.skin, { sh: [-8, -6], rim: [-st.rimW, 0], lw: lw });
  var e1 = new Path2D(); e1.ellipse(-37, 4, 5, 10, 0.2, 0, TAU);
  var e2 = new Path2D(); e2.ellipse(49, 4, 5, 10, -0.2, 0, TAU);
  cel(ctx, e1, L, ch.skin, { lw: lw }); cel(ctx, e2, L, ch.skin, { sh: [-2, 0], rim: [-st.rimW, 0], lw: lw });
  if (g.hair.curly) {
    curls(ctx, g.hair.backC.concat([[6, -40, 18], [-20, -34, 14], [30, -20, 14], [-30, -14, 10], [40, -4, 9], [6, -14, 14]]), ch, st, 26);
    return;
  }
  if (ch.style === 'undercut') {
    var sv = new Path2D(); sv.ellipse(6, -14, 42, 50, 0, Math.PI * 0.95, Math.PI * 2.05);
    ctx.save(); ctx.clip(skull); ctx.fillStyle = lc(L, mixHex(ch.skin, ch.hair, 0.45)); ctx.fillRect(-60, -80, 130, 90); ctx.restore();
  }
  if (g.hairBV) hairCel(ctx, g.hairBV, ch, st, null, null);
  if (g.hair.tie) {
    var tie = new Path2D(); tie.ellipse(g.hair.tie[0] - 16, g.hair.tie[1] - 2, 7, 4, 0, 0, TAU);
    cel(ctx, tie, L, '#3a4a3a', { lw: lw });
  }
  if (g.hair.comb) {
    ctx.save(); ctx.clip(g.hairBV); ctx.strokeStyle = ls(L, ch.hair); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(-20, -60); ctx.quadraticCurveTo(-24, -10, -18, 20); ctx.moveTo(6, -66); ctx.lineTo(6, 22); ctx.moveTo(30, -60); ctx.quadraticCurveTo(36, -10, 32, 20); ctx.stroke(); ctx.restore();
  }
  if (g.flecks.length) {
    ctx.save(); ctx.clip(g.hairBV); ctx.strokeStyle = lc(L, '#a9a59f'); ctx.lineWidth = 0.6; ctx.beginPath();
    for (var i = 0; i < g.flecks.length; i++) { var f = g.flecks[i]; ctx.moveTo(f[0] * 0.9, f[1] + 6); ctx.lineTo(f[0] * 0.9 + f[2], f[1] + 6 + f[3]); }
    ctx.stroke(); ctx.restore();
  }
}

/* ============================================================ PAINT HELPERS (V-space) */
function vgrad(x, y0, y1, stops) {
  var g = x.createLinearGradient(0, y0, 0, y1);
  for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  return g;
}
function fillV(x, stops, y0, y1) { x.fillStyle = vgrad(x, y0 === undefined ? 0 : y0, y1 === undefined ? VH : y1, stops); x.fillRect(-50, -50, VW + 100, VH + 100); }
function glow(x, cx, cy, r, col, a) {
  var g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(col, a === undefined ? 1 : a));
  g.addColorStop(1, rgba(col, 0));
  x.fillStyle = g;
  x.fillRect(cx - r, cy - r, r * 2, r * 2);
}
function rect(x, x0, y0, ww, hh, col) { x.fillStyle = col; x.fillRect(x0, y0, ww, hh); }
function blob(x, cx, cy, rx, ry, col) { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); x.fill(); }

/* Painted, blurred portrait backdrops. Each is a few big shapes: the blur does the rest. */
var BGS = {
  apartment: function (x, d) {
    fillV(x, d ? [[0, '#1d1636'], [0.6, '#2a1f44'], [1, '#120e22']] : [[0, '#5a4038'], [0.55, '#7a5444'], [1, '#2e2226']]);
    var wc = d ? '#4a3e8a' : '#ffd2a0';
    rect(x, 120, 90, 620, 720, rgba(d ? '#2a2458' : '#3a2a28', 1));
    rect(x, 150, 120, 270, 660, wc); rect(x, 440, 120, 270, 660, d ? '#3e3478' : '#ffc890');
    glow(x, 430, 380, 520, d ? '#7a6ad0' : '#ffe0b0', d ? 0.35 : 0.55);
    rect(x, 1300, 160, 520, 18, d ? '#1a142c' : '#3a2620'); rect(x, 1300, 420, 520, 18, d ? '#1a142c' : '#3a2620');
    for (var i = 0; i < 9; i++) rect(x, 1320 + i * 54, 100 + (i % 3) * 12, 38, 60 - (i % 3) * 12, d ? '#2c2448' : ['#6a3a2a', '#4a5a4a', '#8a6a3a'][i % 3]);
    for (var j = 0; j < 7; j++) rect(x, 1330 + j * 66, 350 + (j % 2) * 10, 44, 70, d ? '#2a2246' : ['#5a4a6a', '#7a4a32', '#3a4a5a'][j % 3]);
    blob(x, 1000, 1000, 600, 160, d ? '#0e0a1c' : '#2a1c1c');
    if (d) { rect(x, 0, 930, VW, 14, '#ffae52'); glow(x, 960, 936, 900, '#ff9a40', 0.25); glow(x, 1500, 300, 500, '#2a8a9a', 0.25); }
    else glow(x, 1600, 700, 300, '#ffb070', 0.3);
  },
  hall: function (x, d) {
    fillV(x, d ? [[0, '#140f2c'], [1, '#0a0818']] : [[0, '#1a2244'], [0.6, '#24305a'], [1, '#0f142a']]);
    glow(x, 960, -100, 900, d ? '#4a3a9a' : '#e8d4a0', d ? 0.35 : 0.45);
    for (var r = 0; r < 4; r++) for (var i = 0; i < 30; i++) {
      var xx = i * 68 + (r % 2) * 34, yy = 520 + r * 120 - Math.abs(xx - 960) * 0.08;
      blob(x, xx, yy, 14, 10, d ? (i % 5 ? '#3a3070' : '#ffae52') : '#ffd890');
    }
    for (var k = 0; k < 3; k++) { rect(x, 160 + k * 160, 60, 90, 600, d ? '#2a2050' : '#203868'); rect(x, 190 + k * 160, 60, 30, 600, d ? '#6a5030' : '#d4a84a'); }
    for (var q = 0; q < 3; q++) { rect(x, 1360 + q * 160, 60, 90, 600, d ? '#3a1a20' : '#8a3a22'); rect(x, 1390 + q * 160, 60, 30, 600, d ? '#5a3a20' : '#c88a3a'); }
    if (d) { rect(x, 0, 960, VW, 12, '#ffae52'); glow(x, 960, 966, 900, '#ff9a40', 0.25); }
  },
  garden: function (x, d) {
    fillV(x, d ? [[0, '#1a1030'], [1, '#08060f']] : [[0, '#2a1438'], [0.5, '#1c2a24'], [1, '#0c140f']]);
    for (var i = 0; i < 6; i++) { rect(x, i * 340 + 40, 70, 220, 22, d ? '#6a4aa0' : '#ffe0fa'); glow(x, i * 340 + 150, 80, 300, d ? '#6a40b0' : '#ff70d8', d ? 0.3 : 0.5); }
    var r = rng(41);
    for (var k = 0; k < 70; k++) blob(x, r() * VW, 260 + r() * 820, 30 + r() * 70, 20 + r() * 40, d ? (r() < 0.5 ? '#1c2a26' : '#24203a') : (r() < 0.5 ? '#2e6a3a' : '#1f4a2c'));
    for (var t = 0; t < 26; t++) blob(x, r() * VW, 300 + r() * 600, 12, 12, d ? '#6a2030' : '#e0402a');
    if (d) glow(x, 960, 1080, 700, '#1a6a7a', 0.25);
  },
  terrace: function (x, d) {
    fillV(x, d ? [[0, '#120c2a'], [1, '#1e1438']] : [[0, '#0e1a3a'], [0.6, '#1a2850'], [1, '#2a2440']]);
    for (var i = 0; i < 40; i++) { var a = i / 40; blob(x, a * VW, 380 - Math.sin(a * Math.PI) * 220, 4, 4, d ? '#6a5aa0' : '#ffd8a0'); }
    var r = rng(77);
    for (var k = 0; k < 14; k++) { var lx = r() * VW, ly = 200 + r() * 500; glow(x, lx, ly, 80 + r() * 60, d ? '#ffae52' : '#ffa850', 0.55); blob(x, lx, ly, 16, 20, d ? '#ffc070' : '#ffd090'); }
    rect(x, 0, 820, VW, 8, d ? '#4a3a70' : '#8ab0c8');
    for (var c = 0; c < 9; c++) blob(x, 120 + c * 220, 940, 50, 150, d ? '#0c0818' : '#141428');
  },
  ship: function (x, d) {
    fillV(x, d ? [[0, '#0e0c22'], [1, '#080612']] : [[0, '#0c1a22'], [1, '#081014']]);
    var r = rng(5);
    for (var s = 0; s < 120; s++) blob(x, r() * VW, r() * 420, 2, 2, '#cfe0ff');
    rect(x, 0, 420, VW, 30, '#1a2228');
    for (var i = 0; i < 9; i++) { var c = ['#40e0a0', '#ffb040', '#40c0ff'][i % 3]; rect(x, 80 + i * 200, 560 + (i % 2) * 40, 120, 70, d ? '#3a2a60' : c); glow(x, 140 + i * 200, 600, 180, d ? '#6a50c0' : c, 0.3); }
    rect(x, 0, 760, VW, 400, '#141a1e');
    for (var j = 0; j < 30; j++) blob(x, r() * VW, 700 + r() * 80, 5, 5, ['#ff5040', '#40ff90', '#ffd040'][j % 3]);
  },
  dock: function (x, d) {
    fillV(x, d ? [[0, '#16102e'], [1, '#0a0816']] : [[0, '#2a3448'], [0.7, '#1a2030'], [1, '#101420']]);
    for (var i = 0; i < 7; i++) { rect(x, i * 300 + 50, 0, 40, VH, d ? '#100c20' : '#1a2030'); glow(x, i * 300 + 200, 240, 160, d ? '#ffae52' : '#ffb060', 0.6); blob(x, i * 300 + 200, 240, 18, 10, '#ffd8a0'); }
    rect(x, 0, 620, VW, 20, d ? '#2a2046' : '#3a4458');
    glow(x, 1500, 800, 600, d ? '#1a6a7a' : '#5070a0', 0.3);
  },
  detention: function (x, d) {
    fillV(x, d ? [[0, '#221c3a'], [1, '#14102a']] : [[0, '#8a948e'], [1, '#5a625e']]);
    rect(x, 1160, 120, 520, 560, d ? '#3a3470' : '#e8f2f4');
    glow(x, 1420, 400, 600, d ? '#5a50a0' : '#ffffff', 0.5);
    for (var i = 0; i < 6; i++) rect(x, 1180 + i * 90, 120, 18, 560, d ? '#1a1630' : '#4a5250');
    rect(x, 0, 840, VW, 240, d ? '#16122a' : '#4a524e');
    rect(x, 200, 0, 30, VH, d ? '#1c1834' : '#7a847e');
  },
  spine: function (x, d) {
    fillV(x, [[0, '#0a0a10'], [1, '#050508']]);
    for (var i = 0; i < 12; i++) { var xx = i * 180; x.strokeStyle = d ? '#2a1e40' : '#1e2228'; x.lineWidth = 40; x.beginPath(); x.ellipse(xx, 540, 220, 600, 0, -1.2, 1.2); x.stroke(); }
    glow(x, 1300, 520, 500, d ? '#ff9a40' : '#fff2d0', 0.45);
    glow(x, 400, 700, 300, '#3a5a8a', 0.25);
  },
  observation: function (x, d) {
    fillV(x, d ? [[0, '#0c0820'], [1, '#1a1030']] : [[0, '#0a0c22'], [0.7, '#2a1a3a'], [1, '#8a4a40']]);
    var r = rng(9);
    for (var s = 0; s < 120; s++) blob(x, r() * VW, r() * VH * 0.6, 2, 2, '#e0e4ff');
    var cx = 1300, cy = 1400, R = 900;
    for (var b = 0; b < 8; b++) { x.fillStyle = ['#c98a4a', '#7a4a7a', '#e0a860', '#5a3a6a', '#d89a58', '#6a4070', '#e8b878', '#8a5a70'][b]; x.beginPath(); x.arc(cx, cy, R - b * 34, Math.PI, 0); x.fill(); }
    glow(x, cx, cy - R, 700, d ? '#6a50c0' : '#ffd0a0', 0.35);
    rect(x, 0, 0, 60, VH, '#0a0a14'); rect(x, 900, 0, 30, VH, '#0a0a14');
  },
  dark: function (x) {
    fillV(x, [[0, '#1a1236'], [0.6, '#241a46'], [1, '#0e0a1e']]);
    glow(x, 1500, 300, 700, '#2a8a9a', 0.3);
    glow(x, 400, 500, 600, '#5a3a9a', 0.35);
    rect(x, 0, 900, VW, 12, '#ffae52'); glow(x, 960, 906, 900, '#ff9a40', 0.22);
  }
};
function bgCanvas(bg, dark, w, h) {
  if (!BGS[bg]) bg = 'dark';
  return softLayer('bg:' + bg + ':' + (dark ? 1 : 0), w, h, 16, function (x) { BGS[bg](x, dark); });
}

/* ============================================================ PORTRAITS */
var BG_DEFAULT = { ilse: 'apartment', mira: 'apartment', kasimir: 'hall', severin: 'garden', juno: 'ship', teo: 'detention' };
function facingOf(p, ch) { return p.facing === 'left' ? 1 : (p.facing === 'right' ? -1 : ch.facing); }
function portrait(key) {
  return function (ctx, w, h, t, p, G) {
    p = p || {};
    t = Math.max(0, num(t, 0));
    var ch = chr(key), dark = !!p.dark;
    var bg = (typeof p.bg === 'string' && BGS[p.bg]) ? p.bg : BG_DEFAULT[key];
    if (bg === 'dark') dark = true;
    var L = light(bg, dark);
    var face = facingOf(p, ch);
    var md = mood(p.mood);
    begin(ctx, w, h);
    var push = 1 + 0.0042 * Math.min(t, 18);
    var drift = Math.sin(t * 0.13) * 6;
    blit(ctx, bgCanvas(bg, dark, w, h), 1.05 + (push - 1) * 0.5, VW / 2, VH / 2, -face * (6 + t * 0.6) + drift, 0);
    var br = Math.sin(t * TAU / 4.6);
    var S = 4.65;
    var hx = face > 0 ? 1150 : 770, hy = 438;
    ctx.save();
    ctx.translate(hx, 560); ctx.scale(push, push); ctx.translate(-hx, -560);
    ctx.translate(hx, hy + br * 2.4);
    var tilt = (p.mood === 'grief' ? 0.05 : p.mood === 'resolve' ? -0.015 : p.mood === 'tired' ? 0.03 : 0) * face;
    ctx.rotate(tilt * 0.5);
    ctx.scale(face * S, S);
    var st = { L: L, lw: 2.5 / (S * push), m: md, bl: blinkAt(t, ch.seed), t: t, detail: 2, rimW: 1.6, dark: dark || bg === 'dark',
      glint: ((t + 1.5) % 7) / 1.1 - 0.2 };
    drawBust(ctx, ch, st);
    ctx.restore();
    end(ctx);
  };
}
['ilse', 'mira', 'kasimir', 'severin', 'juno', 'teo'].forEach(function (k) { SH[k + '_closeup'] = portrait(k); });

/* ============================================================ EXTREME EYE CLOSE-UPS */
function eyesShot(key) {
  return function (ctx, w, h, t, p, G) {
    p = p || {};
    t = Math.max(0, num(t, 0));
    var ch = chr(key), dark = !!p.dark;
    var bg = (typeof p.bg === 'string' && BGS[p.bg]) ? p.bg : BG_DEFAULT[key];
    if (bg === 'dark') dark = true;
    var L = light(bg, dark), face = facingOf(p, ch), md = mood(p.mood);
    begin(ctx, w, h);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH);
    var y0 = 345, y1 = 735;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y0, VW, y1 - y0); ctx.clip();
    blit(ctx, bgCanvas(bg, dark, w, h), 1.3, VW / 2, VH / 2, 0, 0);
    var push = 1 + 0.006 * Math.min(t, 16);
    var S = 27 * push;
    ctx.translate(VW / 2 + face * Math.sin(t * 0.1) * 6, VH / 2 + 10);
    ctx.scale(face * S, S);
    ctx.translate(10, -2);
    var st = { L: L, lw: 4.2 / S, m: md, bl: blinkAt(t, ch.seed + 5), t: t, detail: 2, rimW: 0.5, dark: dark, glint: -1 };
    drawHairBack(ctx, ch, st);
    drawHeadOnly(ctx, ch, st);
    ctx.restore();
    end(ctx);
  };
}
['ilse', 'kasimir', 'mira'].forEach(function (k) { SH[k + '_eyes'] = eyesShot(k); });

/* ============================================================ FIGURES
 * Figure units: feet at y=0, crown at y=-100, facing screen-left; mirrored for facing -1.
 * o = { facing, view:'3q'|'back', pose, L, t, m, detail, lw (px), s (px per unit), phase, jacket }
 */
var HS = 14.2 / 122; /* face units -> figure units */
function skel(ch, o) {
  var f = ch.fig, t = o.t || 0;
  var sw = f.sw * 1.2 * (f.baggy ? 1.06 : 1), hw = sw * (ch.fem ? 0.8 : 0.7) * (f.thin ? 0.9 : 1);
  var br = Math.sin(t * TAU / 4.6 + (ch.seed || 0)) * 0.22;
  var J = { H: [0, -92.8 + br], N: [1.2, -82.2 + br], P: [1, -50], tilt: 0, sw: sw, hw: hw };
  J.sF = [J.N[0] - sw * 0.78, -80 + br]; J.sN = [J.N[0] + sw * 0.86, -80.4 + br];
  J.hF = [J.P[0] - hw * 0.8, -50]; J.hN = [J.P[0] + hw * 0.8, -50];
  J.kF = [J.hF[0] - 0.6, -27]; J.aF = [J.hF[0] - 0.3, -3.5]; J.fF = [J.hF[0] - 5.6, -1];
  J.kN = [J.hN[0] + 0.2, -27]; J.aN = [J.hN[0] + 0.4, -3.5]; J.fN = [J.hN[0] - 4.8, -1];
  J.eF = [J.sF[0] - 1.2, -64 + br]; J.wF = [J.sF[0] - 0.8, -48.5 + br];
  J.eN = [J.sN[0] + 1.4, -64 + br]; J.wN = [J.sN[0] + 1.2, -48.5 + br];
  var P = POSES[o.pose];
  if (P) P(J, o, ch);
  return J;
}
function shiftJ(J, keys, dx, dy) { for (var i = 0; i < keys.length; i++) { var q = J[keys[i]]; J[keys[i]] = [q[0] + dx, q[1] + dy]; } }
var UPPER = ['H', 'N', 'sF', 'sN', 'eF', 'eN', 'wF', 'wN'];
var POSES = {
  walk: function (J, o) {
    var ph = (o.t || 0) * 1.6 * TAU + (o.phase || 0), s = Math.sin(ph), c = Math.cos(ph);
    var bob = Math.abs(c) * 0.9;
    shiftJ(J, UPPER.concat(['P', 'hF', 'hN']), 0, -bob);
    J.kF = [J.hF[0] - 4 * s, -27 - Math.max(0, s) * 2]; J.aF = [J.hF[0] - 8 * s + Math.max(0, -s) * 3, -3.5 - Math.max(0, -s) * 4];
    J.kN = [J.hN[0] + 4 * s, -27 - Math.max(0, -s) * 2]; J.aN = [J.hN[0] + 8 * s + Math.max(0, s) * 3, -3.5 - Math.max(0, s) * 4];
    J.fF = [J.aF[0] - 5, J.aF[1] + 2.5]; J.fN = [J.aN[0] - 5, J.aN[1] + 2.5];
    J.eF = [J.sF[0] + 2.4 * s, J.eF[1]]; J.wF = [J.sF[0] + 5 * s, J.wF[1] + Math.abs(s)];
    J.eN = [J.sN[0] - 2.4 * s, J.eN[1]]; J.wN = [J.sN[0] - 5 * s, J.wN[1] + Math.abs(s)];
  },
  sit: function (J) {
    var dy = 20;
    shiftJ(J, UPPER, 0.5, dy);
    J.P = [1.5, -30]; J.hF = [J.P[0] - J.hw * 0.8, -30]; J.hN = [J.P[0] + J.hw * 0.8, -30];
    J.kF = [J.hF[0] - 17, -31]; J.kN = [J.hN[0] - 16, -30];
    J.aF = [J.kF[0] + 1.5, -3.5]; J.aN = [J.kN[0] + 2.5, -3.5];
    J.fF = [J.aF[0] - 5, -1]; J.fN = [J.aN[0] - 5, -1];
    J.eF = [J.sF[0] - 2.5, J.sF[1] + 15]; J.wF = [J.sF[0] - 12, J.sF[1] + 19];
    J.eN = [J.sN[0] + 0.5, J.sN[1] + 16]; J.wN = [J.sN[0] - 10, J.sN[1] + 21];
    J.sit = 1;
  },
  sitLap: function (J, o, ch) {
    POSES.sit(J, o, ch);
    J.wF = [J.sF[0] - 9, J.sF[1] + 25]; J.wN = [J.sN[0] - 9, J.sN[1] + 25];
    J.tilt = 0.12;
  },
  smoke: function (J) {
    J.eF = [J.sF[0] + 0.5, -68]; J.wF = [J.H[0] - 3.4, J.H[1] + 5.5]; J.armFront = 1;
  },
  rail: function (J, o) {
    shiftJ(J, UPPER, -3, 1.5);
    if (o && o.view === 'back') { J.eF = [J.sF[0] - 2.5, -60]; J.wF = [J.P[0] - 3, -62]; J.eN = [J.sN[0] + 2.5, -60]; J.wN = [J.P[0] + 2, -62]; J.handsHidden = 1; J.tilt = 0.06; return; }
    J.eF = [J.sF[0] - 1, -55]; J.wF = [J.sF[0] - 11, -55.5];
    J.eN = [J.sN[0] + 0.5, -55]; J.wN = [J.sN[0] - 10, -56];
    J.tilt = 0.08;
  },
  railSmoke: function (J, o) {
    POSES.rail(J, o); J.handsHidden = 0;
    J.eN = [J.sN[0] + 4.5, -69]; J.wN = [J.sN[0] + 2.6, -85];
  },
  prune: function (J) {
    J.eF = [J.sF[0] - 5, -66]; J.wF = [J.sF[0] - 12, -70];
    J.eN = [J.sN[0] - 2, -63]; J.wN = [J.sN[0] - 11, -66];
    J.tilt = 0.06; J.armFront = 1;
  },
  behind: function (J) {
    J.eF = [J.sF[0] + 2, -64]; J.wF = [J.sF[0] + 5, -52];
    J.eN = [J.sN[0] + 2.4, -64]; J.wN = [J.sN[0] + 0.5, -52]; J.handsHidden = 1;
  },
  crouch: function (J) {
    shiftJ(J, UPPER, -3, 24);
    J.P = [3, -24]; J.hF = [J.P[0] - J.hw * 0.8, -24]; J.hN = [J.P[0] + J.hw * 0.8, -24];
    J.kF = [J.hF[0] - 10, -34]; J.kN = [J.hN[0] - 8, -30];
    J.aF = [J.hF[0] - 2, -3]; J.aN = [J.hN[0] + 3, -2]; J.fF = [J.aF[0] - 5, 0]; J.fN = [J.aN[0] - 4, 0];
    J.eF = [J.sF[0] - 5, J.sF[1] + 12]; J.wF = [J.sF[0] - 13, J.sF[1] + 10];
    J.eN = [J.sN[0] - 3, J.sN[1] + 13]; J.wN = [J.sN[0] - 11, J.sN[1] + 12];
    J.tilt = 0.2; J.armFront = 1;
  },
  crawl: function (J, o) {
    var ph = (o.t || 0) * 0.9 * TAU + (o.phase || 0), s = Math.sin(ph);
    J.H = [-29, -33 + Math.abs(s) * 0.4]; J.N = [-21, -29]; J.sF = [-19, -30]; J.sN = [-17, -28.5];
    J.P = [6, -27]; J.hF = [4, -28]; J.hN = [7, -26.5];
    J.eF = [-25 + s * 2, -15]; J.wF = [-29 + s * 3, -1.5]; J.eN = [-21 - s * 2, -14]; J.wN = [-25 - s * 3, -1.5];
    J.kF = [2 - s * 2, -2]; J.aF = [20 - s * 2, -3]; J.fF = [25 - s * 2, -1];
    J.kN = [5 + s * 2, -2]; J.aN = [23 + s * 2, -3]; J.fN = [28 + s * 2, -1];
    J.tilt = 0.35; J.crawl = 1; J.armFront = 1;
  },
  hug: function (J) {
    J.eF = [J.sF[0] - 6, -70]; J.wF = [J.sF[0] - 12, -76];
    J.eN = [J.sN[0] - 4, -68]; J.wN = [J.sN[0] - 12, -73]; J.armFront = 1; J.tilt = 0.1;
  },
  reach: function (J) { J.eN = [J.sN[0] - 4, -66]; J.wN = [J.sN[0] - 14, -64]; },
  podium: function (J) { J.eF = [J.sF[0] - 4, -58]; J.wF = [J.sF[0] - 10, -56]; J.eN = [J.sN[0] - 2, -58]; J.wN = [J.sN[0] - 9, -55]; }
};

function hemOf(ch) { return -80 + ch.fig.coatLen * 0.8; }

function drawFigure(ctx, ch, x, y, s, o) {
  var f = ch.fig, L = o.L, facing = o.facing || 1, back = o.view === 'back';
  var J = skel(ch, o);
  var lw = (o.lw || 2.2) / s;
  var sleeveW = (f.baggy ? 5.6 : 4.9) * (ch.male ? 1.08 : 1) * (f.thin ? 0.86 : 1);
  var legW = (ch.male ? 6.2 : 5.6) * (f.thin ? 0.85 : 1);
  var lx = back ? -1 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * s, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  var stH = { L: L, lw: lw / HS, m: o.m || MOODS.neutral, bl: o.bl || 0, t: o.t || 0, detail: o.detail === undefined ? 1 : o.detail, rimW: Math.max(1.2, 1.4 / (s * HS)), dark: L.dark };
  function head() {
    ctx.save(); ctx.translate(J.H[0], J.H[1]); ctx.rotate(J.tilt * (back ? -1 : 1)); ctx.scale(HS, HS);
    if (back) drawHeadBack(ctx, ch, stH);
    else { neckCel(ctx, ch, stH); drawHeadOnly(ctx, ch, stH); if (f.cap) drawCap(ctx, ch, stH); }
    ctx.restore();
  }
  function hairBehind() {
    if (back) return;
    ctx.save(); ctx.translate(J.H[0], J.H[1]); ctx.rotate(J.tilt); ctx.scale(HS, HS); drawHairBack(ctx, ch, stH); ctx.restore();
  }
  function arm(sh, el, wr, hide) {
    limb(ctx, [sh, el, wr], [sleeveW, sleeveW * 0.82], L, f.sleeve, lw, lx, 0.3);
    if (hide) return;
    var dx = wr[0] - el[0], dy = wr[1] - el[1], d = Math.sqrt(dx * dx + dy * dy) || 1;
    var hx = wr[0] + dx / d * 2, hy = wr[1] + dy / d * 2;
    var gl = f.gloves ? f.gloves : ch.skin;
    ctx.fillStyle = L.ink; ctx.beginPath(); ctx.ellipse(hx, hy, 2.1 + lw, 2.8 + lw, Math.atan2(dy, dx) - Math.PI / 2, 0, TAU); ctx.fill();
    ctx.fillStyle = lc(L, gl); ctx.beginPath(); ctx.ellipse(hx, hy, 2.1, 2.8, Math.atan2(dy, dx) - Math.PI / 2, 0, TAU); ctx.fill();
    ctx.fillStyle = ls(L, gl); ctx.beginPath(); ctx.ellipse(hx + 0.7 * lx, hy + 0.5, 1.2, 2, Math.atan2(dy, dx) - Math.PI / 2, 0, TAU); ctx.fill();
    ctx.fillStyle = L.ink; ctx.beginPath(); ctx.ellipse(wr[0], wr[1], sleeveW * 0.55, sleeveW * 0.3, Math.atan2(dy, dx), 0, TAU); ctx.fill();
  }
  function leg(h, k, a, ft) {
    limb(ctx, [h, k, a], [legW, legW * 0.74], L, f.pants, lw, lx, 0.2);
    ctx.fillStyle = L.ink; ctx.beginPath(); ctx.ellipse((a[0] + ft[0]) / 2, (a[1] + ft[1]) / 2 + 0.6, 4.2 + lw, 1.9 + lw, Math.atan2(ft[1] - a[1], ft[0] - a[0]), 0, TAU); ctx.fill();
    ctx.fillStyle = lc(L, f.shoe); ctx.beginPath(); ctx.ellipse((a[0] + ft[0]) / 2, (a[1] + ft[1]) / 2 + 0.6, 4.2, 1.9, Math.atan2(ft[1] - a[1], ft[0] - a[0]), 0, TAU); ctx.fill();
  }
  function torso() {
    var hem = hemOf(ch) + (J.P[1] + 50);
    var flare = hem > J.P[1] + 8 ? 2.6 : 0.6;
    var N = J.N, P = J.P, sF = J.sF, sN = J.sN;
    var pts;
    if (J.crawl) {
      pts = [[sF[0] - 3, sF[1] - 3.5], [P[0] - 4, P[1] - 4.5], [P[0] + 5, P[1] - 3], [P[0] + 6, P[1] + 3], [P[0] - 2, P[1] + 5.5], [sF[0] + 2, sN[1] + 6.5], [sF[0] - 4, sF[1] + 4]];
    } else {
      var hemY = J.sit ? Math.min(hem, P[1] + 2) : hem;
      pts = [[N[0] - 3, N[1] - 0.5], [sF[0], sF[1] + 0.3], [sF[0] - 0.6, sF[1] + 4], [P[0] - J.hw * 0.74, P[1] - 13], [J.hF[0] - 0.8, P[1]],
        [J.hF[0] - flare, hemY, 1], [J.hN[0] + flare, hemY, 1], [J.hN[0] + 0.8, P[1]], [P[0] + J.hw * 0.86, P[1] - 13], [sN[0] + 0.6, sN[1] + 4], [sN[0], sN[1] + 0.3], [N[0] + 3.2, N[1] - 1]];
    }
    var path = P2(pts);
    cel(ctx, path, L, f.coat, { sh: [-2.2 * lx, -1.5], rim: [-0.7 * lx, 0.3], lw: lw });
    if (J.sit && hem > P[1] + 4) {
      var lap = P2([[J.hF[0], P[1] - 3], [J.kF[0] - 1, J.kF[1] - 3], [J.kF[0] - 2.5, J.kF[1] + (hem - P[1]) * 0.7, 1], [J.hN[0] + 1, P[1] + (hem - P[1]) * 0.5, 1], [J.hN[0] + 1, P[1] - 2]]);
      cel(ctx, lap, L, f.coat, { sh: [-1, -1.6], rim: [-0.6 * lx, 0], lw: lw });
    }
    if (back || J.crawl) return;
    /* collar and costume accents */
    if (f.collar === 'high') {
      cel(ctx, P2([[N[0] - 2.8, N[1] - 3.2, 1], [N[0] + 3.4, N[1] - 4, 1], [N[0] + 3.6, N[1] + 0.8], [N[0] - 3, N[1] + 1.4]]), L, '#33363e', { sh: [-1, 0], lw: lw });
      if (f.pin) { ctx.fillStyle = lc(L, '#e2e6ec'); ctx.beginPath(); ctx.arc(N[0] + 1.6, N[1] - 1.2, 0.5, 0, TAU); ctx.fill(); }
      line(ctx, [[N[0] - 2.2, N[1] + 1], [P[0] - J.hw * 0.4, hem]], lw, L.ink);
    } else if (f.collar === 'fur') {
      var fur = P2(jag([[sF[0] - 1.5, sF[1] + 3], [N[0] - 3.5, N[1] - 1.5], [N[0] + 2, N[1] - 4], [sN[0] + 1.5, sN[1] - 0.5], [sN[0] + 1, sN[1] + 3.5, 0, 1], [N[0] + 2, N[1] + 6, 0, 1], [N[0] - 3, N[1] + 7, 0, 1]], 1.4, 0.7, 5, true));
      cel(ctx, fur, L, '#e4d9c6', { sh: [-0.8, -1], rim: [-0.5 * lx, 0.2], lw: lw });
      line(ctx, [[N[0] - 2.5, N[1] + 7], [P[0] - J.hw * 0.5, hem]], lw * 2.2, lc(L, f.trim));
    } else if (f.collar === 'gold') {
      line(ctx, [[N[0] - 2.8, N[1] - 1.5], [N[0] + 3.2, N[1] - 2.2]], lw * 2.5, lc(L, f.gold));
      cel(ctx, polyP([[sN[0] - 3.4, sN[1] - 0.4], [sN[0] + 0.8, sN[1] + 0.2], [sN[0] + 0.6, sN[1] + 1.8], [sN[0] - 3.4, sN[1] + 1.2]]), L, f.gold, { lw: lw * 0.7 });
      cel(ctx, polyP([[sF[0] + 2.4, sF[1] - 0.3], [sF[0] - 0.6, sF[1] + 0.2], [sF[0] - 0.4, sF[1] + 1.6], [sF[0] + 2.4, sF[1] + 1.1]]), L, f.gold, { lw: lw * 0.7 });
      ctx.fillStyle = lc(L, f.gold);
      for (var b = 0; b < 4; b++) { ctx.beginPath(); ctx.arc(N[0] - 2.3 - b * 0.15, N[1] + 4 + b * 6, 0.45, 0, TAU); ctx.fill(); }
    } else if (f.collar === 'jacket') {
      cel(ctx, polyP([[N[0] - 2.8, N[1] - 0.5], [N[0] + 0.4, N[1] + 6.5], [N[0] + 3, N[1] - 1]]), L, ch.cloth === 'mira' ? '#2f3a3f' : '#cbc6bb', { lw: lw });
      line(ctx, [[N[0] - 3.4, N[1]], [N[0] - 1.6, N[1] + 9], [P[0] - 1.6, hem]], lw * 1.1, L.ink);
      line(ctx, [[N[0] + 3.4, N[1] - 1], [N[0] + 2.2, N[1] + 9], [P[0] + 3, hem]], lw * 1.1, L.ink);
      if (f.patches) {
        ctx.fillStyle = lc(L, '#2c465a'); ctx.beginPath(); ctx.arc(sN[0] - 2, sN[1] + 8, 1.6, 0, TAU); ctx.fill();
        ctx.fillStyle = lc(L, '#b8862c'); ctx.fillRect(sF[0] + 0.3, sF[1] + 3, 2.2, 2.2);
      }
    } else if (f.collar === 'crew') {
      line(ctx, [[N[0] - 2.8, N[1] - 0.6], [N[0] + 0.2, N[1] + 1.4], [N[0] + 3.2, N[1] - 1.2]], lw * 1.6, ls(L, f.coat));
    } else if (f.collar === 'stole') {
      cel(ctx, polyP([[N[0] - 3, N[1] - 0.5], [N[0] - 1, N[1]], [N[0] - 1.6, hem], [N[0] - 4.2, hem]]), L, f.gold, { lw: lw });
    }
    if (o.jacket) {
      var jk = P2([[sF[0] - 2.4, sF[1] - 0.6], [N[0], N[1] - 2], [sN[0] + 2.6, sN[1] - 1], [sN[0] + 3.4, sN[1] + 6], [J.hN[0] + 2.6, P[1] + 1, 1], [P[0] + 1, P[1] + 2], [J.hF[0] - 2.4, P[1] + 1.5, 1], [sF[0] - 3.2, sF[1] + 6]]);
      cel(ctx, jk, L, '#5c3d2a', { sh: [-1.6 * lx, -1], rim: [-0.7 * lx, 0.3], lw: lw });
      line(ctx, [[N[0] - 2.4, N[1]], [P[0] - 1, P[1] + 1.5]], lw, L.ink);
      ctx.fillStyle = lc(L, '#2c465a'); ctx.beginPath(); ctx.arc(sN[0] - 1, sN[1] + 9, 1.6, 0, TAU); ctx.fill();
      ctx.fillStyle = lc(L, '#b8862c'); ctx.fillRect(sF[0] - 1, sF[1] + 4, 2.2, 2.2);
      limb(ctx, [[sN[0] + 2.4, sN[1] + 1], [sN[0] + 3.2, sN[1] + 14], [sN[0] + 2.6, sN[1] + 26]], 4.2, L, '#5c3d2a', lw, lx, 0.3);
    }
  }
  if (back) {
    leg(J.hF, J.kF, J.aF, J.fF); leg(J.hN, J.kN, J.aN, J.fN);
    arm(J.sF, J.eF, J.wF, J.handsHidden); arm(J.sN, J.eN, J.wN, J.handsHidden);
    torso();
    head();
  } else {
    hairBehind();
    if (!J.armFront) arm(J.sF, J.eF, J.wF, J.handsHidden);
    leg(J.hF, J.kF, J.aF, J.fF);
    leg(J.hN, J.kN, J.aN, J.fN);
    torso();
    head();
    if (J.armFront) arm(J.sF, J.eF, J.wF, J.handsHidden);
    arm(J.sN, J.eN, J.wN, J.handsHidden);
  }
  var W = {}; /* world positions of a few joints for props */
  ['H', 'wF', 'wN', 'N', 'P'].forEach(function (k) { W[k] = [x + facing * s * J[k][0], y + s * J[k][1]]; });
  ctx.restore();
  return W;
}
function drawCap(ctx, ch, st) {
  var L = st.L;
  var cap = P2([[-40, -40], [-30, -66], [6, -78], [42, -68], [54, -46], [40, -36], [0, -38]]);
  cel(ctx, cap, L, '#1c2440', { sh: [-4, -4], rim: [-st.rimW, 0], lw: st.lw });
  var brim = P2([[-46, -36, 1], [-20, -42], [10, -40], [16, -34, 1], [-14, -32]]);
  cel(ctx, brim, L, '#0e1222', { lw: st.lw });
  line(ctx, [[-36, -42], [40, -42]], st.lw * 2, lc(L, '#c9a046'));
}

/* ============================================================ SMOKE (deterministic wisps) */
function smoke(ctx, x, y, t, scale, col, alpha, seed) {
  var tq = q12(t);
  ctx.save();
  ctx.lineCap = 'round';
  for (var i = 0; i < 4; i++) {
    var ph = tq * 0.9 + i * 1.7 + (seed || 0);
    ctx.strokeStyle = rgba(col, alpha * (1 - i * 0.18));
    ctx.lineWidth = scale * (2.2 + i * 1.6);
    ctx.beginPath();
    ctx.moveTo(x, y);
    var px = x, py = y;
    for (var k = 1; k <= 8; k++) {
      var yy = y - k * 26 * scale;
      var xx = x + Math.sin(ph + k * 0.75) * k * 4.5 * scale + Math.sin(tq * 0.4 + k * 0.3 + i) * 6 * scale + k * k * 0.6 * scale;
      ctx.quadraticCurveTo(px, (py + yy) / 2, xx, yy);
      px = xx; py = yy;
    }
    ctx.stroke();
  }
  ctx.restore();
}
function steam(ctx, x, y, t, scale, col, alpha) {
  var tq = q12(t);
  ctx.save(); ctx.lineCap = 'round';
  for (var i = 0; i < 3; i++) {
    var ph = tq * 1.3 + i * 2.1;
    ctx.strokeStyle = rgba(col, alpha * (0.8 - i * 0.2)); ctx.lineWidth = scale * (3 - i * 0.5);
    ctx.beginPath(); ctx.moveTo(x + (i - 1) * 6 * scale, y);
    for (var k = 1; k <= 5; k++) ctx.lineTo(x + (i - 1) * 6 * scale + Math.sin(ph + k * 0.9) * 5 * scale, y - k * 14 * scale);
    ctx.stroke();
  }
  ctx.restore();
}

/* ============================================================ ENVIRONMENT PAINTINGS (cached) */
/* Vesper's interior seen along the axis: land curving up and over, haze toward the end cap. */
function paintHabitat(x, mode, cx, cy, R0, R1) {
  cx = cx === undefined ? 960 : cx; cy = cy === undefined ? 330 : cy; R0 = R0 || 300; R1 = R1 || 1900;
  var TB = {
    day:   { hz0: '#fff6e4', hz1: '#f6c49e', hz2: '#c99a9a', land: ['#87946a', '#a39a6c', '#6f8260', '#94845e', '#7a8c70'], lite: '#fff4d8', ln: 0.12, cloud: '#ffffff' },
    night: { hz0: '#463c80', hz1: '#2a2256', hz2: '#151132', land: ['#1e1c36', '#25213e', '#1b1b32', '#23233c', '#1d1d38'], lite: '#ffd890', ln: 1, cloud: '#6a5ab0' },
    dark:  { hz0: '#6a4aa8', hz1: '#3a2a68', hz2: '#1c143a', land: ['#261d44', '#2c214c', '#21193e', '#2e234a', '#251e42'], lite: '#ffae52', ln: 0.45, cloud: '#8a6ad0' },
    fire:  { hz0: '#6a4aa8', hz1: '#3a2a68', hz2: '#1c143a', land: ['#261d44', '#2c214c', '#21193e', '#2e234a', '#251e42'], lite: '#ffae52', ln: 0.35, cloud: '#8a6ad0' }
  };
  var P = TB[mode] || TB.night;
  x.fillStyle = P.hz2; x.fillRect(-100, -100, VW + 200, VH + 200);
  var r = rng(1234), i, b;
  /* the land: concentric bands (near = outer), then long field strips along the axis */
  var NB = 30;
  for (b = NB - 1; b >= 0; b--) {
    var ra = R0 + (R1 - R0) * Math.pow(b / NB, 1.6), rb = R0 + (R1 - R0) * Math.pow((b + 1) / NB, 1.6);
    var hz = Math.pow(1 - b / NB, 2.2);
    x.fillStyle = mixc(P.land[b % 5], P.hz1, hz * 0.92);
    x.beginPath(); x.arc(cx, cy, rb, 0, TAU); x.arc(cx, cy, ra, 0, TAU, true); x.fill();
  }
  for (i = 0; i < 150; i++) {
    var an = r() * TAU, da = 0.006 + r() * 0.02;
    x.fillStyle = rgba(P.land[i % 5], 0.35 + r() * 0.3);
    x.beginPath(); x.arc(cx, cy, R1, an, an + da); x.arc(cx, cy, R0 * 1.4, an + da * 0.4, an, true); x.fill();
  }
  x.strokeStyle = rgba(mode === 'day' ? '#d8eaf2' : '#4a4a80', 0.55);
  for (var k = 0; k < 3; k++) { var aa = 0.5 + k * 2.15; x.lineWidth = 3; x.beginPath(); x.moveTo(cx + Math.cos(aa) * R0, cy + Math.sin(aa) * R0); x.lineTo(cx + Math.cos(aa) * R1, cy + Math.sin(aa) * R1); x.stroke(); }
  /* lights, clustered into towns */
  var n = Math.round(1600 * P.ln);
  for (var j = 0; j < n; j++) {
    var a2 = r() * TAU, rr = R0 * 1.15 + Math.pow(r(), 0.7) * (R1 - R0 * 1.15);
    if (r() > (Math.sin(a2 * 6 + 1) * 0.5 + 0.5) * 0.85 + 0.12) continue;
    var px = cx + Math.cos(a2) * rr, py = cy + Math.sin(a2) * rr, sz = 0.8 + (rr - R0) / (R1 - R0) * 3;
    x.fillStyle = rgba(r() < 0.12 && mode !== 'day' ? '#7ad8e0' : P.lite, 0.45 + r() * 0.5);
    x.fillRect(px, py, sz, sz);
  }
  /* clouds drifting along the axis, then aerial haze toward the far end-cap */
  for (var c = 0; c < 14; c++) {
    var ca = r() * TAU, cr = R0 * (1.3 + r() * 1.6);
    x.save(); x.translate(cx + Math.cos(ca) * cr, cy + Math.sin(ca) * cr); x.rotate(ca + Math.PI / 2);
    x.fillStyle = rgba(P.cloud, mode === 'day' ? 0.22 : 0.1); x.beginPath(); x.ellipse(0, 0, 40 + r() * 120, 10 + r() * 16, 0, 0, TAU); x.fill();
    x.restore();
  }
  var g = x.createRadialGradient(cx, cy, 0, cx, cy, R0 * 2.6);
  g.addColorStop(0, rgba(P.hz0, 1)); g.addColorStop(0.3, rgba(P.hz1, 0.85)); g.addColorStop(1, rgba(P.hz1, 0));
  x.fillStyle = g; x.fillRect(-100, -100, VW + 200, VH + 200);
  if (mode === 'fire') {
    var fx = cx + 520, fy = cy + 470;
    glow(x, fx, fy, 560, '#ff6a20', 0.5); glow(x, fx, fy, 180, '#ffc060', 0.8);
  }
}

function paintBalcony(x, mode) {
  paintHabitat(x, mode, 900, 280);
  var dark = mode !== 'day';
  /* building wall left */
  x.fillStyle = dark ? '#120e22' : '#4a3a40'; x.fillRect(0, 0, 330, VH);
  x.fillStyle = dark ? '#1c1630' : '#6a5050'; x.fillRect(300, 0, 30, VH);
  x.fillStyle = mode === 'day' ? '#ffd8a8' : (mode === 'dark' ? '#3a2a60' : '#5a4a3a'); x.fillRect(70, 160, 170, 420);
  x.fillStyle = dark ? '#0c0a18' : '#3a2a30'; x.fillRect(150, 160, 10, 420); x.fillRect(70, 360, 170, 10);
  if (mode === 'dark') { x.fillStyle = '#ffae52'; x.fillRect(0, 760, 330, 6); }
  /* balcony floor and rail */
  x.fillStyle = vgrad(x, 760, VH, [[0, dark ? '#16122a' : '#5a4a50'], [1, dark ? '#0a0814' : '#2a2028']]); x.fillRect(0, 760, VW, VH - 760);
  x.fillStyle = rgba(dark ? '#5a4a9a' : '#c8e0f0', 0.12); x.fillRect(330, 640, VW, 120);
  x.fillStyle = dark ? '#2a2240' : '#3a3038'; x.fillRect(330, 628, VW, 14);
  x.fillStyle = rgba(mode === 'day' ? '#fff0d8' : '#9a8ad0', 0.7); x.fillRect(330, 628, VW, 3);
  for (var i = 0; i < 14; i++) { x.fillStyle = dark ? '#1c1830' : '#3a3038'; x.fillRect(360 + i * 120, 642, 8, 118); }
  x.fillStyle = dark ? '#1c1830' : '#3a3038'; x.fillRect(330, 752, VW, 10);
}

function paintApartment(x, dark) {
  fillV(x, dark ? [[0, '#1c1634'], [1, '#120e24']] : [[0, '#6c5048'], [1, '#4a3634']]);
  /* window left with dawn habitat */
  x.save(); x.beginPath(); x.rect(90, 120, 560, 600); x.clip();
  paintHabitat(x, dark ? 'dark' : 'day', 400, 300, 260, 900);
  x.restore();
  x.fillStyle = dark ? '#0e0a1a' : '#3a2a28';
  x.fillRect(80, 110, 580, 16); x.fillRect(80, 714, 580, 16); x.fillRect(80, 110, 16, 620); x.fillRect(644, 110, 16, 620); x.fillRect(362, 110, 12, 620);
  /* light spill on floor */
  x.fillStyle = vgrad(x, 760, VH, [[0, dark ? '#1a1430' : '#5a4038'], [1, dark ? '#0c0a18' : '#2e2222']]); x.fillRect(0, 760, VW, VH);
  x.fillStyle = rgba(dark ? '#6a5ac0' : '#ffc890', dark ? 0.12 : 0.28);
  x.beginPath(); x.moveTo(96, 760); x.lineTo(660, 760); x.lineTo(1000, VH); x.lineTo(200, VH); x.closePath(); x.fill();
  x.fillStyle = dark ? '#16122a' : '#5a4440'; x.fillRect(0, 752, VW, 10);
  /* shelf with books, a lamp */
  x.fillStyle = dark ? '#16122a' : '#3c2a26'; x.fillRect(760, 300, 340, 12); x.fillRect(760, 430, 340, 12);
  var r = rng(55);
  for (var i = 0; i < 12; i++) { x.fillStyle = dark ? ['#2a2246', '#221c3c', '#30284e'][i % 3] : ['#7a3a2a', '#3a4a5a', '#8a6a3a', '#4a5a3a'][i % 4]; var hh = 50 + r() * 30; x.fillRect(770 + i * 26, 300 - hh, 22, hh); }
  /* doorway right */
  x.fillStyle = dark ? '#0e0a1c' : '#2e2220'; x.fillRect(1250, 90, 420, 680);
  x.fillStyle = vgrad(x, 110, 760, dark ? [[0, '#2a2050'], [1, '#3a2a5a']] : [[0, '#f0d8b0'], [1, '#c8a080']]); x.fillRect(1280, 120, 360, 640);
  if (dark) { x.fillStyle = '#ffae52'; x.fillRect(1280, 740, 360, 8); glow(x, 1460, 744, 300, '#ff9a40', 0.3); x.fillStyle = '#ffae52'; x.fillRect(0, 900, VW, 0); }
  x.fillStyle = rgba(dark ? '#7a6ad0' : '#fff0d0', dark ? 0.12 : 0.25);
  x.beginPath(); x.moveTo(1280, 760); x.lineTo(1640, 760); x.lineTo(1760, VH); x.lineTo(1160, VH); x.closePath(); x.fill();
  if (dark) { glow(x, 960, 600, 900, '#2a8a9a', 0.12); }
}

function paintTable(x, dark, tea) {
  var top = dark ? '#2a2034' : '#6a4632', side = dark ? '#16101e' : '#3c261c';
  x.fillStyle = '#120a0c';
  x.beginPath(); x.moveTo(330, 770); x.lineTo(1120, 770); x.lineTo(1180, 830); x.lineTo(270, 830); x.closePath(); x.fill();
  x.fillStyle = top; x.beginPath(); x.moveTo(336, 774); x.lineTo(1116, 774); x.lineTo(1170, 826); x.lineTo(278, 826); x.closePath(); x.fill();
  x.fillStyle = rgba(dark ? '#8a7ad0' : '#ffd8a8', 0.3); x.fillRect(340, 776, 760, 4);
  x.fillStyle = side; x.fillRect(272, 828, 900, 26);
  x.fillStyle = '#120a0c'; x.fillRect(300, 852, 24, 230); x.fillRect(1120, 852, 24, 230);
  x.fillStyle = side; x.fillRect(304, 854, 16, 230); x.fillRect(1124, 854, 16, 230);
  if (tea) {
    [[600, 790], [880, 796]].forEach(function (c) {
      x.fillStyle = '#120a0c'; x.beginPath(); x.ellipse(c[0], c[1] + 12, 52, 12, 0, 0, TAU); x.fill();
      x.fillStyle = dark ? '#5a5070' : '#e8e0d4'; x.beginPath(); x.ellipse(c[0], c[1] + 12, 48, 10, 0, 0, TAU); x.fill();
      x.fillStyle = '#120a0c'; x.fillRect(c[0] - 28, c[1] - 34, 56, 46);
      x.fillStyle = dark ? '#6a6088' : '#f2ece2'; x.fillRect(c[0] - 25, c[1] - 32, 50, 42);
      x.fillStyle = dark ? '#4a4068' : '#c8bfb2'; x.fillRect(c[0] + 6, c[1] - 32, 19, 42);
      x.strokeStyle = '#120a0c'; x.lineWidth = 9; x.beginPath(); x.arc(c[0] + 32, c[1] - 12, 12, -1.3, 1.3); x.stroke();
      x.strokeStyle = dark ? '#6a6088' : '#f2ece2'; x.lineWidth = 4; x.stroke();
      x.fillStyle = '#5a2e1c'; x.beginPath(); x.ellipse(c[0], c[1] - 31, 24, 4, 0, 0, TAU); x.fill();
    });
  }
}

/* ============================================================ TWO-SHOTS AND FIGURES */
function camZ(t, rate, cap) { return 1 + Math.min(t * (rate || 0.003), cap || 0.06); }
function pushCam(ctx, z, cx, cy) { ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy); }

SH.ilse_balcony = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var dark = !!p.dark, lt = clamp(num(p.light, 0.6), 0, 1);
  begin(ctx, w, h);
  var z = camZ(t, 0.0028);
  ctx.save(); pushCam(ctx, z, 1100, 500);
  if (dark) blit(ctx, layer('bal:dark', w, h, function (x) { paintBalcony(x, 'dark'); }));
  else {
    blit(ctx, layer('bal:night', w, h, function (x) { paintBalcony(x, 'night'); }));
    if (lt > 0) { ctx.globalAlpha = lt; blit(ctx, layer('bal:day', w, h, function (x) { paintBalcony(x, 'day'); })); ctx.globalAlpha = 1; }
  }
  var L = dark ? light('dark', true, 'backlit') : (lt > 0.3 ? light('apartment', false, 'dawnback') : light('apartment', false, 'backlit'));
  var W = drawFigure(ctx, CH.ilse, 1240, 1190, 9, { view: 'back', pose: 'railSmoke', facing: 1, L: L, t: t, lw: 2.6 });
  var hx = W.wN[0] + 6, hy = W.wN[1] - 18;
  ctx.strokeStyle = '#efe8dc'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(W.wN[0] + 2, W.wN[1] - 4); ctx.lineTo(hx, hy); ctx.stroke();
  var ember = 0.75 + 0.25 * Math.sin(q12(t) * 3.1);
  glow(ctx, hx, hy, 26, '#ff8a3a', 0.6 * ember);
  ctx.fillStyle = '#ffb060'; ctx.beginPath(); ctx.arc(hx, hy, 3.4, 0, TAU); ctx.fill();
  smoke(ctx, hx, hy - 4, t, 1.25, dark ? '#c8b8ff' : '#f4ece8', dark ? 0.16 : 0.2, 1);
  ctx.restore();
  end(ctx);
};

SH.ilse_mira_kitchen = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var dark = !!p.dark, tea = !!p.tea;
  begin(ctx, w, h);
  var z = camZ(t, 0.0025);
  ctx.save(); pushCam(ctx, z, 960, 540);
  blit(ctx, layer('kit:' + dark, w, h, function (x) { paintApartment(x, dark); }));
  var L1 = dark ? light('apartment', true) : light('apartment', false, 'warm');
  var L2 = dark ? light('dark', true, 'backlit') : light('apartment', false, 'backlit');
  drawFigure(ctx, CH.mira, 1450, 905, 6.6, { facing: 1, pose: 'stand', L: L2, t: t, m: MOODS.neutral, bl: blinkAt(t, 23), detail: 1, lw: 2.2 });
  drawFigure(ctx, CH.ilse, 760, 1040, 7.4, { facing: -1, pose: 'sit', L: L1, t: t, m: MOODS.tired, bl: blinkAt(t, 11), detail: 1, lw: 2.3 });
  blit(ctx, layer('kit:table:' + dark + ':' + tea, w, h, function (x) { paintTable(x, dark, tea); }));
  if (tea) { steam(ctx, 600, 752, t, 1.4, dark ? '#c8b8ff' : '#ffffff', 0.22); steam(ctx, 880, 758, t + 0.7, 1.4, dark ? '#c8b8ff' : '#ffffff', 0.22); }
  ctx.restore();
  end(ctx);
};

function paintBigWindow(x, mode) {
  fillV(x, [[0, '#0c0818'], [1, '#08060f']]);
  x.save(); x.beginPath(); x.rect(140, 70, 1640, 860); x.clip();
  paintHabitat(x, mode, 960, 360, 380, 1500);
  x.restore();
  x.fillStyle = '#07050c';
  for (var i = 0; i < 5; i++) x.fillRect(130 + i * 410, 60, 22, 890);
  x.fillRect(130, 60, 1660, 22); x.fillRect(130, 500, 1660, 12); x.fillRect(130, 930, 1660, 24);
  x.fillStyle = vgrad(x, 950, VH, [[0, '#120e22'], [1, '#060410']]); x.fillRect(0, 950, VW, 130);
  if (mode !== 'day') { x.fillStyle = '#ffae52'; x.fillRect(0, 1000, VW, 6); glow(x, 960, 1003, 700, '#ff9a40', 0.18); }
}
SH.ilse_mira_window = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var dark = p.dark === undefined ? true : !!p.dark;
  begin(ctx, w, h);
  var z = camZ(t, 0.002);
  ctx.save(); pushCam(ctx, z, 960, 600);
  blit(ctx, layer('win:' + dark, w, h, function (x) { paintBigWindow(x, dark ? 'dark' : 'night'); }));
  var L = light(dark ? 'dark' : 'terrace', dark, 'backlit');
  drawFigure(ctx, CH.ilse, 740, 1120, 8.8, { view: 'back', pose: 'stand', facing: -1, L: L, t: t, lw: 2.4 });
  drawFigure(ctx, CH.mira, 1170, 1130, 8.2, { view: 'back', pose: 'stand', facing: 1, L: L, t: t + 1.3, lw: 2.4 });
  ctx.restore();
  end(ctx);
};

function paintTerrace(x) {
  paintHabitat(x, 'night', 960, 160, 420, 1500);
  var r = rng(808);
  /* lantern strings */
  for (var s = 0; s < 2; s++) {
    x.strokeStyle = 'rgba(20,14,30,0.9)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(-20, 120 + s * 90); x.quadraticCurveTo(960, 300 + s * 90, 1940, 100 + s * 80); x.stroke();
    for (var i = 0; i < 12; i++) {
      var u = (i + 0.5) / 12, lx = lerp(-20, 1940, u), ly = (1 - u) * (1 - u) * (120 + s * 90) + 2 * u * (1 - u) * (300 + s * 90) + u * u * (100 + s * 80) + 14;
      glow(x, lx, ly, 70, '#ffa040', 0.5);
      x.fillStyle = '#ffcf80'; x.beginPath(); x.ellipse(lx, ly, 11, 15, 0, 0, TAU); x.fill();
      x.fillStyle = '#c0602a'; x.fillRect(lx - 6, ly - 17, 12, 4);
    }
  }
  /* blurred crowd far left */
  for (var c = 0; c < 6; c++) { x.fillStyle = rgba('#0c0a18', 0.7); x.beginPath(); x.ellipse(80 + c * 70, 640 - (c % 2) * 20, 26, 90, 0, 0, TAU); x.fill(); x.beginPath(); x.arc(80 + c * 70, 540 - (c % 2) * 20, 22, 0, TAU); x.fill(); }
  /* terrace floor, glass railing */
  x.fillStyle = vgrad(x, 760, VH, [[0, '#1a1428'], [1, '#0a0812']]); x.fillRect(0, 760, VW, VH);
  x.fillStyle = 'rgba(160,190,230,0.10)'; x.fillRect(0, 600, VW, 170);
  x.fillStyle = '#2a2234'; x.fillRect(0, 592, VW, 12);
  x.fillStyle = 'rgba(255,200,140,0.6)'; x.fillRect(0, 592, VW, 2);
  for (var k = 0; k < 9; k++) { x.fillStyle = 'rgba(200,220,255,0.12)'; x.fillRect(k * 240, 604, 3, 160); }
  x.fillStyle = '#1a1424'; x.fillRect(0, 760, VW, 8);
  glow(x, 960, 640, 900, '#ffa050', 0.08);
}
SH.ilse_kasimir_terrace = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var close = !!p.close;
  begin(ctx, w, h);
  var z = camZ(t, 0.0022);
  ctx.save(); pushCam(ctx, z, 960, 560);
  blit(ctx, layer('terrace', w, h, paintTerrace));
  var L = light('terrace', false, 'backlit');
  L = p.dark ? light('dark', true, 'backlit') : light('terrace', false, 'lampBack');
  var gap = close ? 150 : 430;
  drawFigure(ctx, CH.ilse, 960 - gap / 2 - 90, 1160, 8.2, { view: 'back', pose: 'rail', facing: -1, L: L, t: t, lw: 2.4 });
  drawFigure(ctx, CH.kasimir, 960 + gap / 2 + 90, 1170, 8.6, { view: 'back', pose: 'rail', facing: 1, L: L, t: t + 2, lw: 2.4 });
  ctx.restore();
  end(ctx);
};

function paintDetention(x, dark) {
  fillV(x, dark ? [[0, '#221a3c'], [1, '#141026']] : [[0, '#a4ada6'], [1, '#7c8680']]);
  x.fillStyle = dark ? '#2c2448' : '#bcc6c0'; x.fillRect(0, 0, VW, 90);
  /* window */
  x.fillStyle = dark ? '#0e0a1c' : '#5a6460'; x.fillRect(1130, 150, 600, 560);
  x.save(); x.beginPath(); x.rect(1150, 170, 560, 520); x.clip();
  if (dark) paintHabitat(x, 'dark', 1430, 300, 160, 700);
  else { fillV(x, [[0, '#f4fbff'], [1, '#cfe2ea']], 170, 690); glow(x, 1430, 300, 500, '#ffffff', 0.8); }
  x.restore();
  for (var i = 0; i < 5; i++) { x.fillStyle = dark ? '#100c1e' : '#4a5450'; x.fillRect(1180 + i * 115, 170, 16, 520); }
  x.fillStyle = dark ? '#100c1e' : '#4a5450'; x.fillRect(1150, 420, 560, 12);
  /* light shaft on floor */
  x.fillStyle = rgba(dark ? '#7a6ad0' : '#ffffff', dark ? 0.1 : 0.22);
  x.beginPath(); x.moveTo(1150, 760); x.lineTo(1710, 760); x.lineTo(1400, VH); x.lineTo(700, VH); x.closePath(); x.fill();
  x.fillStyle = vgrad(x, 760, VH, dark ? [[0, '#1a1430'], [1, '#0c0a18']] : [[0, '#6a726e'], [1, '#4a524e']]); x.globalAlpha = 0.8; x.fillRect(0, 760, VW, VH); x.globalAlpha = 1;
  x.fillStyle = dark ? '#100c1e' : '#59625e'; x.fillRect(0, 752, VW, 10);
  /* door left */
  x.fillStyle = dark ? '#1a1430' : '#8a948e'; x.fillRect(120, 160, 300, 600);
  x.strokeStyle = dark ? '#0c0a18' : '#5a6460'; x.lineWidth = 8; x.strokeRect(120, 160, 300, 600); x.strokeRect(220, 260, 100, 60);
  if (dark) { x.fillStyle = '#ffae52'; x.fillRect(0, 740, VW, 5); }
  /* chair */
  x.fillStyle = dark ? '#0c0a16' : '#3a403e'; x.fillRect(1350, 770, 120, 14); x.fillRect(1356, 784, 10, 140); x.fillRect(1456, 784, 10, 140); x.fillRect(1452, 600, 14, 180);
}
SH.ilse_kasimir_detention = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var dark = !!p.dark;
  begin(ctx, w, h);
  var z = camZ(t, 0.0025);
  ctx.save(); pushCam(ctx, z, 960, 520);
  blit(ctx, layer('det:' + dark, w, h, function (x) { paintDetention(x, dark); }));
  var L = light('detention', dark);
  drawFigure(ctx, CH.kasimir, 1400, 930, 7.4, { facing: 1, pose: 'sit', L: L, t: t, m: MOODS.tired, bl: blinkAt(t, 37), detail: 1, lw: 2.3 });
  drawFigure(ctx, CH.ilse, 640, 960, 7.4, { facing: -1, pose: 'stand', L: light('detention', dark), t: t, m: MOODS.neutral, bl: blinkAt(t, 11), detail: 1, lw: 2.3 });
  ctx.restore();
  end(ctx);
};

function paintObservation(x, lt) {
  var night = lt < 0.5;
  fillV(x, night ? [[0, '#06040e'], [1, '#120c24']] : [[0, '#2a1e4a'], [0.5, '#c27a6a'], [1, '#ffd2a0']]);
  var r = rng(31);
  for (var s = 0; s < 260; s++) { x.fillStyle = rgba('#e8ecff', (night ? 0.9 : 0.3) * r()); x.fillRect(r() * VW, r() * 700, 2, 2); }
  var cx = 1260, cy = 1500, R = 1000;
  var bands = ['#c98a4a', '#7a4a7a', '#e0a860', '#5a3a6a', '#d89a58', '#6a4070', '#e8b878', '#8a5a70', '#c08050'];
  x.save(); x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.clip();
  for (var b = 0; b < 14; b++) { x.fillStyle = night ? mixc(bands[b % 9], '#120c24', 0.6) : bands[b % 9]; x.fillRect(0, cy - R + b * 70 + (b % 3) * 8, VW, 74); }
  var sg = x.createLinearGradient(cx - R, 0, cx + R, 0); sg.addColorStop(0, 'rgba(0,0,0,0.7)'); sg.addColorStop(0.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.2)');
  x.fillStyle = sg; x.fillRect(0, 0, VW, VH);
  x.restore();
  x.strokeStyle = rgba('#e8d8c0', night ? 0.25 : 0.6); x.lineWidth = 6; x.beginPath(); x.ellipse(cx, cy - 80, R * 1.35, 240, -0.08, Math.PI * 1.05, Math.PI * 1.95); x.stroke();
  /* mirror petals arc across the top */
  for (var k = 0; k < 9; k++) {
    var px = 120 + k * 210, py = 140 + Math.sin(k * 0.7) * 30;
    x.fillStyle = night ? '#1c1830' : '#ffe8c8';
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + 150, py - 20); x.lineTo(px + 170, py + 30); x.lineTo(px + 20, py + 50); x.closePath(); x.fill();
    if (!night) glow(x, px + 85, py + 15, 160, '#fff0d0', 0.4);
  }
  if (!night) glow(x, 1500, 200, 900, '#ffd8a0', 0.55);
  /* frame */
  x.fillStyle = '#05040a';
  x.fillRect(0, 0, 110, VH); x.fillRect(VW - 110, 0, 110, VH); x.fillRect(0, 0, VW, 40);
  for (var m = 1; m < 4; m++) x.fillRect(110 + m * 425 - 10, 40, 20, 900);
  x.fillRect(0, 940, VW, 140);
  x.fillStyle = night ? '#0c0a16' : '#3a2a30'; x.fillRect(0, 940, VW, 6);
}
SH.ilse_kasimir_observation = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var lt = clamp(num(p.light, p.dawn ? 0.1 : 0.5), 0, 1);
  if (p.dawn) lt = lerp(lt, 1, sm(t / 14));
  begin(ctx, w, h);
  var z = camZ(t, 0.002);
  ctx.save(); pushCam(ctx, z, 960, 600);
  blit(ctx, layer('obs:0', w, h, function (x) { paintObservation(x, 0); }));
  if (lt > 0) { ctx.globalAlpha = lt; blit(ctx, layer('obs:1', w, h, function (x) { paintObservation(x, 1); })); ctx.globalAlpha = 1; }
  var L = lt > 0.45 ? light('observation', false, 'dawnback') : light('dark', true, 'backlit');
  drawFigure(ctx, CH.ilse, 820, 1180, 9.4, { view: 'back', pose: 'stand', facing: -1, L: L, t: t, lw: 2.5 });
  drawFigure(ctx, CH.kasimir, 1130, 1190, 9.9, { view: 'back', pose: 'stand', facing: 1, L: L, t: t + 1.7, lw: 2.5 });
  if (lt > 0.3) {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 1450, 250, 1300, '#ff9a50', (lt - 0.3) * 0.25);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  end(ctx);
};

function paintGardenRows(x, dark, wilted) {
  fillV(x, dark ? [[0, '#120c22'], [1, '#06040c']] : [[0, '#241030'], [0.45, '#1a1a24'], [1, '#0a0c0c']]);
  for (var i = 0; i < 5; i++) {
    var lx = 200 + i * 380;
    x.fillStyle = dark ? '#3a2a5a' : '#ffe8ff'; x.fillRect(lx, 60, 260, 16);
    glow(x, lx + 130, 80, 380, dark ? '#5a3a9a' : '#ff6ad0', dark ? 0.3 : 0.45);
    x.fillStyle = rgba(dark ? '#6a4aa0' : '#ff9ae8', dark ? 0.05 : 0.08);
    x.beginPath(); x.moveTo(lx, 76); x.lineTo(lx + 260, 76); x.lineTo(lx + 420, 900); x.lineTo(lx - 160, 900); x.closePath(); x.fill();
  }
  /* rows in perspective: left and right hedges of vines */
  var r = rng(606);
  function row(side) {
    for (var k = 0; k < 160; k++) {
      var u = r(), d = Math.pow(u, 1.6);
      var xx = side < 0 ? lerp(760, 0, d) : lerp(1160, VW, d), yy = lerp(520, 560, d) - r() * lerp(60, 520, d);
      var sz = lerp(10, 70, d);
      var c = dark ? (wilted ? '#2a2a1e' : '#1c2a26') : (wilted ? '#5a5a2a' : (r() < 0.5 ? '#2f7a3a' : '#22582c'));
      x.fillStyle = c; x.beginPath(); x.ellipse(xx, yy + (wilted ? sz * 0.4 : 0), sz, sz * (wilted ? 0.55 : 0.75), 0, 0, TAU); x.fill();
      if (r() < 0.22) { x.fillStyle = dark ? '#5a1a24' : (wilted ? '#7a3a1e' : '#e2402a'); x.beginPath(); x.arc(xx + sz * 0.3, yy + sz * 0.4, sz * 0.3, 0, TAU); x.fill(); }
    }
  }
  row(-1); row(1);
  x.fillStyle = vgrad(x, 560, VH, [[0, dark ? '#140e20' : '#2a2430'], [1, dark ? '#06040a' : '#0e0c10']]);
  x.beginPath(); x.moveTo(760, 560); x.lineTo(1160, 560); x.lineTo(1700, VH); x.lineTo(220, VH); x.closePath(); x.fill();
  x.strokeStyle = rgba(dark ? '#4a3a7a' : '#ff9ae8', 0.25); x.lineWidth = 3;
  x.beginPath(); x.moveTo(900, 560); x.lineTo(700, VH); x.moveTo(1020, 560); x.lineTo(1220, VH); x.stroke();
  if (dark) { x.fillStyle = '#ffae52'; x.fillRect(0, 1040, VW, 5); }
}
function vine(ctx, x0, y0, hgt, L, wilted, seed, t) {
  var r = rng(seed);
  var sway = Math.sin(q12(t) * 0.8 + seed) * 2;
  ctx.strokeStyle = lc(L, wilted ? '#6a6030' : '#3a6a2c'); ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + 20, y0 - hgt * 0.5, x0 + sway, y0 - hgt); ctx.stroke();
  ctx.strokeStyle = lc(L, '#d8d0b8'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 + 4, y0); ctx.lineTo(x0 + 4 + sway, y0 - hgt - 40); ctx.stroke();
  for (var i = 0; i < 18; i++) {
    var u = i / 18, yy = y0 - hgt * u, xx = x0 + Math.sin(u * 3) * 14 + sway * u;
    var sd = i % 2 ? 1 : -1, lx = xx + sd * 48, ly = yy + (wilted ? 34 : -12);
    var leaf = new Path2D();
    leaf.moveTo(xx, yy); leaf.quadraticCurveTo(lx - sd * 6, ly - (wilted ? -16 : 30), lx + sd * 34, ly + (wilted ? 40 : 0)); leaf.quadraticCurveTo(lx, ly + 22, xx, yy);
    cel(ctx, leaf, L, wilted ? '#7a7034' : (r() < 0.5 ? '#3a8a40' : '#2e7034'), { sh: [-3, -4], lw: 2 });
    if (i % 3 === 1) {
      var tom = new Path2D(); tom.arc(xx + (i % 2 ? -14 : 14), yy + 18, wilted ? 9 : 13, 0, TAU);
      cel(ctx, tom, L, wilted ? '#8a4a2a' : '#d8362a', { sh: [-4, -4], hiFn: function (c) { c.beginPath(); c.arc(xx + (i % 2 ? -18 : 10), yy + 13, 3.4, 0, TAU); c.fill(); }, hiA: 0.7, lw: 2 });
    }
  }
}
SH.ilse_severin_garden = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var dark = !!p.dark, wilted = !!p.wilted;
  begin(ctx, w, h);
  var z = camZ(t, 0.0025);
  ctx.save(); pushCam(ctx, z, 960, 560);
  blit(ctx, layer('grow:' + dark + ':' + wilted, w, h, function (x) { paintGardenRows(x, dark, wilted); }));
  var L = light('garden', dark);
  vine(ctx, 1700, 1000, 640, L, wilted, 11, t);
  drawFigure(ctx, CH.ilse, 620, 1010, 7.6, { facing: -1, pose: 'stand', L: light('garden', dark), t: t, m: MOODS.neutral, bl: blinkAt(t, 11), detail: 1, lw: 2.3 });
  var sv = variant(CH.severin, {}); sv.fig = variant(CH.severin.fig, { gloves: '#b8a888' }); sv._g = CH.severin._g;
  drawFigure(ctx, sv, 1350, 1000, 7.6, { facing: -1, pose: 'prune', L: L, t: t, m: MOODS.soft, bl: blinkAt(t, 53), detail: 1, lw: 2.3 });
  vine(ctx, 1530, 1080, 760, L, wilted, 23, t + 1);
  ctx.restore();
  end(ctx);
};

SH.severin_gallery = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  begin(ctx, w, h);
  var dark = !!p.dark;
  blit(ctx, layer('gal:' + dark, w, h, function (x) {
    fillV(x, [[0, '#06070e'], [1, '#0c0e1a']]);
    x.fillStyle = dark ? '#1a0e26' : '#141a30'; x.fillRect(0, 0, 360, VH); x.fillRect(VW - 300, 0, 300, VH);
    for (var i = 0; i < 6; i++) { x.fillStyle = rgba(dark ? '#5a2a3a' : '#2a3a6a', 0.5); x.fillRect(30 + i * 50, 0, 22, VH); }
    x.fillStyle = dark ? '#3a1a1a' : '#1c2848'; x.fillRect(VW - 260, 0, 200, VH);
    glow(x, 960, 1300, 900, dark ? '#ff7a40' : '#e8c890', 0.35);
  }));
  var z = camZ(t, 0.003);
  ctx.save(); pushCam(ctx, z, 1000, 500);
  var L = light('hall', dark, 'gallery');
  ctx.save(); ctx.translate(1010, 470 + Math.sin(t * TAU / 5) * 2); ctx.scale(3.2, 3.2);
  var gl = ((t + 0.8) % 6.5);
  drawBust(ctx, CH.severin, { L: L, lw: 2.6 / 3.2, m: MOODS.neutral, bl: blinkAt(t, 53), t: t, detail: 2, rimW: 1.6, dark: true, glint: gl < 1.2 ? gl / 1.2 : -1 });
  ctx.restore();
  /* balustrade */
  ctx.fillStyle = '#05050a'; ctx.fillRect(0, 820, VW, 260);
  ctx.fillStyle = dark ? '#3a1c1c' : '#1e2a48'; ctx.fillRect(0, 812, VW, 20);
  ctx.fillStyle = rgba(dark ? '#ff9a50' : '#d1a54a', 0.8); ctx.fillRect(0, 812, VW, 3);
  for (var b = 0; b < 16; b++) { ctx.fillStyle = '#0a0c16'; ctx.fillRect(40 + b * 124, 832, 30, 260); ctx.fillStyle = rgba(dark ? '#ff9a50' : '#d1a54a', 0.25); ctx.fillRect(40 + b * 124, 832, 4, 260); }
  ctx.restore();
  end(ctx);
};

function paintHallDoors(x) {
  fillV(x, [[0, '#121a36'], [1, '#0a0e1e']]);
  x.fillStyle = vgrad(x, 700, VH, [[0, '#2a2a3e'], [1, '#141422']]); x.fillRect(0, 700, VW, 380);
  for (var i = 0; i < 12; i++) { x.strokeStyle = 'rgba(200,180,120,0.12)'; x.lineWidth = 2; x.beginPath(); x.moveTo(960 + (i - 6) * 60, 700); x.lineTo(960 + (i - 6) * 300, VH); x.stroke(); }
  x.fillStyle = '#0a0e1e'; x.fillRect(1100, 120, 560, 600);
  x.fillStyle = vgrad(x, 140, 700, [[0, '#ffe8c0'], [1, '#d8b080']]); x.fillRect(1130, 150, 500, 560);
  glow(x, 1380, 420, 600, '#ffd8a0', 0.4);
  x.fillStyle = 'rgba(255,220,160,0.18)'; x.beginPath(); x.moveTo(1130, 710); x.lineTo(1630, 710); x.lineTo(1900, VH); x.lineTo(700, VH); x.closePath(); x.fill();
  for (var k = 0; k < 3; k++) { x.fillStyle = '#1e3266'; x.fillRect(100 + k * 260, 60, 150, 520); x.fillStyle = '#d1a54a'; x.fillRect(165 + k * 260, 60, 20, 520); x.beginPath(); x.moveTo(100 + k * 260, 580); x.lineTo(175 + k * 260, 640); x.lineTo(250 + k * 260, 580); x.fillStyle = '#1e3266'; x.fill(); }
  x.fillStyle = '#8a3a22'; x.fillRect(1720, 60, 150, 520); x.fillStyle = '#c88a3a'; x.fillRect(1785, 60, 20, 520);
}
var DELEGATES = null;
function delegates() {
  if (DELEGATES) return DELEGATES;
  DELEGATES = [
    variant(CH.juno, { id: 'd1', hair: '#2a1a14', hairHi: '#4a3226', skin: '#d8a888', style: 'bob', freckles: 0, fig: { coat: '#9a6a2a', coatLen: 70, pants: '#2a2420', shoe: '#1a1410', sleeve: '#9a6a2a', sw: 9.4, collar: 'crew' } }),
    variant(CH.kasimir, { id: 'd2', skin: '#c89070', hair: '#4a3a2e', scar: 0, grey: 0, sheen: 0, fig: { coat: '#7a3a24', coatLen: 66, pants: '#2a221c', shoe: '#1a1410', sleeve: '#7a3a24', sw: 11, collar: 'crew' } }),
    variant(CH.teo, { id: 'd3', hair: '#5a3a24', skin: '#e8c0a0', fig: { coat: '#6a7a8a', coatLen: 60, pants: '#2a2c30', shoe: '#1a1a1c', sleeve: '#6a7a8a', sw: 10, collar: 'crew' } })
  ];
  return DELEGATES;
}
SH.kasimir_entrance = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  begin(ctx, w, h);
  blit(ctx, layer('hallDoors', w, h, paintHallDoors), camZ(t, 0.002), 960, 600);
  var Ld = light('hall', false, 'backlit'), Lk = light('hall', false, 'lamp');
  var D = delegates(), speed = 34;
  var xs = [880, 1060, 1230], ss = [6.2, 6.4, 6.3];
  for (var i = 0; i < 3; i++) drawFigure(ctx, D[i], xs[i] - t * speed, 1000 + i * 4, ss[i], { facing: 1, pose: 'walk', L: Ld, t: t, phase: i * 1.9, detail: 0, lw: 2 });
  var kx = 1520 - t * speed * 0.92;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,220,160,0.10)'; ctx.beginPath(); ctx.moveTo(kx - 40, -50); ctx.lineTo(kx + 100, -50); ctx.lineTo(kx + 260, 1080); ctx.lineTo(kx - 260, 1080); ctx.closePath(); ctx.fill();
  ctx.restore();
  drawFigure(ctx, CH.kasimir, kx, 1030, 7, { facing: 1, pose: 'walk', L: Lk, t: t * 0.92, phase: 0.6, m: MOODS.neutral, bl: blinkAt(t, 37), detail: 1, lw: 2.2 });
  end(ctx);
};

SH.podium = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var who = p.who === 'kasimir' ? 'kasimir' : (p.who === 'chair' ? 'chair' : 'ilse');
  var dark = !!p.dark, ch = CH[who];
  begin(ctx, w, h);
  var z = camZ(t, 0.0035, 0.07);
  blit(ctx, bgCanvas('hall', dark, w, h), 1.06 + (z - 1) * 0.4);
  ctx.save(); pushCam(ctx, z, 960, 520);
  var L = light('hall', dark);
  var face = who === 'ilse' ? -1 : 1;
  ctx.save(); ctx.translate(960 + face * -40, 430 + Math.sin(t * TAU / 4.6) * 2); ctx.scale(face * 3.4, 3.4);
  var md = mood(p.mood || (who === 'ilse' ? 'resolve' : 'neutral'));
  drawBust(ctx, ch, { L: L, lw: 2.6 / 3.4, m: md, bl: blinkAt(t, ch.seed), t: t, detail: 2, rimW: 1.6, dark: dark });
  ctx.restore();
  /* podium */
  var pod = new Path2D(); pod.moveTo(620, 1100); pod.lineTo(680, 830); pod.lineTo(1240, 830); pod.lineTo(1300, 1100); pod.closePath();
  cel(ctx, pod, L, dark ? '#2a2440' : '#e4dcc8', { sh: [-30, 0], lw: 3 });
  var lip = new Path2D(); lip.rect(650, 812, 620, 32);
  cel(ctx, lip, L, dark ? '#3a3050' : '#f0e8d8', { lw: 3 });
  ctx.fillStyle = lc(L, '#d1a54a'); ctx.fillRect(650, 840, 620, 6);
  /* emblem: a ring with eight petals (Concordat) */
  ctx.save(); ctx.translate(960, 960);
  ctx.strokeStyle = lc(L, '#c9a046'); ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 70, 0, TAU); ctx.stroke();
  ctx.fillStyle = lc(L, '#c9a046');
  for (var k = 0; k < 8; k++) { ctx.save(); ctx.rotate(k * TAU / 8); ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(12, -58); ctx.lineTo(-12, -58); ctx.closePath(); ctx.fill(); ctx.restore(); }
  ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
  ctx.restore();
  /* microphone */
  ctx.strokeStyle = '#0a0a10'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(1180, 820); ctx.quadraticCurveTo(1180, 700, 1110, 670); ctx.stroke();
  ctx.fillStyle = '#16161e'; ctx.beginPath(); ctx.ellipse(1102, 666, 16, 11, -0.4, 0, TAU); ctx.fill();
  ctx.restore();
  end(ctx);
};

function paintCockpit(x) {
  fillV(x, [[0, '#04050c'], [1, '#0a0c16']]);
  var r = rng(70);
  for (var s = 0; s < 300; s++) { x.fillStyle = rgba('#dfe6ff', r()); var sz = r() < 0.05 ? 3 : 1.6; x.fillRect(r() * VW, r() * 600, sz, sz); }
  glow(x, 1600, 160, 300, '#b88aa0', 0.25);
  x.fillStyle = '#c99a6a'; x.beginPath(); x.arc(1700, 120, 90, 0, TAU); x.fill();
  x.fillStyle = 'rgba(90,50,90,0.6)'; x.fillRect(1600, 100, 200, 14); x.fillRect(1600, 140, 200, 10);
  x.fillStyle = '#04050c'; x.beginPath(); x.arc(1730, 110, 92, 0, TAU); x.fill();
  /* canopy frame */
  x.fillStyle = '#0e1016';
  x.beginPath(); x.moveTo(0, 0); x.lineTo(180, 0); x.lineTo(380, 640); x.lineTo(0, 700); x.closePath(); x.fill();
  x.beginPath(); x.moveTo(VW, 0); x.lineTo(VW - 180, 0); x.lineTo(VW - 380, 640); x.lineTo(VW, 700); x.closePath(); x.fill();
  x.fillRect(930, 0, 60, 620);
  /* dash */
  x.fillStyle = '#161a22'; x.beginPath(); x.moveTo(0, 600); x.quadraticCurveTo(960, 520, VW, 600); x.lineTo(VW, VH); x.lineTo(0, VH); x.fill();
  var cols = ['#40e0a0', '#ffb040', '#40c0ff', '#ff6050'];
  for (var i = 0; i < 14; i++) { var c = cols[i % 4]; x.fillStyle = rgba(c, 0.85); var bx = 120 + i * 125, by = 640 + (i % 3) * 18; x.fillRect(bx, by, 70 + (i % 2) * 30, 34); glow(x, bx + 40, by + 17, 110, c, 0.22); }
  for (var j = 0; j < 40; j++) { x.fillStyle = cols[j % 4]; x.fillRect(80 + r() * 1760, 720 + r() * 80, 6, 6); }
  /* licorice root on the dash */
  x.strokeStyle = '#5a3a22'; x.lineWidth = 10; x.lineCap = 'round'; x.beginPath(); x.moveTo(1300, 612); x.lineTo(1420, 600); x.stroke();
}
SH.juno_mira_cockpit = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  begin(ctx, w, h);
  blit(ctx, layer('cockpit', w, h, paintCockpit), camZ(t, 0.002), 960, 500);
  var Lj = light('ship', !!p.dark, 'backlit');
  function seat(cx) {
    var sp = P2([[cx - 230, 1100, 1], [cx - 250, 760], [cx - 200, 600], [cx + 200, 600], [cx + 250, 760], [cx + 230, 1100, 1]]);
    cel(ctx, sp, Lj, '#3a3a40', { sh: [-30, -10], rim: [-6, 4], lw: 3 });
  }
  function occupant(ch, cx, tt, turn) {
    var st = { L: Lj, lw: 2.6 / 2.6, m: MOODS.neutral, bl: 0, t: tt, detail: 1, rimW: 2.2, dark: true };
    ctx.save(); ctx.translate(cx, 1100);
    var sh = P2([[-260, 0, 1], [-250, -170], [-150, -250], [150, -250], [250, -170], [260, 0, 1]]);
    cel(ctx, sh, Lj, ch.fig.coat, { sh: [-20, -10], rim: [-6, 3], lw: 3 });
    ctx.translate(Math.sin(tt * 0.3) * 4, -500 + Math.sin(tt * TAU / 4.6) * 2); ctx.rotate(turn); ctx.scale(2.6, 2.6);
    drawHeadBack(ctx, ch, st);
    ctx.restore();
  }
  seat(560); seat(1360);
  occupant(CH.juno, 560, t, -0.06);
  occupant(CH.mira, 1360, t + 1.4, 0.05);
  end(ctx);
};

function paintHold(x) {
  fillV(x, [[0, '#120c0a'], [1, '#080606']]);
  x.fillStyle = '#1c1612'; for (var i = 0; i < 8; i++) x.fillRect(i * 260, 0, 30, 760);
  x.fillStyle = '#22180f'; x.fillRect(0, 200, VW, 20);
  glow(x, 960, 300, 900, '#ffb060', 0.28);
  x.fillStyle = rgba('#ffc070', 0.08); x.beginPath(); x.moveTo(920, 180); x.lineTo(1000, 180); x.lineTo(1500, VH); x.lineTo(420, VH); x.closePath(); x.fill();
  x.fillStyle = vgrad(x, 760, VH, [[0, '#2a1e16'], [1, '#100a08']]); x.fillRect(0, 760, VW, 320);
  x.fillStyle = '#3a2a1a'; x.fillRect(80, 520, 280, 260); x.fillRect(1560, 480, 300, 300); x.fillStyle = '#2a1e12'; x.fillRect(90, 530, 260, 8); x.fillRect(1570, 490, 280, 8);
  x.strokeStyle = '#8a6a2a'; x.lineWidth = 4; x.strokeRect(1600, 540, 220, 200);
  x.fillStyle = '#c08a2a'; x.font = 'bold 40px monospace'; x.fillText('ICE-4', 1640, 650);
  x.strokeStyle = '#0a0606'; x.lineWidth = 6; x.beginPath(); x.moveTo(960, 0); x.lineTo(960, 170); x.stroke();
}
SH.hold_trio = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  begin(ctx, w, h);
  var z = camZ(t, 0.0025);
  ctx.save(); pushCam(ctx, z, 960, 600);
  blit(ctx, layer('hold', w, h, paintHold));
  var L = light('ship', false, 'lamp');
  var sw = Math.sin(t * 0.7) * 0.05;
  drawFigure(ctx, CH.mira, 1010, 980, 6.6, { facing: 1, pose: 'stand', L: L, t: t, m: MOODS.neutral, bl: blinkAt(t, 23), detail: 1, lw: 2.2 });
  drawFigure(ctx, CH.juno, 560, 1040, 7.4, { facing: -1, pose: 'stand', L: L, t: t + 1, m: MOODS.neutral, bl: blinkAt(t, 71), detail: 1, lw: 2.2 });
  /* crate with device */
  var crate = new Path2D(); crate.rect(700, 820, 560, 260);
  cel(ctx, crate, L, '#5a4028', { sh: [-40, -20], lw: 3 });
  ctx.strokeStyle = lc(L, '#3a2a18'); ctx.lineWidth = 4; ctx.strokeRect(720, 840, 520, 220);
  var dev = new Path2D(); dev.rect(880, 760, 220, 64);
  cel(ctx, dev, L, '#3a4048', { sh: [-10, -6], lw: 3 });
  ctx.fillStyle = '#081410'; ctx.fillRect(900, 772, 90, 40);
  ctx.fillStyle = '#40e090'; ctx.font = '12px monospace'; ctx.fillText('7F3A', 908, 790); ctx.fillText('C2E1', 908, 806);
  for (var k = 0; k < 4; k++) { var on = (Math.floor(t * 2 + k * 1.3) % 3) !== 0; ctx.fillStyle = on ? ['#40ff90', '#ffb040', '#40c0ff', '#ff5040'][k] : '#202020'; ctx.beginPath(); ctx.arc(1010 + k * 22, 792, 5, 0, TAU); ctx.fill(); if (on) glow(ctx, 1010 + k * 22, 792, 16, ['#40ff90', '#ffb040', '#40c0ff', '#ff5040'][k], 0.5); }
  drawFigure(ctx, CH.teo, 1400, 1060, 7.4, { facing: 1, pose: 'crouch', L: L, t: t + 2, m: MOODS.neutral, bl: blinkAt(t, 89), detail: 1, lw: 2.2 });
  /* lamp */
  ctx.save(); ctx.translate(960, 170); ctx.rotate(sw);
  ctx.fillStyle = '#1a1410'; ctx.beginPath(); ctx.moveTo(-60, 40); ctx.lineTo(60, 40); ctx.lineTo(30, 0); ctx.lineTo(-30, 0); ctx.closePath(); ctx.fill();
  glow(ctx, 0, 44, 90, '#ffe0a0', 0.9);
  ctx.restore();
  ctx.restore();
  end(ctx);
};

function paintSpine(x) {
  fillV(x, [[0, '#06060a'], [1, '#0a0a10']]);
  for (var i = 0; i < 14; i++) {
    var xx = i * 150 - 40;
    x.fillStyle = '#16181e'; x.fillRect(xx, 0, 34, VH);
    x.fillStyle = '#22262e'; x.fillRect(xx, 0, 6, VH);
  }
  x.fillStyle = '#101216'; x.fillRect(0, 0, VW, 240); x.fillRect(0, 880, VW, 200);
  x.fillStyle = '#1e2228'; x.fillRect(0, 236, VW, 8); x.fillRect(0, 872, VW, 10);
  for (var k = 0; k < 40; k++) { x.fillStyle = k % 7 ? '#2a2e36' : '#5a2a2a'; x.fillRect(k * 50, 300 + (k % 3) * 8, 24, 6); }
  x.strokeStyle = '#1a1c22'; x.lineWidth = 14; x.beginPath(); x.moveTo(0, 330); x.lineTo(VW, 330); x.stroke();
}
SH.spine_mira_teo = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  begin(ctx, w, h);
  var dx = -t * 6;
  blit(ctx, layer('spine', w, h, paintSpine), 1.05, 960, 540, dx % 150, 0);
  var L = light('spine', !!p.dark, 'lampBack');
  function torch(x0, y0, ang) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(x0, y0, 0, x0, y0, 700);
    g.addColorStop(0, 'rgba(255,240,200,0.5)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(ang - 0.28) * 800, y0 + Math.sin(ang - 0.28) * 800); ctx.lineTo(x0 + Math.cos(ang + 0.28) * 800, y0 + Math.sin(ang + 0.28) * 800); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  var Wt = drawFigure(ctx, CH.teo, 1330, 880, 9.2, { facing: 1, pose: 'crawl', L: L, t: t, phase: 1.3, lw: 2.2, detail: 0 });
  var Wm = drawFigure(ctx, CH.mira, 760, 880, 9.2, { facing: 1, pose: 'crawl', L: L, t: t, lw: 2.2, detail: 0 });
  torch(Wm.wN[0] - 20, Wm.wN[1] - 40, Math.PI * 1.02 + Math.sin(q12(t) * 0.7) * 0.06);
  torch(Wt.wN[0] - 20, Wt.wN[1] - 40, Math.PI * 1.08 + Math.sin(q12(t) * 0.9 + 1) * 0.06);
  if (p.alarm && Math.floor(t * 1.5) % 2 === 0) { ctx.fillStyle = 'rgba(255,30,30,0.18)'; ctx.fillRect(0, 0, VW, VH); }
  end(ctx);
};

SH.mira_docks_fire = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  begin(ctx, w, h);
  var z = camZ(t, 0.0025);
  ctx.save(); pushCam(ctx, z, 960, 700);
  blit(ctx, layer('docksfire', w, h, function (x) {
    paintHabitat(x, 'fire', 760, 260, 420, 1500);
    x.fillStyle = vgrad(x, 820, VH, [[0, '#1a1024'], [1, '#08060c']]); x.fillRect(0, 820, VW, 260);
    x.fillStyle = '#0c0814'; x.fillRect(0, 806, VW, 18);
    for (var i = 0; i < 11; i++) { x.fillRect(i * 190 + 30, 700, 8, 110); }
    x.fillRect(0, 700, VW, 8);
    x.fillStyle = '#100a18'; x.fillRect(1560, 380, 360, 440); x.fillRect(1500, 520, 80, 300);
  }));
  /* smoke columns over the fire (fire at ~1320, 780 in painting) */
  var tq = q12(t);
  for (var i = 0; i < 9; i++) {
    var k = (tq * 0.05 + i / 9) % 1;
    var sx = 1290 + Math.sin(i * 2.3) * 60 - k * 220, sy = 740 - k * 620;
    var sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 80 + k * 200);
    sg.addColorStop(0, rgba('#2a1830', 0.55 * (1 - k))); sg.addColorStop(1, rgba('#2a1830', 0));
    ctx.fillStyle = sg; ctx.fillRect(sx - 300, sy - 300, 600, 600);
  }
  var fl = 0.85 + 0.15 * Math.sin(tq * 7) * Math.sin(tq * 3.3);
  ctx.globalCompositeOperation = 'lighter'; glow(ctx, 1320, 780, 260 * fl, '#ff7a20', 0.4); ctx.globalCompositeOperation = 'source-over';
  var L = light('dark', true, 'fire');
  drawFigure(ctx, CH.mira, 760, 1010, 3.6, { view: 'back', pose: 'stand', facing: -1, L: L, t: t * 0.3, lw: 1.8 });
  ctx.fillStyle = rgba('#ff8a30', 0.12 * fl); ctx.fillRect(0, 0, VW, VH);
  ctx.restore();
  end(ctx);
};

function paintDockShip(x) {
  fillV(x, [[0, '#1e2236'], [1, '#0c0e18']]);
  for (var i = 0; i < 7; i++) { x.fillStyle = '#121626'; x.fillRect(i * 300 + 60, 0, 40, 700); glow(x, i * 300 + 220, 120, 140, '#ffb060', 0.5); }
  /* Kestrel Moth hull */
  var hull = new Path2D(); hull.moveTo(380, 640); hull.lineTo(520, 200); hull.lineTo(1500, 170); hull.lineTo(1720, 300); hull.lineTo(1760, 640); hull.closePath();
  x.fillStyle = '#4a4e58'; x.fill(hull);
  x.save(); x.clip(hull);
  x.fillStyle = '#3a3e48'; x.fillRect(380, 420, 1400, 240);
  x.strokeStyle = '#2a2e36'; x.lineWidth = 4;
  for (var k = 0; k < 14; k++) { x.beginPath(); x.moveTo(520 + k * 90, 170); x.lineTo(470 + k * 95, 660); x.stroke(); }
  x.beginPath(); x.moveTo(380, 330); x.lineTo(1760, 300); x.stroke();
  x.fillStyle = '#8a4a2a'; x.fillRect(560, 250, 260, 40);
  x.fillStyle = '#d8c8a0'; x.font = 'bold 44px monospace'; x.fillText('KESTREL MOTH', 880, 280);
  x.fillStyle = '#2a2a30'; x.fillRect(1100, 380, 200, 260);
  x.fillStyle = '#ffd8a0'; x.fillRect(1116, 396, 168, 244);
  x.restore();
  x.strokeStyle = '#14161e'; x.lineWidth = 6; x.stroke(hull);
  glow(x, 1200, 560, 300, '#ffc080', 0.4);
  x.fillStyle = vgrad(x, 640, VH, [[0, '#2a2c38'], [1, '#101218']]); x.fillRect(0, 640, VW, 440);
  x.fillStyle = 'rgba(255,200,140,0.12)'; x.beginPath(); x.moveTo(1116, 640); x.lineTo(1284, 640); x.lineTo(1500, VH); x.lineTo(900, VH); x.closePath(); x.fill();
  for (var j = 0; j < 10; j++) { x.fillStyle = j % 2 ? '#c8a02a' : '#1a1a1a'; x.beginPath(); x.moveTo(j * 200, 980); x.lineTo(j * 200 + 100, 980); x.lineTo(j * 200 + 60, 1010); x.lineTo(j * 200 - 40, 1010); x.fill(); }
}
SH.dock_farewell = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  begin(ctx, w, h);
  var z = camZ(t, 0.0025);
  ctx.save(); pushCam(ctx, z, 960, 600);
  blit(ctx, layer('dockship', w, h, paintDockShip));
  var L = light('dock', !!p.dark);
  var hg = p.hug ? sm((t - 1.5) / 3.5) : 0, hugged = hg > 0.7;
  var ix = lerp(660, 880, hg), mx = lerp(1260, 1000, hg);
  var s1 = 7.6, s2 = 7.2;
  drawFigure(ctx, CH.ilse, ix, 1010, s1, { facing: -1, pose: hugged ? 'hug' : 'stand', L: L, t: t, m: hugged ? MOODS.grief : MOODS.soft, bl: blinkAt(t, 11), detail: 1, lw: 2.3 });
  var Wm = drawFigure(ctx, CH.mira, mx, 1000, s2, { facing: 1, pose: hugged ? 'hug' : 'stand', L: L, t: t + 1, m: hugged ? MOODS.grief : MOODS.neutral, bl: blinkAt(t, 23), detail: 1, lw: 2.3 });
  if (hugged) {
    /* Ilse's arm around Mira's back */
    var bx = mx + 6 * s2, by = 1000 - 74 * s2;
    limb(ctx, [[bx - 4 * s2, by - 2 * s2], [bx + 3 * s2, by + 2 * s2], [bx + 6 * s2, by + 9 * s2]], [5 * s1, 4.2 * s1], L, '#3a3d45', 2.3, -1, 0.3);
    ctx.fillStyle = L.ink; ctx.beginPath(); ctx.ellipse(bx + 6.4 * s2, by + 11.5 * s2, 2.4 * s2 + 2, 3 * s2 + 2, 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = lc(L, CH.ilse.skin); ctx.beginPath(); ctx.ellipse(bx + 6.4 * s2, by + 11.5 * s2, 2.4 * s2, 3 * s2, 0.3, 0, TAU); ctx.fill();
  }
  ctx.restore();
  end(ctx);
};

SH.teo_released = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  begin(ctx, w, h);
  blit(ctx, layer('gate', w, h, function (x) {
    fillV(x, [[0, '#2a2e3a'], [1, '#14161e']]);
    x.fillStyle = '#0e1016'; x.fillRect(560, 80, 800, 760);
    x.fillStyle = vgrad(x, 100, 820, [[0, '#f4f8ff'], [1, '#c8d4e0']]); x.fillRect(600, 110, 720, 720);
    glow(x, 960, 450, 700, '#ffffff', 0.45);
    x.fillStyle = 'rgba(230,240,255,0.16)'; x.beginPath(); x.moveTo(600, 830); x.lineTo(1320, 830); x.lineTo(1700, VH); x.lineTo(220, VH); x.closePath(); x.fill();
    x.fillStyle = vgrad(x, 830, VH, [[0, '#2a2e38'], [1, '#101216']]); x.globalAlpha = 0.85; x.fillRect(0, 830, VW, 250); x.globalAlpha = 1;
    for (var i = 0; i < 5; i++) { x.fillStyle = '#1a1c24'; x.fillRect(i * 110 + 20, 0, 50, VH); x.fillRect(VW - i * 110 - 70, 0, 50, VH); }
  }), camZ(t, 0.002), 960, 500);
  var L = light('detention', false, 'backlit');
  var adv = sm(t / 12);
  var s = lerp(6.4, 7.4, adv);
  drawFigure(ctx, CH.teo, 960 - 40 * adv, lerp(860, 980, adv), s, { facing: 1, pose: 'walk', L: L, t: t * 0.55, m: MOODS.tired, bl: blinkAt(t, 89), detail: 1, lw: 2.2, jacket: 1 });
  drawFigure(ctx, CH.juno, 1660, 1170, 9.6, { view: 'back', facing: 1, pose: 'stand', L: light('dock', false, 'backlit'), t: t, lw: 2.4 });
  end(ctx);
};

SH.officers_garden = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  begin(ctx, w, h);
  var z = camZ(t, 0.002);
  ctx.save(); pushCam(ctx, z, 900, 600);
  blit(ctx, layer('offgarden', w, h, function (x) {
    paintGardenRows(x, true, true);
    x.fillStyle = '#05040a'; x.fillRect(240, 260, 320, 560);
    x.fillStyle = vgrad(x, 280, 800, [[0, '#e8f0ff'], [1, '#a8b8d0']]); x.fillRect(260, 280, 280, 520);
    glow(x, 400, 520, 420, '#d8e4ff', 0.4);
    x.fillStyle = 'rgba(220,230,255,0.12)'; x.beginPath(); x.moveTo(260, 800); x.lineTo(540, 800); x.lineTo(900, VH); x.lineTo(0, VH); x.closePath(); x.fill();
  }));
  var Lo = light('detention', false, 'backlit');
  drawFigure(ctx, CH.officer, 360, 800, 4.9, { facing: -1, pose: 'stand', L: Lo, t: t, detail: 0, lw: 1.8 });
  drawFigure(ctx, CH.officer, 470, 806, 5.0, { facing: -1, pose: 'behind', L: Lo, t: t + 2, detail: 0, lw: 1.8 });
  var L = light('garden', true);
  vine(ctx, 1800, 1100, 700, L, true, 5, t);
  var W = drawFigure(ctx, CH.severin, 1330, 1080, 8.6, { facing: 1, pose: 'sitLap', L: L, t: t, m: MOODS.tired, bl: blinkAt(t, 53), detail: 1, lw: 2.4 });
  /* the helmet on his lap */
  var hx = (W.wF[0] + W.wN[0]) / 2 - 10, hy = (W.wF[1] + W.wN[1]) / 2 - 30;
  drawHelmet(ctx, hx, hy, 0.42, L, 0.3);
  ctx.restore();
  end(ctx);
};

/* ============================================================ HANDS (V-space rigs) */
function handRig(ctx, L, H) {
  var lw = H.lw || 3;
  if (H.cuff) cel(ctx, P2(H.cuff.pts), L, H.cuff.col, { sh: H.cuff.sh || [-18, -10], rim: H.rim ? [-4, 0] : null, lw: lw });
  var i;
  for (i = 0; i < (H.back || []).length; i++) limb(ctx, H.back[i].p, H.back[i].w, L, H.back[i].c || H.skin, lw, H.lx, H.ly);
  if (H.palm) cel(ctx, P2(H.palm), L, H.palmSkin || H.skin, { sh: H.sh || [-10, -10], rim: H.rim ? [-4, 1] : null, lw: lw });
  for (i = 0; i < (H.front || []).length; i++) limb(ctx, H.front[i].p, H.front[i].w, L, H.front[i].c || H.skin, lw, H.lx, H.ly);
  if (H.thumb) limb(ctx, H.thumb.p, H.thumb.w, L, H.thumb.c || H.skin, lw, H.lx, H.ly);
  ctx.lineCap = 'round';
  if (H.nails) for (i = 0; i < H.nails.length; i++) {
    var n = H.nails[i];
    ctx.fillStyle = lhi(L, H.skin, 0.32); ctx.beginPath(); ctx.ellipse(n[0], n[1], n[2], n[3], n[4] || 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = ls(L, H.skin); ctx.lineWidth = lw * 0.7; ctx.stroke();
  }
  if (H.creases) { ctx.strokeStyle = ls(L, H.skin); ctx.lineWidth = lw * 0.9; for (i = 0; i < H.creases.length; i++) { var c = H.creases[i]; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.quadraticCurveTo(c[2], c[3], c[4], c[5]); ctx.stroke(); } }
  if (H.scars) for (i = 0; i < H.scars.length; i++) { var s = H.scars[i]; ctx.fillStyle = lc(L, '#e8b8b0'); ctx.beginPath(); ctx.ellipse(s[0], s[1], s[2], s[2] * 0.6, s[3] || 0, 0, TAU); ctx.fill(); ctx.strokeStyle = lc(L, '#b07a70'); ctx.lineWidth = 1.2; ctx.stroke(); }
}
/* back-of-hand reaching rig: wrist at (0,0), fingers toward +x; curl 0..1; returned in world via transform */
function reachHand(ctx, L, o) {
  ctx.save();
  ctx.translate(o.x, o.y); ctx.rotate(o.rot || 0); ctx.scale(o.s || 1, (o.s || 1) * (o.flip ? -1 : 1));
  var c = o.curl || 0, sp = o.spread === undefined ? 1 : o.spread;
  function fin(by, len, ang, w) {
    var a = ang * sp, p0 = [150, by], d1 = len * 0.45, d2 = len * 0.32 * (1 - c * 0.3), d3 = len * 0.25 * (1 - c * 0.5);
    var a1 = a + c * 0.25, a2 = a1 + c * 0.6, a3 = a2 + c * 0.7;
    var p1 = [p0[0] + Math.cos(a1) * d1, p0[1] + Math.sin(a1) * d1];
    var p2 = [p1[0] + Math.cos(a2) * d2, p1[1] + Math.sin(a2) * d2];
    var p3 = [p2[0] + Math.cos(a3) * d3, p2[1] + Math.sin(a3) * d3];
    return { p: [p0, p1, p2, p3], w: [w, w * 0.76], tip: p3, a: a3 };
  }
  var f = [fin(-40, 158, -0.14, 36), fin(-13, 176, -0.03, 37), fin(14, 164, 0.06, 35), fin(38, 128, 0.16, 30)];
  var nails = f.map(function (q) { return [q.tip[0] - Math.cos(q.a) * 10, q.tip[1] - Math.sin(q.a) * 10, 11, 8.5, q.a]; });
  var scars = o.scars ? [[f[0].p[2][0], f[0].p[2][1], 9, 0.2], [f[1].p[1][0] + 10, f[1].p[1][1], 7], [f[3].p[2][0], f[3].p[2][1], 7], [170, -30, 8]] : null;
  handRig(ctx, L, {
    skin: o.skin, lw: (o.lw || 3) / (o.s || 1), lx: 0, ly: 1,
    cuff: { pts: [[-260, -82], [10, -78], [22, 0], [10, 80], [-260, 86]], col: o.sleeve },
    back: [f[3], f[2], f[1], f[0]],
    palm: [[0, -58], [120, -64], [168, -52], [176, 0], [168, 54], [110, 66], [0, 58], [-10, 0]],
    thumb: { p: [[60, -54], [120, -96], [170, -112], [205, -112]], w: [42, 32] },
    nails: nails.concat([[192, -112, 11, 8.5, 0.1]]),
    creases: [[150, -46, 156, -40, 152, -32], [150, -18, 156, -12, 152, -4], [150, 10, 156, 16, 152, 24]],
    scars: scars, rim: 1
  });
  ctx.restore();
  return f;
}

/* ============================================================ PROP PIECES */
function lighterShape(ctx, L, x, y, s, open, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(s, s);
  var brass = '#c9a24a';
  var body = new Path2D(); body.roundRect ? body.roundRect(-70, 0, 140, 170, 16) : body.rect(-70, 0, 140, 170);
  cel(ctx, body, L, brass, { sh: [-22, -6], hiFn: function (c) { c.fillRect(-52, 0, 18, 170); }, hiA: 0.55, rim: [-4, 0], lw: 4 });
  ctx.strokeStyle = ls(L, brass); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-30, 40); ctx.lineTo(-10, 70); ctx.moveTo(20, 110); ctx.lineTo(40, 100); ctx.moveTo(-40, 130); ctx.lineTo(-18, 128); ctx.stroke();
  ctx.font = 'italic bold 30px serif'; ctx.fillStyle = ls(L, brass); ctx.fillText('D.V.', -26, 98);
  if (open) {
    var ch = new Path2D(); ch.rect(-52, -96, 104, 96);
    cel(ctx, ch, L, '#b8b4ac', { sh: [-14, 0], lw: 3.5 });
    ctx.fillStyle = lc(L, '#3a3632');
    for (var r = 0; r < 3; r++) for (var c = 0; c < 4; c++) { ctx.beginPath(); ctx.arc(-34 + c * 22, -76 + r * 22, 5, 0, TAU); ctx.fill(); }
    var wh = new Path2D(); wh.arc(52, -96, 18, 0, TAU);
    cel(ctx, wh, L, '#7a746a', { sh: [-5, -5], lw: 3 });
    ctx.strokeStyle = ls(L, '#7a746a'); ctx.lineWidth = 2;
    for (var k = 0; k < 6; k++) { var a = k / 6 * TAU; ctx.beginPath(); ctx.moveTo(52 + Math.cos(a) * 8, -96 + Math.sin(a) * 8); ctx.lineTo(52 + Math.cos(a) * 16, -96 + Math.sin(a) * 16); ctx.stroke(); }
    var lid = new Path2D(); lid.roundRect ? lid.roundRect(72, -86, 64, 90, 10) : lid.rect(72, -86, 64, 90);
    cel(ctx, lid, L, brass, { sh: [-12, -4], lw: 4 });
  } else {
    ctx.strokeStyle = L.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-70, 52); ctx.lineTo(70, 52); ctx.stroke();
  }
  ctx.restore();
}
function flame(ctx, x, y, t, s, a) {
  var tq = q12(t), f = 1 + Math.sin(tq * 9.1) * 0.06 + Math.sin(tq * 5.3) * 0.05;
  var lean = Math.sin(tq * 2.3) * 6;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y - 50 * s, 420 * s, '#ff9a40', 0.35);
  glow(ctx, x, y - 50 * s, 140 * s, '#ffd080', 0.5);
  ctx.globalCompositeOperation = 'source-over';
  function tear(hh, ww, col) {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x - ww * s, y); ctx.quadraticCurveTo(x - ww * s, y - hh * 0.5 * s, x + lean * s, y - hh * f * s);
    ctx.quadraticCurveTo(x + ww * s, y - hh * 0.5 * s, x + ww * s, y); ctx.quadraticCurveTo(x, y + ww * 0.6 * s, x - ww * s, y); ctx.fill();
  }
  tear(130, 30, '#ff8a2a'); tear(100, 21, '#ffc85a'); tear(62, 12, '#fff6d8');
  ctx.fillStyle = 'rgba(80,140,255,0.7)'; ctx.beginPath(); ctx.ellipse(x, y - 4 * s, 18 * s, 9 * s, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawHelmet(ctx, x, y, s, L, rot, glint) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(s, s);
  var paint = '#d9d5c9';
  /* shell, seen 3/4 from the front-left: crown, deep back, face opening cut at lower left */
  var shell = P2([[-238, 30], [-258, -70], [-212, -176], [-96, -246], [56, -252], [190, -196], [262, -78], [276, 54], [254, 178, 1], [168, 196], [128, 150], [60, 112], [-36, 112], [-120, 96], [-196, 84, 1]]);
  cel(ctx, shell, L, paint, { sh: [-40, -34], hiFn: function (c) { c.beginPath(); c.ellipse(-70, -170, 110, 34, -0.3, 0, TAU); c.fill(); }, hiA: 0.55, rim: [-8, 4], lw: 5 });
  ctx.save(); ctx.clip(shell);
  var r = rng(404);
  ctx.strokeStyle = ls(L, paint); ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  for (var i = 0; i < 34; i++) { var sx = -240 + r() * 500, sy = -230 + r() * 340, ln = 8 + r() * 46, an = r() * 0.9 - 0.45; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(an) * ln, sy + Math.sin(an) * ln); ctx.stroke(); }
  ctx.fillStyle = rgba('#5a4a3a', 0.35);
  for (var q = 0; q < 6; q++) { ctx.beginPath(); ctx.ellipse(-150 + r() * 380, -180 + r() * 280, 6 + r() * 12, 4 + r() * 6, r() * 3, 0, TAU); ctx.fill(); }
  /* stripe and stencil */
  ctx.save(); ctx.rotate(-0.12);
  ctx.fillStyle = lc(L, '#2c3c5e'); ctx.fillRect(-300, -112, 640, 20);
  ctx.fillStyle = lc(L, '#c9a046'); ctx.fillRect(-300, -92, 640, 5);
  ctx.font = 'bold 52px monospace'; ctx.fillStyle = lc(L, '#1e2433');
  ctx.fillText('SEVERIN A.', -40, -24);
  ctx.fillStyle = lc(L, paint);
  for (var k = 0; k < 10; k++) ctx.fillRect(-31 + k * 31.3, -64, 3, 12);
  ctx.restore();
  ctx.restore();
  /* ear cup */
  var cup = new Path2D(); cup.ellipse(150, 70, 70, 84, -0.15, 0, TAU);
  cel(ctx, cup, L, '#b9b4a8', { sh: [-14, -14], rim: [-5, 0], lw: 4.5 });
  var cup2 = new Path2D(); cup2.ellipse(150, 70, 40, 50, -0.15, 0, TAU);
  cel(ctx, cup2, L, '#8a857a', { sh: [-8, -8], lw: 3.5 });
  ctx.fillStyle = lc(L, '#3a3632'); ctx.beginPath(); ctx.arc(150, 70, 8, 0, TAU); ctx.fill();
  /* face opening and raised visor */
  var open = P2([[-238, 30], [-200, -40], [-110, -56], [-30, -20], [-24, 70], [-60, 108], [-140, 100], [-196, 84, 1]]);
  cel(ctx, open, L, '#2a201c', { sh: [-10, 6], lw: 5 });
  var pad = P2([[-226, 22], [-196, -30], [-112, -44], [-40, -14], [-34, 62], [-48, 74], [-46, -6], [-114, -32], [-190, -20], [-214, 26]]);
  cel(ctx, pad, L, '#4a3a2c', { lw: 3 });
  var vis = P2([[-262, -84], [-170, -122], [-40, -124], [40, -96], [36, -54], [-40, -78], [-160, -76], [-250, -42, 1]]);
  cel(ctx, vis, L, '#1a2232', { sh: [-12, -10], lw: 5 });
  ctx.save(); ctx.clip(vis);
  ctx.fillStyle = rgba(L.dark ? '#8a7ad0' : '#c8dcf0', 0.4); ctx.fillRect(-200, -116, 90, 14); ctx.fillRect(-90, -112, 40, 10);
  if (glint !== undefined && glint >= 0 && glint <= 1) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; var gx = lerp(-320, 120, glint); ctx.beginPath(); ctx.moveTo(gx, -140); ctx.lineTo(gx + 26, -140); ctx.lineTo(gx - 14, -40); ctx.lineTo(gx - 40, -40); ctx.fill(); }
  ctx.restore();
  /* oxygen-mask bayonet, chin strap */
  cel(ctx, polyP([[-40, 30], [-14, 26], [-12, 50], [-38, 54]]), L, '#7a746a', { lw: 3 });
  ctx.strokeStyle = L.ink; ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(100, 150); ctx.quadraticCurveTo(40, 230, -60, 210); ctx.stroke();
  ctx.strokeStyle = lc(L, '#3a3028'); ctx.lineWidth = 7; ctx.stroke();
  /* Concordat ring emblem at the back */
  ctx.save(); ctx.translate(196, -110); ctx.strokeStyle = lc(L, '#c9a046'); ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.stroke();
  ctx.fillStyle = lc(L, '#c9a046'); for (var e = 0; e < 8; e++) { ctx.save(); ctx.rotate(e * TAU / 8); ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, -20); ctx.lineTo(-5, -20); ctx.fill(); ctx.restore(); }
  ctx.restore();
  ctx.restore();
}
function tomato(ctx, L, x, y, R, wilt) {
  var body = new Path2D(); body.ellipse(x, y, R * 1.08, R * (wilt ? 0.88 : 0.95), 0, 0, TAU);
  var col = wilt ? mixHex('#c8321e', '#5a2a1a', wilt * 0.6) : '#d8341f';
  cel(ctx, body, L, col, { sh: [-R * 0.22, -R * 0.26], hiFn: function (c) { c.beginPath(); c.ellipse(x - R * 0.45, y - R * 0.45, R * 0.22, R * 0.12, -0.6, 0, TAU); c.fill(); }, hiA: 0.8, rim: [-R * 0.04, 0], lw: 4 });
  ctx.strokeStyle = ls(L, col); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x - R * 0.2, y - R * 0.9); ctx.quadraticCurveTo(x - R * 0.5, y, x - R * 0.25, y + R * 0.8); ctx.moveTo(x + R * 0.3, y - R * 0.88); ctx.quadraticCurveTo(x + R * 0.55, y, x + R * 0.35, y + R * 0.8); ctx.stroke();
  if (wilt) {
    ctx.strokeStyle = ls(L, col); ctx.lineWidth = 2.4;
    for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x - R * 0.6 + i * R * 0.3, y + R * 0.1); ctx.quadraticCurveTo(x - R * 0.5 + i * R * 0.3, y + R * 0.3, x - R * 0.62 + i * R * 0.28, y + R * 0.5); ctx.stroke(); }
    ctx.fillStyle = rgba('#3a1a10', 0.5); ctx.beginPath(); ctx.ellipse(x + R * 0.4, y + R * 0.3, R * 0.2, R * 0.14, 0.3, 0, TAU); ctx.fill();
  }
  var cal = [];
  for (var k = 0; k < 10; k++) { var a = -Math.PI / 2 + k / 10 * TAU, rr = k % 2 ? R * 0.1 : R * (wilt ? 0.38 : 0.45); cal.push([x + Math.cos(a) * rr * 1.2, y - R * 0.86 + Math.sin(a) * rr * 0.5 + (wilt && k % 2 === 0 ? R * 0.08 : 0), k % 2 ? 0 : 1]); }
  cel(ctx, P2(cal), L, wilt ? '#6a5a2a' : '#3a7a2a', { sh: [-4, -4], lw: 3 });
  limb(ctx, [[x, y - R * 0.88], [x + R * 0.04, y - R * 1.08], [x + R * 0.14, y - R * 1.18]], R * 0.08, L, wilt ? '#6a5a2a' : '#3a7a2a', 3);
  if (!wilt) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(x + R * 0.38, y - R * 0.2, R * 0.04, R * 0.07, 0, 0, TAU); ctx.fill(); }
}

/* ============================================================ INSERTS */
SH.cigarette_closeup = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var dark = !!p.dark;
  begin(ctx, w, h);
  blit(ctx, bgCanvas(dark ? 'dark' : 'terrace', dark, w, h), 1.12 + t * 0.002);
  var z = camZ(t, 0.004, 0.08);
  ctx.save(); pushCam(ctx, z, 960, 560);
  if (!p.give) {
    ctx.translate(960, 640); ctx.scale(1.85, 1.85); ctx.translate(-930, -600);
    var fl = sm((t - 0.75) / 0.12);
    var L = fl > 0 ? light('apartment', dark, 'lamp') : light('apartment', dark, 'backlit');
    lighterShape(ctx, L, 880, 580, 1, true, -0.04);
    if (t > 0.55 && t < 0.85) { var r = rng(Math.floor(t * 30)); ctx.fillStyle = '#ffe080'; for (var i = 0; i < 8; i++) ctx.fillRect(930 + r() * 60, 470 - r() * 60, 3, 3); }
    var flick = t > 0.5 && t < 0.8 ? -14 : 0;
    var skin = CH.ilse.skin;
    handRig(ctx, L, {
      skin: skin, lw: 3.4, lx: 0.4, ly: 1,
      cuff: { pts: [[1090, 800], [1200, 700], [1420, 800], [1380, 1140], [1000, 1140]], col: '#3a3d45' },
      back: [{ p: [[1020, 742], [946, 736], [872, 740], [846, 748]], w: [32, 26] }, { p: [[1034, 710], [950, 702], [862, 706], [828, 716]], w: [36, 29] }, { p: [[1040, 676], [950, 666], [856, 670], [822, 682]], w: [38, 30] }, { p: [[1030, 640], [940, 630], [852, 634], [820, 646]], w: [37, 29] }],
      palm: [[1010, 600], [1094, 590], [1156, 640], [1176, 744], [1140, 826], [1060, 806], [1020, 762], [1000, 680]],
      thumb: { p: [[1050, 616], [1006, 548], [968, 506 + flick * 0.5], [950, 488 + flick]], w: [42, 32] },
      nails: [[956, 494 + flick, 13, 10, -0.9]], rim: 1,
      creases: [[1010, 628, 1004, 650, 1010, 668], [1016, 690, 1008, 704, 1014, 724]]
    });
    if (fl > 0) flame(ctx, 880, 482, t, 1, fl);
    /* cigarette arrives from the left, catches, withdraws */
    var cin = sm((t - 1.1) / 1.1), cout = sm((t - 4.2) / 3);
    if (cin > 0) {
      var tx = lerp(-200, 850, cin) - cout * 300, ty = lerp(220, 360, cin) - cout * 160;
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(0.2 - cout * 0.15);
      ctx.fillStyle = L.ink; ctx.fillRect(-520, -15, 524, 30);
      ctx.fillStyle = lc(L, '#f2ece2'); ctx.fillRect(-516, -12, 516, 24);
      ctx.fillStyle = ls(L, '#f2ece2'); ctx.fillRect(-516, 4, 516, 8);
      ctx.fillStyle = lc(L, '#c8925a'); ctx.fillRect(-520, -12, 150, 24);
      var lit = sm((t - 2.3) / 0.5);
      if (lit > 0) {
        ctx.fillStyle = '#5a5050'; ctx.fillRect(-8, -12, 12, 24);
        var pulse = 0.7 + 0.3 * Math.sin(q12(t) * 2.4);
        glow(ctx, 4, 0, 40, '#ff6a20', 0.8 * lit * pulse);
        ctx.fillStyle = 'rgba(255,170,80,' + (lit * pulse).toFixed(2) + ')'; ctx.fillRect(-2, -10, 6, 20);
      }
      ctx.restore();
      if (lit > 0) smoke(ctx, tx + 10, ty - 10, t, 1.6, dark ? '#c8b8ff' : '#efe8e4', 0.22 * lit, 2);
    }
  } else {
    /* passing the lighter: Ilse's hand sets it in Kasimir's palm */
    var L2 = light('observation', false, 'warm');
    ctx.translate(980, 600); ctx.scale(1.45, 1.45); ctx.translate(-1000, -560);
    var ph = t, put = sm(ph / 2.4), wd = sm((ph - 3.6) / 2.4), close = sm((ph - 4.4) / 2);
    var kc = '#7a4932', kp = '#b88a6c';
    var tipPull = function (pt, k) { return [lerp(pt[0], 1010, k * 0.4), lerp(pt[1], 640, k * 0.35)]; };
    var idx = [[1000, 590], [900, 585], [830, 592]].map(function (q, i) { return i ? tipPull(q, close) : q; });
    var mid = [[960, 625], [860, 628], [790, 640]].map(function (q, i) { return i ? tipPull(q, close) : q; });
    var rin = [[960, 665], [870, 672], [806, 684]].map(function (q, i) { return i ? tipPull(q, close) : q; });
    var pin = [[985, 700], [912, 710], [862, 720]].map(function (q, i) { return i ? tipPull(q, close) : q; });
    handRig(ctx, L2, {
      skin: kp, palmSkin: kp, lw: 3.4, lx: 0.3, ly: 1,
      cuff: { pts: [[1250, 520], [1500, 470], [1980, 560], [1980, 900], [1260, 800]], col: '#8a4026' },
      back: [{ p: pin, w: [32, 26], c: kp }, { p: rin, w: [36, 28], c: kp }, { p: mid, w: [38, 29], c: kp }, { p: idx, w: [36, 28], c: kp }],
      palm: [[1300, 556], [1180, 556], [1010, 576], [940, 636], [966, 716], [1120, 742], [1300, 724]],
      thumb: { p: [[1180, 570], [1100, 516], [1030, 496]], w: [44, 32], c: kc }, rim: 1
    });
    cel(ctx, P2(jag([[1430, 420], [1560, 380], [1660, 470], [1610, 620, 0, 1], [1450, 600, 0, 1]], 26, 12, 4, true)), L2, '#e4d9c6', { sh: [-14, -12], lw: 3.4 });
    var lx = lerp(640, 1040, put), ly = lerp(200, 600, put);
    lighterShape(ctx, L2, lx, ly, 0.62, false, lerp(-0.6, -1.45, put));
    var hx = lx - 40 - wd * 600, hy = ly - 140 - wd * 420;
    reachHand(ctx, L2, { x: hx - 260, y: hy - 120, rot: 0.75, s: 0.85, curl: 0.25, skin: CH.ilse.skin, sleeve: '#3a3d45', lw: 3 });
  }
  ctx.restore();
  end(ctx);
};

SH.tomato_closeup = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var dark = !!p.dark || !!p.wilted, wilt = p.wilted ? 1 : 0;
  begin(ctx, w, h);
  blit(ctx, bgCanvas('garden', dark, w, h), 1.15);
  var off = p.offer ? sm(t / 5) : 0;
  var z = 1 + off * 0.35 + camZ(t, 0.002) - 1;
  ctx.save(); pushCam(ctx, z, 980, 640);
  ctx.translate(-off * 60, -off * 40);
  var L = light('garden', dark);
  var glove = '#c8b48a', cuff = '#6a5a3a';
  var bob = Math.sin(t * TAU / 4.6) * 3;
  ctx.translate(0, bob);
  handRig(ctx, L, {
    skin: glove, lw: 3.6, lx: 0.4, ly: 1,
    cuff: { pts: [[1180, 820], [1420, 720], [1700, 900], [1600, 1180], [1160, 1180]], col: cuff },
    back: [{ p: [[1150, 760], [1240, 700], [1270, 620], [1250, 560]], w: 54 }],
    palm: [[760, 760], [900, 830], [1100, 860], [1300, 820], [1380, 740], [1250, 700], [1000, 700], [800, 700]],
    thumb: { p: [[1200, 770], [1236, 690], [1222, 610]], w: [70, 56] }
  });
  tomato(ctx, L, 1000, 600, 190, wilt);
  limb(ctx, [[860, 760], [790, 716], [772, 646], [790, 590]], [64, 52], L, glove, 3.6, 0.4, 1);
  limb(ctx, [[920, 800], [840, 770], [808, 706], [818, 650]], [66, 54], L, glove, 3.6, 0.4, 1);
  limb(ctx, [[1000, 820], [910, 800], [866, 750], [870, 704]], [64, 52], L, glove, 3.6, 0.4, 1);
  limb(ctx, [[1080, 828], [990, 822], [940, 790], [936, 754]], [58, 48], L, glove, 3.6, 0.4, 1);
  ctx.strokeStyle = ls(L, glove); ctx.setLineDash([6, 6]); ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(900, 830); ctx.quadraticCurveTo(1100, 870, 1300, 820); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  end(ctx);
};

SH.helmet_closeup = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var dark = !!p.dark;
  begin(ctx, w, h);
  blit(ctx, bgCanvas('garden', true, w, h), 1.2);
  var z = camZ(t, 0.004, 0.08);
  ctx.save(); pushCam(ctx, z, 960, 560);
  ctx.fillStyle = 'rgba(10,8,16,0.55)'; ctx.fillRect(0, 760, VW, 320);
  ctx.fillStyle = rgba('#000000', 0.35); ctx.beginPath(); ctx.ellipse(980, 800, 330, 40, 0, 0, TAU); ctx.fill();
  var L = dark ? light('garden', true) : light('garden', false, 'lamp');
  var g = ((t + 1) % 7) / 1.6;
  drawHelmet(ctx, 960, 520, 1.35, L, -0.04, g);
  ctx.restore();
  end(ctx);
};

function paintPhoto(x, dark) {
  fillV(x, dark ? [[0, '#16102a'], [1, '#0a0816']] : [[0, '#3a2a26'], [1, '#1e1614']]);
  glow(x, 300, 200, 700, dark ? '#5a40a0' : '#ffc890', dark ? 0.25 : 0.4);
  x.fillStyle = dark ? '#2a1e2e' : '#5a3a26'; x.fillRect(0, 760, VW, 320);
  x.fillStyle = dark ? '#3a2a40' : '#7a5236'; x.fillRect(0, 760, VW, 8);
  x.strokeStyle = rgba(dark ? '#4a3a5a' : '#6a4630', 0.6); x.lineWidth = 2;
  for (var i = 0; i < 12; i++) { x.beginPath(); x.moveTo(0, 800 + i * 24); x.quadraticCurveTo(900, 790 + i * 26, VW, 806 + i * 24); x.stroke(); }
  /* frame */
  x.save(); x.translate(960, 470); x.rotate(-0.03);
  x.fillStyle = '#100c10'; x.fillRect(-300, -380, 600, 760);
  x.fillStyle = dark ? '#6a6488' : '#b8ac90'; x.fillRect(-292, -372, 584, 744);
  x.fillStyle = dark ? '#4a4468' : '#8a7e64'; x.fillRect(-292, 300, 584, 72); x.fillRect(200, -372, 92, 744);
  x.fillStyle = '#f2ecdc'; x.fillRect(-250, -330, 500, 640);
  x.save(); x.beginPath(); x.rect(-232, -312, 464, 604); x.clip();
  x.fillStyle = vgrad(x, -312, 292, [[0, '#9ec4dc'], [1, '#e8dcc0']]); x.fillRect(-240, -320, 480, 620);
  x.fillStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.ellipse(-120, -200, 160, 40, 0, 0, TAU); x.fill();
  x.translate(10, -40); x.scale(-2.8, 2.8);
  var Lp = light('photo', false, 'memory');
  drawBust(x, CH.daniel, { L: Lp, lw: 2.2 / 2.8, m: MOODS.smile, bl: 0, t: 0, detail: 2, rimW: 1.4, dark: false });
  x.restore();
  x.fillStyle = 'rgba(230,200,150,0.18)'; x.fillRect(-232, -312, 464, 604);
  x.restore();
  /* lighter beside the frame */
  lighterShape(x, light('photo', dark, dark ? null : 'warm'), 1460, 760, 0.55, false, 0.12);
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(960, 860, 360, 30, 0, 0, TAU); x.fill();
  if (dark) { x.fillStyle = '#ffae52'; x.fillRect(0, 1040, VW, 6); }
}
SH.photo_daniel = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var dark = !!p.dark;
  begin(ctx, w, h);
  var z = camZ(t, 0.004, 0.08);
  blit(ctx, layer('photo:' + dark, w, h, function (x) { paintPhoto(x, dark); }), z, 960, 430);
  ctx.save(); pushCam(ctx, z, 960, 430);
  ctx.save(); ctx.translate(960, 470); ctx.rotate(-0.03);
  ctx.beginPath(); ctx.rect(-250, -330, 500, 640); ctx.clip();
  var gx = -400 + ((t * 60) % 1400);
  ctx.fillStyle = rgba(dark ? '#a090ff' : '#ffffff', 0.1);
  ctx.beginPath(); ctx.moveTo(gx, -340); ctx.lineTo(gx + 160, -340); ctx.lineTo(gx - 100, 320); ctx.lineTo(gx - 260, 320); ctx.fill();
  ctx.restore();
  var r = rng(17);
  for (var i = 0; i < 22; i++) { var bx = r() * VW, by = (r() * 900 - q12(t) * 6 * (0.5 + r())) % 900; if (by < 0) by += 900; ctx.fillStyle = rgba(dark ? '#c8b8ff' : '#ffe8c0', 0.25 * r()); ctx.beginPath(); ctx.arc(bx, by, 1.5 + r() * 2, 0, TAU); ctx.fill(); }
  ctx.restore();
  end(ctx);
};

SH.memory_daniel = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  begin(ctx, w, h);
  blit(ctx, layer('memoryBg', w, h, function (x) {
    fillV(x, [[0, '#f4ead4'], [1, '#c8b896']]);
    x.fillStyle = 'rgba(160,140,110,0.35)'; for (var i = 0; i < 6; i++) x.fillRect(i * 340 + 40, 120, 180, 520);
    x.fillStyle = 'rgba(120,110,100,0.3)'; x.fillRect(0, 700, VW, 380);
  }));
  var L = light('memory', false, 'memory');
  var z = camZ(t, 0.003);
  ctx.save(); pushCam(ctx, z, 960, 560);
  var lg = Math.sin(q12(t) * 5.2), lg2 = Math.sin(q12(t) * 4.1 + 1);
  function bust(ch, x, y, s, face, md, ph) {
    ctx.save(); ctx.translate(x, y + Math.abs(Math.sin(t * 4 + ph)) * -6 * (md === MOODS.laugh ? 1 : 0.4));
    ctx.rotate(face * (md === MOODS.laugh ? -0.08 : 0.03)); ctx.scale(face * s, s);
    drawBust(ctx, ch, { L: L, lw: 2.2 / s, m: md, bl: 0, t: t, detail: 2, rimW: 1.4, dark: false });
    ctx.restore();
  }
  bust(CH.kasimirYoung, 1440, 470, 2.7, 1, MOODS.smile, 1);
  bust(CH.ilseYoung, 520, 500, 2.75, -1, MOODS.smile, 2);
  bust(CH.daniel, 980, 430, 3.0, 1, MOODS.laugh, 0);
  ctx.restore();
  /* wash + light leak */
  ctx.fillStyle = 'rgba(255,244,220,0.18)'; ctx.fillRect(0, 0, VW, VH);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 1700 + lg * 60, 200, 700, '#ff7a30', 0.32 + lg2 * 0.06);
  glow(ctx, 1900, 900, 500, '#ff4a20', 0.2);
  glow(ctx, 100, 100 + lg2 * 40, 400, '#ffd090', 0.18);
  ctx.globalCompositeOperation = 'source-over';
  end(ctx);
};

var HANDS = {
  ilse_kasimir: [{ skin: CH.ilse.skin, sleeve: '#3a3d45' }, { skin: CH.kasimir.skin, sleeve: '#8a4026' }],
  ilse_mira: [{ skin: CH.ilse.skin, sleeve: '#3a3d45' }, { skin: CH.mira.skin, sleeve: '#5d6a3b' }],
  mira_teo: [{ skin: CH.mira.skin, sleeve: '#5d6a3b' }, { skin: CH.teo.skin, sleeve: '#7a7e86', scars: 1 }]
};
SH.hands = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var pr = HANDS[p.who] || HANDS.ilse_kasimir;
  var dark = !!p.dark;
  begin(ctx, w, h);
  blit(ctx, layer('handsTable:' + dark, w, h, function (x) {
    fillV(x, dark ? [[0, '#140e26'], [1, '#0a0814']] : [[0, '#2a2420'], [1, '#141010']]);
    x.fillStyle = dark ? '#221a36' : '#4a3c34'; x.fillRect(0, 300, VW, 780);
    glow(x, 960, 560, 800, dark ? '#6a50c0' : '#ffd0a0', dark ? 0.2 : 0.3);
    x.strokeStyle = rgba(dark ? '#3a2e54' : '#3a2e28', 0.6); x.lineWidth = 2;
    for (var i = 0; i < 14; i++) { x.beginPath(); x.moveTo(0, 320 + i * 54); x.lineTo(VW, 310 + i * 56); x.stroke(); }
  }), camZ(t, 0.002), 960, 560);
  var L = dark ? light('dark', true) : light('apartment', false, 'lamp');
  ctx.save(); ctx.translate(960, 600); ctx.scale(1.55, 1.55); ctx.translate(-960, -580);
  var k = p.touch ? sm(t / 6) : 0;
  var tw = Math.sin(q12(t) * 0.9) * 0.04;
  var gap = lerp(170, -70, k);
  reachHand(ctx, L, { x: 960 - gap / 2 - 360, y: 600, rot: 0.05, s: 1, curl: 0.15 + tw, skin: pr[0].skin, sleeve: pr[0].sleeve, scars: pr[0].scars, lw: 3.2 });
  ctx.save(); ctx.translate(VW, 0); ctx.scale(-1, 1);
  reachHand(ctx, L, { x: 960 - gap / 2 - 360 + 10, y: 560 + k * 30, rot: -0.04 + k * 0.05, s: 1, curl: 0.2 - k * 0.1 - tw, skin: pr[1].skin, sleeve: pr[1].sleeve, scars: pr[1].scars, lw: 3.2, flip: 1 });
  ctx.restore();
  ctx.restore();
  end(ctx);
};

SH.data_chip = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var dark = !!p.dark;
  begin(ctx, w, h);
  blit(ctx, layer('metalTable:' + dark, w, h, function (x) {
    fillV(x, dark ? [[0, '#1a1430'], [1, '#0c0a18']] : [[0, '#5a6260'], [1, '#2a302e']]);
    x.fillStyle = dark ? '#2a2440' : '#7c8684'; x.fillRect(0, 260, VW, 820);
    glow(x, 900, 500, 900, dark ? '#6a5ac0' : '#ffffff', dark ? 0.15 : 0.25);
    x.strokeStyle = rgba('#000000', 0.15); x.lineWidth = 3; for (var i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, 400 + i * 120); x.lineTo(VW, 380 + i * 128); x.stroke(); }
    x.fillStyle = rgba('#ffffff', 0.06); x.fillRect(0, 260, VW, 6);
  }), camZ(t, 0.003), 960, 560);
  var L = light('detention', dark);
  ctx.save(); ctx.translate(960, 600); ctx.scale(1.7, 1.7); ctx.translate(-960, -600);
  var slide = sm(t / 3.5), back = sm((t - 4) / 2.5);
  var cx = lerp(1180, 900, slide), cy = 600;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx - 66, cy - 26, 140, 66);
  var chip = new Path2D(); chip.roundRect ? chip.roundRect(cx - 70, cy - 40, 140, 70, 8) : chip.rect(cx - 70, cy - 40, 140, 70);
  cel(ctx, chip, L, '#1e3a2a', { sh: [-6, -6], lw: 3 });
  ctx.fillStyle = lc(L, '#d8b04a'); for (var g = 0; g < 7; g++) ctx.fillRect(cx - 60 + g * 16, cy + 14, 10, 14);
  ctx.fillStyle = lc(L, '#0c0c0c'); ctx.fillRect(cx - 30, cy - 30, 44, 32);
  var on = Math.floor(t * 2) % 2 === 0;
  ctx.fillStyle = on ? '#ffb040' : '#4a3010'; ctx.beginPath(); ctx.arc(cx + 46, cy - 20, 5, 0, TAU); ctx.fill();
  if (on) glow(ctx, cx + 46, cy - 20, 20, '#ffb040', 0.6);
  ctx.save(); ctx.translate(VW, 0); ctx.scale(-1, 1);
  var hx = VW - cx + 30 + back * 500;
  reachHand(ctx, L, { x: hx - 330, y: cy + 10, rot: 0.02, s: 0.95, curl: 0.12, skin: CH.kasimir.skin, sleeve: '#8a4026', lw: 3 });
  ctx.restore();
  if (t > 4.5) {
    var ar = sm((t - 4.5) / 2.5);
    reachHand(ctx, L, { x: lerp(-200, 120, ar), y: cy + 40, rot: -0.04, s: 0.95, curl: 0.3, skin: CH.ilse.skin, sleeve: '#3a3d45', lw: 3 });
  }
  ctx.restore();
  end(ctx);
};

function fist(ctx, L, x, y, s, skin, sleeve, mir, tremble) {
  function tf() { ctx.save(); ctx.translate(x + tremble, y); ctx.scale(s * mir, s); }
  tf();
  cel(ctx, P2([[120, -110], [440, -150], [470, 170], [130, 140]]), L, sleeve, { sh: [-30, -10], rim: [-4, 0], lw: 3.4 });
  ctx.fillStyle = lc(L, '#2c465a'); ctx.beginPath(); ctx.arc(320, 10, 46, 0, TAU); ctx.fill();
  ctx.fillStyle = lc(L, '#d9b25c'); ctx.beginPath(); ctx.moveTo(320, 0); ctx.quadraticCurveTo(296, -16, 298, 8); ctx.quadraticCurveTo(310, 12, 320, 22); ctx.quadraticCurveTo(330, 12, 342, 8); ctx.quadraticCurveTo(344, -16, 320, 0); ctx.fill();
  cel(ctx, P2([[-100, -96], [60, -108], [140, -80], [150, 80], [60, 110], [-100, 100], [-130, 0]]), L, skin, { sh: [-16, -14], rim: [-4, 0], lw: 3.4 });
  ctx.restore();
  return function front() {
    tf();
    for (var i = 0; i < 4; i++) limb(ctx, [[0, -76 + i * 50], [-92, -74 + i * 50], [-126, -58 + i * 50]], [48 - i * 3, 40 - i * 3], L, skin, 3.4 / s, 0.2, 1);
    ctx.strokeStyle = ls(L, skin); ctx.lineWidth = 3;
    for (var j = 0; j < 4; j++) { ctx.beginPath(); ctx.moveTo(-60, -86 + j * 50); ctx.quadraticCurveTo(-56, -76 + j * 50, -60, -66 + j * 50); ctx.stroke(); }
    limb(ctx, [[70, -96], [-20, -122], [-100, -110]], [52, 40], L, skin, 3.4 / s, 0.2, 1);
    ctx.fillStyle = lhi(L, skin, 0.3); ctx.beginPath(); ctx.ellipse(-104, -112, 14, 10, 0.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = ls(L, skin); ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  };
}
SH.licorice_snap = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  begin(ctx, w, h);
  blit(ctx, bgCanvas('ship', !!p.dark, w, h), 1.2);
  var L = light('ship', !!p.dark, 'lamp');
  var snapT = 2.6, snapped = t >= snapT, k = snapped ? sm((t - snapT) / 0.6) : 0;
  var bend = snapped ? 0 : sm(t / snapT) * 0.22;
  var tr = !snapped && t > 1.2 ? Math.sin(q12(t) * 40) * 2.5 : 0;
  var z = camZ(t, 0.004, 0.08);
  ctx.save(); pushCam(ctx, z, 960, 560);
  var skin = CH.juno.skin, sl = '#5c3d2a';
  var fL = fist(ctx, L, 640 - k * 30, 560 + k * 20, 1, skin, sl, -1, -tr);
  var fR;
  /* the root */
  function root(x0, y0, x1, y1, rot, brk) {
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(rot);
    var len = x1 - x0;
    var r = new Path2D(); r.moveTo(0, -16); r.lineTo(len, -13); r.lineTo(len, 13); r.lineTo(0, 16); r.closePath();
    cel(ctx, r, L, '#6a4426', { sh: [0, -8], lw: 3 });
    ctx.strokeStyle = ls(L, '#6a4426'); ctx.lineWidth = 2;
    for (var i = 0; i < len / 40; i++) { ctx.beginPath(); ctx.moveTo(i * 40 + 10, -8); ctx.lineTo(i * 40 + 30, -6); ctx.stroke(); }
    if (brk) { ctx.strokeStyle = lc(L, '#d8b880'); ctx.lineWidth = 3; var rr = rng(7 + (brk > 0 ? 1 : 2)); for (var j = 0; j < 9; j++) { var yy = -12 + j * 3; ctx.beginPath(); ctx.moveTo(brk > 0 ? len : 0, yy); ctx.lineTo((brk > 0 ? len : 0) + brk * (8 + rr() * 22), yy + (rr() - 0.5) * 10); ctx.stroke(); } }
    ctx.restore();
  }
  if (!snapped) {
    root(520, 560, 960, 0, -bend * 0.6, 0);
    root(960, 560 - Math.sin(bend) * 120, 1400, 0, bend * 0.6, 0);
    ctx.fillStyle = lc(L, '#6a4426'); ctx.beginPath(); ctx.arc(960, 560 - Math.sin(bend) * 120 + 6, 15, 0, TAU); ctx.fill();
  } else {
    root(520 - k * 30, 560 + k * 20, 950 - k * 40, 0, -0.08 - k * 0.25, 1);
    root(970 + k * 50, 560 + k * 30, 1400 + k * 30, 0, 0.1 + k * 0.32, -1);
    var rr = rng(99);
    for (var i = 0; i < 14; i++) { var a = rr() * TAU, d = k * (40 + rr() * 140); ctx.fillStyle = lc(L, '#c8a070'); ctx.globalAlpha = 1 - k * 0.7; ctx.fillRect(960 + Math.cos(a) * d, 560 + Math.sin(a) * d * 0.6 + k * k * 80, 5, 3); }
    ctx.globalAlpha = 1;
  }
  fL();
  fR = fist(ctx, L, 1280 + k * 40, 560 + k * 30, 1, skin, sl, 1, tr);
  fR();
  ctx.restore();
  end(ctx);
};

var SIGN = null;
function signPath() {
  if (SIGN) return SIGN;
  var pts = [], i;
  /* "K. Oduya" as a looping cursive line, sampled */
  var segs = [[0, 0], [10, -60], [20, 0], [26, -10], [44, -50], [30, 10], [60, 6], [70, 0], [90, -22], [80, 0], [104, 4], [120, -26], [110, 0], [140, 0], [150, -70], [146, 6], [176, 0], [200, -24], [188, 4], [214, 6], [230, -20], [236, 30], [222, 50], [250, 0], [272, -26], [266, 0], [290, 4], [330, -8]];
  for (i = 0; i < segs.length - 1; i++) {
    for (var k = 0; k < 6; k++) { var u = k / 6; pts.push([lerp(segs[i][0], segs[i + 1][0], u), lerp(segs[i][1], segs[i + 1][1], u)]); }
  }
  pts.push(segs[segs.length - 1]);
  SIGN = pts;
  return pts;
}
SH.signature = function (ctx, w, h, t, p) {
  p = p || {}; t = Math.max(0, num(t, 0));
  var dark = !!p.dark;
  begin(ctx, w, h);
  var z = camZ(t, 0.003);
  ctx.save(); pushCam(ctx, z, 900, 640);
  blit(ctx, layer('treatyPage:' + dark, w, h, function (x) {
    fillV(x, dark ? [[0, '#1a1428'], [1, '#0c0a14']] : [[0, '#2a1e18'], [1, '#160e0a']]);
    x.save(); x.translate(960, 560); x.rotate(-0.06);
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(-640, -560, 1300, 1200);
    x.fillStyle = dark ? '#b8b0c8' : '#f0e6cc'; x.fillRect(-660, -580, 1300, 1200);
    x.strokeStyle = dark ? '#8a7aa0' : '#c9a046'; x.lineWidth = 4; x.strokeRect(-620, -540, 1220, 1120);
    x.fillStyle = dark ? '#5a5070' : '#8a7a60';
    for (var i = 0; i < 9; i++) { var ln = 900 - (i % 3) * 120; x.fillRect(-560, -460 + i * 50, ln, 12); }
    x.font = 'bold 34px serif'; x.fillStyle = dark ? '#3a3050' : '#3a2e20'; x.fillText('ORRIN ACCORD  ·  RENEWAL', -360, -490);
    x.fillStyle = dark ? '#3a3050' : '#3a2e20'; x.fillRect(-560, 170, 520, 3); x.fillRect(40, 170, 520, 3);
    x.font = '22px serif'; x.fillText('FOR THE CONCORDAT', -560, 205); x.fillText('FOR THE SHELF', 40, 205);
    x.font = 'italic 44px serif'; x.fillStyle = dark ? '#2a2040' : '#1e2a4a'; x.fillText('Ilse Varga', -500, 155);
    /* seals */
    function seal(sx, sy, col, ring) {
      x.fillStyle = '#100808'; x.beginPath(); x.arc(sx, sy, 92, 0, TAU); x.fill();
      x.fillStyle = col; x.beginPath(); for (var k = 0; k < 24; k++) { var a = k / 24 * TAU, rr = 86 + (k % 2) * 6; x.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } x.fill();
      x.fillStyle = mixc(col, '#000000', 0.3); x.beginPath(); x.arc(sx, sy, 62, 0, TAU); x.fill();
      x.strokeStyle = mixc(col, '#ffffff', 0.35); x.lineWidth = 5; x.beginPath(); x.arc(sx, sy, 44, 0, TAU); x.stroke();
      x.fillStyle = mixc(col, '#ffffff', 0.35);
      for (var q = 0; q < ring; q++) { x.save(); x.translate(sx, sy); x.rotate(q * TAU / ring); x.beginPath(); x.moveTo(0, -10); x.lineTo(7, -38); x.lineTo(-7, -38); x.fill(); x.restore(); }
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.ellipse(sx - 30, sy - 40, 26, 10, -0.6, 0, TAU); x.fill();
    }
    seal(-420, 400, dark ? '#8a7040' : '#c9a046', 8);
    seal(420, 400, dark ? '#6a3030' : '#a8442a', 3);
    x.restore();
  }));
  var L = light('apartment', dark, dark ? null : 'lamp');
  var pts = signPath(), prog = sm(t / 5.5), n = Math.max(1, Math.floor(prog * (pts.length - 1)));
  ctx.save(); ctx.translate(960, 560); ctx.rotate(-0.06); ctx.translate(80, 140);
  ctx.strokeStyle = dark ? '#1a1030' : '#141c3a'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0][0] * 1.5, pts[0][1] * 1.5);
  for (var i = 1; i <= n; i++) ctx.lineTo(pts[i][0] * 1.5, pts[i][1] * 1.5);
  ctx.stroke();
  var nib = [pts[n][0] * 1.5, pts[n][1] * 1.5];
  var lift = t > 5.6 ? sm((t - 5.6) / 1.5) : 0;
  nib = [nib[0] + lift * 60, nib[1] - lift * 90];
  /* pen */
  ctx.save(); ctx.translate(nib[0], nib[1]); ctx.rotate(-0.95);
  var pen = new Path2D(); pen.moveTo(0, 0); pen.lineTo(30, -10); pen.lineTo(420, -22); pen.lineTo(430, 22); pen.lineTo(30, 10); pen.closePath();
  cel(ctx, pen, L, '#16161a', { sh: [0, -8], hiFn: function (c) { c.fillRect(30, -18, 400, 6); }, hiA: 0.5, lw: 3 });
  ctx.fillStyle = lc(L, '#d1a54a'); ctx.fillRect(150, -18, 18, 38); ctx.fillRect(0, -4, 34, 8);
  ctx.restore();
  /* Kasimir's hand on the pen */
  ctx.save(); ctx.translate(nib[0], nib[1]); ctx.rotate(-0.95);
  handRig(ctx, L, {
    skin: CH.kasimir.skin, lw: 3.2, lx: 0.3, ly: 1,
    cuff: { pts: [[300, 60], [520, -40], [900, 60], [800, 420], [360, 300]], col: '#8a4026' },
    back: [{ p: [[230, 110], [170, 120], [120, 104]], w: 46 }, { p: [[250, 140], [190, 160], [150, 146]], w: 40 }],
    palm: [[180, -20], [300, -60], [400, -10], [420, 120], [330, 190], [220, 160], [170, 90]],
    front: [{ p: [[200, -16], [130, -24], [70, -10], [40, 6]], w: 40 }],
    thumb: { p: [[230, 40], [150, 44], [90, 30], [60, 22]], w: 46 },
    nails: [[52, 2, 13, 10, 0.1], [72, 26, 14, 10, 0.2]], rim: 1
  });
  ctx.restore();
  ctx.restore();
  ctx.restore();
  end(ctx);
};

})();
