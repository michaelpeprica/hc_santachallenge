// assets/js/ranks.js
import { db } from './firebase.js';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const grid = document.getElementById('ranksGrid');

const EXT = ["jpg","jpeg","png","webp"];
function smartImg(base, name, altText){
  const img = new Image();
  img.decoding = 'async'; img.loading='lazy';
  img.alt = altText || 'obrázek';
  let i=0, placed=false;
  function tryNext(){
    if(i<EXT.length){
      img.src = `${base}/${name}.${EXT[i++]}`;
    } else if(!placed) {
      placed = true;
      // když ani jedna přípona nevyjde, necháme box bez obrázku
      img.remove();
      console.warn('[ranks] Nenalezen obrázek:', `${base}/${name}.(jpg|jpeg|png|webp)`);
    }
  }
  img.addEventListener('error', tryNext);
  tryNext();
  return img;
}

async function loadBase(){
  try{
    const s = await getDoc(doc(db,'settings','ranks_images'));
    const base = s.exists() ? (s.data().base_url || '').replace(/\/$/,'') : '';
    if(!base) console.warn('[ranks] settings/ranks_images.base_url není nastaveno.');
    return base;
  }catch(e){
    console.error('[ranks] Chyba při čtení settings/ranks_images:', e);
    return '';
  }
}

(async function init(){
  const baseUrl = await loadBase();

  // načíst všechny hodnosti
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
        visible: data.visible !== false,
        image: (data.image || '').trim() || null  // <— název souboru bez přípony (např. "rank_01")
      });
    });
  }catch(e){
    console.error('[ranks] Chyba při čtení milestones:', e);
    items = [];
  }

  grid.innerHTML = '';
  if(!items.length){
    const c = document.createElement('div'); c.className='card';
    c.innerHTML = `<div class="muted">Zatím nejsou nastaveny žádné hodnosti.</div>`;
    grid.closest('.card').appendChild(c);
    return;
  }

  items.forEach(m=>{
    const card = document.createElement('div'); card.className='card rank-card';

    // MEDIA
    const media = document.createElement('div'); media.className='rank-media';
    if(m.visible){
      if(baseUrl && m.image){
        const img = smartImg(baseUrl, m.image, m.label || 'hodnost');
        media.innerHTML = ''; media.appendChild(img);
      } else {
        media.innerHTML = `<div class="muted">Bez obrázku</div>`;
      }
    } else {
      if(baseUrl){
        const img = smartImg(baseUrl, 'secret_rank', 'tajná hodnost');
        media.innerHTML = ''; media.appendChild(img);
      } else {
        media.innerHTML = `<div class="muted">Nastav base_url v settings/ranks_images a nahraj 'secret_rank'</div>`;
      }
    }

    // TEXTY
    const title = document.createElement('div'); title.className='rank-title';
    const meta  = document.createElement('div'); meta.className='rank-meta';

    if(m.visible){
      title.innerHTML = `<b>${m.threshold}</b> bodů – ${m.label || ''}`;
      meta.textContent = m.reward ? `Výhra: ${m.reward}` : '';
    } else {
      title.innerHTML = `<span class="rank-secret">Tajné</span>`;
      meta.textContent = `Práh: ${m.threshold} bodů`;
    }

    card.appendChild(media);
    card.appendChild(title);
    if(meta.textContent) card.appendChild(meta);
    grid.appendChild(card);
  });
})();
