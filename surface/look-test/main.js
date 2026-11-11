// Dust Sea, step 0: the look test.
// Draws one still frame of the dune sea from standing height, on one of three renderers:
//   r=webgpu  WebGPURenderer on WebGPU (TSL material)
//   r=webgl2  WebGPURenderer with forceWebGL (the same TSL material, compiled to GLSL)
//   r=classic WebGLRenderer from three.module.js (hand-written GLSL ShaderMaterial)
// time=day|dusk|ember, weather=calm|storm, bench=1 to time throughput. No loop runs otherwise.
// Debug switches (round two), compiled into the shaders:
//   shadows=map (default: one baked log-polar shadow texture) | march (round one's per-pixel
//           reference) | off
//   normal=analytic (default) | fd (round one: three full height evaluations per pixel)
//   ripples=1 (default) | 0
//   bake=once (default; a still bakes once) | every (bench only: re-bake before every frame)
//        | sliceN (bench only: bake one Nth of the map's rows before every frame, the cost of a
//          re-bake spread over N frames)
//   aa=0 (round three, cost only): no MSAA, to see what antialiasing costs each renderer
//   grid=N, shmap=WxH, heading=deg, stand=x,z,r, sun1/sun2=relAz,elev: tuning overrides

import { CAM, GRID, SKY, SHMAP, TIMES, WEATHERS, VIEWS, DEG, lookUniforms } from './params.js';
import { height, heightLow, heightD, findCrest, WIND } from './height.js';
import { createGlslMaterials } from './glsl-material.js';

const RENDERERS = ['webgpu', 'webgl2', 'classic'];
const q = new URLSearchParams(location.search);
const readoutEl = document.getElementById('readout');
const state = (window.__lookTest = { ready: false });

function show(lines) { readoutEl.textContent = lines.filter(Boolean).join('\n'); }

function poster(msg, err) {
  const p = document.getElementById('poster');
  p.hidden = false;
  p.querySelector('p').textContent = msg;
  state.error = String(err?.message || err || msg);
  state.ready = true;
  show(['look test did not start', state.error]);
}

function showIndex() {
  const nav = document.getElementById('index');
  nav.hidden = false;
  readoutEl.hidden = true;
  const list = nav.querySelector('ul');
  for (const time of Object.keys(TIMES)) {
    for (const weather of Object.keys(WEATHERS)) {
      const li = document.createElement('li');
      li.append(`${time} / ${weather}: `);
      for (const r of RENDERERS) {
        for (const bench of [false, true]) {
          const a = document.createElement('a');
          a.href = `?r=${r}&time=${time}&weather=${weather}${bench ? '&bench=1' : ''}`;
          a.textContent = bench ? `${r} bench` : r;
          li.append(a, ' ');
        }
      }
      list.append(li);
    }
  }
  // the debug switches, on dusk calm (see the header of this file)
  const li = document.createElement('li');
  li.append('dusk / calm, cost switches (webgpu bench): ');
  for (const [label, extra] of [['shadow march (reference)', '&shadows=march'], ['shadows off', '&shadows=off'],
    ['finite-difference normal', '&normal=fd'], ['ripples off', '&ripples=0'], ['re-bake every frame', '&bake=every'], ['re-bake 1/8 per frame', '&bake=slice8']]) {
    const a = document.createElement('a');
    a.href = `?r=webgpu&time=dusk&weather=calm&bench=1${extra}`;
    a.textContent = label;
    li.append(a, ' ');
  }
  list.append(li);
  state.ready = true;
}

// A camera-centred polar grid: rings spaced so cells stay roughly square,
// a few centimetres apart at the feet and tens of metres apart at the horizon.
function buildGrid(THREE) {
  const S = GRID.segments;
  const ratio = 1 + (2 * Math.PI) / S;
  const radii = [];
  for (let r = GRID.r0; r < GRID.rMax; r *= ratio) radii.push(r);
  radii.push(GRID.rMax);
  const pos = new Float32Array((1 + radii.length * S) * 3);
  let o = 3;
  for (const r of radii) {
    for (let j = 0; j < S; j++) {
      const a = (j / S) * 2 * Math.PI;
      pos[o++] = r * Math.cos(a); pos[o++] = 0; pos[o++] = r * Math.sin(a);
    }
  }
  const idx = new Uint32Array((S + (radii.length - 1) * S * 2) * 3);
  let k = 0;
  for (let j = 0; j < S; j++) { idx[k++] = 0; idx[k++] = 1 + ((j + 1) % S); idx[k++] = 1 + j; }
  for (let i = 0; i < radii.length - 1; i++) {
    const a0 = 1 + i * S, b0 = 1 + (i + 1) * S;
    for (let j = 0; j < S; j++) {
      const j1 = (j + 1) % S;
      idx[k++] = a0 + j; idx[k++] = a0 + j1; idx[k++] = b0 + j;
      idx[k++] = a0 + j1; idx[k++] = b0 + j1; idx[k++] = b0 + j;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return { geometry: g, vertices: pos.length / 3, triangles: idx.length / 3 };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function run() {
  const rName = q.get('r') || 'webgpu';
  const time = q.get('time') || 'dusk';
  const weather = q.get('weather') || 'calm';
  const bench = q.get('bench') === '1';
  const opts = {
    shadows: q.get('shadows') || 'map',
    normal: q.get('normal') || 'analytic',
    ripples: q.get('ripples') !== '0',
    bakeEvery: q.get('bake') === 'every',
    bakeSlices: /^slice(\d+)$/.test(q.get('bake') || '') ? +q.get('bake').slice(5) : 0,
  };
  // shmap=WxH overrides the shadow-map size (for measuring the bake cost against edge quality)
  // grid=N overrides the number of grid segments around the camera (for measuring mesh cost)
  if (/^\d{3,4}$/.test(q.get('grid') || '')) GRID.segments = +q.get('grid');
  const shm = /^(\d{3,4})x(\d{3,4})$/.exec(q.get('shmap') || '');
  if (shm) { SHMAP.w = +shm[1]; SHMAP.h = +shm[2]; }
  if (!RENDERERS.includes(rName) || !TIMES[time] || !WEATHERS[weather]
    || !['map', 'march', 'off'].includes(opts.shadows) || !['analytic', 'fd'].includes(opts.normal)) {
    poster(`unknown look: r=${rName} time=${time} weather=${weather} shadows=${opts.shadows} normal=${opts.normal}`);
    return;
  }
  Object.assign(state, { requested: rName, look: `${time}/${weather}`, bench: bench ? 'pending' : 'off', opts });

  // ---- where to stand: the JS height formula picks a crest and puts the eye 1.7 m above it
  // Stand CAM.back metres upwind of the crest top, on the windward slope: from the brink itself
  // the 31 degree slipface falls away faster than the lowest ray in frame and no near sand shows.
  // a look may stand on another crest (VIEWS[look].stand = [cx, cz, search radius]); stand=cx,cz,r
  // overrides it (tuning only)
  const sm = /^(-?[\d.]+),(-?[\d.]+),([\d.]+)$/.exec(q.get('stand') || '');
  const view = VIEWS[`${time}/${weather}`] || {};
  const stand = sm ? [+sm[1], +sm[2], +sm[3]] : view.stand;
  const top = stand ? findCrest(stand[0], stand[1], stand[2]) : findCrest();
  const sx = top.x - WIND[0] * CAM.back, sz = top.z - WIND[1] * CAM.back;
  const crest = { x: sx, z: sz, h: height(sx, sz) };
  const eye = [crest.x, crest.h + CAM.eye, crest.z];
  // a look's own sun placement (VIEWS), then sun1=relAz,elev / sun2=relAz,elev: tuning overrides
  // (degrees, relative to the view heading)
  for (const k of ['sun1', 'sun2']) if (view[k]) Object.assign(TIMES[time][k], view[k]);
  for (const k of ['sun1', 'sun2']) {
    const m = /^(-?[\d.]+),(-?[\d.]+)$/.exec(q.get(k) || '');
    if (m) Object.assign(TIMES[time][k], { relAz: +m[1], elev: +m[2] });
  }
  // the view heading: a look may set its own (VIEWS); heading=deg overrides (tuning only)
  const headingDeg = /^-?[\d.]+$/.test(q.get('heading') || '') ? +q.get('heading') : (view.headingDeg ?? CAM.headingDeg);
  const pitchDeg = view.pitchDeg ?? CAM.pitchDeg;
  const values = lookUniforms(time, weather, headingDeg);
  if (view.exposure) values.uExposure = view.exposure;
  values.uGroundY = crest.h;
  values.uFog = [values.uFog[0], values.uFog[1], values.uFog[2], crest.h];

  // ---- renderer: load only the build this path needs
  let THREE, renderer, mats, backend, shadowRT = null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // the shadow map: half floats, one horizon value per sun (RG). Round three: the storm no longer
  // adds ground and spill heights (its sand is drawn on the ground). Bearing wraps around, distance clamps.
  const makeShadowRT = (RT) => {
    const format = THREE.RGFormat;
    const rt = new RT(SHMAP.w, SHMAP.h, { depthBuffer: false, generateMipmaps: false, type: THREE.HalfFloatType, format });
    rt.texture.type = THREE.HalfFloatType; rt.texture.format = format;
    rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter;
    rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
  };
  try {
    if (rName === 'classic') {
      THREE = await import('three');
      renderer = new THREE.WebGLRenderer({ antialias: q.get('aa') !== '0', powerPreference: 'high-performance' });
      if (opts.shadows === 'map') shadowRT = makeShadowRT(THREE.WebGLRenderTarget);
      mats = createGlslMaterials(THREE, values, opts, shadowRT?.texture ?? null);
      backend = 'WebGL2 (classic WebGLRenderer, GLSL)';
    } else {
      THREE = await import('three/webgpu');
      const { createTslMaterials } = await import('./tsl-material.js');
      renderer = new THREE.WebGPURenderer({ antialias: q.get('aa') !== '0', forceWebGL: rName === 'webgl2', powerPreference: 'high-performance' });
      await renderer.init();
      if (opts.shadows === 'map') shadowRT = makeShadowRT(THREE.RenderTarget);
      mats = createTslMaterials(values, opts, shadowRT?.texture ?? null);
      const isGPU = renderer.backend.isWebGPUBackend === true;
      backend = isGPU ? 'WebGPU (WebGPURenderer, TSL)' : 'WebGL2 (WebGPURenderer, TSL)';
      if (rName === 'webgpu' && !isGPU) { backend += ' - FELL BACK: WebGPU did not start'; state.fellBack = true; }
    }
  } catch (e) {
    try { renderer?.dispose(); } catch { /* nothing to free */ }
    poster(rName === 'classic' ? 'WebGL2 did not start on this browser.' : 'Neither WebGPU nor WebGL2 started on this browser.', e);
    return;
  }
  state.backend = backend;

  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the shaders tone-map and sRGB-encode themselves
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (rName === 'classic') mats.set('uViewH', renderer.domElement.height);
  document.getElementById('stage').append(renderer.domElement);

  // ---- scene: a sky sphere drawn first, then the ground grid
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY.rSky, 64, 32), mats.sky);
  sky.renderOrder = -1; sky.frustumCulled = false; sky.position.set(...eye);
  mats.ground.side = THREE.DoubleSide;
  const grid = buildGrid(THREE);
  const ground = new THREE.Mesh(grid.geometry, mats.ground);
  ground.frustumCulled = false;
  ground.position.set(eye[0], 0, eye[2]);
  mats.set('uGridOrigin', [eye[0], eye[2]]);
  scene.add(sky, ground);

  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(aspect < 1 ? (view.vfovPortrait ?? CAM.vfovPortrait) : (view.vfov ?? CAM.vfov), aspect, CAM.near, CAM.far);
  camera.position.set(...eye);
  const aim = (headingDeg) => {
    const h = headingDeg * DEG, p = pitchDeg * DEG;
    camera.lookAt(eye[0] + Math.cos(h) * Math.cos(p), eye[1] + Math.sin(p), eye[2] + Math.sin(h) * Math.cos(p));
  };
  aim(headingDeg);
  const isGPU = renderer.backend?.isWebGPUBackend === true;
  const gl = rName === 'classic' ? renderer.getContext() : (isGPU ? null : renderer.backend.gl);
  const px = new Uint8Array(4);
  const gpuFinish = async () => {
    if (isGPU) await renderer.backend.device.queue.onSubmittedWorkDone();
    else gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // blocks until the GPU is done
  };

  // ---- shadow-map bake: one full-screen pass into the log-polar target, centred on the camera.
  // A still bakes once. A walking camera would call maybeBake() each frame: it re-bakes only when
  // a sun has moved or the camera is more than SHMAP.rebakeDist from the last bake centre.
  const bakeScene = new THREE.Scene();
  const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mats.bake);
  bakeQuad.frustumCulled = false;
  bakeScene.add(bakeQuad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bakeState = { centre: null, sun: null, count: 0 };
  const bake = (cx, cz) => {
    mats.set('uShC', [cx, cz]);
    renderer.setRenderTarget(shadowRT); renderer.render(bakeScene, quadCam); renderer.setRenderTarget(null);
    bakeState.centre = [cx, cz]; bakeState.sun = [...values.uSun1Dir, ...values.uSun2Dir].join(); bakeState.count++;
  };
  // one band of rows (a scissor over the full-target quad), so a re-bake can be spread over frames
  const bakeSlice = (i, n) => {
    const y0 = Math.floor((i * SHMAP.h) / n), y1 = Math.floor(((i + 1) * SHMAP.h) / n);
    // classic WebGLRenderer reads the target's scissorTest; WebGPURenderer uses the target's scissor
    // rectangle only while the renderer's own scissor test is on
    shadowRT.scissor.set(0, y0, SHMAP.w, y1 - y0); shadowRT.scissorTest = true;
    if (rName !== 'classic') renderer.setScissorTest(true);
    renderer.setRenderTarget(shadowRT); renderer.render(bakeScene, quadCam); renderer.setRenderTarget(null);
    shadowRT.scissorTest = false;
    if (rName !== 'classic') renderer.setScissorTest(false);
  };
  const maybeBake = (cx, cz) => {
    if (!shadowRT) return false;
    const sunKey = [...values.uSun1Dir, ...values.uSun2Dir].join();
    if (bakeState.centre && bakeState.sun === sunKey && Math.hypot(cx - bakeState.centre[0], cz - bakeState.centre[1]) < SHMAP.rebakeDist) return false;
    bake(cx, cz);
    return true;
  };

  // ---- first frame (time to first frame includes shader compile)
  maybeBake(eye[0], eye[2]);
  renderer.render(scene, camera);
  await gpuFinish();
  state.firstFrameMs = Math.round(performance.now());

  Object.assign(state, {
    canvas: [renderer.domElement.width, renderer.domElement.height],
    css: [window.innerWidth, window.innerHeight],
    dpr,
    camera: { x: +eye[0].toFixed(2), y: +eye[1].toFixed(3), z: +eye[2].toFixed(2), headingDeg, vfov: camera.fov },
    grid: { vertices: grid.vertices, triangles: grid.triangles },
  });

  // ---- probe: the GPU formula at 64 points against height.js, starting at the camera's own feet
  try {
    state.probe = await runProbe(THREE, renderer, mats, eye, rName);
  } catch (e) {
    state.probe = { error: String(e?.message || e) };
  }

  // ---- bench: uncapped throughput, only when asked for
  if (bench) {
    const N = 200, WARM = 30, RUNS = 3;
    const frame = (i) => {
      if (opts.bakeEvery && shadowRT) bake(eye[0], eye[2]);
      if (opts.bakeSlices && shadowRT) bakeSlice(i % opts.bakeSlices, opts.bakeSlices);
      aim(headingDeg + (i % 40) * 0.01); renderer.render(scene, camera);
    };
    for (let i = 0; i < WARM; i++) frame(i);
    await gpuFinish();
    const runs = [];
    for (let r = 0; r < RUNS; r++) {
      await nextFrame();
      const t0 = performance.now();
      for (let i = 0; i < N; i++) frame(i);
      await gpuFinish();
      runs.push((performance.now() - t0) / N);
    }
    state.bench = { frames: N, runs: runs.map((x) => +x.toFixed(2)), msPerFrameMedian: +median(runs).toFixed(2), bakeEvery: opts.bakeEvery, bakeSlices: opts.bakeSlices };
    if (shadowRT) {
      // the bake alone, 20 back to back
      const bruns = [];
      for (let r = 0; r < RUNS; r++) {
        await nextFrame();
        const t0 = performance.now();
        for (let i = 0; i < 20; i++) bake(eye[0], eye[2]);
        // one canvas frame that samples the map, so the drain below waits for the bakes on WebGL
        // too (a 1x1 readPixels of the canvas alone does not) and reads a canvas-format buffer;
        // it adds about 1/20 of a frame to each bake figure
        renderer.render(scene, camera);
        await gpuFinish();
        bruns.push((performance.now() - t0) / 20);
      }
      state.bench.bakeMs = +median(bruns).toFixed(2);
      state.bench.bakeRuns = bruns.map((x) => +x.toFixed(2));
    }
  }

  aim(headingDeg);
  renderer.render(scene, camera);
  await gpuFinish();
  await nextFrame(); await nextFrame();

  const b = state.bench;
  show([
    `Dust Sea look test - ${state.look}`,
    `renderer asked: ${rName}`,
    `running on: ${backend}`,
    `canvas: ${state.canvas[0]} x ${state.canvas[1]} px (CSS ${state.css[0]} x ${state.css[1]}, DPR ${dpr})`,
    `grid: ${grid.vertices.toLocaleString()} vertices, ${grid.triangles.toLocaleString()} triangles`,
    `shadows: ${opts.shadows}${shadowRT ? ` (log-polar ${SHMAP.w} x ${SHMAP.h}, baked ${bakeState.count}x)` : ''}; normal: ${opts.normal}; ripples: ${opts.ripples ? 'on' : 'off'}`,
    `first frame: ${state.firstFrameMs} ms after navigation start (includes shader compile)`,
    state.probe?.error ? `height check: failed to run (${state.probe.error})`
      : `height check: GPU vs height.js at ${state.probe.points} points, max |dh| ${state.probe.maxDiff.toExponential(2)} m, max |grad error| ${state.probe.maxGradDiff.toExponential(2)}; eye ${state.probe.eyeAboveGround.toFixed(3)} m above GPU ground`,
    typeof b === 'object' ? `bench: ${b.msPerFrameMedian} ms/frame median of ${b.runs.join(', ')} (${b.frames} frames each${b.bakeEvery ? ', shadow map re-baked every frame' : ''}${b.bakeSlices ? `, 1/${b.bakeSlices} of the map re-baked every frame` : ''})${b.bakeMs ? `; bake alone ${b.bakeMs} ms` : ''}` : 'bench: off (add bench=1)',
    typeof b === 'object' ? 'throughput figure, GPU drained after N back-to-back frames; not a vsync-limited frame rate' : '',
  ]);
  state.ready = true;
}

async function runProbe(THREE, renderer, mats, eye, rName) {
  mats.set('uProbeO', [eye[0], eye[2]]);
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mats.probe);
  quad.frustumCulled = false;
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const read = async () => {
    let data;
    if (rName === 'classic') {
      const rt = new THREE.WebGLRenderTarget(8, 8, { type: THREE.FloatType, depthBuffer: false });
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
      data = new Float32Array(8 * 8 * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, 8, 8, data);
      rt.dispose();
    } else {
      const rt = new THREE.RenderTarget(8, 8, { type: THREE.FloatType, depthBuffer: false });
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
      data = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 8, 8);
      rt.dispose();
    }
    return data;
  };
  const data = await read();
  quad.material = mats.probeD;
  const dataD = await read();
  let maxDiff = 0, maxDiffLow = 0, maxGradDiff = 0, maxDiffD = 0, points = 0, eyeGround = null;
  const samples = [];
  // WebGPU readback pads each row to 256 bytes (64 floats); WebGL rows are tight (32 floats).
  const stride = data.length > 256 ? (data.length - 32) / 7 : 32;
  for (let i = 0; i < 64; i++) {
    const o = Math.floor(i / 8) * stride + (i % 8) * 4;
    const gh = data[o], ghl = data[o + 1], ix = Math.round(data[o + 2]), iy = Math.round(data[o + 3]);
    const x = eye[0] + ix * 53.7 - iy * 21.1, z = eye[2] + iy * 47.3 + ix * 9.9;
    const jh = height(x, z), jhl = heightLow(x, z);
    maxDiff = Math.max(maxDiff, Math.abs(gh - jh));
    maxDiffLow = Math.max(maxDiffLow, Math.abs(ghl - jhl));
    // the analytic gradient (probeD writes heightD at the same texel; the layout is the same)
    const jd = heightD(x, z);
    maxDiffD = Math.max(maxDiffD, Math.abs(dataD[o] - jd[0]), Math.abs(dataD[o + 3] - jhl));
    maxGradDiff = Math.max(maxGradDiff, Math.hypot(dataD[o + 1] - jd[1], dataD[o + 2] - jd[2]));
    points++;
    if (ix === 0 && iy === 0) eyeGround = gh;
    if (samples.length < 4 && (ix + iy) % 3 === 0) samples.push({ x: +x.toFixed(1), z: +z.toFixed(1), gpu: +gh.toFixed(4), js: +jh.toFixed(4) });
  }
  return { points, maxDiff, maxDiffLow, maxDiffD, maxGradDiff, eyeAboveGround: eye[1] - eyeGround,
    pass: maxDiff < 0.01 && maxDiffD < 0.01 && maxGradDiff < 1e-3 && Math.abs(eye[1] - eyeGround - CAM.eye) < 0.01, samples };
}

if ([...q.keys()].length === 0) showIndex();
else run().catch((e) => poster('The look test stopped with an error.', e));
