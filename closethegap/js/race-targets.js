/* ============================================================
   RACE-TARGETS.JS
   Obiettivi di potenza per le gare A, definiti per durata
   (30s / 3m / 6m / 12m / 20m) e tradotti in indicazioni di allenamento.

   L'IDEA CHIAVE, E PERCHE' NON SI INSEGUONO I CINQUE NUMERI.
   Il modello a tre parametri ha solo DUE leve: CP e W' (Pmax e' quasi
   fisso). Verificato sui tuoi valori:
     - alzare il CP di 15W aggiunge +15W a tutte le durate oltre i 3'
     - alzare il W' del 20% aggiunge +33W a 30s ma solo +5W a 20'
   Cinque obiettivi indipendenti sono quindi sovra-specificati: possono
   essere reciprocamente contraddittori senza che ci si accorga (es.
   chiedere +40W a 20' e contemporaneamente +60W a 30s implica due CP
   diversi). Invece di rincorrerli uno per uno, qui si RISOLVE il
   problema al contrario: quale coppia (CP, W') li soddisfa meglio, di
   quanto dista da quella attuale, e se i target sono coerenti fra loro.

   Da quel divario si ricava l'enfasi dell'allenamento: se manca
   soprattutto CP servono lavori a soglia e sub-soglia; se manca
   soprattutto W' servono lavori brevi e intensi.
   ============================================================ */

var RACE_TARGET_DURATIONS = [30, 180, 360, 720, 1200]; // 30s, 3m, 6m, 12m, 20m
var RACE_TARGET_LABELS = {30:'30s', 180:'3min', 360:'6min', 720:'12min', 1200:'20min'};
var raceTargets = {};   // { 'ctg-race-<data>': {30:800, 180:500, ...} }
var RACE_TARGETS_KEY = 'ctg_race_targets_v1';

function loadRaceTargets() {
  try {
    var raw = localStorage.getItem(RACE_TARGETS_KEY);
    if (raw) raceTargets = JSON.parse(raw) || {};
  } catch (e) { raceTargets = {}; }
  return raceTargets;
}
function saveRaceTargets() {
  try { localStorage.setItem(RACE_TARGETS_KEY, JSON.stringify(raceTargets)); return true; }
  catch (e) { return false; }
}
function raceKey(r) { return 'race-' + r.date; }

/* Potenza attuale prevista a una durata, dal modello in uso. */
function currentPowerAt(secs) {
  var cp = cpModel();
  return predictedPower(secs, cp);
}

/* Target predefiniti: si parte da quello che sai gia' fare, con un
   margine di miglioramento realistico che si riduce sulle durate
   lunghe (il CP si muove piu' lentamente della capacita' anaerobica).
   Sono un punto di partenza da correggere a mano, non una previsione. */
function defaultTargetsFor(r) {
  var out = {};
  RACE_TARGET_DURATIONS.forEach(function(t){
    var margin = t <= 60 ? 1.06 : t <= 360 ? 1.05 : 1.04;
    out[t] = Math.round(currentPowerAt(t) * margin);
  });
  return out;
}

function getRaceTargets(r) {
  var k = raceKey(r);
  if (!raceTargets[k]) raceTargets[k] = defaultTargetsFor(r);
  return raceTargets[k];
}
function setRaceTarget(r, secs, watts) {
  var k = raceKey(r);
  if (!raceTargets[k]) raceTargets[k] = defaultTargetsFor(r);
  var v = parseInt(watts, 10);
  if (isFinite(v) && v > 50 && v < 2000) raceTargets[k][secs] = v;
  saveRaceTargets();
  return raceTargets[k];
}

/* ---- Risoluzione inversa: quale (CP, W') soddisfa i target? ----
   Il modello di Morton non e' invertibile in forma chiusa, quindi si
   cerca il minimo dell'errore con una griglia grossolana seguita da un
   raffinamento. E' un problema a due variabili su un dominio piccolo:
   costa niente ed evita di dipendere da una libreria di ottimizzazione. */
function solveRequiredModel(targets, Pmax) {
  var cur = cpModel();
  Pmax = Pmax || cur.Pmax || 1100;
  var ts = RACE_TARGET_DURATIONS.filter(function(t){ return targets[t]; });
  if (ts.length < 2) return null;

  function err(cp, wp) {
    var e = 0;
    ts.forEach(function(t){
      var pred = wp / (t + wp / (Pmax - cp)) + cp;
      var d = (pred - targets[t]) / targets[t];
      e += d * d;
    });
    return e / ts.length;
  }

  var best = {cp: cur.CP, wp: cur.Wp, e: Infinity};
  function search(cpLo, cpHi, cpStep, wpLo, wpHi, wpStep) {
    for (var cp = cpLo; cp <= cpHi; cp += cpStep) {
      if (cp >= Pmax - 20) continue;
      for (var wp = wpLo; wp <= wpHi; wp += wpStep) {
        var e = err(cp, wp);
        if (e < best.e) best = {cp: cp, wp: wp, e: e};
      }
    }
  }
  search(200, Math.min(500, Pmax - 30), 5, 5000, 60000, 1000);
  search(best.cp - 6, best.cp + 6, 1, Math.max(3000, best.wp - 1500), best.wp + 1500, 100);

  /* COERENZA: non basta l'errore MEDIO.
     Due scarti opposti si compensano nella media e un insieme di
     target impossibile passerebbe per buono: nei test un caso con -29W
     a 30s e -20W a 20' dava un errore medio del 3.1%, sotto qualunque
     soglia ragionevole. Si guardano quindi gli scarti SINGOLI, e si
     segnalano le durate che il modello non riesce a raggiungere. */
  var perDuration = ts.map(function(t){
    var pred = Math.round(best.wp / (t + best.wp / (Pmax - best.cp)) + best.cp);
    var diff = pred - targets[t];
    return {
      secs: t, target: targets[t], modelled: pred, diff: diff,
      offPct: parseFloat((diff / targets[t] * 100).toFixed(1)),
      conflicting: Math.abs(diff) > Math.max(8, targets[t] * 0.02)
    };
  });
  var conflicts = perDuration.filter(function(d){ return d.conflicting; });
  return {
    CP: Math.round(best.cp),
    Wp: Math.round(best.wp),
    Pmax: Math.round(Pmax),
    rmsePct: parseFloat((Math.sqrt(best.e) * 100).toFixed(1)),
    consistent: conflicts.length === 0,
    conflicts: conflicts,
    perDuration: perDuration
  };
}

/* Divario fra dove sei e dove dovresti arrivare. */
function raceGapAnalysis(r) {
  var targets = getRaceTargets(r);
  var cur = cpModel();
  var req = solveRequiredModel(targets, cur.Pmax);
  if (!req) return null;

  var cpGap = req.CP - cur.CP;
  var wpGap = req.Wp - cur.Wp;
  var cpGapPct = cpGap / cur.CP;
  var wpGapPct = wpGap / cur.Wp;
  var weeks = Math.max(1, Math.round((new Date(r.date + 'T12:00') - new Date(today() + 'T12:00')) / (7 * 86400000)));

  /* Enfasi: quale delle due leve pesa di piu'. Si usano i divari
     RELATIVI, perche' 15W di CP e 3kJ di W' non sono confrontabili
     in valore assoluto. */
  /* Solo i divari POSITIVI contano: se una qualita' e' gia' oltre il
     target non va allenata di piu'. Usare il valore assoluto al
     denominatore era un errore, perche' un W' in eccesso diluiva
     l'enfasi sul CP e le due quote non sommavano a 100%.
     Se entrambe le qualita' sono gia' a posto si torna a un piano
     equilibrato di mantenimento. */
  var cpNeed = Math.max(cpGapPct, 0);
  var wpNeed = Math.max(wpGapPct, 0);
  var totalNeed = cpNeed + wpNeed;
  var emphasis = totalNeed > 0
    ? {cp: cpNeed / totalNeed, wp: wpNeed / totalNeed}
    : {cp: 0.5, wp: 0.5, atTarget: true};

  /* Fattibilita': ~1.5W/settimana di CP e' un ritmo gia' buono per un
     atleta allenato; oltre i 2.5 e' improbabile senza un salto di
     volume. Il W' risponde piu' in fretta ma ha un tetto piu' basso. */
  var cpPerWeek = cpGap / weeks;
  var feasibility = cpPerWeek <= 1.5 ? 'realistico'
                  : cpPerWeek <= 2.5 ? 'ambizioso'
                  : 'improbabile';

  return {
    race: r, targets: targets, current: {CP: cur.CP, Wp: cur.Wp, Pmax: cur.Pmax},
    required: req, cpGap: cpGap, wpGap: wpGap,
    cpGapPct: parseFloat((cpGapPct * 100).toFixed(1)),
    wpGapPct: parseFloat((wpGapPct * 100).toFixed(1)),
    weeks: weeks, cpPerWeek: parseFloat(cpPerWeek.toFixed(2)),
    feasibility: feasibility, emphasis: emphasis
  };
}

/* Quali durate allena ciascun formato: serve per pesare la rotazione. */
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
  racesim:       {wp: 0.3, cp: 0.7}
};

/* Riordina un pool dando piu' spazio ai formati che allenano la leva
   piu' carente, SENZA eliminare gli altri: azzerare una delle due
   qualita' per settimane e' controproducente, e la varieta' resta uno
   dei criteri del generatore. */
function weightPoolByEmphasis(pool, emphasis) {
  if (!emphasis || !pool || !pool.length) return pool;
  var scored = pool.map(function(k, i){
    var f = WORKOUT_FOCUS[k] || {wp: 0.5, cp: 0.5};
    var score = f.cp * emphasis.cp + f.wp * emphasis.wp;
    return {k: k, score: score, i: i};
  });
  scored.sort(function(a, b){ return b.score - a.score || a.i - b.i; });
  // i due formati piu' pertinenti compaiono due volte nella rotazione
  var out = [];
  scored.forEach(function(s, idx){
    out.push(s.k);
    if (idx < 2) out.push(s.k);
  });
  return out;
}

/* Enfasi della gara A piu' vicina: e' quella che guida il piano. */
function activeRaceEmphasis() {
  if (typeof races === 'undefined' || !races.length) return null;
  var td = today();
  var nextA = races.filter(function(r){ return r.priority === 'A' && r.date >= td; })[0];
  if (!nextA) return null;
  var g = raceGapAnalysis(nextA);
  return g ? {emphasis: g.emphasis, race: nextA, gap: g} : null;
}
