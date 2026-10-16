// Télécommande du présentateur : pilote l'écran de jeu depuis un téléphone
// et voit les réponses avant tout le monde.

import { Socket } from './shared/net.js';
import { esc, updateTimers } from './shared/controls.js';

const params = new URLSearchParams(location.search);
const code = (params.get('code') || '').toUpperCase();
const key = params.get('key') || '';
const $main = document.getElementById('main');
const $net = document.getElementById('net');

let state = null;
let deadline = 0;
let error = null;
let adjust = false;

// identifiant de ce téléphone : il retrouve sa place de présentateur après une mise en veille
let rid = null;
try {
  rid = localStorage.getItem('bq.remote');
  if (!rid) {
    rid = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2) + Date.now();
    localStorage.setItem('bq.remote', rid);
  }
} catch {
  rid = String(Math.random()).slice(2);
}

const sock = new Socket({
  onOpen: () => sock.send({ t: 'remote:join', code, key, rid }),
  onMessage: (msg) => {
    if (msg.t === 'error') {
      error = msg.error;
      sock.closed = true;
    }
    if (msg.t === 'remote:state') {
      state = msg.state;
      // l'horloge du téléphone n'est pas celle de l'écran : on convertit en temps restant
      deadline = state.deadline ? Date.now() + (state.deadline - state.hostNow) : 0;
    }
    render();
  },
  onStatus: (s) => ($net.className = `phone-net net-${s}`),
});

let wakeLock = null;
document.addEventListener('pointerdown', async () => {
  try {
    if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    wakeLock?.addEventListener('release', () => (wakeLock = null));
  } catch {}
});

function act(a, data = {}) {
  if (navigator.vibrate) navigator.vibrate(20);
  sock.send({ t: 'remote:act', act: a, data });
}

function render() {
  if (error || !code || !key) {
    $main.innerHTML = `<div class="ctl-wait"><div class="ctl-title">Oups</div><div class="ctl-text">${esc(error || 'Lien incomplet : scannez le QR code du présentateur sur l’écran de jeu.')}</div></div>`;
    return;
  }
  if (!state) {
    $main.innerHTML = `<div class="ctl-wait"><div class="ctl-title">Connecté à la salle ${esc(code)}</div><div class="ctl-text">En attente de l’écran de jeu…</div></div>`;
    return;
  }
  const s = state;
  const buttons = s.buttons
    .map((b, i) =>
      b.act === 'menu-pick'
        ? `<button class="menu-card r-menu" data-i="${i}" ${b.disabled ? 'disabled' : ''}>🍔<span>${esc(b.label.replace(/^🍔\s*/, ''))}</span></button>`
        : `<button class="btn ${b.kind} ${b.kind === 'btn-ghost' ? '' : 'btn-big'}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${esc(b.label)}</button>`,
    )
    .join('');
  const teams = s.teams
    .map(
      (t) => `<div class="r-team" style="--team:${t.color};--ink:${t.ink}"><span>${t.emoji} ${esc(t.name)}</span><b>${t.score}</b>
        ${adjust ? `<span class="r-adj"><button data-adj="${t.id}" data-d="-1">−1</button><button data-adj="${t.id}" data-d="1">+1</button></span>` : ''}</div>`,
    )
    .join('');
  $main.innerHTML = `
    <div class="r-round">${esc(s.round)} ${s.progress ? `<span>${esc(s.progress)}</span>` : ''}</div>
    ${s.twist ? `<div class="r-twist ${s.twist.announce ? 'announce' : ''}"><small>🌀 Règle bizarre${s.twist.announce ? ' : à annoncer !' : ' en cours'}</small><b>${esc(s.twist.title)}</b><span>${esc(s.twist.text)}</span></div>` : ''}
    ${s.points ? `<div class="r-points">${esc(s.points)}</div>` : ''}
    ${s.headline ? `<div class="r-headline">${esc(s.headline)}</div>` : ''}
    ${(s.extras || []).map((x) => `<div class="r-extra">${esc(x)}</div>`).join('')}
    ${s.buzzed ? `<div class="r-buzzed">🔔 ${esc(s.buzzed)} a buzzé</div>` : ''}
    ${s.secret ? `<div class="r-secret"><small>${esc(s.secret.label)} (secret)</small><div>${esc(s.secret.text).replace(/\n/g, '<br>')}</div>${s.secret.more ? `<p>${esc(s.secret.more)}</p>` : ''}</div>` : ''}
    ${deadline ? `<div class="ctl-timer" data-deadline="${deadline}"></div>` : ''}
    <div class="r-buttons">${buttons || '<span class="ctl-sub">Rien à faire pour l’instant</span>'}</div>
    <div class="r-teams">${teams}</div>
    <div class="r-tools">
      <button class="btn btn-ghost" data-tool="pause">${s.paused ? '▶️ Reprendre' : '☕ Pause'}</button>
      <button class="btn btn-ghost" data-tool="mute">${s.muted ? '🔇 Son coupé' : '🔊 Son'}</button>
      <button class="btn btn-ghost" data-tool="adjust">${adjust ? 'Fini les corrections' : '± Scores'}</button>
      ${s.phase === 'play' || s.phase === 'round-intro' ? '<button class="btn btn-ghost" data-tool="m-skip">Manche suivante ⏭</button><button class="btn btn-ghost" data-tool="m-end">Terminer 🏁</button>' : ''}
    </div>`;

  $main.querySelectorAll('[data-i]').forEach((b) =>
    b.addEventListener('click', () => {
      const def = s.buttons[Number(b.dataset.i)];
      b.disabled = true;
      act(def.act, def.data);
    }),
  );
  $main.querySelectorAll('[data-adj]').forEach((b) => b.addEventListener('click', () => act('adj', { team: b.dataset.adj, d: b.dataset.d })));
  $main.querySelectorAll('[data-tool]').forEach((b) =>
    b.addEventListener('click', () => {
      const t = b.dataset.tool;
      if (t === 'adjust') {
        adjust = !adjust;
        return render();
      }
      if ((t === 'm-skip' || t === 'm-end') && !confirm(t === 'm-skip' ? 'Passer à la manche suivante ?' : 'Terminer la partie maintenant ?')) return;
      act(t);
    }),
  );
  updateTimers($main);
}

setInterval(() => updateTimers($main), 250);
render();
