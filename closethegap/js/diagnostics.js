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
      diagLine('  ⓘ Efficiency Factor: non esposto da ICU — calcolato in locale come NP/FC media.');
      checkFieldVariants(sample, 'TRIMP',            ['icu_trimp','trimp']);
      var pzt = checkFieldVariants(sample, 'Tempo in zona (W)',['icu_zone_times','zone_times','icu_power_zone_times']);
      var hzt = checkFieldVariants(sample, 'Tempo in zona (HR)',['icu_hr_zone_times','hr_zone_times']);
      if (pzt) diagLine('    → ICU fornisce ' + sample[pzt].length + ' zone di potenza (il modello locale ne ha ' + computePowerZones().length + ')');
      if (hzt) diagLine('    → ICU fornisce ' + sample[hzt].length + ' zone cardiache (il modello locale ne ha ' + computeHRZones(LTHR).length + ')');
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
    diagLine('  Attività con un id Intervals.icu valido: ' + withId.length + ' su ' + activities.length);
    if (!withId.length) {
      diagLine('  ✗ Nessun id ICU disponibile: fai un "Sync metriche avanzate ICU" e riprova.');
      diagLine('    (un id puramente numerico NON è un id ICU: era il vecchio bug che dava 422)');
    } else {
      var target = withId[0];
      var tid = icuIdOf(target);
      diagLine('  Uso l\'attività del ' + target.date + ' (id ICU: ' + tid + ')');
      var s = await fetchICUActivityStreams(tid, ['time','watts','heartrate','altitude','distance','latlng']);
      diagLine('  Forma della risposta: ' + (icuLastStreamShape ? icuLastStreamShape.responseType : '?'));
      if (icuLastStreamShape && icuLastStreamShape.rawEntryTypes) {
        diagLine('  Voci GREZZE nella risposta (in ordine): ' + icuLastStreamShape.rawEntryTypes.join(', '));
        var dup = icuLastStreamShape.duplicateTypes;
        diagLine('  Tipi DUPLICATI: ' + (dup && dup.length ? dup.join(', ') + '  ← lat e lng come due voci omonime' : 'nessuno'));
        if (icuLastStreamShape.rawEntryShapes && icuLastStreamShape.rawEntryShapes.latlng) {
          diagLine('  CHIAVI della voce grezza "latlng" (qui deve nascondersi la longitudine):');
          icuLastStreamShape.rawEntryShapes.latlng.forEach(function(k){ diagLine('    ' + k); });
        }
      }
      diagLine('  Tipi di stream ricevuti: ' + Object.keys(s).join(', '));
      Object.keys(s).forEach(function(k){
        var arr = s[k];
        var first = Array.isArray(arr) && arr.length ? arr[0] : null;
        diagLine('    ' + k + ': ' + describeValue(arr) + ' primo valore = ' + describeValue(first));
      });
      /* DUMP GREZZO: il formato di latlng si è rivelato non ovvio, quindi
         invece di continuare a ipotizzare guardiamo i valori reali. */
      if (Array.isArray(s.latlng)) {
        diagLine('  latlng GREZZO — primi 10 valori:');
        diagLine('    [' + s.latlng.slice(0,10).map(function(v){
          return (v===null?'null':(typeof v==='object'?JSON.stringify(v):v));
        }).join(', ') + ']');
        var mid = Math.floor(s.latlng.length/2);
        diagLine('  latlng a metà array (indici ' + mid + '-' + (mid+5) + '):');
        diagLine('    [' + s.latlng.slice(mid,mid+6).join(', ') + ']');
        var nums = s.latlng.filter(function(v){return typeof v==='number';});
        if (nums.length) {
          diagLine('  intervallo di TUTTI i valori: ' + Math.min.apply(null,nums).toFixed(5) +
                   ' .. ' + Math.max.apply(null,nums).toFixed(5));
          var ev=[],od=[];
          nums.forEach(function(v,i){ (i%2?od:ev).push(v); });
          diagLine('  indici PARI:    ' + Math.min.apply(null,ev).toFixed(5) + ' .. ' + Math.max.apply(null,ev).toFixed(5));
          diagLine('  indici DISPARI: ' + Math.min.apply(null,od).toFixed(5) + ' .. ' + Math.max.apply(null,od).toFixed(5));
          var hh=Math.floor(nums.length/2);
          var f=nums.slice(0,hh), sec=nums.slice(hh);
          diagLine('  prima META:     ' + Math.min.apply(null,f).toFixed(5) + ' .. ' + Math.max.apply(null,f).toFixed(5));
          diagLine('  seconda META:   ' + Math.min.apply(null,sec).toFixed(5) + ' .. ' + Math.max.apply(null,sec).toFixed(5));
          diagLine('  (le longitudini in Lombardia stanno intorno a 8-9)');
        }
      }
      var norm = normalizeLatLng(s);
      diagLine('  → punti GPS validi: ' + norm.length + ' (accoppiamento: ' + latlngLayoutDetected + ')');
      if (latlngRejectReason) diagLine('  ⚠ SCARTATO: ' + latlngRejectReason);
      if (norm.length > 1) {
        diagLine('    primo punto: ' + norm[0][0].toFixed(5) + ', ' + norm[0][1].toFixed(5));
        var lats = norm.map(function(p){return p[0];}), lngs = norm.map(function(p){return p[1];});
        diagLine('    lat ' + Math.min.apply(null,lats).toFixed(3) + '..' + Math.max.apply(null,lats).toFixed(3) +
                 ' | lng ' + Math.min.apply(null,lngs).toFixed(3) + '..' + Math.max.apply(null,lngs).toFixed(3));
        diagLine('    (se lat e lng hanno intervalli simili l\'accoppiamento è sbagliato)');
      }
      var altS = pickAltitude(s);
      diagLine('  → punti altimetria validi: ' + (altS ? altS.length : 0));
    }
  } catch (e) {
    diagLine('  ✗ Errore: ' + e.message);
  }
  diagLine('');

  diagLine('[4b] CURVA DI POTENZA (/power-curves)');
  try {
    var n = await syncICUPowerCurve();
    if (n) {
      diagLine('  ✓ Curva reale letta: ' + n + ' durate → i best effort NON sono più valori statici');
      diagLine('    ' + bestEfforts.map(function(e){ return e.label+'='+e.watts+'W'; }).join(', '));
    } else {
      diagLine('  ✗ Formato non riconosciuto: i best effort restano i valori statici di config.js.');
      diagLine('    Struttura ricevuta: ' + describeValue(icuPowerCurveRawSample));
      // dump mirato: serve a capire dove stanno davvero durate e watt
      var r = icuPowerCurveRawSample;
      if (r && typeof r === 'object' && Array.isArray(r.list)) {
        diagLine('    list: array[' + r.list.length + ']');
        var c0 = r.list[0];
        if (c0 && typeof c0 === 'object') {
          diagLine('    list[0] chiavi: ' + Object.keys(c0).join(', '));
          Object.keys(c0).slice(0,14).forEach(function(k){
            diagLine('      list[0].' + k + ' = ' + describeValue(c0[k]));
          });
          // se una chiave contiene un array di numeri, mostriamo i primi valori
          Object.keys(c0).forEach(function(k){
            if (Array.isArray(c0[k]) && c0[k].length > 3 && typeof c0[k][0] === 'number') {
              diagLine('      → list[0].' + k + ' primi 6: [' + c0[k].slice(0,6).join(', ') + ']');
            }
          });
        }
      }
    }
  } catch (e) {
    diagLine('  ✗ Errore: ' + e.message);
  }
  diagLine('');

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
    diagLine('  Definizioni zone da ICU: ' + (ICU_ZONE_DEFS ? ((ICU_ZONE_DEFS.power?'potenza ok':'potenza NO') + ', ' + (ICU_ZONE_DEFS.hr?'FC ok':'FC NO')) : 'non lette'));
    diagLine('  Origine dei best effort: ' + BEST_EFFORTS_SOURCE + (BEST_EFFORTS_SOURCE==='hardcoded' ? '  ← valori statici non verificati' : ''));
    diagLine('  Modello CP in uso: ' + (cp.model==='morton3p' ? 'Morton 3 parametri (nativo)' : 'iperbole 2 parametri'));
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
