// functions/api/[[path]].js
// Salva questo file esattamente in: functions/api/[[path]].js
// (con le doppie parentesi quadre nel nome del file)
//
// v2: aggiunge il supporto per gli endpoint "per singola attività" di
// Intervals.icu (streams, power-vs-hr, best-efforts), che vivono sotto
// /api/v1/activity/{id}/... e NON sotto /api/v1/athlete/{athleteId}/...
// come tutto il resto. Aggiunta anche la possibilità di spostare l'API
// key in una variabile d'ambiente (Cloudflare Pages -> Settings ->
// Environment variables -> aggiungi "ICU_API_KEY" come secret) invece
// di tenerla in chiaro nel codice sorgente. Se non la imposti, il
// worker continua a funzionare con il valore hardcoded qui sotto come
// fallback, ma è consigliato migrare appena possibile.

const ICU_ATHLETE_ID = 'i52141';
/* ATTENZIONE — questa chiave è in chiaro nel codice.
   Se il repository è pubblico (o lo diventa), chiunque può leggerla e
   accedere ai tuoi dati Intervals.icu; resta inoltre nella cronologia
   git anche dopo averla cambiata qui.
   Modo corretto: Cloudflare → Settings → Variables → aggiungi
   ICU_API_KEY come secret, poi svuota la costante qui sotto ('').
   Il codice preferisce già la variabile d'ambiente quando esiste. */
const ICU_API_KEY_FALLBACK = '668wn2dx4nyok95qc35g1hda7';
const ICU_ATHLETE_BASE = 'https://intervals.icu/api/v1/athlete/' + ICU_ATHLETE_ID;
const ICU_ACTIVITY_BASE = 'https://intervals.icu/api/v1/activity';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Endpoint permessi sotto /athlete/{id}/... (invariati + due nuovi:
// power-curves e activity-power-curves, usati per il modello CP/W'/Pmax
// e per la power curve calcolata su un range di attività).
const ATHLETE_ALLOWED = ['activities', 'wellness', 'athlete', 'events', 'power-curves', 'activity-power-curves'];

// Sotto-risorse permesse per /activity/{id}/... (attività singola).
// '' = l'attività stessa (GET /activity/{id})
const ACTIVITY_SUBRESOURCE_ALLOWED = ['', 'streams', 'power-vs-hr', 'best-efforts', 'intervals'];

export async function onRequest(context) {
  const { request, params, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  // Solo GET: il proxy serve esclusivamente a leggere dati, mai a scriverli.
  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Solo richieste GET sono permesse' }),
      { status: 405, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

  const ICU_API_KEY = (env && env.ICU_API_KEY) ? env.ICU_API_KEY : ICU_API_KEY_FALLBACK;

  const pathParts = Array.isArray(params.path) ? params.path : (params.path ? [params.path] : []);
  const url = new URL(request.url);
  const queryString = url.search; // es: ?oldest=2026-01-01&newest=2026-07-22

  let icuUrl = null;
  let denyReason = null;

  if (pathParts[0] === 'activity' && pathParts.length >= 2) {
    // Rotta per attività singola: /activity/{id}[/{sotto-risorsa}]
    const activityId = pathParts[1];
    const rest = pathParts.slice(2).join('/'); // es: 'streams.json', 'power-vs-hr.json', 'best-efforts', ''
    const subName = rest.split('.')[0]; // rimuove .json/.csv per il controllo
    if (!ACTIVITY_SUBRESOURCE_ALLOWED.includes(subName)) {
      denyReason = 'Sotto-risorsa attività non permessa: ' + subName;
    } else {
      icuUrl = ICU_ACTIVITY_BASE + '/' + activityId + (rest ? '/' + rest : '') + queryString;
    }
  } else {
    // Rotta scoperta sull'atleta (comportamento originale): /athlete/{id}/...
    const path = pathParts.join('/');
    const topName = (pathParts[0] || '').split('.')[0];
    if (!ATHLETE_ALLOWED.includes(topName)) {
      denyReason = 'Endpoint non permesso: ' + path;
    } else {
      icuUrl = ICU_ATHLETE_BASE + '/' + path + queryString;
    }
  }

  if (!icuUrl) {
    return new Response(
      JSON.stringify({ error: denyReason || 'Richiesta non permessa' }),
      { status: 403, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  }

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
