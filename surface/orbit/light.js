// Orbit look test: the two suns, the seeded random source and small vector helpers.
// The suns are the Dust Sea's (surface/worlds/dust-sea/params.js, TIMES.dusk): the same pale sun
// [2.2, 1.5, 0.85] and red sun [1.4, 0.32, 0.09], linear RGB, so a landing reads as the same sky.
// Up here they are directions (infinitely far), fixed in the world; every shot is posed around them.

export const DEG = Math.PI / 180;

export const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);

// a direction from yaw (degrees, positive to the right of +x when looking down +x, i.e. toward +z)
// and pitch (degrees up)
export const dirYP = (yaw, pitch) => [Math.cos(pitch * DEG) * Math.cos(yaw * DEG), Math.sin(pitch * DEG), Math.cos(pitch * DEG) * Math.sin(yaw * DEG)];

export const SUN1 = {
  dir: norm(dirYP(-62, 14)),          // the pale sun: low, ahead-left of the arrival view; rakes the port flank and deck
  col: [2.2, 1.5, 0.85],              // dusk pale sun, as on the Dust Sea
  disc: [9.0, 7.6, 5.6],              // the disc itself (HDR; tone-mapped to a warm white)
  radiusDeg: 1.25,
  halo: [0.035, 0.55, 20 * DEG, 3.0 * DEG],  // wide, tight strength; wide, tight width (exp falloff)
};
export const SUN2 = {
  dir: norm(dirYP(26, 1)),             // the red sun: low on the horizon, in the arrival view beside the Dust Sea
  col: [1.4, 0.32, 0.09],             // dusk red sun, as on the Dust Sea
  disc: [6.0, 1.1, 0.25],
  radiusDeg: 0.5,
  halo: [0.03, 0.5, 14 * DEG, 2.0 * DEG],
};

// Mulberry32: a small seeded generator, so every still is the same on every reload
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// sRGB 0-255 to linear 0-1
export const lin = (c) => c.map((x) => { const s = x / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
