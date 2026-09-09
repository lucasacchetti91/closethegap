/* ============================================================
   SEASONS.JS
   Confronto fra stagioni e domanda "quali allenamenti rendono di piu'".

   DUE DOMANDE DIVERSE, CON RISPOSTE DI QUALITA' MOLTO DIVERSA.

   1) CONFRONTO FRA STAGIONI — si puo' fare all'indietro.
      Volume, ore, distribuzione di intensita', traiettoria dell'eFTP:
      sono tutti ricavabili dalle attivita' gia' presenti su
      Intervals.icu, anche di anni in cui questa app non esisteva.

   2) QUALI FORMATI DI ALLENAMENTO RENDONO — NON si puo' fare
      all'indietro, e va detto chiaramente. Per rispondere servirebbe
      sapere QUALE allenamento e' stato svolto, e quel dato nelle
      stagioni passate non esiste: un'uscita chiamata "Pedalata
      pomeridiana" non dice se era un 4x8' o un fondo. L'app registra
      il formato solo per le sessioni che genera lei, quindi l'analisi
      puo' partire da adesso in avanti.

   E anche in avanti resta un problema di metodo serio, che vale la
   pena conoscere prima di fidarsi dei numeri:
     - i formati non sono distribuiti a caso: il VO2max si fa in fase
       di costruzione, la soglia in base, quindi la FASE si confonde
       con il formato;
     - il volume varia insieme al formato;
     - il campione e' minuscolo (un atleta, pochi blocchi per stagione);
     - c'e' regressione verso la media: i blocchi duri si fanno quando
       si sta bene, e la forma sale comunque.
   Per questo l'analisi qui sotto e' esplicitamente descrittiva e
   riporta sempre il volume accanto al risultato. Serve a farsi
   domande, non a stabilire nessi di causa.
   ============================================================ */

function seasonsAvailable() {
  var ys = {};
  activities.forEach(function(a){ if (a.date) ys[seasonOf(a.date)] = 1; });
  return Object.keys(ys).map(Number).sort();
}

function seasonSummary(y) {
  var b = seasonBounds(y);
  var acts = activities.filter(function(a){ return a.date >= b.from && a.date <= b.to; });
  if (!acts.length) return null;

  var tss = acts.reduce(function(s,a){ return s + calcTSS(a); }, 0);
  var secs = acts.reduce(function(s,a){ return s + (a.dur||0); }, 0);
  var km = acts.reduce(function(s,a){ return s + (a.dist||0); }, 0) / 1000;
  var elev = acts.reduce(function(s,a){ return s + (a.elev||0); }, 0);

  /* eFTP: traiettoria nella stagione, dai record wellness. */
  var w = (typeof wellness !== 'undefined' ? wellness : [])
    .filter(function(x){ return x.eftp && x.date >= b.from && x.date <= b.to; });
  var eftpStart = w.length ? w[0].eftp : null;
  var eftpEnd = w.length ? w[w.length-1].eftp : null;
  var eftpPeak = w.length ? Math.max.apply(null, w.map(function(x){ return x.eftp; })) : null;

  /* Distribuzione di intensita': usa il tempo-in-zona nativo quando c'e',
     altrimenti si dichiara non disponibile invece di stimare. */
  var withZones = acts.filter(function(a){ return a.icu_zone_times && a.icu_zone_times.length; });
  var polarization = null;
  if (withZones.length >= acts.length * 0.5) {
    var sums = [];
    withZones.forEach(function(a){
      a.icu_zone_times.forEach(function(v,i){ sums[i] = (sums[i]||0) + (v||0); });
    });
    var tot = sums.reduce(function(s,v){ return s+v; }, 0) || 1;
    var low = (sums[0]||0) + (sums[1]||0);
    var high = sums.slice(3).reduce(function(s,v){ return s+(v||0); }, 0);
    polarization = {
      lowPct: Math.round(low/tot*100),
      highPct: Math.round(high/tot*100),
      coverage: Math.round(withZones.length/acts.length*100)
    };
  }

  var races = acts.filter(function(a){ return a.isRace; }).length;

  return {
    season: y, label: seasonLabel(y), from: b.from, to: b.to,
    rides: acts.length, races: races,
    hours: Math.round(secs/3600), km: Math.round(km), elevM: Math.round(elev),
    tss: Math.round(tss),
    tssPerWeek: Math.round(tss / Math.max(1, Math.round((Math.min(new Date(b.to), new Date()) - new Date(b.from)) / (7*86400000)))),
    eftpStart: eftpStart ? Math.round(eftpStart) : null,
    eftpEnd: eftpEnd ? Math.round(eftpEnd) : null,
    eftpPeak: eftpPeak ? Math.round(eftpPeak) : null,
    eftpGain: (eftpStart && eftpEnd) ? Math.round(eftpEnd - eftpStart) : null,
    polarization: polarization,
    complete: new Date(b.to) < new Date()
  };
}

function allSeasonSummaries() {
  return seasonsAvailable().map(seasonSummary).filter(Boolean);
}

/* ---- Registro dei formati svolti ----
   Alimentato in avanti: ogni volta che una sessione generata risulta
   svolta, si annota quale formato era. E' l'unico modo per rispondere
   un giorno alla domanda sulla resa dei singoli allenamenti. */
var FORMAT_LOG_KEY = 'ctg_format_log_v1';
var formatLog = {};   // { 'YYYY-MM-DD': 'seiler4x8' }

function loadFormatLog() {
  try { formatLog = JSON.parse(localStorage.getItem(FORMAT_LOG_KEY) || '{}') || {}; }
  catch (e) { formatLog = {}; }
  return formatLog;
}
function saveFormatLog() {
  try { localStorage.setItem(FORMAT_LOG_KEY, JSON.stringify(formatLog)); } catch (e) {}
}
/* Registra i formati delle sessioni passate che risultano svolte. */
function recordCompletedFormats() {
  var td = today(), n = 0;
  (plan || []).forEach(function(p){
    if (p.date >= td || !p.method || p.method === 'off') return;
    if (formatLog[p.date]) return;
    if (activities.some(function(a){ return a.date === p.date; })) { formatLog[p.date] = p.method; n++; }
  });
  if (n) saveFormatLog();
  return n;
}

/* Resa per formato: variazione di eFTP nelle 4 settimane successive a
   ogni blocco in cui un formato e' stato prevalente.
   Riporta SEMPRE volume e numero di casi accanto al risultato: senza
   quelli il numero non e' interpretabile. */
function formatProductivity(minCases) {
  minCases = minCases || 3;
  var w = (typeof wellness !== 'undefined' ? wellness : []).filter(function(x){ return x.eftp; });
  if (w.length < 30) return {ready: false, reason: 'Servono almeno 30 giorni di eFTP registrata.'};

  var byDate = {};
  w.forEach(function(x){ byDate[x.date] = x.eftp; });
  function eftpNear(dateStr) {
    for (var i = 0; i < 10; i++) {
      var d = addDays(dateStr, i);
      if (byDate[d]) return byDate[d];
      var b = addDays(dateStr, -i);
      if (byDate[b]) return byDate[b];
    }
    return null;
  }

  var dates = Object.keys(formatLog).sort();
  if (!dates.length) return {ready: false, reason: 'Nessuna sessione generata dall\'app risulta ancora svolta: il registro dei formati parte da adesso.'};

  var agg = {};
  dates.forEach(function(d){
    var fmt = formatLog[d];
    var before = eftpNear(d);
    var after = eftpNear(addDays(d, 28));
    if (!before || !after) return;
    var volume = activities.filter(function(a){ return a.date >= d && a.date < addDays(d, 28); })
                           .reduce(function(s,a){ return s + calcTSS(a); }, 0);
    if (!agg[fmt]) agg[fmt] = {format: fmt, cases: 0, gain: 0, volume: 0};
    agg[fmt].cases++;
    agg[fmt].gain += (after - before);
    agg[fmt].volume += volume;
  });

  var rows = Object.keys(agg).map(function(k){
    var a = agg[k];
    return {
      format: k, cases: a.cases,
      avgGain: parseFloat((a.gain / a.cases).toFixed(1)),
      avgVolume: Math.round(a.volume / a.cases),
      enough: a.cases >= minCases
    };
  }).sort(function(a,b){ return b.avgGain - a.avgGain; });

  return {ready: true, rows: rows, minCases: minCases};
}
