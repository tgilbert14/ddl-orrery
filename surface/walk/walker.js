// Dust Sea walk: the walker. Plain JavaScript on the shared height formula (../look-test/height.js),
// no DOM and no three.js, so it runs in node for route planning and tests.
//
// One update per frame: update(dt, intent) where intent is
//   { fwd -1..1, strafe -1..1, run bool, turn -1..1 (keyboard Q/E), lookX, lookY (radians this frame),
//     target {x, z} | null (walk there on your own), cancelTarget bool,
//     third person only: wish [x, z] (a world direction, length 0..1, replaces fwd/strafe) and
//     face bool (walk only where you face: the wish is projected onto the heading, and the caller
//     turns the heading toward s.wishX, s.wishZ at a limited rate), climbStride k (third person:
//     the stride is divided by 1 + k * rise per metre while walking uphill) }
// and the walker reports footfalls (for prints and sound) and slide marks (for the trough) as events.
//
// Units: metres, seconds, radians. Heading is the look test's convention: x toward z, forward is
// (cos h, sin h), right is (-sin h, cos h).

import { height, heightD, WIND } from '../look-test/height.js';
import { DEG } from '../look-test/params.js';

export const WALK = {
  eye: 1.7,             // eye above the ground under the feet (before sink and bob)
  walk: 1.6, run: 4.5,  // m/s on the flat
  accelTau: 0.22,       // speed follows the wish with this time constant (s)
  climbK: 2.6,          // uphill: speed / (1 + climbK * rise per metre); 11 deg windward -> 0.64x
  descendK: 0.5, descendMax: 0.25, // downhill: speed * (1 + descendK * min(fall per metre, descendMax))
  noClimbDeg: 28,       // above this you cannot walk uphill (the uphill part of your wish is dropped)
  slideLoDeg: 22, slideHiDeg: 30, // the slide grows from nothing to full between these slopes
  slideMax: 2.6,        // m/s down a slip face at full slide
  slideTau: 0.45,       // the slide speeds up and dies away with this time constant (s)
  maxSpeed: 5.6,        // walking or running plus sliding never goes faster than this (m/s)
  sinkBase: 0.02,       // feet sink this far on firm sand (m) ...
  sinkSlip: 0.045,      // ... and this much more on a slip face ...
  sinkRun: 0.008,       // ... and a little more running
  strideWalk: 0.72, strideRun: 1.3, // one step (m)
  bobWalk: 0.018, bobRun: 0.03,     // head bob, half the peak-to-peak (m); lowest at each footfall
  sway: 0.010,          // sideways sway (m), one cycle per two steps
  footSep: 0.11,        // a foot lands this far either side of the line of travel (m)
  footAvgR: 0.15,       // the eye follows the mean ground under a 0.3 m footprint, not one point
  turnRate: 1.7,        // Q/E (rad/s)
  autoTurn: 1.3,        // tap-to-walk turns you toward the target at up to this rate (rad/s)
  autoRunDist: 30,      // tap-to-walk runs when the target is further than this (m)
  pitchMin: -1.15, pitchMax: 0.9,
};

// The crest leap (third person only: intent.leap). Running over a brink, the figure is carried off
// it: each frame, while running, the path it would fly from here is worked out (its horizontal
// velocity, a vertical speed from the ground's slope under it plus a running stride's own lift,
// under gravity); if within one running step that path clears the sand by more than `thresh`, it
// takes off. In the air its horizontal velocity is kept (a little air control) and it falls from the
// take-off speed; it lands when its feet reach the sand (the crossing is found within the frame, so
// the landing point does not depend on the frame rate). Landing on a slip face starts the slide with
// the speed it carried; on gentler sand it is a heavy step that loses speed.
export const LEAP = {
  g: 7.0,          // m/s^2 in the air. Not 9.81: at true gravity no brink in this field throws a runner
                   // clear (the sharpest, the dusk crest's, turns from flat to 25 degrees over 1.2 m, a
                   // radius of about 3 m; v^2/R at 4.1 m/s is under g). 0.71 g: the cloak's drag, stylised
  push: 0.8,       // m/s: a running stride's own lift at full run (a runner's flight phase), added to the
                   // ground's vertical speed under the moving figure
  vyMax: 1.0,      // never an upward launch faster than this (m/s)
  spring: 1.5,     // m/s: once a brink is found, the Pilgrim springs off the lip by this much more (the
                   // lead's call: the passive path alone cleared the sand by only 0.2 m, a hop)
  minRun: 0.6,     // the share of running needed (about 3.3 m/s on the flat)
  thresh: 0.15,    // take off when the flight path clears the sand by more than this within one step (m)
  samples: 8,      // points along that path
  airTau: 3.0,     // air control: the horizontal velocity follows the wish with this time constant (s)
  cool: 0.4,       // seconds after a landing before another take-off
  slipDeg: 22,     // landing on a face steeper than this starts the slide with the speed carried
  heavyKeep: 0.6,  // landing on gentler sand keeps this share of the speed (a heavy step)
  maxAir: 3.0,     // a safety: no flight lasts longer (s)
};

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// the mean ground under the footprint: the eye does not jitter on a brink's kink
export function footHeight(x, z, r = WALK.footAvgR) {
  return (2 * height(x, z) + height(x + r, z) + height(x - r, z) + height(x, z + r) + height(x, z - r)) / 6;
}

// how exposed a point is: 1 on a crest that stands above its surroundings, 0 in a sheltered trough
export function exposureAt(x, z) {
  const h = height(x, z);
  let m = 0;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; m += height(x + 35 * Math.cos(a), z + 35 * Math.sin(a)); }
  return smooth(-5, 4, h - m / 8);
}

// first hit of a ray with the ground (camera picking for tap-to-walk); null if it leaves for the sky
export function raycastGround(o, d, maxDist = 2500) {
  let t = 0.3, prevT = t, prevGap = o[1] + d[1] * t - height(o[0] + d[0] * t, o[2] + d[2] * t);
  if (prevGap < 0) return null;
  while (t < maxDist) {
    t += clamp(prevGap * 0.6, 0.05, 2 + t * 0.03);
    const y = o[1] + d[1] * t, gx = o[0] + d[0] * t, gz = o[2] + d[2] * t;
    const gap = y - height(gx, gz);
    if (gap < 0) {
      let a = prevT, b = t;
      for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (o[1] + d[1] * m - height(o[0] + d[0] * m, o[2] + d[2] * m) > 0) a = m; else b = m; }
      return { x: o[0] + d[0] * b, z: o[2] + d[2] * b, t: b };
    }
    if (y > 80 && d[1] > 0) return null;
    prevT = t; prevGap = gap;
  }
  return null;
}

export function createWalker({ x, z, headingDeg = 0, pitchDeg = 0, reducedMotion = false }) {
  const s = {
    x, z, yaw: headingDeg * DEG, pitch: pitchDeg * DEG,
    vx: 0, vz: 0,          // walking velocity
    sx: 0, sz: 0,          // slide velocity
    speed: 0, sliding: 0, slopeDeg: 0, running: 0,
    ground: footHeight(x, z), groundPoint: height(x, z),
    sink: WALK.sinkBase, bob: 0, swayX: 0, eyeY: 0,
    phase: 0, side: 1, steps: 0, distance: 0, slideDist: 0,
    target: null, targetStall: 0, targetBest: Infinity, wishX: 0, wishZ: 0,
    exposure: exposureAt(x, z), exposureT: 0,
    // the crest leap (third person): airborne 0/1, this (or the last) flight's time, the feet's height
    // above the sand under them, their vertical speed, the flight's highest point, time since landing
    airborne: 0, airTime: 0, airHeight: 0, airVy: 0, airMax: 0, sinceLand: 99,
    feetY: height(x, z), air: null,
  };
  s.eyeY = s.ground + WALK.eye - s.sink;

  function update(dt, intent = {}) {
    const events = [];
    dt = clamp(dt, 0, 0.1);
    // the leap is third person only: called without it (first person, V mid-flight), the feet are put
    // back on the sand
    if (s.airborne && !intent.leap) { s.airborne = 0; s.air = null; s.airHeight = 0; s.airVy = 0; }
    const air = s.airborne === 1;
    if (intent.leap) s.sinceLand += dt;
    // ---- look
    s.yaw = wrapPi(s.yaw + (intent.turn || 0) * WALK.turnRate * dt + (intent.lookX || 0));
    s.pitch = clamp(s.pitch + (intent.lookY || 0), WALK.pitchMin, WALK.pitchMax);

    // ---- the wish: keys or thumb, else the tap target
    const fx = Math.cos(s.yaw), fz = Math.sin(s.yaw), rx = -fz, rz = fx;
    let mx = (intent.fwd || 0) * fx + (intent.strafe || 0) * rx;
    let mz = (intent.fwd || 0) * fz + (intent.strafe || 0) * rz;
    if (intent.wish) { mx = intent.wish[0]; mz = intent.wish[1]; }
    let m = Math.hypot(mx, mz);
    let run = !!intent.run;
    if (m > 0.05 || intent.cancelTarget) s.target = null;
    if (intent.target) { s.target = { x: intent.target.x, z: intent.target.z }; s.targetStall = 0; s.targetBest = Infinity; }
    if (s.target && m <= 0.05) {
      const dx = s.target.x - s.x, dz = s.target.z - s.z, d = Math.hypot(dx, dz);
      if (d < 0.35) s.target = null;
      else {
        // no progress for 3 s (a slip face you cannot climb): give up
        if (d < s.targetBest - 0.05) { s.targetBest = d; s.targetStall = 0; } else s.targetStall += dt;
        if (s.targetStall > 3) s.target = null;
        else {
          mx = dx / d; mz = dz / d; m = Math.min(1, d / 1.2 + 0.25);
          run = d > WALK.autoRunDist;
          if (!intent.face && !intent.reducedMotion && !reducedMotion) {
            const want = Math.atan2(dz, dx), dy = wrapPi(want - s.yaw);
            s.yaw = wrapPi(s.yaw + clamp(dy, -WALK.autoTurn * dt, WALK.autoTurn * dt));
          }
        }
      }
    }
    if (m > 1) { mx /= m; mz /= m; m = 1; }
    s.wishX = mx; s.wishZ = mz;
    if (intent.face && m > 0.01) {
      // a figure walks where it faces: turning round, it slows and turns before it walks off
      const c = (mx * fx + mz * fz) / m, k = smooth(-0.1, 0.92, c);
      mx = fx * m * k; mz = fz * m * k; m *= k;
    }

    // ---- the slope under the feet
    const [, gx, gz] = heightD(s.x, s.z);
    const slope = Math.hypot(gx, gz);
    const theta = Math.atan(slope);
    s.slopeDeg = theta / DEG;
    const ux = slope > 1e-6 ? gx / slope : 0, uz = slope > 1e-6 ? gz / slope : 0; // uphill unit vector

    let dx = 0, dz = 0;
    if (m > 0.01) { dx = mx / m; dz = mz / m; }
    // a slip face: the uphill part of the wish is dropped (you can cross it and go down it, not up)
    if (theta > WALK.noClimbDeg * DEG) {
      const u = dx * ux + dz * uz;
      if (u > 0) { dx -= u * ux; dz -= u * uz; }
    }
    const dl = Math.hypot(dx, dz);
    const rise = dl > 1e-6 ? (gx * dx + gz * dz) / dl : 0;  // rise per metre along the wish
    const factor = rise > 0 ? 1 / (1 + WALK.climbK * rise) : 1 + WALK.descendK * Math.min(-rise, WALK.descendMax);
    let wishSpeed = (run ? WALK.run : WALK.walk) * m * factor;
    // the storm front (intent.storm = { k 0..1, gust 0..1, ...STORM }): into the wind is slower (to
    // 60%), with it a little faster, running is capped lower; across it you are nudged downwind
    // (below). Not passed, or k = 0: unchanged
    const sk = intent.storm && intent.storm.k > 0 ? intent.storm.k : 0;
    let nudge = 0;
    if (sk > 0 && dl > 1e-6) {
      const S = intent.storm, along = (dx * WIND[0] + dz * WIND[1]) / dl, g = 0.85 + 0.3 * (S.gust ?? 0.5);
      wishSpeed *= along < 0 ? 1 + S.intoWind * sk * g * along : 1 + S.withWind * sk * along;
      if (run) wishSpeed = Math.min(wishSpeed, (WALK.run - S.runCap * sk) * m * factor);
      nudge = S.nudge * sk * g * Math.sqrt(Math.max(0, 1 - along * along));
    }
    const tvx = dx * wishSpeed, tvz = dz * wishSpeed;  // dx,dz already carry |dl| <= 1
    const ka = 1 - Math.exp(-dt / (air ? LEAP.airTau : WALK.accelTau));
    s.vx += (tvx - s.vx) * ka; s.vz += (tvz - s.vz) * ka;

    // ---- the slide: down the fall line, growing with the slope (in the air it is carried as it was)
    if (!air) {
      const slideTarget = WALK.slideMax * smooth(WALK.slideLoDeg * DEG, WALK.slideHiDeg * DEG, theta);
      const ks = 1 - Math.exp(-dt / WALK.slideTau);
      s.sx += (-ux * slideTarget - s.sx) * ks; s.sz += (-uz * slideTarget - s.sz) * ks;
    }

    const px = s.x, pz = s.z;
    // running down a slip face does not add up without limit
    let tx = s.vx + s.sx, tz = s.vz + s.sz;
    if (nudge > 0 && !air) { const kw = smooth(0.2, 1.0, Math.hypot(s.vx, s.vz)) * nudge; tx += WIND[0] * kw; tz += WIND[1] * kw; }
    const tot = Math.hypot(tx, tz);
    if (tot > WALK.maxSpeed) { tx *= WALK.maxSpeed / tot; tz *= WALK.maxSpeed / tot; }
    s.x += tx * dt; s.z += tz * dt;
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) { s.x = px; s.z = pz; s.vx = s.vz = s.sx = s.sz = 0; }

    const walkSpeed = Math.hypot(s.vx, s.vz);
    const slideSpeed = Math.hypot(s.sx, s.sz);
    s.speed = Math.min(tot, WALK.maxSpeed);
    s.sliding = clamp(slideSpeed / WALK.slideMax, 0, 1);
    s.running = clamp((walkSpeed - WALK.walk) / (WALK.run - WALK.walk), 0, 1);
    const moved = Math.hypot(s.x - px, s.z - pz);
    s.distance += moved;

    // ---- the crest leap (third person only)
    if (air) {
      const A = s.air;
      A.t += dt;
      const yPrev = s.feetY, sepPrev = yPrev - height(px, pz);
      const y = A.y0 + A.vy0 * A.t - 0.5 * LEAP.g * A.t * A.t;
      const gp = height(s.x, s.z), sep = y - gp;
      s.feetY = y; s.airVy = A.vy0 - LEAP.g * A.t; s.airTime = A.t;
      s.airHeight = Math.max(0, sep); s.airMax = Math.max(s.airMax, sep);
      if (sep <= 0 || A.t > LEAP.maxAir) {
        // the feet reached the sand during this frame: where and when (linear within the frame)
        const f = sepPrev > 0 && sep < 0 ? clamp(sepPrev / (sepPrev - sep), 0, 1) : 1;
        const lx = px + (s.x - px) * f, lz = pz + (s.z - pz) * f, tl = A.t - (1 - f) * dt;
        const vyL = A.vy0 - LEAP.g * tl;
        const [, lgx, lgz] = heightD(lx, lz), ls = Math.hypot(lgx, lgz), lth = Math.atan(ls);
        const hv = Math.hypot(s.vx + s.sx, s.vz + s.sz);
        const dirX = hv > 0.05 ? (s.vx + s.sx) / hv : Math.cos(s.yaw), dirZ = hv > 0.05 ? (s.vz + s.sz) / hv : Math.sin(s.yaw);
        const slip = lth > LEAP.slipDeg * DEG;
        if (slip) {
          // onto a slip face: the fall's speed along the face feeds the slide (no dead stop)
          const ulx = ls > 1e-6 ? lgx / ls : 0, ulz = ls > 1e-6 ? lgz / ls : 0;
          const along = Math.min(WALK.slideMax, Math.abs(vyL) * Math.sin(lth) * Math.cos(lth));
          s.sx -= ulx * along; s.sz -= ulz * along;
        } else {
          // gentler sand: a heavy step that loses speed
          s.vx *= LEAP.heavyKeep; s.vz *= LEAP.heavyKeep; s.sx *= LEAP.heavyKeep; s.sz *= LEAP.heavyKeep;
        }
        s.airborne = 0; s.air = null; s.airHeight = 0; s.airVy = 0; s.airTime = tl; s.sinceLand = 0;
        s.feetY = height(s.x, s.z);
        events.push({ type: 'land', x: lx, z: lz, speed: hv, vy: vyL, slopeDeg: lth / DEG, slip, airTime: tl, height: s.airMax,
          dirX, dirZ, exposure: s.exposure });
      }
    } else if (intent.leap) {
      s.feetY = height(s.x, s.z);
      const v = Math.hypot(tx, tz);
      if (run && s.running > LEAP.minRun && s.sliding < 0.3 && s.sinceLand > LEAP.cool && v > 1) {
        // the path it would fly from here: the ground's vertical speed under it plus a stride's lift
        const [, gx2, gz2] = heightD(s.x, s.z);
        const vyT = Math.min(LEAP.vyMax, gx2 * tx + gz2 * tz + LEAP.push * s.running);
        const y0 = s.feetY, H = WALK.strideRun / v;
        let best = -1;
        for (let k = 1; k <= LEAP.samples; k++) {
          const t = (H * k) / LEAP.samples;
          best = Math.max(best, y0 + vyT * t - 0.5 * LEAP.g * t * t - height(s.x + tx * t, s.z + tz * t));
        }
        if (best > LEAP.thresh) {
          const vy0 = vyT + LEAP.spring;                 // the brink is found with the passive path; the leap itself springs off it
          s.airborne = 1; s.air = { t: 0, y0, vy0 }; s.airTime = 0; s.airHeight = 0; s.airVy = vy0; s.airMax = 0;
          events.push({ type: 'leap', x: s.x, z: s.z, vy: vy0, speed: v, clear: best });
        }
      }
    }
    const flying = air || s.airborne === 1;

    // ---- feet: stride phase, footfalls, the slide trough (none in the air)
    let stride = WALK.strideWalk + (WALK.strideRun - WALK.strideWalk) * s.running;
    // third person only (intent.climbStride): shorter steps up a slope
    if (intent.climbStride) stride /= 1 + intent.climbStride * clamp(rise, 0, 0.35) * (1 - s.running);
    const prevPhase = s.phase;
    if (!flying) s.phase += (walkSpeed * dt) / stride;
    s.sink = WALK.sinkBase + WALK.sinkSlip * smooth(WALK.slideLoDeg * DEG, 31 * DEG, theta) + WALK.sinkRun * s.running;
    if (Math.floor(s.phase) > Math.floor(prevPhase)) {
      s.side = -s.side; s.steps++;
      // the print points along the walk, not along the slide
      const hx = walkSpeed > 0.05 ? s.vx / walkSpeed : Math.cos(s.yaw), hz = walkSpeed > 0.05 ? s.vz / walkSpeed : Math.sin(s.yaw);
      const fxp = s.x - hz * WALK.footSep * s.side, fzp = s.z + hx * WALK.footSep * s.side;
      events.push({ type: 'foot', x: fxp, z: fzp, dirX: hx, dirZ: hz, side: s.side,
        depth: s.sink + 0.01 + 0.008 * s.running, run: s.running, slide: s.sliding,
        strength: clamp(0.35 + 0.45 * s.running + 0.25 * s.sliding + 0.15 * (walkSpeed / WALK.walk - 1) * 0.3, 0, 1),
        exposure: s.exposure });
    }
    if (s.sliding > 0.15 && !flying) {
      s.slideDist += slideSpeed * dt;
      events.push({ type: 'slide', x0: px, z0: pz, x1: s.x, z1: s.z, depth: 0.045 + 0.05 * s.sliding, width: 0.24 + 0.1 * s.sliding, exposure: s.exposure });
    }

    // ---- the eye: mean ground under the footprint (no temporal smoothing, so no lag down a face),
    // minus the sink, plus the bob
    s.groundPoint = height(s.x, s.z);
    s.ground = footHeight(s.x, s.z);
    const bobAmp = reducedMotion ? 0 : (WALK.bobWalk + (WALK.bobRun - WALK.bobWalk) * s.running) * smooth(0.15, 1.0, walkSpeed);
    s.bob = s.airborne ? 0 : -bobAmp * Math.cos(2 * Math.PI * s.phase);
    s.swayX = reducedMotion ? 0 : WALK.sway * smooth(0.15, 1.0, walkSpeed) * Math.sin(Math.PI * s.phase);
    s.eyeY = s.ground + s.airHeight + WALK.eye - s.sink + s.bob;

    // ---- exposure (slow; for sound and how fast prints heal)
    s.exposureT += dt;
    if (s.exposureT > 0.25) { s.exposureT = 0; s.exposure += (exposureAt(s.x, s.z) - s.exposure) * 0.5; }
    return events;
  }

  // the wind for the sound: blows toward WIND; windDirRel is where it comes from, relative to
  // facing, + to the right (0 = in your face)
  function wind(t) {
    const gust = 0.5 + 0.3 * Math.sin(t * 0.37) * Math.sin(t * 0.13 + 1.7) + 0.2 * Math.sin(t * 1.1 + Math.sin(t * 0.29) * 2);
    const speed = (2.2 + 4.5 * s.exposure) * (0.6 + 0.6 * gust);
    const from = Math.atan2(-WIND[1], -WIND[0]);
    return { windSpeed: speed, windDirRel: wrapPi(from - s.yaw) };
  }

  function eye() { return [s.x + -Math.sin(s.yaw) * s.swayX, s.eyeY, s.z + Math.cos(s.yaw) * s.swayX]; }
  function setPose(p) {
    if (p.x !== undefined) s.x = p.x;
    if (p.z !== undefined) s.z = p.z;
    if (p.headingDeg !== undefined) s.yaw = p.headingDeg * DEG;
    if (p.pitchDeg !== undefined) s.pitch = p.pitchDeg * DEG;
    s.vx = s.vz = s.sx = s.sz = 0; s.target = null;
    s.airborne = 0; s.air = null; s.airHeight = 0; s.airVy = 0; s.sinceLand = 99;
    s.ground = footHeight(s.x, s.z); s.groundPoint = height(s.x, s.z); s.feetY = s.groundPoint;
    s.exposure = exposureAt(s.x, s.z);
    s.eyeY = s.ground + WALK.eye - s.sink;
  }
  return { state: s, update, wind, eye, setPose };
}
