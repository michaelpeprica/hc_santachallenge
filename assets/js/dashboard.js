// assets/js/dashboard.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc, setDoc, collection, addDoc, getDocs, query, where, orderBy, limit,
  updateDoc, deleteDoc, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ============ Role & kategorie ============ */
const ROLE_LABELS = {
  manager: 'Vedoucí',
  operator_tel: 'Operátor – telefonie',
  operator_tel_kore: 'Operátor – půlení (tel + kore)',
  operator_kore: 'Operátor – korespondence'
};
// Kdo se zobrazuje v žebříčku:
const OPERATOR_ROLES = new Set(['operator_tel','operator_kore','operator_tel_kore']);
// (pokud chceš mít v žebříčku i vedoucí, přidej 'manager')

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
  txt = txt.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  txt = txt.replace(/\*(.*?)\*/g, '<i>$1</i>');
  txt = txt.replace(/__(.*?)__/g, '<u>$1</u>');
  const paras = txt.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g,'<br>')}</p>`).join('');
  return paras || '<p></p>';
}

/* ============ DOM ============ */
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

/* ============ Stav ============ */
let currentUser=null, currentRole=null, currentOperatorProfile=null;
let unsubscribeActs=null, unsubscribeMs=null, unsubscribeSettings=null;
let unsubscribeOpsAvatars=null;

/* ============ Avatar helpers (lokální soubory + fallback iniciály) ============ */
function _hueFrom(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h*31 + str.charCodeAt(i))%360; } return h; }
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
function _initialsEl(o){
  const span=document.createElement('span'); span.className='avatar-initials';
  const seed=o.uid||o.email||'x'; const h=_hueFrom(seed);
  span.style.background=`linear-gradient(135deg, hsl(${h} 70% 55%) 0%, hsl(${h} 70% 75%) 100%)`;
  span.textContent=_initials(o.displayName, o.email);
  return span;
}
/** Vytvoří <span class="avatar"> s IMG (pokud je avatarName) nebo s iniciálami. */
function createAvatarEl(o, size='md'){
  const el=document.createElement('span');
  el.className=`avatar avatar-${size}`;
  if(o.avatar){
    const img=new Image(); img.alt='avatar'; img.loading='lazy';
    img.style.width='100%'; img.style.height='100%'; img.style.objectFit='cover';
    const exts=['png','jpg','jpeg','webp']; let i=0, done=false;
    const nonce = window.__avatarNonce ? `?v=${window.__avatarNonce}` : '';
    function tryNext(){
      if(i<exts.length){
        img.src = `./assets/avatars/${o.avatar}.${exts[i++]}${nonce}`;
      } else if(!done){
        done=true; el.appendChild(_initialsEl(o));
      }
    }
    img.addEventListener('error', tryNext);
    img.addEventListener('load', ()=>{ if(!done){ done=true; }});
    tryNext();
    el.appendChild(img);
    return el;
  }
  el.appendChild(_initialsEl(o));
  return el;
}

/* ============ Auth bootstrap ============ */
onAuthStateChanged(auth, async (user)=>{
  currentUser = user;
  if(!user) return;

  // operators/{uid}
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
    populateTargetOperatorSelect(),
  ]);

  // realtime — kdokoliv upraví operators (včetně avataru) → překresli
  subscribeOperatorsForAvatars();
});

/* ============ Realtime odběr operators (kvůli avatarům) ============ */
function subscribeOperatorsForAvatars(){
  try{
    const ref = collection(db,'operators');
    unsubscribeOpsAvatars?.();
    unsubscribeOpsAvatars = onSnapshot(ref, ()=> refreshLeaderboard());
  }catch(e){
    console.warn('[dashboard] subscribeOperatorsForAvatars:', e);
  }
}

/* ============ Weekly info ============ */
async function subscribeWeekInfo(){
  const ref = doc(db,'settings','current_week_info');
  unsubscribeSettings = onSnapshot(ref, (snap)=>{
    const data = snap.exists()? snap.data(): { text:'' };
    weekInfoTextView.innerHTML = renderWeekInfoText(data.text||'');
  });
}

/* ============ Aktivity / Tento týden ============ */
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
            <div><b>${escapeHtml(a.name)}</b> <span class="muted">(${meta})</span></div>
            ${a.desc? `<div class="muted">${escapeHtml(a.desc)}</div>`:''}
          </div>
          <div><b>${a.points}</b> b.</div>
        </div>`;
      weekInfoActivities.appendChild(card);
    });
  });
}

/* ============ Milníky (vč. modálu) ============ */
async function subscribeMilestones(){
  const qMs = query(collection(db,'milestones'), orderBy('threshold'));
  unsubscribeMs = onSnapshot(qMs, (snap)=>{
    milestonesPublicList.innerHTML = '';
    const items = []; snap.forEach(d=>items.push({id:d.id, visible: d.data().visible!==false, reward: d.data().reward||'', ...d.data()}));
    const visibleItems = items.filter(i=> i.visible!==false);
    milestoneLegend.textContent = visibleItems.length ? `Hodnosti: ${visibleItems.map(i=>i.threshold+ ' – '+ i.label).join(' • ')}` : 'Hodnosti zatím nejsou nastavené';
    visibleItems.forEach(m=>{
      const c = document.createElement('div'); c.className='card';
      c.innerHTML = `<div class="row" style="justify-content:space-between"><div><b>${m.threshold}</b> bodů – ${escapeHtml(m.label||'')}${m.reward? ` <span class="pill" title="Výhra">${escapeHtml(m.reward)}</span>`:''}</div></div>`;
      milestonesPublicList.appendChild(c);
    });
  });
}

/* ============ Přidávání bodů + audit ============ */
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
});

/* ============ Výběr cílového operátora (pro manažery) ============ */
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

/* ============ Leaderboard (s avatary z ./assets/avatars) ============ */
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

  // čteme NÁZEV avatara z operators.avatar (např. "avatar_05")
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
    const nameHtml = `${escapeHtml(it.name)} ${achievedLabel? `<span class="pill" title="Dosažená hodnost">${escapeHtml(achievedLabel)}</span>`:''}`;

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

/* ============ Moje poslední logy ============ */
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
      card.innerHTML = `<div class="row" style="justify-content:space-between"><div>${escapeHtml(l.activityName||l.activityId||'')}</div><div><b>${sign}</b> b. • <span class="muted">${dt.toLocaleString()}</span></div></div>`;
      myRecent.appendChild(card);
    });
  }catch(e){
    myRecent.innerHTML = '<div class="muted">Nepodařilo se načíst záznamy.</div>';
  }
}

/* ============ Milestones modal toggle ============ */
document.addEventListener('keydown', (e)=>{ if(e.key==='m' && e.altKey){ milestonesModal.classList.toggle('hidden'); }});

/* ============ Avatar modal – výběr z ./assets/avatars (avatar_01..avatar_15) ============ */
async function buildAvatarGrid(){
  avatarGrid.innerHTML='';
  const items = [];
  for(let i=1;i<=15;i++){
    const nn = String(i).padStart(2,'0');
    items.push({ name:`avatar_${nn}` });
  }
  const exts=['png','jpg','jpeg','webp'];

  items.forEach(it=>{
    const btn = document.createElement('button'); btn.className='btn ghost'; btn.style.padding='0'; btn.style.borderRadius='12px';
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
        await updateDoc(doc(db,'operators', currentUser.uid), { avatar: it.name }); // ukládáme NÁZEV
        // cache-busting + event pro okamžitý refresh
        window.__avatarNonce = Date.now();
        window.dispatchEvent(new CustomEvent('avatar-changed', { detail:{ uid:currentUser.uid, avatar:it.name }}));
        avatarModal.classList.add('hidden');
        refreshLeaderboard();
      }catch(e){ alert('Uložení avatara selhalo: '+(e?.message||e)); }
    });
    avatarGrid.appendChild(btn);
  });

  const noneBtn = document.createElement('button'); noneBtn.className='btn small'; noneBtn.textContent='Žádný avatar (použít iniciály)';
  noneBtn.addEventListener('click', async()=>{
    try{
      await updateDoc(doc(db,'operators', currentUser.uid), { avatar: null });
      window.__avatarNonce = Date.now();
      window.dispatchEvent(new CustomEvent('avatar-changed', { detail:{ uid:currentUser.uid, avatar:null }}));
      avatarModal.classList.add('hidden');
      refreshLeaderboard();
    }catch(e){ alert('Uložení selhalo: '+(e?.message||e)); }
  });
  avatarGrid.appendChild(noneBtn);
}

// otevření modálu (Alt+A) – můžeš mít i tlačítko v headeru, které zavolá buildAvatarGrid()+show
document.addEventListener('keydown', (e)=>{ if(e.altKey && (e.key==='a' || e.key==='A')){ buildAvatarGrid(); avatarModal.classList.remove('hidden'); }});
document.getElementById('closeAvatarModal')?.addEventListener('click', ()=> avatarModal.classList.add('hidden'));
avatarModal?.addEventListener('click', (e)=>{ if(e.target===avatarModal) avatarModal.classList.add('hidden'); });

// když přijde signál z headeru (pokud používáš picker i tam)
window.addEventListener('avatar-changed', ()=> refreshLeaderboard());
