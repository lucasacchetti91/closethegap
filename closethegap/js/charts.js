/* ============================================================
   CHARTS.JS
   Wrapper Chart.js + tutti i render per la tab Analisi & Power.
   Dipende da config.js, metrics.js, models.js.
   ============================================================ */

function mkChart(id,type,data,extra) {
  if (charts[id]) charts[id].destroy();
  var ctx=document.getElementById(id); if(!ctx) return;
  var opts={responsive:true,maintainAspectRatio:false,
    plugins:{legend:{labels:{color:'#8b92a8',font:{size:9},boxWidth:10}}},
    scales:type==='doughnut'||type==='pie'?{}:{
      x:{ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.03)'}},
      y:{ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}
    }
  };
  if (extra) Object.assign(opts, extra);
  charts[id]=new Chart(ctx,{type:type,data:data,options:opts});
}

function recalcAll() {
  FTP=parseInt(document.getElementById('ftp-inp').value)||340;
  LTHR=parseInt(document.getElementById('lthr-inp').value)||180;
  HR_MAX=parseInt(document.getElementById('hrmax-inp').value)||197;
  var hrRestEl=document.getElementById('hrrest-inp');
  if (hrRestEl) HR_REST=parseInt(hrRestEl.value)||48;
  document.getElementById('k-ftp').textContent=FTP+'W';
  document.getElementById('pz-label').textContent=FTP+'W';
  document.getElementById('lthr-label').textContent=LTHR;
  renderAnalytics();
}

/* I grafici di recupero vivono ora nella sezione Fitness: tenerli qui
   li faceva ridisegnare anche quando non erano visibili, e mescolava
   due domande diverse (quanto carico metto dentro / come sto
   rispondendo). */
/* Navigazione a chip in Analisi & Power: mostra solo i blocchi del
   gruppo scelto. I contenitori di primo livello hanno data-group;
   quelli senza restano sempre visibili (diagnostica, intestazioni). */
function filterAnalytics(group, btn) {
  var page = document.getElementById('page-analytics');
  if (!page) return;
  page.querySelectorAll('[data-group]').forEach(function(el){
    if (el.closest('.chips')) return; // i chip stessi non si nascondono
    el.style.display = (group === 'all' || el.dataset.group === group) ? '' : 'none';
  });
  var chips = document.querySelectorAll('#analytics-chips .chip');
  for (var i=0;i<chips.length;i++) chips[i].classList.toggle('active', chips[i] === btn);
  // i grafici nascosti non si ridimensionano: li ridisegniamo alla riapertura
  if (typeof renderAnalytics === 'function') { try { renderAnalytics(); } catch(e){} }
  window.scrollTo(0, 0);
}

function renderFitness() {
  try { renderWellness(); } catch(e) { console.warn('wellness:',e.message); }
  try { renderLoadCharts(); } catch(e) { console.warn('carico:',e.message); }
}

function renderAnalytics() {
  var pmc=computePMC();
  var srcEl=document.getElementById('pmc-source');
  if (srcEl) {
    srcEl.textContent = pmc.source === 'intervals.icu' ? '(valori di Intervals.icu)'
      : pmc.source === 'misto' ? '(' + pmc.nativeDays + 'gg da Intervals.icu, il resto calcolato)'
      : '(calcolo locale: sincronizza per allinearlo a Intervals.icu)';
  }
  var h=pmc.history.slice(-120);
  mkChart('ch-pmc','line',{labels:h.map(function(d){return d.date.slice(5);}),datasets:[
    {label:'CTL',data:h.map(function(d){return d.ctl;}),borderColor:'#3b82f6',tension:.4,pointRadius:0,fill:false,borderWidth:1.5},
    {label:'ATL',data:h.map(function(d){return d.atl;}),borderColor:'#ff4d4d',tension:.4,pointRadius:0,fill:false,borderWidth:1.5},
    {label:'TSB',data:h.map(function(d){return d.tsb;}),borderColor:'#e8ff47',tension:.4,pointRadius:0,fill:false,borderWidth:1.5}
  ]});
  /* Km e ore della STAGIONE corrente: tutti i mesi da novembre a
     ottobre, anche quelli ancora vuoti, cosi' la timeline resta
     leggibile e si vede a che punto si e' arrivati. */
  var curSeason = seasonOf(today());
  var sbnd = seasonBounds(curSeason);
  var mm={}, hm={}, monthKeys=[];
  var cursor = new Date(sbnd.from + 'T12:00'), lastM = new Date(sbnd.to + 'T12:00');
  while (cursor <= lastM) {
    var mkey = cursor.getFullYear() + '-' + String(cursor.getMonth()+1).padStart(2,'0');
    monthKeys.push(mkey); mm[mkey]=0; hm[mkey]=0;
    cursor.setMonth(cursor.getMonth()+1);
  }
  activities.forEach(function(a){
    var m=a.date.slice(0,7);
    if (mm[m] !== undefined) { mm[m]+=(a.dist||0); hm[m]+=(a.dur||0); }
  });
  var MONTH_IT=['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
  var monthLabels = monthKeys.map(function(k){ return MONTH_IT[parseInt(k.slice(5),10)-1]; });
  var volAxis = {
    x:{ticks:{color:'#5d657c',font:{size:11}},grid:{display:false}},
    y:{ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.03)'},beginAtZero:true}
  };
  mkChart('ch-km','bar',{labels:monthLabels,datasets:[
    {label:'Km '+seasonLabel(curSeason),data:monthKeys.map(function(k){return Math.round(mm[k]/1000);}),
     backgroundColor:'rgba(34,212,106,.45)',borderColor:'#22d46a',borderWidth:1,borderRadius:3}
  ]},{scales:volAxis});
  mkChart('ch-hours','bar',{labels:monthLabels,datasets:[
    {label:'Ore '+seasonLabel(curSeason),data:monthKeys.map(function(k){return parseFloat((hm[k]/3600).toFixed(1));}),
     backgroundColor:'rgba(59,130,246,.45)',borderColor:'#3b82f6',borderWidth:1,borderRadius:3}
  ]},{scales:volAxis});
  /* Durate richieste per i riquadri accanto alla curva. Si cerca la
     corrispondenza per SECONDI, non per etichetta: le etichette
     cambiano a seconda della sorgente (curva ICU o valori locali). */
  /* Best effort su DUE colonne: stagione in corso e record assoluti.
     Il confronto serve a distinguere "e' il mio massimo di quest'anno"
     da "e' il mio massimo di sempre": senza, un valore basso puo'
     significare sia un calo di forma sia semplicemente che quello
     sforzo quest'anno non l'hai ancora fatto. */
  var wantSecs = [1, 30, 60, 180, 300, 600, 1200];
  function findBE(list, sec) {
    if (!list || !list.length) return null;
    var e = list.reduce(function(b,x){
      return (!b || Math.abs(x.secs-sec) < Math.abs(b.secs-sec)) ? x : b;
    }, null);
    return (e && Math.abs(e.secs-sec) <= Math.max(1, sec*0.15)) ? e : null;
  }
  var seasonList = (typeof bestEffortsSeason !== 'undefined') ? bestEffortsSeason : null;
  var allList = (typeof bestEffortsAllTime !== 'undefined' && bestEffortsAllTime) ? bestEffortsAllTime : bestEfforts;

  var beRows = wantSecs.map(function(sec){
    var eS = findBE(seasonList, sec), eA = findBE(allList, sec);
    if (!eS && !eA) return '';
    var lbl = sec<60 ? sec+'s' : (sec/60)+'min';
    function cell(e, isSeason) {
      if (!e) return '<div class="be-cell"><div class="be-w" style="color:var(--tx3);">—</div></div>';
      // record di stagione che eguaglia l'assoluto: massimo di sempre fatto quest'anno
      var isPB = isSeason && eA && e.watts >= eA.watts;
      return '<div class="be-cell"'+(isPB?' style="outline:1px solid var(--acc);"':'')+'>'+
        '<div class="be-w"'+(isPB?' style="color:var(--acc);"':'')+'>'+e.watts+'</div>'+
        '<div class="be-sub">'+Math.round(e.watts/FTP*100)+'%</div></div>';
    }
    return '<div class="be-row"><span class="be-dur">'+lbl+'</span>'+cell(eS,true)+cell(eA,false)+'</div>';
  }).join('');

  var beHtml = beRows
    ? '<div class="be-row" style="padding-bottom:2px;"><span></span>'+
      '<div class="be-col-head">Stagione</div><div class="be-col-head">Sempre</div></div>' + beRows +
      (seasonList ? '' : '<div style="font-size:.55rem;color:var(--tx3);margin-top:6px;line-height:1.4;">'+
        'La colonna di stagione compare dopo un "Sync metriche avanzate ICU".</div>')
    : '';
  document.getElementById('power-kpis').innerHTML = beHtml ||
    '<div class="pk"><div class="pkl">Nessuna curva di potenza: premi "Sync metriche avanzate ICU".</div></div>';
  /* Due curve: stagione contro record assoluti. La distanza fra le due
     dice a colpo d'occhio su quali durate sei sotto il tuo massimo. */
  var pcSecs = (allList||bestEfforts).map(function(e){return e.secs;});
  mkChart('ch-pc','line',{datasets:[
    {label:'Record assoluti',data:(allList||bestEfforts).map(function(e){return {x:e.secs,y:e.watts};}),
     borderColor:'rgba(139,146,168,.85)',backgroundColor:'rgba(139,146,168,.06)',tension:.35,
     pointRadius:2,pointBackgroundColor:'#8b92a8',fill:true,borderWidth:1.5},
    (seasonList ? {label:'Stagione '+seasonLabel(seasonOf(today())),
      data:seasonList.map(function(e){return {x:e.secs,y:e.watts};}),
      borderColor:'#e8ff47',backgroundColor:'rgba(232,255,71,.10)',tension:.35,
      pointRadius:3,pointBackgroundColor:'#e8ff47',fill:true,borderWidth:2}
     : {label:'Stagione (sincronizza per vederla)',data:[],borderColor:'transparent',pointRadius:0}),
    {label:'CP '+FTP+'W',data:[{x:1,y:FTP},{x:3600,y:FTP}],
     borderColor:'rgba(59,130,246,.4)',borderDash:[4,4],pointRadius:0,borderWidth:1}
  ]},{
    plugins:{tooltip:{callbacks:{label:function(c){ return fmtSecs(c.parsed.x)+' · '+Math.round(c.parsed.y)+'W'; }}}},
    scales:{
      x:{type:'logarithmic',min:1,max:3600,
         title:{display:true,text:'Durata (scala logaritmica)',color:'#5d657c',font:{size:11}},
         ticks:{color:'#5d657c',font:{size:11},callback:function(v){
           return [1,5,15,30,60,300,600,1200,3600].indexOf(v)>=0 ? fmtSecs(v) : ''; }},
         grid:{color:'rgba(255,255,255,.03)'}},
      y:{title:{display:true,text:'Potenza (W)',color:'#5d657c',font:{size:11}},
         ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}
    }
  });
  document.getElementById('pz-label').textContent=FTP+'W';
  var zoneColors={1:'#4a5168',2:'#22d46a',3:'#fbbf24',4:'#f97316',5:'#ff4d4d',6:'#a78bfa',7:'#ec4899'};
  var PZ=computePowerZones().map(function(z){return {n:z.label,lo:z.lo,hi:z.hi,c:zoneColors[z.z]};});
  document.getElementById('power-zones').innerHTML=PZ.map(function(z){
    return '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--br);">'+
      '<div style="width:8px;height:8px;border-radius:50%;background:'+z.c+';flex-shrink:0;"></div>'+
      '<div style="font-size:.7rem;flex:1;color:var(--tx2);">'+z.n+'</div>'+
      '<div style="font-size:.7rem;font-weight:600;">'+z.lo+'–'+z.hi+'W</div></div>';
  }).join('');
  var ww=[].concat(activities).filter(function(a){return a.avg_watts;}).sort(function(a,b){return a.date.localeCompare(b.date);}).slice(-20);
  mkChart('ch-watts','bar',{labels:ww.map(function(a){return a.date.slice(5);}),datasets:[
    {label:'W medi',data:ww.map(function(a){return a.avg_watts;}),backgroundColor:'rgba(232,255,71,.5)',borderColor:'#e8ff47',borderWidth:1,borderRadius:3},
    {label:'FTP',data:ww.map(function(){return FTP;}),type:'line',borderColor:'rgba(59,130,246,.4)',borderDash:[4,4],pointRadius:0,borderWidth:1}
  ]});
  try { renderHeatmap(); } catch(e) { console.warn('heatmap:',e.message); }
  try { renderZoneDist(); } catch(e) { console.warn('zonedist:',e.message); }
  try { renderScatter(); } catch(e) { console.warn('scatter:',e.message); }
  try { renderCPModel(); } catch(e) { console.warn('cpmodel:',e.message); }
  try { renderPDM(); } catch(e) { console.warn('pdm:',e.message); }
  try { renderEF(); } catch(e) { console.warn('ef:',e.message); }
  try { renderVI(); } catch(e) { console.warn('vi:',e.message); }
  try { renderWbal(); } catch(e) { console.warn('wbal:',e.message); }
  try { renderBanister(); } catch(e) { console.warn('banister:',e.message); }
  try { renderDecouple(); } catch(e) { console.warn('decouple:',e.message); }
  try { renderSeasons(); } catch(e) { console.warn('stagioni:',e.message); }
  try { renderFTPProjection(); } catch(e) { console.warn('ftpproj:',e.message); }
  try { renderPMCProjection(); } catch(e) { console.warn('pmcproj:',e.message); }

}

function renderHeatmap() {
  var end=new Date(), start=new Date(end); start.setFullYear(end.getFullYear()-1);
  var cur=new Date(start); while(cur.getDay()!==1) cur.setDate(cur.getDate()-1);
  var tssMap={};
  activities.forEach(function(a){tssMap[a.date]=(tssMap[a.date]||0)+calcTSS(a);});
  var cols=[], col=[], mCols=[], lastM=-1, ci=0;
  while(cur<=end){
    var ds=dateKey(cur); var tss=tssMap[ds]||0;
    var lvl=tss===0?0:tss<50?1:tss<100?2:tss<150?3:4;
    col.push({ds:ds,lvl:lvl,tss:tss});
    var mo=cur.getMonth();
    if(mo!==lastM){mCols.push({idx:ci,label:cur.toLocaleDateString('it',{month:'short'})});lastM=mo;}
    cur.setDate(cur.getDate()+1);
    if(cur.getDay()===1){cols.push(col);col=[];ci++;}
  }
  if(col.length) cols.push(col);
  var HC=['var(--s3)','rgba(232,255,71,.15)','rgba(232,255,71,.35)','rgba(232,255,71,.6)','var(--acc)'];
  var html='<div style="display:flex;gap:2px;">';
  cols.forEach(function(column,cIdx){
    var ml=mCols.find(function(m){return m.idx===cIdx;});
    html+='<div style="display:flex;flex-direction:column;gap:2px;min-width:11px;">';
    html+='<div style="font-size:.5rem;color:var(--tx3);height:10px;white-space:nowrap;">'+(ml?ml.label:'')+'</div>';
    for(var day=0;day<7;day++){
      if(column[day]) html+='<div style="width:11px;height:11px;border-radius:2px;background:'+HC[column[day].lvl]+'" title="'+column[day].ds+': '+column[day].tss+' TSS"></div>';
      else html+='<div style="width:11px;height:11px;"></div>';
    }
    html+='</div>';
  });
  document.getElementById('hm-wrap').innerHTML=html+'</div>';
}

/* ============================================================
   DISTRIBUZIONE ZONE
   BUG CORRETTO: la versione precedente classificava OGNI USCITA in base
   alla sua potenza MEDIA e poi sommava l'INTERA durata dell'uscita in
   quell'unica zona. Non era affatto una distribuzione del tempo in zona:
   una gran fondo di 4h con media 234W finiva 100% in Z2 anche se dentro
   c'erano 40' sopra soglia. Per questo i numeri sembravano sbagliati -
   lo erano.

   Ora, se Intervals.icu ha fornito i tempi per zona calcolati sullo
   stream reale (icu_zone_times), si usano quelli: è la distribuzione
   vera. Altrimenti si ricade sul vecchio metodo, ma etichettato per
   quello che è ("per potenza media"), senza spacciarlo per tempo in zona.
   ============================================================ */
function renderZoneDist() {
  var pzC=['#4a5168','#22d46a','#fbbf24','#f97316','#ff4d4d','#a78bfa','#ec4899','#f472b6'];

  /* BUG CORRETTO: Intervals.icu restituisce 8 valori per le zone di
     potenza e 7 per quelle cardiache, mentre il modello interno ne ha 7
     e 5. Prima i due array venivano mappati per indice, quindi i tempi
     finivano nelle zone sbagliate. Ora si disegnano tante barre quante
     ne fornisce ICU, con le etichette prese dalle TUE impostazioni ICU
     quando disponibili (vedi syncICUZoneDefs). */
  function renderSide(kind, elId, noteId, nativeField, localZones, refLabel) {
    var withNative = activities.filter(function(a){ return a[nativeField] && a[nativeField].length; });
    var sums, labels, mode;
    if (withNative.length) {
      mode='native';
      var n = Math.max.apply(null, withNative.map(function(a){return a[nativeField].length;}));
      sums = new Array(n).fill(0);
      withNative.forEach(function(a){
        a[nativeField].forEach(function(secs,i){ if(i<n) sums[i]+=(secs||0); });
      });
      labels = zoneLabelsFor(n, kind);
    } else {
      mode='approx';
      sums = new Array(localZones.length).fill(0);
      var bounds = localZones.map(function(z){return z.lo;}).concat([Infinity]);
      var field = kind==='power' ? 'avg_watts' : 'hr';
      activities.filter(function(a){return a[field];}).forEach(function(a){
        for (var i=0;i<localZones.length;i++){
          if (a[field]>=bounds[i] && a[field]<bounds[i+1]) { sums[i]+=a.dur; break; }
        }
      });
      labels = localZones.map(function(z,i){
        return {name:'Z'+(i+1), range:z.lo+'–'+(i===localZones.length-1?'Max':z.hi)+(kind==='power'?'W':'bpm')};
      });
    }
    var tot = Math.max(sums.reduce(function(s,v){return s+v;},0), 1);
    document.getElementById(elId).innerHTML = labels.map(function(l,i){
      var pct = Math.round((sums[i]||0)/tot*100);
      var c = pzC[i % pzC.length];
      return '<div class="zbar"><span class="zbar-lbl" style="color:'+c+';">'+l.name+(l.range?' '+l.range:'')+
             '</span><div class="zbar-track"><div class="zbar-fill" style="width:'+pct+'%;background:'+c+'"></div></div>'+
             '<span class="zbar-pct">'+pct+'%</span></div>';
    }).join('');
    var note = document.getElementById(noteId);
    if (note) {
      var txt = mode==='native'
        ? 'Tempo reale in zona da Intervals.icu ('+withNative.length+' uscite, '+sums.length+' zone).'
          + (ICU_ZONE_DEFS && ICU_ZONE_DEFS[kind] ? '' : ' Intervalli non mostrati: le definizioni delle tue zone ICU non sono state lette — premi "Sync metriche avanzate ICU".')
        : 'Stima per '+refLabel+' dell\'uscita — non è il tempo reale in zona. Premi "Sync metriche avanzate ICU".';
      note.innerHTML = txt;
    }
    return mode;
  }

  renderSide('power','zone-dist-power','zone-dist-power-note','icu_zone_times', computePowerZones(), 'potenza media');
  document.getElementById('lthr-label').textContent = LTHR;
  renderSide('hr','zone-dist-hr','lthr-estimate-note-inner','icu_hr_zone_times', computeHRZones(LTHR), 'FC media');

  /* Suggerimento LTHR: mostrato, mai applicato in automatico. */
  var lthrEst = estimateLTHRFromHistory();
  var el = document.getElementById('lthr-estimate-note');
  if (el) {
    var inner = document.getElementById('lthr-estimate-note-inner');
    var base = inner ? inner.innerHTML : '';
    el.innerHTML = '<div id="lthr-estimate-note-inner">'+base+'</div>' +
      (lthrEst ? '<div style="margin-top:6px;">Indicazione dai dati: la FC media più alta in uno sforzo duro è <strong>'+lthrEst.lthr+'bpm</strong> ('+lthrEst.date+'). '+
        'È un limite INFERIORE, non la tua LTHR: la media di un\'uscita include riscaldamento e recuperi. In uso ora: '+LTHR+'bpm — impostala a mano dopo un test dedicato.</div>' : '');
  }
}

function renderScatter() {
  /* BUG CORRETTO: prima si usava `calcIF(a)||0.65`, cioè per ogni uscita
     SENZA misuratore di potenza veniva inventato un IF di 0.65 e il punto
     veniva disegnato lo stesso. Il grafico mostrava quindi una colonna
     verticale di punti fittizi a IF 0.65 che non corrispondevano a nulla.
     Ora entrano solo le uscite con un IF realmente calcolabile.
     Corretto anche il clipping degli assi (min 0.4 / max 1.3 tagliava
     fuori le uscite vere agli estremi) e il tooltip, che indicizzava
     `pts` anche per le due linee di riferimento. */
  var pts=activities.filter(function(a){ return calcTSS(a)>10 && calcIF(a)!=null; })
    .map(function(a){ return {x:calcIF(a), y:calcTSS(a), name:a.name, date:a.date, isRace:a.isRace}; });
  if (!pts.length) return;
  var colors=pts.map(function(p){
    return p.isRace?'rgba(167,139,250,.85)':p.y>150&&p.x>0.75?'rgba(255,77,77,.75)':p.y>150?'rgba(34,212,106,.75)':p.x>0.75?'rgba(249,115,22,.75)':'rgba(59,130,246,.65)';
  });
  var maxIF=Math.max.apply(null,pts.map(function(p){return p.x;}));
  var minIF=Math.min.apply(null,pts.map(function(p){return p.x;}));
  var maxTSS=Math.max.apply(null,pts.map(function(p){return p.y;}));
  var xLo=Math.min(0.45, Math.floor(minIF*20)/20), xHi=Math.max(1.05, Math.ceil(maxIF*20)/20);
  var yHi=Math.ceil(maxTSS/50)*50;
  mkChart('ch-scatter','scatter',{datasets:[
    {label:'Attività ('+pts.length+' con dati di potenza)',data:pts.map(function(p){return{x:p.x,y:p.y};}),backgroundColor:colors,pointRadius:5,pointHoverRadius:7},
    {label:'IF=0.75',type:'line',data:[{x:0.75,y:0},{x:0.75,y:yHi}],borderColor:'rgba(255,255,255,.10)',borderDash:[3,3],pointRadius:0,borderWidth:1},
    {label:'TSS=150',type:'line',data:[{x:xLo,y:150},{x:xHi,y:150}],borderColor:'rgba(255,255,255,.10)',borderDash:[3,3],pointRadius:0,borderWidth:1}
  ]},{
    plugins:{tooltip:{callbacks:{label:function(c){
      if (c.datasetIndex!==0) return null; // le linee di riferimento non hanno un'attività associata
      var p=pts[c.dataIndex];
      return p ? p.date+' · '+p.name.substring(0,20)+' · IF '+c.parsed.x.toFixed(2)+' · TSS '+Math.round(c.parsed.y) : '';
    }}}},
    scales:{
      x:{min:xLo,max:xHi,title:{display:true,text:'Intensity Factor',color:'#5d657c',font:{size:9}},ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.03)'}},
      y:{min:0,max:yHi,title:{display:true,text:'TSS',color:'#5d657c',font:{size:9}},ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}
    }
  });
}

function renderCPModel() {
  var cp=cpModel();
  var CP=cp.CP, Wp=cp.Wp;
  document.getElementById('cp-val').textContent=CP+'W'+(cp.native?' ●':'');
  document.getElementById('wp-val').textContent=Math.round(Wp/1000)+'kJ';
  document.getElementById('pmax-val').textContent=(cp.Pmax?Math.round(cp.Pmax):bestEfforts[0].watts)+'W';
  var srcLabel = cp.model==='morton3p'
    ? "Modello Morton 3P (● nativo Intervals.icu: CP "+cp.CP+"W, W' "+(cp.Wp/1000).toFixed(1)+"kJ, Pmax "+cp.Pmax+"W)"
    : cp.native
      ? "Modello CP (CP nativo ICU, W' da fit locale — Pmax non disponibile)"
      : "Modello CP (fit locale su "+cp.fitPoints+" punti 3-20min)";

  /* FIX 1 — il modello iperbolico CP + W'/t è valido solo nella finestra
     ~2-30 minuti. Estrapolarlo a 5 secondi è matematicamente lecito ma
     fisiologicamente assurdo: con W' nativo ICU dava CP + W'/5 ≈ 8000W.
     Ora la curva del modello parte da 120s e si ferma a 3600s, cioè dove
     il modello ha senso. Fuori da quella finestra restano solo i best
     effort reali, senza curva inventata.
     FIX 2 — prima i best effort erano un array di 11 valori disegnato
     contro 15 etichette di durata: ogni punto finiva sulla durata
     sbagliata (il tuo 1min a 460W appariva a "30s"). Ora entrambi i
     dataset usano coordinate {x,y} reali su asse logaritmico. */
  /* Con Morton a 3 parametri il modello resta valido anche sulle durate
     brevi (tende a Pmax, non a infinito), quindi la curva può coprire
     tutto l'intervallo. Con la sola iperbole a 2 parametri restiamo
     invece nella finestra 2-60min, dove il modello ha senso: fuori di lì
     produceva valori assurdi (fino a ~8000W a 5 secondi). */
  var isMorton = cp.model==='morton3p';
  var MODEL_LO = isMorton ? 5 : 120, MODEL_HI = 3600;
  var tModel=[5,10,15,20,30,45,60,90,120,150,180,240,300,420,600,900,1200,1800,2400,3000,3600];
  var modelPts = tModel.filter(function(t){return t>=MODEL_LO && t<=MODEL_HI;})
                       .map(function(t){ return {x:t, y:predictedPower(t, cp)}; });
  var effortPts = bestEfforts.map(function(e){ return {x:e.secs, y:e.watts}; });

  mkChart('ch-cp','line',{datasets:[
    {label:'Best Effort '+(typeof BEST_EFFORTS_SOURCE!=='undefined'&&BEST_EFFORTS_SOURCE==='icu'?'(curva reale ICU)':'(valori statici NON verificati)'),data:effortPts,type:'scatter',backgroundColor:'#e8ff47',pointRadius:5,pointHoverRadius:7,showLine:false},
    {label:srcLabel,data:modelPts,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,.07)',tension:.3,pointRadius:0,fill:true,borderWidth:1.5},
    {label:'CP '+CP+'W',data:[{x:MODEL_LO,y:CP},{x:MODEL_HI,y:CP}],borderColor:'rgba(34,212,106,.45)',borderDash:[5,4],pointRadius:0,borderWidth:1},
    {label:'FTP '+FTP+'W',data:[{x:5,y:FTP},{x:3600,y:FTP}],borderColor:'rgba(232,255,71,.4)',borderDash:[4,4],pointRadius:0,borderWidth:1}
  ]},{
    plugins:{tooltip:{callbacks:{label:function(c){ return fmtSecs(c.parsed.x)+' · '+Math.round(c.parsed.y)+'W'; }}}},
    scales:{
      x:{type:'logarithmic',min:5,max:3600,
         title:{display:true,text:'Durata (scala logaritmica)',color:'#5d657c',font:{size:9}},
         ticks:{color:'#5d657c',font:{size:11},callback:function(v){
           var allowed=[5,15,30,60,300,600,1200,1800,3600];
           return allowed.indexOf(v)>=0 ? fmtSecs(v) : '';
         }},
         grid:{color:'rgba(255,255,255,.03)'}},
      y:{title:{display:true,text:'Potenza (W)',color:'#5d657c',font:{size:9}},
         ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}
    }
  });
}

function fmtSecs(s) {
  if (s<60) return s+'s';
  if (s<3600) return Math.round(s/60)+'min';
  return Math.round(s/3600*10)/10+'h';
}

function renderPDM() {
  var m=pdmModel();
  var gap=360-m.ftpEst;
  var weeksNeeded=gap>0?Math.ceil(gap/1.5):0;
  var daysNeeded=weeksNeeded*7;
  document.getElementById('pdm-ftp').textContent=m.ftpEst+'W';
  document.getElementById('pdm-cp').textContent=m.CP+'W';
  document.getElementById('pdm-eta').textContent=gap>0?daysNeeded+'gg':'Raggiunto';
  document.getElementById('pdm-note').textContent='FTP stimato: '+m.ftpEst+'W (Morton: '+m.ftpMorton+'W · 95% 20min: '+m.ftp20+'W · Pmax neuromuscolare: '+m.Pmax+'W). Gap: '+gap+'W. '+
    (gap>0?'Al ritmo ~1.5W/sett servono '+weeksNeeded+' sett. '+(daysNeeded<=59?'Obiettivo 19 set raggiungibile!':'Accelerare il carico.'):'Obiettivo 360W raggiunto!');
  var tPts=[5,15,30,60,120,180,300,480,600,900,1200,1800,2700,3600,5400,7200];
  var projCP=Math.round(m.CP*(360/Math.max(m.ftpEst,1)));
  var projWp=Math.round(m.Wp*1.05);
  /* Stessa correzione del grafico CP: coordinate {x,y} reali su asse
     logaritmico, invece di due array di lunghezza diversa allineati per
     indice (che spostava ogni best effort sulla durata sbagliata). */
  mkChart('ch-pdm','line',{datasets:[
      {label:'Best Effort '+(typeof BEST_EFFORTS_SOURCE!=='undefined'&&BEST_EFFORTS_SOURCE==='icu'?'(curva reale ICU)':'(valori statici NON verificati)'),data:bestEfforts.filter(function(e){return e.secs<=7200;}).map(function(e){return {x:e.secs,y:e.watts};}),type:'scatter',backgroundColor:'#e8ff47',pointRadius:6,showLine:false},
      {label:'Modello attuale (FTP est. '+m.ftpEst+'W)',data:tPts.map(function(t){return {x:t,y:Math.max(pdmCurve(t,m.CP,m.Wp,m.Pmax),0)};}),borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,.07)',tension:.3,pointRadius:0,fill:true,borderWidth:1.5},
      {label:'Obiettivo 360W FTP',data:tPts.map(function(t){return {x:t,y:Math.max(pdmCurve(t,projCP,projWp,m.Pmax),0)};}),borderColor:'rgba(232,255,71,.5)',borderDash:[5,4],pointRadius:0,fill:false,borderWidth:1.5},
      {label:'FTP corrente '+FTP+'W',data:[{x:5,y:FTP},{x:7200,y:FTP}],borderColor:'rgba(249,115,22,.4)',borderDash:[3,3],pointRadius:0,borderWidth:1}
  ]},{
    plugins:{tooltip:{callbacks:{label:function(c){ return fmtSecs(c.parsed.x)+' · '+Math.round(c.parsed.y)+'W'; }}}},
    scales:{
      x:{type:'logarithmic',min:5,max:7200,
         title:{display:true,text:'Durata (scala logaritmica)',color:'#5d657c',font:{size:9}},
         ticks:{color:'#5d657c',font:{size:11},callback:function(v){
           var allowed=[5,15,30,60,300,600,1200,1800,3600,7200];
           return allowed.indexOf(v)>=0 ? fmtSecs(v) : '';
         }},
         grid:{color:'rgba(255,255,255,.03)'}},
      y:{title:{display:true,text:'Potenza (W)',color:'#5d657c',font:{size:9}},
         ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}
    }
  });
}

function renderEF() {
  var series=efSeries(activities,90); // 90 giorni
  if(!series.length) return;
  mkChart('ch-ef','line',{
    labels:series.map(function(s){return s.date.slice(5)+(s.native?' ●':'');}),
    datasets:[{label:'EF (NP/HR, ● = nativo Intervals.icu)',data:series.map(function(s){return s.ef;}),borderColor:'#22d46a',backgroundColor:'rgba(34,212,106,.1)',tension:.3,pointRadius:series.map(function(s){return s.native?4:3;}),pointBackgroundColor:'#22d46a',fill:true,borderWidth:1.5}]
  },{scales:{x:{ticks:{color:'#5d657c',font:{size:10},maxTicksLimit:14,autoSkip:true},grid:{display:false}},y:{ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}}});
}

function renderVI() {
  var series=viSeries(activities,90); // 90 giorni
  if(!series.length) return;
  var colors=series.map(function(s){return s.vi<1.05?'rgba(34,212,106,.7)':s.vi<1.10?'rgba(251,191,36,.7)':s.vi<1.15?'rgba(249,115,22,.7)':'rgba(255,77,77,.7)';});
  mkChart('ch-vi','bar',{
    labels:series.map(function(s){return s.date.slice(5)+(s.native?' ●':'');}),
    datasets:[
      {label:'VI',data:series.map(function(s){return s.vi;}),backgroundColor:colors,borderRadius:3,borderWidth:0},
      {label:'1.05',data:series.map(function(){return 1.05;}),type:'line',borderColor:'rgba(34,212,106,.4)',borderDash:[3,3],pointRadius:0,borderWidth:1},
      {label:'1.15',data:series.map(function(){return 1.15;}),type:'line',borderColor:'rgba(255,77,77,.4)',borderDash:[3,3],pointRadius:0,borderWidth:1}
    ]
  },{scales:{x:{ticks:{color:'#5d657c',font:{size:10},maxTicksLimit:14,autoSkip:true},grid:{display:false}},y:{ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}}});
}

function renderWbal() {
  var cp=cpModel();
  var WpkJ=Math.round(cp.Wp/1000);
  var timeline=buildWbalTimeline();
  if(!timeline.length) return;
  var curr=timeline[timeline.length-1].wbalKJ;
  var col=curr/WpkJ>0.7?'#22d46a':'#ff4d4d';
  var nativeCount=timeline.filter(function(t){return t.source==='icu-native';}).length;
  var streamCount=timeline.filter(function(t){return t.source==='strava-stream';}).length;
  document.getElementById('wbal-kpis').innerHTML=
    '<div class="pk"><div class="pkv">'+cp.CP+'W</div><div class="pkl">CP'+(cp.native?' (nativo)':'')+'</div></div>'+
    '<div class="pk"><div class="pkv">'+WpkJ+'kJ</div><div class="pkl">W\' totale</div></div>'+
    '<div class="pk"><div class="pkv" style="color:'+col+';">'+curr+'kJ</div><div class="pkl">W\' attuale'+(nativeCount?' ('+nativeCount+' native ICU'+(streamCount?', '+streamCount+' stream Strava':'')+')':'')+'</div></div>';
  mkChart('ch-wbal','line',{
    labels:timeline.map(function(w){return w.date.slice(5)+(w.source==='icu-native'?' ●':w.source==='strava-stream'?' ○':'');}),
    datasets:[
      {label:"W' balance (kJ) — ● nativo ICU · ○ stream Strava · senza simbolo = stima",data:timeline.map(function(w){return w.wbalKJ;}),borderColor:'#a78bfa',backgroundColor:'rgba(167,139,250,.1)',tension:.4,pointRadius:timeline.map(function(w){return w.source==='icu-native'?6:w.source==='strava-stream'?5:2;}),pointBackgroundColor:timeline.map(function(w){return w.source==='icu-native'?'#22d46a':w.source==='strava-stream'?'#e8ff47':'#a78bfa';}),fill:true,borderWidth:1.5},
      {label:"W' totale "+WpkJ+"kJ",data:timeline.map(function(){return WpkJ;}),borderColor:'rgba(232,255,71,.3)',borderDash:[4,3],pointRadius:0,borderWidth:1}
    ]
  });
}

function renderBanister() {
  var b=computeBanister();
  var h=b.history.slice(-90);
  if(!h.length) return;
  var proj=projectBanister(30);
  document.getElementById('banister-kpis').innerHTML=
    '<div class="pk"><div class="pkv">'+(h.length?h[h.length-1].perf:0)+'</div><div class="pkl">Form attuale (TRIMP)</div></div>'+
    '<div class="pk"><div class="pkv" style="color:#22d46a;">'+Math.round(proj.peakVal)+'</div><div class="pkl">Peak previsto</div></div>'+
    '<div class="pk"><div class="pkv">'+(proj.peakDate||'—')+'</div><div class="pkl">Data peak</div></div>';
  mkChart('ch-banister','line',{
    labels:h.map(function(d){return d.date.slice(5);}).concat(proj.dates),
    datasets:[
      {label:'Performance TRIMP (reale)',data:h.map(function(d){return d.perf;}).concat(new Array(proj.dates.length).fill(null)),borderColor:'#3b82f6',tension:.4,pointRadius:0,fill:false,borderWidth:1.5},
      {label:'Proiezione piano',data:new Array(h.length).fill(null).concat(proj.perf),borderColor:'#e8ff47',borderDash:[4,3],tension:.4,pointRadius:0,fill:false,borderWidth:1.5}
    ]
  });
}

/* ============================================================
   PROIEZIONE VERSO L'OBIETTIVO
   Due grafici che rispondono a "a che punto sono e dove arrivo se
   seguo il piano":
   1. Progressione FTP/eFTP storica + proiezione lineare al 19 set,
      confrontata con la retta necessaria per arrivare a 360W.
   2. Proiezione CTL/ATL/TSB fino al giorno gara usando il TSS
      PIANIFICATO, per verificare di arrivare con la forma giusta.
   ============================================================ */

/* Serie storica di eFTP: usa le stime di CP nel tempo ricavate dai
   migliori 20' rolling in finestre di 6 settimane. È una stima, non un
   test FTP: serve a vedere la TENDENZA, non il valore assoluto. */
/* Progressione della soglia nel tempo.
   FONTE CORRETTA: l'eFTP giornaliera calcolata da Intervals.icu, che
   deriva dai tuoi migliori sforzi reali. Una versione precedente di
   questa funzione stimava la FTP dal miglior NP di un'uscita ×0.95, ma
   è sbagliato: l'NP di un lungo aerobico di 4h sta molto sotto la
   soglia, e infatti restituiva ~265W contro i 340W reali. Se l'eFTP
   nativa non è disponibile è più onesto non disegnare nulla che
   disegnare una curva falsa. */
function ftpHistory() {
  if (typeof wellness === 'undefined' || !wellness.length) return [];
  var pts = wellness.filter(function(w){ return w.eftp && w.eftp>100; })
    .map(function(w){ return {date:String(w.date), ftp:Math.round(w.eftp)}; });
  // un punto a settimana, per non affollare il grafico
  var out=[], lastKept=null;
  pts.forEach(function(p){
    if (!lastKept || (new Date(p.date)-new Date(lastKept))/86400000 >= 7) { out.push(p); lastKept=p.date; }
  });
  if (out.length && pts.length && out[out.length-1].date !== pts[pts.length-1].date) out.push(pts[pts.length-1]);
  return out;
}

function renderFTPProjection() {
  var hist=ftpHistory();
  var el=document.getElementById('ftp-proj-note');
  if (hist.length<2) {
    if(el) el.innerHTML='Non ci sono ancora abbastanza punti di eFTP da Intervals.icu per tracciare una tendenza affidabile.<br>'+
      '<span style="color:var(--tx3);font-size:.9em;">Premi "Sync metriche avanzate ICU": la progressione usa l\'eFTP che Intervals.icu calcola dai tuoi sforzi reali. '+
      'Ho volutamente evitato di stimarla dall\'NP delle uscite, perché su un lungo aerobico l\'NP sta molto sotto soglia e produrrebbe una curva falsa.</span>';
    return;
  }

  // Regressione lineare sugli ultimi 12 punti (≈3 mesi)
  var recent=hist.slice(-12);
  var n=recent.length;
  var t0=new Date(recent[0].date).getTime();
  var xs=recent.map(function(p){return (new Date(p.date).getTime()-t0)/86400000;});
  var ys=recent.map(function(p){return p.ftp;});
  var sx=xs.reduce(function(a,b){return a+b;},0), sy=ys.reduce(function(a,b){return a+b;},0);
  var sxx=xs.reduce(function(a,b){return a+b*b;},0);
  var sxy=xs.reduce(function(a,v,i){return a+v*ys[i];},0);
  var slope=(n*sxy-sx*sy)/(n*sxx-sx*sx||1); // W/giorno
  var intercept=(sy-slope*sx)/n;

  var todayX=(new Date().getTime()-t0)/86400000;
  var goalX=(new Date(GOAL_DATE+'T12:00').getTime()-t0)/86400000;
  var daysToGoal=Math.round(goalX-todayX);
  var currentFTP=hist[hist.length-1].ftp;
  var projectedAtGoal=Math.round(intercept+slope*goalX);
  var neededSlope=daysToGoal>0 ? (GOAL_FTP-currentFTP)/daysToGoal : 0;

  // Serie per il grafico: storico + proiezione settimanale fino alla gara
  var labels=hist.map(function(p){return p.date.slice(5);});
  var histData=hist.map(function(p){return p.ftp;});
  var projLabels=[], projData=[], needData=[];
  for (var dd=7; dd<=daysToGoal; dd+=7) {
    var dt=new Date(); dt.setDate(dt.getDate()+dd);
    projLabels.push(dateKey(dt).slice(5));
    projData.push(Math.round(intercept+slope*((dt.getTime()-t0)/86400000)));
    needData.push(Math.round(currentFTP+neededSlope*dd));
  }
  mkChart('ch-ftp-proj','line',{
    labels:labels.concat(projLabels),
    datasets:[
      {label:'eFTP (storico Intervals.icu)',data:histData.concat(new Array(projLabels.length).fill(null)),borderColor:'#e8ff47',backgroundColor:'rgba(232,255,71,.08)',tension:.3,pointRadius:2,fill:true,borderWidth:1.5},
      {label:'Proiezione al ritmo attuale',data:new Array(histData.length).fill(null).concat(projData),borderColor:'#3b82f6',borderDash:[5,4],tension:.3,pointRadius:0,borderWidth:1.5},
      {label:'Ritmo necessario per 360W',data:new Array(histData.length).fill(null).concat(needData),borderColor:'#a78bfa',borderDash:[2,3],tension:.3,pointRadius:0,borderWidth:1.5},
      {label:'Obiettivo 360W',data:labels.concat(projLabels).map(function(){return GOAL_FTP;}),borderColor:'rgba(34,212,106,.35)',pointRadius:0,borderWidth:1}
    ]
  });

  if (el) {
    var gap=GOAL_FTP-currentFTP;
    var wPerWeek=Math.round(slope*7*10)/10;
    var verdict = projectedAtGoal>=GOAL_FTP
      ? '<span style="color:var(--grn);">Al ritmo attuale arrivi a ~'+projectedAtGoal+'W: obiettivo raggiungibile.</span>'
      : '<span style="color:var(--yel);">Al ritmo attuale arrivi a ~'+projectedAtGoal+'W, cioè '+(GOAL_FTP-projectedAtGoal)+'W sotto. Servirebbero '+(Math.round(neededSlope*7*10)/10)+'W/settimana invece degli attuali '+wPerWeek+'W/settimana.</span>';
    el.innerHTML='FTP stimata oggi: <strong>'+currentFTP+'W</strong> · gap: <strong>'+gap+'W</strong> · '+daysToGoal+' giorni alla gara.<br>'+verdict+
      '<br><span style="color:var(--tx3);font-size:.9em;">Serie basata sull\'eFTP calcolata da Intervals.icu dai tuoi sforzi reali. La proiezione è una regressione lineare: non tiene conto del fatto che i guadagni rallentano avvicinandosi al proprio tetto fisiologico, quindi tende a essere ottimista sul lungo periodo.</span>';
  }
}

/* Proiezione PMC fino al giorno gara con il TSS del piano: serve a
   verificare di arrivare con un TSB nella finestra di forma (+5/+25). */
function renderPMCProjection() {
  var pmc=computePMC();
  var hist=pmc.history.slice(-60);
  if (!hist.length) return;
  var ctl=pmc.ctl, atl=pmc.atl, pc=ctl, pa=atl;
  var labels=hist.map(function(d){return d.date.slice(5);});
  var ctlS=hist.map(function(d){return d.ctl;});
  var atlS=hist.map(function(d){return d.atl;});
  var tsbS=hist.map(function(d){return d.tsb;});
  var pLab=[], pCtl=[], pAtl=[], pTsb=[];
  var d=new Date(), goal=new Date(GOAL_DATE+'T12:00');
  while (d<goal) {
    d.setDate(d.getDate()+1);
    var ds=dateKey(d);
    var s=plan.find(function(p){return p.date===ds;});
    var tss=s?s.tss:0;
    var tsb=parseFloat((pc-pa).toFixed(1));
    ctl=parseFloat((ctl+(tss-ctl)/42).toFixed(2));
    atl=parseFloat((atl+(tss-atl)/7).toFixed(2));
    pLab.push(ds.slice(5)); pCtl.push(Math.round(ctl)); pAtl.push(Math.round(atl)); pTsb.push(Math.round(tsb));
    pc=ctl; pa=atl;
  }
  var pad=new Array(hist.length).fill(null);
  mkChart('ch-pmc-proj','line',{
    labels:labels.concat(pLab),
    datasets:[
      {label:'CTL',data:ctlS.concat(pad.length?[]:[]).concat(new Array(pLab.length).fill(null)),borderColor:'#3b82f6',tension:.4,pointRadius:0,borderWidth:1.5},
      {label:'CTL proiettata',data:pad.concat(pCtl),borderColor:'rgba(59,130,246,.5)',borderDash:[4,3],tension:.4,pointRadius:0,borderWidth:1.5},
      {label:'TSB',data:tsbS.concat(new Array(pLab.length).fill(null)),borderColor:'#e8ff47',tension:.4,pointRadius:0,borderWidth:1.5},
      {label:'TSB proiettato',data:pad.concat(pTsb),borderColor:'rgba(232,255,71,.5)',borderDash:[4,3],tension:.4,pointRadius:0,borderWidth:1.5}
    ]
  });
  var el=document.getElementById('pmc-proj-note');
  if (el) {
    var tsbAtGoal=pTsb.length?pTsb[pTsb.length-1]:null;
    var ctlAtGoal=pCtl.length?pCtl[pCtl.length-1]:null;
    var ok = tsbAtGoal!=null && tsbAtGoal>=5 && tsbAtGoal<=25;
    el.innerHTML='Il giorno gara arriveresti con <strong>CTL '+ctlAtGoal+'</strong> e <strong>TSB '+(tsbAtGoal>0?'+':'')+tsbAtGoal+'</strong>. '+
      (ok ? '<span style="color:var(--grn);">Nella finestra di forma tipica (+5/+25).</span>'
          : tsbAtGoal<5 ? '<span style="color:var(--yel);">Sotto la finestra di forma: rischi di arrivare stanco, valuta uno scarico più marcato.</span>'
                        : '<span style="color:var(--yel);">Sopra la finestra: rischi di arrivare troppo scarico, il taper potrebbe essere eccessivo.</span>')+
      '<br><span style="color:var(--tx3);font-size:.9em;">Assume che tu segua il piano esattamente: è uno scenario, non una previsione.</span>';
  }
}

function renderDecouple() {
  var timeline=buildDecoupleTimeline();
  if(!timeline.length) return;
  var colors=timeline.map(function(d){return d.pct<3?'rgba(34,212,106,.7)':d.pct<5?'rgba(251,191,36,.7)':d.pct<8?'rgba(249,115,22,.7)':'rgba(255,77,77,.7)';});
  mkChart('ch-decouple','bar',{
    labels:timeline.map(function(d){return d.date.slice(5)+' '+d.name.substring(0,8)+(d.source==='icu-native'?' ●':d.source==='strava-stream'?' ○':'');}),
    datasets:[
      {label:'Decoupling % (● = nativo Intervals.icu · ○ = stream Strava)',data:timeline.map(function(d){return d.pct;}),backgroundColor:colors,borderRadius:3,borderWidth:0},
      {label:'Soglia 5%',data:timeline.map(function(){return 5;}),type:'line',borderColor:'rgba(255,77,77,.4)',borderDash:[3,3],pointRadius:0,borderWidth:1}
    ]
  },{scales:{x:{ticks:{color:'#5d657c',font:{size:10},maxTicksLimit:14,autoSkip:true},grid:{display:false}},y:{ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}}});
}


/* ============================================================
   CONFRONTO FRA STAGIONI
   ============================================================ */
function renderSeasons() {
  var el = document.getElementById('seasons-render');
  if (!el) return;
  if (typeof recordCompletedFormats === 'function') recordCompletedFormats();
  var seasons = allSeasonSummaries();

  if (seasons.length < 1) { el.innerHTML = '<div class="empty">Nessun dato stagionale.</div>'; return; }

  var cols = ['Stagione','Uscite','Ore','Km','Dislivello','TSS','TSS/sett','eFTP inizio','eFTP picco','Var.','Z1-2'];
  var html = '<div class="card"><div class="ct">Confronto stagioni</div>' +
    '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:.68rem;">' +
    '<thead><tr>' + cols.map(function(c){
      return '<th style="text-align:left;padding:6px 8px;color:var(--tx3);font-weight:500;font-size:.58rem;' +
             'text-transform:uppercase;border-bottom:1px solid var(--br2);white-space:nowrap;">' + c + '</th>';
    }).join('') + '</tr></thead><tbody>';

  seasons.forEach(function(s){
    var gainCol = s.eftpGain == null ? 'var(--tx3)' : s.eftpGain > 0 ? 'var(--grn)' : 'var(--red)';
    html += '<tr>' +
      '<td style="padding:7px 8px;font-weight:700;border-bottom:1px solid var(--br);">' + s.label +
        (s.complete ? '' : ' <span style="color:var(--acc);font-size:.85em;">in corso</span>') + '</td>' +
      '<td style="padding:7px 8px;border-bottom:1px solid var(--br);">' + s.rides + (s.races ? ' <span style="color:var(--pur);">('+s.races+' gare)</span>' : '') + '</td>' +
      '<td style="padding:7px 8px;border-bottom:1px solid var(--br);">' + s.hours + '</td>' +
      '<td style="padding:7px 8px;border-bottom:1px solid var(--br);">' + s.km.toLocaleString('it') + '</td>' +
      '<td style="padding:7px 8px;border-bottom:1px solid var(--br);">' + Math.round(s.elevM/1000) + 'k</td>' +
      '<td style="padding:7px 8px;border-bottom:1px solid var(--br);">' + s.tss.toLocaleString('it') + '</td>' +
      '<td style="padding:7px 8px;border-bottom:1px solid var(--br);">' + s.tssPerWeek + '</td>' +
      '<td style="padding:7px 8px;border-bottom:1px solid var(--br);">' + (s.eftpStart || '—') + '</td>' +
      '<td style="padding:7px 8px;border-bottom:1px solid var(--br);font-weight:600;">' + (s.eftpPeak || '—') + '</td>' +
      '<td style="padding:7px 8px;border-bottom:1px solid var(--br);color:' + gainCol + ';font-weight:600;">' +
        (s.eftpGain == null ? '—' : (s.eftpGain > 0 ? '+' : '') + s.eftpGain + 'W') + '</td>' +
      '<td style="padding:7px 8px;border-bottom:1px solid var(--br);">' +
        (s.polarization ? s.polarization.lowPct + '%' : '<span style="color:var(--tx3);">n/d</span>') + '</td>' +
    '</tr>';
  });
  html += '</tbody></table></div>';

  var incomplete = seasons.filter(function(s){ return !s.polarization; });
  if (incomplete.length) {
    html += '<div style="font-size:.6rem;color:var(--tx3);margin-top:9px;line-height:1.5;">' +
      'La distribuzione Z1-2 richiede il tempo-in-zona nativo di Intervals.icu, disponibile solo per le uscite ' +
      'sincronizzate con le metriche avanzate. Per ' + incomplete.map(function(s){return s.label;}).join(', ') +
      ' non c\'è copertura sufficiente e il valore non viene stimato.</div>';
  }
  html += '</div>';

  el.innerHTML = html;
}
