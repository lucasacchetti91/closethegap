/* ============================================================
   STORAGE.JS
   Persistenza locale (localStorage) + auto-sync all'avvio.
   Obiettivo: non dover più premere i bottoni di sync ogni volta.

   All'apertura l'app carica ISTANTANEAMENTE l'ultimo stato salvato
   (zero attesa), poi in background lancia il sync con Intervals.icu e
   aggiorna. Se sei offline o il sync fallisce, continui a lavorare sui
   dati in cache invece di trovare l'app vuota.

   NOTA: la cache è per-browser (telefono e PC hanno la loro), ma
   entrambi si auto-sincronizzano dalla stessa fonte (Intervals.icu),
   quindi in pratica convergono. Se in futuro servisse uno stato
   condiviso tra dispositivi - per esempio per conservare i piani
   generati, che NON vivono su Intervals.icu - il passo successivo è
   Cloudflare KV agganciato alla Pages Function già esistente.
   ============================================================ */

var STORAGE_KEY = 'ctg_state_v1';
var AUTO_SYNC_MIN_INTERVAL_MIN = 30; // non risincronizza se l'ultimo sync è più recente di così

function saveState() {
  try {
    var payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      activities: activities,
      ftp: FTP, lthr: LTHR, hrMax: HR_MAX, hrRest: HR_REST,
      icuNativeCP: typeof ICU_NATIVE_CP !== 'undefined' ? ICU_NATIVE_CP : null,
      bestEfforts: bestEfforts
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (e) {
    // Quota superata o localStorage disabilitato (es. navigazione privata):
    // non è fatale, l'app funziona lo stesso, solo senza cache.
    console.warn('Salvataggio stato fallito:', e.message);
    return false;
  }
}

function loadState() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!s || s.version !== 1 || !Array.isArray(s.activities)) return null;
    activities = s.activities;
    if (s.ftp) FTP = s.ftp;
    if (s.lthr) LTHR = s.lthr;
    if (s.hrMax) HR_MAX = s.hrMax;
    if (s.hrRest) HR_REST = s.hrRest;
    if (s.icuNativeCP) ICU_NATIVE_CP = s.icuNativeCP;
    if (Array.isArray(s.bestEfforts) && s.bestEfforts.length) bestEfforts = s.bestEfforts;
    return s.savedAt;
  } catch (e) {
    console.warn('Caricamento stato fallito:', e.message);
    return null;
  }
}

function clearState() {
  try { localStorage.removeItem(STORAGE_KEY); return true; }
  catch (e) { return false; }
}

function minutesSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

/* Etichetta discreta in topbar: quando risalgono i dati mostrati. */
function renderSyncStatus(savedAt, syncing) {
  var el = document.getElementById('sync-status');
  if (!el) return;
  if (syncing) { el.textContent = '⟳ aggiornamento…'; el.style.color = 'var(--tx3)'; return; }
  if (!savedAt) { el.textContent = ''; return; }
  var mins = Math.round(minutesSince(savedAt));
  var txt = mins < 2 ? 'aggiornato ora' :
            mins < 60 ? 'aggiornato ' + mins + ' min fa' :
            mins < 1440 ? 'aggiornato ' + Math.round(mins/60) + 'h fa' :
            'aggiornato ' + Math.round(mins/1440) + 'gg fa';
  el.textContent = '● ' + txt;
  el.style.color = mins > 1440 ? 'var(--yel)' : 'var(--tx3)';
}

/* Avvio: carica la cache, disegna subito, poi sincronizza in background. */
async function bootstrapData() {
  var savedAt = loadState();
  renderSyncStatus(savedAt, false);

  // Primo disegno immediato con quello che abbiamo (cache o seed RAW).
  applyDataDrivenZones();
  makePlan();
  renderHome();

  // Auto-sync in background: non blocca l'interfaccia. Salta se abbiamo
  // già sincronizzato da poco, per non sprecare chiamate a ogni reload.
  if (minutesSince(savedAt) < AUTO_SYNC_MIN_INTERVAL_MIN) return;

  renderSyncStatus(savedAt, true);
  try {
    await syncIntervals({silent:true});
    await syncICUAdvanced({silent:true});
    saveState();
    renderSyncStatus(new Date().toISOString(), false);
  } catch (e) {
    console.warn('Auto-sync fallito (si continua con i dati in cache):', e.message);
    renderSyncStatus(savedAt, false);
  }
}
