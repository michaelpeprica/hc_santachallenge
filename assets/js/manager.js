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
const msImage = document.getElementById('msImage');
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
    const items = [];
    snap.forEach(d=>{
      const x = d.data();
      items.push({
        id: d.id,
        threshold: Number(x.threshold||0),
        label: x.label || '',
        reward: x.reward || '',
        visible: x.visible !== false,
        image: (x.image || '').trim() || ''
      });
    });

    items.forEach(m=>{
      const row = document.createElement('div'); row.className='card';
      row.innerHTML = `
        <div class="row" style="gap:8px; align-items:flex-start; flex-wrap:wrap">
          <input class="input" data-ms-th="${m.id}" type="number" value="${m.threshold}" style="max-width:120px"/>
          <input class="input" data-ms-lb="${m.id}" value="${escapeHtml(m.label)}" style="flex:1; min-width:180px"/>
          <input class="input" data-ms-rw="${m.id}" value="${escapeHtml(m.reward)}" placeholder="Výhra" style="flex:1; min-width:180px"/>
          <input class="input" data-ms-img="${m.id}" value="${escapeHtml(m.image)}" placeholder="Obrázek (např. rank_01)" style="flex:1; min-width:180px"/>
          <label class="row" style="gap:6px"><input type="checkbox" data-ms-vs="${m.id}" ${m.visible?'checked':''}/> Viditelné</label>
          <button class="btn small ghost" data-ms-save="${m.id}">Uložit</button>
          <button class="btn small ghost" data-del="${m.id}">Smazat</button>
        </div>`;
      milestonesList.appendChild(row);

      row.querySelector(`[data-del="${m.id}"]`)?.addEventListener('click', async()=>{
        if(confirm('Smazat milník?')) await deleteDoc(doc(db,'milestones', m.id));
      });

      row.querySelector(`[data-ms-save="${m.id}"]`)?.addEventListener('click', async()=>{
        const th = Number(row.querySelector(`[data-ms-th="${m.id}"]`).value);
        const lb = row.querySelector(`[data-ms-lb="${m.id}"]`).value.trim();
        const rw = row.querySelector(`[data-ms-rw="${m.id}"]`).value.trim();
        const im = row.querySelector(`[data-ms-img="${m.id}"]`).value.trim();
        const vs = !!row.querySelector(`[data-ms-vs="${m.id}"]`).checked;
        if(!Number.isFinite(th)) return alert('Zadejte platný práh.');
        await updateDoc(doc(db,'milestones', m.id), { threshold: th, label: lb, reward: rw, visible: vs, image: im });
        alert('Uloženo.');
      });
    });
  });
}
addMilestone?.addEventListener('click', async()=>{
  if(!msThreshold.value || !msLabel.value) return alert('Doplňte hodnotu a popisek.');
  await addDoc(collection(db,'milestones'), {
    threshold: Number(msThreshold.value),
    label: msLabel.value.trim(),
    reward: (msReward.value||'').trim(),
    visible: !!msVisible.checked,
    image: (msImage.value||'').trim(),
    createdAt: serverTimestamp()
  });
  msThreshold.value=''; msLabel.value=''; msReward.value=''; msImage.value=''; msVisible.checked=true;
});

// malá pomocná
function escapeHtml(str){ return (str||'').replace(/[&<>\"']/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[s])); }

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

/* ===========================
   === Karusel – nastavení + editor snímků (Markdown + emoji + viditelnost) ===
   =========================== */
const carBaseUrl = document.getElementById('carBaseUrl');
const carCount   = document.getElementById('carCount');
const carSaveCfg = document.getElementById('carSaveCfg');
const carSlidesForm = document.getElementById('carSlidesForm');

/* Markdown → HTML (bezpečný, základní) */
function mdToHtml(md){
  if(!md) return '';
  let html = md.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  html = html
    .replace(/\*\*(.*?)\*\*/g,"<b>$1</b>")
    .replace(/\*(.*?)\*/g,"<i>$1</i>")
    .replace(/__(.*?)__/g,"<u>$1</u>")
    .replace(/`([^`]+)`/g,"<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html
    .replace(/^> (.*)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^- (.*)$/gm,'<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/gs,'<ul>$1</ul>');
  html = html.replace(/\n{2,}/g,'</p><p>').replace(/\n/g,'<br>');
  return `<p>${html}</p>`;
}

/* Načtení a zobrazení nastavení karuselu */
async function loadCarouselSettings(){
  const sRef = doc(db,'settings','carousel');
  const s = await getDoc(sRef);
  const base_url = s.exists()? (s.data().base_url||'').replace(/\/$/,'') : '';
  const count = s.exists()? Number(s.data().count||0) : 0;
  carBaseUrl.value = base_url;
  carCount.value = String(count||0);
  await buildSlidesEditor(count);
}

/* Uložení nastavení (base_url, count) */
carSaveCfg?.addEventListener('click', async()=>{
  const base = (carBaseUrl.value||'').trim().replace(/\/$/,'');
  const count = Math.max(0, Number(carCount.value||0)|0);
  if(!base){ return alert('Zadejte base_url.'); }
  try{
    await setDoc(doc(db,'settings','carousel'), { base_url: base, count }, { merge:true });
    await buildSlidesEditor(count);
    alert('Nastavení uloženo.');
  }catch(e){ alert('Uložení nastavení selhalo: '+(e?.message||e)); }
});

/* Postaví formulář editoru pro N snímků a načte metadata z kolekce carousel */
async function buildSlidesEditor(count){
  carSlidesForm.innerHTML = '';
  if(!count || count<1){
    const note = document.createElement('div'); note.className='muted';
    note.textContent = 'Zadejte a uložte počet snímků (count) a base_url. Poté se objeví formuláře pro popisky.';
    carSlidesForm.appendChild(note);
    return;
  }

  // načti existující docs carousel, abychom předvyplnili
  const meta = Array.from({length: count}, (_,i)=>({ title:`Snímek ${i+1}`, desc:'', visible:true }));
  try{
    const snap = await getDocs(query(collection(db,'carousel'), orderBy('__name__')));
    snap.forEach(d=>{
      const m = d.id.match(/\d+/); if(!m) return;
      const idx=(parseInt(m[0],10)||0)-1;
      if(idx>=0 && idx<meta.length){
        const x = d.data();
        meta[idx].title   = x.title || meta[idx].title;
        meta[idx].desc    = x.desc  || meta[idx].desc;
        meta[idx].visible = (x.visible !== false); // default = true
      }
    });
  }catch(e){
    console.warn('[manager] Nelze načíst carousel meta:', e);
  }

  // vygeneruj N editorů
  meta.forEach((m, i)=>{
    const id = i+1; // 1..N
    const card = document.createElement('div'); card.className='card';
    card.innerHTML = `
      <div class="stack">
        <div class="row" style="justify-content:space-between; align-items:center">
          <div><b>P${id}</b> – metadata</div>
          <button class="btn small" data-save="${id}">Uložit</button>
        </div>
        <input class="input" data-title="${id}" placeholder="Titulek snímku" value="${(m.title||'').replace(/"/g,'&quot;')}" />
        <div class="row" style="gap:8px; align-items:flex-start; flex-wrap:wrap">
          <textarea class="input" data-desc="${id}" rows="5" style="min-width:280px; flex:1" placeholder="Popis v Markdownu (emoji fungují)">${m.desc||''}</textarea>
          <div class="md-preview" data-preview="${id}">${mdToHtml(m.desc||'')}</div>
        </div>
        <label class="row" style="gap:6px">
          <input type="checkbox" data-visible="${id}" ${m.visible?'checked':''} />
          Zobrazit snímek
        </label>
        <div class="md-help">
          Markdown: <code>**tučně**</code>, <code>*kurzíva*</code>, <code>__podtržení__</code>, <code>\`kód\`</code>, <code>- položka</code>, <code>> citace</code>, <code>[odkaz](https://...)</code><br>
          Enter = nový řádek, 2× Enter = odstavec. Emoji vkládej přímo (např. 🎄✨).
        </div>
      </div>
    `;
    carSlidesForm.appendChild(card);

    const descEl = card.querySelector(`[data-desc="${id}"]`);
    const prevEl = card.querySelector(`[data-preview="${id}"]`);
    const titleEl = card.querySelector(`[data-title="${id}"]`);
    const visEl  = card.querySelector(`[data-visible="${id}"]`);

    // živý náhled na změnu
    descEl.addEventListener('input', ()=> prevEl.innerHTML = mdToHtml(descEl.value||''));

    // uložení jednoho snímku
    card.querySelector(`[data-save="${id}"]`)?.addEventListener('click', async()=>{
      try{
        await setDoc(doc(db,'carousel', String(id)), {
          title: (titleEl.value||'').trim(),
          desc:  (descEl.value||'').trim(),
          visible: !!visEl.checked
        }, { merge:true });
        alert(`P${id}: Uloženo.`);
      }catch(e){
        alert(`P${id}: Uložení selhalo: `+(e?.message||e));
      }
    });
  });
}

// spustit při vstupu na panel „Karusel“
document.querySelector('[data-tab="cfg-carousel"]')?.addEventListener('click', ()=>{
  loadCarouselSettings().catch(e=>console.error(e));
});

// pro případ prvního načtení (když je tab aktivní z URL)
if(!document.getElementById('cfg-carousel')?.classList.contains('hidden')){
  loadCarouselSettings().catch(()=>{});
}

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
  // (volitelně) načti rovnou základ karuselu
  // await loadCarouselSettings();
})();
