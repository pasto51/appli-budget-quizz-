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

/** @type {Map<string, {code:string, hostToken:string, hub:Hub, host:any, sockets:Map<string, any>, touched:number}>} */
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

function createRoom(code = newCode(), hostToken = crypto.randomUUID()) {
  const room = { code, hostToken, host: null, sockets: new Map(), touched: Date.now() };
  room.hub = new Hub({
    toHost: (msg) => send(room.host, msg),
    toDevice: (id, msg) => send(room.sockets.get(id), msg),
  });
  rooms.set(code, room);
  return room;
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  }
  return out;
}

// ---------- HTTP ----------

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
    res.end(JSON.stringify({ addresses: lanAddresses(), port: PORT }));
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
          room = createRoom(String(msg.code).toUpperCase(), String(msg.hostToken));
        } else room = createRoom();
        if (room.host && room.host !== ws) room.host.close(4000, 'remplacé');
        room.host = ws;
        role = 'host';
        room.touched = Date.now();
        send(ws, { t: 'room', code: room.code, hostToken: room.hostToken });
        room.hub.sendDeviceCounts();
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
    if (role === 'host') handleHostMessage(room.hub, msg);
    else room.hub.handleDeviceMessage(deviceId, msg);
  });

  ws.on('close', () => {
    if (!room) return;
    if (role === 'host' && room.host === ws) room.host = null;
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
