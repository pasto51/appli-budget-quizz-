// Voix de l'animateur (ElevenLabs, via le serveur : la clé n'est jamais dans le navigateur).
// say(parts) lit une ou plusieurs phrases à la suite et rend une promesse
// résolue à la fin de la lecture (ou tout de suite si la voix est coupée).

import { audioEngine, isMuted } from './sounds.js';
import { norm } from './voicelines.js';

const cfg = { enabled: false, voice: '', quality: 'eco' };
const cache = new Map(); // texte -> Promise<AudioBuffer | null>
let current = null; // { source, resolve }
let token = 0;
let gain = null;

export function configureVoice(opts) {
  Object.assign(cfg, opts);
  if (!cfg.enabled) stopVoice();
}

export const voiceEnabled = () => cfg.enabled;
let speaking = 0; // jeton de la lecture en cours (0 = silence)
export const voiceBusy = () => speaking !== 0;

function fetchLine(text) {
  const t = norm(text);
  const key = `${cfg.voice}|${cfg.quality}|${t}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      (async () => {
        try {
          const r = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: t, voice: cfg.voice, quality: cfg.quality }),
          });
          if (!r.ok) {
            cache.delete(key); // on réessaiera plus tard
            return null;
          }
          const buf = await r.arrayBuffer();
          const eng = audioEngine();
          return eng ? await eng.ctx.decodeAudioData(buf) : null;
        } catch {
          cache.delete(key);
          return null;
        }
      })(),
    );
  }
  return cache.get(key);
}

const asParts = (parts) => (Array.isArray(parts) ? parts : [parts]).map((p) => norm(p || '')).filter(Boolean);

// prépare à l'avance (la question suivante, la réponse…) pour que la voix parte sans attendre
export function prefetch(parts) {
  if (!cfg.enabled) return;
  for (const p of asParts(parts)) fetchLine(p);
}

function playBuffer(buffer, myToken) {
  return new Promise((resolve) => {
    const eng = audioEngine();
    if (!eng || myToken !== token) return resolve();
    if (!gain) {
      gain = eng.ctx.createGain();
      gain.gain.value = 1.15;
      gain.connect(eng.master);
    }
    const src = eng.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    current = { source: src, resolve };
    src.onended = () => {
      if (current && current.source === src) current = null;
      resolve();
    };
    src.start();
  });
}

export async function say(parts, opts = {}) {
  if (!cfg.enabled || isMuted()) return;
  stopVoice();
  const myToken = ++token;
  speaking = myToken;
  try {
    await speak(asParts(parts), myToken, opts);
  } finally {
    if (speaking === myToken) speaking = 0;
  }
}

async function speak(list, myToken, opts) {
  const buffers = list.map((p) => fetchLine(p)); // tout part en parallèle
  // délai maximum : si ElevenLabs traîne, le jeu continue sans attendre la voix
  const maxWait = opts.maxWait ?? 4000;
  for (const b of buffers) {
    const buffer = await Promise.race([b, new Promise((r) => setTimeout(() => r(null), maxWait))]);
    if (myToken !== token) return;
    if (buffer) await playBuffer(buffer, myToken);
    if (myToken !== token) return;
  }
}

export function stopVoice() {
  token++;
  speaking = 0;
  if (current) {
    try {
      current.source.stop();
    } catch {}
    current.resolve();
    current = null;
  }
}
