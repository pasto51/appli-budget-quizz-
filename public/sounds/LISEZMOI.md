# Sons personnalisés (optionnel)

Les **cris d'animaux** de ce dossier sont de vrais enregistrements, recalés pour le jeu : le cri démarre dès le buzz, dure 1 à 3,5 secondes et tous ont à peu près le même volume.

Pour tout son sans fichier ici, le navigateur fabrique un son synthétique de secours. Pour remplacer un son, déposez un fichier `.mp3`, `.ogg`, `.wav` ou `.m4a` portant son nom.

Utilisez uniquement des sons **libres de droits (CC0)** ou enregistrés par vous.

| Fichier | Quand |
|---|---|
| `coq`, `canard`, `grenouille`, `vache`, `cochon`, `mouton`, `chevre`, `cheval`, `chat`, `chien`, `loup`, `hibou`, `lion`, `elephant` | Cri de l'équipe qui buzze |
| `good` | Bonne réponse |
| `bad` | Mauvaise réponse |
| `twist` | Règle bizarre |
| `round` | Début de manche, tirage d'un défi ou d'une pub |
| `burger` | Début du Burger de la mort |
| `fanfare` | Podium, menu complet |
| `reveal` | Révélation Sel ou Poivre |
| `tick` | 5 dernières secondes d'un chrono |
| `timeup` | Fin d'un chrono |
| `pop` | Choix verrouillé, vote reçu |

Exemple : `public/sounds/coq.mp3`.

## Recaler un nouveau cri

Le cri doit commencer tout de suite (sans blanc au début) et durer 3 secondes au plus. Avec [ffmpeg](https://ffmpeg.org), par exemple pour garder 2 secondes à partir de 0,5 s, avec un fondu à la fin :

```bash
ffmpeg -i original.mp3 -af "atrim=start=0.5:duration=2,asetpts=PTS-STARTPTS,afade=t=out:st=1.7:d=0.3" -ac 1 -b:a 128k coq.mp3
```
