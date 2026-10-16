// Écran de jeu : l'animateur. Il connaît tout l'état de la partie, décide de
// ce qu'affiche chaque téléphone et compte les points.

import { Hub, handleHostMessage } from './shared/hub.js';
import { Socket } from './shared/net.js';
import { renderControls, updateTimers, esc } from './shared/controls.js';
import { unlockAudio, play, setMuted, isMuted, preloadSounds } from './shared/sounds.js';
import { say, stopVoice } from './shared/voice.js';
import * as C from './shared/content.js';

const SAVE_KEY = 'bq.host';
const SEEN_KEY = 'bq.seen';
const $ = (id) => document.getElementById(id);

const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

// ---------- état ----------

function defaultSettings() {
  return { nTeams: 3, twistRate: 0.2, selTimer: true, buzzDuringRead: false, rounds: [...C.ROUND_ORDER] };
}

function freshState() {
  return {
    v: 1,
    phase: 'setup',
    mode: 'net',
    code: null,
    hostToken: null,
    settings: defaultSettings(),
    teams: C.TEAM_PRESETS.map((t) => ({ ...t, score: 0 })),
    ri: 0,
    R: null,
    seq: 0,
    swapUsed: false,
    paused: false,
    pausedAt: 0,
    showPanels: false,
    adjust: false,
  };
}

let S = freshState();
const saved = store.get(SAVE_KEY);
const canResume = saved && saved.v === 1 && saved.phase !== 'setup';
if (saved && saved.v === 1) S.settings = { ...defaultSettings(), ...saved.settings };
if (saved && saved.teams) S.teams = C.TEAM_PRESETS.map((p, i) => ({ ...p, name: saved.teams[i]?.name || p.name, animal: saved.teams[i]?.animal || p.animal, score: 0 }));

let resumePrompt = canResume;
let deviceCounts = {};
let buzzState = null;
let net = null;
let hub = null;
let connStatus = 'idle';
let joinUrl = '';
let lastViews = {}; // teamId -> JSON envoyé
let bumped = {}; // teamId -> horodatage du dernier changement de score
const localSecrets = {}; // teamId -> carte secrète (affichée sur les panneaux de l'écran)

const activeTeams = () => S.teams.slice(0, S.settings.nTeams);
const teamById = (id) => S.teams.find((t) => t.id === id);
const animalOf = (t) => C.ANIMALS.find((a) => a.id === t.animal) || C.ANIMALS[0];
const newQid = () => `${S.ri}.${++S.seq}`;
const roundType = () => S.settings.rounds[S.ri];

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// tire n éléments en privilégiant ceux qui ne sont pas sortis lors des dernières soirées
function pickFresh(bank, size, n) {
  const seen = store.get(SEEN_KEY) || {};
  let list = seen[bank] || [];
  const all = [...Array(size).keys()];
  let fresh = shuffle(all.filter((i) => !list.includes(i)));
  if (fresh.length < n) {
    list = [];
    fresh = [...fresh, ...shuffle(all.filter((i) => !fresh.includes(i)))];
  }
  const chosen = fresh.slice(0, n);
  seen[bank] = [...list, ...chosen];
  store.set(SEEN_KEY, seen);
  return chosen;
}

// ---------- transport (réseau ou tablette unique) ----------

function hostSend(msg) {
  if (S.mode === 'local') {
    if (!hub) hub = new Hub({ toHost: onHubMessage });
    handleHostMessage(hub, msg);
  } else if (net) net.send(msg);
}

function connect() {
  if (S.mode === 'local') {
    hub = new Hub({ toHost: onHubMessage });
    resync();
    return;
  }
  if (net) return;
  net = new Socket({
    onOpen: () => net.send(S.code ? { t: 'host:resume', code: S.code, hostToken: S.hostToken } : { t: 'host:create' }),
    onMessage: onHubMessage,
    onStatus: (s) => {
      connStatus = s;
      renderTop();
    },
  });
}

function onHubMessage(msg) {
  switch (msg.t) {
    case 'room':
      S.code = msg.code;
      S.hostToken = msg.hostToken;
      computeJoinUrl();
      resync();
      break;
    case 'devices':
      deviceCounts = msg.counts;
      renderScores();
      if (S.phase === 'lobby') render();
      return;
    case 'buzzstate':
      buzzState = msg.buzz;
      renderPanels();
      return;
    case 'buzz':
      onBuzz(msg.team, msg.qid);
      break;
    case 'action':
      onAction(msg.team, msg.qid, msg.value);
      break;
    case 'secret:sent':
      if (S.mode === 'net' && msg.devices === 0) toast(`${teamById(msg.team)?.name} n’a pas de téléphone connecté : la carte secrète est sur l’écran.`);
      return;
  }
}

// renvoie tout au hub (après une reconnexion ou un redémarrage du serveur)
function resync() {
  lastViews = {};
  buzzOpenKey = null;
  hostSend({ t: 'teams', teams: activeTeams() });
  for (const [team, secret] of Object.entries(localSecrets)) if (secret) hostSend({ t: 'secret', team, target: S.R?.defi?.secret || 'device', payload: secret });
  sync();
}

async function computeJoinUrl() {
  let origin = location.origin;
  if (/^(localhost|127\.|\[::1\])/.test(location.hostname)) {
    try {
      const info = await (await fetch('/api/info')).json();
      if (info.addresses?.length) origin = `${location.protocol}//${info.addresses[0]}:${location.port || info.port}`;
    } catch {}
  }
  joinUrl = `${origin}/play.html?code=${S.code}`;
  if (S.phase === 'lobby') render();
}

// ---------- synchronisation des téléphones et du buzzer ----------

let buzzOpenKey = null;

function sync() {
  if (S.phase !== 'setup') {
    for (const t of activeTeams()) {
      const view = viewFor(t.id);
      const json = JSON.stringify(view);
      if (lastViews[t.id] !== json) {
        lastViews[t.id] = json;
        const phoneView = view && view.deadline ? { ...view, deadline: undefined, remaining: view.deadline - Date.now() } : view;
        hostSend({ t: 'view', team: t.id, view: phoneView });
      }
    }
    // le buzzer est ouvert seulement à l'étape « open » d'une manche à buzzer
    const R = S.R;
    const want = S.phase === 'play' && R && R.step === 'open' && !S.paused ? R.qid : null;
    if (want && buzzOpenKey !== want) {
      buzzOpenKey = want;
      hostSend({ t: 'buzz:open', qid: R.qid, mode: R.twist?.id === 'dernier' ? 'last' : 'first', eligible: activeTeams().map((t) => t.id).filter((id) => !R.excluded.includes(id)) });
    } else if (!want && buzzOpenKey) {
      buzzOpenKey = null;
      hostSend({ t: 'buzz:close' });
    }
  }
  store.set(SAVE_KEY, S);
  render();
}

function viewFor(teamId) {
  const R = S.R;
  const team = teamById(teamId);
  if (S.paused) return { screen: 'wait', title: 'Pause ☕', text: 'La partie reprend bientôt.' };
  if (S.phase === 'lobby') return { screen: 'wait', title: `Bienvenue, ${team.name} !`, text: 'La partie va commencer. Regardez l’écran.' };
  if (S.phase === 'round-intro') {
    const info = C.ROUNDS[roundType()];
    return { screen: 'wait', title: info.title, text: info.rules };
  }
  if (S.phase === 'podium') {
    const rank = rankOf(team);
    return { screen: 'wait', title: rank === 1 ? '🏆 Victoire !' : `${rank}ᵉ place`, text: `${team.score} point${Math.abs(team.score) > 1 ? 's' : ''}` };
  }
  if (S.phase !== 'play' || !R) return { screen: 'wait', title: 'Regardez l’écran' };

  const banner = R.twist && R.step !== 'twist' ? `${R.twist.title} — ${R.twist.text}` : undefined;
  if (R.step === 'twist') return { screen: 'wait', title: `🌀 ${R.twist.title}`, text: R.twist.text };

  switch (R.type) {
    case 'nuggets':
    case 'addition':
    case 'burger':
      if (R.step === 'reveal') return { screen: 'wait', title: 'Réponse', text: R.item.a };
      return { screen: 'buzz', qid: R.qid, banner };

    case 'selpoivre':
      if (R.step === 'read') return { screen: 'wait', title: 'Lisez bien…', banner };
      if (R.step === 'choose' || R.step === 'locked')
        return {
          screen: 'choice', qid: R.qid, banner, prompt: 'Vrai ou faux ?', deadline: R.deadline || undefined, chosen: R.choices[teamId] ?? null, locked: R.step === 'locked',
          options: [
            { value: 'sel', label: 'Sel', emoji: '🧂', bg: '#f4f1ea', ink: '#222' },
            { value: 'poivre', label: 'Poivre', emoji: '🌶️', bg: '#2b2b2b', ink: '#fff' },
          ],
        };
      if (R.step === 'reveal') {
        const ok = R.choices[teamId] === (R.item.sel ? 'sel' : 'poivre');
        return { screen: 'wait', title: R.item.sel ? '🧂 Sel !' : '🌶️ Poivre !', text: ok ? 'Bien joué !' : R.choices[teamId] ? 'Raté…' : 'Pas de réponse' };
      }
      break;

    case 'menus': {
      const active = R.order[R.ti];
      const activeName = teamById(active).name;
      if (R.step === 'pick') {
        if (teamId !== active) return { screen: 'wait', title: `${activeName} choisit son menu` };
        return { screen: 'choice', qid: R.qid, prompt: 'Choisissez votre menu', chosen: null, options: R.offered.map((i) => ({ value: String(i), label: C.MENUS[i].theme, bg: '#ffb703', ink: '#2b1d00' })) };
      }
      const theme = C.MENUS[R.theme].theme;
      if (teamId === active) {
        if (R.step === 'reveal') return { screen: 'wait', title: R.lastOk ? 'Bonne réponse !' : 'Raté…', text: R.item.a };
        if (R.step === 'summary') return { screen: 'wait', title: `Menu terminé : ${R.correct}/3`, text: R.correct === 3 ? 'Bonus : +1 point !' : '' };
        return { screen: 'wait', title: theme, text: 'Répondez à voix haute', banner };
      }
      return { screen: 'wait', title: `Menu « ${theme} »`, text: `${activeName} répond`, banner };
    }

    case 'pubs':
    case 'defis': {
      const active = R.order[R.ti];
      const activeName = teamById(active).name;
      if (R.step === 'vote') {
        if (teamId === active) return { screen: 'wait', title: 'Les autres votent…' };
        const options =
          R.type === 'pubs'
            ? [
                { value: 'yes', label: 'Convaincu', emoji: '🤩', bg: '#3fa34d', ink: '#fff' },
                { value: 'no', label: 'Pas convaincu', emoji: '🙄', bg: '#7a1f1f', ink: '#fff' },
              ]
            : [
                { value: 'yes', label: 'Oui', emoji: '👍', bg: '#3fa34d', ink: '#fff' },
                { value: 'no', label: 'Non', emoji: '👎', bg: '#7a1f1f', ink: '#fff' },
              ];
        const prompt = R.type === 'pubs' ? 'Est-ce que cette pub vous donne envie d’acheter ?' : R.defiVote;
        return { screen: 'choice', qid: R.qid, prompt, chosen: R.votes[teamId] ?? null, options };
      }
      if (R.step === 'result') return { screen: 'wait', title: R.points > 0 ? `${activeName} : +${R.points}` : `${activeName} : 0 point`, text: R.resultText };
      if (R.type === 'pubs') {
        if (teamId === active) {
          const what = R.step === 'prep' ? 'Concertation !' : R.step === 'show' ? 'Action ! Jouez votre pub' : 'Votre produit';
          return { screen: 'wait', title: what, text: R.product, deadline: R.deadline || undefined };
        }
        return { screen: 'wait', title: `Pub de ${activeName}`, text: R.product, deadline: R.deadline || undefined };
      }
      const title = teamId === active ? `Défi : ${R.defiTitle}` : `${activeName} : ${R.defiTitle}`;
      return { screen: 'wait', title, text: R.show || R.defiRules, deadline: R.deadline || undefined };
    }
  }
  return { screen: 'wait', title: 'Regardez l’écran' };
}

// ---------- déroulé ----------

function startGame() {
  for (const t of S.teams) t.score = 0;
  S.ri = 0;
  S.swapUsed = false;
  S.R = null;
  S.phase = S.mode === 'net' ? 'lobby' : 'round-intro';
  if (S.phase === 'round-intro') introRound();
  connect();
  hostSend({ t: 'teams', teams: activeTeams() });
  sync();
}

function introRound() {
  S.phase = 'round-intro';
  S.R = null;
  clearSecrets();
  const type = roundType();
  play(type === 'burger' ? 'burger' : 'round');
  say(`manche:${type}`, `${C.ROUNDS[type].title}. ${C.ROUNDS[type].rules}`);
}

function startRound() {
  const type = roundType();
  S.phase = 'play';
  const order = activeTeams().map((t) => t.id);
  switch (type) {
    case 'nuggets':
      S.R = { type, items: pickFresh('nuggets', C.NUGGETS.length, Math.min(C.ROUNDS.nuggets.count, C.NUGGETS.length)).map((i) => C.NUGGETS[i]), qi: 0 };
      break;
    case 'addition':
      S.R = { type, items: pickFresh('addition', C.ADDITIONS.length, Math.min(C.ROUNDS.addition.count, C.ADDITIONS.length)).map((i) => C.ADDITIONS[i]), qi: 0 };
      break;
    case 'burger':
      S.R = { type, items: pickFresh('burger', C.BURGERS.length, Math.min(C.ROUNDS.burger.count, C.BURGERS.length)).map((i) => C.BURGERS[i]), qi: 0 };
      break;
    case 'selpoivre':
      S.R = { type, items: pickFresh('selpoivre', C.SEL_POIVRE.length, Math.min(C.ROUNDS.selpoivre.count, C.SEL_POIVRE.length)).map((i) => C.SEL_POIVRE[i]), qi: 0 };
      break;
    case 'menus': {
      // la moins bien classée commence ; égalité tirée au sort
      const byScore = shuffle(activeTeams()).sort((a, b) => a.score - b.score).map((t) => t.id);
      S.R = { type, order: byScore, ti: 0, usedThemes: [] };
      return startMenuTeam();
    }
    case 'pubs':
      S.R = { type, order, ti: 0, products: pickFresh('pubs', C.PRODUCTS.length, order.length).map((i) => C.PRODUCTS[i]) };
      return startPerformer();
    case 'defis':
      S.R = { type, order, ti: 0, defis: pickFresh('defis', C.DEFIS.length, order.length) };
      return startPerformer();
  }
  startItem();
}

function endRound() {
  S.ri++;
  clearSecrets();
  if (S.ri >= S.settings.rounds.length) {
    S.phase = 'podium';
    S.R = null;
    play('fanfare');
    const w = ranking()[0];
    setTimeout(() => play(w.animal), 2400);
    say('podium', `Et l’équipe gagnante est… ${w.name} !`);
  } else introRound();
  sync();
}

function ranking() {
  return [...activeTeams()].sort((a, b) => b.score - a.score);
}

// les ex aequo partagent la même place
function rankOf(team) {
  return 1 + activeTeams().filter((t) => t.score > team.score).length;
}

// ---------- règles bizarres ----------

function maybeTwist(type) {
  if (Math.random() >= S.settings.twistRate) return null;
  const pool = C.TWISTS.filter((t) => t.rounds.includes(type) && !(t.id === 'echange' && (S.swapUsed || activeTeams().length < 2)));
  const weights = pool.map((t) => (t.rare ? 0.25 : 1));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  let tw = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) if ((r -= weights[i]) < 0) { tw = pool[i]; break; }
  if (!tw) return null;
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
  return { id: tw.id, title: tw.title, text: tw.text.replace('{accent}', pickOne(C.ACCENTS)).replace('{who}', pickOne(C.SPOKESPERSON)) };
}

const mult = () => (S.R?.twist?.id === 'triple' ? 3 : 1);

function addScore(teamId, delta) {
  const t = teamById(teamId);
  if (!t || !delta) return;
  t.score += delta;
  bumped[teamId] = Date.now();
}

// « Vol de points » : 1 point pris à l'équipe en tête (si ce n'est pas l'équipe qui a répondu)
function applySteal(teamId) {
  if (S.R?.twist?.id !== 'vol') return;
  const top = Math.max(...activeTeams().map((t) => t.score));
  const leaders = activeTeams().filter((t) => t.score === top);
  if (leaders.some((t) => t.id === teamId)) return;
  addScore(leaders[0].id, -1);
  addScore(teamId, 1);
  S.R.stealInfo = `${teamById(teamId).name} vole 1 point à ${leaders[0].name} !`;
}

function applySwap() {
  const R = S.R;
  if (R.twist?.id !== 'echange' || R.swapInfo) return;
  const [a, b] = shuffle(activeTeams());
  [a.score, b.score] = [b.score, a.score];
  bumped[a.id] = bumped[b.id] = Date.now();
  S.swapUsed = true;
  R.swapInfo = `${a.name} ⇄ ${b.name} : les scores sont échangés !`;
  play('twist');
}

function laugh(teamId) {
  const R = S.R;
  if (!R || R.twist?.id !== 'rire' || R.laughed.includes(teamId)) return;
  R.laughed.push(teamId);
  addScore(teamId, -1);
  play('bad');
  sync();
}

// ---------- questions (manches à buzzer, Sel ou Poivre) ----------

function readDelayMs(text) {
  return Math.max(1500, Math.min(6000, text.length * 55));
}

function startItem() {
  const R = S.R;
  R.item = R.items[R.qi];
  R.winner = null;
  R.excluded = [];
  R.laughed = [];
  R.choices = {};
  R.stealInfo = null;
  R.swapInfo = null;
  R.lastOk = null;
  R.deadline = 0;
  R.twist = maybeTwist(R.type);
  if (R.twist) {
    R.step = 'twist';
    play('twist');
    say(`regle:${R.twist.id}`, `Règle bizarre ! ${R.twist.title}. ${R.twist.text}`);
  } else beginRead();
  sync();
}

function beginRead() {
  const R = S.R;
  R.qid = newQid();
  R.step = 'read';
  const text = R.type === 'addition' ? R.item.words.join(', ') : R.item.q;
  R.readUntil = Date.now() + (S.settings.buzzDuringRead && R.type !== 'selpoivre' ? 0 : readDelayMs(text));
  say(`q:${R.type}:${R.qi}`, text);
}

// appelé par l'horloge quand le temps de lecture est passé
function endRead() {
  const R = S.R;
  R.readUntil = 0;
  if (R.type === 'selpoivre') {
    R.step = 'choose';
    R.deadline = S.settings.selTimer ? Date.now() + 15000 : 0;
  } else {
    R.step = 'open';
  }
  sync();
}

function onBuzz(teamId, qid) {
  const R = S.R;
  if (!R || qid !== R.qid || R.step !== 'open') return;
  buzzOpenKey = null; // le hub a déjà fermé le buzzer
  R.winner = teamId;
  R.step = 'answer';
  play(teamById(teamId).animal);
  sync();
}

function judgeBuzz(ok) {
  const R = S.R;
  const base = R.type === 'nuggets' ? 1 : 2;
  R.lastOk = ok;
  if (ok) {
    addScore(R.winner, base * mult());
    applySteal(R.winner);
    play('good');
    reveal();
    return;
  }
  play('bad');
  if (R.type === 'burger') {
    addScore(R.winner, -1 * mult());
    R.excluded.push(R.winner);
    const left = activeTeams().filter((t) => !R.excluded.includes(t.id));
    if (left.length) {
      // les autres équipes peuvent tenter leur chance
      R.winner = null;
      R.qid = newQid();
      R.step = 'open';
      sync();
      return;
    }
  }
  reveal();
}

function nobody() {
  S.R.lastOk = null;
  S.R.winner = null;
  reveal();
}

function reveal() {
  const R = S.R;
  R.step = 'reveal';
  R.deadline = 0;
  if (R.type === 'selpoivre') {
    const good = R.item.sel ? 'sel' : 'poivre';
    for (const t of activeTeams()) if (R.choices[t.id] === good) addScore(t.id, 1 * mult());
    play('reveal');
  }
  applySwap();
  say(`r:${R.type}:${R.qi}`, R.type === 'selpoivre' ? (R.item.sel ? 'Sel !' : 'Poivre !') + ' ' + R.item.why : R.item.a);
  sync();
}

function nextItem() {
  const R = S.R;
  R.qi++;
  if (R.qi >= R.items.length) endRound();
  else startItem();
}

function onAction(teamId, qid, value) {
  const R = S.R;
  if (!R || qid !== R.qid) return;
  if (R.type === 'selpoivre' && R.step === 'choose' && !R.choices[teamId] && (value === 'sel' || value === 'poivre')) {
    R.choices[teamId] = value;
    play('pop');
    if (activeTeams().every((t) => R.choices[t.id])) reveal();
    else sync();
    return;
  }
  if (R.type === 'menus' && R.step === 'pick' && teamId === R.order[R.ti] && R.offered.includes(Number(value))) {
    chooseMenu(Number(value));
    return;
  }
  if ((R.type === 'pubs' || R.type === 'defis') && R.step === 'vote' && teamId !== R.order[R.ti] && !R.votes[teamId] && (value === 'yes' || value === 'no')) {
    R.votes[teamId] = value;
    play('pop');
    if (voters().every((id) => R.votes[id])) closeVote();
    else sync();
  }
}

// ---------- Menus ----------

function startMenuTeam() {
  const R = S.R;
  const all = C.MENUS.map((_, i) => i);
  const free = all.filter((i) => !R.usedThemes.includes(i));
  // avec beaucoup d'équipes, les thèmes déjà joués reviennent en complément
  R.offered = [...shuffle(free), ...shuffle(all.filter((i) => !free.includes(i)))].slice(0, 3);
  R.step = 'pick';
  R.qid = newQid();
  R.twist = null;
  R.theme = null;
  say('menus:choix', `${teamById(R.order[R.ti]).name}, choisissez votre menu.`);
  sync();
}

function chooseMenu(i) {
  const R = S.R;
  R.theme = i;
  R.usedThemes.push(i);
  R.qi = 0;
  R.correct = 0;
  play('pop');
  startMenuQuestion();
}

function startMenuQuestion() {
  const R = S.R;
  R.item = C.MENUS[R.theme].qs[R.qi];
  R.laughed = [];
  R.stealInfo = null;
  R.swapInfo = null;
  R.lastOk = null;
  R.qid = newQid();
  R.twist = maybeTwist('menus');
  if (R.twist) {
    R.step = 'twist';
    play('twist');
  } else {
    R.step = 'judge';
    say(`menus:${R.theme}:${R.qi}`, R.item.q);
  }
  sync();
}

function judgeMenu(ok) {
  const R = S.R;
  R.lastOk = ok;
  if (ok) {
    R.correct++;
    addScore(R.order[R.ti], 1 * mult());
    applySteal(R.order[R.ti]);
    play('good');
  } else play('bad');
  R.step = 'reveal';
  applySwap();
  sync();
}

function nextMenuQuestion() {
  const R = S.R;
  R.qi++;
  if (R.qi < 3) return startMenuQuestion();
  R.step = 'summary';
  R.twist = null;
  if (R.correct === 3) {
    addScore(R.order[R.ti], 1);
    play('fanfare');
  }
  sync();
}

function nextMenuTeam() {
  const R = S.R;
  R.ti++;
  if (R.ti >= R.order.length) endRound();
  else startMenuTeam();
}

// ---------- Fausses pubs et Défis ----------

function voters() {
  return S.R.order.filter((id) => id !== S.R.order[S.R.ti]);
}

function startPerformer() {
  const R = S.R;
  const team = R.order[R.ti];
  R.step = 'draw';
  R.votes = {};
  R.deadline = 0;
  R.points = 0;
  R.resultText = '';
  R.bonus = false;
  R.qid = newQid();
  clearSecrets();
  if (R.type === 'pubs') {
    R.product = R.products[R.ti] || C.PRODUCTS[Math.floor(Math.random() * C.PRODUCTS.length)];
    say('pubs:produit', `${teamById(team).name}, votre produit : ${R.product}`);
  } else {
    const d = C.DEFIS[R.defis[R.ti] ?? Math.floor(Math.random() * C.DEFIS.length)];
    const made = d.make();
    R.defi = { id: d.id, secret: d.secret };
    R.defiTitle = d.title;
    R.defiRules = d.rules;
    R.defiVote = d.vote;
    R.defiSeconds = d.seconds;
    R.show = made.show || null;
    R.revealText = made.reveal || null;
    if (made.secret) {
      localSecrets[team] = made.secret;
      hostSend({ t: 'secret', team, target: d.secret, payload: made.secret });
    }
    say(`defi:${d.id}`, `${teamById(team).name} : défi ${d.title}. ${d.rules}`);
  }
  play('round');
  sync();
}

function startTimer(step, seconds) {
  const R = S.R;
  R.step = step;
  R.deadline = Date.now() + seconds * 1000;
  play('pop');
  sync();
}

function onTimeout() {
  const R = S.R;
  R.deadline = 0;
  play('timeup');
  if (R.type === 'selpoivre' && R.step === 'choose') {
    R.step = 'locked';
    reveal();
    return;
  }
  if (R.type === 'pubs' && R.step === 'prep') R.step = 'ready';
  else if ((R.type === 'pubs' && R.step === 'show') || (R.type === 'defis' && R.step === 'run')) return openVote();
  sync();
}

function openVote() {
  const R = S.R;
  R.deadline = 0;
  R.step = 'vote';
  R.qid = newQid();
  R.votes = {};
  sync();
}

function closeVote(forced) {
  const R = S.R;
  const team = R.order[R.ti];
  const v = voters();
  const yes = v.filter((id) => R.votes[id] === 'yes').length;
  const cast = v.filter((id) => R.votes[id]).length;
  if (forced === true) R.points = 2;
  else if (forced === false) R.points = 0;
  else if (R.type === 'pubs') {
    // majorité « Convaincu » : +2 ; égalité (3 équipes) : +1
    R.points = cast === 0 ? 0 : yes * 2 > cast ? 2 : yes * 2 === cast ? 1 : 0;
  } else {
    R.points = cast && yes * 2 >= cast ? 2 : 0;
  }
  if (R.type === 'pubs') R.resultText = forced == null ? `${yes} vote${yes > 1 ? 's' : ''} « Convaincu » sur ${cast}` : '';
  else R.resultText = R.points ? 'Défi réussi !' : 'Défi raté…';
  addScore(team, R.points);
  R.step = 'result';
  clearSecrets();
  play(R.points ? 'good' : 'bad');
  sync();
}

function bonusLaugh() {
  const R = S.R;
  if (R.bonus) return;
  R.bonus = true;
  addScore(R.order[R.ti], 1);
  play('good');
  sync();
}

function nextPerformer() {
  const R = S.R;
  R.ti++;
  if (R.ti >= R.order.length) endRound();
  else startPerformer();
}

function clearSecrets() {
  const had = Object.keys(localSecrets).length;
  for (const k of Object.keys(localSecrets)) delete localSecrets[k];
  if (had) hostSend({ t: 'secret:clear' });
}

// ---------- pause ----------

function togglePause() {
  if (S.phase === 'setup') return;
  if (!S.paused) {
    S.paused = true;
    S.pausedAt = Date.now();
    stopVoice();
  } else {
    const d = Date.now() - S.pausedAt;
    S.paused = false;
    if (S.R) {
      if (S.R.deadline) S.R.deadline += d;
      if (S.R.readUntil) S.R.readUntil += d;
    }
  }
  sync();
}

// ---------- horloge ----------

let lastTick = 0;
setInterval(() => {
  const R = S.R;
  updateTimers(document.body);
  if (S.paused || S.phase !== 'play' || !R) return;
  const now = Date.now();
  if (R.step === 'read' && R.readUntil && now >= R.readUntil) endRead();
  if (R.deadline) {
    const left = Math.ceil((R.deadline - now) / 1000);
    if (left <= 5 && left > 0 && left !== lastTick) play('tick');
    lastTick = left;
    if (now >= R.deadline) onTimeout();
  }
}, 200);

// ---------- rendu ----------

let toastTimer = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

function render() {
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
}

function renderTop() {
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
    else if (R.order) progress = `Équipe ${R.ti + 1}/${R.order.length}`;
  }
  const dot = S.mode === 'net' ? `<span class="net-dot net-${connStatus}" title="Connexion au serveur"></span>` : '';
  el.innerHTML = `<div class="logo">🍔 <span class="logo-short">BQ</span></div>
    <div class="top-round">${info ? `<b>Manche ${S.ri + 1} · ${esc(info.title)}</b> ${progress ? `<span>${progress}</span>` : ''}` : ''}</div>
    <div class="top-tools">
      ${S.mode === 'net' && S.code ? `<span class="room-code">${dot}${esc(S.code)}</span>` : ''}
      <button class="tool" data-act="mute" title="Son">${isMuted() ? '🔇' : '🔊'}</button>
      <button class="tool" data-act="pause" title="Pause (touche P)"><svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg></button>
      <button class="tool" data-act="menu" title="Menu">☰</button>
    </div>`;
}

function renderScores() {
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
      const hot = R && (R.winner === t.id || (R.order && R.order[R.ti] === t.id && S.phase === 'play'));
      const out = R && R.excluded && R.excluded.includes(t.id);
      const n = deviceCounts[t.id] || 0;
      return `<div class="score-card ${hot ? 'hot' : ''} ${out ? 'out' : ''} ${now - (bumped[t.id] || 0) < 1500 ? 'bump' : ''}" style="--team:${t.color};--ink:${t.ink}">
        <div class="score-name"><span class="score-emoji">${a.emoji}</span>${esc(t.name)}</div>
        <div class="score-pts">${t.score}</div>
        ${S.mode === 'net' ? `<div class="score-dev" title="Téléphones connectés">📱 ${n}</div>` : ''}
        ${S.adjust ? `<div class="score-adj"><button data-act="adj" data-team="${t.id}" data-d="-1">−1</button><button data-act="adj" data-team="${t.id}" data-d="1">+1</button></div>` : ''}
      </div>`;
    })
    .join('');
}

function renderPanels() {
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
      buzz: buzzState,
      secret: localSecrets[t.id] || null,
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
function stage(html, controls = '') {
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

const btn = (act, label, cls = '', extra = '') => `<button class="btn ${cls}" data-act="${act}" ${extra}>${label}</button>`;

function renderSetup() {
  const st = S.settings;
  const resume = resumePrompt
    ? `<div class="resume card">Une partie est en cours (${esc(C.ROUNDS[saved.settings.rounds[saved.ri]]?.title || 'podium')}).
        ${btn('resume', 'Reprendre la partie', 'btn-primary')} ${btn('discard', 'Ignorer', 'btn-ghost')}</div>`
    : '';
  const teamsHtml = S.teams
    .slice(0, st.nTeams)
    .map(
      (t, i) => `<div class="setup-team" style="--team:${t.color};--ink:${t.ink}">
        <input class="team-name" data-team-name="${i}" value="${esc(t.name)}" maxlength="16" aria-label="Nom de l’équipe ${i + 1}">
        <div class="animal-grid">${C.ANIMALS.map((a) => {
          const taken = S.teams.slice(0, st.nTeams).some((o, j) => j !== i && o.animal === a.id);
          return `<button class="animal ${t.animal === a.id ? 'on' : ''}" data-act="animal" data-team="${i}" data-animal="${a.id}" ${taken ? 'disabled' : ''} title="${a.label}">${a.emoji}</button>`;
        }).join('')}</div>
        <div class="animal-label">${animalOf(t).label}</div>
      </div>`,
    )
    .join('');
  const rounds = C.ROUND_ORDER.map((r) => `<label class="chk"><input type="checkbox" data-round="${r}" ${st.rounds.includes(r) ? 'checked' : ''}> ${C.ROUNDS[r].title}</label>`).join('');
  stage(
    `<div class="setup">
      ${resume}
      <h1 class="title-xl">Burger Quiz <span>maison</span></h1>
      <div class="card">
        <h2>Comment jouez-vous ?</h2>
        <div class="seg">
          <button class="${S.mode === 'net' ? 'on' : ''}" data-act="mode" data-v="net">📱 Avec les téléphones<small>chaque équipe a son buzzer</small></button>
          <button class="${S.mode === 'local' ? 'on' : ''}" data-act="mode" data-v="local">📺 Tablette unique<small>tout sur cet écran</small></button>
        </div>
      </div>
      <div class="card">
        <h2>Équipes</h2>
        <div class="seg-num" role="group" aria-label="Nombre d’équipes">
          ${Array.from({ length: C.MAX_TEAMS - 1 }, (_, i) => i + 2).map((n) => `<button class="${st.nTeams === n ? 'on' : ''}" data-act="nteams" data-v="${n}">${n}</button>`).join('')}
          <span>équipes</span>
        </div>
        <div class="setup-teams">${teamsHtml}</div>
      </div>
      <div class="card">
        <h2>Manches</h2>
        <div class="chks">${rounds}</div>
        <h2>Réglages</h2>
        <div class="opts">
          <label>Règles bizarres
            <select data-set="twistRate">
              ${[[0, 'Jamais'], [0.2, '1 question sur 5'], [0.33, '1 question sur 3']].map(([v, l]) => `<option value="${v}" ${Math.abs(st.twistRate - v) < 0.01 ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
          <label class="chk"><input type="checkbox" data-set="selTimer" ${st.selTimer ? 'checked' : ''}> Chrono de 15 s pour Sel ou Poivre</label>
          <label class="chk"><input type="checkbox" data-set="buzzDuringRead" ${st.buzzDuringRead ? 'checked' : ''}> Buzzer autorisé pendant la lecture</label>
        </div>
      </div>
    </div>`,
    btn('create', S.mode === 'net' ? 'Créer la salle 🍔' : 'Lancer la partie 🍔', 'btn-primary btn-big', st.rounds.length ? '' : 'disabled'),
  );
}

function renderLobby() {
  const qr = joinUrl ? `<img class="qr" src="/qr.svg?text=${encodeURIComponent(joinUrl)}" alt="QR code pour rejoindre">` : '<div class="qr qr-wait">…</div>';
  const teams = activeTeams()
    .map((t) => {
      const n = deviceCounts[t.id] || 0;
      return `<div class="lobby-team ${n ? 'ready' : ''}" style="--team:${t.color};--ink:${t.ink}">${animalOf(t).emoji} ${esc(t.name)}<span>${n ? `📱 ${n} connecté${n > 1 ? 's' : ''}` : 'en attente…'}</span></div>`;
    })
    .join('');
  stage(
    `<div class="lobby">
      <div class="lobby-qr">${qr}</div>
      <div class="lobby-info">
        <div class="lobby-step">Scannez le QR code avec un téléphone par équipe</div>
        <div class="lobby-code-label">ou ouvrez <b>${esc(joinUrl.replace(/\?.*/, '') || '…')}</b> et tapez le code</div>
        <div class="lobby-code">${esc(S.code || '····')}</div>
        <div class="lobby-teams">${teams}</div>
        <p class="hint">Plusieurs téléphones par équipe ? Pas de souci, ils buzzent tous pour leur équipe.</p>
      </div>
    </div>`,
    `${btn('test-sounds', '🔊 Tester les cris', 'btn-ghost')} ${btn('begin', 'Lancer la partie !', 'btn-primary btn-big')}`,
  );
}

function renderRoundIntro() {
  const type = roundType();
  const info = C.ROUNDS[type];
  stage(
    `<div class="round-intro ${type}">
      <div class="round-num">Manche ${S.ri + 1}${S.ri === S.settings.rounds.length - 1 && type === 'burger' ? ' · finale' : ''}</div>
      <div class="round-title">${esc(info.title)}</div>
      <div class="round-sub">${esc(info.subtitle)}</div>
      <div class="round-rules">${esc(info.rules)}</div>
    </div>`,
    btn('start-round', 'C’est parti !', 'btn-primary btn-big'),
  );
}

function twistCard(R) {
  return `<div class="twist-card"><div class="twist-kicker">🌀 Règle bizarre</div><div class="twist-title">${esc(R.twist.title)}</div><div class="twist-text">${esc(R.twist.text)}</div></div>`;
}

function twistBanner(R) {
  if (!R.twist || R.step === 'twist') return '';
  return `<div class="twist-banner">🌀 <b>${esc(R.twist.title)}</b> ${esc(R.twist.text)}</div>`;
}

function laughButtons(R) {
  if (R.twist?.id !== 'rire' || R.step === 'twist') return '';
  return activeTeams()
    .map((t) => btn('laugh', `😂 ${esc(t.name)} a ri (−1)`, 'btn-small', `data-team="${t.id}" ${R.laughed.includes(t.id) ? 'disabled' : ''}`))
    .join(' ');
}

function extraInfo(R) {
  return [R.stealInfo, R.swapInfo].filter(Boolean).map((s) => `<div class="info-pop">${esc(s)}</div>`).join('');
}

function renderPlay() {
  const R = S.R;
  if (!R) return stage('');
  if (R.step === 'twist') {
    const next = R.type === 'menus' ? 'twist-ok-menu' : 'twist-ok';
    return stage(twistCard(R), btn(next, 'Compris !', 'btn-primary btn-big'));
  }
  switch (R.type) {
    case 'nuggets':
    case 'addition':
    case 'burger':
      return renderBuzzRound(R);
    case 'selpoivre':
      return renderSelPoivre(R);
    case 'menus':
      return renderMenus(R);
    case 'pubs':
    case 'defis':
      return renderPerform(R);
  }
}

function questionBody(R) {
  if (R.type === 'addition') return `<div class="addition">${R.item.words.map((w) => `<span class="word">${esc(w)}</span>`).join('<span class="plus">+</span>')}<span class="plus">=</span><span class="word word-q">?</span></div>`;
  return `<div class="question">${esc(R.item.q)}</div>`;
}

function renderBuzzRound(R) {
  const pts = (R.type === 'nuggets' ? 1 : 2) * mult();
  const ptsLabel = R.type === 'burger' ? `+${pts} / −${mult()}` : `+${pts}`;
  let status = '';
  let controls = '';
  if (R.step === 'read') {
    const total = readDelayMs(R.type === 'addition' ? R.item.words.join(' ') : R.item.q);
    status = `<div class="status">Lisez bien… <div class="readbar"><i style="animation-duration:${Math.max(0, R.readUntil - Date.now())}ms;--from:${1 - Math.max(0, R.readUntil - Date.now()) / total}"></i></div></div>`;
    controls = btn('open-now', 'Ouvrir les buzzers', 'btn-ghost') + ' ' + btn('nobody', 'Personne ne sait', 'btn-ghost');
  } else if (R.step === 'open') {
    const ex = R.excluded.map((id) => teamById(id).name).join(', ');
    status = `<div class="status status-open">${R.twist?.id === 'dernier' ? 'Buzzez tous… le DERNIER répond !' : 'À vos buzzers !'}${ex ? `<small>Hors jeu : ${esc(ex)}</small>` : ''}</div>`;
    controls = (R.twist?.id === 'dernier' ? btn('close-buzz', 'Clore les buzz', 'btn-ghost') + ' ' : '') + btn('nobody', 'Personne ne sait', 'btn-ghost');
  } else if (R.step === 'answer') {
    const t = teamById(R.winner);
    status = `<div class="buzzed" style="--team:${t.color};--ink:${t.ink}"><span class="buzzed-emoji">${animalOf(t).emoji}</span>${esc(t.name)}</div>`;
    controls = `<span class="ctl-label">Leur réponse est…</span> ${btn('right', '✔ Juste', 'btn-good btn-big')} ${btn('wrong', '✘ Fausse', 'btn-bad btn-big')}`;
  } else if (R.step === 'reveal') {
    const who = R.lastOk && R.winner ? `<div class="verdict good">${esc(teamById(R.winner).name)} marque ${ptsLabel.split(' ')[0]} !</div>` : R.lastOk === false ? '<div class="verdict bad">Raté !</div>' : '';
    status = `<div class="answer"><small>Réponse</small>${esc(R.item.a)}</div>${who}${extraInfo(R)}`;
    controls = btn('next', R.qi + 1 >= R.items.length ? 'Fin de la manche' : 'Question suivante', 'btn-primary btn-big');
  }
  stage(`${twistBanner(R)}<div class="q-points">${ptsLabel}</div>${questionBody(R)}${status}`, `${controls}<div class="laughs">${laughButtons(R)}</div>`);
}

function renderSelPoivre(R) {
  let status = '';
  let controls = '';
  const teams = activeTeams();
  if (R.step === 'read') {
    status = '<div class="status">Lisez bien…</div>';
    controls = btn('open-now', 'Passer au choix', 'btn-ghost');
  } else if (R.step === 'choose' || R.step === 'locked') {
    status = `<div class="sp-legend"><span class="sel">🧂 Sel = vrai</span><span class="poivre">🌶️ Poivre = faux</span></div>
      ${R.deadline ? `<div class="big-timer" data-deadline="${R.deadline}"></div>` : ''}
      <div class="locks">${teams.map((t) => `<span class="lock ${R.choices[t.id] ? 'done' : ''}" style="--team:${t.color};--ink:${t.ink}">${esc(t.name)} ${R.choices[t.id] ? '🔒' : '…'}</span>`).join('')}</div>`;
    controls = btn('reveal', 'Révéler maintenant', 'btn-ghost');
  } else if (R.step === 'reveal') {
    const good = R.item.sel ? 'sel' : 'poivre';
    status = `<div class="answer sp-${good}">${R.item.sel ? '🧂 SEL' : '🌶️ POIVRE'}<small>${esc(R.item.why)}</small></div>
      <div class="locks">${teams.map((t) => {
        const c = R.choices[t.id];
        return `<span class="lock ${c === good ? 'win' : 'lose'}" style="--team:${t.color};--ink:${t.ink}">${esc(t.name)} : ${c ? (c === 'sel' ? '🧂' : '🌶️') : '—'} ${c === good ? `+${mult()}` : ''}</span>`;
      }).join('')}</div>${extraInfo(R)}`;
    controls = btn('next', R.qi + 1 >= R.items.length ? 'Fin de la manche' : 'Affirmation suivante', 'btn-primary btn-big');
  }
  stage(`${twistBanner(R)}<div class="question">${esc(R.item.q)}</div>${status}`, `${controls}<div class="laughs">${laughButtons(R)}</div>`);
}

function renderMenus(R) {
  const t = teamById(R.order[R.ti]);
  const head = `<div class="perf-team" style="--team:${t.color};--ink:${t.ink}">${animalOf(t).emoji} ${esc(t.name)}</div>`;
  if (R.step === 'pick') {
    return stage(
      `${head}<div class="question">Choisissez votre menu</div>
      <div class="menu-cards">${R.offered.map((i) => `<button class="menu-card" data-act="menu-pick" data-v="${i}">🍔<span>${esc(C.MENUS[i].theme)}</span></button>`).join('')}</div>`,
      '<span class="ctl-label">Choix sur le téléphone de l’équipe ou ici</span>',
    );
  }
  const theme = C.MENUS[R.theme].theme;
  const dots = [0, 1, 2].map((i) => `<span class="dot ${i < R.qi || (i === R.qi && R.step !== 'judge') ? 'done' : ''}">${i + 1}</span>`).join('');
  if (R.step === 'summary') {
    return stage(
      `${head}<div class="menu-theme">Menu « ${esc(theme)} »</div><div class="answer">${R.correct}/3${R.correct === 3 ? '<small>Menu complet : +1 bonus !</small>' : ''}</div>`,
      btn('menu-next-team', R.ti + 1 >= R.order.length ? 'Fin de la manche' : 'Équipe suivante', 'btn-primary btn-big'),
    );
  }
  let status = '';
  let controls = '';
  if (R.step === 'judge') controls = `<span class="ctl-label">Leur réponse est…</span> ${btn('menu-right', '✔ Juste', 'btn-good btn-big')} ${btn('menu-wrong', '✘ Fausse', 'btn-bad btn-big')}`;
  else {
    status = `<div class="answer"><small>Réponse</small>${esc(R.item.a)}</div><div class="verdict ${R.lastOk ? 'good' : 'bad'}">${R.lastOk ? `+${mult()} !` : 'Raté !'}</div>${extraInfo(R)}`;
    controls = btn('menu-next-q', R.qi + 1 >= 3 ? 'Voir le bilan' : 'Question suivante', 'btn-primary btn-big');
  }
  stage(`${twistBanner(R)}${head}<div class="menu-theme">Menu « ${esc(theme)} » <span class="dots">${dots}</span></div>${questionBody(R)}${status}`, `${controls}<div class="laughs">${laughButtons(R)}</div>`);
}

function renderPerform(R) {
  const t = teamById(R.order[R.ti]);
  const head = `<div class="perf-team" style="--team:${t.color};--ink:${t.ink}">${animalOf(t).emoji} ${esc(t.name)}</div>`;
  const timer = R.deadline ? `<div class="big-timer" data-deadline="${R.deadline}"></div>` : '';
  let body = '';
  let controls = '';
  if (R.type === 'pubs') {
    body = `<div class="menu-theme">Fausse pub</div><div class="product">${esc(R.product)}</div>`;
    if (R.step === 'draw') controls = btn('pub-prep', 'Lancer la concertation (30 s)', 'btn-primary btn-big');
    if (R.step === 'prep') body += `<div class="status">Concertation…</div>`, (controls = btn('pub-ready', 'On est prêts !', 'btn-ghost'));
    if (R.step === 'ready') body += `<div class="status">Prêts ?</div>`, (controls = btn('pub-show', 'Action ! (45 s)', 'btn-primary btn-big'));
    if (R.step === 'show') body += `<div class="status status-open">🎬 Action !</div>`, (controls = btn('end-perf', 'Fin de la pub', 'btn-ghost'));
  } else {
    body = `<div class="menu-theme">Défi</div><div class="product">${esc(R.defiTitle)}</div><div class="rules">${esc(R.defiRules)}</div>`;
    if (R.show) body += `<div class="defi-show">${esc(R.show).replace(/\n/g, '<br>')}</div>`;
    else if (R.defi.secret && R.step !== 'vote' && R.step !== 'result') body += `<div class="status">🤫 ${R.defi.secret === 'team' ? 'Le mot est sur les téléphones de l’équipe' : 'Un joueur a reçu une carte secrète sur son téléphone'}${S.mode === 'local' ? ' (ici : panneau de l’équipe, en bas)' : ''}</div>`;
    if (R.step === 'draw') controls = btn('defi-run', `Top chrono (${R.defiSeconds} s)`, 'btn-primary btn-big');
    if (R.step === 'run') controls = btn('end-perf', 'Terminé', 'btn-ghost');
  }
  if (R.step === 'vote') {
    const v = voters();
    const prompt = R.type === 'pubs' ? 'Est-ce que cette pub vous donne envie d’acheter ?' : R.defiVote;
    body += `${R.revealText ? `<div class="answer"><small>C’était</small>${esc(R.revealText)}</div>` : ''}
      <div class="status">🗳 ${esc(prompt)}</div>
      <div class="locks">${v.map((id) => { const o = teamById(id); return `<span class="lock ${R.votes[id] ? 'done' : ''}" style="--team:${o.color};--ink:${o.ink}">${esc(o.name)} ${R.votes[id] ? '🔒' : '…'}</span>`; }).join('')}</div>`;
    controls = btn('close-vote', 'Clore le vote', 'btn-ghost') + (R.type === 'defis' ? ` ${btn('force-ok', 'Réussi', 'btn-good')} ${btn('force-ko', 'Raté', 'btn-bad')}` : '');
  }
  if (R.step === 'result') {
    body += `<div class="answer">${R.points ? `+${R.points}` : '0'}<small>${esc(R.resultText)}</small></div>`;
    controls = (R.type === 'pubs' && activeTeams().length === 2 ? btn('bonus-laugh', '😂 +1 fou rire', 'btn-ghost', R.bonus ? 'disabled' : '') + ' ' : '') + btn('next-perf', R.ti + 1 >= R.order.length ? 'Fin de la manche' : 'Équipe suivante', 'btn-primary btn-big');
  }
  stage(`${head}${body}${timer}`, controls);
}

function renderPodium() {
  const r = ranking();
  const rest = r
    .slice(3)
    .map((t) => `<li style="--team:${t.color};--ink:${t.ink}"><b>${rankOf(t)}</b> ${animalOf(t).emoji} ${esc(t.name)}<span>${t.score} pt${Math.abs(t.score) > 1 ? 's' : ''}</span></li>`)
    .join('');
  const places = r
    .slice(0, 3)
    .map((t, i) => `<div class="podium-step p${i + 1}" style="--team:${t.color};--ink:${t.ink}"><div class="podium-emoji">${animalOf(t).emoji}</div><div class="podium-name">${esc(t.name)}</div><div class="podium-pts">${t.score} pt${Math.abs(t.score) > 1 ? 's' : ''}</div><div class="podium-block">${rankOf(t)}</div></div>`)
    .join('');
  const tie = r.length > 1 && r[0].score === r[1].score;
  stage(
    `<div class="podium-title">${tie ? 'Égalité au sommet !' : `🏆 ${esc(r[0].name)} gagne !`}</div><div class="podium">${places}</div>${rest ? `<ol class="podium-rest">${rest}</ol>` : ''}<div class="confetti">${'<i></i>'.repeat(40)}</div>`,
    `${btn('replay', 'Rejouer (mêmes équipes)', 'btn-primary btn-big')} ${btn('new-game', 'Nouvelle partie', 'btn-ghost')}`,
  );
}

function openMenu() {
  const m = $('menu');
  m.innerHTML = `<div class="menu-box">
    <h2>Menu</h2>
    ${btn('m-adjust', S.adjust ? 'Masquer la correction des scores' : 'Corriger les scores (±1)')}
    ${S.mode === 'net' ? btn('m-panels', S.showPanels ? 'Masquer les commandes à l’écran' : 'Commandes à l’écran (téléphone en panne)') : ''}
    ${S.phase === 'play' || S.phase === 'round-intro' ? btn('m-skip', 'Passer à la manche suivante') : ''}
    ${btn('m-end', 'Terminer la partie', 'btn-bad')}
    ${btn('m-close', 'Fermer', 'btn-primary')}
  </div>`;
  m.classList.add('show');
}

// ---------- interactions ----------

let audioOn = false;
function ensureAudio() {
  if (!audioOn) {
    unlockAudio();
    audioOn = true;
  }
}

document.addEventListener('click', (e) => {
  ensureAudio();
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const R = S.R;
  switch (act) {
    // réglages
    case 'mode':
      S.mode = el.dataset.v;
      return render();
    case 'nteams':
      S.settings.nTeams = Number(el.dataset.v);
      fixAnimals();
      return render();
    case 'animal': {
      const t = S.teams[Number(el.dataset.team)];
      t.animal = el.dataset.animal;
      play(t.animal);
      return render();
    }
    case 'resume':
      S = { ...freshState(), ...saved };
      resumePrompt = false;
      S.paused = false;
      S.adjust = false;
      connect();
      return sync();
    case 'discard':
      resumePrompt = false;
      return render();
    case 'create':
      return startGame();
    case 'test-sounds':
      activeTeams().forEach((t, i) => setTimeout(() => play(t.animal), i * 1700));
      return;
    case 'begin':
      introRound();
      return sync();
    case 'start-round':
      return startRound();
    // questions
    case 'twist-ok':
      beginRead();
      return sync();
    case 'twist-ok-menu':
      R.step = 'judge';
      return sync();
    case 'open-now':
      return endRead();
    case 'close-buzz':
      return hostSend({ t: 'buzz:close' });
    case 'nobody':
      return nobody();
    case 'right':
      return judgeBuzz(true);
    case 'wrong':
      return judgeBuzz(false);
    case 'reveal':
      if (R.step === 'choose') R.step = 'locked';
      return reveal();
    case 'next':
      return nextItem();
    case 'laugh':
      return laugh(el.dataset.team);
    // menus
    case 'menu-pick':
      return onAction(R.order[R.ti], R.qid, el.dataset.v);
    case 'menu-right':
      return judgeMenu(true);
    case 'menu-wrong':
      return judgeMenu(false);
    case 'menu-next-q':
      return nextMenuQuestion();
    case 'menu-next-team':
      return nextMenuTeam();
    // pubs et défis
    case 'pub-prep':
      return startTimer('prep', 30);
    case 'pub-ready':
      R.deadline = 0;
      R.step = 'ready';
      return sync();
    case 'pub-show':
      return startTimer('show', 45);
    case 'defi-run':
      return startTimer('run', R.defiSeconds);
    case 'end-perf':
      return openVote();
    case 'close-vote':
      return closeVote();
    case 'force-ok':
      return closeVote(true);
    case 'force-ko':
      return closeVote(false);
    case 'bonus-laugh':
      return bonusLaugh();
    case 'next-perf':
      return nextPerformer();
    // fin
    case 'replay':
      S.phase = 'setup';
      return startGame();
    case 'new-game':
      if (!confirm('Revenir à l’écran de création ?')) return;
      return newGame();
    // barre du haut et menu
    case 'mute':
      setMuted(!isMuted());
      return renderTop();
    case 'pause':
      return togglePause();
    case 'menu':
      return openMenu();
    case 'adj':
      addScore(el.dataset.team, Number(el.dataset.d));
      return sync();
    case 'm-adjust':
      S.adjust = !S.adjust;
      $('menu').classList.remove('show');
      return sync();
    case 'm-panels':
      S.showPanels = !S.showPanels;
      $('menu').classList.remove('show');
      return sync();
    case 'm-skip':
      $('menu').classList.remove('show');
      if (S.phase === 'round-intro') {
        S.phase = 'play';
      }
      return endRound();
    case 'm-end':
      $('menu').classList.remove('show');
      S.ri = S.settings.rounds.length - 1;
      return endRound();
    case 'm-close':
      return $('menu').classList.remove('show');
  }
});

// chaque équipe active garde un cri différent
function fixAnimals() {
  const used = new Set();
  for (const t of activeTeams()) {
    if (used.has(t.animal)) t.animal = C.ANIMALS.find((a) => !used.has(a.id)).id;
    used.add(t.animal);
  }
}

function newGame() {
  const keep = { settings: S.settings, teams: S.teams, mode: S.mode, code: S.code, hostToken: S.hostToken };
  S = { ...freshState(), ...keep };
  S.teams.forEach((t) => (t.score = 0));
  clearSecrets();
  sync();
}

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.teamName != null) {
    S.teams[Number(el.dataset.teamName)].name = el.value.trim() || C.TEAM_PRESETS[Number(el.dataset.teamName)].name;
    store.set(SAVE_KEY, S);
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.round) {
    const set = new Set(S.settings.rounds);
    el.checked ? set.add(el.dataset.round) : set.delete(el.dataset.round);
    S.settings.rounds = C.ROUND_ORDER.filter((r) => set.has(r));
    return render();
  }
  if (el.dataset.set === 'twistRate') S.settings.twistRate = Number(el.value);
  if (el.dataset.set === 'selTimer') S.settings.selTimer = el.checked;
  if (el.dataset.set === 'buzzDuringRead') S.settings.buzzDuringRead = el.checked;
});

// clavier : Espace = action principale, P = pause, 1/2/3 = buzzers en mode tablette
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  ensureAudio();
  if (e.key === 'p' || e.key === 'P') return togglePause();
  if (e.key === ' ' || e.key === 'Enter') {
    const primary = document.querySelector('#controls .btn-primary:not([disabled])');
    if (primary) {
      e.preventDefault();
      primary.click();
    }
    return;
  }
  const n = '1234567890'.indexOf(e.key) + 1;
  if (n >= 1 && n <= activeTeams().length && S.R && S.R.step === 'open' && (S.mode === 'local' || S.showPanels)) {
    hostSend({ t: 'act', team: activeTeams()[n - 1].id, kind: 'buzz', qid: S.R.qid });
  }
});

$('pause').addEventListener('click', () => S.paused && togglePause());
$('menu').addEventListener('click', (e) => e.target.id === 'menu' && $('menu').classList.remove('show'));

preloadSounds([...C.ANIMALS.map((a) => a.id), 'good', 'bad', 'twist', 'round', 'fanfare', 'burger', 'tick', 'timeup', 'reveal', 'pop']);
render();
