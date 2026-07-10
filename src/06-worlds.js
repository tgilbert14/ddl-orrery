/* ============================================================
   06-worlds.js — the seven signatures. One effect per world, no seconds.
   Each FX owns one canvas, pools its particles, joins the shared
   Ticker, and leaves a designed end-state when motion is off.
   Forged by six parallel effect-smiths of the MITHRIL guild, 2026-07-05.
   ============================================================ */
'use strict';

const WorldFX = (() => {
  const fx = {};
  let activeName = null, activeTask = null, activeCanvas = null, activeCtx = null, activeState = null;
  let activeSurf = null, verbSec = null, verbDown = null, verbMove = null, verbUpH = null;

  function canvasFor(name) {
    const c = document.querySelector(`[data-canvas="${name}"]`);
    if (!c) return null;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = c.parentElement.getBoundingClientRect();
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { c, g, w: r.width, h: r.height };
  }

  function start(sceneName) {
    stopAll();
    const map = { 'dust-sea': 'dune', 'velocity': 'velocity', 'grid': 'grid', 'abyssal': 'abyssal', 'arcadia': 'arcadia', 'aurora': 'aurora', 'uncharted': 'draft', 'beacons': 'beacons', 'stormwall': 'storm', 'drillyard': 'drillyard', 'archive': 'archive', 'object-0': 'object0' };
    const name = map[sceneName];
    if (!name || !fx[name]) return;
    if (window.Orrery.reduced()) { fx[name].rm && fx[name].rm(); return; }
    const surf = canvasFor(name);
    if (!surf) return;
    activeName = name; activeCanvas = surf.c; activeCtx = surf.g; activeSurf = surf;
    const state = fx[name].init(surf);
    activeState = state;
    activeTask = (dt, clock) => {
      if (activeName !== name) return false;
      fx[name].frame(surf, state, dt, clock);
      /* THE VIGIL (WOW #7): the speck crossing your sky is your own ship,
         holding station over the world you are standing on — but never
         inside the hold you visibly flew INTO (guardian) */
      if (window.SphereForge && SphereForge.drawTransit && name !== 'object0')
        SphereForge.drawTransit(surf.g, surf.w, surf.h, clock);
      return true;
    };
    window.Orrery.ticker.add(activeTask);
    /* the verb: one pointer action per world. Listeners live on the SECTION
       (the canvas is aria-hidden scenery), so a tap anywhere in the scene
       lands — except on the chip's own links and buttons, which keep their
       jobs. Never wired under reduced-motion: start() bailed above. */
    if (fx[name].verb || fx[name].aim) {
      const sec = surf.c.closest('section');
      if (sec) {
        verbSec = sec;
        if (fx[name].verb) {
          verbDown = (e) => {
            if (activeName !== name || e.button > 0) return;
            if (e.target.closest('a, button')) return;
            const r = surf.c.getBoundingClientRect();
            const vx = e.clientX - r.left, vy = e.clientY - r.top;
            /* TOUCH YOUR SHIP AND SHE COMES FOR YOU (v8): the vigil speck is
               your ride home — tapping her IS the recall, taken diegetically */
            if (window.SphereForge && SphereForge.transitHit && SphereForge.transitHit(vx, vy)) {
              location.hash = '#/';
              return;
            }
            fx[name].verb(surf, state, vx, vy, window.Orrery.ticker.clock);
          };
          sec.addEventListener('pointerdown', verbDown);
        }
        if (fx[name].aim) {
          let aimRect = null, aimRectAt = -1e9;    /* house idiom: never measure per event */
          verbMove = (e) => {
            if (activeName !== name) return;
            const clk = window.Orrery.ticker.clock;
            if (!aimRect || clk - aimRectAt > 500) { aimRect = surf.c.getBoundingClientRect(); aimRectAt = clk; }
            fx[name].aim(surf, state, e.clientX - aimRect.left, e.clientY - aimRect.top, clk);
          };
          sec.addEventListener('pointermove', verbMove);
        }
        if (fx[name].verbUp) {                     /* the release: hold-verbs need to know */
          verbUpH = () => {
            if (activeName !== name) return;
            fx[name].verbUp(surf, state, window.Orrery.ticker.clock);
          };
          sec.addEventListener('pointerup', verbUpH);
          sec.addEventListener('pointercancel', verbUpH);
          sec.addEventListener('pointerleave', verbUpH);
        }
      }
    }
  }
  function stopAll() {
    if (activeTask) { window.Orrery.ticker.remove(activeTask); activeTask = null; }
    if (activeState) { activeState.cleanup && activeState.cleanup(); activeState = null; }  /* Smaug kill 7 */
    if (activeCtx && activeCanvas) activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    if (verbSec) {
      if (verbDown) verbSec.removeEventListener('pointerdown', verbDown);
      if (verbMove) verbSec.removeEventListener('pointermove', verbMove);
      if (verbUpH) {
        verbSec.removeEventListener('pointerup', verbUpH);
        verbSec.removeEventListener('pointercancel', verbUpH);
        verbSec.removeEventListener('pointerleave', verbUpH);
      }
      verbSec = null; verbDown = null; verbMove = null; verbUpH = null;
    }
    activeName = null; activeSurf = null;
  }
  const verbEvent = (kind) => window.Orrery.events.dispatchEvent(new CustomEvent(kind));

  /* ============================================================
     DUST SEA: the amber sea — razor-lit crests over indigo lee faces,
     wind-smoke off the dunes, spice glints, a walking caravan, and
     THE WORM: a face-on colossus that rises where you strike.
     caps: 3 precomputed ridges (+lit/lee Path2Ds) · sand 78 · puffs 30 ·
           cascade 64 · wisps 6 · glints 16 · walkers 3 ·
           3 prebaked sprites: maw, bloom, wisp (no per-frame gradients)
     ============================================================ */
  const DW_RISE = 2000, DW_HOLD = 2800, DW_SINK = 2200,
        DW_TOTAL = DW_RISE + DW_HOLD + DW_SINK;
  fx.dune = {
    init(s) {
      const rnd = (a, b) => a + Math.random() * (b - a);
      const STEP = 20, x0 = -80, x1 = s.w + 80;
      const N = Math.ceil((x1 - x0) / STEP) + 1;
      const H = s.h, W = s.w, g0 = s.g;
      function ridge(baseY, amp, driftA, driftS, phase) {
        const xs = new Float32Array(N), ys = new Float32Array(N);
        const w1 = rnd(150, 230), w2 = rnd(70, 110), w3 = rnd(34, 52);
        const p1 = rnd(0, 7), p2 = rnd(0, 7), p3 = rnd(0, 7);
        const a2 = amp * 0.5, a3 = amp * 0.28;
        for (let i = 0; i < N; i++) {
          const x = x0 + i * STEP; xs[i] = x;
          ys[i] = baseY + Math.sin(x / w1 + p1) * amp + Math.sin(x / w2 + p2) * a2 + Math.sin(x / w3 + p3) * a3;
        }
        return { xs, ys, driftA, driftS, phase, baseY, amp, x0, step: STEP };
      }
      const ridges = [
        ridge(H * 0.50, 18, 8, 0.000030, 0.0),
        ridge(H * 0.61, 30, 16, 0.000045, 2.1),
        ridge(H * 0.73, 46, 28, 0.000062, 4.3),
      ];
      /* the two-tone sea: every dune wears amber where it faces the suns
         and cold indigo where it falls away — the crest line between them
         is the razor the whole scene rides on */
      const TONES = [
        { hi: 'rgba(214,140,82,1)', mid: 'rgba(120,60,50,1)', lo: 'rgba(54,30,52,1)', crest: 'rgba(255,200,124,0.55)', lee: 'rgba(40,30,68,0.40)' },
        { hi: 'rgba(194,116,60,1)', mid: 'rgba(94,42,36,1)',  lo: 'rgba(38,20,40,1)', crest: 'rgba(255,190,110,0.42)', lee: 'rgba(34,24,60,0.48)' },
        { hi: 'rgba(148,80,38,1)',  mid: 'rgba(58,26,22,1)',  lo: 'rgba(20,11,22,1)', crest: 'rgba(255,178,96,0.30)',  lee: 'rgba(26,18,48,0.55)' },
      ];
      for (let k = 0; k < 3; k++) {
        const r = ridges[k], t = TONES[k];
        const gr = g0.createLinearGradient(0, r.baseY - r.amp * 1.9, 0, H);
        gr.addColorStop(0, t.hi); gr.addColorStop(0.42, t.mid); gr.addColorStop(1, t.lo);
        r.grad = gr; r.crest = t.crest; r.leeFill = t.lee;
        r.lit = dunePaths(r, -1);              /* sun-side crest polylines */
        r.lee = dunePaths(r, +1);              /* lee-side shadow bands */
      }
      /* the maw, baked once: rings of radial bristles around a black throat,
         a pale baleen fringe at the rim (drawn face-on, film-poster style) */
      const MS = 256, mo = document.createElement('canvas'); mo.width = mo.height = MS;
      const mg = mo.getContext('2d');
      const cx = MS / 2, cy = MS / 2;
      let grd = mg.createRadialGradient(cx, cy, MS * 0.05, cx, cy, MS * 0.5);
      grd.addColorStop(0, '#120805'); grd.addColorStop(0.45, '#301608');
      grd.addColorStop(0.8, '#582c14'); grd.addColorStop(1, '#4a2410');
      mg.fillStyle = grd; mg.beginPath(); mg.arc(cx, cy, MS * 0.5, 0, 7); mg.fill();
      for (let ring = 0; ring < 3; ring++) {
        const r0 = MS * (0.17 + ring * 0.105), r1 = MS * (0.30 + ring * 0.105);
        const nB = 130 + ring * 40;
        for (let b = 0; b < nB; b++) {
          const a = (b / nB) * Math.PI * 2 + ring * 0.05 + Math.random() * 0.03;
          const rr0 = r0 * (0.92 + Math.random() * 0.16), rr1 = r1 * (0.94 + Math.random() * 0.12);
          mg.strokeStyle = `rgba(${110 + ring * 26},${60 + ring * 18},${32 + ring * 9},${0.30 + Math.random() * 0.32})`;
          mg.lineWidth = 0.8 + Math.random() * 0.9;
          mg.beginPath();
          mg.moveTo(cx + Math.cos(a) * rr0, cy + Math.sin(a) * rr0);
          mg.lineTo(cx + Math.cos(a + 0.02) * rr1, cy + Math.sin(a + 0.02) * rr1);
          mg.stroke();
        }
      }
      grd = mg.createRadialGradient(cx, cy, 0, cx, cy, MS * 0.20);
      grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.7, 'rgba(10,4,2,0.9)'); grd.addColorStop(1, 'rgba(20,9,5,0)');
      mg.fillStyle = grd; mg.beginPath(); mg.arc(cx, cy, MS * 0.20, 0, 7); mg.fill();
      for (let b = 0; b < 100; b++) {
        const a = (b / 100) * Math.PI * 2 + Math.random() * 0.02;
        mg.strokeStyle = `rgba(196,138,86,${0.15 + Math.random() * 0.2})`;
        mg.lineWidth = 1 + Math.random();
        mg.beginPath();
        mg.moveTo(cx + Math.cos(a) * MS * 0.46, cy + Math.sin(a) * MS * 0.46);
        mg.lineTo(cx + Math.cos(a) * MS * (0.478 + Math.random() * 0.012), cy + Math.sin(a) * MS * (0.478 + Math.random() * 0.012));
        mg.stroke();
      }
      /* one low sun on it: shade the lower-left so the face turns */
      grd = mg.createLinearGradient(0, MS, MS * 0.7, MS * 0.2);
      grd.addColorStop(0, 'rgba(8,3,2,0.42)'); grd.addColorStop(0.55, 'rgba(8,3,2,0)');
      mg.fillStyle = grd; mg.beginPath(); mg.arc(cx, cy, MS * 0.5, 0, 7); mg.fill();
      /* the body column's light, baked once (lighter up where the suns sit) */
      const bg = g0.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#5f3018'); bg.addColorStop(0.5, '#43200f'); bg.addColorStop(1, '#2a1208');
      /* warm dust bloom + one sand wisp, baked once */
      const gs = 64, oc = document.createElement('canvas'); oc.width = oc.height = gs;
      const og = oc.getContext('2d');
      const gr2 = og.createRadialGradient(gs / 2, gs / 2, 0, gs / 2, gs / 2, gs / 2);
      gr2.addColorStop(0, 'rgba(255,196,130,0.7)');
      gr2.addColorStop(0.5, 'rgba(228,140,80,0.30)');
      gr2.addColorStop(1, 'rgba(200,110,60,0)');
      og.fillStyle = gr2; og.beginPath(); og.arc(gs / 2, gs / 2, gs / 2, 0, 7); og.fill();
      const fc = document.createElement('canvas'); fc.width = 160; fc.height = 48;
      const fg2 = fc.getContext('2d');
      fg2.setTransform(1, 0, 0, 0.3, 0, 0);
      const wgr = fg2.createRadialGradient(80, 80, 4, 80, 80, 78);
      wgr.addColorStop(0, 'rgba(232,190,140,0.5)');
      wgr.addColorStop(0.6, 'rgba(214,160,110,0.22)');
      wgr.addColorStop(1, 'rgba(200,140,90,0)');
      fg2.fillStyle = wgr; fg2.beginPath(); fg2.arc(80, 80, 78, 0, 7); fg2.fill();
      /* wind-smoke off the crests: 6 wisps that respawn on high points */
      const wisps = [];
      for (let i = 0; i < 6; i++) wisps.push(duneWisp({ ri: 1 + (i % 2) }, ridges));
      /* the caravan: three tiny figures walking the mid crest, west into the wind */
      const walkers = [];
      for (let i = 0; i < 3; i++) walkers.push({ x: W * (0.3 + i * 0.045 + Math.random() * 0.015), v: -(0.008 + Math.random() * 0.003) });
      /* spice in the air: 16 pooled glints */
      const glints = new Array(16);
      for (let i = 0; i < glints.length; i++) glints[i] = { on: false, x: 0, y: 0, t0: 0, max: 1, r: 1 };
      const sand = new Array(78);
      for (let i = 0; i < sand.length; i++) sand[i] = {
        x: Math.random() * W, y: rnd(H * 0.30, H * 0.86),
        vx: -(0.18 + Math.random() * 0.16), len: 8 + Math.random() * 20, seed: rnd(0, 7),
      };
      const puffs = new Array(30);
      for (let i = 0; i < puffs.length; i++) puffs[i] = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 0 };
      /* the cascade: sand pouring off the risen body, 64 pooled streaks */
      const casc = new Array(64);
      for (let i = 0; i < casc.length; i++) casc[i] = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1 };
      const worm = { on: false, t0: 0, x: 0, headR: 0, topY: 0, floorY: 0, seed: 0, burst: false, cascAcc: 0 };
      return { ridges, sand, puffs, casc, wisps, walkers, glints, worm,
               maw: mo, bloom: oc, wispS: fc, bodyGrad: bg, next: null, glintAcc: 0 };
    },
    frame(s, st, dt, clock) {
      const g = s.g, W = s.w, H = s.h;
      g.clearRect(0, 0, W, H);
      if (st.next === null) st.next = clock + 9000 + Math.random() * 8000;

      const wm = st.worm;
      if (!wm.on && clock >= st.next)
        duneRise(s, st, clock, W * (0.25 + Math.random() * 0.5));

      /* emergence envelope + the ground answering it */
      let u = 0, tW = 0;
      if (wm.on) {
        tW = clock - wm.t0;
        if (tW >= DW_TOTAL) { wm.on = false; st.next = clock + 26000 + Math.random() * 18000; }
        else if (tW < DW_RISE) { const k = tW / DW_RISE; u = 1 - Math.pow(1 - k, 3); }
        else if (tW < DW_RISE + DW_HOLD) u = 1;
        else { const k = (tW - DW_RISE - DW_HOLD) / DW_SINK; u = 1 - k * k; }
      }
      const rumble = wm.on ? u * (tW < DW_RISE ? 1 : tW < DW_RISE + DW_HOLD ? 0.45 : 0.25) : 0;
      g.save();
      if (rumble > 0.02) g.translate(Math.sin(clock * 0.11) * 2.4 * rumble, Math.cos(clock * 0.13) * 1.7 * rumble);

      const gust = 0.55 + 0.45 * Math.sin(clock * 0.00028);

      drawDune(g, st.ridges[0], H, clock);
      duneWisps(g, st, 0, dt, clock, gust, W);
      drawDune(g, st.ridges[1], H, clock);
      duneWisps(g, st, 1, dt, clock, gust, W);

      /* the caravan pauses when the ground speaks */
      g.fillStyle = 'rgba(16,9,14,0.88)';
      const r1 = st.ridges[1], d1 = r1.driftA * Math.sin(clock * r1.driftS + r1.phase);
      for (const wk of st.walkers) {
        if (!wm.on) { wk.x += wk.v * dt; if (wk.x < -20) wk.x = W + 20; }
        const fi = Math.min(r1.xs.length - 2, Math.max(0, (wk.x - r1.x0) / r1.step));
        const i0 = fi | 0, ft = fi - i0;
        const wy = r1.ys[i0] + (r1.ys[i0 + 1] - r1.ys[i0]) * ft;
        g.fillRect(wk.x + d1 - 1, wy - 5.4, 2, 4.6);
        g.beginPath(); g.arc(wk.x + d1, wy - 6.2, 1, 0, 7); g.fill();
      }

      if (wm.on && u > 0.01) {
        const R = wm.headR;
        const hx = wm.x + Math.sin(clock * 0.0009 + wm.seed) * 10 * u;
        const hy = wm.floorY - (wm.floorY - wm.topY) * u;
        if (!wm.burst && u > 0.06) { wm.burst = true; for (let b = 0; b < 12; b++) spawnPuff(st, wm.x, wm.floorY - 20, 2.2); }
        /* the backlit dust the colossus hauls up with it */
        const bw = R * 8;
        g.globalAlpha = (0.45 + 0.10 * Math.sin(clock * 0.004)) * u;
        g.drawImage(st.bloom, hx - bw / 2, hy - bw * 0.34, bw, bw);
        g.globalAlpha = 0.55 * u;
        g.drawImage(st.bloom, hx - R * 8, wm.floorY - R * 2.2, R * 16, R * 4.4);
        g.globalAlpha = 1;
        /* the body: a tower with ring segments, leaning with its own sway */
        g.fillStyle = st.bodyGrad;
        g.beginPath();
        g.moveTo(hx - R * 1.02, wm.floorY + 40);
        g.quadraticCurveTo(hx - R * 1.14, hy + R * 0.35, hx - R * 0.80, hy - R * 0.05);
        g.lineTo(hx + R * 0.80, hy - R * 0.05);
        g.quadraticCurveTo(hx + R * 1.14, hy + R * 0.35, hx + R * 1.02, wm.floorY + 40);
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(18,8,4,0.4)'; g.lineWidth = 2;
        for (let yy = hy + R * 1.05; yy < wm.floorY; yy += R * 0.46) {
          const tt2 = (yy - hy) / Math.max(1, wm.floorY - hy);
          g.beginPath(); g.ellipse(hx, yy, R * (0.82 + 0.2 * tt2), R * 0.13, 0, 0, Math.PI); g.stroke();
        }
        g.strokeStyle = 'rgba(255,176,96,0.10)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(hx - R * 0.98, hy + R * 0.6); g.quadraticCurveTo(hx - R * 1.06, (hy + wm.floorY) / 2, hx - R * 1.0, wm.floorY); g.stroke();
        /* the maw, face-on, breathing a slow tilt */
        const lean = Math.sin(clock * 0.0011 + wm.seed) * 0.07 * u;
        g.save(); g.translate(hx, hy); g.rotate(lean);
        g.drawImage(st.maw, -R, -R, R * 2, R * 2);
        g.restore();
        /* sand pouring off the risen body */
        if (tW < DW_RISE + DW_HOLD && u > 0.15) {
          wm.cascAcc += dt;
          while (wm.cascAcc > 40) {
            wm.cascAcc -= 40;
            for (let n2 = 0; n2 < 3; n2++) {
              let c = null; for (const q of st.casc) if (!q.on) { c = q; break; }
              if (!c) break;
              const side = Math.random() < 0.5 ? -1 : 1, off = 0.35 + Math.random() * 0.62;
              c.on = true;
              c.x = hx + side * R * off;
              c.y = hy + R * Math.sqrt(Math.max(0, 1 - off * off)) * 0.9;
              c.vx = side * (0.01 + Math.random() * 0.02); c.vy = 0.10 + Math.random() * 0.10;
              c.life = 0; c.max = 900 + Math.random() * 700;
            }
          }
        }
      }
      g.fillStyle = 'rgba(226,172,112,0.5)';
      for (const c of st.casc) {
        if (!c.on) continue;
        c.life += dt; const k = c.life / c.max;
        c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 0.00022 * dt;
        if (k >= 1 || c.y > wm.floorY + 30) { c.on = false; continue; }
        g.globalAlpha = 0.7 * (1 - k);
        g.fillRect(c.x, c.y, 1.6, 6 + 5 * k);
      }
      g.globalAlpha = 1;

      drawDune(g, st.ridges[2], H, clock);          /* the front dune keeps the base submerged */
      duneWisps(g, st, 2, dt, clock, gust, W);

      for (const pf of st.puffs) {
        if (!pf.on) continue;
        pf.life += dt;
        const k = pf.life / pf.max;
        if (k >= 1) { pf.on = false; continue; }
        pf.x += pf.vx * dt; pf.y += pf.vy * dt; pf.vy += 0.00002 * dt;
        g.fillStyle = `rgba(255,217,160,${(1 - k) * 0.5})`;
        g.beginPath(); g.arc(pf.x, pf.y, pf.r * (0.6 + k * 1.6), 0, 7); g.fill();
      }

      /* spice on the wind: brief gold glints, thicker while the worm is up */
      st.glintAcc += dt;
      const glintGap = wm.on ? 120 : 320;
      if (st.glintAcc > glintGap) {
        st.glintAcc = 0;
        for (const q of st.glints) if (!q.on) {
          q.on = true; q.t0 = clock; q.max = 700 + Math.random() * 900;
          q.r = 0.7 + Math.random() * 0.9;
          if (wm.on && Math.random() < 0.6) {
            q.x = wm.x + (Math.random() - 0.5) * wm.headR * 5;
            q.y = wm.topY + Math.random() * (wm.floorY - wm.topY);
          } else {
            q.x = Math.random() * W; q.y = H * (0.12 + Math.random() * 0.55);
          }
          break;
        }
      }
      g.fillStyle = 'rgba(255,216,140,1)';
      for (const q of st.glints) {
        if (!q.on) continue;
        const k = (clock - q.t0) / q.max;
        if (k >= 1) { q.on = false; continue; }
        g.globalAlpha = Math.sin(Math.PI * k) * 0.8;
        g.fillRect(q.x, q.y, q.r, q.r);
      }
      g.globalAlpha = 1;

      g.strokeStyle = `rgba(255,209,150,${0.05 + 0.09 * gust})`;
      g.lineWidth = 1; g.beginPath();
      for (const q of st.sand) {
        q.x += q.vx * (0.6 + gust) * dt;
        q.y += Math.sin(clock * 0.0012 + q.seed) * 0.05 * dt;
        if (q.x < -30) { q.x = W + Math.random() * 40; q.y = H * (0.30 + Math.random() * 0.56); }
        g.moveTo(q.x, q.y); g.lineTo(q.x + q.len * (0.6 + gust), q.y + 0.6);
      }
      g.stroke();
      g.restore();
    },
    /* M4 verb: strike the sand and the colossus rises where you struck */
    verb(s, st, x, y, clock) {
      if (st.worm.on) return;                       /* one worm; the desert sets the pace */
      duneRise(s, st, clock, x);
      verbEvent('worm');
    },
  };
  function duneRise(s, st, clock, bx) {
    const wm = st.worm, fr = st.ridges[2], W = s.w, H = s.h;
    wm.on = true; wm.t0 = clock; wm.seed = Math.random() * 7;
    wm.headR = Math.min(W * 0.13, 150) * (0.9 + Math.random() * 0.25);
    wm.x = Math.max(wm.headR * 1.2, Math.min(W - wm.headR * 1.2, bx));
    const idx = Math.min(fr.xs.length - 1, Math.max(0, Math.round((wm.x - fr.x0) / fr.step)));
    wm.floorY = fr.ys[idx] + 40;                    /* it clears the front dune, base still hidden */
    /* the tower stays in proportion to its own head on every screen */
    wm.topY = Math.max(H * 0.20 + Math.random() * H * 0.05, wm.floorY - wm.headR * 4.8);
    wm.burst = false; wm.cascAcc = 0;
  }
  /* one dune: gradient body, indigo lee bands, then the lit crest razor */
  function drawDune(g, r, H, clock) {
    const d = r.driftA * Math.sin(clock * r.driftS + r.phase);
    const xs = r.xs, ys = r.ys, n = xs.length;
    g.fillStyle = r.grad;
    g.beginPath(); g.moveTo(xs[0] + d, H + 2);
    for (let i = 0; i < n; i++) g.lineTo(xs[i] + d, ys[i]);
    g.lineTo(xs[n - 1] + d, H + 2); g.closePath(); g.fill();
    g.save(); g.translate(d, 0);
    g.fillStyle = r.leeFill; g.fill(r.lee);
    g.strokeStyle = r.crest; g.lineWidth = 1.6; g.lineJoin = 'round';
    g.stroke(r.lit);
    g.restore();
  }
  /* crest runs split by slope: ascending faces catch the suns (polylines),
     descending faces fall into shadow (bands). Built once per ridge. */
  function dunePaths(r, side) {
    const xs = r.xs, ys = r.ys, n = xs.length;
    const p = new Path2D();
    const depth = r.amp * 1.1;
    let i = 0;
    while (i < n - 1) {
      const asc = ys[i + 1] < ys[i];
      if ((side < 0) !== asc) { i++; continue; }
      let j = i;
      while (j < n - 1 && ((ys[j + 1] < ys[j]) === asc)) j++;
      if (side > 0 && j - i < 2) { i = j; continue; }   /* one-segment runs make spikes, not shade */
      p.moveTo(xs[i], ys[i]);
      for (let k = i + 1; k <= j; k++) p.lineTo(xs[k], ys[k]);
      if (side > 0) {
        /* a wedge, not a slab: the shade swells mid-slope and pinches out
           at both ends so it reads as the dune's own lee face */
        const len = j - i;
        for (let k = j; k >= i; k--) {
          const tt = len ? (k - i) / len : 0;
          p.lineTo(xs[k], ys[k] + depth * Math.pow(Math.sin(Math.PI * tt), 0.7));
        }
        p.closePath();
      }
      i = j;
    }
    return p;
  }
  function duneWisp(w, ridges) {
    const r = ridges[w.ri];
    /* respawn on a high crest point: sample a few, keep the highest */
    let gi = (Math.random() * r.xs.length) | 0;
    for (let t = 0; t < 4; t++) { const c = (Math.random() * r.xs.length) | 0; if (r.ys[c] < r.ys[gi]) gi = c; }
    w.x = r.xs[gi]; w.y = r.ys[gi] - 2;
    w.w = 90 + Math.random() * 130;
    w.a = 0.10 + Math.random() * 0.08;
    w.v = -(0.012 + Math.random() * 0.014);
    w.life = 0; w.max = 3600 + Math.random() * 2800;
    w.seed = Math.random() * 7;
    return w;
  }
  function duneWisps(g, st, band, dt, clock, gust, W) {
    for (const w of st.wisps) {
      if (w.ri !== band) continue;
      w.life += dt;
      const k = w.life / w.max;
      if (k >= 1 || w.x < -w.w) { duneWisp(w, st.ridges); continue; }
      w.x += w.v * (0.5 + gust) * dt;
      w.y -= 0.004 * dt;
      const mh = w.w * 0.3;
      g.globalAlpha = w.a * Math.sin(Math.PI * Math.min(1, k)) * (0.7 + 0.3 * gust);
      g.drawImage(st.wispS, w.x - w.w / 2, w.y - mh / 2, w.w, mh);
    }
    g.globalAlpha = 1;
  }
  function spawnPuff(st, x, y, scale) {
    for (const pf of st.puffs) {
      if (pf.on) continue;
      pf.on = true;
      pf.x = x + (Math.random() - 0.5) * 26; pf.y = y + (Math.random() - 0.5) * 10;
      pf.vx = (Math.random() - 0.5) * 0.05; pf.vy = -(0.02 + Math.random() * 0.04);
      pf.life = 0; pf.max = 900 + Math.random() * 900; pf.r = (5 + Math.random() * 9) * scale;
      return;
    }
  }

  /* ============================================================
     VELOCITY: the outrun city — DOM skyline + two racing light-cycles
     caps: 2 riders · 120 pooled trail points · 1 window pulse
     ============================================================ */
  const skyline = document.getElementById('mesa-skyline');
  const BARS = 26;
  if (skyline && !skyline.children.length) {
    for (let i = 0; i < BARS; i++) {
      const b = document.createElement('i');
      b.className = 'bar';
      b.style.setProperty('--h', (0.25 + Math.random() * 0.6).toFixed(2));
      skyline.appendChild(b);
    }
  }
  const V_CAP = 60;
  function vBuildPath(s, cy, sign) {
    const x0 = -0.18 * s.w, span = 1.36 * s.w, amp = 0.045 * s.h, jink = 0.05 * s.h;
    const xs = [], ys = [], cols = 11;
    for (let i = 0; i < cols; i++) {
      const x = x0 + span * (i / (cols - 1));
      const y = cy + sign * amp * Math.sin(i * 0.9 + 0.4);
      xs.push(x); ys.push(y);
      if (i === 3 || i === 7) {
        const yj = y - sign * jink * (i === 3 ? 1 : -1);
        xs.push(x); ys.push(yj);
        xs.push(x + span * 0.05); ys.push(yj);
      }
    }
    const n = xs.length, px = new Float32Array(xs), py = new Float32Array(ys);
    const seg = new Float32Array(n - 1);
    for (let i = 0; i < n - 1; i++) seg[i] = Math.hypot(px[i + 1] - px[i], py[i + 1] - py[i]) || 1;
    return { px, py, seg, n };
  }
  function vMakeRider(s, cy, sign, col, speed) {
    const path = vBuildPath(s, cy, sign);
    return {
      path, col, speed, si: 0, p: 0,
      tx: new Float32Array(V_CAP), ty: new Float32Array(V_CAP), tb: new Uint8Array(V_CAP),
      thead: -1, tn: 0, tacc: 0, brkNext: 0,
      hx: path.px[0], hy: path.py[0],
    };
  }
  function vDrawTrail(g, r, hot) {
    if (r.tn < 2) return;
    const start = (r.thead - r.tn + 1 + V_CAP * 2) % V_CAP, BANDS = 6;
    g.lineWidth = hot ? 3.4 : 2.4; g.lineJoin = 'round'; g.lineCap = 'round';
    for (let b = 0; b < BANDS; b++) {
      const k0 = Math.floor(b * (r.tn - 1) / BANDS), k1 = Math.floor((b + 1) * (r.tn - 1) / BANDS);
      if (k1 <= k0) continue;
      g.strokeStyle = `rgba(${r.col},${(hot ? 1 : 0.85) * Math.pow((b + 1) / BANDS, 1.5)})`;
      g.beginPath();
      let pen = false;
      for (let k = k0; k <= k1; k++) {
        const idx = (start + k) % V_CAP, x = r.tx[idx], y = r.ty[idx];
        if (!pen || r.tb[idx]) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  fx.velocity = {
    init(s) {
      const cy = s.h * 0.71;
      const riders = [
        vMakeRider(s, cy, -1, '41,230,255', 0.34),
        vMakeRider(s, cy, +1, '255,46,151', 0.31),
      ];
      for (const r of riders) { r.hotUntil = 0; r.gateAt = -9e9; }
      const gates = [];                                /* hard-light gates the hand drops on the grid */
      for (let i = 0; i < 4; i++) gates.push({ on: false, x: 0, y: 0, t0: 0 });
      const bursts = [];                               /* the flash when a rider threads one */
      for (let i = 0; i < 6; i++) bursts.push({ on: false, x: 0, y: 0, t0: 0, col: '' });
      return {
        bars: skyline ? skyline.querySelectorAll('.bar') : null,
        nextRender: 0,
        riders, gates, bursts,
        pulse: { on: false, x: 0, t0: 0 },
        pulseNext: 4000 + Math.random() * 4000,
        boostUntil: 0, lastBoost: -9e9,
      };
    },
    frame(s, st, dt, clock) {
      const g = s.g;
      g.clearRect(0, 0, s.w, s.h);

      if (st.bars && clock > st.nextRender) {
        st.nextRender = clock + 2600;
        for (let i = 0; i < st.bars.length; i++)
          st.bars[i].style.setProperty('--h', (0.2 + Math.random() * 0.72).toFixed(2));
      }

      if (clock > st.pulseNext) {
        st.pulse.on = true; st.pulse.t0 = clock;
        st.pulse.x = s.w * (0.16 + Math.random() * 0.68);
        st.pulseNext = clock + 7000 + Math.random() * 5000;
      }
      if (st.pulse.on) {
        const age = clock - st.pulse.t0, LIFE = 760;
        if (age >= LIFE) st.pulse.on = false;
        else {
          const a = Math.sin(age / LIFE * Math.PI), x = st.pulse.x, top = s.h * 0.40, h = s.h * 0.32;
          g.fillStyle = `rgba(255,154,61,${a * 0.30})`; g.fillRect(x - 24, top, 48, h);
          g.fillStyle = `rgba(255,214,150,${a * 0.85})`; g.fillRect(x - 3.5, top, 7, h);
        }
      }

      /* the gates: neon posts with a shimmer bar; they expire in 7s */
      for (const gt of st.gates) {
        if (!gt.on) continue;
        const age = clock - gt.t0;
        if (age > 7000) { gt.on = false; continue; }
        const fade = age > 6200 ? 1 - (age - 6200) / 800 : 1;
        const shim = 0.55 + 0.45 * Math.sin(clock * 0.006 + gt.x);   /* >=1s period: strobe-safe */
        g.fillStyle = `rgba(255,154,61,${(0.85 * fade).toFixed(3)})`;
        g.fillRect(gt.x - 15, gt.y - 34, 3, 68);
        g.fillRect(gt.x + 12, gt.y - 34, 3, 68);
        g.fillStyle = `rgba(255,214,150,${(0.3 * shim * fade).toFixed(3)})`;
        g.fillRect(gt.x - 12, gt.y - 30, 24, 60);
        g.fillStyle = `rgba(255,234,190,${(0.9 * fade).toFixed(3)})`;
        g.fillRect(gt.x - 15, gt.y - 36, 3, 3); g.fillRect(gt.x + 12, gt.y - 36, 3, 3);
      }

      for (const b of st.bursts) {                     /* threading flash: an expanding diamond */
        if (!b.on) continue;
        const k = (clock - b.t0) / 420;
        if (k >= 1) { b.on = false; continue; }
        const r2 = 6 + k * 30, a = (1 - k) * 0.9;
        g.strokeStyle = `rgba(${b.col},${a.toFixed(3)})`;
        g.lineWidth = 2.2 - k * 1.4;
        g.beginPath();
        g.moveTo(b.x, b.y - r2); g.lineTo(b.x + r2, b.y); g.lineTo(b.x, b.y + r2); g.lineTo(b.x - r2, b.y);
        g.closePath(); g.stroke();
      }

      const hot = clock < st.boostUntil;               /* M4: throttle open */
      for (let ri = 0; ri < st.riders.length; ri++) {
        const r = st.riders[ri], pa = r.path;
        const rHot = hot || clock < r.hotUntil;
        let rem = r.speed * (rHot ? 2 : 1) * dt;
        while (rem > 0) {
          const need = pa.seg[r.si] * (1 - r.p);
          if (rem >= need) {
            rem -= need; r.si++; r.p = 0;
            if (r.si >= pa.n - 1) { r.si = 0; r.p = 0; r.brkNext = 1; }
          } else { r.p += rem / pa.seg[r.si]; rem = 0; }
        }
        const i0 = r.si, i1 = r.si + 1;
        r.hx = pa.px[i0] + (pa.px[i1] - pa.px[i0]) * r.p;
        r.hy = pa.py[i0] + (pa.py[i1] - pa.py[i0]) * r.p;

        /* threading a gate: a flash in the rider's own color + a sprint */
        for (const gt of st.gates) {
          if (!gt.on || clock - r.gateAt < 500) continue;
          if (Math.abs(r.hx - gt.x) < 12 && Math.abs(r.hy - gt.y) < 40) {
            r.gateAt = clock; r.hotUntil = clock + 1100;
            for (const b of st.bursts) {
              if (b.on) continue;
              b.on = true; b.x = gt.x; b.y = r.hy; b.t0 = clock; b.col = r.col;
              break;
            }
          }
        }

        r.tacc += dt;
        if (r.tacc >= 32) {
          r.tacc = 0;
          r.thead = (r.thead + 1) % V_CAP;
          r.tx[r.thead] = r.hx; r.ty[r.thead] = r.hy; r.tb[r.thead] = r.brkNext;
          r.brkNext = 0;
          if (r.tn < V_CAP) r.tn++;
        }
        vDrawTrail(g, r, rHot);
      }

      for (let ri = 0; ri < st.riders.length; ri++) {
        const r = st.riders[ri];
        g.shadowBlur = (hot || clock < r.hotUntil) ? 20 : 12;
        g.shadowColor = `rgba(${r.col},0.9)`;
        g.fillStyle = `rgba(${r.col},1)`;
        g.beginPath(); g.arc(r.hx, r.hy, 3.2, 0, 7); g.fill();
      }
      g.shadowBlur = 0;
      for (let ri = 0; ri < st.riders.length; ri++) {
        const r = st.riders[ri];
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.beginPath(); g.arc(r.hx, r.hy, 1.3, 0, 7); g.fill();
      }
    },
    rm() {
      skyline && skyline.querySelectorAll('.bar').forEach((b, i) => {
        b.style.setProperty('--h', (0.3 + ((i * 37) % 50) / 100).toFixed(2));
      });
    },
    /* the verb, rebuilt: DROP A GATE where you strike — neon posts on the
       grid; any rider who threads it flashes and sprints. The press still
       opens the throttle for a beat, so the button keeps its old promise. */
    verb(s, st, x, y, clock) {
      if (clock - st.lastBoost < 250) return;       /* one event per press, not per jitter */
      st.lastBoost = clock;
      st.boostUntil = clock + 800;
      let gt = null, oldest = null;
      for (const q of st.gates) {
        if (!q.on) { gt = q; break; }
        if (!oldest || q.t0 < oldest.t0) oldest = q;
      }
      gt = gt || oldest;
      gt.on = true; gt.t0 = clock;
      gt.x = Math.max(20, Math.min(s.w - 20, x));
      gt.y = Math.max(s.h * 0.48, Math.min(s.h * 0.88, y));   /* gates live on the grid, not the sky */
      verbEvent('boost');
    },
  };

  /* ============================================================
     THE GRID: glyph rain via persistent-overlay (no trails redrawn)
     caps: <=64 columns · ~40 fillText/frame · decorative glyphs only
     ============================================================ */
  const GRID_GLYPHS = 'アカサタナハマヤラワイキシチニヒミリウクスツヌフムユルエケセテネヘメレオコソトノホモヨロ0123456789=+*<>:.|/ﾊﾐﾋｳｼﾅﾓﾆｻﾜ';
  const GRID_GA = Array.from(GRID_GLYPHS);
  const GRID_N = GRID_GA.length;
  const G_OVER = 'rgba(2,18,10,0.12)';
  const G_TRAIL = 'rgba(52,255,136,0.82)';
  const G_HEAD = 'rgba(214,255,233,0.96)';
  const G_TRACE = '#ffffff';
  fx.grid = {
    init(s) {
      const g = s.g;
      g.fillStyle = '#02120a'; g.fillRect(0, 0, s.w, s.h);   /* ground painted ONCE */
      g.font = '600 15px ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const rowH = 18;
      const cols = Math.min(64, Math.max(1, Math.floor(s.w / 18)));
      const cellW = s.w / cols;
      const C = new Array(cols);
      for (let i = 0; i < cols; i++) C[i] = {
        x: (i + 0.5) * cellW,
        y: Math.random() * s.h,
        acc: Math.random() * 120,
        step: 60 + Math.random() * 80,
        ch: GRID_GA[(Math.random() * GRID_N) | 0],
        traceUntil: 0,
      };
      const bursts = [];                               /* decode ripples: expanding glyph rings */
      for (let i = 0; i < 3; i++) bursts.push({ on: false, x: 0, y: 0, t0: 0 });
      return { C, rowH, nextTrace: 0, bursts, held: false, hx: 0, hy: 0 };
    },
    frame(s, st, dt, clock) {
      const g = s.g, w = s.w, h = s.h, C = st.C, rowH = st.rowH, n = C.length;
      if (st.nextTrace === 0) st.nextTrace = clock + 9000 + Math.random() * 6000;

      /* persistent fade — deliberately NOT clearRect: this IS the trail engine */
      g.fillStyle = G_OVER; g.fillRect(0, 0, w, h);

      if (clock >= st.nextTrace) {
        const c = C[(Math.random() * n) | 0];
        c.traceUntil = clock + 520;
        g.fillStyle = G_TRACE;
        for (let yy = -rowH; yy < h + rowH; yy += rowH) g.fillText(GRID_GA[(Math.random() * GRID_N) | 0], c.x, yy);
        st.nextTrace = clock + 9000 + Math.random() * 6000;
      }

      /* THERE IS NO SPOON (WOW #15): while the hand holds, time obeys — the
         rain decelerates inside the fingertip's radius and hangs mid-air */
      for (let i = 0; i < n; i++) {
        const c = C[i];
        let d2 = dt;
        if (st.held) {
          const dxc = Math.abs(c.x - st.hx);
          if (dxc < 150) {
            d2 = dt * (0.1 + 0.9 * (dxc / 150));
            if (dxc < s.w / n) c.traceUntil = clock + 120;   /* the held column burns white */
          }
        }
        c.acc += d2; c.stepped = c.acc >= c.step; if (c.stepped) c.acc = 0;
      }

      g.fillStyle = G_TRAIL;
      for (let i = 0; i < n; i++) { const c = C[i]; if (c.stepped && clock >= c.traceUntil) g.fillText(c.ch, c.x, c.y); }

      for (let i = 0; i < n; i++) {
        const c = C[i]; if (!c.stepped) continue;
        c.y += rowH;
        if (c.y > h + rowH * 2) { c.y = -rowH * (2 + ((Math.random() * 8) | 0)); c.step = 60 + Math.random() * 80; }
        c.ch = GRID_GA[(Math.random() * GRID_N) | 0];
      }

      g.fillStyle = G_HEAD;
      for (let i = 0; i < n; i++) { const c = C[i]; if (c.stepped && clock >= c.traceUntil) g.fillText(c.ch, c.x, c.y); }
      g.fillStyle = G_TRACE;
      for (let i = 0; i < n; i++) { const c = C[i]; if (c.stepped && clock < c.traceUntil) g.fillText(c.ch, c.x, c.y); }

      /* decode ripples: rings of white glyphs sweep outward from the tap;
         the persistent overlay fades each stamp into a green afterimage */
      for (const b of st.bursts) {
        if (!b.on) continue;
        const k = (clock - b.t0) / 620;
        if (k >= 1) { b.on = false; continue; }
        const rr = 24 + k * 130;
        g.fillStyle = G_TRACE;
        for (let a = 0; a < 10; a++) {
          const ang = a * 0.628 + b.t0 * 0.01;
          g.fillText(GRID_GA[(Math.random() * GRID_N) | 0], b.x + Math.cos(ang) * rr, b.y + Math.sin(ang) * rr * 0.72);
        }
      }
    },
    /* M4 verb, enriched: tap a column and the white trace ignites THERE —
       and the tap point itself detonates a decode ripple through the rain */
    verb(s, st, x, y, clock) {
      st.held = true; st.hx = x; st.hy = y;            /* the hold begins (WOW #15) */
      const C = st.C, g = s.g;
      const c = C[Math.max(0, Math.min(C.length - 1, (x / (s.w / C.length)) | 0))];
      c.traceUntil = clock + 520;
      g.fillStyle = G_TRACE;
      for (let yy = -st.rowH; yy < s.h + st.rowH; yy += st.rowH) g.fillText(GRID_GA[(Math.random() * GRID_N) | 0], c.x, yy);
      let b = null, oldest = null;
      for (const q of st.bursts) {
        if (!q.on) { b = q; break; }
        if (!oldest || q.t0 < oldest.t0) oldest = q;
      }
      b = b || oldest;
      b.on = true; b.x = x; b.y = y; b.t0 = clock;
      verbEvent('trace');
    },
    aim(s, st, x, y) { if (st.held) { st.hx = x; st.hy = y; } },
    verbUp(s, st, clock) {
      if (!st.held) return;
      st.held = false;
      /* the whip-crack: time snaps back through every column at once */
      for (const c of st.C) c.acc += 260;
      verbEvent('trace');
    },
  };

  /* ============================================================
     ABYSSAL: jelly drift + marine snow + the leviathan
     caps: 6 jellies · 96 snow · 3 pooled shafts · 1 leviathan
     ============================================================ */
  const LEV_SEG = [[0, 1], [0.15, 0.97], [0.30, 0.90], [0.45, 0.78], [0.59, 0.62], [0.72, 0.45], [0.84, 0.28], [0.94, 0.16]];
  fx.abyssal = {
    init(s) {
      const J = [];
      for (let i = 0; i < 6; i++) J.push(newJelly(s, true));
      J.sort((a, b) => a.r - b.r);
      const SNOW = [];
      for (let i = 0; i < 96; i++) SNOW.push({
        x: Math.random() * s.w, y: Math.random() * s.h,
        v: 0.004 + Math.random() * 0.009, sz: 0.6 + Math.random() * 0.9,
        seed: Math.random() * 9,
      });
      const SHAFTS = [];
      for (let i = 0; i < 3; i++) {
        const cx = s.w * (0.2 + 0.3 * i) + (Math.random() - 0.5) * s.w * 0.08;
        const wT = 14 + Math.random() * 10, wB = wT * (2.2 + Math.random());
        const lean = (Math.random() - 0.5) * s.w * 0.06, hh = s.h * 0.72;
        const path = new Path2D();
        path.moveTo(cx - wT, 0); path.lineTo(cx + wT, 0);
        path.lineTo(cx + lean + wB, hh); path.lineTo(cx + lean - wB, hh);
        path.closePath();
        const grad = s.g.createLinearGradient(0, 0, 0, hh);
        grad.addColorStop(0, 'rgba(191,255,233,0.20)');
        grad.addColorStop(0.55, 'rgba(191,255,233,0.07)');
        grad.addColorStop(1, 'rgba(191,255,233,0)');
        SHAFTS.push({ path, grad, phase: Math.random() * 7, rate: 1400 + Math.random() * 800 });
      }
      const RINGS = [];                                  /* M4: 3 pooled sonar rings */
      for (let i = 0; i < 3; i++) RINGS.push({ on: false, x: 0, y: 0, t0: 0 });
      const MOTES = [];                                  /* a touched jelly sheds living light */
      for (let i = 0; i < 14; i++) MOTES.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1 });
      return {
        J, SNOW, SHAFTS, RINGS, MOTES,
        levOn: false, levStart: 0, nextLev: -1, levDir: 1, levY: 0,
        lampHeld: false, lampX: 0, lampY: 0, lampOff: -1e9,   /* THE DIVE LAMP (WOW #15) */
        ping0: -9e9, ping1: -9e9,                        /* the last two pings: three fast = a call */
      };
    },
    frame(s, st, dt, clock) {
      const g = s.g;
      g.clearRect(0, 0, s.w, s.h);

      if (st.nextLev < 0) st.nextLev = clock + 15000;
      if (!st.levOn && clock >= st.nextLev) {
        st.levOn = true; st.levStart = clock; st.levDir = -st.levDir;
        st.levY = s.h * (0.24 + Math.random() * 0.12);
      }
      let dim = 1, lp = 0, lenv = 0;
      if (st.levOn) {
        lp = (clock - st.levStart) / 14000;
        if (lp >= 1) { st.levOn = false; st.nextLev = clock + 30000 + Math.random() * 20000; }
        else { lenv = Math.sin(Math.PI * lp); dim = 1 - 0.15 * lenv; }   /* the deep holds its breath */
      }
      /* THE DIVE LAMP (WOW #15): the held light gathers the jellies out of
         the dark — and every second it burns, something very large draws
         nearer than it was going to be */
      if (st.lampHeld) {
        for (const j of st.J) {
          j.kick = Math.min(1.4, j.kick + dt * 0.0015);
          j.kx = st.lampX;
        }
        if (!st.levOn) st.nextLev -= dt * 2.5;
      }

      for (const sh of st.SHAFTS) {
        g.globalAlpha = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(clock / sh.rate + sh.phase))) * dim;
        g.fillStyle = sh.grad;
        g.fill(sh.path);
      }

      if (st.levOn && lenv > 0.02) {
        const L = s.w * 1.75, dir = st.levDir;
        const x0 = dir > 0 ? lp * (s.w + L) : s.w - lp * (s.w + L);
        const y = st.levY + Math.sin(clock / 2600) * 7;
        const ry0 = Math.min(64, s.h * 0.085);
        g.fillStyle = 'rgba(1,7,13,' + (0.75 * Math.min(1, lenv * 2.2)).toFixed(3) + ')';
        g.globalAlpha = 1;
        g.beginPath();
        for (let i = 0; i < LEV_SEG.length; i++) {
          const cx = x0 - dir * LEV_SEG[i][0] * L, rr = LEV_SEG[i][1], rx = L * 0.105 * rr;
          g.moveTo(cx + rx, y);
          g.ellipse(cx, y, rx, ry0 * rr, 0, 0, 7);
        }
        const fx0 = x0 - dir * 0.22 * L;
        g.moveTo(fx0, y - ry0 * 0.5);
        g.quadraticCurveTo(fx0 - dir * 0.045 * L, y - ry0 * 2.3, fx0 - dir * 0.12 * L, y - ry0 * 0.5);
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(53,240,200,1)';
        for (let i = 0; i < 5; i++) {
          const cx = x0 - dir * (0.06 + 0.17 * i) * L;
          g.globalAlpha = (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(clock / 340 + i * 2.1))) * lenv;
          g.beginPath(); g.arc(cx, y + ry0 * 0.3, 1.9, 0, 7); g.fill();
        }
      }

      g.globalAlpha = 0.55 * dim;
      g.fillStyle = 'rgba(191,255,233,0.6)';
      for (const p of st.SNOW) {
        p.y += p.v * dt;
        p.x += Math.sin(clock / 3100 + p.seed) * 0.006 * dt;
        if (p.y > s.h + 3) { p.y = -3; p.x = (p.x + s.w * 0.37) % s.w; }
        if (p.x > s.w + 3) p.x = -3; else if (p.x < -3) p.x = s.w + 3;
        g.fillRect(p.x, p.y, p.sz, p.sz);
      }

      g.strokeStyle = 'rgba(143,123,255,0.55)';
      g.lineWidth = 1.1;
      for (const j of st.J) {
        /* the ping's wake: a decaying kick pulses the bell and bends the
           drift toward where the hand called (M4) */
        if (j.kick > 0.02) {
          j.x += (j.kx - j.x) * Math.min(1, dt / 900) * j.kick * 0.5;
          j.kick *= Math.pow(0.999, dt);
        }
        const c = Math.min(1, 0.5 + 0.5 * Math.sin(clock / j.pp + j.seed) + j.kick * 0.6);
        const thrust = Math.max(0, Math.cos(clock / j.pp + j.seed)) + j.kick * 0.5;
        j.y -= j.v * dt * (0.55 + 0.9 * thrust);
        j.x += Math.sin(clock / 2400 + j.seed * 2) * 0.008 * dt;
        if (j.y < -j.r * 3.6) reJelly(s, j);
        j.c = c; j.re = j.r * (1.05 - 0.13 * c);
        g.globalAlpha = j.a * dim;
        g.beginPath();
        for (let t = 0; t < 4; t++) {
          const ax = j.x + (t - 1.5) * j.re * 0.42;
          const sway = Math.sin(clock / j.tp + j.seed + t * 1.7) * j.re * 0.5;
          const len = j.re * (2.7 - Math.abs(t - 1.5) * 0.5);
          g.moveTo(ax, j.y + j.re * 0.18);
          g.quadraticCurveTo(ax + sway * 0.6, j.y + j.re * 1.5, ax + sway, j.y + len);
        }
        g.stroke();
      }
      g.fillStyle = 'rgba(143,123,255,0.5)';
      for (let i = 0; i < 3; i++) drawBell(g, st.J[i], dim);
      g.shadowColor = 'rgba(191,255,233,0.85)';
      g.shadowBlur = 14;
      for (let i = 3; i < 6; i++) drawBell(g, st.J[i], dim);
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(191,255,233,0.8)';
      g.lineWidth = 1.4;
      for (const j of st.J) {
        g.globalAlpha = (0.35 + 0.4 * j.c) * j.a * dim;
        g.beginPath();
        g.arc(j.x, j.y + j.re * 0.08, j.re * 0.66, Math.PI * 1.12, Math.PI * 1.88);
        g.stroke();
      }

      /* the lamp itself: a cone of pale light, marine snow igniting in it —
         and on release it gutters out over 600ms instead of vanishing */
      const lampK = st.lampHeld ? 1 : Math.max(0, 1 - (clock - (st.lampOff || -1e9)) / 600);
      if (lampK > 0.02) {
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.8 * dim * lampK;
        g.drawImage(abyLamp(), st.lampX - 130, st.lampY - 130, 260, 260);
        g.globalAlpha = 0.4 * dim * lampK;
        g.drawImage(abyLamp(), st.lampX - 40, st.lampY - 40, 80, 80);
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
      g.lineWidth = 1.6;                                  /* M4: the sonar rings ride on top */
      g.strokeStyle = 'rgba(191,255,233,1)';
      for (const q of st.RINGS) {
        if (!q.on) continue;
        const k = (clock - q.t0) / 1500;
        if (k >= 1) { q.on = false; continue; }
        const rr = 12 + 150 * k;
        g.globalAlpha = 0.5 * (1 - k) * dim;
        g.beginPath(); g.arc(q.x, q.y, rr, 0, 7); g.stroke();
        g.globalAlpha = 0.25 * (1 - k) * dim;
        g.beginPath(); g.arc(q.x, q.y, rr * 0.62, 0, 7); g.stroke();
      }
      g.fillStyle = 'rgba(124,242,255,1)';                /* shed light rises and gutters out */
      for (const m of st.MOTES) {
        if (!m.on) continue;
        m.life += dt;
        const k = m.life / m.max;
        if (k >= 1) { m.on = false; continue; }
        m.x += m.vx * dt; m.y += m.vy * dt; m.vy -= 0.00002 * dt;
        g.globalAlpha = (1 - k) * 0.85 * dim;
        g.beginPath(); g.arc(m.x, m.y, 1.3 + (1 - k), 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    },
    /* the verb, enriched: a sonar ping blooms at the tap and the jellies
       lean in. Touch a jelly ITSELF and it startles — a hard pulse and a
       shed of living light. Three fast pings anywhere are a CALL, and the
       deep answers: the leviathan comes now. */
    verb(s, st, x, y, clock) {
      /* THE DIVE LAMP (WOW #15): the press IS a light. Hold it and the
         jellies gather out of the dark — hold too long and something very
         large notices, and comes early. */
      st.lampHeld = true; st.lampX = x; st.lampY = y;
      let q = null, oldest = null;
      for (const r of st.RINGS) {
        if (!r.on) { q = r; break; }
        if (!oldest || r.t0 < oldest.t0) oldest = r;
      }
      q = q || oldest;
      q.on = true; q.x = x; q.y = y; q.t0 = clock;
      for (const j of st.J) { j.kick = 1; j.kx = x; }
      for (const j of st.J) {                             /* the touched jelly startles */
        const dx = x - j.x, dy = y - j.y;
        if (dx * dx + dy * dy < j.re * j.re * 2.6) {
          j.kick = 1.8;
          let shed = 0;
          for (const m of st.MOTES) {
            if (m.on) continue;
            m.on = true; m.x = j.x + dx * 0.3; m.y = j.y + dy * 0.3;
            const a = Math.random() * 7, sp = 0.02 + Math.random() * 0.04;
            m.vx = Math.cos(a) * sp; m.vy = Math.sin(a) * sp - 0.02;
            m.life = 0; m.max = 800 + Math.random() * 700;
            if (++shed >= 6) break;
          }
          break;
        }
      }
      if (clock - st.ping1 < 1400 && !st.levOn) st.nextLev = clock;   /* the third fast ping is a call */
      st.ping1 = st.ping0; st.ping0 = clock;
      verbEvent('ping');
    },
    aim(s, st, x, y) { if (st.lampHeld) { st.lampX = x; st.lampY = y; } },
    verbUp(s, st, clock) {
      st.lampHeld = false;
      st.lampOff = clock;                              /* the light GUTTERS out — a dying
                                                          lamp proves there was a lamp (v8 walk) */
    },
  };
  let ABY_LAMP = null;
  function abyLamp() {                                 /* baked once: the diver's light */
    if (ABY_LAMP) return ABY_LAMP;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 6, 128, 128, 128);
    gr.addColorStop(0, 'rgba(221,248,255,0.55)');
    gr.addColorStop(0.4, 'rgba(191,255,233,0.18)');
    gr.addColorStop(1, 'rgba(191,255,233,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    ABY_LAMP = c; return c;
  }
  function drawBell(g, j, dim) {
    const r = j.re;
    g.globalAlpha = j.a * dim;
    g.beginPath();
    g.arc(j.x, j.y, r, Math.PI, 0);
    g.quadraticCurveTo(j.x + r * 0.6, j.y + r * (0.30 + 0.25 * j.c), j.x, j.y + r * (0.16 + 0.18 * j.c));
    g.quadraticCurveTo(j.x - r * 0.6, j.y + r * (0.30 + 0.25 * j.c), j.x - r, j.y);
    g.fill();
  }
  function newJelly(s, scatter) {
    const r = 9 + Math.random() * 15;
    return {
      r, re: r, c: 0, kick: 0, kx: 0,
      x: s.w * (0.08 + Math.random() * 0.84),
      y: scatter ? Math.random() * s.h : s.h + r * 3 + Math.random() * s.h * 0.2,
      v: 0.010 + Math.random() * 0.012,
      a: 0.30 + ((r - 9) / 15) * 0.45,
      pp: 250 + Math.random() * 170,
      tp: 650 + Math.random() * 450,
      seed: Math.random() * 9,
    };
  }
  function reJelly(s, j) {
    j.x = s.w * (0.08 + Math.random() * 0.84);
    j.y = s.h + j.r * 3 + Math.random() * s.h * 0.2;
    j.seed = Math.random() * 9;
    j.kick = 0;                                     /* a fresh riser owes the old ping nothing */
  }

  /* ============================================================
     ARCADIA: the 8-bit cabinet — pixel rank, patrol ship, CRT crunch.
     The cannon is REAL now: hold to autofire (140ms), 8 pooled shots,
     6 pooled explosions, a pixel-digit score, and every cleared wave
     marches the next one faster. The cabinet still demos itself when
     nobody is at the stick.
     caps: invaders <=10 · stars 36 · shots 8 · explosions 6
     ============================================================ */
  const ARC_DIG = [                                    /* 3x5 pixel digits, row bitmasks */
    [7,5,5,5,7],[2,6,2,2,7],[7,1,7,4,7],[7,1,7,1,7],[5,5,7,1,1],
    [7,4,7,1,7],[7,4,7,5,7],[7,1,1,2,2],[7,5,7,5,7],[7,5,7,1,7],
  ];
  function arcScore(g, score, w, y) {                  /* right-aligned, cabinet-yellow */
    const Y0 = y || 16;
    let s2 = Math.min(999999, score) | 0;
    const digits = s2 === 0 ? [0] : [];
    while (s2 > 0) { digits.unshift(s2 % 10); s2 = (s2 / 10) | 0; }
    let x = w - 20 - digits.length * 16;
    for (const d of digits) {
      const bm = ARC_DIG[d];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++)
        if (bm[r] & (4 >> c)) g.fillRect(x + c * 4, Y0 + r * 4, 4, 4);
      x += 16;
    }
  }
  const INVADER_A = [0x18, 0x3C, 0x7E, 0xDB, 0xFF, 0x24, 0x5A, 0xA5];
  const INVADER_B = [0x18, 0x3C, 0x7E, 0xDB, 0xFF, 0xA5, 0x5A, 0x24];
  const PLAYER = [0x18, 0x18, 0x3C, 0x7E, 0xFF, 0xFF, 0xFF, 0xE7];
  const EXPL = [
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
    [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2], [0, 0]],
    [[0, -3], [-2, -2], [2, -2], [-3, 0], [3, 0], [-2, 2], [2, 2], [0, 3], [-1, -1], [1, 1]],
    [[-3, -2], [3, -2], [-4, 0], [4, 0], [-3, 2], [3, 2], [0, -4], [0, 4], [-2, -3], [2, 3]],
    [[-4, -1], [4, 1], [-1, -4], [1, 4], [3, -3], [-3, 3], [0, 4], [4, -2]],
    [[-4, 0], [4, 0], [0, -4], [0, 4], [3, 3], [-3, -3]],
  ];
  function arcBlit(g, bmp, x, y) {
    for (let r = 0; r < 8; r++) {
      const bits = bmp[r]; let c = 0;
      while (c < 8) {
        if (bits & (0x80 >> c)) {
          let run = 1;
          while (c + run < 8 && (bits & (0x80 >> (c + run)))) run++;
          g.fillRect(x + c * 4, y + r * 4, run * 4, 4);
          c += run;
        } else c++;
      }
    }
  }
  function arcStatic(g, w, h) {
    g.clearRect(0, 0, w, h);
    let seed = 1337; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = 'rgba(230,240,255,0.7)';
    for (let i = 0; i < 36; i++) {
      const x = Math.floor(rnd() * w / 4) * 4, y = Math.floor(rnd() * (h * 0.9) / 4) * 4;
      if (i % 3 !== 2) g.fillRect(x, y, 4, 4);
    }
    const N = w < 520 ? 8 : 10, SPR = 32;
    const CELL = Math.max(40, Math.min(64, Math.floor(w / (N + 2) / 4) * 4));
    const formW = (N - 1) * CELL + SPR;
    const gx = Math.floor((w - formW) / 2 / 4) * 4, gy = Math.floor(Math.max(128, h * 0.24) / 4) * 4;
    g.fillStyle = '#7dff5a';
    for (let i = 0; i < N; i++) arcBlit(g, INVADER_A, gx + i * CELL, gy);
    g.fillStyle = '#ffd23f';
    arcBlit(g, PLAYER, Math.floor((w / 2 - 16) / 4) * 4, Math.floor((h - 76) / 4) * 4);
  }
  fx.arcadia = {
    init(s) {
      const w = s.w, h = s.h, SPR = 32;
      const N = w < 520 ? 8 : 10;
      const CELL = Math.max(40, Math.min(64, Math.floor(w / (N + 2) / 4) * 4));
      const formW = (N - 1) * CELL + SPR;
      const leftBound = 16;
      const rightBound = Math.max(leftBound, Math.floor((w - formW - 16) / 4) * 4);
      const stars = [];
      let seed = 1337; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 36; i++) stars.push({
        x: Math.floor(rnd() * w / 4) * 4, y: Math.floor(rnd() * (h * 0.9) / 4) * 4,
        period: 300 + Math.floor(rnd() * 8) * 90, seed: Math.floor(rnd() * 4),
      });
      const inv = [];
      for (let i = 0; i < N; i++) inv.push({ dead: false, respawnAt: 0 });
      const shots = [];
      for (let i = 0; i < 8; i++) shots.push({ on: false, x: 0, y: 0, ps: false });
      const expls = [];
      for (let i = 0; i < 6; i++) expls.push({ on: false, x: 0, y: 0, start: 0 });
      const eshots = [];                               /* INSERT COIN: the cabinet shoots back */
      for (let i = 0; i < 4; i++) eshots.push({ on: false, x: 0, y: 0 });
      return {
        w, h, N, SPR, CELL,
        gx: leftBound, gy: 128, dir: 1, leftBound, rightBound,
        topStart: 128, resetY: Math.floor(h * 0.60 / 4) * 4, canMove: rightBound > leftBound,
        stepTick: -1, stepMs: 480, stars, inv,
        shipX: w / 2 - 16, shipTargetX: w / 2 - 16, shipY: Math.floor((h - 76) / 4) * 4,
        shots, expls, eshots, nextShot: -1, nextEfire: -1,
        aimHold: -9e9, coolUntil: -9e9,
        fireHeld: false, fireDownAt: -9e9,
        score: 0, waveClearAt: 0,
        lives: 3, over: false, respawnUntil: 0,        /* one credit; the coin buys another */
        best: (typeof keep !== 'undefined' && parseInt(keep.get('orrery-arcadia-best') || '0', 10)) || 0,
        coinBtn: document.querySelector('#world-arcadia .w-verb .w-toy'),
      };
    },
    frame(s, st, dt, clock) {
      const g = s.g, w = s.w, h = s.h, SPR = 32;

      const tick = Math.floor(clock / st.stepMs);
      const flip = tick & 1;
      if (tick !== st.stepTick) {
        st.stepTick = tick;
        if (st.canMove && !st.over) {
          let nx = st.gx + st.dir * 8;
          if (nx > st.rightBound || nx < st.leftBound) {
            st.dir *= -1;
            st.gy += 16;
            if (st.gy > st.resetY) st.gy = st.topStart;
            nx = st.gx + st.dir * 8;
            if (nx > st.rightBound) nx = st.rightBound;
            if (nx < st.leftBound) nx = st.leftBound;
          }
          st.gx = nx;
        }
      }

      /* a cleared wave re-forms all at once, and marches FASTER (floor 300ms) */
      if (st.waveClearAt && clock >= st.waveClearAt) {
        st.waveClearAt = 0;
        st.stepMs = Math.max(300, st.stepMs - 40);
        st.stepTick = Math.floor(clock / st.stepMs);
        st.gy = st.topStart;
        for (const iv of st.inv) iv.dead = false;
      }
      if (!st.waveClearAt && !st.over) for (const iv of st.inv) if (iv.dead && clock > iv.respawnAt) iv.dead = false;

      /* the ship: chases the player's aim while a hand is on the stick;
         only wanders on its own once the hand has been gone a while (M4) */
      const shipMin = 16, shipMax = w - SPR - 16;
      st.shipX += (st.shipTargetX - st.shipX) * (1 - Math.exp(-dt / 620));
      if (Math.abs(st.shipTargetX - st.shipX) < 4 && clock - st.aimHold > 4000)
        st.shipTargetX = shipMin + Math.random() * (shipMax - shipMin);

      /* hold-to-autofire: the cannon answers as long as the hand is down
         (5s max burst so a stuck latch can never fire forever) */
      if (st.fireHeld && clock - st.fireDownAt > 5000) st.fireHeld = false;
      if (!st.over && st.fireHeld && clock >= st.coolUntil) {
        st.coolUntil = clock + 140;
        if (arcFire(st, true)) verbEvent('shot');
      }

      /* attract mode: the cabinet plays itself only while nobody is at it */
      if (st.nextShot < 0) st.nextShot = clock + 3000 + Math.random() * 3000;
      if (clock > st.nextShot) {
        if (!st.over && clock - st.aimHold > 6000) arcFire(st, false);
        st.nextShot = clock + 8000 + Math.random() * 6000;
      }

      /* INSERT COIN (WOW #11): the cabinet finally shoots back — a random
         defender returns fire, and the pace tightens as the march does */
      if (!st.over) {
        if (st.nextEfire < 0) st.nextEfire = clock + 2600;
        if (clock >= st.nextEfire) {
          st.nextEfire = clock + (900 + Math.random() * 900) * (st.stepMs / 480);
          let pick = -1, seen = 0;
          for (let i = 0; i < st.N; i++) { if (st.inv[i].dead) continue; seen++; if (Math.random() < 1 / seen) pick = i; }
          if (pick >= 0) for (const es of st.eshots) {
            if (es.on) continue;
            es.on = true; es.x = st.gx + pick * st.CELL + 14; es.y = st.gy + 30;
            break;
          }
        }
        for (const es of st.eshots) {
          if (!es.on) continue;
          es.y += 0.2 * dt;
          if (es.y > h + 8) { es.on = false; continue; }
          if (clock > st.respawnUntil
              && es.y >= st.shipY - 4 && es.y <= st.shipY + 28
              && Math.abs(es.x - (st.shipX + 14)) < 15) {
            es.on = false;
            for (const ex of st.expls) if (!ex.on) { ex.on = true; ex.x = st.shipX + 14; ex.y = st.shipY + 8; ex.start = clock; break; }
            st.lives--;
            st.respawnUntil = clock + 1600;            /* the next ship beams in blinking */
            if (st.lives <= 0) {                       /* GAME OVER: the cabinet asks for a coin */
              st.over = true; st.fireHeld = false;
              if (st.score > st.best) {
                st.best = st.score;
                if (typeof keep !== 'undefined') keep.set('orrery-arcadia-best', String(st.best));
              }
              if (st.coinBtn) st.coinBtn.textContent = 'Insert coin';
              verbEvent('gameover');
            }
          }
        }
      }

      /* shots fly STRAIGHT (M4 killed the homing steer): a hit is a hit
         against whichever live invader the shot actually crosses */
      const rowY = st.gy + 16;
      for (const sh of st.shots) {
        if (!sh.on) continue;
        sh.y -= 0.38 * dt;
        if (sh.y <= rowY + 14 && sh.y > rowY - 14) {
          const sx = sh.x + 2;
          for (let i = 0; i < st.N; i++) {
            if (st.inv[i].dead) continue;
            const cx = st.gx + i * st.CELL + 16;
            if (Math.abs(sx - cx) < 18) {
              for (const ex of st.expls) if (!ex.on) { ex.on = true; ex.x = cx; ex.y = rowY; ex.start = clock; break; }
              st.inv[i].dead = true; st.inv[i].respawnAt = clock + 3000;
              sh.on = false;
              if (sh.ps) { st.score += 100; verbEvent('invader'); }
              let alive = 0;
              for (const iv of st.inv) if (!iv.dead) alive++;
              if (alive === 0 && !st.waveClearAt) {          /* WAVE CLEAR */
                st.waveClearAt = clock + 900;
                for (const iv of st.inv) iv.respawnAt = clock + 9e9;
                if (sh.ps) st.score += 500;
              }
              break;
            }
          }
        }
        if (sh.on && sh.y < 8) sh.on = false;
      }

      g.clearRect(0, 0, w, h);

      g.fillStyle = 'rgba(230,240,255,0.85)';
      for (const z of st.stars) if (((Math.floor(clock / z.period) + z.seed) & 3) === 0) g.fillRect(z.x, z.y, 4, 4);
      g.fillStyle = 'rgba(150,170,210,0.4)';
      for (const z of st.stars) { const p = (Math.floor(clock / z.period) + z.seed) & 3; if (p === 1 || p === 3) g.fillRect(z.x, z.y, 4, 4); }

      g.fillStyle = '#7dff5a';
      const bmp = flip ? INVADER_B : INVADER_A, gy = st.gy;
      for (let i = 0; i < st.N; i++) if (!st.inv[i].dead) arcBlit(g, bmp, st.gx + i * st.CELL, gy);

      g.fillStyle = '#ffd23f';
      if (st.over) g.globalAlpha = 0.3;                /* the ship waits for its coin */
      else if (clock < st.respawnUntil) g.globalAlpha = 0.4 + 0.25 * Math.sin(clock * 0.004);   /* soft shimmer, strobe-safe */
      arcBlit(g, PLAYER, Math.floor(st.shipX / 4) * 4, st.shipY);
      g.globalAlpha = 1;
      for (let li = 0; li < Math.max(0, st.lives - 1); li++)   /* the spare ships wait below */
        arcBlit(g, PLAYER, 16 + li * 40, h - 40);
      for (const sh of st.shots) if (sh.on) g.fillRect(Math.floor(sh.x / 4) * 4, Math.floor(sh.y / 4) * 4, 4, 12);
      g.fillStyle = '#ff8c5a';                         /* the cabinet's return fire */
      for (const es of st.eshots) if (es.on) g.fillRect(Math.floor(es.x / 4) * 4, Math.floor(es.y / 4) * 4, 4, 10);
      g.fillStyle = '#ffd23f';
      if (st.score > 0) arcScore(g, st.score, w);      /* the cabinet keeps your count */
      if (st.best > 0) {                               /* and it never forgets its best */
        g.fillStyle = 'rgba(255,210,63,0.35)';
        arcScore(g, st.best, w, 40);
        g.fillStyle = '#ffd23f';
      }

      g.fillStyle = '#ff4757';
      for (const ex of st.expls) {
        if (!ex.on) continue;
        const f = Math.floor((clock - ex.start) / 64);
        if (f >= 6) { ex.on = false; continue; }
        const fr = EXPL[f];
        for (let k = 0; k < fr.length; k++) g.fillRect(ex.x + fr[k][0] * 4, ex.y + fr[k][1] * 4, 4, 4);
      }
    },
    /* M4 verbs: the pointer is the stick, holding it down is the fire
       button — press to shoot, keep it pressed to hose the sky */
    aim(s, st, x, y, clock) {
      st.aimHold = clock;
      st.shipTargetX = Math.max(16, Math.min(s.w - 48, x - 16));
    },
    verb(s, st, x, y, clock) {
      if (st.over) { arcCoin(st, clock); return; }     /* the tap IS the coin slot */
      st.aimHold = clock;
      st.shipTargetX = Math.max(16, Math.min(s.w - 48, x - 16));
      st.fireHeld = true; st.fireDownAt = clock;
      if (clock < st.coolUntil) return;
      st.coolUntil = clock + 140;
      if (arcFire(st, true)) verbEvent('shot');
    },
    verbUp(s, st) { st.fireHeld = false; },
    rm() {
      const c = document.querySelector('[data-canvas="arcadia"]');
      if (!c || !c.parentElement) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const r = c.parentElement.getBoundingClientRect();
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      arcStatic(g, r.width, r.height);
    },
  };
  function arcCoin(st, clock) {                        /* one more credit (WOW #11) */
    st.lives = 3; st.score = 0; st.over = false;
    st.stepMs = 480; st.stepTick = -1;
    st.gy = st.topStart; st.waveClearAt = 0;
    for (const iv of st.inv) { iv.dead = false; iv.respawnAt = 0; }
    for (const sh of st.shots) sh.on = false;
    for (const es of st.eshots) es.on = false;
    st.nextEfire = clock + 2600;
    st.respawnUntil = clock + 1600;                    /* a breath of grace off the line */
    if (st.coinBtn) st.coinBtn.textContent = 'Fire';
    verbEvent('credit');
  }
  function arcFire(st, playerShot) {
    for (const sh of st.shots) {
      if (sh.on) continue;
      sh.on = true; sh.ps = !!playerShot;
      sh.x = Math.floor(st.shipX / 4) * 4 + 12;
      sh.y = st.shipY - 8;
      return true;
    }
    return false;                                      /* all 8 in the air: the cannon breathes */
  }

  /* ============================================================
     AURORA: dancing lights over the frozen lattice (ribbons behind the crystal)
     caps: 4 ribbons · 64 flakes · 1 shooting star
     ============================================================ */
  const AUR = { teal: [53, 240, 200], green: [125, 255, 176], violet: [143, 123, 255], ice: [168, 233, 255] };
  const A_NX = 22;
  const A_XS = new Float32Array(A_NX);
  for (let i = 0; i < A_NX; i++) A_XS[i] = i / (A_NX - 1);
  const A_RIB = [
    { hb: 0.10, fb: 0.52, ha: 0.17, amax: 0.064, hs: 0.000045, hp: 0.0, ca: [AUR.teal, AUR.violet], cb: [AUR.green, AUR.teal],
      comps: [{ a: 0.030, f: 5.5, p: 0.0, s: 0.00045 }, { a: 0.022, f: 9.0, p: 2.1, s: -0.00032 }, { a: 0.012, f: 15.0, p: 4.0, s: 0.00060 }] },
    { hb: 0.17, fb: 0.50, ha: 0.15, amax: 0.065, hs: 0.000038, hp: 1.7, ca: [AUR.green, AUR.teal], cb: [AUR.violet, AUR.green],
      comps: [{ a: 0.034, f: 4.5, p: 1.0, s: -0.00040 }, { a: 0.020, f: 8.2, p: 3.0, s: 0.00036 }, { a: 0.011, f: 13.0, p: 0.5, s: 0.00052 }] },
    { hb: 0.25, fb: 0.55, ha: 0.16, amax: 0.062, hs: 0.000052, hp: 3.1, ca: [AUR.violet, AUR.teal], cb: [AUR.teal, AUR.ice],
      comps: [{ a: 0.028, f: 6.2, p: 2.4, s: 0.00038 }, { a: 0.024, f: 10.5, p: 0.8, s: -0.00030 }, { a: 0.010, f: 17.0, p: 5.0, s: 0.00058 }] },
    { hb: 0.32, fb: 0.58, ha: 0.13, amax: 0.064, hs: 0.000041, hp: 4.6, ca: [AUR.teal, AUR.green], cb: [AUR.ice, AUR.violet],
      comps: [{ a: 0.036, f: 3.8, p: 3.3, s: 0.00034 }, { a: 0.018, f: 7.7, p: 1.6, s: -0.00042 }, { a: 0.010, f: 12.5, p: 2.2, s: 0.00050 }] },
  ];
  function aMix(a, b, f) { return (a + (b - a) * f) | 0; }
  function aRGB(cA, cB, f) { return aMix(cA[0], cB[0], f) + ',' + aMix(cA[1], cB[1], f) + ',' + aMix(cA[2], cB[2], f); }
  function newFlake(s, scatter) {
    return { x: Math.random() * s.w, y: scatter ? Math.random() * s.h : -6,
      r: 0.7 + Math.random() * 1.8, vy: 0.018 + Math.random() * 0.028,
      ph: Math.random() * 7, sw: 0.0006 + Math.random() * 0.0010, amp: 4 + Math.random() * 10 };
  }
  function reflake(p, s) { p.x = Math.random() * s.w; p.y = -6; p.r = 0.7 + Math.random() * 1.8;
    p.vy = 0.018 + Math.random() * 0.028; p.amp = 4 + Math.random() * 10; }
  function spawnStar(s) {
    const fromLeft = Math.random() < 0.5, sp = 0.5 + Math.random() * 0.35, dir = fromLeft ? 1 : -1;
    return { x: fromLeft ? -30 : s.w + 30, y: s.h * (0.03 + Math.random() * 0.10),
      vx: dir * sp, vy: (0.06 + Math.random() * 0.10) * sp / 0.6, life: 0, max: 900 + Math.random() * 500 };
  }
  fx.aurora = {
    init(s) {
      const snow = [];
      for (let i = 0; i < 64; i++) snow.push(newFlake(s, true));
      const surges = [];                               /* the hand conducts: 3 pooled sky-surges */
      for (let i = 0; i < 3; i++) surges.push({ on: false, xn: 0, t0: 0 });
      const sparks = [];                               /* ice-sparks off the strike itself */
      for (let i = 0; i < 14; i++) sparks.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1 });
      return { snow, star: null, nextStar: 0, surges, sparks };
    },
    frame(s, st, dt, clock) {
      const g = s.g, w = s.w, h = s.h;
      g.clearRect(0, 0, w, h);
      if (st.nextStar === 0) st.nextStar = clock + 3000 + Math.random() * 5000;

      let lift = 0;                                    /* how hard the sky is being conducted */
      for (const sg of st.surges) {
        if (!sg.on) continue;
        const age = (clock - sg.t0) / 2600;
        if (age >= 1) { sg.on = false; continue; }
        const e = Math.sin(age * Math.PI);
        if (e > lift) lift = e;
      }

      g.globalCompositeOperation = 'lighter';
      for (let ri = 0; ri < A_RIB.length; ri++) {
        const R = A_RIB[ri];
        const f = 0.5 + 0.5 * Math.sin(clock * R.hs + R.hp);
        const hemRGB = aRGB(R.ca[0], R.cb[0], f), botRGB = aRGB(R.ca[1], R.cb[1], f);
        const hbY = R.hb * h, fbY = R.fb * h;
        const ha = R.ha * (1 + 0.55 * lift);           /* a conducted sky burns brighter */
        const grad = g.createLinearGradient(0, hbY - R.amax * h, 0, fbY);
        grad.addColorStop(0, `rgba(${hemRGB},${ha})`);
        grad.addColorStop(0.5, `rgba(${botRGB},${ha * 0.4})`);
        grad.addColorStop(1, `rgba(${botRGB},0)`);
        g.fillStyle = grad;
        g.beginPath();
        for (let i = 0; i < A_NX; i++) {
          const xn = A_XS[i]; let y = hbY;
          for (let j = 0; j < 3; j++) { const c = R.comps[j]; y += c.a * h * Math.sin(c.f * xn + c.p + clock * c.s); }
          /* the surge: a localized swell that dances outward from the strike */
          for (const sg of st.surges) {
            if (!sg.on) continue;
            const age = (clock - sg.t0) / 2600, d = xn - sg.xn;
            y -= h * 0.055 * Math.exp(-(d * d) / 0.014) * Math.sin(age * Math.PI)
               * Math.sin(11 * xn - clock * 0.006 + ri * 1.3);
          }
          const x = xn * w; i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.lineTo(w, fbY); g.lineTo(0, fbY); g.closePath(); g.fill();
      }
      g.globalCompositeOperation = 'source-over';

      g.fillStyle = 'rgba(214,240,255,1)';             /* the strike's ice-sparks */
      for (const p of st.sparks) {
        if (!p.on) continue;
        p.life += dt;
        const k = p.life / p.max;
        if (k >= 1) { p.on = false; continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.00006 * dt;
        g.globalAlpha = (1 - k) * 0.9;
        g.beginPath(); g.arc(p.x, p.y, 1.1 + (1 - k) * 0.9, 0, 7); g.fill();
      }
      g.globalAlpha = 1;

      g.fillStyle = 'rgba(214,236,255,0.72)';
      for (const p of st.snow) {
        p.y += p.vy * dt; p.ph += p.sw * dt;
        if (p.y > h + 6) reflake(p, s);
        g.beginPath(); g.arc(p.x + Math.sin(p.ph) * p.amp, p.y, p.r, 0, 7); g.fill();
      }

      if (!st.star && clock > st.nextStar) st.star = spawnStar(s);
      if (st.star) {
        const S = st.star; S.life += dt; S.x += S.vx * dt; S.y += S.vy * dt;
        const k = S.life / S.max;
        if (k >= 1) { st.star = null; st.nextStar = clock + 10000 + Math.random() * 8000; }
        else {
          const a = Math.sin(Math.PI * k), tx = S.x - S.vx * 120, ty = S.y - S.vy * 120;
          const tg = g.createLinearGradient(tx, ty, S.x, S.y);
          tg.addColorStop(0, 'rgba(200,240,255,0)');
          tg.addColorStop(1, `rgba(224,248,255,${0.8 * a})`);
          g.strokeStyle = tg; g.lineWidth = 2;
          g.beginPath(); g.moveTo(tx, ty); g.lineTo(S.x, S.y); g.stroke();
          g.fillStyle = `rgba(255,255,255,${0.9 * a})`;
          g.shadowColor = 'rgba(168,233,255,0.9)'; g.shadowBlur = 8;
          g.beginPath(); g.arc(S.x, S.y, 2.2, 0, 7); g.fill();
          g.shadowBlur = 0;
        }
      }
    },
    rm() { /* intentional no-op: the frozen end-state is pure CSS (.aurora-static) */ },
    /* the verb: CONDUCT the lights — strike the sky and a swell rolls
       through every ribbon from where you touched, ice-sparks at the point,
       the whole aurora burning brighter while it dances */
    verb(s, st, x, y, clock) {
      let sg = null, oldest = null;
      for (const q of st.surges) {
        if (!q.on) { sg = q; break; }
        if (!oldest || q.t0 < oldest.t0) oldest = q;
      }
      sg = sg || oldest;
      sg.on = true; sg.xn = x / s.w; sg.t0 = clock;
      let n2 = 0;
      for (const p of st.sparks) {
        if (p.on) continue;
        p.on = true; p.x = x; p.y = y;
        const a = Math.random() * 7, sp = 0.03 + Math.random() * 0.06;
        p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 0.03;
        p.life = 0; p.max = 600 + Math.random() * 600;
        if (++n2 >= 10) break;
      }
      verbEvent('query');
    },
  };
  const runQuery = document.getElementById('run-query');
  if (runQuery) {
    const auroraScene = document.getElementById('world-aurora');
    runQuery.addEventListener('click', () => {
      auroraScene.classList.remove('is-querying');
      void auroraScene.offsetWidth;
      auroraScene.classList.add('is-querying');
      window.Orrery.events.dispatchEvent(new CustomEvent('query'));
      setTimeout(() => auroraScene.classList.remove('is-querying'), 3200);
    });
  }

  /* ============================================================
     UNCHARTED: the survey drafts where you look
     ============================================================ */
  /* one painter serves the live frame AND the rm pose (a drifted copy is a
     differently-styled world nobody notices): litAt(c, r) supplies the charge */
  function draftPaint(g, cols, rows, litAt) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const v = litAt(c, r);
      if (v <= 0.02) continue;
      const x = c * 56, y = r * 56;
      g.strokeStyle = `rgba(100,213,245,${v * 0.5})`;
      g.lineWidth = 1;
      g.strokeRect(x + 3, y + 3, 50, 50);
      if (v > 0.65) {
        g.strokeStyle = `rgba(100,213,245,${(v - 0.65) * 0.9})`;
        g.beginPath();
        g.arc(x + 28, y + 28, 12 + ((c * 7 + r * 13) % 9), 0.4, 2.6);
        g.stroke();
      }
    }
  }
  fx.draft = {
    init(s) {
      const cols = Math.ceil(s.w / 56), rows = Math.ceil(s.h / 56);
      const lit = new Float32Array(cols * rows);
      const pings = [];                                 /* survey soundings: 2 pooled rings */
      for (let i = 0; i < 2; i++) pings.push({ on: false, x: 0, y: 0, t0: 0 });
      const st = {
        cols, rows, lit, px: s.w / 2, py: s.h / 2,
        auto: !matchMedia('(pointer: fine)').matches, at: 0,
        pings,
        wpx: new Float32Array(7), wpy: new Float32Array(7),   /* the charted route: 7 waypoints, FIFO */
        wpN: 0, wpHead: 0,
      };
      st.litAt = (c, r) => st.lit[c + r * st.cols];     /* bound once: zero per-frame alloc */
      const move = (e) => {
        /* canvas-local coordinates: the grid math below indexes THIS surface,
           so a scrolled or offset stage must not skew the survey off-cursor */
        const r = s.c.getBoundingClientRect();
        st.px = e.clientX - r.left; st.py = e.clientY - r.top;
      };
      s.c.parentElement.parentElement.addEventListener('pointermove', move, { passive: true });
      st.cleanup = () => s.c.parentElement.parentElement.removeEventListener('pointermove', move);
      return st;
    },
    frame(s, st, dt, clock) {
      if (st.auto) {
        st.at += dt / 4000;
        st.px = s.w * (0.5 + 0.38 * Math.sin(st.at * 2.1));
        st.py = s.h * (0.5 + 0.3 * Math.sin(st.at * 1.3 + 1.7));
      }
      const ci = Math.floor(st.px / 56), ri = Math.floor(st.py / 56);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const c = ci + dx, r = ri + dy;
        if (c >= 0 && r >= 0 && c < st.cols && r < st.rows) {
          const k = c + r * st.cols;
          st.lit[k] = Math.min(1, st.lit[k] + dt / (dx || dy ? 2600 : 900));
        }
      }
      /* the soundings: an expanding wavefront charts every cell it crosses */
      for (const p of st.pings) {
        if (!p.on) continue;
        const k = (clock - p.t0) / 950;
        if (k >= 1) { p.on = false; continue; }
        const rr = 20 + k * 170;
        for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
          const dx = c * 56 + 28 - p.x, dy = r * 56 + 28 - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > rr - 30 && d < rr + 30) {
            const kk = c + r * st.cols;
            st.lit[kk] = Math.min(1, st.lit[kk] + dt / 480);
          }
        }
      }
      s.g.clearRect(0, 0, s.w, s.h);
      draftPaint(s.g, st.cols, st.rows, st.litAt);
      const g = s.g;
      for (const p of st.pings) {                       /* the wavefront itself */
        if (!p.on) continue;
        const k = (clock - p.t0) / 950;
        const rr = 20 + k * 170;
        g.strokeStyle = `rgba(100,213,245,${((1 - k) * 0.65).toFixed(3)})`;
        g.lineWidth = 1.6;
        g.beginPath(); g.arc(p.x, p.y, rr, 0, 7); g.stroke();
      }
      if (st.wpN > 0) {                                 /* the charted route: dashed, oldest to newest */
        g.strokeStyle = 'rgba(100,213,245,0.55)';
        g.lineWidth = 1.2;
        g.setLineDash([5, 7]);
        g.beginPath();
        for (let i = 0; i < st.wpN; i++) {
          const k = (st.wpHead - st.wpN + 1 + i + 14) % 7;
          i === 0 ? g.moveTo(st.wpx[k], st.wpy[k]) : g.lineTo(st.wpx[k], st.wpy[k]);
        }
        g.stroke();
        g.setLineDash([]);                              /* the shared context keeps its line style */
        for (let i = 0; i < st.wpN; i++) {
          const k = (st.wpHead - st.wpN + 1 + i + 14) % 7;
          const last = i === st.wpN - 1;
          const pulse = last ? 0.7 + 0.3 * Math.sin(clock * 0.006) : 0.75;
          g.strokeStyle = `rgba(100,213,245,${pulse.toFixed(3)})`;
          g.lineWidth = last ? 1.8 : 1.2;
          g.beginPath(); g.arc(st.wpx[k], st.wpy[k], last ? 6 : 4.5, 0, 7); g.stroke();
          g.beginPath();
          g.moveTo(st.wpx[k] - 8, st.wpy[k]); g.lineTo(st.wpx[k] + 8, st.wpy[k]);
          g.moveTo(st.wpx[k], st.wpy[k] - 8); g.lineTo(st.wpx[k], st.wpy[k] + 8);
          g.stroke();
        }
      }
    },
    /* the verb: SOUND THE SURVEY — a wavefront charts a ring of cells out
       from the strike, and a waypoint drops there, threading onto the
       dashed route of everywhere you have declared worth returning to */
    verb(s, st, x, y, clock) {
      let p = null, oldest = null;
      for (const q of st.pings) {
        if (!q.on) { p = q; break; }
        if (!oldest || q.t0 < oldest.t0) oldest = q;
      }
      p = p || oldest;
      p.on = true; p.x = x; p.y = y; p.t0 = clock;
      st.wpHead = (st.wpHead + 1) % 7;
      st.wpx[st.wpHead] = x; st.wpy[st.wpHead] = y;
      if (st.wpN < 7) st.wpN++;
      if (st.wpN >= 5) verbEvent('charted');           /* five soundings earn the pen (WOW #9) */
      verbEvent('ping');
    },
    rm() {                                     /* designed static pose: a survey abandoned mid-draft —
                                                  a diagonal swath of charted cells, densest where the
                                                  pen last worked (archive idiom; was a blank canvas) */
      const c = document.querySelector('[data-canvas="draft"]');
      if (!c || !c.parentElement) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const r = c.parentElement.getBoundingClientRect();
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.ceil(r.width / 56), rows = Math.ceil(r.height / 56);
      g.clearRect(0, 0, r.width, r.height);
      draftPaint(g, cols, rows, (ci, ri) => {
        const u = ci / cols, w2 = ri / rows;
        return Math.max(0, 1 - Math.abs(u + w2 - 1.1) * 2.4) * (0.35 + ((ci * 7 + ri * 13) % 5) * 0.16);
      });
    },
  };

  /* ============================================================
     THE ARCHIVE: probability fans + archival mark-rain
     caps: <=128 pooled nodes (rebuilt in place) · <=9 rain columns ·
     one prebaked glow sprite · gradients built once, never per frame
     ============================================================ */
  let ARCH_GLOW = null;
  function archiveGlow() {
    if (ARCH_GLOW) return ARCH_GLOW;
    const s = 48, c = document.createElement('canvas'); c.width = s; c.height = s;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,231,170,0.9)');
    gr.addColorStop(0.4, 'rgba(255,210,130,0.32)');
    gr.addColorStop(1, 'rgba(255,210,130,0)');
    x.fillStyle = gr; x.fillRect(0, 0, s, s);
    ARCH_GLOW = c; return c;
  }
  function archiveMakeState(w, h) {
    const CAP = 128;
    const st = {
      CAP, count: 0,
      ax: new Float32Array(CAP), ay: new Float32Array(CAP),
      cx: new Float32Array(CAP), cy: new Float32Array(CAP),
      parent: new Int16Array(CAP), depth: new Uint8Array(CAP),
      ang: new Float32Array(CAP), wt: new Float32Array(CAP),
      br: new Uint8Array(CAP), gd: new Float32Array(CAP),
      rootX: 0, rootY: 0,
      cycleT0: -1, GROW: 3500, HOLD: 8000, DUR: 9000, shimmer: -1,
      rain: [],
    };
    const cols = Math.min(9, Math.max(3, Math.floor(w / 160)));
    for (let i = 0; i < cols; i++) st.rain.push({
      x: (i + 0.5) * (w / cols) + (Math.random() - 0.5) * 40,
      y: Math.random() * h,
      vy: 0.008 + Math.random() * 0.014,
      seed: (Math.random() * 97) | 0,
    });
    return st;
  }
  function archiveBuildFan(s, st) {          /* rebuilds the pool IN PLACE — zero alloc */
    const W = s.w, H = s.h, rnd = Math.random;
    const MAXD = 4 + (rnd() < 0.5 ? 0 : 1);
    /* a hand may have planted the question somewhere specific */
    st.rootX = st.rerootX != null ? st.rerootX : W * (0.28 + rnd() * 0.44);
    st.rerootX = null;
    st.rootY = H * 0.92;
    st.ax[0] = st.rootX; st.ay[0] = st.rootY;
    st.parent[0] = -1; st.depth[0] = 0; st.ang[0] = Math.PI / 2;
    st.wt[0] = 1; st.br[0] = 1; st.gd[0] = 0;
    let count = 1, levelStart = 0, levelEnd = 1;
    const baseLen = Math.min(H * 0.155, 118);
    for (let d = 1; d <= MAXD && count < st.CAP; d++) {
      const len = baseLen * Math.pow(0.72, d - 1);
      const spread = d === 1 ? 1.15 : 0.66;
      const gdBase = d / (MAXD + 1);
      for (let pi = levelStart; pi < levelEnd && count < st.CAP; pi++) {
        let kids = d === 1 ? 3 + (rnd() * 3 | 0) : d === MAXD ? 1 + (rnd() * 2 | 0) : 1 + (rnd() * 3 | 0);
        const first = count; let sum = 0;
        for (let k = 0; k < kids && count < st.CAP; k++) {
          const off = spread * ((k + 0.5) / kids * 2 - 1) + (rnd() - 0.5) * 0.22;
          const a = st.ang[pi] + off, raw = 0.25 + rnd() * 0.8;
          st.ang[count] = a;
          st.ax[count] = st.ax[pi] + Math.cos(a) * len;
          st.ay[count] = st.ay[pi] - Math.sin(a) * len;
          st.parent[count] = pi; st.depth[count] = d; st.wt[count] = raw; st.br[count] = 0;
          st.gd[count] = Math.min(0.9, gdBase + rnd() * 0.12);
          sum += raw; count++;
        }
        if (count > first && sum > 0) { const pw = st.wt[pi]; for (let c = first; c < count; c++) st.wt[c] = pw * (st.wt[c] / sum); }
      }
      levelStart = levelEnd; levelEnd = count;
    }
    st.count = count;
    let cur = 0;                             /* the chosen future: greedy max-weight walk */
    for (;;) {
      let best = -1, bw = -1;
      for (let i = cur + 1; i < count; i++) if (st.parent[i] === cur && st.wt[i] > bw) { bw = st.wt[i]; best = i; }
      if (best < 0) break;
      st.br[best] = 1; cur = best;
    }
  }
  function archiveGrow(st, i, gp) {
    let lg = (gp - st.gd[i]) / 0.30;
    if (lg < 0) return 0; if (lg > 1) lg = 1;
    return lg * lg * (3 - 2 * lg);
  }
  function archiveRain(g, s, st, dt) {
    const H = s.h, ROWH = 26, R = st.rain;
    for (let i = 0; i < R.length; i++) {
      const c = R[i];
      c.y += c.vy * dt;
      if (c.y > H + ROWH * 4) c.y = -ROWH * (2 + (c.seed % 5));
      for (let k = 0; k < 7; k++) {
        const my = c.y - k * ROWH;
        if (my < -6 || my > H + 6) continue;
        const a = (1 - k / 7) * 0.14, kind = (k + c.seed) % 3;
        g.fillStyle = 'rgba(236,194,122,' + a.toFixed(3) + ')';
        if (kind === 0) g.fillRect(c.x - 3, my, 6, 1.4);
        else if (kind === 1) { g.beginPath(); g.arc(c.x, my, 1.1, 0, 7); g.fill(); }
        else g.fillRect(c.x - 0.7, my - 3, 1.4, 6);
      }
    }
  }
  function archiveDrawFan(g, st, gp, cp, bp) {
    const n = st.count, cx = st.cx, cy = st.cy;
    cx[0] = st.ax[0]; cy[0] = st.ay[0];      /* prepass: grow each branch from its parent's live tip */
    for (let i = 1; i < n; i++) {
      const p = st.parent[i], lg = archiveGrow(st, i, gp);
      cx[i] = cx[p] + (st.ax[i] - cx[p]) * lg;
      cy[i] = cy[p] + (st.ay[i] - cy[p]) * lg;
    }
    for (let i = 1; i < n; i++) {            /* pass 1: every branch, weight -> brightness/width */
      const lg = archiveGrow(st, i, gp); if (lg <= 0.002) continue;
      const p = st.parent[i]; let a, lw;
      if (st.br[i]) { a = 0.72 + 0.28 * bp; lw = 1.7 + st.wt[i] * 2.4; g.strokeStyle = 'rgba(255,224,158,' + a.toFixed(3) + ')'; }
      else {
        a = (0.10 + st.wt[i] * 0.5) * (1 - cp); if (a <= 0.004) continue;
        lw = 0.5 + st.wt[i] * 2.1; const wm = st.wt[i];
        g.strokeStyle = 'rgba(' + ((142 + 94 * wm) | 0) + ',' + ((162 + 32 * wm) | 0) + ',' + ((232 - 110 * wm) | 0) + ',' + a.toFixed(3) + ')';
      }
      g.lineWidth = lw;
      g.beginPath(); g.moveTo(cx[p], cy[p]); g.lineTo(cx[i], cy[i]); g.stroke();
    }
    g.shadowColor = 'rgba(255,214,140,0.9)'; g.shadowBlur = 8;   /* pass 2: the chosen path burns */
    g.strokeStyle = 'rgba(255,236,190,' + (0.55 + 0.35 * bp).toFixed(3) + ')'; g.lineWidth = 1.4;
    for (let i = 1; i < n; i++) {
      if (!st.br[i]) continue; const lg = archiveGrow(st, i, gp); if (lg <= 0.02) continue;
      const p = st.parent[i];
      g.beginPath(); g.moveTo(cx[p], cy[p]); g.lineTo(cx[i], cy[i]); g.stroke();
    }
    g.shadowBlur = 0;
    const gl = archiveGlow();                /* pass 3: glow at the lit nodes */
    for (let i = 0; i < n; i++) {
      if (!st.br[i]) continue; const lg = i === 0 ? 1 : archiveGrow(st, i, gp); if (lg <= 0.05) continue;
      const sz = (i === 0 ? 30 : 12 + st.depth[i] * 2.5) * (0.7 + 0.35 * bp);
      g.globalAlpha = (0.45 + 0.45 * bp) * lg;
      g.drawImage(gl, cx[i] - sz / 2, cy[i] - sz / 2, sz, sz);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < n; i++) {             /* pass 4: node markers */
      const lg = i === 0 ? 1 : archiveGrow(st, i, gp); if (lg <= 0.08) continue;
      const br = st.br[i]; let a = br ? 0.9 : (0.25 + st.wt[i] * 0.5) * (1 - cp); if (a <= 0.02) continue;
      g.fillStyle = br ? 'rgba(255,240,205,' + a.toFixed(3) + ')' : 'rgba(236,194,122,' + a.toFixed(3) + ')';
      g.beginPath(); g.arc(cx[i], cy[i], br ? 2.2 : 1 + st.wt[i] * 1.4, 0, 7); g.fill();
    }
  }
  function archiveShimmer(g, st, clock) {     /* the dice-shimmer of a re-roll */
    const n = st.count; g.fillStyle = 'rgba(255,240,200,0.9)';
    for (let s2 = 0; s2 < 16; s2++) {
      const i = (Math.random() * n) | 0, r = 1 + Math.random() * 2;
      g.fillRect(st.ax[i] + (Math.random() - 0.5) * 10 - r, st.ay[i] + (Math.random() - 0.5) * 10 - r, r * 2, r * 2);
    }
  }
  fx.archive = {
    init(s) {
      const st = archiveMakeState(s.w, s.h);
      archiveBuildFan(s, st);
      return st;
    },
    frame(s, st, dt, clock) {
      const g = s.g;
      g.clearRect(0, 0, s.w, s.h);
      if (st.cycleT0 < 0) st.cycleT0 = clock;
      archiveRain(g, s, st, dt);
      if (st.shimmer >= 0 && clock - st.shimmer >= 520) { archiveBuildFan(s, st); st.cycleT0 = clock; st.shimmer = -1; }
      let el = clock - st.cycleT0, gp, cp;
      if (el >= st.DUR) { archiveBuildFan(s, st); st.cycleT0 = clock; el = 0; }   /* collapse -> new root */
      if (el < st.GROW) { gp = el / st.GROW; cp = 0; }
      else if (el < st.HOLD) { gp = 1; cp = 0; }
      else { gp = 1; cp = (el - st.HOLD) / (st.DUR - st.HOLD); }
      const bp = 0.5 + 0.5 * Math.sin(clock * 0.004);
      archiveDrawFan(g, st, gp, cp, bp);
      if (st.shimmer >= 0) archiveShimmer(g, st, clock);
      if (st.chooseAt && clock - st.chooseAt < 700) {   /* the chosen record flares */
        const k = (clock - st.chooseAt) / 700, i = st.chooseI;
        const sz = 46 * (1 - k * 0.4);
        g.globalAlpha = (1 - k) * 0.9;
        g.drawImage(archiveGlow(), st.cx[i] - sz / 2, st.cy[i] - sz / 2, sz, sz);
        g.globalAlpha = 1;
      }
    },
    /* the verb: CHOOSE THE FUTURE. Touch a branch and the gold path
       re-burns through the record you chose — the archive re-reads
       tomorrow through YOUR node. Touch the empty stacks and a new
       question is planted there instead: the fan re-roots at your hand. */
    verb(s, st, x, y, clock) {
      let best = -1, bd = 42 * 42;
      for (let i = 1; i < st.count; i++) {
        const dx = st.cx[i] - x, dy = st.cy[i] - y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = i; }
      }
      if (best > 0) {
        for (let i = 1; i < st.count; i++) st.br[i] = 0;
        for (let n2 = best; n2 > 0; n2 = st.parent[n2]) st.br[n2] = 1;   /* your ancestry lights */
        let cur = best;                                 /* and the future runs on from your choice */
        for (;;) {
          let nb = -1, bw = -1;
          for (let i = cur + 1; i < st.count; i++) if (st.parent[i] === cur && st.wt[i] > bw) { bw = st.wt[i]; nb = i; }
          if (nb < 0) break;
          st.br[nb] = 1; cur = nb;
        }
        st.cycleT0 = clock - st.GROW;                   /* fully grown; a fresh hold to admire it */
        st.shimmer = -1;
        st.chooseAt = clock; st.chooseI = best;
      } else {
        st.rerootX = Math.max(s.w * 0.15, Math.min(s.w * 0.85, x));
        st.shimmer = clock;                             /* dice-shimmer, then the fan re-roots there */
      }
      verbEvent('consult');
    },
    rm() {                                     /* designed static pose: one grown fan, chosen path lit */
      const c = document.querySelector('[data-canvas="archive"]');
      if (!c || !c.parentElement) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const r = c.parentElement.getBoundingClientRect();
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const s = { w: r.width, h: r.height }, st = archiveMakeState(r.width, r.height);
      archiveBuildFan(s, st);
      g.clearRect(0, 0, r.width, r.height);
      archiveRain(g, s, st, 0);
      archiveDrawFan(g, st, 1, 0, 1);
    },
  };
  /* the toy: "Consult the archive" re-rolls the fan with a dice-shimmer and a new bright path */
  const consultBtn = document.getElementById('consult-archive');
  if (consultBtn) {
    consultBtn.addEventListener('click', () => {
      window.Orrery.events.dispatchEvent(new CustomEvent('consult'));
      if (window.Orrery.reduced()) { fx.archive.rm && fx.archive.rm(); return; }   /* rm: repaint a fresh frozen fan */
      if (activeName === 'archive' && activeState) activeState.shimmer = window.Orrery.ticker.clock;
    });
  }

  /* ============================================================
     THE DRILLYARD: zero-g formation drills inside the practice cube
     caps: 21 lights (3 squads x 7) · 1 lance · 8 corners · 5 gate pts
     zero per-frame alloc · zero gradients · every ~20s the arena turns
     and a different face becomes down (down is a direction you choose)
     ============================================================ */
  const DY_F = 4.2;
  const DY_CORN = new Float32Array([-1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1, -1,-1,1, 1,-1,1, 1,1,1, -1,1,1]);
  const DY_EDGE = [0,1, 1,2, 2,3, 3,0, 4,5, 5,6, 6,7, 7,4, 0,4, 1,5, 2,6, 3,7];
  const DY_FACE = [[0,1,2,3], [4,5,6,7], [0,1,5,4], [3,2,6,7], [0,3,7,4], [1,2,6,5]];
  const DY_FNORM = [[0,0,-1], [0,0,1], [0,-1,0], [0,1,0], [-1,0,0], [1,0,0]];
  const DY_GATE = new Float32Array([0.26,0,1, 0,0.26,1, -0.26,0,1, 0,-0.26,1, 0,0,1]);
  const DY_HUE = ['127,178,229', '102,255,158', '255,196,94'];
  let dyLive = null, dyRmForm = 0;

  function dyBuild(w, h) {
    const L = new Array(21);
    for (let i = 0; i < 21; i++) L[i] = {
      sq: (i / 7) | 0, j: i % 7,
      x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0,
      sx: 0, sy: 0, sc: 1,
      frozen: false, thawAt: 0, rescuer: -1, rescuing: -1, flash: 0,
      fvx: 0, fvy: 0, fvz: 0,
    };
    const shell = new Float32Array(63);                /* golden-angle hull, baked once */
    for (let i = 0; i < 21; i++) {
      const t = (i + 0.5) / 21, y = 1 - 2 * t, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.399963;
      shell[i * 3] = Math.cos(a) * r * 0.62; shell[i * 3 + 1] = y * 0.62; shell[i * 3 + 2] = Math.sin(a) * r * 0.62;
    }
    return {
      w, h, L, shell,
      cx: w / 2, cy: h * 0.46, S: Math.min(w, h) * 0.36,
      px: new Float32Array(8), py: new Float32Array(8), pz: new Float32Array(8),
      gx: new Float32Array(5), gy: new Float32Array(5),
      pit: 0.35, yaw: 0.65, tpit: 0.35, tyaw: 0.65,
      cosy: 1, siny: 0, cosx: 1, sinx: 0,
      form: 0, nextForm: -1, nextTurn: -1, nextLance: -1,
      lance: { on: false, t0: 0, a: 0, b: 0 },
    };
  }

  function dySetForm(st, f) {
    st.form = f;
    const L = st.L;
    if (f === 0) {                                     /* wedge: each squad owns its own plane; the apex leads */
      for (let i = 0; i < 21; i++) {
        const q = L[i], k = (q.j + 1) >> 1, side = (q.j & 1) ? 1 : -1;
        const lat = q.j === 0 ? 0 : side * 0.15 * k;
        const back = 0.17 * (q.j === 0 ? 0 : k);
        if (q.sq === 0)      { q.tx = 0.30 - back; q.ty = -0.42; q.tz = lat; }
        else if (q.sq === 1) { q.tx = lat; q.ty = 0.30 - back; q.tz = 0.42; }
        else                 { q.tx = 0.42; q.ty = lat; q.tz = 0.30 - back; }
      }
    } else if (f === 1) {                              /* sphere-shell: one shared hull, squads interleaved */
      for (let i = 0; i < 21; i++) { const q = L[i]; q.tx = st.shell[i*3]; q.ty = st.shell[i*3+1]; q.tz = st.shell[i*3+2]; }
    } else if (f === 2) {                              /* scatter-and-freeze: new ground every call, then hold */
      for (let i = 0; i < 21; i++) { const q = L[i];
        q.tx = (Math.random() * 2 - 1) * 0.72; q.ty = (Math.random() * 2 - 1) * 0.72; q.tz = (Math.random() * 2 - 1) * 0.72; }
    } else {                                           /* converge: one file through the marked gate */
      for (let i = 0; i < 21; i++) { const q = L[i], o = q.sq * 7 + q.j;
        q.tx = (o & 1) ? 0.05 : -0.05; q.ty = ((o % 3) - 1) * 0.05; q.tz = 0.92 - o * 0.075; }
    }
  }

  function dyDraw(g, st, clock) {
    g.clearRect(0, 0, st.w, st.h);
    st.cosy = Math.cos(st.yaw); st.siny = Math.sin(st.yaw);
    st.cosx = Math.cos(st.pit); st.sinx = Math.sin(st.pit);
    const cy2 = st.cosy, sy2 = st.siny, cx2 = st.cosx, sx2 = st.sinx;
    const S2 = st.S, cx3 = st.cx, cy3 = st.cy;

    for (let i = 0; i < 8; i++) {
      const x = DY_CORN[i*3], y = DY_CORN[i*3+1], z = DY_CORN[i*3+2];
      const x1 = x * cy2 + z * sy2, z1 = z * cy2 - x * sy2;
      const y1 = y * cx2 - z1 * sx2, z2 = y * sx2 + z1 * cx2;
      const sc = DY_F / (DY_F + z2);
      st.px[i] = cx3 + x1 * sc * S2; st.py[i] = cy3 + y1 * sc * S2; st.pz[i] = z2;
    }

    /* the chosen floor: whichever face is most "down" right now wears the amber */
    let df = 0, best = -2;
    for (let f = 0; f < 6; f++) {
      const nx = DY_FNORM[f][0], ny = DY_FNORM[f][1], nz = DY_FNORM[f][2];
      const z1 = nz * cy2 - nx * sy2;
      const y1 = ny * cx2 - z1 * sx2;
      if (y1 > best) { best = y1; df = f; }
    }
    const F4 = DY_FACE[df];
    g.fillStyle = 'rgba(255,196,94,0.05)';
    g.beginPath(); g.moveTo(st.px[F4[0]], st.py[F4[0]]);
    for (let i = 1; i < 4; i++) g.lineTo(st.px[F4[i]], st.py[F4[i]]);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,196,94,0.14)'; g.lineWidth = 1; g.stroke();

    /* the practice cube: far edges faint, near edges awake */
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(127,178,229,0.18)';
    g.beginPath();
    for (let e = 0; e < 24; e += 2) {
      const a = DY_EDGE[e], b = DY_EDGE[e + 1];
      if (st.pz[a] + st.pz[b] < 0) continue;
      g.moveTo(st.px[a], st.py[a]); g.lineTo(st.px[b], st.py[b]);
    }
    g.stroke();
    g.strokeStyle = 'rgba(127,178,229,0.45)';
    g.beginPath();
    for (let e = 0; e < 24; e += 2) {
      const a = DY_EDGE[e], b = DY_EDGE[e + 1];
      if (st.pz[a] + st.pz[b] >= 0) continue;
      g.moveTo(st.px[a], st.py[a]); g.lineTo(st.px[b], st.py[b]);
    }
    g.stroke();
    g.fillStyle = 'rgba(127,178,229,0.5)';
    for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(st.px[i], st.py[i], 1.6, 0, 7); g.fill(); }

    /* the gate: marked on one face; it dims when the face turns away */
    for (let i = 0; i < 5; i++) {
      const x = DY_GATE[i*3], y = DY_GATE[i*3+1], z = DY_GATE[i*3+2];
      const x1 = x * cy2 + z * sy2, z1 = z * cy2 - x * sy2;
      const y1 = y * cx2 - z1 * sx2, z2 = y * sx2 + z1 * cx2;
      const sc = DY_F / (DY_F + z2);
      st.gx[i] = cx3 + x1 * sc * S2; st.gy[i] = cy3 + y1 * sc * S2;
    }
    const gA = 0.22 + 0.55 * Math.max(0, -(cy2 * cx2));
    g.strokeStyle = `rgba(255,196,94,${gA.toFixed(3)})`;
    g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(st.gx[0], st.gy[0]);
    g.lineTo(st.gx[1], st.gy[1]); g.lineTo(st.gx[2], st.gy[2]); g.lineTo(st.gx[3], st.gy[3]);
    g.closePath(); g.stroke();
    g.fillStyle = `rgba(255,196,94,${(gA * 0.7).toFixed(3)})`;
    g.beginPath(); g.arc(st.gx[4], st.gy[4], 1.8, 0, 7); g.fill();

    /* squads: project all, then draw per squad so glow batches stay cheap */
    const L = st.L;
    for (let i = 0; i < 21; i++) {
      const q = L[i];
      const x1 = q.x * cy2 + q.z * sy2, z1 = q.z * cy2 - q.x * sy2;
      const y1 = q.y * cx2 - z1 * sx2, z2 = q.y * sx2 + z1 * cx2;
      q.sc = DY_F / (DY_F + z2);
      q.sx = cx3 + x1 * q.sc * S2; q.sy = cy3 + y1 * q.sc * S2;
    }
    g.shadowBlur = 10;
    for (let sq = 0; sq < 3; sq++) {
      g.shadowColor = `rgba(${DY_HUE[sq]},0.85)`;
      g.fillStyle = `rgba(${DY_HUE[sq]},0.95)`;
      for (let i = sq * 7; i < sq * 7 + 7; i++) {
        const q = L[i]; if (q.frozen) continue;
        g.beginPath(); g.arc(q.sx, q.sy, (q.flash > clock ? 3.4 : 2.3) * q.sc, 0, 7); g.fill();
      }
    }
    g.shadowBlur = 0;
    /* frozen cadets: dim, adrift, ringed in ice until a squadmate taps them in */
    for (let i = 0; i < 21; i++) {
      const q = L[i]; if (!q.frozen) continue;
      g.fillStyle = 'rgba(150,165,190,0.35)';
      g.beginPath(); g.arc(q.sx, q.sy, 2 * q.sc, 0, 7); g.fill();
      g.strokeStyle = 'rgba(150,165,190,0.45)'; g.lineWidth = 1;
      g.beginPath(); g.arc(q.sx, q.sy, 4.2 * q.sc, 0, 7); g.stroke();
    }

    /* the practice lance: a brief straight beam between squads */
    const ln = st.lance;
    if (ln.on) {
      const p = Math.min(1, (clock - ln.t0) / 260), aQ = L[ln.a], bQ = L[ln.b];
      const a = Math.sin(Math.PI * p);
      g.strokeStyle = `rgba(${DY_HUE[aQ.sq]},${(0.85 * a).toFixed(3)})`;
      g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(aQ.sx, aQ.sy); g.lineTo(bQ.sx, bQ.sy); g.stroke();
      g.fillStyle = `rgba(230,244,255,${(0.9 * a).toFixed(3)})`;
      g.beginPath(); g.arc(bQ.sx, bQ.sy, 1.5 + 2.5 * p, 0, 7); g.fill();
    }
  }

  fx.drillyard = {
    init(s) {
      const st = dyBuild(s.w, s.h);
      dySetForm(st, 0);
      for (let i = 0; i < 21; i++) {                   /* cadets enter from anywhere; the drill collects them */
        const q = st.L[i];
        q.x = (Math.random() * 2 - 1) * 0.9; q.y = (Math.random() * 2 - 1) * 0.9; q.z = (Math.random() * 2 - 1) * 0.9;
      }
      dyLive = st;
      st.cleanup = () => { if (dyLive === st) dyLive = null; };
      return st;
    },
    frame(s, st, dt, clock) {
      const L = st.L, ln = st.lance;
      if (st.nextForm < 0)  st.nextForm  = clock + 7000;   /* the shared clock never starts at 0 */
      if (st.nextTurn < 0)  st.nextTurn  = clock + 12000;
      if (st.nextLance < 0) st.nextLance = clock + 5000;

      /* the arena turns: a new face becomes down, the squads simply agree */
      if (clock >= st.nextTurn) {
        st.nextTurn = clock + 19000 + Math.random() * 5000;
        if (Math.random() < 0.5) st.tpit += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
        else st.tyaw += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      }
      st.yaw += dt * 0.000012; st.tyaw += dt * 0.000012;   /* the idle creep rides both, so easing stays true */
      const rk = 1 - Math.exp(-dt / 1400);
      st.pit += (st.tpit - st.pit) * rk;
      st.yaw += (st.tyaw - st.yaw) * rk;

      if (clock >= st.nextForm) { dySetForm(st, (st.form + 1) & 3); st.nextForm = clock + 8500 + Math.random() * 2500; }

      /* fire a lance: shooter squad, victim in another squad, at most two iced */
      if (!ln.on && clock >= st.nextLance) {
        st.nextLance = clock + 4200 + Math.random() * 3600;
        let nf = 0; for (let i = 0; i < 21; i++) if (L[i].frozen) nf++;
        if (nf < 2) {
          const sa = (Math.random() * 3) | 0, sb = (sa + 1 + ((Math.random() * 2) | 0)) % 3;
          let a = -1, seen = 0;
          for (let i = sa * 7; i < sa * 7 + 7; i++) { const q = L[i]; if (!q.frozen && q.rescuing < 0) { seen++; if (Math.random() < 1 / seen) a = i; } }
          let b = -1; seen = 0;
          for (let i = sb * 7; i < sb * 7 + 7; i++) { const q = L[i]; if (!q.frozen && q.rescuing < 0) { seen++; if (Math.random() < 1 / seen) b = i; } }
          if (a >= 0 && b >= 0) { ln.on = true; ln.t0 = clock; ln.a = a; ln.b = b; }
        }
      }
      if (ln.on && clock - ln.t0 >= 260) {
        ln.on = false;
        const v = L[ln.b];
        if (!v.frozen) {                               /* the hit lands: dim, adrift, out of the drill */
          v.frozen = true; v.thawAt = clock + 12000; v.rescuer = -1;
          v.fvx = (Math.random() - 0.5) * 0.00008; v.fvy = (Math.random() - 0.5) * 0.00008; v.fvz = (Math.random() - 0.5) * 0.00008;
          for (let k = 1; k < 7; k++) {                /* a squadmate peels off to tap them back in */
            const ri = v.sq * 7 + ((v.j + k) % 7), c = L[ri];
            if (!c.frozen && c.rescuing < 0) { c.rescuing = ln.b; v.rescuer = ri; break; }
          }
        }
      }

      const mk = 1 - Math.exp(-dt / 340);
      for (let i = 0; i < 21; i++) {
        const q = L[i];
        if (q.frozen) {
          q.x += q.fvx * dt; q.y += q.fvy * dt; q.z += q.fvz * dt;
          if (q.x > 0.95 || q.x < -0.95) q.fvx = -q.fvx;
          if (q.y > 0.95 || q.y < -0.95) q.fvy = -q.fvy;
          if (q.z > 0.95 || q.z < -0.95) q.fvz = -q.fvz;
          if (clock >= q.thawAt) {                     /* failsafe thaw so a bad day never strands a cadet */
            q.frozen = false;
            if (q.rescuer >= 0) { L[q.rescuer].rescuing = -1; q.rescuer = -1; }
          }
          continue;
        }
        let tx = q.tx, ty = q.ty, tz = q.tz;
        if (q.rescuing >= 0) {
          const v = L[q.rescuing];
          if (!v.frozen) q.rescuing = -1;
          else {
            tx = v.x; ty = v.y; tz = v.z;
            const dx = v.x - q.x, dy = v.y - q.y, dz = v.z - q.z;
            if (dx * dx + dy * dy + dz * dz < 0.012) { /* the tap: back in the drill */
              v.frozen = false; v.rescuer = -1; v.flash = clock + 500;
              q.flash = clock + 300; q.rescuing = -1;
            }
          }
        }
        q.x += (tx - q.x) * mk; q.y += (ty - q.y) * mk; q.z += (tz - q.z) * mk;
      }

      dyDraw(s.g, st, clock);
    },
    /* the verb: YOU are the drill instructor. Tap a frozen cadet and your
       hand taps them back in — no waiting for the rescue. Strike anywhere
       else and that point becomes the RALLY: all three squads break and
       re-form around it (down is a direction you choose; so is together). */
    verb(s, st, x, y, clock) {
      const L = st.L;
      for (let i = 0; i < 21; i++) {                    /* the mercy tap comes first */
        const q = L[i];
        if (!q.frozen) continue;
        const dx = q.sx - x, dy = q.sy - y;
        if (dx * dx + dy * dy < 400) {
          q.frozen = false; q.flash = clock + 500;
          if (q.rescuer >= 0) { L[q.rescuer].rescuing = -1; q.rescuer = -1; }
          verbEvent('drill');
          return;
        }
      }
      /* unproject the strike onto the camera's mid-plane (z'=0, where the
         projection scale is exactly 1), then undo pitch and yaw */
      const x1 = (x - st.cx) / st.S, y1 = (y - st.cy) / st.S;
      const wy = Math.max(-0.8, Math.min(0.8, y1 * st.cosx));
      const z1 = -y1 * st.sinx;
      const wx = Math.max(-0.8, Math.min(0.8, x1 * st.cosy - z1 * st.siny));
      const wz = Math.max(-0.8, Math.min(0.8, x1 * st.siny + z1 * st.cosy));
      for (let i = 0; i < 21; i++) {                    /* a tight shell around the rally point */
        const q = L[i];
        q.tx = Math.max(-0.9, Math.min(0.9, wx + st.shell[i * 3] * 0.55));
        q.ty = Math.max(-0.9, Math.min(0.9, wy + st.shell[i * 3 + 1] * 0.55));
        q.tz = Math.max(-0.9, Math.min(0.9, wz + st.shell[i * 3 + 2] * 0.55));
        if (!q.frozen) q.flash = clock + 400;           /* the squads acknowledge the order */
      }
      st.nextForm = clock + 7000;                       /* the drills resume on their own clock */
      verbEvent('drill');
    },
    rm() {                                             /* the held pose: mid-turn, wedges locked, one cadet adrift */
      const c = document.querySelector('[data-canvas="drillyard"]');
      if (!c || !c.parentElement) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const r = c.parentElement.getBoundingClientRect();
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const st = dyBuild(r.width, r.height);
      dySetForm(st, dyRmForm);
      for (let i = 0; i < 21; i++) { const q = st.L[i]; q.x = q.tx; q.y = q.ty; q.z = q.tz; }
      st.pit = 0.62; st.yaw = 0.78;
      const fz = st.L[16];
      fz.frozen = true; fz.x += 0.34; fz.y -= 0.22; fz.z += 0.18;
      dyDraw(g, st, 0);
    },
  };
  const callDrill = document.getElementById('call-drill');
  if (callDrill) {
    callDrill.addEventListener('click', () => {
      if (dyLive) {                                    /* live arena: the next drill starts now */
        dySetForm(dyLive, (dyLive.form + 1) & 3);
        dyLive.nextForm = window.Orrery.ticker.clock + 8500;
        const now = window.Orrery.ticker.clock;        /* the squads snap-acknowledge the order —
                                                          the timer's automatic cycle never does this */
        for (let i = 0; i < 21; i++) dyLive.L[i].flash = now + 400;
      } else if (window.Orrery.reduced()) {            /* rm: swap the held pose, one repaint, no motion */
        dyRmForm = (dyRmForm + 1) & 3;
        fx.drillyard.rm();
      }
      window.Orrery.events.dispatchEvent(new CustomEvent('drill'));
    });
  }

  /* ============================================================
     STORMWALL: the living weather — wall transit, light INSIDE the
     wall, spark streams ahead of it, shelled flora that trusts the calm
     caps: wall 3 polylines x 26 rows · sparks 90 · flashes 4 · buds 4
     ============================================================ */
  let stormCtl = null;                                 /* the toy's line to the live state */
  const SW_ROWS = 26;
  const SW_LAYERS = [                                  /* the pale fringe leads; the dark core follows */
    { off: -74, col: 'rgba(46,52,78,0.88)', a1: 46, k1: 5.1, w1: 0.00050, p1: 0.7, a2: 22, k2: 11.0, w2: 0.00034, p2: 3.1 },
    { off: -34, col: 'rgba(30,34,56,0.94)', a1: 38, k1: 6.3, w1: 0.00043, p1: 2.9, a2: 18, k2: 13.0, w2: 0.00047, p2: 0.4 },
    { off:   0, col: 'rgba(17,19,34,0.97)', a1: 30, k1: 7.4, w1: 0.00056, p1: 5.0, a2: 14, k2: 16.0, w2: 0.00039, p2: 1.8 },
  ];
  const SW_FLK = [0.9, 0.25, 0.7, 0.3, 0.12, 0.05];    /* stutter envelope: two crests, strobe-safe */
  function swGlow() {                                  /* interior-light sprite: baked ONCE per init */
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 8, 128, 128, 128);
    g.addColorStop(0, 'rgba(226,236,255,0.85)');
    g.addColorStop(0.3, 'rgba(201,182,255,0.42)');
    g.addColorStop(0.7, 'rgba(150,140,235,0.12)');
    g.addColorStop(1, 'rgba(150,140,235,0)');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    return c;
  }
  function swSpawn(st, x, hY, mode) {
    for (const q of st.sparks) {
      if (q.on) continue;
      q.on = true; q.mode = mode; q.life = 0; q.seed = Math.random() * 7;
      if (mode === 1) {                                /* storm: race left, low over the plain */
        q.x = x + Math.random() * 40;
        q.baseY = hY - 8 - Math.random() * 104;
        q.y = q.baseY;
        q.vx = -(0.26 + Math.random() * 0.22); q.vy = 0;
        q.max = 1;
      } else {                                         /* calm: the plain holds its breath */
        q.x = x; q.y = hY - 2;
        q.vx = 0; q.vy = -(0.016 + Math.random() * 0.030);
        q.max = 5200 + Math.random() * 2600;
      }
      return;
    }
  }
  function swBud(g, b, glow) {
    const r = b.r, o = b.o, h = r * (0.52 + 0.44 * o); /* the dome rises as it opens */
    g.fillStyle = 'rgba(10,8,20,0.97)';
    g.beginPath();                                     /* side shells part outward with o */
    g.ellipse(b.x - r * (0.34 + 0.30 * o), b.y, r * 0.62, h * 0.82, -0.22 - 0.5 * o, Math.PI, 0);
    g.lineTo(b.x, b.y); g.closePath(); g.fill();
    g.beginPath();
    g.ellipse(b.x + r * (0.34 + 0.30 * o), b.y, r * 0.62, h * 0.82, 0.22 + 0.5 * o, Math.PI, 0);
    g.lineTo(b.x, b.y); g.closePath(); g.fill();
    g.beginPath();
    g.ellipse(b.x, b.y, r * 0.78, h, 0, Math.PI, 0);
    g.closePath(); g.fill();
    const tip = Math.min(0.85, 0.12 + 0.55 * o + glow * 0.3);   /* the kept light */
    g.fillStyle = 'rgba(207,230,255,' + tip.toFixed(3) + ')';
    g.beginPath(); g.arc(b.x, b.y - h - 2 - 3 * o, 1.6 + o, 0, 7); g.fill();
  }
  fx.storm = {
    init(s) {
      const W = s.w, H = s.h, hY = H * 0.80;           /* must match .sw-sky's 80% ground stop */
      const WW = W * 1.3;
      const sparks = new Array(90);
      for (let i = 0; i < sparks.length; i++) sparks[i] = { on: false, mode: 0, x: 0, y: 0, vx: 0, vy: 0, baseY: 0, life: 0, max: 1, seed: 0 };
      const flashes = new Array(4);
      for (let i = 0; i < flashes.length; i++) flashes[i] = { on: false, rel: 0, y: 0, r: 0, t0: 0, dur: 1 };
      const st = {
        hY, WW,
        edge: new Float32Array(SW_ROWS + 1),           /* scratch rows, reused every frame */
        sparks, flashes,
        rocks: [                                       /* the unseen stones the sparks curl around */
          { x: W * 0.26, y: hY - 26, pol: 1 },
          { x: W * 0.50, y: hY - 46, pol: -1 },
          { x: W * 0.72, y: hY - 18, pol: 1 },
        ],
        buds: [
          { x: W * 0.15, y: hY + (H - hY) * 0.30, r: Math.max(20, W * 0.022), o: 1, seed: 0.0 },
          { x: W * 0.40, y: hY + (H - hY) * 0.62, r: Math.max(30, W * 0.034), o: 1, seed: 1.9 },
          { x: W * 0.62, y: hY + (H - hY) * 0.42, r: Math.max(24, W * 0.027), o: 1, seed: 4.2 },
          { x: W * 0.87, y: hY + (H - hY) * 0.76, r: Math.max(34, W * 0.040), o: 1, seed: 2.8 },
        ],
        glow: swGlow(),
        storm: false, t0: 0, dur: 15000,
        travel: W + WW + 320,                          /* front start -> trailing exit */
        next: -1, nextFlash: 0, flashGlow: 0, sparkAcc: 0, calmAcc: 0,
      };
      stormCtl = {
        summon() {
          if (st.storm) { st.nextFlash = 0; return; }  /* mid-transit: it answers with light */
          st.next = 0;                                 /* calm: the wall comes now */
        },
      };
      st.cleanup = () => { stormCtl = null; };
      return st;
    },
    frame(s, st, dt, clock) {
      const g = s.g, W = s.w, H = s.h, hY = st.hY;
      g.clearRect(0, 0, W, H);
      if (st.next < 0) st.next = clock + 6000;         /* the first front is already close */

      if (!st.storm && clock >= st.next) { st.storm = true; st.t0 = clock; }
      let frontX = W + 160, trailX = frontX + st.WW;   /* parked off-right during calm */
      if (st.storm) {
        const p = (clock - st.t0) / st.dur;
        if (p >= 1) { st.storm = false; st.next = clock + 17000 + Math.random() * 6000; }   /* ~35s bell to bell */
        else { frontX = (W + 160) - p * st.travel; trailX = frontX + st.WW; }
      }
      const wallOn = frontX < W + 120 && trailX > -120;

      /* the wall: three churning silhouettes; flat fills, zero gradients */
      if (wallOn) {
        for (let L = 0; L < 3; L++) {
          const ly = SW_LAYERS[L], E = st.edge;
          for (let r2 = 0; r2 <= SW_ROWS; r2++) {
            const yn = r2 / SW_ROWS;
            E[r2] = frontX + ly.off
              + ly.a1 * Math.sin(yn * ly.k1 + clock * ly.w1 + ly.p1)
              + ly.a2 * Math.sin(yn * ly.k2 - clock * ly.w2 + ly.p2);
          }
          const tx = Math.min(trailX + ly.off * 0.5, W + 140);
          g.fillStyle = ly.col;
          g.beginPath();
          g.moveTo(E[0], -6);
          for (let r2 = 1; r2 <= SW_ROWS; r2++) g.lineTo(E[r2], -6 + (hY + 6) * (r2 / SW_ROWS));
          g.lineTo(tx, hY); g.lineTo(tx, -6);
          g.closePath(); g.fill();
          if (L === 0) {                               /* pale light rides the leading face */
            g.strokeStyle = 'rgba(201,182,255,' + (0.10 + st.flashGlow * 0.22).toFixed(3) + ')';
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(E[0], -6);
            for (let r2 = 1; r2 <= SW_ROWS; r2++) g.lineTo(E[r2], -6 + (hY + 6) * (r2 / SW_ROWS));
            g.stroke();
          }
        }
      }

      /* lightning INSIDE the wall: glow pulses only, never a drawn bolt */
      if (st.storm && wallOn && clock >= st.nextFlash) {
        for (const f of st.flashes) {
          if (f.on) continue;
          f.on = true; f.t0 = clock; f.dur = 300 + Math.random() * 140;
          f.rel = 90 + Math.random() * Math.min(st.WW - 180, W * 0.8);
          f.y = hY * (0.12 + Math.random() * 0.5);
          f.r = 90 + Math.random() * 110;
          break;
        }
        st.nextFlash = clock + 900 + Math.random() * 1600;   /* >=0.9s apart: strobe-safe */
      }
      let glowNow = 0;
      g.globalCompositeOperation = 'lighter';
      for (const f of st.flashes) {
        if (!f.on) continue;
        const k = (clock - f.t0) / f.dur;
        if (k >= 1) { f.on = false; continue; }
        const a = SW_FLK[(k * 6) | 0];
        if (a > glowNow) glowNow = a;
        const x = frontX + f.rel;                      /* the light rides with the wall */
        if (x > -f.r && x < W + f.r) {
          g.globalAlpha = a * 0.85;
          g.drawImage(st.glow, x - f.r, f.y - f.r, f.r * 2, f.r * 2);
          g.globalAlpha = a * 0.2;                     /* the plain remembers the light */
          g.drawImage(st.glow, x - f.r * 1.6, hY - f.r * 0.22, f.r * 3.2, f.r * 0.7);
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      st.flashGlow = glowNow;

      /* sparks: the light runs ahead of the weather */
      if (st.storm && frontX > -80) {
        st.sparkAcc += dt;
        while (st.sparkAcc > 26) { st.sparkAcc -= 26; swSpawn(st, Math.min(frontX - 10, W + 26), hY, 1); }
      } else if (!st.storm) {
        st.sparkAcc = 0;
        st.calmAcc += dt;
        if (st.calmAcc > 620) { st.calmAcc = 0; swSpawn(st, Math.random() * W, hY, 0); }
      } else st.sparkAcc = 0;
      g.strokeStyle = 'rgba(191,220,255,0.75)';
      g.lineWidth = 1.4;
      g.beginPath();
      for (const q of st.sparks) {
        if (!q.on || q.mode !== 1) continue;
        for (const rk of st.rocks) {                   /* curl around the unseen stones */
          const dx = q.x - rk.x, dy = q.y - rk.y;
          if (dx > -14 && dx < 90 && dy > -48 && dy < 48)
            q.vy += rk.pol * (1 - Math.abs(dy) / 48) * 0.0011 * dt;
        }
        q.vy += (q.baseY - q.y) * 0.000016 * dt;       /* spring back to its lane */
        q.vy *= 1 - 0.0015 * dt;
        q.x += q.vx * dt; q.y += q.vy * dt;
        if (q.x < -40) { q.on = false; continue; }
        g.moveTo(q.x, q.y);
        g.lineTo(q.x - q.vx * 46, q.y - q.vy * 46);
      }
      g.stroke();
      g.fillStyle = 'rgba(236,244,255,0.9)';
      for (const q of st.sparks) { if (q.on && q.mode === 1) g.fillRect(q.x - 1, q.y - 1, 2, 2); }
      g.fillStyle = 'rgba(207,230,255,1)';
      for (const q of st.sparks) {                     /* between storms: sparse risers */
        if (!q.on || q.mode !== 0) continue;
        q.life += dt;
        const k = q.life / q.max;
        if (k >= 1) { q.on = false; continue; }
        q.y += q.vy * dt;
        q.x += Math.sin(clock * 0.0011 + q.seed) * 0.02 * dt;
        g.globalAlpha = 0.55 * Math.sin(Math.PI * k);
        g.beginPath(); g.arc(q.x, q.y, 1.4, 0, 7); g.fill();
      }
      g.globalAlpha = 1;

      /* the shelled flora: it closes before the wall, reopens after */
      for (const b of st.buds) {
        const closing = st.storm && frontX < b.x + 240 + b.seed * 40 && trailX > b.x - 200;
        const tau = closing ? 700 : 2600;              /* tuck fast; trust slowly */
        b.o += ((closing ? 0.06 : 1) - b.o) * (1 - Math.exp(-dt / tau));
        swBud(g, b, glowNow);
      }
    },
    rm() { /* intentional no-op: the frozen pose is the .sw-static SVG (aurora precedent) */ },
    /* the verb: the weather answers the hand. Strike INTO the wall and the
       light cracks exactly where you pointed (never faster than the strobe
       law allows), sparks scattering off the blow. Touch the calm plain and
       the nearest shelled bud flinches shut, risers lift off your finger,
       and the nearest unseen stone MOVES to where you touched — the spark
       streams will curl around it on the next transit. */
    verb(s, st, x, y, clock) {
      let frontX = s.w + 160;
      if (st.storm) {
        const p = (clock - st.t0) / st.dur;
        if (p < 1) frontX = (s.w + 160) - p * st.travel;
      }
      if (st.storm && x > frontX - 60) {                /* the strike lands inside the wall */
        if (clock - (st.lastStrike || -9e9) >= 900) {   /* the strobe law holds for the hand too */
          st.lastStrike = clock;
          for (const f of st.flashes) {
            if (f.on) continue;
            f.on = true; f.t0 = clock; f.dur = 340;
            f.rel = Math.max(60, Math.min(st.WW - 120, x - frontX));
            f.y = Math.max(20, Math.min(st.hY * 0.72, y));
            f.r = 110 + Math.random() * 80;
            break;
          }
        }
        for (let i = 0; i < 6; i++)                     /* sparks scatter off the blow */
          swSpawn(st, Math.min(x, s.w + 26), st.hY, 1);
      } else {                                          /* the calm plain, disturbed */
        let nb = null, bd = 1e9;
        for (const b of st.buds) {
          const d = Math.abs(b.x - x);
          if (d < bd) { bd = d; nb = b; }
        }
        if (nb) nb.o = Math.min(nb.o, 0.22);            /* the nearest bud flinches, then trusts again */
        let nr = null, rd = 1e9;
        for (const rk of st.rocks) {
          const d = Math.abs(rk.x - x);
          if (d < rd) { rd = d; nr = rk; }
        }
        if (nr) {                                       /* the stone answers to where you touched */
          nr.x = Math.max(30, Math.min(s.w - 30, x));
          nr.y = Math.max(st.hY - 60, Math.min(st.hY - 10, y));
          nr.pol = -nr.pol;
        }
        for (let i = 0; i < 4; i++) swSpawn(st, x + (Math.random() - 0.5) * 30, st.hY, 0);
      }
      verbEvent('storm');
    },
  };
  const braceWall = document.getElementById('brace-wall');
  if (braceWall) {
    const stormScene = document.getElementById('world-stormwall');
    braceWall.addEventListener('click', () => {
      stormScene.classList.remove('is-bracing');
      void stormScene.offsetWidth;                     /* restartable */
      stormScene.classList.add('is-bracing');
      if (stormCtl) stormCtl.summon();
      window.Orrery.events.dispatchEvent(new CustomEvent('storm'));
      setTimeout(() => stormScene.classList.remove('is-bracing'), 1400);
    });
  }

  /* ============================================================
     THE BEACONS: alpine dusk range + a 7-pyre signal chain
     caps: 5 precomputed ridges + snow Path2Ds · embers 96 · smoke 26 ·
           ash 8 · stars <=90 · mist 18 · clouds 8 · 1 fell shadow ·
           prebaked sprites: glow, moon, mist, cloud, eye
           (no per-frame gradients)
     ============================================================ */
  const BCN_N = 7, BCN_STAGGER = 900, BCN_RISE = 260, BCN_HOLD = 3200,
        BCN_SETTLE = 2600, BCN_GAP = 45000, BCN_EMBER = 0.14,
        BCN_RUN = (BCN_N - 1) * BCN_STAGGER + BCN_HOLD + BCN_SETTLE;   /* one full signal run */
  /* GAP 45s, not 22s (council ruling 10): manual kindling is the primary
     path — idle spectacle must never preempt the player's version of it */
  let beaconTrigger = null;   /* the active FX sets this; the toy button calls it */

  function bcnRun(st, clock, from) {
    const f = from || 0;
    const far = Math.max(f, BCN_N - 1 - f);            /* the wave spreads BOTH ways from your fire */
    st.sig.on = true; st.sig.t0 = clock; st.sig.from = f;
    st.sig.settle = clock + far * BCN_STAGGER + BCN_HOLD;
    st.sig.run = far * BCN_STAGGER + BCN_HOLD + BCN_SETTLE;
    for (let i = 0; i < BCN_N; i++) st.burst[i] = 0;
  }
  function bcnEmber(st, x, y, n, sc) {
    for (let c = 0; c < n; c++) {
      let e = null; for (const q of st.embers) if (!q.on) { e = q; break; }
      if (!e) break;
      e.on = true; e.x = x + (Math.random() - 0.5) * 9 * sc; e.y = y - 2 * sc;
      e.vx = (Math.random() - 0.5) * 0.022; e.vy = -(0.03 + Math.random() * 0.06) * sc;
      e.life = 0; e.max = 650 + Math.random() * 750; e.r = (0.7 + Math.random() * 1.3) * sc;
    }
  }
  function bcnSmoke(st, x, y, sc, warm) {
    let m = null; for (const q of st.smoke) if (!q.on) { m = q; break; }
    if (!m) return;
    m.on = true; m.x = x + (Math.random() - 0.5) * 6 * sc; m.y = y - 4 * sc;
    m.vy = -(0.012 + Math.random() * 0.014); m.life = 0; m.max = 3200 + Math.random() * 2600;
    m.seed = Math.random() * 7; m.sway = 6 + Math.random() * 10; m.sc = sc;
    m.warm = warm || 0;
  }
  /* snow caps as one Path2D per ridge: a band that hugs the crest wherever
     the ridge climbs above its snowline, tapering out where it dips below.
     Built once in init; drawn each frame under the ridge's own drift. */
  function bcnSnowPath(r) {
    const capY = r.baseY - r.amp * 0.62, depth = Math.max(3, r.amp * 0.10);
    const xs = r.xs, ys = r.ys, n = xs.length;
    const p = new Path2D();
    let i = 0;
    while (i < n) {
      if (ys[i] >= capY) { i++; continue; }
      let j = i;
      while (j < n && ys[j] < capY) j++;
      const x0 = i > 0 ? xs[i - 1] + (xs[i] - xs[i - 1]) * ((capY - ys[i - 1]) / (ys[i] - ys[i - 1])) : xs[0];
      const x1 = j < n ? xs[j - 1] + (xs[j] - xs[j - 1]) * ((capY - ys[j - 1]) / (ys[j] - ys[j - 1])) : xs[n - 1];
      p.moveTo(x0, capY);
      for (let k = i; k < j; k++) p.lineTo(xs[k], ys[k]);
      p.lineTo(x1, capY);
      for (let k = j - 1; k >= i; k--) p.lineTo(xs[k], Math.min(capY, ys[k] + depth));
      p.closePath();
      i = j;
    }
    return p;
  }
  function bcnPyre(g, x, y, sc, it, clock, i) {
    const bw = 11 * sc, bh = 7 * sc;                    /* the dark wood stack (always drawn) */
    g.fillStyle = 'rgba(16,11,8,0.95)';
    g.beginPath();
    g.moveTo(x - bw, y + bh); g.lineTo(x + bw, y + bh);
    g.lineTo(x + bw * 0.5, y - bh * 0.2); g.lineTo(x - bw * 0.5, y - bh * 0.2);
    g.closePath(); g.fill();
    if (it < 0.16) {                                    /* ember-state: only a faint hot core */
      g.fillStyle = `rgba(255,120,50,${0.35 + it})`;
      g.beginPath(); g.arc(x, y + bh * 0.3, 2.2 * sc, 0, 7); g.fill();
      return;
    }
    const fh = (9 + 30 * it) * sc;
    const fl = Math.sin(clock * 0.02 + i * 1.7), fl2 = Math.sin(clock * 0.031 + i * 2.3);
    g.fillStyle = `rgba(255,${(120 + 60 * it) | 0},40,${0.45 + 0.4 * it})`;   /* outer flame */
    g.beginPath();
    g.moveTo(x - 6 * sc, y + 2 * sc);
    g.quadraticCurveTo(x - 4 * sc + fl * 3 * sc, y - fh * 0.55, x, y - fh);
    g.quadraticCurveTo(x + 4 * sc + fl2 * 3 * sc, y - fh * 0.55, x + 6 * sc, y + 2 * sc);
    g.closePath(); g.fill();
    const ih = fh * 0.62;
    g.fillStyle = `rgba(255,${(210 + 30 * it) | 0},130,${0.5 + 0.4 * it})`;   /* inner flame */
    g.beginPath();
    g.moveTo(x - 3 * sc, y + 1 * sc);
    g.quadraticCurveTo(x - 2 * sc + fl * 2 * sc, y - ih * 0.6, x, y - ih);
    g.quadraticCurveTo(x + 2 * sc + fl2 * 2 * sc, y - ih * 0.6, x + 3 * sc, y + 1 * sc);
    g.closePath(); g.fill();
    g.fillStyle = `rgba(255,246,210,${0.4 + 0.5 * it})`;                       /* white-hot core */
    g.beginPath(); g.arc(x, y - ih * 0.3, 1.8 * sc * (0.6 + 0.6 * it), 0, 7); g.fill();
  }
  fx.beacons = {
    init(s) {
      const W = s.w, H = s.h, rnd = (a, b) => a + Math.random() * (b - a);
      const STEP = 18, x0 = -90, Nr = Math.ceil((W + 180) / STEP) + 1;
      function ridge(baseY, amp, fill, driftA, driftS) {
        const xs = new Float32Array(Nr), ys = new Float32Array(Nr);
        const w1 = rnd(150, 240), w2 = rnd(60, 100), w3 = rnd(26, 42), wE = rnd(320, 520);
        const p1 = rnd(0, 7), p2 = rnd(0, 7), p3 = rnd(0, 7), pE = rnd(0, 7);
        for (let i = 0; i < Nr; i++) {
          const x = x0 + i * STEP; xs[i] = x;
          let n = Math.sin(x / w1 + p1) * 0.6 + Math.sin(x / w2 + p2) * 0.3 + Math.sin(x / w3 + p3) * 0.22;
          n = n / 1.12;
          const ridged = 1 - Math.abs(n);                    /* sharp alpine cusps, not dune curves */
          const env = 0.5 + 0.5 * Math.sin(x / wE + pE);     /* vary peak height across the range */
          ys[i] = baseY - amp * ridged * (0.45 + 0.7 * env);
        }
        return { xs, ys, fill, driftA, driftS, phase: rnd(0, 7), baseY, amp };
      }
      /* Mordor dusk: ash-grey charcoal silhouettes under a stormlit rack */
      const ridges = [
        ridge(H * 0.40, 54,  'rgba(62,50,72,1)', 8,  0.000026),    /* farthest, stormlight grey */
        ridge(H * 0.50, 72,  'rgba(46,37,56,1)', 13, 0.000036),
        ridge(H * 0.61, 92,  'rgba(32,26,42,1)', 19, 0.000048),
        ridge(H * 0.73, 112, 'rgba(19,16,28,1)', 26, 0.000060),
        ridge(H * 0.85, 130, 'rgba(9,8,15,1)',   34, 0.000072),    /* nearest apron (no pyres) */
      ];
      /* snow caps gone cold under the storm; the far ones keep one ember kiss */
      const SNOWC = ['rgba(192,162,168,0.68)', 'rgba(160,142,162,0.58)',
                     'rgba(122,110,138,0.52)', 'rgba(86,80,108,0.45)', 'rgba(56,54,78,0.40)'];
      for (let k = 0; k < ridges.length; k++) {
        ridges[k].snow = bcnSnowPath(ridges[k]);
        ridges[k].snowFill = SNOWC[k];
      }
      const defs = [[0.09, 1], [0.22, 3], [0.35, 2], [0.50, 3], [0.64, 2], [0.78, 3], [0.91, 1]];
      const pyres = defs.map(([xf, r]) => {                        /* left->right = the chain order */
        const gi = Math.max(0, Math.min(Nr - 1, Math.round((xf * W - x0) / STEP)));
        return { ridge: r, baseX: ridges[r].xs[gi], y: ridges[r].ys[gi], scale: 0.7 + r * 0.16 };
      });
      const gs = 64, oc = document.createElement('canvas'); oc.width = oc.height = gs;   /* prebaked bloom */
      const og = oc.getContext('2d');
      const gr = og.createRadialGradient(gs / 2, gs / 2, 0, gs / 2, gs / 2, gs / 2);
      gr.addColorStop(0, 'rgba(255,196,120,0.95)');
      gr.addColorStop(0.4, 'rgba(255,140,60,0.42)');
      gr.addColorStop(1, 'rgba(255,120,50,0)');
      og.fillStyle = gr; og.beginPath(); og.arc(gs / 2, gs / 2, gs / 2, 0, 7); og.fill();
      const embers = new Array(96);
      for (let i = 0; i < embers.length; i++) embers[i] = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 1 };
      const smoke = new Array(26);
      for (let i = 0; i < smoke.length; i++) smoke[i] = { on: false, x: 0, y: 0, vy: 0, life: 0, max: 1, seed: 0, sway: 0, sc: 1, warm: 0 };
      const stars = [], sn = Math.round(Math.min(90, W / 13));
      for (let i = 0; i < sn; i++) stars.push({ x: rnd(0, W), y: rnd(H * 0.02, H * 0.40), r: rnd(0.5, 1.8), tw: rnd(0, 7) });
      /* the moon, baked once: halo + disc + a few maria */
      const mn = 112, mc = document.createElement('canvas'); mc.width = mc.height = mn;
      const mg = mc.getContext('2d');
      let mgr = mg.createRadialGradient(56, 56, 10, 56, 56, 56);
      mgr.addColorStop(0, 'rgba(210,220,255,0.30)');
      mgr.addColorStop(0.5, 'rgba(190,200,250,0.10)');
      mgr.addColorStop(1, 'rgba(190,200,250,0)');
      mg.fillStyle = mgr; mg.fillRect(0, 0, mn, mn);
      mgr = mg.createRadialGradient(50, 50, 4, 56, 56, 22);
      mgr.addColorStop(0, 'rgba(240,244,255,1)');
      mgr.addColorStop(0.8, 'rgba(206,214,242,1)');
      mgr.addColorStop(1, 'rgba(178,188,226,1)');
      mg.fillStyle = mgr; mg.beginPath(); mg.arc(56, 56, 22, 0, 7); mg.fill();
      mg.fillStyle = 'rgba(150,160,205,0.5)';
      mg.beginPath(); mg.arc(50, 52, 6.5, 0, 7); mg.fill();
      mg.beginPath(); mg.arc(62, 62, 4.5, 0, 7); mg.fill();
      mg.beginPath(); mg.arc(58, 45, 3, 0, 7); mg.fill();
      /* one soft mist blob, baked once; the valley sea is many of these */
      const fc = document.createElement('canvas'); fc.width = 160; fc.height = 48;
      const fg = fc.getContext('2d');
      fg.setTransform(1, 0, 0, 0.3, 0, 0);
      const fgr = fg.createRadialGradient(80, 80, 4, 80, 80, 78);
      fgr.addColorStop(0, 'rgba(168,160,205,0.5)');
      fgr.addColorStop(0.55, 'rgba(150,142,190,0.24)');
      fgr.addColorStop(1, 'rgba(140,132,180,0)');
      fg.fillStyle = fgr; fg.beginPath(); fg.arc(80, 80, 78, 0, 7); fg.fill();
      const mist = [];
      for (let k = 0; k < ridges.length - 1; k++) {
        const y0 = ridges[k].baseY, y1 = ridges[k + 1].baseY;
        const nM = k === ridges.length - 2 ? 6 : 4;      /* the near valley holds the cloud-sea */
        for (let i = 0; i < nM; i++) mist.push({
          band: k, x: Math.random() * W,
          y: y0 + (y1 - y0) * rnd(0.10, 0.42),
          w: rnd(180, 420) * (1 + k * 0.18),
          a: (0.16 + 0.05 * k) * rnd(0.7, 1.3),
          v: rnd(0.006, 0.016) * (Math.random() < 0.5 ? -1 : 1),
          seed: rnd(0, 7),
        });
      }
      /* THE LOTR RETHEME (the owner's pin brief): storm clouds the fires
         underlight, Mount Doom smoldering in the west, two river-kings in
         the mist gorge, a fell shadow across the moon — and past the last
         ridge, the black tower. The oldest fire on the range does not need
         lighting: when the 7th pyre catches, the Eye opens. */
      /* one dark storm cloud, baked once */
      const cc = document.createElement('canvas'); cc.width = 200; cc.height = 64;
      const cg = cc.getContext('2d');
      cg.setTransform(1, 0, 0, 0.32, 0, 0);
      const cgr = cg.createRadialGradient(100, 100, 6, 100, 100, 96);
      cgr.addColorStop(0, 'rgba(15,12,20,0.85)');
      cgr.addColorStop(0.6, 'rgba(17,14,24,0.5)');
      cgr.addColorStop(1, 'rgba(19,15,26,0)');
      cg.fillStyle = cgr; cg.beginPath(); cg.arc(100, 100, 96, 0, 7); cg.fill();
      const clouds = [];
      for (let i = 0; i < 8; i++) clouds.push({
        x: Math.random() * W, y: H * rnd(0.03, 0.26),
        w: rnd(280, 640), v: rnd(0.004, 0.011) * (Math.random() < 0.7 ? 1 : -1),
        a: rnd(0.5, 0.95), seed: rnd(0, 7),
      });
      /* the Eye, baked once as a flame ring (its slit roves live, per frame) */
      const ec = document.createElement('canvas'); ec.width = ec.height = 96;
      const eg = ec.getContext('2d');
      const egr = eg.createRadialGradient(48, 48, 6, 48, 48, 48);
      egr.addColorStop(0, 'rgba(255,238,180,0.9)');
      egr.addColorStop(0.34, 'rgba(255,170,60,0.95)');
      egr.addColorStop(0.62, 'rgba(214,80,20,0.5)');
      egr.addColorStop(1, 'rgba(160,40,10,0)');
      eg.fillStyle = egr;
      eg.save(); eg.translate(48, 48); eg.scale(1, 0.62);
      eg.beginPath(); eg.arc(0, 0, 46, 0, 7); eg.restore(); eg.fill();
      /* the black tower, one Path2D: jagged taper up into two crown horns */
      const gA = Math.max(0, Math.min(Nr - 1, Math.round((W * 0.885 - x0) / STEP)));
      const towX = W * 0.885, towBase = Math.min(ridges[0].ys[gA], ridges[1].ys[gA]) + 26;
      const eyeY = H * 0.145, tw2 = Math.max(18, Math.min(30, W * 0.024));
      const th = towBase - (eyeY + tw2 * 0.45);
      const tower = new Path2D();
      tower.moveTo(towX - tw2 * 1.8, towBase);
      tower.lineTo(towX - tw2 * 1.0, towBase - th * 0.30);
      tower.lineTo(towX - tw2 * 1.25, towBase - th * 0.34);
      tower.lineTo(towX - tw2 * 0.7, towBase - th * 0.62);
      tower.lineTo(towX - tw2 * 0.85, towBase - th * 0.66);
      tower.lineTo(towX - tw2 * 0.62, eyeY + tw2 * 0.5);
      tower.lineTo(towX - tw2 * 0.85, eyeY - tw2 * 0.5);
      tower.lineTo(towX - tw2 * 0.45, eyeY - tw2 * 1.35);
      tower.lineTo(towX - tw2 * 0.28, eyeY + tw2 * 0.15);
      tower.lineTo(towX - tw2 * 0.16, eyeY + tw2 * 0.45);
      tower.lineTo(towX + tw2 * 0.16, eyeY + tw2 * 0.45);
      tower.lineTo(towX + tw2 * 0.28, eyeY + tw2 * 0.15);
      tower.lineTo(towX + tw2 * 0.45, eyeY - tw2 * 1.35);
      tower.lineTo(towX + tw2 * 0.85, eyeY - tw2 * 0.5);
      tower.lineTo(towX + tw2 * 0.62, eyeY + tw2 * 0.5);
      tower.lineTo(towX + tw2 * 0.85, towBase - th * 0.66);
      tower.lineTo(towX + tw2 * 0.7, towBase - th * 0.62);
      tower.lineTo(towX + tw2 * 1.25, towBase - th * 0.34);
      tower.lineTo(towX + tw2 * 1.0, towBase - th * 0.30);
      tower.lineTo(towX + tw2 * 1.8, towBase);
      tower.closePath();
      /* Mount Doom in the west + its lava threads */
      const doomX = W * 0.135, doomY = H * 0.265, doomW = W * 0.16;
      const doom = new Path2D();
      doom.moveTo(doomX - doomW, H * 0.44);
      doom.lineTo(doomX - doomW * 0.16, doomY);
      doom.lineTo(doomX - doomW * 0.05, doomY + 6);
      doom.lineTo(doomX + doomW * 0.07, doomY + 2);
      doom.lineTo(doomX + doomW * 0.18, doomY + 10);
      doom.lineTo(doomX + doomW, H * 0.44);
      doom.closePath();
      const lava = new Path2D();
      lava.moveTo(doomX - doomW * 0.04, doomY + 6);
      lava.quadraticCurveTo(doomX - doomW * 0.07, doomY + 34, doomX - doomW * 0.10, H * 0.40 - 10);
      lava.moveTo(doomX + doomW * 0.05, doomY + 4);
      lava.quadraticCurveTo(doomX + doomW * 0.10, doomY + 36, doomX + doomW * 0.14, H * 0.40 - 6);
      const ashes = new Array(8);
      for (let i = 0; i < ashes.length; i++) ashes[i] = { on: false, x: 0, y: 0, vy: 0, life: 0, max: 1, sc: 1, seed: 0 };
      /* the river-kings: two colossi flanking the gorge in mist band 1 */
      function king(bx, by, sc, m) {
        /* an A-line robe, one slim arm held out, a neck notch, a crown:
           enough grammar to read as a figure at 100px in the mist */
        const p = new Path2D();
        const X = (x) => bx + x * sc * m, Y = (y) => by - y * sc;
        p.moveTo(X(-14), Y(0));
        p.lineTo(X(-9), Y(14));                                  /* robe hem tapers up */
        p.lineTo(X(-9), Y(40));
        p.lineTo(X(-20), Y(40)); p.lineTo(X(-20), Y(44.5));      /* the slim out-held arm */
        p.lineTo(X(-8), Y(44));
        p.lineTo(X(-7), Y(50));                                  /* shoulder */
        p.lineTo(X(-3.5), Y(53));                                /* neck */
        p.lineTo(X(-4.5), Y(58));
        p.lineTo(X(-5), Y(63)); p.lineTo(X(-2), Y(59));          /* crown spikes */
        p.lineTo(X(0), Y(64)); p.lineTo(X(2), Y(59)); p.lineTo(X(5), Y(63));
        p.lineTo(X(4.5), Y(58)); p.lineTo(X(3.5), Y(53));
        p.lineTo(X(7), Y(50));                                   /* far shoulder */
        p.lineTo(X(9), Y(38));
        p.lineTo(X(9), Y(14)); p.lineTo(X(14), Y(0));
        p.closePath();
        return p;
      }
      const kSc = H * 0.0028 * Math.min(1, W / 640);   /* portrait phones: smaller kings, same gorge */
      const kingL = king(W * 0.45, H * 0.575, kSc, -1);
      const kingR = king(W * 0.578, H * 0.595, kSc * 0.92, 1);   /* staggered: brothers, not gateposts */
      const st = {
        ridges, pyres, glow: oc, embers, smoke, stars, moon: mc, mistS: fc, mist,
        moonX: W * 0.20, moonY: H * 0.15,
        clouds, cloudS: cc, eyeS: ec, tower, tw2, eyeX: towX, eyeY,
        doom, lava, doomX, doomY, ashes, ashAcc: 0,
        kingL, kingR, fell: { on: false, next: 0, t0: 0, dir: 1, sp: 0.09, y0: 0, ph: 0 },
        fire: 0.1,
        ans: 0,
        inten: new Float32Array(BCN_N), rdrift: new Float32Array(ridges.length),
        sig: { on: false, t0: 0, from: 0, settle: 0, run: BCN_RUN }, burst: new Uint8Array(BCN_N),
        falls: [{ on: false, x0: 0, y0: 0, tx: 0, ty: 0, t0: 0 }, { on: false, x0: 0, y0: 0, tx: 0, ty: 0, t0: 0 }],
        next: null, lastEnd: -99999, calm: 1, btnOn: false,
        emberAcc: 0, smokeAcc: 0, gust: 0, gustNext: 0,
      };
      st.cleanup = () => {                                        /* Smaug kill 7: drop the toy hook */
        beaconTrigger = null;
        if (beaconToy) { beaconToy.classList.remove('is-running'); beaconToy.removeAttribute('aria-disabled'); }
      };
      beaconTrigger = () => {                                     /* one guard, one place: starts the
                                                                     run now, or reports it is busy */
        const clock = window.Orrery.ticker.clock;
        if (st.sig.on || clock - st.lastEnd <= 800) return false;
        bcnRun(st, clock);
        return true;
      };
      return st;
    },
    frame(s, st, dt, clock) {
      const g = s.g, W = s.w, H = s.h;
      g.clearRect(0, 0, W, H);
      if (st.next === null) st.next = clock + 14000;   /* the player gets first strike at the flint */

      /* the signal run: auto on a slow cadence (the toy starts its own via beaconTrigger) */
      if (!st.sig.on && clock >= st.next) bcnRun(st, clock);
      /* the button wears the run state — the FX owns it on the shared clock,
         so auto-runs and frozen hidden tabs stay truthful (no wall timers).
         The 800ms post-run cooldown counts as busy: no press is ever eaten
         by a state the button isn't showing. */
      const busy = st.sig.on || clock - st.lastEnd <= 800;
      if (beaconToy && st.btnOn !== busy) {
        st.btnOn = busy;
        beaconToy.classList.toggle('is-running', busy);
        if (busy) beaconToy.setAttribute('aria-disabled', 'true');
        else beaconToy.removeAttribute('aria-disabled');
      }
      if (st.sig.on) {
        const runEnd = st.sig.t0 + st.sig.run;
        if (clock >= runEnd) { st.sig.on = false; st.lastEnd = clock; st.next = st.sig.t0 + BCN_GAP + Math.random() * 4000; }
      }

      for (let k = 0; k < st.ridges.length; k++) { const r = st.ridges[k]; st.rdrift[k] = r.driftA * Math.sin(clock * r.driftS + r.phase); }

      const settleStart = st.sig.settle;
      for (let i = 0; i < BCN_N; i++) {
        let it = BCN_EMBER;
        if (st.sig.on) {
          /* the wave spreads outward from whichever fire was struck first */
          const ig = clock - (st.sig.t0 + Math.abs(i - st.sig.from) * BCN_STAGGER);
          if (ig >= 0) {
            it = ig < BCN_RISE ? BCN_EMBER + (1 - BCN_EMBER) * (ig / BCN_RISE)
                               : 0.82 + 0.07 * Math.sin((clock + i * 370) * 0.018);
            if (!st.burst[i]) { st.burst[i] = 1; const p = st.pyres[i]; bcnEmber(st, p.baseX + st.rdrift[p.ridge], p.y, 14, p.scale); }
            if (clock > settleStart) { const kk = Math.min(1, (clock - settleStart) / BCN_SETTLE); it += (BCN_EMBER - it) * kk; }
          }
        }
        st.inten[i] = it;
      }

      /* falling stars: a wanderer's spark arcs down and kindles where it lands */
      for (const fs of st.falls) {
        if (!fs.on) continue;
        const k = (clock - fs.t0) / 700;
        if (k >= 1) {
          fs.on = false;
          bcnEmber(st, fs.tx, fs.ty, 12, 1.1);
          bcnSmoke(st, fs.tx, fs.ty, 1, 1);
          continue;
        }
        const e = k * k;
        const fx2 = fs.x0 + (fs.tx - fs.x0) * k;
        const fy2 = fs.y0 + (fs.ty - fs.y0) * e;
        g.strokeStyle = `rgba(255,214,150,${(0.8 * (1 - k * 0.4)).toFixed(3)})`;
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(fx2 - 14 * (1 - k), fy2 - 22 * (1 - k)); g.lineTo(fx2, fy2); g.stroke();
        g.fillStyle = 'rgba(255,246,210,0.95)';
        g.beginPath(); g.arc(fx2, fy2, 1.8, 0, 7); g.fill();
      }

      st.calm += ((st.sig.on ? 0.42 : 1) - st.calm) * 0.02;      /* stars sharpen between signals */
      st.gustNext -= dt; if (st.gustNext <= 0) { st.gust = 0.4 + Math.random() * 0.9; st.gustNext = 2600 + Math.random() * 4200; }
      st.gust *= Math.pow(0.9995, dt);
      const wind = 0.25 + 0.18 * Math.sin(clock * 0.0003) + st.gust * 0.5;

      for (const sp of st.stars) {                               /* a few stars through the storm rack */
        const tw = 0.55 + 0.45 * Math.sin(clock * 0.0016 + sp.tw);
        g.fillStyle = `rgba(223,233,255,${(0.25 + 0.6 * tw) * st.calm * 0.6})`;
        g.beginPath(); g.arc(sp.x, sp.y, sp.r, 0, 7); g.fill();
      }
      g.globalAlpha = 0.72 + 0.08 * Math.sin(clock * 0.0006);    /* the moon, storm-veiled */
      g.drawImage(st.moon, st.moonX - 56, st.moonY - 56);
      g.globalAlpha = 1;

      /* Mount Doom smolders in the west; its ash climbs across the moon */
      const dflick = 0.6 + 0.4 * Math.abs(Math.sin(clock * 0.0021 + 2) * Math.sin(clock * 0.0006));
      g.fillStyle = 'rgba(24,17,26,1)';
      g.fill(st.doom);
      const dw = 90 * (0.8 + 0.3 * dflick);
      g.globalAlpha = 0.26 + 0.16 * dflick;
      g.drawImage(st.glow, st.doomX - dw / 2, st.doomY - dw * 0.42, dw, dw * 0.8);
      g.globalAlpha = 1;
      g.strokeStyle = `rgba(255,120,44,${0.30 + 0.28 * dflick})`;
      g.lineWidth = 1.6;
      g.stroke(st.lava);
      st.ashAcc += dt;
      if (st.ashAcc > 520) { st.ashAcc = 0;
        for (const a2 of st.ashes) if (!a2.on) {
          a2.on = true; a2.x = st.doomX; a2.y = st.doomY + 4;
          a2.vy = -(0.010 + Math.random() * 0.010);
          a2.life = 0; a2.max = 5200 + Math.random() * 3600;
          a2.sc = 0.8 + Math.random() * 1.3; a2.seed = Math.random() * 7;
          break;
        }
      }
      g.fillStyle = 'rgba(30,22,30,1)';
      for (const a2 of st.ashes) {
        if (!a2.on) continue;
        a2.life += dt; const k2 = a2.life / a2.max;
        if (k2 >= 1) { a2.on = false; continue; }
        a2.y += a2.vy * dt;
        a2.x += (0.006 + wind * 0.004) * dt;
        g.globalAlpha = (k2 < 0.15 ? k2 / 0.15 : 1 - (k2 - 0.15) / 0.85) * 0.16;
        g.beginPath(); g.arc(a2.x, a2.y, (5 + 16 * k2) * a2.sc, 0, 7); g.fill();
      }
      g.globalAlpha = 1;

      /* the black tower past the range (its Eye answers in the additive pass) */
      g.fillStyle = 'rgba(9,7,13,0.96)';
      g.fill(st.tower);

      /* the Eye's envelope: when the LAST fire catches, something far off
         opens. The oldest fire on the range does not need lighting. */
      let ansT = 0;
      if (st.sig.on) {
        const ag = clock - (st.sig.t0 + Math.abs(BCN_N - 1 - st.sig.from) * BCN_STAGGER + 1300);
        if (ag > 0) ansT = Math.min(1, ag / 900);
        if (clock > settleStart) ansT *= Math.max(0, 1 - (clock - settleStart) / BCN_SETTLE);
      }
      st.ans += (ansT - st.ans) * Math.min(1, dt / 380);

      /* the storm rack: dark bellies that catch the fire when the chain runs
         (eased, so run start/end never pops the whole sky in one frame) */
      st.fire += (Math.min(1, (st.sig.on ? 0.55 : 0.10) + st.ans * 0.5) - st.fire) * Math.min(1, dt / 600);
      const fireLvl = st.fire;
      for (const cl of st.clouds) {
        cl.x += cl.v * (0.5 + wind * 0.5) * dt;
        const hw2 = cl.w / 2, ch2 = cl.w * 0.32;
        if (cl.x > W + hw2) cl.x = -hw2; else if (cl.x < -hw2) cl.x = W + hw2;
        g.globalAlpha = cl.a * (0.75 + 0.25 * Math.sin(clock * 0.0003 + cl.seed));
        g.drawImage(st.cloudS, cl.x - hw2, cl.y - ch2 / 2, cl.w, ch2);
        g.globalAlpha = (0.04 + 0.22 * fireLvl) * cl.a;
        g.drawImage(st.glow, cl.x - hw2 * 0.7, cl.y + ch2 * 0.08, cl.w * 0.7, ch2 * 0.5);
      }
      g.globalAlpha = 1;

      /* a fell shadow crosses, now and then */
      const fb2 = st.fell;
      if (fb2.next === 0) fb2.next = clock + 8000 + Math.random() * 8000;
      if (!fb2.on && clock >= fb2.next) {
        fb2.on = true; fb2.t0 = clock;
        fb2.dir = Math.random() < 0.5 ? 1 : -1;
        fb2.sp = 0.075 + Math.random() * 0.035;
        fb2.y0 = H * (0.10 + Math.random() * 0.12);
        fb2.ph = Math.random() * 7;
      }
      if (fb2.on) {
        const age = clock - fb2.t0;
        const bx2 = fb2.dir > 0 ? -40 + fb2.sp * age : W + 40 - fb2.sp * age;
        if (bx2 < -60 || bx2 > W + 60) { fb2.on = false; fb2.next = clock + 24000 + Math.random() * 22000; }
        else {
          const by2 = fb2.y0 + Math.sin(age * 0.0012 + fb2.ph) * 12;
          const flap = Math.sin(age * 0.013);
          g.fillStyle = 'rgba(10,8,14,0.92)';
          g.beginPath();                                          /* body, head, tail */
          g.moveTo(bx2 - 11 * fb2.dir, by2 + 1);
          g.quadraticCurveTo(bx2, by2 - 2.5, bx2 + 11 * fb2.dir, by2 - 1.5);
          g.lineTo(bx2 + 16 * fb2.dir, by2 + 0.5);
          g.quadraticCurveTo(bx2, by2 + 3, bx2 - 11 * fb2.dir, by2 + 1);
          g.fill();
          g.beginPath();                                          /* the wings, mid-flap */
          g.moveTo(bx2 - 2 * fb2.dir, by2 - 1);
          g.quadraticCurveTo(bx2 - 10 * fb2.dir, by2 - 8 - 12 * flap, bx2 - 22 * fb2.dir, by2 - 3 - 18 * flap);
          g.quadraticCurveTo(bx2 - 11 * fb2.dir, by2 - 12 * flap * 0.3, bx2 - 2 * fb2.dir, by2 + 1.5);
          g.moveTo(bx2 + 3 * fb2.dir, by2 - 1);
          g.quadraticCurveTo(bx2 + 10 * fb2.dir, by2 - 8 - 12 * flap, bx2 + 20 * fb2.dir, by2 - 3 - 18 * flap);
          g.quadraticCurveTo(bx2 + 12 * fb2.dir, by2 - 12 * flap * 0.3, bx2 + 3 * fb2.dir, by2 + 1.5);
          g.fill();
        }
      }

      for (let k = 0; k < st.ridges.length; k++) {               /* ridges far->near: rock, snow, pyres, valley mist */
        const r = st.ridges[k], d = st.rdrift[k], xs = r.xs, ys = r.ys, n = xs.length;
        g.fillStyle = r.fill;
        g.beginPath(); g.moveTo(xs[0] + d, H + 2);
        for (let i2 = 0; i2 < n; i2++) g.lineTo(xs[i2] + d, ys[i2]);
        g.lineTo(xs[n - 1] + d, H + 2); g.closePath(); g.fill();
        g.save(); g.translate(d, 0);
        g.fillStyle = r.snowFill; g.fill(r.snow);                /* the caps catch the last light */
        g.restore();
        for (let i = 0; i < BCN_N; i++) { const p = st.pyres[i]; if (p.ridge === k) bcnPyre(g, p.baseX + d, p.y, p.scale, st.inten[i], clock, i); }
        if (k === 1) {                                           /* the river-kings stand in the gorge */
          g.fillStyle = 'rgba(62,56,80,0.92)';
          g.fill(st.kingL);
          g.fill(st.kingR);
        }
        for (const m of st.mist) {                               /* the mist sea in this ridge's valley */
          if (m.band !== k) continue;
          m.x += m.v * (0.6 + wind) * dt;
          const hw = m.w / 2, mh = m.w * 0.3;
          if (m.x > W + hw) m.x = -hw; else if (m.x < -hw) m.x = W + hw;
          g.globalAlpha = m.a * (0.8 + 0.2 * Math.sin(clock * 0.0004 + m.seed));
          g.drawImage(st.mistS, m.x - hw, m.y - mh / 2, m.w, mh);
        }
        g.globalAlpha = 1;
      }

      g.globalCompositeOperation = 'lighter';                    /* additive: slope-glow + bloom + embers */
      for (let i = 0; i < BCN_N; i++) {
        const it = st.inten[i]; if (it <= 0.03) continue;
        const p = st.pyres[i], x = p.baseX + st.rdrift[p.ridge], y = p.y, sc = p.scale;
        const sw = (170 + 150 * it) * sc, sh = (64 + 34 * it) * sc;   /* the light rim-lighting the slope */
        g.globalAlpha = 0.08 + 0.32 * it; g.drawImage(st.glow, x - sw / 2, y - sh * 0.35, sw, sh);
        const bw = (52 + 120 * it) * sc;                             /* the pyre bloom */
        g.globalAlpha = 0.16 + 0.58 * it; g.drawImage(st.glow, x - bw / 2, y - bw * 0.62, bw, bw);
      }
      {                                                          /* the Eye: an ember asleep, a furnace awake */
        const ei = Math.max(st.ans, 0.06);                       /* it never fully sleeps */
        const er = st.tw2 * (0.85 + 0.55 * st.ans);
        const bw2 = er * (3.5 + 3 * st.ans);
        g.globalAlpha = 0.30 * ei + 0.45 * st.ans;
        g.drawImage(st.glow, st.eyeX - bw2 / 2, st.eyeY - bw2 / 2, bw2, bw2);
        g.globalAlpha = Math.min(1, 0.22 + st.ans * 1.1);
        g.drawImage(st.eyeS, st.eyeX - er, st.eyeY - er, er * 2, er * 2);
      }
      for (const e of st.embers) {
        if (!e.on) continue;
        e.life += dt; const k = e.life / e.max; if (k >= 1) { e.on = false; continue; }
        e.x += e.vx * dt; e.y += e.vy * dt; e.vy -= 0.00001 * dt;
        g.globalAlpha = 1 - k;
        g.fillStyle = `rgba(255,${(170 + 70 * (1 - k)) | 0},90,1)`;
        g.beginPath(); g.arc(e.x, e.y, e.r * (0.5 + 0.6 * (1 - k)), 0, 7); g.fill();
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      if (st.ans > 0.15) {                                       /* the slit roves: it is LOOKING */
        const er = st.tw2 * (0.85 + 0.55 * st.ans);
        const sx2 = st.eyeX + Math.sin(clock * 0.00045) * er * 0.34;
        g.globalAlpha = st.ans;
        g.fillStyle = 'rgba(6,3,6,0.88)';
        g.beginPath(); g.ellipse(sx2, st.eyeY, er * 0.16, er * 0.5, 0, 0, 7); g.fill();
        g.globalAlpha = 1;
      }

      st.emberAcc += dt;                                          /* sparks off the lit pyres */
      if (st.emberAcc > 110) { st.emberAcc = 0;
        for (let i = 0; i < BCN_N; i++) if (st.inten[i] > 0.5 && Math.random() < 0.5) { const p = st.pyres[i]; bcnEmber(st, p.baseX + st.rdrift[p.ridge], p.y, 1, p.scale); }
      }

      st.smokeAcc += dt;                                          /* smoke off the pyres */
      if (st.smokeAcc > 300) { st.smokeAcc = 0;
        let pick = -1, seen = 0;
        for (let i = 0; i < BCN_N; i++) if (st.inten[i] < 0.3) { seen++; if (Math.random() < 1 / seen) pick = i; }
        if (pick >= 0) { const p = st.pyres[pick]; bcnSmoke(st, p.baseX + st.rdrift[p.ridge], p.y, p.scale, 0); }
        if (st.sig.on) {                                          /* underlit smoke off the burning ones */
          let lp = -1; seen = 0;
          for (let i = 0; i < BCN_N; i++) if (st.inten[i] > 0.6) { seen++; if (Math.random() < 1 / seen) lp = i; }
          if (lp >= 0) { const p = st.pyres[lp]; bcnSmoke(st, p.baseX + st.rdrift[p.ridge], p.y - 8 * p.scale, p.scale, 1); }
        }
      }
      for (const m of st.smoke) {
        if (!m.on) continue;
        m.life += dt; const k = m.life / m.max; if (k >= 1) { m.on = false; continue; }
        m.y += m.vy * dt;
        const sway = Math.sin(clock * 0.0011 + m.seed) * m.sway + wind * 6 * k;
        g.globalAlpha = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * (m.warm ? 0.16 : 0.10);
        g.fillStyle = m.warm ? 'rgba(255,168,110,1)' : 'rgba(150,162,190,1)';
        g.beginPath(); g.arc(m.x + sway, m.y, (2 + 7 * k) * m.sc, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    },
    rm() { /* intentional no-op: the frozen mid-burn pose is the .beacon-static SVG (see 03-worlds.css) */ },
    /* the verb: KINDLE THE FIRE YOU TOUCH. Strike a pyre and the signal
       runs BOTH ways down the range from your fire — the chain answers
       outward, and the Eye still waits for the last one. Strike the empty
       dusk and a wanderer's spark falls from the sky and kindles where it
       lands. (A running chain just puffs embers: the range is busy.) */
    verb(s, st, x, y, clock) {
      let hit = -1, hd = 60 * 60;
      for (let i = 0; i < BCN_N; i++) {
        const p = st.pyres[i];
        const dx = p.baseX + st.rdrift[p.ridge] - x, dy = p.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < hd) { hd = d2; hit = i; }
      }
      if (hit >= 0) {
        const p = st.pyres[hit];
        bcnEmber(st, p.baseX + st.rdrift[p.ridge], p.y, 10, p.scale);
        if (!st.sig.on && clock - st.lastEnd > 800) {
          bcnRun(st, clock, hit);
          beaconEvent();
        }
      } else {
        for (const fs of st.falls) {
          if (fs.on) continue;
          fs.on = true; fs.t0 = clock;
          fs.tx = Math.max(20, Math.min(s.w - 20, x));
          fs.ty = Math.max(s.h * 0.3, Math.min(s.h * 0.92, y));
          fs.x0 = fs.tx + (fs.tx > s.w / 2 ? -1 : 1) * (120 + Math.random() * 80);
          fs.y0 = -20;
          break;
        }
      }
    },
  };
  /* the toy: light the chain now. The FX owns the run + the button's busy
     state; the score's horns take their cadence FROM the event so the two
     files can never disagree about the chain's tempo. */
  const beaconToy = document.getElementById('light-beacons');
  const beaconEvent = () => window.Orrery.events.dispatchEvent(
    new CustomEvent('beacon', { detail: { n: BCN_N, stagger: BCN_STAGGER } }));
  if (beaconToy) beaconToy.addEventListener('click', () => {
    if (window.Orrery.reduced()) {
      /* rm answer: a one-shot flare of the static SVG pyres (user-initiated) */
      const sec = document.getElementById('world-beacons');
      if (sec) { sec.classList.remove('is-signaled'); void sec.offsetWidth; sec.classList.add('is-signaled'); }
      beaconEvent();
      return;
    }
    /* no live FX hook (init failed?) → the horns still answer the press */
    if (!beaconTrigger || beaconTrigger()) beaconEvent();
  });

  /* ============================================================
     SECTOR 00 — THE HOLD OF OBJECT 0 (WOW #5, the capstone): earned by
     finishing. Pitch dark but for your roving lamp; slow dust adrift in
     the hold; eleven monoliths wearing the accents of the worlds it was
     carrying all along; the heartbeat glowing from INSIDE at the crown.
     caps: 240 dust pts (Float32) · 11 monoliths · 2 baked sprites · 0 alloc
     ============================================================ */
  let S00_HOLE = null, S00_GLOW = null;
  function s00Sprites() {
    if (S00_HOLE) return;
    const c = document.createElement('canvas'); c.width = 512; c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(256, 256, 40, 256, 256, 256);
    gr.addColorStop(0, 'rgba(0,0,0,1)');               /* the lamp punches the veil */
    gr.addColorStop(0.55, 'rgba(0,0,0,0.5)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    S00_HOLE = c;
    const c2 = document.createElement('canvas'); c2.width = 128; c2.height = 128;
    const g2 = c2.getContext('2d');
    const gr2 = g2.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr2.addColorStop(0, 'rgba(255,236,190,0.9)');
    gr2.addColorStop(0.5, 'rgba(255,214,140,0.3)');
    gr2.addColorStop(1, 'rgba(255,214,140,0)');
    g2.fillStyle = gr2; g2.fillRect(0, 0, 128, 128);
    S00_GLOW = c2;
  }
  fx.object0 = {
    init(s) {
      s00Sprites();
      const N = 240;
      const dx = new Float32Array(N), dy = new Float32Array(N), dz = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        dx[i] = Math.random() * 2 - 1;
        dy[i] = (Math.random() * 2 - 1) * 0.55;
        dz[i] = (Math.random() * 2 - 1) * 0.55;
      }
      const mono = [];
      if (typeof WORLDS !== 'undefined') {
        /* the eleven stand in the order YOU lit them — the surveyed set keeps
           insertion order, and nobody enters the hold with fewer than eleven */
        const ordered = (typeof surveyed !== 'undefined' && surveyed.size)
          ? [...surveyed].map(s2 => WORLDS.find(w2 => w2.slug === s2)).filter(Boolean)
          : WORLDS;
        for (let i = 0; i < ordered.length; i++) {
          mono.push({ x: -0.82 + (i / Math.max(1, ordered.length - 1)) * 1.64, w: ordered[i], lit: 0 });
        }
      }
      return { dx, dy, dz, N, mono, lx: s.w / 2, ly: s.h * 0.55, yaw: 0 };
    },
    frame(s, st, dt, clock) {
      const g = s.g, w = s.w, h = s.h;
      g.clearRect(0, 0, w, h);
      st.yaw += dt * 0.00002;                          /* the hold turns, imperceptibly */
      const F = 3.4, cx = w / 2, cy = h * 0.52, S2 = Math.min(w, h) * 0.62;
      const cyw = Math.cos(st.yaw), syw = Math.sin(st.yaw);
      /* the dust: slow drift along the hold's length */
      g.fillStyle = 'rgba(214,226,240,1)';
      for (let i = 0; i < st.N; i++) {
        st.dx[i] += dt * 0.00001 * (1 + (i % 3));
        if (st.dx[i] > 1) st.dx[i] = -1;
        const x1 = st.dx[i] * cyw + st.dz[i] * syw;
        const z1 = st.dz[i] * cyw - st.dx[i] * syw;
        const sc = F / (F + z1);
        g.globalAlpha = 0.12 * sc;
        g.fillRect(cx + x1 * sc * S2, cy + st.dy[i] * sc * S2 * 0.8, 1.6, 1.6);
      }
      g.globalAlpha = 1;
      /* the eleven: they light only where your lamp reaches (tellStroke is
         baked at registry time — no strings minted here) */
      for (const m of st.mono) {
        const x1 = m.x * cyw, z1 = -m.x * syw;
        const sc = F / (F + z1);
        const sx = cx + x1 * sc * S2;
        const mh = 96 * sc, mw = 14 * sc;
        const near = Math.max(0, 1 - Math.hypot(sx - st.lx, cy - st.ly) / (S2 * 0.55));
        m.lit += (Math.max(0.06, near) - m.lit) * Math.min(1, dt / 300);
        m.sx = sx; m.mw = mw;                          /* remembered for the verb's hit-test */
        g.globalAlpha = 0.12 + 0.88 * Math.min(1, m.lit);
        g.fillStyle = m.w.tellStroke;
        g.fillRect(sx - mw / 2, cy - mh / 2, mw, mh);
        if (m.lit > 0.4) {                             /* a lit world hums */
          g.globalAlpha = (m.lit - 0.4) * 0.7;
          g.drawImage(S00_GLOW, sx - mh * 0.4, cy - mh * 0.4, mh * 0.8, mh * 0.8);
        }
      }
      g.globalAlpha = 1;
      /* the veil, and your lamp through it */
      g.fillStyle = 'rgba(2,4,10,0.88)';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-out';
      const LR = Math.min(w, h) * 0.55;
      g.drawImage(S00_HOLE, st.lx - LR, st.ly - LR, LR * 2, LR * 2);
      g.globalCompositeOperation = 'source-over';
      /* the heart, seen from inside: above the veil, always */
      const hb = 0.22 + 0.24 * Math.max(0, Math.sin(clock * 0.0016));
      g.globalAlpha = hb;
      g.drawImage(S00_GLOW, cx - w * 0.18, -h * 0.16, w * 0.36, h * 0.36);
      g.globalAlpha = 1;
    },
    aim(s, st, x, y) { st.lx = x; st.ly = y; },
    verb(s, st, x, y, clock) {
      /* touch a monolith and it answers in its world's own voice */
      for (const m of st.mono) {
        if (m.sx === undefined || Math.abs(x - m.sx) > Math.max(24, m.mw * 2)) continue;
        m.lit = 1.6;                                   /* the flare decays through the lerp */
        verbEvent2('strum', { slug: m.w.slug, surveyed: true });
        return;
      }
      st.lx = x; st.ly = y;                            /* an empty touch just moves the lamp */
    },
    rm() {
      /* the designed still: lamp resting center, all eleven dimly visible,
         the heart glowing at the crown — painted once */
      const c = document.querySelector('[data-canvas="object0"]');
      if (!c || !c.parentElement) return;
      s00Sprites();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const r = c.parentElement.getBoundingClientRect();
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = r.width, h = r.height, cx = w / 2, cy = h * 0.52, S2 = Math.min(w, h) * 0.62;
      if (typeof WORLDS !== 'undefined') {
        for (let i = 0; i < WORLDS.length; i++) {
          const sx = cx + (-0.82 + (i / (WORLDS.length - 1)) * 1.64) * S2;
          g.globalAlpha = 0.5;
          g.fillStyle = WORLDS[i].tellStroke;
          g.fillRect(sx - 7, cy - 48, 14, 96);
        }
      }
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(2,4,10,0.8)';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-out';
      const LR = Math.min(w, h) * 0.6;
      g.drawImage(S00_HOLE, cx - LR, cy - LR, LR * 2, LR * 2);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.4;
      g.drawImage(S00_GLOW, cx - w * 0.18, -h * 0.16, w * 0.36, h * 0.36);
      g.globalAlpha = 1;
    },
  };
  /* strum with a payload (the plain verbEvent carries none) */
  const verbEvent2 = (kind, detail) =>
    window.Orrery.events.dispatchEvent(new CustomEvent(kind, { detail }));

  /* M4: the verb buttons — the keyboard's path to the same delight the
     pointer gets by striking the scene itself. Each pokes its world's verb
     at center stage. They only render where the verb is wired (.w-verb is
     JS+motion gated), so the chip never promises what a press can't do. */
  document.querySelectorAll('.w-verb .w-toy').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!activeName || !activeSurf || !activeState) return;
      const d = fx[activeName];
      if (d && d.verb)
        d.verb(activeSurf, activeState, activeSurf.w * 0.5, activeSurf.h * 0.55, window.Orrery.ticker.clock);
    });
  });

  return { start, stopAll };
})();
window.WorldFX = WorldFX;
