// État de la partie et petites fonctions partagées par tout l'écran de jeu.
//
// S  : l'état complet de la partie. Il est sauvegardé dans le navigateur à chaque
//      changement (sync), ce qui permet de reprendre une partie après un rechargement.
// rt : l'état « de session » (connexion, téléphones connectés…), jamais sauvegardé.
//
// Règle d'or : on modifie S, puis on appelle sync() (transport.js). Tout le reste
// (téléphones, buzzer, écran, télécommande, sauvegarde) en découle.

import * as C from '../shared/content.js';

export const SAVE_KEY = 'bq.host'; // partie en cours
export const SEEN_KEY = 'bq.seen'; // contenus déjà joués (voir memory.js)
export const $ = (id) => document.getElementById(id);

// localStorage peut être indisponible (navigation privée) : on ignore les erreurs
export const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

// ---------- l'état de la partie ----------

/** Réglages choisis au lancement (écran de création). */
export function defaultSettings() {
  return {
    nTeams: 3, // 2 à 12
    length: 'long', // durée : clé de C.LENGTHS (rapide | court | long)
    rounds: [...C.ROUND_ORDER], // manches jouées, dans l'ordre
    twistRate: 0.2, // probabilité d'une règle bizarre avant chaque question
    selTimer: true, // chrono de 15 s pour Sel ou Poivre
    buzzDuringRead: false, // buzzer ouvert dès l'affichage de la question
    answerTimer: 10, // secondes pour répondre après un buzz (0 = sans chrono)
    suspense: true, // roulement de tambour, annonce du leader, classement avant la finale
    catchup: true, // règle bizarre « Coup de pouce » pour les équipes dernières
    presenter: false, // télécommande du présentateur autorisée
    voice: false, // voix ElevenLabs (seulement si la clé est configurée sur le serveur)
    voiceId: '',
    voiceQuality: 'eco', // eco | qualite
  };
}

/**
 * État complet d'une partie (sauvegardé).
 * - phase : setup → lobby (mode téléphones) → round-intro → play → … → podium
 * - ri : index de la manche en cours dans settings.rounds
 * - R : état de la manche en cours (null hors des manches). Champs communs :
 *     type (nuggets | selpoivre | addition | menus | pubs | defis | burger),
 *     step (étape, voir docs/ARCHITECTURE.md), qid (identifiant de la question ou
 *     du vote en cours : les réponses des téléphones avec un autre qid sont ignorées),
 *     deadline (fin du chrono en cours, en ms), twist (règle bizarre en cours).
 */
export function freshState() {
  return {
    v: 1, // version du format de sauvegarde
    phase: 'setup',
    mode: 'net', // net : téléphones + serveur ; local : tablette unique
    code: null, // code de la salle (4 lettres)
    hostToken: null, // prouve au serveur que cet écran est bien l'hôte de la salle
    remoteKey: null, // clé secrète du QR code présentateur
    settings: defaultSettings(),
    teams: C.TEAM_PRESETS.map((t) => ({ ...t, score: 0 })),
    ri: 0,
    R: null,
    seq: 0, // compteur pour fabriquer des qid uniques
    swapUsed: false, // la règle « Échange » ne sort qu'une fois par partie
    leader: null, // équipe seule en tête (pour l'annonce « prend la tête »)
    performed: [], // équipes déjà passées aux pubs ou aux défis (modes Rapide et Court)
    paused: false,
    pausedAt: 0,
    showPanels: false, // commandes des équipes affichées sur l'écran (mode téléphones)
    adjust: false, // boutons ±1 de correction des scores
    secrets: {}, // teamId -> { payload, target } : cartes secrètes en cours
  };
}

export let S = freshState();

// remplace tout l'état (reprise d'une partie, nouvelle partie)
export function setState(next) {
  S = next;
}

// ---------- état de session (jamais sauvegardé) ----------

export const rt = {
  resumePrompt: false, // proposer de reprendre la partie sauvegardée
  deviceCounts: {}, // teamId -> nombre de téléphones connectés
  buzzState: null, // dernier état du buzzer reçu du hub (pour les panneaux à l'écran)
  net: null, // Socket vers le serveur (mode téléphones)
  hub: null, // Hub local (mode tablette unique)
  connStatus: 'idle', // état de la connexion au serveur
  joinUrl: '', // adresse à scanner pour rejoindre
  joinOrigin: '', // origine (http://ip:port) utilisée dans les QR codes
  remoteCount: 0, // télécommandes de présentateur connectées
  lastViews: {}, // teamId -> dernière vue envoyée (JSON), pour n'envoyer que les changements
  bumped: {}, // teamId -> horodatage du dernier changement de score (animation)
  buzzOpenKey: null, // qid du buzzer actuellement ouvert
  lastRemote: '', // dernier état envoyé à la télécommande (JSON)
};

// ---------- partie sauvegardée ----------

// Au chargement : on reprend les réglages et les équipes de la dernière partie,
// et on proposera de reprendre la partie elle-même si elle n'était pas finie.
export const saved = store.get(SAVE_KEY);
if (saved?.teams) for (const t of saved.teams) if (t.animal === 'ane') t.animal = 'cheval'; // ancien animal remplacé
if (saved && saved.v === 1) S.settings = { ...defaultSettings(), ...saved.settings };
if (saved?.teams) S.teams = C.TEAM_PRESETS.map((p, i) => ({ ...p, name: saved.teams[i]?.name || p.name, animal: saved.teams[i]?.animal || p.animal, score: 0 }));
rt.resumePrompt = !!(saved && saved.v === 1 && saved.phase !== 'setup');

// ---------- raccourcis ----------

export const activeTeams = () => S.teams.slice(0, S.settings.nTeams);
export const teamById = (id) => S.teams.find((t) => t.id === id);
export const animalOf = (t) => C.ANIMALS.find((a) => a.id === t.animal) || C.ANIMALS[0];
export const roundType = () => S.settings.rounds[S.ri];
export const newQid = () => `${S.ri}.${++S.seq}`;
export const len = () => C.LENGTHS[S.settings.length] || C.LENGTHS.long; // réglages de la durée choisie
export const menuQs = () => S.R?.nq || len().menuQs; // questions par menu
export const roundRules = (type) => C.ROUNDS[type].rules.replace('{n}', String(menuQs()));

export function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// estimation grossière de la durée, en minutes, pour l'écran de réglages
export function estimateMinutes(st) {
  const L = C.LENGTHS[st.length] || C.LENGTHS.long;
  const n = st.nTeams;
  const perf = Math.min(L.performers, n);
  const secs = {
    nuggets: L.nuggets * 40,
    selpoivre: L.selpoivre * 35,
    addition: L.addition * 45,
    menus: n * (20 + L.menuQs * 30),
    pubs: 60 + perf * 120,
    defis: perf * 110,
    burger: L.burger * 45,
  };
  const total = st.rounds.reduce((sum, r) => sum + secs[r] + 30, 60);
  return Math.max(5, Math.round(total / 300) * 5);
}

// ---------- scores et classement ----------

export function ranking() {
  return [...activeTeams()].sort((a, b) => b.score - a.score);
}

// les ex aequo partagent la même place
export function rankOf(team) {
  return 1 + activeTeams().filter((t) => t.score > team.score).length;
}

// équipes dernières, seulement s'il y a un vrai retard (pas d'égalité générale)
export function lastTeams() {
  const teams = activeTeams();
  const min = Math.min(...teams.map((t) => t.score));
  const max = Math.max(...teams.map((t) => t.score));
  if (min === max) return [];
  return teams.filter((t) => t.score === min);
}

// règle bizarre « Coup de pouce » en cours pour cette équipe
export const boosted = (teamId) => !!S.R?.twist?.boost?.includes(teamId);

// règle bizarre « Triple points »
export const mult = () => (S.R?.twist?.id === 'triple' ? 3 : 1);

// points réellement gagnés : doublés pour une équipe qui a le coup de pouce
export function effective(teamId, delta) {
  return delta > 0 && boosted(teamId) ? delta * 2 : delta;
}

// Ajoute des points et rend le nombre réellement ajouté.
// raw : correction manuelle (boutons ±1), jamais modifiée par les règles.
export function addScore(teamId, delta, raw = false) {
  const t = teamById(teamId);
  if (!t || !delta) return 0;
  const d = raw ? delta : effective(teamId, delta);
  t.score += d;
  rt.bumped[teamId] = Date.now();
  return d;
}
