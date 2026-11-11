// The Dust Sea ground, as a plain JavaScript function of (x, z) in metres.
// This is the reference: tsl-material.js and glsl-material.js carry the same maths line for line,
// in the same order, and the page checks them against this file at a few points (see main.js).
// The future walker samples this to stand on the sand.
//
// Function order (kept identical in all three files):
//   hash2 -> vnoise -> duneProfile -> heightLow -> height

import { G, DEG } from './params.js';

const WX = Math.cos(G.windDeg * DEG), WZ = Math.sin(G.windDeg * DEG);    // wind direction
const W2X = Math.cos(G.dir2Deg * DEG), W2Z = Math.sin(G.dir2Deg * DEG);  // second dune family
export const WIND = [WX, WZ];

// Integer hash of a lattice point -> [0, 1). 32-bit unsigned wrap-around maths, so JavaScript
// (Math.imul), GLSL ES 3.00 (uint) and WGSL (u32) give bit-identical results.
export function hash2(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h >>> 8) / 16777216;
}

// Value noise in [-1, 1] with a cubic fade.
export function vnoise(x, y) {
  const fx0 = Math.floor(x), fy0 = Math.floor(y);
  const ix = fx0 | 0, iy = fy0 | 0;
  const fx = x - fx0, fy = y - fy0;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const ab = a + (b - a) * ux, cd = c + (d - c) * ux;
  return (ab + (cd - ab) * uy) * 2 - 1;
}

// One dune in profile, t in [0, 1): a long windward rise to a sharp crest at G.crest,
// then a steep lee face that eases into the trough. 0 at both ends, 1 at the crest.
export function duneProfile(t) {
  const c = G.crest;
  const u = t / c;
  const v = (t - c) / (1 - c);
  const up = u * u * (2 - u);
  const down = (1 - v) * (1 - v);
  return t < c ? up : down;
}

// The large forms only: swell + transverse dunes + secondary dunes.
// The shaders march this one for shadows (the fine detail cannot shadow at these sun angles).
export function heightLow(x, z) {
  const a = x * WX + z * WZ;      // along the wind
  const c = -x * WZ + z * WX;     // across the wind
  const wa = G.warp1A * vnoise(x * G.warp1F, z * G.warp1F) + G.warp2A * vnoise(x * G.warp2F + 31.7, z * G.warp2F - 11.3);
  const wc = G.warp1A * vnoise(x * G.warp1F + 57.1, z * G.warp1F + 9.2);
  const a2 = a + wa, c2 = c + wc;

  const swell = G.swellA * vnoise(x * G.swellF + 3.3, z * G.swellF + 7.7);

  const s = a2 / G.L1;
  const k = Math.floor(s);
  const t = s - k;
  const amp = G.A1 * (G.ampBase + (1 - G.ampBase) * (0.5 + 0.5 * vnoise(c2 * G.ampF, k * 0.731 + 0.5)));
  const h1 = amp * duneProfile(t);

  const s2 = (x * W2X + z * W2Z + wa * 0.5) / G.L2;
  const k2 = Math.floor(s2);
  const t2 = s2 - k2;
  const amp2 = G.A2 * (0.5 + 0.5 * vnoise((-x * W2Z + z * W2X) * G.amp2F, k2 * 0.613 + 2.5));
  const h2 = amp2 * duneProfile(t2);

  return swell + h1 + h2;
}

// The full ground: large forms plus medium and small undulation.
export function height(x, z) {
  const d1 = G.det1A * vnoise(x * G.det1F + 1.3, z * G.det1F - 4.1);
  const d2 = G.det2A * vnoise(x * G.det2F - 7.9, z * G.det2F + 2.2);
  return heightLow(x, z) + d1 + d2;
}

// Find a high crest near the origin to stand on: coarse search, then hill climb.
// Deterministic: the same formula always gives the same viewpoint.
export function findCrest(cx = 0, cz = 0, radius = 420, step = 6) {
  let best = -Infinity, bx = cx, bz = cz;
  for (let z = cz - radius; z <= cz + radius; z += step) {
    for (let x = cx - radius; x <= cx + radius; x += step) {
      const h = height(x, z);
      if (h > best) { best = h; bx = x; bz = z; }
    }
  }
  for (let s = step; s > 0.02; s *= 0.5) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [dx, dz] of [[s, 0], [-s, 0], [0, s], [0, -s]]) {
        const h = height(bx + dx, bz + dz);
        if (h > best) { best = h; bx += dx; bz += dz; moved = true; }
      }
    }
  }
  return { x: bx, z: bz, h: best };
}
