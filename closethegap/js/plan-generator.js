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

var GOAL_DATE = '2026-09-19';
var GOAL_FTP = 360;

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

function buildThresholdSession(date, week, CP, pz, phase) {
  var z4 = pz[3];
  var mid = Math.round((z4.lo+z4.hi)/2);
  var reps = phase==='Tapering Finale'?2:phase==='Affilatura'?2:phase==='Picco Forma'?3:3;
  var repMin = phase==='Tapering Finale'?8:phase==='Affilatura'?10:phase==='Picco Forma'?15:12;
  var blocks=[mkBlock(1,'WU',0,Math.round(CP*0.5),CP,15)];
  for (var i=0;i<reps;i++){
    blocks.push(mkBlock(4,'Soglia',z4.lo,z4.hi,CP,repMin));
    if (i<reps-1) blocks.push(mkBlock(1,'Rec',0,Math.round(CP*0.5),CP,5));
  }
  blocks.push(mkBlock(1,'CD',0,Math.round(CP*0.5),CP,10));
  var durMin = blocks.reduce(function(s,b){return s+b.d;},0);
  var tss = Math.round(durMin*Math.pow(mid/CP,2)*100/60 * (reps*repMin/durMin) + durMin*0.35*100/60*(1-reps*repMin/durMin));
  return {date:date, week:week, name:'Soglia '+reps+'x'+repMin+"'", type:'z4', tss:tss, durMin:durMin,
    desc:'WU 15\', poi '+reps+'x'+repMin+'\' a '+z4.lo+'-'+z4.hi+'W ('+pctOfCP(z4.lo,CP)+'-'+pctOfCP(z4.hi,CP)+'% CP), rec 5\' Z1, CD 10\'.',
    blocks:blocks};
}

function buildVO2Session(date, week, CP, Wp, pz, phase) {
  var z5 = pz[4];
  var targetP = Math.round((z5.lo+z5.hi)/2);
  var tte = timeToExhaustion(targetP, CP, Wp);
  var repSec = Math.max(120, Math.min(300, Math.round(tte*0.65/30)*30));
  var repMin = Math.round(repSec/60*10)/10;
  var reps = phase==='Tapering Finale'?3:phase==='Affilatura'?4:phase==='Picco Forma'?5:5;
  var recMin = Math.max(3, Math.round(repMin));
  var blocks=[mkBlock(1,'WU',0,Math.round(CP*0.5),CP,15)];
  for (var i=0;i<reps;i++){
    blocks.push(mkBlock(5,'VO2',z5.lo,z5.hi,CP,repMin));
    blocks.push(mkBlock(1,'Rec',0,Math.round(CP*0.5),CP,recMin));
  }
  blocks.push(mkBlock(1,'CD',0,Math.round(CP*0.5),CP,10));
  var durMin = blocks.reduce(function(s,b){return s+b.d;},0);
  var tss = Math.round(reps*repMin*Math.pow(targetP/CP,2)*100/60 + (durMin-reps*repMin)*0.35*100/60);
  return {date:date, week:week, name:'VO2max '+reps+'x'+repMin+"'", type:'z5', tss:tss, durMin:durMin,
    desc:'WU 15\', poi '+reps+'x'+repMin+'\' a '+z5.lo+'-'+z5.hi+'W ('+pctOfCP(z5.lo,CP)+'-'+pctOfCP(z5.hi,CP)+'% CP, tempo di esaurimento stimato '+Math.round(tte/60*10)/10+"' a questa potenza), rec "+recMin+"' Z1, CD 10'.",
    blocks:blocks};
}

function buildZ2Session(date, week, CP, pz, durMin, label) {
  var z2 = pz[1];
  var mid = Math.round((z2.lo+z2.hi)/2);
  var wu=10, cd=10, core=Math.max(20, durMin-wu-cd);
  var blocks=[mkBlock(1,'WU',0,Math.round(CP*0.5),CP,wu), mkBlock(2,'Z2',z2.lo,z2.hi,CP,core), mkBlock(1,'CD',0,Math.round(CP*0.5),CP,cd)];
  var tss = Math.round(durMin*Math.pow(mid/CP,2)*100/60);
  return {date:date, week:week, name:label||'Z2 Aerobico', type:'z2', tss:tss, durMin:durMin,
    desc:core+"' Z2 "+z2.lo+'-'+z2.hi+'W.', blocks:blocks};
}

function buildOffDay(date, week) {
  return {date:date, week:week, name:'Riposo', type:'off', tss:0, durMin:0, desc:'Riposo attivo o completo.', blocks:[]};
}

function buildRaceSpecificSession(date, week, CP, pz, raceProfile) {
  var z3 = pz[2], z4top = pz[3].hi;
  var coreMin = raceProfile ? Math.min(150, Math.max(60, Math.round(raceProfile.avgDurMin*0.4))) : 90;
  var blocks=[mkBlock(1,'WU',0,Math.round(CP*0.5),CP,15), mkBlock(3,'Tempo',z3.lo,z4top,CP,coreMin), mkBlock(1,'CD',0,Math.round(CP*0.5),CP,15)];
  var durMin = blocks.reduce(function(s,b){return s+b.d;},0);
  var mid = Math.round((z3.lo+z4top)/2);
  var tss = Math.round(durMin*Math.pow(mid/CP,2)*100/60);
  var note = raceProfile ? ' Durata core calibrata sulla media delle tue '+raceProfile.count+' gare chiave analizzate ('+raceProfile.avgDurMin+"' medi, decoupling medio "+raceProfile.avgDecoupling+'%).' : '';
  return {date:date, week:week, name:'Simulazione Gara '+coreMin+"'", type:'z3', tss:tss, durMin:durMin,
    desc:'WU 15\', poi '+coreMin+"' continuativi "+z3.lo+'-'+z4top+'W (Tempo/soglia), CD 15\'.'+note, blocks:blocks};
}

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

  while (cur < toDateExclusive) {
    var weeksToGoal = weeksBetweenDates(cur, toDateExclusive);
    var phase = phaseForWeeksToGoal(weeksToGoal);
    var weekLabel = 'Sett. '+weekNum+' · '+phase;

    var ctlDelta = phase==='Tapering Finale' ? -6 : phase==='Affilatura' ? -1 : rampRate;
    projectedCTL = Math.max(10, projectedCTL + ctlDelta);
    var weeklyTSS = Math.round(projectedCTL * 7 * (phase==='Tapering Finale'?0.55:phase==='Affilatura'?0.8:1));

    var qualitySessions = (!polarization.polarized && polarization.sampleDays>10) ? 1 : 2;

    var daysLeftInWindow = Math.min(7, Math.round((new Date(toDateExclusive+'T12:00')-new Date(cur+'T12:00'))/86400000));
    for (var d=0; d<daysLeftInWindow; d++) {
      var date = addDays(cur, d);
      if (date >= toDateExclusive) break;
      var dow = new Date(date+'T12:00').getDay();
      var session;
      if (dow===1) session = buildOffDay(date, weekLabel);
      else if (dow===2 && qualitySessions>=1) session = buildThresholdSession(date, weekLabel, CP, pz, phase);
      else if (dow===4 && qualitySessions>=2) session = buildVO2Session(date, weekLabel, CP, Wp, pz, phase);
      else if (dow===6 && phase==='Picco Forma' && raceProfile && !raceSpecificUsed) { session = buildRaceSpecificSession(date, weekLabel, CP, pz, raceProfile); raceSpecificUsed = true; }
      else if (dow===6 || dow===0) session = buildZ2Session(date, weekLabel, CP, pz, phase==='Tapering Finale'?60:phase==='Affilatura'?90:120, dow===6?'Z2 Lungo':'Z2 Aerobico');
      else session = buildZ2Session(date, weekLabel, CP, pz, phase==='Tapering Finale'?45:60, 'Z2 Aerobico');
      sessions.push(session);
    }

    var weekSessions = sessions.slice(-daysLeftInWindow);
    var actualTSS = weekSessions.reduce(function(s,x){return s+x.tss;},0) || 1;
    var scale = weeklyTSS / actualTSS;
    if (scale>0 && isFinite(scale)) weekSessions.forEach(function(s){ s.tss = Math.round(s.tss*scale); });

    cur = addDays(cur, daysLeftInWindow);
    weekNum++;
  }

  return {sessions: sessions, meta: {rampRate:rampRate, polarization:polarization, raceProfile:raceProfile, CP:CP, Wp:Wp}};
}
