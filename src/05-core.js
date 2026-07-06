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
  if (rmq.matches) Orrery.stopAmbient(); else Orrery.startAmbient();
};
/* live re-check: latching this at load was a documented kill (LESSONS 2026-07-05) */
rmq.addEventListener('change', setRM);
const reduced = () => rmq.matches;

const finePointer = matchMedia('(pointer: fine)').matches;

/* ---------- the shared clock + ticker (§2.1) ---------- */
const Ticker = (() => {
  const tasks = new Set();
  let rafId = null, last = 0, clock = 0, running = false;
  function frame(now) {
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
  };
})();
document.addEventListener('visibilitychange', () => {
  /* the frame loop self-gates on document.hidden; audio handled in 07 */
});

/* ---------- world registry (data; FX bodies live in 06) ---------- */
const WORLDS = [
  { slug: 'sonora',       label: 'Sonora',              size: 56, tell: 'heat',    a: [255, 178, 94],  speed: 0.045 },
  { slug: 'neon-mesa',    label: 'Neon Mesa',           size: 64, tell: 'pulse',   a: [255, 46, 151],  speed: 0.06 },
  { slug: 'undercurrent', label: 'Undercurrent',        size: 54, tell: 'breathe', a: [53, 240, 200],  speed: 0.052 },
  { slug: 'lattice',      label: 'The Lattice',         size: 60, tell: 'glint',   a: [168, 233, 255], speed: 0.038 },
  { slug: 'undesignated', label: 'DDL-5: Undesignated', size: 46, tell: 'dashed',  a: [100, 213, 245], speed: 0.07 },
];
const bySlug = Object.fromEntries(WORLDS.map(w => [w, w] && [w.slug, w]));

/* ---------- the sky canvas ---------- */
const sky = document.getElementById('sky');
const ctx = sky.getContext('2d');
let W = 0, H = 0, DPR = 1;
function sizeSky() {
  DPR = Math.min(devicePixelRatio || 1, 2);           /* the phone-cook cap */
  W = innerWidth; H = innerHeight;
  sky.width = Math.round(W * DPR); sky.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  buildStars();
  measureArc();
  drawStatic();                                        /* rm / idle repaint */
}
let resizeT = null;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(sizeSky, 120); }, { passive: true });

/* ---------- starfield: 3 depth layers, pooled ---------- */
let stars = [];
const seasonTilt = (() => {   /* the local-time sky: a deterministic per-visit rotation */
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return (h / 24) * Math.PI * 2;
})();
function buildStars() {
  const n = Math.round(Math.min(240, (W * H) / 6800));
  stars = [];
  let seed = 42;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const depth = i % 3;
    stars.push({
      x: rnd() * W, y: rnd() * H,
      z: 0.35 + depth * 0.33,                          /* parallax factor */
      r: 0.5 + rnd() * (depth === 2 ? 1.4 : 0.9),
      tw: rnd() * Math.PI * 2,                         /* twinkle phase */
      hue: rnd() < 0.12 ? 'rgba(168,233,255,' : rnd() < 0.2 ? 'rgba(207,216,255,' : 'rgba(233,238,249,',
    });
  }
}

/* pointer parallax: latest target, applied once per frame (never per event) */
const par = { x: 0, y: 0, tx: 0, ty: 0 };
if (finePointer) {
  addEventListener('pointermove', (e) => {
    par.tx = (e.clientX / W - 0.5) * 2; par.ty = (e.clientY / H - 0.5) * 2;
  }, { passive: true });
}

/* warp state (the streak burst) */
const warp = { active: false, p: 0, cx: 0.5, cy: 0.5, tint: [100, 213, 245] };

/* ---------- planet layout: parametric orbits on the shared clock ---------- */
const anchors = new Map();
document.querySelectorAll('.planet-anchor').forEach(a => anchors.set(a.dataset.world, a));
const desktop = () => innerWidth > 700;

/* the arc composes itself BELOW the copy, whatever the viewport gives us */
let arcCY = 0, arcRY = 80;
function measureArc() {
  const copy = document.querySelector('.hub-copy');
  const cb = copy ? copy.getBoundingClientRect().bottom : H * 0.4;
  const room = Math.max(140, H - cb - 70);             /* keep clear of the footer HUD */
  arcCY = cb + room * 0.58;
  arcRY = Math.min(room * 0.34, 150);
}
function planetPos(i, clockMs) {
  const w = WORLDS[i];
  const cx = W / 2;
  const spreadX = Math.min(W * 0.4, 580);
  const baseA = -Math.PI / 2 + (i - 2) * 0.52;         /* fan the five across the arc */
  const t = reduced() ? 0 : clockMs / 1000;
  const wob = reduced() ? 0 : Math.sin(t * w.speed * 2 + i * 1.7) * 0.045;
  const ang = baseA + wob + Math.sin(seasonTilt) * 0.03;
  return {
    x: cx + Math.cos(ang) * spreadX,
    y: arcCY + Math.sin(ang) * arcRY + Math.sin(t * 0.5 + i) * (reduced() ? 0 : 4),
  };
}

/* ---------- scene drawing ---------- */
let hovered = null;
function drawSky(dt, clockMs) {
  ctx.clearRect(0, 0, W, H);
  par.x += (par.tx - par.x) * 0.06; par.y += (par.ty - par.y) * 0.06;
  const t = clockMs / 1000;

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
    }
  }

  /* hub decoration only while the hub is on stage */
  if (Scenes.current === 'hub' && desktop()) {
    /* orbit ring */
    ctx.strokeStyle = 'rgba(233,238,249,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(W / 2, H * 0.66, Math.min(W * 0.38, 560), Math.min(H * 0.26, 240) * 0.62, 0, 0, 7);
    ctx.stroke();

    WORLDS.forEach((w, i) => {
      const p = planetPos(i, clockMs);
      const a = anchors.get(w.slug);
      if (a) {
        a.style.setProperty('--pax', p.x.toFixed(1) + 'px');
        a.style.setProperty('--pay', p.y.toFixed(1) + 'px');
        a.style.setProperty('--psize', w.size + 'px');
      }
      /* the tells: halos behind the DOM dots */
      const [r, g, b] = w.a;
      const hov = hovered === w.slug;
      let glow = 0.22 + (hov ? 0.3 : 0);
      if (!reduced()) {
        if (w.tell === 'heat')    glow += 0.10 * (0.5 + 0.5 * Math.sin(t * 2.1 + i));
        if (w.tell === 'pulse')   glow += (Math.sin(t * 6) > 0.72 ? 0.16 : 0);
        if (w.tell === 'breathe') glow += 0.12 * (0.5 + 0.5 * Math.sin(t * 0.8));
        if (w.tell === 'glint')   glow += (Math.sin(t * 0.9 + 2) > 0.985 ? 0.5 : 0);
      }
      const rad = w.size * (1.15 + glow * 0.4);
      const grad = ctx.createRadialGradient(p.x, p.y, w.size * 0.3, p.x, p.y, rad);
      grad.addColorStop(0, `rgba(${r},${g},${b},${glow})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 7); ctx.fill();

      if (w.tell === 'dashed') {
        ctx.strokeStyle = `rgba(${r},${g},${b},0.55)`;
        ctx.setLineDash([5, 7]);
        ctx.lineDashOffset = reduced() ? 0 : -t * 8;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p.x, p.y, w.size * 0.72, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
      }
    });
  }

  /* comet, when one is in flight */
  if (comet.alive) drawComet(dt);
  if (warp.active) { warp.p = Math.min(1, warp.p + dt / 700); }
}

function drawStatic() { drawSky(16, Ticker.clock); }

/* ---------- ambient: the idle loop + random-cadence comet (fxLock, §2.10) ---------- */
let fxLock = false;
const comet = { alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0 };
function launchComet() {
  if (fxLock || document.hidden || reduced() || Scenes.current !== 'hub') return;
  fxLock = true;
  comet.alive = true; comet.life = 0;
  comet.x = -40; comet.y = H * (0.1 + Math.random() * 0.3);
  comet.vx = 0.38 + Math.random() * 0.2; comet.vy = 0.06 + Math.random() * 0.05;
}
function drawComet(dt) {
  comet.life += dt; comet.x += comet.vx * dt; comet.y += comet.vy * dt;
  const fade = Math.min(1, comet.life / 300) * Math.max(0, 1 - (comet.x / (W + 80)));
  ctx.strokeStyle = `rgba(207,216,255,${0.7 * fade})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(comet.x, comet.y);
  ctx.lineTo(comet.x - 90 * comet.vx, comet.y - 90 * comet.vy); ctx.stroke();
  if (comet.x > W + 80) { comet.alive = false; fxLock = false; }
}
let cometTimer = null;
function scheduleComet() {
  clearTimeout(cometTimer);
  cometTimer = setTimeout(() => { launchComet(); scheduleComet(); }, 24000 + Math.random() * 26000);
}

/* the idle sky task: runs only when something moves */
let skyTask = null;
const Orrery = {
  startAmbient() {
    if (skyTask || reduced()) { drawStatic(); return; }
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
    Orrery.events.dispatchEvent(new CustomEvent('preview', { detail: { slug } }));
  };
  const untint = () => { if (hovered === slug) hovered = null; };
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

const surveyed = new Set(JSON.parse(sessionStorage.getItem('orrery-surveyed') || '[]'));
function markSurveyed(slug) {
  surveyed.add(slug);
  sessionStorage.setItem('orrery-surveyed', JSON.stringify([...surveyed]));
  const a = anchors.get(slug);
  if (a) a.querySelector('.pa-tick').hidden = false;
}
surveyed.forEach(s => { const a = anchors.get(s); if (a) a.querySelector('.pa-tick').hidden = false; });

function setScene(name, { instant = false } = {}) {
  if (Scenes.current === name) return;
  const prev = Scenes.els.get(Scenes.current);
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
    Orrery.startAmbient();
    WorldFX.stopAll();
  } else {
    const w = bySlug[name];
    locName.textContent = `World · ${w.label}`;
    html.style.setProperty('--acc', `rgb(${w.a.join(',')})`);
    html.style.setProperty('--acc-rgb', w.a.join(','));
    Orrery.stopAmbient();                              /* one scene owns the frame budget */
    WorldFX.start(name);
    markSurveyed(name);
    /* move focus to the world heading for keyboard/AT travelers */
    const h = next.querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  Orrery.events.dispatchEvent(new CustomEvent('scene', { detail: { name, instant } }));
}

function travel(slug) {
  if (Scenes.transitioning || Scenes.current === slug) return;
  const w = bySlug[slug];
  if (!w) return;

  if (reduced()) { location.hash = '#/world/' + slug; return; }   /* router does a crossfade */

  Scenes.transitioning = true;
  /* aim the flood at the planet's live position */
  const i = WORLDS.indexOf(w);
  const p = desktop() ? planetPos(i, Ticker.clock) : { x: W / 2, y: H / 2 };
  html.style.setProperty('--wx', (p.x / W * 100).toFixed(1) + '%');
  html.style.setProperty('--wy', (p.y / H * 100).toFixed(1) + '%');
  html.style.setProperty('--acc', `rgb(${w.a.join(',')})`);
  html.style.setProperty('--acc-rgb', w.a.join(','));

  warp.active = true; warp.p = 0; warp.cx = p.x / W; warp.cy = p.y / H;
  if (!skyTask) Orrery.startAmbient();                 /* streaks need the loop */
  html.classList.add('warping');
  Orrery.events.dispatchEvent(new CustomEvent('warp', { detail: { slug } }));

  setTimeout(() => {
    warp.active = false;
    html.classList.remove('warping');
    location.hash = '#/world/' + slug;                 /* router lands the scene */
    Scenes.transitioning = false;
  }, 620);
}

/* clicks on planet anchors warp instead of jumping */
anchors.forEach((a, slug) => {
  a.addEventListener('click', (e) => {
    if (reduced()) return;                             /* let the router crossfade */
    e.preventDefault();
    travel(slug);
  });
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
addEventListener('hashchange', () => route(false));

/* ---------- HUD clock ---------- */
const clockEl = document.getElementById('hud-clock');
let clockAcc = 0;
Ticker.add((dt) => {
  clockAcc += dt;
  if (clockAcc > 1000) {
    clockAcc = 0;
    clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  return true;                                         /* the one persistent task */
});

/* ---------- boot (called from the END of the concatenated bundle, after
   WorldFX and Score exist — a TDZ on a later-fragment const killed setScene
   mid-flight when this ran inline; concatenation builds boot LAST) ---------- */
function bootOrrery() {
  sizeSky();
  setRM();
  route(true);
  if (!reduced()) Orrery.startAmbient();
  /* re-measure the arc once type has settled (font metrics can shift the copy block) */
  setTimeout(() => { measureArc(); drawStatic(); }, 350);
}
