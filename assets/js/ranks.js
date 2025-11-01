// assets/js/ranks.js
import { db } from './firebase.js';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const grid = document.getElementById('ranksGrid');

const EXT = ["jpg","jpeg","png","webp"];
function smartImg(base, name){
  const img = new Image();
  img.decoding = 'async'; img.loading='lazy'; img.alt = name || 'obrázek';
  let i=0, tried=false;
  function tryNext(){ if(i<EXT.length){ img.src = `${base}/${name}.${EXT[i++]}`; } else if(!tried){ tried=true; img.remove(); } }
  img.addEventListener('error', tryNext); tryNext();
  return img;
}

async function loadBase(){
  try{
    const s = await getDoc(doc(db,'settings','ranks_images'));
    const base = s.exists() ? (s.data().base_url || '').replace(/\/$/,'') : '';
    return base;
  }catch{ return ''; }
}

(async function init(){
  const baseUrl = await loadBase();

  // načti hodnosti
  const qMs = query(collection(db,'milestones'), orderBy('threshold'));
  const snap = await getDocs(qMs);
  const items = [];
  snap.forEach(d=>{
    const data = d.data();
    items.push({
      id: d.id,
      threshold: Number(data.threshold||0),
      label: data.label || '',
      reward: data.reward || '',
      visible: data.visible !== false // default true
    });
  });

  grid.innerHTML = '';
  if(!items.length){
    const p = document.createElement('p'); p.className='muted'; p.textContent = 'Zatím nejsou nastaveny žádné hodnosti.';
    grid.closest('.card').appendChild(p);
    return;
  }

  items.forEach((m, idx)=>{
    const card = document.createElement('div'); card.className='card rank-card';

    // horní obrázek / tajná „placka“
    const media = document.createElement('div'); media.className='rank-media';
    if(m.visible){
      // viditelná hodnost – obrázek není povinný, takže necháme jen jednolitý podklad
      // (pokud bys chtěl přidat vlastní obrázky pro viditelné hodnosti, snadno rozšíříme o pole "image" v dokumentu)
      media.innerHTML = `<div class="muted">Bez obrázku</div>`;
    } else {
      // skrytá = "Tajné" + obrázek secret_rank
      if(baseUrl){
        const img = smartImg(baseUrl, 'secret_rank');
        media.innerHTML = ''; media.appendChild(img);
      } else {
        media.innerHTML = `<div class="muted">Nahraj obrázek 'secret_rank' na GitHub a nastav base_url v settings/ranks_images</div>`;
      }
    }

    // texty
    const title = document.createElement('div'); title.className='rank-title';
    const meta  = document.createElement('div'); meta.className='rank-meta';

    if(m.visible){
      title.innerHTML = `<b>${m.threshold}</b> bodů – ${m.label || ''}`;
      meta.textContent = m.reward ? `Výhra: ${m.reward}` : '';
    }else{
      title.innerHTML = `<span class="rank-secret">Tajné</span>`;
      meta.textContent = `Práh: ${m.threshold} bodů`;
    }

    card.appendChild(media);
    card.appendChild(title);
    if(meta.textContent) card.appendChild(meta);
    grid.appendChild(card);
  });
})();
