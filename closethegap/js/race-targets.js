/* ============================================================
   RACE-TARGETS.JS
   Obiettivi di forma per le gare A, espressi come CP e W' target.

   PERCHE' DUE VALORI E NON CINQUE POTENZE PER DURATA.
   Il modello a tre parametri ha solo due leve: CP e W' (Pmax si muove
   poco e lentamente). Verificato sui valori reali:
     - alzare il CP di 15W aggiunge +15W a tutte le durate oltre i 3'
     - alzare il W' del 20% aggiunge +33W a 30s ma solo +5W a 20'
   Definire cinque potenze indipendenti era quindi sovra-specificato:
   potevano contraddirsi (chiedere molto a 30s E a 20' implica due CP
   diversi) e serviva un solutore inverso piu' un controllo di coerenza.
   Impostando direttamente CP e W' il problema sparisce: qualunque
   coppia e' internamente coerente per costruzione, e le potenze a ogni
   durata si ricavano in avanti con una formula.

   Resta la parte utile: il divario rispetto a oggi, la fattibilita' nel
   tempo disponibile, e l'enfasi che ne deriva per il piano.
   ============================================================ */

var RACE_TARGET_DURATIONS = [30, 180, 360, 720, 1200]; // solo per mostrare cosa implicano
var RACE_TARGET_LABELS = {30:'30s', 180:'3min', 360:'6min', 720:'12min', 1200:'20min'};
var raceTargets = {};   // { 'race-<data>': {cp: 366, wp: 34600} }
var RACE_TARGETS_KEY = 'ctg_race_targets_v2';

function loadRaceTargets() {
  try {
    var raw = localStorage.getItem(RACE_TARGETS_KEY);
    if (raw) raceTargets = JSON.parse(raw) || {};
    /* La versione precedente salvava cinque potenze per durata sotto
       un'altra chiave. Non viene convertita: era in uso da pochissimo e
       una conversione richiederebbe di riportarsi dietro il solutore
       inverso, cioe' la complessita' che questa modifica elimina.
       La vecchia chiave viene rimossa per non lasciare dati orfani. */
    localStorage.removeItem('ctg_race_targets_v1');
  } catch (e) { raceTargets = {}; }
  return raceTargets;
}
function saveRaceTargets() {
  try { localStorage.setItem(RACE_TARGETS_KEY, JSON.stringify(raceTargets)); return true; }
  catch (e) { return false; }
}
function raceKey(r) { return 'race-' + r.date; }

/* Potenza prevista a una durata per una data coppia CP/W'. */
function powerAtFor(secs, cp, wp, pmax) {
  pmax = pmax || (cpModel().Pmax || 1100);
  if (!pmax || pmax <= cp) return Math.round(cp + wp / secs);
  return Math.round(wp / (secs + wp / (pmax - cp)) + cp);
}
function currentPowerAt(secs) { return predictedPower(secs, cpModel()); }

/* Default: stato attuale con un margine di miglioramento plausibile.
   Il W' risponde piu' in fretta del CP, quindi ha un margine maggiore.
   Sono un punto di partenza da correggere, non una previsione. */
function defaultTargetsFor() {
  var cur = cpModel();
  return { cp: Math.round(cur.CP * 1.05), wp: Math.round(cur.Wp * 1.10) };
}

function getRaceTargets(r) {
  var k = raceKey(r);
  if (!raceTargets[k] || raceTargets[k].cp == null) raceTargets[k] = defaultTargetsFor();
  return raceTargets[k];
}
function setRaceTarget(r, field, value) {
  var k = raceKey(r);
  if (!raceTargets[k] || raceTargets[k].cp == null) raceTargets[k] = defaultTargetsFor();
  var v = parseFloat(value);
  if (!isFinite(v)) return raceTargets[k];
  if (field === 'cp' && v > 100 && v < 600) raceTargets[k].cp = Math.round(v);
  if (field === 'wp' && v > 1 && v < 80) raceTargets[k].wp = Math.round(v * 1000); // inserito in kJ
  saveRaceTargets();
  return raceTargets[k];
}

/* Divario fra dove sei e dove vuoi arrivare, e cosa ne consegue. */
function raceGapAnalysis(r) {
  var t = getRaceTargets(r);
  var cur = cpModel();
  var cpGap = t.cp - cur.CP;
  var wpGap = t.wp - cur.Wp;
  var cpGapPct = cpGap / cur.CP;
  var wpGapPct = wpGap / cur.Wp;
  var weeks = Math.max(1, Math.round((new Date(r.date + 'T12:00') - new Date(today() + 'T12:00')) / (7 * 86400000)));

  /* Enfasi: contano solo i divari POSITIVI. Se una qualita' e' gia'
     oltre il target non va allenata di piu', e non deve nemmeno
     diluire l'altra: usare il valore assoluto al denominatore faceva
     sommare le due quote a meno del 100%. */
  var cpNeed = Math.max(cpGapPct, 0), wpNeed = Math.max(wpGapPct, 0);
  var totalNeed = cpNeed + wpNeed;
  var emphasis = totalNeed > 0
    ? {cp: cpNeed / totalNeed, wp: wpNeed / totalNeed}
    : {cp: 0.5, wp: 0.5, atTarget: true};

  /* ~1.5W/settimana di CP e' un ritmo gia' buono per un atleta
     allenato; oltre 2.5 e' improbabile senza un salto di volume. */
  var cpPerWeek = cpGap / weeks;
  var feasibility = cpGap <= 0 ? 'gia raggiunto'
                  : cpPerWeek <= 1.5 ? 'realistico'
                  : cpPerWeek <= 2.5 ? 'ambizioso'
                  : 'improbabile';

  return {
    race: r, targets: t,
    current: {CP: cur.CP, Wp: cur.Wp, Pmax: cur.Pmax},
    cpGap: cpGap, wpGap: wpGap,
    cpGapPct: parseFloat((cpGapPct * 100).toFixed(1)),
    wpGapPct: parseFloat((wpGapPct * 100).toFixed(1)),
    weeks: weeks, cpPerWeek: parseFloat(cpPerWeek.toFixed(2)),
    feasibility: feasibility, emphasis: emphasis,
    /* Cosa implicano quei due numeri alle durate che contano in gara.
       Sola lettura: e' la direzione "in avanti", quella senza ambiguita'. */
    implied: RACE_TARGET_DURATIONS.map(function(secs){
      var now = currentPowerAt(secs);
      var tgt = powerAtFor(secs, t.cp, t.wp, cur.Pmax);
      return {secs: secs, now: now, target: tgt, diff: tgt - now};
    })
  };
}

/* Quali qualita' allena ciascun formato: serve per pesare la rotazione. */
var WORKOUT_FOCUS = {
  wprime:        {wp: 1.0, cp: 0.0},
  ronnestad:     {wp: 0.7, cp: 0.3},
  ronnestad4020: {wp: 0.7, cp: 0.3},
  norwegian4x4:  {wp: 0.5, cp: 0.5},
  eight3:        {wp: 0.5, cp: 0.5},
  fivex5fast:    {wp: 0.4, cp: 0.6},
  fastart:       {wp: 0.4, cp: 0.6},
  bossi:         {wp: 0.4, cp: 0.6},
  seiler4x8:     {wp: 0.15, cp: 0.85},
  overunder:     {wp: 0.15, cp: 0.85},
  sweetspot:     {wp: 0.0, cp: 1.0},
  seiler4x16:    {wp: 0.0, cp: 1.0},
  longthreshold: {wp: 0.0, cp: 1.0},
  sweetspotlong: {wp: 0.0, cp: 1.0},
  torque:        {wp: 0.2, cp: 0.8},
  durability:    {wp: 0.0, cp: 1.0},
  racesim:       {wp: 0.3, cp: 0.7},
  /* I lavori neuromuscolari allenano Pmax, che NON e' una delle due
     leve degli obiettivi di gara (li' si imposta CP e W'): il modello
     lo assume costante. Peso basso su entrambe le dimensioni, cosi'
     restano in rotazione senza mai dominarla: servono a mantenere una
     qualita', non a colmare un divario dichiarato. */
  sprints:       {wp: 0.3, cp: 0.0},
  z2sprints:     {wp: 0.1, cp: 0.5},
  raceattacks:   {wp: 0.7, cp: 0.3},
  pyramid:       {wp: 0.5, cp: 0.5},
  progressive:   {wp: 0.1, cp: 0.9}
};

/* Riordina la rotazione dando piu' spazio ai formati che allenano la
   leva piu' carente, SENZA eliminare gli altri: azzerare una qualita'
   per settimane e' controproducente. */
function weightPoolByEmphasis(pool, emphasis) {
  if (!emphasis || !pool || !pool.length) return pool;
  var scored = pool.map(function(k, i){
    var f = WORKOUT_FOCUS[k] || {wp: 0.5, cp: 0.5};
    return {k: k, score: f.cp * emphasis.cp + f.wp * emphasis.wp, i: i};
  });
  scored.sort(function(a, b){ return b.score - a.score || a.i - b.i; });
  var out = [];
  scored.forEach(function(s, idx){
    out.push(s.k);
    if (idx < 2) out.push(s.k); // i due piu' pertinenti tornano piu' spesso
  });
  return out;
}

function activeRaceEmphasis() {
  if (typeof races === 'undefined' || !races.length) return null;
  var td = today();
  var nextA = races.filter(function(r){ return r.priority === 'A' && r.date >= td; })[0];
  if (!nextA) return null;
  var g = raceGapAnalysis(nextA);
  return g ? {emphasis: g.emphasis, race: nextA, gap: g} : null;
}
