// sound.js: the orbit's sound. Plain Web Audio, every sample generated here: no files, no network,
// no ScriptProcessor and no AudioWorklet (oscillators, buffers of seeded noise, filters, gains).
//
// Contract (main.js loads this with a dynamic import, the way surface/engine loads the Dust Sea's):
//   createSound(opts?) -> { start(), update(state), setMuted(bool), dispose(), stats() }
//   Nothing is created until start(), which must run inside a user gesture: it creates and resumes
//   the context synchronously and resolves true (playing) or false (refused or unavailable: every
//   later call is a silent no-op). Never rejects, never throws.
//   update(state) once per frame:
//     { dt, hullDist, speed, cap, thrust, boost, bank,
//       worlds: [{ slug, x (surface distance in radii), pan (-1..1) }],
//       pull (0..1), descent: { slug, t } | null, focus: slug | null (reduced-motion approach view) }
//   Test hook: createSound({ context, seed }) builds the same graph on a context you pass in (an
//   OfflineAudioContext), and renderScene() below drives one from a scripted sequence of states.
//
// The music is the hub's (src/07-audio.js), so the orbit and the old hub are one piece:
//   - the ship keeps the hub's 2.4 s pulse (its 600 ms step, 'H...' every fourth): the same sub
//     heartbeat (60 sagging to 46 Hz) and the Artifact's slightly wrong reply, 196 sagging to 185;
//   - each world sings in its hub arrangement's root, scale, step and lead wave, over a pad on its
//     padIv chord, lowpassed at its 'bright', with its own delay and reverb sends.
//
// Graph:  pulse ─┐
//        engine ─┤
//  11 world voices (pad + generative lead, each: lowpass -> level -> pan) ─┤-> mix -> fade -> mute
//         bed ───┤                                              -> compressor -> soft clip -> out
//         rush ──┘   (shared sends: a feedback delay and a generated reverb)

const TAU = Math.PI * 2;

// The mix, as named levels (linear gains into the mix bus). Measured offline, see the report in
// the commit that adds this file. Nobody has listened to it yet.
export const ORBIT_MIX = {
  master: 0.42,      // into the compressor
  pulse: 0.5,        // the ship's heartbeat and its 196 -> 185 reply, at the hull
  pulseFar: 0.02,    // ... share left 20 km out
  engine: 0.05,      // the shuttle under thrust with boost (cruise is about half, drifting under a tenth)
  air: 0.016,        // boost's breath
  voice: 0.32,       // a world's voice at its threshold
  voicePad: 0.5,     // the pad's share of a voice (the rest is the lead)
  orrery: 0.32,      // each voice's level when pulled back (of `voice`)
  bed: 0.035,        // space between: filtered noise near things
  bedFar: 0.3,       // ... share left far from everything
  shimmer: 0.012,
  rush: 0.22,        // the descent's rush of air at the flood's peak
  duck: 0.8,         // flight layers duck by this share when pulled back
};

// the hub's arrangements (src/07-audio.js ARR): root Hz, scale, step ms, bright Hz, pad chord, lead
export const VOICES = {
  'dust-sea': { root: 98.0, scale: [0, 1, 4, 5, 7, 8, 10], step: 700, bright: 460, padIv: [0, 7, 12], wave: 'sawtooth', dly: 0.15, wet: 0.2, oct: 1 },
  velocity: { root: 174.6, scale: [0, 2, 3, 5, 7, 8, 10], step: 220, bright: 1800, padIv: [0, 3, 7], wave: 'square', dly: 0.22, wet: 0.05, oct: 0 },
  grid: { root: 164.8, scale: [0, 2, 3, 7, 10], step: 340, bright: 2400, padIv: [0, 7, 14], wave: 'triangle', dly: 0.55, wet: 0.1, oct: 1 },
  abyssal: { root: 130.8, scale: [0, 2, 4, 6, 8, 10], step: 850, bright: 460, padIv: [0, 4, 8], wave: 'sine', dly: 0.2, wet: 0.4, oct: 0 },
  arcadia: { root: 261.6, scale: [0, 2, 4, 7, 9], step: 170, bright: 2600, padIv: [0, 4, 7], wave: 'square', dly: 0.05, wet: 0.05, oct: 1 },
  aurora: { root: 196.0, scale: [0, 2, 4, 5, 7, 9, 10], step: 480, bright: 2000, padIv: [0, 7, 12], wave: 'triangle', dly: 0.3, wet: 0.3, oct: 1 },
  uncharted: { root: 220.0, scale: [0, 2, 5, 7, 10], step: 900, bright: 1100, padIv: [0, 5, 12], wave: 'sine', dly: 0.25, wet: 0.3, oct: 0 },
  archive: { root: 155.6, scale: [0, 2, 4, 6, 7, 9, 11], step: 520, bright: 2200, padIv: [0, 7, 11], wave: 'triangle', dly: 0.42, wet: 0.32, oct: 1 },
  drillyard: { root: 146.8, scale: [0, 2, 3, 5, 7, 9, 10], step: 260, bright: 1500, padIv: [0, 5, 10], wave: 'triangle', dly: 0.3, wet: 0.22, oct: 0 },
  stormwall: { root: 110.0, scale: [0, 2, 3, 5, 7, 8, 10], step: 520, bright: 700, padIv: [0, 5, 10], wave: 'triangle', dly: 0.3, wet: 0.35, oct: 1 },
  beacons: { root: 110.0, scale: [0, 2, 4, 7, 9], step: 640, bright: 700, padIv: [0, 7, 12], wave: 'sawtooth', dly: 0.28, wet: 0.4, oct: 1 },
};
const SLUGS = Object.keys(VOICES);
const PULSE = 2.4;   // seconds: the hub's 600 ms step, a heartbeat every fourth

const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
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
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, s = 0;
  for (let i = 0; i < n; i++) {
    const w = (rnd() * 2 - 1) * 1.732;
    if (kind === 'white') d[i] = w;
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
// a room: decaying stereo noise, a little darker as it fades
function impulse(ctx, rnd, seconds) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), buf = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let y = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n, a = Math.pow(1 - t, 3.2) * Math.exp(-t * 2);
      const w = rnd() * 2 - 1; y += (w - y) * (0.9 - 0.75 * t);
      d[i] = y * a * 0.5;
    }
  }
  return buf;
}
// soft clip: linear to 0.5, then a tanh knee that never passes 0.70 (-3.1 dBFS)
function softClip() {
  const n = 4097, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, ax = Math.abs(x); c[i] = Math.sign(x) * (ax <= 0.5 ? ax : 0.5 + 0.2 * Math.tanh((ax - 0.5) / 0.2)); }
  return c;
}

export function createSound(opts = {}) {
  const external = opts.context || null;
  const seed = opts.seed != null ? opts.seed >>> 0 : 20261114;
  const rnd = mulberry32(seed), rndNote = mulberry32(seed ^ 0x51ed270b);
  let ctx = null, g = null, dead = false, muted = !!opts.muted, disposed = false, hidden = false, visHandler = null;
  let ready = Promise.resolve(false);
  const st = { nextBeat: 0, voices: {}, rushOn: false, descentSlug: null, nodes: 0 };

  const now = () => ctx.currentTime;
  const set = (p, v, tau) => { p.setTargetAtTime(v, now(), tau); };
  const count = (n) => { st.nodes += n; };

  function build() {
    const out = ctx.destination;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.01; comp.release.value = 0.35;
    const clip = ctx.createWaveShaper(); clip.curve = softClip(); clip.oversample = 'none';
    const mute = ctx.createGain(); mute.gain.value = muted ? 0 : 1;
    const fade = ctx.createGain(); fade.gain.value = 0;
    const mix = ctx.createGain(); mix.gain.value = ORBIT_MIX.master;
    mix.connect(fade); fade.connect(mute); mute.connect(comp); comp.connect(clip); clip.connect(out);
    // shared sends: a feedback delay (the hub's) and a generated room
    const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, rnd, 3.2); verb.normalize = false;
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.9; verb.connect(verbOut); verbOut.connect(mix);
    const dly = ctx.createDelay(1.5); dly.delayTime.value = 0.43;
    const dlyLp = ctx.createBiquadFilter(); dlyLp.type = 'lowpass'; dlyLp.frequency.value = 1800;
    const dlyFb = ctx.createGain(); dlyFb.gain.value = 0.38;
    dly.connect(dlyLp); dlyLp.connect(dlyFb); dlyFb.connect(dly); dlyLp.connect(mix);
    count(12);

    // ---- the ship's pulse: its own bus, filtered and levelled by the distance to the hull
    const pulseLp = ctx.createBiquadFilter(); pulseLp.type = 'lowpass'; pulseLp.frequency.value = 400; pulseLp.Q.value = 0.5;
    const pulseG = ctx.createGain(); pulseG.gain.value = 0;
    pulseLp.connect(pulseG); pulseG.connect(mix);
    const pulseVerb = ctx.createGain(); pulseVerb.gain.value = 0.5; pulseG.connect(pulseVerb); pulseVerb.connect(verb);

    // ---- the shuttle: two detuned saws and a triangle an octave up, through a lowpass; boost's air
    const eng = [ctx.createOscillator(), ctx.createOscillator(), ctx.createOscillator()];
    eng[0].type = 'sawtooth'; eng[1].type = 'sawtooth'; eng[2].type = 'triangle';
    eng[0].frequency.value = 49; eng[1].frequency.value = 49; eng[1].detune.value = 9; eng[2].frequency.value = 98;
    const engLp = ctx.createBiquadFilter(); engLp.type = 'lowpass'; engLp.frequency.value = 180; engLp.Q.value = 0.7;
    const engHp = ctx.createBiquadFilter(); engHp.type = 'highpass'; engHp.frequency.value = 38;
    const engG = ctx.createGain(); engG.gain.value = 0;
    const engPan = ctx.createStereoPanner();
    for (const o of eng) { o.connect(engLp); o.start(); }
    engLp.connect(engHp); engHp.connect(engG); engG.connect(engPan); engPan.connect(mix);
    const white = noise(ctx, rnd, 9.7, 'white'), pink = noise(ctx, rnd, 11.3, 'pink', 24000), pink2 = noise(ctx, rnd, 13.1, 'pink', 24000);
    const loop = (e, off) => { const s = ctx.createBufferSource(); s.buffer = e.buf; s.loop = true; s.loopEnd = e.loopEnd; s.start(now(), e.loopEnd * off); return s; };
    const airSrc = loop(white, rnd());
    const airBp = ctx.createBiquadFilter(); airBp.type = 'bandpass'; airBp.frequency.value = 2600; airBp.Q.value = 0.7;
    const airG = ctx.createGain(); airG.gain.value = 0;
    airSrc.connect(airBp); airBp.connect(airG); airG.connect(engPan);
    count(11);

    // ---- space between: a slow dark bed and a faint high shimmer
    const bedSrc = loop(pink, rnd());
    const bedLp = ctx.createBiquadFilter(); bedLp.type = 'lowpass'; bedLp.frequency.value = 520; bedLp.Q.value = 0.5;
    const bedHp = ctx.createBiquadFilter(); bedHp.type = 'highpass'; bedHp.frequency.value = 70;
    const bedG = ctx.createGain(); bedG.gain.value = 0;
    bedSrc.connect(bedHp); bedHp.connect(bedLp); bedLp.connect(bedG); bedG.connect(mix);
    const shSrc = loop(white, rnd());
    const shBp = ctx.createBiquadFilter(); shBp.type = 'bandpass'; shBp.frequency.value = 7200; shBp.Q.value = 4;
    const shG = ctx.createGain(); shG.gain.value = 0;
    // a slow swell on the shimmer: a 0.07 Hz sine into its gain
    const shLfo = ctx.createOscillator(); shLfo.frequency.value = 0.07; const shDepth = ctx.createGain(); shDepth.gain.value = 0;
    shLfo.connect(shDepth); shDepth.connect(shG.gain); shLfo.start();
    shSrc.connect(shBp); shBp.connect(shG); shG.connect(mix);
    count(12);

    // ---- the descent's rush: pink noise through a lowpass that opens as it swells
    const rushSrc = loop(pink2, rnd());
    const rushLp = ctx.createBiquadFilter(); rushLp.type = 'lowpass'; rushLp.frequency.value = 200; rushLp.Q.value = 0.6;
    const rushHp = ctx.createBiquadFilter(); rushHp.type = 'highpass'; rushHp.frequency.value = 45;
    const rushG = ctx.createGain(); rushG.gain.value = 0;
    rushSrc.connect(rushHp); rushHp.connect(rushLp); rushLp.connect(rushG); rushG.connect(mix);
    count(4);

    // ---- the eleven voices: a pad on each world's chord, lowpassed at its brightness, plus a lead
    // bus the generative phrase plays into; each voice: level -> pan -> mix (and sends)
    const voices = {};
    for (const slug of SLUGS) {
      const v = VOICES[slug];
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(v.bright * 1.5, 3500); lp.Q.value = 0.6;
      const level = ctx.createGain(); level.gain.value = 0;
      const pan = ctx.createStereoPanner();
      lp.connect(level); level.connect(pan); pan.connect(mix);
      const sd = ctx.createGain(); sd.gain.value = v.dly; pan.connect(sd); sd.connect(dly);
      const sv = ctx.createGain(); sv.gain.value = v.wet * 0.8 + 0.1; pan.connect(sv); sv.connect(verb);
      const padG = ctx.createGain(); padG.gain.value = ORBIT_MIX.voicePad; padG.connect(lp);
      const padLp = ctx.createBiquadFilter(); padLp.type = 'lowpass'; padLp.frequency.value = Math.min(v.bright, 900); padLp.connect(padG);
      const oscs = v.padIv.map((iv, i) => {
        const o = ctx.createOscillator(); o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = v.root * Math.pow(2, iv / 12) * (i === 0 ? 0.5 : 1);
        o.detune.value = (rnd() - 0.5) * 8;
        const og = ctx.createGain(); og.gain.value = [0.5, 0.32, 0.22][i] || 0.2;
        o.connect(og); og.connect(padLp); o.start();
        return o;
      });
      // the pad breathes: a slow sine on its level, each world at its own rate
      const br = ctx.createOscillator(); br.frequency.value = 0.05 + rnd() * 0.05; const brD = ctx.createGain(); brD.gain.value = 0.18 * ORBIT_MIX.voicePad;
      br.connect(brD); brD.connect(padG.gain); br.start();
      const leadBus = ctx.createGain(); leadBus.gain.value = 1 - ORBIT_MIX.voicePad; leadBus.connect(lp);
      voices[slug] = { v, lp, level, pan, leadBus, oscs, br, next: 0, deg: 0, oct: v.oct, lvl: 0 };
      count(10 + oscs.length * 2);
    }
    g = { mix, fade, mute, comp, clip, verb, dly, pulseLp, pulseG, eng, engLp, engG, engPan, airG, airBp, bedG, bedLp, shG, shDepth, rushG, rushLp, voices,
      sources: [airSrc, bedSrc, shSrc, rushSrc, ...eng, shLfo, ...Object.values(voices).flatMap((x) => [...x.oscs, x.br])] };
  }

  // ---- scheduled sounds (transient nodes, self-stopping)
  function heart(when, amp) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(60, when); o.frequency.exponentialRampToValueAtTime(46, when + 0.22);
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0, when); gg.gain.linearRampToValueAtTime(0.42 * amp, when + 0.035); gg.gain.exponentialRampToValueAtTime(0.0001, when + 0.55);
    o.connect(gg); gg.connect(g.pulseLp); o.start(when); o.stop(when + 0.6);
    o.onended = () => gg.disconnect();
  }
  function reply(when, amp) {
    // the Artifact's slightly wrong reply: 196 sagging to 185, with a faint fifth above
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(196, when); o.frequency.linearRampToValueAtTime(185, when + 1.2);
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0, when); gg.gain.linearRampToValueAtTime(0.13 * amp, when + 0.25); gg.gain.setTargetAtTime(0.0001, when + 1.2, 0.45);
    o.connect(gg); gg.connect(g.pulseLp); o.start(when); o.stop(when + 3.6);
    o.onended = () => gg.disconnect();
  }
  function note(vo, freq, when, vel, dur) {
    const w = vo.v.wave;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = w; o2.type = w === 'square' ? 'square' : 'triangle'; o2.detune.value = 6;
    o.frequency.value = freq; o2.frequency.value = freq;
    const k = w === 'square' ? 0.5 : w === 'sawtooth' ? 0.6 : 1;
    const gg = ctx.createGain();
    gg.gain.setValueAtTime(0, when); gg.gain.linearRampToValueAtTime(vel * k, when + 0.06); gg.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(gg); o2.connect(gg); gg.connect(vo.leadBus);
    o.start(when); o2.start(when); o.stop(when + dur + 0.05); o2.stop(when + dur + 0.05);
    o.onended = () => gg.disconnect();
  }
  // a slow generative phrase in the world's scale: a walk by small steps, with rests and long notes,
  // drawn fresh every time (so it never repeats as a loop); only while the voice can be heard
  function phrase(vo, horizon) {
    const v = vo.v, step = (v.step / 1000) * 1.7;
    if (vo.next < now()) vo.next = now() + 0.05;
    while (vo.next < horizon) {
      const r = rndNote();
      if (r < 0.42) { vo.next += step * (1 + Math.floor(rndNote() * 3)); continue; }   // rest
      const mv = [-2, -1, -1, 0, 1, 1, 2][Math.floor(rndNote() * 7)];
      vo.deg = clamp(vo.deg + mv, -2, v.scale.length + 2);
      if (rndNote() < 0.12) vo.deg = 0;                                                  // home
      const d = Math.round(vo.deg), n = v.scale.length;
      const semis = v.scale[((d % n) + n) % n] + 12 * (vo.oct + Math.floor(d / n));
      const len = 1 + Math.floor(rndNote() * 3);
      const dur = len * step * 0.95 + 0.3;
      if (vo.lvl > 0.002) note(vo, v.root * Math.pow(2, semis / 12), vo.next, 0.16 + rndNote() * 0.08, dur);
      vo.next += len * step;
    }
  }

  // ---- per frame
  function update(s) {
    if (!ctx || !g || dead) return;
    try {
      const t = now(), M = ORBIT_MIX;
      const pull = clamp(s.pull || 0), duck = 1 - M.duck * pull;
      // the pulse: always keeps time (the beat grid is the context's own clock), heard by the hull
      const hd = Math.max(0, s.hullDist ?? 1e9);
      const near = 1 - smooth(60, 20000, hd);
      const pulseLvl = Math.max(M.pulse * (M.pulseFar + (1 - M.pulseFar) * Math.pow(near, 2.2)), pull * M.pulse * 0.3);
      set(g.pulseG.gain, pulseLvl, 0.4);
      set(g.pulseLp.frequency, 220 + 2600 * Math.pow(1 - smooth(60, 6000, hd), 1.6), 0.4);
      if (st.nextBeat < t) st.nextBeat = Math.ceil(t / PULSE) * PULSE;
      while (st.nextBeat < t + 0.3) { heart(st.nextBeat, 1); reply(st.nextBeat + 0.12, 1); st.nextBeat += PULSE; }
      // the shuttle
      const thr = clamp((s.speed || 0) / Math.max(1, s.cap || 1), 0, 2);
      const boost = s.boost ? 1 : 0, on = s.thrust > 0 ? 1 : 0;
      const push = clamp(0.35 * on + 0.65 * Math.min(1, thr));
      const engLvl = M.engine * (0.07 + 0.43 * on + 0.3 * boost) * (0.6 + 0.4 * Math.min(1, thr)) * duck * (s.descent ? 0.3 : 1);
      set(g.engG.gain, engLvl, 0.35);
      set(g.engLp.frequency, 160 + 650 * push + 1300 * boost, 0.5);
      const pitch = 49 * (1 + 0.08 * push + 0.05 * boost);
      for (const o of g.eng.slice(0, 2)) set(o.frequency, pitch, 0.6);
      set(g.eng[2].frequency, pitch * 2, 0.6);
      set(g.airG.gain, M.air * boost * duck, 0.4);
      set(g.engPan.pan, clamp(-(s.bank || 0) * 0.4, -0.35, 0.35), 0.3);
      // space between: thinner the further from everything
      const ws = s.worlds || [];
      let nearest = hd;
      for (const w of ws) nearest = Math.min(nearest, Math.max(0, w.surf ?? 1e9));
      const open = smooth(400, 30000, nearest);
      const bedLvl = M.bed * lerp(1, M.bedFar, open) * (1 - 0.5 * pull);
      set(g.bedG.gain, bedLvl, 1.2);
      set(g.bedLp.frequency, lerp(700, 300, open), 1.5);
      set(g.shG.gain, M.shimmer * lerp(1, 0.2, open), 1.5);
      set(g.shDepth.gain, M.shimmer * lerp(0.8, 0.15, open), 1.5);
      // the voices: closeness, pull-back, the descent's swell, the reduced view's focus
      const dsl = s.descent ? s.descent.slug : null, dt0 = s.descent ? clamp(s.descent.t / 0.9) : 0;
      for (const w of ws) {
        const vo = g.voices[w.slug]; if (!vo) continue;
        let c = Math.pow(smooth(8, 0.4, w.x), 1.6);
        if (s.focus === w.slug) c = Math.max(c, 0.55);
        if (dsl === w.slug) c = Math.max(c, lerp(c, 1.35, dt0));
        else if (dsl) c *= 1 - dt0;
        const lvl = M.voice * Math.max(c, pull * M.orrery);
        vo.lvl = lvl;
        set(vo.level.gain, lvl, 0.6);
        set(vo.pan.pan, clamp(w.pan || 0, -0.9, 0.9), 0.4);
        if (lvl > 0.002) phrase(vo, t + 0.4); else vo.next = 0;
      }
      // the descent: a rush of air that swells and opens over the flood, ending near the surface's wind
      if (s.descent) {
        const k = clamp(s.descent.t / 0.9);
        set(g.rushG.gain, M.rush * Math.pow(k, 1.5), 0.08);
        set(g.rushLp.frequency, 250 + 1100 * k, 0.1);
      } else { set(g.rushG.gain, 0, 0.3); }
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
          // arrival: fade in over about two seconds
          g.fade.gain.setValueAtTime(0, now());
          g.fade.gain.linearRampToValueAtTime(hidden ? 0 : 1, now() + 2.0);
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
  return { start, update, setMuted, dispose, stats: () => ({ persistentNodes: st.nodes, state: ctx ? ctx.state : 'none', scriptProcessor: false, worklet: false }), get context() { return ctx; } };
}

// Offline render (tests): states(t) -> the update() state at time t (seconds); events(t) may return
// { mute: bool } to toggle muting. Updates run every `step` seconds through suspend/resume.
export async function renderScene(states, { seconds = 20, sr = 48000, step = 1 / 30, seed = 7, events = null } = {}) {
  const oac = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
  const s = createSound({ context: oac, seed });
  await s.start();
  for (let k = 1, t = step; t < seconds - step; k++, t = k * step) {
    oac.suspend(Math.round(t * sr / 128) * 128 / sr).then(() => {
      const st = states(t);
      s.update({ dt: step, ...st });
      const ev = events && events(t);
      if (ev && ev.mute !== undefined) s.setMuted(ev.mute);
      oac.resume();
    }).catch(() => oac.resume());
  }
  const buf = await oac.startRendering();
  return { buffer: buf, nodes: s.stats().persistentNodes };
}
