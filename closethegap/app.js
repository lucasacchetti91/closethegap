/* ============================================================
   APP.JS
   Bootstrap dell'applicazione: routing tra tab, service worker,
   avvio iniziale. Ultimo file caricato: deve stare in fondo
   perché chiama funzioni definite in tutti gli altri moduli.
   ============================================================ */

var TITLES={home:'Oggi',plan:'Piano di Allenamento',calendar:'Calendario',activities:'Attivita',analytics:'Analisi & Power'};
function showPage(id,el) {
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});
  document.getElementById('page-'+id).classList.add('active');
  if(el) el.classList.add('active');
  document.getElementById('topbar-title').textContent=TITLES[id]||id;
  var fns={home:renderHome,plan:renderPlanPage,calendar:renderCal,activities:renderActs,analytics:renderAnalytics};
  if(fns[id]) fns[id]();
}

if('serviceWorker' in navigator){
  window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});
}
document.getElementById('topbar-date').textContent=new Date().toLocaleDateString('it',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
makePlan();
renderHome();
