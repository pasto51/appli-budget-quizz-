// App équipe (téléphone) : rejoint une salle, choisit son équipe, sert de buzzer.

import { Socket } from './shared/net.js';
import { renderControls, updateTimers, esc } from './shared/controls.js';
import { ANIMALS } from './shared/content.js';
import { unlockAudio, play, preloadSounds } from './shared/sounds.js';
import { setupKeepAwake } from './shared/awake.js';

const $main = document.getElementById('main');
const $foot = document.getElementById('foot');
const $head = document.getElementById('head');
const $teamName = document.getElementById('teamName');
const $net = document.getElementById('net');
const $me = document.getElementById('me');
let lastScore = null;

const store = {
  get(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
    } catch {}
  },
};

let deviceId = store.get('bq.device');
if (!deviceId) {
  deviceId = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2) + Date.now();
  store.set('bq.device', deviceId);
}

const params = new URLSearchParams(location.search);
let code = (params.get('code') || store.get('bq.code') || '').toUpperCase();
const S = { joined: false, error: null, teams: [], team: null, view: null, buzz: null, secret: null, secretElsewhere: false };
let lastBuzzStatus = null;
let sock = null;

// ---------- son et écran allumé ----------

let audioReady = false;
document.addEventListener(
  'pointerdown',
  () => {
    if (!audioReady) {
      unlockAudio();
      audioReady = true;
    }
  },
  { capture: true },
);

setupKeepAwake();

// ---------- connexion ----------

function start() {
  if (!code) return render();
  store.set('bq.code', code);
  if (sock) {
    sock.closed = true;
    sock.ws && sock.ws.close();
    clearInterval(sock.pinger);
  }
  sock = new Socket({
    onOpen: () => sock.send({ t: 'join', code, deviceId, team: store.get(`bq.team.${code}`) || undefined }),
    onMessage,
    onStatus: (s) => {
      $net.className = `phone-net net-${s}`;
    },
  });
  render();
}

function onMessage(msg) {
  switch (msg.t) {
    case 'error':
      S.error = msg.error;
      sock.closed = true;
      store.set('bq.code', null);
      break;
    case 'joined':
      S.joined = true;
      S.error = null;
      break;
    case 'teams':
      S.teams = msg.teams;
      if (S.team && !S.teams.some((t) => t.id === S.team)) S.team = null;
      break;
    case 'state':
      S.team = msg.team;
      S.teams = msg.teams;
      S.view = localTimer(msg.view);
      S.buzz = msg.buzz;
      S.secret = msg.secret;
      S.secretElsewhere = false;
      store.set(`bq.team.${code}`, msg.team);
      break;
    case 'view':
      S.view = localTimer(msg.view);
      break;
    case 'buzz':
      S.buzz = msg.buzz;
      break;
    case 'secret':
      S.secret = msg.secret;
      S.secretElsewhere = !!msg.elsewhere;
      if (msg.secret && navigator.vibrate) navigator.vibrate([80, 60, 80]);
      break;
  }
  render();
}

// les horloges des téléphones ne sont pas réglées comme celle de l'écran :
// l'écran envoie le temps restant, on en déduit une échéance locale
function localTimer(view) {
  if (view && view.remaining != null) return { ...view, deadline: Date.now() + view.remaining };
  return view;
}

// ---------- rendu ----------

function teamObj() {
  return S.teams.find((t) => t.id === S.team);
}

// score et rang de l'équipe dans l'en-tête, avec un « +2 » qui saute quand on marque
function renderMe(me) {
  if (!me) {
    $me.innerHTML = '';
    lastScore = null;
    return;
  }
  const rank = me.rank === 1 ? '1ʳᵉ' : `${me.rank}ᵉ`;
  $me.innerHTML = `${me.boost ? '<span class="me-boost">×2</span>' : ''}<b>${me.score}</b> pt${Math.abs(me.score) > 1 ? 's' : ''} · ${rank}/${me.n}`;
  if (lastScore != null && me.score !== lastScore) {
    const d = me.score - lastScore;
    const pop = document.createElement('div');
    pop.className = `score-pop ${d > 0 ? 'up' : 'down'}`;
    pop.textContent = d > 0 ? `+${d}` : `${d}`;
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 1800);
    if (navigator.vibrate) navigator.vibrate(d > 0 ? [60, 40, 60] : [250]);
  }
  lastScore = me.score;
}

function render() {
  const team = teamObj();
  document.body.style.setProperty('--team', team ? team.color : '#e2231a');
  document.body.style.setProperty('--ink', team ? team.ink || '#fff' : '#fff');
  $head.classList.toggle('has-team', !!team);
  $foot.innerHTML = '';

  if (!code || S.error) {
    $teamName.textContent = 'Burger Quiz';
    $main.innerHTML = `<form class="join" id="joinForm">
      <div class="join-logo">🍔</div>
      <label for="code">Code de la salle</label>
      <input id="code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="ABCD" value="${esc(code)}" required>
      ${S.error ? `<div class="join-error">${esc(S.error)}</div>` : ''}
      <button class="btn btn-big" type="submit">Rejoindre</button>
    </form>`;
    document.getElementById('joinForm').addEventListener('submit', (e) => {
      e.preventDefault();
      code = document.getElementById('code').value.trim().toUpperCase();
      S.error = null;
      start();
    });
    return;
  }

  if (!S.joined) {
    $teamName.textContent = `Salle ${code}`;
    $main.innerHTML = `<div class="ctl-wait"><div class="ctl-title">Connexion…</div></div>`;
    return;
  }

  if (!team) {
    renderMe(null);
    $teamName.textContent = `Salle ${code}`;
    $main.innerHTML = `<div class="pick"><div class="ctl-title">Choisis ton équipe</div>
      ${S.teams.length ? '' : '<div class="ctl-text">L’écran prépare les équipes…</div>'}
      ${S.teams
        .map((t) => {
          const a = ANIMALS.find((x) => x.id === t.animal);
          return `<button class="pick-team" data-team="${esc(t.id)}" style="--bg:${t.color};--fg:${t.ink || '#fff'}"><span class="pick-emoji">${a ? a.emoji : ''}</span>${esc(t.name)}</button>`;
        })
        .join('')}</div>`;
    $main.querySelectorAll('[data-team]').forEach((b) => b.addEventListener('click', () => sock.send({ t: 'pick', team: b.dataset.team })));
    $foot.innerHTML = `<button class="link" id="other">Autre salle</button>`;
    document.getElementById('other').onclick = () => {
      code = '';
      store.set('bq.code', null);
      S.joined = false;
      sock.closed = true;
      render();
    };
    return;
  }

  const animal = ANIMALS.find((x) => x.id === team.animal);
  $teamName.innerHTML = `${animal ? animal.emoji : ''} ${esc(team.name)}`;
  renderMe(S.view?.me);
  renderControls($main, {
    team,
    teams: S.teams,
    view: S.view,
    buzz: S.buzz,
    secret: S.secret,
    secretElsewhere: S.secretElsewhere,
    onBuzz: (qid) => {
      if (navigator.vibrate) navigator.vibrate(40);
      sock.send({ t: 'buzz', qid, rtt: Math.round(sock.rtt) });
    },
    onAction: (qid, value) => {
      if (navigator.vibrate) navigator.vibrate(30);
      sock.send({ t: 'action', qid, value });
    },
  });

  const st = $main.querySelector('.buzzer')?.className.match(/buzzer-(\w+)/)?.[1] || null;
  if (st === 'won' && lastBuzzStatus !== 'won') {
    if (navigator.vibrate) navigator.vibrate([150, 80, 300]);
    play(team.animal);
  }
  lastBuzzStatus = st;

  $foot.innerHTML = `<button class="link" id="leave">Changer d’équipe</button>`;
  document.getElementById('leave').onclick = () => {
    if (!confirm('Quitter cette équipe ?')) return;
    store.set(`bq.team.${code}`, null);
    S.team = null;
    S.secret = null;
    sock.send({ t: 'leave' });
    render();
  };
}

setInterval(() => updateTimers($main), 250);
preloadSounds(ANIMALS.map((a) => a.id));
start();
