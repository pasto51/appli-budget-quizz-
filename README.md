# 🍔 Burger Quiz maison

Jeu de soirée façon Burger Quiz, **sans animateur humain**. De **2 à 12 équipes**.

- **Écran de jeu** (télé, tablette, ordinateur) : affiche les questions, annonce les manches, compte les points, joue les bruitages.
- **Buzzer d'équipe** (téléphone) : un gros bouton, le choix Sel/Poivre, les votes, et les cartes secrètes des défis. Quand une équipe buzze la première, l'écran joue son **cri d'animal**.
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

## Les manches

Nuggets, Sel ou Poivre, L'Addition, Les Menus, Fausses pubs, Défis et le Burger de la mort, avec les **règles bizarres** tirées au hasard (réglable : jamais, 1 question sur 5 ou sur 3). Chaque manche peut être désactivée au lancement.

Le contenu (questions, affirmations, énigmes, menus, produits, défis) est dans [`public/shared/content.js`](public/shared/content.js). Les questions marquées `// ajout` complètent la banque du cahier des charges : **à relire avant une soirée**. Le jeu évite de reposer les mêmes questions d'une partie à l'autre tant que la banque n'est pas épuisée.

## Sons et voix

- Les **cris d'animaux et bruitages** sont fabriqués par le navigateur (Web Audio) : aucun fichier sous droits. Pour utiliser de vrais enregistrements, voir [`public/sounds/LISEZMOI.md`](public/sounds/LISEZMOI.md).
- La **voix de l'animateur** n'est pas encore faite : elle sera produite avec ElevenLabs. Chaque réplique passe déjà par `say(clé, texte)` dans [`public/shared/voice.js`](public/shared/voice.js), il suffira d'y jouer le fichier correspondant.
- Sur iPhone, le son ne démarre qu'après un premier appui : c'est le clic sur « Créer la salle » (écran) ou sur un bouton (téléphone) qui l'active.

## Comment ça marche

- `server.js` sert les pages et relaie l'écran et les téléphones en temps réel (WebSocket). Les salles vivent en mémoire, sans compte ni base de données.
- `public/shared/hub.js` arbitre les buzz : le serveur horodate chaque buzz, **compense la latence** mesurée de chaque téléphone et attend 150 ms pour départager des buzz quasi simultanés. Le même code tourne dans le navigateur en mode tablette unique.
- `public/host.js` est le chef d'orchestre : il connaît l'état du jeu et décide de ce qu'affiche chaque téléphone.
- `public/play.js` est l'app téléphone (installable sur l'écran d'accueil).

Pour héberger le jeu sur Internet plutôt que sur le Wi-Fi de la maison, n'importe quel hébergeur Node.js avec WebSocket convient (Render, Fly.io, Railway…) : la commande de démarrage est `npm start` et le port est lu dans `PORT`.

## Tests

```bash
npm test
```
