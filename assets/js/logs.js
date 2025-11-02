// assets/js/logs.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, getDocs, query, where, orderBy, limit, startAfter, doc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PAGE_SIZE = 20;

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

let isManager = false;
let currentUser = null;
let page = 1;
let lastDocOfPage = []; // stack kurzorů na začátky stránek (pro návrat)
let currentFilters = { uid: null, from: null, to: null };

function fmtDate(ts){
  const d = ts?.seconds ? new Date(ts.seconds*1000) : new Date();
  return d.toLocaleString();
}
function esc(s){ return (s||'').replace(/[&<>\"']/g, t=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[t])); }

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

  const ops = await getDocs(query(collection(db,'operators'), orderBy('email')));
  ops.forEach(d=>{
    const o = { id:d.id, ...d.data() };
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = `${o.email}${o.displayName? ' ('+o.displayName+')':''}`;
    fltOperator.appendChild(opt);
  });
}

function buildQuery(){
  const col = collection(db,'logs');
  const filters = [];
  let qBase = query(col);

  // časové filtry
  const fromVal = fltFrom.value ? new Date(fltFrom.value + 'T00:00:00') : null;
  const toVal   = fltTo.value   ? new Date(fltTo.value   + 'T23:59:59') : null;

  // uživatelský filtr
  if(isManager){
    const uid = fltOperator.value || null;
    if(uid){ qBase = query(qBase, where('uid','==', uid)); filters.push('uid'); }
  } else {
    // běžný uživatel vidí jen sebe
    if(currentUser){ qBase = query(qBase, where('uid','==', currentUser.uid)); filters.push('uid'); }
  }

  // datové podmínky
  if(fromVal){ qBase = query(qBase, where('createdAt','>=', fromVal)); filters.push('from'); }
  if(toVal){   qBase = query(qBase, where('createdAt','<=', toVal));   filters.push('to'); }

  // řazení a limit
  qBase = query(qBase, orderBy('createdAt','desc'), limit(PAGE_SIZE));

  return { qBase, filters };
}

async function renderPage(direction /* 0:init, 1:next, -1:prev */){
  // kurzorování
  let q = null;
  const { qBase } = buildQuery();

  if(direction === 1){
    if(lastDocOfPage[page]){ q = query(qBase, startAfter(lastDocOfPage[page])); }
    else { q = qBase; }
    page++;
  } else if(direction === -1){
    if(page > 1){
      page -= 1;
    }
    const cursor = lastDocOfPage[page-1];
    q = cursor ? query(qBase, startAfter(cursor)) : qBase;
  } else {
    page = 1;
    lastDocOfPage = [];
    q = qBase;
  }

  const snap = await getDocs(q);
  const docsArr = [];
  snap.forEach(d=> docsArr.push({id:d.id, ...d.data()}));

  // Uložíme kurzor pro "následující" stránku
  const lastVisible = snap.docs[snap.docs.length-1] || null;
  lastDocOfPage[page] = lastVisible;

  tbody.innerHTML = '';
  if(!docsArr.length){
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Žádné záznamy.</td></tr>`;
  } else {
    docsArr.forEach(l=>{
      const sign = Number(l.delta)>=0 ? '+' : '';
      const cls  = Number(l.delta)>=0 ? 'delta-plus' : 'delta-minus';
      const who  = esc(l.userName || l.userEmail || l.uid || '');
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${fmtDate(l.createdAt)}</td>
        <td>${who}</td>
        <td>${esc(l.activityName||l.activityId||'')}</td>
        <td>${esc(l.category||'')}</td>
        <td style="text-align:right" class="${cls}">${sign}${Number(l.delta||0)}</td>
      `;
      tbody.appendChild(row);
    });
  }

  // Pager UI
  prevBtn.disabled = (page<=1);
  nextBtn.disabled = !lastVisible; // není další stránka
  pageInfo.textContent = `Stránka ${page}`;
}

async function exportCsvAll(){
  // postupně stáhneme vše podle aktuálních filtrů
  const { qBase } = buildQuery();

  let rows = [['createdAt','uid','userName','userEmail','activityId','activityName','category','delta']];
  let cursor = null;
  let keep = true;

  while(keep){
    const q = cursor ? query(qBase, startAfter(cursor)) : qBase;
    const snap = await getDocs(q);
    if(!snap.size){ break; }
    snap.forEach(d=>{
      const l = d.data();
      rows.push([
        l.createdAt?.seconds ? new Date(l.createdAt.seconds*1000).toISOString() : '',
        l.uid || '',
        l.userName || '',
        l.userEmail || '',
        l.activityId || '',
        l.activityName || '',
        l.category || '',
        String(l.delta ?? '')
      ]);
    });
    cursor = snap.docs[snap.docs.length-1] || null;
    keep = !!cursor;
  }

  // CSV se středníkem
  const csv = rows.map(r => r.map(x=>{
    const s = (x??'').toString();
    // escapování ; a uvozovek
    const needsQ = s.includes(';') || s.includes('"') || s.includes('\n');
    const esc = s.replace(/"/g,'""');
    return needsQ ? `"${esc}"` : esc;
  }).join(';')).join('\n');

  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'logs_export.csv';
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
}

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
    exportCsvAll().catch(err=> alert('Export selhal: ' + (err?.message||err)));
  });
}

onAuthStateChanged(auth, async (u)=>{
  currentUser = u || null;
  if(!u) return;

  isManager = await detectRole(u.uid);
  fltCard.setAttribute('aria-hidden', (!isManager).toString());
  fltCard.style.display = isManager ? '' : 'none';

  if(isManager){
    hintEl.textContent = 'Jako vedoucí vidíte historii všech operátorů. Můžete filtrovat a exportovat CSV.';
    await loadOperatorsForFilter();
  }else{
    hintEl.textContent = 'Zobrazuje se vaše osobní historie bodů.';
  }

  attachEvents();
  renderPage(0);
});
