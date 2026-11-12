// Dust Sea walk: the trace map. What your feet do to the sand, in a texture that follows you.
//
// Two plain half-float render targets (ping-pong, so it runs the same on WebGPU and WebGL2), N x N
// texels over `size` metres, centred on the walker and moved only in whole texels (the window
// snaps to the texel lattice, so a print never smears as you walk). Each texel holds:
//   R  the ground's displacement in metres (a print's dent is negative, its rim positive)
//   G  how disturbed the sand is, 0..1 (ripples are trodden out; it heals with the dent)
//   B  how fast this texel heals (1 in a trough, up to ~2.4 on an exposed crest; set by the stamp)
//   A  third person: a slide scar's avalanched sand (0..1; it heals with the dent), darkened at any
//      distance so the scar reads where its low relief does not; the pour (pour.js) folds the sand
//      its tongues drop into A and G, so the scar keeps their lobed edge. The ground also draws the
//      pour's flowing sand (hook below)
// One pass per frame at most, and only when something changed: it copies the old window into the
// new one (integer texel shift), heals it (4 times a second: the dent fills, and a 4-neighbour blur
// softens its walls; a half float cannot hold a per-frame decay of 1/1500, a quarter-second step it
// can), and stamps this frame's footfalls and slide marks.
//
// The r186 v-flip (look-test RESULTS.md): a target written by a full-screen quad at uv() and read at
// the same uv comes back upside down in WebGPURenderer, on both backends. So every read here and in
// the ground is at (u, 1 - v): the logical coordinate L is the writing quad's uv().

import * as THREE from 'three/webgpu';
import { Fn, If, uniform, texture, uv, vec2, vec3, vec4, float, clamp, smoothstep, max, min, abs, dot, length, exp, mix, positionLocal, step, floor, fract, hash, mx_noise_float } from 'three/tsl';
import { POUR } from './pour.js';

export const TRACE = {
  N: 1024,            // texels a side
  size: 48,           // metres a side (4.7 cm texels); the trail behind you reads for about 24 m
  tick: 0.25,         // heal step (s)
  tau: 25,            // a trough print fills with this e-folding time (s): 30% left after 30 s, 5% after 75 s
  blur: 0.25,         // per second (times the heal rate): the walls soften by ~12 cm over a minute
  rateCrest: 1.4,     // heal rate = 1 + rateCrest * exposure (a crest heals 2.4x faster)
  edge: 0.08,         // the window fades out over this fraction of its width at each side
  slots: 4,           // stamps per pass
  farTone: 0,         // third person: where the relief no longer reads (a pixel wider than ~2 texels),
                      // trodden sand is darkened by up to this much, so a trail still reads 40 m off
  scarTone: 0.26,     // third person: a slide scar's avalanched sand is this much darker, at any distance
  scarShade: 0.8,     // third person: how dark a scar's own shadow gets (0.8: a print's)
  carve: false,       // third person: slide stamps carve (a dent never filled by a later stamp's berm,
                      // a berm only on untouched sand) and their walls are lobed; see slideShape
};

export function createTrace(renderer, pour = null) {
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
  // the same, for the ground's vertex stage (an explicit uv: without one, r186's WebGL2 backend looks
  // for a uv attribute the clipmap does not have)
  const readV = texture(rts[0].texture, vec2(0.5));

  // ---- the update pass
  const uShift = uniform(new THREE.Vector2());   // (new centre - old centre) / size
  const uHeal = uniform(new THREE.Vector2());    // (step seconds, 1 if this pass heals)
  const uTC = uniform(new THREE.Vector2());      // world centre of the window being written (the pour fold)
  const slotA = [], slotB = [], slotC = [];
  for (let i = 0; i < TRACE.slots; i++) {
    slotA.push(uniform(new THREE.Vector4()));  // x, z (metres from the new centre), dir x, dir z
    slotB.push(uniform(new THREE.Vector4()));  // kind (0 none, 1 foot, 2 slide), depth, run | width, heal rate
    slotC.push(uniform(new THREE.Vector4()));  // slide: end x, z, berm height (0: the default 0.35 of the depth); foot: side
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
    const bk = mix(float(0.35), C.z, step(1e-4, C.z));
    const berm = Bv.y.mul(bk).mul(exp(dd.sub(W.mul(1.12)).div(W.mul(0.22)).mul(dd.sub(W.mul(1.12)).div(W.mul(0.22))).negate()));
    const cover = float(1.0).sub(smoothstep(W.mul(1.35), W.mul(1.6), dd));
    return vec2(dent.add(berm), cover);
  };

  // third person (TRACE.carve): the slide's groove as a carve. Returns vec3(dent <= 0, berm >= 0, cover).
  // Its width wanders with a noise fixed on the ground, so the walls are lobed from the first frame;
  // the walls are soft (a wide smoothstep), and the berm sits only on the sides, never across the
  // groove behind (the caller never lets a berm fill a dent), so a slide that stops leaves no ring.
  const carveShape = (p, w, A, Bv, C) => {
    const a = A.xy, b = C.xy;
    const ab = b.sub(a);
    const t = clamp(dot(p.sub(a), ab).div(max(dot(ab, ab), 1e-6)), 0.0, 1.0);
    const dd = length(p.sub(a.add(ab.mul(t)))).toVar();
    const lob = mx_noise_float(vec3(w.mul(2.2), 1.7)).mul(0.28).add(mx_noise_float(vec3(w.mul(6.5), 4.1)).mul(0.12));
    const W = Bv.z.mul(lob.add(1.0)).toVar();
    const dent = Bv.y.mul(mx_noise_float(vec3(w.mul(4.0), 8.3)).mul(0.25).add(1.0)).mul(float(1.0).sub(smoothstep(W.mul(0.15), W.mul(1.05), dd))).negate();
    const bk = mix(float(0.35), C.z, step(1e-4, C.z));
    const bz = dd.sub(W.mul(1.15)).div(W.mul(0.3));
    const berm = Bv.y.mul(bk).mul(exp(bz.mul(bz).negate())).mul(smoothstep(W.mul(0.85), W.mul(1.05), dd));
    const cover = float(1.0).sub(smoothstep(W.mul(1.45), W.mul(1.75), dd));
    return vec3(dent, berm, cover);
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
      c.assign(vec4(r, g, c.z, c.w.mul(exp(T.div(-TRACE.tau * 1.3)))));
    });
    // stamps, in metres from the new centre
    const p = L.sub(0.5).mul(size).toVar();
    for (let i = 0; i < TRACE.slots; i++) {
      const A = slotA[i], Bv = slotB[i], C = slotC[i];
      If(Bv.x.greaterThan(0.5), () => {
        const sh = vec2(0.0).toVar();
        if (TRACE.carve) {
          // a scar (C.w > 0) carves; other slide-type stamps (the staff, the hem) keep their shape
          If(Bv.x.greaterThan(1.5).and(C.w.greaterThan(0.0)), () => {
            // only near the segment (the noise is not paid across the whole map)
            const ab = C.xy.sub(A.xy);
            const tt = clamp(dot(p.sub(A.xy), ab).div(max(dot(ab, ab), 1e-6)), 0.0, 1.0);
            If(length(p.sub(A.xy.add(ab.mul(tt)))).lessThan(Bv.z.mul(2.4)), () => {
            const k = carveShape(p, uTC.add(p), A, Bv, C).toVar();
            If(k.z.greaterThan(0.0), () => {
              const inGroove = smoothstep(-0.002, -0.01, c.x);
              const x = min(c.x, k.x).toVar();
              x.assign(mix(x, max(x, k.y), step(1e-4, k.y).mul(float(1.0).sub(inGroove))));
              c.assign(vec4(mix(c.x, x, k.z), max(c.y, k.z), mix(c.z, Bv.w, k.z), max(c.w, k.z.mul(C.w))));
            });
            });
          }).Else(() => {
            If(Bv.x.lessThan(1.5), () => { sh.assign(footShape(p, A, Bv)); }).Else(() => { sh.assign(slideShape(p, A, Bv, C)); });
            If(sh.y.greaterThan(0.0), () => {
              c.assign(vec4(mix(c.x, sh.x, sh.y), max(c.y, sh.y), mix(c.z, Bv.w, sh.y), max(c.w, sh.y.mul(C.w))));
            });
          });
        } else {
          If(Bv.x.lessThan(1.5), () => { sh.assign(footShape(p, A, Bv)); }).Else(() => { sh.assign(slideShape(p, A, Bv, C)); });
          If(sh.y.greaterThan(0.0), () => {
            c.assign(vec4(mix(c.x, sh.x, sh.y), max(c.y, sh.y), mix(c.z, Bv.w, sh.y), max(c.w, sh.y.mul(C.w))));
          });
        }
      });
    }
    // third person: the pour's stopped sand (its lobes) becomes avalanched sand here, kept long after
    if (pour) {
      If(pour.uOn.greaterThan(0.5), () => {
        const pl = pour.at(uTC.add(p)).toVar();
        const pd = pour.S(pl).y.mul(pour.inside(pl)).toVar();
        // its lobes also settle into the groove (its walls slump in: it can be no deeper than the
        // sand left there allows) and lie a few millimetres proud on open sand
        If(pd.greaterThan(0.01), () => {
          const x = max(c.x, float(-0.075).mul(float(1.0).sub(pd.mul(0.45)))).toVar();
          x.assign(mix(x, max(x, pd.mul(0.006)), step(-0.001, x)));
          c.assign(vec4(x, max(c.y, pd), c.z, max(c.w, pd)));
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
        slotC[i].value.set(e.x1 - nx, e.z1 - nz, e.berm ?? 0, e.scar ?? 0);
      }
    }
    uTC.value.set(nx, nz);
    src.value = rts[cur].texture;
    const dst = 1 - cur;
    renderer.setRenderTarget(rts[dst]); renderer.render(scene, cam); renderer.setRenderTarget(null);
    cur = dst; centre[0] = nx; centre[1] = nz;
    read.value = rts[cur].texture; readV.value = rts[cur].texture;
    uC.value.set(nx, nz);
    passes++;
    return true;
  }

  // ---- the ground's view of it (tsl-material.js opts.walk.trace)
  const uC = uniform(new THREE.Vector2());
  const S = (l) => read.sample(vec2(l.x, float(1.0).sub(l.y))).level(0);
  function hook({ xz, fw, grad = null }) {
    const L = xz.sub(uC).div(size).add(0.5).toVar();
    const ed = TRACE.edge;
    const inWin = smoothstep(0.0, ed, L.x).mul(smoothstep(0.0, ed, float(1.0).sub(L.x)))
      .mul(smoothstep(0.0, ed, L.y)).mul(smoothstep(0.0, ed, float(1.0).sub(L.y))).toVar();
    // relief reads while a pixel is smaller than about two texels; beyond, only the disturbed tone
    const near = float(1.0).sub(smoothstep(texel * 1.0, texel * 3.0, fw)).mul(inWin).toVar();
    const res = vec4(0.0).toVar();   // slope x, slope z, disturbed, displacement
    const scar = float(0.0).toVar();
    If(inWin.greaterThan(0.0), () => {
      const c = S(L).toVar();
      res.assign(vec4(0.0, 0.0, c.y.mul(inWin), c.x));
      if (TRACE.farTone > 0) scar.assign(c.w.mul(inWin));
      If(near.greaterThan(0.0), () => {
        const e = max(1 / N, fw.div(size)).toVar();
        const gx = S(L.add(vec2(e, 0.0))).x.sub(S(L.sub(vec2(e, 0.0))).x);
        const gz = S(L.add(vec2(0.0, e))).x.sub(S(L.sub(vec2(0.0, e))).x);
        res.assign(vec4(gx.div(e.mul(2.0 * size)).mul(near), gz.div(e.mul(2.0 * size)).mul(near), res.z, res.w));
      });
    });
    // third person: the pour's flowing sand here (read before the shade, which it also casts)
    const pl = pour ? pour.at(xz).toVar() : null;
    const pin = pour ? pour.inside(pl).mul(pour.uOn).toVar() : null;
    const pm = pour ? float(0.0).toVar() : null;
    const pg = pour ? vec2(0.0).toVar() : null, ptone = pour ? float(1.0).toVar() : null, pdis = pour ? float(0.0).toVar() : null;
    const pj = pour ? float(0.0).toVar() : null;   // the moving sand's grain, in metres (it breaks a shadow's edge)
    if (pour) {
      // the pour: flowing sand in relief (the ground mesh is displaced by it, and its slopes catch
      // the low sun: a lit lip on a front, a shaded lee behind it), a little darker and rougher than
      // the face, with grains and small clumps that travel downslope with it (a flow map)
      If(pin.greaterThan(0.0), () => {
        const pc = pour.S(pl).toVar();
        const m = pc.x.mul(pin).toVar();
        pm.assign(m);
        If(m.greaterThan(0.002), () => {
          const pnear = float(1.0).sub(smoothstep(0.03, 0.12, fw)).toVar();
          const rel = pl.sub(0.5).mul(pour.size).toVar();   // metres from the pour's centre (a whole number of cells)
          const T = 0.45, ph = fract(pour.uT.div(T)).toVar(), ph2 = fract(pour.uT.div(T).add(0.5)).toVar();
          const gw = float(1.0).sub(abs(ph.mul(2.0).sub(1.0)));
          // round grains: one dot per cell, jittered, sized and toned by a hash (never a square)
          const cell = (o, s, k) => {
            const q = rel.sub(o).div(s).add(2000.0), c = floor(q), f = q.sub(c).sub(0.5);
            const id = c.x.add(c.y.mul(4096.0)).add(k);
            const h1 = hash(id), h2 = hash(id.add(0.37)), h3 = hash(id.add(0.71));
            const r = h3.mul(0.16).add(0.14);
            const dot = float(1.0).sub(smoothstep(r.mul(0.5), r, length(f.sub(vec2(h1, h2).sub(0.5).mul(0.5)))));
            return dot.mul(h1.add(h3).sub(1.0)).add(0.5);   // as many dark grains as light ones
          };
          // clumps: a soft lumpy noise carried with the flow
          const lumps = (o, k) => mx_noise_float(vec3(rel.sub(o).div(0.07), k)).mul(0.5).add(0.5);
          const o1 = pc.zw.mul(ph.mul(T)), o2 = pc.zw.mul(ph2.mul(T));
          // grains (2.5 cm) and clumps (7 cm), both carried with the flow
          const grain = mix(cell(o2, 0.025, 0.0), cell(o1, 0.025, 0.0), gw).sub(0.5).mul(pnear.mul(0.7).add(0.3)).toVar();
          const clump = mix(lumps(o2, 17.0), lumps(o1, 17.0), gw).sub(0.5).mul(float(1.0).sub(smoothstep(0.06, 0.3, fw)).mul(0.8).add(0.2)).toVar();
          const body = smoothstep(0.0, 0.12, m.add(grain.mul(0.08)).add(clump.mul(0.08))).toVar();     // a grainy edge, never a ruled one
          pdis.assign(smoothstep(0.0, 0.08, m));
          pj.assign(clump.mul(body).mul(0.045).add(grain.mul(body).mul(0.015)));
          // the relief's slope, over at least a pixel (no shimmer when it is far)
          const eg = max(1 / POUR.N, fw.div(pour.size).mul(0.75)).toVar();
          const gx = pour.S(pl.add(vec2(eg, 0.0))).x.sub(pour.S(pl.sub(vec2(eg, 0.0))).x);
          const gz = pour.S(pl.add(vec2(0.0, eg))).x.sub(pour.S(pl.sub(vec2(0.0, eg))).x);
          const gm = vec2(gx, gz).mul(pin).div(eg.mul(2.0 * pour.size)).toVar();      // units of m per metre
          const vd = pc.zw.div(max(length(pc.zw), 0.05));
          const moving = smoothstep(0.1, 0.6, length(pc.zw)).toVar();
          // a front: fresh grains rolling over its lip, paler
          const rim = smoothstep(0.3, 2.5, dot(gm, vd).negate()).mul(moving.mul(0.6).add(0.4)).toVar();
          ptone.assign(float(1.0).sub(body.mul(0.2)).add(grain.mul(body).mul(0.32)).add(clump.mul(body).mul(moving.mul(0.25).add(0.15))).add(rim.mul(0.1)));
          // the slope the light sees: strong near, eased off once a pixel is wider than a few texels
          pg.assign(gm.mul(POUR.relief).mul(float(1.0).sub(smoothstep(0.08, 0.5, fw)).mul(0.75).add(0.25)));
        });
      });
    }
    // a print's own shadow toward a light: three taps along the light, 3 to 13 cm out; in third
    // person a slide scar's shadow is weaker (its walls are soft, not cut), and the pour's relief
    // casts its own: a front's lee is shaded at a low sun
    const shade = (Ld) => {
      const o = float(1.0).toVar();
      If(near.greaterThan(0.0).and(res.w.lessThan(-0.002)), () => {
        const hl = max(length(Ld.xz), 1e-3);
        const dir = Ld.xz.div(hl).toVar();
        // third person: the ray's rise over the sand's own slope along it (a dent on a face turned to
        // a low sun is lit nearly to its floor; first person keeps the flat-ground rise)
        const tanE = (TRACE.carve && grad ? max(Ld.y.div(hl).sub(dot(grad, dir)), 0.0) : max(Ld.y.div(hl), 0.0)).toVar();
        const occ = float(-1.0).toVar();
        for (const t of [0.03, 0.07, 0.13]) {
          occ.assign(max(occ, S(L.add(dir.mul(t / size))).x.sub(res.w).sub(tanE.mul(t))));
        }
        // never a black hole: the sky still reaches into a print, and the shadow edge is soft
        const k = TRACE.scarShade < 0.8 ? mix(float(0.8), float(TRACE.scarShade), smoothstep(0.05, 0.3, scar)) : float(0.8);
        o.assign(float(1.0).sub(smoothstep(-0.001, 0.01, occ).mul(k).mul(near)));
      });
      if (pour && grad) {
        If(pin.greaterThan(0.0).and(fw.lessThan(0.4)), () => {
          const hl = max(length(Ld.xz), 1e-3);
          const dir = Ld.xz.div(hl).toVar();
          // the ray's rise over the face's own slope along it (the face itself is the baked map's job)
          const rise = max(Ld.y.div(hl).sub(dot(grad, dir)), 0.0).toVar();
          const occ = float(-1.0).toVar();
          for (const t of [0.05, 0.12, 0.24]) {
            occ.assign(max(occ, pour.S(pl.add(dir.mul(t / POUR.size))).x.sub(pm).mul(POUR.relief).sub(rise.mul(t))));
          }
          o.mulAssign(float(1.0).sub(smoothstep(0.0, 0.012, occ).mul(0.6).mul(pin).mul(float(1.0).sub(smoothstep(0.15, 0.4, fw)))));
        });
      }
      return o;
    };
    const out = { grad: res.xy, disturb: res.z, shade };
    // relief fades with distance; the disturbed tone takes over (dents darker than the rim)
    if (TRACE.farTone > 0) out.tone = float(1.0).sub(res.z.mul(float(1.0).sub(near.div(max(inWin, 1e-3)))).mul(TRACE.farTone).mul(smoothstep(0.0, -0.012, res.w).mul(0.6).add(0.4)))
      .mul(float(1.0).sub(scar.mul(TRACE.scarTone)));
    if (pour) {
      // the sand's surface above the formula's (the figure's shadow is cast onto it)
      out.disp = res.w.add(pm.mul(POUR.relief)).add(pj);
      out.grad = out.grad.add(pg);
      out.disturb = max(out.disturb, pdis);
      out.tone = (out.tone || float(1.0)).mul(ptone);
    }
    return out;
  }

  // third person: the slide scar's relief in metres (the ground mesh is displaced by it, so the groove
  // is a real trough seen from the side; prints stay in the shading only)
  function scarDisp(xz) {
    const L = xz.sub(uC).div(size).add(0.5);
    const ed = TRACE.edge;
    const inWin = smoothstep(0.0, ed, L.x).mul(smoothstep(0.0, ed, float(1.0).sub(L.x))).mul(smoothstep(0.0, ed, L.y)).mul(smoothstep(0.0, ed, float(1.0).sub(L.y)));
    const c = readV.sample(vec2(L.x, float(1.0).sub(L.y))).level(0);
    return c.x.mul(smoothstep(0.02, 0.12, c.w)).mul(inWin);
  }

  return {
    hook, update: update_, uC, scarDisp,
    stamp(e) { queue.push(e); if (queue.length > 64) queue.splice(0, queue.length - 64); },
    get centre() { return [...centre]; },
    get passes() { return passes; },
    get queued() { return queue.length; },
    target() { return rts[cur]; },
    texel, clear: () => { clearAll(); initialised = false; },
    dispose() { for (const rt of rts) rt.dispose(); update.dispose(); quad.geometry.dispose(); },
  };
}
