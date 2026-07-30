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
   1) il Worker standalone (ICU_WORKER in config.js), che è quello
      storicamente usato dall'app;
   2) la Pages Function `functions/api/[[path]].js`, deployata insieme
      al sito e raggiungibile su same-origin `/api/...`.
   Se uno dei due non conosce ancora un endpoint risponde 403/404
   (è successo con /activity/{id}/streams: il Worker aveva la vecchia
   lista di endpoint permessi). Qui proviamo il Worker e, in caso di
   403/404, ritentiamo automaticamente sulla Pages Function.
   Essendo same-origin, la seconda chiamata non ha nemmeno problemi
   di CORS.
   -------------------------------------------------------------- */
var ICU_FALLBACK_BASE = '/api';
var icuFallbackActive = false;

async function icuFetch(path) {
  var primary = (icuFallbackActive ? ICU_FALLBACK_BASE : ICU_WORKER) + path;
  var resp = await fetch(primary);
  if (resp.ok) return resp;
  if (resp.status === 403 || resp.status === 404) {
    var alt = (icuFallbackActive ? ICU_WORKER : ICU_FALLBACK_BASE) + path;
    var resp2 = await fetch(alt);
    if (resp2.ok) {
      if (!icuFallbackActive) {
        icuFallbackActive = true;
        console.info('Proxy: il Worker standalone non conosce questo endpoint, passo alla Pages Function /api. '+
                     'Per tornare al Worker aggiorna il suo codice (vedi worker/closethegap-proxy.js).');
      }
      return resp2;
    }
    throw new Error('HTTP '+resp.status+' su entrambi i proxy ('+path.split('?')[0]+
                    '). Aggiorna il codice del Worker: vedi worker/closethegap-proxy.js nel repo.');
  }
  throw new Error('HTTP '+resp.status);
}

var ICU_NATIVE_CP = null; // {eftp, wPrime, pMax, date} - dal sportInfo più recente
var icuNativeLastRawSample = null; // ultima attività grezza ricevuta, per debug

var ICU_ACTIVITY_FIELDS = [
  'id','start_date_local','name','type','distance','moving_time',
  'icu_training_load','training_load',
  'icu_average_watts','average_watts','icu_weighted_avg_watts','icu_normalized_watts',
  'icu_intensity','intensity',
  'average_heartrate','max_heartrate','calories',
  // varianti candidate per le metriche native - vedi avviso sopra
  'icu_variability_index','variability_index',
  'icu_efficiency','efficiency',
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
    var ef = pick(ia, ['icu_efficiency','efficiency']);
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
async function fetchICUActivityStreams(activityId, types) {
  var typesParam = (types || ['time','watts','heart_rate']).join(',');
  var resp = await icuFetch('/activity/' + activityId + '/streams.json?types=' + encodeURIComponent(typesParam));
  if (!resp.ok) throw new Error('ICU streams HTTP ' + resp.status);
  var raw = await resp.json();
  // Formato atteso: array di {type, data:[...]} - normalizziamo in un oggetto {time:[], watts:[], heart_rate:[]}
  var out = {};
  if (Array.isArray(raw)) {
    raw.forEach(function(s) { if (s && s.type) out[s.type] = s.data; });
  }
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
