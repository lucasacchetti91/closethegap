/* ============================================================
   WELLNESS.JS
   Dati di "fitness" che il Garmin manda a Intervals.icu: FC a riposo,
   HRV, sonno (durata e qualità), readiness, stress, peso.

   PERCHÉ HA SENSO AVERLI QUI (e non è solo "più numeri"):
   il PMC ragiona solo sul carico che METTI DENTRO (TSS). Non sa nulla
   di come stai RISPONDENDO a quel carico. Due settimane con lo stesso
   TSB possono essere molto diverse se in una dormi 5h e l'HRV è
   crollata. I dati di recupero chiudono il cerchio: diventano un
   controllo di sicurezza sul piano generato, non un cruscotto in più.

   ONESTÀ SULL'EVIDENZA: l'allenamento guidato da HRV ha un supporto
   scientifico discreto ma i dati sono rumorosi - una singola giornata
   storta non significa nulla, contano i trend su 7+ giorni rispetto
   alla tua baseline personale. Per questo qui NON si reagisce mai al
   valore di un singolo giorno: si confronta la media a 7 giorni con la
   baseline a 42 giorni. Inoltre il "readiness" di Garmin è un indice
   proprietario e non validato indipendentemente: usalo come indizio,
   non come verdetto.

   NOMI DEI CAMPI: come per le altre metriche native, non è certo al
   100% quali nomi usi il JSON di /wellness. Si tenta con più varianti
   e si ignora quello che non c'è. Dopo il primo sync guarda in console
   `wellnessLastRawSample`.
   ============================================================ */

var wellness = [];              // [{date, restingHR, hrv, sleepH, sleepScore, readiness, stress, weight}]
var wellnessLastRawSample = null;

function pickW(o, keys) {
  for (var i=0;i<keys.length;i++){ if (o[keys[i]]!=null) return o[keys[i]]; }
  return null;
}

async function syncWellness() {
  var td = today();
  var from = HISTORY_START; // storico completo: serve ai confronti fra stagioni
  var resp = await icuFetch('/wellness?oldest=' + from + '&newest=' + td);
  if (!resp.ok) throw new Error('Wellness HTTP ' + resp.status);
  var rows = await resp.json();
  if (!Array.isArray(rows)) throw new Error('Risposta /wellness inattesa');
  if (rows.length) wellnessLastRawSample = rows[rows.length-1];

  wellness = rows.map(function(r){
    var sleepSecs = pickW(r,['sleepSecs','sleep_secs','sleepTime']);
    /* eFTP giornaliera calcolata da Intervals.icu (dentro sportInfo):
       è la fonte corretta per la progressione della soglia nel tempo.
       Molto meglio di stimarla dall'NP delle uscite, che su un lungo
       aerobico sta ben sotto la soglia e darebbe numeri falsati. */
    var eftp=null, wPrime=null;
    if (r.sportInfo && r.sportInfo.length) {
      var ride = r.sportInfo.find(function(s){return s.type==='Ride';});
      if (ride) { eftp = ride.eftp!=null?ride.eftp:null; wPrime = ride.wPrime!=null?ride.wPrime:null; }
    }
    return {
      date: r.id || r.date,
      restingHR: pickW(r,['restingHR','resting_hr','restingHr']),
      hrv: pickW(r,['hrv','hrvSDNN','hrv_sdnn','rmssd']),
      sleepH: sleepSecs!=null ? Math.round(sleepSecs/3600*10)/10 : pickW(r,['sleepHours']),
      sleepScore: pickW(r,['sleepScore','sleep_score','sleepQuality']),
      readiness: pickW(r,['readiness','readinessScore']),
      stress: pickW(r,['stress','avgStress','stressScore']),
      weight: pickW(r,['weight']),
      /* BUG CORRETTO: vo2max e steps venivano disegnati da
         renderWellnessCharts ma non erano MAI letti qui, quindi il
         grafico del VO2max restava vuoto per costruzione. La
         diagnostica li elencava fra i campi presenti nella risposta:
         mancava solo la mappatura. */
      vo2max: pickW(r,['vo2max','vo2Max','VO2max']),
      steps: pickW(r,['steps']),
      eftp: eftp, wPrime: wPrime,
      ctl: r.ctl, atl: r.atl
    };
  }).filter(function(w){ return w.date; })
    .sort(function(a,b){ return String(a.date).localeCompare(String(b.date)); });

  // Se il peso è disponibile, tiene aggiornato il W/kg senza doverlo scrivere a mano.
  var lastW = wellness.filter(function(w){return w.weight;}).pop();
  if (lastW && lastW.weight>30 && lastW.weight<200) WEIGHT_KG = lastW.weight;

  return wellness.length;
}

function avgOf(arr, field, n) {
  var vals = arr.slice(-n).map(function(x){return x[field];}).filter(function(v){return v!=null;});
  if (!vals.length) return null;
  return vals.reduce(function(a,b){return a+b;},0)/vals.length;
}

/* Confronta la media a 7 giorni con la baseline a 42 giorni. Restituisce
   una valutazione prudente, mai basata su un singolo giorno. */
function recoveryStatus() {
  if (!wellness.length) return null;
  var out = {flags:[], score:'ok'};
  function cmp(field, label, worseWhen, unit, tolPct) {
    var recent = avgOf(wellness, field, 7), base = avgOf(wellness, field, 42);
    if (recent==null || base==null || base===0) return null;
    var deltaPct = (recent-base)/base*100;
    var bad = worseWhen==='higher' ? deltaPct > tolPct : deltaPct < -tolPct;
    return {field:field, label:label, recent:recent, base:base, deltaPct:deltaPct, bad:bad, unit:unit};
  }
  var checks = [
    cmp('restingHR','FC a riposo','higher','bpm',4),
    cmp('hrv','HRV','lower','ms',8),
    cmp('sleepH','Sonno','lower','h',10),
    cmp('readiness','Readiness','lower','',10)
  ].filter(Boolean);

  checks.forEach(function(c){ if (c.bad) out.flags.push(c); });
  out.checks = checks;
  out.score = out.flags.length>=2 ? 'alert' : out.flags.length===1 ? 'warn' : 'ok';
  return out;
}

function renderWellness() {
  var el = document.getElementById('wellness-render');
  if (!el) return;
  if (!wellness.length) {
    el.innerHTML='<div class="empty">Nessun dato di recupero. Premi "Sync metriche avanzate ICU" nella tab Analisi: se il tuo Garmin invia sonno/HRV a Intervals.icu, compariranno qui.</div>';
    return;
  }
  var rec = recoveryStatus();
  var statusCol = rec.score==='alert'?'var(--red)':rec.score==='warn'?'var(--yel)':'var(--grn)';
  var statusTxt = rec.score==='alert'?'Segnali di affaticamento':rec.score==='warn'?'Qualcosa da tenere d\'occhio':'Recupero nella norma';

  var html='<div class="card" style="border-color:'+statusCol+'44;">'+
    '<div class="ct" style="color:'+statusCol+';">'+statusTxt+'</div>'+
    '<div style="font-size:.68rem;color:var(--tx2);line-height:1.7;">';
  rec.checks.forEach(function(c){
    var arrow = c.deltaPct>0?'▲':'▼';
    var col = c.bad?'var(--red)':'var(--tx2)';
    var val = Math.round(c.recent*10)/10;
    html+='<div style="display:flex;justify-content:space-between;padding:3px 0;">'+
      '<span>'+c.label+' (media 7gg)</span>'+
      '<span style="color:'+col+';font-weight:600;">'+val+c.unit+' '+arrow+' '+Math.abs(Math.round(c.deltaPct))+'% vs baseline 42gg</span></div>';
  });
  html+='</div><div style="font-size:.6rem;color:var(--tx3);margin-top:8px;line-height:1.5;">'+
    'Confronto sempre su medie a 7 giorni: un singolo giorno storto non significa nulla. '+
    'Il readiness Garmin è un indice proprietario non validato indipendentemente — trattalo come indizio, non verdetto.'+
    '</div></div>';

  el.innerHTML=html;
  renderWellnessCharts();
}

/* Media mobile a n giorni, allineata all'array (null dove non c'e'
   abbastanza storico). Serve perche' i valori giornalieri di HRV e FC
   a riposo sono troppo rumorosi per essere letti singolarmente: conta
   il trend rispetto alla propria baseline. */
function rollingMean(arr, field, n) {
  var out = [], buf = [];
  for (var i=0;i<arr.length;i++) {
    var v = arr[i][field];
    if (v != null) buf.push(v);
    if (buf.length > n) buf.shift();
    out.push(buf.length >= Math.min(3, n) ? buf.reduce(function(a,b){return a+b;},0)/buf.length : null);
  }
  return out;
}

function renderWellnessCharts() {
  var w = wellness.slice(-183); // 6 mesi, coerente con la pagina Oggi
  var labels = w.map(function(x){return String(x.date).slice(5);});
  var axis = {
    x:{ticks:{color:'#5d657c',font:{size:10},maxTicksLimit:12,autoSkip:true},grid:{display:false}},
    y:{ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}}
  };

  /* HRV: punti giornalieri tenui + media 7gg (il segnale) + baseline 42gg
     (il riferimento). L'incrocio fra le due linee e' cio' che conta. */
  if (w.some(function(x){return x.hrv!=null;})) {
    mkChart('ch-wellness-hrv','line',{labels:labels,datasets:[
      {label:'HRV giornaliero',data:w.map(function(x){return x.hrv;}),borderColor:'rgba(34,212,106,.22)',
       pointRadius:1.5,pointBackgroundColor:'rgba(34,212,106,.35)',borderWidth:0,showLine:false,spanGaps:true},
      {label:'Media 7 giorni',data:rollingMean(w,'hrv',7),borderColor:'#22d46a',tension:.35,pointRadius:0,borderWidth:2,spanGaps:true},
      {label:'Baseline 42 giorni',data:rollingMean(w,'hrv',42),borderColor:'rgba(232,255,71,.55)',borderDash:[5,4],tension:.35,pointRadius:0,borderWidth:1.5,spanGaps:true}
    ]},{scales:axis});
  }

  /* FC a riposo: stessa logica. In salita rispetto alla baseline e'
     uno dei segnali piu' semplici di recupero incompleto. */
  if (w.some(function(x){return x.restingHR!=null;})) {
    mkChart('ch-wellness-hr','line',{labels:labels,datasets:[
      {label:'FC riposo giornaliera',data:w.map(function(x){return x.restingHR;}),borderColor:'rgba(255,77,77,.22)',
       pointRadius:1.5,pointBackgroundColor:'rgba(255,77,77,.35)',borderWidth:0,showLine:false,spanGaps:true},
      {label:'Media 7 giorni',data:rollingMean(w,'restingHR',7),borderColor:'#ff4d4d',tension:.35,pointRadius:0,borderWidth:2,spanGaps:true},
      {label:'Baseline 42 giorni',data:rollingMean(w,'restingHR',42),borderColor:'rgba(232,255,71,.55)',borderDash:[5,4],tension:.35,pointRadius:0,borderWidth:1.5,spanGaps:true}
    ]},{scales:axis});
  }

  /* Sonno: barre giornaliere + media 7gg. La media conta piu' della
     singola notte; la riga a 8h e' un riferimento, non un obbligo. */
  if (w.some(function(x){return x.sleepH!=null;})) {
    mkChart('ch-wellness-sleep','bar',{labels:labels,datasets:[
      {label:'Sonno (h)',data:w.map(function(x){return x.sleepH;}),backgroundColor:'rgba(167,139,250,.45)',borderRadius:2,borderWidth:0},
      {label:'Media 7 giorni',data:rollingMean(w,'sleepH',7),type:'line',borderColor:'#a78bfa',tension:.35,pointRadius:0,borderWidth:2,spanGaps:true},
      {label:'8h',data:w.map(function(){return 8;}),type:'line',borderColor:'rgba(232,255,71,.3)',borderDash:[4,3],pointRadius:0,borderWidth:1},
      /* sleepScore era mappato ma non usato da nessun grafico: la
         durata da sola non dice se il sonno e' stato ristoratore.
         Su asse separato perche' e' un punteggio 0-100, non ore. */
      {label:'Qualita\u2019 (0-100)',data:w.map(function(x){return x.sleepScore;}),type:'line',
       borderColor:'rgba(34,212,106,.75)',tension:.35,pointRadius:0,borderWidth:1.5,spanGaps:true,yAxisID:'y1'}
    ]},{scales:{
      x:axis.x,
      y:axis.y,
      y1:{position:'right',min:0,max:100,ticks:{color:'#5d657c',font:{size:11}},grid:{display:false}}
    }});
  }

  /* VO2max stimato dal Garmin: si muove lentamente, quindi il trend su
     mesi e' leggibile. E' una stima da FC/potenza, non un test da
     laboratorio: guarda la direzione, non il valore assoluto. */
  if (w.some(function(x){return x.vo2max!=null;})) {
    mkChart('ch-wellness-vo2','line',{labels:labels,datasets:[
      {label:'VO2max stimato (Garmin)',data:w.map(function(x){return x.vo2max;}),borderColor:'#3b82f6',
       backgroundColor:'rgba(59,130,246,.08)',tension:.35,pointRadius:0,borderWidth:2,fill:true,spanGaps:true}
    ]},{scales:axis});
  }

  /* Peso e W/kg: il peso entra direttamente nell'obiettivo, perche'
     i W/kg salgono anche calando di massa, non solo alzando la potenza. */
  if (w.some(function(x){return x.weight!=null;})) {
    var wkg = w.map(function(x){ return (x.weight && x.eftp) ? parseFloat((x.eftp/x.weight).toFixed(2)) : null; });
    mkChart('ch-wellness-weight','line',{labels:labels,datasets:[
      {label:'Peso (kg)',data:w.map(function(x){return x.weight;}),borderColor:'#fbbf24',tension:.35,pointRadius:0,borderWidth:2,spanGaps:true,yAxisID:'y'},
      {label:'W/kg (eFTP / peso)',data:wkg,borderColor:'#e8ff47',tension:.35,pointRadius:0,borderWidth:2,spanGaps:true,yAxisID:'y1'}
    ]},{scales:{
      x:axis.x,
      y:{position:'left',ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.04)'}},
      y1:{position:'right',ticks:{color:'#5d657c',font:{size:11}},grid:{display:false}}
    }});
  }
}

/* ============================================================
   METRICHE DI CARICO E RECUPERO AGGIUNTIVE
   Calcolate dai dati che gia' abbiamo (TSS giornaliero e sonno),
   senza bisogno di nuovi endpoint.
   ============================================================ */

/* ---- ACWR: rapporto fra carico acuto (7gg) e cronico (28gg) ----
   Idea di Gabbett: non conta il carico assoluto ma quanto rapidamente
   cambia. La fascia 0.8-1.3 e' quella comunemente indicata come
   "sostenibile"; sopra 1.5 il carico sta salendo molto in fretta.

   ONESTA' SULL'EVIDENZA: l'ACWR e' popolare ma metodologicamente
   contestato - Impellizzeri e altri hanno mostrato che il rapporto
   soffre di artefatti matematici (il denominatore contiene il
   numeratore) e che la relazione con gli infortuni e' piu' debole di
   quanto sostenuto all'inizio. Qui e' un indicatore di tendenza per
   accorgersi degli strappi nel carico, non una soglia da rispettare
   alla lettera. */
function computeACWR() {
  var pmc = computePMC();
  var byDate = {};
  pmc.history.forEach(function(d){ byDate[d.date] = d.tss || 0; });
  var dates = pmc.history.map(function(d){ return d.date; });
  var out = [];
  for (var i = 27; i < dates.length; i++) {
    var acute = 0, chronic = 0;
    for (var j = 0; j < 28; j++) {
      var v = byDate[dates[i-j]] || 0;
      chronic += v;
      if (j < 7) acute += v;
    }
    var a = acute / 7, c = chronic / 28;
    out.push({ date: dates[i], acwr: c > 0 ? parseFloat((a/c).toFixed(2)) : null });
  }
  return out;
}

/* ---- Monotonia e Strain (Foster) ----
   Monotonia = media del carico giornaliero / sua deviazione standard
   sui 7 giorni. Alta monotonia significa allenarsi sempre uguale, senza
   alternare duro e facile: nei lavori di Foster e' associata a maggiore
   rischio di malattia e sovraccarico, piu' del carico totale in se'.
   Strain = carico settimanale x monotonia. */
function computeMonotony() {
  var pmc = computePMC();
  var h = pmc.history;
  var out = [];
  for (var i = 6; i < h.length; i++) {
    var vals = [];
    for (var j = 0; j < 7; j++) vals.push(h[i-j].tss || 0);
    var mean = vals.reduce(function(s,v){return s+v;},0) / 7;
    var sd = Math.sqrt(vals.reduce(function(s,v){return s + Math.pow(v-mean,2);},0) / 7);
    var mono = sd > 0.5 ? parseFloat((mean/sd).toFixed(2)) : null;
    out.push({
      date: h[i].date,
      monotony: mono,
      strain: mono ? Math.round(mean * 7 * mono) : null
    });
  }
  return out;
}

/* ---- Debito di sonno ----
   Deficit cumulato rispetto a un obiettivo, sugli ultimi 14 giorni.
   Piu' leggibile della singola notte: una notte corta non conta, due
   settimane sotto target si'. */
function sleepDebt(targetHours, days) {
  targetHours = targetHours || 8;
  days = days || 14;
  var recent = wellness.filter(function(w){ return w.sleepH != null; }).slice(-days);
  if (!recent.length) return null;
  var debt = recent.reduce(function(s,w){ return s + (targetHours - w.sleepH); }, 0);
  return {
    debtHours: parseFloat(debt.toFixed(1)),
    nights: recent.length,
    avg: parseFloat((recent.reduce(function(s,w){return s+w.sleepH;},0)/recent.length).toFixed(1)),
    target: targetHours
  };
}

function renderLoadCharts() {
  var acwr = computeACWR().slice(-90);
  if (acwr.length) {
    var labels = acwr.map(function(d){ return d.date.slice(5); });
    mkChart('ch-fitness-acwr','line',{labels:labels,datasets:[
      {label:'ACWR (7gg / 28gg)',data:acwr.map(function(d){return d.acwr;}),borderColor:'#e8ff47',
       tension:.35,pointRadius:0,borderWidth:2,spanGaps:true},
      {label:'1.3 — limite alto',data:acwr.map(function(){return 1.3;}),borderColor:'rgba(255,77,77,.45)',
       borderDash:[4,3],pointRadius:0,borderWidth:1},
      {label:'0.8 — limite basso',data:acwr.map(function(){return 0.8;}),borderColor:'rgba(59,130,246,.45)',
       borderDash:[4,3],pointRadius:0,borderWidth:1}
    ]},{scales:{x:{ticks:{color:'#5d657c',font:{size:11},maxTicksLimit:10},grid:{display:false}},
                y:{ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.03)'}}}});
  }

  var mono = computeMonotony().slice(-90);
  if (mono.length) {
    var ml = mono.map(function(d){ return d.date.slice(5); });
    mkChart('ch-fitness-monotony','line',{labels:ml,datasets:[
      {label:'Monotonia',data:mono.map(function(d){return d.monotony;}),borderColor:'#a78bfa',
       tension:.35,pointRadius:0,borderWidth:2,spanGaps:true,yAxisID:'y'},
      {label:'2.0 — soglia di attenzione',data:mono.map(function(){return 2;}),borderColor:'rgba(255,77,77,.4)',
       borderDash:[4,3],pointRadius:0,borderWidth:1,yAxisID:'y'},
      {label:'Strain',data:mono.map(function(d){return d.strain;}),borderColor:'rgba(251,191,36,.65)',
       tension:.35,pointRadius:0,borderWidth:1.5,spanGaps:true,yAxisID:'y1'}
    ]},{scales:{
      x:{ticks:{color:'#5d657c',font:{size:11},maxTicksLimit:10},grid:{display:false}},
      y:{position:'left',ticks:{color:'#5d657c',font:{size:11}},grid:{color:'rgba(255,255,255,.03)'}},
      y1:{position:'right',ticks:{color:'#5d657c',font:{size:11}},grid:{display:false}}
    }});
  }

  var el = document.getElementById('load-notes');
  if (!el) return;
  var lastAcwr = acwr.length ? acwr[acwr.length-1].acwr : null;
  var lastMono = mono.length ? mono[mono.length-1].monotony : null;
  var sd = sleepDebt(8, 14);
  var parts = [];
  if (lastAcwr != null) {
    var aState = lastAcwr > 1.5 ? ['var(--red)','carico in rapida salita']
               : lastAcwr > 1.3 ? ['var(--yel)','sopra la fascia consueta']
               : lastAcwr < 0.8 ? ['var(--blu)','scarico o interruzione']
               : ['var(--grn)','dentro la fascia sostenibile'];
    parts.push('<strong style="color:'+aState[0]+';">ACWR '+lastAcwr+'</strong> — '+aState[1]);
  }
  if (lastMono != null) {
    var mState = lastMono > 2 ? ['var(--yel)','allenamenti troppo simili fra loro: alterna di piu\' duro e facile']
                              : ['var(--grn)','buona alternanza fra giorni duri e facili'];
    parts.push('<strong style="color:'+mState[0]+';">Monotonia '+lastMono+'</strong> — '+mState[1]);
  }
  if (sd) {
    var dState = sd.debtHours > 10 ? 'var(--red)' : sd.debtHours > 4 ? 'var(--yel)' : 'var(--grn)';
    parts.push('<strong style="color:'+dState+';">Debito di sonno '+(sd.debtHours>0?'+':'')+sd.debtHours+'h</strong>'+
      ' su '+sd.nights+' notti (media '+sd.avg+'h contro un obiettivo di '+sd.target+'h)');
  }
  el.innerHTML = parts.length
    ? parts.map(function(p){ return '<div style="padding:5px 0;">'+p+'</div>'; }).join('')
    : '<div class="empty">Servono piu\' dati per queste metriche.</div>';
}
