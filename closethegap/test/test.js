/* ============================================================
   TEST.JS — suite di regressione per Close the Gap
   ============================================================
   COME SI USA:
     cd <cartella del repo>
     npm install jsdom       (solo la prima volta)
     node test/test.js

   PERCHÉ ESISTE: durante lo sviluppo sono state introdotte più
   regressioni che un test banale avrebbe intercettato prima del
   deploy — CSS finito dentro il JavaScript, un fallback di rete che
   si "incollava" e rompeva la sincronizzazione, una funzione staccata
   dal proprio corpo, una stima di FTP palesemente sbagliata, e la
   normalizzazione GPS che restituiva zero punti quando il primo
   campione era null.

   NOTA IMPORTANTE SUL DISEGNO DEI TEST:
   dove possibile si testano le FUNZIONI direttamente, non l'HTML che
   producono. Un test precedente verificava se nell'HTML comparisse
   `<path d="M`: dava per buono un caso che in realtà era rotto,
   perché l'asserzione era troppo indiretta. Testare la funzione pura
   ("quanti punti GPS validi tornano?") è più affidabile.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const JS_FILES = ['config.js','icu-native.js','metrics.js','models.js','zones.js','workouts.js',
  'plan-generator.js','charts.js','wellness.js','activity-detail.js','home.js','plan.js',
  'calendar.js','activities.js','sync.js','storage.js','diagnostics.js','app.js'];

let passed = 0, failed = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; failures.push(name + (detail ? ' → ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' → ' + detail : '')); }
}

function section(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 56 - t.length))); }

/* ---------- 0. Sintassi di ogni modulo ---------- */
section('Sintassi dei moduli');
for (const f of JS_FILES) {
  const p = path.join(ROOT, 'js', f);
  try {
    new (require('vm').Script)(fs.readFileSync(p, 'utf8'), { filename: f });
    check(f, true);
  } catch (e) {
    check(f, false, e.message);
  }
}

/* ---------- Avvio dell'app in un DOM finto ---------- */
function bootApp(opts = {}) {
  const bundle = JS_FILES.map(f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).join('\n;\n');
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace(/<script src="https:\/\/cdnjs[^"]*"><\/script>/, '')
    .replace(/<script src="js\/[a-z-]+\.js"><\/script>\n?/g, '')
    .replace('</body>', '<script>' + bundle + '</script></body>');

  const store = {};
  const calls = [];
  const H = { get: () => 'application/json' };
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'https://example.com/',
    beforeParse(w) {
      w.Chart = function (ctx, cfg) { (w.__charts = w.__charts || {})[ctx && ctx.id] = cfg; this.destroy = function () {}; };
      Object.defineProperty(w, 'localStorage', { value: {
        getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; }
      }});
      w.fetch = function (url) {
        calls.push(url);
        if (opts.fetch) return opts.fetch(url, H);
        return Promise.resolve({ ok: true, status: 200, headers: H, json: () => Promise.resolve([]) });
      };
      w.console.debug = () => {};
      w.console.info = () => {};
    }
  });
  const errors = [];
  dom.window.onerror = (m, u, l) => errors.push(m + ' L' + l);
  return { win: dom.window, errors, store, calls };
}

setTimeout(() => {
  const { win, errors } = bootApp();

  /* ---------- 1. Avvio pulito ---------- */
  section('Avvio');
  check('nessun errore JavaScript al caricamento', errors.length === 0, errors.join('; '));
  check('il piano viene generato', Array.isArray(win.plan) && win.plan.length > 0, 'plan=' + (win.plan || []).length);
  check('nessuna data duplicata nel piano', win.plan.length === new Set(win.plan.map(p => p.date)).size);
  check('nessuna sessione con TSS/durata NaN', !win.plan.some(p => isNaN(p.tss) || isNaN(p.durMin)));

  /* ---------- 2. Navigazione fra le tab ---------- */
  section('Navigazione');
  for (const page of ['home', 'plan', 'calendar', 'activities', 'analytics']) {
    const before = errors.length;
    try { win.showPage(page); check('tab ' + page, errors.length === before); }
    catch (e) { check('tab ' + page, false, e.message); }
  }

  /* ---------- 3. Coordinate GPS (il bug della mappa mancante) ---------- */
  section('Normalizzazione GPS');
  const N = 120;
  const la = i => 45.6 + 0.01 * Math.sin(i / 20);
  const lo = i => 8.2 + 0.012 * Math.cos(i / 20);
  const pairs = Array.from({ length: N }, (_, i) => [la(i), lo(i)]);

  check('coppie [lat,lng]', win.normalizeLatLng({ latlng: pairs }).length === N);
  check('oggetti {lat,lng}', win.normalizeLatLng({ latlng: pairs.map(p => ({ lat: p[0], lng: p[1] })) }).length === N);
  check('array piatto', win.normalizeLatLng({ latlng: pairs.flat() }).length === N);
  check('stream lat/lng separati', win.normalizeLatLng({ lat: pairs.map(p => p[0]), lng: pairs.map(p => p[1]) }).length === N);
  // REGRESSIONE: il GPS aggancia dopo qualche secondo, quindi i primi campioni sono null
  const firstNull = pairs.map((p, i) => (i < 5 ? null : p));
  check('PRIMO campione null (GPS non ancora agganciato)',
    win.normalizeLatLng({ latlng: firstNull }).length === N - 5,
    'ottenuti ' + win.normalizeLatLng({ latlng: firstNull }).length + ' invece di ' + (N - 5));
  const midNull = pairs.map((p, i) => (i === 50 ? null : p));
  check('null a metà tracciato', win.normalizeLatLng({ latlng: midNull }).length === N - 1);
  check('coordinate 0/0 scartate', win.normalizeLatLng({ latlng: [[0, 0], [45, 8]] }).length === 1);
  check('stream assente → array vuoto', win.normalizeLatLng({}).length === 0);
  check('stream tutto null → array vuoto', win.normalizeLatLng({ latlng: [null, null] }).length === 0);

  /* ---------- 4. Modelli fisiologici ---------- */
  section('Modelli');
  const cp = win.cpModel();
  check('CP in un intervallo plausibile (150-500W)', cp.CP > 150 && cp.CP < 500, 'CP=' + cp.CP);
  check("W' in un intervallo plausibile (3-40kJ)", cp.Wp > 3000 && cp.Wp < 40000, "W'=" + cp.Wp);
  // REGRESSIONE: la curva CP arrivava a ~8000W estrapolando il modello a 5 secondi
  const at120 = cp.CP + cp.Wp / 120;
  check('modello CP a 2min sotto i 700W (non estrapolare a 5s!)', at120 < 700, at120.toFixed(0) + 'W');
  const pdm = win.pdmModel();
  check('FTP stimata plausibile (150-500W)', pdm.ftpEst > 150 && pdm.ftpEst < 500, 'FTP=' + pdm.ftpEst);
  check('Pmax > CP', pdm.Pmax > pdm.CP);

  const zones = win.computePowerZones();
  check('7 zone di potenza', zones.length === 7);
  check('zone monotone crescenti', zones.every((z, i) => i === 0 || z.lo >= zones[i - 1].lo));
  check('zone senza sovrapposizioni', zones.every((z, i) => i === 0 || z.lo === zones[i - 1].hi));

  /* ---------- 5. Vincoli del piano ---------- */
  section('Vincoli del piano');
  const td = win.today();
  const future = win.plan.filter(p => p.date > td && p.date < win.GOAL_DATE);
  const weeks = {};
  future.forEach(p => {
    const d = new Date(p.date + 'T12:00'), dow = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - ((dow + 6) % 7));
    (weeks[mon.toISOString().slice(0, 10)] ||= []).push({ ...p, dow });
  });
  const wkKeys = Object.keys(weeks);
  const overCap = future.filter(p => new Date(p.date + 'T12:00').getDay() !== 6 && p.durMin > 120);
  check('nessuna uscita infrasettimanale oltre 2h', overCap.length === 0,
    overCap.map(p => p.name + ' ' + p.durMin + 'min').join(', '));
  const rideCounts = wkKeys.map(k => weeks[k].filter(s => s.type !== 'off').length);
  const fullWeeks = rideCounts.slice(0, -1); // l'ultima settimana è parziale
  check('3-4 uscite a settimana', fullWeeks.every(c => c >= 3 && c <= 4), 'conteggi: ' + rideCounts.join(','));
  const tssPerHour = future.filter(p => p.durMin > 20).map(p => p.tss / (p.durMin / 60));
  check('densità TSS plausibile (<110 TSS/h)', tssPerHour.every(v => v < 110),
    'max ' + Math.round(Math.max(...tssPerHour)) + ' TSS/h');
  const methods = new Set(future.map(p => p.method).filter(Boolean));
  check('almeno 4 formati di allenamento diversi', methods.size >= 4, [...methods].join(', '));

  /* ---------- 6. Best mean power ---------- */
  section('Best effort');
  const flat = new Array(600).fill(250);
  const bm = win.bestMeanPowers(flat, [60, 300]);
  check('potenza costante → best = valore costante', bm.every(b => b.watts === 250));
  const spike = new Array(600).fill(200); for (let i = 100; i < 160; i++) spike[i] = 400;
  const bs = win.bestMeanPowers(spike, [60]);
  check('picco di 60s individuato correttamente', bs[0].watts === 400, 'ottenuto ' + bs[0].watts);
  check('durate più lunghe dello stream vengono ignorate', win.bestMeanPowers(flat, [1200]).length === 0);

  /* ---------- 7. Metriche ---------- */
  section('Metriche');
  check('calcTSS su attività nota', win.calcTSS({ dur: 3600, np: win.FTP }) === 100,
    'ottenuto ' + win.calcTSS({ dur: 3600, np: win.FTP }));
  check('calcIF coerente', Math.abs(win.calcIF({ np: win.FTP }) - 1) < 0.01);
  const pmc = win.computePMC();
  check('PMC restituisce valori finiti', [pmc.ctl, pmc.atl, pmc.tsb].every(Number.isFinite));

  /* ---------- 7bis. Modello Morton 3 parametri (dati reali ICU) ---------- */
  section('Morton 3 parametri');
  // Valori reali letti dal report di diagnostica dell'utente
  const CP = 347, WP = 27093, PMAX = 1103;
  const m15 = win.mortonPower(15, CP, WP, PMAX);
  const m3600 = win.mortonPower(3600, CP, WP, PMAX);
  check('Morton a 15s sotto Pmax', m15 < PMAX && m15 > CP, m15.toFixed(0) + 'W');
  // REGRESSIONE: applicare l'iperbole a 2 parametri al W' di Morton dava 2153W a 15s
  check('Morton a 15s plausibile (<1000W)', m15 < 1000, m15.toFixed(0) + 'W');
  check('Morton a 1h tende a CP', Math.abs(m3600 - CP) < 15, m3600.toFixed(0) + 'W');
  check('Morton monotono decrescente',
    [5, 30, 60, 300, 1200, 3600].every((t, i, a) => i === 0 || win.mortonPower(t, CP, WP, PMAX) < win.mortonPower(a[i - 1], CP, WP, PMAX)));
  win.ICU_NATIVE_CP = { eftp: CP, wPrime: WP, pMax: PMAX };
  const cpN = win.cpModel();
  check("W' nativo NON scartato quando c'è Pmax", cpN.Wp === WP && cpN.model === 'morton3p',
    "model=" + cpN.model + " W'=" + cpN.Wp);
  win.ICU_NATIVE_CP = null;

  /* ---------- 7ter. Zone: conteggi diversi fra ICU e modello locale ---------- */
  section('Zone con conteggi diversi');
  // REGRESSIONE: ICU manda 8 zone di potenza e 7 di FC, il modello locale 7 e 5.
  // Mappandole per indice i tempi finivano nelle zone sbagliate.
  const lbl8 = win.zoneLabelsFor(8, 'power');
  const lbl7 = win.zoneLabelsFor(7, 'hr');
  check('8 etichette per 8 zone di potenza ICU', lbl8.length === 8);
  check('7 etichette per 7 zone cardiache ICU', lbl7.length === 7);
  check('etichette senza intervalli inventati se le definizioni ICU mancano',
    lbl8.every(l => l.name && (l.range === null || typeof l.range === 'string')));

  /* ---------- 7quater. LTHR non sovrascritta automaticamente ---------- */
  section('LTHR');
  // REGRESSIONE: la stima automatica metteva 154 bpm al posto di ~180,
  // sballando tutte le zone cardiache.
  win.LTHR = 180;
  win.applyDataDrivenZones();
  check('applyDataDrivenZones NON modifica la LTHR', win.LTHR === 180, 'LTHR=' + win.LTHR);
  const hrZ = win.computeHRZones(180);
  check('zone FC coerenti con LTHR impostata', hrZ[3].hi === 180, 'Z4 hi=' + hrZ[3].hi);

  /* ---------- 7quinquies. Id Intervals.icu (la causa del 422) ---------- */
  section('Id Intervals.icu');
  // REGRESSIONE: gli id STRAVA dei dati seed venivano scambiati per id ICU
  // e passati a /activity/{id}/..., che rispondeva 422.
  check('id Strava puramente numerico NON accettato come id ICU',
    win.icuIdOf({ id: '19360116613' }) === null, 'ottenuto ' + win.icuIdOf({ id: '19360116613' }));
  check('prefisso icu- riconosciuto', win.icuIdOf({ id: 'icu-i98765' }) === 'i98765');
  check('campo icu_id ha la precedenza', win.icuIdOf({ id: '19360116613', icu_id: 'i555' }) === 'i555');
  check('attività senza id → null', win.icuIdOf({}) === null);
  check('dati seed hardcoded rimossi da config.js', win.RAW.length === 0, 'RAW=' + win.RAW.length);

  /* ---------- 7sexies. Coordinate in array piatto ---------- */
  section('latlng piatto: interleaved vs concatenato');
  // Un accoppiamento sbagliato produce una mappa PLAUSIBILE MA FALSA,
  // impossibile da riconoscere a occhio: va determinato dai dati.
  const M = 500;
  const rlat = i => 45.63 + 0.02 * Math.sin(i / 80);
  const rlng = i => 8.70 + 0.03 * Math.cos(i / 80);
  const inter = [], concat = [];
  for (let i = 0; i < M; i++) inter.push(rlat(i), rlng(i));
  for (let i = 0; i < M; i++) concat.push(rlat(i));
  for (let i = 0; i < M; i++) concat.push(rlng(i));

  const rI = win.normalizeLatLng({ latlng: inter });
  check('interleaved riconosciuto', win.latlngLayoutDetected === 'flat-interleaved', win.latlngLayoutDetected);
  check('interleaved: lat/lng nel giusto ordine',
    Math.abs(rI[0][0] - rlat(0)) < 1e-6 && Math.abs(rI[0][1] - rlng(0)) < 1e-6);
  const rC = win.normalizeLatLng({ latlng: concat });
  check('concatenato riconosciuto', win.latlngLayoutDetected === 'flat-concatenated', win.latlngLayoutDetected);
  check('concatenato: lat/lng nel giusto ordine',
    Math.abs(rC[0][0] - rlat(0)) < 1e-6 && Math.abs(rC[0][1] - rlng(0)) < 1e-6, JSON.stringify(rC[0]));

  // REGRESSIONE CRITICA: se nessun accoppiamento produce coordinate sensate
  // NON si deve disegnare un percorso inventato. Caso reale osservato:
  // tutti i valori intorno a 45 (due latitudini), nessuna longitudine.
  const allLat = [];
  for (let i = 0; i < 400; i++) allLat.push(45.578 + 0.05 * Math.sin(i / 40));
  const rBad = win.normalizeLatLng({ latlng: allLat });
  check('coordinate implausibili → nessun percorso (non inventato)', rBad.length === 0,
    'ottenuti ' + rBad.length + ' punti');
  check('viene registrato il motivo dello scarto', !!win.latlngRejectReason);

  // Un'uscita che copre mezzo pianeta non è una traccia GPS valida
  const wild = [];
  for (let i = 0; i < 400; i++) wild.push(20 + i * 0.1, 5 + i * 0.1);
  check('escursione geografica assurda → scartata', win.normalizeLatLng({ latlng: wild }).length === 0);

  // Il controllo vale anche per il formato a coppie, non solo per quello piatto
  const badPairs = Array.from({ length: 50 }, (_, i) => [45.6 + i * 0.001, 45.5 + i * 0.001]);
  check('coppie con lat/lng sovrapposte → scartate', win.normalizeLatLng({ latlng: badPairs }).length === 0);

  /* ---------- 7septies. Curva di potenza: forme della risposta ---------- */
  section('Curva di potenza');
  const secs = [5, 15, 30, 60, 120, 300, 600, 1200, 3600];
  const wattsArr = [900, 800, 700, 550, 450, 400, 375, 355, 340];
  const shapes = {
    'array piatto di punti': secs.map((s, i) => ({ secs: s, watts: wattsArr[i] })),
    'oggetto con array': { secs, watts: wattsArr },
    '{list:[curva]} (forma reale ICU)': { list: [{ secs, watts: wattsArr }], activities: [] },
    '{list:[{points}]}': { list: [{ points: secs.map((s, i) => ({ secs: s, watts: wattsArr[i] })) }] }
  };
  for (const [name, shape] of Object.entries(shapes)) {
    const r = win.normalizePowerCurve(shape);
    check(name, r !== null && r.length >= 4, r ? r.length + ' durate' : 'non riconosciuto');
  }
  check('forma incomprensibile → null (niente dati inventati)',
    win.normalizePowerCurve({ pippo: 1 }) === null);

  console.log('\n' + '═'.repeat(60));
  console.log(failed === 0
    ? `✅ TUTTI I TEST SUPERATI (${passed})`
    : `❌ ${failed} FALLITI su ${passed + failed}\n\n` + failures.map(f => '   • ' + f).join('\n'));
  console.log('═'.repeat(60));
  process.exit(failed === 0 ? 0 : 1);
}, 900);
