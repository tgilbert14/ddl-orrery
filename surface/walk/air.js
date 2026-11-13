// Dust Sea walk: calm air that is alive. A faint drift of sand low over the ground, along the wind,
// drawn in the ground shader (tsl-material.js opts.walk.air): no particles, no ribbons.
//
// The drift is a thin, lit veil whose density is soft noise stretched along the wind (7 m along,
// about 2 m across: broad tongues, never strands) and carried downwind at two speeds, gated by slow
// gust patches. The wind lifts sand where the ground faces into it and on crests; the lee of a slip
// face is still. Seen at a graze the layer is thicker, so it gathers toward the middle distance and
// thins under your feet; far off it averages to an even faint veil (no aliasing). Reduced motion
// freezes its clock (uTime), so it is a still veil.
//
// The storm front (storm.js, SU.air) strengthens it: x adds to the veil's strength (2.5x by the end of
// the approach, easing back over a minute after), and inside the storm a second, denser and faster
// layer of streaming sand (y its strength, z its own clock, which reduced motion freezes). With no
// storm the branch is not taken and the colour is as before.

import { vec2, float, clamp, smoothstep, max, mix, dot, pow, If } from 'three/tsl';
import { G, DEG } from '../look-test/params.js';
import { SU } from './storm.js';

export const AIR = {
  speed1: 1.3, speed2: 2.2, speedGust: 0.7,  // downwind drift (m/s) of the two octaves and the gusts
  along1: 7.0, across1: 2.0,                 // noise scales (m)
  along2: 3.2, across2: 1.1,
  gust: 26,                                  // gust patch scale (m)
  opacity: 0.075,                            // at full density, seen face on
  grazeMax: 3.2,                             // at a graze the layer reads up to this much thicker
  far0: 30, far1: 110,                       // the pattern averages out between these distances (m) ...
  farMean: 0.12,                             // ... to this faint, even veil
};

const WX = Math.cos(G.windDeg * DEG), WZ = Math.sin(G.windDeg * DEG);

export function airHook({ col, xz, dist, rd, grad, alb, U, vnoise, sh }) {
  const W = vec2(WX, WZ), P = vec2(-WZ, WX);
  const a = dot(xz, W).toVar(), c = dot(xz, P).toVar();
  const t = U.uTime;
  const n1 = vnoise(vec2(a.sub(t.mul(AIR.speed1)).div(AIR.along1), c.div(AIR.across1)));
  const n2 = vnoise(vec2(a.sub(t.mul(AIR.speed2)).div(AIR.along2).add(17.0), c.div(AIR.across2).add(5.0)));
  const gst = vnoise(vec2(a.sub(t.mul(AIR.speedGust)).div(AIR.gust).add(3.0), c.div(AIR.gust * 0.5).add(11.0)));
  const dens = smoothstep(-0.05, 0.85, n1.mul(0.65).add(n2.mul(0.35))).mul(smoothstep(-0.5, 0.5, gst).mul(0.75).add(0.25));
  const far = smoothstep(AIR.far0, AIR.far1, dist);
  const d = mix(dens, AIR.farMean, far);
  // sheltered in the lee of a slip face; a little more where the ground rises into the wind
  const rise = dot(grad, W);
  const expo = float(1.0).sub(smoothstep(0.12, 0.42, rise.negate())).mul(float(0.85).add(smoothstep(0.0, 0.2, rise).mul(0.3)));
  const graze = clamp(float(0.18).div(max(rd.y.negate(), 0.03)), 0.6, AIR.grazeMax);
  const amount = clamp(d.mul(expo).mul(graze).mul(AIR.opacity), 0.0, 0.3);
  // sand in the air: lit by every sun, brightest looking toward one (forward scatter), plus the sky
  const fs = (L, C) => C.mul(pow(max(dot(rd, L), 0.0), 6.0).mul(2.0).add(0.5));
  // the layer is a few tens of centimetres deep: where the ground is in shadow, so is the sand above it
  const lit = alb.mul(fs(U.uSun1Dir, U.uSun1Col.mul(sh[0])).add(fs(U.uSun2Dir, U.uSun2Col.mul(sh[1]))).add(fs(U.uSun3Dir, U.uSun3Col.mul(sh[2]))).add(fs(U.uSun4Dir, U.uSun4Col.mul(sh[3])))
    .add(U.uAmbSky.mul(0.8))).mul(1.15);
  const out = mix(col, lit, amount).toVar();
  If(SU.on.greaterThan(0.5), () => {
    // the approach and the after: the same veil, thicker
    out.assign(mix(out, lit, clamp(d.mul(expo).mul(graze).mul(AIR.opacity).mul(SU.air.x), 0.0, 0.45)));
    // inside: sand streaming along the ground, short dense tongues racing downwind
    If(SU.air.y.greaterThan(0.0), () => {
      const ph = SU.air.z;
      const m1 = vnoise(vec2(a.sub(ph.mul(9.0)).div(2.6), c.div(0.55).add(31.0)));
      const m2 = vnoise(vec2(a.sub(ph.mul(13.0)).div(1.1), c.div(0.3).add(7.0)));
      const dn = smoothstep(-0.2, 0.7, m1.mul(0.6).add(m2.mul(0.4))).mul(float(1.0).sub(smoothstep(4.0, 14.0, dist)).mul(0.7).add(0.3));
      out.assign(mix(out, lit.mul(1.1), clamp(dn.mul(graze).mul(SU.air.y).mul(0.42).mul(expo.mul(0.5).add(0.5)), 0.0, 0.65)));
    });
  });
  return out;
}

