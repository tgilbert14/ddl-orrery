// sound.js: the Dust Sea's ambient sound. Plain Web Audio, every sample generated here.
// No audio files, no dependencies, no network.
//
// Contract (the walker loads this with a dynamic import):
//   createSound(opts?) -> { start(), update(state), step(strength), land(strength), setMuted(bool), dispose() }
//   Nothing is created until start(). start() must be called from a user gesture; it creates and
//   resumes the context synchronously, builds the noise in later tasks, and returns a Promise of
//   true (running) or false (refused or unavailable: every call stays a silent no-op). Never rejects.
//   Steps arriving before the build finishes (about 30 ms on desktop) are dropped.
//   update({ dt, windSpeed, windDirRel, exposure, walkerSpeed, sliding, storm, stormGust }) once per
//   frame. storm 0..1 (optional) is the storm front at the listener: the wind rises and darkens into
//   a roar with slow gust swells (stormGust 0..1, 3 to 8 s), a hiss of sand on top, the steps nearly
//   gone; all of it eases back as it falls. See STORM_MIX for the measured levels.
//   step(strength 0..1) once per footfall.
//   land(strength 0..1) once per crest-leap landing (third person; optional for the caller).
//
// Test hook: createSound({ context, seed }) builds the same graph on a context you pass in
// (an OfflineAudioContext for rendering). With a passed context nothing listens to page
// visibility and dispose() does not close the context.
//
// Graph (all sources are looped noise buffers or one-shot step buffers):
//   wind body  (pink, lowpass)            ┐
//   wind mid A (pink, bandpass, panned)   │
//   wind mid B (pink, bandpass, panned)   ├─> mix -> fade (start/hide) -> mute -> soft clip -> out
//   wind hiss  (white, hp + lp, panned)   │
//   sand hiss  (white, bp, grain flutter) │
//   slide hiss + slide body               │
//   steps (one buffer per footfall)       ┘
// Slow gusting is computed here in JS (irregular, seconds long); fast turbulence and grain
// flutter are control-rate noise buffers fed straight into gain AudioParams.

const TAU = Math.PI * 2;

// The storm front's mix. Rendered offline (OfflineAudioContext, 20 s after a 4 s settle, no steps),
// the storm at full strength against the calm wind at the same spot: +7.3 dB RMS in a trough
// (exposure 0.3; its loudest second +9.5 dB over the calm RMS), +5.6 dB (+8.0) at exposure 0.6, +3.2 dB
// (+5.8) on a crest. Sample peaks stay under -4 dBFS. Nobody has listened to it yet.
export const STORM_MIX = {
  wind: 0.4,      // the wind's strength at the ears goes up by this share (and by the swells)
  swell: 0.35,    // gust swells: +-this share of that
  dark: 0.42,     // the filters close by this share (a roar, not a whistle)
  sand: 0.085,    // the hiss of sand on top
  steps: 0.9,     // the steps' bus drops by this share
};
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- noise buffers ---------------------------------------------------------------------------

// One uniform draw, unit variance. Used for the long beds, where start() time matters and the
// filters downstream make the distribution irrelevant to the ear.
function uni(rnd) {
  return (rnd() * 2 - 1) * 1.732;
}

function gauss(rnd) {
  // Sum of four uniforms: cheap, near Gaussian, bounded.
  return (rnd() + rnd() + rnd() + rnd() - 2) * 1.732;
}

function normaliseRms(data, target) {
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i] * data[i];
  const rms = Math.sqrt(s / data.length) || 1;
  const k = target / rms;
  for (let i = 0; i < data.length; i++) data[i] *= k;
}

// Crossfade the end of a buffer into its start so the loop point is seamless.
function makeLoopable(data, fadeLen) {
  const n = data.length;
  for (let i = 0; i < fadeLen; i++) {
    const t = i / fadeLen;
    const a = Math.sqrt(t), b = Math.sqrt(1 - t);
    data[i] = data[i] * a + data[n - fadeLen + i] * b;
  }
  // The folded-in tail stays in the buffer; callers loop only to loopEnd = length - fade.
}

// `rate` lets low-band beds be generated at a lower sample rate (the source resamples on play),
// which halves the work done inside the user's gesture.
function noiseBuffer(ctx, rnd, seconds, kind, channels = 1, rate = ctx.sampleRate) {
  const sr = rate;
  const fade = Math.floor(sr * 0.25);
  const n = Math.floor(sr * seconds) + fade;
  const buf = ctx.createBuffer(channels, n, sr);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    if (kind === 'white') {
      for (let i = 0; i < n; i++) d[i] = uni(rnd);
    } else if (kind === 'pink') {
      // Paul Kellet's refined pink filter.
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = uni(rnd);
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      }
    } else if (kind === 'brown') {
      let y = 0;
      for (let i = 0; i < n; i++) {
        y = (y + 0.02 * uni(rnd)) * 0.998;
        d[i] = y;
      }
    }
    normaliseRms(d, 0.3);
    makeLoopable(d, fade);
  }
  return { buf, loopEnd: (n - fade) / sr };
}

// Control-rate random signal, bipolar, unit RMS-ish (peak near 1), lowpassed at `hz`.
// Generated at 3 kHz (the lowest rate the spec allows): it never carries more than 45 Hz.
function controlBuffer(ctx, rnd, seconds, hz) {
  const sr = 3000;
  const fade = Math.floor(sr * 0.5);
  const n = Math.floor(sr * seconds) + fade;
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const k = 1 - Math.exp(-TAU * hz / sr);
  let a = 0, b = 0, c = 0;
  // Pre-roll so the filters are settled.
  for (let i = -sr; i < n; i++) {
    a += k * (uni(rnd) - a);
    b += k * (a - b);
    c += k * (b - c);
    if (i >= 0) d[i] = c;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let i = 0; i < n; i++) d[i] /= peak || 1;
  makeLoopable(d, fade);
  return { buf, loopEnd: (n - fade) / sr };
}

// Soft clip: linear to 0.5, then a tanh knee that never exceeds 0.70 (-3.1 dBFS).
function softClipCurve() {
  const n = 8193;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const ax = Math.abs(x);
    const y = ax <= 0.5 ? ax : 0.5 + 0.2 * Math.tanh((ax - 0.5) / 0.2);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

// ---- footstep synthesis ----------------------------------------------------------------------
// One buffer per footfall: a density envelope (the foot compressing the sand, then releasing)
// drives a stream of tiny noise grains, over a smooth "shh" and a faint low body. Every
// parameter is drawn fresh, so two steps never match.

function stepBuffer(ctx, rnd, strength, run) {
  const sr = ctx.sampleRate;
  const s = clamp(strength);
  const D = (0.17 - 0.065 * run) * lerp(0.8, 1.25, rnd()) * (0.72 + 0.28 * s);
  const n = Math.max(64, Math.floor(D * sr));
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);

  const ta = D * lerp(0.16, 0.3, rnd()) * (1 - 0.35 * run);  // compression time
  const tdec = (D - ta) / lerp(3.0, 4.2, rnd());
  const rate = lerp(1800, 4200, rnd()) * (0.55 + 0.45 * s) * (1 + 0.4 * run); // grains/s at peak
  const tauG = lerp(0.00012, 0.0005, rnd()) * (1 - 0.3 * run);
  const kG = Math.exp(-1 / (sr * tauG));
  const kS = 1 - Math.exp(-TAU * lerp(900, 1800, rnd()) / sr);       // "shh" lowpass
  const kL = 1 - Math.exp(-TAU * lerp(160, 260, rnd()) / sr);        // low body lowpass
  const mixG = lerp(0.5, 0.7, rnd()) * (0.85 + 0.3 * run);
  const mixS = lerp(0.22, 0.35, rnd());
  const mixL = lerp(0.12, 0.22, rnd()) * (1 - 0.5 * run) * (0.6 + 0.4 * s);
  const fadeIn = Math.floor(sr * 0.003), fadeOut = Math.floor(sr * 0.006);

  // Temporary component arrays so each can be normalised before mixing.
  const g = new Float32Array(n), sh = new Float32Array(n), lo = new Float32Array(n);
  let c = 0, ys = 0, yl1 = 0, yl2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = t < ta ? Math.pow(t / ta, 1.4) : Math.exp(-(t - ta) / tdec);
    const envSlow = t < ta * 1.3 ? Math.pow(t / (ta * 1.3), 2) : Math.exp(-(t - ta * 1.3) / (tdec * 0.8));
    if (rnd() < (rate * env) / sr) {
      const a = rnd();
      c += a * a * (0.4 + 0.6 * env);
    }
    c *= kG;
    const w = gauss(rnd);
    g[i] = w * c;
    ys += kS * (gauss(rnd) - ys);
    sh[i] = ys * env;
    yl1 += kL * (gauss(rnd) - yl1);
    yl2 += kL * (yl1 - yl2);
    lo[i] = yl2 * envSlow;
  }
  const rmsOf = (a) => { let q = 0; for (let i = 0; i < n; i++) q += a[i] * a[i]; return Math.sqrt(q / n) || 1; };
  const rg = rmsOf(g), rs = rmsOf(sh), rl = rmsOf(lo);
  for (let i = 0; i < n; i++) {
    let v = (mixG * g[i]) / rg + (mixS * sh[i]) / rs + (mixL * lo[i]) / rl;
    if (i < fadeIn) v *= i / fadeIn;
    if (i > n - fadeOut) v *= (n - i) / fadeOut;
    d[i] = v;
  }
  // RMS, not peak: one big grain must not make the whole step quieter. The soft clip guards peaks.
  normaliseRms(d, 0.2);
  return buf;
}

// ---- the sound object ------------------------------------------------------------------------

export function createSound(opts = {}) {
  const external = opts.context || null;
  const seed = opts.seed != null ? opts.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
  const rnd = mulberry32(seed);                     // wind, gusts, buffers
  const rndStep = mulberry32(seed ^ 0x9e3779b9);   // footsteps: own stream, so steps never shift the wind

  let ctx = null;
  let g = null;           // graph handles
  let dead = false;       // refused or disposed: everything is a no-op
  let muted = false;
  let hidden = false;
  let disposed = false;
  let visHandler = null;
  let ready = Promise.resolve(false);   // resolves when the graph is built

  // Smoothed state, advanced by update().
  const st = {
    windSpeed: 5, windDirRel: 0, exposure: 1, walkerSpeed: 0, sliding: 0,
    exp: 1, slide: 0, run: 0, rush: 0,
    gust: 1, gustTarget: 1, gustTimer: 0, gustRise: 1.2,
    gustB: 1, gustBTarget: 1, gustBTimer: 0,
    sinceParams: 1, stepSide: 1,
    stormIn: 0, storm: 0, stormGust: 0.5,
  };

  function now() { return ctx.currentTime; }

  function set(param, value, tau) {
    // Glide from wherever the param is to `value`; never jumps, so never clicks.
    param.setTargetAtTime(value, now(), tau);
  }

  function loopSource(entry, offsetFrac) {
    const src = ctx.createBufferSource();
    src.buffer = entry.buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = entry.loopEnd;
    src.start(now(), entry.loopEnd * offsetFrac);
    return src;
  }

  // Generate the noise material one buffer per task, so the gesture handler returns at once and
  // no single task blocks a frame for long. Resolves false if dispose() ran meanwhile.
  async function makeMaterial() {
    const yieldTask = () => new Promise((r) => setTimeout(r, 0));
    const jobs = [
      // Different lengths so the loops never line up. Layers that share a buffer start seconds
      // apart, which leaves only a comb far too dense to hear.
      ['pinkA', () => noiseBuffer(ctx, rnd, 13.3, 'pink', 2, 24000)],  // body (stereo)
      ['pinkM', () => noiseBuffer(ctx, rnd, 12.1, 'pink', 1, 24000)],  // both mid bands
      ['white', () => noiseBuffer(ctx, rnd, 14.3, 'white')],           // hiss, sand, slide
      ['brown', () => noiseBuffer(ctx, rnd, 8.9, 'brown', 1, 24000)],  // slide body
      ['ctl', () => ({
        turbA: controlBuffer(ctx, rnd, 17.0, 3.0),   // turbulence on the mid bands
        turbB: controlBuffer(ctx, rnd, 19.0, 4.5),
        turbH: controlBuffer(ctx, rnd, 15.0, 7.0),   // flutter on the hiss
        grain: controlBuffer(ctx, rnd, 7.0, 45.0),   // grain flutter on sand and slide
      })],
    ];
    const m = {};
    for (const [k, fn] of jobs) {
      await yieldTask();
      if (disposed) return null;
      m[k] = fn();
    }
    return m;
  }

  function build(m) {
    const sr = ctx.sampleRate;
    const out = ctx.destination;

    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve();
    clip.oversample = 'none';
    const mute = ctx.createGain();
    mute.gain.value = muted ? 0 : 1;
    const fade = ctx.createGain();
    fade.gain.value = 0;
    const mix = ctx.createGain();
    // Level staging. BED is the wind and sand; steps and the slide are trimmed back to their own
    // level, because they set the peaks. Crest stand at 6 m/s is about -25 dBFS RMS.
    const BED = 0.75, NEAR = 0.56 / BED;
    mix.gain.value = BED;
    mix.connect(fade); fade.connect(mute); mute.connect(clip); clip.connect(out);

    const { pinkA, pinkM, white, brown } = m;
    const { turbA, turbB, turbH, grain } = m.ctl;
    // Spread the shared-buffer layers evenly round the loop so no two start near each other.
    const o = rnd();

    const sources = [];
    const vca = (base) => { const n = ctx.createGain(); n.gain.value = base; return n; };
    const modulate = (vcaNode, ctlEntry, offset) => {
      // ctl -> depth gain -> vca.gain ; depth tracks the layer level so modulation is relative.
      const src = loopSource(ctlEntry, offset);
      const depth = ctx.createGain();
      depth.gain.value = 0;
      src.connect(depth); depth.connect(vcaNode.gain);
      sources.push(src);
      return depth;
    };

    // Wind body: stereo pink, lowpassed. The distant air that stays in the trough.
    const bodySrc = loopSource(pinkA, rnd()); sources.push(bodySrc);
    const bodyLp = ctx.createBiquadFilter(); bodyLp.type = 'lowpass'; bodyLp.frequency.value = 250; bodyLp.Q.value = 0.5;
    const bodyLp2 = ctx.createBiquadFilter(); bodyLp2.type = 'lowpass'; bodyLp2.frequency.value = 250; bodyLp2.Q.value = 0.5;
    const bodyHp = ctx.createBiquadFilter(); bodyHp.type = 'highpass'; bodyHp.frequency.value = 55; bodyHp.Q.value = 0.7;
    const bodyHp2 = ctx.createBiquadFilter(); bodyHp2.type = 'highpass'; bodyHp2.frequency.value = 45; bodyHp2.Q.value = 0.6;
    const bodyV = vca(0);
    const bodyPan = ctx.createStereoPanner();
    bodySrc.connect(bodyHp); bodyHp.connect(bodyHp2); bodyHp2.connect(bodyLp); bodyLp.connect(bodyLp2); bodyLp2.connect(bodyV); bodyV.connect(bodyPan); bodyPan.connect(mix);

    // Wind mid: two bandpassed pink layers, each with its own turbulence and drift.
    const mkMid = (buf, turb, offset) => {
      const src = loopSource(buf, offset); sources.push(src);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.8;
      const v = vca(0);
      const depth = modulate(v, turb, rnd());
      const pan = ctx.createStereoPanner();
      src.connect(bp); bp.connect(v); v.connect(pan); pan.connect(mix);
      return { bp, v, depth, pan };
    };
    const midA = mkMid(pinkM, turbA, o);
    const midB = mkMid(pinkM, turbB, (o + 0.5) % 1);

    // Wind hiss: the bright air on a crest. Highpass + lowpass; the lowpass is the tilt by heading.
    const hissSrc = loopSource(white, o); sources.push(hissSrc);
    const hissHp = ctx.createBiquadFilter(); hissHp.type = 'highpass'; hissHp.frequency.value = 1800; hissHp.Q.value = 0.6;
    const hissLp = ctx.createBiquadFilter(); hissLp.type = 'lowpass'; hissLp.frequency.value = 6000; hissLp.Q.value = 0.5;
    const hissV = vca(0);
    const hissDepth = modulate(hissV, turbH, rnd());
    const hissPan = ctx.createStereoPanner();
    hissSrc.connect(hissHp); hissHp.connect(hissLp); hissLp.connect(hissV); hissV.connect(hissPan); hissPan.connect(mix);

    // Sand: grains skittering on exposed ground. High band with fast irregular flutter.
    const sandSrc = loopSource(white, (o + 1 / 3) % 1); sources.push(sandSrc);
    const sandBp = ctx.createBiquadFilter(); sandBp.type = 'bandpass'; sandBp.frequency.value = 6500; sandBp.Q.value = 0.7;
    const sandV = vca(0);
    const sandDepth = modulate(sandV, grain, rnd());
    const sandPan = ctx.createStereoPanner();
    sandSrc.connect(sandBp); sandBp.connect(sandV); sandV.connect(sandPan); sandPan.connect(mix);

    // Sliding: a sandy hiss with grain flutter, plus a low body.
    const slSrc = loopSource(white, (o + 2 / 3) % 1); sources.push(slSrc);
    const slBp = ctx.createBiquadFilter(); slBp.type = 'bandpass'; slBp.frequency.value = 2000; slBp.Q.value = 0.6;
    const slV = vca(0);
    const slDepth = modulate(slV, grain, rnd());
    const slBus = ctx.createGain(); slBus.gain.value = NEAR; slBus.connect(mix);
    slSrc.connect(slBp); slBp.connect(slV); slV.connect(slBus);
    const sbSrc = loopSource(brown, rnd()); sources.push(sbSrc);
    const sbLp = ctx.createBiquadFilter(); sbLp.type = 'lowpass'; sbLp.frequency.value = 260; sbLp.Q.value = 0.6;
    const sbHp = ctx.createBiquadFilter(); sbHp.type = 'highpass'; sbHp.frequency.value = 60; sbHp.Q.value = 0.7;
    const sbV = vca(0);
    sbSrc.connect(sbHp); sbHp.connect(sbLp); sbLp.connect(sbV); sbV.connect(slBus);

    // Steps arrive here.
    const stepBus = ctx.createGain(); stepBus.gain.value = NEAR; stepBus.connect(mix);

    g = {
      sr, mix, fade, mute, clip, sources, stepBus,
      bodyLp, bodyLp2, bodyV, bodyPan,
      midA, midB, hissLp, hissHp, hissV, hissDepth, hissPan,
      sandBp, sandV, sandDepth, sandPan, slBp, slV, slDepth, sbLp, sbV,
    };
  }

  // ---- gusting: irregular, seconds long, faster up than down --------------------------------
  function advanceGusts(dt) {
    st.gustTimer -= dt;
    if (st.gustTimer <= 0) {
      const r = rnd();
      // Mostly moderate, sometimes a proper gust, sometimes a lull.
      st.gustTarget = r < 0.18 ? lerp(1.25, 1.55, rnd()) : r < 0.32 ? lerp(0.55, 0.72, rnd()) : lerp(0.82, 1.12, rnd());
      st.gustRise = st.gustTarget > st.gust ? lerp(0.6, 1.6, rnd()) : lerp(1.6, 3.4, rnd());
      st.gustTimer = lerp(1.4, 6.5, rnd());
    }
    st.gust += (st.gustTarget - st.gust) * (1 - Math.exp(-dt / st.gustRise));

    // A second, independent gust process for the other mid band, so the two do not breathe together.
    st.gustBTimer -= dt;
    if (st.gustBTimer <= 0) {
      st.gustBTarget = lerp(0.7, 1.3, rnd());
      st.gustBTimer = lerp(0.9, 4.0, rnd());
    }
    st.gustB += (st.gustBTarget - st.gustB) * (1 - Math.exp(-dt / 1.1));
  }

  function applyParams(first) {
    const tau = first ? 0.05 : 0.12;
    const ws = clamp(st.windSpeed, 0, 25);
    const wn = ws / 6;                                    // 1.0 at a mid calm wind
    const e = st.exp;                                     // smoothed exposure
    const face = Math.cos(st.windDirRel);                 // +1 in the face, -1 behind
    const faceN = 0.5 + 0.5 * face;
    const side = Math.sin(st.windDirRel);                 // +1 from the right
    const rush = st.rush;                                 // 0..1 running air
    // the storm front: no shelter anywhere, the wind up and swelling, every filter closing
    const S = st.storm, swell = 1 + STORM_MIX.swell * (st.stormGust * 2 - 1);
    const shelter = lerp(0.22 + 0.78 * e, 1, S);          // how much wind reaches you
    const local = wn * st.gust * shelter * (1 + STORM_MIX.wind * S * swell);   // effective wind at the ears
    const crest = Math.pow(e, 1.6);                       // the bright stuff needs real exposure
    const dark = 1 - STORM_MIX.dark * S;

    // Body: always there, narrows and darkens in a trough.
    const bodyLevel = 0.30 * Math.pow(Math.min(local, 2) + 0.12, 0.9) * (0.85 + 0.15 * faceN) * (1 + 0.6 * rush);
    const bodyCut = (150 + 300 * Math.min(local, 1.8) + 80 * faceN + 120 * rush) * dark;
    set(g.bodyV.gain, bodyLevel, tau);
    set(g.bodyLp.frequency, bodyCut, tau);
    set(g.bodyLp2.frequency, bodyCut * 1.3, tau);
    set(g.bodyPan.pan, 0.2 * side, tau);

    // Mid bands: the moving body of the wind. Centre drifts with gust; face is fuller.
    // The (1 - e) floor is the distant wind over the crests heard from a trough: it keeps a little
    // mid-band air where phone speakers can play it, so shelter reads as quiet, not as broken.
    const midBase = 0.55 * Math.pow(local, 1.5) * (0.55 + 0.45 * faceN) * (0.35 + 0.65 * e)
      + 0.03 * wn * (1 - e) + 0.25 * rush * rush;
    const lA = midBase * st.gust;
    const lB = midBase * 0.8 * st.gustB;
    set(g.midA.v.gain, lA, tau);
    set(g.midA.depth.gain, lA * 0.45, tau);
    set(g.midA.bp.frequency, ((320 + 520 * Math.min(local, 1.8)) * (0.85 + 0.3 * faceN) + 250 * rush) * dark, tau);
    set(g.midA.pan.pan, clamp(0.55 * side + 0.1, -1, 1), tau);
    set(g.midB.v.gain, lB, tau);
    set(g.midB.depth.gain, lB * 0.5, tau);
    set(g.midB.bp.frequency, ((700 + 900 * Math.min(local, 1.8)) * (0.8 + 0.4 * faceN) + 400 * rush) * dark, tau);
    set(g.midB.pan.pan, clamp(0.45 * side - 0.15, -1, 1), tau);

    // Hiss: almost gone in a trough, opens on a crest, duller from behind.
    const hissLevel = (0.11 * Math.pow(Math.max(0, local - 0.25), 1.6) * crest * (0.5 + 0.5 * faceN) + 0.05 * rush * rush) * (1 - 0.6 * S);
    set(g.hissV.gain, hissLevel, tau);
    set(g.hissDepth.gain, hissLevel * 0.5, tau);
    set(g.hissLp.frequency, (3200 + 5200 * faceN * (0.5 + 0.5 * e)) * dark, tau);
    set(g.hissPan.pan, 0.65 * side, tau);

    // Sand: windSpeed x exposure. Grains start moving around 3 m/s.
    const drive = clamp((ws * st.gust - 2.5) / 6, 0, 1.4);
    const sandLevel = 0.11 * Math.pow(drive, 1.4) * Math.pow(e, 2.2) * (1 - S) + STORM_MIX.sand * S * (0.75 + 0.5 * st.stormGust);
    set(g.sandV.gain, sandLevel, tau);
    set(g.sandDepth.gain, sandLevel * 0.9, tau);
    set(g.sandBp.frequency, lerp(5200 + 2200 * faceN, 3800 + 900 * faceN, S), tau);
    set(g.stepBus.gain, (0.56 / 0.75) * (1 - STORM_MIX.steps * S), 0.3);
    set(g.sandPan.pan, 0.3 * side, tau);

    // Sliding: rises with it; the smoothed value gives the tail.
    const sl = st.slide;
    const slLevel = 0.24 * Math.pow(sl, 1.2);
    set(g.slV.gain, slLevel, tau);
    set(g.slDepth.gain, slLevel * 0.7, tau);
    set(g.slBp.frequency, 1300 + 1500 * sl, tau);
    set(g.sbV.gain, 0.4 * sl, tau);
    set(g.sbLp.frequency, 180 + 160 * sl, tau);
  }

  // ---- visibility ---------------------------------------------------------------------------
  function onVisibility() {
    if (!ctx || dead || external) return;
    hidden = document.hidden;
    if (hidden) {
      if (g) { g.fade.gain.cancelScheduledValues(now()); set(g.fade.gain, 0, 0.03); }
      setTimeout(() => { if (hidden && ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); }, 250);   // 8 time constants: faded to about -70 dB first
    } else {
      const p = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
      p.then(() => {
        if (!hidden && g && ctx && ctx.state === 'running') { g.fade.gain.cancelScheduledValues(now()); set(g.fade.gain, 1, 0.25); }
      }).catch(() => {});
    }
  }

  // ---- public API ---------------------------------------------------------------------------
  function fail() {
    // Refused, or a node type missing on this engine: become a silent no-op.
    dead = true;
    if (ctx && !external) { try { ctx.close().catch(() => {}); } catch (e) { /* already closed */ } }
    g = null;
  }

  function start() {
    if (dead || disposed) return Promise.resolve(false);
    try {
      if (!ctx) {
        if (external) {
          ctx = external;
        } else {
          const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
          if (!AC) { dead = true; return Promise.resolve(false); }
          ctx = new AC();
          if (typeof document !== 'undefined') {
            visHandler = onVisibility;
            document.addEventListener('visibilitychange', visHandler);
            hidden = document.hidden;
          }
        }
        // resume() runs synchronously inside the gesture, before any other work.
        const resumed = external || ctx.state === 'running' || hidden ? Promise.resolve() : ctx.resume();
        ready = makeMaterial().then((m) => {
          if (!m || disposed) return false;
          build(m);
          // Initialise every layer at its current target, then let the fade bring it in.
          applyParams(true);
          g.fade.gain.setValueAtTime(0, now());
          g.fade.gain.setTargetAtTime(hidden ? 0 : 1, now() + 0.02, 0.6);
          return true;
        }).catch(() => { fail(); return false; });
        return Promise.all([ready, resumed.catch(() => {})])
          .then(([ok]) => !!ok && !dead && (!!external || ctx.state === 'running'));
      }
      if (external) return ready;
      // A second call: retry the resume if an earlier one was refused.
      const again = ctx.state === 'running' || hidden || ctx.state === 'closed' ? Promise.resolve() : ctx.resume();
      return Promise.all([ready, again.catch(() => {})])
        .then(([ok]) => !!ok && !dead && ctx.state === 'running');
    } catch (err) {
      fail();
      return Promise.resolve(false);
    }
  }

  function update(state) {
    if (!state) return;
    const dt = clamp(Number(state.dt) || 0, 0, 0.25);
    if (Number.isFinite(state.windSpeed)) st.windSpeed = state.windSpeed;
    if (Number.isFinite(state.windDirRel)) st.windDirRel = state.windDirRel;
    if (Number.isFinite(state.exposure)) st.exposure = clamp(state.exposure);
    if (Number.isFinite(state.walkerSpeed)) st.walkerSpeed = Math.max(0, state.walkerSpeed);
    if (Number.isFinite(state.sliding)) st.sliding = clamp(state.sliding);
    if (Number.isFinite(state.storm)) st.stormIn = clamp(state.storm);
    if (Number.isFinite(state.stormGust)) st.stormGust = clamp(state.stormGust);
    // the storm eases in and out over a couple of seconds
    st.storm += (st.stormIn - st.storm) * (1 - Math.exp(-dt / 1.5));
    if (st.storm < 1e-4 && st.stormIn === 0) st.storm = 0;

    // Exposure follows within a quarter second; slide rises fast and tails off slowly.
    st.exp += (st.exposure - st.exp) * (1 - Math.exp(-dt / 0.25));
    const slTau = st.sliding > st.slide ? 0.12 : 0.45;
    st.slide += (st.sliding - st.slide) * (1 - Math.exp(-dt / slTau));
    if (st.slide < 1e-4 && st.sliding === 0) st.slide = 0;
    const runTarget = smooth(2.2, 3.6, st.walkerSpeed);
    st.run += (runTarget - st.run) * (1 - Math.exp(-dt / 0.3));
    const rushTarget = Math.pow(clamp(st.walkerSpeed / 4.5), 1.5);
    st.rush += (rushTarget - st.rush) * (1 - Math.exp(-dt / 0.5));
    advanceGusts(dt);

    if (!ctx || !g || dead || disposed) return;
    if (!external && (ctx.state !== 'running' || hidden)) return;
    st.sinceParams += dt;
    if (st.sinceParams < 0.03) return;                    // about 30 parameter updates a second
    st.sinceParams = 0;
    try { applyParams(false); } catch (err) { /* never throw into the render loop */ }
  }

  function step(strength) {
    if (!ctx || !g || dead || disposed) return;
    if (!external && (ctx.state !== 'running' || hidden)) return;
    try {
      const s = clamp(Number(strength) || 0);
      if (s <= 0.01) return;
      const run = st.run;
      const src = ctx.createBufferSource();
      src.buffer = stepBuffer(ctx, rndStep, s, run);
      src.playbackRate.value = lerp(0.9, 1.12, rndStep());   // pitch variation, no two alike

      const hp = ctx.createBiquadFilter(); hp.type = 'highpass';
      hp.frequency.value = lerp(110, 170, rndStep()) + 80 * run; hp.Q.value = 0.6;
      const peak = ctx.createBiquadFilter(); peak.type = 'peaking';
      peak.frequency.value = lerp(700, 2600, rndStep()); peak.Q.value = lerp(0.7, 1.5, rndStep()); peak.gain.value = lerp(-4, 5, rndStep());
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = (2200 + 3800 * s + 2600 * run) * lerp(0.8, 1.2, rndStep()); lp.Q.value = 0.5;
      const v = ctx.createGain();
      v.gain.value = 0.9 * Math.pow(s, 1.4) * lerp(0.82, 1.08, rndStep()) * (1 - 0.45 * run);
      const pan = ctx.createStereoPanner();
      st.stepSide = -st.stepSide;
      pan.pan.value = st.stepSide * lerp(0.04, 0.12, rndStep());

      src.connect(hp); hp.connect(peak); peak.connect(lp); lp.connect(v); v.connect(pan); pan.connect(g.stepBus);
      src.onended = () => { try { pan.disconnect(); } catch (e) { /* already gone */ } };
      src.start(now());
    } catch (err) { /* silent */ }
  }

  // The crest leap's landing (third person): a low, dry thump into sand. The same grain synthesis as a
  // step, made heavy (the walking step's longer body, played about a fifth lower) and darkened (a
  // lowpass near 1 kHz instead of the step's 4 to 9 kHz), scaled by the landing (strength 0..1). Rendered
  // offline against a running step (strength 0.88), with the wind bed subtracted, a full-strength
  // landing is about 4.6 dB louder over its loudest 50 ms (5.6 dB in all: it is longer); strength 0.5, 1 dB.
  function land(strength) {
    if (!ctx || !g || dead || disposed) return;
    if (!external && (ctx.state !== 'running' || hidden)) return;
    try {
      const s = clamp(Number(strength) || 0);
      if (s <= 0.01) return;
      const src = ctx.createBufferSource();
      src.buffer = stepBuffer(ctx, rndStep, 1, 0);
      src.playbackRate.value = lerp(0.66, 0.76, rndStep());
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 55; hp.Q.value = 0.6;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.value = (700 + 600 * s) * lerp(0.9, 1.1, rndStep()); lp.Q.value = 0.6;
      const v = ctx.createGain();
      v.gain.value = 0.4 * (0.4 + 0.6 * s);
      src.connect(hp); hp.connect(lp); lp.connect(v); v.connect(g.stepBus);
      src.onended = () => { try { v.disconnect(); } catch (e) { /* already gone */ } };
      src.start(now());
    } catch (err) { /* silent */ }
  }

  function setMuted(m) {
    muted = !!m;
    if (!ctx || !g || dead) return;
    try {
      g.mute.gain.cancelScheduledValues(now());
      set(g.mute.gain, muted ? 0 : 1, muted ? 0.06 : 0.2);
    } catch (err) { /* silent */ }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (visHandler && typeof document !== 'undefined') document.removeEventListener('visibilitychange', visHandler);
    if (!ctx || !g) {
      // Disposed before the graph finished building: nothing is playing, just close.
      dead = true;
      if (ctx && !external && ctx.state !== 'closed') ctx.close().catch(() => {});
      return;
    }
    const c = ctx, graph = g;
    try {
      graph.fade.gain.cancelScheduledValues(c.currentTime);
      graph.fade.gain.setTargetAtTime(0, c.currentTime, 0.03);
    } catch (err) { /* silent */ }
    const finish = () => {
      for (const s of graph.sources) { try { s.stop(); } catch (e) { /* not started */ } }
      try { graph.clip.disconnect(); } catch (e) { /* gone */ }
      if (!external && c.state !== 'closed') c.close().catch(() => {});
    };
    if (external || c.state !== 'running') finish(); else setTimeout(finish, 200);
    dead = true;
  }

  return { start, update, step, land, setMuted, dispose };
}
