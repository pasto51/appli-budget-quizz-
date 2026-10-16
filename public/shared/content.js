// Banque de contenu du Burger Quiz maison.
// Les questions marquées « ajout » ne viennent pas du cahier des charges :
// elles complètent la banque pour limiter les répétitions. À relire avant une soirée.

export const ANIMALS = [
  { id: 'coq', label: 'Coq', emoji: '🐓' },
  { id: 'canard', label: 'Canard', emoji: '🦆' },
  { id: 'grenouille', label: 'Grenouille', emoji: '🐸' },
  { id: 'vache', label: 'Vache', emoji: '🐄' },
  { id: 'cochon', label: 'Cochon', emoji: '🐖' },
  { id: 'mouton', label: 'Mouton', emoji: '🐑' },
  { id: 'chevre', label: 'Chèvre', emoji: '🐐' },
  { id: 'ane', label: 'Âne', emoji: '🐴' },
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
  { id: 'myrtille', name: 'Myrtille', color: '#2f6fdf', ink: '#ffffff', animal: 'ane' },
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
    rules: 'L’équipe la moins bien classée choisit d’abord son menu. 3 questions : +1 par bonne réponse, +1 bonus si les trois sont justes.',
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
];

// ---------- Fausses pubs ----------

export const PRODUCTS = [
  'Un parapluie troué',
  'Une paire de chaussettes qui ne se perd jamais',
  'Un réveil qui sonne le dimanche',
  'Une cuillère à soupe pour gauchers',
  'Du savon au goût de fromage',
  'Un GPS qui se trompe exprès',
  'Des glaçons chauds',
  'Une brosse à dents pour poisson rouge',
  'Un oreiller qui ronfle à votre place',
  'Un camping-car de deux mètres de long',
  'Du sel sans sel',
  'Une chaise qui dit « bravo » quand on s’assoit',
];

// ---------- Défis ----------
// secret : 'device' (un seul téléphone), 'team' (toute l'équipe), null (affiché à l'écran)
// vote : question posée aux autres équipes, « Oui » = défi réussi

const MIME_TITLES = ['Titanic', 'Le Roi Lion', 'Harry Potter', 'Astérix et Obélix', 'Les Bronzés font du ski', 'Bienvenue chez les Ch’tis', 'Star Wars', 'La Reine des neiges', 'Jurassic Park', 'Spider-Man', 'Les Visiteurs', 'Le Seigneur des anneaux', 'Shrek', 'Ratatouille', 'Friends', 'Kaamelott', 'Le Petit Prince', 'Les Dents de la mer'];
const DRAW_OBJECTS = ['Un vélo', 'Une maison', 'Un camping-car', 'Un éléphant', 'Une guitare', 'Un château fort', 'Un hamburger', 'Une fusée', 'Un parapluie', 'Un sapin de Noël', 'Une tour Eiffel', 'Un escargot'];
const SING_LINES = [
  { line: 'J’ai oublié de sortir les poubelles', air: 'Frère Jacques' },
  { line: 'Le camping-car est garé de travers', air: 'Au clair de la lune' },
  { line: 'Qui a mangé le dernier cornichon ?', air: 'Alouette' },
  { line: 'Ce soir on mange des frites et du ketchup', air: 'Frère Jacques' },
  { line: 'Mon voisin passe la tondeuse à sept heures', air: 'Au clair de la lune' },
  { line: 'La mayonnaise a encore raté', air: 'Alouette' },
];
const STATUE_WORDS = ['Un pique-nique', 'Une tempête', 'Un mariage', 'Une machine à laver', 'Un embouteillage', 'Un volcan', 'Une photo de famille', 'Un barbecue', 'Un manège', 'Le Titanic'];
const WORD_CATEGORIES = [
  { cat: 'des fruits', min: 8 },
  { cat: 'des métiers', min: 8 },
  { cat: 'des capitales', min: 6 },
  { cat: 'des animaux de la ferme', min: 7 },
  { cat: 'des marques de voiture', min: 7 },
  { cat: 'des légumes', min: 7 },
  { cat: 'des pays d’Europe', min: 8 },
  { cat: 'des instruments de musique', min: 6 },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const DEFIS = [
  {
    id: 'mime', title: 'Mime', seconds: 45, secret: 'device',
    rules: 'Un joueur mime le titre de film ou de série affiché sur son téléphone. Son équipe a 45 secondes pour deviner.',
    make: () => { const t = pick(MIME_TITLES); return { secret: { label: 'À mimer', text: t }, reveal: t }; },
    vote: 'Leur équipe a-t-elle trouvé le titre ?',
  },
  {
    id: 'dessin', title: 'Dessin à l’aveugle', seconds: 60, secret: 'device',
    rules: 'Un joueur dessine les yeux fermés l’objet affiché sur son téléphone. Son équipe devine. (Papier et crayon.)',
    make: () => { const t = pick(DRAW_OBJECTS); return { secret: { label: 'À dessiner les yeux fermés', text: t }, reveal: t }; },
    vote: 'Leur équipe a-t-elle trouvé l’objet ?',
  },
  {
    id: 'cri', title: 'Cri d’animal', seconds: 30, secret: 'device',
    rules: 'Un joueur imite l’animal affiché sur son téléphone. Les autres équipes doivent le reconnaître.',
    make: () => { const a = pick(['Un éléphant', 'Un loup', 'Un dauphin', 'Un singe', 'Un lion', 'Un hibou', 'Une mouette', 'Un phoque', 'Un dindon', 'Un cheval']); return { secret: { label: 'Animal à imiter', text: a }, reveal: a }; },
    vote: 'Avez-vous reconnu l’animal ?',
  },
  {
    id: 'chanson', title: 'Chanter sur un air connu', seconds: 30, secret: null,
    rules: 'Chantez la phrase imposée sur l’air indiqué.',
    make: () => { const s = pick(SING_LINES); return { show: `« ${s.line} »\nsur l’air de ${s.air}` }; },
    vote: 'Ont-ils bien chanté la phrase sur le bon air ?',
  },
  {
    id: 'virelangue', title: 'Virelangue', seconds: 25, secret: null,
    rules: 'Un joueur dit trois fois de suite la phrase sans se tromper.',
    make: () => ({ show: '« Les chaussettes de l’archiduchesse sont-elles sèches, archi-sèches ? »\n×3 sans se tromper' }),
    vote: 'Trois fois sans se tromper ?',
  },
  {
    id: 'statue', title: 'Statue', seconds: 10, secret: 'team',
    rules: 'Toute l’équipe a 10 secondes pour former une statue qui illustre le mot affiché sur ses téléphones. Les autres devinent.',
    make: () => { const w = pick(STATUE_WORDS); return { secret: { label: 'Votre statue', text: w }, reveal: w }; },
    vote: 'Avez-vous deviné le mot ?',
  },
  {
    id: 'jingle', title: 'Jingle', seconds: 40, secret: null,
    rules: 'Inventez un jingle de 10 secondes pour ce produit (30 secondes de préparation comprises).',
    make: () => ({ show: pick(PRODUCTS) }),
    vote: 'Ce jingle mérite-t-il de passer à la radio ?',
  },
  {
    id: 'mots', title: 'Le plus de mots', seconds: 20, secret: null,
    rules: 'Citez en 20 secondes le plus de mots de la catégorie. Le minimum est affiché.',
    make: () => { const c = pick(WORD_CATEGORIES); return { show: `Citez ${c.cat}\nMinimum : ${c.min} mots`, min: c.min }; },
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

// ---------- Nuggets ----------

export const NUGGETS = [
  { q: 'Combien de pattes a une araignée ?', a: 'Huit' },
  { q: 'Quelle est la capitale du Portugal ?', a: 'Lisbonne' },
  { q: 'Quel insecte fabrique le miel ?', a: 'L’abeille' },
  { q: 'Combien de joueurs une équipe de football aligne-t-elle sur le terrain, gardien compris ?', a: 'Onze' },
  { q: 'Quel est le plus grand océan du monde ?', a: 'Le Pacifique' },
  { q: 'Comment s’appelle le chien de Tintin ?', a: 'Milou' },
  { q: 'En quelle année la France a-t-elle gagné sa première Coupe du monde de football ?', a: '1998' },
  { q: 'Quel est le symbole chimique de l’or ?', a: 'Au' },
  { q: 'Quelle planète est la plus proche du Soleil ?', a: 'Mercure' },
  { q: 'Quel fromage met-on traditionnellement sur une pizza Margherita ?', a: 'De la mozzarella' },
  { q: 'Combien y a-t-il de jours dans une année bissextile ?', a: '366' },
  { q: 'Qui a peint la Joconde ?', a: 'Léonard de Vinci' },
  { q: 'Quel est le plus long fleuve de France ?', a: 'La Loire' },
  { q: 'De quelle couleur est la boîte noire d’un avion ?', a: 'Orange' },
  { q: 'Combien de cases compte un échiquier ?', a: '64' },
  { q: 'Quel est le seul mammifère capable de voler vraiment ?', a: 'La chauve-souris' },
  { q: 'Dans quelle ville se trouve la tour de Pise ?', a: 'À Pise, évidemment' },
  { q: 'Quel pays a la forme d’une botte ?', a: 'L’Italie' },
  // ajout
  { q: 'Quelle est la capitale du Canada ?', a: 'Ottawa' },
  { q: 'Combien de côtés a un hexagone ?', a: 'Six' },
  { q: 'Quel gaz les plantes absorbent-elles pour faire la photosynthèse ?', a: 'Le dioxyde de carbone (CO₂)' },
  { q: 'Qui a écrit « Les Misérables » ?', a: 'Victor Hugo' },
  { q: 'Quelle est la plus haute montagne d’Europe occidentale ?', a: 'Le mont Blanc' },
  { q: 'Combien de minutes y a-t-il dans une heure et demie ?', a: '90' },
  { q: 'Quel est le plus grand désert chaud du monde ?', a: 'Le Sahara' },
  { q: 'Comment appelle-t-on un bébé kangourou ?', a: 'Un joey (ou petit kangourou)' },
  { q: 'Quelle couleur obtient-on en mélangeant du bleu et du jaune ?', a: 'Du vert' },
];

// ---------- Sel ou Poivre ----------

export const SEL_POIVRE = [
  { q: 'Les pieuvres ont trois cœurs.', sel: true, why: 'Deux pompent le sang vers les branchies, un seul vers le reste du corps.' },
  { q: 'La tour Eiffel est plus haute en été qu’en hiver.', sel: true, why: 'Le fer se dilate avec la chaleur : jusqu’à une quinzaine de centimètres de plus.' },
  { q: 'Les chauves-souris sont aveugles.', sel: false, why: 'Elles voient très bien, en plus de leur sonar naturel.' },
  { q: 'Napoléon était minuscule pour son époque.', sel: false, why: 'Il mesurait environ 1 m 69, plutôt dans la moyenne de l’époque.' },
  { q: 'Un escargot possède des milliers de dents.', sel: true, why: 'Elles sont minuscules et alignées sur sa langue râpeuse.' },
  { q: 'Les bananiers sont des arbres.', sel: false, why: 'Ce sont de très grandes herbes.' },
  { q: 'Les flamants roses naissent roses.', sel: false, why: 'Ils naissent gris et rosissent grâce à ce qu’ils mangent.' },
  { q: 'On voit la Grande Muraille de Chine à l’œil nu depuis la Lune.', sel: false, why: 'Même depuis l’orbite basse, elle est très difficile à repérer.' },
  { q: 'Une tomate est botaniquement un fruit.', sel: true, why: 'Elle vient de la fleur et contient des graines.' },
  { q: 'Le cœur d’une crevette se trouve dans sa tête.', sel: true, why: 'Il est situé dans la partie avant du corps.' },
  { q: 'Les poissons rouges n’ont que trois secondes de mémoire.', sel: false, why: 'Ils retiennent des choses pendant des mois.' },
  { q: 'Le miel peut se conserver des siècles sans se gâter.', sel: true, why: 'Très sucré et très pauvre en eau : les bactéries n’y survivent pas.' },
  // ajout
  { q: 'Les fraises sont des baies au sens botanique.', sel: false, why: 'Ce sont des « faux fruits » : les vrais fruits sont les petits grains sur la peau.' },
  { q: 'Le Soleil est une étoile.', sel: true, why: 'Une étoile de taille moyenne, toute proche de nous.' },
  { q: 'Les autruches cachent leur tête dans le sable quand elles ont peur.', sel: false, why: 'C’est un mythe : elles se couchent au sol ou s’enfuient en courant.' },
  { q: 'Un éclair ne frappe jamais deux fois au même endroit.', sel: false, why: 'Les grands bâtiments sont frappés plusieurs fois par an.' },
];

// ---------- L'Addition ----------

export const ADDITIONS = [
  { words: ['Mozzarella', 'Basilic', 'Tomate'], a: 'La pizza Margherita' },
  { words: ['La cigale', 'La fourmi', 'Le corbeau'], a: 'Les fables de La Fontaine' },
  { words: ['Orange', 'Rouge', 'Vert'], a: 'Un feu tricolore' },
  { words: ['Pomme', 'Ver', 'Tremblement'], a: '« … de terre »' },
  { words: ['France', 'Pise', 'Contrôle'], a: '« Tour de … »' },
  { words: ['Chaperon rouge', 'Poucet', 'Prince'], a: '« Le Petit … »' },
  { words: ['Camping-car', 'Van', 'Caravane', 'Fourgon aménagé'], a: 'Les véhicules de vacances sur la route' },
  { words: ['Mario', 'Luigi', 'Peach'], a: 'Les personnages de Super Mario' },
  // ajout
  { words: ['Athos', 'Porthos', 'Aramis'], a: 'Les Trois Mousquetaires' },
  { words: ['Pique', 'Cœur', 'Carreau', 'Trèfle'], a: 'Les couleurs d’un jeu de cartes' },
  { words: ['Lait', 'Sucre', 'Œufs', 'Farine'], a: 'Les crêpes' },
  { words: ['Feu', 'Eau', 'Terre', 'Air'], a: 'Les quatre éléments' },
  { words: ['Baguette', 'Chapeau', 'Lapin'], a: 'Un magicien' },
  { words: ['Botte', 'Chat', 'Marquis de Carabas'], a: 'Le Chat botté' },
  { words: ['Neige', 'Blanche', 'Sept nains'], a: 'Blanche-Neige' },
  { words: ['Œuf', 'Mayonnaise', 'Moutarde'], a: 'Un œuf mayo' },
  { words: ['Croissant', 'Pain au chocolat', 'Chausson aux pommes'], a: 'Les viennoiseries' },
  { words: ['Cheval', 'Tour', 'Fou', 'Reine'], a: 'Les pièces d’un jeu d’échecs' },
  { words: ['Arc', 'Ciel', 'Sept couleurs'], a: 'L’arc-en-ciel' },
  { words: ['Big Ben', 'Tower Bridge', 'Buckingham'], a: 'Londres' },
];

// ---------- Menus ----------

export const MENUS = [
  { theme: 'Cinéma et séries', qs: [
    { q: 'Quel acteur et réalisateur est à l’origine du Burger Quiz ?', a: 'Alain Chabat' },
    { q: 'Dans quelle saga entend-on « Je suis ton père » ?', a: 'Star Wars' },
    { q: 'Quel film d’animation raconte l’histoire d’un petit robot qui nettoie une Terre abandonnée ?', a: 'WALL-E' },
  ] },
  { theme: 'Années 90 et 2000', qs: [
    { q: 'Comment s’appelait l’animal virtuel qu’il fallait nourrir sur un petit boîtier à pile ?', a: 'Le Tamagotchi' },
    { q: 'Quel groupe féminin britannique a chanté « Wannabe » ?', a: 'Les Spice Girls' },
    { q: 'En quelle année les pièces et billets en euros sont-ils arrivés en France ?', a: '2002' },
  ] },
  { theme: 'Géographie et voyages', qs: [
    { q: 'Quel est le plus petit pays du monde ?', a: 'Le Vatican' },
    { q: 'Quelle est la capitale de l’Australie ?', a: 'Canberra' },
    { q: 'Sur quel continent se trouve le désert du Sahara ?', a: 'En Afrique' },
  ] },
  { theme: 'Cuisine', qs: [
    { q: 'Quel est l’ingrédient principal du guacamole ?', a: 'L’avocat' },
    { q: 'De quel pays viennent les sushis ?', a: 'Du Japon' },
    { q: 'Avec quoi prépare-t-on le houmous ?', a: 'Des pois chiches' },
  ] },
  { theme: 'Sport', qs: [
    { q: 'Combien de joueurs une équipe de basket a-t-elle sur le terrain ?', a: 'Cinq' },
    { q: 'Dans quel sport utilise-t-on un volant ?', a: 'Le badminton' },
    { q: 'Quelle ville a accueilli les Jeux olympiques d’été en 2024 ?', a: 'Paris' },
  ] },
  { theme: 'Musique', qs: [
    { q: 'Combien de cordes a une guitare classique ?', a: 'Six' },
    { q: 'De quel instrument jouait Louis Armstrong ?', a: 'De la trompette' },
    { q: 'Quel groupe de Liverpool a chanté « Hey Jude » ?', a: 'Les Beatles' },
  ] },
  { theme: 'Animaux', qs: [
    { q: 'Quel est le plus grand animal terrestre ?', a: 'L’éléphant d’Afrique' },
    { q: 'Comment s’appelle le petit de la vache ?', a: 'Le veau' },
    { q: 'Quel est l’animal terrestre le plus rapide ?', a: 'Le guépard' },
  ] },
  { theme: 'Camping-car et road trip', qs: [
    { q: 'Quel est le numéro d’urgence valable dans toute l’Europe ?', a: 'Le 112' },
    { q: 'Dans un camping-car, que désigne le mot « cassette » ?', a: 'Les toilettes : la cassette WC' },
    { q: 'Quelle est la vitesse maximale sur autoroute en France par temps sec ?', a: '130 km/h' },
  ] },
  // ajout
  { theme: 'Bandes dessinées', qs: [
    { q: 'Quel est le meilleur ami d’Astérix ?', a: 'Obélix' },
    { q: 'Comment s’appelle le capitaine ami de Tintin ?', a: 'Le capitaine Haddock' },
    { q: 'Quel cow-boy « tire plus vite que son ombre » ?', a: 'Lucky Luke' },
  ] },
  { theme: 'Sciences', qs: [
    { q: 'À quelle température l’eau bout-elle au niveau de la mer ?', a: '100 °C' },
    { q: 'Quelle planète est surnommée la planète rouge ?', a: 'Mars' },
    { q: 'Combien d’os compte le corps humain adulte, environ ?', a: '206' },
  ] },
];

// ---------- Burger de la mort ----------

export const BURGERS = [
  { q: 'Combien de mois de l’année ont 28 jours ?', a: 'Tous. Même ceux de 30 ou 31 jours ont au moins 28 jours.' },
  { q: 'Un coq pond un œuf au sommet d’un toit pointu. De quel côté tombe l’œuf ?', a: 'D’aucun côté : un coq ne pond pas d’œuf.' },
  { q: 'Combien d’animaux de chaque espèce Moïse a-t-il emmenés dans son arche ?', a: 'Aucun. C’était Noé, pas Moïse.' },
  { q: 'Vous participez à une course et vous dépassez le deuxième. Vous êtes maintenant…', a: 'Deuxième. Vous avez pris sa place, pas celle du premier.' },
  { q: 'Qu’est-ce qui est le plus lourd : un kilo de plumes ou un kilo de plomb ?', a: 'Ni l’un ni l’autre : un kilo, c’est un kilo.' },
  { q: 'Un médecin vous donne trois pilules, à prendre une toutes les demi-heures. Combien de temps vont-elles durer ?', a: 'Une heure : une tout de suite, une 30 minutes plus tard, la dernière au bout d’une heure.' },
  // ajout
  { q: 'Quel est le mot de la langue française qui s’écrit toujours de travers ?', a: '« Travers » !' },
  { q: 'Un avion s’écrase pile sur la frontière franco-espagnole. Où enterre-t-on les survivants ?', a: 'Nulle part : on n’enterre pas des survivants.' },
];
