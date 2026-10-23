# Guide de reprise

Pour prendre la main sur le projet. L'architecture est décrite dans
[ARCHITECTURE.md](ARCHITECTURE.md) ; lisez-la d'abord (10 minutes).

## Installer et lancer

Il faut [Node.js](https://nodejs.org) 18 ou plus récent (20 conseillé).

```bash
npm install
npm start            # http://localhost:3000/host.html
```

Pour tester avec un téléphone sur le même Wi-Fi, utilisez l'adresse affichée par
le serveur (`Sur le Wi-Fi : http://192.168.x.x:3000/`) : le QR code de la salle
d'attente pointe dessus automatiquement.

Astuce : ouvrez `play.html` dans plusieurs onglets de navigation privée pour
simuler plusieurs téléphones.

## Tests

| Commande | Ce qu'elle vérifie | Durée |
|---|---|---|
| `npm test` | Arbitrage du buzzer, banque de contenu (champs, doublons, quantités) | 1 s |
| `npm run test:e2e` | 10 vraies parties dans un navigateur : téléphones, tablette unique, présentateur, 12 équipes, durées, chronos, règles bizarres, pas de répétition, voix (avec un faux ElevenLabs) | 2-3 min |

Les tests de bout en bout utilisent Playwright. La première fois :

```bash
npx playwright install chromium
```

**Avant chaque mise en ligne, lancez les deux.** Les tests tournent aussi sur
GitHub à chaque envoi (`.github/workflows/tests.yml`).

## Conventions

- Code et commentaires **en français**, comme le reste du projet.
- Mise en forme : 2 espaces, guillemets simples, point-virgule, lignes longues
  acceptées (style Prettier, largeur 200). Voir `.editorconfig`.
- Pas d'étape de compilation, pas de framework : modules ES servis tels quels.
- **Règle d'or de l'écran de jeu** : on modifie `S` (ou `S.R`), puis on appelle
  `sync()`. Ne jamais envoyer une vue à un téléphone « à la main ».
- Textes affichés : apostrophes typographiques (’), guillemets « … ».

## Tâches courantes

### Ajouter ou corriger des questions

Tout est dans `public/shared/bank/`. Une ligne = un contenu :

```js
// nuggets.js : [question, réponse]
['Quelle est la capitale du Portugal ?', 'Lisbonne'],
// selpoivre.js : [affirmation, vrai ?, explication]   (true = Sel, false = Poivre)
['Les pieuvres ont trois cœurs.', true, 'Deux pompent le sang vers les branchies…'],
// additions.js : [[mots], lien]
[['Athos', 'Porthos', 'Aramis'], 'Les Trois Mousquetaires'],
// menus.js : [thème, [[question, réponse] × 3 ou plus]]
// burgers.js : [question piège, réponse]
// pubs.js : 'Un produit'
```

Puis `npm test` : il signale les doublons et les champs manquants. Les
nouvelles questions sont proposées en priorité (elles n'ont jamais été jouées).

### Modifier les points, durées, réglages par défaut

- Nombre de questions par durée (Rapide / Court / Long) : `LENGTHS` dans `public/shared/content.js`.
- Règles affichées des manches : `ROUNDS` dans `content.js`.
- Réglages par défaut au lancement : `defaultSettings()` dans `public/host/state.js`.
- Points gagnés : `judgeBuzz`, `judgeMenu`, `reveal`, `closeVote` dans `public/host/game.js`.

### Ajouter une règle bizarre

1. Ajoutez-la à `TWISTS` dans `content.js` (`id`, `title`, `text`, manches concernées).
2. Si elle change les points ou le déroulé, codez l'effet dans `game.js`
   (exemples : `triple` dans `mult()` de `state.js`, `vol` dans `applySteal`,
   `dernier` dans `sync()` de `transport.js`).
3. Si elle a besoin d'un bouton à l'écran, voir `laughButtons` (règle « Interdiction de rire ») dans `play-screens.js`.

### Ajouter un défi

Ajoutez-le à `DEFIS` dans `content.js` : `secret` vaut `'device'` (un seul
téléphone voit la carte), `'team'` (toute l'équipe) ou `null` (affiché à l'écran) ;
`make(pick)` fabrique le contenu (`pick('nom', liste)` tire sans répétition) ;
`vote` est la question posée aux autres équipes (« Oui » = réussi).
Les listes de mots à mimer, dessiner… sont dans `bank/defis.js`.

### Ajouter une manche

1. `ROUNDS` et `ROUND_ORDER` dans `content.js` (titre, règles).
2. `startRound()` dans `game.js` : initialiser `S.R` et lancer la première étape.
3. Les étapes et les points dans `game.js` (s'inspirer d'une manche proche).
4. Ce que voient les téléphones : `viewFor()` dans `views.js`.
5. L'écran : une fonction `render…` dans `play-screens.js`, appelée par `renderPlay()`.
6. Les boutons : `data-act="…"` dans le rendu, et le `case` correspondant dans `doAct()` (`actions.js`).
7. La télécommande : `presenterSecret()` et `pointsAtStake()` dans `presenter.js`.
8. Un test dans `test/e2e/game.e2e.test.mjs`.

### Changer un cri d'animal ou un bruitage

Déposez un fichier dans `public/sounds/` (voir `public/sounds/LISEZMOI.md`,
avec la commande pour recaler un cri). Pour un nouvel animal : `ANIMALS` dans
`content.js`, puis le fichier `public/sounds/<id>.mp3`.

## Déploiement

Le site en ligne est sur **Render** (offre gratuite) :
https://appli-budget-quizz.onrender.com/

- Render reconstruit et redémarre le site à chaque envoi sur la branche suivie
  (réglage du service sur render.com). Commande de construction : `npm install` ;
  de démarrage : `npm start`.
- Offre gratuite : le site s'endort après 15 minutes sans visite (1 minute de
  réveil) et les salles en cours sont perdues à chaque redémarrage (l'écran de
  jeu recrée sa salle avec le même code et les téléphones se reconnectent).
- N'importe quel hébergeur Node.js avec WebSocket convient (Fly.io, Railway, un
  Raspberry Pi…) : le port est lu dans `PORT`.

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `PORT` | Port HTTP (3000 par défaut) |
| `ELEVENLABS_API_KEY` | Active la voix de l'animateur (payant, optionnel) |
| `ELEVENLABS_VOICE_ID` | Voix par défaut |
| `ELEVENLABS_MODEL` / `ELEVENLABS_MODEL_QUALITY` | Modèles « économique » et « qualité » |
| `ELEVENLABS_API_BASE` | Adresse de l'API (les tests y mettent un faux serveur) |
| `VOICE_DAILY_CHARS` | Plafond de caractères générés par jour (60 000) |
| `TTS_CACHE_DIR` | Dossier du cache des voix (dossier temporaire par défaut) |

## Dépannage

| Symptôme | Piste |
|---|---|
| Pas de son sur iPhone / iPad | Il faut un premier appui sur l'écran ; vérifier le mode silencieux du téléphone |
| Le QR code pointe vers `localhost` | Ouvrir l'écran avec l'adresse Wi-Fi du serveur, ou vérifier `/api/info` |
| Un téléphone ne buzze plus | Recharger la page : il retrouve son équipe. Sinon menu ☰ → « Commandes à l'écran » |
| La partie a planté | Recharger l'écran : « Reprendre la partie » |
| Une question revient trop souvent | La mémoire est par appareil (`bq.seen` dans le navigateur de l'écran) |
| L’écran se met en veille | `public/shared/awake.js` (Wake Lock, ou petite vidéo muette sur les vieux iPhone) ; s’active au premier appui. Le mode Économie d’énergie de l’iPhone peut quand même verrouiller |
| L’icône de la tablette ouvre la page des joueurs | Supprimer l’icône, ouvrir `/host.html` puis « Sur l’écran d’accueil » (`manifest-host.webmanifest` ; les joueurs ont `manifest.webmanifest`) |
| L’appli installée montre une vieille version | Elle prend la dernière version dès qu’elle a du réseau (`public/sw.js`, « réseau d’abord ») ; sinon la fermer complètement et la rouvrir |
| Le présentateur ne peut plus se connecter | Menu ☰ → « Changer de présentateur » (nouveau QR code) |

Outils de diagnostic dans le navigateur de l'écran (console) :
`JSON.parse(localStorage['bq.host'])` montre l'état sauvegardé ;
`localStorage.removeItem('bq.seen')` remet à zéro la mémoire des questions.

## Limites connues et pistes

- La mémoire « pas de répétition » est propre à chaque écran (navigateur).
- Les vibrations ne marchent pas sur iPhone (limite de Safari).
- Les salles sont en mémoire : un redémarrage du serveur oblige l'écran à recréer
  la salle (automatique) ; une base de données n'apporterait pas grand-chose ici.
- Voix : prête mais désactivée (ElevenLabs est payant). Une voix gratuite du
  navigateur (`speechSynthesis`) pourrait être branchée dans `public/shared/voice.js`.
