// ============================================================
// HOSPEDAH — Edge Function: Feed do Instagram (Meta Graph API)
//
// Variáveis de ambiente necessárias (Supabase Dashboard → Settings → Edge Functions):
//   INSTAGRAM_ACCESS_TOKEN  → Long-lived User Access Token do Instagram Graph API
//   INSTAGRAM_USER_ID       → ID do usuário Instagram (Business/Creator)
//
// Como obter o token:
//   1. Crie um App no Meta for Developers (developers.facebook.com)
//   2. Adicione o produto "Instagram Graph API"
//   3. Conecte sua conta Instagram Business/Creator
//   4. Gere um User Token com escopos: instagram_basic, instagram_content_publish
//   5. Converta para Long-Lived Token (válido 60 dias) via:
//      GET https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token
//          &client_id={app_id}&client_secret={app_secret}&fb_exchange_token={token}
//   6. Configure INSTAGRAM_ACCESS_TOKEN no Supabase Dashboard
//
// Cache automático no banco Supabase (tabela instagram_cache):
//   - Posts são buscados da API somente quando o cache expira (padrão: 60 min)
//   - Em caso de erro na API, retorna o cache desatualizado (graceful degradation)
//
// Parâmetros de query (GET):
//   limit  → número de posts a retornar (padrão: 12, max: 24)
//   force  → "1" para ignorar o cache e buscar direto da API
// ============================================================

import { serve }        from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CACHE_TTL_MINUTES = 60;
const DEFAULT_LIMIT     = 12;
const MAX_LIMIT         = 24;

const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin':  'https://hospedah.tur.br',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
};

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
}

serve(async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const ACCESS_TOKEN = Deno.env.get('INSTAGRAM_ACCESS_TOKEN') ?? '';
    const USER_ID      = Deno.env.get('INSTAGRAM_USER_ID')      ?? 'me';

    if (!ACCESS_TOKEN) {
        return json({ error: 'INSTAGRAM_ACCESS_TOKEN não configurado.' }, 503);
    }

    const url   = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, MAX_LIMIT);
    const force = url.searchParams.get('force') === '1';

    // Inicializa cliente Supabase (service role para acessar a tabela de cache)
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // ── Lê cache do banco ────────────────────────────────────────
    if (!force) {
        const cutoff = new Date(Date.now() - CACHE_TTL_MINUTES * 60 * 1000).toISOString();
        const { data: cached } = await supabase
            .from('instagram_cache')
            .select('id, media_type, media_url, thumbnail_url, permalink, caption, timestamp')
            .gte('cached_at', cutoff)
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (cached && cached.length > 0) {
            return json({ source: 'cache', posts: cached });
        }
    }

    // ── Busca da API do Instagram ────────────────────────────────
    const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
    const apiUrl = `https://graph.instagram.com/${USER_ID}/media?fields=${fields}&limit=${limit}&access_token=${ACCESS_TOKEN}`;

    let apiData: { data?: unknown[] };
    try {
        const res = await fetch(apiUrl);
        apiData   = await res.json() as { data?: unknown[] };
    } catch (err) {
        // Falha de rede — retorna cache desatualizado se existir
        const { data: stale } = await supabase
            .from('instagram_cache')
            .select('id, media_type, media_url, thumbnail_url, permalink, caption, timestamp')
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (stale && stale.length > 0) {
            return json({ source: 'stale_cache', posts: stale });
        }
        return json({ error: 'Falha ao buscar o feed do Instagram.' }, 502);
    }

    if (!apiData.data || !Array.isArray(apiData.data)) {
        return json({ error: 'Resposta inválida da API do Instagram.', raw: apiData }, 502);
    }

    type MediaItem = {
        id: string;
        media_type: string;
        media_url?: string;
        thumbnail_url?: string;
        permalink: string;
        caption?: string;
        timestamp: string;
    };

    // Filtra apenas IMAGE e VIDEO (exclui CAROUSEL_ALBUM para simplificar)
    const posts: MediaItem[] = (apiData.data as MediaItem[]).filter(
        (p) => p.media_type === 'IMAGE' || p.media_type === 'VIDEO',
    );

    // ── Atualiza cache no banco ──────────────────────────────────
    if (posts.length > 0) {
        const now = new Date().toISOString();
        const rows = posts.map((p) => ({
            id:            p.id,
            media_type:    p.media_type,
            media_url:     p.media_url     ?? null,
            thumbnail_url: p.thumbnail_url ?? null,
            permalink:     p.permalink,
            caption:       p.caption       ?? null,
            timestamp:     p.timestamp,
            cached_at:     now,
        }));

        await supabase
            .from('instagram_cache')
            .upsert(rows, { onConflict: 'id' });
    }

    return json({ source: 'api', posts });
});
