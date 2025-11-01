// assets/js/manager.js
import { db } from './firebase.js';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, getDocs, query, where, orderBy, limit, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Tabs
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tabpanel');
tabs.forEach(t=>t.addEventListener('click', ()=>{
  tabs.forEach(x=>x.classList.remove('active')); t.classList.add('active');
  panels.forEach(p=>p.classList.add('hidden'));
  document.getElementById(t.dataset.tab).classList.remove('hidden');
}));

// Elements
const actName = document.getElementById('actName');
const actCategory = document.getElementById('actCategory');
const actPoints = document.getElementById('actPoints');
const actDesc = document.getElementById('actDesc');
const addActivity = document.getElementById('addActivity');
const activitiesList = document.getElementById('activitiesList');

const msThreshold = document.getElementById('msThreshold');
const msLabel = document.getElementById('msLabel');
const msReward = document.getElementById('msReward');
const msVisible = document.getElementById('msVisible');
const addMilestone = document.getElementById('addMilestone');
const milestonesList = document.getElementById('milestonesList');

const userSelect = document.getElementById('userSelect');
const roleSelect = document.getElementById('roleSelect');
const rolesList = document.getElementById('rolesList');
const displayNameInput = document.getElementById('displayNameInput');

const weeklyInfoManager = document.getElementById('weeklyInfoManager');
const saveWeekInfo = document.getElementById('saveWeekInfo');

const recomputeLeaderboard = document.getElementById('recomputeLeaderboard');
const refreshAudits = document.getElementById('refreshAudits');
const auditsList = document.getElementById('auditsList');

// === Activities ===
async function subscribeActivities(){
  const qActs = query(collection(db,'activities'), orderBy('name'));
  onSnapshot(qActs, (snap)=>{
    activitiesList.innerHTML = '';
    snap.forEach(d=>{
      const a = { id:d.id, ...d.data() };
      const row = document.createElement('div'); row.className='row';
      row.innerHTML = `
        <div class="card" style="flex:1; padding:10px; display:grid; grid-template-columns:1.2fr .6fr .8fr auto; gap:8px; align-items:center">
          <div><b>${a.name}</b><div class="muted">${a.category}${a.desc? ' • '+a.desc: ''}</div></div>
          <div>${a.points} bodů</div>
          <div>${a.enabled? 'Aktivní' : '<span class="muted">Skryto</span>'}</div>
          <div class="row">
            <button class="btn small ghost" data-toggle="${a.id}">Přepnout</button>
            <button class="btn small ghost" data-editdesc="${a.id}">Upravit popis</button>
            <button class="btn small ghost" data-del="${a.id}">Smazat</button>
          </div>
        </div>`;
      activitiesList.appendChild(row);
      row.querySelector('[data-toggle]')?.addEventListener('click', async()=>{ await updateDoc(doc(db,'activities', a.id), { enabled: !a.enabled }); });
      row.querySelector('[data-del]')?.addEventListener('click', async()=>{ if(confirm('Smazat aktivitu?')) await deleteDoc(doc(db,'activities', a.id)); });
      row.querySelector('[data-editdesc]')?.addEventListener('click', async()=>{
        const val = prompt('Nový krátký popis:', a.desc||'');
        if(val!==null){ await updateDoc(doc(db,'activities', a.id), { desc: val.trim() }); }
      });
    });
  });
}
addActivity?.addEventListener('click', async ()=>{
  if(!actName.value || !actPoints.value) return alert('Doplňte název a body.');
  await addDoc(collection(db,'activities'), {
    name: actName.value.trim(), category: actCategory.value,
    points: Number(actPoints.value), enabled: true,
    desc: (actDesc.value||'').trim(), createdAt: serverTimestamp()
  });
  actName.value=''; actPoints.value=''; actDesc.value='';
});

// === Milestones ===
async function subscribeMilestones(){
  const qMs = query(collection(db,'milestones'), orderBy('threshold'));
  onSnapshot(qMs, (snap)=>{
    milestonesList.innerHTML = '';
    const items = []; snap.forEach(d=>items.push({id:d.id, visible: d.data().visible!==false, reward: d.data().reward||'', ...d.data()}));
    items.forEach(m=>{
      const row = document.createElement('div'); row.className='card';
      row.innerHTML = `
        <div class="row" style="gap:8px; align-items:center; flex-wrap:wrap">
          <input class="input" data-ms-th="${m.id}" type="number" value="${m.threshold}" style="max-width:120px"/>
          <input class="input" data-ms-lb="${m.id}" value="${m.label||''}" style="flex:1; min-width:180px"/>
          <input class="input" data-ms-rw="${m.id}" value="${m.reward||''}" placeholder="Výhra" style="flex:1; min-width:180px"/>
          <label class="row" style="gap:6px"><input type="checkbox" data-ms-vs="${m.id}" ${m.visible!==false?'checked':''}/> Viditelné</label>
          <button class="btn small ghost" data-ms-save="${m.id}">Uložit</button>
          <button class="btn small ghost" data-del="${m.id}">Smazat</button>
        </div>`;
      milestonesList.appendChild(row);
      row.querySelector(`[data-del="${m.id}"]`)?.addEventListener('click', async()=>{ if(confirm('Smazat milník?')) await deleteDoc(doc(db,'milestones', m.id)); });
      row.querySelector(`[data-ms-save="${m.id}"]`)?.addEventListener('click', async()=>{
        const th = Number(row.querySelector(`[data-ms-th="${m.id}"]`).value);
        const lb = row.querySelector(`[data-ms-lb="${m.id}"]`).value.trim();
        const rw = row.querySelector(`[data-ms-rw="${m.id}"]`).value.trim();
        const vs = !!row.querySelector(`[data-ms-vs="${m.id}"]`).checked;
        if(!Number.isFinite(th)) return alert('Zadejte platný práh.');
        await updateDoc(doc(db,'milestones', m.id), { threshold: th, label: lb, reward: rw, visible: vs });
      });
    });
  });
}
addMilestone?.addEventListener('click', async()=>{
  if(!msThreshold.value || !msLabel.value) return alert('Doplňte hodnotu a popisek.');
  await addDoc(collection(db,'milestones'), {
    threshold: Number(msThreshold.value), label: msLabel.value.trim(),
    reward: (msReward.value||'').trim(), visible: !!msVisible.checked, createdAt: serverTimestamp()
  });
  msThreshold.value=''; msLabel.value=''; msReward.value=''; msVisible.checked=true;
});

// === Roles / Operators ===
async function buildUsersForManager(){
  const opsSnap = await getDocs(query(collection(db,'operators'), orderBy('email')));
  userSelect.innerHTML = ''; rolesList.innerHTML='';
  const opMap = {};
  opsSnap.forEach(d=>{
    const u = {id:d.id, ...d.data()}; opMap[u.id] = u;
    const opt = document.createElement('option'); opt.value = u.id; opt.textContent = `${u.email}${u.displayName? ' ('+u.displayName+')':''}`;
    userSelect.appendChild(opt);
  });
  userSelect.addEventListener('change', async()=>{
    const uid = userSelect.value; if(!uid){ displayNameInput.value=''; return; }
    const s = await getDoc(doc(db,'operators', uid));
    displayNameInput.value = s.exists()? (s.data().displayName||'') : '';
  });
  const roleDocs = await getDocs(collection(db,'roles'));
  roleDocs.forEach(d=>{
    const r = {id:d.id, ...d.data()};
    const email = opMap[r.id]?.email || r.id;
    const disp = opMap[r.id]?.displayName ? ` (${opMap[r.id].displayName})` : '';
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `<div class="row" style="justify-content:space-between">
      <div><b>${email}</b>${disp} → ${r.role}</div>
      <button class="btn small ghost" data-remove="${r.id}">Odebrat</button>
    </div>`;
    rolesList.appendChild(card);
    card.querySelector('[data-remove]')?.addEventListener('click', async()=>{
      if(confirm('Odebrat roli?')) await deleteDoc(doc(db,'roles', r.id));
      buildUsersForManager();
    });
  });
}
document.getElementById('assignRole')?.addEventListener('click', async()=>{
  const uid = userSelect.value; if(!uid) return alert('Vyberte uživatele.');
  const dn = (displayNameInput.value||'').trim();
  if(dn){ await updateDoc(doc(db,'operators', uid), { displayName: dn }); }
  await setDoc(doc(db,'roles', uid), { role: roleSelect.value, updatedAt: serverTimestamp() });
  alert('Uloženo.');
  buildUsersForManager();
});

// === Carousel (settings + titles/descriptions) ===
const carBaseUrl = document.getElementById('carBaseUrl');
const carCount = document.getElementById('carCount');
const carSaveCfg = document.getElementById('carSaveCfg');
const carSlidesForm = document.getElementById('carSlidesForm');

async function loadCarouselCfg(){
  const s = await getDoc(doc(db,'settings','carousel'));
  const base = s.exists() ? (s.data().base_url || '') : '';
  const count = s.exists() ? Number(s.data().count || 0) : 0;
  carBaseUrl.value = base;
  carCount.value = String(count||0);
  await renderCarouselSlides(count);
}

async function renderCarouselSlides(count){
  carSlidesForm.innerHTML = '';
  // načti existující metas
  const metas = {};
  const snap = await getDocs(query(collection(db,'carousel'), orderBy('__name__')));
  snap.forEach(d=>{ metas[d.id] = d.data(); });

  for(let i=1;i<=count;i++){
    const id = String(i); // dokument carousel/{i}
    const m = metas[id] || {};
    const row = document.createElement('div'); row.className='card';
    row.innerHTML = `
      <div class="row" style="gap:8px; align-items:flex-start; flex-wrap:wrap">
        <div style="width:60px">#${i}</div>
        <input class="input" data-car-title="${id}" placeholder="Titulek snímku" value="${m.title || ''}" style="flex:1; min-width:200px" />
        <input class="input" data-car-desc="${id}" placeholder="Popis snímku" value="${m.desc || ''}" style="flex:2; min-width:280px" />
        <button class="btn small ghost" data-car-save="${id}">Uložit</button>
        <button class="btn small ghost" data-car-clear="${id}">Vyčistit</button>
      </div>`;
    carSlidesForm.appendChild(row);

    row.querySelector(`[data-car-save="${id}"]`).addEventListener('click', async ()=>{
      const title = row.querySelector(`[data-car-title="${id}"]`).value.trim();
      const desc  = row.querySelector(`[data-car-desc="${id}"]`).value.trim();
      await setDoc(doc(db,'carousel', id), { title, desc }, { merge:true });
      alert(`Uloženo: snímek ${i}`);
    });
    row.querySelector(`[data-car-clear="${id}"]`).addEventListener('click', async ()=>{
      await setDoc(doc(db,'carousel', id), { title:'', desc:'' }, { merge:true });
      row.querySelector(`[data-car-title="${id}"]`).value = '';
      row.querySelector(`[data-car-desc="${id}"]`).value  = '';
    });
  }
}

carSaveCfg?.addEventListener('click', async ()=>{
  const base = carBaseUrl.value.trim().replace(/\/$/,'');
  const count = Math.max(0, parseInt(carCount.value||'0',10));
  await setDoc(doc(db,'settings','carousel'), { base_url: base, count }, { merge:true });
  await renderCarouselSlides(count);
  alert('Nastavení karuselu uloženo');
});

// === Weekly info ===
async function ensureSettingsDocExists(){
  const ref = doc(db,'settings','current_week_info');
  const s = await getDoc(ref);
  if(!s.exists()) await setDoc(ref, { text: '', createdAt: serverTimestamp() });
}
async function subscribeWeekInfo(){
  const ref = doc(db,'settings','current_week_info');
  onSnapshot(ref, (snap)=>{
    const data = snap.exists()? snap.data(): {text:''};
    weeklyInfoManager.value = data.text||'';
  });
}
saveWeekInfo?.addEventListener('click', async()=>{
  await setDoc(doc(db,'settings','current_week_info'), { text: weeklyInfoManager.value.trim(), updatedAt: serverTimestamp() });
  alert('Popis týdne uložen');
});

// === Audity ===
async function loadAudits(){
  try{
    auditsList.innerHTML = '<div class="muted">Načítám…</div>';
    let snap;
    try{
      snap = await getDocs(query(collection(db,'audits'), orderBy('createdAt','desc'), limit(100)));
      const arr=[]; snap.forEach(d=>arr.push({id:d.id, ...d.data()}));
      renderAudits(arr);
    }catch(e){
      const s2 = await getDocs(collection(db,'audits'));
      const arr=[]; s2.forEach(d=>arr.push({id:d.id, ...d.data()}));
      arr.sort((a,b)=> (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      renderAudits(arr);
    }
  }catch(err){
    auditsList.innerHTML = `<div class="muted">${err?.message||err}</div>`;
  }
}
function renderAudits(items){
  auditsList.innerHTML = '';
  if(!items.length){ auditsList.innerHTML = '<div class="muted">Žádné záznamy.</div>'; return; }
  items.forEach(a=>{
    const dt = a.createdAt?.seconds ? new Date(a.createdAt.seconds*1000) : new Date();
    const card = document.createElement('div'); card.className='card';
    const sign = (Number(a.delta)>=0? '+':'' )+ Number(a.delta);
    card.innerHTML = `
      <div class="row" style="justify-content:space-between; align-items:flex-start">
        <div>
          <div><b>${a.actorName||a.actorEmail}</b> <span class="muted">udělil/a</span> <b>${a.targetName||a.targetEmail}</b></div>
          <div class="muted">${dt.toLocaleString()} • ${a.activityName||a.activityId} • ${a.category}</div>
        </div>
        <div class="row">
          <div style="margin-right:8px"><b>${sign}</b> b.</div>
          <button class="btn small ghost" data-del-audit="${a.id}">Smazat</button>
        </div>
      </div>`;
    const delBtn = card.querySelector('[data-del-audit]');
    delBtn?.addEventListener('click', async()=>{
      if(confirm('Smazat tento auditní záznam?')){ await deleteDoc(doc(db,'audits', a.id)); delBtn.closest('.card')?.remove(); }
    });
    auditsList.appendChild(card);
  });
}
recomputeLeaderboard?.addEventListener('click', ()=> alert('Žebříček se načítá dynamicky na Dashboardu.'));
refreshAudits?.addEventListener('click', ()=> loadAudits());

// Init sequence pro stránku vedoucího
(async function init(){
  await ensureSettingsDocExists();
  subscribeWeekInfo();
  subscribeActivities();
  subscribeMilestones();
  await buildUsersForManager();
  await loadAudits();
  await loadCarouselCfg();   
})();
