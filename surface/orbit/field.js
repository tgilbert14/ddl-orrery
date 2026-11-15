// The orbit, flown: how far the shuttle is from metal and from the worlds, and which way is out.
// No physics engine, a distance field built from the layout:
//   - the hull body: the lofted superellipse (hull.js), radial distance from its skin, measured at
//     the angle of the point about the ship's axis;
//   - the deck city: height maps over a 5 m grid from every part's box (hull.js gives them):
//     structures standing on the deck (their tops and bottoms, widened by 10 m), and overhead spans
//     (walkways, gantries, cables: a bottom and a top per cell), so the canyon can be flown under a
//     walkway. Below a structure (under the deck, under the keel) it does not count: the body does.
//     Inside one, the way out is the nearer of its top and the nearest open cell sideways;
//   - the worlds: spheres.
// sample(p) -> { d, n } with n the way out (unit); clear(p) -> a distance no metal is nearer than
// (for stepping a fast move); nearestWorld(p, worlds) -> the nearest world.
import { SHIP, halfWidth, deckY, keelY, deckAt } from './hull.js';

const EX = 3.4;
const CELL = 5, X0 = SHIP.stern - 300, X1 = SHIP.bow + 300, Z0 = -380, Z1 = 380;
const NX = Math.ceil((X1 - X0) / CELL), NZ = Math.ceil((Z1 - Z0) / CELL);
const REACH = 4;   // how far (cells) a point inside a widened column looks sideways for open air

// the skin point at parameter a of the cross-section with half width w, deck t and keel b, written
// into CP (no garbage: the bisection calls this 23 times a sample)
const CP = [0, 0];
function crossPoint(w, t, b, a) {
  const c = Math.cos(a), s = Math.sin(a);
  CP[0] = (s > 0 ? t : -b) * Math.sign(s) * Math.pow(Math.abs(s), 2 / (s > 0 ? EX * 1.6 : EX));
  CP[1] = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / EX);
  return CP;
}

export function createField(boxes) {
  const top = new Float32Array(NX * NZ).fill(-1e9), bot = new Float32Array(NX * NZ).fill(1e9);
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
      else { if (y1 > top[k]) top[k] = y1; if (y0 < bot[k]) bot[k] = y0; }
    }
  }
  // widen the standing structures by two cells (the shuttle feels a wall 10 m before it): the highest
  // top and the lowest bottom around each cell
  const wide = new Float32Array(NX * NZ).fill(-1e9), wbot = new Float32Array(NX * NZ).fill(1e9);
  let topMax = -1e9;
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    let m = -1e9, lo = 1e9;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const ii = i + a, jj = j + b;
      if (ii >= 0 && ii < NX && jj >= 0 && jj < NZ) { const k = ii * NZ + jj; if (top[k] > m) m = top[k]; if (bot[k] < lo) lo = bot[k]; }
    }
    wide[i * NZ + j] = m; wbot[i * NZ + j] = lo;
    topMax = Math.max(topMax, m, ot[i * NZ + j]);
  }
  // every piece of metal the field knows lies inside this box (the body, and the grid's footprint
  // from under the keel to the highest top): outside it, its distance is a safe lower bound
  let keelMin = 0, deckMax = 0;
  for (let x = SHIP.stern; x <= SHIP.bow; x += 10) { keelMin = Math.min(keelMin, keelY(x)); deckMax = Math.max(deckMax, deckY(x)); }
  const BOX = [Math.min(X0, SHIP.stern) - 5, keelMin - 5, Z0 - 5, Math.max(X1, SHIP.bow) + 5, Math.max(topMax, deckMax) + 5, Z1 + 5];

  const H = (x, z) => {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    if (i < 0 || i >= NX || j < 0 || j >= NZ) return -1e9;
    return wide[i * NZ + j];
  };
  const Bot = (x, z) => {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    if (i < 0 || i >= NX || j < 0 || j >= NZ) return 1e9;
    return wbot[i * NZ + j];
  };
  const OV = (x, z) => {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    if (i < 0 || i >= NX || j < 0 || j >= NZ) return null;
    const k = i * NZ + j;
    return ot[k] > -1e8 ? [ob[k], ot[k]] : null;
  };

  // the hull body: signed radial distance from the skin (negative inside), into out
  function bodyInto(p, out) {
    const x = Math.max(SHIP.stern, Math.min(SHIP.bow, p[0]));
    const w = halfWidth(x), t = deckY(x), kb = keelY(x);
    const ry = p[1], rz = p[2];
    const rp = Math.hypot(ry, rz) || 1e-6;
    const th = Math.atan2(ry, rz);
    // the skin point at the same angle about the axis: the superellipse's parameter, by bisection
    // (its angle grows monotonically with the parameter over each half)
    const up = th >= 0;
    let lo = up ? 0 : -Math.PI, hi = up ? Math.PI : 0;
    for (let it = 0; it < 22; it++) {
      const mid = (lo + hi) / 2, c = crossPoint(w, t, kb, mid);
      let am = Math.atan2(c[0], c[1]);
      if (up && am < 0) am += 2 * Math.PI;
      if (!up && am > 0) am -= 2 * Math.PI;
      if (am < th) lo = mid; else hi = mid;
    }
    const c = crossPoint(w, t, kb, (lo + hi) / 2), rs = Math.hypot(c[0], c[1]);
    let d = rp - rs;
    const ex = p[0] < SHIP.stern ? SHIP.stern - p[0] : p[0] > SHIP.bow ? p[0] - SHIP.bow : 0;
    let nx = 0, ny = ry / rp, nz = rz / rp;
    if (ex > 0) { const dd = Math.hypot(Math.max(d, 0), ex); nx = Math.sign(p[0]) * ex / dd; ny *= Math.max(d, 0) / dd; nz *= Math.max(d, 0) / dd; d = d > 0 ? dd : ex; }
    out.d = d; out.n[0] = nx; out.n[1] = ny; out.n[2] = nz;
    return out;
  }
  // the deck city: height above the (widened) tops, with the way out from the slope of the map
  function cityInto(p, out) {
    const x = p[0], y = p[1], z = p[2];
    out.d = 1e9; out.n[0] = 0; out.n[1] = 1; out.n[2] = 0;
    const h = H(x, z);
    // a column is metal from its bottom to its top: well below its bottom (under the deck, under the
    // keel) it is above you, and the body gives the distance there
    if (h > -1e8 && y > Bot(x, z) - 20) {
      const d = y - h;
      if (d < 60) {
        const e = CELL * 2, g = y - 80;   // empty cells read as low ground, not a cliff
        const gx = (Math.max(H(x + e, z), g) - Math.max(H(x - e, z), g)) / (2 * e), gz = (Math.max(H(x, z + e), g) - Math.max(H(x, z - e), g)) / (2 * e);
        const n0 = -gx * 0.3, n2 = -gz * 0.3, l = Math.hypot(n0, 1, n2);
        out.d = d; out.n[0] = n0 / l; out.n[1] = 1 / l; out.n[2] = n2 / l;
      }
    }
    const ov = OV(x, z);
    if (ov && y > ov[0] - 30 && y < ov[1] + 30) {
      const mid = (ov[0] + ov[1]) / 2;
      // under its middle the way out is down, unless the span sits on a structure (no gap to fly)
      const below = y < mid && !(h > -1e8 && ov[0] - h < 20);
      const d = below ? ov[0] - y : y - ov[1];
      if (d < out.d) { out.d = d; out.n[0] = 0; out.n[1] = below ? -1 : 1; out.n[2] = 0; }
    }
    if (out.d < 0) {
      // inside metal: out by the nearer of that and the nearest open cell sideways (so a tall wall
      // or a deep stack reads as a few metres deep, not its height)
      const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
      // ring by ring outward: a cell in ring r is at least (r - 1) cells away, so once the best open
      // cell is nearer than r cells the search is done
      let best = Infinity, bx = 0, bz = 0;
      for (let r = 1; r <= REACH && best > (r - 1) * CELL; r++) {
        for (let a = -r; a <= r; a++) {
          const edge = a === -r || a === r;
          for (let b = -r; b <= r; b += edge ? 1 : 2 * r) {
            const ii = i + a, jj = j + b;
            if (ii >= 0 && ii < NX && jj >= 0 && jj < NZ) {
              const k = ii * NZ + jj;
              if ((wide[k] >= y && y > wbot[k] - 20) || (ob[k] <= y && y <= ot[k])) continue;   // still metal at this height
            }
            const cx0 = X0 + ii * CELL, cz0 = Z0 + jj * CELL;
            const qx = Math.max(cx0, Math.min(cx0 + CELL, x)) - x, qz = Math.max(cz0, Math.min(cz0 + CELL, z)) - z;
            const q = Math.hypot(qx, qz);
            if (q < best) { best = q; bx = qx; bz = qz; if (q < 1e-6) { bx = cx0 + CELL / 2 - x; bz = cz0 + CELL / 2 - z; } }
          }
        }
      }
      if (best < -out.d) {
        const bl = Math.hypot(bx, bz) || 1, l = Math.hypot(1, 0.15);
        out.d = -best; out.n[0] = bx / bl / l; out.n[1] = 0.15 / l; out.n[2] = bz / bl / l;
      }
    }
    return out;
  }
  const SB = { d: 0, n: [0, 0, 0] }, SC = { d: 0, n: [0, 0, 0] };
  const copy = (r) => ({ d: r.d, n: [r.n[0], r.n[1], r.n[2]] });
  // the nearer of the body and the city; a fresh { d, n } (callers may hold it across samples). The
  // same point is often asked for twice in a frame (the loop, then the flight), so the last answer
  // is kept.
  const LP = [NaN, NaN, NaN], LR = { d: 0, n: [0, 0, 0] };
  function sample(p) {
    if (p[0] === LP[0] && p[1] === LP[1] && p[2] === LP[2]) return copy(LR);
    bodyInto(p, SB);
    let r = SB;
    if (SB.d <= 900) { cityInto(p, SC); if (SC.d < SB.d) r = SC; }
    LP[0] = p[0]; LP[1] = p[1]; LP[2] = p[2];
    LR.d = r.d; LR.n[0] = r.n[0]; LR.n[1] = r.n[1]; LR.n[2] = r.n[2];
    return copy(LR);
  }
  // a distance no metal is nearer than: 0 inside the box that holds it all
  function clear(p) {
    const dx = Math.max(BOX[0] - p[0], 0, p[0] - BOX[3]), dy = Math.max(BOX[1] - p[1], 0, p[1] - BOX[4]), dz = Math.max(BOX[2] - p[2], 0, p[2] - BOX[5]);
    return Math.hypot(dx, dy, dz);
  }
  const body = (p) => copy(bodyInto(p, SB));
  const city = (p) => copy(cityInto(p, SC));
  return { sample, clear, body, city, H, OV };
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
