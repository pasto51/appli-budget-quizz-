// « Installer l'appli » : le site s'installe comme une vraie appli (icône sur
// l'écran d'accueil, plein écran, ouverture même sans connexion).
// - Android / ordinateur (Chrome, Edge…) : la fenêtre d'installation du navigateur ;
// - iPhone / iPad : Apple ne permet pas de bouton, on explique les 3 gestes.
// Le service worker (public/sw.js) est enregistré ici.

let deferred = null; // invitation d'installation gardée par Chrome (Android, ordinateur)
let btn = null;
let wanted = false;

const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  refresh();
});
addEventListener('appinstalled', () => {
  deferred = null;
  refresh();
});

function refresh() {
  if (!btn) return;
  btn.hidden = !wanted || installed();
}

function help() {
  const box = document.createElement('div');
  box.className = 'install-help';
  box.innerHTML = isIos
    ? `<div class="install-card"><div class="install-title">📲 Installer l’appli</div>
        <ol><li>Ouvrez cette page dans <b>Safari</b></li>
        <li>Touchez le bouton <b>Partager</b> <span class="install-ico">⬆︎</span> (en bas ou en haut de l’écran)</li>
        <li>Choisissez <b>« Sur l’écran d’accueil »</b>, puis <b>Ajouter</b></li></ol>
        <p>L’icône Burger Quiz apparaît avec vos applis : elle s’ouvre en plein écran.</p>
        <button class="btn btn-primary">Compris</button></div>`
    : `<div class="install-card"><div class="install-title">📲 Installer l’appli</div>
        <ol><li>Ouvrez le menu du navigateur <b>⋮</b></li>
        <li>Choisissez <b>« Installer l’application »</b> ou <b>« Ajouter à l’écran d’accueil »</b></li></ol>
        <button class="btn btn-primary">Compris</button></div>`;
  box.addEventListener('click', (e) => (e.target === box || e.target.closest('button')) && box.remove());
  document.body.appendChild(box);
}

async function install() {
  if (deferred) {
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    refresh();
  } else help();
}

/** Affiche ou cache le bouton flottant « Installer l'appli » (jamais une fois installée). */
export function showInstall(visible) {
  wanted = !!visible;
  if (!btn && wanted) {
    btn = document.createElement('button');
    btn.className = 'btn btn-small install-btn';
    btn.id = 'install';
    btn.textContent = '📲 Installer l’appli';
    btn.addEventListener('click', install);
    document.body.appendChild(btn);
  }
  refresh();
}
