// assets/js/map.js
import { db } from './firebase.js';
import {
  doc, getDoc, collection, getDocs, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- DOM (ověříme, že existuje) ---
const track    = document.getElementById("track");
const prevBtn  = document.getElementById("prevBtn");
const nextBtn  = document.getElementById("nextBtn");
const viewport = document.getElementById("viewport");
const infoPane = document.getElementById("infoPane");
const titleEl  = document.getElementById("title");
const descEl   = document.getElementById("desc");
const metaEl   = document.getElementById("meta");
const layoutEl = document.getElementById("layout");

if(!track || !viewport || !infoPane || !titleEl || !descEl || !metaEl){
  console.error('[carousel] Chybí některé DOM elementy (zkontroluj id=track/viewport/infoPane/title/desc/meta).');
}

// --- Stav karuselu ---
let slides = []; // { title, desc, base }
let index  = 0;
let total  = 0;

// --- Konfigurace ze settings/carousel ---
async function loadConfig(){
  try{
    const s = await getDoc(doc(db,'settings','carousel'));
    if(!s.exists()){
      console.warn('[carousel] settings/carousel neexistuje – zobrazím placeholder. V manageru nastav base_url + count.');
      return { base_url: '', count: 0 };
    }
    const base_url = (s.data().base_url || '').replace(/\/$/, '');
    const count    = Number(s.data().count || 0) | 0;
    return { base_url, count: Math.max(0, count) };
  }catch(e){
    console.error('[carousel] Chyba při čtení settings/carousel:', e);
    return { base_url: '', count: 0 };
  }
}

// --- Metadata snímků z kolekce carousel/{1..N} ---
async function loadSlidesMeta(count){
  // Výchozí fallback metadat (Snímek 1..N)
  const metas = Array.from({length: count}, (_,i)=>({ title:`Snímek ${i+1}`, desc:'' }));
  try{
    // Čteme v pořadí ID (očekáváme "1","2",...)
    const snap = await getDocs(query(collection(db,'carousel'), orderBy('__name__')));
    snap.forEach(d=>{
      const m = d.id.match(/\d+/); if(!m) return;
      const idx = (parseInt(m[0],10)||0) - 1;
      if(idx>=0 && idx<metas.length){
        metas[idx] = {
          title: (d.data().title || metas[idx].title),
          desc:  (d.data().desc  || metas[idx].desc),
        };
      }
    });
  }catch(e){
    console.warn('[carousel] Nelze načíst kolekci carousel – použiji fallback titulky:', e);
  }
  return metas;
}

// --- Obrázky: base_url/P{N}.{ext}; fallback placeholder ---
const EXT = ["jpg","jpeg","png","webp"];
const placeholderDataURI = (() => {
  const w=1024,h=1536;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f2937"/><stop offset="100%" stop-color="#0f172a"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <g fill="#e5e7eb" text-anchor="middle">
      <text x="${w/2}" y="${h/2-12}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="36" font-weight="700">Obrázek nenalezen</text>
      <text x="${w/2}" y="${h/2+26}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="22" opacity="0.85">Zkontroluj base_url a soubory P1..PN</text>
    </g></svg>`;
  return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
})();
function createSmartImage(fullBase){
  const img=new Image();
  img.decoding="async"; img.loading="lazy";
  img.alt="Snímek";
  let i = 0, tried = false;
  function tryNext(){
    if(i < EXT.length){
      img.src = `${fullBase}.${EXT[i++]}`;
    } else if(!tried){
      tried = true;
      img.src = placeholderDataURI;
    }
  }
  img.addEventListener('error', tryNext);
  tryNext();
  // umožní přepnout contain/cover
  img.addEventListener('dblclick', ()=> img.classList.toggle('cover'));
  return img;
}

// --- Render ---
function renderSlides(){
  track.innerHTML = '';
  slides.forEach(s=>{
    const li  = document.createElement("div");
    li.className = "slide"; li.setAttribute("role","listitem");
    const fig = document.createElement("figure");
    const img = createSmartImage(s.base);
    fig.appendChild(img);
    li.appendChild(fig);
    track.appendChild(li);
  });
  total = slides.length;
  index = Math.min(index, Math.max(0,total-1));
  update();
}

function update(){
  if(total===0){
    titleEl.textContent = 'Žádné snímky';
    descEl.textContent  = 'V manageru nastavte base_url a count. Potom přidejte soubory P1..PN do GitHubu a (volitelně) titulky v /carousel/{i}.';
    metaEl.textContent  = '';
    track.style.transform = 'translateX(0)';
    return;
  }
  track.style.transform = `translateX(${-index*100}%)`;
  const s = slides[index];
  titleEl.textContent = s.title || `Snímek ${index+1}`;
  descEl.textContent  = s.desc  || '';
  metaEl.textContent  = `${index+1} / ${total}`;
  document.title = `${s.title || `Snímek ${index+1}`} – Karusel`;
}

function goTo(i){ if(total===0) return; index=(i+total)%total; update(); }
function next(){ goTo(index+1); }
function prev(){ goTo(index-1); }

// Ovládání
prevBtn?.addEventListener("click", prev);
nextBtn?.addEventListener("click", next);
addEventListener("keydown", e=>{
  if(e.key==="ArrowRight") next();
  if(e.key==="ArrowLeft")  prev();
  if(e.key && e.key.toLowerCase()==="z"){
    const curImg = track.querySelectorAll('.slide img')[index];
    if(curImg) curImg.classList.toggle('cover');
  }
});

// Swipe
(function enableSwipe(el){
  if(!el) return;
  let x0=null;
  el.addEventListener("pointerdown", e=>x0=e.clientX, {passive:true});
  el.addEventListener("pointerup", e=>{
    if(x0===null) return;
    const dx=e.clientX-x0;
    if(Math.abs(dx)>30) (dx<0?next:prev)();
    x0=null;
  }, {passive:true});
  el.addEventListener("pointercancel", ()=>x0=null);
})(viewport);

// Layout helpers (stack vs. side-by-side)
function isStacked(){ return getComputedStyle(layoutEl).flexDirection === "column"; }

// Přepočet výšky stránky bez scrollu
function getViewportSize(){
  const vv = window.visualViewport || null;
  const ww = vv ? vv.width  : window.innerWidth;
  const wh = vv ? vv.height : window.innerHeight;
  const headerH = (document.querySelector('header')?.offsetHeight || 0);
  const footerH = (document.querySelector('footer')?.offsetHeight || 0);

  const main = document.querySelector('main');
  const cs = main ? getComputedStyle(main) : null;
  const padTop = cs ? parseFloat(cs.paddingTop)||0 : 16;
  const padBottom = cs ? parseFloat(cs.paddingBottom)||0 : 16;
  const padLeft = cs ? parseFloat(cs.paddingLeft)||0 : 16;
  const padRight = cs ? parseFloat(cs.paddingRight)||0 : 16;

  const totalH = Math.max(0, wh - headerH - footerH);
  // info panel scrolluje uvnitř sebe; dovolíme mu max. dostupnou výšku
  const usableH = totalH - padTop - padBottom;
  infoPane.style.maxHeight = Math.max(0, usableH) + 'px';

  // už nepočítáme konkrétní šířku/výšku viewportu – flex to rozdělí přesně
  return { totalH, ww: ww - padLeft - padRight, hh: usableH };
}

function resizeViewport(){
  const { totalH } = getViewportSize();
  const main = document.querySelector('main');
  if(main){
    main.style.height = totalH + "px";
    main.style.boxSizing = 'border-box';
    main.style.display = 'flex';
    main.style.flexDirection = 'column';
  }
}

// Reaguj na změny velikosti
const ro = new ResizeObserver(resizeViewport);
ro.observe(document.body);
ro.observe(infoPane);
const headerEl = document.querySelector('header');
const footerEl = document.querySelector('footer');
if(headerEl) ro.observe(headerEl);
if(footerEl) ro.observe(footerEl);
if(window.visualViewport){
  visualViewport.addEventListener('resize', resizeViewport);
  visualViewport.addEventListener('scroll', resizeViewport);
}
window.addEventListener('orientationchange', ()=>setTimeout(resizeViewport, 50));

// --- INIT ---
(async function init(){
  try{
    resizeViewport();

    const { base_url, count } = await loadConfig();
    if(!count || count<1){
      slides = []; // zobrazí se fallback hlášky v update()
      renderSlides();
      return;
    }

    const meta = await loadSlidesMeta(count);
    slides = meta.map((m, i)=>({
      title: m.title,
      desc:  m.desc,
      base:  base_url ? `${base_url}/P${i+1}` : ''  // prázdný base → placeholder
    }));

    renderSlides();
  }catch(e){
    console.error('[carousel] Nezpracovaná chyba při initu:', e);
    // zobraz fallback, ať stránka není prázdná
    slides = [];
    renderSlides();
  }
})();
