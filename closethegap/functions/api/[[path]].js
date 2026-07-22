// functions/api/[[path]].js
// Salva questo file esattamente in: functions/api/[[path]].js
// (con le doppie parentesi quadre nel nome del file)

const ICU_ATHLETE_ID = 'i52141';
const ICU_API_KEY = '5yh0f9alz0tjxr18wq4qbrb5p';
const ICU_BASE = 'https://intervals.icu/api/v1/athlete/' + ICU_ATHLETE_ID;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function onRequest(context) {
  const { request, params } = context;

  // Risponde al preflight CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Legge il path dinamico dall'URL
  // params.path è un array come ['wellness'] o ['activities']
  const pathParts = params.path;
  const path = Array.isArray(pathParts) ? pathParts.join('/') : (pathParts || '');

  // Sicurezza: solo endpoint permessi
  const ALLOWED = ['activities', 'wellness', 'athlete', 'events'];
  const isAllowed = ALLOWED.some(function(p) { return path.startsWith(p); });

  if (!isAllowed) {
    return new Response(
      JSON.stringify({ error: 'Endpoint non permesso: ' + path }),
      { status: 403, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  // Costruisce l'URL verso Intervals.icu
  const url = new URL(request.url);
  const queryString = url.search; // es: ?oldest=2026-01-01&newest=2026-07-22
  const icuUrl = ICU_BASE + '/' + path + queryString;

  try {
    const icuResponse = await fetch(icuUrl, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + btoa('API_KEY:' + ICU_API_KEY),
        'Content-Type': 'application/json',
      },
    });

    const body = await icuResponse.text();

    return new Response(body, {
      status: icuResponse.status,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Errore proxy: ' + err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }
}
