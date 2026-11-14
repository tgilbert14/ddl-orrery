// Orbit look test: the eleven worlds. Each is a sphere shaded in TSL (a day side and terminator
// from the pale sun, a faint red-sun fill, an atmosphere limb in its accent colour, and a surface
// pattern of its own) plus an atmosphere shell drawn behind it (analytic: the glow falls off with
// the ray's closest approach to the planet, lit where that point faces a sun).
// A world too small to resolve is drawn as a bright point (one instanced point pass for all eleven).
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, positionLocal, positionWorld, normalWorld, cameraPosition, normalize, dot, cross, exp, abs,
  clamp, smoothstep, mix, pow, max, min, sin, cos, atan, asin, acos, floor, fract, length, round, fwidth,
  mx_fractal_noise_float, mx_noise_float, mx_cell_noise_float, mx_worley_noise_float,
  instancedBufferAttribute, uv,
} from 'three/tsl';
import { SUN1, SUN2, lin, norm } from './light.js';

const v3 = (a) => vec3(a[0], a[1], a[2]);
const TAU = Math.PI * 2;
// smoothstep with falling edges (WGSL leaves low >= high undefined)
const rs = (a, b, x) => float(1.0).sub(smoothstep(b, a, x));
const fbm = (p, o = 5) => mx_fractal_noise_float(p, o, 2.0, 0.5, 1.0);

// latitude / longitude lines, antialiased: n lines of longitude, m of latitude
function latLonLines(p, n, m, width) {
  const lon = atan(p.z, p.x).div(TAU).add(0.5).mul(n);
  const lat = asin(clamp(p.y, -1.0, 1.0)).div(Math.PI).add(0.5).mul(m);
  const dl = abs(fract(lon).sub(0.5)).mul(2.0);
  const dt = abs(fract(lat).sub(0.5)).mul(2.0);
  const cosLat = max(length(p.xz), 0.05);
  const a = smoothstep(float(1.0).sub(float(width).div(cosLat)), 1.0, dl).mul(rs(0.98, 0.9, abs(p.y)));
  const b = smoothstep(1.0 - width, 1.0, dt);
  return max(a, b);
}

// The patterns. p: unit position on the sphere (object space). Each returns
// { alb: day albedo (linear), night: light on the night side, glow: light everywhere }
const PATTERNS = {
  'dust-sea': (p, A, w) => {
    // a desert world: erg fields of parallel dune ridges that bend and break, a few pale basins,
    // dark rock ranges, and one pale storm front arc with a soft leading edge
    const terrain = fbm(p.mul(2.1), 5).add(fbm(p.mul(7.5).add(4.0), 3).mul(0.25));
    const basin = rs(-0.28, -0.42, terrain);
    const rangeN = float(1.0).sub(abs(fbm(p.mul(3.1).add(1.7), 5)));
    const upland = smoothstep(0.8, 0.93, rangeN).mul(smoothstep(-0.05, 0.25, terrain)).add(smoothstep(0.45, 0.6, terrain)).min(1.0);
    const sand = mix(vec3(0.44, 0.245, 0.10), vec3(0.55, 0.33, 0.145), fbm(p.mul(5.0), 3).mul(0.5).add(0.5));
    const alb = sand.toVar();
    // erg ridges in a direction that turns slowly over the globe: a coarse set that reads from
    // orbit, a fine set that reads close; each fades to its mean once it is smaller than a pixel
    const bend = fbm(p.mul(1.7).add(9.0), 3);
    const base = p.y.mul(0.85).add(p.x.mul(0.42)).add(p.z.mul(0.2)).add(bend.mul(0.3));
    const ridgeSet = (freq, sharp) => {
      const ph = base.mul(freq).add(fbm(p.mul(freq * 0.05), 2).mul(0.6));
      const tri = abs(fract(ph).sub(0.5)).mul(2.0);
      const res = rs(0.12, 0.4, fwidth(ph).add(1e-4));
      return mix(float(0.42), smoothstep(sharp, 1.0, tri), res);
    };
    const breakUp = smoothstep(-0.2, 0.25, fbm(p.mul(9.0).add(2.0), 3));
    const ergK = smoothstep(-0.45, -0.3, terrain).mul(float(1.0).sub(upland));
    const ridges = ridgeSet(45.0, 0.55).mul(0.6).add(ridgeSet(160.0, 0.7).mul(0.4)).mul(breakUp);
    alb.mulAssign(ridges.sub(0.42).mul(ergK).mul(0.9).add(1.0));
    alb.assign(mix(alb, vec3(0.62, 0.46, 0.29).mul(fbm(p.mul(20.0), 3).mul(0.12).add(1.0)), basin.mul(0.8)));
    const rock = vec3(0.15, 0.09, 0.052).mul(fbm(p.mul(40.0), 3).mul(0.3).add(0.9));
    alb.assign(mix(alb, rock, upland.mul(0.9)));
    // the storm front: an arc about the given axis; dense pale dust behind a soft leading edge,
    // and the shade it throws on the sand behind it
    const ax = v3(w.stormAxis), side = v3(w.stormSide);
    const d = dot(p, ax).sub(0.8).add(fbm(p.mul(14.0), 4).mul(0.01));
    const sd = dot(p, side);
    const along = smoothstep(-0.5, -0.25, sd).mul(rs(0.5, 0.25, sd)).mul(smoothstep(-0.05, 0.15, dot(p, cross(ax, side))));
    const body = smoothstep(0.0, 0.008, d).mul(rs(0.05, 0.02, d));
    const lead = smoothstep(-0.03, 0.0, d).mul(rs(0.006, 0.0, d));
    const billow = fbm(p.mul(90.0), 3).mul(0.3).add(0.85);
    const storm = clamp(body.mul(billow).add(lead.mul(0.6)), 0.0, 1.0).mul(along);
    const shade = smoothstep(0.04, 0.06, d).mul(rs(0.11, 0.07, d)).mul(along);
    // wind streaks off the ranges, across the ergs
    const streak = smoothstep(0.1, 0.5, fbm(p.mul(vec3(70.0, 7.0, 70.0)).add(1.7), 3));
    alb.mulAssign(float(1.0).sub(streak.mul(0.14)));
    alb.mulAssign(float(1.0).sub(shade.mul(0.3)));
    alb.assign(mix(alb, vec3(0.9, 0.78, 0.62), storm.mul(0.92)));
    return { alb, night: vec3(0.0), glow: vec3(0.0) };
  },
  velocity: (p, A) => {
    const n = fbm(p.mul(3.0));
    const alb = mix(vec3(0.025, 0.02, 0.03), vec3(0.07, 0.05, 0.065), n.mul(0.5).add(0.5));
    const r1 = float(1.0).sub(abs(fbm(p.mul(4.2).add(1.3), 4)));
    const r2 = float(1.0).sub(abs(fbm(p.mul(11.0).add(7.7), 3)));
    const veins = pow(r1, 26.0).add(pow(r2, 34.0).mul(0.6)).mul(smoothstep(-0.3, 0.2, fbm(p.mul(1.6).add(9.0), 3)));
    return { alb, night: A.mul(veins).mul(4.0), glow: A.mul(veins).mul(0.08) };
  },
  grid: (p, A) => {
    const n = fbm(p.mul(4.0));
    const alb = mix(vec3(0.012, 0.025, 0.018), vec3(0.03, 0.05, 0.035), n.mul(0.5).add(0.5));
    const lines = latLonLines(p, 36, 18, 0.07);
    return { alb, night: A.mul(lines).mul(0.9), glow: A.mul(lines).mul(0.12) };
  },
  abyssal: (p, A) => {
    const n = fbm(p.mul(3.0).add(fbm(p.mul(6.0), 3).mul(0.6)));
    const alb = mix(vec3(0.004, 0.03, 0.045), vec3(0.015, 0.09, 0.10), n.mul(0.5).add(0.5));
    const patch = smoothstep(0.28, 0.5, fbm(p.mul(7.0).add(2.0), 4)).mul(smoothstep(0.0, 0.4, fbm(p.mul(19.0), 3).add(0.2)));
    return { alb, night: A.mul(patch).mul(2.6), glow: A.mul(patch).mul(0.06) };
  },
  arcadia: (p) => {
    const q = p.mul(6.0).add(fbm(p.mul(3.0), 3).mul(0.25));
    const cell = floor(q);
    const h = mx_cell_noise_float(cell);
    const f = fract(q);
    const border = smoothstep(0.0, 0.08, min(min(min(f.x, f.y), f.z), min(min(float(1.0).sub(f.x), float(1.0).sub(f.y)), float(1.0).sub(f.z))));
    const yellow = vec3(0.62, 0.46, 0.05), red = vec3(0.50, 0.09, 0.04), green = vec3(0.10, 0.34, 0.06);
    const c = mix(mix(yellow, red, smoothstep(0.32, 0.34, h)), green, smoothstep(0.65, 0.67, h));
    const alb = c.mul(border.mul(0.6).add(0.4)).mul(mx_cell_noise_float(floor(p.mul(30.0))).mul(0.25).add(0.8));
    return { alb, night: vec3(0.0), glow: vec3(0.0) };
  },
  aurora: (p, A) => {
    const n = fbm(p.mul(5.0));
    const cracks = smoothstep(0.0, 0.06, abs(fbm(p.mul(9.0).add(4.0), 4)));
    const alb = mix(vec3(0.42, 0.52, 0.62), vec3(0.75, 0.82, 0.88), n.mul(0.5).add(0.5)).mul(cracks.mul(0.3).add(0.7));
    const w = fbm(vec3(atan(p.z, p.x).mul(3.0), 0.0, 0.0).add(p.mul(2.0)), 3);
    const crown = exp(abs(p.y).sub(0.83).add(w.mul(0.05)).div(0.035).pow(2.0).negate());
    const curtain = crown.mul(sin(atan(p.z, p.x).mul(40.0).add(w.mul(8.0))).mul(0.35).add(0.75));
    return { alb, night: A.mul(curtain).mul(3.0), glow: A.mul(curtain).mul(0.5) };
  },
  uncharted: (p, A) => {
    const ax = v3(norm([0.6, 0.2, -0.77]));
    const formed = smoothstep(-0.08, 0.12, dot(p, ax).add(fbm(p.mul(5.0), 4).mul(0.12)));
    const lines = latLonLines(p, 24, 12, 0.05);
    const pale = vec3(0.62, 0.68, 0.72).mul(fbm(p.mul(2.0), 3).mul(0.08).add(1.0));
    const alb = mix(vec3(0.015, 0.022, 0.03), pale, formed).mul(float(1.0).sub(lines.mul(0.2)));
    const g = lines.mul(float(1.0).sub(formed).mul(0.9).add(0.1));
    return { alb, night: A.mul(g).mul(1.4), glow: A.mul(g).mul(0.5) };
  },
  archive: (p) => {
    const ax = v3(norm([0.2, 0.9, 0.3]));
    const ang = acos(clamp(dot(p, ax), -1.0, 1.0)).add(fbm(p.mul(3.0), 3).mul(0.03));
    const rings = sin(ang.mul(150.0)).mul(0.5).add(0.5);
    const broad = sin(ang.mul(19.0)).mul(0.5).add(0.5);
    const n = fbm(p.mul(6.0), 4);
    const alb = mix(vec3(0.42, 0.30, 0.17), vec3(0.70, 0.56, 0.36), broad.mul(0.6).add(n.mul(0.2)).add(0.2))
      .mul(rings.mul(0.22).add(0.82));
    return { alb, night: vec3(0.0), glow: vec3(0.0) };
  },
  drillyard: (p) => {
    const n = fbm(p.mul(5.0), 4);
    const steel = mix(vec3(0.08, 0.14, 0.24), vec3(0.20, 0.30, 0.44), n.mul(0.5).add(0.5));
    const F = mx_worley_noise_float(p.mul(8.0), 0.9);
    const pit = rs(0.30, 0.20, F);
    const rim = rs(0.42, 0.33, F).sub(pit);
    const F2 = mx_worley_noise_float(p.mul(23.0).add(5.0), 0.9);
    const pit2 = rs(0.22, 0.14, F2);
    const alb = steel.mul(rim.mul(0.4).add(1.0)).mul(float(1.0).sub(pit.mul(0.93))).mul(float(1.0).sub(pit2.mul(0.7)));
    return { alb, night: vec3(0.0), glow: vec3(0.0) };
  },
  stormwall: (p, A) => {
    const t = fbm(p.mul(3.0).add(fbm(p.mul(7.0), 3).mul(0.7)));
    const bands = sin(p.y.mul(22.0).add(t.mul(3.0))).mul(0.5).add(0.5);
    const alb = mix(vec3(0.12, 0.08, 0.28), vec3(0.34, 0.26, 0.56), bands).toVar();
    const ax = v3(norm([0.25, 0.92, -0.3]));
    const d = dot(p, ax).add(0.12).add(t.mul(0.08));
    const front = exp(d.div(0.05).pow(2.0).negate());
    const roll = exp(d.sub(0.05).div(0.02).pow(2.0).negate()).mul(fbm(p.mul(30.0), 3).mul(0.5).add(0.6));
    alb.assign(mix(alb, vec3(0.85, 0.82, 0.98), clamp(front.mul(0.7).add(roll), 0.0, 1.0)));
    const flicker = front.mul(smoothstep(0.35, 0.6, fbm(p.mul(25.0).add(2.0), 3)));
    return { alb, night: A.mul(flicker).mul(2.0), glow: vec3(0.0) };
  },
  beacons: (p, A) => {
    const n = fbm(p.mul(3.5));
    const alb = mix(vec3(0.03, 0.022, 0.018), vec3(0.09, 0.06, 0.045), smoothstep(-0.1, 0.3, n));
    // a chain of fire points along half a great circle
    const ax = norm([0.3, 0.8, 0.52]);
    const e1 = norm([0.95, -0.31, 0.0]);
    const e2 = norm([ax[1] * e1[2] - ax[2] * e1[1], ax[2] * e1[0] - ax[0] * e1[2], ax[0] * e1[1] - ax[1] * e1[0]]);
    const t = atan(dot(p, v3(e2)), dot(p, v3(e1)));
    const N = 22, stp = TAU / N;
    const k = round(t.div(stp));
    const dt = t.sub(k.mul(stp));
    const dn = dot(p, v3(ax)).add(sin(k.mul(1.7)).mul(0.03));
    const dist = length(vec3(dt, dn, 0.0));
    const on = smoothstep(-0.3, 0.2, t).mul(rs(3.0, 2.4, t));
    const fire = exp(dist.div(0.018).pow(2.0).negate()).add(exp(dist.div(0.05).negate()).mul(0.25)).mul(on);
    return { alb, night: A.mul(fire).mul(5.0), glow: A.mul(fire).mul(1.0) };
  },
};

// id, accent (sRGB 0-255), radius (m), atmosphere strength and height (fraction of radius)
export const WORLDS = [
  { id: 'dust-sea', accent: [255, 178, 94], R: 1400, atm: 1.0, H: 0.026 },
  { id: 'velocity', accent: [255, 46, 151], R: 520, atm: 0.8, H: 0.03 },
  { id: 'grid', accent: [52, 255, 136], R: 420, atm: 0.6, H: 0.03 },
  { id: 'abyssal', accent: [53, 240, 200], R: 1100, atm: 0.9, H: 0.035 },
  { id: 'arcadia', accent: [255, 210, 63], R: 480, atm: 0.7, H: 0.03 },
  { id: 'aurora', accent: [168, 233, 255], R: 650, atm: 1.1, H: 0.04 },
  { id: 'uncharted', accent: [100, 213, 245], R: 380, atm: 0.6, H: 0.03 },
  { id: 'archive', accent: [236, 194, 122], R: 560, atm: 0.7, H: 0.03 },
  { id: 'drillyard', accent: [127, 178, 229], R: 600, atm: 0.5, H: 0.025 },
  { id: 'stormwall', accent: [178, 158, 255], R: 1300, atm: 1.0, H: 0.04 },
  { id: 'beacons', accent: [255, 122, 60], R: 450, atm: 0.7, H: 0.03 },
];

function surfaceMaterial(w, centre) {
  const A = v3(lin(w.accent));
  const m = new THREE.MeshBasicNodeMaterial({ fog: false });
  m.colorNode = Fn(() => {
    const p = normalize(positionLocal);
    const pat = PATTERNS[w.id](p, A, w);
    const N = normalize(positionWorld.sub(v3(centre)));
    const V = normalize(cameraPosition.sub(positionWorld));
    const d1 = dot(N, v3(SUN1.dir)), d2 = dot(N, v3(SUN2.dir));
    const lam1 = clamp(d1.mul(1.05).add(0.03), 0.0, 1.0);
    const lam2 = clamp(d2.add(0.6).div(1.6), 0.0, 1.0);
    // light grazing the terminator crosses more air: warmer, toward the accent
    const term = mix(vec3(1.0, 0.5, 0.25).mul(A.mul(0.6).add(0.4)), vec3(1.0), smoothstep(0.0, 0.35, d1));
    const night = rs(0.1, -0.18, d1);
    const col = pat.alb.mul(v3(SUN1.col).mul(lam1).mul(term).add(v3(SUN2.col).mul(lam2).mul(0.12)).add(vec3(0.004, 0.005, 0.009))).toVar();
    col.addAssign(pat.night.mul(night));
    col.addAssign(pat.glow);
    // the limb: atmosphere seen edge-on, lit on the day side and through the terminator
    const mu = clamp(dot(N, V), 0.0, 1.0);
    const fres = pow(float(1.0).sub(mu), 3.0);
    const dayAir = smoothstep(-0.3, 0.35, d1);
    const redAir = smoothstep(-0.3, 0.35, d2);
    const air = A.mul(dayAir.mul(1.7).add(0.03)).add(v3(SUN2.col).mul(redAir).mul(0.25));
    col.assign(mix(col, air.mul(0.8), fres.mul(0.45).mul(w.atm)));
    col.addAssign(air.mul(pow(float(1.0).sub(mu), 8.0)).mul(0.8 * w.atm));
    return col;
  })();
  return m;
}

function shellMaterial(w, centre) {
  const A = v3(lin(w.accent));
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const C = v3(centre);
  const rd = normalize(positionWorld.sub(cameraPosition));
  const t = dot(C.sub(cameraPosition), rd);
  const P = cameraPosition.add(rd.mul(t));
  const h = length(P.sub(C)).div(w.R).sub(1.0);
  const glow = exp(max(h, 0.0).div(w.H).negate()).mul(rs(0.12, 0.06, h));
  const n = normalize(P.sub(C));
  const lit = smoothstep(-0.32, 0.45, dot(n, v3(SUN1.dir)));
  const red = smoothstep(-0.3, 0.45, dot(n, v3(SUN2.dir)));
  const fwd = pow(max(dot(rd, v3(SUN1.dir)), 0.0), 8.0).mul(lit);
  const col = A.mul(lit.mul(1.5).add(0.02)).add(v3(SUN2.col).mul(red).mul(0.22)).add(vec3(1.0, 0.8, 0.6).mul(fwd).mul(0.8));
  m.colorNode = col.mul(glow).mul(0.42 * w.atm);
  m.opacityNode = float(1.0);
  return m;
}

// worlds: [{ ...WORLDS[i], pos: [x, y, z], spin: [rx, ry, rz] }]
export function createWorlds(placed) {
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 192, 96);
  for (const w of placed) {
    const surf = new THREE.Mesh(sphere, surfaceMaterial(w, w.pos));
    surf.position.set(...w.pos);
    surf.scale.setScalar(w.R);
    surf.rotation.set(...w.spin);
    const shell = new THREE.Mesh(sphere, shellMaterial(w, w.pos));
    shell.position.set(...w.pos);
    shell.scale.setScalar(w.R * 1.14);
    group.add(surf, shell);
  }
  return group;
}

// the far worlds as points: one instanced pass, intensity set per shot (0 when a world is big enough)
export function createWorldPoints(placed) {
  const n = placed.length;
  const posA = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const colA = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const mat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending, fog: false });
  mat.positionNode = instancedBufferAttribute(posA);
  const d = length(uv().sub(0.5)).mul(2.0);
  mat.colorNode = instancedBufferAttribute(colA).mul(exp(d.mul(d).mul(-6.0)).add(exp(d.mul(-6.0)).mul(0.3)));
  mat.opacityNode = float(1.0);
  mat.sizeNode = float(14.0);
  const sprite = new THREE.Sprite(mat);
  sprite.count = n;
  sprite.frustumCulled = false;
  // per shot: place each point just in front of its world toward the camera, and fade it out once
  // the world itself is more than a few pixels across
  sprite.userData.update = (camera, pxPerRad) => {
    const cp = camera.position;
    placed.forEach((w, i) => {
      const dx = w.pos[0] - cp.x, dy = w.pos[1] - cp.y, dz = w.pos[2] - cp.z;
      const dist = Math.hypot(dx, dy, dz);
      const k = 1 - (w.R * 1.3) / dist;
      posA.setXYZ(i, cp.x + dx * k, cp.y + dy * k, cp.z + dz * k);
      const px = (w.R / dist) * pxPerRad;          // radius in pixels
      const a = Math.max(0, Math.min(1, (3.0 - px) / 2.0));
      const c = lin(w.accent);
      const lift = 0.5 + 0.5 * Math.max(0, (dx * -SUN1.dir[0] + dy * -SUN1.dir[1] + dz * -SUN1.dir[2]) / dist); // a fuller phase is brighter
      posA.needsUpdate = true;
      colA.setXYZ(i, (c[0] * 0.8 + 0.25) * a * lift, (c[1] * 0.8 + 0.22) * a * lift, (c[2] * 0.8 + 0.2) * a * lift);
      colA.needsUpdate = true;
    });
  };
  return sprite;
}

// a thin orbit circle through each world, about the ship (orrery still only)
export function createOrbitLines(placed) {
  const group = new THREE.Group();
  for (const w of placed) {
    const r = Math.hypot(...w.pos);
    const a = norm(w.pos), b = norm(w.orbitB);
    const pts = [];
    for (let i = 0; i <= 512; i++) {
      const t = (i / 512) * TAU;
      pts.push(new THREE.Vector3(...a.map((x, k) => (x * Math.cos(t) + b[k] * Math.sin(t)) * r)));
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const c = lin(w.accent);
    m.colorNode = vec3(c[0] * 0.10 + 0.012, c[1] * 0.10 + 0.010, c[2] * 0.10 + 0.008);
    m.opacityNode = float(1.0);
    group.add(new THREE.Line(g, m));
  }
  return group;
}
