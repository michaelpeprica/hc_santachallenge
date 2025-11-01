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
      <img src="./assets/hc_logo.png" 
           alt="Home Credit" 
           class="logo" 
           id="hcLogo"
           onerror="this.onerror=null;
                    const exts=['jpg','jpeg','webp'];
                    for(let i=0;i<exts.length;i++){
                      const test='./assets/hc_logo.'+exts[i];
                      fetch(test).then(r=>{if(r.ok){this.src=test;throw 'break';}});
                    }" />
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
    document.body.setAttribute('data-theme', next);
    localStorage.setItem('xx_theme', next);
  });
  document.getElementById('signOutBtn')?.addEventListener('click', ()=> signOut(auth));

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

