// Dust Sea walk, step 1: the first walkable slice, in calm weather.
// WebGPURenderer on WebGPU, or its WebGL2 backend with ?r=webgl2; the poster when neither starts.
// The ground, sky, light and shadow bake are the look test's (../look-test/tsl-material.js with its
// walk options); this folder adds the walker, a ground mesh that follows you without swimming
// (clipmap.js), shadows re-baked while you walk (shadows.js), prints the wind erases (trace.js),
// drifting sand (air.js), three times of day (times.js) and the controls (input.js).
//
// URL switches: time=day|dusk|ember, r=webgpu|webgl2, fps=1 (readout), reduced=1 (as if the system
// asked for reduced motion), mute=1, dpr=N (fix the pixel ratio; the governor is off),
// grid=N (clipmap cells a side), slices=N (shadow bake spread), test=1 (no loop until a script asks).
// Figure look test (opt-in): figure=a|b|c places a static figure at the end of a 20 m trail and
// switches to a third-person camera, shot=behind|wide|side (see figure.js). Without figure= nothing
// below changes.

import { CAM, GRID, DEG } from '../look-test/params.js';
import { findCrest, WIND, height } from '../look-test/height.js';
import { createWalker, raycastGround } from './walker.js';
import { createInput } from './input.js';
import { timeValues, applyBlend, TIME_NAMES, SUN_OVERRIDE } from './times.js';

const q = new URLSearchParams(location.search);
const reduced = q.get('reduced') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const showFps = q.get('fps') === '1';
const testMode = q.get('test') === '1';
const forceWebGL = q.get('r') === 'webgl2';
const polar = q.get('mesh') === 'polar';
const fixedDpr = /^\d(\.\d+)?$/.test(q.get('dpr') || '') ? Math.min(2, +q.get('dpr')) : null;
// sun=time,bearing,elev (tuning only): move a time's pale sun
{ const m = /^(day|dusk|ember),(-?[\d.]+),(-?[\d.]+)$/.exec(q.get('sun') || ''); if (m) SUN_OVERRIDE[m[1]] = [+m[2], +m[3]]; }
const startName = TIME_NAMES.includes(q.get('time')) ? q.get('time') : 'dusk';
const FIGURE = /^[abc]$/.test(q.get('figure') || '') ? q.get('figure') : null;
let shotName = ['behind', 'wide', 'side'].includes(q.get('shot')) ? q.get('shot') : 'behind';
const TIME_FADE = 3.0;

const $ = (id) => document.getElementById(id);
const stage = $('stage'), readoutEl = $('readout'), hintEl = $('hint'), posterEl = $('poster');
if (showFps) readoutEl.hidden = false;
document.body.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);

// the far fog closes before the clipmap's coarsest level ends (it reaches 6144 m)
GRID.rMax = 6000;

// ---------------------------------------------------------------- the walker
// the dusk look's standing point and heading: findCrest() near the origin, 4 m upwind of the top
const top = findCrest();
const start = { x: top.x - WIND[0] * CAM.back, z: top.z - WIND[1] * CAM.back, headingDeg: CAM.headingDeg, pitchDeg: CAM.pitchDeg };
const walker = createWalker({ ...start, reducedMotion: reduced });
const ws = walker.state;

let timeNow = timeValues(startName);  // the time of day on screen (suns 1 and 2)
let timeFade = null;                  // { to, phase: 'baking' | 'fading', t, map }
let pendingTime = null;

const API = (window.__walk = { ready: false, backend: null, error: null, reduced, events: { foot: 0, slide: 0 }, losses: 0 });

// ---------------------------------------------------------------- sound (another module; optional)
let soundMod = null, sound = null, muted = q.get('mute') === '1';
const muteBtn = $('mute');
import('./sound.js').then((m) => { soundMod = m; }).catch(() => { soundMod = false; muteBtn.disabled = true; muteBtn.textContent = 'No sound'; });
function onGesture() {
  if (sound || !soundMod || typeof soundMod.createSound !== 'function') return;
  try { sound = soundMod.createSound(); sound.start(); sound.setMuted(muted); } catch { sound = null; }
}
function setMuteLabel() { muteBtn.textContent = muted ? 'Sound off' : 'Sound on'; muteBtn.setAttribute('aria-pressed', String(muted)); }
setMuteLabel();
muteBtn.addEventListener('click', () => { muted = !muted; setMuteLabel(); onGesture(); try { sound?.setMuted(muted); } catch { /* no sound */ } });

// ---------------------------------------------------------------- controls
let hintGone = false;
const input = createInput(stage, {
  onTime: (n) => setTime(n),
  onGesture,
  onFirstMove: () => { if (!hintGone) { hintGone = true; hintEl.classList.add('gone'); } },
});
for (const b of document.querySelectorAll('[data-time]')) b.addEventListener('click', () => { onGesture(); setTime(b.dataset.time); });
function markTimeButtons(name) { for (const b of document.querySelectorAll('[data-time]')) b.setAttribute('aria-pressed', String(b.dataset.time === name)); }
markTimeButtons(startName);

// ---------------------------------------------------------------- graphics
let G = null;              // everything that dies with a device
let running = false, onScreen = true, paused = testMode;
let simTime = 0, lastNow = 0;
const intervals = [];      // [timestamp ms, interval ms] over the last second
const works = [];          // CPU ms in tick(), last second
let govSlow = 0, govFast = 0, govLast = 0;
const dprCap = Math.min(window.devicePixelRatio || 1, 2);
let dpr = fixedDpr ?? dprCap;

function poster(msg, err) {
  posterEl.hidden = false;
  posterEl.querySelector('.why').textContent = msg;
  API.error = String(err?.message || err || msg);
  API.ready = true;
  stage.hidden = true;
}

async function buildGraphics() {
  const THREE = await import('three/webgpu');
  const { createTslMaterials } = await import('../look-test/tsl-material.js');
  const clip = await import('./clipmap.js');
  const traceMod = await import('./trace.js');
  const shMod = await import('./shadows.js');
  const air = await import('./air.js');
  const { SHMAP } = await import('../look-test/params.js');
  const figMod = FIGURE ? await import('./figure.js') : null;
  const figShade = figMod ? figMod.createFigureShading() : null;

  if (/^\d{3}$/.test(q.get('grid') || '')) clip.CLIP.n = Math.max(64, Math.round(+q.get('grid') / 8) * 8);
  if (/^\d{1,3}$/.test(q.get('slices') || '')) shMod.SHADOW.slices = Math.max(1, +q.get('slices'));

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL, powerPreference: 'high-performance' });
  try { await renderer.init(); } catch (e) { try { renderer.dispose(); } catch { /* nothing */ } throw e; }
  const isGPU = renderer.backend.isWebGPUBackend === true;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the shaders tone-map and encode
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(dpr);
  renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
  stage.append(renderer.domElement);

  const makeShadowRT = () => {
    const rt = new THREE.RenderTarget(SHMAP.w, SHMAP.h, { depthBuffer: false, generateMipmaps: false, type: THREE.HalfFloatType, format: THREE.RGFormat });
    rt.texture.type = THREE.HalfFloatType; rt.texture.format = THREE.RGFormat;
    rt.texture.minFilter = THREE.LinearFilter; rt.texture.magFilter = THREE.LinearFilter;
    rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
  };
  const rtA = makeShadowRT(), rtB = makeShadowRT();
  const trace = traceMod.createTrace(renderer);
  const uCam = clip.createClipUniform();
  const values = { ...timeNow, uGroundY: ws.ground };
  const mats = createTslMaterials(values, {
    shadows: 'map', normal: 'analytic', ripples: true,
    walk: {
      groundPosition: polar ? null : ({ height }) => clip.clipmapPosition(height, uCam, clip.CLIP.n),
      shadowTexB: rtB.texture,
      trace: trace.hook,
      air: q.get('air') === '0' ? null : air.airHook,
      ...(figShade ? { figure: figShade.groundHook } : {}),
    },
  }, rtA.texture);

  const scene = new THREE.Scene();
  const { SKY } = await import('../look-test/params.js');
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY.rSky, 64, 32), mats.sky);
  sky.renderOrder = -1; sky.frustumCulled = false;
  mats.ground.side = THREE.DoubleSide;
  // mesh=polar (evidence only): the look test's camera-centred polar grid, moved with the walker
  const cm = polar ? buildPolar(THREE, GRID) : clip.buildClipmap(clip.CLIP.n);
  const ground = new THREE.Mesh(cm.geometry, mats.ground);
  ground.frustumCulled = false;
  scene.add(sky, ground);

  const camera = new THREE.PerspectiveCamera(48, Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight), CAM.near, CAM.far);
  const shadows = shMod.createShadows({ renderer, THREE, mats, rtA, rtB, webgl: !isGPU });
  const gl = isGPU ? null : renderer.backend.gl;
  const px = new Uint8Array(4);
  const drain = async () => {
    if (isGPU) await renderer.backend.device.queue.onSubmittedWorkDone();
    else gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  };
  const g = { THREE, renderer, isGPU, mats, scene, sky, ground, camera, shadows, trace, uCam, rtA, rtB, cm, drain, clip, traceMod, shMod,
    backend: isGPU ? 'WebGPU (WebGPURenderer, TSL)' : 'WebGL2 (WebGPURenderer, TSL)' };
  if (figMod) {
    g.fig = figMod.createFigure({ kind: FIGURE, U: mats.uniforms, shade: figShade, scene });
    g.persp = camera;
    g.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  }
  if (!forceWebGL && !isGPU) g.backend += ' - fell back: WebGPU did not start';

  renderer.onDeviceLost = (info) => { onDeviceLost(info); };
  return g;
}

function setAllTime(groundY) { applyBlend(G.mats.set, timeNow, null, 0, groundY); }

let lookOv = null;   // a script may look elsewhere for a frame without turning the walker
function placeCamera() {
  if (G.fig) { G.fig.setTime(timeNow.name); if (G.fig.state.placed) { placeShot(); return; } }
  const e = walker.eye();
  const cam = G.camera;
  cam.position.set(e[0], e[1], e[2]);
  const h = lookOv ? lookOv.headingDeg * DEG : ws.yaw, p = lookOv ? lookOv.pitchDeg * DEG : ws.pitch;
  cam.lookAt(e[0] + Math.cos(h) * Math.cos(p), e[1] + Math.sin(p), e[2] + Math.sin(h) * Math.cos(p));
  G.sky.position.set(e[0], e[1], e[2]);
  const mx = e[0] + meshOff[0], mz = e[2] + meshOff[1];
  G.uCam.value.set(mx, mz);
  if (polar) { G.ground.position.set(mx, 0, mz); G.mats.set('uGridOrigin', [mx, mz]); }
}
let meshOff = [0, 0];   // evidence only: move the ground mesh without moving the view

// ---------------------------------------------------------------- figure look test (figure= only)
// The spot: the dusk look's crest (findCrest), the figure 2.6 m short of the brink, having walked
// 20 m up the windward face at the dusk heading (48: the pale sun ahead-left, the wind from behind
// right). Shots are placed relative to the figure: bearing from the figure to the camera (relative
// to its heading), distance, height above the camera's own ground; then either a heading and pitch
// (behind: look past the figure) or aimed at the figure plus offsets.
const FIG_HEADING = 48;
const FIG_END = { x: top.x - Math.cos(FIG_HEADING * DEG) * 2.6, z: top.z - Math.sin(FIG_HEADING * DEG) * 2.6 };
const FIG_TRAIL = 20.5;
const SHOTS = {
  behind: { bearing: 188, dist: 8, up: 2.6, yaw: -9, pitch: 2.5, fov: 44 },
  wide: { bearing: 245, dist: 28, up: 0.8, aim: 1.0, yaw: 12, pitch: -1, fov: 40 },
  side: { bearing: -105, dist: 6, up: 1.3, aim: 0.95, yaw: 15, pitch: -5, fov: 46 },
};
let shotOv = {};
let outline = null;   // 'back' | 'side': the figure alone on grey, orthographic, at a fixed scale
function placeShot() {
  const F = G.fig.state, cam = G.camera, h = F.headingDeg * DEG;
  if (outline) {
    const b = h + (outline === 'back' ? Math.PI : Math.PI / 2), H = 3.4, a = window.innerWidth / Math.max(1, window.innerHeight);
    const cx = F.x + Math.cos(b) * 20, cz = F.z + Math.sin(b) * 20, cy = F.y + 1.25;
    Object.assign(cam, { left: -H * a / 2, right: H * a / 2, top: H / 2, bottom: -H / 2 });
    cam.updateProjectionMatrix();
    cam.position.set(cx, cy, cz); cam.lookAt(F.x, cy, F.z);
    G.uCam.value.set(cx, cz);
    return;
  }
  const s = { ...SHOTS[shotName], ...shotOv }, b = h + s.bearing * DEG;
  const cx = F.x + Math.cos(b) * s.dist, cz = F.z + Math.sin(b) * s.dist, cy = height(cx, cz) + s.up;
  let yaw = h + s.yaw * DEG, p = s.pitch * DEG;
  if (s.aim !== undefined) {
    const dx = F.x - cx, dz = F.z - cz;
    yaw = Math.atan2(dz, dx) + s.yaw * DEG;
    p = Math.atan2(F.y + s.aim - cy, Math.hypot(dx, dz)) + s.pitch * DEG;
  }
  cam.position.set(cx, cy, cz);
  cam.lookAt(cx + Math.cos(yaw) * Math.cos(p), cy + Math.sin(p), cz + Math.sin(yaw) * Math.cos(p));
  if (cam.fov !== s.fov) { cam.fov = s.fov; cam.updateProjectionMatrix(); }
  G.sky.position.set(cx, cy, cz);
  G.uCam.value.set(cx, cz);
}
// drive the walker 20 m to the spot with the script handle, then stand the figure where it stopped
async function figureWalk() {
  const h = FIG_HEADING * DEG, f = [Math.cos(h), Math.sin(h)];
  G.fig.resetTrail();
  outline = null;
  API.setPose({ x: FIG_END.x - f[0] * FIG_TRAIL, z: FIG_END.z - f[1] * FIG_TRAIL, headingDeg: FIG_HEADING, pitchDeg: -4 });
  const d0 = ws.distance;
  API.hold({ fwd: 1 });
  for (let n = 0; n < 3000 && ws.distance - d0 < FIG_TRAIL - 0.3; n++) await API.step(1, { drain: n % 30 === 29 });
  API.release();
  await API.step(45, { drain: false });
  await G.drain();
  G.fig.place(ws.x, height(ws.x, ws.z) - 0.02, ws.z, ((ws.yaw / DEG) % 360 + 360) % 360);
  placeCamera();
  return { x: ws.x, z: ws.z, headingDeg: G.fig.state.headingDeg, walked: +(ws.distance - d0).toFixed(2), steps: API.events.foot, triangles: G.fig.triangles };
}

// the look test's polar grid (mesh=polar)
function buildPolar(THREE, GR) {
  const S = 1024, ratio = 1 + (2 * Math.PI) / S, radii = [];
  for (let r = 0.25; r < GR.rMax; r *= ratio) radii.push(r);
  radii.push(GR.rMax);
  const pos = new Float32Array((1 + radii.length * S) * 3);
  let o = 3;
  for (const r of radii) for (let j = 0; j < S; j++) { const a = (j / S) * 2 * Math.PI; pos[o++] = r * Math.cos(a); pos[o++] = 0; pos[o++] = r * Math.sin(a); }
  const idx = new Uint32Array((S + (radii.length - 1) * S * 2) * 3);
  let k = 0;
  for (let j = 0; j < S; j++) { idx[k++] = 0; idx[k++] = 1 + ((j + 1) % S); idx[k++] = 1 + j; }
  for (let i = 0; i < radii.length - 1; i++) {
    const a0 = 1 + i * S, b0 = 1 + (i + 1) * S;
    for (let j = 0; j < S; j++) { const j1 = (j + 1) % S; idx[k++] = a0 + j; idx[k++] = a0 + j1; idx[k++] = b0 + j; idx[k++] = a0 + j1; idx[k++] = b0 + j1; idx[k++] = b0 + j; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return { geometry: g, levels: 0, vertices: pos.length / 3, triangles: idx.length / 3, reach: GR.rMax };
}

function resize() {
  if (!G) return;
  if (G.fig && outline) { placeShot(); }
  const w = window.innerWidth, h = window.innerHeight;
  // A window with no size (a tab opened in the background, a collapsed pane) has no canvas to draw to:
  // WebGPU rejects a 0x0 swap chain on every frame. Stop the loop until there is a size again.
  if (!(w > 0 && h > 0)) { syncLoop(); return; }
  G.renderer.setPixelRatio(dpr);
  G.renderer.setSize(w, h);
  G.camera.aspect = w / h;
  G.camera.fov = w / h < 1 ? CAM.vfovPortrait : CAM.vfov;
  G.camera.updateProjectionMatrix();
  syncLoop();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- time of day
function setTime(name, instant = false) {
  if (!TIME_NAMES.includes(name)) return;
  markTimeButtons(name);
  if (!G) { timeNow = timeValues(name); return; }
  if (timeFade) { pendingTime = name; return; }
  if (name === timeNow.name) return;
  const to = timeValues(name);
  if (instant) {
    timeNow = to; setAllTime(ws.ground);
    G.shadows.cancelJobs(); G.shadows.reset([ws.x, ws.z], timeNow.shadow);
    return;
  }
  timeFade = { to, phase: 'baking', t: 0, map: -1 };
  G.shadows.beginTime([ws.x, ws.z], to.shadow, (map) => { timeFade.phase = 'fading'; timeFade.map = map; });
}
function updateTime(dt) {
  if (!timeFade || timeFade.phase !== 'fading') return;
  timeFade.t += dt;
  const f = Math.min(1, timeFade.t / TIME_FADE), ff = f * f * (3 - 2 * f);
  applyBlend(G.mats.set, timeNow, timeFade.to, ff, ws.ground);
  if (f >= 1) {
    timeNow = timeFade.to;
    G.shadows.finishTime(timeFade.map);
    timeFade = null;
    setAllTime(ws.ground);
    if (pendingTime && pendingTime !== timeNow.name) { const n = pendingTime; pendingTime = null; setTime(n); }
    else { pendingTime = null; markTimeButtons(timeNow.name); }
  }
}

// ---------------------------------------------------------------- one frame
function pick(ndcX, ndcY) {
  const THREE = G.THREE;
  const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(G.camera).sub(G.camera.position).normalize();
  const o = G.camera.position;
  return raycastGround([o.x, o.y, o.z], [v.x, v.y, v.z]);
}

let lastTap = null;
function tick(dt) {
  const t0 = performance.now();
  const intent = G.fig && G.fig.state.placed ? {} : input.read();
  if (intent.tap) {
    const hit = pick(intent.tap.ndcX, intent.tap.ndcY);
    if (hit) { intent.target = { x: hit.x, z: hit.z }; lastTap = { x: hit.x, z: hit.z }; }
  }
  const events = walker.update(dt, { ...intent, reducedMotion: reduced });
  for (const e of events) {
    G.trace.stamp(e);
    // No step sound while sliding: the slide voice carries it, and the sound module's levels assume the two do not overlap.
    if (e.type === 'foot') { API.events.foot++; if (!(e.slide > 0.5)) { try { sound?.step(e.strength); } catch { /* no sound */ } } }
    else API.events.slide++;
  }
  if (G.fig) G.fig.trail(events, ws, G.trace);
  if (!reduced) simTime += dt;
  placeCamera();
  updateTime(dt);
  const fogBase = ws.ground;
  const f = timeFade && timeFade.phase === 'fading' ? null : timeNow;
  if (f) { G.mats.set('uFog', [f.uFog[0], f.uFog[1], f.uFog[2], fogBase]); G.mats.set('uGroundY', fogBase); }
  const bakeDid = G.shadows.update(dt, [ws.x, ws.z], [ws.vx + ws.sx, ws.vz + ws.sz], timeNow.shadow, reduced);
  // figure look test: the prints do not heal, so the 20 m approach reads as if just walked
  const traceDid = G.trace.update(dt, ws.x, ws.z, !G.fig);
  G.mats.set('uTime', simTime);
  G.renderer.render(G.scene, G.camera);
  try {
    const wnd = walker.wind(simTime);
    sound?.update({ dt, windSpeed: wnd.windSpeed, windDirRel: wnd.windDirRel, exposure: ws.exposure, walkerSpeed: ws.speed, sliding: ws.sliding });
  } catch { /* no sound */ }
  const work = performance.now() - t0;
  return { work, bake: bakeDid, trace: traceDid };
}

function frame(now) {
  const dt = lastNow ? (now - lastNow) / 1000 : 1 / 60;
  if (lastNow) { intervals.push([now, now - lastNow]); }
  lastNow = now;
  while (intervals.length && intervals[0][0] < now - 1000) intervals.shift();
  const r = tick(Math.min(dt, 0.1));
  works.push([now, r.work]);
  while (works.length && works[0][0] < now - 1000) works.shift();
  governor(now);
  if (showFps && now - (frame.lastReadout || 0) > 250) { frame.lastReadout = now; readout(); }
  if (!API.firstFrame) { API.firstFrame = Math.round(performance.now()); }
}

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
function frameStats() {
  const iv = intervals.map((x) => x[1]);
  return { medianMs: +median(iv).toFixed(2), worstMs: +(iv.length ? Math.max(...iv) : 0).toFixed(2), frames: iv.length,
    workMedianMs: +median(works.map((x) => x[1])).toFixed(2) };
}
function governor(now) {
  if (fixedDpr || now - govLast < 1000) return;
  govLast = now;
  const st = frameStats();
  if (st.frames < 5) return;
  if (st.medianMs > 20) { govSlow++; govFast = 0; } else if (st.medianMs < 14) { govFast++; govSlow = 0; } else { govSlow = 0; govFast = 0; }
  if (govSlow >= 2 && dpr > 1) { dpr = Math.max(1, +(dpr - 0.25).toFixed(2)); govSlow = 0; resize(); }
  if (govFast >= 8 && dpr < dprCap) { dpr = Math.min(dprCap, +(dpr + 0.25).toFixed(2)); govFast = 0; resize(); }
}

function bakeLabel() {
  const s = G.shadows, j = s.job;
  if (j) return `${j.purpose === 'time' ? 'baking for the new time' : 'baking ahead'} ${j.slice}/${j.slices}`;
  if (s.stats.state === 'cross-fade') return `cross-fade ${(s.mix * 100).toFixed(0)}%`;
  return `idle (map ${'AB'[s.current]}, ${s.stats.bakes} bakes)`;
}
function readout() {
  const st = frameStats();
  const c = G.renderer.domElement;
  readoutEl.textContent = [
    `Dust Sea walk - ${G.backend}`,
    `pixel ratio ${dpr}${fixedDpr ? ' (fixed)' : ` (cap ${dprCap})`}, canvas ${c.width} x ${c.height}`,
    `frame ${st.medianMs} ms median, ${st.worstMs} ms worst (last second, ${st.frames} frames); work ${st.workMedianMs} ms`,
    `shadows: ${bakeLabel()}`,
    `prints: ${API.events.foot} steps, trace passes ${G.trace.passes}`,
    `at ${ws.x.toFixed(1)}, ${ws.z.toFixed(1)}  heading ${(((ws.yaw / DEG) % 360) + 360) % 360 | 0}  ${ws.speed.toFixed(1)} m/s  slope ${ws.slopeDeg.toFixed(0)}  slide ${ws.sliding.toFixed(2)}`,
    timeFade ? `time: ${timeNow.name} -> ${timeFade.to.name} (${timeFade.phase})` : `time: ${timeNow.name}`,
  ].join('\n');
}

// ---------------------------------------------------------------- loop scheduling
function wantRun() { return !!G && !paused && !document.hidden && onScreen && window.innerWidth > 0 && window.innerHeight > 0; }
function syncLoop() {
  const want = wantRun();
  if (want && !running) { lastNow = 0; G.renderer.setAnimationLoop(frame); running = true; }
  else if (!want && running) { G.renderer.setAnimationLoop(null); running = false; }
  API.running = running;
}
document.addEventListener('visibilitychange', syncLoop);
const io = new IntersectionObserver((ents) => { onScreen = ents.some((e) => e.isIntersecting); syncLoop(); });
io.observe(stage);

// ---------------------------------------------------------------- device loss
let rebuilding = false;
async function onDeviceLost(info) {
  if (rebuilding) return;
  rebuilding = true;
  API.losses++;
  API.lastLoss = { api: info?.api, reason: info?.reason || null };
  const old = G; G = null;
  if (running) { try { old.renderer.setAnimationLoop(null); } catch { /* lost */ } running = false; }
  try { old.renderer.domElement.remove(); old.renderer.dispose(); } catch { /* lost */ }
  if (API.losses > 2) { rebuilding = false; poster('The graphics device was lost and could not be restarted.', 'device lost three times'); return; }
  try { await startGraphics(); } catch (e) { poster('The graphics device was lost and could not be restarted.', e); }
  rebuilding = false;
}

async function startGraphics() {
  G = await buildGraphics();
  API.backend = G.backend;
  timeFade = null;
  setAllTime(ws.ground);
  placeCamera();
  resize();
  G.shadows.reset([ws.x, ws.z], timeNow.shadow);
  G.trace.update(0, ws.x, ws.z, false, true);   // compiles the trace pass
  G.shadows.warm();                              // compiles the sliced bake
  G.renderer.render(G.scene, G.camera);
  await G.drain();
  if (G.fig && !testMode) { hintEl.hidden = true; await figureWalk(); }
  posterEl.hidden = true;
  stage.hidden = false;
  API.ready = true;
  API.clipmap = { n: G.clip.CLIP.n, levels: G.cm.levels, vertices: G.cm.vertices, triangles: G.cm.triangles, reach: G.cm.reach };
  syncLoop();
}

// ---------------------------------------------------------------- the script's handle
const r3 = (v) => Math.round(v * 1000) / 1000;
API.state = () => ({
  x: r3(ws.x), z: r3(ws.z), headingDeg: r3(((ws.yaw / DEG) % 360 + 360) % 360), pitchDeg: r3(ws.pitch / DEG),
  eyeY: r3(walker.eye()[1]), ground: r3(ws.ground), groundPoint: r3(ws.groundPoint),
  eyeAboveGround: r3(walker.eye()[1] - ws.groundPoint), sink: r3(ws.sink), bob: r3(ws.bob),
  speed: r3(ws.speed), sliding: r3(ws.sliding), slopeDeg: r3(ws.slopeDeg), running: r3(ws.running), exposure: r3(ws.exposure),
  distance: r3(ws.distance), steps: ws.steps, target: ws.target ? { x: r3(ws.target.x), z: r3(ws.target.z) } : null,
  time: timeNow.name, timeFade: timeFade ? { to: timeFade.to.name, phase: timeFade.phase, t: r3(timeFade.t) } : null,
  bake: G ? { state: G.shadows.stats.state, job: G.shadows.job, current: G.shadows.current, mix: r3(G.shadows.mix), bakes: G.shadows.stats.bakes, slicesRun: G.shadows.stats.slicesRun, centres: G.shadows.centres } : null,
  trace: G ? { passes: G.trace.passes, queued: G.trace.queued, centre: G.trace.centre } : null,
  frame: frameStats(), dpr, backend: API.backend, running, locked: input.locked, lockRefused: input.lockRefused,
  canvas: G ? [G.renderer.domElement.width, G.renderer.domElement.height] : null, hintGone, sound: sound ? (muted ? 'muted' : 'on') : (soundMod === false ? 'unavailable' : 'not started'),
});
API.hold = (intent) => input.hold(intent);
if (FIGURE) {
  API.figure = {
    walk: () => figureWalk(),
    shot: (name, ov = {}) => { if (SHOTS[name]) shotName = name; shotOv = ov; outline = null; G.camera = G.persp; G.ground.visible = G.sky.visible = true; G.scene.background = null; resize(); placeCamera(); },
    outline: (view) => {
      outline = view; G.camera = G.ortho; G.ground.visible = G.sky.visible = false;
      G.scene.background = new G.THREE.Color().setRGB(0.5, 0.5, 0.5);
      placeCamera();
    },
    info: () => ({ kind: FIGURE, shot: shotName, ...G.fig.state, triangles: G.fig.triangles, lamp: G.fig.lamp }),
  };
}
API.lookOverride = (v) => { lookOv = v; };
API.meshOffset = (v) => { meshOff = v || [0, 0]; };
API.release = () => input.release();
API.pause = () => { paused = true; syncLoop(); };
API.resume = () => { paused = false; syncLoop(); };
API.setPose = (p) => {
  walker.setPose(p);
  if (G) { placeCamera(); G.shadows.cancelJobs(); G.shadows.reset([ws.x, ws.z], timeNow.shadow); if (p.clearTrace !== false) G.trace.clear(); G.trace.update(0, ws.x, ws.z, false); }
};
API.setTime = (name, instant = true) => setTime(name, instant);
// step n frames at a fixed dt with the loop paused; each frame is timed from its start until the
// GPU has finished it (so the figure is the frame's cost, not a vsync interval)
API.step = async (n = 1, { dt = 1 / 60, drain = true, every = 0 } = {}) => {
  const out = { ms: [], bake: [], trace: [], samples: [] };
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    const r = tick(dt);
    if (drain) await G.drain();
    out.ms.push(+(performance.now() - t0).toFixed(3));
    out.bake.push(r.bake === 'slice' ? 1 : r.bake === 'fade' ? 2 : 0);
    out.trace.push(r.trace ? 1 : 0);
    if (every && i % every === 0) out.samples.push(API.state());
  }
  return out;
};
// render the current state again (after a pose or a time change) and wait for the GPU
API.render = async () => { placeCamera(); G.trace.update(0, ws.x, ws.z, false); G.renderer.render(G.scene, G.camera); await G.drain(); };
API.loseDevice = () => {
  if (!G) return false;
  if (G.isGPU) { const d = G.renderer.backend.device; onDeviceLost({ api: 'WebGPU', reason: 'test' }); try { d.destroy(); } catch { /* gone */ } }
  else { const ext = G.renderer.backend.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); else onDeviceLost({ api: 'WebGL', reason: 'test' }); }
  return true;
};
// the trace map's deepest texel near a world point (checks the v-flip and the window maths)
API.traceProbe = async (x, z, r = 0.6) => {
  const T = G.traceMod.TRACE, rt = G.trace.target();
  const data = await G.renderer.readRenderTargetPixelsAsync(rt, 0, 0, T.N, T.N);
  const c = G.trace.centre, N = T.N, texel = T.size / N;
  const rowLen = data.length / N;   // WebGPU pads rows
  let best = 0, bi = -1, bj = -1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const raw = data[j * rowLen + i * 4];
    const v = data instanceof Uint16Array ? G.THREE.DataUtils.fromHalfFloat(raw) : raw;
    if (v < best) { best = v; bi = i; bj = j; }
  }
  // texel (i, j) in the read-back, as world x, z under each of the two row orders
  const wx = c[0] + ((bi + 0.5) / N - 0.5) * T.size;
  const wzA = c[1] + ((bj + 0.5) / N - 0.5) * T.size, wzB = c[1] + ((N - bj - 0.5) / N - 0.5) * T.size;
  return { deepest: best, i: bi, j: bj, worldX: wx, worldZifRowsUp: wzA, worldZifRowsDown: wzB, expect: { x, z }, texel, typed: data.constructor.name };
};

// the two shadow maps' contents, summarised by row bands (debugging and the regression check)
API.mapStats = async () => {
  const out = [];
  for (const rt of [G.rtA, G.rtB]) {
    const d = await G.renderer.readRenderTargetPixelsAsync(rt, 0, 0, rt.width, rt.height);
    const rowLen = d.length / rt.height, bands = [];
    for (let b = 0; b < 8; b++) {
      let mn = Infinity, mx = -Infinity, nan = 0, n = 0;
      for (let j = Math.floor(b * rt.height / 8); j < Math.floor((b + 1) * rt.height / 8); j += 7) for (let i = 0; i < rt.width; i += 13) {
        const raw = d[j * rowLen + i * 2]; const v = d instanceof Uint16Array ? G.THREE.DataUtils.fromHalfFloat(raw) : raw;
        if (Number.isNaN(v)) nan++; else { mn = Math.min(mn, v); mx = Math.max(mx, v); } n++;
      }
      bands.push([+mn.toFixed(3), +mx.toFixed(3), nan, n]);
    }
    out.push({ len: d.length, type: d.constructor.name, rowLen, bands });
  }
  return out;
};

// ---------------------------------------------------------------- go
startGraphics().catch((e) => {
  poster(forceWebGL ? 'WebGL2 did not start on this browser.' : 'Neither WebGPU nor WebGL2 started on this browser.', e);
});
