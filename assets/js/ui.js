// assets/js/ui.js
import { auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

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
      <div class="logo" aria-hidden="true">☄️</div>
      <h1>Vánoční výzva 2025</h1>
    </div>
    <nav>
      <a class="btn small" href="./dashboard.html" title="Přehled">📊 Přehled</a>
      <a class="btn small" href="./ranks.html" title="Hodnosti">🏆 Hodnosti</a>
      <a class="btn small" href="./map.html" title="Mapa">🗺️ Mapa</a>
      <a class="btn small" href="./manager.html" title="Nastavení">🛠️ Vedoucí</a>
      <button class="btn small" id="themeToggle" title="Přepnout téma">🌓 Téma</button>
      <span id="accountInfo" class="account"></span>
      <button class="btn small ghost" id="signOutBtn" title="Odhlásit">Odhlásit</button>
    </nav>
  `;
  document.body.prepend(header);

  document.getElementById('themeToggle')?.addEventListener('click', ()=>{
    const next = document.body.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
    applyTheme(next);
  });
  document.getElementById('signOutBtn')?.addEventListener('click', ()=> signOut(auth));

  // zvýraznění aktivní stránky:
  const path = location.pathname.split('/').pop() || 'index.html';
  for(const a of header.querySelectorAll('a.btn')) {
    if (a.getAttribute('href') === `./${path}`) a.classList.add('active');
  }
}

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

// --- jednoduché pozadí + sníh (převzato z původní stránky, mírně zkráceno) ---
function initBg(){
  const bg = document.createElement('div');
  bg.className = 'bg-illustration';
  bg.setAttribute('aria-hidden','true');
  document.body.appendChild(bg);
}
function initSnow(){
  const canvas = document.createElement('canvas');
  canvas.id = 'snow';
  document.body.appendChild(canvas);
  const cx = canvas.getContext('2d');
  const resize = ()=>{ canvas.width = innerWidth; canvas.height = innerHeight; };
  addEventListener('resize', resize); resize();
  const flakes = Array.from({length: 140}, ()=>({
    x: Math.random()*canvas.width, y: Math.random()*canvas.height,
    r: Math.random()*2+1, s: Math.random()*0.6+0.2, w: Math.random()*1.2+0.2
  }));
  (function tick(){
    cx.clearRect(0,0,canvas.width,canvas.height); cx.globalAlpha = 0.9;
    flakes.forEach(f=>{
      cx.beginPath(); cx.arc(f.x,f.y,f.r,0,Math.PI*2); cx.fillStyle='#fff'; cx.fill();
      f.y += f.s; f.x += Math.sin(f.y*0.01)*f.w;
      if(f.y>canvas.height+5){ f.y=-5; f.x=Math.random()*canvas.width; }
    });
    requestAnimationFrame(tick);
  })();
}
