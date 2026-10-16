// Écrans hors des questions : réglages, salle d'attente, intro de manche, podium.

import * as C from '../shared/content.js';
import { esc } from '../shared/controls.js';
import { btn, stage } from './render.js';
import { S, activeTeams, animalOf, estimateMinutes, len, rankOf, ranking, roundRules, roundType, rt, saved } from './state.js';
import { voiceInfo } from './voice.js';

export function renderSetup() {
  const st = S.settings;
  const resume = rt.resumePrompt
    ? `<div class="resume card">Une partie est en cours (${esc(C.ROUNDS[saved.settings.rounds[saved.ri]]?.title || 'podium')}).
        ${btn('resume', 'Reprendre la partie', 'btn-primary')} ${btn('discard', 'Ignorer', 'btn-ghost')}</div>`
    : '';
  const teamsHtml = S.teams
    .slice(0, st.nTeams)
    .map(
      (t, i) => `<div class="setup-team" style="--team:${t.color};--ink:${t.ink}">
        <input class="team-name" data-team-name="${i}" value="${esc(t.name)}" maxlength="16" aria-label="Nom de l’équipe ${i + 1}">
        <div class="animal-grid">${C.ANIMALS.map((a) => {
          const taken = S.teams.slice(0, st.nTeams).some((o, j) => j !== i && o.animal === a.id);
          return `<button class="animal ${t.animal === a.id ? 'on' : ''}" data-act="animal" data-team="${i}" data-animal="${a.id}" ${taken ? 'disabled' : ''} title="${a.label}">${a.emoji}</button>`;
        }).join('')}</div>
        <div class="animal-label">${animalOf(t).label}</div>
      </div>`,
    )
    .join('');
  const rounds = C.ROUND_ORDER.map((r) => `<label class="chk"><input type="checkbox" data-round="${r}" ${st.rounds.includes(r) ? 'checked' : ''}> ${C.ROUNDS[r].title}</label>`).join('');
  stage(
    `<div class="setup">
      ${resume}
      <h1 class="title-xl">Burger Quiz <span>maison</span></h1>
      <div class="card">
        <h2>Comment jouez-vous ?</h2>
        <div class="seg">
          <button class="${S.mode === 'net' ? 'on' : ''}" data-act="mode" data-v="net">📱 Avec les téléphones<small>chaque équipe a son buzzer</small></button>
          <button class="${S.mode === 'local' ? 'on' : ''}" data-act="mode" data-v="local">📺 Tablette unique<small>tout sur cet écran</small></button>
        </div>
        ${S.mode === 'net' ? `<label class="chk presenter-opt"><input type="checkbox" data-set="presenter" ${st.presenter ? 'checked' : ''}> 🎤 Avec un présentateur : il pilote le jeu depuis son téléphone et voit les réponses (un seul présentateur, QR code secret)</label>` : ''}
      </div>
      <div class="card">
        <h2>Équipes</h2>
        <div class="seg-num" role="group" aria-label="Nombre d’équipes">
          ${Array.from({ length: C.MAX_TEAMS - 1 }, (_, i) => i + 2).map((n) => `<button class="${st.nTeams === n ? 'on' : ''}" data-act="nteams" data-v="${n}">${n}</button>`).join('')}
          <span>équipes</span>
        </div>
        <div class="setup-teams">${teamsHtml}</div>
      </div>
      ${voiceCard(st)}
      <div class="card">
        <h2>Durée de la partie</h2>
        <div class="seg seg-3">
          ${Object.entries(C.LENGTHS).map(([k, L]) => `<button class="${st.length === k ? 'on' : ''}" data-act="length" data-v="${k}">${L.label}<small>${L.hint}</small></button>`).join('')}
        </div>
        <p class="hint">${len().nuggets} Nuggets · ${len().selpoivre} Sel ou Poivre · ${len().addition} Additions · menus de ${len().menuQs} questions · ${len().burger} Burgers · ${Math.min(len().performers, st.nTeams) >= st.nTeams ? 'toutes les équipes' : `${len().performers} équipes`} aux pubs et défis.
          <b>Environ ${estimateMinutes(st)} minutes</b> avec ces réglages.</p>
      </div>
      <div class="card">
        <h2>Manches</h2>
        <div class="chks">${rounds}</div>
        <h2>Réglages</h2>
        <div class="opts">
          <label>Règles bizarres
            <select data-set="twistRate">
              ${[[0, 'Jamais'], [0.2, '1 question sur 5'], [0.33, '1 question sur 3']].map(([v, l]) => `<option value="${v}" ${Math.abs(st.twistRate - v) < 0.01 ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
          <label class="chk"><input type="checkbox" data-set="selTimer" ${st.selTimer ? 'checked' : ''}> Chrono de 15 s pour Sel ou Poivre</label>
          <label class="chk"><input type="checkbox" data-set="buzzDuringRead" ${st.buzzDuringRead ? 'checked' : ''}> Buzzer autorisé pendant la lecture</label>
          <label>Chrono pour répondre après un buzz
            <select data-set="answerTimer">
              ${[[0, 'Sans chrono'], [5, '5 secondes'], [10, '10 secondes'], [15, '15 secondes'], [20, '20 secondes']].map(([v, l]) => `<option value="${v}" ${st.answerTimer === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
          <label class="chk"><input type="checkbox" data-set="suspense" ${st.suspense ? 'checked' : ''}> Suspense : roulement de tambour avant les révélations, annonce du nouveau leader, classement avant la finale</label>
          <label class="chk"><input type="checkbox" data-set="catchup" ${st.catchup ? 'checked' : ''}> Coup de pouce : de temps en temps, l’équipe dernière marque double (règle bizarre)</label>
        </div>
      </div>
    </div>`,
    btn('create', S.mode === 'net' ? 'Créer la salle 🍔' : 'Lancer la partie 🍔', 'btn-primary btn-big', st.rounds.length ? '' : 'disabled'),
  );
}

export function voiceCard(st) {
  if (!voiceInfo.loaded) return '';
  if (!voiceInfo.available) return ''; // pas de clé ElevenLabs sur le serveur : rien à proposer
  const opts = voiceInfo.voices
    .map((v) => {
      const lab = [v.labels.gender, v.labels.accent, v.labels.language].filter(Boolean).join(', ');
      return `<option value="${esc(v.id)}" ${st.voiceId === v.id ? 'selected' : ''}>${esc(v.name)}${lab ? ` (${esc(lab)})` : ''}</option>`;
    })
    .join('');
  return `<div class="card">
    <h2>🎙️ Voix de l’animateur</h2>
    <label class="chk"><input type="checkbox" data-set="voice" ${st.voice ? 'checked' : ''}> Un animateur lit les questions, les règles et les réponses (ElevenLabs)</label>
    ${st.voice ? `<div class="opts voice-opts">
      <label>Voix <select data-set="voiceId">${opts}</select></label>
      <label>Qualité <select data-set="voiceQuality">
        <option value="eco" ${st.voiceQuality === 'eco' ? 'selected' : ''}>Rapide et économique</option>
        <option value="qualite" ${st.voiceQuality === 'qualite' ? 'selected' : ''}>Haute qualité (plus de crédits)</option>
      </select></label>
      ${btn('voice-test', '🔊 Écouter la voix', 'btn-ghost btn-small')}
      <p class="hint">Avec la voix, les buzzers s’ouvrent quand l’animateur a fini de lire la question.</p>
    </div>` : ''}
  </div>`;
}

export function renderLobby() {
  const qr = rt.joinUrl ? `<img class="qr" src="/qr.svg?text=${encodeURIComponent(rt.joinUrl)}" alt="QR code pour rejoindre">` : '<div class="qr qr-wait">…</div>';
  const teams = activeTeams()
    .map((t) => {
      const n = rt.deviceCounts[t.id] || 0;
      return `<div class="lobby-team ${n ? 'ready' : ''}" style="--team:${t.color};--ink:${t.ink}">${animalOf(t).emoji} ${esc(t.name)}<span>${n ? `📱 ${n} connecté${n > 1 ? 's' : ''}` : 'en attente…'}</span></div>`;
    })
    .join('');
  stage(
    `<div class="lobby">
      <div class="lobby-qr">${qr}</div>
      <div class="lobby-info">
        <div class="lobby-step">Scannez le QR code avec un téléphone par équipe</div>
        <div class="lobby-code-label">ou ouvrez <b>${esc(rt.joinUrl.replace(/\?.*/, '') || '…')}</b> et tapez le code</div>
        <div class="lobby-code">${esc(S.code || '····')}</div>
        <div class="lobby-teams">${teams}</div>
        <p class="hint">Plusieurs téléphones par équipe ? Pas de souci, ils buzzent tous pour leur équipe.</p>
      </div>
    </div>`,
    `${S.settings.presenter ? btn('m-presenter', rt.remoteCount ? '🎤 Présentateur connecté' : '🎤 Présentateur', 'btn-ghost') + ' ' : ''}${btn('test-sounds', '🔊 Tester les cris', 'btn-ghost')} ${btn('begin', 'Lancer la partie !', 'btn-primary btn-big')}`,
  );
}

export function renderRoundIntro() {
  const type = roundType();
  const info = C.ROUNDS[type];
  stage(
    `<div class="round-intro ${type}">
      <div class="round-num">Manche ${S.ri + 1}${S.ri === S.settings.rounds.length - 1 && type === 'burger' ? ' · finale' : ''}</div>
      <div class="round-title">${esc(info.title)}</div>
      <div class="round-sub">${esc(info.subtitle)}</div>
      <div class="round-rules">${esc(roundRules(type))}</div>
      ${finalStandings()}
    </div>`,
    btn('start-round', 'C’est parti !', 'btn-primary btn-big'),
  );
}

// classement dévoilé du dernier au premier avant la dernière manche (réglage « Suspense »)
export function finalStandings() {
  if (!S.settings.suspense || S.ri === 0 || S.ri !== S.settings.rounds.length - 1) return '';
  const r = ranking();
  const n = r.length;
  return `<div class="standings"><div class="standings-title">Classement avant la finale</div>${r
    .map((t, i) => `<div class="standing" style="--team:${t.color};--ink:${t.ink};animation-delay:${0.4 + (n - 1 - i) * 0.5}s"><b>${rankOf(t)}</b>${animalOf(t).emoji} ${esc(t.name)}<span>${t.score} pt${Math.abs(t.score) > 1 ? 's' : ''}</span></div>`)
    .join('')}</div>`;
}

export function renderPodium() {
  const r = ranking();
  const rest = r
    .slice(3)
    .map((t) => `<li style="--team:${t.color};--ink:${t.ink}"><b>${rankOf(t)}</b> ${animalOf(t).emoji} ${esc(t.name)}<span>${t.score} pt${Math.abs(t.score) > 1 ? 's' : ''}</span></li>`)
    .join('');
  const places = r
    .slice(0, 3)
    .map((t, i) => `<div class="podium-step p${i + 1}" style="--team:${t.color};--ink:${t.ink}"><div class="podium-emoji">${animalOf(t).emoji}</div><div class="podium-name">${esc(t.name)}</div><div class="podium-pts">${t.score} pt${Math.abs(t.score) > 1 ? 's' : ''}</div><div class="podium-block">${rankOf(t)}</div></div>`)
    .join('');
  const tie = r.length > 1 && r[0].score === r[1].score;
  stage(
    `<div class="podium-title">${tie ? 'Égalité au sommet !' : `🏆 ${esc(r[0].name)} gagne !`}</div><div class="podium">${places}</div>${rest ? `<ol class="podium-rest">${rest}</ol>` : ''}<div class="confetti">${'<i></i>'.repeat(40)}</div>`,
    `${btn('replay', 'Rejouer (mêmes équipes)', 'btn-primary btn-big')} ${btn('new-game', 'Nouvelle partie', 'btn-ghost')}`,
  );
}
