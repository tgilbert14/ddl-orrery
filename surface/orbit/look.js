// The orbit, look test: still frames of the redesigned hub (see BRIEF.md). No flying, no input.
//   look-test.html?shot=arrival|hull|approach|threshold|orrery&r=webgpu|webgl2[&clean=1][&bench=1]
// Every shot is a fixed camera and a fixed world arrangement; nothing reads the clock and every
// random number comes from a seeded generator, so a still is the same on every reload.
import * as THREE from 'three/webgpu';
import { fog, densityFogFactor, vec3 } from 'three/tsl';
import { SUN1, SUN2, DEG, dirYP, norm, add, sub, mul, dot, cross, len } from './light.js';
import { createSky, createStars } from './stars.js';
import { createHull, deckAt, halfWidth } from './hull.js';
import { WORLDS, createWorlds, createWorldPoints, createOrbitLines } from './worlds.js';
import { createShuttle } from './shuttle.js';
import { ARR, arrange } from './layout.js';

const SHOTS = ['arrival', 'hull', 'approach', 'threshold', 'orrery'];
// exposure per still (the worlds up close are far brighter than the dark metal)
const P_EXPOSURE = { threshold: 1.0, approach: 1.3, hull: 2.1 };
const q = new URLSearchParams(location.search);
const readoutEl = document.getElementById('readout');
const state = (window.__orbitLook = { ready: false, error: null, backend: null, shot: null });
const show = (lines) => { readoutEl.textContent = lines.filter(Boolean).join('\n'); };

function poster(msg, err) {
  const p = document.getElementById('poster');
  p.hidden = false;
  p.querySelector('p').textContent = msg;
  state.error = String(err?.message || err || msg);
  state.ready = true;
  show(['orbit look test did not start', state.error]);
}

// ---------------------------------------------------------------- the shots
// each returns { cam, look, up?, vfov, vfovPortrait, shuttle: { pos, heading } }
function shotPose(name, placed) {
  const W = Object.fromEntries(placed.map((w) => [w.id, w]));
  if (name === 'arrival') {
    return { cam: ARR.cam, look: add(ARR.cam, ARR.fwd), vfov: 52, vfovPortrait: 84, portraitYaw: 4, portraitPitch: 2,
      shuttle: { pos: ARR.shuttle, dir: ARR.fwd } };
  }
  if (name === 'hull') {
    // low in the canyon, flying toward the stern: walls rising well above on both sides, walkways
    // and cables across, the one amber window on the left wall in the middle distance, Abyssal at
    // the far end of the vanishing line
    const sx = 250, sz = 30;
    const sp = [sx, deckAt(sx, sz) + 16, sz];
    const fwd = norm(dirYP(178, -0.5));
    const cam = add(sub(sp, mul(fwd, 175)), [0, 13, -12]);
    return { cam, look: add(cam, norm(dirYP(175.5, 2.5))), vfov: 54, vfovPortrait: 80, shuttle: { pos: sp, dir: fwd },
      // the close view's light: the pale sun slants across the lane from the port side, through the
      // cross streets, so one wall is in warm light, the other in cool shadow, with shafts on the floor
      light: { dir: norm(dirYP(-68, 38)), target: [-200, 150, 45], half: 1000 } };
  }
  if (name === 'approach') {
    const D = W['dust-sea'];
    const s = norm(sub([0, 0, 0], D.pos)), Ld = len(D.pos);
    // pick the side to come from: the Dust Sea a little more than half lit, the ship beside it
    let best = null;
    const p0 = norm(cross(s, [0, 1, 0])), p1 = cross(s, p0);
    const beta = 52 * DEG, d = 9200;
    for (let k = 0; k < 360; k += 2) {
      const p = add(mul(p0, Math.cos(k * DEG)), mul(p1, Math.sin(k * DEG)));
      const u = add(mul(s, -Math.cos(beta)), mul(p, Math.sin(beta)));
      const score = Math.abs(dot(u, SUN1.dir) + 0.05) + Math.max(0, dot(u, SUN2.dir)) * 1.5 + Math.abs(p[1] + 0.3) * 0.3;
      if (!best || score < best.score) best = { score, u };
    }
    const cam = add(D.pos, mul(best.u, d));
    const toD = norm(sub(D.pos, cam)), toO = norm(sub([0, 0, 0], cam));
    const look = add(cam, norm(add(mul(toD, 0.6), mul(toO, 0.4))));
    const sp = add(cam, add(mul(toD, 330), [0, -14, 0]));
    return { cam, look, vfov: 50, vfovPortrait: 78, shuttle: { pos: sp, dir: toD }, Ld };
  }
  if (name === 'threshold') {
    const D = W['dust-sea'];
    // a point on the day side, the afternoon side of the terminator
    const s1 = SUN1.dir;
    const side = norm(cross(s1, [0, 1, 0]));
    const n0 = norm(add(mul(s1, 0.2), add(mul(side, 0.95), [0, 0.22, 0])));
    const h = 0.16 * D.R;
    const cam = add(D.pos, mul(n0, D.R + h));
    // look along the surface, roughly toward the sun's side, pitched below the tangent
    const tan0 = norm(sub(s1, mul(n0, dot(s1, n0))));
    const right0 = norm(cross(tan0, n0));
    const t = norm(add(mul(tan0, Math.cos(-62 * DEG)), mul(right0, Math.sin(-62 * DEG))));
    const look = add(cam, norm(add(mul(t, Math.cos(-35 * DEG)), mul(n0, Math.sin(-35 * DEG)))));
    const up = norm(add(n0, mul(norm(cross(t, n0)), 0.12)));
    const sp = add(cam, mul(norm(add(mul(t, Math.cos(27 * DEG)), mul(n0, -Math.sin(27 * DEG)))), 700));
    return { cam, look, up, vfov: 56, vfovPortrait: 84, shuttle: { pos: sp, dir: norm(add(t, mul(n0, -0.08))) } };
  }
  if (name === 'orrery') {
    const cam = mul(norm([-0.5, 1.0, -0.8]), 60000);
    return { cam, look: [0, 4500, 0], vfov: 50, vfovPortrait: 86, shuttle: { pos: [-2400, 300, -400], dir: [1, 0, 0] } };
  }
  return null;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function run() {
  const shot = q.get('shot') || 'arrival';
  const rName = q.get('r') || 'webgpu';
  if (!SHOTS.includes(shot) || !['webgpu', 'webgl2'].includes(rName)) { poster(`unknown still: shot=${shot} r=${rName}`); return; }
  state.shot = shot;

  let renderer, backend;
  try {
    renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: rName === 'webgl2', reversedDepthBuffer: rName !== 'webgl2', powerPreference: 'high-performance' });
    await renderer.init();
    const isGPU = renderer.backend.isWebGPUBackend === true;
    backend = isGPU ? 'WebGPU (WebGPURenderer, TSL)' : 'WebGL2 (WebGPURenderer, TSL)';
    if (rName === 'webgpu' && !isGPU) { backend += ' - FELL BACK: WebGPU did not start'; state.fellBack = true; }
  } catch (e) {
    try { renderer?.dispose(); } catch { /* nothing to free */ }
    poster('Neither WebGPU nor WebGL2 started on this browser.', e);
    return;
  }
  state.backend = backend;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Unlike the Dust Sea (which tone-maps in its own shader), the orbit lights its metal with
  // three's physical lights and shadow map, so the renderer tone-maps every material the same way.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = P_EXPOSURE[shot] ?? 1.45;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.getElementById('stage').append(renderer.domElement);

  // ---- scene
  const scene = new THREE.Scene();
  let placed = arrange();
  if (shot === 'orrery') {
    // the orrery is the arrangement seen whole: radii compressed (a power law) so the inner and outer
    // orbits share the frame, and the worlds drawn larger so each reads as a sphere with colour
    placed = placed.map((w) => {
      const r = len(w.pos), r2 = 7000 * Math.pow(r / 7000, 0.6);
      const pos = mul(norm(w.pos), r2);
      const ex = w.stormAxis ? { stormAxis: w.stormAxis, stormSide: w.stormSide } : {};
      return { ...w, ...ex, pos, R: w.R * 1.7 };
    });
  }
  // stars are sized in CSS pixels; at DPR 2 they would read twice as large, so they shrink a little
  const sky = createSky(), stars = createStars(14000, 7177, 1 / Math.sqrt(Math.min(window.devicePixelRatio || 1, 2)));
  const hull = createHull();
  const worlds = createWorlds(placed);
  const points = createWorldPoints(placed);
  const shuttle = createShuttle();
  scene.add(sky, stars, hull, worlds, points, shuttle);
  if (shot === 'orrery') scene.add(createOrbitLines(placed));
  // a thin dust between the ship and the camera (metal only: the worlds and sky opt out), so the
  // derelict's far end recedes; off for the orrery, where the ship is far away by design
  if (shot === 'hull') scene.fogNode = fog(vec3(0.22, 0.12, 0.045), densityFogFactor(0.0009)); // a warm haze in the canyon
  else if (shot !== 'orrery') scene.fogNode = fog(vec3(0.05, 0.032, 0.018), densityFogFactor(shot === 'approach' ? 0.00005 : 0.00016));

  // the suns as lights on the metal (the worlds and sky shade themselves from the same directions)
  const sun1 = new THREE.DirectionalLight(new THREE.Color().setRGB(...SUN1.col), 1.0);
  sun1.position.set(...mul(SUN1.dir, 9000));
  sun1.target.position.set(0, 0, 0);
  sun1.castShadow = true;
  sun1.shadow.mapSize.set(4096, 4096);
  const sc = sun1.shadow.camera;
  sc.left = -2900; sc.right = 2900; sc.top = 2900; sc.bottom = -2900; sc.near = 2000; sc.far = 16000;
  sun1.shadow.bias = -0.0004;
  sun1.shadow.normalBias = 1.5;
  const sun2 = new THREE.DirectionalLight(new THREE.Color().setRGB(...SUN2.col), 0.9);
  sun2.position.set(...mul(SUN2.dir, 9000));
  sun2.intensity = 0.45;
  // bounce: light the lit metal throws back across the lanes and onto the shadow side (no shadows)
  const bounce = new THREE.DirectionalLight(new THREE.Color().setRGB(0.55, 0.36, 0.2), 0.32);
  bounce.position.set(-SUN1.dir[0] * 9000, 0.35 * 9000, -SUN1.dir[2] * 9000);
  scene.add(bounce);
  const amb = new THREE.HemisphereLight(new THREE.Color().setRGB(0.15, 0.135, 0.15), new THREE.Color().setRGB(0.05, 0.032, 0.018), 1.0);
  scene.add(sun1, sun1.target, sun2, amb);

  // ---- camera
  const P = shotPose(shot, placed);
  if (P.light) {
    // a still may light its metal from its own sun angle (the sky and the worlds keep the shared suns)
    const L = P.light;
    sun1.position.set(...add(L.target, mul(L.dir, 6000)));
    sun1.target.position.set(...L.target);
    sc.left = -L.half; sc.right = L.half; sc.top = L.half; sc.bottom = -L.half; sc.near = 4000; sc.far = 8000;
    sun1.shadow.normalBias = 0.6;
    bounce.color.setRGB(0.46, 0.42, 0.40); bounce.intensity = 0.75;
    sun2.intensity = 0.14;
    sun1.intensity = 1.9;
    bounce.position.set(-L.dir[0] * 9000, 0.25 * 9000, -L.dir[2] * 9000);
    amb.color.setRGB(0.15, 0.17, 0.23); amb.groundColor.setRGB(0.09, 0.07, 0.05);
  }
  const aspect = window.innerWidth / window.innerHeight;
  const portrait = aspect < 1;
    // near plane 5 m: nothing in any still comes closer than ~50 m. WebGPU uses a reversed (float)
  // depth buffer; WebGL2 a standard one, which at this near plane still resolves 1 m at 5 km.
  // (Reversed depth on the WebGL2 backend broke the shadow map's comparison in r186; a
  // logarithmic depth buffer worked but cost 13 ms a frame, because it disables early depth test.)
  const camera = new THREE.PerspectiveCamera(portrait ? P.vfovPortrait : P.vfov, aspect, 5, 420000);
  camera.position.set(...P.cam);
  if (P.up) camera.up.set(...P.up);
  let look = P.look;
  if (portrait && (P.portraitYaw || P.portraitPitch)) {
    const f = norm(sub(P.look, P.cam));
    const yaw = Math.atan2(f[2], f[0]) + (P.portraitYaw || 0) * DEG, pitch = Math.asin(f[1]) + (P.portraitPitch || 0) * DEG;
    look = add(P.cam, [Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)]);
  }
  camera.lookAt(...look);
  camera.updateMatrixWorld();
  sky.position.copy(camera.position);
  stars.position.copy(camera.position);
  shuttle.position.set(...P.shuttle.pos);
  shuttle.lookAt(...add(P.shuttle.pos, P.shuttle.dir));
  if (shot === 'orrery') { shuttle.visible = false; hull.scale.setScalar(2.2); } // drawn larger, like the worlds
  const pxPerRad = (window.innerHeight * dpr) / (2 * Math.tan((camera.fov * DEG) / 2));
  points.userData.update(camera, pxPerRad);

  const isGPU = renderer.backend.isWebGPUBackend === true;
  const gl = isGPU ? null : renderer.backend.gl;
  const px = new Uint8Array(4);
  const gpuFinish = async () => {
    if (isGPU) await renderer.backend.device.queue.onSubmittedWorkDone();
    else gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };

  const t0 = performance.now();
  renderer.render(scene, camera);
  await gpuFinish();
  state.firstFrameMs = Math.round(performance.now() - t0);

  // frame time: N frames back to back, GPU drained (throughput, not a vsync rate)
  if (q.get('bench') === '1') {
    const runs = [];
    for (let r = 0; r < 3; r++) {
      await nextFrame();
      const s = performance.now();
      for (let i = 0; i < 30; i++) renderer.render(scene, camera);
      await gpuFinish();
      runs.push((performance.now() - s) / 30);
    }
    runs.sort((a, b) => a - b);
    state.msPerFrame = +runs[1].toFixed(2);
  }
  renderer.render(scene, camera);
  await gpuFinish();
  await nextFrame(); await nextFrame();

  state.camera = { pos: P.cam.map((x) => Math.round(x)), vfov: camera.fov };
  state.canvas = [renderer.domElement.width, renderer.domElement.height];
  show([
    `orbit look test - ${shot}`,
    `running on: ${backend}`,
    `canvas: ${state.canvas[0]} x ${state.canvas[1]} px (DPR ${dpr}), vfov ${camera.fov} deg`,
    `first frame: ${state.firstFrameMs} ms (includes shader compile)`,
    state.msPerFrame ? `frame time: ${state.msPerFrame} ms (median of 3 runs of 30 frames, GPU drained)` : 'frame time: add bench=1',
  ]);
  state.ready = true;
}

run().catch((e) => poster('The orbit look test stopped with an error.', e));
