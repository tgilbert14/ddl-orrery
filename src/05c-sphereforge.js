/* ============================================================
   05c-sphereforge.js — SphereForge: the Artifact.
   A huge flawless liquid-gold sphere. It does not rotate: the
   surface FLOWS. A horizontally seamless gold texture is baked
   DOUBLED (1024px) so a scrolling slice is always ONE drawImage
   with no wrap seam; 24 fixed slices each take a per-frame sine
   x-nudge — the molten-skin illusion. Everything else is prebaked
   sprites. Zero external assets. No text in canvas. All original.
   Per-frame cost: 24 slice blits + <=7 sprite blits + <=4 ring
   strokes; zero allocations, zero gradient creation.
   ============================================================ */
'use strict';

const SphereForge = (() => {
  const TAU = Math.PI * 2;
  const TEX_W = 512, TEX_H = 256;          /* gen size; baked doubled to 1024 */
  const NS = 24;                           /* fixed slice count */
  const RIM_S = 224, RIM_PR = 80;          /* rim sprite canvas / baked radius */
  const RIM_DRAW = RIM_S / RIM_PR;         /* drawn rim size = R * 2.8 */
  const RIPPLE_MS = 1800, SONAR_MS = 3500;
  const SCROLL_SPD = 1 / 72000;            /* base drift: one full loop ~72s */
  const FLOW_SPD = 1 / 47000;              /* flow layer: faster, opposite */
  const SIG2 = 0.13 * 0.13;                /* ripple gaussian width (frac of R)^2 */
  const BRASS = 'rgba(201,163,92,1)';      /* --brass */
  const CREAM = 'rgba(239,228,200,1)';     /* --cream */
  const GOLD_BRIGHT = 'rgba(255,240,210,1)';
  const docEl = document.documentElement;

  /* ---------- deterministic randomness (PlanetForge's generators) ---------- */
  function seedOf(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeFbm(rnd, baseX, baseY, octaves) {
    const layers = []; let amp = 1, total = 0, fx = baseX, fy = baseY;
    for (let o = 0; o < octaves; o++) {
      const g = new Float32Array(fx * fy);
      for (let i = 0; i < g.length; i++) g[i] = rnd();
      layers.push({ g, fx, fy, amp });
      total += amp; amp *= 0.5; fx *= 2; fy = Math.min(fy * 2, 160);
    }
    return (u, v) => {                     /* u wraps (seamless x), v clamps */
      let s = 0;
      for (let L = 0; L < layers.length; L++) {
        const ly = layers[L];
        let x = (u * ly.fx) % ly.fx; if (x < 0) x += ly.fx;
        let y = v * (ly.fy - 1); if (y < 0) y = 0; else if (y > ly.fy - 1.0001) y = ly.fy - 1.0001;
        const x0 = x | 0, y0 = y | 0;
        const x1 = (x0 + 1) % ly.fx, y1 = Math.min(y0 + 1, ly.fy - 1);
        let tx = x - x0, ty = y - y0;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const a = ly.g[y0 * ly.fx + x0], b = ly.g[y0 * ly.fx + x1];
        const c = ly.g[y1 * ly.fx + x0], d = ly.g[y1 * ly.fx + x1];
        s += ly.amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      }
      return s / total;
    };
  }
  function hex(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function makeLut(stops) {
    const out = new Uint8Array(768); let si = 0;
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      while (si < stops.length - 2 && t > stops[si + 1][0]) si++;
      const a = hex(stops[si][1]), b = hex(stops[si + 1][1]);
      const span = Math.max(1e-6, stops[si + 1][0] - stops[si][0]);
      let f = (t - stops[si][0]) / span; if (f < 0) f = 0; else if (f > 1) f = 1;
      out[i * 3] = a[0] + (b[0] - a[0]) * f;
      out[i * 3 + 1] = a[1] + (b[1] - a[1]) * f;
      out[i * 3 + 2] = a[2] + (b[2] - a[2]) * f;
    }
    return out;
  }
  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function doubled(src) {                  /* bake the seamless wrap INTO the canvas */
    const d = cv(src.width * 2, src.height), g = d.getContext('2d');
    g.drawImage(src, 0, 0); g.drawImage(src, src.width, 0);
    return d;
  }

  /* ---------- prebaked assets ---------- */
  let baseTex = null, flowTex = null;
  let limbSpr = null, glossTL = null, glossBR = null, wanderSpr = null;
  let pulseSpr = null, rimSpr = null, shadowSpr = null;
  let su = 0.5, frozenT = 60000;           /* the seeded reduced-motion pose */
  let inited = false;

  function buildBase(rnd) {
    const c = cv(TEX_W, TEX_H), t = c.getContext('2d');
    const fb = makeFbm(rnd, 6, 4, 4), warp = makeFbm(rnd, 3, 2, 3);
    const L = makeLut([[0, '#4a2f10'], [0.42, '#c9a35c'], [0.75, '#ffdf9e'], [1, '#fff3d6']]);
    const img = t.createImageData(TEX_W, TEX_H); const d = img.data; let i = 0;
    for (let yy = 0; yy < TEX_H; yy++) {
      const v = yy / TEX_H;
      for (let xx = 0; xx < TEX_W; xx++) {
        const u = xx / TEX_W;
        /* molten banding: horizontal bands bent by wrapped noise + a wrapped u-swell */
        const band = 0.5 + 0.5 * Math.sin(v * 14.5 + warp(u, v) * 4.6 + Math.sin(u * TAU) * 0.9);
        let n = fb(u, v) * 0.58 + band * 0.42;
        n = (n - 0.5) * 1.35 + 0.56;       /* stretch + lift into the gold */
        if (n < 0) n = 0; else if (n > 1) n = 1;
        const k3 = ((n * 255) | 0) * 3;
        d[i++] = L[k3]; d[i++] = L[k3 + 1]; d[i++] = L[k3 + 2]; d[i++] = 255;
      }
    }
    t.putImageData(img, 0, 0);
    return doubled(c);
  }

  function buildFlow(rnd) {
    const w = 512, h = 128, c = cv(w, h), t = c.getContext('2d');
    const fb = makeFbm(rnd, 9, 2, 3);      /* high x freq, low y: elongated streaks */
    const img = t.createImageData(w, h); const d = img.data; let i = 0;
    for (let yy = 0; yy < h; yy++) {
      const v = yy / h;
      for (let xx = 0; xx < w; xx++) {
        const n = fb(xx / w, v);
        let a = n > 0.58 ? (n - 0.58) * 3.2 : 0; if (a > 0.9) a = 0.9;
        a *= a;                            /* sparse, sharp-shouldered highlights */
        d[i++] = 255; d[i++] = 236; d[i++] = 190; d[i++] = (a * 255) | 0;
      }
    }
    t.putImageData(img, 0, 0);
    return doubled(c);
  }

  function buildSprites() {
    const sz = 256;
    /* limb darkening + baked wrap-light annulus (the edge where light bends) */
    let c = cv(sz, sz), g = c.getContext('2d'), gr;
    g.beginPath(); g.arc(128, 128, 128, 0, TAU); g.clip();
    gr = g.createRadialGradient(96, 88, 30, 96, 88, 250);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(0.5, 'rgba(30,16,4,0.07)');
    gr.addColorStop(0.75, 'rgba(24,12,3,0.32)');
    gr.addColorStop(0.92, 'rgba(18,9,2,0.6)');
    gr.addColorStop(1, 'rgba(14,7,2,0.82)');
    g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
    gr = g.createRadialGradient(128, 128, 112, 128, 128, 128);
    gr.addColorStop(0, 'rgba(10,5,1,0)');
    gr.addColorStop(1, 'rgba(10,5,1,0.5)');
    g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
    gr = g.createRadialGradient(128, 128, 114, 128, 128, 127);
    gr.addColorStop(0, 'rgba(255,240,210,0)');
    gr.addColorStop(0.8, 'rgba(255,240,210,0.16)');
    gr.addColorStop(1, 'rgba(255,244,220,0.34)');
    g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
    limbSpr = c;

    /* big soft top-left specular bloom */
    c = cv(sz, sz); g = c.getContext('2d');
    g.beginPath(); g.arc(128, 128, 128, 0, TAU); g.clip();
    gr = g.createRadialGradient(88, 78, 4, 88, 78, 120);
    gr.addColorStop(0, 'rgba(255,252,240,0.55)');
    gr.addColorStop(0.25, 'rgba(255,244,214,0.28)');
    gr.addColorStop(0.6, 'rgba(255,236,190,0.10)');
    gr.addColorStop(1, 'rgba(255,236,190,0)');
    g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
    glossTL = c;

    /* lower-right counter-gloss: gold reflects its surroundings both ways */
    c = cv(sz, sz); g = c.getContext('2d');
    g.beginPath(); g.arc(128, 128, 128, 0, TAU); g.clip();
    gr = g.createRadialGradient(178, 186, 4, 178, 186, 96);
    gr.addColorStop(0, 'rgba(255,223,158,0.30)');
    gr.addColorStop(0.5, 'rgba(255,214,150,0.12)');
    gr.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
    glossBR = c;

    /* the wandering highlight (drawn at an animated offset, inside the clip) */
    c = cv(160, 160); g = c.getContext('2d');
    gr = g.createRadialGradient(80, 80, 2, 80, 80, 78);
    gr.addColorStop(0, 'rgba(255,250,235,0.6)');
    gr.addColorStop(0.35, 'rgba(255,240,205,0.22)');
    gr.addColorStop(1, 'rgba(255,240,205,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 160, 160);
    wanderSpr = c;

    /* whole-face brightening pulse for the ripple */
    c = cv(sz, sz); g = c.getContext('2d');
    gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,240,208,0.5)');
    gr.addColorStop(0.7, 'rgba(255,232,190,0.18)');
    gr.addColorStop(1, 'rgba(255,232,190,0)');
    g.fillStyle = gr; g.fillRect(0, 0, sz, sz);
    pulseSpr = c;

    /* warm gold rim glow: glow OFF the disc + a bright wrap ring (gen-time blur only) */
    c = cv(RIM_S, RIM_S); g = c.getContext('2d');
    const cx = RIM_S / 2;
    gr = g.createRadialGradient(cx, cx, RIM_PR * 0.9, cx, cx, RIM_PR * 1.4);
    gr.addColorStop(0, 'rgba(201,163,92,0.34)');
    gr.addColorStop(0.35, 'rgba(201,163,92,0.16)');
    gr.addColorStop(1, 'rgba(201,163,92,0)');
    g.fillStyle = gr; g.fillRect(0, 0, RIM_S, RIM_S);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(cx, cx, RIM_PR * 0.97, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(255,223,158,0.85)'; g.lineWidth = 1.6;
    g.shadowColor = 'rgb(255,223,158)'; g.shadowBlur = 12;
    g.beginPath(); g.arc(cx, cx, RIM_PR + 1, 0, TAU); g.stroke();
    g.shadowBlur = 0;
    rimSpr = c;

    /* seat shadow: soft dark radial, stretched into an ellipse at draw time */
    c = cv(128, 128); g = c.getContext('2d');
    gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(2,8,7,0.85)');
    gr.addColorStop(0.55, 'rgba(2,8,7,0.4)');
    gr.addColorStop(1, 'rgba(2,8,7,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    shadowSpr = c;
  }

  /* ---------- runtime state (pooled; no per-frame allocation) ---------- */
  let ripplePending = false, rippleT0 = -1, pending = 0;
  const rings = [{ on: false, born: 0 }, { on: false, born: 0 }, { on: false, born: 0 }];
  const rm = () => docEl.classList.contains('rm');

  /* ---------- API ---------- */
  return {
    init() {
      if (inited) return;
      inited = true;
      const rnd = mulberry(seedOf('artifact'));
      baseTex = buildBase(rnd);
      flowTex = buildFlow(rnd);
      buildSprites();
      su = rnd();
      frozenT = 40000 + su * 90000;        /* a sculpted mid-flow pose, seeded */
    },

    draw(g, x, y, R, clockMs, opts) {
      if (!inited || R <= 0) return;
      const reduced2 = !!(opts && opts.rm);
      const t = reduced2 ? frozenT : clockMs;
      const D = R * 2, dw = R * 8, half = dw * 0.5;   /* wrap period = 4R */
      const pad = R * 0.13;                /* covers max warp excursion */

      if (reduced2) { ripplePending = false; rippleT0 = -1; }
      else if (ripplePending) { rippleT0 = clockMs; ripplePending = false; }
      let rp = -1;
      if (rippleT0 >= 0) {
        rp = (clockMs - rippleT0) / RIPPLE_MS;
        if (rp >= 1) { rippleT0 = -1; rp = -1; }
      }
      const rippling = rp >= 0;
      const env = rippling ? Math.sin(rp * Math.PI) : 0;
      const ringR = rippling ? rp * R * 1.25 : 0;

      const scroll = ((t * SCROLL_SPD) % 1) * half;
      const fscroll = half - ((t * FLOW_SPD) % 1) * half;   /* opposite drift */
      const A = R * 0.028;                 /* liquid warp amplitude, subtle */

      g.save();
      g.beginPath(); g.arc(x, y, R, 0, TAU); g.clip();

      /* the molten surface: 24 slices, one seam-free blit each */
      const sh = TEX_H / NS, dh = D / NS;
      for (let i = 0; i < NS; i++) {
        let off = A * Math.sin(t * 0.00093 + i * 0.53)
                + A * 0.6 * Math.sin(t * 0.00061 - i * 0.31 + 2.1);
        if (rippling) {                    /* local amplitude surge near the ring */
          const sd = Math.abs(y - R + (i + 0.5) * dh - y) - ringR;
          off += A * 2.6 * env * Math.exp(-(sd * sd) / (2 * SIG2 * R * R))
               * Math.sin(t * 0.012 + i * 1.3);
        }
        g.drawImage(baseTex, 0, i * sh, TEX_W * 2, sh,
          x - R - pad - scroll + off, y - R + i * dh, dw, dh + 0.5);
      }

      /* flow layer: brighter streaks, screen blend, opposite scroll */
      g.globalCompositeOperation = 'screen';
      g.globalAlpha = reduced2 ? 0.14 : 0.13 + 0.05 * Math.sin(t * 0.0004);
      g.drawImage(flowTex, x - R - pad - fscroll, y - R, dw, D);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';

      /* the ripple: a bright band sweeping outward + a soft face-lift */
      if (rippling) {
        g.globalCompositeOperation = 'screen';
        g.globalAlpha = env * 0.22;
        g.drawImage(pulseSpr, x - R, y - R, D, D);
        g.globalAlpha = env * 0.4;
        g.strokeStyle = GOLD_BRIGHT;
        g.lineWidth = R * 0.045 > 1.5 ? R * 0.045 : 1.5;
        g.beginPath(); g.arc(x, y, ringR, 0, TAU); g.stroke();
        g.globalAlpha = env * 0.18;
        g.lineWidth = R * 0.02 > 1 ? R * 0.02 : 1;
        g.beginPath(); g.arc(x, y, ringR * 0.86, 0, TAU); g.stroke();
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }

      /* shading + the two environment glosses */
      g.drawImage(limbSpr, x - R, y - R, D, D);
      g.drawImage(glossTL, x - R, y - R, D, D);
      g.globalAlpha = 0.55;
      g.drawImage(glossBR, x - R, y - R, D, D);
      g.globalAlpha = 1;

      /* the wandering specular: a slow lissajous orbit (parked when reduced) */
      const wa = reduced2 ? su * TAU : t * 0.00016;
      const wx = x + Math.cos(wa) * R * 0.42;
      const wy = y + Math.sin(wa * 0.83 + 1.4) * R * 0.26;
      const ws = R * 0.95;
      g.globalCompositeOperation = 'screen';
      g.globalAlpha = reduced2 ? 0.4 : 0.34 + 0.1 * Math.sin(t * 0.0005 + 1);
      g.drawImage(wanderSpr, wx - ws / 2, wy - ws / 2, ws, ws);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.restore();

      /* rim glow last, outside the clip */
      const rs = R * RIM_DRAW;
      g.globalAlpha = reduced2 ? 0.8 : 0.72 + 0.1 * Math.sin(t * 0.00035);
      g.drawImage(rimSpr, x - rs / 2, y - rs / 2, rs, rs);
      g.globalAlpha = 1;
    },

    drawSonar(g, x, y, R, clockMs) {
      if (!inited) return;
      if (rm()) {                          /* one static faint ring suggests the pulse */
        pending = 0;
        for (let i = 0; i < 3; i++) rings[i].on = false;
        g.globalAlpha = 0.13;
        g.strokeStyle = BRASS; g.lineWidth = 1;
        g.beginPath(); g.arc(x, y, R * 1.6, 0, TAU); g.stroke();
        g.globalAlpha = 1;
        return;
      }
      while (pending > 0) {                /* latch queued pings into free pool slots */
        pending--;
        let free = -1;
        for (let i = 0; i < 3; i++) if (!rings[i].on) { free = i; break; }
        if (free < 0) { pending = 0; break; }
        rings[free].on = true; rings[free].born = clockMs;
      }
      for (let i = 0; i < 3; i++) {
        const rg = rings[i]; if (!rg.on) continue;
        const p = (clockMs - rg.born) / SONAR_MS;
        if (p >= 1) { rg.on = false; continue; }
        const rr = R * (1.05 + p * 2.15);  /* R*1.05 -> R*3.2 */
        const fade = (1 - p) * (1 - p);
        g.globalAlpha = fade * 0.5;
        g.strokeStyle = BRASS;
        g.lineWidth = 1.8 - p * 0.8;
        g.beginPath(); g.arc(x, y, rr, 0, TAU); g.stroke();
        g.globalAlpha = fade * 0.22;       /* the fainter inner echo */
        g.strokeStyle = CREAM;
        g.lineWidth = 1;
        g.beginPath(); g.arc(x, y, rr * 0.9, 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
    },

    ripple() {                             /* surface disturbance + a sonar ring */
      if (rm()) return;
      ripplePending = true;
      pending = pending < 3 ? pending + 1 : 3;
    },
    ping() {                               /* ring only: the sonar */
      if (rm()) return;
      pending = pending < 3 ? pending + 1 : 3;
    },

    drawShadowPass(g, x, y, R) {           /* seats the Artifact INTO the scene */
      if (!inited) return;
      g.globalAlpha = 0.55;
      g.drawImage(shadowSpr, x - R * 1.7, y - R * 0.55, R * 3.4, R * 1.7);
      g.globalAlpha = 1;
    },
  };
})();
/* the engine guards its calls with `window.SphereForge` (mirrors WorldFX):
   expose it so those guards fire and the Artifact actually paints */
window.SphereForge = SphereForge;
