// Dust Sea walk: the colossus ("The Rising"). Something kilometres off rises out of the sand, stands
// across the low sun, calls, and falls back. It is known mostly by what the ground, the air and the
// sound do; the body itself is a dark silhouette with a gold rim, far away (1.6 to 2.2 km), seen
// through its own falling sand and the evening haze. No face, no eyes, no teeth, no segments.
// (The playbook's "no other creatures" rule is lifted by the owner for this one colossus only.)
//
// Beats (seconds at scale 1; ?colossus=fast runs them at 4x):
//   hush     0-12   the wind ducks, the Pilgrim's hood turns to the bearing, a sub-rumble rises
//   swell   12-35   a swell runs a curved 600 m path toward the breach, throwing gold plumes; it ends
//                   in a 300 m funnel that sinks over its last 6 s
//   rise    35-55   the column climbs at 18 m/s to 350-420 m, curving toward the sun line, sand
//                   pouring off its flanks; its shadow runs over the dunes and across the Pilgrim,
//                   whose lantern is then the brightest thing near
//   call    55-68   it sways; the head opens with sand falling out; the call arrives d/343 s later
//   fall    68-82   it arcs over away from the camera and dives; a backlit dome of sand grows
//                   (about 600 m wide, 250 m high); later a ring of crest puffs runs past the walker
//                   and the Pilgrim braces
//   settle  82-110  the dome drifts downwind and thins, the wind returns, the funnel's scar heals
// The first comes 5 to 8 minutes after the page is ready, then every 12 to 18 minutes (seeded).
// The visitor can call it with the staff: three strikes in time (F or Space, long press on touch),
// the hush 6 to 10 s later; 180 s cooldown, refused during the storm or its quiet.
// ?colossus=now (the hush 6 s after ready, 1.8 km), fast, off, rise (straight to the rise).
//
// Build: the body is one tube (64 rings x 24 sides) whose spine is computed in JavaScript each
// frame and written into the geometry (1600 vertices; cheaper to reason about than a GPU spine and
// identical on both backends). Sand curtains, plumes, the shroud and the dome are one instanced
// Sprite (soft cards, coloured per sprite like the storm's sand). The ground gets the swell's and
// the funnel's shading, the scar and the shadow (closed forms, one branch on CU.on). The figure and
// the puffs darken through the same shadow (fog hook). Everything is hidden or branched off when the
// colossus is not live, so the calm frame is untouched.

import * as THREE from 'three/webgpu';
import { Fn, If, uniform, vec2, vec3, vec4, float, clamp, smoothstep, max, min, mix, abs, exp, pow, dot, length, normalize,
  uv, cameraPosition, instancedDynamicBufferAttribute, mx_noise_float, positionWorld, normalLocal, attribute, sin } from 'three/tsl';
import { G, DEG } from './params.js';
import { height } from './height.js';

const WX = Math.cos(G.windDeg * DEG), WZ = Math.sin(G.windDeg * DEG);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const COL = {
  phases: ['hush', 'swell', 'rise', 'call', 'fall', 'settle'],
  dur: { hush: 12, swell: 23, rise: 20, call: 13, fall: 14, settle: 28 },
  firstMin: 300, firstMax: 480, gapMin: 720, gapMax: 1080, nowDelay: 6,
  cooldown: 180, quiet: 60,
  dist: [1600, 2200], distNow: 1800, minDist: 1500,
  spanSched: 60, spanCall: 35, jitter: 15,
  R: 45, H: [350, 420], bury: 70, speed: 18,
  swell: { len: 600, amp: 12, w: 40, bend: 110 },
  funnel: 150, shadowW: 120, shadowSoft: 100, shadowReach: 0.8,
  dome: { w: 600, h: 250 },
  wave: 120,
  // beat times (s from the hush)
  T: { swell: 12, swellEnd: 29, funnelEnd: 35, rise: 35, call: 55, mouth: 57, mouthShut: 65, fall: 68, impact: 74.5, settle: 82, back: 88, end: 110 },
  strike: { min: 0.45, max: 1.5, match: 0.35, delay: [6, 10] },
};
const CUM = (() => { let c = 0; const o = {}; for (const p of COL.phases) { o[p] = c; c += COL.dur[p]; } return o; })();

// ---------------------------------------------------------------- uniforms
const V3 = () => new THREE.Vector3(), V4 = () => new THREE.Vector4();
export const CU = {
  on: uniform(0),
  org: uniform(V3()),        // the visitor: x, ground, z
  B: uniform(V4()),          // breach x, ground y, z, funnel 0..1
  swA: uniform(V4()),        // swell tail x, z, head x, z
  swB: uniform(V4()),        // amp, half width, plume glow, scar
  s0: uniform(V4()), s1: uniform(V4()), s2: uniform(V4()),   // the spine for the shadow (xyz), w: unused
  shL: uniform(V4()),        // the shadow's light direction (xyz), strength
  ring: uniform(V4()),       // a staff strike's shiver: x, z, radius, amount
  dust: uniform(V3()),       // the sand's colour in the air
  rim: uniform(V4()),        // body: rim gain, mouth open, shroud height, shroud amount
  bodyAmb: uniform(V3()),    // body: its own colour in shade
  look: uniform(V4()),       // the haze's share over the body, over the sand cards; the shadow's darkening
};

// the shadow of the spine at a ground point P (1 in the shadow's core)
function segRay(P, L, A, Bp) {
  const d1 = Bp.sub(A).toVar(), r = A.sub(P).toVar();
  const a = max(dot(d1, d1), 1e-3), b = dot(d1, L), c = dot(d1, r), f = dot(L, r);
  const den = max(a.sub(b.mul(b)), 1e-4);
  const s0 = clamp(b.mul(f).sub(c).div(den), 0.0, 1.0);
  const t = max(b.mul(s0).add(f), 0.0).toVar();
  const s = clamp(t.mul(b).sub(c).div(a), 0.0, 1.0);
  return length(A.add(d1.mul(s)).sub(P.add(L.mul(t))));
}
export function shadowAt(P) {
  const L = CU.shL.xyz;
  const d = min(segRay(P, L, CU.s0.xyz, CU.s1.xyz), segRay(P, L, CU.s1.xyz, CU.s2.xyz));
  return float(1.0).sub(smoothstep(COL.shadowW, COL.shadowW + COL.shadowSoft, d)).mul(CU.shL.w);
}

// the ground hook: the swell's and the funnel's light, the scar, the shadow, a strike's shiver
function groundHook({ col, ro, rd, dist }) {
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
      const lit = clamp(dot(slope, sunH).negate().mul(5.0), -0.6, 1.4);
      col.mulAssign(float(1.0).add(lit.mul(far)));
      col.addAssign(CU.dust.mul(h.mul(CU.swB.z).mul(0.35).mul(far)));
    });
    // the funnel (sinking: a bowl lit on the side that faces the sun), and the scar it leaves
    const toB = CU.B.xz.sub(P.xz).toVar();
    const rB = length(toB).toVar();
    If(CU.B.w.add(CU.swB.w).greaterThan(0.001), () => {
      const bowl = float(1.0).sub(smoothstep(COL.funnel * 0.35, COL.funnel, rB)).mul(CU.B.w).mul(far);
      const face = max(dot(toB.div(max(rB, 1.0)), sunH), 0.0);
      col.mulAssign(mix(float(1.0), face.mul(0.7).add(0.55), bowl.mul(0.75)));
      const sc = float(1.0).sub(smoothstep(COL.funnel * 0.6, COL.funnel * 1.4, rB)).mul(CU.swB.w).mul(far);
      col.mulAssign(float(1.0).sub(sc.mul(0.3)));
    });
    // the shadow (weaker far off, where the haze lights the sand anyway)
    If(CU.shL.w.greaterThan(0.001), () => {
      const s = shadowAt(P).mul(float(1.0).sub(smoothstep(2500.0, 6000.0, dist)));
      col.mulAssign(float(1.0).sub(s.mul(CU.look.z)));
    });
  });
  If(CU.ring.w.greaterThan(0.001), () => {
    const P = ro.add(rd.mul(dist));
    const r = length(P.xz.sub(CU.ring.xy));
    const band = exp(r.sub(CU.ring.z).div(0.5).mul(r.sub(CU.ring.z).div(0.5)).negate()).mul(CU.ring.w);
    col.mulAssign(float(1.0).add(band.mul(sin(r.mul(9.0)).mul(0.5).add(0.6)).mul(0.22)));
  });
}
// for the figure and the puffs: the same shadow
export function colossusFog(col, P) {
  If(CU.on.greaterThan(0.5).and(CU.shL.w.greaterThan(0.001)), () => {
    col.mulAssign(float(1.0).sub(shadowAt(P).mul(CU.look.z)));
  });
}

// ---------------------------------------------------------------- the event
export function createColossus({ reduced = false, rnd, mode = null } = {}) {
  const st = {
    phase: 'none', t: 0, tAbs: 0, placed: false, called: false, env: null,
    bearing: 0, dist: 0, B: [0, 0, 0], H: 380, sideAway: [1, 0], sunB: 0, sightline: null,
    swA: [0, 0], swDir: 1, swSide: 1, impactAt: null, impactP: null, impactD: 0, cut: false,
    spine: [], head: [0, 0, 0], hcur: 0, fallPhi: 0, sink: 0, bodyOn: 0, mouth: 0,
    inShadow: 0, rings: 0, ringPrev: 0, calls: 0, booms: 0, lift: 0, brace: 0, braceT: -1, waveAt: null,
    strikes: [], clock: 0, strikeRing: null, cooldownLeft: 0, look: null, lastStrike: null,
  };
  const jitter = (rnd() * 2 - 1) * COL.jitter;   // the first placement's offset from the sun line

  // the bearing of the lowest sun worth standing under (dusk: the pale sun; day and ember: the red one)
  function keySun(env) {
    const s = env.suns || [[1, 0.1, 0], [1, 0.1, 0]], c = env.cols || [[1, 1, 1], [0, 0, 0]];
    const el = (d) => Math.asin(Math.max(-1, Math.min(1, d[1])));
    const lumC = (x) => x[0] + x[1] + x[2];
    let pick = -1, best = -1;
    for (let i = 0; i < 2; i++) { const e = el(s[i]) / DEG; if (e > -0.5 && e <= 8 && lumC(c[i]) > 0 && lumC(c[i]) > best) { best = lumC(c[i]); pick = i; } }
    if (pick < 0) pick = el(s[0]) < el(s[1]) && el(s[0]) > -0.01 ? 0 : 1;
    return { bearing: Math.atan2(s[pick][2], s[pick][0]), dir: s[pick], index: pick };
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
  function place(o = {}) {
    const E = st.env || { x: 0, z: 0, ground: height(0, 0), cam: [0, height(0, 0) + 1.7, 0], yaw: 0 };
    // (the camera's eye: in third person it stands behind and above the Pilgrim; never under 2.5 m)
    const eye = E.cam ? [E.cam[0], Math.max(E.cam[1], height(E.cam[0], E.cam[2]) + 2.5), E.cam[2]] : [E.x, E.ground + 1.7, E.z];
    const facing = o.bearing !== undefined ? o.bearing * DEG : E.yaw;
    const span = (o.bearing !== undefined ? 0 : st.called ? COL.spanCall : COL.spanSched) * DEG;
    const sun = keySun(E);
    const aim = sun.bearing + (st.placedOnce ? (rnd() * 2 - 1) * COL.jitter : jitter) * DEG;
    const dists = o.dist ? [Math.max(COL.minDist, o.dist)] : mode === 'now' ? [COL.distNow] : [1600, 1800, 2000, 2200];
    let best = null, fallback = null;
    for (let b = facing - span; b <= facing + span + 1e-6; b += 5 * DEG) {
      for (const d of dists) {
        const x = E.x + Math.cos(b) * d, z = E.z + Math.sin(b) * d, gy = height(x, z);
        const top = clearance(eye, [x, gy + 120, z]);
        const base = clearance(eye, [x, gy + 2, z], 300);
        let score = Math.abs(wrap(b - aim)) / DEG + (d - 1800) * 0.004;
        if (base < 0) score -= 6;   // a crest hides the base: preferred
        const c = { b, d, x, z, gy, top, base, score };
        if (!fallback || top > fallback.top) fallback = c;
        if (top > 0 && (!best || score < best.score)) best = c;
      }
    }
    const p = best || fallback;
    st.placedOnce = true;
    st.sightline = { clear: !!best, top: Math.round(p.top), baseHidden: p.base < 0 };
    st.bearing = p.b; st.dist = p.d; st.B = [p.x, p.gy, p.z];
    st.H = lerp(COL.H[0], COL.H[1], rnd());
    st.sunB = sun.bearing;
    // away from the eye; the swell comes in from further off, from one side
    const ax = Math.cos(p.b), az = Math.sin(p.b);
    st.away = [ax, az];
    st.swSide = rnd() < 0.5 ? -1 : 1;
    const sa = p.b + st.swSide * lerp(25, 45, rnd()) * DEG;
    st.swA = [p.x + Math.cos(sa) * COL.swell.len, p.z + Math.sin(sa) * COL.swell.len];
    // the lean: toward the sun line, across the view
    const across = [-az, ax], off = wrap(sun.bearing - p.b);
    st.lean = [across[0] * Math.sign(off) * Math.min(1, Math.abs(off) / (20 * DEG)), across[1] * Math.sign(off) * Math.min(1, Math.abs(off) / (20 * DEG))];
    // the shadow's light: from the colossus toward the eye, raised so the shadow's tip reaches past
    // the visitor as the column nears its height (exaggerated: judged by eye)
    const te = COL.shadowReach * st.H / p.d, ce = 1 / Math.hypot(1, te);
    st.shL = [ax * ce, te * ce, az * ce];
    // how dark it is: the key sun's share of the direct light (at day the low red sun is little of it)
    const lumC = (c) => c[0] + c[1] + c[2], dl = (i) => lumC((E.cols || [[1, 1, 1], [0, 0, 0]])[i]) * Math.max(0.05, ((E.suns || [[0, 0.1, 0], [0, 0.1, 0]])[i])[1]);
    const ki = sun.index, ratio = dl(ki) / (dl(0) + dl(1) + 1e-6);
    st.shadowK = 0.25 + 0.75 * ratio;
    st.placed = true;
    st.impactAt = null; st.impactP = null; st.cut = false; st.rings = st.rings || 0; st.waveAt = null;
  }

  // the spine at this moment (64 points from under the sand to the head)
  const NR = 64;
  function buildSpine() {
    const B = st.B, Lexp = st.hcur, L = COL.bury + Lexp, da = L / (NR - 1);
    const up = [0, 1, 0], aw = st.away, ln = st.lean;
    const pts = [];
    let p = [B[0], B[1] - COL.bury - st.sink, B[2]];
    const sway = st.sway || 0;
    for (let i = 0; i < NR; i++) {
      pts.push(p.slice());
      const a = i * da, e = clamp01((a - COL.bury) / Math.max(Lexp, 1));
      const phi = st.fallPhi * sstep(0, 0.55, e);
      const l = 0.22 * e * e * (st.leanK || 0) + sway * e;
      const wob = reduced ? 0 : 0.03 * Math.sin(a / 70 - st.tAbs * 0.45);
      let d = [Math.sin(phi) * aw[0] + (l + wob) * ln[0], Math.cos(phi), Math.sin(phi) * aw[1] + (l + wob) * ln[1]];
      const n = Math.hypot(d[0], d[1], d[2]); d = [d[0] / n, d[1] / n, d[2] / n];
      p = [p[0] + d[0] * da, p[1] + d[1] * da, p[2] + d[2] * da];
      void up;
    }
    st.spine = pts;
    st.head = pts[NR - 1];
  }

  function beats(dt) {
    const t = st.tAbs, T = COL.T;
    // the column's exposed length: rising at 18 m/s, easing into its height
    if (t < T.rise) st.hcur = 0;
    else { const raw = (t - T.rise) * COL.speed; st.hcur = raw < st.H - 40 ? raw : st.H - 40 * Math.exp(-(raw - (st.H - 40)) / 40); }
    st.leanK = sstep(T.rise, T.call, t);
    st.sway = t > T.call && t < T.fall + 2 ? 0.035 * Math.sin((t - T.call) * 2 * Math.PI / 7) * sstep(T.call, T.call + 3, t) * (reduced ? 0.5 : 1) : 0;
    st.mouth = sstep(T.mouth, T.mouth + 2, t) * (1 - sstep(T.mouthShut, T.mouthShut + 2, t));
    // the fall: it arcs over away from the camera, accelerating; the head's meeting with the sand is
    // the impact
    if (t > T.fall) {
      if (reduced) { if (!st.impactAt && t > T.fall + 0.4) { st.cut = true; st.fallPhi = 2.0; impact(st.B[0] + st.away[0] * st.H * 0.8, st.B[2] + st.away[1] * st.H * 0.8); } }
      else st.fallPhi = 2.1 * Math.pow(clamp01((t - T.fall) / 6.8), 2);
    } else st.fallPhi = 0;
    if (st.impactAt !== null) st.sink += dt * (reduced ? 400 : 80 + 60 * (t - st.impactAt));
    else st.sink = 0;
    buildSpine();
    if (!reduced && t > T.fall && st.impactAt === null) {
      const h = st.head, g = height(h[0], h[2]);
      if (h[1] < g + 20 || t > T.impact + 2) impact(h[0], h[2]);
    }
    st.bodyOn = st.hcur > 1 && (st.impactAt === null || t < st.impactAt + 3) && !(reduced && st.impactAt !== null) ? 1 : 0;
  }
  function impact(x, z) {
    st.impactAt = st.tAbs; st.impactP = [x, height(x, z), z];
    const E = st.env; st.impactD = E ? Math.hypot(x - E.x, z - E.z) : st.dist;
    st.waveAt = st.impactAt + st.impactD / COL.wave;
  }

  function prepare({ how, phase, bearing, dist } = {}) {
    if (!st.placed || how === 'start' || bearing !== undefined) place({ bearing, dist });
    st.sink = 0; st.impactAt = null; st.cut = false; st.fallPhi = 0;
    if (how === 'skip' && phase) st.tAbs = CUM[phase];
  }

  function update(dt, P) {
    const out = {};
    st.clock += dt;
    if (P.env) st.env = P.env;
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
    beats(dt * (P.scale || 1));
    if (st.cut) { st.cut = false; out.cut = true; }
    // the visitor under the shadow (for the lantern and its ring)
    if (st.env) {
      const s = shadowJS([st.env.x, st.env.ground + 1, st.env.z]);
      if (s > 0.5 && st.inShadow <= 0.5) st.rings++;
      st.inShadow = s;
    }
    // the camera's lift: eased in over 3 s from the hush, out over the settle's first 6 s
    const T = COL.T, want = st.tAbs < T.back ? 1 : 0;
    st.lift += (want - st.lift) * (1 - Math.exp(-dt / 1.0));
    if (st.tAbs > T.back + 4) st.lift *= Math.exp(-dt / 0.5);
    // the brace when the ground wave passes
    st.brace = st.waveAt !== null && !reduced ? sstep(st.waveAt - 0.3, st.waveAt, st.tAbs) * (1 - sstep(st.waveAt + 1.2, st.waveAt + 2.2, st.tAbs)) : 0;
    return out;
  }

  // the shadow in JavaScript (the same closed form), at a point
  function shadowJS(P) {
    if (!st.spine.length || st.hcur < 1 || !st.shL) return 0;
    const L = st.shL, S = st.spine, pts = [S[0], S[NR >> 1], S[NR - 1]];
    let dmin = Infinity;
    for (let k = 0; k < 2; k++) {
      const A = pts[k], Bp = pts[k + 1];
      const d1 = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], r = [A[0] - P[0], A[1] - P[1], A[2] - P[2]];
      const dt3 = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
      const a = Math.max(dt3(d1, d1), 1e-3), b = dt3(d1, L), c = dt3(d1, r), f = dt3(L, r);
      const s0 = clamp01((b * f - c) / Math.max(a - b * b, 1e-4));
      const t = Math.max(b * s0 + f, 0), s = clamp01((t * b - c) / a);
      dmin = Math.min(dmin, Math.hypot(A[0] + d1[0] * s - P[0] - L[0] * t, A[1] + d1[1] * s - P[1] - L[1] * t, A[2] + d1[2] * s - P[2] - L[2] * t));
    }
    return (1 - sstep(COL.shadowW, COL.shadowW + COL.shadowSoft, dmin)) * shadowStrength();
  }
  const shadowStrength = () => (st.impactAt !== null ? 1 - sstep(st.impactAt, st.impactAt + 3, st.tAbs) : 1) * (st.hcur > 1 ? 1 : 0);

  function uniforms(base, at) {
    CU.on.value = 1;
    CU.org.value.set(at.x, at.ground, at.z);
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
    const S = st.spine;
    if (S.length) { CU.s0.value.set(...S[0], 0); CU.s1.value.set(...S[NR >> 1], 0); CU.s2.value.set(...S[NR - 1], 0); }
    if (st.shL) CU.shL.value.set(st.shL[0], st.shL[1], st.shL[2], shadowStrength());
    // colours from the light that is around
    const amb = base.ambSky, hz = base.horizon;
    const sand = [0.62, 0.42, 0.24];
    const s1 = base.sun1Col, s2 = base.sun2Col, d1 = base.sun1Dir, d2 = base.sun2Dir;
    const E = [0, 1, 2].map((i) => s1[i] * Math.max(d1[1], 0.03) + s2[i] * Math.max(d2[1], 0.02) + amb[i] * 0.6 + hz[i] * 0.3);
    CU.dust.value.set(...E.map((e, i) => e * sand[i] * 1.6));
    // by day (a sun high) the body is dust-wrapped and low in contrast, not a grey pillar
    const dayW = sstep(0.12, 0.3, Math.max(d1[1], d2[1]));
    CU.bodyAmb.value.set(...[0, 1, 2].map((i) => lerp((amb[i] * 0.22 + hz[i] * 0.12) * sand[i], E[i] * sand[i] * 0.42, dayW)));
    CU.rim.value.set(BODY.rim * (1 - 0.5 * dayW), st.mouth, lerp(70, 170, dayW), lerp(0.75, 0.9, dayW));
    CU.look.value.set(lerp(BODY.fog, 0.85, dayW), BODY.cardFog, 0.62 * (st.shadowK || 1), 0);
  }
  function release() {
    CU.on.value = 0; CU.shL.value.w = 0; CU.swB.value.set(0, 0, 0, 0); CU.B.value.w = 0;
    st.placed = false; st.lift = 0; st.brace = 0; st.hcur = 0; st.bodyOn = 0; st.called = false;
  }

  // the wind: ducked from the hush to the settle (the drift dies), and back
  function wind() {
    const t = st.tAbs, T = COL.T;
    const duck = sstep(0, 6, t) * (1 - sstep(T.settle, T.back, t));
    return { strength: 0.12, gust: 0.2, mix: 0.85 * duck, figure: { k: 0, lamp: 1.2 * st.inShadow * (st.shadowK || 1), lampT: 1 } };
  }
  function camera() {
    const t = st.tAbs, T = COL.T;
    const shakeAt = st.impactAt !== null ? st.impactAt + st.impactD / 343 : null;
    const shake = shakeAt !== null ? (1 - sstep(0, 1, t - shakeAt)) * (t > shakeAt ? 1 : 0) : 0;
    return {
      amount: 0, lift: st.lift,
      toward: t > 2 && t < T.settle ? [st.B[0], st.B[2], COL.phases.indexOf(st.phase)] : null,
      shake,
    };
  }
  function trace() { return { healMul: st.tAbs < COL.T.settle ? 3 : 1 }; }
  function figure() {
    const t = st.tAbs;
    return { look: t > 1 && t < COL.T.back ? [st.B[0], st.B[2]] : null, brace: st.brace };
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
    if (t >= T.mouth + da && !st.callDone) { st.callDone = true; st.calls++; }
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
  return {
    COL, update, prepare, uniforms, release, wind, camera, trace, figure, strike, sound,
    readout: () => `${(st.dist / 1000).toFixed(1)} km at ${Math.round(((st.bearing / DEG) % 360 + 360) % 360)}, height ${Math.round(st.hcur)} m${st.inShadow > 0.5 ? ', in its shadow' : ''}`,
    state: () => ({ bearing: r1(((st.bearing / DEG) % 360 + 360) % 360), dist: Math.round(st.dist), height: Math.round(st.hcur), tAbs: r1(st.tAbs),
      sightline: st.sightline, inShadow: Math.round(st.inShadow * 100) / 100, impact: st.impactAt !== null ? r1(st.impactAt) : null, lift: Math.round(st.lift * 100) / 100,
      lastStrike: st.lastStrike }),
    raw: () => st,
    get st() { return st; },
    // the DOM line when it begins (main.js announces a live event's line once)
    announce: () => describe(st),
    api: {},
  };
}

// the DOM line a screen reader (and anyone) reads: where it is
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
export function describe(st) {
  // the world's x toward z bearings: 0 is +x (east), 90 is +z (south)
  const b = ((st.bearing / DEG) % 360 + 360) % 360, name = COMPASS[Math.round(b / 45) % 8];
  return `Far to the ${name}, about ${(st.dist / 1000).toFixed(1)} km, something rises from the sand.`;
}

// ---------------------------------------------------------------- the body and the sand (graphics)
const POOL = 160;
// the body's look (tuned on stills): how much of the haze lies over it, its rim's gain and sharpness
export const BODY = { fog: 0.26, cardFog: 0.75, rim: 3.0, rimPow: 4.0 };
export function createColossusBody({ U, scene, event, fns, reduced = false }) {
  const st = event.st;
  const NR = 64, NS = 24;
  const finish = fns.finish;
  const fogOf = (P, clampSun = false) => {
    const toP = P.sub(cameraPosition).toVar(), d = max(length(toP), 1.0).toVar(), rd = toP.div(d).toVar();
    const f = fns.fogAmount(cameraPosition, rd, d);
    let fc = mix(fns.skyColor(rd, float(0.0)), U.uFogCol, U.uFogColMix.mul(0.6));
    // (in front of the body the sun's own glow is not in the haze: it would show the disc through it)
    if (clampSun) fc = min(fc, U.uHorizon.mul(1.25).add(U.uFogCol.mul(0.1)));
    return vec4(fc, f);
  };

  // ---- the body: a tube on the spine
  const nv = NR * (NS + 1);
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), sAt = new Float32Array(nv);
  const idx = [];
  for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NS; j++) {
    const a = i * (NS + 1) + j, b = a + NS + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j <= NS; j++) sAt[i * (NS + 1) + j] = i / (NR - 1);
  const geo = new THREE.BufferGeometry();
  const pA = new THREE.BufferAttribute(pos, 3), nA = new THREE.BufferAttribute(nrm, 3);
  pA.setUsage(THREE.DynamicDrawUsage); nA.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pA); geo.setAttribute('normal', nA); geo.setAttribute('aS', new THREE.BufferAttribute(sAt, 1));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const aS = attribute('aS', 'float');
  mat.fragmentNode = Fn(() => {
    const P = positionWorld.toVar();
    const V = normalize(cameraPosition.sub(P)).toVar();
    const n0 = normalize(normalLocal).toVar();
    const inside = dot(n0, V).lessThan(0.0);
    const n = mix(n0, n0.negate(), float(inside)).toVar();
    const ndv = max(dot(n, V), 0.0).toVar();
    // streaks in the hide (in the normal's light only; nothing to count)
    const st2 = mx_noise_float(vec3(P.x.mul(0.05), P.y.mul(0.012), P.z.mul(0.05))).mul(0.5).add(0.5);
    const rimF = pow(float(1.0).sub(ndv), BODY.rimPow).mul(st2.mul(0.6).add(0.7)).toVar();
    const sun = (L, C) => {
      const back = pow(max(dot(V.negate(), L), 0.0), 2.0).mul(0.8).add(0.2);
      const up = smoothstep(-0.03, 0.03, L.y);
      return C.mul(up).mul(rimF.mul(back).mul(CU.rim.x).add(max(dot(n, L), 0.0).mul(0.12)));
    };
    const col = CU.bodyAmb.mul(st2.mul(0.7).add(0.6)).add(sun(U.uSun1Dir, U.uSun1Col)).add(sun(U.uSun2Dir, U.uSun2Col)).toVar();
    col.mulAssign(float(1.0).sub(float(inside).mul(0.85)));
    // the head opened: darker there
    col.mulAssign(float(1.0).sub(smoothstep(0.95, 1.0, aS).mul(CU.rim.y).mul(0.8)));
    // its own dust low down (the shroud), then the evening's haze
    const above = P.y.sub(CU.B.y);
    col.assign(mix(col, CU.dust.mul(0.55), exp(max(above, 0.0).div(CU.rim.z).negate()).mul(CU.rim.w)));
    // (the haze over it held to CU.rim's share: a silhouette against the glow, not a ghost in it)
    const fg = fogOf(P, true);
    col.assign(mix(col, fg.xyz, fg.w.mul(CU.look.x)));
    return vec4(finish(col), 1.0);
  })();
  const body = new THREE.Mesh(geo, mat);
  body.visible = false; body.renderOrder = 1;
  scene.add(body);

  function writeBody() {
    const S = st.spine, R = COL.R, L = COL.bury + st.hcur;
    let u = null;
    for (let i = 0; i < NR; i++) {
      const p = S[i], q = S[Math.min(NR - 1, i + 1)], o = S[Math.max(0, i - 1)];
      let t = [q[0] - o[0], q[1] - o[1], q[2] - o[2]]; const tl = Math.hypot(...t) || 1; t = t.map((x) => x / tl);
      if (!u) { const a = st.away; u = [a[1] * t[1] - 0, a[0] * 0 - 0 * t[1], 0]; u = [t[1] * 0 - 0 * 0, 0, 0]; u = [-a[1], 0, a[0]]; }
      const ud = u[0] * t[0] + u[1] * t[1] + u[2] * t[2];
      u = [u[0] - t[0] * ud, u[1] - t[1] * ud, u[2] - t[2] * ud]; const ul = Math.hypot(...u) || 1; u = u.map((x) => x / ul);
      const v = [t[1] * u[2] - t[2] * u[1], t[2] * u[0] - t[0] * u[2], t[0] * u[1] - t[1] * u[0]];
      const a = (i / (NR - 1)) * L;
      let r = R * (1.12 - 0.3 * (a / L)) * (1 + 0.1 * Math.sin(a / 41 + 1.3) + 0.06 * Math.sin(a / 17 + 0.4)), dr = 0;
      const cap = R * 0.9;
      if (a > L - cap) { const k = (a - (L - cap)) / cap; const open = 0.75 * st.mouth; const f = Math.sqrt(Math.max(0, 1 - k * k)); r *= Math.max(open, f); dr = open > f ? 0 : -k / Math.max(f, 0.15); }
      for (let j = 0; j <= NS; j++) {
        const ang = (j / NS) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
        const rx = u[0] * c + v[0] * s, ry = u[1] * c + v[1] * s, rz = u[2] * c + v[2] * s;
        const k3 = (i * (NS + 1) + j) * 3;
        pos[k3] = p[0] + rx * r; pos[k3 + 1] = p[1] + ry * r; pos[k3 + 2] = p[2] + rz * r;
        let nx = rx - t[0] * dr, ny = ry - t[1] * dr, nz = rz - t[2] * dr; const nl = Math.hypot(nx, ny, nz) || 1;
        nrm[k3] = nx / nl; nrm[k3 + 1] = ny / nl; nrm[k3 + 2] = nz / nl;
      }
    }
    pA.needsUpdate = true; nA.needsUpdate = true;
    const m = S[NR >> 1];
    geo.boundingSphere.center.set(m[0], m[1], m[2]); geo.boundingSphere.radius = L / 2 + COL.R * 2 + 60;
  }

  // ---- the sand: one instanced sprite of soft cards
  const posA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 3), 3);
  const datA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);   // size x, size y, alpha, seed
  const extA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);   // ground y, gold, thickness, age
  for (const a of [posA, datA, extA]) a.setUsage(THREE.DynamicDrawUsage);
  const Pn = instancedDynamicBufferAttribute(posA, 'vec3'), Dn = instancedDynamicBufferAttribute(datA, 'vec4'), En = instancedDynamicBufferAttribute(extA, 'vec4');
  const smat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  smat.positionNode = Pn; smat.scaleNode = Dn.xy;
  const dens = Fn(() => {
    const q = uv().sub(0.5).mul(2.0).toVar(), r = length(q).toVar();
    const env = exp(r.mul(r).mul(-2.0)).mul(float(1.0).sub(smoothstep(0.75, 1.0, r))).toVar();
    const nz = mx_noise_float(vec3(q.mul(1.3), Dn.w.mul(17.0).add(En.w.mul(1.1)))).mul(0.5).add(0.5);
    const nz2 = mx_noise_float(vec3(q.mul(3.6), Dn.w.mul(29.0).add(En.w.mul(1.9)))).mul(0.5).add(0.5);
    const d = env.mul(smoothstep(En.w.mul(0.3).add(0.2), 0.9, nz.mul(0.65).add(nz2.mul(0.35)).add(env.mul(0.35)))).toVar();
    const wy = Pn.y.add(uv().y.sub(0.5).mul(Dn.y));
    return d.mul(smoothstep(En.x.sub(Dn.y.mul(0.04)), En.x.add(Dn.y.mul(0.16)), wy));
  });
  const dN = dens().toVar();
  smat.opacityNode = float(1.0).sub(exp(dN.mul(En.z).mul(-4.0))).mul(Dn.z);
  smat.colorNode = Fn(() => {
    const V = normalize(cameraPosition.sub(Pn)).toVar();
    const sun = (L, C) => {
      const up = smoothstep(-0.03, 0.04, L.y);
      const fwd = pow(max(dot(V.negate(), L), 0.0), 6.0).mul(float(1.2).sub(dN.mul(1.1)).max(0.05)).mul(mix(float(1.2), float(2.6), En.y));
      return C.mul(up).mul(max(L.y, 0.0).mul(0.4).add(0.22).add(fwd));
    };
    const light = sun(U.uSun1Dir, U.uSun1Col).add(sun(U.uSun2Dir, U.uSun2Col)).add(U.uAmbSky.mul(0.55)).add(U.uAmbGround.mul(0.35));
    const alb = U.uSand.mul(mix(float(0.85), float(1.05), En.y));
    const c = alb.mul(light).mul(float(1.0).sub(dN.mul(0.6))).toVar();
    const fg = fogOf(Pn);
    c.assign(mix(c, fg.xyz, fg.w.mul(CU.look.y)));
    return finish(c);
  })();
  const sprite = new THREE.Sprite(smat);
  sprite.count = POOL; sprite.frustumCulled = false; sprite.renderOrder = 1; sprite.visible = false;
  scene.add(sprite);

  const ps = [];
  let live = 0, acc = { plume: 0, curtain: 0, shroud: 0, mouth: 0, funnel: 0 }, last = -1;
  const rnd = (() => { let s = 7654321; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
  function spawn(o) {
    if (ps.length >= POOL) { let k = 0; for (let i = 1; i < ps.length; i++) if (ps[i].age / ps[i].life > ps[k].age / ps[k].life) k = i; ps.splice(k, 1); }
    ps.push({ age: 0, seed: rnd(), drag: 0, gold: 0, thick: 1, ...o });
  }
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  function emit(dt) {
    const t = st.tAbs, T = COL.T, B = st.B;
    const wdx = WX, wdz = WZ;
    // the swell's plumes, gold in the low sun (reduced motion: appearing in place along its path)
    if (t > T.swell && t < T.swellEnd + 1) {
      acc.plume += dt * 10;
      while (acc.plume > 1) {
        acc.plume--;
        const h = st.swHead || [B[0], B[2]];
        const along = reduced ? rnd() : 0;
        const px = reduced ? lerp(st.swA[0], B[0], along) : h[0], pz = reduced ? lerp(st.swA[1], B[2], along) : h[1];
        const x = px + (rnd() - 0.5) * 80, z = pz + (rnd() - 0.5) * 80, g = height(x, z);
        spawn({ x, y: g + 8 + rnd() * 12, z, vx: reduced ? 0 : wdx * 6, vy: reduced ? 0.5 : 5 + 5 * rnd(), vz: reduced ? 0 : wdz * 6, size: 40 + 34 * rnd(), grow: 2.4, life: 7 + 3 * rnd(), alpha: 0.55, gold: 1, gy: g });
      }
    }
    // the funnel: dust round its rim as it sinks
    if (t > T.swellEnd && t < T.funnelEnd + 2) {
      acc.funnel += dt * 4;
      while (acc.funnel > 1) {
        acc.funnel--;
        const a = rnd() * Math.PI * 2, r = COL.funnel * (0.6 + 0.5 * rnd()), x = B[0] + Math.cos(a) * r, z = B[2] + Math.sin(a) * r, g = height(x, z);
        spawn({ x, y: g + 10, z, vx: wdx * 3 - Math.cos(a) * 4, vy: 2, vz: wdz * 3 - Math.sin(a) * 4, size: 60 + 40 * rnd(), grow: 1.8, life: 10, alpha: 0.5, gold: 0.5, gy: g });
      }
    }
    // the curtains off its flanks, and the shroud at its base
    if (st.bodyOn && st.hcur > 20) {
      acc.curtain += dt * (st.tAbs < T.fall ? 14 : 5);
      while (acc.curtain > 1) {
        acc.curtain--;
        const S = st.spine, i0 = Math.floor(COL.bury / (COL.bury + st.hcur) * 63);
        const i = Math.min(62, i0 + 2 + Math.floor(rnd() * (63 - i0 - 3)));
        const p = S[i], a = rnd() * Math.PI * 2, r = COL.R * 0.9;
        const x = p[0] + Math.cos(a) * r, z = p[2] + Math.sin(a) * r, g = height(x, z);
        spawn({ x, y: p[1], z, vx: reduced ? 0 : wdx * (6 + 5 * rnd()), vy: reduced ? 0 : -(6 + 6 * rnd()), vz: reduced ? 0 : wdz * (6 + 5 * rnd()),
          size: 30 + 30 * rnd(), aspect: 1.9, grow: 2.1, life: 9 + 4 * rnd(), alpha: 0.8, gold: 0.7, thick: 1.3, gy: g, floor: g + 8 });
      }
      acc.shroud += dt * 1.6;
      while (acc.shroud > 1) {
        acc.shroud--;
        const a = rnd() * Math.PI * 2, r = COL.R * (0.8 + 1.4 * rnd()), x = B[0] + Math.cos(a) * r, z = B[2] + Math.sin(a) * r, g = height(x, z);
        spawn({ x, y: g + 25, z, vx: wdx * 4, vy: 1.5, vz: wdz * 4, size: 90 + 60 * rnd(), grow: 1.6, life: 14, alpha: 0.55, gold: 0.3, gy: g });
      }
    }
    // the open head: sand falling out of it, light through it
    if (st.mouth > 0.2 && st.bodyOn) {
      acc.mouth += dt * 6;
      while (acc.mouth > 1) {
        acc.mouth--;
        const h = st.head;
        spawn({ x: h[0] + (rnd() - 0.5) * 50, y: h[1] - 10, z: h[2] + (rnd() - 0.5) * 50, vx: wdx * 5, vy: reduced ? 0 : -8 - 6 * rnd(), vz: wdz * 5, size: 30 + 20 * rnd(), aspect: 1.6, grow: 2, life: 8, alpha: 0.65, gold: 1, gy: height(h[0], h[2]) });
      }
    }
    // the dome, once, at the impact (reduced motion: already rising)
    if (st.impactAt !== null && last !== st.impactAt) {
      last = st.impactAt;
      const I = st.impactP, n = 40, pre = reduced ? 0.4 : 0;
      for (let k = 0; k < n; k++) {
        const a = rnd() * Math.PI * 2, el = Math.pow(rnd(), 1.6) * 1.1;
        const sp = 60 + 60 * rnd();
        const o = { x: I[0], y: I[1] + 10, z: I[2], vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp * 0.45 + 8, vz: Math.sin(a) * Math.cos(el) * sp,
          drag: 0.28, size: 70 + 80 * rnd(), aspect: 0.55 + 0.3 * rnd(), grow: 2.6, life: 24 + 8 * rnd(), alpha: 0.9, gold: 0.5, thick: 1.6, gy: I[1], dome: 1 };
        if (pre) { const tt = 4; o.x += o.vx * tt * 0.6; o.y += o.vy * tt * 0.6; o.z += o.vz * tt * 0.6; o.age = tt; }
        spawn(o);
      }
    }
  }
  // the ground wave near the walker: a ring of crest puffs running outward past it (not reduced)
  let waveDone = null;
  function wave() {
    if (reduced || st.waveAt === null || waveDone === st.waveAt || !st.env) return;
    if (st.tAbs < st.waveAt - 0.6) return;
    waveDone = st.waveAt;
    const I = st.impactP, E = st.env, base = Math.atan2(E.z - I[2], E.x - I[0]);
    for (let k = 0; k < 40; k++) {
      const rr = st.impactD + (rnd() - 0.4) * 120, a = base + (rnd() - 0.5) * (240 / st.impactD);
      const x = I[0] + Math.cos(a) * rr, z = I[2] + Math.sin(a) * rr, g = height(x, z);
      const delay = (rr - st.impactD) / COL.wave + 0.6;
      spawn({ x, y: g + 0.8, z, vx: Math.cos(a) * 3 + WX * 2, vy: 1.5, vz: Math.sin(a) * 3 + WZ * 2, size: 3 + 4 * rnd(), grow: 2.5, life: 2.5 + rnd(), alpha: 0.55, gold: 0.2, gy: g, wait: Math.max(0, delay) });
    }
  }

  function update(dt, camera) {
    const on = st.phase !== 'none' && CU.on.value > 0.5;
    if (!on) { if (sprite.visible || body.visible) { body.visible = false; sprite.visible = false; ps.length = 0; } return; }
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    sph.center.set(st.B[0], st.B[1] + 150, st.B[2]); sph.radius = 700 + st.H;
    const inView = frustum.intersectsSphere(sph);
    body.visible = !!st.bodyOn && inView;
    if (st.bodyOn) writeBody();
    const sdt = dt * (reduced ? 1 : 1);
    emit(sdt); wave();
    // the sim
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      if (p.wait > 0) { p.wait -= sdt; continue; }
      p.age += sdt;
      if (p.age > p.life) { ps.splice(i, 1); continue; }
      if (p.drag) { const k = Math.exp(-sdt * p.drag); p.vx = p.vx * k + WX * 4 * (1 - k); p.vz = p.vz * k + WZ * 4 * (1 - k); p.vy *= k; }
      p.x += p.vx * sdt; p.y += p.vy * sdt; p.z += p.vz * sdt;
      if (p.floor !== undefined && p.y < p.floor) { p.y = p.floor; p.vy = 0.5; }
    }
    live = 0;
    const pa = posA.array, da = datA.array, ea = extA.array;
    // the wave's puffs are near; the rest only drawn when the colossus is in view
    for (const p of ps) {
      if (p.wait > 0) continue;
      if (!inView && p.size > 10) continue;
      const u = p.age / p.life, s = p.size * (1 + (p.grow - 1) * Math.sqrt(u));
      const a = p.alpha * sstep(0, 0.12, u) * (1 - sstep(0.55, 1, u));
      pa[live * 3] = p.x; pa[live * 3 + 1] = p.y; pa[live * 3 + 2] = p.z;
      da[live * 4] = s; da[live * 4 + 1] = s * (p.aspect || 1); da[live * 4 + 2] = a; da[live * 4 + 3] = p.seed;
      ea[live * 4] = p.gy; ea[live * 4 + 1] = p.gold; ea[live * 4 + 2] = p.thick; ea[live * 4 + 3] = u;
      live++;
    }
    for (let i = live; i < Math.min(POOL, live + 8); i++) { da[i * 4] = 0; da[i * 4 + 1] = 0; da[i * 4 + 2] = 0; }
    posA.needsUpdate = datA.needsUpdate = extA.needsUpdate = true;
    sprite.visible = live > 0;
    sprite.count = POOL;
    for (let i = live; i < POOL; i++) { da[i * 4] = 0; da[i * 4 + 1] = 0; }
  }
  function clear() { ps.length = 0; body.visible = false; sprite.visible = false; }
  return { update, clear, body, sprite, get live() { return live; } };
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
      ground: groundHook, sky: () => {},   // (nothing of it in the sky shader: the body and the sand are meshes)
      fog: colossusFog,
      particles: ({ U, scene, fns }) => (fns ? (body = createColossusBody({ U, scene, event, fns, reduced })) : null),
      readout: () => `sand ${body ? body.live : 0}`,
    };
  },
};
