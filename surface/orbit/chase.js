// The orbit, flown: the chase camera. A boom behind and above the shuttle (190 m back, 40 m up: the
// arrival still's framing, so the shuttle stays small). The boom's direction trails the shuttle's
// heading, so a turn swings it wide; it lengthens with speed; the camera eases toward the boom's end
// in the shuttle's frame (it never falls behind a fast shuttle). The player orbits the view (right
// drag, right thumb); it eases back behind a few seconds later. Before the spring the boom is
// shortened until its line clears metal, and after it the camera is held off any surface.
// Reduced motion: no lag and no swing; the boom is fixed.

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
const dirOf = (yaw, pitch) => [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)];

export const CHASE = { back: 190, up: 40, longer: 110, speedFull: 4000, tauYaw: 0.55, tauPitch: 0.45, tauPos: 0.28, orbitBack: 3.0, orbitTau: 1.0, clear: 10, roll: 0.22 };

export function createChase({ reduced = false } = {}) {
  const s = { yaw: 0, pitch: 0, oy: 0, op: 0, since: 99, L: CHASE.back, off: null, cam: [0, 0, 0], dir: [1, 0, 0], roll: 0, shortened: 0 };
  function snap(f) { s.yaw = f.yaw; s.pitch = f.pitch; s.oy = 0; s.op = 0; s.off = null; }
  function update(dt, f, intent, field) {
    if (reduced) { s.yaw = f.yaw; s.pitch = f.pitch; }
    else {
      s.yaw += wrapPi(f.yaw - s.yaw) * ease(dt, CHASE.tauYaw);
      s.pitch += (f.pitch - s.pitch) * ease(dt, CHASE.tauPitch);
    }
    if (intent && (intent.lookX || intent.lookY) && !reduced) {
      s.oy = clamp(s.oy + intent.lookX, -Math.PI, Math.PI); s.op = clamp(s.op + intent.lookY, -0.9, 0.9); s.since = 0;
    } else s.since += dt;
    if (s.since > CHASE.orbitBack) { const k = ease(dt, CHASE.orbitTau); s.oy -= s.oy * k; s.op -= s.op * k; }
    const Lt = CHASE.back + (reduced ? 0 : clamp(f.speed / CHASE.speedFull, 0, 1) * CHASE.longer);
    const d = dirOf(s.yaw + s.oy, clamp(s.pitch + s.op, -1.4, 1.4));
    // shorten the boom until its line clears metal
    let L = Lt; s.shortened = 0;
    if (field) {
      for (let k = 1; k <= 8; k++) {
        const t = k / 8, sc = L * t;
        const p = [f.pos[0] - d[0] * sc, f.pos[1] - d[1] * sc + CHASE.up * (sc / CHASE.back), f.pos[2] - d[2] * sc];
        if (field.sample(p).d < CHASE.clear) { L = Math.max(30, sc * 0.85); s.shortened = 1; break; }
      }
    }
    s.L += (L - s.L) * ease(dt, L < s.L ? 0.12 : 0.8);
    const want = [-d[0] * s.L, -d[1] * s.L + CHASE.up * (s.L / CHASE.back), -d[2] * s.L];
    if (!s.off || reduced) s.off = want;
    else { const k = ease(dt, CHASE.tauPos); s.off = s.off.map((v, i) => v + (want[i] - v) * k); }
    s.cam = [f.pos[0] + s.off[0], f.pos[1] + s.off[1], f.pos[2] + s.off[2]];
    if (field) {
      const fs = field.sample(s.cam);
      if (fs.d < CHASE.clear * 0.6) { const p = CHASE.clear * 0.6 - fs.d; s.cam = s.cam.map((v, i) => v + fs.n[i] * p); }
    }
    s.dir = d;
    s.roll += ((reduced ? 0 : f.bank * CHASE.roll) - s.roll) * ease(dt, 0.5);
    return s;
  }
  return { state: s, update, snap };
}
