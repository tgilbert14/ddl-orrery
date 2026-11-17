// The orbit, flown: how far the shuttle is from metal and from the worlds, and which way is out.
// No physics engine, a distance field built from the layout:
//   - the hull body: the lofted superellipse (hull.js), radial distance from its skin, measured at
//     the angle of the point about the ship's axis;
//   - the deck city: height maps over a 5 m grid from every part's box (hull.js gives them):
//     structures standing on the deck (their tops and bottoms, widened by 10 m), and overhead spans
//     (walkways, gantries, cables: up to three bottom-top spans per cell, so a cable over a walkway
//     leaves the gap between them open), so the canyon can be flown under a walkway. A slanted
//     beam's tall box (the fallen mast) is laid in as the line it stands for, not as a block. Below a
//     structure's bottom is open air (the body takes over under the deck and the keel). Inside one,
//     the way out is the nearest of its top, its bottom (when it is raised off the hull) and the
//     nearest open cell sideways;
//   - the worlds: spheres.
// sample(p) -> { d, n } with n the way out (unit); clear(p) -> a distance no metal is nearer than
// (for stepping a fast move); nearestWorld(p, worlds) -> the nearest world.
import { SHIP, halfWidth, deckY, keelY, deckAt } from './hull.js';

const EX = 3.4;
const CELL = 5, X0 = SHIP.stern - 300, X1 = SHIP.bow + 300, Z0 = -380, Z1 = 380;
const NX = Math.ceil((X1 - X0) / CELL), NZ = Math.ceil((Z1 - Z0) / CELL);
const REACH = 4;   // how far (cells) a point inside a widened column looks sideways for open air
const KS = 3;      // overhead spans kept per cell

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
  // overhead: up to KS spans per cell, lowest first: span m of cell k is (sb[k*KS+m], st[k*KS+m])
  const sb = new Float32Array(NX * NZ * KS).fill(1e9), st = new Float32Array(NX * NZ * KS).fill(-1e9);
  // add the span [y0, y1] to cell k: spans closer than GAP join, and past KS spans the two with the
  // smallest gap between them join
  const GAP = 8, T0 = new Float32Array(KS + 1), T1 = new Float32Array(KS + 1);
  const addSpan = (k, y0, y1) => {
    const q0 = k * KS;
    if (st[q0] < -1e8) { sb[q0] = y0; st[q0] = y1; return; }   // the first span
    if (st[q0 + 1] < -1e8 && y0 <= st[q0] + GAP && y1 >= sb[q0] - GAP) { sb[q0] = Math.min(sb[q0], y0); st[q0] = Math.max(st[q0], y1); return; }   // joins the only one
    let c = 0;
    for (let m = 0; m < KS && st[k * KS + m] > -1e8; m++) { T0[c] = sb[k * KS + m]; T1[c] = st[k * KS + m]; c++; }
    // insert in order of bottom, then join neighbours that touch
    let at = c;
    while (at > 0 && T0[at - 1] > y0) { T0[at] = T0[at - 1]; T1[at] = T1[at - 1]; at--; }
    T0[at] = y0; T1[at] = y1; c++;
    for (let m = 0; m < c - 1;) {
      if (T0[m + 1] <= T1[m] + GAP) {
        T1[m] = Math.max(T1[m], T1[m + 1]);
        for (let q = m + 1; q < c - 1; q++) { T0[q] = T0[q + 1]; T1[q] = T1[q + 1]; }
        c--;
      } else m++;
    }
    if (c > KS) {
      let best = 0;
      for (let m = 1; m < c - 1; m++) if (T0[m + 1] - T1[m] < T0[best + 1] - T1[best]) best = m;
      T1[best] = Math.max(T1[best], T1[best + 1]);
      for (let q = best + 1; q < c - 1; q++) { T0[q] = T0[q + 1]; T1[q] = T1[q + 1]; }
      c--;
    }
    for (let m = 0; m < KS; m++) { sb[k * KS + m] = m < c ? T0[m] : 1e9; st[k * KS + m] = m < c ? T1[m] : -1e9; }
  };
  const n = boxes.length / 6, beams = [];
  for (let i = 0; i < n; i++) {
    const [x0, y0, z0, x1, y1, z1] = boxes.subarray(i * 6, i * 6 + 6);
    if (x1 - x0 > 900 || y1 < -100) continue;   // the bow spar, the keel fin and below-deck parts: the body covers them
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const floor = deckAt(Math.max(SHIP.stern, Math.min(SHIP.bow, cx)), Math.max(-300, Math.min(300, cz)));
    const overhead = y0 > floor + 14;
    const i0 = Math.max(0, Math.floor((x0 - X0) / CELL)), i1 = Math.min(NX - 1, Math.floor((x1 - X0) / CELL));
    const j0 = Math.max(0, Math.floor((z0 - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.floor((z1 - Z0) / CELL));
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    // a box this tall and wide both ways off the deck may be a slanted beam's: decided below, once
    // everything else is in
    if (overhead && dy > 120 && dx > 40 && dz > 40) { beams.push([x0, y0, z0, x1, y1, z1]); continue; }
    for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) {
      const k = ii * NZ + jj;
      if (overhead) addSpan(k, y0, y1);
      else { if (y1 > top[k]) top[k] = y1; if (y0 < bot[k]) bot[k] = y0; }
    }
  }
  // The beams. A box does not say which corner a beam rises from. Of the four lines it could be
  // (either plan diagonal, rising either way), when exactly one has its high end on other metal
  // (the fallen mast hangs from its stump across the terraces), and the box is not standing on a
  // plinth, it is that beam: laid in as a span per cell along the line, and the rest of the box is
  // open air. Otherwise it is a solid part (a spire on its plinth) and goes in whole, as any other.
  const holds = (x, y, z) => {   // is there metal at height y within 10 m of (x, z)?
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const ii = i + a, jj = j + b;
      if (ii < 0 || ii >= NX || jj < 0 || jj >= NZ) continue;
      const k = ii * NZ + jj;
      if (top[k] >= y - 10 && bot[k] <= y + 10) return true;
      for (let m = 0; m < KS; m++) if (st[k * KS + m] >= y - 10 && sb[k * KS + m] <= y + 10) return true;
    }
    return false;
  };
  for (const [x0, y0, z0, x1, y1, z1] of beams) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, dl = Math.hypot(dx, dz), slope = dy / dl;
    const hw = 5 + CELL * 0.75, pad = 4 + slope * hw;
    // line c: plan diagonal (x0, za) to (x1, zb), height ya at x0 and yb at x1
    const i0 = Math.max(0, Math.floor((x0 - X0) / CELL)), i1 = Math.min(NX - 1, Math.floor((x1 - X0) / CELL));
    const j0 = Math.max(0, Math.floor((z0 - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.floor((z1 - Z0) / CELL));
    // a part standing on a plinth (metal just under the middle of its foot) is not a beam
    const ci = Math.floor(((x0 + x1) / 2 - X0) / CELL), cj = Math.floor(((z0 + z1) / 2 - Z0) / CELL);
    const plinth = ci >= 0 && ci < NX && cj >= 0 && cj < NZ && Math.abs(top[ci * NZ + cj] - y0) < 5;
    const lines = [];
    if (!plinth) for (const [za, zb] of [[z0, z1], [z1, z0]]) for (const [ya, yb] of [[y1, y0], [y0, y1]]) {
      if (ya > yb ? holds(x0, ya, za) : holds(x1, yb, zb)) lines.push({ za, zb, ya, yb });
    }
    if (lines.length !== 1) {
      for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) addSpan(ii * NZ + jj, y0, y1);
      continue;
    }
    for (const l of lines) {
      const lz = l.zb - l.za;
      for (let ii = i0; ii <= i1; ii++) for (let jj = j0; jj <= j1; jj++) {
        const px = X0 + (ii + 0.5) * CELL - x0, pz = Z0 + (jj + 0.5) * CELL - l.za;
        if (Math.abs(px * lz - pz * dx) / dl > hw) continue;
        const t = Math.max(0, Math.min(1, (px * dx + pz * lz) / (dl * dl))), yc = l.ya + (l.yb - l.ya) * t;
        addSpan(ii * NZ + jj, Math.max(y0, yc - pad), Math.min(y1, yc + pad));
      }
    }
  }
  // widen the standing structures by two cells (the shuttle feels a wall 10 m before it): the highest
  // top and the lowest bottom around each cell
  const wide = new Float32Array(NX * NZ).fill(-1e9), wbot = new Float32Array(NX * NZ).fill(1e9);
  const ovHi = new Float32Array(NX * NZ).fill(-1e9);   // the top of the highest overhead span (the lowest's bottom is sb[k * KS])
  let topMax = -1e9;
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
    let m = -1e9, lo = 1e9;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      const ii = i + a, jj = j + b;
      if (ii >= 0 && ii < NX && jj >= 0 && jj < NZ) { const k = ii * NZ + jj; if (top[k] > m) m = top[k]; if (bot[k] < lo) lo = bot[k]; }
    }
    wide[i * NZ + j] = m; wbot[i * NZ + j] = lo;
    topMax = Math.max(topMax, m);
    const k = i * NZ + j;
    for (let q = 0; q < KS; q++) if (st[k * KS + q] > -1e8) { ovHi[k] = st[k * KS + q]; topMax = Math.max(topMax, ovHi[k]); }
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
  // the overhead spans over (x, z): [bottom, top, bottom2, top2, ...] lowest first, or null
  const OV = (x, z) => {
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    if (i < 0 || i >= NX || j < 0 || j >= NZ) return null;
    const k = i * NZ + j, out = [];
    for (let m = 0; m < KS && st[k * KS + m] > -1e8; m++) out.push(sb[k * KS + m], st[k * KS + m]);
    return out.length ? out : null;
  };
  // is the column at cell k raised off the hull (open air just under its bottom)? Asked only from
  // inside a column, so worked out on demand and kept: 0 not yet known, 1 raised, 2 on the hull
  const raised = new Uint8Array(NX * NZ);
  const RP = [0, 0, 0], RB = { d: 0, n: [0, 0, 0] };
  const isRaised = (k) => {
    if (!raised[k]) {
      RP[0] = X0 + (Math.floor(k / NZ) + 0.5) * CELL; RP[1] = wbot[k] - 3; RP[2] = Z0 + (k % NZ + 0.5) * CELL;
      raised[k] = bodyInto(RP, RB).d > 6 ? 1 : 2;
    }
    return raised[k] === 1;
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
    const i = Math.floor((x - X0) / CELL), j = Math.floor((z - Z0) / CELL);
    if (i < 0 || i >= NX || j < 0 || j >= NZ) return out;
    const k0 = i * NZ + j;
    const h = wide[k0], lo = wbot[k0];
    let inCol = false;
    if (h > -1e8) {
      if (y < lo) {
        // under a raised structure (a sponson, a gallery's foot): open air, its bottom above. (Under
        // a structure on the deck this is inside the hull, and the body answers.)
        if (lo - y < 60) { out.d = lo - y; out.n[1] = -1; }
      } else {
        const d = y - h;
        if (d < 60) {
          const e = CELL * 2, g = y - 80;   // empty cells read as low ground, not a cliff
          const gx = (Math.max(H(x + e, z), g) - Math.max(H(x - e, z), g)) / (2 * e), gz = (Math.max(H(x, z + e), g) - Math.max(H(x, z - e), g)) / (2 * e);
          const n0 = -gx * 0.3, n2 = -gz * 0.3, l = Math.hypot(n0, 1, n2);
          out.d = d; out.n[0] = n0 / l; out.n[1] = 1 / l; out.n[2] = n2 / l;
          inCol = d < 0;
        }
      }
    }
    if (y < ovHi[k0] + 30 && y > sb[k0 * KS] - 30) for (let m = 0, under = h, underBot = lo; m < KS; m++) {
      const b0 = sb[k0 * KS + m], b1 = st[k0 * KS + m];
      if (b1 < -1e8) break;
      const floor = under, floorBot = underBot; under = b1; underBot = b0;
      if (y <= b0 - 30 || y >= b1 + 30) continue;
      const mid = (b0 + b1) / 2;
      // under its middle the way out is down, unless the span sits on a structure or on the span
      // below it (no gap to fly) and the point is in that stack, not under it
      const below = y < mid && !(floor > -1e8 && b0 - floor < 20 && y > floorBot);
      const d = below ? b0 - y : y - b1;
      if (d < out.d) { out.d = d; out.n[0] = 0; out.n[1] = below ? -1 : 1; out.n[2] = 0; }
    }
    if (out.d < 0) {
      // inside metal: out by the nearer of that, the bottom of a raised column, and the nearest open
      // cell sideways (so a tall wall or a deep stack reads as a few metres deep, not its height)
      if (inCol && out.d === y - h && y - lo < -out.d && isRaised(k0)) { out.d = lo - y; out.n[0] = 0; out.n[1] = -1; out.n[2] = 0; }
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
              if (wide[k] >= y && y >= wbot[k]) continue;   // still metal at this height
              if (y <= ovHi[k] && y >= sb[k * KS]) {
                let ov = false;
                for (let m = 0; m < KS && !ov; m++) ov = sb[k * KS + m] <= y && y <= st[k * KS + m];
                if (ov) continue;
              }
            }
            const cx0 = X0 + ii * CELL, cz0 = Z0 + jj * CELL;
            const qx = Math.max(cx0, Math.min(cx0 + CELL, x)) - x, qz = Math.max(cz0, Math.min(cz0 + CELL, z)) - z;
            const q = Math.hypot(qx, qz);
            // on a cell's edge the way out is straight across it (from this cell toward that one)
            if (q < best) { best = q; bx = qx; bz = qz; if (q < 1e-6) { bx = a; bz = b; } }
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
