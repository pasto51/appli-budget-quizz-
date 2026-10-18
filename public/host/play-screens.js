// Écrans de jeu, manche par manche.

import * as C from '../shared/content.js';
import { esc } from '../shared/controls.js';
import { readDelayMs, voters } from './game.js';
import { btn, stage } from './render.js';
import { S, activeTeams, animalOf, effective, menuQs, mult, teamById, wrongCosts, wrongPasses } from './state.js';

// « Voir la réponse » : pour juger sans présentateur, la personne devant l'écran
// affiche la bonne réponse avant de cliquer Juste / Fausse
function peekButton(R) {
  if (R.peek) return '';
  const spoils = R.type !== 'menus' && (R.type === 'burger' || wrongPasses());
  return btn('peek', '👁 Voir la réponse', 'btn-ghost') + (spoils ? '<span class="ctl-hint">(si c’est faux, la main ne passera pas)</span>' : '');
}

function peekAnswer(R) {
  return R.peek ? `<div class="answer peek"><small>La bonne réponse</small>${esc(R.item.a)}</div>` : '';
}

// chrono de réponse, ou « temps écoulé » : l'animateur tranche avec Juste / Fausse
function timeUpOrTimer(R) {
  if (R.timeUp) return '<div class="time-up">⏱ Temps écoulé !<small>Leur réponse était-elle juste ?</small></div>';
  return R.deadline ? `<div class="big-timer" data-deadline="${R.deadline}"></div>` : '';
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

export function renderPlay() {
  const R = S.R;
  if (!R) return stage('');
  if (R.step === 'twist') {
    const next = R.type === 'menus' ? 'twist-ok-menu' : 'twist-ok';
    return stage(twistCard(R), btn(next, 'Compris !', 'btn-primary btn-big'));
  }
  if (R.step === 'suspense') {
    const what = R.type === 'selpoivre' ? `<div class="question">${esc(R.item.q)}</div>` : '';
    return stage(`${what}<div class="suspense">🥁<span>${R.type === 'selpoivre' ? 'Et la réponse est…' : 'Le verdict…'}</span></div>`);
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
  const malus = R.type === 'burger' || wrongCosts();
  const ptsLabel = (malus ? `+${pts} / −${mult()}` : `+${pts}`) + (R.twist?.boost ? ' · double pour les derniers' : '');
  let status = '';
  let controls = '';
  if (R.step === 'read') {
    const total = readDelayMs(R.type === 'addition' ? R.item.words.join(' ') : R.item.q);
    status = R.voiceRead ? `<div class="status">🎙️ L’animateur lit la question…</div>` : `<div class="status">Lisez bien… <div class="readbar"><i style="animation-duration:${Math.max(0, R.readUntil - Date.now())}ms;--from:${1 - Math.max(0, R.readUntil - Date.now()) / total}"></i></div></div>`;
    controls = btn('open-now', 'Ouvrir les buzzers', 'btn-ghost') + ' ' + btn('nobody', 'Personne ne sait', 'btn-ghost');
  } else if (R.step === 'open') {
    const ex = R.excluded.map((id) => teamById(id).name).join(', ');
    status = `<div class="status status-open">${R.twist?.id === 'dernier' ? 'Buzzez tous… le DERNIER répond !' : 'À vos buzzers !'}${ex ? `<small>Hors jeu : ${esc(ex)}</small>` : ''}</div>`;
    controls = (R.twist?.id === 'dernier' ? btn('close-buzz', 'Clore les buzz', 'btn-ghost') + ' ' : '') + btn('nobody', 'Personne ne sait', 'btn-ghost');
  } else if (R.step === 'answer') {
    const t = teamById(R.winner);
    status = `<div class="hero-row"><div class="buzzed" style="--team:${t.color};--ink:${t.ink}"><span class="buzzed-emoji">${animalOf(t).emoji}</span>${esc(t.name)}</div>${timeUpOrTimer(R)}</div>`;
    status += peekAnswer(R);
    controls = `<span class="ctl-label">Leur réponse est…</span> ${btn('right', '✔ Juste', 'btn-good btn-big')} ${btn('wrong', '✘ Fausse', 'btn-bad btn-big')} ${peekButton(R)}`;
  } else if (R.step === 'reveal') {
    const who = R.lastOk && R.winner ? `<div class="verdict good">${esc(teamById(R.winner).name)} marque +${R.lastGain} !</div>` : R.lastOk === false ? '<div class="verdict bad">Raté !</div>' : '';
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
    status = `<div class="hero-row"><div class="sp-legend"><span class="sel">🧂 Sel = vrai</span><span class="poivre">🌶️ Poivre = faux</span></div>
      ${R.deadline ? `<div class="big-timer" data-deadline="${R.deadline}"></div>` : ''}</div>
      <div class="locks">${teams.map((t) => `<span class="lock ${R.choices[t.id] ? 'done' : ''}" style="--team:${t.color};--ink:${t.ink}">${esc(t.name)} ${R.choices[t.id] ? '🔒' : '…'}</span>`).join('')}</div>`;
    controls = btn('reveal', 'Révéler maintenant', 'btn-ghost');
  } else if (R.step === 'reveal') {
    const good = R.item.sel ? 'sel' : 'poivre';
    status = `<div class="answer sp-${good}">${R.item.sel ? '🧂 SEL' : '🌶️ POIVRE'}<small>${esc(R.item.why)}</small></div>
      <div class="locks">${teams.map((t) => {
        const c = R.choices[t.id];
        return `<span class="lock ${c === good ? 'win' : 'lose'}" style="--team:${t.color};--ink:${t.ink}">${esc(t.name)} : ${c ? (c === 'sel' ? '🧂' : '🌶️') : '—'} ${c === good ? `+${effective(t.id, mult())}` : ''}</span>`;
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
  const dots = [...Array(menuQs()).keys()].map((i) => `<span class="dot ${i < R.qi || (i === R.qi && R.step !== 'judge') ? 'done' : ''}">${i + 1}</span>`).join('');
  if (R.step === 'summary') {
    return stage(
      `${head}<div class="menu-theme">Menu « ${esc(theme)} »</div><div class="answer">${R.correct}/${menuQs()}${R.correct === menuQs() ? '<small>Menu complet : +1 bonus !</small>' : ''}</div>`,
      btn('menu-next-team', R.ti + 1 >= R.order.length ? 'Fin de la manche' : 'Équipe suivante', 'btn-primary btn-big'),
    );
  }
  let status = '';
  let controls = '';
  if (R.step === 'judge') {
    controls = `<span class="ctl-label">Leur réponse est…</span> ${btn('menu-right', '✔ Juste', 'btn-good btn-big')} ${btn('menu-wrong', '✘ Fausse', 'btn-bad btn-big')} ${peekButton(R)}`;
    status = timeUpOrTimer(R) + peekAnswer(R);
  }
  else {
    status = `<div class="answer"><small>Réponse</small>${esc(R.item.a)}</div><div class="verdict ${R.lastOk ? 'good' : 'bad'}">${R.lastOk ? `+${R.lastGain} !` : 'Raté !'}</div>${extraInfo(R)}`;
    controls = btn('menu-next-q', R.qi + 1 >= menuQs() ? 'Voir le bilan' : 'Question suivante', 'btn-primary btn-big');
  }
  stage(`${twistBanner(R)}${head}<div class="menu-theme">Menu « ${esc(theme)} » <span class="dots">${dots}</span></div>${questionBody(R)}${status}`, `${controls}<div class="laughs">${laughButtons(R)}</div>`);
}

function renderPubsPrep(R) {
  const chips = R.order.map((id) => { const o = teamById(id); return `<span class="lock done" style="--team:${o.color};--ink:${o.ink}">${animalOf(o).emoji} ${esc(o.name)} 🤫</span>`; }).join('');
  const where = S.mode === 'local' ? 'dans son panneau, en bas de l’écran (ouvrez-le chacun votre tour)' : 'sur son téléphone';
  if (R.step === 'brief') {
    return stage(
      `<div class="menu-theme">Fausses pubs</div><div class="product">Chaque équipe a reçu son produit</div><div class="rules">Il est ${where}. Gardez-le secret : vous le jouerez devant tout le monde !</div><div class="locks">${chips}</div>`,
      btn('pub-prep', 'Lancer la concertation (30 s)', 'btn-primary btn-big'),
    );
  }
  return stage(
    `<div class="menu-theme">Fausses pubs</div><div class="hero-row"><div class="product">Concertation !</div><div class="big-timer" data-deadline="${R.deadline}"></div></div><div class="rules">Toutes les équipes préparent leur pub en même temps.</div><div class="locks">${chips}</div>`,
    btn('pub-ready', 'Tout le monde est prêt !', 'btn-ghost'),
  );
}

function renderPerform(R) {
  if (R.type === 'pubs' && (R.step === 'brief' || R.step === 'prep')) return renderPubsPrep(R);
  const t = teamById(R.order[R.ti]);
  const head = `<div class="perf-team" style="--team:${t.color};--ink:${t.ink}">${animalOf(t).emoji} ${esc(t.name)}</div>`;
  const timer = R.deadline ? `<div class="big-timer" data-deadline="${R.deadline}"></div>` : '';
  let body = '';
  let controls = '';
  if (R.type === 'pubs') {
    body = `<div class="menu-theme">Fausse pub</div><div class="product">${esc(R.product)}</div>`;
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
  stage(`<div class="hero-row">${head}${timer}</div>${body}`, controls);
}
