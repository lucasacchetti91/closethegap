/* ============================================================
   EXPORT.JS
   Manda gli allenamenti generati sul calendario di Intervals.icu, da
   dove Garmin li scarica sul ciclocomputer.

   PERCHE' PASSARE DA INTERVALS.ICU: l'API di Garmin Connect permette
   solo di LEGGERE dati, non di inviare allenamenti. Scrivere sul
   calendario di Intervals.icu e' quindi l'unica strada praticabile per
   ritrovarsi la sessione strutturata sull'Edge.

   IDEMPOTENZA: ogni sessione viene marcata con un external_id nostro
   (ctg-<data>). Intervals.icu usa quel campo proprio per la mappatura
   con sistemi esterni, quindi rigenerare ed esportare di nuovo
   AGGIORNA l'evento esistente invece di crearne un doppione.

   UNITA' DI MISURA: i target vengono scritti come percentuale di FTP.
   Attenzione a un dettaglio che sarebbe facile sbagliare: la nostra
   percentuale e' riferita al CP calcolato dall'app, mentre
   Intervals.icu risolve "%ftp" usando l'FTP impostato NEL PROFILO
   dell'atleta. Se i due valori differiscono, i watt sull'orologio non
   sarebbero quelli previsti. Per questo si convertono prima i blocchi
   in watt assoluti (usando il nostro CP) e poi li si riesprime in
   percentuale dell'FTP di Intervals.icu.
   ============================================================ */

var lastExportResult = null;

/* FTP che Intervals.icu usa per risolvere le percentuali. */
function icuReferenceFTP() {
  if (typeof ICU_ZONE_DEFS !== 'undefined' && ICU_ZONE_DEFS &&
      ICU_ZONE_DEFS.power && ICU_ZONE_DEFS.power.ftp) return ICU_ZONE_DEFS.power.ftp;
  return FTP;
}

/* Un blocco della nostra sessione -> uno o piu' step di workout_doc.
   I micro-intervalli (30/15, 40/20) vengono espansi in step reali:
   l'orologio deve emettere il beep a ogni cambio, quindi non basta un
   blocco unico con la potenza media. */
function blocksToSteps(session, CP, refFTP) {
  var steps = [];
  function pct(watts) { return Math.round(watts / refFTP * 1000) / 10; }

  (session.blocks || []).forEach(function (b) {
    var loW = Math.round(CP * b.lo / 100);
    var hiW = Math.round(CP * b.hi / 100);

    if (b.micro) {
      var onW = Math.round(CP * b.micro.onPct / 100);
      var offW = Math.round(CP * b.micro.offPct / 100);
      var cycle = b.micro.onSec + b.micro.offSec;
      var reps = Math.max(1, Math.round(b.d * 60 / cycle));
      for (var i = 0; i < reps; i++) {
        steps.push({ duration: b.micro.onSec, power: { value: pct(onW), units: '%ftp' } });
        steps.push({ duration: b.micro.offSec, power: { value: pct(offW), units: '%ftp' } });
      }
      return;
    }

    var step = { duration: Math.round(b.d * 60) };
    if (b.l === 'WU') { step.warmup = true; step.ramp = true; }
    if (b.l === 'CD') { step.cooldown = true; step.ramp = true; }
    if (loW === hiW) step.power = { value: pct(loW), units: '%ftp' };
    else step.power = { start: pct(loW), end: pct(hiW), units: '%ftp' };
    if (b.l) step.text = b.l;
    steps.push(step);
  });
  return steps;
}

function buildWorkoutDoc(session, CP, refFTP) {
  var steps = blocksToSteps(session, CP, refFTP);
  return {
    duration: steps.reduce(function (s, x) { return s + x.duration; }, 0),
    ftp: Math.round(refFTP),
    target: 'POWER',
    description: (session.desc || '').slice(0, 800),
    steps: steps
  };
}

function sessionToEvent(session, CP, refFTP) {
  return {
    start_date_local: session.date + 'T00:00:00',
    category: session.type === 'race' ? 'RACE_B' : 'WORKOUT',
    type: 'Ride',
    name: session.name,
    description: session.desc || '',
    external_id: 'ctg-' + session.date,   // chiave nostra: rende l'export idempotente
    moving_time: Math.round((session.durMin || 0) * 60),
    icu_training_load: session.tss || null,
    workout_doc: buildWorkoutDoc(session, CP, refFTP)
  };
}

/* Esporta le sessioni future (esclusi riposo e gare, che non sono
   allenamenti da eseguire su indicazione dell'orologio). */
async function exportPlanToICU(opts) {
  opts = opts || {};
  var daysAhead = opts.daysAhead || 21;
  var el = document.getElementById('export-status');
  function say(msg, color) { if (el) { el.textContent = msg; el.style.color = color || 'var(--tx3)'; } }

  var cp = cpModel();
  var refFTP = icuReferenceFTP();
  var td = today();
  var limit = addDays(td, daysAhead);

  var toSend = plan.filter(function (p) {
    return p.date >= td && p.date < limit &&
           p.type !== 'off' && p.type !== 'race' &&
           p.blocks && p.blocks.length;
  });

  if (!toSend.length) { say('Nessuna sessione da esportare nei prossimi ' + daysAhead + ' giorni.'); return null; }

  say('Invio di ' + toSend.length + ' sessioni…');
  var ok = 0, failed = [];

  for (var i = 0; i < toSend.length; i++) {
    var ev = sessionToEvent(toSend[i], cp.CP, refFTP);
    try {
      var resp = await icuFetch('/events?upsert=true', {
        method: 'POST',
        body: JSON.stringify(ev)
      });
      if (resp.ok) ok++;
      else failed.push(toSend[i].date + ' (HTTP ' + resp.status + ')');
    } catch (e) {
      failed.push(toSend[i].date + ' (' + e.message + ')');
    }
  }

  lastExportResult = { sent: ok, failed: failed, refFTP: refFTP, at: new Date().toISOString() };
  if (failed.length) {
    say('Inviate ' + ok + '/' + toSend.length + '. Errori: ' + failed.slice(0, 3).join(', ') +
        (failed.length > 3 ? '…' : ''), 'var(--red)');
    console.warn('Export: sessioni non inviate', failed);
  } else {
    say('✅ ' + ok + ' sessioni sul calendario Intervals.icu (target su FTP ' + Math.round(refFTP) + 'W)', 'var(--grn)');
  }
  return lastExportResult;
}
