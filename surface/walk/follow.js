// Dust Sea walk: the third-person follow camera.
//
// A boom from a pivot 1 m above the Pilgrim's ground (no footfall bob: the pivot rides the walker's
// mean ground, smoothed) out to the camera, at a yaw the player orbits (mouse, right thumb, Q/E) and
// an elevation they tilt (limited). The camera position is a critically damped spring toward the
// boom's end, so it trails and settles; it climbs faster than it sinks. The boom is about 8 m and
// 2.4 m above the sand; it pulls out to 12 m after a few seconds standing and while sliding, and in
// to 6.8 m running. Before the spring, the boom end is raised (and if that is not enough, shortened)
// so the straight line to the pivot clears the sand, and after it the camera is held above the sand.
// The view aims above the figure, so it sits in the lower third, a little left of centre.
// Reduced motion: a fixed 8 m boom, no pull, no swing behind the walker; the slide view is a cut
// (state.cut is raised for one frame; main.js cross-fades it from a still of the frame before).
//
// Sliding (the showpiece): the camera eases (0.8 s in, 1.2 s out) to a low three-quarter side view,
// about 6.8 m off the figure across the fall line, a little uphill of square, with its eye a little
// below the figure's head, looking across and down the face so its foot is in frame. The side is
// picked once when the slide begins (sunward, then downwind, then wherever the camera already is)
// and held. The player's orbit still turns it (as an offset), and the tilt is limited in every mode;
// sliding, the view looks down no further than slidePitchMin, so the horizon or the dune's foot stays.

import { height } from '../look-test/height.js';

export const FOLLOW = {
  boom: 8.2, wide: 12.2, close: 6.8,
  pivotUp: 1.0,
  elev: 0.17, elevMin: -0.08, elevMax: 0.5,
  clear: 0.6, hardClear: 0.35,
  maxSteep: 0.72,             // the boom is shortened rather than raised above this angle (rad)
  pitchMin: -0.62, pitchMax: 0.35,   // the view's pitch, every mode (rad)
  slidePitchMin: -0.36,       // sliding, the view looks down no further than this, so the horizon or the dune's foot stays in frame
  slideElevMax: 0.3,          // sliding, the player's tilt offset (rad)
  // the slide view
  slideIn: 0.8, slideOut: 1.2, slideDist: 6.2, slideUp: 1.2, slideBack: 0.12, slideAim: 2.6, slideAimUp: 0.75,
  frameDown: 8.5 * Math.PI / 180, frameSide: 4.5 * Math.PI / 180,
  idleWide: 3.0,
  omega: 3.2, omegaUp: 9.0, omegaDown: 2.4,
  swingRate: 0.45, swingAfter: 1.6,
  // the crest leap: the boom eases out by this much, and the pivot's height follows the figure (not
  // the sand) at this share of its usual rate, so the figure visibly drops in frame; no cut
  airOut: 1.4, airLag: 0.45, airIn: 0.1, airOutTau: 0.6, airTilt: 0.16,
};

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createFollow({ reduced = false } = {}) {
  const s = {
    yaw: 0, elev: FOLLOW.elev, L: FOLLOW.boom, Lt: FOLLOW.boom,
    piv: [0, 0, 0], pv: [0, 0, 0], cam: [0, 0, 0], cv: [0, 0, 0],
    still: 0, sinceLook: 99, init: false, raised: 0, shortened: 0,
    look: [0, 0, 0], viewYaw: 0, viewPitch: 0, base: [0, 0, 0],
    sm: 0, cut: false, slideOn: false, slideSide: 1, slideOff: 0, slideElev: 0, sdir: [1, 0], fig: [0, 0, 0], gv: 0, lv: [0, 0],
    air: 0,
  };

  function boomEnd(piv, yaw, elev, L) {
    return [piv[0] - Math.cos(yaw) * Math.cos(elev) * L, piv[1] + Math.sin(elev) * L, piv[2] - Math.sin(yaw) * Math.cos(elev) * L];
  }
  // raise the boom end until the line to the pivot clears the sand; shorten it when that is too steep
  function clearBoom(piv, yaw, elev, L) {
    let c = boomEnd(piv, yaw, elev, L), shortened = 0, raised = 0;
    for (let iter = 0; iter < 5; iter++) {
      const need = Math.max(c[1], needY(piv, c[0], c[2]));
      const horiz = Math.hypot(c[0] - piv[0], c[2] - piv[2]);
      if (need - piv[1] <= Math.tan(FOLLOW.maxSteep) * horiz || iter === 4) { raised = need - c[1]; c = [c[0], need, c[2]]; break; }
      L *= 0.82; shortened++;
      c = boomEnd(piv, yaw, elev, L);
    }
    return { c, raised, shortened, L };
  }

  // the lowest camera height at (cx, cz) from which the lines to the pivot and to the figure's lower
  // body (0.35 m above its feet, with less clearance) clear the sand
  function needY(piv, cx, cz) {
    let need = -1e9;
    const B = s.base;   // the figure itself (not the smoothed pivot, which lags on a fast slide)
    for (let k = 1; k <= 12; k++) {
      const f = 0.12 + (0.88 * k) / 12;
      const g = height(piv[0] + (cx - piv[0]) * f, piv[2] + (cz - piv[2]) * f);
      const gb = height(B[0] + (cx - B[0]) * f, B[2] + (cz - B[2]) * f);
      need = Math.max(need, piv[1] + (g + FOLLOW.clear - piv[1]) / f, B[1] + (gb + 0.2 - B[1]) / f);
    }
    return need;
  }

  function snap(f) {
    s.fig = [f.x, f.ground, f.z]; s.gv = 0; s.lv = [0, 0];
    s.base = [f.x, f.ground + 0.35, f.z];
    s.piv = [f.x, f.ground + FOLLOW.pivotUp, f.z]; s.pv = [0, 0, 0];
    s.L = s.Lt = FOLLOW.boom;
    const b = clearBoom(s.piv, s.yaw, s.elev, s.L);
    s.cam = b.c.slice(); s.cv = [0, 0, 0]; s.init = true;
    aim();
  }

  function spring(x, v, target, w, dt) {
    // critically damped, substepped for stability
    const n = Math.max(1, Math.ceil(dt * w / 0.25));
    const h = dt / n;
    for (let i = 0; i < n; i++) { const a = w * w * (target - x) - 2 * w * v; v += a * h; x += v * h; }
    return [x, v];
  }

  // f: { x, z, ground, speed, sliding, running, travelYaw|null, slide: [sx, sz] (m/s), sun: [x, z],
  // wind: [x, z], airborne 0/1, airHeight (m) }; look: { dx, dy } radians
  function update(dt, f, look) {
    if (!s.init) snap(f);
    // the crest leap (none of it under reduced motion: the camera does as it would without the leap)
    const airOn = !reduced && f.airborne ? 1 : 0;
    if (dt > 0) s.air += (airOn - s.air) * (1 - Math.exp(-dt / (airOn > s.air ? FOLLOW.airIn : FOLLOW.airOutTau)));
    const airK = s.air * s.air * (3 - 2 * s.air);
    s.base = [f.x, f.ground + 0.35, f.z];
    if (dt > 0) s.gv += ((f.ground - s.fig[1]) / dt - s.gv) * (1 - Math.exp(-dt / 0.15));   // the figure's vertical speed
    s.fig = [f.x, f.ground, f.z];
    if (dt > 0 && f.slide) { const kv = 1 - Math.exp(-dt / 0.3); s.lv[0] += (f.slide[0] - s.lv[0]) * kv; s.lv[1] += (f.slide[1] - s.lv[1]) * kv; }
    // the slide view: on with hysteresis, eased linearly in and out (smoothstepped where it is used)
    const sv = f.slide ? Math.hypot(f.slide[0], f.slide[1]) : 0;
    const wasOn = s.slideOn;
    {
      if (!s.slideOn && f.sliding > 0.14 && sv > 0.3) {
        s.slideOn = true;
        s.sdir = [f.slide[0] / sv, f.slide[1] / sv];
        if (s.sm < 0.05) {   // pick the side once, at the start (never mid-slide)
          const px = -s.sdir[1], pz = s.sdir[0];
          const sun = f.sun || [0, 0], wind = f.wind || [0, 0];
          const cx = s.cam[0] - f.x, cz = s.cam[2] - f.z, cl = Math.hypot(cx, cz) || 1;
          const score = (px * sun[0] + pz * sun[1]) + 0.5 * (px * wind[0] + pz * wind[1]) + 0.35 * (px * cx + pz * cz) / cl;
          s.slideSide = score >= 0 ? 1 : -1;
          s.slideOff = 0; s.slideElev = 0;
        }
      } else if (s.slideOn && f.sliding < 0.12) {
        // leaving the slide view: the boom takes the camera's present bearing (it does not swing
        // round), and the swing behind a walker takes over from there
        s.slideOn = false;
        s.yaw = Math.atan2(f.z - s.cam[2], f.x - s.cam[0]); s.elev = FOLLOW.elev; s.sinceLook = 0;
      }
      if (s.slideOn && sv > 0.3) {
        const k = 1 - Math.exp(-dt / 0.5);
        s.sdir = [s.sdir[0] + (f.slide[0] / sv - s.sdir[0]) * k, s.sdir[1] + (f.slide[1] / sv - s.sdir[1]) * k];
        const l = Math.hypot(s.sdir[0], s.sdir[1]) || 1; s.sdir = [s.sdir[0] / l, s.sdir[1] / l];
      }
      // reduced motion: no swing round; the view cuts (main.js cross-fades the cut)
      if (reduced) { s.sm = s.slideOn ? 1 : 0; if (s.slideOn !== wasOn) s.cut = true; }
      else s.sm = clamp(s.sm + (s.slideOn ? dt / FOLLOW.slideIn : -dt / FOLLOW.slideOut), 0, 1);
    }
    const sm = s.sm * s.sm * (3 - 2 * s.sm);
    if (look.dx || look.dy) {
      s.sinceLook = 0;
      if (s.slideOn) {   // in the slide view the player's orbit is an offset to it
        s.slideOff = clamp(s.slideOff + look.dx, -1.4, 1.4);
        s.slideElev = clamp(s.slideElev - look.dy, -0.1, FOLLOW.slideElevMax);
      } else { s.yaw = wrapPi(s.yaw + look.dx); s.elev = clamp(s.elev - look.dy, FOLLOW.elevMin, FOLLOW.elevMax); }
    } else s.sinceLook += dt;
    const moving = f.speed > 0.3;
    s.still = moving ? 0 : s.still + dt;
    // swing gently behind a walker who has been moving for a while without the player orbiting
    if (!reduced && moving && f.travelYaw !== null && s.sinceLook > FOLLOW.swingAfter) {
      const d = wrapPi(f.travelYaw - s.yaw);
      if (Math.abs(d) < 1.9) s.yaw = wrapPi(s.yaw + clamp(d, -1, 1) * FOLLOW.swingRate * Math.min(1, f.speed / 1.6) * dt);
    }
    // boom length
    let Lt = FOLLOW.boom;
    if (!reduced) {
      if (s.still > FOLLOW.idleWide) Lt = FOLLOW.wide;
      Lt += (FOLLOW.close - FOLLOW.boom) * f.running;
    }
    if (!moving && !reduced) Lt = Math.max(Lt, s.L);   // standing never pulls the camera back in
    Lt += FOLLOW.airOut * airK;
    s.Lt = Lt;
    const tauL = Lt > s.L ? (airK > 0.1 ? 0.7 : 2.2) : 0.9;
    s.L += (Lt - s.L) * (1 - Math.exp(-dt / tauL));
    // the pivot: no bob, smoothed (faster across, slower in height). In a leap it follows the figure
    // itself, more slowly, so the drop shows in frame
    const pt = [f.x, f.ground + (airOn ? f.airHeight || 0 : 0) + FOLLOW.pivotUp, f.z];
    if (dt > 0) {
      [s.piv[0], s.pv[0]] = spring(s.piv[0], s.pv[0], pt[0], 9, dt);
      [s.piv[2], s.pv[2]] = spring(s.piv[2], s.pv[2], pt[2], 9, dt);
      [s.piv[1], s.pv[1]] = spring(s.piv[1], s.pv[1], pt[1], (4.5 + 4.5 * s.sm) * (1 - (1 - FOLLOW.airLag) * airK), dt);
    }
    // in a leap the boom also tilts up a little, so the landing past a brink is seen over its lip
    const b = clearBoom(s.piv, s.yaw, Math.min(FOLLOW.elevMax, s.elev + FOLLOW.airTilt * airK), s.L);
    // the slide view relaxes the line clearance; not while a leap's landing past a brink settles
    // (the feet would drop behind the lip)
    const relax = 0.6 * sm * (1 - airK);
    s.raised = b.raised; s.shortened = b.shortened;
    if (s.sm > 0) {
      // the slide view's camera, blended with the boom in polar form about the figure (no cut
      // through it), with the spring's lag fed forward so the figure stays where it is framed
      const sd = s.sdir, side = s.slideSide;
      const a = Math.atan2(sd[1], sd[0]) + side * (Math.PI / 2 + FOLLOW.slideBack) + s.slideOff;
      const D = FOLLOW.slideDist;
      const sx = f.x + Math.cos(a) * D, sz = f.z + Math.sin(a) * D;
      const sy = f.ground + FOLLOW.slideUp + Math.tan(s.slideElev) * D + s.gv * (2 / FOLLOW.omega);
      const bx = b.c[0] - f.x, bz = b.c[2] - f.z;
      const ab = Math.atan2(bz, bx), lb = Math.hypot(bx, bz);
      const ang = ab + wrapPi(a - ab) * sm, len = lb + (D - lb) * sm;
      const lead = (2 / FOLLOW.omega) * sm;
      const vx = s.lv[0], vz = s.lv[1];
      b.c = [f.x + Math.cos(ang) * len + vx * lead, b.c[1] + (sy - b.c[1]) * sm, f.z + Math.sin(ang) * len + vz * lead];
      // only the hard floor and a lighter line clearance in the slide view
      const ny = needY(s.piv, b.c[0], b.c[2]);
      if (ny > b.c[1]) b.c[1] += (ny - b.c[1]) * (1 - relax);
    }
    if (dt > 0) {
      [s.cam[0], s.cv[0]] = spring(s.cam[0], s.cv[0], b.c[0], FOLLOW.omega, dt);
      [s.cam[2], s.cv[2]] = spring(s.cam[2], s.cv[2], b.c[2], FOLLOW.omega, dt);
      // height: for where the camera is now (it trails the boom), not only where the boom ends
      const nyc = needY(s.piv, s.cam[0], s.cam[2]);
      const yT = Math.max(b.c[1], b.c[1] + (nyc - b.c[1]) * (1 - relax));
      const wy = yT > s.cam[1] ? FOLLOW.omegaUp : FOLLOW.omegaDown;
      [s.cam[1], s.cv[1]] = spring(s.cam[1], s.cv[1], yT, wy + (FOLLOW.omega - wy) * sm * (1 - airK), dt);
    }
    if (s.cut) {   // a cut: no glide to the new view
      s.cam = b.c.slice(); s.cv = [0, 0, 0];
      const nyc = needY(s.piv, s.cam[0], s.cam[2]);
      s.cam[1] = Math.max(b.c[1], b.c[1] + (nyc - b.c[1]) * (1 - 0.6 * sm));
    }
    const floor = height(s.cam[0], s.cam[2]) + FOLLOW.hardClear;
    if (s.cam[1] < floor) { s.cam[1] = floor; s.cv[1] = Math.max(0, s.cv[1]); }
    aim();
  }

  function aim() {
    const sm = s.sm * s.sm * (3 - 2 * s.sm);
    let tx = s.piv[0], ty = s.piv[1] - 0.15, tz = s.piv[2];
    if (sm > 0) {
      // the slide view aims a little down the face from the figure, so its foot is in frame
      const ax = s.fig[0] + s.sdir[0] * FOLLOW.slideAim, az = s.fig[2] + s.sdir[1] * FOLLOW.slideAim;
      const ay = Math.max(s.fig[1] + FOLLOW.slideAimUp, height(ax, az) + 0.6);
      tx += (ax - tx) * sm; ty += (ay - ty) * sm; tz += (az - tz) * sm;
    }
    const dx = tx - s.cam[0], dy = ty - s.cam[1], dz = tz - s.cam[2];
    s.viewYaw = Math.atan2(dz, dx) - FOLLOW.frameSide * (1 - sm);
    s.viewPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)) + FOLLOW.frameDown * (1 - sm), FOLLOW.pitchMin + (FOLLOW.slidePitchMin - FOLLOW.pitchMin) * sm, FOLLOW.pitchMax);
  }

  return {
    state: s, update, snap,
    setYaw(y) { s.yaw = y; },
    resetSlide() { s.sm = 0; s.cut = false; s.slideOn = false; s.slideOff = 0; s.slideElev = 0; s.lv = [0, 0]; s.gv = 0; s.air = 0; },
    get position() { return s.cam; },
    // camera-relative axes for the controls (the boom's yaw, not the framing offset)
    get forward() { return [Math.cos(s.yaw), Math.sin(s.yaw)]; },
  };
}
