// Classic WebGLRenderer path: the Dust Sea ground, sky, shadow-map bake and probes as GLSL ES 3.00
// ShaderMaterials. The maths mirrors height.js and tsl-material.js function for function, in order:
//   hash2 -> vnoise -> vnoiseD -> duneProfile -> duneProfileD -> heightLow -> heightLowD
//   -> height -> heightD                                                (ground formula)
//   shadowMarch -> horizonMarch -> sunSky -> starField -> haboob -> skyColor -> fogAmount
//   -> sandDensity -> blowingSand -> sunOnSand -> aces -> srgbEncode   (light, sky, air, output)
// Every constant comes from params.js through the #define block below. The debug switches
// (opts: shadows, normal, ripples) become #defines too; see tsl-material.js for their meaning.

import { G, SH, SHMAP, SKY, SAND, STORM, GRID, DEG, UNIFORM_TYPES } from './params.js';

const f = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };

function defines(opts) {
  const W = [Math.cos(G.windDeg * DEG), Math.sin(G.windDeg * DEG)];
  const W2 = [Math.cos(G.dir2Deg * DEG), Math.sin(G.dir2Deg * DEG)];
  const d = {
    WX: W[0], WZ: W[1], W2X: W2[0], W2Z: W2[1],
    WARP1F: G.warp1F, WARP1A: G.warp1A, WARP2F: G.warp2F, WARP2A: G.warp2A, WARP3F: G.warp3F, WARP3A: G.warp3A,
    SWELLF: G.swellF, SWELLA: G.swellA,
    L1: G.L1, A1: G.A1, AMPBASE: G.ampBase, AMPF: G.ampF, CREST: G.crest,
    ROUNDLO: G.roundLo, ROUNDHI: G.roundHi, ROUNDF: G.roundF,
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
    TOPF0: STORM.topF[0], TOPF1: STORM.topF[1], TOPF2: STORM.topF[2],
    TOPA0: STORM.topA[0], TOPA1: STORM.topA[1], TOPA2: STORM.topA[2],
    LOBEF: STORM.lobeF, EDGESOFT: STORM.edgeSoft, ENDSOFT: STORM.endSoft, BUMP: STORM.bump,
    SAND_NEAR: STORM.sandNear, SAND_FAR: STORM.sandFar, SAND_H: STORM.sandH, SAND_TAU: STORM.sandTau,
    SPILL: STORM.spill, SPILLDROP: STORM.spillDrop, ALONGF: STORM.alongF, ACROSSF: STORM.acrossF,
    SNAKEF: STORM.snakeF, SNAKEA: STORM.snakeA, SHEETF: STORM.sheetF, SAND_STEPSF: STORM.sandSteps,
    GRID_RMAX: GRID.rMax,
  };
  return Object.entries(d).map(([k, v]) => `#define ${k} ${f(v)}`).join('\n') +
    `\n#define SH_STEPS ${SH.steps}\n#define SAND_STEPS ${STORM.sandSteps}\n` +
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

float heightLow(vec2 p) {
  float x = p.x, z = p.y;
  float a = x * WX + z * WZ;
  float c = -x * WZ + z * WX;
  float wa = vnoise(p * WARP1F) * WARP1A + vnoise(p * WARP2F + vec2(31.7, -11.3)) * WARP2A;
  float wc = vnoise(p * WARP1F + vec2(57.1, 9.2)) * WARP1A;
  float w3 = vnoise(p * WARP3F + vec2(-19.4, 23.9)) * WARP3A;
  float a2 = a + wa + w3, c2 = c + wc;
  float swell = vnoise(p * SWELLF + vec2(3.3, 7.7)) * SWELLA;
  float s = a2 / L1;
  float k = floor(s);
  float t = s - k;
  float amp = ((vnoise(vec2(c2 * AMPF, k * 0.731 + 0.5)) * 0.5 + 0.5) * (1.0 - AMPBASE) + AMPBASE) * A1;
  float kk = (vnoise(vec2(c2 * ROUNDF, k * 0.917 + 1.7)) * 0.5 + 0.5) * (ROUNDHI - ROUNDLO) + ROUNDLO;
  float h1 = amp * duneProfile(t, kk);
  float s2 = (x * W2X + z * W2Z + wa * 0.5) / L2;
  float k2 = floor(s2);
  float t2 = s2 - k2;
  float amp2 = (vnoise(vec2((-x * W2Z + z * W2X) * AMP2F, k2 * 0.613 + 2.5)) * 0.5 + 0.5) * A2;
  float h2 = amp2 * duneProfile(t2, ROUND2);
  return swell + h1 + h2;
}

vec3 heightLowD(vec2 p) {
  float x = p.x, z = p.y;
  float a = x * WX + z * WZ;
  float c = -x * WZ + z * WX;
  vec3 nA = vnoiseD(p * WARP1F);
  vec3 nB = vnoiseD(p * WARP2F + vec2(31.7, -11.3));
  float wa = nA.x * WARP1A + nB.x * WARP2A;
  vec2 gwa = nA.yz * (WARP1A * WARP1F) + nB.yz * (WARP2A * WARP2F);
  vec3 nC = vnoiseD(p * WARP1F + vec2(57.1, 9.2));
  vec3 n3 = vnoiseD(p * WARP3F + vec2(-19.4, 23.9));
  float a2 = a + wa + n3.x * WARP3A;
  float c2 = c + nC.x * WARP1A;
  vec2 ga2 = vec2(WX, WZ) + gwa + n3.yz * (WARP3A * WARP3F);
  vec2 gc2 = vec2(-WZ, WX) + nC.yz * (WARP1A * WARP1F);
  vec3 nS = vnoiseD(p * SWELLF + vec2(3.3, 7.7));
  float s = a2 / L1;
  float k = floor(s);
  float t = s - k;
  vec3 nAmp = vnoiseD(vec2(c2 * AMPF, k * 0.731 + 0.5));
  float amp = ((nAmp.x * 0.5 + 0.5) * (1.0 - AMPBASE) + AMPBASE) * A1;
  vec2 gamp = gc2 * (nAmp.y * (A1 * (1.0 - AMPBASE) * 0.5 * AMPF));
  vec3 nK = vnoiseD(vec2(c2 * ROUNDF, k * 0.917 + 1.7));
  float kk = (nK.x * 0.5 + 0.5) * (ROUNDHI - ROUNDLO) + ROUNDLO;
  vec2 gkk = gc2 * (nK.y * ((ROUNDHI - ROUNDLO) * 0.5 * ROUNDF));
  vec3 pr = duneProfileD(t, kk);
  float h1 = amp * pr.x;
  vec2 gh1 = gamp * pr.x + (ga2 * (pr.y / L1) + gkk * pr.z) * amp;
  float s2 = (x * W2X + z * W2Z + wa * 0.5) / L2;
  float k2 = floor(s2);
  float t2 = s2 - k2;
  vec3 nA2 = vnoiseD(vec2((-x * W2Z + z * W2X) * AMP2F, k2 * 0.613 + 2.5));
  float amp2 = (nA2.x * 0.5 + 0.5) * A2;
  vec3 pr2 = duneProfileD(t2, ROUND2);
  float h2 = amp2 * pr2.x;
  vec2 gh2 = vec2(-W2Z, W2X) * (nA2.y * (A2 * 0.5 * AMP2F) * pr2.x) + (vec2(W2X, W2Z) + gwa * 0.5) * (pr2.y * amp2 / L2);
  return vec3(nS.x * SWELLA + h1 + h2, nS.yz * (SWELLA * SWELLF) + gh1 + gh2);
}

float height(vec2 p) {
  return heightLow(p) + vnoise(p * DET1F + vec2(1.3, -4.1)) * DET1A + vnoise(p * DET2F + vec2(-7.9, 2.2)) * DET2A;
}

vec3 heightD(vec2 p) {
  vec3 lo = heightLowD(p);
  vec3 d1 = vnoiseD(p * DET1F + vec2(1.3, -4.1));
  vec3 d2 = vnoiseD(p * DET2F + vec2(-7.9, 2.2));
  return vec3(lo.x + d1.x * DET1A + d2.x * DET2A, lo.yz + d1.yz * (DET1A * DET1F) + d2.yz * (DET2A * DET2F));
}
`;

// ------------------------------------------------------------------ light, sky, air, output
const LIGHT = /* glsl */`
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

float relAz(vec3 rd) {
  vec2 hd = normalize(rd.xz + vec2(1e-6, 0.0));
  return atan(dot(hd, uWallRight), dot(hd, uWallFwd));
}

// billows: smooth domes on domes, 0..1 (lit as a bumpy surface facing the viewer)
// each octave is rotated (and scaled) against the last so the value-noise lattice never lines up
float billow(vec2 w) {
  vec2 w2 = vec2(w.x * 1.7 - w.y * 1.2, w.x * 1.2 + w.y * 1.7) + vec2(5.2, 1.3);
  vec2 w3 = vec2(w2.x * 1.7 - w2.y * 1.2, w2.x * 1.2 + w2.y * 1.7) + vec2(1.7, 8.9);
  return (vnoise(w) * 0.55 + vnoise(w2) * 0.3 + vnoise(w3) * 0.15) * 0.5 + 0.5;
}

vec3 wallLit(vec3 rd, vec3 L, vec3 C, vec3 N, vec2 tng, vec2 hd, float vert, float occ, float rimBand) {
  vec3 Lw = normalize(vec3(dot(L.xz, tng), max(L.y, 0.0) + 0.45, -dot(L.xz, hd)));
  float face = clamp(dot(N, Lw) * 0.6 + 0.4, 0.0, 1.0);
  float behind = max(dot(L.xz, hd), 0.0);
  float rim = rimBand * behind * pow(max(dot(rd, L), 0.0), 6.0) * 2.2;
  return C * (face * vert * vert * occ + rim);
}

// The haboob: a sheet of dust at distance D, in metres on the sheet (X along, Y up).
vec4 haboob(vec3 rd) {
  vec2 hd = normalize(rd.xz + vec2(1e-6, 0.0));
  float phi = atan(dot(hd, uWallRight), dot(hd, uWallFwd));
  float q = rd.y / max(length(rd.xz), 1e-3);
  float D = uWallGeo.z, H0 = uWallGeo.w;
  float X = phi * D, Y = q * D;
  float along = clamp((phi - uWallGeo.x) / uWallGeo.y, 0.0, 1.0);
  float taper = pow(along, 1.4);
  float top = H0 * taper * (1.0
    + vnoise(vec2(X * TOPF0, 3.1)) * TOPA0
    + (abs(vnoise(vec2(X * TOPF1, 7.3))) * 2.0 - 1.0) * TOPA1
    + (abs(vnoise(vec2(X * TOPF2, 1.9))) * 2.0 - 1.0) * TOPA2);
  float wisp = vnoise(vec2(X, Y) / 38.0 + vec2(2.0, 6.0)) * (EDGESOFT * 1.6);
  float edge = top - Y + wisp;
  // the far (left) end is thin: the front recedes into haze there
  float a = smoothstep(-EDGESOFT, EDGESOFT, edge) * smoothstep(0.0, ENDSOFT, along);
  // lobes, lit from the side each sun is on and from above; creases between lobes stay dark
  vec2 w = vec2(X, Y - X * 0.1) * LOBEF;
  float B = billow(w);
  float Bx = billow(w + vec2(0.12, 0.0));
  float By = billow(w + vec2(0.0, 0.12));
  vec3 N = normalize(vec3((B - Bx) * BUMP, (B - By) * BUMP, 1.0));
  vec2 tng = vec2(-hd.y, hd.x);
  float yn = clamp(Y / max(top, 1.0), -1.0, 1.2);
  float vert = smoothstep(-0.2, 1.0, yn);
  float occ = mix(0.45, 1.0, B);
  float rimBand = exp(-max(edge, 0.0) / (EDGESOFT * 2.2));
  vec3 col = uWallBase * mix(0.6, 1.6, vert) * (B * 0.6 + 0.7)
    + wallLit(rd, uSun1Dir, uWallSun1, N, tng, hd, vert, occ, rimBand)
    + wallLit(rd, uSun2Dir, uWallSun2, N, tng, hd, vert, occ, rimBand);
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
  float wallSide = smoothstep(uWallGeo.x, uWallGeo.x + uWallGeo.y * 0.8, relAz(rd)) * uStorm;
  float dens = mix(uFog.x, uStormFog.y, wallSide) * dist;
  float k = uFog.z;
  float ry = max(rd.y * k * dist, -20.0);
  float fr = abs(ry) < 1e-4 ? 1.0 - ry * 0.5 : (1.0 - exp(-ry)) / ry;
  dens += uFog.y * exp(-(ro.y - uFog.w) * k) * dist * fr;
  return max(1.0 - exp(-dens), wallSide * smoothstep(uStormFog.z, uStormFog.w, dist));
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
// With the shadow map on, the ground height and the spill height come from its B and A channels
// (baked once with the shadows); otherwise from the formula, two evaluations per sample.
float sandDensity(vec3 q) {
  vec2 sw = uStormWind;
  float a = dot(q.xz, sw), c = dot(q.xz, vec2(-sw.y, sw.x));
#ifdef SHADOWS_MAP
  vec4 m = textureLod(uShMap, shadowUV(q.xz), 0.0);
  float hg = m.z, href = m.w;
#else
  float hg = height(q.xz);
  float href = max(hg, height(q.xz - sw * SPILL) - SPILL * SPILLDROP);
#endif
  float above = q.y - href;
  float cs = c + vnoise(vec2(a * SNAKEF, c * 0.02 + 4.0)) * SNAKEA;
  float streak = smoothstep(0.2, 0.65, vnoise(vec2(a * ALONGF, cs * ACROSSF)));
  // broad sheets come and go but never vanish, so there is always some sand moving
  float sheet = smoothstep(-0.8, 0.5, vnoise(vec2(a, c) * SHEETF + vec2(2.0, 9.0))) * 0.7 + 0.3;
  float hs = (sheet * 0.8 + 0.6) * SAND_H;
  return step(-0.05, q.y - hg) * exp(-max(above, 0.0) / hs) * sheet * (streak * 0.94 + 0.06);
}

float blowingSand(vec3 ro, vec3 rd, float tEnd) {
  float tau = 0.0;
  float t1 = clamp(tEnd, SAND_NEAR * 1.01, SAND_FAR);
  float lr = log(t1 / SAND_NEAR);
  float j = hash2(PIX.x + 7, PIX.y + 3);
  for (int i = 0; i < SAND_STEPS; i++) {
    float f = (float(i) + j) / SAND_STEPSF;
    float t = exp(lr * f) * SAND_NEAR;
    float dt = t * lr / SAND_STEPSF;
    tau += sandDensity(ro + rd * t) * SAND_TAU * dt * step(t, t1);
  }
  return 1.0 - exp(-tau);
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
  vec3 d1 = vnoiseD(xz * DET1F + vec2(1.3, -4.1));
  vec3 d2 = vnoiseD(xz * DET2F + vec2(-7.9, 2.2));
  float h0 = lo.x + d1.x * DET1A + d2.x * DET2A;
  float fade2 = 1.0 - smoothstep(1.5, 5.0, fw);
  vec2 grad = lo.yz + d1.yz * (DET1A * DET1F) + d2.yz * (fade2 * (DET2A * DET2F));
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
  if (uStorm > 0.5) col = mix(col, sandColor(rd), blowingSand(ro, rd, dist));

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
  if (uStorm > 0.5) col = mix(col, sandColor(rd), blowingSand(ro, rd, 1e5));
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
  // B: the ground height; A: the height blowing sand rides at (a crest's height carried a few
  // metres downwind of it). Only the storm uses them, and only a storm target has B and A.
  float href = hd.x;
  if (uStorm > 0.5) href = max(hd.x, height(xz - uStormWind * SPILL) - SPILL * SPILLDROP);
  if (uSun1Col.x + uSun1Col.y + uSun1Col.z > 0.0) s1 = horizonMarch(p, uSun1Dir, 1.0 / tan(max(uSun1Sky.w * SH_PENUMBRA, 0.002)));
  if (uSun2Col.x + uSun2Col.y + uSun2Col.z > 0.0) s2 = horizonMarch(p, uSun2Dir, 1.0 / tan(max(uSun2Sky.w * SH_PENUMBRA, 0.002)));
  fragColor = vec4(s1, s2, hd.x, href);
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
