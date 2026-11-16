// Dust Sea walk: the colossus ("The Rising"). Something under the sand, kilometres off, rises across
// the low sun, calls, keels over and dives back under a dome of its own sand. It is known by what the
// ground, the light and the air do: the sun's disc goes behind it while its glare stays round it, its
// shadow comes over the dunes as a front to the Pilgrim until the lantern is the brightest thing
// there is, and the sand pours off it. The body is a dark mass in the haze at its distance, its top
// broken off at a slant and dissolving into the air, its foot in its own dust, a veil of that dust
// round it. No face, eyes, mouth, segments, rim all round, or round top.
// (The playbook's "no other creatures" rule is lifted by the owner for this one colossus only.)
//
// By day it is felt and heard, never seen (the owner's lead, 16 Nov): no body, no veil, no dome and no
// shadow are drawn, blended out by the same sun height the shading uses (seen = 1 - day weight); the
// hush, the swell and its low dust, the sound, the ground wave, the camera and the Pilgrim stay.
//
// Beats (seconds at scale 1; ?colossus=fast runs them at 4x):
//   hush     0-12   the wind ducks, the Pilgrim's hood turns to the bearing, a sub-rumble rises
//   swell   12-35   a swell runs a curved 600 m path toward the breach rolling low sheets of sand; it
//                   ends in a 300 m funnel that sinks over its last 6 s
//   rise    35-55   the column climbs at H/19 m/s to 700-800 m, on the line of the low sun, out of torn
//                   dust and sand falling off its head, sand pouring off its downwind flank; its
//                   shadow's front shows on the far crests from 42 s and slows as it comes: the last
//                   60 m to the Pilgrim take 6 s (it arrives at 59 s); the eclipse eases in over 4 s
//   call    55-68   it sways (a 24 s period, eased out in the fall) and sheds more sand; the call
//                   arrives d/343 s after 57 s
//   fall    68-82   it keels over to the side it leans, across the view, and dives into the sand over
//                   10 s (impact near 79 s); the veil round it eases into a dome of sand 1.4 km wide and
//                   up to 330 m high (a run of uneven heaps) over 3 s, grown in 6 s, surging outward for
//                   18 s, dark at its core and lit where it is thin on its sunward side; the body fades
//                   into it over 2.5 s; a ground wave runs out at 120 m/s; the boom and a small shake
//                   arrive d/343 s later, the Pilgrim braces at the wave
//   settle  82-110  the dome drifts downwind and thins, the sun comes back, the wind returns, the
//                   funnel's scar heals
// The first comes 5 to 8 minutes after the page is ready, then every 12 to 18 minutes (seeded).
// The visitor can call it with the staff: three strikes in time (F or Space, long press on touch),
// the hush 6 to 10 s later; 180 s cooldown, refused during the storm or its quiet.
// ?colossus=now (the hush 6 s after ready, 1.8 km), fast, off, rise (straight to the rise).
//
// Build: the body is one tube (64 rings x 48 sides), rigid along its length: its profile (flutes from
// ridged noise round the ring, stretched 400 m along it, slow uneven shoulders, one heavy shoulder, an
// axis kinked up to 0.2 R, a slanted, cleft top) is fixed to the body from the head down, and so are
// its normals, which each frame only turns with the ring. Its spine is computed in JavaScript and the
// tube written only when it is drawn. Its top is torn into dust by real alpha measured from the head,
// its outline frays by the ring's roundness, its lower third is lost in a skirt of dust and haze; it
// has no depth of its own (nothing is cut out along a hard line, nothing is dithered). The falling
// sand is one instanced Sprite of streaks (turned along their motion on screen, lit per streak in the
// vertex stage), shed on the side toward the eye, faded out when let go. The dome (and before the fall, the veil
// of dust round the body) is one half-ellipsoid mesh whose shader takes the view ray's chord through
// it as its depth. The ground gets the swell, the funnel, the scar and the shadow (closed forms, one
// branch on CU.on); the shadow takes the shadow sun's direct light, most of the fill and most of the
// sky light off the sand. Only the shadow sun's disc is dimmed in the sky, through modify(); its glow
// stays. Everything is hidden or branched off when the colossus is not live, so the calm frame is
// untouched.

import * as THREE from 'three/webgpu';
import { Fn, If, uniform, vec2, vec3, vec4, float, clamp, smoothstep, max, min, mix, abs, exp, pow, dot, length, normalize, sqrt, select,
  uv, cameraPosition, instancedDynamicBufferAttribute, mx_noise_float, positionWorld, normalLocal, attribute, sin, cos, acos, vertexStage } from 'three/tsl';
import { G, DEG, CAM, SKY } from './params.js';
import { height } from './height.js';

const WX = Math.cos(G.windDeg * DEG), WZ = Math.sin(G.windDeg * DEG);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const lumC = (c) => c[0] + c[1] + c[2];

export const COL = {
  phases: ['hush', 'swell', 'rise', 'call', 'fall', 'settle'],
  dur: { hush: 12, swell: 23, rise: 20, call: 13, fall: 14, settle: 28 },
  firstMin: 300, firstMax: 480, gapMin: 720, gapMax: 1080, nowDelay: 6,
  cooldown: 180, quiet: 60,
  dist: [1600, 2200], distNow: 1800, minDist: 1500,
  spanSched: 60, spanCall: 35, jitter: 15,
  // the body: height, radius at the head and at the dune line, buried length; it rises at H/19 m/s
  H: [700, 800], Rhead: 55, Rbase: 120, bury: 90, riseS: 19,
  // on the key sun's line: this far to one side (deg), stepping out 0.25 deg for a clear sightline
  sunOff: 1.2, sunStep: 0.25, sunMax: 8,
  swell: { len: 600, amp: 12, w: 40, bend: 110 },
  funnel: 150,
  // the shadow's front, as its distance from the visitor (s from the hush, m): it shows first on the
  // far lit crests, crosses the mid-ground in about 6 s and climbs the last near slope in about 2.5 s
  // (slowing as it comes: the last 60 m to the Pilgrim take 6 s, so from the start pose, a near crest
  // 49 m off, it is seen crossing the ground to the feet for about 5 s; its terminator is `edge` m wide)
  reach: [[38, 1700], [42, 800], [44, 450], [47, 200], [50, 110], [53, 60], [59, 0], [61, -60], [64, -400]], edge: 25,
  // the dome: full width, height, the height grown in 6 s, the width surging out over 18 s; `blend`:
  // the veil round the body eases into it over this many seconds from the impact (nothing pops)
  dome: { w: 1400, h: 330, grow: 6, surge: 18, k: 0.006, blend: 3 },
  // the veil of its own dust round the body before the fall: half width, height (times the exposed
  // length), density; skirt: how much denser it is low, and how high (m) that low part reaches
  veil: { w: 480, h: 0.95, dens: 0.1, skirt: 2.2, skirtH: 160 },
  // the ground wave: its speed (m/s), its height (m) and width (m) as a travelling ridge on the sand
  wave: 120, waveAmp: 1.0, waveW: 26,
  // from the impact the body fades into its dust over this many seconds (the dome then goes over it)
  bodyFade: 2.5,
  // beat times (s from the hush); cry: the call leaves it (heard d/343 s later)
  T: { swell: 12, swellEnd: 29, funnelEnd: 35, rise: 35, call: 55, cry: 57, fall: 68, impact: 78, settle: 82, back: 88, end: 110 },
  strike: { min: 0.45, max: 1.5, match: 0.35, delay: [6, 10] },
};
const CUM = (() => { let c = 0; const o = {}; for (const p of COL.phases) { o[p] = c; c += COL.dur[p]; } return o; })();

// ---------------------------------------------------------------- uniforms
const V3 = () => new THREE.Vector3(), V4 = () => new THREE.Vector4();
export const CU = {
  on: uniform(0),
  org: uniform(V3()),        // the visitor: x, ground, z
  org2: uniform(V4()),       // x: the radius round the visitor all in the shadow's core (m; 0 none)
  B: uniform(V4()),          // breach x, ground y, z, funnel 0..1
  swA: uniform(V4()),        // swell tail x, z, head x, z
  swB: uniform(V4()),        // amp, half width, plume glow, scar
  s0: uniform(V4()), s1: uniform(V4()), s2: uniform(V4()),   // the spine for the shadow (xyz), w: its radius there
  shL: uniform(V4()),        // the shadow sun's direction (xyz), strength
  shP: uniform(V4()),        // the shadow: disc diameter (rad), the front's reach from the base (m), which sun (0, 1), unused
  ring: uniform(V4()),       // a staff strike's shiver: x, z, radius, amount
  wv: uniform(V4()),         // the ground wave from the impact: x, z, radius, amount
  dust: uniform(V3()),       // the sand's colour in the air
  bodyAmb: uniform(V3()),    // body: its one dark value
  body: uniform(V4()),       // body: sunward lobe gain, day (Lambert) weight, develop 0..1 (reduced motion), haze darkening
  look: uniform(V4()),       // haze share at the base, at the top; the figure's darkening in the shadow; ecl
  card: uniform(V4()),       // the sand: forward lobe gain, albedo, haze share, unused
  cardTint: uniform(V3()),   // the sand's tint (ochre by day)
  dome: uniform(V4()),       // the dome: centre x, y, z, grown 0..1
  domeR: uniform(V4()),      // half width, height, density 0..1, drift time
  tw: uniform(V4()),         // day weight, ember weight, how much of the sun it covers from the eye, veil (0) or dome (1)
  slant: uniform(V4()),      // its top's slanted break: across x, z (signed to the low side), the base x, z
};

// ---- closed forms shared by the ground, the figure and the dome
// the closest approach of the ray P + L t (t >= 0) to the segment A-B: (distance, t, s along A-B)
function segRay(P, L, A, Bp) {
  const d1 = Bp.sub(A).toVar(), r = A.sub(P).toVar();
  const a = max(dot(d1, d1), 1e-3), b = dot(d1, L), c = dot(d1, r), f = dot(L, r);
  const den = max(a.sub(b.mul(b)), 1e-4);
  const s0 = clamp(b.mul(f).sub(c).div(den), 0.0, 1.0);
  const t = max(b.mul(s0).add(f), 0.0).toVar();
  const s = clamp(t.mul(b).sub(c).div(a), 0.0, 1.0).toVar();
  return vec3(length(A.add(d1.mul(s)).sub(P.add(L.mul(t)))), t, s);
}
// the spine's shadow at a ground point P (1 in its core); soft = distance times the disc's diameter
export function shadowAt(P) {
  const L = CU.shL.xyz;
  const one = (A, Bp) => {
    const q = segRay(P, L, A.xyz, Bp.xyz).toVar();
    const W = mix(A.w, Bp.w, q.z), soft = q.y.mul(CU.shP.x).add(20.0);
    const core = float(1.0).sub(smoothstep(W.sub(soft.mul(0.5)), W.add(soft.mul(0.5)), q.x));
    // (and the sand falling round it a wider, partial one)
    const dust = float(1.0).sub(smoothstep(W, W.mul(2.2).add(soft), q.x)).mul(0.5);
    return max(core, dust);
  };
  const s = max(one(CU.s0, CU.s1), one(CU.s1, CU.s2)).toVar();
  const dB = length(P.xz.sub(CU.B.xz));
  return s.mul(float(1.0).sub(smoothstep(CU.shP.y.sub(COL.edge), CU.shP.y, dB))).mul(CU.shL.w);
}
// the dome: the ray ro + rd t (t >= 0) through the half-ellipsoid; returns (chord, entry, exit)
function domeChord(ro, rd) {
  const C = CU.dome.xyz;
  const rad = vec3(CU.domeR.x, CU.domeR.y, CU.domeR.x);
  const o = ro.sub(C).div(rad).toVar(), d = rd.div(rad).toVar();
  const a = max(dot(d, d), 1e-9), b = dot(o, d), c = dot(o, o).sub(1.0);
  const disc = b.mul(b).sub(a.mul(c)).toVar();
  const sq = sqrt(max(disc, 0.0));
  const t0 = b.negate().sub(sq).div(a).toVar(), t1 = b.negate().add(sq).div(a).toVar();
  // the half above its base (a little below the impact's ground)
  const ry = select(abs(rd.y).lessThan(1e-5), float(1e-5), rd.y);
  const tp = C.y.sub(20.0).sub(ro.y).div(ry);
  const e0 = max(select(rd.y.greaterThan(0.0), max(t0, tp), t0), 0.0).toVar();
  const e1 = select(rd.y.lessThan(0.0), min(t1, tp), t1).toVar();
  const ch = max(e1.sub(e0), 0.0).mul(select(disc.greaterThan(0.0), float(1.0), float(0.0)));
  // (h^2: the squared half chord in the unit sphere; the density 1 - r^2 integrates to chord * 2/3 h^2)
  return vec4(ch, e0, e1, max(disc, 0.0).div(a));
}
// the ground hook: the swell, the funnel, the scar, the shadow, a strike's shiver
function groundHook({ col, ro, rd, dist, lit }) {
  If(CU.on.greaterThan(0.5), () => {
    const P = ro.add(rd.mul(dist)).toVar();
    const far = smoothstep(450.0, 650.0, length(P.xz.sub(CU.org.xz)));
    const sunH = normalize(vec2(CU.shL.x, CU.shL.z)).toVar();
    // the swell: a travelling ridge (a capsule from tail to head), lit on its sunward side
    If(CU.swB.x.greaterThan(0.01), () => {
      const A = CU.swA.xy, Hh = CU.swA.zw;
      const ab = Hh.sub(A).toVar();
      const u = clamp(dot(P.xz.sub(A), ab).div(max(dot(ab, ab), 1.0)), 0.0, 1.0).toVar();
      const q = P.xz.sub(A.add(ab.mul(u))).toVar();
      const dq = length(q).toVar();
      const w = CU.swB.y;
      const h = exp(dq.mul(dq).div(w.mul(w)).negate()).mul(u.mul(u)).toVar();
      const slope = q.div(max(dq, 1e-3)).mul(dq.mul(2.0).div(w.mul(w))).mul(h).mul(CU.swB.x);
      const lt = clamp(dot(slope, sunH).negate().mul(5.0), -0.6, 1.4);
      col.mulAssign(float(1.0).add(lt.mul(far)));
      col.addAssign(CU.dust.mul(h.mul(CU.swB.z).mul(0.35).mul(far)));
    });
    // the funnel (sinking: a bowl lit on the side that faces the sun), and the scar it leaves
    const toB = CU.B.xz.sub(P.xz).toVar();
    const rB = length(toB).toVar();
    If(CU.B.w.add(CU.swB.w).greaterThan(0.001).and(rB.lessThan(COL.funnel * 1.5)), () => {
      const bowl = float(1.0).sub(smoothstep(COL.funnel * 0.35, COL.funnel, rB)).mul(CU.B.w).mul(far);
      const face = max(dot(toB.div(max(rB, 1.0)), sunH), 0.0);
      col.mulAssign(mix(float(1.0), face.mul(0.7).add(0.55), bowl.mul(0.75)));
      const sc = float(1.0).sub(smoothstep(COL.funnel * 0.6, COL.funnel * 1.4, rB)).mul(CU.swB.w).mul(far);
      col.mulAssign(float(1.0).sub(sc.mul(0.3)));
    });
    // the ground wave from the impact: a low ridge running out over the dunes at 120 m/s, lit on its
    // sunward face, with a breath of dust on it (by day it is all there is to see of the fall)
    If(CU.wv.w.greaterThan(0.001), () => {
      const toW = P.xz.sub(CU.wv.xy).toVar();
      const rW = length(toW).toVar();
      const x = rW.sub(CU.wv.z).div(COL.waveW).toVar();
      If(abs(x).lessThan(3.0), () => {
        const h = exp(x.mul(x).negate()).toVar();
        const slope = x.mul(-2.0).mul(h).mul(COL.waveAmp / COL.waveW);
        const lt = clamp(dot(toW.div(max(rW, 1.0)), sunH).mul(slope).mul(-6.0), -0.35, 0.5);
        col.mulAssign(float(1.0).add(lt.mul(CU.wv.w)));
        col.addAssign(CU.dust.mul(h.mul(CU.wv.w).mul(0.12)));
      });
    });
    // the shadow, each only inside a cheap bound (the band behind it, away from the sun): the body's
    // takes the shadow sun's direct light off the sand (lit sand falls to the dunes' own shade) and the
    // glow round the sun it stands in, the brightest of the sky light on shaded sand; the dome's, a
    // cloud's shade, smooth over the ground (its depth at the visitor out to the edge of its band)
    If(CU.shL.w.add(CU.shP.w).greaterThan(0.001), () => {
      const sb = float(0.0).toVar(), sd = float(0.0).toVar();
      const rel = P.xz.sub(CU.B.xz).toVar();
      const along = dot(rel, sunH).negate(), lat = abs(rel.x.mul(sunH.y).sub(rel.y.mul(sunH.x)));
      // (round the visitor, inside a radius the script found all in the core, it is the full shadow)
      If(length(P.xz.sub(CU.org.xz)).lessThan(CU.org2.x), () => { sb.assign(CU.shL.w); })
        .ElseIf(CU.shL.w.greaterThan(0.001).and(along.greaterThan(-200.0)).and(lat.lessThan(max(along, 0.0).mul(CU.shP.x).add(COL.Rbase * 2.8))), () => { sb.assign(shadowAt(P)); });
      If(CU.shP.w.greaterThan(0.001), () => {
        const relD = P.xz.sub(CU.dome.xz).toVar();
        const latD = abs(relD.x.mul(sunH.y).sub(relD.y.mul(sunH.x)));
        const wD = CU.domeR.x;
        sd.assign(CU.shP.w.mul(float(1.0).sub(smoothstep(wD.mul(0.25), wD.mul(1.15), latD))).mul(float(1.0).sub(smoothstep(0.0, wD, dot(relD, sunH)))));
      });
      const clear = lit ? float(1.0).sub(lit.fog) : float(1.0);
      if (lit) {
        // inside the shadow the sand loses that sun's direct light, most of the fill from the bright
        // horizon under it (80%) and most of the sky's light (65%); the air over it, in the shadow
        // too, scatters less (the haze over shaded ground a third darker)
        const s = max(sb, sd);
        If(s.greaterThan(0.002), () => {
          const U = lit.U, k = CU.shP.z, n = lit.n;
          const L = normalize(mix(U.uSun1Dir, U.uSun2Dir, k)), C = mix(U.uSun1Col, U.uSun2Col, k), sh = mix(lit.sh[0], lit.sh[1], k);
          const direct = lit.sunOnSand(n, lit.V, lit.alb, L, C, sh, lit.nm, lit.gAmt, lit.wrap);
          // (written unlike the sand's own terms, so a compiler never shares them with the calm path)
          const amb = U.uAmbSky.sub(U.uAmbGround).mul(n.y.mul(0.5).add(0.5)).add(U.uAmbGround).mul(lit.alb);
          const Lf = normalize(vec3(U.uSun1Dir.x, 0.45, U.uSun1Dir.z));
          const lf = max(dot(n, Lf).mul(1.0 / 1.35).add(0.35 / 1.35), 0.0);
          const inShade = mix(float(1.0), float(0.0), lit.sh[0].mul(smoothstep(-0.2, 0.15, dot(U.uSun1Dir, n))));
          const fill = U.uHorizon.mul(lit.alb).mul(lf.mul(lf).mul(inShade).mul(U.uFill));
          const off = direct.add(fill.mul(0.8)).add(amb.mul(0.65));
          col.assign(max(col.sub(off.mul(s).mul(clear)), vec3(0.0)).mul(float(1.0).sub(s.mul(lit.fog).mul(0.33))));
        });
      } else {
        const dk = max(sb, sd).mul(0.6);
        If(dk.greaterThan(0.001), () => { col.mulAssign(float(1.0).sub(dk)); });
      }
    });
  });
  If(CU.ring.w.greaterThan(0.001), () => {
    const P = ro.add(rd.mul(dist));
    const r = length(P.xz.sub(CU.ring.xy));
    const band = exp(r.sub(CU.ring.z).div(0.5).mul(r.sub(CU.ring.z).div(0.5)).negate()).mul(CU.ring.w);
    col.mulAssign(float(1.0).add(band.mul(sin(r.mul(9.0)).mul(0.5).add(0.6)).mul(0.22)));
  });
}
// for the figure and the puffs: the same shadow. The lantern's glass (no lamp given) is its own light
// and is never shaded; the puffs are not either (they are lit dust round the figure's feet).
export function colossusFog(col, P, lamp) {
  if (!lamp) return;
  If(CU.on.greaterThan(0.5).and(CU.shL.w.add(CU.dome.w).greaterThan(0.001)), () => {
    const s = shadowAt(P).toVar();
    s.assign(max(s, CU.shP.w));
    col.mulAssign(float(1.0).sub(s.mul(CU.look.z)));
  });
}

// ---------------------------------------------------------------- the event
export function createColossus({ reduced = false, rnd, mode = null } = {}) {
  const st = {
    phase: 'none', t: 0, tAbs: 0, placed: false, called: false, env: null,
    bearing: 0, dist: 0, B: [0, 0, 0], H: 750, away: [1, 0], across: [0, 1], sunB: 0, sightline: null, side: 1,
    swA: [0, 0], swDir: 1, swSide: 1, impactAt: null, impactP: null, impactD: 0, cut: false,
    spine: [], centres: [], head: [0, 0, 0], hcur: 0, fallPhi: 0, sink: 0, bodyOn: 0, develop: 1, sway: 0,
    inShadow: 0, ecl: 0, rings: 0, calls: 0, booms: 0, lift: 0, brace: 0, waveAt: null,
    strikes: [], clock: 0, strikeRing: null, lastStrike: null,
    shK: 0, shL: null, disc: [1.5 * DEG, 0.45 * DEG], figK: 0.85, dome: null, reach: 0, timeW: { day: 0, ember: 0 },
    // seen: 1 - the day weight (by day it is felt and heard, never seen); ecl1, occ1: the first stage of
    // their easing; focus: the centre of what is happening (the camera turns there); cutTo: under
    // reduced motion, the id of the cut that turns the view to it (0: none)
    seen: 1, ecl1: 0, occE: 0, occ1: 0, focus: null, cutTo: 0, cutN: 0, veilAt: null,
  };
  const jitter = (rnd() * 2 - 1) * COL.jitter;   // the old search's offset from the sun line
  const sideSeed = rnd() < 0.5 ? -1 : 1;          // which side of the sun it stands on (seeded)
  st.leanSide = -sideSeed;                         // it leans back across the sun's disc, never off it

  // the bearing of the lowest sun worth standing across (dusk: the pale sun; day and ember: the red one)
  function keySun(env) {
    const s = env.suns || [[1, 0.1, 0], [1, 0.1, 0]], c = env.cols || [[1, 1, 1], [0, 0, 0]];
    const el = (d) => Math.asin(Math.max(-1, Math.min(1, d[1])));
    let pick = -1, best = -1;
    for (let i = 0; i < 2; i++) { const e = el(s[i]) / DEG; if (e > -0.5 && e <= 8 && lumC(c[i]) > 0 && lumC(c[i]) > best) { best = lumC(c[i]); pick = i; } }
    if (pick < 0) pick = el(s[0]) < el(s[1]) && el(s[0]) > -0.01 ? 0 : 1;
    return { bearing: Math.atan2(s[pick][2], s[pick][0]), dir: s[pick], index: pick };
  }
  // the sun that lights the ground most: its direction casts the shadow
  function shadowSun(suns, cols) {
    let k = 0, best = -1;
    for (let i = 0; i < 2; i++) { const v = lumC(cols[i]) * Math.max(suns[i][1], 0); if (v > best) { best = v; k = i; } }
    return k;
  }
  // the sightline from the eye to a point: the smallest clearance in metres (negative: blocked)
  function clearance(eye, T, from = 40) {
    const dx = T[0] - eye[0], dz = T[2] - eye[2], D = Math.hypot(dx, dz);
    let m = Infinity;
    for (let i = 0; i <= 140; i++) {
      const s = from + (D - 30 - from) * (i / 140), f = s / D;
      const y = eye[1] + (T[1] - eye[1]) * f, g = height(eye[0] + dx * f, eye[2] + dz * f);
      m = Math.min(m, y - g);
    }
    return m;
  }
  // how many rows of dunes the eye sees between itself and a point this far on this bearing (a row: a
  // run of ground in sight that begins past 150 m and ends before the point): two or more read as
  // kilometres; one near crest and then the thing reads as 100 m
  function rowsTo(eye, b, d) {
    const c = Math.cos(b), sn = Math.sin(b);
    let maxA = -1e9, vis = false, rows = 0;
    for (let s = 20; s <= d - 150; s += 8) {
      const a = (height(eye[0] + c * s, eye[2] + sn * s) - eye[1]) / s, v = a > maxA;
      if (v) maxA = a;
      if (v && !vis && s > 150) rows++;
      vis = v;
    }
    return rows;
  }
  function place(o = {}) {
    const E = st.env || { x: 0, z: 0, ground: height(0, 0), cam: [0, height(0, 0) + 1.7, 0], yaw: 0 };
    // (the camera's eye: in third person it stands behind and above the Pilgrim; never under 2.5 m)
    const eye = E.cam ? [E.cam[0], Math.max(E.cam[1], height(E.cam[0], E.cam[2]) + 2.5), E.cam[2]] : [E.x, E.ground + 1.7, E.z];
    const facing = o.bearing !== undefined ? o.bearing * DEG : E.yaw;
    let span = (o.bearing !== undefined ? 0 : st.called ? COL.spanCall : COL.spanSched) * DEG;
    const sun = keySun(E);
    const dists = o.dist ? [Math.max(COL.minDist, o.dist)] : mode === 'now' ? [COL.distNow] : [1600, 1800, 2000, 2200];
    const cand = (b, d) => {
      const x = E.x + Math.cos(b) * d, z = E.z + Math.sin(b) * d, gy = height(x, z);
      const top = clearance(eye, [x, gy + 120, z]);
      const base = clearance(eye, [x, gy + 2, z], 300);
      return { b, d, x, z, gy, top, base, rows: rowsTo(eye, b, d) };
    };
    let p = null, onSun = false;
    const aim0 = sun.bearing + sideSeed * COL.sunOff * DEG;
    // the bearings it may stand on: on the key sun's line, a little to one side, stepping out 0.25
    // degrees for a clear sightline. A scheduled rising always takes the sun's line (the camera turns
    // to it in the hush); a called one when the line is within 90 degrees of the facing. Under reduced
    // motion the camera never turns, so it stands inside the frame the visitor has: on the sun's line
    // when that is in frame, else as near it as the frame allows.
    let tries = [];
    st.cutTo = 0;
    const onLine = () => { for (let k = 0; k * COL.sunStep <= COL.sunMax; k++) tries.push(aim0 + sideSeed * k * COL.sunStep * DEG); };
    if (o.bearing === undefined) {
      const lineOk = !st.called || Math.abs(wrap(aim0 - facing)) <= 90 * DEG;
      if (reduced) {
        const asp = typeof window !== 'undefined' && window.innerHeight ? window.innerWidth / window.innerHeight : 16 / 9;
        const vf = (asp < 1 ? CAM.vfovPortrait : CAM.vfov) * DEG;
        // (its axis kept within 60% of the half field of view: the follow camera settles a little after)
        const half = 0.6 * Math.atan(Math.tan(vf / 2) * asp);
        const third = !E.view || E.view === 'third';
        if (Math.abs(wrap(aim0 - facing)) <= half || (third && lineOk)) {
          // on the sun's line; when that is outside the frame (a phone held upright), the view cuts to
          // it once at the hush (cross-faded): it stands across the sun, never beside it
          onLine();
          if (Math.abs(wrap(aim0 - facing)) > half) st.cutTo = ++st.cutN;
        } else {
          // (first person, or a call facing away: inside the frame the visitor has)
          span = Math.min(span, half);
          const off = Math.max(-half, Math.min(half, wrap(aim0 - facing)));
          for (let k = 0; k * COL.sunStep <= COL.sunMax; k++) {
            const toward = Math.sign(off) || 1;
            tries.push(facing + off - toward * k * COL.sunStep * DEG);
          }
        }
      } else if (lineOk) onLine();
    }
    // (first, within 3 degrees of the line, a place with two rows of dunes or more in sight between;
    // then the nearest clear bearing; a last pass lets a crest hide up to 80 m more of it: better on the
    // sun's line and more hidden than off it in plain view)
    const cache = new Map();
    const candAt = (b, d) => { const key = b.toFixed(5) + ':' + d; if (!cache.has(key)) cache.set(key, cand(b, d)); return cache.get(key); };
    for (const [need, rowsMin, within] of [[0, 2, 3 * DEG], [0, 0, 99], [-80, 0, 99]]) {
      for (const b of tries) {
        if (Math.abs(wrap(b - aim0)) > within) continue;
        let best = null;
        for (const d of dists) {
          const c = candAt(b, d);
          c.score = (c.base < 0 ? -40 : 0) + Math.abs(d - 1800) * 0.004 - Math.min(c.rows, 3) * 15;
          if (c.top > need && c.rows >= rowsMin && (!best || c.score < best.score)) best = c;
        }
        if (best) { p = best; onSun = Math.abs(wrap(b - sun.bearing)) < 3 * DEG; break; }
      }
      if (p) break;
    }
    if (!p) {
      // the old search: every 5 degrees within the span, scored by the angle to the sun line
      const aim = sun.bearing + (st.placedOnce ? (rnd() * 2 - 1) * COL.jitter : jitter) * DEG;
      let best = null, fallback = null;
      for (let b = facing - span; b <= facing + span + 1e-6; b += 5 * DEG) {
        for (const d of dists) {
          const c = cand(b, d);
          c.score = Math.abs(wrap(b - aim)) / DEG + (d - 1800) * 0.004 + (c.base < 0 ? -40 : 0);
          if (!fallback || c.top > fallback.top) fallback = c;
          if (c.top > 0 && (!best || c.score < best.score)) best = c;
        }
      }
      p = best || fallback;
    }
    st.placedOnce = true;
    st.sightline = { clear: p.top > 0, top: Math.round(p.top), baseHidden: p.base < 0, onSun, rows: p.rows === undefined ? rowsTo(eye, p.b, p.d) : p.rows, cut: st.cutTo > 0 };
    st.bearing = p.b; st.dist = p.d; st.B = [p.x, p.gy, p.z];
    st.H = lerp(COL.H[0], COL.H[1], rnd());
    st.sunB = sun.bearing;
    const ax = Math.cos(p.b), az = Math.sin(p.b);
    st.away = [ax, az]; st.across = [-az, ax];
    st.swSide = rnd() < 0.5 ? -1 : 1;
    const sa = p.b + st.swSide * lerp(25, 45, rnd()) * DEG;
    st.swA = [p.x + Math.cos(sa) * COL.swell.len, p.z + Math.sin(sa) * COL.swell.len];
    st.prof = makeProfile(rnd);
    // the shadow sun and how much of the figure's light it is
    const suns = E.suns || [[0, 0.1, 1], [0, 0.1, 1]], cols = E.cols || [[1, 1, 1], [0, 0, 0]];
    st.shK = shadowSun(suns, cols);
    st.shL = suns[st.shK].slice();
    const dl = (i) => lumC(cols[i]) * Math.max(0.05, suns[i][1]);
    st.figK = 0.85 * (0.25 + 0.75 * dl(st.shK) / (dl(0) + dl(1) + 1e-6));
    st.placed = true;
    st.impactAt = null; st.impactP = null; st.cut = false; st.waveAt = null; st.dome = null; st.frozen = null;
    st.focus = [p.x, p.z]; st.veilAt = null;
  }

  // ---- the body's profile: fixed to the body from the head down (seeded, made once per rising)
  const NR = 64, NS = 48;
  function makeProfile(r) {
    const seed = [r() * 50, r() * 50, r() * 50, r() * 50];
    const H3 = (x, y, z) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 8) / 16777216; };
    const VN = (x, y, z) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi;
      const s = (t) => t * t * (3 - 2 * t), u = s(fx), v = s(fy), w = s(fz);
      return lerp(lerp(lerp(H3(xi, yi, zi), H3(xi + 1, yi, zi), u), lerp(H3(xi, yi + 1, zi), H3(xi + 1, yi + 1, zi), u), v),
        lerp(lerp(H3(xi, yi, zi + 1), H3(xi + 1, yi, zi + 1), u), lerp(H3(xi, yi + 1, zi + 1), H3(xi + 1, yi + 1, zi + 1), u), v), w);
    };
    const Ltot = COL.H[1] + COL.bury, ds = Ltot / (NR - 1);
    const k = new Float32Array(NR * (NS + 1)), R = new Float32Array(NR), kink = new Float32Array(NR * 2), s = new Float32Array(NR);
    // the outline broken: one heavy shoulder (a bulge on one flank, two thirds of the way up), the top
    // sheared off at a slant and split by a cleft (never a point, never a dome)
    const shA = r() * Math.PI * 2, shS = 160 + 120 * r(), shW = 120 + 60 * r();
    const cutA = r() * Math.PI * 2, cutD = 110 + 60 * r(), cleftA = cutA + Math.PI * (0.6 + 0.6 * r());
    for (let i = 0; i < NR; i++) {
      const si = (NR - 1 - i) * ds;   // metres from the head
      s[i] = si;
      // radius: 55 at the head to 120 at the dune line, with slow uneven shoulders
      let r0 = COL.Rhead + (COL.Rbase - COL.Rhead) * Math.min(1, si / COL.H[0]);
      r0 *= 1 + 0.5 * (VN(si / 220 + seed[0], 0.5, 1.5) - 0.5) + 0.14 * (VN(si / 90 + seed[1], 2.5, 0.5) - 0.5);
      R[i] = r0;
      // the axis kinked, up to 0.2 R, across and along the view
      kink[i * 2] = 0.2 * r0 * (2 * VN(si / 300 + seed[2], 7.7, 3.1) - 1);
      kink[i * 2 + 1] = 0.2 * r0 * (2 * VN(si / 300 + seed[3], 1.9, 8.4) - 1);
      // one flank heavier than the other, changing slowly along it (never mirrored)
      const lop = 0.3 * Math.sin(si / 230 + seed[3]) + 0.15 * (2 * VN(si / 120 + seed[3], 5.5, 2.2) - 1);
      const shoulder = Math.exp(-(((si - shS) / shW) ** 2));
      for (let j = 0; j <= NS; j++) {
        const ang = ((j % NS) / NS) * Math.PI * 2, cx = Math.cos(ang), sz = Math.sin(ang);
        // flutes: ridged noise round the ring, stretched 400 m along the length (nothing horizontal);
        // deep enough to notch the outline by about 0.3 R
        const n1 = VN(cx * 4.6 + 7.1 + seed[0], sz * 4.6 + 3.3, si / 400 + 1.7), n2 = VN(cx * 8.5 + 1.2, sz * 8.5 + 9.4 + seed[1], si / 260 + 4.2);
        const n3 = VN(cx * 0.9 + 4.4, sz * 0.9 + seed[2], si / 200);
        const ridge = Math.pow(1 - Math.abs(2 * n1 - 1), 1.6), crease = 1 - Math.abs(2 * n2 - 1);
        let f = (0.62 + 0.62 * ridge + 0.16 * crease) * (0.75 + 0.5 * n3) * (1 + lop * cx);
        f *= 1 + 0.45 * shoulder * Math.pow(Math.max(0, Math.cos(ang - shA)), 2);
        // the sheared top: the depth below the head where this flank reaches full width, deeper on
        // one side (a slanted break) and deepest in the cleft
        const cd = cutD * (0.25 + 0.75 * (0.5 + 0.5 * Math.cos(ang - cutA))) + 90 * Math.exp(-((wrap(ang - cleftA) / 0.35) ** 2))
          + 25 * (VN(cx * 3 + 2.2, sz * 3, 5.5 + seed[1]) - 0.5);
        f *= 0.8 + 0.2 * Math.pow(sstep(0, Math.max(cd, 10), si), 0.7);
        k[i * (NS + 1) + j] = f;
      }
    }
    // the surface's normals in the ring's own frame (across, along, up the axis), from the fixed
    // profile once: the body is rigid along its length, so each frame only turns them with the ring
    const nl = new Float32Array(NR * (NS + 1) * 3);
    const at = (i, j) => { const jj = (j + NS) % NS, a = (jj / NS) * Math.PI * 2, rr = R[i] * k[i * (NS + 1) + jj]; return [Math.cos(a) * rr, Math.sin(a) * rr, -s[i]]; };
    for (let i = 0; i < NR; i++) for (let j = 0; j <= NS; j++) {
      const A = at(i, j + 1), Bq = at(i, j - 1), C = at(Math.min(NR - 1, i + 1), j), D = at(Math.max(0, i - 1), j);
      const ta = [A[0] - Bq[0], A[1] - Bq[1], A[2] - Bq[2]], tv = [C[0] - D[0], C[1] - D[1], C[2] - D[2]];
      let n = [ta[1] * tv[2] - ta[2] * tv[1], ta[2] * tv[0] - ta[0] * tv[2], ta[0] * tv[1] - ta[1] * tv[0]];
      const a = ((j % NS) / NS) * Math.PI * 2;
      if (n[0] * Math.cos(a) + n[1] * Math.sin(a) < 0) n = n.map((x) => -x);
      const l = Math.hypot(...n) || 1, q = (i * (NS + 1) + j) * 3;
      nl[q] = n[0] / l; nl[q + 1] = n[1] / l; nl[q + 2] = n[2] / l;
    }
    return { k, R, kink, s, ds, nl, lean: (7 + 4 * r()) * DEG };
  }
  // the radius of the body this far from the head (for the shadow)
  const radiusAt = (si) => { const P = st.prof; if (!P) return COL.Rbase; const i = Math.max(0, Math.min(NR - 1, NR - 1 - Math.round(si / P.ds))); return P.R[i] * 1.05; };

  // the spine at this moment: rings at fixed distances from the head; below the dune line straight
  // down, above it along the exposed axis (curving over in the fall)
  function buildSpine() {
    const P = st.prof, B = st.B, ex = st.hcur, aw = st.away, ac = st.across;
    const base = [B[0], B[1] - st.sink, B[2]];
    const pts = new Array(NR), cen = new Array(NR);
    // its lean (a few degrees to one side, across the view) and, in the fall, an arc over to that side
    // and a little away from the eye, curving from the top down; the sway rocks it across
    const ls = st.leanSide, fd = [ac[0] * ls * 0.87 + aw[0] * 0.5, ac[1] * ls * 0.87 + aw[1] * 0.5];
    const dirAt = (e) => {
      const lean = P.lean * sstep(0, 0.5 * Math.max(ex, 1), e);
      const phi = st.fallPhi * sstep(0.1 * Math.max(ex, 1), 0.7 * Math.max(ex, 1), e);
      const sw = st.sway * e / Math.max(ex, 1);
      const d = [Math.sin(lean) * ac[0] * ls + Math.sin(phi) * fd[0] + sw * ac[0], Math.cos(lean) * Math.cos(phi), Math.sin(lean) * ac[1] * ls + Math.sin(phi) * fd[1] + sw * ac[1]];
      const n = Math.hypot(d[0], d[1], d[2]); return [d[0] / n, d[1] / n, d[2] / n];
    };
    let p = base.slice(), eP = 0;
    for (let i = 0; i < NR; i++) {
      const e = ex - P.s[i];   // height along the exposed axis (negative: buried)
      if (e <= 0) pts[i] = [base[0], base[1] + e, base[2]];
      else {
        // march from the last point (in steps of at most 12 m) along the axis
        while (eP < e - 1e-6) {
          const h = Math.min(12, e - eP), d = dirAt(eP + h * 0.5);
          p = [p[0] + d[0] * h, p[1] + d[1] * h, p[2] + d[2] * h]; eP += h;
        }
        pts[i] = p.slice();
      }
      const kx = P.kink[i * 2], kz = P.kink[i * 2 + 1];
      cen[i] = [pts[i][0] + ac[0] * kx + aw[0] * kz, pts[i][1], pts[i][2] + ac[1] * kx + aw[1] * kz];
    }
    st.spine = pts; st.centres = cen;
    st.head = cen[NR - 1];
  }

  function beats(dt) {
    const t = st.tAbs, T = COL.T, H = st.H;
    // the exposed length: rising at H/19 m/s and easing into its height; under reduced motion nothing
    // climbs: it is all there, developing through its veil over 6 s
    if (t < T.rise) { st.hcur = 0; st.develop = 0; }
    else if (reduced) { st.hcur = H; st.develop = 0.5 * sstep(T.rise, T.rise + 6, t); }
    else {
      const raw = (t - T.rise) * H / COL.riseS;
      st.hcur = raw < H - 40 ? raw : H - 40 * Math.exp(-(raw - (H - 40)) / 40);
      st.develop = 1;
    }
    // a slow sway from the call (a period of 24 s; none under reduced motion)
    // (eased out over the fall's first 2 s: it never steps)
    st.sway = !reduced && t > T.call && t < T.fall + 2 ? 0.05 * Math.sin((t - T.call) * 2 * Math.PI / 24) * sstep(T.call, T.call + 4, t) * (1 - sstep(T.fall, T.fall + 2, t)) : 0;
    // the fall: it arcs over to the side it leans, across the view, accelerating, over 10 s, and dives:
    // from 4 s in it slides down into the sand; it keeps its dark value until the dome's core covers it
    // (under reduced motion: a cut to the dome at its peak, 0.4 s into the fall)
    if (t > T.fall) {
      if (reduced) { if (!st.impactAt && t > T.fall + 0.4) { st.cut = true; impact(st.B[0], st.B[2]); } }
      else {
        const u = clamp01((t - T.fall) / (T.impact - T.fall));
        st.fallPhi = 1.35 * u * u;
        st.dive = 200 * Math.pow(clamp01((t - T.fall - 4) / (T.impact - T.fall - 4)), 2);
      }
    } else { st.fallPhi = 0; st.dive = 0; }
    if (st.impactAt !== null) st.sinkI += dt * (reduced ? 400 : 60 + 90 * (t - st.impactAt));
    else st.sinkI = 0;
    st.sink = (st.dive || 0) + st.sinkI;
    if (st.prof) buildSpine();
    if (!reduced && t > T.fall && st.impactAt === null && st.spine.length) {
      const h = st.head, g = height(h[0], h[2]);
      if (h[1] < g + 30 || t > T.impact + 1) impact(lerp(st.B[0], h[0], 0.45), lerp(st.B[2], h[2], 0.45));
    }
    st.bodyOn = st.hcur > 1 && (st.impactAt === null || (!reduced && t < st.impactAt + 6)) ? 1 : 0;
    // the dome: its height grown over 6 s, its width surging out over 18 s (at once under reduced
    // motion), drifting downwind, thinning in the settle
    if (st.impactP) {
      const u = t - st.impactAt, D = st.dome;
      const g = reduced ? 1 : 1 - Math.pow(1 - clamp01(u / COL.dome.grow), 3);
      const w = reduced ? 1 : 0.6 + 0.4 * (1 - Math.pow(1 - clamp01(u / COL.dome.surge), 2));
      const dens = (reduced ? 1 : sstep(0, 1.5, u)) * (1 - sstep(T.settle + 4, T.end - 4, t));
      D.C = [st.impactP[0] + WX * 4 * u, st.impactP[1], st.impactP[2] + WZ * 4 * u];
      D.g = g; D.w = w; D.dens = dens; D.u = reduced ? 0 : u;
    }
  }
  function impact(x, z) {
    st.impactAt = st.tAbs; st.impactP = [x, height(x, z), z];
    // (the veil round the body as it was: the dome grows out of it over COL.dome.blend s)
    st.veilAt = { C: st.B.slice(), h: Math.max(st.hcur * COL.veil.h, 4) };
    const E = st.env; st.impactD = E ? Math.hypot(x - E.x, z - E.z) : st.dist;
    st.waveAt = reduced ? null : st.impactAt + st.impactD / COL.wave;
    st.dome = { C: st.impactP.slice(), g: 0, w: 0.6, dens: 0, u: 0 };
  }

  function prepare({ how, phase, bearing, dist } = {}) {
    if (!st.placed || how === 'start' || bearing !== undefined) place({ bearing, dist });
    st.sink = 0; st.sinkI = 0; st.dive = 0; st.impactAt = null; st.impactP = null; st.dome = null; st.cut = false; st.fallPhi = 0; st.frozen = null; st.veilAt = null;
    if (how === 'skip' && phase) st.tAbs = CUM[phase];
  }

  // the shadow's front: how far from the base it has come (m)
  function reachNow() {
    const t = st.tAbs, D = st.dist || 1800, K = COL.reach;
    if (reduced) return D + 4000;
    if (t <= K[0][0]) return 0;
    let x = K[K.length - 1][1] - (t - K[K.length - 1][0]) * 80;
    for (let i = 0; i < K.length - 1; i++) if (t < K[i + 1][0]) { const u = (t - K[i][0]) / (K[i + 1][0] - K[i][0]); x = lerp(K[i][1], K[i + 1][1], u); break; }
    // (and its terminator's width on top, so the front's middle is where the schedule says)
    return Math.max(0, D - x + COL.edge * 0.5);
  }
  // (by day none of it: no body, so no shadow; blended by the same sun height the shading uses)
  const shadowStrength = () => (st.impactAt !== null ? 1 - sstep(st.impactAt + 2, st.impactAt + 7, st.tAbs) : 1) * (st.hcur > 1 ? 1 : 0) * (reduced ? sstep(COL.T.rise, COL.T.rise + 6, st.tAbs) : 1) * st.seen;
  // the spine's three points for the shadow (base at the dune line, middle, head) and their radii
  // (from the fall on, the shadow stays where the column stood: the sand it sheds holds the dark until
  // the dome takes it)
  function shadowSpine() {
    if (st.tAbs > COL.T.fall && st.frozen) return st.frozen;
    const S = st.centres, ex = st.hcur;
    if (!S.length || ex < 1) return null;
    const P = st.prof, idx = (e) => Math.max(0, Math.min(NR - 1, Math.round(NR - 1 - (ex - e) / P.ds)));
    const i0 = idx(0), i1 = idx(ex * 0.5), i2 = NR - 1;
    const sp = [[...S[i0], radiusAt(ex)], [...S[i1], radiusAt(ex * 0.5)], [...S[i2], radiusAt(0)]];
    st.frozen = sp;
    return sp;
  }
  // the shadow in JavaScript (the same closed form), at a point
  function shadowJS(P, reach = true) {
    const sp = shadowSpine();
    if (!sp || !st.shL) return 0;
    const L = st.shL, dd = st.disc[st.shK] * 2;
    let best = 0;
    for (let k = 0; k < 2; k++) {
      const A = sp[k], Bp = sp[k + 1];
      const d1 = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], r = [A[0] - P[0], A[1] - P[1], A[2] - P[2]];
      const dt3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      const a = Math.max(dt3(d1, d1), 1e-3), b = dt3(d1, L), c = dt3(d1, r), f = dt3(L, r);
      const s0 = clamp01((b * f - c) / Math.max(a - b * b, 1e-4));
      const t = Math.max(b * s0 + f, 0), s = clamp01((t * b - c) / a);
      const d = Math.hypot(A[0] + d1[0] * s - P[0] - L[0] * t, A[1] + d1[1] * s - P[1] - L[1] * t, A[2] + d1[2] * s - P[2] - L[2] * t);
      const W = lerp(A[3], Bp[3], s), soft = t * dd + 20;
      best = Math.max(best, 1 - sstep(W - soft / 2, W + soft / 2, d), 0.5 * (1 - sstep(W, 2.2 * W + soft, d)));
    }
    const dB = Math.hypot(P[0] - st.B[0], P[2] - st.B[2]), R = reachNow();
    return best * (reach ? 1 - sstep(R - COL.edge, R, dB) : 1) * shadowStrength();
  }
  // how much of the sun the body covers from the eye: the sun's ray within 1.3 radii of the spine (or
  // of the torn dust over its head) covers it, fading out by 2.4 (the disc never shows through)
  function occJS(P) {
    const sp = shadowSpine();
    if (!sp || !st.shL) return 0;
    const L = st.shL, H = sp[2], M = sp[1], dh = [H[0] - M[0], H[1] - M[1], H[2] - M[2]], lh = Math.hypot(...dh) || 1;
    const top = [H[0] + dh[0] / lh * 70, H[1] + dh[1] / lh * 70, H[2] + dh[2] / lh * 70, H[3]];
    let best = 0;
    for (const [A, Bp] of [[sp[0], sp[1]], [sp[1], sp[2]], [sp[2], top]]) {
      const d1 = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], r = [A[0] - P[0], A[1] - P[1], A[2] - P[2]];
      const dt3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      const a = Math.max(dt3(d1, d1), 1e-3), b = dt3(d1, L), c = dt3(d1, r), f = dt3(L, r);
      const s0 = clamp01((b * f - c) / Math.max(a - b * b, 1e-4));
      const t = Math.max(b * s0 + f, 0), s = clamp01((t * b - c) / a);
      const d = Math.hypot(A[0] + d1[0] * s - P[0] - L[0] * t, A[1] + d1[1] * s - P[1] - L[1] * t, A[2] + d1[2] * s - P[2] - L[2] * t);
      const W = lerp(A[3], Bp[3], s);
      best = Math.max(best, 1 - sstep(1.3 * W, 2.4 * W, d));
    }
    return best * shadowStrength();
  }
  // the dome's depth along a ray (the same as the shader's, without its noise)
  function domeTauJS(o, d) {
    const D = st.dome; if (!D || D.g <= 0) return 0;
    const ax = COL.dome.w / 2 * D.w, by = COL.dome.h * D.g;
    const O = [(o[0] - D.C[0]) / ax, (o[1] - D.C[1]) / by, (o[2] - D.C[2]) / ax], V = [d[0] / ax, d[1] / by, d[2] / ax];
    const a = V[0] * V[0] + V[1] * V[1] + V[2] * V[2], b = O[0] * V[0] + O[1] * V[1] + O[2] * V[2], c = O[0] * O[0] + O[1] * O[1] + O[2] * O[2] - 1;
    const disc = b * b - a * c; if (disc <= 0) return 0;
    const sq = Math.sqrt(disc); let t0 = (-b - sq) / a, t1 = (-b + sq) / a;
    const tp = (D.C[1] - 20 - o[1]) / (Math.abs(d[1]) < 1e-5 ? 1e-5 : d[1]);
    if (d[1] > 0) t0 = Math.max(t0, tp); else if (d[1] < 0) t1 = Math.min(t1, tp);
    t0 = Math.max(t0, 0);
    return Math.max(t1 - t0, 0) * (disc / a) * COL.dome.k * D.dens * st.seen;
  }

  function update(dt, P) {
    const out = {};
    st.clock += dt;
    if (P.env) st.env = P.env;
    // the day weight, from the same sun height the shading uses (uniforms() sets the shaders' copy)
    if (st.env && st.env.suns) st.seen = 1 - sstep(0.12, 0.3, Math.max(st.env.suns[0][1], st.env.suns[1][1]));
    // a strike's shiver, whether or not anything comes
    if (st.strikeRing) {
      const u = st.clock - st.strikeRing.t;
      if (u > 2.2) { st.strikeRing = null; CU.ring.value.w = 0; }
      else CU.ring.value.set(st.strikeRing.x, st.strikeRing.z, 0.4 + 6 * u, reduced ? 0.6 * (1 - u / 2.2) : (1 - u / 2.2));
    }
    const was = st.phase;
    st.phase = P.phase; st.t = P.t;
    if (P.phase === 'none') { if (was !== 'none') st.placed = false; return out; }
    if (!st.placed) place({});
    st.tAbs = CUM[P.phase] + P.t;
    st.reach = reachNow();
    beats(dt * (P.scale || 1));
    if (st.cut) { st.cut = false; out.cut = true; }
    // the visitor under the shadow (the lantern, its ring, the sky): ecl
    if (st.env) {
      const at = [st.env.x, st.env.ground + 1, st.env.z];
      const s = shadowJS(at);
      let e = s;
      st.domeAt = st.dome && st.shL ? 1 - Math.exp(-domeTauJS(at, st.shL)) : 0;
      e = Math.max(e, st.domeAt);
      if (s > 0.5 && st.inShadow <= 0.5) st.rings++;
      // (eased in two stages, over about 4 s as it comes and longer as it goes: the glow round the sun,
      // the lantern and the disc never step; the ground's own front is drawn per pixel)
      st.inShadow = s;
      const k1 = 1 - Math.exp(-dt / (e > st.ecl1 ? 1.1 : 2.2));
      st.ecl1 += (e - st.ecl1) * k1;
      st.ecl += (st.ecl1 - st.ecl) * (1 - Math.exp(-dt / (st.ecl1 > st.ecl ? 1.1 : 2.2)));
      // how much of the sun it covers from the eye (the air in front of it is in its shadow): the disc
      // never shows through the body or its dissolving top
      const c = st.env.cam || [st.env.x, st.env.ground + 2, st.env.z];
      let o = occJS(c);
      if (st.dome && st.shL) o = Math.max(o, 1 - Math.exp(-domeTauJS(c, st.shL)));
      st.occ = o;
      st.occ1 += (o - st.occ1) * (1 - Math.exp(-dt / 0.35));
      st.occE += (st.occ1 - st.occE) * (1 - Math.exp(-dt / 0.35));
    }
    // the radius round the visitor that is all in the shadow's core (the ground shader skips its closed
    // form there): sampled on rings every 10 frames, kept 10 m short; none while the front is near
    if (st.env && ((st.clock * 60) | 0) % 10 === 0) {
      let rc = 0;
      if (st.inShadow > 0.999 && !reduced) {
        for (const r of [15, 30, 50, 80, 120, 170]) {
          let ok = true;
          for (let k = 0; k < 12 && ok; k++) { const a = k * Math.PI / 6; ok = shadowJS([st.env.x + Math.cos(a) * r, st.env.ground, st.env.z + Math.sin(a) * r]) > 0.9995 * shadowStrength(); }
          if (!ok) break;
          rc = r;
        }
      }
      st.coreR = Math.max(0, rc - 10);
    }
    // the centre of what is happening, for the camera and the hood: the base as it rises, between the
    // base and the head as it falls, the dome's centre once it is down (eased, about 1.5 s)
    if (st.focus) {
      let fx = st.B[0], fz = st.B[2];
      if (st.dome) { fx = st.dome.C[0]; fz = st.dome.C[2]; }
      else if (st.tAbs > COL.T.fall && st.head) { const k = 0.5 * sstep(COL.T.fall, COL.T.impact, st.tAbs); fx = lerp(st.B[0], st.head[0], k); fz = lerp(st.B[2], st.head[2], k); }
      const kf = 1 - Math.exp(-dt / 1.5);
      st.focus = [st.focus[0] + (fx - st.focus[0]) * kf, st.focus[1] + (fz - st.focus[1]) * kf];
    }
    // the camera's lift (the view raised a little; the boom keeps its length): eased in over the
    // first seconds, out over the settle's first 6 s
    const T = COL.T, want = st.tAbs < T.back ? 1 : 0;
    st.lift += (want - st.lift) * (1 - Math.exp(-dt / 1.0));
    if (st.tAbs > T.back + 4) st.lift *= Math.exp(-dt / 0.5);
    // the brace when the ground wave passes
    st.brace = st.waveAt !== null && !reduced ? sstep(st.waveAt - 0.3, st.waveAt, st.tAbs) * (1 - sstep(st.waveAt + 1.2, st.waveAt + 2.2, st.tAbs)) : 0;
    return out;
  }

  function uniforms(base, at) {
    CU.on.value = 1;
    CU.org.value.set(at.x, at.ground, at.z);
    CU.org2.value.x = st.impactAt === null && st.tAbs > COL.T.rise ? st.coreR || 0 : 0;
    const t = st.tAbs, T = COL.T;
    const fu = sstep(T.swellEnd, T.funnelEnd, t) * (1 - sstep(T.settle, T.end - 4, t));
    CU.B.value.set(st.B[0], st.B[1], st.B[2], fu);
    // the swell: its head along a curved path; tail 200 m behind
    const u = clamp01((t - T.swell) / (T.swellEnd - T.swell));
    const at2 = (k) => { const A = st.swA, B = st.B, s = Math.sin(Math.PI * k) * COL.swell.bend * st.swSide; const dx = B[0] - A[0], dz = B[2] - A[1], l = Math.hypot(dx, dz) || 1; return [A[0] + dx * k - dz / l * s, A[1] + dz * k + dx / l * s]; };
    const head = at2(u), tail = at2(Math.max(0, u - 0.33));
    st.swHead = head;
    const swAmp = reduced ? 0 : sstep(T.swell, T.swell + 2, t) * (1 - sstep(T.swellEnd - 1, T.swellEnd + 1, t));
    CU.swA.value.set(tail[0], tail[1], head[0], head[1]);
    CU.swB.value.set(swAmp, COL.swell.w, 1, sstep(T.settle, T.settle + 4, t) * (1 - sstep(T.end - 18, T.end - 1, t)));
    // the shadow: the true direction of the sun that lights the ground most
    const suns = [base.sun1Dir, base.sun2Dir], cols = [base.sun1Col, base.sun2Col];
    st.shK = shadowSun(suns, cols); st.shL = suns[st.shK].slice();
    const sp = shadowSpine();
    if (sp) { CU.s0.value.set(...sp[0]); CU.s1.value.set(...sp[1]); CU.s2.value.set(...sp[2]); }
    CU.shL.value.set(st.shL[0], st.shL[1], st.shL[2], sp ? shadowStrength() : 0);
    CU.shP.value.set(st.disc[st.shK] * 2, st.reach, st.shK, st.domeAt || 0);
    // the dome. Before the fall the same volume is the veil of its own dust round the body (thin, and
    // denser low: a wide skirt of dust and haze its foot is lost in); from the impact the veil eases into
    // the dome over COL.dome.blend s (centre, size, density and look), so nothing pops. By day neither
    // is drawn (its density times seen). The noise's clock runs on through both.
    const D = st.dome, v = COL.veil, seen = st.seen;
    const veilK = v.dens * (reduced ? st.develop * 2 : 1) * sstep(0, 150, st.hcur);
    if (D) {
      const k = reduced ? 1 : sstep(0, COL.dome.blend, D.u), Va = st.veilAt || { C: st.B, h: 4 };
      const C = [0, 1, 2].map((i) => lerp(Va.C[i], D.C[i], k));
      CU.dome.value.set(C[0], C[1], C[2], 1);
      CU.domeR.value.set(lerp(v.w, COL.dome.w / 2 * D.w, k), lerp(Va.h, Math.max(COL.dome.h * D.g, 4), k), lerp(veilK, D.dens, k) * seen, reduced ? 0 : t);
      CU.tw.value.w = k;
    } else if (st.hcur > 1 && st.bodyOn) {
      CU.dome.value.set(st.B[0], st.B[1], st.B[2], 1); CU.domeR.value.set(v.w, Math.max(st.hcur * v.h, 4), veilK * seen, reduced ? 0 : t);
      CU.tw.value.w = 0;
    } else CU.dome.value.w = 0;
    // the ground wave: from the impact out over the dunes, fading as it goes (none under reduced motion)
    if (st.impactP && !reduced) {
      const r = (t - st.impactAt) * COL.wave;
      CU.wv.value.set(st.impactP[0], st.impactP[2], r, sstep(0, 60, r) * (1 - sstep(st.impactD + 200, st.impactD + 600, r)) * lerp(0.6, 1.0, 1 - seen));
    } else CU.wv.value.w = 0;
    // colours from the light that is around
    const amb = base.ambSky, hz = base.horizon;
    const sand = [0.62, 0.42, 0.24];
    const s1 = base.sun1Col, s2 = base.sun2Col, d1 = base.sun1Dir, d2 = base.sun2Dir;
    const E = [0, 1, 2].map((i) => s1[i] * Math.max(d1[1], 0.03) + s2[i] * Math.max(d2[1], 0.02) + amb[i] * 0.6 + hz[i] * 0.3);
    CU.dust.value.set(...E.map((e, i) => e * sand[i] * 1.6));
    // the time: day (a sun high: a mesa that moves), ember (the pale sun gone: a cut-out)
    const dayW = sstep(0.12, 0.3, Math.max(d1[1], d2[1]));
    const emberW = (1 - dayW) * (1 - sstep(-0.02, 0.03, d1[1]));
    st.timeW = { day: dayW, ember: emberW };
    // the body's one dark value: the ambient on a dark hide (near black at ember); by day the sand's
    // own albedo times 0.45, lit by the sky
    const night = [0, 1, 2].map((i) => (amb[i] * 0.2 + hz[i] * 0.08) * sand[i] * (1 - 0.75 * emberW));
    const la = (amb[0] + amb[1] + amb[2]) / 3 * 0.6 + (hz[0] + hz[1] + hz[2]) / 3 * 0.4;
    const day = [0, 1, 2].map((i) => la * sand[i] * 0.45 * 0.8);
    CU.bodyAmb.value.set(...[0, 1, 2].map((i) => lerp(night[i], day[i], dayW)));
    const own = lerp(lerp(BODY.haze.dusk, BODY.haze.ember, emberW), BODY.haze.day, dayW);
    CU.body.value.set(BODY.lobe * (1 - dayW) * (1 - 0.6 * emberW), dayW, st.develop, own);
    CU.tw.value.x = dayW; CU.tw.value.y = emberW; CU.tw.value.z = st.occE || 0;
    CU.slant.value.set(st.across[0] * st.leanSide, st.across[1] * st.leanSide, st.B[0], st.B[2]);
    CU.look.value.set(BODY.glow, BODY.top, st.figK, st.ecl);
    const fadeB = st.impactAt !== null && !reduced ? 1 - sstep(st.impactAt, st.impactAt + COL.bodyFade, t) : 1;
    CU.card.value.set(BODY.cardFwd * (1 - 0.667 * emberW) * (1 - 0.5 * dayW), lerp(1, 0.95, dayW), own, st.seen * fadeB);
    CU.cardTint.value.set(lerp(1, 1.0, dayW), lerp(1, 0.86, dayW), lerp(1, 0.66, dayW));
  }
  // the sky, through the time's uniforms: the shadow sun's disc goes, times ecl (the body hides it),
  // and its tight glow (the few degrees round the disc, mostly behind the body) loses 60%; its wide
  // glow, the glare over the sky, stays. The ground in its shadow is darkened in the ground hook, so
  // the sky's glare is never turned down over the whole frame.
  function modify(name, v) {
    const k = st.shK + 1;
    if (name === 'uSun1Sky' || name === 'uSun2Sky') st.disc[+name[4] - 1] = v[3];
    const e = st.ecl, dk = Math.max(e, st.occE || 0);
    if (!(dk > 0)) return v;
    // (the disc goes when the body covers it from the eye, or its shadow covers the visitor)
    if (name === 'uSun' + k + 'Sky') return [v[0], v[1], v[2] * (1 - dk) ** 3, v[3]];
    if (name === 'uSun' + k + 'Glow') return [v[0], v[1] * (1 - 0.6 * e), v[2], v[3]];
    return v;
  }
  function release() {
    CU.on.value = 0; CU.shL.value.w = 0; CU.org2.value.x = 0; st.coreR = 0; CU.swB.value.set(0, 0, 0, 0); CU.B.value.w = 0; CU.dome.value.w = 0;
    st.placed = false; st.lift = 0; st.brace = 0; st.hcur = 0; st.bodyOn = 0; st.called = false; st.frozen = null;
    st.ecl = 0; st.occ = 0; st.domeAt = 0; st.inShadow = 0; st.dome = null; st.impactP = null;
    st.ecl1 = 0; st.occ1 = 0; st.occE = 0; st.veilAt = null; CU.wv.value.w = 0; CU.tw.value.w = 0;
  }

  // the wind: ducked from the hush to the settle (the drift dies), and back. The lantern's pool:
  // brighter as the shadow takes the light, so the lantern is the brightest thing near
  function wind() {
    const t = st.tAbs, T = COL.T, e = st.ecl;
    const duck = sstep(0, 6, t) * (1 - sstep(T.settle, T.back, t));
    // (the pool held to its radius and at most 1.3 times calm: the world is turned down, not the lamp)
    const em = st.timeW ? st.timeW.ember : 0;
    return { strength: 0.12, gust: 0.2, mix: 0.85 * duck, figure: { k: 0, lamp: Math.min(0.42, (0.75 - 0.4 * em) * e), lampT: 1 } };
  }
  function camera() {
    const t = st.tAbs, T = COL.T;
    const shakeAt = st.impactAt !== null ? st.impactAt + st.impactD / 343 : null;
    const shake = shakeAt !== null ? (1 - sstep(0, 1, t - shakeAt)) * (t > shakeAt ? 1 : 0) : 0;
    return {
      amount: 0, lift: st.lift,
      // (the centre of what is happening: the base, then between base and head, then the dome)
      toward: t > 2 && t < T.back && st.focus ? [st.focus[0], st.focus[1], COL.phases.indexOf(st.phase)] : null,
      shake,
      // (reduced motion: placed on the sun's line outside the frame, the view cuts to it at the hush)
      cutTo: reduced && st.cutTo && t > 0.5 && t < T.settle ? [st.B[0], st.B[2], st.cutTo] : null,
    };
  }
  function trace() { return { healMul: st.tAbs < COL.T.settle ? 3 : 1 }; }
  function figure() {
    const t = st.tAbs;
    return { look: t > 1 && t < COL.T.back && st.focus ? [st.focus[0], st.focus[1]] : null, brace: st.brace };
  }

  // the staff strike: three in time make the call
  function strike(e) {
    st.strikeRing = { x: e.x, z: e.z, t: st.clock };
    st.lastStrike = { t: st.clock, blocked: !!e.blocked };
    const S = st.strikes;
    S.push(st.clock);
    while (S.length > 3) S.shift();
    if (S.length < 3) return false;
    const i1 = S[1] - S[0], i2 = S[2] - S[1], K = COL.strike;
    const ok = i1 >= K.min && i1 <= K.max && i2 >= K.min && i2 <= K.max && Math.abs(i2 - i1) <= K.match * i1;
    if (!ok) return false;
    S.length = 0;
    if (e.blocked) return false;
    st.called = true;
    return lerp(K.delay[0], K.delay[1], rnd());
  }

  // the sound (every frame, at rest when not live): each voice as it reaches the listener
  function sound() {
    if (st.phase === 'none') return { colRumble: 0, colGrind: 0, colRoar: 0, colHiss: 0, colDuck: 0, colAM: 0, colCall: st.calls, colBoom: st.booms, colRing: st.rings, colReduced: reduced };
    const t = st.tAbs, T = COL.T, da = st.dist / 343;
    const duck = sstep(0, 6, t) * (1 - sstep(T.settle, T.back, t));
    const rumble = sstep(0, 12, t) * (0.6 + 0.4 * sstep(T.swell, T.funnelEnd, t)) * (1 - sstep(T.settle, T.end - 6, t));
    const tg = t - 2.5;
    const grind = sstep(T.swell, T.swell + 3, tg) * (1 - sstep(T.funnelEnd - 1, T.funnelEnd + 3, tg)) * (0.7 + 0.3 * sstep(T.swellEnd, T.funnelEnd, tg));
    const tr = t - da;
    const roar = sstep(T.rise, T.rise + 5, tr) * (1 - sstep(T.fall, T.fall + 6, tr));
    if (t >= T.cry + da && !st.callDone) { st.callDone = true; st.calls++; }
    let hiss = 0;
    if (st.impactAt !== null) {
      const di = st.impactD / 343, th = t - st.impactAt - di;
      if (th >= 0 && !st.boomDone) { st.boomDone = true; st.booms++; }
      hiss = sstep(0, 2, th) * (1 - sstep(8, 24, th));
    }
    if (t < 1) { st.callDone = false; st.boomDone = false; }
    return { colRumble: rumble, colYaw: st.bearing, colGrind: grind, colRoar: roar, colHiss: hiss, colDuck: duck,
      colAM: t > T.swell && t < T.funnelEnd ? 1 : 0.25, colCall: st.calls, colBoom: st.booms, colRing: st.rings, colReduced: reduced };
  }

  const r1 = (v) => Math.round(v * 10) / 10;
  const self = {
    COL, update, prepare, uniforms, modify, release, wind, camera, trace, figure, strike, sound,
    readout: () => `${(st.dist / 1000).toFixed(1)} km at ${Math.round(((st.bearing / DEG) % 360 + 360) % 360)}, height ${Math.round(st.hcur)} m${st.inShadow > 0.5 ? ', in its shadow' : ''}`,
    state: () => ({ bearing: r1(((st.bearing / DEG) % 360 + 360) % 360), dist: Math.round(st.dist), height: Math.round(st.hcur), tAbs: r1(st.tAbs),
      sightline: st.sightline, inShadow: Math.round(st.inShadow * 100) / 100, ecl: Math.round(st.ecl * 100) / 100, occ: Math.round((st.occ || 0) * 100) / 100, impact: st.impactAt !== null ? r1(st.impactAt) : null,
      lift: Math.round(st.lift * 100) / 100, reach: Math.round(st.reach), lastStrike: st.lastStrike }),
    raw: () => st,
    get st() { return st; },
    // the DOM line when it begins (main.js announces a live event's line once)
    announce: () => describe(st),
    // (its line goes before anything of it stands in the sky)
    lineDone: () => st.tAbs > COL.T.rise - 4,
    // (scripts: hide the meshes, project points; set by the graphics)
    api: { look: (cmd, arg) => (cmd === 'shadow' ? arg.map((p) => Math.round(shadowJS(p) * 1000) / 1000) : self.look ? self.look(cmd, arg) : null) },
  };
  return self;
}

// the DOM line a screen reader (and anyone) reads: where it is. Read as a compass on the world's
// heading degrees: 0 is north (+x), 90 east (+z), 180 south, 270 west
const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export function describe(st) {
  const b = ((st.bearing / DEG) % 360 + 360) % 360, name = COMPASS[Math.round(b / 45) % 8];
  return `Far to the ${name}, about ${(st.dist / 1000).toFixed(1)} km, something rises from the sand.`;
}

// ---------------------------------------------------------------- the body, the sand and the dome
const POOL = 384;
// the look (tuned on stills): the dust of its own that hazes it over the air's (by time of day), how
// much of the sun's glow comes into that haze, where its top starts to dissolve, the sunward lobe, the
// sand's forward lobe
export const BODY = { haze: { dusk: 1.0, day: 0.3, ember: 0.92 }, glow: 0.35, top: 0.42, lobe: 1.6, cardFwd: 1.0 };
export function createColossusBody({ U, scene, event, fns, reduced = false }) {
  const st = event.st;
  const NR = 64, NS = 48;
  const finish = fns.finish;
  // the sky and the haze without the storm's wall (the two events never overlap), cheap enough for
  // every pixel of the body and the dome and for each grain of sand in the vertex stage
  const halo = (rd, L, tint, glow, gy) => {
    const ang = acos(clamp(dot(rd, L), -1.0, 1.0));
    return tint.mul(glow.x.mul(exp(ang.negate().div(glow.z))).add(glow.y.mul(exp(ang.negate().div(glow.w))))).mul(float(1.0).sub(gy.mul(0.6)));
  };
  const skyLite = (rd, glowK = float(1.0)) => {
    const gy = float(1.0).sub(exp(max(rd.y, 0.0).mul(-SKY.k))).toVar();
    return mix(U.uHorizon, U.uZenith, gy).add(halo(rd, U.uSun1Dir, U.uSun1Tint, U.uSun1Glow, gy).add(halo(rd, U.uSun2Dir, U.uSun2Tint, U.uSun2Glow, gy)).mul(glowK));
  };
  const fogLite = (ro, rd, dist) => {
    const dens = U.uFog.x.mul(dist).toVar();
    const k = U.uFog.z;
    const ry = max(rd.y.mul(k).mul(dist), -20.0).toVar();
    const fr = select(abs(ry).lessThan(1e-4), float(1.0).sub(ry.mul(0.5)), float(1.0).sub(exp(ry.negate())).div(ry));
    dens.addAssign(U.uFog.y.mul(exp(ro.y.sub(U.uFog.w).mul(k).negate())).mul(dist).mul(fr));
    return float(1.0).sub(exp(dens.negate()));
  };
  // the haze over a point: (colour, amount); own: the colossus's own dust over the air's
  const hazeOf = (P, own, glowK, fogK = float(1.0)) => {
    const toP = P.sub(cameraPosition).toVar(), d = max(length(toP), 1.0).toVar(), rd = toP.div(d).toVar();
    const f = fogLite(cameraPosition, rd, d).mul(fogK);
    const fc = mix(skyLite(rd, glowK), U.uFogCol, U.uFogColMix.mul(0.6));
    return vec4(fc, float(1.0).sub(float(1.0).sub(f).mul(float(1.0).sub(own))));
  };
  // the sky's ambient on the sand in the air: greyed by day (the blue sky does not make the dust blue)
  const ambD = (k) => mix(U.uAmbSky, vec3(dot(U.uAmbSky, vec3(0.3333))), CU.tw.x.mul(0.85)).mul(k);
  const keyL = () => normalize(mix(U.uSun1Dir, U.uSun2Dir, CU.shP.z));
  const keyC = () => mix(U.uSun1Col, U.uSun2Col, CU.shP.z);

  // ---- the body: a tube on the spine (its normals turned from the profile's, not recomputed)
  const nv = NR * (NS + 1);
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), hAt = new Float32Array(nv * 2), cAt = new Float32Array(nv * 3);
  const idx = [];
  for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NS; j++) {
    const a = i * (NS + 1) + j, b = a + NS + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  const pA = new THREE.BufferAttribute(pos, 3), nA = new THREE.BufferAttribute(nrm, 3), hA = new THREE.BufferAttribute(hAt, 2), cA = new THREE.BufferAttribute(cAt, 3);
  for (const A of [pA, nA, hA, cA]) A.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pA); geo.setAttribute('normal', nA); geo.setAttribute('aH', hA); geo.setAttribute('aC', cA);
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  // aH: x, the height up the exposed length (0 at the dune line, 1 at the head); y, the metres from the
  // head over its full height (fixed to the body: the same torn top as it rises)
  const aH = attribute('aH', 'vec2');
  // aC: the centre of the ring a vertex is on (the outline frays by the ring's own roundness, not the
  // flutes' creases: a crease turned from the eye would fray as a thin line inside it)
  const aC = attribute('aC', 'vec3');
  // how much of it is there at a point (shared by the depth pass and the colour): its top torn into dust
  // from the head down to about 40% of its height, the core (facing the eye) solid before its flanks, so
  // the first thing seen is torn dust with the dark mass inside it and never a round top; its outline
  // fraying where the surface turns from the eye, through fibres and tears running down it. All real
  // alpha (no dither, no depth)
  const shape = (P, n, V, full) => {
    const ndv = max(dot(normalize(P.sub(aC)), V), 0.0).toVar();
    // (torn at two scales, a little longer than wide: tatters, never a comb of fingers)
    // (the depth pass, which only needs where it is nearly all there, takes the large tears alone)
    let torn = mx_noise_float(vec3(P.x.div(45.0), P.y.div(65.0), P.z.div(45.0)).add(9.0)).mul(0.36);
    if (full) torn = torn.add(mx_noise_float(vec3(P.x.div(16.0), P.y.div(22.0), P.z.div(16.0)).add(3.0)).mul(0.14));
    torn = torn.add(0.5).toVar();
    const sH = aH.y;
    // (along a slant across it: its top is broken off at an angle)
    const sl = P.x.sub(CU.slant.z).mul(CU.slant.x).add(P.z.sub(CU.slant.w).mul(CU.slant.y)).div(260.0);
    let topV = sH.div(CU.look.y).add(sl.mul(0.15)).add(torn.sub(0.5).mul(0.5)).add(ndv.sub(0.55).mul(0.7));
    let frayV = ndv.add(torn.sub(0.5).mul(0.3));
    let fib = null;
    if (full) {
      fib = mx_noise_float(vec3(P.x.mul(0.09), P.y.mul(0.003), P.z.mul(0.09)).add(5.0)).mul(0.5).add(0.5).toVar();
      frayV = frayV.add(fib.sub(0.5).mul(0.22));
    }
    const aTop = smoothstep(0.55, 1.15, topV);
    const fray = smoothstep(0.04, 0.62, frayV);
    return { a: aTop.mul(fray).mul(CU.card.w), ndv, torn, fib };
  };
  // (the haze over it, per vertex: it changes slowly over the body at its distance)
  const bodyHazeV = vertexStage(Fn(() => hazeOf(positionWorld, float(0.0), CU.look.x, CU.body.w))());
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.FrontSide, transparent: true, depthWrite: false });
  mat.fragmentNode = Fn(() => {
    const P = positionWorld.toVar();
    const V = normalize(cameraPosition.sub(P)).toVar();
    const n = normalize(normalLocal).toVar();
    const S = shape(P, n, V, true);
    const ndv = S.ndv, fib = S.fib, torn = S.torn;
    const h = clamp(aH.x, 0.0, 1.0).toVar();
    // one dark value, a little uneven along streaks running down it (its fibres; nothing across)
    const col = CU.bodyAmb.mul(fib.mul(0.5).add(0.75)).toVar();
    // the haze at its distance, the air's and its own dust's (its colour: about the sky behind it)
    const hz = vec4(bodyHazeV).toVar();
    // a thin, broken lobe on the sunward flank only (no rim all round), never brighter than 0.8 of the
    // air behind it (no lit fin)
    const L = keyL();
    const edge = pow(float(1.0).sub(ndv), 3.0);
    const toward = smoothstep(0.1, 0.6, dot(n, L));
    const fwd = pow(max(dot(V.negate(), L), 0.0), 3.0);
    const lobe = keyC().mul(edge.mul(toward).mul(smoothstep(0.6, 0.9, fib)).mul(fwd).mul(CU.body.x).mul(0.25));
    col.assign(min(col.add(lobe.mul(0.5)), max(col, hz.xyz.mul(0.45))));
    // its lower part lost in a skirt of its own dust and the haze (a ragged top about 40% up): no
    // clean foot or flank, and the air between reads as kilometres
    const skirt = float(1.0).sub(smoothstep(0.03, 0.33, h.add(torn.sub(0.5).mul(0.14)).add(fib.sub(0.5).mul(0.1))));
    col.assign(mix(col, CU.dust.mul(0.5), skirt.mul(0.35)));
    // under reduced motion it develops out of the haze and holds half way
    const fa = float(1.0).sub(float(1.0).sub(hz.w).mul(CU.body.z)).toVar();
    fa.assign(float(1.0).sub(float(1.0).sub(fa).mul(float(1.0).sub(skirt.mul(0.62)))));
    col.assign(mix(col, hz.xyz, fa));
    return vec4(finish(col), S.a.mul(float(1.0).sub(skirt.mul(0.35))));
  })();
  // (no depth of its own: nothing drawn after it is ever cut out along a hard line, and its folds blend
  // over each other, dark on dark; its sand is shed on the side toward the eye, so little falls behind it)
  const body = new THREE.Mesh(geo, mat);
  body.visible = false; body.renderOrder = 1;
  scene.add(body);

  function writeBody() {
    const S = st.centres, Pr = st.prof, ex = st.hcur, NL = Pr.nl;
    let u = null;
    for (let i = 0; i < NR; i++) {
      const p = S[i], q = S[Math.min(NR - 1, i + 1)], o = S[Math.max(0, i - 1)];
      let t = [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; const tl = Math.hypot(...t) || 1; t = t.map((x) => x / tl);
      if (!u) u = [st.across[0], 0, st.across[1]];
      const ud = u[0] * t[0] + u[1] * t[1] + u[2] * t[2];
      u = [u[0] - t[0] * ud, u[1] - t[1] * ud, u[2] - t[2] * ud]; const ul = Math.hypot(...u) || 1; u = u.map((x) => x / ul);
      const v = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
      const r = Pr.R[i], hh = (ex - Pr.s[i]) / Math.max(ex, 1), sh = Pr.s[i] / st.H;
      for (let j = 0; j <= NS; j++) {
        const jj = j % NS, ang = (jj / NS) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
        const m = i * (NS + 1) + j, rr = r * Pr.k[m], k3 = m * 3;
        pos[k3] = p[0] + (u[0] * c + v[0] * s) * rr; pos[k3 + 1] = p[1] + (u[1] * c + v[1] * s) * rr; pos[k3 + 2] = p[2] + (u[2] * c + v[2] * s) * rr;
        const a = NL[k3], b = NL[k3 + 1], d = NL[k3 + 2];
        nrm[k3] = u[0] * a + v[0] * b + t[0] * d; nrm[k3 + 1] = u[1] * a + v[1] * b + t[1] * d; nrm[k3 + 2] = u[2] * a + v[2] * b + t[2] * d;
        hAt[m * 2] = hh; hAt[m * 2 + 1] = sh; cAt[k3] = p[0]; cAt[k3 + 1] = p[1]; cAt[k3 + 2] = p[2];
      }
    }
    pA.needsUpdate = true; nA.needsUpdate = true; hA.needsUpdate = true; cA.needsUpdate = true;
    const m = S[NR >> 1];
    geo.boundingSphere.center.set(m[0], m[1], m[2]); geo.boundingSphere.radius = (COL.H[1] + COL.bury) / 2 + COL.Rbase * 2 + 80;
  }

  // ---- the dome: one soft half-ellipsoid of sand; its depth is the view ray's chord through it,
  // shaped by one warped 400 m octave and streaks falling through it; lit from behind, the light
  // reaching a point through the sand between it and the sun (a rim all along its top, shafts of
  // shadow through it), by day a pale lit top
  const dgeo = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  // (the haze over it, per vertex: taken where the view ray passes the volume's centre, and for the dome
  // at one height, 40% up it, so the low air's denser haze does not light its foot and leave its top the
  // darkest part; the veil takes the full haze of its distance, the dome a little less)
  const domeHazeV = vertexStage(Fn(() => {
    const ro = cameraPosition, rd = normalize(positionWorld.sub(ro)).toVar(), Cn = CU.dome.xyz, m = CU.tw.w;
    const M = ro.add(rd.mul(max(dot(Cn.sub(ro), rd), 1.0))).toVar();
    const Mh = mix(M, vec3(M.x, Cn.y.add(CU.domeR.y.mul(0.4)), M.z), m);
    return hazeOf(Mh, float(0.0), CU.look.x, mix(float(1.0), float(0.62), m));
  })());
  const dmat = new THREE.MeshBasicNodeMaterial({ side: THREE.FrontSide, transparent: true, depthWrite: false });
  dmat.fragmentNode = Fn(() => {
    const ro = cameraPosition, rd = normalize(positionWorld.sub(ro)).toVar();
    const q = domeChord(ro, rd).toVar();
    const M = ro.add(rd.mul(q.y.add(q.z).mul(0.5))).toVar();
    const Cn = CU.dome.xyz, rad = vec3(CU.domeR.x, CU.domeR.y, CU.domeR.x);
    const drift = vec3(WX, 0.0, WZ).mul(CU.domeR.w.mul(4.0)).add(vec3(0.0, CU.domeR.w.mul(-6.0), 0.0));
    const Ms = M.sub(drift).toVar();
    // m: 0 the veil round the body, 1 the dome (eased between at the impact); the veil, thin and large on
    // screen, skips the warp and the shafts
    const m = CU.tw.w;
    const warp = vec3(0.0).toVar();
    // (eased in with m, so the veil's pattern never jumps as it becomes the dome)
    If(m.greaterThan(0.001), () => { warp.assign(vec3(mx_noise_float(Ms.div(900.0)), 0.0, mx_noise_float(Ms.div(900.0).add(5.0))).mul(m.mul(160.0))); });
    const big = mx_noise_float(Ms.add(warp).mul(vec3(1.0 / 420.0, 1.0 / 260.0, 1.0 / 420.0))).mul(0.5).add(0.5).toVar();
    const fall = mx_noise_float(vec3(Ms.x.div(48.0), Ms.y.div(420.0), Ms.z.div(48.0))).mul(0.5).add(0.5).toVar();
    // denser low (it is falling back), the noise only shaping it (never a threshold)
    const yN = max(M.y.sub(Cn.y), 0.0).div(rad.y).toVar();
    const low = exp(yN.mul(-1.3)).mul(0.75).add(0.4);
    const dn = big.mul(1.6).add(0.4).mul(fall.mul(0.6).add(0.7)).mul(low).toVar();
    // the veil: a wide low skirt of dust and haze its foot is lost in
    dn.mulAssign(float(1.0).add(exp(M.y.sub(Cn.y).div(-COL.veil.skirtH)).mul(COL.veil.skirt).mul(float(1.0).sub(m))));
    // the dome: low and irregular, its top a run of uneven heaps (the local height, from a broad octave
    // across the ground), nothing of the ellipsoid's outline left
    // (only worked out for the dome: the veil skips it)
    If(m.greaterThan(0.001), () => {
      const hf = clamp(mx_noise_float(vec3(Ms.x.div(300.0), 2.7, Ms.z.div(300.0))).mul(0.6).add(0.6)
        .add(mx_noise_float(vec3(Ms.x.div(110.0), 6.1, Ms.z.div(110.0))).mul(0.2)), 0.22, 1.0).toVar();
      dn.mulAssign(mix(float(1.0), float(1.0).sub(smoothstep(hf.mul(0.6), hf, yN)), m));
    });
    // its edge wanders with the big octave (smoothly: nothing is cut out), so the outline is never the
    // ellipsoid's; a narrow fringe, not a uniform fuzz (and no streaks in it: they read as spikes)
    const edgeK = smoothstep(0.0, mix(float(0.7), float(0.32), m), q.w.add(big.sub(0.5).mul(0.5)));
    const tau = q.x.mul(COL.dome.k).mul(dn).mul(edgeK).mul(CU.domeR.z).mul(CU.tw.x.mul(0.4).add(1.0)).toVar();
    const a = float(1.0).sub(exp(tau.negate()));
    // how thin the sand is along the view (its edges and heaps) and where its surface faces the sun
    const thin = exp(tau.mul(-0.9)).toVar();
    const nE = normalize(ro.add(rd.mul(q.y)).sub(Cn).div(rad.mul(rad))).toVar();
    // the light at M through the sand toward the sun (its exit distance times the density there)
    const sun = (L, C) => {
      const up = smoothstep(-0.03, 0.04, L.y);
      const lq = domeChord(M, L);
      const att = exp(lq.z.mul(COL.dome.k * 2.5).mul(dn).negate());
      // shafts: the light broken across its path by the sand's streaks
      const perp = M.sub(L.mul(dot(M, L)));
      const shaft = float(0.68).toVar();
      If(m.greaterThan(0.001), () => { shaft.assign(mix(float(0.68), smoothstep(0.25, 0.75, mx_noise_float(perp.div(110.0).add(vec3(0.0, CU.domeR.w.mul(0.05), 0.0))).mul(0.5).add(0.5)).mul(0.65).add(0.35), m)); });
      const fwd = pow(max(dot(rd, L), 0.0), 4.0).mul(CU.card.x).mul(4.0).add(0.1);
      // the dome: its rim lit where the sand is thin and its surface faces the sun (the sun's side and
      // its heaps' tops), its core dark
      const sw = smoothstep(-0.3, 0.7, dot(normalize(vec3(nE.x, 0.001, nE.z)), normalize(vec3(L.x, 0.0, L.z)))).mul(0.7).add(max(nE.y, 0.0).mul(0.45));
      // (where it is thin the light comes in from its sunward surface, not through its depth)
      const night = fwd.mul(shaft).mul(mix(att, att.mul(0.3).add(thin.mul(float(1.0).sub(thin)).mul(sw).mul(3.2)), m));
      // by day: lit from above, the sunlit side of its surface pale
      const day = max(dot(nE, L), 0.0).mul(1.8).add(0.3).mul(mix(float(0.5), float(1.0), smoothstep(0.0, 0.7, yN)));
      return C.mul(up).mul(mix(night, day, CU.tw.x));
    };
    // (a sun below the horizon is skipped)
    const light = ambD(0.35).add(U.uAmbGround.mul(0.2)).mul(mix(float(1.0), thin.mul(0.6).add(0.4), m)).toVar();
    If(U.uSun1Dir.y.greaterThan(-0.03), () => { light.addAssign(sun(U.uSun1Dir, U.uSun1Col)); });
    If(U.uSun2Dir.y.greaterThan(-0.03), () => { light.addAssign(sun(U.uSun2Dir, U.uSun2Col)); });
    const c0 = U.uSand.mul(CU.cardTint).mul(mix(float(0.55), float(1.0), CU.tw.x)).mul(light);
    // (by day the dust is the pale of sunlit sand, not its deep ochre)
    const c = mix(c0, vec3(dot(c0, vec3(0.3333))).mul(vec3(1.08, 1.0, 0.86)), CU.tw.x.mul(0.45)).toVar();
    const hz = vec4(domeHazeV).toVar();
    c.assign(mix(c, hz.xyz, hz.w));
    // (its lit rim never brighter than the air behind it)
    c.assign(min(c, hz.xyz.mul(1.05)));
    return vec4(finish(c), a);
  })();
  const dome = new THREE.Mesh(dgeo, dmat);
  dome.visible = false; dome.renderOrder = 2; dome.frustumCulled = false;   // (over the body: it hazes it)
  scene.add(dome);

  // ---- the sand: one instanced sprite of streaks
  const posA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 3), 3);
  const datA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);   // along, across, alpha, seed
  const extA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);   // ground y, rotation, thickness (< 0: a ground sheet), age
  for (const a of [posA, datA, extA]) a.setUsage(THREE.DynamicDrawUsage);
  const Pn = instancedDynamicBufferAttribute(posA, 'vec3'), Dn = instancedDynamicBufferAttribute(datA, 'vec4'), En = instancedDynamicBufferAttribute(extA, 'vec4');
  const smat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  smat.positionNode = Pn; smat.scaleNode = Dn.xy; smat.rotationNode = En.y;
  // x along the streak's motion (+x its leading, lower end), y across it: fibres along x at three
  // scales and a grain; a ragged top, a soft long foot. A ground sheet: soft all round, low and wide.
  const dens = Fn(() => {
    const q = uv().sub(0.5).mul(2.0).toVar();
    const sheet = float(En.z.lessThan(0.0)).toVar();
    const seed = Dn.w.mul(17.0).toVar();
    const fib = mx_noise_float(vec3(q.x.mul(0.8).sub(En.w.mul(2.2)), q.y.mul(2.6), seed)).mul(0.5).add(0.5);
    const across = exp(q.y.mul(q.y).mul(-3.5));
    const top = q.x.add(0.62).sub(mx_noise_float(vec3(q.y.mul(7.0), seed, 3.0)).mul(0.3)).toVar();
    const streakEnv = smoothstep(0.0, 0.12, top).mul(float(1.0).sub(smoothstep(-0.1, 1.0, q.x)).mul(0.85).add(0.15).mul(float(1.0).sub(smoothstep(0.75, 1.0, q.x))));
    const sheetEnv = float(1.0).sub(smoothstep(0.35, 1.0, abs(q.x))).mul(exp(q.y.mul(q.y).mul(-2.5)));
    const env = mix(streakEnv.mul(across), sheetEnv, sheet);
    const d = env.mul(fib.mul(1.05).add(0.03)).toVar();
    // faded into the ground at its foot (the card's offset turned to world up)
    const off = q.x.mul(Dn.x.mul(0.5)).mul(sin(En.y)).add(q.y.mul(Dn.y.mul(0.5)).mul(cos(En.y)));
    const wy = Pn.y.add(off);
    return d.mul(smoothstep(En.x.sub(4.0), En.x.add(14.0), wy));
  });
  const dN = dens().toVar();
  smat.opacityNode = float(1.0).sub(exp(dN.mul(abs(En.z)).mul(-3.0))).mul(Dn.z);
  // the light per grain of sand (the vertex stage): its core takes the sky's light and a little of the
  // sun's (none in the body's shadow); its thin edge takes the sun's forward lobe, capped at 0.85
  // times the sky behind it; both in the haze at its distance
  const shadeCore = Fn(() => {
    const shd = float(1.0).sub(shadowAt(Pn).mul(0.92)).toVar();
    const sun = (L, C, i) => {
      const up = smoothstep(-0.03, 0.04, L.y);
      const own = mix(float(1.0), shd, select(CU.shP.z.equal(float(i)), float(1.0), float(0.0)));
      return C.mul(up).mul(mix(max(L.y, 0.0).mul(0.35).add(0.06), max(L.y, 0.0).mul(0.9).add(0.15), CU.tw.x)).mul(own);
    };
    const alb = U.uSand.mul(CU.cardTint).mul(CU.card.y);
    const c = alb.mul(sun(U.uSun1Dir, U.uSun1Col, 0).add(sun(U.uSun2Dir, U.uSun2Col, 1)).add(ambD(0.3)).add(U.uAmbGround.mul(0.2))).toVar();
    const hz = hazeOf(Pn, float(0.0), float(0.0)).toVar();
    return mix(c, hz.xyz, hz.w.mul(CU.card.z));
  });
  const shadeRim = Fn(() => {
    const V = normalize(cameraPosition.sub(Pn)).toVar();
    const shd = float(1.0).sub(shadowAt(Pn).mul(0.92)).toVar();
    const L = keyL();
    const fwd = pow(max(dot(V.negate(), L), 0.0), 8.0).mul(CU.card.x).mul(smoothstep(-0.03, 0.04, L.y)).mul(shd);
    const alb = U.uSand.mul(CU.cardTint).mul(CU.card.y);
    const toP = Pn.sub(cameraPosition), d = max(length(toP), 1.0), rd = toP.div(d);
    const f = fogLite(cameraPosition, rd, d).mul(CU.card.z);
    const lit = alb.mul(keyC()).mul(fwd).mul(float(1.0).sub(f));
    const sky = skyLite(rd).toVar();
    return min(lit, max(sky.mul(0.6).sub(alb.mul(0.2)), vec3(0.0)));
  });
  const coreV = vertexStage(shadeCore()), rimV = vertexStage(shadeRim());
  smat.colorNode = Fn(() => {
    const thin = float(1.0).sub(smoothstep(0.12, 0.55, dN));
    return finish(coreV.add(rimV.mul(thin)));
  })();
  const sprite = new THREE.Sprite(smat);
  // (drawn after the body)
  sprite.count = POOL; sprite.frustumCulled = false; sprite.renderOrder = 3; sprite.visible = false;
  scene.add(sprite);

  const ps = [];
  let live = 0, acc = { plume: 0, curtain: 0, skirt: 0, crown: 0, funnel: 0 }, last = -1;
  const rnd = (() => { let s = 7654321; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
  function spawn(o) {
    if (ps.length >= POOL) { let k = 0; for (let i = 1; i < ps.length; i++) if (ps[i].age / ps[i].life > ps[k].age / ps[k].life) k = i; ps.splice(k, 1); }
    ps.push({ age: 0, seed: rnd(), drag: 0, thick: 1, len: 3, hint: [0, -1, 0], ...o });
  }
  // a grain let go fades out over dur s from now (never by shortening its life: its fade would jump)
  // (once let go, a later letting-go leaves its fade as it is)
  const letGo = (p, dur) => { if (p.goAt === undefined) { p.goAt = p.age; p.goDur = dur; } };
  let cutDone = null;
  function shedBody() {
    // at the impact (the cut, under reduced motion) the sand still falling off the body thins out
    if (st.impactAt === null || cutDone === st.impactAt) return;
    cutDone = st.impactAt;
    for (const p of ps) if (p.fromBody) { if (reduced) p.life = Math.min(p.life, p.age + 0.05); else letGo(p, 5); }
  }
  const DOWN = [0, -1, 0], WIND = [WX, 0, WZ];
  const windA = Math.atan2(WZ, WX);
  function emit(dt) {
    const t = st.tAbs, T = COL.T, B = st.B;
    // the swell: low sheets of sand rolling off its head (reduced motion: standing along its path)
    if (t > T.swell && t < T.swellEnd + 1) {
      acc.plume += dt * 6;
      while (acc.plume > 1) {
        acc.plume--;
        const h = st.swHead || [B[0], B[2]];
        const along = reduced ? rnd() : 0;
        const px = reduced ? lerp(st.swA[0], B[0], along) : h[0], pz = reduced ? lerp(st.swA[1], B[2], along) : h[1];
        const x = px + (rnd() - 0.5) * 80, z = pz + (rnd() - 0.5) * 80, g = height(x, z);
        spawn({ x, y: g + 5 + rnd() * 5, z, vx: reduced ? 0 : WX * 6, vy: 0, vz: reduced ? 0 : WZ * 6, hint: WIND, sheet: true,
          size: 14 + 10 * rnd(), len: 4 + 2 * rnd(), grow: 1.8, life: 7 + 3 * rnd(), alpha: 0.55, thick: 1.1, gy: g - 6 });
      }
    }
    // the funnel: low sheets round its rim as it sinks
    if (t > T.swellEnd && t < T.funnelEnd + 2) {
      acc.funnel += dt * 3;
      while (acc.funnel > 1) {
        acc.funnel--;
        const a = rnd() * Math.PI * 2, r = COL.funnel * (0.6 + 0.5 * rnd()), x = B[0] + Math.cos(a) * r, z = B[2] + Math.sin(a) * r, g = height(x, z);
        spawn({ x, y: g + 6, z, vx: reduced ? 0 : WX * 3, vy: 0, vz: reduced ? 0 : WZ * 3, hint: WIND, sheet: true,
          size: 22 + 14 * rnd(), len: 4 + 2 * rnd(), grow: 1.6, life: 10, alpha: 0.5, thick: 1.2, gy: g - 6 });
      }
    }
    // the rise: the first thing seen is torn dust and sand falling off its head, the dark mass inside it
    if (st.bodyOn && st.seen > 0.01 && t > T.rise && t < T.call && st.impactAt === null && !reduced) {
      acc.crown += dt * 12 * (1 - sstep(T.rise + 10, T.rise + 17, t));
      const hd = st.head, Pr = st.prof;
      while (acc.crown > 1 && hd) {
        acc.crown--;
        let a = rnd() * Math.PI * 2;
        const ec = cam ? cam.position : null, ed = ec ? Math.atan2(ec.z - hd[2], ec.x - hd[0]) : 0;
        { const d = wrap(a - ed); if (Math.cos(d) < -0.1) a = ed + Math.sign(d || 1) * (1.45 + 0.25 * rnd()); }
        const r = Pr.R[NR - 1] * (0.5 + 0.8 * rnd());
        const x = hd[0] + Math.cos(a) * r + WX * 20 * rnd(), z = hd[2] + Math.sin(a) * r + WZ * 20 * rnd(), g = height(x, z);
        spawn({ x, y: hd[1] - 70 + 100 * rnd(), z, vx: WX * (1 + 2 * rnd()), vy: -(7 + 6 * rnd()), vz: WZ * (1 + 2 * rnd()), hint: DOWN,
          size: 30 + 26 * rnd(), len: 2 + 2 * rnd(), grow: 1.3, life: 5 + 3 * rnd(), alpha: 0.3, thick: 1.3 + 0.6 * rnd(), gy: g, floor: g + 6, fromBody: true });
      }
    }
    if (st.bodyOn && st.hcur > 20 && (st.impactAt === null || !reduced)) {
      const S = st.centres, Pr = st.prof, ex = st.hcur;
      const ringAt = (e) => Math.max(0, Math.min(NR - 1, Math.round(NR - 1 - (ex - e) / Pr.ds)));
      const ec = cam ? cam.position : null, eyeDir = ec ? [ec.x - B[0], ec.z - B[2]] : [-st.away[0], -st.away[1]];
      { const l = Math.hypot(eyeDir[0], eyeDir[1]) || 1; eyeDir[0] /= l; eyeDir[1] /= l; }
      // the curtains off its downwind flank only: thin streaks falling 10 to 14 m/s; at the call three
      // times as many, in the fall more again (it sheds as it goes over)
      const rate = t < T.call ? 11 : t < T.fall ? 16 : 40;
      acc.curtain += dt * rate * (reduced ? 0.35 : 1) * (st.seen > 0.01 ? 1 : 0);
      while (acc.curtain > 1) {
        acc.curtain--;
        const e = ex * (0.2 + 0.75 * rnd()), i = ringAt(e), p = S[i];
        if (!p) break;
        // (off the flank the wind blows toward, seen from the eye; spread over its near half, never
        // behind it: having no depth, it would draw one behind it over it)
        const ed = Math.atan2(eyeDir[1], eyeDir[0]), side = Math.sign(wrap(windA - ed)) || 1;
        const a = ed + side * (0.35 + 1.25 * rnd());
        const r = Pr.R[i] * (0.95 + 0.35 * rnd());
        const x = p[0] + Math.cos(a) * r + WX * 25 * rnd(), z = p[2] + Math.sin(a) * r + WZ * 25 * rnd(), g = height(x, z);
        const over = t > T.fall, vy = over ? 25 + 35 * clamp01((t - T.fall) / 10) : 10 + 4 * rnd(), w = over ? 18 + 40 * rnd() : 22 + 26 * rnd();
        spawn({ x, y: p[1] - Pr.R[i] * Math.min(1, st.fallPhi * 1.5), z, vx: reduced ? 0 : WX * (1 + 2 * rnd()), vy: reduced ? 0 : -vy, vz: reduced ? 0 : WZ * (1 + 2 * rnd()), hint: DOWN,
          size: w, len: over ? 2 + rnd() : 3 + 2 * rnd(), grow: 1.25, life: reduced ? 16 : over ? 2.5 + 1.5 * rnd() : 7 + 4 * rnd(), alpha: over ? 0.2 + 0.18 * rnd() : 0.38, thick: 1.4 + 0.8 * rnd(), gy: g, floor: g + 6, fromBody: true });
      }
      // the skirt: wide low sheets rolling out round its foot, downwind
      acc.skirt += dt * 0.6;
      while (acc.skirt > 1) {
        acc.skirt--;
        const a = windA + (rnd() - 0.5) * 2.6, r = COL.Rbase * (0.6 + 1.2 * rnd()), x = B[0] + Math.cos(a) * r, z = B[2] + Math.sin(a) * r, g = height(x, z);
        spawn({ x, y: g + 8 + 12 * rnd(), z, vx: reduced ? 0 : WX * 3, vy: 0, vz: reduced ? 0 : WZ * 3, hint: WIND, sheet: true,
          size: 45 + 30 * rnd(), len: 4 + 2 * rnd(), grow: 1.4, life: 14, alpha: 0.55, thick: 1.4, gy: g - 8, fromBody: true, low: true });
      }
    }
    // at the impact by day (no dome is drawn): low sheets of dust rolling out over the far dunes from
    // where it went down (the tall pour-backs through the dome are gone: they read as spikes)
    if (st.impactAt !== null && last !== st.impactAt) {
      last = st.impactAt;
      const I = st.impactP, A = COL.dome.w / 2;
      for (let k = 0; k < (reduced || st.seen > 0.99 ? 0 : 26); k++) {
        const a = rnd() * Math.PI * 2, r = A * (0.1 + 0.55 * rnd()), x = I[0] + Math.cos(a) * r, z = I[2] + Math.sin(a) * r, g = height(x, z);
        const out = 6 + 8 * rnd();
        spawn({ x, y: g + 10 + 20 * rnd(), z, vx: Math.cos(a) * out + WX * 3, vy: 0, vz: Math.sin(a) * out + WZ * 3, hint: WIND, sheet: true, day: true,
          size: 90 + 70 * rnd(), len: 3 + 2 * rnd(), grow: 1.6, life: 16 + 6 * rnd(), alpha: 0.32, thick: 1.1, gy: g - 10, wait: 0.3 * rnd() });
      }
    }
    // as it goes over, the sand it shed upright is let go (it would hang in the air above it)
    if (t > T.fall + 1.5 && !st.overGo) { st.overGo = true; for (const p of ps) if (p.fromBody && !p.low) letGo(p, 2.5); }
    if (t < T.fall) st.overGo = false;
    // before the settle every grain left in the air is let go (nothing hangs in the sky after)
    if (t > T.settle - 2 && !st.swept) { st.swept = true; for (const p of ps) if (!p.near && !p.day) letGo(p, 3); }
    if (t < T.settle - 2) st.swept = false;
  }
  let cam = null, hide = false;
  function update(dt, camera) {
    cam = camera;
    const on = st.phase !== 'none' && CU.on.value > 0.5;
    if (!on) { if (sprite.visible || body.visible || dome.visible) { body.visible = false; sprite.visible = false; dome.visible = false; ps.length = 0; last = -1; } return; }
    if (!st.bodyOn && !st.dome && !ps.length && !(st.tAbs > COL.T.swell && st.tAbs < COL.T.funnelEnd + 2)) { if (body.visible || sprite.visible || dome.visible) clear(); return; }
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    sph.center.set(st.B[0] + st.away[0] * 500, st.B[1] + 300, st.B[2] + st.away[1] * 500); sph.radius = 1300 + st.H;
    const inView = frustum.intersectsSphere(sph);
    // (by day it is never drawn: felt and heard only)
    body.visible = !hide && !!st.bodyOn && inView && !!st.prof && st.seen > 0.002;
    // (the tube is only written when it is drawn)
    if (body.visible) writeBody();
    const D = st.dome;
    // (the dome, or before it the veil: the volume's uniforms are the event's)
    const dv = CU.dome.value, dr = CU.domeR.value;
    dome.visible = !hide && dv.w > 0.5 && dr.z > 0.002 && inView;
    if (dome.visible) { dome.position.set(dv.x, dv.y - 20, dv.z); dome.scale.set(dr.x, dr.y + 20, dr.x); dome.updateMatrixWorld(); }
    emit(dt); shedBody();
    // the sim
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      if (p.wait > 0) { p.wait -= dt; continue; }
      p.age += dt;
      if (p.age > p.life || (p.goAt !== undefined && p.age > p.goAt + p.goDur)) { ps.splice(i, 1); continue; }
      if (p.drag) { const k = Math.exp(-dt * p.drag); p.vx = p.vx * k + WX * 3 * (1 - k); p.vz = p.vz * k + WZ * 3 * (1 - k); p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy = -0.6; p.vx = 0; p.vz = 0; letGo(p, 1.2); }
    }
    live = 0;
    const pa = posA.array, da = datA.array, ea = extA.array;
    const ce = camera.matrixWorldInverse.elements, pe = camera.projectionMatrix.elements, aspect = camera.aspect || 1;
    const proj = (x, y, z) => {
      const vx = ce[0] * x + ce[4] * y + ce[8] * z + ce[12], vy = ce[1] * x + ce[5] * y + ce[9] * z + ce[13], vz = ce[2] * x + ce[6] * y + ce[10] * z + ce[14];
      const w = -vz || 1e-3; return [(pe[0] * vx) / w, (pe[5] * vy) / w];
    };
    // the wave's puffs are near; the rest only drawn when the colossus is in view
    for (const p of ps) {
      if (p.wait > 0 || hide) continue;
      if (!inView && !p.near) continue;
      const u = p.age / p.life, s = p.size * (1 + (p.grow - 1) * Math.sqrt(u));
      // (let go: faded over its own time; by day nothing off the body is seen, the low dust is)
      const go = p.goAt === undefined ? 1 : 1 - sstep(p.goAt, p.goAt + p.goDur, p.age);
      const vis = p.day ? 1 - st.seen : p.fromBody && !p.low ? st.seen : 1;
      let a = p.alpha * sstep(0, 0.15, u) * (1 - sstep(0.5, 1, u)) * go * vis;
      if (a < 0.002) continue;
      // turned along its motion on screen (or its hint, standing still); a falling streak whose long
      // axis leaves the vertical by more than 20 degrees on screen is not drawn (no fans, no planks)
      const sp = Math.hypot(p.vx, p.vy, p.vz) > 0.5 && !p.sheet;
      const m = sp ? [p.vx, p.vy, p.vz] : p.hint, sc = 10 / Math.max(1, Math.hypot(m[0], m[1], m[2]));
      const p0 = proj(p.x, p.y, p.z), p1 = proj(p.x + m[0] * sc, p.y + m[1] * sc, p.z + m[2] * sc);
      const sx = (p1[0] - p0[0]) * aspect, sy = p1[1] - p0[1];
      let rot = Math.hypot(sx, sy) > 1e-7 ? Math.atan2(sy, sx) : -Math.PI / 2;
      if (p.sheet) { if (Math.abs(Math.sin(rot)) > 0.5) rot = Math.sign(Math.cos(rot) || 1) > 0 ? 0 : Math.PI; }
      else if (!p.near) { const off = Math.abs(wrap(rot + Math.PI / 2)); if (off > 20 * DEG) continue; a *= 1 - sstep(13 * DEG, 20 * DEG, off); }
      // (a falling streak hangs from where it was shed: its ragged top there, its foot below)
      pa[live * 3] = p.x; pa[live * 3 + 1] = p.sheet || p.near ? p.y : p.y - s * p.len * 0.42; pa[live * 3 + 2] = p.z;
      da[live * 4] = s * p.len; da[live * 4 + 1] = s; da[live * 4 + 2] = a; da[live * 4 + 3] = p.seed;
      ea[live * 4] = p.gy; ea[live * 4 + 1] = rot; ea[live * 4 + 2] = p.sheet ? -p.thick : p.thick; ea[live * 4 + 3] = u;
      live++;
    }
    for (let i = live; i < POOL; i++) { da[i * 4] = 0; da[i * 4 + 1] = 0; da[i * 4 + 2] = 0; }
    posA.needsUpdate = datA.needsUpdate = extA.needsUpdate = true;
    sprite.visible = live > 0;
    sprite.count = POOL;
  }
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  function clear() { ps.length = 0; body.visible = false; sprite.visible = false; dome.visible = false; last = -1; }
  // for scripts: hide the meshes (a still without it, for a mask), project points to the canvas
  event.look = (cmd, arg) => {
    if (cmd === 'hide') { hide = !!arg; body.visible = sprite.visible = dome.visible = false; return true; }
    if (cmd === 'project' && cam) return arg.map((p) => { const v = new THREE.Vector3(...p).project(cam); return [(v.x + 1) / 2, (1 - v.y) / 2, v.z]; });
    return null;
  };
  return { update, clear, body, sprite, dome, get live() { return live; } };
}

// The colossus as the engine's event def (worlds/dust-sea/world.js lists it after the storm).
export const colossusDef = {
  name: 'colossus',
  phases: COL.phases,
  dur: COL.dur,
  schedule: { firstMin: COL.firstMin, firstMax: COL.firstMax, gapMin: COL.gapMin, gapMax: COL.gapMax, nowDelay: COL.nowDelay },
  call: { cooldown: COL.cooldown },
  quiet: COL.quiet,
  create: (ctx) => createColossus(ctx),
  graphics({ reduced, event }) {
    let body = null;
    return {
      ground: groundHook, sky: () => {},   // (nothing of it in the sky shader: the sky is dimmed through modify)
      fog: colossusFog,
      particles: ({ U, scene, fns }) => (fns ? (body = createColossusBody({ U, scene, event, fns, reduced })) : null),
      readout: () => `sand ${body ? body.live : 0}`,
    };
  },
};
