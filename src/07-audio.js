/* ============================================================
   07-audio.js — the score. Zero files, one synth graph, five voicings.
   THE LAW (§2.6): never autoplay; start only on an activation-bearing
   event; the UI claims "on" only after ctx.state === 'running'.
   ============================================================ */
'use strict';

const Score = (() => {
  /* one motif, re-voiced per world: {root Hz, scale intervals, step ms, brightness Hz} */
  const VOICES = {
    hub:            { root: 220.0, scale: [0, 3, 5, 7, 10],     step: 500, bright: 900,  padGain: 0.05 },
    'sonora':       { root: 146.8, scale: [0, 2, 4, 7, 9],      step: 640, bright: 700,  padGain: 0.055 },
    'neon-mesa':    { root: 185.0, scale: [0, 3, 5, 7, 10, 12], step: 250, bright: 1600, padGain: 0.05 },
    'undercurrent': { root: 130.8, scale: [0, 2, 6, 8, 10],     step: 800, bright: 500,  padGain: 0.065 },
    'lattice':      { root: 164.8, scale: [0, 4, 6, 7, 11],     step: 420, bright: 2100, padGain: 0.045 },
    'undesignated': { root: 220.0, scale: [0, 3, 5, 8],         step: 900, bright: 1100, padGain: 0.04 },
  };

  let ctx = null, master = null, padA = null, padB = null, padFilter = null, padGainNode = null;
  let arpTimer = null, nextNote = 0, stepIdx = 0;
  let on = false, voice = VOICES.hub;

  const btn = document.getElementById('audio-toggle');
  const label = btn.querySelector('.audio-label');

  function buildGraph() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    /* the pad: two detuned oscillators through a slow-breathing lowpass */
    padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 800; padFilter.Q.value = 0.7;
    padGainNode = ctx.createGain(); padGainNode.gain.value = 0.0;
    padA = ctx.createOscillator(); padA.type = 'sawtooth';
    padB = ctx.createOscillator(); padB.type = 'triangle'; padB.detune.value = 7;
    padA.connect(padFilter); padB.connect(padFilter);
    padFilter.connect(padGainNode).connect(master);
    padA.start(); padB.start();

    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(padFilter.frequency); lfo.start();
  }

  function tunePad(v, when = 0) {
    const t = ctx.currentTime + when;
    padA.frequency.setTargetAtTime(v.root, t, 0.8);
    padB.frequency.setTargetAtTime(v.root * 1.5, t, 0.8);
    padFilter.frequency.setTargetAtTime(v.bright, t, 1.2);
    padGainNode.gain.setTargetAtTime(v.padGain, t, 1.0);
  }

  function pluck(freq, when, gain = 0.14, dur = 0.55) {
    const o = ctx.createOscillator(); o.type = 'sine';
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.detune.value = 5;
    const g = ctx.createGain();
    o.frequency.value = freq; o2.frequency.value = freq;
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); o2.connect(g); g.connect(master);
    o.start(when); o2.start(when); o.stop(when + dur + 0.1); o2.stop(when + dur + 0.1);
  }

  /* the arp: lookahead scheduler with a catch-up snap (never a burst after a hidden tab) */
  function armArp() {
    clearInterval(arpTimer);
    nextNote = ctx.currentTime + 0.1;
    arpTimer = setInterval(() => {
      if (!on || ctx.state !== 'running') return;
      if (nextNote < ctx.currentTime - 0.25) nextNote = ctx.currentTime + 0.05;  /* snap forward */
      while (nextNote < ctx.currentTime + 0.3) {
        const v = voice;
        if (Math.random() < 0.62) {                    /* sparse: silence is part of the score */
          const deg = v.scale[stepIdx % v.scale.length];
          const oct = Math.random() < 0.3 ? 2 : 1;
          pluck(v.root * Math.pow(2, deg / 12) * oct, nextNote, 0.1 + Math.random() * 0.05);
        }
        stepIdx += (Math.random() < 0.8 ? 1 : 2);
        nextNote += v.step / 1000;
      }
    }, 100);
  }

  function whoosh() {
    if (!ready()) return;
    const dur = 1.0;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    bp.frequency.setValueAtTime(220, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(master);
    src.start(t); src.stop(t + dur);
  }

  const ready = () => on && ctx && ctx.state === 'running';

  /* two-note preview of a world's motif on hover (only when already on) */
  window.Orrery.events.addEventListener('preview', (e) => {
    if (!ready()) return;
    const v = VOICES[e.detail.slug] || VOICES.hub;
    pluck(v.root * 2, ctx.currentTime + 0.02, 0.07, 0.3);
    pluck(v.root * Math.pow(2, v.scale[2] / 12) * 2, ctx.currentTime + 0.14, 0.06, 0.35);
  });

  /* the warp gets its wind; the new world retunes over the crossing */
  window.Orrery.events.addEventListener('warp', () => { if (ready()) whoosh(); });
  window.Orrery.events.addEventListener('scene', (e) => {
    voice = VOICES[e.detail.name] || VOICES.hub;
    if (ready()) tunePad(voice, 0.15);
  });
  window.Orrery.events.addEventListener('query', () => {
    if (!ready()) return;
    const v = VOICES.lattice;
    v.scale.slice(0, 4).forEach((deg, i) => pluck(v.root * Math.pow(2, deg / 12) * 2, ctx.currentTime + i * 0.09, 0.08, 0.3));
  });

  /* the unresolved cadence resolves only at the CTA (galadriel's beat) */
  const cta = document.querySelector('.cta-btn');
  if (cta) cta.addEventListener('click', () => {
    if (!ready()) return;
    const r = VOICES.undesignated.root;
    [0, 4, 7, 12].forEach((deg, i) => pluck(r * Math.pow(2, deg / 12), ctx.currentTime + i * 0.06, 0.12, 1.4));
  });

  /* ---------- the toggle: state-verified, never a lying label ---------- */
  async function turnOn() {
    if (!ctx) buildGraph();
    try { await ctx.resume(); } catch (_) { /* stays off */ }
    if (ctx.state !== 'running') { setUI(false); return; }
    on = true;
    master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.4);
    tunePad(voice, 0);
    armArp();
    setUI(true);
    sessionStorage.setItem('orrery-score', 'on');
  }
  function turnOff() {
    on = false;
    if (ctx) master.gain.setTargetAtTime(0.0, ctx.currentTime, 0.2);
    clearInterval(arpTimer);
    setUI(false);
    sessionStorage.setItem('orrery-score', 'off');
  }
  function setUI(state) {
    btn.dataset.on = String(state);
    btn.setAttribute('aria-pressed', String(state));
    btn.setAttribute('aria-label', state ? 'Turn the score off' : 'Turn the score on');
    label.textContent = state ? 'Score: on' : 'Score: off';
  }
  btn.addEventListener('click', () => (on ? turnOff() : turnOn()));

  /* returning visitor who had it on: ARM the intent; START on the next
     activation-bearing gesture (never on load, never on scroll) */
  if (sessionStorage.getItem('orrery-score') === 'on') {
    const arm = () => { turnOn(); cleanup(); };
    const cleanup = () => {
      removeEventListener('pointerdown', arm);
      removeEventListener('keydown', arm);
    };
    addEventListener('pointerdown', arm, { once: true });
    addEventListener('keydown', arm, { once: true });
  }

  /* a hidden tab is a silent tab */
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { if (ctx.state === 'running') ctx.suspend(); }
    else if (on) { ctx.resume(); }
  });

  return { get on() { return on; } };
})();

/* ---------- ignition: every fragment is defined; light the orrery ---------- */
bootOrrery();
