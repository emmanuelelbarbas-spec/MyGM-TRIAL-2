const STORAGE_KEY = 'wwe_universe_v2';

const DIVISIONS = {
  RAW: ['World Heavyweight', 'World Womens', 'Intercontinental', 'Womens Intercontinental', 'World Tag Team'],
  SMACKDOWN: ['Undisputed', 'WWE Womens', 'United States', 'Womens United States', 'WWE Tag Team']
};
const PPV_ORDER = ['Womens United States', 'Womens Intercontinental', 'World Tag Team', 'WWE Tag Team', 'United States', 'Intercontinental', 'World Womens', 'WWE Womens', 'World Heavyweight', 'Undisputed'];
const WEEKLY_ORDER = {
  RAW: ['Womens Intercontinental', 'World Tag Team', 'Intercontinental', 'World Womens', 'World Heavyweight'],
  SMACKDOWN: ['Womens United States', 'WWE Tag Team', 'United States', 'WWE Womens', 'Undisputed']
};

const initial = () => ({ fighters: [], matches: [], shows: [], seq: 1, showSeq: { RAW: 1, SMACKDOWN: 1, PPV: 1 }, lastDraftLog: [] });
let db = load();

function load() { try { return { ...initial(), ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { return initial(); } }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
function uid() { return db.seq++; }
const byId = (id) => db.fighters.find(f => f.id === Number(id));

function baseFighter(name, brand, division, extra = {}) {
  return { id: uid(), nombre: name.trim(), marca: brand, division, puntos: 0, victorias: 0, derrotas: 0, esCampeon: false, mesesUltimoLugar: 0, reinados: 0, posicionAnterior: null, esTagTeam: false, nombreTagTeam: '', ...extra };
}

function fightersInDivision(brand, division, includeChampion = false) {
  return db.fighters.filter(f => f.marca === brand && f.division === division && (includeChampion || !f.esCampeon));
}
function championOf(brand, division) { return db.fighters.find(f => f.marca === brand && f.division === division && f.esCampeon); }
function divisionBrand(division) { return DIVISIONS.RAW.includes(division) ? 'RAW' : 'SMACKDOWN'; }

function getRankingEntries(brand, division) {
  const pool = fightersInDivision(brand, division);
  if (division.includes('Tag Team')) {
    const teams = [...new Set(pool.filter(f => f.nombreTagTeam).map(f => f.nombreTagTeam))].map(t => {
      const m = pool.filter(p => p.nombreTagTeam === t);
      return { team: t, puntos: Math.max(...m.map(x => x.puntos), 0), victorias: m.reduce((a,b)=>a+b.victorias,0), derrotas: m.reduce((a,b)=>a+b.derrotas,0), members: m };
    });
    return teams.sort((a,b)=>b.puntos-a.puntos||a.team.localeCompare(b.team));
  }
  return pool.sort((a,b)=>b.puntos-a.puntos||a.nombre.localeCompare(b.nombre));
}

function recalcPositions() {
  ['RAW','SMACKDOWN'].forEach(brand => DIVISIONS[brand].forEach(div => {
    const ranking = getRankingEntries(brand, div);
    ranking.forEach((entry, i) => {
      if (div.includes('Tag Team')) entry.members.forEach(m => { m.posicionAnterior = m.posicionActual || null; m.posicionActual = i+1; });
      else { entry.posicionAnterior = entry.posicionActual || null; entry.posicionActual = i + 1; }
    });
  }));
}

function updateDivisionOptions() {
  const brand = document.getElementById('brand').value;
  document.getElementById('division').innerHTML = DIVISIONS[brand].map(d => `<option>${d}</option>`).join('');
}

function renderTabs() {
  const tabNames = ['estado','gestion','rankings','combate','carteleras','listado','historial'];
  const nav = document.getElementById('mainTabs');
  nav.innerHTML = tabNames.map(t => `<button data-tab="${t}">${t.toUpperCase()}</button>`).join('');
  nav.querySelectorAll('button').forEach(b => b.onclick = () => activateTab(b.dataset.tab));
  activateTab('estado');
}
function activateTab(tab) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.dataset.tab === tab));
}

function renderChampionsOverview() {
  const out = document.getElementById('championsOverview');
  out.innerHTML = ['RAW','SMACKDOWN'].map(brand => DIVISIONS[brand].map(div => {
    const c = championOf(brand, div);
    return `<div class="card"><h4>${brand} - ${div}</h4><div>${c ? c.nombre : 'Sin campeón'}</div></div>`;
  }).join('')).join('');
}

function renderAdmin() {
  const cont = document.getElementById('fightersAdmin');
  cont.innerHTML = ['RAW','SMACKDOWN'].map(brand => {
    const list = db.fighters.filter(f=>f.marca===brand).sort((a,b)=>a.nombre.localeCompare(b.nombre));
    return `<div class="card"><h3>${brand} (${list.length})</h3>${list.map(f=>`<div class="row fighter-item"><span>${f.nombre} - ${f.division} ${f.esCampeon?'🏆':''} ${f.nombreTagTeam?`[${f.nombreTagTeam}]`:''}</span><button data-act="champ" data-id="${f.id}">Asignar campeón</button><button data-act="edit" data-id="${f.id}">Mover división</button><button data-act="del" data-id="${f.id}">Eliminar</button></div>`).join('')}</div>`;
  }).join('');
  cont.querySelectorAll('button').forEach(b => b.onclick = adminAction);
}

function adminAction(e) {
  const id = Number(e.target.dataset.id), act = e.target.dataset.act;
  const f = byId(id); if (!f) return;
  if (act === 'del') db.fighters = db.fighters.filter(x=>x.id!==id);
  if (act === 'edit') {
    const nxt = prompt('Nueva división', f.division);
    if (nxt && DIVISIONS[f.marca].includes(nxt)) { f.division = nxt; f.puntos = 0; }
  }
  if (act === 'champ') {
    db.fighters.forEach(x => { if (x.marca===f.marca&&x.division===f.division) x.esCampeon=false; });
    f.esCampeon = true;
  }
  postUpdate();
}

function movementIndicator(f) {
  if (!f.posicionAnterior || !f.posicionActual) return '-';
  if (f.posicionActual < f.posicionAnterior) return `<span class="up">↑ (${f.posicionAnterior})</span>`;
  if (f.posicionActual > f.posicionAnterior) return `<span class="down">↓ (${f.posicionAnterior})</span>`;
  return '→';
}

function renderRankings() {
  const out = document.getElementById('rankingsContainer');
  out.innerHTML = ['RAW','SMACKDOWN'].map(brand => DIVISIONS[brand].map(div => {
    const champ = championOf(brand, div);
    const r = getRankingEntries(brand, div);
    const rows = div.includes('Tag Team')
      ? r.map((t,i)=>`<tr><td>${i+1}</td><td>${t.team}</td><td>${t.puntos}</td><td>-</td><td>${t.victorias}</td><td>${t.derrotas}</td></tr>`).join('')
      : r.map((f,i)=>`<tr><td>${i+1}</td><td>${f.nombre}${riskText(brand,div,f,i)}</td><td>${f.puntos}</td><td>${movementIndicator(f)}</td><td>${f.victorias}</td><td>${f.derrotas}</td></tr>`).join('');
    return `<div class="card"><h3><span class="badge ${brand==='RAW'?'raw':'sd'}">${brand}</span> ${div}</h3><div>Campeón: ${champ?champ.nombre:'Sin campeón'}</div><table class="table"><thead><tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Mov.</th><th>V</th><th>D</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join('')).join('');
}
function riskText(brand,div,f,i){
  const r = getRankingEntries(brand,div);
  if(i===9&&r[10]&&f.puntos-r[10].puntos<5) return ' <span class="warning">EN RIESGO DE SALIR DEL TOP 10</span>';
  return '';
}

function fillMatchSelectors() {
  const divisionSel = document.getElementById('matchDivision');
  divisionSel.innerHTML = [...DIVISIONS.RAW,...DIVISIONS.SMACKDOWN].map(d=>`<option>${d}</option>`).join('');
  const populate = () => {
    const div = divisionSel.value, brand = divisionBrand(div);
    document.getElementById('matchBrand').value = brand;
    const pool = fightersInDivision(brand, div, true);
    const options = pool.map(f=>`<option value="${f.id}">${f.nombre}</option>`).join('');
    ['fighterA','fighterB','winner'].forEach(id=>document.getElementById(id).innerHTML = options);
  };
  divisionSel.onchange = populate;
  populate();
}

function applyMatchResult(a, b, winnerId, titleMatch=false) {
  const winner = winnerId===a.id?a:b, loser = winner===a?b:a;
  const rank = getRankingEntries(a.marca, a.division).filter(x=>x.id);
  const wPos = rank.findIndex(x=>x.id===winner.id), lPos = rank.findIndex(x=>x.id===loser.id);
  if (!winner.esCampeon) {
    let gain = 8;
    if (wPos > lPos) gain += 5; else if (Math.abs(wPos-lPos)<=2) gain += 2;
    winner.puntos += gain;
  }
  if (!loser.esCampeon) {
    let penalty = lPos < wPos ? 6 : 2;
    loser.puntos = Math.max(0, loser.puntos - penalty);
  }
  winner.victorias++; loser.derrotas++;

  if (titleMatch) {
    const champ = winner.esCampeon ? winner : loser.esCampeon ? loser : null;
    if (champ && winner !== champ) {
      champ.esCampeon = false; champ.puntos = 0;
      winner.esCampeon = true; winner.reinados++;
    }
  }
}

function registerMatch(e) {
  e.preventDefault();
  const a = byId(document.getElementById('fighterA').value);
  const b = byId(document.getElementById('fighterB').value);
  const winner = Number(document.getElementById('winner').value);
  if (!a || !b || a.id===b.id) return alert('Selecciona luchadores distintos.');
  applyMatchResult(a,b,winner,document.getElementById('titleMatch').checked);
  db.matches.push({ idCombate: uid(), luchadorA:a.id, luchadorB:b.id, division:a.division, fecha:new Date().toISOString(), numeroShow:`M-${db.matches.length+1}`, esCombatePorCampeonato:document.getElementById('titleMatch').checked });
  postUpdate();
}

function canFace(a,b,brand){
  const sameShowBusy = false;
  const recent = db.matches.filter(m=>m.division===a.division).slice(-20).reverse();
  let seen=0;
  for(const m of recent){
    if(m.numeroShow.startsWith(brand[0])) seen++;
    if(seen>3) break;
    if((m.luchadorA===a.id&&m.luchadorB===b.id)||(m.luchadorA===b.id&&m.luchadorB===a.id)) return false;
  }
  return !sameShowBusy;
}

function generateWeekly(brand){
  const bouts=[]; const used=new Set();
  WEEKLY_ORDER[brand].forEach(div=>{
    const ranking=getRankingEntries(brand,div).slice(0,10).filter(x=>x.id);
    let picked=null;
    for(let i=0;i<ranking.length&&!picked;i++) for(let j=i+1;j<ranking.length&&!picked;j++){
      const a=ranking[i],b=ranking[j];
      if(Math.abs(i-j)>3||used.has(a.id)||used.has(b.id)) continue;
      if(canFace(a,b,brand)){ picked={a,b,division:div}; used.add(a.id);used.add(b.id); }
    }
    if(!picked&&ranking.length>=2) picked={a:ranking[0],b:ranking[1],division:div};
    if(picked) bouts.push(picked);
  });
  const showNo = db.showSeq[brand]++;
  const show={type:brand, numero:showNo, fecha:new Date().toISOString(), nombre:`${brand} #${showNo}`, cartelera:bouts.map(b=>({...b, ganador:null}))};
  db.shows.push(show); save(); renderAll();
  return show;
}

function generatePPV(){
  const name=document.getElementById('ppvName').value.trim();
  if(!name) return alert('Nombre PPV obligatorio');
  const bouts=PPV_ORDER.map(div=>{
    const brand=divisionBrand(div), champ=championOf(brand,div), rank=getRankingEntries(brand,div).filter(x=>x.id);
    if(!champ||!rank[0]) return null;
    const second=rank[1]&&rank[1].puntos===rank[0].puntos?rank[1]:null;
    return { division:div, brand, campeon:champ.id, retador1:rank[0].id, retador2:second?second.id:null, ganador:null, title:true };
  }).filter(Boolean);
  const no=db.showSeq.PPV++;
  const show={type:'PPV',numero:no,fecha:new Date().toISOString(),nombre:name,cartelera:bouts};
  db.shows.push(show); save(); renderAll(); return show;
}

function renderCardsOutput(last){
  const out=document.getElementById('cardsOutput');
  if(!last){ out.innerHTML='<p class="small">Genera una cartelera.</p>'; return; }
  out.innerHTML=`<div class="card"><h3>${last.nombre}</h3>${last.cartelera.map(c=>`<div>${c.division}: ${c.a?`${c.a.nombre} vs ${c.b.nombre}`:`${byId(c.campeon)?.nombre} vs ${byId(c.retador1)?.nombre}${c.retador2?` vs ${byId(c.retador2)?.nombre}`:''}`}</div>`).join('')}</div>`;
}

function renderGeneralList(){
  const out=document.getElementById('generalList');
  out.innerHTML=['RAW','SMACKDOWN'].map(brand=>{
    const men=db.fighters.filter(f=>f.marca===brand&&!f.division.toLowerCase().includes('womens')).sort((a,b)=>a.nombre.localeCompare(b.nombre));
    const women=db.fighters.filter(f=>f.marca===brand&&f.division.toLowerCase().includes('womens')).sort((a,b)=>a.nombre.localeCompare(b.nombre));
    const render=(arr,title)=>`<h4>${title}</h4>${arr.map(f=>`<div class="card">${f.nombre} | ${f.division} | Pos: ${f.posicionActual||'-'} | Pts: ${f.puntos} | Campeón: ${f.esCampeon?'Sí':'No'} | Tag: ${f.nombreTagTeam||'-'}</div>`).join('')}`;
    return `<div class="card"><h3>${brand} Total: ${men.length+women.length}</h3>${render(men,'Hombres')}${render(women,'Mujeres')}</div>`;
  }).join('');
}

function renderHistory(){
  const types=['RAW','SMACKDOWN','PPV'];
  const tabs=document.getElementById('historyTabs');
  tabs.innerHTML=types.map(t=>`<button data-t="${t}">${t}</button>`).join('');
  const out=document.getElementById('historyOutput');
  const draw=(t)=>{ out.innerHTML=db.shows.filter(s=>s.type===t).reverse().map(s=>`<div class="card"><h4>${s.nombre} (${new Date(s.fecha).toLocaleString()})</h4>${s.cartelera.map(c=>`<div>${c.division} - ${c.a?`${c.a.nombre} vs ${c.b.nombre}`:`${byId(c.campeon)?.nombre} vs ${byId(c.retador1)?.nombre}${c.retador2?` vs ${byId(c.retador2)?.nombre}`:''}`}</div>`).join('')}</div>`).join('') || '<p class="small">Sin historial.</p>'; };
  tabs.querySelectorAll('button').forEach(b=>b.onclick=()=>draw(b.dataset.t));
  draw('RAW');
}

function equivalentDivision(division){
  const pairs={ 'World Heavyweight':'Undisputed','World Womens':'WWE Womens','Intercontinental':'United States','Womens Intercontinental':'Womens United States','World Tag Team':'WWE Tag Team'};
  return pairs[division] || Object.keys(pairs).find(k=>pairs[k]===division);
}

function runDraft(soft=true){
  const changes=[];
  DIVISIONS.RAW.forEach(rawDiv=>{
    const sdDiv=equivalentDivision(rawDiv);
    let raw=db.fighters.filter(f=>f.marca==='RAW'&&f.division===rawDiv&&(!soft||!f.esCampeon));
    let sd=db.fighters.filter(f=>f.marca==='SMACKDOWN'&&f.division===sdDiv&&(!soft||!f.esCampeon));
    const n=soft?2:5;
    raw=shuffle(raw).slice(0,Math.min(n,raw.length));
    sd=shuffle(sd).slice(0,Math.min(n,sd.length));
    raw.forEach(f=>{f.marca='SMACKDOWN';f.division=sdDiv;changes.push(`${f.nombre} -> SMACKDOWN (${sdDiv})`);});
    sd.forEach(f=>{f.marca='RAW';f.division=rawDiv;changes.push(`${f.nombre} -> RAW (${rawDiv})`);});
  });
  db.lastDraftLog=changes;
  postUpdate();
}
const shuffle=(a)=>[...a].sort(()=>Math.random()-0.5);

function bindEvents(){
  document.getElementById('brand').onchange=updateDivisionOptions;
  document.getElementById('isTag').onchange=e=>document.getElementById('tagFields').classList.toggle('hidden',!e.target.checked);
  document.getElementById('wrestlerForm').onsubmit=e=>{
    e.preventDefault();
    const brand=brandEl.value, division=divisionEl.value;
    if(isTagEl.checked){
      const team=tagNameEl.value.trim(),a=tagAEl.value.trim(),b=tagBEl.value.trim();
      if(!team||!a||!b) return alert('Completa datos tag team.');
      if([a,b].some(n=>db.fighters.some(f=>f.division===division&&f.nombre.toLowerCase()===n.toLowerCase()))) return alert('Nombre duplicado en división.');
      db.fighters.push(baseFighter(a,brand,division,{esTagTeam:true,nombreTagTeam:team}),baseFighter(b,brand,division,{esTagTeam:true,nombreTagTeam:team}));
    } else {
      const name=nameEl.value.trim();
      if(db.fighters.some(f=>f.division===division&&f.nombre.toLowerCase()===name.toLowerCase())) return alert('Nombre duplicado en división.');
      db.fighters.push(baseFighter(name,brand,division));
    }
    e.target.reset(); updateDivisionOptions(); postUpdate();
  };
  document.getElementById('matchForm').onsubmit=registerMatch;
  document.getElementById('genRaw').onclick=()=>renderCardsOutput(generateWeekly('RAW'));
  document.getElementById('genSd').onclick=()=>renderCardsOutput(generateWeekly('SMACKDOWN'));
  document.getElementById('genPpv').onclick=()=>renderCardsOutput(generatePPV());
  document.getElementById('btnSoftDraft').onclick=()=>runDraft(true);
  document.getElementById('btnAnnualDraft').onclick=()=>runDraft(false);
}

function renderDraftLog(){
  document.getElementById('draftLog').innerHTML = db.lastDraftLog.length ? `<h4>Último draft</h4><ul>${db.lastDraftLog.map(c=>`<li>${c}</li>`).join('')}</ul>` : '<p class="small">Sin cambios de draft aún.</p>';
}

function postUpdate(){ recalcPositions(); save(); renderAll(); }
function renderAll(){ renderChampionsOverview(); renderAdmin(); renderRankings(); fillMatchSelectors(); renderGeneralList(); renderHistory(); renderDraftLog(); }

const nameEl=document.getElementById('name');
const brandEl=document.getElementById('brand');
const divisionEl=document.getElementById('division');
const isTagEl=document.getElementById('isTag');
const tagNameEl=document.getElementById('tagName');
const tagAEl=document.getElementById('tagA');
const tagBEl=document.getElementById('tagB');

renderTabs(); updateDivisionOptions(); bindEvents(); recalcPositions(); renderAll(); save();
