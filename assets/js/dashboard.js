// assets/js/dashboard.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, orderBy, limit,
  updateDoc, deleteDoc, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* =========================
   Role, pomocné funkce, DOM
   ========================= */
const ROLE_LABELS = {
  manager: 'Vedoucí',
  operator_tel: 'Operátor – telefonie',
  operator_tel_kore: 'Operátor – půlení (tel + kore)',
  operator_kore: 'Operátor – korespondence'
};
const OPERATOR_ROLES = new Set(['operator_tel','operator_kore','operator_tel_kore','manager']);
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
const weekInfoTextView   = document.getElementById('weekInfoTextView');
const weekInfoActivities = document.getElementById('weekInfoActivities');
const operatorSection    = document.getElementById('operatorSection');
const leaderboardEl      = document.getElementById('leaderboard');
const milestoneLegend    = document.getElementById('milestoneLegend');
const targetOperator     = document.getElementById('targetOperator');
const activitySelect     = document.getElementById('activitySelect');
const customDelta        = document.getElementById('customDelta');
const addPointsBtn       = document.getElementById('addPointsBtn');
const roleInfo           = document.getElementById('roleInfo');
const myRecent           = document.getElementById('myRecent');
const milestonesModal    = document.getElementById('milestonesModal');
const milestonesPublicList = document.getElementById('milestonesPublicList');
const closeMilestonesModal = document.getElementById('closeMilestonesModal');
const avatarModal        = document.getElementById('avatarModal');
const avatarGrid         = document.getElementById('avatarGrid');

closeMilestonesModal?.addEventListener('click', ()=> milestonesModal.classList.add('hidden'));

/* =========
   Stav app
   ========= */
let currentUser=null, currentRole=null, currentOperatorProfile=null;
let unsubscribeActs=null, unsubscribeMs=null, unsubscribeSettings=null;

/* ===========================
   Avatar helpers (lokální)
   =========================== */
// stabilní hue z řetězce
function _hueFrom(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h*31 + str.charCodeAt(i))%360; } return h; }
// iniciály z displayName nebo e-mailu
function _initials(displayName, email){
  const n=(displayName||'').trim();
  if(n){
    const parts=n.split(/\s+/).filter(Boolean);
    const first=parts[0]?.[0]||'', last=(parts.length>1?parts[parts.length-1][0]:'');
    return (first+last||first).toUpperCase();
  }
  const id=email?.split('@')[0]||'';
  return ((email||'?')[0] + (id[1]||'')).toUpperCase();
}
// vytvoř DOM uzel pro avatar (IMG z ./assets/avatars nebo fallback iniciály+gradient)
function createAvatarEl(o, size='md'){
  const el=document.createElement('span');
  el.className=`avatar avatar-${size}`;
  if(o.avatar){
    const img=new Image(); img.alt='avatar'; img.loading='lazy';
    const exts=['png','jpg','jpeg','webp']; let i=0, done=false;
    function tryNext(){ if(i<exts.length){ img.src=`./assets/avatars/${o.avatar}.${exts[i++]}`; } else if(!done){ done=true; el.appendChild(_initialsEl(o)); } }
    img.addEventListener('error', tryNext);
    img.addEventListener('load', ()=>{ if(!done){ done=true; }});
    tryNext();
    el.appendChild(img);
    return el;
  }
  el.appendChild(_initialsEl(o));
  return el;
}
function _initialsEl(o){
  const span=document.createElement('span'); span.className='avatar-initials';
  const seed=o.uid||o.email||'x'; const h=_hueFrom(seed);
  span.style.background=`linear-gradient(135deg, hsl(${h} 70% 55%) 0%, hsl(${h} 70% 75%) 100%)`;
  span.textContent=_initials(o.displayName, o.email);
  return span;
}

/* ===========================
   Auth + bootstrap dat
   =========================== */
onAuthStateChanged(auth, async (user)=>{
  currentUser = user;
  if(!user) return;

  // operators/{uid} profil (minimální bootstrap)
  const opRef = doc(db,'operators', user.uid);
  const opSnap = await getDoc(opRef);
  if(!opSnap.exists()){
    await setDoc(opRef, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      createdAt: serverTimestamp(),
      avatar: null
    }, { merge:true });
    currentOperatorProfile = { uid:user.uid, email:user.email, displayName: user.displayName || user.email.split('@')[0], avatar:null };
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

/* ===========================
   Weekly info
   =========================== */
async function subscribeWeekInfo(){
  const ref = doc(db,'settings','current_week_info');
  unsubscribeSettings = onSnapshot(ref, (snap)=>{
    const data = snap.exists()? snap.data(): { text:'' };
    weekInfoTextView.innerHTML = renderWeekInfoText(data.text||'');
  });
}

/* ===========================
   Aktivity & „Tento týden“
   =========================== */
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
      const meta = a.category==='tel_weekly'
        ? `<span class="pill">Telefonie</span>`
        : `<span class="pill">Korespondence</span>`;
      const row = document.createElement('div'); row.className='row'; row.style.justifyContent='space-between';
      row.innerHTML = `<div><b>${escapeHtml(a.name)}</b> ${meta}</div><div class="muted">+${a.points} b.</div>`;
      weekInfoActivities.appendChild(row);
    });
  });
}

/* ===========================
   Milestones (veřejný přehled do modalu)
   =========================== */
async function subscribeMilestones(){
  const qMs = query(collection(db,'milestones'), orderBy('threshold'));
  unsubscribeMs = onSnapshot(qMs, (snap)=>{
    const list=[]; snap.forEach(d=> list.push({id:d.id, ...d.data()}));
    milestoneLegend.innerHTML = '';
    const frag = document.createDocumentFragment();
    list.forEach(m=>{
      const pill = document.createElement('span'); pill.className='pill';
      pill.textContent = `${m.threshold} • ${m.label||''}`;
      frag.appendChild(pill);
    });
    milestoneLegend.appendChild(frag);
    // modal – veřejný seznam
    if(milestonesPublicList){
      milestonesPublicList.innerHTML='';
      list.forEach(m=>{
        const li = document.createElement('div'); li.className='card';
        const text = (m.visible!==false)
          ? `<b>${m.threshold}</b> – ${escapeHtml(m.label||'')} ${m.reward? `<span class="muted">• ${escapeHtml(m.reward)}</span>`:''}`
          : `<b>???</b> – <i>Tajné</i>`;
        li.innerHTML = text;
        milestonesPublicList.appendChild(li);
      });
    }
  });
}
document.addEventListener('keydown', (e)=>{ if(e.key==='m' && e.altKey){ milestonesModal?.classList.toggle('hidden'); }});

/* ===========================
   Výběr cílového operátora (manager)
   =========================== */
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

/* ===========================
   Přidat/Odebrat body
   =========================== */
addPointsBtn?.addEventListener('click', async ()=>{
  if(!currentUser || !currentRole) return;
  const target = (currentRole==='manager' && targetOperator?.value) ? targetOperator.value : currentUser.uid;
  const actId = activitySelect?.value;
  const delta = Number(customDelta?.value || 0);
  if(!actId && !delta) return alert('Vyber aktivitu nebo zadej vlastní počet.');
  try{
    let name=''; let category='';
    if(actId){
      const a = await getDoc(doc(db,'activities',actId));
      if(a.exists()){
        const d=a.data(); name=d.name; category=d.category; 
      }
    }
    await addDoc(collection(db,'logs'), {
      uid: target,
      actorUid: currentUser.uid,
      actorEmail: currentUser.email,
      actorName: currentOperatorProfile?.displayName || currentUser.email,
      activityId: actId || null,
      activityName: name || null,
      category: category || (actId? 'other' : 'manual'),
      delta: delta || (name? 0 : 0),
      createdAt: serverTimestamp()
    });
    customDelta.value='';
    await Promise.all([ loadMyRecent(), refreshLeaderboard() ]);
  }catch(e){ alert('Uložení selhalo: '+(e?.message||e)); }
});

/* ===========================
   Leaderboard (se zapojeným avatarem)
   =========================== */
async function refreshLeaderboard(){
  const [opsSnap, msSnap, rolesSnap, logsSnap] = await Promise.all([
    getDocs(collection(db,'operators')),
    getDocs(query(collection(db,'milestones'), orderBy('threshold'))),
    getDocs(collection(db,'roles')),
    getDocs(collection(db,'logs')),
  ]);
  const milestones = []; msSnap.forEach(d=> milestones.push(d.data()));
  const roleMap = {}; rolesSnap.forEach(r=>{ const x=r.data(); roleMap[r.id]=x.role; });

  const ops=[]; opsSnap.forEach(d=>{
    const u={id:d.id, ...d.data()};
    const role=roleMap[u.id];
    if(OPERATOR_ROLES.has(role)) ops.push(u);
  });

  const sums={}; logsSnap.forEach(d=>{ const l=d.data(); sums[l.uid]=(sums[l.uid]||0)+Number(l.delta||0); });

  // avatar: čteme název z operators.avatar (např. "avatar_05")
  const items = ops.map(o=>({
    uid: o.id,
    email: o.email || '',
    name: o.displayName || o.email || o.id,
    displayName: o.displayName || '',
    total: sums[o.id] || 0,
    avatar: (o.avatar || '').trim() || null
  }));
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

    const row = document.createElement('div'); row.className='leaderboard-item';

    const medal = document.createElement('div'); medal.className='medal-big'; medal.textContent = (idx<3? medals[idx] : '');
    const left = document.createElement('div'); left.className='row'; left.style.gap='8px';
    const av = createAvatarEl({ uid:it.uid, email:it.email, displayName:it.displayName, avatar:it.avatar }, 'md');

    const info = document.createElement('div');
    info.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div><b>${nameHtml}</b></div>
        <div><b>${it.total}</b> b.</div>
      </div>
      <div class="progress" title="Postup vůči lídrovi"><div class="bar" style="width:${pct}%"></div></div>
    `;

    const pos = document.createElement('div'); pos.textContent = `#${idx+1}`;

    left.appendChild(av);
    row.appendChild(medal);
    row.appendChild(left);
    row.appendChild(info);
    row.appendChild(pos);

    card.appendChild(row);
    leaderboardEl.appendChild(card);
  });
}

/* ===========================
   Moje poslední logy
   =========================== */
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

/* ===========================
   Avatar modal – grid výběru
   (lokální ./assets/avatars, ukládá operators/{uid}.avatar)
   =========================== */
async function buildAvatarGrid(){
  avatarGrid.innerHTML='';
  const items = [];
  for(let i=1;i<=15;i++){
    const nn = String(i).padStart(2,'0');
    items.push({ name:`avatar_${nn}` });
  }
  const exts = ['png','jpg','jpeg','webp'];

  items.forEach(it=>{
    const btn = document.createElement('button'); btn.className='btn ghost';
    btn.style.padding='0'; btn.style.borderRadius='12px'; btn.title = it.name;

    const box = document.createElement('div');
    box.style.cssText = 'width:80px; height:80px; overflow:hidden; border-radius:12px; background:rgba(255,255,255,.06); display:grid; place-items:center';
    const img = new Image(); img.alt = it.name; img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover';
    let k=0; function next(){ if(k<exts.length){ img.src = `./assets/avatars/${it.name}.${exts[k++]}`; } }
    img.addEventListener('error', next); next();
    box.appendChild(img);
    btn.appendChild(box);

    btn.addEventListener('click', async()=>{
      if(!currentUser) return alert('Nejprve se přihlaste.');
      try{
        await updateDoc(doc(db,'operators', currentUser.uid), { avatar: it.name });
        avatarModal.classList.add('hidden');
        await refreshLeaderboard();
      }catch(e){ alert('Uložení avatara selhalo: '+(e?.message||e)); }
    });

    avatarGrid.appendChild(btn);
  });

  const noneBtn = document.createElement('button'); noneBtn.className='btn small'; noneBtn.textContent='Žádný avatar (použít iniciály)';
  noneBtn.addEventListener('click', async()=>{
    try{
      await updateDoc(doc(db,'operators', currentUser.uid), { avatar: null });
      avatarModal.classList.add('hidden');
      await refreshLeaderboard();
    }catch(e){ alert('Uložení selhalo: '+(e?.message||e)); }
  });
  avatarGrid.appendChild(noneBtn);
}
// otevření modalu (Alt+A) – případně máš i header tlačítko #avatarBtn v ui.js
document.addEventListener('keydown', (e)=>{ if(e.altKey && (e.key==='a' || e.key==='A')){ buildAvatarGrid(); avatarModal.classList.remove('hidden'); }});
document.getElementById('closeAvatarModal')?.addEventListener('click', ()=> avatarModal.classList.add('hidden'));
avatarModal?.addEventListener('click', (e)=>{ if(e.target===avatarModal) avatarModal.classList.add('hidden'); });
