/* ============================================================
   05c-sphereforge.js — the Derelict: Object 0.
   The center of the orrery is no longer a sphere. It is a vast
   dead ship, engraved brass over near-black hull, holding the
   middle of the clockwork. The module keeps the SphereForge name
   and API (draw / drawSonar / ripple / ping / setSkin / reveal /
   drawShadowPass) so every engine call site stands unchanged —
   and adds the SHUTTLE: your vessel, docked on the wreck, that
   flies to whichever world you choose (sortie / recall).
   Everything is baked once at init; the per-frame cost is one
   hull blit + a handful of light sprites + the shuttle.
   The score was always ahead of this pivot: the hub arrangement
   has been "the derelict hold" — hull groans, heartbeat, sonar —
   since v3. The picture finally agrees with the sound.
   ============================================================ */
'use strict';

const SphereForge = (() => {
  const TAU = Math.PI * 2;
  const RIPPLE_MS = 1800, SONAR_MS = 3500;
  const BRASS = 'rgba(201,163,92,1)';
  const CREAM = 'rgba(239,228,200,1)';
  const docEl = document.documentElement;

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
  function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  /* ---------- hull-local geometry (bake space: 880x320, spine y=170) ---------- */
  const HL = 880, HH = 320, SPAN = 760;    /* drawn length = R*2.6 → scale = R*2.6/SPAN */
  /* eleven window clusters, stern->bow: one kindles per surveyed world */
  const LIGHTS = [
    [128, 152], [178, 158], [238, 150], [305, 98], [352, 146], [420, 150],
    [482, 156], [545, 150], [608, 152], [672, 148], [726, 150],
  ];
  const HEART = [313, 96];                 /* the one window that never went dark */
  const BEACON = [313, 46];                /* masthead nav light */
  const BRIDGE = [716, 146];               /* the bow display that considers a world */
  const DOCK = [402, 108];                 /* the shuttle's cradle on the spine */
  const ENGINES = [[92, 150], [88, 170], [92, 190]];

  let hullSpr = null, glowSpr = null, shadowSpr = null, shuttleSpr = null;
  let seamSpr = null;                      /* WOW #3: the light that sleeps inside */
  let inited = false, frozenT = 60000;

  function buildGlow() {
    const c = cv(48, 48), g = c.getContext('2d');
    const gr = g.createRadialGradient(24, 24, 1, 24, 24, 24);
    gr.addColorStop(0, 'rgba(255,214,140,0.9)');
    gr.addColorStop(0.4, 'rgba(255,190,110,0.35)');
    gr.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(24, 24, 24, 0, TAU); g.fill();
    return c;
  }
  function hullPath(g) {
    g.beginPath();
    g.moveTo(72, 170);                     /* stern tip */
    g.lineTo(108, 132); g.lineTo(178, 126);
    g.lineTo(232, 118); g.lineTo(292, 122);            /* deck line, uneven */
    g.lineTo(296, 124); g.lineTo(340, 120);
    g.lineTo(430, 116); g.lineTo(452, 136);            /* the step */
    g.lineTo(560, 142); g.lineTo(700, 150);
    g.lineTo(806, 160); g.lineTo(838, 170);            /* the prow */
    g.lineTo(802, 184); g.lineTo(700, 190);
    g.lineTo(560, 196); g.lineTo(470, 204);
    g.lineTo(300, 210); g.lineTo(180, 206);
    g.lineTo(108, 204);
    g.closePath();
  }
  function buildHull(rnd) {
    const c = cv(HL, HH), g = c.getContext('2d');
    /* rim light first: the silhouette glows faint brass (bake-time blur only) */
    g.save();
    g.shadowColor = 'rgba(201,163,92,0.85)'; g.shadowBlur = 16;
    g.fillStyle = 'rgba(20,17,20,1)';
    hullPath(g); g.fill();
    g.restore();
    /* superstructure: the tower + stepped blocks + the bow bridge */
    g.fillStyle = 'rgba(24,20,23,1)';
    g.fillRect(300, 78, 26, 46);           /* the tower */
    g.fillRect(340, 98, 34, 24);
    g.fillRect(382, 106, 26, 16);
    g.fillRect(252, 104, 30, 18);
    g.fillRect(694, 132, 40, 20);          /* bow bridge */
    /* keel fin + a stern vane */
    g.beginPath(); g.moveTo(430, 206); g.lineTo(458, 254); g.lineTo(498, 206); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(120, 132); g.lineTo(104, 96); g.lineTo(146, 128); g.closePath(); g.fill();
    /* antenna mast + a snapped one (derelict) */
    g.strokeStyle = 'rgba(140,116,74,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(313, 78); g.lineTo(313, 48); g.stroke();
    g.beginPath(); g.moveTo(600, 142); g.lineTo(616, 118); g.stroke();
    g.beginPath(); g.moveTo(616, 118); g.lineTo(624, 112); g.stroke();  /* bent tip */
    /* engines: three cold nozzles */
    g.fillStyle = 'rgba(10,8,10,1)';
    for (const [ex, ey] of ENGINES) { g.beginPath(); g.arc(ex, ey, 8, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(201,163,92,0.4)'; g.lineWidth = 1.4;
    for (const [ex, ey] of ENGINES) { g.beginPath(); g.arc(ex, ey, 8, 0, TAU); g.stroke(); }
    /* clip to the hull for surface detail */
    g.save();
    hullPath(g); g.clip();
    /* deck sheen: one long soft brass gradient along the spine */
    const sh = g.createLinearGradient(0, 120, 0, 214);
    sh.addColorStop(0, 'rgba(201,163,92,0.20)');
    sh.addColorStop(0.35, 'rgba(201,163,92,0.05)');
    sh.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = sh; g.fillRect(60, 110, 790, 150);
    /* seeded panel seams + patch plates + a few scars (geometry RECORDED so
       the light layer below can re-stroke the exact same apertures) */
    const seamRec = [], scarRec = [];
    for (let x = 96; x < 830; x += 18 + rnd() * 26) {
      g.strokeStyle = `rgba(201,163,92,${0.05 + rnd() * 0.09})`;
      g.lineWidth = 1;
      const dr = (rnd() - 0.5) * 8;
      g.beginPath(); g.moveTo(x, 120); g.lineTo(x + dr, 212); g.stroke();
      seamRec.push([x, dr]);
    }
    for (let i = 0; i < 9; i++) {
      g.fillStyle = `rgba(201,163,92,${0.03 + rnd() * 0.05})`;
      g.fillRect(120 + rnd() * 640, 128 + rnd() * 64, 18 + rnd() * 40, 8 + rnd() * 18);
    }
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3;
    for (let i = 0; i < 3; i++) {          /* old wounds */
      const sx = 200 + rnd() * 480, sy = 140 + rnd() * 50;
      const ex2 = sx + 16 + rnd() * 26, ey2 = sy + (rnd() - 0.5) * 18;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex2, ey2); g.stroke();
      scarRec.push([sx, sy, ex2, ey2]);
    }
    /* portholes: a long row, all dark. The living ones draw live. */
    g.fillStyle = 'rgba(70,58,42,0.55)';
    for (let x = 150; x < 780; x += 34 + rnd() * 10) {
      g.beginPath(); g.arc(x, 166 + (rnd() - 0.5) * 6, 2.2, 0, TAU); g.fill();
    }
    g.restore();
    /* one bite out of the silhouette: something hit it, long ago */
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(520, 118, 14, 0, TAU); g.fill();
    g.beginPath(); g.arc(640, 194, 10, 0, TAU); g.fill();
    g.restore();

    /* WHAT SLEEPS INSIDE IS LIGHT (WOW board #3): the same seams and wounds,
       baked once more as apertures — gold pours from them when the plates
       part, and an awakened ship keeps them faintly warm forever. Bake-time
       blur only; runtime is one 'lighter' blit. */
    const lc = cv(HL, HH), lg = lc.getContext('2d');
    lg.shadowColor = 'rgba(255,214,140,0.9)'; lg.shadowBlur = 7;
    lg.strokeStyle = 'rgba(255,224,160,0.5)'; lg.lineWidth = 1.4;
    for (const [x, dr] of seamRec) {
      lg.beginPath(); lg.moveTo(x, 122); lg.lineTo(x + dr, 210); lg.stroke();
    }
    lg.shadowBlur = 12; lg.lineWidth = 3.2;
    lg.strokeStyle = 'rgba(255,232,178,0.9)';
    for (const [a1, b1, a2, b2] of scarRec) {
      lg.beginPath(); lg.moveTo(a1, b1); lg.lineTo(a2, b2); lg.stroke();
    }
    lg.shadowBlur = 0;
    const bite = (bx, by, br) => {           /* the wounds spill hardest */
      const gr2 = lg.createRadialGradient(bx, by, 1, bx, by, br * 2.6);
      gr2.addColorStop(0, 'rgba(255,236,190,0.85)');
      gr2.addColorStop(0.4, 'rgba(255,210,130,0.3)');
      gr2.addColorStop(1, 'rgba(255,210,130,0)');
      lg.fillStyle = gr2;
      lg.beginPath(); lg.arc(bx, by, br * 2.6, 0, TAU); lg.fill();
    };
    bite(520, 118, 14); bite(640, 194, 10);
    const ray = (bx, by, ang, len, w2) => {  /* thin god-rays leaning off the hull */
      lg.save(); lg.translate(bx, by); lg.rotate(ang);
      const rg = lg.createLinearGradient(0, 0, len, 0);
      rg.addColorStop(0, 'rgba(255,228,170,0.18)');
      rg.addColorStop(1, 'rgba(255,228,170,0)');
      lg.fillStyle = rg;
      lg.beginPath(); lg.moveTo(0, 0); lg.lineTo(len, -w2); lg.lineTo(len, w2); lg.closePath(); lg.fill();
      lg.restore();
    };
    ray(520, 118, -1.9, 120, 26); ray(640, 194, 1.25, 100, 22);
    seamSpr = lc;
    return c;
  }
  function buildShadow() {
    const c = cv(128, 128), g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, 'rgba(2,8,7,0.85)');
    gr.addColorStop(0.55, 'rgba(2,8,7,0.4)');
    gr.addColorStop(1, 'rgba(2,8,7,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  }
  function buildShuttle() {
    const c = cv(44, 18), g = c.getContext('2d');
    g.fillStyle = '#c9a35c';
    g.beginPath();
    g.moveTo(3, 9); g.lineTo(14, 4.5); g.lineTo(34, 6); g.lineTo(41, 9);
    g.lineTo(34, 12); g.lineTo(14, 13.5); g.closePath(); g.fill();
    g.fillStyle = '#efe4c8';
    g.beginPath(); g.moveTo(30, 6.6); g.lineTo(37, 9); g.lineTo(30, 11.4); g.closePath(); g.fill();
    g.fillStyle = 'rgba(20,17,20,1)';
    g.beginPath(); g.arc(28, 9, 2.2, 0, TAU); g.fill();   /* canopy */
    g.fillRect(3, 7.4, 3, 3.2);                            /* the nozzle */
    g.fillStyle = '#8a6f3e';
    g.beginPath(); g.moveTo(12, 5); g.lineTo(8, 0); g.lineTo(16, 4); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(12, 13); g.lineTo(8, 18); g.lineTo(16, 14); g.closePath(); g.fill();
    return c;
  }

  /* ---------- runtime state (pooled) ---------- */
  let ripplePending = false, rippleT0 = -1, pending = 0;
  const rings = [{ on: false, born: 0 }, { on: false, born: 0 }, { on: false, born: 0 }];
  const rm = () => docEl.classList.contains('rm');
  let revealReq = 0, revealUntil = -1;
  let accR = 201, accG = 163, accB = 92, accPulse = -1e9, accPulseReq = false, accPulseDelay = 0;
  /* IGNITION (WOW board #2): the rite's clock. riteT0 sits at -1e9 forever
     unless the rite fires THIS session — and every expression below is built
     so that huge elapsed = the settled post-rite pose, which is exactly what
     a returning master surveyor should find. */
  let riteT0 = -1e9, riteReq = false, paradeReq = false;
  let greetT0 = -1e9, greetReq = false;    /* the third-visit greeting (WOW #12) */
  let stirT0 = -1e9, stirReq = false;      /* the two-minute liturgy (WOW #12) */
  let heartCueAt = -1e9, groanCueAt = -1e9; /* the conductor's cues (WOW #8), perf-clock */
  let studyA = null, studyLit = -1;        /* the bridge's study list, baked per survey */
  /* she moors off the world's limb, never on its face (WOW #7) */
  const moor = (tgt) => ({ x: tgt.x + (tgt.r || 0) * 0.95, y: tgt.y - (tgt.r || 0) * 1.15 });
  /* the shuttle: dock -> fly -> return -> dock. Sorties latch into draw()
     (the ripplePending pattern) so the module never needs its own clock. */
  const shu = {
    mode: 'dock', t0: 0, sx: 0, sy: 0, get: null, dur: 760,
    px: 0, py: 0, hd: 0, dockX: 0, dockY: 0,
    trail: new Float32Array(48), tn: 0, th: -1, tacc: 0,
    lampUntil: 0,                          /* the dock lamp holds a beat after the clamps take her */
  };
  let sortieReq = null, recallReq = false;
  /* THE KINDLING (WOW board #6): when a survey comes home, a spark leaves the
     dock and runs the spine to the newest window cluster — the light you just
     earned kindles WHILE YOU WATCH. Latched when `lit` grows; runs once docked. */
  let prevLit = -1, kindleIdx = -1, kindlePending = false, kindleT0 = -1e9;

  function easeIO(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }

  return {
    init() {
      if (inited) return;
      inited = true;
      const rnd = mulberry(seedOf('object-0'));
      glowSpr = buildGlow();
      hullSpr = buildHull(rnd);
      shadowSpr = buildShadow();
      shuttleSpr = buildShuttle();
      frozenT = 40000 + rnd() * 90000;
    },

    draw(g, x, y, R, clockMs, opts) {
      if (!inited || R <= 0) return;
      const reduced2 = !!(opts && opts.rm);
      const t = reduced2 ? frozenT : clockMs;
      const pn = reduced2 ? -1 : performance.now();    /* the conductor speaks perf-time */
      const s = (R * 2.6) / SPAN;

      if (reduced2) { ripplePending = false; rippleT0 = -1; }
      else if (ripplePending) { rippleT0 = clockMs; ripplePending = false; }
      let rp = -1;
      if (rippleT0 >= 0) {
        rp = (clockMs - rippleT0) / RIPPLE_MS;
        if (rp >= 1) { rippleT0 = -1; rp = -1; }
      }
      const env = rp >= 0 ? Math.sin(rp * Math.PI) : 0;

      /* survey state, read straight off the engine's own set (same bundle) */
      const lit = (typeof surveyed !== 'undefined') ? surveyed.size : 0;
      const total = (typeof WORLDS !== 'undefined') ? WORLDS.length : 11;
      if (revealReq) { revealUntil = clockMs + revealReq; revealReq = 0; }
      if (accPulseReq) { accPulse = clockMs + accPulseDelay; accPulseReq = false; }
      if (riteReq) { riteT0 = clockMs; riteReq = false; }
      if (greetReq) { greetT0 = clockMs; greetReq = false; }
      if (stirReq) { stirT0 = clockMs; stirReq = false; }
      const riteEl = clockMs - riteT0;       /* enormous when no rite ran: the settled pose */
      if (lit !== studyLit) {                /* rebuilt only when the survey grows: zero per-frame alloc */
        studyLit = lit;
        studyA = null;
        if (lit >= 8 && typeof WORLDS !== 'undefined' && typeof surveyed !== 'undefined') {
          studyA = [];
          for (const w2 of WORLDS) if (surveyed.has(w2.slug)) studyA.push(w2.a);
        }
      }
      const awake = lit >= total;
      const ghost = revealUntil > clockMs;   /* the reveal: for a moment, all decks answer */
      const wakeK = awake ? 1 : ghost ? Math.min(1, (revealUntil - clockMs) / 600) : 0;
      /* a new survey aboard: hold the newest light dark until its spark lands
         (bounded: the hull has exactly eleven decks, whatever the set claims) */
      if (prevLit >= 0 && lit > prevLit && lit <= LIGHTS.length && !reduced2) { kindleIdx = lit - 1; kindlePending = true; }
      prevLit = lit;
      if (kindlePending && shu.mode === 'dock') { kindlePending = false; kindleT0 = clockMs + 250; }
      const kindleK = kindleIdx >= 0 ? (clockMs - kindleT0) / 700 : 9;

      /* attitude: a very slow drift; reduced motion holds the seeded pose.
         An awakened ship rides TRIMMED — nose eased up, kept forever (the
         rite eases it in live; every later visit boots straight into it) */
      const trim = awake ? -0.011 * Math.max(0, Math.min(1, (riteEl - 4000) / 3000)) : 0;
      const bob = reduced2 ? 0 : Math.sin(t * 0.00021) * R * 0.022;
      /* THE STRAIN (WOW #8): when the pressure hull groans in your ears, the
         frame flexes a fraction of a degree with it — mass you can hear */
      const strainK = (pn - groanCueAt) / 2800;
      const tilt = (reduced2 ? 0.006 : Math.sin(t * 0.00013 + 1.2) * 0.016) + trim
        + (strainK > 0 && strainK < 1 ? 0.004 * Math.sin(Math.PI * strainK) : 0);

      g.save();
      g.translate(x, y + bob);
      g.rotate(tilt);
      g.scale(s, s);

      g.drawImage(hullSpr, -HL / 2 + (HL / 2 - (72 + 838) / 2), -170, HL, HH);
      /* ^ recenters the hull span (72..838) on the origin */

      const ox = HL / 2 - (72 + 838) / 2;  /* same offset for every local point */
      const L = (lx) => lx + ox - HL / 2;

      /* THE POUR (WOW #3): during a reveal the light inside escapes at full
         strength; an awakened ship keeps her seams faintly warm forever */
      const pourK = ghost ? wakeK : awake ? 0.3 : 0;
      if (pourK > 0.01 && seamSpr) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = pourK * (reduced2 ? 0.85 : 0.72 + 0.16 * Math.sin(t * 0.0021));
        g.drawImage(seamSpr, -HL / 2 + (HL / 2 - (72 + 838) / 2), -170, HL, HH);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      const Y = (ly) => ly - 170;

      /* the running lights: one deck kindles per surveyed world */
      for (let i = 0; i < LIGHTS.length; i++) {
        const on = i < lit || wakeK > 0;
        if (!on) continue;
        /* the newest light waits dark for its spark, then blooms as it lands */
        if (i === kindleIdx && (kindlePending || kindleK < 1)) continue;
        let a = (i < lit ? 0.85 : 0) + (i < lit ? 0 : wakeK * 0.7);
        if (i === kindleIdx && kindleK < 1.6) a = Math.min(1, a + (1.6 - kindleK) * 0.8);
        /* the ignition's first tell: the lights stop twinkling out of phase —
           unison sweeps stern to bow during the rite and HOLDS forever after
           (awake + a long-past riteT0 resolves to full unison at boot) */
        const uni = awake ? Math.max(0, Math.min(1, (riteEl - 300 - i * 340) / 900)) : 0;
        const tw = 0.75 + 0.25 * Math.sin(t * 0.0011 + i * 1.9 * (1 - uni));
        g.globalAlpha = a * tw;
        g.fillStyle = CREAM;
        g.fillRect(L(LIGHTS[i][0]) - 1.6, Y(LIGHTS[i][1]) - 1.6, 3.2, 3.2);
        g.globalAlpha = a * tw * 0.6;
        g.drawImage(glowSpr, L(LIGHTS[i][0]) - 11, Y(LIGHTS[i][1]) - 11, 22, 22);
      }
      /* the ship wakes by degrees (WOW #12): at four surveys a window you
         did NOT earn smolders alive on its own — it is reading your notes */
      if (lit >= 4 && lit < total && LIGHTS[lit]) {
        const sm = 0.5 + 0.5 * Math.sin(t * 0.0007 + 2);   /* slow swell: strobe-safe */
        const rl = LIGHTS[lit];
        g.globalAlpha = 0.22 * sm;
        g.fillStyle = CREAM;
        g.fillRect(L(rl[0]) - 1.4, Y(rl[1]) - 1.4, 2.8, 2.8);
        g.globalAlpha = 0.15 * sm;
        g.drawImage(glowSpr, L(rl[0]) - 9, Y(rl[1]) - 9, 18, 18);
      }
      /* THE LITURGY: once per visit, unwatched, a work-light stutters on
         behind one dead window, walks a few plates, and dies */
      const sk = (clockMs - stirT0) / 3200;
      if (sk >= 0 && sk < 1) {
        const si = ((stirT0 / 1000) | 0) % LIGHTS.length;
        const sl = LIGHTS[si];
        const se = Math.sin(Math.PI * sk);
        const sweep = (sk - 0.5) * 10;
        g.globalAlpha = 0.5 * se;
        g.fillStyle = 'rgba(255,236,190,1)';
        g.fillRect(L(sl[0]) + sweep - 1.4, Y(sl[1]) - 1.4, 2.8, 2.8);
        g.globalAlpha = 0.35 * se;
        g.drawImage(glowSpr, L(sl[0]) + sweep - 10, Y(sl[1]) - 10, 20, 20);
      }
      /* the heartbeat window: it never went dark. The audio's pulse, visible.
         At ten surveys it doubles into the anticipatory two-beat of a ship
         that knows you are close (kept forever: it is awake now). */
      const hbPh = (t * 0.0016) % TAU;
      let hb = lit >= 10
        ? 0.4 + 0.34 * Math.max(0, Math.sin(hbPh)) + 0.22 * Math.max(0, Math.sin(hbPh - 1.1))
        : 0.45 + 0.4 * Math.max(0, Math.sin(t * 0.0016));
      /* THE CONDUCTOR (WOW #8): while the score plays, the chest lands ON the
         thump — attack into the cue, decay after, sine again when silent */
      const hbEl = pn - heartCueAt;
      if (!reduced2 && hbEl > -400 && hbEl < 3000) {
        const env = hbEl < 0 ? Math.max(0, 1 + hbEl / 220) : Math.exp(-hbEl / 520);
        hb = 0.32 + 0.58 * env;
      }
      g.globalAlpha = hb;
      g.fillStyle = CREAM;
      g.fillRect(L(HEART[0]) - 1.8, Y(HEART[1]) - 1.8, 3.6, 3.6);
      g.globalAlpha = hb * 0.7;
      g.drawImage(glowSpr, L(HEART[0]) - 13, Y(HEART[1]) - 13, 26, 26);
      /* nav beacon: a slow amber blink at the masthead (steady when reduced).
         THE GREETING (WOW #12): from the third visit it abandons the
         metronome for three deliberate pulses — it knows your silhouette. */
      const gk = clockMs - greetT0;
      const bk = reduced2 ? 0.8
        : (gk >= 0 && gk < 3600) ? ((gk % 1200) < 450 ? 1 : 0.06)
        : ((t % 2400) < 200 ? 1 : 0.06);
      g.globalAlpha = bk;
      g.fillStyle = 'rgba(255,140,80,1)';
      g.beginPath(); g.arc(L(BEACON[0]), Y(BEACON[1]), 2.4, 0, TAU); g.fill();
      g.globalAlpha = bk * 0.7;
      g.drawImage(glowSpr, L(BEACON[0]) - 12, Y(BEACON[1]) - 12, 24, 24);
      /* the bridge display: wears the accent of the world being considered
         (clamped: a delayed pulse waits for the beam's bead to arrive).
         At eight surveys, whenever no one is considering, it STUDIES: slowly
         cycling the accents of the worlds you brought back (WOW #12). */
      let bR = accR, bG = accG, bB = accB;
      if (studyA && studyA.length > 1 && clockMs - accPulse > 4000 && !reduced2) {
        const cyc = (t / 6000) % studyA.length;
        const i0 = cyc | 0, i1 = (i0 + 1) % studyA.length, f = cyc - i0;
        bR = (studyA[i0][0] + (studyA[i1][0] - studyA[i0][0]) * f) | 0;
        bG = (studyA[i0][1] + (studyA[i1][1] - studyA[i0][1]) * f) | 0;
        bB = (studyA[i0][2] + (studyA[i1][2] - studyA[i0][2]) * f) | 0;
      }
      const bp = Math.max(0, Math.min(1, 1 - (clockMs - accPulse) / 900));
      g.globalAlpha = 0.5 + 0.5 * bp;
      g.fillStyle = `rgba(${bR},${bG},${bB},1)`;
      g.fillRect(L(BRIDGE[0]) - 2, Y(BRIDGE[1]) - 2, 4, 4);
      g.globalAlpha = (0.35 + 0.65 * bp) * 0.8;
      g.drawImage(glowSpr, L(BRIDGE[0]) - 13 - 6 * bp, Y(BRIDGE[1]) - 13 - 6 * bp, 26 + 12 * bp, 26 + 12 * bp);
      /* engines: cold until the ship is awake (or the reveal ghosts them).
         IGNITION: the burn CATCHES near the cadence's downbeat (~6s into the
         rite) — a hard flare breathing down over seconds to the steady glow */
      if (wakeK > 0.02) {
        const ign = riteT0 > 0
          ? Math.max(0, Math.min(1, (riteEl - 5600) / 800)) * Math.max(0, Math.min(1, 1 - (riteEl - 6400) / 5000))
          : 0;
        const eb = Math.min(1, wakeK * (0.5 + 0.3 * Math.sin(t * 0.003)) + ign * 0.6);
        const gs = 32 + ign * 26;
        for (const [ex, ey] of ENGINES) {
          g.globalAlpha = eb;
          g.drawImage(glowSpr, L(ex) - gs / 2, Y(ey) - gs / 2, gs, gs);
          g.globalAlpha = Math.min(1, eb * 0.9 + ign * 0.3);
          g.fillStyle = 'rgba(255,220,160,1)';
          g.beginPath(); g.arc(L(ex), Y(ey), 3 + ign * 1.6, 0, TAU); g.fill();
        }
      }
      g.globalAlpha = 1;

      /* the kindle spark: a bright point runs the spine, dock -> new light */
      if (kindleIdx >= 0 && !kindlePending && kindleK >= 0 && kindleK < 1) {
        const kk = kindleK * kindleK * (3 - 2 * kindleK);
        const kx = DOCK[0] + (LIGHTS[kindleIdx][0] - DOCK[0]) * kk;
        const ky = DOCK[1] + (LIGHTS[kindleIdx][1] - DOCK[1]) * kk;
        g.globalAlpha = 0.9;
        g.fillStyle = CREAM;
        g.fillRect(L(kx) - 1.4, Y(ky) - 1.4, 2.8, 2.8);
        g.globalAlpha = 0.6;
        g.drawImage(glowSpr, L(kx) - 9, Y(ky) - 9, 18, 18);
        g.globalAlpha = 1;
      }

      /* remember the dock in SCREEN space for the shuttle */
      const ca = Math.cos(tilt), sa = Math.sin(tilt);
      const dlx = L(DOCK[0]) * s, dly = Y(DOCK[1]) * s;
      g.restore();
      shu.dockX = x + dlx * ca - dly * sa;
      shu.dockY = y + bob + dlx * sa + dly * ca;

      /* ---------- the shuttle ---------- */
      if (sortieReq) {
        /* a re-aim from a hold departs from the planet's LIVE position —
           the world kept moving while the traveler walked it */
        const from = shu.mode === 'dock' ? { x: shu.dockX, y: shu.dockY }
                   : (shu.mode === 'hold' && shu.get) ? moor(shu.get())
                   : { x: shu.px, y: shu.py };
        shu.mode = 'fly'; shu.t0 = clockMs; shu.sx = from.x; shu.sy = from.y;
        shu.get = sortieReq.get; shu.dur = sortieReq.ms;
        shu.tn = 0; shu.th = -1;
        sortieReq = null;
      }
      if (recallReq) {
        recallReq = false;
        if (shu.mode === 'fly' || shu.mode === 'hold') {
          const from = (shu.mode === 'hold' && shu.get) ? moor(shu.get()) : { x: shu.px, y: shu.py };
          shu.mode = 'return'; shu.t0 = clockMs;
          shu.sx = from.x; shu.sy = from.y; shu.px = from.x; shu.py = from.y;
          shu.dur = 900; shu.tn = 0; shu.th = -1;
          /* the ride home gets its voice (WOW board #6) */
          if (window.Orrery) Orrery.events.dispatchEvent(new CustomEvent('recall'));
        }
      }
      /* THE PARADE (WOW #2): the rite's lap of honor. Waits for the rite's
         opening beat, needs a real ring to circle (the pocket stage has none),
         and hands off to the homecoming choreography when the circuit closes. */
      if (paradeReq && shu.mode === 'dock' && (riteT0 < -1e8 || clockMs > riteT0 + 1500)) {
        paradeReq = false;
        if (typeof ART !== 'undefined' && ART.rx > 40) {
          shu.mode = 'parade'; shu.t0 = clockMs; shu.dur = 6500;
          shu.tn = 0; shu.th = -1;
        }
      }
      let sx2 = shu.dockX, sy2 = shu.dockY, flying = false;
      if (shu.mode === 'parade' && typeof ART !== 'undefined') {
        /* once around the gilded dial, past every arc the survey earned */
        const k = Math.min(1, (clockMs - shu.t0) / shu.dur);
        const a0 = Math.atan2((shu.dockY - ART.cy) / (ART.ry || 1), (shu.dockX - ART.cx) / (ART.rx || 1));
        const a = a0 + easeIO(k) * TAU;
        sx2 = ART.cx + Math.cos(a) * ART.rx * 0.94;
        sy2 = ART.cy + Math.sin(a) * ART.ry * 0.94;
        flying = true;
        if (k >= 1) {                        /* the circuit closes into the flip-and-brake */
          shu.mode = 'return'; shu.t0 = clockMs;
          shu.sx = sx2; shu.sy = sy2; shu.px = sx2; shu.py = sy2;
          shu.dur = 900; shu.tn = 0; shu.th = -1;
        }
      } else if (shu.mode === 'hold' && shu.get) {
        /* on station at the world: MOORED off its limb (never parked on the
           face), riding the orbit until the traveler backs out */
        const m2 = moor(shu.get());
        sx2 = m2.x; sy2 = m2.y;
      } else if (shu.mode === 'fly' || shu.mode === 'return') {
        const k = Math.min(1, (clockMs - shu.t0) / shu.dur);
        const tgt = shu.mode === 'fly' ? (shu.get ? shu.get() : { x: shu.dockX, y: shu.dockY })
                                       : { x: shu.dockX, y: shu.dockY };
        const mx = (shu.sx + tgt.x) / 2, my = (shu.sy + tgt.y) / 2;
        const ddx = tgt.x - shu.sx, ddy = tgt.y - shu.sy;
        const dl = Math.hypot(ddx, ddy) || 1;
        const side = ddx >= 0 ? -1 : 1;
        const cxq = mx + (-ddy / dl) * dl * 0.16 * side;
        const cyq = my + (ddx / dl) * dl * 0.16 * side;
        const e = easeIO(k), ie = 1 - e;
        sx2 = ie * ie * shu.sx + 2 * ie * e * cxq + e * e * tgt.x;
        sy2 = ie * ie * shu.sy + 2 * ie * e * cyq + e * e * tgt.y;
        flying = true;
        if (k >= 1) {
          if (shu.mode === 'fly') shu.mode = 'hold';   /* she STAYS at the world until recalled */
          else {
            shu.mode = 'dock';
            shu.lampUntil = clockMs + 700;             /* the lamp holds while the clamps take her */
            if (window.Orrery) Orrery.events.dispatchEvent(new CustomEvent('docked'));
          }
        }
      }
      /* the flip: past the midpoint of the ride home she turns end-over-end
         and burns retrograde — the torch leads her in, shedding speed */
      const retro = shu.mode === 'return' && (clockMs - shu.t0) / shu.dur >= 0.55;
      const nhd = Math.atan2(sy2 - shu.py, sx2 - shu.px);
      if (flying && (shu.px !== sx2 || shu.py !== sy2)) shu.hd = retro ? nhd + Math.PI : nhd;
      shu.px = sx2; shu.py = sy2;
      /* trail: 24 pooled points, sampled every 26ms while moving */
      if (flying && !reduced2) {
        shu.tacc += 16;
        if (shu.tacc >= 26) {
          shu.tacc = 0;
          shu.th = (shu.th + 1) % 24;
          shu.trail[shu.th * 2] = sx2; shu.trail[shu.th * 2 + 1] = sy2;
          if (shu.tn < 24) shu.tn++;
        }
        g.strokeStyle = 'rgba(255,214,140,1)';
        const capWas = g.lineCap;
        g.lineCap = 'round';
        for (let i2 = 1; i2 < shu.tn; i2++) {
          const a0 = (shu.th - i2 + 24 * 2) % 24, a1 = (shu.th - i2 + 1 + 24 * 2) % 24;
          g.globalAlpha = (1 - i2 / shu.tn) * 0.4;
          g.lineWidth = Math.max(0.8, 2.6 * (1 - i2 / shu.tn));
          g.beginPath();
          g.moveTo(shu.trail[a0 * 2], shu.trail[a0 * 2 + 1]);
          g.lineTo(shu.trail[a1 * 2], shu.trail[a1 * 2 + 1]);
          g.stroke();
        }
        g.globalAlpha = 1;
        g.lineCap = capWas;                /* the shared sky context keeps its caps */
      } else { shu.tn = 0; shu.th = -1; }
      /* the dock lamp: kindles ahead of her as she comes home, holds while
         the clamps take her, then lets the dark back in */
      let lampA = 0;
      if (shu.mode === 'return') lampA = 0.2 + 0.6 * Math.min(1, (clockMs - shu.t0) / shu.dur);
      else if (clockMs < shu.lampUntil) lampA = 0.8 * ((shu.lampUntil - clockMs) / 700);
      if (lampA > 0.02 && !reduced2) {
        g.globalAlpha = lampA;
        g.drawImage(glowSpr, shu.dockX - 11, shu.dockY - 11, 22, 22);
        g.globalAlpha = 1;
      }
      /* the shuttle itself (hidden mid-warp is impossible: hub stops drawing) */
      const ss = Math.max(0.7, Math.min(1.3, R / 170));
      g.save();
      g.translate(sx2, sy2);
      g.rotate(flying ? shu.hd : tilt);
      g.scale(ss, ss);
      if (flying) {                          /* the burn — harder on the retro brake */
        g.globalAlpha = retro ? 1 : 0.85;
        if (retro) g.drawImage(glowSpr, -34, -11, 22, 22);
        else g.drawImage(glowSpr, -30, -9, 18, 18);
        g.globalAlpha = 1;
      }
      g.drawImage(shuttleSpr, -22, -9);
      g.restore();

      /* the ripple: the wreck's sensor ring answers a hard knock */
      if (env > 0) {
        const ringR = rp * R * 1.4;
        g.globalCompositeOperation = 'screen';
        g.globalAlpha = env * 0.4;
        g.strokeStyle = 'rgba(255,240,210,1)';
        g.lineWidth = Math.max(1.5, R * 0.04);
        g.beginPath(); g.arc(x, y, ringR, 0, TAU); g.stroke();
        g.globalAlpha = env * 0.18;
        g.lineWidth = Math.max(1, R * 0.018);
        g.beginPath(); g.arc(x, y, ringR * 0.86, 0, TAU); g.stroke();
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    },

    drawSonar(g, x, y, R, clockMs) {
      if (!inited) return;
      if (rm()) {
        pending = 0;
        for (let i = 0; i < 3; i++) rings[i].on = false;
        g.globalAlpha = 0.13;
        g.strokeStyle = BRASS; g.lineWidth = 1;
        g.beginPath(); g.arc(x, y, R * 1.6, 0, TAU); g.stroke();
        g.globalAlpha = 1;
        return;
      }
      while (pending > 0) {
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
        const rr = R * (1.05 + p * 2.15);
        const fade = (1 - p) * (1 - p);
        g.globalAlpha = fade * 0.5;
        g.strokeStyle = BRASS;
        g.lineWidth = 1.8 - p * 0.8;
        g.beginPath(); g.arc(x, y, rr, 0, TAU); g.stroke();
        g.globalAlpha = fade * 0.22;
        g.strokeStyle = CREAM;
        g.lineWidth = 1;
        g.beginPath(); g.arc(x, y, rr * 0.9, 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
    },

    ripple() {                               /* a hard knock: sensor ring + sonar */
      if (rm()) return;
      ripplePending = true;
      pending = pending < 3 ? pending + 1 : 3;
    },
    ping() {
      if (rm()) return;
      pending = pending < 3 ? pending + 1 : 3;
    },

    /* the bridge considers a world: its display takes the accent and pulses.
       (Keeps the setSkin name so every hover/beat call site stands.) An
       optional delay lets the pulse wait for the consideration beam's bead
       to ARRIVE (WOW #17): cause and effect in pure light. */
    setSkin(slug, delayMs) {
      const w = (typeof bySlug !== 'undefined') && bySlug[slug];
      if (w && w.a) { accR = w.a[0]; accG = w.a[1]; accB = w.a[2]; }
      else { accR = 201; accG = 163; accB = 92; }
      accPulseReq = true;                   /* latched onto the draw clock next frame */
      accPulseDelay = delayMs || 0;
    },
    /* the reveal: every deck answers for a moment — a ghost of the living ship */
    reveal(ms) { revealReq = ms || 2600; },
    /* IGNITION (WOW #2): the completion rite made physical — lights to unison
       stern-to-bow, the engines catching on the cadence's downbeat, the hull
       easing into her kept trim. rm's designed still is the settled pose. */
    awakenRite() { if (!rm()) riteReq = true; },
    /* the lap of honor: one circuit of the dial, then the homecoming */
    parade() { if (!rm()) paradeReq = true; },
    /* THE GREETING (WOW #12): three deliberate masthead pulses */
    greet() { if (!rm()) greetReq = true; },
    /* the conductor's line in (WOW #8): 'H' beats the chest, 'G' strains the frame */
    cue(kind, perfAt) {
      if (kind === 'H') heartCueAt = perfAt;
      else if (kind === 'G') groanCueAt = perfAt;
    },
    /* THE LITURGY (WOW #12): one unwatched habit, once per visit */
    stir() { if (!rm()) stirReq = true; },
    /* THE VIGIL (WOW #7): while she holds station over a world, she sometimes
       crosses YOUR sky — a tiny silhouette, a short amber trail, one glint at
       mid-crossing. Called by the world-FX harness; draws only mid-transit. */
    drawTransit(g, w, h, clockMs) {
      if (!inited || shu.mode !== 'hold') return;
      const PERIOD = 41000, DUR = 5600;
      const ph = clockMs % PERIOD;
      if (ph > DUR) return;
      const k = ph / DUR;
      const cyc = (clockMs / PERIOD) | 0;
      const dir = (cyc & 1) ? -1 : 1;                  /* she patrols both ways */
      const y = h * (0.1 + ((cyc * 7919) % 13) / 13 * 0.16);
      const x = dir > 0 ? -30 + (w + 60) * k : w + 30 - (w + 60) * k;
      g.save();
      g.translate(x, y);
      if (dir < 0) g.scale(-1, 1);
      g.globalAlpha = 0.45;                            /* the burn, far away */
      g.drawImage(glowSpr, -20, -5, 10, 10);
      g.globalAlpha = 0.8;
      g.scale(0.55, 0.55);
      g.drawImage(shuttleSpr, -22, -9);
      g.restore();
      const gl = Math.max(0, 1 - Math.abs(k - 0.5) * 8);   /* one glint amidships */
      if (gl > 0) {
        g.globalAlpha = gl * 0.6;
        g.drawImage(glowSpr, x - 9, y - 9, 18, 18);
        g.globalAlpha = 1;
      }
    },

    /* your vessel departs: fly to a live target over ms, then HOLD there —
       she stays moored at the world while you walk it. travel() owns the
       warp timer; this owns only the picture. */
    sortie(getTarget, ms) {
      if (rm()) return false;
      recallReq = false;                     /* a fresh departure outranks a pending recall */
      sortieReq = { get: getTarget, ms: ms || 760 };
      return true;
    },
    /* the traveler backs out to orbit: bring her home from wherever the
       world has carried her (rm keeps travel instant — she is simply docked) */
    recall() {
      sortieReq = null;
      if (rm()) { shu.mode = 'dock'; return; }
      recallReq = true;
    },

    drawShadowPass(g, x, y, R) {
      if (!inited) return;
      g.globalAlpha = 0.5;
      g.drawImage(shadowSpr, x - R * 2.0, y - R * 0.4, R * 4.0, R * 1.5);
      g.globalAlpha = 1;
    },
  };
})();
/* the engine guards its calls with `window.SphereForge` (mirrors WorldFX):
   expose it so those guards fire and the Derelict actually paints */
window.SphereForge = SphereForge;
