// Dust Sea walk: the trace map. What your feet do to the sand, in a texture that follows you.
//
// Two plain half-float render targets (ping-pong, so it runs the same on WebGPU and WebGL2), N x N
// texels over `size` metres, centred on the walker and moved only in whole texels (the window
// snaps to the texel lattice, so a print never smears as you walk). Each texel holds:
//   R  the ground's displacement in metres (a print's dent is negative, its rim positive)
//   G  how disturbed the sand is, 0..1 (ripples are trodden out; it heals with the dent)
//   B  how fast this texel heals (1 in a trough, up to ~2.4 on an exposed crest; set by the stamp)
// One pass per frame at most, and only when something changed: it copies the old window into the
// new one (integer texel shift), heals it (4 times a second: the dent fills, and a 4-neighbour blur
// softens its walls; a half float cannot hold a per-frame decay of 1/1500, a quarter-second step it
// can), and stamps this frame's footfalls and slide marks.
//
// The r186 v-flip (look-test RESULTS.md): a target written by a full-screen quad at uv() and read at
// the same uv comes back upside down in WebGPURenderer, on both backends. So every read here and in
// the ground is at (u, 1 - v): the logical coordinate L is the writing quad's uv().

import * as THREE from 'three/webgpu';
import { Fn, If, uniform, texture, uv, vec2, vec4, float, clamp, smoothstep, max, min, abs, dot, length, exp, mix, positionLocal, step } from 'three/tsl';

export const TRACE = {
  N: 1024,            // texels a side
  size: 48,           // metres a side (4.7 cm texels); the trail behind you reads for about 24 m
  tick: 0.25,         // heal step (s)
  tau: 25,            // a trough print fills with this e-folding time (s): 30% left after 30 s, 5% after 75 s
  blur: 0.25,         // per second (times the heal rate): the walls soften by ~12 cm over a minute
  rateCrest: 1.4,     // heal rate = 1 + rateCrest * exposure (a crest heals 2.4x faster)
  edge: 0.08,         // the window fades out over this fraction of its width at each side
  slots: 4,           // stamps per pass
};

export function createTrace(renderer) {
  const { N, size } = TRACE;
  const texel = size / N;
  const mk = () => {
    const rt = new THREE.RenderTarget(N, N, { depthBuffer: false, generateMipmaps: false, type: THREE.HalfFloatType });
    rt.texture.type = THREE.HalfFloatType; rt.texture.format = THREE.RGBAFormat;
    rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter;
    rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
  };
  const rts = [mk(), mk()];
  let cur = 0;                         // the target the ground reads
  const centre = [0, 0];               // world centre of the window the ground reads
  const src = texture(rts[0].texture); // read by the update pass (swapped)
  const read = texture(rts[0].texture); // read by the ground (swapped)

  // ---- the update pass
  const uShift = uniform(new THREE.Vector2());   // (new centre - old centre) / size
  const uHeal = uniform(new THREE.Vector2());    // (step seconds, 1 if this pass heals)
  const slotA = [], slotB = [], slotC = [];
  for (let i = 0; i < TRACE.slots; i++) {
    slotA.push(uniform(new THREE.Vector4()));  // x, z (metres from the new centre), dir x, dir z
    slotB.push(uniform(new THREE.Vector4()));  // kind (0 none, 1 foot, 2 slide), depth, run | width, heal rate
    slotC.push(uniform(new THREE.Vector4()));  // slide: end x, z; foot: side
  }
  const rd = (l) => src.sample(vec2(l.x, float(1.0).sub(l.y))).level(0);

  const footShape = (p, A, Bv) => {
    // a print: heel and forefoot, joined; u along the walk, v across
    const q = p.sub(A.xy);
    const dir = A.zw;
    const u = dot(q, dir), v = dot(q, vec2(dir.y.negate(), dir.x));
    const heel = length(vec2(u.add(0.075), v)).sub(0.042);
    const fore = length(vec2(u.sub(0.05).div(1.45), v)).sub(0.048);
    const kk = 0.03;
    const hh = clamp(fore.sub(heel).div(kk).mul(0.5).add(0.5), 0.0, 1.0);
    const sd = mix(fore, heel, hh).sub(hh.mul(float(1.0).sub(hh)).mul(kk)).toVar(); // smooth union (m)
    const depth = Bv.y.mul(float(1.0).add(Bv.z.mul(0.45).mul(smoothstep(-0.04, 0.09, u)))); // running digs the toe in
    const dent = depth.mul(float(1.0).sub(smoothstep(-0.028, 0.006, sd))).negate();
    // the rim: sand pushed up and out; running throws more of it behind the heel
    const rimH = depth.mul(0.45).mul(float(1.0).add(Bv.z.mul(smoothstep(0.0, -0.12, u)).mul(1.2)));
    const rim = rimH.mul(exp(sd.sub(0.016).div(0.013).mul(sd.sub(0.016).div(0.013)).negate()));
    const cover = float(1.0).sub(smoothstep(0.035, 0.06, sd));
    return vec2(dent.add(rim), cover);
  };
  const slideShape = (p, A, Bv, C) => {
    // a trough: a capsule along the slide, with low berms either side
    const a = A.xy, b = C.xy;
    const ab = b.sub(a);
    const t = clamp(dot(p.sub(a), ab).div(max(dot(ab, ab), 1e-6)), 0.0, 1.0);
    const dd = length(p.sub(a.add(ab.mul(t))));
    const W = Bv.z;
    const dent = Bv.y.mul(float(1.0).sub(smoothstep(W.mul(0.35), W, dd))).negate();
    const berm = Bv.y.mul(0.35).mul(exp(dd.sub(W.mul(1.12)).div(W.mul(0.22)).mul(dd.sub(W.mul(1.12)).div(W.mul(0.22))).negate()));
    const cover = float(1.0).sub(smoothstep(W.mul(1.35), W.mul(1.6), dd));
    return vec2(dent.add(berm), cover);
  };

  const update = new THREE.MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
  update.vertexNode = vec4(positionLocal.xy, 0.0, 1.0);
  update.fragmentNode = Fn(() => {
    const L = uv().toVar();
    const Lp = L.add(uShift).toVar();
    const inb = step(0.0, Lp.x).mul(step(Lp.x, 1.0)).mul(step(0.0, Lp.y)).mul(step(Lp.y, 1.0)).toVar();
    const c = rd(Lp).mul(inb).toVar();
    If(uHeal.y.greaterThan(0.5), () => {
      const e = 1 / N;
      const avg = rd(Lp.add(vec2(e, 0.0))).add(rd(Lp.sub(vec2(e, 0.0)))).add(rd(Lp.add(vec2(0.0, e)))).add(rd(Lp.sub(vec2(0.0, e)))).mul(0.25).mul(inb);
      const rate = max(c.z, 1.0);
      const T = uHeal.x.mul(rate);
      const r = mix(c.x, avg.x, min(T.mul(TRACE.blur), 0.5)).mul(exp(T.div(-TRACE.tau)));
      const g = c.y.mul(exp(T.div(-TRACE.tau * 1.3)));
      c.assign(vec4(r, g, c.z, 1.0));
    });
    // stamps, in metres from the new centre
    const p = L.sub(0.5).mul(size).toVar();
    for (let i = 0; i < TRACE.slots; i++) {
      const A = slotA[i], Bv = slotB[i], C = slotC[i];
      If(Bv.x.greaterThan(0.5), () => {
        const sh = vec2(0.0).toVar();
        If(Bv.x.lessThan(1.5), () => { sh.assign(footShape(p, A, Bv)); }).Else(() => { sh.assign(slideShape(p, A, Bv, C)); });
        If(sh.y.greaterThan(0.0), () => {
          c.assign(vec4(mix(c.x, sh.x, sh.y), max(c.y, sh.y), mix(c.z, Bv.w, sh.y), 1.0));
        });
      });
    }
    return c;
  })();
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), update);
  quad.frustumCulled = false;
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // clear both targets once (a fresh render target's contents are not guaranteed)
  const clearAll = () => {
    for (const rt of rts) { renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); }
    renderer.setRenderTarget(null);
  };
  clearAll();

  const queue = [];
  let healAcc = 0, initialised = false, passes = 0;

  function snap(x) { return Math.round(x / texel) * texel; }

  // one frame: move the window to the walker, heal, stamp. Returns true if a pass ran.
  function update_(dt, wx, wz, healOn = true, force = false) {
    const nx = snap(wx), nz = snap(wz);
    if (!initialised) { centre[0] = nx; centre[1] = nz; initialised = true; }
    const shx = (nx - centre[0]) / size, shz = (nz - centre[1]) / size;
    healAcc += healOn ? dt : 0;
    const heal = healAcc >= TRACE.tick;
    if (shx === 0 && shz === 0 && !heal && queue.length === 0 && !force) return false;
    uShift.value.set(shx, shz);
    uHeal.value.set(heal ? healAcc : 0, heal ? 1 : 0);
    if (heal) healAcc = 0;
    for (let i = 0; i < TRACE.slots; i++) {
      const e = queue.shift();
      if (!e) { slotB[i].value.set(0, 0, 0, 0); continue; }
      const rate = 1 + TRACE.rateCrest * (e.exposure ?? 0);
      if (e.type === 'foot') {
        slotA[i].value.set(e.x - nx, e.z - nz, e.dirX, e.dirZ);
        slotB[i].value.set(1, e.depth, e.run, rate);
        slotC[i].value.set(e.side, 0, 0, 0);
      } else {
        slotA[i].value.set(e.x0 - nx, e.z0 - nz, 0, 0);
        slotB[i].value.set(2, e.depth, e.width, rate);
        slotC[i].value.set(e.x1 - nx, e.z1 - nz, 0, 0);
      }
    }
    src.value = rts[cur].texture;
    const dst = 1 - cur;
    renderer.setRenderTarget(rts[dst]); renderer.render(scene, cam); renderer.setRenderTarget(null);
    cur = dst; centre[0] = nx; centre[1] = nz;
    read.value = rts[cur].texture;
    uC.value.set(nx, nz);
    passes++;
    return true;
  }

  // ---- the ground's view of it (tsl-material.js opts.walk.trace)
  const uC = uniform(new THREE.Vector2());
  const S = (l) => read.sample(vec2(l.x, float(1.0).sub(l.y))).level(0);
  function hook({ xz, fw }) {
    const L = xz.sub(uC).div(size).add(0.5).toVar();
    const ed = TRACE.edge;
    const inWin = smoothstep(0.0, ed, L.x).mul(smoothstep(0.0, ed, float(1.0).sub(L.x)))
      .mul(smoothstep(0.0, ed, L.y)).mul(smoothstep(0.0, ed, float(1.0).sub(L.y))).toVar();
    // relief reads while a pixel is smaller than about two texels; beyond, only the disturbed tone
    const near = float(1.0).sub(smoothstep(texel * 1.0, texel * 3.0, fw)).mul(inWin).toVar();
    const res = vec4(0.0).toVar();   // slope x, slope z, disturbed, displacement
    If(inWin.greaterThan(0.0), () => {
      const c = S(L).toVar();
      res.assign(vec4(0.0, 0.0, c.y.mul(inWin), c.x));
      If(near.greaterThan(0.0), () => {
        const e = max(1 / N, fw.div(size)).toVar();
        const gx = S(L.add(vec2(e, 0.0))).x.sub(S(L.sub(vec2(e, 0.0))).x);
        const gz = S(L.add(vec2(0.0, e))).x.sub(S(L.sub(vec2(0.0, e))).x);
        res.assign(vec4(gx.div(e.mul(2.0 * size)).mul(near), gz.div(e.mul(2.0 * size)).mul(near), res.z, res.w));
      });
    });
    // a print's own shadow toward a light: three taps along the light, 3 to 13 cm out
    const shade = (Ld) => {
      const o = float(1.0).toVar();
      If(near.greaterThan(0.0).and(res.w.lessThan(-0.002)), () => {
        const hl = max(length(Ld.xz), 1e-3);
        const dir = Ld.xz.div(hl).toVar();
        const tanE = max(Ld.y.div(hl), 0.0).toVar();
        const occ = float(-1.0).toVar();
        for (const t of [0.03, 0.07, 0.13]) {
          occ.assign(max(occ, S(L.add(dir.mul(t / size))).x.sub(res.w).sub(tanE.mul(t))));
        }
        // never a black hole: the sky still reaches into a print, and the shadow edge is soft
        o.assign(float(1.0).sub(smoothstep(-0.001, 0.01, occ).mul(0.8).mul(near)));
      });
      return o;
    };
    return { grad: res.xy, disturb: res.z, shade };
  }

  return {
    hook, update: update_, uC,
    stamp(e) { queue.push(e); if (queue.length > 64) queue.splice(0, queue.length - 64); },
    get centre() { return [...centre]; },
    get passes() { return passes; },
    get queued() { return queue.length; },
    target() { return rts[cur]; },
    texel, clear: () => { clearAll(); initialised = false; },
    dispose() { for (const rt of rts) rt.dispose(); update.dispose(); quad.geometry.dispose(); },
  };
}
