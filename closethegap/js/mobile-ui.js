/* ============================================================
   MOBILE-UI.JS
   Aggiunte per la vista mobile. Non modifica gli altri moduli:
   ridefinisce renderWeekProgress() dopo home.js e riempie la card
   obiettivo + la tab bar. Va caricato DOPO js/home.js e DOPO js/app.js.
   ============================================================ */

/* Obiettivo di stagione. Se in futuro lo prendi da races.js (gara A),
   sostituisci questi due valori con la lettura da quella struttura. */
var GOAL = { watts: 360, date: '2026-09-19' };

/* ---------- 1. Card obiettivo: FTP -> target, con il gap ---------- */
function renderGoalCard() {
  var gap = document.getElementById('gc-gap');
  if (!gap) return;
  var now = document.getElementById('k-ftp-now');
  if (now) now.textContent = FTP;
  document.getElementById('gc-goal').textContent = GOAL.watts + 'W';

  var delta = GOAL.watts - FTP;
  gap.textContent = (delta > 0 ? '−' : '+') + Math.abs(delta) + 'W';
  gap.style.color = delta > 0 ? 'var(--pur)' : 'var(--grn)';

  var days = Math.round((new Date(GOAL.date) - new Date()) / 864e5);
  var d = new Date(GOAL.date).toLocaleDateString('it', { day: 'numeric', month: 'short' });
  document.getElementById('gc-sub').textContent =
    (days > 0 ? days + ' GG · ' : 'OGGI · ') + d.toUpperCase();

  var lthr = document.getElementById('gc-lthr');
  if (lthr) lthr.textContent = 'LTHR ' + LTHR + ' BPM · ' + (Math.round(FTP / WEIGHT_KG * 10) / 10) + ' W/KG';
}

/* ---------- 2. Progresso settimanale compatto ---------- */
/* Sostituisce la versione di home.js: "mancano N" sale accanto
   all'etichetta invece di stare sotto la barra, uscite e km vanno
   in testa. Tre righe risparmiate su una schermata da 6 pollici. */
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

  renderGoalCard();
}

/* ---------- 3. Tab bar <-> showPage() ---------- */
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
/* Anche navigando dal drawer la tab bar resta allineata. */
(function () {
  var orig = window.showPage;
  window.showPage = function (id, el) { orig(id, el); syncTabbar(id); };
})();

document.addEventListener('DOMContentLoaded', renderGoalCard);
