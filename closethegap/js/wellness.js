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
  var from = SEASON_START; // stagione intera
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

function renderWellnessCharts() {
  var w = wellness.slice(-90);
  var labels = w.map(function(x){return String(x.date).slice(5);});
  if (w.some(function(x){return x.restingHR!=null;}) || w.some(function(x){return x.hrv!=null;})) {
    mkChart('ch-wellness-hr','line',{labels:labels,datasets:[
      {label:'FC riposo (bpm)',data:w.map(function(x){return x.restingHR;}),borderColor:'#ff4d4d',tension:.35,pointRadius:0,borderWidth:1.5,spanGaps:true,yAxisID:'y'},
      {label:'HRV (ms)',data:w.map(function(x){return x.hrv;}),borderColor:'#22d46a',tension:.35,pointRadius:0,borderWidth:1.5,spanGaps:true,yAxisID:'y1'}
    ]},{scales:{
      y:{position:'left',ticks:{color:'#4a5168',font:{size:8}},grid:{color:'rgba(255,255,255,.03)'}},
      y1:{position:'right',ticks:{color:'#4a5168',font:{size:8}},grid:{display:false}},
      x:{ticks:{color:'#4a5168',font:{size:8},maxTicksLimit:10},grid:{display:false}}
    }});
  }
  if (w.some(function(x){return x.sleepH!=null;})) {
    mkChart('ch-wellness-sleep','bar',{labels:labels,datasets:[
      {label:'Sonno (h)',data:w.map(function(x){return x.sleepH;}),backgroundColor:'rgba(167,139,250,.55)',borderRadius:2,borderWidth:0},
      {label:'8h',data:w.map(function(){return 8;}),type:'line',borderColor:'rgba(232,255,71,.35)',borderDash:[4,3],pointRadius:0,borderWidth:1}
    ]},{scales:{x:{ticks:{color:'#4a5168',font:{size:8},maxTicksLimit:10},grid:{display:false}},y:{ticks:{color:'#4a5168',font:{size:8}},grid:{color:'rgba(255,255,255,.03)'}}}});
  }
}
