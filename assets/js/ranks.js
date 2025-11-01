// assets/js/ranks.js
import { db } from './firebase.js';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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

(async function init(){
  const baseUrl = await loadBase();

  // 1) Načti všechny hodnosti
  let items = [];
  try{
    const qMs = query(collection(db,'milestones'), orderBy('threshold'));
    const snap = await getDocs(qMs);
    snap.forEach(d=>{
      const data = d.data();
      items.push({
        id: d.id,
        threshold: Number(data.threshold||0),
        label: (data.label || ''),
        reward: (data.reward || ''),
        visible: data.visible !== false,               // default = true
        image: (data.image || '').trim() || null       // název souboru bez přípony (např. "rank_01")
      });
    });
  }catch(e){
    console.error('[ranks] Chyba při čtení milestones:', e);
    items = [];
  }

  // 2) Render
  grid.innerHTML = '';
  if(!items.length){
    const c = document.createElement('div'); c.className='card';
    c.innerHTML = `<div class="muted">Zatím nejsou nastaveny žádné hodnosti.</div>`;
    grid.closest('.card').appendChild(c);
    return;
  }

  items.forEach(m=>{
    const card = document.createElement('div'); card.className='card rank-card';

    // --- MEDIA ---
    const media = document.createElement('div'); media.className='rank-media';

    if(m.visible){
      // VIDITELNÁ hodnost — pokud má obrázek, zobraz ho
      if(baseUrl && m.image){
        const img = smartImg(baseUrl, m.image, m.label || 'hodnost');
        media.innerHTML = ''; media.appendChild(img);
      } else {
        media.innerHTML = `<div class="muted">Bez obrázku</div>`;
      }
    } else {
      // SKRYTÁ hodnost — zobraz SPRÁVNÝ obrázek, ale rozmazaný (žádné secret_rank)
      if(baseUrl && m.image){
        const img = smartImg(baseUrl, m.image, 'tajná hodnost');
        media.innerHTML = ''; media.appendChild(img);
        media.classList.add('blurred');               // <— klíč: rozmazání přes CSS
      } else {
        // Nemáme image → decentní fallback
        media.innerHTML = `<div class="muted">Tajné (bez obrázku)</div>`;
      }
    }

    // --- TEXTY ---
    const title = document.createElement('div'); title.className='rank-title';
    const meta  = document.createElement('div'); meta.className='rank-meta';

    if(m.visible){
      title.innerHTML = `<b>${m.threshold}</b> bodů – ${m.label || ''}`;
      meta.textContent = m.reward ? `Výhra: ${m.reward}` : '';
    } else {
      title.innerHTML = `<span class="rank-secret">Tajné</span>`;
      // změna logiky: NEzobrazujeme číslo prahu → místo něj "???"
      meta.textContent = `Práh: ??? bodů`;
    }

    card.appendChild(media);
    card.appendChild(title);
    if(meta.textContent) card.appendChild(meta);

    grid.appendChild(card);
  });
})();
