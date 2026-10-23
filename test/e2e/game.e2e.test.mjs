// Tests de bout en bout : de vraies parties, avec un vrai serveur et de vrais
// navigateurs (écran de jeu, téléphones, télécommande).
// Lancer : npm run test:e2e   (durée : 2 à 3 minutes)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, startFakeElevenLabs, launchBrowser, openPage, setupGame, joinPhone, openPresenter, scores, clickAct } from './helpers.mjs';

let server, browser;
before(async () => {
  server = await startServer();
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  server?.stop();
});

const noErrors = (errors) => assert.deepEqual(errors, [], 'erreurs JavaScript dans les pages');

// passe les règles bizarres éventuelles, puis attend que les buzzers des panneaux (mode tablette) soient ouverts
async function waitLocalBuzzer(host) {
  for (;;) {
    if (await host.$('.twist-card')) await host.click('[data-act^=twist-ok]');
    if (await host.$('.panel .buzzer-armed')) return;
    await host.waitForTimeout(100);
  }
}

// buzze avec une touche du clavier (mode tablette) ; gère la règle « Le dernier gagne »
async function localBuzz(host, key) {
  const last = (await host.textContent('#stage')).includes('DERNIER');
  await host.keyboard.press(key);
  if (last) await host.click('[data-act=close-buzz]');
  await host.waitForSelector('[data-act=right]');
}

test('partie avec téléphones : buzz, Sel ou Poivre, reconnexion, Menus, Défis, podium', async () => {
  const errors = [];
  const host = await openPage(browser, `${server.url}/host.html`, { errors });
  const code = await setupGame(host, { teams: 2, twistRate: 0 });
  const p1 = await joinPhone(browser, server.url, code, 'ketchup', errors);
  const p2 = await joinPhone(browser, server.url, code, 'mayo', errors);
  await host.waitForFunction(() => document.querySelectorAll('.lobby-team.ready').length === 2);
  // nom choisi sur le téléphone, en salle d'attente seulement
  p1.removeAllListeners('dialog');
  p1.once('dialog', (d) => d.accept('Les Poulets'));
  await p1.click('#rename');
  await host.waitForFunction(() => document.querySelector('.lobby-teams').textContent.includes('Les Poulets'));

  // Nuggets : Mayo buzze en premier
  await host.click('[data-act=begin]');
  await host.click('[data-act=start-round]');
  await p2.waitForSelector('.buzzer-armed', { timeout: 10000 });
  await p2.dispatchEvent('.buzzer', 'pointerdown');
  await host.waitForSelector('.buzzed');
  await p1.waitForSelector('.buzzer-lost');
  await host.click('[data-act=right]');
  await host.waitForSelector('.answer');
  assert.deepEqual(await scores(host), [0, 1]);

  // Sel ou Poivre : choix secrets, une seule bonne réponse sur deux
  await host.click('[data-act=menu]');
  await host.click('[data-act=m-skip]');
  await host.click('[data-act=start-round]');
  await p1.waitForSelector('.choice:not([disabled])', { timeout: 10000 });
  await p1.click('.choice[data-value=sel]');
  await p2.click('.choice[data-value=poivre]');
  await host.waitForSelector('.answer', { timeout: 10000 });
  const afterSel = await scores(host);
  assert.equal(afterSel[0] + afterSel[1], 2);

  // un téléphone rechargé retrouve son équipe
  await p1.reload();
  await p1.waitForSelector('.phone-team');
  assert.match(await p1.textContent('.phone-team'), /Les Poulets/);

  // Menus (on passe L'Addition) : 3 bonnes réponses = 3 points + 1 bonus
  await host.click('[data-act=menu]');
  await host.click('[data-act=m-skip]');
  await host.click('[data-act=menu]');
  await host.click('[data-act=m-skip]');
  await host.click('[data-act=start-round]');
  await host.waitForSelector('.menu-card');
  const playing = (await host.textContent('.perf-team')).includes('Les Poulets') ? 0 : 1;
  const phone = [p1, p2][playing];
  const before = (await scores(host))[playing];
  await phone.waitForSelector('.choice');
  await phone.click('.choice');
  for (let i = 0; i < 3; i++) {
    await host.click('[data-act=menu-right]');
    await host.click('[data-act=menu-next-q]');
  }
  assert.equal((await scores(host))[playing], before + 4);

  // Défis (on passe la fin des Menus et les pubs) : l'autre équipe vote « oui »
  await host.click('[data-act=menu]');
  await host.click('[data-act=m-skip]');
  await host.click('[data-act=menu]');
  await host.click('[data-act=m-skip]');
  await host.click('[data-act=start-round]');
  const performer = (await host.textContent('.perf-team')).includes('Les Poulets') ? 0 : 1;
  await host.click('[data-act=defi-run]');
  await host.click('[data-act=end-perf]');
  const voter = [p1, p2][1 - performer];
  await voter.waitForSelector('.choice[data-value=yes]');
  await voter.click('.choice[data-value=yes]');
  await host.waitForSelector('[data-act=next-perf]', { timeout: 10000 });
  assert.match(await host.textContent('.answer'), /\+2/);

  await host.click('[data-act=menu]');
  await host.click('[data-act=m-end]');
  await host.waitForSelector('.podium');
  noErrors(errors);
});

test('tablette unique : règles bizarres, Burger de la mort, reprise après rechargement', async () => {
  const errors = [];
  const host = await openPage(browser, `${server.url}/host.html`, { errors });
  await setupGame(host, { mode: 'local', teams: 3, twistRate: 0.33, length: 'rapide', answerTimer: 0, wrongAnswer: 'none', rounds: ['nuggets', 'burger'] });
  await host.click('[data-act=start-round]');
  for (let i = 0; i < 5; i++) {
    await waitLocalBuzzer(host);
    await localBuzz(host, String((i % 3) + 1));
    await host.click(i % 2 ? '[data-act=wrong]' : '[data-act=right]');
    await host.click('[data-act=next]');
  }

  // Burger : mauvaise réponse = points perdus, et les autres équipes peuvent buzzer
  await host.click('[data-act=start-round]');
  await waitLocalBuzzer(host);
  const before = await scores(host);
  await localBuzz(host, '1');
  await host.click('[data-act=wrong]');
  assert.ok((await scores(host))[0] < before[0], 'Ketchup perd des points');
  await host.waitForSelector('.panel .buzzer-armed');
  assert.equal(await host.$$eval('.panel .buzzer-excluded', (e) => e.length), 1);

  // rechargement : la partie reprend là où elle en était
  const kept = await scores(host);
  await host.reload();
  await host.click('[data-act=resume]');
  await host.waitForSelector('.panel .buzzer');
  assert.deepEqual(await scores(host), kept);
  noErrors(errors);
});

test('mauvaise réponse en Nuggets : la main passe aux autres équipes, ou −1 point', async () => {
  const errors = [];
  const host = await openPage(browser, `${server.url}/host.html`, { errors });
  await setupGame(host, { mode: 'local', teams: 3, twistRate: 0, answerTimer: 0, wrongAnswer: 'rebond', rounds: ['nuggets'] });
  await host.click('[data-act=start-round]');
  await host.waitForSelector('.panel .buzzer-armed');
  // trois mauvaises réponses : la main passe deux fois, puis la réponse est donnée
  for (const key of ['1', '2', '3']) {
    await host.waitForSelector('.panel .buzzer-armed');
    await localBuzz(host, key);
    await host.click('[data-act=wrong]');
  }
  await host.waitForSelector('.answer');
  assert.deepEqual(await scores(host), [0, 0, 0], 'pas de point perdu en mode « la main passe »');

  // nouvelle partie en mode « −1 point » : la réponse est donnée tout de suite
  await host.click('[data-act=menu]');
  await host.click('[data-act=m-end]');
  await host.click('[data-act=new-game]');
  await setupGame(host, { mode: 'local', wrongAnswer: 'malus' });
  await host.click('[data-act=start-round]');
  await host.waitForSelector('.panel .buzzer-armed');
  await localBuzz(host, '2');
  await host.click('[data-act=wrong]');
  await host.waitForSelector('.answer');
  assert.deepEqual(await scores(host), [0, -1, 0]);

  // « Voir la réponse » : l'animateur la lit avant de juger ; en mode « la main passe », elle ne passe plus
  await host.click('[data-act=menu]');
  await host.click('[data-act=m-end]');
  await host.click('[data-act=new-game]');
  await setupGame(host, { mode: 'local', wrongAnswer: 'rebond' });
  await host.click('[data-act=start-round]');
  await host.waitForSelector('.panel .buzzer-armed');
  await localBuzz(host, '1');
  await host.click('[data-act=peek]');
  await host.waitForSelector('.answer.peek');
  await host.click('[data-act=wrong]');
  await host.waitForSelector('[data-act=next]');
  assert.equal(await host.$('.panel .buzzer-armed'), null, 'la main ne passe pas après avoir vu la réponse');
  noErrors(errors);
});

test('12 équipes : animaux tous différents, touche 0 = 10e équipe', async () => {
  const errors = [];
  const host = await openPage(browser, `${server.url}/host.html`, { errors });
  await host.click('[data-act=mode][data-v=local]');
  await host.click('[data-act=nteams][data-v="12"]');
  const animals = await host.$$eval('.setup-team .animal.on', (e) => e.map((x) => x.dataset.animal));
  assert.equal(new Set(animals).size, 12);
  await setupGame(host, { mode: 'local', twistRate: 0 });
  await host.click('[data-act=start-round]');
  await host.waitForSelector('.panel .buzzer-armed');
  await host.keyboard.press('0');
  await host.waitForSelector('.buzzed');
  assert.match(await host.textContent('.buzzed'), /Réglisse/);
  noErrors(errors);
});

test('présentateur : pilote la partie, voit les réponses ; fausses pubs simultanées', async () => {
  const errors = [];
  const host = await openPage(browser, `${server.url}/host.html`, { errors });
  const code = await setupGame(host, { teams: 3, twistRate: 0, presenter: true, rounds: ['nuggets', 'pubs'] });
  const phones = [];
  for (const t of ['ketchup', 'mayo', 'cornichon']) phones.push(await joinPhone(browser, server.url, code, t, errors));
  const { remote } = await openPresenter(browser, host, server.url, errors);
  await remote.waitForSelector('.r-buttons .btn');
  await host.waitForFunction(() => getComputedStyle(document.querySelector('#controls')).display === 'none');
  const rclick = async (label) => {
    await remote.click(`.r-buttons .btn:has-text("${label}")`);
    await host.waitForTimeout(250);
  };

  await rclick('Lancer la partie');
  await rclick('C’est parti');
  await phones[1].waitForSelector('.buzzer-armed', { timeout: 10000 });
  assert.ok(await remote.$('.r-secret'), 'la réponse est visible sur la télécommande');
  await phones[1].dispatchEvent('.buzzer', 'pointerdown');
  await remote.waitForSelector('.r-buzzed');
  await rclick('Juste');
  assert.deepEqual(await scores(host), [0, 1, 0]);

  await remote.click('[data-tool=pause]');
  await host.waitForSelector('#pause.show');
  await remote.click('[data-tool=pause]');
  await host.waitForSelector('#pause:not(.show)', { state: 'attached' });

  // fausses pubs : chaque équipe reçoit un produit différent, en secret
  await remote.click('[data-tool=m-skip]');
  await rclick('C’est parti');
  const products = [];
  for (const p of phones) {
    await p.waitForSelector('.secret-text');
    products.push(await p.textContent('.secret-text'));
  }
  assert.equal(new Set(products).size, 3);
  await rclick('Lancer la concertation');
  assert.match(await phones[2].textContent('.ctl-title'), /Concertation/);
  await rclick('Tout le monde est prêt');
  for (let t = 0; t < 3; t++) {
    await rclick('Action');
    await rclick('Fin de la pub');
    for (const p of phones) {
      const b = await p.$('.choice[data-value=yes]:not([disabled])');
      if (b) await b.click();
    }
    await host.waitForSelector('[data-act=next-perf]', { state: 'attached', timeout: 10000 });
    await rclick(t < 2 ? 'Équipe suivante' : 'Fin de la manche');
  }
  await host.waitForSelector('.podium');
  assert.equal(await phones[0].$('.secret-text'), null, 'cartes secrètes effacées');
  noErrors(errors);
});

test('présentateur : désactivé par défaut, un seul à la fois, changement de QR code', async () => {
  const errors = [];
  const host = await openPage(browser, `${server.url}/host.html`, { errors });
  await setupGame(host, { teams: 2 });
  assert.equal(await host.$('#controls [data-act=m-presenter]'), null);
  await host.click('[data-act=menu]');
  await host.click('[data-act=m-presenter-toggle]'); // activation depuis le menu
  await host.click('[data-act=m-close]');
  const { remote, url } = await openPresenter(browser, host, server.url, errors);
  await remote.waitForSelector('.r-buttons');
  const intrus = await openPage(browser, url, { width: 390, height: 844, errors });
  await intrus.waitForFunction(() => document.body.textContent.includes('déjà connecté'));
  await remote.reload();
  await remote.waitForSelector('.r-buttons'); // le présentateur retrouve sa place
  // changer de présentateur : l'ancien est déconnecté, l'ancien QR code ne marche plus
  await host.click('[data-act=menu]');
  await host.click('[data-act=m-presenter-reset]');
  await host.waitForSelector('.presenter-box img');
  await remote.waitForFunction(() => document.body.textContent.includes('Rescannez'));
  await intrus.goto(url);
  await intrus.waitForFunction(() => document.body.textContent.includes('invalide'));
  const src = await host.getAttribute('.presenter-box img', 'src');
  const url2 = decodeURIComponent(src.split('text=')[1]).replace(/^https?:\/\/[^/]+/, server.url);
  await intrus.goto(url2);
  await intrus.waitForSelector('.r-buttons');
  // désactiver le présentateur le déconnecte
  await host.click('[data-act=m-close]');
  await host.click('[data-act=menu]');
  await host.click('[data-act=m-presenter-toggle]');
  await intrus.waitForFunction(() => document.body.textContent.includes('désactivé'));
  noErrors(errors);
});

test('pas de question en double d’une partie à l’autre', async () => {
  const errors = [];
  const host = await openPage(browser, `${server.url}/host.html`, { errors });
  await setupGame(host, { mode: 'local', teams: 2, twistRate: 0, rounds: ['nuggets'] });
  const asked = [];
  for (let g = 0; g < 3; g++) {
    if (g) await host.click('[data-act=replay]');
    await host.click('[data-act=start-round]');
    for (let i = 0; i < 12; i++) {
      await host.waitForSelector('[data-act=nobody]');
      asked.push(await host.textContent('.question'));
      await host.click('[data-act=nobody]');
      await host.click('[data-act=next]');
    }
    await host.waitForSelector('.podium');
  }
  assert.equal(new Set(asked).size, 36);
  noErrors(errors);
});

test('durée Rapide, chrono de réponse, suspense, score sur les téléphones', async () => {
  const errors = [];
  const host = await openPage(browser, `${server.url}/host.html`, { errors });
  await host.click('[data-act=length][data-v=rapide]');
  assert.match(await host.textContent('.hint b'), /minutes/);
  const code = await setupGame(host, { teams: 2, twistRate: 0, answerTimer: 5, rounds: ['nuggets', 'selpoivre'] });
  const p1 = await joinPhone(browser, server.url, code, 'ketchup', errors);
  const p2 = await joinPhone(browser, server.url, code, 'mayo', errors);
  await host.click('[data-act=begin]');
  await host.click('[data-act=start-round]');
  assert.match(await host.textContent('.top-round'), /Question 1\/5/);

  // bonne réponse : « +1 » et score sur le téléphone, annonce du leader
  await p1.waitForSelector('.buzzer-armed', { timeout: 10000 });
  await p1.dispatchEvent('.buzzer', 'pointerdown');
  await host.click('[data-act=right]');
  await host.waitForFunction(() => document.querySelector('#announce').classList.contains('show'), null, { timeout: 5000 });
  await p1.waitForFunction(() => document.querySelector('#me').textContent.startsWith('1 pt'));
  await host.click('[data-act=next]');

  // chrono de réponse écoulé : rien d'automatique, on tranche à la main
  await p2.waitForSelector('.buzzer-armed', { timeout: 10000 });
  await p2.dispatchEvent('.buzzer', 'pointerdown');
  await p2.waitForSelector('.ctl-timer');
  await host.waitForSelector('.time-up', { timeout: 9000 });
  await host.waitForTimeout(500);
  assert.ok(await host.$('[data-act=right]'), 'les boutons Juste / Fausse restent disponibles');
  await host.click('[data-act=right]');
  await host.waitForSelector('.verdict.good');

  // Sel ou Poivre : roulement de tambour avant la réponse
  await host.click('[data-act=menu]');
  await host.click('[data-act=m-skip]');
  await host.click('[data-act=start-round]');
  await p1.waitForSelector('.choice:not([disabled])', { timeout: 10000 });
  await p1.click('.choice[data-value=sel]');
  await p2.click('.choice[data-value=sel]');
  await host.waitForSelector('.suspense');
  await host.waitForSelector('.answer', { timeout: 6000 });
  noErrors(errors);
});

test('coup de pouce : les équipes dernières marquent double', async () => {
  const errors = [];
  const host = await openPage(browser, null, { errors });
  // réglages forcés : une règle bizarre avant chaque question
  await host.addInitScript(() => {
    if (!localStorage.getItem('bq.host')) localStorage.setItem('bq.host', JSON.stringify({ v: 1, phase: 'setup', settings: { nTeams: 3, twistRate: 1, answerTimer: 0, wrongAnswer: 'none', rounds: ['nuggets'] } }));
  });
  await host.goto(`${server.url}/host.html`);
  await setupGame(host, { mode: 'local' });
  await host.click('[data-act=start-round]');
  let checked = false;
  for (let guard = 0; guard < 60 && !checked; guard++) {
    if (await host.$('.podium')) {
      await host.click('[data-act=replay]');
      await host.click('[data-act=start-round]');
    }
    if (await host.$('.twist-card')) {
      const pouce = (await host.textContent('.twist-title')).includes('pouce');
      await host.click('[data-act=twist-ok]');
      await host.waitForSelector('.panel .buzzer-armed');
      const s = await scores(host);
      const last = s.indexOf(Math.min(...s));
      await localBuzz(host, String(last + 1));
      if (pouce) {
        await host.click('[data-act=right]');
        assert.equal((await scores(host))[last], s[last] + 2, 'Nuggets : +1 doublé');
        checked = true;
      } else {
        // Ketchup marque pour créer un écart, sinon personne n'est « dernier »
        await host.click(s.every((x) => x === s[0]) ? '[data-act=right]' : '[data-act=wrong]');
      }
      await host.click('[data-act=next]');
    }
    await host.waitForTimeout(50);
  }
  assert.ok(checked, 'la règle « Coup de pouce » est sortie');
  noErrors(errors);
});

test('voix de l’animateur (faux ElevenLabs) : textes du jeu seulement, buzzers ouverts après la lecture', async () => {
  const fake = await startFakeElevenLabs();
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bq-tts-test-'));
  const vserver = await startServer({ ELEVENLABS_API_KEY: 'cle-de-test', ELEVENLABS_API_BASE: fake.url, TTS_CACHE_DIR: cacheDir });
  try {
    const tts = (text) => fetch(`${vserver.url}/api/tts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice: 'v-paul' }) });
    assert.equal((await tts('Un texte quelconque assez long pour ne pas être un nom d’équipe')).status, 403);
    assert.equal((await tts('Combien de pattes a une araignée ?')).status, 200);
    assert.equal((await tts('Combien de pattes a une araignée ?')).status, 200);
    assert.equal(fake.calls.filter((c) => c.text === 'Combien de pattes a une araignée ?').length, 1, 'deuxième lecture servie par le cache');

    const errors = [];
    const host = await openPage(browser, `${vserver.url}/host.html`, { errors });
    await host.waitForSelector('[data-set=voice]');
    await host.check('[data-set=voice]');
    await setupGame(host, { mode: 'local', teams: 2, twistRate: 0, rounds: ['nuggets'] });
    await host.click('[data-act=start-round]');
    await host.waitForFunction(() => document.querySelector('.status')?.textContent.includes('animateur'));
    await host.waitForSelector('.panel .buzzer-armed', { timeout: 30000 });
    noErrors(errors);
  } finally {
    vserver.stop();
    fake.stop();
  }
});

test('buzzers seuls : téléphones et écran unique, points, la main passe après une erreur', async () => {
  const errors = [];
  const host = await openPage(browser, `${server.url}/buzzers.html`, { errors });
  const pts = () => host.$$eval('.bz-pts', (els) => els.map((e) => Number(e.textContent)));

  // avec les téléphones
  await host.click('[data-act=n][data-v="2"]');
  await host.click('[data-act=go]');
  await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('.lobby-code')?.textContent));
  const code = await host.textContent('.lobby-code');
  const p1 = await joinPhone(browser, server.url, code, 'ketchup', errors);
  const p2 = await joinPhone(browser, server.url, code, 'mayo', errors);
  // une équipe choisit son nom sur son téléphone
  p2.removeAllListeners('dialog');
  p2.once('dialog', (d) => d.accept('Les Champions'));
  await p2.click('#rename');
  await host.waitForFunction(() => document.querySelector('.lobby-teams').textContent.includes('Les Champions'));
  await p2.waitForFunction(() => document.getElementById('teamName').textContent.includes('Les Champions'));
  await host.click('[data-act=start]');
  await host.click('[data-act=open]');
  await p2.click('.buzzer-armed');
  await host.waitForSelector('.bz-winner');
  assert.match(await host.textContent('.bz-winner'), /Les Champions/);
  await p1.waitForSelector('.buzzer-lost');
  await host.click('[data-act=wrong]'); // faux : seule l'autre équipe peut buzzer
  await p1.click('.buzzer-armed');
  await host.waitForSelector('.bz-winner');
  await host.click('[data-act=right]');
  assert.deepEqual(await pts(), [1, 0]);
  await p1.waitForFunction(() => document.getElementById('me').textContent.includes('1'));
  await p1.close();
  await p2.close();

  // sur un seul écran, avec le clavier et les gros boutons
  await host.click('[data-act=setup]');
  await host.click('[data-act=mode][data-v=local]');
  await host.click('[data-act=n][data-v="3"]');
  await host.click('[data-act=go]');
  await host.click('[data-act=open]');
  await host.keyboard.press('3');
  await host.waitForSelector('.bz-winner');
  assert.match(await host.textContent('.bz-winner'), /Cornichon/);
  await host.click('[data-act=right]');
  await host.click('[data-act=open]');
  await host.click('[data-pad=ketchup]');
  await host.waitForSelector('.bz-winner');
  await host.click('[data-act=right]');
  assert.deepEqual(await pts(), [1, 0, 1]);
  await host.reload(); // les scores survivent à un rechargement
  await host.waitForSelector('.bz-pts');
  assert.deepEqual(await pts(), [1, 0, 1]);
  noErrors(errors);
});

test('appli installable : bouton « Installer », écran de jeu et buzzers hors connexion', async () => {
  const errors = [];
  const context = await browser.newContext();
  const host = await context.newPage();
  host.on('pageerror', (e) => errors.push(e.message));
  await host.goto(`${server.url}/host.html`);
  assert.ok(await host.isVisible('#install'), 'bouton visible sur l’écran des réglages');
  await host.waitForFunction(async () => (await caches.open('bq-v1').then((c) => c.keys())).length > 20, null, { timeout: 15000 });
  await host.evaluate(() => navigator.serviceWorker.ready);
  await host.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  const off = await context.newPage();
  off.on('pageerror', (e) => errors.push(e.message));
  await off.goto(`${server.url}/buzzers.html`);
  await off.click('[data-act=mode][data-v=local]');
  await off.click('[data-act=go]');
  await off.click('[data-act=open]');
  await off.keyboard.press('2');
  await off.waitForSelector('.bz-winner');
  await context.close();
  noErrors(errors);
});
