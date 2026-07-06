/* ============================================================
   07-audio.js - Score v3: the dread engine. Zero files.
   One synth graph, a generated concert hall, seven arrangements
   + the derelict hub (drone throb, heartbeat, hull groans, sonar).
   THE LAW (2.6): no pre-gesture sound. A boot-time resume() may
   succeed only where the browser itself already granted media
   engagement; otherwise the first activation-bearing gesture
   ignites. The UI claims "on" only after ctx.state === 'running';
   while armed-but-suspended it says "ready". The label never lies.
   Persistent graph: 8 nodes (bus, dry, wet, convolver, compressor,
   delay, delay-lowpass, delay-feedback). World rigs are scene-scoped
   transients (<=21 nodes; the hub rig is 8); notes are per-note
   transients, self-stopping, disconnected onended.
   ============================================================ */
'use strict';

const Score = (() => {
  /* ---------- the seven arrangements + the hub (all original) ----------
     root Hz, scale (semitones), step ms, bright Hz, gap (silent steps after
     the motif so it breathes), layer gains dr/pd/ch, padIv (pad chord),
     lead voice, perc pattern (16 steps: K taiko, s shaker, . rest) */
  const N = (d, o, dur, v) => ({ d, o, dur, v });
  const R = null;
  const ARR = {
    /* the derelict hold: drone throb + sub heartbeat + sparse glassy
       minor-second adjacencies + self-scheduled hull groans. No choir.
       gap 26 on a 600ms step: silence dominates (a ~25s cycle, mostly rest) */
    hub: {
      root: 220.0, scale: [0, 1, 3, 7, 8], step: 600, bright: 300, gap: 26,
      dr: 0.05, drDet: 9, pd: 0, ch: 0, padIv: [0, 7, 12], groan: true,
      lead: { wave: 'sine', dly: 0.18, wet: 0.55 },
      motif: [N(0,2,4,.05), R, R, R, R, N(1,2,5,.045), R, R, R, R, R, N(4,1,4,.04), R, N(3,1,5,.045), R, R],
      perc: 'H...H...H...H...',
    },
    /* vast desert epic: low slow Phrygian-dominant over heavy drone, sparse taiko */
    'dust-sea': {
      root: 98.0, scale: [0, 1, 4, 5, 7, 8, 10], step: 700, bright: 460, gap: 10,
      dr: 0.07, pd: 0.032, ch: 0, padIv: [0, 7, 12],
      lead: { wave: 'sawtooth', dly: 0.15, wet: 0.2 },
      motif: [N(0,0,2,.10), R, N(1,0,1,.07), N(0,0,2,.09), R, N(2,0,2,.08), R, R, N(3,0,1,.07), N(2,0,2,.08), R, R, N(1,0,1,.06), N(0,0,3,.09), R, R],
      perc: 'K.......K.....s.',
    },
    /* driving minor bass ostinato + bright octave sparks */
    velocity: {
      root: 174.6, scale: [0, 2, 3, 5, 7, 8, 10], step: 220, bright: 1800, gap: 4,
      dr: 0.03, pd: 0.024, ch: 0, padIv: [0, 3, 7], spark: true,
      lead: { wave: 'square', dly: 0.22, wet: 0 },
      motif: [N(0,-1,1,.12), R, N(0,-1,1,.09), N(2,-1,1,.10), N(0,-1,1,.09), R, N(3,-1,1,.10), N(4,-1,1,.11), N(0,-1,1,.12), R, N(0,-1,1,.09), N(2,-1,1,.10), N(5,-1,1,.10), N(4,-1,1,.10), N(3,-1,1,.09), N(2,-1,1,.09)],
      perc: 'K...s...K...s.s.',
    },
    /* minor add9 plucks, heavy delay, sparse */
    grid: {
      root: 164.8, scale: [0, 2, 3, 7, 10], step: 340, bright: 2400, gap: 8,
      dr: 0.02, pd: 0.02, ch: 0, padIv: [0, 7, 14],
      lead: { wave: 'triangle', dly: 0.55, wet: 0.1 },
      motif: [N(0,1,1,.10), R, R, N(1,1,1,.08), R, R, N(2,1,1,.09), R, R, R, N(4,0,1,.08), R, N(3,1,1,.07), R, R, R],
      perc: '........s.......',
    },
    /* submerged cathedral: whole-tone swells, low choir, the deep call */
    abyssal: {
      root: 130.8, scale: [0, 2, 4, 6, 8, 10], step: 850, bright: 460, gap: 12,
      dr: 0.045, pd: 0.04, ch: 0.026, chOct: -1, padIv: [0, 4, 8], call: true,
      lead: { wave: 'sine', dly: 0.2, wet: 0.4 },
      motif: [N(0,0,4,.07), R, R, R, N(1,0,4,.06), R, R, R, N(2,0,6,.06), R, R, R, R, N(4,-1,4,.05), R, R],
      perc: '................',
    },
    /* bright major chiptune: dry square lead, light pad only */
    arcadia: {
      root: 261.6, scale: [0, 2, 4, 7, 9], step: 170, bright: 2600, gap: 6,
      dr: 0, pd: 0.016, ch: 0, padIv: [0, 4, 7],
      lead: { wave: 'square', dly: 0, wet: 0, dry: true },
      motif: [N(0,1,1,.08), N(1,1,1,.07), N(2,1,1,.08), N(3,1,1,.07), N(2,1,1,.07), N(1,1,1,.07), N(0,1,2,.08), R, N(4,1,1,.07), N(3,1,1,.07), N(2,1,2,.08), R, N(1,1,1,.07), N(2,1,1,.07), N(0,1,3,.09), R],
      perc: 's...s...s...s...',
    },
    /* high-fantasy wonder: mixolydian rising fifth, pad + choir forward */
    aurora: {
      root: 196.0, scale: [0, 2, 4, 5, 7, 9, 10], step: 480, bright: 2000, gap: 8,
      dr: 0.024, pd: 0.05, ch: 0.03, padIv: [0, 7, 12],
      lead: { wave: 'triangle', dly: 0.3, wet: 0.3 },
      motif: [N(0,0,2,.08), N(4,0,2,.07), R, N(5,0,1,.06), N(4,0,2,.07), R, R, N(0,1,2,.08), R, N(6,0,1,.06), N(5,0,1,.06), N(4,0,2,.07), R, N(1,1,2,.06), R, R],
      perc: '............s...',
    },
    /* suspended 4ths that never resolve; thin pad */
    uncharted: {
      root: 220.0, scale: [0, 2, 5, 7, 10], step: 900, bright: 1100, gap: 10,
      dr: 0.022, pd: 0.018, ch: 0, padIv: [0, 5, 12],
      lead: { wave: 'sine', dly: 0.25, wet: 0.3 },
      motif: [N(2,0,3,.07), R, R, N(3,0,2,.06), R, N(2,0,3,.06), R, R, N(1,0,2,.05), R, N(2,0,4,.06), R, R, R, R, R],
      perc: '................',
    },
    /* the predictive hall: lydian wonder (raised 4th shimmer), slow deliberate
       triangle over a thin drone + maj7 pad, echoes like equations cascading */
    archive: {
      root: 155.6, scale: [0, 2, 4, 6, 7, 9, 11], step: 520, bright: 2200, gap: 8,
      dr: 0.03, pd: 0.046, ch: 0.02, padIv: [0, 7, 11],
      lead: { wave: 'triangle', dly: 0.42, wet: 0.32 },
      motif: [N(0,0,3,.07), R, R, N(2,0,2,.06), R, N(4,0,2,.06), R, R, N(3,0,2,.06), R, N(5,0,3,.06), R, R, N(4,0,2,.05), R, R],
      perc: '....s.......s...',
    },
    /* the drillyard: a calm zero-g cadence, dorian over a quartal pad;
       commands land clean, the hall holds the space between them */
    drillyard: {
      root: 146.8, scale: [0, 2, 3, 5, 7, 9, 10], step: 260, bright: 1500, gap: 6,
      dr: 0.028, pd: 0.022, ch: 0, padIv: [0, 5, 10],
      lead: { wave: 'triangle', dly: 0.3, wet: 0.22 },
      motif: [N(0,0,1,.09), R, N(3,0,1,.07), R, N(4,0,2,.08), R, R, N(0,1,1,.08), R, N(4,0,1,.06), R, N(3,0,2,.07), R, N(0,0,3,.08), R, R],
      perc: 'K...s.s.....K.s.',
    },
    /* the living weather: low natural-minor drone that throbs like a far
       front (wide detune), a 4th-stack pad that never resolves, taiko as
       distant impacts; the hull-groan voice reads as far thunder here */
    stormwall: {
      root: 110.0, scale: [0, 2, 3, 5, 7, 8, 10], step: 520, bright: 700, gap: 9,
      dr: 0.055, drDet: 11, pd: 0.028, ch: 0, padIv: [0, 5, 10], groan: true,
      lead: { wave: 'triangle', dly: 0.3, wet: 0.35 },
      motif: [N(0,0,2,.08), R, R, N(2,0,1,.06), N(3,0,2,.07), R, N(5,0,1,.06), R, N(0,1,3,.08), R, R, N(6,0,1,.05), N(5,0,2,.06), R, N(1,0,3,.05), R],
      perc: 'K.........K...s.',
    },
    /* distant horn-like calls over a cold drone: a rising call, then its
       falling answer, echoed down the delay like the fire chain. sparse. */
    beacons: {
      root: 110.0, scale: [0, 2, 4, 7, 9], step: 640, bright: 700, gap: 14,
      dr: 0.05, drDet: 7, pd: 0.03, ch: 0, padIv: [0, 7, 12],
      lead: { wave: 'sawtooth', dly: 0.28, wet: 0.4 },
      motif: [N(0,0,3,.09), R, R, N(2,0,2,.08), N(4,0,3,.10), R, R, R, N(4,0,2,.07), R, N(2,0,3,.07), R, N(0,0,4,.08), R, R, R],
      perc: 'K.......s.......',
    },
  };

  /* ---------- state ---------- */
  let ctx = null, bus = null, dry = null, wet = null, verb = null, comp = null;
  let dly = null, dlyLP = null, dlyFB = null, noiseBuf = null;
  let schedTimer = null, nextNote = 0, stepIdx = 0, holdUntil = 0, nextCallAt = 0, lastFanfare = -9;
  let nextGroanAt = 0, lastAnswer = -9, armed = false;
  let on = false, cfg = ARR.hub, rig = null;

  const btn = document.getElementById('audio-toggle');
  const label = btn.querySelector('.audio-label');

  /* ---------- one-time buffers (never per frame, never per note) ---------- */
  function makeIR(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        lp += 0.22 * (white - lp);                     /* slight lowpass tilt */
        d[i] = lp * Math.exp(-4.6 * i / len) * (1 - i / len);
      }
    }
    return buf;
  }
  function makeNoise() {
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  const noiseSrc = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s; };

  /* ---------- the persistent master chain (8 nodes) ---------- */
  function buildGraph() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = makeNoise();

    bus = ctx.createGain(); bus.gain.value = 0.0;
    dry = ctx.createGain(); dry.gain.value = 0.85;
    wet = ctx.createGain(); wet.gain.value = 0.3;      /* ~30% hall */
    verb = ctx.createConvolver(); verb.buffer = makeIR(3.0);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 20; comp.ratio.value = 3.5;
    comp.attack.value = 0.006; comp.release.value = 0.28;

    bus.connect(dry).connect(comp);
    bus.connect(verb); verb.connect(wet).connect(comp);
    comp.connect(ctx.destination);

    /* shared feedback delay send: voices tap dly per note */
    dly = ctx.createDelay(1.0); dly.delayTime.value = 0.38;
    dlyLP = ctx.createBiquadFilter(); dlyLP.type = 'lowpass'; dlyLP.frequency.value = 2400;
    dlyFB = ctx.createGain(); dlyFB.gain.value = 0.35;
    dly.connect(dlyLP); dlyLP.connect(dlyFB).connect(dly);
    dlyLP.connect(bus);                                /* repeats land in the hall too */

    /* an external interruption (another app takes audio focus) suspends the
       context with NO visibilitychange — re-verify the label so it never
       claims "on" over silence (the label never lies) */
    ctx.addEventListener('statechange', () => {
      if (document.hidden) return;                     /* the hide/show path owns that case */
      setUI(on && ctx.state === 'running' ? true : (on || armed) ? 'ready' : false);
    });
  }

  /* ---------- world rig: drone + pad + choir, scene-scoped ---------- */
  function buildRig(v) {
    const t = ctx.currentTime;
    const r = { g: ctx.createGain(), srcs: [], pd: null, bp1: null, bp2: null, b1: 0, b2: 0, ph: Math.random() * 6.28 };
    r.g.gain.value = 1; r.g.connect(bus);

    if (v.dr > 0) {                                    /* drone: 2 detuned saws + sub, breathing lowpass */
      const dRoot = v.root > 150 ? v.root / 2 : v.root;
      const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 300 + v.bright * 0.1; lpf.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v.dr, t + 1.4);
      const det = v.drDet || 6;                      /* cents; wider pair = faster beat-throb */
      const a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = dRoot; a.detune.value = -det;
      const b = ctx.createOscillator(); b.type = 'sawtooth'; b.frequency.value = dRoot; b.detune.value = det;
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = dRoot / 2;
      a.connect(lpf); b.connect(lpf); sub.connect(lpf); lpf.connect(g).connect(r.g);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06 + Math.random() * 0.03;
      const lg = ctx.createGain(); lg.gain.value = 120 + v.bright * 0.08;
      lfo.connect(lg).connect(lpf.frequency);
      [a, b, sub, lfo].forEach(o => { o.start(); r.srcs.push(o); });
    }
    if (v.pd > 0) {                                    /* pad: 3-osc stack through two parallel bandpasses, 2s attack */
      r.bp1 = ctx.createBiquadFilter(); r.bp1.type = 'bandpass'; r.b1 = 500 + v.bright * 0.15; r.bp1.frequency.value = r.b1; r.bp1.Q.value = 1.1;
      r.bp2 = ctx.createBiquadFilter(); r.bp2.type = 'bandpass'; r.b2 = 1100 + v.bright * 0.35; r.bp2.frequency.value = r.b2; r.bp2.Q.value = 1.6;
      r.pd = ctx.createGain(); r.pd.gain.setValueAtTime(0, t); r.pd.gain.linearRampToValueAtTime(v.pd, t + 2.2);
      const waves = ['triangle', 'sawtooth', 'triangle'], dets = [0, 6, -5];
      v.padIv.forEach((iv, i) => {
        const o = ctx.createOscillator(); o.type = waves[i % 3];
        o.frequency.value = v.root * Math.pow(2, iv / 12); o.detune.value = dets[i % 3];
        o.connect(r.bp1); o.connect(r.bp2);
        o.start(); r.srcs.push(o);
      });
      r.bp1.connect(r.pd); r.bp2.connect(r.pd); r.pd.connect(r.g);
    }
    if (v.ch > 0) {                                    /* choir: detuned triangles through a vowel filter pair */
      const cRoot = v.root * 2 * Math.pow(2, (v.chOct || 0));
      const bpA = ctx.createBiquadFilter(); bpA.type = 'bandpass'; bpA.frequency.value = 700; bpA.Q.value = 5;
      const bpB = ctx.createBiquadFilter(); bpB.type = 'bandpass'; bpB.frequency.value = 1100; bpB.Q.value = 5;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v.ch, t + 2.6);
      const t1 = ctx.createOscillator(); t1.type = 'triangle'; t1.frequency.value = cRoot; t1.detune.value = -5;
      const t2 = ctx.createOscillator(); t2.type = 'triangle'; t2.frequency.value = cRoot; t2.detune.value = 7;
      t1.connect(bpA); t1.connect(bpB); t2.connect(bpA); t2.connect(bpB);
      bpA.connect(g); bpB.connect(g); g.connect(r.g);
      const vib = ctx.createOscillator(); vib.frequency.value = 4.2;
      const vg = ctx.createGain(); vg.gain.value = 5;  /* cents */
      vib.connect(vg); vg.connect(t1.detune); vg.connect(t2.detune);
      [t1, t2, vib].forEach(o => { o.start(); r.srcs.push(o); });
    }
    r.fade = (at) => {
      r.g.gain.setValueAtTime(r.g.gain.value, at);
      r.g.gain.linearRampToValueAtTime(0.0001, at + 2);
      r.srcs.forEach(s => { try { s.stop(at + 2.3); } catch (_) {} });
      if (r.srcs[0]) r.srcs[0].onended = () => r.g.disconnect();
    };
    let nb = 0;
    r.breathe = (now) => {                             /* slow formant drift, re-aimed every ~2.4s */
      if (now < nb || !r.bp1) return;
      nb = now + 2.4;
      r.bp1.frequency.setTargetAtTime(r.b1 * (1 + 0.16 * Math.sin(now * 0.12 + r.ph)), now, 1.2);
      r.bp2.frequency.setTargetAtTime(r.b2 * (1 + 0.13 * Math.sin(now * 0.09 + r.ph * 1.7)), now, 1.2);
    };
    return r;
  }

  /* ---------- per-note transient voices ---------- */
  function note(freq, when, vel, dur, wave, dest, dlyAmt, wetAmt) {
    const o = ctx.createOscillator(); o.type = wave;
    const o2 = ctx.createOscillator(); o2.type = wave === 'square' ? 'square' : 'triangle'; o2.detune.value = 6;
    if (wave === 'square') vel *= 0.55;                /* squares are loud; keep the mix polite */
    if (wave === 'sawtooth') vel *= 0.6;
    const g = ctx.createGain();
    o.frequency.value = freq; o2.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); o2.connect(g); g.connect(dest);
    if (dlyAmt > 0) { const s = ctx.createGain(); s.gain.value = dlyAmt; g.connect(s).connect(dly); }
    if (wetAmt > 0) { const s = ctx.createGain(); s.gain.value = wetAmt; g.connect(s).connect(verb); }
    o.start(when); o2.start(when); o.stop(when + dur + 0.1); o2.stop(when + dur + 0.1);
    o.onended = () => g.disconnect();
  }
  function playLead(v, st, when) {
    const L = v.lead;
    const semis = v.scale[st.d % v.scale.length] + 12 * (st.o + Math.floor(st.d / v.scale.length));
    const f = v.root * Math.pow(2, semis / 12);
    const dur = st.dur * v.step / 1000 * 0.92 + 0.08;
    note(f, when, st.v, dur, L.wave, L.dry ? dry : bus, L.dly, L.wet);
    if (v.spark && st.v >= 0.11) note(f * 2, when + 0.03, st.v * 0.5, dur * 0.8, 'triangle', bus, 0.35, 0);
  }
  function taiko(when, vel) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(84, when);
    o.frequency.exponentialRampToValueAtTime(46, when + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.45);
    o.connect(g); g.connect(bus);
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel * 0.35, when);
    ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    n.connect(bp); bp.connect(ng); ng.connect(bus);
    o.start(when); o.stop(when + 0.5); n.start(when); n.stop(when + 0.08);
    o.onended = () => { g.disconnect(); ng.disconnect(); };
  }
  function shaker(when) {
    const n = noiseSrc();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.045, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    n.connect(hp); hp.connect(g); g.connect(dry);      /* crisp, no wash */
    n.start(when); n.stop(when + 0.09);
    n.onended = () => g.disconnect();
  }
  function deepCall(when) {                            /* abyssal: a sine call sliding down a fifth */
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(cfg.root, when);
    o.frequency.exponentialRampToValueAtTime(cfg.root * 0.667, when + 2.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.055, when + 0.7);
    g.gain.setTargetAtTime(0.0001, when + 2.6, 0.5);
    const w = ctx.createGain(); w.gain.value = 0.5;
    o.connect(g); g.connect(bus); g.connect(w).connect(verb);
    o.start(when); o.stop(when + 4.5);
    o.onended = () => g.disconnect();
  }
  function heart(when) {                             /* sub heartbeat: rounder + quieter than taiko */
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(60, when);
    o.frequency.exponentialRampToValueAtTime(46, when + 0.22);   /* ~52Hz center */
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.11, when + 0.035);          /* soft knuckle, no click, no noise snap */
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
    o.connect(g); g.connect(bus);
    o.start(when); o.stop(when + 0.55);
    o.onended = () => g.disconnect();
  }
  function groan(when) {                             /* pressure hull: bent bandpass noise + a faint metal cry */
    const out = ctx.createGain(); out.gain.value = 1; out.connect(bus);
    const w = ctx.createGain(); w.gain.value = 0.6; out.connect(w).connect(verb);
    const n = noiseSrc(); n.loop = true;             /* the 1.2s buffer loops; the Q8 band smears the seam */
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 8;
    bp.frequency.setValueAtTime(200, when);
    bp.frequency.exponentialRampToValueAtTime(95, when + 2.8);   /* the slow downward bend, 90-220 band */
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.12, when + 0.9);
    g.gain.setTargetAtTime(0.0001, when + 2.4, 0.45);
    n.connect(bp); bp.connect(g); g.connect(out);
    const o = ctx.createOscillator(); o.type = 'sine';           /* resonant overtone rides inside */
    o.frequency.setValueAtTime(233.1, when + 0.3);
    o.frequency.exponentialRampToValueAtTime(196.0, when + 2.6); /* gliss down a minor third */
    const og = ctx.createGain();
    og.gain.setValueAtTime(0, when + 0.3);
    og.gain.linearRampToValueAtTime(0.02, when + 1.1);
    og.gain.setTargetAtTime(0.0001, when + 2.3, 0.4);
    o.connect(og); og.connect(out);
    n.start(when); n.stop(when + 3.4); o.start(when + 0.3); o.stop(when + 3.4);
    n.onended = () => out.disconnect();
  }
  function ping(when, vel) {                         /* one sonar blip; the hall makes it read submarine */
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 1180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);    /* 90ms, fast decay */
    o.connect(g); g.connect(bus);
    const w = ctx.createGain(); w.gain.value = 0.85; g.connect(w).connect(verb);
    o.start(when); o.stop(when + 0.14);
    o.onended = () => g.disconnect();
  }
  function artifactAnswer(when) {                    /* the reply is slightly wrong: 196 sagging to 185 */
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(196, when);
    o.frequency.linearRampToValueAtTime(185, when + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(0.07, when + 0.25);
    g.gain.setTargetAtTime(0.0001, when + 1.2, 0.5);
    o.connect(g); g.connect(bus);
    const w = ctx.createGain(); w.gain.value = 0.8; g.connect(w).connect(verb);
    o.start(when); o.stop(when + 3.4);
    o.onended = () => g.disconnect();
  }
  function riser(when) {                               /* pre-warp reverse-swell into the arrival */
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(300, when);
    bp.frequency.exponentialRampToValueAtTime(2400, when + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.3, when + 0.28);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.36);
    n.connect(bp); bp.connect(g); g.connect(bus);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, when);
    o.frequency.exponentialRampToValueAtTime(640, when + 0.3);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, when);
    og.gain.exponentialRampToValueAtTime(0.05, when + 0.26);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.34);
    o.connect(og); og.connect(bus);
    n.start(when); n.stop(when + 0.4); o.start(when); o.stop(when + 0.4);
    n.onended = () => { g.disconnect(); og.disconnect(); };
  }
  function whoosh(when) {
    const dur = 1.0;
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    const g = ctx.createGain();
    bp.frequency.setValueAtTime(220, when);
    bp.frequency.exponentialRampToValueAtTime(2400, when + dur * 0.7);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.45, when + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    n.connect(bp); bp.connect(g); g.connect(bus);      /* the hall gives it a tail now */
    n.start(when); n.stop(when + dur);
    n.onended = () => g.disconnect();
  }
  function fanfare(when) {                             /* original 7-note brass-ish call, big reverb */
    const F = [[0, 0, .16], [5, .16, .16], [7, .32, .34], [12, .7, .16], [14, .86, .16], [12, 1.02, .22], [19, 1.28, .9]];
    for (const [s, at, dur] of F) {
      const f = 196 * Math.pow(2, s / 12);
      note(f, when + at, 0.11, dur + 0.15, 'sawtooth', bus, 0, 0.5);
      note(f / 2, when + at, 0.05, dur + 0.15, 'sawtooth', bus, 0, 0.5);
    }
  }

  /* ---------- the scheduler: lookahead with a catch-up snap ---------- */
  function armSched() {
    clearInterval(schedTimer);
    nextNote = ctx.currentTime + 0.1;
    stepIdx = 0;
    nextCallAt = ctx.currentTime + 15;
    nextGroanAt = ctx.currentTime + 12 + Math.random() * 10;
    schedTimer = setInterval(() => {
      if (!on || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (rig) rig.breathe(now);
      if (nextNote < now - 0.25) nextNote = now + 0.05;   /* snap forward */
      while (nextNote < now + 0.3) {
        const v = cfg;
        if (nextNote >= holdUntil) {
          const span = v.motif.length + v.gap;
          const pos = stepIdx % span;
          if (pos < v.motif.length) { const st = v.motif[pos]; if (st) playLead(v, st, nextNote); }
          const pc = v.perc[stepIdx % 16];
          if (pc === 'K') taiko(nextNote, 0.4);
          else if (pc === 's') shaker(nextNote);
          else if (pc === 'H') heart(nextNote);           /* the hub's 2.4s pulse (600ms x 4) */
        }
        if (v.call && nextNote >= nextCallAt) { deepCall(nextNote); nextCallAt = nextNote + 17 + Math.random() * 7; }
        if (v.groan && nextNote >= nextGroanAt) { groan(nextNote); nextGroanAt = nextNote + 25 + Math.random() * 15; }
        stepIdx += 1;
        nextNote += v.step / 1000;
      }
    }, 100);
  }

  /* ---------- scene transitions: 2s rig crossfade + arrival breath ---------- */
  function setWorld(name) {
    const next = ARR[name] || ARR.hub;
    if (next === cfg) return;
    cfg = next;
    stepIdx = 0;
    if (!ready()) return;                              /* rig is built on the next turnOn */
    holdUntil = ctx.currentTime + 1.6;                 /* pads land first; the motif enters after the breath */
    nextCallAt = ctx.currentTime + 12;
    nextGroanAt = ctx.currentTime + 14 + Math.random() * 10;   /* the hull settles before it speaks */
    if (rig) rig.fade(ctx.currentTime);
    rig = buildRig(cfg);
  }

  const ready = () => on && ctx && ctx.state === 'running';

  /* two-note preview of a world's scale on hover, sent through the hall */
  window.Orrery.events.addEventListener('preview', (e) => {
    if (!ready()) return;
    const v = ARR[e.detail.slug] || ARR.hub;
    note(v.root * 2, ctx.currentTime + 0.02, 0.06, 0.3, 'sine', bus, 0, 0.45);
    note(v.root * Math.pow(2, v.scale[2] / 12) * 2, ctx.currentTime + 0.14, 0.05, 0.35, 'sine', bus, 0, 0.45);
  });

  /* the warp: riser swells into the whoosh, which blooms in the hall */
  window.Orrery.events.addEventListener('warp', () => {
    if (!ready()) return;
    riser(ctx.currentTime);
    whoosh(ctx.currentTime + 0.22);
  });
  window.Orrery.events.addEventListener('scene', (e) => setWorld(e.detail.name));
  window.Orrery.events.addEventListener('query', () => {
    if (!ready()) return;
    const v = ARR.aurora;
    v.scale.slice(0, 4).forEach((deg, i) =>
      note(v.root * Math.pow(2, deg / 12) * 2, ctx.currentTime + i * 0.09, 0.07, 0.32, 'triangle', bus, 0.2, 0.3));
  });
  window.Orrery.events.addEventListener('konami', () => {
    if (!ready()) return;
    if (ctx.currentTime - lastFanfare < 2.5) return;
    lastFanfare = ctx.currentTime;
    fanfare(ctx.currentTime + 0.05);
  });

  /* the sonar: the integrator owns the cadence (CustomEvent('sonar') ~7s);
     the score only answers while truly running. Blip + echo, both very wet. */
  window.Orrery.events.addEventListener('sonar', () => {
    if (!ready()) return;
    const t = ctx.currentTime + 0.02;
    ping(t, 0.07);
    ping(t + 0.24, 0.028);                           /* the echo: 240ms later, 0.4 gain */
  });

  /* the Artifact answers when touched: low, slow, slightly flat. 1 per 2s. */
  window.Orrery.events.addEventListener('artifact', () => {
    if (!ready()) return;
    if (ctx.currentTime - lastAnswer < 2) return;
    lastAnswer = ctx.currentTime;
    artifactAnswer(ctx.currentTime + 0.03);
  });

  /* the unresolved cadence resolves only at the CTA: a plagal-ish landing */
  const cta = document.querySelector('.cta-btn');
  if (cta) cta.addEventListener('click', () => {
    if (!ready()) return;
    const r = ARR.uncharted.root, t = ctx.currentTime;
    [5, 9, 12].forEach(s => note(r * Math.pow(2, s / 12), t + 0.02, 0.085, 1.8, 'triangle', bus, 0, 0.4));
    [0, 4, 7, 12].forEach(s => note(r * Math.pow(2, s / 12), t + 0.68, 0.085, 2.4, 'triangle', bus, 0, 0.4));
    if (rig && rig.pd) {                               /* the pad swells under the resolve */
      rig.pd.gain.setTargetAtTime(cfg.pd * 1.7, t, 0.4);
      rig.pd.gain.setTargetAtTime(cfg.pd, t + 1.8, 0.8);
    }
  });

  /* ---------- the toggle: state-verified, never a lying label ---------- */
  /* localStorage, deliberately: under DEFAULT-ON, an opt-out that lasts one
     tab is a hostile default — "off" must survive new tabs and return visits
     (Smaug kill: the opt-out evaporated in sessionStorage) */
  const safeStore = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  };
  async function turnOn() {
    if (!ctx) buildGraph();
    try { await ctx.resume(); } catch (_) { /* stays silent */ }
    if (ctx.state !== 'running') { setUI(armed ? 'ready' : false); return false; }
    armed = false;
    on = true;
    bus.gain.setTargetAtTime(0.75, ctx.currentTime, 0.4);
    if (!rig) { rig = buildRig(cfg); holdUntil = ctx.currentTime + 0.4; }
    armSched();
    setUI(true);
    safeStore.set('orrery-score', 'on');
    return true;
  }
  function turnOff() {
    on = false; armed = false;
    if (ctx) {
      bus.gain.setTargetAtTime(0.0, ctx.currentTime, 0.2);
      if (rig) { rig.fade(ctx.currentTime); rig = null; }   /* no oscillators burn while silent */
    }
    clearInterval(schedTimer);
    setUI(false);
    safeStore.set('orrery-score', 'off');            /* the explicit opt-out: future loads stay silent */
  }
  function setUI(state) {                            /* true | false | 'ready'; the label never lies */
    const running = state === true;
    btn.dataset.on = String(running);
    btn.setAttribute('aria-pressed', String(running));
    btn.setAttribute('aria-label', running ? 'Turn the score off' : 'Turn the score on');
    label.textContent = running ? 'Score: on' : state === 'ready' ? 'Score: ready' : 'Score: off';
  }
  btn.addEventListener('click', () => (on ? turnOff() : turnOn()));

  /* DEFAULT-ON ignition: the Commission wants the score immediately; the
     platform forbids pre-gesture audio. So unless a prior visit explicitly
     opted out ('orrery-score' === 'off'): build the graph now (cheap; the
     context boots suspended), try ONE silent resume (succeeds only where
     the browser already granted media engagement), and otherwise ignite on
     the FIRST activation-bearing gesture. Listeners stay attached until a
     turnOn truly succeeds (a consumed one-shot on a non-activating gesture
     killed the score for a whole visit: Smaug kill 9). Escape and modifier
     chords carry no activation. The toggle still rules. */
  if (safeStore.get('orrery-score') !== 'off') {
    armed = true;
    if (!ctx) buildGraph();
    /* a tab that BOOTS hidden must stay silent (the visibilitychange handler
       only reacts to changes; it never fires for a background-tab load) —
       arm instead, and the visibility handler ignites on first reveal */
    if (document.hidden) { setUI('ready'); armIgnition(); }
    else {
      /* label honesty while blocked: Chrome leaves resume() PENDING (not
         rejected) until the first gesture, so turnOn may not settle for a
         long while — say "ready" now; turnOn overwrites with the truth */
      setUI('ready');
      turnOn().then((ok) => { if (!ok) armIgnition(); })
        .catch(() => { setUI('ready'); armIgnition(); });  /* a boot throw must not eat the arm */
    }
  }
  function armIgnition() {
    const arm = async (e) => {
      if (e.type === 'keydown' && (e.key === 'Escape' || e.altKey || e.ctrlKey || e.metaKey)) return;
      const ok = await turnOn();
      if (ok) cleanup();                             /* only disarm once it truly runs */
    };
    const cleanup = () => {
      removeEventListener('pointerup', arm);
      removeEventListener('click', arm);
      removeEventListener('keydown', arm);
    };
    addEventListener('pointerup', arm);
    addEventListener('click', arm);
    addEventListener('keydown', arm);
  }

  /* a hidden tab is a silent tab; a revealed tab may complete the default-on
     intent (resume() here succeeds only where the browser already grants it) */
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { if (ctx.state === 'running') ctx.suspend(); }
    else if (on) { ctx.resume(); }
    else if (armed) { turnOn(); }
  });

  return { get on() { return on; } };
})();

/* ---------- ignition: every fragment is defined; light the orrery.
   If ANY boot throw slips through, fall back to the designed brochure
   rather than a blank app shell (Smaug kill 6 / gimli G3) ---------- */
try { bootOrrery(); }
catch (e) { document.documentElement.classList.remove('js'); }
