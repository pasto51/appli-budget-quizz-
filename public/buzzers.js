// Buzzers seuls : le système de buzzers du jeu, sans les questions.
// Pour un quiz maison où quelqu'un lit ses propres questions : l'écran montre
// qui a buzzé en premier (avec son cri d'animal) et compte les points.
//
// Deux façons de jouer :
//   - « net »   : chaque équipe buzze avec son téléphone (play.html, même salle
//                 et même protocole que le jeu complet) ;
//   - « local » : tout le monde buzze sur cet écran (gros boutons ou touches 1 à 0).
// Le Hub (shared/hub.js) arbitre les buzz exactement comme dans le jeu.
//
// Règle d'or, comme pour l'écran de jeu : on modifie B, puis on appelle sync().

import { Hub, NAME_MAX, cleanName, handleHostMessage } from './shared/hub.js';
import { Socket } from './shared/net.js';
import { esc } from './shared/controls.js';
import { ANIMALS, MAX_TEAMS, TEAM_PRESETS } from './shared/content.js';
import { play, preloadSounds, unlockAudio } from './shared/sounds.js';
import { setupKeepAwake } from './shared/awake.js';
import { showInstall } from './shared/install.js';

const SAVE_KEY = 'bq.buzzers';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
const $app = document.getElementById('app');

const store = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(SAVE_KEY));
    } catch {
      return null;
    }
  },
  set(v) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(v));
    } catch {}
  },
};

// B : tout ce qui est sauvegardé (une partie survit à un rechargement)
//   phase    'setup' (réglages) | 'lobby' (QR code, net seulement) | 'play'
//   step     'idle' (rien d'ouvert) | 'open' (buzzers ouverts) | 'winner' (une équipe a la main)
//   excluded équipes qui se sont trompées sur la question en cours
//   names    noms choisis par les équipes (sinon le nom par défaut : Ketchup, Mayo…)
const fresh = () => ({ phase: 'setup', mode: 'net', n: 3, names: {}, scores: {}, step: 'idle', qid: null, seq: 0, winner: null, excluded: [], code: null, hostToken: null, remoteKey: null });
let B = { ...fresh(), ...(store.get() || {}) };

// rt : état de la session, non sauvegardé
const rt = { hub: null, net: null, conn: 'connecting', joinUrl: '', counts: {}, lastViews: {}, openKey: null, showQr: false };

const named = (t) => ({ ...t, name: B.names?.[t.id] || t.name });
const teams = () => TEAM_PRESETS.slice(0, B.n).map(named);
const teamById = (id) => teams().find((t) => t.id === id);
const animalOf = (t) => ANIMALS.find((a) => a.id === t.animal) || ANIMALS[0];
const score = (id) => B.scores[id] || 0;
const rankOf = (id) => 1 + teams().filter((t) => score(t.id) > score(id)).length;

// ---------- lien avec le hub (serveur ou local) ----------

function send(msg) {
  if (B.mode !== 'local') rt.net?.send(msg);
  else if (rt.hub) handleHostMessage(rt.hub, msg);
}

function connect() {
  if (B.mode === 'local') {
    rt.hub = new Hub({ toHost: onHub });
    resync();
    return;
  }
  if (rt.net) return;
  rt.net = new Socket({
    onOpen: () => rt.net.send(B.code ? { t: 'host:resume', code: B.code, hostToken: B.hostToken, remoteKey: B.remoteKey } : { t: 'host:create' }),
    onMessage: onHub,
    onStatus: (s) => {
      rt.conn = s;
      render();
    },
  });
}

function disconnect() {
  if (rt.net) {
    rt.net.closed = true;
    rt.net.ws?.close();
    clearInterval(rt.net.pinger);
  }
  rt.net = null;
  rt.hub = null;
}

function onHub(msg) {
  switch (msg.t) {
    case 'room':
      B.code = msg.code;
      B.hostToken = msg.hostToken;
      B.remoteKey = msg.remoteKey;
      rt.joinUrl = `${location.origin}/play.html?code=${B.code}`;
      joinUrlForLan();
      resync();
      return;
    case 'devices':
      rt.counts = msg.counts;
      return render();
    case 'buzz':
      return onBuzz(msg.team, msg.qid);
    case 'rename': // une équipe choisit son nom sur son téléphone
      return rename(msg.team, msg.name);
  }
}

// en local (localhost), le QR code doit pointer vers l'adresse Wi-Fi du serveur
async function joinUrlForLan() {
  if (!/^(localhost|127\.|\[::1\])/.test(location.hostname)) return;
  try {
    const info = await (await fetch('/api/info')).json();
    if (info.addresses?.length) rt.joinUrl = `${location.protocol}//${info.addresses[0]}:${location.port || info.port}/play.html?code=${B.code}`;
    render();
  } catch {}
}

function rename(id, name) {
  if (!teamById(id)) return;
  B.names = { ...B.names, [id]: cleanName(name) || undefined };
  send({ t: 'teams', teams: teams() });
  sync();
}

// renvoie tout au hub (connexion, reconnexion, redémarrage du serveur)
function resync() {
  rt.lastViews = {};
  rt.openKey = null;
  send({ t: 'teams', teams: teams() });
  sync();
}

// ce que voit le téléphone de chaque équipe
function viewFor(t) {
  const me = { score: score(t.id), rank: rankOf(t.id), n: B.n };
  if (B.phase !== 'play') return { screen: 'wait', title: `Bienvenue, ${t.name} !`, text: 'Ça va commencer. Regardez l’écran.', canRename: true };
  if (B.step === 'idle') return { screen: 'wait', title: 'Prêts ?', text: 'Écoutez la question…', me, canRename: true };
  return { screen: 'buzz', qid: B.qid, me };
}

function sync() {
  if (B.phase !== 'setup') {
    for (const t of teams()) {
      const view = viewFor(t);
      const json = JSON.stringify(view);
      if (rt.lastViews[t.id] !== json) {
        rt.lastViews[t.id] = json;
        send({ t: 'view', team: t.id, view });
      }
    }
    const want = B.phase === 'play' && B.step === 'open' ? B.qid : null;
    if (want && rt.openKey !== want) {
      rt.openKey = want;
      send({ t: 'buzz:open', qid: B.qid, mode: 'first', eligible: teams().map((t) => t.id).filter((id) => !B.excluded.includes(id)) });
    } else if (!want && rt.openKey) {
      rt.openKey = null;
      send({ t: 'buzz:close' });
    }
  }
  store.set(B);
  render();
}

// ---------- déroulé ----------

// nouvelle question : tout le monde peut buzzer
function openAll() {
  B.excluded = [];
  reopen();
}

// rouvre les buzzers (sans les équipes qui se sont trompées)
function reopen() {
  B.winner = null;
  B.qid = `b${++B.seq}`;
  B.step = teams().every((t) => B.excluded.includes(t.id)) ? 'idle' : 'open';
  sync();
}

function onBuzz(team, qid) {
  if (B.step !== 'open' || qid !== B.qid) return;
  B.winner = team;
  B.step = 'winner';
  play(teamById(team).animal);
  sync();
}

function addPoints(id, d) {
  B.scores[id] = score(id) + d;
}

function judge(ok) {
  if (!B.winner) return;
  if (ok) {
    addPoints(B.winner, 1);
    play('good');
    B.step = 'idle';
    B.winner = null;
    B.excluded = [];
    return sync();
  }
  play('bad');
  B.excluded.push(B.winner);
  reopen();
}

// ---------- rendu ----------

function render() {
  document.body.classList.toggle('bz-local', B.mode === 'local');
  showInstall(B.phase === 'setup');
  if (B.phase === 'setup') return renderSetup();
  if (B.phase === 'lobby') return renderLobby();
  renderPlay();
}

function teamChip(t, extra = '') {
  const a = animalOf(t);
  return `<div class="bz-chip ${B.winner === t.id ? 'is-winner' : ''} ${B.excluded.includes(t.id) ? 'is-out' : ''}" style="--team:${t.color};--ink:${t.ink}">
    <span class="bz-chip-name">${a.emoji} ${esc(t.name)}</span>${extra}</div>`;
}

function renderSetup() {
  const nBtns = Array.from({ length: MAX_TEAMS - 1 }, (_, i) => i + 2)
    .map((n) => `<button class="${B.n === n ? 'on' : ''}" data-act="n" data-v="${n}">${n}</button>`)
    .join('');
  $app.innerHTML = `<div class="bz-setup">
    <h1 class="title-xl">🔔 Buzzers <span>seuls</span></h1>
    <p class="home-sub">Lisez vos propres questions : l’écran montre qui a buzzé en premier et compte les points.</p>
    <div class="bz-field"><div class="bz-label">Nombre d’équipes</div><div class="seg-num">${nBtns}</div></div>
    <div class="bz-field"><div class="bz-label">Les équipes buzzent…</div><div class="seg">
      <button class="${B.mode === 'net' ? 'on' : ''}" data-act="mode" data-v="net">📱 Avec leur téléphone<small>Un buzzer par équipe, cri d’animal sur le téléphone</small></button>
      <button class="${B.mode === 'local' ? 'on' : ''}" data-act="mode" data-v="local">👆 Sur cet écran<small>Un gros bouton par équipe (ou les touches 1, 2, 3…)</small></button>
    </div></div>
    <div class="bz-label">Noms des équipes <small>(modifiables ici ou sur les téléphones)</small></div>
    <div class="bz-teams">${teams()
      .map((t) => `<input class="bz-name" data-name="${t.id}" value="${esc(t.name)}" maxlength="${NAME_MAX}" style="--team:${t.color};--ink:${t.ink}" aria-label="Nom de l’équipe ${esc(t.name)}">`)
      .join('')}</div>
    <button class="btn btn-primary btn-big" data-act="go">C’est parti !</button>
    <a class="link" href="./">← Retour</a>
  </div>`;
}

function qrBlock() {
  return rt.joinUrl ? `<img class="qr" src="/qr.svg?text=${encodeURIComponent(rt.joinUrl)}" alt="QR code pour rejoindre">` : '<div class="qr qr-wait">…</div>';
}

function renderLobby() {
  $app.innerHTML = `<div class="bz-lobby">
    <div class="lobby">${qrBlock()}
      <div class="lobby-info">
        <div class="lobby-step">Scannez avec votre téléphone</div>
        <div class="lobby-code-label">ou allez sur ${esc(location.host)}/play.html avec le code</div>
        <div class="lobby-code">${esc(B.code || '····')}</div>
        <div class="lobby-teams">${teams()
          .map((t) => `<div class="lobby-team" style="--team:${t.color};--ink:${t.ink};${rt.counts[t.id] ? 'opacity:1' : ''}">${animalOf(t).emoji} ${esc(t.name)}<span>${rt.counts[t.id] ? `📱 ${rt.counts[t.id]}` : '…'}</span></div>`)
          .join('')}</div>
        <button class="btn btn-primary btn-big" data-act="start">C’est parti !</button>
        <button class="link" data-act="setup">Réglages</button>
      </div>
    </div></div>`;
}

function renderPlay() {
  const w = B.winner && teamById(B.winner);
  let center;
  if (w) {
    center = `<div class="bz-winner" style="--team:${w.color};--ink:${w.ink}">
        <div class="bz-winner-emoji">${animalOf(w).emoji}</div><div class="bz-winner-name">${esc(w.name)}</div><div class="bz-winner-sub">a buzzé !</div></div>
      <div class="bz-actions">
        <button class="btn btn-good btn-big" data-act="right">✓ Juste (+1)</button>
        <button class="btn btn-bad btn-big" data-act="wrong">✗ Faux</button>
      </div>
      <div class="bz-actions"><button class="btn btn-ghost" data-act="open">↺ Annuler, nouvelle question</button></div>`;
  } else if (B.step === 'open') {
    const out = B.excluded.length ? `<div class="bz-hint">Les autres équipes peuvent buzzer</div>` : '';
    center = `<div class="bz-open">🔔 Buzzers ouverts !</div>${out}
      <div class="bz-actions"><button class="btn btn-ghost" data-act="close">Personne ne trouve : fermer</button></div>`;
  } else {
    const nobody = B.excluded.length && teams().every((t) => B.excluded.includes(t.id));
    center = `<div class="bz-idle">${nobody ? 'Personne n’a trouvé…' : 'Lisez la question, puis…'}</div>
      <div class="bz-actions"><button class="btn btn-primary btn-big bz-go" data-act="open">🔔 Ouvrir les buzzers</button></div>`;
  }

  const scores = teams()
    .map((t) => {
      const conn = B.mode === 'net' ? `<span class="bz-dev">${rt.counts[t.id] ? '📱' : '⚠️'}</span>` : '';
      return teamChip(t, `${conn}<span class="bz-pts">${score(t.id)}</span>
        <span class="bz-adj"><button data-act="minus" data-v="${t.id}" aria-label="Retirer un point">−</button><button data-act="plus" data-v="${t.id}" aria-label="Ajouter un point">+</button></span>`);
    })
    .join('');

  // mode « sur cet écran » : un gros bouton par équipe
  const pads =
    B.mode === 'local'
      ? `<div class="bz-pads">${teams()
          .map((t, i) => {
            const armed = B.step === 'open' && !B.excluded.includes(t.id);
            return `<button class="bz-pad ${armed ? 'armed' : ''}" data-pad="${t.id}" ${armed ? '' : 'disabled'} style="--team:${t.color};--ink:${t.ink}">
              ${animalOf(t).emoji}<span>${esc(t.name)}</span><kbd>${KEYS[i]}</kbd></button>`;
          })
          .join('')}</div>`
      : '';

  const net = B.mode === 'net' ? `<span class="bz-code ${rt.conn === 'open' ? '' : 'off'}">Salle <b>${esc(B.code || '····')}</b></span><button class="btn btn-small" data-act="qr">📱 QR code</button>` : '';
  const qr = rt.showQr ? `<div class="bz-qr" data-act="qr">${qrBlock()}<div class="lobby-code">${esc(B.code || '')}</div><div class="bz-hint">Touchez pour fermer</div></div>` : '';

  $app.innerHTML = `<div class="bz-play">
    <header class="bz-top">${net}<span class="bz-spacer"></span>
      <button class="btn btn-small btn-ghost" data-act="reset-scores">Scores à zéro</button>
      <button class="btn btn-small btn-ghost" data-act="setup">Réglages</button></header>
    <section class="bz-scores">${scores}</section>
    <section class="bz-center">${center}</section>
    ${pads}${qr}</div>`;
}

// ---------- actions ----------

function act(name, v) {
  switch (name) {
    case 'n':
      B.n = Number(v);
      return render();
    case 'mode':
      B.mode = v;
      return render();
    case 'go':
      disconnect();
      B = { ...fresh(), n: B.n, mode: B.mode, names: B.names, phase: B.mode === 'net' ? 'lobby' : 'play' };
      connect();
      return sync();
    case 'start':
      B.phase = 'play';
      return sync();
    case 'setup':
      if (B.phase === 'play' && !confirm('Revenir aux réglages ? Les scores seront remis à zéro.')) return;
      disconnect();
      B.phase = 'setup';
      B.step = 'idle';
      rt.showQr = false;
      return sync();
    case 'open':
      return openAll();
    case 'close':
      B.step = 'idle';
      B.excluded = [];
      return sync();
    case 'right':
      return judge(true);
    case 'wrong':
      return judge(false);
    case 'plus':
    case 'minus':
      addPoints(v, name === 'plus' ? 1 : -1);
      return sync();
    case 'reset-scores':
      if (!confirm('Remettre tous les scores à zéro ?')) return;
      B.scores = {};
      return sync();
    case 'qr':
      rt.showQr = !rt.showQr;
      return render();
  }
}

// nom d'équipe tapé à l'écran (réglages)
$app.addEventListener('change', (e) => {
  const id = e.target.dataset?.name;
  if (id) rename(id, e.target.value);
});

// mode « sur cet écran » : une équipe buzze (bouton ou touche du clavier)
function localBuzz(team) {
  if (B.mode !== 'local' || B.step !== 'open' || !rt.hub) return;
  send({ t: 'act', kind: 'buzz', team, qid: B.qid });
}

$app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) act(b.dataset.act, b.dataset.v);
});
// pointerdown plutôt que click : chaque milliseconde compte pour un buzzer
$app.addEventListener('pointerdown', (e) => {
  const pad = e.target.closest('[data-pad]');
  if (pad && !pad.disabled) {
    e.preventDefault();
    localBuzz(pad.dataset.pad);
  }
});
document.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const i = KEYS.indexOf(e.key);
  if (i >= 0 && i < B.n) localBuzz(teams()[i].id);
});
document.addEventListener('pointerdown', () => unlockAudio(), { capture: true, once: true });

setupKeepAwake();
preloadSounds([...ANIMALS.map((a) => a.id), 'good', 'bad']);
if (B.phase !== 'setup') connect();
render();
