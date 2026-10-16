import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hub, handleHostMessage, BUZZ_WINDOW_MS } from '../public/shared/hub.js';

const TEAMS = [
  { id: 'ketchup', name: 'Ketchup', color: '#e00', animal: 'coq' },
  { id: 'mayo', name: 'Mayo', color: '#ff0', animal: 'canard' },
  { id: 'cornichon', name: 'Cornichon', color: '#0a0', animal: 'grenouille' },
];

// horloge et minuteurs manuels pour des tests déterministes
function setup() {
  let clock = 1000;
  const timers = [];
  const host = [];
  const devices = {};
  const hub = new Hub({
    toHost: (m) => host.push(m),
    toDevice: (id, m) => (devices[id] ||= []).push(m),
    now: () => clock,
    setTimer: (fn, ms) => {
      const t = { fn, at: clock + ms };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => {
      const i = timers.indexOf(t);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  handleHostMessage(hub, { t: 'teams', teams: TEAMS });
  return {
    hub,
    host,
    devices,
    advance(ms) {
      clock += ms;
      for (const t of [...timers]) if (t.at <= clock) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    },
    buzzes: () => host.filter((m) => m.t === 'buzz'),
  };
}

test('le premier buzz gagne après la fenêtre de départage', () => {
  const s = setup();
  s.hub.openBuzz({ qid: 'q1' });
  s.hub.teamBuzz('mayo', { qid: 'q1' });
  s.advance(50);
  s.hub.teamBuzz('ketchup', { qid: 'q1' });
  assert.equal(s.buzzes().length, 0);
  s.advance(BUZZ_WINDOW_MS);
  assert.deepEqual(s.buzzes().map((b) => b.team), ['mayo']);
});

test('la latence réseau est compensée', () => {
  const s = setup();
  s.hub.openBuzz({ qid: 'q1' });
  s.hub.teamBuzz('mayo', { qid: 'q1', rtt: 0 });
  s.advance(40);
  // arrivé 40 ms plus tard, mais avec 200 ms d'aller-retour : appuyé 60 ms plus tôt
  s.hub.teamBuzz('ketchup', { qid: 'q1', rtt: 200 });
  s.advance(BUZZ_WINDOW_MS);
  assert.equal(s.buzzes()[0].team, 'ketchup');
});

test('un seul buzz par équipe, et rien après la victoire ou sur une autre question', () => {
  const s = setup();
  s.hub.openBuzz({ qid: 'q1' });
  assert.equal(s.hub.teamBuzz('mayo', { qid: 'autre' }), false);
  assert.equal(s.hub.teamBuzz('mayo', { qid: 'q1' }), true);
  assert.equal(s.hub.teamBuzz('mayo', { qid: 'q1' }), false);
  s.advance(BUZZ_WINDOW_MS);
  assert.equal(s.hub.teamBuzz('ketchup', { qid: 'q1' }), false);
  assert.equal(s.buzzes().length, 1);
});

test('toutes les équipes ont buzzé : décision immédiate', () => {
  const s = setup();
  s.hub.openBuzz({ qid: 'q1' });
  s.hub.teamBuzz('cornichon', { qid: 'q1' });
  s.hub.teamBuzz('mayo', { qid: 'q1' });
  s.hub.teamBuzz('ketchup', { qid: 'q1' });
  assert.equal(s.buzzes()[0].team, 'cornichon');
});

test('équipes exclues (Burger de la mort)', () => {
  const s = setup();
  s.hub.openBuzz({ qid: 'q2', eligible: ['mayo', 'cornichon'] });
  assert.equal(s.hub.teamBuzz('ketchup', { qid: 'q2' }), false);
  s.hub.teamBuzz('mayo', { qid: 'q2' });
  s.advance(BUZZ_WINDOW_MS);
  assert.equal(s.buzzes()[0].team, 'mayo');
});

test('« Le dernier gagne » : on attend tout le monde', () => {
  const s = setup();
  s.hub.openBuzz({ qid: 'q1', mode: 'last' });
  s.hub.teamBuzz('mayo', { qid: 'q1' });
  s.advance(500);
  s.hub.teamBuzz('ketchup', { qid: 'q1' });
  s.advance(500);
  assert.equal(s.buzzes().length, 0);
  s.hub.teamBuzz('cornichon', { qid: 'q1' });
  assert.equal(s.buzzes()[0].team, 'cornichon');
});

test('« Le dernier gagne » : clore les buzz désigne le dernier arrivé', () => {
  const s = setup();
  s.hub.openBuzz({ qid: 'q1', mode: 'last' });
  s.hub.teamBuzz('mayo', { qid: 'q1' });
  s.advance(300);
  s.hub.teamBuzz('ketchup', { qid: 'q1' });
  s.hub.closeBuzz();
  assert.equal(s.buzzes()[0].team, 'ketchup');
});

test('les téléphones retrouvent leur écran après reconnexion', () => {
  const s = setup();
  s.hub.deviceConnect('tel1');
  s.hub.handleDeviceMessage('tel1', { t: 'pick', team: 'mayo' });
  handleHostMessage(s.hub, { t: 'view', team: 'mayo', view: { screen: 'buzz', qid: 'q9' } });
  s.hub.deviceDisconnect('tel1');
  s.devices.tel1 = [];
  s.hub.deviceConnect('tel1');
  const state = s.devices.tel1.find((m) => m.t === 'state');
  assert.equal(state.team, 'mayo');
  assert.deepEqual(state.view, { screen: 'buzz', qid: 'q9' });
});

test('carte secrète : un seul téléphone de l’équipe la reçoit', () => {
  const s = setup();
  for (const id of ['a', 'b', 'c']) {
    s.hub.deviceConnect(id);
    s.hub.devicePick(id, 'ketchup');
  }
  s.hub.sendSecret('ketchup', 'device', { label: 'À mimer', text: 'Titanic' });
  const got = ['a', 'b', 'c'].filter((id) => s.devices[id].some((m) => m.t === 'secret' && m.secret));
  assert.equal(got.length, 1);
  s.hub.sendSecret('ketchup', 'team', { label: 'Statue', text: 'Volcan' });
  const all = ['a', 'b', 'c'].filter((id) => s.devices[id].some((m) => m.t === 'secret' && m.secret?.text === 'Volcan'));
  assert.equal(all.length, 3);
});

test('les actions des téléphones remontent à l’écran avec leur équipe', () => {
  const s = setup();
  s.hub.deviceConnect('t');
  s.hub.devicePick('t', 'cornichon');
  s.hub.handleDeviceMessage('t', { t: 'action', qid: 'x', value: 'sel' });
  const a = s.host.find((m) => m.t === 'action');
  assert.equal(a.team, 'cornichon');
  assert.equal(a.value, 'sel');
});
