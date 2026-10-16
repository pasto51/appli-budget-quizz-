// Rendu de l'écran de jeu : cadre général (barre du haut, scores, panneaux
// des équipes en mode tablette, menu), annonces et notifications.

import * as C from '../shared/content.js';
import { esc, renderControls } from '../shared/controls.js';
import { isMuted, play } from '../shared/sounds.js';
import { voiceBusy } from '../shared/voice.js';
import { LINES } from '../shared/voicelines.js';

import { renderPlay } from './play-screens.js';
import { sendRemote } from './presenter.js';
import { renderLobby, renderPodium, renderRoundIntro, renderSetup } from './screens.js';
import { $, S, activeTeams, animalOf, boosted, roundType, rt } from './state.js';
import { hostSend } from './transport.js';
import { viewFor } from './views.js';
import { applyVoiceConfig, say } from './voice.js';

// « Ketchup prend la tête ! » quand une équipe passe seule en tête (réglage « Suspense »)
export function checkLeader() {
  if (S.phase !== 'play') return;
  const top = Math.max(...activeTeams().map((t) => t.score));
  const leaders = activeTeams().filter((t) => t.score === top);
  if (leaders.length !== 1 || top <= 0) return;
  const id = leaders[0].id;
  if (S.leader === id) return;
  S.leader = id;
  if (S.settings.suspense) setTimeout(() => announce(`${animalOf(leaders[0]).emoji} ${leaders[0].name} prend la tête !`, leaders[0]), 900);
}

let announceTimer = null;

export function announce(text, team) {
  const el = $('announce');
  el.textContent = text;
  el.style.setProperty('--team', team.color);
  el.style.setProperty('--ink', team.ink);
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  play('lead');
  if (!voiceBusy()) say([team.name, LINES.lead]);
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

let toastTimer = null;

export function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

export function render() {
  applyVoiceConfig();
  document.body.dataset.phase = S.phase;
  const n = activeTeams().length;
  document.body.dataset.density = n > 8 ? 'lots' : n > 4 ? 'many' : 'few';
  document.body.classList.toggle('local-mode', S.mode === 'local');
  renderTop();
  renderScores();
  if (S.phase === 'setup') renderSetup();
  else if (S.phase === 'lobby') renderLobby();
  else if (S.phase === 'round-intro') renderRoundIntro();
  else if (S.phase === 'podium') renderPodium();
  else renderPlay();
  renderPanels();
  $('pause').classList.toggle('show', S.paused);
  document.body.classList.toggle('has-remote', S.mode === 'net' && S.settings.presenter && rt.remoteCount > 0 && S.phase !== 'setup');
  sendRemote();
}

export function renderTop() {
  const el = $('top');
  if (S.phase === 'setup') {
    el.innerHTML = `<div class="logo">🍔 Burger Quiz <span>maison</span></div>`;
    return;
  }
  const type = roundType();
  const info = S.phase === 'play' || S.phase === 'round-intro' ? C.ROUNDS[type] : null;
  const R = S.R;
  let progress = '';
  if (S.phase === 'play' && R) {
    if (R.items) progress = `Question ${Math.min(R.qi + 1, R.items.length)}/${R.items.length}`;
    else if (R.order && !(R.type === 'pubs' && (R.step === 'brief' || R.step === 'prep'))) progress = `Équipe ${R.ti + 1}/${R.order.length}`;
  }
  const dot = S.mode === 'net' ? `<span class="net-dot net-${rt.connStatus}" title="Connexion au serveur"></span>` : '';
  el.innerHTML = `<div class="logo">🍔 <span class="logo-short">BQ</span></div>
    <div class="top-round">${info ? `<b>Manche ${S.ri + 1} · ${esc(info.title)}</b> ${progress ? `<span>${progress}</span>` : ''}` : ''}</div>
    <div class="top-tools">
      ${S.mode === 'net' && S.code ? `<span class="room-code">${dot}${esc(S.code)}</span>` : ''}
      <button class="tool" data-act="mute" title="Son">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="tool" data-act="pause" title="Pause (touche P)"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button>
      <button class="tool" data-act="menu" title="Menu">☰</button>
    </div>`;
}

export function renderScores() {
  const el = $('scores');
  if (S.phase === 'setup') {
    el.innerHTML = '';
    return;
  }
  const R = S.R;
  const now = Date.now();
  el.innerHTML = activeTeams()
    .map((t) => {
      const a = animalOf(t);
      const groupStep = R && R.type === 'pubs' && (R.step === 'brief' || R.step === 'prep');
      const hot = R && (R.winner === t.id || (R.order && R.order[R.ti] === t.id && S.phase === 'play' && !groupStep));
      const out = R && R.excluded && R.excluded.includes(t.id);
      const n = rt.deviceCounts[t.id] || 0;
      return `<div class="score-card ${hot ? 'hot' : ''} ${out ? 'out' : ''} ${now - (rt.bumped[t.id] || 0) < 1500 ? 'bump' : ''}" style="--team:${t.color};--ink:${t.ink}">
        <div class="score-name"><span class="score-emoji">${a.emoji}</span>${esc(t.name)}</div>
        <div class="score-pts">${t.score}</div>
        ${boosted(t.id) ? '<div class="score-boost">×2</div>' : ''}
        ${S.mode === 'net' ? `<div class="score-dev" title="Téléphones connectés">📱 ${n}</div>` : ''}
        ${S.adjust ? `<div class="score-adj"><button data-act="adj" data-team="${t.id}" data-d="-1">−1</button><button data-act="adj" data-team="${t.id}" data-d="1">+1</button></div>` : ''}
      </div>`;
    })
    .join('');
}

export function renderPanels() {
  const el = $('panels');
  const show = S.phase === 'play' && (S.mode === 'local' || S.showPanels);
  el.hidden = !show;
  if (!show) return;
  if (el.children.length !== activeTeams().length) {
    el.innerHTML = activeTeams().map((t) => `<div class="panel" data-team="${t.id}" style="--team:${t.color};--ink:${t.ink}"></div>`).join('');
  }
  activeTeams().forEach((t, i) => {
    const p = el.children[i];
    const head = `<div class="panel-head">${animalOf(t).emoji} ${esc(t.name)} ${S.mode === 'local' && i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ''}</div>`;
    const body = document.createElement('div');
    renderControls(body, {
      team: t,
      teams: activeTeams(),
      view: viewFor(t.id),
      buzz: rt.buzzState,
      secret: S.secrets?.[t.id]?.payload || null,
      compact: true,
      onBuzz: (qid) => hostSend({ t: 'act', team: t.id, kind: 'buzz', qid }),
      onAction: (qid, value) => hostSend({ t: 'act', team: t.id, kind: 'action', qid, value }),
    });
    p.innerHTML = head;
    p.appendChild(body);
  });
}

// les animations d'entrée ne jouent que quand on change de question, pas à chaque rafraîchissement
let stageKey = '';

let enterTimer = null;

export function stage(html, controls = '') {
  const R = S.R;
  const key = `${S.phase}|${S.ri}|${R ? `${R.qi}|${R.ti}|${R.step === 'twist'}` : ''}`;
  const el = $('stage');
  if (key !== stageKey) {
    stageKey = key;
    el.classList.add('enter');
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => el.classList.remove('enter'), 900);
  }
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
  if ($('controls').dataset.html !== controls) {
    $('controls').innerHTML = controls;
    $('controls').dataset.html = controls;
  }
}

export const btn = (act, label, cls = '', extra = '') => `<button class="btn ${cls}" data-act="${act}" ${extra}>${label}</button>`;

export function openMenu() {
  const m = $('menu');
  m.innerHTML = `<div class="menu-box">
    <h2>Menu</h2>
    ${btn('m-adjust', S.adjust ? 'Masquer la correction des scores' : 'Corriger les scores (±1)')}
    ${S.mode === 'net' ? btn('m-panels', S.showPanels ? 'Masquer les commandes à l’écran' : 'Commandes à l’écran (téléphone en panne)') : ''}
    ${S.mode === 'net' && S.code && S.settings.presenter ? btn('m-presenter', '🎤 Télécommande du présentateur') + btn('m-presenter-reset', '🔄 Changer de présentateur') : ''}
    ${S.mode === 'net' && S.code ? btn('m-presenter-toggle', S.settings.presenter ? '🚫 Désactiver le présentateur' : '🎤 Activer un présentateur') : ''}
    ${S.phase === 'play' || S.phase === 'round-intro' ? btn('m-skip', 'Passer à la manche suivante') : ''}
    ${btn('m-end', 'Terminer la partie', 'btn-bad')}
    ${btn('m-close', 'Fermer', 'btn-primary')}
  </div>`;
  m.classList.add('show');
}
