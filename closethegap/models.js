/* ============================================================
   MODELS.JS
   Modelli avanzati stile Golden Cheetah/WKO: Critical Power, Power
   Duration Model (PDM), Efficiency Factor, Variability Index,
   W'bal (Skiba differential), Banister TRIMP Impulse-Response,
   Decoupling aerobico (Pw:Hr).

   NOTA IMPORTANTE SUI DATI DISPONIBILI:
   W'bal e Decoupling "veri" richiedono lo stream secondo-per-secondo
   di potenza/FC di UNA singola uscita (non solo il riepilogo). Questo
   dataset arriva da Strava via MCP (get_activity_streams) e per ora è
   stato pre-calcolato solo per le uscite chiave marcate con
   `stream_wbal_min_kj` / `stream_decoupling_pct` in config.js (vedi
   README per la lista). Per TUTTE le altre attività questi due modelli
   usano un'approssimazione a livello di sessione (basata su TSS/VI),
   volutamente meno precisa ma sempre disponibile offline.
   Se in futuro costruisci un Cloudflare Worker con OAuth Strava
   (STRAVA_WORKER in config.js), le funzioni "FromStream" qui sotto
   sono già pronte per essere chiamate live su ogni sincronizzazione.
   ============================================================ */

/* ---------- Critical Power / W' (modello Monod-Scherrer / Morton 2-param) ----------
   Fit lineare di (watts*secs) vs secs sugli sforzi nel range standard
   3-20 minuti (protocollo CP classico). Usare l'intera curva fino a 1h,
   come nella build precedente, sottostima CP (contaminato da pacing/
   decoupling aerobico sui sforzi lunghi) - qui viene evitato. */
function cpModel() {
  var STANDARD_LO = 165, STANDARD_HI = 1260; // 2:45 - 21min
  var pts = bestEfforts.filter(function(e){return e.secs>=STANDARD_LO && e.secs<=STANDARD_HI;});
  if (pts.length < 2) pts = bestEfforts.filter(function(e){return e.secs>=120 && e.secs<=3600;});
  var n=pts.length;
  var xs=pts.map(function(e){return e.secs;});
  var ys=pts.map(function(e){return e.watts*e.secs;});
  var sx=xs.reduce(function(a,b){return a+b;},0);
  var sy=ys.reduce(function(a,b){return a+b;},0);
  var sxx=xs.reduce(function(a,b){return a+b*b;},0);
  var sxy=xs.reduce(function(a,v,i){return a+v*ys[i];},0);
  var CP=Math.round((n*sxy-sx*sy)/(n*sxx-sx*sx));
  var Wp=Math.round((sy-CP*sx)/n);
  return {CP:CP, Wp:Wp, fitPoints:pts.length};
}

/* ---------- Power Duration Model (PDM) esteso ----------
   Combina CP/W' (fatica/soglia) con Pmax (potenza neuromuscolare di
   picco, dal miglior 5s) per un modello a 3 parametri simile a quello
   di Golden Cheetah. FTP stimato come blend Morton(CP) / 95% del 20min,
   coerente con l'osservazione che gare vicine a FTP sono un buon segnale. */
function pdmModel() {
  var cp=cpModel();
  var CP=cp.CP, Wp=cp.Wp;
  var pmaxEff = bestEfforts.reduce(function(best,e){return e.secs<=15&&e.watts>(best?best.watts:0)?e:best;}, null);
  var Pmax = pmaxEff ? pmaxEff.watts : bestEfforts[0].watts;
  var ftpMorton=Math.round(CP+Wp/3600);
  var p20=bestEfforts.find(function(e){return e.label==='20min';});
  var ftp20=p20?Math.round(p20.watts*0.95):ftpMorton;
  var ftpEst=Math.round(ftpMorton*0.6+ftp20*0.4);
  return {CP:CP, Wp:Wp, Pmax:Pmax, ftpMorton:ftpMorton, ftp20:ftp20, ftpEst:ftpEst};
}
/* Curva del modello P(t): sotto ~30s è vincolata verso Pmax (capacità
   neuromuscolare), altrove segue l'iperbole CP + W'/t. */
function pdmCurve(t, CP, Wp, Pmax) {
  var hyperbolic = CP + Wp/t;
  if (t<=30) return Math.min(Pmax, hyperbolic*1.4);
  return Math.round(hyperbolic);
}

/* ---------- Efficiency Factor & Variability Index ---------- */
function efSeries(acts, n) {
  var f=[].concat(acts).filter(function(a){return a.np&&a.hr&&a.dur>2400;}).sort(function(a,b){return a.date.localeCompare(b.date);}).slice(-(n||20));
  return f.map(function(a){return {date:a.date, ef:parseFloat((a.np/a.hr).toFixed(3))};});
}
function viSeries(acts, n) {
  var f=[].concat(acts).filter(function(a){return a.np&&a.avg_watts&&a.dur>2400;}).sort(function(a,b){return a.date.localeCompare(b.date);}).slice(-(n||20));
  return f.map(function(a){return {date:a.date, vi:parseFloat((a.np/a.avg_watts).toFixed(3))};});
}

/* ---------- W'bal ---------- */
/* Modello differenziale di Skiba (2012): sopra CP la riserva W' si
   consuma linearmente; sotto CP recupera con costante di tempo tau
   che dipende da quanto siamo sotto CP (recupero più lento vicino a CP,
   più rapido a bassa intensità). Richiede lo stream secondo-per-secondo. */
function computeWbalFromStream(timeArr, wattsArr, CP, WpJ) {
  var wbal = WpJ, minWbal = WpJ, history = [];
  for (var i=1; i<timeArr.length; i++) {
    var dt = timeArr[i]-timeArr[i-1];
    if (dt<=0) continue;
    if (dt>60) dt=60; // pause/gap nel GPS: non farla contare come recupero abnorme
    var p = wattsArr[i]||0;
    if (p>CP) {
      wbal -= (p-CP)*dt;
    } else {
      var dcp = CP-p;
      var tau = 546*Math.exp(-0.01*dcp)+316;
      wbal = WpJ - (WpJ-wbal)*Math.exp(-dt/tau);
    }
    wbal = Math.max(0, Math.min(WpJ, wbal));
    minWbal = Math.min(minWbal, wbal);
    history.push(wbal);
  }
  return {minWbalKJ: parseFloat((minWbal/1000).toFixed(2)), endWbalKJ: parseFloat(((history.length?history[history.length-1]:WpJ)/1000).toFixed(2)), history:history};
}
/* Approssimazione a livello di sessione, usata quando non abbiamo lo
   stream reale: stima quanto W' viene intaccato da un TSS elevato e
   quanto si ricarica tra le uscite. Meno precisa ma sempre disponibile. */
function wbalSessionApprox(sortedActs, WpJ) {
  var wbal=WpJ, out=[];
  sortedActs.forEach(function(a){
    var tss=calcTSS(a);
    var depletion = tss>80 ? (tss-80)*150 : 0;
    var recovery = Math.min(WpJ*0.15, WpJ-wbal);
    wbal = Math.max(0, Math.min(WpJ, wbal+recovery-depletion));
    out.push({date:a.date, wbalKJ:Math.round(wbal/1000*10)/10, real:false});
  });
  return out;
}
/* Combina: per le attività che hanno uno stream reale pre-calcolato
   (config.js) usa quel valore; per le altre usa l'approssimazione. */
function buildWbalTimeline() {
  var cp=cpModel(); var WpJ=cp.Wp*1000/1000; // Wp è già in Joule (watts*sec)
  var sorted=[].concat(activities).sort(function(a,b){return a.date.localeCompare(b.date);}).slice(-15);
  var approx = wbalSessionApprox(sorted, cp.Wp);
  return approx.map(function(row,i){
    var a=sorted[i];
    if (a.stream_wbal_end_kj!=null) return {date:a.date, wbalKJ:a.stream_wbal_end_kj, real:true, minKJ:a.stream_wbal_min_kj};
    return row;
  });
}

/* ---------- Decoupling (Pw:Hr) ---------- */
/* Vero: split dello stream a metà tempo, rapporto potenza/FC nella prima
   metà vs seconda metà. >5% = drift cardiaco/fatica significativa. */
function computeDecouplingFromStream(timeArr, wattsArr, hrArr) {
  var totT = timeArr[timeArr.length-1]-timeArr[0];
  var halfT = timeArr[0] + totT/2;
  var splitIdx = timeArr.findIndex(function(t){return t>=halfT;});
  if (splitIdx<=0) return null;
  function avg(arr){ var v=arr.filter(function(x){return x;}); return v.length?v.reduce(function(a,b){return a+b;},0)/v.length:0; }
  var p1=avg(wattsArr.slice(0,splitIdx)), h1=avg(hrArr.slice(0,splitIdx));
  var p2=avg(wattsArr.slice(splitIdx)), h2=avg(hrArr.slice(splitIdx));
  if (!h1||!h2||!p1||!p2) return null;
  var r1=p1/h1, r2=p2/h2;
  return parseFloat(((r1-r2)/r1*100).toFixed(1));
}
/* Approssimazione a livello di sessione (VI + durata) per le attività
   senza stream reale - come nella build precedente. */
function decoupleSessionApprox(a) {
  var vi=a.np/a.avg_watts, durH=a.dur/3600;
  return Math.max(0, Math.min(parseFloat(((vi-1)*15+(durH-1)*1.5).toFixed(1)), 15));
}
function buildDecoupleTimeline() {
  var acts=[].concat(activities).filter(function(a){return (a.np&&a.avg_watts&&a.dur>3600)||a.stream_decoupling_pct!=null;})
    .sort(function(a,b){return a.date.localeCompare(b.date);}).slice(-15);
  return acts.map(function(a){
    if (a.stream_decoupling_pct!=null) return {date:a.date,name:a.name,pct:a.stream_decoupling_pct,real:true};
    return {date:a.date,name:a.name,pct:decoupleSessionApprox(a),real:false};
  });
}

/* ---------- Banister Impulse-Response (TRIMP-based) ----------
   Modello ORIGINALE di Banister: usa il TRIMP giornaliero calcolato
   dalla frequenza cardiaca (non dal TSS/potenza, che è già usato nel
   PMC) per dare una seconda stima, indipendente, di fitness/fatica.
   TRIMP = durata(min) * HRr * 0.64 * e^(1.92*HRr)   [costanti per uomini]
   dove HRr = (HRmedia - HRriposo) / (HRmax - HRriposo). */
var HR_REST = 48;
function calcTRIMP(a) {
  if (!a.hr) return 0;
  var hrr = (a.hr-HR_REST)/(HR_MAX-HR_REST);
  if (hrr<=0) return 0;
  var durMin = a.dur/60;
  return durMin * hrr * 0.64 * Math.exp(1.92*hrr);
}
function computeBanister() {
  var sorted=[].concat(activities).sort(function(a,b){return a.date.localeCompare(b.date);});
  if (!sorted.length) return {fitness:0,fatigue:0,perf:0,history:[]};
  var start=new Date(sorted[0].date), end=new Date();
  var fit=0, fat=0, pf=0, pa=0, history=[];
  var k1=1.0, k2=1.85; // pesi standard letteratura Banister (fatica decade più in fretta ma pesa di più)
  for (var d=new Date(start); d<=end; d.setDate(d.getDate()+1)) {
    var ds=dateKey(d);
    var trimp=activities.filter(function(a){return a.date===ds;}).reduce(function(s,a){return s+calcTRIMP(a);},0);
    fit=parseFloat((fit+(trimp-fit)/42).toFixed(2));
    fat=parseFloat((fat+(trimp-fat)/7).toFixed(2));
    var perf=parseFloat((k1*pf-k2*pa).toFixed(1));
    history.push({date:ds, fitness:fit, fatigue:fat, perf:perf, trimp:trimp});
    pf=fit; pa=fat;
  }
  return {fitness:fit, fatigue:fat, perf:parseFloat((k1*fit-k2*fat).toFixed(1)), history:history};
}
/* Proiezione del piano futuro usando il TSS pianificato come proxy del
   TRIMP atteso (non abbiamo la FC target per le sessioni pianificate). */
function projectBanister(days) {
  var b=computeBanister();
  if (!b.history.length) return {dates:[],perf:[],peakDate:null,peakVal:0};
  var k1=1.0, k2=1.85;
  var fit=b.fitness, fat=b.fatigue;
  var dates=[], perf=[];
  for (var i=1;i<=days;i++) {
    var d=new Date(); d.setDate(d.getDate()+i);
    var ds=dateKey(d);
    var ps=plan.find(function(p){return p.date===ds;});
    var proxyTrimp = ps ? ps.tss*0.9 : 0; // stima approssimativa TRIMP dal TSS pianificato
    fit=parseFloat((fit+(proxyTrimp-fit)/42).toFixed(2));
    fat=parseFloat((fat+(proxyTrimp-fat)/7).toFixed(2));
    dates.push(ds.slice(5));
    perf.push(parseFloat((k1*fit-k2*fat).toFixed(1)));
  }
  var peakVal=Math.max.apply(null, perf);
  var peakIdx=perf.indexOf(peakVal);
  return {dates:dates, perf:perf, peakDate:dates[peakIdx], peakVal:peakVal};
}
