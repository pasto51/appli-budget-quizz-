// Voix de l'animateur (ElevenLabs, optionnelle). Sans clé configurée sur le
// serveur, say() ne fait rien et le jeu se déroule normalement.

import { configureVoice } from '../shared/voice.js';
import { LINES } from '../shared/voicelines.js';
import { render } from './render.js';
import { S, teamById } from './state.js';
import { say as voiceSay } from '../shared/voice.js';

export const voiceInfo = { available: false, voices: [], loaded: false };

export async function loadVoiceInfo() {
  try {
    const info = await (await fetch('/api/info')).json();
    voiceInfo.available = !!info.voice;
    if (voiceInfo.available) {
      const v = await (await fetch('/api/voices')).json();
      voiceInfo.voices = v.voices || [];
      if (!S.settings.voiceId) S.settings.voiceId = v.default || voiceInfo.voices[0]?.id || '';
    }
  } catch {}
  voiceInfo.loaded = true;
  if (S.phase === 'setup') render();
}

export function applyVoiceConfig() {
  configureVoice({ enabled: !!(S.settings.voice && voiceInfo.available), voice: S.settings.voiceId, quality: S.settings.voiceQuality });
}

// lit des phrases à la suite ; rend une promesse résolue à la fin de la lecture
export const say = (parts, opts) => voiceSay(parts, opts);

export const answerParts = (R) => (R.type === 'selpoivre' ? [R.item.sel ? LINES.sel : LINES.poivre, R.item.why] : [R.item.a]);

export const questionText = (item, type) => (type === 'addition' ? item.words.join(', ') : item.q);

export function twistParts(tw) {
  if (tw.boost) return [LINES.twist, tw.title, tw.boost.map((id) => teamById(id).name).join(' et '), LINES.pouce];
  return [LINES.twist, tw.title, tw.text];
}
