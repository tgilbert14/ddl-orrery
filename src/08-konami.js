/* ============================================================
   08-konami.js — the Konami rite. A self-contained fragment that
   attaches lazily to window.Orrery (already booted by the end of 07).
   Keyboard: up up down down left right left right b a.
   Touch:    seven taps on the HUD brand link within 4s.
   Unlock →  the Colossus flyby (sky) · the orrery spin-up · the seal.
   No text in canvas. No IP. Compositor-only CSS. Pooled, no per-frame alloc.
   ============================================================ */
'use strict';

(() => {
  const O = window.Orrery;
  if (!O || !O.events || !O.ticker) return;          /* engine absent → nothing to gate */
  const html = document.documentElement;

  const reduced = () => (O.reduced ? O.reduced() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
  };

  /* ---------- the colossus geometry (all precomputed, zero per-frame alloc) ---------- */
  const FLY_DUR = 16000;                              /* ~16s crossing */
  /* [fraction-along-body, radius-scale] — an immense leviathan, head → tail */
  const COL_SEG = [[0, 1], [0.14, 0.95], [0.28, 0.88], [0.42, 0.76], [0.55, 0.60], [0.68, 0.44], [0.80, 0.30], [0.90, 0.18]];
  const COL_LIGHTS = [0.10, 0.22, 0.34, 0.46, 0.58, 0.70];   /* gold running lights along the flank */
  const COL_DUST = (() => {                           /* faint interior star-dust: deterministic */
    let seed = 91; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const out = [];
    for (let i = 0; i < 14; i++) out.push([0.05 + rnd() * 0.80, (rnd() * 2 - 1) * 0.7, 0.5 + rnd() * 0.8]);
    return out;
  })();
  function colRadiusAt(u) {
    const S = COL_SEG;
    if (u <= S[0][0]) return S[0][1];
    for (let i = 1; i < S.length; i++) {
      if (u <= S[i][0]) { const t = (u - S[i - 1][0]) / (S[i][0] - S[i - 1][0]); return S[i - 1][1] + (S[i][1] - S[i - 1][1]) * t; }
    }
    return S[S.length - 1][1];
  }

  /* ---------- flyby state ---------- */
  let flyActive = false, flyPending = false, flyElapsed = 0, flyDir = 1, flyYRel = 0.22;
  let skyCanvas = null, skyCtx = null;

  function drawColossus(p, clock) {
    if (!skyCtx) { skyCanvas = document.getElementById('sky'); if (!skyCanvas) return; skyCtx = skyCanvas.getContext('2d'); }
    const g = skyCtx, W = innerWidth, H = innerHeight;
    const env = Math.sin(Math.PI * p);
    if (env <= 0.01) return;
    const L = Math.max(W * 1.35, 820);
    const dir = flyDir;
    const x0 = dir > 0 ? p * (W + L) : W - p * (W + L);
    const ry0 = Math.min(120, H * 0.14);
    const y = H * flyYRel + Math.sin(clock / 2600) * 8;

    g.save();
    /* body silhouette — occludes the stars behind it (drawn AFTER the engine's star pass) */
    g.fillStyle = 'rgba(2,4,12,' + (0.9 * Math.min(1, env * 2.4)).toFixed(3) + ')';
    g.beginPath();
    for (let i = 0; i < COL_SEG.length; i++) {
      const cx = x0 - dir * COL_SEG[i][0] * L, rx = L * 0.11 * COL_SEG[i][1];
      g.moveTo(cx + rx, y);
      g.ellipse(cx, y, rx, ry0 * COL_SEG[i][1], 0, 0, 7);
    }
    /* dorsal fin near the head */
    const fx0 = x0 - dir * 0.18 * L;
    g.moveTo(fx0, y - ry0 * 0.55);
    g.quadraticCurveTo(fx0 - dir * 0.05 * L, y - ry0 * 2.5, fx0 - dir * 0.13 * L, y - ry0 * 0.5);
    /* tail fluke */
    const tx = x0 - dir * 0.9 * L;
    g.moveTo(tx, y);
    g.quadraticCurveTo(tx - dir * 0.06 * L, y - ry0 * 1.5, tx - dir * 0.12 * L, y - ry0 * 0.9);
    g.quadraticCurveTo(tx - dir * 0.05 * L, y, tx - dir * 0.12 * L, y + ry0 * 0.9);
    g.quadraticCurveTo(tx - dir * 0.06 * L, y + ry0 * 1.5, tx, y);
    g.closePath();
    g.fill();

    /* faint interior star-dust (decorative dots — no text) */
    g.fillStyle = 'rgba(207,216,255,1)';
    for (let i = 0; i < COL_DUST.length; i++) {
      const u = COL_DUST[i][0], rr = colRadiusAt(u);
      const cx = x0 - dir * u * L, cy = y + COL_DUST[i][1] * ry0 * rr * 0.8;
      const tw = 0.5 + 0.5 * Math.sin(clock / 700 + i * 1.3);
      g.globalAlpha = env * (0.18 + 0.32 * tw);
      g.beginPath(); g.arc(cx, cy, COL_DUST[i][2], 0, 7); g.fill();
    }

    /* gold running lights, blinking along the ventral flank */
    g.shadowColor = 'rgba(255,205,90,0.9)';
    g.shadowBlur = 6;
    g.fillStyle = 'rgba(255,214,120,1)';
    for (let i = 0; i < COL_LIGHTS.length; i++) {
      const u = COL_LIGHTS[i], rr = colRadiusAt(u);
      const cx = x0 - dir * u * L, cy = y + ry0 * rr * 0.5;
      g.globalAlpha = env * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(clock / 300 + i * 1.7)));
      g.beginPath(); g.arc(cx, cy, 2.0, 0, 7); g.fill();
    }
    g.restore();                                       /* never leak shadow/alpha into the engine's next star pass */
  }

  /* the flyby task: added AFTER the engine's ambient task so it paints on top each frame */
  function flyTask(dt, clock) {
    if (!flyActive) return false;
    if (reduced()) { flyActive = false; return false; }   /* live reduced-motion flip → bow out */
    const active = document.querySelector('.scene.is-active');
    if (!active || active.dataset.scene !== 'hub') { flyPending = true; return false; }  /* inside a world → pause */
    flyElapsed += dt;
    const p = flyElapsed / FLY_DUR;
    if (p >= 1) { flyActive = false; return false; }
    drawColossus(p, clock);
    return true;
  }
  function addFlyTask() { O.ticker.add(flyTask); }     /* Set dedups, so a double-add is harmless */
  function startFlyby() {
    if (reduced()) return;
    flyElapsed = 0; flyActive = true;
    flyDir = Math.random() < 0.5 ? 1 : -1;
    flyYRel = 0.18 + Math.random() * 0.22;
    const onHub = document.querySelector('.scene.is-active')?.dataset.scene === 'hub';
    if (onHub) { flyPending = false; addFlyTask(); } else { flyPending = true; }
  }
  /* resume a deferred/paused flyby when the traveler returns to orbit (ambient is
     re-added by setScene BEFORE this 'scene' event, so we land after it in the Set) */
  O.events.addEventListener('scene', (e) => {
    if (e.detail && e.detail.name === 'hub' && flyActive && flyPending) { flyPending = false; addFlyTask(); }
  });

  /* ---------- the spin-up: 6s gold pulse flag on <html> ---------- */
  let spinTimer = null;
  function spinUp() {
    html.dataset.konami = '1';
    clearTimeout(spinTimer);
    spinTimer = setTimeout(() => { html.removeAttribute('data-konami'); spinTimer = null; }, 6000);
  }

  /* ---------- the surveyor seal ---------- */
  function showSeal() {
    const host = document.querySelector('.hud-bottom span');
    if (!host || host.querySelector('.konami-seal')) return;
    host.appendChild(document.createTextNode(' \u00b7 '));
    const seal = document.createElement('span');
    seal.className = 'konami-seal';
    seal.title = 'You know the old code.';
    seal.setAttribute('role', 'img');
    seal.setAttribute('aria-label', 'Secret unlocked: you know the old code.');
    host.appendChild(seal);
  }

  /* ---------- unlock ---------- */
  function unlock() {
    store.set('orrery-konami', '1');
    showSeal();
    try { O.events.dispatchEvent(new CustomEvent('konami')); } catch (_) {}   /* the score's fanfare hook */
    spinUp();
    if (!reduced()) startFlyby();                       /* reduced-motion: seal + event + static ring only */
  }

  /* ---------- keyboard rite (never preventDefault: arrows keep scrolling world cards) ---------- */
  const SEQ = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let pos = 0;
  addEventListener('keydown', (e) => {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const k = (e.key || '').toLowerCase();             /* case-insensitive b/a */
    if (k === SEQ[pos]) pos++;
    else pos = (k === SEQ[0]) ? 1 : 0;                  /* wrong key resets (restart if it was the first) */
    if (pos === SEQ.length) { pos = 0; unlock(); }
  }, { passive: true });

  /* ---------- touch rite: seven taps on the brand within 4s ---------- */
  const brand = document.querySelector('.brand');
  if (brand) {
    brand.setAttribute('title', 'seven taps for the old code');
    let taps = 0, firstT = 0, idle = null;
    brand.addEventListener('click', (e) => {
      if (e.detail === 0) return;                       /* keyboard activation → let the link navigate normally */
      /* a modified click means "new tab / window" — the browser owns it, and
         it never counts toward the seven (re-navigating the CURRENT tab after
         preventDefault destroyed the user's intent) */
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();                               /* pointer taps are held on-page so we can count them */
      const now = performance.now();
      if (taps === 0 || now - firstT > 4000) { taps = 0; firstT = now; }
      taps++;
      clearTimeout(idle);
      if (taps >= 7) { taps = 0; unlock(); return; }
      idle = setTimeout(() => {                          /* a lone tap was a real click → honor the link (slight delay).
                                                            480ms, not shorter: the rite's tap cadence must fit inside it */
        const lone = taps === 1; taps = 0;
        if (lone) { try { location.href = brand.href; } catch (_) {} }
      }, 480);
    });
  }

  /* ---------- on load: seal only if already earned this session (no flyby replay) ---------- */
  if (store.get('orrery-konami') === '1') showSeal();
})();
