// Dust Sea, step 0: the look test.
// Draws one still frame of the dune sea from standing height, on one of three renderers:
//   r=webgpu  WebGPURenderer on WebGPU (TSL material)
//   r=webgl2  WebGPURenderer with forceWebGL (the same TSL material, compiled to GLSL)
//   r=classic WebGLRenderer from three.module.js (hand-written GLSL ShaderMaterial)
// time=day|dusk|ember, weather=calm|storm, bench=1 to time throughput. No loop runs otherwise.

import { CAM, GRID, SKY, TIMES, WEATHERS, DEG, lookUniforms } from './params.js';
import { height, heightLow, findCrest, WIND } from './height.js';
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
  if (!RENDERERS.includes(rName) || !TIMES[time] || !WEATHERS[weather]) {
    poster(`unknown look: r=${rName} time=${time} weather=${weather}`);
    return;
  }
  Object.assign(state, { requested: rName, look: `${time}/${weather}`, bench: bench ? 'pending' : 'off' });

  // ---- where to stand: the JS height formula picks a crest and puts the eye 1.7 m above it
  // Stand CAM.back metres upwind of the crest top, on the windward slope: from the brink itself
  // the 31 degree slipface falls away faster than the lowest ray in frame and no near sand shows.
  const top = findCrest();
  const sx = top.x - WIND[0] * CAM.back, sz = top.z - WIND[1] * CAM.back;
  const crest = { x: sx, z: sz, h: height(sx, sz) };
  const eye = [crest.x, crest.h + CAM.eye, crest.z];
  const values = lookUniforms(time, weather, CAM.headingDeg);
  values.uGroundY = crest.h;
  values.uFog = [values.uFog[0], values.uFog[1], values.uFog[2], crest.h];

  // ---- renderer: load only the build this path needs
  let THREE, renderer, mats, backend;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  try {
    if (rName === 'classic') {
      THREE = await import('three');
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      mats = createGlslMaterials(THREE, values);
      backend = 'WebGL2 (classic WebGLRenderer, GLSL)';
    } else {
      THREE = await import('three/webgpu');
      const { createTslMaterials } = await import('./tsl-material.js');
      renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: rName === 'webgl2', powerPreference: 'high-performance' });
      await renderer.init();
      mats = createTslMaterials(values);
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
  const camera = new THREE.PerspectiveCamera(aspect < 1 ? CAM.vfovPortrait : CAM.vfov, aspect, CAM.near, CAM.far);
  camera.position.set(...eye);
  const aim = (headingDeg) => {
    const h = headingDeg * DEG, p = CAM.pitchDeg * DEG;
    camera.lookAt(eye[0] + Math.cos(h) * Math.cos(p), eye[1] + Math.sin(p), eye[2] + Math.sin(h) * Math.cos(p));
  };
  aim(CAM.headingDeg);
  const isGPU = renderer.backend?.isWebGPUBackend === true;
  const gl = rName === 'classic' ? renderer.getContext() : (isGPU ? null : renderer.backend.gl);
  const px = new Uint8Array(4);
  const gpuFinish = async () => {
    if (isGPU) await renderer.backend.device.queue.onSubmittedWorkDone();
    else gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // blocks until the GPU is done
  };

  // ---- first frame (time to first frame includes shader compile)
  renderer.render(scene, camera);
  await gpuFinish();
  state.firstFrameMs = Math.round(performance.now());

  Object.assign(state, {
    canvas: [renderer.domElement.width, renderer.domElement.height],
    css: [window.innerWidth, window.innerHeight],
    dpr,
    camera: { x: +eye[0].toFixed(2), y: +eye[1].toFixed(3), z: +eye[2].toFixed(2), headingDeg: CAM.headingDeg, vfov: camera.fov },
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
    for (let i = 0; i < WARM; i++) { aim(CAM.headingDeg + i * 0.01); renderer.render(scene, camera); }
    await gpuFinish();
    const runs = [];
    for (let r = 0; r < RUNS; r++) {
      await nextFrame();
      const t0 = performance.now();
      for (let i = 0; i < N; i++) { aim(CAM.headingDeg + (i % 40) * 0.01); renderer.render(scene, camera); }
      await gpuFinish();
      runs.push((performance.now() - t0) / N);
    }
    state.bench = { frames: N, runs: runs.map((x) => +x.toFixed(2)), msPerFrameMedian: +median(runs).toFixed(2) };
  }

  aim(CAM.headingDeg);
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
    `first frame: ${state.firstFrameMs} ms after navigation start (includes shader compile)`,
    state.probe?.error ? `height check: failed to run (${state.probe.error})`
      : `height check: GPU vs height.js at ${state.probe.points} points, max |dh| ${state.probe.maxDiff.toExponential(2)} m; eye ${state.probe.eyeAboveGround.toFixed(3)} m above GPU ground`,
    typeof b === 'object' ? `bench: ${b.msPerFrameMedian} ms/frame median of ${b.runs.join(', ')} (${b.frames} frames each)` : 'bench: off (add bench=1)',
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
  let maxDiff = 0, maxDiffLow = 0, points = 0, eyeGround = null;
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
    points++;
    if (ix === 0 && iy === 0) eyeGround = gh;
    if (samples.length < 4 && (ix + iy) % 3 === 0) samples.push({ x: +x.toFixed(1), z: +z.toFixed(1), gpu: +gh.toFixed(4), js: +jh.toFixed(4) });
  }
  return { points, maxDiff, maxDiffLow, eyeAboveGround: eye[1] - eyeGround, pass: maxDiff < 0.01 && Math.abs(eye[1] - eyeGround - CAM.eye) < 0.01, samples };
}

if ([...q.keys()].length === 0) showIndex();
else run().catch((e) => poster('The look test stopped with an error.', e));
