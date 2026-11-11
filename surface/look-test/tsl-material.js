// WebGPURenderer path (WebGPU, or WebGL2 with forceWebGL): the Dust Sea ground, sky, shadow-map
// bake and probes as TSL node materials. Same maths as height.js and glsl-material.js, same order:
//   hash2 -> vnoise -> vnoiseD -> duneProfile -> duneProfileD -> heightLow -> heightLowD
//   -> height -> heightD                                                (ground formula)
//   shadowMarch -> horizonMarch -> sunSky -> starField -> haboob -> skyColor -> fogAmount
//   -> sandDensity -> blowingSand -> sunOnSand -> aces -> srgbEncode   (light, sky, air, output)
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
  floor, mix, smoothstep, clamp, max, min, pow, exp, log, cos, sin, acos, atan, tan, normalize, dot,
  length, abs, step, fwidth, positionLocal, positionWorld, cameraPosition, uv, screenCoordinate,
  textureLevel,
} from 'three/tsl';
import { G, SH, SHMAP, SKY, SAND, STORM, GRID, DEG, UNIFORM_TYPES } from './params.js';

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

  const heightLow = Fn(([p]) => {
    const x = p.x, z = p.y;
    const a = x.mul(WX).add(z.mul(WZ));
    const c = x.negate().mul(WZ).add(z.mul(WX));
    const wa = vnoise(p.mul(G.warp1F)).mul(G.warp1A).add(vnoise(p.mul(G.warp2F).add(vec2(31.7, -11.3))).mul(G.warp2A)).toVar();
    const wc = vnoise(p.mul(G.warp1F).add(vec2(57.1, 9.2))).mul(G.warp1A);
    const w3 = vnoise(p.mul(G.warp3F).add(vec2(-19.4, 23.9))).mul(G.warp3A);
    const a2 = a.add(wa).add(w3).toVar(), c2 = c.add(wc).toVar();
    const swell = vnoise(p.mul(G.swellF).add(vec2(3.3, 7.7))).mul(G.swellA).toVar();
    const s = a2.div(G.L1).toVar();
    const k = floor(s).toVar();
    const t = s.sub(k);
    const amp = vnoise(vec2(c2.mul(G.ampF), k.mul(0.731).add(0.5))).mul(0.5).add(0.5).mul(1.0 - G.ampBase).add(G.ampBase).mul(G.A1);
    const kk = vnoise(vec2(c2.mul(G.roundF), k.mul(0.917).add(1.7))).mul(0.5).add(0.5).mul(G.roundHi - G.roundLo).add(G.roundLo);
    const h1 = amp.mul(duneProfile(t, kk)).toVar();
    const s2 = x.mul(W2X).add(z.mul(W2Z)).add(wa.mul(0.5)).div(G.L2).toVar();
    const k2 = floor(s2).toVar();
    const t2 = s2.sub(k2);
    const amp2 = vnoise(vec2(x.negate().mul(W2Z).add(z.mul(W2X)).mul(G.amp2F), k2.mul(0.613).add(2.5))).mul(0.5).add(0.5).mul(G.A2);
    const h2 = amp2.mul(duneProfile(t2, float(G.round2)));
    return swell.add(h1).add(h2);
  }).setLayout({ name: 'heightLow', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });

  const heightLowD = Fn(([p]) => {
    const x = p.x, z = p.y;
    const a = x.mul(WX).add(z.mul(WZ));
    const c = x.negate().mul(WZ).add(z.mul(WX));
    const nA = vnoiseD(p.mul(G.warp1F)).toVar();
    const nB = vnoiseD(p.mul(G.warp2F).add(vec2(31.7, -11.3))).toVar();
    const wa = nA.x.mul(G.warp1A).add(nB.x.mul(G.warp2A)).toVar();
    const gwa = nA.yz.mul(G.warp1A * G.warp1F).add(nB.yz.mul(G.warp2A * G.warp2F)).toVar();
    const nC = vnoiseD(p.mul(G.warp1F).add(vec2(57.1, 9.2))).toVar();
    const n3 = vnoiseD(p.mul(G.warp3F).add(vec2(-19.4, 23.9))).toVar();
    const a2 = a.add(wa).add(n3.x.mul(G.warp3A)).toVar();
    const c2 = c.add(nC.x.mul(G.warp1A)).toVar();
    const ga2 = vec2(WX, WZ).add(gwa).add(n3.yz.mul(G.warp3A * G.warp3F)).toVar();
    const gc2 = vec2(-WZ, WX).add(nC.yz.mul(G.warp1A * G.warp1F)).toVar();
    const nS = vnoiseD(p.mul(G.swellF).add(vec2(3.3, 7.7))).toVar();
    const s = a2.div(G.L1).toVar();
    const k = floor(s).toVar();
    const t = s.sub(k);
    const nAmp = vnoiseD(vec2(c2.mul(G.ampF), k.mul(0.731).add(0.5))).toVar();
    const amp = nAmp.x.mul(0.5).add(0.5).mul(1.0 - G.ampBase).add(G.ampBase).mul(G.A1).toVar();
    const gamp = gc2.mul(nAmp.y.mul(G.A1 * (1 - G.ampBase) * 0.5 * G.ampF)).toVar();
    const nK = vnoiseD(vec2(c2.mul(G.roundF), k.mul(0.917).add(1.7))).toVar();
    const kk = nK.x.mul(0.5).add(0.5).mul(G.roundHi - G.roundLo).add(G.roundLo).toVar();
    const gkk = gc2.mul(nK.y.mul((G.roundHi - G.roundLo) * 0.5 * G.roundF)).toVar();
    const pr = duneProfileD(t, kk).toVar();
    const h1 = amp.mul(pr.x);
    const gh1 = gamp.mul(pr.x).add(ga2.mul(pr.y.div(G.L1)).add(gkk.mul(pr.z)).mul(amp));
    const s2 = x.mul(W2X).add(z.mul(W2Z)).add(wa.mul(0.5)).div(G.L2).toVar();
    const k2 = floor(s2).toVar();
    const t2 = s2.sub(k2);
    const nA2 = vnoiseD(vec2(x.negate().mul(W2Z).add(z.mul(W2X)).mul(G.amp2F), k2.mul(0.613).add(2.5))).toVar();
    const amp2 = nA2.x.mul(0.5).add(0.5).mul(G.A2).toVar();
    const pr2 = duneProfileD(t2, float(G.round2)).toVar();
    const h2 = amp2.mul(pr2.x);
    const gh2 = vec2(-W2Z, W2X).mul(nA2.y.mul(G.A2 * 0.5 * G.amp2F).mul(pr2.x))
      .add(vec2(W2X, W2Z).add(gwa.mul(0.5)).mul(pr2.y.mul(amp2).div(G.L2)));
    return vec3(nS.x.mul(G.swellA).add(h1).add(h2), nS.yz.mul(G.swellA * G.swellF).add(gh1).add(gh2));
  }).setLayout({ name: 'heightLowD', type: 'vec3', inputs: [{ name: 'p', type: 'vec2' }] });

  const height = Fn(([p]) => {
    return heightLow(p)
      .add(vnoise(p.mul(G.det1F).add(vec2(1.3, -4.1))).mul(G.det1A))
      .add(vnoise(p.mul(G.det2F).add(vec2(-7.9, 2.2))).mul(G.det2A));
  }).setLayout({ name: 'height', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });

  const heightD = Fn(([p]) => {
    const lo = heightLowD(p).toVar();
    const d1 = vnoiseD(p.mul(G.det1F).add(vec2(1.3, -4.1))).toVar();
    const d2 = vnoiseD(p.mul(G.det2F).add(vec2(-7.9, 2.2))).toVar();
    return vec3(lo.x.add(d1.x.mul(G.det1A)).add(d2.x.mul(G.det2A)),
      lo.yz.add(d1.yz.mul(G.det1A * G.det1F)).add(d2.yz.mul(G.det2A * G.det2F)));
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

  // relative azimuth of a view direction (radians, + to the right of the view heading)
  const relAz = (rd) => {
    const hd = normalize(rd.xz.add(vec2(1e-6, 0.0)));
    return atan(dot(hd, U.uWallRight), dot(hd, U.uWallFwd));
  };

  // billows: smooth domes on domes, 0..1 (lit as a bumpy surface facing the viewer)
  // each octave is rotated (and scaled) against the last so the value-noise lattice never lines up
  const billow = (w) => {
    const w2 = vec2(w.x.mul(1.7).sub(w.y.mul(1.2)), w.x.mul(1.2).add(w.y.mul(1.7))).add(vec2(5.2, 1.3));
    const w3 = vec2(w2.x.mul(1.7).sub(w2.y.mul(1.2)), w2.x.mul(1.2).add(w2.y.mul(1.7))).add(vec2(1.7, 8.9));
    return vnoise(w).mul(0.55).add(vnoise(w2).mul(0.3)).add(vnoise(w3).mul(0.15)).mul(0.5).add(0.5);
  };

  // The haboob: a sheet of dust at distance D, in metres on the sheet (X along, Y up).
  // Returns colour and opacity.
  const haboob = (rd) => {
    const hd = normalize(rd.xz.add(vec2(1e-6, 0.0))).toVar();
    const phi = atan(dot(hd, U.uWallRight), dot(hd, U.uWallFwd)).toVar();
    const q = rd.y.div(max(length(rd.xz), 1e-3));
    const D = U.uWallGeo.z, H0 = U.uWallGeo.w;
    const X = phi.mul(D).toVar(), Y = q.mul(D).toVar();
    const along = clamp(phi.sub(U.uWallGeo.x).div(U.uWallGeo.y), 0.0, 1.0).toVar();
    const taper = pow(along, 1.4);
    const top = H0.mul(taper).mul(float(1.0)
      .add(vnoise(vec2(X.mul(STORM.topF[0]), 3.1)).mul(STORM.topA[0]))
      .add(abs(vnoise(vec2(X.mul(STORM.topF[1]), 7.3))).mul(2.0).sub(1.0).mul(STORM.topA[1]))
      .add(abs(vnoise(vec2(X.mul(STORM.topF[2]), 1.9))).mul(2.0).sub(1.0).mul(STORM.topA[2]))).toVar();
    const wisp = vnoise(vec2(X, Y).div(38.0).add(vec2(2.0, 6.0))).mul(STORM.edgeSoft * 1.6);
    const edge = top.sub(Y).add(wisp).toVar();
    // the far (left) end is thin: the front recedes into haze there
    const a = smoothstep(-STORM.edgeSoft, STORM.edgeSoft, edge).mul(smoothstep(0.0, STORM.endSoft, along)).toVar();
    // lobes, lit from the side each sun is on and from above; creases between lobes stay dark
    const w = vec2(X, Y.sub(X.mul(0.1))).mul(STORM.lobeF).toVar();
    const B = billow(w).toVar();
    const Bx = billow(w.add(vec2(0.12, 0.0)));
    const By = billow(w.add(vec2(0.0, 0.12)));
    const N = normalize(vec3(B.sub(Bx).mul(STORM.bump), B.sub(By).mul(STORM.bump), 1.0)).toVar();
    const tng = vec2(hd.y.negate(), hd.x);
    const yn = clamp(Y.div(max(top, 1.0)), -1.0, 1.2).toVar();
    const vert = smoothstep(-0.2, 1.0, yn).toVar();
    const occ = mix(0.45, 1.0, B);
    const rimBand = exp(max(edge, 0.0).negate().div(STORM.edgeSoft * 2.2)).toVar();
    const lit = (L, C) => {
      const Lw = normalize(vec3(dot(L.xz, tng), max(L.y, 0.0).add(0.45), dot(L.xz, hd).negate()));
      const face = clamp(dot(N, Lw).mul(0.6).add(0.4), 0.0, 1.0);
      const behind = max(dot(L.xz, hd), 0.0);
      const rim = rimBand.mul(behind).mul(pow(max(dot(rd, L), 0.0), 6.0)).mul(2.2);
      return C.mul(face.mul(vert).mul(vert).mul(occ).add(rim));
    };
    const col = U.uWallBase.mul(mix(0.6, 1.6, vert)).mul(B.mul(0.6).add(0.7)).add(lit(U.uSun1Dir, U.uWallSun1)).add(lit(U.uSun2Dir, U.uWallSun2));
    return vec4(col, a);
  };

  const skyColor = (rd, withDisc) => {
    const y = max(rd.y, 0.0);
    const gy = float(1.0).sub(exp(y.mul(-SKY.k))).toVar(); // 0 at the horizon, 1 overhead
    const col = mix(U.uHorizon, U.uZenith, gy).toVar();
    col.addAssign(sunSky(rd, U.uSun1Dir, U.uSun1Tint, U.uSun1Disc, U.uSun1Sky, U.uSun1Glow, withDisc, gy));
    col.addAssign(sunSky(rd, U.uSun2Dir, U.uSun2Tint, U.uSun2Disc, U.uSun2Sky, U.uSun2Glow, withDisc, gy));
    col.addAssign(vec3(starField(rd).mul(U.uStars).mul(withDisc)));
    If(U.uStorm.greaterThan(0.5), () => {
      const wall = haboob(rd).toVar();
      col.assign(mix(col, wall.xyz, wall.w));
    });
    return col;
  };

  // distance + height fog; in the storm the distance part thickens toward the wall and the ground
  // beyond the wall's foot is inside it
  const fogAmount = (ro, rd, dist) => {
    const wallSide = smoothstep(U.uWallGeo.x, U.uWallGeo.x.add(U.uWallGeo.y.mul(0.8)), relAz(rd)).mul(U.uStorm).toVar();
    const dens = mix(U.uFog.x, U.uStormFog.y, wallSide).mul(dist).toVar();
    const k = U.uFog.z;
    const ry = max(rd.y.mul(k).mul(dist), -20.0).toVar();
    const fr = select(abs(ry).lessThan(1e-4), float(1.0).sub(ry.mul(0.5)), float(1.0).sub(exp(ry.negate())).div(ry));
    dens.addAssign(U.uFog.y.mul(exp(ro.y.sub(U.uFog.w).mul(k).negate())).mul(dist).mul(fr));
    return max(float(1.0).sub(exp(dens.negate())), wallSide.mul(smoothstep(U.uStormFog.z, U.uStormFog.w, dist)));
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

  // With the shadow map on, the ground height and the spill height come from its B and A channels
  // (baked once with the shadows); otherwise from the formula, two evaluations per sample.
  const sandDensity = (q) => {
    const sw = U.uStormWind;
    const a = dot(q.xz, sw).toVar(), c = dot(q.xz, vec2(sw.y.negate(), sw.x)).toVar();
    const hg = float(0.0).toVar(), href = float(0.0).toVar();
    if (opts.shadows === 'map') {
      const m = textureLevel(shadowTex, shadowUV(q.xz), float(0.0)).toVar();
      hg.assign(m.z); href.assign(m.w);
    } else {
      hg.assign(height(q.xz));
      href.assign(max(hg, height(q.xz.sub(sw.mul(STORM.spill))).sub(STORM.spill * STORM.spillDrop)));
    }
    const above = q.y.sub(href);
    const cs = c.add(vnoise(vec2(a.mul(STORM.snakeF), c.mul(0.02).add(4.0))).mul(STORM.snakeA));
    const streak = smoothstep(0.2, 0.65, vnoise(vec2(a.mul(STORM.alongF), cs.mul(STORM.acrossF))));
    // broad sheets come and go but never vanish, so there is always some sand moving
    const sheet = smoothstep(-0.8, 0.5, vnoise(vec2(a, c).mul(STORM.sheetF).add(vec2(2.0, 9.0)))).mul(0.7).add(0.3).toVar();
    const hs = sheet.mul(0.8).add(0.6).mul(STORM.sandH);
    return step(-0.05, q.y.sub(hg)).mul(exp(max(above, 0.0).negate().div(hs))).mul(sheet).mul(streak.mul(0.94).add(0.06));
  };

  const blowingSand = (ro, rd, tEnd) => {
    const tau = float(0.0).toVar();
    const t1 = clamp(tEnd, STORM.sandNear * 1.01, STORM.sandFar).toVar();
    const lr = log(t1.div(STORM.sandNear)).toVar();
    const j = hash2(int(screenCoordinate.x).add(int(7)), int(screenCoordinate.y).add(int(3))).toVar();
    Loop(STORM.sandSteps, ({ i }) => {
      const f = float(i).add(j).div(STORM.sandSteps);
      const t = exp(lr.mul(f)).mul(STORM.sandNear).toVar();
      const dt = t.mul(lr).div(STORM.sandSteps);
      tau.addAssign(sandDensity(ro.add(rd.mul(t))).mul(STORM.sandTau).mul(dt).mul(step(t, t1)));
    });
    return float(1.0).sub(exp(tau.negate()));
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
  const gxz = positionLocal.xz.add(uGridOrigin);
  const gy = height(gxz);
  ground.positionNode = vec3(positionLocal.x, gy, positionLocal.z);
  const vWorld = varying(vec3(gxz.x, gy, gxz.y), 'vWorld');

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
      const d1 = vnoiseD(xz.mul(G.det1F).add(vec2(1.3, -4.1))).toVar();
      const d2 = vnoiseD(xz.mul(G.det2F).add(vec2(-7.9, 2.2))).toVar();
      h0.assign(lo.x.add(d1.x.mul(G.det1A)).add(d2.x.mul(G.det2A)));
      const fade2 = float(1.0).sub(smoothstep(1.5, 5.0, fw));
      grad.assign(lo.yz.add(d1.yz.mul(G.det1A * G.det1F)).add(d2.yz.mul(fade2.mul(G.det2A * G.det2F))));
    }
    const sp = vec3(xz.x, h0, xz.y).toVar();

    const W = vec2(WX, WZ);
    if (opts.ripples) {
      const lee = dot(grad, W).negate();
      const ripOn = float(1.0).sub(smoothstep(G.ripLeeLo, G.ripLeeHi, lee)).mul(float(1.0).sub(smoothstep(G.ripL * 0.15, G.ripL * 0.5, fw))).toVar();
      If(ripOn.greaterThan(0.0), () => {
        const ra = dot(xz, W).add(vnoise(xz.mul(G.ripWarpF)).mul(G.ripWarpA)).add(vnoise(xz.mul(G.ripWarpF * 3.1).add(vec2(4.0, 4.0))).mul(G.ripWarpA * 0.4));
        const ph = ra.mul(TAU / G.ripL).toVar();
        const dr = cos(ph).add(cos(ph.mul(2.0).add(0.9)).mul(0.45));
        const ripAmp = smoothstep(-0.6, 0.7, vnoise(xz.mul(G.ripAmpF).add(vec2(-6.0, 2.0)))).mul(0.65).add(0.35);
        grad.addAssign(W.mul(dr.mul(G.ripSlope).mul(ripOn).mul(ripAmp)));
      });
    }
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

    // cast shadows: the baked map (default), the per-pixel march (reference), or none
    const sh1 = float(1.0).toVar(), sh2 = float(1.0).toVar();
    if (opts.shadows === 'map') {
      const hz = textureLevel(shadowTex, shadowUV(xz), float(0.0)).toVar();
      sh1.assign(softFromHorizon(hz.x, U.uSun1Dir, float(1.0).div(tan(max(U.uSun1Sky.w.mul(SH.penumbra), 0.002)))));
      sh2.assign(softFromHorizon(hz.y, U.uSun2Dir, float(1.0).div(tan(max(U.uSun2Sky.w.mul(SH.penumbra), 0.002)))));
    } else if (opts.shadows === 'march') {
      const lp = sp.add(n.mul(SH.lift)).toVar();
      If(U.uSun1Col.x.add(U.uSun1Col.y).add(U.uSun1Col.z).greaterThan(0.0), () => { sh1.assign(shadowMarch(lp, U.uSun1Dir, float(1.0).div(tan(max(U.uSun1Sky.w.mul(SH.penumbra), 0.002))))); });
      If(U.uSun2Col.x.add(U.uSun2Col.y).add(U.uSun2Col.z).greaterThan(0.0), () => { sh2.assign(shadowMarch(lp, U.uSun2Dir, float(1.0).div(tan(max(U.uSun2Sky.w.mul(SH.penumbra), 0.002))))); });
    }

    const col = vec3(0.0).toVar();
    col.addAssign(sunOnSand(n, V, alb, U.uSun1Dir, U.uSun1Col, sh1, nm, gAmt, U.uWrap));
    col.addAssign(sunOnSand(n, V, alb, U.uSun2Dir, U.uSun2Col, sh2, nm, gAmt, U.uWrap));
    col.addAssign(alb.mul(mix(U.uAmbGround, U.uAmbSky, n.y.mul(0.5).add(0.5))).mul(mix(SAND.aoLo, 1.0, smoothstep(0.6, 1.0, n.y))));

    const fog = fogAmount(ro, rd, dist).toVar();
    const edge = smoothstep(GRID.rMax * 0.72, GRID.rMax * 0.97, length(xz.sub(ro.xz)));
    fog.assign(max(fog, edge));
    const fogCol = mix(skyColor(rd, float(0.0)), U.uFogCol, U.uFogColMix.mul(0.6));
    col.assign(mix(col, fogCol, fog));
    If(U.uStorm.greaterThan(0.5), () => {
      col.assign(mix(col, sandColor(rd), blowingSand(ro, rd, dist)));
    });

    return vec4(finish(col), 1.0);
  })();

  // ---------------------------------------------------------------- sky material
  const sky = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false });
  sky.fragmentNode = Fn(() => {
    const ro = cameraPosition;
    const rd = normalize(positionWorld.sub(ro)).toVar();
    const col = skyColor(rd, float(1.0)).toVar();
    If(U.uStorm.greaterThan(0.5), () => {
      col.assign(mix(col, sandColor(rd), blowingSand(ro, rd, float(1e5))));
    });
    return vec4(finish(col), 1.0);
  })();

  // ---------------------------------------------------------------- shadow-map bake material
  // One texel = one ground point around uShC (log-polar); R and G are the two suns' horizon
  // values Hmax from the same march as the reference path (see horizonMarch).
  const bake = new THREE.MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
  bake.vertexNode = vec4(positionLocal.xy, 0.0, 1.0);
  bake.fragmentNode = Fn(() => {
    const st = uv().toVar();
    const ang = st.x.mul(TAU).toVar();
    const r = exp(st.y.mul(LNR)).mul(SHMAP.r0);
    const xz = uShC.add(vec2(cos(ang), sin(ang)).mul(r)).toVar();
    const hd = heightD(xz).toVar();
    const n = normalize(vec3(hd.y.negate(), 1.0, hd.z.negate()));
    const p = vec3(xz.x, hd.x, xz.y).add(n.mul(SH.lift)).toVar();
    const s1 = float(-8.0).toVar(), s2 = float(-8.0).toVar();
    // B: the ground height; A: the height blowing sand rides at (a crest's height carried a few
    // metres downwind of it). Only the storm uses them, and only a storm target has B and A.
    const href = hd.x.toVar();
    If(U.uStorm.greaterThan(0.5), () => {
      href.assign(max(hd.x, height(xz.sub(U.uStormWind.mul(STORM.spill))).sub(STORM.spill * STORM.spillDrop)));
    });
    If(U.uSun1Col.x.add(U.uSun1Col.y).add(U.uSun1Col.z).greaterThan(0.0), () => { s1.assign(horizonMarch(p, U.uSun1Dir, float(1.0).div(tan(max(U.uSun1Sky.w.mul(SH.penumbra), 0.002))))); });
    If(U.uSun2Col.x.add(U.uSun2Col.y).add(U.uSun2Col.z).greaterThan(0.0), () => { s2.assign(horizonMarch(p, U.uSun2Dir, float(1.0).div(tan(max(U.uSun2Sky.w.mul(SH.penumbra), 0.002))))); });
    return vec4(s1, s2, hd.x, href);
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
    set(name, v) {
      const u = name === 'uGridOrigin' ? uGridOrigin : name === 'uProbeO' ? uProbeO : name === 'uShC' ? uShC : U[name];
      if (typeof u.value === 'number') u.value = v; else u.value.fromArray(v);
    },
  };
}
