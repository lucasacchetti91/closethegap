/* ============================================================
   PLAN-GENERATOR.JS
   Genera algoritmicamente le sessioni future (da oggi alla gara
   obiettivo), usando solo dati reali invece di un calendario scritto
   a mano. Metodi applicati (vedi anche il messaggio in chat per i
   riferimenti):

   1. Zone di potenza individualizzate (zones.js) - CP/W'/Pmax reali,
      non %FTP da manuale.
   2. Ramp rate dimostrato (demonstratedRampRate) - quanto CTL/settimana
      hai già dimostrato di reggere senza far crollare il TSB sotto una
      soglia di allarme, ispirato ai lavori di Gabbett su ACWR. Clampato
      comunque in un range di sicurezza letterario (3-8 CTL/settimana).
   3. Controllo di polarizzazione reale (polarizationCheck) - quanto
      tempo passi davvero in bassa/alta intensità (Seiler 80/20) negli
      ultimi 42 giorni, non un'assunzione.
   4. Profilo di sforzo delle gare analizzate (raceDemandProfile) - usa
      i decoupling/durate reali di GF Biella/Colma/Nove Colli/Strade
      Bianche per calibrare la sessione "specifica gara" nella fase di
      picco (principio di specificità, Coggan & Allen / Friel).
   5. Progressione aerobica gate-ata da EF/Decoupling (il trend è
      mostrato in Analisi ed è usato qui come controllo di sicurezza,
      non ancora per modulare direttamente il volume Z2).
   6. Proiezione Banister (già in models.js) per verificare che il TSB
      atteso al giorno della gara sia nel range "picco forma".

   Le sessioni chiave (soglia/VO2max) dimensionano le ripetute usando
   la formula CP + W'/t (tempo di esaurimento sopra CP), non tabelle
   generiche - quindi cambiano automaticamente quando cambia la tua
   forma reale.
   ============================================================ */

var GOAL_DATE_CONFIGURED = '2026-09-19'; // obiettivo impostato a mano
var GOAL_DATE = GOAL_DATE_CONFIGURED;    // effettivo, può essere esteso dalle gare
var GOAL_FTP = 360;

/* Il piano si generava solo fino alla data obiettivo scritta a mano:
   qualunque gara successiva veniva semplicemente ignorata, senza
   avviso. Ora l'orizzonte si estende fino all'ultima gara in
   calendario, così ogni gara riceve il suo scarico e il suo recupero. */
function resolveGoalDate() {
  GOAL_DATE = GOAL_DATE_CONFIGURED;
  if (typeof races !== 'undefined' && races.length) {
    var td = today();
    var future = races.filter(function(r){ return r.date >= td; });
    if (future.length) {
      var last = future[future.length-1].date;
      if (last > GOAL_DATE) GOAL_DATE = last;
    }
  }
  return GOAL_DATE;
}

function addDays(ds, n) { var d=new Date(ds+'T12:00'); d.setDate(d.getDate()+n); return dateKey(d); }
function weeksBetweenDates(d1,d2){ return Math.round((new Date(d2+'T12:00')-new Date(d1+'T12:00'))/(7*86400000)); }

function demonstratedRampRate() {
  var pmc = computePMC();
  var h = pmc.history;
  if (h.length < 21) return 5;
  var weekly = [];
  for (var i=7;i<h.length;i+=7) {
    var delta = h[i].ctl - h[i-7].ctl;
    var windowSlice = h.slice(i, Math.min(i+14, h.length));
    var futureTSBmin = windowSlice.length ? Math.min.apply(null, windowSlice.map(function(x){return x.tsb;})) : 0;
    weekly.push({delta:delta, safe: futureTSBmin > -28});
  }
  var safeDeltas = weekly.filter(function(w){return w.safe && w.delta>0;}).map(function(w){return w.delta;});
  if (!safeDeltas.length) return 5;
  safeDeltas.sort(function(a,b){return a-b;});
  var p75 = safeDeltas[Math.floor(safeDeltas.length*0.75)] || 5;
  return Math.min(Math.max(Math.round(p75), 3), 8);
}

function polarizationCheck() {
  var cutoff = new Date(); cutoff.setDate(cutoff.getDate()-42);
  var recent = activities.filter(function(a){ return new Date(a.date) >= cutoff && a.avg_watts; });
  var pz = computePowerZones();
  var timeByZone = {};
  recent.forEach(function(a){
    for (var i=0;i<pz.length;i++){
      if (a.avg_watts>=pz[i].lo && a.avg_watts<pz[i].hi){ timeByZone[pz[i].z]=(timeByZone[pz[i].z]||0)+a.dur; break; }
    }
  });
  var total = Object.keys(timeByZone).reduce(function(s,k){return s+timeByZone[k];},0) || 1;
  var lowPct = ((timeByZone[1]||0)+(timeByZone[2]||0))/total*100;
  var highPct = ((timeByZone[4]||0)+(timeByZone[5]||0)+(timeByZone[6]||0)+(timeByZone[7]||0))/total*100;
  return {lowPct:Math.round(lowPct), highPct:Math.round(highPct), polarized: lowPct>=75, sampleDays: recent.length};
}

function raceDemandProfile() {
  var races = activities.filter(function(a){return a.stream_wbal_min_kj!=null || a.icu_decoupling!=null;});
  if (!races.length) return null;
  var decouplings = races.map(function(a){ return a.icu_decoupling!=null?a.icu_decoupling:a.stream_decoupling_pct; }).filter(function(v){return v!=null;});
  var avgDecoupling = decouplings.length ? decouplings.reduce(function(s,v){return s+v;},0)/decouplings.length : null;
  var avgDurMin = Math.round(races.reduce(function(s,a){return s+a.dur;},0)/races.length/60);
  return {avgDecoupling: avgDecoupling!=null?parseFloat(avgDecoupling.toFixed(1)):null, avgDurMin:avgDurMin, count:races.length};
}

function timeToExhaustion(p, CP, Wp) {
  if (p<=CP) return Infinity;
  return Wp/(p-CP);
}

function pctOfCP(watts, CP) { return Math.round(watts/CP*100); }

function mkBlock(z, l, loW, hiW, CP, durMin) {
  return {z:z, l:l, lo:pctOfCP(loW,CP), hi:pctOfCP(hiW,CP), d:durMin};
}

/* NOTA: i vecchi builder monolitici (buildThresholdSession, buildVO2Session,
   buildZ2Session, buildWeekendLongSession) sono stati rimossi: sono
   sostituiti dalla libreria di formati in workouts.js, che offre più
   varietà e dimensiona tutto sui tuoi CP/W' reali. */


function phaseForWeeksToGoal(w) {
  if (w<=1) return 'Tapering Finale';
  if (w<=2) return 'Affilatura';
  if (w<=4) return 'Picco Forma';
  return 'Costruzione';
}

function generateFuturePlan(fromDate, toDateExclusive) {
  var cp = cpModel();
  var CP = cp.CP, Wp = cp.Wp;
  var pz = computePowerZones();
  var rampRate = demonstratedRampRate();
  var polarization = polarizationCheck();
  var raceProfile = raceDemandProfile();
  var pmc = computePMC();
  var projectedCTL = pmc.ctl;

  var sessions = [];
  var cur = fromDate;
  var weekNum = 1;
  var raceSpecificUsed = false;
  /* Vincoli imposti dal calendario gare di Intervals.icu: giorni di
     gara, scarico prima e recupero dopo. Hanno la precedenza su
     qualunque sessione il generatore avrebbe messo. */
  var raceConstraints = (typeof buildRaceConstraints === 'function')
    ? buildRaceConstraints(fromDate, toDateExclusive) : {};

  /* Enfasi dettata dagli obiettivi della prossima gara A: se manca
     soprattutto CP i lavori a soglia salgono nella rotazione, se manca
     W' salgono quelli brevi e intensi. Nessun formato viene eliminato:
     azzerare una qualita' per settimane e' controproducente. */
  var raceEmph = (typeof activeRaceEmphasis === 'function') ? activeRaceEmphasis() : null;

  while (cur < toDateExclusive) {
    var weeksToGoal = weeksBetweenDates(cur, toDateExclusive);
    var phase = phaseForWeeksToGoal(weeksToGoal);
    var weekLabel = 'Sett. '+weekNum+' · '+phase;

    var ctlDelta = phase==='Tapering Finale' ? -6 : phase==='Affilatura' ? -1 : rampRate;
    projectedCTL = Math.max(10, projectedCTL + ctlDelta);
    var weeklyTSS = Math.round(projectedCTL * 7 * (phase==='Tapering Finale'?0.55:phase==='Affilatura'?0.8:1));

    // Vincoli richiesti: 3-4 uscite/settimana, una uscita lunga (o gara)
    // nel weekend dove vanno i lavori più lunghi, le infrasettimanali
    // sempre <=2h e senza ripetute lunghe di soglia.
    // I formati vengono pescati dalla libreria in workouts.js ruotando
    // con l'indice di settimana, così non si ripetono identici.
    var ridesPerWeek = (phase==='Tapering Finale' || phase==='Affilatura') ? 3 : 4;
    var midweekQuality = !(!polarization.polarized && polarization.sampleDays>10);
    var weekIdx = weekNum-1;

    var daysLeftInWindow = Math.min(7, Math.round((new Date(toDateExclusive+'T12:00')-new Date(cur+'T12:00'))/86400000));
    for (var d=0; d<daysLeftInWindow; d++) {
      var date = addDays(cur, d);
      if (date >= toDateExclusive) break;
      var dow = new Date(date+'T12:00').getDay(); // 0=Dom..6=Sab
      var session = null;

      /* I vincoli gara vengono prima di tutto il resto. */
      var rc = raceConstraints[date];
      if (rc) {
        if (rc.kind === 'race')          session = buildRaceSession(date, weekLabel, rc.race, CP, pz);
        else if (rc.kind === 'taper')    session = buildTaperSession(date, weekLabel, CP, pz, rc);
        else if (rc.kind === 'recovery') session = buildRecoverySession(date, weekLabel, CP, pz, rc);
        if (session) { sessions.push(session); continue; }
      }

      if (dow===6) {
        // Sabato: uscita lunga - qui i lavori più lunghi. In Picco Forma
        // la simulazione gara viene usata una volta sola, il resto
        // ruota tra durabilità e lungo+soglia.
        var wkKey = pickFromPool(WEEKEND_POOL, phase, weekIdx);
        if (wkKey==='racesim') {
          if (raceProfile && !raceSpecificUsed) { raceSpecificUsed = true; }
          else { wkKey = 'durability'; }
        }
        session = buildByKey(wkKey, date, weekLabel, CP, Wp, pz, phase, raceProfile);
      } else if (dow===2) {
        // Martedì: qualità corta infrasettimanale (sempre <2h); se la
        // polarizzazione reale è sbilanciata verso l'alta intensità,
        // diventa Z2 per riequilibrare (Seiler 80/20).
        var midPool = (MIDWEEK_QUALITY_POOL[phase] || MIDWEEK_QUALITY_POOL['Costruzione']);
        if (raceEmph && typeof weightPoolByEmphasis === 'function') {
          midPool = weightPoolByEmphasis(midPool, raceEmph.emphasis);
        }
        session = midweekQuality
          ? buildByKey(midPool[weekIdx % midPool.length], date, weekLabel, CP, Wp, pz, phase, raceProfile)
          : buildZ2Simple(date, weekLabel, CP, pz, 75, 'Z2 Aerobico');
      } else if (dow===4 && ridesPerWeek>=3) {
        // Giovedì: seconda seduta infrasettimanale. In Costruzione ogni
        // tanto una qualità leggera diversa da quella del martedì,
        // altrimenti Z2 corto.
        session = (phase==='Costruzione' && weekIdx%2===1)
          ? buildSweetSpot(date, weekLabel, CP, pz, phase, 100)
          : buildZ2Simple(date, weekLabel, CP, pz, 75, 'Z2 Aerobico');
      } else if (dow===0 && ridesPerWeek>=4) {
        // Domenica (solo se 4 uscite/settimana): Z2 breve di scarico
        session = buildZ2Simple(date, weekLabel, CP, pz, 60, 'Z2 Recupero');
      } else {
        session = buildOffDay(date, weekLabel);
      }
      // Sicurezza: nessuna uscita infrasettimanale sopra le 2h.
      if (dow!==6 && session && session.durMin>120) session.durMin=120;
      sessions.push(session);
    }

    /* Riscalamento verso il TSS settimanale target. Volutamente
       CLAMPATO: il fattore può solo ritoccare le sessioni (±15%), non
       stravolgerle - senza limite un'ultima settimana con poche uscite
       produceva assurdità tipo uno Z2 di 75' a 131 TSS. Se il target
       settimanale non è raggiungibile con questa struttura, è giusto
       che resti non raggiunto: la struttura viene prima del numero. */
    var weekSessions = sessions.slice(-daysLeftInWindow);
    /* Gara, scarico e recupero NON vengono riscalati: il carico di una
       gara è quello che è, e uno scarico riscalato all'insù smetterebbe
       di essere uno scarico. Il riscalamento agisce solo sulle sessioni
       di allenamento vere e proprie. */
    var fixedKinds = {race:1, taper:1, recovery:1};
    var adjustable = weekSessions.filter(function(x){ return !fixedKinds[x.method]; });
    var fixedTSS = weekSessions.filter(function(x){ return fixedKinds[x.method]; })
                               .reduce(function(s,x){return s+x.tss;},0);
    var actualTSS = adjustable.reduce(function(s,x){return s+x.tss;},0) || 1;
    var scale = (weeklyTSS - fixedTSS) / actualTSS;
    scale = Math.max(0.85, Math.min(1.15, scale));
    if (scale>0 && isFinite(scale)) adjustable.forEach(function(s){ s.tss = Math.round(s.tss*scale); });

    cur = addDays(cur, daysLeftInWindow);
    weekNum++;
  }

  return {sessions: sessions, meta: {rampRate:rampRate, polarization:polarization, raceProfile:raceProfile,
          CP:CP, Wp:Wp, raceEmphasis: raceEmph, racesPlanned: Object.keys(raceConstraints).filter(function(d){return raceConstraints[d].kind==='race';}).length}};
}
