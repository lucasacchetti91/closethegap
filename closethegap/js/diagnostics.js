/* ============================================================
   DIAGNOSTICS.JS
   Strumento di verifica: interroga tutti gli endpoint di
   Intervals.icu e riporta QUALI CAMPI ESISTONO DAVVERO, invece di
   lasciare che l'app usi silenziosamente i fallback approssimati
   quando i nomi che ho ipotizzato non corrispondono.

   Produce un report testuale da copiare e incollare in chat.

   PRIVACY: il report contiene nomi di campi, tipi e qualche valore
   numerico di esempio (servono per capire le unità di misura). Non
   contiene la chiave API, né i nomi delle tue attività, né coordinate
   GPS. Puoi rileggerlo prima di incollarlo.
   ============================================================ */

var diagReport = '';

function diagLine(s) { diagReport += s + '\n'; }

function describeValue(v) {
  if (v === null) return 'null';
  if (v === undefined) return '—';
  if (Array.isArray(v)) return 'array[' + v.length + ']';
  if (typeof v === 'object') return 'object{' + Object.keys(v).slice(0,6).join(',') + '}';
  if (typeof v === 'number') return 'number (' + v + ')';
  if (typeof v === 'string') return 'string ("' + String(v).slice(0,22) + '")';
  return typeof v;
}

/* Verifica quali nomi, tra quelli che l'app tenta, esistono davvero. */
function checkFieldVariants(obj, label, variants) {
  var found = variants.filter(function(k){ return obj[k] !== undefined; });
  if (found.length) {
    diagLine('  ✓ ' + label + ': ' + found.map(function(k){ return k + ' = ' + describeValue(obj[k]); }).join(' | '));
    return found[0];
  }
  diagLine('  ✗ ' + label + ': NESSUNA delle varianti trovata (' + variants.join(', ') + ')');
  return null;
}

async function runDiagnostics() {
  var btn = document.getElementById('btn-diag');
  var out = document.getElementById('diag-output');
  if (btn) { btn.disabled = true; btn.textContent = 'Verifica in corso…'; }
  diagReport = '';
  diagLine('=== DIAGNOSTICA CLOSE THE GAP — ' + new Date().toISOString().slice(0,16) + ' ===');
  diagLine('');

  // ---------- 1. Proxy ----------
  diagLine('[1] PROXY');
  /* Sonda su un endpoint sicuramente valido. La versione precedente
     usava /athlete, che però il proxy trasformava in
     .../athlete/{id}/athlete -> 404: la sonda falliva anche con il
     proxy perfettamente funzionante, e peggio ancora interrompeva
     tutto il resto del report. */
  var proxyOk = false;
  try {
    var probeFrom = dateKey(new Date(new Date().setDate(new Date().getDate() - 14)));
    var r = await icuFetch('/activities?oldest=' + probeFrom + '&newest=' + today() + '&fields=id');
    var probe = await r.json();
    diagLine('  ✓ Proxy raggiungibile (' + (Array.isArray(probe) ? probe.length + ' attività negli ultimi 14gg' : 'risposta ricevuta') + ')');
    proxyOk = true;
  } catch (e) {
    diagLine('  ✗ Proxy NON raggiungibile: ' + e.message);
  }
  // Verifica separata dell'endpoint /athlete (storicamente rotto: vedi fix nel proxy)
  try {
    var ra2 = await icuFetch('/athlete');
    var ath = await ra2.json();
    diagLine('  ✓ /athlete risponde' + (ath && ath.id ? ' (id ' + ath.id + ')' : ''));
  } catch (e2) {
    diagLine('  ⚠ /athlete non disponibile: ' + e2.message);
    diagLine('    (non è bloccante: l\'app non usa questo endpoint. Se dà 404, il proxy non ha ancora il fix del doppio /athlete.)');
  }
  diagLine('  Fallback attivi per famiglia: ' + (Object.keys(icuFallbackFor).length ? JSON.stringify(icuFallbackFor) : 'nessuno (tutto via Worker)'));
  diagLine('');

  if (!proxyOk) {
    diagLine('⚠ Il proxy non risponde sull\'endpoint principale. Proseguo comunque con le');
    diagLine('  altre verifiche: potrebbero fallire tutte, ma vedere QUALI falliscono aiuta.');
    diagLine('');
  }

  // ---------- 2. Campi attività ----------
  diagLine('[2] CAMPI ATTIVITÀ (/activities)');
  try {
    var td = today();
    var from = dateKey(new Date(new Date().setDate(new Date().getDate() - 120)));
    var ra = await icuFetch('/activities?oldest=' + from + '&newest=' + td + '&fields=' + encodeURIComponent(ICU_ACTIVITY_FIELDS));
    var acts = await ra.json();
    diagLine('  Attività ricevute: ' + (Array.isArray(acts) ? acts.length : 'risposta non array!'));
    var rides = (acts||[]).filter(function(a){ return (a.type||'').toLowerCase().match(/ride|cycling/); });
    diagLine('  Di cui in bici: ' + rides.length);
    var sample = rides.find(function(a){ return a.icu_average_watts || a.average_watts; }) || rides[0];
    if (sample) {
      diagLine('  Campi presenti nella risposta (' + Object.keys(sample).length + ' totali):');
      diagLine('  ' + Object.keys(sample).join(', '));
      diagLine('');
      diagLine('  Verifica delle metriche che l\'app cerca:');
      checkFieldVariants(sample, 'Decoupling',       ['icu_power_hr','power_hr','decoupling','icu_decoupling']);
      checkFieldVariants(sample, "W' depletion",     ['icu_max_wbal_depletion','max_wbal_depletion','icu_wbal','wbal_depletion']);
      checkFieldVariants(sample, 'Variability Index',['icu_variability_index','variability_index','icu_vi']);
      checkFieldVariants(sample, 'Efficiency Factor',['icu_efficiency','efficiency','icu_ef']);
      checkFieldVariants(sample, 'TRIMP',            ['icu_trimp','trimp']);
      checkFieldVariants(sample, 'Tempo in zona (W)',['icu_zone_times','zone_times','icu_power_zone_times']);
      checkFieldVariants(sample, 'Tempo in zona (HR)',['icu_hr_zone_times','hr_zone_times']);
      checkFieldVariants(sample, 'Training Load',    ['icu_training_load','training_load']);
      checkFieldVariants(sample, 'NP',               ['icu_weighted_avg_watts','icu_normalized_watts','normalized_watts']);
    } else {
      diagLine('  ✗ Nessuna attività in bici negli ultimi 120 giorni: non posso verificare i campi.');
    }
  } catch (e) {
    diagLine('  ✗ Errore: ' + e.message);
  }
  diagLine('');

  // ---------- 3. Wellness ----------
  diagLine('[3] CAMPI WELLNESS (/wellness) — dati Garmin');
  try {
    var fromW = dateKey(new Date(new Date().setDate(new Date().getDate() - 30)));
    var rw = await icuFetch('/wellness?oldest=' + fromW + '&newest=' + today());
    var rows = await rw.json();
    diagLine('  Record ricevuti: ' + (Array.isArray(rows) ? rows.length : 'risposta non array!'));
    // prende il record più "pieno" degli ultimi 30 giorni
    var best = null, bestCount = -1;
    (rows||[]).forEach(function(r){
      var c = Object.keys(r).filter(function(k){ return r[k]!=null; }).length;
      if (c > bestCount) { bestCount = c; best = r; }
    });
    if (best) {
      diagLine('  Campi valorizzati nel record più completo:');
      diagLine('  ' + Object.keys(best).filter(function(k){return best[k]!=null;}).join(', '));
      diagLine('');
      diagLine('  Verifica dei dati di recupero:');
      checkFieldVariants(best, 'FC a riposo', ['restingHR','resting_hr','restingHr']);
      checkFieldVariants(best, 'HRV',         ['hrv','hrvSDNN','hrv_sdnn','rmssd']);
      checkFieldVariants(best, 'Sonno',       ['sleepSecs','sleep_secs','sleepTime','sleepHours']);
      checkFieldVariants(best, 'Qualità sonno',['sleepScore','sleep_score','sleepQuality']);
      checkFieldVariants(best, 'Readiness',   ['readiness','readinessScore']);
      checkFieldVariants(best, 'Stress',      ['stress','avgStress','stressScore']);
      checkFieldVariants(best, 'Peso',        ['weight']);
      checkFieldVariants(best, 'sportInfo (eFTP/W\'/Pmax)', ['sportInfo']);
      if (best.sportInfo && best.sportInfo.length) {
        var ride = best.sportInfo.find(function(s){return s.type==='Ride';}) || best.sportInfo[0];
        diagLine('    dentro sportInfo: ' + Object.keys(ride).map(function(k){ return k+'='+describeValue(ride[k]); }).join(' | '));
      }
    }
  } catch (e) {
    diagLine('  ✗ Errore: ' + e.message);
  }
  diagLine('');

  // ---------- 4. Stream ----------
  diagLine('[4] STREAM DI UNA ATTIVITÀ (/activity/{id}/streams)');
  try {
    var withId = activities.filter(function(a){ return icuIdOf(a); });
    if (!withId.length) {
      diagLine('  ✗ Nessuna attività con id Intervals.icu in memoria: fai prima un sync.');
    } else {
      var target = withId[0];
      var s = await fetchICUActivityStreams(icuIdOf(target), ['time','watts','heartrate','heart_rate','altitude','distance','latlng']);
      diagLine('  Forma della risposta: ' + (icuLastStreamShape ? icuLastStreamShape.responseType : '?'));
      diagLine('  Tipi di stream ricevuti: ' + Object.keys(s).join(', '));
      Object.keys(s).forEach(function(k){
        var arr = s[k];
        var first = Array.isArray(arr) && arr.length ? arr[0] : null;
        diagLine('    ' + k + ': ' + describeValue(arr) + ' primo valore = ' + describeValue(first));
      });
      var norm = normalizeLatLng(s);
      diagLine('  → punti GPS validi dopo normalizzazione: ' + norm.length);
      var altS = pickAltitude(s);
      diagLine('  → punti altimetria validi: ' + (altS ? altS.length : 0));
    }
  } catch (e) {
    diagLine('  ✗ Errore: ' + e.message);
  }
  diagLine('');

  // ---------- 5. Eventi / gare ----------
  diagLine('[5] EVENTI E GARE (/events) — servono per il piano');
  try {
    var re = await icuFetch('/events?oldest=' + today() + '&newest=2026-12-31');
    var evs = await re.json();
    diagLine('  Eventi futuri ricevuti: ' + (Array.isArray(evs) ? evs.length : 'risposta non array!'));
    if (Array.isArray(evs) && evs.length) {
      var e0 = evs[0];
      diagLine('  Campi disponibili: ' + Object.keys(e0).join(', '));
      var cats = {};
      evs.forEach(function(e){ var c=e.category||e.type||'?'; cats[c]=(cats[c]||0)+1; });
      diagLine('  Categorie presenti: ' + JSON.stringify(cats));
      diagLine('  (cerco le gare: category="RACE_A/B/C" o simili)');
    } else {
      diagLine('  Nessun evento futuro sul calendario Intervals.icu.');
    }
  } catch (e) {
    diagLine('  ✗ Errore: ' + e.message);
  }
  diagLine('');

  // ---------- 6. Stato modelli ----------
  diagLine('[6] STATO DEI MODELLI IN APP');
  try {
    var cp = cpModel();
    diagLine('  CP: ' + cp.CP + 'W | W\': ' + Math.round(cp.Wp) + 'J (' + Math.round(cp.Wp/1000) + 'kJ)' +
             ' | fonte: ' + (cp.native ? 'nativa ICU' : 'fit locale') + (cp.wpFallback ? ' [W\' nativo scartato: implausibile]' : ''));
    var pmcD = computePMC();
    diagLine('  PMC: CTL ' + pmcD.ctl + ' | ATL ' + pmcD.atl + ' | TSB ' + pmcD.tsb);
    diagLine('  FTP in uso: ' + FTP + 'W | LTHR: ' + LTHR + ' | HRmax: ' + HR_MAX + ' | peso: ' + WEIGHT_KG + 'kg');
    var natCount = activities.filter(function(a){return a.icu_native_synced;}).length;
    diagLine('  Attività totali in memoria: ' + activities.length + ' (con metriche native: ' + natCount + ')');
    var zt = activities.filter(function(a){return a.icu_zone_times;}).length;
    diagLine('  Attività con tempo-in-zona nativo: ' + zt + (zt ? '' : '  ← se 0, i grafici zone usano la STIMA, non il dato reale'));
    diagLine('  Record wellness in memoria: ' + (typeof wellness!=='undefined' ? wellness.length : 0));
    var withEftp = (typeof wellness!=='undefined' ? wellness.filter(function(w){return w.eftp;}).length : 0);
    diagLine('  Record con eFTP: ' + withEftp + (withEftp<2 ? '  ← se <2, la proiezione FTP non può essere disegnata' : ''));
    // Proiezione forma al giorno gara
    var probe = document.getElementById('pmc-proj-note');
    if (probe && probe.textContent) diagLine('  Proiezione gara: ' + probe.textContent.replace(/\s+/g,' ').slice(0,120));
  } catch (e) {
    diagLine('  ✗ Errore: ' + e.message);
  }

  finishDiagnostics(btn, out);
}

function finishDiagnostics(btn, out) {
  if (btn) { btn.disabled = false; btn.textContent = '🔍 Diagnostica'; }
  if (out) {
    out.style.display = 'block';
    out.querySelector('pre').textContent = diagReport;
  }
  console.log(diagReport);
}

function copyDiagnostics() {
  var ta = document.createElement('textarea');
  ta.value = diagReport;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch(e) {}
  document.body.removeChild(ta);
  var b = document.getElementById('btn-diag-copy');
  if (b) { b.textContent = '✅ Copiato'; setTimeout(function(){ b.textContent = 'Copia report'; }, 2000); }
}
