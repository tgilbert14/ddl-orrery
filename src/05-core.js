/* ============================================================
   05-core.js — the orrery engine.
   One clock. One rAF ticker (self-removing tasks; stops when idle).
   Canvas is scenery; the DOM is the truth. No text in canvas, ever.
   ============================================================ */
'use strict';

/* ---------- boot flags ---------- */
const html = document.documentElement;
html.classList.add('js');

const rmq = matchMedia('(prefers-reduced-motion: reduce)');
const setRM = () => {
  html.classList.toggle('rm', rmq.matches);
  /* the toggle must reach EVERY motion layer (Smaug kill 1): ambient on the
     hub, the active world's FX everywhere else — start() re-applies the rm
     end-state or re-ignites, whichever the preference now asks for */
  if (Scenes.current && Scenes.current !== 'hub') {
    window.WorldFX && WorldFX.start(Scenes.current);
    Orrery.stopAmbient();
  } else if (rmq.matches) { Orrery.stopAmbient(); }
  else { Orrery.startAmbient(); }
};
/* live re-check: latching this at load was a documented kill (LESSONS 2026-07-05) */
rmq.addEventListener('change', setRM);
const reduced = () => rmq.matches;

/* storage is a nice-to-have, never a boot dependency (Smaug kill 6):
   blocked cookies / sandboxed iframes throw on the GETTER.
   `store` = sessionStorage (the approach cinematic: once per tab).
   `keep`  = localStorage (the survey meta-game must outlive the tab, or
   it isn't a pull-back loop — council ruling 6). */
const mkStore = (backing) => ({
  get(k) { try { return backing.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { backing.setItem(k, v); } catch (_) {} },
});
const store = mkStore(sessionStorage);
const keep  = mkStore(localStorage);

const finePointer = matchMedia('(pointer: fine)').matches;

/* ---------- the shared clock + ticker (§2.1) ---------- */
const Ticker = (() => {
  const tasks = new Set();
  let rafId = null, last = 0, clock = 0, running = false;
  let budget = 0, lastRun = -1e9;          /* frame budget (M2): 0 = every vsync */
  function frame(now) {
    /* budgeted skip: a 120Hz phone must not pay double for a 10Hz twinkle —
       keep the rAF alive, run the tasks no oftener than the budget allows */
    if (budget && now - lastRun < budget) { rafId = requestAnimationFrame(frame); return; }
    lastRun = now;
    const dt = Math.min(now - last, 48); last = now;
    if (!document.hidden) {
      clock += dt;
      for (const t of [...tasks]) { if (t(dt, clock) === false) tasks.delete(t); }
    }
    if (tasks.size && running) { rafId = requestAnimationFrame(frame); }
    else { running = false; rafId = null; }
  }
  return {
    add(t) { tasks.add(t); if (!running) { running = true; last = performance.now(); rafId = requestAnimationFrame(frame); } },
    remove(t) { tasks.delete(t); },
    get clock() { return clock; },
    setBudget(ms) { budget = ms || 0; },
  };
})();

/* ---------- world registry (data; FX bodies live in 06) ----------
   `poem`: the world's one-line voice — the single source. The Grand Tour
   narrates it, and bootOrrery re-syncs the orbit em-lines from it (the
   HTML carries the same text for the no-JS brochure; app mode trusts the
   registry). `a`: the accent that tints the hub + rim glow — the v6
   cluster is de-collided (storm → violet, beacons → ember) so the eleven
   pass the one-second read (hue audit, M3). */
const WORLDS = [
  { slug: 'dust-sea',  label: 'Dust Sea',   size: 58, tell: 'heat',    a: [255, 178, 94],  speed: 0.045, poem: 'the sand remembers a rhythm' },
  { slug: 'velocity',  label: 'Velocity',   size: 62, tell: 'pulse',   a: [255, 46, 151],  speed: 0.06,  poem: 'the city never blinks' },
  { slug: 'grid',      label: 'The Grid',   size: 50, tell: 'rain',    a: [52, 255, 136],  speed: 0.055, poem: 'the rain is code' },
  { slug: 'abyssal',   label: 'Abyssal',    size: 54, tell: 'breathe', a: [53, 240, 200],  speed: 0.052, poem: 'the lights are alive down here' },
  { slug: 'arcadia',   label: 'Arcadia',    size: 48, tell: 'pixel',   a: [255, 210, 63],  speed: 0.065, poem: 'insert coin' },
  { slug: 'aurora',    label: 'Aurora',     size: 58, tell: 'glint',   a: [168, 233, 255], speed: 0.038, poem: 'the sky rehearses its colors' },
  { slug: 'uncharted', label: 'Uncharted',  size: 44, tell: 'dashed',  a: [100, 213, 245], speed: 0.07,  poem: 'yours is still unnamed' },
  { slug: 'archive',   label: 'The Archive', size: 52, tell: 'pulse',   a: [236, 194, 122], speed: 0.042, poem: 'it has already read tomorrow' },
  { slug: 'drillyard', label: 'The Drillyard', size: 52, tell: 'pulse', a: [127, 178, 229], speed: 0.058, poem: 'down is a direction you choose' },
  { slug: 'stormwall', label: 'Stormwall',  size: 56, tell: 'pulse',   a: [178, 158, 255], speed: 0.048, poem: 'the light runs ahead of the weather' },
  { slug: 'beacons',   label: 'The Beacons', size: 52, tell: 'pulse',   a: [255, 122, 60],  speed: 0.05,  poem: 'one fire lights the next' },
];
const bySlug = Object.fromEntries(WORLDS.map(w => [w, w] && [w.slug, w]));
WORLDS.forEach(w => { w.tellStroke = `rgb(${w.a[0]},${w.a[1]},${w.a[2]})`; });  /* baked draw color */

/* ---------- the sky canvas ---------- */
const sky = document.getElementById('sky');
const ctx = sky.getContext('2d');
let W = 0, H = 0, DPR = 1;
function sizeSkyCanvas() {
  DPR = Math.min(devicePixelRatio || 1, 2);           /* the phone-cook cap */
  W = innerWidth; H = innerHeight;
  sky.width = Math.round(W * DPR); sky.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
function sizeSky() {
  sizeSkyCanvas();
  buildStars();
  measureOrbit();
  drawStatic();                                        /* rm / idle repaint */
}
let resizeT = null, settledH = 0;                      /* height baseline: set by FULL passes only */
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    /* a phone URL bar collapsing is not a rotation: a small height-only
       delta refreshes the surface but must NOT re-roll the starfield or
       restart the world mid-scroll (M2 — the dunes kept re-rolling).
       Measured against the last SETTLED height (not the previous debounce
       step) so a slow continuous drag cannot creep past the guard, and
       phone-only: desktop window resizes always take the full path. */
    const heightOnly = !desktop() && innerWidth === W && Math.abs(innerHeight - settledH) < 160;
    if (heightOnly) {
      sizeSkyCanvas();
      measureOrbit();
      drawStatic();
      return;
    }
    sizeSky();
    settledH = H;
    if (!desktop()) bakeMinis();                       /* breakpoint may have flipped */
    /* a rotated phone inside a world gets a fresh FX surface (Smaug kill 8) */
    if (Scenes.current && Scenes.current !== 'hub' && window.WorldFX) WorldFX.start(Scenes.current);
  }, 120);
}, { passive: true });

/* ---------- starfield: 3 depth layers, pooled ---------- */
let stars = [];
const seasonTilt = (() => {   /* the local-time sky: a deterministic per-visit rotation */
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return (h / 24) * Math.PI * 2;
})();
/* nebula haze: two soft tinted blooms baked once, seated on the galactic band */
let nebA = null, nebB = null;
const neb1 = { x: 0, y: 0, s: 0 }, neb2 = { x: 0, y: 0, s: 0 };
function bakeNebula() {
  if (nebA) return;
  const mk = (rgb) => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, `rgba(${rgb},0.10)`);
    gr.addColorStop(0.55, `rgba(${rgb},0.05)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return c;
  };
  /* sea-glass + dim brass, not teal + violet: the canvas backdrop keeps the
     Deep Deco fiction (lamplight through water) instead of snapping to
     default-space-demo the instant JS boots (M3) */
  nebA = mk('80,180,160'); nebB = mk('201,163,92');
}
function buildStars() {
  /* a sky worth the name: ~3x the old density, a diagonal galactic band
     carrying a third of the field, and a few glinting giants */
  const n = Math.round(Math.min(460, (W * H) / 3600));
  stars = [];
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  bakeNebula();
  const bandAng = -0.55, ca = Math.cos(bandAng), sa = Math.sin(bandAng);
  const diag = Math.hypot(W, H);
  for (let i = 0; i < n; i++) {
    const depth = i % 3;
    let x, y;
    if (i % 3 === 0) {                                 /* the band: clustered along the diagonal */
      const u = (rnd() - 0.5) * diag * 1.3;
      const v = (rnd() + rnd() - 1) * H * 0.14;        /* triangular falloff off the spine */
      x = W / 2 + ca * u - sa * v;
      y = H / 2 + sa * u + ca * v;
    } else { x = rnd() * W; y = rnd() * H; }
    const giant = i % 41 === 0;                        /* rare bright giants with a cross-glint */
    stars.push({
      x, y,
      z: 0.35 + depth * 0.33,                          /* parallax factor */
      r: giant ? 1.7 + rnd() * 0.9 : 0.5 + rnd() * (depth === 2 ? 1.4 : 0.9),
      tw: rnd() * Math.PI * 2,                         /* twinkle phase */
      k: giant ? 1 : 0,
      /* the deco population: mostly warm cream, a fifth brass, a quarter
         pale sea-glass — the retint that makes the fiction survive boot (M3).
         Giants keep the amber/blue pairing so the sky still has cold accents. */
      hue: giant ? (rnd() < 0.5 ? 'rgba(255,217,160,' : 'rgba(168,200,255,')
         : rnd() < 0.20 ? 'rgba(201,163,92,' : rnd() < 0.45 ? 'rgba(190,220,225,' : 'rgba(239,228,200,',
    });
  }
  /* the nebulae sit on the band spine, one each side of center */
  neb1.x = W / 2 - ca * diag * 0.24; neb1.y = H / 2 - sa * diag * 0.24; neb1.s = W * 0.52;
  neb2.x = W / 2 + ca * diag * 0.28; neb2.y = H / 2 + sa * diag * 0.28; neb2.s = W * 0.4;
}

/* pointer parallax: latest target, applied once per frame (never per event).
   px/py carry the raw position for the cursor glow (spectacle pass). */
const par = { x: 0, y: 0, tx: 0, ty: 0, px: -1e4, py: -1e4, gx: -1e4, gy: -1e4 };
if (finePointer) {
  addEventListener('pointermove', (e) => {
    par.tx = (e.clientX / W - 0.5) * 2; par.ty = (e.clientY / H - 0.5) * 2;
    par.px = e.clientX; par.py = e.clientY;
  }, { passive: true });
}
/* the cursor's lamp: a soft warm glow trails the pointer across the hub —
   one baked sprite, one blit, a lerp of lag (awwwards idiom, house price) */
let glowSpr = null;
function bakeGlow() {
  if (glowSpr) return;
  glowSpr = document.createElement('canvas');
  glowSpr.width = glowSpr.height = 192;
  const g = glowSpr.getContext('2d');
  const gr = g.createRadialGradient(96, 96, 4, 96, 96, 96);
  gr.addColorStop(0, 'rgba(255,238,200,0.16)');
  gr.addColorStop(0.4, 'rgba(255,226,170,0.07)');
  gr.addColorStop(1, 'rgba(255,226,170,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 192, 192);
}

/* warp state (the streak burst) */
const warp = { active: false, p: 0, cx: 0.5, cy: 0.5, tint: [100, 213, 245] };

/* ---------- planet layout: parametric orbits on the shared clock ---------- */
const anchors = new Map();
document.querySelectorAll('.planet-anchor').forEach(a => anchors.set(a.dataset.world, a));
const desktop = () => innerWidth > 700;

/* the Artifact holds the center; the eleven worlds truly ORBIT it on a
   flattened ellipse, passing behind and in front (z-sorted in drawSky) */
const ART = { cx: 0, cy: 0, r: 120, rx: 300, ry: 90 };
/* the engraved dial — main rail, inner rail, sixty graduations — is static
   between resizes, so it bakes ONCE into an offscreen sprite (the nebula
   idiom) and costs the frame a single drawImage instead of ~62 path
   segments and three stroke passes at 120fps */
const RING_TICKS = 60;
let dialSpr = null, dialW = 0, dialH = 0;
function bakeDial() {
  const pad = 8;
  dialW = Math.ceil(ART.rx * 1.03 * 2) + pad * 2;
  dialH = Math.ceil(ART.ry * 1.03 * 2) + pad * 2;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  dialSpr = document.createElement('canvas');
  dialSpr.width = Math.round(dialW * dpr); dialSpr.height = Math.round(dialH * dpr);
  const g = dialSpr.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = dialW / 2, cy = dialH / 2;
  g.strokeStyle = 'rgba(201,163,92,0.14)';
  g.lineWidth = 1;
  g.beginPath(); g.ellipse(cx, cy, ART.rx, ART.ry, 0, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(201,163,92,0.06)';
  g.beginPath(); g.ellipse(cx, cy, ART.rx * 0.93, ART.ry * 0.93, 0, 0, 7); g.stroke();
  g.strokeStyle = 'rgba(201,163,92,0.13)';
  g.beginPath();
  for (let i = 0; i < RING_TICKS; i++) {
    const th = (i / RING_TICKS) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const long = i % 5 === 0;                           /* every 30° a longer graduation */
    const i0 = long ? 0.965 : 0.982, i1 = long ? 1.028 : 1.014;
    g.moveTo(cx + c * ART.rx * i0, cy + s * ART.ry * i0);
    g.lineTo(cx + c * ART.rx * i1, cy + s * ART.ry * i1);
  }
  g.stroke();
}
/* hoisted draw-loop constants: no arrays or strings minted per frame */
const DASH_ARC = [3, 5], DASH_TELL = [5, 7], DASH_NONE = [];
const BRASS_STROKE = 'rgba(201,163,92,1)';

/* ---------- PERTURB THE ORRERY (spectacle pass): the worlds are REAL.
   Grab one, drag it off its rail, THROW it — it flies with your momentum,
   then springs home underdamped, wobbling back onto the clockwork. A hard
   fling rattles the whole instrument: the Artifact ripples and answers.
   Desktop + fine pointer + motion only; a plain click still travels. ---------- */
const perturb = WORLDS.map(() => ({ ox: 0, oy: 0, vx: 0, vy: 0 }));
let grabIx = -1, grabPX = 0, grabPY = 0, grabDist = 0, grabVX = 0, grabVY = 0;
let grabConsumed = false;
function armGrabPhysics() {
  if (!finePointer) return;
  anchors.forEach((a, slug) => {
    const i = WORLDS.indexOf(bySlug[slug]);
    /* anchors are LINKS: the browser starts a native link-drag on them,
       which swallows every pointermove and cancels the grab — the throw
       never worked on a real mouse until this was cut off */
    a.draggable = false;
    a.addEventListener('dragstart', (e) => e.preventDefault());
    a.addEventListener('pointerdown', (e) => {
      if (!desktop() || reduced() || Scenes.current !== 'hub' || e.button !== 0) return;
      e.preventDefault();                              /* no text-selection ride-along */
      grabIx = i; grabPX = e.clientX; grabPY = e.clientY;
      grabDist = 0; grabVX = 0; grabVY = 0;
      try { a.setPointerCapture(e.pointerId); } catch (_) {}
      if (!skyTask) Orrery.startAmbient();
    });
    a.addEventListener('pointermove', (e) => {
      if (grabIx !== i) return;
      const dx = e.clientX - grabPX, dy = e.clientY - grabPY;
      grabPX = e.clientX; grabPY = e.clientY;
      grabDist += Math.abs(dx) + Math.abs(dy);
      const pt = perturb[i];
      pt.ox += dx; pt.oy += dy;
      grabVX = grabVX * 0.6 + dx * 0.4;                /* smoothed fling velocity */
      grabVY = grabVY * 0.6 + dy * 0.4;
    });
    const release = () => {
      if (grabIx !== i) return;
      grabIx = -1;
      const pt = perturb[i];
      pt.vx = grabVX * 0.9; pt.vy = grabVY * 0.9;      /* the throw carries */
      if (grabDist > 6) {
        grabConsumed = true;                           /* this gesture was a drag, not a click */
        setTimeout(() => { grabConsumed = false; }, 0);
      }
      const speed = Math.hypot(pt.vx, pt.vy);
      if (speed > 14 && window.SphereForge) {          /* a hard fling rattles the instrument */
        SphereForge.ripple();
        Orrery.events.dispatchEvent(new CustomEvent('artifact'));
      }
    };
    a.addEventListener('pointerup', release);
    a.addEventListener('pointercancel', release);
  });
}
/* dt-scaled underdamped spring: the world wobbles home like a real weight */
function integratePerturb(pt, dt) {
  if (pt.ox === 0 && pt.oy === 0 && pt.vx === 0 && pt.vy === 0) return;
  const k = 0.000048 * dt, c = Math.min(0.9, 0.0035 * dt);
  pt.vx += -pt.ox * k * dt - pt.vx * c;
  pt.vy += -pt.oy * k * dt - pt.vy * c;
  pt.ox += pt.vx * dt * 0.06;
  pt.oy += pt.vy * dt * 0.06;
  if (Math.abs(pt.ox) < 0.25 && Math.abs(pt.oy) < 0.25 &&
      Math.abs(pt.vx) < 0.02 && Math.abs(pt.vy) < 0.02) {
    pt.ox = 0; pt.oy = 0; pt.vx = 0; pt.vy = 0;        /* settled: back on the rail */
  }
}
function measureOrbit() {
  const copy = document.querySelector('.hub-copy');
  const cb = copy ? copy.getBoundingClientRect().bottom : H * 0.34;
  if (desktop()) {
    const room = Math.max(220, H - cb - 84);           /* keep clear of the footer HUD */
    ART.cx = W / 2;
    ART.cy = cb + room * 0.54;
    ART.r  = Math.min(room * 0.40, W * 0.165, 250);    /* huge, but never crowding the copy */
    ART.rx = Math.min(W * 0.44, ART.r * 2.9);          /* wider ring: the bigger worlds need room */
    ART.ry = Math.max(ART.r * 0.54, Math.min(room * 0.32, ART.r * 0.78));
    bakeDial();                                         /* re-engrave the dial sprite (M3) */
  } else {
    /* the pocket orrery (M2): the Artifact seats IN the .hub-stage spacer
       and belongs to the scroll flow — its live rect places the sphere, so
       scrolling the world list carries the Artifact away with the stage
       instead of leaving a gold ghost fixed under the rows. The hub scene's
       scroll listener re-runs this measure. */
    const stage = document.querySelector('.hub-stage');
    const sr = stage && html.classList.contains('js') ? stage.getBoundingClientRect() : null;
    if (sr && sr.height > 0) {
      ART.fb = false;
      ART.cx = W / 2;
      ART.cy = sr.top + sr.height * 0.52;
      ART.r  = Math.min(W * 0.36, sr.height * 0.42, 150);
    } else {
      /* no stage laid out (boot edge / viewport disagreement): the old
         deep-presence fallback — drawn DIM, since it sits under the rows */
      ART.fb = true;
      ART.cx = W / 2;
      ART.cy = H * 0.72;
      ART.r  = Math.min(W * 0.34, 150);
    }
    ART.rx = 0; ART.ry = 0;
  }
  placeArtifactDom();
}
function planetPos(i, clockMs) {
  const t = reduced() ? 0 : clockMs / 1000;
  /* each world keeps its own period; reduced-motion holds a seeded pose */
  const ang = (i / WORLDS.length) * Math.PI * 2 + seasonTilt + t * (Math.PI * 2) / (95 + i * 16);
  const bob = reduced() ? 0 : Math.sin(t * 0.5 + i * 1.7) * 3;
  const depth = Math.sin(ang);                         /* -1 far behind · +1 near in front */
  return {
    x: ART.cx + Math.cos(ang) * ART.rx,
    y: ART.cy + depth * ART.ry + bob,
    depth,
    sc: 0.78 + 0.26 * (depth + 1) / 2,                 /* perspective scale */
  };
}

/* ---------- scene drawing ---------- */
let hovered = null;
function drawSky(dt, clockMs) {
  ctx.clearRect(0, 0, W, H);
  par.x += (par.tx - par.x) * 0.06; par.y += (par.ty - par.y) * 0.06;
  const t = clockMs / 1000;

  /* the nebulae ride behind everything (baked sprites, two blits) */
  if (nebA && !warp.active) {
    ctx.drawImage(nebA, neb1.x - neb1.s / 2, neb1.y - neb1.s / 2, neb1.s, neb1.s);
    ctx.drawImage(nebB, neb2.x - neb2.s / 2, neb2.y - neb2.s / 2, neb2.s, neb2.s);
  }

  /* stars */
  for (const s of stars) {
    let x = s.x + par.x * 14 * s.z, y = s.y + par.y * 10 * s.z;
    if (warp.active) {
      /* stretch into velocity streaks toward the warp origin */
      const dx = x - warp.cx * W, dy = y - warp.cy * H;
      const st = warp.p * 46 * s.z;
      ctx.strokeStyle = s.hue + (0.5 + warp.p * 0.5) + ')';
      ctx.lineWidth = s.r * (0.8 + warp.p);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx * st * 0.012, y + dy * st * 0.012);
      ctx.stroke();
    } else {
      const twinkle = reduced() ? 0.75 : 0.55 + 0.45 * Math.sin(t * 1.4 + s.tw);
      ctx.fillStyle = s.hue + (twinkle * 0.9) + ')';
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, 7); ctx.fill();
      if (s.k) {                                       /* the giants carry a cross-glint */
        const gl = s.r * 4.5;
        ctx.strokeStyle = s.hue + (twinkle * 0.35) + ')';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x - gl, y); ctx.lineTo(x + gl, y);
        ctx.moveTo(x, y - gl); ctx.lineTo(x, y + gl);
        ctx.stroke();
      }
    }
  }

  /* hub decoration only while the hub is on stage */
  if (Scenes.current === 'hub' && desktop()) {
    /* THE DIAL, ENGRAVED (M3): baked once per resize, blitted once per frame */
    if (dialSpr) ctx.drawImage(dialSpr, ART.cx - dialW / 2, ART.cy - dialH / 2, dialW, dialH);
    /* the sweep (spectacle pass): a bright brass arc rides the dial like a
       radar trace — a fading tail, a hot head, a bead of light. Two strokes
       and one dot per frame; rm holds the dial still. */
    if (!reduced()) {
      const sw = (clockMs / 9000) * Math.PI * 2;
      ctx.strokeStyle = BRASS_STROKE;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.ellipse(ART.cx, ART.cy, ART.rx, ART.ry, 0, sw - 0.55, sw); ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(ART.cx, ART.cy, ART.rx, ART.ry, 0, sw - 0.1, sw); ctx.stroke();
      ctx.fillStyle = '#ffe9b8';
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(ART.cx + Math.cos(sw) * ART.rx, ART.cy + Math.sin(sw) * ART.ry, 1.8, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }

    /* z-sort: far worlds first, then the Artifact, then near worlds */
    const ps = WORLDS.map((w, i) => ({ w, i, p: planetPos(i, clockMs) }));
    const drawWorld = ({ w, i, p }) => {
      const a = anchors.get(w.slug);
      const dim = 0.45 + 0.55 * (p.depth + 1) / 2;
      /* the perturbation rides on top of the clockwork: integrate the spring
         (unless held), then everything that IS the world — planet, anchor,
         spoke, tell — follows the perturbed point (the survey arc projects
         to the strayed world's bearing; the rail itself never moves). */
      const pt = perturb[i];
      if (grabIx !== i) integratePerturb(pt, dt);
      p.x += pt.ox; p.y += pt.oy;
      if (a) {
        a.style.setProperty('--pax', p.x.toFixed(1) + 'px');
        a.style.setProperty('--pay', p.y.toFixed(1) + 'px');
        /* the anchor box matches the DRAWN planet (1.5x the registry size)
           so tap targets and labels track the bigger v7 worlds */
        a.style.setProperty('--psize', Math.round(w.size * 1.5 * p.sc) + 'px');
        /* a far-side world crossing the Artifact's face is OCCLUDED: its name
           must nearly vanish too, not float legible across the gold */
        const occluded = p.depth <= 0 && Math.abs(p.x - ART.cx) < ART.r + 50;
        a.style.setProperty('--pdim', (occluded ? 0.12 : dim).toFixed(2));
        /* the DOM mirrors the canvas z-sort: a world occluded BEHIND the
           Artifact must not own the clicks on the sphere's face (its anchor
           drops below artifact-hit's z15; near worlds ride above it) */
        a.style.zIndex = p.depth > 0 ? 22 : 14;
        /* label side from LIVE geometry, not DOM parity (M3): far-side worlds
           wear their nameplate above, near-side below — the orbital periods
           scramble adjacency, so a fixed odd/even split guaranteed collisions */
        a.classList.toggle('pl-above', p.depth < 0);
      }
      const hov = hovered === w.slug;
      const dx0 = p.x - ART.cx, dy0 = p.y - ART.cy, hyp = Math.hypot(dx0, dy0) || 1;
      const th = Math.atan2(dy0 / ART.ry, dx0 / ART.rx);
      /* the armature: a faint radius from the Artifact's limb out to the
         world's bearing, brighter on the near side and igniting on hover —
         the brass spokes an orrery is supposed to have (M3). Constant brass
         + globalAlpha: the draw loop mints no strings (house rule). Skipped
         while the world crosses the sphere's face/back (hyp ≤ limb: the
         'radius' would otherwise overshoot outward past the planet). */
      ctx.strokeStyle = BRASS_STROKE;
      if (hyp > ART.r + 8) {
        ctx.globalAlpha = (hov ? 0.30 : 0.055) * (0.4 + 0.6 * dim);
        ctx.lineWidth = hov ? 1.2 : 1;
        ctx.beginPath();
        ctx.moveTo(ART.cx + dx0 * (ART.r / hyp), ART.cy + dy0 * (ART.r / hyp));
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      /* the survey, given a face on the dial: the ~11° of ring each world
         owns fills SOLID brass once surveyed, and stays a dim dashed gap
         until then — the ring visibly gilds itself as you complete the tour */
      const span = (Math.PI * 2 / WORLDS.length) * 0.46;
      if (surveyed.has(w.slug)) {
        ctx.globalAlpha = 0.42 * (0.45 + 0.55 * dim);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(ART.cx, ART.cy, ART.rx, ART.ry, 0, th - span, th + span); ctx.stroke();
      } else {
        ctx.globalAlpha = 0.24 * (0.45 + 0.55 * dim);
        ctx.lineWidth = 1.4; ctx.setLineDash(DASH_ARC);
        ctx.lineDashOffset = reduced() ? 0 : -t * 6;
        ctx.beginPath(); ctx.ellipse(ART.cx, ART.cy, ART.rx, ART.ry, 0, th - span, th + span); ctx.stroke();
        ctx.setLineDash(DASH_NONE);
      }
      ctx.globalAlpha = 1;
      /* staged bake (M2): a world still in the oven draws nothing; a fresh
         one materializes — grows in over half a second as the orrery wakes */
      const mat = PlanetForge.progress ? PlanetForge.progress(w.slug) : 1;
      if (mat > 0) {
        ctx.globalAlpha = (hov ? 1 : 0.62 + 0.38 * (p.depth + 1) / 2) * mat;
        /* bigger, richer worlds: 0.74 draw factor (was 0.55), deeper hover swell */
        PlanetForge.draw(ctx, w.slug, p.x, p.y,
          w.size * 0.74 * p.sc * (hov ? 1.18 : 1) * (0.72 + 0.28 * mat),
          clockMs, { hover: hov, rm: reduced() });
        ctx.globalAlpha = 1;
      }

      if (w.tell === 'dashed' && mat > 0) {            /* the unknown keeps its survey ring —
                                                          but not before the world itself exists */
        ctx.strokeStyle = w.tellStroke;                /* baked once below: zero per-frame strings */
        ctx.globalAlpha = 0.55 * (0.5 + 0.5 * dim) * mat;
        ctx.setLineDash(DASH_TELL);
        ctx.lineDashOffset = reduced() ? 0 : -t * 8;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, w.size * 0.95 * p.sc, 0, 7); ctx.stroke();
        ctx.setLineDash(DASH_NONE);
        ctx.globalAlpha = 1;
      }
    };
    for (const e of ps) if (e.p.depth <= 0) drawWorld(e);
    if (window.SphereForge) {
      SphereForge.drawShadowPass(ctx, ART.cx, ART.cy, ART.r);
      SphereForge.draw(ctx, ART.cx, ART.cy, ART.r, clockMs, { rm: reduced() });
      SphereForge.drawSonar(ctx, ART.cx, ART.cy, ART.r, clockMs);
    }
    for (const e of ps) if (e.p.depth > 0) drawWorld(e);
  } else if (Scenes.current === 'hub' && window.SphereForge && ART.cy > -ART.r * 1.6) {
    /* the pocket orrery (M2): full presence — seated, shadowed, answerable,
       and gone with its stage once the list scrolls past it. The stageless
       fallback keeps v6's dim ambient presence under the rows instead. */
    if (ART.fb) {
      ctx.globalAlpha = 0.5;
      SphereForge.draw(ctx, ART.cx, ART.cy, ART.r, clockMs, { rm: reduced() });
      ctx.globalAlpha = 1;
    } else {
      SphereForge.drawShadowPass(ctx, ART.cx, ART.cy, ART.r);
      SphereForge.draw(ctx, ART.cx, ART.cy, ART.r, clockMs, { rm: reduced() });
    }
    SphereForge.drawSonar(ctx, ART.cx, ART.cy, ART.r, clockMs);
  }

  /* comets, when any are in flight */
  if (cometAlive()) drawComets(dt);

  /* the cursor's lamp: the pointer carries a soft light across the hub */
  if (Scenes.current === 'hub' && finePointer && !reduced() && par.px > -9999) {
    bakeGlow();
    par.gx += (par.px - par.gx) * Math.min(1, dt * 0.012);   /* the light lags, like a lamp on a line */
    par.gy += (par.py - par.gy) * Math.min(1, dt * 0.012);
    if (par.gx < -9000) { par.gx = par.px; par.gy = par.py; }
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSpr, par.gx - 96, par.gy - 96, 192, 192);
    ctx.globalCompositeOperation = 'source-over';
  }

  if (warp.active) { warp.p = Math.min(1, warp.p + dt / 700); }
}

function drawStatic() { drawSky(16, Ticker.clock); }

/* event-driven repaints coalesce to one per frame: the rm hover/touch paths
   ask for a repaint instead of painting inline, so sweeping the whole ring
   (11 enters + 11 leaves) costs one drawSky pass, not twenty-two */
let staticReq = 0;
function requestStatic() {
  if (staticReq) return;
  staticReq = requestAnimationFrame(() => { staticReq = 0; drawStatic(); });
}

/* ---------- ambient: the idle loop + random-cadence comets (pooled, §2.10)
   A 3-slot pool: the usual lone wanderer, and one visit in three a
   SHOWER of three staggered streaks. The pool is its own lock. ---------- */
const comets = [
  { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 },
  { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 },
  { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 },
];
const cometAlive = () => comets[0].alive || comets[1].alive || comets[2].alive;
function launchComet() {
  if (document.hidden || reduced() || Scenes.current !== 'hub') return;
  let c = null;
  for (const k of comets) if (!k.alive) { c = k; break; }
  if (!c) return;
  c.alive = true; c.life = 0;
  c.x = -40; c.y = H * (0.1 + Math.random() * 0.3);
  c.vx = 0.38 + Math.random() * 0.2; c.vy = 0.06 + Math.random() * 0.05;
}
function drawComets(dt) {
  for (const c of comets) {
    if (!c.alive) continue;
    c.life += dt; c.x += c.vx * dt; c.y += c.vy * dt;
    const fade = Math.min(1, c.life / 300) * Math.max(0, 1 - (c.x / (W + 80)));
    ctx.strokeStyle = `rgba(207,216,255,${0.7 * fade})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x - 90 * c.vx, c.y - 90 * c.vy); ctx.stroke();
    if (c.x > W + 80) c.alive = false;
  }
}
let cometTimer = null, showerT1 = null, showerT2 = null;
function scheduleComet() {
  clearTimeout(cometTimer);
  cometTimer = setTimeout(() => {
    launchComet();
    /* one visit in three, the comet arrives as a shower of three */
    if (Math.random() < 0.34) {
      clearTimeout(showerT1); clearTimeout(showerT2);
      showerT1 = setTimeout(launchComet, 700 + Math.random() * 500);
      showerT2 = setTimeout(launchComet, 1600 + Math.random() * 700);
    }
    scheduleComet();
  }, 13000 + Math.random() * 15000);       /* the sky performs more often (spectacle pass) */
}

/* ---------- the sonar: the Artifact calls out on its own slow clock.
   The visual ring only moves when motion is allowed; the EVENT always fires
   (the score answers it when the context is running) ---------- */
let sonarTimer = null;
function pingSonar() {
  if (document.hidden || Scenes.current !== 'hub') return;
  if (window.SphereForge && !reduced()) {
    SphereForge.ping();
    if (!skyTask) Orrery.startAmbient();               /* rings need the loop */
  }
  Orrery.events.dispatchEvent(new CustomEvent('sonar'));
}
function scheduleSonar() {
  clearTimeout(sonarTimer);
  sonarTimer = setTimeout(() => { pingSonar(); scheduleSonar(); }, 6400 + Math.random() * 1800);
}
function stopSonar() { clearTimeout(sonarTimer); sonarTimer = null; }

/* ---------- the Artifact's DOM presence: focusable, labeled, answerable ---------- */
const artHit = document.getElementById('artifact-hit');
const artLabel = document.getElementById('artifact-label');
function placeArtifactDom() {
  /* phone: the disc/plate are position:absolute INSIDE the scrolling hub
     scene (03b) — write content-space coords (viewport + scrollTop) once
     and the browser scrolls them natively with the stage */
  const hubEl = Scenes.els.get('hub');
  const sTop = !desktop() && hubEl ? hubEl.scrollTop : 0;
  if (artHit) {
    artHit.style.setProperty('--ax', ART.cx + 'px');
    artHit.style.setProperty('--ay', (ART.cy + sTop) + 'px');
    artHit.style.setProperty('--ar', Math.round(ART.r * 2) + 'px');
  }
  if (artLabel) {
    artLabel.style.setProperty('--ax', ART.cx + 'px');
    /* phone: the plate tucks close under the limb so it stays inside the
       stage instead of colliding with the first world row */
    artLabel.style.setProperty('--ay', Math.round(ART.cy + ART.r + (desktop() ? 30 : 10) + sTop) + 'px');
  }
}
let artLast = 0, artTouches = 0, artRmT = null, artLabelLock = false;
/* the plate whispers for `ms`, then returns to whatever the survey arc has
   made the resting line (dataset.home is kept current by paint()) */
function whisperArtLabel(text, ms) {
  if (!artLabel || artLabelLock) return;
  artLabel.textContent = text;
  clearTimeout(artRmT);
  artRmT = setTimeout(() => { if (!artLabelLock) artLabel.textContent = artLabel.dataset.home || text; }, ms);
}
function touchArtifact() {
  const now = performance.now();
  if (now - artLast < 700) return;                     /* it does not answer to hammering */
  artLast = now;
  artTouches++;
  if (window.SphereForge && !reduced()) {
    SphereForge.ripple();
    /* provoke it enough and, for a moment, the plates part: you see what
       is underneath (every third touch; the ripple masks the swap) — and
       the plate finally says a word about it (M3) */
    if (artTouches % 3 === 0 && SphereForge.reveal) {
      SphereForge.reveal(2600);
      whisperArtLabel('Object 0 · that is not a shell', 2600);
    }
    if (!skyTask) Orrery.startAmbient();
  } else if (reduced()) {
    /* rm: the answer is designed, not stripped — a repaint (any pending skin
       swap lands on it) and the plate acknowledges in text for a beat.
       No reveal here: with the clock held, the glimpse could never end. */
    requestStatic();
    whisperArtLabel('Object 0 · it heard you', 2000);
  }
  Orrery.events.dispatchEvent(new CustomEvent('artifact'));
}
if (artHit) artHit.addEventListener('click', touchArtifact);

/* the idle sky task: runs only when something moves */
let skyTask = null;
const Orrery = {
  startAmbient() {
    if (skyTask || reduced()) { requestStatic(); return; }
    skyTask = (dt, c) => { drawSky(dt, c); return true; };
    Ticker.add(skyTask);
    scheduleComet();
  },
  stopAmbient() {
    if (skyTask) { Ticker.remove(skyTask); skyTask = null; }
    clearTimeout(cometTimer);
    drawStatic();                                      /* the designed pose, not a blank */
  },
  events: new EventTarget(),
  ticker: Ticker,
  reduced,
  requestStatic,                     /* SphereForge repaints late-landing rm skins through this */
  worlds: WORLDS,
};
window.Orrery = Orrery;

/* ---------- hover sync (accent retint is a token write, animated by @property) ---------- */
anchors.forEach((a, slug) => {
  const w = bySlug[slug];
  const tint = () => {
    hovered = slug;
    html.style.setProperty('--acc', `rgb(${w.a.join(',')})`);
    html.style.setProperty('--acc-rgb', w.a.join(','));
    /* the Artifact considers the world with you: it wears that world's face */
    if (window.SphereForge && SphereForge.setSkin) SphereForge.setSkin(slug);
    if (!skyTask) Orrery.startAmbient();       /* the morph needs frames; under rm this
                                                  IS the one designed repaint (drawStatic) */
    Orrery.events.dispatchEvent(new CustomEvent('preview', { detail: { slug } }));
  };
  const untint = () => {
    if (hovered === slug) hovered = null;
    if (window.SphereForge && SphereForge.setSkin) SphereForge.setSkin('hub');
    if (reduced()) requestStatic();            /* rm: return the resting face too */
  };
  a.addEventListener('pointerenter', tint);
  a.addEventListener('focus', tint);
  a.addEventListener('pointerleave', untint);
  a.addEventListener('blur', untint);
});

/* ---------- scenes + travel ---------- */
const Scenes = {
  current: null,
  els: new Map(),
  transitioning: false,
};
document.querySelectorAll('.scene').forEach(s => Scenes.els.set(s.dataset.scene, s));
const locName = document.getElementById('hud-loc-name');
const returnBtn = document.getElementById('return-orbit');

/* the surveyed set lives in localStorage now: a survey that evaporates when
   the tab closes was never a pull-back loop (M3, council ruling 6) */
let surveyed = new Set();
try { surveyed = new Set(JSON.parse(keep.get('orrery-surveyed') || '[]')); } catch (_) {}
function markSurveyed(slug) {
  surveyed.add(slug);
  keep.set('orrery-surveyed', JSON.stringify([...surveyed]));
  const a = anchors.get(slug);
  if (a) a.querySelector('.pa-tick').hidden = false;
}
surveyed.forEach(s => { const a = anchors.get(s); if (a) a.querySelector('.pa-tick').hidden = false; });

/* ---------- The Surveyor's Log: make the surveyed set visible + rewarding.
   Builds on markSurveyed / 'orrery-surveyed' (above). Data-driven off WORLDS,
   so it is correct at 7 worlds or 10. Event-driven: zero rAF, zero canvas.
   ANCHOR: directly after the `surveyed.forEach(...)` tick-restore line. ---------- */
(() => {
  const plate = document.getElementById('survey-log');
  if (!plate) return;                                 /* no plate → nothing to log */
  const dotsWrap = plate.querySelector('.survey-dots');
  const countEl  = plate.querySelector('.survey-count');
  const total = WORLDS.length;
  const COMPLETE_KEY = 'orrery-survey-complete';        /* localStorage: the rite fires once ever */
  const HONOR = 'Master surveyor. The orrery remembers.';
  /* the survey's aria-live voice: progress and the rite, spoken politely */
  const liveEl = document.getElementById('survey-live');
  const announce = (t) => { if (liveEl) liveEl.textContent = t; };

  /* one ringed dot per world, in registry order, built once */
  const dots = WORLDS.map((w) => {
    const d = document.createElement('span');
    d.className = 'survey-dot';
    d.dataset.world = w.slug;
    d.title = w.label;                                /* sighted hover tooltip */
    dotsWrap.appendChild(d);
    return d;
  });

  const countSurveyed = () => WORLDS.reduce((n, w) => n + (surveyed.has(w.slug) ? 1 : 0), 0);

  let sealed = false;
  function showSeal() {                               /* reuse the konami seal's look; distinct node */
    if (sealed || plate.querySelector('.log-seal')) { sealed = true; return; }
    const seal = document.createElement('span');
    seal.className = 'konami-seal log-seal';          /* inherits the gold visual + rm-gated glow */
    seal.title = HONOR;
    (plate.querySelector('.survey-plate') || plate).appendChild(seal);
    sealed = true;
  }

  let lastN = countSurveyed();                          /* boot pose: never announced */
  function paint() {
    const n = countSurveyed();
    if (n !== lastN) {
      lastN = n;
      if (n < total) announce(n + ' of ' + total + ' worlds surveyed.');
    }
    for (const d of dots) d.classList.toggle('is-surveyed', surveyed.has(d.dataset.world));
    if (countEl) countEl.textContent = n + '/' + total;
    const done = n >= total;
    plate.setAttribute('aria-label',
      done ? ('All ' + total + ' worlds surveyed. Master surveyor.')
           : (n + ' of ' + total + ' worlds surveyed'));
    /* the location strip carries the count on every homecoming, so the
       survey stops being invisible: 'Orbit · 4 of 11 surveyed' (M3) */
    if (Scenes.current === 'hub' && locName) {
      locName.textContent = done ? 'Orbit · survey complete'
        : n > 0 ? ('Orbit · ' + n + ' of ' + total + ' surveyed')
        : 'Orbit · choose a world';
    }
    /* the Artifact's plate narrates the rising mystery too: once you've
       started, it admits something is down there; complete, it knows you */
    if (artLabel && !artLabelLock) {
      const resting = done ? 'Object 0 · it knows you now'
        : n >= 4 ? 'Object 0 · something moved beneath'
        : 'Object 0 · unsurveyed';
      artLabel.textContent = resting;
      artLabel.dataset.home = resting;                  /* the restore target follows the arc */
    }
    if (done && keep.get(COMPLETE_KEY) === '1') showSeal();   /* already earned */
  }

  let riteDone = false;                                /* in-memory once-guard: blocked storage
                                                          must not re-fire the rite per scene */
  function maybeCompletionRite() {
    if (countSurveyed() < total) return;
    if (riteDone || keep.get(COMPLETE_KEY) === '1') { riteDone = true; showSeal(); return; }
    /* completion is always REACHED inside the 11th world — but the rite's
       stage (the ring, the sphere) is the hub. Hold fire until homecoming:
       the 'scene' listener re-runs this the moment they return to orbit,
       and the orrery answers where the visitor can actually see it. */
    if (Scenes.current !== 'hub') return;
    riteDone = true;
    keep.set(COMPLETE_KEY, '1');
    showSeal();
    /* THE RITE — the Artifact answers the completed survey at last:
       the plates part FULLY (longer than the touch glimpse), the wrong
       answering tone comes true and rises, and the whole ring pulses gold. */
    if (artLabel) {
      artLabelLock = true;
      artLabel.textContent = 'Object 0 · survey accepted';
    }
    if (artHit) artHit.setAttribute('aria-label', 'Object 0. Survey accepted. It knows you now.');
    announce('All eleven worlds surveyed. ' + HONOR);   /* AT shares the moment */
    if (window.SphereForge && SphereForge.reveal && !reduced()) SphereForge.reveal(5200);
    document.querySelectorAll('.planet-anchor').forEach(a => {
      a.classList.remove('pa-rite'); void a.offsetWidth; a.classList.add('pa-rite');
      setTimeout(() => a.classList.remove('pa-rite'), 2600);
    });
    try { Orrery.events.dispatchEvent(new CustomEvent('mastery')); } catch (_) {}
    const hint = document.querySelector('.hub-hint');            /* swap the honor in for 10s */
    if (hint) hint.textContent = HONOR;
    setTimeout(() => {                                 /* the release must NOT depend on the hint */
      if (hint && hint.textContent === HONOR) hint.textContent = hint.dataset.home || HONOR;
      artLabelLock = false;
      paint();                                         /* settle to the resting arc line */
    }, 10000);
  }

  /* live: setScene runs markSurveyed, THEN dispatches 'scene' — by the time we
     hear it the set already holds the world just entered. Re-read + repaint. */
  Orrery.events.addEventListener('scene', () => { paint(); maybeCompletionRite(); });

  paint();                                            /* initial pose from the restored set */
})();

function setScene(name, { instant = false } = {}) {
  if (Scenes.current === name) return;
  const prevName = Scenes.current;
  const prev = Scenes.els.get(prevName);
  const next = Scenes.els.get(name);
  if (!next) return;

  if (prev) { prev.classList.remove('is-active'); prev.classList.add('is-leaving');
    setTimeout(() => prev.classList.remove('is-leaving'), 400); }
  next.classList.add('is-active');
  next.scrollTop = 0;
  Scenes.current = name;

  const isHub = name === 'hub';
  returnBtn.hidden = isHub;
  if (isHub) {
    locName.textContent = 'Orbit · choose a world';
    html.style.setProperty('--acc', '#64d5f5');
    html.style.setProperty('--acc-rgb', '100, 213, 245');
    /* homecoming resets the Artifact's face: the departure beat set a skin
       and a tap never blurs on iOS, so untint alone cannot be trusted */
    if (window.SphereForge && SphereForge.setSkin) SphereForge.setSkin('hub');
    Orrery.startAmbient();
    scheduleSonar();                                   /* home again: the call resumes */
    WorldFX.stopAll();
    /* the keyboard traveler lands back on the planet they left (Smaug kill 10) */
    if (prevName && prevName !== 'hub') {
      const back = anchors.get(prevName);
      if (back) back.focus({ preventScroll: true });
    }
  } else {
    const w = bySlug[name];
    locName.textContent = `World · ${w.label}`;
    html.style.setProperty('--acc', `rgb(${w.a.join(',')})`);
    html.style.setProperty('--acc-rgb', w.a.join(','));
    Orrery.stopAmbient();                              /* one scene owns the frame budget */
    stopSonar();                                       /* the call is a hub voice only */
    WorldFX.start(name);
    markSurveyed(name);
    /* refresh this card's medallion so the little world advanced since last
       visit (skip while it bakes: wiping the canvas before a no-op drawMini
       would blank it — onReady paints it the moment it lands) */
    const med = next.querySelector('.card-planet');
    if (med && window.PlanetForge && (!PlanetForge.progress || PlanetForge.progress(name) > 0)) {
      const g2 = med.getContext('2d');
      const dpr2 = Math.min(devicePixelRatio || 1, 2);
      med.width = 72 * dpr2; med.height = 72 * dpr2;
      g2.setTransform(dpr2, 0, 0, dpr2, 0, 0);
      PlanetForge.drawMini(g2, name, 72, Ticker.clock);
    }
    /* move focus for keyboard/AT travelers: the heading when it is shown
       (brochure), else the scene itself (the visual cut hides the h2) */
    const h = next.querySelector('h2');
    if (h && getComputedStyle(h).display !== 'none') {
      h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true });
    } else {
      next.setAttribute('tabindex', '-1'); next.focus({ preventScroll: true });
    }
  }
  Orrery.events.dispatchEvent(new CustomEvent('scene', { detail: { name, instant } }));
}

/* the warp: land the scene under the flood's PEAK; let the flood fade out
   OVER the arriving world; never cancel the animation mid-arc (Smaug kill 4).
   animationend is the fast path; a deterministic timer is the guarantee it
   never sticks (animationend can be missed when scenes toggle mid-flight). */
let travelTimer = null, warpClearTimer = null;
let beatTimer = null, beatSlug = null;                 /* the phone departure beat's latch */
const warpEl = document.getElementById('warpfx');
function endWarp() { clearTimeout(warpClearTimer); html.classList.remove('warping'); warp.active = false; }
warpEl.addEventListener('animationend', endWarp);

function travel(slug, fromBeat) {
  if (Scenes.transitioning || Scenes.current === slug) return;
  const w = bySlug[slug];
  if (!w) return;

  if (reduced()) { location.hash = '#/world/' + slug; return; }   /* router does a crossfade */

  /* the phone departure beat (M2): the orrery acknowledges the choice —
     the sphere considers the world and a sonar ring answers — THEN the
     warp fires. 300ms of anticipation instead of an unceremonious cut. */
  if (!fromBeat && !desktop() && window.SphereForge && Scenes.current === 'hub'
      && ART.cy > 0                                    /* only while the sphere is on stage */
      && !(TourController && TourController.running)) { /* the autopilot keeps its own cadence */
    beatSlug = slug;                                   /* a second tap RE-AIMS the pending beat */
    SphereForge.setSkin(slug);
    SphereForge.ping();
    if (!skyTask) Orrery.startAmbient();
    clearTimeout(beatTimer);
    beatTimer = setTimeout(() => {
      beatTimer = null;
      const s = beatSlug; beatSlug = null;
      travel(s, true);
    }, 300);
    return;
  }

  Scenes.transitioning = true;
  /* aim the flood at the planet's live position — on the phone, at the
     tapped row itself, so the warp blooms from under the finger (M2);
     clamped into the viewport for rows below the fold (the tour taps
     rows the reset scroll has not revealed) */
  let p;
  if (desktop()) {
    p = planetPos(WORLDS.indexOf(w), Ticker.clock);
  } else {
    const a = anchors.get(slug);
    const r = a && a.getBoundingClientRect();
    p = r && r.height ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: W / 2, y: H / 2 };
    p.x = Math.max(0, Math.min(W, p.x));
    p.y = Math.max(0, Math.min(H, p.y));
  }
  html.style.setProperty('--wx', (p.x / W * 100).toFixed(1) + '%');
  html.style.setProperty('--wy', (p.y / H * 100).toFixed(1) + '%');
  html.style.setProperty('--acc', `rgb(${w.a.join(',')})`);
  html.style.setProperty('--acc-rgb', w.a.join(','));

  warp.active = true; warp.p = 0; warp.cx = p.x / W; warp.cy = p.y / H;
  if (!skyTask) Orrery.startAmbient();                 /* streaks need the loop */
  html.classList.remove('warping'); void html.offsetWidth;   /* restartable */
  html.classList.add('warping');
  clearTimeout(warpClearTimer);
  warpClearTimer = setTimeout(endWarp, 1200);          /* guaranteed teardown (> --warp-ms) */
  Orrery.events.dispatchEvent(new CustomEvent('warp', { detail: { slug } }));

  travelTimer = setTimeout(() => {
    location.hash = '#/world/' + slug;                 /* the scene lands under the flood peak */
    Scenes.transitioning = false;
    travelTimer = null;
  }, 495);
}

/* clicks on planet anchors always go through the router's namespace —
   the hrefs themselves are DOCUMENT anchors so the no-JS brochure
   navigates natively (Smaug kill 3) */
anchors.forEach((a, slug) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (grabConsumed) return;                          /* that gesture was a THROW, not a choice */
    if (reduced()) { location.hash = '#/world/' + slug; return; }
    travel(slug);
  });
});
armGrabPhysics();
/* every return link is a document anchor for no-JS; the app routes it home */
document.querySelectorAll('a[data-return]').forEach(a => {
  a.addEventListener('click', (e) => { e.preventDefault(); location.hash = '#/'; });
});

/* Esc returns to orbit */
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && Scenes.current !== 'hub' && !Scenes.transitioning) location.hash = '#/';
});

/* ---------- router (deep links are LCP paths: no warp on arrival) ---------- */
function route(instant = false) {
  const m = location.hash.match(/^#\/world\/([a-z-]+)/);
  const slug = m && bySlug[m[1]] ? m[1] : null;
  setScene(slug || 'hub', { instant });
}
addEventListener('hashchange', () => {
  /* a Back press mid-warp always wins: cancel the pending land (Smaug kill 4)
     — and a pending departure beat dies with it (M2) */
  if (travelTimer) { clearTimeout(travelTimer); travelTimer = null; Scenes.transitioning = false; }
  if (beatTimer) { clearTimeout(beatTimer); beatTimer = null; beatSlug = null; }
  route(false);
});

/* ============================================================
   THE GRAND TOUR — a hands-free kiosk autopilot that surveys every
   world in WORLDS order. It travels ONLY through the public router:
   travel() (which sets location.hash = '#/world/<slug>') to go out,
   location.hash = '#/' to come home — so the warp streak, the score
   events, and markSurveyed all fire naturally. It never calls setScene.
   The tour clock rides the shared Ticker, so a hidden tab pauses it
   (document.hidden) and a revealed tab resumes it. Any user input
   (pointerdown / keydown / wheel / touchstart) ends it at once:
   timers cleared, label restored, the current scene left as-is.
   ============================================================ */
const TourController = (() => {
  const btn = document.getElementById('tour-toggle');
  if (!btn) return null;                               /* no control (no-JS) → no tour */
  const labelEl = btn.querySelector('.tour-label');
  const plate = document.getElementById('tour-progress');
  const hint = document.querySelector('.hub-hint');
  /* the one true resting line, stashed at parse: every swap-and-restore
     feature (tour closing note, surveyor honor) restores THIS, never a
     captured value (two features on one node were trading lies) */
  if (hint && !hint.dataset.home) hint.dataset.home = hint.textContent;

  const DWELL = 9000, BREATHE = 2500, CLOSING_MS = 8000;
  const CLOSING_NOTE = 'The survey is complete. The instruments are yours.';
  const N = WORLDS.length;

  /* the itinerary: world · breathe · world · breathe · … · world · closing */
  const legs = [];
  for (let i = 0; i < N; i++) { legs.push({ t: 'world', i }); if (i < N - 1) legs.push({ t: 'orbit' }); }
  legs.push({ t: 'closing' });

  const CANCEL = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  const OPTS = { capture: true, passive: true };
  let running = false, legIx = 0, legMs = 0, closeT = null, armT = null, hintSaved = null, suppressUntil = 0;
  let expectedHash = null;                              /* browser Back/Forward must end the tour;
                                                           null = between legs, accept any land */
  const onHash = () => { if (running && expectedHash !== null && (location.hash || '#/') !== expectedHash) stop(); };

  /* input ends the tour — EXCEPT the cockpit (M3): the tour's own control and
     the score toggle are part of driving the demo, not leaving it; and the
     arrow keys STEER the tour (→ next world, ← previous) instead of killing
     it. Everything else is a cancel, as before. */
  const onInput = (e) => {
    if (!running) return;
    if (e && e.type === 'keydown') {
      /* arrows only: Space can't be claimed from a passive listener (its
         default scroll still fires, and its keyup re-activates a focused
         tour button — a cancel disguised as a steer) */
      if (e.key === 'ArrowRight') { stepWorld(1); return; }
      if (e.key === 'ArrowLeft') { stepWorld(-1); return; }
    }
    const t = e && e.target;
    if (t && t.closest && t.closest('#tour-toggle, #audio-toggle')) return;   /* cockpit: no cancel */
    stop();
  };
  function addCancel() { for (const e of CANCEL) addEventListener(e, onInput, OPTS); }
  function rmCancel()  { for (const e of CANCEL) removeEventListener(e, onInput, OPTS); }

  function setUI(run) {
    btn.setAttribute('aria-pressed', String(run));
    btn.setAttribute('aria-label', run ? 'End the grand tour' : 'Start the grand tour');
    if (labelEl) labelEl.textContent = run ? 'End tour' : 'Tour';
  }
  function plateSay(txt) { if (plate) { plate.hidden = false; plate.textContent = txt; } }  /* aria-live */
  function plateHide()   { if (plate) { plate.hidden = true; plate.textContent = ''; } }

  function showClosing() {
    if (hint && hintSaved === null) hintSaved = hint.textContent;   /* capture live, never hardcode */
    if (hint) hint.textContent = CLOSING_NOTE;
    clearTimeout(closeT);
    closeT = setTimeout(restore, CLOSING_MS);
  }
  function restore() {
    clearTimeout(closeT); closeT = null;
    if (hint && hintSaved !== null) { hint.textContent = hint.dataset.home || hintSaved; hintSaved = null; }
    plateHide();
  }

  function enterLeg(ix) {
    legIx = ix; legMs = 0;
    const leg = legs[ix];
    if (!leg || leg.t === 'closing') { finish(); return; }
    if (leg.t === 'world') {
      const w = WORLDS[leg.i];
      expectedHash = '#/world/' + w.slug;
      /* the tour speaks the world's own poem now, not 'Stop 3 of 11' (M3) —
         WORLDS.poem is the single source the orbit em-lines also draw from */
      plateSay('Stop ' + (leg.i + 1) + ' of ' + N + ' · ' + w.label + ' — ' + w.poem);
      travel(w.slug);
    }
    else { expectedHash = '#/'; location.hash = '#/'; } /* orbit breather: home via the router */
  }
  /* arrow-key steering: jump to the next/previous WORLD leg (skip breathers) */
  function stepWorld(dir) {
    let j = legIx;
    do { j += dir; } while (j > 0 && j < legs.length - 1 && legs[j].t !== 'world');
    j = Math.max(0, Math.min(legs.length - 1, j));
    if (legs[j] && legs[j].t === 'world') enterLeg(j);
  }

  function tick(dt) {
    if (!running) return false;                          /* stopped → self-remove from the Ticker */
    if (document.hidden) return true;                    /* hidden tab pauses the tour clock */
    const leg = legs[legIx];
    if (!leg || leg.t === 'closing') return false;
    legMs += dt;
    if (legMs >= (leg.t === 'world' ? DWELL : BREATHE)) enterLeg(legIx + 1);
    return running;                                      /* finish() flips this false mid-tick */
  }

  function teardown() {                                  /* shared reset for stop + finish */
    running = false;
    Ticker.remove(tick);
    clearTimeout(armT); armT = null;
    rmCancel();
    removeEventListener('hashchange', onHash);
    setUI(false);
    suppressUntil = performance.now() + 350;             /* a click trailing a cancel must not restart */
  }
  function stop() {                                      /* user cancel: scene stays, no closing note */
    if (!running) return;
    teardown();
    plateHide();
  }
  function finish() {                                    /* natural completion: land home + closing note */
    if (!running) return;
    teardown();
    location.hash = '#/';
    plateSay('Survey complete');                         /* the accessible completion cue */
    showClosing();
  }
  function advance() { if (running) enterLeg(legIx + 1); }

  function start() {
    if (running) return;
    restore();                                           /* a lingering closing note yields to the new run */
    running = true; legIx = 0; legMs = 0; expectedHash = null;
    setUI(true);
    /* a start inside the ~0.5s warp window would be swallowed by
       Scenes.transitioning and silently skip stop 1: defer past the land
       (expectedHash stays null so the pending land does not read as Back) */
    if (Scenes.transitioning) { setTimeout(() => { if (running) enterLeg(0); }, 560); }
    else enterLeg(0);                                    /* from the hub: warp to world 1 */
    Ticker.add(tick);                                    /* the tour clock joins the shared rAF */
    addEventListener('hashchange', onHash);              /* Back/Forward ends the tour */
    clearTimeout(armT);
    armT = setTimeout(() => { if (running) addCancel(); }, 0);  /* let the starting gesture finish first */
  }

  btn.addEventListener('click', () => {
    if (running) { stop(); return; }                     /* explicit toggle-off (pointer + keyboard) */
    if (performance.now() < suppressUntil) return;       /* swallow the click riding a just-fired cancel */
    start();
  });

  /* the discovery nudge (M3): one beckon pulse of the footer control after a
     stretch of untouched hub, so the best demo feature is actually found.
     Fires at most once per visit; any real interaction cancels the arming. */
  let beckoned = false;
  function beckon() {
    if (beckoned || running || Scenes.current !== 'hub') return;
    beckoned = true;
    btn.classList.add('tour-beckon');
    setTimeout(() => btn.classList.remove('tour-beckon'), 3200);
  }

  return { start, stop, advance, beckon, get running() { return running; } };
})();

/* ---------- HUD clock: a wall clock lives on a wall timer, not the animation
   ticker — so the rAF loop can genuinely drain and stop (Smaug kill 5) ---------- */
const clockEl = document.getElementById('hud-clock');
/* frame budget steering (M2): phones cap at ~30fps always; desktop demotes
   after a minute of untouched hub (any input restores full rate next tick) */
let lastInput = performance.now();
['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(tp =>
  addEventListener(tp, () => { lastInput = performance.now(); }, { passive: true, capture: true }));
function tickClock() {
  if (!document.hidden) {
    clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  /* ~22s of untouched hub → beckon the Tour once (the feature most likely to
     run in front of a client, findable by nobody in a 0.72rem footer) */
  if (TourController && Scenes.current === 'hub' && performance.now() - lastInput > 22000) {
    TourController.beckon();
  }
  /* phones run budgeted EXCEPT while the visitor is actively touching or
     scrolling — the scroll-glued sphere must track the stage at full rate */
  const busy = performance.now() - lastInput < 1500;
  const idle = Scenes.current === 'hub' && performance.now() - lastInput > 60000;
  Ticker.setBudget((!desktop() && !busy) || idle ? 33 : 0);
}
setInterval(tickClock, 1000);
tickClock();

/* ---------- boot (called from the END of the concatenated bundle, after
   WorldFX and Score exist — a TDZ on a later-fragment const killed setScene
   mid-flight when this ran inline; concatenation builds boot LAST) ---------- */
function bootOrrery() {
  /* staged bake (M2): the sphere owns frame 0; the eleven worlds land one
     per idle slice and announce themselves everywhere they appear */
  PlanetForge.init(WORLDS, (slug) => {
    paintMedallion(slug);
    paintMini(slug);
    if (!skyTask) requestStatic();                     /* rm / idle: the newcomer still shows up */
  });
  if (window.SphereForge) SphereForge.init();          /* the Artifact bakes its gold */
  /* the hint speaks the visitor's input language: Tab/Enter mean nothing to
     a thumb. TourController's parse-time stash has already claimed the one
     true resting line (dataset.home), so re-point BOTH — otherwise the tour
     or the survey honor would restore keyboard wording onto a touch screen */
  const bootHint = document.querySelector('.hub-hint');
  if (bootHint && matchMedia('(pointer: coarse)').matches) {
    bootHint.textContent = 'Tap a world to travel';
    bootHint.dataset.home = bootHint.textContent;
  }
  /* one source of truth for the poems: app mode re-syncs the orbit em-lines
     from the registry (the HTML copies serve the no-JS brochure only) */
  anchors.forEach((a, slug) => {
    const em = a.querySelector('.pa-label em');
    if (em && bySlug[slug] && bySlug[slug].poem) em.textContent = bySlug[slug].poem;
  });
  sizeSky();
  setRM();
  /* the pocket stage scrolls with the hub column: keep the sphere glued to
     it (one rect read per scroll event; the ambient loop paints the move,
     and rm gets its coalesced repaint) */
  const hubEl = Scenes.els.get('hub');
  if (hubEl) hubEl.addEventListener('scroll', () => {
    if (desktop()) return;
    lastInput = performance.now();
    Ticker.setBudget(0);                               /* full rate NOW; tickClock re-budgets later */
    measureOrbit();
    if (!skyTask) requestStatic();
  }, { passive: true });
  route(true);
  if (!reduced()) Orrery.startAmbient();
  runApproach();                                     /* first-visit arrival cinematic */
  /* re-measure the arc once type has settled (font metrics can shift the copy block) */
  setTimeout(() => { measureOrbit(); drawStatic(); paintMedallions(); }, 350);
  /* no sonar arm here: setScene('hub') schedules it on every hub arrival,
     and a deep-link boot into a world must not run a perpetual no-op timer */
}

/* the brass card medallions: one small spinning-world portrait per card,
   painted as each world bakes and refreshed on each arrival */
function paintMedallion(slug) {
  const sec = Scenes.els.get(slug);
  if (!sec || !window.PlanetForge) return;
  const c = sec.querySelector('.card-planet'); if (!c) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const size = 72;
  c.width = size * dpr; c.height = size * dpr;
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  PlanetForge.drawMini(g, slug, size, Ticker.clock);
}
function paintMedallions() { WORLDS.forEach(w => paintMedallion(w.slug)); }

/* the phone list shows the REAL worlds (M2): each row's dot wears a baked
   PlanetForge portrait — one 68px offscreen bake per world, zero per-frame */
function paintMini(slug) {
  if (desktop() || !window.PlanetForge) return;
  if (PlanetForge.progress && !PlanetForge.progress(slug)) return;   /* still in the oven */
  const a = anchors.get(slug); if (!a) return;
  const dot = a.querySelector('.pa-dot'); if (!dot) return;
  const c = document.createElement('canvas');
  c.width = c.height = 68;
  PlanetForge.drawMini(c.getContext('2d'), slug, 68, Ticker.clock);
  dot.style.backgroundImage = `url(${c.toDataURL()})`;
  dot.classList.add('pa-mini');
}
function bakeMinis() { WORLDS.forEach(w => paintMini(w.slug)); }

/* ---------- THE APPROACH: the once-per-session arrival cinematic ----------
   First hub visit only. You drift in from the dark and the instruments wake.
   All motion lives in CSS (03c), keyed off html.approaching; this only flips
   the class, sounds one sonar mid-drift, and guarantees the settle. Skips
   entirely for reduced motion, for a return visit (sessionStorage), and for
   any deep link into a world. ANY input aborts straight to the settled pose. */
function runApproach() {
  if (reduced()) return;                        /* rm: the page simply arrives settled */
  if (Scenes.current !== 'hub') return;         /* a deep link owns the frame; no intro */
  if (store.get('orrery-approach')) return;     /* seen this session: reloads skip */
  store.set('orrery-approach', '1');            /* mark NOW: even an abort counts as seen */

  html.classList.add('approached');             /* permanent: suppresses the base hub rise-in */
  html.classList.add('approaching');            /* transient: drives the cinematic */

  let done = false, endT = 0, pingT = 0;
  const finish = () => {
    if (done) return; done = true;
    clearTimeout(endT); clearTimeout(pingT);
    html.classList.remove('approaching');       /* every animation resolves to its settled base */
    removeEventListener('pointerdown', skip, true);
    removeEventListener('keydown', skip, true);
    removeEventListener('wheel', skip, true);
  };
  const skip = () => finish();                   /* any input drops instantly to settled */
  /* capture-phase + non-blocking: we never preventDefault, so the audio
     ignition's own pointerup/keydown/click listeners still fire underneath */
  addEventListener('pointerdown', skip, { capture: true, passive: true });
  addEventListener('keydown', skip, { capture: true });
  addEventListener('wheel', skip, { capture: true, passive: true });

  /* ~2.2s in, the instrument calls once: the visual ring + its wet blip. The
     score answers only if it is truly running (the sonar handler guards ready). */
  pingT = setTimeout(() => {
    if (done || document.hidden || Scenes.current !== 'hub') return;
    if (!skyTask) Orrery.startAmbient();         /* the ring needs the loop */
    if (window.SphereForge && !reduced()) SphereForge.ping();
    Orrery.events.dispatchEvent(new CustomEvent('sonar'));
  }, 2200);

  endT = setTimeout(finish, 4600);               /* ~4.5s: the settle, class removed */
}
