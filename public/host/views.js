// Ce qu'affiche le téléphone de chaque équipe, calculé à partir de l'état.
// Une vue est un petit objet (voir public/shared/controls.js pour le rendu) :
//   { screen: 'wait', title, text, deadline? }   message d'attente
//   { screen: 'buzz', qid, deadline? }            le buzzer
//   { screen: 'choice', qid, prompt, options, chosen } choix (Sel/Poivre, menu, vote)

import * as C from '../shared/content.js';
import { S, menuQs, rankOf, roundRules, roundType, teamById } from './state.js';

export function viewFor(teamId) {
  const R = S.R;
  const team = teamById(teamId);
  if (S.paused) return { screen: 'wait', title: 'Pause ☕', text: 'La partie reprend bientôt.' };
  if (S.phase === 'lobby') return { screen: 'wait', title: `Bienvenue, ${team.name} !`, text: 'La partie va commencer. Regardez l’écran.', canRename: true };
  if (S.phase === 'round-intro') {
    const info = C.ROUNDS[roundType()];
    return { screen: 'wait', title: info.title, text: roundRules(roundType()) };
  }
  if (S.phase === 'podium') {
    const rank = rankOf(team);
    return { screen: 'wait', title: rank === 1 ? '🏆 Victoire !' : `${rank}ᵉ place`, text: `${team.score} point${Math.abs(team.score) > 1 ? 's' : ''}` };
  }
  if (S.phase !== 'play' || !R) return { screen: 'wait', title: 'Regardez l’écran' };

  const banner = R.twist && R.step !== 'twist' ? `${R.twist.title} — ${R.twist.text}` : undefined;
  if (R.step === 'twist') return { screen: 'wait', title: `🌀 ${R.twist.title}`, text: R.twist.text };
  if (R.step === 'suspense') return { screen: 'wait', title: '🥁 Suspense…', text: R.type === 'selpoivre' ? 'Et la réponse est…' : 'Le verdict tombe…' };

  switch (R.type) {
    case 'nuggets':
    case 'addition':
    case 'burger':
      if (R.step === 'reveal') return { screen: 'wait', title: 'Réponse', text: R.item.a };
      return { screen: 'buzz', qid: R.qid, banner, deadline: R.step === 'answer' && R.deadline ? R.deadline : undefined };

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
        if (R.step === 'summary') return { screen: 'wait', title: `Menu terminé : ${R.correct}/${menuQs()}`, text: R.correct === menuQs() ? 'Bonus : +1 point !' : '' };
        return { screen: 'wait', title: theme, text: 'Répondez à voix haute', banner, deadline: R.step === 'judge' && R.deadline ? R.deadline : undefined };
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
        if ((R.step === 'brief' || R.step === 'prep') && !R.order.includes(teamId)) return { screen: 'wait', title: 'Fausses pubs', text: 'Cette fois, vous ne jouez pas de pub : vous votez !' };
        if (R.step === 'brief') return { screen: 'wait', title: 'Fausses pubs', text: 'Votre produit est sur votre carte secrète. Ne le dites pas aux autres !' };
        if (R.step === 'prep') return { screen: 'wait', title: 'Concertation !', text: 'Préparez votre pub, toutes les équipes en même temps', deadline: R.deadline || undefined };
        if (teamId === active) return { screen: 'wait', title: R.step === 'show' ? 'Action ! Jouez votre pub' : 'À vous !', text: R.product, deadline: R.deadline || undefined };
        return { screen: 'wait', title: `Pub de ${activeName}`, text: R.product, deadline: R.deadline || undefined };
      }
      const title = teamId === active ? `Défi : ${R.defiTitle}` : `${activeName} : ${R.defiTitle}`;
      return { screen: 'wait', title, text: R.show || R.defiRules, deadline: R.deadline || undefined };
    }
  }
  return { screen: 'wait', title: 'Regardez l’écran' };
}
