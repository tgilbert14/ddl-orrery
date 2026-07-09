/* ============================================================
   05b-planetforge.js — PlanetForge: rotating textured planets.
   The classic 2D spinning-planet trick at high craft: seamless
   noise textures scrolled under a circle clip, prebaked shading
   sprites on top. All textures + sprites are pregenerated in
   init(); per-frame work is drawImage + a few path strokes.
   Zero external assets. No text in canvas. Original work only.
   ============================================================ */
'use strict';

const PlanetForge = (() => {
  const TAU = Math.PI * 2;
  /* 2:1 -> drawn width is always 4r. Halved on phones (M2): no planet there
     is ever drawn past ~68px, and the bake is per-pixel fBm on the main thread */
  let TEX_W = 512, TEX_H = 256;
  const RIM_S = 176, RIM_PR = 60;          /* rim sprite canvas / planet radius baked in it */
  const RIM_DRAW = RIM_S / RIM_PR;         /* drawn rim size = r * RIM_DRAW */
  const docEl = document.documentElement;

  /* ---------- deterministic per-slug randomness ---------- */
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

  /* ---------- tiny 2D value noise: bilinear-smoothed, wrap-x, 3-4 octave fBm ---------- */
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
  function sstep(e0, e1, x) {              /* smoothstep that tolerates e0 > e1 */
    let t = (x - e0) / (e1 - e0);
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return t * t * (3 - 2 * t);
  }

  /* ---------- palette ramps -> 256-entry LUTs (init-time only) ---------- */
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

  function paintBase(tctx, wpx, hpx, lutArr, field) {
    const img = tctx.createImageData(wpx, hpx); const d = img.data; let i = 0;
    for (let yy = 0; yy < hpx; yy++) {
      const v = yy / hpx;
      for (let xx = 0; xx < wpx; xx++) {
        let n = field(xx / wpx, v);
        if (n < 0) n = 0; else if (n > 1) n = 1;
        const k3 = ((n * 255) | 0) * 3;
        d[i++] = lutArr[k3]; d[i++] = lutArr[k3 + 1]; d[i++] = lutArr[k3 + 2]; d[i++] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);
  }
  /* draw a decoration callback 3 times at x offsets so it wraps seamlessly */
  function wrapped(tctx, fn) {
    for (let o = -1; o <= 1; o++) { tctx.save(); tctx.translate(o * TEX_W, 0); fn(); tctx.restore(); }
  }

  /* ---------- shared shading sprites (one of each, reused by every planet) ---------- */
  const S = { shade: null, gloss: null, band: null };
  function buildShared() {
    /* shade: terminator (light upper-left) + limb darkening baked into ONE sprite */
    const sz = 256, sc = cv(sz, sz), sg = sc.getContext('2d');
    sg.beginPath(); sg.arc(128, 128, 128, 0, TAU); sg.clip();
    let g = sg.createRadialGradient(92, 84, 26, 92, 84, 262);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.45, 'rgba(2,3,10,0.05)');
    g.addColorStop(0.68, 'rgba(4,5,14,0.34)');
    g.addColorStop(0.86, 'rgba(3,4,12,0.68)');
    g.addColorStop(1, 'rgba(2,3,10,0.94)');
    sg.fillStyle = g; sg.fillRect(0, 0, sz, sz);
    g = sg.createRadialGradient(128, 128, 106, 128, 128, 128);
    g.addColorStop(0, 'rgba(0,2,10,0)');
    g.addColorStop(1, 'rgba(0,2,10,0.55)');
    sg.fillStyle = g; sg.fillRect(0, 0, sz, sz);
    S.shade = sc;

    /* gloss: small specular hint at the light point */
    const gc = cv(sz, sz), gg = gc.getContext('2d');
    gg.beginPath(); gg.arc(128, 128, 128, 0, TAU); gg.clip();
    g = gg.createRadialGradient(86, 78, 2, 86, 78, 66);
    g.addColorStop(0, 'rgba(255,255,255,0.30)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = g; gg.fillRect(0, 0, sz, sz);
    S.gloss = gc;

    /* scan-band strip for the hologram world */
    const bc = cv(8, 48), bg = bc.getContext('2d');
    g = bg.createLinearGradient(0, 0, 0, 48);
    g.addColorStop(0, 'rgba(160,235,255,0)');
    g.addColorStop(0.5, 'rgba(190,244,255,0.85)');
    g.addColorStop(1, 'rgba(160,235,255,0)');
    bg.fillStyle = g; bg.fillRect(0, 0, 8, 48);
    S.band = bc;
  }

  /* per-world rim sprite: outer atmosphere glow ring, one shadowBlur at GEN time only */
  function buildRim(rgbStr) {
    const c = cv(RIM_S, RIM_S), x = c.getContext('2d'), cx = RIM_S / 2;
    const g = x.createRadialGradient(cx, cx, RIM_PR * 0.92, cx, cx, RIM_PR * 1.44);
    g.addColorStop(0, `rgba(${rgbStr},0.30)`);
    g.addColorStop(0.35, `rgba(${rgbStr},0.15)`);
    g.addColorStop(1, `rgba(${rgbStr},0)`);
    x.fillStyle = g; x.fillRect(0, 0, RIM_S, RIM_S);
    x.globalCompositeOperation = 'destination-out';   /* keep the glow OFF the disc */
    x.beginPath(); x.arc(cx, cx, RIM_PR * 0.97, 0, TAU); x.fill();
    x.globalCompositeOperation = 'source-over';
    x.strokeStyle = `rgba(${rgbStr},0.9)`; x.lineWidth = 1.8;
    x.shadowColor = `rgb(${rgbStr})`; x.shadowBlur = 10;
    x.beginPath(); x.arc(cx, cx, RIM_PR + 1, 0, TAU); x.stroke();
    return c;
  }

  function buildClouds(rnd, r, g2, b, gate, gain) {
    const w2 = 256, h2 = 128, c = cv(w2, h2), t2 = c.getContext('2d');
    const fb = makeFbm(rnd, 5, 3, 3);
    const img = t2.createImageData(w2, h2); const d = img.data; let i = 0;
    for (let yy = 0; yy < h2; yy++) {
      const v = yy / h2;
      for (let xx = 0; xx < w2; xx++) {
        const n = fb(xx / w2, v);
        let a = n > gate ? (n - gate) * gain : 0; if (a > 0.85) a = 0.85;
        d[i++] = r; d[i++] = g2; d[i++] = b; d[i++] = (a * 255) | 0;
      }
    }
    t2.putImageData(img, 0, 0);
    return c;
  }

  /* ---------- per-world surface builders ---------- */
  function buildDust(rnd, tctx) {
    const fb = makeFbm(rnd, 6, 4, 4), warp = makeFbm(rnd, 3, 2, 3), rid = makeFbm(rnd, 8, 5, 3);
    const L = makeLut([[0, '#1c1030'], [0.35, '#5a2c4a'], [0.55, '#a34d3f'], [0.75, '#ff7a45'], [1, '#ffcf8e']]);
    paintBase(tctx, TEX_W, TEX_H, L, (u, v) => {
      const band = 0.5 + 0.5 * Math.sin(v * 19 + warp(u, v) * 4.2);   /* dune striations, noise-warped */
      let n = fb(u, v) * 0.62 + band * 0.38;
      n = (n - 0.5) * 1.5 + 0.5;
      const rg = 1 - Math.abs(2 * rid(u, v) - 1);                     /* ridged: canyon veins */
      if (rg > 0.86) n *= 0.5;
      return n;
    });
    for (let i = 0; i < 3; i++) {                                     /* crater rings, wrap-safe */
      const cx = rnd() * TEX_W, cy = TEX_H * (0.22 + rnd() * 0.5), cr = 9 + rnd() * 14;
      wrapped(tctx, () => {
        tctx.fillStyle = 'rgba(20,8,26,0.38)';
        tctx.beginPath(); tctx.arc(cx, cy, cr, 0, TAU); tctx.fill();
        tctx.strokeStyle = 'rgba(255,205,150,0.5)'; tctx.lineWidth = 1.6;
        tctx.beginPath(); tctx.arc(cx, cy, cr, -2.6, 0.5); tctx.stroke();
        tctx.strokeStyle = 'rgba(30,12,34,0.55)'; tctx.lineWidth = 1.4;
        tctx.beginPath(); tctx.arc(cx, cy, cr * 0.8, 0.6, 2.4); tctx.stroke();
      });
    }
  }

  function buildVelocity(rnd, tctx) {
    const fb = makeFbm(rnd, 6, 4, 4);
    const L = makeLut([[0, '#0a0620'], [0.5, '#12092b'], [0.8, '#241344'], [1, '#341a5e']]);
    paintBase(tctx, TEX_W, TEX_H, L, (u, v) => (fb(u, v) - 0.5) * 1.4 + 0.5);
    /* city-light patches: geometry precomputed ONCE so all 3 wrap copies match */
    const cols = ['rgba(255,46,151,', 'rgba(41,230,255,'];
    const dots = [], lines = [];
    for (let p = 0; p < 13; p++) {
      const px0 = rnd() * TEX_W, py0 = TEX_H * (0.12 + rnd() * 0.7);
      const rows = 2 + (rnd() * 4 | 0), cN = 3 + (rnd() * 5 | 0), sp = 4 + rnd() * 4;
      const ang = (rnd() - 0.5) * 0.9, ca = Math.cos(ang), sa = Math.sin(ang), ci = p % 2;
      for (let rI = 0; rI < rows; rI++) {
        lines.push([px0 - rI * sa * sp, py0 + rI * ca * sp,
          px0 + ((cN - 1) * ca - rI * sa) * sp, py0 + ((cN - 1) * sa + rI * ca) * sp, ci]);
        for (let cI = 0; cI < cN; cI++) {
          dots.push([px0 + (cI * ca - rI * sa) * sp + (rnd() - 0.5) * 1.7,
            py0 + (cI * sa + rI * ca) * sp + (rnd() - 0.5) * 1.7,
            0.6 + rnd() * 0.9, ci, 0.35 + rnd() * 0.6]);
        }
      }
    }
    wrapped(tctx, () => {
      tctx.lineWidth = 0.8;
      for (const ln of lines) {
        tctx.strokeStyle = cols[ln[4]] + '0.10)';
        tctx.beginPath(); tctx.moveTo(ln[0], ln[1]); tctx.lineTo(ln[2], ln[3]); tctx.stroke();
      }
      for (const d2 of dots) {
        tctx.fillStyle = cols[d2[3]] + d2[4].toFixed(2) + ')';
        tctx.beginPath(); tctx.arc(d2[0], d2[1], d2[2], 0, TAU); tctx.fill();
      }
    });
  }

  function buildGrid(rnd, tctx, brightCtx) {
    const fb = makeFbm(rnd, 6, 4, 3);
    const L = makeLut([[0, '#010806'], [0.6, '#02120a'], [1, '#04240f']]);
    paintBase(tctx, TEX_W, TEX_H, L, (u, v) => (fb(u, v) - 0.5) * 1.2 + 0.45);
    /* circuit traces: precomputed manhattan walks, stroked into BOTH layers */
    const traces = [];
    for (let i = 0; i < 24; i++) {
      let X = rnd() * TEX_W, Y = TEX_H * (0.08 + rnd() * 0.84);
      const pts = [X, Y]; let horiz = rnd() < 0.5;
      const segs = 3 + (rnd() * 4 | 0);
      for (let s2 = 0; s2 < segs; s2++) {
        const len = (8 + rnd() * 34) * (rnd() < 0.5 ? -1 : 1);
        if (horiz) X += len; else Y = Math.max(4, Math.min(TEX_H - 4, Y + len * 0.6));
        pts.push(X, Y); horiz = !horiz;
      }
      traces.push(pts);
    }
    const strokeAll = (g2, core, dot, wdt, dr) => {
      for (let o = -1; o <= 1; o++) {
        g2.save(); g2.translate(o * TEX_W, 0);
        g2.strokeStyle = core; g2.lineWidth = wdt; g2.lineJoin = 'miter';
        for (const pts of traces) {
          g2.beginPath(); g2.moveTo(pts[0], pts[1]);
          for (let k = 2; k < pts.length; k += 2) g2.lineTo(pts[k], pts[k + 1]);
          g2.stroke();
          g2.fillStyle = dot;
          for (let k = 0; k < pts.length; k += 2) { g2.beginPath(); g2.arc(pts[k], pts[k + 1], dr, 0, TAU); g2.fill(); }
        }
        g2.restore();
      }
    };
    strokeAll(tctx, 'rgba(52,255,136,0.5)', 'rgba(184,255,217,0.75)', 1, 1.2);
    brightCtx.shadowColor = '#34ff88'; brightCtx.shadowBlur = 4;   /* gen-time only */
    strokeAll(brightCtx, 'rgba(52,255,136,0.95)', 'rgba(234,255,243,1)', 1.8, 1.8);
    brightCtx.shadowBlur = 0;
  }

  function buildAbyssal(rnd, tctx) {
    const fb = makeFbm(rnd, 6, 4, 4);
    const L = makeLut([[0, '#020a16'], [0.45, '#03121f'], [0.7, '#0a3e52'], [0.88, '#12907e'], [1, '#35f0c8']]);
    paintBase(tctx, TEX_W, TEX_H, L, (u, v) => (fb(u, v) - 0.5) * 1.45 + 0.42);
    /* bioluminescent filaments: integer-frequency sinusoids wrap perfectly */
    tctx.lineWidth = 1;
    for (let f = 0; f < 8; f++) {
      const y0 = TEX_H * (0.15 + rnd() * 0.7), amp = 6 + rnd() * 16;
      const k = 1 + (rnd() * 3 | 0), ph = rnd() * TAU;
      tctx.strokeStyle = f % 3 === 0 ? 'rgba(143,123,255,0.28)' : 'rgba(124,242,255,0.26)';
      tctx.beginPath();
      for (let xx = 0; xx <= TEX_W; xx += 6) {
        const yy = y0 + Math.sin((xx / TEX_W) * TAU * k + ph) * amp;
        if (xx === 0) tctx.moveTo(xx, yy); else tctx.lineTo(xx, yy);
      }
      tctx.stroke();
    }
  }

  function buildArcadia(rnd) {
    const c = cv(64, 32), t2 = c.getContext('2d');       /* PIXEL planet: tiny + nearest */
    const fb = makeFbm(rnd, 5, 3, 3);
    const PAL = [[10, 10, 18], [23, 61, 29], [125, 255, 90], [255, 210, 63], [255, 71, 87]];
    const img = t2.createImageData(64, 32); const d = img.data; let i = 0;
    for (let yy = 0; yy < 32; yy++) {
      for (let xx = 0; xx < 64; xx++) {
        const n = (fb(xx / 64, yy / 32) - 0.5) * 1.5 + 0.5;
        let idx = n < 0.38 ? 0 : n < 0.55 ? 1 : n < 0.7 ? 2 : n < 0.84 ? 3 : 4;
        if (rnd() < 0.012) idx = 4;                       /* scattered hot pixels */
        const p = PAL[idx];
        d[i++] = p[0]; d[i++] = p[1]; d[i++] = p[2]; d[i++] = 255;
      }
    }
    t2.putImageData(img, 0, 0);
    return c;
  }

  function buildAurora(rnd, tctx) {
    const fb = makeFbm(rnd, 6, 4, 4), warp = makeFbm(rnd, 3, 2, 3);
    const L = makeLut([[0, '#4d6a91'], [0.4, '#7d9cc4'], [0.7, '#a8e9ff'], [0.9, '#e8f6ff'], [1, '#ffffff']]);
    paintBase(tctx, TEX_W, TEX_H, L, (u, v) => {
      let n = (fb(u, v) - 0.5) * 1.1 + 0.42 + 0.05 * Math.sin(v * 26 + warp(u, v) * 5);
      const cap = sstep(0.2, 0.04, v) + sstep(0.8, 0.96, v);          /* polar cap bands */
      return n + cap * 0.55;
    });
  }

  /* fallback for unknown slugs: a generic noise ball in the world hue */
  function buildGeneric(rnd, tctx, a) {
    const fb = makeFbm(rnd, 6, 4, 4);
    const hx = (arr) => '#' + arr.map(n => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0')).join('');
    const L = makeLut([[0, hx(a.map(n => n * 0.12))], [0.6, hx(a.map(n => n * 0.55))], [1, hx(a.map(n => Math.min(255, n * 1.1 + 40)))]]);
    paintBase(tctx, TEX_W, TEX_H, L, (u, v) => (fb(u, v) - 0.5) * 1.4 + 0.5);
  }

  /* ---------- registry ---------- */
  const P = Object.create(null);
  let inited = false;

  function buildWorld(w) {
    const rnd = mulberry(seedOf(w.slug));
    const rgbStr = w.a.join(',');
    const p = {
      tex: null, bright: null, cloud: null, cloudA: 0,
      rim: buildRim(rgbStr),
      spin: (w.speed || 0.05) * 8e-4,      /* rotations per ms: full turn every ~18-33s */
      cloudSpin: 0, su: rnd(),             /* su: the frozen reduced-motion pose */
      tell: w.tell || '', pixel: false, holo: false, crown: false,
      holoFill: '', holoLine: '', holoFront: '',
    };
    p.cloudSpin = p.spin * 0.62;
    if (w.slug === 'uncharted') {
      p.holo = true;
      p.holoFill = `rgba(${rgbStr},0.07)`;
      p.holoLine = `rgba(${rgbStr},0.34)`;
      p.holoFront = 'rgba(150,232,255,0.62)';
      return p;
    }
    if (w.slug === 'arcadia') { p.pixel = true; p.tex = buildArcadia(rnd); return p; }
    const c = cv(TEX_W, TEX_H), tctx = c.getContext('2d');
    p.tex = c;
    switch (w.slug) {
      case 'dust-sea':
        buildDust(rnd, tctx);
        p.cloud = buildClouds(rnd, 255, 220, 170, 0.62, 2.2); p.cloudA = 0.32; break;
      case 'velocity': buildVelocity(rnd, tctx); break;
      case 'grid': {
        const b = cv(TEX_W, TEX_H);
        buildGrid(rnd, tctx, b.getContext('2d'));
        p.bright = b; break;
      }
      case 'abyssal':
        buildAbyssal(rnd, tctx);
        p.cloud = buildClouds(rnd, 235, 250, 255, 0.58, 2.6); p.cloudA = 0.5; break;
      case 'aurora': buildAurora(rnd, tctx); p.crown = true; break;
      default: buildGeneric(rnd, tctx, w.a);
    }
    return p;
  }

  /* ---------- per-frame pieces (no objects/arrays/closures allocated) ---------- */
  function tellGlow(tell, t, rm) {
    if (rm) return 0.12;
    switch (tell) {
      case 'heat': return 0.10 * (0.5 + 0.5 * Math.sin(t * 2.1));
      case 'pulse': return Math.sin(t * 6) > 0.72 ? 0.22 : 0;
      case 'breathe': return 0.14 * (0.5 + 0.5 * Math.sin(t * 0.8));
      case 'glint': return Math.sin(t * 0.9 + 2) > 0.985 ? 0.5 : 0.06;
      case 'rain': return Math.sin(t * 9) > 0.6 ? 0.14 : 0;
      default: return 0.1;
    }
  }

  const CROWN = ['rgba(126,255,178,', 'rgba(186,150,255,', 'rgba(216,255,242,'];
  function drawCrown(g, x, y, r, t, rm) {
    g.save(); g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const a = rm ? 0.3 : 0.16 + 0.22 * (0.5 + 0.5 * Math.sin(t * (0.5 + i * 0.21) + i * 2.1));
      const wob = rm ? 0 : 0.10 * Math.sin(t * 0.4 + i * 1.4);
      g.strokeStyle = CROWN[i] + a.toFixed(3) + ')';
      g.lineWidth = 1.6 + i * 0.5;
      g.beginPath();
      g.arc(x, y + r * 0.16, r * (1.10 + i * 0.13), Math.PI * (1.18 + wob), Math.PI * (1.82 - wob));
      g.stroke();
    }
    g.restore();
  }

  function drawHolo(g, p, x, y, r, tMs, rm) {
    g.fillStyle = p.holoFill;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    g.lineWidth = 1;
    g.strokeStyle = p.holoLine;
    for (let i = -1; i <= 1; i++) {                       /* latitude rings */
      const h2 = i * 0.5 * r;
      const lr = Math.sqrt(Math.max(0, r * r - h2 * h2));
      g.beginPath(); g.ellipse(x, y + h2, lr, lr * 0.22, 0, 0, TAU); g.stroke();
    }
    const ph = rm ? p.su * TAU : tMs * 0.00045;           /* meridians rotate */
    for (let k = 0; k < 4; k++) {
      const cph = Math.cos(ph + k * (Math.PI / 4));
      g.strokeStyle = cph > 0 ? p.holoFront : p.holoLine;
      g.beginPath();
      g.ellipse(x, y, Math.max(0.5, Math.abs(cph) * r * 0.98), r * 0.98, 0, 0, TAU);
      g.stroke();
    }
    const prog = rm ? 0.32 : ((tMs * 0.00028) % 1.3) - 0.15;   /* scanning band sweep */
    g.globalAlpha = 0.5;
    g.drawImage(S.band, x - r, y - r + prog * r * 2 - r * 0.17, r * 2, r * 0.34);
    g.globalAlpha = 1;
  }

  function render(g, p, x, y, r, tMs, hover, rm) {
    const t = tMs / 1000;
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
    if (p.holo) {
      drawHolo(g, p, x, y, r, tMs, rm);
      g.globalAlpha = 0.45;                               /* light shade keeps the hologram airy */
      g.drawImage(S.shade, x - r, y - r, r * 2, r * 2);
      g.globalAlpha = 1;
    } else {
      const dw = r * 4;                                   /* all textures are 2:1 */
      let rot = rm ? p.su : (tMs * p.spin) % 1;
      if (p.pixel) { g.imageSmoothingEnabled = false; rot = Math.floor(rot * 48) / 48; }  /* stepped 8-bit spin */
      const shift = (((rot % 1) + 1) % 1) * dw;
      g.drawImage(p.tex, x - r - shift, y - r, dw, r * 2);
      g.drawImage(p.tex, x - r - shift + dw, y - r, dw, r * 2);
      if (p.bright) {                                     /* grid: circuit pulse crossfade */
        g.globalAlpha = rm ? 0.34 : 0.16 + 0.34 * (0.5 + 0.5 * Math.sin(t * 2.2 + 1.3));
        g.drawImage(p.bright, x - r - shift, y - r, dw, r * 2);
        g.drawImage(p.bright, x - r - shift + dw, y - r, dw, r * 2);
        g.globalAlpha = 1;
      }
      if (p.cloud) {                                      /* slower second layer, screen blend */
        const cdw = dw * 1.15;
        const crot = rm ? p.su * 0.6 : (tMs * p.cloudSpin) % 1;
        const cshift = (((crot % 1) + 1) % 1) * cdw;
        g.globalCompositeOperation = 'screen';
        g.globalAlpha = p.cloudA;
        g.drawImage(p.cloud, x - r - cshift, y - r, cdw, r * 2);
        g.drawImage(p.cloud, x - r - cshift + cdw, y - r, cdw, r * 2);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      if (p.pixel) g.imageSmoothingEnabled = true;
      g.drawImage(S.shade, x - r, y - r, r * 2, r * 2);
      g.drawImage(S.gloss, x - r, y - r, r * 2, r * 2);
      if (p.tell === 'glint' && !rm && Math.sin(t * 0.9 + 2) > 0.985) {
        g.globalAlpha = 0.7;                              /* the rare ice glint */
        g.drawImage(S.gloss, x - r, y - r, r * 2, r * 2);
        g.globalAlpha = 1;
      }
    }
    g.restore();
    if (p.crown) drawCrown(g, x, y, r, t, rm);            /* aurora crown floats above the pole */
    let ra = 0.72 + tellGlow(p.tell, t, rm) + (hover ? 0.28 : 0);
    if (ra > 1) ra = 1;
    g.globalAlpha = ra;
    const rs = r * RIM_DRAW;
    g.drawImage(p.rim, x - rs / 2, y - rs / 2, rs, rs);
    g.globalAlpha = 1;
  }

  /* ---------- API ---------- */
  return {
    /* staged bake (M2): the boot used to run ~12M synchronous noise evals at
       the exact brochure→app flip. Now the shared sprites bake at once and
       the eleven worlds land one per idle slice — draw() no-ops for a world
       still in the oven, and progress() lets the sky materialize it. */
    init(worlds, onReady) {
      if (inited) return;
      inited = true;
      /* hover:none keeps half-res to true touch devices: a 680px desktop
         window maximized later must not live with a mushy upscale all
         session (rotated phones stay sharp — short viewports cap R low) */
      if (matchMedia('(max-width: 700px) and (hover: none)').matches) { TEX_W = 256; TEX_H = 128; }
      buildShared();
      const queue = worlds.slice();
      /* the timeout matters: the ambient rAF loop never leaves true idle
         time, so an unbounded requestIdleCallback would starve forever */
      const later = window.requestIdleCallback
        ? (f) => requestIdleCallback(f, { timeout: 90 })
        : (f) => setTimeout(f, 16);
      const bakeNext = () => {
        const w = queue.shift();
        if (!w) return;
        if (!P[w.slug]) {
          P[w.slug] = buildWorld(w);
          P[w.slug].born = performance.now();
          if (onReady) onReady(w.slug);
        }
        later(bakeNext);
      };
      later(bakeNext);
    },
    /* 0 = not baked yet · (0,1] = materializing → settled.
       Never returns exactly 0 for a BAKED world (coarse timers would read
       "same-millisecond" as "still in the oven"), and under reduced motion
       a baked world is simply THERE — no half-materialized ghosts with no
       animation loop to finish them. */
    progress(slug) {
      const p = P[slug];
      if (!p) return 0;
      if (!p.born) return 1;
      if (docEl.classList.contains('rm')) { p.born = 0; return 1; }
      const k = (performance.now() - p.born) / 500;
      if (k >= 1) { p.born = 0; return 1; }
      return Math.max(k, 0.002);
    },
    draw(ctx2, slug, x, y, r, clockMs, opts) {
      if (!inited || r <= 0) return;
      const p = P[slug]; if (!p) return;
      render(ctx2, p, x, y, r, clockMs,
        !!(opts && opts.hover), !!(opts && opts.rm));
    },
    drawMini(ctx2, slug, size, clockMs) {
      if (!inited) return;
      const p = P[slug]; if (!p) return;
      render(ctx2, p, size / 2, size / 2, size * 0.42, clockMs,
        false, docEl.classList.contains('rm'));
    },
  };
})();
/* the engine guards its calls with `window.PlanetForge` (mirrors SphereForge/
   WorldFX): expose it, or the medallions and phone minis silently no-op */
window.PlanetForge = PlanetForge;
