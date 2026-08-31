/* ============================================================
   WORKER STANDALONE Intervals.icu — closethegap-proxy
   ============================================================
   DOVE VA QUESTO CODICE:
   Cloudflare dashboard → Workers & Pages → closethegap-proxy →
   Edit code → incolla tutto → Deploy.

   NON è il file functions/api/[[path]].js del repo GitHub: quello è la
   Pages Function, un proxy diverso. L'app chiama questo Worker
   (ICU_WORKER in js/config.js), quindi è QUESTO che deve conoscere i
   nuovi endpoint.

   COSA CAMBIA rispetto alla versione precedente:
   aggiunge il supporto agli endpoint "per singola attività"
   (/activity/{id}/streams, /power-vs-hr, /best-efforts), che su
   Intervals.icu vivono sotto un path diverso rispetto a quelli
   dell'atleta. Senza questa modifica il Worker risponde 403 e nel feed
   attività compare "Dettagli non disponibili: ICU streams HTTP 403".

   SICUREZZA: accetta solo richieste GET e solo gli endpoint in lista.
   La chiave API può stare in una variabile d'ambiente (Settings →
   Variables → ICU_API_KEY, spuntando "Encrypt") invece che in chiaro
   qui dentro; se non la imposti viene usato il valore di fallback.
   ============================================================ */

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

const ATHLETE_ALLOWED = ['activities', 'wellness', 'athlete', 'events', 'power-curves', 'activity-power-curves'];
const ACTIVITY_SUBRESOURCE_ALLOWED = ['', 'streams', 'power-vs-hr', 'best-efforts', 'intervals'];

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Solo richieste GET sono permesse' }, 405);
    }

    const ICU_API_KEY = (env && env.ICU_API_KEY) ? env.ICU_API_KEY : ICU_API_KEY_FALLBACK;
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const queryString = url.search;

    let icuUrl = null;
    let denyReason = null;

    if (parts[0] === 'activity' && parts.length >= 2) {
      // /activity/{id}[/{sotto-risorsa}]
      const activityId = parts[1];
      const rest = parts.slice(2).join('/');           // es: 'streams.json'
      const subName = rest.split('.')[0];               // rimuove .json per il controllo
      if (!ACTIVITY_SUBRESOURCE_ALLOWED.includes(subName)) {
        denyReason = 'Sotto-risorsa attività non permessa: ' + subName;
      } else {
        icuUrl = ICU_ACTIVITY_BASE + '/' + activityId + (rest ? '/' + rest : '') + queryString;
      }
    } else {
      // /{endpoint} sotto l'atleta
      const path = parts.join('/');
      const topName = (parts[0] || '').split('.')[0];
      if (!ATHLETE_ALLOWED.includes(topName)) {
        denyReason = 'Endpoint non permesso: ' + path;
      } else {
        icuUrl = ICU_ATHLETE_BASE + '/' + path + queryString;
      }
    }

    if (!icuUrl) return json({ error: denyReason || 'Richiesta non permessa' }, 403);

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
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    } catch (err) {
      return json({ error: 'Errore proxy: ' + err.message }, 500);
    }
  }
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
