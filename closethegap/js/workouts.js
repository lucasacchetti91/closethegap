/* ============================================================
   WORKOUTS.JS
   Libreria di formati di allenamento, ognuno dimensionato sui TUOI
   CP/W'/Pmax reali. Sostituisce i due soli schemi ripetuti all'infinito
   della versione precedente.

   Riferimenti (con onestà sul livello di evidenza - vedi anche il
   messaggio in chat):

   - 30/15 di Rønnestad: 3 serie da 13x(30s on / 15s off). Studi di
     Rønnestad et al. (2015, e repliche successive) mostrano più tempo
     sopra il 90% del VO2max e miglioramenti superiori rispetto ai
     classici 4-5x5'. ATTENZIONE: le critiche metodologiche sono reali e
     documentate - nel confronto originale il gruppo 30/15 svolgeva più
     lavoro totale rispetto al gruppo 5x5', quindi parte del vantaggio
     può derivare dal volume e non dal formato; inoltre parte
     dell'effetto potrebbe essere un effetto-taper. È un formato valido,
     non una bacchetta magica.
   - Intervalli alternati "Bossi": 5x5' con oscillazione invece che a
     potenza costante. Bossi et al. hanno riportato VO2peak più alto e
     più tempo sopra il 90% VO2max rispetto a ripetute costanti.
   - Fast-start: partenza dura ~90s poi potenza leggermente più bassa.
     Rønnestad et al. su fondisti: più tempo sopra 90% VO2max senza
     essere percepito come più duro.
   - Durabilità / fatigue resistance: filone di ricerca recente
     (Maunder/Seiler 2021, Mateo-March 2022, e uno studio 2025 su
     amatori) - la capacità di mantenere potenza DOPO lavoro accumulato
     discrimina gli atleti più forti meglio dei valori "da fresco". Per
     una gran fondo è probabilmente il singolo concetto più rilevante.
     Nota: una revisione sistematica recente avverte che i kJ da soli
     non bastano come metrica di fatica, perché l'intensità del lavoro
     precedente conta molto - qui i kJ sono usati come target pratico,
     consapevoli del limite.
   - Over-under / criss-cross e Sweet Spot: pratica consolidata di
     scuola Coggan/Seiler, meno "nuovi" ma utili e time-efficient.
   - Lavoro di forza-resistenza a bassa cadenza: pratica diffusa,
     evidenza più debole e contrastata rispetto ai punti sopra - inserito
     con parsimonia, non come pilastro.
   ============================================================ */

/* Calcolo TSS uniforme da una lista di blocchi, via media alla quarta
   potenza (stessa logica della Normalized Power). Gestisce anche i
   micro-intervalli, dove il pattern on/off va pesato al suo interno e
   non appiattito su una media semplice. */
function tssFromBlocks(blocks, CP) {
  var totalMin = 0, sumP4 = 0;
  blocks.forEach(function(b) {
    var d = b.d;
    totalMin += d;
    if (b.micro) {
      var onFrac = b.micro.onSec/(b.micro.onSec+b.micro.offSec);
      var onI = b.micro.onPct/100, offI = b.micro.offPct/100;
      sumP4 += (Math.pow(onI,4)*onFrac + Math.pow(offI,4)*(1-onFrac)) * d;
    } else {
      var i = ((b.lo+b.hi)/2)/100;
      sumP4 += Math.pow(i,4) * d;
    }
  });
  if (!totalMin) return 0;
  var normI = Math.pow(sumP4/totalMin, 0.25); // IF rispetto a CP
  return Math.round(totalMin/60 * Math.pow(normI,2) * 100);
}

function finishSession(date, week, name, type, blocks, CP, desc, tag) {
  var durMin = blocks.reduce(function(s,b){return s+b.d;},0);
  return {date:date, week:week, name:name, type:type, tss:tssFromBlocks(blocks,CP),
          durMin:Math.round(durMin), desc:desc, blocks:blocks, method:tag};
}

function wuBlock(CP, min) { return {z:1,l:'WU',lo:45,hi:60,d:min||15}; }
function cdBlock(CP, min) { return {z:1,l:'CD',lo:40,hi:55,d:min||10}; }

/* ---------- 1. Rønnestad 30/15 (VO2max microintervalli) ----------
   Potenza "on" ~ MAP (potenza aerobica massimale, approssimata dal tuo
   miglior 5' reale), "off" ~ 50% di quella. 3 serie da 13 ripetizioni. */
function buildRonnestad3015(date, week, CP, Wp, pz, phase) {
  var map = Math.round(CP + Wp/300); // potenza sostenibile ~5min = proxy di MAP
  var onPct = Math.round(map/CP*100);
  var offPct = Math.round(onPct*0.5);
  var series = phase==='Affilatura' ? 2 : 3;
  var reps = 13;
  var seriesMin = reps*(30+15)/60; // 9.75'
  var blocks=[wuBlock(CP,15)];
  for (var s=0;s<series;s++){
    blocks.push({z:5,l:reps+'x30/15',lo:offPct,hi:onPct,d:seriesMin,
                 micro:{onSec:30,offSec:15,onPct:onPct,offPct:offPct}});
    if (s<series-1) blocks.push({z:1,l:'Rec',lo:40,hi:55,d:5});
  }
  blocks.push(cdBlock(CP,10));
  var desc = 'Protocollo Rønnestad: '+series+' serie da '+reps+'x(30s a '+map+'W / 15s a '+Math.round(map*0.5)+'W), rec 5\' tra le serie. '+
             'La potenza "on" è la tua MAP stimata (CP + W\'/5min). Obiettivo: massimizzare il tempo sopra il 90% del VO2max. '+
             'Se non riesci a completare l\'ultima serie alla potenza target, abbassa di 10-15W invece di chiudere in anticipo.';
  return finishSession(date,week,'Rønnestad '+series+'x13x30/15','z5',blocks,CP,desc,'ronnestad-3015');
}

/* ---------- 2. Intervalli alternati stile "Bossi" ----------
   5x5' dove dentro ogni ripetuta si oscilla sopra/sotto invece di
   tenere potenza costante: più tempo sopra il 90% VO2max. */
function buildBossiAlternating(date, week, CP, Wp, pz, phase) {
  var base = Math.round(CP*1.02);
  var high = Math.round(CP*1.18);
  var reps = phase==='Affilatura'?3:4;
  var blocks=[wuBlock(CP,15)];
  for (var i=0;i<reps;i++){
    // 5' = 5 cicli da (30s alto + 30s base) ... rappresentati compatti
    blocks.push({z:5,l:'Alt 5\'',lo:Math.round(base/CP*100),hi:Math.round(high/CP*100),d:5,
                 micro:{onSec:30,offSec:30,onPct:Math.round(high/CP*100),offPct:Math.round(base/CP*100)}});
    if (i<reps-1) blocks.push({z:1,l:'Rec',lo:40,hi:55,d:5});
  }
  blocks.push(cdBlock(CP,10));
  var desc = reps+'x5\' alternati: dentro ogni ripetuta alterna 30s a '+high+'W e 30s a '+base+'W (invece di tenere potenza costante). '+
             'Rec 5\' tra le ripetute. L\'oscillazione porta il VO2 più in alto rispetto alla stessa ripetuta a potenza piatta.';
  return finishSession(date,week,'Alternati '+reps+"x5'",'z5',blocks,CP,desc,'bossi-alternating');
}

/* ---------- 3. Fast-start VO2max ----------
   90s duri in apertura, poi il resto della ripetuta leggermente più
   basso: sale prima il VO2 e ci resta più a lungo. */
function buildFastStartVO2(date, week, CP, Wp, pz, phase) {
  var startP = Math.round(CP + Wp/120);   // duro, sostenibile ~2min
  var holdP  = Math.round(CP*1.06);
  var reps = phase==='Affilatura'?3:4;
  var blocks=[wuBlock(CP,15)];
  for (var i=0;i<reps;i++){
    blocks.push({z:6,l:'Start',lo:Math.round(startP/CP*100)-3,hi:Math.round(startP/CP*100),d:1.5});
    blocks.push({z:5,l:'Hold',lo:Math.round(holdP/CP*100)-3,hi:Math.round(holdP/CP*100),d:3.5});
    if (i<reps-1) blocks.push({z:1,l:'Rec',lo:40,hi:55,d:5});
  }
  blocks.push(cdBlock(CP,10));
  var desc = reps+'x5\' con partenza dura: primi 90s a '+startP+'W, poi 3\'30" a '+holdP+'W. Rec 5\'. '+
             'Il fast-start fa salire il VO2 prima, così si accumula più tempo vicino al massimo nella stessa ripetuta.';
  return finishSession(date,week,'Fast-start '+reps+"x5'",'z5',blocks,CP,desc,'fast-start');
}

/* ---------- 4. Over-Under (criss-cross) ----------
   Alterna appena sotto e appena sopra soglia: allena la capacità di
   tamponare/riciclare lattato mentre si continua a spingere. */
function buildOverUnder(date, week, CP, pz, phase) {
  var under = Math.round(CP*0.95), over = Math.round(CP*1.05);
  var sets = phase==='Affilatura'?2:3;
  var setMin = phase==='Picco Forma'?12:10;
  var blocks=[wuBlock(CP,15)];
  for (var i=0;i<sets;i++){
    blocks.push({z:4,l:'O/U '+setMin+"'",lo:Math.round(under/CP*100),hi:Math.round(over/CP*100),d:setMin,
                 micro:{onSec:120,offSec:180,onPct:Math.round(over/CP*100),offPct:Math.round(under/CP*100)}});
    if (i<sets-1) blocks.push({z:1,l:'Rec',lo:40,hi:55,d:5});
  }
  blocks.push(cdBlock(CP,10));
  var desc = sets+'x'+setMin+'\' over-under: alterna 3\' a '+under+'W (under) e 2\' a '+over+'W (over) senza pause dentro il blocco. Rec 5\' tra i blocchi. '+
             'Serve a gestire lo sforzo quando il ritmo cambia in continuazione - esattamente cosa succede in gruppo in gran fondo.';
  return finishSession(date,week,'Over-Under '+sets+'x'+setMin+"'",'z4',blocks,CP,desc,'over-under');
}

/* ---------- 5. Sweet Spot (88-94% CP) ----------
   Rapporto stimolo/fatica favorevole, buono per infrasettimanali corte. */
function buildSweetSpot(date, week, CP, pz, phase, maxMin) {
  var lo = Math.round(CP*0.88), hi = Math.round(CP*0.94);
  var reps = 3, repMin = 12;
  if (maxMin && maxMin<90) { reps=2; repMin=15; }
  var blocks=[wuBlock(CP,12)];
  for (var i=0;i<reps;i++){
    blocks.push({z:3,l:'SST',lo:88,hi:94,d:repMin});
    if (i<reps-1) blocks.push({z:1,l:'Rec',lo:40,hi:55,d:4});
  }
  blocks.push(cdBlock(CP,8));
  var desc = reps+'x'+repMin+'\' in sweet spot a '+lo+'-'+hi+'W (88-94% CP), rec 4\'. '+
             'Carico aerobico alto con recupero più rapido rispetto a lavori a soglia piena: adatto a una seduta infrasettimanale.';
  return finishSession(date,week,'Sweet Spot '+reps+'x'+repMin+"'",'z3',blocks,CP,desc,'sweet-spot');
}

/* ---------- 6. Ripetute di deplezione W' ----------
   Dimensionate per consumare una frazione target della TUA riserva
   anaerobica reale, con recuperi calcolati per ricaricarla solo in
   parte: allena la tolleranza a ripetuti attacchi sopra CP. */
function buildWprimeRepeats(date, week, CP, Wp, pz, phase) {
  var targetFrac = 0.6; // consuma il 60% di W' per ripetuta
  var p = Math.round(CP + Wp/180); // potenza sostenibile ~3min
  var repSec = Math.round(Wp*targetFrac/(p-CP));
  repSec = Math.max(45, Math.min(180, Math.round(repSec/15)*15));
  var reps = phase==='Affilatura'?4:6;
  var recMin = 3;
  var blocks=[wuBlock(CP,15)];
  for (var i=0;i<reps;i++){
    blocks.push({z:6,l:repSec+'s',lo:Math.round(p/CP*100)-3,hi:Math.round(p/CP*100),d:repSec/60});
    if (i<reps-1) blocks.push({z:1,l:'Rec',lo:40,hi:55,d:recMin});
  }
  blocks.push(cdBlock(CP,10));
  var desc = reps+'x'+repSec+'s a '+p+'W, rec '+recMin+'\'. '+
             'Durata calcolata per consumare circa il '+Math.round(targetFrac*100)+'% della tua W\' reale ('+Math.round(Wp/1000)+'kJ) a ogni ripetuta. '+
             'Simula gli strappi ripetuti: attacco, rientro, riattacco.';
  return finishSession(date,week,"W' repeats "+reps+'x'+repSec+'s','z6',blocks,CP,desc,'wprime-repeats');
}

/* ---------- 7. Forza-resistenza a bassa cadenza ----------
   Evidenza più debole degli altri formati: usato con parsimonia. */
function buildTorqueSession(date, week, CP, pz, phase) {
  var p = Math.round(CP*0.88);
  var reps = 4, repMin = 6;
  var blocks=[wuBlock(CP,15)];
  for (var i=0;i<reps;i++){
    blocks.push({z:3,l:'Torque',lo:82,hi:90,d:repMin});
    if (i<reps-1) blocks.push({z:1,l:'Rec',lo:40,hi:55,d:4});
  }
  blocks.push(cdBlock(CP,10));
  var desc = reps+'x'+repMin+'\' a '+p+'W tenendo 50-60 rpm (in salita o rapporto lungo), rec 4\' a cadenza libera. '+
             'Lavoro di tensione muscolare. Nota: l\'evidenza a supporto di questo formato è più debole rispetto agli altri della libreria - '+
             'utile come varietà, non come pilastro. Salta se hai fastidi alle ginocchia.';
  return finishSession(date,week,'Forza-resistenza '+reps+'x'+repMin+"'",'z3',blocks,CP,desc,'torque');
}

/* ---------- 8. Durabilità / fatigue resistance (WEEKEND) ----------
   Il concetto più rilevante per una gran fondo: gli sforzi di qualità
   vengono messi DOPO aver accumulato lavoro, non da freschi. Target
   in kJ scalato sul tuo peso (~20 kJ/kg, in linea con i protocolli
   usati in letteratura). */
function buildDurabilitySession(date, week, CP, pz, phase) {
  var z2 = pz[1];
  var z2mid = Math.round((z2.lo+z2.hi)/2);
  var kjTarget = Math.round(WEIGHT_KG*20);
  var accumMin = Math.round(kjTarget*1000/z2mid/60);
  var effortP_lo = Math.round(CP*0.92), effortP_hi = Math.round(CP*1.0);
  var reps = phase==='Picco Forma'?2:2;
  var repMin = phase==='Picco Forma'?15:12;
  var blocks=[wuBlock(CP,15)];
  blocks.push({z:2,l:'Z2 accumulo',lo:55,hi:75,d:accumMin});
  for (var i=0;i<reps;i++){
    blocks.push({z:4,l:'Sforzo stanco',lo:92,hi:100,d:repMin});
    if (i<reps-1) blocks.push({z:1,l:'Rec',lo:40,hi:55,d:6});
  }
  blocks.push(cdBlock(CP,10));
  var desc = 'Sessione di DURABILITÀ: '+accumMin+'\' Z2 ('+z2.lo+'-'+z2.hi+'W) per accumulare ~'+kjTarget+' kJ, POI '+reps+'x'+repMin+'\' a '+effortP_lo+'-'+effortP_hi+'W da stanco, rec 6\'. '+
             'Il punto non è la potenza assoluta ma quanto riesci a tenerla con ~'+kjTarget+' kJ nelle gambe: è la situazione reale del finale di gran fondo. '+
             'Mangia 60-90g di carboidrati/ora durante l\'accumulo, altrimenti stai testando il digiuno e non la durabilità. '+
             'Annota la potenza media delle ripetute: confrontala nel tempo con le stesse ripetute fatte da fresco.';
  return finishSession(date,week,'Durabilità '+reps+'x'+repMin+"' post-"+kjTarget+'kJ','z4',blocks,CP,desc,'durability');
}

/* ---------- 9. Lungo Z2 + soglia (formato "classico" già esistente) ---------- */
function buildLongWithThreshold(date, week, CP, pz, phase) {
  var z2 = pz[1], z4 = pz[3];
  var totalMin = phase==='Affilatura'?150:175;
  var reps = phase==='Affilatura'?1:2;
  var repMin = phase==='Picco Forma'?18:15;
  var thresholdMin = reps*repMin + (reps-1)*5;
  var z2Min = Math.max(30, totalMin-15-15-thresholdMin);
  var blocks=[wuBlock(CP,15), {z:2,l:'Z2',lo:55,hi:75,d:Math.round(z2Min*0.6)}];
  for (var i=0;i<reps;i++){
    blocks.push({z:4,l:'Soglia',lo:92,hi:103,d:repMin});
    if (i<reps-1) blocks.push({z:1,l:'Rec',lo:40,hi:55,d:5});
  }
  blocks.push({z:2,l:'Z2',lo:55,hi:75,d:Math.round(z2Min*0.4)});
  blocks.push(cdBlock(CP,15));
  var desc = Math.round(totalMin/60*10)/10+'h totali: Z2 '+z2.lo+'-'+z2.hi+'W con '+reps+'x'+repMin+'\' a '+Math.round(CP*0.92)+'-'+Math.round(CP*1.03)+'W incorporati a metà uscita.';
  return finishSession(date,week,'Lungo + Soglia '+reps+'x'+repMin+"'",'z4',blocks,CP,desc,'long-threshold');
}

/* ---------- 10. Z2 semplice ---------- */
function buildZ2Simple(date, week, CP, pz, durMin, label) {
  var z2 = pz[1];
  var blocks=[wuBlock(CP,10), {z:2,l:'Z2',lo:55,hi:75,d:Math.max(20,durMin-20)}, cdBlock(CP,10)];
  var desc = Math.max(20,durMin-20)+'\' in Z2 a '+z2.lo+'-'+z2.hi+'W, cadenza libera. Sessione di volume aerobico: resta in zona, non trasformarla in un tempo.';
  return finishSession(date,week,label||'Z2 Aerobico','z2',blocks,CP,desc,'z2');
}

/* ---------- 11. Riposo ---------- */
function buildOffDay(date, week) {
  return {date:date, week:week, name:'Riposo', type:'off', tss:0, durMin:0,
          desc:'Riposo completo o pedalata rigenerante facilissima. Il recupero è quando arrivano gli adattamenti.', blocks:[], method:'off'};
}

/* ---------- 12. Simulazione gara ----------
   Durata del blocco centrale calibrata sul profilo reale delle tue gare
   già analizzate (principio di specificità). */
function buildRaceSpecificSession(date, week, CP, pz, raceProfile) {
  var z3 = pz[2], z4top = pz[3].hi;
  var coreMin = raceProfile ? Math.min(150, Math.max(60, Math.round(raceProfile.avgDurMin*0.4))) : 90;
  var blocks=[wuBlock(CP,15), {z:3,l:'Tempo',lo:78,hi:103,d:coreMin}, cdBlock(CP,15)];
  var note = raceProfile ? ' Durata calibrata sulla media delle tue '+raceProfile.count+' gare analizzate ('+raceProfile.avgDurMin+"' medi, decoupling medio "+raceProfile.avgDecoupling+'%).' : '';
  var desc = 'WU 15\', poi '+coreMin+'\' continuativi a '+z3.lo+'-'+z4top+'W oscillando tra tempo e soglia come in gara, CD 15\'.'+note;
  return finishSession(date,week,'Simulazione Gara '+coreMin+"'",'z3',blocks,CP,desc,'race-sim');
}

/* ---------- REGISTRO E ROTAZIONE ----------
   Ogni slot pesca da un pool filtrato per fase, ruotando con l'indice
   di settimana: così le sessioni cambiano davvero di settimana in
   settimana invece di ripetersi identiche. */
var MIDWEEK_QUALITY_POOL = {
  'Costruzione':   ['ronnestad','overunder','sweetspot','bossi','torque','fastart'],
  'Picco Forma':   ['ronnestad','bossi','fastart','overunder','wprime'],
  'Affilatura':    ['fastart','ronnestad','wprime'],
  'Tapering Finale':['fastart','sweetspot']
};

var WEEKEND_POOL = {
  'Costruzione':   ['longthreshold','durability','longthreshold','sweetspotlong'],
  'Picco Forma':   ['durability','racesim','longthreshold'],
  'Affilatura':    ['longthreshold','durability'],
  'Tapering Finale':['z2long']
};

function buildByKey(key, date, week, CP, Wp, pz, phase, raceProfile) {
  switch(key) {
    case 'ronnestad':     return buildRonnestad3015(date, week, CP, Wp, pz, phase);
    case 'bossi':         return buildBossiAlternating(date, week, CP, Wp, pz, phase);
    case 'fastart':       return buildFastStartVO2(date, week, CP, Wp, pz, phase);
    case 'overunder':     return buildOverUnder(date, week, CP, pz, phase);
    case 'sweetspot':     return buildSweetSpot(date, week, CP, pz, phase, 110);
    case 'wprime':        return buildWprimeRepeats(date, week, CP, Wp, pz, phase);
    case 'torque':        return buildTorqueSession(date, week, CP, pz, phase);
    case 'durability':    return buildDurabilitySession(date, week, CP, pz, phase);
    case 'longthreshold': return buildLongWithThreshold(date, week, CP, pz, phase);
    case 'sweetspotlong': return buildSweetSpot(date, week, CP, pz, phase, 999);
    case 'racesim':       return buildRaceSpecificSession(date, week, CP, pz, raceProfile);
    case 'z2long':        return buildZ2Simple(date, week, CP, pz, 90, 'Z2 Lungo leggero');
    default:              return buildZ2Simple(date, week, CP, pz, 75, 'Z2 Aerobico');
  }
}

function pickFromPool(pool, phase, weekIdx) {
  var list = pool[phase] || pool['Costruzione'];
  return list[weekIdx % list.length];
}
