/* LONG DUSK (長い黄昏) — shots_env.js
 * Environments and space. Procedural cel-anime background paintings.
 * Every shot: LD_SHOTS[name](ctx, w, h, t, p, G). Deterministic in (t, p, w, h).
 * Static layers are painted once into offscreen canvases (LRU, byte budget) and
 * composited per frame with a slow camera drift controlled by p.pan.
 */
(function () {
  'use strict';
  var SH = window.LD_SHOTS = window.LD_SHOTS || {};

  var PI = Math.PI, TAU = PI * 2, sin = Math.sin, cos = Math.cos, abs = Math.abs,
    min = Math.min, max = Math.max, sqrt = Math.sqrt, floor = Math.floor, exp = Math.exp,
    pow = Math.pow, atan2 = Math.atan2;

  // ------------------------------------------------------------------ utils
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(e0, e1, x) { var t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function fract(x) { return x - floor(x); }
  function h1(n) { var x = sin(n * 127.1 + 311.7) * 43758.5453; return x - floor(x); }
  function vn(x) { var i = floor(x), f = x - i; f = f * f * (3 - 2 * f); return lerp(h1(i), h1(i + 1), f); }
  function rng(seed) {
    var a = (Math.imul(seed | 0, 2654435761) ^ 0x9E3779B9) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, a) {
    if (a == null) a = 1; a = a < 0 ? 0 : (a > 1 ? 1 : a);
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a.toFixed(3) + ')';
  }
  function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function lg(g, x0, y0, x1, y1, st) { var gr = g.createLinearGradient(x0, y0, x1, y1); for (var i = 0; i < st.length; i += 2) gr.addColorStop(st[i], st[i + 1]); return gr; }
  function rgr(g, x, y, r0, r1, st, x1, y1) { var gr = g.createRadialGradient(x, y, max(0, r0), x1 == null ? x : x1, y1 == null ? y : y1, max(0.01, r1)); for (var i = 0; i < st.length; i += 2) gr.addColorStop(st[i], st[i + 1]); return gr; }
  // soft radial glow (composite set by caller)
  function glow(g, x, y, r, c, a) {
    if (!(r > 0.5) || !(a > 0.002)) return;
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.22, rgba(c, a * 0.5));
    gr.addColorStop(0.55, rgba(c, a * 0.14)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // anamorphic streak (classic anime lens flare)
  function streak(g, x, y, len, th, c, a) {
    if (!(a > 0.002)) return;
    g.save(); g.translate(x, y); g.scale(1, th / len);
    var gr = g.createRadialGradient(0, 0, 0, 0, 0, len);
    gr.addColorStop(0, rgba(c, a)); gr.addColorStop(0.3, rgba(c, a * 0.35)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(-len, -len, 2 * len, 2 * len); g.restore();
  }
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
  function bump(x, c, wdt) { var d = (x - c) / wdt; return exp(-d * d); }

  // ------------------------------------------------------------------ cache
  var CACHE = new Map(), CBYTES = 0, CMAXB = 340e6;
  function layer(key, W, H, fn) {
    W = max(1, Math.round(W)); H = max(1, Math.round(H));
    var k = key + '@' + W + 'x' + H, c = CACHE.get(k);
    if (c) { CACHE.delete(k); CACHE.set(k, c); return c; }
    c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    fn(g, W, H);
    CACHE.set(k, c); CBYTES += W * H * 4;
    while (CBYTES > CMAXB && CACHE.size > 2) {
      var fk = CACHE.keys().next().value, fc = CACHE.get(fk);
      CBYTES -= fc.width * fc.height * 4; CACHE.delete(fk);
    }
    return c;
  }
  // A "plate" is a painting in frame coordinates (0..w, 0..h) with a margin m
  // around it so the camera can drift without revealing edges.
  var MG = 0.12;
  function plate(key, w, h, res, fn, m) {
    m = (m == null) ? MG : m;
    var fw = w * (1 + 2 * m), fh = h * (1 + 2 * m);
    return layer(key + '|' + m + '|' + res + '|' + w + 'x' + h, fw * res, fh * res, function (g, W, H) {
      g.scale(W / fw, H / fh); g.translate(m * w, m * h); fn(g, w, h, m);
    });
  }

  // ------------------------------------------------------------------ camera
  // Slow, constant-speed anime pan. Returns offsets in frame fractions.
  function cam(p, t, amp) {
    var a = amp == null ? 0.045 : amp, k = min(max(t, 0), 36) / 20, c = { x: 0, y: 0, z: 1 };
    switch (p.pan) {
      case 'left': c.x = k * a; break;
      case 'right': c.x = -k * a; break;
      case 'up': c.y = k * a * 1.2; break;
      case 'down': c.y = -k * a * 1.2; break;
      case 'in': c.z = 1 + k * 0.075; break;
      case 'out': c.z = 1.11 - k * 0.06; break;
      case 'none': break;
      default: c.x = -k * a * 0.45; c.z = 1 + k * 0.025;
    }
    return c;
  }
  function camApply(g, w, h, c, d) {
    d = d == null ? 1 : d; var z = 1 + (c.z - 1) * d;
    g.translate(w / 2 + c.x * w * d, h / 2 + c.y * h * d); g.scale(z, z); g.translate(-w / 2, -h / 2);
  }
  function drawPlate(g, img, w, h, c, d, m) {
    m = m == null ? MG : m;
    g.save(); camApply(g, w, h, c, d);
    g.drawImage(img, -m * w, -m * h, w * (1 + 2 * m), h * (1 + 2 * m));
    g.restore();
  }

  // ------------------------------------------------------------------ space
  var STARC = [[255, 255, 255], [205, 222, 255], [255, 228, 196], [180, 196, 255], [255, 244, 230]];
  function starPlate(w, h, seed, dens) {
    return plate('stars' + seed + '_' + dens, w, h, 1, function (g, w, h, m) {
      var r = rng(seed), s = w / 1920, x0 = -m * w, y0 = -m * h, W = w * (1 + 2 * m), H = h * (1 + 2 * m);
      var n = floor(1500 * dens);
      for (var i = 0; i < n; i++) {
        var x = x0 + r() * W, y = y0 + r() * H, q = r(), c = STARC[floor(r() * 5)];
        var rad = (0.5 + q * q * q * 1.7) * s, a = 0.25 + r() * 0.7;
        g.fillStyle = rgba(c, a);
        if (rad < 0.95 * s) g.fillRect(x, y, max(1, rad * 1.7), max(1, rad * 1.7));
        else { g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); }
        if (q > 0.987) {
          g.globalCompositeOperation = 'lighter';
          glow(g, x, y, rad * 8, c, 0.3);
          g.fillStyle = rgba(c, 0.3);
          g.fillRect(x - rad * 9, y - 0.5 * s, rad * 18, s); g.fillRect(x - 0.5 * s, y - rad * 9, s, rad * 18);
          g.globalCompositeOperation = 'source-over';
        }
      }
    });
  }
  function nebulaPlate(w, h, seed, cols) {
    return plate('neb' + seed + '_' + cols.join('_'), w, h, 0.25, function (g, w, h) {
      var r = rng(seed); g.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 52; i++) {
        var u = r(), x = lerp(-0.15, 1.15, u) * w, y = (0.75 - u * 0.55 + (r() - 0.5) * 0.3) * h;
        glow(g, x, y, (0.07 + r() * 0.22) * w, cols[floor(r() * cols.length)], 0.04 + r() * 0.06);
      }
    });
  }
  // gradient + nebula + stars baked into a single plate: one full-frame composite per frame
  function space(g, w, h, t, c, o) {
    o = o || {};
    var top = o.top || [5, 7, 18], bot = o.bot || [14, 10, 28], seed = o.seed || 7, sd = o.sd == null ? 0.22 : o.sd;
    var nebA = o.neb == null ? 1 : o.neb, nebc = o.nebc || [[70, 40, 110], [24, 70, 104], [96, 46, 74]], dens = o.dens || 1;
    var qt = top.map(function (v) { return Math.round(v / 2) * 2; }), qb = bot.map(function (v) { return Math.round(v / 2) * 2; });
    var key = 'space' + seed + '_' + dens + '_' + qt.join(',') + '_' + qb.join(',') + '_' + nebA + '_' + nebc.join('_');
    var img = plate(key, w, h, 1, function (pg, w, h, m) {
      pg.fillStyle = lg(pg, 0, 0, 0, h, [0, rgba(qt), 1, rgba(qb)]); pg.fillRect(-m * w, -m * h, w * (1 + 2 * m), h * (1 + 2 * m));
      if (nebA > 0) {
        pg.save(); pg.globalAlpha = nebA; pg.globalCompositeOperation = 'lighter';
        pg.drawImage(nebulaPlate(w, h, seed + 1, nebc), -m * w, -m * h, w * (1 + 2 * m), h * (1 + 2 * m));
        pg.restore();
      }
      pg.drawImage(starPlate(w, h, seed, dens), -m * w, -m * h, w * (1 + 2 * m), h * (1 + 2 * m));
    });
    drawPlate(g, img, w, h, c, sd);
    if (o.twinkle === 0) return;
    var r = rng(seed + 99);
    g.save(); camApply(g, w, h, c, sd); g.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 16; i++) {
      var x = r() * w, y = r() * h, ph = r() * TAU, sp = 0.5 + r() * 1.6, cc = STARC[i % 5], rr = w * (0.0016 + r() * 0.0018);
      var a = (0.2 + 0.4 * (0.5 + 0.5 * sin(t * sp + ph))) * (o.tw == null ? 1 : o.tw);
      glow(g, x, y, rr * 4, cc, a);
      g.fillStyle = rgba(cc, a * 0.5); g.fillRect(x - rr * 5, y - 0.5, rr * 10, 1); g.fillRect(x - 0.5, y - rr * 5, 1, rr * 10);
    }
    g.restore();
  }

  // ------------------------------------------------------------------ Orrin
  var ORRIN_TEX = null, OTW = 1536, OTH = 768;
  function orrinTex() {
    if (ORRIN_TEX) return ORRIN_TEX;
    var W = OTW + OTW / 2, c = document.createElement('canvas'); c.width = W; c.height = OTH;
    var g = c.getContext('2d'), img = g.createImageData(W, OTH), d = img.data;
    var AMB = [222, 148, 76], VIO = [104, 72, 138], CRE = [242, 214, 166], PLUM = [72, 40, 92], RUST = [178, 90, 56], DV = [44, 30, 74];
    var tb = [], i, x, y;
    for (i = 0; i < 8; i++) { tb.push(new Float32Array(OTW)); }
    for (x = 0; x < OTW; x++) {
      var a = x / OTW * TAU;
      tb[0][x] = sin(2 * a); tb[1][x] = cos(2 * a); tb[2][x] = sin(5 * a); tb[3][x] = cos(5 * a);
      tb[4][x] = sin(11 * a); tb[5][x] = cos(11 * a); tb[6][x] = sin(3 * a); tb[7][x] = cos(3 * a);
    }
    for (y = 0; y < OTH; y++) {
      var yn = (y + 0.5) / OTH * 2 - 1, lat = Math.asin(clamp(yn, -1, 1)), v = lat / PI + 0.5;
      var A1 = cos(v * 31), B1 = sin(v * 31), A2 = cos(v * 57 + 1.7), B2 = sin(v * 57 + 1.7), A3 = cos(v * 93 + 0.4), B3 = sin(v * 93 + 0.4), A4 = cos(v * 20), B4 = sin(v * 20);
      var pol = smooth(0.5, 0.95, abs(lat) / (PI / 2));
      for (x = 0; x < OTW; x++) {
        var wv = 0.011 * (tb[0][x] * A1 + tb[1][x] * B1) + 0.006 * (tb[2][x] * A2 + tb[3][x] * B2) + 0.0035 * (tb[4][x] * A3 + tb[5][x] * B3);
        var vv = v + wv;
        var b = sin(vv * TAU * 6.5 + 1.3 * sin(vv * TAU * 2.1 + 0.7));
        var q = smooth(-0.1, 0.1, b);
        var r0 = VIO[0] + (AMB[0] - VIO[0]) * q, g0 = VIO[1] + (AMB[1] - VIO[1]) * q, b0 = VIO[2] + (AMB[2] - VIO[2]) * q;
        var b2 = sin(vv * TAU * 19 + 0.9 * (tb[6][x] * A4 + tb[7][x] * B4));
        var hi = smooth(0.5, 0.8, b2) * 0.3, lo = smooth(0.55, 0.85, -b2) * 0.26;
        r0 += (CRE[0] - r0) * hi; g0 += (CRE[1] - g0) * hi; b0 += (CRE[2] - b0) * hi;
        r0 += (PLUM[0] - r0) * lo; g0 += (PLUM[1] - g0) * lo; b0 += (PLUM[2] - b0) * lo;
        var rb = smooth(0, 0.01, 0.016 - abs(vv - 0.43)) * 0.7;
        r0 += (RUST[0] - r0) * rb; g0 += (RUST[1] - g0) * rb; b0 += (RUST[2] - b0) * rb;
        var dy = (vv - 0.61) / 0.024;
        if (abs(dy) < 1.4) {
          var du = fract(x / OTW - 0.3 + 0.5) - 0.5, dx = du / 0.05, dd = dx * dx + dy * dy;
          if (dd < 1.8) {
            var k = 1 - smooth(0.6, 1.8, dd), ring = 0.5 + 0.5 * sin(sqrt(dd) * 15 + dx * 2);
            var sc = ring > 0.5 ? CRE : RUST; k *= 0.75;
            r0 += (sc[0] - r0) * k; g0 += (sc[1] - g0) * k; b0 += (sc[2] - b0) * k;
          }
        }
        r0 += (DV[0] - r0) * pol * 0.75; g0 += (DV[1] - g0) * pol * 0.75; b0 += (DV[2] - b0) * pol * 0.75;
        var o = (y * W + x) * 4; d[o] = r0; d[o + 1] = g0; d[o + 2] = b0; d[o + 3] = 255;
      }
      for (x = OTW; x < W; x++) {
        var o1 = (y * W + x) * 4, o2 = (y * W + x - OTW) * 4;
        d[o1] = d[o2]; d[o1 + 1] = d[o2 + 1]; d[o1 + 2] = d[o2 + 2]; d[o1 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    ORRIN_TEX = c; return c;
  }
  var RINGB = [[1.40, 1.47, 0.16, [196, 176, 160]], [1.50, 1.69, 0.40, [228, 210, 182]], [1.73, 1.90, 0.34, [190, 204, 216]],
    [1.93, 1.98, 0.18, [168, 190, 214]], [2.05, 2.075, 0.26, [222, 222, 232]]];
  function orrinRings(g, R, back, o) {
    var s = num(o.ringTilt, 0.12), a0 = back ? PI : 0, a1 = back ? TAU : PI, dim = num(o.dim, 0);
    var lt = num(o.light, 0.4);
    for (var i = 0; i < RINGB.length; i++) {
      var b = RINGB[i], ro = R * b[1], ri = R * b[0];
      g.beginPath(); g.ellipse(0, 0, ro, ro * s, 0, a0, a1, false); g.ellipse(0, 0, ri, ri * s, 0, a1, a0, true); g.closePath();
      g.fillStyle = rgba(mixc(b[3], [255, 196, 140], lt * 0.25), b[2] * (1 - dim) * (back ? 0.85 : 1)); g.fill();
    }
  }
  // Orrin disk. o: tilt, sun (screen angle), phase (0 full .. PI new), light 0..1, dim, spin, rings
  function orrin(g, cx, cy, R, t, o) {
    o = o || {};
    var tilt = num(o.tilt, -0.22), light = num(o.light, 0.4), phase = clamp(num(o.phase, 1.2), 0.05, PI - 0.05),
      sunA = num(o.sun, -0.6), dim = num(o.dim, 0), tex = orrinTex();
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    if (o.rings !== false) orrinRings(g, R, true, o);
    // outer atmosphere
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rgr(g, 0, 0, R * 0.97, R * 1.14, [0, rgba(mixc([120, 90, 190], [255, 170, 100], light), 0.32 * (1 - dim)), 1, 'rgba(0,0,0,0)']);
    g.beginPath(); g.arc(0, 0, R * 1.14, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
    var off = fract(t * num(o.spin, 0.0025) + num(o.lon, 0.12)), NS = 30;
    for (var i = 0; i < NS; i++) {
      var xa = -R + 2 * R * i / NS, xb = -R + 2 * R * (i + 1) / NS;
      var la = Math.asin(clamp(xa / R, -1, 1)), lb = Math.asin(clamp(xb / R, -1, 1));
      var ua = (la / TAU + 0.25 + off) * OTW, ub = (lb / TAU + 0.25 + off) * OTW;
      g.drawImage(tex, ua, 0, max(0.5, ub - ua), OTH, xa, -R, xb - xa + 1, 2 * R);
    }
    g.rotate(sunA - tilt);
    // warm tint with light
    if (light > 0) { g.globalCompositeOperation = 'overlay'; g.fillStyle = rgba([255, 150, 60], 0.32 * light); g.fillRect(-R, -R, 2 * R, 2 * R); }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = rgr(g, R * 0.3, 0, R * 0.2, R * 1.05, [0, 'rgba(30,16,50,0)', 0.7, 'rgba(30,16,50,0.18)', 1, 'rgba(24,12,44,0.6)']);
    g.fillRect(-R, -R, 2 * R, 2 * R);
    // hard cel terminator
    var rx = R * abs(cos(phase));
    g.beginPath(); g.arc(0, 0, R * 1.01, -PI / 2, PI / 2, true);
    if (phase < PI / 2) g.ellipse(0, 0, rx, R * 1.01, 0, PI / 2, 3 * PI / 2, false);
    else g.ellipse(0, 0, rx, R * 1.01, 0, PI / 2, -PI / 2, true);
    g.closePath();
    g.fillStyle = rgba(mixc([20, 12, 38], [14, 10, 26], dim), 0.9); g.fill();
    // warm terminator line
    g.globalCompositeOperation = 'lighter';
    g.beginPath(); g.ellipse(0, 0, max(1, rx), R, 0, phase < PI / 2 ? -PI / 2 : -PI / 2, phase < PI / 2 ? PI / 2 : PI / 2, phase < PI / 2);
    g.lineWidth = R * 0.03; g.strokeStyle = rgba([255, 104, 60], 0.13 * (1 - dim)); g.stroke();
    // rim light on the sun side
    g.beginPath(); g.arc(0, 0, R * 0.995, -PI / 2 + 0.15, PI / 2 - 0.15);
    g.lineWidth = R * 0.016; g.strokeStyle = rgba([255, 228, 180], 0.45 * (1 - dim) * (0.5 + light * 0.5)); g.stroke();
    g.globalCompositeOperation = 'source-over';
    if (dim > 0) { g.fillStyle = rgba([6, 4, 14], dim * 0.75); g.fillRect(-R, -R, 2 * R, 2 * R); }
    g.restore();
    // limb glow toward the sun
    g.globalCompositeOperation = 'lighter';
    g.rotate(sunA - tilt);
    g.beginPath(); g.arc(0, 0, R * 1.012, -PI / 2 + 0.25, PI / 2 - 0.25);
    g.lineWidth = R * 0.03; g.strokeStyle = rgba([255, 200, 150], 0.12 * (1 - dim)); g.stroke();
    g.rotate(-(sunA - tilt));
    g.globalCompositeOperation = 'source-over';
    if (o.rings !== false) orrinRings(g, R, false, o);
    g.restore();
  }

  // ------------------------------------------------------------------ 3D helpers
  function vadd(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vsc(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vcross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vnorm(a) { var l = sqrt(vdot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function vrot(v, k, ang) { // Rodrigues
    var c = cos(ang), s = sin(ang), kv = vcross(k, v), kd = vdot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
  }
  function camera3(yaw, pitch, dist, f, cx, cy, target) {
    var cyw = cos(yaw), syw = sin(yaw), cp = cos(pitch), sp = sin(pitch), T = target || [0, 0, 0];
    function rn(v) { var x = v[0] * cyw - v[2] * syw, z = v[0] * syw + v[2] * cyw, y = v[1]; return [x, y * cp - z * sp, y * sp + z * cp]; }
    function r(v) { var q = rn(vsub(v, T)); q[2] += dist; return q; }
    function inv(q) { // camera-space direction -> world direction
      var y = q[1] * cp + q[2] * sp, z = -q[1] * sp + q[2] * cp, x = q[0];
      return [x * cyw + z * syw, y, -x * syw + z * cyw];
    }
    return {
      r: r, rn: rn, inv: inv, f: f,
      p: function (v) { var q = r(v), k = f / max(0.06, q[2]); return [cx + q[0] * k, cy - q[1] * k, q[2], k]; },
      facing: function (pt, n) { var q = r(pt), m = rn(n); return q[0] * m[0] + q[1] * m[1] + q[2] * m[2] < 0; },
      pos: function () { return vadd(T, inv([0, 0, -dist])); }
    };
  }

  // ------------------------------------------------------------------ Vesper model
  var VL = 4.4, VN = 12, PLEN = 1.55, TH_C = -0.95, TH_O = 1.08;
  var SUN = vnorm([0.95, 0.42, -0.3]);
  function petalGeo(i, th) {
    var phi = i / VN * TAU + 0.26, c = cos(phi), s = sin(phi);
    var er = [0, c, s], et = [0, -s, c], d = [cos(th), sin(th) * c, sin(th) * s];
    var H = [VL / 2, c, s], T = vadd(H, vsc(d, PLEN));
    var hw = sin(PI / VN) * 0.95, rho = max(0.07, 1 + PLEN * sin(th)), tw = rho * sin(PI / VN) * 0.95;
    var n = vnorm([sin(th), -cos(th) * c, -cos(th) * s]);
    return { pts: [vadd(H, vsc(et, -hw)), vadd(H, vsc(et, hw)), vadd(T, vsc(et, tw)), vadd(T, vsc(et, -tw))], n: n, H: H, T: T, c: vsc(vadd(H, T), 0.5), er: er, et: et, i: i };
  }
  var VPAL = {
    day: { hull: [[40, 46, 80], [116, 120, 150], [214, 206, 190]], rim: [255, 228, 176], glass: [22, 30, 62], glassLit: [255, 214, 150],
      mirDark: [26, 36, 72], mirLit: [255, 240, 206], frame: [196, 160, 92], back: [[22, 24, 44], [52, 54, 82], [96, 96, 122]], cap: [54, 58, 92], seam: 'rgba(10,12,30,0.32)' },
    dark: { hull: [[24, 20, 48], [58, 52, 98], [104, 90, 146]], rim: [110, 214, 214], glass: [26, 20, 52], glassLit: [120, 90, 170],
      mirDark: [22, 22, 50], mirLit: [150, 130, 200], frame: [110, 92, 120], back: [[16, 14, 34], [36, 32, 66], [66, 58, 104]], cap: [36, 32, 66], seam: 'rgba(6,4,20,0.4)' }
  };
  // Renders the habitat. o: light, dark, yaw, pitch, dist, f, cx, cy, target, damaged, petalFn(i, th) -> geo|null, thFn(i) -> th
  function vesper(g, w, h, t, o) {
    var light = clamp(num(o.light, 0.5), 0, 1), dark = !!o.dark, pal = dark ? VPAL.dark : VPAL.day;
    var cm = camera3(o.yaw, o.pitch, o.dist || 11, o.f, o.cx, o.cy, o.target);
    var th = lerp(TH_C, TH_O, light), s = w / 1920;
    var hullLit = mixc(pal.hull[2], [244, 214, 172], dark ? 0 : light * 0.45);
    var NS = 48, rot = t * 0.02 + 0.3, facing = [], i, j;
    var axisFront = cm.r([VL / 2, 0, 0])[2];
    // classify petals
    var far = [], near = [], glints = [];
    for (i = 0; i < VN; i++) {
      var P = o.petalFn ? o.petalFn(i, th) : (o.damaged && i === (o.missing == null ? 4 : o.missing) ? null : petalGeo(i, o.thFn ? o.thFn(i, th) : th));
      if (!P) continue;
      P.z = cm.r(P.c)[2];
      if (cm.r(P.H || P.c)[2] > axisFront + 0.05 && !P.free) far.push(P); else near.push(P);
    }
    far.sort(function (a, b) { return b.z - a.z; }); near.sort(function (a, b) { return b.z - a.z; });
    var camPos = cm.pos();
    function drawPetal(P) {
      var q = [], k;
      for (k = 0; k < 4; k++) { q.push(cm.p(P.pts[k])); if (q[k][2] < 0.08) return; }
      var mirror = cm.facing(P.c, P.n), pk = q[0][3];
      if (mirror) {
        var nd = vdot(P.n, SUN), catchL = clamp(nd, 0, 1) * light;
        var rf = vsub(vsc(P.n, 2 * nd), SUN), view = vnorm(vsub(camPos, P.c));
        var spec = pow(max(0, vdot(rf, view)), 6) * (0.25 + light);
        var base = mixc(pal.mirDark, [70, 84, 130], dark ? 0 : 0.3);
        var lit = clamp(catchL * 0.75 + spec, 0, 1);
        var gn = num(o.gain, 1), cA = mixc(base, pal.mirLit, lit * 0.7 * gn), cB = mixc(base, pal.mirLit, min(1, (lit * 1.1 + 0.08) * gn));
        var hm = [(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2], tm = [(q[2][0] + q[3][0]) / 2, (q[2][1] + q[3][1]) / 2];
        poly(g, q); g.fillStyle = lg(g, hm[0], hm[1], tm[0], tm[1], [0, rgba(cA), 1, rgba(cB)]); g.fill();
        // sky reflection band (moves as the panel turns)
        var band = fract(vdot(P.n, [0.7, 0.5, 0.5]) * 1.7 + 0.2);
        g.save(); poly(g, q); g.clip();
        var bx = lerp(hm[0], tm[0], band), by = lerp(hm[1], tm[1], band), ww = sqrt(pow(tm[0] - hm[0], 2) + pow(tm[1] - hm[1], 2)) * 0.12;
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = rgba(mixc([90, 110, 170], pal.mirLit, lit), 0.18 + lit * 0.25); g.lineWidth = ww;
        g.beginPath(); g.moveTo(bx - (q[1][0] - q[0][0]) * 2, by - (q[1][1] - q[0][1]) * 2); g.lineTo(bx + (q[1][0] - q[0][0]) * 2, by + (q[1][1] - q[0][1]) * 2); g.stroke();
        g.restore();
        // panel lines
        g.strokeStyle = rgba(mixc(base, [0, 0, 0], 0.4), 0.55); g.lineWidth = max(0.6, pk * 0.006);
        g.beginPath();
        for (k = 1; k < 4; k++) {
          var u = k / 4;
          g.moveTo(lerp(q[0][0], q[3][0], u), lerp(q[0][1], q[3][1], u)); g.lineTo(lerp(q[1][0], q[2][0], u), lerp(q[1][1], q[2][1], u));
        }
        g.moveTo(hm[0], hm[1]); g.lineTo(tm[0], tm[1]); g.stroke();
        poly(g, q); g.strokeStyle = rgba(pal.frame, 0.85); g.lineWidth = max(0.8, pk * 0.01); g.stroke();
        if (spec > 0.25 || catchL > 0.55) glints.push([lerp(hm[0], tm[0], 0.6), lerp(hm[1], tm[1], 0.6), clamp(spec * 0.8 + (catchL - 0.5), 0, 1.4), pk]);
      } else {
        var lum = vdot(vsc(P.n, -1), SUN), tone = lum > 0.35 ? 2 : (lum > -0.15 ? 1 : 0);
        poly(g, q); g.fillStyle = rgba(pal.back[tone]); g.fill();
        g.strokeStyle = rgba(pal.back[max(0, tone - 1)], 0.9); g.lineWidth = max(0.7, pk * 0.012);
        g.beginPath(); g.moveTo(q[0][0], q[0][1]); g.lineTo(q[2][0], q[2][1]); g.moveTo(q[1][0], q[1][1]); g.lineTo(q[3][0], q[3][1]);
        g.moveTo((q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2); g.lineTo((q[2][0] + q[3][0]) / 2, (q[2][1] + q[3][1]) / 2); g.stroke();
        poly(g, q); g.strokeStyle = rgba(tone === 2 ? pal.rim : pal.back[2], tone === 2 ? 0.5 : 0.6); g.lineWidth = max(0.6, pk * 0.007); g.stroke();
      }
    }
    // spindle at the back end
    function drawSpindle() {
      var a = cm.p([-VL / 2, 0, 0]), b = cm.p([-VL / 2 - 1.2, 0, 0]);
      g.lineCap = 'butt'; g.strokeStyle = rgba(pal.hull[1]); g.lineWidth = 0.2 * (a[3] + b[3]) / 2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      g.strokeStyle = rgba(pal.hull[2], 0.6); g.lineWidth = 0.05 * a[3]; g.beginPath(); g.moveTo(a[0], a[1] - 0.06 * a[3]); g.lineTo(b[0], b[1] - 0.06 * b[3]); g.stroke();
      var e = cm.p([-VL / 2 - 1.2, 0, 0]);
      g.fillStyle = rgba(pal.hull[1]); g.beginPath(); g.arc(e[0], e[1], 0.16 * e[3], 0, TAU); g.fill();
    }
    var backVis = cm.facing([-VL / 2, 0, 0], [-1, 0, 0]);
    if (!backVis) drawSpindle();
    for (i = 0; i < far.length; i++) drawPetal(far[i]);
    // hull strips
    for (j = 0; j < NS; j++) { var pm = (j + 0.5) / NS * TAU + rot; facing[j] = cm.facing([0, cos(pm), sin(pm)], [0, cos(pm), sin(pm)]); }
    var seams = [], emerg = [];
    for (j = 0; j < NS; j++) {
      if (!facing[j]) continue;
      var p0 = j / NS * TAU + rot, p1 = (j + 1) / NS * TAU + rot, pmm = (p0 + p1) / 2;
      var n = [0, cos(pmm), sin(pmm)];
      var A = cm.p([-VL / 2, cos(p0), sin(p0)]), B = cm.p([VL / 2, cos(p0), sin(p0)]), C = cm.p([VL / 2, cos(p1), sin(p1)]), D = cm.p([-VL / 2, cos(p1), sin(p1)]);
      var lum = vdot(n, SUN), tone = lum > 0.38 ? 2 : (lum > -0.1 ? 1 : 0);
      var isWin = (j % 16) < 3, col;
      if (isWin) {
        var gl = mixc(pal.glass, pal.glassLit, (dark ? 0.25 : light * 0.9) * (tone === 0 ? 0.7 : 1));
        poly(g, [A, B, C, D]);
        g.fillStyle = lg(g, A[0], A[1], B[0], B[1], [0, rgba(mixc(gl, pal.glass, 0.5)), 0.7, rgba(gl), 1, rgba(mixc(gl, [255, 250, 230], dark ? 0 : light * 0.5))]);
        g.fill(); g.strokeStyle = rgba(gl); g.lineWidth = 0.7; g.stroke();
      } else {
        col = tone === 2 ? hullLit : pal.hull[tone];
        poly(g, [A, B, C, D]); g.fillStyle = rgba(col); g.fill(); g.strokeStyle = rgba(col); g.lineWidth = 0.8; g.stroke();
      }
      for (var sx = 1; sx < 10; sx++) { var xx = -VL / 2 + VL * sx / 10; seams.push(cm.p([xx, cos(p0), sin(p0)]), cm.p([xx, cos(p1), sin(p1)])); }
      if ((j % 16) === 3) for (var ex = 0; ex < 14; ex++) emerg.push([cm.p([-VL / 2 + VL * (ex + 0.5) / 14, cos(p0), sin(p0)]), ex, j]);
      // rim light on silhouette edges
      if (lum > -0.2 && (!facing[(j + 1) % NS] || !facing[(j + NS - 1) % NS])) {
        var e0 = !facing[(j + 1) % NS] ? [B, C] : [A, D];
        var ea = !facing[(j + 1) % NS] ? [D, C] : [A, B];
        g.strokeStyle = rgba(pal.rim, dark ? 0.55 : 0.4 + light * 0.4); g.lineWidth = max(1.2, 2.4 * s);
        g.beginPath(); g.moveTo(ea[0][0], ea[0][1]); g.lineTo(ea[1][0], ea[1][1]); g.stroke();
      }
    }
    g.strokeStyle = pal.seam; g.lineWidth = max(0.6, s * 1.1); g.beginPath();
    for (i = 0; i < seams.length; i += 2) { g.moveTo(seams[i][0], seams[i][1]); g.lineTo(seams[i + 1][0], seams[i + 1][1]); }
    g.stroke();
    // caps
    function capPoly(x) { var pts = []; for (var k = 0; k < NS; k++) { var a = k / NS * TAU + rot; pts.push(cm.p([x, cos(a), sin(a)])); } return pts; }
    if (backVis) {
      var bp = capPoly(-VL / 2); poly(g, bp); g.fillStyle = rgba(pal.hull[1]); g.fill();
      var bc = cm.p([-VL / 2, 0, 0]);
      g.strokeStyle = pal.seam; g.lineWidth = max(1, s * 1.5);
      for (i = 1; i < 4; i++) { g.beginPath(); for (j = 0; j <= NS; j++) { var a2 = j / NS * TAU; var pp = cm.p([-VL / 2, cos(a2) * i / 4, sin(a2) * i / 4]); if (j) g.lineTo(pp[0], pp[1]); else g.moveTo(pp[0], pp[1]); } g.stroke(); }
      drawSpindle();
    }
    var frontVis = cm.facing([VL / 2, 0, 0], [1, 0, 0]), fc = cm.p([VL / 2, 0, 0]);
    if (frontVis) {
      var fp = capPoly(VL / 2); poly(g, fp);
      var capC = dark ? [40, 60, 90] : mixc([30, 40, 80], [255, 236, 190], light);
      g.fillStyle = rgr(g, fc[0], fc[1], 0, fc[3] * 1.1, [0, rgba(capC), 0.6, rgba(mixc(capC, pal.cap, 0.6)), 1, rgba(pal.cap)]); g.fill();
      g.strokeStyle = rgba(pal.frame, 0.6); g.lineWidth = max(1, s * 2); g.stroke();
    }
    // emergency strip lights
    if (dark) {
      g.globalCompositeOperation = 'lighter';
      for (i = 0; i < emerg.length; i++) {
        var em = emerg[i], ph = 0.5 + 0.5 * sin(t * 2.4 - em[1] * 0.7 + em[2]);
        glow(g, em[0][0], em[0][1], 9 * s * em[0][3] / (o.f / 11) + 3, [255, 160, 60], 0.35 + 0.5 * ph);
      }
      g.globalCompositeOperation = 'source-over';
    }
    for (i = 0; i < near.length; i++) drawPetal(near[i]);
    // damaged stub
    if (o.damaged && !o.petalFn) {
      var Pm = petalGeo(o.missing == null ? 4 : o.missing, th), hq = [cm.p(Pm.pts[0]), cm.p(Pm.pts[1])];
      var mid = cm.p(vadd(Pm.H, vsc(vnorm(vsub(Pm.T, Pm.H)), 0.18)));
      g.fillStyle = rgba(pal.back[1]); g.beginPath(); g.moveTo(hq[0][0], hq[0][1]); g.lineTo(lerp(hq[0][0], mid[0], 0.9), lerp(hq[0][1], mid[1], 0.9));
      g.lineTo(lerp(hq[0][0], hq[1][0], 0.45), lerp(hq[0][1], hq[1][1], 0.45)); g.lineTo(mid[0], mid[1]); g.lineTo(hq[1][0], hq[1][1]); g.closePath(); g.fill();
      g.strokeStyle = rgba(dark ? [255, 140, 60] : pal.rim, 0.6); g.lineWidth = max(1, s * 1.5); g.stroke();
      // debris field
      var r = rng(404), dbs = [];
      for (i = 0; i < 46; i++) {
        var dv = vadd(vadd(vsc(Pm.er, 0.2 + r() * 2.2), vsc([1, 0, 0], r() * 1.6 - 0.5)), vsc(Pm.et, (r() - 0.5) * 1.8));
        var wp = vadd(Pm.H, vadd(dv, vsc(vnorm(dv), (t + 20) * 0.012 * (0.5 + r()))));
        var pp2 = cm.p(wp), sz = pp2[3] * (0.015 + r() * r() * 0.07), sp = (r() - 0.5) * 2, ph2 = r() * TAU, sides = 3 + floor(r() * 3);
        g.fillStyle = rgba(r() < 0.5 ? pal.back[2] : pal.mirDark);
        g.beginPath();
        for (k2 = 0; k2 < sides; k2++) { var aa = ph2 + t * sp + k2 / sides * TAU, rr = sz * (0.5 + 0.5 * h1(i * 7 + k2)); if (k2) g.lineTo(pp2[0] + cos(aa) * rr, pp2[1] + sin(aa) * rr); else g.moveTo(pp2[0] + cos(aa) * rr, pp2[1] + sin(aa) * rr); }
        g.closePath(); g.fill();
        var gl2 = pow(max(0, sin(t * (0.7 + abs(sp) * 2) + ph2)), 30);
        if (gl2 > 0.05) dbs.push([pp2[0], pp2[1], sz, gl2]);
      }
      g.globalCompositeOperation = 'lighter';
      for (i = 0; i < dbs.length; i++) glow(g, dbs[i][0], dbs[i][1], dbs[i][2] * 5, dark ? [180, 160, 255] : [255, 240, 210], 0.7 * dbs[i][3]);
      g.globalCompositeOperation = 'source-over';
    }
    var k2;
    // bloom
    g.globalCompositeOperation = 'lighter';
    if (frontVis && !dark && light > 0.05) glow(g, fc[0], fc[1], fc[3] * 2.2, [255, 214, 150], 0.35 * light);
    if (!dark && light > 0.3) {
      // focused light: faint cone from petals into the cap
      glow(g, fc[0], fc[1], fc[3] * 3.6, [255, 190, 120], 0.12 * light);
    }
    for (i = 0; i < glints.length; i++) {
      var G = glints[i], a3 = clamp(G[2], 0, 1.2);
      glow(g, G[0], G[1], w * 0.05 * a3 + 4, [255, 236, 200], 0.5 * a3);
      streak(g, G[0], G[1], w * 0.12 * a3, w * 0.004, [255, 220, 170], 0.45 * a3);
    }
    g.globalCompositeOperation = 'source-over';
    return { cm: cm, th: th, light: light };
  }

  // ------------------------------------------------------------------ SHOTS: space
  SH.black = function (ctx, w, h) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); };

  SH.stars = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.03);
    space(ctx, w, h, t, c, { sd: 0.6, dark: p.dark });
  };

  SH.orrin_rise = function (ctx, w, h, t, p) {
    p = p || {}; var light = clamp(num(p.light, 0.4), 0, 1), c = cam(p, t, 0.035);
    space(ctx, w, h, t, c, { sd: 0.3, top: mixc([4, 6, 16], [16, 10, 26], light), bot: mixc([12, 10, 26], [40, 20, 30], light) });
    var rise = smooth(-2, 24, t);
    var R = w * 1.05, cy = h * 0.36 + R - lerp(-h * 0.36, h * 0.06, rise);
    ctx.save(); camApply(ctx, w, h, c, 0.7);
    // distant sun glare from beyond the limb
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, w * 0.82, cy - R * 0.98, w * 0.5, [255, 170, 110], 0.18 + light * 0.25);
    ctx.globalCompositeOperation = 'source-over';
    orrin(ctx, w * 0.42, cy, R, t, { tilt: -0.12, sun: -1.25, phase: lerp(1.9, 1.15, light), light: light, ringTilt: 0.07, spin: 0.002 });
    ctx.globalCompositeOperation = 'lighter';
    var sx = w * 0.42 + cos(-1.25) * R * 0.98, sy = cy + sin(-1.25) * R * 0.98;
    glow(ctx, sx, sy, w * 0.22, [255, 190, 130], 0.25 + 0.3 * light);
    streak(ctx, sx, sy, w * 0.45, h * 0.006, [255, 210, 160], 0.3 + light * 0.3);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  };

  SH.credits_bg = function (ctx, w, h, t, p) {
    p = p || {}; var c = { x: -min(t, 120) * 0.0006, y: 0, z: 1 };
    space(ctx, w, h, t, c, { sd: 0.5, neb: 0.6, tw: 0.7 });
    ctx.save(); camApply(ctx, w, h, c, 0.25);
    orrin(ctx, w * 0.86, h * 1.05, h * 0.62, t, { tilt: -0.35, sun: -2.3, phase: 1.75, light: 0.3, dim: 0.35, ringTilt: 0.16 });
    ctx.restore();
  };

  // ------------------------------------------------------------------ SHOTS: Vesper
  function sunGlare(g, w, h, x, y, a) {
    g.globalCompositeOperation = 'lighter';
    glow(g, x, y, w * 0.45, [255, 170, 110], 0.22 * a);
    glow(g, x, y, w * 0.08, [255, 246, 226], 0.9 * a);
    streak(g, x, y, w * 0.6, h * 0.008, [255, 214, 170], 0.45 * a);
    g.globalCompositeOperation = 'source-over';
  }

  SH.vesper_exterior = function (ctx, w, h, t, p) {
    p = p || {}; var dark = !!p.dark, light = clamp(num(p.light, dark ? 0 : 0.6), 0, 1), c = cam(p, t, 0.035);
    space(ctx, w, h, t, c, { sd: 0.2, top: dark ? [6, 4, 18] : [5, 7, 18], bot: dark ? [16, 10, 30] : [12, 10, 28] });
    ctx.save(); camApply(ctx, w, h, c, 0.35);
    orrin(ctx, w * 0.1, h * 1.22, h * 0.9, t, { tilt: -0.3, sun: -0.75, phase: 1.3, light: light * 0.8, dim: dark ? 0.55 : 0.12, ringTilt: 0.1 });
    if (!dark && light > 0.02) sunGlare(ctx, w, h, w * 1.02, h * 0.06, 0.5 + light * 0.6);
    ctx.restore();
    ctx.save(); camApply(ctx, w, h, c, 1);
    var yawDrift = p.pan === 'left' ? 0.006 : (p.pan === 'right' ? -0.006 : 0.003);
    vesper(ctx, w, h, t, { light: light, dark: dark, damaged: !!p.damaged, yaw: -0.62 + t * yawDrift, pitch: 0.3, f: w * 1.05, cx: w * 0.42, cy: h * 0.58, dist: 11 });
    ctx.restore();
  };

  SH.mirror_petals_close = function (ctx, w, h, t, p) {
    p = p || {}; var dark = !!p.dark, c = cam(p, t, 0.03);
    var light = p.opening ? lerp(0.08, 0.95, smooth(0.4, 7.6, t)) : clamp(num(p.light, dark ? 0.1 : 0.55), 0, 1);
    space(ctx, w, h, t, c, { sd: 0.2, top: [4, 5, 14], bot: mixc([12, 8, 24], [40, 22, 30], light) });
    ctx.save(); camApply(ctx, w, h, c, 0.3);
    if (!dark) sunGlare(ctx, w, h, w * 0.9, h * 0.12, 0.35 + light * 0.9);
    ctx.restore();
    ctx.save(); camApply(ctx, w, h, c, 1);
    var yaw = -1.05 + t * 0.012;
    vesper(ctx, w, h, t, { light: light, dark: dark, yaw: yaw, pitch: 0.22 - t * 0.004, f: w * 0.95, cx: w * 0.5, cy: h * 0.55, dist: 3.4, target: [VL / 2 + 0.45, 0.75, -0.1], gain: 0.6 });
    ctx.restore();
    // flood of light as they open
    if (!dark && light > 0.5) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba([255, 200, 140], (light - 0.5) * 0.12); ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
  };

  // THE INCIDENT. ~8 s: petals open at dawn, one shudders, the restraint snaps,
  // the petal shears off and tumbles back along the hull, its mirror throws a
  // spear of light that sweeps across the agricultural ring; fire blooms; the
  // array slams shut and violet darkness falls.
  SH.mirror_tear = function (ctx, w, h, t, p) {
    p = p || {};
    var TR = 1.9, tt = t - TR, s = w / 1920;
    var open = lerp(0.4, 0.92, smooth(0, 1.6, t));
    var close = p.noClose ? 0 : smooth(6.7, 8.2, t);
    var light = open * (1 - close);
    // camera shake
    var shk = (smooth(TR - 0.04, TR + 0.04, t) * exp(-max(0, tt) * 1.5) * 0.014 + bump(t, 2.9, 0.9) * 0.004 + bump(t, 7.4, 0.5) * 0.006) * w;
    var shx = shk * (vn(t * 27) - 0.5) * 2, shy = shk * (vn(t * 23 + 9) - 0.5) * 2;
    var c = cam(p, t, 0.02);
    space(ctx, w, h, t, c, { sd: 0.2, top: mixc([4, 6, 16], [8, 4, 20], close), bot: mixc([30, 18, 34], [16, 8, 30], close) });
    ctx.save(); camApply(ctx, w, h, c, 0.3);
    orrin(ctx, w * 0.95, h * 1.25, h * 0.7, t, { tilt: 0.25, sun: -2.4, phase: 1.5, light: 0.5, dim: 0.3 + close * 0.3, ringTilt: 0.12 });
    sunGlare(ctx, w, h, w * 0.05, h * 0.08, (0.6 + 0.4 * open) * (1 - close * 0.85));
    ctx.restore();

    ctx.save(); ctx.translate(shx, shy); camApply(ctx, w, h, c, 1);
    var yaw = -0.8 + t * 0.006, pitch = 0.42;
    var cm0 = camera3(yaw, pitch, 7.4, w * 1.05, w * 0.46, h * 0.62, [0.9, 0, 0]);
    // choose the petal on the top silhouette (reads against space)
    var up = cm0.inv([0, 1, 0]), K = 0, best = -9;
    for (var i = 0; i < VN; i++) { var phi = i / VN * TAU + 0.26, d0 = up[1] * cos(phi) + up[2] * sin(phi); if (d0 > best) { best = d0; K = i; } }
    var thO = lerp(TH_C, TH_O, open), P0 = petalGeo(K, thO), C0 = P0.c;
    var axis = vnorm(vadd(vadd(P0.et, [0.35, 0, 0]), vsc(P0.er, 0.2)));
    var hinge = P0.H, impactPts = [];
    var dirC = vnorm(vsub(cm0.pos(), [0, 0, 0])); var phc = atan2(dirC[2], dirC[1]) + 0.25;
    function hullPt(sv, jit) { var pj = phc + (jit || 0); return [lerp(VL / 2 - 0.25, -VL / 2 + 0.35, sv), cos(pj), sin(pj)]; }
    var info = vesper(ctx, w, h, t, {
      light: light, dark: false, yaw: yaw, pitch: pitch, dist: 7.4, f: w * 1.05, cx: w * 0.46, cy: h * 0.62, target: [0.9, 0, 0],
      petalFn: function (i, th) {
        if (i !== K) return petalGeo(i, th);
        if (t < TR) {
          var shud = 0.06 * sin(t * 47) * smooth(0.8, TR, t) + 0.12 * smooth(1.5, TR, t) * sin(t * 13);
          return petalGeo(i, th + shud);
        }
        var P = petalGeo(i, thO), ang = 1.05 * tt + 0.12 * tt * tt;
        var vel = vadd(vsc([1, 0, 0], -0.62), vsc(P0.er, 0.06)), pos = vadd(C0, vadd(vsc(vel, tt), vsc(P0.er, -0.015 * tt * tt)));
        for (var k = 0; k < 4; k++) P.pts[k] = vadd(pos, vrot(vsub(P.pts[k], C0), axis, ang));
        P.n = vrot(P.n, axis, ang); P.c = pos; P.H = pos; P.free = true;
        return P;
      }
    });
    var cm = info.cm;
    // ---- debris & sparks from the hinge
    var hp = cm.p(hinge);
    if (tt > 0) {
      var r = rng(717), glints = [];
      for (i = 0; i < 80; i++) {
        var v = vadd(vadd(vsc(P0.er, 0.15 + r() * 0.9), vsc([1, 0, 0], r() * 1.2 - 0.75)), vsc(P0.et, (r() - 0.5) * 1.3));
        var sp = 0.35 + r() * 0.9, wp = vadd(hinge, vsc(v, tt * sp * (1 - 0.04 * tt))), pp = cm.p(wp);
        var sz = pp[3] * (0.008 + r() * r() * 0.05), spin = (r() - 0.5) * 9, ph = r() * TAU, mirrorShard = r() < 0.55, sides = 3 + floor(r() * 2);
        ctx.fillStyle = rgba(mirrorShard ? mixc([60, 70, 110], [210, 200, 220], 0.4 * (1 - close)) : [40, 38, 56]);
        ctx.beginPath();
        for (var k = 0; k < sides; k++) { var aa = ph + tt * spin + k / sides * TAU, rr = sz * (0.45 + 0.55 * h1(i * 11 + k)); if (k) ctx.lineTo(pp[0] + cos(aa) * rr, pp[1] + sin(aa) * rr); else ctx.moveTo(pp[0] + cos(aa) * rr, pp[1] + sin(aa) * rr); }
        ctx.closePath(); ctx.fill();
        if (mirrorShard) { var gg = pow(max(0, sin(tt * abs(spin) * 0.8 + ph)), 18) * (1 - close * 0.7); if (gg > 0.03) glints.push([pp[0], pp[1], sz, gg]); }
      }
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < glints.length; i++) { glow(ctx, glints[i][0], glints[i][1], glints[i][2] * 6 + 3, [255, 244, 220], glints[i][3] * 0.8); }
      // sparks: short streaks in the first second
      var r2 = rng(99);
      for (i = 0; i < 46; i++) {
        var a = r2() * TAU, spd = (0.05 + r2() * 0.25) * w, life = 0.35 + r2() * 0.9;
        if (tt > life) continue;
        var u = tt / life, d1 = spd * tt, x1 = hp[0] + cos(a) * d1, y1 = hp[1] + sin(a) * d1 + 0.02 * w * tt * tt;
        ctx.strokeStyle = rgba(mixc([255, 250, 220], [255, 120, 40], u), 1 - u); ctx.lineWidth = max(1, 2.2 * s * (1 - u));
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - cos(a) * spd * 0.05, y1 - sin(a) * spd * 0.05); ctx.stroke();
      }
      // snap flash at the hinge
      var fl = exp(-tt * 3.2);
      glow(ctx, hp[0], hp[1], w * 0.22 * (0.4 + fl), [255, 220, 180], 0.9 * fl);
      streak(ctx, hp[0], hp[1], w * 0.5 * fl + 2, h * 0.01, [255, 236, 210], 0.8 * fl);
      ctx.globalCompositeOperation = 'source-over';
    }
    // ---- the spear of light
    var I = smooth(0.12, 0.4, tt) * (1 - smooth(3.4, 4.6, tt));
    var sv = lerp(-0.45, 1.3, smooth(0.25, 4.1, tt));
    var fires = [[0.42, 0.12], [0.5, -0.15], [0.57, 0.05], [0.66, 0.22], [0.73, -0.08]];
    // the free petal's screen centre
    var Pf = petalGeo(K, thO), ang2 = 1.05 * max(0, tt) + 0.12 * max(0, tt) * max(0, tt);
    var posF = vadd(C0, vadd(vsc(vadd(vsc([1, 0, 0], -0.62), vsc(P0.er, 0.06)), max(0, tt)), vsc(P0.er, -0.015 * max(0, tt) * max(0, tt))));
    var o = cm.p(posF);
    ctx.globalCompositeOperation = 'lighter';
    if (I > 0.001) {
      var tgt = cm.p(hullPt(clamp(sv, -0.6, 1.4))), dx = tgt[0] - o[0], dy = tgt[1] - o[1], dl = sqrt(dx * dx + dy * dy) || 1;
      var onHull = sv >= 0 && sv <= 1, len = onHull ? dl : w * 2.4, ux = dx / dl, uy = dy / dl, nx = -uy, ny = ux;
      var w0 = w * 0.012, w1 = w * (onHull ? 0.05 : 0.12);
      // outer haze wedge
      for (var pass = 0; pass < 3; pass++) {
        var sc = [3.2, 1.6, 0.55][pass], al = [0.16, 0.32, 0.9][pass] * I, colr = [[255, 160, 90], [255, 214, 160], [255, 252, 240]][pass];
        ctx.beginPath();
        ctx.moveTo(o[0] + nx * w0 * sc * 0.5, o[1] + ny * w0 * sc * 0.5);
        ctx.lineTo(o[0] + ux * len + nx * w1 * sc * 0.5, o[1] + uy * len + ny * w1 * sc * 0.5);
        ctx.lineTo(o[0] + ux * len - nx * w1 * sc * 0.5, o[1] + uy * len - ny * w1 * sc * 0.5);
        ctx.lineTo(o[0] - nx * w0 * sc * 0.5, o[1] - ny * w0 * sc * 0.5); ctx.closePath();
        ctx.fillStyle = lg(ctx, o[0], o[1], o[0] + ux * len, o[1] + uy * len, [0, rgba(colr, al), 0.7, rgba(colr, al * 0.7), 1, rgba(colr, onHull ? al * 0.6 : 0)]);
        ctx.fill();
      }
      glow(ctx, o[0], o[1], w * 0.16 * I, [255, 236, 200], 0.9 * I);
      streak(ctx, o[0], o[1], w * 0.55 * I, h * 0.012, [255, 230, 190], 0.7 * I);
      if (onHull) {
        glow(ctx, tgt[0], tgt[1], w * 0.11 * I, [255, 190, 110], 0.95 * I);
        glow(ctx, tgt[0], tgt[1], w * 0.03 * I, [255, 255, 240], 1.0 * I);
        streak(ctx, tgt[0], tgt[1], w * 0.25 * I, h * 0.008, [255, 200, 140], 0.6 * I);
      }
      // white-out as the beam first passes the lens
      var wo = bump(tt, 0.42, 0.14) * 0.55;
      if (wo > 0.01) { ctx.fillStyle = rgba([255, 246, 232], wo); ctx.fillRect(-w, -h, 3 * w, 3 * h); }
    }
    // ---- fires on the agricultural ring + venting atmosphere
    for (i = 0; i < fires.length; i++) {
      var fsv = fires[i][0], tign = 0.25 + (fsv + 0.45) / 1.75 * 3.85;
      var age = tt - tign; if (age <= 0) continue;
      var fp = cm.p(hullPt(fsv, fires[i][1])), grow = smooth(0, 1.2, age), fl2 = 0.75 + 0.25 * vn(t * 9 + i * 13);
      var rad = w * (0.014 + 0.016 * h1(i * 5.3)) * grow * fl2;
      glow(ctx, fp[0], fp[1], rad * 4.5, [255, 110, 40], 0.5 * grow);
      glow(ctx, fp[0], fp[1], rad * 1.3, [255, 190, 90], 0.9 * grow * fl2);
      for (var fk = 0; fk < 5; fk++) { var fa = h1(i * 9 + fk) * TAU + t * (1 + fk * 0.3); glow(ctx, fp[0] + cos(fa) * rad * 0.8, fp[1] + sin(fa) * rad * 0.5, rad * 0.7, [255, 140 + fk * 15, 50], 0.6 * grow); }
      // vapour jets
      ctx.globalCompositeOperation = 'source-over';
      var vdir = cm.rn(vnorm([0.2, cos(phc), sin(phc)]));
      var vx = vdir[0], vy = -vdir[1], vl = sqrt(vx * vx + vy * vy) || 1; vx /= vl; vy /= vl;
      for (var j = 0; j < 7; j++) {
        var u2 = fract(age * 0.35 + j / 7), spread = (h1(i * 31 + j) - 0.5) * 0.9;
        var jx = fp[0] + (vx + spread * -vy) * u2 * w * 0.14 * grow, jy = fp[1] + (vy + spread * vx) * u2 * w * 0.14 * grow;
        glow(ctx, jx, jy, w * (0.01 + 0.03 * u2), [150, 140, 160], 0.16 * (1 - u2) * grow);
      }
      ctx.globalCompositeOperation = 'lighter';
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    // ---- light dies: violet darkness as the array slams closed
    if (close > 0) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = rgba(mixc([255, 255, 255], [96, 80, 150], close)); ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      // fires still burning through the dark
      ctx.save(); ctx.translate(shx, shy); camApply(ctx, w, h, c, 1); ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < fires.length; i++) {
        var fp2 = cm.p(hullPt(fires[i][0], fires[i][1])), fl3 = 0.7 + 0.3 * vn(t * 8 + i * 5);
        glow(ctx, fp2[0], fp2[1], w * 0.06 * fl3, [255, 110, 30], 0.5 * close);
        glow(ctx, fp2[0], fp2[1], w * 0.015 * fl3, [255, 200, 110], 0.8 * close);
      }
      ctx.restore();
    }
  };

  // ------------------------------------------------------------------ cylinder interior
  // Camera sits near the ground looking down the axis; the land curves up on
  // both sides and meets overhead. Painted once per (w, h, mode).
  var IPAL = {
    dusk: { fields: [[58, 52, 98], [66, 70, 104], [48, 60, 88], [78, 62, 106], [42, 56, 82], [86, 74, 112]], haze: [92, 78, 140], town: [70, 72, 110],
      water: [40, 70, 96], axis: [150, 120, 210], cap: [40, 34, 72], capWin: [120, 100, 190], lights: [255, 176, 92], lightN: 140, sky: [30, 22, 56] },
    night: { fields: [[22, 28, 56], [26, 34, 64], [20, 32, 54], [30, 30, 62], [18, 26, 48], [34, 38, 70]], haze: [40, 46, 92], town: [30, 34, 64],
      water: [24, 40, 70], axis: [70, 80, 150], cap: [20, 22, 46], capWin: [60, 70, 130], lights: [255, 214, 150], lightN: 900, sky: [10, 12, 30] },
    fire: { fields: [[66, 50, 86], [74, 64, 96], [56, 56, 82], [88, 60, 92], [50, 52, 78], [96, 72, 100]], haze: [120, 84, 128], town: [74, 66, 100],
      water: [50, 66, 96], axis: [200, 140, 190], cap: [44, 34, 66], capWin: [190, 140, 190], lights: [255, 170, 90], lightN: 90, sky: [34, 22, 50] }
  };
  var ICAM = { hc: 0.2, pitch: 0.2, fov: 0.5, cy: 0.62, len: 11 };
  function iproj(w, h, phi, z, rad) {
    rad = rad == null ? 1 : rad;
    var X = rad * sin(phi), Y = -rad * cos(phi) + 1 - ICAM.hc, Z = z, cp = cos(ICAM.pitch), sp = sin(ICAM.pitch);
    var Y2 = Y * cp - Z * sp, Z2 = Y * sp + Z * cp, f = w * ICAM.fov;
    return [w / 2 + f * X / max(0.02, Z2), h * ICAM.cy - f * Y2 / max(0.02, Z2), Z2, sqrt(X * X + Y * Y + Z * Z)];
  }
  function interiorPlate(w, h, mode) {
    var pal = IPAL[mode] || IPAL.dusk;
    return plate('interior_' + mode, w, h, 0.8, function (g, w, h, m) {
      var x0 = -m * w, y0 = -m * h, W = w * (1 + 2 * m), H = h * (1 + 2 * m);
      g.fillStyle = rgba(pal.sky); g.fillRect(x0, y0, W, H);
      var L = ICAM.len, i, j;
      // end cap
      var cp = [], NP = 72;
      for (i = 0; i < NP; i++) cp.push(iproj(w, h, i / NP * TAU, L));
      poly(g, cp); g.fillStyle = rgba(pal.cap); g.fill();
      var cc = iproj(w, h, 0, L, 0);
      g.fillStyle = rgr(g, cc[0], cc[1], 0, abs(cp[0][1] - cc[1]) * 0.3, [0, rgba(pal.capWin, 0.9), 0.5, rgba(pal.capWin, 0.35), 1, rgba(pal.capWin, 0)]);
      g.fillRect(x0, y0, W, H);
      // land quads, far to near
      var NF = 180, NZ = 70, z = [];
      for (j = 0; j <= NZ; j++) z.push(0.12 * pow(L / 0.12, j / NZ));
      for (j = NZ - 1; j >= 0; j--) {
        for (i = 0; i < NF; i++) {
          var pa = -PI + i / NF * TAU, pb = -PI + (i + 1) / NF * TAU;
          var A = iproj(w, h, pa, z[j]), B = iproj(w, h, pb, z[j]), C = iproj(w, h, pb, z[j + 1]), D = iproj(w, h, pa, z[j + 1]);
          if (A[2] < 0.03 || B[2] < 0.03 || C[2] < 0.03 || D[2] < 0.03) continue;
          var pm = (pa + pb) / 2, zm = (z[j] + z[j + 1]) / 2;
          var fi = floor((pm + PI) / TAU * 110), zi = floor(zm * 7 + h1(fi) * 3);
          var hv = h1(fi * 31.7 + zi * 7.3), col = mixc(pal.fields[floor(hv * pal.fields.length)], pal.fields[floor(h1(floor(fi / 6) * 3.3 + floor(zi / 5)) * pal.fields.length)], 0.5);
          if (h1(fi * 3.1 + zi * 1.7 + 5) > 0.84) col = pal.town;
          if (abs(((pm + 2.2 + 0.05 * sin(zm * 2)) % 2.1) - 1.05) < 0.03) col = pal.water;
          var dist = (A[3] + C[3]) / 2, hz = 1 - exp(-dist * 0.17 - (1 - cos(pm)) * 0.06);
          // overhead faces the axis light a little more
          var c2 = mixc(col, pal.haze, hz * 0.85);
          c2 = mixc(c2, [0, 0, 0], 0.18 * (1 - abs(cos(pm))) * (1 - hz));
          poly(g, [A, B, C, D]); g.fillStyle = rgba(c2); g.fill(); g.strokeStyle = rgba(c2); g.lineWidth = 1; g.stroke();
        }
      }
      // ring roads: constant-z circles reveal the curvature
      for (j = 4; j < NZ; j += 3) {
        g.beginPath(); var st0 = false;
        for (i = 0; i <= 120; i++) { var q0 = iproj(w, h, -PI + i / 120 * TAU, z[j] * (1 + 0.15 * h1(j))); if (q0[2] < 0.05) { st0 = false; continue; } if (st0) g.lineTo(q0[0], q0[1]); else { g.moveTo(q0[0], q0[1]); st0 = true; } }
        var dz0 = 1 - exp(-z[j] * 0.25);
        g.strokeStyle = rgba(mixc(pal.lights, pal.haze, 0.6 + dz0 * 0.4), 0.22 * (1 - dz0 * 0.7)); g.lineWidth = max(0.7, w * 0.0016 / (1 + z[j] * 0.4)); g.stroke();
      }
      g.strokeStyle = rgba(mixc(pal.fields[0], [0, 0, 0], 0.3), 0.18); g.lineWidth = max(0.6, w / 1920);
      for (i = 0; i < 24; i++) {
        var ph = -PI + (i + 0.5) / 24 * TAU; g.beginPath(); var st = false;
        for (j = 2; j <= NZ; j += 2) { var q = iproj(w, h, ph, z[j]); if (q[2] < 0.05) { st = false; continue; } if (st) g.lineTo(q[0], q[1]); else { g.moveTo(q[0], q[1]); st = true; } }
        g.stroke();
      }
      // town lights
      var r = rng(mode === 'night' ? 31 : 17);
      g.globalCompositeOperation = 'lighter';
      // lantern-lit ring roads: dotted arcs climbing up and over
      var RZ = [0.9, 1.6, 2.6, 4.0, 6.0, 8.5];
      for (j = 0; j < RZ.length; j++) {
        var nd = 260, lc0 = mode === 'night' ? [255, 220, 160] : [255, 170, 90];
        for (i = 0; i < nd; i++) {
          if (h1(i * 0.37 + j * 11) < 0.25) continue;
          var qa = iproj(w, h, -PI + (i + 0.5) / nd * TAU, RZ[j]); if (qa[2] < 0.08) continue;
          var da = 1 - exp(-qa[3] * 0.15), szr = clamp(w * 0.0035 / qa[3], 0.7, 3);
          g.fillStyle = rgba(lc0, 0.75 * (1 - da * 0.6)); g.fillRect(qa[0] - szr / 2, qa[1] - szr / 2, szr, szr);
        }
      }
      // canals catching the axis light
      for (j = 0; j < 3; j++) {
        var cph = -PI + (j + 0.5) / 3 * TAU + 0.3; g.beginPath(); var st1 = false;
        for (i = 4; i <= NZ; i++) { var qc = iproj(w, h, cph + 0.04 * sin(z[i] * 1.3), z[i]); if (qc[2] < 0.05) { st1 = false; continue; } if (st1) g.lineTo(qc[0], qc[1]); else { g.moveTo(qc[0], qc[1]); st1 = true; } }
        g.strokeStyle = rgba(pal.axis, 0.35); g.lineWidth = max(1, w * 0.003); g.stroke();
      }
      for (i = 0; i < pal.lightN; i++) {
        var cl = r() < 0.5, phi = cl ? (floor(r() * 9) / 9 * TAU - PI + (r() - 0.5) * 0.3) : -PI + r() * TAU, zz = 0.5 + pow(r(), 1.4) * (L - 0.8);
        var q2 = iproj(w, h, phi, zz); if (q2[2] < 0.1) continue;
        var sz = clamp(w * 0.004 / q2[3], 0.6, 3.5), a = 0.4 + r() * 0.6;
        var lc = mixc(pal.lights, [255, 240, 220], r() * 0.4);
        if (r() < 0.12) glow(g, q2[0], q2[1], sz * 6, lc, a * 0.5);
        g.fillStyle = rgba(lc, a); g.fillRect(q2[0] - sz / 2, q2[1] - sz / 2, sz, sz);
      }
      // the axial light line and its clouds
      var ax = [];
      for (j = 2; j <= NZ; j++) ax.push(iproj(w, h, 0, z[j], 0));
      for (var pass = 0; pass < 3; pass++) {
        g.beginPath(); g.moveTo(ax[0][0], ax[0][1]); for (j = 1; j < ax.length; j++) g.lineTo(ax[j][0], ax[j][1]);
        g.strokeStyle = rgba(pal.axis, [0.05, 0.07, 0.22][pass]); g.lineWidth = [w * 0.05, w * 0.015, max(1, w * 0.002)][pass]; g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
      for (i = 0; i < 60; i++) {
        var zc = 0.8 + r() * (L - 2), rc = 0.2 + r() * 0.4, pc = r() * TAU, q3 = iproj(w, h, pc, zc, rc);
        if (q3[2] < 0.2) continue;
        var cs = w * 0.18 / q3[3] * (0.6 + r());
        for (var cb = 0; cb < 4; cb++) { g.fillStyle = rgba(mixc(pal.haze, pal.axis, 0.3 + cb * 0.1), 0.1); g.beginPath(); g.ellipse(q3[0] + (cb - 1.5) * cs * 0.5, q3[1] - cb % 2 * cs * 0.12, cs * (0.6 + 0.2 * (cb % 2)), cs * 0.25, atan2(q3[1] - cc[1], q3[0] - cc[0]) + PI / 2, 0, TAU); g.fill(); }
      }
    });
  }
  // rooftop skyline silhouette (foreground)
  function skylinePlate(w, h, mode) {
    return plate('skyline_' + mode, w, h, 1, function (g, w, h, m) {
      var r = rng(mode === 'fire' ? 5 : 8), x = -m * w, base = h * (1 + m);
      var col = mode === 'fire' ? [22, 14, 26] : (mode === 'night' ? [8, 10, 22] : [16, 14, 34]);
      var rim = mode === 'fire' ? [255, 130, 60] : (mode === 'night' ? [120, 140, 200] : [110, 200, 210]);
      while (x < w * (1 + m)) {
        var bw = w * (0.03 + r() * 0.07), bh = h * (0.08 + r() * r() * 0.2) * (mode === 'fire' ? 0.6 : 1), top = h * 0.98 - bh;
        g.fillStyle = rgba(col); g.fillRect(x, top, bw + 1, base - top);
        if (r() < 0.4) { g.fillRect(x + bw * 0.3, top - h * 0.03, bw * 0.12, h * 0.03); }
        g.fillStyle = rgba(rim, 0.5); g.fillRect(x, top, bw, max(1, w * 0.0012));
        // windows
        for (var k = 0; k < 8; k++) if (r() < 0.35) {
          var wx = x + bw * (0.1 + r() * 0.75), wy = top + h * 0.012 + r() * (bh - h * 0.02);
          g.fillStyle = rgba(mode === 'night' ? [255, 214, 150] : [255, 170, 80], 0.5 + r() * 0.5);
          g.fillRect(wx, wy, w * 0.004, h * 0.006);
        }
        x += bw + w * r() * 0.01;
      }
    });
  }

  SH.dark_habitat = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.04);
    drawPlate(ctx, interiorPlate(w, h, 'dusk'), w, h, c, 0.6);
    // lantern flicker + a lone tram crawling across the far land
    ctx.save(); camApply(ctx, w, h, c, 0.6); ctx.globalCompositeOperation = 'lighter';
    var r = rng(55);
    for (var i = 0; i < 40; i++) {
      var phi = -PI + r() * TAU, z = 0.8 + r() * 8, q = iproj(w, h, phi, z);
      if (q[2] < 0.1) continue;
      var fl = 0.5 + 0.5 * vn(t * (0.6 + r()) + i * 3);
      glow(ctx, q[0], q[1], w * 0.02 / q[3] + 2, [255, 170, 80], 0.35 * fl);
    }
    var tz = 1.5 + fract(t * 0.012) * 7, tq = iproj(w, h, 2.4, tz);
    glow(ctx, tq[0], tq[1], w * 0.012, [255, 210, 150], 0.7);
    // slow cloud drift near the axis
    ctx.globalCompositeOperation = 'source-over';
    for (i = 0; i < 6; i++) {
      var cz = 2 + i * 1.3, cphi = i * 1.7 + t * 0.01, cq = iproj(w, h, cphi, cz, 0.45);
      if (cq[2] < 0.2) continue;
      var cs = w * 0.22 / cq[3];
      ctx.fillStyle = 'rgba(70,56,110,0.12)'; ctx.beginPath(); ctx.ellipse(cq[0], cq[1], cs, cs * 0.3, -0.15, 0, TAU); ctx.fill();
    }
    ctx.restore();
    drawPlate(ctx, skylinePlate(w, h, 'dusk'), w, h, c, 1.25);
    // amber emergency strips on the nearest roofs
    ctx.save(); camApply(ctx, w, h, c, 1.25); ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < 9; i++) {
      var x = w * (0.05 + i * 0.11), ph = 0.6 + 0.4 * sin(t * 1.5 + i);
      ctx.fillStyle = rgba([255, 150, 50], 0.5 * ph); ctx.fillRect(x, h * 0.965, w * 0.03, max(1, h * 0.003));
      glow(ctx, x + w * 0.015, h * 0.966, w * 0.03, [255, 140, 40], 0.18 * ph);
    }
    ctx.restore();
  };

  SH.fire_agri_ring = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.035), s = w / 1920;
    drawPlate(ctx, interiorPlate(w, h, 'fire'), w, h, c, 0.6);
    ctx.save(); camApply(ctx, w, h, c, 0.6);
    var fires = [[0.95, 2.4, 1.0], [1.22, 3.6, 0.7], [0.62, 5.5, 0.45]];
    // orange spill on the land
    ctx.globalCompositeOperation = 'lighter';
    for (var f = 0; f < fires.length; f++) {
      var B = iproj(w, h, fires[f][0], fires[f][1]), sc = fires[f][2], fl = 0.8 + 0.2 * vn(t * 5 + f * 7);
      glow(ctx, B[0], B[1], w * 0.35 * sc, [255, 100, 40], 0.3 * fl);
    }
    ctx.globalCompositeOperation = 'source-over';
    // smoke rising toward the axis (Coriolis-bent)
    for (f = 0; f < fires.length; f++) {
      var Bf = iproj(w, h, fires[f][0], fires[f][1]), Af = iproj(w, h, fires[f][0] * 0.25, fires[f][1] + 0.6, 0.05), sc2 = fires[f][2];
      for (var i = 0; i < 34; i++) {
        var u = fract(t * 0.045 + i / 34), bend = sin(u * PI) * w * 0.07 * sc2;
        var x = lerp(Bf[0], Af[0], u * 0.9) + bend + sin(i * 2.3 + t * 0.4) * w * 0.012 * u;
        var y = lerp(Bf[1], Af[1], u * 0.9);
        var rr = w * lerp(0.012, 0.075, u) * sc2;
        var sm = mixc([110, 60, 50], [34, 24, 40], smooth(0, 0.35, u));
        ctx.fillStyle = rgba(sm, 0.42 * (1 - u) * smooth(0, 0.06, u));
        ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
      }
    }
    // flames
    ctx.globalCompositeOperation = 'lighter';
    for (f = 0; f < fires.length; f++) {
      var Bq = iproj(w, h, fires[f][0], fires[f][1]), sc3 = fires[f][2] * w * 0.05;
      var Aq = iproj(w, h, 0, fires[f][1], 0), ux = Aq[0] - Bq[0], uy = Aq[1] - Bq[1], ul = sqrt(ux * ux + uy * uy) || 1; ux /= ul; uy /= ul;
      for (i = 0; i < 28; i++) {
        var off = (h1(i * 3.7 + f) - 0.5) * sc3 * 3, ht = sc3 * (0.3 + 1.1 * vn(t * 3.6 + i * 1.7 + f * 11)) * (1 - abs(off / (sc3 * 1.5)) * 0.7);
        var bx = Bq[0] - uy * off, by = Bq[1] + ux * off, sway = sin(t * 4 + i) * sc3 * 0.2;
        var tx = bx + ux * ht - uy * sway, ty = by + uy * ht + ux * sway;
        var wd = sc3 * (0.06 + 0.08 * h1(i * 5.1));
        ctx.beginPath(); ctx.moveTo(bx - uy * wd, by + ux * wd);
        ctx.quadraticCurveTo(bx + ux * ht * 0.5 - uy * wd * 1.2, by + uy * ht * 0.5 + ux * wd * 1.2, tx, ty);
        ctx.quadraticCurveTo(bx + ux * ht * 0.5 + uy * wd * 1.2, by + uy * ht * 0.5 - ux * wd * 1.2, bx + uy * wd, by - ux * wd); ctx.closePath();
        ctx.fillStyle = lg(ctx, bx, by, tx, ty, [0, 'rgba(255,236,170,0.75)', 0.35, 'rgba(255,150,50,0.55)', 1, 'rgba(200,40,20,0)']); ctx.fill();
      }
      glow(ctx, Bq[0], Bq[1], sc3 * 2.4, [255, 200, 110], 0.6);
      // embers
      for (i = 0; i < 20; i++) {
        var eu = fract(t * (0.15 + h1(i + f * 40) * 0.2) + h1(i * 3 + f));
        var ex = Bq[0] + (h1(i * 7 + f) - 0.5) * sc3 * 3 + ux * eu * sc3 * 6 + sin(t * 2 + i) * sc3 * 0.4, ey = Bq[1] + uy * eu * sc3 * 6;
        ctx.fillStyle = rgba([255, 190, 100], 0.9 * (1 - eu)); ctx.fillRect(ex, ey, max(1, 2 * s), max(1, 2 * s));
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    // foreground ridge with fence, rim-lit by the fire
    drawPlate(ctx, fireFgPlate(w, h), w, h, c, 1.3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba([255, 90, 30], 0.05 + 0.03 * vn(t * 6)); ctx.fillRect(0, 0, w, h);
    ctx.restore();
  };
  function fireFgPlate(w, h) {
    return plate('firefg', w, h, 1, function (g, w, h, m) {
      var x0 = -m * w, x1 = w * (1 + m), pts = [];
      for (var i = 0; i <= 40; i++) { var x = lerp(x0, x1, i / 40); pts.push([x, h * (0.86 + 0.05 * sin(i * 0.5) + 0.02 * sin(i * 1.7) - 0.06 * smooth(0.5, 1, i / 40))]); }
      g.beginPath(); g.moveTo(x0, h * (1 + m)); for (i = 0; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.lineTo(x1, h * (1 + m)); g.closePath();
      g.fillStyle = '#120a12'; g.fill();
      g.beginPath(); for (i = 0; i < pts.length; i++) { if (i) g.lineTo(pts[i][0], pts[i][1]); else g.moveTo(pts[i][0], pts[i][1]); }
      g.strokeStyle = 'rgba(255,120,50,0.55)'; g.lineWidth = max(1, w * 0.0015); g.stroke();
      // fence posts and wire
      g.fillStyle = '#0c060c'; g.strokeStyle = 'rgba(20,10,16,1)';
      for (i = 2; i < 40; i += 3) {
        var px = pts[i][0], py = pts[i][1];
        g.fillRect(px - w * 0.002, py - h * 0.07, w * 0.004, h * 0.08);
        g.fillStyle = 'rgba(255,120,50,0.5)'; g.fillRect(px + w * 0.0012, py - h * 0.07, max(1, w * 0.0008), h * 0.07); g.fillStyle = '#0c060c';
      }
      g.lineWidth = max(1, w * 0.0008);
      for (var k = 0; k < 2; k++) { g.beginPath(); for (i = 2; i < 40; i += 3) { var yy = pts[i][1] - h * (0.03 + k * 0.03); if (i === 2) g.moveTo(pts[i][0], yy); else g.lineTo(pts[i][0], yy); } g.stroke(); }
    });
  }

  SH.reception_terrace = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.035), dark = !!p.dark, s = w / 1920;
    drawPlate(ctx, interiorPlate(w, h, dark ? 'dusk' : 'night'), w, h, c, 0.35);
    drawPlate(ctx, terracePlate(w, h, dark), w, h, c, 1);
    // lanterns
    ctx.save(); camApply(ctx, w, h, c, 1.15);
    var strings = [[-0.05, 0.08, 1.05, 0.12, 0.1], [-0.08, 0.2, 0.6, 0.02, 0.07]];
    for (var si = 0; si < strings.length; si++) {
      var S = strings[si], n = 9 - si * 2;
      ctx.strokeStyle = 'rgba(10,8,16,0.9)'; ctx.lineWidth = max(1, s * 1.5); ctx.beginPath();
      for (var k = 0; k <= 30; k++) { var u = k / 30, x = lerp(S[0], S[2], u) * w, y = (lerp(S[1], S[3], u) + S[4] * sin(u * PI)) * h; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      for (k = 0; k < n; k++) {
        var u2 = (k + 0.5) / n, lx = lerp(S[0], S[2], u2) * w, ly = (lerp(S[1], S[3], u2) + S[4] * sin(u2 * PI)) * h;
        var sway = sin(t * 0.8 + k * 1.3 + si) * 0.06, lr = w * (0.014 - si * 0.003), lh = lr * 1.25;
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(sway);
        ctx.fillStyle = '#1a1010'; ctx.fillRect(-1, 0, 2, lh * 0.6);
        var col = dark ? [255, 150, 60] : (k % 3 === 1 ? [255, 120, 80] : [255, 214, 150]);
        ctx.fillStyle = rgr(ctx, -lr * 0.3, lh * 1.4, lr * 0.1, lr * 1.3, [0, rgba(mixc(col, [255, 255, 240], 0.6)), 1, rgba(mixc(col, [120, 50, 30], 0.3))]);
        ctx.beginPath(); ctx.ellipse(0, lh * 1.6, lr, lh, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a1a14'; ctx.fillRect(-lr * 0.5, lh * 0.55, lr, lh * 0.12); ctx.fillRect(-lr * 0.5, lh * 2.55, lr, lh * 0.12);
        ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, lh * 1.6, lr * 7, col, 0.22); ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
      }
    }
    ctx.restore();
    // blurred crowd silhouettes
    drawPlate(ctx, crowdPlate(w, h, dark), w, h, { x: c.x + sin(t * 0.3) * 0.002, y: c.y, z: c.z }, 1.4);
  };
  function terracePlate(w, h, dark) {
    return plate('terrace' + (dark ? 'd' : ''), w, h, 1, function (g, w, h, m) {
      var x0 = -m * w, x1 = w * (1 + m), floorY = h * 0.72;
      // glass railing
      var railY = h * 0.56;
      g.fillStyle = rgba(dark ? [40, 30, 70] : [40, 50, 90], 0.22); g.fillRect(x0, railY, x1 - x0, floorY - railY);
      g.globalCompositeOperation = 'lighter';
      for (var i = 0; i < 14; i++) {
        var gx = x0 + i * w * 0.11;
        g.fillStyle = 'rgba(160,180,230,0.05)';
        g.beginPath(); g.moveTo(gx, floorY); g.lineTo(gx + w * 0.03, railY); g.lineTo(gx + w * 0.05, railY); g.lineTo(gx + w * 0.02, floorY); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      for (i = 0; i < 14; i++) { var px = x0 + i * w * 0.11; g.fillStyle = '#0d0c18'; g.fillRect(px, railY, w * 0.004, floorY - railY); }
      g.fillStyle = '#18131c'; g.fillRect(x0, railY - h * 0.012, x1 - x0, h * 0.014);
      g.fillStyle = dark ? 'rgba(255,160,70,0.7)' : 'rgba(230,190,110,0.85)'; g.fillRect(x0, railY - h * 0.012, x1 - x0, max(1, h * 0.003));
      // floor: dark polished stone, with lantern reflections
      g.fillStyle = lg(g, 0, floorY, 0, h * (1 + m), [0, dark ? '#1c1430' : '#141a30', 1, '#06060c']); g.fillRect(x0, floorY, x1 - x0, h * (1 + m) - floorY);
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
      for (i = -12; i <= 12; i++) { g.beginPath(); g.moveTo(w / 2 + i * w * 0.02, floorY); g.lineTo(w / 2 + i * w * 0.2, h * (1 + m)); g.stroke(); }
      for (i = 1; i < 8; i++) { var yy = floorY + (h * (1 + m) - floorY) * pow(i / 8, 1.8); g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, yy); g.stroke(); }
      g.globalCompositeOperation = 'lighter';
      for (i = 0; i < 9; i++) { var rx = (0.05 + i * 0.11) * w; g.fillStyle = lg(g, 0, floorY, 0, h, [0, rgba([255, 200, 130], 0.12), 1, rgba([255, 200, 130], 0)]); g.fillRect(rx - w * 0.006, floorY, w * 0.012, h * 0.3); }
      g.globalCompositeOperation = 'source-over';
      // a table with glasses at right
      var tx = w * 0.74, ty = h * 0.8;
      g.fillStyle = '#0a0810'; g.beginPath(); g.ellipse(tx, ty, w * 0.09, h * 0.022, 0, 0, TAU); g.fill(); g.fillRect(tx - w * 0.004, ty, w * 0.008, h * 0.2);
      g.strokeStyle = 'rgba(255,214,150,0.45)'; g.lineWidth = max(1, w * 0.001); g.beginPath(); g.ellipse(tx, ty, w * 0.09, h * 0.022, 0, PI * 1.05, PI * 1.95); g.stroke();
      for (i = 0; i < 3; i++) {
        var gx2 = tx - w * 0.04 + i * w * 0.03, gy = ty - h * 0.005;
        g.strokeStyle = 'rgba(200,210,240,0.6)'; g.beginPath(); g.moveTo(gx2, gy); g.lineTo(gx2, gy - h * 0.03); g.moveTo(gx2 - w * 0.006, gy - h * 0.03); g.lineTo(gx2 - w * 0.008, gy - h * 0.06); g.lineTo(gx2 + w * 0.008, gy - h * 0.06); g.lineTo(gx2 + w * 0.006, gy - h * 0.03); g.closePath(); g.stroke();
        g.fillStyle = 'rgba(255,200,120,0.35)'; g.fillRect(gx2 - w * 0.006, gy - h * 0.045, w * 0.012, h * 0.014);
      }
    });
  }
  function crowdPlate(w, h, dark) {
    return plate('crowd' + (dark ? 'd' : ''), w, h, 0.5, function (g, w, h) {
      g.filter = 'blur(' + Math.round(w * 0.004) + 'px)';
      var r = rng(12);
      for (var i = 0; i < 9; i++) {
        var left = i < 5, x = left ? w * (-0.06 + i * 0.07) : w * (0.84 + (i - 5) * 0.07), sc = (0.8 + r() * 0.5) * h, y = h * 0.62 + r() * h * 0.08;
        g.fillStyle = dark ? '#120c1e' : '#0b0d1a';
        g.beginPath(); g.ellipse(x, y, sc * 0.045, sc * 0.055, 0, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(x - sc * 0.13, h * 1.2); g.quadraticCurveTo(x - sc * 0.12, y + sc * 0.07, x, y + sc * 0.06); g.quadraticCurveTo(x + sc * 0.12, y + sc * 0.07, x + sc * 0.13, h * 1.2); g.fill();
        g.strokeStyle = dark ? 'rgba(255,150,60,0.35)' : 'rgba(255,200,140,0.3)'; g.lineWidth = w * 0.003;
        g.beginPath(); g.arc(x, y, sc * 0.05, -PI * 0.9, -PI * 0.3); g.stroke();
      }
      g.filter = 'none';
    });
  }

  // ------------------------------------------------------------------ haulers, freighter, dock
  // A Shelf ice hauler, pointing left. Local unit = length 1.
  function hauler(g, x, y, s, t, seed, eng) {
    var r = rng(seed);
    g.save(); g.translate(x, y); g.scale(s, s);
    var RU = [[60, 30, 26], [128, 62, 40], [190, 110, 64]], OC = [[78, 58, 30], [168, 122, 58], [222, 176, 96]], ICE = [[70, 110, 150], [140, 190, 220], [214, 240, 252]];
    var dz = 0.03; // top-face depth
    function box(x0, y0, wd, ht, pal) {
      g.fillStyle = rgba(pal[1]); g.fillRect(x0, y0, wd, ht);
      g.fillStyle = rgba(pal[2]); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + dz, y0 - dz); g.lineTo(x0 + wd + dz, y0 - dz); g.lineTo(x0 + wd, y0); g.fill();
      g.fillStyle = rgba(pal[0]); g.fillRect(x0, y0 + ht * 0.62, wd, ht * 0.38);
    }
    // spine truss
    g.fillStyle = rgba(RU[0]); g.fillRect(0.1, -0.012, 0.82, 0.024);
    g.strokeStyle = rgba(RU[1]); g.lineWidth = 0.004; g.beginPath();
    for (var i = 0; i < 20; i++) { var xx = 0.1 + i * 0.041; g.moveTo(xx, -0.012); g.lineTo(xx + 0.041, 0.012); }
    g.stroke();
    // ice blocks in pairs above & below
    for (i = 0; i < 6; i++) {
      var bx = 0.17 + i * 0.12, bw = 0.1 + r() * 0.015, bh = 0.06 + r() * 0.03;
      box(bx, -0.012 - bh, bw, bh, ICE);
      g.fillStyle = rgba(ICE[2], 0.6); g.beginPath(); g.moveTo(bx + bw * 0.2, -0.012 - bh * 0.9); g.lineTo(bx + bw * 0.45, -0.012 - bh * 0.3); g.lineTo(bx + bw * 0.3, -0.012 - bh * 0.3); g.fill();
      box(bx + 0.005, 0.012, bw * 0.9, bh * 0.75, ICE);
      g.strokeStyle = rgba(RU[0], 0.8); g.lineWidth = 0.003; g.beginPath(); g.moveTo(bx, -0.012 - bh); g.lineTo(bx + bw, -0.012); g.moveTo(bx + bw, -0.012 - bh); g.lineTo(bx, -0.012); g.stroke();
    }
    // cab
    box(0, -0.05, 0.11, 0.09, OC);
    g.fillStyle = rgba(RU[1]); g.fillRect(0.0, 0.0, 0.11, 0.012);
    for (i = 0; i < 4; i++) { g.fillStyle = 'rgba(255,214,140,' + (0.6 + 0.4 * h1(seed + i)) + ')'; g.fillRect(0.012 + i * 0.022, -0.036, 0.012, 0.008); }
    // engine block
    box(0.9, -0.04, 0.1, 0.08, RU);
    g.fillStyle = rgba(RU[0]); g.beginPath(); g.moveTo(1.0, -0.03); g.lineTo(1.04, -0.045); g.lineTo(1.04, 0.045); g.lineTo(1.0, 0.03); g.fill();
    // plume
    g.globalCompositeOperation = 'lighter';
    var fl = 0.85 + 0.15 * sin(t * 30 + seed);
    g.fillStyle = lg(g, 1.04, 0, 1.04 + 0.5 * eng, 0, [0, 'rgba(220,240,255,' + 0.85 * fl + ')', 0.2, 'rgba(120,180,255,0.45)', 1, 'rgba(60,80,255,0)']);
    g.beginPath(); g.moveTo(1.04, -0.035); g.lineTo(1.04 + 0.5 * eng, -0.01); g.lineTo(1.04 + 0.5 * eng, 0.01); g.lineTo(1.04, 0.035); g.fill();
    glow(g, 1.05, 0, 0.1, [170, 210, 255], 0.6 * fl);
    // nav light
    var bl = fract(t * 0.7 + h1(seed)) < 0.12 ? 1 : 0;
    if (bl) glow(g, 0.0, -0.05, 0.03, [255, 60, 40], 0.9);
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }

  SH.shelf_haulers = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.04);
    space(ctx, w, h, t, c, { sd: 0.15, top: [6, 8, 20], bot: [20, 16, 26], nebc: [[90, 60, 40], [40, 70, 100]] });
    ctx.save(); camApply(ctx, w, h, c, 0.25);
    orrin(ctx, w * 1.02, -h * 0.25, h * 0.72, t, { tilt: 0.42, sun: 2.0, phase: 1.0, light: 0.55, ringTilt: 0.3 });
    ctx.restore();
    // convoy, far to near; it drifts left
    var cv = [[0.12, 0.22, 0.09], [0.3, 0.33, 0.13], [0.5, 0.45, 0.2], [0.78, 0.6, 0.32], [0.62, 0.86, 0.55]];
    for (var i = 0; i < cv.length; i++) {
      var d = cv[i][2], x = w * cv[i][0] - t * w * 0.006 * d * 2, y = h * cv[i][1];
      ctx.save(); camApply(ctx, w, h, c, 0.4 + d);
      hauler(ctx, x - w * d * 0.4, y, w * d * 0.9, t, 11 + i * 7, 0.6 + 0.4 * d);
      ctx.restore();
    }
  };

  // The Kestrel Moth: boxy, worn, patched. Local unit ~ hull length 1, nose left.
  function kestrel(g, x, y, s, t, eng) {
    g.save(); g.translate(x, y); g.scale(s, s);
    var side = [[70, 64, 62], [126, 114, 100], [170, 156, 132]], top = [196, 184, 158], dz = [0.07, -0.06];
    function bx(x0, y0, wd, ht, col, tc, sc) {
      g.fillStyle = rgba(tc || top); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + dz[0], y0 + dz[1]); g.lineTo(x0 + wd + dz[0], y0 + dz[1]); g.lineTo(x0 + wd, y0); g.fill();
      g.fillStyle = rgba(sc || side[0]); g.beginPath(); g.moveTo(x0 + wd, y0); g.lineTo(x0 + wd + dz[0], y0 + dz[1]); g.lineTo(x0 + wd + dz[0], y0 + ht + dz[1]); g.lineTo(x0 + wd, y0 + ht); g.fill();
      g.fillStyle = rgba(col); g.fillRect(x0, y0, wd, ht);
      g.fillStyle = 'rgba(20,14,18,0.35)'; g.fillRect(x0, y0 + ht * 0.66, wd, ht * 0.34);
    }
    // engines (behind)
    bx(0.82, -0.02, 0.16, 0.07, side[1]); bx(0.8, 0.13, 0.18, 0.07, side[1]);
    // main hull
    bx(0.12, -0.08, 0.72, 0.3, side[1]);
    // patches
    var pc = [[150, 92, 60], [96, 104, 110], [160, 140, 100], [120, 70, 50]], r = rng(3);
    for (var i = 0; i < 9; i++) { g.fillStyle = rgba(pc[i % 4]); g.fillRect(0.15 + r() * 0.6, -0.06 + r() * 0.2, 0.04 + r() * 0.08, 0.03 + r() * 0.05); }
    // rust streaks
    for (i = 0; i < 12; i++) { var sx = 0.14 + r() * 0.68, sy = -0.05 + r() * 0.15; g.fillStyle = 'rgba(120,52,30,0.45)'; g.fillRect(sx, sy, 0.004, 0.04 + r() * 0.08); }
    // panel lines
    g.strokeStyle = 'rgba(30,24,26,0.6)'; g.lineWidth = 0.003; g.beginPath();
    for (i = 1; i < 7; i++) { g.moveTo(0.12 + i * 0.1, -0.08); g.lineTo(0.12 + i * 0.1, 0.22); }
    g.moveTo(0.12, 0.05); g.lineTo(0.84, 0.05); g.stroke();
    // cargo pods on top
    bx(0.3, -0.15, 0.14, 0.07, [150, 92, 60]); bx(0.48, -0.14, 0.12, 0.06, [96, 110, 120]);
    // cockpit block
    bx(0.0, -0.04, 0.16, 0.16, side[2]);
    g.fillStyle = 'rgba(255,200,120,0.95)'; for (i = 0; i < 3; i++) g.fillRect(0.015 + i * 0.045, -0.02, 0.035, 0.03);
    g.fillStyle = 'rgba(20,14,10,0.9)'; g.fillRect(0.015, 0.0, 0.125, 0.006);
    // name stencil
    g.fillStyle = 'rgba(230,220,200,0.75)'; g.font = 'bold 0.022px monospace'; g.fillText('KESTREL MOTH  KM-7', 0.2, 0.17);
    // antenna
    g.strokeStyle = rgba(side[2]); g.lineWidth = 0.004; g.beginPath(); g.moveTo(0.6, -0.14); g.lineTo(0.66, -0.26); g.stroke();
    g.globalCompositeOperation = 'lighter';
    var bl = fract(t * 0.8) < 0.15;
    if (bl) { glow(g, 0.66, -0.26, 0.03, [255, 60, 40], 1); }
    if (fract(t * 0.8 + 0.5) < 0.15) glow(g, 0.12, 0.22, 0.03, [80, 255, 120], 1);
    glow(g, 0.07, 0.0, 0.12, [255, 190, 110], 0.18);
    var fl = 0.85 + 0.15 * sin(t * 37);
    for (i = 0; i < 2; i++) {
      var ey = i ? 0.165 : 0.015;
      glow(g, 1.02, ey, 0.05 + 0.12 * eng, [150, 200, 255], (0.3 + 0.7 * eng) * fl);
      if (eng > 0.05) {
        g.fillStyle = lg(g, 1.0, ey, 1.0 + 0.6 * eng, ey, [0, 'rgba(220,240,255,0.8)', 1, 'rgba(80,120,255,0)']);
        g.beginPath(); g.moveTo(1.0, ey - 0.025); g.lineTo(1.0 + 0.6 * eng, ey - 0.006); g.lineTo(1.0 + 0.6 * eng, ey + 0.006); g.lineTo(1.0, ey + 0.025); g.fill();
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }
  function dockStructPlate(w, h) {
    return plate('dockstruct', w, h, 1, function (g, w, h, m) {
      var x0 = -m * w;
      // massive dock wall at left
      g.fillStyle = lg(g, x0, 0, w * 0.32, 0, [0, '#0c0e1c', 0.7, '#1c2036', 1, '#2c3250']); g.fillRect(x0, -m * h, w * 0.32 - x0, h * (1 + 2 * m));
      g.fillStyle = '#3c4466'; g.fillRect(w * 0.31, -m * h, w * 0.012, h * (1 + 2 * m));
      // girders
      g.strokeStyle = '#2a3048'; g.lineWidth = w * 0.006;
      for (var i = -2; i < 12; i++) { var y = i * h * 0.12; g.beginPath(); g.moveTo(x0, y); g.lineTo(w * 0.31, y + h * 0.06); g.stroke(); }
      // windows
      var r = rng(66);
      for (i = 0; i < 160; i++) { var wx = x0 + r() * (w * 0.3 - x0), wy = -m * h + r() * h * (1 + 2 * m); g.fillStyle = r() < 0.7 ? 'rgba(255,214,150,0.7)' : 'rgba(150,200,255,0.6)'; g.fillRect(wx, wy, w * 0.003, h * 0.003); }
      g.fillStyle = 'rgba(230,200,120,0.85)'; g.font = 'bold ' + Math.round(h * 0.05) + 'px monospace'; g.fillText('D-14', w * 0.18, h * 0.3);
      // docking arm
      g.fillStyle = '#262b42'; g.fillRect(w * 0.3, h * 0.47, w * 0.17, h * 0.05);
      g.fillStyle = '#4a5274'; g.fillRect(w * 0.3, h * 0.47, w * 0.17, h * 0.008);
      g.fillStyle = '#1a1e30'; g.fillRect(w * 0.3, h * 0.51, w * 0.17, h * 0.01);
    });
  }

  SH.kestrel_moth_exterior = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.035);
    space(ctx, w, h, t, c, { sd: 0.15 });
    ctx.save(); camApply(ctx, w, h, c, 0.25);
    orrin(ctx, w * 0.75, h * 1.55, h * 0.95, t, { tilt: -0.18, sun: -1.9, phase: 1.35, light: 0.45, dim: 0.15, ringTilt: 0.14 });
    ctx.restore();
    var dep = p.departing ? smooth(0.8, 12, t) : 0, eng = p.departing ? smooth(0.2, 2, t) : 0.05;
    // ship (behind the dock arm when docked)
    ctx.save(); camApply(ctx, w, h, c, 1);
    var sx = w * lerp(0.47, 0.82, dep), sy = h * lerp(0.42, 0.24, dep), ss = w * lerp(0.42, 0.06, pow(dep, 0.7));
    sx += sin(t * 0.5) * w * 0.001; sy += sin(t * 0.37) * h * 0.002;
    ctx.restore();
    drawPlate(ctx, dockStructPlate(w, h), w, h, c, 1);
    ctx.save(); camApply(ctx, w, h, c, 1);
    kestrel(ctx, sx, sy, ss, t, eng);
    // clamp arm retracting
    if (dep < 0.02) { ctx.fillStyle = '#30364f'; ctx.fillRect(w * 0.46, h * 0.475, w * 0.02, h * 0.04); }
    // dock floodlights
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, w * 0.31, h * 0.2, w * 0.1, [255, 220, 170], 0.3);
    glow(ctx, w * 0.31, h * 0.8, w * 0.08, [180, 210, 255], 0.25);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  };

  SH.dock_exterior = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.035), dark = !!p.dark, s = w / 1920;
    space(ctx, w, h, t, c, { sd: 0.15, top: dark ? [6, 4, 18] : [5, 7, 18] });
    ctx.save(); camApply(ctx, w, h, c, 0.25);
    orrin(ctx, w * 0.82, h * 0.3, h * 0.42, t, { tilt: -0.3, sun: -2.6, phase: 1.5, light: 0.4, dim: dark ? 0.5 : 0.1, ringTilt: 0.18 });
    ctx.restore();
    drawPlate(ctx, dockSpindlePlate(w, h, dark), w, h, c, 1);
    // running lights along the spindle (chase), berth lights, a ship on approach
    ctx.save(); camApply(ctx, w, h, c, 1); ctx.globalCompositeOperation = 'lighter';
    var A = [w * -0.05, h * 0.95], B = [w * 0.62, h * 0.38];
    for (var row = -1; row <= 1; row += 2) for (var i = 0; i < 26; i++) {
      var u = pow(i / 26, 0.75), x = lerp(A[0], B[0], u), y = lerp(A[1], B[1], u), wd = lerp(h * 0.16, h * 0.02, u);
      var ph = fract(t * 0.6 - i / 26) < 0.1 ? 1 : 0.35;
      var lc = dark ? [255, 150, 50] : (row < 0 ? [255, 220, 170] : [140, 200, 255]);
      glow(ctx, x - row * wd * 0.6 * 0.55, y - row * wd * 0.6, max(2, w * 0.006 * (1 - u * 0.7)), lc, ph * 0.9);
    }
    var au = fract(t * 0.025 + 0.3), ap = [lerp(w * 1.05, w * 0.6, au), lerp(h * 0.15, h * 0.33, au)];
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#6a6470'; ctx.fillRect(ap[0] - w * 0.008, ap[1] - h * 0.004, w * 0.016, h * 0.008);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, ap[0] + w * 0.012, ap[1], w * 0.012, [160, 200, 255], 0.8);
    if (fract(t) < 0.12) glow(ctx, ap[0] - w * 0.008, ap[1], w * 0.008, [255, 70, 50], 1);
    ctx.restore();
  };
  function dockSpindlePlate(w, h, dark) {
    return plate('spindle' + (dark ? 'd' : ''), w, h, 1, function (g, w, h, m) {
      var hull = dark ? [[22, 18, 44], [52, 46, 88], [96, 84, 136]] : [[30, 34, 60], [90, 96, 128], [200, 194, 182]];
      // Vesper's end cap: a vast wall curving out of frame at left
      g.fillStyle = rgr(g, -w * 0.6, h * 0.9, w * 0.2, w * 0.95, [0, rgba(hull[1]), 0.8, rgba(hull[0]), 1, rgba(hull[0])]);
      g.beginPath(); g.arc(-w * 0.6, h * 0.9, w * 0.9, 0, TAU); g.fill();
      g.strokeStyle = rgba(dark ? [110, 210, 210] : [255, 226, 176], 0.5); g.lineWidth = w * 0.002; g.beginPath(); g.arc(-w * 0.6, h * 0.9, w * 0.9, -1.1, 0.2); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = w * 0.0015;
      for (var i = 1; i < 6; i++) { g.beginPath(); g.arc(-w * 0.6, h * 0.9, w * 0.9 * i / 6, -1.2, 0.3); g.stroke(); }
      // the spindle: a long tapering cylinder
      var A = [w * -0.05, h * 0.95], B = [w * 0.62, h * 0.38], wa = h * 0.16, wb = h * 0.02;
      var dx = B[0] - A[0], dy = B[1] - A[1], L = sqrt(dx * dx + dy * dy), nx = -dy / L, ny = dx / L;
      var bands = [[-1, -0.35, hull[2]], [-0.35, 0.4, hull[1]], [0.4, 1, hull[0]]];
      for (i = 0; i < bands.length; i++) {
        var b = bands[i];
        g.beginPath(); g.moveTo(A[0] + nx * wa * b[0], A[1] + ny * wa * b[0]); g.lineTo(B[0] + nx * wb * b[0], B[1] + ny * wb * b[0]);
        g.lineTo(B[0] + nx * wb * b[1], B[1] + ny * wb * b[1]); g.lineTo(A[0] + nx * wa * b[1], A[1] + ny * wa * b[1]); g.closePath();
        g.fillStyle = rgba(b[2]); g.fill();
      }
      // rings and berths
      for (i = 0; i < 18; i++) {
        var u = pow(i / 18, 0.75), x = lerp(A[0], B[0], u), y = lerp(A[1], B[1], u), wd = lerp(wa, wb, u);
        g.strokeStyle = rgba(hull[0], 0.9); g.lineWidth = max(1, wd * 0.08);
        g.beginPath(); g.moveTo(x + nx * wd, y + ny * wd); g.lineTo(x - nx * wd, y - ny * wd); g.stroke();
        if (i % 3 === 1) { // berth arm with a tiny moored ship
          var side = (i % 2) ? 1 : -1, ax = x + nx * wd * side * 1.6, ay = y + ny * wd * side * 1.6;
          g.strokeStyle = rgba(hull[1]); g.lineWidth = max(1, wd * 0.12); g.beginPath(); g.moveTo(x + nx * wd * side, y + ny * wd * side); g.lineTo(ax, ay); g.stroke();
          g.fillStyle = rgba(dark ? [70, 60, 90] : [150, 120, 96]); g.fillRect(ax - wd * 0.5, ay - wd * 0.25, wd, wd * 0.5);
          g.fillStyle = 'rgba(255,210,150,0.8)'; g.fillRect(ax - wd * 0.4, ay - wd * 0.08, wd * 0.15, wd * 0.12);
        }
      }
      g.strokeStyle = rgba(dark ? [110, 210, 210] : [255, 226, 176], 0.6); g.lineWidth = max(1, w * 0.0015);
      g.beginPath(); g.moveTo(A[0] - nx * wa, A[1] - ny * wa); g.lineTo(B[0] - nx * wb, B[1] - ny * wb); g.stroke();
    });
  }

  // ------------------------------------------------------------------ halls
  function hallPlate(w, h, dark, empty) {
    return plate('hall' + (dark ? 'D' : '') + (empty ? 'E' : ''), w, h, 1, function (g, w, h, m) {
      var x0 = -m * w, y0 = -m * h, W = w * (1 + 2 * m), H = h * (1 + 2 * m), cx = w * 0.5, i, k;
      var P = dark ? { wall: [34, 28, 62], wallHi: [70, 56, 110], dome: [24, 20, 48], tierT: [64, 56, 104], tierR: [26, 22, 50], floor: [44, 40, 80], gold: [150, 120, 90], rim: [110, 214, 214] }
        : { wall: [52, 58, 96], wallHi: [210, 200, 178], dome: [36, 42, 78], tierT: [176, 168, 150], tierR: [62, 64, 96], floor: [190, 180, 156], gold: [226, 186, 100], rim: [255, 232, 186] };
      // dome interior
      g.fillStyle = lg(g, 0, y0, 0, h * 0.5, [0, rgba(mixc(P.dome, [0, 0, 0], 0.4)), 1, rgba(P.wall)]); g.fillRect(x0, y0, W, h * 0.6 - y0);
      // ribs converging to the oculus above frame
      var ox = cx, oy = -h * 0.55;
      for (i = -14; i <= 14; i++) {
        var bx = cx + i * w * 0.075;
        g.strokeStyle = rgba(mixc(P.dome, P.wallHi, 0.25), 0.8); g.lineWidth = w * 0.006 * (1 - abs(i) / 20);
        g.beginPath(); g.moveTo(ox + i * w * 0.004, oy); g.quadraticCurveTo(cx + i * w * 0.05, h * 0.0, bx, h * 0.3); g.stroke();
      }
      // coffer rings
      for (k = 0; k < 5; k++) {
        var ry = h * (0.02 + k * 0.07), rx = w * (0.25 + k * 0.17);
        g.strokeStyle = rgba(mixc(P.dome, P.gold, 0.25), 0.55); g.lineWidth = max(1, w * 0.002);
        g.beginPath(); g.ellipse(cx, oy + h * 0.2 + ry * 2.4, rx, ry * 2 + h * 0.15, 0, 0.12 * PI, 0.88 * PI); g.stroke();
      }
      // back wall: columns and banners along the far arc
      var wallTop = h * 0.13, wallBot = h * 0.4;
      g.fillStyle = rgba(P.wall); g.fillRect(x0, wallTop, W, wallBot - wallTop + h * 0.02);
      for (i = 0; i < 17; i++) {
        var u = i / 16, ang = lerp(-1.25, 1.25, u), x = cx + sin(ang) * w * 0.62, sc = 0.75 + 0.25 * cos(ang);
        var colTop = wallTop - h * 0.06 * sc, colW = w * 0.016 * sc;
        g.fillStyle = rgba(mixc(P.wall, P.wallHi, 0.35)); g.fillRect(x - colW / 2, colTop, colW, wallBot - colTop);
        g.fillStyle = rgba(P.wallHi, 0.7); g.fillRect(x - colW / 2, colTop, colW * 0.3, wallBot - colTop);
        if (i < 16) {
          var nx = cx + sin(lerp(-1.25, 1.25, (i + 0.5) / 16)) * w * 0.62, left = nx < cx, bw = w * 0.024 * sc, bt = colTop + h * 0.02, bb = wallBot - h * 0.03;
          var bc = left ? (dark ? [26, 30, 70] : [26, 36, 92]) : (dark ? [80, 34, 30] : [150, 62, 36]);
          var em = left ? P.gold : (dark ? [140, 100, 60] : [222, 168, 80]);
          g.fillStyle = rgba(bc); g.beginPath(); g.moveTo(nx - bw, bt); g.lineTo(nx + bw, bt); g.lineTo(nx + bw, bb); g.lineTo(nx, bb - h * 0.02); g.lineTo(nx - bw, bb); g.fill();
          g.fillStyle = rgba(mixc(bc, [0, 0, 0], 0.35)); g.fillRect(nx + bw * 0.4, bt, bw * 0.6, bb - bt - h * 0.01);
          g.strokeStyle = rgba(em, 0.9); g.fillStyle = rgba(em, 0.9); g.lineWidth = max(1, w * 0.0012);
          var ey = bt + (bb - bt) * 0.35;
          if (left) { g.beginPath(); g.arc(nx, ey, bw * 0.55, 0, TAU); g.stroke(); for (k = 0; k < 8; k++) { var aa = k / 8 * TAU; g.beginPath(); g.moveTo(nx + cos(aa) * bw * 0.6, ey + sin(aa) * bw * 0.6); g.lineTo(nx + cos(aa) * bw * 0.9, ey + sin(aa) * bw * 0.9); g.stroke(); } }
          else { g.beginPath(); g.moveTo(nx, ey - bw * 0.8); g.lineTo(nx + bw * 0.55, ey); g.lineTo(nx, ey + bw * 0.8); g.lineTo(nx - bw * 0.55, ey); g.closePath(); g.stroke(); g.fillRect(nx - bw * 0.6, ey - 0.5, bw * 1.2, max(1, w * 0.001)); }
          g.fillStyle = rgba(em, 0.8); g.fillRect(nx - bw, bt, bw * 2, max(1, h * 0.004));
        }
      }
      // tiers: far half of a bowl, outer (higher, further) first
      var fcy = h * 0.78, NT = 8;
      function ell(k) { return { rx: w * (0.17 + k * 0.062), ry: h * (0.05 + k * 0.022), cy: fcy - k * h * 0.028 }; }
      var r = rng(21);
      for (k = NT; k >= 0; k--) {
        var E = ell(k), E2 = ell(k + 1);
        // tread
        g.beginPath(); g.ellipse(cx, E2.cy, E2.rx, E2.ry, 0, PI, TAU); g.lineTo(cx + E2.rx, h * 1.2); g.lineTo(cx - E2.rx, h * 1.2); g.closePath();
        g.fillStyle = rgba(mixc(P.tierT, P.tierR, k / NT * 0.4)); g.fill();
        // riser
        g.beginPath(); g.ellipse(cx, E.cy - h * 0.012, E.rx, E.ry, 0, PI, TAU); g.lineTo(cx + E.rx, h * 1.2); g.lineTo(cx - E.rx, h * 1.2); g.closePath();
        g.fillStyle = rgba(P.tierR); g.fill();
        g.beginPath(); g.ellipse(cx, E.cy - h * 0.012, E.rx, E.ry, 0, PI, TAU); g.strokeStyle = rgba(P.gold, dark ? 0.35 : 0.7); g.lineWidth = max(1, w * 0.0012); g.stroke();
        // desks and delegates
        if (k < NT && k > 0) {
          var nD = 14 + k * 3;
          for (i = 0; i < nD; i++) {
            var a = PI + (i + 0.5) / nD * PI, dx = cx + cos(a) * E.rx * 1.03, dy = E.cy - h * 0.012 + sin(a) * E.ry * 1.03;
            var ds = h * (0.012 + k * 0.0012);
            if (!empty && r() < 0.8) {
              var shelf = dx > cx;
              var body = dark ? [16, 12, 30] : (shelf ? [96, 44, 30] : [22, 26, 54]);
              g.fillStyle = rgba(body); g.beginPath(); g.ellipse(dx, dy - ds * 1.9, ds * 0.42, ds * 0.5, 0, 0, TAU); g.fill();
              g.beginPath(); g.moveTo(dx - ds * 0.8, dy); g.quadraticCurveTo(dx - ds * 0.7, dy - ds * 1.4, dx, dy - ds * 1.4); g.quadraticCurveTo(dx + ds * 0.7, dy - ds * 1.4, dx + ds * 0.8, dy); g.fill();
              if (shelf && !dark) { g.fillStyle = 'rgba(230,220,200,0.8)'; g.fillRect(dx - ds * 0.45, dy - ds * 1.45, ds * 0.9, ds * 0.18); }
              g.fillStyle = rgba(P.rim, 0.6); g.fillRect(dx - ds * 0.4, dy - ds * 2.35, ds * 0.5, max(1, ds * 0.12));
            } else r();
            g.fillStyle = rgba(mixc(P.tierR, [0, 0, 0], 0.3)); g.fillRect(dx - ds * 0.9, dy - ds * 0.6, ds * 1.8, ds * 0.6);
            g.fillStyle = rgba(dark ? [255, 150, 60] : [255, 220, 150], 0.9); g.fillRect(dx - ds * 0.15, dy - ds * 0.62, ds * 0.3, max(1, ds * 0.12));
          }
        }
      }
      // near half of the bowl: treads curving toward us (inner to outer)
      for (k = 0; k <= NT; k++) {
        var En = ell(k);
        g.beginPath(); g.ellipse(cx, En.cy + h * 0.004 * k, En.rx, En.ry + k * h * 0.02, 0, 0, PI); g.lineTo(cx - En.rx, h * 1.3); g.lineTo(cx + En.rx, h * 1.3); g.closePath();
        g.fillStyle = rgba(k === 0 ? P.floor : mixc(P.tierT, P.tierR, 0.15 + (k % 2) * 0.12)); g.fill();
        if (k > 0) { g.beginPath(); g.ellipse(cx, En.cy + h * 0.004 * k, En.rx, En.ry + k * h * 0.02, 0, 0.02, PI - 0.02); g.strokeStyle = rgba(P.gold, dark ? 0.3 : 0.6); g.lineWidth = max(1, w * 0.0012); g.stroke(); }
      }
      // floor and the round treaty table
      
      g.strokeStyle = rgba(P.gold, 0.6); g.lineWidth = max(1, w * 0.0015);
      for (k = 1; k < 4; k++) { g.beginPath(); g.ellipse(cx, fcy, w * 0.17 * k / 4, h * 0.05 * k / 4, 0, 0, TAU); g.stroke(); }
      g.fillStyle = rgba(dark ? [30, 26, 56] : [70, 50, 40]); g.beginPath(); g.ellipse(cx, fcy - h * 0.01, w * 0.08, h * 0.022, 0, 0, TAU); g.fill();
      g.fillStyle = rgba(dark ? [60, 54, 96] : [230, 220, 196]); g.beginPath(); g.ellipse(cx, fcy - h * 0.014, w * 0.08, h * 0.022, 0, 0, TAU); g.fill();
      g.fillStyle = rgba(mixc(P.floor, [0, 0, 0], 0.5)); g.beginPath(); g.ellipse(cx, fcy - h * 0.014, w * 0.06, h * 0.015, 0, 0, TAU); g.fill();
      // foreground: our own dark gallery rail
      g.fillStyle = dark ? '#0c0a18' : '#0e1022';
      g.beginPath(); g.moveTo(x0, h * (1 + m)); g.lineTo(x0, h * 0.93); g.quadraticCurveTo(cx, h * 0.86, w * (1 + m), h * 0.93); g.lineTo(w * (1 + m), h * (1 + m)); g.fill();
      g.strokeStyle = rgba(P.gold, dark ? 0.4 : 0.75); g.lineWidth = max(1, w * 0.002);
      g.beginPath(); g.moveTo(x0, h * 0.93); g.quadraticCurveTo(cx, h * 0.86, w * (1 + m), h * 0.93); g.stroke();
      if (dark) {
        g.fillStyle = 'rgba(20,90,100,0.12)'; g.fillRect(x0, y0, W, H);
      }
    });
  }

  SH.treaty_hall_wide = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.035), dark = !!p.dark, empty = !!p.empty;
    drawPlate(ctx, hallPlate(w, h, dark, empty), w, h, c, 1);
    ctx.save(); camApply(ctx, w, h, c, 1); ctx.globalCompositeOperation = 'lighter';
    var cx = w * 0.5, fcy = h * 0.78;
    if (!dark) {
      // shafts from the oculus with dust
      for (var i = 0; i < 3; i++) {
        var sx = cx + (i - 1) * w * 0.05, a = 0.06 + 0.02 * sin(t * 0.3 + i);
        ctx.beginPath(); ctx.moveTo(sx - w * 0.03, -h * 0.1); ctx.lineTo(sx + w * 0.03, -h * 0.1); ctx.lineTo(cx + (i - 1) * w * 0.07 + w * 0.06, fcy); ctx.lineTo(cx + (i - 1) * w * 0.07 - w * 0.06, fcy); ctx.closePath();
        ctx.fillStyle = lg(ctx, 0, 0, 0, fcy, [0, rgba([255, 236, 200], a * 1.6), 1, rgba([255, 220, 170], a * 0.4)]); ctx.fill();
      }
      for (i = 0; i < 40; i++) {
        var u = fract(h1(i) + t * 0.01 * (0.5 + h1(i + 9))), dx = cx + (h1(i * 3) - 0.5) * w * 0.2 + sin(t * 0.2 + i) * w * 0.01;
        ctx.fillStyle = rgba([255, 240, 210], 0.5 * sin(u * PI)); ctx.fillRect(dx, lerp(0, fcy, u), 1.5, 1.5);
      }
      glow(ctx, cx, fcy - h * 0.02, w * 0.18, [255, 220, 170], 0.18);
    } else {
      // amber emergency strips along the tier lips, slow pulse
      for (var k = 1; k < 8; k++) {
        var rx = w * (0.17 + k * 0.062), ry = h * (0.05 + k * 0.022), ccy = fcy - k * h * 0.028 - h * 0.012, ph = 0.55 + 0.45 * sin(t * 1.4 - k * 0.6);
        ctx.strokeStyle = rgba([255, 150, 50], 0.55 * ph); ctx.lineWidth = max(1, h * 0.003);
        ctx.setLineDash([w * 0.01, w * 0.008]); ctx.beginPath(); ctx.ellipse(cx, ccy, rx, ry, 0, PI * 1.02, PI * 1.98); ctx.stroke();
      }
      ctx.setLineDash([]);
      glow(ctx, cx, fcy, w * 0.25, [110, 80, 200], 0.15);
    }
    ctx.restore();
  };

  function councilPlate(w, h) {
    return plate('council', w, h, 1, function (g, w, h, m) {
      var x0 = -m * w, y0 = -m * h, W = w * (1 + 2 * m), H = h * (1 + 2 * m), cx = w / 2;
      g.fillStyle = lg(g, 0, y0, 0, h, [0, '#12060c', 0.5, '#2a0a12', 1, '#0a0408']); g.fillRect(x0, y0, W, H);
      // big wall screen with a red map of the cylinder
      var sx = cx - w * 0.22, sy = h * 0.06, sw = w * 0.44, sh = h * 0.26;
      g.fillStyle = '#3a0c12'; g.fillRect(sx, sy, sw, sh);
      g.strokeStyle = 'rgba(255,90,70,0.65)'; g.lineWidth = max(1, w * 0.0012);
      g.strokeRect(sx + sw * 0.08, sy + sh * 0.3, sw * 0.6, sh * 0.4);
      for (var i = 1; i < 12; i++) { g.beginPath(); g.moveTo(sx + sw * (0.08 + i * 0.05), sy + sh * 0.3); g.lineTo(sx + sw * (0.08 + i * 0.05), sy + sh * 0.7); g.stroke(); }
      g.beginPath(); g.ellipse(sx + sw * 0.68, sy + sh * 0.5, sw * 0.03, sh * 0.2, 0, 0, TAU); g.stroke();
      for (i = 0; i < 12; i++) { var a = i / 12 * TAU; g.beginPath(); g.moveTo(sx + sw * 0.68 + cos(a) * sw * 0.03, sy + sh * 0.5 + sin(a) * sh * 0.2); g.lineTo(sx + sw * 0.68 + cos(a) * sw * 0.12, sy + sh * 0.5 + sin(a) * sh * 0.45); g.stroke(); }
      g.fillStyle = 'rgba(255,120,90,0.8)'; g.font = 'bold ' + Math.round(h * 0.022) + 'px monospace';
      g.fillText('MIRROR AUTHORITY · STATE OF EMERGENCY', sx + sw * 0.06, sy + sh * 0.16);
      g.fillText('ARRAY: LOCKED   SECTOR 4: SEALED', sx + sw * 0.06, sy + sh * 0.9);
      g.strokeStyle = '#5a1a20'; g.lineWidth = w * 0.006; g.strokeRect(sx, sy, sw, sh);
      // tiers seen from the floor: concave-up arcs, rows of silhouettes
      var r = rng(8);
      for (var k = 0; k < 6; k++) {
        var yb = h * (0.42 + k * 0.1), sag = h * (0.06 + k * 0.03), rowH = h * 0.1;
        g.beginPath(); g.moveTo(x0, yb - sag * 0.2); g.quadraticCurveTo(cx, yb + sag, w * (1 + m), yb - sag * 0.2); g.lineTo(w * (1 + m), h * (1 + m)); g.lineTo(x0, h * (1 + m)); g.closePath();
        g.fillStyle = rgba(mixc([70, 16, 24], [16, 4, 8], k / 6)); g.fill();
        g.beginPath(); g.moveTo(x0, yb - sag * 0.2); g.quadraticCurveTo(cx, yb + sag, w * (1 + m), yb - sag * 0.2);
        g.strokeStyle = 'rgba(255,70,50,0.55)'; g.lineWidth = max(1, h * 0.003); g.stroke();
        // silhouettes on the tier above this lip
        var n = 16 + k * 2, sz = h * (0.03 + k * 0.012);
        for (i = 0; i < n; i++) {
          if (r() < 0.25) continue;
          var u = (i + 0.5 + (r() - 0.5) * 0.3) / n, x = lerp(x0, w * (1 + m), u);
          var tq = 1 - pow(2 * u - 1, 2), y = yb - sag * 0.2 + (sag * 1.2) * tq * 0.5 * 2 - sag * 0.6 * 0;
          y = (1 - u) * (1 - u) * (yb - sag * 0.2) + 2 * u * (1 - u) * (yb + sag) + u * u * (yb - sag * 0.2);
          g.fillStyle = rgba([10, 2, 6]);
          g.beginPath(); g.ellipse(x, y - sz * 1.15, sz * 0.32, sz * 0.38, 0, 0, TAU); g.fill();
          g.beginPath(); g.moveTo(x - sz * 0.7, y + rowH * 0.2); g.quadraticCurveTo(x - sz * 0.6, y - sz * 0.75, x, y - sz * 0.75); g.quadraticCurveTo(x + sz * 0.6, y - sz * 0.75, x + sz * 0.7, y + rowH * 0.2); g.fill();
          g.strokeStyle = 'rgba(255,60,40,0.7)'; g.lineWidth = max(1, sz * 0.06);
          g.beginPath(); g.arc(x, y - sz * 1.15, sz * 0.35, PI * 1.1, PI * 1.7); g.stroke();
        }
      }
    });
  }
  SH.council_chamber_emergency = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.035);
    drawPlate(ctx, councilPlate(w, h), w, h, c, 1);
    ctx.save(); camApply(ctx, w, h, c, 1); ctx.globalCompositeOperation = 'lighter';
    var pulse = 0.5 + 0.5 * sin(t * 2.1);
    glow(ctx, w * 0.5, h * 0.19, w * 0.4, [255, 40, 30], 0.18 + 0.06 * vn(t * 8));
    // rotating beacons left and right
    for (var i = 0; i < 2; i++) {
      var bx = i ? w * 0.92 : w * 0.08, by = h * 0.08, a = t * 3 + i * PI, k = pow(max(0, cos(a)), 4);
      glow(ctx, bx, by, w * 0.03, [255, 60, 40], 0.9);
      streak(ctx, bx, by, w * 0.5 * k + 1, h * 0.05, [255, 50, 30], 0.35 * k);
    }
    ctx.fillStyle = rgba([255, 20, 20], 0.06 * pulse); ctx.fillRect(-w, -h, 3 * w, 3 * h);
    ctx.restore();
  };

  // ------------------------------------------------------------------ garden
  function gardenPlate(w, h, dark, wilted) {
    return plate('garden' + (dark ? 'D' : '') + (wilted ? 'W' : ''), w, h, 1, function (g, w, h, m) {
      var x0 = -m * w, y0 = -m * h, W = w * (1 + 2 * m), H = h * (1 + 2 * m), f = w * 0.55, vx = w * 0.5, vy = h * 0.44;
      function P(X, Y, Z) { return [vx + f * X / Z, vy - f * Y / Z, f / Z]; }
      var lampC = dark ? [255, 130, 70] : [255, 160, 230], amb = dark ? [22, 16, 40] : [34, 18, 44];
      // ceiling glass and floor
      g.fillStyle = lg(g, 0, y0, 0, vy, [0, rgba(mixc(amb, [0, 0, 0], 0.4)), 1, rgba(mixc(amb, lampC, dark ? 0.05 : 0.15))]); g.fillRect(x0, y0, W, vy - y0);
      g.fillStyle = lg(g, 0, vy, 0, h * (1 + m), [0, rgba(mixc(amb, lampC, dark ? 0.04 : 0.12)), 1, rgba(mixc(amb, [0, 0, 0], 0.5))]); g.fillRect(x0, vy, W, h * (1 + m) - vy);
      g.strokeStyle = rgba(mixc(amb, lampC, 0.2), 0.5); g.lineWidth = max(1, w * 0.001);
      for (var i = -10; i <= 10; i++) { var a = P(i * 0.9, 2.2, 1), b = P(i * 0.9, 2.2, 40); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      for (i = 1; i < 30; i++) { var z = 1 + i * i * 0.05, l = P(-9, 2.2, z), rr = P(9, 2.2, z); g.beginPath(); g.moveTo(l[0], l[1]); g.lineTo(rr[0], rr[1]); g.stroke(); }
      // far wall glow
      g.globalCompositeOperation = 'lighter'; glow(g, vx, vy, w * 0.25, lampC, dark ? 0.08 : 0.25); g.globalCompositeOperation = 'source-over';
      // rows (trellis walls) — far to near
      var rows = [-3.4, -1.25, 1.25, 3.4], r = rng(wilted ? 91 : 90);
      var leafC = wilted ? [[60, 52, 30], [96, 84, 44], [130, 110, 60]] : [[18, 50, 40], [36, 92, 62], [70, 140, 90]];
      if (dark) leafC = leafC.map(function (c) { return mixc(c, [40, 30, 70], 0.45); });
      var leaves = [];
      for (var ri = 0; ri < rows.length; ri++) {
        for (var zi = 0; zi < 70; zi++) {
          var Z = 1.2 + zi * 0.45;
          for (var k = 0; k < 16; k++) { var yy0 = -0.85 + r() * 1.95; leaves.push([rows[ri] + (r() - 0.5) * 0.35 - (rows[ri] > 0 ? 0.2 : -0.2), yy0 - (wilted ? 0.3 * r() : 0), Z + r() * 0.45, r(), r(), r()]); }
        }
      }
      leaves.sort(function (a, b) { return b[2] - a[2]; });
      // floor lines of the beds
      for (ri = 0; ri < rows.length; ri++) {
        var A = P(rows[ri] - 0.35, -1, 1.2), B = P(rows[ri] - 0.35, -1, 34), C = P(rows[ri] + 0.35, -1, 34), D = P(rows[ri] + 0.35, -1, 1.2);
        poly(g, [A, B, C, D]); g.fillStyle = rgba(mixc(amb, [0, 0, 0], 0.4)); g.fill();
        // trellis posts
        for (zi = 0; zi < 34; zi += 2) { var p1 = P(rows[ri], -1, 1.2 + zi), p2 = P(rows[ri], 1.0, 1.2 + zi); g.strokeStyle = rgba(mixc(amb, [120, 110, 120], 0.3)); g.lineWidth = max(1, p1[2] * 0.02); g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.stroke(); }
      }
      // dark hedge masses behind the leaves
      for (ri = 0; ri < rows.length; ri++) {
        var xs = rows[ri] - (rows[ri] > 0 ? 0.2 : -0.2), hb = [];
        for (zi = 0; zi <= 30; zi++) { var zz = 1.2 + zi * 1.1, top0 = (wilted ? 0.55 : 1.05) + 0.12 * sin(zi * 1.7 + ri); hb.push(P(xs, top0, zz)); }
        for (zi = 30; zi >= 0; zi--) hb.push(P(xs, -1, 1.2 + zi * 1.1));
        poly(g, hb); g.fillStyle = rgba(mixc(leafC[0], [0, 0, 0], 0.45)); g.fill();
      }
      for (i = 0; i < leaves.length; i++) {
        var L = leaves[i], q = P(L[0], L[1], L[2]), s = q[2] * 0.16 * (0.6 + L[3] * 0.6), fog = 1 - exp(-L[2] * 0.06);
        var tone = L[4] < 0.35 ? 0 : (L[4] < 0.8 ? 1 : 2), col = mixc(leafC[tone], amb, fog * 0.8);
        var ang = (L[5] - 0.5) * 2 + (wilted ? 1.3 : 0);
        g.fillStyle = rgba(col);
        g.save(); g.translate(q[0], q[1]); g.rotate(ang);
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.5, -s * 0.35, s, 0); g.quadraticCurveTo(s * 0.5, s * 0.35, 0, 0); g.fill();
        if (tone === 2 && !wilted) { g.strokeStyle = rgba(lampC, 0.35 * (1 - fog)); g.lineWidth = max(0.5, s * 0.06); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.5, -s * 0.35, s, 0); g.stroke(); }
        g.restore();
        // tomatoes
        var tp = wilted ? 0.012 : 0.05;
        if (L[3] < tp && L[1] < 0.6) {
          var tr = s * 0.32, tc = wilted ? [110, 36, 26] : [214, 40, 36];
          g.fillStyle = rgba(mixc(tc, amb, fog * 0.7)); g.beginPath(); g.arc(q[0] + s * 0.3, q[1] + s * 0.3, tr, 0, TAU); g.fill();
          g.fillStyle = rgba([255, 220, 240], 0.6 * (1 - fog) * (wilted ? 0.3 : 1)); g.beginPath(); g.arc(q[0] + s * 0.3 - tr * 0.35, q[1] + s * 0.3 - tr * 0.35, tr * 0.22, 0, TAU); g.fill();
        }
      }
      // lamp bars above each row
      g.globalCompositeOperation = 'lighter';
      for (ri = 0; ri < rows.length; ri++) {
        for (zi = 0; zi < 15; zi++) {
          var z0 = 1.3 + zi * 2.2, on = dark ? (zi % 3 === 0) : true;
          if (!on) continue;
          var a1 = P(rows[ri], 1.5, z0), a2 = P(rows[ri], 1.5, z0 + 1.6), it = dark ? 0.35 : 1;
          g.strokeStyle = rgba(mixc(lampC, [255, 255, 255], 0.6), 0.9 * it); g.lineWidth = max(1, a1[2] * 0.04);
          g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); g.stroke();
          var mx = (a1[0] + a2[0]) / 2, my = (a1[1] + a2[1]) / 2;
          glow(g, mx, my, a1[2] * 0.9, lampC, 0.22 * it);
          // pool on the floor
          var fl = P(rows[ri], -1, z0 + 0.8);
          g.save(); g.translate(fl[0], fl[1]); g.scale(1, 0.25); glow(g, 0, 0, fl[2] * 1.3, lampC, 0.12 * it); g.restore();
        }
      }
      g.globalCompositeOperation = 'source-over';
      // near foreground vines, out of focus at frame edges
      g.filter = 'blur(' + Math.round(w * 0.004) + 'px)';
      for (i = 0; i < 26; i++) {
        var side = i % 2 ? 1 : -1, fx = w * (side > 0 ? 0.97 + r() * 0.1 : 0.03 - r() * 0.1), fy = h * (r() * 1.1), fs = w * (0.06 + r() * 0.05);
        g.fillStyle = rgba(mixc(leafC[0], [0, 0, 0], 0.4));
        g.save(); g.translate(fx, fy); g.rotate(r() * TAU); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(fs * 0.5, -fs * 0.35, fs, 0); g.quadraticCurveTo(fs * 0.5, fs * 0.35, 0, 0); g.fill(); g.restore();
      }
      g.filter = 'none';
    });
  }
  SH.severin_garden = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.035), dark = !!p.dark, wilted = !!p.wilted;
    drawPlate(ctx, gardenPlate(w, h, dark, wilted), w, h, c, 1);
    ctx.save(); camApply(ctx, w, h, c, 1);
    // drifting pollen / motes in the lamp light
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 50; i++) {
      var x = (h1(i) * 1.2 - 0.1) * w + sin(t * 0.3 + i) * w * 0.01, y = fract(h1(i + 50) - t * 0.008 * (0.5 + h1(i + 7))) * h;
      ctx.fillStyle = rgba(dark ? [255, 170, 100] : [255, 200, 240], 0.35 * (0.5 + 0.5 * sin(t + i))); ctx.fillRect(x, y, 2, 2);
    }
    if (dark) {
      // failing emergency power: lamps stutter
      var fl = vn(t * 3) > 0.8 ? 0.06 : 0;
      ctx.fillStyle = rgba([255, 130, 60], fl); ctx.fillRect(-w, -h, 3 * w, 3 * h);
    }
    ctx.restore();
  };

  // ------------------------------------------------------------------ tunnels
  // Generic ribbed tunnel. o: sec (cross-section pts), types (per edge), curve, len, step, cols(type, fog), rib, lights
  function tunnelAt(w, h, o) {
    var f = w * (o.fov || 0.6), cx = w / 2, cy = h * (o.cy || 0.5), R = o.curve ? 1 / o.curve : 0;
    return function (sv, x, y) {
      var px, pz, ax, az;
      if (R) { var a = sv / R; px = R * (1 - cos(a)); pz = R * sin(a); ax = cos(a); az = -sin(a); } else { px = 0; pz = sv; ax = 1; az = 0; }
      var X = px + ax * x, Z = pz + az * x + (o.z0 || 0.3), Y = y;
      return [cx + f * X / max(0.05, Z), cy - f * Y / max(0.05, Z), Z];
    };
  }
  function tunnelPaint(g, w, h, o) {
    var f = w * (o.fov || 0.6), at = tunnelAt(w, h, o);
    var sec = o.sec, n = sec.length, N = Math.round(o.len / o.step), i, j;
    var rings = [];
    for (i = 0; i <= N; i++) { var rr = []; for (j = 0; j < n; j++) rr.push(at(i * o.step, sec[j][0], sec[j][1])); rings.push(rr); }
    for (i = N - 1; i >= 0; i--) {
      var fog = 1 - exp(-i * o.step * (o.fog || 0.08));
      for (j = 0; j < n; j++) {
        var A = rings[i][j], B = rings[i][(j + 1) % n], C = rings[i + 1][(j + 1) % n], D = rings[i + 1][j];
        if (A[2] < 0.06 || D[2] < 0.06) continue;
        var col = mixc(o.cols(o.types[j], i), o.fogC, fog);
        poly(g, [A, B, C, D]); g.fillStyle = rgba(col); g.fill(); g.strokeStyle = rgba(col); g.lineWidth = 1; g.stroke();
      }
      if (o.extra) o.extra(g, i, rings, fog, at);
      if (i % (o.ribEvery || 1) === 0) {
        var rg0 = rings[i]; if (rg0[0][2] < 0.06) continue;
        g.beginPath(); for (j = 0; j < n; j++) { if (j) g.lineTo(rg0[j][0], rg0[j][1]); else g.moveTo(rg0[j][0], rg0[j][1]); } g.closePath();
        g.strokeStyle = rgba(mixc(o.ribC, o.fogC, fog)); g.lineWidth = f * (o.ribW || 0.12) / rg0[0][2]; g.lineJoin = 'round'; g.stroke();
        if (o.ribEdge) { g.strokeStyle = rgba(mixc(o.ribEdge, o.fogC, fog), 0.8); g.lineWidth = max(1, f * 0.015 / rg0[0][2]); g.stroke(); }
        if (o.ribLight) o.ribLight(g, i, rg0, fog);
      }
    }
    return at;
  }
  var COR_SEC = [[-1.25, -1.1], [1.25, -1.1], [1.25, 0.8], [0.8, 1.5], [-0.8, 1.5], [-1.25, 0.8]];
  function corridorPlate(w, h, dark) {
    return plate('corridor' + (dark ? 'D' : ''), w, h, 1, function (g, w, h, m) {
      g.fillStyle = dark ? '#120e22' : '#2a2e48'; g.fillRect(-m * w, -m * h, w * (1 + 2 * m), h * (1 + 2 * m));
      var C = dark ? { 0: [26, 22, 46], 1: [58, 52, 94], 2: [44, 40, 80], 3: [40, 36, 72], 4: [44, 40, 80], 5: [52, 46, 88] }
        : { 0: [44, 48, 78], 1: [112, 112, 126], 2: [150, 146, 140], 3: [70, 72, 98], 4: [150, 146, 140], 5: [92, 92, 110] };
      tunnelPaint(g, w, h, {
        sec: COR_SEC, types: [0, 1, 2, 3, 4, 5], curve: 0.1, len: 34, step: 1.1, fog: 0.09, fogC: dark ? [30, 26, 58] : [34, 38, 66],
        cols: function (tp, i) { var c = C[tp]; return i % 2 ? c : mixc(c, [0, 0, 0], 0.06); },
        ribC: dark ? [16, 14, 32] : [30, 34, 62], ribW: 0.1, ribEdge: dark ? [70, 60, 110] : [210, 176, 100],
        ribLight: function (g, i, rg, fog) {
          if (dark) return;
          g.globalCompositeOperation = 'lighter';
          var a = rg[2], b = rg[3], c2 = rg[4], d = rg[5];
          g.strokeStyle = rgba([255, 244, 220], 0.75 * (1 - fog * 0.7)); g.lineWidth = max(1, w * 0.6 * 0.035 / a[2]);
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.moveTo(c2[0], c2[1]); g.lineTo(d[0], d[1]); g.stroke();
          glow(g, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, w * 0.25 / a[2], [255, 230, 190], 0.2 * (1 - fog));
          glow(g, (c2[0] + d[0]) / 2, (c2[1] + d[1]) / 2, w * 0.25 / a[2], [255, 230, 190], 0.2 * (1 - fog));
          // floor reflections
          var f0 = rg[0], f1 = rg[1];
          g.fillStyle = rgba([255, 230, 190], 0.1 * (1 - fog)); g.fillRect(lerp(f0[0], f1[0], 0.15), f0[1] - w * 0.03 / a[2], (f1[0] - f0[0]) * 0.7, w * 0.03 / a[2]);
          g.globalCompositeOperation = 'source-over';
        }
      });
    });
  }
  SH.corridor = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.035), dark = !!p.dark;
    drawPlate(ctx, corridorPlate(w, h, dark), w, h, c, 1);
    if (dark) {
      // amber emergency strips at the floor edges, chasing slowly
      ctx.save(); camApply(ctx, w, h, c, 1); ctx.globalCompositeOperation = 'lighter';
      var at = tunnelAt(w, h, { curve: 0.1 });
      for (var i = 0; i < 31; i++) {
        var ph = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(t * 2 - i * 0.5), 3);
        for (var sd = -1; sd <= 1; sd += 2) {
          var q = at(i * 1.1 + 0.55, 1.2 * sd, -1.05); if (q[2] < 0.15) continue;
          glow(ctx, q[0], q[1], w * 0.04 / q[2] + 2, [255, 150, 50], 0.6 * ph);
        }
      }
      for (i = 0; i < 31; i += 4) { var q2 = at(i * 1.1, 0, 1.45); if (q2[2] < 0.3) continue; glow(ctx, q2[0], q2[1], w * 0.1 / q2[2], [90, 200, 200], 0.15); }
      ctx.restore();
    }
  };

  var SPINE_SEC = (function () { var s = []; for (var i = 0; i < 8; i++) { var a = (i + 0.5) / 8 * TAU - PI / 2; s.push([cos(a) * 1.0, sin(a) * 0.9]); } return s; })();
  function spinePlate(w, h) {
    return plate('spine', w, h, 1, function (g, w, h, m) {
      g.fillStyle = '#060a10'; g.fillRect(-m * w, -m * h, w * (1 + 2 * m), h * (1 + 2 * m));
      tunnelPaint(g, w, h, {
        sec: SPINE_SEC, types: [0, 1, 2, 3, 4, 5, 6, 7], curve: 0, len: 26, step: 0.45, fog: 0.16, fogC: [8, 14, 20], cy: 0.48, fov: 0.55,
        cols: function (tp, i) { var base = [[30, 40, 46], [40, 54, 60], [34, 46, 54], [26, 34, 42], [22, 30, 38], [26, 34, 42], [34, 46, 54], [40, 54, 60]][tp]; return i % 2 ? base : mixc(base, [0, 0, 0], 0.25); },
        ribC: [20, 26, 32], ribW: 0.16, ribEdge: [80, 110, 120], ribEvery: 2,
        extra: function (g, i, rings, fog) {
          // cable bundles
          if (i % 1) return;
        },
        ribLight: function (g, i, rg, fog) {
          if (i % 8 !== 4) return;
          var q = rg[4]; g.globalCompositeOperation = 'lighter';
          glow(g, q[0], q[1], w * 0.25 / q[2], [255, 170, 80], 0.5 * (1 - fog));
          g.fillStyle = rgba([255, 210, 140], 1 - fog); g.fillRect(q[0] - w * 0.01 / q[2], q[1] - 2, w * 0.02 / q[2], 4);
          g.globalCompositeOperation = 'source-over';
        }
      });
      // cables running along the lower walls
      var f = w * 0.55, cx = w / 2, cy = h * 0.48;
      for (var k = 0; k < 5; k++) {
        var X = (k < 3 ? -0.85 : 0.85) + (k % 3) * 0.05 * (k < 3 ? 1 : -1), Y = -0.35 - (k % 3) * 0.08;
        g.strokeStyle = ['#141a20', '#2a1a14', '#182028', '#20160e', '#121a22'][k]; g.lineWidth = w * 0.012;
        g.beginPath(); for (var z = 0.32; z < 26; z *= 1.15) { var x = cx + f * X / z, y = cy - f * Y / z; if (z === 0.32) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
      }
    });
  }
  SH.maintenance_spine = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.03), alarm = !!p.alarm;
    drawPlate(ctx, spinePlate(w, h), w, h, c, 1);
    ctx.save(); camApply(ctx, w, h, c, 1); ctx.globalCompositeOperation = 'lighter';
    // two flashlight cones from the crawlers just out of frame
    var beams = [[w * 0.18, h * 1.05, 0.9], [w * 0.86, h * 1.08, 2.4]];
    for (var i = 0; i < beams.length; i++) {
      var B = beams[i], tx = w * (0.5 + 0.08 * sin(t * 0.4 * (i ? 1.3 : 1) + B[2])), ty = h * (0.46 + 0.06 * sin(t * 0.33 + B[2] * 2));
      var dx = tx - B[0], dy = ty - B[1], L = sqrt(dx * dx + dy * dy), nx = -dy / L, ny = dx / L, sp = L * 0.28;
      ctx.beginPath(); ctx.moveTo(B[0] + nx * w * 0.01, B[1] + ny * w * 0.01); ctx.lineTo(tx + nx * sp, ty + ny * sp); ctx.lineTo(tx - nx * sp, ty - ny * sp); ctx.lineTo(B[0] - nx * w * 0.01, B[1] - ny * w * 0.01); ctx.closePath();
      ctx.fillStyle = lg(ctx, B[0], B[1], tx, ty, [0, 'rgba(255,246,220,0.28)', 0.6, 'rgba(230,240,255,0.1)', 1, 'rgba(200,220,255,0.02)']); ctx.fill();
      ctx.save(); ctx.translate(tx, ty); ctx.scale(1, 0.75); glow(ctx, 0, 0, sp * 0.9, [220, 236, 255], 0.22); ctx.restore();
      // dust in the beam
      for (var k = 0; k < 24; k++) {
        var u = fract(h1(k + i * 40) + t * 0.02), v = (h1(k * 3 + i) - 0.5) * 2 * u;
        var px = lerp(B[0], tx, u) + nx * sp * v, py = lerp(B[1], ty, u) + ny * sp * v + sin(t + k) * 3;
        ctx.fillStyle = 'rgba(255,250,230,' + (0.5 * (1 - u)) + ')'; ctx.fillRect(px, py, 2, 2);
      }
    }
    if (alarm) {
      var st = pow(0.5 + 0.5 * sin(t * TAU * 0.9), 6);
      ctx.fillStyle = rgba([255, 20, 20], 0.22 * st); ctx.fillRect(-w, -h, 3 * w, 3 * h);
      var bx = w * 0.5, by = h * 0.3, a = t * 5, k2 = pow(max(0, cos(a)), 6);
      glow(ctx, bx, by, w * 0.05, [255, 50, 30], 0.7);
      streak(ctx, bx, by, w * 0.7 * k2 + 1, h * 0.06, [255, 40, 30], 0.45 * k2);
    }
    ctx.restore();
  };

  // ------------------------------------------------------------------ device
  var DEV = { scr: [0.56, 0.2, 0.3, 0.26] }; // screen rect in frame fractions
  function devicePlate(w, h) {
    return plate('device', w, h, 1, function (g, w, h, m) {
      var x0 = -m * w, y0 = -m * h, W = w * (1 + 2 * m), H = h * (1 + 2 * m), s = w / 1920, r = rng(5), i, k;
      // hull floor of the spine underneath, in flashlight
      g.fillStyle = '#0a0e12'; g.fillRect(x0, y0, W, H);
      g.strokeStyle = '#141c22'; g.lineWidth = w * 0.01;
      for (i = -2; i < 14; i++) { g.beginPath(); g.moveTo(x0, i * h * 0.1); g.lineTo(w * (1 + m), i * h * 0.1 + h * 0.2); g.stroke(); }
      // the box (open lid), slightly rotated
      g.save(); g.translate(w * 0.5, h * 0.52); g.rotate(-0.05);
      var bw = w * 0.8, bh = h * 0.78;
      g.fillStyle = '#2a2e34'; g.fillRect(-bw / 2 - w * 0.02, -bh / 2 - w * 0.02, bw + w * 0.04, bh + w * 0.04);
      g.fillStyle = '#4a5058'; g.fillRect(-bw / 2 - w * 0.02, -bh / 2 - w * 0.02, bw + w * 0.04, w * 0.006);
      for (i = 0; i < 4; i++) { var sx = i % 2 ? bw / 2 + w * 0.008 : -bw / 2 - w * 0.008, sy = i < 2 ? -bh / 2 - w * 0.008 : bh / 2 + w * 0.008; g.fillStyle = '#5a6068'; g.beginPath(); g.arc(sx, sy, w * 0.006, 0, TAU); g.fill(); g.strokeStyle = '#1a1c20'; g.lineWidth = 1.5 * s; g.beginPath(); g.moveTo(sx - w * 0.004, sy); g.lineTo(sx + w * 0.004, sy); g.stroke(); }
      // scratches
      g.strokeStyle = 'rgba(160,170,180,0.25)'; g.lineWidth = 1;
      for (i = 0; i < 40; i++) { var a = r() * TAU, l = w * r() * 0.03, px = (r() - 0.5) * (bw + w * 0.04), py = (r() < 0.5 ? -1 : 1) * (bh / 2 + w * 0.01); g.beginPath(); g.moveTo(px, py); g.lineTo(px + cos(a) * l, py + sin(a) * l * 0.3); g.stroke(); }
      // PCB
      g.fillStyle = '#1d4a32'; g.fillRect(-bw / 2, -bh / 2, bw, bh);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(-bw / 2, bh / 2 - bh * 0.3, bw, bh * 0.3);
      // traces
      g.strokeStyle = 'rgba(190,170,90,0.45)'; g.lineWidth = max(1, 2 * s);
      for (i = 0; i < 60; i++) {
        var tx = -bw / 2 + r() * bw, ty = -bh / 2 + r() * bh; g.beginPath(); g.moveTo(tx, ty);
        for (k = 0; k < 3; k++) { if (r() < 0.5) tx += (r() - 0.5) * bw * 0.3; else ty += (r() - 0.5) * bh * 0.3; tx = clamp(tx, -bw / 2, bw / 2); ty = clamp(ty, -bh / 2, bh / 2); g.lineTo(tx, ty); }
        g.stroke(); g.fillStyle = 'rgba(200,180,100,0.7)'; g.beginPath(); g.arc(tx, ty, 3 * s, 0, TAU); g.fill();
      }
      // chips
      var chips = [[-0.36, -0.3, 0.16, 0.1], [-0.36, -0.12, 0.12, 0.08], [-0.14, -0.32, 0.1, 0.16], [-0.2, 0.05, 0.18, 0.1], [0.02, 0.12, 0.08, 0.08], [-0.4, 0.14, 0.1, 0.12]];
      for (i = 0; i < chips.length; i++) {
        var C = chips[i], cx2 = C[0] * bw, cy2 = C[1] * bh, cw = C[2] * bw, ch = C[3] * bh;
        g.fillStyle = '#c8c8c0'; for (k = 0; k < 8; k++) { g.fillRect(cx2 + cw * (k + 0.5) / 8 - 2 * s, cy2 - 6 * s, 4 * s, ch + 12 * s); }
        g.fillStyle = '#16161a'; g.fillRect(cx2, cy2, cw, ch);
        g.fillStyle = '#2c2c34'; g.fillRect(cx2, cy2, cw, ch * 0.18);
        g.fillStyle = 'rgba(200,200,200,0.5)'; g.font = Math.round(h * 0.016) + 'px monospace'; g.fillText(['MX-90', 'SR4', 'Q7', 'ALN-2', 'K', 'PWR'][i], cx2 + cw * 0.1, cy2 + ch * 0.65);
      }
      // resistors and caps
      for (i = 0; i < 14; i++) {
        var rx = (-0.05 + r() * 0.12) * bw, ry = (-0.4 + r() * 0.5) * bh;
        g.strokeStyle = '#bbb'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(rx - w * 0.02, ry); g.lineTo(rx + w * 0.02, ry); g.stroke();
        g.fillStyle = '#d8c49a'; g.fillRect(rx - w * 0.01, ry - h * 0.007, w * 0.02, h * 0.014);
        var bands = [[160, 40, 30], [30, 30, 30], [200, 120, 30], [190, 160, 60]];
        for (k = 0; k < 4; k++) { g.fillStyle = rgba(bands[(i + k) % 4]); g.fillRect(rx - w * 0.007 + k * w * 0.004, ry - h * 0.007, w * 0.002, h * 0.014); }
      }
      for (i = 0; i < 4; i++) { var ex = (0.12 + i * 0.05) * bw * 0.6 - bw * 0.05, ey = 0.3 * bh; g.fillStyle = '#1c3260'; g.beginPath(); g.arc(ex, ey, w * 0.014, 0, TAU); g.fill(); g.fillStyle = '#8aa0c8'; g.beginPath(); g.arc(ex - w * 0.004, ey - w * 0.004, w * 0.004, 0, TAU); g.fill(); }
      // wires, taped
      var wc = ['#c02a20', '#e0c040', '#202024', '#3a70c0'];
      for (i = 0; i < 4; i++) {
        g.strokeStyle = wc[i]; g.lineWidth = w * 0.005; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-bw * 0.48, bh * (0.2 + i * 0.06)); g.bezierCurveTo(-bw * 0.2, bh * (0.5 + i * 0.02), bw * 0.1, bh * (0.1 - i * 0.05), bw * 0.08, -bh * 0.05 - i * h * 0.01); g.stroke();
      }
      g.fillStyle = 'rgba(200,190,160,0.9)'; g.save(); g.rotate(0.3); g.fillRect(-bw * 0.12, bh * 0.2, w * 0.05, h * 0.03); g.restore();
      g.fillStyle = 'rgba(30,30,30,0.85)'; g.font = 'italic ' + Math.round(h * 0.022) + 'px sans-serif'; g.save(); g.rotate(0.3); g.fillText('N-90  ✓', -bw * 0.115, bh * 0.2 + h * 0.022); g.restore();
      // LED bezels
      for (i = 0; i < 6; i++) { g.fillStyle = '#0c0c0c'; g.beginPath(); g.arc(-bw * 0.3 + i * bw * 0.06, bh * 0.4, w * 0.011, 0, TAU); g.fill(); }
      g.restore();
      // screen bezel (in frame coords)
      var S = DEV.scr, sx0 = S[0] * w, sy0 = S[1] * h, sw = S[2] * w, sh = S[3] * h;
      g.fillStyle = '#101214'; g.fillRect(sx0 - w * 0.012, sy0 - w * 0.012, sw + w * 0.024, sh + w * 0.024);
      g.fillStyle = '#3a3e44'; g.fillRect(sx0 - w * 0.012, sy0 - w * 0.012, sw + w * 0.024, w * 0.004);
    });
  }
  var HEX = '0123456789ABCDEF';
  SH.device_closeup = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.025), wrong = p.codes === 'wrong', s = w / 1920;
    drawPlate(ctx, devicePlate(w, h), w, h, c, 1);
    ctx.save(); camApply(ctx, w, h, c, 1);
    // LEDs
    ctx.save(); ctx.translate(w * 0.5, h * 0.52); ctx.rotate(-0.05);
    var bw = w * 0.8, bh = h * 0.78; ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 6; i++) {
      var on, col;
      if (!wrong) { on = fract(t * 1.2 - i * 0.16) < 0.5; col = i === 5 ? [80, 160, 255] : [60, 255, 110]; }
      else { on = i < 3 ? fract(t * 4 + i * 0.3) < 0.5 : (i === 5 ? fract(t * 6) < 0.5 : fract(t * 0.7 + i) < 0.3); col = i < 3 ? [255, 170, 40] : [255, 40, 30]; }
      var x = -bw * 0.3 + i * bw * 0.06, y = bh * 0.4;
      ctx.fillStyle = rgba(on ? mixc(col, [255, 255, 255], 0.5) : mixc(col, [0, 0, 0], 0.75)); ctx.beginPath(); ctx.arc(x, y, w * 0.007, 0, TAU); ctx.fill();
      if (on) glow(ctx, x, y, w * 0.04, col, 0.55);
    }
    ctx.restore();
    // the little screen
    var S = DEV.scr, sx = S[0] * w, sy = S[1] * h, sw = S[2] * w, sh = S[3] * h;
    var tc = wrong ? [255, 150, 50] : [90, 255, 140];
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = wrong ? '#1a0a04' : '#04140a'; ctx.fillRect(sx, sy, sw, sh);
    ctx.save(); ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
    var fs = sh * 0.11, lines = 9, scroll = t * (wrong ? 1.6 : 0.9), base = floor(scroll);
    ctx.font = 'bold ' + Math.round(fs) + 'px monospace'; ctx.textBaseline = 'top';
    for (var l = 0; l < lines + 1; l++) {
      var li = base + l, y2 = sy + sh * 0.05 + (l - fract(scroll)) * fs * 1.15, str = '';
      var addr = ((li * 16) & 0xFFFF).toString(16).toUpperCase(); while (addr.length < 4) addr = '0' + addr;
      str = addr + ': ';
      for (var k = 0; k < 6; k++) {
        var hv = floor(h1(li * 13 + k * 7 + (wrong ? 500 : 0)) * 256);
        if (!wrong && li % 7 === 3) hv = [0x4E, 0x41, 0x4D, 0x45, 0x53, 0x00][k]; // "NAMES"
        str += HEX[hv >> 4] + HEX[hv & 15] + ' ';
      }
      var bad = wrong && (li % 4 === 1);
      ctx.fillStyle = rgba(bad ? [255, 60, 40] : tc, 0.9);
      ctx.fillText(str, sx + sw * 0.04, y2);
    }
    if (wrong) {
      // the unfamiliar glyph: a security sigil nobody in the hold has seen
      var gx = sx + sw * 0.84, gy = sy + sh * 0.5, gr = sh * 0.2, bl = 0.65 + 0.35 * (fract(t * 1.5) < 0.6 ? 1 : 0);
      ctx.fillStyle = 'rgba(40,6,4,0.85)'; ctx.fillRect(gx - gr * 1.4, sy, gr * 2.8, sh);
      ctx.strokeStyle = rgba([255, 60, 40], bl); ctx.lineWidth = max(1.5, gr * 0.12);
      ctx.beginPath(); ctx.arc(gx, gy, gr, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx, gy - gr * 1.25); ctx.lineTo(gx, gy + gr * 1.25); ctx.stroke();
      for (k = 0; k < 3; k++) { var cy3 = gy - gr * 0.5 + k * gr * 0.5; ctx.beginPath(); ctx.moveTo(gx - gr * 0.55, cy3 - gr * 0.2); ctx.lineTo(gx, cy3 + gr * 0.1); ctx.lineTo(gx + gr * 0.55, cy3 - gr * 0.2); ctx.stroke(); }
      ctx.fillStyle = rgba([255, 60, 40], bl); ctx.font = 'bold ' + Math.round(fs * 0.8) + 'px monospace'; ctx.fillText('SIG ?', gx - gr * 1.1, sy + sh * 0.84);
    } else {
      var cur = fract(t * 1.4) < 0.5; if (cur) { ctx.fillStyle = rgba(tc, 0.9); ctx.fillRect(sx + sw * 0.04, sy + sh * 0.88, fs * 0.6, fs * 0.9); }
      ctx.fillStyle = rgba(tc, 0.9); ctx.font = 'bold ' + Math.round(fs * 0.8) + 'px monospace'; ctx.fillText('ALIGN 90s  OK', sx + sw * 0.2, sy + sh * 0.88);
    }
    // scanlines + glass glow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; for (var yy = sy; yy < sy + sh; yy += max(2, 3 * s)) ctx.fillRect(sx, yy, sw, max(1, s));
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, sx + sw / 2, sy + sh / 2, sw * 0.9, tc, 0.12);
    // flashlight pool sweeping slightly
    var fx = w * (0.45 + 0.05 * sin(t * 0.5)), fy = h * (0.5 + 0.04 * sin(t * 0.37));
    glow(ctx, fx, fy, w * 0.55, [255, 240, 210], 0.14);
    ctx.restore();
  };

  // ------------------------------------------------------------------ newsfeed
  function newsPlate(w, h) {
    return layer('news', w, h, function (g, W, H) {
      var w = W, h = H;
      g.fillStyle = lg(g, 0, 0, w, h, [0, '#0a1430', 1, '#162250']); g.fillRect(0, 0, w, h);
      // geometric gold rules
      g.strokeStyle = 'rgba(214,176,90,0.25)'; g.lineWidth = max(1, w * 0.001);
      for (var i = 0; i < 12; i++) { g.beginPath(); g.moveTo(w * 0.62 + i * w * 0.03, 0); g.lineTo(w * 0.62 + i * w * 0.03 - h * 0.5, h); g.stroke(); }
      // video window frame
      g.fillStyle = '#05070f'; g.fillRect(w * 0.05, h * 0.12, w * 0.56, h * 0.56);
      g.strokeStyle = 'rgba(214,176,90,0.9)'; g.lineWidth = max(1, w * 0.002); g.strokeRect(w * 0.05, h * 0.12, w * 0.56, h * 0.56);
      // right column info panels
      for (i = 0; i < 3; i++) {
        var py = h * (0.12 + i * 0.19);
        g.fillStyle = 'rgba(20,36,80,0.9)'; g.fillRect(w * 0.64, py, w * 0.31, h * 0.17);
        g.fillStyle = 'rgba(214,176,90,0.9)'; g.fillRect(w * 0.64, py, w * 0.006, h * 0.17);
        g.fillStyle = 'rgba(230,224,206,0.9)'; g.font = 'bold ' + Math.round(h * 0.026) + 'px sans-serif';
        g.fillText(['MIRROR ARRAY', 'AGRI RING · SEC 4', 'ACCORD TALKS'][i], w * 0.655, py + h * 0.045);
        g.font = Math.round(h * 0.022) + 'px sans-serif'; g.fillStyle = 'rgba(180,190,220,0.85)';
        g.fillText(['EMERGENCY LOCK', 'SEALED · FIRE CREWS', 'SUSPENDED'][i], w * 0.655, py + h * 0.09);
      }
      // channel bug
      g.fillStyle = 'rgba(214,176,90,1)'; g.fillRect(w * 0.05, h * 0.04, w * 0.08, h * 0.05);
      g.fillStyle = '#0a1430'; g.font = 'bold ' + Math.round(h * 0.036) + 'px sans-serif'; g.fillText('VNS', w * 0.06, h * 0.08);
      g.fillStyle = 'rgba(230,224,206,0.95)'; g.font = Math.round(h * 0.024) + 'px sans-serif'; g.fillText('VESPER NEWS SERVICE  ·  緊急報道', w * 0.14, h * 0.075);
    });
  }
  SH.newsfeed = function (ctx, w, h, t, p) {
    p = p || {}; var s = w / 1920, head = String(p.headline || 'EMERGENCY ON VESPER').toUpperCase();
    ctx.drawImage(newsPlate(w, h), 0, 0, w, h);
    // the "video": schematic of the habitat, petal 5 flashing red, rotating slowly
    var vx = w * 0.05, vy = h * 0.12, vw = w * 0.56, vh = h * 0.56;
    ctx.save(); ctx.beginPath(); ctx.rect(vx, vy, vw, vh); ctx.clip();
    ctx.fillStyle = '#060a18'; ctx.fillRect(vx, vy, vw, vh);
    ctx.strokeStyle = 'rgba(100,140,220,0.25)'; ctx.lineWidth = 1;
    for (var i = 1; i < 12; i++) { ctx.beginPath(); ctx.moveTo(vx + vw * i / 12, vy); ctx.lineTo(vx + vw * i / 12, vy + vh); ctx.stroke(); }
    for (i = 1; i < 7; i++) { ctx.beginPath(); ctx.moveTo(vx, vy + vh * i / 7); ctx.lineTo(vx + vw, vy + vh * i / 7); ctx.stroke(); }
    var cx = vx + vw * 0.5, cy = vy + vh * 0.5, R = vh * 0.3, rot = t * 0.15;
    ctx.strokeStyle = 'rgba(160,200,255,0.85)'; ctx.lineWidth = max(1, 2 * s);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, TAU); ctx.stroke();
    for (i = 0; i < 12; i++) {
      var a = i / 12 * TAU + rot, a2 = a + TAU / 12 * 0.8, bad = i === 4;
      if (bad && fract(t * 1.2) > 0.6) continue;
      ctx.strokeStyle = bad ? 'rgba(255,60,50,0.95)' : 'rgba(160,200,255,0.7)';
      ctx.beginPath(); ctx.moveTo(cx + cos(a) * R * 0.52, cy + sin(a) * R * 0.52); ctx.lineTo(cx + cos(a) * R, cy + sin(a) * R); ctx.lineTo(cx + cos(a2) * R, cy + sin(a2) * R); ctx.lineTo(cx + cos(a2) * R * 0.52, cy + sin(a2) * R * 0.52); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(160,200,255,0.8)'; ctx.font = Math.round(h * 0.02) + 'px monospace';
    ctx.fillText('MIRROR AUTHORITY RELEASE · ARRAY SCHEMATIC', vx + vw * 0.03, vy + vh * 0.07);
    ctx.fillStyle = 'rgba(255,90,70,0.9)'; ctx.fillText('PETAL 05: LOST', vx + vw * 0.03, vy + vh * 0.94);
    ctx.restore();
    // LIVE + clock
    var live = fract(t * 0.8) < 0.6;
    ctx.fillStyle = live ? '#e02a20' : '#601410'; ctx.beginPath(); ctx.arc(w * 0.585, h * 0.065, h * 0.012, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e6e0ce'; ctx.font = 'bold ' + Math.round(h * 0.026) + 'px sans-serif'; ctx.fillText('LIVE', w * 0.6, h * 0.075);
    var sec = floor(t) + 14 * 60 + 6 * 3600, hh = floor(sec / 3600) % 24, mm = floor(sec / 60) % 60, ss = sec % 60;
    function z2(n) { return (n < 10 ? '0' : '') + n; }
    ctx.font = Math.round(h * 0.026) + 'px monospace'; ctx.fillText(z2(hh) + ':' + z2(mm) + ':' + z2(ss) + ' VST', w * 0.82, h * 0.075);
    // headline box, wipes in
    var wi = smooth(0.2, 0.9, t), hy = h * 0.72, hb = h * 0.12;
    ctx.fillStyle = 'rgba(214,176,90,1)'; ctx.fillRect(w * 0.05, hy, w * 0.9 * wi, h * 0.008);
    ctx.fillStyle = 'rgba(236,230,214,0.97)'; ctx.fillRect(w * 0.05, hy + h * 0.008, w * 0.9 * wi, hb);
    ctx.fillStyle = '#b02420'; ctx.fillRect(w * 0.05, hy + h * 0.008, w * 0.11 * wi, hb);
    ctx.save(); ctx.beginPath(); ctx.rect(w * 0.05, hy, w * 0.9 * wi, hb + h * 0.01); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(h * 0.03) + 'px sans-serif'; ctx.fillText('BREAKING', w * 0.058, hy + h * 0.075);
    var fsz = h * 0.06; ctx.font = 'bold ' + Math.round(fsz) + 'px sans-serif';
    while (ctx.measureText(head).width > w * 0.76 && fsz > h * 0.025) { fsz *= 0.92; ctx.font = 'bold ' + Math.round(fsz) + 'px sans-serif'; }
    ctx.fillStyle = '#0c1634'; ctx.fillText(head, w * 0.175, hy + h * 0.008 + hb / 2 + fsz * 0.36);
    ctx.restore();
    // ticker
    var ty = h * 0.88, th = h * 0.06;
    ctx.fillStyle = '#060a1c'; ctx.fillRect(0, ty, w, th);
    ctx.fillStyle = 'rgba(214,176,90,1)'; ctx.fillRect(0, ty, w, max(1, h * 0.004));
    var tick = '  ◆  CURFEW IN EFFECT ALL RINGS  ◆  MIRROR ARRAY HELD IN EMERGENCY MODE  ◆  ' + head + '  ◆  CASUALTY LISTS AT DISTRICT OFFICES  ◆  ACCORD SESSION POSTPONED  ◆  FLEET READINESS RAISED  ◆  HYDROPONIC RATIONING FROM 0600';
    ctx.font = Math.round(th * 0.5) + 'px sans-serif'; ctx.fillStyle = '#e6e0ce'; ctx.textBaseline = 'middle';
    var tw = ctx.measureText(tick).width, off = (t * w * 0.08) % tw;
    ctx.fillText(tick, w - off - tw, ty + th / 2); ctx.fillText(tick, w - off, ty + th / 2);
    ctx.textBaseline = 'alphabetic';
    // CRT: scanlines, faint roll bar, glow
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; for (var y = 0; y < h; y += max(2, 3 * s)) ctx.fillRect(0, y, w, max(1, s));
    var rb = fract(t * 0.12) * h * 1.4 - h * 0.2;
    ctx.fillStyle = lg(ctx, 0, rb, 0, rb + h * 0.15, [0, 'rgba(255,255,255,0)', 0.5, 'rgba(200,220,255,0.035)', 1, 'rgba(255,255,255,0)']); ctx.fillRect(0, rb, w, h * 0.15);
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, w * 0.5, h * 0.45, w * 0.7, [80, 110, 200], 0.06); ctx.globalCompositeOperation = 'source-over';
  };

  // ------------------------------------------------------------------ cockpit
  function cockpitPlate(w, h) {
    return plate('cockpit', w, h, 1, function (g, w, h, m) {
      var x0 = -m * w, y0 = -m * h, W = w * (1 + 2 * m), H = h * (1 + 2 * m), s = w / 1920, r = rng(77), i;
      // cabin structure (windshield cut out later -> drawn as frame over transparent)
      g.fillStyle = '#1a1614'; g.fillRect(x0, y0, W, H);
      // windshield panes are holes: use destination-out
      var panes = [[[0.08, 0.12], [0.36, 0.06], [0.36, 0.5], [0.12, 0.52]], [[0.39, 0.055], [0.61, 0.055], [0.61, 0.5], [0.39, 0.5]], [[0.64, 0.06], [0.92, 0.12], [0.88, 0.52], [0.64, 0.5]]];
      g.globalCompositeOperation = 'destination-out';
      for (i = 0; i < 3; i++) { poly(g, panes[i].map(function (q) { return [q[0] * w, q[1] * h]; })); g.fill(); }
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = '#2c2622'; g.lineWidth = w * 0.012;
      for (i = 0; i < 3; i++) { poly(g, panes[i].map(function (q) { return [q[0] * w, q[1] * h]; })); g.stroke(); }
      g.strokeStyle = 'rgba(255,190,120,0.25)'; g.lineWidth = max(1, w * 0.0015);
      for (i = 0; i < 3; i++) { poly(g, panes[i].map(function (q) { return [q[0] * w, q[1] * h]; })); g.stroke(); }
      // ceiling panel with switches
      g.fillStyle = '#24201c'; g.fillRect(x0, y0, W, h * 0.04 - y0);
      for (i = 0; i < 30; i++) { g.fillStyle = r() < 0.5 ? '#3a342c' : '#4a3e2e'; g.fillRect(w * (0.1 + i * 0.027), h * 0.005, w * 0.012, h * 0.022); }
      // dashboard
      g.fillStyle = lg(g, 0, h * 0.52, 0, h, [0, '#3a322a', 0.06, '#2a241e', 1, '#120e0c']);
      g.beginPath(); g.moveTo(x0, h * 0.58); g.quadraticCurveTo(w * 0.5, h * 0.48, w * (1 + m), h * 0.58); g.lineTo(w * (1 + m), h * (1 + m)); g.lineTo(x0, h * (1 + m)); g.fill();
      g.strokeStyle = 'rgba(255,200,140,0.35)'; g.lineWidth = max(1, w * 0.0015); g.beginPath(); g.moveTo(x0, h * 0.58); g.quadraticCurveTo(w * 0.5, h * 0.48, w * (1 + m), h * 0.58); g.stroke();
      // screen bezels
      var scr = [[0.2, 0.6, 0.14, 0.13], [0.43, 0.57, 0.14, 0.12], [0.66, 0.6, 0.14, 0.13]];
      for (i = 0; i < 3; i++) { var S = scr[i]; g.fillStyle = '#0a0806'; g.fillRect((S[0] - 0.01) * w, (S[1] - 0.015) * h, (S[2] + 0.02) * w, (S[3] + 0.03) * h); }
      // switch banks
      for (i = 0; i < 46; i++) {
        var sx = w * (0.08 + (i % 23) * 0.037), sy = h * (0.78 + floor(i / 23) * 0.06);
        g.fillStyle = '#0e0c0a'; g.fillRect(sx, sy, w * 0.016, h * 0.03);
        g.fillStyle = '#9a9488'; g.fillRect(sx + w * 0.006, sy + (r() < 0.5 ? 0 : h * 0.012), w * 0.004, h * 0.018);
      }
      // stickers & tape
      g.fillStyle = '#c84a2a'; g.fillRect(w * 0.37, h * 0.7, w * 0.03, h * 0.025);
      g.fillStyle = '#e8d8a0'; g.save(); g.translate(w * 0.83, h * 0.75); g.rotate(-0.15); g.fillRect(0, 0, w * 0.06, h * 0.02); g.fillStyle = '#302820'; g.font = Math.round(h * 0.014) + 'px monospace'; g.fillText('DON\'T TOUCH', w * 0.003, h * 0.015); g.restore();
      // licorice root on the dash
      g.save(); g.translate(w * 0.56, h * 0.535); g.rotate(-0.08);
      g.strokeStyle = '#4a2a16'; g.lineWidth = w * 0.007; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(w * 0.02, -h * 0.006, w * 0.04, h * 0.004, w * 0.07, -h * 0.002); g.stroke();
      g.strokeStyle = '#7a4a26'; g.lineWidth = w * 0.002; g.beginPath(); g.moveTo(w * 0.005, -h * 0.003); g.bezierCurveTo(w * 0.02, -h * 0.008, w * 0.04, h * 0.0, w * 0.068, -h * 0.005); g.stroke();
      g.strokeStyle = '#4a2a16'; g.lineWidth = w * 0.002; g.beginPath(); g.moveTo(w * 0.07, -h * 0.002); g.lineTo(w * 0.078, -h * 0.008); g.moveTo(w * 0.07, -h * 0.002); g.lineTo(w * 0.079, h * 0.002); g.stroke();
      g.restore();
      // empty seat backs
      for (i = 0; i < 2; i++) {
        var cx = w * (i ? 0.76 : 0.24), cy = h * 0.9;
        g.fillStyle = '#0e0c0b';
        g.beginPath(); g.moveTo(cx - w * 0.12, h * 1.2); g.lineTo(cx - w * 0.11, cy - h * 0.1); g.lineTo(cx - w * 0.1, cy - h * 0.13); g.lineTo(cx + w * 0.1, cy - h * 0.13); g.lineTo(cx + w * 0.11, cy - h * 0.1); g.lineTo(cx + w * 0.12, h * 1.2); g.fill();
        g.fillRect(cx - w * 0.015, cy - h * 0.18, w * 0.008, h * 0.06); g.fillRect(cx + w * 0.007, cy - h * 0.18, w * 0.008, h * 0.06);
        g.fillRect(cx - w * 0.055, cy - h * 0.26, w * 0.11, h * 0.08);
        g.strokeStyle = 'rgba(120,200,160,0.28)'; g.lineWidth = max(1, w * 0.0022);
        g.strokeRect(cx - w * 0.055, cy - h * 0.26, w * 0.11, h * 0.08);
        g.beginPath(); g.moveTo(cx - w * 0.1, cy - h * 0.13); g.lineTo(cx + w * 0.1, cy - h * 0.13); g.stroke();
        g.strokeStyle = 'rgba(60,50,40,0.9)'; g.lineWidth = w * 0.006; g.beginPath(); g.moveTo(cx - w * 0.07, cy - h * 0.12); g.lineTo(cx + w * 0.02, h * 1.1); g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = max(1, w * 0.002); g.beginPath(); g.moveTo(cx - w * 0.1, cy - h * 0.02); g.lineTo(cx + w * 0.1, cy - h * 0.02); g.moveTo(cx - w * 0.1, cy + h * 0.06); g.lineTo(cx + w * 0.1, cy + h * 0.06); g.stroke();
      }
    });
  }
  SH.freighter_cockpit_empty = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.02), s = w / 1920;
    // outside: stars, ring arc, dock lights
    space(ctx, w, h, t, c, { sd: 0.1, neb: 0.6 });
    ctx.save(); camApply(ctx, w, h, c, 0.2);
    orrin(ctx, w * 0.3, h * 1.6, h * 1.2, t, { tilt: 0.15, sun: -1.2, phase: 1.6, light: 0.3, dim: 0.4, ringTilt: 0.18 });
    ctx.restore();
    drawPlate(ctx, cockpitPlate(w, h), w, h, c, 1);
    ctx.save(); camApply(ctx, w, h, c, 1);
    // screens
    var scr = [[0.2, 0.6, 0.14, 0.13, [90, 255, 150]], [0.43, 0.57, 0.14, 0.12, [255, 180, 70]], [0.66, 0.6, 0.14, 0.13, [90, 255, 150]]];
    for (var i = 0; i < 3; i++) {
      var S = scr[i], x = S[0] * w, y = S[1] * h, sw = S[2] * w, sh = S[3] * h, col = S[4], fl = 0.85 + 0.15 * vn(t * 7 + i * 5);
      ctx.fillStyle = rgba(mixc(col, [0, 0, 0], 0.88)); ctx.fillRect(x, y, sw, sh);
      ctx.strokeStyle = rgba(col, 0.75 * fl); ctx.lineWidth = max(1, 1.5 * s);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, sw, sh); ctx.clip();
      if (i === 0) { // wireframe ring sweep
        ctx.beginPath(); ctx.ellipse(x + sw / 2, y + sh / 2, sw * 0.4, sh * 0.25, 0, 0, TAU); ctx.stroke();
        var a = t * 1.3; ctx.beginPath(); ctx.moveTo(x + sw / 2, y + sh / 2); ctx.lineTo(x + sw / 2 + cos(a) * sw * 0.4, y + sh / 2 + sin(a) * sh * 0.25); ctx.stroke();
      } else if (i === 1) {
        ctx.fillStyle = rgba(col, 0.85 * fl); ctx.font = Math.round(sh * 0.14) + 'px monospace';
        var L = ['FUEL  0.61', 'O2    OK', 'HOLD  ' + (fract(t * 0.5) < 0.5 ? 'SEAL' : '    '), 'DOCK  D-14'];
        for (var k = 0; k < 4; k++) ctx.fillText(L[k], x + sw * 0.08, y + sh * (0.25 + k * 0.2));
      } else {
        ctx.beginPath(); for (k = 0; k <= 40; k++) { var u = k / 40, yy = y + sh * (0.5 + 0.3 * sin(u * 14 + t * 2) * vn(u * 5 + t)); if (k) ctx.lineTo(x + u * sw, yy); else ctx.moveTo(x, yy); } ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (var yy2 = y; yy2 < y + sh; yy2 += 3 * s) ctx.fillRect(x, yy2, sw, max(1, s));
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, x + sw / 2, y + sh / 2, sw * 0.9, col, 0.1 * fl); ctx.globalCompositeOperation = 'source-over';
    }
    // blinking indicator buttons
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < 18; i++) {
      var on = fract(t * (0.2 + h1(i) * 0.6) + h1(i + 3)) < 0.5 + 0.4 * h1(i + 9);
      var bx = w * (0.1 + i * 0.045), by = h * 0.75, bc = [[255, 80, 60], [90, 255, 140], [255, 190, 60]][i % 3];
      ctx.fillStyle = rgba(on ? bc : mixc(bc, [0, 0, 0], 0.8)); ctx.fillRect(bx, by, w * 0.008, h * 0.008);
      if (on) glow(ctx, bx + w * 0.004, by + h * 0.004, w * 0.012, bc, 0.4);
    }
    ctx.globalCompositeOperation = 'source-over';
    // hanging charm from the canopy, swinging gently
    var px = w * 0.5, py = h * 0.05, sw2 = sin(t * 1.3) * 0.16 + sin(t * 0.7) * 0.05, L2 = h * 0.2;
    var ex = px + sin(sw2) * L2, ey = py + cos(sw2) * L2;
    ctx.strokeStyle = '#0a0806'; ctx.lineWidth = max(1, 1.5 * s); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = '#b84a2a'; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - w * 0.012, ey + h * 0.03); ctx.lineTo(ex, ey + h * 0.05); ctx.lineTo(ex + w * 0.012, ey + h * 0.03); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,160,0.6)'; ctx.fillRect(ex - w * 0.003, ey + h * 0.012, w * 0.003, h * 0.02);
    ctx.restore();
  };

  // ------------------------------------------------------------------ interrogation room
  function interroPlate(w, h, teo) {
    return plate('interro' + (teo ? 'T' : ''), w, h, 1, function (g, w, h, m) {
      var x0 = -m * w, y0 = -m * h, W = w * (1 + 2 * m), H = h * (1 + 2 * m), lx = w * 0.5, s = w / 1920;
      // walls & floor
      g.fillStyle = '#141a1e'; g.fillRect(x0, y0, W, H);
      g.fillStyle = '#1c2428'; g.fillRect(w * 0.12, h * 0.08, w * 0.76, h * 0.56);
      g.fillStyle = '#0e1214'; g.beginPath(); g.moveTo(x0, h * (1 + m)); g.lineTo(w * 0.12, h * 0.64); g.lineTo(w * 0.88, h * 0.64); g.lineTo(w * (1 + m), h * (1 + m)); g.fill();
      g.strokeStyle = '#0a0c0e'; g.lineWidth = w * 0.004;
      g.beginPath(); g.moveTo(w * 0.12, y0); g.lineTo(w * 0.12, h * 0.64); g.moveTo(w * 0.88, y0); g.lineTo(w * 0.88, h * 0.64); g.stroke();
      // one-way mirror on the back wall
      g.fillStyle = '#0a0e12'; g.fillRect(w * 0.6, h * 0.18, w * 0.24, h * 0.24);
      g.fillStyle = 'rgba(120,150,170,0.08)'; g.beginPath(); g.moveTo(w * 0.62, h * 0.42); g.lineTo(w * 0.7, h * 0.18); g.lineTo(w * 0.74, h * 0.18); g.lineTo(w * 0.66, h * 0.42); g.fill();
      g.strokeStyle = '#2a3236'; g.lineWidth = w * 0.004; g.strokeRect(w * 0.6, h * 0.18, w * 0.24, h * 0.24);
      // light pool on the floor & wall
      g.globalCompositeOperation = 'lighter';
      g.save(); g.translate(lx, h * 0.8); g.scale(1, 0.32); glow(g, 0, 0, w * 0.4, [200, 210, 190], 0.3); g.restore();
      // the cone
      g.beginPath(); g.moveTo(lx - w * 0.03, h * 0.08); g.lineTo(lx + w * 0.03, h * 0.08); g.lineTo(lx + w * 0.3, h * 0.86); g.lineTo(lx - w * 0.3, h * 0.86); g.closePath();
      g.fillStyle = lg(g, 0, h * 0.08, 0, h * 0.86, [0, 'rgba(230,236,210,0.22)', 1, 'rgba(230,236,210,0.04)']); g.fill();
      g.globalCompositeOperation = 'source-over';
      // lamp
      g.strokeStyle = '#08090a'; g.lineWidth = max(1, 2 * s); g.beginPath(); g.moveTo(lx, y0); g.lineTo(lx, h * 0.05); g.stroke();
      g.fillStyle = '#20262a'; g.beginPath(); g.moveTo(lx - w * 0.035, h * 0.09); g.lineTo(lx - w * 0.015, h * 0.05); g.lineTo(lx + w * 0.015, h * 0.05); g.lineTo(lx + w * 0.035, h * 0.09); g.fill();
      // table: hard shadow beneath
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.ellipse(lx, h * 0.86, w * 0.24, h * 0.04, 0, 0, TAU); g.fill();
      g.fillStyle = '#2e3436'; g.beginPath(); g.moveTo(lx - w * 0.2, h * 0.66); g.lineTo(lx + w * 0.2, h * 0.66); g.lineTo(lx + w * 0.24, h * 0.74); g.lineTo(lx - w * 0.24, h * 0.74); g.closePath(); g.fill();
      g.fillStyle = '#8a9090'; g.beginPath(); g.moveTo(lx - w * 0.2, h * 0.66); g.lineTo(lx + w * 0.2, h * 0.66); g.lineTo(lx + w * 0.24, h * 0.74); g.lineTo(lx - w * 0.24, h * 0.74); g.closePath(); g.fill();
      g.fillStyle = '#1a1e20'; g.fillRect(lx - w * 0.24, h * 0.74, w * 0.48, h * 0.02);
      g.fillStyle = '#0c0e10'; g.fillRect(lx - w * 0.22, h * 0.76, w * 0.012, h * 0.12); g.fillRect(lx + w * 0.21, h * 0.76, w * 0.012, h * 0.12);
      // empty chair on our side (silhouette)
      g.fillStyle = '#07090a'; g.fillRect(lx - w * 0.07, h * 0.8, w * 0.14, h * 0.3); g.fillRect(lx - w * 0.08, h * 0.78, w * 0.16, h * 0.04);
      if (teo) {
        var tx = lx + w * 0.02, ty = h * 0.66;
        g.fillStyle = '#0c0e10';
        // chair back behind him
        g.fillRect(tx - w * 0.06, ty - h * 0.2, w * 0.12, h * 0.2);
        // shoulders hunched, thin
        g.beginPath(); g.moveTo(tx - w * 0.1, ty); g.quadraticCurveTo(tx - w * 0.09, ty - h * 0.13, tx - w * 0.03, ty - h * 0.15); g.lineTo(tx + w * 0.03, ty - h * 0.15); g.quadraticCurveTo(tx + w * 0.09, ty - h * 0.13, tx + w * 0.1, ty); g.fill();
        // head bowed, curly hair
        var hx = tx, hy = ty - h * 0.15;
        g.beginPath(); for (var k = 0; k <= 22; k++) { var a = PI + k / 22 * PI, rr = w * 0.04 * (1 + 0.06 * abs(sin(k * 1.6))); var px = hx + cos(a) * rr, py = hy + sin(a) * rr * 0.95; if (k) g.lineTo(px, py); else g.moveTo(px, py); } g.lineTo(hx + w * 0.035, hy + h * 0.02); g.lineTo(hx - w * 0.035, hy + h * 0.02); g.closePath(); g.fill();
        // arms folded on the table
        g.fillStyle = '#16191b'; g.beginPath(); g.ellipse(tx, ty + h * 0.005, w * 0.11, h * 0.022, 0, 0, TAU); g.fill();
        // hands
        g.fillStyle = '#3a2e28'; g.beginPath(); g.ellipse(tx - w * 0.05, ty + h * 0.004, w * 0.016, h * 0.01, 0.2, 0, TAU); g.fill(); g.beginPath(); g.ellipse(tx + w * 0.045, ty + h * 0.006, w * 0.016, h * 0.01, -0.2, 0, TAU); g.fill();
        // rim light from the lamp above
        g.strokeStyle = 'rgba(220,226,200,0.75)'; g.lineWidth = max(1, w * 0.0025);
        g.beginPath(); for (k = 3; k <= 19; k++) { var a2 = PI + k / 22 * PI, r2 = w * 0.04 * (1 + 0.06 * abs(sin(k * 1.6))); var p2x = hx + cos(a2) * r2, p2y = hy + sin(a2) * r2 * 0.95; if (k > 3) g.lineTo(p2x, p2y); else g.moveTo(p2x, p2y); } g.stroke();
        g.beginPath(); g.moveTo(tx - w * 0.09, ty - h * 0.09); g.quadraticCurveTo(tx - w * 0.085, ty - h * 0.13, tx - w * 0.03, ty - h * 0.15); g.moveTo(tx + w * 0.09, ty - h * 0.09); g.quadraticCurveTo(tx + w * 0.085, ty - h * 0.13, tx + w * 0.03, ty - h * 0.15); g.stroke();
      }
    });
  }
  SH.interrogation_room = function (ctx, w, h, t, p) {
    p = p || {}; var c = cam(p, t, 0.025);
    drawPlate(ctx, interroPlate(w, h, !!p.withTeo), w, h, c, 1);
    ctx.save(); camApply(ctx, w, h, c, 1); ctx.globalCompositeOperation = 'lighter';
    var fl = vn(t * 2.3) > 0.88 ? 0.5 : 1;
    if (fl < 1) { ctx.fillStyle = 'rgba(0,0,0,0)'; }
    glow(ctx, w * 0.5, h * 0.09, w * 0.06, [240, 246, 220], 0.7 * fl);
    for (var i = 0; i < 46; i++) {
      var u = fract(h1(i) + t * 0.006 * (0.4 + h1(i + 5))), y = lerp(h * 0.12, h * 0.85, u), spread = lerp(0.03, 0.28, u);
      var x = w * (0.5 + (h1(i * 7) - 0.5) * 2 * spread) + sin(t * 0.3 + i) * w * 0.006;
      ctx.fillStyle = rgba([230, 236, 210], 0.4 * sin(u * PI) * fl); ctx.fillRect(x, y, 2, 2);
    }
    ctx.restore();
    if (fl < 1) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, w, h); }
  };

  // ------------------------------------------------------------------ Callisto Gap (memory)
  SH.callisto_gap_memory = function (ctx, w, h, t, p) {
    p = p || {}; var s = w / 1920, fi = floor(t * 12);
    // gate weave / jitter
    var jx = (h1(fi * 3.1) - 0.5) * w * 0.004, jy = (h1(fi * 5.7) - 0.5) * h * 0.006;
    var c = cam(p, t, 0.04);
    ctx.save(); ctx.translate(jx, jy);
    ctx.fillStyle = lg(ctx, 0, 0, 0, h, [0, '#1c1a16', 1, '#2e2a22']); ctx.fillRect(-w * 0.05, -h * 0.05, w * 1.1, h * 1.1);
    drawPlate(ctx, starPlate(w, h, 41, 0.6), w, h, c, 0.2);
    ctx.save(); camApply(ctx, w, h, c, 0.3);
    orrin(ctx, w * 0.75, h * 1.35, h * 0.85, t, { tilt: 0.2, sun: -2.0, phase: 1.3, light: 0.2, dim: 0.2, ringTilt: 0.2 });
    ctx.restore();
    // desaturate + sepia via 'color' composite
    ctx.globalCompositeOperation = 'color'; ctx.fillStyle = '#8a7a5a'; ctx.fillRect(-w, -h, 3 * w, 3 * h);
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#9a948a'; ctx.fillRect(-w, -h, 3 * w, 3 * h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save(); camApply(ctx, w, h, c, 1);
    // tracers
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 16; i++) {
      var u = fract(t * (0.6 + h1(i) * 0.8) + h1(i + 30)), y0 = h * (0.1 + h1(i * 3) * 0.7), dir = h1(i + 8) < 0.5 ? 1 : -1;
      var x1 = dir > 0 ? lerp(-0.1, 1.1, u) * w : lerp(1.1, -0.1, u) * w, y1 = y0 + (u - 0.5) * h * 0.2 * (h1(i + 2) - 0.5);
      ctx.strokeStyle = rgba(i % 3 ? [230, 210, 160] : [140, 220, 210], 0.55); ctx.lineWidth = max(1, 2 * s);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - dir * w * 0.06, y1); ctx.stroke();
    }
    // explosions on a schedule
    for (i = 0; i < 5; i++) {
      var T0 = i * 2.3 + 0.4, age = fract((t - T0) / 11.5) * 11.5; if (age > 2.2) continue;
      var ex = w * (0.2 + h1(i * 9) * 0.6), ey = h * (0.2 + h1(i * 4) * 0.5), k = exp(-age * 2);
      glow(ctx, ex, ey, w * (0.04 + age * 0.08), [255, 230, 180], 0.9 * k);
      ctx.strokeStyle = rgba([220, 210, 180], 0.6 * (1 - age / 2.2)); ctx.lineWidth = max(1, 3 * s * (1 - age / 2.2));
      ctx.beginPath(); ctx.arc(ex, ey, w * 0.15 * sqrt(age), 0, TAU); ctx.stroke();
      if (age < 0.12) { ctx.fillStyle = rgba([255, 250, 230], 0.35 * (1 - age / 0.12)); ctx.fillRect(-w, -h, 3 * w, 3 * h); }
    }
    ctx.globalCompositeOperation = 'source-over';
    // debris tumbling
    var r = rng(13);
    for (i = 0; i < 30; i++) {
      var dx = (r() * 1.2 - 0.1) * w + (r() - 0.5) * t * w * 0.02, dy = (r()) * h + (r() - 0.5) * t * h * 0.02, sz = w * (0.004 + r() * 0.012), sp = (r() - 0.5) * 4;
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(t * sp); ctx.fillStyle = '#0e0c0a'; ctx.fillRect(-sz, -sz * 0.4, sz * 2, sz * 0.8); ctx.restore();
    }
    // fighter silhouettes in formation crossing
    for (i = 0; i < 4; i++) {
      var fu = fract(t * 0.045 + i * 0.05), fx = lerp(1.15, -0.2, fu) * w + i * w * 0.06, fy = h * (0.45 + i * 0.07) - fu * h * 0.12, fs = w * (0.06 - i * 0.008);
      ctx.save(); ctx.translate(fx, fy); ctx.rotate(0.12);
      ctx.fillStyle = '#0a0908';
      ctx.beginPath(); ctx.moveTo(-fs, 0); ctx.lineTo(fs * 0.3, -fs * 0.12); ctx.lineTo(fs * 0.5, -fs * 0.5); ctx.lineTo(fs * 0.62, -fs * 0.5); ctx.lineTo(fs * 0.55, -fs * 0.1); ctx.lineTo(fs * 0.7, -fs * 0.06); ctx.lineTo(fs * 0.7, fs * 0.08); ctx.lineTo(fs * 0.3, fs * 0.12); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(230,210,170,0.45)'; ctx.lineWidth = max(1, 1.5 * s); ctx.beginPath(); ctx.moveTo(-fs, 0); ctx.lineTo(fs * 0.3, -fs * 0.12); ctx.lineTo(fs * 0.5, -fs * 0.5); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, fs * 0.72, 0, fs * 0.3, [150, 230, 220], 0.6); ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
    ctx.restore();
    // teal shadows / sepia highlights split, then washed-out flicker
    ctx.globalCompositeOperation = 'soft-light'; ctx.fillStyle = 'rgba(40,110,110,0.35)'; ctx.fillRect(-w, -h, 3 * w, 3 * h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba([230, 220, 190], 0.05 + 0.05 * h1(fi * 1.3)); ctx.fillRect(-w, -h, 3 * w, 3 * h);
    ctx.restore();
    // scratches and dust (memory damage, deterministic per frame)
    ctx.strokeStyle = 'rgba(240,230,200,0.35)'; ctx.lineWidth = max(1, 1.2 * s);
    for (i = 0; i < 3; i++) { if (h1(fi * 7 + i) < 0.4) continue; var sx = h1(fi * 13 + i) * w; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + (h1(fi + i) - 0.5) * w * 0.01, h); ctx.stroke(); }
    ctx.fillStyle = 'rgba(10,8,6,0.6)';
    for (i = 0; i < 6; i++) { var px = h1(fi * 3 + i * 17) * w, py = h1(fi * 5 + i * 23) * h, pr = w * 0.002 * (0.5 + h1(fi + i * 31) * 2); ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill(); }
  };
})();
