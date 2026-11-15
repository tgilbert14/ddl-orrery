// The orbit, flown: the first flyable slice (see BRIEF.md, "How it plays"). You arrive in the
// arrival still's composition with the shuttle drifting; you fly (flight.js) with a chase camera
// (chase.js); a click, a tap or the world list sets an autopilot course; the nearest world names
// itself; crossing a world's atmosphere is the descent (a flood in its colour, then its page); M
// pulls back to the whole orrery. The scene is the look test's (hull.js, worlds.js, stars.js,
// shuttle.js, layout.js), lit by the real shared suns.
//
// URL switches: test=1 (no loop until a script asks), r=webgl2, reduced=1, fps=1, dpr=N, seed=N,
// from=<slug> (back from that world's page: parked just outside its air, facing the ship, no title).
// Script handle: window.__orbit (see the end of this file).
import { SUN1, SUN2, DEG, dirYP, norm, add, sub, mul, dot, cross, len, lin } from './light.js';
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
if (reduced) stage.setAttribute('aria-describedby', 'stageInfoReduced');
const touch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', touch);

const API = (window.__orbit = { ready: false, error: null, backend: null, reduced, losses: 0, wouldNavigate: null });
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
const smooth = (t) => { const c = clamp(t, 0, 1); return c * c * c * (c * (c * 6 - 15) + 10); };
const AIM_MAX = 50 * DEG, AIM_TAU = 0.7, AIM_ACC = 0.4;   // the course camera's turn: cap (rad/s), settle (s), ease in (s); see place()
const COURSE_APPROACH = 1.35;   // see tick(): how much sooner a course's approach lets go
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// one step of the course camera's aim toward an error (ey, ep in rad): the wanted rate is the error
// over AIM_TAU, capped at AIM_MAX as a true angle, and the rate eases toward it over AIM_ACC
function aimStep(a, ey, ep, dt) {
  const cp = Math.max(0.2, Math.cos(a.off ? 0 : a.p));
  let wy = ey / AIM_TAU, wp = ep / AIM_TAU;
  const m = Math.hypot(wy * cp, wp);
  if (m > AIM_MAX) { wy *= AIM_MAX / m; wp *= AIM_MAX / m; }
  const k = ease(dt, AIM_ACC);
  a.vy += (wy - a.vy) * k; a.vp += (wp - a.vp) * k;
  a.y += a.vy * dt; a.p += a.vp * dt;
}
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
const fromSlug = SLUGS.includes(q.get('from')) ? q.get('from') : null;
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
// the camera jumps with the shuttle (a new pose): the course camera's own aim and lean go with it
function snapCamera() { chase.snap(flight.state); if (G) { G.aim = null; G.apBias = 0; G.chaseRate = null; } }
chase.snap(flight.state);
let phase = 'arrival';            // arrival | flight | approach | descent | pulled-back
let autopilot = null;             // slug
let field = null;                 // the collision field (built with the hull)
// The title names the place as the veil lifts, then goes; the hint comes only after it (nothing to
// read first), and both go for good the moment the visitor does anything.
let hintGone = false, hintTimer = 0, titleTimer = 0;
const hideTitle = () => { clearTimeout(titleTimer); titleEl.classList.remove('on'); };
const hideHint = () => { hideTitle(); clearTimeout(hintTimer); if (!hintGone) { hintGone = true; hintEl.classList.add('gone'); } };
const showHint = () => { if (!hintGone) hintEl.classList.remove('gone'); };
const controls = createControls(stage, {
  onFirstInput: hideHint,
  onPullBack: (on) => pullBack(on),   // M (hold or tap) and the pinch both say which way they mean
  pullState: () => pull.want,
  shielded: () => !worldsEl.hidden && !document.body.classList.contains('poster-on'),
  reduced,
});

// ---------------------------------------------------------------- sound (another module; optional)
// loaded lazily, started on the first gesture, every call guarded: the page is complete without it
let soundMod = null, sound = null, muted = q.get('mute') === '1';
const muteBtn = $('mute');
import('./sound.js').then((m) => { soundMod = m; }).catch(() => { soundMod = false; muteBtn.disabled = true; muteBtn.textContent = 'No sound'; });
// The context is made and resumed only inside an event that carries user activation (keydown, a
// mouse's pointerdown, and on touch pointerup, touchend or click: a touch's pointerdown does not
// activate), so it is never created suspended; until it runs, every later gesture calls start()
// again (its second call resumes), synchronously inside the handler.
let soundOff = false;   // the poster replaced the scene: the page is silent for good
function onGesture() {
  if (soundOff || !soundMod || typeof soundMod.createSound !== 'function') return;
  const ua = navigator.userActivation;
  if (ua && !ua.isActive) return;
  try {
    if (sound) { if (sound.stats().state === 'running') return; }
    else sound = soundMod.createSound({ muted });
    sound.start().then((ok) => { API.sound = ok ? 'on' : 'refused'; }).catch(() => {});
  } catch { /* the page is complete without sound */ }
}
function silence() {
  soundOff = true;
  try { sound?.dispose(); } catch { /* gone */ }
  sound = null; API.sound = 'off';
}
function setMuteLabel() { muteBtn.textContent = muted ? 'Sound off' : 'Sound on'; muteBtn.setAttribute('aria-pressed', String(muted)); }
setMuteLabel();
muteBtn.addEventListener('click', () => { muted = !muted; setMuteLabel(); onGesture(); try { sound?.setMuted(muted); } catch { /* no sound */ } });
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, onGesture, { capture: true });

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
// the list opens under the bar's real bottom edge (on a narrow phone the bar wraps to two rows)
const barEl = $('bar');
function placeList() {
  if (document.body.classList.contains('poster-on')) { worldsEl.style.top = ''; worldsEl.style.maxHeight = ''; return; }
  const top = Math.round(barEl.getBoundingClientRect().bottom + 8);
  worldsEl.style.top = top + 'px';
  worldsEl.style.maxHeight = `calc(100% - ${top + 16}px)`;
}
function closeList(focusBtn) {
  if (worldsEl.hidden) return;
  // focus first: never hide a container while it holds focus
  if (focusBtn || worldsEl.contains(document.activeElement)) worldsBtn.focus({ preventScroll: true });
  worldsEl.hidden = true; worldsBtn.setAttribute('aria-expanded', 'false');
}
worldsBtn.addEventListener('click', () => {
  if (!worldsEl.hidden) { closeList(true); return; }
  placeList(); hideTitle();
  worldsEl.hidden = false; worldsBtn.setAttribute('aria-expanded', 'true');
  worldsEl.querySelector('a')?.focus();
});
worldsEl.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-slug]');
  if (!a || !G) return;              // with no graphics the links simply go to the world
  e.preventDefault();
  closeList(true);
  flyTo(a.dataset.slug);
});
worldsEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeList(true); });
// a tap or click outside the open list closes it, and that tap sets no course
let swallowPickUntil = 0;
addEventListener('pointerdown', (e) => {
  if (worldsEl.hidden || document.body.classList.contains('poster-on')) return;
  if (worldsEl.contains(e.target) || worldsBtn.contains(e.target)) return;
  closeList(false);
  if (stage.contains(e.target)) swallowPickUntil = performance.now() + 600;
}, { capture: true });
addEventListener('resize', () => { if (!worldsEl.hidden) placeList(); });
logBtn.addEventListener('click', () => {
  hideTitle();
  try { logEl.showModal(); } catch { logEl.setAttribute('open', ''); }
  // open at the top, with focus inside the dialog, so the arrows and Page keys scroll it
  logEl.scrollTop = 0;
  $('logTitle').focus({ preventScroll: true });
});
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
let govBase = Infinity, govWait = 8, govRaisedAt = -1e9;   // the display's own interval (lowest median seen), the climb's patience
const dprCap = Math.min(window.devicePixelRatio || 1, 2);
let dpr = fixedDpr ?? dprCap;

function poster(msg, err) {
  silence();   // the static fallback is silent: the orbit's sound would hang at its last state
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
  // all at once (one after another, each waited for the last's round trip)
  const [THREE, { fog, densityFogFactor, vec3, uniform, instancedBufferAttribute, uv, length, exp, float }, { createSky, createStars }, { createHull, deckAt },
    { createWorlds, createWorldPoints, createOrbitLines }, { createShuttle }, { createField }] = await Promise.all([
    import('three/webgpu'), import('three/tsl'), import('./stars.js'), import('./hull.js'), import('./worlds.js'), import('./shuttle.js'), import('./field.js')]);

  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL, reversedDepthBuffer: !forceWebGL, powerPreference: 'high-performance' });
  // a renderer that never started is not disposed: r186's dispose() then calls setAnimationLoop(),
  // which re-runs the failed init() and leaves an unhandled rejection in the console
  try { await renderer.init(); } catch (e) { if (renderer._initialized) disposeRenderer(renderer); throw e; }
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
  // the fog from two uniforms: the canyon's light blends them toward the hull still's warm haze
  // (a uniform change compiles nothing)
  const fogC = uniform(new THREE.Color(...RIG.arrival.fog)), fogD = uniform(RIG.arrival.fogD);
  scene.fogNode = fog(fogC, densityFogFactor(fogD));

  const sun1 = new THREE.DirectionalLight(new THREE.Color().setRGB(...SUN1.col), 1.0);
  sun1.castShadow = true;
  sun1.shadow.mapSize.set(4096, 4096);
  const sc = sun1.shadow.camera;
  sc.left = -1400; sc.right = 1400; sc.top = 1400; sc.bottom = -1400; sc.near = 3000; sc.far = 9500;
  sun1.shadow.bias = -0.0004; sun1.shadow.normalBias = 1.0;
  const sun2 = new THREE.DirectionalLight(new THREE.Color().setRGB(...SUN2.col), 0.45);
  sun2.position.set(...mul(SUN2.dir, 9000));
  const bounce = new THREE.DirectionalLight(new THREE.Color().setRGB(0.55, 0.38, 0.24), 0.42);
  bounce.position.set(-SUN1.dir[0] * 9000, 0.35 * 9000, -SUN1.dir[2] * 9000);
  const amb = new THREE.HemisphereLight(new THREE.Color().setRGB(0.19, 0.17, 0.19), new THREE.Color().setRGB(0.065, 0.042, 0.025), 1.0);
  // the shuttle's searchlight: a warm cone ahead that lights metal within about 400 m (it lights
  // only surfaces, so in open space it is all but invisible)
  const lamp = new THREE.SpotLight(new THREE.Color().setRGB(1.0, 0.78, 0.5), 90000, 520, 0.5, 0.8, 2);
  scene.add(sun1, sun1.target, sun2, bounce, amb, lamp.target);
  if (q.get('lamp') !== '0') scene.add(lamp);   // lamp=0: without the searchlight (timing only)

  const camera = new THREE.PerspectiveCamera(52, Math.max(1, window.innerWidth) / Math.max(1, window.innerHeight), 1, 420000);
  if (!field) field = createField(hull.userData.boxes);
  const drain = async () => {
    if (isGPU) await renderer.backend.device.queue.onSubmittedWorkDone();
    else { const gl = renderer.backend.gl; const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  };
  renderer.onDeviceLost = (info) => { onDeviceLost(info); };
  return { THREE, renderer, isGPU, scene, lamp, sky, stars, hull, worlds, points, lines, fadeU, shuttle, mark, markA, markU, sun1, sun2, camera, drain,
    backend: isGPU ? 'WebGPU (WebGPURenderer, TSL)' : 'WebGL2 (WebGPURenderer, TSL)' + (API.fellBack ? ' - FELL BACK: WebGPU did not start' : ''),
    deckAt, lights: { bounce, amb, fogC, fogD }, aim: null,
    exposure: 1.45, tmpQ: [new THREE.Quaternion(), new THREE.Quaternion()], tmpM: new THREE.Matrix4(), v: new THREE.Vector3() };
}

function disposeRenderer(r) {
  try { const p = r.dispose(); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch { /* lost */ }
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

// the mouse over a world: the pointer becomes a hand (the world is a thing to click); checked a few
// times a second, only while a mouse is over the scene and not captured
let hoverAt = null, hoverN = 0, hoverOn = false;
stage.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) { hoverAt = null; return; }
  const r = stage.getBoundingClientRect();
  hoverAt = [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)];
});
stage.addEventListener('pointerleave', () => { hoverAt = null; });
function hoverCursor() {
  if (++hoverN % 6 && hoverAt) return;
  const on = !!hoverAt && !controls.locked && phase !== 'descent' && !!pickWorld(hoverAt[0], hoverAt[1]);
  if (on !== hoverOn) { hoverOn = on; stage.classList.toggle('over', on); }
}

// ---------------------------------------------------------------- fly to, descent
function flyTo(slug) {
  if (!SLUGS.includes(slug) || phase === 'descent') return;
  hideHint();
  if (slug === quietSlug) quietSlug = null;   // chosen again: it may name itself on this approach
  if (reduced) { reducedChoose(slug); return; }
  parked = false;
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
  document.body.classList.add('descending');
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
// Back from a world's page (?from=<slug>, or out of the back/forward cache): the shuttle is parked
// just outside that world's air, on its side toward the ship and facing the ship, with no speed. It
// stays put until the first input (so it never descends again by itself), and the world it just left
// does not name itself again until the shuttle has left its approach (6 radii) or it is chosen again.
let parked = false, quietSlug = null;
function parkOutside(slug) {
  const w = live[SLUGS.indexOf(slug)];
  const toShip = norm(sub([0, 0, 0], w.pos));
  // 0.6 radii above the ground (at least 420 m above the air, so the camera's boom stays outside it)
  const pos = add(w.pos, mul(toShip, w.R + Math.max(0.6 * w.R, 0.14 * w.R + 420)));
  const face = norm(sub([0, 0, 0], pos));
  flight.setPose({ pos, yaw: Math.atan2(face[2], face[0]), pitch: Math.asin(clamp(face[1], -1, 1)), speed: 0 });
  flight.state.vel = [0, 0, 0];
  parked = true; quietSlug = slug;
  snapCamera();
}
if (fromSlug) parkOutside(fromSlug);
addEventListener('pageshow', (e) => {
  if (!e.persisted || !descent) return;
  parkOutside(descent.slug);
  autopilot = null; pull.want = false; pull.t = 0;
  descent = null; phase = 'arrival'; rView = null; floodEl.style.opacity = '0'; showPlate(null); approachEl.hidden = true;
  document.body.classList.remove('descending', 'approach-on');
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
  if (slug === rView) return;
  hideTitle();
  crossFade(() => { rView = slug; showPlate(slug); approachEl.hidden = false; document.body.classList.add('approach-on'); phase = 'approach'; $('land').focus({ preventScroll: true }); });
}
$('land').addEventListener('click', () => {
  if (!rView) return;
  if (approachEl.contains(document.activeElement)) worldsBtn.focus({ preventScroll: true });
  approachEl.hidden = true; document.body.classList.remove('approach-on'); startDescent(rView);
});
// Back: to the arrival vista (the approach view moved the shuttle; put it back where the visit began),
// with focus on the Worlds button, moved before the buttons are hidden
$('back').addEventListener('click', () => crossFade(() => {
  if (approachEl.contains(document.activeElement)) worldsBtn.focus({ preventScroll: true });
  rView = null; showPlate(null); approachEl.hidden = true; document.body.classList.remove('approach-on'); phase = 'arrival';
  if (fromSlug) parkOutside(fromSlug); else { flight.setPose({ ...startPose }); snapCamera(); }
}));

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
  // reduced motion still reads the controls, for the pick alone (a world clicked in the view is chosen)
  const read = phase === 'descent' ? null : controls.read();
  const intent = !read || reduced ? { thrust: 0, yaw: 0, pitch: 0, steerX: 0, steerY: 0, lookX: 0, lookY: 0, pick: read ? read.pick : null, steered: false } : read;
  lastIntent = intent;
  if (intent.pick && swallowPickUntil && performance.now() < swallowPickUntil) { intent.pick = null; swallowPickUntil = 0; }   // the tap that closed the list
  if (intent.pick && G) {
    const slug = pickWorld(intent.pick.ndcX, intent.pick.ndcY);
    if (slug) flyTo(slug);
    else if (intent.pick.thenLock && !touch && !reduced && k < 0.01) controls.requestLock();
  }
  if (intent.steered && autopilot) autopilot = null;
  if (intent.steered && phase === 'arrival') phase = 'flight';
  if (parked && (intent.steered || intent.thrust || intent.boost || intent.touchCruise || autopilot)) parked = false;

  const near = nearestWorld(flight.state.pos, live);
  const fs = field ? field.sample(flight.state.pos) : { d: 1e9 };
  if (!reduced && phase !== 'descent' && pull.t === 0 && !parked) {
    const tw = autopilot ? live[SLUGS.indexOf(autopilot)] : null;
    let room = Math.min(fs.d, near.surfaceDist), wNear = { surf: near.surfaceDist, R: live[near.i].R, pos: live[near.i].pos };
    if (tw) {
      // A course is set: what is only being passed limits the speed by how fast it is being closed,
      // not by its distance (room / cos of the angle to it, the cosine floored at 0.2), so the outer
      // worlds are about 15 s away. The target alone brakes the approach (through its own cap). The
      // hull stays distance-based inside 300 m, so a course that runs along the ship never grazes it.
      // Manual flight keeps the distance cap (skimming the hull by hand stays slow).
      const fp = flight.state.pos, fv = dirOf(flight.state.yaw, flight.state.pitch);
      let wr = Infinity;
      for (const w of live) {
        const v = sub(w.pos, fp), dl = len(v), sd = dl - w.R;
        wr = Math.min(wr, w === tw ? sd : sd / Math.max(0.2, dot(fv, v) / dl));
      }
      const into = fs.n ? -dot(fv, fs.n) : 1;
      const hullRoom = fs.d <= 300 ? fs.d : 300 + (fs.d - 300) / Math.max(0.2, into);
      room = Math.min(hullRoom, wr);
      // the target's approach: its distance is read COURSE_APPROACH times long, so a course's last two
      // radii take about four to five seconds (the read distance never reaches the air any sooner;
      // hand flight keeps the true distance)
      wNear = { surf: (len(sub(tw.pos, fp)) - tw.R) * COURSE_APPROACH, R: tw.R, pos: tw.pos };
    }
    flight.update(dt, { field, room, world: wNear, target: tw ? { pos: tw.pos, R: tw.R } : null, intent, mode: phase === 'arrival' ? 'arrival' : 'flight' });
  } else if (phase === 'descent' && !reduced) {
    // the camera holds while the shuttle slips on into the air
    flight.update(dt, { field: null, room: 400, target: null, intent: { thrust: 0, yaw: 0, pitch: 0 }, mode: 'arrival' });
  }
  // the nearest world names itself, once per approach
  const nw = live[near.i];
  if (!reduced && phase !== 'descent') {
    if (quietSlug && (nw.slug !== quietSlug || near.surfaceDist > nw.R * 6)) quietSlug = null;
    if (plateSlug && plateSlug !== nw.slug) showPlate(null);
    if (!plateSlug && pull.t === 0 && near.surfaceDist < nw.R * 4 && near.surfaceDist < fs.d && nw.slug !== quietSlug) { showPlate(nw.slug); }
    else if (plateSlug === nw.slug && near.surfaceDist > nw.R * 6) showPlate(null);
    if (pull.t > 0) { phase = 'pulled-back'; if (plateSlug) showPlate(null); }
    else if (phase === 'pulled-back' || phase === 'flight' || phase === 'approach') phase = plateSlug ? 'approach' : 'flight';
    // crossing into the atmosphere shell is the descent
    if (near.surfaceDist < nw.R * 0.14 && pull.t === 0) startDescent(nw.slug);
  }
  if (descent) tickDescent(dt);
  if (!G) return { work: performance.now() - t0 };
  place(dt, intent, near);
  hoverCursor();
  G.renderer.render(G.scene, G.camera);
  lastSound = soundState(dt, intent);
  if (sound) { try { sound.update(lastSound); } catch { /* the loop never throws for sound */ } }
  return { work: performance.now() - t0 };
}

// what the sound hears this frame (it only reads; nothing here changes the flight)
let lastSound = null;
function soundState(dt, intent) {
  try {
    const cam = G.camera, e = cam.matrixWorld.elements, right = [e[0], e[1], e[2]];
    const cp = [cam.position.x, cam.position.y, cam.position.z];
    const worlds = live.map((w) => {
      const v = sub(w.show, cp), d = len(v);
      return { slug: w.slug, x: Math.max(0, d - w.showR) / w.showR, surf: d - w.showR, pan: dot(v, right) / Math.max(d, 1e-6) };
    });
    const f = flight.state;
    return { dt, hullDist: field.sample(cp).d, speed: f.speed, cap: f.cap, thrust: intent.thrust || (intent.touchCruise ? 0.7 : 0) || (autopilot ? 1 : 0),
      boost: !!intent.boost, bank: f.bank, worlds, pull: pull.k, descent: descent ? { slug: descent.slug, t: descent.t } : null, focus: reduced ? rView : null, plate: plateSlug, yawRate: f.yawRate };
  } catch { return null; }
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
    if (phase !== 'descent') {
      // A course is set: the boom aims at the course, not at the heading, so the camera swings round
      // behind the shuttle relative to the world and the target enters the frame early in a big turn.
      // The aim starts from the camera's own view (and its turn), and turns toward the course with an
      // eased rate: proportional to what is left (so it settles), capped at AIM_MAX, and reached over
      // AIM_ACC (so it never snaps into a turn). When the course ends or the player steers, what is
      // left of the aim is held as an offset from the heading and eased away the same way, so the
      // camera never whips back; the flight and the shuttle's own turn are unchanged.
      let fc = f;
      const cs = chase.state;
      if (autopilot && !reduced) {
        const tw = live[SLUGS.indexOf(autopilot)], v = norm(sub(tw.show, f.pos));
        const ty = Math.atan2(v[2], v[0]), tp = clamp(Math.asin(clamp(v[1], -1, 1)), -1.25, 1.25);
        if (!G.aim || G.aim.off) G.aim = G.aim ? { y: f.yaw + G.aim.y, p: f.pitch + G.aim.p, vy: G.aim.vy, vp: G.aim.vp } : { y: cs.yaw, p: cs.pitch, vy: G.chaseRate ? G.chaseRate[0] : 0, vp: G.chaseRate ? G.chaseRate[1] : 0 };
        aimStep(G.aim, wrapPi(ty - G.aim.y), tp - G.aim.p, dt);
        fc = { ...f, yaw: G.aim.y, pitch: G.aim.p };
      } else if (G.aim) {
        if (!G.aim.off) G.aim = { off: true, y: wrapPi(G.aim.y - f.yaw), p: G.aim.p - f.pitch, vy: 0, vp: 0 };
        aimStep(G.aim, -G.aim.y, -G.aim.p, dt);
        if (Math.hypot(G.aim.y, G.aim.p) < 0.3 * DEG) G.aim = null;
        else fc = { ...f, yaw: f.yaw + G.aim.y, pitch: f.pitch + G.aim.p };
      }
      const py = cs.yaw, pp = cs.pitch;
      chase.update(dt, fc, intent, field);
      if (dt > 0) G.chaseRate = [wrapPi(cs.yaw - py) / dt, (cs.pitch - pp) / dt];
    }
    const c = chase.state;
    camPos = c.cam;
    let d = c.dir;
    if (portrait) { const yw = Math.atan2(d[2], d[0]) + 4 * DEG, pt = Math.asin(clamp(d[1], -1, 1)) + 2 * DEG; d = dirOf(yw, pt); }
    // a course is set: lean the view toward the target (up to 16 degrees, easing in and out), so the
    // world enters the frame early in the turn and stays in it (over 1.4 s, so the lean adds little turn)
    G.apBias = clamp((G.apBias || 0) + (autopilot ? dt : -dt) / 1.4, 0, 1);
    if (autopilot) G.apSlug = autopilot;
    if (G.apBias > 0 && G.apSlug) {
      const tw = live[SLUGS.indexOf(G.apSlug)], toT = norm(sub(tw.show, camPos));
      const ang = Math.acos(clamp(dot(d, toT), -1, 1));
      if (ang > 1e-4) {
        const a = Math.min(ang, 16 * DEG * smooth(G.apBias));
        let ax = cross(d, toT); const al = len(ax);
        ax = al > 1e-6 ? mul(ax, 1 / al) : [0, 1, 0];
        const c = Math.cos(a), s2 = Math.sin(a), kd = dot(ax, d);
        d = norm(add(add(mul(d, c), mul(cross(ax, d), s2)), mul(ax, kd * (1 - c))));
      }
    }
    // while the course camera has its own aim, the shuttle is kept well inside the frame: past half
    // way to the edge, the view is drawn toward it, softly (it can never pass 0.7 of the way out)
    if (G.aim || G.apBias > 0) d = keepInFrame(d, camPos, f.pos, fov, window.innerWidth / Math.max(1, window.innerHeight));
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
  // near plane: reversed depth on WebGPU; on WebGL2 from the distance to the nearest surface, and
  // the shuttle on its boom counts as a surface (less its 15 m half-span and glow), so the near plane
  // never cuts into it
  const cp = [cam.position.x, cam.position.y, cam.position.z];
  const camHull = field.sample(cp).d;
  let clear = Math.min(camHull, nearestWorld(cp, live).surfaceDist);
  if (k < 0.5) clear = Math.min(clear, len(sub(f.pos, cp)) - 15);
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
  {
    const fd = dirOf(f.yaw, f.pitch);
    G.lamp.position.set(...add(f.pos, mul(fd, 6)));
    G.lamp.target.position.set(...add(f.pos, add(mul(fd, 200), [0, -18, 0])));
    G.lamp.intensity = 90000 * (1 - k);   // intensity, not visibility: a light switched off would recompile every lit material
  }
  G.markA.setXYZ(0, ...sp); G.markA.needsUpdate = true;
  G.markU.value = k;
  G.sky.position.copy(cam.position); G.stars.position.copy(cam.position);
  const pxPerRad = (window.innerHeight * dpr) / (2 * Math.tan((cam.fov * DEG) / 2));
  G.points.userData.update(cam, pxPerRad);
  // the shadow map follows the shuttle (held over the ship)
  const tgt = [clamp(f.pos[0], -2300, 2300), clamp(f.pos[1], -300, 500), clamp(f.pos[2], -350, 350)];
  // exposure: the arrival still's, easing down a little as a lit planet fills the view
  const nw = live[near.i];
  const ang = Math.asin(clamp(nw.R / Math.max(nw.R, len(sub(nw.pos, cp))), 0, 1));
  const fill = clamp(ang / ((cam.fov * DEG) / 2), 0, 1);
  // ... and easing up (over about 2.5 s) as the camera gets in close to the hull, back down in open light
  const hullK = 1 - smooth((camHull - 60) / 400);
  G.hullK = (G.hullK ?? hullK) + (hullK - (G.hullK ?? hullK)) * (dt > 0 ? ease(dt, 2.5) : 1);
  const want = (1.45 - 0.45 * smooth((fill - 0.45) / 0.55)) * (1 + 0.7 * G.hullK);
  G.exposure += (want - G.exposure) * (dt > 0 ? ease(dt, 2.0) : 1);
  G.renderer.toneMappingExposure = G.exposure;
  canyonLight(dt, cp, tgt);
  // the target ring: tracks the course's world on screen, clamped to the frame edge with a pointer
  placeRing(cam, k);
  // the touch stick
  const st = controls.stick;
  if (st) { stickEl.style.display = 'block'; stickEl.style.left = st.x0 + 'px'; stickEl.style.top = st.y0 + 'px'; stickEl.firstElementChild.style.transform = `translate(${clamp(st.dx, -60, 60)}px, ${clamp(st.dy, -60, 60)}px)`; }
  else stickEl.style.display = 'none';
}

function keepInFrame(d, from, p, fovDeg, aspect) {
  const th = Math.tan((fovDeg * DEG) / 2), tw = th * aspect;
  const toS = norm(sub(p, from));
  for (let i = 0; i < 3; i++) {
    const r = norm(cross(d, [0, 1, 0])), u = cross(r, d), z = dot(toS, d);
    const x = z > 0.05 ? dot(toS, r) / z / tw : 9, y = z > 0.05 ? dot(toS, u) / z / th : 9, m = Math.hypot(x, y);
    if (m <= 0.5) break;
    const want = 0.5 + 0.2 * Math.tanh((m - 0.5) / 0.2);
    d = norm(lerp3(d, toS, 1 - want / m));
  }
  return d;
}

// ---------------------------------------------------------------- the canyon's light
// In the lane down the middle of the ship the metal takes the approved hull still's rig (look.js,
// shot 'hull': frames/hull.jpg) instead of the arrival rig: the pale sun higher and from further
// port, so it reaches the lane floor in shafts; the red sun and the warm bounce down, a neutral
// bounce and a cooler sky fill; and the still's warm haze. Only the lights on metal move: the sky
// and the worlds keep SUN1.dir, so the sun discs never move. The blend cK is the hull ease (2.5 s)
// times a lane mask on the camera, itself eased (1 s: 2.2 s from 90% to 10%); the haze also takes the unsmoothed mask, so
// it is gone before the camera clears the walls (else the far hull washes out).
// LANE is copied from hull.js (const LANE, which shapes the lane); keep the two the same.
const LANE = { z0: -10, z1: 100, x0: -1120, x1: 1700 };   // source: hull.js LANE
const LANE_SLACK = 30, LANE_TOP = 150, LANE_SOFT = 40;
const RIG = {
  arrival: { s1: 1.0, s2: 0.45, bounce: [0.55, 0.38, 0.24], bounceI: 0.42, bounceUp: 0.35, sky: [0.19, 0.17, 0.19], ground: [0.065, 0.042, 0.025], half: 1400, nb: 1.0,
    fog: [0.05, 0.032, 0.018], fogD: 0.00016 },
  canyon: { dir: norm(dirYP(-68, 38)), s1: 1.9, s2: 0.14, bounce: [0.46, 0.42, 0.40], bounceI: 0.75, bounceUp: 0.25, sky: [0.15, 0.17, 0.23], ground: [0.09, 0.07, 0.05], half: 1000, nb: 0.6,
    fog: [0.22, 0.12, 0.045], fogD: 0.0009 },
};
function laneMask(p) {
  const out = Math.max(LANE.x0 - LANE_SLACK - p[0], p[0] - LANE.x1 - LANE_SLACK, LANE.z0 - LANE_SLACK - p[2], p[2] - LANE.z1 - LANE_SLACK, 0);
  const xc = clamp(p[0], LANE.x0, LANE.x1), zc = clamp(p[2], LANE.z0, LANE.z1);
  const over = p[1] - (G.deckAt(xc, zc) + LANE_TOP);
  return (1 - smooth(out / LANE_SOFT)) * (1 - smooth(over / LANE_SOFT + 0.5));
}
function canyonLight(dt, cp, tgt) {
  const m = laneMask(cp);
  const want = G.hullK * m;
  G.cK = G.cK === undefined || !(dt > 0) ? want : G.cK + (want - G.cK) * ease(dt, 1.0);
  const c = smooth(G.cK), A = RIG.arrival, B = RIG.canyon, L = G.lights;
  const mix = (a, b) => a + (b - a) * c;
  const dir = c > 0 ? norm(lerp3(SUN1.dir, B.dir, c)) : SUN1.dir;
  G.sun1.target.position.set(...tgt);
  G.sun1.position.set(...add(tgt, mul(dir, 6000)));
  G.sun1.intensity = mix(A.s1, B.s1);
  G.sun2.intensity = mix(A.s2, B.s2);
  L.bounce.color.setRGB(...lerp3(A.bounce, B.bounce, c));
  L.bounce.intensity = mix(A.bounceI, B.bounceI);
  L.bounce.position.set(-dir[0] * 9000, mix(A.bounceUp, B.bounceUp) * 9000, -dir[2] * 9000);
  L.amb.color.setRGB(...lerp3(A.sky, B.sky, c));
  L.amb.groundColor.setRGB(...lerp3(A.ground, B.ground, c));
  const half = Math.round(mix(A.half, B.half));
  const sc = G.sun1.shadow.camera;
  if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
  G.sun1.shadow.normalBias = mix(A.nb, B.nb);
  const fk = smooth(Math.min(G.cK, m));
  L.fogC.value.setRGB(...lerp3(A.fog, B.fog, fk));
  L.fogD.value = A.fogD + (B.fogD - A.fogD) * fk;
}

const ringEl = $('target');
function placeRing(cam, k) {
  if (!autopilot || k > 0.01 || reduced || phase === 'descent') { ringEl.hidden = true; return; }
  const tw = live[SLUGS.indexOf(autopilot)], W = window.innerWidth, H = window.innerHeight;
  const cp = [cam.position.x, cam.position.y, cam.position.z], e = cam.matrixWorld.elements;
  const fwd = [-e[8], -e[9], -e[10]], toT = sub(tw.show, cp), dist = len(toT);
  const v = G.v.set(...tw.show).project(cam);
  let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
  const front = dot(toT, fwd) > 0;
  if (!front) { sx = W - sx; sy = H - sy; }
  const rpx = (tw.showR / dist) * (H / 2) / Math.tan((cam.fov * DEG) / 2);
  const m = 34;
  const off = !front || sx < m || sx > W - m || sy < m || sy > H - m;
  if (off) {
    const dx = sx - W / 2, dy = sy - H / 2, s = Math.min((W / 2 - m) / Math.max(1e-3, Math.abs(dx)), (H / 2 - m) / Math.max(1e-3, Math.abs(dy)));
    sx = W / 2 + dx * Math.min(s, front ? 1 : s); sy = H / 2 + dy * Math.min(s, front ? 1 : s);
    sx = clamp(sx, m, W - m); sy = clamp(sy, m, H - m);
  }
  const big = rpx > H * 0.42;
  ringEl.hidden = big && !off;
  ringEl.classList.toggle('quiet', plateSlug === autopilot && !off);
  const size = off ? 26 : clamp(rpx * 2.3, 34, 260);
  ringEl.style.transform = `translate(${sx}px, ${sy}px)`;
  ringEl.style.setProperty('--s', size + 'px');
  ringEl.classList.toggle('off', off);
  ringEl.querySelector('.arrow').style.transform = `rotate(${Math.atan2(sy - H / 2, sx - W / 2)}rad)`;
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
// The pixel ratio: down a step after 2 s slower than 20 ms a frame; up a step after a spell at the
// display's own frame interval. The interval is vsync-quantised (it never falls below 16.7 ms on a
// 60 Hz display), so "fast" means at the lowest median seen (with 20% headroom, never stricter than
// the old 14 ms), not under a fixed number. A climb that is undone within 5 s doubles the wait before
// the next try (8 s, 16, 32 ... up to 2 min), so a GPU that cannot hold the higher ratio is not
// asked every few seconds.
function governor(now) {
  if (fixedDpr || now - govLast < 1000) return;
  govLast = now;
  const st = frameStats();
  if (st.frames < 5) return;
  govBase = Math.min(govBase, Math.max(4, st.medianMs));
  const fastBelow = Math.max(14, govBase * 1.2);
  if (st.medianMs > 20) { govSlow++; govFast = 0; } else if (st.medianMs < fastBelow) { govFast++; govSlow = 0; } else { govSlow = 0; govFast = 0; }
  if (govSlow >= 2 && dpr > 1) {
    dpr = Math.max(1, +(dpr - 0.25).toFixed(2)); govSlow = 0;
    if (now - govRaisedAt < 5000) govWait = Math.min(120, govWait * 2);
    resize();
  }
  if (govFast >= govWait && dpr < dprCap) { dpr = Math.min(dprCap, +(dpr + 0.25).toFixed(2)); govFast = 0; govRaisedAt = now; resize(); }
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
  try { old.renderer.domElement.remove(); } catch { /* gone */ }
  disposeRenderer(old.renderer);
  if (API.losses > 2) { rebuilding = false; poster('The graphics stopped and could not restart, so the orbit is shown as a still.', 'device lost three times'); return; }
  try { await startGraphics(); } catch (e) { poster('The graphics stopped and could not restart, so the orbit is shown as a still.', e); }
  rebuilding = false;
}

async function startGraphics() {
  G = await buildGraphics();
  API.backend = G.backend;
  lightLamps();
  place(0, null, nearestWorld(flight.state.pos, live));
  resize();
  // compile every pipeline now, behind the veil: every world, its atmosphere, the orbit lines and
  // the marker (a world seen for the first time used to stall a frame for its shaders)
  const saved = [];
  G.scene.traverse((o) => { if (o.isMesh || o.isLine || o.isSprite) { saved.push([o, o.frustumCulled, o.visible]); o.frustumCulled = false; o.visible = true; } });
  try { await G.renderer.compileAsync(G.scene, G.camera); } catch { /* compiled on first sight instead */ }
  G.renderer.render(G.scene, G.camera);
  for (const [o, fc, vis] of saved) { o.frustumCulled = fc; o.visible = vis; }
  place(0, null, nearestWorld(flight.state.pos, live));
  G.renderer.render(G.scene, G.camera);
  await G.drain();
  posterEl.hidden = true;
  stage.hidden = false;
  if (!API.ready) {
    API.ready = true;
    requestAnimationFrame(() => {
      veilEl.classList.add('gone');
      // the title rises as the veil thins (0.4 s in), holds, and goes; then the hint. Back from a
      // world (from=) there is no title: the hint, if still wanted, comes soon.
      if (!fromSlug && !hintGone) {
        titleTimer = setTimeout(() => {
          titleEl.classList.add('on');
          titleTimer = setTimeout(() => titleEl.classList.remove('on'), reduced ? 2800 : 3600);
        }, reduced ? 0 : 400);
      }
      hintTimer = setTimeout(showHint, fromSlug ? 1200 : reduced ? 3400 : 5200);
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
    frame: frameStats(), dpr, surveyed: [...surveyed], boost: !!(lastIntent && lastIntent.boost), capNow: r3(flight.state.cap * (lastIntent && lastIntent.boost ? 2 : 1)), sound: sound ? { ...sound.stats(), muted } : null, pull: r3(pull.k), plate: plateSlug, worldClock: r3(worldClock), exposure: G ? r3(G.exposure) : null, reducedView: rView, lampsLit: G ? G.hull.userData.lamps.filter((l) => l.lit).length : null,
  };
};
API.setPose = (p) => {
  flight.setPose({ pos: p.pos, yaw: p.headingDeg !== undefined ? p.headingDeg * DEG : undefined, pitch: p.pitchDeg !== undefined ? p.pitchDeg * DEG : undefined, speed: p.speed });
  snapCamera();
  autopilot = null;
  if (phase === 'arrival') phase = 'flight';
};
API.hold = (intent) => { controls.hold(intent); hideHint(); if (phase === 'arrival') phase = 'flight'; };
API.release = () => controls.release();
API.flyTo = (slug) => flyTo(slug);
API.soundState = () => lastSound;
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
API.lampInfo = () => G && { pos: G.lamp.position.toArray(), tgt: G.lamp.target.position.toArray(), I: G.lamp.intensity, inScene: !!G.lamp.parent };
API.render = async () => { if (!G) return; place(0, null, nearestWorld(flight.state.pos, live)); G.renderer.render(G.scene, G.camera); await G.drain(); };
API.loseDevice = () => {
  if (!G) return false;
  if (G.isGPU) { const d = G.renderer.backend.device; onDeviceLost({ api: 'WebGPU', reason: 'test' }); try { d.destroy(); } catch { /* gone */ } }
  else { const ext = G.renderer.backend.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); else onDeviceLost({ api: 'WebGL', reason: 'test' }); }
  return true;
};

syncSurveyed();
startGraphics().catch((e) => {
  poster(forceWebGL ? 'This browser could not start WebGL2, so the orbit is shown as a still.' : 'This browser could not draw the orbit in 3D, so it is shown as a still.', e);
});
