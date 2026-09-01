/* ============================================================
   RACES.JS
   Legge le gare dal calendario Intervals.icu (/events) e le trasforma
   in VINCOLI per il generatore del piano.

   Perché serve: finora il generatore assumeva che il sabato fosse
   sempre un lungo di allenamento e ignorava del tutto il calendario
   gare. Per chi corre ogni due settimane non è una rifinitura: senza
   questo il piano è teorico.

   Regole applicate (impostazione classica di scarico/recupero attorno
   alla gara, con l'entità dello scarico proporzionale alla priorità):
   - RACE_A (obiettivo): scarico nei 5 giorni precedenti, 2 giorni di
     recupero dopo
   - RACE_B (importante): scarico nei 2 giorni precedenti, 1 dopo
   - RACE_C (allenante): nessuno scarico, si corre "sulle gambe"; conta
     comunque come sessione dura ai fini del carico
   La gara stessa sostituisce qualunque sessione prevista quel giorno.
   ============================================================ */

var races = [];              // [{date, name, priority, durMin, tss, distance}]
var racesLastRawSample = null;

var RACE_RULES = {
  A: {taperDays: 5, recoveryDays: 2, label: 'Obiettivo'},
  B: {taperDays: 2, recoveryDays: 1, label: 'Importante'},
  C: {taperDays: 0, recoveryDays: 1, label: 'Allenante'}
};

function racePriorityOf(ev) {
  var c = String(ev.category || ev.type || '').toUpperCase();
  if (c.indexOf('RACE_A') >= 0) return 'A';
  if (c.indexOf('RACE_B') >= 0) return 'B';
  if (c.indexOf('RACE_C') >= 0) return 'C';
  if (c.indexOf('RACE') >= 0) return 'B'; // gara senza priorità esplicita
  return null;
}

async function syncRaces(fromDate, toDate) {
  var from = fromDate || today();
  var to = toDate || (new Date().getFullYear() + 1) + '-12-31';
  var resp = await icuFetch('/events?oldest=' + from + '&newest=' + to);
  var evs = await resp.json();
  if (!Array.isArray(evs)) throw new Error('Risposta /events inattesa');
  if (evs.length) racesLastRawSample = evs[0];

  races = evs.map(function(ev) {
    var pri = racePriorityOf(ev);
    if (!pri) return null;
    var date = String(ev.start_date_local || ev.start_date || '').slice(0, 10);
    if (!date) return null;
    return {
      date: date,
      name: ev.name || 'Gara',
      priority: pri,
      durMin: ev.moving_time ? Math.round(ev.moving_time / 60) : null,
      tss: ev.icu_training_load || ev.load_target || null,
      distance: ev.distance || null,
      description: ev.description || '',
      icuId: ev.id
    };
  }).filter(Boolean).sort(function(a, b) { return a.date.localeCompare(b.date); });

  return races.length;
}

function racesBetween(from, to) {
  return races.filter(function(r) { return r.date >= from && r.date < to; });
}

/* Costruisce una mappa data → vincolo, per il generatore.
   'race'    : quel giorno c'è la gara, sostituisce tutto
   'taper'   : niente lavori duri, volume ridotto
   'recovery': recupero dopo la gara */
function buildRaceConstraints(fromDate, toDate) {
  var map = {};
  racesBetween(fromDate, toDate).forEach(function(r) {
    var rule = RACE_RULES[r.priority];
    map[r.date] = {kind: 'race', race: r};
    for (var i = 1; i <= rule.taperDays; i++) {
      var d = addDays(r.date, -i);
      if (d >= fromDate && !map[d]) map[d] = {kind: 'taper', race: r, daysOut: i};
    }
    for (var j = 1; j <= rule.recoveryDays; j++) {
      var dr = addDays(r.date, j);
      if (dr < toDate && (!map[dr] || map[dr].kind === 'taper')) map[dr] = {kind: 'recovery', race: r, daysAfter: j};
    }
  });
  return map;
}

/* Sessione "gara": usa i dati reali dell'evento se presenti, altrimenti
   una stima prudente basata sulla priorità. */
function buildRaceSession(date, week, r, CP, pz) {
  var durMin = r.durMin || (r.priority === 'A' ? 240 : 150);
  var tss = r.tss || Math.round(durMin * 1.05); // gara ≈ 1.05 TSS/min
  var z2 = pz[1], z4 = pz[3], z5 = pz[4];
  var blocks = [
    {z: 1, l: 'WU', lo: 45, hi: 60, d: 15},
    {z: 2, l: 'Avvio', lo: 55, hi: 75, d: Math.round(durMin * 0.25)},
    {z: 4, l: 'Gara', lo: 90, hi: 105, d: Math.round(durMin * 0.5)},
    {z: 5, l: 'Finale', lo: 105, hi: 115, d: Math.round(durMin * 0.15)},
    {z: 1, l: 'CD', lo: 40, hi: 55, d: 10}
  ];
  return {
    date: date, week: week, name: '🏁 ' + r.name, type: 'race',
    tss: tss, durMin: durMin,
    desc: RACE_RULES[r.priority].label + ' (priorità ' + r.priority + '). ' +
          (r.distance ? Math.round(r.distance / 1000) + 'km. ' : '') +
          'Soglia a ' + z4.lo + '-' + z4.hi + 'W, strappi fino a ' + z5.hi + 'W. ' +
          '60-90g di carboidrati/ora.' + (r.description ? ' — ' + r.description.slice(0, 120) : ''),
    blocks: blocks, method: 'race', racePriority: r.priority
  };
}

function buildTaperSession(date, week, CP, pz, constraint) {
  var r = constraint.race, out = constraint.daysOut;
  var z2 = pz[1];
  if (out === 1) {
    // Vigilia: sblocco corto con qualche allungo, non riposo totale
    return {
      date: date, week: week, name: 'Sblocco pre-gara', type: 'z2', tss: 25, durMin: 45,
      desc: 'Vigilia di "' + r.name + '". 45\' facili con 3x1\' progressivi fino a ' + Math.round(CP * 0.95) + 'W ' +
            'per tenere sveglie le gambe senza affaticare.',
      blocks: [{z: 1, l: 'WU', lo: 45, hi: 60, d: 20},
               {z: 3, l: 'Allunghi', lo: 80, hi: 95, d: 5},
               {z: 1, l: 'CD', lo: 40, hi: 55, d: 20}],
      method: 'taper'
    };
  }
  var durMin = out <= 3 ? 60 : 80;
  return {
    date: date, week: week, name: 'Scarico pre-gara', type: 'z2',
    tss: Math.round(durMin * 0.55), durMin: durMin,
    desc: '-' + out + ' giorni da "' + r.name + '". ' + durMin + '\' in Z2 (' + z2.lo + '-' + z2.hi + 'W). ' +
          'Niente lavori duri: in questa finestra non si guadagna più forma, si può solo perderla.',
    blocks: [{z: 1, l: 'WU', lo: 45, hi: 60, d: 10},
             {z: 2, l: 'Z2', lo: 55, hi: 72, d: durMin - 20},
             {z: 1, l: 'CD', lo: 40, hi: 55, d: 10}],
    method: 'taper'
  };
}

function buildRecoverySession(date, week, CP, pz, constraint) {
  var r = constraint.race, after = constraint.daysAfter;
  if (after === 1) {
    return {date: date, week: week, name: 'Recupero post-gara', type: 'off', tss: 0, durMin: 0,
            desc: 'Il giorno dopo "' + r.name + '": riposo o pedalata rigenerante di 30-40\' in Z1.',
            blocks: [], method: 'recovery'};
  }
  return {date: date, week: week, name: 'Rigenerante', type: 'z1', tss: 20, durMin: 45,
          desc: 'Secondo giorno dopo "' + r.name + '": 45\' facilissimi sotto ' + Math.round(CP * 0.55) + 'W.',
          blocks: [{z: 1, l: 'Z1', lo: 40, hi: 55, d: 45}], method: 'recovery'};
}

/* Riepilogo testuale per la tab Piano. */
function racesSummary() {
  var upcoming = races.filter(function(r) { return r.date >= today(); });
  if (!upcoming.length) return null;
  return upcoming.map(function(r) {
    var days = Math.round((new Date(r.date + 'T12:00') - new Date(today() + 'T12:00')) / 86400000);
    return {date: r.date, name: r.name, priority: r.priority, days: days,
            label: RACE_RULES[r.priority].label};
  });
}
