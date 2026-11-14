// Dust Sea walk: the baked shadow map, re-baked while you walk, without a hitch.
//
// Two log-polar maps, A and B (look-test SHMAP: 1536 x 2304, half float, one horizon value per sun).
// The ground reads both and cross-fades them with uShMix (A at 0, B at 1). When you have walked
// `trigger` metres from the current map's centre, the other map is baked centred `ahead` metres
// along your travel, one band of rows per frame (`slices` frames for the whole map, so no frame pays
// more than 1/slices of a bake), then the ground cross-fades to it over `fade` seconds.
// A time-of-day change uses the same machinery: the other map is baked for the new suns at your
// position, then the lights cross-fade (suns 3 and 4 read the other map, see tsl-material.js) and,
// at the end, the new suns become suns 1 and 2 and the mix jumps to the new map (which they match).
// Each map carries its own centre and its suns' L.y and penumbra k (uShC / uShCB, uShPA / uShPB).

export const SHADOW = {
  slices: 64,         // a full bake spread over this many frames (one bake is ~37 ms on an M5 Pro, so
                      // ~0.6 ms a frame: under one plain frame even in a phone-sized viewport)
  trigger: 9,         // re-bake once you are this far from the current map's centre (m) ...
  ahead: 6,           // ... centring the next map this far ahead along your travel (m), so one map
                      // serves about 15 m of straight walking (the near texels stay under ~4 cm)
  fade: 0.3,          // the ground cross-fades to the new map over this long (s)
};

export function createShadows({ renderer, THREE, mats, rtA, rtB, webgl }) {
  const SH_W = rtA.width, SH_H = rtA.height;
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mats.bake);
  quad.frustumCulled = false;
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const maps = [
    { rt: rtA, centre: null, suns: null, key: '' },
    { rt: rtB, centre: null, suns: null, key: '' },
  ];
  let cur = 0;           // the map suns 1 and 2 read
  let mix = 0;           // uShMix
  let job = null;        // { target, centre, suns, slice, slices, purpose, onDone }
  let fade = null;       // { from, to, t }
  const stats = { bakes: 0, slicesRun: 0, lastJobFrames: 0, state: 'idle' };

  const setMapUniforms = (i) => {
    const m = maps[i];
    const p = [m.suns.L1[1], m.suns.L2[1], m.suns.k1, m.suns.k2];
    if (i === 0) { mats.set('uShC', m.centre); mats.set('uShPA', p); } else { mats.set('uShCB', m.centre); mats.set('uShPB', p); }
  };
  const setBakeUniforms = (centre, suns) => {
    mats.set('uBakeC', centre);
    mats.set('uBakeSun1', suns.L1); mats.set('uBakeSun2', suns.L2);
    mats.set('uBakeK', [suns.k1, suns.k2, suns.on1 ? 1 : 0, suns.on2 ? 1 : 0]);
  };
  // r186: a render into a target clears the WHOLE target first (autoClear), scissor or not, so a
  // sliced bake must turn autoClear off or each slice wipes the slices before it
  const bakeRows = (rt, y0, y1) => {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    if (y0 === 0 && y1 === SH_H) {
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
    } else {
      rt.scissor.set(0, y0, SH_W, y1 - y0); rt.scissorTest = true;
      renderer.setScissorTest(true);
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
      rt.scissorTest = false;
      renderer.setScissorTest(false);
    }
    renderer.autoClear = ac;
  };

  // bake a map in one go (start, teleport, device re-init)
  function bakeNow(i, centre, suns) {
    setBakeUniforms(centre, suns);
    bakeRows(maps[i].rt, 0, SH_H);
    maps[i].centre = [...centre]; maps[i].suns = suns;
    setMapUniforms(i);
    stats.bakes++;
  }

  // compile the sliced bake before anyone walks (a first use mid-walk is a 100+ ms hitch)
  function warm() {
    const m = maps[1];
    setBakeUniforms(m.centre, m.suns);
    bakeRows(m.rt, 0, Math.max(1, Math.floor(SH_H / SHADOW.slices)));
  }

  function reset(centre, suns) {
    job = null; fade = null;
    bakeNow(0, centre, suns);
    bakeNow(1, centre, suns);
    cur = 0; mix = 0; mats.set('uShMix', 0);
    stats.state = 'idle';
  }

  function startJob(centre, suns, purpose, onDone) {
    job = { target: 1 - cur, centre: [...centre], suns, slice: 0, slices: SHADOW.slices, purpose, onDone, frames: 0 };
    stats.state = purpose === 'time' ? 'baking (time)' : 'baking';
  }

  // per frame: returns 'slice' when a slice was baked this frame
  function update(dt, pos, vel, sunsNow, reduced) {
    let did = null;
    if (job) {
      job.frames++;
      if (job.slice === 0) setBakeUniforms(job.centre, job.suns);
      else setBakeUniforms(job.centre, job.suns); // uniforms are shared with nothing else; cheap to repeat
      const y0 = Math.floor((job.slice * SH_H) / job.slices), y1 = Math.floor(((job.slice + 1) * SH_H) / job.slices);
      bakeRows(maps[job.target].rt, y0, y1);
      job.slice++; stats.slicesRun++; did = 'slice';
      if (job.slice >= job.slices) {
        const j = job; job = null;
        maps[j.target].centre = j.centre; maps[j.target].suns = j.suns;
        setMapUniforms(j.target);
        stats.bakes++; stats.lastJobFrames = j.frames;
        if (j.purpose === 'move') { fade = { from: cur, to: j.target, t: 0 }; stats.state = 'cross-fade'; }
        else { stats.state = 'idle'; j.onDone?.(j.target); }
      }
      return did;
    }
    if (fade) {
      fade.t += dt;
      const f = Math.min(1, fade.t / SHADOW.fade);
      const ff = f * f * (3 - 2 * f);
      mix = fade.to === 1 ? ff : 1 - ff;
      mats.set('uShMix', mix);
      if (f >= 1) { cur = fade.to; fade = null; stats.state = 'idle'; }
      return 'fade';
    }
    if (timeBusy) return null;
    const c = maps[cur].centre;
    if (Math.hypot(pos[0] - c[0], pos[1] - c[1]) > SHADOW.trigger) {
      const sp = Math.hypot(vel[0], vel[1]);
      const ax = sp > 0.1 ? (vel[0] / sp) * SHADOW.ahead : 0, az = sp > 0.1 ? (vel[1] / sp) * SHADOW.ahead : 0;
      startJob([pos[0] + ax, pos[1] + az], sunsNow, 'move');
    }
    return null;
  }

  // a time-of-day change: bake the other map for the new suns, then hand over to the caller's light
  // fade (finishTime() at its end)
  let timeBusy = false;
  function beginTime(pos, suns, onBaked) {
    if (fade) { cur = fade.to; mix = cur; mats.set('uShMix', mix); fade = null; }
    timeBusy = true;
    startJob(pos, suns, 'time', (target) => onBaked(target));
  }
  function finishTime(target) {
    cur = target; mix = target; mats.set('uShMix', mix); timeBusy = false;
  }
  function cancelJobs() { job = null; fade = null; timeBusy = false; stats.state = 'idle'; }

  return {
    reset, warm, update, beginTime, finishTime, cancelJobs, stats,
    get busy() { return !!job || !!fade; },
    get current() { return cur; },
    get mix() { return mix; },
    get centres() { return maps.map((m) => m.centre); },
    get job() { return job ? { target: job.target, slice: job.slice, slices: job.slices, purpose: job.purpose } : null; },
    dispose() { quad.geometry.dispose(); },
  };
}
