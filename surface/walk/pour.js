// Dust Sea walk: the pour. Sand avalanching down a slip face around a sliding Pilgrim (third person).
//
// A small flow simulation in a texture that follows the figure (512 x 512 texels over 25.6 m, 5 cm
// texels, moved in whole texels like the trace map). Each texel holds:
//   R  m   flowing sand, roughly its thickness in units of 3 cm (0 none, ~1 a thick tongue)
//   G  d   sand that has stopped here (the lobes the flows leave behind), 0..1
//   B, A   the flow's velocity, x and z (m/s)
// One pass per frame while there is anything to do:
//   - advect: the texel takes what was upstream of it (semi-Lagrangian, along its own velocity);
//     a little sideways spread widens a tongue as it runs
//   - drive: velocity relaxes toward the fall line (from the ground's own height formula) at a speed
//     that grows with the slope and the thickness: thin sheets on gentler sand slow and stop, thick
//     tongues keep running, so fronts form, round off and outrun the sheet behind them
//   - drain: moving sand drops some of itself, slow sand far more; what drops becomes d
//   - source: the figure ploughs sand loose at its feet, in pulses that vary across its width (the
//     tongues), at its own speed; behind it the walls of its groove slump and release small tongues
// The ground reads m (relief: the tongue's body and its front catch the light; a grain speckle that
// creeps with the flow; ripples smothered) and the trace pass folds d into the trace map, where the
// lobes stay as darker, smoother sand.
//
// The r186 v-flip (look-test RESULTS.md): every read of a target written by the full-screen quad is
// at (u, 1 - v); the logical coordinate L is the writing quad's uv().

import * as THREE from 'three/webgpu';
import { Fn, If, uniform, texture, uv, vec2, vec4, float, clamp, smoothstep, max, min, abs, dot, length, exp, mix, positionLocal, step,
  normalize, mx_noise_float, vec3 } from 'three/tsl';

export const POUR = {
  N: 512, size: 25.6,       // texels a side, metres a side
  vTerm: 2.2,               // a thick tongue's running speed on a full slip face (m/s)
  tauV: 0.5,                // velocity relaxes toward the fall line with this time constant (s)
  drainMove: 0.28, drainSlow: 1.3,   // per second: what moving / stopping sand drops
  spread: 0.22,             // sideways spread per pass
  frontSpread: 0.4,         // extra spread at a stopping front (the head widens and rounds)
  tipSlow: 0.55,            // a front runs this much slower than the sand behind it (it piles up)
  visc: 0.45,               // velocity smoothing across a tongue per pass (thin edges keep pace)
  vary: 0.75,               // cross-slope variation in running speed (lanes of the face)
  mMax: 2.0,                // thickest sand (a piled-up head)
  depTau: 14,               // d fades with this e-folding time (s); the trace keeps it far longer
  idle: 8,                  // seconds after the last slide before the passes stop
  relief: 0.045,            // m of relief per unit of m (the ground is displaced by it, and lit by it)
};

export function createPour(renderer) {
  const { N, size } = POUR;
  const texel = size / N;
  const mk = () => {
    const rt = new THREE.RenderTarget(N, N, { depthBuffer: false, generateMipmaps: false, type: THREE.HalfFloatType });
    rt.texture.type = THREE.HalfFloatType; rt.texture.format = THREE.RGBAFormat;
    rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter;
    rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
  };
  const rts = [mk(), mk()];
  let cur = 0;
  const src = texture(rts[0].texture);    // read by the update pass (swapped)
  const read = texture(rts[0].texture);   // read by the ground and the trace pass (swapped)
  const readV = texture(rts[0].texture, vec2(0.5));   // the same for the ground's vertex stage (see trace.js)

  const uShift = uniform(new THREE.Vector2());   // (new centre - old centre) / size
  const uC = uniform(new THREE.Vector2());       // world centre of the window being written
  const uRC = uniform(new THREE.Vector2());      // world centre of the window the readers see
  const uFig = uniform(new THREE.Vector4());     // figure x, z (metres from the new centre), slide amount, speed (m/s)
  const uDir = uniform(new THREE.Vector4());     // slide direction x, z; dt; time
  const uOn = uniform(0);                        // 1 while the readers should look at it

  const rd = (l) => src.sample(vec2(l.x, float(1.0).sub(l.y))).level(0);
  let mat = null, scene = null, quad = null;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // the update pass is built once the ground's height formula is known (setHeight)
  function build(heightD) {
    mat = new THREE.MeshBasicNodeMaterial({ depthWrite: false, depthTest: false });
    mat.vertexNode = vec4(positionLocal.xy, 0.0, 1.0);
    mat.fragmentNode = Fn(() => {
      const L = uv().toVar();
      const Lp = L.add(uShift).toVar();
      const dt = uDir.z, t = uDir.w;
      const p = L.sub(0.5).mul(size).toVar();                // metres from the new centre
      const c0 = rd(Lp).toVar();
      const inb = step(0.0, Lp.x).mul(step(Lp.x, 1.0)).mul(step(0.0, Lp.y)).mul(step(Lp.y, 1.0)).toVar();
      c0.mulAssign(inb);
      const vel = c0.zw.toVar();
      const wq = uC.add(p).toVar();                             // world x, z of this texel
      // advect: take what was upstream
      const Lu = Lp.sub(vel.mul(dt.div(size))).toVar();
      const cu = rd(Lu).mul(inb).toVar();
      const e = 1 / N;
      const nE = rd(Lu.add(vec2(e, 0.0))).mul(inb).toVar(), nW = rd(Lu.sub(vec2(e, 0.0))).mul(inb).toVar();
      const nN = rd(Lu.add(vec2(0.0, e))).mul(inb).toVar(), nS = rd(Lu.sub(vec2(0.0, e))).mul(inb).toVar();
      const side = nE.x.add(nW.x).add(nN.x).add(nS.x).mul(0.25);
      // a stopping front: little sand just ahead along the flow (one more tap, 2.5 texels on)
      const vdir = vel.div(max(length(vel), 0.05)).toVar();
      const mAhead = rd(Lp.add(vdir.mul(2.5 * e))).x.mul(inb);
      const front = float(1.0).sub(smoothstep(0.15, 0.7, mAhead.div(c0.x.add(0.02)))).mul(smoothstep(0.02, 0.15, c0.x)).toVar();
      // a front spreads sideways as it slows (the head widens and rounds instead of running to a point)
      const m = mix(cu.x, side, front.mul(POUR.frontSpread).add(POUR.spread)).toVar();
      // where the flow converges (a slowing head with faster sand behind) the sand piles up
      const div = nE.z.sub(nW.z).add(nN.w.sub(nS.w)).div(2.0 * texel);
      m.mulAssign(clamp(exp(div.mul(dt).negate()), 0.8, 1.25));
      // the flow drags its neighbours: velocity is smoothed across the tongue (mass weighted), so the
      // thin edges keep pace with the thick middle and the head stays round
      const mw = nE.x.add(nW.x).add(nN.x).add(nS.x).toVar();
      const vs = nE.zw.mul(nE.x).add(nW.zw.mul(nW.x)).add(nN.zw.mul(nN.x)).add(nS.zw.mul(nS.x)).div(max(mw, 1e-4));
      const v = mix(cu.zw, vs, step(1e-3, mw).mul(POUR.visc)).toVar();
      // the slope here (the ground's own formula), and the fall line
      const g = heightD(wq).yz.toVar();
      const sl = length(g).toVar();
      const fall = g.negate().div(max(sl, 1e-4)).toVar();
      const steep = smoothstep(0.36, 0.6, sl);
      const thick = smoothstep(0.0, 0.25, m);
      // cross-slope variation: lanes of the face run faster or slower (patchy, fixed on the face), so
      // neighbouring tongues reach different lengths and their fronts are staggered
      const lane = mx_noise_float(vec3(wq.mul(0.85), 2.0)).mul(0.6).add(mx_noise_float(vec3(wq.mul(2.3), 9.0)).mul(0.25));
      const vary = clamp(lane.mul(POUR.vary).add(1.0), 0.45, 1.5);
      // the running speed: a thick tongue keeps pace with a sliding figure; once it stops, the sand
      // runs on at its own pace and slows to a stop where the face eases; a front is slowed, so the
      // sand behind it catches up and the head thickens
      const vT = float(POUR.vTerm);
      const vt = fall.mul(steep.mul(thick).mul(vT).mul(vary).mul(float(1.0).sub(front.mul(POUR.tipSlow)))).toVar();
      v.assign(mix(v, vt, float(1.0).sub(exp(dt.negate().div(thick.mul(0.8).add(0.2).mul(POUR.tauV))))));
      // drain: moving sand drops a little, slow sand most of itself
      const spd = length(v);
      // (very thin sand drops out fast too: no wisps running on ahead of a tongue)
      const rate = float(POUR.drainMove).add(float(POUR.drainSlow).mul(float(1.0).sub(smoothstep(0.15, 0.9, spd))))
        .add(float(1.0).sub(smoothstep(0.02, 0.1, m)).mul(1.6));
      const dm = m.mul(float(1.0).sub(exp(rate.mul(dt).negate()))).toVar();
      m.subAssign(dm);
      const d = c0.y.mul(exp(dt.div(-POUR.depTau))).add(dm.mul(1.6)).toVar();
      // sources (only near the figure)
      const q = p.sub(uFig.xy).toVar();
      If(dot(q, q).lessThan(30.0).and(uFig.z.greaterThan(0.01)), () => {
        const S = uDir.xy, Pp = vec2(S.y.negate(), S.x);
        const al = dot(q, S).toVar(), pe = dot(q, Pp).toVar();
        const k = uFig.z, sp = uFig.w;
        // the bow: the face fails in a sheet at the figure's feet and either side, in pulses that vary
        // across its width (the tongues); it is thrown a little ahead and fans out
        // released in patches fixed on the face (each slab fails once, as the bow passes over it), so
        // the sheet breaks into separate tongues of different sizes rather than continuous lanes
        const n1 = mx_noise_float(vec3(wq.mul(1.7), 1.0)).add(mx_noise_float(vec3(wq.mul(4.1), t.mul(0.8))).mul(0.3)).toVar();
        const n3 = mx_noise_float(vec3(wq.mul(1.1).add(11.0), 5.0)).toVar();   // how far ahead this one is thrown
        const bow = exp(al.sub(0.4).div(0.65).mul(al.sub(0.4).div(0.65)).negate()).mul(exp(pe.div(1.15).mul(pe.div(1.15)).negate()));
        const s1 = bow.mul(smoothstep(0.0, 0.45, n1)).mul(k).mul(dt).mul(17.0).toVar();
        // the groove's walls slump behind it: small tongues released from either side, falling in
        const n2 = mx_noise_float(vec3(wq.mul(2.6).add(7.0), t.mul(0.6).add(3.0))).toVar();
        const wall = smoothstep(-5.0, -0.8, al).mul(float(1.0).sub(smoothstep(-0.4, 0.2, al)))
          .mul(smoothstep(0.2, 0.42, abs(pe))).mul(float(1.0).sub(smoothstep(1.2, 2.0, abs(pe))));
        const s2 = wall.mul(smoothstep(0.2, 0.55, n2)).mul(k).mul(dt).mul(8.0).toVar();
        const sTot = s1.add(s2);
        const mNew = min(m.add(sTot), POUR.mMax);
        const fan = Pp.mul(pe.mul(0.6).mul(sp));
        const inward = Pp.mul(pe.negate().div(max(abs(pe), 0.05)).mul(0.7));     // a slump falls toward the groove
        const vIn = S.mul(sp.mul(n3.mul(0.3).add(0.8))).add(fan).mul(s1).add(fall.mul(1.1).add(inward).mul(s2));
        v.assign(v.mul(m).add(vIn).div(max(m.add(sTot), 1e-4)));
        m.assign(mNew);
      });
      m.assign(min(m, POUR.mMax).mul(step(0.003, m)));
      return vec4(m, min(d, 1.0), v.mul(step(0.003, m)));
    })();
    scene = new THREE.Scene();
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    scene.add(quad);
  }

  const clearAll = () => {
    for (const rt of rts) { renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); }
    renderer.setRenderTarget(null);
  };
  clearAll();

  const centre = [0, 0];
  let idle = 1e9, t = 0, passes = 0, initialised = false, heightD = null;
  const snap = (x) => Math.round(x / texel) * texel;

  // one frame. f: { x, z, sx, sz, amount, speed }. Returns true if a pass ran.
  function update(dt, f) {
    if (!heightD) return false;
    if (!mat) build(heightD);
    const active = f.amount > 0.02;
    idle = active ? 0 : idle + dt;
    if (idle > POUR.idle) { uOn.value = 0; return false; }
    const nx = snap(f.x), nz = snap(f.z);
    if (!initialised) { clearAll(); centre[0] = nx; centre[1] = nz; initialised = true; }
    t += dt;
    uShift.value.set((nx - centre[0]) / size, (nz - centre[1]) / size);
    uC.value.set(nx, nz);
    const sv = Math.hypot(f.sx, f.sz);
    if (sv > 0.05) uDir.value.set(f.sx / sv, f.sz / sv, dt, t); else uDir.value.set(uDir.value.x, uDir.value.y, dt, t);
    uFig.value.set(f.x - nx, f.z - nz, active ? f.amount : 0, f.speed);
    src.value = rts[cur].texture;
    const dst = 1 - cur;
    renderer.setRenderTarget(rts[dst]); renderer.render(scene, cam); renderer.setRenderTarget(null);
    cur = dst; centre[0] = nx; centre[1] = nz;
    read.value = rts[cur].texture; readV.value = rts[cur].texture;
    uRC.value.set(nx, nz);
    uOn.value = 1;
    passes++;
    return true;
  }
  // after a long idle the window is stale: start clean next time
  function stale() { if (idle > POUR.idle && initialised) { initialised = false; } }

  // ---- readers: logical coordinate of a world point, and the sample there
  const at = (xz) => xz.sub(uRC).div(size).add(0.5);
  const S = (l) => read.sample(vec2(l.x, float(1.0).sub(l.y))).level(0);
  const inside = (L) => smoothstep(0.0, 0.04, L.x).mul(smoothstep(0.0, 0.04, float(1.0).sub(L.x))).mul(smoothstep(0.0, 0.04, L.y)).mul(smoothstep(0.0, 0.04, float(1.0).sub(L.y)));

  return {
    update: (dt, f) => { stale(); return update(dt, f); },
    setHeight(fn) { heightD = fn; },
    // compile the pass before the first slide (then start clean)
    warm() { if (!heightD) return; if (!mat) build(heightD); uDir.value.set(1, 0, 0, 0); uFig.value.set(0, 0, 0, 0); renderer.setRenderTarget(rts[1 - cur]); renderer.render(scene, cam); renderer.setRenderTarget(null); clearAll(); },
    at, S, inside, uOn, texel, size, uT: uDir.w,
    // the flowing sand's thickness in metres at a world point (the ground mesh is displaced by it)
    disp(xz) { const L = at(xz); return readV.sample(vec2(L.x, float(1.0).sub(L.y))).level(0).x.mul(inside(L)).mul(uOn).mul(POUR.relief); },
    get passes() { return passes; },
    get active() { return uOn.value > 0; },
    clear() { clearAll(); initialised = false; idle = 1e9; uOn.value = 0; },
    target() { return rts[cur]; },
  };
}
