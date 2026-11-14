// WebGPURenderer path (WebGPU, or WebGL2 with forceWebGL): the Dust Sea ground, sky, shadow-map
// bake and probes as TSL node materials. Same maths as height.js and glsl-material.js, same order:
//   hash2 -> vnoise -> vnoiseD -> duneProfile -> duneProfileD -> slipProfileD -> slipProfile
//   -> heightLow -> heightLowD -> height -> heightD                                                (ground formula)
//   shadowMarch -> horizonMarch -> sunSky -> starField -> wallHit -> domes -> haboob -> skyColor -> fogAmount
//   -> sandHaze -> ribbons -> sunOnSand -> aces -> srgbEncode          (light, sky, air, output)
// Every TSL name used here is in the webgpu-tsl cheat sheet or was checked against the exports of
// surface/vendor/three-r186/three.tsl.js (atan with two arguments, textureLevel, acos, log, exp).
//
// opts (compile-time debug switches, see main.js):
//   shadows: 'map' (default) | 'march' (round one's per-pixel reference) | 'off'
//   normal:  'analytic' (default) | 'fd' (round one: three full height evaluations per pixel)
//   ripples: true | false

import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, Break, select, uint, int, float, vec2, vec3, vec4, uniform, varying,
  floor, mix, smoothstep, clamp, max, min, pow, exp, log, sqrt, cos, sin, acos, atan, tan, normalize, dot,
  length, abs, step, fwidth, positionLocal, positionWorld, cameraPosition, uv, screenCoordinate,
  textureLevel,
} from 'three/tsl';
import { G, SH, SHMAP, SKY, SAND, STORM, GRID, CAM, DEG, UNIFORM_TYPES } from './params.js';

const WX = Math.cos(G.windDeg * DEG), WZ = Math.sin(G.windDeg * DEG);
const W2X = Math.cos(G.dir2Deg * DEG), W2Z = Math.sin(G.dir2Deg * DEG);
const TAU = 6.28318530718;
const LNR = Math.log(SHMAP.r1 / SHMAP.r0);

export function createTslMaterials(values, opts, shadowTex) {
  // ---------------------------------------------------------------- uniforms
  const U = {};
  for (const [k, t] of Object.entries(UNIFORM_TYPES)) {
    const v = values[k];
    U[k] = uniform(t === 'float' ? v : t === 'vec2' ? new THREE.Vector2(...v) : t === 'vec3' ? new THREE.Vector3(...v) : new THREE.Vector4(...v));
  }
  const uGridOrigin = uniform(new THREE.Vector2());
  const uProbeO = uniform(new THREE.Vector2());
  const uShC = uniform(new THREE.Vector2());
  // ---- walk slice (surface/walk/): optional, additive. Without opts.walk nothing below changes the
  // look test's graph. With it: a second shadow map and a cross-fade between the two, two more suns
  // (the next time of day, faded in while the current two fade out), a bake that reads its own sun
  // uniforms and centre, and hooks for the ground's position (the clipmap), the trace map and the air,
  // and the storm front (walk.storm: composited last over the ground and the sky, a branch on its own
  // uniform; the look test passes no walk options and is unchanged).
  const WK = opts.walk || null;
  if (WK) {
    for (const k of ['uSun3Dir', 'uSun4Dir', 'uSun3Col', 'uSun4Col', 'uSun3Disc', 'uSun4Disc', 'uSun3Tint', 'uSun4Tint', 'uBakeSun1', 'uBakeSun2']) U[k] = uniform(new THREE.Vector3());
    for (const k of ['uSun3Sky', 'uSun4Sky', 'uSun3Glow', 'uSun4Glow', 'uShPA', 'uShPB', 'uBakeK']) U[k] = uniform(new THREE.Vector4());
    for (const k of ['uShCB', 'uBakeC']) U[k] = uniform(new THREE.Vector2());
    for (const k of ['uFade', 'uShMix', 'uTime', 'uFill']) U[k] = uniform(0);
  }

  // ---------------------------------------------------------------- ground formula
  const hash2 = Fn(([ix, iy]) => {
    const h = uint(ix).mul(uint(374761393)).add(uint(iy).mul(uint(668265263))).toVar();
    h.assign(h.bitXor(h.shiftRight(uint(13))).mul(uint(1274126177)));
    h.assign(h.bitXor(h.shiftRight(uint(16))));
    return float(h.shiftRight(uint(8))).div(16777216.0);
  }).setLayout({ name: 'hash2', type: 'float', inputs: [{ name: 'ix', type: 'int' }, { name: 'iy', type: 'int' }] });

  const vnoise = Fn(([p]) => {
    const i = floor(p).toVar();
    const fr = p.sub(i).toVar();
    const u = fr.mul(fr).mul(fr.mul(-2.0).add(3.0)).toVar();
    const ix = int(i.x).toVar(), iy = int(i.y).toVar();
    const a = hash2(ix, iy), b = hash2(ix.add(int(1)), iy);
    const c = hash2(ix, iy.add(int(1))), d = hash2(ix.add(int(1)), iy.add(int(1)));
    const ab = mix(a, b, u.x).toVar(), cd = mix(c, d, u.x).toVar();
    return mix(ab, cd, u.y).mul(2.0).sub(1.0);
  }).setLayout({ name: 'vnoise', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });

  const vnoiseD = Fn(([p]) => {
    const i = floor(p).toVar();
    const fr = p.sub(i).toVar();
    const u = fr.mul(fr).mul(fr.mul(-2.0).add(3.0)).toVar();
    const du = fr.mul(float(1.0).sub(fr)).mul(6.0).toVar();
    const ix = int(i.x).toVar(), iy = int(i.y).toVar();
    const a = hash2(ix, iy).toVar(), b = hash2(ix.add(int(1)), iy).toVar();
    const c = hash2(ix, iy.add(int(1))).toVar(), d = hash2(ix.add(int(1)), iy.add(int(1))).toVar();
    const ab = mix(a, b, u.x).toVar(), cd = mix(c, d, u.x).toVar();
    const ba = b.sub(a).toVar();
    return vec3(
      mix(ab, cd, u.y).mul(2.0).sub(1.0),
      du.x.mul(ba.add(d.sub(c).sub(ba).mul(u.y))).mul(2.0),
      du.y.mul(cd.sub(ab)).mul(2.0));
  }).setLayout({ name: 'vnoiseD', type: 'vec3', inputs: [{ name: 'p', type: 'vec2' }] });

  const duneProfile = Fn(([t, k]) => {
    const u = t.div(G.crest).toVar();
    const v = t.sub(G.crest).div(1.0 - G.crest).toVar();
    const up = u.mul(u).mul(float(2.0).sub(u)).toVar();
    const omv = float(1.0).sub(v).toVar();
    const down = omv.mul(omv).toVar();
    const h = clamp(down.sub(up).div(k).mul(0.5).add(0.5), 0.0, 1.0).toVar();
    return down.add(up.sub(down).mul(h)).sub(k.mul(h).mul(float(1.0).sub(h)));
  }).setLayout({ name: 'duneProfile', type: 'float', inputs: [{ name: 't', type: 'float' }, { name: 'k', type: 'float' }] });

  const duneProfileD = Fn(([t, k]) => {
    const u = t.div(G.crest).toVar();
    const v = t.sub(G.crest).div(1.0 - G.crest).toVar();
    const up = u.mul(u).mul(float(2.0).sub(u)).toVar();
    const omv = float(1.0).sub(v).toVar();
    const down = omv.mul(omv).toVar();
    const dup = u.mul(4.0).sub(u.mul(u).mul(3.0)).div(G.crest);
    const ddown = omv.mul(-2.0).div(1.0 - G.crest).toVar();
    const h = clamp(down.sub(up).div(k).mul(0.5).add(0.5), 0.0, 1.0).toVar();
    return vec3(
      down.add(up.sub(down).mul(h)).sub(k.mul(h).mul(float(1.0).sub(h))),
      ddown.add(dup.sub(ddown).mul(h)),
      h.mul(float(1.0).sub(h)).negate());
  }).setLayout({ name: 'duneProfileD', type: 'vec3', inputs: [{ name: 't', type: 'float' }, { name: 'k', type: 'float' }] });

  // round three: the primary dune in metres (see height.js): windward W, slip face S at the angle
  // of repose, floor bm, apron smax(S, bm), brink smin(W, apron). tg is tan(leeDeg).
  const LEE_T = Math.tan(G.leeDeg * DEG);
  const KB_SLOPE = (G.roundLo - G.roundHi) / (G.A1 * (1 - G.ampBase));
  const XC = G.crest * G.L1;
  const slipProfileD = Fn(([x, amp, bm]) => {
    const dx = x.sub(XC).toVar();
    const u = dx.div(amp.mul(G.windK)).add(1.0).toVar();
    const uc = clamp(u, 0.0, 1.0).toVar();
    const P = uc.mul(uc).mul(float(3.0).sub(uc.mul(2.0))).toVar();
    const dP = select(u.lessThan(1.0), uc.mul(6.0).mul(float(1.0).sub(uc)), float(0.0)).toVar();
    const W = amp.mul(P).add(bm).toVar();
    const Wx = dP.div(G.windK);
    const Wa = P.sub(dP.mul(u.sub(1.0)));
    const S = amp.sub(dx.mul(LEE_T)).toVar();
    const kA = amp.mul(G.apronF).toVar();
    const hA = clamp(S.sub(bm).div(kA).mul(0.5).add(0.5), 0.0, 1.0).toVar();
    const L = bm.add(S.sub(bm).mul(hA)).add(kA.mul(hA).mul(float(1.0).sub(hA))).toVar();
    const Lx = hA.mul(-LEE_T);
    const La = hA.add(hA.mul(float(1.0).sub(hA)).mul(G.apronF));
    const Lb = float(1.0).sub(hA);
    const kB = amp.sub(G.A1 * G.ampBase).mul(KB_SLOPE).add(G.roundHi).toVar();
    const hB = clamp(L.sub(W).div(kB).mul(0.5).add(0.5), 0.0, 1.0).toVar();
    const omb = float(1.0).sub(hB).toVar();
    return vec4(
      L.add(W.sub(L).mul(hB)).sub(kB.mul(hB).mul(omb)),
      hB.mul(Wx).add(omb.mul(Lx)),
      hB.mul(Wa).add(omb.mul(La)).sub(hB.mul(omb).mul(KB_SLOPE)),
      hB.add(omb.mul(Lb)));
  }).setLayout({ name: 'slipProfileD', type: 'vec4', inputs: [{ name: 'x', type: 'float' }, { name: 'amp', type: 'float' }, { name: 'bm', type: 'float' }] });

  const slipProfile = Fn(([x, amp, bm]) => {
    const dx = x.sub(XC).toVar();
    const u = dx.div(amp.mul(G.windK)).add(1.0).toVar();
    const uc = clamp(u, 0.0, 1.0).toVar();
    const W = amp.mul(uc.mul(uc).mul(float(3.0).sub(uc.mul(2.0)))).add(bm).toVar();
    const S = amp.sub(dx.mul(LEE_T)).toVar();
    const kA = amp.mul(G.apronF).toVar();
    const hA = clamp(S.sub(bm).div(kA).mul(0.5).add(0.5), 0.0, 1.0).toVar();
    const L = bm.add(S.sub(bm).mul(hA)).add(kA.mul(hA).mul(float(1.0).sub(hA))).toVar();
    const kB = amp.sub(G.A1 * G.ampBase).mul(KB_SLOPE).add(G.roundHi).toVar();
    const hB = clamp(L.sub(W).div(kB).mul(0.5).add(0.5), 0.0, 1.0).toVar();
    return L.add(W.sub(L).mul(hB)).sub(kB.mul(hB).mul(float(1.0).sub(hB)));
  }).setLayout({ name: 'slipProfile', type: 'float', inputs: [{ name: 'x', type: 'float' }, { name: 'amp', type: 'float' }, { name: 'bm', type: 'float' }] });

  const heightLow = Fn(([p]) => {
    const x = p.x, z = p.y;
    const a = x.mul(WX).add(z.mul(WZ)).toVar();
    const c = x.negate().mul(WZ).add(z.mul(WX)).toVar();
    const wa = vnoise(vec2(c.mul(G.warp1F), a.mul(G.warp1F * G.warpAlong))).mul(G.warp1A)
      .add(vnoise(vec2(c.mul(G.warp2F).add(31.7), a.mul(G.warp2F * G.warpAlong).sub(11.3))).mul(G.warp2A)).toVar();
    const wc = vnoise(p.mul(G.warp1F).add(vec2(57.1, 9.2))).mul(G.warp1A);
    const w3 = vnoise(vec2(c.mul(G.warp3F).sub(19.4), a.mul(G.warp3F * G.warpAlong).add(23.9))).mul(G.warp3A);
    const a2 = a.add(wa).add(w3).toVar(), c2 = c.add(wc).toVar();
    const swell = vnoise(p.mul(G.swellF).add(vec2(3.3, 7.7))).mul(G.swellA).toVar();
    const s2 = x.mul(W2X).add(z.mul(W2Z)).add(wa.mul(0.5)).div(G.L2).toVar();
    const k2 = floor(s2).toVar();
    const t2 = s2.sub(k2);
    const amp2 = vnoise(vec2(x.negate().mul(W2Z).add(z.mul(W2X)).mul(G.amp2F), k2.mul(0.613).add(2.5))).mul(0.5).add(0.5).mul(G.A2);
    const bm = amp2.mul(duneProfile(t2, float(G.round2))).add(vnoise(p.mul(G.det1F).add(vec2(1.3, -4.1))).mul(G.det1A)).toVar();
    const k = floor(a2.div(G.L1)).toVar();
    const amp = vnoise(vec2(c2.mul(G.ampF), k.mul(0.731).add(0.5))).mul(0.5).add(0.5).mul(1.0 - G.ampBase).add(G.ampBase).mul(G.A1);
    return swell.add(slipProfile(a2.sub(k.mul(G.L1)), amp, bm));
  }).setLayout({ name: 'heightLow', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });

  const heightLowD = Fn(([p]) => {
    const x = p.x, z = p.y;
    const a = x.mul(WX).add(z.mul(WZ)).toVar();
    const c = x.negate().mul(WZ).add(z.mul(WX)).toVar();
    // warps sampled at (c F, a F warpAlong); their gradients in (c, a) are rotated back to (x, z)
    const nA = vnoiseD(vec2(c.mul(G.warp1F), a.mul(G.warp1F * G.warpAlong))).toVar();
    const nB = vnoiseD(vec2(c.mul(G.warp2F).add(31.7), a.mul(G.warp2F * G.warpAlong).sub(11.3))).toVar();
    const n3 = vnoiseD(vec2(c.mul(G.warp3F).sub(19.4), a.mul(G.warp3F * G.warpAlong).add(23.9))).toVar();
    const wa = nA.x.mul(G.warp1A).add(nB.x.mul(G.warp2A)).toVar();
    const wac = nA.y.mul(G.warp1A * G.warp1F).add(nB.y.mul(G.warp2A * G.warp2F)).toVar();
    const waa = nA.z.mul(G.warp1A * G.warp1F).add(nB.z.mul(G.warp2A * G.warp2F)).mul(G.warpAlong).toVar();
    const gwa = vec2(wac.mul(-WZ).add(waa.mul(WX)), wac.mul(WX).add(waa.mul(WZ))).toVar();
    const w3c = n3.y.mul(G.warp3A * G.warp3F), w3a = n3.z.mul(G.warp3A * G.warp3F * G.warpAlong);
    const nC = vnoiseD(p.mul(G.warp1F).add(vec2(57.1, 9.2))).toVar();
    const a2 = a.add(wa).add(n3.x.mul(G.warp3A)).toVar();
    const c2 = c.add(nC.x.mul(G.warp1A)).toVar();
    const ga2 = vec2(WX, WZ).add(gwa).add(vec2(w3c.mul(-WZ).add(w3a.mul(WX)), w3c.mul(WX).add(w3a.mul(WZ)))).toVar();
    const gc2 = vec2(-WZ, WX).add(nC.yz.mul(G.warp1A * G.warp1F)).toVar();
    const nS = vnoiseD(p.mul(G.swellF).add(vec2(3.3, 7.7))).toVar();
    const s2 = x.mul(W2X).add(z.mul(W2Z)).add(wa.mul(0.5)).div(G.L2).toVar();
    const k2 = floor(s2).toVar();
    const t2 = s2.sub(k2);
    const nA2 = vnoiseD(vec2(x.negate().mul(W2Z).add(z.mul(W2X)).mul(G.amp2F), k2.mul(0.613).add(2.5))).toVar();
    const amp2 = nA2.x.mul(0.5).add(0.5).mul(G.A2).toVar();
    const pr2 = duneProfileD(t2, float(G.round2)).toVar();
    const d1 = vnoiseD(p.mul(G.det1F).add(vec2(1.3, -4.1))).toVar();
    const bm = amp2.mul(pr2.x).add(d1.x.mul(G.det1A)).toVar();
    const gbm = vec2(-W2Z, W2X).mul(nA2.y.mul(G.A2 * 0.5 * G.amp2F).mul(pr2.x))
      .add(vec2(W2X, W2Z).add(gwa.mul(0.5)).mul(pr2.y.mul(amp2).div(G.L2)))
      .add(d1.yz.mul(G.det1A * G.det1F)).toVar();
    const k = floor(a2.div(G.L1)).toVar();
    const nAmp = vnoiseD(vec2(c2.mul(G.ampF), k.mul(0.731).add(0.5))).toVar();
    const amp = nAmp.x.mul(0.5).add(0.5).mul(1.0 - G.ampBase).add(G.ampBase).mul(G.A1).toVar();
    const gamp = gc2.mul(nAmp.y.mul(G.A1 * (1 - G.ampBase) * 0.5 * G.ampF)).toVar();
    const pr = slipProfileD(a2.sub(k.mul(G.L1)), amp, bm).toVar();
    return vec3(nS.x.mul(G.swellA).add(pr.x),
      nS.yz.mul(G.swellA * G.swellF).add(ga2.mul(pr.y)).add(gamp.mul(pr.z)).add(gbm.mul(pr.w)));
  }).setLayout({ name: 'heightLowD', type: 'vec3', inputs: [{ name: 'p', type: 'vec2' }] });

  const height = Fn(([p]) => {
    return heightLow(p).add(vnoise(p.mul(G.det2F).add(vec2(-7.9, 2.2))).mul(G.det2A));
  }).setLayout({ name: 'height', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });

  const heightD = Fn(([p]) => {
    const lo = heightLowD(p).toVar();
    const d2 = vnoiseD(p.mul(G.det2F).add(vec2(-7.9, 2.2))).toVar();
    return vec3(lo.x.add(d2.x.mul(G.det2A)), lo.yz.add(d2.yz.mul(G.det2A * G.det2F)));
  }).setLayout({ name: 'heightD', type: 'vec3', inputs: [{ name: 'p', type: 'vec2' }] });

  // ---------------------------------------------------------------- light, sky, air, output
  const shadowMarch = Fn(([p, L, k]) => {
    const res = float(1.0).toVar();
    const t = float(SH.start).toVar();
    Loop(SH.steps, () => {
      const q = p.add(L.mul(t)).toVar();
      const d = q.y.sub(height(q.xz)).toVar();
      res.assign(min(res, d.mul(k).div(t)));
      // step by the height gap: fine while the ray skims the sand (so a sharp crest is not
      // stepped over), long once it has cleared it
      t.addAssign(clamp(max(d, 0.0).mul(SH.dStep).add(t.mul(SH.grow)), SH.minStep, t.mul(0.35).add(1.0)));
      If(res.lessThan(0.002).or(t.greaterThan(SH.maxDist)).or(q.y.greaterThan(SH.ceiling)), () => { Break(); });
    });
    const r = clamp(res, 0.0, 1.0).toVar();
    return r.mul(r).mul(float(3.0).sub(r.mul(2.0)));
  }).setLayout({ name: 'shadowMarch', type: 'float', inputs: [{ name: 'p', type: 'vec3' }, { name: 'L', type: 'vec3' }, { name: 'k', type: 'float' }] });

  // The same march, returning the horizon value Hmax = max over the samples of (h(q) - p.y) / t
  // instead of the shadow. The march's soft shadow is exactly k * (L.y - Hmax), so the map stores
  // Hmax: a smooth field that filters cleanly, where a stored 0..1 shadow would filter into a
  // staircase along every crest.
  const horizonMarch = Fn(([p, L, k]) => {
    const hm = float(-8.0).toVar();
    const t = float(SH.start).toVar();
    Loop(SH.steps, () => {
      const q = p.add(L.mul(t)).toVar();
      const d = q.y.sub(height(q.xz)).toVar();
      hm.assign(max(hm, L.y.sub(d.div(t))));
      t.addAssign(clamp(max(d, 0.0).mul(SH.dStep).add(t.mul(SH.grow)), SH.minStep, t.mul(0.35).add(1.0)));
      If(L.y.sub(hm).mul(k).lessThan(0.002).or(t.greaterThan(SH.maxDist)).or(q.y.greaterThan(SH.ceiling)), () => { Break(); });
    });
    return hm;
  }).setLayout({ name: 'horizonMarch', type: 'float', inputs: [{ name: 'p', type: 'vec3' }, { name: 'L', type: 'vec3' }, { name: 'k', type: 'float' }] });

  // halo: two exponentials in angle from the sun (no shoulder, so no glow ends in an edge)
  const sunSky = Fn(([rd, L, tint, discCol, sky, glow, withDisc, gy]) => {
    const c = dot(rd, L).toVar();
    const ang = acos(clamp(c, -1.0, 1.0)).toVar();
    const halo = glow.x.mul(exp(ang.negate().div(glow.z))).add(glow.y.mul(exp(ang.negate().div(glow.w))));
    const boost = float(1.0).sub(gy.mul(0.6));
    const disc = smoothstep(cos(sky.w.mul(1.25)), cos(sky.w.mul(0.8)), c).mul(withDisc).mul(smoothstep(-0.004, 0.004, rd.y));
    return tint.mul(halo.mul(boost)).add(discCol.mul(disc.mul(sky.z)));
  }).setLayout({ name: 'sunSky', type: 'vec3', inputs: [
    { name: 'rd', type: 'vec3' }, { name: 'L', type: 'vec3' }, { name: 'tint', type: 'vec3' }, { name: 'discCol', type: 'vec3' },
    { name: 'sky', type: 'vec4' }, { name: 'glow', type: 'vec4' }, { name: 'withDisc', type: 'float' }, { name: 'gy', type: 'float' }] });

  const starField = Fn(([rd]) => {
    const sp = rd.xz.div(rd.y.add(1.0)).mul(SKY.starScale).toVar();
    const cell = floor(sp).toVar();
    const ix = int(cell.x).toVar(), iy = int(cell.y).toVar();
    const hs = hash2(ix, iy);
    const jit = vec2(hash2(ix.add(int(101)), iy), hash2(ix, iy.add(int(211)))).sub(0.5);
    const fp = sp.sub(cell).sub(0.5).sub(jit.mul(0.5));
    const b = max(hs.sub(SKY.starThresh), 0.0).div(1.0 - SKY.starThresh);
    return b.mul(float(1.0).sub(smoothstep(0.0, SKY.starSize, length(fp)))).mul(smoothstep(0.02, 0.2, rd.y)).mul(2.5);
  }).setLayout({ name: 'starField', type: 'float', inputs: [{ name: 'rd', type: 'vec3' }] });

  // The functions below read uniforms, so they are inlined JavaScript helpers (no setLayout):
  // in r186 a uniform referenced inside a setLayout function is declared under the wrong name.

  // Where a view direction meets the haboob's front line: vec4(distance, s along the front, Y up the
  // wall, cover). cover is 0 off the wall's ends, thinning over STORM.farFade at the far end.
  const wallHit = (rd) => {
    const hd = normalize(rd.xz.add(vec2(1e-6, 0.0))).toVar();
    const den = dot(hd, U.uWallN).toVar();
    const d = U.uWallGeo.x.div(max(den, 1e-4)).toVar();
    const s = dot(hd, U.uWallT).mul(d).toVar();
    const Y = rd.y.div(max(length(rd.xz), 1e-3)).mul(d);
    const cover = step(1e-4, den).mul(smoothstep(U.uWallGeo.y, U.uWallGeo.y.add(STORM.farFade), s))
      .mul(clamp(U.uWallGeo.w.sub(s).div(300.0).add(0.5), 0.0, 1.0));
    return vec4(d, s, Y, cover);
  };

  // One octave of domes in cell units: each cell holds a hemisphere of radius 0.75..1.0 at a
  // jittered centre; a smooth maximum joins them, so neighbouring lobes meet in a narrow crease.
  // Returns vec3(height 0..1, d/dp.x, d/dp.y).
  const domes = Fn(([p]) => {
    const ip = floor(p).toVar();
    const best = float(0.0).toVar();
    const g = vec2(0.0).toVar();
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = int(ip.x).add(int(i)).toVar(), cy = int(ip.y).add(int(j)).toVar();
        const ctr = ip.add(vec2(i + 0.5, j + 0.5)).add(vec2(hash2(cx, cy), hash2(cx.add(int(57)), cy)).sub(0.5).mul(0.6));
        const r = hash2(cx, cy.add(int(113))).mul(0.25).add(0.75);
        const dv = p.sub(ctr).toVar();
        const h = sqrt(max(r.mul(r).sub(dot(dv, dv)), 0.0)).toVar();
        // smooth maximum: lobes meet in a narrow rounded crease
        const m = clamp(h.sub(best).div(STORM.crease).mul(0.5).add(0.5), 0.0, 1.0).toVar();
        g.assign(mix(g, dv.negate().div(max(h, 0.2)), m));
        best.assign(mix(best, h, m).add(m.mul(float(1.0).sub(m)).mul(STORM.crease)));
      }
    }
    return vec3(best, g);
  }).setLayout({ name: 'domes', type: 'vec3', inputs: [{ name: 'p', type: 'vec2' }] });

  // cauliflower billows: octaves of domes, each rotated against the last. Returns vec3(B normalised
  // to about 0..1, then the weighted dome slopes along s and Y: each dome's own slope, so a small
  // lobe is as round as a big one and only its weight makes it shallower; w: the two largest octaves
  // alone, which shape the top edge, so fine lobes never float off it as specks).
  const BROT = [0.5, 1.33, 2.21, 3.12], BOFF = [[0, 0], [5.2, 1.3], [1.7, 8.9], [8.3, 2.8]];
  const BSUM = STORM.bAmp.reduce((x, y) => x + y, 0);
  const billows = (S, Y) => {
    const acc = vec4(0.0).toVar();
    for (let i = 0; i < STORM.bScale.length; i++) {
      const c = Math.cos(BROT[i]), sn = Math.sin(BROT[i]), k = 1 / STORM.bScale[i], A = STORM.bAmp[i] / BSUM;
      const n = domes(vec2(S.mul(c * k).sub(Y.mul(sn * k)).add(BOFF[i][0]), S.mul(sn * k).add(Y.mul(c * k)).add(BOFF[i][1]))).toVar();
      acc.addAssign(vec4(n.x.mul(A), n.y.mul(c).add(n.z.mul(sn)).mul(A), n.z.mul(c).sub(n.y.mul(sn)).mul(A), i < 2 ? n.x.mul(A) : float(0.0)));
    }
    return acc;
  };

  // The haboob: a wall standing on its front line, in metres on the wall. Returns colour and cover.
  const haboob = (rd) => {
    const w = wallHit(rd).toVar();
    const d = w.x, S = w.y, Y = w.z.toVar();
    const H = vnoise(vec2(S.mul(STORM.topF[0]), 3.1)).mul(STORM.topA[0])
      .add(vnoise(vec2(S.mul(STORM.topF[1]), 7.3)).mul(STORM.topA[1])).add(1.0).mul(U.uWallGeo.z)
      .mul(smoothstep(U.uWallGeo.y, U.uWallGeo.y.add(STORM.farFade), S).mul(0.45).add(0.55)).toVar(); // lower toward the far end
    // one pixel in metres on the wall, taken before any branch (derivatives need uniform control flow)
    const px = length(fwidth(rd)).mul(d).div(max(length(rd.xz), 1e-3)).toVar();
    // billows only where the wall can show; below its foot the skirt covers everything
    const B = vec4(0.5, 0.0, 0.0, 0.4).toVar();
    If(Y.greaterThan(-STORM.skirtH * 0.5).and(w.w.greaterThan(0.0)), () => { B.assign(billows(S, Y.mul(STORM.bFlat))); });
    B.z.assign(B.z.mul(STORM.bFlat));
    // signed metres inside the wall's top edge; the billows push the edge in and out at every scale
    const e = H.sub(Y).add(B.w.sub(0.4).mul(STORM.bulge)).toVar();
    // crisp: the edge is antialiased over one pixel, whatever the distance
    const a = clamp(e.div(max(px, 1e-3)).add(0.5), 0.0, 1.0).mul(w.w).toVar();
    // the rolling nose: a roll of billows along the base, lit on top, with a dark crease above it
    const Yr = vnoise(vec2(S.div(170.0), 5.5)).mul(0.3).add(1.0).mul(STORM.shelfY).toVar();
    const below = step(Y, Yr);
    const shelfTilt = below.mul(exp(max(Yr.sub(Y), 0.0).negate().div(30.0))).mul(1.3);
    const crease = float(1.0).sub(float(1.0).sub(below).mul(exp(max(Y.sub(Yr), 0.0).negate().div(28.0))).mul(0.25));
    // normal in the wall's frame (x along the front toward its near end, y up, z toward the camera);
    // the top rounds over toward the sky so the upper lobes catch light
    const tilt = exp(max(e, 0.0).negate().div(STORM.tiltR)).mul(STORM.tilt).add(shelfTilt);
    const N = normalize(vec3(B.y.mul(-STORM.depth), B.z.mul(-STORM.depth).add(tilt), 1.0)).toVar();
    const occ = smoothstep(0.12, 0.72, B.x).mul(1.0 - STORM.occLo).add(STORM.occLo).mul(crease).toVar();
    const dens = smoothstep(0.0, H.mul(0.7), Y).mul(0.65).add(0.35).toVar(); // darker, denser low
    const rimBand = exp(max(e, 0.0).negate().div(STORM.rimW)).toVar();
    const lit = (L, C) => {
      const Lw = vec3(dot(L.xz, U.uWallT), L.y, dot(L.xz, U.uWallN).negate()).toVar();
      const diff = max(dot(N, Lw).add(STORM.wrap).div(1.0 + STORM.wrap), 0.0);
      const rim = rimBand.mul(max(Lw.z.negate(), 0.0)).mul(pow(max(dot(rd, L), 0.0), 4.0)).mul(3.0);
      return C.mul(diff.mul(occ).mul(dens.mul(0.5).add(0.5)).add(rim));
    };
    const col = U.uWallBase.mul(dens).mul(B.x.mul(0.5).add(0.75)).mul(crease)
      .add(lit(U.uSun1Dir, U.uWallSun1)).add(lit(U.uSun2Dir, U.uWallSun2)).toVar();
    // haze between camera and wall, and the skirt: the base dissolves into the dust over the ground
    col.assign(mix(col, U.uHorizon, float(1.0).sub(exp(d.mul(-STORM.aerial)))));
    col.assign(mix(col, U.uHorizon.mul(0.85), float(1.0).sub(smoothstep(-10.0, STORM.skirtH, Y))));
    return vec4(col, a);
  };

  const skyColor = (rd, withDisc) => {
    const y = max(rd.y, 0.0);
    const gy = float(1.0).sub(exp(y.mul(-SKY.k))).toVar(); // 0 at the horizon, 1 overhead
    const col = mix(U.uHorizon, U.uZenith, gy).toVar();
    col.addAssign(sunSky(rd, U.uSun1Dir, U.uSun1Tint, U.uSun1Disc, U.uSun1Sky, U.uSun1Glow, withDisc, gy));
    col.addAssign(sunSky(rd, U.uSun2Dir, U.uSun2Tint, U.uSun2Disc, U.uSun2Sky, U.uSun2Glow, withDisc, gy));
    col.addAssign(vec3(starField(rd).mul(U.uStars).mul(withDisc)));
    if (WK) {
      If(U.uFade.greaterThan(0.0), () => {
        col.addAssign(sunSky(rd, U.uSun3Dir, U.uSun3Tint, U.uSun3Disc, U.uSun3Sky, U.uSun3Glow, withDisc, gy));
        col.addAssign(sunSky(rd, U.uSun4Dir, U.uSun4Tint, U.uSun4Disc, U.uSun4Sky, U.uSun4Glow, withDisc, gy));
      });
    }
    If(U.uStorm.greaterThan(0.5), () => {
      const wall = haboob(rd).toVar();
      col.assign(mix(col, wall.xyz, wall.w));
    });
    return col;
  };

  // distance + height fog; in the storm the distance part thickens toward the wall and the ground
  // beyond the wall's foot is inside it
  const fogAmount = (ro, rd, dist) => {
    const w = wallHit(rd).toVar();
    const wallSide = w.w.mul(U.uStorm).toVar();
    const dens = mix(U.uFog.x, U.uStormFog.y, wallSide).mul(dist).toVar();
    const k = U.uFog.z;
    const ry = max(rd.y.mul(k).mul(dist), -20.0).toVar();
    const fr = select(abs(ry).lessThan(1e-4), float(1.0).sub(ry.mul(0.5)), float(1.0).sub(exp(ry.negate())).div(ry));
    dens.addAssign(U.uFog.y.mul(exp(ro.y.sub(U.uFog.w).mul(k).negate())).mul(dist).mul(fr));
    // ground toward the wall's foot disappears into its skirt; beyond the foot it is inside the wall
    return max(float(1.0).sub(exp(dens.negate())), wallSide.mul(smoothstep(w.x.mul(0.25), w.x.mul(0.97), dist)));
  };

  // blowing sand: densest in the lowest half metre, following the ground; downwind of a crest the
  // sand keeps the crest's height for a few metres, so it pours off the brink
  // log-polar shadow map coordinates of a ground point. v is flipped on read: in r186 a target
  // written by a full-screen quad at uv() and sampled at the same uv comes back upside down in
  // WebGPURenderer, on both its WebGPU and its WebGL2 backend (measured: without the flip the near
  // ground read far texels). The classic GLSL path needs no flip.
  const shadowUV = (xz) => {
    const d = xz.sub(uShC).toVar();
    const r = max(length(d), SHMAP.r0);
    return vec2(atan(d.y, d.x).div(TAU), float(1.0).sub(log(r.div(SHMAP.r0)).div(LNR)));
  };
  // the march's soft shadow from a horizon value: res = k * (L.y - Hmax), then the same smoothstep
  const softFromHorizon = (H, L, k) => {
    const r = clamp(L.y.sub(H).mul(k), 0.0, 1.0).toVar();
    return r.mul(r).mul(float(3.0).sub(r.mul(2.0)));
  };
  // walk slice: the same two, for a map with its own centre and its own suns (Ly and k per sun)
  const shadowUVAt = (xz, centre) => {
    const d = xz.sub(centre).toVar();
    const r = max(length(d), SHMAP.r0);
    return vec2(atan(d.y, d.x).div(TAU), float(1.0).sub(log(r.div(SHMAP.r0)).div(LNR)));
  };
  const softFromHorizonY = (H, Ly, k) => {
    const r = clamp(Ly.sub(H).mul(k), 0.0, 1.0).toVar();
    return r.mul(r).mul(float(3.0).sub(r.mul(2.0)));
  };

  // the low haze of blowing sand: an exponential layer above a base height, integrated in closed
  // form along the last len metres of the ray (looking down, the layer is densest at the far end)
  const sandHaze = (rd, len, aboveBase) => {
    const ky = max(rd.y.negate(), 1e-3).div(STORM.hazeH).toVar();
    const L = min(len, STORM.hazeMax);
    return float(1.0).sub(exp(exp(aboveBase.negate().div(STORM.hazeH)).mul(float(1.0).sub(exp(ky.negate().mul(L)))).div(ky).mul(-STORM.hazeRho)));
  };

  // streamers on the ground: iso-lines of a meandering noise stretched along the storm wind.
  // One family: the distance to a level line is measured in metres (|n - level| / |grad n|), so a
  // strand keeps its width where the noise flattens out; it fades to its mean once a pixel is wider.
  const ribFamily = (ra, cm, F, px, seed) => {
    const nd = vnoiseD(vec2(ra.div(F.along), cm.div(F.across)).add(vec2(seed, seed * 1.7))).toVar();
    const gm = max(length(vec2(nd.y.div(F.along), nd.z.div(F.across))), 1e-3).toVar();
    const line = (lvl) => {
      const dm = abs(nd.x.sub(lvl)).div(gm);
      const core = float(1.0).sub(smoothstep(px.mul(-0.5).add(F.w), px.mul(0.5).add(F.w), dm));
      const halo = float(1.0).sub(smoothstep(0.0, px.add(F.w * STORM.ribHalo), dm)).mul(0.3);
      return max(core, halo);
    };
    let lines = line(F.levels[0]);
    for (let i = 1; i < F.levels.length; i++) lines = max(lines, line(F.levels[i]));
    // only where a line runs along the wind: where a level line turns back it would draw a hook
    const align = smoothstep(0.86, 0.97, abs(nd.z.div(F.across)).div(gm));
    // strands break up along their length
    const brk = smoothstep(-0.45, 0.35, vnoise(vec2(ra.div(F.brk), cm.div(F.across).mul(0.9)).add(vec2(3.0 + seed, 1.0))));
    return mix(lines.mul(brk).mul(align), float(STORM.ribMean), smoothstep(F.w * 0.8, F.w * 3.0, px)).mul(F.a);
  };
  const ribbons = (xz, grad, dist, fw) => {
    const sw = U.uStormWind;
    const ra = dot(xz, sw).toVar(), rc = dot(xz, vec2(sw.y.negate(), sw.x)).toVar();
    const cm = rc.add(vnoise(vec2(ra.mul(STORM.ribMeanderF), rc.mul(0.05).add(4.0))).mul(STORM.ribMeanderA))
      .add(vnoise(vec2(ra.mul(STORM.ribMeanderF * 3.7), rc.mul(0.21).add(9.0))).mul(STORM.ribMeanderA * 0.3)).toVar();
    const px = fw.mul(0.7).toVar();
    // the broad sheets give way to the fine strands near the feet, where they would read as stripes
    const r = max(ribFamily(ra, cm, STORM.ribFine, px, 0.0), ribFamily(ra, cm.add(rc.mul(0.15)), STORM.ribBroad, px, 13.0).mul(smoothstep(3.0, 12.0, dist)));
    const gust = smoothstep(-0.5, 0.45, vnoise(vec2(ra, rc).mul(STORM.ribGustF).add(vec2(7.0, 3.0)))).mul(0.65).add(0.35);
    // the wind keeps sand moving over gentle ground either way; only a steep lee (a slip face turned
    // away from the wind) is sheltered
    const expo = float(1.0).sub(smoothstep(0.25, 0.5, dot(grad, sw).negate()).mul(0.85));
    return r.mul(gust).mul(expo).mul(float(1.0).sub(smoothstep(STORM.ribFar * 0.45, STORM.ribFar, dist))).mul(STORM.ribGain);
  };

  // the colour of the sand in the air: each sun that reaches the ground, scattered forward
  const sandColor = (rd) => {
    const f1 = pow(max(dot(rd, U.uSun1Dir), 0.0), 5.0).mul(2.2).add(0.45);
    const f2 = pow(max(dot(rd, U.uSun2Dir), 0.0), 5.0).mul(2.2).add(0.45);
    return U.uSandLit.mul(U.uSun1Col.mul(f1).add(U.uSun2Col.mul(f2))).add(U.uSandAmb).mul(1.25);
  };

  const sunOnSand = Fn(([n, V, alb, L, C, sh, nm, gAmt, wrap]) => {
    const ndl = dot(n, L).toVar();
    const wrapd = max(ndl.add(wrap).div(wrap.add(1.0)), 0.0);
    const ndv = max(dot(n, V), 0.0);
    const vl = dot(V, L).toVar();
    const retro = pow(max(vl, 0.0), 3.0);
    const fwdS = pow(max(vl.negate(), 0.0), 4.0);
    const graze = pow(float(1.0).sub(ndv), SAND.sheenPow);
    const diff = alb.mul(wrapd).mul(retro.mul(SAND.retro).add(1.0));
    const sheen = mix(alb, vec3(1.0), 0.35).mul(graze).mul(max(ndl.add(0.25), 0.0)).mul(fwdS.mul(SAND.fwd).add(SAND.sheen));
    const H = normalize(L.add(V));
    const g = pow(max(dot(nm, H), 0.0), G.glintPow).mul(gAmt).mul(G.glintGain);
    return C.mul(sh).mul(diff.add(sheen).add(vec3(g)));
  }).setLayout({ name: 'sunOnSand', type: 'vec3', inputs: [
    { name: 'n', type: 'vec3' }, { name: 'V', type: 'vec3' }, { name: 'alb', type: 'vec3' },
    { name: 'L', type: 'vec3' }, { name: 'C', type: 'vec3' }, { name: 'sh', type: 'float' },
    { name: 'nm', type: 'vec3' }, { name: 'gAmt', type: 'float' }, { name: 'wrap', type: 'float' }] });

  const aces = Fn(([x]) => {
    return clamp(x.mul(x.mul(2.51).add(0.03)).div(x.mul(x.mul(2.43).add(0.59)).add(0.14)), 0.0, 1.0);
  }).setLayout({ name: 'aces', type: 'vec3', inputs: [{ name: 'x', type: 'vec3' }] });

  const srgbEncode = Fn(([c]) => {
    return mix(c.mul(12.92), pow(c, vec3(1.0 / 2.4)).mul(1.055).sub(0.055), step(vec3(0.0031308), c));
  }).setLayout({ name: 'srgbEncode', type: 'vec3', inputs: [{ name: 'c', type: 'vec3' }] });

  const finish = (col) => {
    const o = srgbEncode(aces(col.mul(U.uExposure)));
    const dth = hash2(int(screenCoordinate.x), int(screenCoordinate.y)).sub(0.5);
    return o.add(vec3(dth.div(255.0)));
  };

  // ---------------------------------------------------------------- ground material
  const ground = new THREE.MeshBasicNodeMaterial();
  let vWorld;
  if (WK && WK.groundPosition) {
    // walk slice: the caller's mesh (a clipmap) places its own vertices; it returns the vertex
    // position and the world point the fragment shader shades
    const gp = WK.groundPosition({ height });
    ground.positionNode = gp.position;
    vWorld = varying(gp.world, 'vWorld');
  } else {
    const gxz = positionLocal.xz.add(uGridOrigin);
    const gy = height(gxz);
    ground.positionNode = vec3(positionLocal.x, gy, positionLocal.z);
    vWorld = varying(vec3(gxz.x, gy, gxz.y), 'vWorld');
  }

  ground.fragmentNode = Fn(() => {
    const ro = cameraPosition;
    const P = vWorld.toVar();
    const toP = P.sub(ro).toVar();
    const dist = length(toP).toVar();
    const rd = toP.div(dist).toVar();
    const xz = P.xz.toVar();
    const fw = length(fwidth(xz)).toVar();

    const h0 = float(0.0).toVar();
    const grad = vec2(0.0).toVar();
    if (opts.normal === 'fd') {
      const e = max(fw.mul(0.75), 0.04).toVar();
      h0.assign(height(xz));
      const hx = height(xz.add(vec2(e, 0.0)));
      const hz = height(xz.add(vec2(0.0, e)));
      grad.assign(vec2(hx.sub(h0), hz.sub(h0)).div(e));
    } else {
      // analytic gradient; the 11 m undulation's slope fades once a pixel spans metres (it would alias)
      const lo = heightLowD(xz).toVar();
      const d2 = vnoiseD(xz.mul(G.det2F).add(vec2(-7.9, 2.2))).toVar();
      h0.assign(lo.x.add(d2.x.mul(G.det2A)));
      const fade2 = float(1.0).sub(smoothstep(1.5, 5.0, fw));
      grad.assign(lo.yz.add(d2.yz.mul(fade2.mul(G.det2A * G.det2F))));
    }
    const sp = vec3(xz.x, h0, xz.y).toVar();

    const W = vec2(WX, WZ);
    // walk slice: the trace map (prints, slide troughs). It returns a slope to add to the ground's,
    // how disturbed the sand is (ripples are trodden out), and a self-shadow toward a light.
    const tr = WK && WK.trace ? WK.trace({ xz, fw, dist, U, grad }) : null;
    // walk slice, figure look test (surface/walk/figure.js, ?figure= only): a figure's cast shadow
    // per sun, contact darkening at its feet and hem, and its lantern's pool of light
    // (third person: from the sand's displaced surface, so a shadow's edge is broken by the groove and
    // the pour's relief)
    const fg = WK && WK.figure ? WK.figure({ xz, sp: tr && tr.disp ? sp.add(vec3(0.0, tr.disp, 0.0)) : sp, U }) : null;
    if (opts.ripples) {
      const lee = dot(grad, W).negate();
      let ripOnE = float(1.0).sub(smoothstep(G.ripLeeLo, G.ripLeeHi, lee)).mul(float(1.0).sub(smoothstep(G.ripL * 0.15, G.ripL * 0.5, fw)));
      if (tr) ripOnE = ripOnE.mul(float(1.0).sub(tr.disturb.mul(0.9)));
      const ripOn = ripOnE.toVar();
      If(ripOn.greaterThan(0.0), () => {
        const ra = dot(xz, W).add(vnoise(xz.mul(G.ripWarpF)).mul(G.ripWarpA)).add(vnoise(xz.mul(G.ripWarpF * 3.1).add(vec2(4.0, 4.0))).mul(G.ripWarpA * 0.4));
        const ph = ra.mul(TAU / G.ripL).toVar();
        const dr = cos(ph).add(cos(ph.mul(2.0).add(0.9)).mul(0.45));
        const ripAmp = smoothstep(-0.6, 0.7, vnoise(xz.mul(G.ripAmpF).add(vec2(-6.0, 2.0)))).mul(0.65).add(0.35);
        grad.addAssign(W.mul(dr.mul(G.ripSlope).mul(ripOn).mul(ripAmp)));
      });
    }
    if (tr) grad.addAssign(tr.grad);
    const n = normalize(vec3(grad.x.negate(), 1.0, grad.y.negate())).toVar();
    const V = rd.negate().toVar();

    const gc = floor(xz.div(G.glintCell)).toVar();
    const gx = int(gc.x).toVar(), gz = int(gc.y).toVar();
    const gh = hash2(gx, gz);
    const nm = normalize(n.add(vec3(hash2(gx.add(int(17)), gz).sub(0.5), 0.0, hash2(gx, gz.add(int(29))).sub(0.5)).mul(1.2))).toVar();
    const ndv = max(dot(n, V), 0.0).toVar();
    const grain = float(1.0).sub(smoothstep(0.12, 0.3, length(xz.div(G.glintCell).sub(gc).sub(0.5)))); // a round grain, not the whole cell
    const gAmt = step(1.0 - G.glintDensity, gh).mul(grain).mul(float(1.0).sub(smoothstep(G.glintCell * 0.3, G.glintCell * 1.0, fw))).mul(float(1.0).sub(ndv)).mul(float(1.0).sub(ndv)).toVar();

    const alb = U.uSand.mul(vnoise(xz.mul(0.021).add(vec2(3.0, 3.0))).mul(0.08).add(0.92)).toVar();
    if (tr) alb.mulAssign(float(1.0).sub(tr.disturb.mul(0.08)));
    if (tr && tr.tone) alb.mulAssign(tr.tone);   // walk, third person: a trail that reads from afar

    // cast shadows: the baked map (default), the per-pixel march (reference), or none
    const sh1 = float(1.0).toVar(), sh2 = float(1.0).toVar();
    const sh3 = float(1.0).toVar(), sh4 = float(1.0).toVar();
    if (WK && opts.shadows === 'map') {
      // walk slice: two maps, each with its own centre and its own suns, cross-faded by uShMix
      // (A at 0, B at 1). Suns 3 and 4 (a time-of-day fade) read the map the current suns do not.
      const hA = textureLevel(shadowTex, shadowUVAt(xz, uShC), float(0.0)).toVar();
      const hB = textureLevel(WK.shadowTexB, shadowUVAt(xz, U.uShCB), float(0.0)).toVar();
      const a1 = softFromHorizonY(hA.x, U.uShPA.x, U.uShPA.z).toVar(), a2 = softFromHorizonY(hA.y, U.uShPA.y, U.uShPA.w).toVar();
      const b1 = softFromHorizonY(hB.x, U.uShPB.x, U.uShPB.z).toVar(), b2 = softFromHorizonY(hB.y, U.uShPB.y, U.uShPB.w).toVar();
      sh1.assign(mix(a1, b1, U.uShMix)); sh2.assign(mix(a2, b2, U.uShMix));
      sh3.assign(mix(b1, a1, U.uShMix)); sh4.assign(mix(b2, a2, U.uShMix));
    } else if (opts.shadows === 'map') {
      const hz = textureLevel(shadowTex, shadowUV(xz), float(0.0)).toVar();
      sh1.assign(softFromHorizon(hz.x, U.uSun1Dir, float(1.0).div(tan(max(U.uSun1Sky.w.mul(SH.penumbra), 0.002)))));
      sh2.assign(softFromHorizon(hz.y, U.uSun2Dir, float(1.0).div(tan(max(U.uSun2Sky.w.mul(SH.penumbra), 0.002)))));
    } else if (opts.shadows === 'march') {
      const lp = sp.add(n.mul(SH.lift)).toVar();
      If(U.uSun1Col.x.add(U.uSun1Col.y).add(U.uSun1Col.z).greaterThan(0.0), () => { sh1.assign(shadowMarch(lp, U.uSun1Dir, float(1.0).div(tan(max(U.uSun1Sky.w.mul(SH.penumbra), 0.002))))); });
      If(U.uSun2Col.x.add(U.uSun2Col.y).add(U.uSun2Col.z).greaterThan(0.0), () => { sh2.assign(shadowMarch(lp, U.uSun2Dir, float(1.0).div(tan(max(U.uSun2Sky.w.mul(SH.penumbra), 0.002))))); });
    }

    const col = vec3(0.0).toVar();
    if (tr) { sh1.mulAssign(tr.shade(U.uSun1Dir)); sh2.mulAssign(tr.shade(U.uSun2Dir)); }
    if (fg) { sh1.mulAssign(fg.shadow(U.uSun1Dir)); sh2.mulAssign(fg.shadow(U.uSun2Dir)); }
    col.addAssign(sunOnSand(n, V, alb, U.uSun1Dir, U.uSun1Col, sh1, nm, gAmt, U.uWrap));
    col.addAssign(sunOnSand(n, V, alb, U.uSun2Dir, U.uSun2Col, sh2, nm, gAmt, U.uWrap));
    if (WK) {
      If(U.uFade.greaterThan(0.0), () => {
        if (tr) { sh3.mulAssign(tr.shade(U.uSun3Dir)); sh4.mulAssign(tr.shade(U.uSun4Dir)); }
        if (fg) { sh3.mulAssign(fg.shadow(U.uSun3Dir)); sh4.mulAssign(fg.shadow(U.uSun4Dir)); }
        col.addAssign(sunOnSand(n, V, alb, U.uSun3Dir, U.uSun3Col, sh3, nm, gAmt, U.uWrap));
        col.addAssign(sunOnSand(n, V, alb, U.uSun4Dir, U.uSun4Col, sh4, nm, gAmt, U.uWrap));
      });
    }
    col.addAssign(alb.mul(mix(U.uAmbGround, U.uAmbSky, n.y.mul(0.5).add(0.5))).mul(mix(SAND.aoLo, 1.0, smoothstep(0.6, 1.0, n.y))));
    if (WK) {
      // walk slice: a fill from the bright horizon under the pale sun, only where that sun does not
      // reach (cast or self shadow). A shaded windward face at dusk is otherwise lit by a flat
      // ambient alone and its ripples and prints vanish; this gives shade a direction.
      const Lf = normalize(vec3(U.uSun1Dir.x, 0.0, U.uSun1Dir.z).add(vec3(0.0, 0.45, 0.0)));
      const lf = max(dot(n, Lf).add(0.35).div(1.35), 0.0);
      const inShade = float(1.0).sub(sh1.mul(smoothstep(-0.2, 0.15, dot(n, U.uSun1Dir))));
      col.addAssign(alb.mul(U.uHorizon).mul(lf.mul(lf)).mul(inShade).mul(U.uFill));
    }
    if (fg) { col.mulAssign(fg.ao); col.addAssign(fg.light(alb, n)); }
    // walk slice: the air low over the ground (drifting sand), drawn on the lit ground before haze
    if (WK && WK.air) col.assign(WK.air({ col, xz, dist, rd, grad, n, alb, U, vnoise, sh: [sh1, sh2, sh3, sh4] }));

    const fog = fogAmount(ro, rd, dist).toVar();
    const edge = smoothstep(GRID.rMax * 0.72, GRID.rMax * 0.97, length(xz.sub(ro.xz)));
    fog.assign(max(fog, edge));
    const fogCol = mix(skyColor(rd, float(0.0)), U.uFogCol, U.uFogColMix.mul(0.6));
    col.assign(mix(col, fogCol, fog));
    If(U.uStorm.greaterThan(0.5), () => {
      col.assign(mix(col, mix(sandColor(rd), vec3(dot(sandColor(rd), vec3(0.3333))), 0.25).mul(1.1), clamp(ribbons(xz, grad, dist, fw), 0.0, 1.0)));
      col.assign(mix(col, sandColor(rd), sandHaze(rd, dist, float(0.0))));
    });
    // walk slice: the storm front (surface/walk/storm.js), over everything; a branch on a uniform, so
    // with no storm the colour is untouched. The pixel's angular size is taken here, outside any branch.
    if (WK && WK.storm) WK.storm({ col, ro, rd, dist, face: { vnoise, vnoiseD, domes, px: length(fwidth(rd)).toVar(), ground: true } });

    return vec4(finish(col), 1.0);
  })();

  // ---------------------------------------------------------------- sky material
  const sky = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false });
  sky.fragmentNode = Fn(() => {
    const ro = cameraPosition;
    const rd = normalize(positionWorld.sub(ro)).toVar();
    const col = skyColor(rd, float(1.0)).toVar();
    If(U.uStorm.greaterThan(0.5), () => {
      // seen from the eye the layer is 1.7 m down; at the horizon the sky meets far ground seen through
      // the bottom of the layer, so the base eases to 0 there and the two join without a line
      col.assign(mix(col, sandColor(rd), sandHaze(rd.mul(-1.0), float(1e5), smoothstep(0.0, 0.04, rd.y).mul(CAM.eye))));
    });
    // walk slice: the storm front (see the ground)
    // (the sky's share is drawn at half resolution by storm.js and fetched here, when the walk asks)
    if (WK && WK.stormSky) WK.stormSky({ col, face: { vnoise, vnoiseD, domes } });
    else if (WK && WK.storm) WK.storm({ col, ro, rd, dist: float(1e9), face: { vnoise, vnoiseD, domes, px: length(fwidth(rd)).toVar() } });
    return vec4(finish(col), 1.0);
  })();

  // ---------------------------------------------------------------- shadow-map bake material
  // One texel = one ground point around uShC (log-polar); R and G are the two suns' horizon
  // values Hmax from the same march as the reference path (see horizonMarch).
  const bake = new THREE.MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
  bake.vertexNode = vec4(positionLocal.xy, 0.0, 1.0);
  if (WK) {
    // walk slice: the bake reads its own centre and suns, so the next map (or the next time of
    // day's map) can be baked while the ground still draws with the current one
    bake.fragmentNode = Fn(() => {
      const st = uv().toVar();
      const ang = st.x.mul(TAU).toVar();
      const r = exp(st.y.mul(LNR)).mul(SHMAP.r0);
      const xz = U.uBakeC.add(vec2(cos(ang), sin(ang)).mul(r)).toVar();
      const hd = heightD(xz).toVar();
      const n = normalize(vec3(hd.y.negate(), 1.0, hd.z.negate()));
      const p = vec3(xz.x, hd.x, xz.y).add(n.mul(SH.lift)).toVar();
      const s1 = float(-8.0).toVar(), s2 = float(-8.0).toVar();
      If(U.uBakeK.z.greaterThan(0.5), () => { s1.assign(horizonMarch(p, U.uBakeSun1, U.uBakeK.x)); });
      If(U.uBakeK.w.greaterThan(0.5), () => { s2.assign(horizonMarch(p, U.uBakeSun2, U.uBakeK.y)); });
      return vec4(s1, s2, 0.0, 1.0);
    })();
  } else bake.fragmentNode = Fn(() => {
    const st = uv().toVar();
    const ang = st.x.mul(TAU).toVar();
    const r = exp(st.y.mul(LNR)).mul(SHMAP.r0);
    const xz = uShC.add(vec2(cos(ang), sin(ang)).mul(r)).toVar();
    const hd = heightD(xz).toVar();
    const n = normalize(vec3(hd.y.negate(), 1.0, hd.z.negate()));
    const p = vec3(xz.x, hd.x, xz.y).add(n.mul(SH.lift)).toVar();
    const s1 = float(-8.0).toVar(), s2 = float(-8.0).toVar();
    If(U.uSun1Col.x.add(U.uSun1Col.y).add(U.uSun1Col.z).greaterThan(0.0), () => { s1.assign(horizonMarch(p, U.uSun1Dir, float(1.0).div(tan(max(U.uSun1Sky.w.mul(SH.penumbra), 0.002))))); });
    If(U.uSun2Col.x.add(U.uSun2Col.y).add(U.uSun2Col.z).greaterThan(0.0), () => { s2.assign(horizonMarch(p, U.uSun2Dir, float(1.0).div(tan(max(U.uSun2Sky.w.mul(SH.penumbra), 0.002))))); });
    return vec4(s1, s2, 0.0, 1.0);
  })();

  // ---------------------------------------------------------------- probe materials
  const probe = new THREE.MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
  probe.vertexNode = vec4(positionLocal.xy, 0.0, 1.0);
  const probeIdx = () => floor(uv().mul(8.0));
  const probeP = (idx) => uProbeO.add(vec2(idx.x.mul(53.7).sub(idx.y.mul(21.1)), idx.y.mul(47.3).add(idx.x.mul(9.9))));
  probe.fragmentNode = Fn(() => {
    const idx = probeIdx().toVar();
    const pp = probeP(idx).toVar();
    return vec4(height(pp), heightLow(pp), idx.x, idx.y);
  })();
  const probeD = new THREE.MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
  probeD.vertexNode = vec4(positionLocal.xy, 0.0, 1.0);
  probeD.fragmentNode = Fn(() => {
    const pp = probeP(probeIdx()).toVar();
    return vec4(heightD(pp), heightLowD(pp).x);
  })();

  return {
    ground, sky, bake, probe, probeD,
    // walk slice: the shared formula and the uniforms, for the walk's own passes
    fns: { hash2, vnoise, vnoiseD, height, heightD }, uniforms: U,
    set(name, v) {
      const u = name === 'uGridOrigin' ? uGridOrigin : name === 'uProbeO' ? uProbeO : name === 'uShC' ? uShC : U[name];
      if (typeof u.value === 'number') u.value = v; else u.value.fromArray(v);
    },
  };
}
