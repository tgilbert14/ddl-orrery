// The orbit, flown: the shuttle. Arcade and forgiving: the heading turns with a lag and a bank, the
// speed eases toward a target, and the speed cap comes from how much room there is (the distance to
// the nearest surface: slow along the hull, so the city's scale reads; fast in open space, so any
// world is a short flight). Metal pushes back softly (field.js): you can skim, never pass through.
// An autopilot course turns smoothly toward a world, cruises, and slows into its approach.

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);

export const FLY = {
  capMin: 70, capK: 1.05, capMax: 30000,  // cap = capMin + capK * room (m/s)
  boost: 2.0, idle: 0.28, touchCruise: 0.7,
  tauUp: 0.8, tauDown: 0.8, tauCap: 0.4,
  yawRate: 0.95, pitchRate: 0.75, tauTurn: 0.35, pitchMax: 1.25,
  bankK: 0.6, bankMax: 0.85, tauBank: 0.45,
  margin: 16, hard: 3,
  apTurn: 0.85, // autopilot turn rate (rad/s)
};

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
    s.cap += (capT - s.cap) * ease(dt, capT < s.cap ? FLY.tauCap : 1.2);
    // ---- heading
    const yaw0 = s.yaw;
    if (env.target) {
      const t = env.target.pos;
      let d = [t[0] - s.pos[0], t[1] - s.pos[1], t[2] - s.pos[2]];
      // the ship in the way: lean the course out along the way out of the metal
      if (env.field) {
        const fs = env.field.sample(s.pos);
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
    else if (env.target) want = s.cap * Math.max(0.12, Math.pow((1 + (s.apAlign ?? 1)) / 2, 6));   // turn first, then run
    else {
      const k = it.boost ? FLY.boost : 1;
      want = it.thrust > 0 ? s.cap * k : it.thrust < 0 ? 0 : (it.touchCruise ? FLY.touchCruise : FLY.idle) * s.cap * (it.boost ? FLY.boost : 1);
    }
    const tau = want > s.speed ? FLY.tauUp : (s.speed > s.cap * FLY.boost ? 0.4 : FLY.tauDown);
    s.speed += (want - s.speed) * ease(dt, tau);
    // ---- move, then metal pushes back
    const f = dirOf(s.yaw, s.pitch);
    s.vel = f.map((v) => v * s.speed);
    for (let k = 0; k < 3; k++) s.pos[k] += s.vel[k] * dt;
    s.pushed = 0;
    if (env.field) {
      for (let iter = 0; iter < 2; iter++) {
        const fs = env.field.sample(s.pos);
        if (fs.d >= FLY.margin) break;
        const push = (FLY.margin - fs.d) * Math.min(1, dt * 6) + Math.max(0, FLY.hard - fs.d);
        for (let k = 0; k < 3; k++) s.pos[k] += fs.n[k] * push;
        s.pushed = Math.max(s.pushed, push);
        const into = -(f[0] * fs.n[0] + f[1] * fs.n[1] + f[2] * fs.n[2]);
        if (into > 0) s.speed *= 1 - Math.min(0.6, into * dt * 2.5);
      }
    }
    return s;
  }
  return { state: s, update, setPose };
}
