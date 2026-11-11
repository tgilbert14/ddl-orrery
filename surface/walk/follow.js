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
// Reduced motion: a fixed 8 m boom, no pull, no swing behind the walker.

import { height } from '../look-test/height.js';

export const FOLLOW = {
  boom: 8.2, wide: 12.2, close: 6.8,
  pivotUp: 1.0,
  elev: 0.17, elevMin: -0.08, elevMax: 0.95,
  clear: 0.6, hardClear: 0.35,
  frameDown: 8.5 * Math.PI / 180, frameSide: 4.5 * Math.PI / 180,
  idleWide: 3.0,
  omega: 3.2, omegaUp: 9.0, omegaDown: 2.4,
  swingRate: 0.45, swingAfter: 1.6,
};

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function createFollow({ reduced = false } = {}) {
  const s = {
    yaw: 0, elev: FOLLOW.elev, L: FOLLOW.boom, Lt: FOLLOW.boom,
    piv: [0, 0, 0], pv: [0, 0, 0], cam: [0, 0, 0], cv: [0, 0, 0],
    still: 0, sinceLook: 99, init: false, raised: 0, shortened: 0,
    look: [0, 0, 0], viewYaw: 0, viewPitch: 0, base: [0, 0, 0],
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
      if (need - piv[1] <= Math.tan(1.05) * horiz || iter === 4) { raised = need - c[1]; c = [c[0], need, c[2]]; break; }
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

  // f: { x, z, ground, speed, sliding, running, travelYaw|null }; look: { dx, dy } radians
  function update(dt, f, look) {
    if (!s.init) snap(f);
    s.base = [f.x, f.ground + 0.35, f.z];
    if (look.dx || look.dy) { s.yaw = wrapPi(s.yaw + look.dx); s.elev = clamp(s.elev - look.dy, FOLLOW.elevMin, FOLLOW.elevMax); s.sinceLook = 0; }
    else s.sinceLook += dt;
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
      Lt = Math.max(Lt, FOLLOW.boom + (FOLLOW.wide - FOLLOW.boom) * Math.min(1, f.sliding * 1.6));
    }
    if (!moving && !reduced) Lt = Math.max(Lt, s.L);   // standing never pulls the camera back in
    s.Lt = Lt;
    const tauL = Lt > s.L ? 2.2 : 0.9;
    s.L += (Lt - s.L) * (1 - Math.exp(-dt / tauL));
    // the pivot: no bob, smoothed (faster across, slower in height)
    const pt = [f.x, f.ground + FOLLOW.pivotUp, f.z];
    if (dt > 0) {
      [s.piv[0], s.pv[0]] = spring(s.piv[0], s.pv[0], pt[0], 9, dt);
      [s.piv[2], s.pv[2]] = spring(s.piv[2], s.pv[2], pt[2], 9, dt);
      [s.piv[1], s.pv[1]] = spring(s.piv[1], s.pv[1], pt[1], 4.5, dt);
    }
    const b = clearBoom(s.piv, s.yaw, s.elev, s.L);
    s.raised = b.raised; s.shortened = b.shortened;
    if (dt > 0) {
      [s.cam[0], s.cv[0]] = spring(s.cam[0], s.cv[0], b.c[0], FOLLOW.omega, dt);
      [s.cam[2], s.cv[2]] = spring(s.cam[2], s.cv[2], b.c[2], FOLLOW.omega, dt);
      // height: for where the camera is now (it trails the boom), not only where the boom ends
      const yT = Math.max(b.c[1], needY(s.piv, s.cam[0], s.cam[2]));
      [s.cam[1], s.cv[1]] = spring(s.cam[1], s.cv[1], yT, yT > s.cam[1] ? FOLLOW.omegaUp : FOLLOW.omegaDown, dt);
    }
    const floor = height(s.cam[0], s.cam[2]) + FOLLOW.hardClear;
    if (s.cam[1] < floor) { s.cam[1] = floor; s.cv[1] = Math.max(0, s.cv[1]); }
    aim();
  }

  function aim() {
    const dx = s.piv[0] - s.cam[0], dy = s.piv[1] - 0.15 - s.cam[1], dz = s.piv[2] - s.cam[2];
    s.viewYaw = Math.atan2(dz, dx) - FOLLOW.frameSide;
    s.viewPitch = Math.atan2(dy, Math.hypot(dx, dz)) + FOLLOW.frameDown;
  }

  return {
    state: s, update, snap,
    setYaw(y) { s.yaw = y; },
    get position() { return s.cam; },
    // camera-relative axes for the controls (the boom's yaw, not the framing offset)
    get forward() { return [Math.cos(s.yaw), Math.sin(s.yaw)]; },
  };
}
