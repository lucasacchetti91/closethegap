/* ============================================================
   ACTIVITY-DETAIL.JS
   Dettaglio per singola uscita, in stile feed: mappa minimale del
   percorso, profilo altimetrico e best effort di potenza.

   SCELTA DI PROGETTO — perché i dati si scaricano "a richiesta":
   gli stream secondo-per-secondo sono grossi (centinaia di kB per
   uscita). Scaricarli per tutte le attività a ogni apertura sarebbe
   lento e sprecherebbe le chiamate API. Qui vengono scaricati solo
   quando espandi una scheda, e di quello che arriva viene salvato solo
   il RIASSUNTO DERIVATO (percorso ridotto a ~180 punti, altimetria a
   ~140 punti, best effort) - pochi kB, che stanno comodi in
   localStorage. Gli stream grezzi non vengono mai persistiti.

   MAPPA: è una planimetria vettoriale del tracciato, non una mappa con
   sfondo cartografico. Disegna la forma del percorso a partire dalle
   coordinate GPS, senza dipendere da un servizio di tile esterno
   (niente chiavi API, niente costi, niente tracciamento). Per una vista
   "minimal" come richiesto è sufficiente; se un domani volessi lo
   sfondo vero servirebbe un provider tipo Mapbox/OSM.
   ============================================================ */

var activityDetailCache = {};   // id -> {route, elev, bests, kj}
var activityDetailLoading = {};

/* Riduce un array a maxPoints campioni mantenendo primo e ultimo. */
function downsample(arr, maxPoints) {
  if (!arr || arr.length<=maxPoints) return arr||[];
  var step = arr.length/maxPoints, out=[];
  for (var i=0;i<maxPoints;i++) out.push(arr[Math.floor(i*step)]);
  out.push(arr[arr.length-1]);
  return out;
}

/* Best mean power per una lista di durate, con somme prefisse (O(n)).
   NOTA: assume campionamento ~1Hz, che è il caso normale per gli stream
   di Intervals.icu. Se ci sono buchi (pause GPS) le finestre risultano
   leggermente ottimistiche. */
function bestMeanPowers(watts, durations) {
  if (!watts || !watts.length) return [];
  var n=watts.length, pre=new Float64Array(n+1);
  for (var i=0;i<n;i++) pre[i+1]=pre[i]+(watts[i]||0);
  return durations.filter(function(d){return d<=n;}).map(function(d){
    var best=0;
    for (var s=0;s+d<=n;s++){ var m=(pre[s+d]-pre[s])/d; if(m>best) best=m; }
    return {secs:d, watts:Math.round(best)};
  });
}

/* Proiezione equirettangolare semplice: alle latitudini medie e su
   distanze da uscita in bici la distorsione è trascurabile. */
function buildRoutePath(latlng, w, h, pad) {
  if (!latlng || latlng.length<2) return null;
  var lat0 = latlng[Math.floor(latlng.length/2)][0] * Math.PI/180;
  var pts = latlng.map(function(p){ return [p[1]*Math.cos(lat0), p[0]]; }); // [x=lng*cos(lat), y=lat]
  var xs=pts.map(function(p){return p[0];}), ys=pts.map(function(p){return p[1];});
  var minX=Math.min.apply(null,xs), maxX=Math.max.apply(null,xs);
  var minY=Math.min.apply(null,ys), maxY=Math.max.apply(null,ys);
  var spanX=maxX-minX||1e-6, spanY=maxY-minY||1e-6;
  var scale=Math.min((w-2*pad)/spanX, (h-2*pad)/spanY);
  var offX=(w-spanX*scale)/2, offY=(h-spanY*scale)/2;
  return pts.map(function(p,i){
    var x=(p[0]-minX)*scale+offX;
    var y=h-((p[1]-minY)*scale+offY); // y invertita: nord in alto
    return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1);
  }).join(' ');
}

function renderRouteSVG(route) {
  if (!route || route.length<2) return '<div class="ad-nodata">Nessun dato GPS</div>';
  var W=260,H=150;
  var d=buildRoutePath(route,W,H,10);
  if (!d) return '<div class="ad-nodata">Nessun dato GPS</div>';
  var start=d.split(' ').slice(0,2).join(' ').replace('M','');
  var sp=start.split(' ');
  var lastM=d.lastIndexOf('L'); var end=d.slice(lastM+1).trim().split(' ');
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block;">'+
    '<path d="'+d+'" fill="none" stroke="#e8ff47" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>'+
    '<circle cx="'+sp[0]+'" cy="'+sp[1]+'" r="3.5" fill="#22d46a"/>'+
    '<circle cx="'+end[0]+'" cy="'+end[1]+'" r="3.5" fill="#ff4d4d"/>'+
  '</svg>';
}

function renderElevSVG(elev, distM) {
  if (!elev || elev.length<2) return '<div class="ad-nodata">Nessun dato altimetrico</div>';
  var W=260,H=90,pad=4;
  var minE=Math.min.apply(null,elev), maxE=Math.max.apply(null,elev);
  var span=(maxE-minE)||1;
  var pts=elev.map(function(e,i){
    var x=pad+(i/(elev.length-1))*(W-2*pad);
    var y=H-pad-((e-minE)/span)*(H-2*pad-8);
    return x.toFixed(1)+' '+y.toFixed(1);
  });
  var area='M'+pts[0]+' L'+pts.join(' L')+' L'+(W-pad)+' '+(H-pad)+' L'+pad+' '+(H-pad)+' Z';
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block;">'+
    '<path d="'+area+'" fill="rgba(59,130,246,.18)" stroke="none"/>'+
    '<polyline points="'+pts.join(' ')+'" fill="none" stroke="#3b82f6" stroke-width="1.6"/>'+
    '<text x="'+pad+'" y="10" fill="#4a5168" font-size="8">'+Math.round(maxE)+'m</text>'+
    '<text x="'+pad+'" y="'+(H-1)+'" fill="#4a5168" font-size="8">'+Math.round(minE)+'m</text>'+
  '</svg>';
}

function renderBestEffortsHTML(bests) {
  if (!bests || !bests.length) return '<div class="ad-nodata">Nessun dato di potenza</div>';
  return '<div class="ad-bests">'+bests.map(function(b){
    var pct = FTP ? Math.round(b.watts/FTP*100) : null;
    return '<div class="ad-best"><div class="ad-best-w">'+b.watts+'<span>W</span></div>'+
           '<div class="ad-best-d">'+fmtSecs(b.secs)+(pct?' · '+pct+'%':'')+'</div></div>';
  }).join('')+'</div>';
}

async function loadActivityDetail(icuId, domId) {
  if (activityDetailLoading[icuId]) return;
  var target=document.getElementById(domId);
  if (!target) return;
  if (activityDetailCache[icuId]) { target.innerHTML=renderDetailPanel(activityDetailCache[icuId]); return; }
  activityDetailLoading[icuId]=true;
  target.innerHTML='<div class="ad-loading">Caricamento dettagli…</div>';
  try {
    var s = await fetchICUActivityStreams(icuId, ['time','watts','altitude','distance','latlng']);
    var latlng = s.latlng || null;
    var alt = s.altitude || null;
    var watts = s.watts || null;
    var detail = {
      route: latlng ? downsample(latlng, 180) : null,
      elev: alt ? downsample(alt, 140) : null,
      bests: watts ? bestMeanPowers(watts, [5,15,30,60,300,600,1200]) : null,
      kj: watts ? Math.round(watts.reduce(function(a,b){return a+(b||0);},0)/1000) : null
    };
    activityDetailCache[icuId]=detail;
    saveDetailCache();
    target.innerHTML=renderDetailPanel(detail);
  } catch(e) {
    target.innerHTML='<div class="ad-nodata">Dettagli non disponibili: '+e.message+'</div>';
    console.warn('Dettaglio attività '+icuId+':', e);
  }
  activityDetailLoading[icuId]=false;
}

function renderDetailPanel(d) {
  return '<div class="ad-grid">'+
    '<div class="ad-box"><div class="ad-lbl">Percorso</div>'+renderRouteSVG(d.route)+'</div>'+
    '<div class="ad-box"><div class="ad-lbl">Altimetria</div>'+renderElevSVG(d.elev)+'</div>'+
    '<div class="ad-box"><div class="ad-lbl">Best effort'+(d.kj?' · '+d.kj+' kJ totali':'')+'</div>'+renderBestEffortsHTML(d.bests)+'</div>'+
  '</div>';
}

/* Persistenza dei soli riassunti derivati (piccoli), non degli stream. */
var DETAIL_CACHE_KEY='ctg_detail_cache_v1';
function saveDetailCache() {
  try {
    var keys=Object.keys(activityDetailCache).slice(-40); // tiene gli ultimi 40
    var trimmed={}; keys.forEach(function(k){trimmed[k]=activityDetailCache[k];});
    localStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(trimmed));
  } catch(e) { /* quota: si continua senza cache persistente */ }
}
function loadDetailCache() {
  try {
    var raw=localStorage.getItem(DETAIL_CACHE_KEY);
    if (raw) activityDetailCache=JSON.parse(raw)||{};
  } catch(e) { activityDetailCache={}; }
}
