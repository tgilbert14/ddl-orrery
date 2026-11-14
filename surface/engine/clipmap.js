// Dust Sea walk: the ground mesh that follows you without swimming.
//
// The look test's ground was a polar grid centred on the camera. Moved with a walker, every vertex
// slides across the dunes every frame, so the chord between two vertices (up to ~0.15 cell of error
// where a slip face meets its foot or its brink) crawls along each slope break at walking speed.
//
// This is a geometry clipmap instead: nested square grids, n cells a side, level k's cell is
// s0 * 2^k. Each level snaps its centre to twice its own cell (so its even vertices are the next
// level's vertices), and every vertex sits on a fixed world lattice: when you walk, vertices do not
// move over the ground, they only appear at a level's leading edge and disappear at its trailing
// edge. Two things keep the levels joined:
//  - a morph band along each level's outer edge (the last `band` cells): odd vertices blend from
//    the formula's height to the straight line between their even neighbours, so at the edge a
//    level is exactly the coarser level's surface (no crack, no pop when a level snaps). The
//    blend follows the camera, so the only motion left is a slow morph inside each band;
//  - the hole: a coarse level leaves out the quads its finer level always covers, and pushes down
//    the vertices of the one-cell fringe the finer level covers on this snap (it sits 0 or 1 coarse
//    cell off centre). The pushed-down walls are under the finer surface, so they never show.
// All quads split along the same diagonal (+x+z), on every level, so a fully morphed fine level is
// the coarse level exactly.
//
// The vertex attribute is (i, k, j): the vertex's lattice index from its level's centre and the
// level. The world position is built in the vertex shader from one uniform, the walker's (x, z).

import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, float, floor, uniform, positionLocal, exp2, abs, max, clamp, select, If, mix, length } from 'three/tsl';

export const CLIP = {
  s0: 1 / 32,      // finest cell (m); a power of two, so every level's lattice is exact in float32
  n: 384,          // cells a side per level (a multiple of 8)
  band: 24,        // morph band (cells) along each level's outer edge
  reach: 6000,     // the coarsest level reaches at least this far (m); the fog closes before it
  push: 400,       // hole vertices are pushed this far down (m)
};

export function levelsFor(n = CLIP.n, s0 = CLIP.s0, reach = CLIP.reach) {
  let k = 0;
  while ((n / 2) * s0 * 2 ** k < reach) k++;
  return k + 1;
}

export function buildClipmap(n = CLIP.n, levels = levelsFor(n)) {
  const V = n + 1, half = n / 2, q = n / 4;
  const pos = new Float32Array(levels * V * V * 3);
  let o = 0;
  for (let k = 0; k < levels; k++) {
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { pos[o++] = i - half; pos[o++] = k; pos[o++] = j - half; }
  }
  const idx = [];
  let tris = 0;
  for (let k = 0; k < levels; k++) {
    const base = k * V * V;
    for (let b = 0; b < n; b++) {
      for (let a = 0; a < n; a++) {
        const ia = a - half, jb = b - half;
        // left out: quads every placement of the finer level covers ([1 - n/4, n/4 - 1] on both axes)
        if (k > 0 && ia >= 1 - q && ia <= q - 1 && jb >= 1 - q && jb <= q - 1) continue;
        const v00 = base + b * V + a, v10 = v00 + 1, v01 = v00 + V, v11 = v01 + 1;
        idx.push(v00, v11, v10, v00, v01, v11);
        tris += 2;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  return { geometry: g, levels, vertices: levels * V * V, triangles: tris, reach: half * CLIP.s0 * 2 ** (levels - 1) };
}

// The positionNode hook for tsl-material.js (opts.walk.groundPosition). uCam is the walker's (x, z).
// extra (third person only): a displacement in metres added to the formula's height (the pour's
// flowing sand), morphed with it, so the levels stay joined.
export function clipmapPosition(heightF, uCam, n = CLIP.n, extra = null) {
  // (only within EXTRA_R of the camera: beyond, a few centimetres of relief is under a pixel)
  const near = (xz) => { const v = float(0.0).toVar(); If(length(xz.sub(uCam)).lessThan(EXTRA_R), () => { v.assign(extra(xz)); }); return v; };
  const height = extra ? (xz) => heightF(xz).add(near(xz)) : heightF;
  const node = Fn(() => {
  const half = n / 2, q = n / 4, B = CLIP.band;
  const ij = positionLocal.xz;
  const k = positionLocal.y;
  const s = exp2(k).mul(CLIP.s0).toVar();
  const s2 = s.mul(2.0);
  const c = floor(uCam.div(s2)).mul(s2).toVar();          // this level's centre
  const xz = c.add(ij.mul(s)).toVar();
  const h = height(xz).toVar();
  // morph toward the coarser level over the last B cells inside the edge (Chebyshev distance from
  // the camera; the edge is never nearer than half - 2 cells)
  const dc = abs(xz.sub(uCam)).div(s);
  const morph = clamp(max(dc.x, dc.y).sub(half - 2 - B).div(B), 0.0, 1.0).toVar();
  const oi = ij.x.sub(floor(ij.x.mul(0.5)).mul(2.0)), oj = ij.y.sub(floor(ij.y.mul(0.5)).mul(2.0));
  const odd = vec2(oi, oj).toVar();
  If(morph.greaterThan(0.0).and(odd.x.add(odd.y).greaterThan(0.5)), () => {
    // the coarse surface here: the mid-point of the coarse edge or diagonal this vertex sits on
    const e = odd.mul(s).toVar();
    const hc = height(xz.sub(e)).add(height(xz.add(e))).mul(0.5);
    h.assign(mix(h, hc, morph));
  });
  // the hole: where the finer level lies on this snap (0 or 1 cell off this level's centre)
  const cf = floor(uCam.div(s)).mul(s);
  const d = cf.sub(c).div(s).toVar();
  const inside = k.greaterThan(0.5)
    .and(ij.x.greaterThan(d.x.sub(q))).and(ij.x.lessThan(d.x.add(q)))
    .and(ij.y.greaterThan(d.y.sub(q))).and(ij.y.lessThan(d.y.add(q)));
  const y = select(inside, h.sub(CLIP.push), h);
  return vec3(xz.x, y, xz.y);
  })();
  return { position: node, world: node };
}

const EXTRA_R = 30;

export function createClipUniform() { return uniform(new THREE.Vector2()); }
