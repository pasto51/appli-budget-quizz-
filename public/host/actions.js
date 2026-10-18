// Interactions : boutons (data-act), réglages, clavier.
// doAct() est le point d'entrée unique : clics sur l'écran ET boutons de la télécommande.

import * as C from '../shared/content.js';
import { isMuted, play, setMuted, unlockAudio } from '../shared/sounds.js';
import { LINES } from '../shared/voicelines.js';
import { beginRead, bonusLaugh, endRead, endRound, fixAnimals, introRound, judgeBuzz, judgeMenu, laugh, newGame, nextItem, nextMenuQuestion, nextMenuTeam, nextPerformer, nobody, onAction, openVote, revealWithSuspense, startGame, startMenuJudge, startPub, startRound, startTimer, togglePause, voteWithSuspense } from './game.js';
import { showPresenter } from './presenter.js';
import { openMenu, render, renderTop } from './render.js';
import { $, S, SAVE_KEY, activeTeams, addScore, freshState, rt, saved, setState, store } from './state.js';
import { connect, hostSend, sync } from './transport.js';
import { applyVoiceConfig, say } from './voice.js';

let audioOn = false;

export function ensureAudio() {
  if (!audioOn) {
    unlockAudio();
    audioOn = true;
  }
}

document.addEventListener('click', (e) => {
  ensureAudio();
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  doAct(el.dataset.act, el.dataset, false);
});

// une action, venant d'un clic sur l'écran ou de la télécommande du présentateur
export function doAct(act, d, fromRemote) {
  const R = S.R;
  switch (act) {
    // réglages
    case 'mode':
      S.mode = d.v;
      return render();
    case 'voice-test':
      applyVoiceConfig();
      return say([LINES.welcome]);
    case 'length':
      S.settings.length = d.v;
      return render();
    case 'nteams':
      S.settings.nTeams = Number(d.v);
      fixAnimals();
      return render();
    case 'animal': {
      const t = S.teams[Number(d.team)];
      t.animal = d.animal;
      play(t.animal);
      return render();
    }
    case 'resume':
      setState({ ...freshState(), ...saved });
      rt.resumePrompt = false;
      S.paused = false;
      S.adjust = false;
      connect();
      return sync();
    case 'discard':
      rt.resumePrompt = false;
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
      startMenuJudge();
      return sync();
    case 'open-now':
      return endRead();
    case 'close-buzz':
      return hostSend({ t: 'buzz:close' });
    case 'peek':
      R.peek = true;
      return sync();
    case 'nobody':
      return nobody();
    case 'right':
      return judgeBuzz(true);
    case 'wrong':
      return judgeBuzz(false);
    case 'reveal':
      if (R.step === 'choose') R.step = 'locked';
      return revealWithSuspense();
    case 'next':
      return nextItem();
    case 'laugh':
      return laugh(d.team);
    // menus
    case 'menu-pick':
      return onAction(R.order[R.ti], R.qid, d.v);
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
      return startPub();
    case 'pub-show':
      return startTimer('show', 45);
    case 'defi-run':
      return startTimer('run', R.defiSeconds);
    case 'end-perf':
      return openVote();
    case 'close-vote':
      return voteWithSuspense();
    case 'force-ok':
      return voteWithSuspense(true);
    case 'force-ko':
      return voteWithSuspense(false);
    case 'bonus-laugh':
      return bonusLaugh();
    case 'next-perf':
      return nextPerformer();
    // fin
    case 'replay':
      S.phase = 'setup';
      return startGame();
    case 'new-game':
      if (!fromRemote && !confirm('Revenir à l’écran de création ?')) return;
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
      addScore(d.team, Number(d.d), true);
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
    case 'm-presenter':
      return showPresenter();
    case 'm-presenter-reset':
      if (fromRemote) return;
      rt.net?.send({ t: 'remote:reset' });
      $('menu').innerHTML = '<div class="menu-box presenter-box"><h2>🔄 Nouveau QR code…</h2></div>';
      return;
    case 'm-presenter-toggle':
      if (fromRemote) return;
      S.settings.presenter = !S.settings.presenter;
      rt.net?.send({ t: 'remote:config', allow: S.settings.presenter });
      $('menu').classList.remove('show');
      if (S.settings.presenter) showPresenter();
      return sync();
  }
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
  if (el.dataset.set === 'answerTimer') S.settings.answerTimer = Number(el.value);
  if (el.dataset.set === 'wrongAnswer') S.settings.wrongAnswer = el.value;
  if (el.dataset.set === 'suspense') S.settings.suspense = el.checked;
  if (el.dataset.set === 'catchup') S.settings.catchup = el.checked;
  if (el.dataset.set === 'presenter') S.settings.presenter = el.checked;
  if (el.dataset.set === 'voice') {
    S.settings.voice = el.checked;
    return render();
  }
  if (el.dataset.set === 'voiceId') S.settings.voiceId = el.value;
  if (el.dataset.set === 'voiceQuality') S.settings.voiceQuality = el.value;
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
