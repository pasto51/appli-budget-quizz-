// Vérifie la banque de contenu : à relancer après chaque ajout de questions (npm test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/shared/content.js';
import { allowedTexts } from '../public/shared/voicelines.js';

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

function noDuplicates(list, key, label) {
  const seen = new Set();
  for (const item of list) {
    const k = key(item).trim().toLowerCase();
    assert.ok(!seen.has(k), `${label} en double : « ${key(item)} »`);
    seen.add(k);
  }
}

test('Nuggets : question et réponse, pas de doublon', () => {
  for (const q of C.NUGGETS) assert.ok(nonEmpty(q.q) && nonEmpty(q.a), JSON.stringify(q));
  noDuplicates(C.NUGGETS, (q) => q.q, 'Nugget');
});

test('Sel ou Poivre : vrai/faux et explication', () => {
  for (const q of C.SEL_POIVRE) {
    assert.ok(nonEmpty(q.q) && nonEmpty(q.why), JSON.stringify(q));
    assert.equal(typeof q.sel, 'boolean', `« ${q.q} » : le 2e élément doit être true (Sel) ou false (Poivre)`);
  }
  noDuplicates(C.SEL_POIVRE, (q) => q.q, 'Affirmation');
});

test('L’Addition : au moins 3 mots et un lien', () => {
  for (const q of C.ADDITIONS) {
    assert.ok(Array.isArray(q.words) && q.words.length >= 3 && q.words.every(nonEmpty), JSON.stringify(q));
    assert.ok(nonEmpty(q.a), JSON.stringify(q));
  }
  noDuplicates(C.ADDITIONS, (q) => q.words.join('+'), 'Addition');
});

test('Menus : au moins 3 questions par thème (le mode Long en pose 3)', () => {
  for (const m of C.MENUS) {
    assert.ok(nonEmpty(m.theme));
    assert.ok(m.qs.length >= Math.max(...Object.values(C.LENGTHS).map((L) => L.menuQs)), `thème « ${m.theme} »`);
    for (const q of m.qs) assert.ok(nonEmpty(q.q) && nonEmpty(q.a), `thème « ${m.theme} » : ${JSON.stringify(q)}`);
  }
  noDuplicates(C.MENUS, (m) => m.theme, 'Thème de menu');
});

test('Burger de la mort, produits des pubs', () => {
  for (const q of C.BURGERS) assert.ok(nonEmpty(q.q) && nonEmpty(q.a), JSON.stringify(q));
  noDuplicates(C.BURGERS, (q) => q.q, 'Question piège');
  assert.ok(C.PRODUCTS.every(nonEmpty));
  noDuplicates(C.PRODUCTS, (p) => p, 'Produit');
});

test('chaque durée de partie a assez de contenu pour une partie', () => {
  for (const [k, L] of Object.entries(C.LENGTHS)) {
    assert.ok(C.NUGGETS.length >= L.nuggets, k);
    assert.ok(C.SEL_POIVRE.length >= L.selpoivre, k);
    assert.ok(C.ADDITIONS.length >= L.addition, k);
    assert.ok(C.BURGERS.length >= L.burger, k);
  }
  assert.ok(C.PRODUCTS.length >= C.MAX_TEAMS, 'un produit différent par équipe');
  assert.ok(C.MENUS.length >= C.MAX_TEAMS, 'un thème différent par équipe');
});

test('défis : chaque défi produit son contenu', () => {
  const first = (name, list) => list[0];
  for (const d of C.DEFIS) {
    assert.ok(nonEmpty(d.title) && nonEmpty(d.rules) && nonEmpty(d.vote) && d.seconds > 0, d.id);
    const made = d.make(first);
    assert.ok(made.show || made.secret, `${d.id} : rien à afficher`);
    if (d.secret) assert.ok(made.secret && nonEmpty(made.secret.text), `${d.id} : carte secrète vide`);
  }
});

test('équipes et animaux', () => {
  assert.equal(C.TEAM_PRESETS.length, C.MAX_TEAMS);
  noDuplicates(C.TEAM_PRESETS, (t) => t.id, 'Équipe');
  assert.ok(C.ANIMALS.length >= C.MAX_TEAMS, 'un cri différent par équipe');
  for (const t of C.TEAM_PRESETS) assert.ok(C.ANIMALS.some((a) => a.id === t.animal), `${t.id} : animal inconnu`);
});

test('règles bizarres : manches connues', () => {
  for (const t of C.TWISTS) for (const r of t.rounds) assert.ok(C.ROUNDS[r], `${t.id} : manche « ${r} » inconnue`);
});

test('voix : questions et répliques font partie des textes autorisés', () => {
  const allowed = allowedTexts(C);
  assert.ok(allowed.has(C.NUGGETS[0].q));
  assert.ok(allowed.has(C.WRONG_ANSWER.rebond.rule));
  assert.ok(!allowed.has('Un texte libre qui ne fait pas partie du jeu'));
});
