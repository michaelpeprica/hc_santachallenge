// assets/js/ranks.js
import { db } from './firebase.js';
import { auth } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, getDocs, query, orderBy, doc, getDoc,
  where, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const grid = document.getElementById('ranksGrid');

/** Přípony, které zkoušíme. Přidány i VELKÉ varianty kvůli názvům z Windows. */
const EXT = ["jpg","jpeg","png","webp","JPG","JPEG","PNG","WEBP"];

/** Bezpečný loader obrázků: zkouší přípony, při neúspěchu element odstraní a zaloguje varování. */
function smartImg(base, name, altText){
  const img = new Image();
  img.decoding = 'async';
  img.loading  = 'lazy';
  img.alt      = altText || 'obrázek';

  const safeBase = (base || '').replace(/\/+$/,'');     // bez trailing /
  const safeName = encodeURIComponent(name || '');      // pro jistotu

  let i = 0, placed = false;
  function tryNext(){
    if(i < EXT.length){
      img.src = `${safeBase}/${safeName}.${EXT[i++]}`;
    } else if(!placed){
      placed = true;
      img.remove();
      console.warn('[ranks] Nenalezen obrázek:', `${safeBase}/${safeName}.(jpg|jpeg|png|webp)`);
    }
  }
  img.addEventListener('error', tryNext);
  tryNext();
  return img;
}

/** Načti base_url pro obrázky hodností. */
async function loadBase(){
  try{
    const s = await getDoc(doc(db,'settings','ranks_images'));
    let base = s.exists() ? (s.data().base_url || '') : '';
    base = base.trim().replace(/\/+$/,''); // bez lomítka na konci

    // Opravy častých omylů v URL:
    // github.com/.../blob/<branch>/path -> raw.githubusercontent.com/.../<branch>/path
    const m1 = base.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
    if(m1){
      base = `https://raw.githubusercontent.com/${m1[1]}/${m1[2]}/${m1[3]}/${m1[4]}`;
    }
    // raw.../refs/heads/<branch>/path -> raw.../<branch>/path
    base = base.replace(/\/refs\/heads\/([^/]+)\//, '/$1/');

    if(!base) console.warn('[ranks] settings/ranks_images.base_url není nastaveno.');
    return base;
  }catch(e){
    console.error('[ranks] Chyba při čtení settings/ranks_images:', e);
    return '';
  }
}

/* ========= Stav ========= */
let BASE_URL = '';
let MILESTONES = []; // {id, threshold, label, reward, visible, image}
let myPoints = 0;
let unsubMyPoints = null;

/* ========= Render ========= */
function render(){
  if(!grid) return;
  grid.innerHTML = '';

  if(!MILESTONES.length){
    const c = document.createElement('div'); c.className='card';
    c.innerHTML = `<div class="muted">Zatím nejsou nastaveny žádné hodnosti.</div>`;
    (grid.closest('.card') || grid).appendChild(c);
    return;
  }

  MILESTONES.forEach(m=>{
    const card = document.createElement('div'); card.className='card rank-card';

    // --- MEDIA ---
    const media = document.createElement('div'); media.className='rank-media';

    if(m.visible){
      // VIDITELNÁ hodnost — pokud má obrázek, zobraz ho
      if(BASE_URL && m.image){
        const img = smartImg(BASE_URL, m.image, m.label || 'hodnost');
        media.innerHTML = ''; media.appendChild(img);
      } else {
        media.innerHTML = `<div class="muted">Bez obrázku</div>`;
      }
    } else {
      // SKRYTÁ hodnost — zobraz SPRÁVNÝ obrázek, ale rozmazaný (žádné secret_rank)
      if(BASE_URL && m.image){
        const img = smartImg(BASE_URL, m.image, 'tajná hodnost');
        media.innerHTML = ''; media.appendChild(img);
        media.classList.add('blurred');               // rozmazání přes CSS
      } else {
        media.innerHTML = `<div class="muted">Tajné (bez obrázku)</div>`;
      }
    }

    // --- TEXTY ---
    const title = document.createElement('div'); title.className='rank-title';
    const meta  = document.createElement('div'); meta.className='rank-meta';

    const achieved = Number(myPoints) >= Number(m.threshold || 0);
    const pillWon = achieved
      ? `<span class="pill trophy" style="display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:999px;font-weight:800;font-size:1em;line-height:1.1;color:#fff;background:linear-gradient(135deg,#ff7a18,#ffb347);box-shadow:0 1px 2px rgba(0,0,0,.2);">🏆 <b>Hodnost získána</b></span>`
      : ``;

    if(m.visible){
      // viditelná: ukazujeme prah bodů + název + (případně výhru)
      title.innerHTML = `<b>${m.threshold}</b> bodů – ${m.label || ''} ${pillWon}`;
      meta.textContent = m.reward ? `Výhra: ${m.reward}` : '';
    } else {
      // SKRYTÁ: nová logika – zobrazit skutečný název hodnosti, ale neukazovat prah ani výhru
      title.innerHTML = `${m.label || 'Hodnost'} ${pillWon}`;
      meta.textContent = ''; // žádná výhra ani body
    }

    card.appendChild(media);
    card.appendChild(title);
    if(meta.textContent) card.appendChild(meta);

    grid.appendChild(card);
  });
}

/* ========= Data: milestones ========= */
async function loadMilestones(){
  try{
    const qMs = query(collection(db,'milestones'), orderBy('threshold'));
    const snap = await getDocs(qMs);
    const arr = [];
    snap.forEach(d=>{
      const data = d.data();
      arr.push({
        id: d.id,
        threshold: Number(data.threshold||0),
        label: (data.label || ''),
        reward: (data.reward || ''),
        visible: data.visible !== false,               // default = true
        image: (data.image || '').trim() || null       // název souboru bez přípony (např. "rank_01")
      });
    });
    MILESTONES = arr;
  }catch(e){
    console.error('[ranks] Chyba při čtení milestones:', e);
    MILESTONES = [];
  }
}

/* ========= Body přihlášeného v reálném čase ========= */
function subscribeMyPoints(uid){
  unsubMyPoints?.(); unsubMyPoints = null;
  myPoints = 0;
  if(!uid){ render(); return; }

  const qLogs = query(collection(db,'logs'), where('uid','==', uid));
  unsubMyPoints = onSnapshot(qLogs, (snap)=>{
    let sum = 0;
    snap.forEach(d => { sum += Number(d.data().delta || 0); });
    myPoints = sum;
    render(); // přerenderuj hodnosti s novým stavem
  }, (err)=>{
    console.warn('[ranks] onSnapshot logs selhal:', err);
  });
}

/* ========= Init ========= */
(async function init(){
  BASE_URL = await loadBase();
  await loadMilestones();

  // první render (bez bodů / nebo 0) – následně se zaktualizuje po auth
  render();

  onAuthStateChanged(auth, (u)=>{
    subscribeMyPoints(u?.uid || null); // po přihlášení/změně uživatele přepočítej
  });
})();
