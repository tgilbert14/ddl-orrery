// Dust Sea walk: sand thrown up by the Pilgrim (third person). A fixed pool of sprites, one draw:
//   puff   a small low puff at each walking footfall, drifting downwind
//   kick   running: a bigger kick thrown back and up, then downwind
//   sheet  sliding: a wide sheet of thin streaks pouring down the face ahead of and beside the hem,
//          hugging the sand (each one is re-seated on height.js every frame)
//   lip    sliding: a bow wave at the feet, a low dark lip of sand pushed ahead of the hem
//   tongue sliding: small avalanching tongues, long dark streaks set off beside and behind the
//          figure that run down the face past it, faster than it
//   trail  sliding: a low dust trail hanging behind
// All of the slide's sand scales with the slide's speed. It stays under reduced motion (it is the
// interaction); the footfall puffs and kicks do not.
// Simulated on the CPU (at most POOL sprites), drawn as one instanced Sprite whose positionNode,
// scaleNode and rotationNode read per-instance attributes. Each sprite is stretched along its
// on-screen motion, its edge eroded by noise, faded toward its bottom (so where it meets the sand
// there is no hard line), and lit like the sand: both suns (forward-scattering when you look toward
// one), sky and ground, and the lantern.

import * as THREE from 'three/webgpu';
import { Fn, uniform, vec2, vec3, vec4, float, max, mix, clamp, smoothstep, length, pow, exp, step, dot, normalize, sqrt, uv,
  cameraPosition, instancedDynamicBufferAttribute, mx_noise_float } from 'three/tsl';
import { height } from '../look-test/height.js';

export const POOL = 384;

export function createPuffs({ U, shade, scene }) {
  const aces = (x) => clamp(x.mul(x.mul(2.51).add(0.03)).div(x.mul(x.mul(2.43).add(0.59)).add(0.14)), 0.0, 1.0);
  const srgb = (c) => mix(c.mul(12.92), pow(c, vec3(1.0 / 2.4)).mul(1.055).sub(0.055), step(vec3(0.0031308), c));
  const finish = (col) => srgb(aces(col.mul(U.uExposure)));

  const posA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 3), 3);
  const datA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);   // scale x, scale y, alpha, seed
  const rotA = new THREE.InstancedBufferAttribute(new Float32Array(POOL * 4), 4);   // rotation, age 0..1, albedo scale, 0
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
    const base = exp(r.mul(r).mul(-2.6)).mul(float(1.0).sub(smoothstep(0.75, 1.0, r)));
    const nz = mx_noise_float(vec3(q.mul(vec2(1.6, 2.6)), D.w.mul(17.0).add(Rt.y.mul(1.4)))).mul(0.5).add(0.5);
    const nz2 = mx_noise_float(vec3(q.mul(5.0), D.w.mul(31.0).add(Rt.y.mul(2.0)))).mul(0.5).add(0.5);
    const ero = smoothstep(Rt.y.mul(0.45).add(0.2), Rt.y.mul(0.35).add(0.75), nz.mul(0.7).add(nz2.mul(0.3)));
    return base.mul(ero).mul(smoothstep(0.0, 0.45, uv().y));
  });
  mat.opacityNode = shape().mul(D.z);
  mat.colorNode = Fn(() => {
    const alb = U.uSand.mul(Rt.z);   // per kind: avalanching sand reads darker than the face, dust lighter
    const V = normalize(cameraPosition.sub(P)).toVar();
    const sun = (L, Cc) => {
      const up = smoothstep(-0.02, 0.03, L.y);
      const fwd = pow(max(dot(V.negate(), L), 0.0), 5.0);
      return Cc.mul(up).mul(fwd.mul(1.8).add(0.5));
    };
    const light = sun(U.uSun1Dir, U.uSun1Col).add(sun(U.uSun2Dir, U.uSun2Col)).add(U.uAmbSky.mul(0.55)).add(U.uAmbGround.mul(0.6)).toVar();
    const dv = uLamp.xyz.sub(P).toVar();
    light.addAssign(uLampCol.mul(uLamp.w).div(dot(dv, dv).add(0.1)).mul(0.8));
    return finish(alb.mul(light));
  })();

  const sprite = new THREE.Sprite(mat);
  sprite.count = POOL;
  sprite.frustumCulled = false;
  sprite.renderOrder = 2;
  scene.add(sprite);

  // the pool: x, y, z, vx, vy, vz, age, life, size, aspect, alpha, seed, kind, hug
  const ps = [];
  for (let i = 0; i < POOL; i++) ps.push({ on: false });
  let next = 0, live = 0, sheetAcc = 0, trailAcc = 0, lipAcc = 0, tongueAcc = 0;
  const rnd = (() => { let s = 1234567; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
  function spawn(o) {
    // take a dead one, else the oldest-by-slot
    for (let k = 0; k < POOL; k++) { const i = (next + k) % POOL; if (!ps[i].on) { next = (i + 1) % POOL; Object.assign(ps[i], o, { on: true, age: 0, seed: rnd() }); return; } }
    Object.assign(ps[next], o, { on: true, age: 0, seed: rnd() }); next = (next + 1) % POOL;
  }

  // a footfall (walking or running), at e.x, e.z; wind {dir, strength}; fwd: the walk's direction
  function foot(e, wind, fwd) {
    const g = height(e.x, e.z);
    const run = e.run || 0;
    const n = run > 0.5 ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const sp = run > 0.5 ? 0.9 + 0.8 * rnd() : 0.15 + 0.2 * rnd();
      const a = rnd() * Math.PI * 2;
      const back = run > 0.5 ? 1.4 + rnd() : 0;
      spawn({
        kind: run > 0.5 ? 'kick' : 'puff', hug: 0,
        x: e.x + Math.cos(a) * 0.06, y: g + 0.04, z: e.z + Math.sin(a) * 0.06,
        vx: Math.cos(a) * sp - fwd[0] * back + wind.dir[0] * wind.strength * 0.5, vy: run > 0.5 ? 0.5 + 0.7 * rnd() : 0.12 + 0.12 * rnd(),
        vz: Math.sin(a) * sp - fwd[1] * back + wind.dir[1] * wind.strength * 0.5,
        life: run > 0.5 ? 1.3 + 0.8 * rnd() : 1.0 + 0.7 * rnd(), size: run > 0.5 ? 0.4 + 0.25 * rnd() : 0.24 + 0.12 * rnd(), aspect: 0.5,
        alpha: run > 0.5 ? 0.42 : 0.3, grow: run > 0.5 ? 1.8 : 1.4,
      });
    }
  }

  // one frame: sliding emission, motion, and the upload. ws: the walker's state
  function update(dt, ws, wind, camera, reduced) {
    if (ws.sliding > 0.2 && dt > 0) {
      const sv = Math.hypot(ws.sx, ws.sz) || 1;
      const dx = ws.sx / sv, dz = ws.sz / sv, rx = -dz, rz = dx;
      const tv = Math.hypot(ws.vx + ws.sx, ws.vz + ws.sz);   // the figure's whole speed
      const k = Math.min(1.2, ws.sliding * (0.5 + 0.5 * tv / 4.4));
      // the sheet: wide and dense, ahead of and beside the hem
      sheetAcc += dt * 190 * k;
      while (sheetAcc >= 1) {
        sheetAcc -= 1;
        const along = -0.35 + 2.2 * rnd(), side = (rnd() - 0.5) * (1.3 + along * 0.9);
        const x = ws.x + dx * along + rx * side, z = ws.z + dz * along + rz * side;
        const sp = tv * (0.85 + 0.5 * rnd()) + 0.3;
        spawn({ kind: 'sheet', hug: 0.03 + 0.06 * rnd(), x, y: height(x, z) + 0.05, z, vx: dx * sp, vy: 0, vz: dz * sp, life: 0.5 + 0.7 * rnd(), size: 0.45 + 0.35 * rnd(), aspect: 0.3, alpha: 0.95, grow: 1.4 });
      }
      // the bow wave: just ahead of the feet, low, short-lived, thrown a little up and out
      lipAcc += dt * 70 * k;
      while (lipAcc >= 1) {
        lipAcc -= 1;
        const side = (rnd() - 0.5) * 0.75, out = Math.sign(side) * (0.4 + 0.6 * rnd());
        const x = ws.x + dx * (0.32 + 0.1 * rnd()) + rx * side, z = ws.z + dz * (0.32 + 0.1 * rnd()) + rz * side;
        const sp = tv * (1.05 + 0.2 * rnd());
        spawn({ kind: 'lip', hug: 0, x, y: height(x, z) + 0.04, z, vx: dx * sp + rx * out, vy: 0.35 + 0.4 * rnd(), vz: dz * sp + rz * out, life: 0.3 + 0.22 * rnd(), size: 0.3 + 0.2 * rnd(), aspect: 0.45, alpha: 0.95, grow: 1.7 });
      }
      // avalanching tongues: set off beside and behind, they run down past the figure
      tongueAcc += dt * 9 * k;
      while (tongueAcc >= 1) {
        tongueAcc -= 1;
        const side = (rnd() < 0.5 ? -1 : 1) * (0.5 + 1.3 * rnd());
        const x = ws.x - dx * (0.6 + 1.2 * rnd()) + rx * side, z = ws.z - dz * (0.6 + 1.2 * rnd()) + rz * side;
        const sp = tv * (1.25 + 0.35 * rnd()) + 0.6;
        spawn({ kind: 'tongue', hug: 0.03, x, y: height(x, z) + 0.03, z, vx: dx * sp, vy: 0, vz: dz * sp, life: 1.2 + 0.9 * rnd(), size: 0.8 + 0.5 * rnd(), aspect: 0.16, alpha: 1.0, grow: 1.25 });
      }
      // the dust trail: low, hanging behind, drifting downwind
      trailAcc += dt * 16 * k;
      while (trailAcc >= 1) {
        trailAcc -= 1;
        const x = ws.x - dx * (0.3 + 0.5 * rnd()) + rx * (rnd() - 0.5) * 1.0, z = ws.z - dz * (0.3 + 0.5 * rnd()) + rz * (rnd() - 0.5) * 1.0;
        spawn({ kind: 'trail', hug: 0, x, y: height(x, z) + 0.1 + 0.15 * rnd(), z, vx: wind.dir[0] * wind.strength * 0.6 + dx * 0.4, vy: 0.08 + 0.12 * rnd(), vz: wind.dir[1] * wind.strength * 0.6 + dz * 0.4, life: 2.4 + 1.6 * rnd(), size: 0.7 + 0.5 * rnd(), aspect: 0.5, alpha: 0.26 + 0.1 * k, grow: 2.8 });
      }
    } else { sheetAcc = 0; trailAcc = 0; lipAcc = 0; tongueAcc = 0; }

    const pa = posA.array, da = datA.array, ra = rotA.array;
    const ce = camera.matrixWorldInverse.elements, pe = camera.projectionMatrix.elements;
    const proj = (x, y, z) => {   // to NDC (x, y) * w-less: enough for a direction on screen
      const vx = ce[0] * x + ce[4] * y + ce[8] * z + ce[12], vy = ce[1] * x + ce[5] * y + ce[9] * z + ce[13], vz = ce[2] * x + ce[6] * y + ce[10] * z + ce[14];
      const w = -vz || 1e-3; return [(pe[0] * vx) / w, (pe[5] * vy) / w];
    };
    const aspect = camera.aspect || 1;
    live = 0;
    for (let i = 0; i < POOL; i++) {
      const p = ps[i];
      if (p.on) {
        p.age += dt;
        if (p.age >= p.life) p.on = false;
      }
      if (!p.on) { da[i * 4 + 2] = 0; da[i * 4] = da[i * 4 + 1] = 0.0001; pa[i * 3 + 1] = -1e4; continue; }
      live++;
      const ground = p.kind === 'sheet' || p.kind === 'tongue';   // sand running on the face, not blown
      const drag = p.kind === 'kick' || p.kind === 'lip' ? 2.2 : ground ? 0 : 1.4;
      const wx = wind.dir[0] * wind.strength * 0.9, wz = wind.dir[1] * wind.strength * 0.9;
      p.vx += (wx - p.vx) * (1 - Math.exp(-dt * drag));
      p.vz += (wz - p.vz) * (1 - Math.exp(-dt * drag));
      p.vy += (p.kind === 'kick' || p.kind === 'lip' ? -3.0 : -0.15) * dt; p.vy *= Math.exp(-dt * 1.5);
      if (p.kind === 'sheet') { p.vx *= Math.exp(-dt * 0.4); p.vz *= Math.exp(-dt * 0.4); }
      if (p.kind === 'tongue') { p.vx *= Math.exp(-dt * 0.25); p.vz *= Math.exp(-dt * 0.25); }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const g = height(p.x, p.z);
      if (p.hug) p.y = g + p.hug; else if (p.y < g + 0.05) { p.y = g + 0.05; p.vy = Math.abs(p.vy) * 0.2; }
      const f = p.age / p.life;
      const s = p.size * (1 + (p.grow - 1) * Math.sqrt(f));
      const a = p.alpha * Math.min(1, f * 8) * (1 - f) * (1 - f * 0.3);
      // stretch along the on-screen motion
      const p0 = proj(p.x, p.y, p.z), p1 = proj(p.x + p.vx * 0.1, p.y + p.vy * 0.1, p.z + p.vz * 0.1);
      const sx = (p1[0] - p0[0]) * aspect, sy = p1[1] - p0[1];
      const rot = Math.hypot(sx, sy) > 1e-5 ? Math.atan2(sy, sx) : 0;
      const spd = Math.hypot(p.vx, p.vy, p.vz);
      const stretch = 1 + Math.min(1.6, spd * 0.35);
      pa[i * 3] = p.x; pa[i * 3 + 1] = p.y + s * p.aspect * 0.3; pa[i * 3 + 2] = p.z;
      da[i * 4] = s * stretch; da[i * 4 + 1] = s * p.aspect; da[i * 4 + 2] = a; da[i * 4 + 3] = p.seed;
      ra[i * 4] = rot; ra[i * 4 + 1] = f; ra[i * 4 + 2] = p.kind === 'sheet' ? 0.36 : p.kind === 'tongue' ? 0.3 : p.kind === 'lip' ? 0.5 : 1.2;
    }
    posA.needsUpdate = datA.needsUpdate = rotA.needsUpdate = true;
    sprite.visible = live > 0;
  }
  function clear() { for (const p of ps) p.on = false; }
  return { foot, update, clear, sprite, get live() { return live; } };
}
