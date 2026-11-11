// Classic WebGLRenderer path: the Dust Sea ground, sky and probe as GLSL ES 3.00 ShaderMaterials.
// The maths mirrors height.js and tsl-material.js function for function, in the same order:
//   hash2 -> vnoise -> duneProfile -> heightLow -> height              (ground formula)
//   shadowMarch -> sunSky -> starField -> skyColor -> fogAmount
//   -> driftLayer -> drift -> sunOnSand -> aces -> srgbEncode          (light, sky, air, output)
// Every constant comes from params.js through the #define block below.

import { G, SH, SKY, SAND, DRIFT, GRID, DEG, UNIFORM_TYPES } from './params.js';

const f = (x) => { const s = String(x); return /[.eE]/.test(s) ? s : s + '.0'; };

function defines() {
  const W = [Math.cos(G.windDeg * DEG), Math.sin(G.windDeg * DEG)];
  const W2 = [Math.cos(G.dir2Deg * DEG), Math.sin(G.dir2Deg * DEG)];
  const d = {
    WX: W[0], WZ: W[1], W2X: W2[0], W2Z: W2[1],
    WARP1F: G.warp1F, WARP1A: G.warp1A, WARP2F: G.warp2F, WARP2A: G.warp2A,
    SWELLF: G.swellF, SWELLA: G.swellA,
    L1: G.L1, A1: G.A1, AMPBASE: G.ampBase, AMPF: G.ampF, CREST: G.crest,
    L2: G.L2, A2: G.A2, AMP2F: G.amp2F,
    DET1F: G.det1F, DET1A: G.det1A, DET2F: G.det2F, DET2A: G.det2A,
    RIPL: G.ripL, RIPSLOPE: G.ripSlope, RIPAMPF: G.ripAmpF, RIPWARPF: G.ripWarpF, RIPWARPA: G.ripWarpA,
    RIPLEELO: G.ripLeeLo, RIPLEEHI: G.ripLeeHi,
    GLINTCELL: G.glintCell, GLINTDENS: G.glintDensity, GLINTPOW: G.glintPow, GLINTGAIN: G.glintGain,
    SH_START: SH.start, SH_GROW: SH.grow, SH_DSTEP: SH.dStep, SH_MINSTEP: SH.minStep, SH_MAXDIST: SH.maxDist,
    SH_LIFT: SH.lift, SH_CEIL: SH.ceiling,
    SKY_K: SKY.k, GLOWPOW1: SKY.glowPow1, GLOWPOW2: SKY.glowPow2,
    STAR_SCALE: SKY.starScale, STAR_THRESH: SKY.starThresh, STAR_SIZE: SKY.starSize,
    WRAP: SAND.wrap, RETRO: SAND.retro, SHEEN: SAND.sheen, FWD: SAND.fwd, SHEENPOW: SAND.sheenPow,
    AOLO: SAND.aoLo,
    DRIFT_FA: DRIFT.fa, DRIFT_FC: DRIFT.fc, DRIFT_FALL: DRIFT.fall,
    DRIFT_H0: DRIFT.h[0], DRIFT_H1: DRIFT.h[1], DRIFT_H2: DRIFT.h[2], DRIFT_H3: DRIFT.h[3],
    DRIFT_W0: DRIFT.w[0], DRIFT_W1: DRIFT.w[1], DRIFT_W2: DRIFT.w[2], DRIFT_W3: DRIFT.w[3],
    GRID_RMAX: GRID.rMax,
  };
  return Object.entries(d).map(([k, v]) => `#define ${k} ${f(v)}`).join('\n') +
    `\n#define SH_STEPS ${SH.steps}\n`;
}

function uniformDecls() {
  return Object.entries(UNIFORM_TYPES).map(([k, t]) => `uniform ${t} ${k};`).join('\n') +
    '\nuniform vec2 uGridOrigin;\nuniform vec2 uProbeO;\n';
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

float duneProfile(float t) {
  float u = t / CREST;
  float v = (t - CREST) / (1.0 - CREST);
  float up = u * u * (2.0 - u);
  float omv = 1.0 - v;
  float down = omv * omv;
  return t < CREST ? up : down;
}

float heightLow(vec2 p) {
  float x = p.x, z = p.y;
  float a = x * WX + z * WZ;
  float c = -x * WZ + z * WX;
  float wa = vnoise(p * WARP1F) * WARP1A + vnoise(p * WARP2F + vec2(31.7, -11.3)) * WARP2A;
  float wc = vnoise(p * WARP1F + vec2(57.1, 9.2)) * WARP1A;
  float a2 = a + wa, c2 = c + wc;
  float swell = vnoise(p * SWELLF + vec2(3.3, 7.7)) * SWELLA;
  float s = a2 / L1;
  float k = floor(s);
  float t = s - k;
  float amp = ((vnoise(vec2(c2 * AMPF, k * 0.731 + 0.5)) * 0.5 + 0.5) * (1.0 - AMPBASE) + AMPBASE) * A1;
  float h1 = amp * duneProfile(t);
  float s2 = (x * W2X + z * W2Z + wa * 0.5) / L2;
  float k2 = floor(s2);
  float t2 = s2 - k2;
  float amp2 = (vnoise(vec2((-x * W2Z + z * W2X) * AMP2F, k2 * 0.613 + 2.5)) * 0.5 + 0.5) * A2;
  float h2 = amp2 * duneProfile(t2);
  return swell + h1 + h2;
}

float height(vec2 p) {
  return heightLow(p) + vnoise(p * DET1F + vec2(1.3, -4.1)) * DET1A + vnoise(p * DET2F + vec2(-7.9, 2.2)) * DET2A;
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

vec3 sunSky(vec3 rd, vec3 L, vec3 tint, vec4 sky, float withDisc, float gy) {
  float c = dot(rd, L);
  float cp = max(c, 0.0);
  float halo = sky.x * pow(cp, GLOWPOW1) + sky.y * pow(cp, GLOWPOW2);
  float boost = 1.0 - gy * 0.6;
  float disc = smoothstep(cos(sky.w * 1.25), cos(sky.w * 0.8), c) * withDisc * smoothstep(-0.004, 0.004, rd.y);
  return tint * (halo * boost + disc * sky.z);
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

vec3 skyColor(vec3 rd, float withDisc) {
  float y = max(rd.y, 0.0);
  float gy = 1.0 - exp(-y * SKY_K);   // 0 at the horizon, 1 overhead: a bright band low, deep sky above
  vec3 col = mix(uHorizon, uZenith, gy);
  vec2 hd = normalize(rd.xz + vec2(1e-6, 0.0));
  float wall = smoothstep(0.2, 0.95, dot(hd, uWallDir)) * uStorm;
  col = mix(col, uWallCol, wall * (1.0 - gy * 0.7));
  col += sunSky(rd, uSun1Dir, uSun1Tint, uSun1Sky, withDisc, gy);
  col += sunSky(rd, uSun2Dir, uSun2Tint, uSun2Sky, withDisc, gy);
  col += vec3(starField(rd) * uStars * withDisc);
  return col;
}

float fogAmount(vec3 ro, vec3 rd, float dist) {
  float dens = uFog.x * dist;
  float k = uFog.z;
  float ry = max(rd.y * k * dist, -20.0);
  float fr = abs(ry) < 1e-4 ? 1.0 - ry * 0.5 : (1.0 - exp(-ry)) / ry;
  dens += uFog.y * exp(-(ro.y - uFog.w) * k) * dist * fr;
  return 1.0 - exp(-dens);
}

float driftLayer(vec3 ro, vec3 rd, float dist, float hk, float seed) {
  float rdy = rd.y >= 0.0 ? max(rd.y, 1e-4) : min(rd.y, -1e-4);
  float t = (uGroundY + hk - ro.y) / rdy;
  // a sheet fades out over its last 4 m before the ray meets the sand, so its edge never draws a line
  float ok = step(0.0, t) * smoothstep(0.0, 4.0, dist - t);
  float tc = clamp(t, 0.0, 400.0);
  vec2 p = ro.xz + rd.xz * tc;
  vec2 q = vec2(dot(p, uDriftDir) * DRIFT_FA, dot(p, vec2(-uDriftDir.y, uDriftDir.x)) * DRIFT_FC) + vec2(seed * 17.3, seed * 5.1);
  float n = vnoise(q) * 0.65 + vnoise(q * vec2(2.3, 1.7) + vec2(9.1, 9.1)) * 0.35;
  return ok * smoothstep(0.3, 0.8, n) * exp(-tc / DRIFT_FALL);
}

float drift(vec3 ro, vec3 rd, float dist) {
  float acc = driftLayer(ro, rd, dist, DRIFT_H0, 0.0) * DRIFT_W0
            + driftLayer(ro, rd, dist, DRIFT_H1, 1.0) * DRIFT_W1
            + driftLayer(ro, rd, dist, DRIFT_H2, 2.0) * DRIFT_W2
            + driftLayer(ro, rd, dist, DRIFT_H3, 3.0) * DRIFT_W3;
  return acc * uDrift;
}

vec3 sunOnSand(vec3 p, vec3 n, vec3 V, vec3 alb, vec3 L, vec3 C, float kPen, vec3 nm, float gAmt) {
  float sh = 0.0;
  if (C.r + C.g + C.b > 0.0) sh = shadowMarch(p + n * SH_LIFT, L, kPen);
  float ndl = dot(n, L);
  float wrapd = max((ndl + WRAP) / (1.0 + WRAP), 0.0);
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
  float dth = hash2(int(gl_FragCoord.x), int(gl_FragCoord.y)) - 0.5;
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

  // surface normal from the height formula's own differences; the step widens with the pixel
  float e = max(0.04, fw * 0.75);
  float h0 = height(xz);
  float hx = height(xz + vec2(e, 0.0));
  float hz = height(xz + vec2(0.0, e));
  vec2 grad = vec2(hx - h0, hz - h0) / e;
  vec3 sp = vec3(xz.x, h0, xz.y);

  // wind ripples: normal only, gone on lee faces and once a pixel is wider than about half a ripple
  vec2 W = vec2(WX, WZ);
  float lee = -dot(grad, W);
  float ripOn = (1.0 - smoothstep(RIPLEELO, RIPLEEHI, lee)) * (1.0 - smoothstep(RIPL * 0.15, RIPL * 0.5, fw));
  float ra = dot(xz, W) + vnoise(xz * RIPWARPF) * RIPWARPA + vnoise(xz * (RIPWARPF * 3.1) + vec2(4.0, 4.0)) * (RIPWARPA * 0.4);
  float ph = ra * (6.28318530718 / RIPL);
  float dr = cos(ph) + cos(ph * 2.0 + 0.9) * 0.45;
  float ripAmp = 0.35 + 0.65 * smoothstep(-0.6, 0.7, vnoise(xz * RIPAMPF + vec2(-6.0, 2.0)));
  grad += W * (dr * RIPSLOPE * ripOn * ripAmp);
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

  vec3 alb = uSand * (0.92 + vnoise(xz * 0.021 + vec2(3.0, 3.0)) * 0.08);

  vec3 col = vec3(0.0);
  col += sunOnSand(sp, n, V, alb, uSun1Dir, uSun1Col, 1.0 / tan(max(uSun1Sky.w, 0.002)), nm, gAmt);
  col += sunOnSand(sp, n, V, alb, uSun2Dir, uSun2Col, 1.0 / tan(max(uSun2Sky.w, 0.002)), nm, gAmt);
  col += alb * mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5) * mix(AOLO, 1.0, smoothstep(0.6, 1.0, n.y));

  // haze: distance plus height fog, the colour of the sky behind it; the grid edge is always fully hazed
  float fog = fogAmount(ro, rd, dist);
  float edge = smoothstep(GRID_RMAX * 0.72, GRID_RMAX * 0.97, length(xz - ro.xz));
  fog = max(fog, edge);
  col = mix(col, skyColor(rd, 0.0), fog);
  col = mix(col, uDustCol, clamp(drift(ro, rd, dist), 0.0, 0.6));

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
  col = mix(col, uDustCol, clamp(drift(ro, rd, 1e5), 0.0, 0.6));
  fragColor = vec4(finish(col), 1.0);
}
`;

// A tiny 8x8 target: each texel writes height and heightLow at one probe point, plus its index,
// so the page can compare the GPU formula to height.js.
const PROBE_VERT = /* glsl */`
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const PROBE_FRAG = /* glsl */`
in vec2 vUv;
out vec4 fragColor;
void main() {
  vec2 idx = floor(vUv * 8.0);
  vec2 pp = uProbeO + vec2(idx.x * 53.7 - idx.y * 21.1, idx.y * 47.3 + idx.x * 9.9);
  fragColor = vec4(height(pp), heightLow(pp), idx.x, idx.y);
}
`;

export function createGlslMaterials(THREE, values) {
  const head = defines() + '\n' + uniformDecls() + FORMULA;
  const uniforms = {};
  for (const [k, t] of Object.entries(UNIFORM_TYPES)) {
    const v = values[k];
    uniforms[k] = { value: t === 'float' ? v : t === 'vec2' ? new THREE.Vector2(...v) : t === 'vec3' ? new THREE.Vector3(...v) : new THREE.Vector4(...v) };
  }
  uniforms.uGridOrigin = { value: new THREE.Vector2() };
  uniforms.uProbeO = { value: new THREE.Vector2() };
  const common = { glslVersion: THREE.GLSL3, uniforms, toneMapped: false };
  const ground = new THREE.ShaderMaterial({ ...common, vertexShader: head + GROUND_VERT, fragmentShader: head + LIGHT + GROUND_FRAG });
  const sky = new THREE.ShaderMaterial({ ...common, vertexShader: head + SKY_VERT, fragmentShader: head + LIGHT + SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const probe = new THREE.ShaderMaterial({ ...common, vertexShader: head + PROBE_VERT, fragmentShader: head + PROBE_FRAG, depthTest: false, depthWrite: false });
  return {
    ground, sky, probe,
    set(name, v) { const u = uniforms[name].value; if (typeof u === 'number') uniforms[name].value = v; else u.fromArray(v); },
  };
}
