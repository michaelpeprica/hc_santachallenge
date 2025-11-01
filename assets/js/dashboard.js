// assets/js/dashboard.js
import { auth, db } from './firebase.js';
import {
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, orderBy, limit, updateDoc, deleteDoc, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- Role & povolené kategorie (shodné s původem) ---
const ROLE_LABELS = {
  manager: 'Vedoucí',
  operator_tel: 'Operátor – telefonie',
  operator_tel_kore: 'Operátor – půlení (tel + kore)',
  operator_kore: 'Operátor – korespondence'
};
const OPERATOR_ROLES = new Set(['operator_tel','operator_kore','operator_tel_kore']);
function allowedCategoriesFor(role){
  if(role==='operator_tel') return ['tel_weekly'];
  if(role==='operator_kore') return ['kore_static'];
  if(role==='operator_tel_kore') return ['tel_weekly','kore_static'];
  if(role==='manager') return ['tel_weekly','kore_static'];
  return [];
}
function includeActivityThisWeek(a, role){
  if(!a || !a.enabled) return false;
  if(!allowedCategoriesFor(role).includes(a.category)) return false;
  return true;
}
function escapeHtml(str){ return (str||'').replace(/[&<>\"']/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[s])); }
function renderWeekInfoText(raw){
  let txt = escapeHtml(raw || '');
  txt = txt.replace(new RegExp("\\*\\*(.*?)\\*\\*", "g"), '<b>$1</b>');
  txt = txt.replace(new RegExp("\\*(.*?)\\*", "g"), '<i>$1</i>');
  txt = txt.replace(new RegExp("__(.*?)__", "g"), '<u>$1</u>');
  const paras = txt.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
  return paras || '<p></p>';
}

// --- DOM prvky ---
const weekInfoTextView = document.getElementById('weekInfoTextView');
const weekInfoActivities = document.getElementById('weekInfoActivities');
const operatorSection = document.getElementById('operatorSection');
const leaderboardEl = document.getElementById('leaderboard');
const milestoneLegend = document.getElementById('milestoneLegend');
const targetOperator = document.getElementById('targetOperator');
const activitySelect = document.getElementById('activitySelect');
const customDelta = document.getElementById('customDelta');
const addPointsBtn = document.getElementById('addPointsBtn');
const roleInfo = document.getElementById('roleInfo');
const myRecent = document.getElementById('myRecent');
const milestonesModal = document.getElementById('milestonesModal');
const milestonesPublicList = document.getElementById('milestonesPublicList');
const closeMilestonesModal = document.getElementById('closeMilestonesModal');
const avatarModal = document.getElementById('avatarModal');
const avatarGrid = document.getElementById('avatarGrid');

document.getElementById('closeMilestonesModal')?.addEventListener('click', ()=> milestonesModal.classList.add('hidden'));

// --- Stav ---
let currentUser=null, currentRole=null, currentOperatorProfile=null;
let unsubscribeActs=null, unsubscribeMs=null, unsubscribeSettings=null;

onAuthStateChanged(auth, async (user)=>{
  currentUser = user;
  if(!user) return;

  // profil operators/{uid}
  const opRef = doc(db,'operators', user.uid);
  const opSnap = await getDoc(opRef);
  if(!opSnap.exists()){
    await setDoc(opRef, {
      uid: user.uid, email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      createdAt: serverTimestamp()
    });
    currentOperatorProfile = { uid:user.uid, email:user.email, displayName: user.displayName || user.email.split('@')[0] };
  } else {
    currentOperatorProfile = { id:opSnap.id, ...opSnap.data() };
  }

  // role
  const roleRef = doc(db,'roles', user.uid);
  const roleSnap = await getDoc(roleRef);
  currentRole = roleSnap.exists() ? roleSnap.data().role : null;
  roleInfo.innerHTML = currentRole ? `Vaše role: <b>${ROLE_LABELS[currentRole]||currentRole}</b>` : 'Čekáte na přiřazení role vedoucím.';
  const footerRole = document.getElementById('footerRole');
  if(footerRole) footerRole.textContent = currentRole ? `Role: ${ROLE_LABELS[currentRole] || currentRole}` : 'Role zatím nepřiřazena';

  // UI povolení
  if(currentRole){ addPointsBtn?.removeAttribute('disabled'); operatorSection?.removeAttribute('aria-hidden'); }
  if(currentRole==='manager'){ targetOperator?.classList.remove('hidden'); } else { targetOperator?.classList.add('hidden'); }

  await Promise.all([
    subscribeActivities(),
    subscribeMilestones(),
    refreshLeaderboard(),
    loadMyRecent(),
    subscribeWeekInfo(),
    populateTargetOperatorSelect()
  ]);
});

// --- Weekly info (settings/current_week_info) ---
async function subscribeWeekInfo(){
  const { onSnapshot, doc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const ref = doc(db,'settings','current_week_info');
  unsubscribeSettings = onSnapshot(ref, (snap)=>{
    const data = snap.exists()? snap.data(): { text:'' };
    weekInfoTextView.innerHTML = renderWeekInfoText(data.text||'');
  });
}

// --- Aktivity & „Tento týden“ ---
async function subscribeActivities(){
  const qActs = query(collection(db,'activities'), orderBy('name'));
  unsubscribeActs = onSnapshot(qActs, (snap)=>{
    activitySelect.innerHTML = '';
    weekInfoActivities.innerHTML = '';
    const allowed = allowedCategoriesFor(currentRole);
    const weeklyList = [];
    snap.forEach(d=>{
      const a = { id:d.id, ...d.data() };
      if(a.enabled && allowed.includes(a.category)){
        const opt = document.createElement('option');
        opt.value = a.id; opt.textContent = `${a.name} (+${a.points})`;
        activitySelect.appendChild(opt);
      }
      if(includeActivityThisWeek(a, currentRole)){ weeklyList.push(a); }
    });
    weeklyList.sort((x,y)=> x.category.localeCompare(y.category) || x.name.localeCompare(y.name));
    weeklyList.forEach(a=>{
      const meta = a.category==='tel_weekly' ? 'telefonní' : 'stálá';
      const card = document.createElement('div'); card.className='card';
      card.innerHTML = `
        <div class="row" style="justify-content:space-between; align-items:flex-start">
          <div>
            <div><b>${a.name}</b> <span class="muted">(${meta})</span></div>
            ${a.desc? `<div class="muted">${a.desc}</div>`:''}
          </div>
          <div><b>${a.points}</b> b.</div>
        </div>`;
      weekInfoActivities.appendChild(card);
    });
  });
}

// --- Milníky (vč. modálu) ---
async function subscribeMilestones(){
  const qMs = query(collection(db,'milestones'), orderBy('threshold'));
  unsubscribeMs = onSnapshot(qMs, (snap)=>{
    milestonesPublicList.innerHTML = '';
    const items = []; snap.forEach(d=>items.push({id:d.id, visible: d.data().visible!==false, reward: d.data().reward||'', ...d.data()}));
    const visibleItems = items.filter(i=> i.visible!==false);
    milestoneLegend.textContent = visibleItems.length ? `Hodnosti: ${visibleItems.map(i=>i.threshold+ ' – '+ i.label).join(' • ')}` : 'Hodnosti zatím nejsou nastavené';
    visibleItems.forEach(m=>{
      const c = document.createElement('div'); c.className='card';
      c.innerHTML = `<div class="row" style="justify-content:space-between"><div><b>${m.threshold}</b> bodů – ${m.label}${m.reward? ` <span class="pill" title="Výhra">${m.reward}</span>`:''}</div></div>`;
      milestonesPublicList.appendChild(c);
    });
  });
}

// --- Přidávání bodů + audit ---
addPointsBtn?.addEventListener('click', async()=>{
  if(!currentUser) return alert('Nejprve se přihlaste.');
  const actId = activitySelect.value; if(!actId) return alert('Vyberte aktivitu.');
  const aSnap = await getDoc(doc(db,'activities', actId));
  if(!aSnap.exists()) return alert('Aktivita neexistuje.');
  const a = aSnap.data();
  const custom = Number(customDelta.value);
  const delta = Number.isFinite(custom) && custom !== 0 ? custom : Number(a.points||0);
  if(!Number.isFinite(delta) || delta===0) return alert('Zadejte platný počet bodů.');

  const targetUid = currentRole==='manager' ? (targetOperator.value||'') : currentUser.uid;
  if(currentRole==='manager' && !targetUid) return alert('Vyberte operátora.');
  let targetProfile = null;
  try{ const tSnap = await getDoc(doc(db,'operators', targetUid)); targetProfile = tSnap.exists()? {id:tSnap.id, ...tSnap.data()} : null; }catch{}

  const logEntry = { uid: targetUid, activityId: actId, activityName: a.name||actId, category: a.category, delta, createdAt: serverTimestamp() };
  await addDoc(collection(db,'logs'), logEntry);

  const auditEntry = {
    actorUid: currentUser.uid, actorEmail: currentUser.email,
    actorName: currentOperatorProfile?.displayName || currentUser.displayName || currentUser.email,
    targetUid, targetEmail: targetProfile?.email || 'unknown', targetName: targetProfile?.displayName || targetProfile?.email || targetUid,
    activityId: actId, activityName: a.name||actId, category: a.category, delta,
    clientInfo: navigator.userAgent || 'unknown', createdAt: serverTimestamp()
  };
  await addDoc(collection(db,'audits'), auditEntry);

  customDelta.value='';
  await Promise.all([ loadMyRecent(), refreshLeaderboard() ]);
  if(currentRole==='manager'){ /* audit se zobrazuje v manageru */ }
});

// --- Výběr cílového operátora (pro manažery) ---
async function populateTargetOperatorSelect(){
  if(currentRole!=='manager'){ targetOperator.classList.add('hidden'); return; }
  const [opsSnap, rolesSnap] = await Promise.all([
    getDocs(query(collection(db,'operators'), orderBy('email'))),
    getDocs(collection(db,'roles'))
  ]);
  const roleMap = {}; rolesSnap.forEach(r=>{ const x=r.data(); roleMap[r.id]=x.role; });
  targetOperator.innerHTML = '';
  const first = document.createElement('option'); first.value=''; first.textContent='– Vyberte operátora –'; targetOperator.appendChild(first);
  opsSnap.forEach(d=>{
    const u = {id:d.id, ...d.data()};
    const role = roleMap[u.id];
    if(role==='manager') return;
    const opt = document.createElement('option'); opt.value = u.id; opt.textContent = `${u.email}${u.displayName? ' ('+u.displayName+')':''}`;
    targetOperator.appendChild(opt);
  });
  targetOperator.classList.remove('hidden');
}

// --- Leaderboard ---
async function refreshLeaderboard(){
  const [opsSnap, msSnap, rolesSnap, logsSnap] = await Promise.all([
    getDocs(collection(db,'operators')),
    getDocs(query(collection(db,'milestones'), orderBy('threshold'))),
    getDocs(collection(db,'roles')),
    getDocs(collection(db,'logs')),
  ]);
  const milestones = []; msSnap.forEach(d=> milestones.push(d.data()));
  const roleMap = {}; rolesSnap.forEach(r=>{ const x=r.data(); roleMap[r.id]=x.role; });

  const ops=[]; opsSnap.forEach(d=>{ const u={id:d.id, ...d.data()}; const role=roleMap[u.id]; if(OPERATOR_ROLES.has(role)) ops.push(u); });

  const sums={}; logsSnap.forEach(d=>{ const l=d.data(); sums[l.uid]=(sums[l.uid]||0)+Number(l.delta||0); });

  const items = ops.map(o=>({ uid:o.id, name:o.displayName||o.email||o.id, total:sums[o.id]||0, avatarUrl:o.avatarUrl||null, avatarColor:o.avatarColor||null }));
  items.sort((a,b)=> b.total - a.total);
  const maxTotal = Math.max(1, ...items.map(i=>i.total));
  const medals = ['🥇','🥈','🥉'];

  leaderboardEl.innerHTML = '';
  items.forEach((it,idx)=>{
    const card = document.createElement('div'); card.className='card';
    const achieved = milestones.filter(m=> it.total >= m.threshold && (m.visible!==false)).slice(-1)[0] || null;
    const achievedLabel = achieved ? achieved.label : null;
    const pct = Math.max(0, Math.min(100, Math.round((it.total/maxTotal)*100)));
    const nameHtml = `${it.name} ${achievedLabel? `<span class="pill" title="Dosažená hodnost">${achievedLabel}</span>`:''}`;

    card.innerHTML = `
      <div class="leaderboard-item">
        <div class="medal-big">${idx<3? medals[idx]: ''}</div>
        <div class="avatar" data-uid="${it.uid}">${it.avatarUrl? `<img src='${it.avatarUrl}' alt='avatar' onerror="this.closest('.avatar').textContent='${(it.name||'--').substring(0,2).toUpperCase()}';">` : (it.name||'--').substring(0,2).toUpperCase()}</div>
        <div>
          <div class="row" style="justify-content:space-between">
            <div><b>${nameHtml}</b></div>
            <div><b>${it.total}</b> b.</div>
          </div>
          <div class="progress" title="Postup vůči lídrovi">
            <div class="bar" style="width:${pct}%"></div>
          </div>
        </div>
        <div>#${idx+1}</div>
      </div>`;
    const av = card.querySelector('.avatar');
    if(!it.avatarUrl){
      const color = it.avatarColor || hashToColor(it.uid||Math.random().toString());
      av.style.background = `linear-gradient(135deg, ${color}, rgba(255,255,255,0.85))`;
    }
    leaderboardEl.appendChild(card);
  });
}

// --- Moje poslední logy ---
async function loadMyRecent(){
  if(!currentUser){ myRecent.innerHTML=''; return; }
  myRecent.innerHTML = '';
  try{
    const ql = query(collection(db,'logs'), where('uid','==', currentUser.uid), orderBy('createdAt','desc'), limit(10));
    const snap = await getDocs(ql);
    const arr=[]; snap.forEach(d=>arr.push({id:d.id, ...d.data()}));
    if(!arr.length){ myRecent.innerHTML = '<div class="muted">Zatím žádné záznamy.</div>'; return; }
    arr.forEach(l=>{
      const dt = l.createdAt?.seconds ? new Date(l.createdAt.seconds*1000) : new Date();
      const card = document.createElement('div'); card.className='card';
      const sign = (Number(l.delta)>=0? '+':'' )+ Number(l.delta);
      card.innerHTML = `<div class="row" style="justify-content:space-between"><div>${l.activityName||l.activityId}</div><div><b>${sign}</b> b. • <span class="muted">${dt.toLocaleString()}</span></div></div>`;
      myRecent.appendChild(card);
    });
  }catch(e){
    myRecent.innerHTML = '<div class="muted">Nepodařilo se načíst záznamy.</div>';
  }
}

// --- Avatar helpery (stejná logika) ---
function hashToColor(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h<<5)-h+str.charCodeAt(i); h|=0; } const hue=Math.abs(h)%360; return `hsl(${hue} 70% 60%)`; }

// --- Milestones toggle (tlačítko máš v headeru jako odkaz na dashboard; modál si otevři vlastní akcí) ---
document.addEventListener('keydown', (e)=>{ if(e.key==='m' && e.altKey){ milestonesModal.classList.toggle('hidden'); }});

// --- Avatar modal – grid výběru ---
async function buildAvatarGrid(){
  avatarGrid.innerHTML='';
  let base = '', count=10;
  try{
    const s = await getDoc(doc(db,'settings','avatars'));
    if(s.exists()){ base = s.data().base_url||''; count = Number(s.data().count)||10; }
  }catch{}
  const items = [];
  for(let i=1;i<=count;i++){
    const nn = String(i).padStart(2,'0');
    const url = base? `${base.replace(/\/$/,'')}/avatar_${nn}.png` : '';
    items.push({i, url});
  }
  items.forEach(it=>{
    const btn = document.createElement('button'); btn.className='btn ghost'; btn.style.padding='0'; btn.style.borderRadius='12px'; btn.title = `avatar_${String(it.i).padStart(2,'0')}.png`;
    btn.innerHTML = `<div style="width:80px; height:80px; overflow:hidden; border-radius:12px; background:rgba(255,255,255,.06); display:grid; place-items:center">
      ${it.url? `<img src="${it.url}" alt="avatar" style="width:100%; height:100%; object-fit:cover">` : 'N A'}
    </div>`;
    btn.addEventListener('click', async()=>{
      if(!currentUser) return alert('Nejprve se přihlaste.');
      try{
        await updateDoc(doc(db,'operators', currentUser.uid), { avatarUrl: it.url || null });
        avatarModal.classList.add('hidden');
        refreshLeaderboard();
      }catch(e){ alert('Uložení avatara selhalo: '+(e?.message||e)); }
    });
    avatarGrid.appendChild(btn);
  });
  const noneBtn = document.createElement('button'); noneBtn.className='btn small'; noneBtn.textContent='Žádný avatar (použít iniciály)';
  noneBtn.addEventListener('click', async()=>{
    try{ await updateDoc(doc(db,'operators', currentUser.uid), { avatarUrl: null }); avatarModal.classList.add('hidden'); refreshLeaderboard(); }
    catch(e){ alert('Uložení selhalo: '+(e?.message||e)); }
  });
  avatarGrid.appendChild(noneBtn);
}

// Otevření avatar modálu přes klávesu Alt+A (můžeš si udělat i tlačítko)
document.addEventListener('keydown', (e)=>{ if(e.altKey && (e.key==='a' || e.key==='A')){ buildAvatarGrid(); avatarModal.classList.remove('hidden'); }});
