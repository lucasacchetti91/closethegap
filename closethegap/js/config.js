/* ============================================================
   CONFIG.JS
   Costanti globali, colori, dati grezzi attività, best efforts.
   Nessuna dipendenza da altri moduli - deve essere caricato per primo.
   ============================================================ */

var FTP = 340, LTHR = 180, HR_MAX = 197, WEIGHT_KG = 70.5;
var charts = {}, calDate = new Date(), plan = [];

var ZC = {1:'#4a5168',2:'#22d46a',3:'#fbbf24',4:'#f97316',5:'#ff4d4d',6:'#a78bfa',7:'#ec4899'};
var ZBADGE = {z1:'bz1',z2:'bz2',z3:'bz3',z4:'bz4',z5:'bz5',z6:'bz5',race:'brace',off:'boff'};
function zc(z) { return ZC[z] || '#4a5168'; }

/* Inizio della stagione 2026: tutti i caricamenti storici partono da qui,
   così PMC, progressione eFTP e distribuzioni coprono l'intera stagione
   invece di una finestra mobile di pochi mesi. */
var SEASON_START = '2025-11-01';   // stagione in corso (retrocompatibilita')

/* Da dove parte lo STORICO scaricato. Distinto da SEASON_START: la
   stagione corrente serve per PMC e piano, lo storico per i confronti
   fra stagioni. Se Intervals.icu ha dati piu' vecchi (li riceve da
   Strava/Garmin), basta spostare questa data indietro: non serve
   nessun importatore.
   La diagnostica riporta fin dove arrivano davvero i dati sul tuo
   account, cosi' si sa quanto ha senso chiedere. */
var HISTORY_START = '2023-11-01';

/* Una stagione ciclistica va da novembre a ottobre. */
function seasonOf(dateStr) {
  var d = new Date(dateStr + 'T12:00');
  var y = d.getFullYear();
  return (d.getMonth() >= 10) ? (y + 1) : y;   // da novembre conta per l'anno dopo
}
function seasonLabel(y) { return (y - 1) + '/' + String(y).slice(2); }
function seasonBounds(y) { return {from: (y - 1) + '-11-01', to: y + '-10-31'}; }

var ICU_WORKER = 'https://closethegap-proxy.luca-sacchetti91.workers.dev';

/* Proxy Strava non ancora esistente: se in futuro viene creato un worker
   analogo a ICU_WORKER con OAuth Strava, syncStravaStreams() in sync.js
   potrà chiamarlo per calcolare W'bal/Decoupling reali su OGNI uscita
   automaticamente invece che solo su quelle pre-calcolate qui sotto. */
var STRAVA_WORKER = null; // es. 'https://closethegap-strava-proxy.<account>.workers.dev'

/* DATI SEED — ora vuoti.
   Qui c'erano ~30 attività scritte a mano con id STRAVA. Erano ormai
   obsolete (ferme a luglio) e soprattutto dannose: i loro id venivano
   scambiati per id Intervals.icu e passati agli endpoint /activity/...,
   che rispondeva 422 facendo fallire mappa, altimetria e best effort.
   Ora il caricamento avviene dalla cache locale e dal sync automatico
   (vedi js/storage.js): al primo avvio su un browser nuovo l'app resta
   vuota per qualche secondo, poi si popola da sola. */
var RAW = [];

/* bestEfforts: usati dal Critical Power / PDM model. In futuro andrebbero
   ricalcolati dinamicamente dagli stream reali (best mean power per durata)
   invece di essere hardcoded - vedi models.js:updateBestEffortsFromActivities() */
var bestEfforts = [
  {label:'5s',secs:5,watts:919},{label:'15s',secs:15,watts:818},
  {label:'30s',secs:30,watts:702},{label:'1min',secs:60,watts:460},
  {label:'2min',secs:120,watts:367},{label:'5min',secs:300,watts:359},
  {label:'8min',secs:480,watts:356},{label:'10min',secs:600,watts:350},
  {label:'20min',secs:1200,watts:342},{label:'30min',secs:1800,watts:317},
  {label:'1h',secs:3600,watts:290}
];

var activities = RAW.map(function(a) { return Object.assign({}, a); });
