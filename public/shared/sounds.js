// Bruitages et cris d'animaux, fabriqués directement dans le navigateur
// (Web Audio) : aucun fichier sous droits. Pour remplacer un son par un vrai
// enregistrement, déposer un fichier dans public/sounds/ (ex. coq.mp3,
// good.mp3) : il est utilisé à la place du son synthétique.

let ctx = null;
let master = null;
let muted = false;
const fileCache = new Map(); // nom -> Promise<ArrayBuffer | null>

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  // un son silencieux pour débloquer iOS
  const b = ctx.createBuffer(1, 1, 22050);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(master);
  s.start();
}

export function setMuted(v) {
  muted = !!v;
}
export function isMuted() {
  return muted;
}

// ---------- fichiers personnalisés ----------

let available = null; // Promise<string[]> : fichiers présents dans /sounds
const decoded = new Map(); // nom -> Promise<AudioBuffer | null>

// télécharge le fichier (possible avant le premier appui sur l'écran)
function probe(name) {
  if (!available) {
    available =
      location.protocol === 'file:'
        ? Promise.resolve([])
        : fetch('/api/sounds')
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []);
  }
  if (!fileCache.has(name)) {
    fileCache.set(
      name,
      available.then((files) => {
        const f = files.find((x) => x.replace(/\.[^.]+$/, '') === name);
        return f ? fetch(`/sounds/${encodeURIComponent(f)}`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null) : null;
      }),
    );
  }
  return fileCache.get(name);
}

// à appeler au lancement, pour que le premier cri ne soit pas retardé
export function preloadSounds(names) {
  for (const n of names) probe(n);
}

// Les fichiers passent par Web Audio, comme les sons synthétiques : une fois
// le son débloqué par un premier appui, ils jouent même quand c'est un buzz
// venu d'un téléphone qui les déclenche (iPad, Safari…).
async function playFile(name) {
  if (!ctx) return false;
  if (!decoded.has(name)) {
    decoded.set(
      name,
      probe(name).then((buf) => (buf ? ctx.decodeAudioData(buf.slice(0)).catch(() => null) : null)),
    );
  }
  const buffer = await decoded.get(name);
  if (!buffer) return false;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(master);
  src.start();
  return true;
}

// ---------- briques de synthèse ----------

function now() {
  return ctx.currentTime;
}

// voix simple : oscillateur -> filtre -> enveloppe. freq peut être une liste de [temps, valeur].
function voice({ type = 'sawtooth', at = 0, dur = 0.3, freq, filter, q = 1, gain = 0.4, attack = 0.01, release = 0.08, vibrato, tremolo, out = master }) {
  const t0 = now() + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  setCurve(osc.frequency, freq, t0);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.Q.value = filter.q ?? q;
    setCurve(f.frequency, filter.freq, t0);
    node.connect(f);
    node = f;
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  node.connect(g);
  if (tremolo) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = tremolo.rate;
    depth.gain.value = gain * tremolo.depth;
    lfo.connect(depth).connect(g.gain);
    lfo.start(t0);
    lfo.stop(t0 + dur);
  }
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = vibrato.rate;
    depth.gain.value = vibrato.depth;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t0);
    lfo.stop(t0 + dur);
  }
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ at = 0, dur = 0.2, filter = { type: 'bandpass', freq: 1000, q: 1 }, gain = 0.3 }) {
  const t0 = now() + at;
  const len = Math.ceil(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = filter.type;
  f.Q.value = filter.q ?? 1;
  setCurve(f.frequency, filter.freq, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

function setCurve(param, v, t0) {
  if (Array.isArray(v)) {
    param.setValueAtTime(v[0][1], t0 + v[0][0]);
    for (let i = 1; i < v.length; i++) param.linearRampToValueAtTime(v[i][1], t0 + v[i][0]);
  } else param.setValueAtTime(v, t0);
}

// ---------- cris d'animaux ----------

const ANIMAL_SYNTHS = {
  coq() {
    // co-co-ri-cooo
    const notes = [
      [0, 0.12, 520, 600],
      [0.16, 0.12, 560, 640],
      [0.32, 0.14, 700, 820],
      [0.5, 0.75, 900, 760],
    ];
    for (const [at, dur, f1, f2] of notes) {
      voice({ type: 'sawtooth', at, dur, freq: [[0, f1], [dur * 0.4, f2], [dur, f2 * 0.85]], filter: { type: 'bandpass', freq: 1800, q: 2 }, gain: 0.5, vibrato: { rate: 28, depth: 25 } });
      voice({ type: 'square', at, dur, freq: [[0, f1 * 2], [dur, f2 * 1.7]], filter: { type: 'bandpass', freq: 2600, q: 4 }, gain: 0.12 });
    }
  },
  canard() {
    for (const at of [0, 0.28]) {
      voice({ type: 'sawtooth', at, dur: 0.2, freq: [[0, 420], [0.2, 330]], filter: { type: 'bandpass', freq: [[0, 1300], [0.2, 900]], q: 6 }, gain: 0.7, tremolo: { rate: 60, depth: 0.6 } });
      noise({ at, dur: 0.15, filter: { type: 'bandpass', freq: 1500, q: 3 }, gain: 0.08 });
    }
  },
  grenouille() {
    for (const at of [0, 0.45]) {
      voice({ type: 'square', at, dur: 0.35, freq: [[0, 110], [0.35, 85]], filter: { type: 'lowpass', freq: 700, q: 6 }, gain: 0.6, tremolo: { rate: 32, depth: 0.95 } });
    }
  },
  vache() {
    voice({ type: 'sawtooth', dur: 1.2, freq: [[0, 140], [0.3, 160], [1.2, 115]], filter: { type: 'lowpass', freq: [[0, 400], [0.4, 900], [1.2, 350]], q: 5 }, gain: 0.6, attack: 0.08, release: 0.3, vibrato: { rate: 5, depth: 4 } });
  },
  cochon() {
    for (const at of [0, 0.22, 0.44]) {
      voice({ type: 'square', at, dur: 0.16, freq: [[0, 180], [0.16, 120]], filter: { type: 'bandpass', freq: 700, q: 3 }, gain: 0.5, tremolo: { rate: 45, depth: 0.9 } });
      noise({ at, dur: 0.16, filter: { type: 'bandpass', freq: 500, q: 2 }, gain: 0.15 });
    }
  },
  mouton() {
    voice({ type: 'sawtooth', dur: 0.9, freq: [[0, 380], [0.9, 340]], filter: { type: 'bandpass', freq: 1400, q: 3 }, gain: 0.55, tremolo: { rate: 17, depth: 0.85 }, attack: 0.05, release: 0.3 });
  },
  chevre() {
    voice({ type: 'sawtooth', dur: 0.75, freq: [[0, 520], [0.2, 600], [0.75, 480]], filter: { type: 'bandpass', freq: 1900, q: 3 }, gain: 0.5, tremolo: { rate: 24, depth: 0.9 }, attack: 0.03, release: 0.25 });
  },
  cheval() {
    // son de secours (hennissement stylisé) si le fichier cheval.mp3 manque
    const parts = [
      [0, 0.32, 700, 900],
      [0.34, 0.4, 260, 200],
      [0.8, 0.32, 700, 900],
      [1.14, 0.45, 260, 190],
    ];
    for (const [at, dur, f1, f2] of parts) {
      voice({ type: 'sawtooth', at, dur, freq: [[0, f1], [dur, f2]], filter: { type: 'bandpass', freq: f1 * 2, q: 2 }, gain: 0.55 });
      noise({ at, dur, filter: { type: 'bandpass', freq: f1 * 2.5, q: 2 }, gain: 0.06 });
    }
  },
  chat() {
    voice({ type: 'sawtooth', dur: 0.75, freq: [[0, 500], [0.25, 820], [0.75, 560]], filter: { type: 'bandpass', freq: [[0, 900], [0.3, 2200], [0.75, 1000]], q: 5 }, gain: 0.6, attack: 0.04, release: 0.2, vibrato: { rate: 6, depth: 8 } });
  },
  chien() {
    // ouaf ouaf
    for (const at of [0, 0.3]) {
      voice({ type: 'sawtooth', at, dur: 0.16, freq: [[0, 320], [0.05, 420], [0.16, 260]], filter: { type: 'bandpass', freq: 900, q: 2 }, gain: 0.6, attack: 0.005 });
      noise({ at, dur: 0.12, filter: { type: 'bandpass', freq: 1200, q: 1.5 }, gain: 0.2 });
    }
  },
  loup() {
    // hurlement : montée lente puis descente
    voice({ type: 'triangle', dur: 2, freq: [[0, 300], [0.6, 620], [1.4, 640], [2, 420]], gain: 0.5, attack: 0.25, release: 0.5, vibrato: { rate: 5, depth: 10 } });
    voice({ type: 'sawtooth', dur: 2, freq: [[0, 300], [0.6, 620], [1.4, 640], [2, 420]], filter: { type: 'lowpass', freq: 1200 }, gain: 0.12, attack: 0.25, release: 0.5 });
  },
  hibou() {
    // hou-hou… hou
    for (const [at, dur] of [[0, 0.3], [0.45, 0.25], [0.95, 0.6]]) {
      voice({ type: 'sine', at, dur, freq: [[0, 420], [dur * 0.3, 450], [dur, 380]], gain: 0.55, attack: 0.05, release: 0.15 });
    }
  },
  lion() {
    // rugissement
    voice({ type: 'sawtooth', dur: 1.4, freq: [[0, 90], [0.3, 140], [1.4, 70]], filter: { type: 'lowpass', freq: [[0, 400], [0.3, 1500], [1.4, 300]], q: 3 }, gain: 0.6, attack: 0.08, release: 0.5, tremolo: { rate: 25, depth: 0.5 } });
    noise({ dur: 1.3, filter: { type: 'bandpass', freq: [[0, 500], [0.3, 1400], [1.3, 300]], q: 1 }, gain: 0.35 });
  },
  elephant() {
    // barrissement de trompette
    voice({ type: 'sawtooth', dur: 1.1, freq: [[0, 500], [0.15, 900], [0.9, 820], [1.1, 600]], filter: { type: 'bandpass', freq: 1800, q: 2 }, gain: 0.5, attack: 0.04, release: 0.25, vibrato: { rate: 9, depth: 30 } });
    voice({ type: 'square', dur: 1.1, freq: [[0, 1000], [0.15, 1800], [1.1, 1200]], filter: { type: 'bandpass', freq: 2600, q: 4 }, gain: 0.12 });
  },
};

// ---------- bruitages ----------

const SFX = {
  good() {
    [523, 659, 784, 1047].forEach((f, i) => voice({ type: 'triangle', at: i * 0.08, dur: 0.25, freq: f, gain: 0.35 }));
  },
  bad() {
    voice({ type: 'sawtooth', dur: 0.55, freq: [[0, 180], [0.55, 90]], filter: { type: 'lowpass', freq: 900 }, gain: 0.5 });
    voice({ type: 'square', dur: 0.55, freq: [[0, 186], [0.55, 93]], filter: { type: 'lowpass', freq: 700 }, gain: 0.2 });
  },
  twist() {
    // petit carillon déjanté + glissando
    voice({ type: 'sine', dur: 0.6, freq: [[0, 300], [0.6, 1400]], gain: 0.25 });
    [880, 1108, 880, 1318, 1760].forEach((f, i) => voice({ type: 'square', at: 0.5 + i * 0.09, dur: 0.12, freq: f, filter: { type: 'lowpass', freq: 3000 }, gain: 0.15 }));
    noise({ at: 0.95, dur: 0.5, filter: { type: 'highpass', freq: 5000, q: 0.5 }, gain: 0.15 });
  },
  reveal() {
    voice({ type: 'triangle', dur: 0.3, freq: [[0, 400], [0.3, 800]], gain: 0.3 });
  },
  tick() {
    voice({ type: 'square', dur: 0.05, freq: 1200, filter: { type: 'bandpass', freq: 1500, q: 4 }, gain: 0.2, attack: 0.002, release: 0.04 });
  },
  timeup() {
    for (const at of [0, 0.25, 0.5]) voice({ type: 'square', at, dur: 0.2, freq: 440, filter: { type: 'lowpass', freq: 2000 }, gain: 0.35 });
  },
  round() {
    // jingle de manche
    const mel = [[0, 392], [0.12, 523], [0.24, 659], [0.36, 784], [0.6, 659], [0.72, 784]];
    mel.forEach(([at, f]) => voice({ type: 'square', at, dur: at === 0.72 ? 0.5 : 0.14, freq: f, filter: { type: 'lowpass', freq: 2500 }, gain: 0.22 }));
    [0, 0.36, 0.72].forEach((at) => noise({ at, dur: 0.12, filter: { type: 'highpass', freq: 3000 }, gain: 0.2 }));
  },
  fanfare() {
    const mel = [[0, 523, 0.15], [0.16, 523, 0.15], [0.32, 523, 0.15], [0.48, 659, 0.5], [1.0, 587, 0.15], [1.16, 659, 0.15], [1.32, 784, 0.9]];
    mel.forEach(([at, f, d]) => {
      voice({ type: 'sawtooth', at, dur: d, freq: f, filter: { type: 'lowpass', freq: 2200 }, gain: 0.25 });
      voice({ type: 'square', at, dur: d, freq: f / 2, filter: { type: 'lowpass', freq: 1200 }, gain: 0.12 });
    });
  },
  drumroll() {
    // roulement de tambour qui accélère, puis coup de cymbale
    let t = 0;
    for (let i = 0; i < 34; i++) {
      const gap = 0.075 - i * 0.0016;
      noise({ at: t, dur: 0.07, filter: { type: 'bandpass', freq: 180 + i * 4, q: 0.8 }, gain: 0.25 + i * 0.012 });
      t += Math.max(0.022, gap);
    }
    noise({ at: t + 0.02, dur: 0.9, filter: { type: 'highpass', freq: 4500, q: 0.5 }, gain: 0.35 });
    voice({ type: 'sine', at: t + 0.02, dur: 0.4, freq: [[0, 120], [0.4, 60]], gain: 0.5 });
  },
  lead() {
    // petite montée triomphante
    [523, 659, 784, 1047, 1319].forEach((f, i) => voice({ type: 'square', at: i * 0.07, dur: i === 4 ? 0.45 : 0.1, freq: f, filter: { type: 'lowpass', freq: 3000 }, gain: 0.18 }));
  },
  pop() {
    voice({ type: 'sine', dur: 0.1, freq: [[0, 900], [0.1, 300]], gain: 0.35, attack: 0.003 });
  },
  burger() {
    // grondement menaçant pour la finale
    voice({ type: 'sawtooth', dur: 1.6, freq: [[0, 55], [1.6, 41]], filter: { type: 'lowpass', freq: [[0, 200], [0.8, 600], [1.6, 150]], q: 8 }, gain: 0.6, attack: 0.2, release: 0.5 });
    noise({ at: 0, dur: 1.4, filter: { type: 'lowpass', freq: 300, q: 1 }, gain: 0.3 });
    [0.9, 1.1, 1.3].forEach((at, i) => voice({ type: 'square', at, dur: 0.18, freq: [196, 185, 175][i], filter: { type: 'lowpass', freq: 1500 }, gain: 0.25 }));
  },
};

export async function play(name) {
  if (muted) return;
  if (!ctx) unlockAudio();
  if (await playFile(name)) return;
  if (!ctx) return;
  const fn = ANIMAL_SYNTHS[name] || SFX[name];
  if (fn) fn();
}
