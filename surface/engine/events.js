// The engine's events: things that happen to you (on the Dust Sea the storm front, and the colossus).
// A world lists them in graphics() as `events: [def, ...]` (a single `event: def` is taken as
// [{ name: 'storm', ...def }]); each def lives in surface/worlds/<slug>/<event>.js. The director here
// owns every phase clock and schedule, keeps one event live at a time, and folds what the live one
// asks of the walker, the camera, the figure, the trace, the light and the sound into the shapes the
// engine's modules take. Plain JavaScript (no three), so it can be checked without a browser.
//
// def = { name, phases[], dur{ phase: s }, schedule: { firstMin, firstMax, gapMin, gapMax, nowDelay } | null,
//         call: null | { cooldown }, quiet, create(ctx) -> Event, graphics(gctx) -> EventGraphics }
//   ctx = { reduced, rnd, testMode, world, mode }   (mode: 'now' | 'fast' | 'off' | null, from ?<name>=)
//   gctx = { renderer, shade, lamp, event, reduced }
//
// Event (every hook optional):
//   update(dt, P) -> { cleared?, cut? }   EVERY frame, live or not (P.live false, P.phase 'none'
//                                          between): an event keeps its own background clocks there
//                                          (the storm's gusts and its dome bake). P = { phase, t, live,
//                                          left (the phase the clock left this frame, or null), scale }
//   sound() -> { ... }                     every frame too (shallow-merged), so a voice cut off by
//                                          skipTo is written back to rest, not left where it was
//   only while live:
//   prepare?({ how: 'start' | 'skip', phase, scale, at, bearing, dist })   at a start or a skip
//   uniforms(base, at, cam)                its shaders' uniforms (base: the time's clear-air light)
//   modify(name, v)                        a time-of-day uniform on its way to the shaders (chained)
//   wind(env) -> { strength, gust, mix, figure? }   env = { lamp: [x,y,z] | null, cam: {x,y,z} | null }
//   walk() -> { k, ... } | null            the walker's push (the largest k wins)
//   camera() -> { boom?, amount, toward?: [x, z], shake? }   (shortest boom, largest amount)
//   trace() -> { healMul, clear? }         (healMul multiplied, clear ORed)
//   figure() -> { look?: [x, z], brace?: 0..1 }
//   strike?(e) -> boolean | number         a staff strike (only defs with `call`); e.blocked when it
//                                          cannot call now; true or a delay in seconds: the call is made
//   readout() -> string, state() -> object
//   release()                              once, on the frame live goes false: write calm back
//   api                                    extra members for its __walk wrapper (the storm: visibility)
//
// EventGraphics = { ground?(a), sky?(a), skyPass?: { hook, render(cam, force) }, fog?(col, P, lamp),
//                   particles?({ U, scene }) -> { update(dt, camera), clear(), live }, readout?() }
//   ground and sky are the material hooks (a = { col, ro, rd, dist, face }); sky is the full-resolution
//   path (?skyfull=1), skyPass the half-resolution one; particles is made once the scene holds the
//   figure (its sprites sort after the Pilgrim's) and updates every frame (it hides itself when off).

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// FNV-1a, for the seed of every def after the first
export function hashName(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function eventDefs(WG) {
  if (Array.isArray(WG.events)) return WG.events.filter(Boolean);
  if (WG.event) return [{ name: 'storm', ...WG.event }];
  return [];
}

const MODES = ['now', 'fast', 'off'];

// defs: the world's; url: URLSearchParams; seed: ?seed= or null
export function createDirector({ defs, seed = null, url = null, testMode = false, reduced = false, world = null }) {
  const allOff = url ? url.get('events') === 'off' : false;
  const base = seed != null ? seed >>> 0 : (Math.random() * 4294967296) >>> 0;
  const list = [];   // { def, ev, C (the clock), mode, rnd }
  let quiet = { until: -1, by: null };   // after an event ends, the others wait until here
  let clock = 0;
  let lit = false;                       // light() wrote an event's light last frame
  let camAmt = 0, camBoom = Infinity;    // the camera's push, eased out after a release

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const m = url ? url.get(def.name) : null;
    const mode = allOff ? 'off' : MODES.includes(m) ? m : null;
    const rnd = mulberry32(i === 0 ? base : (base ^ hashName(def.name)) >>> 0);
    const C = { phase: 'none', t: 0, scale: mode === 'fast' ? 4 : 1, clock: 0, next: null, hold: false, live: false, cooldown: -1 };
    const ev = def.create({ reduced, rnd, testMode, world, mode });   // (its own draws come first)
    const e = { def, ev, C, mode, rnd };
    list.push(e);
    schedule(e, true);
  }
  const byName = (n) => list.find((e) => e.def.name === n) || null;
  const live = () => list.find((e) => e.C.phase !== 'none') || null;

  function schedule(e, first) {
    const S = e.def.schedule, C = e.C;
    if (!S || e.mode === 'off') { C.next = null; return; }
    if (testMode && !e.mode) { C.next = null; return; }
    if (e.mode === 'now' && first) { C.next = S.nowDelay; return; }
    const lo = first ? S.firstMin : S.gapMin, hi = first ? S.firstMax : S.gapMax;
    C.next = C.clock + lerp(lo, hi, e.rnd()) / C.scale;
  }
  function begin(e, o = {}) {
    if (o.scale) e.C.scale = o.scale;
    // one at a time: a forced start ends whatever else is live (it releases next frame)
    for (const x of list) if (x !== e && x.C.phase !== 'none') end(x);
    e.ev.prepare?.({ how: 'start', ...o, scale: e.C.scale });
    e.C.phase = e.def.phases[0]; e.C.t = 0; e.C.next = null;
  }
  function end(e) { e.C.phase = 'none'; e.C.t = 0; schedule(e, false); }

  // one frame: the clocks, then every event's update. Returns { cleared, cut }
  function update(dt) {
    const out = { cleared: false, cut: false };
    clock += dt;
    for (const e of list) {
      const C = e.C;
      C.clock += dt;
      let left = null;
      if (C.phase === 'none') {
        if (C.next !== null && C.clock >= C.next) {
          const other = live();
          const q = quiet.by !== e && clock < quiet.until;
          if (!other && !q) begin(e);
          else if (!other) C.next = C.clock + (quiet.until - clock);   // deferred to the end of the quiet
        }
      } else if (!C.hold) {
        C.t += dt * C.scale;
        const d = e.def.dur[C.phase];
        if (C.t >= d) {
          const i = e.def.phases.indexOf(C.phase);
          left = C.phase;
          C.t -= d;
          if (i + 1 < e.def.phases.length) C.phase = e.def.phases[i + 1];
          else { C.phase = 'none'; C.t = 0; schedule(e, false); }
        }
      }
      const wasLive = C.live;
      C.live = C.phase !== 'none';
      if (wasLive && !C.live) quiet = { until: clock + (e.def.quiet || 0) / C.scale, by: e };
      const r = e.ev.update?.(dt, { phase: C.phase, t: C.t, live: C.live, left, scale: C.scale }) || {};
      if (r.cleared) out.cleared = true;
      if (r.cut) out.cut = true;
      if (wasLive && !C.live) e.ev.release?.();
    }
    // the camera's push: the live event's, and after a release eased out over about a second (as the
    // storm's own was)
    const L = live();
    if (L) { const c = L.ev.camera ? L.ev.camera() : null; if (c) camAmt = c.amount; }
    else { camAmt += (0 - camAmt) * (1 - Math.exp(-dt / 1.0)); if (camAmt < 1e-3) camAmt = 0; }
    return out;
  }

  // ---------------------------------------------------------------- folding (only the live event)
  // The engine's modules still take the storm's names for an event's push (walker intent.storm,
  // follow f.storm / f.stormBoom, pilgrim wind.storm, sound storm / stormGust): they are mapped here.
  // Step 4 of the move (renaming them) is not done.
  function wind(out, env = {}) {
    const e = live();
    if (!e || !e.ev.wind) return out;
    const w = e.ev.wind(env);
    if (!w) return out;
    out.strength += (w.strength - out.strength) * w.mix;
    out.gust += (w.gust - out.gust) * w.mix;
    if (w.figure) out.storm = w.figure;
    return out;
  }
  function walk() {
    const e = live();
    const w = e && e.ev.walk ? e.ev.walk() : null;
    return w ? { storm: w } : null;
  }
  // { storm: amount, stormBoom: boom, toward, shake } for the follow camera
  function camera() {
    const e = live();
    if (e && e.ev.camera) {
      const c = e.ev.camera();
      if (c) {
        camAmt = c.amount; if (c.boom !== undefined) camBoom = c.boom;
        return { storm: camAmt, stormBoom: camBoom, toward: reduced ? null : c.toward || null, shake: reduced ? 0 : c.shake || 0 };
      }
    }
    return { storm: camAmt, stormBoom: camBoom === Infinity ? 0 : camBoom, toward: null, shake: 0 };
  }
  function trace() {
    const e = live();
    const t = e && e.ev.trace ? e.ev.trace() : null;
    return t ? { healMul: t.healMul ?? 1, clear: !!t.clear } : { healMul: 1, clear: false };
  }
  function sound() {
    const s = {};
    for (const e of list) if (e.ev.sound) Object.assign(s, e.ev.sound());
    return s;
  }
  function figure() {
    const e = live();
    return e && e.ev.figure ? e.ev.figure() : null;
  }
  // the light: base() -> the time's clear-air values; blend(modify) writes the time's uniforms through
  // modify; restore() writes the time's own values back once, the frame after the last event ends
  function light({ base, at, cam, blend, restore }) {
    const e = live();
    if (e) {
      if (e.ev.uniforms) e.ev.uniforms(base(), at, cam);
      blend(e.ev.modify ? (name, v) => e.ev.modify(name, v) : (name, v) => v);
      lit = true;
    } else if (lit) { restore(); lit = false; }
  }

  // ---------------------------------------------------------------- calls (the staff strike)
  // The engine has already played the strike on the Pilgrim. true when a call was made.
  function strike(ev) {
    const blocked = !!live() || clock < quiet.until;
    let called = false;
    for (const e of list) {
      if (!e.def.call || !e.ev.strike || e.mode === 'off') continue;
      const cooling = e.C.clock < e.C.cooldown;
      const r = e.ev.strike({ ...ev, blocked: blocked || cooling });
      if (r && !blocked && !cooling) {
        const delay = typeof r === 'number' ? r : 0;
        e.C.next = e.C.clock + delay;
        e.C.cooldown = e.C.clock + (e.def.call.cooldown || 0);
        called = true;
      }
    }
    return called;
  }

  // ---------------------------------------------------------------- scripts and the readout
  function start(name, o = {}) { const e = byName(name); if (!e) return false; begin(e, o); return true; }
  function skipTo(name, phase) {
    const e = byName(name); if (!e) return;
    if (phase === 'none') { end(e); return; }
    if (!e.def.phases.includes(phase)) return;
    for (const x of list) if (x !== e && x.C.phase !== 'none') end(x);
    e.ev.prepare?.({ how: 'skip', phase, scale: e.C.scale });
    e.C.phase = phase; e.C.t = 0; e.C.next = null;
  }
  function hold(name, h = true) { const e = byName(name); if (e) e.C.hold = !!h; }
  function state(name) {
    if (name) { const e = byName(name); return e ? { phase: e.C.phase, t: e.C.t, ...(e.ev.state ? e.ev.state() : {}), next: e.C.next !== null ? e.C.next - e.C.clock : null } : null; }
    return Object.fromEntries(list.map((e) => [e.def.name, { phase: e.C.phase, t: e.C.t }]));
  }
  // the event's own state with the director's clock fields over it: reads and writes of phase, t,
  // scale, clock, next and hold reach the clock (scripts set raw().scale, .t and .next)
  const CLOCK_KEYS = new Set(['phase', 't', 'scale', 'clock', 'next', 'hold']);
  function raw(name) {
    const e = byName(name); if (!e) return null;
    const own = (e.ev.raw ? e.ev.raw() : e.ev.state ? e.ev.state() : {}) || {};
    return new Proxy(own, {
      get: (o, k) => (CLOCK_KEYS.has(k) ? e.C[k] : o[k]),
      set: (o, k, v) => { if (CLOCK_KEYS.has(k)) e.C[k] = v; else o[k] = v; return true; },
    });
  }
  function readout(gfx = {}) {
    return list.map((e) => {
      const C = e.C, g = gfx[e.def.name];
      if (C.phase !== 'none') {
        const parts = [e.ev.readout ? e.ev.readout() : '', g && g.readout ? g.readout() : ''].filter(Boolean);
        return `${e.def.name}: ${C.phase} ${C.t.toFixed(0)} s${parts.length ? ', ' + parts.join(', ') : ''}`;
      }
      return `${e.def.name}: none${C.next !== null ? `, next in ${Math.max(0, C.next - C.clock).toFixed(0)} s` : ''}`;
    });
  }

  return {
    update, wind, walk, camera, trace, sound, figure, light, strike,
    list: () => list.map((e) => e.def.name), start, skipTo, hold, state, raw,
    has: (n) => !!byName(n), event: (n) => byName(n)?.ev || null, defs: () => list.map((e) => e.def),
    get live() { const e = live(); return e ? e.def.name : null; },
    readout,
  };
}

// The events' graphics, folded for the engine: the material hooks, the half-resolution sky passes, the
// fog over the figure, and (later, once the scene holds the figure) the particles.
// gctx = { renderer, shade, lamp, reduced, skyFull }; director: the director (its events by name)
export function createEventGraphics(director, gctx) {
  const gfx = {};
  for (const def of director.defs()) if (def.graphics) gfx[def.name] = def.graphics({ ...gctx, event: director.event(def.name) }) || {};
  const all = Object.values(gfx);
  const grounds = all.filter((g) => g.ground), skies = all.filter((g) => g.sky || g.ground);
  const passes = gctx.skyFull ? [] : all.filter((g) => g.skyPass).map((g) => g.skyPass);
  const fogs = all.filter((g) => g.fog).map((g) => g.fog);
  const parts = [];
  return {
    byName: gfx,
    // material hooks (tsl-material.js opts.walk.event / eventSky / eventSkyFull), or null
    ground: grounds.length ? (a) => { for (const g of grounds) g.ground(a); } : null,
    skyFull: !passes.length && skies.length ? (a) => { for (const g of skies) (g.sky || g.ground)(a); } : null,
    skyPass: passes.length ? { hook: (a) => { for (const p of passes) p.hook(a); }, render: (cam, force = false) => { for (const p of passes) p.render(cam, force); } } : null,
    // over the figure's and the puffs' pixels (one event: its own function, untouched)
    fog: fogs.length === 0 ? null : fogs.length === 1 ? fogs[0] : (col, P, lamp) => { for (const f of fogs) f(col, P, lamp); },
    makeParticles(pctx) {
      for (const g of all) if (g.particles) { const p = g.particles(pctx); if (p) parts.push(p); }
    },
    particles(dt, camera) { for (const p of parts) p.update(dt, camera); },
    clearParticles() { for (const p of parts) p.clear(); },
  };
}
