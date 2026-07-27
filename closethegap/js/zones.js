/* ============================================================
   ZONES.JS
   Zone di potenza e FC "individualizzate" sui dati reali, non su
   percentuali fisse da manuale - lo stesso spirito di Intervals.icu,
   che aggiorna le zone quando cambia la tua eFTP invece di tenerle
   fisse a un numero inserito una volta e mai più toccato.

   POTENZA: Z1-Z4 restano percentuali di CP (Coggan classico, funzionano
   bene per le zone sub-soglia). Z5-Z7 (VO2max/anaerobica/neuromuscolare)
   sono invece ancorate a durate fisiologiche reali usando il TUO modello
   W'/Pmax - non tutti hanno lo stesso rapporto W'/CP, quindi un "120% FTP"
   fisso rappresenta uno sforzo molto diverso da persona a persona.
   Qui il confine Z5/Z6 è la potenza sostenibile ~5min, Z6/Z7 quella
   sostenibile ~60s, e la cima di Z7 è il tuo Pmax neuromuscolare reale.

   FC: LTHR può essere stimata automaticamente cercando, nello storico,
   il tuo sforzo continuativo più duro vicino soglia (IF>=0.78, 20-75min)
   e usando la FC media di quello sforzo - lo stesso principio pratico che
   usa Intervals.icu per stimare la LTHR dai tuoi dati invece che da un
   numero inserito a mano. Il campo LTHR nell'header resta comunque
   modificabile manualmente se vuoi correggere la stima.
   ============================================================ */

function computePowerZones() {
  var cp = cpModel();
  var CP = cp.CP, Wp = cp.Wp;
  var pdm = pdmModel();
  var Pmax = pdm.Pmax;

  var top5min = Math.round(CP + Wp/300);  // potenza sostenibile ~5min (dal tuo W')
  var top1min = Math.round(CP + Wp/60);   // potenza sostenibile ~60s

  var z5hi = Math.max(top5min, Math.round(CP*1.06));
  var z6hi = Math.max(top1min, z5hi+1);
  var z7hi = Math.max(Pmax, z6hi+1);

  return [
    {z:1, label:'Z1 Recupero',        lo:0,                    hi:Math.round(CP*0.55)},
    {z:2, label:'Z2 Resistenza',      lo:Math.round(CP*0.55),  hi:Math.round(CP*0.75)},
    {z:3, label:'Z3 Tempo',           lo:Math.round(CP*0.75),  hi:Math.round(CP*0.90)},
    {z:4, label:'Z4 Soglia',          lo:Math.round(CP*0.90),  hi:Math.round(CP*1.05)},
    {z:5, label:'Z5 VO2max',          lo:Math.round(CP*1.05),  hi:z5hi},
    {z:6, label:"Z6 Anaerobica (W')", lo:z5hi,                 hi:z6hi},
    {z:7, label:'Z7 Neuromuscolare',  lo:z6hi,                 hi:z7hi}
  ];
}

function estimateLTHRFromHistory() {
  var candidates = activities.filter(function(a) {
    var IF = calcIF(a);
    return a.hr && IF!=null && IF>=0.78 && a.dur>=1200 && a.dur<=4500;
  });
  if (!candidates.length) return null;
  var best = candidates.reduce(function(b,a){ return (!b || a.hr>b.hr) ? a : b; }, null);
  return {lthr: best.hr, source: best.name, date: best.date};
}

function computeHRZones(lthr) {
  lthr = lthr || LTHR;
  return [
    {z:1,label:'Z1 Recupero', lo:0,                     hi:Math.round(lthr*0.81)},
    {z:2,label:'Z2 Aerobico', lo:Math.round(lthr*0.81), hi:Math.round(lthr*0.90)},
    {z:3,label:'Z3 Tempo',    lo:Math.round(lthr*0.90), hi:Math.round(lthr*0.94)},
    {z:4,label:'Z4 Soglia',   lo:Math.round(lthr*0.94), hi:lthr},
    {z:5,label:'Z5 VO2max',   lo:lthr,                  hi:HR_MAX}
  ];
}

/* Chiamata al bootstrap e dopo ogni sync ICU: allinea FTP/LTHR globali
   (e i rispettivi campi nell'header Analisi) alla stima più recente
   basata sui dati reali, così TUTTI i grafici e il generatore di piano
   partono da numeri aggiornati - esattamente come fa Intervals.icu con
   la sua eFTP. L'utente può sempre sovrascrivere a mano e premere
   "Aggiorna": quello resta un override esplicito, non viene eliminato. */
function applyDataDrivenZones() {
  var cp = cpModel();
  if (cp && cp.CP) {
    FTP = cp.CP;
    var ftpInp = document.getElementById('ftp-inp');
    if (ftpInp) ftpInp.value = FTP;
    var kftp = document.getElementById('k-ftp'); if (kftp) kftp.textContent = FTP+'W';
  }
  var est = estimateLTHRFromHistory();
  if (est && Math.abs(est.lthr - LTHR) >= 2) {
    LTHR = est.lthr;
    var lthrInp = document.getElementById('lthr-inp');
    if (lthrInp) lthrInp.value = LTHR;
  }
  return {ftp: FTP, lthr: LTHR, lthrEstimate: est};
}
