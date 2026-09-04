/* The Hollow House — horror audio engine.
   Everything is synthesized live with the Web Audio API. No audio files. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let ambientStarted = false;
let hbTimer: number | null = null;
let hbInterval = 0;

function ensure(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1.5; // loud — the house is not subtle
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 5;
    comp.attack.value = 0.002;
    comp.release.value = 0.18;
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/* Generating white noise on demand churns hundreds of kilobytes of garbage a
   second — nearly every footstep, whisper and slam asks for a fresh buffer.
   Keep a small rotating pool per length instead: enough variants that repeats
   never audibly loop. */
const NOISE_VARIANTS = 4;
const noisePool = new Map<number, AudioBuffer[]>();
function noiseBuffer(c: AudioContext, seconds = 2): AudioBuffer {
  const key = Math.round(seconds * 1000);
  let pool = noisePool.get(key);
  if (!pool) {
    pool = [];
    noisePool.set(key, pool);
  }
  if (pool.length < NOISE_VARIANTS) {
    const fresh = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
    const fd = fresh.getChannelData(0);
    for (let i = 0; i < fd.length; i++) fd[i] = Math.random() * 2 - 1;
    pool.push(fresh);
    return fresh;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/* A one-shot sound leaves its gain and panner nodes wired to the master bus,
   and the browser only reclaims a node once it is disconnected. Unhook them
   after the tail has rung out so a long session does not pile up dead nodes. */
function dropLater(node: AudioNode, seconds: number) {
  window.setTimeout(() => {
    try {
      node.disconnect();
    } catch {
      /* already released */
    }
  }, seconds * 1000 + 200);
}

function env(g: GainNode, t: number, attack: number, peak: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export function initAudio() { ensure(); }

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 1.5, ctx.currentTime, 0.04);
}

/** Endless haunted-house bed: detuned low drone + breathing wind noise. */
export function startAmbient() {
  const c = ensure();
  if (ambientStarted) return;
  ambientStarted = true;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.setTargetAtTime(0.1, c.currentTime, 2.5);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 150;
  const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 46;
  const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 46.6;
  o1.connect(g); o2.connect(f); f.connect(g); g.connect(master!);
  const lfo = c.createOscillator(); lfo.frequency.value = 0.06;
  const lg = c.createGain(); lg.gain.value = 55;
  lfo.connect(lg); lg.connect(f.frequency);
  o1.start(); o2.start(); lfo.start();

  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 3); n.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 0.5;
  const ng = c.createGain(); ng.gain.value = 0.014;
  n.connect(bp); bp.connect(ng); ng.connect(master!); n.start();
  const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.045;
  const lg2 = c.createGain(); lg2.gain.value = 0.009;
  lfo2.connect(lg2); lg2.connect(ng.gain); lfo2.start();
}

/** A one-shot stereo panner. Returns null when the browser has no
    StereoPannerNode — callers then route straight to the master bus and must
    not disconnect it. */
function panner(c: AudioContext, pan: number): StereoPannerNode | null {
  if (typeof c.createStereoPanner !== 'function') return null;
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  p.connect(master!);
  return p;
}

/** Breathy formant-swept whisper, optionally panned to a direction. */
export function whisper(pan = 0) {
  const c = ensure();
  const t = c.currentTime;
  const p = panner(c, pan);
  const out: AudioNode = p ?? master!;
  for (let i = 0; i < 3; i++) {
    const s = c.createBufferSource(); s.buffer = noiseBuffer(c, 1);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9;
    const t0 = t + i * 0.28 + Math.random() * 0.08;
    bp.frequency.setValueAtTime(800 + Math.random() * 400, t0);
    bp.frequency.exponentialRampToValueAtTime(2400 + Math.random() * 800, t0 + 0.22);
    const g = c.createGain(); env(g, t0, 0.05, 0.22, 0.22);
    s.connect(bp); bp.connect(g); g.connect(out);
    s.start(t0); s.stop(t0 + 0.55);
  }
  if (p) dropLater(p, 1.4);
}

/** EMF reader blip. */
export function beep(freq = 880) {
  const c = ensure();
  const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq;
  const g = c.createGain(); env(g, t, 0.006, 0.045, 0.07);
  o.connect(g); g.connect(master!);
  o.start(t); o.stop(t + 0.12);
}

/** Soft UI tick — an interactable thing has come into view. */
export function tick() {
  const c = ensure();
  const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 1240;
  const g = c.createGain(); env(g, t, 0.004, 0.022, 0.05);
  o.connect(g); g.connect(master!);
  o.start(t); o.stop(t + 0.09);
}

/** The flashlight's mechanical click. */
export function torchClick() {
  const c = ensure();
  const t = c.currentTime;
  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.05);
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
  const g = c.createGain(); env(g, t, 0.002, 0.12, 0.04);
  n.connect(hp); hp.connect(g); g.connect(master!);
  n.start(t); n.stop(t + 0.06);
  const o = c.createOscillator(); o.type = 'square';
  o.frequency.setValueAtTime(190, t + 0.02);
  const og = c.createGain(); env(og, t + 0.02, 0.004, 0.05, 0.05);
  o.connect(og); og.connect(master!);
  o.start(t + 0.02); o.stop(t + 0.12);
}

/** Her barefoot step, panned to wherever she actually is. */
export function ghostStep(pan = 0) {
  const c = ensure();
  const t = c.currentTime;
  const p = panner(c, pan);
  const out: AudioNode = p ?? master!;
  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.25);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  const g = c.createGain(); env(g, t, 0.012, 0.2, 0.16);
  n.connect(lp); lp.connect(g); g.connect(out);
  n.start(t); n.stop(t + 0.25);
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(52, t);
  o.frequency.exponentialRampToValueAtTime(34, t + 0.12);
  const og = c.createGain(); env(og, t, 0.01, 0.14, 0.12);
  o.connect(og); og.connect(out);
  o.start(t); o.stop(t + 0.2);
  if (p) dropLater(p, 0.3);
}

/** Slow door hinge creak. */
export function creak() {
  const c = ensure();
  const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(170, t);
  o.frequency.exponentialRampToValueAtTime(88, t + 0.7);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 620;
  const g = c.createGain(); env(g, t, 0.1, 0.055, 0.62);
  o.connect(f); f.connect(g); g.connect(master!);
  o.start(t); o.stop(t + 0.95);
}

/** Heavy door slam. */
export function slam() {
  const c = ensure();
  const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(82, t);
  o.frequency.exponentialRampToValueAtTime(30, t + 0.3);
  const g = c.createGain(); env(g, t, 0.012, 0.65, 0.34);
  o.connect(g); g.connect(master!);
  o.start(t); o.stop(t + 0.5);
  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.4);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
  const ng = c.createGain(); env(ng, t, 0.012, 0.32, 0.18);
  n.connect(lp); lp.connect(ng); ng.connect(master!);
  n.start(t); n.stop(t + 0.4);
}

/** Funereal bell — used for candles and rites. */
export function bell() {
  const c = ensure();
  const t = c.currentTime;
  [523.25, 1043, 1567].forEach((fr, i) => {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.value = fr * (1 + (Math.random() - 0.5) * 0.004);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.085 / (i + 1), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(g); g.connect(master!);
    o.start(t); o.stop(t + 2.5);
  });
}

/** Metallic strike — hitting the sealed door. */
export function clang() {
  const c = ensure();
  const t = c.currentTime;
  [220, 331.5, 471].forEach((fr, i) => {
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.value = fr * (1 + (Math.random() - 0.5) * 0.02);
    const g = c.createGain(); env(g, t, 0.006, 0.11 / (i + 1), 0.34);
    o.connect(g); g.connect(master!);
    o.start(t); o.stop(t + 0.45);
  });
  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.2);
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2800;
  const ng = c.createGain(); env(ng, t, 0.005, 0.12, 0.12);
  n.connect(hp); hp.connect(ng); ng.connect(master!);
  n.start(t); n.stop(t + 0.2);
}

/** A tiny wrong music-box tune. */
export function melody() {
  const c = ensure();
  const t = c.currentTime;
  const notes = [659.25, 622.25, 493.88, 659.25, 311.13];
  notes.forEach((fr, i) => {
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.value = fr * (1 + (Math.random() - 0.5) * 0.012);
    const g = c.createGain(); env(g, t + i * 0.34, 0.012, 0.085, 0.55);
    o.connect(g); g.connect(master!);
    o.start(t + i * 0.34); o.stop(t + i * 0.34 + 0.75);
  });
}

/** Long haunted gate/door creak — slow hinges, two stages. */
export function gateCreak() {
  const c = ensure();
  const t = c.currentTime;
  [0, 0.85].forEach((off, stage) => {
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(210 - stage * 40, t + off);
    o.frequency.exponentialRampToValueAtTime(74, t + off + 0.8);
    const vib = c.createOscillator(); vib.frequency.value = 5.5 + stage * 2;
    const vg = c.createGain(); vg.gain.value = 18;
    vib.connect(vg); vg.connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = c.createGain(); env(g, t + off, 0.16, 0.09, 0.78);
    o.connect(f); f.connect(g); g.connect(master!);
    o.start(t + off); o.stop(t + off + 1.1);
    vib.start(t + off); vib.stop(t + off + 1.1);
  });
  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 1.8);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 6;
  const ng = c.createGain(); env(ng, t, 0.4, 0.05, 1.3);
  n.connect(bp); bp.connect(ng); ng.connect(master!);
  n.start(t); n.stop(t + 1.8);
}

/** Match strike — scrape, then flare. */
export function matchStrike() {
  const c = ensure();
  const t = c.currentTime;
  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.4);
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
  const g = c.createGain(); env(g, t, 0.01, 0.16, 0.13);
  n.connect(hp); hp.connect(g); g.connect(master!);
  n.start(t); n.stop(t + 0.35);
  // the flare
  const n2 = c.createBufferSource(); n2.buffer = noiseBuffer(c, 0.7);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
  const g2 = c.createGain(); env(g2, t + 0.16, 0.08, 0.14, 0.5);
  n2.connect(bp); bp.connect(g2); g2.connect(master!);
  n2.start(t + 0.16); n2.stop(t + 0.85);
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(320, t + 0.16);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.6);
  const og = c.createGain(); env(og, t + 0.16, 0.05, 0.07, 0.5);
  o.connect(og); og.connect(master!);
  o.start(t + 0.16); o.stop(t + 0.75);
}

/** Iron key — cold metallic clink. */
export function clink() {
  const c = ensure();
  const t = c.currentTime;
  [1567, 2093, 2637].forEach((fr, i) => {
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.value = fr * (1 + (Math.random() - 0.5) * 0.01);
    const g = c.createGain(); env(g, t + i * 0.05, 0.004, 0.075 / (i + 1), 0.3);
    o.connect(g); g.connect(master!);
    o.start(t + i * 0.05); o.stop(t + 0.5);
  });
}

/** Cloth pouch lifted — for the salt. */
export function cloth() {
  const c = ensure();
  const t = c.currentTime;
  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.5);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1.2;
  const g = c.createGain(); env(g, t, 0.06, 0.12, 0.3);
  n.connect(bp); bp.connect(g); g.connect(master!);
  n.start(t); n.stop(t + 0.5);
  const n2 = c.createBufferSource(); n2.buffer = noiseBuffer(c, 0.3);
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000;
  const g2 = c.createGain(); env(g2, t + 0.1, 0.05, 0.06, 0.18);
  n2.connect(hp); hp.connect(g2); g2.connect(master!);
  n2.start(t + 0.1); n2.stop(t + 0.4);
}

/** Old paper turning — journals, diaries, hymnals. */
export function paper() {
  const c = ensure();
  const t = c.currentTime;
  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.35);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 2.5;
  const g = c.createGain(); env(g, t, 0.02, 0.1, 0.2);
  n.connect(bp); bp.connect(g); g.connect(master!);
  n.start(t); n.stop(t + 0.35);
}

/** Coffin lid — heavy wooden thud with a hollow body. */
export function lidThud() {
  const c = ensure();
  const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.24);
  const g = c.createGain(); env(g, t, 0.01, 0.75, 0.3);
  o.connect(g); g.connect(master!);
  o.start(t); o.stop(t + 0.45);
  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.3);
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
  const ng = c.createGain(); env(ng, t, 0.012, 0.35, 0.2);
  n.connect(lp); lp.connect(ng); ng.connect(master!);
  n.start(t); n.stop(t + 0.3);
}

/** Salt ward — a rushing wind that pushes something back. */
export function wardWhoosh() {
  const c = ensure();
  const t = c.currentTime;
  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 1.2);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(3800, t + 0.7);
  bp.frequency.exponentialRampToValueAtTime(200, t + 1.15);
  const g = c.createGain(); env(g, t, 0.25, 0.3, 0.85);
  n.connect(bp); bp.connect(g); g.connect(master!);
  n.start(t); n.stop(t + 1.2);
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(200, t);
  o.frequency.exponentialRampToValueAtTime(52, t + 0.9);
  const og = c.createGain(); env(og, t, 0.1, 0.2, 0.8);
  o.connect(og); og.connect(master!);
  o.start(t); o.stop(t + 1.0);
}

/** Soft pickup chime for items. */
export function pickup() {
  const c = ensure();
  const t = c.currentTime;
  const o = c.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(880, t);
  o.frequency.exponentialRampToValueAtTime(440, t + 0.28);
  const g = c.createGain(); env(g, t, 0.01, 0.12, 0.3);
  o.connect(g); g.connect(master!);
  o.start(t); o.stop(t + 0.45);
}

/** Wooden floorboard footstep — alternates feet, heavier when sprinting. */
export function stepSound(leftFoot = false, sprint = false) {
  const c = ensure();
  const t = c.currentTime;
  const base = leftFoot ? 96 : 118;
  const o = c.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(base * (sprint ? 1.1 : 1), t);
  o.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.09);
  const og = c.createGain(); env(og, t, 0.008, sprint ? 0.16 : 0.1, 0.09);
  o.connect(og); og.connect(master!);
  o.start(t); o.stop(t + 0.16);
  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 0.15);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.value = leftFoot ? 500 : 640; bp.Q.value = 0.8;
  const g = c.createGain(); env(g, t, 0.008, sprint ? 0.1 : 0.06, 0.08);
  n.connect(bp); bp.connect(g); g.connect(master!);
  n.start(t); n.stop(t + 0.15);
}

/** Distant ghostly moan — detuned low voices drifting apart. */
export function moan() {
  const c = ensure();
  const t = c.currentTime;
  [110, 113.5, 164.8].forEach((fr, i) => {
    const o = c.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth';
    o.frequency.setValueAtTime(fr, t);
    o.frequency.linearRampToValueAtTime(fr * 0.82, t + 1.8);
    const vib = c.createOscillator(); vib.frequency.value = 4.5 + i;
    const vg = c.createGain(); vg.gain.value = 3.5;
    vib.connect(vg); vg.connect(o.frequency);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 480;
    const g = c.createGain(); env(g, t, 0.5, 0.05 / (i * 0.6 + 1), 1.4);
    o.connect(f); f.connect(g); g.connect(master!);
    o.start(t); o.stop(t + 2.1); vib.start(t); vib.stop(t + 2.1);
  });
}

/** Close threat — a guttural growl when she is nearly on you. */
export function growl() {
  const c = ensure();
  const t = c.currentTime;
  const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
  const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 57.8;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
  const trem = c.createOscillator(); trem.frequency.value = 11;
  const tg = c.createGain(); tg.gain.value = 0.05;
  const g = c.createGain();
  trem.connect(tg); tg.connect(g.gain);
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.13, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(master!);
  o1.start(t); o2.start(t); trem.start(t);
  o1.stop(t + 1.2); o2.stop(t + 1.2); trem.stop(t + 1.2);
}

/** Sharp dissonant sting — she just grew stronger. */
export function sting() {
  const c = ensure();
  const t = c.currentTime;
  [622, 659, 1244].forEach((fr, i) => {
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 / (i * 0.5 + 1), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(g); g.connect(master!);
    o.start(t); o.stop(t + 0.9);
  });
}

/** THE jumpscare: distorted shriek + noise blast + sub thump. Loud. */
export function scream() {
  const c = ensure();
  const t = c.currentTime;

  const dist = c.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 6); }
  dist.curve = curve;
  const o = c.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(780, t);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.75);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.9;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.8, t + 0.035);
  g.gain.setValueAtTime(0.8, t + 0.42);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
  o.connect(dist); dist.connect(bp); bp.connect(g); g.connect(master!);
  o.start(t); o.stop(t + 1.05);

  const n = c.createBufferSource(); n.buffer = noiseBuffer(c, 1);
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200;
  const ng = c.createGain(); env(ng, t, 0.02, 0.45, 0.55);
  n.connect(hp); hp.connect(ng); ng.connect(master!);
  n.start(t); n.stop(t + 0.8);

  const s = c.createOscillator(); s.type = 'sine';
  s.frequency.setValueAtTime(60, t);
  s.frequency.exponentialRampToValueAtTime(28, t + 0.4);
  const sg = c.createGain(); env(sg, t, 0.012, 0.8, 0.5);
  s.connect(sg); sg.connect(master!);
  s.start(t); s.stop(t + 0.65);
}

function beat() {
  if (!ctx || !master) return;
  const c = ctx;
  const t = c.currentTime;
  const thump = (at: number, vol: number) => {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(58, at);
    o.frequency.exponentialRampToValueAtTime(34, at + 0.12);
    const g = c.createGain(); env(g, at, 0.012, vol, 0.14);
    o.connect(g); g.connect(master!);
    o.start(at); o.stop(at + 0.22);
  };
  thump(t, 0.3);
  thump(t + 0.16, 0.19);
}

/** Heartbeat tempo follows your sanity. Pass active=false to stop it.
    This is called on every sanity tick, so the timer is rebuilt only when the
    tempo bucket actually changes — restarting it on every call reset the
    countdown before it could ever elapse, and the heart never beat at all. */
export function setHeartbeat(sanity: number, active: boolean) {
  const interval = !active ? 0 : sanity > 70 ? 1500 : sanity > 45 ? 1050 : sanity > 22 ? 700 : 430;
  if (interval === hbInterval) return;
  hbInterval = interval;
  if (hbTimer !== null) {
    window.clearInterval(hbTimer);
    hbTimer = null;
  }
  if (!interval) return;
  hbTimer = window.setInterval(beat, interval);
}
