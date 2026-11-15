// Orbit look test: the derelict. A dead ship about 4.4 km long built from code geometry.
// Scale hierarchy, large to small: a lofted, tapered hull; a stepped bridge complex, a spire
// cluster amidships and engine bells; a deck city laid out in plots along streets (terraces,
// towers with spires, raised galleries, chamfered halls) either side of one long canyon lane;
// gantries over the lane, trusses, pipe bundles, rails and flank strakes that run the ship's length;
// roof clutter; and in the shader, panels of varied sizes, seams, soot, thousands of small dark
// windows, worn edges. It is dead: a breach where the plating is gone and the ribs show, a fallen
// mast, a torn sponson. The only light it makes is one small amber window.
//
// Ship frame: +x is the bow, +y is up, +z is starboard. Units are metres.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, positionLocal, normalLocal, abs, floor, fract, min, max, mix, smoothstep, select,
  fwidth, mx_cell_noise_float, mx_fractal_noise_float, uv, length, exp, step, attribute, clamp, vertexStage, uniform,
  vec4, rtt, texture, mod,
} from 'three/tsl';
import { rng } from './light.js';

export const SHIP = { stern: -2200, bow: 2200 };
const L = SHIP.bow - SHIP.stern;

// ---- the hull's outline as functions of x
const smooth01 = (t) => { const c = Math.min(Math.max(t, 0), 1); return c * c * (3 - 2 * c); };
export function halfWidth(x) {
  const u = (x - SHIP.stern) / L;
  const front = Math.pow(Math.min(1, (1 - u) / 0.42), 0.75);
  const back = 0.86 + 0.14 * smooth01(u / 0.08);
  return Math.max(12, 310 * front * back);
}
export function deckY(x) {
  const u = (x - SHIP.stern) / L;
  return 8 + 150 * Math.pow(Math.min(1, (1 - u) / 0.3), 0.6);
}
export function keelY(x) {
  const u = (x - SHIP.stern) / L;
  return -8 - 210 * Math.pow(Math.min(1, (1 - u) / 0.5), 0.9);
}
// the deck surface height at (x, z), from the same superellipse the loft uses
const EX = 3.4;
export function deckAt(x, z) {
  const w = halfWidth(x);
  const c = Math.min(1, Math.pow(Math.min(1, Math.abs(z) / w), EX / 2));
  return deckY(x) * Math.pow(Math.sqrt(1 - c * c), 2 / (EX * 1.6));
}
// the breach: plating gone over the upper port side amidships, the ribs exposed
export const BREACH = { x0: -930, x1: -540 };
// the canyon lane between the two halves of the deck city (ship frame, metres)
export const LANE = Object.freeze({ z0: -10, z1: 100, x0: -1120, x1: 1700 });
const S_LOFT = 72;
const crossPoint = (x, a, scale = 1) => {
  const w = halfWidth(x) * scale, t = deckY(x) * scale, b = keelY(x) * scale;
  const c = Math.cos(a), s = Math.sin(a);
  return [x, (s > 0 ? t : -b) * Math.sign(s) * Math.pow(Math.abs(s), 2 / (s > 0 ? EX * 1.6 : EX)), w * Math.sign(c) * Math.pow(Math.abs(c), 2 / EX)];
};
// is the loft face at (x, angle) torn away?
function inBreach(x, a) {
  const j1 = 26 * Math.sin(a * 7.3) + 14 * Math.sin(a * 13.1 + 1.0);
  const j2 = 30 * Math.sin(a * 5.9 + 2.0) + 12 * Math.sin(a * 17.0);
  const aj = 0.12 * Math.sin(x * 0.05) + 0.07 * Math.sin(x * 0.131 + 0.5);
  const aj2 = 0.10 * Math.sin(x * 0.043 + 1.3) + 0.06 * Math.sin(x * 0.17);
  return x > BREACH.x0 + j1 && x < BREACH.x1 + j2 && a > 1.66 + aj && a < 2.98 + aj2;
}

function loftHull() {
  const stations = [];
  for (let x = SHIP.stern; x <= SHIP.bow - 1; x += 20) stations.push(x);
  stations.push(SHIP.bow);
  const S = S_LOFT;
  const pos = [], idx = [];
  for (const x of stations) {
    for (let j = 0; j < S; j++) pos.push(...crossPoint(x, (j / S) * Math.PI * 2));
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < S; j++) {
      if (inBreach(stations[i] + 10, ((j + 0.5) / S) * Math.PI * 2)) continue;
      const a = i * S + j, b = i * S + ((j + 1) % S), c = (i + 1) * S + j, d = (i + 1) * S + ((j + 1) % S);
      idx.push(a, c, b, b, c, d);
    }
  }
  const centre = pos.length / 3;
  pos.push(SHIP.stern, (deckY(SHIP.stern) + keelY(SHIP.stern)) * 0.5, 0);
  for (let j = 0; j < S; j++) idx.push(centre, j, (j + 1) % S);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals(); // flat facets
  return ng;
}

// merge non-indexed geometries after applying each one's matrix. A part may carry its box size
// (metres): the shader then knows where its edges are (worn edges, a dark foot where it meets the deck).
function merge(list) {
  let n = 0;
  const parts = list.map(([geo, m, size]) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    const local = g.attributes.position.array.slice();
    if (m) g.applyMatrix4(m);
    n += g.attributes.position.count;
    return { g, local, size };
  });
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), EP = new Float32Array(n * 3), EH = new Float32Array(n * 3);
  let o = 0;
  for (const { g, local, size } of parts) {
    const c = g.attributes.position.count;
    P.set(g.attributes.position.array, o * 3);
    N.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < c; i++) {
      for (let k = 0; k < 3; k++) {
        EP[(o + i) * 3 + k] = size ? local[i * 3 + k] * size[k] : 0;
        EH[(o + i) * 3 + k] = size ? size[k] / 2 : 1e4;
      }
    }
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  out.setAttribute('aEP', new THREE.BufferAttribute(EP, 3));
  out.setAttribute('aEH', new THREE.BufferAttribute(EH, 3));
  return out;
}

const M = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return m;
};
const flat = (g) => { const n = g.toNonIndexed(); n.computeVertexNormals(); return n; };
const box = new THREE.BoxGeometry(1, 1, 1);
// unit prisms: footprint 1 x 1 at the base, height 1, centred; taper = top size / base size
const prismCache = new Map();
function prism(sides, taper) {
  const key = `${sides}:${taper}`;
  if (!prismCache.has(key)) {
    const r = sides === 4 ? Math.SQRT1_2 : 0.5 / Math.cos(Math.PI / 8);
    const g = new THREE.CylinderGeometry(r * taper, r, 1, sides, 1).rotateY(Math.PI / sides);
    prismCache.set(key, flat(g));
  }
  return prismCache.get(key);
}
const cone6 = flat(new THREE.ConeGeometry(0.5, 1, 6));
const cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
const cyl16 = new THREE.CylinderGeometry(1, 1, 1, 18, 1);
const cyl32 = new THREE.CylinderGeometry(1, 1, 1, 40, 1);
const cylDuct = new THREE.CylinderGeometry(1, 1, 1, 10, 1);
const dome = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2);
// a barrel vault along x: half a cylinder, unit length, radius 1 (scaled by the caller)
const vault = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2);
const ring = new THREE.RingGeometry(0.86, 1.0, 48);
// a dead craft's hull: a flattened lathe, nose along +y before it is laid down
const hulkBody = new THREE.LatheGeometry([[0, 0.5], [0.35, 0.38], [0.5, 0.1], [0.48, -0.3], [0.35, -0.5], [0, -0.5]].map(([r, y]) => new THREE.Vector2(r, y)), 14);

// a box from point a to point b: length along a-b, d tall (toward up), w wide
function beam(a, b, w, d, up = [0, 1, 0]) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const dir = B.clone().sub(A); const len = dir.length(); dir.normalize();
  let side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(...up));
  if (side.lengthSq() < 1e-6) side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(1, 0, 0));
  side.normalize();
  const u = new THREE.Vector3().crossVectors(side, dir);
  const m = new THREE.Matrix4().makeBasis(dir, u, side).scale(new THREE.Vector3(len, d, w));
  m.setPosition(A.add(B).multiplyScalar(0.5));
  return [box, m, [len, d, w]];
}

function buildParts(seed) {
  const R = rng(seed);
  const R2 = rng(seed * 7 + 13); // detail added in round three draws from its own stream, so the city's layout is unchanged
  const parts = [[loftHull(), null, null]];
  const paint = [];               // faded markings on the lane floor (their own material)
  const add = (geo, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => parts.push([geo, M(x, y, z, sx, sy, sz, rx, ry, rz), [sx, sy, sz]]);
  const roofClutter = (x0, x1, z0, z1, y, k) => {
    for (let i = 0; i < k; i++) {
      const sx = 2 + R() * 9, sz = 2 + R() * 7, sy = 1 + Math.pow(R(), 2) * 7;
      const x = x0 + sx / 2 + R() * Math.max(0, x1 - x0 - sx), z = z0 + sz / 2 + R() * Math.max(0, z1 - z0 - sz);
      if (R() < 0.25) parts.push([cyl8, M(x, y + sy / 2, z, sx * 0.3, sy, sx * 0.3), null]);
      else add(box, x, y + sy / 2, z, sx, sy, sz);
    }
  };
  const antennas = (x, y, z, n, hMax) => {
    for (let i = 0; i < n; i++) {
      const h = hMax * (0.25 + R() * 0.75), r = 0.6 + R() * 1.4;
      const ox = (R() - 0.5) * 14, oz = (R() - 0.5) * 14;
      parts.push([cyl8, M(x + ox, y + h / 2, z + oz, r, h, r), null]);
      if (R() < 0.5) add(box, x + ox, y + h * (0.5 + R() * 0.4), z + oz, 1, 1, 6 + R() * 20);
    }
  };

  // vertical fins along a face at z = zf (facing sgn), every 'step' metres, and a ledge on top
  const pilasters = (x0, x1, zf, sgn, y0, h, stepM) => {
    for (let x = x0 + stepM / 2; x < x1 - 2; x += stepM) add(box, x, y0 + h / 2, zf + sgn * 1.0, 2.2, h, 2.0);
    add(box, (x0 + x1) / 2, y0 + h - 1, zf + sgn * 1.4, x1 - x0, 2, 2.8);
  };
  const pilastersX = (z0, z1, xf, sgn, y0, h, stepM) => {
    for (let z = Math.min(z0, z1) + stepM / 2; z < Math.max(z0, z1) - 2; z += stepM) add(box, xf + sgn * 1.0, y0 + h / 2, z, 2.0, h, 2.2);
  };
  // relief on a lane face (z = zf, facing out along sgn): cornices every few storeys, recessed bays
  // between buttresses, ducts climbing the face, a balcony or two
  const relief = (x0, x1, zf, sgn, y0, h) => {
    const len = x1 - x0;
    for (let y = y0 + 14 + R2() * 10; y < y0 + h - 6; y += 16 + R2() * 14) add(box, (x0 + x1) / 2, y, zf + sgn * 1.6, len, 1.4 + R2() * 1.2, 3.2);
    const bayW = 8 + R2() * 10;
    for (let x = x0 + 4; x + bayW < x1 - 4; x += bayW * 2 + 3) {
      const bh = h * (0.35 + R2() * 0.5);
      add(box, x + bayW / 2, y0 + bh / 2, zf + sgn * 2.4, bayW, bh, 4.8);
    }
    const nd = R2() < 0.6 ? 1 + Math.floor(R2() * 2) : 0;
    for (let i = 0; i < nd; i++) {
      const r = 1.0 + R2() * 1.6, x = x0 + 3 + R2() * (len - 6);
      parts.push([cylDuct, M(x, y0 + h / 2, zf + sgn * (r + 0.8), r, h, r), null]);
    }
    if (R2() < 0.4) {
      const by = y0 + 10 + R2() * (h - 20), bl = Math.min(len - 6, 18 + R2() * 30), bx = x0 + 3 + R2() * (len - bl - 6);
      add(box, bx + bl / 2, by, zf + sgn * 3.5, bl, 0.9, 7);
      add(box, bx + bl / 2, by + 1.3, zf + sgn * 6.8, bl, 1.6, 0.5);
    }
  };
  const roundTower = (xc, zc, base, s, th) => {
    // a round tower with bands, stepping in, a dome on top
    let y = base, r = s / 2;
    const steps = 2 + Math.floor(R2() * 2);
    for (let i = 0; i < steps; i++) {
      const hh = th / steps * (1.1 - i * 0.1);
      parts.push([cyl16, M(xc, y + hh / 2, zc, r, hh, r), [2 * r, hh, 2 * r]]);
      for (let yy = y + 10; yy < y + hh - 4; yy += 14 + R2() * 8) parts.push([cyl16, M(xc, yy, zc, r + 0.9, 1.4, r + 0.9), null]);
      y += hh; r *= 0.72;
    }
    parts.push([dome, M(xc, y, zc, r * 1.15, r * 1.15, r * 1.15), null]);
    return y + r;
  };
  const tank = (x, z, y, r, h) => {
    parts.push([cyl16, M(x, y + h / 2, z, r, h, r), [2 * r, h, 2 * r]]);
    parts.push([dome, M(x, y + h, z, r, r * 0.5, r), null]);
    parts.push([cyl16, M(x, y + h * 0.3, z, r + 0.4, 0.8, r + 0.4), null]);
  };
  // ---- the building types
  // zIn is the face toward the lane (or the inner edge of a band), sgn the side (+1 starboard)
  const terrace = (x0, x1, zIn, zOut, base, H, sgn) => {
    const n = 2 + Math.floor(R() * 3);
    let y = base;
    for (let i = 0; i < n; i++) {
      const len = (x1 - x0) * (1 - i * (0.06 + R() * 0.08));
      const xc = (x0 + x1) / 2 + (R() - 0.5) * (x1 - x0 - len);
      const wid = Math.abs(zOut - zIn) * (1 - 0.2 * i - R() * 0.08);
      const h = (H / n) * (1.15 - 0.15 * i) * (0.8 + R() * 0.4);
      const zc = zIn + sgn * wid / 2;
      add(prism(4, 0.97), xc, y + h / 2, zc, len, h, wid);
      if (R() < 0.85) pilasters(xc - len / 2, xc + len / 2, zIn, -sgn, y, h * 0.97, 9 + R() * 14);
      if (h > 18) relief(xc - len / 2 + 2, xc + len / 2 - 2, zIn, -sgn, y, h * 0.96);
      // a ledge or parapet along the lane face on some levels: a long line
      if (R() < 0.5) add(box, xc, y + h + 1.2, zIn + sgn * 1.5, len, 2.4, 3);
      y += h;
      if (i === n - 1) {
        roofClutter(xc - len / 2, xc + len / 2, Math.min(zIn, zc + sgn * wid / 2), Math.max(zIn, zc + sgn * wid / 2), y, 4 + Math.floor(R() * 7));
        if (R() < 0.3) antennas(xc, y, zc, 1 + Math.floor(R() * 3), 40);
      }
    }
  };
  const tower = (x0, x1, zIn, zOut, base, H, sgn) => {
    const fx = x1 - x0, fz = Math.abs(zOut - zIn);
    const zc = (zIn + zOut) / 2;
    // podium
    const ph = 10 + R() * 16;
    add(prism(4, 0.95), (x0 + x1) / 2, base + ph / 2, zc, fx, ph, fz);
    const s = Math.min(fx, fz) * (0.55 + R() * 0.3);
    const th = H * (1.4 + R() * 1.2);
    const xc = (x0 + x1) / 2 + (R() - 0.5) * (fx - s) * 0.6;
    const taper = 0.78 + R() * 0.12, sz = s * (0.8 + R() * 0.3);
    const round = R2() < 0.4;   // the main stream's draws below are made either way, so the layout holds
    let top = base + ph + th;
    if (round) top = roundTower(xc, zc, base + ph, s, th);
    else {
      add(prism(8, taper), xc, base + ph + th / 2, zc, s, th, sz);
      if (R2() < 0.5) for (let y = base + ph + 20 + R2() * 10; y < base + ph + th - 10; y += 22 + R2() * 16) {
        const k = 1 - (1 - taper) * ((y - base - ph) / th);
        add(prism(8, 1), xc, y, zc, s * k + 3, 1.6, sz * k + 3);
      }
    }
    if (R() < 0.7) { const h2 = th * (0.15 + R() * 0.2); if (!round) { add(prism(8, 0.65), xc, top + h2 / 2, zc, s * 0.5, h2, s * 0.45); top += h2; } }
    if (R() < 0.6) { const sh = 25 + R() * 90; parts.push([cone6, M(xc, top + sh / 2, zc, s * (round ? 0.1 : 0.18), sh, s * (round ? 0.1 : 0.18)), null]); }
    else antennas(xc, top, zc, 2 + Math.floor(R() * 3), 90);
  };
  const gallery = (x0, x1, zIn, zOut, base, H, sgn) => {
    // a long deck raised on columns: you see under it, a long line in the light
    const wid = Math.min(Math.abs(zOut - zIn), 14 + R() * 12);
    const zc = zIn + sgn * (wid / 2 + 2);
    const hy = 14 + R() * 26, sh = 6 + R() * 10;
    add(box, (x0 + x1) / 2, base + hy + sh / 2, zc, x1 - x0, sh, wid);
    add(box, (x0 + x1) / 2, base + hy + sh + 1.5, zc - sgn * (wid / 2 - 1), x1 - x0, 3, 1.5);
    for (let x = x0 + 4; x < x1 - 2; x += 14 + R() * 6) add(box, x, base + hy / 2, zc, 2.5, hy, 2.5);
    roofClutter(x0, x1, zc - wid / 2, zc + wid / 2, base + hy + sh, 3 + Math.floor(R() * 4));
  };
  const hall = (x0, x1, zIn, zOut, base, H) => {
    const h = 8 + H * 0.35 * R();
    add(prism(8, 0.9), (x0 + x1) / 2, base + h / 2, (zIn + zOut) / 2, x1 - x0, h, Math.abs(zOut - zIn));
    if (R2() < 0.5) parts.push([vault, M((x0 + x1) / 2, base + h, (zIn + zOut) / 2, (x1 - x0) * 0.9, Math.min(14, Math.abs(zOut - zIn) * 0.3), Math.abs(zOut - zIn) * 0.42), null]);
    else add(prism(4, 0.4), (x0 + x1) / 2, base + h + 3, (zIn + zOut) / 2, (x1 - x0) * 0.9, 6, Math.abs(zOut - zIn) * 0.4);
    if (R2() < 0.5) tank((x0 + x1) / 2 + (R2() - 0.5) * (x1 - x0) * 0.5, (zIn + zOut) / 2 + (R2() - 0.5) * 20, base + h, 5 + R2() * 8, 8 + R2() * 12);
    roofClutter(x0 + 4, x1 - 4, Math.min(zIn, zOut) + 2, Math.max(zIn, zOut) - 2, base + h, 3);
  };

  // ---- the deck city, both sides of the lane: plots along streets, bands across them
  const skip = (x, sgn) => (sgn < 0 && x > BREACH.x0 - 60 && x < BREACH.x1 + 40) || (x > -1590 && x < -1150)
    || (sgn < 0 && x > -330 && x < -60) || (sgn > 0 && x > -340 && x < -170);
  for (const sgn of [-1, 1]) {
    let x = LANE.x0 - (sgn < 0 ? 0 : 30);
    const stern0 = SHIP.stern + 130;
    // behind the bridge too (no lane there)
    for (let xs = stern0; xs < -1600;) {
      const len = 40 + R() * 70;
      if (!skip(xs + len / 2, sgn)) {
        const edge = halfWidth(xs) * 0.78;
        const zIn = sgn < 0 ? -20 : 20;
        if (edge > 60) hall(xs, xs + len, zIn, sgn * edge, Math.min(deckAt(xs, zIn), deckAt(xs, edge)) - 2, 30);
      }
      xs += len + 8 + R() * 10;
    }
    while (x < 1650) {
      const len = 45 + R() * 120;
      const street = R() < 0.2 ? 24 + R() * 18 : 6 + R() * 12;
      const xc = x + len / 2;
      if (!skip(xc, sgn) && !skip(x, sgn) && !skip(x + len, sgn)) {
        const zLane = sgn < 0 ? LANE.z0 : LANE.z1;
        const edge = halfWidth(xc) * 0.8;
        const W = edge - Math.abs(zLane) * (sgn < 0 ? 1 : 1);
        if (W > 18) {
          const bowK = Math.min(1, Math.max(0.22, (1500 - xc) / 1000));
          const nb = W > 120 ? 2 + Math.floor(R() * 2) : W > 50 ? 1 + Math.floor(R() * 2) : 1;
          let z0 = zLane;
          for (let k = 0; k < nb; k++) {
            const bw = k === nb - 1 ? (edge - Math.abs(z0)) : (W / nb) * (0.7 + R() * 0.6);
            if (bw < 10) break;
            const z1 = z0 + sgn * bw;
            const base = Math.min(deckAt(xc, z0), deckAt(xc, z1), deckAt(x, z1), deckAt(x + len, z1)) - 2;
            const H = (k === 0 ? 50 + R() * 100 : 12 + R() * 50 * (1 - k * 0.25)) * bowK;
            const r = R();
            const x0 = x, x1 = x + len;
            if (k === 0) {
              if (r < 0.55) terrace(x0, x1, z0, z1, base, H, sgn);
              else if (r < 0.8) tower(x0, x1, z0, z1, base, H, sgn);
              else gallery(x0, x1, z0, z1, base, H, sgn);
            } else if (r < 0.35) hall(x0, x1, z0, z1, base, H);
            else if (r < 0.7) terrace(x0, x1, z0, z1, base, H * 0.8, sgn);
            else if (r < 0.85) tower(x0, x1, z0, z1, base, H * 0.8, sgn);
            else gallery(x0, x1, z0, z1, base, H, sgn);
            z0 = z1 + sgn * (4 + R() * 8);
          }
        }
      }
      x += len + street;
    }
  }

  // ---- the lane floor: rails and a pipe bundle the whole length, clutter at the wall feet
  for (let x = LANE.x0; x < LANE.x1; x += 60) {
    const x1 = Math.min(LANE.x1, x + 60);
    for (const z of [38, 58]) parts.push(beam([x, deckAt(x, z) + 0.6, z], [x1, deckAt(x1, z) + 0.6, z], 1.4, 1.2));
    for (const [z, r] of [[-4, 1.8], [0.5, 2.4], [5, 1.6]]) {
      const yA = deckAt(x, z) + r + 0.5, yB = deckAt(x1, z) + r + 0.5;
      const g = beam([x, yA, z], [x1, yB, z], 2 * r, 2 * r); g[0] = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1).rotateZ(-Math.PI / 2); g[2] = null; parts.push(g);
    }
    if (R() < 0.7) { const sx = 3 + R() * 10; add(box, x + R() * 50, deckAt(x, 92) + 2, 92 - R() * 6, sx, 3 + R() * 5, 3 + R() * 5); }
  }
  // ---- flying walkways across the lane at several heights, some arched, a collapsed one, cables
  const za = LANE.z0 - 6, zb = LANE.z1 + 6;
  for (const [wx, hy, arched] of [[-760, 38, true], [-430, 92, false], [-120, 64, true], [140, 118, false], [-600, 140, false], [-300, 48, false], [-980, 70, true]]) {
    const y = deckAt(wx, 45) + hy;
    parts.push(beam([wx, y, za], [wx, y, zb], 7, 1.6));
    parts.push(beam([wx + 3.2, y + 1.6, za], [wx + 3.2, y + 1.6, zb], 0.4, 1.4));
    parts.push(beam([wx - 3.2, y + 1.6, za], [wx - 3.2, y + 1.6, zb], 0.4, 1.4));
    if (arched) {
      const rise = 16, n = 12;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const yA = y - 2 - rise + rise * Math.sin(Math.PI * t0), yB = y - 2 - rise + rise * Math.sin(Math.PI * t1);
        parts.push(beam([wx, yA, za + (zb - za) * t0], [wx, yB, za + (zb - za) * t1], 3, 2.2, [1, 0, 0]));
      }
      for (let i = 1; i < n; i += 2) {
        const t = i / n, ya = y - 2 - rise + rise * Math.sin(Math.PI * t);
        parts.push(beam([wx, ya, za + (zb - za) * t], [wx, y - 0.8, za + (zb - za) * t], 0.8, 0.8, [1, 0, 0]));
      }
    }
  }
  // the collapsed walkway: torn from the starboard wall, its far end on the lane floor
  {
    const wx = -250, y = deckAt(wx, 45) + 76;
    parts.push(beam([wx, y, za], [wx - 12, deckAt(wx, 60) + 2, 66], 7, 1.6));
    parts.push(beam([wx + 3, y + 1.5, za], [wx - 9, deckAt(wx, 60) + 3.5, 66], 0.4, 1.4));
    parts.push(beam([wx - 14, deckAt(wx, 70) + 1, 72], [wx - 30, deckAt(wx, 80) + 1, 86], 7, 1.2));   // the broken-off end
    parts.push(beam([wx, y, zb], [wx + 2, y - 5, zb - 14], 7, 1.6));                                  // the stub on the far wall
  }
  // cables sagging across the lane between towers
  for (const [cx0, y0, sag] of [[-560, 110, 16], [-200, 150, 24], [-880, 95, 12], [60, 130, 20], [-680, 60, 10]]) {
    const yb = deckAt(cx0, 45) + y0, n = 14;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const f = (t) => yb - sag * 4 * t * (1 - t);
      parts.push(beam([cx0 + 6 * t0, f(t0), za + (zb - za) * t0], [cx0 + 6 * t1, f(t1), za + (zb - za) * t1], 0.5, 0.5, [1, 0, 0]));
    }
  }
  // the lane floor: landing pads (raised discs, faded paint), hatches, debris, two dead craft
  for (const [px0, pz] of [[-60, 45], [-520, 40], [-900, 48], [330, 46]]) {
    const y = deckAt(px0, pz) + 0.4;
    parts.push([cyl32, M(px0, y, pz, 22, 0.8, 22), null]);
    paint.push([ring, M(px0, y + 0.42, pz, 18, 18, 18, -Math.PI / 2)]);
    paint.push([box, M(px0, y + 0.42, pz, 24, 0.05, 2.4)]);
    paint.push([box, M(px0, y + 0.42, pz, 2.4, 0.05, 24)]);
  }
  for (let x = LANE.x0 + 20; x < 520; x += 22 + R2() * 30) {
    // broken edge stripes down the lane
    if (R2() < 0.75) paint.push([box, M(x, deckAt(x, 4) + 0.2, 4, 10 + R2() * 8, 0.06, 1.0)]);
    if (R2() < 0.75) paint.push([box, M(x + 8, deckAt(x, 86) + 0.2, 86, 10 + R2() * 8, 0.06, 1.0)]);
    if (R2() < 0.35) { const hz = 15 + R2() * 60; add(box, x, deckAt(x, hz) + 0.3, hz, 5, 0.6, 5); add(box, x, deckAt(x, hz) + 0.62, hz, 3.6, 0.1, 3.6); }
    if (R2() < 0.5) {
      const dz = 10 + R2() * 70, l = 3 + R2() * 12;
      parts.push(beam([x, deckAt(x, dz) + 0.5, dz], [x + l * (R2() - 0.5), deckAt(x, dz) + 0.5 + R2() * 3, dz + l * (R2() - 0.5)], 0.6 + R2() * 2.5, 0.4 + R2() * 1.2, [R2() - 0.5, 1, R2() - 0.5]));
    }
  }
  for (const [hx, hz, len, yaw, roll] of [[-150, 76, 42, 0.5, 0.22], [-640, 18, 34, -0.35, -0.15]]) {
    const y = deckAt(hx, hz) + len * 0.1;
    parts.push([hulkBody, M(hx, y, hz, len * 0.14, len, len * 0.1, Math.PI / 2 + 0.04, yaw, roll), null]);
    parts.push(beam([hx - 4, y, hz], [hx - 4 + len * 0.35 * Math.cos(yaw + 1.2), y - 2, hz + len * 0.35 * Math.sin(yaw + 1.2)], len * 0.18, 0.6));
    parts.push(beam([hx + 8, y + 1, hz - 4], [hx + 8 + len * 0.22 * Math.cos(yaw - 1.6), y - 3, hz + len * 0.22 * Math.sin(yaw - 1.6)], len * 0.12, 0.6, [0.2, 1, 0.3]));
  }
  // ---- gantries over the lane: a truss bridge from wall to wall
  for (const gx of [-1000, -760, -520, 60, 600, 980, 1260, 1520]) {
    const yTop = deckAt(gx, 45) + 46 + R() * 34;
    const za = LANE.z0 - 8, zb = LANE.z1 + 8;
    for (const dx of [-4, 4]) {
      parts.push(beam([gx + dx, yTop, za], [gx + dx, yTop, zb], 2.2, 2.2));
      parts.push(beam([gx + dx, yTop - 9, za], [gx + dx, yTop - 9, zb], 1.8, 1.8));
      for (let z = za, i = 0; z < zb - 1; z += 11, i++) {
        const z2 = Math.min(zb, z + 11);
        parts.push(beam([gx + dx, i % 2 ? yTop : yTop - 9, z], [gx + dx, i % 2 ? yTop - 9 : yTop, z2], 1.0, 1.0, [1, 0, 0]));
      }
    }
    for (let z = za; z <= zb; z += 22) parts.push(beam([gx - 4, yTop, z], [gx + 4, yTop, z], 1.2, 1.2));
    // a hanging cable bundle under some
    if (R() < 0.5) parts.push([cyl8, M(gx, yTop - 9 - 5, 30 + R() * 30, 0.6, 10, 0.6), null]);
  }
  // ---- a long truss along the port deck edge, a pipe bundle along the starboard edge
  for (let x = SHIP.stern + 160; x < 1500; x += 30) {
    const zA = -halfWidth(x) * 0.86, zB = -halfWidth(x + 30) * 0.86;
    const yA = deckAt(x, zA), yB = deckAt(x + 30, zB);
    parts.push(beam([x, yA + 26, zA], [x + 30, yB + 26, zB], 1.6, 1.6));
    parts.push(beam([x, yA + 3, zA], [x + 30, yB + 3, zB], 1.6, 1.6));
    parts.push(beam([x, yA + 3, zA], [x + 30, yB + 26, zB], 0.9, 0.9, [0, 0, 1]));
    parts.push(beam([x, yA, zA], [x, yA + 26, zA], 1.0, 1.0, [1, 0, 0]));
    for (const [dz, r] of [[0, 2.6], [5, 1.8], [-5, 3.2]]) {
      const zs = halfWidth(x) * 0.84 + dz, zs2 = halfWidth(x + 30) * 0.84 + dz;
      const g = beam([x, deckAt(x, zs) + r + 1, zs], [x + 30, deckAt(x + 30, zs2) + r + 1, zs2], 2 * r, 2 * r);
      g[0] = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1).rotateZ(-Math.PI / 2); g[2] = null; parts.push(g);
    }
  }
  // ---- flank strakes: long lines down both sides at three heights, and a deck-edge rail
  const sideZ = (x, yk) => crossPoint(x, yk, 1.0);
  for (const sgn of [-1, 1]) {
    for (const ak of [0.42, 0.12, -0.3, -0.75]) {
      const a = sgn > 0 ? ak : Math.PI - ak;
      for (let x = SHIP.stern + 30; x < SHIP.bow - 260; x += 40) {
        if (sgn < 0 && ak > 0.1 && inBreach(x + 20, a)) continue;
        const pA = sideZ(x, a), pB = sideZ(x + 40, a);
        pA[2] += sgn * 1.5; pB[2] += sgn * 1.5;
        parts.push(beam(pA, pB, 3.5, ak === 0.12 ? 5 : 2.5));
      }
    }
    // sponsons, low on the flank, one torn away
    for (let x = SHIP.stern + 220; x < 900; x += 250) {
      const w = halfWidth(x + 110);
      const torn = sgn < 0 && x > 100 && x < 400;
      if (torn) {
        add(box, x + 50, -26, sgn * (w + 15), 100, 44, 32);
        add(box, x + 170, -62, sgn * (w + 34), 110, 40, 30, 0.22, 0.12, -0.28);
        parts.push(beam([x + 100, -10, sgn * (w + 6)], [x + 150, -50, sgn * (w + 30)], 2, 2));
      } else {
        add(prism(8, 0.92), x + 110, -24, sgn * (w + 16), 220, 46, 34);
      }
      add(box, x + 110, 30, sgn * (w + 4), 210, 10, 14);
    }
    // small flank greebles
    for (let i = 0; i < 500; i++) {
      const x = SHIP.stern + 80 + R() * L * 0.8;
      const a = (sgn > 0 ? 0 : Math.PI) + sgn * (R() * 1.2 - 0.7);
      if (inBreach(x, a)) continue;
      const p = crossPoint(x, a);
      const sx = 4 + R() * 30, sy = 2 + R() * 10, sz = 2 + R() * 4;
      add(box, p[0], p[1], p[2] + sgn * sz / 2, sx, sy, sz);
    }
  }
  // ---- the breach: ribs every 30 m, stringers, two torn inner decks
  for (let x = BREACH.x0 - 20; x <= BREACH.x1 + 20; x += 30) {
    for (let j = -2; j < S_LOFT / 2 + 3; j++) {
      const a0 = (j / S_LOFT) * Math.PI * 2, a1 = ((j + 1) / S_LOFT) * Math.PI * 2;
      const pA = crossPoint(x, a0, 0.975), pB = crossPoint(x, a1, 0.975);
      parts.push(beam(pA, pB, 4, 9, [1, 0, 0]));
    }
  }
  for (const a of [1.85, 2.25, 2.6, 2.9]) {
    for (let x = BREACH.x0 - 20; x < BREACH.x1 + 20; x += 30) parts.push(beam(crossPoint(x, a, 0.965), crossPoint(x + 30, a, 0.965), 3, 3));
  }
  {
    const xm = (BREACH.x0 + BREACH.x1) / 2, w = halfWidth(xm);
    add(box, xm - 40, 70, 0, BREACH.x1 - BREACH.x0 - 80, 3, w * 1.5);
    add(box, xm + 20, 5, 0, BREACH.x1 - BREACH.x0, 3, w * 1.7);
    for (let x = BREACH.x0 + 20; x < BREACH.x1; x += 70) add(box, x, 38, -w * 0.3, 3, 64, w * 0.9);
    // debris hanging over the edge
    parts.push(beam([BREACH.x0 + 60, deckY(-800) - 2, -120], [BREACH.x0 + 110, 60, -230], 10, 2));
    parts.push(beam([BREACH.x0 + 180, deckY(-700) - 4, -60], [BREACH.x0 + 150, 40, -170], 14, 2));
  }

  // ---- the bridge complex: stepped, tapered terraces, a crown, masts (one broken and fallen)
  const bx = -1380, by = deckY(bx);
  add(prism(4, 0.9), bx, by + 50, 0, 400, 100, 300);
  add(prism(4, 0.88), bx + 20, by + 100 + 40, 0, 300, 80, 220);
  for (const sg of [-1, 1]) {
    pilasters(bx - 190, bx + 190, sg * 141, sg, by, 96, 16);
    pilasters(bx - 120, bx + 160, sg * 104, sg, by + 100, 78, 12);
    // galleries cantilevered off the terraces
    add(box, bx + 10, by + 70, sg * 158, 340, 6, 22);
    add(box, bx + 30, by + 150, sg * 118, 260, 5, 18);
    for (let x = bx - 160; x < bx + 180; x += 24) add(box, x, by + 76, sg * 168, 1.6, 10, 1.6);
  }
  pilastersX(-140, 140, bx - 190, -1, by, 96, 16);
  pilastersX(-100, 100, bx - 128, -1, by + 100, 78, 12);
  add(prism(8, 0.8), bx + 40, by + 180 + 30, 0, 200, 60, 150);
  add(box, bx + 70, by + 246, 0, 110, 14, 330);           // wings
  add(prism(8, 0.7), bx + 50, by + 253 + 25, 0, 80, 50, 70);
  for (const [dz, len] of [[-150, 330], [150, 330]]) add(box, bx + 70, by + 238, dz, 30, 8, 30);
  roofClutter(bx - 180, bx + 180, -130, 130, by + 100, 20);
  roofClutter(bx - 120, bx + 140, -90, 90, by + 180, 12);
  parts.push([cyl8, M(bx + 50, by + 303 + 210, 0, 4, 420, 4), null]);
  add(box, bx + 50, by + 640, 0, 6, 4, 150); add(box, bx + 50, by + 520, 0, 4, 4, 100);
  parts.push([cyl8, M(bx + 30, by + 303 + 70, -20, 3, 140, 3), null]);       // broken stump
  parts.push(beam([bx + 30, by + 443, -20], [bx + 250, by + 110, -150], 5, 5)); // the fallen top, across the terraces
  antennas(bx + 60, by + 303, -20, 5, 160);
  // ---- the spire cluster amidships, port side
  for (const [dx, dz, s, h] of [[-200, -150, 70, 300], [-130, -110, 50, 220], [-250, -95, 44, 180], [-160, -190, 36, 140]]) {
    const base = deckAt(dx, dz) - 2;
    add(prism(4, 0.95), dx, base + 9, dz, s * 1.6, 18, s * 1.6);
    add(prism(8, 0.72), dx, base + 18 + h / 2, dz, s, h, s);
    add(prism(8, 0.6), dx, base + 18 + h + h * 0.08, dz, s * 0.5, h * 0.16, s * 0.5);
    parts.push([cone6, M(dx, base + 18 + h * 1.16 + 50, dz, s * 0.14, 100, s * 0.14), null]);
  }
  // ---- the tower that keeps the window: on the lane's starboard wall
  {
    const base = deckAt(-255, 140) - 2;
    add(prism(4, 0.96), -255, base + 85, 142, 150, 170, 84);
    add(prism(8, 0.8), -255, base + 170 + 40, 150, 70, 80, 60);
    antennas(-255, base + 250, 150, 3, 120);
  }
  // ---- the bow spar, the keel fin, the engines
  parts.push([cyl8, M(SHIP.bow + 220, 10, 0, 6, 520, 6, 0, 0, Math.PI / 2), null]);
  const fin = new THREE.Shape();
  const fx0 = -1750, fx1 = 650;
  fin.moveTo(fx0, keelY(fx0) + 30);
  for (let x = fx0; x <= fx1; x += 100) fin.lineTo(x, keelY(x) + 30);
  fin.lineTo(fx1 - 260, -470);
  fin.lineTo(fx0 + 140, -470);
  fin.lineTo(fx0, keelY(fx0) + 30);
  parts.push([new THREE.ExtrudeGeometry(fin, { depth: 36, bevelEnabled: false }), M(0, 0, -18), null]);
  add(prism(8, 0.9), SHIP.stern - 40, -30, 0, 100, 260, 520, 0, 0, Math.PI / 2);
  const bell = new THREE.LatheGeometry(
    [[0.42, 0], [0.5, -0.18], [0.66, -0.5], [0.84, -0.8], [1.0, -1.0], [0.96, -1.0], [0.8, -0.78], [0.62, -0.48], [0.46, -0.18], [0.38, 0]].map(([r, y]) => new THREE.Vector2(r, y)),
    28);
  for (const [z, y, r] of [[0, -20, 170], [-215, -70, 115], [215, -70, 115]]) {
    parts.push([bell, M(SHIP.stern - 80, y, z, r, 300 * (r / 170), r, 0, 0, -Math.PI / 2), null]);
  }
  // merged in chunks along the ship (the loft on its own), so the renderer can draw near chunks
  // first and the depth test rejects what they hide before it is shaded
  const bins = new Map();
  for (const part of parts.slice(1)) {
    const x = part[1] ? part[1].elements[12] : 0;
    const k = Math.floor((x - SHIP.stern) / 360);
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(part);
  }
  const chunks = [merge([parts[0]]), ...[...bins.keys()].sort((a, b) => a - b).map((k) => merge(bins.get(k)))];
  chunks.paint = merge(paint.map(([g, m]) => [g, m, null]));
  // every part's world box (the loft aside): the flown page builds its collision field from these
  const bb = new THREE.Box3(), boxes = new Float32Array((parts.length - 1) * 6);
  parts.slice(1).forEach(([g, m], i) => {
    if (!g.boundingBox) g.computeBoundingBox();
    bb.copy(g.boundingBox); if (m) bb.applyMatrix4(m);
    boxes.set([bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z], i * 6);
  });
  chunks.boxes = boxes;
  return chunks;
}

// ---- the metal's two noise fields, baked once. Soot and grime are fixed functions of the ship-frame
// position, and evaluating their fractal noise per pixel was most of the canyon frame on WebGL2. Each
// is rendered once, on the first frame the hull is drawn (behind the arrival veil), from the same
// TSL noise into a half-float texture, then read with bilinear lookups. The domains cover the whole
// ship (vertices span x -2580..2680, y -470..881, z -368..343) with a margin; lookups past them clamp.
// soot: noise(pc.x * 0.07, pc.y * 0.005, axisId), axisId 1, 2 or 3, so three 2D slices in R, G, B
const SOOT = { u0: -192, u1: 192, v0: -3, v1: 5, per: 10 };   // 3840 x 80, inside a 4096 texture limit
// grime: noise(p * (0.004, 0.02, 0.01)), a 3D field stored as 64 z slices tiled 8 x 8 in one red
// texture, 8 texels per noise unit; a lookup blends the two nearest slices
const GRIME = { x0: -11, y0: -10, z0: -4, nx: 176, ny: 224, nz: 64, per: 8, tiles: 8 };
const noise2 = (q) => mx_fractal_noise_float(q, 2, 2.0, 0.5, 1.0);

function bakedSoot() {
  const S = SOOT, W = (S.u1 - S.u0) * S.per, H = (S.v1 - S.v0) * S.per;
  const bake = Fn(() => {
    const q = uv();
    const a = q.x.mul(S.u1 - S.u0).add(S.u0), b = q.y.mul(S.v1 - S.v0).add(S.v0);
    return vec4(noise2(vec3(a, b, 1.0)), noise2(vec3(a, b, 2.0)), noise2(vec3(a, b, 3.0)), 1.0);
  })();
  return rtt(bake, W, H, { type: THREE.HalfFloatType, autoUpdate: false, depthBuffer: false });
}

function bakedGrime() {
  const G = GRIME, W = G.nx * G.tiles, H = G.ny * G.tiles;
  const bake = Fn(() => {
    const px = floor(uv().mul(vec2(W, H)));                  // this texel
    const t = floor(px.div(vec2(G.nx, G.ny)));               // its tile
    const c = px.sub(t.mul(vec2(G.nx, G.ny)));               // the texel in its tile
    const k = t.y.mul(G.tiles).add(t.x);                     // the z slice
    const g = vec3(c.x.div(G.per).add(G.x0), c.y.div(G.per).add(G.y0), k.div(G.per).add(G.z0));
    return vec4(noise2(g), 0.0, 0.0, 1.0);
  })();
  return rtt(bake, W, H, { type: THREE.HalfFloatType, format: THREE.RedFormat, autoUpdate: false, depthBuffer: false });
}

// the grime noise at g = p * (0.004, 0.02, 0.01), from the baked slices
function grimeAt(node, g) {
  const G = GRIME, W = G.nx * G.tiles, H = G.ny * G.tiles;
  const cx = clamp(g.x.sub(G.x0).mul(G.per), 0.0, G.nx - 1), cy = clamp(g.y.sub(G.y0).mul(G.per), 0.0, G.ny - 1);
  const cz = clamp(g.z.sub(G.z0).mul(G.per), 0.0, G.nz - 1);
  const k0 = min(floor(cz), float(G.nz - 2)), f = cz.sub(k0);
  const at = (k) => vec2(mod(k, G.tiles).mul(G.nx).add(cx).add(0.5).div(W), floor(k.div(G.tiles)).mul(G.ny).add(cy).add(0.5).div(H));
  node.uvNode = at(k0);
  return mix(node.x, texture(node.value, at(k0.add(1.0))).x, f);
}

// ---- the metal, in the shader: gunmetal and oxidised bronze in sections; panels of varied sizes,
// fine seams, soot, small dark windows in rows, worn edges, a dark foot where a block meets the deck.
// Detail smaller than a pixel or two fades to its average (no tiling, no moire at distance).
function hullMaterial() {
  const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide });
  const p = positionLocal, n = normalLocal;
  const an = abs(n);
  const useY = an.y.greaterThan(max(an.x, an.z));
  const useZ = an.z.greaterThan(an.x);
  const pc = select(useY, vec2(p.x, p.z), select(useZ, vec2(p.x, p.y), vec2(p.z, p.y)));
  const axisId = select(useY, float(1.0), select(useZ, float(2.0), float(3.0)));
  const upright = select(useY, float(0.0), float(1.0));
  const fwm = length(fwidth(pc)).add(1e-4);                 // metres per pixel here
  const fade = (metres) => float(1.0).sub(smoothstep(metres * 0.25, metres * 0.6, fwm)); // 1 while a feature of this size is resolved
  // irregular plating: the face is cut into 60 m columns; each column into horizontal bands of one
  // to four storeys; each band into panels 7, 13 or 29 m long, or left unbroken. Offsets differ per
  // band, so no regular grid can be read. Seams are thin and dark; panels differ by value and
  // roughness, not by outline.
  const cx = floor(pc.x.div(60.0));
  const sh = mx_cell_noise_float(vec3(cx, axisId, 21.0)), sh2 = mx_cell_noise_float(vec3(cx, axisId, 9.0));
  const hb = floor(sh.mul(4.0)).add(2.0).mul(3.4);
  const by = floor(pc.y.div(hb));
  const bh = mx_cell_noise_float(vec3(cx, by, axisId.add(3.0)));
  const wb = select(bh.lessThan(0.25), float(13.0), select(bh.lessThan(0.5), float(23.0), select(bh.lessThan(0.7), float(41.0), float(600.0))));
  const ox = pc.x.add(bh.mul(wb));
  const px = floor(ox.div(wb));
  const pid = mx_cell_noise_float(vec3(px, by.add(cx.mul(31.0)), axisId.add(2.0)));
  const fy = fract(pc.y.div(hb)), fx = fract(ox.div(wb)), fc = fract(pc.x.div(60.0));
  const dSeam = min(min(min(fy, float(1.0).sub(fy)).mul(hb), min(fx, float(1.0).sub(fx)).mul(wb)), min(fc, float(1.0).sub(fc)).mul(60.0));
  const seamP = float(1.0).sub(smoothstep(0.04, fwm.mul(0.8).add(0.04), dSeam)).mul(fade(2.5));
  const pv = mix(float(0.5), pid, fade(5.0));
  const seamS = float(0.0), seamF = float(0.0);
  // gunmetal or oxidised bronze, by large region
  // the region noise varies over kilometres: computed per vertex
  const region = vertexStage(mx_fractal_noise_float(p.mul(0.0014), 2, 2.0, 0.5, 1.0)).add(sh.sub(0.5).mul(0.35));
  const bronzeK = smoothstep(0.05, 0.3, region);
  // soot streaks down the upright faces, and grime across the decks
  // (both read from the baked fields: the same noise, sampled)
  const sootTex = bakedSoot();
  sootTex.uvNode = vec2(pc.x.mul(0.07).sub(SOOT.u0).div(SOOT.u1 - SOOT.u0), pc.y.mul(0.005).sub(SOOT.v0).div(SOOT.v1 - SOOT.v0));
  const sootN = select(useY, sootTex.x, select(useZ, sootTex.y, sootTex.z));
  const soot = smoothstep(0.0, 0.55, sootN).mul(upright);
  const grime = grimeAt(bakedGrime(), p.mul(vec3(0.004, 0.02, 0.01))).mul(0.5).add(0.5);
  // windows: 0.8 x 1.3 m, 1.8 m apart, floors 3.4 m, in some sections and some floors
  const wq = pc.div(vec2(1.5, 3.0));
  const wf = fract(wq);
  const wfw = fwidth(wq).add(0.01);
  const wx = smoothstep(0.33, float(0.33).add(wfw.x), wf.x).mul(float(1.0).sub(smoothstep(float(0.67).sub(wfw.x), 0.67, wf.x)));
  const wy = smoothstep(0.34, float(0.34).add(wfw.y), wf.y).mul(float(1.0).sub(smoothstep(float(0.72).sub(wfw.y), 0.72, wf.y)));
  const floorOn = step(0.5, mx_cell_noise_float(vec3(floor(wq.y), cx, axisId.add(13.0))));
  const winZone = upright.mul(step(0.45, sh2)).mul(floorOn);
  const winMask = mix(float(0.42).mul(floorOn), wx.mul(wy), fade(2.2)).mul(winZone);
  const winVar = mx_cell_noise_float(vec3(floor(wq), axisId.add(17.0)));
  // worn edges and a dark foot, from the part's own box (aEP: position in the part, aEH: half size)
  const eP = attribute('aEP', 'vec3'), eH = attribute('aEH', 'vec3');
  const e = eH.sub(abs(eP));
  const eMin = min(min(e.x, e.y), e.z), eMax = max(max(e.x, e.y), e.z);
  const e2 = e.x.add(e.y).add(e.z).sub(eMin).sub(eMax);   // distance to the nearest edge on this face
  const wear = float(1.0).sub(smoothstep(0.0, fwm.mul(1.5).add(0.6), e2));
  const foot = mix(float(0.45), float(1.0), smoothstep(0.0, 7.0, eP.y.add(eH.y))).mul(upright).add(float(1.0).sub(upright));
  // fake ambient occlusion: walls darken toward the deck they rise from (the canyon is deep), and a
  // dark contact line where a form meets another (any face within a metre of its part's foot)
  const deckAO = mix(float(1.0), mix(float(0.5), float(1.0), smoothstep(150.0, 260.0, p.y)), upright.mul(smoothstep(110.0, 150.0, p.y)));
  const contact = mix(float(0.55), float(1.0), smoothstep(0.0, 1.2, eP.y.add(eH.y)));
  const gun = vec3(0.052, 0.054, 0.059), bronze = vec3(0.088, 0.060, 0.036);
  m.colorNode = Fn(() => {
    const col = mix(gun, bronze, bronzeK).toVar();
    col.mulAssign(pv.mul(0.07).add(0.965));
    col.mulAssign(sh.mul(0.14).add(0.93));
    col.mulAssign(grime.mul(0.4).add(0.72));
    col.mulAssign(float(1.0).sub(soot.mul(0.45)));
    col.mulAssign(float(1.0).sub(seamP.mul(0.22)));
    col.assign(mix(col, vec3(0.012, 0.011, 0.011).add(vec3(0.03, 0.026, 0.02).mul(step(0.92, winVar))), winMask.mul(0.92)));
    col.assign(mix(col, mix(vec3(0.12, 0.12, 0.125), vec3(0.13, 0.115, 0.1), bronzeK), wear.mul(0.35)));
    col.mulAssign(foot.mul(deckAO).mul(contact));
    return col;
  })();
  m.roughnessNode = clamp(pv.mul(0.22).add(0.47).add(seamP.mul(0.1)).sub(wear.mul(0.25)).add(soot.mul(0.12)), 0.18, 0.95);
  m.metalnessNode = mix(float(0.55), float(0.45), bronzeK);
  return m;
}

export function createHull({ seed = 4417 } = {}) {
  const group = new THREE.Group();
  const mat = hullMaterial();
  const chunks = buildParts(seed);
  const paintMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.9, metalness: 0.0 });
  // faded: worn through in patches, scuffed along the lane
  paintMat.colorNode = vec3(0.13, 0.095, 0.06).mul(smoothstep(-0.35, 0.25, mx_fractal_noise_float(positionLocal.mul(vec3(0.08, 1.0, 0.25)), 3, 2.0, 0.5, 1.0)).mul(0.8).add(0.2));
  const paintMesh = new THREE.Mesh(chunks.paint, paintMat);
  paintMesh.receiveShadow = true;
  group.add(paintMesh);
  for (const geo of chunks) {
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ---- the one window still breathing: a small amber pane in the lane's starboard wall
  const win = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.0, 0.6), new THREE.MeshBasicNodeMaterial({ color: 0xffffff }));
  win.material.colorNode = vec3(14.0, 6.4, 1.6);
  const wy = deckAt(-255, 140) - 2 + 112;
  win.position.set(-262, wy, 100.9);
  group.add(win);
  // its glow: a billboard, additive, a few times the pane's size
  const gm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const d = length(uv().sub(0.5)).mul(2.0);
  gm.colorNode = vec3(1.0, 0.5, 0.14).mul(exp(d.mul(d).mul(-9.0)).mul(1.4).add(exp(d.mul(-5.0)).mul(0.35))).mul(float(1.0).sub(step(1.0, d)));
  gm.opacityNode = float(1.0);
  const glow = new THREE.Sprite(gm);
  glow.scale.set(30, 30, 1);
  glow.position.set(-262, wy, 98.5);
  group.add(glow);
  group.userData.window = win.position.clone();

  // ---- eleven lamp housings along the keel, dark (one for each world not yet surveyed). The flown
  // page lights one in its world's colour when that world is surveyed: lamps[i].light([r, g, b])
  const lampGeo = new THREE.CylinderGeometry(6, 8, 12, 12);
  const lamps = [];
  for (let i = 0; i < 11; i++) {
    const lampMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a1612, roughness: 0.3, metalness: 0.6 });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(-1450 + i * 170, -476, 0);
    group.add(lamp);
    const lm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const lcol = uniform(new THREE.Color(0, 0, 0));
    const ld = length(uv().sub(0.5)).mul(2.0);
    lm.colorNode = lcol.mul(exp(ld.mul(ld).mul(-7.0)).mul(1.2).add(exp(ld.mul(-4.0)).mul(0.3))).mul(float(1.0).sub(step(1.0, ld)));
    lm.opacityNode = float(1.0);
    const glow = new THREE.Sprite(lm);
    glow.scale.set(90, 90, 1);
    glow.position.set(-1450 + i * 170, -486, 0);
    glow.visible = false;
    group.add(glow);
    lamps.push({
      get lit() { return glow.visible; },
      light(c) {
        lampMat.emissive = new THREE.Color().setRGB(c[0] * 6, c[1] * 6, c[2] * 6);
        lcol.value.setRGB(c[0], c[1], c[2]);
        glow.visible = true;
      },
    });
  }
  group.userData.lamps = lamps;
  group.userData.boxes = chunks.boxes;
  return group;
}
