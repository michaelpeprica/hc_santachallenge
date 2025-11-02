// assets/js/logs.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter,
  doc, getDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PAGE_SIZE = 20;
const OPERATOR_ROLES = new Set(['operator_tel','operator_kore','operator_tel_kore']);

// ↑ NOVÉ: popisky kategorií pro UI i CSV
const CATEGORY_LABELS = {
  tel_weekly : 'Telefonie – týdenní',
  kore_static: 'Korespondence – stálé'
};
function categoryLabel(cat){ return CATEGORY_LABELS[cat] || (cat || ''); }

const hintEl = document.getElementById('logsHint');
const fltCard = document.getElementById('filtersCard');
const fltOperator = document.getElementById('fltOperator');
const fltFrom = document.getElementById('fltFrom');
const fltTo = document.getElementById('fltTo');
const applyBtn = document.getElementById('applyFilters');
const clearBtn = document.getElementById('clearFilters');
const exportBtn = document.getElementById('exportCsv');

const tbody = document.getElementById('logsTbody');
const prevBtn = document.getElementById('prevPage');
const nextBtn = document.getElementById('nextPage');
const pageInfo = document.getElementById('pageInfo');
const thActions = document.getElementById('thActions');

let isManager = false;
let currentUser = null;
let page = 1;
let pageCursors = []; // pageCursors[n] = poslední dokument strany n (kurzor pro další)
let hasNext = false;  // indikace, zda existuje další strana za aktuální

function fmtDate(ts){
  const d = ts?.seconds ? new Date(ts.seconds*1000) : new Date();
  return d.toLocaleString();
}
function esc(s){ return (s||'').replace(/[&<>\"']/g, t=>({"&":"&amp;","<":"&lt;","&gt;":">","\"":"&quot;"}[t])); }

async function detectRole(uid){
  try{
    const r = await getDoc(doc(db,'roles', uid));
    return r.exists() && r.data().role === 'manager';
  }catch{ return false; }
}

async function loadOperatorsForFilter(){
  fltOperator.innerHTML = '';
  const first = document.createElement('option');
  first.value = ''; first.textContent = '— všichni —';
  fltOperator.appendChild(first);

  // načti role a operátory, filtruj jen role z OPERATOR_ROLES
  const [ops, roles] = await Promise.all([
    getDocs(query(collection(db,'operators'), orderBy('email'))),
    getDocs(collection(db,'roles'))
  ]);
  const roleMap = {};
  roles.forEach(r=> roleMap[r.id] = r.data().role);

  ops.forEach(d=>{
    const o = { id:d.id, ...d.data() };
    const role = roleMap[o.id];
    if(!OPERATOR_ROLES.has(role)) return; // skrytí vedoucích
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = `${o.email}${o.displayName? ' ('+o.displayName+')':''}`;
    fltOperator.appendChild(opt);
  });
}

function buildBaseQuery(){
  const col = collection(db,'logs');
  let qBase = query(col);

  // uživatelský filtr
  if(isManager){
    const uid = fltOperator.value || null;
    if(uid){ qBase = query(qBase, where('uid','==', uid)); }
  } else {
    if(currentUser){ qBase = query(qBase, where('uid','==', currentUser.uid)); }
  }

  // časové filtry
  const fromVal = fltFrom.value ? new Date(fltFrom.value + 'T00:00:00') : null;
  const toVal   = fltTo.value   ? new Date(fltTo.value   + 'T23:59:59') : null;
  if(fromVal){ qBase = query(qBase, where('createdAt','>=', fromVal)); }
  if(toVal){   qBase = query(qBase, where('createdAt','<=', toVal)); }

  // řazení
  qBase = query(qBase, orderBy('createdAt','desc'));
  return qBase;
}

/** Vrátí stránku dat s „+1“ pro zjištění existence další stránky */
async function fetchPage(direction /* 0:init, 1:next, -1:prev */){
  let base = buildBaseQuery();

  if(direction===0){
    page = 1;
    pageCursors = [];
  } else if(direction===1){
    const cur = pageCursors[page] || null;
    if(cur) base = query(base, startAfter(cur));
    page += 1;
  } else if(direction===-1){
    if(page > 1) page -= 1;
    const cur = pageCursors[page-1] || null;
    if(cur) base = query(base, startAfter(cur));
  }

  // stáhneme o 1 víc
  const snap = await getDocs(query(base, limit(PAGE_SIZE+1)));
  const docs = snap.docs;
  hasNext = docs.length > PAGE_SIZE;

  const slice = hasNext ? docs.slice(0, PAGE_SIZE) : docs.slice(0);
  // uložíme kurzor pro TUTO stránku (poslední zobrazený dokument)
  pageCursors[page] = slice[slice.length-1] || null;

  const items = slice.map(d => ({ id:d.id, ...d.data() }));
  return items;
}

async function ensureNames(items){
  // Upřednostníme jméno/e-mail přímo v logu; pokud chybí, pokusíme se doplnit z operators
  const need = new Set();
  items.forEach(l=>{
    if(!(l.userName || l.userEmail)){ if(l.uid) need.add(l.uid); }
  });
  if(!need.size) return;

  const opsSnap = await getDocs(collection(db,'operators'));
  const map = {};
  opsSnap.forEach(d=> map[d.id] = d.data());

  items.forEach(l=>{
    if(!(l.userName || l.userEmail) && l.uid && map[l.uid]){
      l.userName = map[l.uid].displayName || '';
      l.userEmail = map[l.uid].email || '';
    }
  });
}

function renderRows(items){
  tbody.innerHTML = '';
  if(!items.length){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Žádné záznamy.</td></tr>`;
    return;
  }
  items.forEach(l=>{
    const sign = Number(l.delta)>=0 ? '+' : '';
    const cls  = Number(l.delta)>=0 ? 'delta-plus' : 'delta-minus';

    const who   = esc(l.userName || l.userEmail || l.uid || '');
    const actor = esc(l.actorName || l.actorEmail || l.actorUid || '');
    const catLb = esc(categoryLabel(l.category)); // ← místo raw hodnoty

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${fmtDate(l.createdAt)}</td>
      <td>${who}</td>
      <td>${esc(l.activityName||l.activityId||'')}</td>
      <td>${catLb}</td>
      <td>${actor}</td>
      <td style="text-align:right" class="${cls}">${sign}${Number(l.delta||0)}</td>
      <td class="muted" style="text-align:right"></td>
    `;
    if(isManager){
      const del = document.createElement('button');
      del.className = 'btn small ghost';
      del.title = 'Smazat záznam';
      del.textContent = '🗑️';
      del.addEventListener('click', async()=>{
        if(confirm('Opravdu smazat tento záznam?')){
          await deleteDoc(doc(db,'logs', l.id));
          // po smazání načti znovu aktuální stránku
          renderPage(0);
        }
      });
      tr.lastElementChild.appendChild(del);
    }
    tbody.appendChild(tr);
  });
}

function updatePager(){
  prevBtn.disabled = (page<=1);
  nextBtn.disabled = !hasNext;  // jen pokud existuje další strana
  pageInfo.textContent = `Stránka ${page}`;
  thActions.style.display = isManager ? '' : 'none';
}

async function renderPage(direction){
  const items = await fetchPage(direction);
  await ensureNames(items);
  renderRows(items);
  updatePager();
}

/* ===== CSV export (se středníkem) ===== */
async function exportCsvAll(){
  let base = buildBaseQuery();
  let cursor = null;
  const rows = [['createdAt','uid','userName','userEmail','activityId','activityName','category','delta','actorUid','actorName','actorEmail']];

  while(true){
    const q2 = cursor ? query(base, startAfter(cursor), limit(PAGE_SIZE+1)) : query(base, limit(PAGE_SIZE+1));
    const snap = await getDocs(q2);
    if(!snap.size) break;
    const docs = snap.docs;
    const slice = docs.length > PAGE_SIZE ? docs.slice(0, PAGE_SIZE) : docs.slice(0);

    slice.forEach(d=>{
      const l = d.data();
      rows.push([
        l.createdAt?.seconds ? new Date(l.createdAt.seconds*1000).toISOString() : '',
        l.uid || '',
        l.userName || '',
        l.userEmail || '',
        l.activityId || '',
        l.activityName || '',
        categoryLabel(l.category), // ← exportujeme popisek
        String(l.delta ?? ''),
        l.actorUid || '',
        l.actorName || '',
        l.actorEmail || ''
      ]);
    });

    cursor = docs.length > PAGE_SIZE ? docs[PAGE_SIZE] : null;
    if(!cursor) break;
  }

  const csv = rows.map(r => r.map(x=>{
    const s = (x??'').toString();
    const needsQ = s.includes(';') || s.includes('"') || s.includes('\n');
    const escd = s.replace(/"/g,'""');
    return needsQ ? `"${escd}"` : escd;
  }).join(';')).join('\n');

  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'logs_export.csv';
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
}

/* ===== Události ===== */
function attachEvents(){
  nextBtn.addEventListener('click', ()=> renderPage(1));
  prevBtn.addEventListener('click', ()=> renderPage(-1));
  applyBtn.addEventListener('click', ()=> renderPage(0));
  clearBtn.addEventListener('click', ()=>{
    fltOperator.value = '';
    fltFrom.value = '';
    fltTo.value = '';
    renderPage(0);
  });
  exportBtn.addEventListener('click', ()=>{
    if(!isManager){ alert('Export je určen jen pro vedoucí.'); return; }
    exportCsvAll().catch(err=> alert('Export selhalo: ' + (err?.message||err)));
  });
}

onAuthStateChanged(auth, async (u)=>{
  currentUser = u || null;
  if(!u) return;

  isManager = await detectRole(u.uid);
  fltCard.setAttribute('aria-hidden', (!isManager).toString());
  fltCard.style.display = isManager ? '' : 'none';

  if(isManager){
    hintEl.textContent = 'Jako vedoucí vidíte historii všech operátorů. Můžete filtrovat, mazat záznamy a exportovat CSV.';
    await loadOperatorsForFilter();
  }else{
    hintEl.textContent = 'Zobrazuje se vaše osobní historie bodů.';
  }

  attachEvents();
  renderPage(0);
});
