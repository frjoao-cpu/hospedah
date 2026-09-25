// ============================================================
// HOSPEDAH — Edge Function: radar-captura
//
// "O robô encontra": camada de captura da Central de
// Monitoramento do Radar IA. Lê os ALVOS (o que procurar) e
// as FONTES (onde procurar) e grava o conteúdo cru em
// public.radar_capturas, pronto para a Edge Function
// radar-ia analisar ("a IA entende").
//
// IMPORTANTE — NADA DE SCRAPING.
// Instagram e Facebook são consultados exclusivamente pelas
// APIs oficiais da Meta (Graph API), com token de aplicativo
// autorizado. Nunca use senha de rede social, automação de
// navegador ou qualquer método que contorne permissões.
// Enquanto o token/permissão não estiver liberado, o
// adaptador apenas reporta "fonte não configurada" e o
// restante do pipeline continua funcionando.
//
// Ações (POST JSON { acao: ... }):
//   varrer            → varre alvos ativos (usada pelo pg_cron)
//   capturar_manual   → grava um texto colado pelo operador
//   importar_lote     → grava vários textos de uma vez
//   descartar         → descarta uma captura com motivo
//   salvar_fonte      → cria/atualiza uma fonte
//   remover_fonte     → desativa uma fonte
//
// Secrets:
//   SUPABASE_URL, SUPABASE_SECRET_KEYS (ou SUPABASE_SECRET_KEY)
//   INSTAGRAM_ACCESS_TOKEN      → Graph API (Instagram)
//   INSTAGRAM_USER_ID           → IG Business/Creator user id
//   FACEBOOK_PAGE_ACCESS_TOKEN  → Graph API (Páginas)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    getSupabaseSecretKey,
    isSupabaseSecretKey,
} from '../_shared/secret-key.ts';
import {
    Alvo,
    asInt,
    asText,
    Empreendimento,
    preFiltrar,
} from '../_shared/radar.ts';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
};

const headers = {
    ...cors,
    'Content-Type': 'application/json',
};

const GRAPH = 'https://graph.facebook.com/v21.0';

// Máximo de itens buscados por fonte em cada varredura.
const LIMITE_POR_FONTE = 25;

// Timeout das chamadas à Graph API.
const GRAPH_TIMEOUT_MS = 20000;

interface Fonte {
    id: string;
    nome: string;
    tipo: string;
    identificador_externo?: string | null;
    config?: Record<string, unknown> | null;
    ultimo_cursor?: string | null;
    ativo?: boolean;
}

interface CapturaBruta {
    external_id: string | null;
    autor: string | null;
    permalink: string | null;
    texto: string;
    midia_url: string | null;
    midia_tipo: string | null;
    publicado_em: string | null;
    payload: Record<string, unknown>;
}

interface ResultadoFonte {
    capturas: CapturaBruta[];
    erro: string | null;
    credencial: 'OK' | 'ERRO' | 'NAO_CONFIGURADA';
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers });
}

async function graphFetch(url: string) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);

    try {
        const r = await fetch(url, { signal: ctrl.signal });
        const texto = await r.text();

        let corpo: Record<string, unknown> | null = null;

        try {
            corpo = texto ? JSON.parse(texto) : null;
        } catch {
            corpo = null;
        }

        if (!r.ok || !corpo) {
            const msg = (corpo?.error as { message?: string })?.message ||
                'HTTP ' + r.status;
            throw new Error(String(msg));
        }

        return corpo;
    } finally {
        clearTimeout(timer);
    }
}

// ── Adaptador: Instagram (Graph API oficial) ────────────────
async function buscarInstagram(fonte: Fonte): Promise<ResultadoFonte> {
    const token = Deno.env.get('INSTAGRAM_ACCESS_TOKEN');
    const igUser = Deno.env.get('INSTAGRAM_USER_ID') ||
        asText((fonte.config || {}).ig_user_id);

    if (!token || !igUser) {
        return {
            capturas: [],
            erro:
                'Fonte não configurada: defina os secrets ' +
                'INSTAGRAM_ACCESS_TOKEN e INSTAGRAM_USER_ID ' +
                '(Graph API oficial da Meta).',
            credencial: 'NAO_CONFIGURADA',
        };
    }

    const modo = asText((fonte.config || {}).modo) || 'hashtag';
    const alvo = asText(fonte.identificador_externo);

    if (!alvo) {
        return {
            capturas: [],
            erro:
                'Fonte sem identificador externo ' +
                '(hashtag ou id da conta).',
            credencial: 'NAO_CONFIGURADA',
        };
    }

    try {
        let midiaUrl: string;

        if (modo === 'hashtag') {
            const busca = await graphFetch(
                GRAPH + '/ig_hashtag_search?user_id=' +
                    encodeURIComponent(igUser) +
                    '&q=' + encodeURIComponent(alvo.replace(/^#/, '')) +
                    '&access_token=' + encodeURIComponent(token),
            );

            const hashtagId =
                (busca.data as { id?: string }[] | undefined)?.[0]?.id;

            if (!hashtagId) {
                return {
                    capturas: [],
                    erro: 'Hashtag ' + alvo +
                        ' não encontrada na Graph API.',
                    credencial: 'ERRO',
                };
            }

            midiaUrl = GRAPH + '/' + hashtagId +
                '/recent_media?user_id=' + encodeURIComponent(igUser) +
                '&fields=id,caption,permalink,media_url,media_type,timestamp' +
                '&limit=' + LIMITE_POR_FONTE +
                '&access_token=' + encodeURIComponent(token);
        } else {
            midiaUrl = GRAPH + '/' + encodeURIComponent(alvo) +
                '/media?fields=id,caption,permalink,media_url,' +
                'media_type,timestamp,username' +
                '&limit=' + LIMITE_POR_FONTE +
                '&access_token=' + encodeURIComponent(token);
        }

        const dados = await graphFetch(midiaUrl);

        const itens = (dados.data as Record<string, unknown>[]) || [];

        const capturas = itens
            .map((m) => ({
                external_id: asText(m.id),
                autor: asText(m.username) || asText(fonte.nome),
                permalink: asText(m.permalink),
                texto: asText(m.caption) || '',
                midia_url: asText(m.media_url),
                midia_tipo: asText(m.media_type),
                publicado_em: asText(m.timestamp),
                payload: m,
            }))
            .filter((c) => c.texto);

        return { capturas, erro: null, credencial: 'OK' };
    } catch (e) {
        return {
            capturas: [],
            erro: 'Instagram Graph API: ' + (e as Error).message,
            credencial: 'ERRO',
        };
    }
}

// ── Adaptador: Facebook (Graph API oficial) ─────────────────
async function buscarFacebook(fonte: Fonte): Promise<ResultadoFonte> {
    const token = Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN') ||
        Deno.env.get('INSTAGRAM_ACCESS_TOKEN');

    const pagina = asText(fonte.identificador_externo);

    if (!token || !pagina) {
        return {
            capturas: [],
            erro:
                'Fonte não configurada: defina o secret ' +
                'FACEBOOK_PAGE_ACCESS_TOKEN e o id da página ' +
                '(Graph API oficial da Meta).',
            credencial: 'NAO_CONFIGURADA',
        };
    }

    try {
        const dados = await graphFetch(
            GRAPH + '/' + encodeURIComponent(pagina) +
                '/posts?fields=id,message,permalink_url,created_time,' +
                'full_picture' +
                '&limit=' + LIMITE_POR_FONTE +
                '&access_token=' + encodeURIComponent(token),
        );

        const itens = (dados.data as Record<string, unknown>[]) || [];

        const capturas = itens
            .map((m) => ({
                external_id: asText(m.id),
                autor: asText(fonte.nome),
                permalink: asText(m.permalink_url),
                texto: asText(m.message) || '',
                midia_url: asText(m.full_picture),
                midia_tipo: 'IMAGE',
                publicado_em: asText(m.created_time),
                payload: m,
            }))
            .filter((c) => c.texto);

        return { capturas, erro: null, credencial: 'OK' };
    } catch (e) {
        return {
            capturas: [],
            erro: 'Facebook Graph API: ' + (e as Error).message,
            credencial: 'ERRO',
        };
    }
}

// Interface única de adaptador: buscar(fonte) → capturas.
async function buscar(fonte: Fonte): Promise<ResultadoFonte> {
    if (fonte.tipo === 'INSTAGRAM_GRAPH') return await buscarInstagram(fonte);
    if (fonte.tipo === 'FACEBOOK_GRAPH') return await buscarFacebook(fonte);

    // MANUAL e IMPORT são alimentadas pelo operador,
    // não por varredura automática.
    return { capturas: [], erro: null, credencial: 'OK' };
}

type Cliente = ReturnType<typeof createClient>;

async function fonteManual(
    supabase: Cliente,
    tipo: 'MANUAL' | 'IMPORT',
): Promise<string | null> {
    const { data } = await supabase
        .from('radar_fontes')
        .select('id')
        .eq('tipo', tipo)
        .eq('ativo', true)
        .limit(1)
        .maybeSingle();

    if (data?.id) return data.id as string;

    const { data: nova } = await supabase
        .from('radar_fontes')
        .insert({
            nome: tipo === 'MANUAL' ? 'Manual' : 'Importação em lote',
            tipo,
            credencial_status: 'OK',
        })
        .select('id')
        .single();

    return (nova?.id as string) ?? null;
}

// Grava capturas com dedupe por (fonte_id, external_id).
async function gravarCapturas(
    supabase: Cliente,
    fonteId: string | null,
    alvoId: string | null,
    capturas: CapturaBruta[],
): Promise<number> {
    if (!capturas.length) return 0;

    const registros = capturas.map((c) => ({
        fonte_id: fonteId,
        alvo_id: alvoId,
        external_id: c.external_id,
        autor: c.autor,
        permalink: c.permalink,
        texto: c.texto,
        midia_url: c.midia_url,
        midia_tipo: c.midia_tipo,
        publicado_em: c.publicado_em,
        estado: 'PENDENTE',
        payload: c.payload,
    }));

    const comId = registros.filter((r) => r.external_id);
    const semId = registros.filter((r) => !r.external_id);

    let gravadas = 0;

    if (comId.length) {
        const { data, error } = await supabase
            .from('radar_capturas')
            .upsert(comId, {
                onConflict: 'fonte_id,external_id',
                ignoreDuplicates: true,
            })
            .select('id');

        if (error) throw error;

        gravadas += (data || []).length;
    }

    if (semId.length) {
        const { data, error } = await supabase
            .from('radar_capturas')
            .insert(semId)
            .select('id');

        if (error) throw error;

        gravadas += (data || []).length;
    }

    return gravadas;
}

async function registrarExecucao(
    supabase: Cliente,
    registro: Record<string, unknown>,
) {
    const { error } = await supabase
        .from('radar_execucoes')
        .insert({
            origem: 'CAPTURA',
            finalizado_em: new Date().toISOString(),
            ...registro,
        });

    if (error) console.error('[radar-captura] execucao:', error);
}

// Um alvo está vencido quando nunca varreu ou quando já
// passou a cadência configurada.
function venceu(
    alvo: Alvo & {
        ultima_varredura?: string | null;
        cadencia_minutos?: number | null;
    },
): boolean {
    if (!alvo.ultima_varredura) return true;

    const cadencia = asInt(alvo.cadencia_minutos) ?? 360;
    const ultima = Date.parse(alvo.ultima_varredura);

    if (!Number.isFinite(ultima)) return true;

    return Date.now() - ultima >= cadencia * 60000;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: cors });
    }

    const traceId = crypto.randomUUID().slice(0, 8);

    try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
        const SERVICE = getSupabaseSecretKey();

        if (!SUPABASE_URL || !SERVICE) {
            return json({
                error:
                    'Edge Function sem credenciais do Supabase. ' +
                    'Defina SUPABASE_URL e SUPABASE_SECRET_KEY.',
            }, 500);
        }

        const supabase = createClient(SUPABASE_URL, SERVICE, {
            auth: { persistSession: false },
        });

        const auth = req.headers.get('Authorization') || '';
        const jwt = auth.replace(/^Bearer\s+/i, '').trim();

        if (!jwt) {
            return json({ error: 'Não autenticado' }, 401);
        }

        // O pg_cron chama com a chave de serviço; o painel
        // chama com o token do usuário autenticado.
        const robo = isSupabaseSecretKey(jwt);

        if (!robo) {
            const { data: userData, error: authError } = await supabase.auth
                .getUser(jwt)
                .catch(() => ({
                    data: null,
                    error: { message: 'network' },
                })) as {
                    data: { user?: unknown } | null;
                    error: { message?: string } | null;
                };

            if (authError || !userData?.user) {
                return json({ error: 'Sessão inválida ou expirada' }, 401);
            }
        }

        const body = await req.json().catch(() => ({})) ||
            {} as Record<string, unknown>;

        const acao = asText(body.acao) || 'varrer';

        // ── capturar_manual / importar_lote ─────────────────
        if (acao === 'capturar_manual' || acao === 'importar_lote') {
            const itens: {
                texto: string;
                permalink: string | null;
                autor: string | null;
            }[] = acao === 'capturar_manual'
                ? [{
                    texto: asText(body.texto_original) ||
                        asText(body.texto) || '',
                    permalink: asText(body.url_original),
                    autor: asText(body.autor),
                }]
                : (Array.isArray(body.itens) ? body.itens : []).map(
                    (i: Record<string, unknown>) => ({
                        texto: asText(i.texto_original) ||
                            asText(i.texto) || '',
                        permalink: asText(i.url_original) ||
                            asText(i.permalink),
                        autor: asText(i.autor),
                    }),
                );

            const validos = itens.filter((i) => i.texto.trim());

            if (!validos.length) {
                return json(
                    { error: 'Nenhum texto informado para captura.' },
                    400,
                );
            }

            const tipo = acao === 'capturar_manual' ? 'MANUAL' : 'IMPORT';

            const fonteId = asText(body.fonte_id) ||
                await fonteManual(supabase, tipo);

            const alvoId = asText(body.alvo_id);

            const { data, error } = await supabase
                .from('radar_capturas')
                .insert(
                    validos.map((i) => ({
                        fonte_id: fonteId,
                        alvo_id: alvoId,
                        texto: i.texto,
                        permalink: i.permalink,
                        autor: i.autor,
                        estado: 'PENDENTE',
                        payload: { origem: tipo },
                    })),
                )
                .select();

            if (error) throw error;

            await registrarExecucao(supabase, {
                alvo_id: alvoId,
                fonte_id: fonteId,
                capturados: (data || []).length,
                status: 'OK',
                trace_id: traceId,
            });

            return json({
                ok: true,
                capturados: (data || []).length,
                capturas: data || [],
            });
        }

        // ── descartar ───────────────────────────────────────
        if (acao === 'descartar') {
            const id = asText(body.captura_id);

            if (!id) {
                return json({ error: 'captura_id é obrigatório' }, 400);
            }

            const { error } = await supabase
                .from('radar_capturas')
                .update({
                    estado: 'DESCARTADO',
                    motivo: asText(body.motivo) ||
                        'Descartada manualmente no painel.',
                })
                .eq('id', id);

            if (error) throw error;

            return json({ ok: true });
        }

        // ── salvar_fonte / remover_fonte ────────────────────
        if (acao === 'salvar_fonte') {
            const nome = asText(body.nome);

            if (!nome) {
                return json({ error: 'nome da fonte é obrigatório' }, 400);
            }

            const tipo = asText(body.tipo) || 'MANUAL';

            if (
                ![
                    'INSTAGRAM_GRAPH',
                    'FACEBOOK_GRAPH',
                    'MANUAL',
                    'IMPORT',
                ].includes(tipo)
            ) {
                return json({ error: 'Tipo de fonte inválido' }, 400);
            }

            const registro: Record<string, unknown> = {
                nome,
                tipo,
                identificador_externo: asText(body.identificador_externo),
                config: body.config && typeof body.config === 'object'
                    ? body.config
                    : {},
                ativo: body.ativo !== false,
            };

            const id = asText(body.id);

            const { data, error } = id
                ? await supabase
                    .from('radar_fontes')
                    .update(registro)
                    .eq('id', id)
                    .select()
                    .single()
                : await supabase
                    .from('radar_fontes')
                    .upsert(registro, { onConflict: 'nome' })
                    .select()
                    .single();

            if (error) throw error;

            return json({ ok: true, fonte: data });
        }

        if (acao === 'remover_fonte') {
            const id = asText(body.id);

            if (!id) {
                return json({ error: 'id é obrigatório' }, 400);
            }

            const { error } = await supabase
                .from('radar_fontes')
                .update({ ativo: false })
                .eq('id', id);

            if (error) throw error;

            return json({ ok: true });
        }

        if (acao !== 'varrer') {
            return json({ error: 'Ação desconhecida: ' + acao }, 400);
        }

        // ── varrer ──────────────────────────────────────────
        const forcar = body.forcar === true;
        const alvoFiltro = asText(body.alvo_id);

        const { data: alvos, error: eAlvos } = await supabase
            .from('radar_alvos')
            .select('*')
            .eq('ativo', true);

        if (eAlvos) throw eAlvos;

        const { data: empreendimentos } = await supabase
            .from('radar_empreendimentos')
            .select('nome,cidade,estado,aliases')
            .eq('ativo', true);

        const { data: fontes, error: eFontes } = await supabase
            .from('radar_fontes')
            .select('*')
            .eq('ativo', true);

        if (eFontes) throw eFontes;

        const { data: vinculos } = await supabase
            .from('radar_alvo_fontes')
            .select('alvo_id,fonte_id');

        const automaticas = ((fontes || []) as Fonte[]).filter(
            (f) =>
                f.tipo === 'INSTAGRAM_GRAPH' || f.tipo === 'FACEBOOK_GRAPH',
        );

        const resumo: Record<string, unknown>[] = [];
        let total = 0;

        for (const alvo of (alvos || [])) {
            if (alvoFiltro && alvo.id !== alvoFiltro) continue;
            if (!forcar && !venceu(alvo)) continue;

            const ids = ((vinculos || []) as {
                alvo_id: string;
                fonte_id: string;
            }[])
                .filter((v) => v.alvo_id === alvo.id)
                .map((v) => v.fonte_id);

            // Sem vínculo explícito, o alvo usa todas as
            // fontes automáticas ativas.
            const doAlvo = ids.length
                ? automaticas.filter((f) => ids.includes(f.id))
                : automaticas;

            for (const fonte of doAlvo) {
                const inicio = new Date().toISOString();

                const r = await buscar(fonte);

                await supabase
                    .from('radar_fontes')
                    .update({
                        credencial_status: r.credencial,
                        credencial_mensagem: r.erro,
                        ultima_sincronizacao: new Date().toISOString(),
                    })
                    .eq('id', fonte.id);

                if (r.erro) {
                    await registrarExecucao(supabase, {
                        alvo_id: alvo.id,
                        fonte_id: fonte.id,
                        iniciado_em: inicio,
                        status: 'ERRO',
                        erro: r.erro,
                        trace_id: traceId,
                    });

                    resumo.push({
                        alvo: alvo.nome,
                        fonte: fonte.nome,
                        erro: r.erro,
                    });

                    continue;
                }

                // Pré-filtro barato: só vale gastar token de IA
                // com textos que citam termos do alvo.
                const filtradas = r.capturas.filter((c) =>
                    preFiltrar(
                        c.texto,
                        alvo as Alvo,
                        (empreendimentos || []) as Empreendimento[],
                    ).aprovado
                );

                let gravadas = 0;
                let erro: string | null = null;

                try {
                    gravadas = await gravarCapturas(
                        supabase,
                        fonte.id,
                        alvo.id,
                        filtradas,
                    );
                } catch (e) {
                    erro = (e as Error).message;
                }

                total += gravadas;

                await registrarExecucao(supabase, {
                    alvo_id: alvo.id,
                    fonte_id: fonte.id,
                    iniciado_em: inicio,
                    capturados: gravadas,
                    status: erro ? 'ERRO' : 'OK',
                    erro,
                    trace_id: traceId,
                });

                resumo.push({
                    alvo: alvo.nome,
                    fonte: fonte.nome,
                    encontrados: r.capturas.length,
                    relevantes: filtradas.length,
                    gravados: gravadas,
                    erro,
                });
            }

            await supabase
                .from('radar_alvos')
                .update({ ultima_varredura: new Date().toISOString() })
                .eq('id', alvo.id);
        }

        if (!automaticas.length) {
            resumo.push({
                aviso:
                    'Nenhuma fonte automática (Instagram/Facebook) ' +
                    'cadastrada e ativa. Cadastre uma fonte com as ' +
                    'credenciais oficiais da Meta ou use a captura manual.',
            });
        }

        return json({
            ok: true,
            alvos: (alvos || []).length,
            capturados: total,
            detalhes: resumo,
            trace_id: traceId,
        });
    } catch (e) {
        console.error('[radar-captura]', traceId, e);

        const err = e as { code?: string; message?: string };

        if (
            err?.code === '42P01' || err?.code === 'PGRST205' ||
            /does not exist/i.test(String(err?.message || ''))
        ) {
            return json({
                error:
                    'Tabelas da Central de Monitoramento não encontradas. ' +
                    'Aplique a migration supabase/migrations/' +
                    '008_radar_central_monitoramento.sql.',
                trace_id: traceId,
            }, 500);
        }

        return json({
            error:
                'Erro interno na captura (ref. ' + traceId + '). ' +
                'Consulte os logs da Edge Function radar-captura.',
            trace_id: traceId,
        }, 500);
    }
});
