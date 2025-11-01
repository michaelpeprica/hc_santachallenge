// assets/js/map.js
import { db } from './firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

(async function initMap(){
  const wrap = document.getElementById('mapWrap');
  try{
    const snap = await getDoc(doc(db,'settings','map'));
    const url = (snap.exists()? snap.data().image_url: '') || '';
    wrap.innerHTML = url
      ? `<img src="${url}" alt="Mapa" style="max-width:100%; height:auto">`
      : '<div class="muted">Obrázek mapy zatím není nastaven.</div>';
  }catch(e){
    wrap.innerHTML = '<div class="muted">Chyba při načítání mapy.</div>';
  }
})();
