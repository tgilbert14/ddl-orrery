// The orbit, flown: the first flyable slice (see BRIEF.md, "How it plays"). You arrive in the
// arrival still's composition with the shuttle drifting; you fly (flight.js) with a chase camera
// (chase.js); a click, a tap or the world list sets an autopilot course; the nearest world names
// itself; crossing a world's atmosphere is the descent (a flood in its colour, then its page); Space
// pulls back to the whole orrery. The scene is the look test's (hull.js, worlds.js, stars.js,
// shuttle.js, layout.js), lit by the real shared suns.
//
// URL switches: test=1 (no loop until a script asks), r=webgl2, reduced=1, fps=1, dpr=N, seed=N.
// Script handle: window.__orbit (see the end of this file).
import { SUN1, SUN2, DEG, norm, add, sub, mul, dot, cross, len, lin } from './light.js';
import { ARR, arrange, INFO, ORRERY, compressPos } from './layout.js';
import { createControls } from './controls.js';
import { createFlight, dirOf } from './flight.js';
import { createChase } from './chase.js';
import { nearestWorld } from './field.js';

const q = new URLSearchParams(location.search);
const reduced = q.get('reduced') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const showFps = q.get('fps') === '1';
const testMode = q.get('test') === '1';
const forceWebGL = q.get('r') === 'webgl2';
const fixedDpr = /^\d(\.\d+)?$/.test(q.get('dpr') || '') ? Math.min(2, +q.get('dpr')) : null;
const SEED = /^\d{1,10}$/.test(q.get('seed') || '') ? +q.get('seed') : 0;   // the worlds' clock starts here (seconds)

const $ = (id) => document.getElementById(id);
const stage = $('stage'), posterEl = $('poster'), readoutEl = $('readout'), hintEl = $('hint'), titleEl = $('title');
const plateEl = $('plate'), veilEl = $('veil'), floodEl = $('flood'), fadeEl = $('fade'), stickEl = $('stick');
const worldsBtn = $('worldsBtn'), worldsEl = $('worlds'), wholeBtn = $('whole'), logBtn = $('logBtn'), logEl = $('log');
const approachEl = $('approach');
if (showFps) readoutEl.hidden = false;
const touch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', touch);

const API = (window.__orbit = { ready: false, error: null, backend: null, reduced, losses: 0, wouldNavigate: null });
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
const smooth = (t) => { const c = clamp(t, 0, 1); return c * c * c * (c * (c * 6 - 15) + 10); };
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

// ---------------------------------------------------------------- the surveyed set (shared with the hub)
// the hub keeps it in localStorage under 'orrery-surveyed' as a JSON array of slugs (src/05-core.js)
const keep = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked */ } } };
let surveyed = new Set();
try { surveyed = new Set(JSON.parse(keep.get('orrery-surveyed') || '[]')); } catch { /* none */ }
function markSurveyed(slug) {
  surveyed.add(slug);
  keep.set('orrery-surveyed', JSON.stringify([...surveyed]));
  syncSurveyed();
}
function syncSurveyed() {
  for (const a of worldsEl.querySelectorAll('a[data-slug]')) a.querySelector('.tick').hidden = !surveyed.has(a.dataset.slug);
  $('logCount').textContent = String(surveyed.size).padStart(2, '0');
  if (G) lightLamps();
}

// ---------------------------------------------------------------- the worlds and their clocks
const placed = arrange();
const SLUGS = placed.map((w) => w.id);
// each world on its own slow clock: one degree every two to five minutes
const live = placed.map((w, i) => {
  const r = len(w.pos), a = norm(w.pos), b = norm(w.orbitB);
  return { slug: w.id, i, R: w.R, r, a, b, omega: (DEG / (120 + 17 * ((i * 7) % 11))), pos: [...w.pos], show: [...w.pos], showR: w.R, accent: lin(w.accent) };
});
let worldClock = SEED;
function moveWorlds(dt) {
  worldClock += dt;
  for (const w of live) {
    const th = w.omega * worldClock, c = Math.cos(th), s = Math.sin(th);
    w.pos = [(w.a[0] * c + w.b[0] * s) * w.r, (w.a[1] * c + w.b[1] * s) * w.r, (w.a[2] * c + w.b[2] * s) * w.r];
  }
}
moveWorlds(0);

// ---------------------------------------------------------------- flight, camera, controls
const startPose = { pos: [...ARR.shuttle], yaw: ARR.yaw * DEG, pitch: ARR.pitch * DEG, speed: 30 };
const flight = createFlight(startPose);
const chase = createChase({ reduced });
chase.snap(flight.state);
let phase = 'arrival';            // arrival | flight | approach | descent | pulled-back
let autopilot = null;             // slug
let field = null;                 // the collision field (built with the hull)
let hintGone = false;
const hideHint = () => { if (!hintGone) { hintGone = true; hintEl.classList.add('gone'); } };
const controls = createControls(stage, {
  onFirstInput: hideHint,
  onPullBack: (on, how) => { if (how === 'toggle') pullBack(!pull.want); else pullBack(on); },
});

// ---------------------------------------------------------------- pull back to the whole orrery
const pull = { want: false, t: 0, k: 0 };
function pullBack(on) {
  if (reduced && on) return;   // reduced motion: the orrery view is still offered as the list
  if (phase === 'descent') return;
  pull.want = !!on;
  wholeBtn.setAttribute('aria-pressed', String(pull.want));
  if (on) hideHint();
}
wholeBtn.addEventListener('click', () => pullBack(!pull.want));
if (reduced) wholeBtn.hidden = true;

// ---------------------------------------------------------------- DOM: world list, log, nameplate
worldsBtn.addEventListener('click', () => {
  const open = worldsEl.hidden;
  worldsEl.hidden = !open; worldsBtn.setAttribute('aria-expanded', String(open));
  if (open) worldsEl.querySelector('a')?.focus();
});
worldsEl.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-slug]');
  if (!a || !G) return;              // with no graphics the links simply go to the world
  e.preventDefault();
  worldsEl.hidden = true; worldsBtn.setAttribute('aria-expanded', 'false');
  flyTo(a.dataset.slug);
});
worldsEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { worldsEl.hidden = true; worldsBtn.setAttribute('aria-expanded', 'false'); worldsBtn.focus(); } });
logBtn.addEventListener('click', () => { try { logEl.showModal(); } catch { logEl.setAttribute('open', ''); } });
let plateSlug = null;
function showPlate(slug) {
  plateSlug = slug;
  if (!slug) { plateEl.classList.remove('on'); return; }
  plateEl.querySelector('b').textContent = INFO[slug].label;
  plateEl.querySelector('span').textContent = INFO[slug].poem;
  plateEl.classList.add('on');
}

// ---------------------------------------------------------------- graphics
let G = null, running = false, onScreen = true, paused = testMode;
const intervals = [], works = [];
let lastNow = 0, govSlow = 0, govFast = 0, govLast = 0;
const dprCap = Math.min(window.devicePixelRatio || 1, 2);
let dpr = fixedDpr ?? dprCap;

function poster(msg, err) {
  posterEl.hidden = false;
  posterEl.querySelector('.why').textContent = msg;
  document.body.classList.add('poster-on');
  worldsEl.hidden = false;
  veilEl.style.transition = 'none'; veilEl.classList.add('gone');
  API.error = String(err?.message || err || msg);
  API.ready = true;
  stage.hidden = true;
}

async function buildGraphics() {
  const THREE = await import('three/webgpu');
  const { fog, densityFogFactor, vec3, uniform, instancedBufferAttribute, uv, length, exp, float } = await import('three/tsl');
  const { createSky, createStars } = await import('./stars.js');
  const { createHull } = await import('./hull.js');
  const { createWorlds, createWorldPoints, createOrbitLines } = await import('./worlds.js');
  const { createShuttle } = await import('./shuttle.js');
  const { createField } = await import('./field.js');

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL, reversedDepthBuffer: !forceWebGL, powerPreference: 'high-performance' });
  try { await renderer.init(); } catch (e) { try { renderer.dispose(); } catch { /* nothing */ } throw e; }
  const isGPU = renderer.backend.isWebGPUBackend === true;
  if (!forceWebGL && !isGPU) API.fellBack = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(dpr);
  renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight));
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = createSky(), stars = createStars(14000, 7177, 1 / Math.sqrt(dpr));
  const hull = createHull();
  const worlds = createWorlds(placed);
  const points = createWorldPoints(live.map((w) => ({ ...placed[w.i], get pos() { return w.show; }, get R() { return w.showR; } })));
  const fadeU = uniform(0);
  const lines = createOrbitLines(placed, { fade: fadeU });
  const shuttle = createShuttle();
  scene.add(sky, stars, hull, worlds, points, lines, shuttle);
  // the shuttle's mark in the orrery view: one warm point at its place
  const markA = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
  const markU = uniform(0);
  const mm = new THREE.PointsNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, blending: THREE.AdditiveBlending, fog: false });
  mm.positionNode = instancedBufferAttribute(markA);
  const md = length(uv().sub(0.5)).mul(2.0);
  mm.colorNode = vec3(1.6, 1.0, 0.45).mul(exp(md.mul(md).mul(-5.0))).mul(markU);
  mm.opacityNode = float(1.0);
  mm.sizeNode = float(16.0);
  const mark = new THREE.Sprite(mm); mark.count = 1; mark.frustumCulled = false;
  scene.add(mark);
  scene.fogNode = fog(vec3(0.05, 0.032, 0.018), densityFogFactor(0.00016));

  const sun1 = new THREE.DirectionalLight(new THREE.Color().setRGB(...SUN1.col), 1.0);
  sun1.castShadow = true;
  sun1.shadow.mapSize.set(4096, 4096);
  const sc = sun1.shadow.camera;
  sc.left = -1400; sc.right = 1400; sc.top = 1400; sc.bottom = -1400; sc.near = 3000; sc.far = 9500;
  sun1.shadow.bias = -0.0004; sun1.shadow.normalBias = 1.0;
  const sun2 = new THREE.DirectionalLight(new THREE.Color().setRGB(...SUN2.col), 0.45);
  sun2.position.set(...mul(SUN2.dir, 9000));
  const bounce = new THREE.DirectionalLight(new THREE.Color().setRGB(0.55, 0.36, 0.2), 0.32);
  bounce.position.set(-SUN1.dir[0] * 9000, 0.35 * 9000, -SUN1.dir[2] * 9000);
  const amb = new THREE.HemisphereLight(new THREE.Color().setRGB(0.15, 0.135, 0.15), new THREE.Color().setRGB(0.05, 0.032, 0.018), 1.0);
  scene.add(sun1, sun1.target, sun2, bounce, amb);

  const camera = new THREE.PerspectiveCamera(52, Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight), 1, 420000);
  if (!field) field = createField(hull.userData.boxes);
  const drain = async () => {
    if (isGPU) await renderer.backend.device.queue.onSubmittedWorkDone();
    else { const gl = renderer.backend.gl; const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  };
  renderer.onDeviceLost = (info) => { onDeviceLost(info); };
  return { THREE, renderer, isGPU, scene, sky, stars, hull, worlds, points, lines, fadeU, shuttle, mark, markA, markU, sun1, sun2, camera, drain,
    backend: isGPU ? 'WebGPU (WebGPURenderer, TSL)' : 'WebGL2 (WebGPURenderer, TSL)' + (API.fellBack ? ' - FELL BACK: WebGPU did not start' : ''),
    exposure: 1.45, tmpQ: [new THREE.Quaternion(), new THREE.Quaternion()], tmpM: new THREE.Matrix4(), v: new THREE.Vector3() };
}

function lightLamps() {
  const lamps = G.hull.userData.lamps;
  SLUGS.forEach((slug, i) => { if (surveyed.has(slug)) lamps[i].light(live[i].accent); });
}

// ---------------------------------------------------------------- picking a world
function pickWorld(ndcX, ndcY) {
  const v = G.v.set(ndcX, ndcY, 0.5).unproject(G.camera).sub(G.camera.position).normalize();
  const cp = G.camera.position;
  let best = null;
  for (const w of live) {
    const d = [w.show[0] - cp.x, w.show[1] - cp.y, w.show[2] - cp.z], dist = len(d);
    const ang = Math.acos(clamp(dot([v.x, v.y, v.z], d) / dist, -1, 1));
    const rad = Math.asin(clamp(w.showR / dist, 0, 1));
    const reach = Math.max(rad * 1.15, 0.045);
    if (ang < reach && (!best || ang / reach < best.score)) best = { slug: w.slug, score: ang / reach };
  }
  return best ? best.slug : null;
}

// ---------------------------------------------------------------- fly to, descent
function flyTo(slug) {
  if (!SLUGS.includes(slug) || phase === 'descent') return;
  hideHint();
  if (reduced) { reducedChoose(slug); return; }
  autopilot = slug;
  if (phase === 'arrival') phase = 'flight';
  pullBack(false);
}
let descent = null;   // { slug, t, done }
let noNav = false;
function destination(slug) { return new URL(slug === 'dust-sea' ? '../walk/?from=orbit' : `../../#/world/${slug}`, location.href).href; }
function startDescent(slug) {
  if (descent) return;
  phase = 'descent'; autopilot = null; pull.want = false;
  descent = { slug, t: 0, done: false, dur: reduced ? 0.4 : 0.9 };
  const c = live[SLUGS.indexOf(slug)].accent.map((x) => Math.round(Math.pow(x, 1 / 2.2) * 255));
  floodEl.style.background = `radial-gradient(circle at 50% 55%, rgb(${c.map((x) => Math.min(255, x + 90)).join(',')}) 0%, rgb(${c.join(',')}) 60%, rgb(${c.map((x) => Math.round(x * 0.8)).join(',')}) 100%)`;
}
function tickDescent(dt) {
  descent.t += dt;
  floodEl.style.opacity = String(smooth(descent.t / descent.dur));
  if (descent.t >= descent.dur && !descent.done) {
    descent.done = true;
    markSurveyed(descent.slug);
    const url = destination(descent.slug);
    if (noNav) API.wouldNavigate = url;
    else location.href = url;
  }
}
// back from a world's page out of the back/forward cache: clear the flood, and wait at a safe distance
addEventListener('pageshow', (e) => {
  if (!e.persisted || !descent) return;
  const w = live[SLUGS.indexOf(descent.slug)];
  const out = norm(sub(flight.state.pos, w.pos));
  flight.setPose({ pos: add(w.pos, mul(out, w.R * 4)), yaw: Math.atan2(-out[2], -out[0]), pitch: Math.asin(clamp(-out[1], -1, 1)), speed: 0 });
  chase.snap(flight.state);
  descent = null; phase = reduced ? 'arrival' : 'flight'; rView = null; floodEl.style.opacity = '0'; showPlate(null); approachEl.hidden = true;
  syncSurveyed();
});

// ---------------------------------------------------------------- reduced motion: fixed views, Land and Back
let rView = null;   // slug of the approach view on screen, or null (the arrival vista)
function approachPose(w) {
  const dir = norm(add(mul(SUN1.dir, 0.55), mul(norm(sub([0, 0, 0], w.pos)), 0.8)));
  return { cam: add(w.pos, mul(dir, w.R * 4.4)), look: w.pos, shuttle: add(w.pos, mul(dir, w.R * 3.6)), dir };
}
function crossFade(fn) {
  fadeEl.classList.add('on');
  setTimeout(() => { fn(); fadeEl.classList.remove('on'); }, 200);
}
function reducedChoose(slug) {
  crossFade(() => { rView = slug; showPlate(slug); approachEl.hidden = false; phase = 'approach'; $('land').focus({ preventScroll: true }); });
}
$('land').addEventListener('click', () => { if (rView) { approachEl.hidden = true; startDescent(rView); } });
$('back').addEventListener('click', () => crossFade(() => { rView = null; showPlate(null); approachEl.hidden = true; phase = 'arrival'; }));

// ---------------------------------------------------------------- one frame
let lastIntent = null;
function tick(dt) {
  const t0 = performance.now();
  moveWorlds(dt);
  // pull back: eased over 1.5 s; flight is paused while it is up
  pull.t = clamp(pull.t + (pull.want ? dt : -dt) / 1.5, 0, 1);
  pull.k = smooth(pull.t);
  const k = pull.k;
  for (const w of live) {
    w.show = k > 0 ? lerp3(w.pos, compressPos(w.pos), k) : w.pos;
    w.showR = w.R * (1 + (ORRERY.scaleR - 1) * k);
  }
  const intent = phase === 'descent' || reduced ? { thrust: 0, yaw: 0, pitch: 0, steerX: 0, steerY: 0, lookX: 0, lookY: 0, pick: null, steered: false } : controls.read();
  lastIntent = intent;
  if (intent.pick && G) {
    const slug = pickWorld(intent.pick.ndcX, intent.pick.ndcY);
    if (slug) flyTo(slug);
    else if (intent.pick.thenLock && !touch && k < 0.01) controls.requestLock();
  }
  if (intent.steered && autopilot) autopilot = null;
  if (intent.steered && phase === 'arrival') phase = 'flight';

  const near = nearestWorld(flight.state.pos, live);
  const fs = field ? field.sample(flight.state.pos) : { d: 1e9 };
  if (!reduced && phase !== 'descent' && pull.t === 0) {
    const tw = autopilot ? live[SLUGS.indexOf(autopilot)] : null;
    flight.update(dt, { field, room: Math.min(fs.d, near.surfaceDist), target: tw ? { pos: tw.pos, R: tw.R } : null, intent, mode: phase === 'arrival' ? 'arrival' : 'flight' });
  } else if (phase === 'descent' && !reduced) {
    // the camera holds while the shuttle slips on into the air
    flight.update(dt, { field: null, room: 400, target: null, intent: { thrust: 0, yaw: 0, pitch: 0 }, mode: 'arrival' });
  }
  // the nearest world names itself, once per approach
  const nw = live[near.i];
  if (!reduced && phase !== 'descent') {
    if (plateSlug && plateSlug !== nw.slug) showPlate(null);
    if (!plateSlug && pull.t === 0 && near.surfaceDist < nw.R * 4 && near.surfaceDist < fs.d) { showPlate(nw.slug); }
    else if (plateSlug === nw.slug && near.surfaceDist > nw.R * 6) showPlate(null);
    if (pull.t > 0) { phase = 'pulled-back'; if (plateSlug) showPlate(null); }
    else if (phase === 'pulled-back' || phase === 'flight' || phase === 'approach') phase = plateSlug ? 'approach' : 'flight';
    // crossing into the atmosphere shell is the descent
    if (near.surfaceDist < nw.R * 0.14 && pull.t === 0) startDescent(nw.slug);
  }
  if (descent) tickDescent(dt);
  if (!G) return { work: performance.now() - t0 };
  place(dt, intent, near);
  G.renderer.render(G.scene, G.camera);
  return { work: performance.now() - t0 };
}

// the camera, the lights, the worlds' meshes, for this frame
function place(dt, intent, near) {
  const f = flight.state, cam = G.camera, k = pull.k;
  const portrait = window.innerWidth < window.innerHeight;
  let camPos, look, up = [0, 1, 0], fov = portrait ? 84 : 52;
  if (reduced && rView) {
    const P = approachPose(live[SLUGS.indexOf(rView)]);
    camPos = P.cam; look = P.look;
    flight.setPose({ pos: P.shuttle, yaw: Math.atan2(-P.dir[2], -P.dir[0]), pitch: Math.asin(clamp(-P.dir[1], -1, 1)) });
    fov = portrait ? 70 : 46;
  } else {
    if (phase !== 'descent') chase.update(dt, f, intent, field);
    const c = chase.state;
    camPos = c.cam;
    let d = c.dir;
    if (portrait) { const yw = Math.atan2(d[2], d[0]) + 4 * DEG, pt = Math.asin(clamp(d[1], -1, 1)) + 2 * DEG; d = dirOf(yw, pt); }
    look = add(camPos, d);
    const right = norm(cross(d, [0, 1, 0]));
    up = add(mul([0, 1, 0], Math.cos(c.roll)), mul(right, Math.sin(c.roll)));
  }
  if (k > 0) {
    // blend the chase pose into the orrery pose
    cam.position.set(...camPos); cam.up.set(...up); cam.lookAt(...look);
    G.tmpQ[0].copy(cam.quaternion);
    cam.position.set(...ORRERY.cam); cam.up.set(0, 1, 0); cam.lookAt(...ORRERY.look);
    G.tmpQ[1].copy(cam.quaternion);
    cam.position.set(...lerp3(camPos, ORRERY.cam, k));
    cam.quaternion.slerpQuaternions(G.tmpQ[0], G.tmpQ[1], k);
    fov = fov + ((portrait ? ORRERY.vfovPortrait : ORRERY.vfov) - fov) * k;
  } else {
    cam.position.set(...camPos); cam.up.set(...up); cam.lookAt(...look);
  }
  // near plane: reversed depth on WebGPU; on WebGL2 from the distance to the nearest surface
  const cp = [cam.position.x, cam.position.y, cam.position.z];
  const clear = Math.min(field.sample(cp).d, nearestWorld(cp, live).surfaceDist);
  const nearP = G.isGPU ? 1 : clamp(clear * 0.35, 1, 300);
  if (cam.fov !== fov || Math.abs(cam.near - nearP) > 0.01 || cam.aspect !== window.innerWidth / Math.max(1, window.innerHeight)) {
    cam.fov = fov; cam.near = nearP; cam.aspect = window.innerWidth / Math.max(1, window.innerHeight); cam.updateProjectionMatrix();
  }
  cam.updateMatrixWorld();
  // the scene in the orrery view: worlds grow, the ship grows, the orbit lines fade up
  const items = G.worlds.userData.items;
  for (const w of live) items[w.i].set(w.show, w.showR);
  G.hull.scale.setScalar(1 + (ORRERY.scaleShip - 1) * k);
  G.fadeU.value = k;
  for (const [i, line] of G.lines.children.entries()) {
    const w = live[i];
    line.scale.setScalar(k > 0 ? len(w.show) / line.userData.r0 : 1);
    line.visible = k > 0.001;
  }
  // the shuttle (in the orrery view, a warm point at its place)
  const sp = k > 0 ? (len(f.pos) < 6000 ? mul(f.pos, 1 + (ORRERY.scaleShip - 1) * k) : lerp3(f.pos, compressPos(f.pos), k)) : f.pos;
  G.shuttle.position.set(...f.pos);
  G.shuttle.lookAt(...add(f.pos, dirOf(f.yaw, f.pitch)));
  G.shuttle.rotateZ(f.bank);
  G.shuttle.visible = k < 0.5;
  G.markA.setXYZ(0, ...sp); G.markA.needsUpdate = true;
  G.markU.value = k;
  G.sky.position.copy(cam.position); G.stars.position.copy(cam.position);
  const pxPerRad = (window.innerHeight * dpr) / (2 * Math.tan((cam.fov * DEG) / 2));
  G.points.userData.update(cam, pxPerRad);
  // the shadow map follows the shuttle (held over the ship)
  const tgt = [clamp(f.pos[0], -2300, 2300), clamp(f.pos[1], -300, 500), clamp(f.pos[2], -350, 350)];
  G.sun1.target.position.set(...tgt);
  G.sun1.position.set(...add(tgt, mul(SUN1.dir, 6000)));
  // exposure: the arrival still's, easing down a little as a lit planet fills the view
  const nw = live[near.i];
  const ang = Math.asin(clamp(nw.R / Math.max(nw.R, len(sub(nw.pos, cp))), 0, 1));
  const fill = clamp(ang / ((cam.fov * DEG) / 2), 0, 1);
  const want = 1.45 - 0.45 * smooth((fill - 0.45) / 0.55);
  G.exposure += (want - G.exposure) * (dt > 0 ? ease(dt, 2.0) : 1);
  G.renderer.toneMappingExposure = G.exposure;
  // the touch stick
  const st = controls.stick;
  if (st) { stickEl.style.display = 'block'; stickEl.style.left = st.x0 + 'px'; stickEl.style.top = st.y0 + 'px'; stickEl.firstElementChild.style.transform = `translate(${clamp(st.dx, -60, 60)}px, ${clamp(st.dy, -60, 60)}px)`; }
  else stickEl.style.display = 'none';
}

// ---------------------------------------------------------------- the loop, the governor, the readout
function frame(now) {
  const dt = lastNow ? (now - lastNow) / 1000 : 1 / 60;
  if (lastNow) intervals.push([now, now - lastNow]);
  lastNow = now;
  while (intervals.length && intervals[0][0] < now - 1000) intervals.shift();
  const r = tick(Math.min(dt, 0.1));
  works.push([now, r.work]);
  while (works.length && works[0][0] < now - 1000) works.shift();
  governor(now);
  if (showFps && now - (frame.lastReadout || 0) > 250) { frame.lastReadout = now; readout(); }
}
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
function frameStats() {
  const iv = intervals.map((x) => x[1]);
  return { medianMs: +median(iv).toFixed(2), worstMs: +(iv.length ? Math.max(...iv) : 0).toFixed(2), frames: iv.length, workMedianMs: +median(works.map((x) => x[1])).toFixed(2) };
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
function readout() {
  const st = frameStats(), s = API.state();
  readoutEl.textContent = [
    `The Orrery, flown - ${G ? G.backend : 'no graphics'}`,
    `pixel ratio ${dpr}${fixedDpr ? ' (fixed)' : ` (cap ${dprCap})`}`,
    `frame ${st.medianMs} ms median, ${st.worstMs} ms worst; work ${st.workMedianMs} ms`,
    `phase ${s.phase}${s.autopilot ? `, course to ${s.autopilot}` : ''}; ${s.speed.toFixed(0)} m/s (cap ${flight.state.cap.toFixed(0)})`,
    `nearest ${s.nearest.slug} ${(s.nearest.surfaceDist / 1000).toFixed(2)} km; hull ${s.hullDist.toFixed(0)} m`,
  ].join('\n');
}
function resize() {
  if (!G) return;
  const w = window.innerWidth, h = window.innerHeight;
  if (!(w > 0 && h > 0)) { syncLoop(); return; }
  G.renderer.setPixelRatio(dpr);
  G.renderer.setSize(w, h);
  G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
  syncLoop();
}
window.addEventListener('resize', resize);
function wantRun() { return !!G && !paused && !document.hidden && onScreen && window.innerWidth > 0 && window.innerHeight > 0; }
function syncLoop() {
  const want = wantRun();
  if (want && !running) { lastNow = 0; G.renderer.setAnimationLoop(frame); running = true; }
  else if (!want && running) { G.renderer.setAnimationLoop(null); running = false; }
  API.running = running;
}
document.addEventListener('visibilitychange', syncLoop);
new IntersectionObserver((ents) => { onScreen = ents.some((e) => e.isIntersecting); syncLoop(); }).observe(stage);

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
  lightLamps();
  place(0, null, nearestWorld(flight.state.pos, live));
  resize();
  G.renderer.render(G.scene, G.camera);
  await G.drain();
  posterEl.hidden = true;
  stage.hidden = false;
  if (!API.ready) {
    API.ready = true;
    requestAnimationFrame(() => {
      veilEl.classList.add('gone');
      titleEl.classList.add('on');
      setTimeout(() => titleEl.classList.remove('on'), reduced ? 3000 : 4200);
    });
  }
  syncLoop();
}

// ---------------------------------------------------------------- the script's handle
const r3 = (v) => Math.round(v * 1000) / 1000;
API.state = () => {
  const f = flight.state, near = nearestWorld(f.pos, live);
  return {
    pos: f.pos.map(r3), vel: f.vel.map(r3), speed: r3(f.speed), cap: r3(f.cap), headingDeg: r3(((f.yaw / DEG) % 360 + 360) % 360), pitchDeg: r3(f.pitch / DEG), bankDeg: r3(f.bank / DEG),
    nearest: { slug: live[near.i].slug, dist: r3(near.centreDist), surfaceDist: r3(near.surfaceDist) },
    autopilot, phase, hullDist: field ? r3(field.sample(f.pos).d) : null, pushed: r3(f.pushed),
    cam: G ? { pos: [G.camera.position.x, G.camera.position.y, G.camera.position.z].map(r3), boom: r3(chase.state.L), near: r3(G.camera.near), fov: G.camera.fov } : null,
    frame: frameStats(), dpr, surveyed: [...surveyed], pull: r3(pull.k), plate: plateSlug, worldClock: r3(worldClock), exposure: G ? r3(G.exposure) : null, reducedView: rView, lampsLit: G ? G.hull.userData.lamps.filter((l) => l.lit).length : null,
  };
};
API.setPose = (p) => {
  flight.setPose({ pos: p.pos, yaw: p.headingDeg !== undefined ? p.headingDeg * DEG : undefined, pitch: p.pitchDeg !== undefined ? p.pitchDeg * DEG : undefined, speed: p.speed });
  chase.snap(flight.state);
  autopilot = null;
  if (phase === 'arrival') phase = 'flight';
};
API.hold = (intent) => { controls.hold(intent); hideHint(); if (phase === 'arrival') phase = 'flight'; };
API.release = () => controls.release();
API.flyTo = (slug) => flyTo(slug);
API.worlds = () => live.map((w) => ({ slug: w.slug, pos: w.pos.map(r3), R: w.R }));
// clear a finished descent as a return from the world's page would (tests)
API.resetDescent = () => { if (descent) dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); API.wouldNavigate = null; };
API.field = (p) => (field ? { ...field.sample(p), H: field.H(p[0], p[2]), OV: field.OV(p[0], p[2]), body: field.body(p).d } : null);
API.pullBack = (on) => pullBack(on);
API.noNavigate = (v = true) => { noNav = !!v; };
API.pause = () => { paused = true; syncLoop(); };
API.resume = () => { paused = false; syncLoop(); };
API.orbit = (yawDeg, pitchDeg) => { chase.state.oy = yawDeg * DEG; chase.state.op = pitchDeg * DEG; chase.state.since = 0; };
API.step = async (n = 1, { dt = 1 / 60, drain = true } = {}) => {
  const out = { ms: [] };
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    tick(dt);
    if (drain && G) await G.drain();
    out.ms.push(+(performance.now() - t0).toFixed(3));
  }
  return out;
};
API.render = async () => { if (!G) return; place(0, null, nearestWorld(flight.state.pos, live)); G.renderer.render(G.scene, G.camera); await G.drain(); };
API.loseDevice = () => {
  if (!G) return false;
  if (G.isGPU) { const d = G.renderer.backend.device; onDeviceLost({ api: 'WebGPU', reason: 'test' }); try { d.destroy(); } catch { /* gone */ } }
  else { const ext = G.renderer.backend.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); else onDeviceLost({ api: 'WebGL', reason: 'test' }); }
  return true;
};

syncSurveyed();
startGraphics().catch((e) => {
  poster(forceWebGL ? 'WebGL2 did not start on this browser.' : 'Neither WebGPU nor WebGL2 started on this browser.', e);
});
