// The Dust Sea ground, as a plain JavaScript function of (x, z) in metres.
// This is the reference: tsl-material.js and glsl-material.js carry the same maths line for line,
// in the same order, and the page checks them against this file at a few points (see main.js).
// The future walker samples this to stand on the sand.
//
// Function order (kept identical in all three files):
//   hash2 -> vnoise -> vnoiseD -> duneProfile -> duneProfileD -> heightLow -> heightLowD
//   -> height -> heightD
// The ...D functions return [value, d/dx, d/dz]: the analytic gradient the shaders use for the
// surface normal (round two; round one took three full height evaluations per pixel).

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

// The same noise with its gradient: [n, dn/dx, dn/dy].
export function vnoiseD(x, y) {
  const fx0 = Math.floor(x), fy0 = Math.floor(y);
  const ix = fx0 | 0, iy = fy0 | 0;
  const fx = x - fx0, fy = y - fy0;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const dux = 6 * fx * (1 - fx), duy = 6 * fy * (1 - fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const ab = a + (b - a) * ux, cd = c + (d - c) * ux;
  return [
    (ab + (cd - ab) * uy) * 2 - 1,
    2 * dux * ((b - a) + ((d - c) - (b - a)) * uy),
    2 * duy * (cd - ab),
  ];
}

// One dune in profile, t in [0, 1): a long windward rise to a crest at G.crest, then a steep lee
// face that eases into the trough. 0 at both ends. The crest is the smooth minimum of the two
// curves, rounded over width k (k near 0 is a knife-edge brink); round one was the hard minimum.
export function duneProfile(t, k) {
  const c = G.crest;
  const u = t / c;
  const v = (t - c) / (1 - c);
  const up = u * u * (2 - u);
  const omv = 1 - v;
  const down = omv * omv;
  const h = Math.min(Math.max(0.5 + 0.5 * (down - up) / k, 0), 1);
  return down + (up - down) * h - k * h * (1 - h);
}

// [profile, d/dt, d/dk]. The smooth minimum's slope is the blend of the two slopes, and its change
// with k is -h(1-h): the terms that come from h moving cancel exactly.
export function duneProfileD(t, k) {
  const c = G.crest;
  const u = t / c;
  const v = (t - c) / (1 - c);
  const up = u * u * (2 - u);
  const omv = 1 - v;
  const down = omv * omv;
  const dup = (4 * u - 3 * u * u) / c;
  const ddown = (-2 * omv) / (1 - c);
  const h = Math.min(Math.max(0.5 + 0.5 * (down - up) / k, 0), 1);
  return [down + (up - down) * h - k * h * (1 - h), ddown + (dup - ddown) * h, -h * (1 - h)];
}

// The large forms only: swell + transverse dunes + secondary dunes.
export function heightLow(x, z) {
  const a = x * WX + z * WZ;      // along the wind
  const c = -x * WZ + z * WX;     // across the wind
  const wa = G.warp1A * vnoise(x * G.warp1F, z * G.warp1F) + G.warp2A * vnoise(x * G.warp2F + 31.7, z * G.warp2F - 11.3);
  const wc = G.warp1A * vnoise(x * G.warp1F + 57.1, z * G.warp1F + 9.2);
  const w3 = G.warp3A * vnoise(x * G.warp3F - 19.4, z * G.warp3F + 23.9);
  const a2 = a + wa + w3, c2 = c + wc;

  const swell = G.swellA * vnoise(x * G.swellF + 3.3, z * G.swellF + 7.7);

  const s = a2 / G.L1;
  const k = Math.floor(s);
  const t = s - k;
  const amp = G.A1 * (G.ampBase + (1 - G.ampBase) * (0.5 + 0.5 * vnoise(c2 * G.ampF, k * 0.731 + 0.5)));
  const kk = G.roundLo + (G.roundHi - G.roundLo) * (0.5 + 0.5 * vnoise(c2 * G.roundF, k * 0.917 + 1.7));
  const h1 = amp * duneProfile(t, kk);

  const s2 = (x * W2X + z * W2Z + wa * 0.5) / G.L2;
  const k2 = Math.floor(s2);
  const t2 = s2 - k2;
  const amp2 = G.A2 * (0.5 + 0.5 * vnoise((-x * W2Z + z * W2X) * G.amp2F, k2 * 0.613 + 2.5));
  const h2 = amp2 * duneProfile(t2, G.round2);

  return swell + h1 + h2;
}

// heightLow with its gradient, by the chain rule through every warp: [h, dh/dx, dh/dz].
export function heightLowD(x, z) {
  const a = x * WX + z * WZ;
  const c = -x * WZ + z * WX;
  const nA = vnoiseD(x * G.warp1F, z * G.warp1F);
  const nB = vnoiseD(x * G.warp2F + 31.7, z * G.warp2F - 11.3);
  const wa = G.warp1A * nA[0] + G.warp2A * nB[0];
  const wax = G.warp1A * G.warp1F * nA[1] + G.warp2A * G.warp2F * nB[1];
  const waz = G.warp1A * G.warp1F * nA[2] + G.warp2A * G.warp2F * nB[2];
  const nC = vnoiseD(x * G.warp1F + 57.1, z * G.warp1F + 9.2);
  const wc = G.warp1A * nC[0];
  const n3 = vnoiseD(x * G.warp3F - 19.4, z * G.warp3F + 23.9);
  const a2 = a + wa + G.warp3A * n3[0], c2 = c + wc;
  const a2x = WX + wax + G.warp3A * G.warp3F * n3[1], a2z = WZ + waz + G.warp3A * G.warp3F * n3[2];
  const c2x = -WZ + G.warp1A * G.warp1F * nC[1], c2z = WX + G.warp1A * G.warp1F * nC[2];

  const nS = vnoiseD(x * G.swellF + 3.3, z * G.swellF + 7.7);

  const s = a2 / G.L1;
  const k = Math.floor(s);
  const t = s - k;
  const nAmp = vnoiseD(c2 * G.ampF, k * 0.731 + 0.5);
  const amp = G.A1 * (G.ampBase + (1 - G.ampBase) * (0.5 + 0.5 * nAmp[0]));
  const ampD = G.A1 * (1 - G.ampBase) * 0.5 * nAmp[1] * G.ampF;
  const nK = vnoiseD(c2 * G.roundF, k * 0.917 + 1.7);
  const kk = G.roundLo + (G.roundHi - G.roundLo) * (0.5 + 0.5 * nK[0]);
  const kkD = (G.roundHi - G.roundLo) * 0.5 * nK[1] * G.roundF;
  const p = duneProfileD(t, kk);
  const h1 = amp * p[0];
  const h1x = ampD * c2x * p[0] + amp * (p[1] * a2x / G.L1 + p[2] * kkD * c2x);
  const h1z = ampD * c2z * p[0] + amp * (p[1] * a2z / G.L1 + p[2] * kkD * c2z);

  const s2 = (x * W2X + z * W2Z + wa * 0.5) / G.L2;
  const k2 = Math.floor(s2);
  const t2 = s2 - k2;
  const nA2 = vnoiseD((-x * W2Z + z * W2X) * G.amp2F, k2 * 0.613 + 2.5);
  const amp2 = G.A2 * (0.5 + 0.5 * nA2[0]);
  const amp2D = G.A2 * 0.5 * nA2[1] * G.amp2F;
  const p2 = duneProfileD(t2, G.round2);
  const h2 = amp2 * p2[0];
  const h2x = amp2D * -W2Z * p2[0] + amp2 * p2[1] * (W2X + wax * 0.5) / G.L2;
  const h2z = amp2D * W2X * p2[0] + amp2 * p2[1] * (W2Z + waz * 0.5) / G.L2;

  return [
    G.swellA * nS[0] + h1 + h2,
    G.swellA * G.swellF * nS[1] + h1x + h2x,
    G.swellA * G.swellF * nS[2] + h1z + h2z,
  ];
}

// The full ground: large forms plus medium and small undulation.
export function height(x, z) {
  const d1 = G.det1A * vnoise(x * G.det1F + 1.3, z * G.det1F - 4.1);
  const d2 = G.det2A * vnoise(x * G.det2F - 7.9, z * G.det2F + 2.2);
  return heightLow(x, z) + d1 + d2;
}

export function heightD(x, z) {
  const lo = heightLowD(x, z);
  const d1 = vnoiseD(x * G.det1F + 1.3, z * G.det1F - 4.1);
  const d2 = vnoiseD(x * G.det2F - 7.9, z * G.det2F + 2.2);
  return [
    lo[0] + G.det1A * d1[0] + G.det2A * d2[0],
    lo[1] + G.det1A * G.det1F * d1[1] + G.det2A * G.det2F * d2[1],
    lo[2] + G.det1A * G.det1F * d1[2] + G.det2A * G.det2F * d2[2],
  ];
}

// Find a high crest near (cx, cz) to stand on: coarse search, then hill climb.
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
