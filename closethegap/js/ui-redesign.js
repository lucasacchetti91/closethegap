/* ============================================================
   UI-REDESIGN.JS
   Aggiunte per il restyle (mockup 3a/3b, 4a/4b). Non modifica gli
   altri moduli: ridefinisce due funzioni di home.js dopo che sono
   state dichiarate. Va caricato ULTIMO, dopo js/app.js.
   ============================================================ */

var USER_NAME = 'Luca';
/* Obiettivo di stagione. Se lo prendi da races.js (gara A), sostituisci
   questi valori con la lettura da quella struttura. */
var GOAL = { watts: 360, date: '2026-09-19' };

/* ---------- 1. Card TSB eroe ---------- */
/* home.js scrive gia' in #k-tsb, #k-ctl, #k-atl, #k-ftp e mette su
   #k-tsb la classe kv-up / kv-dn / kv-wa: il colore del numero grande
   arriva da la'. Qui riempiamo solo etichetta di stato, frase e gara. */
function renderHero() {
  var flag = document.getElementById('tsb-flag');
  if (!flag) return;
  var tsb = parseFloat((document.getElementById('k-tsb').textContent || '0').replace('−', '-')) || 0;

  var state = tsb > 5   ? ['FRESCO',    'buona finestra per intensita',        'var(--grn)']
            : tsb > -10 ? ['IN CARICO', 'fatica appena sopra la fitness',      'var(--yel)']
            :             ['AFFATICATO','scarico o volume facile, non soglia', 'var(--red)'];

  flag.textContent = state[0];
  flag.style.color = state[2];
  flag.style.background = 'color-mix(in srgb, ' + state[2] + ' 12%, transparent)';
  document.getElementById('tsb-note').textContent = state[1];

  var race = document.getElementById('hero-race');
  if (race) {
    var d = new Date(GOAL.date);
    race.innerHTML = d.getDate() + '<span>' +
      d.toLocaleDateString('it', { month: 'short' }).replace('.', '') + '</span>';
  }
  var gap = document.getElementById('hero-gap');
  if (gap) {
    var delta = GOAL.watts - FTP;
    gap.innerHTML = (delta > 0 ? '−' : '+') + Math.abs(delta) + '<span>W</span>';
    gap.className = 'kv-s ' + (delta > 0 ? 'kv-pur' : 'kv-up');
  }
}

/* ---------- 2. Progresso settimanale compatto ---------- */
/* Sostituisce la versione di home.js: "mancano 76" sale accanto
   all'etichetta invece di stare sotto la barra, uscite e km in testa.
   Tre righe risparmiate su una schermata da sei pollici. */
function renderWeekProgress(ws, wp) {
  var el = document.getElementById('week-progress');
  if (!el) return;

  var now = new Date();
  var mon = new Date(now); mon.setDate(now.getDate() - now.getDay() + 1); mon.setHours(0, 0, 0, 0);
  var sun = new Date(mon); sun.setDate(mon.getDate() + 6); sun.setHours(23, 59, 59);
  var doneSessions = activities.filter(function (a) {
    var d = new Date(a.date); return d >= mon && d <= sun;
  }).length;

  function bar(label, done, plan, unit, decimals) {
    var pct = plan > 0 ? Math.min(100, Math.round(done / plan * 100)) : 0;
    var col = pct >= 80 ? 'var(--grn)' : pct >= 45 ? 'var(--acc)' : 'var(--blu)';
    var fmt = function (v) { return decimals ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v); };
    var rem = plan - done;
    var remTxt = plan <= 0 ? '' : rem > 0 ? ' <em>· mancano ' + fmt(rem) + unit + '</em>'
                                          : ' <em>· target raggiunto</em>';
    return '<div class="wp-row">' +
             '<span class="wp-lbl">' + label + remTxt + '</span>' +
             '<span class="wp-val">' + fmt(done) + '<span>/' + fmt(plan) + unit + '</span></span>' +
           '</div>' +
           '<div class="wp-track"><div class="wp-fill" style="width:' + pct + '%;background:' + col + ';"></div></div>';
  }

  el.innerHTML =
    '<div class="wp-head gc-lbl">USCITE <b>' + doneSessions + '</b>/' + wp.sessions +
      ' · KM <b>' + Math.round(ws.km / 1000) + '</b></div>' +
    bar('TSS', Math.round(ws.tss), Math.round(wp.tss), '', false) +
    bar('Ore', ws.dur / 3600, wp.dur / 3600, 'h', true);

  renderHero();
}

/* ---------- 3. Settimana a barre giornaliere ---------- */
/* Sostituisce renderWeekStrip(): stessa griglia di sette giorni, ma
   l'altezza della barra e' il TSS. Verde = svolto, giallo = oggi,
   grigio = pianificato. Il click apre il giorno come prima. */
function renderWeekStrip() {
  var host = document.getElementById('week-strip');
  if (!host) return;

  var now = new Date(), mon = new Date(now);
  mon.setDate(now.getDate() - now.getDay() + 1); mon.setHours(0, 0, 0, 0);
  var dows = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
  var td = today(), days = [], max = 1;

  for (var i = 0; i < 7; i++) {
    var d = new Date(mon); d.setDate(mon.getDate() + i);
    var ds = dateKey(d);
    var s = plan.find(function (p) { return p.date === ds; });
    var done = activities.find(function (a) { return a.date === ds; });
    var tss = done ? calcTSS(done) : (s && s.tss) || 0;
    max = Math.max(max, tss);
    days.push({ ds: ds, dow: dows[i], tss: tss, done: !!done, today: ds === td, race: s && s.type === 'race' });
  }

  var total = days.reduce(function (n, d) { return n + (d.done ? d.tss : 0); }, 0);
  var planned = days.reduce(function (n, d) { return n + d.tss; }, 0);

  var bars = days.map(function (d) {
    var col = d.race ? 'var(--pur)' : d.done ? 'var(--grn)' : d.today ? 'var(--acc)' : 'var(--s3)';
    var h = Math.round(d.tss / max * 100);
    return '<div class="wb-col" onclick="selectDay(\'' + d.ds + '\')" title="' + d.tss + ' TSS">' +
             '<div class="wb-bar" style="height:' + h + '%;background:' + col + ';"></div>' +
           '</div>';
  }).join('');

  host.className = 'wb-wrap';
  host.innerHTML =
    '<div class="wb-head"><span class="gc-lbl">Settimana</span>' +
      '<span class="wb-total">' + Math.round(total) + ' / ' + Math.round(planned) + ' TSS</span></div>' +
    '<div class="wb-bars">' + bars + '</div>' +
    '<div class="wb-days">' + days.map(function (d) {
      return '<span class="wb-dow' + (d.today ? ' wb-today' : '') + '">' + d.dow + '</span>';
    }).join('') + '</div>';
}

/* ---------- 4. Tab bar <-> showPage() ---------- */
function goTab(id, btn) {
  var sideEl = document.querySelector('.nav-item[onclick*="\'' + id + '\'"]');
  showPage(id, sideEl || undefined);
  window.scrollTo(0, 0);
}
function syncTabbar(id) {
  var btns = document.querySelectorAll('#tabbar button');
  for (var i = 0; i < btns.length; i++) {
    btns[i].classList.toggle('active', btns[i].dataset.tab === id);
  }
}
/* Il saluto al posto del titolo di pagina, solo su "Oggi". */
(function () {
  var orig = window.showPage;
  window.showPage = function (id, el) {
    orig(id, el);
    syncTabbar(id);
    if (id === 'home') {
      document.getElementById('topbar-title').textContent = 'Bentornato, ' + USER_NAME;
    }
  };
  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('topbar-title').textContent = 'Bentornato, ' + USER_NAME;
  });
})();
