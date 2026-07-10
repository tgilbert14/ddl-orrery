/* ============================================================
   07-audio.js - Score v3: the dread engine. Zero files.
   One synth graph, a generated concert hall, eleven arrangements
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
  /* ---------- the eleven arrangements + the hub (all original) ----------
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
  /* the beacon horns schedule ~5s ahead — track their gains so a scene
     change or a re-strike can mute the run mid-flight (declared here, with
     the rest of the state, so no listener races its initialization) */
  let hornGains = [];
  function muteHorns() {
    if (!hornGains.length) return;
    const t = ctx.currentTime;
    hornGains.forEach(g => { try { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.05); } catch (_) {} });
    hornGains = [];
  }

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
    return g;                        /* callers that schedule far ahead can mute a run mid-flight */
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
  /* the reply is slightly WRONG: 196 sagging to 185, all visit long — until
     the survey completes, when the wrong note finally comes true and RISES
     185→196, fuller and longer. The whole arc lands on this one interval.
     Restored from localStorage: a master surveyor's return visit must not
     regress to the wrong tone (the rite fires once, ever). */
  let artifactTrue = false;
  try { artifactTrue = localStorage.getItem('orrery-survey-complete') === '1'; } catch (_) {}
  function artifactAnswer(when) {
    const o = ctx.createOscillator(); o.type = 'sine';
    const dur = artifactTrue ? 2.2 : 1.2;
    if (artifactTrue) { o.frequency.setValueAtTime(185, when); o.frequency.linearRampToValueAtTime(196, when + dur); }
    else { o.frequency.setValueAtTime(196, when); o.frequency.linearRampToValueAtTime(185, when + dur); }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(artifactTrue ? 0.09 : 0.07, when + 0.25);
    g.gain.setTargetAtTime(0.0001, when + dur, artifactTrue ? 0.7 : 0.5);
    o.connect(g); g.connect(bus);
    const w = ctx.createGain(); w.gain.value = 0.8; g.connect(w).connect(verb);
    o.start(when); o.stop(when + dur + 2.2);
    o.onended = () => g.disconnect();
    if (artifactTrue) {                             /* a bloomed fifth crowns the resolved tone */
      note(294, when + 0.12, 0.05, dur, 'sine', bus, 0, 0.7);
    }
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
  /* the beat conductor (WOW #8): every scheduled pulse announces its exact
     landing time to the pictures — per-beat dispatch, never per-frame */
  function cue(kind, at) {
    try {
      window.Orrery.events.dispatchEvent(new CustomEvent('step',
        { detail: { kind, perfAt: performance.now() + (at - ctx.currentTime) * 1000 } }));
    } catch (_) {}
  }
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
          if (pc === 'K') { taiko(nextNote, 0.4); cue('K', nextNote); }
          else if (pc === 's') shaker(nextNote);
          else if (pc === 'H') { heart(nextNote); cue('H', nextNote); }   /* the hub's 2.4s pulse */
        }
        if (v.call && nextNote >= nextCallAt) { deepCall(nextNote); nextCallAt = nextNote + 17 + Math.random() * 7; }
        if (v.groan && nextNote >= nextGroanAt) { groan(nextNote); cue('G', nextNote); nextGroanAt = nextNote + 25 + Math.random() * 15; }
        stepIdx += 1;
        nextNote += v.step / 1000;
      }
    }, 100);
  }

  /* ---------- scene transitions: 2s rig crossfade + arrival breath ---------- */
  function setWorld(name) {
    const next = ARR[name] || ARR.hub;
    if (next === cfg) return;
    muteHorns();                      /* the horns must not follow the traveler off-world */
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

  /* hover preview in the world's OWN voice (wave / delay / hall — the ARR
     table's character, not a shared doorbell), quantized to the running
     score's half-step grid so sweeping the ring plays in time with it */
  let lastPreview = -9, lastPreviewAt = -9;
  window.Orrery.events.addEventListener('preview', (e) => {
    if (!ready()) return;
    /* a fast sweep across the ring must not stack eleven riffs on one grid
       line (same-sample chord blast); one voice per 150ms reads as intended */
    if (ctx.currentTime - lastPreview < 0.15) return;
    lastPreview = ctx.currentTime;
    const v = ARR[e.detail.slug] || ARR.hub;
    const L = v.lead, dest = L.dry ? dry : bus;
    const now = ctx.currentTime;
    const sub = Math.max(0.12, cfg.step / 2000);       /* the active grid's half-step */
    let at = nextNote;
    while (at - sub > now + 0.02) at -= sub;           /* nearest upcoming grid line */
    if (at < now + 0.02) at = now + 0.02;
    if (at <= lastPreviewAt + 0.001) at = lastPreviewAt + sub;   /* two riffs never share one line */
    lastPreviewAt = at;
    const m0 = v.motif.find(Boolean) || { d: 0 };      /* the motif's opening degree */
    const gapN = Math.min(0.16, v.step / 2000);        /* the riff paces to its world's own step */
    note(v.root * 2, at, 0.06, 0.3, L.wave, dest, L.dly, L.wet);
    note(v.root * Math.pow(2, v.scale[2] / 12) * 2, at + gapN, 0.05, 0.35, L.wave, dest, L.dly, L.wet);
    note(v.root * Math.pow(2, v.scale[m0.d % v.scale.length] / 12) * 2, at + gapN * 2, 0.045, 0.4, L.wave, dest, L.dly, L.wet);
  });

  /* the sortie: the shuttle undocks — a soft latch-click and a rising hiss
     ~760ms before the warp's riser takes over */
  let lastSortie = -9;
  window.Orrery.events.addEventListener('sortie', () => {
    if (!ready()) return;
    if (ctx.currentTime - lastSortie < 0.6) return;
    lastSortie = ctx.currentTime;
    const t = ctx.currentTime + 0.02;
    note(880, t, 0.03, 0.04, 'square', dry, 0, 0);       /* the latch */
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.6);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.05, t + 0.3);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    n.connect(bp); bp.connect(gn); gn.connect(bus);
    n.start(t); n.stop(t + 0.75);
    n.onended = () => gn.disconnect();
  });

  /* the ride home (WOW board #6): a falling gliss as she brakes — from the
     world you left, back down toward the hold's low root — under a reversed
     hiss; then the dock answers with the clunk of the clamps taking her */
  let lastRecall = -9;
  window.Orrery.events.addEventListener('recall', () => {
    if (!ready()) return;
    if (ctx.currentTime - lastRecall < 0.8) return;
    lastRecall = ctx.currentTime;
    const t = ctx.currentTime + 0.02;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(Math.max(180, cfg.root) * 2, t);
    o.frequency.exponentialRampToValueAtTime(110, t + 0.88);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.035, t + 0.15);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.92);
    o.connect(og); og.connect(wet);
    o.start(t); o.stop(t + 0.95);
    o.onended = () => og.disconnect();
    const n = noiseSrc();                              /* the reversed hiss: high -> low */
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(420, t + 0.8);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.04, t + 0.2);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    n.connect(bp); bp.connect(gn); gn.connect(bus);
    n.start(t); n.stop(t + 0.9);
    n.onended = () => gn.disconnect();
  });
  let lastDock = -9;
  window.Orrery.events.addEventListener('docked', () => {
    if (!ready()) return;
    if (ctx.currentTime - lastDock < 0.8) return;
    lastDock = ctx.currentTime;
    const t = ctx.currentTime + 0.02;
    taiko(t, 0.28);                                    /* the clamps take her */
    note(880, t + 0.05, 0.028, 0.04, 'square', dry, 0, 0);   /* the latch, answered */
    note(660, t + 0.13, 0.02, 0.05, 'square', dry, 0, 0);
  });

  /* SOUND THE DERELICT (WOW board #1): each world the strum ring crosses
     sounds its riff in its own voice — full-throated if surveyed, muffled
     if not. The hole in the chord is the collection shelf, audible. */
  let lastStrumAt = -9;
  window.Orrery.events.addEventListener('strum', (e) => {
    if (!ready()) return;
    const v = ARR[e.detail.slug]; if (!v) return;
    const L = v.lead, dest = L.dry ? dry : bus;
    const vol = e.detail.surveyed ? 1 : 0.32;
    const at = Math.max(ctx.currentTime + 0.02, lastStrumAt + 0.07);
    lastStrumAt = at;
    const gapN = Math.min(0.14, v.step / 2200);
    note(v.root * 2, at, 0.06 * vol, 0.32, L.wave, dest, L.dly, L.wet);
    note(v.root * Math.pow(2, v.scale[2] / 12) * 2, at + gapN, 0.05 * vol, 0.36, L.wave, dest, L.dly, L.wet);
    if (e.detail.surveyed)                             /* only a surveyed world finishes its phrase */
      note(v.root * Math.pow(2, v.scale[v.scale.length - 1] / 12) * 2, at + gapN * 2, 0.045, 0.4, L.wave, dest, L.dly, L.wet);
  });

  /* the warp: riser swells into the whoosh, which blooms in the hall —
     and the destination's tonic triad sounds in its OWN lead voice at the
     peak: every arrival becomes the world's first word (WOW board #4) */
  window.Orrery.events.addEventListener('warp', (e) => {
    if (!ready()) return;
    riser(ctx.currentTime);
    whoosh(ctx.currentTime + 0.22);
    const v = e.detail && ARR[e.detail.slug];
    if (v) {
      const t = ctx.currentTime + 0.55, L = v.lead, dest = L.dry ? dry : bus;
      note(v.root, t, 0.05, 1.4, L.wave, dest, L.dly, L.wet);
      note(v.root * Math.pow(2, v.scale[2] / 12), t + 0.06, 0.04, 1.3, L.wave, dest, L.dly, L.wet);
      note(v.root * Math.pow(2, v.padIv[2] / 12), t + 0.12, 0.04, 1.5, L.wave, dest, L.dly, L.wet);
    }
  });
  window.Orrery.events.addEventListener('scene', (e) => setWorld(e.detail.name));
  window.Orrery.events.addEventListener('query', () => {
    if (!ready()) return;
    const v = ARR.aurora;
    v.scale.slice(0, 4).forEach((deg, i) =>
      note(v.root * Math.pow(2, deg / 12) * 2, ctx.currentTime + i * 0.09, 0.07, 0.32, 'triangle', bus, 0.2, 0.3));
  });
  /* the other four toys: their events were dispatched into a void (M1).
     Each answers in its world's own voice, gated PER TOY like the artifact's
     reply (a shared timestamp would let one world's toy mute another's
     across an rm-instant world hop). */
  const toyLast = { consult: -9, drill: -9, storm: -9 };
  let lastBeacon = -99;   /* clears the 9.2s beacon gate even at ctx birth */
  const toyGate = (k) => {
    if (!ready()) return false;
    if (ctx.currentTime - toyLast[k] < 1) return false;
    toyLast[k] = ctx.currentTime;
    return true;
  };
  window.Orrery.events.addEventListener('consult', () => {  /* the dice-cascade: futures reshuffling */
    if (!toyGate('consult')) return;
    const v = ARR.archive, t = ctx.currentTime + 0.03;
    [6, 4, 2, 1, 0].forEach((d, i) =>
      note(v.root * Math.pow(2, v.scale[d] / 12) * 2 * (i === 2 ? 1.012 : 1),  /* one lands wrong */
           t + i * 0.07, 0.055, 0.5, 'triangle', bus, 0.5, 0.3));
  });
  window.Orrery.events.addEventListener('drill', () => {    /* boatswain call; the squads answer */
    if (!toyGate('drill')) return;
    const v = ARR.drillyard, t = ctx.currentTime + 0.03;
    note(v.root * 2, t, 0.07, 0.16, 'triangle', bus, 0.3, 0.22);
    note(v.root * 2 * Math.pow(2, 5 / 12), t + 0.15, 0.07, 0.3, 'triangle', bus, 0.3, 0.22);
    [7, 12, 7].forEach((s, i) =>
      note(v.root * Math.pow(2, s / 12), t + 0.45 + i * 0.09, 0.045, 0.2, 'triangle', bus, 0.3, 0.22));
    taiko(t + 0.45, 0.3);
  });
  window.Orrery.events.addEventListener('storm', () => {    /* the front called in early */
    if (!toyGate('storm')) return;
    const t = ctx.currentTime + 0.03;
    groan(t);                                               /* reads as far thunder in this voicing */
    const n = noiseSrc();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(2200, t);
    bp.frequency.exponentialRampToValueAtTime(240, t + 0.5); /* the gust sweeps DOWN into the wall */
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    n.connect(bp); bp.connect(g); g.connect(bus);
    n.start(t); n.stop(t + 0.6);
    n.onended = () => g.disconnect();
    taiko(t + 0.5, 0.5);
  });
  /* M4 — the five verbs. Each answers in its world's own ARR voice, gated
     per key so one world's hammering can never mute another's reply. */
  const verbLast = { worm: -9, boost: -9, trace: -9, ping: -9, shot: -9, invader: -9 };
  const verbGate = (k, gap) => {
    if (!ready()) return false;
    if (ctx.currentTime - verbLast[k] < gap) return false;
    verbLast[k] = ctx.currentTime;
    return true;
  };
  window.Orrery.events.addEventListener('worm', () => {     /* the colossus: thumps, a sub swell, the hull-groan
                                                               reads as its world-filling call in this voicing */
    if (!verbGate('worm', 2.5)) return;
    const v = ARR['dust-sea'], t = ctx.currentTime + 0.03;
    taiko(t, 0.5);
    note(v.root / 2, t + 0.1, 0.09, 4.2, 'sine', bus, 0.1, 0.3);
    groan(t + 0.3);
    taiko(t + 0.42, 0.3);
    shaker(t + 0.55);
    taiko(t + 1.1, 0.22);
  });
  window.Orrery.events.addEventListener('boost', () => {    /* throttle open: a fifth snapped up the octave */
    if (!verbGate('boost', 0.35)) return;
    const v = ARR.velocity, t = ctx.currentTime + 0.02;
    note(v.root * 2, t, 0.07, 0.10, 'square', bus, 0.2, 0);
    note(v.root * 2 * Math.pow(2, 7 / 12), t + 0.07, 0.07, 0.12, 'square', bus, 0.2, 0);
    note(v.root * 4, t + 0.14, 0.08, 0.3, 'square', bus, 0.22, 0.08);
  });
  window.Orrery.events.addEventListener('trace', () => {    /* one white column: a pluck up the add9 */
    if (!verbGate('trace', 0.15)) return;
    const v = ARR.grid, t = ctx.currentTime + 0.02;
    note(v.root * 4, t, 0.06, 0.5, 'triangle', bus, 0.55, 0.12);
    note(v.root * 4 * Math.pow(2, v.scale[2] / 12), t + 0.09, 0.05, 0.6, 'triangle', bus, 0.55, 0.15);
  });
  window.Orrery.events.addEventListener('ping', () => {     /* your sonar: blip + echo; sometimes the deep replies */
    if (!verbGate('ping', 0.4)) return;
    const t = ctx.currentTime + 0.02;
    ping(t, 0.06);
    ping(t + 0.24, 0.024);
    if (Math.random() < 0.3) deepCall(t + 1.4);
  });
  window.Orrery.events.addEventListener('shot', () => {     /* dry cabinet pew, straight from the speaker cone */
    if (!verbGate('shot', 0.2)) return;
    const v = ARR.arcadia, t = ctx.currentTime + 0.01;
    note(v.root * 4, t, 0.05, 0.06, 'square', dry, 0, 0);
    note(v.root * 3, t + 0.05, 0.045, 0.05, 'square', dry, 0, 0);
  });
  window.Orrery.events.addEventListener('invader', () => {  /* the hit: a falling 8-bit crunch */
    if (!verbGate('invader', 0.2)) return;
    const v = ARR.arcadia, t = ctx.currentTime + 0.02;
    note(v.root * 2 * Math.pow(2, 7 / 12), t, 0.06, 0.08, 'square', dry, 0, 0);
    note(v.root * 2 * Math.pow(2, 4 / 12), t + 0.05, 0.06, 0.08, 'square', dry, 0, 0);
    note(v.root * 2, t + 0.10, 0.06, 0.10, 'square', dry, 0, 0);
  });
  window.Orrery.events.addEventListener('beacon', (e) => {  /* horns at the pyres' own cadence —
                                                               the EVENT carries the chain's tempo,
                                                               so sound and fire can never disagree */
    if (!ready()) return;
    const n = (e.detail && e.detail.n) || 7;
    const stg = ((e.detail && e.detail.stagger) || 900) / 1000;
    if (ctx.currentTime - lastBeacon < (n - 1) * stg + 3.8) return;  /* the full chain, the Eye's swell included */
    lastBeacon = ctx.currentTime;
    muteHorns();                                            /* a re-strike silences any leftover run */
    const v = ARR.beacons, t = ctx.currentTime + 0.05;
    for (let i = 0; i < n; i++) {                           /* each horn wetter than the last */
      const d = v.scale[i % v.scale.length] + 12 * Math.floor(i / v.scale.length);
      hornGains.push(note(v.root * Math.pow(2, d / 12), t + i * stg, 0.06, 0.9, 'sawtooth', bus, 0.28, 0.25 + i * 0.06));
    }
    /* the answer from beyond the range is no horn at all: a low furnace
       swell with a minor-second rub, landing on the beat the Eye opens */
    const tAns = t + (n - 1) * stg + 1.3;
    hornGains.push(note(v.root / 2, tAns, 0.06, 2.4, 'sawtooth', bus, 0.15, 0.7));
    hornGains.push(note((v.root / 2) * Math.pow(2, 1 / 12), tAns + 0.05, 0.035, 2.2, 'sawtooth', bus, 0.15, 0.75));
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

  /* the survey is complete: IGNITION (WOW board #2). The whole journey,
     recapitulated — the eleven world-roots sound in YOUR survey order, each
     in its own instrument, converging on the wrong note finally coming true;
     then the fanfare, and a held major landing as the engines catch. */
  window.Orrery.events.addEventListener('mastery', (e) => {
    artifactTrue = true;
    if (!ready()) return;
    lastAnswer = ctx.currentTime;
    const order = (e.detail && e.detail.order) || [];
    const t0 = ctx.currentTime + 0.1;
    let i = 0;
    for (const slug of order) {
      const v = ARR[slug]; if (!v) continue;
      const L = v.lead, dest = L.dry ? dry : bus;
      note(v.root * 2, t0 + i * 0.32, 0.055, 0.5, L.wave, dest, L.dly, L.wet);
      i++;
    }
    const tAns = t0 + Math.max(0.6, i * 0.32) + 0.15;  /* the ladder lands on the true answer */
    artifactAnswer(tAns);
    fanfare(tAns + 0.6);
    /* the picardy landing: the hub's first major chord, held as the engines
       breathe (the visual flare peaks ~6s in — this chord is its downbeat) */
    [220, 277.2, 329.6].forEach((f, k) =>
      note(f, tAns + 2.1 + k * 0.05, 0.06, 3.2, 'sine', bus, 0, 0.55));
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
  /* sessionStorage, by the founder's order: every fresh visit is DEFAULT-ON
     again — the score ignites on the first activation-bearing gesture, and
     an opt-out holds for the tab you turned it off in, no longer */
  const safeStore = {
    get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (_) {} },
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
         long while — say "ready" now; turnOn overwrites with the truth.
         ARM THE LISTENERS NOW, not after turnOn settles: a pending boot
         resume never settles, and Chrome's queued unlock does not fire for
         every gesture type (Space and wheel have both failed it). A live
         listener calling resume() INSIDE the real gesture always works. */
      setUI('ready');
      armIgnition();
      turnOn().catch(() => { setUI(armed ? 'ready' : false); });
    }
  }
  function armIgnition() {
    if (armIgnition.live) return;                    /* one set of listeners, ever */
    armIgnition.live = true;
    const arm = async (e) => {
      if (on) { cleanup(); return; }                 /* the boot resume already won */
      if (e.type === 'keydown' && (e.key === 'Escape' || e.altKey || e.ctrlKey || e.metaKey)) return;
      const ok = await turnOn();
      if (ok) cleanup();                             /* only disarm once it truly runs */
    };
    const cleanup = () => {
      armIgnition.live = false;
      removeEventListener('pointerdown', arm);
      removeEventListener('pointerup', arm);
      removeEventListener('click', arm);
      removeEventListener('keydown', arm);
      removeEventListener('wheel', arm);
      removeEventListener('touchend', arm);
    };
    /* pointerdown/keydown carry activation the moment they land; wheel is
       best-effort — a scroll completes the default-on intent once ANY prior
       gesture granted activation (common right after skipping the approach) */
    addEventListener('pointerdown', arm);
    addEventListener('pointerup', arm);
    addEventListener('click', arm);
    addEventListener('keydown', arm);
    addEventListener('wheel', arm, { passive: true });
    addEventListener('touchend', arm);
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
