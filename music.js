/* LONG DUSK — procedural score & sound design.  window.LD_MUSIC
 * Everything is synthesized with Web Audio. No samples, no network.
 * Architecture: one shared reverb (generated IR) + master compressor.
 * Each cue is an "instance" with its own crossfade gains, a bar-level
 * lookahead scheduler, a voice registry (auto stop/disconnect) and a
 * global voice cap (~30). */
(function () {
  'use strict';

  var ctx = null, pre, hp, comp, master, musicBus, sfxBus, revIn, conv, revOut, irBuf;
  var noiseBuf = null, brownBuf = null, WAVES = {};
  var MAXV = 30, voices = 0, LOOK = 0.4;
  var insts = [], current = null, curName = 'silence', seedCtr = 1;
  var sfxList = [], timer = null, isOffline = false;

  /* ------------------------------------------------------------ utils */
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function rngFrom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  var PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function N(s) {
    var m = /^([A-G])(#|b)?(-?\d)$/.exec(s);
    if (!m) throw new Error('bad note ' + s);
    return 12 * (parseInt(m[3], 10) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  /* melody notation: "r1 A4:1 D5:1.5 | ..." -> bars of {b,m,d} (beats) */
  function P(str) {
    return str.split('|').map(function (bar) {
      var b = 0, out = [];
      bar.trim().split(/\s+/).forEach(function (tok) {
        if (!tok) return;
        var parts = tok.split(':'), name = parts[0], d = parts.length > 1 ? parseFloat(parts[1]) : 1;
        if (name[0] === 'r') { if (parts.length === 1 && name.length > 1) d = parseFloat(name.slice(1)); b += d; return; }
        out.push({ b: b, m: N(name), d: d }); b += d;
      });
      return out;
    });
  }
  /* chords: "D3 A3 F4 | Bb2 F3 ..." -> arrays of midi */
  function C(str) { return str.split('|').map(function (bar) { return bar.trim().split(/\s+/).map(N); }); }
  function tr(arr, k) { return arr.map(function (m) { return m + k; }); }

  /* -------------------------------------------------------- node utils */
  function G(v, to) { var g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  function F(type, freq, Q, to) {
    var f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    if (Q != null) f.Q.value = Q; if (to) f.connect(to); return f;
  }
  function O(type, freq) {
    var o = ctx.createOscillator();
    if (WAVES[type]) o.setPeriodicWave(WAVES[type]); else o.type = type;
    o.frequency.value = freq; return o;
  }
  function NZ(t, brown) {
    var s = ctx.createBufferSource(); s.buffer = brown ? brownBuf : noiseBuf; s.loop = true;
    s.start(t, Math.random() * 1.5); return s;
  }
  function dc(n) { try { n.disconnect(); } catch (e) { } }

  /* --------------------------------------------------- voice registry */
  function can(I, prio) { return !I.dead && (voices < MAXV || (prio && voices < MAXV + 6)); }
  function reg(I, srcs, nodes, end, w, pc) {
    w = w || 1; voices += w;
    var v = { s: srcs, n: nodes, w: w, pc: pc, I: I, done: false };
    I.voices.add(v);
    for (var i = 0; i < srcs.length; i++) srcs[i].stop(end);
    srcs[0].onended = function () { fin(v); };
    return v;
  }
  function fin(v) {
    if (v.done) return; v.done = true; voices -= v.w;
    if (v.I && v.I.voices) v.I.voices.delete(v);
    v.s.forEach(dc); v.n.forEach(dc);
    if (v.pc) v.pc.forEach(function (p) { try { p[0].disconnect(p[1]); } catch (e) { } });
  }
  function killV(v) { v.s.forEach(function (s) { try { s.stop(0); } catch (e) { } }); fin(v); }
  function vib(I, osc, deep) { var src = deep ? I.lfoG : I.lfoS; src.connect(osc.detune); return [src, osc.detune]; }

  /* ------------------------------------------------------- instruments
   * signature (I, ch, t, midi, durSec, vel, opts) */
  function epiano(I, ch, t, m, dur, vel) {
    if (!can(I, true)) return;
    var f = mtof(m), c = O('sine', f), md = O('sine', f), mg = G(0), g = G(0);
    mg.gain.setValueAtTime(f * (1.0 + vel * 1.6), t); mg.gain.setTargetAtTime(f * 0.18, t, 0.3);
    md.connect(mg); mg.connect(c.frequency);
    var pk = vel * 0.26 * (m > 76 ? 0.75 : 1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.006);
    g.gain.setTargetAtTime(pk * 0.3, t + 0.01, 0.7);
    var end = t + Math.max(dur, 0.05); g.gain.setTargetAtTime(0, end, 0.2);
    c.connect(g); g.connect(ch); c.start(t); md.start(t);
    reg(I, [c, md], [mg, g], end + 1.2);
  }
  function celesta(I, ch, t, m, dur, vel) {
    if (!can(I, true)) return;
    var f = mtof(m), o1 = O('sine', f), o2 = O('sine', f * 4.0), g2 = G(0), g = G(0);
    g2.gain.setValueAtTime(0.35, t); g2.gain.setTargetAtTime(0, t, 0.12);
    o2.connect(g2); g2.connect(g); o1.connect(g); g.connect(ch);
    var pk = vel * 0.2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.003);
    g.gain.setTargetAtTime(0, t + 0.004, 0.45 + Math.min(dur, 2) * 0.2);
    o1.start(t); o2.start(t); reg(I, [o1, o2], [g2, g], t + 3);
  }
  function pad(I, ch, t, notes, dur, vel, o) {
    o = o || {}; if (!can(I)) return;
    var att = Math.min(o.att || 1.2, dur * 0.6), rel = o.rel || 1.4, cut = o.cut || 1400;
    var f = F('lowpass', cut, 0.6), g = G(0), srcs = [], pc = [];
    if (o.swell) { f.frequency.setValueAtTime(cut * 0.2, t); f.frequency.linearRampToValueAtTime(cut, t + att); }
    var A = vel * 0.05 / Math.sqrt(Math.max(1, notes.length / 3));
    notes.forEach(function (m) {
      for (var k = 0; k < 2; k++) {
        var s = O('sawtooth', mtof(m)); s.detune.value = (k ? 1 : -1) * (4 + I.rng() * 5);
        s.connect(f); s.start(t); srcs.push(s); pc.push(vib(I, s, false));
      }
    });
    f.connect(g); g.connect(ch);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(A, t + att);
    g.gain.setTargetAtTime(0, t + dur, rel / 3);
    reg(I, srcs, [f, g], t + dur + rel * 1.6, notes.length, pc);
  }
  function bowed(I, ch, t, m, dur, vel, o) {
    o = o || {}; if (!can(I, !o.low)) return;
    var f = mtof(m), att = Math.min(o.att || 0.14, dur * 0.5);
    var s1 = O('sawtooth', f), s2 = O('sawtooth', f); s2.detune.value = 7;
    var lp = F('lowpass', Math.min(f * (o.bright || 4.5), 3200), 0.9), g = G(0);
    s1.connect(lp); s2.connect(lp); lp.connect(g); g.connect(ch);
    var pk = vel * 0.13;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + att);
    g.gain.setTargetAtTime(pk * 0.85, t + att, 0.4);
    var end = t + Math.max(dur, att + 0.02); g.gain.setTargetAtTime(0, end, o.rel || 0.12);
    s1.start(t); s2.start(t);
    reg(I, [s1, s2], [lp, g], end + (o.rel || 0.12) * 6, 1, [vib(I, s1, true), vib(I, s2, true)]);
  }
  function horn(I, ch, t, m, dur, vel, o) {
    o = o || {}; if (!can(I, !o.low)) return;
    var f = mtof(m), s = O('sawtooth', f), s2 = O('triangle', f * 1.003);
    var lp = F('lowpass', f * 1.2, 1.4), g = G(0);
    var top = Math.min(f * (2 + 4 * vel) * (o.bright || 1), 3400);
    lp.frequency.setValueAtTime(f * 1.2, t); lp.frequency.linearRampToValueAtTime(top, t + 0.09);
    lp.frequency.setTargetAtTime(Math.min(top, f * 2.6 * (o.bright || 1)), t + 0.1, 0.3);
    s.connect(lp); s2.connect(lp); lp.connect(g); g.connect(ch);
    var pk = vel * 0.16, att = Math.min(0.07, dur * 0.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + att);
    var end = t + Math.max(dur, att + 0.02); g.gain.setTargetAtTime(0, end, 0.1);
    s.start(t); s2.start(t);
    reg(I, [s, s2], [lp, g], end + 0.7, 1, [vib(I, s, false)]);
  }
  function organ(I, ch, t, m, dur, vel) {
    if (!can(I)) return;
    var o = O('organ', mtof(m)), g = G(0);
    o.connect(g); g.connect(ch);
    var pk = vel * 0.09;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.035);
    var end = t + Math.max(dur, 0.06); g.gain.setTargetAtTime(0, end, 0.05);
    o.start(t); reg(I, [o], [g], end + 0.4);
  }
  function bass(I, ch, t, m, dur, vel) {
    if (!can(I, true)) return;
    var f = mtof(m), o = O('bass', f), lp = F('lowpass', f * 8, 1), g = G(0);
    lp.frequency.setValueAtTime(f * 8, t); lp.frequency.setTargetAtTime(f * 2.5, t, 0.12);
    o.connect(lp); lp.connect(g); g.connect(ch);
    var pk = vel * 0.38;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.008);
    g.gain.setTargetAtTime(pk * 0.35, t + 0.01, 0.3);
    var end = t + Math.max(dur, 0.05); g.gain.setTargetAtTime(0, end, 0.05);
    o.start(t); reg(I, [o], [lp, g], end + 0.25);
  }
  function piano(I, ch, t, m, dur, vel) {
    if (!can(I, true)) return;
    var f = mtof(m), o = O('piano', f), lp = F('lowpass', 4000, 0.5), g = G(0);
    var top = Math.min(7000, f * (6 + vel * 8));
    lp.frequency.setValueAtTime(top, t); lp.frequency.setTargetAtTime(Math.max(f * 2.5, 500), t, 0.4);
    o.connect(lp); lp.connect(g); g.connect(ch);
    var pk = vel * 0.22 * (m > 72 ? 0.8 : 1);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.005, m > 70 ? 0.7 : 1.1);
    var end = t + Math.max(dur, 0.05); g.gain.setTargetAtTime(0, end, 0.09);
    o.start(t); reg(I, [o], [lp, g], end + 0.4);
  }
  /* retriggered mono pluck: one voice plays a whole bar of [time, midi, vel] steps */
  function pluckSeq(I, ch, t, steps, end) {
    if (!can(I) || !steps.length) return;
    var o = O('square', mtof(steps[0][1])), lp = F('lowpass', 2500, 2.5), g = G(0);
    o.connect(lp); lp.connect(g); g.connect(ch);
    g.gain.setValueAtTime(0, t);
    steps.forEach(function (st) {
      var ts = st[0], f = mtof(st[1]), v = st[2];
      o.frequency.setValueAtTime(f, ts);
      lp.frequency.setValueAtTime(Math.min(1200 + 2600 * v, 4500), ts); lp.frequency.setTargetAtTime(f * 1.5 + 200, ts, 0.06);
      g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(v * 0.075, ts + 0.003); g.gain.setTargetAtTime(0, ts + 0.004, 0.13);
    });
    o.start(t); reg(I, [o], [lp, g], end + 0.5);
  }
  function lead(I, ch, t, m, dur, vel) {
    if (!can(I, true)) return;
    var f = mtof(m), o = O('reed', f), lp = F('lowpass', 1500, 2), g = G(0);
    o.frequency.setValueAtTime(f * 0.955, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    o.connect(lp); lp.connect(g); g.connect(ch);
    var pk = vel * 0.14;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + 0.045);
    g.gain.setTargetAtTime(pk * 0.8, t + 0.05, 0.3);
    var end = t + Math.max(dur, 0.07); g.gain.setTargetAtTime(0, end, 0.07);
    o.start(t); reg(I, [o], [lp, g], end + 0.5, 1, [vib(I, o, true)]);
  }
  function taiko(I, ch, t, vel, size) {
    if (!can(I, true)) return;
    size = size || 1;
    var o = O('sine', 130 / size), g = G(0), n = NZ(t), nl = F('lowpass', 800 / size, 0.7), ng = G(0);
    o.frequency.setValueAtTime(140 / size, t); o.frequency.exponentialRampToValueAtTime(46 / size, t + 0.3);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.75, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.01, 0.22 * size);
    ng.gain.setValueAtTime(vel * 0.5, t); ng.gain.setTargetAtTime(0, t, 0.035);
    o.connect(g); g.connect(ch); n.connect(nl); nl.connect(ng); ng.connect(ch);
    o.start(t); reg(I, [o, n], [g, nl, ng], t + 1.6 * size);
  }
  function timp(I, ch, t, m, vel) {
    if (!can(I, true)) return;
    var f = mtof(m), o1 = O('sine', f), o2 = O('sine', f * 1.5), g2 = G(0.35), g = G(0);
    o1.frequency.setValueAtTime(f * 1.04, t); o1.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    o2.connect(g2); g2.connect(g); o1.connect(g); g.connect(ch);
    var n = NZ(t), nl = F('lowpass', 500, 0.7), ng = G(0);
    ng.gain.setValueAtTime(vel * 0.25, t); ng.gain.setTargetAtTime(0, t, 0.03);
    n.connect(nl); nl.connect(ng); ng.connect(ch);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.005);
    g.gain.setTargetAtTime(0, t + 0.01, 0.65);
    o1.start(t); o2.start(t); reg(I, [o1, o2, n], [g2, g, nl, ng], t + 3.5);
  }
  function ticks(I, ch, t, hits) { // hits: [[time, vel, hi]]
    if (!can(I) || !hits.length) return;
    var n = NZ(t), b1 = F('bandpass', 4200, 6), b2 = F('bandpass', 2700, 6), g1 = G(0), g2 = G(0);
    n.connect(b1); b1.connect(g1); g1.connect(ch); n.connect(b2); b2.connect(g2); g2.connect(ch);
    g1.gain.setValueAtTime(0, t); g2.gain.setValueAtTime(0, t);
    var last = t;
    hits.forEach(function (h) { var g = h[2] ? g1 : g2; g.gain.setValueAtTime(h[1] * 0.9, h[0]); g.gain.setTargetAtTime(0, h[0] + 0.001, 0.011); last = Math.max(last, h[0]); });
    reg(I, [n], [b1, b2, g1, g2], last + 0.12);
  }
  function bell(I, ch, t, f, vel, decay, ratio) {
    if (!can(I)) return;
    var c = O('sine', f), md = O('sine', f * (ratio || 1.414)), mg = G(0), g = G(0);
    mg.gain.setValueAtTime(f * 1.6, t); mg.gain.setTargetAtTime(f * 0.15, t, decay * 0.25);
    md.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(ch);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.14, t + 0.006);
    g.gain.setTargetAtTime(0, t + 0.01, decay / 4);
    c.start(t); md.start(t); reg(I, [c, md], [mg, g], t + decay * 1.2 + 0.2);
  }

  /* persistent drone: two saws + sub, slowly breathing lowpass */
  function drone(I, ch, m, lvl, cut) {
    var f = mtof(m), t = ctx.currentTime;
    var s1 = O('sawtooth', f), s2 = O('sawtooth', f * 1.0035), sub = O('sine', f / 2);
    var lp = F('lowpass', cut, 1.2), lfo = O('sine', 0.045 + I.rng() * 0.04), lg = G(cut * 0.45), g = G(0), sg = G(0.6);
    lfo.connect(lg); lg.connect(lp.frequency);
    s1.connect(lp); s2.connect(lp); sub.connect(sg); sg.connect(g); lp.connect(g); g.connect(ch);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl * 0.09, t + 3);
    [s1, s2, sub, lfo].forEach(function (o) { o.start(t); });
    voices += 2;
    I.persist.push({ s: [s1, s2, sub, lfo], n: [lp, lg, g, sg], w: 2 });
  }
  /* persistent mono formant voice (hummed / sung) */
  var VOW = {
    mm: [[260, 1000, 2300], [1.0, 0.08, 0.02]],
    oo: [[310, 870, 2250], [1.0, 0.3, 0.06]],
    oh: [[500, 860, 2400], [1.0, 0.45, 0.08]],
    ah: [[720, 1100, 2450], [1.0, 0.5, 0.12]]
  };
  function mono(I, ch, lvl) {
    var t = ctx.currentTime, o1 = O('sawtooth', 220), o2 = O('sawtooth', 220); o2.detune.value = 9;
    var mix = G(0.5), pl = F('lowpass', 2600, 0.5), amp = G(0), Fs = [], Gs = [], Q = [5, 9, 12];
    o1.connect(mix); o2.connect(mix); mix.connect(pl);
    for (var i = 0; i < 3; i++) {
      Fs[i] = F('bandpass', VOW.mm[0][i], Q[i]); Gs[i] = G(VOW.mm[1][i] * 4);
      pl.connect(Fs[i]); Fs[i].connect(Gs[i]); Gs[i].connect(amp);
    }
    amp.connect(ch); o1.start(t); o2.start(t);
    var pc = [vib(I, o1, true), vib(I, o2, true)];
    voices += 1;
    I.persist.push({ s: [o1, o2], n: [mix, pl, amp].concat(Fs, Gs), w: 1, pc: pc });
    return {
      note: function (t0, m, dur, vel, vw, leg) {
        var f = mtof(m);
        o1.frequency.setTargetAtTime(f, t0, 0.035); o2.frequency.setTargetAtTime(f, t0, 0.035);
        var V = VOW[vw || 'oo'];
        for (var i = 0; i < 3; i++) {
          Fs[i].frequency.setTargetAtTime(V[0][i], t0, 0.06);
          Gs[i].gain.setTargetAtTime(V[1][i] * 4, t0, 0.06);
        }
        amp.gain.setTargetAtTime(vel * lvl, t0, 0.06);
        if (!leg) amp.gain.setTargetAtTime(0, t0 + Math.max(0.1, dur - 0.08), 0.07);
      }
    };
  }

  /* ---------------------------------------------------- cue machinery */
  function chan(I, name, pan, rev, lvl) {
    if (I.ch[name]) return I.ch[name];
    var g = G(lvl == null ? 1 : lvl), p = ctx.createStereoPanner(); p.pan.value = pan || 0;
    g.connect(p); p.connect(I.out);
    if (rev > 0) { var s = G(rev); p.connect(s); s.connect(I.rout); I.chn.push(s); }
    I.chn.push(g, p); I.ch[name] = g; return g;
  }
  function sec(I) {
    if (!I.cur || I.sb >= I.cur.len) {
      I.cur = I.def.next(I, I.cur ? I.cur.name : null); I.sb = 0; I.nsec = (I.nsec || 0) + 1;
      I.secV = I.rng();
    }
    return I.sb++;
  }
  /* list of [name,len,weight]; avoids immediate repeat */
  function choose(I, list, last) {
    var c = list.filter(function (x) { return x[0] !== last; }), tot = 0;
    c.forEach(function (x) { tot += (x[2] || 1); });
    var r = I.rng() * tot;
    for (var i = 0; i < c.length; i++) { r -= (c[i][2] || 1); if (r <= 0) return { name: c[i][0], len: c[i][1] }; }
    return { name: c[0][0], len: c[0][1] };
  }
  function mel(I, inst, ch, t, bar, o) {
    o = o || {}; if (!bar) return;
    var spb = o.spb || I.spb;
    bar.forEach(function (e, i) {
      if (o.drop && i > 0 && I.rng() < o.drop) return;
      var b = e.b;
      if (o.swing && Math.abs(b % 1 - 0.5) < 0.01) b += 0.16;
      var st = t + b * spb + I.rng() * 0.014;
      inst(I, ch, st, e.m + (o.tr || 0), e.d * spb * (o.leg || 0.96), (o.vel || 0.7) * (0.88 + I.rng() * 0.18), o.io);
    });
  }

  function makeInst(name) {
    var def = CUES[name], now = ctx.currentTime;
    var I = { name: name, def: def, voices: new Set(), persist: [], ch: {}, chn: [], st: {}, dead: false, fading: false };
    I.rng = rngFrom(hash(name) + (seedCtr++) * 7919);
    I.out = G(0, musicBus); I.rout = G(0, revIn);
    I.lfo = O('sine', 4.6 + I.rng() * 0.8); I.lfoG = G(9); I.lfoS = G(3);
    I.lfo.connect(I.lfoG); I.lfo.connect(I.lfoS); I.lfo.start(now);
    I.spb = 60 / def.bpm; I.barDur = (def.beats || 4) * I.spb;
    I.next = now + 0.08; I.n = 0;
    if (def.init) def.init(I);
    return I;
  }
  function killInst(I) {
    if (I.dead) return; I.dead = true;
    try { I.out.gain.cancelScheduledValues(0); I.out.gain.value = 0; I.rout.gain.cancelScheduledValues(0); I.rout.gain.value = 0; } catch (e) { }
    dc(I.out); dc(I.rout);
    Array.from(I.voices).forEach(killV);
    I.persist.forEach(function (p) {
      p.s.forEach(function (s) { try { s.stop(0); } catch (e) { } dc(s); });
      p.n.forEach(dc);
      if (p.pc) p.pc.forEach(function (q) { try { q[0].disconnect(q[1]); } catch (e) { } });
      voices -= p.w;
    });
    I.persist = [];
    try { I.lfo.stop(0); } catch (e) { }
    dc(I.lfo); dc(I.lfoG); dc(I.lfoS); I.chn.forEach(dc);
    var k = insts.indexOf(I); if (k >= 0) insts.splice(k, 1);
  }
  function rampTo(param, v, now, f) {
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else { var cur = param.value; param.cancelScheduledValues(now); param.setValueAtTime(cur, now); }
    param.linearRampToValueAtTime(v, now + f);
  }

  function tickAll() {
    if (!ctx) return;
    var now = ctx.currentTime;
    insts.slice().forEach(function (I) {
      if (I.killAt && now >= I.killAt) { killInst(I); return; }
      if (I.fading || I.dead) return;
      if (I.next < now + 0.02) I.next = now + 0.05;
      var guard = 0;
      while (I.next < now + LOOK && guard++ < 4) {
        var d = 0;
        try { d = I.def.bar(I, I.next, I.n); } catch (e) { if (window.console) console.warn('[LD_MUSIC] ' + I.name, e); }
        I.n++; I.next += (d || I.barDur);
      }
    });
    for (var i = sfxList.length - 1; i >= 0; i--) {
      if (now > sfxList[i].end) { cleanSfx(sfxList[i]); sfxList.splice(i, 1); }
    }
  }

  /* ================================================================ THEMES */
  // Ilse — D minor, sparse, restrained
  var ILSE_A = P('r1 A4:1 D5:1.5 C5:.5 | A4:3 | r1 G4:1 Bb4:1.5 A4:.5 | F4:3 | r1 E4:1 F4:1 G4:1 | A4:2 E4:2 | F4:1 D4:3 | ');
  var ILSE_A_CH = C('D3 A3 E4 F4 | Bb2 F3 A3 D4 | G2 D3 F3 A3 Bb3 | F2 C3 A3 D4 | C3 G3 D4 E4 | A2 E3 G3 C#4 | D3 A3 E4 F4 | Bb2 F3 A3 C4 E4');
  var ILSE_B = P('r1 D5:1 F5:1.5 E5:.5 | D5:3 | r1 C5:1 D5:1 Bb4:1 | A4:4 | r1 G4:1 A4:1 Bb4:1 | A4:2 G4:1 E4:1 | D4:4 | ');
  var ILSE_B_CH = C('Bb2 F3 A3 D4 | G2 D3 F3 A3 | Eb3 Bb3 D4 G4 | A2 D3 F3 A3 | G2 D3 F3 Bb3 | A2 E3 G3 C#4 | D3 A3 E4 F4 | D2 A2 F3 C4 E4');
  // Ilse in D major (finale bloom)
  var ILSE_AM = P('r1 A4:1 D5:1.5 C#5:.5 | A4:3 | r1 G4:1 B4:1.5 A4:.5 | F#4:3 | r1 E4:1 F#4:1 G4:1 | A4:2 E4:2 | F#4:1 D4:3 | ');
  var ILSE_AM_CH = C('D3 A3 E4 F#4 | G2 D3 F#3 B3 | E2 B2 D3 F#3 G3 | F#2 A3 D4 | E2 B2 D3 G3 | A2 E3 G3 C#4 | D3 A3 F#4 | G2 D3 F#3 A3 B3');
  var ILSE_BM = P('r1 D5:1 F#5:1.5 E5:.5 | D5:3 | r1 C#5:1 D5:1 B4:1 | A4:4 | r1 G4:1 A4:1 B4:1 | A4:2 G4:1 E4:1 | D4:4 | ');
  var ILSE_BM_CH = C('G2 D3 F#3 B3 | E2 B2 D3 G3 | B2 F#3 A3 D4 | A2 D3 F#3 A3 | E2 B2 D3 G3 | A2 E3 G3 C#4 | D3 A3 E4 F#4 | D2 A2 F#3 A3 E4');
  // Kasimir — G, warm, open fifths, cello
  var K_A = P('G2:2 D3:2 | E3:1.5 D3:.5 C3:1 D3:1 | G3:3 F3:1 | D3:4 | C3:2 G3:2 | F3:1.5 E3:.5 D3:1 C3:1 | Bb2:2 C3:1 D3:1 | G2:4');
  var K_A_CH = C('G1 D2 G2 | C2 G2 E3 | G1 D2 C3 F3 | Bb1 F2 D3 | C2 G2 D3 | F1 C2 A2 | Bb1 F2 D3 | G1 D2 G2');
  var K_B = P('D3:2 G3:2 | A3:1.5 G3:.5 F3:1 D3:1 | C3:2 D3:1 F3:1 | G3:4 | Bb3:2 A3:1 G3:1 | F3:2 D3:2 | C3:1 D3:1 E3:1 F#3:1 | G3:4');
  var K_B_CH = C('Eb2 Bb2 G3 | F1 C2 A2 | C2 G2 D3 | G1 D2 A2 | Eb2 Bb2 D3 | Bb1 F2 D3 | D2 A2 C3 | G1 D2 B2');
  // Kasimir counterline against Ilse (his head motif: fifth up, dotted fall)
  var KC_A = P('D3:2 A3:2 | Bb3:1.5 A3:.5 F3:1 D3:1 | G2:2 D3:2 | F3:3 E3:1 | C3:2 G3:2 | A3:1.5 G3:.5 E3:1 C#3:1 | D3:3 A2:1 | Bb2:4');
  var KC_AM = P('D3:2 A3:2 | B3:1.5 A3:.5 F#3:1 D3:1 | E3:2 B3:2 | A3:3 F#3:1 | E3:2 B3:2 | A3:1.5 G3:.5 E3:1 C#3:1 | D3:3 A2:1 | G2:4');
  var ILSE_HEAD = P('A4:1 D5:1.5 C5:.5 A4:1')[0];
  // Severin — C minor passacaglia, low brass over organ
  var SEV_A = P('G3:3 Ab3:1 | G3:2 F3:1 Eb3:1 | D3:2 C3:1 D3:1 | B2:4');
  var SEV_A_CH = C('C3 G3 C4 Eb4 | Bb2 D3 G3 Bb3 | Ab2 C3 D3 F3 | G2 B2 D3 F3');
  var SEV_A_G = [N('C2'), N('Bb1'), N('Ab1'), N('G1')];
  var SEV_B = P('Eb3:3 F3:1 | G3:2 Ab3:1 G3:1 | F3:2 Eb3:1 D3:1 | C3:4');
  var SEV_B_CH = C('Ab2 C3 Eb3 G3 | G2 Bb2 Eb3 G3 | Bb2 D3 F3 Ab3 | C3 Eb3 G3 C4');
  var SEV_B_G = [N('Ab1'), N('G1'), N('Bb1'), N('C2')];
  // Mira — E minor, restless
  var MIRA_CH = C('E3 B3 D4 F#4 G4 | C3 G3 B3 E4 | B2 G3 D4 E4 | F#2 A3 D4 F#4 | A2 E3 G3 B3 C4 | C3 G3 B3 E4 | B2 F#3 B3 E4 | B2 F#3 A3 D#4');
  var MIRA_LIFT = C('A2 E3 G3 B3 C4 | C3 G3 B3 E4 | E3 B3 D4 F#4 G4 | B2 F#3 A3 D#4');
  var MIRA_M = P('B4:1.5 E5:.5 F#5:1 G5:1 | E5:4 | D5:1.5 E5:.5 G5:1 B5:1 | A5:2 F#5:2 | E5:1.5 G5:.5 A5:1 C6:1 | B5:2 G5:1 E5:1 | F#5:2 E5:1 B4:1 | D#5:4');
  var ARP_PATS = [[0, 1, 2, 1, 2, 3, 2, 4, 0, 1, 2, 1, 2, 3, 4, 5], [0, 2, 4, 1, 3, 5, 2, 4, 5, 3, 1, 4, 2, 0, 3, 1], [4, 2, 0, 5, 3, 1, 4, 2, 0, 2, 4, 1, 3, 5, 3, 1]];
  // Shelf work song "Cold Hands Haul" — A dorian
  var SHELF_V1 = P('E4:1 D4:1 A3:2 | E4:1 G4:1 A4:2 | G4:1 E4:.5 D4:.5 E4:1 C4:1 | D4:1 B3:.5 C4:.5 A3:2');
  var SHELF_V2 = P('A4:1 A4:1 G4:1 E4:1 | F#4:1 E4:1 D4:2 | E4:1 G4:1 A4:1.5 G4:.5 | E4:4');
  var SHELF_R = P('A4:1.5 G4:.5 F#4:1 E4:1 | D4:2 E4:2 | C4:1 D4:1 E4:1 G4:1 | A3:4');
  // Hall chorale — Bb major SATB
  var HALL = {
    S: P('F4:2 Bb4:2 | A4:1 G4:1 F4:2 | Eb4:2 G4:2 | F4:4 | D4:2 Eb4:1 F4:1 | G4:2 C5:2 | Bb4:2 A4:2 | Bb4:4'),
    A: P('D4:2 D4:2 | C4:1 Eb4:1 D4:2 | C4:2 Eb4:2 | C4:4 | Bb3:2 C4:1 D4:1 | Eb4:2 Eb4:2 | D4:2 C4:2 | D4:4'),
    T: P('Bb3:2 F3:2 | F3:1 Bb3:1 Bb3:2 | G3:2 Bb3:2 | A3:4 | F3:2 G3:1 Bb3:1 | Bb3:2 G3:2 | F3:2 Eb3:2 | D3:4'),
    B: P('Bb2:2 D3:2 | F3:1 Eb3:1 D3:2 | C3:2 Eb3:2 | F2:4 | Bb2:2 C3:1 D3:1 | Eb3:2 C3:2 | F2:2 F2:2 | Bb1:4'),
    D: P('D5:2 F5:2 | F5:2 D5:2 | G5:2 G5:2 | F5:4 | F5:2 G5:1 A5:1 | Bb5:2 G5:2 | F5:2 Eb5:2 | D5:4')
  };
  // Resolve — D minor rising, F major
  var RES_A = P('D4:2 A4:2 | Bb4:1.5 A4:.5 F4:1 D4:1 | F4:2 C5:2 | C5:2 G4:2 | A4:2 D5:2 | D5:1.5 C5:.5 Bb4:1 F4:1 | G4:2 Bb4:1 D5:1 | C#5:4');
  var RES_A_CH = C('D2 A2 D3 F3 A3 | Bb1 F2 D3 F3 Bb3 | F2 C3 F3 A3 C4 | C2 G2 E3 G3 C4 | D2 A2 D3 F3 A3 | Bb1 F2 D3 F3 Bb3 | G2 D3 G3 Bb3 D4 | A1 E2 C#3 E3 A3');
  var RES_B = P('C5:2 F5:2 | E5:1.5 D5:.5 C5:2 | D5:2 A4:2 | Bb4:3 F4:1 | G4:1.5 A4:.5 Bb4:1 D5:1 | C5:2 E5:2 | F5:3 E5:.5 D5:.5 | C#5:2 E5:2');
  var RES_B_CH = C('F2 C3 F3 A3 C4 | E2 C3 E3 G3 C4 | D2 A2 D3 F3 A3 | Bb1 F2 D3 F3 Bb3 | G2 D3 F3 Bb3 D4 | C2 G2 E3 G3 C4 | F2 C3 F3 A3 C4 | A1 E2 C#3 E3 A3');
  // Tension / incident / dusk
  var TEN_CH = C('A3 E4 F4 | Bb3 D4 F#4 | G3 Bb3 Eb4 | Ab3 C4 Eb4');
  var TEN_PATS = [[0, 0, 12, 0, 0, 1, 0, 12], [0, 0, 0, 3, 0, 0, 1, 0], [0, 12, 0, 0, 13, 0, 12, 1]];
  var CLUSTERS = C('C3 C#3 G3 Ab3 D4 | D2 Eb3 A3 Bb3 E4 | F2 F#3 C4 C#4 G4 | Bb1 B2 F3 E4 F4');
  var TAIKO_PATS = ['x..x..x.', 'x.x.xxx.', 'x...x.x.', 'xx..x..x', 'x..xx.x.'];
  var DUSK_SW = C('A2 E3 B3 C4 | F2 C3 G3 B3 E4 | D3 A3 E4 G4');
  var DUSK_PARTIALS = [1, 1.19, 1.5, 2.01, 2.38, 2.76, 3.17];
  // Jazz
  var QUAL = { 'm7': [0, 3, 7, 10], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], '9': [0, 4, 7, 10, 14], '7b9': [0, 4, 7, 10, 13], 'm7b5': [0, 3, 6, 10] };
  var ROOTLESS = { 'm7': [3, 7, 10, 14], '7': [4, 9, 10, 14], 'maj7': [4, 7, 11, 14], '9': [4, 9, 10, 14], '7b9': [4, 7, 10, 13], 'm7b5': [3, 6, 10, 12] };
  var POOL = { 'm7': [0, 3, 7, 10, 2], '7': [0, 4, 7, 10, 2], 'maj7': [0, 4, 7, 11, 2], '9': [0, 4, 7, 10, 2], '7b9': [0, 4, 7, 10, 1], 'm7b5': [0, 3, 6, 10] };
  function CS(sym) { var m = /^([A-G][b#]?)(.*)$/.exec(sym); return { pc: ((N(m[1] + '4') % 12) + 12) % 12, q: m[2] }; }
  function FORM(arr) { return arr.map(function (b) { return b.split(' ').map(CS); }); }
  var JAZZ = FORM(['Fm7', 'Bb7', 'Ebmaj7', 'Cm7', 'Fm7', 'Bb7', 'Gm7 C7', 'Fm7 Bb7', 'Abmaj7', 'Db9', 'Gm7', 'C7b9', 'Fm7', 'Bb7', 'Ebmaj7', 'C7b9']);
  var JAZZ_HEAD = P('C5:1 Ab4:.5 G4:.5 F4:2 | D5:1.5 C5:.5 Ab4:2 | G4:3 Bb4:1 | G4:2 Eb4:2 | C5:1 Ab4:.5 G4:.5 F4:1 Ab4:1 | D5:1 F5:1 D5:1.5 C5:.5 | Bb4:2 E4:1.5 G4:.5 | F4:4');
  var BLUES = FORM(['F7', 'Bb7', 'F7', 'F7', 'Bb7', 'Bb7', 'F7', 'F7', 'C7', 'Bb7', 'F7', 'C7']);
  var LICKS = [
    P('C5:.5 Eb5:.5 F5:1 Eb5:.5 C5:1.5')[0], P('F4:.5 Ab4:.5 A4:1 C5:2')[0], P('Eb5:1 C5:.5 Bb4:.5 Ab4:.5 F4:1.5')[0],
    P('A4:.5 C5:.5 D5:.5 Eb5:1 D5:.5 C5:1')[0], P('F5:1.5 Eb5:.5 C5:.5 Bb4:.5 C5:1')[0], P('C5:2 Ab4:.5 A4:.5 F4:1')[0],
    P('r.5 Bb4:.5 C5:.5 Eb5:.5 F5:2')[0], P('Ab4:.5 A4:.5 C5:1 Bb4:.5 Ab4:.5 F4:1')[0]
  ];
  var COMP_R1 = [[0.66], [1.66, 3], [0.66, 2.66], [2, 3.66], [1, 2.66], [3.66]];

  function bassRoot(c) { return 31 + ((c.pc - 7 + 12) % 12); }
  function voicing(c, lo) {
    var ints = ROOTLESS[c.q] || ROOTLESS['7'], base = 48 + c.pc;
    while (base + ints[0] < lo) base += 12;
    while (base + ints[0] >= lo + 12) base -= 12;
    return ints.map(function (i) { return base + i; });
  }
  function nearestPool(c, target) {
    var pool = POOL[c.q] || POOL['7'], best = target, bd = 99;
    for (var k = -6; k <= 6; k++) {
      var m = target + k, pc = ((m - c.pc) % 12 + 12) % 12;
      if (pool.indexOf(pc) >= 0 && Math.abs(k) < bd) { bd = Math.abs(k); best = m; }
    }
    return best;
  }
  function chordAt(bar, beat) { return bar.length > 1 && beat >= 2 ? bar[1] : bar[0]; }
  function walkBar(I, ch, t, bar, nextBar, vel) {
    var segs = bar.length > 1 ? [[bar[0], 0, 2, bar[1]], [bar[1], 2, 2, nextBar[0]]] : [[bar[0], 0, 4, nextBar[0]]];
    var prev = I.st.lastBass || bassRoot(bar[0]);
    segs.forEach(function (s) {
      var c = s[0], k = s[2], r = bassRoot(c), nr = bassRoot(s[3]);
      for (var i = 0; i < k; i++) {
        var m;
        if (i === 0) m = (Math.abs(r + 12 - prev) < Math.abs(r - prev) && r + 12 <= 46) ? r + 12 : r;
        else if (i === k - 1) m = I.rng() < 0.6 ? nr + (I.rng() < 0.5 ? 1 : -1) : nr + 7 - (nr + 7 > 46 ? 12 : 0);
        else {
          var q = QUAL[c.q] || QUAL['7'], opts = [q[1], q[2], q[3], 12, 14 - (c.q === 'm7' ? 0 : 0)];
          m = r + opts[Math.floor(I.rng() * opts.length)];
          if (m > 48) m -= 12;
        }
        if (m < 28) m += 12;
        bass(I, ch, t + (s[1] + i) * I.spb + I.rng() * 0.01, m, I.spb * 0.85, vel * (i === 0 ? 1 : 0.85));
        prev = m;
      }
    });
    I.st.lastBass = prev;
  }
  /* one noise voice per bar: brush swishes + ride taps on two filtered paths */
  function brushes(I, ch, t, vel) {
    if (!can(I)) return;
    var spb = I.spb, n = NZ(t), bp = F('bandpass', 3800, 0.5), bg = G(0), hpf = F('highpass', 6500, 0.7), rg = G(0);
    n.connect(bp); bp.connect(bg); bg.connect(ch); n.connect(hpf); hpf.connect(rg); rg.connect(ch);
    bg.gain.setValueAtTime(0, t); rg.gain.setValueAtTime(0, t);
    for (var i = 0; i < 4; i++) {
      var tb = t + i * spb, a = vel * (i % 2 ? 1 : 0.65);
      bg.gain.setValueAtTime(0, tb); bg.gain.linearRampToValueAtTime(a * 0.075, tb + 0.035); bg.gain.setTargetAtTime(0, tb + 0.04, spb * 0.3);
      rg.gain.setValueAtTime(vel * (i % 2 ? 0.8 : 1) * 0.05, tb + 0.004); rg.gain.setTargetAtTime(0, tb + 0.005, 0.09);
      if (i % 2 && I.rng() < 0.8) { var ts = tb + 0.66 * spb; rg.gain.setValueAtTime(vel * 0.03, ts); rg.gain.setTargetAtTime(0, ts + 0.001, 0.08); }
    }
    reg(I, [n], [bp, bg, hpf, rg], t + 4 * spb + 0.3);
  }
  function improvBar(I, ch, t, bar, vel, swing) {
    var n = 3 + Math.floor(I.rng() * 5), start = Math.floor(I.rng() * 4), p = I.st.rh || 74;
    for (var j = 0; j < n; j++) {
      var e = start + j; if (e >= 8) break;
      var beat = e * 0.5, c = chordAt(bar, beat);
      var step = [-2, -1, -1, 1, 1, 2, 3, -3][Math.floor(I.rng() * 8)];
      p = nearestPool(c, p + step * 2);
      if (p > 84) p -= 12; if (p < 63) p += 12;
      var bb = beat + (swing && e % 2 ? 0.16 : 0);
      var last = j === n - 1 || e === 7;
      piano(I, ch, t + bb * I.spb, p, I.spb * (last ? 1.4 : 0.45), vel * (e % 2 ? 0.8 : 1));
    }
    I.st.rh = p;
  }

  /* ================================================================== CUES */
  var CUES = {};

  CUES.main_title = {
    bpm: 60, beats: 4, lvl: 1,
    init: function (I) { drone(I, chan(I, 'dr', 0, 0.3, 1), 26, 0.55, 220); },
    next: function (I, last) {
      if (!last) return { name: 'open', len: 4 };
      return choose(I, [['brass', 8, 3], ['strings', 8, 3], ['brass2', 8, 2], ['open', 4, 1]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, bd = I.barDur;
      var pd = chan(I, 'pad', -0.15, 0.5, 1), hn = chan(I, 'hn', 0.1, 0.45, 1), cel = chan(I, 'cel', 0.3, 0.6, 1);
      var vl = chan(I, 'vl', 0.15, 0.5, 1), lo = chan(I, 'lo', -0.1, 0.3, 1), dr = chan(I, 'drm', 0, 0.45, 1);
      if (s === 'open') {
        var OPEN = C('D2 A2 D3 F3 | D2 A2 E3 F3 | Bb1 F2 D3 F3 | A1 E2 C#3 E3');
        pad(I, pd, t, OPEN[b], bd + 0.5, 0.55, { att: 2.5, swell: true, cut: 1000 });
        if (b === 0) taiko(I, dr, t, 0.8, 1.6);
        if (b === 3) for (var k = 0; k < 8; k++) timp(I, dr, t + 2 + k * 0.25, 38, 0.08 + k * 0.05);
        for (var g = 0; g < 2; g++) if (I.rng() < 0.6) celesta(I, cel, t + I.rng() * 3.5, [74, 77, 81, 84, 86, 88][Math.floor(I.rng() * 6)], 1, 0.35);
        return;
      }
      var mA = s === 'strings' ? ILSE_B : ILSE_A, ch = s === 'strings' ? ILSE_B_CH : ILSE_A_CH;
      var chord = ch[b];
      pad(I, pd, t, chord.slice(1), bd + 0.6, s === 'brass2' ? 0.75 : 0.6, { att: 1.0, cut: s === 'brass2' ? 1900 : 1400 });
      bowed(I, lo, t, chord[0] - 12, bd * 0.98, 0.5, { att: 0.4, low: true, bright: 3 });
      if (s === 'brass') mel(I, horn, hn, t, mA[b], { tr: -12, vel: 0.85 });
      else if (s === 'strings') {
        mel(I, bowed, vl, t, mA[b], { vel: 0.75, io: { att: 0.25, bright: 3.5 } });
        if (I.secV < 0.6) mel(I, celesta, cel, t, mA[b], { tr: 12, vel: 0.35 });
      } else {
        mel(I, horn, hn, t, mA[b], { vel: 0.8, io: { bright: 1.2 } });
        mel(I, horn, hn, t, mA[b], { tr: -12, vel: 0.5 });
        var up = chord.slice(1).map(function (m) { return m + 12; });
        for (var e = 0; e < 8; e++) if (I.rng() < 0.7) celesta(I, cel, t + e * I.spb / 2, up[e % up.length] + (e > 3 ? 12 : 0), 0.5, 0.3);
        if (b % 4 === 0) taiko(I, dr, t, 0.6, 1.4);
      }
      if ((s === 'brass') && (b === 0 || b === 4)) timp(I, dr, t, chord[0] < 45 ? chord[0] : chord[0] - 12, 0.5);
    }
  };

  CUES.ilse_theme = {
    bpm: 60, beats: 4, lvl: 1,
    next: function (I, last) {
      if (!last) return { name: 'intro', len: 2 };
      return choose(I, [['A', 8, 3], ['B', 8, 3], ['A2', 8, 2], ['breath', 4, 1]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, bd = I.barDur;
      var pd = chan(I, 'pad', -0.2, 0.45, 1), ep = chan(I, 'ep', 0.15, 0.4, 1), cel = chan(I, 'cel', 0.3, 0.6, 1), lo = chan(I, 'lo', -0.05, 0.3, 1);
      var CH = s === 'B' ? ILSE_B_CH : ILSE_A_CH, idx = s === 'intro' ? [0, 7][b] : s === 'breath' ? [0, 1, 4, 5][b] : b;
      var chord = CH[idx];
      pad(I, pd, t, chord.slice(1), bd + 0.6, 0.42, { att: 1.4, cut: 1100 });
      bowed(I, lo, t, chord[0] - 12, bd, 0.35, { att: 0.6, low: true, bright: 2.5 });
      if (s === 'A') mel(I, epiano, ep, t, ILSE_A[b], { vel: 0.62, drop: 0.06 });
      else if (s === 'B') mel(I, epiano, ep, t, ILSE_B[b], { vel: 0.6, drop: 0.06 });
      else if (s === 'A2') {
        mel(I, celesta, cel, t, ILSE_A[b], { vel: 0.6 });
        var lh = chord.slice(0, 3);
        [0, 1.5, 3].forEach(function (bb, i) { if (I.rng() < 0.75) epiano(I, ep, t + bb * I.spb, lh[i] + 12 * (i ? 0 : 1), I.spb * 1.2, 0.3); });
      } else if (s === 'breath') {
        if (I.rng() < 0.7) epiano(I, ep, t + I.spb * (1 + Math.floor(I.rng() * 2)), chord[chord.length - 1] + 12, I.spb * 2, 0.4);
      }
      if (s !== 'intro' && I.rng() < 0.22) celesta(I, cel, t + 3.5 * I.spb, chord[1 + Math.floor(I.rng() * (chord.length - 1))] + 24, 1, 0.25);
    }
  };

  CUES.kasimir_theme = {
    bpm: 54, beats: 4, lvl: 1,
    init: function (I) { drone(I, chan(I, 'dr', 0, 0.2, 1), 31, 0.45, 200); },
    next: function (I, last) {
      if (!last) return { name: 'intro', len: 2 };
      return choose(I, [['A', 8, 3], ['B', 8, 3], ['Ahorn', 8, 2], ['breath', 4, 1]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, bd = I.barDur;
      var pd = chan(I, 'pad', -0.2, 0.45, 1), vc = chan(I, 'vc', 0.1, 0.4, 1.15), hn = chan(I, 'hn', -0.1, 0.5, 1), pn = chan(I, 'pn', 0.25, 0.5, 1);
      var CH = s === 'B' ? K_B_CH : K_A_CH, idx = s === 'intro' ? [0, 3][b] : s === 'breath' ? [0, 4, 2, 7][b] : b;
      var chord = CH[idx];
      pad(I, pd, t, chord.map(function (m) { return m + 12; }), bd + 0.6, 0.5, { att: 1.2, cut: 850 });
      if (s === 'A') mel(I, bowed, vc, t, K_A[b], { vel: 0.8, io: { att: 0.18 } });
      else if (s === 'B') mel(I, bowed, vc, t, K_B[b], { vel: 0.8, io: { att: 0.18 } });
      else if (s === 'Ahorn') {
        mel(I, horn, hn, t, K_A[b], { tr: 12, vel: 0.62 });
        bowed(I, vc, t, chord[0] + 12, bd * 0.95, 0.5, { att: 0.5, low: true });
      } else {
        var arp = [chord[0] + 12, chord[1] + 12, chord[chord.length - 1] + 12, chord[1] + 24];
        arp.forEach(function (m, i) { piano(I, pn, t + i * I.spb * 0.75 + (s === 'intro' ? I.spb : 0), m, I.spb * 2, 0.3); });
      }
    }
  };

  CUES.ilse_kasimir = {
    bpm: 58, beats: 4, lvl: 1,
    next: function (I, last) {
      if (!last) return { name: 'IA', len: 8 };
      return choose(I, [['IA', 8, 2], ['K', 8, 3], ['IB', 8, 2], ['both', 8, 3]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, bd = I.barDur;
      var pd = chan(I, 'pad', -0.2, 0.45, 1), ep = chan(I, 'ep', 0.2, 0.45, 1), vc = chan(I, 'vc', -0.1, 0.4, 1.1), cel = chan(I, 'cel', 0.3, 0.6, 1), vl = chan(I, 'vl', 0.2, 0.5, 1);
      if (s === 'K') {
        var kc = tr(K_A_CH[b], 7 + 12);
        pad(I, pd, t, kc, bd + 0.6, 0.45, { att: 1.2, cut: 900 });
        mel(I, bowed, vc, t, K_A[b], { tr: 7, vel: 0.8, io: { att: 0.18 } });
        if (b === 2 || b === 3 || b === 7) mel(I, celesta, cel, t + I.spb, ILSE_HEAD, { vel: 0.45, drop: 0.15 });
        return;
      }
      var chord = s === 'IB' ? ILSE_B_CH[b] : ILSE_A_CH[b];
      pad(I, pd, t, chord.slice(1), bd + 0.6, s === 'both' ? 0.32 : 0.4, { att: 1.3, cut: 1100 });
      if (s === 'IA') { mel(I, epiano, ep, t, ILSE_A[b], { vel: 0.6 }); mel(I, bowed, vc, t, KC_A[b], { vel: 0.65, io: { att: 0.2 } }); }
      else if (s === 'IB') {
        mel(I, celesta, cel, t, ILSE_B[b], { vel: 0.55 });
        var m1 = chord[1], m2 = chord[2]; while (m1 < 48) m1 += 12; while (m2 < 50) m2 += 12;
        bowed(I, vc, t, m1, I.spb * 2, 0.5, { att: 0.3 }); bowed(I, vc, t + 2 * I.spb, m2, I.spb * 2, 0.5, { att: 0.3 });
      } else {
        mel(I, bowed, vl, t, ILSE_A[b], { vel: 0.6, io: { att: 0.25, bright: 3.2 } });
        mel(I, bowed, vc, t, KC_A[b], { vel: 0.7, io: { att: 0.2 } });
        if (I.rng() < 0.35) celesta(I, cel, t + 2.5 * I.spb, chord[chord.length - 1] + 12, 1, 0.3);
      }
    }
  };

  CUES.severin_theme = {
    bpm: 46, beats: 4, lvl: 1,
    next: function (I, last) {
      if (!last) return { name: 'ground', len: 4 };
      return choose(I, [['A', 4, 3], ['B', 4, 3], ['Ahi', 4, 2], ['menace', 4, 2], ['ground', 4, 1]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, bd = I.barDur;
      var org = chan(I, 'org', 0, 0.55, 0.9), br = chan(I, 'br', 0.12, 0.5, 1), st = chan(I, 'st', -0.2, 0.55, 1), dr = chan(I, 'dr', 0, 0.5, 1);
      var useB = s === 'B', CH = useB ? SEV_B_CH : SEV_A_CH, GR = useB ? SEV_B_G : SEV_A_G;
      var chord = CH[b];
      organ(I, org, t, GR[b], bd * 0.98, 0.9);
      organ(I, org, t, GR[b] - 12, bd * 0.98, 0.5);
      chord.forEach(function (m) { organ(I, org, t + 0.02, m, bd * 0.97, s === 'ground' ? 0.4 : 0.32); });
      timp(I, dr, t, GR[b] < 36 ? GR[b] + 12 : GR[b], 0.32);
      timp(I, dr, t + 2 * I.spb, GR[b] + 7 - (GR[b] + 7 > 45 ? 12 : 0), 0.18);
      if (s === 'A' || s === 'B') { mel(I, horn, br, t, useB ? SEV_B[b] : SEV_A[b], { vel: 0.75 }); horn(I, br, t, GR[b], bd * 0.95, 0.4, { low: true }); }
      else if (s === 'Ahi') { mel(I, bowed, st, t, SEV_A[b], { tr: 12, vel: 0.65, io: { att: 0.3, bright: 3 } }); mel(I, horn, br, t, SEV_A[b], { tr: -12, vel: 0.5 }); }
      else if (s === 'menace') {
        if (b === 0) bowed(I, st, t, N('F#5'), bd * 3.5, 0.32, { att: 3, rel: 1.5, bright: 2.5 });
        if (b === 2) pad(I, st, t, [N('C2'), N('Db2'), N('G2')], bd * 2, 0.5, { att: 3, swell: true, cut: 500 });
      }
    }
  };

  CUES.mira_theme = {
    bpm: 104, beats: 4, lvl: 1,
    next: function (I, last) {
      if (!last) return { name: 'arp', len: 8 };
      return choose(I, [['arp', 8, 2], ['arpmel', 8, 3], ['sparse', 4, 1], ['lift', 4, 2]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, spb = I.spb, s16 = spb / 4;
      var ar = chan(I, 'ar', 0.2, 0.35, 1), bs = chan(I, 'bs', 0, 0.1, 1), pd = chan(I, 'pd', -0.25, 0.5, 1), tk = chan(I, 'tk', -0.3, 0.15, 1), cel = chan(I, 'cel', 0.1, 0.5, 1);
      var chord = s === 'lift' ? MIRA_LIFT[b] : MIRA_CH[b];
      if (b === 0) I.st.pat = ARP_PATS[Math.floor(I.rng() * ARP_PATS.length)];
      var beats = (s === 'arp' && b === 7 && I.secV < 0.5) || (s === 'lift' && b === 3 && I.secV > 0.6) ? 3 : 4;
      var tones = chord.slice(1).concat(chord.slice(1, 3).map(function (m) { return m + 12; }));
      var pat = I.st.pat, drop = s === 'sparse' ? 0.45 : 0.05;
      var steps = [];
      for (var i = 0; i < beats * 4; i++) {
        if (I.rng() < drop) continue;
        var acc = (i % 8 === 0 || i % 8 === 3 || i % 8 === 6);
        steps.push([t + i * s16, tones[pat[i % 16] % tones.length] + (s === 'arpmel' ? 0 : 12 * (I.secV > 0.7 ? 1 : 0)), acc ? 0.75 : 0.45]);
      }
      pluckSeq(I, ar, t, steps, t + beats * spb);
      [0, 3, 6, 8, 11, 14].forEach(function (k) { if (k < beats * 4 && (k % 8 === 0 || I.rng() < 0.75)) bass(I, bs, t + k * s16, chord[0] - 12, s16 * 1.6, k % 8 === 0 ? 0.6 : 0.42); });
      pad(I, pd, t, chord.slice(1, 4), beats * spb + 0.3, 0.28, { att: 0.5, cut: 900, rel: 0.8 });
      var th = []; for (var h = 0; h < beats; h++) th.push([t + (h + 0.5) * spb, s === 'sparse' ? 0.08 : 0.13, true]); ticks(I, tk, t, th);
      if (s === 'arpmel') mel(I, celesta, cel, t, MIRA_M[b], { vel: 0.6 });
      return beats * spb;
    }
  };

  CUES.juno_theme = {
    bpm: 70, beats: 4, lvl: 1,
    next: function (I, last) { return choose(I, [['lead', 12, 3], ['piano', 12, 2], ['lay', 12, 1]], last); },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, spb = I.spb;
      var bs = chan(I, 'bs', -0.05, 0.12, 1), cp = chan(I, 'cp', -0.25, 0.35, 1), ld = chan(I, 'ld', 0.2, 0.45, 1), dr = chan(I, 'dr', 0.3, 0.2, 1);
      var c = BLUES[b][0], nc = BLUES[(b + 1) % 12][0], r = bassRoot(c);
      if (r > 36) r -= 12;
      bass(I, bs, t, r, spb * 1.8, 0.65);
      bass(I, bs, t + 2 * spb, I.rng() < 0.5 ? r + 7 : r + 12, spb * 1.4, 0.5);
      if (I.rng() < 0.5) bass(I, bs, t + 3.66 * spb, bassRoot(nc) + (bassRoot(nc) > 36 ? -12 : 0) - 1, spb * 0.3, 0.4);
      var vo = voicing(c, 53), rh = COMP_R1[Math.floor(I.rng() * COMP_R1.length)];
      rh.forEach(function (bb) { vo.forEach(function (m) { epiano(I, cp, t + bb * spb + I.rng() * 0.012, m, spb * 0.7, 0.28); }); });
      brushes(I, dr, t, 0.8);
      if (b % 2 === 0 && s !== 'lay' && I.rng() < 0.9) {
        var lk = LICKS[Math.floor(I.rng() * LICKS.length)], off = I.rng() < 0.5 ? 0 : 0.5;
        var lt = t + off * spb;
        if (s === 'lead') mel(I, lead, ld, lt, lk, { vel: 0.7, swing: true, leg: 0.9 });
        else mel(I, epiano, ld, lt, lk, { vel: 0.55, swing: true, tr: 12 * (I.secV < 0.3 ? 1 : 0) });
      } else if (s === 'lay' && I.rng() < 0.3) {
        lead(I, ld, t + 1 * spb, 65 + [0, 3, 7, 10][Math.floor(I.rng() * 4)], spb * 2.5, 0.45);
      }
    }
  };

  CUES.reception_jazz = {
    bpm: 108, beats: 4, lvl: 0.95,
    next: function (I, last) {
      if (!last) return { name: 'head', len: 16 };
      return choose(I, [['head', 16, 2], ['solo', 16, 2], ['comp', 16, 1]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, spb = I.spb;
      var bs = chan(I, 'bs', -0.05, 0.12, 1), cp = chan(I, 'cp', -0.2, 0.35, 1), rh = chan(I, 'rh', 0.15, 0.4, 1), dr = chan(I, 'dr', 0.3, 0.25, 1);
      var bar = JAZZ[b], next = JAZZ[(b + 1) % 16];
      walkBar(I, bs, t, bar, next, 0.6);
      var hits = bar.length > 1 ? [[0.66, bar[0]], [2.66, bar[1]]] : COMP_R1[Math.floor(I.rng() * COMP_R1.length)].map(function (x) { return [x, bar[0]]; });
      hits.forEach(function (h) { voicing(h[1], 52).forEach(function (m) { piano(I, cp, t + h[0] * spb + I.rng() * 0.01, m, spb * (I.rng() < 0.5 ? 0.5 : 1.2), 0.24); }); });
      brushes(I, dr, t, 0.7);
      if (s === 'head' && b < 8) mel(I, piano, rh, t, JAZZ_HEAD[b], { vel: 0.5, swing: true });
      else {
        var p = s === 'solo' ? 0.85 : s === 'head' ? 0.6 : 0.3;
        if (I.rng() < p) improvBar(I, rh, t, bar, 0.42, true);
      }
    }
  };

  CUES.shelf_song = {
    bpm: 66, beats: 4, lvl: 1,
    init: function (I) {
      var vc = chan(I, 'vox', 0.05, 0.55, 1), dc_ = chan(I, 'dvox', -0.2, 0.5, 1), hv = chan(I, 'hvox', 0.3, 0.55, 1);
      I.st.mv = mono(I, vc, 0.22); I.st.hv = mono(I, hv, 0.14); I.st.dv = mono(I, dc_, 0.15);
    },
    next: function (I, last) {
      if (!last) return { name: 'drone', len: 2 };
      if (last === 'drone') return { name: 'v1', len: 4 };
      return choose(I, [['v1', 4, 3], ['v2', 4, 2], ['ref', 4, 3], ['drone', 2, 1]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, spb = I.spb, bd = I.barDur;
      var dr = chan(I, 'drm', 0, 0.4, 1), mt = chan(I, 'mt', -0.3, 0.6, 1);
      var drone_m = (s === 'ref' && (b === 1 || b === 2)) ? N('E2') : N('A2');
      I.st.dv.note(t, drone_m, bd, 0.9, 'mm', true);
      taiko(I, dr, t, 0.55, 1.25); taiko(I, dr, t + 2 * spb, 0.25, 1.25);
      if (I.rng() < 0.55) bell(I, mt, t + 3.5 * spb + I.rng() * 0.03, 330 + I.rng() * 240, 0.5, 0.6, 2.71);
      if (s === 'drone') { I.st.mv.note(t, 57, 0.1, 0, 'mm', false); return; }
      var M = s === 'v1' ? SHELF_V1 : s === 'v2' ? SHELF_V2 : SHELF_R, bar = M[b];
      var oct = I.secV < 0.25 ? -12 : 0, harm = (s === 'ref' || s === 'v2') && I.secV > 0.4;
      var vws = ['oo', 'oh', 'ah', 'oh', 'oo'];
      bar.forEach(function (e, i) {
        var st = t + e.b * spb, d = e.d * spb, leg = i < bar.length - 1 && e.d < 1.5;
        var vw = e.d >= 2 ? 'ah' : vws[(i + b) % vws.length];
        I.st.mv.note(st, e.m + oct, d, 0.95, vw, leg);
        if (harm) I.st.hv.note(st, e.m + oct - 5, d, 0.8, vw === 'ah' ? 'oh' : 'oo', leg);
      });
      if (!harm) I.st.hv.note(t, 50, 0.1, 0, 'mm', false);
    }
  };

  CUES.hall_ceremony = {
    bpm: 63, beats: 4, lvl: 0.95,
    next: function (I, last) {
      if (!last) return { name: 'intro', len: 2 };
      if (last === 'intro') return { name: 'brass', len: 8 };
      return choose(I, [['brass', 8, 2], ['organ', 8, 2], ['full', 8, 3], ['intro', 2, 1]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, bd = I.barDur;
      var hn = chan(I, 'hn', 0.15, 0.55, 1), org = chan(I, 'org', -0.15, 0.6, 0.9), vl = chan(I, 'vl', 0.25, 0.55, 1), dr = chan(I, 'dr', 0, 0.55, 1);
      if (b === 0) I.st.k = (s === 'full' && I.secV < 0.35) ? 2 : 0;
      var k = I.st.k || 0;
      if (s === 'intro') {
        [N('Bb1'), N('F2'), N('Bb2'), N('D3'), N('F3')].forEach(function (m) { organ(I, org, t, m, bd * 0.98, 0.45); });
        if (b === 1) for (var r = 0; r < 14; r++) timp(I, dr, t + r * bd / 14, N('F2'), 0.06 + r * 0.025);
        else timp(I, dr, t, N('Bb1'), 0.5);
        return;
      }
      if (s === 'brass') {
        mel(I, horn, hn, t, HALL.S[b], { tr: k, vel: 0.75 }); mel(I, horn, hn, t, HALL.B[b], { tr: k, vel: 0.65 });
        mel(I, organ, org, t, HALL.A[b], { tr: k, vel: 0.6 }); mel(I, organ, org, t, HALL.T[b], { tr: k, vel: 0.6 });
      } else if (s === 'organ') {
        ['S', 'A', 'T', 'B'].forEach(function (v) { mel(I, organ, org, t, HALL[v][b], { tr: k, vel: 0.7 }); });
        mel(I, organ, org, t, HALL.B[b], { tr: k - 12, vel: 0.45 });
      } else {
        mel(I, horn, hn, t, HALL.S[b], { tr: k, vel: 0.8 }); mel(I, bowed, vl, t, HALL.S[b], { tr: k + 12, vel: 0.5, io: { att: 0.12, bright: 3 } });
        mel(I, horn, hn, t, HALL.B[b], { tr: k, vel: 0.7 }); mel(I, horn, hn, t, HALL.T[b], { tr: k, vel: 0.5 });
        mel(I, organ, org, t, HALL.A[b], { tr: k, vel: 0.55 }); mel(I, organ, org, t, HALL.B[b], { tr: k - 12, vel: 0.45 });
        if (I.secV > 0.5) mel(I, horn, hn, t, HALL.D[b], { tr: k, vel: 0.42, io: { bright: 1.3 } });
        if (b === 0 || b === 3 || b === 7) timp(I, dr, t, (b === 3 ? N('F2') : N('Bb1')) + k, 0.45);
      }
    }
  };

  CUES.tension = {
    bpm: 84, beats: 4, lvl: 1,
    init: function (I) { drone(I, chan(I, 'dr', 0, 0.15, 1), 26, 0.5, 160); },
    next: function (I, last) {
      if (!last) return { name: 'pulse', len: 4 };
      return choose(I, [['pulse', 4, 2], ['chords', 4, 3], ['sparse', 4, 2], ['drive', 4, 2]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, spb = I.spb, bd = I.barDur;
      var os = chan(I, 'os', -0.1, 0.25, 1.1), tk = chan(I, 'tk', 0.35, 0.2, 1), hi = chan(I, 'hi', 0.2, 0.6, 1), dr = chan(I, 'drm', 0, 0.4, 1);
      if (b === 0) I.st.pat = TEN_PATS[Math.floor(I.rng() * TEN_PATS.length)];
      var pat = I.st.pat, step = s === 'sparse' ? 2 : 1;
      for (var i = 0; i < 8; i += step) {
        var acc = i === 0 || i === 3 || i === 6;
        bowed(I, os, t + i * spb / 2, 38 + pat[i], spb * 0.3, acc ? 0.8 : 0.5, { att: 0.015, rel: 0.05, bright: 3, low: true });
      }
      var th = []; for (var h = 0; h < 4; h++) th.push([t + h * spb, h % 2 ? 0.22 : 0.3, h % 2 === 0]); ticks(I, tk, t, th);
      if (s === 'chords' || s === 'drive') pad(I, hi, t, TEN_CH[b], bd + 0.4, 0.4, { att: 0.8, cut: 1300 });
      if (s === 'drive') for (var d = 0; d < 4; d++) timp(I, dr, t + d * spb, 38, d === 0 ? 0.4 : 0.2);
      if (s === 'sparse' && b === 0) bowed(I, hi, t, N('Ab5'), bd * 3, 0.25, { att: 2.5, rel: 1.2, bright: 2.5 });
    }
  };

  CUES.incident = {
    bpm: 120, beats: 4, lvl: 0.7,
    init: function (I) { drone(I, chan(I, 'dr', 0, 0.2, 1), 24, 0.7, 140); I.st.swellNext = 0; },
    next: function (I, last) { return { name: 'x', len: 1000 }; },
    bar: function (I, t, n) {
      sec(I);
      var spb = I.spb, bd = I.barDur;
      var tk = chan(I, 'tk', 0, 0.45, 1), sw = chan(I, 'sw', -0.15, 0.6, 1), br = chan(I, 'br', 0.15, 0.4, 1), mt = chan(I, 'mt', 0.4, 0.7, 1);
      if (I.rng() > 0.2) {
        var p = TAIKO_PATS[Math.floor(I.rng() * TAIKO_PATS.length)];
        for (var i = 0; i < 8; i++) if (p[i] === 'x') taiko(I, tk, t + i * spb / 2, i === 0 ? 0.95 : 0.6 + I.rng() * 0.25, i === 0 ? 1.3 : 1);
      }
      if (n >= I.st.swellNext) {
        var len = 2 + Math.floor(I.rng() * 2), cl = CLUSTERS[Math.floor(I.rng() * CLUSTERS.length)];
        pad(I, sw, t, cl, bd * len, 0.85, { att: bd * len * 0.85, rel: 0.25, swell: true, cut: 2600 });
        I.st.swellNext = n + len + (I.rng() < 0.5 ? 0 : 1);
      }
      if (I.rng() < 0.35) { var st = t + Math.floor(I.rng() * 4) * spb;[36, 37, 43].forEach(function (m) { horn(I, br, st, m, 0.45, 0.95, { bright: 1.4 }); }); }
      if (I.rng() < 0.3) bell(I, mt, t + I.rng() * bd, 2400 + I.rng() * 1800, 0.35, 2.5, 1.07);
    }
  };

  CUES.dusk_ambience = {
    bpm: 60, beats: 4, lvl: 1,
    init: function (I) { var c = chan(I, 'dr', 0, 0.35, 1); drone(I, c, 33, 0.5, 320); drone(I, c, 40, 0.28, 420); },
    next: function () { return { name: 'x', len: 1000 }; },
    bar: function (I, t, n) {
      sec(I);
      var bd = I.barDur, mt = chan(I, 'mt', 0.35, 0.9, 1), mt2 = chan(I, 'mt2', -0.4, 0.9, 1), sw = chan(I, 'sw', 0, 0.6, 1), vc = chan(I, 'vc', -0.1, 0.5, 1);
      if (I.rng() < 0.6) {
        var f = 880 * DUSK_PARTIALS[Math.floor(I.rng() * DUSK_PARTIALS.length)] * (I.rng() < 0.5 ? 1 : 0.5);
        bell(I, I.rng() < 0.5 ? mt : mt2, t + I.rng() * bd, f, 0.22, 5.5, 2.76);
      }
      if (n % 3 === 1 && I.rng() < 0.6) pad(I, sw, t, DUSK_SW[Math.floor(I.rng() * DUSK_SW.length)], bd * 2.5, 0.3, { att: bd * 1.2, rel: 4, cut: 700, swell: true });
      if (I.rng() < 0.12) bowed(I, vc, t + 1, N('A2') + [0, 7, 3][Math.floor(I.rng() * 3)], bd * 1.5, 0.3, { att: 1.5, rel: 1.5, bright: 2.5, low: true });
    }
  };

  CUES.grief = {
    bpm: 50, beats: 4, lvl: 1,
    next: function (I, last) {
      if (!last) return { name: 'strings', len: 8 };
      return choose(I, [['strings', 8, 3], ['piano', 8, 2], ['still', 4, 1]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, bd = I.barDur;
      var pd = chan(I, 'pd', -0.2, 0.5, 1), vl = chan(I, 'vl', 0.15, 0.55, 1), vc = chan(I, 'vc', -0.05, 0.4, 1), ep = chan(I, 'ep', 0.2, 0.5, 1), mt = chan(I, 'mt', 0.4, 0.8, 1);
      var CH = s === 'piano' ? ILSE_B_CH : ILSE_A_CH, idx = s === 'still' ? [0, 7, 3, 5][b] : b;
      var chord = tr(CH[idx], -3);
      pad(I, pd, t, chord.slice(1), bd + 0.8, s === 'piano' ? 0.3 : 0.45, { att: 1.8, cut: 1000 });
      bowed(I, vc, t, chord[0] - 12 + (chord[0] - 12 < 36 ? 12 : 0), bd, 0.42, { att: 0.8, low: true, bright: 2.5 });
      if (s === 'strings') mel(I, bowed, vl, t, ILSE_A[b], { tr: -3, vel: 0.6, io: { att: 0.35, bright: 3.2, rel: 0.3 } });
      else if (s === 'piano') mel(I, epiano, ep, t, ILSE_B[b], { tr: -3, vel: 0.5, drop: 0.15 });
      else if (I.rng() < 0.5) bell(I, mt, t + I.rng() * bd, mtof(chord[chord.length - 1] + 24), 0.15, 4, 2.0);
    }
  };

  CUES.resolve = {
    bpm: 72, beats: 4, lvl: 0.95,
    next: function (I, last) {
      if (!last) return { name: 'build', len: 8 };
      if (last === 'build') return { name: 'A', len: 8 };
      return choose(I, [['A', 8, 3], ['B', 8, 3], ['build', 8, 1]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, spb = I.spb, bd = I.barDur;
      var os = chan(I, 'os', -0.2, 0.3, 1), pd = chan(I, 'pd', 0.1, 0.5, 1), hn = chan(I, 'hn', 0.15, 0.5, 1), vl = chan(I, 'vl', 0.25, 0.5, 1), dr = chan(I, 'dr', 0, 0.45, 1), lo = chan(I, 'lo', 0, 0.3, 1);
      var CH = s === 'B' ? RES_B_CH : RES_A_CH, chord = CH[b], r = chord[0] + 12;
      [0, 7, 12, 7, 0, 7, 12, 15 - (chord[2] - chord[0] === 15 ? 0 : 0)].forEach(function (iv, i) {
        var m = i === 7 ? r + 12 : r + iv;
        piano(I, os, t + i * spb / 2, m, spb * 0.45, i % 4 === 0 ? 0.5 : 0.36);
      });
      pad(I, pd, t, chord.slice(2), bd + 0.4, s === 'build' ? 0.4 : 0.5, { att: 0.7, cut: s === 'build' ? 1200 : 1800 });
      bowed(I, lo, t, chord[0], bd, 0.5, { att: 0.3, low: true, bright: 3 });
      if (b % 2 === 0) timp(I, dr, t, chord[0] < 40 ? chord[0] + 12 : chord[0], s === 'build' ? 0.3 : 0.45);
      if (s === 'A') mel(I, horn, hn, t, RES_A[b], { tr: -12, vel: 0.8 });
      else if (s === 'B') { mel(I, bowed, vl, t, RES_B[b], { vel: 0.65, io: { att: 0.12, bright: 3.5 } }); mel(I, horn, hn, t, RES_B[b], { tr: -12, vel: 0.6 }); }
      else if (b >= 4) mel(I, horn, hn, t, RES_A[b - 4], { tr: -12, vel: 0.45 });
    }
  };

  CUES.finale = {
    bpm: 58, beats: 4, lvl: 0.95,
    next: function (I, last) {
      var seq = ['Amin', 'Bmin', 'Amaj', 'Bmaj', 'coda'], lens = { Amin: 8, Bmin: 8, Amaj: 8, Bmaj: 8, coda: 4, Amaj2: 8 };
      I.st.k = (I.st.k || 0);
      if (I.st.k < seq.length) { var nm = seq[I.st.k++]; return { name: nm, len: lens[nm] }; }
      return choose(I, [['Amaj', 8, 2], ['Amaj2', 8, 3], ['Bmaj', 8, 2], ['coda', 4, 1]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, bd = I.barDur, spb = I.spb;
      var pd = chan(I, 'pd', -0.2, 0.5, 1), cel = chan(I, 'cel', 0.3, 0.6, 1), vl = chan(I, 'vl', 0.15, 0.55, 1), vc = chan(I, 'vc', -0.15, 0.45, 1), hn = chan(I, 'hn', -0.05, 0.5, 1), ep = chan(I, 'ep', 0.2, 0.45, 1), dr = chan(I, 'dr', 0, 0.5, 1);
      if (s === 'coda') {
        var CO = C('D2 A2 F#3 A3 E4 | G2 D3 F#3 B3 E4 | D2 A2 F#3 A3 E4 | D2 A2 D3 F#3 A3');
        pad(I, pd, t, CO[b].slice(1), bd + 0.8, 0.5, { att: 1.5, cut: 1500 });
        bowed(I, vc, t, CO[b][0] + 12, bd, 0.4, { att: 0.8, low: true });
        var pent = [74, 76, 78, 81, 83, 86, 88, 90];
        for (var i = 0; i < 8; i++) if (I.rng() < 0.6) celesta(I, cel, t + i * spb / 2, pent[(i + b * 2) % 8], 1, 0.3 + i * 0.02);
        return;
      }
      var major = s !== 'Amin' && s !== 'Bmin', isB = s === 'Bmin' || s === 'Bmaj';
      var MEL = major ? (isB ? ILSE_BM : ILSE_AM) : (isB ? ILSE_B : ILSE_A);
      var CH = major ? (isB ? ILSE_BM_CH : ILSE_AM_CH) : (isB ? ILSE_B_CH : ILSE_A_CH);
      var chord = CH[b];
      pad(I, pd, t, chord.slice(1), bd + 0.6, major ? 0.6 : 0.42, { att: 1.0, cut: major ? 2000 : 1200 });
      bowed(I, vc, t, chord[0] - 12 + (chord[0] < 45 ? 12 : 0), bd, 0.45, { att: 0.5, low: true, bright: 3 });
      if (s === 'Amin') mel(I, celesta, cel, t, MEL[b], { vel: 0.6 });
      else if (s === 'Bmin') mel(I, epiano, ep, t, MEL[b], { vel: 0.6 });
      else {
        mel(I, bowed, vl, t, MEL[b], { vel: 0.7, io: { att: 0.2, bright: 3.6 } });
        mel(I, celesta, cel, t, MEL[b], { tr: 12, vel: 0.32 });
        horn(I, hn, t, chord[1] + (chord[1] < 50 ? 12 : 0), bd * 0.95, 0.35, { low: true });
        if (s === 'Amaj2') mel(I, bowed, vc, t, KC_AM[b], { vel: 0.6, io: { att: 0.2 } });
        if (b === 0) timp(I, dr, t, N('D2'), 0.45);
      }
    }
  };

  CUES.credits = {
    bpm: 56, beats: 4, lvl: 0.9,
    next: function (I, last) {
      if (!last) return { name: 'ilseMaj', len: 8 };
      return choose(I, [['ilseMaj', 8, 2], ['song', 8, 2], ['duo', 8, 2], ['minor', 8, 1]], last);
    },
    bar: function (I, t, n) {
      var b = sec(I), s = I.cur.name, bd = I.barDur;
      var pd = chan(I, 'pd', -0.2, 0.5, 1), ep = chan(I, 'ep', 0.2, 0.45, 1), cel = chan(I, 'cel', 0.3, 0.6, 1), vc = chan(I, 'vc', -0.1, 0.45, 1);
      if (s === 'song') {
        var SCH = C('D3 A3 E4 F4 | D3 A3 E4 F4 | F2 C3 A3 E4 | D3 A3 E4 F4 | G2 D3 B3 | C3 G3 E4 | F2 C3 A3 | D3 A3 E4');
        var M = b < 4 ? SHELF_V1[b] : SHELF_R[b - 4];
        pad(I, pd, t, SCH[b], bd + 0.6, 0.38, { att: 1.2, cut: 1000 });
        mel(I, celesta, cel, t, M, { tr: 5, vel: 0.55 });
        return;
      }
      var maj = s !== 'minor', MEL = maj ? ILSE_AM : ILSE_A, chord = (maj ? ILSE_AM_CH : ILSE_A_CH)[b];
      pad(I, pd, t, chord.slice(1), bd + 0.6, 0.38, { att: 1.4, cut: 1100 });
      if (s === 'duo') { mel(I, celesta, cel, t, MEL[b], { vel: 0.5 }); mel(I, bowed, vc, t, KC_AM[b], { vel: 0.5, io: { att: 0.25 } }); }
      else mel(I, epiano, ep, t, MEL[b], { vel: 0.52, drop: s === 'minor' ? 0.12 : 0.03 });
      if (s !== 'duo') bowed(I, vc, t, chord[0] - 12 + (chord[0] < 45 ? 12 : 0), bd, 0.3, { att: 0.8, low: true, bright: 2.5 });
    }
  };

  /* ================================================================== SFX */
  function SR(sendLvl) {
    var g = G(1, sfxBus), r = { g: g, s: [], n: [g], end: 0 };
    if (sendLvl > 0) { var s = G(sendLvl, revIn); g.connect(s); r.n.push(s); }
    return r;
  }
  function cleanSfx(r) { r.s.forEach(function (s) { try { s.stop(0); } catch (e) { } dc(s); }); r.n.forEach(dc); }
  function so(r, type, f, t, end) { var o = O(type, f); o.start(t); o.stop(end); r.s.push(o); return o; }
  function sn(r, t, end, brown) { var n = NZ(t, brown); n.stop(end); r.s.push(n); return n; }
  function sg(r, v, to) { var g = G(v, to); r.n.push(g); return g; }
  function sf(r, type, f, Q, to) { var x = F(type, f, Q, to); r.n.push(x); return x; }
  function hit(param, t, pk, tau, att) {
    if (att) { param.setValueAtTime(0, t); param.linearRampToValueAtTime(pk, t + att); param.setTargetAtTime(0, t + att, tau); }
    else { param.setValueAtTime(pk, t); param.setTargetAtTime(0, t, tau); }
  }
  /* ping: inharmonic partials struck one or more times */
  function partials(r, t, freqs, amps, taus, strikes, end, to) {
    freqs.forEach(function (f, i) {
      var o = so(r, 'sine', f, t, end), g = sg(r, 0, to || r.g); o.connect(g);
      g.gain.setValueAtTime(0, t);
      strikes.forEach(function (st) { g.gain.setValueAtTime(amps[i] * st[1], t + st[0]); g.gain.setTargetAtTime(0, t + st[0] + 0.001, taus[i]); });
    });
  }

  var SFX = {
    lighter: function (r, t) {
      // brass lid click
      partials(r, t, [2900, 4650, 6100], [0.12, 0.08, 0.05], [0.04, 0.03, 0.02], [[0, 1]], t + 0.4);
      var n = sn(r, t, t + 2.4), hpf = sf(r, 'highpass', 3000, 0.7), cg = sg(r, 0, r.g);
      n.connect(hpf); hpf.connect(cg); hit(cg.gain, t, 0.25, 0.008);
      // flint wheel rasp
      var ws = t + 0.42, bp = sf(r, 'bandpass', 4200, 1.2), wg = sg(r, 0, r.g); n.connect(bp); bp.connect(wg);
      wg.gain.setValueAtTime(0, ws);
      for (var i = 0; i < 7; i++) { var tk = ws + i * 0.016 + Math.random() * 0.006; wg.gain.setValueAtTime(0.35 * (1 - i * 0.08), tk); wg.gain.setTargetAtTime(0, tk + 0.001, 0.004); }
      // flame catch: soft whoomp + flutter
      var fs = ws + 0.1, lp = sf(r, 'lowpass', 900, 0.8), fg = sg(r, 0), fl = sg(r, 0, r.g);
      n.connect(lp); lp.connect(fg); fg.connect(fl);
      fg.gain.setValueAtTime(0, fs); fg.gain.linearRampToValueAtTime(0.55, fs + 0.04); fg.gain.setTargetAtTime(0.16, fs + 0.05, 0.12);
      fg.gain.setTargetAtTime(0, fs + 1.1, 0.25);
      lp.frequency.setValueAtTime(1600, fs); lp.frequency.setTargetAtTime(600, fs + 0.05, 0.15);
      var lfo = so(r, 'sine', 9, fs, t + 2.4), lg = sg(r, 0.35); lfo.connect(lg); fl.gain.value = 0.7; lg.connect(fl.gain);
      return t + 2.4;
    },
    door: function (r, t) {
      var n = sn(r, t, t + 1.3), bp = sf(r, 'bandpass', 5000, 0.8), g = sg(r, 0, r.g);
      n.connect(bp); bp.connect(g);
      bp.frequency.setValueAtTime(5200, t); bp.frequency.exponentialRampToValueAtTime(1300, t + 0.6);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.05); g.gain.setTargetAtTime(0, t + 0.3, 0.12);
      var m = so(r, 'sawtooth', 85, t, t + 0.7), ml = sf(r, 'lowpass', 280, 1), mg = sg(r, 0, r.g);
      m.connect(ml); ml.connect(mg); mg.gain.setValueAtTime(0, t); mg.gain.linearRampToValueAtTime(0.1, t + 0.1); mg.gain.linearRampToValueAtTime(0, t + 0.6);
      var th = so(r, 'sine', 80, t + 0.6, t + 1.2), tg = sg(r, 0, r.g); th.connect(tg);
      th.frequency.setValueAtTime(85, t + 0.6); th.frequency.exponentialRampToValueAtTime(38, t + 0.8);
      hit(tg.gain, t + 0.6, 0.7, 0.07, 0.003);
      var tl = sf(r, 'lowpass', 350, 0.7), tng = sg(r, 0, r.g); n.connect(tl); tl.connect(tng); hit(tng.gain, t + 0.6, 0.35, 0.03);
      return t + 1.3;
    },
    airlock: function (r, t) {
      function clunk(tc, a) {
        var o = so(r, 'sine', 60, tc, tc + 0.6), g = sg(r, 0, r.g); o.connect(g);
        o.frequency.setValueAtTime(70, tc); o.frequency.exponentialRampToValueAtTime(34, tc + 0.25); hit(g.gain, tc, a, 0.1, 0.003);
        partials(r, tc, [420, 733, 1190], [0.06, 0.04, 0.03], [0.15, 0.1, 0.07], [[0, a]], tc + 0.8);
      }
      clunk(t, 0.75);
      var n = sn(r, t + 0.15, t + 3.0), hpf = sf(r, 'highpass', 900, 0.5), lp = sf(r, 'lowpass', 7000, 0.5), g = sg(r, 0, r.g);
      n.connect(hpf); hpf.connect(lp); lp.connect(g);
      g.gain.setValueAtTime(0, t + 0.15); g.gain.linearRampToValueAtTime(0.32, t + 0.35); g.gain.setTargetAtTime(0.0, t + 1.0, 0.5);
      lp.frequency.setValueAtTime(8000, t + 0.15); lp.frequency.exponentialRampToValueAtTime(1500, t + 2.6);
      var b = sn(r, t + 0.1, t + 3.0, true), bl = sf(r, 'lowpass', 160, 0.7), bg = sg(r, 0, r.g); b.connect(bl); bl.connect(bg);
      bg.gain.setValueAtTime(0, t + 0.1); bg.gain.linearRampToValueAtTime(0.5, t + 0.6); bg.gain.linearRampToValueAtTime(0, t + 2.6);
      clunk(t + 2.5, 0.6);
      var bp = so(r, 'sine', 880, t + 2.75, t + 3.1), bpg = sg(r, 0, r.g); bp.connect(bpg);
      bp.frequency.setValueAtTime(660, t + 2.88);
      bpg.gain.setValueAtTime(0, t + 2.75); bpg.gain.linearRampToValueAtTime(0.1, t + 2.76); bpg.gain.setValueAtTime(0.1, t + 2.86); bpg.gain.linearRampToValueAtTime(0, t + 2.87);
      bpg.gain.linearRampToValueAtTime(0.1, t + 2.89); bpg.gain.setValueAtTime(0.1, t + 3.0); bpg.gain.linearRampToValueAtTime(0, t + 3.02);
      return t + 3.2;
    },
    alarm: function (r, t) {
      var o1 = so(r, 'sawtooth', 360, t, t + 2.7), o2 = so(r, 'square', 362, t, t + 2.7), bp = sf(r, 'bandpass', 950, 1.4), g = sg(r, 0, r.g), mx = sg(r, 0.5);
      o1.connect(bp); o2.connect(mx); mx.connect(bp); bp.connect(g);
      g.gain.setValueAtTime(0, t);
      for (var c = 0; c < 3; c++) {
        var tc = t + c * 0.85;
        [o1, o2].forEach(function (o, k) { o.frequency.setValueAtTime(330 + k * 2, tc); o.frequency.exponentialRampToValueAtTime(430 + k * 2, tc + 0.12); });
        g.gain.setValueAtTime(0, tc); g.gain.linearRampToValueAtTime(0.32, tc + 0.03); g.gain.setValueAtTime(0.32, tc + 0.58); g.gain.linearRampToValueAtTime(0, tc + 0.64);
      }
      return t + 2.8;
    },
    pa_chime: function (r, t) {
      [[784, 0], [659.3, 0.42], [523.3, 0.84]].forEach(function (p) {
        partials(r, t + p[1], [p[0], p[0] * 2.0, p[0] * 3.01], [0.16, 0.04, 0.015], [0.55, 0.3, 0.15], [[0, 1]], t + p[1] + 2.4);
      });
      return t + 3.3;
    },
    clink: function (r, t) {
      var k = 0.95 + Math.random() * 0.1;
      partials(r, t, [2380 * k, 3560 * k, 5310 * k, 6720 * k], [0.08, 0.06, 0.04, 0.025], [0.3, 0.2, 0.12, 0.08], [[0, 1], [0.13, 0.55]], t + 1.3);
      partials(r, t, [2610, 4020, 5900], [0.05, 0.035, 0.02], [0.25, 0.15, 0.09], [[0.0, 0.8]], t + 1.0);
      var n = sn(r, t, t + 0.3), hpf = sf(r, 'highpass', 5000, 0.7), g = sg(r, 0, r.g); n.connect(hpf); hpf.connect(g);
      g.gain.setValueAtTime(0, t); hit(g.gain, t, 0.12, 0.004); hit(g.gain, t + 0.13, 0.07, 0.004);
      return t + 1.4;
    },
    footsteps: function (r, t) {
      var steps = 5, sp = 0.5, end = t + steps * sp + 0.5;
      var n = sn(r, t, end), lp = sf(r, 'lowpass', 380, 0.8), hg = sg(r, 0, r.g), bp = sf(r, 'bandpass', 2300, 1.5), tg = sg(r, 0, r.g);
      n.connect(lp); lp.connect(hg); n.connect(bp); bp.connect(tg);
      var o = so(r, 'sine', 90, t, end), og = sg(r, 0, r.g); o.connect(og);
      hg.gain.setValueAtTime(0, t); tg.gain.setValueAtTime(0, t); og.gain.setValueAtTime(0, t);
      for (var i = 0; i < steps; i++) {
        var ts = t + 0.02 + i * sp + Math.random() * 0.04, a = 0.85 + Math.random() * 0.3;
        hit(hg.gain, ts, 0.5 * a, 0.035); hit(tg.gain, ts + 0.06, 0.16 * a, 0.012);
        o.frequency.setValueAtTime(95, ts); o.frequency.exponentialRampToValueAtTime(48, ts + 0.08); hit(og.gain, ts, 0.35 * a, 0.04);
      }
      return end;
    },
    radio_static: function (r, t) {
      var end = t + 1.7, n = sn(r, t, end), bp = sf(r, 'bandpass', 1800, 0.6), g = sg(r, 0, r.g);
      n.connect(bp); bp.connect(g);
      g.gain.setValueAtTime(0, t);
      for (var i = 0; i < 45; i++) { var tk = t + 0.05 + i * 0.032; g.gain.setValueAtTime((0.1 + Math.random() * 0.25) * (i > 38 ? 0.4 : 1), tk); }
      g.gain.setValueAtTime(0, t + 1.55);
      var hpf = sf(r, 'highpass', 3000, 0.7), cg = sg(r, 0, r.g); n.connect(hpf); hpf.connect(cg); cg.gain.setValueAtTime(0, t);
      for (var j = 0; j < 14; j++) { var tc = t + Math.random() * 1.5; cg.gain.setValueAtTime(0.4 * Math.random(), tc); cg.gain.setTargetAtTime(0, tc + 0.001, 0.003); }
      var sq = so(r, 'sine', 1400, t, t + 0.12), sqg = sg(r, 0, r.g); sq.connect(sqg);
      sq.frequency.setValueAtTime(1500, t); sq.frequency.exponentialRampToValueAtTime(700, t + 0.1); hit(sqg.gain, t, 0.08, 0.03);
      var sq2 = so(r, 'sine', 1100, t + 1.5, t + 1.65), sqg2 = sg(r, 0, r.g); sq2.connect(sqg2); hit(sqg2.gain, t + 1.5, 0.06, 0.03);
      return end;
    },
    hum_stop: function (r, t) {
      var end = t + 3.4, lp = sf(r, 'lowpass', 450, 0.8), g = sg(r, 0, r.g); lp.connect(g);
      var os = [['sawtooth', 1, 0.5], ['sine', 2, 0.6], ['sine', 3, 0.3], ['sine', 0.5, 0.6]].map(function (p) {
        var o = so(r, p[0], 60 * p[1], t, end), og = sg(r, p[2], lp); o.connect(og);
        o.frequency.setValueAtTime(60 * p[1], t + 0.35); o.frequency.exponentialRampToValueAtTime(14 * p[1], t + 3.2); return o;
      });
      lp.frequency.setValueAtTime(450, t + 0.35); lp.frequency.exponentialRampToValueAtTime(120, t + 3.2);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.38, t + 0.05); g.gain.setValueAtTime(0.38, t + 0.35);
      g.gain.linearRampToValueAtTime(0.0, t + 3.25);
      // relay click as power drops
      var n = sn(r, t + 0.3, t + 0.45), hpf = sf(r, 'bandpass', 2500, 2), cg = sg(r, 0, r.g); n.connect(hpf); hpf.connect(cg); hit(cg.gain, t + 0.32, 0.4, 0.008);
      return end;
    },
    impact: function (r, t) {
      var end = t + 2.6, o = so(r, 'sine', 70, t, end), g = sg(r, 0, r.g); o.connect(g);
      o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.5); hit(g.gain, t, 0.8, 0.25, 0.003);
      var n = sn(r, t, t + 0.6), lp = sf(r, 'lowpass', 2500, 0.7), ng = sg(r, 0, r.g); n.connect(lp); lp.connect(ng); hit(ng.gain, t, 0.6, 0.06);
      partials(r, t, [310, 557, 893, 1301, 1876], [0.09, 0.08, 0.06, 0.04, 0.03], [0.7, 0.5, 0.4, 0.3, 0.2], [[0, 1]], end);
      return end;
    },
    fire_roar: function (r, t) {
      var end = t + 4.8, b = sn(r, t, end, true), lp = sf(r, 'lowpass', 600, 0.6), g = sg(r, 0), fl = sg(r, 0.75, r.g);
      b.connect(lp); lp.connect(g); g.connect(fl);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.7); g.gain.setValueAtTime(0.9, t + 3.0); g.gain.linearRampToValueAtTime(0, t + 4.6);
      var l1 = so(r, 'sine', 2.7, t, end), l2 = so(r, 'sine', 6.3, t, end), lg1 = sg(r, 0.18, fl.gain), lg2 = sg(r, 0.1, fl.gain); l1.connect(lg1); l2.connect(lg2);
      var l3 = so(r, 'sine', 0.4, t, end), lg3 = sg(r, 250, lp.frequency); l3.connect(lg3);
      var n = sn(r, t, end), hpf = sf(r, 'bandpass', 3200, 1.0), cg = sg(r, 0, r.g); n.connect(hpf); hpf.connect(cg); cg.gain.setValueAtTime(0, t);
      for (var i = 0; i < 40; i++) { var tc = t + 0.3 + Math.random() * 3.9; cg.gain.setValueAtTime(0.15 + Math.random() * 0.35, tc); cg.gain.setTargetAtTime(0, tc + 0.001, 0.004); }
      return end;
    },
    heartbeat: function (r, t) {
      var end = t + 3.8, o = so(r, 'sine', 55, t, end), lp = sf(r, 'lowpass', 140, 0.7), g = sg(r, 0, r.g); o.connect(lp); lp.connect(g);
      g.gain.setValueAtTime(0, t);
      for (var i = 0; i < 4; i++) {
        var tb = t + i * 0.86;
        [[0, 1], [0.27, 0.65]].forEach(function (h) {
          var th = tb + h[0]; o.frequency.setValueAtTime(68, th); o.frequency.exponentialRampToValueAtTime(42, th + 0.1);
          g.gain.setValueAtTime(0, th); g.gain.linearRampToValueAtTime(0.95 * h[1], th + 0.012); g.gain.setTargetAtTime(0, th + 0.013, 0.06);
        });
      }
      return end;
    },
    teacup: function (r, t) {
      partials(r, t, [3150, 4620, 6930, 2210], [0.14, 0.1, 0.06, 0.08], [0.14, 0.1, 0.06, 0.18], [[0, 1], [0.045, 0.5], [0.09, 0.2]], t + 0.9);
      var n = sn(r, t, t + 0.3), bp = sf(r, 'bandpass', 1400, 1.0), g = sg(r, 0, r.g); n.connect(bp); bp.connect(g);
      g.gain.setValueAtTime(0, t); hit(g.gain, t, 0.3, 0.012); hit(g.gain, t + 0.045, 0.15, 0.01);
      return t + 1.0;
    },
    console_beep: function (r, t) {
      var o = so(r, 'square', 1320, t, t + 0.35), lp = sf(r, 'lowpass', 3500, 0.7), g = sg(r, 0, r.g); o.connect(lp); lp.connect(g);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.004); g.gain.setValueAtTime(0.09, t + 0.07); g.gain.linearRampToValueAtTime(0, t + 0.075);
      o.frequency.setValueAtTime(1760, t + 0.12);
      g.gain.setValueAtTime(0, t + 0.12); g.gain.linearRampToValueAtTime(0.09, t + 0.124); g.gain.setValueAtTime(0.09, t + 0.21); g.gain.linearRampToValueAtTime(0, t + 0.215);
      return t + 0.4;
    },
    metal_creak: function (r, t) {
      var end = t + 2.3, o = so(r, 'sawtooth', 40, t, end), b1 = sf(r, 'bandpass', 600, 7), b2 = sf(r, 'bandpass', 1450, 9), g = sg(r, 0, r.g), g2 = sg(r, 0.6, g);
      o.connect(b1); o.connect(b2); b1.connect(g); b2.connect(g2);
      o.frequency.setValueAtTime(30, t);
      for (var i = 1; i <= 14; i++) o.frequency.linearRampToValueAtTime(22 + Math.random() * 55, t + i * 0.14);
      b1.frequency.setValueAtTime(500, t); b1.frequency.linearRampToValueAtTime(900, t + 1.0); b1.frequency.linearRampToValueAtTime(620, t + 2.0);
      b2.frequency.setValueAtTime(1300, t); b2.frequency.linearRampToValueAtTime(1700, t + 1.6);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.2, t + 0.25); g.gain.setValueAtTime(1.2, t + 1.3); g.gain.linearRampToValueAtTime(0, t + 2.1);
      return end;
    },
    crowd_murmur: function (r, t) {
      var end = t + 5.2, n = sn(r, t, end), g = sg(r, 0, r.g);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.9); g.gain.setValueAtTime(1, t + 3.6); g.gain.linearRampToValueAtTime(0, t + 5.0);
      [[420, 2.5, 0.5], [850, 3, 0.35], [1350, 3.5, 0.2], [2600, 4, 0.06]].forEach(function (p) {
        var bp = sf(r, 'bandpass', p[0], p[1]), vg = sg(r, 0, g); n.connect(bp); bp.connect(vg);
        for (var tk = t; tk < end; tk += 0.09 + Math.random() * 0.12) {
          vg.gain.setTargetAtTime(p[2] * (0.25 + Math.random() * 0.9), tk, 0.04);
          bp.frequency.setTargetAtTime(p[0] * (0.8 + Math.random() * 0.45), tk, 0.05);
        }
      });
      return end;
    },
    gavel: function (r, t) {
      [0, 0.38].forEach(function (d, i) {
        var tk = t + d, a = i ? 0.85 : 1;
        var o = so(r, 'sine', 200, tk, tk + 0.4), g = sg(r, 0, r.g); o.connect(g);
        o.frequency.setValueAtTime(210, tk); o.frequency.exponentialRampToValueAtTime(150, tk + 0.06); hit(g.gain, tk, 0.55 * a, 0.045, 0.002);
        partials(r, tk, [820, 1240, 2380], [0.12 * a, 0.08 * a, 0.04 * a], [0.04, 0.03, 0.015], [[0, 1]], tk + 0.3);
        var n = sn(r, tk, tk + 0.12), bp = sf(r, 'bandpass', 1100, 3), ng = sg(r, 0, r.g); n.connect(bp); bp.connect(ng); hit(ng.gain, tk, 0.5 * a, 0.012);
      });
      return t + 1.6;
    },
    wind_vent: function (r, t) {
      var end = t + 5, n = sn(r, t, end), bp = sf(r, 'bandpass', 700, 3.5), g = sg(r, 0, r.g), w = sf(r, 'bandpass', 1750, 30), wg = sg(r, 0.0, r.g);
      n.connect(bp); bp.connect(g); n.connect(w); w.connect(wg);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + 1.2); g.gain.setValueAtTime(0.55, t + 3); g.gain.linearRampToValueAtTime(0, t + 4.8);
      wg.gain.setValueAtTime(0, t); wg.gain.linearRampToValueAtTime(1.6, t + 1.5); wg.gain.linearRampToValueAtTime(0.4, t + 3); wg.gain.linearRampToValueAtTime(0, t + 4.7);
      for (var k = 0; k < 8; k++) { var tk = t + k * 0.6; bp.frequency.linearRampToValueAtTime(500 + Math.random() * 700, tk + 0.6); w.frequency.linearRampToValueAtTime(1650 + Math.random() * 250, tk + 0.6); }
      return end;
    },
    mirror_motor: function (r, t) {
      var end = t + 5.6, out = sg(r, 0.6, r.g), o1 = so(r, 'sawtooth', 50, t, end), o2 = so(r, 'square', 50.6, t, end), lp = sf(r, 'lowpass', 900, 1.5), g = sg(r, 0, out), mx = sg(r, 0.4);
      o1.connect(lp); o2.connect(mx); mx.connect(lp); lp.connect(g);
      [o1, o2].forEach(function (o, k) {
        var m = k ? 1.012 : 1;
        o.frequency.setValueAtTime(45 * m, t); o.frequency.exponentialRampToValueAtTime(160 * m, t + 2.6);
        o.frequency.setValueAtTime(160 * m, t + 4.2); o.frequency.exponentialRampToValueAtTime(90 * m, t + 5.4);
      });
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.6); g.gain.setValueAtTime(0.3, t + 4.4); g.gain.linearRampToValueAtTime(0, t + 5.5);
      var wh = so(r, 'sine', 360, t, end), wg = sg(r, 0, out); wh.connect(wg);
      wh.frequency.setValueAtTime(360, t); wh.frequency.exponentialRampToValueAtTime(1280, t + 2.6); wh.frequency.setValueAtTime(1280, t + 4.2); wh.frequency.exponentialRampToValueAtTime(720, t + 5.4);
      wg.gain.setValueAtTime(0, t); wg.gain.linearRampToValueAtTime(0.04, t + 1.0); wg.gain.setValueAtTime(0.04, t + 4.4); wg.gain.linearRampToValueAtTime(0, t + 5.5);
      var b = sn(r, t, end, true), bl = sf(r, 'lowpass', 110, 0.7), bg = sg(r, 0, out); b.connect(bl); bl.connect(bg);
      bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(0.6, t + 0.8); bg.gain.setValueAtTime(0.6, t + 4.4); bg.gain.linearRampToValueAtTime(0, t + 5.5);
      var c = sn(r, t, end), cb = sf(r, 'bandpass', 1800, 4), cg = sg(r, 0, out); c.connect(cb); cb.connect(cg); cg.gain.setValueAtTime(0, t);
      for (var k = 0; k < 18; k++) { var tk = t + 0.3 + k * 0.27; cg.gain.setValueAtTime(0.12, tk); cg.gain.setTargetAtTime(0, tk + 0.001, 0.006); }
      return end;
    }
  };

  /* ========================================================= ENGINE SETUP */
  function makeIR(sec) {
    var sr = ctx.sampleRate, n = Math.floor(sr * sec), b = ctx.createBuffer(2, n, sr), rnd = rngFrom(12345);
    var pd = Math.floor(sr * 0.014), RT = 2.6;
    for (var c = 0; c < 2; c++) {
      var d = b.getChannelData(c), lp = 0;
      for (var i = pd; i < n; i++) {
        var t = (i - pd) / sr, a = 0.85 - 0.75 * Math.min(1, t / sec);
        lp += a * ((rnd() * 2 - 1) - lp);
        d[i] = lp * Math.exp(-6.9 * t / RT) * (t < 0.08 ? 0.6 + t * 5 : 1);
      }
      [0.011, 0.019, 0.027, 0.041, 0.053].forEach(function (er, k) { var j = pd + Math.floor(sr * (er + c * 0.003)); if (j < n) d[j] += (k % 2 ? -0.5 : 0.6) * (1 - k * 0.12); });
    }
    return b;
  }
  function buildConv() {
    conv = ctx.createConvolver(); conv.buffer = irBuf;
    revIn.connect(conv); conv.connect(revOut);
  }
  function wave(h) {
    var re = new Float32Array(h.length), im = new Float32Array(h.length);
    for (var i = 0; i < h.length; i++) im[i] = h[i];
    return ctx.createPeriodicWave(re, im);
  }

  function init(audioCtx, dest) {
    if (ctx) return;
    ctx = audioCtx;
    isOffline = (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext);
    var sr = ctx.sampleRate, len = sr * 2;
    noiseBuf = ctx.createBuffer(1, len, sr); brownBuf = ctx.createBuffer(1, len, sr);
    var nd = noiseBuf.getChannelData(0), bd = brownBuf.getChannelData(0), last = 0, rnd = rngFrom(777);
    for (var i = 0; i < len; i++) {
      var w = rnd() * 2 - 1; nd[i] = w;
      last = (last + 0.02 * w) / 1.02; bd[i] = last * 3.5;
    }
    WAVES.organ = wave([0, 1, 0.6, 0.35, 0.3, 0, 0.12, 0, 0.1]);
    WAVES.piano = wave([0, 1, 0.45, 0.3, 0.18, 0.12, 0.07, 0.05, 0.03]);
    WAVES.bass = wave([0, 1, 0.4, 0.15, 0.08]);
    WAVES.reed = wave([0, 1, 0.2, 0.5, 0.1, 0.3, 0, 0.15]);

    master = G(0.9, dest || ctx.destination);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.008; comp.release.value = 0.25;
    comp.connect(master);
    hp = F('highpass', 28, 0.7, comp);
    pre = G(1, hp);
    musicBus = G(0.62, pre); sfxBus = G(0.85, pre);
    revIn = G(1); revOut = G(0.34, pre);
    irBuf = makeIR(3.0); buildConv();
    if (!isOffline) timer = setInterval(tickAll, 50);
  }

  function cue(name, fade) {
    if (!ctx) return;
    if (name === curName) return;
    if (name !== 'silence' && !CUES[name]) { if (window.console) console.warn('[LD_MUSIC] unknown cue', name); return; }
    var now = ctx.currentTime, f = Math.max(0.05, fade == null ? 2 : +fade || 0);
    if (current) {
      rampTo(current.out.gain, 0, now, f); rampTo(current.rout.gain, 0, now, f);
      current.fading = true; current.killAt = now + f + 0.1;
    }
    curName = name; current = null;
    if (name !== 'silence') {
      var I = makeInst(name), lv = I.def.lvl || 1;
      [I.out.gain, I.rout.gain].forEach(function (p) { p.setValueAtTime(0, now); p.linearRampToValueAtTime(lv, now + f); });
      insts.push(I); current = I;
    }
    tickAll();
  }

  function sfx(name) {
    if (!ctx || !SFX[name]) { if (ctx && window.console) console.warn('[LD_MUSIC] unknown sfx', name); return; }
    var sends = { pa_chime: 0.6, gavel: 0.5, impact: 0.45, clink: 0.35, footsteps: 0.25, alarm: 0.4, airlock: 0.3, teacup: 0.25, metal_creak: 0.45, crowd_murmur: 0.35, door: 0.2, lighter: 0.15, console_beep: 0.2, mirror_motor: 0.35, fire_roar: 0.3, wind_vent: 0.3, heartbeat: 0.05, radio_static: 0.08, hum_stop: 0.2 };
    var r = SR(sends[name] || 0.2), t = ctx.currentTime + 0.01;
    try { r.end = SFX[name](r, t) + 0.1; } catch (e) { if (window.console) console.warn('[LD_MUSIC] sfx ' + name, e); r.end = 0; }
    sfxList.push(r);
  }

  function stopAll() {
    if (!ctx) return;
    insts.slice().forEach(killInst);
    insts = []; current = null; curName = 'silence';
    sfxList.forEach(cleanSfx); sfxList = [];
    // cut the reverb tail instantly by swapping in a fresh convolver
    dc(revIn); dc(conv); buildConv();
    // duck the master for a few ms so convolver/compressor latency buffers don't leak
    var now = ctx.currentTime, mg = master.gain;
    mg.cancelScheduledValues(0); mg.setValueAtTime(0, now); mg.setValueAtTime(0, now + 0.06); mg.linearRampToValueAtTime(0.9, now + 0.1);
  }

  window.LD_MUSIC = {
    init: init,
    cue: cue,
    sfx: sfx,
    update: function (sceneT) { tickAll(); },
    stopAll: stopAll,
    cues: Object.keys(CUES),
    sfxNames: Object.keys(SFX),
    _voices: function () { return voices; }
  };
})();
