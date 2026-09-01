/* ============================================================
   ICU-NATIVE.JS
   Legge le metriche già calcolate NATIVAMENTE da Intervals.icu invece
   di ricalcolarle da zero: decoupling (power_hr), W'bal depletion
   (max_wbal_depletion), Variability Index, Efficiency Factor, TRIMP,
   e il modello CP/W'/Pmax (da sportInfo nei record di wellness,
   calcolato con Morton 3-parametri da Intervals.icu stesso).

   AVVISO SUI NOMI DEI CAMPI: la documentazione pubblica di Intervals.icu
   elenca questi campi come "field_id" utilizzabili nei filtri attività
   (ActivityFilter), ma non conferma al 100% che il JSON di risposta di
   /activities?fields=... usi ESATTAMENTE questi stessi nomi (altri campi
   ICU-calcolati sono prefissati "icu_", es. icu_training_load). Questo
   file richiede quindi ENTRAMBE le varianti (es. sia "power_hr" che
   "icu_power_hr") nella query e controlla entrambe in lettura - è un
   controllo difensivo, non uno spreco: se un nome non esiste nella
   risposta viene semplicemente ignorato.

   DOPO IL PRIMO SYNC REALE: apri la console del browser, guarda cosa
   contiene realmente `icuNativeLastRawSample` (loggato lì sotto) e,
   se vuoi, incollamelo così pulisco il codice dai nomi che non servono.
   ============================================================ */

/* --------------------------------------------------------------
   icuFetch — chiamata al proxy con fallback automatico.

   PERCHÉ SERVE: esistono DUE proxy verso Intervals.icu.
   1) il Worker standalone (ICU_WORKER in config.js), quello
      storicamente usato dall'app;
   2) la Pages Function `functions/api/[[path]].js`, deployata insieme
      al sito e raggiungibile su same-origin `/api/...`.
   Se uno dei due non conosce un endpoint risponde 403/404 (è successo
   con /activity/{id}/streams: il Worker aveva la vecchia lista di
   endpoint permessi). Qui proviamo il primario e, se serve, l'altro.

   DUE BUG CORRETTI IN QUESTA VERSIONE:

   1. Il fallback era GLOBALE E PERMANENTE: bastava un 403 su
      /activity/... perché TUTTE le chiamate successive (comprese
      /wellness e /activities, che il Worker gestisce benissimo)
      venissero dirottate sulla Pages Function. Questo rompeva la
      sincronizzazione dopo aver aperto un dettaglio attività.
      Ora il fallback è memorizzato PER FAMIGLIA DI ENDPOINT: se
      /activity funziona solo via /api, gli altri continuano a usare
      il Worker.

   2. Cloudflare Pages, per una rotta non gestita, restituisce
      index.html con status 200. `resp.ok` era quindi true e tornavamo
      una pagina HTML: il successivo .json() esplodeva con un errore
      di parsing incomprensibile. Ora si verifica che la risposta sia
      davvero JSON prima di accettarla; una pagina HTML viene trattata
      come fallimento, con un messaggio chiaro.
   -------------------------------------------------------------- */
var ICU_FALLBACK_BASE = '/api';
var icuFallbackFor = {};   // {'activity': true} - fallback per famiglia di endpoint

function endpointFamily(path) {
  var p = path.replace(/^\//,'');
  return (p.split(/[/?]/)[0] || '').split('.')[0];
}

async function isJsonResponse(resp) {
  var ct = resp.headers && resp.headers.get ? (resp.headers.get('content-type')||'') : '';
  if (ct.indexOf('json') >= 0) return true;
  if (ct.indexOf('html') >= 0) return false;
  return true; // content-type assente o generico: proviamo comunque a parsare
}

async function icuFetch(path) {
  var fam = endpointFamily(path);
  var useFallbackFirst = !!icuFallbackFor[fam];
  var bases = useFallbackFirst ? [ICU_FALLBACK_BASE, ICU_WORKER] : [ICU_WORKER, ICU_FALLBACK_BASE];
  var lastStatus = null, htmlSeen = false;

  for (var i=0;i<bases.length;i++) {
    var resp;
    try { resp = await fetch(bases[i] + path); }
    catch (e) { lastStatus = 'network'; continue; }
    if (resp.ok) {
      if (!(await isJsonResponse(resp))) { htmlSeen = true; continue; } // pagina HTML travestita da successo
      if (i===1 && !useFallbackFirst) {
        icuFallbackFor[fam] = true;
        console.info('Proxy: "'+fam+'" non è supportato dal Worker standalone, uso la Pages Function /api solo per questa famiglia di endpoint. '+
                     'Per risolvere alla radice aggiorna il codice del Worker (vedi worker/closethegap-proxy.js).');
      }
      return resp;
    }
    lastStatus = resp.status;
    if (resp.status !== 403 && resp.status !== 404) break; // errore vero: inutile ritentare
  }

  if (htmlSeen) {
    throw new Error('Il proxy ha restituito una pagina HTML invece di JSON per "'+fam+'". '+
                    'Probabile che la Pages Function /api non sia attiva: aggiorna il Worker standalone (worker/closethegap-proxy.js).');
  }
  throw new Error('HTTP '+lastStatus+' su entrambi i proxy ('+path.split('?')[0]+'). Aggiorna il codice del Worker: vedi worker/closethegap-proxy.js.');
}

var ICU_NATIVE_CP = null; // {eftp, wPrime, pMax, date} - dal sportInfo piu' recente
var icuNativeLastRawSample = null; // ultima attivita' grezza ricevuta, per debug
var ICU_ZONE_DEFS = null; // {power:{count,names,boundaries}, hr:{...}} dalle impostazioni ICU

/* Le impostazioni zone dell'atleta su Intervals.icu.
   PERCHÉ SERVE: icu_zone_times arriva con 8 valori per la potenza e 7
   per la FC, mentre il modello interno dell'app ne ha 7 e 5. Mapparli
   per indice sfalsa completamente i grafici di distribuzione. Qui si
   leggono le definizioni vere, così le etichette corrispondono ai dati.
   La struttura esatta non è documentata pubblicamente, quindi il
   parsing è difensivo e registra cosa ha trovato per la diagnostica. */
var icuAthleteRawSample = null;

async function syncICUZoneDefs() {
  var resp = await icuFetch('/athlete');
  var ath = await resp.json();
  icuAthleteRawSample = ath;
  var settings = ath && (ath.sportSettings || ath.sport_settings);
  if (!Array.isArray(settings)) return null;
  var ride = settings.find(function(s){
    var types = s.types || s.sportTypes || [];
    return (Array.isArray(types) && types.indexOf('Ride')>=0) || s.type==='Ride' || s.id==='Ride';
  }) || settings[0];
  if (!ride) return null;

  function grab(obj, keys) {
    for (var i=0;i<keys.length;i++) if (Array.isArray(obj[keys[i]])) return obj[keys[i]];
    return null;
  }
  var pz = grab(ride, ['power_zones','powerZones']);
  var pn = grab(ride, ['power_zone_names','powerZoneNames']);
  var hz = grab(ride, ['hr_zones','hrZones']);
  var hn = grab(ride, ['hr_zone_names','hrZoneNames']);

  ICU_ZONE_DEFS = {
    power: pz ? {bounds:pz, names:pn, ftp: ride.ftp||ride.icu_ftp||null} : null,
    hr:    hz ? {bounds:hz, names:hn, lthr: ride.lthr||ride.threshold_hr||null} : null
  };
  return ICU_ZONE_DEFS;
}

/* Etichette per una serie di tempi-in-zona di lunghezza arbitraria.
   Se conosciamo le definizioni ICU le usiamo (con i watt/bpm reali),
   altrimenti etichettiamo Z1..Zn senza inventare intervalli. */
function zoneLabelsFor(count, kind) {
  var defs = ICU_ZONE_DEFS && ICU_ZONE_DEFS[kind];
  var out = [];
  for (var i=0;i<count;i++) {
    var name = defs && defs.names && defs.names[i] ? defs.names[i] : 'Z'+(i+1);
    var range = null;
    if (defs && defs.bounds) {
      var ref = kind==='power' ? (defs.ftp||FTP) : (defs.lthr||LTHR);
      var hi = defs.bounds[i], lo = i===0 ? 0 : defs.bounds[i-1];
      if (typeof hi === 'number' && ref) {
        // i bound ICU possono essere percentuali o valori assoluti
        var asAbs = hi <= 200 ? Math.round(hi*ref/100) : Math.round(hi);
        var loAbs = lo === 0 ? 0 : (lo <= 200 ? Math.round(lo*ref/100) : Math.round(lo));
        range = loAbs+'–'+asAbs+(kind==='power'?'W':'bpm');
      }
    }
    out.push({name:name, range:range});
  }
  return out;
}

var ICU_ACTIVITY_FIELDS = [
  'id','start_date_local','name','type','distance','moving_time',
  'icu_training_load','training_load',
  'icu_average_watts','average_watts','icu_weighted_avg_watts','icu_normalized_watts',
  'icu_intensity','intensity',
  'average_heartrate','max_heartrate','calories',
  // varianti candidate per le metriche native - vedi avviso sopra
  'icu_variability_index','variability_index',
  'icu_power_hr','power_hr','icu_power_hr_z2','power_hr_z2',
  'icu_trimp','trimp',
  'icu_max_wbal_depletion','max_wbal_depletion',
  // tempo per zona calcolato da ICU sullo stream reale: serve per una
  // distribuzione zone corretta (vedi nota in charts.js:renderZoneDist)
  'icu_zone_times','icu_hr_zone_times'
].join(',');

/* Trova l'attività locale corrispondente a un record ICU (stesso
   matching data+distanza già usato in syncIntervals, per non dipendere
   dallo schema di id di Intervals.icu). */
function findLocalMatch(icuDate, icuDistM) {
  return activities.find(function(a) {
    return a.date === icuDate && Math.abs((a.dist||0) - (icuDistM||0)) < 3000;
  });
}

function pick(obj, keys) {
  for (var i=0;i<keys.length;i++) { if (obj[keys[i]]!=null) return obj[keys[i]]; }
  return null;
}

/* ICU può restituire i tempi per zona come array di secondi
   ([1200, 3400, ...]) oppure come array di oggetti ([{id:'Z1',secs:1200},...]).
   Non essendo certo quale delle due arrivi, gestiamo entrambe. */
function normalizeZoneTimes(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  if (typeof raw[0] === 'number') return raw;
  if (typeof raw[0] === 'object') {
    return raw.map(function(z){ return z.secs!=null ? z.secs : (z.time!=null ? z.time : 0); });
  }
  return null;
}

/* Scarica le attività nel range con i campi nativi e li fonde nel
   dataset locale `activities`. Non sovrascrive np/avg_watts/tss se già
   presenti da Garmin (quelli restano la fonte primaria per quei campi,
   come da priorità storica del progetto) - aggiunge SOLO i campi nativi
   che prima non avevamo modo di calcolare con la stessa affidabilità. */
async function syncICUNativeMetrics(daysBack) {
  var td = today();
  var from = dateKey(new Date(new Date().setDate(new Date().getDate() - (daysBack||365))));
  var resp = await icuFetch('/activities?oldest=' + from + '&newest=' + td + '&fields=' + encodeURIComponent(ICU_ACTIVITY_FIELDS));
  if (!resp.ok) throw new Error('ICU activities HTTP ' + resp.status);
  var icuActs = await resp.json();
  if (!Array.isArray(icuActs)) throw new Error('Risposta inattesa da /activities (non è un array)');

  var matched = 0, unmatched = 0;
  icuActs.forEach(function(ia) {
    if (icuActs.indexOf(ia)===0) icuNativeLastRawSample = ia; // debug: prima attività grezza
    if (!ia.start_date_local) return;
    var date = ia.start_date_local.slice(0,10);
    var dist = Math.round(ia.distance || 0);
    var local = findLocalMatch(date, dist);
    if (!local) { unmatched++; return; }

    var vi = pick(ia, ['icu_variability_index','variability_index']);
    /* L'Efficiency Factor NON è esposto da Intervals.icu (verificato con
       la diagnostica): lo calcoliamo noi come NP / FC media, che è la
       definizione standard. */
    var npForEf = pick(ia, ['icu_weighted_avg_watts','icu_normalized_watts']);
    var hrForEf = ia.average_heartrate;
    var ef = (npForEf && hrForEf) ? parseFloat((npForEf/hrForEf).toFixed(3)) : null;
    var decoupling = pick(ia, ['icu_power_hr','power_hr']);
    var decouplingZ2 = pick(ia, ['icu_power_hr_z2','power_hr_z2']);
    var trimp = pick(ia, ['icu_trimp','trimp']);
    var wbalDepletion = pick(ia, ['icu_max_wbal_depletion','max_wbal_depletion']);

    if (vi!=null) local.icu_vi = vi;
    if (ef!=null) local.icu_ef = ef;
    if (decoupling!=null) local.icu_decoupling = decoupling;
    if (decouplingZ2!=null) local.icu_decoupling_z2 = decouplingZ2;
    if (trimp!=null) local.icu_trimp = trimp;
    if (wbalDepletion!=null) local.icu_wbal_depletion_kj = Math.abs(wbalDepletion) > 1000 ? wbalDepletion/1000 : wbalDepletion; // normalizza J->kJ se serve
    /* Tempo per zona: ICU può restituire un array di secondi oppure un
       array di oggetti {id/zone, secs}. Normalizziamo in array di secondi. */
    if (ia.icu_zone_times) local.icu_zone_times = normalizeZoneTimes(ia.icu_zone_times);
    if (ia.icu_hr_zone_times) local.icu_hr_zone_times = normalizeZoneTimes(ia.icu_hr_zone_times);
    local.icu_native_synced = true;
    matched++;
  });
  return { matched: matched, unmatched: unmatched, total: icuActs.length };
}

/* Legge CP/W'/Pmax stimati NATIVAMENTE da Intervals.icu (modello Morton
   3-parametri), che vive dentro il campo sportInfo dei record di
   wellness. Sostituisce la nostra regressione lineare fatta in casa
   quando disponibile. */
async function syncICUNativeCP() {
  var td = today();
  var from = dateKey(new Date(new Date().setDate(new Date().getDate() - 60)));
  var resp = await icuFetch('/wellness?oldest=' + from + '&newest=' + td);
  if (!resp.ok) throw new Error('ICU wellness HTTP ' + resp.status);
  var records = await resp.json();
  if (!Array.isArray(records) || !records.length) return null;
  for (var i = records.length-1; i>=0; i--) {
    var r = records[i];
    if (r.sportInfo && r.sportInfo.length) {
      var ride = r.sportInfo.find(function(s){ return s.type==='Ride'; });
      if (ride && (ride.eftp || ride.wPrime || ride.pMax)) {
        ICU_NATIVE_CP = { eftp: ride.eftp, wPrime: ride.wPrime, pMax: ride.pMax, date: r.id };
        return ICU_NATIVE_CP;
      }
    }
  }
  return null;
}

/* Stream secondo-per-secondo per il dettaglio di UNA attività (es. per
   disegnare la curva W'bal minuto per minuto quando l'utente seleziona
   quell'uscita). types tipici: time, watts, heart_rate, cadence. */
var icuLastStreamShape = null; // diagnostica: cosa e' realmente arrivato dall'API

async function fetchICUActivityStreams(activityId, types) {
  /* BUG CORRETTO (HTTP 422): chiedere un tipo di stream inesistente fa
     rifiutare a Intervals.icu l'INTERA richiesta. La diagnostica
     inviava sia "heartrate" sia "heart_rate" per sicurezza, e proprio
     quel doppione faceva fallire tutto con 422.
     Strategia ora: si chiede un insieme conservativo di nomi validi;
     se comunque arriva un 422 si ritenta SENZA il parametro types,
     lasciando che ICU restituisca tutti gli stream disponibili. */
  var resp;
  var requested = types || ['time','watts','heartrate','altitude','distance','latlng'];
  try {
    resp = await icuFetch('/activity/' + activityId + '/streams.json?types=' + encodeURIComponent(requested.join(',')));
  } catch (e) {
    if (String(e.message).indexOf('422') < 0) throw e;
    console.info('Stream: 422 con types espliciti, ritento senza filtro.');
    resp = await icuFetch('/activity/' + activityId + '/streams.json');
  }
  var raw = await resp.json();
  var out = {};
  if (Array.isArray(raw)) {
    raw.forEach(function(s) {
      if (!s || !s.type) return;
      if (Array.isArray(s.data)) out[s.type] = s.data;
      else if (Array.isArray(s.values)) out[s.type] = s.values;
    });
  } else if (raw && typeof raw === 'object') {
    Object.keys(raw).forEach(function(k) {
      var v = raw[k];
      if (Array.isArray(v)) out[k] = v;
      else if (v && Array.isArray(v.data)) out[k] = v.data;
    });
  }
  /* Normalizza i nomi alternativi della frequenza cardiaca. */
  if (!out.heartrate && out.heart_rate) out.heartrate = out.heart_rate;
  if (!out.heart_rate && out.heartrate) out.heart_rate = out.heartrate;
  icuLastStreamShape = {
    responseType: Array.isArray(raw) ? 'array' : typeof raw,
    typesReceived: Object.keys(out),
    sampleLatlng: out.latlng ? JSON.stringify(out.latlng.slice(0,2)) : null,
    hasLatLngSeparate: !!(out.lat && out.lng)
  };
  console.debug('Stream ricevuti per attivita ' + activityId + ':', icuLastStreamShape);
  return out;
}

/* Dati nativi di decoupling Pw:Hr per una singola attività (il grafico
   che alimenta la "Decoupling Chart" di Intervals.icu). */
async function fetchICUPowerVsHR(activityId) {
  var resp = await icuFetch('/activity/' + activityId + '/power-vs-hr.json');
  if (!resp.ok) throw new Error('ICU power-vs-hr HTTP ' + resp.status);
  return await resp.json();
}

/* Bottone "Sincronizza metriche avanzate" nella tab Analisi: tira giù
   in un colpo solo decoupling/W'bal/EF/VI/TRIMP nativi per tutto lo
   storico e il modello CP/W'/Pmax più recente. */
async function syncICUAdvanced(opts) {
  opts = opts || {};
  var silent = !!opts.silent;
  var el = document.getElementById('icu-advanced-status');
  if (el && !silent) { el.textContent = 'Sincronizzazione metriche avanzate...'; el.style.color = 'var(--tx3)'; }
  try {
    var res = await syncICUNativeMetrics(400);
    await syncICUNativeCP();
    try { await syncWellness(180); } catch(we) { console.warn('Wellness non disponibile:', we.message); }
    try { await syncICUZoneDefs(); } catch(ze) { console.warn('Definizioni zone non disponibili:', ze.message); }
    applyDataDrivenZones();
    if (el && !silent) {
      el.textContent = '✅ ' + res.matched + '/' + res.total + ' attività arricchite con metriche native'
        + (ICU_NATIVE_CP ? ' · CP nativo: ' + Math.round(ICU_NATIVE_CP.eftp) + 'W' : '');
      el.style.color = 'var(--grn)';
    }
    console.log('Esempio attività grezza ICU (per verificare i nomi dei campi):', icuNativeLastRawSample);
    makePlan();
    saveState();
    renderAnalytics();
    if (document.getElementById('page-plan').classList.contains('active')) renderPlanPage();
  } catch (e) {
    if (el && !silent) { el.textContent = '❌ ' + e.message; el.style.color = 'var(--red)'; }
    console.error('Sync metriche avanzate ICU:', e);
    if (silent) throw e;
  }
}
