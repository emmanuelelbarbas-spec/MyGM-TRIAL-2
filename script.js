/* WWE Universe Ranking Manager 2.0 - Vanilla JS + localStorage */
const STORAGE_KEY = 'wwe_universe_manager_v2';

const DIVISIONS = {
  RAW: ['World Heavyweight', 'World Womens', 'Intercontinental', 'Womens Intercontinental', 'World Tag Team'],
  SMACKDOWN: ['Undisputed', 'WWE Womens', 'United States', 'Womens United States', 'WWE Tag Team'],
};

const EQUIVALENT_DIVISIONS = [
  ['World Heavyweight', 'Undisputed'],
  ['World Womens', 'WWE Womens'],
  ['Intercontinental', 'United States'],
  ['Womens Intercontinental', 'Womens United States'],
  ['World Tag Team', 'WWE Tag Team'],
];

const WEEKLY_ORDER = {
  RAW: ['Womens Intercontinental', 'World Tag Team', 'Intercontinental', 'World Womens', 'World Heavyweight'],
  SMACKDOWN: ['Womens United States', 'WWE Tag Team', 'United States', 'WWE Womens', 'Undisputed'],
};

const PPV_ORDER = ['Womens United States', 'Womens Intercontinental', 'World Tag Team', 'WWE Tag Team', 'United States', 'Intercontinental', 'World Womens', 'WWE Womens', 'World Heavyweight', 'Undisputed'];

const DEFAULT_STATE = {
  fighters: [],
  matchesHistory: [],
  showsHistory: { RAW: [], SMACKDOWN: [], PPV: [] },
  champions: {},
  counters: { RAW: 0, SMACKDOWN: 0, PPV: 0 },
};

let state = loadState();

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed ? { ...DEFAULT_STATE, ...parsed } : structuredClone(DEFAULT_STATE);
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderAll();
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isTagDivision(division) {
  return division.toLowerCase().includes('tag team');
}

function getFighters(brand, division) {
  return state.fighters.filter((f) => (!brand || f.marca === brand) && (!division || f.division === division));
}

function getChampion(division) {
  const champId = state.champions[division];
  return state.fighters.find((f) => f.id === champId) || null;
}

function computeRanking(brand, division) {
  const champ = getChampion(division);
  const pool = getFighters(brand, division).filter((f) => !champ || f.id !== champ.id);

  let entries;
  if (isTagDivision(division)) {
    const teams = new Map();
    for (const f of pool.filter((x) => x.esTagTeam && x.nombreTagTeam)) {
      if (!teams.has(f.nombreTagTeam)) teams.set(f.nombreTagTeam, []);
      teams.get(f.nombreTagTeam).push(f);
    }
    entries = Array.from(teams.entries()).map(([teamName, members]) => ({
      id: `team-${teamName}-${division}-${brand}`,
      displayName: teamName,
      points: Math.round(members.reduce((a, b) => a + b.puntos, 0) / members.length),
      wins: members.reduce((a, b) => a + b.victorias, 0),
      losses: members.reduce((a, b) => a + b.derrotas, 0),
      type: 'team',
      memberIds: members.map((m) => m.id),
      prevPos: Math.round(members.reduce((a, b) => a + (b.posicionAnterior || 99), 0) / members.length),
    }));
  } else {
    entries = pool.map((f) => ({
      id: f.id,
      displayName: f.nombre,
      points: f.puntos,
      wins: f.victorias,
      losses: f.derrotas,
      type: 'fighter',
      prevPos: f.posicionAnterior || 99,
    }));
  }

  entries.sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));
  entries.forEach((e, i) => (e.position = i + 1));
  return entries;
}

function updatePreviousPositions() {
  for (const brand of Object.keys(DIVISIONS)) {
    for (const division of DIVISIONS[brand]) {
      const ranking = computeRanking(brand, division);
      ranking.forEach((entry) => {
        if (entry.type === 'fighter') {
          const f = state.fighters.find((x) => x.id === entry.id);
          if (f) f.posicionAnterior = entry.position;
        } else {
          state.fighters.filter((x) => entry.memberIds.includes(x.id)).forEach((m) => (m.posicionAnterior = entry.position));
        }
      });
    }
  }
}

function registerFighter(data) {
  const base = {
    id: uid(), nombre: data.nombre.trim(), marca: data.marca, division: data.division,
    puntos: 0, victorias: 0, derrotas: 0, esCampeon: false, mesesUltimoLugar: 0,
    reinados: 0, posicionAnterior: 99, esTagTeam: !!data.esTagTeam, nombreTagTeam: data.nombreTagTeam || '',
  };
  state.fighters.push(base);
}

function canRegisterName(name, division) {
  return !state.fighters.some((f) => f.division === division && f.nombre.toLowerCase() === name.toLowerCase());
}

function getEntityBySelectValue(value, brand, division) {
  if (!value) return null;
  if (value.startsWith('team:')) {
    const name = value.replace('team:', '');
    const members = getFighters(brand, division).filter((f) => f.nombreTagTeam === name);
    return { type: 'team', name, members };
  }
  const fighter = state.fighters.find((f) => f.id === value);
  return fighter ? { type: 'fighter', fighter } : null;
}

function getPositionMap(brand, division) {
  const ranking = computeRanking(brand, division);
  const map = new Map();
  ranking.forEach((e) => {
    if (e.type === 'fighter') map.set(e.id, e.position);
    else e.memberIds.forEach((id) => map.set(id, e.position));
  });
  return map;
}

function applyWeeklyResult(winnerIds, loserIds, brand, division) {
  const posMap = getPositionMap(brand, division);
  const winnerPos = Math.min(...winnerIds.map((id) => posMap.get(id) || 99));
  const loserPos = Math.min(...loserIds.map((id) => posMap.get(id) || 99));
  const diff = loserPos - winnerPos;

  let bonus = 0;
  if (diff < 0) bonus = 5;
  else if (Math.abs(diff) <= 2) bonus = 2;

  let losePenalty = winnerPos > loserPos ? 6 : 2;

  winnerIds.forEach((id) => {
    const f = state.fighters.find((x) => x.id === id);
    if (!f) return;
    f.victorias += 1;
    if (!f.esCampeon) f.puntos += 8 + bonus;
  });

  loserIds.forEach((id) => {
    const f = state.fighters.find((x) => x.id === id);
    if (!f) return;
    f.derrotas += 1;
    if (!f.esCampeon) f.puntos = Math.max(0, f.puntos - (3 + losePenalty));
  });
}

function handleTitleMatch(winnerIds, loserIds, division) {
  const champ = getChampion(division);
  const winnerHasChamp = champ && winnerIds.includes(champ.id);
  if (winnerHasChamp) return;

  if (champ) {
    champ.esCampeon = false;
    champ.puntos = 0;
  }
  const newChamp = state.fighters.find((f) => winnerIds.includes(f.id));
  if (newChamp) {
    newChamp.esCampeon = true;
    newChamp.reinados += 1;
    state.champions[division] = newChamp.id;
  }
}

function recentOpponents(id, division, uptoShow) {
  const recent = state.matchesHistory
    .filter((m) => m.division === division && m.numeroShow <= uptoShow && m.numeroShow >= uptoShow - 3)
    .flatMap((m) => [[m.luchadorA, m.luchadorB], [m.luchadorB, m.luchadorA]]);
  return new Set(recent.filter(([a]) => a === id).map(([, b]) => b));
}

function generateWeeklyCard(brand) {
  const showNo = ++state.counters[brand];
  const out = [];
  const used = new Set();

  for (const division of WEEKLY_ORDER[brand]) {
    const ranking = computeRanking(brand, division).slice(0, 10);
    const candidateIds = ranking.flatMap((e) => (e.type === 'fighter' ? [e.id] : e.memberIds));
    let found = null;

    for (let i = 0; i < ranking.length; i++) {
      for (let j = i + 1; j < ranking.length; j++) {
        const a = ranking[i], b = ranking[j];
        if (Math.abs(a.position - b.position) > 3) continue;

        const aKey = a.type === 'fighter' ? a.id : a.memberIds.join('|');
        const bKey = b.type === 'fighter' ? b.id : b.memberIds.join('|');
        if (used.has(aKey) || used.has(bKey)) continue;

        const aRep = a.type === 'fighter' ? a.id : a.memberIds[0];
        const bRep = b.type === 'fighter' ? b.id : b.memberIds[0];
        const recent = recentOpponents(aRep, division, showNo);
        if (recent.has(bRep)) continue;
        found = [a, b];
        break;
      }
      if (found) break;
    }

    if (!found && ranking.length >= 2) found = [ranking[0], ranking[1]];
    if (!found) continue;

    const [a, b] = found;
    used.add(a.type === 'fighter' ? a.id : a.memberIds.join('|'));
    used.add(b.type === 'fighter' ? b.id : b.memberIds.join('|'));

    out.push({ division, a, b, brand, showNo, isTitle: false, fecha: new Date().toISOString() });
  }

  state.showsHistory[brand].push({
    id: uid(), type: brand, numeroShow: showNo, fecha: new Date().toISOString(), matches: out, name: `${brand} #${showNo}`,
  });
  saveState();
  return out;
}

function generatePPVCard(name) {
  const showNo = ++state.counters.PPV;
  const matches = [];
  for (const division of PPV_ORDER) {
    const brand = DIVISIONS.RAW.includes(division) ? 'RAW' : 'SMACKDOWN';
    const ranking = computeRanking(brand, division);
    const champ = getChampion(division);
    if (!champ || ranking.length === 0) continue;
    const first = ranking[0];
    const second = ranking[1];
    const isTriple = second && first.points === second.points;
    matches.push({ division, brand, showNo, isTitle: true, fecha: new Date().toISOString(), champId: champ.id, contenders: isTriple ? [first, second] : [first] });
  }

  state.showsHistory.PPV.push({
    id: uid(), type: 'PPV', numeroShow: showNo, fecha: new Date().toISOString(), name,
    matches,
  });
  saveState();
  return matches;
}

function performSoftDraft() {
  const changes = [];
  for (const [rawDiv, sdDiv] of EQUIVALENT_DIVISIONS) {
    const rawPool = getFighters('RAW', rawDiv).filter((f) => !f.esCampeon);
    const sdPool = getFighters('SMACKDOWN', sdDiv).filter((f) => !f.esCampeon);
    if (rawPool.length < 2 || sdPool.length < 2) continue;
    const pick = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, n);
    const rawPick = pick(rawPool, 2);
    const sdPick = pick(sdPool, 2);
    rawPick.forEach((f) => { f.marca = 'SMACKDOWN'; f.division = sdDiv; changes.push(`${f.nombre}: RAW → SMACKDOWN`); });
    sdPick.forEach((f) => { f.marca = 'RAW'; f.division = rawDiv; changes.push(`${f.nombre}: SMACKDOWN → RAW`); });
  }
  updatePreviousPositions();
  saveState();
  return changes;
}

function performAnnualDraft() {
  const changes = [];
  for (const [rawDiv, sdDiv] of EQUIVALENT_DIVISIONS) {
    const rawPool = getFighters('RAW', rawDiv);
    const sdPool = getFighters('SMACKDOWN', sdDiv);
    const pick = (arr, n) => arr.slice().sort(() => Math.random() - 0.5).slice(0, Math.min(n, arr.length));
    const rawPick = pick(rawPool, 5);
    const sdPick = pick(sdPool, 5);
    rawPick.forEach((f) => { f.marca = 'SMACKDOWN'; f.division = sdDiv; changes.push(`${f.nombre}: RAW → SMACKDOWN`); });
    sdPick.forEach((f) => { f.marca = 'RAW'; f.division = rawDiv; changes.push(`${f.nombre}: SMACKDOWN → RAW`); });

    const rawChamp = getChampion(rawDiv);
    const sdChamp = getChampion(sdDiv);
    if (rawChamp && rawChamp.marca !== 'RAW') { rawChamp.marca = 'SMACKDOWN'; rawChamp.division = sdDiv; }
    if (sdChamp && sdChamp.marca !== 'SMACKDOWN') { sdChamp.marca = 'RAW'; sdChamp.division = rawDiv; }
  }
  updatePreviousPositions();
  saveState();
  return changes;
}

function resetAfterPPVSeason() {
  state.fighters.forEach((f) => (f.puntos = 0));
}

function populateDivisions(select, brand) {
  select.innerHTML = '';
  DIVISIONS[brand].forEach((d) => {
    const op = document.createElement('option'); op.value = d; op.textContent = d; select.appendChild(op);
  });
}

function renderAll() {
  renderSummary();
  renderFightersAdmin();
  renderRankings();
  renderGeneralList();
  populateMatchSelectors();
  renderHistory('RAW');
}

function renderSummary() {
  const el = document.getElementById('universe-summary');
  const rawCount = state.fighters.filter((f) => f.marca === 'RAW').length;
  const sdCount = state.fighters.filter((f) => f.marca === 'SMACKDOWN').length;
  el.innerHTML = `<p>Total RAW: <strong>${rawCount}</strong></p><p>Total SMACKDOWN: <strong>${sdCount}</strong></p><p>Combates registrados: <strong>${state.matchesHistory.length}</strong></p>`;
}

function renderFightersAdmin() {
  const root = document.getElementById('fighters-admin');
  const list = state.fighters.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
  root.innerHTML = list.map((f) => `<div class="match"><strong>${f.nombre}</strong> <span class="badge ${f.esCampeon ? 'champ' : ''}">${f.esCampeon ? 'Campeón' : f.marca}</span> - ${f.division} ${f.nombreTagTeam ? `(${f.nombreTagTeam})` : ''}
    <div><button data-action="champ" data-id="${f.id}">Asignar campeón</button> <button data-action="move" data-id="${f.id}">Editar división</button> <button data-action="del" data-id="${f.id}" class="danger">Eliminar</button></div></div>`).join('');
}

function renderRankings() {
  const root = document.getElementById('rankings-root');
  const html = [];
  for (const brand of ['RAW', 'SMACKDOWN']) {
    for (const division of DIVISIONS[brand]) {
      const champ = getChampion(division);
      const ranking = computeRanking(brand, division);
      const risk = ranking[9] && ranking[10] && (ranking[9].points - ranking[10].points < 5);
      html.push(`<article class="card brand-row ${brand === 'RAW' ? 'raw' : 'sd'}"><h3>${brand} · ${division}</h3>
      <p>Campeón actual: <strong>${champ ? champ.nombre : 'Sin campeón'}</strong></p>
      ${risk ? '<p><span class="badge risk">EN RIESGO DE SALIR DEL TOP 10</span></p>' : ''}
      <table class="table"><thead><tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Movimiento</th><th>V</th><th>D</th></tr></thead><tbody>
      ${ranking.map((r) => {
        const move = r.prevPos > r.position ? `<span class="arrow-up">↑ ${r.prevPos}</span>` : r.prevPos < r.position ? `<span class="arrow-down">↓ ${r.prevPos}</span>` : `= ${r.prevPos}`;
        return `<tr><td>${r.position}</td><td>${r.displayName}</td><td>${r.points}</td><td>${move}</td><td>${r.wins}</td><td>${r.losses}</td></tr>`;
      }).join('')}
      </tbody></table></article>`);
    }
  }
  root.innerHTML = html.join('');
}

function renderGeneralList() {
  const root = document.getElementById('general-list');
  const byBrand = (brand) => {
    const fighters = state.fighters.filter((f) => f.marca === brand).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const men = fighters.filter((f) => !f.division.toLowerCase().includes('women'));
    const women = fighters.filter((f) => f.division.toLowerCase().includes('women'));
    const row = (f) => {
      const rank = computeRanking(brand, f.division).find((r) => (r.type === 'fighter' ? r.id === f.id : r.memberIds.includes(f.id)));
      return `<tr><td>${f.nombre}</td><td>${f.division}</td><td>${rank ? rank.position : '-'}</td><td>${f.puntos}</td><td>${f.esCampeon ? 'Sí' : 'No'}</td><td>${f.nombreTagTeam || '-'}</td></tr>`;
    };
    return `<h3>${brand} (${fighters.length})</h3><h4>Hombres</h4><table class="table"><tr><th>Nombre</th><th>División</th><th>Pos</th><th>Puntos</th><th>Campeón</th><th>Tag Team</th></tr>${men.map(row).join('')}</table><h4>Mujeres</h4><table class="table"><tr><th>Nombre</th><th>División</th><th>Pos</th><th>Puntos</th><th>Campeón</th><th>Tag Team</th></tr>${women.map(row).join('')}</table>`;
  };
  root.innerHTML = byBrand('RAW') + byBrand('SMACKDOWN');
}

function populateMatchSelectors() {
  const brandSel = document.getElementById('match-brand');
  const divSel = document.getElementById('match-division');
  if (!brandSel.options.length) {
    ['RAW', 'SMACKDOWN'].forEach((b) => brandSel.add(new Option(b, b)));
  }
  const refill = () => {
    populateDivisions(divSel, brandSel.value);
    const aSel = document.getElementById('match-a');
    const bSel = document.getElementById('match-b');
    const wSel = document.getElementById('match-winner');
    const ranking = computeRanking(brandSel.value, divSel.value);
    const options = ranking.map((r) => ({ value: r.type === 'team' ? `team:${r.displayName}` : r.id, text: r.displayName }));
    [aSel, bSel, wSel].forEach((sel) => {
      sel.innerHTML = '';
      options.forEach((o) => sel.add(new Option(o.text, o.value)));
    });
  };
  brandSel.onchange = refill;
  divSel.onchange = refill;
  refill();
}

function renderHistory(type) {
  const root = document.getElementById('history-output');
  const shows = state.showsHistory[type] || [];
  root.innerHTML = shows.slice().reverse().map((s) => `<div class="match"><strong>${s.name || `${type} #${s.numeroShow}`}</strong> · ${new Date(s.fecha).toLocaleString()}
  <div>${(s.matches || []).map((m) => `<div>${m.division} - ${m.a ? `${m.a.displayName} vs ${m.b.displayName}` : 'Lucha titular'}</div>`).join('')}</div></div>`).join('') || '<p>Sin shows guardados.</p>';
}

// --- Events ---
document.querySelectorAll('#main-tabs .tab-btn').forEach((btn) => btn.addEventListener('click', () => {
  document.querySelectorAll('#main-tabs .tab-btn').forEach((x) => x.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
  document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
}));

document.getElementById('history-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab-btn');
  if (!b) return;
  document.querySelectorAll('#history-tabs .tab-btn').forEach((x) => x.classList.remove('active'));
  b.classList.add('active');
  renderHistory(b.dataset.history);
});

['RAW', 'SMACKDOWN'].forEach((b) => {
  document.getElementById('fighter-brand').add(new Option(b, b));
});
populateDivisions(document.getElementById('fighter-division'), 'RAW');
document.getElementById('fighter-brand').addEventListener('change', (e) => populateDivisions(document.getElementById('fighter-division'), e.target.value));

document.getElementById('is-tag').addEventListener('change', (e) => {
  document.getElementById('tag-fields').classList.toggle('hidden', !e.target.checked);
});

document.getElementById('fighter-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const brand = document.getElementById('fighter-brand').value;
  const division = document.getElementById('fighter-division').value;
  const isTag = document.getElementById('is-tag').checked;

  if (!isTag) {
    const name = document.getElementById('fighter-name').value.trim();
    if (!name || !canRegisterName(name, division)) return alert('Nombre inválido o duplicado en la división.');
    registerFighter({ nombre: name, marca: brand, division });
  } else {
    const teamName = document.getElementById('tag-name').value.trim();
    const m1 = document.getElementById('tag-member-1').value.trim();
    const m2 = document.getElementById('tag-member-2').value.trim();
    if (!teamName || !m1 || !m2) return alert('Completa los campos del Tag Team.');
    if (!canRegisterName(m1, division) || !canRegisterName(m2, division)) return alert('Integrante duplicado en la división.');
    registerFighter({ nombre: m1, marca: brand, division, esTagTeam: true, nombreTagTeam: teamName });
    registerFighter({ nombre: m2, marca: brand, division, esTagTeam: true, nombreTagTeam: teamName });
  }
  saveState();
  e.target.reset();
  document.getElementById('tag-fields').classList.add('hidden');
});

document.getElementById('fighters-admin').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const fighter = state.fighters.find((f) => f.id === btn.dataset.id);
  if (!fighter) return;
  if (btn.dataset.action === 'del') {
    state.fighters = state.fighters.filter((f) => f.id !== fighter.id);
    Object.keys(state.champions).forEach((div) => {
      if (state.champions[div] === fighter.id) delete state.champions[div];
    });
  }
  if (btn.dataset.action === 'move') {
    const newDivision = prompt('Nueva división', fighter.division);
    if (newDivision) {
      fighter.division = newDivision;
      fighter.puntos = 0;
      fighter.marca = DIVISIONS.RAW.includes(newDivision) ? 'RAW' : 'SMACKDOWN';
    }
  }
  if (btn.dataset.action === 'champ') {
    const current = getChampion(fighter.division);
    if (current) current.esCampeon = false;
    fighter.esCampeon = true;
    fighter.reinados += 1;
    state.champions[fighter.division] = fighter.id;
  }
  saveState();
});

document.getElementById('match-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const brand = document.getElementById('match-brand').value;
  const division = document.getElementById('match-division').value;
  const a = getEntityBySelectValue(document.getElementById('match-a').value, brand, division);
  const b = getEntityBySelectValue(document.getElementById('match-b').value, brand, division);
  const w = getEntityBySelectValue(document.getElementById('match-winner').value, brand, division);
  if (!a || !b || !w) return alert('Completa selección de combate.');
  if ((a.type === 'fighter' ? a.fighter.id : a.name) === (b.type === 'fighter' ? b.fighter.id : b.name)) return alert('Participantes deben ser distintos.');

  const aIds = a.type === 'fighter' ? [a.fighter.id] : a.members.map((m) => m.id);
  const bIds = b.type === 'fighter' ? [b.fighter.id] : b.members.map((m) => m.id);
  const winnerIds = w.type === 'fighter' ? [w.fighter.id] : w.members.map((m) => m.id);
  const loserIds = winnerIds.some((id) => aIds.includes(id)) ? bIds : aIds;

  applyWeeklyResult(winnerIds, loserIds, brand, division);
  if (document.getElementById('is-title-match').checked) handleTitleMatch(winnerIds, loserIds, division);

  const showNo = ++state.counters[brand];
  state.matchesHistory.push({
    idCombate: uid(),
    luchadorA: a.type === 'fighter' ? a.fighter.id : aIds[0],
    luchadorB: b.type === 'fighter' ? b.fighter.id : bIds[0],
    division, fecha: new Date().toISOString(), numeroShow: showNo,
    esCombatePorCampeonato: document.getElementById('is-title-match').checked,
  });
  updatePreviousPositions();
  saveState();
});

document.getElementById('btn-generate-raw').addEventListener('click', () => {
  const card = generateWeeklyCard('RAW');
  document.getElementById('weekly-card-output').innerHTML = `<h4>RAW</h4>${card.map((m) => `<div class="match">${m.division}: ${m.a.displayName} vs ${m.b.displayName}</div>`).join('')}`;
});

document.getElementById('btn-generate-sd').addEventListener('click', () => {
  const card = generateWeeklyCard('SMACKDOWN');
  document.getElementById('weekly-card-output').innerHTML = `<h4>SmackDown</h4>${card.map((m) => `<div class="match">${m.division}: ${m.a.displayName} vs ${m.b.displayName}</div>`).join('')}`;
});

document.getElementById('btn-generate-ppv').addEventListener('click', () => {
  const name = document.getElementById('ppv-name').value.trim();
  if (!name) return alert('El nombre del PPV es obligatorio.');
  const card = generatePPVCard(name);
  document.getElementById('ppv-card-output').innerHTML = `<h4>${name}</h4>${card.map((m) => `<div class="match">${m.division}: Campeón vs ${m.contenders.map((c) => c.displayName).join(' vs ')}</div>`).join('')}`;
});

document.getElementById('btn-soft-draft').addEventListener('click', () => {
  const changes = performSoftDraft();
  document.getElementById('draft-log').innerHTML = changes.length ? changes.map((c) => `<div>${c}</div>`).join('') : 'Sin cambios (falta de luchadores).';
});

document.getElementById('btn-annual-draft').addEventListener('click', () => {
  const changes = performAnnualDraft();
  document.getElementById('draft-log').innerHTML = changes.length ? changes.map((c) => `<div>${c}</div>`).join('') : 'Sin cambios.';
});

document.getElementById('btn-save').addEventListener('click', saveState);

document.getElementById('btn-reset').addEventListener('click', () => {
  if (!confirm('¿Seguro que deseas borrar todos los datos?')) return;
  state = structuredClone(DEFAULT_STATE);
  saveState();
});

renderAll();
