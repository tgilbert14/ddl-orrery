// Orbit look test: the sky behind everything. A dome (dark gradient warmed toward the pale sun,
// a faint dust band, both suns as discs with exponential halos) and one instanced point pass of
// seeded stars. Both follow the camera, so they read as infinitely far.
// The dome's three noise fields never change, so they are baked once, on the first frame the dome
// is drawn (behind the arrival veil), into an equirectangular half-float texture and sampled from
// there; the band, lanes, knots and nebula are then shaped from those samples per pixel exactly as
// before, and the suns' discs and halos stay analytic.
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

// the baked noise: longitude across, latitude up, half float (16 MB). At 2048 x 1024 the finest
// octave spans about 4.5 texels at the equator, and the shaped sky differs from the outright one
// by at most 2/255 in any pixel of the stills (1024 x 512 reached 5/255).
const BAKE_W = 2048, BAKE_H = 1024;
function bakedSkyNoise() {
  const bake = Fn(() => {
    const q = uv();
    const lon = q.x.sub(0.5).mul(Math.PI * 2), lat = q.y.sub(0.5).mul(Math.PI);
    const cl = cos(lat);
    const [n1, n2, nb] = skyNoise(vec3(cl.mul(cos(lon)), sin(lat), cl.mul(sin(lon))));
    return vec4(n1, n2, nb, 1.0);
  })();
  const node = rtt(bake, BAKE_W, BAKE_H, { type: THREE.HalfFloatType, autoUpdate: false, depthBuffer: false });
  node.renderTarget.texture.wrapS = THREE.RepeatWrapping;   // longitude wraps without a seam
  return node;
}

export function createSky() {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  const baked = bakedSkyNoise();
  mat.colorNode = Fn(() => {
    const rd = normalize(positionLocal);
    baked.uvNode = vec2(atan(rd.z, rd.x).div(Math.PI * 2).add(0.5), asin(clamp(rd.y, -1.0, 1.0)).div(Math.PI).add(0.5));
    const s = baked;
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
