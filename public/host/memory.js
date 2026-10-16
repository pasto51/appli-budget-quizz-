// Mémoire des contenus déjà joués, d'une partie à l'autre, pour ne pas reposer
// deux fois la même question tant que toute la banque n'y est pas passée.
// Elle est stockée dans le navigateur de l'écran de jeu (localStorage).

import { SEEN_KEY, shuffle, store } from './state.js';

// On retient le texte de chaque question, pas sa position : ajouter des
// questions à la banque ne mélange rien.
const keyOf = (x) => (typeof x === 'string' ? x : x.q || (x.words && x.words.join('+')) || x.theme || x.line || x.cat || JSON.stringify(x));

// indices de la liste, ceux jamais joués d'abord (dans un ordre aléatoire)
export function orderFresh(bank, list) {
  const seen = new Set((store.get(SEEN_KEY) || {})[bank] || []);
  const idx = shuffle([...list.keys()]);
  return [...idx.filter((i) => !seen.has(keyOf(list[i]))), ...idx.filter((i) => seen.has(keyOf(list[i])))];
}

export function markSeen(bank, items) {
  const all = store.get(SEEN_KEY) || {};
  const seen = new Set(all[bank] || []);
  for (const it of items) seen.add(keyOf(it));
  all[bank] = [...seen];
  store.set(SEEN_KEY, all);
}

// tire n éléments jamais joués ; quand toute la banque y est passée, un nouveau cycle commence
export function pickFresh(bank, list, n) {
  const seen = new Set((store.get(SEEN_KEY) || {})[bank] || []);
  const unseen = list.filter((x) => !seen.has(keyOf(x))).length;
  const chosen = orderFresh(bank, list).slice(0, n).map((i) => list[i]);
  if (unseen < n) {
    const all = store.get(SEEN_KEY) || {};
    delete all[bank];
    store.set(SEEN_KEY, all);
  }
  markSeen(bank, chosen);
  return chosen;
}

// tirage pour les défis : un élément jamais tiré de la liste « nom »
export const pickDefi = (name, list) => pickFresh(`defi:${name}`, list, 1)[0];
