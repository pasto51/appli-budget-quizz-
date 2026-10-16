// Télécommande du présentateur (public/remote.html) : l'écran lui envoie un
// résumé de la situation (remoteState) et exécute ses boutons (onRemoteAct).

import * as C from '../shared/content.js';
import { isMuted } from '../shared/sounds.js';
import { doAct, ensureAudio } from './actions.js';
import { btn, toast } from './render.js';
import { $, S, activeTeams, animalOf, menuQs, mult, ranking, roundRules, roundType, rt, teamById, wrongCosts } from './state.js';

const REMOTE_ALWAYS = new Set(['pause', 'adj', 'm-skip', 'm-end', 'mute']);

// ce que le présentateur doit savoir et que l'écran ne montre pas encore
function presenterSecret() {
  const R = S.R;
  if (S.phase !== 'play' || !R) return null;
  if (R.type === 'selpoivre' && R.item) return { label: 'Réponse', text: R.item.sel ? '🧂 Sel (vrai)' : '🌶️ Poivre (faux)', more: R.item.why };
  if (R.type === 'pubs') return { label: 'Produits', text: R.order.map((id, i) => `${teamById(id).name} : ${R.products[i]}`).join('\n') };
  if (R.type === 'defis') return R.revealText ? { label: 'À faire deviner', text: R.revealText } : null;
  if (R.type === 'menus' && R.step === 'pick') return null;
  if (R.item && R.item.a) return { label: 'Réponse', text: R.item.a };
  return null;
}

// ce qu'on peut gagner sur la question en cours, comme la pastille de l'écran
function pointsAtStake() {
  const R = S.R;
  if (S.phase !== 'play' || !R || R.step === 'twist') return null;
  const m = mult();
  const x3 = (m > 1 ? ' (triple)' : '') + (R.twist?.boost ? ` · double pour ${R.twist.boost.map((id) => teamById(id).name).join(', ')}` : '');
  switch (R.type) {
    case 'nuggets':
      return `+${m}${wrongCosts() ? ` / −${m}` : ''}${x3}`;
    case 'addition':
      return `+${2 * m}${wrongCosts() ? ` / −${m}` : ''}${x3}`;
    case 'burger':
      return `+${2 * m} / −${m}${x3}`;
    case 'selpoivre':
      return `+${m} par bonne réponse${x3}`;
    case 'menus':
      return R.step === 'pick' ? `+1 par question, +1 bonus si ${menuQs()}/${menuQs()}` : `+${m}${x3} · bonus +1 si ${menuQs()}/${menuQs()}`;
    case 'pubs':
      return R.step === 'brief' || R.step === 'prep' ? null : activeTeams().length === 2 ? '+2 si convaincus · +1 fou rire possible' : '+2 si majorité convaincue · +1 si égalité';
    case 'defis':
      return '+2 si réussi';
  }
  return null;
}

export function remoteState() {
  const R = S.R;
  const type = roundType();
  const buttons = [...document.querySelectorAll('#controls [data-act], #stage [data-act="menu-pick"]')].map((b) => ({
    act: b.dataset.act,
    label: b.textContent.trim().replace(/\s+/g, ' '),
    kind: ['btn-primary', 'btn-good', 'btn-bad'].find((c) => b.classList.contains(c)) || 'btn-ghost',
    disabled: b.disabled,
    data: { ...b.dataset },
  }));
  let headline = '';
  if (S.phase === 'lobby') headline = 'Salle d’attente : les équipes rejoignent la partie';
  else if (S.phase === 'round-intro') headline = `${C.ROUNDS[type].title} : ${roundRules(type)}`;
  else if (S.phase === 'podium') headline = `🏆 ${ranking()[0].name} gagne !`;
  else if (R) {
    if (R.step === 'twist') headline = '';
    else if (R.item) headline = R.type === 'addition' ? R.item.words.join(' + ') : R.item.q;
    else if (R.type === 'menus' && R.step === 'pick') headline = `${teamById(R.order[R.ti]).name} choisit son menu`;
    else if (R.type === 'pubs') headline = R.step === 'brief' || R.step === 'prep' ? 'Fausses pubs : concertation' : `Pub de ${teamById(R.order[R.ti]).name} : ${R.product}`;
    else if (R.type === 'defis') headline = `${teamById(R.order[R.ti]).name} : ${R.defiTitle}`;
  }
  let progress = '';
  if (S.phase === 'play' && R) progress = R.items ? `Question ${Math.min(R.qi + 1, R.items.length)}/${R.items.length}` : R.order && !(R.type === 'pubs' && (R.step === 'brief' || R.step === 'prep')) ? `Équipe ${R.ti + 1}/${R.order.length}` : '';
  const buzzed = R && R.winner && (R.step === 'answer' || R.step === 'reveal') ? teamById(R.winner).name : null;
  return {
    phase: S.phase,
    code: S.code,
    round: S.phase === 'play' || S.phase === 'round-intro' ? `Manche ${S.ri + 1} · ${C.ROUNDS[type].title}` : '',
    progress,
    headline,
    buzzed,
    secret: presenterSecret(),
    // règle bizarre en entier, comme à l'écran (grande carte pendant l'annonce, rappel ensuite)
    twist: R?.twist ? { title: R.twist.title, text: R.twist.text, announce: R.step === 'twist' } : null,
    points: pointsAtStake(),
    extras: [R?.timeUp ? '⏱ Temps écoulé : à vous de dire si c’est juste ou faux' : null, R?.stealInfo, R?.swapInfo, R?.type === 'menus' && R.step === 'summary' && R.correct === menuQs() ? 'Menu complet : +1 bonus !' : null, R?.bonus ? '😂 +1 fou rire accordé' : null].filter(Boolean),
    deadline: R?.deadline || 0,
    paused: S.paused,
    muted: isMuted(),
    buttons,
    teams: activeTeams().map((t) => ({ id: t.id, name: t.name, color: t.color, ink: t.ink, emoji: animalOf(t).emoji, score: t.score })),
  };
}

export function sendRemote() {
  if (S.mode !== 'net' || !rt.net || !S.code || !S.settings.presenter) return;
  const state = remoteState();
  const json = JSON.stringify(state);
  if (json === rt.lastRemote) return;
  rt.lastRemote = json;
  rt.net.send({ t: 'remote:state', state: { ...state, hostNow: Date.now() } });
}

export function onRemoteAct(act, data) {
  if (!S.settings.presenter) return;
  ensureAudio();
  // on n'accepte que les boutons affichés en ce moment (évite les doubles appuis)
  const shown = remoteState().buttons.some((b) => b.act === act && !b.disabled && (b.data.v ?? null) === (data.v ?? null) && (b.data.team ?? null) === (data.team ?? null));
  if (!shown && !REMOTE_ALWAYS.has(act)) return;
  if (act === 'adj' && !activeTeams().some((t) => t.id === data.team)) return;
  if ((act === 'm-skip' || act === 'm-end') && S.phase !== 'play' && S.phase !== 'round-intro') return;
  doAct(act, data, true);
}

function presenterUrl() {
  return `${rt.joinOrigin || location.origin}/remote.html?code=${S.code}&key=${encodeURIComponent(S.remoteKey || '')}`;
}

export function showPresenter() {
  const m = $('menu');
  if (!S.code || !S.remoteKey) return toast('La salle n’est pas encore prête.');
  const url = presenterUrl();
  m.innerHTML = `<div class="menu-box presenter-box">
    <h2>🎤 Télécommande du présentateur</h2>
    <p class="hint">Réservé au présentateur : les joueurs détournent les yeux ! Il verra les réponses à l’avance.</p>
    <img class="qr qr-small" src="/qr.svg?text=${encodeURIComponent(url)}" alt="QR code du présentateur">
    <p class="hint">Une fois connecté, les boutons disparaissent de la télé : tout se pilote depuis son téléphone.</p>
    ${btn('m-close', 'Fermer', 'btn-primary')}
  </div>`;
  m.classList.add('show');
}
