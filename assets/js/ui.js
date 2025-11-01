// assets/js/ui.js
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { db } from './firebase.js';
import { doc, getDoc, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export function initTheme(){
  const t = localStorage.getItem('xx_theme') || 'dark';
  applyTheme(t);
}
function applyTheme(t){
  document.body.setAttribute('data-theme', t);
  localStorage.setItem('xx_theme', t);
}

function renderHeader(){
  const header = document.createElement('header');
  header.innerHTML = `
    <div class="brand">
      <img src="./assets/hc_logo.png" alt="Home Credit" class="logo" id="hcLogo" />
      <h1>Vánoční výzva 2025</h1>
    </div>
    <nav>
      <a class="btn small" href="./dashboard.html" title="Přehled">📊 Přehled</a>
      <a class="btn small" href="./ranks.html" title="Hodnosti">🏆 Hodnosti</a>
      <a class="btn small" href="./map.html" title="Mapa">🗺️ Mapa</a>
      <a class="btn small" href="./manager.html" title="Nastavení">🛠️ Vedoucí</a>
      <button class="btn small" id="avatarBtn" title="Změnit avatar">🧑‍🎄 Avatar</button>
      <button class="btn small" id="themeToggle" title="Přepnout téma">🌓 Téma</button>
      <span id="accountInfo" class="account">
        <span id="accountAvatar"></span>
        <span id="accountEmail"></span>
      </span>
      <button class="btn small ghost" id="signOutBtn" title="Odhlásit">Odhlásit</button>
    </nav>
  `;
  document.body.prepend(header);

  // aktivní stránka
  const path = location.pathname.split('/').pop() || 'index.html';
  for(const a of header.querySelectorAll('a.btn')) {
    if (a.getAttribute('href') === `./${path}`) a.classList.add('active');
  }

  document.getElementById('themeToggle')?.addEventListener('click', ()=>{
    const next = document.body.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('xx_theme', next);
  });
  document.getElementById('signOutBtn')?.addEventListener('click', ()=> signOut(auth));
  document.getElementById('avatarBtn')?.addEventListener('click', ()=> openAvatarPicker());
}
// --- Avatar: generování barvy podle UID/emailu ---
function hueFromString(s){
  let h=0; for(let i=0;i<s.length;i++){ h = (h*31 + s.charCodeAt(i)) % 360; }
  return h;
}
function initialsFrom(displayName, email){
  const name = (displayName||'').trim();
  if(name){
    const parts = name.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || '';
    const last  = parts.length>1 ? parts[parts.length-1][0] : '';
    return (first+last || first).toUpperCase();
  }
  return ((email||'?')[0] + (email?.split('@')[0]?.[1] || '')).toUpperCase();
}

// vytvoří DOM pro avatar (img nebo iniciály s gradientem)
export function createAvatarNode(profile, size='sm'){
  const el = document.createElement('span');
  el.className = `avatar avatar-${size}`;

  const wanted = profile?.avatar || null;   // např. "avatar_05"
  if(wanted){
    const img = new Image();
    img.alt = 'avatar';
    img.loading = 'lazy';
    // zkus přípony; první která existuje, se načte
    const exts = ['png','jpg','jpeg','webp'];
    let idx = 0, done=false;
    function next(){
      if(idx < exts.length){
        img.src = `./assets/avatars/${wanted}.${exts[idx++]}`;
      } else if(!done){
        done=true; el.appendChild(buildInitials(profile));
      }
    }
    img.addEventListener('error', next);
    img.addEventListener('load', ()=>{ if(!done){ done=true; }});
    next();
    el.appendChild(img);
    return el;
  }
  el.appendChild(buildInitials(profile));
  return el;
}
function buildInitials(profile){
  const span = document.createElement('span');
  span.className='avatar-initials';
  const seed = (profile?.uid || profile?.email || 'x');
  const h = hueFromString(seed);
  span.style.background = `linear-gradient(180deg, hsl(${h} 70% 55%) 0%, hsl(${h} 70% 75%) 100%)`;
  span.textContent = initialsFrom(profile?.displayName, profile?.email);
  return span;
}

// načti profil operátora (displayName, avatar) z Firestore
export async function getOperatorProfile(uid, email){
  try{
    const ref = doc(db,'operators', uid);
    const snap = await getDoc(ref);
    if(snap.exists()){
      return { uid, email, ...snap.data() };
    } else {
      // minimálně vrať e-mail, ať jsou iniciály
      return { uid, email, displayName:'', avatar:null };
    }
  }catch(e){
    console.warn('[ui] Nelze načíst operators/', uid, e);
    return { uid, email, displayName:'', avatar:null };
  }
}

// vykresli avatar a e-mail v headeru
async function renderAccountArea(user){
  const avatarSlot = document.getElementById('accountAvatar');
  const emailSlot  = document.getElementById('accountEmail');
  if(!avatarSlot || !emailSlot) return;

  const prof = await getOperatorProfile(user.uid, user.email);
  avatarSlot.innerHTML = '';
  avatarSlot.appendChild(createAvatarNode({ uid:user.uid, email:user.email, displayName:prof.displayName, avatar:prof.avatar }, 'sm'));
  emailSlot.textContent = user.email || '';
}

// otevře modal pro výběr avataru a uloží do operators/{uid}.avatar
async function openAvatarPicker(){
  const u = auth.currentUser;
  if(!u){ alert('Nejprve se přihlas.'); return; }

  // načti stávající profil
  const prof = await getOperatorProfile(u.uid, u.email);
  const current = prof.avatar || null;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h3 style="margin:0 0 8px 0">Vyber si avatar</h3>
      <div class="grid" id="avatarsGrid"></div>
      <div class="actions">
        <button class="btn ghost" id="clearAvatar">Použít iniciály</button>
        <button class="btn" id="saveAvatar">Uložit</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // naplň grid 15 obrázky
  const grid = overlay.querySelector('#avatarsGrid');
  const exts = ['png','jpg','jpeg','webp'];
  let selected = current;   // "avatar_05" apod.

  for(let i=1;i<=15;i++){
    const name = `avatar_${String(i).padStart(2,'0')}`;
    const cell = document.createElement('div'); cell.className='cell';

    const thumb = document.createElement('div'); thumb.className='thumb';
    if(selected === name) thumb.classList.add('selected');

    // načti první existující příponu
    const img = new Image(); let k=0, ok=false;
    function next(){
      if(k<exts.length){ img.src = `./assets/avatars/${name}.${exts[k++]}`; }
    }
    img.addEventListener('error', ()=> next());
    img.addEventListener('load', ()=> ok=true);
    next();

    thumb.appendChild(img);
    cell.appendChild(thumb);
    cell.appendChild(Object.assign(document.createElement('div'), {textContent:name}));

    thumb.addEventListener('click', ()=>{
      selected = name;
      grid.querySelectorAll('.thumb').forEach(t=>t.classList.remove('selected'));
      thumb.classList.add('selected');
    });

    grid.appendChild(cell);
  }

  // ovladače
  overlay.addEventListener('click', (e)=>{ if(e.target === overlay) overlay.remove(); });
  overlay.querySelector('#clearAvatar')?.addEventListener('click', ()=>{
    selected = null;
    grid.querySelectorAll('.thumb').forEach(t=>t.classList.remove('selected'));
  });
  overlay.querySelector('#saveAvatar')?.addEventListener('click', async ()=>{
    try{
      const ref = doc(db,'operators', u.uid);
      if(selected){
        await setDoc(ref, { avatar: selected }, { merge:true });
      }else{
        await setDoc(ref, { avatar: null }, { merge:true });
      }
      await renderAccountArea(u);
      overlay.remove();
      alert('Avatar uložen.');
    }catch(err){
      console.error('[ui] Ukládání avataru selhalo:', err);
      alert('Nepodařilo se uložit avatar.');
    }
  });
}

// kdykoli se přihlášený uživatel změní, vykresli avatar v headeru
onAuthStateChanged(auth, (u)=>{
  const info = document.getElementById('accountInfo');
  if(!info) return;
  if(u){
    renderAccountArea(u);
  }else{
    const avatarSlot = document.getElementById('accountAvatar');
    const emailSlot  = document.getElementById('accountEmail');
    if(avatarSlot) avatarSlot.innerHTML = '';
    if(emailSlot)  emailSlot.textContent = 'Nepřihlášen';
  }
});
function renderFooter(){
  const f = document.createElement('footer');
  f.className = 'footer';
  f.innerHTML = `© 2025 Home Credit • Vánoční výzva • <span id="footerRole">Načítám…</span>`;
  document.body.appendChild(f);
}

export function initChrome(){
  renderHeader();
  renderFooter();
  initSnow();
  initBg();
  onAuthStateChanged(auth, (u)=>{
    const info = document.getElementById('accountInfo');
    info.innerHTML = u
      ? `<span class="miniavatar">${(u.email||'?')[0].toUpperCase()}</span> ${u.email}`
      : 'Nepřihlášen';
  });
}

// --- BG + sníh (zkráceno) ---
function initBg(){
  // Vytvoříme kontejner a vložíme inline SVG, které dědí CSS proměnné
  const bg = document.createElement('div');
  bg.className = 'bg-illustration';
  bg.setAttribute('aria-hidden','true');
  bg.innerHTML = `
  <svg viewBox="0 0 1440 900" preserveAspectRatio="none" width="100%" height="100%">
    <rect width="1440" height="900" fill="var(--bg-sky)"/>
    <!-- vzdálený kopec -->
    <path d="M0,620 C200,560 360,600 540,580 C720,560 920,600 1440,560 L1440,900 L0,900 Z"
          fill="var(--bg-hill2)" />
    <!-- blízký kopec -->
    <path d="M0,680 C220,640 420,700 640,680 C900,650 1120,720 1440,700 L1440,900 L0,900 Z"
          fill="var(--bg-hill)" />
    <!-- sněhulák -->
    <g transform="translate(1220, 610)">
      <circle cx="0" cy="0" r="36" fill="#fff"/>
      <circle cx="0" cy="58" r="52" fill="#fff"/>
      <!-- oči -->
      <circle cx="-10" cy="-6" r="3" fill="#222"/>
      <circle cx="10" cy="-6" r="3" fill="#222"/>
      <!-- nos -->
      <polygon points="0,-2 22,2 0,6" fill="orange"/>
      <!-- knoflíky -->
      <circle cx="0" cy="40" r="4" fill="var(--bg-accent)"/>
      <circle cx="0" cy="56" r="4" fill="var(--bg-accent)"/>
      <circle cx="0" cy="72" r="4" fill="var(--bg-accent)"/>
      <!-- ruce -->
      <path d="M-30,40 L-62,20 M-62,20 L-75,12 M-62,20 L-76,28" stroke="var(--bg-accent)" stroke-width="4" stroke-linecap="round"/>
      <path d="M30,40 L62,18 M62,18 L74,10 M62,18 L76,26" stroke="var(--bg-accent)" stroke-width="4" stroke-linecap="round"/>
      <!-- čepice -->
      <rect x="-20" y="-30" width="40" height="8" fill="#222"/>
      <rect x="-10" y="-52" width="20" height="22" fill="#222"/>
    </g>
  </svg>`;
  document.body.appendChild(bg);
}

function initSnow(){
  const canvas = document.createElement('canvas');
  canvas.id = 'snow';
  document.body.appendChild(canvas);
  const cx = canvas.getContext('2d');

  const resize = ()=>{ canvas.width = innerWidth; canvas.height = innerHeight; };
  addEventListener('resize', resize); resize();

  // vločky
  const flakes = Array.from({length: 140}, ()=>({
    x: Math.random()*canvas.width,
    y: Math.random()*canvas.height,
    r: Math.random()*2 + 1.2,
    s: Math.random()*0.7 + 0.25,   // speed
    w: Math.random()*1.4 + 0.3     // sway
  }));

  function snowColor(){
    // čteme aktuální barvu ze CSS proměnné (mění se s tématem)
    const c = getComputedStyle(document.body).getPropertyValue('--snow-color').trim();
    return c || 'rgba(255,255,255,0.95)';
  }

  (function tick(){
    cx.clearRect(0,0,canvas.width,canvas.height);
    cx.globalAlpha = 1;
    cx.fillStyle = snowColor();            // << barva sněhu z tématu
    // lehké prosvětlení na světlém pozadí zajistí samotná barva (není čistě bílá)
    flakes.forEach(f=>{
      cx.beginPath();
      cx.arc(f.x, f.y, f.r, 0, Math.PI*2);
      cx.fill();
      f.y += f.s; f.x += Math.sin(f.y*0.01)*f.w;
      if(f.y > canvas.height + 5){ f.y = -5; f.x = Math.random()*canvas.width; }
    });
    requestAnimationFrame(tick);
  })();
}

