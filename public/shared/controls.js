// Rendu des commandes d'une équipe : buzzer, choix (Sel/Poivre, menus, votes),
// carte secrète. Utilisé par l'app téléphone et par les panneaux de l'écran en
// mode tablette unique.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function buzzStatus(view, buzz, teamId) {
  if (!view || view.screen !== 'buzz') return 'none';
  if (!buzz || buzz.qid !== view.qid) return 'waiting';
  if (buzz.winner) return buzz.winner === teamId ? 'won' : 'lost';
  if (!buzz.eligible.includes(teamId)) return 'excluded';
  if (buzz.buzzed.includes(teamId)) return 'pending';
  return buzz.open ? 'armed' : 'waiting';
}

const BUZZ_LABELS = {
  waiting: ['', 'Attendez la fin de la question…'],
  armed: ['BUZZ !', ''],
  pending: ['Buzzé !', 'Le dernier gagne… on attend les autres'],
  won: ['À VOUS !', 'Répondez à voix haute'],
  lost: ['Trop tard', ''],
  excluded: ['Hors jeu', 'Vous ne pouvez plus buzzer sur cette question'],
};

/**
 * @param {HTMLElement} el
 * @param {{team:any, teams?:any[], view:any, buzz:any, secret?:any, secretElsewhere?:boolean, compact?:boolean,
 *          onBuzz:(qid:string)=>void, onAction:(qid:string, value:string)=>void}} p
 */
export function renderControls(el, p) {
  const { team, view, buzz, compact } = p;
  const teams = p.teams || [];
  let html = '';

  if (view && view.banner) html += `<div class="ctl-banner">${esc(view.banner)}</div>`;

  if (!view || view.screen === 'wait') {
    html += `<div class="ctl-wait"><div class="ctl-title">${esc(view?.title || 'Prêts ?')}</div>${view?.text ? `<div class="ctl-text">${esc(view.text)}</div>` : ''}${view?.deadline ? `<div class="ctl-timer" data-deadline="${view.deadline}"></div>` : ''}</div>`;
  } else if (view.screen === 'buzz') {
    const st = buzzStatus(view, buzz, team.id);
    const [label, sub] = BUZZ_LABELS[st] || BUZZ_LABELS.waiting;
    const winnerTeam = st === 'lost' ? teams.find((t) => t.id === buzz.winner) : null;
    html += `<button class="buzzer buzzer-${st}" data-buzz="${esc(view.qid)}" ${st === 'armed' ? '' : 'disabled'} style="--team:${team.color};--ink:${team.ink || '#fff'}">
      <span class="buzzer-label">${esc(label || '···')}</span>
    </button>
    <div class="ctl-sub">${esc(winnerTeam ? `${winnerTeam.name} a été plus rapide` : sub)}</div>
    ${view.deadline ? `<div class="ctl-timer" data-deadline="${view.deadline}"></div>` : ''}`;
  } else if (view.screen === 'choice') {
    const chosen = view.chosen;
    html += `<div class="ctl-prompt">${esc(view.prompt || '')}</div>`;
    if (view.deadline) html += `<div class="ctl-timer" data-deadline="${view.deadline}"></div>`;
    html += `<div class="choices ${view.options.length > 2 ? 'choices-col' : ''}">`;
    for (const o of view.options) {
      const state = chosen == null ? '' : chosen === o.value ? 'chosen' : 'faded';
      html += `<button class="choice ${state}" data-qid="${esc(view.qid)}" data-value="${esc(o.value)}" ${chosen == null && !view.locked ? '' : 'disabled'}
        style="--bg:${o.bg || '#333'};--fg:${o.ink || '#fff'}">${o.emoji ? `<span class="choice-emoji">${o.emoji}</span>` : ''}<span>${esc(o.label)}</span></button>`;
    }
    html += '</div>';
    if (chosen != null) html += `<div class="ctl-sub">Choix verrouillé ✔</div>`;
    else if (view.locked) html += `<div class="ctl-sub">Temps écoulé</div>`;
  }

  if (p.secret) {
    html += `<details class="secret" ${compact ? '' : 'open'}><summary>🤫 Carte secrète${compact ? ' (seul le joueur concerné regarde !)' : ''}</summary>
      <div class="secret-label">${esc(p.secret.label)}</div><div class="secret-text">${esc(p.secret.text)}</div>
      ${compact ? '' : '<div class="ctl-sub">Ne montre pas ton écran !</div>'}</details>`;
  } else if (p.secretElsewhere) {
    html += `<div class="ctl-sub">Un coéquipier a reçu une carte secrète 🤫</div>`;
  }

  el.innerHTML = html;

  const b = el.querySelector('[data-buzz]');
  if (b && !b.disabled) {
    const fire = (e) => {
      e.preventDefault();
      if (b.disabled) return;
      b.disabled = true;
      b.classList.add('buzzer-pressed');
      p.onBuzz(b.dataset.buzz);
    };
    b.addEventListener('pointerdown', fire, { once: true });
    b.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && fire(e));
  }
  el.querySelectorAll('.choice:not([disabled])').forEach((btn) =>
    btn.addEventListener('click', () => {
      el.querySelectorAll('.choice').forEach((x) => (x.disabled = true));
      btn.classList.add('chosen');
      p.onAction(btn.dataset.qid, btn.dataset.value);
    }),
  );
  updateTimers(el);
}

export function updateTimers(root, nowMs = Date.now()) {
  root.querySelectorAll('[data-deadline]').forEach((t) => {
    const left = Math.max(0, Math.ceil((Number(t.dataset.deadline) - nowMs) / 1000));
    t.textContent = `⏱ ${left} s`;
    t.classList.toggle('urgent', left <= 5);
  });
}
