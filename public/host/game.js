// Déroulé de la partie : les règles du jeu.
// Chaque manche a son état dans S.R ; R.step indique l'étape en cours.
// Le détail des étapes de chaque manche est décrit dans docs/ARCHITECTURE.md.

import * as C from '../shared/content.js';
import { updateTimers } from '../shared/controls.js';
import { play } from '../shared/sounds.js';
import { prefetch, stopVoice, voiceEnabled } from '../shared/voice.js';
import { BAD, GOOD, LINES, pickOne } from '../shared/voicelines.js';
import { markSeen, orderFresh, pickDefi, pickFresh } from './memory.js';
import { S, activeTeams, addScore, freshState, lastTeams, len, menuQs, mult, newQid, ranking, roundType, rt, setState, shuffle, teamById, wrongCosts, wrongPasses, wrongRule } from './state.js';
import { clearSecrets, connect, giveSecret, hostSend, sync } from './transport.js';
import { answerParts, applyVoiceConfig, questionText, say, twistParts } from './voice.js';

// ---------- début de partie, manches, podium ----------

export function startGame() {
  for (const t of S.teams) t.score = 0;
  S.ri = 0;
  S.swapUsed = false;
  S.leader = null;
  S.performed = [];
  S.R = null;
  S.phase = S.mode === 'net' ? 'lobby' : 'round-intro';
  if (S.phase === 'round-intro') introRound();
  connect();
  applyVoiceConfig();
  prefetch([...Object.values(LINES), ...GOOD, ...BAD]);
  hostSend({ t: 'teams', teams: activeTeams() });
  if (S.mode === 'net') rt.net?.send({ t: 'remote:config', allow: !!S.settings.presenter });
  sync();
}

export function introRound() {
  S.phase = 'round-intro';
  S.R = null;
  clearSecrets();
  const type = roundType();
  play(type === 'burger' ? 'burger' : 'round');
  say([C.ROUNDS[type].title, C.ROUNDS[type].rules.replace('{n}', String(menuQs())), wrongRule(type)]);
}

export function startRound() {
  const type = roundType();
  S.phase = 'play';
  switch (type) {
    case 'nuggets':
      S.R = { type, items: pickFresh('nuggets', C.NUGGETS, len().nuggets), qi: 0 };
      break;
    case 'addition':
      S.R = { type, items: pickFresh('addition', C.ADDITIONS, len().addition), qi: 0 };
      break;
    case 'burger':
      S.R = { type, items: pickFresh('burger', C.BURGERS, len().burger), qi: 0 };
      break;
    case 'selpoivre':
      S.R = { type, items: pickFresh('selpoivre', C.SEL_POIVRE, len().selpoivre), qi: 0 };
      break;
    case 'menus': {
      // la moins bien classée commence ; égalité tirée au sort
      const byScore = shuffle(activeTeams()).sort((a, b) => a.score - b.score).map((t) => t.id);
      S.R = { type, order: byScore, ti: 0, usedThemes: [], nq: len().menuQs };
      return startMenuTeam();
    }
    case 'pubs': {
      const perf = pickPerformers();
      S.R = { type, order: perf, ti: 0, products: pickFresh('pubs', C.PRODUCTS, perf.length) };
      return startPubs();
    }
    case 'defis': {
      const perf = pickPerformers();
      S.R = { type, order: perf, ti: 0, defis: pickFresh('defis', C.DEFIS.map((d) => d.id), perf.length) };
      return startDefi();
    }
  }
  startItem();
}

export function endRound() {
  S.ri++;
  clearSecrets();
  if (S.ri >= S.settings.rounds.length) {
    S.phase = 'podium';
    S.R = null;
    play('fanfare');
    const w = ranking()[0];
    setTimeout(() => play(w.animal), 2400);
    say([LINES.winnerIs, w.name]);
  } else introRound();
  sync();
}

// ---------- règles bizarres ----------
// Tirée avant une question (probabilité settings.twistRate), valable pour cette
// seule question. Liste et manches concernées : C.TWISTS (shared/content.js).

function maybeTwist(type) {
  if (Math.random() >= S.settings.twistRate) return null;
  const last = lastTeams();
  const pool = C.TWISTS.filter(
    (t) =>
      t.rounds.includes(type) &&
      !(t.id === 'echange' && (S.swapUsed || activeTeams().length < 2)) &&
      !(t.catchup && (!S.settings.catchup || !last.length)),
  );
  const weights = pool.map((t) => (t.rare ? 0.25 : 1));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  let tw = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) if ((r -= weights[i]) < 0) { tw = pool[i]; break; }
  if (!tw) return null;
  const names = last.map((t) => t.name).join(' et ');
  const tw2 = { id: tw.id, title: tw.title, text: tw.text.replace('{accent}', pickOne(C.ACCENTS)).replace('{who}', pickOne(C.SPOKESPERSON)).replace('{last}', names) };
  if (tw.catchup) tw2.boost = last.map((t) => t.id);
  return tw2;
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
  rt.bumped[a.id] = rt.bumped[b.id] = Date.now();
  S.swapUsed = true;
  R.swapInfo = `${a.name} ⇄ ${b.name} : les scores sont échangés !`;
  play('twist');
}

export function laugh(teamId) {
  const R = S.R;
  if (!R || R.twist?.id !== 'rire' || R.laughed.includes(teamId)) return;
  R.laughed.push(teamId);
  addScore(teamId, -1);
  play('bad');
  sync();
}

// ---------- questions : Nuggets, L'Addition, Burger de la mort, Sel ou Poivre ----------
// Étapes (R.step) :
//   twist   → annonce d'une règle bizarre (bouton « Compris ! »)
//   read    → la question s'affiche ; R.readUntil = ouverture automatique
//   open    → buzzers ouverts (Sel ou Poivre : « choose », choix secret sur les téléphones)
//   answer  → une équipe a buzzé, on attend « Juste » / « Fausse » (chrono R.deadline)
//   suspense→ roulement de tambour (Sel ou Poivre, si le réglage est activé)
//   reveal  → réponse affichée, bouton « Question suivante »

export function readDelayMs(text) {
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
    say(twistParts(R.twist));
  } else beginRead();
  sync();
}

export function beginRead() {
  const R = S.R;
  R.qid = newQid();
  R.step = 'read';
  const text = questionText(R.item, R.type);
  const immediate = S.settings.buzzDuringRead && R.type !== 'selpoivre';
  R.voiceRead = voiceEnabled() && !immediate;
  // avec la voix : on attend la fin de la lecture (25 s maximum si la voix ne répond pas)
  R.readUntil = Date.now() + (immediate ? 0 : R.voiceRead ? 25000 : readDelayMs(text));
  const qid = R.qid;
  say([text]).then(() => {
    if (R.voiceRead && S.R === R && R.qid === qid && R.step === 'read' && !S.paused) endRead();
  });
  prefetch(answerParts(R));
}

// appelé par l'horloge quand le temps de lecture est passé
export function endRead() {
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

export function onBuzz(teamId, qid) {
  const R = S.R;
  if (!R || qid !== R.qid || R.step !== 'open') return;
  rt.buzzOpenKey = null; // le hub a déjà fermé le buzzer
  stopVoice();
  R.winner = teamId;
  R.step = 'answer';
  R.timeUp = false;
  R.deadline = answerDeadline();
  play(teamById(teamId).animal);
  sync();
}

const answerDeadline = () => (S.settings.answerTimer ? Date.now() + S.settings.answerTimer * 1000 : 0);

export function judgeBuzz(ok) {
  const R = S.R;
  const base = R.type === 'nuggets' ? 1 : 2;
  R.lastOk = ok;
  R.deadline = 0;
  R.timeUp = false;
  if (ok) {
    R.lastGain = addScore(R.winner, base * mult());
    applySteal(R.winner);
    play('good');
    reveal();
    return;
  }
  play('bad');
  // Burger de la mort : toujours −1 et la main passe ; Nuggets / Addition : selon le réglage
  const burger = R.type === 'burger';
  if (burger || wrongCosts()) addScore(R.winner, -1 * mult());
  if (burger || wrongPasses()) {
    R.excluded.push(R.winner);
    const left = activeTeams().filter((t) => !R.excluded.includes(t.id));
    if (left.length) {
      // les autres équipes peuvent tenter leur chance (un essai chacune)
      R.winner = null;
      R.qid = newQid();
      R.step = 'open';
      R.timeUp = false;
      say([pickOne(BAD), LINES.othersTurn]);
      sync();
      return;
    }
  }
  reveal();
}

// roulement de tambour avant une révélation (réglage « Suspense »)
function startSuspense(next) {
  const R = S.R;
  if (!S.settings.suspense) return runSuspenseNext(next);
  R.deadline = 0;
  R.step = 'suspense';
  R.suspenseUntil = Date.now() + 2200;
  R.suspenseNext = next;
  play('drumroll');
  say([R.type === 'selpoivre' ? LINES.suspenseSel : LINES.suspenseVote]);
  sync();
}

function runSuspenseNext(next) {
  if (next.act === 'reveal') reveal();
  else closeVote(next.forced);
}

export const revealWithSuspense = () => startSuspense({ act: 'reveal' });

export const voteWithSuspense = (forced) => startSuspense({ act: 'vote', forced });

export function nobody() {
  S.R.lastOk = null;
  S.R.winner = null;
  reveal();
}

export function reveal() {
  const R = S.R;
  R.step = 'reveal';
  R.deadline = 0;
  if (R.type === 'selpoivre') {
    const good = R.item.sel ? 'sel' : 'poivre';
    for (const t of activeTeams()) if (R.choices[t.id] === good) addScore(t.id, 1 * mult());
    play('reveal');
  }
  applySwap();
  const react = R.lastOk === true ? [pickOne(GOOD)] : R.lastOk === false ? [pickOne(BAD)] : [];
  say([...(R.type === 'selpoivre' ? [] : react), ...answerParts(R)]);
  const next = R.items?.[R.qi + 1];
  if (next) prefetch([questionText(next, R.type)]);
  sync();
}

export function nextItem() {
  const R = S.R;
  R.qi++;
  if (R.qi >= R.items.length) endRound();
  else startItem();
}

export function onAction(teamId, qid, value) {
  const R = S.R;
  if (!R || qid !== R.qid) return;
  if (R.type === 'selpoivre' && R.step === 'choose' && !R.choices[teamId] && (value === 'sel' || value === 'poivre')) {
    R.choices[teamId] = value;
    play('pop');
    if (activeTeams().every((t) => R.choices[t.id])) revealWithSuspense();
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
    if (voters().every((id) => R.votes[id])) voteWithSuspense();
    else sync();
  }
}

// ---------- Menus ----------
// Étapes : pick (l'équipe choisit un thème) → [twist] → judge (réponse orale,
// Juste/Fausse) → reveal → … → summary (bilan et bonus) → équipe suivante.

function startMenuTeam() {
  const R = S.R;
  // thèmes jamais joués d'abord (même lors des soirées précédentes), puis les autres
  const order = orderFresh('menus', C.MENUS);
  R.offered = [...order.filter((i) => !R.usedThemes.includes(i)), ...order.filter((i) => R.usedThemes.includes(i))].slice(0, 3);
  R.step = 'pick';
  R.qid = newQid();
  R.twist = null;
  R.theme = null;
  say([teamById(R.order[R.ti]).name, LINES.menuPick]);
  sync();
}

function chooseMenu(i) {
  const R = S.R;
  R.theme = i;
  R.usedThemes.push(i);
  markSeen('menus', [C.MENUS[i]]);
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
  } else startMenuJudge();
  sync();
}

// la question du menu est lue ; le chrono de réponse démarre à la fin de la lecture
export function startMenuJudge() {
  const R = S.R;
  R.step = 'judge';
  const qid = R.qid;
  if (voiceEnabled()) {
    R.deadline = 0;
    say([R.item.q]).then(() => {
      if (S.R === R && R.qid === qid && R.step === 'judge' && !R.deadline) {
        R.deadline = answerDeadline();
        sync();
      }
    });
  } else R.deadline = answerDeadline();
  prefetch([R.item.a]);
}

export function judgeMenu(ok) {
  const R = S.R;
  R.lastOk = ok;
  R.deadline = 0;
  R.timeUp = false;
  if (ok) {
    R.correct++;
    R.lastGain = addScore(R.order[R.ti], 1 * mult());
    applySteal(R.order[R.ti]);
    play('good');
  } else play('bad');
  R.step = 'reveal';
  applySwap();
  say([pickOne(ok ? GOOD : BAD), R.item.a]);
  sync();
}

export function nextMenuQuestion() {
  const R = S.R;
  R.qi++;
  if (R.qi < menuQs()) return startMenuQuestion();
  R.step = 'summary';
  R.twist = null;
  if (R.correct === menuQs()) {
    addScore(R.order[R.ti], 1);
    play('fanfare');
  }
  sync();
}

export function nextMenuTeam() {
  const R = S.R;
  R.ti++;
  if (R.ti >= R.order.length) endRound();
  else startMenuTeam();
}

// toutes les équipes votent, sauf celle qui joue (même celles qui ne passent pas cette manche)
// ---------- Fausses pubs et Défis ----------
// Pubs : brief (produits envoyés en secret) → prep (concertation commune) →
//        pour chaque équipe : ready → show (45 s) → vote → [suspense] → result.
// Défis : pour chaque équipe : draw → run (chrono) → vote → [suspense] → result.

export function voters() {
  return activeTeams().map((t) => t.id).filter((id) => id !== S.R.order[S.R.ti]);
}

// Durée : en Rapide et Court, seules quelques équipes passent aux pubs et aux défis.
// On fait passer en priorité celles qui n'ont encore rien joué devant les autres.
function pickPerformers() {
  const k = Math.min(len().performers, activeTeams().length);
  const ids = shuffle(activeTeams().map((t) => t.id));
  const done = S.performed || [];
  const chosen = [...ids.filter((id) => !done.includes(id)), ...ids.filter((id) => done.includes(id))].slice(0, k);
  S.performed = [...new Set([...done, ...chosen])];
  // on garde l'ordre des équipes de la partie
  return activeTeams().map((t) => t.id).filter((id) => chosen.includes(id));
}

// Défis : une équipe à la fois
function startDefi() {
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
  // plus d'équipes que de défis : on reprend un défi au hasard, avec un contenu différent
  const d = C.DEFIS.find((x) => x.id === R.defis[R.ti]) || C.DEFIS[Math.floor(Math.random() * C.DEFIS.length)];
  const made = d.make(pickDefi);
  R.defi = { id: d.id, secret: d.secret };
  R.defiTitle = d.title;
  R.defiRules = d.rules;
  R.defiVote = d.vote;
  R.defiSeconds = d.seconds;
  R.show = made.show || null;
  R.revealText = made.reveal || null;
  if (made.secret) giveSecret(team, d.secret, made.secret);
  say([teamById(team).name, LINES.defi, d.title, d.rules]);
  play('round');
  sync();
}

// Fausses pubs : chaque équipe reçoit son produit en secret, tout le monde se
// concerte en même temps, puis les équipes jouent leur pub à tour de rôle.
function startPubs() {
  const R = S.R;
  R.step = 'brief';
  R.deadline = 0;
  R.qid = newQid();
  clearSecrets();
  R.order.forEach((team, i) => giveSecret(team, 'team', { label: 'Votre produit à vendre', text: R.products[i] }));
  say([LINES.pubsBrief]);
  play('round');
  sync();
}

export function startPub() {
  const R = S.R;
  R.step = 'ready';
  R.product = R.products[R.ti];
  R.votes = {};
  R.deadline = 0;
  R.points = 0;
  R.resultText = '';
  R.bonus = false;
  R.qid = newQid();
  say([LINES.pubTurn, teamById(R.order[R.ti]).name, LINES.yourProduct, R.product]);
  sync();
}

export function startTimer(step, seconds) {
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
    revealWithSuspense();
    return;
  }
  // chrono de réponse écoulé : rien d'automatique, l'animateur (ou la personne
  // devant l'écran) décide si la réponse donnée est juste ou fausse
  if ((['nuggets', 'addition', 'burger'].includes(R.type) && R.step === 'answer') || (R.type === 'menus' && R.step === 'judge')) {
    R.timeUp = true;
    say([LINES.timeout]);
    sync();
    return;
  }
  if (R.type === 'pubs' && R.step === 'prep') return startPub();
  else if ((R.type === 'pubs' && R.step === 'show') || (R.type === 'defis' && R.step === 'run')) return openVote();
  sync();
}

export function openVote() {
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
  R.points = addScore(team, R.points);
  R.step = 'result';
  if (R.type === 'defis') clearSecrets();
  play(R.points ? 'good' : 'bad');
  sync();
}

export function bonusLaugh() {
  const R = S.R;
  if (R.bonus) return;
  R.bonus = true;
  addScore(R.order[R.ti], 1);
  play('good');
  sync();
}

export function nextPerformer() {
  const R = S.R;
  R.ti++;
  if (R.ti >= R.order.length) endRound();
  else if (R.type === 'pubs') startPub();
  else startDefi();
}

// ---------- pause ----------

export function togglePause() {
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
      if (S.R.suspenseUntil) S.R.suspenseUntil += d;
      // la lecture de la question a été coupée par la pause : on la relit
      if (S.R.step === 'read' && S.R.voiceRead) beginRead();
    }
  }
  sync();
}

// ---------- horloge ----------
// Toutes les 200 ms : fin de lecture, fin du suspense, chronos (tic-tac et fin).

let lastTick = 0;

setInterval(() => {
  const R = S.R;
  updateTimers(document.body);
  if (S.paused || S.phase !== 'play' || !R) return;
  const now = Date.now();
  if (R.step === 'read' && R.readUntil && now >= R.readUntil) endRead();
  if (R.step === 'suspense' && R.suspenseUntil && now >= R.suspenseUntil) {
    R.suspenseUntil = 0;
    return runSuspenseNext(R.suspenseNext);
  }
  if (R.deadline) {
    const left = Math.ceil((R.deadline - now) / 1000);
    if (left <= 5 && left > 0 && left !== lastTick) play('tick');
    lastTick = left;
    if (now >= R.deadline) onTimeout();
  }
}, 200);

// chaque équipe active garde un cri différent
// ---------- réglages et nouvelle partie ----------

export function fixAnimals() {
  const used = new Set();
  for (const t of activeTeams()) {
    if (used.has(t.animal)) t.animal = C.ANIMALS.find((a) => !used.has(a.id)).id;
    used.add(t.animal);
  }
}

export function newGame() {
  const keep = { settings: S.settings, teams: S.teams, mode: S.mode, code: S.code, hostToken: S.hostToken, remoteKey: S.remoteKey };
  setState({ ...freshState(), ...keep });
  S.teams.forEach((t) => (t.score = 0));
  clearSecrets();
  sync();
}
