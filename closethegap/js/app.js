/* ============================================================
   APP.JS
   Bootstrap dell'applicazione: routing tra tab, service worker,
   avvio iniziale. Ultimo file caricato: deve stare in fondo
   perché chiama funzioni definite in tutti gli altri moduli.
   ============================================================ */

var TITLES={home:'Oggi',plan:'Piano di Allenamento',calendar:'Calendario',activities:'Attivita',analytics:'Analisi & Power',fitness:'Fitness'};
function showPage(id,el) {
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  document.getElementById('page-'+id).classList.add('active');
  if(el) el.classList.add('active');
  document.getElementById('topbar-title').textContent=TITLES[id]||id;
  var fns={home:renderHome,plan:renderPlanPage,calendar:renderCal,activities:renderActs,analytics:renderAnalytics,fitness:renderFitness};
  if(fns[id]) fns[id]();
  closeSidebar(); // su mobile il drawer si chiude da solo dopo aver scelto una tab
}

/* Drawer di navigazione per mobile/tablet (<=900px): il markup della
   sidebar è lo stesso di desktop, qui gestiamo solo apertura/chiusura. */
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.querySelector('.sidebar-backdrop').classList.toggle('open');
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-backdrop').classList.remove('open');
}

if('serviceWorker' in navigator){
  window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});
}
var bs=document.getElementById('build-stamp');
if (bs && typeof CTG_BUILD === 'string') bs.textContent = 'build ' + CTG_BUILD;

document.getElementById('topbar-date').textContent=new Date().toLocaleDateString('it',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

/* Avvio: carica la cache locale e disegna subito, poi sincronizza in
   background (vedi js/storage.js). Niente più bottoni da premere a ogni
   apertura; quelli manuali restano per forzare un aggiornamento. */
bootstrapData();

/* Salva lo stato quando si lascia la pagina, così anche le modifiche
   manuali (attività aggiunte a mano) sopravvivono al reload. */
window.addEventListener('beforeunload', function(){ try { saveState(); } catch(e){} });
