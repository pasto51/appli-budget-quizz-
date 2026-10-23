// Hub : la "salle de jeu" partagée entre l'écran animateur et les téléphones.
// Ce module tourne côté serveur (Node) en mode réseau, et directement dans le
// navigateur de l'écran en mode tablette unique. Il ne connaît rien des règles
// du jeu : il relaie les écrans d'équipe, arbitre les buzz et distribue les
// cartes secrètes. L'écran animateur reste le chef d'orchestre.

export const BUZZ_WINDOW_MS = 150; // fenêtre pour départager des buzz quasi simultanés
const MAX_RTT_MS = 600; // au-delà, on ne compense plus (réseau trop instable)

export class Hub {
  constructor({ toHost = () => {}, toDevice = () => {}, now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(t) } = {}) {
    this.toHost = toHost;
    this.toDevice = toDevice;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.teams = [];
    this.devices = new Map(); // deviceId -> { team, connected }
    this.views = {}; // teamId -> vue courante
    this.secrets = new Map(); // deviceId -> carte secrète
    this.buzz = emptyBuzz();
    this.windowTimer = null;
  }

  // ---------- équipes et appareils ----------

  setTeams(teams) {
    this.teams = teams.map(({ id, name, color, ink, animal }) => ({ id, name, color, ink, animal }));
    for (const [id, d] of this.devices) {
      if (d.team && !this.teams.some((t) => t.id === d.team)) d.team = null;
      this.toDevice(id, { t: 'teams', teams: this.teams });
    }
    this.sendDeviceCounts();
  }

  deviceConnect(deviceId) {
    const d = this.devices.get(deviceId) || { team: null, connected: true };
    d.connected = true;
    this.devices.set(deviceId, d);
    this.toDevice(deviceId, { t: 'teams', teams: this.teams });
    if (d.team) this.sendDeviceState(deviceId);
    this.sendDeviceCounts();
  }

  deviceDisconnect(deviceId) {
    const d = this.devices.get(deviceId);
    if (d) d.connected = false;
    this.sendDeviceCounts();
  }

  devicePick(deviceId, team) {
    if (!this.teams.some((t) => t.id === team)) return;
    const d = this.devices.get(deviceId) || { team: null, connected: true };
    if (d.team !== team) this.secrets.delete(deviceId);
    d.team = team;
    this.devices.set(deviceId, d);
    this.sendDeviceState(deviceId);
    this.sendDeviceCounts();
  }

  deviceLeaveTeam(deviceId) {
    const d = this.devices.get(deviceId);
    if (!d) return;
    d.team = null;
    this.secrets.delete(deviceId);
    this.toDevice(deviceId, { t: 'teams', teams: this.teams });
    this.sendDeviceCounts();
  }

  sendDeviceState(deviceId) {
    const d = this.devices.get(deviceId);
    if (!d || !d.team) return;
    this.toDevice(deviceId, {
      t: 'state',
      team: d.team,
      teams: this.teams,
      view: this.views[d.team] || null,
      buzz: this.publicBuzz(),
      secret: this.secrets.get(deviceId) || null,
    });
  }

  sendDeviceCounts() {
    const counts = {};
    for (const t of this.teams) counts[t.id] = 0;
    for (const d of this.devices.values()) if (d.connected && d.team && d.team in counts) counts[d.team]++;
    this.toHost({ t: 'devices', counts });
  }

  devicesOf(team) {
    return [...this.devices.entries()].filter(([, d]) => d.team === team).map(([id]) => id);
  }

  // ---------- vues ----------

  setView(team, view) {
    const targets = team === '*' ? this.teams.map((t) => t.id) : [team];
    for (const id of targets) {
      this.views[id] = view;
      for (const dev of this.devicesOf(id)) this.toDevice(dev, { t: 'view', view });
    }
  }

  // ---------- cartes secrètes ----------

  // target 'device' : un seul téléphone de l'équipe (au hasard parmi les connectés)
  // target 'team' : tous les téléphones de l'équipe
  sendSecret(team, target, payload) {
    const all = this.devicesOf(team);
    const connected = all.filter((id) => this.devices.get(id).connected);
    const pool = connected.length ? connected : all;
    const chosen = target === 'team' ? pool : pool.length ? [pool[Math.floor(Math.random() * pool.length)]] : [];
    for (const dev of chosen) {
      this.secrets.set(dev, payload);
      this.toDevice(dev, { t: 'secret', secret: payload });
    }
    for (const dev of all) {
      if (!chosen.includes(dev)) this.toDevice(dev, { t: 'secret', secret: null, elsewhere: true });
    }
    this.toHost({ t: 'secret:sent', team, devices: chosen.length });
  }

  clearSecrets() {
    for (const dev of this.secrets.keys()) this.toDevice(dev, { t: 'secret', secret: null });
    this.secrets.clear();
  }

  // ---------- buzzer ----------

  publicBuzz() {
    const b = this.buzz;
    return { open: b.open, qid: b.qid, mode: b.mode, eligible: b.eligible, buzzed: b.entries.map((e) => e.team), winner: b.winner };
  }

  broadcastBuzz() {
    const state = this.publicBuzz();
    for (const [id, d] of this.devices) if (d.team) this.toDevice(id, { t: 'buzz', buzz: state });
    this.toHost({ t: 'buzzstate', buzz: state });
  }

  openBuzz({ qid, mode = 'first', eligible }) {
    this.clearTimer(this.windowTimer);
    this.windowTimer = null;
    this.buzz = {
      ...emptyBuzz(),
      open: true,
      qid,
      mode,
      eligible: eligible && eligible.length ? eligible : this.teams.map((t) => t.id),
    };
    this.broadcastBuzz();
  }

  closeBuzz() {
    const b = this.buzz;
    this.clearTimer(this.windowTimer);
    this.windowTimer = null;
    if (b.open && b.mode === 'last' && b.entries.length && !b.winner) {
      this.resolveBuzz();
      return;
    }
    b.open = false;
    this.broadcastBuzz();
  }

  // rtt : aller-retour réseau mesuré par le téléphone, pour compenser sa latence
  teamBuzz(team, { qid, rtt = 0 } = {}) {
    const b = this.buzz;
    if (!b.open || b.winner || qid !== b.qid) return false;
    if (!b.eligible.includes(team)) return false;
    if (b.entries.some((e) => e.team === team)) return false;
    const lag = Math.max(0, Math.min(Number(rtt) || 0, MAX_RTT_MS)) / 2;
    b.entries.push({ team, at: this.now() - lag });

    if (b.mode === 'last') {
      this.broadcastBuzz();
      if (b.entries.length >= b.eligible.length) this.resolveBuzz();
      return true;
    }
    if (b.entries.length === 1) {
      if (b.eligible.length === 1) this.resolveBuzz();
      else this.windowTimer = this.setTimer(() => this.resolveBuzz(), BUZZ_WINDOW_MS);
    } else if (b.entries.length >= b.eligible.length) {
      this.clearTimer(this.windowTimer);
      this.resolveBuzz();
    }
    return true;
  }

  resolveBuzz() {
    const b = this.buzz;
    this.windowTimer = null;
    if (b.winner || !b.entries.length) return;
    const sorted = [...b.entries].sort((x, y) => x.at - y.at);
    b.winner = (b.mode === 'last' ? sorted[sorted.length - 1] : sorted[0]).team;
    b.open = false;
    this.broadcastBuzz();
    this.toHost({ t: 'buzz', team: b.winner, qid: b.qid, order: sorted.map((e) => e.team) });
  }

  // ---------- actions (choix Sel/Poivre, menus, votes) ----------

  teamAction(team, { qid, value }, deviceId = null) {
    if (!this.teams.some((t) => t.id === team)) return;
    this.toHost({ t: 'action', team, qid, value, deviceId });
  }

  // ---------- messages des téléphones ----------

  handleDeviceMessage(deviceId, msg) {
    const d = this.devices.get(deviceId);
    switch (msg.t) {
      case 'pick':
        return this.devicePick(deviceId, msg.team);
      case 'leave':
        return this.deviceLeaveTeam(deviceId);
      case 'buzz':
        if (d && d.team) this.teamBuzz(d.team, msg);
        return;
      case 'action':
        if (d && d.team) this.teamAction(d.team, msg, deviceId);
        return;
      case 'rename': // l'écran décide d'accepter ou non (voir viewFor : canRename)
        if (d && d.team) this.toHost({ t: 'rename', team: d.team, name: cleanName(msg.name) });
        return;
    }
  }
}

export const NAME_MAX = 16;
export function cleanName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

function emptyBuzz() {
  return { open: false, qid: null, mode: 'first', eligible: [], entries: [], winner: null };
}

// Messages envoyés par l'écran animateur. Partagé entre le serveur et le mode
// tablette unique, pour que les deux modes se comportent exactement pareil.
export function handleHostMessage(hub, msg) {
  switch (msg.t) {
    case 'teams':
      return hub.setTeams(msg.teams || []);
    case 'view':
      return hub.setView(msg.team, msg.view);
    case 'buzz:open':
      return hub.openBuzz(msg);
    case 'buzz:close':
      return hub.closeBuzz();
    case 'secret':
      return hub.sendSecret(msg.team, msg.target, msg.payload);
    case 'secret:clear':
      return hub.clearSecrets();
    case 'act': // commande faite sur l'écran au nom d'une équipe (téléphone en panne, mode tablette)
      if (msg.kind === 'buzz') hub.teamBuzz(msg.team, { qid: msg.qid, rtt: 0 });
      else if (msg.kind === 'action') hub.teamAction(msg.team, msg);
      return;
  }
}
