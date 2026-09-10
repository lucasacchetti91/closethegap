/* ============================================================
   sw.js — Service Worker di Close the Gap

   PROBLEMA CHE RISOLVE
   Un service worker "cache-first" (lo schema piu' diffuso nelle PWA)
   serve i file dalla cache e non interpella nemmeno il server: dopo un
   deploy continui a vedere la versione vecchia, anche se su Cloudflare
   il file nuovo c'e'. L'URL con l'hash sembra invece aggiornato perche'
   e' un sottodominio diverso, quindi un'origine diversa, dove il
   service worker non e' registrato.

   STRATEGIA QUI: network-first per i file dell'app.
   - Si prova SEMPRE la rete. Se risponde, si usa quella risposta e si
     aggiorna la cache.
   - Se la rete non risponde (offline, treno, galleria) si serve la
     copia in cache.
   Risultato: dopo un deploy vedi subito la versione nuova, e l'app
   continua a funzionare senza connessione.

   Le chiamate alle API non vengono mai messe in cache: dati di
   allenamento vecchi sono peggio di nessun dato.
   ============================================================ */

/* Cambiando questo numero si invalida tutta la cache precedente.
   Va incrementato quando si vuole forzare la pulizia. */
const CACHE_VERSION = 'ctg-v2';

const PRECACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/redesign.css',
  '/manifest.json'
];

self.addEventListener('install', function (event) {
  /* skipWaiting: il nuovo service worker prende il controllo subito,
     senza aspettare che tutte le schede vengano chiuse. Senza questo,
     un aggiornamento puo' restare in attesa per giorni. */
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      // addAll fallisce in blocco se un solo file manca: meglio tollerare
      return Promise.all(PRECACHE.map(function (url) {
        return cache.add(url).catch(function () { /* file assente: si prosegue */ });
      }));
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k); // via le versioni vecchie
      }));
    }).then(function () {
      return self.clients.claim(); // prende il controllo delle schede gia' aperte
    })
  );
});

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Mai in cache: chiamate al proxy Intervals.icu e a qualunque API.
     Un TSS di tre giorni fa servito dalla cache sarebbe peggio di un
     errore visibile. */
  if (url.pathname.startsWith('/api/') ||
      url.hostname.indexOf('intervals.icu') >= 0 ||
      url.hostname.indexOf('workers.dev') >= 0) {
    return; // gestita dal browser, senza intermediazione
  }

  // Risorse esterne (font, Chart.js dal CDN): lasciate al browser
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      })
      .catch(function () {
        // Offline: si ripiega sulla copia salvata
        return caches.match(req).then(function (cached) {
          if (cached) return cached;
          // navigazione senza copia: si serve la pagina principale
          if (req.mode === 'navigate') return caches.match('/index.html');
          return new Response('Non disponibile offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
      })
  );
});

/* Permette alla pagina di forzare l'attivazione di una nuova versione. */
self.addEventListener('message', function (event) {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
