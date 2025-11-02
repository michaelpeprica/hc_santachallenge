// assets/js/map.js
import { db } from './firebase.js';
import {
  doc, getDoc, collection, getDocs, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ===== DOM ===== */
const track    = document.getElementById("track");
const prevBtn  = document.getElementById("prevBtn");
const nextBtn  = document.getElementById("nextBtn");
const viewport = document.getElementById("viewport");
const infoPane = document.getElementById("infoPane");
const titleEl  = document.getElementById("title");
const descEl   = document.getElementById("desc");
const metaEl   = document.getElementById("meta");
const layoutEl = document.getElementById("layout");

/* ===== Stav ===== */
let slides = []; // { title, desc, base }
let index  = 0;
let total  = 0;

/* ===== Firestore: config & metadata ===== */
async function loadConfig(){
  try{
    const s = await getDoc(doc(db,'settings','carousel'));
    if(!s.exists()){
      console.warn('[carousel] settings/carousel neexistuje.');
      return { base_url: '', count: 0 };
    }
    const base_url = (s.data().base_url || '').replace(/\/$/, '');
    const count    = Number(s.data().count || 0) | 0;
    return { base_url, count: Math.max(0, count) };
  }catch(e){
    console.error('[carousel] Chyba settings/carousel:', e);
    return { base_url: '', count: 0 };
  }
}

async function loadSlidesMeta(count){
  const metas = Array.from({length: count}, (_,i)=>({ title:`Snímek ${i+1}`, desc:'', visible:true }));
  try{
    const snap = await getDocs(query(collection(db,'carousel'), orderBy('__name__')));
    snap.forEach(d=>{
      const m = d.id.match(/\d+/); if(!m) return;
      const idx = (parseInt(m[0],10)||0) - 1;
      if(idx>=0 && idx<metas.length){
        const data = d.data();
        metas[idx] = {
          title:   data.title || metas[idx].title,
          desc:    data.desc  || metas[idx].desc,
          visible: (data.visible !== false) // default: true
        };
      }
    });
  }catch(e){
    console.warn('[carousel] Nelze načíst meta z kolekce carousel:', e);
  }
  return metas;
}

/* ===== Loader obrázků (zkouší přípony) ===== */
const EXT = ["jpg","jpeg","png","webp","JPG","JPEG","PNG","WEBP"];
function createSmartImage(fullBase){
  const img=new Image();
  img.decoding="async"; img.loading="lazy"; img.alt="Snímek";
  let i = 0, placed = false;
  function tryNext(){
    if(i < EXT.length){
      img.src = `${fullBase}.${EXT[i++]}`;
    } else if(!placed){
      placed = true;
      console.warn('[carousel] Obrázek nenalezen pro', fullBase);
    }
  }
  img.addEventListener('error', tryNext);
  img.addEventListener('dblclick', ()=> img.classList.toggle('cover'));
  return (tryNext(), img);
}

/* ===== Render ===== */
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

// --- Markdown parser (základní, bezpečný, bez externích knihoven) ---
function mdToHtml(md){
  if(!md) return '';
  let html = md
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/\*\*(.*?)\*\*/g,"<b>$1</b>")
    .replace(/\*(.*?)\*/g,"<i>$1</i>")
    .replace(/__(.*?)__/g,"<u>$1</u>")
    .replace(/`(.*?)`/g,"<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/g,'<a href="$2" target="_blank">$1</a>')
    .replace(/^> (.*)$/gm,'<blockquote>$1</blockquote>')
    .replace(/^- (.*)$/gm,'<li>$1</li>')
    .replace(/\n{2,}/g,'</p><p>')
    .replace(/\n/g,'<br>');
  html = html.replace(/(<li>.*<\/li>)/gs,'<ul>$1</ul>');
  return `<p>${html}</p>`;
}

// --- Aktualizace karuselu s markdown popisky ---
function update(){
  if(total===0){
    titleEl.textContent = 'Žádné viditelné snímky';
    descEl.textContent  = 'Ve vedoucím nastavení karuselu jsou všechny snímky skryté, nebo není nastaveno base_url / count.';
    metaEl.textContent  = '';
    track.style.transform = 'translateX(0)';
    document.title = 'Karusel – bez snímků';
    return;
  }
  track.style.transform = `translateX(${-index*100}%)`;
  const s = slides[index];
  titleEl.textContent = s.title || `Snímek ${index+1}`;
  descEl.innerHTML    = mdToHtml(s.desc || '');
  metaEl.textContent  = `${index+1} / ${total}`;
  document.title = `${s.title || `Snímek ${index+1}`} – Karusel`;
}

function goTo(i){ if(total===0) return; index=(i+total)%total; update(); }
const next = ()=> goTo(index+1);
const prev = ()=> goTo(index-1);

/* ===== Ovládání ===== */
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
// jednoduchý swipe
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

/* ===== Rozměry bez scrollu (výška okna – header – footer) ===== */
function resizeViewport(){
  const vv = window.visualViewport || null;
  const ww = vv ? vv.width  : window.innerWidth;
  const wh = vv ? vv.height : window.innerHeight;

  const headerH = (document.querySelector('header')?.offsetHeight || 0);
  const footerH = (document.querySelector('footer')?.offsetHeight || 0);

  const main = document.querySelector('main');
  if(!main) return;

  const totalH = Math.max(0, wh - headerH - footerH);
  main.style.height = totalH + "px";
  main.style.boxSizing = 'border-box';
  main.style.overflow = 'hidden';

  const viewports = document.querySelectorAll('.viewport');
  viewports.forEach(vp => {
    const fig = vp.querySelector('figure');
    if (!fig) return;
    const vh = vp.clientHeight;
    const vw = vp.clientWidth;
    const desiredW = vh * (2 / 3);
    const desiredH = vw * (3 / 2);
    if (desiredW < vw) {
      fig.style.height = vh + 'px';
      fig.style.width  = desiredW + 'px';
    } else {
      fig.style.width  = vw + 'px';
      fig.style.height = desiredH + 'px';
    }
  });

  const cs = getComputedStyle(main);
  const padTop = parseFloat(cs.paddingTop)||0;
  const padBottom = parseFloat(cs.paddingBottom)||0;

  const infoMax = Math.max(0, totalH - padTop - padBottom);
  const infoScroll = infoPane?.querySelector('.infoScroll');
  if(infoScroll) infoScroll.style.maxHeight = infoMax + 'px';
}
const ro = new ResizeObserver(resizeViewport);
ro.observe(document.body);
const headerEl = document.querySelector('header');
const footerEl = document.querySelector('footer');
if(headerEl) ro.observe(headerEl);
if(footerEl) ro.observe(footerEl);
if(window.visualViewport){
  visualViewport.addEventListener('resize', resizeViewport);
  visualViewport.addEventListener('scroll', resizeViewport);
}
window.addEventListener('orientationchange', ()=>setTimeout(resizeViewport, 50));

/* ===== INIT ===== */
(async function init(){
  try{
    resizeViewport();

    const { base_url, count } = await loadConfig();
    if(!count || count<1 || !base_url){
      slides = [];
      renderSlides();
      return;
    }

    const meta = await loadSlidesMeta(count);
    // pouze VIDITELNÉ snímky
    const visibleMeta = meta
      .map((m, i)=> ({...m, idx:i+1}))
      .filter(m=> m.visible);

    slides = visibleMeta.map((m)=>({
      title: m.title,
      desc:  m.desc,
      base:  `${base_url}/P${m.idx}`  // P1..PN.(ext)
    }));

    renderSlides();
  }catch(e){
    console.error('[carousel] Nezpracovaná chyba při initu:', e);
    slides = [];
    renderSlides();
  }
})();
