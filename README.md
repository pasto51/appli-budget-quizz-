# 🍔 Burger Quiz maison

Jeu de soirée façon Burger Quiz, **sans animateur humain**. De **2 à 12 équipes**.

- **Écran de jeu** (télé, tablette, ordinateur) : affiche les questions, annonce les manches, compte les points, joue les bruitages.
- **Buzzer d'équipe** (téléphone) : un gros bouton, le choix Sel/Poivre, les votes, et les cartes secrètes des défis. Quand une équipe buzze la première, l'écran joue son **cri d'animal**.
- **Télécommande du présentateur** (optionnelle) : s'il y a un présentateur, il pilote le jeu depuis son propre téléphone et voit les réponses en avance.
- **Mode tablette unique** : tout se joue sur un seul écran, sans téléphone (secours si le Wi-Fi tombe).

## Lancer une partie

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

Dans la salle d'attente (ou plus tard via ☰), le bouton **🎤 Présentateur** affiche un QR code réservé au présentateur : les joueurs détournent les yeux. Sur son téléphone, il a les boutons du jeu (Juste / Fausse, Question suivante…), la réponse avant tout le monde, les scores avec correction ±1, la pause et le son. Tant qu'il est connecté, la télé n'affiche plus de boutons.

### Commandes de l'écran

| Touche / bouton | Effet |
|---|---|
| Espace ou Entrée | Bouton principal (suivant, c'est parti…) |
| P ou ⏸ | Pause (les téléphones affichent « Pause ») |
| 1 à 9, 0 | Buzzer des équipes 1 à 10 (mode tablette, ou « Commandes à l'écran ») |
| ☰ → Corriger les scores | Boutons ±1 sous chaque équipe |
| ☰ → Commandes à l'écran | Remplace le téléphone d'une équipe en panne |
| ☰ → Passer la manche / Terminer | Raccourcir la soirée |

Si l'écran est rechargé, la partie peut être **reprise** là où elle en était. Si un téléphone se met en veille, il retrouve sa place tout seul.

## Réglages au lancement

| Réglage | Choix |
|---|---|
| Durée de la partie | **Rapide** (~25 min à 3 équipes), **Court**, **Long** (la soirée complète, ~1 h). Change le nombre de questions par manche, de questions par menu, et le nombre d'équipes qui passent aux fausses pubs et aux défis (les autres votent). L'écran affiche une estimation. |
| Chrono de réponse | Sans, 5, 10, 15 ou 20 s après un buzz (et pour les Menus). Temps écoulé = réponse fausse. |
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

- Les **cris d'animaux et bruitages** sont fabriqués par le navigateur (Web Audio) : aucun fichier sous droits. Pour utiliser de vrais enregistrements, voir [`public/sounds/LISEZMOI.md`](public/sounds/LISEZMOI.md).
- La **voix de l'animateur** n'est pas encore faite : elle sera produite avec ElevenLabs. Chaque réplique passe déjà par `say(clé, texte)` dans [`public/shared/voice.js`](public/shared/voice.js), il suffira d'y jouer le fichier correspondant.
- Sur iPhone, le son ne démarre qu'après un premier appui : c'est le clic sur « Créer la salle » (écran) ou sur un bouton (téléphone) qui l'active.

## Comment ça marche

- `server.js` sert les pages et relaie l'écran et les téléphones en temps réel (WebSocket). Les salles vivent en mémoire, sans compte ni base de données.
- `public/shared/hub.js` arbitre les buzz : le serveur horodate chaque buzz, **compense la latence** mesurée de chaque téléphone et attend 150 ms pour départager des buzz quasi simultanés. Le même code tourne dans le navigateur en mode tablette unique.
- `public/host.js` est le chef d'orchestre : il connaît l'état du jeu et décide de ce qu'affiche chaque téléphone.
- `public/play.js` est l'app téléphone (installable sur l'écran d'accueil).
- `public/remote.js` est la télécommande du présentateur, protégée par une clé secrète contenue dans son QR code.

Pour héberger le jeu sur Internet plutôt que sur le Wi-Fi de la maison, n'importe quel hébergeur Node.js avec WebSocket convient (Render, Fly.io, Railway…) : la commande de démarrage est `npm start` et le port est lu dans `PORT`.

## Tests

```bash
npm test
```
