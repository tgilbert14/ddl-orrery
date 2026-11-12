// Dust Sea walk: the Pilgrim in motion (third person, the default view).
//
// Figure A from the look test (figure.js), rebuilt upright and at rest, then moved every frame with
// no skeleton:
//   - body: one mesh (cloak, mantle, hood, sleeves, hand). Its positionNode bobs, sways and leans the
//     upper body, pushes the cloth with the stride (the leading shin forward under the front of the
//     cloak, the trailing one back under the rear, a little later the lower it is), pulls it downwind
//     in the figure's own frame (pressed on the windward side, billowing on the lee, fluttering in
//     gusts, harder on exposed crests), streams it uphill and lifts it while sliding, drags it with
//     acceleration, and lays the hem on the local slope of the sand (sunk by the walker's sink).
//     The hem, cuffs and mantle edge are ragged (a geometric wave plus alpha-tested notches).
//   - the staff: a rigid mesh placed on the CPU. It is planted every second step, stays put while the
//     body walks past it, lifts and swings forward; carried while running, dragged uphill while
//     sliding, upright beside the figure when standing. The right sleeve follows the hand.
//   - the lantern: a damped spherical pendulum (position-based, a 0.2 m cord) under the crook, driven
//     by the crook's motion and the wind. Its light pool on the sand follows it and flickers a little.
//   - the ground: the look test's capsule shadow and contact darkening (createFigureShading), fed
//     from the animated pose every frame.
// Local frame as in figure.js: x forward, y up, z right; y = 0 is the sand under the centre.

import * as THREE from 'three/webgpu';
import { Fn, uniform, attribute, vec3, vec4, float, normalize, dot, max, min, mix, clamp, smoothstep, length, pow, exp, step, sqrt, sin, cos, cross, sign,
  normalWorld, normalGeometry, positionWorld, positionGeometry, cameraPosition, modelWorldMatrix, negateOnBackSide, varying, Discard, If, mx_noise_float, uv } from 'three/tsl';
import { lathe, tube, blob, cloak, hood, lantern, C, LAMP, NCAP } from './figure.js';
import { height, heightD } from '../look-test/height.js';
import { SH } from '../look-test/params.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

export const PILGRIM = {
  staffLen: 2.2,
  hang: [0.21, 2.25, 0],       // the crook's end, in the staff's frame (y along the shaft)
  cord: 0.2,                   // hang point to the lantern's centre (m)
  plantAhead: 0.8, plantSide: 0.335, liftBehind: -0.42,
  restHand: [0.35, 1.17, 0.315],
  shoulderR: [0.05, 1.37, 0.17],
  hemBack: 0.36, hemWidth: 0.05,
  neckY: 1.47, headLean: 0.22,   // above the neck the head takes this share of the body's lean
};

const LAMP_DAMP = 5.0;    // 1/s, on the lantern's swing while walking (3.2 on a slide)
const LAMP_FOLLOW = 0.3;  // share of the crook's acceleration the lantern feels while walking
const LAMP_ACAP = 8;      // m/s^2, cap on that acceleration before the share is taken
const LAMP_KICK = 0.12;   // m/s sideways per step (0.5x a plain step, 0.9x a staff plant, 2x running)

// tag a geometry's vertices with (part, low, theta, w); fn(i, x, y, z) -> [low, theta, w]
function tag(g, part, fn) {
  const P = g.attributes.position, n = P.count, a = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { const r = fn(i, P.getX(i), P.getY(i), P.getZ(i)); a[i * 4] = part; a[i * 4 + 1] = r[0]; a[i * 4 + 2] = r[1]; a[i * 4 + 3] = r[2]; }
  g.setAttribute('cdat', new THREE.Float32BufferAttribute(a, 4));
  return g;
}
function mergeC(geos) {
  let nV = 0, nI = 0;
  for (const g of geos) { nV += g.attributes.position.count; nI += g.index.count; }
  const pos = new Float32Array(nV * 3), nrm = new Float32Array(nV * 3), col = new Float32Array(nV * 3), cd = new Float32Array(nV * 4), idx = new Uint32Array(nI);
  let ov = 0, oi = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, ov * 3); nrm.set(g.attributes.normal.array, ov * 3); col.set(g.attributes.fcol.array, ov * 3);
    if (g.attributes.cdat) cd.set(g.attributes.cdat.array, ov * 4); else cd.fill(9, ov * 4, (ov + g.attributes.position.count) * 4);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + ov;
    ov += g.attributes.position.count; oi += ix.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('fcol', new THREE.BufferAttribute(col, 3));
  out.setAttribute('cdat', new THREE.BufferAttribute(cd, 4));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// parts: 0 cloak, 1 mantle, 2 hood, 3 right sleeve and hand, 4 left sleeve, 9 rigid
function buildBody() {
  const Z = [0, 0];
  const parts = [];
  const cloakSpec = (keys, yS, opts) => {
    const nu = opts.nu ?? 96, nv = opts.nv ?? 56, y0 = keys[0][0];
    const g = cloak({ keys, wind: Z, windAmt: 0, hemWave: 0, lift: 0, bulges: [], yShoulder: yS, nu, nv, ...opts });
    return { g, nu, nv, y0, yS };
  };
  const tagCloth = ({ g, nu, y0, yS }, part) => tag(g, part, (i, x, y) => {
    const th = ((i % nu) / nu) * Math.PI * 2;
    return [clamp01((yS - y) / (yS - y0)), th, y - y0];
  });
  // the floor-length cloak (the hem drags; legs hidden)
  parts.push(tagCloth(cloakSpec([[0.0, 0.40, 0.42, 0.33, 0.0], [0.25, 0.30, 0.31, 0.27, 0.0], [0.6, 0.21, 0.23, 0.225, 0.02], [0.95, 0.16, 0.17, 0.20, 0.035],
    [1.2, 0.15, 0.16, 0.205, 0.05], [1.36, 0.14, 0.15, 0.215, 0.06], [1.45, 0.11, 0.12, 0.17, 0.065], [1.52, 0.07, 0.075, 0.085, 0.07]], 1.4, { folds: 0.06, nv: 64 }), 0));
  // the shoulder mantle
  parts.push(tagCloth(cloakSpec([[1.12, 0.21, 0.22, 0.27, 0.055], [1.3, 0.18, 0.19, 0.26, 0.06], [1.42, 0.14, 0.15, 0.22, 0.065], [1.52, 0.08, 0.085, 0.10, 0.07]], 1.5,
    { folds: 0.07, nv: 20, colF: () => C.cloth2 }), 1));
  // the hood
  parts.push(tag(hood({ c: [0.075, 1.625, 0], r: [0.14, 0.15, 0.128], wind: Z, cowl: 0.12, brim: 0.035,
    // a soft, heavy cowl: figure A's point, shorter and rounder, drooping back under its own weight
    tip: { dir: [-0.68, 0.73, 0], len: 0.15, sharp: 1.25, bend: 0.0, droop: 0.085 } }), 2, () => [0, 0, 0]));
  // sleeves: w = 0 at the shoulder, 1 at the cuff
  const sleeve = (pts, r0, r1, part) => tag(tube(pts, (t) => lerp(r0, r1, t * t), C.cloth, { nu: 14, nv: 20 }), part, (i) => [0, (i % 14) / 14 * Math.PI * 2, Math.floor(i / 14) / 20]);
  parts.push(sleeve([V3(0.05, 1.37, 0.17), V3(0.13, 1.17, 0.26), V3(0.27, 1.17, 0.30)], 0.062, 0.085, 3));
  parts.push(tag(blob([0.35, 1.17, 0.315], [0.045, 0.05, 0.04], C.dark), 3, () => [0, 0, 1.2]));
  parts.push(sleeve([V3(0.03, 1.37, -0.17), V3(-0.04, 1.1, -0.24), V3(-0.1, 0.87, -0.25)], 0.06, 0.1, 4));
  return mergeC(parts);
}

// the staff in its own frame: the tip at the origin, the shaft up +y, the crook bending toward +x
function buildStaff() {
  const L = PILGRIM.staffLen;
  const pts = [V3(0, 0, 0), V3(0, L * 0.5, 0), V3(0, L, 0), V3(-0.005, L + 0.1, 0), V3(0.05, L + 0.18, 0), V3(0.14, L + 0.185, 0), V3(0.205, L + 0.12, 0), V3(0.21, L + 0.05, 0)];
  const g = tube(pts, (t) => lerp(0.02, 0.014, t), (t) => (t < 0.03 ? C.dark : C.wood), { nu: 10, nv: 80, capEnd: true });
  return mergeC([g]);
}

// the lantern in its own frame: centre at the origin, the cord up to the hang point at (0, cord, 0)
function buildLantern() {
  const parts = [], glass = [];
  const Lt = lantern([0, 0, 0], parts, glass);
  parts.push(tube([V3(0, Lt.top[1], 0), V3(0.001, (Lt.top[1] + PILGRIM.cord) / 2, 0), V3(0, PILGRIM.cord, 0)], 0.004, C.metal, { nu: 5, nv: 4 }));
  return { frame: mergeC(parts), glass: mergeC(glass) };
}

// How much of sun n (1 or 2, the uniforms in U) reaches a point: the bake's horizon march
// (tsl-material.js horizonMarch, the same steps and limits) and the soft edge the ground makes of it.
function terrainLitFor(U) {
  return (x, y, z, n) => {
    const L = U[`uSun${n}Dir`].value, col = U[`uSun${n}Col`].value, sky = U[`uSun${n}Sky`].value;
    if (col.x + col.y + col.z <= 0) return 1;
    const k = 1 / Math.tan(Math.max(sky.w * SH.penumbra, 0.002));
    let hm = -8, t = SH.start;
    for (let i = 0; i < SH.steps; i++) {
      const qx = x + L.x * t, qy = y + L.y * t, qz = z + L.z * t;
      const d = qy - height(qx, qz);
      hm = Math.max(hm, L.y - d / t);
      t += Math.min(Math.max(Math.max(d, 0) * SH.dStep + t * SH.grow, SH.minStep), t * 0.35 + 1);
      if ((L.y - hm) * k < 0.002 || t > SH.maxDist || qy > SH.ceiling) break;
    }
    const r = clamp01((L.y - hm) * k);
    return r * r * (3 - 2 * r);
  };
}

export function createPilgrim({ U, shade, scene, reduced = false }) {
  const terrainLit = terrainLitFor(U);
  const aces = (x) => clamp(x.mul(x.mul(2.51).add(0.03)).div(x.mul(x.mul(2.43).add(0.59)).add(0.14)), 0.0, 1.0);
  const srgb = (c) => mix(c.mul(12.92), pow(c, vec3(1.0 / 2.4)).mul(1.055).sub(0.055), step(vec3(0.0031308), c));
  const finish = (col) => srgb(aces(col.mul(U.uExposure)));
  const { uLamp, uLampCol } = shade;

  // ---- per-frame uniforms
  const uPose = uniform(new THREE.Vector4());   // bob, sway (z), lean forward (shear), lean right (shear)
  const uGait = uniform(new THREE.Vector4());   // gait angle (pi per step), stride amount, hood yaw, time
  const uWindL = uniform(new THREE.Vector4());  // local wind toward x, z; strength; gust
  const uSlide = uniform(new THREE.Vector4());  // local downhill x, z; slide amount; extra hem bury
  const uGround = uniform(new THREE.Vector4()); // local ground slope (rise per metre) forward, right; acceleration forward, right
  const uHandR = uniform(new THREE.Vector3());
  const uHandL = uniform(new THREE.Vector3());
  const uBody = uniform(1.0), uGlow = uniform(0.5);
  // the dunes' shadow on the figure: per sun, how much reaches its base and its head (the same march
  // and soft edge as the ground's baked map, worked out on the CPU at the two points each frame), and
  // the height of its base
  const uTerr = uniform(new THREE.Vector4(1, 1, 1, 1));   // sun 1 base, sun 1 head, sun 2 base, sun 2 head
  const uTerrY = uniform(new THREE.Vector2(0, 1.6));      // base y, head y
  const terrK = (P) => smoothstep(uTerrY.x.add(0.1), uTerrY.y, P.y);
  const terrSh = (P) => { const k = terrK(P); return [mix(uTerr.x, uTerr.y, k), mix(uTerr.z, uTerr.w, k)]; };
  // in the dunes' shade, the same fill the ground gets there: the bright horizon under the pale sun
  const shadeFill = (alb, n, s1) => {
    const Lf = normalize(vec3(U.uSun1Dir.x, 0.0, U.uSun1Dir.z).add(vec3(0.0, 0.45, 0.0)));
    const lf = max(dot(n, Lf).add(0.35).div(1.35), 0.0);
    return alb.mul(U.uHorizon).mul(lf.mul(lf)).mul(float(1.0).sub(s1)).mul(U.uFill);
  };

  // ---- the body's vertex motion: disp() moves one rest point (p0 with its cdat tags); the normal is
  // taken from two more displaced points a little way along the rest surface (finite differences),
  // so moving folds shade
  const uRun = uniform(0.0);
  const disp = (p0, low, th, w, part) => {
    const isCloth = float(1.0).sub(step(1.5, part));
    const isCloak = step(part, 0.5);
    const isHood = step(1.5, part).mul(float(1.0).sub(step(2.5, part)));
    const isR = step(2.5, part).mul(float(1.0).sub(step(3.5, part)));
    const isL = step(3.5, part).mul(float(1.0).sub(step(4.5, part)));
    const p = vec3(p0).toVar();
    // the mantle is short and stiff: a third of the cloak's give
    const k = pow(low, 1.4).mul(isCloth).mul(mix(1.0, 0.35, step(0.5, part))).toVar();
    const c = cos(th).toVar(), s = sin(th).toVar();
    const t = uGait.w, ga0 = uGait.x, stride = uGait.y;
    // the stride under the cloth: the leading shin pushes the front out, the trailing one the back.
    // It starts at the hem and travels up the cloak (the higher, the later)
    const ga = ga0.sub(w.mul(1.6)).sub(0.25).toVar();
    const legR = cos(ga).mul(stride);
    const legF = mix(legR.negate(), legR, smoothstep(-0.7, 0.7, s)).toVar();
    const hp = float(1.0).sub(smoothstep(0.3, 1.05, p0.y)).mul(isCloth).mul(isCloak).toVar();
    const push = legF.mul(0.05).add(max(legF, 0.0).mul(max(c, 0.0)).mul(0.13)).add(min(legF, 0.0).mul(max(c.negate(), 0.0)).mul(0.12));
    p.x.addAssign(push.mul(hp));
    // the swinging leg kicks the hem out on its side: outward, forward and up, fading up the cloak
    const swR = max(sin(ga).negate(), 0.0).mul(smoothstep(0.05, 0.85, s));
    const swL = max(sin(ga), 0.0).mul(smoothstep(0.05, 0.85, s.negate()));
    const kick = swR.add(swL).mul(stride).mul(exp(w.mul(-2.4))).mul(isCloth).mul(isCloak).toVar();
    p.x.addAssign(c.mul(kick).mul(0.08).add(kick.mul(0.035)));
    p.z.addAssign(s.mul(kick).mul(0.1));
    p.y.addAssign(kick.mul(0.035));
    // the trailing heel lifts the back of the hem on its side as it pushes off
    const heel = max(legF.negate(), 0.0).mul(max(c.negate(), 0.0)).mul(float(1.0).sub(smoothstep(0.0, 0.3, w)));
    p.y.addAssign(heel.mul(0.06).mul(isCloth).mul(isCloak));
    // the hem stays as the body sways; the back of the cloak swings like a bell, behind the sway,
    // and the skirt twists a little with the hips
    p.z.addAssign(uPose.y.mul(-0.9).mul(k).mul(isCloak));
    const bell = sin(ga0.sub(1.5).sub(w.mul(0.8))).mul(stride).mul(k).mul(isCloak).mul(max(c.negate(), 0.0).mul(0.6).add(0.4));
    p.z.addAssign(bell.mul(0.06));
    const tw = sin(ga0.sub(0.9)).mul(stride).mul(k).mul(isCloak).mul(0.07);
    const tx0 = p.x.sub(0.03), tz0 = p.z;
    p.x.assign(tx0.mul(cos(tw)).sub(tz0.mul(sin(tw))).add(0.03));
    p.z.assign(tx0.mul(sin(tw)).add(tz0.mul(cos(tw))));
    // running: the cloak trails and its hem lifts off the sand
    const run = uRun;
    p.x.subAssign(run.mul(k).mul(0.15));
    p.y.addAssign(run.mul(k).mul(k).mul(max(c.negate(), 0.0).mul(0.1).add(0.035)));
    // the wind, in the figure's frame
    const wl = uWindL.xy, ws = uWindL.z;
    const lee = c.mul(wl.x).add(s.mul(wl.y)).toVar();
    const press = float(1.0).sub(k.mul(max(lee.negate(), 0.0)).mul(ws).mul(0.24));
    p.x.assign(p.x.sub(0.03).mul(press).add(0.03)); p.z.mulAssign(press);
    const pushW = ws.mul(k).mul(lee.mul(0.5).add(0.5)).mul(0.3);
    p.x.addAssign(wl.x.mul(pushW)); p.z.addAssign(wl.y.mul(pushW));
    const fl = k.mul(k).mul(ws).mul(max(lee, 0.0).mul(0.05).add(0.012)).mul(sin(th.mul(9.0).add(t.mul(7.3)).add(p0.y.mul(6.0))))
      .mul(sin(t.mul(2.1).add(th.mul(2.0))).mul(0.35).add(uWindL.w.mul(0.6)).add(0.35));
    p.x.addAssign(c.mul(fl)); p.z.addAssign(s.mul(fl));
    p.y.addAssign(k.mul(k).mul(max(lee, 0.0)).mul(ws).mul(uWindL.w.mul(0.05).add(0.03)).mul(sin(t.mul(4.7).add(th.mul(3.0))).mul(0.4).add(0.6)));
    // sliding: the cloth lifts, streams uphill and flaps
    const sl = uSlide.z;
    const up = c.mul(uSlide.x).add(s.mul(uSlide.y)).negate();   // 1 on the uphill side
    p.x.subAssign(uSlide.x.mul(sl).mul(k).mul(0.42)); p.z.subAssign(uSlide.y.mul(sl).mul(k).mul(0.42));
    p.y.addAssign(sl.mul(k).mul(k).mul(up.mul(0.5).add(0.7)).mul(0.26));
    const flap = sl.mul(k).mul(k).mul(sin(th.mul(7.0).add(t.mul(17.0)).add(p0.y.mul(5.0))).mul(0.6).add(sin(th.mul(3.0).sub(t.mul(11.0))).mul(0.4))).mul(0.04);
    p.x.addAssign(c.mul(flap)); p.z.addAssign(s.mul(flap)); p.y.addAssign(flap.mul(0.5));
    // acceleration drags the hem back
    p.x.subAssign(uGround.z.mul(k).mul(0.03)); p.z.subAssign(uGround.w.mul(k).mul(0.03));
    // a ragged hem
    const hemK = float(1.0).sub(smoothstep(0.0, 0.18, w)).mul(isCloth);
    p.y.addAssign(hemK.mul(sin(th.mul(5.0).add(0.7)).mul(0.016).add(sin(th.mul(17.0).add(1.3)).mul(0.011)).add(sin(th.mul(31.0)).mul(0.007))));
    // sleeves follow the hands
    p.addAssign(uHandR.mul(smoothstep(0.0, 1.0, w).mul(isR)));
    p.addAssign(uHandL.mul(w.mul(isL)));
    // the hood turns toward where it goes
    const a = uGait.z.mul(isHood);
    const hx = p.x.sub(0.07), hz = p.z;
    p.x.assign(hx.mul(cos(a)).sub(hz.mul(sin(a))).add(0.07));
    p.z.assign(hx.mul(sin(a)).add(hz.mul(cos(a))));
    // the upper body: bob, weight shift, lean (the hem stays on the sand)
    const wB = smoothstep(0.1, 1.1, p0.y);
    p.y.addAssign(uPose.x.mul(wB));
    p.z.addAssign(uPose.y.mul(wB));
    // the lean is a shear of the body up to the neck; above it the head is carried on the neck and
    // counter-rotates most of the lean, so the hood keeps its shape and stays nearly upright
    const yN = float(PILGRIM.neckY);
    const ly = mix(p0.y, yN.add(p0.y.sub(yN).mul(PILGRIM.headLean)), isHood).toVar();
    p.x.addAssign(uPose.z.mul(ly));
    p.z.addAssign(uPose.w.mul(ly));
    p.y.subAssign(p0.x.sub(0.075).mul(uPose.z).add(p0.z.mul(uPose.w)).mul(PILGRIM.headLean).mul(isHood));
    // the hem lies on the local slope of the sand, a little buried
    const kg = float(1.0).sub(smoothstep(0.0, 0.5, p0.y));
    p.y.addAssign(uGround.x.mul(p.x).add(uGround.y.mul(p.z)).sub(uSlide.w).mul(kg));
    return p;
  };
  const tagOf = () => { const cd = attribute('cdat', 'vec4'); return { part: cd.x, low: cd.y, th: cd.z, w: cd.w }; };
  const bodyPos = Fn(() => { const T = tagOf(); return disp(positionGeometry, T.low, T.th, T.w, T.part); })();
  // the displaced surface's normal, in the body's local frame (a varying)
  const bodyNrm = varying(Fn(() => {
    const T = tagOf();
    const isCloth = float(1.0).sub(step(1.5, T.part));
    const p0 = positionGeometry, n0 = normalize(normalGeometry).toVar();
    // two tangents of the rest surface: around (horizontal) and up it
    const ta = normalize(cross(vec3(0.0, 1.0, 0.0), n0).add(vec3(0.0, 0.0, 1e-4))).toVar();
    const tu = normalize(cross(n0, ta)).toVar();
    const e = 0.02;
    // what the tags do along each step: around the cloak th turns; up it low and w change
    const r = max(length(p0.xz), 0.05);
    const dth = float(e).div(r).mul(isCloth).mul(sign(dot(ta, vec3(sin(T.th).negate(), 0.0, cos(T.th)))));
    const dy = tu.y.mul(e);
    const span = mix(float(1.4), float(0.38), step(0.5, T.part));
    const P = disp(p0, T.low, T.th, T.w, T.part);
    const Pa = disp(p0.add(ta.mul(e)), T.low, T.th.add(dth), T.w, T.part);
    const Pu = disp(p0.add(tu.mul(e)), clamp(T.low.sub(dy.div(span).mul(isCloth)), 0.0, 1.0), T.th, T.w.add(dy.mul(isCloth)), T.part);
    const nn = cross(Pa.sub(P), Pu.sub(P)).toVar();
    return normalize(nn.mul(sign(dot(nn, n0)).add(0.001)));
  })());

  // ---- cloth shading: wrap diffuse from both suns, sky and sand bounce, the lantern, light through
  // the silhouette; a mottled weave in tone and sheen, dustier toward the hem; notched edges
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  mat.positionNode = bodyPos;
  mat.fragmentNode = Fn(() => {
    const cd = attribute('cdat', 'vec4');
    const part = cd.x, th = cd.z, w = cd.w;
    const q = positionGeometry;
    // notches in the hem, the mantle's edge and the cuffs
    const cloth = float(1.0).sub(step(1.5, part));
    const notch0 = float(1.0).sub(step(0.5, part));
    const notch = pow(max(sin(th.mul(29.0).add(sin(th.mul(7.0)).mul(2.0))), 0.0), 6.0).mul(0.05)
      .add(pow(max(sin(th.mul(53.0).add(1.0)), 0.0), 10.0).mul(0.035)).mul(notch0);
    If(w.lessThan(notch), () => { Discard(); });
    const sl = step(2.5, part).mul(float(1.0).sub(step(4.5, part)));
    If(sl.greaterThan(0.5).and(w.greaterThan(0.93)).and(sin(th.mul(5.0)).greaterThan(0.6)), () => { Discard(); });

    const n = negateOnBackSide(normalize(modelWorldMatrix.mul(vec4(bodyNrm, 0.0)).xyz)).toVar();
    const P = positionWorld.toVar();
    const V = normalize(cameraPosition.sub(P)).toVar();
    const ndv = max(dot(n, V), 0.0).toVar();
    const n1 = mx_noise_float(q.mul(vec3(7.0, 3.5, 7.0)));
    const n2 = mx_noise_float(q.mul(vec3(31.0, 22.0, 31.0)).add(vec3(5.0, 1.0, 3.0)));
    const tone = n1.mul(0.16).add(n2.mul(0.08)).add(1.0);
    const dust = float(1.0).sub(smoothstep(0.08, 0.6, q.y)).mul(cloth).toVar();
    const alb = attribute('fcol', 'vec3').mul(tone).toVar();
    alb.assign(mix(alb, vec3(0.058, 0.04, 0.026), dust.mul(0.55)));
    const rough = n2.mul(0.5).add(0.5);
    const edge = pow(float(1.0).sub(ndv), 3.0).toVar();
    const sun = (L, Cc) => {
      const upk = smoothstep(-0.02, 0.02, L.y);
      const diff = max(dot(n, L).add(0.3), 0.0).div(1.3);
      const thru = edge.mul(pow(max(dot(V.negate(), L), 0.0), 3.0));
      const sheen = edge.mul(max(dot(n, L), 0.0)).mul(float(1.0).sub(rough)).mul(0.035).mul(smoothstep(0.012, 0.035, alb.x));   // none in the hood's hollow
      return Cc.mul(upk).mul(alb.mul(diff).add(thru.mul(0.05)).add(sheen.mul(float(1.0).sub(dust.mul(0.6)))));
    };
    const [ts1, ts2] = terrSh(P);
    const t1 = ts1.toVar();
    const col = sun(U.uSun1Dir, U.uSun1Col).mul(t1).add(sun(U.uSun2Dir, U.uSun2Col).mul(ts2)).toVar();
    col.addAssign(alb.mul(mix(U.uAmbGround, U.uAmbSky, n.y.mul(0.5).add(0.5))));
    col.addAssign(alb.mul(U.uAmbSky).mul(edge).mul(0.5));
    col.addAssign(shadeFill(alb, n, t1));
    const dv = uLamp.xyz.sub(P).toVar();
    const d2 = dot(dv, dv).toVar();
    const l = dv.div(sqrt(d2));
    col.addAssign(alb.mul(uLampCol).mul(uLamp.w).mul(max(dot(n, l).add(0.25), 0.0).div(1.25)).div(d2.add(0.02)));
    return vec4(finish(col), 1.0);
  })();

  // rigid parts (staff, lantern frame): the same light, no motion in the shader
  const rigid = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  rigid.fragmentNode = Fn(() => {
    const n = normalize(normalWorld).toVar();
    const P = positionWorld.toVar();
    const alb = attribute('fcol', 'vec3').toVar();
    const sun = (L, Cc) => Cc.mul(smoothstep(-0.02, 0.02, L.y)).mul(alb).mul(max(dot(n, L).add(0.3), 0.0).div(1.3));
    const [ts1, ts2] = terrSh(P);
    const t1 = ts1.toVar();
    const col = sun(U.uSun1Dir, U.uSun1Col).mul(t1).add(sun(U.uSun2Dir, U.uSun2Col).mul(ts2)).toVar();
    col.addAssign(alb.mul(mix(U.uAmbGround, U.uAmbSky, n.y.mul(0.5).add(0.5))));
    col.addAssign(shadeFill(alb, n, t1));
    const dv = uLamp.xyz.sub(P).toVar();
    const d2 = dot(dv, dv).toVar();
    col.addAssign(alb.mul(uLampCol).mul(uLamp.w).mul(max(dot(n, dv.div(sqrt(d2))).add(0.25), 0.0).div(1.25)).div(d2.add(0.02)));
    return vec4(finish(col), 1.0);
  })();

  const glassMat = new THREE.MeshBasicNodeMaterial();
  glassMat.fragmentNode = vec4(vec3(1.0, 0.78, 0.46).mul(uBody), 1.0);
  const glowMat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  {
    const rr = length(uv().sub(0.5)).mul(2.0);
    const fall = exp(rr.mul(rr).mul(-9.0)).mul(0.75).add(exp(rr.mul(rr).mul(-60.0)).mul(0.5)).mul(float(1.0).sub(smoothstep(0.85, 1.0, rr)));
    glowMat.colorNode = vec3(1.0, 0.6, 0.28).mul(fall).mul(uGlow).mul(uBody);
    glowMat.opacityNode = float(1.0);
  }

  const body = new THREE.Mesh(buildBody(), mat);
  const staff = new THREE.Mesh(buildStaff(), rigid);
  const lant = buildLantern();
  const lampG = new THREE.Group();
  const lampFrame = new THREE.Mesh(lant.frame, rigid), lampGlass = new THREE.Mesh(lant.glass, glassMat);
  const glow = new THREE.Sprite(glowMat); glow.scale.set(0.9, 0.9, 0.9);
  lampG.add(lampFrame, lampGlass, glow);
  for (const o of [body, staff, lampFrame, lampGlass, glow]) o.frustumCulled = false;
  staff.matrixAutoUpdate = false;
  const group = new THREE.Group();
  group.add(body);
  scene.add(group, staff, lampG);
  const triangles = (body.geometry.index.count + staff.geometry.index.count + lant.frame.index.count + lant.glass.index.count) / 3;

  // ---- animation state (world)
  const st = {
    x: 0, y: 0, z: 0, heading: 0, visible: true,
    bob: 0, sway: 0, leanF: 0, leanS: 0, hood: 0, accF: 0, accR: 0, pvx: 0, pvz: 0, still: 0,
    tip: new THREE.Vector3(), tipMode: 'stand', planted: false, swingFrom: null, feet: 0,
    hang: new THREE.Vector3(), lamp: new THREE.Vector3(), lampD: new THREE.Vector3(0, -0.2, 0), lampV: new THREE.Vector3(), hv: new THREE.Vector3(), init: false,
    hemLast: null, dragLast: null, flick: 0, slideSm: 0,
  };
  const M = new THREE.Matrix4(), Mi = new THREE.Matrix4(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const toWorld = (lx, ly, lz, out = new THREE.Vector3()) => out.set(lx, ly, lz).applyMatrix4(M);

  // local offsets of a point at height y after the body's motion (bob, sway, lean)
  const leanY = (ly) => (ly > PILGRIM.neckY ? PILGRIM.neckY + (ly - PILGRIM.neckY) * PILGRIM.headLean : ly);
  const bodyAt = (lx, ly, lz) => [lx + st.leanF * leanY(ly), ly + st.bob * sstep(0.1, 1.1, ly), lz + st.sway * sstep(0.1, 1.1, ly) + st.leanS * leanY(ly)];

  function setTime(name) {
    const L = LAMP[name] || LAMP.dusk;
    st.pool = L.pool; uBody.value = L.body; uGlow.value = L.glow;
  }
  setTime('dusk');


  // ---- one frame. ws: the walker's state; heading (rad); wind: { dir [x, z] world, strength 0..1,
  // gust 0..1 }; t: animation time (s). Returns trace stamps for the staff, hem and drag.
  function update(dt, ws, { heading, angVel = 0, wind, t, wish = null }) {
    const stamps = [];
    const h = heading, fx = Math.cos(h), fz = Math.sin(h), rx = -fz, rz = fx;
    const g = height(ws.x, ws.z);
    const slipBury = 0.035 * sstep(24, 31, ws.slopeDeg);
    st.x = ws.x; st.z = ws.z; st.y = g - ws.sink - 0.01; st.heading = h;
    group.position.set(st.x, st.y, st.z);
    group.rotation.set(0, -h, 0);
    group.updateMatrixWorld(true);
    M.copy(group.matrixWorld); Mi.copy(M).invert();
    if (!st.init) { st.pvx = ws.vx; st.pvz = ws.vz; }

    const walkSpeed = Math.hypot(ws.vx, ws.vz);
    const moving = sstep(0.1, 1.2, walkSpeed);
    const k = dt > 0 ? ease(dt, 0.25) : 0;
    // acceleration in the local frame (smoothed)
    const ax = dt > 0 ? (ws.vx - st.pvx) / dt : 0, az = dt > 0 ? (ws.vz - st.pvz) / dt : 0;
    st.pvx = ws.vx; st.pvz = ws.vz;
    const aF = Math.max(-3, Math.min(3, ax * fx + az * fz)), aR = Math.max(-3, Math.min(3, ax * rx + az * rz));
    st.accF += (aF - st.accF) * k; st.accR += (aR - st.accR) * k;
    // the slope in the local frame
    const [, gx, gz] = heightD(ws.x, ws.z);
    const sF = gx * fx + gz * fz, sR = gx * rx + gz * rz;
    // slide direction (downhill) in the local frame
    const sv = Math.hypot(ws.sx, ws.sz);
    const dF = sv > 0.01 ? (ws.sx * fx + ws.sz * fz) / sv : 0, dR = sv > 0.01 ? (ws.sx * rx + ws.sz * rz) / sv : 0;
    st.slideSm += (ws.sliding - st.slideSm) * ease(dt || 1e-3, 0.2);
    st.still = moving > 0.05 ? 0 : st.still + dt;

    // body: a clear bob (lowest at each footfall), the weight carried over the planted foot (a shift
    // and a roll of the shoulders and hood), a forward pitch as each foot lands; leaning into the
    // slope and acceleration; breathing when still. The gait stays under reduced motion (it is not
    // vestibular, and the camera does not follow it).
    const gaitA = Math.PI * ws.phase;
    const run = ws.running, gm = moving * (1 - st.slideSm);
    const breathe = reduced ? 0 : (1 - moving);
    const land = Math.pow(Math.max(0, Math.cos(2 * gaitA)), 3);   // 1 at each footfall
    const climb = sstep(0.03, 0.2, sF) * gm * (1 - run);
    const bobT = -Math.cos(2 * gaitA) * (0.034 + 0.03 * run - 0.01 * climb) * gm - 0.012 * land * gm + 0.004 * Math.sin(t * 1.5) * breathe
      - 0.07 * st.slideSm;
    const swayT = (0.042 - 0.012 * run) * Math.sin(gaitA) * gm + (reduced ? 0 : 0.006 * Math.sin(t * 0.55) * breathe);
    let leanFT = 0.03 * moving + 0.11 * run + Math.max(-0.08, Math.min(0.2, 0.5 * sF * moving)) + 0.02 * st.accF + (0.035 + 0.03 * run) * land * gm;
    let leanST = Math.max(-0.07, Math.min(0.07, 0.02 * angVel * walkSpeed)) + 0.01 * st.accR + 0.034 * Math.sin(gaitA - 0.25) * gm * (1 - 0.5 * run);
    leanFT -= 0.24 * st.slideSm * dF; leanST -= 0.24 * st.slideSm * dR;     // sit back into the face
    leanFT += reduced ? 0 : 0.004 * Math.sin(t * 0.7) * breathe;
    st.bob = bobT; st.sway += (swayT - st.sway) * ease(dt || 1e-3, 0.05);
    const kl = ease(dt || 1e-3, 0.12);
    st.leanF += (leanFT - st.leanF) * kl; st.leanS += (leanST - st.leanS) * kl;
    st.climb = climb;
    // the hood looks where it goes (a little ahead of the turn); idle, it looks about slowly
    let hoodT = 0;
    if (wish && Math.hypot(wish[0], wish[1]) > 0.05) hoodT = Math.max(-0.5, Math.min(0.5, wrapPi(Math.atan2(wish[1], wish[0]) - h) * 0.6));
    if (!reduced && st.still > 4) hoodT += 0.35 * Math.sin((st.still - 4) * 0.21) * sstep(4, 7, st.still);
    st.hood += (hoodT - st.hood) * ease(dt || 1e-3, 0.35);

    // the wind in the local frame
    const wF = wind.dir[0] * fx + wind.dir[1] * fz, wR = wind.dir[0] * rx + wind.dir[1] * rz;
    uWindL.value.set(wF, wR, wind.strength, reduced ? 0 : wind.gust);
    uPose.value.set(st.bob, st.sway, st.leanF, st.leanS);
    uGait.value.set(gaitA, Math.min(1.5, walkSpeed / 1.6) * moving * (1 - 0.7 * st.slideSm), st.hood, reduced ? 0 : t);
    uRun.value = ws.running * (1 - st.slideSm);
    uSlide.value.set(dF, dR, st.slideSm, slipBury + 0.01);
    uGround.value.set(sF, sR, st.accF, st.accR);

    // ---- the staff
    const ahead = (fwd, side, out) => out.set(ws.x + fx * fwd + rx * side, 0, ws.z + fz * fwd + rz * side);
    const tipLocal = () => { tmp.copy(st.tip).applyMatrix4(Mi); return tmp; };
    let mode = 'stand';
    if (st.slideSm > 0.3) mode = 'slide';
    else if (ws.running > 0.45) mode = 'carry';
    else if (walkSpeed > 0.3) mode = 'walk';
    if (!st.init) { ahead(0.12, 0.36, st.tip); st.tip.y = height(st.tip.x, st.tip.z) - 0.03; st.planted = true; }
    const approach = (tx, ty, tz, rate) => { const a = ease(dt || 1e-3, 1 / rate); st.tip.x += (tx - st.tip.x) * a; st.tip.y += (ty - st.tip.y) * a; st.tip.z += (tz - st.tip.z) * a; };
    if (mode === 'walk') {
      const tl = tipLocal();
      if (st.planted && (tl.x < PILGRIM.liftBehind || Math.abs(tl.z - 0.33) > 0.35 || st.tipMode !== 'walk')) { st.planted = false; st.swingFrom = st.tip.clone(); }
      if (!st.planted) {
        const tgt = ahead(PILGRIM.plantAhead + 0.25 * (st.climb || 0), PILGRIM.plantSide, tmp2);
        const d0 = st.swingFrom ? Math.hypot(tgt.x - st.swingFrom.x, tgt.z - st.swingFrom.z) : 1;
        const d = Math.hypot(tgt.x - st.tip.x, tgt.z - st.tip.z);
        const prog = clamp01(1 - d / Math.max(d0, 0.05));
        approach(tgt.x, height(st.tip.x, st.tip.z) + 0.24 * Math.sin(Math.PI * prog) + 0.01, tgt.z, 10);
      }
    } else if (mode === 'carry') {
      st.planted = false;
      const tgt = ahead(0.55, 0.36, tmp2);
      approach(tgt.x, height(tgt.x, tgt.z) + 0.32, tgt.z, 8);
    } else if (mode === 'slide') {
      st.planted = false;
      // dragged behind, uphill, as a brake
      const ux = -ws.sx / Math.max(sv, 0.01), uz = -ws.sz / Math.max(sv, 0.01);
      const tx = ws.x + ux * 0.65 + rx * 0.3, tz = ws.z + uz * 0.65 + rz * 0.3;
      approach(tx, height(tx, tz) - 0.03, tz, 10);
      st.tip.y = Math.min(st.tip.y, height(st.tip.x, st.tip.z) - 0.02);
      if (!st.dragLast) st.dragLast = [st.tip.x, st.tip.z];
      else if (Math.hypot(st.tip.x - st.dragLast[0], st.tip.z - st.dragLast[1]) > 0.15) {
        stamps.push({ type: 'slide', x0: st.dragLast[0], z0: st.dragLast[1], x1: st.tip.x, z1: st.tip.z, depth: 0.03, width: 0.035, exposure: ws.exposure });
        st.dragLast = [st.tip.x, st.tip.z];
      }
    } else if (!st.planted) {
      const tgt = ahead(0.12, 0.36, tmp2);
      approach(tgt.x, height(tgt.x, tgt.z) - 0.03, tgt.z, 5);
      if (Math.hypot(tgt.x - st.tip.x, tgt.z - st.tip.z) < 0.03) {
        st.planted = true;
        stamps.push({ type: 'slide', x0: st.tip.x, z0: st.tip.z, x1: st.tip.x, z1: st.tip.z, depth: 0.03, width: 0.032, exposure: ws.exposure });
      }
    }
    if (mode !== 'slide') st.dragLast = null;
    st.tipMode = mode;

    // ---- the right hand rides the staff; the left swings with the gait
    const tl = tipLocal();
    // walking, the hand stays forward: the planted staff leans back, the body walks past it and it
    // leans forward before it lifts; climbing, the hand is higher and pulls on it
    const hx = Math.max(-0.05, Math.min(0.55, 0.3 + 0.38 * (tl.x - 0.15))), hy = 1.12 + (mode === 'carry' ? -0.06 : 0) + 0.06 * Math.max(0, tl.x - 0.3) + 0.1 * (st.climb || 0);
    const handW = toWorld(...bodyAt(hx, hy, 0.315), new THREE.Vector3());
    const dir = handW.clone().sub(st.tip).normalize();
    const R = PILGRIM.restHand;
    // sleeve offset, in the pre-motion local frame (the shader adds the body's motion on top)
    uHandR.value.set(hx - R[0], hy - R[1], 0);
    const la = -Math.cos(gaitA) * (0.11 + 0.08 * ws.running) * Math.min(1, walkSpeed / 1.6) * moving * (1 - st.slideSm);
    uHandL.value.set(la - 0.04 * ws.running, 0.03 * ws.running + 0.12 * st.slideSm, -0.05 * st.slideSm);

    // the staff's frame: y along the shaft, x toward the figure's forward
    const yA = dir, xA = new THREE.Vector3(fx, 0, fz).addScaledVector(yA, -(fx * yA.x + fz * yA.z)).normalize(), zA = new THREE.Vector3().crossVectors(xA, yA);
    staff.matrix.makeBasis(xA, yA, zA).setPosition(st.tip);
    staff.matrixWorldNeedsUpdate = true;
    staff.updateMatrixWorld(true);
    const hang = new THREE.Vector3(...PILGRIM.hang).applyMatrix4(staff.matrix);
    const staffTop = new THREE.Vector3(0, PILGRIM.staffLen, 0).applyMatrix4(staff.matrix);

    // ---- the lantern: a damped pendulum under the crook, integrated in the crook's own frame. The
    // crook's acceleration reaches the lantern as a pseudo-force that is capped and scaled down
    // (LAMP_FOLLOW), so the staff's big swing each stride rocks the lantern instead of flinging it.
    // A slide lets the full force through again.
    const Lc = PILGRIM.cord;
    if (!st.init) { st.lampD.set(0, -Lc, 0); st.lampV.set(0, 0, 0); st.hv.set(0, 0, 0); st.hang.copy(hang); }
    const n = 4, h4 = (dt || 0) / n;
    if (h4 > 0) {
      const hv = hang.clone().sub(st.hang).divideScalar(dt);   // the hang point's velocity
      const ap = hv.clone().sub(st.hv).divideScalar(dt);       // and its acceleration
      st.hv.copy(hv);
      const loose = clamp01(st.slideSm);
      const al = ap.length(), cap = lerp(LAMP_ACAP, 40, loose);
      if (al > cap) ap.multiplyScalar(cap / al);
      ap.multiplyScalar(lerp(LAMP_FOLLOW, 1, loose));
      const damp = lerp(LAMP_DAMP, 3.2, loose);
      for (let i = 0; i < n; i++) {
        const wf = reduced ? 0 : wind.strength * (0.4 + 0.6 * wind.gust);
        const acc = new THREE.Vector3(wind.dir[0] * wf, -9.81, wind.dir[1] * wf).sub(ap).addScaledVector(st.lampV, -damp);
        // sliding: the sand jolts the staff and the lantern swings hard
        if (st.slideSm > 0.05) { const jt = t * 9.0 + i * 0.3; acc.x += st.slideSm * 22 * (Math.sin(jt * 1.7) + 0.6 * Math.sin(jt * 3.1 + 1)) * rx; acc.z += st.slideSm * 22 * (Math.sin(jt * 1.7) + 0.6 * Math.sin(jt * 3.1 + 1)) * rz; acc.y += st.slideSm * 14 * Math.sin(jt * 2.3); }
        st.lampV.addScaledVector(acc, h4);
        st.lampD.addScaledVector(st.lampV, h4);
        st.lampD.multiplyScalar(Lc / Math.max(st.lampD.length(), 1e-4));          // the cord's length
        st.lampV.addScaledVector(st.lampD, -st.lampV.dot(st.lampD) / (Lc * Lc));   // no speed along the cord
      }
    }
    st.lamp.copy(hang).add(st.lampD);
    st.hang.copy(hang);
    lampG.position.copy(st.lamp);
    lampG.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hang.clone().sub(st.lamp).normalize());
    lampG.updateMatrixWorld(true);
    st.flick = reduced ? 0 : 0.03 * Math.sin(t * 13.1 + Math.sin(t * 3.7) * 2) + 0.02 * Math.sin(t * 29.3) + 0.015 * Math.sin(t * 5.3);
    uLamp.value.set(st.lamp.x, st.lamp.y, st.lamp.z, (st.pool ?? 1.6) * (1 + st.flick) * (st.visible ? 1 : 0));
    uBody.value = (LAMP_BODY[curTime] ?? 1) * (1 + st.flick * 0.6);

    // ---- the dunes' shadow at the figure's base and head (smoothed a little: the march is exact)
    {
      const g0 = height(st.x, st.z), kT = st.init ? ease(dt, 0.12) : 1;
      const s = [terrainLit(st.x, g0 + 0.15, st.z, 1), terrainLit(st.x, g0 + 1.55, st.z, 1), terrainLit(st.x, g0 + 0.15, st.z, 2), terrainLit(st.x, g0 + 1.55, st.z, 2)];
      const v = uTerr.value;
      v.set(v.x + (s[0] - v.x) * kT, v.y + (s[1] - v.y) * kT, v.z + (s[2] - v.z) * kT, v.w + (s[3] - v.w) * kT);
      uTerrY.value.set(g0, g0 + 1.55);
    }

    // ---- the capsules for the ground's shadow and contact darkening (world)
    const caps = [
      [...bodyAt(0.0, 0.03, 0.0), 0.34, ...bodyAt(0.06, 1.42, 0.0), 0.2],
      [...bodyAt(0.07, 1.5, 0), 0.13, ...bodyAt(-0.05, 1.8, 0), 0.07],
      [...bodyAt(0.06, 1.28, 0), 0.27, ...bodyAt(0.06, 1.42, 0), 0.2],
      [...bodyAt(0.05, 1.37, 0.17), 0.07, ...bodyAt(hx, hy, 0.31), 0.07],
      [...bodyAt(0.03, 1.37, -0.17), 0.07, ...bodyAt(-0.1 + uHandL.value.x, 0.87, -0.25), 0.09],
    ];
    const m = M;
    const wcap = (c) => { const a = new THREE.Vector3(c[0], c[1], c[2]).applyMatrix4(m), bb = new THREE.Vector3(c[4], c[5], c[6]).applyMatrix4(m); return [a.x, a.y, a.z, c[3], bb.x, bb.y, bb.z, c[7]]; };
    const all = caps.map(wcap);
    all.push([st.tip.x, st.tip.y, st.tip.z, 0.02, staffTop.x, staffTop.y, staffTop.z, 0.02]);
    all.push([staffTop.x, staffTop.y, staffTop.z, 0.02, hang.x, hang.y + 0.06, hang.z, 0.02]);
    all.push([st.lamp.x, st.lamp.y, st.lamp.z, 0.06, st.lamp.x, st.lamp.y, st.lamp.z, 0.06]);
    for (let i = 0; i < NCAP; i++) {
      const c = all[i];
      if (!c || !st.visible) { shade.capA[i].value.set(0, -1000, 0, 0); shade.capB[i].value.set(0, -1000, 0, 0); continue; }
      shade.capA[i].value.set(c[0], c[1], c[2], c[3]); shade.capB[i].value.set(c[4], c[5], c[6], c[7]);
    }
    shade.uFig.value.set(st.x, st.y, st.z, st.visible ? 1 : 0);
    // the bounding capsule: a vertical axis through the figure, wide enough for every capsule
    let br = 0, top = st.y + 0.5;
    for (const c of all) {
      br = Math.max(br, Math.hypot(c[0] - st.x, c[2] - st.z) + c[3], Math.hypot(c[4] - st.x, c[6] - st.z) + c[7]);
      top = Math.max(top, c[1] + c[3], c[5] + c[7]);
    }
    shade.uBoundA.value.set(st.x, st.y - 0.2, st.z, br + 0.05); shade.uBoundB.value.set(st.x, top, st.z, br + 0.05);

    // ---- the hem's drag line (lighter when running, none while the cloth flies on a slide)
    const wob = 0.035 * Math.sin(ws.distance * 2.3);
    const hp2 = [ws.x - fx * PILGRIM.hemBack + rx * wob, ws.z - fz * PILGRIM.hemBack + rz * wob];
    if (!st.hemLast) st.hemLast = hp2;
    else if (Math.hypot(hp2[0] - st.hemLast[0], hp2[1] - st.hemLast[1]) > 0.2) {
      if (st.slideSm < 0.4) stamps.push({ type: 'slide', x0: st.hemLast[0], z0: st.hemLast[1], x1: hp2[0], z1: hp2[1], depth: 0.006 * (1 - 0.6 * ws.running) + slipBury * 0.15, width: PILGRIM.hemWidth, exposure: ws.exposure });
      st.hemLast = hp2;
    }
    st.init = true;
    return stamps;
  }

  // a footfall: the staff is planted on every other step while walking
  function foot(e, ws) {
    st.feet++;
    // the lantern answers each step: a small kick across and down (more on a staff plant)
    if (st.init && !(e.slide > 0.5)) {
      const kk = (st.feet % 2 ? 0.5 : 0.9) * (1 + ws.running);
      const kv = LAMP_KICK * kk * (e.side || 1);   // a sideways speed, m/s
      st.lampV.x += -Math.sin(st.heading) * kv; st.lampV.z += Math.cos(st.heading) * kv;
    }
    if (st.tipMode !== 'walk' || st.feet % 2) return null;
    st.planted = true;
    st.tip.y = height(st.tip.x, st.tip.z) - 0.035;
    return { type: 'slide', x0: st.tip.x, z0: st.tip.z, x1: st.tip.x, z1: st.tip.z, depth: 0.035, width: 0.032, exposure: ws.exposure };
  }

  let curTime = 'dusk';
  const LAMP_BODY = Object.fromEntries(Object.entries(LAMP).map(([k, v]) => [k, v.body]));
  function setTimeName(name) { curTime = name; setTime(name); }

  function setVisible(v) {
    st.visible = v; group.visible = staff.visible = lampG.visible = v;
    if (!v) { shade.uFig.value.w = 0; shade.uLamp.value.w = 0; }
  }
  function reset() { st.init = false; st.hemLast = null; st.dragLast = null; st.feet = 0; st.planted = false; st.still = 0; }

  return {
    update, foot, setTime: setTimeName, setVisible, reset, glowMat, glow, uGlow,
    get state() { return { x: st.x, y: st.y, z: st.z, heading: st.heading, tip: st.tip.toArray(), planted: st.planted, mode: st.tipMode, lamp: st.lamp.toArray(), hang: st.hang.toArray(), bob: st.bob, sway: st.sway, leanF: st.leanF, still: st.still }; },
    triangles,
  };
}
