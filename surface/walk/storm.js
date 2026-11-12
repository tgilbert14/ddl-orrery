// Dust Sea walk: the storm front. Every several minutes a wall of sand comes over the upwind horizon,
// swallows the visitor (visibility about 8 m), passes, and leaves the sand clean.
//
// The storm is a shaped body, not a simulation. It is a slab of dust standing across the wind: a
// leading face and a trailing face (planes across the wind, bent a little along their length while
// far off), a soft edge on each (the leading one 140 m, the trailing one 520 m, so the storm thins
// from the upwind side as it goes), a billowed top about 560 m up, and low dust blown out ahead of
// the front and left behind it. Everything is measured along the wind from the visitor, so the
// storm's timing does not depend on where you walk. Light, colour and opacity come from closed-form
// integrals along each view ray through that body (no ray marching):
//   - optical depth through the slab: the integral of two clamped ramps along a straight ray;
//   - the dust ahead of and behind it: an exponential in distance from the face and in height,
//     integrated in closed form;
//   - near the eye the slab's density ramps up from nothing over DC metres (a clear pocket round the
//     camera, so the figure 5 m off stays readable while the ground 8.5 m off is gone);
//   - the lantern's glow in the dust: the single-scattering integral of a point light along the
//     ray (an atan), dimmed by the dust in between.
// Seen from outside, the face is shaded at the point where a ray enters it: cauliflower billows (the
// look test's domes, three octaves, drifting slowly), darker and redder low down, its top lit by
// the suns, a faint warm glow inside it near the base, and the base dissolving into the blown dust.
//
// The same function colours the ground and the sky (tsl-material.js opts.walk.storm), and the
// figure, the lantern and the thrown sand (pilgrim.js, puffs.js: opts.fog), so they agree. When no
// storm is active the shaders take a branch on a uniform and change nothing.
//
// Phases (seconds at scale 1; ?storm=fast runs every phase and the schedule at 4x):
//   approach 75  the wall rises on the upwind horizon (9 km to 300 m), the drift and the wind grow,
//                the light goes ochre
//   arrival   8  it crosses the last 300 m and swallows the visitor
//   inside   55  visibility about 8.5 m, the suns dim discs, sheets of sand racing past, gusts
//   passing  25  it thins from the upwind side; downwind the wall leaves across the dunes
//   after    60  calm, the sand clean; the drift a little stronger, easing to normal
// The first storm comes 150 to 240 s after the page is ready, then one every 300 to 480 s after the
// last one ended (seeded by ?seed=N, else random). ?storm=off: never; ?storm=now: the approach
// starts 8 s after ready. With ?test=1 there is no schedule unless ?storm= asks for one.

import * as THREE from 'three/webgpu';
import { Fn, If, uniform, vec2, vec3, vec4, float, clamp, smoothstep, max, min, mix, abs, exp, pow, sqrt, atan, dot, length, normalize, select, step,
  uv, floor, hash, cameraPosition, instancedDynamicBufferAttribute, mx_noise_float } from 'three/tsl';
import { G, DEG } from '../look-test/params.js';
import { height } from '../look-test/height.js';

const WX = Math.cos(G.windDeg * DEG), WZ = Math.sin(G.windDeg * DEG);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export const STORM = {
  phases: ['approach', 'arrival', 'inside', 'passing', 'after'],
  dur: { approach: 75, arrival: 8, inside: 55, passing: 25, after: 60 },
  firstMin: 150, firstMax: 240, gapMin: 300, gapMax: 480,
  nowDelay: 8,
  // the body
  D0: 9000,            // the leading face's distance upwind when the approach starts (m)
  Dlast: 300,          // ... when the arrival starts
  Dend: -150,          // ... when it ends (the soft edge has passed the visitor)
  depth: 3000,         // leading face to trailing face (m) while the front comes
  El: 140, Et: 520,    // soft edges: leading (a wall) and trailing (it thins from the upwind side)
  H: 560,              // mean height of the top (m)
  topF: [1 / 1100, 1 / 380], topA: [0.12, 0.07],
  bScale: [150, 60, 24], bAmp: [1, 0.48, 0.17], bFlat: 1.3, bulge: 150, depthN: 0.85, crease: 0.12,
  tilt: 1.6, tiltR: 70, occLo: 0.5, rimW: 9, wrap: 0.25,
  bend: 0.22,          // the faces bend along their length by up to this share of their distance (far only)
  // inside: visibility (contrast under 5%) and the clear pocket round the camera
  vis: 8.5, dc: 12,
  // blown dust ahead of the front (at the face, per metre; its e-folding distance from the face and
  // height) and behind the trailing face
  hazeLead: 0.004, lamLead: 300, hazeTrail: 0.003, lamTrail: 600, hazeH: 70,
  // light
  sunInside: 0.06,     // share of a sun that reaches the ground inside
  lampBoost: 0.9,      // the lantern's pool is this much brighter inside
  halo: 0.32,          // the lantern's glow in the dust (scattering coefficient, per metre at k = 1)
  // walking
  intoWind: 0.4, withWind: 0.12, nudge: 0.3, runCap: 1.4,
  // the camera
  boom: 5.0,
  // the trace (prints fill in): heal rate multiplier inside, and in the last 6 s of it
  erase: 15, eraseLast: 40,
};

// ---------------------------------------------------------------- uniforms (shared by every shader)
const V2 = () => new THREE.Vector2(), V3 = () => new THREE.Vector3(), V4 = () => new THREE.Vector4();
export const SU = {
  on: uniform(0),                 // 1 while a storm is anywhere (the shaders' branch)
  org: uniform(V3()),             // the visitor: x, ground y, z
  front: uniform(V4()),           // leading face, trailing face (m along the wind from the visitor), El, Et
  geo: uniform(V4()),             // top height H, wall opacity 0..1, inside sigma, clear pocket DC
  shape: uniform(V4()),           // bend amplitude (m) of the leading and trailing faces, drift time, k at the camera
  haze: uniform(V4()),            // lead haze per metre, its lambda, trail haze, its lambda
  mode: uniform(V4()),            // x: 1 deep inside (the shaders' fast path)
  medIn: uniform(V3()),           // the dust's radiance inside (before exposure)
  wallBase: uniform(V3()),        // the face's own colour where no sun reaches
  wallSun1: uniform(V3()), wallSun2: uniform(V3()),   // the suns' light on the face
  sunIn1: uniform(V3()), sunIn2: uniform(V3()),       // the suns' glow seen through the dust
  hazeCol: uniform(V3()),         // blown dust
  glowCol: uniform(V3()),         // the warm glow low in the wall
  horizon: uniform(V3()),         // the clear sky's horizon (aerial haze on a far face)
  sun1: uniform(V3()), sun2: uniform(V3()),           // directions
  halo: uniform(0),               // the lantern's glow in the dust
  // air.js: the drift's extra strength, and the storm's own fast layer (strength, phase, -)
  air: uniform(V4()),
};
SU.geo.value.set(STORM.H, 0, 1, STORM.dc);
SU.front.value.set(-1e5, -1e5 - STORM.depth, STORM.El, STORM.Et);

// ---------------------------------------------------------------- the shader side
const Fi = (x) => { const c = clamp(x, 0.0, 1.0); return c.mul(c).mul(0.5).add(max(x.sub(1.0), 0.0)); };

// cauliflower billows on the face (s along it, Y up, both metres): vec4(B 0..1, slope s, slope Y,
// the two largest octaves alone). As the look test's haboob, three octaves.
const BROT = [0.5, 1.33, 2.21], BOFF = [[0, 0], [5.2, 1.3], [1.7, 8.9]];
const BSUM = STORM.bAmp.reduce((a, b) => a + b, 0);
function billows(domes, S, Y) {
  const acc = vec4(0.0).toVar();
  for (let i = 0; i < STORM.bScale.length; i++) {
    const c = Math.cos(BROT[i]), sn = Math.sin(BROT[i]), k = 1 / STORM.bScale[i], A = STORM.bAmp[i] / BSUM;
    const n = domes(vec2(S.mul(c * k).sub(Y.mul(sn * k)).add(BOFF[i][0]), S.mul(sn * k).add(Y.mul(c * k)).add(BOFF[i][1]))).toVar();
    acc.addAssign(vec4(n.x.mul(A), n.y.mul(c).add(n.z.mul(sn)).mul(A), n.z.mul(c).sub(n.y.mul(sn)).mul(A), i < 2 ? n.x.mul(A) : float(0.0)));
  }
  return acc;
}

// Composite the storm over `col` (a var, changed in place) for a view ray from ro along rd that ends
// at dist. face: { vnoise, domes, px } for the ground and the sky (the face is shaded where the ray
// enters it); without it the dust is coloured as from inside (the figure, sand sprites: always near).
// lamp: { pos: vec4 (xyz, intensity), col: vec3 } for the lantern's glow in the dust.
export function stormApply(col, { ro, rd, dist, face = null, lamp = null }) {
  If(SU.on.greaterThan(0.5), () => {
    const L0 = min(dist, 20000.0).toVar();
    const sig0 = SU.geo.z, DC0 = SU.geo.w, kc0 = SU.shape.w;
    // the dust's colour seen from inside: brighter above, the suns as dim glows with a faint disc
    const sunGlow = (Ld, C) => {
      const c = dot(rd, Ld).toVar();
      return C.mul(pow(max(c, 0.0), 8.0).mul(0.6).add(smoothstep(0.9992, 0.9997, c).mul(1.6)));
    };
    const cIn = SU.medIn.mul(rd.y.mul(0.35).add(0.8)).add(sunGlow(SU.sun1, SU.sunIn1)).add(sunGlow(SU.sun2, SU.sunIn2)).toVar();
    // deep inside (both faces far beyond what can be seen, uniform SU.mode.x): the slab is uniform
    // round the eye, so only the clear pocket and the dust's own colour are needed
    If(SU.mode.x.greaterThan(0.5), () => {
      const Lb = min(L0, DC0);
      const tau = L0.sub(Lb.sub(Lb.mul(Lb).div(DC0.mul(2.0)))).mul(sig0);
      col.assign(mix(col, cIn, float(1.0).sub(exp(tau.negate()))));
    }).Else(() => {
    const W = vec2(WX, WZ), Pp = vec2(-WZ, WX);
    const u0 = dot(ro.xz.sub(SU.org.xz), W).toVar();
    const s0 = dot(ro.xz, Pp).toVar();
    const ru = dot(rd.xz, W).toVar(), rs = dot(rd.xz, Pp).toVar();
    const y0 = ro.y.sub(SU.org.y).toVar();
    const L = min(dist, 20000.0).toVar();
    const El = SU.front.z, Et = SU.front.w;
    const lead = SU.front.x.toVar(), trail = SU.front.y.toVar();
    const H = SU.geo.x.toVar();
    const kc = SU.shape.w;
    if (face) {
      // far off, each face bends along its length: find where the ray meets the straight face, and
      // move the face there by a slow noise
      const bendAt = (s, o) => face.vnoise(vec2(s.div(2600.0), o)).mul(0.7).add(face.vnoise(vec2(s.div(800.0), o + 4.0)).mul(0.3));
      const tl = clamp(lead.sub(u0).div(min(ru, -1e-3)), 0.0, 30000.0);
      lead.addAssign(bendAt(s0.add(rs.mul(tl)), 1.3).mul(SU.shape.x));
      const tt = clamp(trail.sub(u0).div(max(ru, 1e-3)), 0.0, 30000.0);
      trail.addAssign(bendAt(s0.add(rs.mul(tt)), 7.9).mul(SU.shape.y));
    }
    // where the ray enters the dust from outside, a little way into the soft edge (the face's surface)
    const sL = lead.sub(El.mul(0.15)), sT = trail.add(Et.mul(0.15));
    const vL = u0.greaterThan(sL).and(ru.lessThan(-1e-4));
    const vT = u0.lessThan(sT).and(ru.greaterThan(1e-4));
    const ts = select(vL, sL.sub(u0).div(min(ru, -1e-4)), select(vT, sT.sub(u0).div(max(ru, 1e-4)), float(0.0))).toVar();
    const fsg = select(vL, float(1.0), float(-1.0)).toVar();   // the face's outward normal: +wind (leading) or -wind
    const seen = vL.or(vT);
    const Ye = y0.add(rd.y.mul(ts)).toVar();
    const Se = s0.add(rs.mul(ts)).toVar();
    // the top and the face's colour where the ray enters (a far face: billows; near or inside: dust)
    const Ht = H.toVar();
    const cWall = vec3(0.0).toVar();
    const edgeA = float(1.0).toVar();
    if (face) {
      If(seen.and(SU.geo.y.greaterThan(0.0)).and(Ye.lessThan(H.mul(1.5))).and(rd.y.greaterThan(-0.15)).and(ts.lessThan(L)), () => {
        const t = SU.shape.z;
        // slow internal drift: the body rolls along the front and its billows rise
        const S = Se.add(t.mul(1.5)), Yb = Ye.add(t.mul(2.5));
        Ht.assign(face.vnoise(vec2(Se.mul(STORM.topF[0]), 3.1)).mul(STORM.topA[0]).add(face.vnoise(vec2(Se.mul(STORM.topF[1]), 7.3)).mul(STORM.topA[1])).add(1.0).mul(H));
        const B = billows(face.domes, S, Yb.mul(STORM.bFlat)).toVar();
        B.z.assign(B.z.mul(STORM.bFlat));
        // signed metres inside the top edge; the billows push it in and out
        const e = Ht.sub(Ye).add(B.w.sub(0.4).mul(STORM.bulge)).toVar();
        Ht.assign(Ht.add(B.w.sub(0.4).mul(STORM.bulge)));
        const pxm = face.px.mul(ts).toVar();
        edgeA.assign(clamp(e.div(max(pxm, 2.0)).add(0.5), 0.0, 1.0));
        const tilt = exp(max(e, 0.0).negate().div(STORM.tiltR)).mul(STORM.tilt);
        const N = normalize(vec3(B.y.mul(-STORM.depthN), B.z.mul(-STORM.depthN).add(tilt), 1.0)).toVar();
        const occ0 = smoothstep(0.12, 0.72, B.x).mul(1.0 - STORM.occLo).add(STORM.occLo);
        const occ = mix(occ0, occ0.mul(0.45).add(0.55), float(1.0).sub(smoothstep(300.0, 3000.0, ts))).toVar();
        const dens = smoothstep(0.0, Ht.mul(0.7), Ye).mul(0.65).add(0.35).toVar();   // darker, denser low
        const rimBand = exp(max(e, 0.0).negate().div(STORM.rimW)).toVar();
        const lit = (Ld, C) => {
          const Lw = vec3(dot(Ld.xz, Pp), Ld.y, dot(Ld.xz, W).mul(fsg)).toVar();
          // a sun behind the face: the dust is translucent, so the light wraps far round each lobe
          // (no hard crescents) and glows through the body near its top
          const back = max(Lw.z.negate(), 0.0).toVar();
          const wr = back.mul(0.65).add(STORM.wrap);
          const diff = max(dot(N, Lw).add(wr).div(wr.add(1.0)), 0.0).mul(float(1.0).sub(back.mul(0.55)));
          const fwd = pow(max(dot(rd, Ld), 0.0), 4.0).toVar();
          const rim = rimBand.mul(back).mul(fwd).mul(3.0);
          const thru = back.mul(fwd).mul(exp(max(e, 0.0).negate().div(140.0))).mul(0.5);
          return C.mul(diff.mul(occ).mul(dens.mul(0.5).add(0.5)).add(rim).add(thru));
        };
        // redder and darker toward the base
        const red = mix(vec3(0.7, 0.46, 0.32), vec3(1.0), smoothstep(0.0, 260.0, Ye));
        const skyLit = N.y.mul(0.35).add(0.65).mul(occ.mul(0.5).add(0.5));
        cWall.assign(SU.wallBase.mul(red).mul(dens).mul(skyLit)
          .add(lit(SU.sun1, SU.wallSun1)).add(lit(SU.sun2, SU.wallSun2)));
        // a near face towers: it goes dark and red from the base up and only its top keeps the light,
        // and the creases between lobes soften (lead's change: up close the pale, evenly lit face
        // read as cracked plaster). A far face on the horizon is unchanged.
        const near = float(1.0).sub(smoothstep(300.0, 3000.0, ts)).toVar();
        const up = smoothstep(0.0, Ht.mul(0.95), Ye).toVar();
        const tower = mix(vec3(0.3, 0.2, 0.13), vec3(1.0, 0.97, 0.92), up.mul(up));
        cWall.assign(cWall.mul(mix(vec3(1.0), tower, near)));
        // a faint warm glow inside it, low down, breathing slowly
        const gl = face.vnoise(vec2(S.div(90.0), Yb.div(45.0).add(t.mul(0.03)))).mul(0.4).add(0.6);
        cWall.addAssign(SU.glowCol.mul(exp(max(Ye, 0.0).negate().div(110.0))).mul(gl));
        // haze between the eye and a far face, and the base dissolving into the blown dust
        cWall.assign(mix(cWall, SU.horizon, float(1.0).sub(exp(ts.div(-7000.0)))));
        cWall.assign(mix(cWall, SU.hazeCol, float(1.0).sub(smoothstep(-10.0, 150.0, Ye)).mul(smoothstep(250.0, 1500.0, ts))));
      });
    }
    const cS = face ? mix(cWall, cIn, float(1.0).sub(smoothstep(12.0, 110.0, ts))) : cIn;

    // optical depth through the slab, from the eye to the end of the ray or the top, whichever first
    const tTop = select(rd.y.greaterThan(1e-4), Ht.sub(y0).div(max(rd.y, 1e-4)), float(1e9));
    const Lm = max(min(L, tTop), 0.0).toVar();
    const flat = abs(ru).lessThan(1e-3);
    const x0l = lead.sub(u0).div(El), x1l = lead.sub(u0.add(ru.mul(Lm))).div(El);
    const Il = select(flat, clamp(x0l, 0.0, 1.0).mul(Lm), El.div(ru).mul(Fi(x0l).sub(Fi(x1l))));
    const x0t = u0.sub(trail).div(Et), x1t = u0.add(ru.mul(Lm)).sub(trail).div(Et);
    const It = select(flat, clamp(x0t, 0.0, 1.0).mul(Lm), Et.div(ru).mul(Fi(x1t).sub(Fi(x0t))));
    const sig = SU.geo.z, DC = SU.geo.w;
    // the clear pocket round the eye: density ramps up from nothing over DC metres
    const Lb = min(Lm, DC);
    const tau = max(Il.add(It).sub(Lm).sub(kc.mul(Lb.sub(Lb.mul(Lb).div(DC.mul(2.0))))), 0.0).mul(sig).toVar();
    const aS = float(1.0).sub(exp(tau.negate())).mul(mix(edgeA, float(1.0), kc)).mul(SU.geo.y).toVar();
    col.assign(mix(col, cS, aS));

    // the blown dust ahead of the leading face and behind the trailing one (exponential in distance
    // from the face and in height above the visitor's ground; closed-form along the ray)
    // region sg * (u - c) > 0 (sg +1: downwind of the leading face; -1: upwind of the trailing one),
    // density sgm exp(-sg (u - c) / lam) exp(-y / hazeH), over the part of the ray inside it
    const hz = (sgm, lam, c, sg) => {
      const d0 = u0.sub(c).mul(sg).toVar();             // the eye's depth into the region (m)
      const dr = ru.mul(sg).toVar();                    // ... and its rate along the ray
      const tc = d0.negate().div(select(abs(dr).lessThan(1e-5), float(1e-5), dr)).toVar();   // where the ray crosses the face
      const tIn = select(d0.greaterThan(0.0), float(0.0), select(dr.greaterThan(0.0), tc, L)).toVar();
      const tOut = select(d0.greaterThan(0.0), select(dr.lessThan(0.0), min(tc, L), L), L).toVar();
      const len = max(tOut.sub(tIn), 0.0).toVar();
      const b = dr.div(lam).negate().sub(rd.y.div(STORM.hazeH)).toVar();
      const e0 = min(d0.add(dr.mul(tIn)).div(lam).negate().sub(y0.add(rd.y.mul(tIn)).div(STORM.hazeH)), 4.0);
      // e^e0 (e^(b len) - 1) / b, without the cancellation when b len is small
      const bl = b.mul(len).toVar();
      const g = select(abs(bl).lessThan(1e-3), len.mul(bl.mul(0.5).add(1.0)), exp(min(bl, 8.0)).sub(1.0).div(select(abs(b).lessThan(1e-9), float(1e-9), b)));
      return sgm.mul(exp(e0)).mul(max(g, 0.0));
    };
    // a haze that lies beyond the slab (the eye inside it, or on its far side) shows only through it
    const tauH = hz(SU.haze.x, SU.haze.y, lead, 1.0).mul(select(u0.greaterThan(lead), float(1.0), float(1.0).sub(aS)))
      .add(hz(SU.haze.z, SU.haze.w, trail, -1.0).mul(select(u0.lessThan(trail), float(1.0), float(1.0).sub(aS)))).toVar();
    const cH = SU.hazeCol.add(SU.sunIn1.mul(pow(max(dot(rd, SU.sun1), 0.0), 5.0).mul(1.5))).add(SU.sunIn2.mul(pow(max(dot(rd, SU.sun2), 0.0), 5.0).mul(1.5)));
    col.assign(mix(col, cH, float(1.0).sub(exp(tauH.negate()))));
    });
    const L = L0, sig = sig0, DC = DC0, kc = kc0;

    // the lantern's glow in the dust: single scattering of a point light along the ray, dimmed by
    // the dust between (the pocket's optical depth at the closest point, and the light's own way)
    if (lamp) {
      If(lamp.pos.w.greaterThan(0.0).and(SU.halo.greaterThan(0.0)), () => {
        const v = lamp.pos.xyz.sub(ro).toVar();
        const t0 = dot(v, rd).toVar();
        const h = sqrt(max(dot(v, v).sub(t0.mul(t0)), 0.0064)).toVar();
        const Lc = min(L, t0.add(40.0));
        const I = atan(Lc.sub(t0), h).sub(atan(t0.negate(), h)).div(h);
        const tc = clamp(t0, 0.0, 40.0);
        const tauC = select(tc.lessThan(DC), tc.mul(tc).div(DC.mul(2.0)), tc.sub(DC.mul(0.5))).mul(sig).mul(kc).add(h.mul(sig).mul(kc).mul(0.5));
        col.addAssign(lamp.col.mul(lamp.pos.w).mul(SU.halo).mul(I).mul(exp(tauC.negate())).mul(1.0 / (4.0 * Math.PI)));
      });
    }
  });
  return col;
}

// ---------------------------------------------------------------- the state machine (JS)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// the leading face's distance upwind during the approach and arrival: A e^(-t / tau) - B through
// (0, D0), (75, Dlast), (83, Dend): it creeps up from the horizon and looms at the end (about 60 m/s
// over the last 300 m)
const DFIT = (() => {
  const t1 = STORM.dur.approach, t2 = t1 + STORM.dur.arrival, D0 = STORM.D0, D1 = STORM.Dlast, D2 = STORM.Dend;
  let lo = 5, hi = 400;
  const r = (tau) => (Math.exp(-t1 / tau) - Math.exp(-t2 / tau)) / (1 - Math.exp(-t1 / tau)) - (D1 - D2) / (D0 - D1);
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (r(m) > 0) hi = m; else lo = m; }
  const tau = (lo + hi) / 2, A = (D0 - D1) / (1 - Math.exp(-t1 / tau));
  return { tau, A, B: A - D0 };
})();
const Dlead = (t) => DFIT.A * Math.exp(-t / DFIT.tau) - DFIT.B;

// the storm's geometry at phase time (all at scale 1): leading and trailing face (m along the wind,
// + downwind, from the visitor), wall opacity, top height factor
function geometry(phase, t) {
  const D = STORM.dur;
  if (phase === 'approach' || phase === 'arrival') {
    const tt = phase === 'approach' ? t : D.approach + t;
    const lead = -Dlead(tt);
    return { lead, trail: lead - STORM.depth, wall: sstep(0, 6, tt), top: 1 };
  }
  const leadEnd = -STORM.Dend, trail0 = leadEnd - STORM.depth;
  if (phase === 'inside') {
    const f = t / D.inside;
    const trail = lerp(trail0, -STORM.Et, f);
    return { lead: trail + STORM.depth, trail, wall: 1, top: 1 };
  }
  if (phase === 'passing') {
    const trail = lerp(-STORM.Et, 420, t / D.passing);
    return { lead: trail + STORM.depth, trail, wall: 1, top: 1 };
  }
  // after: the wall leaves downwind, sinking and fading into the haze over its last 25 s
  const trail = 420 + 38 * t + 0.6 * t * t;
  return { lead: trail + STORM.depth, trail, wall: 1 - sstep(D.after - 25, D.after, t), top: 1 - 0.55 * sstep(D.after - 30, D.after, t) };
}

export function createStorm({ reduced = false, seed = null, mode = null, testMode = false } = {}) {
  const rnd = mulberry32(seed != null ? seed : (Math.random() * 4294967296) >>> 0);
  const fast = mode === 'fast';
  const st = {
    phase: 'none', t: 0, scale: fast ? 4 : 1, clock: 0, next: null, hold: false,
    k: 0, pre: 0, after: 0, gust: 0.5, gustT: rnd() * 100, boom: 0, drift: 0, airPh: 0,
    lead: -1e5, trail: -1e5 - STORM.depth, wall: 0, top: 1, haze: 0, sunCover: [0, 0], cleared: 0, ended: false,
  };
  const off = mode === 'off';
  function schedule(first) {
    if (off) { st.next = null; return; }
    if (testMode && !mode) { st.next = null; return; }
    if (mode === 'now' && first) { st.next = STORM.nowDelay; return; }
    const lo = first ? STORM.firstMin : STORM.gapMin, hi = first ? STORM.firstMax : STORM.gapMax;
    st.next = st.clock + lerp(lo, hi, rnd()) / st.scale;
  }
  schedule(true);

  function start({ scale } = {}) {
    if (scale) st.scale = scale;
    st.phase = 'approach'; st.t = 0; st.next = null; st.cleared = 0;
  }
  function skipTo(phase) {
    if (phase === 'none') { st.phase = 'none'; st.t = 0; st.ended = true; schedule(false); return; }
    if (!STORM.phases.includes(phase)) return;
    st.phase = phase; st.t = 0; st.next = null;
  }

  // one frame. Returns events: { cleared: true } when the inside ends (the caller wipes the trace)
  function update(dt) {
    const ev = {};
    st.clock += dt;
    if (st.phase === 'none') {
      if (st.next !== null && st.clock >= st.next) start();
    } else if (!st.hold) {
      st.t += dt * st.scale;
      const d = STORM.dur[st.phase];
      if (st.t >= d) {
        const i = STORM.phases.indexOf(st.phase);
        if (st.phase === 'inside') ev.cleared = true;
        st.t -= d;
        if (i + 1 < STORM.phases.length) st.phase = STORM.phases[i + 1];
        else { st.phase = 'none'; st.t = 0; ev.ended = true; schedule(false); }
      }
    }
    if (ev.cleared) st.cleared++;
    // geometry
    if (st.phase !== 'none') {
      const g = geometry(st.phase, Math.min(st.t, STORM.dur[st.phase]));
      st.lead = g.lead; st.trail = g.trail; st.wall = g.wall; st.top = g.top;
    } else { st.lead = -1e5; st.trail = -1e5 - STORM.depth; st.wall = 0; st.top = 1; }
    // the dust at the visitor: k in the slab (its two ramps), haze ahead of / behind it
    const rl = clamp01(st.lead / STORM.El), rt = clamp01(-st.trail / STORM.Et);
    st.k = st.phase === 'none' ? 0 : clamp01(rl + rt - 1);
    st.haze = st.phase === 'none' ? 0 : Math.max(st.lead < 0 ? Math.exp(st.lead / STORM.lamLead) : 0, st.trail > 0 ? 0.5 * Math.exp(-st.trail / STORM.lamTrail) : 0);
    // the approach's build-up (drift, wind, ochre), and the after's tail
    const D = STORM.dur;
    st.pre = st.phase === 'approach' ? sstep(0, D.approach, st.t) : st.phase === 'arrival' || st.phase === 'inside' ? 1 : st.phase === 'passing' ? 1 - sstep(0, D.passing, st.t) : 0;
    st.after = st.phase === 'passing' ? sstep(0, D.passing, st.t) : st.phase === 'after' ? 1 - sstep(0, D.after, st.t) : 0;
    // gusts: 3 to 8 s swells (none under reduced motion: a steady storm)
    st.gustT += dt;
    const gt = st.gustT;
    st.gust = reduced ? 0.5 : clamp01(0.5 + 0.3 * Math.sin(gt * 2 * Math.PI / 4.1) * Math.sin(gt * 2 * Math.PI / 13.7 + 0.8) + 0.22 * Math.sin(gt * 2 * Math.PI / 6.7 + 1.3) + 0.12 * Math.sin(gt * 2 * Math.PI / 3.1 + 0.4));
    if (!reduced) { st.drift += dt; st.airPh += dt * (1 + 1.5 * st.k) * (0.7 + 0.6 * st.gust); }
    // the camera's boom (eased over about 3 s)
    st.boom += (st.k - st.boom) * (1 - Math.exp(-dt / 1.0));
    if (st.phase === 'none' && st.boom < 1e-3) st.boom = 0;
    return ev;
  }

  // the visibility now (m): gusts thin and thicken it
  const visNow = () => STORM.vis * (1 + 0.16 * (st.gust - 0.5) * 2 * (reduced ? 0 : 1));
  const sigmaNow = () => { const V = visNow(); return (6 * STORM.dc) / (V * V); };
  // optical depth from the eye to d metres, at the camera (k at the camera)
  function tauAt(d, kc = st.k) {
    const s = sigmaNow(), DC = STORM.dc;
    return kc * s * (d < DC ? (d * d) / (2 * DC) : d - DC / 2);
  }

  // per frame: write the uniforms. base: the time's current values { sun1Col, sun2Col, sun1Dir,
  // sun2Dir, ambSky, horizon, zenith }; at: the visitor { x, ground, z }; cam: the camera position
  function apply(base, at, cam) {
    const on = st.phase !== 'none';
    SU.on.value = on ? 1 : 0;
    if (!on) { SU.halo.value = 0; SU.air.value.set(0, 0, 0, 0); return; }
    SU.org.value.set(at.x, at.ground, at.z);
    SU.front.value.set(st.lead, st.trail, STORM.El, STORM.Et);
    // the k the shaders' clear pocket needs is the one at the camera (5 to 12 m from the visitor)
    const cu = (cam[0] - at.x) * WX + (cam[2] - at.z) * WZ;
    const kc = clamp01(clamp01((st.lead - cu) / STORM.El) + clamp01((cu - st.trail) / STORM.Et) - 1);
    SU.geo.value.set(STORM.H * st.top, st.wall, sigmaNow(), STORM.dc);
    SU.shape.value.set(Math.min(1200, Math.max(0, -st.lead) * STORM.bend), Math.min(1200, Math.max(0, st.trail) * STORM.bend), reduced ? 0 : st.drift, kc);
    // deep inside: the eye in the slab's flat middle and both soft edges more than 30 m off (the dust
    // is opaque well before that: 30 m of it is an optical depth of about 30)
    SU.mode.value.x = kc >= 0.9999 && st.lead - cu > STORM.El + 30 && cu - st.trail > STORM.Et + 30 ? 1 : 0;
    SU.haze.value.set(STORM.hazeLead, STORM.lamLead, STORM.hazeTrail * (1 - st.after * 0.3), STORM.lamTrail);
    // colours, from the light that is around (the clear-air values of this time of day)
    const s1 = base.sun1Col, s2 = base.sun2Col, d1 = base.sun1Dir, d2 = base.sun2Dir;
    const E = [0, 1, 2].map((i) => s1[i] * Math.max(d1[1], 0.04) * 0.8 + s2[i] * Math.max(d2[1], 0.02) * 0.8 + base.ambSky[i] * 0.6 + base.horizon[i] * 0.35);
    const dust = [0.62, 0.33, 0.13];
    const lit = E.map((e, i) => e * dust[i]);
    // inside: lit from above through hundreds of metres of dust; a floor so it never goes black
    const inside = lit.map((c, i) => c * 0.24 + [0.010, 0.0045, 0.002][i]);
    SU.medIn.value.set(...inside);
    SU.wallBase.value.set(...lit.map((c, i) => c * 0.42 * [1, 0.9, 0.75][i]));
    const onWall = (s, d) => (d[1] > -0.02 ? s.map((c, i) => c * 0.26 * Math.min(1, Math.max(0, (Math.asin(Math.max(-1, Math.min(1, d[1]))) / DEG + 1) / 4)) * [1, 0.62, 0.32][i]) : [0, 0, 0]);
    SU.wallSun1.value.set(...onWall(s1, d1)); SU.wallSun2.value.set(...onWall(s2, d2));
    const dim = (s) => s.map((c, i) => c * 0.05 * [1, 0.7, 0.4][i]);
    SU.sunIn1.value.set(...dim(s1)); SU.sunIn2.value.set(...dim(s2));
    SU.hazeCol.value.set(...lit.map((c, i) => c * 0.85 + base.horizon[i] * 0.25));
    SU.glowCol.value.set(...lit.map((c, i) => c * [0.5, 0.28, 0.12][i] * 0.6));
    SU.horizon.value.set(...base.horizon);
    SU.sun1.value.set(...d1); SU.sun2.value.set(...d2);
    SU.halo.value = STORM.halo * st.k;
    // the drift: stronger in the approach (to 2.5x) and the after's tail, the storm's fast layer inside
    SU.air.value.set(1.5 * Math.max(st.pre, st.after) + 2.5 * st.k, st.k * (0.7 + 0.5 * st.gust), st.airPh, 0);
    // is a sun behind the wall (seen from the visitor)? Only an upwind sun, low enough
    const cover = (d) => {
      const h = Math.hypot(d[0], d[2]) || 1, toward = -(d[0] * WX + d[2] * WZ) / h;
      if (st.lead > 0 || toward <= 0.02) return 0;
      const th = -st.lead / toward, y = (d[1] / h) * th;
      return sstep(-40, 40, STORM.H * st.top - y) * st.wall;
    };
    st.sunCover = [cover(d1), cover(d2)];
  }

  // a uniform on its way from the time of day to the shaders: dimmed and tinted by the storm.
  // Identity when no storm is active (the caller does not call it then).
  function modify(name, v) {
    const k = st.k, pre = st.pre * (1 - k), aft = st.after * (1 - k);
    const ochre = Math.max(0.55 * pre, 0.35 * aft);
    const m = /^uSun(\d)(Col|Sky|Glow)$/.exec(name);
    if (m) {
      const n = +m[1], cov = st.sunCover[(n - 1) % 2];
      const thru = lerp(1, STORM.sunInside, k) * (1 - 0.85 * cov) * (1 - 0.25 * st.haze * (1 - k));
      if (m[2] === 'Col') return v.map((c, i) => c * thru * lerp(1, [1, 0.8, 0.55][i], ochre));
      if (m[2] === 'Sky') return [v[0], v[1], v[2] * lerp(1, 0.15, k) * (1 - cov), v[3]];
      return [v[0] * lerp(1, 0.3, k) * (1 - cov), v[1] * lerp(1, 0.3, k) * (1 - cov), v[2], v[3]];
    }
    const med = SU.medIn.value;
    if (name === 'uAmbSky') return v.map((c, i) => lerp(c * lerp(1, [1.05, 0.85, 0.6][i], ochre), med.getComponent(i) * 1.5, k));
    if (name === 'uAmbGround') return v.map((c, i) => lerp(c, med.getComponent(i) * 0.8, k));
    if (name === 'uHorizon' || name === 'uZenith') {
      const dust = SU.hazeCol.value, w = name === 'uHorizon' ? 0.55 : 0.25;
      return v.map((c, i) => lerp(lerp(c, dust.getComponent(i), w * ochre), med.getComponent(i), k));
    }
    if (name === 'uFill') return v * (1 - k);
    return v;
  }

  return {
    STORM, update, apply, modify, start, skipTo, tauAt, visNow,
    setHold(h) { st.hold = !!h; },
    get active() { return st.phase !== 'none'; },
    get k() { return st.k; },
    get boom() { return st.boom; },
    get phase() { return st.phase; },
    get state() { return st; },
    // the walker's, figure's and sound's share of the storm
    get wind() { return Math.max(st.k, 0.35 * st.pre * (1 - st.k), 0.25 * st.after); },
    get gust() { return st.gust; },
    get erase() {
      if (st.phase === 'inside' && st.t > STORM.dur.inside - 6) return STORM.eraseLast;
      return 1 + (STORM.erase - 1) * st.k;
    },
  };
}

// ---------------------------------------------------------------- the sand racing past (sprites)
// Streaks (thin, fast, near) and sheets (broad, faint, a little slower), in a box round the camera
// in the wind's frame; they leave on the downwind side and come back on the upwind side, 16 m off
// where the dust hides them. One instanced Sprite, simulated on the CPU like puffs.js. Each sprite's
// opacity carries the dust between it and the eye (worked out per sprite), so nothing pops.
// Reduced motion: no streaks; the sheets stand still (a still veil).
export function createStormSand({ U, shade, scene, storm, reduced = false }) {
  const NS = 200, NH = 20, N = NS + NH, R = 16;
  const aces = (x) => clamp(x.mul(x.mul(2.51).add(0.03)).div(x.mul(x.mul(2.43).add(0.59)).add(0.14)), 0.0, 1.0);
  const srgb = (c) => mix(c.mul(12.92), pow(c, vec3(1.0 / 2.4)).mul(1.055).sub(0.055), step(vec3(0.0031308), c));
  const finish = (col) => srgb(aces(col.mul(U.uExposure)));
  const posA = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  const datA = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);   // scale x, scale y, alpha, seed
  const rotA = new THREE.InstancedBufferAttribute(new Float32Array(N * 2), 2);   // rotation, kind (0 streak, 1 sheet)
  for (const a of [posA, datA, rotA]) a.setUsage(THREE.DynamicDrawUsage);
  const P = instancedDynamicBufferAttribute(posA, 'vec3');
  const D = instancedDynamicBufferAttribute(datA, 'vec4');
  const Rt = instancedDynamicBufferAttribute(rotA, 'vec2');
  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  mat.positionNode = P;
  mat.scaleNode = D.xy;
  mat.rotationNode = Rt.x;
  const sheet = Rt.y;
  mat.opacityNode = Fn(() => {
    const q = uv().sub(0.5).mul(2.0).toVar();
    // a streak: a thin line, tapered at both ends, a little grainy along it
    const line = exp(q.y.mul(q.y).mul(-9.0)).mul(float(1.0).sub(smoothstep(0.35, 1.0, abs(q.x)))).toVar();
    const grain = hash(floor(uv().x.mul(28.0)).add(D.w.mul(997.0))).mul(0.6).add(0.4);
    // a sheet: a soft, torn veil
    const veil = float(0.0).toVar();
    If(sheet.greaterThan(0.5), () => {
      const n1 = mx_noise_float(vec3(q.mul(vec2(1.4, 2.2)), D.w.mul(19.0))).mul(0.5).add(0.5);
      const env = exp(q.x.mul(q.x).mul(-2.0).add(q.y.mul(q.y).mul(-3.5))).mul(float(1.0).sub(smoothstep(0.75, 1.0, length(q))));
      veil.assign(env.mul(smoothstep(0.3, 0.8, n1)));
    });
    return mix(line.mul(grain), veil, sheet).mul(D.z);
  })();
  const { uLamp, uLampCol } = shade;
  mat.colorNode = Fn(() => {
    // the dust's own light, a little brighter in a streak (sand caught in it) and darker in a sheet
    const base = SU.medIn.mul(mix(float(1.45), float(0.75), sheet));
    const dv = uLamp.xyz.sub(P).toVar();
    const lamp = uLampCol.mul(uLamp.w).div(dot(dv, dv).add(0.3)).mul(mix(float(0.5), float(0.25), sheet));
    return finish(base.add(lamp).add(U.uAmbGround.mul(0.2)));
  })();
  const sprite = new THREE.Sprite(mat);
  sprite.count = N;
  sprite.frustumCulled = false;
  sprite.renderOrder = 3;
  sprite.visible = false;
  scene.add(sprite);

  const rnd = (() => { let s = 7654321; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
  const ps = [];
  const respawn = (p, a, cam, edge) => {
    // a: along-wind offset from the camera (m), across random; height above the sand under it
    p.a = a; p.c = (rnd() * 2 - 1) * R;
    p.h = p.sheet ? 0.25 + 2.4 * rnd() * rnd() : 0.04 + 2.6 * Math.pow(rnd(), 2.2);
    p.x = cam[0] + WX * p.a - WZ * p.c; p.z = cam[2] + WZ * p.a + WX * p.c;
    p.g = height(p.x, p.z); p.gAge = 0;
    if (!edge) p.seed = rnd();
  };
  for (let i = 0; i < N; i++) {
    const sheetK = i >= NS;
    ps.push({ sheet: sheetK, speed: sheetK ? 10 + 5 * rnd() : 14 + 9 * rnd(), len: sheetK ? 2.5 + 3.5 * rnd() : 0.45 + 1.0 * rnd(),
      thick: sheetK ? 0.6 + 1.2 * rnd() : 0.012 + 0.02 * rnd(), alpha: sheetK ? 0.24 + 0.16 * rnd() : 0.4 + 0.4 * rnd(), wob: rnd() * 6.28, init: false, seed: rnd() });
  }
  let live = 0, frame = 0;
  function update(dt, camera) {
    const k = storm.k;
    if (k <= 0.002) { if (sprite.visible) { sprite.visible = false; for (const p of ps) p.init = false; } live = 0; return; }
    sprite.visible = true;
    const cam = [camera.position.x, camera.position.y, camera.position.z];
    const g = storm.gust;
    const pa = posA.array, da = datA.array, ra = rotA.array;
    const ce = camera.matrixWorldInverse.elements, pe = camera.projectionMatrix.elements;
    const proj = (x, y, z) => {
      const vx = ce[0] * x + ce[4] * y + ce[8] * z + ce[12], vy = ce[1] * x + ce[5] * y + ce[9] * z + ce[13], vz = ce[2] * x + ce[6] * y + ce[10] * z + ce[14];
      const w = -vz || 1e-3; return [(pe[0] * vx) / w, (pe[5] * vy) / w, -vz];
    };
    const aspect = camera.aspect || 1;
    frame++;
    live = 0;
    for (let i = 0; i < N; i++) {
      const p = ps[i];
      if (!p.init) { respawn(p, (rnd() * 2 - 1) * R, cam, false); p.init = true; }
      const sp = p.speed * (0.75 + 0.5 * g) * k;
      if (!reduced) {
        p.x += WX * sp * dt; p.z += WZ * sp * dt;
        p.wob += dt * (p.sheet ? 0.7 : 2.3);
      }
      // the box follows the camera: out of it on one side, back in on the other (in the dust)
      const rx = p.x - cam[0], rz = p.z - cam[2];
      const a = rx * WX + rz * WZ, c = -rx * WZ + rz * WX;
      if (a > R) respawn(p, a - 2 * R, cam, true);
      else if (a < -R) respawn(p, a + 2 * R, cam, true);
      else if (c > R || c < -R) { p.c = c > R ? c - 2 * R : c + 2 * R; p.a = a; p.x = cam[0] + WX * p.a - WZ * p.c; p.z = cam[2] + WZ * p.a + WX * p.c; p.g = height(p.x, p.z); p.gAge = 0; }
      // the sand under it, refreshed every few frames (a quarter of the pool a frame)
      if ((i + frame) % 4 === 0) p.g = height(p.x, p.z);
      const y = p.g + p.h + (reduced ? 0 : 0.05 * Math.sin(p.wob));
      const dx = p.x - cam[0], dy = y - cam[1], dz = p.z - cam[2], d = Math.hypot(dx, dy, dz);
      // the dust between it and the eye; none right at the lens; streaks only where the wind is
      // strong (none under reduced motion)
      const T = Math.exp(-storm.tauAt(d));
      const near = sstep(0.7, 2.0, d);
      let al = p.alpha * T * near * k * (p.sheet ? 0.8 + 0.4 * g : 0.6 + 0.6 * g);
      if (p.sheet ? false : reduced) al = 0;
      if (p.sheet && reduced) al *= 0.8;
      // on screen: stretched along the motion (sheets and streaks run along the wind)
      const p0 = proj(p.x, y, p.z), p1 = proj(p.x + WX * 0.1, y, p.z + WZ * 0.1);
      const sx = (p1[0] - p0[0]) * aspect, sy = p1[1] - p0[1];
      const rot = Math.hypot(sx, sy) > 1e-6 ? Math.atan2(sy, sx) : 0;
      // seen end-on (looking along the wind) a streak is short: its length on screen follows the
      // motion's share across the view
      const across = Math.min(1, Math.hypot(sx, sy) / (0.1 / Math.max(p0[2], 0.1) * 1.2) + 0.15);
      const len = p.sheet ? p.len * (0.55 + 0.45 * across) : p.len * across;
      if (p0[2] < 0.2) al = 0;
      if (al > 0.002) live++;
      pa[i * 3] = p.x; pa[i * 3 + 1] = y; pa[i * 3 + 2] = p.z;
      da[i * 4] = Math.max(len, p.thick * 2); da[i * 4 + 1] = p.thick; da[i * 4 + 2] = al; da[i * 4 + 3] = p.seed;
      ra[i * 2] = rot; ra[i * 2 + 1] = p.sheet ? 1 : 0;
    }
    posA.needsUpdate = datA.needsUpdate = rotA.needsUpdate = true;
  }
  function clear() { for (const p of ps) p.init = false; sprite.visible = false; }
  return { update, clear, sprite, get live() { return live; } };
}

// for pilgrim.js and puffs.js: the storm over a surface point P (world), as seen from the camera
export function stormFog(col, P, lamp = null) {
  const toP = P.sub(cameraPosition).toVar();
  const d = max(length(toP), 1e-3).toVar();
  return stormApply(col, { ro: cameraPosition, rd: toP.div(d), dist: d, lamp });
}
