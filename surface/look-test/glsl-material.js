// Classic WebGLRenderer path: the Dust Sea ground, sky, shadow-map bake and probes as GLSL ES 3.00
// ShaderMaterials. The maths mirrors height.js and tsl-material.js function for function, in order:
//   hash2 -> vnoise -> vnoiseD -> duneProfile -> duneProfileD -> slipProfileD -> slipProfile
//   -> heightLow -> heightLowD -> height -> heightD                                                (ground formula)
//   shadowMarch -> horizonMarch -> sunSky -> starField -> wallHit -> domes -> haboob -> skyColor -> fogAmount
//   -> sandHaze -> ribbons -> sunOnSand -> aces -> srgbEncode          (light, sky, air, output)
// Every constant comes from params.js through the #define block below. The debug switches
// (opts: shadows, normal, ripples) become #defines too; see tsl-material.js for their meaning.

import { G, SH, SHMAP, SKY, SAND, STORM, GRID, CAM, DEG, UNIFORM_TYPES } from './params.js';

const f = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };

// the billow octaves, unrolled with their constants (same rotations and offsets as tsl-material.js)
const BROT = [0.5, 1.33, 2.21, 3.12], BOFF = [[0, 0], [5.2, 1.3], [1.7, 8.9], [8.3, 2.8]];
// the 3 x 3 dome cells, unrolled as tsl-material.js unrolls them (measured: no change in frame time
// against the nested loop on this Mac; kept so the two paths have the same shape)
function domeCells() {
  const out = [];
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    out.push(`  { int cx = int(ip.x) + (${i}), cy = int(ip.y) + (${j});
    vec2 ctr = ip + vec2(${f(i + 0.5)}, ${f(j + 0.5)}) + (vec2(hash2(cx, cy), hash2(cx + 57, cy)) - 0.5) * 0.6;
    float r = hash2(cx, cy + 113) * 0.25 + 0.75;
    vec2 dv = p - ctr;
    float h = sqrt(max(r * r - dot(dv, dv), 0.0));
    float m = clamp((h - best) / CREASE * 0.5 + 0.5, 0.0, 1.0);
    g = mix(g, -dv / max(h, 0.2), m);
    best = mix(best, h, m) + m * (1.0 - m) * CREASE; }`);
  }
  return out.join('\n');
}

function billowOctaves() {
  const sum = STORM.bAmp.reduce((x, y) => x + y, 0);
  return STORM.bScale.map((sc, i) => {
    const c = f(Math.cos(BROT[i])), sn = f(Math.sin(BROT[i])), k = f(1 / sc), A = f(STORM.bAmp[i] / sum);
    return `  { vec3 n = domes(vec2(S * (${c} * ${k}) - Y * (${sn} * ${k}) + ${f(BOFF[i][0])}, S * (${sn} * ${k}) + Y * (${c} * ${k}) + ${f(BOFF[i][1])}));
    acc += vec4(n.x, n.y * ${c} + n.z * ${sn}, n.z * ${c} - n.y * ${sn}, ${i < 2 ? 'n.x' : '0.0'}) * ${A}; }`;
  }).join('\n');
}

function defines(opts) {
  const W = [Math.cos(G.windDeg * DEG), Math.sin(G.windDeg * DEG)];
  const W2 = [Math.cos(G.dir2Deg * DEG), Math.sin(G.dir2Deg * DEG)];
  const d = {
    WX: W[0], WZ: W[1], W2X: W2[0], W2Z: W2[1],
    WARP1F: G.warp1F, WARP1A: G.warp1A, WARP2F: G.warp2F, WARP2A: G.warp2A, WARP3F: G.warp3F, WARP3A: G.warp3A,
    SWELLF: G.swellF, SWELLA: G.swellA,
    L1: G.L1, A1: G.A1, AMPBASE: G.ampBase, AMPF: G.ampF, CREST: G.crest,
    ROUNDLO: G.roundLo, ROUNDHI: G.roundHi, WARPALONG: G.warpAlong,
    XC: G.crest * G.L1, WINDK: G.windK, APRONF: G.apronF, LEE_T: Math.tan(G.leeDeg * DEG),
    KB_SLOPE: (G.roundLo - G.roundHi) / (G.A1 * (1 - G.ampBase)),
    L2: G.L2, A2: G.A2, AMP2F: G.amp2F, ROUND2: G.round2,
    DET1F: G.det1F, DET1A: G.det1A, DET2F: G.det2F, DET2A: G.det2A,
    RIPL: G.ripL, RIPSLOPE: G.ripSlope, RIPAMPF: G.ripAmpF, RIPWARPF: G.ripWarpF, RIPWARPA: G.ripWarpA,
    RIPLEELO: G.ripLeeLo, RIPLEEHI: G.ripLeeHi,
    GLINTCELL: G.glintCell, GLINTDENS: G.glintDensity, GLINTPOW: G.glintPow, GLINTGAIN: G.glintGain,
    SH_START: SH.start, SH_GROW: SH.grow, SH_DSTEP: SH.dStep, SH_MINSTEP: SH.minStep, SH_MAXDIST: SH.maxDist,
    SH_LIFT: SH.lift, SH_CEIL: SH.ceiling, SH_PENUMBRA: SH.penumbra,
    SHM_R0: SHMAP.r0, SHM_LNR: Math.log(SHMAP.r1 / SHMAP.r0),
    SKY_K: SKY.k, STAR_SCALE: SKY.starScale, STAR_THRESH: SKY.starThresh, STAR_SIZE: SKY.starSize,
    RETRO: SAND.retro, SHEEN: SAND.sheen, FWD: SAND.fwd, SHEENPOW: SAND.sheenPow,
    AOLO: SAND.aoLo,
    TOPF0: STORM.topF[0], TOPF1: STORM.topF[1], TOPA0: STORM.topA[0], TOPA1: STORM.topA[1],
    BULGE: STORM.bulge, DEPTH: STORM.depth, TILT: STORM.tilt, TILTR: STORM.tiltR, OCCLO: STORM.occLo,
    RIMW: STORM.rimW, WRAPW: STORM.wrap, BFLAT: STORM.bFlat, CREASE: STORM.crease, FARFADE: STORM.farFade, SHELFY: STORM.shelfY, SKIRTH: STORM.skirtH, AERIAL: STORM.aerial,
    RF_ALONG: STORM.ribFine.along, RF_ACROSS: STORM.ribFine.across, RF_W: STORM.ribFine.w, RF_BRK: STORM.ribFine.brk, RF_A: STORM.ribFine.a,
    RF_L0: STORM.ribFine.levels[0], RF_L1: STORM.ribFine.levels[1], RF_L2: STORM.ribFine.levels[2],
    RB_ALONG: STORM.ribBroad.along, RB_ACROSS: STORM.ribBroad.across, RB_W: STORM.ribBroad.w, RB_BRK: STORM.ribBroad.brk, RB_A: STORM.ribBroad.a,
    RB_L0: STORM.ribBroad.levels[0], RB_L1: STORM.ribBroad.levels[1],
    RIB_MF: STORM.ribMeanderF, RIB_MA: STORM.ribMeanderA, RIB_MEAN: STORM.ribMean, RIB_HALO: STORM.ribHalo,
    RIB_GAIN: STORM.ribGain, RIB_GF: STORM.ribGustF, RIB_FAR: STORM.ribFar,
    HAZE_RHO: STORM.hazeRho, HAZE_H: STORM.hazeH, HAZE_MAX: STORM.hazeMax, CAM_EYE: CAM.eye,
    GRID_RMAX: GRID.rMax,
  };
  return Object.entries(d).map(([k, v]) => `#define ${k} ${f(v)}`).join('\n') +
    `\n#define SH_STEPS ${SH.steps}\n` +
    `#define SHADOWS_${opts.shadows.toUpperCase()} 1\n` +
    (opts.normal === 'fd' ? '#define NORMAL_FD 1\n' : '') +
    (opts.ripples ? '#define RIPPLES 1\n' : '');
}

function uniformDecls() {
  return Object.entries(UNIFORM_TYPES).map(([k, t]) => `uniform ${t} ${k};`).join('\n') +
    '\nuniform vec2 uGridOrigin;\nuniform vec2 uProbeO;\nuniform vec2 uShC;\nuniform sampler2D uShMap;\nuniform float uViewH;\n' +
    // pixel coordinates with a top-left origin, as TSL's screenCoordinate has, so the per-pixel
    // dither and jitter hashes match the WebGPURenderer paths pixel for pixel
    '#define PIX ivec2(int(gl_FragCoord.x), int(uViewH - gl_FragCoord.y))\n';
}

// ------------------------------------------------------------------ ground formula
const FORMULA = /* glsl */`
float hash2(int ix, int iy) {
  uint h = uint(ix) * 374761393u + uint(iy) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h = h ^ (h >> 16u);
  return float(h >> 8u) / 16777216.0;
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (f * -2.0 + 3.0);
  int ix = int(i.x), iy = int(i.y);
  float a = hash2(ix, iy), b = hash2(ix + 1, iy);
  float c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  float ab = mix(a, b, u.x), cd = mix(c, d, u.x);
  return mix(ab, cd, u.y) * 2.0 - 1.0;
}

vec3 vnoiseD(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (f * -2.0 + 3.0);
  vec2 du = f * (1.0 - f) * 6.0;
  int ix = int(i.x), iy = int(i.y);
  float a = hash2(ix, iy), b = hash2(ix + 1, iy);
  float c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  float ab = mix(a, b, u.x), cd = mix(c, d, u.x);
  float ba = b - a;
  return vec3(mix(ab, cd, u.y) * 2.0 - 1.0, du.x * (ba + (d - c - ba) * u.y) * 2.0, du.y * (cd - ab) * 2.0);
}

float duneProfile(float t, float k) {
  float u = t / CREST;
  float v = (t - CREST) / (1.0 - CREST);
  float up = u * u * (2.0 - u);
  float omv = 1.0 - v;
  float down = omv * omv;
  float h = clamp((down - up) / k * 0.5 + 0.5, 0.0, 1.0);
  return down + (up - down) * h - k * h * (1.0 - h);
}

vec3 duneProfileD(float t, float k) {
  float u = t / CREST;
  float v = (t - CREST) / (1.0 - CREST);
  float up = u * u * (2.0 - u);
  float omv = 1.0 - v;
  float down = omv * omv;
  float dup = (u * 4.0 - u * u * 3.0) / CREST;
  float ddown = omv * -2.0 / (1.0 - CREST);
  float h = clamp((down - up) / k * 0.5 + 0.5, 0.0, 1.0);
  return vec3(down + (up - down) * h - k * h * (1.0 - h), ddown + (dup - ddown) * h, -(h * (1.0 - h)));
}

// round three: the primary dune in metres (see height.js): windward W, slip face S at the angle
// of repose, floor bm, apron smax(S, bm), brink smin(W, apron). Returns (h, d/dx, d/damp, d/dbm).
vec4 slipProfileD(float x, float amp, float bm) {
  float dx = x - XC;
  float u = dx / (amp * WINDK) + 1.0;
  float uc = clamp(u, 0.0, 1.0);
  float P = uc * uc * (3.0 - uc * 2.0);
  float dP = u < 1.0 ? uc * 6.0 * (1.0 - uc) : 0.0;
  float W = amp * P + bm;
  float Wx = dP / WINDK;
  float Wa = P - dP * (u - 1.0);
  float S = amp - dx * LEE_T;
  float kA = amp * APRONF;
  float hA = clamp((S - bm) / kA * 0.5 + 0.5, 0.0, 1.0);
  float L = bm + (S - bm) * hA + kA * hA * (1.0 - hA);
  float Lx = hA * -LEE_T;
  float La = hA + hA * (1.0 - hA) * APRONF;
  float Lb = 1.0 - hA;
  float kB = (amp - A1 * AMPBASE) * KB_SLOPE + ROUNDHI;
  float hB = clamp((L - W) / kB * 0.5 + 0.5, 0.0, 1.0);
  float omb = 1.0 - hB;
  return vec4(L + (W - L) * hB - kB * hB * omb, hB * Wx + omb * Lx, hB * Wa + omb * La - hB * omb * KB_SLOPE, hB + omb * Lb);
}

float slipProfile(float x, float amp, float bm) {
  float dx = x - XC;
  float u = dx / (amp * WINDK) + 1.0;
  float uc = clamp(u, 0.0, 1.0);
  float W = amp * (uc * uc * (3.0 - uc * 2.0)) + bm;
  float S = amp - dx * LEE_T;
  float kA = amp * APRONF;
  float hA = clamp((S - bm) / kA * 0.5 + 0.5, 0.0, 1.0);
  float L = bm + (S - bm) * hA + kA * hA * (1.0 - hA);
  float kB = (amp - A1 * AMPBASE) * KB_SLOPE + ROUNDHI;
  float hB = clamp((L - W) / kB * 0.5 + 0.5, 0.0, 1.0);
  return L + (W - L) * hB - kB * hB * (1.0 - hB);
}

float heightLow(vec2 p) {
  float x = p.x, z = p.y;
  float a = x * WX + z * WZ;
  float c = -x * WZ + z * WX;
  float wa = vnoise(vec2(c * WARP1F, a * (WARP1F * WARPALONG))) * WARP1A
    + vnoise(vec2(c * WARP2F + 31.7, a * (WARP2F * WARPALONG) - 11.3)) * WARP2A;
  float wc = vnoise(p * WARP1F + vec2(57.1, 9.2)) * WARP1A;
  float w3 = vnoise(vec2(c * WARP3F - 19.4, a * (WARP3F * WARPALONG) + 23.9)) * WARP3A;
  float a2 = a + wa + w3, c2 = c + wc;
  float swell = vnoise(p * SWELLF + vec2(3.3, 7.7)) * SWELLA;
  float s2 = (x * W2X + z * W2Z + wa * 0.5) / L2;
  float k2 = floor(s2);
  float t2 = s2 - k2;
  float amp2 = (vnoise(vec2((-x * W2Z + z * W2X) * AMP2F, k2 * 0.613 + 2.5)) * 0.5 + 0.5) * A2;
  float bm = amp2 * duneProfile(t2, ROUND2) + vnoise(p * DET1F + vec2(1.3, -4.1)) * DET1A;
  float k = floor(a2 / L1);
  float amp = ((vnoise(vec2(c2 * AMPF, k * 0.731 + 0.5)) * 0.5 + 0.5) * (1.0 - AMPBASE) + AMPBASE) * A1;
  return swell + slipProfile(a2 - k * L1, amp, bm);
}

vec3 heightLowD(vec2 p) {
  float x = p.x, z = p.y;
  float a = x * WX + z * WZ;
  float c = -x * WZ + z * WX;
  // warps sampled at (c F, a F warpAlong); their gradients in (c, a) are rotated back to (x, z)
  vec3 nA = vnoiseD(vec2(c * WARP1F, a * (WARP1F * WARPALONG)));
  vec3 nB = vnoiseD(vec2(c * WARP2F + 31.7, a * (WARP2F * WARPALONG) - 11.3));
  vec3 n3 = vnoiseD(vec2(c * WARP3F - 19.4, a * (WARP3F * WARPALONG) + 23.9));
  float wa = nA.x * WARP1A + nB.x * WARP2A;
  float wac = nA.y * (WARP1A * WARP1F) + nB.y * (WARP2A * WARP2F);
  float waa = (nA.z * (WARP1A * WARP1F) + nB.z * (WARP2A * WARP2F)) * WARPALONG;
  vec2 gwa = vec2(wac * -WZ + waa * WX, wac * WX + waa * WZ);
  float w3c = n3.y * (WARP3A * WARP3F), w3a = n3.z * (WARP3A * WARP3F * WARPALONG);
  vec3 nC = vnoiseD(p * WARP1F + vec2(57.1, 9.2));
  float a2 = a + wa + n3.x * WARP3A;
  float c2 = c + nC.x * WARP1A;
  vec2 ga2 = vec2(WX, WZ) + gwa + vec2(w3c * -WZ + w3a * WX, w3c * WX + w3a * WZ);
  vec2 gc2 = vec2(-WZ, WX) + nC.yz * (WARP1A * WARP1F);
  vec3 nS = vnoiseD(p * SWELLF + vec2(3.3, 7.7));
  float s2 = (x * W2X + z * W2Z + wa * 0.5) / L2;
  float k2 = floor(s2);
  float t2 = s2 - k2;
  vec3 nA2 = vnoiseD(vec2((-x * W2Z + z * W2X) * AMP2F, k2 * 0.613 + 2.5));
  float amp2 = (nA2.x * 0.5 + 0.5) * A2;
  vec3 pr2 = duneProfileD(t2, ROUND2);
  vec3 d1 = vnoiseD(p * DET1F + vec2(1.3, -4.1));
  float bm = amp2 * pr2.x + d1.x * DET1A;
  vec2 gbm = vec2(-W2Z, W2X) * (nA2.y * (A2 * 0.5 * AMP2F) * pr2.x) + (vec2(W2X, W2Z) + gwa * 0.5) * (pr2.y * amp2 / L2)
    + d1.yz * (DET1A * DET1F);
  float k = floor(a2 / L1);
  vec3 nAmp = vnoiseD(vec2(c2 * AMPF, k * 0.731 + 0.5));
  float amp = ((nAmp.x * 0.5 + 0.5) * (1.0 - AMPBASE) + AMPBASE) * A1;
  vec2 gamp = gc2 * (nAmp.y * (A1 * (1.0 - AMPBASE) * 0.5 * AMPF));
  vec4 pr = slipProfileD(a2 - k * L1, amp, bm);
  return vec3(nS.x * SWELLA + pr.x, nS.yz * (SWELLA * SWELLF) + ga2 * pr.y + gamp * pr.z + gbm * pr.w);
}

float height(vec2 p) {
  return heightLow(p) + vnoise(p * DET2F + vec2(-7.9, 2.2)) * DET2A;
}

vec3 heightD(vec2 p) {
  vec3 lo = heightLowD(p);
  vec3 d2 = vnoiseD(p * DET2F + vec2(-7.9, 2.2));
  return vec3(lo.x + d2.x * DET2A, lo.yz + d2.yz * (DET2A * DET2F));
}
`;

// ------------------------------------------------------------------ light, sky, air, output
const LIGHT_SRC = /* glsl */`
float shadowMarch(vec3 p, vec3 L, float k) {
  float res = 1.0;
  float t = SH_START;
  for (int i = 0; i < SH_STEPS; i++) {
    vec3 q = p + L * t;
    float d = q.y - height(q.xz);
    res = min(res, d * k / t);
    // step by the height gap: fine while the ray skims the sand (so a sharp crest is not
    // stepped over), long once it has cleared it
    t += clamp(max(d, 0.0) * SH_DSTEP + t * SH_GROW, SH_MINSTEP, t * 0.35 + 1.0);
    if (res < 0.002 || t > SH_MAXDIST || q.y > SH_CEIL) break;
  }
  float r = clamp(res, 0.0, 1.0);
  return r * r * (3.0 - r * 2.0);
}

// The same march, returning the horizon value Hmax = max over the samples of (h(q) - p.y) / t
// instead of the shadow. The march's soft shadow is exactly k * (L.y - Hmax), so the map stores
// Hmax: a smooth field that filters cleanly, where a stored 0..1 shadow would filter into a
// staircase along every crest.
float horizonMarch(vec3 p, vec3 L, float k) {
  float hm = -8.0;
  float t = SH_START;
  for (int i = 0; i < SH_STEPS; i++) {
    vec3 q = p + L * t;
    float d = q.y - height(q.xz);
    hm = max(hm, L.y - d / t);
    t += clamp(max(d, 0.0) * SH_DSTEP + t * SH_GROW, SH_MINSTEP, t * 0.35 + 1.0);
    if ((L.y - hm) * k < 0.002 || t > SH_MAXDIST || q.y > SH_CEIL) break;
  }
  return hm;
}

// halo: two exponentials in angle from the sun (no shoulder, so no glow ends in an edge)
vec3 sunSky(vec3 rd, vec3 L, vec3 tint, vec3 discCol, vec4 sky, vec4 glow, float withDisc, float gy) {
  float c = dot(rd, L);
  float ang = acos(clamp(c, -1.0, 1.0));
  float halo = glow.x * exp(-ang / glow.z) + glow.y * exp(-ang / glow.w);
  float boost = 1.0 - gy * 0.6;
  float disc = smoothstep(cos(sky.w * 1.25), cos(sky.w * 0.8), c) * withDisc * smoothstep(-0.004, 0.004, rd.y);
  return tint * (halo * boost) + discCol * (disc * sky.z);
}

float starField(vec3 rd) {
  vec2 sp = rd.xz / (rd.y + 1.0) * STAR_SCALE;
  vec2 cell = floor(sp);
  int ix = int(cell.x), iy = int(cell.y);
  float hs = hash2(ix, iy);
  vec2 jit = vec2(hash2(ix + 101, iy), hash2(ix, iy + 211)) - 0.5;
  vec2 fp = sp - cell - 0.5 - jit * 0.5;
  float b = max(hs - STAR_THRESH, 0.0) / (1.0 - STAR_THRESH);
  return b * (1.0 - smoothstep(0.0, STAR_SIZE, length(fp))) * smoothstep(0.02, 0.2, rd.y) * 2.5;
}

// Where a view direction meets the haboob's front line: vec4(distance, s along the front, Y up the
// wall, cover). cover is 0 off the wall's ends, thinning over STORM.farFade at the far end.
vec4 wallHit(vec3 rd) {
  vec2 hd = normalize(rd.xz + vec2(1e-6, 0.0));
  float den = dot(hd, uWallN);
  float d = uWallGeo.x / max(den, 1e-4);
  float s = dot(hd, uWallT) * d;
  float Y = rd.y / max(length(rd.xz), 1e-3) * d;
  float cover = step(1e-4, den) * smoothstep(uWallGeo.y, uWallGeo.y + FARFADE, s) * clamp((uWallGeo.w - s) / 300.0 + 0.5, 0.0, 1.0);
  return vec4(d, s, Y, cover);
}

// One octave of domes in cell units: each cell holds a hemisphere of radius 0.75..1.0 at a
// jittered centre; a smooth maximum joins them, so neighbouring lobes meet in a narrow crease.
// Returns vec3(height 0..1, d/dp.x, d/dp.y).
vec3 domes(vec2 p) {
  vec2 ip = floor(p);
  float best = 0.0;
  vec2 g = vec2(0.0);
DOME_CELLS
  return vec3(best, g);
}

// cauliflower billows: octaves of domes, each rotated against the last. Returns vec3(B normalised
// to about 0..1, then the weighted dome slopes along s and Y: each dome's own slope, so a small
// lobe is as round as a big one and only its weight makes it shallower; w: the two largest octaves
// alone, which shape the top edge, so fine lobes never float off it as specks).
vec4 billows(float S, float Y) {
  vec4 acc = vec4(0.0);
BILLOW_OCTAVES
  return acc;
}

// The haboob: a wall standing on its front line, in metres on the wall. Returns colour and cover.
vec3 wallLit(vec3 rd, vec3 L, vec3 C, vec3 N, float occ, float dens, float rimBand) {
  vec3 Lw = vec3(dot(L.xz, uWallT), L.y, -dot(L.xz, uWallN));
  float diff = max((dot(N, Lw) + WRAPW) / (1.0 + WRAPW), 0.0);
  float rim = rimBand * max(-Lw.z, 0.0) * pow(max(dot(rd, L), 0.0), 4.0) * 3.0;
  return C * (diff * occ * (dens * 0.5 + 0.5) + rim);
}

vec4 haboob(vec3 rd) {
  vec4 w = wallHit(rd);
  float d = w.x, S = w.y, Y = w.z;
  float H = (vnoise(vec2(S * TOPF0, 3.1)) * TOPA0 + vnoise(vec2(S * TOPF1, 7.3)) * TOPA1 + 1.0) * uWallGeo.z
    * (smoothstep(uWallGeo.y, uWallGeo.y + FARFADE, S) * 0.45 + 0.55);   // lower toward the far end
  // one pixel in metres on the wall, taken before any branch (derivatives need uniform control flow)
  float px = length(fwidth(rd)) * d / max(length(rd.xz), 1e-3);
  // billows only where the wall can show; below its foot the skirt covers everything
  vec4 B = vec4(0.5, 0.0, 0.0, 0.4);
  if (Y > -SKIRTH * 0.5 && w.w > 0.0) B = billows(S, Y * BFLAT);
  B.z *= BFLAT;
  // signed metres inside the wall's top edge; the billows push the edge in and out at every scale
  float e = H - Y + (B.w - 0.4) * BULGE;
  // crisp: the edge is antialiased over one pixel, whatever the distance
  float a = clamp(e / max(px, 1e-3) + 0.5, 0.0, 1.0) * w.w;
  // the rolling nose: a roll of billows along the base, lit on top, with a dark crease above it
  float Yr = (vnoise(vec2(S / 170.0, 5.5)) * 0.3 + 1.0) * SHELFY;
  float below = step(Y, Yr);
  float shelfTilt = below * exp(-max(Yr - Y, 0.0) / 30.0) * 1.3;
  float crease = 1.0 - (1.0 - below) * exp(-max(Y - Yr, 0.0) / 28.0) * 0.25;
  // normal in the wall's frame (x along the front toward its near end, y up, z toward the camera);
  // the top rounds over toward the sky so the upper lobes catch light
  float tilt = exp(-max(e, 0.0) / TILTR) * TILT + shelfTilt;
  vec3 N = normalize(vec3(B.y * -DEPTH, B.z * -DEPTH + tilt, 1.0));
  float occ = (smoothstep(0.12, 0.72, B.x) * (1.0 - OCCLO) + OCCLO) * crease;
  float dens = smoothstep(0.0, H * 0.7, Y) * 0.65 + 0.35;   // darker, denser low
  float rimBand = exp(-max(e, 0.0) / RIMW);
  vec3 col = uWallBase * dens * (B.x * 0.5 + 0.75) * crease
    + wallLit(rd, uSun1Dir, uWallSun1, N, occ, dens, rimBand) + wallLit(rd, uSun2Dir, uWallSun2, N, occ, dens, rimBand);
  // haze between camera and wall, and the skirt: the base dissolves into the dust over the ground
  col = mix(col, uHorizon, 1.0 - exp(-d * AERIAL));
  col = mix(col, uHorizon * 0.85, 1.0 - smoothstep(-10.0, SKIRTH, Y));
  return vec4(col, a);
}

vec3 skyColor(vec3 rd, float withDisc) {
  float y = max(rd.y, 0.0);
  float gy = 1.0 - exp(-y * SKY_K);   // 0 at the horizon, 1 overhead: a bright band low, deep sky above
  vec3 col = mix(uHorizon, uZenith, gy);
  col += sunSky(rd, uSun1Dir, uSun1Tint, uSun1Disc, uSun1Sky, uSun1Glow, withDisc, gy);
  col += sunSky(rd, uSun2Dir, uSun2Tint, uSun2Disc, uSun2Sky, uSun2Glow, withDisc, gy);
  col += vec3(starField(rd) * uStars * withDisc);
  if (uStorm > 0.5) {
    vec4 wall = haboob(rd);
    col = mix(col, wall.xyz, wall.w);
  }
  return col;
}

// distance + height fog; in the storm the distance part thickens toward the wall and the ground
// beyond the wall's foot is inside it
float fogAmount(vec3 ro, vec3 rd, float dist) {
  vec4 w = wallHit(rd);
  float wallSide = w.w * uStorm;
  float dens = mix(uFog.x, uStormFog.y, wallSide) * dist;
  float k = uFog.z;
  float ry = max(rd.y * k * dist, -20.0);
  float fr = abs(ry) < 1e-4 ? 1.0 - ry * 0.5 : (1.0 - exp(-ry)) / ry;
  dens += uFog.y * exp(-(ro.y - uFog.w) * k) * dist * fr;
  // ground toward the wall's foot disappears into its skirt; beyond the foot it is inside the wall
  return max(1.0 - exp(-dens), wallSide * smoothstep(w.x * 0.25, w.x * 0.97, dist));
}

// blowing sand: densest in the lowest half metre, following the ground; downwind of a crest the
// sand keeps the crest's height for a few metres, so it pours off the brink
// log-polar shadow map coordinates of a ground point
vec2 shadowUV(vec2 xz) {
  vec2 d = xz - uShC;
  float r = max(length(d), SHM_R0);
  return vec2(atan(d.y, d.x) / 6.28318530718, log(r / SHM_R0) / SHM_LNR);
}

// the march's soft shadow from a horizon value: res = k * (L.y - Hmax), then the same smoothstep
float softFromHorizon(float H, vec3 L, float k) {
  float r = clamp((L.y - H) * k, 0.0, 1.0);
  return r * r * (3.0 - r * 2.0);
}
// the low haze of blowing sand: an exponential layer above a base height, integrated in closed
// form along the last len metres of the ray (looking down, the layer is densest at the far end)
float sandHaze(vec3 rd, float len, float aboveBase) {
  float ky = max(-rd.y, 1e-3) / HAZE_H;
  float L = min(len, HAZE_MAX);
  return 1.0 - exp(-HAZE_RHO * exp(-aboveBase / HAZE_H) * (1.0 - exp(-ky * L)) / ky);
}

// streamers on the ground: iso-lines of a meandering noise stretched along the storm wind.
// One family: the distance to a level line is measured in metres (|n - level| / |grad n|), so a
// strand keeps its width where the noise flattens out; it fades to its mean once a pixel is wider.
float ribLine(float n, float gm, float px, float w, float lvl) {
  float dm = abs(n - lvl) / gm;
  float core = 1.0 - smoothstep(w - px * 0.5, w + px * 0.5, dm);
  float halo = (1.0 - smoothstep(0.0, px + w * RIB_HALO, dm)) * 0.3;
  return max(core, halo);
}
float ribFine(float ra, float cm, float px) {
  vec3 nd = vnoiseD(vec2(ra / RF_ALONG, cm / RF_ACROSS));
  float gm = max(length(vec2(nd.y / RF_ALONG, nd.z / RF_ACROSS)), 1e-3);
  float lines = max(max(ribLine(nd.x, gm, px, RF_W, RF_L0), ribLine(nd.x, gm, px, RF_W, RF_L1)), ribLine(nd.x, gm, px, RF_W, RF_L2));
  // only where a line runs along the wind: where a level line turns back it would draw a hook
  float align = smoothstep(0.86, 0.97, abs(nd.z / RF_ACROSS) / gm);
  // strands break up along their length
  float brk = smoothstep(-0.45, 0.35, vnoise(vec2(ra / RF_BRK, cm / RF_ACROSS * 0.9) + vec2(3.0, 1.0)));
  return mix(lines * brk * align, RIB_MEAN, smoothstep(RF_W * 0.8, RF_W * 3.0, px)) * RF_A;
}
float ribBroad(float ra, float cm, float px) {
  vec3 nd = vnoiseD(vec2(ra / RB_ALONG, cm / RB_ACROSS) + vec2(13.0, 13.0 * 1.7));
  float gm = max(length(vec2(nd.y / RB_ALONG, nd.z / RB_ACROSS)), 1e-3);
  float lines = max(ribLine(nd.x, gm, px, RB_W, RB_L0), ribLine(nd.x, gm, px, RB_W, RB_L1));
  float align = smoothstep(0.86, 0.97, abs(nd.z / RB_ACROSS) / gm);
  float brk = smoothstep(-0.45, 0.35, vnoise(vec2(ra / RB_BRK, cm / RB_ACROSS * 0.9) + vec2(3.0 + 13.0, 1.0)));
  return mix(lines * brk * align, RIB_MEAN, smoothstep(RB_W * 0.8, RB_W * 3.0, px)) * RB_A;
}
float ribbons(vec2 xz, vec2 grad, float dist, float fw) {
  vec2 sw = uStormWind;
  float ra = dot(xz, sw), rc = dot(xz, vec2(-sw.y, sw.x));
  float cm = rc + vnoise(vec2(ra * RIB_MF, rc * 0.05 + 4.0)) * RIB_MA
    + vnoise(vec2(ra * (RIB_MF * 3.7), rc * 0.21 + 9.0)) * (RIB_MA * 0.3);
  float px = fw * 0.7;
  // the broad sheets give way to the fine strands near the feet, where they would read as stripes
  float r = max(ribFine(ra, cm, px), ribBroad(ra, cm + rc * 0.15, px) * smoothstep(3.0, 12.0, dist));
  float gust = smoothstep(-0.5, 0.45, vnoise(vec2(ra, rc) * RIB_GF + vec2(7.0, 3.0))) * 0.65 + 0.35;
  // the wind keeps sand moving over gentle ground either way; only a steep lee (a slip face turned
  // away from the wind) is sheltered
  float expo = 1.0 - smoothstep(0.25, 0.5, -dot(grad, sw)) * 0.85;
  return r * gust * expo * (1.0 - smoothstep(RIB_FAR * 0.45, RIB_FAR, dist)) * RIB_GAIN;
}

// the colour of the sand in the air: each sun that reaches the ground, scattered forward
vec3 sandColor(vec3 rd) {
  float f1 = pow(max(dot(rd, uSun1Dir), 0.0), 5.0) * 2.2 + 0.45;
  float f2 = pow(max(dot(rd, uSun2Dir), 0.0), 5.0) * 2.2 + 0.45;
  return (uSandLit * (uSun1Col * f1 + uSun2Col * f2) + uSandAmb) * 1.25;
}

vec3 sunOnSand(vec3 n, vec3 V, vec3 alb, vec3 L, vec3 C, float sh, vec3 nm, float gAmt, float wrap) {
  float ndl = dot(n, L);
  float wrapd = max((ndl + wrap) / (wrap + 1.0), 0.0);
  float ndv = max(dot(n, V), 0.0);
  float vl = dot(V, L);
  float retro = pow(max(vl, 0.0), 3.0);
  float fwdS = pow(max(-vl, 0.0), 4.0);
  float graze = pow(1.0 - ndv, SHEENPOW);
  vec3 diff = alb * wrapd * (1.0 + RETRO * retro);
  vec3 sheen = mix(alb, vec3(1.0), 0.35) * graze * max(ndl + 0.25, 0.0) * (SHEEN + FWD * fwdS);
  vec3 H = normalize(L + V);
  float g = pow(max(dot(nm, H), 0.0), GLINTPOW) * gAmt * GLINTGAIN;
  return C * sh * (diff + sheen + vec3(g));
}

vec3 aces(vec3 x) {
  return clamp((x * (x * 2.51 + 0.03)) / (x * (x * 2.43 + 0.59) + 0.14), 0.0, 1.0);
}

vec3 srgbEncode(vec3 c) {
  return mix(c * 12.92, pow(c, vec3(1.0 / 2.4)) * 1.055 - 0.055, step(vec3(0.0031308), c));
}

vec3 finish(vec3 col) {
  vec3 o = srgbEncode(aces(col * uExposure));
  float dth = hash2(PIX.x, PIX.y) - 0.5;
  return o + vec3(dth / 255.0);
}

`;

const LIGHT = LIGHT_SRC.replace('BILLOW_OCTAVES', billowOctaves()).replace('DOME_CELLS', domeCells());

const GROUND_VERT = /* glsl */`
out vec3 vWorld;
void main() {
  vec2 xz = position.xz + uGridOrigin;
  float y = height(xz);
  vWorld = vec3(xz.x, y, xz.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

const GROUND_FRAG = /* glsl */`
in vec3 vWorld;
out vec4 fragColor;
void main() {
  vec3 ro = cameraPosition;
  vec3 P = vWorld;
  vec3 toP = P - ro;
  float dist = length(toP);
  vec3 rd = toP / dist;
  vec2 xz = P.xz;
  float fw = length(fwidth(xz));

#ifdef NORMAL_FD
  float e = max(fw * 0.75, 0.04);
  float h0 = height(xz);
  float hx = height(xz + vec2(e, 0.0));
  float hz = height(xz + vec2(0.0, e));
  vec2 grad = vec2(hx - h0, hz - h0) / e;
#else
  // analytic gradient; the 11 m undulation's slope fades once a pixel spans metres (it would alias)
  vec3 lo = heightLowD(xz);
  vec3 d2 = vnoiseD(xz * DET2F + vec2(-7.9, 2.2));
  float h0 = lo.x + d2.x * DET2A;
  float fade2 = 1.0 - smoothstep(1.5, 5.0, fw);
  vec2 grad = lo.yz + d2.yz * (fade2 * (DET2A * DET2F));
#endif
  vec3 sp = vec3(xz.x, h0, xz.y);

  vec2 W = vec2(WX, WZ);
#ifdef RIPPLES
  // wind ripples: normal only, gone on lee faces and once a pixel is wider than about half a ripple
  float lee = -dot(grad, W);
  float ripOn = (1.0 - smoothstep(RIPLEELO, RIPLEEHI, lee)) * (1.0 - smoothstep(RIPL * 0.15, RIPL * 0.5, fw));
  if (ripOn > 0.0) {
    float ra = dot(xz, W) + vnoise(xz * RIPWARPF) * RIPWARPA + vnoise(xz * (RIPWARPF * 3.1) + vec2(4.0, 4.0)) * (RIPWARPA * 0.4);
    float ph = ra * (6.28318530718 / RIPL);
    float dr = cos(ph) + cos(ph * 2.0 + 0.9) * 0.45;
    float ripAmp = smoothstep(-0.6, 0.7, vnoise(xz * RIPAMPF + vec2(-6.0, 2.0))) * 0.65 + 0.35;
    grad += W * (dr * RIPSLOPE * ripOn * ripAmp);
  }
#endif
  vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
  vec3 V = -rd;

  // glints: one grain in a few catches the sun, near the viewer and at grazing angles
  vec2 gc = floor(xz / GLINTCELL);
  int gx = int(gc.x), gz = int(gc.y);
  float gh = hash2(gx, gz);
  vec3 nm = normalize(n + vec3(hash2(gx + 17, gz) - 0.5, 0.0, hash2(gx, gz + 29) - 0.5) * 1.2);
  float ndv = max(dot(n, V), 0.0);
  float grain = 1.0 - smoothstep(0.12, 0.3, length(xz / GLINTCELL - gc - 0.5));  // a round grain, not the whole cell
  float gAmt = step(1.0 - GLINTDENS, gh) * grain * (1.0 - smoothstep(GLINTCELL * 0.3, GLINTCELL * 1.0, fw)) * (1.0 - ndv) * (1.0 - ndv);

  vec3 alb = uSand * (vnoise(xz * 0.021 + vec2(3.0, 3.0)) * 0.08 + 0.92);

  // cast shadows: the baked map (default), the per-pixel march (reference), or none
  float sh1 = 1.0, sh2 = 1.0;
#ifdef SHADOWS_MAP
  vec2 hz = textureLod(uShMap, shadowUV(xz), 0.0).xy;
  sh1 = softFromHorizon(hz.x, uSun1Dir, 1.0 / tan(max(uSun1Sky.w * SH_PENUMBRA, 0.002)));
  sh2 = softFromHorizon(hz.y, uSun2Dir, 1.0 / tan(max(uSun2Sky.w * SH_PENUMBRA, 0.002)));
#endif
#ifdef SHADOWS_MARCH
  vec3 lp = sp + n * SH_LIFT;
  if (uSun1Col.x + uSun1Col.y + uSun1Col.z > 0.0) sh1 = shadowMarch(lp, uSun1Dir, 1.0 / tan(max(uSun1Sky.w * SH_PENUMBRA, 0.002)));
  if (uSun2Col.x + uSun2Col.y + uSun2Col.z > 0.0) sh2 = shadowMarch(lp, uSun2Dir, 1.0 / tan(max(uSun2Sky.w * SH_PENUMBRA, 0.002)));
#endif

  vec3 col = vec3(0.0);
  col += sunOnSand(n, V, alb, uSun1Dir, uSun1Col, sh1, nm, gAmt, uWrap);
  col += sunOnSand(n, V, alb, uSun2Dir, uSun2Col, sh2, nm, gAmt, uWrap);
  col += alb * mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5) * mix(AOLO, 1.0, smoothstep(0.6, 1.0, n.y));

  // haze: distance plus height fog, the colour of the sky behind it; the grid edge is always fully hazed
  float fog = fogAmount(ro, rd, dist);
  float edge = smoothstep(GRID_RMAX * 0.72, GRID_RMAX * 0.97, length(xz - ro.xz));
  fog = max(fog, edge);
  vec3 fogCol = mix(skyColor(rd, 0.0), uFogCol, uFogColMix * 0.6);
  col = mix(col, fogCol, fog);
  if (uStorm > 0.5) {
    col = mix(col, mix(sandColor(rd), vec3(dot(sandColor(rd), vec3(0.3333))), 0.25) * 1.1, clamp(ribbons(xz, grad, dist, fw), 0.0, 1.0));
    col = mix(col, sandColor(rd), sandHaze(rd, dist, 0.0));
  }

  fragColor = vec4(finish(col), 1.0);
}
`;

const SKY_VERT = /* glsl */`
out vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAG = /* glsl */`
in vec3 vWorld;
out vec4 fragColor;
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  vec3 col = skyColor(rd, 1.0);
  // seen from the eye the layer is 1.7 m down; at the horizon the sky meets far ground seen through
  // the bottom of the layer, so the base eases to 0 there and the two join without a line
  if (uStorm > 0.5) col = mix(col, sandColor(rd), sandHaze(-rd, 1e5, smoothstep(0.0, 0.04, rd.y) * CAM_EYE));
  fragColor = vec4(finish(col), 1.0);
}
`;

const QUAD_VERT = /* glsl */`
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// One texel = one ground point around uShC (log-polar); R and G are the two suns' horizon
// values Hmax from the same march as the reference path (see horizonMarch).
const BAKE_FRAG = /* glsl */`
in vec2 vUv;
out vec4 fragColor;
void main() {
  float ang = vUv.x * 6.28318530718;
  float r = exp(vUv.y * SHM_LNR) * SHM_R0;
  vec2 xz = uShC + vec2(cos(ang), sin(ang)) * r;
  vec3 hd = heightD(xz);
  vec3 n = normalize(vec3(-hd.y, 1.0, -hd.z));
  vec3 p = vec3(xz.x, hd.x, xz.y) + n * SH_LIFT;
  float s1 = -8.0, s2 = -8.0;
  if (uSun1Col.x + uSun1Col.y + uSun1Col.z > 0.0) s1 = horizonMarch(p, uSun1Dir, 1.0 / tan(max(uSun1Sky.w * SH_PENUMBRA, 0.002)));
  if (uSun2Col.x + uSun2Col.y + uSun2Col.z > 0.0) s2 = horizonMarch(p, uSun2Dir, 1.0 / tan(max(uSun2Sky.w * SH_PENUMBRA, 0.002)));
  fragColor = vec4(s1, s2, 0.0, 1.0);
}
`;

// A tiny 8x8 target: each texel writes height and heightLow at one probe point, plus its index,
// so the page can compare the GPU formula to height.js. probeD writes the analytic gradient.
const PROBE_FRAG = /* glsl */`
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 idx = floor(vUv * 8.0);
  vec2 pp = uProbeO + vec2(idx.x * 53.7 - idx.y * 21.1, idx.y * 47.3 + idx.x * 9.9);
  fragColor = vec4(height(pp), heightLow(pp), idx.x, idx.y);
}
`;
const PROBED_FRAG = /* glsl */`
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 idx = floor(vUv * 8.0);
  vec2 pp = uProbeO + vec2(idx.x * 53.7 - idx.y * 21.1, idx.y * 47.3 + idx.x * 9.9);
  fragColor = vec4(heightD(pp), heightLowD(pp).x);
}
`;

export function createGlslMaterials(THREE, values, opts, shadowTex) {
  const head = defines(opts) + '\n' + uniformDecls() + FORMULA;
  const uniforms = {};
  for (const [k, t] of Object.entries(UNIFORM_TYPES)) {
    const v = values[k];
    uniforms[k] = { value: t === 'float' ? v : t === 'vec2' ? new THREE.Vector2(...v) : t === 'vec3' ? new THREE.Vector3(...v) : new THREE.Vector4(...v) };
  }
  uniforms.uGridOrigin = { value: new THREE.Vector2() };
  uniforms.uProbeO = { value: new THREE.Vector2() };
  uniforms.uShC = { value: new THREE.Vector2() };
  uniforms.uShMap = { value: shadowTex };
  uniforms.uViewH = { value: 1 };
  const common = { glslVersion: THREE.GLSL3, uniforms, toneMapped: false };
  const quad = { ...common, vertexShader: head + QUAD_VERT, depthTest: false, depthWrite: false };
  const ground = new THREE.ShaderMaterial({ ...common, vertexShader: head + GROUND_VERT, fragmentShader: head + LIGHT + GROUND_FRAG });
  const sky = new THREE.ShaderMaterial({ ...common, vertexShader: head + SKY_VERT, fragmentShader: head + LIGHT + SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const bake = new THREE.ShaderMaterial({ ...quad, fragmentShader: head + LIGHT + BAKE_FRAG });
  const probe = new THREE.ShaderMaterial({ ...quad, fragmentShader: head + PROBE_FRAG });
  const probeD = new THREE.ShaderMaterial({ ...quad, fragmentShader: head + PROBED_FRAG });
  return {
    ground, sky, bake, probe, probeD,
    set(name, v) { const u = uniforms[name].value; if (typeof u === 'number') uniforms[name].value = v; else u.fromArray(v); },
  };
}
