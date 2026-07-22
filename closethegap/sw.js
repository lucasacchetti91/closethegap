// sw.js — Service Worker per WattForm PWA
const CACHE_NAME = 'closethegap-v1';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// Installazione: metti in cache i file principali
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Attivazione: rimuovi cache vecchie
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first per assets, network-first per API
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Le chiamate API vanno sempre alla rete
  if (url.pathname.startsWith('/api/') || url.hostname.includes('intervals.icu') || url.hostname.includes('strava.com')) {
    e.respondWith(fetch(e.request).catch(function() {
      return new Response(JSON.stringify({ error: 'Offline' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // Assets: cache-first con fallback alla rete
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(response) {
        // Metti in cache la nuova risorsa
        if (response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(e.request, clone);
          });
        }
        return response;
      });
    })
  );
});

// Notifica aggiornamento disponibile
self.addEventListener('message', function(e) {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
