# Architecture

Ce document explique comment le jeu est construit. Pour les tâches courantes
(ajouter des questions, une manche, déployer…), voir [GUIDE-DE-REPRISE.md](GUIDE-DE-REPRISE.md).

## Vue d'ensemble

```
            ┌──────────────────────────┐
            │  Écran de jeu (host.html)│  le chef d'orchestre : état de la partie,
            │  public/host/*.js        │  règles, scores, affichage télé
            └────────────┬─────────────┘
                         │ WebSocket /ws
            ┌────────────┴─────────────┐
            │  server.js  (Node)       │  sert les pages, une « salle » par partie
            │  └─ Hub (shared/hub.js)  │  relaie les écrans, arbitre les buzz
            └──┬───────────────────┬───┘
               │ WebSocket /ws     │ WebSocket /ws
  ┌────────────┴──────┐   ┌────────┴──────────────┐
  │ Téléphones        │   │ Télécommande          │
  │ play.html/play.js │   │ remote.html/remote.js │
  │ (1 ou + / équipe) │   │ (présentateur, option)│
  └───────────────────┘   └───────────────────────┘
```

- **Pas de base de données, pas de compte.** Une salle vit en mémoire du serveur
  (12 h sans activité au maximum). L'état de la partie est sauvegardé dans le
  navigateur de l'écran de jeu (`localStorage`).
- **L'écran de jeu décide de tout.** Le serveur et le hub ne connaissent pas les
  règles : ils transmettent ce que l'écran veut afficher sur chaque téléphone,
  arbitrent les buzz et distribuent les cartes secrètes.
- **Mode tablette unique** : le même `Hub` tourne directement dans le navigateur
  de l'écran (sans serveur de jeu) ; les « téléphones » sont des panneaux en bas
  de l'écran. Le code du jeu ne fait aucune différence entre les deux modes.
- **Aucune étape de compilation** : JavaScript moderne (modules ES) servi tel quel.

## Les fichiers

| Fichier | Rôle |
|---|---|
| `server.js` | Serveur HTTP + WebSocket : pages, salles, QR codes, voix ElevenLabs (option) |
| `public/host.html` + `public/host/` | Écran de jeu (détail ci-dessous) |
| `public/play.html` + `play.js` | App téléphone d'une équipe : buzzer, choix, votes, carte secrète, score |
| `public/buzzers.html` + `buzzers.js` | « Buzzers seuls » : les buzzers et les scores sans les questions (même hub, même app téléphone ; état dans `bq.buzzers`) |
| `public/shared/awake.js` | Empêche la mise en veille (Wake Lock + petite vidéo muette sur iOS) |
| `public/remote.html` + `remote.js` | Télécommande du présentateur |
| `public/index.html` | Accueil (choix écran / téléphone) |
| `public/style.css` | Tous les styles (écran, téléphone, télécommande) |
| `public/shared/hub.js` | Salle de jeu : appareils, vues des équipes, **arbitrage des buzz**, cartes secrètes. Utilisé par le serveur ET par le mode tablette |
| `public/shared/net.js` | Connexion WebSocket avec reconnexion automatique et mesure de latence |
| `public/shared/controls.js` | Dessine les commandes d'une équipe (buzzer, choix, carte secrète) — téléphone et panneaux de l'écran |
| `public/shared/sounds.js` | Cris d'animaux (fichiers `public/sounds/`) et bruitages synthétisés (Web Audio) |
| `public/shared/voice.js` + `voicelines.js` | Voix de l'animateur (ElevenLabs) et liste des textes autorisés |
| `public/shared/content.js` | Réglages du jeu : équipes, animaux, manches, durées, règles bizarres, défis |
| `public/shared/bank/*.js` | **La banque de questions**, un fichier par manche |
| `test/` | Tests (voir le guide de reprise) |

### L'écran de jeu (`public/host/`)

| Module | Rôle |
|---|---|
| `main.js` | Point d'entrée |
| `state.js` | `S` (état de la partie, sauvegardé), `rt` (état de session), réglages par défaut, scores, classement |
| `memory.js` | Mémoire des contenus déjà joués (pas de répétition d'une partie à l'autre) |
| `transport.js` | Lien avec le hub ; **`sync()`** |
| `views.js` | `viewFor(team)` : ce qu'affiche le téléphone de chaque équipe |
| `game.js` | **Les règles** : déroulé des manches, règles bizarres, chronos, pause |
| `render.js` | Cadre de l'écran : barre du haut, scores, panneaux, menu, annonces |
| `screens.js` | Écrans hors questions : réglages, salle d'attente, intro de manche, podium |
| `play-screens.js` | Écrans des manches |
| `presenter.js` | Résumé envoyé à la télécommande et exécution de ses boutons |
| `actions.js` | `doAct()` : tous les boutons (`data-act`), réglages, clavier |
| `voice.js` | Branchement de la voix sur le jeu |

## Le principe central : modifier l'état, puis `sync()`

Toute action suit le même chemin :

```
clic sur l'écran / bouton de la télécommande / message d'un téléphone
        │
        ▼
doAct() (actions.js)  ou  onBuzz / onAction (game.js)
        │  modifie S (et S.R pour la manche en cours)
        ▼
sync() (transport.js)
        ├─ calcule la vue de chaque équipe (views.js) et n'envoie que celles qui ont changé
        ├─ ouvre / ferme le buzzer selon S.R.step
        ├─ annonce un nouveau leader si besoin
        ├─ sauvegarde S dans le navigateur
        └─ redessine l'écran (render.js) et la télécommande (presenter.js)
```

Conséquences pratiques :
- les téléphones et la télécommande n'ont **aucune logique de jeu** : ils affichent
  ce qu'on leur envoie et renvoient des actions ;
- une page rechargée (écran, téléphone, télécommande) retrouve exactement son état ;
- pour comprendre un écran, il suffit de regarder l'état (`S`, `S.R`).

## État d'une partie

`S` (voir `freshState()` dans `state.js`) :

- `phase` : `setup` → `lobby` (mode téléphones) → `round-intro` → `play` → `round-intro` → … → `podium`
- `settings` : réglages choisis au lancement (`defaultSettings()`)
- `teams` : les 12 équipes possibles ; `settings.nTeams` premières sont en jeu
- `ri` : index de la manche en cours dans `settings.rounds`
- `R` : état de la manche en cours (détaillé ci-dessous)
- `secrets` : cartes secrètes envoyées (renvoyées si le serveur redémarre)

Champs communs de `S.R` : `type`, `step` (étape en cours), `qid` (identifiant de
la question ou du vote : une réponse de téléphone avec un autre `qid` est
ignorée), `deadline` (fin du chrono en ms), `twist` (règle bizarre en cours).

### Étapes de chaque manche (`S.R.step`)

| Manche | Étapes |
|---|---|
| Nuggets, L'Addition, Burger | `twist`? → `read` → `open` (buzzers) → `answer` (Juste/Fausse) → `reveal`. Mauvaise réponse avec « main qui passe » (ou Burger) : retour à `open` sans l'équipe fautive. |
| Sel ou Poivre | `twist`? → `read` → `choose` (choix secrets, chrono 15 s) → `suspense`? → `reveal` |
| Menus | par équipe : `pick` (thème) → pour chaque question : `twist`? → `judge` → `reveal` ; puis `summary` (bonus) |
| Fausses pubs | `brief` (produits envoyés en secret) → `prep` (concertation commune) → par équipe : `ready` → `show` → `vote` → `suspense`? → `result` |
| Défis | par équipe : `draw` → `run` (chrono) → `vote` → `suspense`? → `result` |

`suspense` n'existe que si le réglage « Suspense » est activé. Le chrono de
réponse (`answer`, `judge`) ne décide rien à la fin : il affiche « Temps
écoulé » et attend Juste / Fausse.

L'horloge (`setInterval` en bas de `game.js`, toutes les 200 ms) déclenche les
fins de lecture, de suspense et de chrono. Une pause décale toutes les échéances.

## Le buzzer

Arbitrage dans `public/shared/hub.js` :

1. l'écran ouvre le buzzer (`buzz:open`) avec un `qid` et la liste des équipes autorisées ;
2. chaque téléphone envoie son buzz avec sa **latence mesurée** (aller-retour `ping`/`pong`) ;
3. le hub horodate l'arrivée, **retire la moitié de la latence** (plafonnée à 600 ms),
   et attend **150 ms** après le premier buzz pour départager les quasi-égalités ;
4. le gagnant est annoncé à l'écran (`buzz`) et à tous les téléphones (`buzz` → état du buzzer).

Règle « Le dernier gagne » : le hub attend que toutes les équipes aient buzzé
(ou que l'écran « clôture »), et désigne la dernière.

Tests : `test/hub.test.js`.

## Messages WebSocket (`/ws`)

Tous les messages sont du JSON avec un champ `t`.

**Écran → serveur** : `host:create`, `host:resume {code, hostToken, remoteKey}`,
`teams {teams}`, `view {team, view}`, `buzz:open {qid, mode, eligible}`,
`buzz:close`, `secret {team, target, payload}`, `secret:clear`,
`act {team, kind, qid, value}` (commande faite à l'écran au nom d'une équipe),
`remote:config {allow}`, `remote:reset`, `remote:state {state}`.

**Serveur → écran** : `room {code, hostToken, remoteKey}`, `devices {counts}`,
`buzzstate {buzz}`, `buzz {team, qid, order}`, `action {team, qid, value}`, `rename {team, name}`,
`secret:sent {team, devices}`, `remotes {count}`, `remote:act {act, data}`.

**Téléphone → serveur** : `join {code, deviceId, team?}`, `pick {team}`, `leave`,
`buzz {qid, rtt}`, `action {qid, value}`, `rename {name}` (nom d’équipe proposé ; l’écran ne l’accepte que si la vue porte `canRename`).

**Serveur → téléphone** : `joined`, `error`, `teams`, `state {team, view, buzz, secret}`,
`view {view}` (avec `remaining` au lieu de `deadline` : les horloges diffèrent),
`buzz {buzz}`, `secret {secret, elsewhere?}`.

**Télécommande** : `remote:join {code, key, rid}` puis `remote:act {act, data}` ;
reçoit `remote:state {state}`. L'écran n'accepte que les boutons qu'il affiche
au même moment (pas de double appui, pas d'action inventée).

`ping` / `pong` : mesure de latence (tous les clients).

## Routes HTTP

| Route | Rôle |
|---|---|
| `/`, `/host.html`, `/play.html`, `/remote.html`… | Fichiers de `public/` |
| `GET /api/info` | Adresses réseau du serveur (QR code en Wi-Fi local), voix disponible ou non |
| `GET /api/sounds` | Sons personnalisés présents dans `public/sounds/` |
| `GET /api/voices` | Voix ElevenLabs du compte (si la clé est configurée) |
| `POST /api/tts` | Fait lire un texte du jeu par ElevenLabs (mp3) |
| `GET /qr.svg?text=…` | QR code |

## Sécurité

- **Écran** : le serveur lui donne un `hostToken` secret ; seul ce jeton permet de
  reprendre la salle après une coupure.
- **Téléphones** : le code de la salle suffit (c'est voulu : on le scanne). Un
  téléphone ne peut qu'envoyer des buzz, des choix et des votes pour son équipe.
- **Télécommande** : clé secrète dans son QR code, refusée si le présentateur
  n'est pas activé, **un seul** présentateur à la fois, clé régénérée par
  « Changer de présentateur ».
- **Voix** : la clé ElevenLabs reste sur le serveur ; `/api/tts` n'accepte que les
  textes du jeu (`allowedTexts()` dans `voicelines.js`) ou des textes de moins de
  32 caractères (noms d'équipe), avec cache, limites par adresse IP et plafond quotidien.
- Le serveur ne sert que les fichiers de `public/` (pas de remontée de dossier).

## Persistance

| Où | Clé | Contenu |
|---|---|---|
| Navigateur de l'écran | `bq.host` | Partie en cours (`S`), réglages et équipes |
| Navigateur de l'écran | `bq.seen` | Contenus déjà joués (par banque) |
| Téléphone | `bq.device`, `bq.code`, `bq.team.<code>` | Identifiant, salle et équipe (reconnexion) |
| Télécommande | `bq.remote` | Identifiant du présentateur (retrouver sa place) |
| Serveur (mémoire) | — | Salles (12 h max), cache des voix |
| Serveur (disque) | `TTS_CACHE_DIR` | Voix générées (dossier temporaire par défaut) |

Si le serveur redémarre pendant une partie, l'écran se reconnecte avec le même
code (`host:resume`) et renvoie tout (`resync()`) ; les téléphones se reconnectent seuls.

## Sons et voix

- Le son ne peut démarrer qu'après un premier appui (iPhone, Safari). L'écran
  débloque le son au premier clic ; les téléphones au premier appui.
- Les cris et la voix passent par Web Audio (`sounds.js`) : une fois débloqués,
  ils jouent même quand c'est un buzz venu d'un téléphone qui les déclenche.
- Sans fichier dans `public/sounds/`, chaque son a une version synthétique de secours.
