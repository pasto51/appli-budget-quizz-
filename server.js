// Serveur Burger Quiz maison : sert les pages et relaie l'écran animateur et les
// téléphones en temps réel (WebSocket). Aucun compte, aucune base de données :
// les salles vivent en mémoire tant que le serveur tourne.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import { Hub, handleHostMessage } from './public/shared/hub.js';
import * as C from './public/shared/content.js';
import { allowedTexts, norm, SHORT_TEXT } from './public/shared/voicelines.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I ni O pour éviter les confusions

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
};

// ---------- voix de l'animateur (ElevenLabs) ----------
// La clé reste sur le serveur (variable d'environnement ELEVENLABS_API_KEY).

const EL_KEY = process.env.ELEVENLABS_API_KEY || '';
const EL_BASE = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io';
const EL_DEFAULT_VOICE = process.env.ELEVENLABS_VOICE_ID || '';
const EL_MODELS = { eco: process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5', qualite: process.env.ELEVENLABS_MODEL_QUALITY || 'eleven_multilingual_v2' };
const DAILY_CHARS = Number(process.env.VOICE_DAILY_CHARS) || 60000; // garde-fou sur les crédits
const ALLOWED = allowedTexts(C);
const TTS_DIR = process.env.TTS_CACHE_DIR || path.join(os.tmpdir(), 'bq-tts'); // voix déjà générées
fs.mkdirSync(TTS_DIR, { recursive: true });
const ttsMemory = new Map(); // clé -> Buffer (les plus récents)
const ttsPending = new Map(); // clé -> Promise<Buffer>
const usage = { day: '', chars: 0 };
const ipHits = new Map(); // ip -> [horodatages des générations non mises en cache]
let voicesCache = { at: 0, list: [] };

async function listVoices() {
  if (!EL_KEY) return [];
  if (Date.now() - voicesCache.at < 10 * 60 * 1000 && voicesCache.list.length) return voicesCache.list;
  const r = await fetch(`${EL_BASE}/v2/voices?page_size=100&include_total_count=false`, { headers: { 'xi-api-key': EL_KEY } });
  if (!r.ok) throw new Error(`voices ${r.status}`);
  const data = await r.json();
  const list = (data.voices || []).map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels || {}, category: v.category || '' }));
  voicesCache = { at: Date.now(), list };
  return list;
}

function readJson(req, max = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) {
        reject(new Error('trop gros'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function overLimit(ip, short) {
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter((t) => now - t < 3600 * 1000);
  ipHits.set(ip, hits);
  return hits.length >= (short ? 80 : 600);
}

async function synthesize(text, voice, model) {
  const key = crypto.createHash('sha1').update(`${voice}|${model}|${text}`).digest('hex');
  if (ttsMemory.has(key)) {
    const buf = ttsMemory.get(key);
    ttsMemory.delete(key);
    ttsMemory.set(key, buf);
    return { buf, cached: true };
  }
  const file = path.join(TTS_DIR, key + '.mp3');
  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    ttsMemory.set(key, buf);
    return { buf, cached: true };
  }
  if (!ttsPending.has(key)) {
    ttsPending.set(
      key,
      (async () => {
        const r = await fetch(`${EL_BASE}/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
          method: 'POST',
          headers: { 'xi-api-key': EL_KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
          body: JSON.stringify({ text, model_id: model, ...(model.startsWith('eleven_flash') ? { language_code: 'fr' } : {}) }),
        });
        if (!r.ok) throw new Error(`ElevenLabs ${r.status} ${(await r.text()).slice(0, 200)}`);
        const buf = Buffer.from(await r.arrayBuffer());
        fs.writeFile(file, buf, () => {});
        ttsMemory.set(key, buf);
        while (ttsMemory.size > 400) ttsMemory.delete(ttsMemory.keys().next().value);
        return buf;
      })().finally(() => ttsPending.delete(key)),
    );
  }
  return { buf: await ttsPending.get(key), cached: false };
}

async function handleTts(req, res) {
  const fail = (code, msg) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: msg }));
  };
  if (!EL_KEY) return fail(503, 'Voix non configurée sur le serveur');
  let body;
  try {
    body = await readJson(req);
  } catch {
    return fail(400, 'Requête invalide');
  }
  const text = norm(body.text || '');
  if (!text) return fail(400, 'Texte vide');
  const known = ALLOWED.has(text);
  if (!known && text.length > SHORT_TEXT) return fail(403, 'Texte non autorisé');
  let voice = String(body.voice || EL_DEFAULT_VOICE);
  try {
    const voices = await listVoices();
    if (!voices.some((v) => v.id === voice)) voice = EL_DEFAULT_VOICE || voices[0]?.id || '';
  } catch {}
  if (!voice) return fail(503, 'Aucune voix disponible');
  const model = EL_MODELS[body.quality] || EL_MODELS.eco;
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const today = new Date().toISOString().slice(0, 10);
  if (usage.day !== today) Object.assign(usage, { day: today, chars: 0 });
  try {
    // le cache ne coûte rien : on ne compte que les nouvelles générations
    const key = crypto.createHash('sha1').update(`${voice}|${model}|${text}`).digest('hex');
    const isCached = ttsMemory.has(key) || fs.existsSync(path.join(TTS_DIR, key + '.mp3'));
    if (!isCached) {
      if (overLimit(ip, !known)) return fail(429, 'Trop de demandes');
      if (usage.chars + text.length > DAILY_CHARS) return fail(429, 'Quota de voix du jour atteint');
      ipHits.get(ip).push(Date.now());
      usage.chars += text.length;
    }
    const { buf } = await synthesize(text, voice, model);
    res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': buf.length, 'cache-control': 'private, max-age=86400' });
    res.end(buf);
  } catch (e) {
    console.error('voix :', e.message);
    fail(502, 'Erreur ElevenLabs');
  }
}

/** @type {Map<string, {code:string, hostToken:string, remoteKey:string, hub:Hub, host:any, sockets:Map<string, any>, remotes:Set<any>, remoteState:any, touched:number}>} */
const rooms = new Map();

function newCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[crypto.randomInt(CODE_LETTERS.length)];
    if (!rooms.has(code)) return code;
  }
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function createRoom(code = newCode(), hostToken = crypto.randomUUID(), remoteKey = crypto.randomBytes(9).toString('base64url')) {
  // remoteKey : clé secrète de la télécommande du présentateur (dans son QR code)
  // remoteAllowed : l'écran a activé le présentateur ; remoteOwner : identifiant du seul téléphone présentateur
  const room = { code, hostToken, remoteKey, remoteAllowed: false, remoteOwner: null, host: null, sockets: new Map(), remotes: new Set(), remoteState: null, touched: Date.now() };
  room.hub = new Hub({
    toHost: (msg) => send(room.host, msg),
    toDevice: (id, msg) => send(room.sockets.get(id), msg),
  });
  rooms.set(code, room);
  return room;
}

function closeRemotes(room, reason) {
  for (const r of room.remotes) {
    send(r, { t: 'error', error: reason });
    r.close(4001, 'présentateur retiré');
  }
  room.remotes.clear();
}

function sendRemoteCount(room) {
  send(room.host, { t: 'remotes', count: room.remotes.size });
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

// ---------- HTTP ----------

// tous les fichiers du site, sauf la documentation
function listPublicFiles(dir = PUBLIC_DIR) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listPublicFiles(full));
    else if (!/\.md$/i.test(e.name)) out.push('/' + path.relative(PUBLIC_DIR, full).split(path.sep).join('/'));
  }
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
    res.end(JSON.stringify({ addresses: lanAddresses(), port: PORT, voice: !!EL_KEY }));
    return;
  }

  if (url.pathname === '/api/voices') {
    try {
      const list = await listVoices();
      res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
      res.end(JSON.stringify({ voices: list, default: EL_DEFAULT_VOICE }));
    } catch (e) {
      console.error('voix :', e.message);
      res.writeHead(502, { 'content-type': MIME['.json'] }).end(JSON.stringify({ voices: [], error: 'ElevenLabs injoignable' }));
    }
    return;
  }

  if (url.pathname === '/api/tts' && req.method === 'POST') {
    await handleTts(req, res);
    return;
  }

  if (url.pathname === '/api/sounds') {
    // sons personnalisés déposés dans public/sounds (voir LISEZMOI.md)
    fs.readdir(path.join(PUBLIC_DIR, 'sounds'), (err, files) => {
      const list = err ? [] : files.filter((f) => /\.(mp3|ogg|wav|m4a)$/i.test(f));
      res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
      res.end(JSON.stringify(list));
    });
    return;
  }

  if (url.pathname === '/api/precache') {
    // fichiers que l'appli installée garde en mémoire (voir public/sw.js)
    res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
    res.end(JSON.stringify(listPublicFiles()));
    return;
  }

  if (url.pathname === '/qr.svg') {
    const text = url.searchParams.get('text') || '';
    try {
      const svg = await QRCode.toString(text.slice(0, 500), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
      res.writeHead(200, { 'content-type': MIME['.svg'], 'cache-control': 'no-store' });
      res.end(svg);
    } catch {
      res.writeHead(400).end();
    }
    return;
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Introuvable');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': st.size,
      'cache-control': 'no-cache',
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
  });
});

// ---------- WebSocket ----------

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  let room = null;
  let role = null; // 'host' | 'device'
  let deviceId = null;

  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'ping') {
      send(ws, { t: 'pong', c: msg.c });
      return;
    }

    if (!role) {
      if (msg.t === 'host:create' || msg.t === 'host:resume') {
        const existing = msg.code && rooms.get(String(msg.code).toUpperCase());
        if (msg.t === 'host:resume' && existing && existing.hostToken === msg.hostToken) room = existing;
        else if (msg.t === 'host:resume' && !existing && msg.code && msg.hostToken) {
          // le serveur a redémarré : on recrée la salle avec le même code
          room = createRoom(String(msg.code).toUpperCase(), String(msg.hostToken), msg.remoteKey ? String(msg.remoteKey) : undefined);
        } else room = createRoom();
        if (room.host && room.host !== ws) room.host.close(4000, 'remplacé');
        room.host = ws;
        role = 'host';
        room.touched = Date.now();
        send(ws, { t: 'room', code: room.code, hostToken: room.hostToken, remoteKey: room.remoteKey });
        room.hub.sendDeviceCounts();
        sendRemoteCount(room);
        return;
      }
      if (msg.t === 'remote:join') {
        const r = rooms.get(String(msg.code || '').toUpperCase());
        if (!r || !msg.key || msg.key !== r.remoteKey) {
          send(ws, { t: 'error', error: 'Lien de présentateur invalide. Rescannez le QR code du présentateur.' });
          return;
        }
        if (!r.remoteAllowed) {
          send(ws, { t: 'error', error: 'Cette partie se joue sans présentateur.' });
          return;
        }
        // un seul présentateur : le premier téléphone garde la place (il la retrouve après une mise en veille)
        const rid = String(msg.rid || '').slice(0, 64);
        if (r.remoteOwner && r.remoteOwner !== rid) {
          send(ws, { t: 'error', error: 'Un présentateur est déjà connecté à cette partie.' });
          return;
        }
        r.remoteOwner = rid || crypto.randomUUID();
        for (const old of r.remotes) old.close(4000, 'remplacé');
        r.remotes.clear();
        room = r;
        role = 'remote';
        room.remotes.add(ws);
        room.touched = Date.now();
        send(ws, { t: 'joined', code: room.code });
        if (room.remoteState) send(ws, { t: 'remote:state', state: room.remoteState });
        sendRemoteCount(room);
        return;
      }
      if (msg.t === 'join') {
        room = rooms.get(String(msg.code || '').toUpperCase());
        if (!room) {
          send(ws, { t: 'error', error: 'Salle introuvable. Vérifie le code affiché sur l’écran.' });
          return;
        }
        deviceId = String(msg.deviceId || crypto.randomUUID()).slice(0, 64);
        const old = room.sockets.get(deviceId);
        if (old && old !== ws) old.close(4000, 'remplacé');
        room.sockets.set(deviceId, ws);
        role = 'device';
        room.touched = Date.now();
        send(ws, { t: 'joined', code: room.code, deviceId });
        room.hub.deviceConnect(deviceId);
        if (msg.team) room.hub.devicePick(deviceId, msg.team);
        return;
      }
      return;
    }

    room.touched = Date.now();
    if (role === 'remote') {
      if (msg.t === 'remote:act') send(room.host, { t: 'remote:act', act: String(msg.act || ''), data: msg.data || {} });
      return;
    }
    if (role === 'host' && msg.t === 'remote:config') {
      room.remoteAllowed = !!msg.allow;
      if (!room.remoteAllowed) {
        room.remoteOwner = null;
        closeRemotes(room, 'Le présentateur a été désactivé sur l’écran de jeu.');
        sendRemoteCount(room);
      }
      return;
    }
    if (role === 'host' && msg.t === 'remote:reset') {
      // changer de présentateur : nouvelle clé, l'ancien QR code ne marche plus
      room.remoteKey = crypto.randomBytes(9).toString('base64url');
      room.remoteOwner = null;
      closeRemotes(room, 'Le présentateur a été changé. Rescannez le nouveau QR code.');
      send(ws, { t: 'room', code: room.code, hostToken: room.hostToken, remoteKey: room.remoteKey });
      sendRemoteCount(room);
      return;
    }
    if (role === 'host' && msg.t === 'remote:state') {
      room.remoteState = msg.state;
      for (const r of room.remotes) send(r, { t: 'remote:state', state: msg.state });
      return;
    }
    if (role === 'host') handleHostMessage(room.hub, msg);
    else room.hub.handleDeviceMessage(deviceId, msg);
  });

  ws.on('close', () => {
    if (!room) return;
    if (role === 'host' && room.host === ws) room.host = null;
    if (role === 'remote') {
      room.remotes.delete(ws);
      sendRemoteCount(room);
    }
    if (role === 'device' && room.sockets.get(deviceId) === ws) {
      room.sockets.delete(deviceId);
      room.hub.deviceDisconnect(deviceId);
    }
  });
});

// battements de cœur pour détecter les téléphones partis en veille, et ménage des vieilles salles
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [code, room] of rooms) if (now - room.touched > ROOM_TTL_MS) rooms.delete(code);
}, 15000).unref();

server.listen(PORT, () => {
  console.log(`\n🍔 Burger Quiz maison prêt !`);
  console.log(`   Écran de jeu : http://localhost:${PORT}/`);
  for (const ip of lanAddresses()) console.log(`   Sur le Wi-Fi : http://${ip}:${PORT}/`);
  console.log('');
});
