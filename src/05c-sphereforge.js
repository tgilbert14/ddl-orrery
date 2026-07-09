/* ============================================================
   05c-sphereforge.js — SphereForge: the Artifact.
   A huge flawless liquid-gold sphere. It does not rotate: the
   surface FLOWS. A horizontally seamless gold texture is baked
   DOUBLED (1024px) so a scrolling slice is always ONE drawImage
   with no wrap seam; 24 fixed slices each take a per-frame sine
   x-nudge — the molten-skin illusion. Everything else is prebaked
   sprites. Zero external assets. No text in canvas. All original.
   Per-frame cost: 24 slice blits + <=16 sprite blits (shading,
   glosses, wanderer, 9-spot constellation) + <=4 ring strokes;
   zero allocations, zero gradient creation.
   ============================================================ */
'use strict';

const SphereForge = (() => {
  const TAU = Math.PI * 2;
  let TEX_W = 768, TEX_H = 288;            /* gen size; baked doubled to 1536 —
                                              near-1:1 texel:pixel at hub R, so the
                                              hammered grain stays CRISP (metal, not cloud).
                                              Halved on phones (M2): R caps ~150 there and
                                              the bake is 4 fBm fields per pixel */
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
  let pulseSpr = null, rimSpr = null, shadowSpr = null, hotSpr = null;
  const hots = [];                         /* the specular constellation (seeded at init) */
  let su = 0.5, frozenT = 60000;           /* the seeded reduced-motion pose */
  let inited = false;

  function buildBase(rnd) {
    const c = cv(TEX_W, TEX_H), t = c.getContext('2d');
    const fb = makeFbm(rnd, 6, 4, 4), warp = makeFbm(rnd, 3, 2, 3);
    const mid = makeFbm(rnd, 14, 8, 3);      /* mottling between the big forms */
    const micro = makeFbm(rnd, 84, 32, 2);   /* the hammered-foil grain (reference match) */
    /* deep-contrast gold LUT: near-black amber pools up to near-white blooms */
    const L = makeLut([[0, '#2a1a05'], [0.32, '#7d5511'], [0.6, '#d3a02a'], [0.84, '#ffdd75'], [1, '#fffbe8']]);
    const img = t.createImageData(TEX_W, TEX_H); const d = img.data; let i = 0;
    for (let yy = 0; yy < TEX_H; yy++) {
      const v = yy / TEX_H;
      for (let xx = 0; xx < TEX_W; xx++) {
        const u = xx / TEX_W;
        /* molten banding: horizontal bands bent by wrapped noise + a wrapped u-swell */
        const band = 0.5 + 0.5 * Math.sin(v * 14.5 + warp(u, v) * 4.6 + Math.sin(u * TAU) * 0.9);
        let n = fb(u, v) * 0.46 + band * 0.28 + mid(u, v) * 0.26;
        n += (micro(u, v) - 0.5) * 0.26;     /* frosted micro-texture riding the flow */
        n = (n - 0.5) * 1.7 + 0.47;          /* hard stretch, low lift: real dark pools */
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

    /* one hotspot bloom: a BLOWN core like the reference's studio-light
       reflections (drawn 9x at seeded positions; screen blend does the rest) */
    c = cv(96, 96); g = c.getContext('2d');
    gr = g.createRadialGradient(48, 48, 2, 48, 48, 46);
    gr.addColorStop(0, 'rgba(255,254,246,1)');
    gr.addColorStop(0.14, 'rgba(255,250,226,0.62)');
    gr.addColorStop(0.4, 'rgba(255,240,190,0.18)');
    gr.addColorStop(1, 'rgba(255,236,180,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
    hotSpr = c;
  }

  /* ---------- the skin plates: real renders, lazy, crossfaded ----------
     The Commission lifted the no-assets law: the Artifact now wears
     hand-made renders as its faces. The procedural gold stays as the
     instant-boot base (zero-request first paint) and the living light
     (flow sheen, constellation, ripple, sonar) rides on top of both. */
  const SKIN_SRC = {
    orrery: 'assets/artifact/skin-orrery.webp',   /* the hub's face: it IS an orrery */
    molten: 'assets/artifact/skin-molten.webp',
    deco: 'assets/artifact/skin-deco.webp',
    veins: 'assets/artifact/skin-veins.webp',
    machine: 'assets/artifact/skin-machine.webp',
    arcadia: 'assets/artifact/skin-arcadia.webp',
    aurora: 'assets/artifact/skin-aurora.webp',
    uncharted: 'assets/artifact/skin-uncharted.webp',
    biomech: 'assets/artifact/skin-biomech.webp', /* what is underneath (the reveal) */
  };
  const SKIN_OF = {
    hub: 'orrery', 'dust-sea': 'molten', velocity: 'deco', grid: 'machine',
    abyssal: 'veins', arcadia: 'arcadia', aurora: 'aurora', uncharted: 'uncharted',
    /* the v6 worlds borrow the nearest face until their own renders land:
       the Artifact must never go mute when a world is considered (M1) */
    archive: 'uncharted', drillyard: 'machine', stormwall: 'veins', beacons: 'molten',
  };
  const SKIN_COVER = 2.4;                  /* drawn size = R*2.4: the render's disc (~84% of frame) covers the clip */
  const FADE_MS = 650;
  const skins = {};                        /* key -> { img, ready } */
  let curSkin = 'orrery', nxtSkin = null, fadeT0 = 0, wantSkin = 'orrery';
  let revealReq = 0, revealUntil = -1;

  /* the renders are COMPOSED faces — a dial, a city, a lattice. v6 stripped
     them into a scrolling equatorial band to fake rotation, and the band
     shredded every composition into anonymous gold streaks (art-direction
     kill, M2). The face is now drawn PINNED at SKIN_COVER, sliced with the
     liquid warp so the metal still lives; rotation retires for skins (the
     zero-request base gold beneath keeps its flow). */
  const skinRec = (key) => {
    const rec = skins[key];
    return rec && rec.ready ? rec : null;
  };
  function loadSkin(k) {
    if (skins[k] || !SKIN_SRC[k]) return;
    const img = new Image();
    const rec = { img, ready: false };
    skins[k] = rec;
    img.onload = () => {
      rec.ready = true;
      /* rm has no ambient loop: if a hover is still waiting on this face,
         ask the engine for its one designed repaint — otherwise the swap
         is silently lost until some unrelated redraw */
      if (rm() && wantSkin === k && window.Orrery && window.Orrery.requestStatic) window.Orrery.requestStatic();
    };
    img.onerror = () => { delete skins[k]; };          /* a 404 must not wedge the want-latch */
    img.src = SKIN_SRC[k];
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
      /* true-touch phone: half-res gold — R caps ~150 there, and this bake
         sits on the critical brochure→app flip (M2 boot-cost pass).
         hover:none, so a small desktop window never latches the mush. */
      if (matchMedia('(max-width: 700px) and (hover: none)').matches) { TEX_W = 384; TEX_H = 144; }
      const rnd = mulberry(seedOf('artifact'));
      baseTex = buildBase(rnd);
      flowTex = buildFlow(rnd);
      buildSprites();
      /* the constellation: 9 reflections pinned to the LIGHT, not the skin —
         each breathes on its own clock; each rarely FLARES, like something
         bright moving under the surface */
      hots.length = 0;
      for (let i = 0; i < 9; i++) {
        const ha = rnd() * TAU, hr = Math.sqrt(rnd()) * 0.72;
        hots.push({
          x: Math.cos(ha) * hr, y: Math.sin(ha) * hr,
          r: 0.16 + rnd() * 0.22,          /* bloom size, fraction of R */
          ph: rnd() * TAU, rate: 0.0002 + rnd() * 0.0003,
          fi: 18000 + rnd() * 26000,       /* flare interval */
          fo: rnd() * 44000,               /* flare phase offset */
        });
      }
      su = rnd();
      frozenT = 40000 + su * 90000;        /* a sculpted mid-flow pose, seeded */
      /* skins: the hub face loads first (it is the marquee). The rest arrive
         on a lazy stagger ONLY where hover exists and data isn't precious —
         a phone was eating every skin it could never hover (M2); there,
         setSkin lazy-loads the one face a tap actually asks for */
      loadSkin('orrery');
      const eager = matchMedia('(hover: hover)').matches
        && !(navigator.connection && navigator.connection.saveData);
      if (eager) {
        let di = 0;
        for (const k in SKIN_SRC) {
          if (k === 'orrery') continue;
          setTimeout(() => loadSkin(k), 1400 + di++ * 650);
        }
      } else {
        /* even on the lazy path, the reveal's face rides along late: its
           2.6s window must never burn down waiting on a first fetch */
        setTimeout(() => loadSkin('biomech'), 4000);
      }
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

      /* skin state machine: latch wants into fades; latch the reveal */
      if (revealReq) { revealUntil = clockMs + revealReq; revealReq = 0; }
      const revealing = revealUntil > clockMs && skins.biomech && skins.biomech.ready;
      if (wantSkin !== curSkin && !nxtSkin) {
        const wr = skins[wantSkin];
        if (wr && wr.ready) {
          if (reduced2) { curSkin = wantSkin; }        /* rm: an instant, designed swap */
          else { nxtSkin = wantSkin; fadeT0 = clockMs; }
        }
      }
      if (nxtSkin) {
        if ((clockMs - fadeT0) / FADE_MS >= 1) { curSkin = nxtSkin; nxtSkin = null; }
      }
      const recCur = skinRec(revealing ? 'biomech' : curSkin);
      const skinOn = !!recCur;

      g.save();
      g.beginPath(); g.arc(x, y, R, 0, TAU); g.clip();

      if (skinOn) {
        /* THE FACE, PINNED: the render's disc seats over the clip at
           SKIN_COVER, sliced with the two-wave liquid warp so the metal
           still breathes — the composition finally survives to the screen */
        const A2 = R * 0.042;              /* morph amplitude, stronger than v5 */
        const BS = 24;
        const S = R * SKIN_COVER, sy0 = y - S / 2, sdh = S / BS;
        const iw = recCur.img.naturalWidth || recCur.img.width;
        const ih = recCur.img.naturalHeight || recCur.img.height;
        const ish = ih / BS;
        const recNxt = (!revealing && nxtSkin) ? skinRec(nxtSkin) : null;
        const fp = recNxt ? Math.min(1, Math.max(0, (clockMs - fadeT0) / FADE_MS)) : 0;
        for (let i = 0; i < BS; i++) {
          let off = A2 * Math.sin(t * 0.00071 + i * 0.48)
                  + A2 * 0.7 * Math.sin(t * 0.00043 - i * 0.22 + 1.7);
          if (rippling) {                  /* the ripple surges the warp locally
                                              (abs: BOTH hemispheres answer, like the base gold) */
            const sd = Math.abs(sy0 + (i + 0.5) * sdh - y) - ringR;
            off += A2 * 2.4 * env * Math.exp(-(sd * sd) / (2 * SIG2 * R * R))
                 * Math.sin(t * 0.012 + i * 1.3);
          }
          g.drawImage(recCur.img, 0, i * ish, iw, ish,
            x - S / 2 + off, sy0 + i * sdh, S, sdh + 0.5);
          if (recNxt && fp > 0) {
            const iw2 = recNxt.img.naturalWidth || recNxt.img.width;
            const ish2 = (recNxt.img.naturalHeight || recNxt.img.height) / BS;
            g.globalAlpha = fp;
            g.drawImage(recNxt.img, 0, i * ish2, iw2, ish2,
              x - S / 2 + off, sy0 + i * sdh, S, sdh + 0.5);
            g.globalAlpha = 1;
          }
        }
        /* the liquid sheen keeps drifting over the pinned face: living light */
        g.globalCompositeOperation = 'screen';
        g.globalAlpha = reduced2 ? 0.09 : 0.08 + 0.03 * Math.sin(t * 0.0004);
        g.drawImage(flowTex, x - R - pad - fscroll, y - R, dw, D);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      } else {
        /* the molten surface: 24 slices, one seam-free blit each
           (the zero-request base — first paint never waits on a skin byte) */
        const sh = TEX_H / NS, dh = D / NS;
        for (let i = 0; i < NS; i++) {
          let off = A * Math.sin(t * 0.00093 + i * 0.53)
                  + A * 0.6 * Math.sin(t * 0.00061 - i * 0.31 + 2.1);
          if (rippling) {                  /* local amplitude surge near the ring */
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
      }

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

      /* the hotspot constellation: reflections stay pinned while the metal
         flows beneath them; each breathes, and rarely one FLARES. Additive
         blend so the cores genuinely BLOW OUT like over-exposed reflections */
      g.globalCompositeOperation = 'lighter';
      for (let hI = 0; hI < hots.length; hI++) {
        const h = hots[hI];
        /* over a rotating band our own lighting carries the show: the
           constellation stays strong (the band stripped the baked limb) */
        let ha2 = reduced2 ? 0.58 : 0.55 + 0.18 * Math.sin(t * h.rate + h.ph);
        if (skinOn) ha2 *= 0.75;
        let hs2 = h.r * R * 2;
        if (!reduced2) {
          const ft = (t + h.fo) % h.fi;
          if (ft < 2400) {                 /* the flare: 2.4s, sinusoid in and out */
            const fe = Math.sin((ft / 2400) * Math.PI);
            ha2 += fe * 0.45; hs2 *= 1 + 0.3 * fe;
          }
        }
        if (rippling) ha2 += env * 0.2;    /* a disturbance lights the whole constellation */
        /* MUST clamp: canvas IGNORES globalAlpha > 1 (assignment silently
           dropped, previous spot's alpha would leak into this one) */
        g.globalAlpha = ha2 > 1 ? 1 : ha2;
        g.drawImage(hotSpr, x + h.x * R - hs2 / 2, y + h.y * R - hs2 / 2, hs2, hs2);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';

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

    /* the Artifact answers a hover: it wears the face of the world you are
       considering (accepts a world slug or 'hub'; unmapped worlds keep the
       hub face). Crossfaded in draw(); rm gets an instant designed swap. */
    setSkin(slug) {
      wantSkin = SKIN_OF[slug] || 'orrery';
      loadSkin(wantSkin);
    },
    /* the reveal: for a moment the plates part and you see what is
       underneath. The caller times it; the ripple masks the swap. */
    reveal(ms) {
      loadSkin('biomech');
      revealReq = ms || 2600;
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
