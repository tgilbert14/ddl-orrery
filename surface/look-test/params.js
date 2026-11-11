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
  warpAlong: 0.15,      // round three: the three along-wind warps vary this much more slowly along the wind than
                        // across it, so they bend crests without stretching the slip faces

  // draa: the very long swell the dunes ride on
  swellF: 1 / 1400, swellA: 26,

  // primary transverse dunes, crest lines across the wind
  L1: 240,              // crest spacing (m)
  A1: 24,               // crest height (m) before modulation
  ampBase: 0.28,        // minimum fraction of A1 along a crest (low = crests break into crescents)
  ampF: 1 / 380,        // how fast crest height varies along the crest
  crest: 0.74,          // where the brink sits in one wavelength (0..1)
  // round three: the profile is built in metres. The slip face is a straight line at the angle of
  // repose whatever the crest height, so its length is height / tan(leeDeg); the windward face is
  // windK x height long and flattens into the crest. The brink is the smooth minimum of
  // the two, rounded over a height that grows as the crest dies away; the foot of the slip face
  // meets the floor through a smooth maximum (a short concave apron).
  leeDeg: 31,           // slip face angle, in the warped along-wind coordinate (the warps stretch it slightly)
  windK: 7.6,           // windward length / crest height (steepest mid-face: 1.5 / windK, about 11.2 deg)
  apronF: 0.07,         // apron rounding height / crest height
  roundLo: 0.08,        // brink rounding (m of height) on the tallest crests: a crisp line
  roundHi: 2.6,         // ... on the lowest, where the crest dies away: soft

  // secondary, smaller dunes crossing at an angle (they ride on the windward faces and floors;
  // the slip faces cut through them)
  dir2Deg: 62, L2: 78, A2: 2.2, amp2F: 1 / 210,
  round2: 0.12,         // the crossing dunes always have soft crests (no kinked intersections)

  // medium and small undulation (det1 rides with the secondary dunes, det2 on everything)
  det1F: 1 / 45, det1A: 1.0,
  det2F: 1 / 11, det2A: 0.12,

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
  w: 1536,              // texels around the camera (bearing); round three default, was 2048
  h: 2304,              // texels out from the camera (log distance); was 3072
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
  wrap: 0.25,           // wrapped diffuse (a look may set its own: TIMES.*.wrap)
  retro: 0.35,          // brightening when the sun is behind the viewer
  sheen: 0.22, fwd: 0.9, sheenPow: 4, // grazing sheen, stronger looking toward a sun
  aoLo: 0.72,           // ambient floor on steep faces
};

// ---------------------------------------------------------------- storm: the front arriving
export const STORM = {
  // round three: the haboob is a vertical wall standing on a straight front line on the ground. Its
  // near end is off the right of the frame, its far end recedes to the left into haze, so the top
  // edge rises gently toward the near end by perspective alone. Everything on it is measured in
  // metres on the wall (s along the front, Y up), so billows keep their size in the world.
  nearAz: 50, nearDist: 2000,   // the front line passes through these two ground points (relative
  farAz: -15, farDist: 3600,    // azimuth in deg, distance in m)
  height: 500,          // mean height of the wall top (m)
  topF: [1 / 1100, 1 / 380],    // slow swells of the top edge (m^-1) ...
  topA: [0.12, 0.07],           // ... as fractions of the height
  // cauliflower billows: octaves of domes (one jittered hemisphere per cell, joined by a narrow
  // smooth maximum, so lobes meet in creases), each octave rotated against the last (cell size in m,
  // weight). Only the two largest octaves shape the top edge.
  bScale: [150, 60, 24, 9.5], bAmp: [1, 0.48, 0.17, 0.06],
  bFlat: 1.3,           // lobes are this much wider than tall
  bulge: 200,           // how far the two largest billow octaves push the top edge in and out (m)
  depth: 0.85,          // relief of the domes for their normals (1 = true hemispheres)
  crease: 0.12,         // neighbouring lobes meet through a smooth maximum this wide (dome units)
  tilt: 1.6, tiltR: 70, // the wall rounds over toward the sky within tiltR of its top (upper lobes catch light)
  occLo: 0.32,          // light left in the deepest hollows
  rimW: 9,              // width of the back-lit rim inside the top edge (m)
  farFade: 1200,        // the far end thins out and sinks over this length of front (m)
  shelfY: 120,          // the rolling nose: a lit roll of billows along the base, this high (m)
  skirtH: 150,          // below this the wall dissolves into the dust over the ground (m)
  wrap: 0.25,           // dust scatters: light wraps a little past each lobe's terminator
  aerial: 1 / 7000,     // haze between the camera and the wall (m^-1)
  // air: visibility on the open (left) side and toward the wall
  fogOpen: 0.003, fogWall: 0.0075,
  // ground-level blowing sand (round three). The storm wind blows out of the wall, toward the camera
  // and the open side. The sand is drawn two ways, both without per-pixel jitter (brink plumes were
  // tried with a short fixed-step march and removed: they drew curtains, not plumes):
  //  - ribbons: thin bright streamers on the ground itself, in ground coordinates, stretched along
  //    the wind. They are iso-lines of a stretched, meandering noise, so they snake, split and merge.
  //    The distance to a line is measured in metres (|n - level| / |grad n|), antialiased over the
  //    pixel footprint and faded to the mean once a pixel is wider than a ribbon;
  //  - a low haze: an analytic exponential layer hugging the ground (no march).
  windRelAz: -150,      // the wind blows toward this heading, relative to the view (deg)
  // two families of ribbons: fine strands (read near) and broad sheets (read in the middle distance)
  // each: [along scale, across scale, core half width (m), noise levels, break-up scale, opacity]
  ribFine: { along: 26, across: 0.42, w: 0.022, levels: [0.22, -0.05, -0.36], brk: 3.2, a: 1.0 },
  ribBroad: { along: 48, across: 2.2, w: 0.13, levels: [0.16, -0.3], brk: 11, a: 0.6 },
  ribMeanderF: 1 / 38, ribMeanderA: 1.3,    // ribbons snake sideways by this much (m) over this scale
  ribHalo: 4,           // a fainter halo this many times wider than the core
  ribMean: 0.07,        // what a family averages to once a pixel is wider than its ribbons
  ribGain: 0.75,        // opacity of a ribbon at full strength
  ribGustF: 1 / 46,     // gust patches: ribbons come and go over this scale (m^-1)
  ribFar: 160,          // ribbons fade out by this distance (m); the haze carries on beyond
  hazeRho: 0.014,       // low haze: optical depth per metre at the ground ...
  hazeH: 0.8,           // ... falling off with this e-folding height (m)
  hazeMax: 40,          // ... over at most this much of the ray (m)
};

export const GRID = {
  segments: 1024,       // around the camera (round three: 640 drew a sawtooth along the new sharp slope breaks)
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
// round three: a look may stand somewhere else and look another way. Default is CAM and findCrest()
// near the origin. The shape of the dunes decides this: looking downwind (CAM.headingDeg) every slip
// face ahead faces away and hides behind its own crest, so a high sun shades nothing visible. Day
// calm stands on a higher crest and looks upwind, where every slip face faces the camera.
// stand: [cx, cz, search radius] for findCrest; sun1 / sun2: relAz and elev overrides for this look.
export const VIEWS = {
  'day/calm': { stand: [-1000, 1500, 260], headingDeg: 214, vfov: 30, vfovPortrait: 48, pitchDeg: -1.8,
    sun1: { relAz: -9, elev: 29 }, sun2: { relAz: -8, elev: 2.2 } },   // the red sun stays in a portrait frame too
  // storms: the pale sun lights the wall's face from behind the camera at day; the red sun lights its
  // near flank from beyond the near end at dusk
  'day/storm': { sun1: { relAz: 128, elev: 30 }, exposure: 0.55 },
  'dusk/storm': { sun2: { relAz: 64, elev: 3 } },
};

export const TIMES = {
  day: {
    exposure: 0.30, wrap: 0.08,          // a hard terminator: faces turned from the sun go dark
    sun1: { relAz: 32, elev: 28, col: [3.4, 3.2, 2.9], discGain: 22, radiusDeg: 1.4, halo: [0.05, 0.5, 30, 4] },
    sun2: { relAz: -22, elev: 2.2, col: [0.6, 0.05, 0.015], discGain: 3.2, radiusDeg: 0.3, halo: [0.02, 0.35, 10, 1.2], haloTint: [1.0, 0.4, 0.12] },
    zenith: [0.12, 0.28, 0.72], horizon: [0.66, 0.74, 0.88],
    // round three: shade is the sky (cool, bright) plus bounce off the lit sand (warm)
    ambSky: [0.34, 0.62, 1.65], ambGround: [0.55, 0.36, 0.19],
    sand: [0.80, 0.48, 0.22],
    fogD: 0.0002, fogH: 0.0008, fogFall: 1 / 90, fogCol: [0.66, 0.70, 0.80],
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

// The haboob's front line in the view frame (x forward, y right, metres): unit normal n pointing
// away from the camera, distance c (n.p = c on the line), unit tangent t toward the near end, and
// the along-front coordinates s0 (far end) and s1 (near end).
export function wallLine(headingDeg = 0) {
  const pt = (az, d) => [d * Math.cos((headingDeg + az) * DEG), d * Math.sin((headingDeg + az) * DEG)];
  const p1 = pt(STORM.nearAz, STORM.nearDist), p0 = pt(STORM.farAz, STORM.farDist);
  const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
  const t = [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L];
  let n = [t[1], -t[0]], c = n[0] * p0[0] + n[1] * p0[1];
  if (c < 0) { n = [-n[0], -n[1]]; c = -c; }
  return { n, c, t, s0: t[0] * p0[0] + t[1] * p0[1], s1: t[0] * p1[0] + t[1] * p1[1] };
}

// Is a sun (relative azimuth, elevation in degrees) behind the haboob wall? 0 clear .. 1 hidden.
// Uses the wall's mean top (no billows), so it is the light the ground gets, not the disc.
export function wallCover(relAz, elev) {
  const w = wallLine(0);
  const h = [Math.cos(relAz * DEG), Math.sin(relAz * DEG)];
  const den = w.n[0] * h[0] + w.n[1] * h[1];
  if (den <= 1e-4) return 0;
  const d = w.c / den;
  const s = (h[0] * w.t[0] + h[1] * w.t[1]) * d;
  // the wall ends at the near end (off the right of the frame) and thins out at the far end
  const along = Math.min(Math.max((s - w.s0) / STORM.farFade, 0), 1) * Math.min(Math.max((w.s1 - s) / 300 + 0.5, 0), 1);
  const topDeg = Math.atan(STORM.height / d) / DEG;
  return Math.min(Math.max((topDeg - elev) / 2.5 + 0.5, 0), 1) * along;
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
    uWallFwd: [1, 0], uWallRight: [0, 1], uWallN: [1, 0], uWallT: [0, 1], uWallGeo: [1, 0, 1, 1],
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
    // the disc of a sun on the open side is smaller and dimmer in the dust, with a wider, weaker
    // halo; one behind the wall is hidden by the wall itself in the sky shader
    u.uSun1Sky = [0, 0, s1.discGain * 0.2, s1.radiusDeg * DEG * 0.8];
    u.uSun2Sky = [0, 0, s2.discGain * 0.2, s2.radiusDeg * DEG * 0.8];
    u.uSun1Disc = [s1.col[0], s1.col[1] * 0.78, s1.col[2] * 0.5];   // reddened by the dust
    u.uSun2Disc = [s2.col[0], s2.col[1] * 0.78, s2.col[2] * 0.5];
    u.uSun1Glow = [s1.halo[0] * 0.9, s1.halo[1] * 0.45, s1.halo[2] * DEG * 0.7, s1.halo[3] * DEG * 1.8];
    u.uSun2Glow = [s2.halo[0] * 0.9, s2.halo[1] * 0.45, s2.halo[2] * DEG * 0.7, s2.halo[3] * DEG * 1.8];
    // round three: the open side keeps its own sky, dulled by dust (round two replaced it outright)
    const mixv = (a, b, k) => a.map((x, i) => x * (1 - k) + b[i] * k);
    u.uZenith = mixv(T.zenith, scale(dust, 0.55), 0.25);
    u.uHorizon = mixv(T.horizon, dust, 0.8);
    u.uFogColMix = 0;
    u.uAmbSky = scale(dust, 0.45);
    u.uAmbGround = scale(dust, 0.2);
    u.uDustCol = dust;
    u.uFog = [STORM.fogOpen, T.fogH * 4, T.fogFall, 0];
    // the wall's own colour where no sun reaches (its body, lit by the sky and the dust around it)
    u.uWallBase = mixv(scale(dust, 0.55), scale(u.uZenith, 0.5), 0.25);
    // light on the wall's billows, reddened by the dust it passes through
    const sunOnWall = (s) => (s.elev > -1 ? scale(s.col, 0.62 * Math.min(1, Math.max(0, (s.elev + 1) / 4)) + 0.1).map((c, i) => c * [1, 0.78, 0.5][i]) : [0, 0, 0]);
    u.uWallSun1 = sunOnWall(s1);
    u.uWallSun2 = sunOnWall(s2);
    const h = headingDeg * DEG;
    u.uWallFwd = [Math.cos(h), Math.sin(h)];
    u.uWallRight = [-Math.sin(h), Math.cos(h)]; // +relAz turns x toward z, which is to the right on screen
    const wl = wallLine(headingDeg);
    u.uWallN = wl.n; u.uWallT = wl.t;
    u.uWallGeo = [wl.c, wl.s0, STORM.height, wl.s1];
    u.uStormFog = [STORM.fogOpen, STORM.fogWall, 0, 0];
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
  uWallFwd: 'vec2', uWallRight: 'vec2', uWallN: 'vec2', uWallT: 'vec2', uWallGeo: 'vec4',
  uWallBase: 'vec3', uWallSun1: 'vec3', uWallSun2: 'vec3', uDustCol: 'vec3',
  uStormFog: 'vec4', uStormWind: 'vec2', uSandLit: 'vec3', uSandAmb: 'vec3',
  uGroundY: 'float', // the camera's ground height; the fog base hangs off it
};
