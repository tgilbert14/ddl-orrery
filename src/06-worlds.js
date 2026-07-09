/* ============================================================
   06-worlds.js — the eleven signatures. One effect per world, no seconds.
   Each FX owns one canvas, pools its particles, joins the shared
   Ticker, and leaves a designed end-state when motion is off.
   Forged by six parallel effect-smiths of the MITHRIL guild, 2026-07-05.
   ============================================================ */
'use strict';

const WorldFX = (() => {
  const fx = {};
  let activeName = null, activeTask = null, activeCanvas = null, activeCtx = null, activeState = null;

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
    const map = { 'dust-sea': 'dune', 'velocity': 'velocity', 'grid': 'grid', 'abyssal': 'abyssal', 'arcadia': 'arcadia', 'aurora': 'aurora', 'uncharted': 'draft', 'beacons': 'beacons', 'stormwall': 'storm', 'drillyard': 'drillyard', 'archive': 'archive' };
    const name = map[sceneName];
    if (!name || !fx[name]) return;
    if (window.Orrery.reduced()) { fx[name].rm && fx[name].rm(); return; }
    const surf = canvasFor(name);
    if (!surf) return;
    activeName = name; activeCanvas = surf.c; activeCtx = surf.g;
    const state = fx[name].init(surf);
    activeState = state;
    activeTask = (dt, clock) => {
      if (activeName !== name) return false;
      fx[name].frame(surf, state, dt, clock);
      return true;
    };
    window.Orrery.ticker.add(activeTask);
  }
  function stopAll() {
    if (activeTask) { window.Orrery.ticker.remove(activeTask); activeTask = null; }
    if (activeState) { activeState.cleanup && activeState.cleanup(); activeState = null; }  /* Smaug kill 7 */
    if (activeCtx && activeCanvas) activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    activeName = null;
  }

  /* ============================================================
     DUST SEA: parallax dunes, wind-blown sand, and THE WORM
     caps: 3 precomputed silhouettes · sand 78 · puffs 30 · worm <=13
     ============================================================ */
  fx.dune = {
    init(s) {
      const rnd = (a, b) => a + Math.random() * (b - a);
      const STEP = 20, x0 = -80, x1 = s.w + 80;
      const N = Math.ceil((x1 - x0) / STEP) + 1;
      const H = s.h;
      function ridge(baseY, amp, fill, driftA, driftS, phase) {
        const xs = new Float32Array(N), ys = new Float32Array(N);
        const w1 = rnd(150, 230), w2 = rnd(70, 110), w3 = rnd(34, 52);
        const p1 = rnd(0, 7), p2 = rnd(0, 7), p3 = rnd(0, 7);
        const a2 = amp * 0.5, a3 = amp * 0.28;
        for (let i = 0; i < N; i++) {
          const x = x0 + i * STEP; xs[i] = x;
          ys[i] = baseY + Math.sin(x / w1 + p1) * amp + Math.sin(x / w2 + p2) * a2 + Math.sin(x / w3 + p3) * a3;
        }
        return { xs, ys, fill, driftA, driftS, phase, baseY, x0: x0, step: STEP };
      }
      const ridges = [
        ridge(H * 0.50, 18, 'rgba(74,42,66,1)', 8, 0.000030, 0.0),
        ridge(H * 0.61, 30, 'rgba(43,24,55,1)', 16, 0.000045, 2.1),
        ridge(H * 0.73, 46, 'rgba(20,11,32,1)', 28, 0.000062, 4.3),
      ];
      const sand = new Array(78);
      for (let i = 0; i < sand.length; i++) sand[i] = {
        x: Math.random() * s.w, y: rnd(H * 0.30, H * 0.86),
        vx: -(0.18 + Math.random() * 0.16), len: 8 + Math.random() * 20, seed: rnd(0, 7),
      };
      const puffs = new Array(30);
      for (let i = 0; i < puffs.length; i++) puffs[i] = { on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, r: 0 };
      const worm = { on: false, t0: 0, dur: 6000, nSeg: 11, dir: 1, xA: 0, span: 560, baseY: 0, archH: 130, puffAcc: 0, bursted: false };
      return { ridges, sand, puffs, worm, next: null };
    },
    frame(s, st, dt, clock) {
      const g = s.g, W = s.w, H = s.h;
      g.clearRect(0, 0, W, H);
      if (st.next === null) st.next = clock + 9000 + Math.random() * 8000;

      drawRidge(g, st.ridges[0], H, clock);
      drawRidge(g, st.ridges[1], H, clock);

      const wm = st.worm;
      if (!wm.on && clock >= st.next) {
        const fr = st.ridges[2];
        const bx = W * (0.28 + Math.random() * 0.44);
        const idx = Math.min(fr.xs.length - 1, Math.max(0, Math.round((bx - fr.x0) / fr.step)));
        wm.on = true; wm.t0 = clock; wm.dur = 6000;
        wm.nSeg = 9 + (Math.random() * 5 | 0);
        wm.dir = Math.random() < 0.5 ? 1 : -1;
        wm.span = 460 + Math.random() * 220;
        wm.xA = bx - wm.dir * wm.span * 0.5;
        wm.baseY = fr.ys[idx] + 54;
        wm.archH = 122 + Math.random() * 46;
        wm.puffAcc = 0; wm.bursted = false;
      }
      if (wm.on) {
        const p = (clock - wm.t0) / wm.dur;
        if (p >= 1) {
          wm.on = false;
          st.next = clock + 26000 + Math.random() * 18000;
        } else {
          g.fillStyle = 'rgba(11,6,19,0.96)';
          for (let k = wm.nSeg - 1; k >= 0; k--) {
            const sk = p - k * 0.045;
            if (sk < 0 || sk > 1) continue;
            const x = wm.xA + wm.dir * wm.span * sk;
            const y = wm.baseY - wm.archH * Math.sin(Math.PI * sk);
            const rr = 10 + 20 * (1 - k / wm.nSeg);
            g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
          }
          const hp = Math.min(p, 1);
          const headX = wm.xA + wm.dir * wm.span * hp;
          const headY = wm.baseY - wm.archH * Math.sin(Math.PI * hp);
          if (!wm.bursted && p > 0.24) { wm.bursted = true; for (let b = 0; b < 10; b++) spawnPuff(st, headX, headY, 1.4); }
          wm.puffAcc += dt;
          if (wm.puffAcc > 95 && p > 0.15 && p < 0.9) { wm.puffAcc = 0; spawnPuff(st, headX, headY, 1.0); }
        }
      }

      drawRidge(g, st.ridges[2], H, clock);            /* front dune occludes the submerged body */

      for (const pf of st.puffs) {
        if (!pf.on) continue;
        pf.life += dt;
        const k = pf.life / pf.max;
        if (k >= 1) { pf.on = false; continue; }
        pf.x += pf.vx * dt; pf.y += pf.vy * dt; pf.vy += 0.00002 * dt;
        g.fillStyle = `rgba(255,217,160,${(1 - k) * 0.5})`;
        g.beginPath(); g.arc(pf.x, pf.y, pf.r * (0.6 + k * 1.6), 0, 7); g.fill();
      }

      const gust = 0.55 + 0.45 * Math.sin(clock * 0.00028);
      g.strokeStyle = `rgba(255,209,150,${0.05 + 0.09 * gust})`;
      g.lineWidth = 1; g.beginPath();
      for (const q of st.sand) {
        q.x += q.vx * (0.6 + gust) * dt;
        q.y += Math.sin(clock * 0.0012 + q.seed) * 0.05 * dt;
        if (q.x < -30) { q.x = W + Math.random() * 40; q.y = H * (0.30 + Math.random() * 0.56); }
        g.moveTo(q.x, q.y); g.lineTo(q.x + q.len * (0.6 + gust), q.y + 0.6);
      }
      g.stroke();
    },
  };
  function drawRidge(g, r, H, clock) {
    const d = r.driftA * Math.sin(clock * r.driftS + r.phase);
    const xs = r.xs, ys = r.ys, n = xs.length;
    g.fillStyle = r.fill;
    g.beginPath(); g.moveTo(xs[0] + d, H + 2);
    for (let i = 0; i < n; i++) g.lineTo(xs[i] + d, ys[i]);
    g.lineTo(xs[n - 1] + d, H + 2); g.closePath(); g.fill();
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
  function vDrawTrail(g, r) {
    if (r.tn < 2) return;
    const start = (r.thead - r.tn + 1 + V_CAP * 2) % V_CAP, BANDS = 6;
    g.lineWidth = 2.4; g.lineJoin = 'round'; g.lineCap = 'round';
    for (let b = 0; b < BANDS; b++) {
      const k0 = Math.floor(b * (r.tn - 1) / BANDS), k1 = Math.floor((b + 1) * (r.tn - 1) / BANDS);
      if (k1 <= k0) continue;
      g.strokeStyle = `rgba(${r.col},${0.85 * Math.pow((b + 1) / BANDS, 1.5)})`;
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
      return {
        bars: skyline ? skyline.querySelectorAll('.bar') : null,
        nextRender: 0,
        riders: [
          vMakeRider(s, cy, -1, '41,230,255', 0.34),
          vMakeRider(s, cy, +1, '255,46,151', 0.31),
        ],
        pulse: { on: false, x: 0, t0: 0 },
        pulseNext: 4000 + Math.random() * 4000,
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

      for (let ri = 0; ri < st.riders.length; ri++) {
        const r = st.riders[ri], pa = r.path;
        let rem = r.speed * dt;
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

        r.tacc += dt;
        if (r.tacc >= 32) {
          r.tacc = 0;
          r.thead = (r.thead + 1) % V_CAP;
          r.tx[r.thead] = r.hx; r.ty[r.thead] = r.hy; r.tb[r.thead] = r.brkNext;
          r.brkNext = 0;
          if (r.tn < V_CAP) r.tn++;
        }
        vDrawTrail(g, r);
      }

      g.shadowBlur = 12;
      for (let ri = 0; ri < st.riders.length; ri++) {
        const r = st.riders[ri];
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
      return { C, rowH, nextTrace: 0 };
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

      for (let i = 0; i < n; i++) { const c = C[i]; c.acc += dt; c.stepped = c.acc >= c.step; if (c.stepped) c.acc = 0; }

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
      return { J, SNOW, SHAFTS, levOn: false, levStart: 0, nextLev: -1, levDir: 1, levY: 0 };
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
        const c = 0.5 + 0.5 * Math.sin(clock / j.pp + j.seed);
        const thrust = Math.max(0, Math.cos(clock / j.pp + j.seed));
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
      g.globalAlpha = 1;
    },
  };
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
      r, re: r, c: 0,
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
  }

  /* ============================================================
     ARCADIA: the 8-bit cabinet — pixel rank, patrol ship, CRT crunch
     caps: invaders <=10 · stars 36 · 1 shot · 1 explosion
     ============================================================ */
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
      return {
        w, h, N, SPR, CELL,
        gx: leftBound, gy: 128, dir: 1, leftBound, rightBound,
        topStart: 128, resetY: Math.floor(h * 0.60 / 4) * 4, canMove: rightBound > leftBound,
        stepTick: -1, stars, inv,
        shipX: w / 2 - 16, shipTargetX: w / 2 - 16, shipY: Math.floor((h - 76) / 4) * 4,
        shot: { active: false, x: 0, y: 0 }, shotTarget: -1, nextShot: -1,
        expl: { active: false, x: 0, y: 0, start: 0 },
      };
    },
    frame(s, st, dt, clock) {
      const g = s.g, w = s.w, h = s.h, SPR = 32;

      const tick = Math.floor(clock / 480);
      const flip = tick & 1;
      if (tick !== st.stepTick) {
        st.stepTick = tick;
        if (st.canMove) {
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

      for (const iv of st.inv) if (iv.dead && clock > iv.respawnAt) iv.dead = false;

      const shipMin = 16, shipMax = w - SPR - 16;
      st.shipX += (st.shipTargetX - st.shipX) * (1 - Math.exp(-dt / 620));
      if (Math.abs(st.shipTargetX - st.shipX) < 4)
        st.shipTargetX = shipMin + Math.random() * (shipMax - shipMin);

      if (st.nextShot < 0) st.nextShot = clock + 3000 + Math.random() * 3000;
      if (clock > st.nextShot && !st.shot.active && !st.expl.active) {
        let pick = -1, seen = 0;
        for (let i = 0; i < st.N; i++) if (!st.inv[i].dead) { seen++; if (Math.random() < 1 / seen) pick = i; }
        if (pick >= 0) {
          st.shotTarget = pick; st.shot.active = true;
          st.shot.x = Math.floor(st.shipX / 4) * 4 + 12;
          st.shot.y = st.shipY - 8;
        }
        st.nextShot = clock + 8000 + Math.random() * 6000;
      }

      if (st.shot.active) {
        const ti = st.shotTarget, tIv = st.inv[ti];
        st.shot.y -= 0.32 * dt;
        const invCenterX = st.gx + ti * st.CELL + 16, invCenterY = st.gy + 16;
        st.shot.x += (invCenterX - st.shot.x) * (1 - Math.exp(-dt / 500));
        if (!tIv || tIv.dead) st.shot.active = false;
        else if (st.shot.y <= invCenterY) {
          st.expl.active = true; st.expl.x = invCenterX; st.expl.y = st.gy + 16; st.expl.start = clock;
          tIv.dead = true; tIv.respawnAt = clock + 3000;
          st.shot.active = false;
        } else if (st.shot.y < 8) st.shot.active = false;
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
      arcBlit(g, PLAYER, Math.floor(st.shipX / 4) * 4, st.shipY);
      if (st.shot.active) g.fillRect(Math.floor(st.shot.x / 4) * 4, Math.floor(st.shot.y / 4) * 4, 4, 12);

      if (st.expl.active) {
        const f = Math.floor((clock - st.expl.start) / 64);
        if (f >= 6) st.expl.active = false;
        else { g.fillStyle = '#ff4757'; const fr = EXPL[f]; for (let k = 0; k < fr.length; k++) g.fillRect(st.expl.x + fr[k][0] * 4, st.expl.y + fr[k][1] * 4, 4, 4); }
      }
    },
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
      return { snow, star: null, nextStar: 0 };
    },
    frame(s, st, dt, clock) {
      const g = s.g, w = s.w, h = s.h;
      g.clearRect(0, 0, w, h);
      if (st.nextStar === 0) st.nextStar = clock + 3000 + Math.random() * 5000;

      g.globalCompositeOperation = 'lighter';
      for (let ri = 0; ri < A_RIB.length; ri++) {
        const R = A_RIB[ri];
        const f = 0.5 + 0.5 * Math.sin(clock * R.hs + R.hp);
        const hemRGB = aRGB(R.ca[0], R.cb[0], f), botRGB = aRGB(R.ca[1], R.cb[1], f);
        const hbY = R.hb * h, fbY = R.fb * h;
        const grad = g.createLinearGradient(0, hbY - R.amax * h, 0, fbY);
        grad.addColorStop(0, `rgba(${hemRGB},${R.ha})`);
        grad.addColorStop(0.5, `rgba(${botRGB},${R.ha * 0.4})`);
        grad.addColorStop(1, `rgba(${botRGB},0)`);
        g.fillStyle = grad;
        g.beginPath();
        for (let i = 0; i < A_NX; i++) {
          const xn = A_XS[i]; let y = hbY;
          for (let j = 0; j < 3; j++) { const c = R.comps[j]; y += c.a * h * Math.sin(c.f * xn + c.p + clock * c.s); }
          const x = xn * w; i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
        }
        g.lineTo(w, fbY); g.lineTo(0, fbY); g.closePath(); g.fill();
      }
      g.globalCompositeOperation = 'source-over';

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
  fx.draft = {
    init(s) {
      const cols = Math.ceil(s.w / 56), rows = Math.ceil(s.h / 56);
      const lit = new Float32Array(cols * rows);
      const st = { cols, rows, lit, px: s.w / 2, py: s.h / 2, auto: !matchMedia('(pointer: fine)').matches, at: 0 };
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
      s.g.clearRect(0, 0, s.w, s.h);
      for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
        const v = st.lit[c + r * st.cols];
        if (v <= 0.02) continue;
        const x = c * 56, y = r * 56;
        s.g.strokeStyle = `rgba(100,213,245,${v * 0.5})`;
        s.g.lineWidth = 1;
        s.g.strokeRect(x + 3, y + 3, 50, 50);
        if (v > 0.65) {
          s.g.strokeStyle = `rgba(100,213,245,${(v - 0.65) * 0.9})`;
          s.g.beginPath();
          s.g.arc(x + 28, y + 28, 12 + ((c * 7 + r * 13) % 9), 0.4, 2.6);
          s.g.stroke();
        }
      }
    },
    rm() {
      /* the survey, held: a swath already drafted along a gentle diagonal —
         the world stays deliberately unfinished, but never unstarted */
      const c = document.querySelector('[data-canvas="draft"]');
      if (!c || !c.parentElement) return;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const r = c.parentElement.getBoundingClientRect();
      c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.ceil(r.width / 56), rows = Math.ceil(r.height / 56);
      for (let ri = 0; ri < rows; ri++) for (let ci = 0; ci < cols; ci++) {
        const d = Math.abs(ri / rows - (0.32 + (ci / cols) * 0.3));
        const v = Math.max(0, 1 - d * 5.5) * (0.55 + 0.45 * Math.sin(ci * 3.1 + ri * 1.7));
        if (v <= 0.08) continue;
        const x = ci * 56, y = ri * 56;
        g.strokeStyle = `rgba(100,213,245,${(v * 0.5).toFixed(3)})`;
        g.lineWidth = 1;
        g.strokeRect(x + 3, y + 3, 50, 50);
        if (v > 0.65) {
          g.strokeStyle = `rgba(100,213,245,${((v - 0.65) * 0.9).toFixed(3)})`;
          g.beginPath();
          g.arc(x + 28, y + 28, 12 + ((ci * 7 + ri * 13) % 9), 0.4, 2.6);
          g.stroke();
        }
      }
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
    st.rootX = W * (0.28 + rnd() * 0.44); st.rootY = H * 0.92;
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
    g.addColorStop(0.3, 'rgba(185,169,255,0.42)');
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
            g.strokeStyle = 'rgba(185,169,255,' + (0.10 + st.flashGlow * 0.22).toFixed(3) + ')';
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
     caps: 5 precomputed ridges · embers 96 · smoke 26 · stars <=44 ·
           1 prebaked glow sprite (no per-frame gradients)
     ============================================================ */
  const BCN_N = 7, BCN_STAGGER = 900, BCN_RISE = 260, BCN_HOLD = 3200,
        BCN_SETTLE = 2600, BCN_GAP = 22000, BCN_EMBER = 0.14;
  let beaconTrigger = null;   /* the active FX sets this; the toy button calls it */

  function bcnRun(st, clock) { st.sig.on = true; st.sig.t0 = clock; for (let i = 0; i < BCN_N; i++) st.burst[i] = 0; }
  function bcnEmber(st, x, y, n, sc) {
    for (let c = 0; c < n; c++) {
      let e = null; for (const q of st.embers) if (!q.on) { e = q; break; }
      if (!e) break;
      e.on = true; e.x = x + (Math.random() - 0.5) * 9 * sc; e.y = y - 2 * sc;
      e.vx = (Math.random() - 0.5) * 0.022; e.vy = -(0.03 + Math.random() * 0.06) * sc;
      e.life = 0; e.max = 650 + Math.random() * 750; e.r = (0.7 + Math.random() * 1.3) * sc;
    }
  }
  function bcnSmoke(st, x, y, sc) {
    let m = null; for (const q of st.smoke) if (!q.on) { m = q; break; }
    if (!m) return;
    m.on = true; m.x = x + (Math.random() - 0.5) * 6 * sc; m.y = y - 4 * sc;
    m.vy = -(0.012 + Math.random() * 0.014); m.life = 0; m.max = 3200 + Math.random() * 2600;
    m.seed = Math.random() * 7; m.sway = 6 + Math.random() * 10; m.sc = sc;
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
        return { xs, ys, fill, driftA, driftS, phase: rnd(0, 7) };
      }
      const ridges = [
        ridge(H * 0.40, 54,  'rgba(42,58,100,1)', 8,  0.000026),   /* farthest, lightest dusk blue */
        ridge(H * 0.50, 72,  'rgba(31,44,82,1)',  13, 0.000036),
        ridge(H * 0.61, 92,  'rgba(21,32,64,1)',  19, 0.000048),
        ridge(H * 0.73, 112, 'rgba(13,22,46,1)',  26, 0.000060),
        ridge(H * 0.85, 130, 'rgba(8,14,32,1)',   34, 0.000072),   /* nearest apron (no pyres) */
      ];
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
      for (let i = 0; i < smoke.length; i++) smoke[i] = { on: false, x: 0, y: 0, vy: 0, life: 0, max: 1, seed: 0, sway: 0, sc: 1 };
      const stars = [], sn = Math.round(Math.min(44, W / 26));
      for (let i = 0; i < sn; i++) stars.push({ x: rnd(0, W), y: rnd(H * 0.04, H * 0.42), r: rnd(0.6, 1.6), tw: rnd(0, 7) });
      const st = {
        ridges, pyres, glow: oc, embers, smoke, stars,
        inten: new Float32Array(BCN_N), rdrift: new Float32Array(ridges.length),
        sig: { on: false, t0: 0 }, burst: new Uint8Array(BCN_N),
        next: null, trigger: false, lastEnd: -99999, calm: 1,
        emberAcc: 0, smokeAcc: 0, gust: 0, gustNext: 0,
      };
      st.cleanup = () => { beaconTrigger = null; };               /* Smaug kill 7: drop the toy hook */
      beaconTrigger = () => { st.trigger = true; };
      return st;
    },
    frame(s, st, dt, clock) {
      const g = s.g, W = s.w, H = s.h;
      g.clearRect(0, 0, W, H);
      if (st.next === null) st.next = clock + 4200;

      /* the signal run: auto on a ~22s cadence, or the toy fires it now (no stacking) */
      if (st.trigger) { st.trigger = false; if (!st.sig.on && clock - st.lastEnd > 800) bcnRun(st, clock); }
      if (!st.sig.on && clock >= st.next) bcnRun(st, clock);
      if (st.sig.on) {
        const runEnd = st.sig.t0 + (BCN_N - 1) * BCN_STAGGER + BCN_HOLD + BCN_SETTLE;
        if (clock >= runEnd) { st.sig.on = false; st.lastEnd = clock; st.next = st.sig.t0 + BCN_GAP + Math.random() * 4000; }
      }

      for (let k = 0; k < st.ridges.length; k++) { const r = st.ridges[k]; st.rdrift[k] = r.driftA * Math.sin(clock * r.driftS + r.phase); }

      const settleStart = st.sig.t0 + (BCN_N - 1) * BCN_STAGGER + BCN_HOLD;
      for (let i = 0; i < BCN_N; i++) {
        let it = BCN_EMBER;
        if (st.sig.on) {
          const ig = clock - (st.sig.t0 + i * BCN_STAGGER);     /* the wave reaches pyre i */
          if (ig >= 0) {
            it = ig < BCN_RISE ? BCN_EMBER + (1 - BCN_EMBER) * (ig / BCN_RISE)
                               : 0.82 + 0.07 * Math.sin((clock + i * 370) * 0.018);
            if (!st.burst[i]) { st.burst[i] = 1; const p = st.pyres[i]; bcnEmber(st, p.baseX + st.rdrift[p.ridge], p.y, 14, p.scale); }
            if (clock > settleStart) { const kk = Math.min(1, (clock - settleStart) / BCN_SETTLE); it += (BCN_EMBER - it) * kk; }
          }
        }
        st.inten[i] = it;
      }

      st.calm += ((st.sig.on ? 0.42 : 1) - st.calm) * 0.02;      /* stars sharpen between signals */
      st.gustNext -= dt; if (st.gustNext <= 0) { st.gust = 0.4 + Math.random() * 0.9; st.gustNext = 2600 + Math.random() * 4200; }
      st.gust *= Math.pow(0.9995, dt);
      const wind = 0.25 + 0.18 * Math.sin(clock * 0.0003) + st.gust * 0.5;

      for (const sp of st.stars) {                               /* stars behind the range */
        const tw = 0.55 + 0.45 * Math.sin(clock * 0.0016 + sp.tw);
        g.fillStyle = `rgba(223,233,255,${(0.25 + 0.6 * tw) * st.calm})`;
        g.beginPath(); g.arc(sp.x, sp.y, sp.r, 0, 7); g.fill();
      }

      for (let k = 0; k < st.ridges.length; k++) {               /* ridges far->near, pyres planted on each */
        const r = st.ridges[k], d = st.rdrift[k], xs = r.xs, ys = r.ys, n = xs.length;
        g.fillStyle = r.fill;
        g.beginPath(); g.moveTo(xs[0] + d, H + 2);
        for (let i2 = 0; i2 < n; i2++) g.lineTo(xs[i2] + d, ys[i2]);
        g.lineTo(xs[n - 1] + d, H + 2); g.closePath(); g.fill();
        for (let i = 0; i < BCN_N; i++) { const p = st.pyres[i]; if (p.ridge === k) bcnPyre(g, p.baseX + d, p.y, p.scale, st.inten[i], clock, i); }
      }

      g.globalCompositeOperation = 'lighter';                    /* additive: slope-glow + bloom + embers */
      for (let i = 0; i < BCN_N; i++) {
        const it = st.inten[i]; if (it <= 0.03) continue;
        const p = st.pyres[i], x = p.baseX + st.rdrift[p.ridge], y = p.y, sc = p.scale;
        const sw = (150 + 120 * it) * sc, sh = (60 + 26 * it) * sc;   /* the light on the slope */
        g.globalAlpha = 0.08 + 0.30 * it; g.drawImage(st.glow, x - sw / 2, y - sh * 0.35, sw, sh);
        const bw = (46 + 96 * it) * sc;                              /* the pyre bloom */
        g.globalAlpha = 0.14 + 0.55 * it; g.drawImage(st.glow, x - bw / 2, y - bw * 0.62, bw, bw);
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

      st.emberAcc += dt;                                          /* sparks off the lit pyres */
      if (st.emberAcc > 110) { st.emberAcc = 0;
        for (let i = 0; i < BCN_N; i++) if (st.inten[i] > 0.5 && Math.random() < 0.5) { const p = st.pyres[i]; bcnEmber(st, p.baseX + st.rdrift[p.ridge], p.y, 1, p.scale); }
      }

      st.smokeAcc += dt;                                          /* smoke off ember-state pyres */
      if (st.smokeAcc > 300) { st.smokeAcc = 0;
        let pick = -1, seen = 0;
        for (let i = 0; i < BCN_N; i++) if (st.inten[i] < 0.3) { seen++; if (Math.random() < 1 / seen) pick = i; }
        if (pick >= 0) { const p = st.pyres[pick]; bcnSmoke(st, p.baseX + st.rdrift[p.ridge], p.y, p.scale); }
      }
      for (const m of st.smoke) {
        if (!m.on) continue;
        m.life += dt; const k = m.life / m.max; if (k >= 1) { m.on = false; continue; }
        m.y += m.vy * dt;
        const sway = Math.sin(clock * 0.0011 + m.seed) * m.sway + wind * 6 * k;
        g.globalAlpha = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8) * 0.10;
        g.fillStyle = 'rgba(150,162,190,1)';
        g.beginPath(); g.arc(m.x + sway, m.y, (2 + 7 * k) * m.sc, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    },
    rm() { /* intentional no-op: the frozen mid-burn pose is the .beacon-static SVG (see 03-worlds.css) */ },
  };
  /* the toy: light the chain now. Cooldown lives in bcnRun's guard (no stacked runs). */
  const beaconToy = document.getElementById('light-beacons');
  if (beaconToy) beaconToy.addEventListener('click', () => {
    if (window.Orrery.reduced()) {
      /* rm answer: a one-shot flare of the static SVG pyres (user-initiated) */
      const sec = document.getElementById('world-beacons');
      if (sec) { sec.classList.remove('is-signaled'); void sec.offsetWidth; sec.classList.add('is-signaled'); }
    } else if (beaconTrigger) beaconTrigger();
    window.Orrery.events.dispatchEvent(new CustomEvent('beacon'));
  });

  return { start, stopAll };
})();
window.WorldFX = WorldFX;
