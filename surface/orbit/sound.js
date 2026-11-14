// sound.js: the orbit's sound. Plain Web Audio, every sample generated here: no files, no network,
// no ScriptProcessor and no AudioWorklet (oscillators, seeded noise buffers, filters, gains).
//
// Round two, after the owner listened: "mysterious and almost horror esk, like alien or the dead
// space game, bioshock". Dread through restraint: mostly near-silence and deep space, with rare,
// specific, physical events. No tune, no engine drone, nothing that keeps playing at you.
//   - The derelict (by the camera's distance to the hull, richest in the canyon): a sub bed felt
//     more than heard (two detuned sines beating), a dark room of noise, the ship breathing (one
//     slow swell every 7 to 10 s), metal under stress (groans, creaks, ticks of cooling metal, a far
//     clank), panned to a side, deep in a long cavernous reverb. The heartbeat is rare (about one
//     beat in six on the hub's 2.4 s grid), and the Artifact's 196 -> 185 reply is an event, once
//     in 25 to 45 s near the ship, from far inside.
//   - Space between: almost nothing; a faint low cluster that shifts over tens of seconds, a faint
//     metallic shimmer, and once in 30 to 60 s something far off (a ping, a dead radio's carrier, a
//     breath that is almost a voice).
//   - The worlds: each a presence, not a melody: a drone on its hub root and one or two of its scale
//     tones, slow filter movement, and one sparse signature texture.
//   - The shuttle: breath under thrust, a whoosh when boost opens, a tiny servo tick in hard turns.
//   - A world becoming the nearest thing swells slowly (3 s); the descent bends its drone apart into
//     a dissonant cluster under a rising rush of air; pulled back, all eleven drones sound quietly
//     as one glassy chord over the sub bed.
// Round three ("more unpredictable instead of steady ... once in a while it should fade away and come
// back ... uncertain and eerie"): no continuous layer holds still. Each wanders in level, filter and
// pitch (a few incommensurate slow sines plus a seeded random walk, 5 to 90 s, different per layer);
// each drops out on its own now and then (fades to true silence, stays gone, returns a little
// changed); every two to four minutes the dropouts line up and everything is gone for a few seconds,
// and near the ship a single event may sit in that silence, or nothing does. The air in the dead
// ventilation gusts, stutters and whistles; faint systems still run (a telemetry chirp, a relay's
// ticks, a buzz that flickers and dies), rarely; the ship breathes in runs, then not at all. The
// live sound is seeded from the clock, so every visit differs.
// Every pitch is the hub score's (src/07-audio.js): the ship on the hub's A (220 Hz), each world on
// its arrangement's root and scale.
//
// Contract (unchanged): createSound(opts?) -> { start(), update(state), setMuted(bool), dispose(), stats() }
//   start() inside a user gesture; resolves true (playing) or false; never throws.
//   update({ dt, hullDist, speed, cap, thrust, boost, bank, yawRate, worlds: [{ slug, x, surf, pan }],
//            pull, descent: { slug, t } | null, plate: slug | null, focus: slug | null })
//   stats() -> { persistentNodes, state, events: [{ t, type, src, pan }] } (the last 400 events)
//   renderScene(statesFn, { seconds, events }) renders offline (tests) and returns the event log too.

const TAU = Math.PI * 2;

// The mix, as named levels (linear gains). Measured offline (see the report); nobody has listened.
export const ORBIT_MIX = {
  master: 0.62,       // into the compressor
  sub: 0.005,         // the derelict's sub bed at the hull (felt; most of the body is now the room's)
  room: 0.05,         // its dark room of noise
  roomBody: 2.0,      // ... the room's 120-500 Hz body (relative to its dark noise)
  systems: 0.03,      // chirps, relay ticks, a buzz (near the ship, rare)
  whistle: 0.006,     // the dead ventilation's whistle
  breath: 0.05,       // the ship breathing (close only)
  metal: 0.2,         // groans, creaks, ticks, clanks (each event, near the hull)
  heart: 0.22,        // a rare heartbeat (very close)
  reply: 0.05,        // the 196 -> 185 answer from inside (mostly reverb)
  cluster: 0.02,      // space between: the low cluster
  shimmer: 0.018,     // ... the metallic shimmer
  far: 0.05,          // ... a far event (ping, carrier, breath)
  drone: 0.07,        // a world's drone at its threshold
  texture: 0.11,      // ... its signature events at the threshold
  swell: 0.06,        // the nearest-world swell
  orrery: 0.15,       // each drone's share when pulled back
  thrust: 0.02,       // the shuttle's breath under thrust
  whoosh: 0.05, servo: 0.025,
  rush: 0.15,         // the descent's air at the flood's peak
  cave: 0.75,         // the long reverb's return
};

// the hub's arrangements (src/07-audio.js ARR): root Hz, scale; the drone's tones are scale degrees
export const VOICES = {
  'dust-sea': { root: 98.0, scale: [0, 1, 4, 5, 7, 8, 10], tones: [0, 1], lp: 380 },
  velocity: { root: 174.6, scale: [0, 2, 3, 5, 7, 8, 10], tones: [0, 6], lp: 900 },
  grid: { root: 164.8, scale: [0, 2, 3, 7, 10], tones: [0, 3], lp: 1100 },
  abyssal: { root: 130.8, scale: [0, 2, 4, 6, 8, 10], tones: [0, 3], lp: 420 },
  arcadia: { root: 261.6, scale: [0, 2, 4, 7, 9], tones: [0, 2], lp: 900 },
  aurora: { root: 196.0, scale: [0, 2, 4, 5, 7, 9, 10], tones: [0, 4], lp: 1600 },
  uncharted: { root: 220.0, scale: [0, 2, 5, 7, 10], tones: [0, 2], lp: 600 },
  archive: { root: 155.6, scale: [0, 2, 4, 6, 7, 9, 11], tones: [0, 3], lp: 700 },
  drillyard: { root: 146.8, scale: [0, 2, 3, 5, 7, 9, 10], tones: [0, 3], lp: 500 },
  stormwall: { root: 110.0, scale: [0, 2, 3, 5, 7, 8, 10], tones: [0, 3], lp: 420 },
  beacons: { root: 110.0, scale: [0, 2, 4, 7, 9], tones: [0, 3], lp: 600 },
};
const SLUGS = Object.keys(VOICES);
const A = 55;          // the ship's A (the hub's 220, two octaves down)
const PULSE = 2.4;     // the hub's 600 ms step, a heartbeat every fourth

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const semi = (f, s) => f * Math.pow(2, s / 12);
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise(ctx, rnd, seconds, kind, rate = ctx.sampleRate) {
  const fade = Math.floor(rate * 0.25), n = Math.floor(rate * seconds) + fade;
  const buf = ctx.createBuffer(1, n, rate), d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, y = 0, s = 0;
  for (let i = 0; i < n; i++) {
    const w = (rnd() * 2 - 1) * 1.732;
    if (kind === 'white') d[i] = w;
    else if (kind === 'brown') { y = (y + 0.02 * w) * 0.998; d[i] = y; }
    else {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
    }
    s += d[i] * d[i];
  }
  const k = 0.3 / (Math.sqrt(s / n) || 1);
  for (let i = 0; i < n; i++) d[i] *= k;
  for (let i = 0; i < fade; i++) { const t = i / fade; d[i] = d[i] * Math.sqrt(t) + d[n - fade + i] * Math.sqrt(1 - t); }
  return { buf, loopEnd: (n - fade) / rate };
}
// a long cavernous space: 7 s of decaying noise, darker as it fades, with some air left in it
function cave(ctx, rnd, seconds) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n, a = Math.exp(-t * 6.5) * Math.min(1, i / (sr * 0.03));
      const w = rnd() * 2 - 1; y += (w - y) * (0.85 - 0.6 * t);
      d[i] = (y * 0.88 + w * 0.12 * (1 - t)) * a;
    }
    // energy-normalised: the cave returns about half the level sent into it, spread over seconds
    let e = 0; for (let i = 0; i < n; i++) e += d[i] * d[i];
    const k = 0.5 / Math.sqrt(e || 1); for (let i = 0; i < n; i++) d[i] *= k;
  }
  return buf;
}
function softClip() {
  const n = 4097, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x); c[i] = Math.sign(x) * (ax <= 0.5 ? ax : 0.5 + 0.2 * Math.tanh((ax - 0.5) / 0.2)); }
  return c;
}

export function createSound(opts = {}) {
  const external = opts.context || null;
  const seed = opts.seed != null ? opts.seed >>> 0 : (Date.now() ^ 0x5bd1e995) >>> 0;   // every visit differs
  const rnd = mulberry32(seed), ev = mulberry32(seed ^ 0x51ed270b);
  const bedOnly = !!opts.bedOnly;   // tests: the continuous beds alone, no events
  let ctx = null, g = null, dead = false, muted = !!opts.muted, disposed = false, hidden = false, visHandler = null;
  let ready = Promise.resolve(false);
  const st = { nodes: 0, log: [], nextBeat: 0, nextMetal: 0, lastMetal: '', nextReply: 0, nextBreath: 0, nextFar: 0, lastFar: '',
    world: {}, plate: null, boostWas: false, nextServo: 0, descentSlug: null, near: 0 };

  const now = () => ctx.currentTime;
  const set = (p, v, tau) => { p.setTargetAtTime(v, now(), tau); };
  const log = (type, src, pan) => { st.log.push({ t: +now().toFixed(2), type, src, pan: +pan.toFixed(2) }); if (st.log.length > 400) st.log.shift(); };
  const pick = (arr) => arr[Math.floor(ev() * arr.length)];

  function build() {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.5;
    const clip = ctx.createWaveShaper(); clip.curve = softClip(); clip.oversample = 'none';
    const mute = ctx.createGain(); mute.gain.value = muted ? 0 : 1;
    const fade = ctx.createGain(); fade.gain.value = 0;
    const mix = ctx.createGain(); mix.gain.value = ORBIT_MIX.master;
    mix.connect(fade); fade.connect(mute); mute.connect(comp); comp.connect(clip); clip.connect(ctx.destination);
    const verb = ctx.createConvolver(); verb.normalize = false; verb.buffer = cave(ctx, rnd, 7.0);
    const verbOut = ctx.createGain(); verbOut.gain.value = ORBIT_MIX.cave; verb.connect(verbOut); verbOut.connect(mix);
    const white = noise(ctx, rnd, 9.7, 'white'), pink = noise(ctx, rnd, 11.3, 'pink', 24000), brown = noise(ctx, rnd, 12.7, 'brown', 12000);
    const loop = (e, off) => { const s = ctx.createBufferSource(); s.buffer = e.buf; s.loop = true; s.loopEnd = e.loopEnd; s.start(now(), e.loopEnd * off); return s; };
    const sources = [];
    count(10);

    // ---- the derelict: sub bed (55 Hz against 55.35 and the fifth below, beating), dark room
    const subG = ctx.createGain(); subG.gain.value = 0; subG.connect(mix);
    const subOsc = [];
    for (const [f, a] of [[A, 0.5], [A + 0.35, 0.45], [A * 0.75, 0.35]]) {
      const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = a;
      o.connect(og); og.connect(subG); o.start(); sources.push(o); subOsc.push(o); count(2);
    }
    // the room: dark noise plus a 120-500 Hz body (audible on small speakers), through a flutter
    // gain (the dead ventilation's stutters) into its level
    const roomSrc = loop(brown, rnd()); sources.push(roomSrc);
    const roomLp = ctx.createBiquadFilter(); roomLp.type = 'lowpass'; roomLp.frequency.value = 160; roomLp.Q.value = 0.4;
    const bodySrc = loop(pink, rnd()); sources.push(bodySrc);
    const bodyBp = ctx.createBiquadFilter(); bodyBp.type = 'bandpass'; bodyBp.frequency.value = 260; bodyBp.Q.value = 0.9;
    const bodyG = ctx.createGain(); bodyG.gain.value = ORBIT_MIX.roomBody;
    const roomFl = ctx.createGain(); roomFl.gain.value = 1;
    const roomG = ctx.createGain(); roomG.gain.value = 0;
    roomSrc.connect(roomLp); roomLp.connect(roomFl); bodySrc.connect(bodyBp); bodyBp.connect(bodyG); bodyG.connect(roomFl);
    roomFl.connect(roomG); roomG.connect(mix);
    count(6);
    const roomS = ctx.createGain(); roomS.gain.value = 0.4; roomG.connect(roomS); roomS.connect(verb);
    // the breath: band-passed pink noise; its level is shaped by scheduled swells
    const brSrc = loop(pink, rnd()); sources.push(brSrc);
    const brBp = ctx.createBiquadFilter(); brBp.type = 'bandpass'; brBp.frequency.value = 380; brBp.Q.value = 1.4;
    const brEnv = ctx.createGain(); brEnv.gain.value = 0;
    const brG = ctx.createGain(); brG.gain.value = 0;
    brSrc.connect(brBp); brBp.connect(brEnv); brEnv.connect(brG); brG.connect(mix);
    const brS = ctx.createGain(); brS.gain.value = 0.6; brG.connect(brS); brS.connect(verb);
    count(11);

    // ---- space between: a low cluster (A, B flat, E: the hub's minor-second rub) that shifts
    const clG = ctx.createGain(); clG.gain.value = 0; clG.connect(mix);
    const clLp = ctx.createBiquadFilter(); clLp.type = 'lowpass'; clLp.frequency.value = 500; clLp.connect(clG);
    const clS = ctx.createGain(); clS.gain.value = 0.5; clG.connect(clS); clS.connect(verb);
    const clOsc = [];
    for (const f of [110, semi(110, 1), semi(110, 7) / 2, semi(220, 3)]) {
      const o = ctx.createOscillator(); o.frequency.value = f; o.detune.value = (rnd() - 0.5) * 10; clOsc.push(o);
      const og = ctx.createGain(); og.gain.value = 0.15;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.012 + rnd() * 0.03; const ld = ctx.createGain(); ld.gain.value = 0.14;
      lfo.connect(ld); ld.connect(og.gain); o.connect(og); og.connect(clLp); o.start(); lfo.start(); sources.push(o, lfo); count(4);
    }
    // a faint metallic shimmer: inharmonic high partials drifting in and out, mostly in the cave
    const shG = ctx.createGain(); shG.gain.value = 0; shG.connect(mix);
    const shS = ctx.createGain(); shS.gain.value = 1.5; shG.connect(shS); shS.connect(verb);
    for (const f of [3117, 4729, 6311, 8893]) {
      const o = ctx.createOscillator(); o.frequency.value = f; const og = ctx.createGain(); og.gain.value = 0;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.03 + rnd() * 0.05; const ld = ctx.createGain(); ld.gain.value = 0.25;
      lfo.connect(ld); ld.connect(og.gain); o.connect(og); og.connect(shG); o.start(); lfo.start(); sources.push(o, lfo); count(4);
    }
    count(5);

    // ---- the shuttle: breath under thrust (no tone)
    const thSrc = loop(pink, rnd()); sources.push(thSrc);
    const thBp = ctx.createBiquadFilter(); thBp.type = 'bandpass'; thBp.frequency.value = 420; thBp.Q.value = 0.8;
    const thG = ctx.createGain(); thG.gain.value = 0;
    const thPan = ctx.createStereoPanner();
    thSrc.connect(thBp); thBp.connect(thG); thG.connect(thPan); thPan.connect(mix);
    // the descent's air
    const ruSrc = loop(pink, rnd()); sources.push(ruSrc);
    const ruLp = ctx.createBiquadFilter(); ruLp.type = 'lowpass'; ruLp.frequency.value = 200;
    const ruG = ctx.createGain(); ruG.gain.value = 0;
    ruSrc.connect(ruLp); ruLp.connect(ruG); ruG.connect(mix);
    count(8);

    // ---- the worlds: a drone on the root (an octave down) and one or two scale tones, a lowpass that
    // moves slowly; level -> pan -> mix and the cave
    const worlds = {};
    for (const slug of SLUGS) {
      const v = VOICES[slug];
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = v.lp; lp.Q.value = 2.5;
      const flfo = ctx.createOscillator(); flfo.frequency.value = 0.02 + rnd() * 0.04; const fld = ctx.createGain(); fld.gain.value = v.lp * 0.45;
      flfo.connect(fld); fld.connect(lp.frequency); flfo.start(); sources.push(flfo);
      const level = ctx.createGain(); level.gain.value = 0;
      const pan = ctx.createStereoPanner();
      lp.connect(level); level.connect(pan); pan.connect(mix);
      const sv = ctx.createGain(); sv.gain.value = 0.7; pan.connect(sv); sv.connect(verb);
      const oscs = [];
      v.tones.forEach((deg, i) => {
        const f = semi(v.root, v.scale[deg]) * (i === 0 ? 0.5 : 1);
        for (const dt of [-4, 4]) {
          const o = ctx.createOscillator(); o.type = i === 0 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = dt + (rnd() - 0.5) * 3;
          const og = ctx.createGain(); og.gain.value = i === 0 ? 0.35 : 0.18;
          o.connect(og); og.connect(lp); o.start(); oscs.push(o); sources.push(o);
        }
      });
      // glass for the orrery chord: a quiet partial two octaves and a fifth up, heard only pulled back
      const gl = ctx.createOscillator(); gl.frequency.value = semi(v.root, 7) * 2 * (1 + (rnd() - 0.5) * 0.006);
      const glG = ctx.createGain(); glG.gain.value = 0; gl.connect(glG); glG.connect(pan); gl.start(); sources.push(gl);
      // the texture bus (signature events), its own level so the drone and the events balance
      const tex = ctx.createGain(); tex.gain.value = 0; tex.connect(pan);
      const texW = ctx.createGain(); texW.gain.value = 0; texW.connect(verb);
      worlds[slug] = { v, lp, level, pan, oscs, oscBase: oscs.map((o) => o.detune.value), glG, tex, texW, bus: { dry: tex, wet: texW }, lvl: 0, next: 0, steady: null };
      count(9 + oscs.length * 2);
    }
    // dust sea's wind hiss and velocity's hum: continuous textures, under their world's texture bus
    {
      const ds = worlds['dust-sea'];
      const s = loop(white, rnd()); sources.push(s);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
      const gg = ctx.createGain(); gg.gain.value = 0.045;
      const gust = ctx.createOscillator(); gust.frequency.value = 0.09; const gd = ctx.createGain(); gd.gain.value = 0.03;
      gust.connect(gd); gd.connect(gg.gain); gust.start(); sources.push(gust);
      s.connect(hp); hp.connect(lp); lp.connect(gg); gg.connect(ds.tex);
      const ve = worlds.velocity;
      const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = VOICES.velocity.root / 2;
      const hbp = ctx.createBiquadFilter(); hbp.type = 'bandpass'; hbp.frequency.value = 350; hbp.Q.value = 3;
      const hg = ctx.createGain(); hg.gain.value = 0.1;
      hum.connect(hbp); hbp.connect(hg); hg.connect(ve.tex); hum.start(); sources.push(hum);
      ve.steady = hg;
      count(12);
    }
    g = { mix, fade, mute, comp, clip, verb, white, pink, brown, subG, subOsc, roomG, roomLp, roomFl, bodyBp, brEnv, brG, clG, clLp, clOsc, shG, thG, thBp, thPan, ruG, ruLp, worlds, sources };
  }
  function count(n) { st.nodes += n; }

  // ---------------------------------------------------------------- one-shot building blocks
  // an output for an event: panned, dry and into the cave
  function outlet(pan, dry, wet, dest) {
    const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1);
    const d = ctx.createGain(); d.gain.value = dry; const w = ctx.createGain(); w.gain.value = wet;
    p.connect(d); d.connect(dest ? dest.dry : g.mix); p.connect(w); w.connect(dest ? dest.wet : g.verb);
    return { input: p, nodes: [p, d, w] };
  }
  function release(nodes, at) {
    const id = setTimeout(() => { for (const n of nodes) { try { n.disconnect(); } catch { /* gone */ } } }, Math.max(0, (at - now()) * 1000 + 200));
    if (external) clearTimeout(id);
  }
  // noise through a filter whose frequency bends, under an envelope
  function noiseEv(when, { buf = g.white, type = 'bandpass', f0, f1 = f0, q = 1, a = 0.01, hold = 0, d = 0.5, peak = 0.1, pan = 0, dry = 0.6, wet = 0.6, dest = null }) {
    const s = ctx.createBufferSource(); s.buffer = buf.buf; s.loop = true; s.loopEnd = buf.loopEnd;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, when); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + a + hold + d);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(peak, when + a);
    if (hold) e.gain.setValueAtTime(peak, when + a + hold);
    e.gain.setTargetAtTime(0, when + a + hold, d / 4);
    const o = outlet(pan, dry, wet, dest);
    s.connect(f); f.connect(e); e.connect(o.input);
    const end = when + a + hold + d * 1.6;
    s.start(when, ev() * buf.loopEnd); s.stop(end);
    release([s, f, e, ...o.nodes], end);
  }
  // a tone that may bend, under an envelope
  function toneEv(when, { type = 'sine', f0, f1 = f0, a = 0.01, d = 1, peak = 0.05, pan = 0, dry = 0.6, wet = 0.6, detune = 0, bendT = null, dest = null }) {
    const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(f0, when);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, when + (bendT ?? a + d));
    const e = ctx.createGain(); e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(peak, when + a); e.gain.setTargetAtTime(0, when + a, d / 4);
    const out = outlet(pan, dry, wet, dest);
    o.connect(e); e.connect(out.input);
    const end = when + a + d * 1.6;
    o.start(when); o.stop(end);
    release([o, e, ...out.nodes], end);
  }

  // ---------------------------------------------------------------- the derelict's events
  function metal(when, near, kind) {
    const kinds = ['groan', 'creak', 'ticks', 'clank'].filter((k) => k !== st.lastMetal);
    const k = kind || pick(kinds); st.lastMetal = k;
    const pan = (ev() < 0.5 ? -1 : 1) * (0.4 + ev() * 0.5), L = ORBIT_MIX.metal * (0.25 + 0.75 * near);
    if (k === 'groan') {
      const f = semi(A * 2, [0, 1, 3, 7][Math.floor(ev() * 4)]) * (1 + ev() * 0.5), dur = 1.5 + ev() * 2.5;
      noiseEv(when, { f0: f, f1: f * 0.62, q: 14, a: 0.4, hold: dur * 0.4, d: dur, peak: L * 1.3, pan, dry: 0.35, wet: 1 });
      toneEv(when + 0.1, { type: 'triangle', f0: f * 0.5, f1: f * 0.29, a: 0.6, d: dur, peak: L * 0.25, pan, dry: 0.3, wet: 1 });
    } else if (k === 'creak') {
      const n = 4 + Math.floor(ev() * 6), f = 900 + ev() * 900;
      for (let i = 0; i < n; i++) noiseEv(when + i * (0.045 + ev() * 0.05), { f0: f * (1 + ev() * 0.2), q: 9, a: 0.004, d: 0.06, peak: L * 0.45, pan, dry: 0.5, wet: 0.8 });
    } else if (k === 'ticks') {
      const n = 3 + Math.floor(ev() * 5);
      let t = when;
      for (let i = 0; i < n; i++) { toneEv(t, { f0: 2400 + ev() * 3000, a: 0.002, d: 0.05, peak: L * 0.22, pan: pan + (ev() - 0.5) * 0.3, dry: 0.4, wet: 1 }); t += 0.12 + ev() * 0.6; }
    } else {
      // a distant heavy clank: a dull hit and inharmonic partials with a long tail
      noiseEv(when, { buf: g.brown, type: 'lowpass', f0: 260, f1: 90, q: 0.7, a: 0.006, d: 0.5, peak: L * 2.2, pan, dry: 0.3, wet: 1 });
      for (const [r, a] of [[1, 0.5], [2.29, 0.3], [4.07, 0.18], [5.81, 0.1]]) toneEv(when, { f0: 112 * r, a: 0.004, d: 2.2 / r + 0.6, peak: L * a * 0.6, pan, dry: 0.15, wet: 1 });
    }
    log(k, 'ship', pan);
  }
  function breath(when, near) {
    const up = 2.2 + ev() * 1.2, down = 3 + ev() * 1.5, pk = 0.6 + ev() * 0.4, caught = ev() < 0.22;
    const e = g.brEnv.gain;
    if (caught) { e.setTargetAtTime(pk * 0.55, when, up / 3); e.setTargetAtTime(0, when + up * 0.5, 0.3); }   // it catches, halfway
    else { e.setTargetAtTime(pk, when, up / 3); e.setTargetAtTime(0, when + up, down / 3); }
    log(caught ? 'breath-caught' : 'breath', 'ship', 0);
  }
  // ---- systems still running (near the ship, rare, never rhythmic), and the dead ventilation
  function system(kind, when) {
    const L = ORBIT_MIX.systems, pan = (ev() - 0.5) * 1.4;
    if (kind === 'chirp') {
      // telemetry: blips on three pitches, uneven gaps, and it stops mid-pattern
      const fs = [1760, 2217, 2637].map((f) => f * (ev() < 0.5 ? 1 : 0.5)), n = 5 + Math.floor(ev() * 10);
      let t = when;
      for (let i = 0; i < n; i++) { toneEv(t, { f0: fs[Math.floor(ev() * 3)], a: 0.004, d: 0.04 + ev() * 0.04, peak: L * 0.18, pan, dry: 0.45, wet: 0.7 }); t += 0.05 + ev() * 0.26; }
    } else if (kind === 'relay') {
      const n = 4 + Math.floor(ev() * 7); let t = when;
      for (let i = 0; i < n; i++) { noiseEv(t, { type: 'highpass', f0: 2200 + ev() * 1500, q: 0.8, a: 0.002, d: 0.025, peak: L * 0.35, pan, dry: 0.5, wet: 0.6 }); t += 0.08 + ev() * 0.45; }
    } else if (kind === 'buzz') {
      // a far electrical buzz that flickers on and dies
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 110 * (1 + (ev() - 0.5) * 0.01);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3;
      const e = ctx.createGain(); e.gain.setValueAtTime(0, when);
      let t = when; const dur = 1 + ev() * 2;
      while (t < when + dur) { e.gain.setTargetAtTime(L * (0.03 + ev() * 0.05), t, 0.015); t += 0.06 + ev() * 0.25; if (ev() < 0.4) { e.gain.setTargetAtTime(0, t, 0.015); t += 0.05 + ev() * 0.2; } }
      e.gain.setTargetAtTime(0, t, 0.08);
      const out = outlet(pan, 0.4, 0.8);
      o.connect(bp); bp.connect(e); e.connect(out.input); o.start(when); o.stop(t + 0.8);
      release([o, bp, e, ...out.nodes], t + 0.8);
    } else if (kind === 'whistle') {
      // air through a dead duct: a faint tone that appears for a few seconds and bends away
      const f = 700 + ev() * 800, dur = 3 + ev() * 3;
      toneEv(when, { f0: f, f1: f * (ev() < 0.5 ? 0.86 : 1.12), bendT: dur, a: 1.4, d: dur, peak: ORBIT_MIX.whistle, pan, dry: 0.4, wet: 1 });
    } else if (kind === 'stutter') {
      // the air stutters: the room's level flutters for a moment
      const fl = g.roomFl.gain; let t = when; const dur = 0.5 + ev() * 1.0;
      while (t < when + dur) { fl.setTargetAtTime(0.25 + ev() * 0.6, t, 0.03); t += 0.05 + ev() * 0.12; }
      fl.setTargetAtTime(1, t, 0.25);
    }
    log(kind, 'ship', pan);
  }
  function heart(when, amp) {
    for (const [dt, a] of [[0, 1], [0.28, 0.65]]) toneEv(when + dt, { f0: 58, f1: 41, bendT: 0.25, a: 0.03, d: 0.45, peak: ORBIT_MIX.heart * amp * a, pan: 0, dry: 0.8, wet: 0.35 });
    log('heart', 'ship', 0);
  }
  function reply(when, amp) {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(196, when); o.frequency.linearRampToValueAtTime(185, when + 1.6);
    const e = ctx.createGain(); e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(ORBIT_MIX.reply * amp, when + 0.6); e.gain.setTargetAtTime(0, when + 1.6, 0.6);
    const out = outlet((ev() - 0.5) * 0.6, 0.12, 1);
    o.connect(e); e.connect(out.input); o.start(when); o.stop(when + 5);
    release([o, e, ...out.nodes], when + 5);
    log('reply', 'ship', 0);
  }
  // ---- something far off
  function farEvent(when) {
    const k = pick(['ping', 'carrier', 'voice'].filter((x) => x !== st.lastFar)); st.lastFar = k;
    const pan = (ev() - 0.5) * 1.6, L = ORBIT_MIX.far;
    if (k === 'ping') {
      toneEv(when, { f0: semi(880, [0, 3, 7][Math.floor(ev() * 3)]), a: 0.005, d: 3.5, peak: L * 0.35, pan, dry: 0.15, wet: 1 });
    } else if (k === 'carrier') {
      // a dead radio: a carrier that wavers and breaks up in noise
      const dur = 0.5 + ev() * 0.6;
      toneEv(when, { type: 'square', f0: 1400 + ev() * 300, f1: 1380, a: 0.02, d: dur, peak: L * 0.05, pan, dry: 0.3, wet: 0.9 });
      noiseEv(when, { f0: 2500, q: 2, a: 0.02, hold: dur * 0.4, d: dur, peak: L * 0.25, pan, dry: 0.3, wet: 0.9 });
    } else {
      // almost a voice: noise through two formants sliding (no words)
      const dur = 2 + ev() * 1.2;
      noiseEv(when, { buf: g.pink, f0: 320, f1: 680, q: 9, a: 0.8, hold: 0.3, d: dur, peak: L * 0.9, pan, dry: 0.2, wet: 1 });
      noiseEv(when, { buf: g.pink, f0: 950, f1: 1250, q: 11, a: 0.8, hold: 0.3, d: dur, peak: L * 0.55, pan, dry: 0.2, wet: 1 });
    }
    log(k, 'far', pan);
  }

  // ---------------------------------------------------------------- the worlds' signatures
  function signature(slug, when, lvl, pan) {
    const v = VOICES[slug], W = g.worlds[slug], L = ORBIT_MIX.texture;   // the world's bus carries the closeness
    const nE = (w, o) => noiseEv(w, { ...o, dest: W.bus }), tE = (w, o) => toneEv(w, { ...o, dest: W.bus });
    const P = (x) => clamp(pan + x, -1, 1);
    let next = 4 + ev() * 6, type = slug;
    switch (slug) {
      case 'dust-sea':   // sand ticking, scattered
        for (let i = 0; i < 6; i++) nE(when + ev() * 1.6, { f0: 3500 + ev() * 3000, q: 4, a: 0.002, d: 0.03, peak: L * 0.18, pan: P((ev() - 0.5) * 0.6), dry: 0.6, wet: 0.4 });
        type = 'sand-ticks'; next = 2.5 + ev() * 4; break;
      case 'velocity': { // the hum flickers and drops out
        const h = W.steady.gain, t0 = when, n = 2 + Math.floor(ev() * 4);
        for (let i = 0; i < n; i++) { const t = t0 + i * (0.06 + ev() * 0.12); h.setTargetAtTime(0, t, 0.006); h.setTargetAtTime(0.1, t + 0.04 + ev() * 0.08, 0.01); }
        if (ev() < 0.4) { h.setTargetAtTime(0, t0 + 0.8, 0.02); h.setTargetAtTime(0.1, t0 + 1.4 + ev() * 0.8, 0.05); }
        type = 'hum-flicker'; next = 3 + ev() * 6; break;
      }
      case 'grid': {     // soft digital ticks, like rain on glass
        const n = 5 + Math.floor(ev() * 10);
        for (let i = 0; i < n; i++) tE(when + ev() * 2.5, { type: 'square', f0: semi(v.root * 16, v.scale[Math.floor(ev() * v.scale.length)]), a: 0.002, d: 0.04, peak: L * 0.05, pan: P((ev() - 0.5) * 1.2), dry: 0.5, wet: 0.7 });
        type = 'glass-rain'; next = 3 + ev() * 4; break;
      }
      case 'abyssal':    // a slow downward glide, whale-like; or a deep ping
        if (ev() < 0.65) tE(when, { f0: semi(v.root * 3, v.scale[Math.floor(ev() * 4)]), f1: v.root * 1.4, a: 1.0, d: 4, peak: L * 0.35, pan: P(0), dry: 0.3, wet: 1 }), type = 'glide';
        else tE(when, { f0: v.root * 4, a: 0.004, d: 4, peak: L * 0.3, pan: P(0), dry: 0.2, wet: 1 }), type = 'deep-ping';
        next = 12 + ev() * 14; break;
      case 'arcadia': {  // a half-broken music box: two or three notes, out of tune, slowing
        const n = 2 + Math.floor(ev() * 2); let t = when, gap = 0.35;
        for (let i = 0; i < n; i++) {
          const f = semi(v.root * 2, v.scale[Math.floor(ev() * v.scale.length)]) * (1 + (ev() - 0.5) * 0.03);
          tE(t, { f0: f, f1: f * 0.985, a: 0.003, d: 1.6, peak: L * 0.28, pan: P(0.1), dry: 0.4, wet: 0.9 });
          tE(t, { f0: f * 2.76, a: 0.002, d: 0.5, peak: L * 0.07, pan: P(0.1), dry: 0.4, wet: 0.8 });
          t += gap; gap *= 1.6;
        }
        type = 'music-box'; next = 22 + ev() * 26; break;
      }
      case 'aurora': {   // glassy bowed harmonics
        const f = semi(v.root * 4, v.scale[[0, 2, 4][Math.floor(ev() * 3)]]);
        tE(when, { f0: f, a: 2.2, d: 5, peak: L * 0.12, pan: P(-0.2), dry: 0.3, wet: 1, detune: -5 });
        tE(when + 0.3, { f0: f * 1.5, a: 2.5, d: 5, peak: L * 0.07, pan: P(0.2), dry: 0.3, wet: 1, detune: 7 });
        type = 'bowed-glass'; next = 9 + ev() * 10; break;
      }
      case 'uncharted':  // a hollow breath with no clear pitch
        nE(when, { buf: g.pink, f0: 500 + ev() * 300, f1: 420, q: 1.2, a: 1.8, hold: 0.5, d: 3, peak: L * 0.6, pan: P(0), dry: 0.4, wet: 1 });
        type = 'hollow-breath'; next = 7 + ev() * 8; break;
      case 'archive':    // a dry rustle
        for (let i = 0; i < 4; i++) nE(when + ev() * 0.7, { type: 'highpass', f0: 3200, q: 0.7, a: 0.01, d: 0.12 + ev() * 0.15, peak: L * 0.18, pan: P((ev() - 0.5) * 0.5), dry: 0.8, wet: 0.3 });
        type = 'rustle'; next = 5 + ev() * 8; break;
      case 'drillyard':  // a distant slow machine thud, uneven
        nE(when, { buf: g.brown, type: 'lowpass', f0: 180, f1: 70, q: 0.8, a: 0.01, d: 0.6, peak: L * 1.2, pan: P(0), dry: 0.4, wet: 1 });
        tE(when, { f0: v.root / 2, f1: v.root / 3, a: 0.01, d: 0.6, peak: L * 0.35, pan: P(0), dry: 0.4, wet: 0.8 });
        type = 'machine-thud'; next = 2.4 + ev() * 2.6; break;
      case 'stormwall':  // far thunder rolling under the held fourth
        nE(when, { buf: g.brown, type: 'lowpass', f0: 300, f1: 90, q: 0.5, a: 0.4 + ev() * 0.6, hold: 0.8, d: 3 + ev() * 3, peak: L * 1.5, pan: P((ev() - 0.5) * 0.8), dry: 0.4, wet: 1 });
        type = 'thunder'; next = 11 + ev() * 14; break;
      case 'beacons':    // a crackle, and now and then one far horn-like fifth
        if (ev() < 0.3) {
          for (const [r, a] of [[1, 1], [1.5, 0.7]]) tE(when, { type: 'sawtooth', f0: v.root * r, a: 1.2, d: 3, peak: L * 0.05 * a, pan: P(0), dry: 0.2, wet: 1 });
          type = 'horn-fifth';
        } else {
          for (let i = 0; i < 8; i++) nE(when + ev() * 1.2, { f0: 1800 + ev() * 2500, q: 2, a: 0.002, d: 0.02, peak: L * 0.25, pan: P((ev() - 0.5) * 0.5), dry: 0.7, wet: 0.4 });
          type = 'crackle';
        }
        next = 5 + ev() * 9; break;
      default: break;
    }
    log(type, slug, pan);
    return next;
  }

  // ---------------------------------------------------------------- the unreliable beds
  // A layer has three wandering channels (level, filter, pitch), each a few incommensurate slow sines
  // plus a seeded random walk (5 to 90 s), and its own dropouts.
  const lr = mulberry32(seed ^ 0x2c1b3c6d);
  function channel() {
    const sines = [0, 1, 2].map(() => ({ p: 5 + lr() * 85, ph: lr() * TAU, a: 0.1 + lr() * 0.25 }));
    const tot = sines.reduce((a, x) => a + x.a, 0); for (const x of sines) x.a = (x.a / tot) * 0.6;
    return { sines, walk: 0, tau: 12 + lr() * 40 };
  }
  function layer(name) { return { name, ch: [channel(), channel(), channel()], st: 'on', t0: 0, dOut: 1, dIn: 1, until: 0, next: 0, shift: 0 }; }
  function wander(c, t, dt) {
    let v = 0; for (const x of c.sines) v += x.a * Math.sin((TAU * t) / x.p + x.ph);
    const n = (lr() + lr() + lr() - 1.5) * 2;
    c.walk += (-c.walk / c.tau) * dt + 0.45 * Math.sqrt((2 * dt) / c.tau) * n;
    return clamp(v + c.walk, -1.2, 1.2);
  }
  // a level swing in decibels: about -23 dB to -3 dB over the wander's range
  const swing = (w) => Math.pow(10, (-13 + 8.5 * w) / 20);
  const smoothK = (k) => { const c = clamp(k); return c * c * (3 - 2 * c); };
  // the layer's dropout factor at t (1 present, 0 gone); allow false: no new dropout, and come back
  function drop(L, t, allow) {
    if (!L.next) L.next = t + 10 + lr() * 30;
    if (!allow && (L.st === 'out' || L.st === 'gone')) { L.st = 'in'; L.t0 = t; L.dIn = 3 + lr() * 3; }
    if (L.st === 'on') {
      if (allow && t >= L.next) { L.st = 'out'; L.t0 = t; L.dOut = 3 + lr() * 5; L.until = 0; log('fade', L.name, 0); }
      return 1;
    }
    if (L.st === 'out') {
      const k = (t - L.t0) / L.dOut;
      if (k >= 1) { L.st = 'gone'; if (L.until <= t) L.until = t + 4 + lr() * 11; return 0; }
      return 1 - smoothK(k);
    }
    if (L.st === 'gone') {
      if (t >= L.until) { L.st = 'in'; L.t0 = t; L.dIn = 5 + lr() * 7; L.shift = (lr() - 0.5) * 2; log('return', L.name, 0); }
      return 0;
    }
    const k = (t - L.t0) / L.dIn;
    if (k >= 1) { L.st = 'on'; L.next = t + 25 + lr() * 45; return 1; }
    return smoothK(k);
  }
  // force a layer to be gone from T0 until back (a full silence)
  function force(L, t, T0, back) {
    if (L.st === 'on' || L.st === 'in') { L.st = 'out'; L.t0 = t; L.dOut = Math.max(1.5, T0 - t); }
    else if (L.st === 'out') L.dOut = Math.max(0.5, T0 - L.t0);
    L.until = Math.max(L.until, back);
  }
  const layers = { sub: layer('sub'), room: layer('room'), cluster: layer('cluster'), shimmer: layer('shimmer') };
  // the ebb: one slow shared wander under all four beds; when it sinks they all thin together, deep
  // (to about -25 dB), for stretches of several seconds, so the background really goes away now and then
  const ebbL = layer('ebb'); ebbL.ch[0].sines.forEach((x, i) => { x.p = [17, 29, 43][i] * (0.85 + 0.3 * lr()); x.a = [0.42, 0.33, 0.25][i]; });
  for (const slug of SLUGS) layers[slug] = layer(slug);
  const sil = { next: 0, T0: 0, dur: 0, planned: false };
  const quiet = (t) => bedOnly || (sil.planned && t > sil.T0 - 1.5 && t < sil.T0 + sil.dur);

  // ---------------------------------------------------------------- per frame
  function update(s) {
    if (!ctx || !g || dead || !s) return;
    try {
      const t = now(), M = ORBIT_MIX;
      const pull = clamp(s.pull || 0), duck = 1 - 0.85 * pull;
      const hd = Math.max(0, s.hullDist ?? 1e9);
      const near = 1 - smooth(80, 15000, hd);      // 1 inside the canyon, about a third 3 km out, 0 by 15 km
      const close = 1 - smooth(60, 1500, hd);      // only near the hull
      st.near = near;
      const dt = clamp(s.dt || 1 / 30, 0, 0.25);
      // ---- a full silence, every two to four minutes (the first sooner): plan it eight seconds ahead
      if (!sil.next) sil.next = t + 25 + lr() * 20;
      if (!sil.planned && t >= sil.next - 8) {
        sil.planned = true; sil.T0 = sil.next; sil.dur = 4 + lr() * 4;
        const beds = ['sub', 'room', 'cluster', 'shimmer'], first = beds[Math.floor(lr() * beds.length)];
        for (const [name, L] of Object.entries(layers)) force(L, t, sil.T0, sil.T0 + sil.dur + (name === first ? 0 : 6 + lr() * 14));
        log('silence', first, 0);
        // near the ship, often (not always) one thing sits in the silence or ends it
        if (near > 0.3 && lr() < 0.65) {
          const k = ['clank', 'reply', 'breath', 'chirp'][Math.floor(lr() * 4)];
          st.silEvent = { k, at: sil.T0 + (lr() < 0.5 ? 0.6 + lr() * (sil.dur - 0.8) : sil.dur) };
        } else st.silEvent = null;
      }
      if (sil.planned && st.silEvent && !bedOnly && t >= st.silEvent.at - 0.3) {
        const e = st.silEvent; st.silEvent = null;
        if (e.k === 'clank') metal(e.at, Math.max(0.4, near), 'clank');
        else if (e.k === 'reply') reply(e.at, Math.max(0.5, near));
        else if (e.k === 'breath') breath(e.at, close);
        else system('chirp', e.at);
      }
      if (sil.planned && t > sil.T0 + sil.dur + 1) { sil.planned = false; sil.next = sil.T0 + 60 + lr() * 90; }
      const hush = quiet(t);
      // ---- the derelict's bed: wandering, unreliable
      const eb = wander(ebbL.ch[0], t, dt), ebb = Math.pow(10, (Math.min(0, eb - 0.1) * 42) / 20);
      const Ls = layers.sub, wS = [wander(Ls.ch[0], t, dt), wander(Ls.ch[1], t, dt), wander(Ls.ch[2], t, dt)], dS = drop(Ls, t, true);
      set(g.subG.gain, M.sub * Math.max(Math.pow(near, 1.5), pull * 0.35) * swing(wS[0]) * ebb * dS, 0.6);
      // the beating rate wanders: sometimes nearly still, sometimes quick; the pitch sags and recovers
      set(g.subOsc[1].frequency, A + clamp(0.35 * (1 + 1.4 * wS[1]), 0.02, 0.95), 1.5);
      for (const o of g.subOsc) set(o.detune, 9 * Math.min(0, wS[2]) + 3 * wS[2] + 6 * Ls.shift, 2.0);
      const Lr = layers.room, wR = [wander(Lr.ch[0], t, dt), wander(Lr.ch[1], t, dt)], dR = drop(Lr, t, true);
      set(g.roomG.gain, M.room * Math.pow(near, 1.3) * duck * swing(wR[0]) * ebb * dR, 0.5);
      set(g.roomLp.frequency, (200 + 260 * close) * (1 + 0.4 * wR[1]) * (1 + 0.15 * Lr.shift), 0.8);
      set(g.bodyBp.frequency, 260 * (1 + 0.35 * wR[1] + 0.1 * Lr.shift), 1.0);
      set(g.brG.gain, M.breath * Math.pow(close, 1.2) * duck, 0.8);
      // ---- the derelict's events, scheduled on the audio clock (none inside a full silence)
      // the breath comes in runs of two to five, then not for 20 to 60 s
      if (!st.nextBreath || st.nextBreath < t) st.nextBreath = t + 2 + ev() * 6;
      if (st.nextBreath < t + 0.3) {
        if (!st.breathRun) st.breathRun = 2 + Math.floor(ev() * 2);
        if (close > 0.05 && !hush) breath(st.nextBreath, close);
        st.breathRun--;
        st.nextBreath += st.breathRun > 0 ? 5.5 + ev() * 5 : 50 + ev() * 45;
      }
      if (st.nextMetal < t) st.nextMetal = t + 3 + ev() * 5;
      if (st.nextMetal < t + 0.3) {
        if (near > 0.08 && pull < 0.5 && !hush) metal(st.nextMetal, near);
        st.nextMetal += lerp(75, 22, near) + ev() * lerp(45, 34, near);
      }
      if (st.nextBeat < t) st.nextBeat = Math.ceil(t / PULSE) * PULSE;
      while (st.nextBeat < t + 0.3) {
        // about one beat in seven, never two within three beats: rare, irregular, on the grid
        st.beats = (st.beats || 0) + 1;
        if (ev() < 0.07 && st.beats > 5 && close > 0.15 && !hush) { heart(st.nextBeat, Math.pow(close, 1.5)); st.beats = 0; }
        st.nextBeat += PULSE;
      }
      if (st.nextReply < t) st.nextReply = t + 10 + ev() * 15;
      if (st.nextReply < t + 0.3) { if (near > 0.25 && !hush) reply(st.nextReply, near); st.nextReply += 60 + ev() * 30; }
      // systems still running, and the dead ventilation: each kind at most once a minute
      if (!st.nextSys || st.nextSys < t) st.nextSys = t + 10 + ev() * 25;
      if (st.nextSys < t + 0.3) {
        st.sysLast = st.sysLast || {};
        const kinds = ['chirp', 'relay', 'buzz', 'whistle', 'stutter'].filter((k) => !(st.sysLast[k] > st.nextSys - 60));
        if (kinds.length && near > 0.35 && pull < 0.5 && !hush) { const k = kinds[Math.floor(ev() * kinds.length)]; system(k, st.nextSys); st.sysLast[k] = st.nextSys; }
        st.nextSys += 35 + ev() * 45;
      }
      // space between
      const ws = s.worlds || [];
      let nearest = hd;
      for (const w of ws) nearest = Math.min(nearest, Math.max(0, w.surf ?? 1e9));
      const open = smooth(500, 30000, nearest);
      const Lc = layers.cluster, wC = [wander(Lc.ch[0], t, dt), wander(Lc.ch[1], t, dt), wander(Lc.ch[2], t, dt)], dC = drop(Lc, t, true);
      set(g.clG.gain, M.cluster * lerp(0.6, 1, open) * duck * swing(wC[0]) * ebb * dC, 0.8);
      set(g.clLp.frequency, 500 * (1 + 0.45 * wC[1]) * (1 + 0.2 * Lc.shift), 1.5);
      g.clOsc.forEach((o, i) => set(o.detune, (i - 1.5) * 3 + 8 * wC[2] * (i % 2 ? 1 : -0.7) + 7 * Lc.shift, 2.5));
      const Lh = layers.shimmer, wH = wander(Lh.ch[0], t, dt), dH = drop(Lh, t, true);
      set(g.shG.gain, M.shimmer * lerp(1, 0.35, open) * clamp(0.55 + 0.6 * wH, 0.05, 1.3) * ebb * dH, 1.0);
      if (st.nextFar < t) st.nextFar = t + 8 + ev() * 15;
      if (st.nextFar < t + 0.3) { if (pull < 0.5 && !s.descent && !hush) farEvent(st.nextFar); st.nextFar += 55 + ev() * 35; }
      // the worlds
      const dsl = s.descent ? s.descent.slug : null, dk = s.descent ? clamp(s.descent.t / 0.9) : 0;
      for (const w of ws) {
        const W = g.worlds[w.slug]; if (!W) continue;
        let c = Math.pow(smooth(8, 0.5, w.x), 1.7);
        if (s.focus === w.slug) c = Math.max(c, 0.45);
        if (dsl === w.slug) c = Math.max(c, lerp(c, 1.1, dk)); else if (dsl) c *= 1 - dk;
        // the drone wanders and drops out like the beds, until the threshold, where it steadies
        const Lw = layers[w.slug], loose = 1 - clamp(c / 0.75), steady = c >= 0.75 || s.focus === w.slug || dsl === w.slug || pull > 0.5;
        const ww = [wander(Lw.ch[0], t, dt), wander(Lw.ch[1], t, dt), wander(Lw.ch[2], t, dt)], dW = drop(Lw, t, !steady);
        const droneLvl = M.drone * Math.max(c, pull * M.orrery) * (1 + 0.4 * loose * ww[0]) * dW;
        W.lvl = c;
        set(W.level.gain, droneLvl, 0.8);
        set(W.lp.frequency, W.v.lp * (1 + 0.35 * loose * ww[1]), 1.5);
        if (!(dsl === w.slug && dk > 0)) W.oscs.forEach((o, i) => set(o.detune, W.oscBase[i] + loose * (7 * Math.min(0, ww[2]) + 3 * ww[2]) + 5 * Lw.shift, 2.0));
        const inHull = 1 - 0.85 * close;   // inside the canyon the ship is what you hear
        set(W.tex.gain, c * inHull * dW, 0.8); set(W.texW.gain, c * inHull * dW, 0.8);
        set(W.glG.gain, 0.0035 * pull, 1.0);
        set(W.pan.pan, clamp(w.pan || 0, -0.9, 0.9), 0.5);
        // signature events while the world can be heard
        if (c * (1 - 0.85 * close) > 0.1 && pull < 0.5 && !(dsl && dsl !== w.slug) && !hush && dW > 0.3) {
          if (!W.next || W.next < t) W.next = t + 1 + ev() * 3;
          if (W.next < t + 0.3) W.next += signature(w.slug, W.next, c, clamp(w.pan || 0, -0.9, 0.9));
        } else W.next = 0;
        // the descent: the drone bends apart into a dissonant cluster
        if (dsl === w.slug && dk > 0) W.oscs.forEach((o, i) => set(o.detune, (i % 2 ? 1 : -1) * (20 + 140 * dk) * (1 + i * 0.3), 0.15));
      }
      // the nearest world's swell (the nameplate moment): slow, low, no hit
      if (s.plate && s.plate !== st.plate && g.worlds[s.plate]) {
        const v = VOICES[s.plate], wp = ws.find((w) => w.slug === s.plate);
        toneEv(t + 0.05, { type: 'triangle', f0: v.root / 2, a: 3, d: 4, peak: M.swell, pan: wp ? clamp(wp.pan, -0.8, 0.8) : 0, dry: 0.6, wet: 0.8 });
        noiseEv(t + 0.05, { buf: g.pink, type: 'lowpass', f0: 120, f1: 600, q: 0.6, a: 3, d: 3, peak: M.swell * 0.6, pan: 0, dry: 0.5, wet: 0.6 });
        log('swell', s.plate, 0);
      }
      st.plate = s.plate || null;
      // the shuttle: breath under thrust, a whoosh as boost opens, a servo tick in hard turns
      const thr = clamp((s.speed || 0) / Math.max(1, s.cap || 1), 0, 2);
      const on = s.thrust > 0 ? 1 : 0;
      // (the shuttle's own breath goes too in a full silence: everything is gone)
      const silK = sil.planned && t > sil.T0 - 1.5 && t < sil.T0 + sil.dur ? 0 : 1;
      set(g.thG.gain, M.thrust * on * (0.4 + 0.6 * Math.min(1, thr)) * duck * (s.descent ? 0.2 : 1) * silK, silK ? 0.5 : 0.6);
      set(g.thBp.frequency, 300 + 500 * Math.min(1, thr), 0.6);
      set(g.thPan.pan, clamp(-(s.bank || 0) * 0.4, -0.35, 0.35), 0.3);
      if (s.boost && !st.boostWas && !s.descent) { noiseEv(t + 0.01, { buf: g.pink, type: 'lowpass', f0: 250, f1: 1800, q: 0.7, a: 0.3, d: 1.4, peak: M.whoosh * duck, pan: 0, dry: 0.8, wet: 0.4 }); log('whoosh', 'shuttle', 0); }
      st.boostWas = !!s.boost;
      if (Math.abs(s.bank || 0) > 0.55 && t > st.nextServo && !s.descent) {
        const p = clamp(-(s.bank || 0), -0.5, 0.5);
        noiseEv(t + 0.01, { type: 'bandpass', f0: 3800, q: 6, a: 0.002, d: 0.05, peak: M.servo * duck, pan: p, dry: 0.8, wet: 0.2 });
        toneEv(t + 0.03, { f0: 2200, f1: 2600, a: 0.003, d: 0.06, peak: M.servo * 0.3 * duck, pan: p, dry: 0.8, wet: 0.2 });
        st.nextServo = t + 1.2; log('servo', 'shuttle', p);
      }
      // the descent's air, swelling and opening over the flood toward the surface's wind
      if (s.descent) { set(g.ruG.gain, M.rush * Math.pow(dk, 1.5), 0.08); set(g.ruLp.frequency, 250 + 1100 * dk, 0.1); }
      else set(g.ruG.gain, 0, 0.3);
    } catch { /* the loop never throws for sound */ }
  }

  function onVisibility() {
    hidden = document.hidden;
    if (!g) return;
    try { g.fade.gain.cancelScheduledValues(now()); set(g.fade.gain, hidden ? 0 : 1, hidden ? 0.05 : 0.3); } catch { /* gone */ }
  }
  function start() {
    if (dead || disposed) return Promise.resolve(false);
    try {
      if (!ctx) {
        if (external) ctx = external;
        else {
          const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
          if (!AC) { dead = true; return Promise.resolve(false); }
          ctx = new AC();
          visHandler = onVisibility; document.addEventListener('visibilitychange', visHandler); hidden = document.hidden;
        }
        const resumed = external || ctx.state === 'running' ? Promise.resolve() : ctx.resume();
        ready = new Promise((r) => setTimeout(r, 0)).then(() => {
          if (disposed) return false;
          build();
          g.fade.gain.setValueAtTime(0, now());
          g.fade.gain.linearRampToValueAtTime(hidden ? 0 : 1, now() + 2.0);   // arrival: in over about two seconds
          return true;
        }).catch(() => { dead = true; return false; });
        return Promise.all([ready, resumed.catch(() => {})]).then(([ok]) => !!ok && !dead && (!!external || ctx.state === 'running'));
      }
      if (external) return ready;
      const again = ctx.state === 'running' || ctx.state === 'closed' ? Promise.resolve() : ctx.resume();
      return Promise.all([ready, again.catch(() => {})]).then(([ok]) => !!ok && !dead && ctx.state === 'running');
    } catch { dead = true; return Promise.resolve(false); }
  }
  function setMuted(m) {
    muted = !!m;
    if (!g || dead) return;
    try { g.mute.gain.cancelScheduledValues(now()); set(g.mute.gain, muted ? 0 : 1, muted ? 0.02 : 0.15); } catch { /* gone */ }
  }
  function dispose() {
    if (disposed) return;
    disposed = true; dead = true;
    if (visHandler) document.removeEventListener('visibilitychange', visHandler);
    if (!ctx) return;
    const c = ctx, graph = g;
    try { if (graph) { graph.fade.gain.cancelScheduledValues(c.currentTime); graph.fade.gain.setTargetAtTime(0, c.currentTime, 0.03); } } catch { /* gone */ }
    setTimeout(() => {
      if (graph) for (const s of graph.sources) { try { s.stop(); } catch { /* not started */ } }
      if (!external && c.state !== 'closed') c.close().catch(() => {});
    }, external ? 0 : 200);
  }
  return { start, update, setMuted, dispose,
    stats: () => ({ persistentNodes: st.nodes, state: ctx ? ctx.state : 'none', scriptProcessor: false, worklet: false, events: st.log.slice() }) };
}

// Offline render (tests): states(t) -> the update() state at time t; events(t) may return { mute }.
export async function renderScene(states, { seconds = 20, sr = 48000, step = 1 / 30, seed = 7, events = null, bedOnly = false } = {}) {
  const oac = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
  const s = createSound({ context: oac, seed, bedOnly });
  await s.start();
  for (let k = 1, t = step; t < seconds - step; k++, t = k * step) {
    oac.suspend(Math.round(t * sr / 128) * 128 / sr).then(() => {
      s.update({ dt: step, ...states(t) });
      const e = events && events(t);
      if (e && e.mute !== undefined) s.setMuted(e.mute);
      oac.resume();
    }).catch(() => oac.resume());
  }
  const buffer = await oac.startRendering();
  const st = s.stats();
  return { buffer, nodes: st.persistentNodes, events: st.events };
}
