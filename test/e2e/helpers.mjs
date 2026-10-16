// Outils des tests de bout en bout : un vrai serveur, de vrais navigateurs
// (un écran de jeu, des téléphones, une télécommande), pilotés par Playwright.

import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Démarre server.js sur un port libre. */
export async function startServer(env = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('le serveur ne démarre pas :\n' + log)), 10000);
    child.stdout.on('data', () => log.includes('prêt') && (clearTimeout(t), resolve()));
  });
  return { url: `http://127.0.0.1:${port}`, log: () => log, stop: () => child.kill() };
}

/** Faux ElevenLabs : renvoie un vrai mp3 (le cri du coq) et note les textes demandés. */
export async function startFakeElevenLabs() {
  const audio = fs.readFileSync(path.join(ROOT, 'public/sounds/coq.mp3'));
  const calls = [];
  const server = http.createServer((req, res) => {
    if (req.headers['xi-api-key'] !== 'cle-de-test') return res.writeHead(401).end();
    if (req.url.startsWith('/v2/voices')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ voices: [{ voice_id: 'v-paul', name: 'Paul', labels: { gender: 'male' } }, { voice_id: 'v-lea', name: 'Léa', labels: { gender: 'female' } }] }));
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const j = JSON.parse(body);
      calls.push({ voice: req.url.split('?')[0].split('/').pop(), model: j.model_id, text: j.text });
      res.writeHead(200, { 'content-type': 'audio/mpeg' });
      res.end(audio);
    });
  });
  const port = await freePort();
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${port}`, calls, stop: () => server.close() };
}

export async function launchBrowser() {
  return chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--autoplay-policy=no-user-gesture-required'] });
}

/** Ouvre une page dans un contexte isolé (son propre localStorage). Les erreurs JS sont collectées dans errors. */
export async function openPage(browser, url, { width = 1280, height = 800, errors = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  if (url) await page.goto(url);
  return page;
}

/**
 * Remplit l'écran de réglages puis lance la partie.
 * opts : { mode: 'net'|'local', teams, twistRate, rounds: [...], length, answerTimer, wrongAnswer, presenter, suspense }
 */
export async function setupGame(host, opts = {}) {
  await host.waitForSelector('[data-act=create]');
  if (opts.mode) await host.click(`[data-act=mode][data-v=${opts.mode}]`);
  if (opts.teams) await host.click(`[data-act=nteams][data-v="${opts.teams}"]`);
  if (opts.length) await host.click(`[data-act=length][data-v=${opts.length}]`);
  if (opts.twistRate != null) await host.selectOption('[data-set=twistRate]', String(opts.twistRate));
  if (opts.answerTimer != null) await host.selectOption('[data-set=answerTimer]', String(opts.answerTimer));
  if (opts.wrongAnswer) await host.selectOption('[data-set=wrongAnswer]', opts.wrongAnswer);
  if (opts.suspense === false) await host.uncheck('[data-set=suspense]');
  if (opts.presenter) await host.check('[data-set=presenter]');
  if (opts.rounds) for (const r of ['nuggets', 'selpoivre', 'addition', 'menus', 'pubs', 'defis', 'burger']) await host.setChecked(`[data-round=${r}]`, opts.rounds.includes(r));
  await host.click('[data-act=create]');
  if ((opts.mode || 'net') === 'net') {
    await host.waitForFunction(() => /^[A-Z]{4}$/.test(document.querySelector('.lobby-code')?.textContent.trim()));
    return (await host.textContent('.lobby-code')).trim();
  }
  return null;
}

/** Un téléphone rejoint la salle et choisit son équipe. */
export async function joinPhone(browser, base, code, team, errors) {
  const p = await openPage(browser, `${base}/play.html?code=${code}`, { width: 390, height: 800, errors });
  await p.click(`[data-team=${team}]`);
  await p.waitForSelector('.phone-team');
  return p;
}

/** Ouvre la télécommande du présentateur à partir du QR code affiché sur l'écran. */
export async function openPresenter(browser, host, base, errors) {
  await host.click('[data-act=menu]');
  await host.click('#menu [data-act=m-presenter]');
  await host.waitForSelector('.presenter-box img');
  const src = await host.getAttribute('.presenter-box img', 'src');
  const url = decodeURIComponent(src.split('text=')[1]).replace(/^https?:\/\/[^/]+/, base);
  await host.click('[data-act=m-close]');
  const remote = await openPage(browser, url, { width: 390, height: 844, errors });
  return { remote, url };
}

export const scores = (host) => host.$$eval('.score-pts', (els) => els.map((e) => Number(e.textContent)));

/** Clique un bouton de l'écran, même s'il est masqué (télécommande connectée). */
export const clickAct = (page, act) => page.$eval(`[data-act="${act}"]`, (b) => b.click());
