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
    const map = { 'dust-sea': 'dune', 'velocity': 'velocity', 'grid': 'grid', 'abyssal': 'abyssal', 'arcadia': 'arcadia', 'aurora': 'aurora', 'uncharted': 'draft' };
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
      const move = (e) => { st.px = e.clientX; st.py = e.clientY; };
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
  };

  return { start, stopAll };
})();
window.WorldFX = WorldFX;
