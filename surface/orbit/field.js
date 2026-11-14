// The orbit, flown: how far the shuttle is from metal and from the worlds, and which way is out.
// No physics engine, a distance field built from the layout:
//   - the hull body: the lofted superellipse (hull.js), radial distance from its skin, measured at
//     the angle of the point about the ship's axis;
//   - the deck city: two height maps over a 5 m grid from every part's box (hull.js gives them):
//     structures standing on the deck (their tops, widened by 10 m), and overhead spans (walkways,
//     gantries, cables: a bottom and a top per cell), so the canyon can be flown under a walkway;
//   - the worlds: spheres.
// sample(p) -> { d, n } with n the way out (unit); worldDist(p, worlds) -> nearest world.
import { SHIP, halfWidth, deckY, keelY, deckAt } from './hull.js';

const EX = 3.4;
const CELL = 5, X0 = SHIP.stern - 300, X1 = SHIP.bow + 300, Z0 = -380, Z1 = 380;
const NX = Math.ceil((X1 - X0) / CELL), NZ = Math.ceil((Z1 - Z0) / CELL);

function crossPoint(x, a) {
  const w = halfWidth(x), t = deckY(x), b = keelY(x);
  const c = Math.cos(a), s = Math.sin(a);
  return [(s > 0 ? t : -b) * Math.sign(s) * Math.pow(Math.abs(s), 2 / (s > 0 ? EX * 1.6 : EX)), w * Math.sign(c) * Math.pow(Math.abs(c), 2 / EX)];
}

export function createField(boxes) {
  const top = new Float32Array(NX * NZ).fill(-1e9);
  const ob = new Float32Array(NX * NZ).fill(1e9), ot = new Float32Array(NX * NZ).fill(-1e9);
  const n = boxes.length / 6;
  for (let i = 0; i < n; i++) {
    const [x0, y0, z0, x1, y1, z1] = boxes.subarray(i * 6, i * 6 + 6);
    if (x1 - x0 > 900 || y1 < -100) continue;   // the bow spar, the keel fin and below-deck parts: the body covers them
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const floor = deckAt(Math.max(SHIP.stern, Math.min(SHIP.bow, cx)), Math.max(-300, Math.min(300, cz)));
    const overhead = y0 > floor + 14;
    const i0 = Math.max(0, Math.floor((x0 - X0) / CELL)), i1 = Math.min(NX - 1, Math.floor((x1 - X0) / CELL));
    const j0 = Math.max(0, Math.floor((z0 - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.floor((z1 - Z0) / CELL));
    for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) {
      const k = ii * NZ + jj;
      if (overhead) { if (y0 < ob[k]) ob[k] = y0; if (y1 > ot[k]) ot[k] = y1; }
      else if (y1 > top[k]) top[k] = y1;
    }
  }
  // widen the standing structures by two cells (the shuttle feels a wall 10 m before it)
  const wide = new Float32Array(NX * NZ).fill(-1e9);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    let m = -1e9;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const ii = i + a, jj = j + b;
      if (ii >= 0 && ii < NX && jj >= 0 && jj < NZ) { const v = top[ii * NZ + jj]; if (v > m) m = v; }
    }
    wide[i * NZ + j] = m;
  }
  const H = (x, z) => {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    if (i < 0 || i >= NX || j < 0 || j >= NZ) return -1e9;
    return wide[i * NZ + j];
  };
  const OV = (x, z) => {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    if (i < 0 || i >= NX || j < 0 || j >= NZ) return null;
    const k = i * NZ + j;
    return ot[k] > -1e8 ? [ob[k], ot[k]] : null;
  };

  // the hull body: signed radial distance from the skin (negative inside)
  function body(p) {
    const x = Math.max(SHIP.stern, Math.min(SHIP.bow, p[0]));
    const ry = p[1], rz = p[2];
    const rp = Math.hypot(ry, rz) || 1e-6;
    const th = Math.atan2(ry, rz);
    // the skin point at the same angle about the axis: the superellipse's parameter, by bisection
    // (its angle grows monotonically with the parameter over each half)
    const up = th >= 0;
    let lo = up ? 0 : -Math.PI, hi = up ? Math.PI : 0;
    for (let it = 0; it < 22; it++) {
      const mid = (lo + hi) / 2, c = crossPoint(x, mid);
      let am = Math.atan2(c[0], c[1]);
      if (up && am < 0) am += 2 * Math.PI;
      if (!up && am > 0) am -= 2 * Math.PI;
      if (am < th) lo = mid; else hi = mid;
    }
    const c = crossPoint(x, (lo + hi) / 2), rs = Math.hypot(c[0], c[1]);
    let d = rp - rs;
    const ex = p[0] < SHIP.stern ? SHIP.stern - p[0] : p[0] > SHIP.bow ? p[0] - SHIP.bow : 0;
    let nx = 0, ny = ry / rp, nz = rz / rp;
    if (ex > 0) { const dd = Math.hypot(Math.max(d, 0), ex); nx = Math.sign(p[0]) * ex / dd; ny *= Math.max(d, 0) / dd; nz *= Math.max(d, 0) / dd; d = d > 0 ? dd : ex; }
    return { d, n: [nx, ny, nz] };
  }
  // the deck city: height above the (widened) tops, with the way out from the slope of the map
  function city(p) {
    const h = H(p[0], p[2]);
    let res = { d: 1e9, n: [0, 1, 0] };
    if (h > -1e8) {
      const d = p[1] - h;
      if (d < 60) {
        const e = CELL * 2;
        const Hc = (x, z) => Math.max(H(x, z), p[1] - 80);   // empty cells read as low ground, not a cliff
        const gx = (Hc(p[0] + e, p[2]) - Hc(p[0] - e, p[2])) / (2 * e), gz = (Hc(p[0], p[2] + e) - Hc(p[0], p[2] - e)) / (2 * e);
        // inside a column: out sideways if a wall is near, else up
        const steep = Math.hypot(gx, gz) > 0.5 && d < 0;
        const n = steep ? [-gx, 0.15, -gz] : [-gx * 0.3, 1, -gz * 0.3];
        const l = Math.hypot(...n);
        res = { d, n: n.map((v) => v / l) };
      }
    }
    const ov = OV(p[0], p[2]);
    if (ov && p[1] > ov[0] - 30 && p[1] < ov[1] + 30) {
      const mid = (ov[0] + ov[1]) / 2;
      const below = p[1] < mid;
      const d = below ? ov[0] - p[1] : p[1] - ov[1];
      if (d < res.d) res = { d, n: [0, below ? -1 : 1, 0] };
    }
    return res;
  }
  function sample(p) {
    const b = body(p);
    if (b.d > 900) return b;
    const c = city(p);
    return c.d < b.d ? c : b;
  }
  return { sample, body, city, H, OV };
}

// the nearest world surface (and atmosphere): worlds are [{ pos, R }]
export function nearestWorld(p, worlds) {
  let best = null;
  for (let i = 0; i < worlds.length; i++) {
    const w = worlds[i];
    const d = Math.hypot(p[0] - w.pos[0], p[1] - w.pos[1], p[2] - w.pos[2]) - w.R;
    if (!best || d < best.surfaceDist) best = { i, surfaceDist: d, centreDist: d + w.R };
  }
  return best;
}
