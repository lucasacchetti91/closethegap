/* ============================================================
   COMPLIANCE.JS
   Confronta quello che il piano prescriveva con quello che hai
   davvero fatto.

   PERCHE' SERVE: finora l'app prescriveva e non guardava mai l'esito.
   adaptPlan() confrontava solo totali di TSS, quindi non poteva sapere
   se una sessione era stata svolta come previsto, accorciata o saltata.
   Un generatore che non osserva i risultati non impara: ripropone gli
   stessi target anche se non li centri mai.

   LIMITE DICHIARATO: l'abbinamento e' per DATA, non per identita' della
   sessione. Se in un giorno fai due uscite vengono sommate; se sposti
   una sessione al giorno dopo, risulta saltata e l'altra "extra". E'
   accettabile per un ciclista che si allena una volta al giorno, ma va
   saputo. Un abbinamento esatto sarebbe possibile via external_id dopo
   l'export su Intervals.icu (vedi export.js) - passo successivo.
   ============================================================ */

var complianceCache = null;
var plannedHistory = [];   // sessioni pianificate rilette da Intervals.icu

/* ---- Storico del PIANIFICATO ----
   Problema: rigenerando il piano, le sessioni passate tornano a essere
   quelle di HISTORICAL_PLAN, non quelle davvero prescritte a suo tempo.
   L'app non conserva memoria delle proprie proposte, quindi il
   confronto "previsto contro svolto" sul passato sarebbe fittizio.

   Soluzione: dopo l'export le sessioni vivono sul calendario di
   Intervals.icu marcate col nostro external_id (ctg-...). Rileggendole
   si ottiene il registro autentico di cio' che era stato prescritto,
   con la data in cui lo era. E' il calendario a fare da memoria. */
async function syncPlannedHistory(days) {
  days = days || 60;
  var from = addDays(today(), -days);
  var to = addDays(today(), 1);
  var resp = await icuFetch('/events?oldest=' + from + '&newest=' + to + '&category=WORKOUT');
  var evs = await resp.json();
  if (!Array.isArray(evs)) return 0;
  plannedHistory = evs.filter(function(e){
    return String(e.external_id || '').indexOf('ctg-') === 0;
  }).map(function(e){
    return {
      date: String(e.start_date_local || '').slice(0,10),
      name: e.name || 'Sessione',
      tss: e.icu_training_load || null,
      durMin: e.moving_time ? Math.round(e.moving_time/60) : null,
      externalId: e.external_id
    };
  }).filter(function(x){ return x.date; });
  return plannedHistory.length;
}

var QUALITY_TYPES = {z4:1, z5:1, z6:1};

function computeCompliance(days) {
  days = days || 42;
  var td = today();
  var from = addDays(td, -days);

  /* Fonte del "pianificato": si preferisce il registro riletto da
     Intervals.icu, che riflette cio' che era stato realmente prescritto.
     Solo in sua assenza si ricade sul piano in memoria, che per il
     passato e' ricostruito e quindi meno affidabile. */
  var usedSource = 'icu';
  var source = plannedHistory.filter(function(p){ return p.date >= from && p.date < td; });
  if (!source.length) {
    usedSource = 'locale';
    source = (plan || []).filter(function(p){
      return p.date >= from && p.date < td && p.type !== 'off';
    });
  } else {
    // arricchisce col tipo dal piano locale, se la data coincide
    source = source.map(function(p){
      var local = (plan||[]).find(function(x){ return x.date === p.date; });
      return Object.assign({}, p, {type: local ? local.type : 'z2', method: local ? local.method : null});
    });
  }

  var rows = source.map(function(p){
    var acts = activities.filter(function(a){ return a.date === p.date; });
    var actualTSS = acts.reduce(function(s,a){ return s + calcTSS(a); }, 0);
    var actualMin = Math.round(acts.reduce(function(s,a){ return s + (a.dur||0); }, 0) / 60);
    var done = acts.length > 0;
    return {
      date: p.date,
      name: p.name,
      type: p.type,
      method: p.method,
      isQuality: !!QUALITY_TYPES[p.type],
      plannedTSS: p.tss || 0,
      plannedMin: p.durMin || 0,
      actualTSS: Math.round(actualTSS),
      actualMin: actualMin,
      actualNP: acts.length === 1 ? calcNP(acts[0]) : null,
      done: done,
      tssRatio: (p.tss > 0 && done) ? parseFloat((actualTSS / p.tss).toFixed(2)) : null,
      durRatio: (p.durMin > 0 && done) ? parseFloat((actualMin / p.durMin).toFixed(2)) : null
    };
  });

  var planned = rows.length;
  var completed = rows.filter(function(r){ return r.done; }).length;
  var withRatio = rows.filter(function(r){ return r.tssRatio != null; });
  var avgTSS = withRatio.length
    ? parseFloat((withRatio.reduce(function(s,r){ return s + r.tssRatio; },0) / withRatio.length).toFixed(2))
    : null;

  var quality = withRatio.filter(function(r){ return r.isQuality; });
  var avgQuality = quality.length
    ? parseFloat((quality.reduce(function(s,r){ return s + r.tssRatio; },0) / quality.length).toFixed(2))
    : null;

  complianceCache = {
    days: days, rows: rows, source: usedSource,
    planned: planned, completed: completed,
    completionPct: planned ? Math.round(completed / planned * 100) : null,
    avgTSSRatio: avgTSS, avgQualityRatio: avgQuality, qualityCount: quality.length,
    verdict: calibrationVerdict(avgQuality, quality.length)
  };
  return complianceCache;
}

/* Il target e' tarato bene?
   Servono almeno 4 sessioni di qualita' prima di dire qualcosa: con
   una o due il dato e' rumore, non un segnale. */
function calibrationVerdict(avgQualityRatio, n) {
  if (avgQualityRatio == null || n < 4) {
    return {level:'insufficiente', text:'Servono almeno 4 sessioni di qualità svolte per valutare la taratura dei target (ne risultano ' + (n||0) + ').'};
  }
  if (avgQualityRatio < 0.85) {
    return {level:'alti', text:'Nelle sessioni di qualità chiudi in media al ' + Math.round(avgQualityRatio*100) +
      '% del carico previsto: i target sono probabilmente troppo alti, oppure le stai accorciando con regolarità.'};
  }
  if (avgQualityRatio > 1.15) {
    return {level:'bassi', text:'Nelle sessioni di qualità superi in media del ' + Math.round((avgQualityRatio-1)*100) +
      '% il carico previsto: i target sono probabilmente troppo prudenti.'};
  }
  return {level:'ok', text:'I target di qualità sono tarati bene: chiudi in media al ' +
    Math.round(avgQualityRatio*100) + '% del carico previsto.'};
}

function renderCompliance() {
  var el = document.getElementById('compliance-render');
  if (!el) return;
  var c = computeCompliance(42);
  if (!c.planned) {
    el.innerHTML = '<div class="card" style="font-size:.7rem;color:var(--tx3);">Non ci sono ancora sessioni pianificate concluse da confrontare.</div>';
    return;
  }

  var vCol = {ok:'var(--grn)', alti:'var(--yel)', bassi:'var(--blu)', insufficiente:'var(--tx3)'}[c.verdict.level];
  var compCol = c.completionPct >= 80 ? 'var(--grn)' : c.completionPct >= 60 ? 'var(--yel)' : 'var(--red)';

  var html = '<div class="card">' +
    '<div class="ct">Aderenza al piano — ultimi ' + c.days + ' giorni</div>' +
    '<div style="display:flex;gap:22px;flex-wrap:wrap;margin-bottom:12px;">' +
      '<div><div style="font-size:1.4rem;font-weight:700;color:' + compCol + ';">' + c.completionPct + '%</div>' +
      '<div style="font-size:.58rem;color:var(--tx3);text-transform:uppercase;">sessioni svolte (' + c.completed + '/' + c.planned + ')</div></div>' +
      (c.avgTSSRatio != null ? '<div><div style="font-size:1.4rem;font-weight:700;">' + Math.round(c.avgTSSRatio*100) + '%</div>' +
      '<div style="font-size:.58rem;color:var(--tx3);text-transform:uppercase;">carico svolto / previsto</div></div>' : '') +
      (c.avgQualityRatio != null ? '<div><div style="font-size:1.4rem;font-weight:700;color:' + vCol + ';">' + Math.round(c.avgQualityRatio*100) + '%</div>' +
      '<div style="font-size:.58rem;color:var(--tx3);text-transform:uppercase;">solo sessioni di qualità</div></div>' : '') +
    '</div>' +
    '<div style="font-size:.7rem;color:' + vCol + ';line-height:1.6;padding-top:10px;border-top:1px solid var(--br);">' +
      c.verdict.text + '</div></div>';

  // dettaglio delle ultime sessioni
  var recent = c.rows.slice(-12).reverse();
  html += '<div class="card"><div class="ct">Dettaglio sessioni</div>';
  html += recent.map(function(r){
    var col = !r.done ? 'var(--red)'
            : r.tssRatio == null ? 'var(--tx3)'
            : r.tssRatio < 0.8 ? 'var(--yel)'
            : r.tssRatio > 1.2 ? 'var(--blu)' : 'var(--grn)';
    var right = r.done
      ? r.actualTSS + ' / ' + r.plannedTSS + ' TSS'
      : 'non svolta';
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--br);">' +
      '<span style="width:7px;height:7px;border-radius:50%;background:' + col + ';flex-shrink:0;"></span>' +
      '<div style="flex:1;min-width:0;"><div style="font-size:.72rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + r.name + '</div>' +
      '<div style="font-size:.58rem;color:var(--tx3);">' + r.date + (r.isQuality ? ' · qualità' : '') + '</div></div>' +
      '<div style="font-size:.68rem;color:' + col + ';white-space:nowrap;">' + right + '</div></div>';
  }).join('');
  html += '<div style="font-size:.6rem;color:var(--tx3);margin-top:9px;line-height:1.5;">' +
    'L\'abbinamento è per data: due uscite nello stesso giorno vengono sommate, e una sessione spostata al giorno dopo ' +
    'risulta non svolta. Va tenuto presente prima di trarre conclusioni.<br>' +
    (c.source === 'icu'
      ? 'Fonte del pianificato: il calendario Intervals.icu, cioè ciò che era stato realmente prescritto ed esportato.'
      : '<strong style="color:var(--yel);">Fonte del pianificato: piano ricostruito in memoria.</strong> ' +
        'Il piano passato viene rigenerato a ogni avvio, quindi non riflette necessariamente ciò che era stato proposto ' +
        'a suo tempo. Esporta il piano sul calendario per avere un confronto attendibile.') +
    '</div>';
  html += '</div>';

  el.innerHTML = html;
}
