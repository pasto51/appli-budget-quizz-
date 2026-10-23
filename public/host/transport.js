// Lien avec le hub : le serveur en mode téléphones, ou le hub local en mode
// tablette unique. sync() est appelé après CHAQUE changement d'état : il met à
// jour les téléphones, ouvre ou ferme le buzzer, sauvegarde et redessine l'écran.

import { Hub, handleHostMessage } from '../shared/hub.js';
import { Socket } from '../shared/net.js';

import { onAction, onBuzz } from './game.js';
import { onRemoteAct, showPresenter } from './presenter.js';
import { checkLeader, render, renderPanels, renderScores, renderTop, toast } from './render.js';
import { $, S, SAVE_KEY, activeTeams, boosted, rankOf, rt, store, teamById } from './state.js';
import { viewFor } from './views.js';

export function hostSend(msg) {
  if (S.mode === 'local') {
    if (!rt.hub) rt.hub = new Hub({ toHost: onHubMessage });
    handleHostMessage(rt.hub, msg);
  } else if (rt.net) rt.net.send(msg);
}

export function connect() {
  if (S.mode === 'local') {
    rt.hub = new Hub({ toHost: onHubMessage });
    resync();
    return;
  }
  if (rt.net) return;
  rt.net = new Socket({
    onOpen: () => rt.net.send(S.code ? { t: 'host:resume', code: S.code, hostToken: S.hostToken, remoteKey: S.remoteKey } : { t: 'host:create' }),
    onMessage: onHubMessage,
    onStatus: (s) => {
      rt.connStatus = s;
      renderTop();
    },
  });
}

function onHubMessage(msg) {
  switch (msg.t) {
    case 'room':
      S.code = msg.code;
      S.hostToken = msg.hostToken;
      S.remoteKey = msg.remoteKey;
      rt.lastRemote = '';
      computeJoinUrl();
      resync();
      if ($('menu').querySelector('.presenter-box')) showPresenter(); // nouveau QR après « Changer de présentateur »
      break;
    case 'devices':
      rt.deviceCounts = msg.counts;
      renderScores();
      if (S.phase === 'lobby') render();
      return;
    case 'buzzstate':
      rt.buzzState = msg.buzz;
      renderPanels();
      return;
    case 'buzz':
      onBuzz(msg.team, msg.qid);
      break;
    case 'action':
      onAction(msg.team, msg.qid, msg.value);
      break;
    case 'rename': // proposé par un téléphone, accepté seulement en salle d'attente
      if (S.phase !== 'lobby' || !msg.name || !teamById(msg.team)) return;
      teamById(msg.team).name = msg.name;
      hostSend({ t: 'teams', teams: activeTeams() });
      break;
    case 'remotes':
      rt.remoteCount = msg.count;
      if (rt.remoteCount) toast('🎤 Télécommande du présentateur connectée');
      render();
      return;
    case 'remote:act':
      onRemoteAct(msg.act, msg.data || {});
      return;
    case 'secret:sent':
      if (S.mode === 'net' && msg.devices === 0) toast(`${teamById(msg.team)?.name} n’a pas de téléphone connecté : la carte secrète est sur l’écran.`);
      return;
  }
}

// renvoie tout au hub (après une reconnexion ou un redémarrage du serveur)
function resync() {
  rt.lastViews = {};
  rt.buzzOpenKey = null;
  hostSend({ t: 'teams', teams: activeTeams() });
  if (S.mode === 'net') rt.net?.send({ t: 'remote:config', allow: !!S.settings.presenter });
  for (const [team, sec] of Object.entries(S.secrets || {})) hostSend({ t: 'secret', team, target: sec.target, payload: sec.payload });
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
  rt.joinOrigin = origin;
  rt.joinUrl = `${origin}/play.html?code=${S.code}`;
  if (S.phase === 'lobby') render();
}

export function sync() {
  if (S.phase !== 'setup') {
    for (const t of activeTeams()) {
      const view = { ...viewFor(t.id), me: S.phase === 'lobby' ? undefined : { score: t.score, rank: rankOf(t), n: activeTeams().length, boost: boosted(t.id) } };
      const json = JSON.stringify(view);
      if (rt.lastViews[t.id] !== json) {
        rt.lastViews[t.id] = json;
        const phoneView = view && view.deadline ? { ...view, deadline: undefined, remaining: view.deadline - Date.now() } : view;
        hostSend({ t: 'view', team: t.id, view: phoneView });
      }
    }
    // le buzzer est ouvert seulement à l'étape « open » d'une manche à buzzer
    const R = S.R;
    const want = S.phase === 'play' && R && R.step === 'open' && !S.paused ? R.qid : null;
    if (want && rt.buzzOpenKey !== want) {
      rt.buzzOpenKey = want;
      hostSend({ t: 'buzz:open', qid: R.qid, mode: R.twist?.id === 'dernier' ? 'last' : 'first', eligible: activeTeams().map((t) => t.id).filter((id) => !R.excluded.includes(id)) });
    } else if (!want && rt.buzzOpenKey) {
      rt.buzzOpenKey = null;
      hostSend({ t: 'buzz:close' });
    }
  }
  checkLeader();
  store.set(SAVE_KEY, S);
  render();
}

export function giveSecret(team, target, payload) {
  S.secrets[team] = { target, payload };
  hostSend({ t: 'secret', team, target, payload });
}

export function clearSecrets() {
  if (!S.secrets) S.secrets = {};
  const had = Object.keys(S.secrets).length;
  S.secrets = {};
  if (had) hostSend({ t: 'secret:clear' });
}
