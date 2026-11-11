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
  warp3F: 1 / 42, warp3A: 4.2,      // round two: crest sinuosity at the 15 to 60 m scale (moves crests only)

  // draa: the very long swell the dunes ride on
  swellF: 1 / 1400, swellA: 26,

  // primary transverse dunes, crest lines across the wind
  L1: 240,              // crest spacing (m)
  A1: 24,               // crest height (m) before modulation
  ampBase: 0.28,        // minimum fraction of A1 along a crest (low = crests break into crescents)
  ampF: 1 / 380,        // how fast crest height varies along the crest
  crest: 0.74,          // where the crest sits in one wavelength (0..1): long windward, short lee
  // round two: the crest is a smooth minimum of the windward and lee curves; its rounding width
  // (in units of the profile, 0 = knife edge) varies along the ridge between these two ends
  roundLo: 0.012,       // sharp brink
  roundHi: 0.16,        // soft, rounded crest
  roundF: 1 / 150,      // how fast the sharpness changes along a crest (m^-1)

  // secondary, smaller dunes crossing at an angle
  dir2Deg: 62, L2: 78, A2: 4.5, amp2F: 1 / 210,
  round2: 0.12,         // the crossing dunes always have soft crests (no kinked intersections)

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

// ---------------------------------------------------------------- shadow march (reference + bake)
export const SH = {
  steps: 48,            // bounded march per sun
  start: 0.25,          // first sample distance (m)
  grow: 0.03,           // step = clamp(gap * dStep + t * grow, minStep, t * 0.35 + 1)
  dStep: 0.9,
  minStep: 0.15,
  maxDist: 1100,
  lift: 0.06,           // start a little off the surface along the normal
  ceiling: 62,          // above this the ray has cleared every dune the formula can make (m)
  penumbra: 0.45,       // round two: the shadow penumbra uses this fraction of the drawn sun radius,
                        // so far crests keep a crisper edge (the drawn discs are larger than life)
};

// ---------------------------------------------------------------- shadow map (round two)
// One camera-centred, log-polar texture: u = bearing around the camera, v = log of distance.
// A texel is about 0.3% of its distance on a side, so it is millimetres at the feet and a few
// metres at a kilometre, and the whole grid (out to GRID.rMax) is covered. Each texel stores, per
// sun, the horizon value the shadow march finds there (R = sun 1, G = sun 2, half float); the
// ground turns it into the same soft shadow the march gives (see horizonMarch).
export const SHMAP = {
  w: 2048,              // texels around the camera (bearing)
  h: 3072,              // texels out from the camera (log distance)
  r0: 0.3,              // inner radius (m); closer ground reads the first row
  r1: 7500,             // outer radius (m), beyond GRID.rMax
  rebakeDist: 8,        // a walking camera re-bakes after moving this far (m); a still bakes once
};

// ---------------------------------------------------------------- sky, haze, sand response
export const SKY = {
  k: 7,                 // sky gradient: gy = 1 - exp(-k * max(rd.y, 0))
  starScale: 260, starThresh: 0.9965, starSize: 0.14,
  rSky: 9000,           // sky sphere radius (m)
};

export const SAND = {
  wrap: 0.35,           // wrapped diffuse (a look may set its own: TIMES.*.wrap)
  retro: 0.35,          // brightening when the sun is behind the viewer
  sheen: 0.22, fwd: 0.9, sheenPow: 4, // grazing sheen, stronger looking toward a sun
  aoLo: 0.72,           // ambient floor on steep faces
};

// ---------------------------------------------------------------- storm: the front arriving
export const STORM = {
  // the haboob wall, seen as a sheet at distance D, measured in metres on that sheet
  fromRelAz: -7,        // where the wall's left end meets the ground, relative to the view (deg)
  riseDeg: 30,          // over this many degrees the top climbs to full height (the front recedes)
  dist: 1800,           // distance of the wall face (m)
  height: 820,          // mean height of the wall top (m)
  topF: [1 / 900, 1 / 230, 1 / 70],  // top-edge noise: long swells, big lobes, small lobes (m^-1)
  topA: [0.22, 0.16, 0.06],          // as fractions of the height
  lobeF: 1 / 210,       // billow lobes inside the wall (m^-1)
  bump: 9,              // how strongly the lobes turn their faces to the light
  endSoft: 0.3,         // the wall's far end thins out over this fraction of the rise
  edgeSoft: 14,         // softness of the top edge (m on the wall)
  // air: visibility on the open (left) side and toward the wall
  fogOpen: 0.003, fogWall: 0.0075,
  // ground-level blowing sand
  windRelAz: -40,       // the ground wind blows toward this heading, relative to the view (deg):
                        // from behind right, across the near crest and off its brink toward the open sun
  sandSteps: 20, sandNear: 1.2, sandFar: 70, // the view ray is sampled from sandNear to sandFar (m)
  sandH: 0.3,           // e-folding height of the sand above the ground (m): densest in the lowest half metre
  sandTau: 2.2,         // optical depth per metre at the ground in a streamer
  spill: 4,             // sand leaving a crest keeps its height this far downwind (m) ...
  spillDrop: 0.16,      // ... falling this much per metre
  alongF: 1 / 14, acrossF: 1 / 1.6, // streamer noise: long along the wind, narrow across it
  snakeF: 1 / 30, snakeA: 5.0,       // streamers snake sideways by this much (m)
  sheetF: 1 / 60,       // broad sheets that come and go
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
// halo: [wide strength, tight strength, wide width (deg), tight width (deg)]; both fall off as
// exp(-angle / width), which has no shoulder, so no glow ends in a visible edge.
// haloTint (optional) colours the halo instead of col.
export const TIMES = {
  day: {
    exposure: 0.36, wrap: 0.08,          // a hard terminator: faces turned from the sun go dark
    sun1: { relAz: 32, elev: 28, col: [3.4, 3.2, 2.9], discGain: 22, radiusDeg: 1.4, halo: [0.05, 0.5, 30, 4] },
    sun2: { relAz: -22, elev: 2.2, col: [0.5, 0.13, 0.05], discGain: 4, radiusDeg: 0.4, halo: [0.02, 0.35, 10, 1.2], haloTint: [1.0, 0.4, 0.12] },
    zenith: [0.13, 0.27, 0.62], horizon: [0.62, 0.70, 0.82],
    ambSky: [0.12, 0.19, 0.38], ambGround: [0.14, 0.09, 0.05],
    sand: [0.72, 0.45, 0.23],
    fogD: 0.00032, fogH: 0.0008, fogFall: 1 / 90, fogCol: [0.60, 0.68, 0.82],
    stars: 0,
  },
  dusk: {
    exposure: 1.0,
    sun1: { relAz: -29, elev: 5, col: [2.2, 1.5, 0.85], discGain: 9, radiusDeg: 1.5, halo: [0.13, 0.75, 26, 5] },
    sun2: { relAz: 31, elev: 3, col: [1.4, 0.32, 0.09], discGain: 1.4, radiusDeg: 0.45, halo: [0.16, 0.9, 22, 3.5] },
    zenith: [0.06, 0.055, 0.10], horizon: [0.66, 0.32, 0.13],
    ambSky: [0.10, 0.10, 0.16], ambGround: [0.12, 0.06, 0.03],
    sand: [0.62, 0.40, 0.22],
    fogD: 0.00030, fogH: 0.0008, fogFall: 1 / 110,
    stars: 0,
  },
  ember: {
    exposure: 1.5,
    sun1: { relAz: -34, elev: -3.5, col: [1.6, 1.0, 0.6], discGain: 0, radiusDeg: 1.5, halo: [0.05, 0.0, 30, 5] },
    sun2: { relAz: 10, elev: 1.6, col: [0.95, 0.16, 0.05], discGain: 1.6, radiusDeg: 0.45, halo: [0.042, 0.4, 14, 2.6], haloTint: [1.0, 0.36, 0.07] },
    zenith: [0.010, 0.016, 0.042], horizon: [0.13, 0.075, 0.085],
    ambSky: [0.03, 0.04, 0.08], ambGround: [0.03, 0.017, 0.012],
    sand: [0.58, 0.38, 0.22],
    fogD: 0.00035, fogH: 0.0008, fogFall: 1 / 110,
    stars: 1,
  },
};

export const WEATHERS = {
  calm: {},
  storm: {
    dust: [0.52, 0.24, 0.075],            // suspended dust, multiplied by the light level (saturated)
    sunOpen: 0.5,                        // light from a sun on the open side
    sunHidden: 0.035,                    // light from a sun behind the wall
  },
};

const dir = (azDeg, elevDeg) => {
  const a = azDeg * DEG, e = elevDeg * DEG;
  return [Math.cos(e) * Math.cos(a), Math.sin(e), Math.cos(e) * Math.sin(a)];
};
const scale = (v, s) => v.map((x) => x * s);
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// Is a sun (relative azimuth, elevation in degrees) behind the haboob wall? 0 clear .. 1 hidden.
// Uses the wall's mean top (no noise), so it is the light the ground gets, not the disc.
export function wallCover(relAz, elev) {
  const x = (relAz - STORM.fromRelAz) / STORM.riseDeg;
  const taper = Math.pow(Math.min(Math.max(x, 0), 1), 0.7);
  const topDeg = Math.atan((STORM.height * taper) / STORM.dist) / DEG;
  return Math.min(Math.max((topDeg - elev) / 2.5 + 0.5, 0), 1) * (x > 0 ? 1 : 0);
}

// Flatten a (time, weather) pair into the uniform values both materials receive.
// headingDeg is the camera heading in the same x-toward-z convention as G.windDeg.
export function lookUniforms(time, weather, headingDeg) {
  const T = TIMES[time], W = WEATHERS[weather];
  const storm = weather === 'storm';
  const s1 = T.sun1, s2 = T.sun2;
  const halo = (s, mul) => [s.halo[0] * mul, s.halo[1] * mul, s.halo[2] * DEG, s.halo[3] * DEG];
  const u = {
    uSun1Dir: dir(headingDeg + s1.relAz, s1.elev),
    uSun2Dir: dir(headingDeg + s2.relAz, s2.elev),
    uSun1Col: scale(s1.col, s1.elev > 0 ? 1 : 0),
    uSun2Col: scale(s2.col, s2.elev > 0 ? 1 : 0),
    // sky-only terms: [unused, unused, disc radiance, angular radius]
    uSun1Sky: [0, 0, s1.discGain, s1.radiusDeg * DEG],
    uSun2Sky: [0, 0, s2.discGain, s2.radiusDeg * DEG],
    uSun1Glow: halo(s1, 1), uSun2Glow: halo(s2, 1),
    uSun1Tint: s1.haloTint || s1.col, uSun2Tint: s2.haloTint || s2.col,
    uSun1Disc: s1.col, uSun2Disc: s2.col,
    uZenith: T.zenith, uHorizon: T.horizon,
    uFogCol: T.fogCol || [0, 0, 0], uFogColMix: T.fogCol ? 1 : 0,
    uAmbSky: T.ambSky, uAmbGround: T.ambGround,
    uSand: T.sand,
    uFog: [T.fogD, T.fogH, T.fogFall, 0], // [distance, height, falloff, base y]
    uExposure: T.exposure,
    uWrap: T.wrap ?? SAND.wrap,
    uStars: storm ? 0 : T.stars,
    uStorm: storm ? 1 : 0,
    uWallFwd: [1, 0], uWallRight: [0, 1], uWallGeo: [0, 1, 1, 1],
    uWallBase: [0, 0, 0], uWallSun1: [0, 0, 0], uWallSun2: [0, 0, 0], uDustCol: [0, 0, 0],
    uStormFog: [0, 0, 0, 0], uStormWind: [1, 0], uSandLit: [0, 0, 0], uSandAmb: [0, 0, 0],
  };
  if (storm) {
    // Dust takes its brightness from the light that is around: in day it glows, in ember it is dark.
    const light = 0.72 * Math.min(1.3, 0.12 + lum(s1.col) * Math.max(0, Math.sin(s1.elev * DEG)) * 1.5 + lum(s2.col) * Math.max(0, s2.elev) * 0.02 + lum(T.horizon) * 0.5);
    const dust = scale(W.dust, light);
    const c1 = wallCover(s1.relAz, s1.elev), c2 = wallCover(s2.relAz, s2.elev);
    const vis = (c) => W.sunOpen * (1 - c) + W.sunHidden * c;
    u.uSun1Col = scale(u.uSun1Col, vis(c1));
    u.uSun2Col = scale(u.uSun2Col, vis(c2));
    // the disc and tight halo of a sun on the open side dim in the dust; one behind the wall is
    // hidden by the wall itself in the sky shader
    u.uSun1Sky = [0, 0, s1.discGain * 0.28, s1.radiusDeg * DEG * 1.3];
    u.uSun2Sky = [0, 0, s2.discGain * 0.28, s2.radiusDeg * DEG * 1.3];
    u.uSun1Disc = [s1.col[0], s1.col[1] * 0.8, s1.col[2] * 0.55];   // reddened by the dust
    u.uSun2Disc = [s2.col[0], s2.col[1] * 0.8, s2.col[2] * 0.55];
    u.uSun1Glow = [s1.halo[0] * 0.9, s1.halo[1] * 0.5, s1.halo[2] * DEG * 0.7, s1.halo[3] * DEG * 2.2];
    u.uSun2Glow = [s2.halo[0] * 0.9, s2.halo[1] * 0.5, s2.halo[2] * DEG * 0.7, s2.halo[3] * DEG * 2.2];
    u.uZenith = T.zenith.map((z, i) => z * 0.1 + dust[i] * 0.4);
    u.uHorizon = scale(dust, 0.85);
    u.uFogColMix = 0;
    u.uAmbSky = scale(dust, 0.45);
    u.uAmbGround = scale(dust, 0.2);
    u.uDustCol = dust;
    u.uFog = [STORM.fogOpen, T.fogH * 4, T.fogFall, 0];
    // the wall: a dark, dense base; each sun lights the tops of the billows from its side
    u.uWallBase = [dust[0] * 0.16, dust[1] * 0.11, dust[2] * 0.08];
    // light on the wall's billows, reddened by the dust it passes through
    const sunOnWall = (s) => (s.elev > -1 ? scale(s.col, 0.42 * Math.min(1, Math.max(0, (s.elev + 1) / 8)) + 0.12).map((c, i) => c * [1, 0.82, 0.6][i]) : [0, 0, 0]);
    u.uWallSun1 = sunOnWall(s1);
    u.uWallSun2 = sunOnWall(s2);
    const h = headingDeg * DEG;
    u.uWallFwd = [Math.cos(h), Math.sin(h)];
    u.uWallRight = [-Math.sin(h), Math.cos(h)]; // +relAz turns x toward z, which is to the right on screen
    u.uWallGeo = [STORM.fromRelAz * DEG, STORM.riseDeg * DEG, STORM.dist, STORM.height];
    u.uStormFog = [STORM.fogOpen, STORM.fogWall, STORM.dist * 0.35, STORM.dist * 0.95];
    const w = (headingDeg + STORM.windRelAz) * DEG;
    u.uStormWind = [Math.cos(w), Math.sin(w)];
    // blowing sand: lit by whatever sun reaches the ground, plus the dust around it
    u.uSandLit = scale(T.sand, 1);
    u.uSandAmb = scale(dust, 0.9);
  }
  return u;
}

export const UNIFORM_TYPES = {
  uSun1Dir: 'vec3', uSun2Dir: 'vec3', uSun1Col: 'vec3', uSun2Col: 'vec3',
  uSun1Sky: 'vec4', uSun2Sky: 'vec4', uSun1Glow: 'vec4', uSun2Glow: 'vec4',
  uSun1Tint: 'vec3', uSun2Tint: 'vec3', uSun1Disc: 'vec3', uSun2Disc: 'vec3',
  uZenith: 'vec3', uHorizon: 'vec3', uFogCol: 'vec3', uFogColMix: 'float',
  uAmbSky: 'vec3', uAmbGround: 'vec3', uSand: 'vec3',
  uFog: 'vec4', uExposure: 'float', uWrap: 'float', uStars: 'float', uStorm: 'float',
  uWallFwd: 'vec2', uWallRight: 'vec2', uWallGeo: 'vec4',
  uWallBase: 'vec3', uWallSun1: 'vec3', uWallSun2: 'vec3', uDustCol: 'vec3',
  uStormFog: 'vec4', uStormWind: 'vec2', uSandLit: 'vec3', uSandAmb: 'vec3',
  uGroundY: 'float', // the camera's ground height; the fog base hangs off it
};
