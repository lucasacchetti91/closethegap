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

var ICU_WORKER = 'https://closethegap-proxy.luca-sacchetti91.workers.dev';

/* Proxy Strava non ancora esistente: se in futuro viene creato un worker
   analogo a ICU_WORKER con OAuth Strava, syncStravaStreams() in sync.js
   potrà chiamarlo per calcolare W'bal/Decoupling reali su OGNI uscita
   automaticamente invece che solo su quelle pre-calcolate qui sotto. */
var STRAVA_WORKER = null; // es. 'https://closethegap-strava-proxy.<account>.workers.dev'

var RAW = [
  {id:"19360116613",name:"Rima/Rimasco",date:"2026-07-18",dur:14007,dist:126160,elev:1692,re:310,cal:3629,avg_watts:234,hr:155,max_hr:188},
  {id:"19349118875",name:"Pedalata pranzo",date:"2026-07-17",dur:4908,dist:48067,elev:291,re:78,cal:1291,avg_watts:238,hr:150,max_hr:181},
  {id:"19319031721",name:"Pedalata mattutina",date:"2026-07-15",dur:5342,dist:51793,elev:355,re:104,cal:1449,avg_watts:246,hr:154,max_hr:181},
  {id:"19279982967",name:"GF Biella",date:"2026-07-12",dur:11963,dist:100410,elev:1889,re:284,cal:3310,avg_watts:252,hr:158,max_hr:191,isRace:true,
    stream_wbal_min_kj:0.0,stream_wbal_end_kj:7.45,stream_decoupling_pct:-3.6,stream_source:'strava-stream-r300'},
  {id:"19245395851",name:"Pedalata pomeridiana",date:"2026-07-09",dur:5492,dist:57273,elev:221,re:121,cal:1460,avg_watts:240,hr:156,max_hr:190},
  {id:"19217849075",name:"Pedalata serale",date:"2026-07-07",dur:4555,dist:45878,elev:118,re:41,cal:1130,avg_watts:222,hr:141,max_hr:182},
  {id:"19187476821",name:"Colma di Varallo",date:"2026-07-05",dur:10204,dist:92277,elev:1413,re:236,cal:2665,avg_watts:236,np:279,if_val:0.82,_tss_override:224,hr:156,max_hr:193,
    stream_wbal_min_kj:0.0,stream_wbal_end_kj:8.49,stream_decoupling_pct:9.0,stream_source:'strava-stream-r300'},
  {id:"19162407558",name:"Pedalata pranzo",date:"2026-07-03",dur:5032,dist:50702,elev:323,re:97,cal:1293,avg_watts:231,hr:154,max_hr:193},
  {id:"19136487956",name:"Pedalata pranzo",date:"2026-07-01",dur:4304,dist:43398,elev:157,re:57,cal:1112,avg_watts:232,hr:147,max_hr:176},
  {id:"19113532612",name:"Pedalata serale",date:"2026-06-29",dur:4741,dist:50933,elev:284,re:60,cal:1172,avg_watts:222,hr:145,max_hr:190},
  {id:"19082236540",name:"Calogna",date:"2026-06-27",dur:9706,dist:90192,elev:1120,re:203,cal:2451,avg_watts:228,hr:154,max_hr:195},
  {id:"19062655515",name:"Afternoon Ride",date:"2026-06-25",dur:6296,dist:63180,elev:176,re:114,cal:1622,avg_watts:233,hr:152,max_hr:189},
  {id:"19031717160",name:"Morning Ride",date:"2026-06-23",dur:4655,dist:46163,elev:209,re:101,cal:1299,avg_watts:253,hr:156,max_hr:176},
  {id:"19007836013",name:"Pedalata mattutina",date:"2026-06-21",dur:13948,dist:111846,elev:2176,re:252,cal:3077,avg_watts:196,hr:150,max_hr:182},
  {id:"18983553582",name:"Pedalata pranzo",date:"2026-06-19",dur:4865,dist:48062,elev:284,re:76,cal:1186},
  {id:"18932416745",name:"Pedalata serale",date:"2026-06-15",dur:4350,dist:45799,elev:132,re:72,cal:1205},
  {id:"18905594898",name:"Agrate Conturbia 2nd",date:"2026-06-13",dur:5067,dist:64090,elev:365,cal:1424,isRace:true},
  {id:"18877266738",name:"Pedalata pranzo",date:"2026-06-11",dur:4567,dist:46821,elev:172,re:80,cal:1232},
  {id:"18826785121",name:"Pedalata pomeridiana",date:"2026-06-07",dur:9055,dist:89764,elev:546,re:158,cal:2409},
  {id:"18630594293",name:"Nove Colli",date:"2026-05-24",dur:13683,dist:135079,elev:2019,re:337,cal:3636,isRace:true,
    stream_wbal_min_kj:0.0,stream_wbal_end_kj:1.09,stream_decoupling_pct:2.9,stream_source:'strava-stream-r300'},
  {id:"18540072157",name:"Bra Bra",date:"2026-05-17",dur:10294,dist:100625,elev:1917,re:282,cal:2773,isRace:true},
  {id:"18356817094",name:"Canegrate 7th",date:"2026-05-03",dur:4917,dist:62622,elev:147,re:196,cal:1539,isRace:true},
  {id:"18251323000",name:"Alzate Brianza",date:"2026-04-25",dur:4536,dist:53866,elev:546,re:116,cal:1232,isRace:true},
  {id:"18160402585",name:"Suno 1st",date:"2026-04-18",dur:5452,dist:70570,elev:182,re:204,cal:1585,isRace:true},
  {id:"18076316357",name:"MF Colnago 23th",date:"2026-04-12",dur:10220,dist:109682,elev:1509,re:320,cal:2882,isRace:true},
  {id:"17896806764",name:"Castelletto Ticino 3rd",date:"2026-03-29",dur:5513,dist:62951,elev:568,re:154,cal:1617,isRace:true},
  {id:"17815204439",name:"Pedalata mattutina",date:"2026-03-22",dur:14797,dist:134464,elev:1563,re:292,cal:3904},
  {id:"17734727357",name:"Pedalata pomeridiana",date:"2026-03-15",dur:11847,dist:115073,elev:889,re:238,cal:3310},
  {id:"17644515154",name:"Strade Bianche 21th",date:"2026-03-08",dur:8545,dist:84608,elev:1470,re:240,cal:2331,isRace:true,
    stream_wbal_min_kj:0.0,stream_wbal_end_kj:1.1,stream_decoupling_pct:-17.6,stream_source:'strava-stream-r300'}
];

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
