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
/* Calcolo del TSS di una sessione pianificata.

   LA MEDIA MOBILE A 30 SECONDI NON E' UN DETTAGLIO.
   La Normalized Power e' definita come media alla QUARTA POTENZA di una
   media mobile a 30 secondi, non della potenza istantanea. Una versione
   precedente elevava alla quarta l'intensita' di ogni blocco cosi'
   com'era: su sforzi brevissimi il risultato esplodeva, perche' 12
   secondi a ~285% del CP pesavano come se quella potenza fosse durata
   un blocco intero. Si ottenevano 137 TSS per 8 sprint da 12 secondi e
   247 TSS/h per una seduta di attacchi: valori impossibili.

   Qui la sessione viene espansa secondo per secondo, si applica la
   finestra mobile di 30 secondi e solo dopo la quarta potenza. E'
   piu' lavoro ma e' la definizione corretta, e rende confrontabili
   formati con durate molto diverse. */
function tssFromBlocks(blocks, CP) {
  var series = [];
  blocks.forEach(function (b) {
    var secs = Math.max(1, Math.round(b.d * 60));
    if (b.micro) {
      var onI = b.micro.onPct / 100, offI = b.micro.offPct / 100;
      var cycle = b.micro.onSec + b.micro.offSec;
      for (var t = 0; t < secs; t++) {
        series.push((t % cycle) < b.micro.onSec ? onI : offI);
      }
    } else {
      var i = ((b.lo + b.hi) / 2) / 100;
      for (var k = 0; k < secs; k++) series.push(i);
    }
  });
  if (!series.length) return 0;

  // media mobile a 30 secondi
  var W = 30, sum = 0, roll = [];
  for (var n = 0; n < series.length; n++) {
    sum += series[n];
    if (n >= W) sum -= series[n - W];
    roll.push(sum / Math.min(n + 1, W));
  }

  var p4 = roll.reduce(function (s, v) { return s + Math.pow(v, 4); }, 0) / roll.length;
  var normI = Math.pow(p4, 0.25);          // IF rispetto a CP
  var hours = series.length / 3600;
  return Math.round(hours * Math.pow(normI, 2) * 100);
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

/* ============================================================
   FORMATI A RIPETUTE CLASSICHE
   Costruttore generico: invece di scrivere una funzione quasi identica
   per ogni schema (4x8, 4x4, 8x3...), qui si descrive lo schema e il
   codice lo trasforma in sessione. Aggiungerne uno nuovo costa una
   riga di configurazione.

   NOTA SULLA PRESCRIZIONE: negli studi di Seiler le ripetute NON erano
   a percentuale fissa, ma "alla massima intensita' media sostenibile
   per l'intera sessione". E' una differenza sostanziale: l'atleta si
   autoregola e l'ultima ripetuta deve essere completabile. Le
   percentuali qui sotto sono un punto di partenza, non un vincolo, e
   la descrizione lo dice esplicitamente.
   ============================================================ */
var INTERVAL_FORMATS = {
  seiler4x8: {
    name: "Seiler 4x8'", reps: 4, repMin: 8, recMin: 2, z: 4, lo: 92, hi: 100, type: 'z4',
    note: "Il formato con il miglior rapporto stimolo/fatica nello studio di Seiler et al. (2013): " +
          "su 35 ciclisti amatori in 7 settimane, il gruppo 4x8' guadagno' l'11.4% combinato fra VO2peak, " +
          "potenza al VO2peak e potenza a 4 mmol, contro il 5.6% del 4x16' e il 5.5% del 4x4'. " +
          "Attenzione: gruppi da 9 persone e atleti da ~6h/settimana, quindi il dato e' indicativo, non definitivo."
  },
  seiler4x16: {
    name: "Seiler 4x16'", reps: 4, repMin: 16, recMin: 3, z: 3, lo: 84, hi: 92, type: 'z3',
    note: "Il braccio sub-soglia dello stesso studio: piu' volume a intensita' minore (~88% della FC di picco). " +
          "Ha prodotto guadagni inferiori al 4x8' ma con fatica percepita molto piu' bassa: utile quando " +
          "vuoi carico aerobico senza pagarlo nei giorni successivi."
  },
  norwegian4x4: {
    name: "4x4' VO2max", reps: 4, repMin: 4, recMin: 3, z: 5, lo: 103, hi: 112, type: 'z5',
    note: "Il classico protocollo norvegese, il piu' intenso dei tre (~94% della FC di picco, ~13 mmol di lattato). " +
          "Nello studio di Seiler non ha battuto il 4x8', ma resta un formato duro e specifico per il VO2max."
  },
  eight3: {
    name: "8x3'", reps: 8, repMin: 3, recMin: 3, z: 5, lo: 105, hi: 113, type: 'z5',
    note: "Volume alto vicino al VO2max frazionato in blocchi brevi: piu' tempo totale sopra il 90% del VO2max " +
          "rispetto a poche ripetute lunghe, con ogni singola ripetuta piu' gestibile."
  },
  fivex5fast: {
    name: "5x5' partenza veloce", reps: 5, repMin: 5, recMin: 3, z: 5, lo: 104, hi: 110, type: 'z5',
    fastStart: true,
    note: "Primi 60-90 secondi decisamente piu' duri, poi si assesta. Il VO2 sale prima e ci resta piu' a lungo, " +
          "a parita' di durata della ripetuta."
  }
};

function buildIntervalFormat(key, date, week, CP, Wp, pz, phase) {
  var f = INTERVAL_FORMATS[key];
  if (!f) return null;
  /* In affilatura e taper si riduce il numero di ripetute, non la
     loro intensita': si mantiene lo stimolo togliendo volume. */
  var reps = phase === 'Tapering Finale' ? Math.max(2, f.reps - 2)
           : phase === 'Affilatura'      ? Math.max(2, f.reps - 1)
           : f.reps;
  var loW = Math.round(CP * f.lo / 100), hiW = Math.round(CP * f.hi / 100);

  var blocks = [wuBlock(CP, 15)];
  for (var i = 0; i < reps; i++) {
    if (f.fastStart) {
      var startHi = Math.min(f.hi + 8, Math.round((CP + Wp / 120) / CP * 100));
      blocks.push({z: 6, l: 'Start', lo: f.hi, hi: startHi, d: 1.5});
      blocks.push({z: f.z, l: 'Hold', lo: f.lo, hi: f.hi, d: f.repMin - 1.5});
    } else {
      blocks.push({z: f.z, l: f.repMin + "'", lo: f.lo, hi: f.hi, d: f.repMin});
    }
    if (i < reps - 1) blocks.push({z: 1, l: 'Rec', lo: 40, hi: 55, d: f.recMin});
  }
  blocks.push(cdBlock(CP, 10));

  var title = f.fastStart
    ? reps + "x" + f.repMin + "' partenza veloce"
    : (key.indexOf('seiler') === 0 ? 'Seiler ' : '') + reps + 'x' + f.repMin + "'";
  var desc = 'WU 15\', poi ' + reps + 'x' + f.repMin + "' a " + loW + '-' + hiW + 'W (' +
    f.lo + '-' + f.hi + '% CP), rec ' + f.recMin + "' Z1, CD 10'. " +
    (f.fastStart ? 'Primi 90 secondi sopra il target, poi assestati. ' : '') +
    'Regolati per completare TUTTE le ripetute: se non arrivi in fondo all\'ultima, ' +
    'sei partito troppo forte. ' + f.note;
  return finishSession(date, week, title, f.type, blocks, CP, desc, key);
}

/* ---------- Microintervalli 40/20 (variante piu' impegnativa del 30/15) ---------- */
function buildRonnestad4020(date, week, CP, Wp, pz, phase) {
  var map = Math.round(CP + Wp / 300);
  var onPct = Math.round(map / CP * 100);
  var offPct = Math.round(onPct * 0.5);
  var series = phase === 'Affilatura' ? 2 : 3;
  var reps = 10;
  var seriesMin = reps * (40 + 20) / 60; // 10'
  var blocks = [wuBlock(CP, 15)];
  for (var s = 0; s < series; s++) {
    blocks.push({z: 5, l: reps + 'x40/20', lo: offPct, hi: onPct, d: seriesMin,
                 micro: {onSec: 40, offSec: 20, onPct: onPct, offPct: offPct}});
    if (s < series - 1) blocks.push({z: 1, l: 'Rec', lo: 40, hi: 55, d: 5});
  }
  blocks.push(cdBlock(CP, 10));
  var desc = series + ' serie da ' + reps + 'x(40s a ' + map + 'W / 20s a ' + Math.round(map * 0.5) + 'W), rec 5\' fra le serie. ' +
    'Variante piu' + '\u2019' + ' esigente del 30/15: la frazione di lavoro sale dal 67% al 67% ma i tratti duri durano di piu' + '\u2019' + ', ' +
    'quindi il recupero fra un\'accelerazione e l\'altra e\' relativamente minore. ' +
    'Se l\'ultima serie non regge, abbassa di 10-15W invece di accorciarla.';
  return finishSession(date, week, series + 'x' + reps + 'x40/20', 'z5', blocks, CP, desc, 'ronnestad4020');
}

/* ============================================================
   LACUNE COPERTE DA QUESTI FORMATI

   1. POTENZA NEUROMUSCOLARE (Pmax). Il modello a tre parametri usa
      Pmax, ma nessun allenamento della libreria lo allenava: lo sforzo
      piu' breve erano le W' repeats a 45-180s, che e' capacita'
      anaerobica, non potenza massima. Per chi corre in circuito e
      arriva in volata e' una lacuna concreta.
      NOTA: Pmax non e' una delle due leve degli obiettivi di gara
      (li' si imposta CP e W'). Il modello lo assume costante, quindi
      questi lavori servono a MANTENERLO, non compaiono nel calcolo
      dell'enfasi.

   2. SFORZI DA RITMO GARA. Le W' repeats partono da fresco; in gara si
      attacca quando si e' gia' a soglia, con W' parzialmente esaurita.
      E' una situazione fisiologicamente diversa e va allenata come tale.

   3. DURATE VARIABILI nella stessa seduta: le transizioni fra sforzi di
      lunghezza diversa non erano allenate da nessun formato.
   ============================================================ */

/* ---------- 13. Sprint neuromuscolari ----------
   Recuperi lunghissimi: l'obiettivo e' la potenza di picco, non
   l'accumulo di fatica. Se le ultime partenze calano molto, la seduta
   e' finita: continuare allena altro. */
function buildSprints(date, week, CP, Wp, pz, phase) {
  var pdm = pdmModel();
  var target = Math.round((pdm.Pmax || CP * 3) * 0.92);
  var reps = phase === 'Tapering Finale' ? 4 : phase === 'Affilatura' ? 5 : 8;
  var blocks = [wuBlock(CP, 20)];
  for (var i = 0; i < reps; i++) {
    blocks.push({z: 7, l: '12s', lo: Math.round(target / CP * 100) - 15, hi: Math.round(target / CP * 100), d: 0.2});
    if (i < reps - 1) blocks.push({z: 1, l: 'Rec', lo: 40, hi: 55, d: 4});
  }
  blocks.push(cdBlock(CP, 12));
  var desc = 'WU 20\', poi ' + reps + 'x12 secondi da fermo o quasi, tutto quello che hai (~' + target + 'W), ' +
    'rec 4\' COMPLETI fra una e l\'altra. Il recupero lungo non e\' un dettaglio: serve a ricostituire i fosfati, ' +
    'e accorciarlo trasforma la seduta in un lavoro anaerobico diverso. ' +
    'Se le ultime partenze calano di oltre il 10%, fermati: allenare Pmax da stanco non allena Pmax.';
  return finishSession(date, week, 'Sprint ' + reps + 'x12s', 'z6', blocks, CP, desc, 'sprints');
}

/* ---------- 14. Z2 lungo con sprint ----------
   Mantiene la potenza di picco a costo aerobico quasi nullo: gli sprint
   sono cosi' brevi da non intaccare la seduta di fondo. Sta nel giro
   del sabato senza rubargli spazio. */
function buildZ2Sprints(date, week, CP, Wp, pz, phase) {
  var pdm = pdmModel();
  var target = Math.round((pdm.Pmax || CP * 3) * 0.88);
  var z2 = pz[1];
  var totalMin = phase === 'Tapering Finale' ? 75 : 150;
  var sprints = 6;
  var blocks = [wuBlock(CP, 15)];
  var chunk = Math.round((totalMin - 25) / sprints);
  for (var i = 0; i < sprints; i++) {
    blocks.push({z: 2, l: 'Z2', lo: 55, hi: 75, d: chunk});
    blocks.push({z: 7, l: 'Sprint', lo: Math.round(target / CP * 100) - 15, hi: Math.round(target / CP * 100), d: 0.17});
  }
  blocks.push(cdBlock(CP, 10));
  var desc = Math.round(totalMin / 60 * 10) / 10 + 'h in Z2 (' + z2.lo + '-' + z2.hi + 'W) con ' + sprints +
    ' sprint di 10 secondi a ~' + target + 'W, uno ogni ' + chunk + '\'. ' +
    'Gli sprint sono troppo brevi per intaccare il lavoro aerobico: mantieni la potenza di picco senza pagare nulla ' +
    'sulla seduta di fondo. Riparti in Z2 subito dopo, senza recupero aggiuntivo.';
  return finishSession(date, week, 'Z2 lungo + ' + sprints + ' sprint', 'z2', blocks, CP, desc, 'z2sprints');
}

/* ---------- 15. Attacchi da ritmo gara ----------
   Strappi ripetuti partendo da Z3-Z4 invece che da fermo: in gara si
   attacca con la W' gia' parzialmente consumata, ed e' li' che si
   decide. Piu' duro di quanto i numeri suggeriscano. */
function buildRaceAttacks(date, week, CP, Wp, pz, phase) {
  var base = Math.round(CP * 0.88);
  /* Potenza dell'attacco dal modello di Morton, non dall'iperbole a 2
     parametri: CP + W'/45 dava 1010W su questo profilo, cioe' quasi
     Pmax, che e' uno sprint e non un attacco. E' lo stesso errore gia'
     corretto nel grafico della curva di potenza, qui reintrodotto.
     Si parte dal massimo sostenibile 30s e si scala all'85%, perche'
     l'attacco avviene da ritmo gara con la W' gia' in parte consumata. */
  var attack = Math.round(predictedPower(30, cpModel()) * 0.85);
  var sets = phase === 'Affilatura' ? 2 : 3;
  var attacksPerSet = 4;
  var blocks = [wuBlock(CP, 15)];
  for (var s = 0; s < sets; s++) {
    for (var i = 0; i < attacksPerSet; i++) {
      blocks.push({z: 3, l: 'Ritmo', lo: 84, hi: 92, d: 2});
      blocks.push({z: 6, l: 'Attacco', lo: Math.round(attack / CP * 100) - 5, hi: Math.round(attack / CP * 100), d: 0.5});
    }
    if (s < sets - 1) blocks.push({z: 1, l: 'Rec', lo: 40, hi: 55, d: 8});
  }
  blocks.push(cdBlock(CP, 10));
  var desc = sets + ' serie da ' + attacksPerSet + 'x(2\' a ' + base + 'W + 30s di attacco a ' + attack + 'W), rec 8\' fra le serie. ' +
    'Gli attacchi NON partono da fermo ma da ritmo gara, con la W\' gia\' in parte consumata: e\' la situazione reale ' +
    'del finale di una granfondo o di un circuito. Aspettati che sia piu\' duro di quanto i numeri suggeriscano.';
  return finishSession(date, week, 'Attacchi ' + sets + 'x' + attacksPerSet, 'z5', blocks, CP, desc, 'raceattacks');
}

/* ---------- 16. Piramide ----------
   Durate crescenti e poi decrescenti: allena le transizioni fra sforzi
   di lunghezza diversa, che nessun formato a ripetute uguali copre. */
function buildPyramid(date, week, CP, Wp, pz, phase) {
  var steps = phase === 'Affilatura' ? [1, 2, 3, 2, 1] : [1, 2, 3, 4, 3, 2, 1];
  var blocks = [wuBlock(CP, 15)];
  steps.forEach(function (m, i) {
    /* Piu' lunga la ripetuta, minore l'intensita': si usa il modello per
       scegliere un target sostenibile a QUELLA durata, invece di una
       percentuale unica che sarebbe troppo dura sui gradini lunghi. */
    var sust = Math.round(predictedPower(m * 60, cpModel()) * 0.93);
    var pct = Math.round(sust / CP * 100);
    blocks.push({z: m <= 2 ? 6 : 5, l: m + "'", lo: pct - 4, hi: pct, d: m});
    if (i < steps.length - 1) blocks.push({z: 1, l: 'Rec', lo: 40, hi: 55, d: Math.max(2, m)});
  });
  blocks.push(cdBlock(CP, 10));
  var desc = 'Piramide ' + steps.join('-') + ' minuti, recupero pari alla durata della ripetuta appena conclusa. ' +
    'Ogni gradino ha un target diverso, calcolato sul tuo modello per quella durata specifica: ' +
    'una percentuale unica sarebbe impossibile sui gradini lunghi e troppo facile su quelli brevi. ' +
    'La parte difficile e\' la discesa, quando le ripetute si accorciano ma la fatica e\' gia\' addosso.';
  return finishSession(date, week, 'Piramide ' + steps.join('-'), 'z5', blocks, CP, desc, 'pyramid');
}

/* ---------- 17. Soglia progressiva ----------
   Ogni ripetuta piu' dura della precedente. Insegna a gestire il passo:
   partire troppo forte qui si paga in modo evidente. */
function buildProgressive(date, week, CP, Wp, pz, phase) {
  var reps = phase === 'Affilatura' ? 3 : 4;
  var repMin = 8;
  var startPct = 88, stepPct = 5;
  var blocks = [wuBlock(CP, 15)];
  for (var i = 0; i < reps; i++) {
    var pct = startPct + i * stepPct;
    blocks.push({z: pct >= 100 ? 4 : 3, l: repMin + "'", lo: pct - 3, hi: pct, d: repMin});
    if (i < reps - 1) blocks.push({z: 1, l: 'Rec', lo: 40, hi: 55, d: 4});
  }
  blocks.push(cdBlock(CP, 10));
  var watts = [];
  for (var j = 0; j < reps; j++) watts.push(Math.round(CP * (startPct + j * stepPct) / 100) + 'W');
  var desc = reps + 'x' + repMin + '\' progressivi: ' + watts.join(' → ') + ', rec 4\'. ' +
    'Ogni ripetuta piu\' dura della precedente, e l\'ultima deve essere completabile. ' +
    'Serve a imparare a gestire il passo: se parti troppo forte qui te ne accorgi subito, ' +
    'invece che a meta\' gara.';
  return finishSession(date, week, 'Progressiva ' + reps + 'x' + repMin + "'", 'z4', blocks, CP, desc, 'progressive');
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
/* Pool infrasettimanale: tutti formati che stanno sotto le 2h.
   Il 4x16' di Seiler sta nel pool del weekend: con 98 minuti totali
   rientrerebbe nel tetto infrasettimanale, ma e' un lavoro lungo e
   continuo, e la tua preferenza e' di fare i lavori lunghi nel giro
   del sabato. */
var MIDWEEK_QUALITY_POOL = {
  'Costruzione':   ['seiler4x8','overunder','ronnestad','progressive','sweetspot','eight3','pyramid','bossi','ronnestad4020','sprints','torque','fivex5fast'],
  'Picco Forma':   ['seiler4x8','raceattacks','norwegian4x4','ronnestad4020','fivex5fast','pyramid','eight3','bossi','sprints','ronnestad','overunder','wprime'],
  'Affilatura':    ['fivex5fast','raceattacks','norwegian4x4','sprints','ronnestad','wprime'],
  'Tapering Finale':['fivex5fast','sprints','sweetspot']
};

var WEEKEND_POOL = {
  'Costruzione':   ['longthreshold','durability','z2sprints','seiler4x16','sweetspotlong'],
  'Picco Forma':   ['durability','racesim','longthreshold','z2sprints','seiler4x16'],
  'Affilatura':    ['longthreshold','durability'],
  'Tapering Finale':['z2long']
};

function buildByKey(key, date, week, CP, Wp, pz, phase, raceProfile) {
  switch(key) {
    case 'ronnestad':     return buildRonnestad3015(date, week, CP, Wp, pz, phase);
    case 'ronnestad4020': return buildRonnestad4020(date, week, CP, Wp, pz, phase);
    case 'sprints':       return buildSprints(date, week, CP, Wp, pz, phase);
    case 'z2sprints':     return buildZ2Sprints(date, week, CP, Wp, pz, phase);
    case 'raceattacks':   return buildRaceAttacks(date, week, CP, Wp, pz, phase);
    case 'pyramid':       return buildPyramid(date, week, CP, Wp, pz, phase);
    case 'progressive':   return buildProgressive(date, week, CP, Wp, pz, phase);
    case 'seiler4x8':     return buildIntervalFormat('seiler4x8', date, week, CP, Wp, pz, phase);
    case 'seiler4x16':    return buildIntervalFormat('seiler4x16', date, week, CP, Wp, pz, phase);
    case 'norwegian4x4':  return buildIntervalFormat('norwegian4x4', date, week, CP, Wp, pz, phase);
    case 'eight3':        return buildIntervalFormat('eight3', date, week, CP, Wp, pz, phase);
    case 'fivex5fast':    return buildIntervalFormat('fivex5fast', date, week, CP, Wp, pz, phase);
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
