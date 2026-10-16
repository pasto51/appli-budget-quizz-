# 🍔 Burger Quiz maison

Jeu de soirée façon Burger Quiz, **sans animateur humain**. De **2 à 12 équipes**.

- **Écran de jeu** (télé, tablette, ordinateur) : affiche les questions, annonce les manches, compte les points, joue les bruitages.
- **Buzzer d'équipe** (téléphone) : un gros bouton, le choix Sel/Poivre, les votes, et les cartes secrètes des défis. Quand une équipe buzze la première, l'écran joue son **cri d'animal**.
- **Télécommande du présentateur** (optionnelle) : s'il y a un présentateur, il pilote le jeu depuis son propre téléphone et voit les réponses en avance.
- **Mode tablette unique** : tout se joue sur un seul écran, sans téléphone (secours si le Wi-Fi tombe).

## Version en ligne

**https://appli-budget-quizz.onrender.com/** (hébergée sur Render, offre gratuite : après 15 minutes sans personne, la première ouverture prend environ une minute).

- Écran de jeu : https://appli-budget-quizz.onrender.com/host.html
- Les téléphones rejoignent avec le QR code affiché sur l'écran.

## Lancer une partie sur son ordinateur

Il faut [Node.js](https://nodejs.org) 18 ou plus récent.

```bash
npm install
npm start
```

1. Sur l'ordinateur branché à la télé, ouvrez `http://localhost:3000/host.html`.
2. Choisissez le mode, le nombre d'équipes (2 à 12), les noms et les animaux, puis **Créer la salle**.
3. Chaque équipe scanne le QR code (ou ouvre l'adresse affichée et tape le code à 4 lettres). L'ordinateur et les téléphones doivent être sur **le même Wi-Fi**.
4. **Lancer la partie !**

Plusieurs téléphones peuvent rejoindre la même équipe : ils buzzent tous pour elle.

### Avec un présentateur

À cocher au lancement (« 🎤 Avec un présentateur », désactivé par défaut). Le bouton **🎤 Présentateur** de la salle d'attente (ou du menu ☰) affiche alors un QR code réservé au présentateur : les joueurs détournent les yeux. Sur son téléphone, il a les boutons du jeu, la réponse avant tout le monde, les scores avec correction ±1, la pause et le son. Tant qu'il est connecté, la télé n'affiche plus de boutons.

Sécurité :
- le code de la salle (4 lettres) ne suffit pas : le QR code du présentateur contient une clé secrète ;
- sans présentateur activé, le serveur refuse toute télécommande, même avec la bonne clé ;
- **un seul présentateur** : le premier téléphone connecté garde la place (il la retrouve après une mise en veille), les autres sont refusés ;
- menu ☰ → **Changer de présentateur** : déconnecte le présentateur actuel et génère un nouveau QR code (l'ancien ne marche plus) ; **Désactiver le présentateur** le déconnecte et rend les boutons à la télé.

## Réglages au lancement

| Réglage | Choix |
|---|---|
| Durée de la partie | **Rapide** (~25 min à 3 équipes), **Court**, **Long** (la soirée complète, ~1 h). Change le nombre de questions par manche, de questions par menu, et le nombre d'équipes qui passent aux fausses pubs et aux défis (les autres votent). L'écran affiche une estimation. |
| Mauvaise réponse (Nuggets, L'Addition) | La main passe aux autres équipes (un essai chacune), l'équipe perd 1 point, les deux, ou rien. Pour éviter les buzz au hasard. Le Burger de la mort garde sa règle : −1 et la main passe. |
| Chrono de réponse | Sans, 5, 10, 15 ou 20 s après un buzz (et pour les Menus). À la fin : « Temps écoulé ! », et c'est l'animateur (ou la personne devant l'écran) qui clique Juste ou Fausse. |
| Suspense | Roulement de tambour avant les révélations (Sel ou Poivre, votes), annonce « X prend la tête ! », classement dévoilé avant la dernière manche. |
| Coup de pouce | Règle bizarre qui tombe de temps en temps : la ou les équipes dernières marquent double sur la question. |
| Règles bizarres | Jamais, 1 question sur 5, 1 sur 3. |

Sur les téléphones, chaque équipe voit son score et son rang ; un « +2 » s'affiche et le téléphone vibre quand elle marque (ou perd des points).

## Les manches

Nuggets, Sel ou Poivre, L'Addition, Les Menus, Fausses pubs, Défis et le Burger de la mort, avec les **règles bizarres** tirées au hasard (réglable : jamais, 1 question sur 5 ou sur 3). Chaque manche peut être désactivée au lancement.

Pour les **fausses pubs**, chaque équipe reçoit son produit en secret sur son téléphone, toutes les équipes se concertent en même temps, puis chacune joue sa pub à son tour.

### Banque de contenu

Tout est dans [`public/shared/bank/`](public/shared/bank/), un fichier par manche :

| Fichier | Contenu | Par partie |
|---|---|---|
| `nuggets.js` | 247 questions éclair | 12 |
| `selpoivre.js` | 143 affirmations vrai/faux | 8 |
| `additions.js` | 117 énigmes | 5 |
| `menus.js` | 45 thèmes de 3 questions | 1 par équipe |
| `burgers.js` | 46 questions pièges | 5 |
| `pubs.js` | 60 produits | 1 par équipe |
| `defis.js` | titres à mimer, objets à dessiner, virelangues… | 1 défi par équipe |

Les contenus marqués `// ajouts` ne viennent pas du cahier des charges : **à relire avant une soirée**.

**Pas de répétition :** l'écran retient tout ce qui a déjà été joué, d'une partie à l'autre, et ne repropose rien tant que toute la banque n'y est pas passée (environ 20 parties pour les Nuggets). Cette mémoire est enregistrée dans le navigateur de l'écran de jeu : utilisez le même appareil (et le même navigateur) d'une soirée à l'autre. Pour ajouter des questions, il suffit d'ajouter des lignes dans ces fichiers.

## Sons et voix

- Les **cris d'animaux** sont de vrais enregistrements recalés (voir [`public/sounds/LISEZMOI.md`](public/sounds/LISEZMOI.md)) ; les **bruitages** sont fabriqués par le navigateur.
- Sur iPhone, le son ne démarre qu'après un premier appui : c'est le clic sur « Créer la salle » (écran) ou sur un bouton (téléphone) qui l'active.

### Voix de l'animateur (ElevenLabs, optionnelle)

À cocher au lancement (« 🎙️ Voix de l'animateur »), avec le choix de la voix et de la qualité. L'animateur lit les règles des manches, les règles bizarres, les questions, les réponses, réagit (« Bravo ! », « Raté ! ») et annonce le nouveau leader. Avec la voix, les buzzers s'ouvrent quand il a fini de lire la question.

**Mise en route (une seule fois)** :
1. Sur [elevenlabs.io](https://elevenlabs.io) : *Developers* → *API Keys* → créer une clé (droits « Text to Speech » et « Voices » en lecture).
2. Pour choisir des voix françaises : *Voice Library*, chercher « French », ajouter les voix qui vous plaisent à « My Voices ». Elles apparaîtront dans la liste au lancement du jeu.
3. Sur Render : votre service → *Environment* → ajouter la variable `ELEVENLABS_API_KEY` avec la clé, puis enregistrer (le site redémarre).

Variables facultatives : `ELEVENLABS_VOICE_ID` (voix par défaut), `ELEVENLABS_MODEL` (par défaut `eleven_flash_v2_5`, rapide et économique), `ELEVENLABS_MODEL_QUALITY` (par défaut `eleven_multilingual_v2`), `VOICE_DAILY_CHARS` (plafond de caractères générés par jour, 60 000 par défaut).

**Sécurité et coût** :
- la clé reste sur le serveur, jamais dans le navigateur ;
- le serveur ne fait lire que les textes du jeu (questions, réponses, règles, répliques) ou des textes très courts (noms d'équipe) : impossible de lui faire lire n'importe quoi ;
- chaque phrase n'est générée qu'une fois puis gardée en cache (jusqu'au prochain redémarrage du serveur) ;
- une partie Long consomme de l'ordre de 5 000 à 8 000 caractères en qualité « économique » (le modèle Flash coûte deux fois moins de crédits par caractère).

## Pour les développeurs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) : comment le jeu est construit (écran, serveur, téléphones, buzzer, messages, sécurité).
- [docs/GUIDE-DE-REPRISE.md](docs/GUIDE-DE-REPRISE.md) : installer, tester, ajouter des questions / une règle bizarre / une manche, déployer, dépanner.

En bref : `server.js` relaie l'écran et les téléphones en temps réel (WebSocket) ; `public/host/` est l'écran de jeu, qui connaît les règles et décide de ce qu'affiche chaque téléphone ; `public/play.js` est l'app téléphone ; `public/remote.js` la télécommande ; les questions sont dans `public/shared/bank/`.

## Tests

```bash
npm test             # buzzer et banque de contenu (1 s)
npm run test:e2e     # 10 vraies parties dans un navigateur (2-3 min, Playwright)
```

Ils tournent aussi sur GitHub à chaque envoi.
