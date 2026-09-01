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
  if (!isFinite(minX)||!isFinite(minY)) return null;
  var spanX=maxX-minX||1e-6, spanY=maxY-minY||1e-6;
  var scale=Math.min((w-2*pad)/spanX, (h-2*pad)/spanY);
  var offX=(w-spanX*scale)/2, offY=(h-spanY*scale)/2;
  var screen = pts.map(function(p){
    return [ (p[0]-minX)*scale+offX, h-((p[1]-minY)*scale+offY) ]; // y invertita: nord in alto
  });
  var d = screen.map(function(p,i){ return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1); }).join(' ');
  return { d:d, start:screen[0], end:screen[screen.length-1] };
}

function renderRouteSVG(route) {
  if (!route || route.length<2) return '<div class="ad-nodata">Nessun dato GPS</div>';
  var W=260,H=150;
  var p=buildRoutePath(route,W,H,10);
  if (!p) return '<div class="ad-nodata">Coordinate GPS non valide</div>';
  return '<svg viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block;">'+
    '<path d="'+p.d+'" fill="none" stroke="#e8ff47" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>'+
    '<circle cx="'+p.start[0].toFixed(1)+'" cy="'+p.start[1].toFixed(1)+'" r="3.5" fill="#22d46a"/>'+
    '<circle cx="'+p.end[0].toFixed(1)+'" cy="'+p.end[1].toFixed(1)+'" r="3.5" fill="#ff4d4d"/>'+
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

/* Normalizza le coordinate in un array pulito di [lat, lng].

   PERCHÉ È NECESSARIO: la versione precedente dava per scontato che
   `latlng` fosse sempre un array di coppie [lat,lng] in stile Strava.
   Intervals.icu può però restituire le coordinate in forme diverse
   (oggetti {lat,lng}, due stream separati lat/lng, o un array piatto),
   e in più i tracciati contengono buchi GPS con valori null: bastava
   un null per far diventare NaN l'intero calcolo dei limiti della
   mappa e quindi non disegnare nulla.
   Qui si accettano tutte le forme e si scartano i punti non validi. */
var latlngLayoutDetected = null; // diagnostica: come sono state accoppiate le coordinate
var latlngRejectReason = null;   // se il risultato è stato scartato, perché

/* Un array PIATTO di coordinate può essere impacchettato in due modi:
     A) interleaved  [lat0,lng0, lat1,lng1, ...]
     B) concatenato  [lat0..latN, lng0..lngN]
   Accoppiare (i, i+1) è corretto solo nel caso A. Nel caso B si
   accoppierebbe latitudine con latitudine, producendo una mappa
   plausibile a vista ma completamente inventata.

   Invece di indovinare con una euristica statistica, qui si COSTRUISCONO
   entrambe le ipotesi e si tiene quella geograficamente sensata. Una
   traccia GPS vera ha: latitudini tutte simili fra loro, longitudini
   tutte simili fra loro, e i due gruppi ben separati (in Italia ~45 vs
   ~9). Se NESSUNA delle due ipotesi soddisfa questi criteri, non si
   disegna nulla: meglio "nessun dato GPS" di un percorso falso. */
function scoreCoordPairing(pts) {
  if (!pts || pts.length < 10) return -1;
  var lats = pts.map(function(p){return p[0];}).filter(isFinite);
  var lngs = pts.map(function(p){return p[1];}).filter(isFinite);
  if (!lats.length || !lngs.length) return -1;
  var latMin=Math.min.apply(null,lats), latMax=Math.max.apply(null,lats);
  var lngMin=Math.min.apply(null,lngs), lngMax=Math.max.apply(null,lngs);
  if (latMax>90 || latMin<-90 || lngMax>180 || lngMin<-180) return -1;
  var latSpread=latMax-latMin, lngSpread=lngMax-lngMin;
  // Un'uscita in bici non copre più di ~3 gradi
  if (latSpread>3 || lngSpread>3) return -1;

  /* CRITERIO CHIAVE — separazione contro dispersione.
     Se si spezza a metà UNA SOLA serie di latitudini, i due gruppi
     risultano adiacenti: la distanza fra loro è dello stesso ordine
     della loro dispersione interna (es. separazione 0.1° con gruppi
     larghi 0.06°). Con latitudine e longitudine vere, invece, la
     separazione è enorme rispetto alla dispersione (in Lombardia ~37°
     contro ~0.06°). Il semplice test di sovrapposizione non bastava:
     sui dati reali i due gruppi si sfioravano senza sovrapporsi, e
     l'accoppiamento sbagliato veniva accettato.
     LIMITE NOTO: una traccia reale con latitudine e longitudine molto
     simili (es. lat 45.6 / lng 45.5, in Kazakistan) verrebbe scartata.
     È un compromesso accettabile: si preferisce non mostrare la mappa
     piuttosto che mostrarne una falsa. */
  var separation = Math.abs((latMin+latMax)/2 - (lngMin+lngMax)/2);
  var maxSpread = Math.max(latSpread, lngSpread, 1e-9);
  if (separation < 5 * maxSpread) return -1;
  return separation;
}

function normalizeLatLng(streams) {
  var pts = [];
  var ll = streams.latlng || streams.latLng || streams.position;
  latlngLayoutDetected = null;
  latlngRejectReason = null;

  if (Array.isArray(ll) && ll.length) {
    /* Il formato va dedotto dal primo elemento NON NULLO, non da ll[0]:
       a inizio uscita il GPS impiega qualche secondo ad agganciare,
       quindi i primi campioni sono spesso null. */
    var probe = null;
    for (var pi=0; pi<ll.length; pi++) { if (ll[pi]!=null) { probe = ll[pi]; break; } }

    if (probe == null) {
      latlngLayoutDetected = 'empty';
    } else if (Array.isArray(probe)) {
      latlngLayoutDetected = 'pairs';
      pts = ll.filter(function(p){ return p!=null; });
    } else if (typeof probe === 'object') {
      latlngLayoutDetected = 'objects';
      pts = ll.filter(function(p){ return p!=null; }).map(function(p){
        var la = p.lat!=null?p.lat:(p.latitude!=null?p.latitude:null);
        var lo = p.lng!=null?p.lng:(p.lon!=null?p.lon:(p.longitude!=null?p.longitude:null));
        return [la, lo];
      });
    } else if (typeof probe === 'number') {
      // Costruisci entrambe le ipotesi e scegli quella plausibile
      var inter = [], conc = [];
      for (var i=0;i+1<ll.length;i+=2) inter.push([ll[i], ll[i+1]]);
      var h = Math.floor(ll.length/2);
      for (var c=0;c<h;c++) conc.push([ll[c], ll[h+c]]);
      var sInter = scoreCoordPairing(inter), sConc = scoreCoordPairing(conc);
      if (sInter < 0 && sConc < 0) {
        latlngLayoutDetected = 'flat-nessuna-ipotesi-valida';
        latlngRejectReason = 'Nessun accoppiamento produce coordinate geograficamente sensate '+
          '(latitudini e longitudini indistinguibili). Percorso non disegnato per non mostrarne uno falso.';
        pts = [];
      } else if (sConc > sInter) {
        latlngLayoutDetected = 'flat-concatenated'; pts = conc;
      } else {
        latlngLayoutDetected = 'flat-interleaved'; pts = inter;
      }
    }
  } else if (Array.isArray(streams.lat) && Array.isArray(streams.lng)) {
    latlngLayoutDetected = 'separate';
    for (var j=0;j<streams.lat.length;j++) pts.push([streams.lat[j], streams.lng[j]]);
  } else if (Array.isArray(streams.latitude) && Array.isArray(streams.longitude)) {
    latlngLayoutDetected = 'separate';
    for (var k=0;k<streams.latitude.length;k++) pts.push([streams.latitude[k], streams.longitude[k]]);
  }

  var clean = pts.filter(function(p){
    return p && p.length===2 && typeof p[0]==='number' && typeof p[1]==='number' &&
           isFinite(p[0]) && isFinite(p[1]) &&
           Math.abs(p[0])<=90 && Math.abs(p[1])<=180 &&
           !(p[0]===0 && p[1]===0);
  });

  /* Controllo finale valido per TUTTI i formati: se il risultato non è
     geograficamente sensato lo scartiamo. Vale anche per il formato a
     coppie o a oggetti, dove un ordine invertito passerebbe inosservato. */
  if (clean.length >= 10 && scoreCoordPairing(clean) < 0 && !latlngRejectReason) {
    latlngRejectReason = 'Le coordinate ottenute non sono geograficamente sensate '+
      '(latitudini e longitudini con intervalli sovrapposti). Percorso non disegnato.';
    return [];
  }
  return clean;
}

/* Trova lo stream di quota indipendentemente dal nome usato. */
function pickAltitude(streams) {
  var cands = ['altitude','elevation','fixed_altitude','alt','ele'];
  for (var i=0;i<cands.length;i++) {
    var a = streams[cands[i]];
    if (Array.isArray(a) && a.length) return a.filter(function(v){return typeof v==='number' && isFinite(v);});
  }
  return null;
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
    var route = normalizeLatLng(s);
    var alt = pickAltitude(s);
    var watts = Array.isArray(s.watts) ? s.watts : null;
    var detail = {
      route: route.length>1 ? downsample(route, 180) : null,
      routeReject: latlngRejectReason || null,
      routeLayout: latlngLayoutDetected || null,
      elev: alt ? downsample(alt, 140) : null,
      bests: watts ? bestMeanPowers(watts, [5,15,30,60,300,600,1200]) : null,
      kj: watts ? Math.round(watts.reduce(function(a,b){return a+(b||0);},0)/1000) : null,
      // se non c'è percorso, conserva cosa è arrivato per poterlo mostrare
      streamTypes: icuLastStreamShape ? icuLastStreamShape.typesReceived : null
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
  var routeHtml;
  if (d.route && d.route.length>1) {
    routeHtml = renderRouteSVG(d.route);
  } else if (d.routeReject) {
    routeHtml = '<div class="ad-nodata">Percorso non disegnato.<br>'+
      '<span style="opacity:.75;font-size:.9em;">'+d.routeReject+'</span></div>';
  } else {
    routeHtml = '<div class="ad-nodata">Nessun dato GPS in questa uscita.'+
      (d.streamTypes ? '<br><span style="opacity:.7;font-size:.9em;">Stream ricevuti: '+d.streamTypes.join(', ')+'</span>' : '')+
      '</div>';
  }
  return '<div class="ad-grid">'+
    '<div class="ad-box"><div class="ad-lbl">Percorso</div>'+routeHtml+'</div>'+
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
