// Dust Sea walk: the Surveyor, a look test (opt-in: ?figure=a|b|c on index.html).
//
// Three candidate figures built from code geometry (lathed and swept surfaces, merged into one mesh
// each; no models, no textures), posed mid-stride and static, with the cloth pushed by the dune wind
// (params.js G.windDeg). Seen from behind; no face, no skin, no text.
//   a  the Pilgrim: floor-length cloak hiding the legs, deep pointed hood, shoulder mantle, a 2.2 m
//      crook staff with the lantern hanging from the crook above head height
//   b  the Cartographer: knee-length cape over wrapped shins and boots, rounded hood, a squared pack
//      with a short mast, a banded survey rod with the lantern fixed on top
//   c  the Kite: long cloak, short hood, a 2.7 m scarf tail streaming downwind, a 1.5 m walking
//      stick, the lantern hanging low from the other hand
//
// What the figure does to the ground is a hook in the ground shader (tsl-material.js opts.walk.figure,
// gated like the other walk hooks, so without ?figure the ground's graph is unchanged):
//   - its cast shadow: an analytic term. The figure is also described by up to NCAP tapered capsules;
//     a ground point is shaded by a sun when the ray from it toward that sun passes within a capsule's
//     radius (closest approach of the ray and the capsule's axis), with a penumbra that widens with
//     distance along the ray. Long at low sun because it is a real ray, not a decal.
//   - contact darkening: distance from the ground point to the same capsules, an exponential falloff.
//   - the lantern's pool: a point light on the ground, 1/d^2, Lambert on the shaded normal.
// The trail: hem-drag lines (a, c) and staff marks (a, b) are extra stamps in the existing trace map
// (slide-type stamps: a thin capsule for the hem, a zero-length one for the staff tip).

import * as THREE from 'three/webgpu';
import { Fn, If, uniform, attribute, vec3, vec4, float, normalize, dot, max, mix, clamp, smoothstep, length, pow, exp, step, sqrt, uv, normalWorld, positionWorld, cameraPosition } from 'three/tsl';
import { G, DEG } from '../look-test/params.js';

export const NCAP = 10;
export const FIGURES = { a: 'the Pilgrim', b: 'the Cartographer', c: 'the Kite' };

// the lantern, per time of day: pool (ground light, linear, before exposure), body and glow (display)
export const LAMP = {
  day: { pool: 1.6, body: 0.75, glow: 0.18 },
  dusk: { pool: 1.6, body: 1.0, glow: 0.55 },
  ember: { pool: 1.9, body: 1.0, glow: 0.85 },
};
export const LAMP_COL = [1.0, 0.52, 0.2];

// linear albedos: dark, matte, slightly warm
export const C = {
  cloth: [0.048, 0.035, 0.026], cloth2: [0.040, 0.030, 0.023], hollow: [0.003, 0.0025, 0.002],
  wood: [0.05, 0.034, 0.022], metal: [0.028, 0.026, 0.024], light: [0.36, 0.31, 0.24], dark: [0.022, 0.017, 0.013],
  wrap: [0.085, 0.065, 0.046], strap: [0.03, 0.023, 0.017], boot: [0.026, 0.02, 0.015], pack: [0.062, 0.047, 0.033],
  scarf: [0.10, 0.045, 0.028],
};

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- geometry helpers
// a piece: positions, colours, indices; normals come from the winding (outward)
function piece(pos, col, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('fcol', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// a closed surface around an axis: f(theta, v) -> [x, y, z], v from 0 (bottom) to 1 (top)
export function lathe(nu, nv, f, colF) {
  const pos = [], col = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) {
    const th = (i / nu) * Math.PI * 2, v = j / nv, p = f(th, v);
    pos.push(p[0], p[1], p[2]); col.push(...colF(th, v, p));
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const i1 = (i + 1) % nu, a = j * nu + i, b = j * nu + i1, c = (j + 1) * nu + i, d = (j + 1) * nu + i1;
    idx.push(a, c, b, b, c, d);
  }
  return piece(pos, col, idx);
}
// a swept tube with a varying radius along a curve; r(t), colour colF(t, theta)
export function tube(points, r, colF, { nu = 12, nv = 24, capEnd = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const fr = curve.computeFrenetFrames(nv, false);
  const pos = [], col = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    const t = j / nv, c = curve.getPointAt(t), N = fr.normals[j], B = fr.binormals[j], rr = typeof r === 'function' ? r(t) : r;
    for (let i = 0; i < nu; i++) {
      const th = (i / nu) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
      pos.push(c.x + rr * (cs * N.x + sn * B.x), c.y + rr * (cs * N.y + sn * B.y), c.z + rr * (cs * N.z + sn * B.z));
      col.push(...(typeof colF === 'function' ? colF(t, th) : colF));
    }
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const i1 = (i + 1) % nu, a = j * nu + i, b = j * nu + i1, c = (j + 1) * nu + i, d = (j + 1) * nu + i1;
    idx.push(a, b, c, b, d, c);
  }
  if (capEnd) {
    const e = curve.getPointAt(1), k = pos.length / 3;
    pos.push(e.x, e.y, e.z); col.push(...(typeof colF === 'function' ? colF(1, 0) : colF));
    for (let i = 0; i < nu; i++) idx.push(nv * nu + i, nv * nu + ((i + 1) % nu), k);
  }
  return piece(pos, col, idx);
}
// an ellipsoid (centre, radii), optionally squashed by a function of the unit direction
export function blob(c, r, colF, { nu = 20, nv = 14, warp = null } = {}) {
  return lathe(nu, nv, (th, v) => {
    const ring = Math.sin(Math.PI * v), d = [Math.cos(th) * ring, -Math.cos(Math.PI * v), Math.sin(th) * ring];
    const p = [c[0] + d[0] * r[0], c[1] + d[1] * r[1], c[2] + d[2] * r[2]];
    return warp ? warp(p, d) : p;
  }, (th, v, p) => (typeof colF === 'function' ? colF(th, v, p) : colF));
}
// a box, with a colour, placed by a matrix
function box(w, h, d, colr, m) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2).toNonIndexed();
  g.applyMatrix4(m);
  const n = g.attributes.position.count, col = [];
  for (let i = 0; i < n; i++) col.push(...colr);
  const pos = Array.from(g.attributes.position.array), idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  return piece(pos, col, idx);
}
// a flat ribbon along points, width w(t), the width direction from wdir(t, tangent)
function ribbon(points, w, wdir, colF, nv = 90) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos = [], col = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    const t = j / nv, c = curve.getPointAt(t), T = curve.getTangentAt(t), d = wdir(t, T), ww = w(t);
    for (const s of [-0.5, 0.5]) { pos.push(c.x + d.x * ww * s, c.y + d.y * ww * s, c.z + d.z * ww * s); col.push(...colF(t, s)); }
  }
  for (let j = 0; j < nv; j++) { const a = j * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  return piece(pos, col, idx);
}
function merge(geos) {
  let nV = 0, nI = 0;
  for (const g of geos) { nV += g.attributes.position.count; nI += g.index.count; }
  const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), col = new Float32Array(nV * 3), idx = new Uint32Array(nI);
  let ov = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, ov * 3); nrm.set(g.attributes.normal.array, ov * 3); col.set(g.attributes.fcol.array, ov * 3);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + ov;
    ov += g.attributes.position.count; oi += ix.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('fcol', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// ---------------------------------------------------------------- cloth
// keys: [y, front radius, back radius, side radius, centre x] ascending in y. wind is the local wind
// (unit, x forward, z right). bulges: [theta, y, height scale, amount] (knees and heels in the cloth).
export function cloak({ keys, wind, windAmt, folds = 0.05, bulges = [], hemWave = 0.025, lift = 0.05, nu = 96, nv = 56, colF, yShoulder }) {
  const y0 = keys[0][0], y1 = keys[keys.length - 1][0];
  const at = (y) => {
    let k = 0; while (k < keys.length - 2 && keys[k + 1][0] < y) k++;
    const a = keys[k], b = keys[k + 1], t = clamp01((y - a[0]) / (b[0] - a[0])), s = t * t * (3 - 2 * t);
    return a.map((x, i) => lerp(x, b[i], i === 0 ? t : s));
  };
  const yS = yShoulder ?? y1 - 0.1;
  return lathe(nu, nv, (th, v) => {
    const y = y0 + (y1 - y0) * v;
    const [, rf, rb, rz, cx] = at(y);
    const c = Math.cos(th), s = Math.sin(th);
    const low = clamp01((yS - y) / (yS - y0));            // 0 at the shoulders, 1 at the hem
    const fold = 1 + folds * (0.2 + 0.8 * low) * (0.55 * Math.sin(7 * th + 1.3) + 0.3 * Math.sin(12 * th + 0.4) + 0.15 * Math.sin(19 * th + 2.1));
    let x = c * (c > 0 ? rf : rb) * fold, z = s * rz * fold;
    for (const [tb, yb, sy, amt] of bulges) {
      const w = Math.pow(Math.max(Math.cos(th - tb), 0), 3) * Math.exp(-(((y - yb) / sy) ** 2));
      x += Math.cos(tb) * amt * w; z += Math.sin(tb) * amt * w;
    }
    // the wind: the windward side pressed to the body, the lee side billowing, the hem fluttering
    const lee = c * wind[0] + s * wind[1];
    const kw = Math.pow(low, 1.4);
    const press = 1 - 0.22 * kw * Math.max(-lee, 0);
    x *= press; z *= press;
    const push = windAmt * kw * (0.5 + 0.5 * lee);
    x += wind[0] * push; z += wind[1] * push;
    const fl = 0.05 * kw * kw * Math.max(lee, 0) * Math.sin(9 * th + 2.0);
    x += c * fl; z += s * fl;
    let yy = y;
    const hemK = 1 - clamp01((y - y0) / 0.25);
    yy += hemK * (hemWave * Math.sin(5 * th + 0.7) + lift * kw * kw * Math.max(lee, 0));
    return [x + cx, yy, z];
  }, (th, v, p) => colF ? colF(th, v, p) : C.cloth);
}

// a hood: an ellipsoid around the head with a cowl opening (pushed in, black) and an optional point
export function hood({ c, r, tip = null, wind, cowl = 0.1, brim = 0.03, nu = 56, nv = 36 }) {
  const v0 = 0.16;
  const fwdOpen = (d) => sstep(0.42, 0.85, d[0]) * (1 - sstep(0.3, 0.7, Math.abs(d[1] + 0.05)));
  return lathe(nu, nv, (th, vRaw) => {
    const v = v0 + (1 - v0) * vRaw;
    const ring = Math.sin(Math.PI * v), d = [Math.cos(th) * ring, -Math.cos(Math.PI * v), Math.sin(th) * ring];
    const p = [c[0] + d[0] * r[0], c[1] + d[1] * r[1], c[2] + d[2] * r[2]];
    const o = fwdOpen(d);
    p[0] -= cowl * o;                                                // the hollow where a face would be
    p[0] += brim * Math.exp(-(((d[0] - 0.45) / 0.14) ** 2)) * (1 - sstep(0.4, 0.8, Math.abs(d[1])));   // the rim stands proud
    if (tip) {
      const t = d[0] * tip.dir[0] + d[1] * tip.dir[1] + d[2] * tip.dir[2];
      const k = Math.pow(sstep(0.15, 1.0, t), tip.sharp);
      p[0] += tip.dir[0] * tip.len * k + wind[0] * tip.bend * k * k;
      p[1] += tip.dir[1] * tip.len * k - tip.droop * k * k;
      p[2] += tip.dir[2] * tip.len * k + wind[1] * tip.bend * k * k;
    }
    // the lower edge flares onto the shoulders
    const lowK = 1 - sstep(0.0, 0.25, vRaw);
    p[0] += d[0] * 0.03 * lowK; p[2] += d[2] * 0.05 * lowK;
    return p;
  }, (th, vRaw) => {
    const v = v0 + (1 - v0) * vRaw, ring = Math.sin(Math.PI * v);
    const d = [Math.cos(th) * ring, -Math.cos(Math.PI * v), Math.sin(th) * ring];
    const o = sstep(0.15, 0.6, fwdOpen(d));
    return C.cloth.map((x, i) => lerp(x, C.hollow[i], o));
  });
}

// the lantern: a dark frame (into the figure) and a glass body (its own emissive mesh)
export function lantern(c, parts, glass, { h = 0.13, r = 0.055 } = {}) {
  const [x, y, z] = c;
  const top = y + h / 2, bot = y - h / 2;
  parts.push(lathe(14, 4, (th, v) => { const rr = lerp(r * 1.25, 0.012, v); return [x + Math.cos(th) * rr, top + v * 0.06, z + Math.sin(th) * rr]; }, () => C.metal));
  parts.push(lathe(14, 2, (th, v) => { const rr = lerp(0.001, r * 1.15, Math.min(1, v * 2)); return [x + Math.cos(th) * rr, bot - 0.018 + v * 0.018, z + Math.sin(th) * rr]; }, () => C.metal));
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    parts.push(tube([V3(x + Math.cos(a) * r * 1.05, bot, z + Math.sin(a) * r * 1.05), V3(x + Math.cos(a) * r * 1.05, top, z + Math.sin(a) * r * 1.05)], 0.004, C.metal, { nu: 5, nv: 1 }));
  }
  glass.push(lathe(16, 6, (th, v) => { const rr = r * (0.82 + 0.18 * Math.sin(Math.PI * v)); return [x + Math.cos(th) * rr, bot + v * h, z + Math.sin(th) * rr]; }, () => [1, 1, 1]));
  return { top: [x, top + 0.06, z], centre: [x, y, z] };
}

// ---------------------------------------------------------------- the three figures (local frame:
// x forward, y up, z right; the ground under the figure's centre is y = 0)
function buildPilgrim(w) {
  const parts = [], glass = [], caps = [];
  // floor-length cloak, the hem dragging; legs hidden; the leading (left) knee and trailing heel show in the cloth
  parts.push(cloak({
    keys: [[0.0, 0.40, 0.42, 0.33, 0.0], [0.25, 0.30, 0.31, 0.27, 0.0], [0.6, 0.21, 0.23, 0.225, 0.02], [0.95, 0.16, 0.17, 0.20, 0.035],
      [1.2, 0.15, 0.16, 0.205, 0.05], [1.36, 0.14, 0.15, 0.215, 0.06], [1.45, 0.11, 0.12, 0.17, 0.065], [1.52, 0.07, 0.075, 0.085, 0.07]],
    wind: w, windAmt: 0.26, folds: 0.06, hemWave: 0.02, lift: 0.04,
    bulges: [[-0.35, 0.48, 0.22, 0.07], [Math.PI + 0.25, 0.15, 0.14, 0.05]], yShoulder: 1.4,
  }));
  // shoulder mantle: a short second layer that breaks the line of the body
  parts.push(cloak({
    keys: [[1.12, 0.21, 0.22, 0.27, 0.055], [1.3, 0.18, 0.19, 0.26, 0.06], [1.42, 0.14, 0.15, 0.22, 0.065], [1.52, 0.08, 0.085, 0.10, 0.07]],
    wind: w, windAmt: 0.1, folds: 0.07, hemWave: 0.015, lift: 0.03, yShoulder: 1.5, nv: 20,
    colF: () => C.cloth2,
  }));
  // deep pointed hood, its point falling back and pulled downwind
  parts.push(hood({ c: [0.075, 1.625, 0], r: [0.14, 0.15, 0.128], wind: w, cowl: 0.12, brim: 0.035,
    tip: { dir: [-0.55, 0.84, 0], len: 0.26, sharp: 1.8, bend: 0.09, droop: 0.07 } }));
  // right arm forward to the staff; left arm hanging in a wide sleeve, swung back
  const sleeve = (pts, r0, r1) => tube(pts, (t) => lerp(r0, r1, t * t), C.cloth, { nu: 14, nv: 20 });
  parts.push(sleeve([V3(0.05, 1.37, 0.17), V3(0.13, 1.17, 0.26), V3(0.27, 1.17, 0.30)], 0.062, 0.085));
  parts.push(blob([0.35, 1.17, 0.315], [0.045, 0.05, 0.04], C.dark));
  parts.push(sleeve([V3(0.03, 1.37, -0.17), V3(-0.04, 1.1, -0.24), V3(-0.1, 0.87, -0.25)], 0.06, 0.1));
  // the staff: planted ahead, a crook at the top, the lantern hanging from it on a cord
  const s0 = V3(0.47, -0.03, 0.335), s1 = V3(0.34, 2.2, 0.31);
  const crook = [s0, s1, V3(0.335, 2.3, 0.31), V3(0.39, 2.38, 0.31), V3(0.48, 2.385, 0.31), V3(0.545, 2.32, 0.31), V3(0.55, 2.25, 0.31)];
  parts.push(tube(crook, (t) => lerp(0.02, 0.014, t), C.wood, { nu: 10, nv: 70, capEnd: true }));
  const L = lantern([0.55, 2.05, 0.31], parts, glass);
  parts.push(tube([V3(0.55, 2.25, 0.31), V3(0.552, 2.16, 0.312), V3(L.top[0], L.top[1], L.top[2])], 0.004, C.metal, { nu: 5, nv: 6 }));
  caps.push([0.0, 0.03, 0.0, 0.34, 0.06, 1.42, 0.0, 0.2], [0.07, 1.5, 0, 0.13, -0.05, 1.8, 0, 0.07],
    [0.47, -0.03, 0.335, 0.02, 0.34, 2.2, 0.31, 0.02], [0.34, 2.2, 0.31, 0.02, 0.55, 2.3, 0.31, 0.02], [0.55, 2.05, 0.31, 0.06, 0.55, 2.05, 0.31, 0.06],
    [0.05, 1.37, 0.17, 0.07, 0.3, 1.17, 0.3, 0.07], [0.03, 1.37, -0.17, 0.07, -0.1, 0.87, -0.25, 0.09], [0.06, 1.28, 0, 0.27, 0.06, 1.42, 0, 0.2]);
  return { parts, glass, caps, lamp: L.centre, hem: { back: 0.36, width: 0.05 }, staffTip: [0.47, 0.335] };
}

function buildCartographer(w) {
  const parts = [], glass = [], caps = [];
  // knee-length cape over the shoulders
  parts.push(cloak({
    keys: [[0.5, 0.31, 0.33, 0.31, 0.02], [0.75, 0.24, 0.25, 0.26, 0.03], [1.0, 0.18, 0.19, 0.23, 0.04], [1.25, 0.16, 0.17, 0.225, 0.055],
      [1.38, 0.145, 0.155, 0.225, 0.06], [1.46, 0.11, 0.12, 0.17, 0.065], [1.53, 0.07, 0.075, 0.085, 0.07]],
    wind: w, windAmt: 0.2, folds: 0.055, hemWave: 0.03, lift: 0.06, yShoulder: 1.42,
  }));
  // legs: thighs mostly under the cape, wrapped shins, boots. Right leg leads.
  const legCol = (t, th) => {
    const band = Math.sin((t * 11 + th / (Math.PI * 2)) * Math.PI * 2);
    return t > 0.45 ? (band > 0.55 ? C.strap : C.wrap) : C.cloth2;
  };
  const leg = (hip, knee, ankle) => tube([V3(...hip), V3(...knee), V3(...ankle)], (t) => (t < 0.45 ? lerp(0.085, 0.07, t / 0.45) : lerp(0.07, 0.052, (t - 0.45) / 0.55)), legCol, { nu: 14, nv: 28 });
  parts.push(leg([0.03, 0.92, 0.095], [0.2, 0.52, 0.1], [0.33, 0.13, 0.1]));
  parts.push(leg([0.0, 0.92, -0.095], [-0.12, 0.5, -0.1], [-0.31, 0.17, -0.1]));
  // boots: the front one at heel strike, the back one pushing off from the toe
  const boot = (c, pitch) => {
    const g = blob([0, 0, 0], [0.12, 0.06, 0.052], C.boot, { warp: (p, d) => [p[0] + (d[0] > 0 ? 0.02 * d[0] : 0), p[1] < 0 ? p[1] * 0.6 : p[1], p[2]] });
    g.applyMatrix4(new THREE.Matrix4().makeRotationZ(pitch).setPosition(c[0], c[1], c[2])); return g;
  };
  parts.push(boot([0.37, 0.07, 0.1], 0.18));
  parts.push(boot([-0.28, 0.075, -0.1], -0.5));
  // rounded hood
  parts.push(hood({ c: [0.08, 1.63, 0], r: [0.135, 0.142, 0.125], wind: w, cowl: 0.1, brim: 0.025,
    tip: { dir: [-0.5, 0.86, 0], len: 0.02, sharp: 1.0, bend: 0.0, droop: 0.0 } }));
  // the instrument pack, a bedroll on top, a short mast with a small head
  const lean = new THREE.Matrix4().makeRotationZ(0.06);
  parts.push(box(0.2, 0.44, 0.34, C.pack, new THREE.Matrix4().makeTranslation(-0.235, 1.15, 0.0).multiply(lean)));
  parts.push(box(0.04, 0.2, 0.36, C.cloth2, new THREE.Matrix4().makeTranslation(-0.345, 1.28, 0.0).multiply(lean)));   // the flap
  parts.push(box(0.06, 0.16, 0.2, C.pack, new THREE.Matrix4().makeTranslation(-0.36, 1.02, 0.0).multiply(lean)));     // a pocket
  parts.push(tube([V3(-0.24, 1.42, -0.2), V3(-0.24, 1.42, 0.2)], 0.058, C.cloth2, { nu: 12, nv: 4, capEnd: true }));
  parts.push(tube([V3(-0.3, 1.3, 0.12), V3(-0.31, 2.02, 0.12)], 0.011, C.metal, { nu: 6, nv: 4 }));
  parts.push(tube([V3(-0.31, 1.98, 0.04), V3(-0.31, 1.98, 0.2)], 0.008, C.metal, { nu: 6, nv: 2 }));
  parts.push(blob([-0.31, 2.03, 0.12], [0.028, 0.022, 0.028], C.metal));
  // arms: right forward to the rod, left swinging back
  const sleeve = (pts, r0, r1) => tube(pts, (t) => lerp(r0, r1, t), C.cloth2, { nu: 12, nv: 18 });
  parts.push(sleeve([V3(0.05, 1.37, 0.18), V3(0.15, 1.12, 0.27), V3(0.36, 1.2, 0.3)], 0.055, 0.05));
  parts.push(blob([0.4, 1.2, 0.305], [0.042, 0.048, 0.038], C.dark));
  parts.push(sleeve([V3(0.03, 1.37, -0.18), V3(-0.1, 1.1, -0.25), V3(-0.13, 0.88, -0.23)], 0.055, 0.05));
  parts.push(blob([-0.135, 0.84, -0.23], [0.04, 0.05, 0.036], C.dark));
  // the survey rod: alternating light and dark bands, the lantern fixed on top
  const rodCol = (t) => (Math.floor(t * 10) % 2 ? C.light : C.dark);
  parts.push(tube([V3(0.44, -0.02, 0.305), V3(0.42, 2.0, 0.3)], 0.017, rodCol, { nu: 10, nv: 40 }));
  const L = lantern([0.42, 2.085, 0.3], parts, glass);
  caps.push([0.03, 0.5, 0, 0.3, 0.06, 1.42, 0, 0.2], [0.07, 1.5, 0, 0.12, 0.05, 1.77, 0, 0.11],
    [0.03, 0.92, 0.095, 0.08, 0.33, 0.1, 0.1, 0.055], [0.0, 0.92, -0.095, 0.08, -0.31, 0.12, -0.1, 0.055],
    [-0.24, 0.95, 0, 0.17, -0.24, 1.42, 0, 0.17], [-0.3, 1.4, 0.12, 0.012, -0.31, 2.05, 0.12, 0.02],
    [0.44, -0.02, 0.305, 0.017, 0.42, 2.0, 0.3, 0.017], [0.42, 2.09, 0.3, 0.06, 0.42, 2.09, 0.3, 0.06],
    [0.05, 1.37, 0.18, 0.06, 0.38, 1.2, 0.3, 0.05], [0.25, 0.06, 0.1, 0.06, 0.45, 0.06, 0.1, 0.06]);
  return { parts, glass, caps, lamp: L.centre, staffTip: [0.44, 0.305] };
}

function buildKite(w) {
  const parts = [], glass = [], caps = [];
  // long cloak to the ankles; the boot toes show under it
  parts.push(cloak({
    keys: [[0.07, 0.36, 0.37, 0.29, 0.02], [0.3, 0.28, 0.29, 0.25, 0.02], [0.65, 0.2, 0.22, 0.215, 0.03], [0.98, 0.155, 0.165, 0.195, 0.04],
      [1.22, 0.145, 0.155, 0.205, 0.05], [1.37, 0.135, 0.145, 0.21, 0.06], [1.46, 0.105, 0.115, 0.16, 0.065], [1.52, 0.07, 0.075, 0.085, 0.07]],
    wind: w, windAmt: 0.3, folds: 0.065, hemWave: 0.03, lift: 0.07,
    bulges: [[0.3, 0.45, 0.22, 0.06], [Math.PI - 0.3, 0.2, 0.15, 0.04]], yShoulder: 1.4,
  }));
  const toe = (c, pitch) => { const g = blob([0, 0, 0], [0.12, 0.06, 0.055], C.boot); g.applyMatrix4(new THREE.Matrix4().makeRotationZ(pitch).setPosition(c[0], c[1], c[2])); return g; };
  parts.push(toe([0.33, 0.055, 0.1], 0.12));
  // short hood, close to the head, a small point
  parts.push(hood({ c: [0.075, 1.625, 0], r: [0.128, 0.138, 0.118], wind: w, cowl: 0.09, brim: 0.02,
    tip: { dir: [-0.7, 0.71, 0], len: 0.06, sharp: 1.4, bend: 0.03, droop: 0.02 } }));
  // the scarf: a wrap at the neck and a long tail streaming downwind from the shoulder, twisting
  parts.push(tube([V3(0.1, 1.49, -0.09), V3(0.15, 1.49, 0.0), V3(0.1, 1.49, 0.09), V3(-0.02, 1.48, 0.1), V3(-0.06, 1.48, 0.0), V3(-0.02, 1.49, -0.1), V3(0.1, 1.49, -0.09)],
    0.03, C.scarf, { nu: 10, nv: 40 }));
  const wl = new THREE.Vector3(w[0], 0, w[1]).normalize(), side = new THREE.Vector3(-w[1], 0, w[0]), up = V3(0, 1, 0);
  const root = V3(-0.06, 1.45, 0.0).addScaledVector(side, -0.1);
  const Ls = 2.75, pts = [];
  for (let k = 0; k <= 16; k++) {
    const s = (k / 16) * Ls, f = s / Ls;
    const p = root.clone().addScaledVector(wl, s * 0.97);
    p.addScaledVector(up, 0.02 * s - 0.42 * f * f + 0.14 * f * Math.sin(s * 4.4 + 0.6));
    p.addScaledVector(side, 0.22 * f * Math.sin(s * 2.7 + 1.2));
    if (k === 0) p.y -= 0.02;
    pts.push(p);
  }
  parts.push(ribbon(pts, (t) => lerp(0.2, 0.11, t) * (t > 0.93 ? 1 - (t - 0.93) * 6 : 1), (t, T) => {
    const a = 0.25 + 1.3 * t + 0.35 * Math.sin(t * 9);
    return up.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).projectOnPlane(T).normalize();
  }, () => C.scarf));
  // left hand: the walking stick, planted ahead; right hand: the lantern, low at the hip
  const sleeve = (pts, r0, r1) => tube(pts, (t) => lerp(r0, r1, t * t), C.cloth, { nu: 12, nv: 18 });
  parts.push(sleeve([V3(0.05, 1.37, -0.17), V3(0.1, 1.12, -0.27), V3(0.27, 1.05, -0.29)], 0.058, 0.075));
  parts.push(blob([0.32, 1.05, -0.295], [0.042, 0.048, 0.038], C.dark));
  parts.push(tube([V3(0.5, -0.03, -0.31), V3(0.2, 1.47, -0.285)], (t) => lerp(0.016, 0.019, t), C.wood, { nu: 8, nv: 12, capEnd: true }));
  parts.push(sleeve([V3(0.03, 1.37, 0.17), V3(0.02, 1.1, 0.26), V3(0.07, 0.9, 0.29)], 0.058, 0.07));
  parts.push(blob([0.075, 0.86, 0.29], [0.04, 0.05, 0.036], C.dark));
  const L = lantern([0.085, 0.69, 0.3], parts, glass);
  parts.push(tube([V3(0.075, 0.83, 0.29), V3(0.08, 0.79, 0.295), V3(L.top[0], L.top[1], L.top[2])], 0.005, C.metal, { nu: 5, nv: 6 }));
  caps.push([0.02, 0.08, 0, 0.3, 0.06, 1.42, 0, 0.2], [0.07, 1.5, 0, 0.12, 0.0, 1.76, 0, 0.09],
    [0.5, -0.03, -0.31, 0.018, 0.2, 1.47, -0.285, 0.018], [0.085, 0.69, 0.3, 0.07, 0.085, 0.69, 0.3, 0.07],
    [0.05, 1.37, -0.17, 0.065, 0.3, 1.05, -0.29, 0.06]);
  for (let k = 0; k < 4; k++) { const a = pts[k * 4], b = pts[k * 4 + 4]; caps.push([a.x, a.y, a.z, 0.06, b.x, b.y, b.z, 0.045]); }
  return { parts, glass, caps, lamp: L.centre, hem: { back: 0.3, width: 0.045 } };
}

const BUILD = { a: buildPilgrim, b: buildCartographer, c: buildKite };
// a walker leans into the stride: everything is sheared forward with height (the hem stays put)
const LEAN = 0.06;
const leanM = new THREE.Matrix4().set(1, LEAN, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

// ---------------------------------------------------------------- shading shared with the ground
// opts.fade (the Pilgrim; the look test keeps its shadow as it was): the cast shadow fades with
// distance along it, and a capsule's shadow loses its core once the penumbra is wider than the capsule
// (the staff's shadow is soft and light a metre or two off; a small figure's shadow far off is not a
// solid shape), so a long low-sun shadow never ends in a detached blob
export const SHADOW_FADE = { from: 3.5, to: 20 };
export function createFigureShading(opts = {}) {
  const capA = [], capB = [];
  for (let i = 0; i < NCAP; i++) { capA.push(uniform(new THREE.Vector4())); capB.push(uniform(new THREE.Vector4())); }
  const uFig = uniform(new THREE.Vector4(0, 0, 0, 0));    // world centre x, y, z; 1 when placed
  const uLamp = uniform(new THREE.Vector4(0, 0, 0, 0));   // lantern x, y, z; pool intensity
  const uLampCol = uniform(new THREE.Vector3(...LAMP_COL));
  // one capsule round the whole figure (axis bottom xyz + radius, top xyz): a ground point whose ray
  // toward a sun misses it skips the per-capsule loop (most of the screen)
  const uBoundA = uniform(new THREE.Vector4(0, -1000, 0, 0)), uBoundB = uniform(new THREE.Vector4(0, -1000, 0, 0));

  // the ground hook (tsl-material.js opts.walk.figure)
  function groundHook({ xz, sp }) {
    const dh = length(xz.sub(uFig.xz)).toVar();
    const placed = uFig.w.greaterThan(0.5);
    const shadow = (L) => {
      const o = float(1.0).toVar();
      // closest approach of the ray from sp toward L and the bounding capsule's axis
      const bw0 = uBoundA.xyz.sub(sp).toVar(), bu = uBoundB.xyz.sub(uBoundA.xyz).toVar();
      const buL = dot(bu, L).toVar(), bdL = dot(bw0, L).toVar();
      const bs = clamp(bdL.mul(buL).sub(dot(bw0, bu)).div(max(dot(bu, bu).sub(buL.mul(buL)), 1e-6)), 0.0, 1.0).toVar();
      const bt = max(bdL.add(bs.mul(buL)), 0.0);
      const bd = length(bw0.add(bu.mul(bs)).sub(L.mul(bt)));
      const near = bd.lessThan(uBoundA.w.add(bt.mul(0.011)).add(0.05));
      If(placed.and(dh.lessThan(110.0)).and(L.y.greaterThan(0.0)).and(near), () => {
        for (let i = 0; i < NCAP; i++) {
          const A = capA[i], B = capB[i];
          const w0 = A.xyz.sub(sp).toVar(), u = B.xyz.sub(A.xyz).toVar();
          const uu = max(dot(u, u), 1e-6), uL = dot(u, L).toVar(), dL = dot(w0, L).toVar(), du = dot(w0, u);
          const den = max(uu.sub(uL.mul(uL)), 1e-6);
          const s = clamp(dL.mul(uL).sub(du).div(den), 0.0, 1.0).toVar();
          const t = max(dL.add(s.mul(uL)), 0.0).toVar();
          const d = length(w0.add(u.mul(s)).sub(L.mul(t)));
          const r = mix(A.w, B.w, s);
          const pen = t.mul(0.011).add(0.02);
          let occ = float(1.0).sub(smoothstep(r.sub(pen), r.add(pen), d)).mul(step(0.001, A.w.add(B.w)));
          if (opts.fade) occ = occ.mul(float(1.0).sub(smoothstep(SHADOW_FADE.from, SHADOW_FADE.to, t))).mul(clamp(r.add(0.005).div(pen), 0.0, 1.0));
          o.mulAssign(float(1.0).sub(occ.mul(0.94)));
        }
      });
      return o;
    };
    const ao = float(1.0).toVar();
    If(placed.and(dh.lessThan(4.0)), () => {
      for (let i = 0; i < NCAP; i++) {
        const A = capA[i], B = capB[i];
        const u = B.xyz.sub(A.xyz).toVar();
        const s = clamp(dot(sp.sub(A.xyz), u).div(max(dot(u, u), 1e-6)), 0.0, 1.0);
        const r = mix(A.w, B.w, s).toVar();
        const d = max(length(sp.sub(A.xyz.add(u.mul(s)))).sub(r), 0.0);
        const k = clamp(r.div(0.2), 0.2, 1.0).mul(0.6).mul(step(0.001, A.w.add(B.w)));
        ao.mulAssign(float(1.0).sub(k.mul(exp(d.div(-0.09)))));
      }
    });
    const light = (alb, n) => {
      const out = vec3(0.0).toVar();
      If(placed.and(dh.lessThan(25.0)), () => {
        const dv = uLamp.xyz.sub(sp).toVar();
        const d2 = dot(dv, dv).toVar();
        const l = dv.div(sqrt(d2));
        out.assign(alb.mul(uLampCol).mul(uLamp.w).mul(max(dot(n, l), 0.0)).div(d2.add(0.15)));
      });
      return out;
    };
    return { shadow, ao, light };
  }
  return { groundHook, capA, capB, uFig, uLamp, uLampCol, uBoundA, uBoundB };
}

// ---------------------------------------------------------------- the figure in the scene
export function createFigure({ kind, U, shade, scene }) {
  const aces = (x) => clamp(x.mul(x.mul(2.51).add(0.03)).div(x.mul(x.mul(2.43).add(0.59)).add(0.14)), 0.0, 1.0);
  const srgb = (c) => mix(c.mul(12.92), pow(c, vec3(1.0 / 2.4)).mul(1.055).sub(0.055), step(vec3(0.0031308), c));
  const finish = (col) => srgb(aces(col.mul(U.uExposure)));
  const { uLamp, uLampCol } = shade;
  const uBody = uniform(1.0), uGlow = uniform(0.5);

  // cloth: wrap diffuse from both suns, the sky and the bounce from the sand, the lantern, and a
  // little light through the cloth at the silhouette when a sun is behind it
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  mat.fragmentNode = Fn(() => {
    const n = normalize(normalWorld).toVar();
    const P = positionWorld.toVar();
    const V = normalize(cameraPosition.sub(P)).toVar();
    const ndv = max(dot(n, V), 0.0).toVar();
    const alb = attribute('fcol', 'vec3').toVar();
    const edge = pow(float(1.0).sub(ndv), 3.0).toVar();
    const sun = (L, Cc) => {
      const up = smoothstep(-0.02, 0.02, L.y);
      const diff = max(dot(n, L).add(0.3), 0.0).div(1.3);
      const thru = edge.mul(pow(max(dot(V.negate(), L), 0.0), 3.0));
      return Cc.mul(up).mul(alb.mul(diff).add(thru.mul(0.05)));
    };
    const col = sun(U.uSun1Dir, U.uSun1Col).add(sun(U.uSun2Dir, U.uSun2Col)).toVar();
    col.addAssign(alb.mul(mix(U.uAmbGround, U.uAmbSky, n.y.mul(0.5).add(0.5))));
    col.addAssign(alb.mul(U.uAmbSky).mul(edge).mul(0.5));
    const dv = uLamp.xyz.sub(P).toVar();
    const d2 = dot(dv, dv).toVar();
    const l = dv.div(sqrt(d2));
    col.addAssign(alb.mul(uLampCol).mul(uLamp.w).mul(max(dot(n, l).add(0.25), 0.0).div(1.25)).div(d2.add(0.02)));
    return vec4(finish(col), 1.0);
  })();

  const glassMat = new THREE.MeshBasicNodeMaterial();
  glassMat.fragmentNode = vec4(vec3(1.0, 0.78, 0.46).mul(uBody), 1.0);
  const glowMat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const rr = length(uv().sub(0.5)).mul(2.0);
  const fall = exp(rr.mul(rr).mul(-9.0)).mul(0.75).add(exp(rr.mul(rr).mul(-60.0)).mul(0.5)).mul(float(1.0).sub(smoothstep(0.85, 1.0, rr)));
  glowMat.colorNode = vec3(1.0, 0.6, 0.28).mul(fall).mul(uGlow);
  glowMat.opacityNode = float(1.0);

  const group = new THREE.Group();
  let built = null, mesh = null, glass = null, glow = null, tris = 0;
  const state = { placed: false, x: 0, y: 0, z: 0, headingDeg: 0, kind };

  function build(windLocal) {
    if (mesh) { group.remove(mesh, glass, glow); mesh.geometry.dispose(); glass.geometry.dispose(); }
    built = BUILD[kind](windLocal);
    const geo = merge(built.parts), gg = merge(built.glass);
    geo.applyMatrix4(leanM); gg.applyMatrix4(leanM);
    built.lamp = [built.lamp[0] + LEAN * built.lamp[1], built.lamp[1], built.lamp[2]];
    built.caps = built.caps.map((c) => [c[0] + LEAN * c[1], c[1], c[2], c[3], c[4] + LEAN * c[5], c[5], c[6], c[7]]);
    tris = (geo.index.count + gg.index.count) / 3;
    mesh = new THREE.Mesh(geo, mat); glass = new THREE.Mesh(gg, glassMat);
    glow = new THREE.Sprite(glowMat);
    glow.position.set(...built.lamp); glow.scale.set(0.9, 0.9, 0.9);
    mesh.frustumCulled = glass.frustumCulled = glow.frustumCulled = false;
    group.add(mesh, glass, glow);
  }
  group.visible = false;
  scene.add(group);

  // place at a world point (ground height y) facing headingDeg (x toward z): local x is forward,
  // local z is right, so the group turns by -heading about y
  function place(x, y, z, headingDeg) {
    const h = headingDeg * DEG;
    const wa = G.windDeg * DEG - h;
    build([Math.cos(wa), Math.sin(wa)]);
    group.position.set(x, y, z);
    group.rotation.set(0, -h, 0);
    group.updateMatrixWorld(true);
    Object.assign(state, { placed: true, x, y, z, headingDeg });
    group.visible = true;
    const m = group.matrixWorld, a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < NCAP; i++) {
      const c = built.caps[i];
      if (!c) { shade.capA[i].value.set(0, -1000, 0, 0); shade.capB[i].value.set(0, -1000, 0, 0); continue; }
      a.set(c[0], c[1], c[2]).applyMatrix4(m); b.set(c[4], c[5], c[6]).applyMatrix4(m);
      shade.capA[i].value.set(a.x, a.y, a.z, c[3]); shade.capB[i].value.set(b.x, b.y, b.z, c[7]);
    }
    shade.uBoundA.value.set(x, y - 0.1, z, 3.0); shade.uBoundB.value.set(x, y + 2.7, z, 3.0);   // wide: the Kite's scarf
    const lp = new THREE.Vector3(...built.lamp).applyMatrix4(m);
    shade.uLamp.value.set(lp.x, lp.y, lp.z, shade.uLamp.value.w);
    shade.uFig.value.set(x, y, z, 1);
  }
  function setTime(name) {
    const L = LAMP[name] || LAMP.dusk;
    shade.uLamp.value.w = L.pool; uBody.value = L.body; uGlow.value = L.glow;
  }

  // the trail: during the scripted walk, hem-drag (a, c) and staff marks (a, b) as extra trace stamps
  let lastHem = null, feet = 0;
  function trail(events, ws, trace) {
    if (state.placed) return;
    const h = ws.yaw, f = [Math.cos(h), Math.sin(h)], r = [-Math.sin(h), Math.cos(h)];
    const spec = BUILD_SPEC[kind];
    if (spec.hem) {
      const wob = 0.035 * Math.sin(ws.distance * 2.3);
      const p = [ws.x - f[0] * spec.hem.back + r[0] * wob, ws.z - f[1] * spec.hem.back + r[1] * wob];
      if (!lastHem) lastHem = p;
      else if (Math.hypot(p[0] - lastHem[0], p[1] - lastHem[1]) > 0.2) {
        trace.stamp({ type: 'slide', x0: lastHem[0], z0: lastHem[1], x1: p[0], z1: p[1], depth: 0.006, width: spec.hem.width, exposure: ws.exposure });
        lastHem = p;
      }
    }
    if (spec.staff) {
      for (const e of events) {
        if (e.type !== 'foot') continue;
        feet++;
        if (feet % 2) continue;   // the staff is planted with every other step
        const sx = ws.x + f[0] * spec.staff[0] + r[0] * spec.staff[1], sz = ws.z + f[1] * spec.staff[0] + r[1] * spec.staff[1];
        trace.stamp({ type: 'slide', x0: sx, z0: sz, x1: sx, z1: sz, depth: 0.035, width: 0.032, exposure: ws.exposure });
      }
    }
  }
  function resetTrail() { lastHem = null; feet = 0; state.placed = false; group.visible = false; shade.uFig.value.w = 0; }

  return {
    group, state, place, setTime, trail, resetTrail,
    get triangles() { return tris; },
    get lamp() { return shade.uLamp.value.toArray(); },
  };
}

// the trail spec per figure (no geometry needed): hem drag behind the centre, staff tip (forward, right)
const BUILD_SPEC = {
  a: { hem: { back: 0.36, width: 0.05 }, staff: [0.47, 0.335] },
  b: { hem: null, staff: [0.44, 0.305] },
  c: { hem: { back: 0.3, width: 0.045 }, staff: null },
};
