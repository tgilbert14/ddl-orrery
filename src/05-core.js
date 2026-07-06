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
   blocked cookies / sandboxed iframes throw on the GETTER */
const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
};

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

/* ---------- world registry (data; FX bodies live in 06) ---------- */
const WORLDS = [
  { slug: 'dust-sea',  label: 'Dust Sea',   size: 58, tell: 'heat',    a: [255, 178, 94],  speed: 0.045 },
  { slug: 'velocity',  label: 'Velocity',   size: 62, tell: 'pulse',   a: [255, 46, 151],  speed: 0.06 },
  { slug: 'grid',      label: 'The Grid',   size: 50, tell: 'rain',    a: [52, 255, 136],  speed: 0.055 },
  { slug: 'abyssal',   label: 'Abyssal',    size: 54, tell: 'breathe', a: [53, 240, 200],  speed: 0.052 },
  { slug: 'arcadia',   label: 'Arcadia',    size: 48, tell: 'pixel',   a: [255, 210, 63],  speed: 0.065 },
  { slug: 'aurora',    label: 'Aurora',     size: 58, tell: 'glint',   a: [168, 233, 255], speed: 0.038 },
  { slug: 'uncharted', label: 'Uncharted',  size: 44, tell: 'dashed',  a: [100, 213, 245], speed: 0.07 },
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
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    sizeSky();
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
  const spreadX = Math.min(W * 0.42, 600);
  const baseA = -Math.PI / 2 + (i - 3) * 0.4;          /* fan the seven across the arc */
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
        if (w.tell === 'rain')    glow += (Math.sin(t * 9 + i * 3) > 0.6 ? 0.13 : 0);
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
      if (w.tell === 'pixel') {                        /* the cabinet world reads 8-bit even in orbit */
        ctx.strokeStyle = `rgba(${r},${g},${b},0.5)`;
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = reduced() ? 0 : Math.floor(t * 2) * 4;   /* stepped, not smooth */
        ctx.lineWidth = 2;
        const s2 = w.size * 0.68;
        ctx.strokeRect(p.x - s2, p.y - s2, s2 * 2, s2 * 2);
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

let surveyed = new Set();
try { surveyed = new Set(JSON.parse(store.get('orrery-surveyed') || '[]')); } catch (_) {}
function markSurveyed(slug) {
  surveyed.add(slug);
  store.set('orrery-surveyed', JSON.stringify([...surveyed]));
  const a = anchors.get(slug);
  if (a) a.querySelector('.pa-tick').hidden = false;
}
surveyed.forEach(s => { const a = anchors.get(s); if (a) a.querySelector('.pa-tick').hidden = false; });

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
    Orrery.startAmbient();
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
    WorldFX.start(name);
    markSurveyed(name);
    /* move focus to the world heading for keyboard/AT travelers */
    const h = next.querySelector('h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }
  Orrery.events.dispatchEvent(new CustomEvent('scene', { detail: { name, instant } }));
}

/* the warp: land the scene under the flood's PEAK; let the flood fade out
   OVER the arriving world; never cancel the animation mid-arc (Smaug kill 4).
   animationend is the fast path; a deterministic timer is the guarantee it
   never sticks (animationend can be missed when scenes toggle mid-flight). */
let travelTimer = null, warpClearTimer = null;
const warpEl = document.getElementById('warpfx');
function endWarp() { clearTimeout(warpClearTimer); html.classList.remove('warping'); warp.active = false; }
warpEl.addEventListener('animationend', endWarp);

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
    if (reduced()) { location.hash = '#/world/' + slug; return; }
    travel(slug);
  });
});
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
  /* a Back press mid-warp always wins: cancel the pending land (Smaug kill 4) */
  if (travelTimer) { clearTimeout(travelTimer); travelTimer = null; Scenes.transitioning = false; }
  route(false);
});

/* ---------- HUD clock: a wall clock lives on a wall timer, not the animation
   ticker — so the rAF loop can genuinely drain and stop (Smaug kill 5) ---------- */
const clockEl = document.getElementById('hud-clock');
function tickClock() {
  if (!document.hidden) {
    clockEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
setInterval(tickClock, 1000);
tickClock();

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
