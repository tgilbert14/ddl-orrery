// Orbit look test: the derelict. A dead ship about 4.4 km long built from code geometry: a lofted,
// tapered main hull with structural ribs, a deck city of seeded blocks, a stepped bridge tower,
// engine bells at the stern, a keel fin with eleven dark lamp housings, antenna masts, and plating
// drawn in the shader (panel seams, plate tints, section lines, grime). Dark warm metal; the only
// light it makes is one small amber window.
//
// Ship frame: +x is the bow, +y is up, +z is starboard. Units are metres.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, positionLocal, normalLocal, abs, floor, fract, min, max, mix, smoothstep, select,
  fwidth, mx_cell_noise_float, mx_fractal_noise_float, uv, length, exp, step,
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
// structural ribs: bands a few percent proud of the skin every 360 m
const rib = (x) => { const k = ((x - SHIP.stern) % 360 + 360) % 360; return k > 300 && k < 324 ? 1.014 : 1.0; };

function loftHull() {
  const stations = [];
  for (let x = SHIP.stern; x <= SHIP.bow - 1; x += 10) stations.push(x);
  stations.push(SHIP.bow);
  const S = 72, ex = EX;
  const pos = [], idx = [];
  for (const x of stations) {
    const w = halfWidth(x) * rib(x), t = deckY(x) * rib(x), b = keelY(x) * rib(x);
    for (let j = 0; j < S; j++) {
      const a = (j / S) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const z = w * Math.sign(c) * Math.pow(Math.abs(c), 2 / ex);
      const y = (s > 0 ? t : -b) * Math.sign(s) * Math.pow(Math.abs(s), 2 / (s > 0 ? ex * 1.6 : ex));
      pos.push(x, y, z);
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < S; j++) {
      const a = i * S + j, b = i * S + ((j + 1) % S), c = (i + 1) * S + j, d = (i + 1) * S + ((j + 1) % S);
      idx.push(a, c, b, b, c, d);
    }
  }
  // stern plate: a fan
  const centre = pos.length / 3;
  pos.push(SHIP.stern, (deckY(SHIP.stern) + keelY(SHIP.stern)) * 0.5, 0);
  for (let j = 0; j < S; j++) idx.push(centre, j, (j + 1) % S);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals(); // flat facets: the hull reads as plated sections, not a smooth tube
  return ng;
}

// merge non-indexed geometries (position + normal) after applying each one's matrix
function merge(list) {
  let n = 0;
  const parts = list.map(([geo, m]) => {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g = g.clone();
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    n += g.attributes.position.count;
    return g;
  });
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    P.set(g.attributes.position.array, o * 3);
    N.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  return out;
}

const M = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return m;
};
const box = new THREE.BoxGeometry(1, 1, 1);

function buildParts(seed) {
  const R = rng(seed);
  const parts = [[loftHull(), null]];

  // ---- deck city: seeded blocks along the spine, many small, a few large, thinning toward the bow
  for (let i = 0; i < 2600; i++) {
    const x = SHIP.stern + 120 + R() * (L * 0.8);
    const w = halfWidth(x);
    let z = (R() * 2 - 1) * w * 0.7;
    // keep a flight lane open down the starboard side of the spine (the canyon the hull still flies)
    if (z > -12 && z < 95 && x > -1250) z = z < 40 ? -12 - R() * 30 : 95 + R() * 30;
    const r = R();
    const big = r < 0.04, mid = r < 0.3;
    const sx = big ? 70 + R() * 130 : mid ? 18 + R() * 50 : 3 + R() * 16;
    const sz = big ? 40 + R() * 80 : mid ? 12 + R() * 34 : 3 + R() * 12;
    const sy = big ? 24 + R() * 60 : mid ? 6 + Math.pow(R(), 2) * 34 : 2 + R() * 7;
    const yBase = deckAt(x, z) - 3;
    parts.push([box, M(x, yBase + sy / 2, z, sx, sy, sz)]);
  }
  // pipes running along the deck
  const pipe = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  for (let i = 0; i < 40; i++) {
    const x0 = SHIP.stern + 150 + R() * L * 0.6, len = 200 + R() * 600;
    const z = (R() * 2 - 1) * halfWidth(x0) * 0.55;
    const r = 2 + R() * 4;
    parts.push([pipe, M(x0 + len / 2, deckAt(x0, z) + r + 1, z, r, len, r, 0, 0, Math.PI / 2)]);
  }
  // long trench walls on the deck: the lines that give the hull its length
  for (const zf of [-0.42, 0.42]) {
    for (let x = SHIP.stern + 150; x < 1200; x += 210) {
      const zz = zf * halfWidth(x);
      parts.push([box, M(x + 95, deckY(x) - 2 + 9, zz, 200, 18, 10)]);
    }
  }
  // side sponsons: long boxes along each flank, broken into sections
  for (const side of [-1, 1]) {
    for (let x = SHIP.stern + 200; x < 900; x += 240) {
      const w = halfWidth(x + 110);
      parts.push([box, M(x + 110, -20, side * (w + 14), 220, 46, 34)]);
      parts.push([box, M(x + 110, 34, side * (w + 4), 210, 12, 18)]);
    }
    // small side greebles
    for (let i = 0; i < 700; i++) {
      const x = SHIP.stern + 80 + R() * L * 0.82;
      const w = halfWidth(x);
      const y = keelY(x) * 0.5 + R() * (deckY(x) * 0.9 - keelY(x) * 0.5);
      const sx = 6 + R() * 40, sy = 4 + R() * 20, sz = 3 + R() * 8;
      parts.push([box, M(x, y, side * (w * 0.97 + sz / 2), sx, sy, sz)]);
    }
  }
  // ---- the bridge: a stepped tower toward the stern, with wings
  const bx = -1380, by = deckY(bx);
  parts.push([box, M(bx, by + 55, 0, 380, 110, 260)]);
  parts.push([box, M(bx + 20, by + 150, 0, 280, 80, 190)]);
  parts.push([box, M(bx + 40, by + 215, 0, 190, 50, 130)]);
  parts.push([box, M(bx + 70, by + 250, 0, 120, 18, 320)]);   // wings
  parts.push([box, M(bx + 50, by + 275, 0, 70, 34, 70)]);
  // a second, lower tower amidships
  parts.push([box, M(-200, deckY(-200) + 60, -90, 180, 120, 120)]);
  parts.push([box, M(-190, deckY(-200) + 150, -90, 110, 70, 80)]);
  // ---- antenna masts
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  parts.push([cyl, M(bx + 50, by + 290 + 210, 0, 4, 420, 4)]);
  parts.push([cyl, M(bx + 30, by + 290 + 140, 30, 3, 280, 3)]);
  parts.push([box, M(bx + 50, by + 640, 0, 6, 4, 140)]);
  parts.push([box, M(bx + 50, by + 520, 0, 4, 4, 90)]);
  parts.push([cyl, M(-190, deckY(-200) + 185 + 150, -90, 3, 300, 3)]);
  // a broken mast, leaning
  parts.push([cyl, M(1100, deckY(1100) + 110, -150, 4, 260, 4, 0.0, 0, -0.55)]);
  // the bow spar
  parts.push([cyl, M(SHIP.bow + 220, 10, 0, 6, 520, 6, 0, 0, Math.PI / 2)]);
  // ---- keel fin
  const fin = new THREE.Shape();
  const fx0 = -1750, fx1 = 650;
  fin.moveTo(fx0, keelY(fx0) + 30);
  for (let x = fx0; x <= fx1; x += 100) fin.lineTo(x, keelY(x) + 30);
  fin.lineTo(fx1 - 260, -470);
  fin.lineTo(fx0 + 140, -470);
  fin.lineTo(fx0, keelY(fx0) + 30);
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 36, bevelEnabled: false });
  parts.push([finG, M(0, 0, -18)]);
  // ---- engines: a housing block and three bells
  parts.push([box, M(SHIP.stern - 40, -30, 0, 100, 260, 520)]);
  const bell = new THREE.LatheGeometry(
    [[0.42, 0], [0.5, -0.18], [0.66, -0.5], [0.84, -0.8], [1.0, -1.0], [0.96, -1.0], [0.8, -0.78], [0.62, -0.48], [0.46, -0.18], [0.38, 0]].map(([r, y]) => new THREE.Vector2(r, y)),
    28);
  for (const [z, y, r] of [[0, -20, 170], [-215, -70, 115], [215, -70, 115]]) {
    parts.push([bell, M(SHIP.stern - 80, y, z, r, 300 * (r / 170), r, 0, 0, -Math.PI / 2)]);
  }
  return merge(parts);
}

// ---- plating, in the shader: projected plates with seams, tints, section lines and grime
function hullMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionLocal, n = normalLocal;
  const an = abs(n);
  const useY = an.y.greaterThan(max(an.x, an.z));
  const useZ = an.z.greaterThan(an.x);
  const pc = select(useY, vec2(p.x, p.z), select(useZ, vec2(p.x, p.y), vec2(p.z, p.y)));
  const axisId = select(useY, float(1.0), select(useZ, float(2.0), float(3.0)));
  const size = vec2(9.0, 6.0);
  const q0 = pc.div(size);
  const row = floor(q0.y);
  const q = vec2(q0.x.add(mx_cell_noise_float(vec3(floor(row.div(4.0)), axisId, 3.0)).mul(0.5)), q0.y);
  const cell = floor(q);
  const f = fract(q);
  const fw = fwidth(q).mul(1.2).add(0.004);
  const edge = min(min(f.x, float(1.0).sub(f.x)).div(fw.x), min(f.y, float(1.0).sub(f.y)).div(fw.y));
  // plates smaller than a few pixels fade to their average (no moire, no tiled look at distance)
  const near = float(1.0).sub(smoothstep(0.08, 0.3, max(fw.x, fw.y)));
  const seam = mix(float(0.8), smoothstep(0.0, 1.0, edge.mul(0.5)), near); // 0 on a seam, 1 on a plate
  const h = mix(float(0.5), mx_cell_noise_float(vec3(cell, axisId)), near);
  const h2 = mx_cell_noise_float(vec3(cell.add(vec2(17.0, 5.0)), axisId));
  // larger sections: a stronger line every 120 m along the ship and a bigger tint
  const secQ = pc.div(vec2(54.0, 30.0));
  const secF = fract(secQ);
  const secFw = fwidth(secQ).mul(2.0).add(0.002);
  const secNear = float(1.0).sub(smoothstep(0.05, 0.2, max(secFw.x, secFw.y)));
  const secLine = mix(float(0.85), smoothstep(0.0, 1.0, min(min(secF.x, float(1.0).sub(secF.x)).div(secFw.x), min(secF.y, float(1.0).sub(secF.y)).div(secFw.y)).mul(0.5)), secNear);
  const secH = mx_cell_noise_float(vec3(floor(secQ), axisId.add(7.0)));
  // grime: streaks drawn out along the hull
  const grime = mx_fractal_noise_float(p.mul(vec3(0.0016, 0.012, 0.012)), 4, 2.0, 0.5, 1.0).mul(0.5).add(0.5);
  // dead windows: rows of small dark ports on upright faces of some sections (they give the scale
  // of a city block), and dark hatches on some deck plates
  const wq = pc.div(vec2(3.6, 4.4));
  const wf = fract(wq);
  const wfw = fwidth(wq).add(0.02);
  const wx = smoothstep(0.22, float(0.22).add(wfw.x), wf.x).mul(float(1.0).sub(smoothstep(float(0.62).sub(wfw.x), 0.62, wf.x)));
  const wy = smoothstep(0.38, float(0.38).add(wfw.y), wf.y).mul(float(1.0).sub(smoothstep(float(0.72).sub(wfw.y), 0.72, wf.y)));
  const wNear = float(1.0).sub(smoothstep(0.12, 0.4, max(wfw.x, wfw.y)));
  const upright = float(1.0).sub(select(useY, float(1.0), float(0.0)));
  const winMask = wx.mul(wy).mul(upright).mul(smoothstep(0.45, 0.55, secH)).mul(step(0.25, mx_cell_noise_float(vec3(floor(wq.div(vec2(6.0, 1.0))), axisId.add(11.0)))));
  const winDark = mix(winMask.mul(0.18), winMask, wNear); // far away, a row reads as a slightly darker band
  const hatch = select(useY, smoothstep(0.93, 0.95, h2), float(0.0)).mul(near);
  const base = vec3(0.10, 0.092, 0.084);
  const light = vec3(0.17, 0.155, 0.135);
  const rust = vec3(0.11, 0.06, 0.035);
  m.colorNode = Fn(() => {
    const col = mix(base, light, h.mul(0.22).add(secH.mul(0.35))).toVar();
    col.assign(mix(col, rust, smoothstep(0.9, 0.99, h2).mul(0.4).mul(near)));
    col.mulAssign(secH.mul(0.2).add(0.9));
    col.mulAssign(grime.mul(0.6).add(0.55));
    col.mulAssign(seam.mul(select(useY, float(0.22), float(0.4))).add(select(useY, float(0.78), float(0.6))));
    col.mulAssign(secLine.mul(0.45).add(0.55));
    col.mulAssign(float(1.0).sub(winDark.mul(0.8)));
    col.mulAssign(float(1.0).sub(hatch.mul(0.7)));
    return col;
  })();
  m.roughnessNode = h2.mul(0.08).add(0.62).add(float(1.0).sub(seam).mul(0.1));
  m.metalnessNode = float(0.35);
  return m;
}

export function createHull({ seed = 4417 } = {}) {
  const group = new THREE.Group();
  const geo = buildParts(seed);
  const mesh = new THREE.Mesh(geo, hullMaterial());
  mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh);

  // ---- the one window still breathing: a small amber pane on the amidships tower's forward face
  const win = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 1), new THREE.MeshBasicNodeMaterial({ color: 0xffffff }));
  win.material.colorNode = vec3(9.0, 4.2, 1.1);
  const tx = -200, ty = deckY(tx);
  win.rotation.y = Math.PI / 2;
  win.position.set(tx + 90.4, ty + 84, -118);
  group.add(win);
  // its glow: a billboard, additive, a few times the pane's size
  const gm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const d = length(uv().sub(0.5)).mul(2.0);
  gm.colorNode = vec3(1.0, 0.5, 0.14).mul(exp(d.mul(d).mul(-9.0)).mul(1.4).add(exp(d.mul(-5.0)).mul(0.35))).mul(float(1.0).sub(step(1.0, d)));
  gm.opacityNode = float(1.0);
  const glow = new THREE.Sprite(gm);
  glow.scale.set(70, 70, 1);
  glow.position.set(tx + 96, ty + 84, -118);
  group.add(glow);
  group.userData.window = win.position.clone();

  // ---- eleven lamp housings along the keel, dark (one for each world not yet surveyed)
  const lampMat = new THREE.MeshStandardNodeMaterial({ color: 0x1a1612, roughness: 0.3, metalness: 0.6 });
  const lampGeo = new THREE.CylinderGeometry(6, 8, 12, 12);
  for (let i = 0; i < 11; i++) {
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(-1450 + i * 170, -476, 0);
    group.add(lamp);
  }
  return group;
}
