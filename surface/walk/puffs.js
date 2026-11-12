// Dust Sea walk: sand thrown up by the Pilgrim (third person). A fixed pool of sprites, one draw:
//   kick   each footfall: a low spray of grains thrown back and to the sides that falls back within
//          about 0.4 s (barely there walking, a clear kick running)
//   dust   running only: a faint dust tail from each footfall, drifting downwind
//   spray  sliding: grains bouncing and fanning out sideways from the feet and hem
//   haze   sliding: a thin pale haze lifting off the pour and drifting downwind
// The pour itself (the avalanching sheet, its tongues and the lobes they leave) is in the ground, not
// here: pour.js. All of the slide's sand scales with the slide's speed and stays under reduced motion
// (it is the interaction); the footfall kicks and dust do not.
// Simulated on the CPU (at most POOL sprites), drawn as one instanced Sprite whose positionNode,
// scaleNode and rotationNode read per-instance attributes. Grain sprites are a cluster of separate
// grains (a hashed lattice of dots, stretched along the on-screen motion); dust and haze are soft,
// eroded by noise and speckled. Both are sand-coloured and lit like the sand: the two suns on a rough
// cluster (no white forward glow; a little for the haze), sky and ground light, and the lantern.

import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, float, max, mix, abs, clamp, smoothstep, length, pow, exp, step, dot, normalize, uv, floor, fract, hash, select,
  cameraPosition, instancedDynamicBufferAttribute, mx_noise_float } from 'three/tsl';
import { height, heightD } from '../look-test/height.js';

export const POOL = 384;
const GRAINY = { kick: 1, clump: 1, spray: 1, dust: 0, haze: 0 };
// the albedo scale also picks a grain sprite's lattice (shape below): kick 4 grains across (a few
// fine grains), clump 2 (fewer, larger), spray 5
const ALB = { kick: 0.785, clump: 0.775, spray: 0.74, dust: 0.95, haze: 1.0 };

export function createPuffs({ U, shade, scene }) {
  const aces = (x) => clamp(x.mul(x.mul(2.51).add(0.03)).div(x.mul(x.mul(2.43).add(0.59)).add(0.14)), 0.0, 1.0);
  const srgb = (c) => mix(c.mul(12.92), pow(c, vec3(1.0 / 2.4)).mul(1.055).sub(0.055), step(vec3(0.0031308), c));
  const finish = (col) => srgb(aces(col.mul(U.uExposure)));

  const posA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 3), 3);
  const datA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);   // scale x, scale y, alpha, seed
  const rotA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);   // rotation, age 0..1, albedo scale, grainy
  for (const a of [posA, datA, rotA]) a.setUsage(THREE.DynamicDrawUsage);
  const P = instancedDynamicBufferAttribute(posA, 'vec3');
  const D = instancedDynamicBufferAttribute(datA, 'vec4');
  const Rt = instancedDynamicBufferAttribute(rotA, 'vec4');

  const mat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  mat.positionNode = P;
  mat.scaleNode = D.xy;
  mat.rotationNode = Rt.x;
  const { uLamp, uLampCol } = shade;
  const shape = Fn(() => {
    const q = uv().sub(0.5).mul(2.0).toVar();
    const r = length(q).toVar();
    const env = exp(r.mul(r).mul(-2.2)).mul(float(1.0).sub(smoothstep(0.7, 1.0, r))).toVar();
    const seed = floor(D.w.mul(997.0));
    // grains: a lattice of dots, each cell kept or not by a hash, its dot jittered and sized by more
    const ab = abs(Rt.z);
    const G = select(ab.greaterThan(0.78), float(4.0), select(ab.greaterThan(0.77), float(2.0), float(5.0)));
    const gq = uv().mul(vec2(G, G.mul(0.6))).toVar();
    const cell = floor(gq), f = fract(gq).sub(0.5).toVar();
    const h1 = hash(cell.x.add(cell.y.mul(16.0)).add(seed.mul(256.0)).add(5.0));
    const h2 = hash(cell.x.add(cell.y.mul(16.0)).add(seed.mul(256.0)).add(91.0));
    const off = vec2(h1, h2).sub(0.5).mul(0.5);
    const dr = length(f.sub(off)).toVar();
    const keep = step(h1.mul(0.6).add(h2.mul(0.4)), env.mul(1.7).sub(Rt.y.mul(0.4)));
    const grains = smoothstep(h2.mul(0.1).add(0.14), 0.05, dr).mul(keep);
    // dust: soft, eroded by noise, speckled
    const nz = mx_noise_float(vec3(q.mul(vec2(1.6, 2.6)), D.w.mul(17.0).add(Rt.y.mul(1.4)))).mul(0.5).add(0.5);
    const nz2 = mx_noise_float(vec3(q.mul(6.0), D.w.mul(31.0).add(Rt.y.mul(2.0)))).mul(0.5).add(0.5);
    const ero = smoothstep(Rt.y.mul(0.45).add(0.2), Rt.y.mul(0.35).add(0.75), nz.mul(0.7).add(nz2.mul(0.3)));
    const speck = hash(dot(floor(uv().mul(40.0)), vec2(1.0, 64.0)).add(seed.mul(4096.0))).mul(0.5).add(0.5);
    const soft = env.mul(ero).mul(speck).mul(smoothstep(0.0, 0.45, uv().y));
    return mix(soft, grains, step(Rt.z, 0.0));
  });
  mat.opacityNode = shape().mul(D.z);
  mat.colorNode = Fn(() => {
    const alb = U.uSand.mul(abs(Rt.z));
    const grainy = step(Rt.z, 0.0), lit = Rt.w;
    const V = normalize(cameraPosition.sub(P)).toVar();
    const sun = (L, Cc) => {
      const up = smoothstep(-0.02, 0.03, L.y);
      // a rough cluster or a thin veil: lit about like the sand under it; only the haze scatters forward
      const fwd = pow(max(dot(V.negate(), L), 0.0), 4.0).mul(float(1.0).sub(grainy)).mul(0.5);
      return Cc.mul(up).mul(lit).mul(max(L.y, 0.0).mul(0.5).add(0.32).add(fwd));
    };
    const light = sun(U.uSun1Dir, U.uSun1Col).add(sun(U.uSun2Dir, U.uSun2Col)).add(U.uAmbSky.mul(0.6)).add(U.uAmbGround.mul(0.5)).toVar();
    const dv = uLamp.xyz.sub(P).toVar();
    light.addAssign(uLampCol.mul(uLamp.w).div(dot(dv, dv).add(0.1)).mul(0.8));
    return finish(alb.mul(light));
  })();

  const sprite = new THREE.Sprite(mat);
  sprite.count = POOL;
  sprite.frustumCulled = false;
  sprite.renderOrder = 2;
  scene.add(sprite);

  // the pool: x, y, z, vx, vy, vz, age, life, size, aspect, alpha, seed, kind, grow, g (gravity)
  const ps = [];
  for (let i = 0; i < POOL; i++) ps.push({ on: false });
  let next = 0, live = 0, sprayAcc = 0, hazeAcc = 0;
  const rnd = (() => { let s = 1234567; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
  // how much of the key sun reaches a point just above the sand: the dunes' cast shadow (a short
  // march toward the sun) and the face turning away from it. Once per sprite, at its birth.
  let key = [0.6, 0.1, 0.6];
  function sunLit(x, z) {
    const [L0, L1, L2] = key, hl = Math.hypot(L0, L2) || 1, tanE = L1 / hl, dx = L0 / hl, dz = L2 / hl;
    if (L1 < -0.02) return 0;
    const y0 = height(x, z) + 0.15;
    let lit = 1;
    for (let t = 2; t < 260; t *= 1.45) { const over = height(x + dx * t, z + dz * t) - (y0 + tanE * t); if (over > 0) { lit = Math.max(0, 1 - over / (0.02 * t + 0.3)); if (lit === 0) break; } }
    const [, gx, gz] = heightD(x, z), n = [-gx, 1, -gz], nl = Math.hypot(...n);
    const ndl = (n[0] * L0 + n[1] * L1 + n[2] * L2) / nl;
    return lit * (0.35 + 0.65 * Math.min(1, Math.max(0, (ndl + 0.05) / 0.25)));
  }
  function spawn(o) {
    o.lit = sunLit(o.x, o.z);
    for (let k = 0; k < POOL; k++) { const i = (next + k) % POOL; if (!ps[i].on) { next = (i + 1) % POOL; Object.assign(ps[i], o, { on: true, age: 0, seed: rnd() }); return; } }
    Object.assign(ps[next], o, { on: true, age: 0, seed: rnd() }); next = (next + 1) % POOL;
  }

  // a footfall (walking or running), at e.x, e.z; wind {dir, strength}; fwd: the walk's direction.
  // A fan of fine grains thrown back and out from the foot, most of them slow (they land close, so the
  // spray is densest at the foot and thins outward), with a few heavier clumps that go further.
  function foot(e, wind, fwd) {
    const g = height(e.x, e.z);
    const run = e.run || 0;
    const R = run > 0.5;
    const rx = -fwd[1], rz = fwd[0];
    const fine = R ? 34 : 4, clumps = R ? 4 : 0;
    for (let i = 0; i < fine + clumps; i++) {
      const clump = i >= fine;
      // a fan behind the foot, about 110 degrees wide, out from under the hem; speed skewed low (u^2)
      const a = (rnd() - 0.5) * (R ? 1.9 : 1.2), u = rnd(), sp = clump ? (R ? 1.9 + 0.9 * rnd() : 0.5) : (R ? 0.95 + 1.9 * u * u : 0.25 + 0.4 * u * u);
      const bx = -fwd[0] * Math.cos(a) + rx * Math.sin(a), bz = -fwd[1] * Math.cos(a) + rz * Math.sin(a);
      const vy = (clump ? 1.1 + 0.6 * rnd() : 0.6 + 1.0 * rnd()) * (R ? 1 : 0.6);
      spawn({
        kind: clump ? 'clump' : 'kick', x: e.x - fwd[0] * 0.06 + bx * 0.03, y: g + 0.02, z: e.z - fwd[1] * 0.06 + bz * 0.03,
        vx: bx * sp + wind.dir[0] * wind.strength * 0.2, vy, vz: bz * sp + wind.dir[1] * wind.strength * 0.2,
        life: clump ? 0.36 + 0.08 * rnd() : (R ? 0.26 + 0.1 * rnd() : 0.2 + 0.06 * rnd()),
        size: clump ? 0.11 + 0.04 * rnd() : (R ? 0.08 + 0.04 * rnd() : 0.06 + 0.02 * rnd()), aspect: 0.6,
        alpha: R ? 1.0 : 0.5, grow: clump ? 1.1 : 1.3, g: 9.0,
      });
    }
    // running: a faint dust tail drifting downwind
    if (R) spawn({
      kind: 'dust', x: e.x - fwd[0] * 0.25, y: g + 0.06, z: e.z - fwd[1] * 0.25,
      vx: -fwd[0] * 0.6 + wind.dir[0] * wind.strength * 0.8, vy: 0.08 + 0.08 * rnd(), vz: -fwd[1] * 0.6 + wind.dir[1] * wind.strength * 0.8,
      life: 1.3 + 0.6 * rnd(), size: 0.35 + 0.2 * rnd(), aspect: 0.45, alpha: 0.16, grow: 2.6, g: 0,
    });
  }

  // the crest leap's landing, at e.x, e.z (e.dirX, e.dirZ: the way it was going; e.speed, e.vy):
  // a low ring-fan of grains thrown forward and to the sides, none straight back, with heavier
  // clumps and four faint dust puffs; scaled by the landing's speed, gone in about 0.6 s
  function land(e, wind) {
    const g = height(e.x, e.z);
    const k = Math.min(1, Math.max(0.35, (Math.abs(e.vy) + 0.4 * e.speed) / 6));
    const fx = e.dirX, fz = e.dirZ, rx = -fz, rz = fx;
    const n = Math.round(48 + 60 * k), clumps = Math.round(6 + 8 * k);
    for (let i = 0; i < n + clumps; i++) {
      const clump = i >= n;
      // round the ring from ahead to just behind square either side (about 250 degrees), densest ahead
      const u = rnd() * 2 - 1, a = Math.sign(u) * Math.pow(Math.abs(u), 1.4) * 2.2;
      const ox = fx * Math.cos(a) + rx * Math.sin(a), oz = fz * Math.cos(a) + rz * Math.sin(a);
      const w = rnd(), sp = (clump ? 1.8 + 1.4 * rnd() : 0.8 + 2.6 * w * w) * (0.6 + 0.6 * k);
      const r0 = 0.22 + 0.12 * rnd();   // out from under the hem's ring
      // the figure's own way on, a little, so the fan leans forward
      const carry = 0.25 * e.speed * (0.5 + 0.5 * Math.cos(a));
      spawn({
        kind: clump ? 'clump' : 'kick', x: e.x + ox * r0, y: g + 0.02, z: e.z + oz * r0,
        vx: ox * sp + fx * carry + wind.dir[0] * wind.strength * 0.2, vy: (clump ? 1.1 + 0.8 * rnd() : 0.5 + 1.0 * rnd()) * (0.7 + 0.4 * k),
        vz: oz * sp + fz * carry + wind.dir[1] * wind.strength * 0.2,
        life: clump ? 0.42 + 0.14 * rnd() : 0.3 + 0.22 * rnd(),
        size: clump ? 0.15 + 0.06 * rnd() : 0.11 + 0.06 * rnd(), aspect: 0.6, alpha: 1.0, grow: clump ? 1.15 : 1.4, g: 9.0,
      });
    }
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1;
      spawn({
        kind: 'dust', x: e.x + rx * side * (0.3 + 0.15 * (i >> 1)) + fx * (0.15 + 0.25 * (i >> 1)), y: g + 0.06, z: e.z + rz * side * (0.3 + 0.15 * (i >> 1)) + fz * (0.15 + 0.25 * (i >> 1)),
        vx: rx * side * 0.7 + fx * 0.5 + wind.dir[0] * wind.strength * 0.8, vy: 0.12 + 0.08 * rnd(), vz: rz * side * 0.7 + fz * 0.5 + wind.dir[1] * wind.strength * 0.8,
        life: 0.55 + 0.1 * rnd(), size: 0.5 + 0.25 * k, aspect: 0.45, alpha: 0.2 + 0.1 * k, grow: 2.4, g: 0,
      });
    }
  }

  // one frame: sliding emission, motion, and the upload. ws: the walker's state
  function update(dt, ws, wind, camera, reduced, sun) {
    if (sun) key = sun;
    if (ws.sliding > 0.2 && dt > 0) {
      const sv = Math.hypot(ws.sx, ws.sz) || 1;
      const dx = ws.sx / sv, dz = ws.sz / sv, rx = -dz, rz = dx;
      const tv = Math.hypot(ws.vx + ws.sx, ws.vz + ws.sz);   // the figure's whole speed
      const k = Math.min(1.2, ws.sliding * (0.5 + 0.5 * tv / 4.4));
      // the spray: grains bouncing and fanning out sideways from the feet and the hem
      sprayAcc += dt * 55 * k;
      while (sprayAcc >= 1) {
        sprayAcc -= 1;
        const sgn = rnd() < 0.5 ? -1 : 1, side = sgn * (0.15 + 0.25 * rnd());
        const x = ws.x + dx * (0.2 + 0.2 * rnd()) + rx * side, z = ws.z + dz * (0.2 + 0.2 * rnd()) + rz * side;
        const out = sgn * (0.8 + 1.6 * rnd()), sp = tv * (0.7 + 0.4 * rnd());
        spawn({ kind: 'spray', x, y: height(x, z) + 0.03, z, vx: dx * sp + rx * out, vy: 0.6 + 1.1 * rnd(), vz: dz * sp + rz * out,
          life: 0.35 + 0.2 * rnd(), size: 0.12 + 0.1 * rnd(), aspect: 0.6, alpha: 0.95, grow: 1.5, g: 9.0 });
      }
      // a thin pale haze lifting off behind and drifting downwind
      hazeAcc += dt * 9 * k;
      while (hazeAcc >= 1) {
        hazeAcc -= 1;
        const x = ws.x - dx * (0.4 + 1.2 * rnd()) + rx * (rnd() - 0.5) * 1.4, z = ws.z - dz * (0.4 + 1.2 * rnd()) + rz * (rnd() - 0.5) * 1.4;
        spawn({ kind: 'haze', x, y: height(x, z) + 0.08 + 0.12 * rnd(), z, vx: wind.dir[0] * wind.strength * 0.7 + dx * 0.3, vy: 0.1 + 0.1 * rnd(), vz: wind.dir[1] * wind.strength * 0.7 + dz * 0.3,
          life: 2.2 + 1.4 * rnd(), size: 0.8 + 0.5 * rnd(), aspect: 0.4, alpha: 0.1 + 0.05 * k, grow: 2.8, g: 0 });
      }
    } else { sprayAcc = 0; hazeAcc = 0; }

    const pa = posA.array, da = datA.array, ra = rotA.array;
    const ce = camera.matrixWorldInverse.elements, pe = camera.projectionMatrix.elements;
    const proj = (x, y, z) => {
      const vx = ce[0] * x + ce[4] * y + ce[8] * z + ce[12], vy = ce[1] * x + ce[5] * y + ce[9] * z + ce[13], vz = ce[2] * x + ce[6] * y + ce[10] * z + ce[14];
      const w = -vz || 1e-3; return [(pe[0] * vx) / w, (pe[5] * vy) / w];
    };
    const aspect = camera.aspect || 1;
    live = 0;
    for (let i = 0; i < POOL; i++) {
      const p = ps[i];
      if (p.on) { p.age += dt; if (p.age >= p.life) p.on = false; }
      if (!p.on) { da[i * 4 + 2] = 0; da[i * 4] = da[i * 4 + 1] = 0.0001; pa[i * 3 + 1] = -1e4; continue; }
      live++;
      const grainy = GRAINY[p.kind];
      const wx = wind.dir[0] * wind.strength * 0.9, wz = wind.dir[1] * wind.strength * 0.9;
      const drag = grainy ? 0.8 : 1.4;
      p.vx += (wx - p.vx) * (1 - Math.exp(-dt * drag));
      p.vz += (wz - p.vz) * (1 - Math.exp(-dt * drag));
      if (p.g) p.vy -= p.g * dt; else { p.vy -= 0.15 * dt; p.vy *= Math.exp(-dt * 1.5); }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const g = height(p.x, p.z);
      if (p.y < g + 0.02) {
        if (grainy) { p.y = g + 0.02; p.vy = Math.abs(p.vy) * 0.25; p.vx *= 0.5; p.vz *= 0.5; p.age = Math.max(p.age, p.life * 0.75); }   // landed: a small bounce, then gone
        else { p.y = g + 0.02; p.vy = Math.abs(p.vy) * 0.2; }
      }
      const f = p.age / p.life;
      const s = p.size * (1 + (p.grow - 1) * Math.sqrt(f));
      const a = p.alpha * Math.min(1, f * (grainy ? 14 : 6)) * (1 - f) * (grainy ? 1 : (1 - f * 0.3));
      const p0 = proj(p.x, p.y, p.z), p1 = proj(p.x + p.vx * 0.1, p.y + p.vy * 0.1, p.z + p.vz * 0.1);
      const sx = (p1[0] - p0[0]) * aspect, sy = p1[1] - p0[1];
      const rot = Math.hypot(sx, sy) > 1e-5 ? Math.atan2(sy, sx) : 0;
      const spd = Math.hypot(p.vx, p.vy, p.vz);
      const stretch = 1 + Math.min(1.2, spd * (grainy ? 0.22 : 0.3));
      pa[i * 3] = p.x; pa[i * 3 + 1] = p.y + s * p.aspect * 0.3; pa[i * 3 + 2] = p.z;
      da[i * 4] = s * stretch; da[i * 4 + 1] = s * p.aspect; da[i * 4 + 2] = a; da[i * 4 + 3] = p.seed;
      ra[i * 4] = rot; ra[i * 4 + 1] = f; ra[i * 4 + 2] = grainy ? -ALB[p.kind] : ALB[p.kind]; ra[i * 4 + 3] = p.lit ?? 1;
    }
    posA.needsUpdate = datA.needsUpdate = rotA.needsUpdate = true;
    sprite.visible = live > 0;
  }
  function clear() { for (const p of ps) p.on = false; }
  return { foot, land, update, clear, sprite, get live() { return live; } };
}
