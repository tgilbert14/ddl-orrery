/* ============================================================
   06-worlds.js — the five signatures. One effect per world, no seconds.
   Each FX owns one canvas, pools its particles, joins the shared
   Ticker, and leaves a designed end-state when motion is off.
   ============================================================ */
'use strict';

const WorldFX = (() => {
  const fx = {};
  let activeName = null, activeTask = null, activeCanvas = null, activeCtx = null;

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
    const map = { 'sonora': 'sonora', 'neon-mesa': 'mesa', 'undercurrent': 'current', 'lattice': 'lattice', 'undesignated': 'draft' };
    const name = map[sceneName];
    if (!name || !fx[name]) return;
    if (window.Orrery.reduced()) { fx[name].rm && fx[name].rm(); return; }
    const surf = canvasFor(name);
    if (!surf) return;
    activeName = name; activeCanvas = surf.c; activeCtx = surf.g;
    const state = fx[name].init(surf);
    activeTask = (dt, clock) => {
      if (activeName !== name) return false;
      fx[name].frame(surf, state, dt, clock);
      return true;
    };
    window.Orrery.ticker.add(activeTask);
  }
  function stopAll() {
    if (activeTask) { window.Orrery.ticker.remove(activeTask); activeTask = null; }
    if (activeCtx && activeCanvas) activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    activeName = null;
  }

  /* ---------- SONORA: embers off the ridge (pooled, black-body cooling) ---------- */
  fx.sonora = {
    init(s) {
      const P = [];
      for (let i = 0; i < 42; i++) P.push(newEmber(s, true));
      return { P };
    },
    frame(s, st, dt) {
      s.g.clearRect(0, 0, s.w, s.h);
      for (const p of st.P) {
        p.life += dt;
        p.vy -= 0.00001 * dt;                          /* light buoyancy */
        p.vx += Math.sin(p.life / 400 + p.seed) * 0.0004;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const k = p.life / p.max;
        if (k >= 1 || p.y < -10) Object.assign(p, newEmber(s, false));
        const warm = k < 0.25 ? '255,222,160' : k < 0.55 ? '255,178,94' : '255,122,69';
        s.g.fillStyle = `rgba(${warm},${(1 - k) * 0.8})`;
        s.g.beginPath(); s.g.arc(p.x, p.y, p.r * (1 - k * 0.5), 0, 7); s.g.fill();
      }
    },
  };
  function newEmber(s, scatter) {
    return {
      x: Math.random() * s.w,
      y: scatter ? Math.random() * s.h : s.h * (0.78 + Math.random() * 0.2),
      vx: (Math.random() - 0.5) * 0.012,
      vy: -(0.02 + Math.random() * 0.03),
      r: 1 + Math.random() * 2.2,
      life: 0, max: 3800 + Math.random() * 3200, seed: Math.random() * 9,
    };
  }

  /* ---------- NEON MESA: the skyline is the chart + one light-trail ---------- */
  const skyline = document.getElementById('mesa-skyline');
  const BARS = 26;
  if (skyline) {
    for (let i = 0; i < BARS; i++) {
      const b = document.createElement('i');
      b.className = 'bar';
      b.style.setProperty('--h', (0.25 + Math.random() * 0.6).toFixed(2));
      skyline.appendChild(b);
    }
  }
  fx.mesa = {
    init(s) {
      return { nextRender: 0, trail: { t: Math.random() * 7 } };
    },
    frame(s, st, dt, clock) {
      /* re-render the "dashboard" every few beats: the towers ease to new values */
      if (clock > st.nextRender) {
        st.nextRender = clock + 2600;
        skyline && skyline.querySelectorAll('.bar').forEach(b => {
          b.style.setProperty('--h', (0.2 + Math.random() * 0.72).toFixed(2));
        });
      }
      /* one light-trail running the horizon */
      s.g.clearRect(0, 0, s.w, s.h);
      st.trail.t += dt / 3400;
      const y = s.h * 0.665;
      const x = ((st.trail.t % 1.2) - 0.1) * s.w;
      const grad = s.g.createLinearGradient(x - 130, y, x, y);
      grad.addColorStop(0, 'rgba(41,230,255,0)');
      grad.addColorStop(1, 'rgba(41,230,255,0.85)');
      s.g.strokeStyle = grad; s.g.lineWidth = 2.4;
      s.g.beginPath(); s.g.moveTo(x - 130, y); s.g.lineTo(x, y); s.g.stroke();
      s.g.fillStyle = 'rgba(255,46,151,0.9)';
      s.g.beginPath(); s.g.arc(x, y, 2.6, 0, 7); s.g.fill();
    },
    rm() {   /* static skyline at rest */
      skyline && skyline.querySelectorAll('.bar').forEach((b, i) => {
        b.style.setProperty('--h', (0.3 + ((i * 37) % 50) / 100).toFixed(2));
      });
    },
  };

  /* ---------- UNDERCURRENT: plankton packets + the visible QA reject ---------- */
  fx.current = {
    init(s) {
      const P = [];
      for (let i = 0; i < 34; i++) P.push(newPacket(s, i, true));
      return { P };
    },
    frame(s, st, dt, clock) {
      s.g.clearRect(0, 0, s.w, s.h);
      const gateX = s.w * 0.68;
      const t = clock / 1000;

      /* the three current lanes (faint sine paths) */
      s.g.lineWidth = 1;
      for (let l = 0; l < 3; l++) {
        s.g.strokeStyle = 'rgba(53,240,200,0.10)';
        s.g.beginPath();
        for (let x = 0; x <= s.w; x += 18) {
          const y = laneY(s, l, x, t);
          x === 0 ? s.g.moveTo(x, y) : s.g.lineTo(x, y);
        }
        s.g.stroke();
      }
      /* the QA gate */
      s.g.strokeStyle = 'rgba(191,255,233,0.4)';
      s.g.setLineDash([4, 6]);
      s.g.beginPath(); s.g.moveTo(gateX, s.h * 0.2); s.g.lineTo(gateX, s.h * 0.8); s.g.stroke();
      s.g.setLineDash([]);

      for (const p of st.P) {
        p.x += p.v * dt;
        const flaggedZone = p.flagged && p.x > gateX - 60;
        if (flaggedZone) p.sink += dt * 0.05;           /* diverted: never crosses */
        p.y = laneY(s, p.lane, p.x, t) + Math.sin(t * 2 + p.seed) * 4 + p.sink;
        if (p.x > s.w + 20 || p.y > s.h + 20) Object.assign(p, newPacket(s, p.i, false));
        const col = p.flagged ? (flaggedZone ? '255,84,112' : '255,196,120') : '53,240,200';
        const glow = p.flagged && flaggedZone ? 0.95 : 0.55 + 0.35 * Math.sin(t * 3 + p.seed);
        s.g.fillStyle = `rgba(${col},${glow})`;
        s.g.beginPath(); s.g.arc(p.x, p.y, p.r, 0, 7); s.g.fill();
        if (p.flagged && flaggedZone) {                 /* the reject trail */
          s.g.strokeStyle = 'rgba(255,84,112,0.3)';
          s.g.beginPath(); s.g.moveTo(p.x, p.y); s.g.lineTo(p.x - 26, p.y - p.sink * 0.5); s.g.stroke();
        }
      }
    },
  };
  function laneY(s, lane, x, t) {
    return s.h * (0.3 + lane * 0.18) + Math.sin(x / 140 + t * 0.7 + lane * 2) * 14;
  }
  function newPacket(s, i, scatter) {
    return {
      i, x: scatter ? Math.random() * s.w : -12,
      lane: i % 3, v: 0.05 + Math.random() * 0.05,
      r: 2 + Math.random() * 2.4,
      flagged: Math.random() < 0.12,                    /* every so often, one fails QA */
      sink: 0, seed: Math.random() * 9, y: 0,
    };
  }

  /* ---------- THE LATTICE: crystalline sparkle + the query toy ---------- */
  fx.lattice = {
    init(s) {
      const S = [];
      for (let i = 0; i < 26; i++) S.push({ x: Math.random() * s.w, y: Math.random() * s.h, p: Math.random() * 7, r: 0.8 + Math.random() * 1.6 });
      return { S };
    },
    frame(s, st, dt, clock) {
      s.g.clearRect(0, 0, s.w, s.h);
      const t = clock / 1000;
      for (const sp of st.S) {
        const a = Math.max(0, Math.sin(t * 0.9 + sp.p));
        if (a < 0.55) continue;                        /* sparse glints, not noise */
        s.g.fillStyle = `rgba(207,216,255,${(a - 0.55) * 1.6})`;
        s.g.beginPath(); s.g.arc(sp.x, sp.y, sp.r, 0, 7); s.g.fill();
      }
    },
  };
  const runQuery = document.getElementById('run-query');
  if (runQuery) {
    const latticeScene = document.getElementById('world-lattice');
    runQuery.addEventListener('click', () => {
      latticeScene.classList.remove('is-querying');
      void latticeScene.offsetWidth;                   /* restart the run */
      latticeScene.classList.add('is-querying');
      window.Orrery.events.dispatchEvent(new CustomEvent('query'));
      setTimeout(() => latticeScene.classList.remove('is-querying'), 3200);
    });
  }

  /* ---------- DDL-5: the survey drafts where you look ---------- */
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
      /* on touch, the surveyor drafts on its own, slowly */
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
        if (v > 0.65) {                                /* contour detail appears with study */
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
