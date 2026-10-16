// Écran de jeu : point d'entrée.
// L'écran est le chef d'orchestre : il connaît tout l'état de la partie, décide
// de ce qu'affiche chaque téléphone et compte les points. Voir docs/ARCHITECTURE.md.

import * as C from '../shared/content.js';
import { preloadSounds } from '../shared/sounds.js';
import './actions.js'; // boutons, réglages, clavier
import './game.js'; // horloge du jeu (chronos, fin de lecture)
import { render } from './render.js';
import { loadVoiceInfo } from './voice.js';

loadVoiceInfo();
preloadSounds([...C.ANIMALS.map((a) => a.id), 'good', 'bad', 'twist', 'round', 'fanfare', 'burger', 'tick', 'timeup', 'reveal', 'pop']);

render();
