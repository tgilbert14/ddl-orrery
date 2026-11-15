// The orbit, flown: the shuttle. Arcade and forgiving: the heading turns with a lag and a bank, the
// speed eases toward a target, and the speed cap comes from how much room there is (the distance to
// the nearest surface: slow along the hull, so the city's scale reads; fast in open space, so any
// world is a short flight). Closing on the ship, the cap looks ahead (as it does for a world), so a
// fast run at the hull brakes before it. Metal pushes back softly (field.js): you can skim, never
// pass through; a fast move is taken in steps no longer than the push band near the ship.
// Far out (past the outer worlds) the speed away from the ship is reined in smoothly, so the orrery
// never falls behind the camera's far plane and home is always a short flight.
// An autopilot course turns smoothly toward a world, cruises, and slows into its approach.

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

export const FLY = {
  capMin: 70, capK: 1.3, capMax: 34000,  // cap = capMin + capK * room (m/s)
  boost: 2.0, idle: 0.28, touchCruise: 0.7,
  tauUp: 0.8, tauDown: 0.8, tauCap: 0.4,
  yawRate: 0.95, pitchRate: 0.75, tauTurn: 0.35, pitchMax: 1.25,
  bankK: 0.6, bankMax: 0.85, tauBank: 0.45,
  margin: 16, hard: 3,
  apTurn: 0.85, // autopilot turn rate (rad/s)
  nearK: 0.32,  // the cap's slope near a world (see update)
  hullAhead: 0.3,             // s: the hull cap's look-ahead on the closing speed
  aheadFrom: 30, aheadFull: 150,   // m/s of closing speed over which the look-ahead comes in
  outFrom: 110000, outTo: 230000, tauOut: 0.5,   // the outer bound: outward speed eases to nothing
  brakeT: 0.3, brakeFloor: 400,   // never closing on metal faster than its distance / brakeT (above brakeFloor m/s)
  maxSteps: 200,
};
const smooth01 = (t) => { const c = t < 0 ? 0 : t > 1 ? 1 : t; return c * c * (3 - 2 * c); };

export function dirOf(yaw, pitch) { return [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)]; }

export function createFlight(pose) {
  const s = {
    pos: [...pose.pos], yaw: pose.yaw, pitch: pose.pitch, speed: pose.speed ?? 30, cap: FLY.capMin,
    yawRate: 0, pitchRate: 0, bank: 0, room: 1e9, vel: [0, 0, 0], apSlug: null, lastSteer: 0, pushed: 0,
  };
  function setPose(p) {
    if (p.pos) s.pos = [...p.pos];
    if (p.yaw !== undefined) s.yaw = p.yaw;
    if (p.pitch !== undefined) s.pitch = p.pitch;
    if (p.speed !== undefined) s.speed = p.speed;
    s.yawRate = 0; s.pitchRate = 0; s.bank = 0;
  }
  // env: { field, room (m to the nearest surface), target: { pos, R } | null, intent, mode: 'arrival' | 'flight' }
  function update(dt, env) {
    const it = env.intent;
    const room = Math.max(0, env.room);
    s.room = room;
    const capT = clamp(FLY.capMin + FLY.capK * room, FLY.capMin, FLY.capMax);
    s.capRoom = (s.capRoom ?? s.cap) + (capT - (s.capRoom ?? s.cap)) * ease(dt, capT < (s.capRoom ?? s.cap) ? FLY.tauCap : 1.2);
    s.cap = s.capRoom; s.capWorld = Infinity;
    // the hull, looked ahead: the room left after closing on the metal for hullAhead seconds. It
    // applies at once (a falling cap does not wait for tauCap), and only while closing fast, so
    // skimming along the deck keeps the eased cap it always had.
    const here = env.field ? env.field.sample(s.pos) : null;
    if (here && here.d < 1e8) {
      const closing = Math.max(0, -(s.vel[0] * here.n[0] + s.vel[1] * here.n[1] + s.vel[2] * here.n[2]));
      const w = clamp((closing - FLY.aheadFrom) / (FLY.aheadFull - FLY.aheadFrom), 0, 1);
      if (w > 0) {
        const capAhead = clamp(FLY.capMin + FLY.capK * Math.max(0, Math.min(room, here.d) - closing * FLY.hullAhead), FLY.capMin, FLY.capMax);
        if (capAhead < s.cap) s.cap += (capAhead - s.cap) * w;
      }
    }
    // near a world the cap closes faster (its slope falls to nearK inside 2 radii of the surface), so
    // the last two radii down to the air take about four to five seconds: the planet fills the sky
    // first. The world's ceiling applies at once and looks ahead, so a fast arrival brakes into it.
    if (env.world) {
      const { R } = env.world;
      let closing = 0;
      if (env.world.pos) { const c = env.world.pos, d = [c[0] - s.pos[0], c[1] - s.pos[1], c[2] - s.pos[2]], dl = Math.hypot(...d) || 1; closing = Math.max(0, (s.vel[0] * d[0] + s.vel[1] * d[1] + s.vel[2] * d[2]) / dl); }
      const surf = Math.max(0, env.world.surf - closing * 0.2);
      // only while closing on it: passing a world by (or leaving it) keeps the open-space slope
      const toward = Math.min(1, closing / Math.max(1, s.speed));
      const kNear = FLY.nearK + (FLY.capK - FLY.nearK) * Math.min(1, Math.max(0, (surf - 2 * R) / (2 * R)));
      const k = FLY.capK + (kNear - FLY.capK) * toward;
      s.capWorld = 25 + 45 * Math.min(1, surf / R) + k * surf;   // a small world still takes its seconds
      s.cap = Math.min(s.cap, s.capWorld);
    }
    // ---- heading
    const yaw0 = s.yaw;
    if (env.target) {
      const t = env.target.pos;
      let d = [t[0] - s.pos[0], t[1] - s.pos[1], t[2] - s.pos[2]];
      // the ship in the way: lean the course out along the way out of the metal
      if (here) {
        const fs = here;
        if (fs.d < 700) {
          const dl = Math.hypot(...d), k = ((700 - fs.d) / 700) * 1.6;
          const into = -(d[0] * fs.n[0] + d[1] * fs.n[1] + d[2] * fs.n[2]) / dl;
          if (into > -0.2) d = d.map((v, i) => v / dl + fs.n[i] * k);
        }
      }
      const h = Math.hypot(d[0], d[2]);
      const wantYaw = Math.atan2(d[2], d[0]), wantPitch = Math.atan2(d[1], h);
      const dy = wrapPi(wantYaw - s.yaw), dp = wantPitch - s.pitch;
      const f0 = dirOf(s.yaw, s.pitch), dl = Math.hypot(...d);
      s.apAlign = (f0[0] * d[0] + f0[1] * d[1] + f0[2] * d[2]) / dl;   // 1 when facing the course
      const rateY = clamp(dy * 1.6, -FLY.apTurn, FLY.apTurn), rateP = clamp(dp * 1.6, -FLY.apTurn * 0.7, FLY.apTurn * 0.7);
      s.yawRate += (rateY - s.yawRate) * ease(dt, 0.5);
      s.pitchRate += (rateP - s.pitchRate) * ease(dt, 0.5);
    } else {
      s.yawRate += (it.yaw * FLY.yawRate - s.yawRate) * ease(dt, FLY.tauTurn);
      s.pitchRate += (it.pitch * FLY.pitchRate - s.pitchRate) * ease(dt, FLY.tauTurn);
      s.yaw += it.steerX || 0;
      s.pitch += it.steerY || 0;
    }
    s.yaw = wrapPi(s.yaw + s.yawRate * dt);
    s.pitch = clamp(s.pitch + s.pitchRate * dt, -FLY.pitchMax, FLY.pitchMax);
    // ---- bank: from how fast the heading actually turned
    const turn = wrapPi(s.yaw - yaw0) / Math.max(dt, 1e-4);
    s.bank += (clamp(-turn * FLY.bankK, -FLY.bankMax, FLY.bankMax) - s.bank) * ease(dt, FLY.tauBank);
    // ---- speed
    let want;
    if (env.mode === 'arrival') want = 30;
    else if (env.target) {
      // turn first, then run: thrust builds only once the nose is nearly on the course
      const a = Math.min(1, Math.max(0, ((s.apAlign ?? 1) - 0.55) / 0.42));
      want = s.cap * Math.max(0.05, a * a * (3 - 2 * a));
    }
    else {
      const k = it.boost ? FLY.boost : 1;
      want = it.thrust > 0 ? s.cap * k : it.thrust < 0 ? 0 : (it.touchCruise ? FLY.touchCruise : FLY.idle) * s.cap * (it.boost ? FLY.boost : 1);
      want = Math.min(want, s.capWorld);   // boost never outruns a world's approach
    }
    const f = dirOf(s.yaw, s.pitch);
    // ---- the outer bound: past outFrom the speed away from the ship eases down, to nothing by outTo
    // (turning back is never held; a course home runs at the full cap)
    let outCap = Infinity;
    const R = Math.hypot(s.pos[0], s.pos[1], s.pos[2]);
    if (R > FLY.outFrom) {
      const outward = (f[0] * s.pos[0] + f[1] * s.pos[1] + f[2] * s.pos[2]) / R;
      if (outward > 0) outCap = (FLY.capMax * FLY.boost * (1 - smooth01((R - FLY.outFrom) / (FLY.outTo - FLY.outFrom)))) / outward;
      want = Math.min(want, outCap);
    }
    const tau = want > s.speed ? FLY.tauUp : (s.speed > s.cap * (it && it.boost ? FLY.boost : 1) ? 0.22 : s.speed > outCap ? FLY.tauOut : FLY.tauDown);
    s.speed += (want - s.speed) * ease(dt, tau);
    // the last guard on a fast closing: at most brakeT seconds from the metal at this speed (only
    // above brakeFloor, so flight among the structures never feels it; the look-ahead cap above
    // normally brakes well before this binds)
    if (here) {
      const frac = -(f[0] * here.n[0] + f[1] * here.n[1] + f[2] * here.n[2]);
      if (frac > 0) s.speed = Math.min(s.speed, Math.max(FLY.brakeFloor, Math.max(0, here.d) / FLY.brakeT) / frac);
    }
    // ---- move, then metal pushes back
    s.vel = f.map((v) => v * s.speed);
    s.pushed = 0;
    if (!env.field) { for (let k = 0; k < 3; k++) s.pos[k] += s.vel[k] * dt; return s; }
    // in steps: far from the ship's box one step covers the clear distance; inside it no step is
    // longer than the push band, so no structure is skipped between one sample and the next (a slow
    // move is one step, as it always was)
    const L = s.speed * dt;
    let left = L;
    for (let n = 1; left > 1e-9; n++) {
      const h = n >= FLY.maxSteps ? left : Math.min(left, Math.max(FLY.margin, env.field.clear(s.pos) - FLY.margin));
      for (let k = 0; k < 3; k++) s.pos[k] += f[k] * h;
      left -= h;
      const dts = L > 0 ? dt * (h / L) : dt;
      // two passes, as always; then, if the second pushed, more until the point is out of the metal
      // (a push can carry it from one face into the next)
      for (let iter = 0; iter < 6; iter++) {
        const fs = env.field.sample(s.pos);
        if (fs.d >= FLY.margin || (iter >= 2 && fs.d >= 0)) break;
        const push = iter >= 2 ? FLY.hard - fs.d : (FLY.margin - fs.d) * Math.min(1, dts * 6) + Math.max(0, FLY.hard - fs.d);
        for (let k = 0; k < 3; k++) s.pos[k] += fs.n[k] * push;
        s.pushed = Math.max(s.pushed, push);
        const into = -(f[0] * fs.n[0] + f[1] * fs.n[1] + f[2] * fs.n[2]);
        if (into > 0 && iter < 2) {
          const k = 1 - Math.min(0.6, into * dts * 2.5);
          s.speed *= k; left *= k;
        }
      }
    }
    return s;
  }
  return { state: s, update, setPose };
}
