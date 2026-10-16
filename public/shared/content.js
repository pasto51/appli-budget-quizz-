// Réglages et contenu du Burger Quiz maison : équipes, animaux, manches,
// règles bizarres, défis. Les questions elles-mêmes sont dans bank/.

import NUGGET_BANK from './bank/nuggets.js';
import SEL_BANK from './bank/selpoivre.js';
import ADD_BANK from './bank/additions.js';
import MENU_BANK from './bank/menus.js';
import BURGER_BANK from './bank/burgers.js';
import PUBS from './bank/pubs.js';
import { MIME_TITLES, DRAW_OBJECTS, ANIMALS_TO_MIMIC, SING_LINES, STATUE_WORDS, WORD_CATEGORIES, VIRELANGUES } from './bank/defis.js';

export const ANIMALS = [
  { id: 'coq', label: 'Coq', emoji: '🐓' },
  { id: 'canard', label: 'Canard', emoji: '🦆' },
  { id: 'grenouille', label: 'Grenouille', emoji: '🐸' },
  { id: 'vache', label: 'Vache', emoji: '🐄' },
  { id: 'cochon', label: 'Cochon', emoji: '🐖' },
  { id: 'mouton', label: 'Mouton', emoji: '🐑' },
  { id: 'chevre', label: 'Chèvre', emoji: '🐐' },
  { id: 'cheval', label: 'Cheval', emoji: '🐴' },
  { id: 'chat', label: 'Chat', emoji: '🐈' },
  { id: 'chien', label: 'Chien', emoji: '🐕' },
  { id: 'loup', label: 'Loup', emoji: '🐺' },
  { id: 'hibou', label: 'Hibou', emoji: '🦉' },
  { id: 'lion', label: 'Lion', emoji: '🦁' },
  { id: 'elephant', label: 'Éléphant', emoji: '🐘' },
];

export const MAX_TEAMS = 12;

// jusqu'à 12 équipes ; les 3 premières sont celles du cahier des charges
export const TEAM_PRESETS = [
  { id: 'ketchup', name: 'Ketchup', color: '#e2231a', ink: '#ffffff', animal: 'coq' },
  { id: 'mayo', name: 'Mayo', color: '#ffd23f', ink: '#2b1d00', animal: 'canard' },
  { id: 'cornichon', name: 'Cornichon', color: '#3fa34d', ink: '#ffffff', animal: 'grenouille' },
  { id: 'barbecue', name: 'Barbecue', color: '#7b3f1d', ink: '#ffffff', animal: 'vache' },
  { id: 'bacon', name: 'Bacon', color: '#ff8fa3', ink: '#3a0010', animal: 'cochon' },
  { id: 'oignon', name: 'Oignon', color: '#9b5de5', ink: '#ffffff', animal: 'mouton' },
  { id: 'cheddar', name: 'Cheddar', color: '#ff8c1a', ink: '#2b1400', animal: 'chevre' },
  { id: 'myrtille', name: 'Myrtille', color: '#2f6fdf', ink: '#ffffff', animal: 'cheval' },
  { id: 'menthe', name: 'Menthe', color: '#2ec4b6', ink: '#00302b', animal: 'chat' },
  { id: 'reglisse', name: 'Réglisse', color: '#3a3a3a', ink: '#ffffff', animal: 'chien' },
  { id: 'chantilly', name: 'Chantilly', color: '#f4f1ea', ink: '#2b1d00', animal: 'loup' },
  { id: 'pistache', name: 'Pistache', color: '#b5d33d', ink: '#1f2a00', animal: 'hibou' },
];

export const ROUNDS = {
  nuggets: {
    title: 'Nuggets',
    subtitle: 'Questions éclair',
    rules: 'Buzzez le premier et répondez à voix haute. Bonne réponse : +1 point. Une erreur et la réponse est donnée, personne d’autre ne tente.',
    count: 12,
  },
  selpoivre: {
    title: 'Sel ou Poivre',
    subtitle: 'Vrai ou faux',
    rules: 'Sel = vrai, Poivre = faux. Choisissez en secret sur votre téléphone. +1 point par bonne réponse.',
    count: 8,
  },
  addition: {
    title: 'L’Addition',
    subtitle: 'Trouvez le point commun',
    rules: 'Quel est le lien entre ces mots ? Buzzez le premier. Bonne réponse : +2 points.',
    count: 5,
  },
  menus: {
    title: 'Les Menus',
    subtitle: 'Un thème, trois questions',
    rules: 'L’équipe la moins bien classée choisit d’abord son menu. {n} questions : +1 par bonne réponse, +1 bonus si tout est juste.',
  },
  pubs: {
    title: 'Fausses pubs',
    subtitle: 'Vendez-nous n’importe quoi',
    rules: '30 secondes pour vous concerter, 45 secondes pour jouer la pub. Les autres équipes votent : convaincues, c’est +2 points.',
  },
  defis: {
    title: 'Défis',
    subtitle: 'À vous de jouer',
    rules: 'Un défi par équipe. Les autres équipes jugent. Réussi : +2 points.',
  },
  burger: {
    title: 'Burger de la mort',
    subtitle: 'La finale piégée',
    rules: 'Questions pièges ! Bonne réponse : +2. Mauvaise réponse : −1, et l’équipe ne peut plus buzzer sur cette question.',
    count: 5,
  },
};

// Durée de la partie : nombre de questions par manche, et nombre d'équipes qui
// passent aux fausses pubs et aux défis (les autres votent).
export const LENGTHS = {
  rapide: { label: 'Rapide', hint: 'peu de questions', nuggets: 5, selpoivre: 4, addition: 3, burger: 3, menuQs: 2, performers: 2 },
  court: { label: 'Court', hint: 'version allégée', nuggets: 8, selpoivre: 6, addition: 4, burger: 4, menuQs: 3, performers: 4 },
  long: { label: 'Long', hint: 'la soirée complète', nuggets: 12, selpoivre: 8, addition: 5, burger: 5, menuQs: 3, performers: 99 },
};

export const ROUND_ORDER = ['nuggets', 'selpoivre', 'addition', 'menus', 'pubs', 'defis', 'burger'];

// ---------- Règles bizarres ----------

export const ACCENTS = ['pirate', 'robot', 'grand-mère', 'présentateur météo', 'chevalier du Moyen Âge', 'commentateur de foot', 'agent secret', 'chanteur d’opéra'];

export const SPOKESPERSON = [
  'le joueur le plus jeune',
  'le joueur le plus âgé',
  'le joueur dont l’anniversaire est le plus proche',
  'le joueur qui porte le plus de couleurs',
  'le joueur assis le plus à gauche',
  'le joueur qui a les cheveux les plus longs',
  'le joueur qui s’est couché le plus tard hier',
];

const BUZZ = ['nuggets', 'addition', 'burger'];
const ORAL = ['nuggets', 'addition', 'burger', 'menus'];
const ALL_Q = ['nuggets', 'addition', 'burger', 'menus', 'selpoivre'];

export const TWISTS = [
  { id: 'chante', title: 'Chanté !', text: 'La réponse doit être chantée.', rounds: ORAL },
  { id: 'triple', title: 'Triple points', text: 'Cette question vaut ×3.', rounds: ALL_Q },
  { id: 'dernier', title: 'Le dernier gagne', text: 'C’est la DERNIÈRE équipe à buzzer qui répond.', rounds: BUZZ },
  { id: 'ouinon', title: 'Ni oui ni non', text: 'Interdiction de dire « oui » ou « non ». Une équipe qui les dit perd le point.', rounds: ORAL },
  { id: 'accent', title: 'Accent obligatoire', text: 'Réponse avec l’accent {accent} !', rounds: ORAL },
  { id: 'porteparole', title: 'Un seul porte-parole', text: 'Seul {who} de chaque équipe a le droit de répondre.', rounds: ALL_Q },
  { id: 'rire', title: 'Interdiction de rire', text: 'Une équipe qui rit pendant la question perd 1 point.', rounds: ALL_Q },
  { id: 'mains', title: 'Mains sur la tête', text: 'Tout le monde garde les mains sur la tête jusqu’au buzz. Buzzer d’abord, réfléchir après !', rounds: BUZZ },
  { id: 'vol', title: 'Vol de points', text: 'L’équipe qui répond bien vole 1 point à l’équipe en tête.', rounds: ORAL },
  { id: 'echange', title: 'Échange !', text: 'À la fin de cette question, deux équipes échangent leurs scores…', rounds: ALL_Q, rare: true },
  // coup de pouce : seulement s'il y a une équipe en retard (voir host.js)
  { id: 'pouce', title: 'Coup de pouce', text: '{last} : vos points comptent DOUBLE sur cette question !', rounds: ['nuggets', 'addition', 'burger', 'selpoivre'], catchup: true },
];

// ---------- Banques de contenu (public/shared/bank/) ----------
// Les questions marquées « ajouts » dans ces fichiers ne viennent pas du cahier
// des charges : elles agrandissent la banque pour éviter les répétitions d'une
// soirée à l'autre. À relire avant de jouer.

export const PRODUCTS = PUBS;

export const NUGGETS = NUGGET_BANK.map(([q, a]) => ({ q, a }));
export const SEL_POIVRE = SEL_BANK.map(([q, sel, why]) => ({ q, sel, why }));
export const ADDITIONS = ADD_BANK.map(([words, a]) => ({ words, a }));
export const MENUS = MENU_BANK.map(([theme, qs]) => ({ theme, qs: qs.map(([q, a]) => ({ q, a })) }));
export const BURGERS = BURGER_BANK.map(([q, a]) => ({ q, a }));

// ---------- Défis ----------
// secret : 'device' (un seul téléphone), 'team' (toute l'équipe), null (affiché à l'écran)
// vote : question posée aux autres équipes, « Oui » = défi réussi
// make(pick) : pick(nom, liste) tire un élément en évitant les répétitions

export const DEFIS = [
  {
    id: 'mime', title: 'Mime', seconds: 45, secret: 'device',
    rules: 'Un joueur mime le titre de film ou de série affiché sur son téléphone. Son équipe a 45 secondes pour deviner.',
    make: (pick) => { const t = pick('mime', MIME_TITLES); return { secret: { label: 'À mimer', text: t }, reveal: t }; },
    vote: 'Leur équipe a-t-elle trouvé le titre ?',
  },
  {
    id: 'dessin', title: 'Dessin à l’aveugle', seconds: 60, secret: 'device',
    rules: 'Un joueur dessine les yeux fermés l’objet affiché sur son téléphone. Son équipe devine. (Papier et crayon.)',
    make: (pick) => { const t = pick('dessin', DRAW_OBJECTS); return { secret: { label: 'À dessiner les yeux fermés', text: t }, reveal: t }; },
    vote: 'Leur équipe a-t-elle trouvé l’objet ?',
  },
  {
    id: 'cri', title: 'Cri d’animal', seconds: 30, secret: 'device',
    rules: 'Un joueur imite l’animal affiché sur son téléphone. Les autres équipes doivent le reconnaître.',
    make: (pick) => { const a = pick('cri', ANIMALS_TO_MIMIC); return { secret: { label: 'Animal à imiter', text: a }, reveal: a }; },
    vote: 'Avez-vous reconnu l’animal ?',
  },
  {
    id: 'chanson', title: 'Chanter sur un air connu', seconds: 30, secret: null,
    rules: 'Chantez la phrase imposée sur l’air indiqué.',
    make: (pick) => { const s = pick('chanson', SING_LINES); return { show: `« ${s.line} »\nsur l’air de ${s.air}` }; },
    vote: 'Ont-ils bien chanté la phrase sur le bon air ?',
  },
  {
    id: 'virelangue', title: 'Virelangue', seconds: 25, secret: null,
    rules: 'Un joueur dit trois fois de suite la phrase sans se tromper.',
    make: (pick) => ({ show: `« ${pick('virelangue', VIRELANGUES)} »\n×3 sans se tromper` }),
    vote: 'Trois fois sans se tromper ?',
  },
  {
    id: 'statue', title: 'Statue', seconds: 10, secret: 'team',
    rules: 'Toute l’équipe a 10 secondes pour former une statue qui illustre le mot affiché sur ses téléphones. Les autres devinent.',
    make: (pick) => { const w = pick('statue', STATUE_WORDS); return { secret: { label: 'Votre statue', text: w }, reveal: w }; },
    vote: 'Avez-vous deviné le mot ?',
  },
  {
    id: 'jingle', title: 'Jingle', seconds: 40, secret: null,
    rules: 'Inventez un jingle de 10 secondes pour ce produit (30 secondes de préparation comprises).',
    make: (pick) => ({ show: pick('jingle', PRODUCTS) }),
    vote: 'Ce jingle mérite-t-il de passer à la radio ?',
  },
  {
    id: 'mots', title: 'Le plus de mots', seconds: 20, secret: null,
    rules: 'Citez en 20 secondes le plus de mots de la catégorie. Le minimum est affiché.',
    make: (pick) => { const c = pick('mots', WORD_CATEGORIES); return { show: `Citez ${c.cat}\nMinimum : ${c.min} mots`, min: c.min }; },
    vote: 'Ont-ils atteint le minimum ?',
  },
  {
    id: 'rire', title: 'Faire rire', seconds: 30, secret: null,
    rules: 'Faites rire un joueur d’une équipe adverse, sans le toucher et sans parler.',
    make: () => ({ show: 'Sans toucher, sans parler : faites craquer un adversaire !' }),
    vote: 'L’un de vous a-t-il ri ?',
  },
  {
    id: 'interview', title: 'Interview', seconds: 30, secret: null,
    rules: 'Un joueur interviewe un coéquipier, qui ne doit répondre que « Peut-être » pendant 30 secondes.',
    make: () => ({ show: 'Seule réponse autorisée : « Peut-être »' }),
    vote: 'A-t-il tenu sans dire autre chose que « Peut-être » ?',
  },
];

