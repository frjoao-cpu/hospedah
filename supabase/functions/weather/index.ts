// ============================================================
// HOSPEDAH — Edge Function: Proxy seguro para OpenWeatherMap
//
// Variáveis de ambiente necessárias (Supabase Dashboard → Settings → Edge Functions):
//   OPENWEATHER_API_KEY  → chave da API OpenWeatherMap
//
// Parâmetros de query:
//   action=weather  + lat + lon + units + lang  → clima atual
//   action=forecast + lat + lon + units + lang  → previsão 5 dias
//   action=geo      + q   + units + lang        → busca por cidade
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const API_KEY  = Deno.env.get('OPENWEATHER_API_KEY') ?? '';
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin':  'https://hospedah.tur.br',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
};

serve(async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (!API_KEY) {
        return new Response(
            JSON.stringify({ error: 'Chave da API não configurada' }),
            { status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
    }

    const url    = new URL(req.url);
    const action = url.searchParams.get('action');
    const lat    = url.searchParams.get('lat');
    const lon    = url.searchParams.get('lon');
    const q      = url.searchParams.get('q');
    const units  = url.searchParams.get('units') ?? 'metric';
    const lang   = url.searchParams.get('lang')  ?? 'pt_br';

    let targetUrl = '';

    if (action === 'weather' && lat && lon) {
        targetUrl = `${BASE_URL}/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${units}&lang=${lang}`;
    } else if (action === 'forecast' && lat && lon) {
        targetUrl = `${BASE_URL}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=${units}&lang=${lang}`;
    } else if (action === 'geo' && q) {
        targetUrl = `${BASE_URL}/weather?q=${encodeURIComponent(q)}&appid=${API_KEY}&units=${units}&lang=${lang}`;
    } else {
        return new Response(
            JSON.stringify({ error: 'Parâmetros inválidos. Use action=weather|forecast|geo.' }),
            { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
        );
    }

    const upstream = await fetch(targetUrl);
    const data     = await upstream.json();

    return new Response(JSON.stringify(data), {
        status: upstream.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
});
