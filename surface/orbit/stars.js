// Orbit look test: the sky behind everything. A dome (dark gradient warmed toward the pale sun,
// a faint dust band, both suns as discs with exponential halos) and one instanced point pass of
// seeded stars. Both follow the camera, so they read as infinitely far.
// The dome's three noise fields never change, so they are baked once, on the first frame the dome
// is drawn (behind the arrival veil), into an equirectangular texture and sampled from there (or,
// where bakes are off, worked out per pixel); the band, lanes, knots and nebula are then shaped from
// those samples per pixel exactly as before, and the suns' discs and halos stay analytic.
import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, positionLocal, normalize, dot, exp, acos, clamp, smoothstep, mix, pow, max, abs,
  mx_fractal_noise_float, instancedBufferAttribute, uv, length, vec2, vec4, sin, cos, atan, asin, rtt,
} from 'three/tsl';
import { SUN1, SUN2, rng, norm, cross, DEG } from './light.js';

export const SKY_R = 150000;
export const STAR_R = 140000;
// the dust band lies on this great circle (its normal)
const BAND_N = norm([0.25, 0.86, 0.44]);

const v3 = (a) => vec3(a[0], a[1], a[2]);

// halo: two exponentials in angle from the sun (no shoulder, so no glow ends in an edge); a disc
function sunTerm(rd, S) {
  const c = dot(rd, v3(S.dir));
  const ang = acos(clamp(c, -1.0, 1.0));
  const halo = float(S.halo[0]).mul(exp(ang.negate().div(S.halo[2]))).add(float(S.halo[1]).mul(exp(ang.negate().div(S.halo[3]))));
  const disc = smoothstep(Math.cos(S.radiusDeg * DEG * 1.15), Math.cos(S.radiusDeg * DEG * 0.85), c);
  return v3(S.col).mul(halo).add(v3(S.disc).mul(disc));
}

// the dome's three noise fields at a direction: the band's width and knots, its lanes, the nebula
function skyNoise(rd) {
  const n1 = mx_fractal_noise_float(rd.mul(3.2), 5, 2.1, 0.55, 1.0);
  const n2 = mx_fractal_noise_float(rd.mul(9.0).add(vec3(4.1, 1.7, 8.3)), 4, 2.0, 0.5, 1.0);
  const nb = mx_fractal_noise_float(rd.mul(1.6).add(vec3(9.0, 2.0, 5.0)), 4, 2.0, 0.5, 1.0);
  return [n1, n2, nb];
}

function skyShade(rd, n1, n2, nb) {
  // base: cool deep blue-violet, warmed toward the pale sun and faintly toward the red one
  const toward1 = dot(rd, v3(SUN1.dir)).mul(0.5).add(0.5);
  const toward2 = dot(rd, v3(SUN2.dir)).mul(0.5).add(0.5);
  const col = mix(vec3(0.0010, 0.0014, 0.0034), vec3(0.008, 0.0045, 0.0022), pow(toward1, 4.0)).toVar();
  col.addAssign(vec3(0.006, 0.0012, 0.0004).mul(pow(toward2, 8.0)));
  // the dust band: a soft great-circle glow with darker lanes and brighter knots through it
  const bd = dot(rd, v3(BAND_N));
  const w = float(0.16).add(n1.mul(0.06));
  const band = exp(bd.add(n1.mul(0.05)).div(w).pow(2.0).negate());
  const core = exp(bd.add(n2.mul(0.02)).div(0.045).pow(2.0).negate());
  const lanes = smoothstep(0.05, 0.35, abs(n2.add(bd.mul(3.0)))).mul(0.65).add(0.35);
  const knots = max(n1.add(0.25), 0.0).mul(1.4).add(0.3);
  col.addAssign(vec3(0.016, 0.010, 0.0062).mul(band).mul(knots).mul(lanes));
  col.addAssign(vec3(0.012, 0.0095, 0.008).mul(core).mul(lanes));
  // a cool reflection nebula, very faint, off the band
  const neb = max(nb, 0.0);
  col.addAssign(vec3(0.003, 0.005, 0.010).mul(neb.mul(neb)));
  col.addAssign(sunTerm(rd, SUN1));
  col.addAssign(sunTerm(rd, SUN2));
  return col;
}

// the sky computed outright (every noise octave per call)
export function skyColor(rd) {
  return skyShade(rd, ...skyNoise(rd));
}

// ---- the bakes. The sky's noise and the hull's soot and grime never change, so they are rendered
// once into textures and read back with lookups. How they are stored is chosen once per renderer,
// from its real limits, on the first build of a material that uses them:
//   '8bit'  8-bit targets, each value packed as v * k + 0.5 (the default: 11.6 MB in all, and
//           against half floats no pixel of the stills or of the flown close-ups moves more than 1/255)
//   'half'  half-float targets, 23.2 MB (only with ?bakes=half, and only where the renderer can draw
//           into them: on WebGL2 that needs EXT_color_buffer_float or EXT_color_buffer_half_float and a
//           probe target that comes out complete; WebGPU always can). Otherwise it falls to 8-bit.
//   'off'   no textures: the noise worked out per pixel, as before the bakes (?bakes=off, or a
//           renderer whose texture limit is under 2048)
// Every bake is 2048 or under per side, WebGL2's guaranteed minimum.
export const BAKE_MAX = 2048;
const BAKES_Q = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('bakes');
const modes = new WeakMap();
// what was chosen, and what the bakes hold (for the test pages)
export const bakeReport = { mode: null, reason: '', maxTexture: 0, textures: [], bytes: 0 };
export const bakeTargets = new Map();   // name -> render target, for reading a bake back in tests

function textureLimit(renderer) {
  const be = renderer.backend;
  if (be && be.isWebGLBackend) return be.gl.getParameter(be.gl.MAX_TEXTURE_SIZE);
  return be?.device?.limits?.maxTextureDimension2D ?? 8192;
}

function halfRenderable(renderer) {
  const be = renderer.backend;
  if (!be || !be.isWebGLBackend) return { ok: true, why: 'WebGPU draws into half floats' };
  const gl = be.gl, ext = be.extensions;
  if (!ext.has('EXT_color_buffer_float') && !ext.has('EXT_color_buffer_half_float')) return { ok: false, why: 'no float colour buffer extension' };
  // the extension is not the whole story on every driver: make a tiny target of each kind and ask
  const fbWas = gl.getParameter(gl.FRAMEBUFFER_BINDING), texWas = gl.getParameter(gl.TEXTURE_BINDING_2D);
  const fb = gl.createFramebuffer(), tex = [];
  let ok = true;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  for (const f of [gl.RGBA16F, gl.R16F]) {
    const t = gl.createTexture(); tex.push(t);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, f, 4, 4);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) ok = false;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbWas);
  gl.bindTexture(gl.TEXTURE_2D, texWas);
  gl.deleteFramebuffer(fb);
  tex.forEach((t) => gl.deleteTexture(t));
  return { ok, why: ok ? 'half-float targets complete' : 'half-float target incomplete' };
}

export function bakeMode(renderer) {
  if (modes.has(renderer)) return modes.get(renderer);
  const max = textureLimit(renderer);
  let mode = '8bit', why = 'default';
  if (max < BAKE_MAX) { mode = 'off'; why = 'texture limit ' + max; }
  else if (BAKES_Q === 'off' || BAKES_Q === '8bit') { mode = BAKES_Q; why = '?bakes=' + BAKES_Q; }
  else if (BAKES_Q === 'half') { const h = halfRenderable(renderer); mode = h.ok ? 'half' : '8bit'; why = '?bakes=half: ' + h.why; }
  modes.set(renderer, mode);
  Object.assign(bakeReport, { mode, reason: why, maxTexture: max });
  if (mode === 'off') { bakeReport.textures = []; bakeReport.bytes = 0; }
  return mode;
}

// a baked field: `fn` gives the vec4 values at the target's uv. In 8-bit a value v is stored as
// v * k + 0.5 (k per field, from the measured range of its noise) and unpacked by read(), which
// takes a sampled value (or a blend of them).
export function bakeField(name, mode, fn, w, h, { red = false, k = 0.4 } = {}) {
  if (w > BAKE_MAX || h > BAKE_MAX) throw new Error(`bake ${name} ${w}x${h} is over ${BAKE_MAX}`);
  const half = mode === 'half';
  const node = rtt(half ? fn : Fn(() => fn.mul(k).add(0.5))(), w, h, {
    type: half ? THREE.HalfFloatType : THREE.UnsignedByteType,
    format: red ? THREE.RedFormat : THREE.RGBAFormat, autoUpdate: false, depthBuffer: false, generateMipmaps: false,
  });
  node.renderTarget.texture.name = name;
  bakeTargets.set(name, node.renderTarget);
  const bytes = w * h * (red ? 1 : 4) * (half ? 2 : 1);
  bakeReport.textures = bakeReport.textures.filter((t) => t.name !== name).concat([{ name, w, h, format: (red ? 'R' : 'RGBA') + (half ? '16F' : '8'), bytes }]);
  bakeReport.bytes = bakeReport.textures.reduce((a, t) => a + t.bytes, 0);
  return { node, read: half ? (n) => n : (n) => n.sub(0.5).div(k) };
}

// the sky's baked noise: longitude across, latitude up. At 2048 x 1024 the finest octave spans about
// 4.5 texels at the equator, and the shaped sky differs from the outright one by at most 2/255 in any
// pixel of the stills (1024 x 512 reached 5/255). The three noises span -1.16..1.12, so k = 0.4.
const SKY_W = 2048, SKY_H = 1024;
const SKY_K = 0.4;
function bakedSkyNoise(mode) {
  const bake = Fn(() => {
    const q = uv();
    const lon = q.x.sub(0.5).mul(Math.PI * 2), lat = q.y.sub(0.5).mul(Math.PI);
    const cl = cos(lat);
    const [n1, n2, nb] = skyNoise(vec3(cl.mul(cos(lon)), sin(lat), cl.mul(sin(lon))));
    return vec4(n1, n2, nb, 1.0);
  })();
  const f = bakeField('sky', mode, bake, SKY_W, SKY_H, { k: SKY_K });
  f.node.renderTarget.texture.wrapS = THREE.RepeatWrapping;   // longitude wraps without a seam
  return f;
}

export function createSky() {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  const fields = {};
  mat.colorNode = Fn((builder) => {
    const mode = bakeMode(builder.renderer);
    const rd = normalize(positionLocal);
    if (mode === 'off') return skyColor(rd);
    const f = fields[mode] ??= bakedSkyNoise(mode);
    f.node.uvNode = vec2(atan(rd.z, rd.x).div(Math.PI * 2).add(0.5), asin(clamp(rd.y, -1.0, 1.0)).div(Math.PI).add(0.5));
    const s = f.read(f.node);
    return skyShade(rd, s.x, s.y, s.z);
  })();
  mat.fog = false;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 96, 48), mat);
  mesh.renderOrder = -2;
  mesh.frustumCulled = false;
  return mesh;
}

// N stars, seeded: more of them near the dust band, a power-law of brightness, slight colour
export function createStars(n = 14000, seed = 7177, sizeScale = 1) {
  const R = rng(seed);
  const dirs = new Float32Array(n * 3), cols = new Float32Array(n * 3), sizes = new Float32Array(n);
  const u = norm(cross(BAND_N, [1, 0, 0])), w = cross(BAND_N, u);
  const palette = [[0.70, 0.80, 1.0], [0.92, 0.94, 1.0], [1.0, 0.95, 0.86], [1.0, 0.84, 0.62], [1.0, 0.66, 0.46]];
  for (let i = 0; i < n; i++) {
    let d;
    if (R() < 0.45) {
      // in the band: a point on the great circle, scattered off it by a Gaussian
      const a = R() * Math.PI * 2;
      const g = (R() + R() + R() - 1.5) * 0.16;
      d = norm([u[0] * Math.cos(a) + w[0] * Math.sin(a) + BAND_N[0] * g, u[1] * Math.cos(a) + w[1] * Math.sin(a) + BAND_N[1] * g, u[2] * Math.cos(a) + w[2] * Math.sin(a) + BAND_N[2] * g]);
    } else {
      const z = R() * 2 - 1, a = R() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      d = [r * Math.cos(a), z, r * Math.sin(a)];
    }
    dirs.set(d.map((x) => x * STAR_R), i * 3);
    const m = Math.pow(R(), 5.0);                 // most stars faint, a few bright
    const c = palette[Math.floor(R() * palette.length)];
    const b = 0.05 + m * 2.6;
    cols.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    sizes[i] = (1.4 + m * 2.8) * sizeScale;
  }
  const mat = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending });
  mat.positionNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(dirs, 3));
  const col = instancedBufferAttribute(new THREE.InstancedBufferAttribute(cols, 3));
  const d = length(uv().sub(0.5)).mul(2.0);
  mat.colorNode = col.mul(exp(d.mul(d).mul(-4.0)));
  mat.opacityNode = float(1.0);
  mat.sizeNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(sizes, 1));
  mat.fog = false;
  const sprite = new THREE.Sprite(mat);
  sprite.count = n;
  sprite.frustumCulled = false;
  sprite.renderOrder = -1;
  return sprite;
}
