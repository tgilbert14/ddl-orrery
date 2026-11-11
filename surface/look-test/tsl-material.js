// WebGPURenderer path (WebGPU, or WebGL2 with forceWebGL): the Dust Sea ground, sky and probe
// as TSL node materials. Same maths as height.js and glsl-material.js, same function order:
//   hash2 -> vnoise -> duneProfile -> heightLow -> height              (ground formula)
//   shadowMarch -> sunSky -> starField -> skyColor -> fogAmount
//   -> driftLayer -> drift -> sunOnSand -> aces -> srgbEncode          (light, sky, air, output)
// Every TSL name used here is in the webgpu-tsl cheat sheet or was checked against the
// exports of surface/vendor/three-r186/three.tsl.js (see the look-test README notes in main.js).

import * as THREE from 'three/webgpu';
import {
  Fn, If, Loop, Break, select, uint, int, float, vec2, vec3, vec4, uniform, varying,
  floor, mix, smoothstep, clamp, max, min, pow, exp, cos, tan, normalize, dot, length, abs, step,
  fwidth, positionLocal, positionWorld, cameraPosition, uv, screenCoordinate,
} from 'three/tsl';
import { G, SH, SKY, SAND, DRIFT, GRID, DEG, UNIFORM_TYPES } from './params.js';

const WX = Math.cos(G.windDeg * DEG), WZ = Math.sin(G.windDeg * DEG);
const W2X = Math.cos(G.dir2Deg * DEG), W2Z = Math.sin(G.dir2Deg * DEG);
const TAU = 6.28318530718;

export function createTslMaterials(values) {
  // ---------------------------------------------------------------- uniforms
  const U = {};
  for (const [k, t] of Object.entries(UNIFORM_TYPES)) {
    const v = values[k];
    U[k] = uniform(t === 'float' ? v : t === 'vec2' ? new THREE.Vector2(...v) : t === 'vec3' ? new THREE.Vector3(...v) : new THREE.Vector4(...v));
  }
  const uGridOrigin = uniform(new THREE.Vector2());
  const uProbeO = uniform(new THREE.Vector2());

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

  const duneProfile = Fn(([t]) => {
    const u = t.div(G.crest).toVar();
    const v = t.sub(G.crest).div(1.0 - G.crest).toVar();
    const up = u.mul(u).mul(float(2.0).sub(u));
    const omv = float(1.0).sub(v).toVar();
    const down = omv.mul(omv);
    return select(t.lessThan(G.crest), up, down);
  }).setLayout({ name: 'duneProfile', type: 'float', inputs: [{ name: 't', type: 'float' }] });

  const heightLow = Fn(([p]) => {
    const x = p.x, z = p.y;
    const a = x.mul(WX).add(z.mul(WZ));
    const c = x.negate().mul(WZ).add(z.mul(WX));
    const wa = vnoise(p.mul(G.warp1F)).mul(G.warp1A).add(vnoise(p.mul(G.warp2F).add(vec2(31.7, -11.3))).mul(G.warp2A)).toVar();
    const wc = vnoise(p.mul(G.warp1F).add(vec2(57.1, 9.2))).mul(G.warp1A);
    const a2 = a.add(wa).toVar(), c2 = c.add(wc).toVar();
    const swell = vnoise(p.mul(G.swellF).add(vec2(3.3, 7.7))).mul(G.swellA).toVar();
    const s = a2.div(G.L1).toVar();
    const k = floor(s).toVar();
    const t = s.sub(k);
    const amp = vnoise(vec2(c2.mul(G.ampF), k.mul(0.731).add(0.5))).mul(0.5).add(0.5).mul(1.0 - G.ampBase).add(G.ampBase).mul(G.A1);
    const h1 = amp.mul(duneProfile(t)).toVar();
    const s2 = x.mul(W2X).add(z.mul(W2Z)).add(wa.mul(0.5)).div(G.L2).toVar();
    const k2 = floor(s2).toVar();
    const t2 = s2.sub(k2);
    const amp2 = vnoise(vec2(x.negate().mul(W2Z).add(z.mul(W2X)).mul(G.amp2F), k2.mul(0.613).add(2.5))).mul(0.5).add(0.5).mul(G.A2);
    const h2 = amp2.mul(duneProfile(t2));
    return swell.add(h1).add(h2);
  }).setLayout({ name: 'heightLow', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });

  const height = Fn(([p]) => {
    return heightLow(p)
      .add(vnoise(p.mul(G.det1F).add(vec2(1.3, -4.1))).mul(G.det1A))
      .add(vnoise(p.mul(G.det2F).add(vec2(-7.9, 2.2))).mul(G.det2A));
  }).setLayout({ name: 'height', type: 'float', inputs: [{ name: 'p', type: 'vec2' }] });

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

  const sunSky = Fn(([rd, L, tint, sky, withDisc, gy]) => {
    const c = dot(rd, L).toVar();
    const cp = max(c, 0.0).toVar();
    const halo = sky.x.mul(pow(cp, SKY.glowPow1)).add(sky.y.mul(pow(cp, SKY.glowPow2)));
    const boost = float(1.0).sub(gy.mul(0.6));
    const disc = smoothstep(cos(sky.w.mul(1.25)), cos(sky.w.mul(0.8)), c).mul(withDisc).mul(smoothstep(-0.004, 0.004, rd.y));
    return tint.mul(halo.mul(boost).add(disc.mul(sky.z)));
  }).setLayout({ name: 'sunSky', type: 'vec3', inputs: [
    { name: 'rd', type: 'vec3' }, { name: 'L', type: 'vec3' }, { name: 'tint', type: 'vec3' },
    { name: 'sky', type: 'vec4' }, { name: 'withDisc', type: 'float' }, { name: 'gy', type: 'float' }] });

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

  // skyColor, fogAmount, driftLayer and drift read uniforms, so they are inlined (no setLayout):
  // in r186 a uniform referenced inside a setLayout function is declared under the wrong name.
  const skyColor = (rd, withDisc) => {
    const y = max(rd.y, 0.0);
    const gy = float(1.0).sub(exp(y.mul(-SKY.k))).toVar(); // 0 at the horizon, 1 overhead
    const col = mix(U.uHorizon, U.uZenith, gy).toVar();
    const hd = normalize(rd.xz.add(vec2(1e-6, 0.0)));
    const wall = smoothstep(0.2, 0.95, dot(hd, U.uWallDir)).mul(U.uStorm);
    col.assign(mix(col, U.uWallCol, wall.mul(float(1.0).sub(gy.mul(0.7)))));
    col.addAssign(sunSky(rd, U.uSun1Dir, U.uSun1Tint, U.uSun1Sky, withDisc, gy));
    col.addAssign(sunSky(rd, U.uSun2Dir, U.uSun2Tint, U.uSun2Sky, withDisc, gy));
    col.addAssign(vec3(starField(rd).mul(U.uStars).mul(withDisc)));
    return col;
  };

  const fogAmount = (ro, rd, dist) => {
    const dens = U.uFog.x.mul(dist).toVar();
    const k = U.uFog.z;
    const ry = max(rd.y.mul(k).mul(dist), -20.0).toVar();
    const fr = select(abs(ry).lessThan(1e-4), float(1.0).sub(ry.mul(0.5)), float(1.0).sub(exp(ry.negate())).div(ry));
    dens.addAssign(U.uFog.y.mul(exp(ro.y.sub(U.uFog.w).mul(k).negate())).mul(dist).mul(fr));
    return float(1.0).sub(exp(dens.negate()));
  };

  const driftLayer = (ro, rd, dist, hk, seed) => {
    const rdy = select(rd.y.greaterThanEqual(0.0), max(rd.y, 1e-4), min(rd.y, -1e-4));
    const t = U.uGroundY.add(hk).sub(ro.y).div(rdy).toVar();
    // a sheet fades out over its last 4 m before the ray meets the sand, so its edge never draws a line
    const ok = step(0.0, t).mul(smoothstep(0.0, 4.0, dist.sub(t)));
    const tc = clamp(t, 0.0, 400.0).toVar();
    const p = ro.xz.add(rd.xz.mul(tc)).toVar();
    const q = vec2(dot(p, U.uDriftDir).mul(DRIFT.fa), dot(p, vec2(U.uDriftDir.y.negate(), U.uDriftDir.x)).mul(DRIFT.fc)).add(vec2(seed.mul(17.3), seed.mul(5.1))).toVar();
    const n = vnoise(q).mul(0.65).add(vnoise(q.mul(vec2(2.3, 1.7)).add(vec2(9.1, 9.1))).mul(0.35));
    return ok.mul(smoothstep(0.3, 0.8, n)).mul(exp(tc.negate().div(DRIFT.fall)));
  };

  const drift = (ro, rd, dist) => {
    const acc = driftLayer(ro, rd, dist, float(DRIFT.h[0]), float(0.0)).mul(DRIFT.w[0])
      .add(driftLayer(ro, rd, dist, float(DRIFT.h[1]), float(1.0)).mul(DRIFT.w[1]))
      .add(driftLayer(ro, rd, dist, float(DRIFT.h[2]), float(2.0)).mul(DRIFT.w[2]))
      .add(driftLayer(ro, rd, dist, float(DRIFT.h[3]), float(3.0)).mul(DRIFT.w[3]));
    return acc.mul(U.uDrift);
  };

  const sunOnSand = Fn(([p, n, V, alb, L, C, kPen, nm, gAmt]) => {
    const sh = float(0.0).toVar();
    If(C.x.add(C.y).add(C.z).greaterThan(0.0), () => { sh.assign(shadowMarch(p.add(n.mul(SH.lift)), L, kPen)); });
    const ndl = dot(n, L).toVar();
    const wrapd = max(ndl.add(SAND.wrap).div(1.0 + SAND.wrap), 0.0);
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
    { name: 'p', type: 'vec3' }, { name: 'n', type: 'vec3' }, { name: 'V', type: 'vec3' }, { name: 'alb', type: 'vec3' },
    { name: 'L', type: 'vec3' }, { name: 'C', type: 'vec3' }, { name: 'kPen', type: 'float' },
    { name: 'nm', type: 'vec3' }, { name: 'gAmt', type: 'float' }] });

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

    const e = max(fw.mul(0.75), 0.04).toVar();
    const h0 = height(xz).toVar();
    const hx = height(xz.add(vec2(e, 0.0)));
    const hz = height(xz.add(vec2(0.0, e)));
    const grad = vec2(hx.sub(h0), hz.sub(h0)).div(e).toVar();
    const sp = vec3(xz.x, h0, xz.y).toVar();

    const W = vec2(WX, WZ);
    const lee = dot(grad, W).negate();
    const ripOn = float(1.0).sub(smoothstep(G.ripLeeLo, G.ripLeeHi, lee)).mul(float(1.0).sub(smoothstep(G.ripL * 0.15, G.ripL * 0.5, fw)));
    const ra = dot(xz, W).add(vnoise(xz.mul(G.ripWarpF)).mul(G.ripWarpA)).add(vnoise(xz.mul(G.ripWarpF * 3.1).add(vec2(4.0, 4.0))).mul(G.ripWarpA * 0.4));
    const ph = ra.mul(TAU / G.ripL).toVar();
    const dr = cos(ph).add(cos(ph.mul(2.0).add(0.9)).mul(0.45));
    const ripAmp = smoothstep(-0.6, 0.7, vnoise(xz.mul(G.ripAmpF).add(vec2(-6.0, 2.0)))).mul(0.65).add(0.35);
    grad.addAssign(W.mul(dr.mul(G.ripSlope).mul(ripOn).mul(ripAmp)));
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

    const col = vec3(0.0).toVar();
    col.addAssign(sunOnSand(sp, n, V, alb, U.uSun1Dir, U.uSun1Col, float(1.0).div(tan(max(U.uSun1Sky.w, 0.002))), nm, gAmt));
    col.addAssign(sunOnSand(sp, n, V, alb, U.uSun2Dir, U.uSun2Col, float(1.0).div(tan(max(U.uSun2Sky.w, 0.002))), nm, gAmt));
    col.addAssign(alb.mul(mix(U.uAmbGround, U.uAmbSky, n.y.mul(0.5).add(0.5))).mul(mix(SAND.aoLo, 1.0, smoothstep(0.6, 1.0, n.y))));

    const fog = fogAmount(ro, rd, dist).toVar();
    const edge = smoothstep(GRID.rMax * 0.72, GRID.rMax * 0.97, length(xz.sub(ro.xz)));
    fog.assign(max(fog, edge));
    col.assign(mix(col, skyColor(rd, float(0.0)), fog));
    col.assign(mix(col, U.uDustCol, clamp(drift(ro, rd, dist), 0.0, 0.6)));

    return vec4(finish(col), 1.0);
  })();

  // ---------------------------------------------------------------- sky material
  const sky = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false });
  sky.fragmentNode = Fn(() => {
    const ro = cameraPosition;
    const rd = normalize(positionWorld.sub(ro)).toVar();
    const col = skyColor(rd, float(1.0)).toVar();
    col.assign(mix(col, U.uDustCol, clamp(drift(ro, rd, float(1e5)), 0.0, 0.6)));
    return vec4(finish(col), 1.0);
  })();

  // ---------------------------------------------------------------- probe material
  const probe = new THREE.MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
  probe.vertexNode = vec4(positionLocal.xy, 0.0, 1.0);
  probe.fragmentNode = Fn(() => {
    const idx = floor(uv().mul(8.0)).toVar();
    const pp = uProbeO.add(vec2(idx.x.mul(53.7).sub(idx.y.mul(21.1)), idx.y.mul(47.3).add(idx.x.mul(9.9)))).toVar();
    return vec4(height(pp), heightLow(pp), idx.x, idx.y);
  })();

  return {
    ground, sky, probe,
    set(name, v) {
      const u = name === 'uGridOrigin' ? uGridOrigin : name === 'uProbeO' ? uProbeO : U[name];
      if (typeof u.value === 'number') u.value = v; else u.value.fromArray(v);
    },
  };
}
