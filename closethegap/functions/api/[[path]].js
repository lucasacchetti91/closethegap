// ══ WattForm — Cloudflare Worker ══════════════════════════════
// Proxy sicuro per Intervals.icu API
// Incolla questo codice nel tuo Cloudflare Worker

const ICU_ATHLETE_ID = 'i52141';
const ICU_API_KEY = '5yh0f9alz0tjxr18wq4qbrb5p'; // cambia se rigeneri la key
const ICU_BASE = `https://intervals.icu/api/v1/athlete/${ICU_ATHLETE_ID}`;

// Domini autorizzati a chiamare questo worker
// Aggiungi qui il tuo dominio Netlify quando lo hai
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:5500',
  'https://wattform.netlify.app', // sostituisci col tuo dominio reale
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    // Routing
    const path = url.pathname.replace('/api/', '');
    const query = url.search;

    // Endpoint whitelist (sicurezza)
    const allowed_paths = [
      'activities',
      'wellness',
      'athlete',
      'events',
    ];

    const isAllowed = allowed_paths.some(p => path.startsWith(p));
    if (!isAllowed) {
      return new Response(JSON.stringify({ error: 'Path non autorizzato' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
      });
    }

    // Chiama Intervals.icu
    const icuUrl = `${ICU_BASE}/${path}${query}`;
    const icuResp = await fetch(icuUrl, {
      method: request.method,
      headers: {
        'Authorization': 'Basic ' + btoa(`API_KEY:${ICU_API_KEY}`),
        'Content-Type': 'application/json',
      },
      body: request.method !== 'GET' ? request.body : undefined,
    });

    const data = await icuResp.text();

    return new Response(data, {
      status: icuResp.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin),
      }
    });
  }
};
