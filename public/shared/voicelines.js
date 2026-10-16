// Répliques de l'animateur (voix ElevenLabs) et liste des textes autorisés.
// Le serveur ne fait lire QUE des textes du jeu (ou des textes très courts,
// comme les noms d'équipe) : personne ne peut utiliser les crédits ElevenLabs
// pour lui faire dire n'importe quoi.

export const LINES = {
  welcome: 'Bienvenue dans le Burger Quiz maison !',
  twist: 'Règle bizarre !',
  winnerIs: 'Et l’équipe gagnante est…',
  menuPick: 'choisissez votre menu.',
  pubsBrief: 'Chaque équipe a reçu son produit sur son téléphone. Préparez vos pubs !',
  pubTurn: 'Au tour de',
  yourProduct: 'Votre produit :',
  defi: 'Défi :',
  lead: 'prend la tête !',
  pouce: 'vos points comptent double sur cette question !',
  sel: 'Sel !',
  poivre: 'Poivre !',
  suspenseSel: 'Et la réponse est…',
  suspenseVote: 'Le verdict…',
  timeout: 'Temps écoulé !',
  othersTurn: 'Aux autres équipes !',
};

// petites vannes tirées au hasard
export const GOOD = ['Bonne réponse !', 'Bravo !', 'Exactement !', 'Et c’est gagné !', 'Joli !', 'Parfait, rien à redire.'];
export const BAD = ['Raté !', 'Eh non…', 'Pas du tout !', 'Aïe aïe aïe…', 'Perdu !', 'C’était presque… non, même pas.'];

export const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

// Textes que l'écran peut demander à faire lire, construits à partir du contenu du jeu.
export function allowedTexts(C) {
  const set = new Set();
  const add = (t) => t && set.add(norm(t));
  Object.values(LINES).forEach(add);
  GOOD.forEach(add);
  BAD.forEach(add);
  for (const r of Object.values(C.ROUNDS)) {
    add(r.title);
    for (const n of [2, 3, 4, 5]) add(r.rules.replace('{n}', String(n)));
  }
  for (const w of Object.values(C.WRONG_ANSWER)) add(w.rule);
  for (const t of C.TWISTS) {
    add(t.title);
    const texts = [t.text];
    if (t.text.includes('{accent}')) texts.splice(0, 1, ...C.ACCENTS.map((a) => t.text.replace('{accent}', a)));
    if (t.text.includes('{who}')) texts.splice(0, 1, ...C.SPOKESPERSON.map((w) => t.text.replace('{who}', w)));
    texts.forEach(add);
  }
  for (const q of C.NUGGETS) add(q.q), add(q.a);
  for (const q of C.SEL_POIVRE) add(q.q), add(q.why);
  for (const q of C.ADDITIONS) add(q.words.join(', ')), add(q.a);
  for (const m of C.MENUS) {
    add(m.theme);
    for (const q of m.qs) add(q.q), add(q.a);
  }
  for (const q of C.BURGERS) add(q.q), add(q.a);
  C.PRODUCTS.forEach(add);
  for (const d of C.DEFIS) add(d.title), add(d.rules);
  return set;
}

export const SHORT_TEXT = 32; // textes libres autorisés (noms d'équipe…) jusqu'à cette longueur

export function norm(t) {
  return String(t).replace(/\s+/g, ' ').trim();
}
