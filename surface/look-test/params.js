// Dust Sea look test: every number the ground, sky and light use, in one place.
// height.js (JavaScript), tsl-material.js (WebGPURenderer) and glsl-material.js (classic
// WebGLRenderer) all read from here, so the three paths cannot drift apart by a constant.
//
// Units: metres and radians. +y is up. Angles in degrees are converted with DEG.

export const DEG = Math.PI / 180;

// ---------------------------------------------------------------- ground (the height formula)
export const G = {
  windDeg: 20,          // the wind blows toward this heading (x toward z), in degrees

  // domain warp: makes crest lines wander instead of running ruler straight
  warp1F: 1 / 620, warp1A: 70,      // slow, large bends
  warp2F: 1 / 170, warp2A: 14,      // tighter wiggles

  // draa: the very long swell the dunes ride on
  swellF: 1 / 1400, swellA: 26,

  // primary transverse dunes, crest lines across the wind
  L1: 240,              // crest spacing (m)
  A1: 24,               // crest height (m) before modulation
  ampBase: 0.28,        // minimum fraction of A1 along a crest (low = crests break into crescents)
  ampF: 1 / 380,        // how fast crest height varies along the crest
  crest: 0.74,          // where the crest sits in one wavelength (0..1): long windward, short lee

  // secondary, smaller dunes crossing at an angle
  dir2Deg: 62, L2: 78, A2: 4.5, amp2F: 1 / 210,

  // medium and small undulation
  det1F: 1 / 45, det1A: 1.4,
  det2F: 1 / 11, det2A: 0.22,

  // wind ripples: shading only (normal detail), never geometry
  ripL: 0.11,           // ripple wavelength (m)
  ripSlope: 0.15,       // peak slope the ripples add to the normal
  ripWarpF: 1 / 2.3, ripWarpA: 0.22, // ripple crest wander (m)
  ripAmpF: 1 / 1.9,     // patchiness: ripple strength varies over a couple of metres
  ripLeeLo: 0.32, ripLeeHi: 0.5,     // ripples fade out on lee faces steeper than this

  // glints: rare grains that catch a sun at a grazing angle
  glintCell: 0.018, glintDensity: 0.22, glintPow: 700, glintGain: 9,
};

// ---------------------------------------------------------------- shadow march
export const SH = {
  steps: 48,            // bounded march per sun
  start: 0.25,          // first sample distance (m)
  grow: 0.03,           // step = clamp(gap * dStep + t * grow, minStep, t * 0.35 + 1)
  dStep: 0.9,
  minStep: 0.15,
  maxDist: 1100,
  lift: 0.06,           // start a little off the surface along the normal
  ceiling: 62,          // above this the ray has cleared every dune the formula can make (m)
};

// ---------------------------------------------------------------- sky, haze, sand response
export const SKY = {
  k: 7,                 // sky gradient: gy = 1 - exp(-k * max(rd.y, 0))
  glowPow1: 5, glowPow2: 90,         // wide and tight halo around each sun
  starScale: 260, starThresh: 0.9965, starSize: 0.14,
  rSky: 9000,           // sky sphere radius (m)
};

export const SAND = {
  wrap: 0.35,           // wrapped diffuse
  retro: 0.35,          // brightening when the sun is behind the viewer
  sheen: 0.22, fwd: 0.9, sheenPow: 4, // grazing sheen, stronger looking toward a sun
  aoLo: 0.72,           // ambient floor on steep faces
};

export const DRIFT = {   // storm sand streaks: thin horizontal sheets near the ground
  h: [0.18, 0.65, 1.35, 2.6],        // sheet heights above the camera's ground (m)
  w: [0.30, 0.24, 0.18, 0.14],
  fa: 0.06, fc: 1.6,     // noise frequency along / across the storm wind (streaks are long)
  fall: 26,              // streaks fade with distance (m)
  relAz: 84,             // storm wind blows across the view, left to right
};

export const GRID = {
  segments: 640,        // around the camera
  r0: 0.25,             // first ring (m)
  rMax: 7000,           // last ring (m); haze reaches 1 before this
};

export const CAM = { eye: 1.7, back: 4, headingDeg: 48, pitchDeg: -3.2, vfov: 48, vfovPortrait: 66, near: 0.25, far: 12000 };

// ---------------------------------------------------------------- looks
// Sun positions are given relative to the camera heading: relAz > 0 is to the right of centre.
// Colours are linear RGB. "col" is the light a sun puts on the ground; the disc is col * discGain.
export const TIMES = {
  day: {
    exposure: 0.42,
    sun1: { relAz: -105, elev: 18, col: [3.1, 2.95, 2.75], discGain: 18, radiusDeg: 1.4, glow: [0.05, 0.4] },
    sun2: { relAz: 24, elev: 8, col: [0.8, 0.24, 0.10], discGain: 1.6, radiusDeg: 0.45, glow: [0.10, 0.8] },
    zenith: [0.20, 0.30, 0.46], horizon: [0.80, 0.74, 0.64],
    ambSky: [0.20, 0.24, 0.32], ambGround: [0.26, 0.18, 0.11],
    sand: [0.60, 0.40, 0.24],
    fogD: 0.00024, fogH: 0.0005, fogFall: 1 / 120,
    stars: 0,
  },
  dusk: {
    exposure: 1.0,
    sun1: { relAz: -29, elev: 5, col: [2.2, 1.5, 0.85], discGain: 9, radiusDeg: 1.5, glow: [0.07, 0.9] },
    sun2: { relAz: 31, elev: 3, col: [1.4, 0.32, 0.09], discGain: 1.4, radiusDeg: 0.45, glow: [0.12, 1.0] },
    zenith: [0.06, 0.055, 0.10], horizon: [0.66, 0.32, 0.13],
    ambSky: [0.10, 0.10, 0.16], ambGround: [0.12, 0.06, 0.03],
    sand: [0.62, 0.40, 0.22],
    fogD: 0.00030, fogH: 0.0008, fogFall: 1 / 110,
    stars: 0,
  },
  ember: {
    exposure: 1.5,
    sun1: { relAz: -34, elev: -3.5, col: [1.6, 1.0, 0.6], discGain: 0, radiusDeg: 1.5, glow: [0.05, 0.0] },
    sun2: { relAz: 10, elev: 1.6, col: [0.95, 0.16, 0.05], discGain: 1.6, radiusDeg: 0.45, glow: [0.05, 0.5] },
    zenith: [0.010, 0.016, 0.042], horizon: [0.13, 0.075, 0.085],
    ambSky: [0.03, 0.04, 0.08], ambGround: [0.03, 0.017, 0.012],
    sand: [0.58, 0.38, 0.22],
    fogD: 0.00035, fogH: 0.0008, fogFall: 1 / 110,
    stars: 1,
  },
};

export const WEATHERS = {
  calm: { fogMul: 1, sunVis: 1, discVis: 1, drift: 0, wallMix: 0, dust: [0, 0, 0] },
  storm: {
    fogMul: 1, fogD: 0.011, sunVis: 0.16, discVis: 0.025, drift: 1, wallMix: 1,
    wallRelAz: 70,                       // the darker wall of the front, right of the view
    dust: [0.46, 0.29, 0.16],            // colour of suspended dust, multiplied by the light level
  },
};

const dir = (azDeg, elevDeg) => {
  const a = azDeg * DEG, e = elevDeg * DEG;
  return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
};
const scale = (v, s) => v.map((x) => x * s);
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// Flatten a (time, weather) pair into the uniform values both materials receive.
// headingDeg is the camera heading in the same x-toward-z convention as G.windDeg.
export function lookUniforms(time, weather, headingDeg) {
  const T = TIMES[time], W = WEATHERS[weather];
  const storm = weather === 'storm';
  const s1 = T.sun1, s2 = T.sun2;
  const u = {
    uSun1Dir: dir(headingDeg + s1.relAz, s1.elev),
    uSun2Dir: dir(headingDeg + s2.relAz, s2.elev),
    uSun1Col: scale(s1.col, W.sunVis * (s1.elev > 0 ? 1 : 0)),
    uSun2Col: scale(s2.col, W.sunVis * (s2.elev > 0 ? 1 : 0)),
    // sky-only terms: halo strengths, disc radiance and angular radius per sun
    uSun1Sky: [s1.glow[0] * (storm ? 1.5 : 1), s1.glow[1] * W.discVis, s1.discGain * W.discVis, s1.radiusDeg * DEG * (storm ? 1.6 : 1)],
    uSun2Sky: [s2.glow[0] * (storm ? 1.5 : 1), s2.glow[1] * W.discVis, s2.discGain * W.discVis, s2.radiusDeg * DEG * (storm ? 1.6 : 1)],
    uSun1Tint: s1.col, uSun2Tint: s2.col, // sky glow colour, independent of how much light reaches the ground
    uZenith: T.zenith, uHorizon: T.horizon,
    uAmbSky: T.ambSky, uAmbGround: T.ambGround,
    uSand: T.sand,
    uFog: [storm ? W.fogD : T.fogD, T.fogH * (storm ? 6 : 1), T.fogFall, 0], // [distance, height, falloff, base y]
    uExposure: T.exposure,
    uStars: storm ? 0 : T.stars,
    uStorm: storm ? 1 : 0,
    uWallDir: [0, 0], uWallCol: [0, 0, 0], uDustCol: [0, 0, 0], uDriftDir: [1, 0],
    uDrift: W.drift,
  };
  if (storm) {
    // Dust takes its brightness from the light that is around: in day it glows, in ember it is dark.
    const light = Math.min(1.4, 0.18 + lum(s1.col) * Math.max(0, Math.sin(s1.elev * DEG)) * 1.4 + lum(s2.col) * 0.35 + lum(T.horizon) * 0.6);
    const dust = scale(W.dust, light);
    u.uZenith = T.zenith.map((z, i) => z * 0.35 + dust[i] * 0.55);
    u.uHorizon = dust;
    u.uAmbSky = scale(dust, 0.42);
    u.uAmbGround = scale(dust, 0.16);
    u.uDustCol = scale(dust, 1.12);
    u.uWallCol = scale(dust, 0.22);
    const a = (headingDeg + W.wallRelAz) * DEG;
    u.uWallDir = [Math.cos(a), Math.sin(a)];
    const d = (headingDeg + DRIFT.relAz) * DEG;
    u.uDriftDir = [Math.cos(d), Math.sin(d)];
  }
  return u;
}

export const UNIFORM_TYPES = {
  uSun1Dir: 'vec3', uSun2Dir: 'vec3', uSun1Col: 'vec3', uSun2Col: 'vec3',
  uSun1Sky: 'vec4', uSun2Sky: 'vec4', uSun1Tint: 'vec3', uSun2Tint: 'vec3',
  uZenith: 'vec3', uHorizon: 'vec3', uAmbSky: 'vec3', uAmbGround: 'vec3', uSand: 'vec3',
  uFog: 'vec4', uExposure: 'float', uStars: 'float', uStorm: 'float',
  uWallDir: 'vec2', uWallCol: 'vec3', uDustCol: 'vec3', uDrift: 'float', uDriftDir: 'vec2',
  uGroundY: 'float', // the camera's ground height; drift sheets and fog base hang off it
};
