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
// view=first: the first-person walk as it was before the Pilgrim (the default is third person: the
// Pilgrim, pilgrim.js, followed by a spring camera, follow.js, with sand puffs, puffs.js). V switches
// between the two at runtime.
// storm=off|now|fast: the storm front (storm.js): never; the approach 8 s after ready; every phase and
// the schedule at 4x. seed=N seeds its schedule. With test=1 there is no schedule unless storm= asks.
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
const START_VIEW = FIGURE ? 'first' : q.get('view') === 'first' ? 'first' : 'third';
let viewMode = START_VIEW;

const $ = (id) => document.getElementById(id);
const stage = $('stage'), readoutEl = $('readout'), hintEl = $('hint'), posterEl = $('poster');
if (showFps) readoutEl.hidden = false;
document.body.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);

// the far fog closes before the clipmap's coarsest level ends (it reaches 6144 m)
GRID.rMax = 6000;

// ---------------------------------------------------------------- the walker
// the dusk look's standing point and heading: findCrest() near the origin, 4 m upwind of the top
const top = findCrest();
// First person (and the figure look test) keep it. Third person starts 40 m further back down the
// windward face, heading 40 (the pale sun 21 degrees left of ahead): a 37 m climb to the same crest
// with the sun and the slip faces beyond in view, then a broad crest top; the face drops away at
// about 41 m, so the first slide is the player's choice to keep walking over the brink.
const THIRD_START = { x: top.x - Math.cos(40 * DEG) * 40, z: top.z - Math.sin(40 * DEG) * 40, headingDeg: 40, pitchDeg: CAM.pitchDeg };
const start = START_VIEW === 'third' ? THIRD_START
  : { x: top.x - WIND[0] * CAM.back, z: top.z - WIND[1] * CAM.back, headingDeg: CAM.headingDeg, pitchDeg: CAM.pitchDeg };
const walker = createWalker({ ...start, reducedMotion: reduced });
const ws = walker.state;

let timeNow = timeValues(startName);  // the time of day on screen (suns 1 and 2)
let timeFade = null;                  // { to, phase: 'baking' | 'fading', t, map }
let pendingTime = null;

const API = (window.__walk = { ready: false, backend: null, error: null, reduced, events: { foot: 0, slide: 0, leap: 0, land: 0 }, losses: 0 });
// the storm front (storm.js): its state machine outlives a lost device; made with the graphics
const STORM_MODE = ['off', 'now', 'fast'].includes(q.get('storm')) ? q.get('storm') : null;
const SEED = /^\d{1,10}$/.test(q.get('seed') || '') ? +q.get('seed') : null;
let storm = null, stormMod = null, stormWas = false;
// third person: the figure's heading (turned toward where it wants to go at a limited rate)
let figYaw = ws.yaw, figAngVel = 0, animTime = 0;
let pourKick = 0;   // the crest leap: a landing on a slip face feeds the pour for a moment
let traceC = null, travelDir = [Math.cos(ws.yaw), Math.sin(ws.yaw)];

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
  onView: () => setView(viewMode === 'third' ? 'first' : 'third'),
});
if (START_VIEW === 'first' && !FIGURE) hintEl.querySelector('.desk-only').textContent = 'Click to look around. W A S D to walk, Shift to run. Click the sand to walk there.';
if (START_VIEW === 'first' && !FIGURE) hintEl.querySelector('.touch-only').textContent = 'Left thumb walks, right thumb looks. Tap the sand to walk there.';
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
  // the storm front: not in the figure look test
  stormMod = FIGURE ? null : await import('./storm.js');
  if (stormMod && !storm) storm = stormMod.createStorm({ reduced, seed: SEED, mode: STORM_MODE, testMode });
  const pilMod = FIGURE ? null : await import('./pilgrim.js');
  const figShade = figMod ? figMod.createFigureShading() : pilMod ? (await import('./figure.js')).createFigureShading({ fade: true }) : null;
  // view=first keeps the ground's shader as it was: the figure's shadow, contact and lantern pool
  // are only compiled into the ground when the walk starts in third person (V later shows the
  // Pilgrim without them)
  const groundFig = figShade && (figMod || START_VIEW === 'third') ? figShade : null;
  // third person: the trail must read about 40 m back, so the trace window is larger (same texel)
  // and heals more slowly; the first-person view keeps its own numbers
  if (START_VIEW === 'third' && !FIGURE) Object.assign(traceMod.TRACE, { N: 1536, size: 72, tau: 50, rateCrest: 0.9, blur: 0.12, farTone: 0.22, scarTone: 0.15, scarShade: 0.35, carve: true });

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
  // third person: the pour (sand avalanching down a slip face around a slide), folded into the trace
  const pour = START_VIEW === 'third' && !FIGURE ? (await import('./pour.js')).createPour(renderer) : null;
  const trace = traceMod.createTrace(renderer, pour);
  const uCam = clip.createClipUniform();
  const values = { ...timeNow, uGroundY: ws.ground };
  const mats = createTslMaterials(values, {
    shadows: 'map', normal: 'analytic', ripples: true,
    walk: {
      groundPosition: polar ? null : ({ height }) => clip.clipmapPosition(height, uCam, clip.CLIP.n, pour ? (xz) => pour.disp(xz).add(trace.scarDisp(xz)) : null),
      shadowTexB: rtB.texture,
      trace: trace.hook,
      air: q.get('air') === '0' ? null : air.airHook,
      ...(groundFig ? { figure: groundFig.groundHook } : {}),
      ...(stormMod ? { storm: (a) => stormMod.stormApply(a.col, { ...a, lamp: figShade ? { pos: figShade.uLamp, col: figShade.uLampCol } : null }) } : {}),
    },
  }, rtA.texture);

  if (pour) pour.setHeight(mats.fns.heightD);
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
  const g = { THREE, renderer, isGPU, mats, scene, sky, ground, camera, shadows, trace, pour, uCam, rtA, rtB, cm, drain, clip, traceMod, shMod,
    backend: isGPU ? 'WebGPU (WebGPURenderer, TSL)' : 'WebGL2 (WebGPURenderer, TSL)' };
  if (pilMod) {
    const fog = stormMod ? stormMod.stormFog : null;
    g.pil = pilMod.createPilgrim({ U: mats.uniforms, shade: figShade, scene, reduced, fog });
    g.puffs = (await import('./puffs.js')).createPuffs({ U: mats.uniforms, shade: figShade, scene, fog });
    g.follow = (await import('./follow.js')).createFollow({ reduced });
    g.follow.setYaw(figYaw);
    g.pil.setVisible(viewMode === 'third');
  }
  if (stormMod) g.sand = stormMod.createStormSand({ U: mats.uniforms, shade: figShade, scene, storm, reduced });
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
let camOv = null;    // a script may place the third-person camera itself (stills): { p, t, fov }
function placeCamera() {
  if (G.pil) G.pil.setTime(timeNow.name);
  if (G.pil && viewMode === 'third' && camOv) {   // a script's fixed camera (stills only)
    const cam = G.camera, o = camOv;
    cam.position.set(o.p[0], o.p[1], o.p[2]); cam.lookAt(o.t[0], o.t[1], o.t[2]);
    if (o.fov && cam.fov !== o.fov) { cam.fov = o.fov; cam.updateProjectionMatrix(); }
    G.sky.position.copy(cam.position); G.uCam.value.set(o.p[0] + meshOff[0], o.p[2] + meshOff[1]);
    return;
  }
  if (G.pil && viewMode === 'third') {
    const F = G.follow.state, c = F.cam, cam = G.camera;
    cam.position.set(c[0], c[1], c[2]);
    const h = lookOv ? lookOv.headingDeg * DEG : F.viewYaw, p = lookOv ? lookOv.pitchDeg * DEG : F.viewPitch;
    cam.lookAt(c[0] + Math.cos(h) * Math.cos(p), c[1] + Math.sin(p), c[2] + Math.sin(h) * Math.cos(p));
    G.sky.position.set(c[0], c[1], c[2]);
    G.uCam.value.set(c[0] + meshOff[0], c[2] + meshOff[1]);
    return;
  }
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
// the trace window: centred on the walker in first person; in third person 10 m behind along the
// direction of travel (so the trail reads ~40 m back), moved only when that point is 1.5 m away
function traceCentre() {
  if (viewMode !== 'third' || START_VIEW !== 'third') { traceC = null; return [ws.x, ws.z]; }
  const sp = Math.hypot(ws.vx + ws.sx, ws.vz + ws.sz);
  if (sp > 0.3) { travelDir = [(ws.vx + ws.sx) / sp, (ws.vz + ws.sz) / sp]; }
  const want = [ws.x - travelDir[0] * 10, ws.z - travelDir[1] * 10];
  if (!traceC || Math.hypot(want[0] - traceC[0], want[1] - traceC[1]) > 1.5) traceC = want;
  return traceC;
}
function windNow() {
  const w = walker.wind(animTime);
  const gust = Math.max(0, Math.min(1, 0.5 + 0.35 * Math.sin(animTime * 0.37) * Math.sin(animTime * 0.13 + 1.7) + 0.3 * Math.sin(animTime * 1.1 + Math.sin(animTime * 0.29) * 2)));
  const out = { dir: WIND, strength: Math.min(1.1, 0.25 + w.windSpeed / 8), gust, sound: w };
  if (storm && storm.active) {
    // the storm front: the cloak streams hard, the gusts are the storm's, the lantern's pool brighter
    // and its glow sprite dimmed by the dust between it and the eye
    const sw = storm.wind, sg = storm.gust;
    out.strength += (1.45 + 0.45 * sg - out.strength) * sw;
    out.gust += (sg - out.gust) * sw;
    let lampT = 1;
    if (G && G.pil) { const l = G.pil.state.lamp, c = G.camera.position; lampT = Math.exp(-storm.tauAt(Math.hypot(l[0] - c.x, l[1] - c.y, l[2] - c.z))); }
    out.storm = { k: storm.k, lamp: storm.STORM.lampBoost * storm.k, lampT };
  }
  return out;
}
function stormIntent() { return storm && storm.active && storm.k > 0 ? { k: storm.k, gust: storm.gust, ...storm.STORM } : null; }
// place the figure and the camera without advancing time (start, a new pose, a view switch)
function primeThird() {
  if (!G || !G.pil || viewMode !== 'third') return;
  G.pil.update(0, ws, { heading: figYaw, angVel: 0, wind: windNow(), t: animTime, wish: null });
  G.follow.update(0, { x: ws.x, z: ws.z, ground: ws.ground, speed: 0, sliding: 0, running: 0, travelYaw: null }, {});
}
function setView(mode) {
  if (!G || !G.pil || mode === viewMode) return;
  viewMode = mode;
  if (mode === 'first') { ws.yaw = figYaw; ws.pitch = -4 * DEG; G.pil.setVisible(false); G.puffs.clear(); G.puffs.sprite.visible = false; }
  else { figYaw = ws.yaw; figAngVel = 0; G.follow.setYaw(ws.yaw); G.follow.state.init = false; G.pil.reset(); G.pil.setVisible(true); primeThird(); }
  if (G.camera.fov !== (window.innerWidth / Math.max(1, window.innerHeight) < 1 ? CAM.vfovPortrait : CAM.vfov)) resize();
  placeCamera();
}
function tickThird(dt, intent) {
  const F = G.follow;
  const look = { dx: (intent.lookX || 0) + (intent.turn || 0) * 1.7 * dt, dy: intent.lookY || 0 };
  const [cfx, cfz] = F.forward, crx = -cfz, crz = cfx;
  const wish = [cfx * (intent.fwd || 0) + crx * (intent.strafe || 0), cfz * (intent.fwd || 0) + crz * (intent.strafe || 0)];
  // the figure turns toward where it wants to go: limited rate, eased in and out (no snapping)
  let want = null;
  if (Math.hypot(wish[0], wish[1]) > 0.05) want = Math.atan2(wish[1], wish[0]);
  else if (ws.target && Math.hypot(ws.target.x - ws.x, ws.target.z - ws.z) > 0.35) want = Math.atan2(ws.target.z - ws.z, ws.target.x - ws.x);
  else if (intent.target) want = Math.atan2(intent.target.z - ws.z, intent.target.x - ws.x);
  const spd = Math.hypot(ws.vx, ws.vz);
  const maxRate = spd < 0.5 ? 4.2 : 3.0 + 1.2 * ws.running;
  const targetVel = want === null ? 0 : Math.max(-maxRate, Math.min(maxRate, Math.atan2(Math.sin(want - figYaw), Math.cos(want - figYaw)) * 5));
  figAngVel += (targetVel - figAngVel) * (1 - Math.exp(-dt / 0.12));
  figYaw = Math.atan2(Math.sin(figYaw + figAngVel * dt), Math.cos(figYaw + figAngVel * dt));
  ws.yaw = figYaw;
  // climbing, the steps are shorter (third person only: the walker's default stride is unchanged)
  // the crest leap is third person only (intent.leap)
  const events = walker.update(dt, { wish, run: intent.run, target: intent.target, cancelTarget: intent.cancelTarget, face: true, reducedMotion: reduced, climbStride: 2.2, leap: true, storm: stormIntent() });
  ws.yaw = figYaw;
  const wind = windNow();
  for (const e of events) if (e.type === 'land') G.pil.land(e);
  const stamps = G.pil.update(dt, ws, { heading: figYaw, angVel: figAngVel, wind, t: animTime, wish: [ws.wishX, ws.wishZ] });
  for (const st of stamps) G.trace.stamp(st);
  for (const e of events) {
    if (e.type === 'leap') { e.noPrint = true; continue; }
    if (e.type !== 'land') continue;
    e.noPrint = true;
    const k = Math.min(1, Math.max(0, (Math.abs(e.vy) - 1) / 4));
    // one dent, a short skid along the way it was going: carved (a berm of almost nothing, so no
    // raised ring), lightly darkened as disturbed sand
    const len = 0.3 + 0.15 * k;
    G.trace.stamp({ type: 'slide', x0: e.x, z0: e.z, x1: e.x + e.dirX * len, z1: e.z + e.dirZ * len, depth: 0.025 + 0.03 * k, width: 0.3 + 0.1 * k, berm: 0.01, scar: 0.12, exposure: e.exposure });
    // the burst (sand thrown by the landing is the interaction, so it stays under reduced motion)
    G.puffs.land(e, wind);
    // onto a slip face: the face lets go under the landing and runs from there
    if (e.slip) pourKick = Math.max(pourKick, 0.8 + 0.4 * k);
  }
  for (const e of events) {
    if (e.type !== 'foot') continue;
    const sm = G.pil.foot(e, ws);
    if (sm) G.trace.stamp(sm);
    if (!reduced && !(e.slide > 0.5)) G.puffs.foot(e, wind, [e.dirX, e.dirZ]);
  }
  const tv = Math.hypot(ws.vx, ws.vz) > 0.3 ? Math.atan2(ws.vz, ws.vx) : null;
  const sd = timeNow.uSun1Dir, sh = Math.hypot(sd[0], sd[2]) || 1;
  F.update(dt, { x: ws.x, z: ws.z, ground: ws.ground, speed: Math.hypot(ws.vx + ws.sx, ws.vz + ws.sz), sliding: ws.sliding, running: ws.running, travelYaw: tv,
    slide: [ws.sx, ws.sz], sun: [sd[0] / sh, sd[2] / sh], wind: WIND, airborne: ws.airborne, airHeight: ws.airHeight,
    storm: storm ? storm.boom : 0, stormBoom: storm ? storm.STORM.boom : 0 }, look);
  // the slide scar: no prints while sliding, a broad shallow groove with raised edges instead,
  // scaled with the slide speed (first person keeps the walker's own trough)
  const out = [];
  for (const e of events) {
    if (e.type === 'foot' && e.slide > 0.5) { e.noPrint = true; out.push(e); continue; }
    // it fades in over the brink and out as the slide dies (no stamp with a full-depth round end)
    if (e.type === 'slide') { const k = ws.sliding, fin = Math.min(1, Math.max(0, (k - 0.15) / 0.3)); out.push({ ...e, depth: (0.035 + 0.04 * k) * fin, width: 0.28 + 0.2 * k, berm: 0.85 * fin + 0.01, scar: (0.12 + 0.18 * k) * (0.3 + 0.7 * fin) }); continue; }
    out.push(e);
  }
  return out;
}
// reduced motion: the slide view is a cut, cross-faded from a still of the frame before it
let fadeEl = null, fadeT = 0;
const FADE = 0.4;
const prevPose = { p: null, q: null };
function crossFadeCut() {
  const cam = G.camera, c = G.renderer.domElement;
  if (!prevPose.p) return;
  const p = cam.position.clone(), qn = cam.quaternion.clone();
  cam.position.copy(prevPose.p); cam.quaternion.copy(prevPose.q); cam.updateMatrixWorld(true);
  G.renderer.render(G.scene, cam);
  if (!fadeEl) {
    fadeEl = document.createElement('canvas');
    fadeEl.style.pointerEvents = 'none';
    stage.append(fadeEl);
  }
  fadeEl.width = c.width; fadeEl.height = c.height;
  try { fadeEl.getContext('2d').drawImage(c, 0, 0); fadeT = FADE; } catch { fadeT = 0; }
  fadeEl.style.opacity = fadeT > 0 ? '1' : '0';
  cam.position.copy(p); cam.quaternion.copy(qn); cam.updateMatrixWorld(true);
}
function tickFade(dt) {
  if (!fadeEl || fadeT <= 0) return;
  fadeT = Math.max(0, fadeT - dt);
  fadeEl.style.opacity = String(fadeT / FADE);
}

// the storm front's uniforms, after the time of day has written its own: the light dimmed and
// tinted through storm.modify, the shaders' storm uniforms, the sand racing past. When it ends, the
// time's own values are written back once.
function applyStorm(dt) {
  if (!storm) return;
  if (storm.active) {
    const fading = timeFade && timeFade.phase === 'fading';
    const f = fading ? Math.min(1, timeFade.t / TIME_FADE) : 0, ff = f * f * (3 - 2 * f), b = fading ? timeFade.to : null;
    const mixv = (k) => (b ? timeNow[k].map((x, i) => x + (b[k][i] - x) * ff) : timeNow[k]);
    const base = { sun1Col: mixv('uSun1Col'), sun2Col: mixv('uSun2Col'), sun1Dir: b && ff > 0.5 ? b.uSun1Dir : timeNow.uSun1Dir, sun2Dir: b && ff > 0.5 ? b.uSun2Dir : timeNow.uSun2Dir,
      ambSky: mixv('uAmbSky'), horizon: mixv('uHorizon') };
    const c = G.camera.position;
    storm.apply(base, { x: ws.x, ground: ws.ground, z: ws.z }, [c.x, c.y, c.z]);
    applyBlend((name, v) => G.mats.set(name, storm.modify(name, v)), timeNow, b, ff, ws.ground);
    stormWas = true;
  } else if (stormWas) {
    storm.apply(null, null, null);
    if (!(timeFade && timeFade.phase === 'fading')) setAllTime(ws.ground);
    stormWas = false;
  }
  G.sand?.update(dt, G.camera);
}

function tick(dt) {
  const t0 = performance.now();
  if (G.pil) { if (!prevPose.p) { prevPose.p = G.camera.position.clone(); prevPose.q = G.camera.quaternion.clone(); } else { prevPose.p.copy(G.camera.position); prevPose.q.copy(G.camera.quaternion); } }
  const intent = G.fig && G.fig.state.placed ? {} : input.read();
  if (intent.tap) {
    const hit = pick(intent.tap.ndcX, intent.tap.ndcY);
    if (hit) { intent.target = { x: hit.x, z: hit.z }; lastTap = { x: hit.x, z: hit.z }; }
  }
  animTime += dt;
  // the storm front's clock; when the inside ends every track is gone (the trace and the pour wiped)
  if (storm) {
    const sev = storm.update(dt);
    if (sev.cleared) { G.trace.clear(); G.pour?.clear(); traceC = null; }
  }
  const third = G.pil && viewMode === 'third';
  const si = third ? null : stormIntent();
  const events = third ? tickThird(dt, intent) : walker.update(dt, si ? { ...intent, reducedMotion: reduced, storm: si } : { ...intent, reducedMotion: reduced });
  for (const e of events) {
    if (!e.noPrint) G.trace.stamp(e);
    // No step sound while sliding: the slide voice carries it, and the sound module's levels assume the two do not overlap.
    if (e.type === 'foot') { API.events.foot++; if (!(e.slide > 0.5)) { try { sound?.step(e.strength); } catch { /* no sound */ } } }
    else if (e.type === 'land') { API.events.land++; API.lastLand = e; try { sound?.land?.(Math.min(1, Math.max(0.3, (Math.abs(e.vy) + 0.3 * e.speed) / 5.5))); } catch { /* no sound */ } }
    else if (e.type === 'leap') { API.events.leap++; API.lastLeap = e; }
    else API.events.slide++;
  }
  if (G.fig) G.fig.trail(events, ws, G.trace);
  if (!reduced) simTime += dt;
  placeCamera();
  if (third && G.follow.state.cut) { G.follow.state.cut = false; crossFadeCut(); }
  tickFade(dt);
  if (third) {
    // the key sun for the sand's sprites: whichever of the two is brighter
    const c1 = timeNow.uSun1Col, c2 = timeNow.uSun2Col, b1 = c1[0] + c1[1] + c1[2], b2 = c2[0] + c2[1] + c2[2];
    G.puffs.update(dt, ws, windNow(), G.camera, reduced, b1 >= b2 ? timeNow.uSun1Dir : timeNow.uSun2Dir);
  }
  updateTime(dt);
  applyStorm(dt);
  const fogBase = ws.ground;
  const f = timeFade && timeFade.phase === 'fading' ? null : timeNow;
  if (f) { G.mats.set('uFog', [f.uFog[0], f.uFog[1], f.uFog[2], fogBase]); G.mats.set('uGroundY', fogBase); }
  const bakeDid = G.shadows.update(dt, [ws.x, ws.z], [ws.vx + ws.sx, ws.vz + ws.sz], timeNow.shadow, reduced);
  // figure look test: the prints do not heal, so the 20 m approach reads as if just walked
  pourKick *= Math.exp(-dt / 0.3);
  if (pourKick < 0.03) pourKick = 0;
  if (G.pour) G.pour.update(dt, { x: ws.x, z: ws.z, sx: ws.sx, sz: ws.sz, amount: third ? Math.max(ws.sliding, pourKick) : 0, speed: Math.hypot(ws.vx + ws.sx, ws.vz + ws.sz) });
  const tc = traceCentre();
  G.traceMod.TRACE.healMul = storm && storm.active ? storm.erase : 1;
  const traceDid = G.trace.update(dt, tc[0], tc[1], !G.fig);
  G.mats.set('uTime', simTime);
  G.renderer.render(G.scene, G.camera);
  try {
    const wnd = walker.wind(simTime);
    sound?.update({ dt, windSpeed: wnd.windSpeed, windDirRel: wnd.windDirRel, exposure: ws.exposure, walkerSpeed: ws.speed, sliding: ws.sliding,
      storm: storm && storm.active ? storm.wind : 0, stormGust: storm ? storm.gust : 0.5 });
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
    G.pil ? `view: ${viewMode}${viewMode === 'third' ? `, boom ${G.follow.state.L.toFixed(1)} m (to ${G.follow.state.Lt.toFixed(1)}), raised ${G.follow.state.raised.toFixed(2)} m, puffs ${G.puffs.live}, staff ${G.pil.state.mode}` : ''}` : 'view: figure look test',
    `prints: ${API.events.foot} steps, trace passes ${G.trace.passes}`,
    `at ${ws.x.toFixed(1)}, ${ws.z.toFixed(1)}  heading ${(((ws.yaw / DEG) % 360) + 360) % 360 | 0}  ${ws.speed.toFixed(1)} m/s  slope ${ws.slopeDeg.toFixed(0)}  slide ${ws.sliding.toFixed(2)}`,
    timeFade ? `time: ${timeNow.name} -> ${timeFade.to.name} (${timeFade.phase})` : `time: ${timeNow.name}`,
    storm ? `storm: ${storm.phase}${storm.active ? ` ${storm.state.t.toFixed(0)} s, k ${storm.k.toFixed(2)}, sand ${G.sand ? G.sand.live : 0}` : storm.state.next !== null ? `, next in ${Math.max(0, storm.state.next - storm.state.clock).toFixed(0)} s` : ''}` : 'storm: none',
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
  primeThird();
  placeCamera();
  resize();
  G.shadows.reset([ws.x, ws.z], timeNow.shadow);
  G.trace.update(0, ws.x, ws.z, false, true);   // compiles the trace pass
  G.shadows.warm();                              // compiles the sliced bake
  G.pour?.warm();                                // compiles the pour (third person)
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
  airborne: ws.airborne, airTime: r3(ws.airTime), airHeight: r3(ws.airHeight),
  distance: r3(ws.distance), steps: ws.steps, target: ws.target ? { x: r3(ws.target.x), z: r3(ws.target.z) } : null,
  time: timeNow.name, timeFade: timeFade ? { to: timeFade.to.name, phase: timeFade.phase, t: r3(timeFade.t) } : null,
  bake: G ? { state: G.shadows.stats.state, job: G.shadows.job, current: G.shadows.current, mix: r3(G.shadows.mix), bakes: G.shadows.stats.bakes, slicesRun: G.shadows.stats.slicesRun, centres: G.shadows.centres } : null,
  trace: G ? { passes: G.trace.passes, queued: G.trace.queued, centre: G.trace.centre } : null,
  view: G && G.pil ? viewMode : FIGURE ? 'figure-test' : viewMode,
  cam: G ? { x: r3(G.camera.position.x), y: r3(G.camera.position.y), z: r3(G.camera.position.z), aboveGround: r3(G.camera.position.y - height(G.camera.position.x, G.camera.position.z)),
    boom: G.follow ? r3(G.follow.state.L) : null, boomTarget: G.follow ? r3(G.follow.state.Lt) : null, yawDeg: G.follow ? r3(G.follow.state.yaw / DEG) : null, elevDeg: G.follow ? r3(G.follow.state.elev / DEG) : null,
    raised: G.follow ? r3(G.follow.state.raised) : null, shortened: G.follow ? G.follow.state.shortened : null,
    slideView: G.follow ? r3(G.follow.state.sm) : null, pitchDeg: G.follow ? r3(G.follow.state.viewPitch / DEG) : null } : null,
  figure: G && G.pil ? { headingDeg: r3(((figYaw / DEG) % 360 + 360) % 360), ...G.pil.state } : null,
  puffs: G && G.puffs ? G.puffs.live : null,
  storm: storm ? { phase: storm.phase, t: r3(storm.state.t), k: r3(storm.k) } : null,
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
// the storm front: start({ scale }), state() -> { phase, t, k }, skipTo(phase), hold(bool) (stops the
// phase clock: a storm held inside for a timing run), visibility() (m)
API.storm = {
  start: (o = {}) => storm?.start(o),
  state: () => (storm ? { phase: storm.phase, t: r3(storm.state.t), k: r3(storm.k), next: storm.state.next !== null ? r3(storm.state.next - storm.state.clock) : null } : null),
  skipTo: (phase) => storm?.skipTo(phase),
  hold: (h = true) => storm?.setHold(h),
  visibility: () => (storm ? storm.visNow() : null),
  raw: () => storm?.state,
};
API.lookOverride = (v) => { lookOv = v; };
API.cameraOverride = (v) => { camOv = v; if (!v && G) resize(); };
API.setView = (m) => setView(m);
// orbit the camera as a script; holdS keeps it from swinging back behind the walker for that long
API.orbit = (yawDeg, elevDeg, holdS = 0) => { if (!G || !G.follow) return; const F = G.follow.state; if (yawDeg !== undefined && yawDeg !== null) F.yaw = yawDeg * DEG; if (elevDeg !== undefined && elevDeg !== null) F.elev = elevDeg * DEG; F.sinceLook = -holdS; };
API.meshOffset = (v) => { meshOff = v || [0, 0]; };
API.release = () => input.release();
API.pause = () => { paused = true; syncLoop(); };
API.resume = () => { paused = false; syncLoop(); };
API.setPose = (p) => {
  walker.setPose(p);
  figYaw = ws.yaw; figAngVel = 0; traceC = null; pourKick = 0;
  if (G && G.pil) { G.pil.reset(); G.puffs.clear(); G.follow.setYaw(p.camYawDeg !== undefined ? p.camYawDeg * DEG : ws.yaw); G.follow.state.init = false; G.follow.state.still = 0; G.follow.resetSlide(); primeThird(); }
  if (G) { placeCamera(); G.shadows.cancelJobs(); G.shadows.reset([ws.x, ws.z], timeNow.shadow); if (p.clearTrace !== false) { G.trace.clear(); G.pour?.clear(); } const tc = traceCentre(); G.trace.update(0, tc[0], tc[1], false); }
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
API.render = async () => { placeCamera(); const tc = traceCentre(); G.trace.update(0, tc[0], tc[1], false); G.renderer.render(G.scene, G.camera); await G.drain(); };
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

// the trace map's contents: the largest dent, rim, disturbance and scar anywhere in it, and how many
// texels hold anything (the storm's check that the sand is clean)
API.traceStats = async () => {
  const T = G.traceMod.TRACE, rt = G.trace.target();
  const d = await G.renderer.readRenderTargetPixelsAsync(rt, 0, 0, T.N, T.N);
  const rowLen = d.length / T.N, f = (v) => (d instanceof Uint16Array ? G.THREE.DataUtils.fromHalfFloat(v) : v);
  let dent = 0, rim = 0, dis = 0, scar = 0, n = 0;
  for (let j = 0; j < T.N; j++) for (let i = 0; i < T.N; i++) {
    const o = j * rowLen + i * 4, r = f(d[o]), g = f(d[o + 1]), a = f(d[o + 3]);
    dent = Math.min(dent, r); rim = Math.max(rim, r); dis = Math.max(dis, g); scar = Math.max(scar, a);
    if (Math.abs(r) > 1e-4 || g > 0.005 || a > 0.005) n++;
  }
  return { dent, rim, disturbed: dis, scar, texelsMarked: n, texels: T.N * T.N };
};

// the pour's contents: mass, stopped sand and speed, summed and at their largest (debugging)
API.pourStats = async () => {
  if (!G || !G.pour) return null;
  const rt = G.pour.target(), N = rt.width;
  const d = await G.renderer.readRenderTargetPixelsAsync(rt, 0, 0, N, N);
  const rowLen = d.length / N, f = (v) => (d instanceof Uint16Array ? G.THREE.DataUtils.fromHalfFloat(v) : v);
  let mSum = 0, mMax = 0, dSum = 0, dMax = 0, vMax = 0, n = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = j * rowLen + i * 4, m = f(d[o]), dd = f(d[o + 1]), v = Math.hypot(f(d[o + 2]), f(d[o + 3]));
    mSum += m; dSum += dd; if (m > mMax) mMax = m; if (dd > dMax) dMax = dd; if (v > vMax) vMax = v; if (m > 0.05) n++;
  }
  return { on: G.pour.active, passes: G.pour.passes, mSum: +mSum.toFixed(1), mMax: +mMax.toFixed(3), cellsOver5: n, dSum: +dSum.toFixed(1), dMax: +dMax.toFixed(3), vMax: +vMax.toFixed(2) };
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
