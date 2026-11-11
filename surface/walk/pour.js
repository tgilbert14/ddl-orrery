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
  spread: 0.3,              // sideways spread per pass
  depTau: 14,               // d fades with this e-folding time (s); the trace keeps it far longer
  idle: 8,                  // seconds after the last slide before the passes stop
  relief: 0.06,             // m of relief per unit of m
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
      // advect: take what was upstream
      const Lu = Lp.sub(vel.mul(dt.div(size))).toVar();
      const cu = rd(Lu).mul(inb).toVar();
      const e = 1 / N;
      const side = rd(Lu.add(vec2(e, 0.0))).x.add(rd(Lu.sub(vec2(e, 0.0))).x).add(rd(Lu.add(vec2(0.0, e))).x).add(rd(Lu.sub(vec2(0.0, e))).x).mul(0.25).mul(inb);
      const m = mix(cu.x, side, POUR.spread).toVar();
      const v = cu.zw.toVar();
      // the slope here (the ground's own formula), and the fall line
      const g = heightD(uC.add(p)).yz.toVar();
      const sl = length(g).toVar();
      const fall = g.negate().div(max(sl, 1e-4)).toVar();
      const steep = smoothstep(0.36, 0.6, sl);
      const thick = smoothstep(0.02, 0.4, m);
      // the running speed: a thick tongue keeps pace with a sliding figure; once it stops, the sand
      // runs on at its own pace and slows to a stop where the face eases
      const vT = float(POUR.vTerm);
      const vt = fall.mul(steep.mul(thick).mul(vT)).toVar();
      // thin sand loses its speed fast, so a tongue's thick head leads and its front stays round
      v.assign(mix(v, vt, float(1.0).sub(exp(dt.negate().div(thick.mul(0.8).add(0.2).mul(POUR.tauV))))));
      // drain: moving sand drops a little, slow sand most of itself
      const spd = length(v);
      const rate = float(POUR.drainMove).add(float(POUR.drainSlow).mul(float(1.0).sub(smoothstep(0.15, 0.9, spd))));
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
        const n1 = mx_noise_float(vec3(pe.mul(2.0), al.mul(0.6), t.mul(6.0))).toVar();
        const n3 = mx_noise_float(vec3(pe.mul(1.3).add(11.0), t.mul(1.7), 5.0)).toVar();   // how far ahead this one is thrown
        const bow = exp(al.sub(0.45).div(0.6).mul(al.sub(0.45).div(0.6)).negate()).mul(exp(pe.div(1.0).mul(pe.div(1.0)).negate()));
        const s1 = bow.mul(smoothstep(0.15, 0.55, n1)).mul(k).mul(dt).mul(14.0).toVar();
        // the groove's walls slump behind it: tongues released from either side
        const n2 = mx_noise_float(vec3(pe.mul(1.8).add(7.0), al.mul(0.7), t.mul(1.6).add(3.0))).toVar();
        const wall = smoothstep(-5.0, -0.8, al).mul(float(1.0).sub(smoothstep(-0.4, 0.2, al)))
          .mul(smoothstep(0.25, 0.5, abs(pe))).mul(float(1.0).sub(smoothstep(1.4, 2.2, abs(pe))));
        const s2 = wall.mul(smoothstep(0.25, 0.6, n2)).mul(k).mul(dt).mul(7.0).toVar();
        const sTot = s1.add(s2);
        const mNew = min(m.add(sTot), 1.3);
        const fan = Pp.mul(pe.mul(0.5).mul(sp));
        const vIn = S.mul(sp.mul(n3.mul(0.3).add(1.0))).add(fan).mul(s1).add(fall.mul(1.4).mul(s2));
        v.assign(v.mul(m).add(vIn).div(max(m.add(sTot), 1e-4)));
        m.assign(mNew);
      });
      m.assign(m.mul(step(0.003, m)));
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
    read.value = rts[cur].texture;
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
    get passes() { return passes; },
    get active() { return uOn.value > 0; },
    clear() { clearAll(); initialised = false; idle = 1e9; uOn.value = 0; },
    target() { return rts[cur]; },
  };
}
