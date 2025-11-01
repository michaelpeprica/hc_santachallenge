// assets/js/map.js
import { db } from './firebase.js';
import {
  doc, getDoc, collection, getDocs, query, orderBy
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// --- DOM ---
const track = document.getElementById("track");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const viewport = document.getElementById("viewport");
const infoPane = document.getElementById("infoPane");
const titleEl = document.getElementById("title");
const descEl  = document.getElementById("desc");
const metaEl  = document.getElementById("meta");
const layoutEl= document.getElementById("layout");

// --- Načtení konfigurace a metadat snímků ---
async function loadConfig(){
  const s = await getDoc(doc(db,'settings','carousel'));
  const base_url = s.exists() ? (s.data().base_url || '') : '';
  const count = s.exists() ? Number(s.data().count || 0) : 0;
  return { base_url: base_url.replace(/\/$/,''), count: Math.max(0, count|0) };
}

async function loadSlidesMeta(count){
  // Čteme dokumenty carousel/{index} – index = 1..count (volitelně můžeš mít i méně)
  const metas = Array.from({length: count}, (_,i)=>({ title:`Snímek ${i+1}`, desc:'' }));
  // Podpora: pokud bys místo indexů vytvořil manuální doky s polem "index",
  // dá se použít query(collection(db,'carousel'), orderBy('index')) a mapnout.
  const snap = await getDocs(query(collection(db,'carousel'), orderBy('__name__')));
  snap.forEach(d=>{
    // očekáváme id jako "1","2"... nebo "P1" – zkusíme vyparsovat číslo
    const m = d.id.match(/\d+/); if(!m) return;
    const idx = (parseInt(m[0],10) || 0) - 1;
    if(idx>=0 && idx<metas.length){
      metas[idx] = {
        title: d.data().title || metas[idx].title,
        desc:  d.data().desc  || metas[idx].desc
      };
    }
  });
  return metas;
}

// --- Obrázky z GitHubu: base_url/P{N}.{ext} ---
const extCandidates = ["jpg","jpeg","png","webp"];
function createSmartImage(fullBase){
  const img=new Image();
  img.decoding="async"; img.loading="lazy"; img.alt="Obrázek";
  let i=0, used=false;
  function tryNext(){
    if(i<extCandidates.length){ img.src=`${fullBase}.${extCandidates[i++]}`; }
    else if(!used){ used=true; img.src=placeholderDataURI; }
  }
  img.addEventListener("error", tryNext);
  tryNext();
  return img;
}
const placeholderDataURI = (() => {
  const w=1024, h=1536;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f2937"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <g fill="#e5e7eb" text-anchor="middle">
      <text x="${w/2}" y="${h/2-12}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="36" font-weight="700">Není k dispozici</text>
      <text x="${w/2}" y="${h/2+26}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial" font-size="24" opacity="0.8">Přidejte obrázek do GitHubu</text>
    </g></svg>`;
  return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg);
})();

// --- Karusel stav ---
let slides = []; // {title, desc, base}  base= `${base_url}/P{i+1}`
let index=0; let total=0;

function renderSlides(){
  track.innerHTML = '';
  slides.forEach((s)=>{
    const li = document.createElement("div");
    li.className="slide"; li.setAttribute("role","listitem");

    const fig=document.createElement("figure");
    const img=createSmartImage(s.base);
    // podpora přepínání režimu cover/contain dvojklikem
    img.addEventListener('dblclick', ()=> img.classList.toggle('cover'));
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
    descEl.textContent  = 'Nastav v sekci Vedoucí → Karusel.';
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

function goTo(i){ index=(i+total)%total; update(); }
function next(){ goTo(index+1); }
function prev(){ goTo(index-1); }

prevBtn.addEventListener("click", prev);
nextBtn.addEventListener("click", next);
addEventListener("keydown", e=>{
  if(e.key==="ArrowRight") next();
  if(e.key==="ArrowLeft")  prev();
  if(e.key.toLowerCase()==="z"){
    const curImg = track.querySelectorAll('.slide img')[index];
    if(curImg) curImg.classList.toggle('cover');
  }
});

// Swipe
(function enableSwipe(el){
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

// Layout fit (2:3) – stejné chování jako v původním karuselu
const RATIO_W=2, RATIO_H=3;
function isStacked(){ return getComputedStyle(layoutEl).flexDirection === "column"; }
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
  const gap = 16;

  const totalH = Math.max(0, wh - headerH - footerH);

  // Šířka pro layout
  let usableW = ww - padLeft - padRight;
  // Výška pro layout (celé <main> bez paddingů)
  const usableH = totalH - padTop - padBottom;

  if(!isStacked()){
    const paneW = infoPane.getBoundingClientRect().width || 0;
    usableW = Math.max(0, usableW - paneW - gap);
    // panel může být vysoký jako celý layout
    infoPane.style.maxHeight = Math.max(0, usableH) + 'px';
  } else {
    // ve stacku dáme panelu přiměřenou rezervu a zbytek viewportu
    const reserveForPane = Math.max(140, Math.min(320, usableH * 0.38));
    infoPane.style.maxHeight = Math.max(0, usableH - 8) + 'px';
    // viewport výšku dopočítáme až v CSS/roztažením – tady žádný „pevný poměr“
  }

  // Vracíme hodnotu pro výšku <main> (aby stránka ne-scrollovala)
  return { totalH };
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

const ro = new ResizeObserver(resizeViewport);
ro.observe(document.body); ro.observe(infoPane);
const headerEl = document.querySelector('header');
const footerEl = document.querySelector('footer');
if(headerEl) ro.observe(headerEl);
if(footerEl) ro.observe(footerEl);
if(window.visualViewport){
  visualViewport.addEventListener('resize', resizeViewport);
  visualViewport.addEventListener('scroll', resizeViewport);
}
window.addEventListener('orientationchange', ()=>setTimeout(resizeViewport, 50));

// Init
(async function init(){
  resizeViewport();
  const { base_url, count } = await loadConfig();
  const meta = await loadSlidesMeta(count);
  slides = meta.map((m, i)=>({ title: m.title, desc: m.desc, base: `${base_url}/P${i+1}` }));
  renderSlides();
})();
