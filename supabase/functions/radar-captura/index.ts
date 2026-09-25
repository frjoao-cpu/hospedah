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
//   testar_fonte      → consulta a fonte sem gravar nada
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

type CredencialStatus = 'OK' | 'ERRO' | 'EXPIRADA' | 'NAO_CONFIGURADA';

// Erro da Graph API preservando os códigos da Meta — é o que
// permite distinguir token expirado (190) de falta de permissão
// ou de id inválido.
class GraphError extends Error {
    code: number | null;
    subcode: number | null;
    tipo: string | null;

    constructor(
        mensagem: string,
        code: number | null,
        subcode: number | null,
        tipo: string | null,
    ) {
        super(mensagem);
        this.name = 'GraphError';
        this.code = code;
        this.subcode = subcode;
        this.tipo = tipo;
    }
}

// Traduz o erro da Graph em status de credencial + mensagem
// acionável para o operador ver no painel.
function classificarErroGraph(
    e: unknown,
    origem: string,
): { status: CredencialStatus; mensagem: string } {
    const erro = e as GraphError;
    const detalhe = (e as Error)?.message || 'falha desconhecida';

    if (erro instanceof GraphError) {
        // 190 = access token inválido/expirado/revogado.
        // 102 / 463 / 467 = sessão expirada ou invalidada.
        if (
            erro.code === 190 || erro.code === 102 ||
            erro.code === 463 || erro.code === 467 ||
            erro.subcode === 463 || erro.subcode === 467
        ) {
            return {
                status: 'EXPIRADA',
                mensagem: origem + ': token expirado ou revogado (' +
                    detalhe + '). Gere um novo token de Página de longa ' +
                    'duração no Graph API Explorer e regrave o secret ' +
                    'FACEBOOK_PAGE_ACCESS_TOKEN / INSTAGRAM_ACCESS_TOKEN.',
            };
        }

        // 10 / 200-299 = permissão ausente para o recurso.
        if (
            erro.code === 10 ||
            (erro.code !== null && erro.code >= 200 && erro.code <= 299)
        ) {
            return {
                status: 'ERRO',
                mensagem: origem + ': permissão insuficiente (' + detalhe +
                    '). Revise as permissões pages_read_engagement e ' +
                    'pages_show_list do aplicativo na Meta.',
            };
        }

        // 803 / 100 = objeto inexistente ou id no formato errado.
        if (erro.code === 803 || erro.code === 100) {
            return {
                status: 'ERRO',
                mensagem: origem + ': identificador não encontrado (' +
                    detalhe + '). Confira o id numérico da Página/conta ' +
                    '— URLs, @handles e ids de grupo não são aceitos.',
            };
        }
    }

    return { status: 'ERRO', mensagem: origem + ': ' + detalhe };
}

// Validação do identificador por tipo de fonte. O endpoint usado
// é /{page-id}/posts, que não atende grupos nem perfis pessoais.
function validarIdentificador(
    tipo: string,
    identificador: string,
    modo: string,
): string | null {
    const valor = (identificador || '').trim();

    if (tipo === 'MANUAL' || tipo === 'IMPORT') return null;

    // RSS/Atom: o identificador é a própria URL do feed
    // publicado pelo portal — nada de scraping de página.
    if (tipo === 'RSS') {
        if (!/^https:\/\//i.test(valor)) {
            return 'RSS: informe a URL https do feed ' +
                '(ex.: https://portal.com.br/anuncios/feed).';
        }

        return null;
    }

    // E-mail e WhatsApp recebem conteúdo por webhook próprio:
    // o identificador é só um rótulo do remetente/grupo.
    if (tipo === 'EMAIL' || tipo === 'WHATSAPP') return null;

    if (!valor) {
        return 'Informe o identificador externo da fonte ' +
            '(id numérico da Página/conta ou hashtag).';
    }

    if (/^https?:\/\//i.test(valor) || valor.includes('/')) {
        return 'Cole apenas o identificador, não a URL do perfil, ' +
            'da página ou do grupo.';
    }

    if (tipo === 'FACEBOOK_GRAPH') {
        if (!/^\d+$/.test(valor)) {
            return 'Facebook: use o id numérico da Página. ' +
                '@handles, URLs e ids de grupo ou de perfil pessoal ' +
                'não são aceitos pela Graph API em /{page-id}/posts.';
        }

        return null;
    }

    if (tipo === 'INSTAGRAM_GRAPH') {
        if (modo === 'hashtag') {
            if (!/^#?[A-Za-z0-9_]+$/.test(valor)) {
                return 'Instagram (hashtag): use apenas letras, ' +
                    'números e underscore, sem espaços nem URL.';
            }

            return null;
        }

        if (!/^\d+$/.test(valor)) {
            return 'Instagram (conta): use o id numérico da conta ' +
                'Business/Creator, não o @usuário.';
        }

        return null;
    }

    return null;
}

interface Fonte {
    id: string;
    nome: string;
    tipo: string;
    identificador_externo?: string | null;
    config?: Record<string, unknown> | null;
    ultimo_cursor?: string | null;
    ativo?: boolean;
    falhas_consecutivas?: number | null;
    suspensa_ate?: string | null;
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
    credencial: CredencialStatus;
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
            const err = corpo?.error as {
                message?: string;
                code?: number;
                error_subcode?: number;
                type?: string;
            } | undefined;

            throw new GraphError(
                String(err?.message || 'HTTP ' + r.status),
                typeof err?.code === 'number' ? err.code : null,
                typeof err?.error_subcode === 'number'
                    ? err.error_subcode
                    : null,
                err?.type ?? null,
            );
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
    const alvo = asText(fonte.identificador_externo) || '';

    const invalido = validarIdentificador(
        'INSTAGRAM_GRAPH',
        alvo,
        modo,
    );

    if (invalido) {
        return {
            capturas: [],
            erro: invalido,
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
        const c = classificarErroGraph(e, 'Instagram Graph API');

        return {
            capturas: [],
            erro: c.mensagem,
            credencial: c.status,
        };
    }
}

// ── Adaptador: Facebook (Graph API oficial) ─────────────────
async function buscarFacebook(fonte: Fonte): Promise<ResultadoFonte> {
    const token = Deno.env.get('FACEBOOK_PAGE_ACCESS_TOKEN') ||
        Deno.env.get('INSTAGRAM_ACCESS_TOKEN');

    const pagina = asText(fonte.identificador_externo) || '';

    if (!token) {
        return {
            capturas: [],
            erro:
                'Fonte não configurada: defina o secret ' +
                'FACEBOOK_PAGE_ACCESS_TOKEN e o id da página ' +
                '(Graph API oficial da Meta).',
            credencial: 'NAO_CONFIGURADA',
        };
    }

    const invalido = validarIdentificador('FACEBOOK_GRAPH', pagina, '');

    if (invalido) {
        return {
            capturas: [],
            erro: invalido,
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
        const c = classificarErroGraph(e, 'Facebook Graph API');

        return {
            capturas: [],
            erro: c.mensagem,
            credencial: c.status,
        };
    }
}

// ── Adaptador: RSS/Atom (feed oficial do portal) ───────────

// Extrai o conteúdo de uma tag simples, já sem CDATA nem
// entidades HTML. Parser mínimo e deliberado: feeds são XML
// previsível e a Edge Function não carrega dependência extra.
function tag(bloco: string, nome: string): string | null {
    const m = bloco.match(
        new RegExp('<' + nome + '[^>]*>([\\s\\S]*?)</' + nome + '>', 'i'),
    );

    if (!m) return null;

    return destextualizar(m[1]);
}


function destextualizar(bruto: string): string {
    return bruto
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();
}


function dataISO(valor: string | null): string | null {
    if (!valor) return null;

    const t = Date.parse(valor);

    return Number.isFinite(t) ? new Date(t).toISOString() : null;
}


async function buscarRss(fonte: Fonte): Promise<ResultadoFonte> {
    const url = (fonte.identificador_externo || '').trim();

    if (!/^https:\/\//i.test(url)) {
        return {
            capturas: [],
            erro: 'RSS: URL do feed ausente ou não é https.',
            credencial: 'NAO_CONFIGURADA',
        };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GRAPH_TIMEOUT_MS);

    let xml = '';

    try {
        const r = await fetch(url, {
            signal: ctrl.signal,
            headers: { Accept: 'application/rss+xml, application/xml' },
        });

        if (!r.ok) {
            return {
                capturas: [],
                erro: 'RSS: o feed respondeu HTTP ' + r.status + '.',
                credencial: 'ERRO',
            };
        }

        xml = await r.text();
    } catch (e) {
        const detalhe = e instanceof Error && e.name === 'AbortError'
            ? 'tempo limite excedido'
            : (e as Error)?.message || 'falha desconhecida';

        return {
            capturas: [],
            erro: 'RSS: não foi possível ler o feed (' + detalhe + ').',
            credencial: 'ERRO',
        };
    } finally {
        clearTimeout(timer);
    }

    const blocos = [
        ...xml.matchAll(/<(item|entry)[\s\S]*?<\/\1>/gi),
    ].map((m) => m[0]).slice(0, LIMITE_POR_FONTE);

    const capturas: CapturaBruta[] = [];

    for (const bloco of blocos) {
        const titulo = tag(bloco, 'title');

        const descricao = tag(bloco, 'description') ||
            tag(bloco, 'summary') ||
            tag(bloco, 'content:encoded') ||
            tag(bloco, 'content');

        const texto = [titulo, descricao]
            .filter(Boolean)
            .join('\n\n')
            .trim();

        if (!texto) continue;

        const link = tag(bloco, 'link') ||
            bloco.match(/<link[^>]+href="([^"]+)"/i)?.[1] ||
            null;

        const publicado = dataISO(
            tag(bloco, 'pubDate') ||
                tag(bloco, 'published') ||
                tag(bloco, 'updated'),
        );

        capturas.push({
            external_id: tag(bloco, 'guid') || tag(bloco, 'id') || link,
            autor: tag(bloco, 'author') || tag(bloco, 'dc:creator'),
            permalink: link,
            texto,
            midia_url: bloco.match(
                /<enclosure[^>]+url="([^"]+)"/i,
            )?.[1] ?? null,
            midia_tipo: null,
            publicado_em: publicado,
            payload: { origem: 'RSS', feed: url },
        });
    }

    return { capturas, erro: null, credencial: 'OK' };
}


// Interface única de adaptador: buscar(fonte) → capturas.
async function buscar(fonte: Fonte): Promise<ResultadoFonte> {
    if (fonte.tipo === 'INSTAGRAM_GRAPH') return await buscarInstagram(fonte);
    if (fonte.tipo === 'FACEBOOK_GRAPH') return await buscarFacebook(fonte);
    if (fonte.tipo === 'RSS') return await buscarRss(fonte);

    // MANUAL, IMPORT, EMAIL e WHATSAPP são alimentadas pelo
    // operador ou por webhook,
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
// Devolve quantas entraram e quantas já existiam, para que o
// painel distinga "nada novo" de "nada encontrado".
async function gravarCapturas(
    supabase: Cliente,
    fonteId: string | null,
    alvoId: string | null,
    capturas: CapturaBruta[],
): Promise<{ gravadas: number; duplicadas: number }> {
    if (!capturas.length) return { gravadas: 0, duplicadas: 0 };

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

    return {
        gravadas,
        duplicadas: Math.max(0, comId.length - gravadas),
    };
}

// Colunas de diagnóstico da migration 009. Se a migration ainda
// não foi aplicada (PGRST204), o registro é regravado sem elas
// para não perder a execução inteira.
const COLUNAS_DIAGNOSTICO = [
    'encontrados',
    'relevantes',
    'duplicados',
];

// Circuit breaker: três falhas seguidas suspendem a fonte por
// um tempo crescente, para não queimar cota de API nem encher
// o histórico de execuções com o mesmo erro.
const FALHAS_PARA_SUSPENDER = 3;

async function atualizarSaudeFonte(
    supabase: Cliente,
    fonte: Fonte,
    r: ResultadoFonte,
) {
    const falhas = r.erro ? (fonte.falhas_consecutivas ?? 0) + 1 : 0;

    const campos: Record<string, unknown> = {
        credencial_status: r.credencial,
        credencial_mensagem: r.erro,
        ultima_sincronizacao: new Date().toISOString(),
        falhas_consecutivas: falhas,
        suspensa_ate: null,
    };

    if (falhas >= FALHAS_PARA_SUSPENDER) {
        const minutos = Math.min(
            720,
            15 * Math.pow(2, falhas - FALHAS_PARA_SUSPENDER),
        );

        campos.suspensa_ate = new Date(
            Date.now() + minutos * 60000,
        ).toISOString();
    }

    const { error } = await supabase
        .from('radar_fontes')
        .update(campos)
        .eq('id', fonte.id);

    // Banco ainda sem as colunas da migration 010: mantém o
    // comportamento anterior em vez de falhar a varredura.
    if (error) {
        await supabase
            .from('radar_fontes')
            .update({
                credencial_status: r.credencial,
                credencial_mensagem: r.erro,
                ultima_sincronizacao: new Date().toISOString(),
            })
            .eq('id', fonte.id);
    }
}


async function registrarExecucao(
    supabase: Cliente,
    registro: Record<string, unknown>,
) {
    const base = {
        origem: 'CAPTURA',
        finalizado_em: new Date().toISOString(),
        ...registro,
    };

    const { error } = await supabase
        .from('radar_execucoes')
        .insert(base);

    if (!error) return;

    if (error.code === 'PGRST204') {
        const reduzido = { ...base } as Record<string, unknown>;

        for (const coluna of COLUNAS_DIAGNOSTICO) delete reduzido[coluna];

        const { error: e2 } = await supabase
            .from('radar_execucoes')
            .insert(reduzido);

        if (!e2) {
            console.warn(
                '[radar-captura] execucao gravada sem as colunas de ' +
                    'diagnóstico — aplique a migration ' +
                    '009_radar_pipeline_robustez.sql.',
            );

            return;
        }

        console.error('[radar-captura] execucao:', e2);

        return;
    }

    console.error('[radar-captura] execucao:', error);
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

            const identificador = asText(body.identificador_externo) || '';

            const id = asText(body.id);

            // Preserva a config já gravada (ex.: ig_user_id) e
            // aplica por cima apenas o que o painel enviou.
            let configAtual: Record<string, unknown> = {};

            const { data: atual } = id
                ? await supabase
                    .from('radar_fontes')
                    .select('config')
                    .eq('id', id)
                    .maybeSingle()
                : await supabase
                    .from('radar_fontes')
                    .select('config')
                    .eq('nome', nome)
                    .maybeSingle();

            if (atual?.config && typeof atual.config === 'object') {
                configAtual = atual.config as Record<string, unknown>;
            }

            const config = {
                ...configAtual,
                ...(body.config && typeof body.config === 'object'
                    ? body.config as Record<string, unknown>
                    : {}),
            };

            const invalido = validarIdentificador(
                tipo,
                identificador,
                asText(config.modo) || 'hashtag',
            );

            if (invalido) {
                return json({ error: invalido }, 400);
            }

            const registro: Record<string, unknown> = {
                nome,
                tipo,
                identificador_externo: identificador || null,
                config,
                ativo: body.ativo !== false,
            };

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

        // ── testar_fonte ────────────────────────────────────
        // Busca sem gravar nada: isola problema de credencial
        // de problema de configuração antes da varredura.
        if (acao === 'testar_fonte') {
            const id = asText(body.id);

            if (!id) {
                return json({ error: 'id é obrigatório' }, 400);
            }

            const { data: fonte, error: eFonte } = await supabase
                .from('radar_fontes')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (eFonte) throw eFonte;

            if (!fonte) {
                return json({ error: 'Fonte não encontrada' }, 404);
            }

            const alvoFonte = fonte as unknown as Fonte;

            if (
                alvoFonte.tipo !== 'INSTAGRAM_GRAPH' &&
                alvoFonte.tipo !== 'FACEBOOK_GRAPH'
            ) {
                return json({
                    ok: true,
                    credencial: 'OK',
                    encontrados: 0,
                    mensagem:
                        'Fonte alimentada manualmente — não há ' +
                        'credencial a testar.',
                });
            }

            const r = await buscar(alvoFonte);

            await supabase
                .from('radar_fontes')
                .update({
                    credencial_status: r.credencial,
                    credencial_mensagem: r.erro,
                })
                .eq('id', id);

            return json({
                ok: !r.erro,
                credencial: r.credencial,
                encontrados: r.capturas.length,
                erro: r.erro,
                amostra: r.capturas.length
                    ? {
                        autor: r.capturas[0].autor,
                        permalink: r.capturas[0].permalink,
                        texto: r.capturas[0].texto.slice(0, 280),
                    }
                    : null,
                mensagem: r.erro
                    ? r.erro
                    : r.capturas.length
                    ? 'Credencial OK — ' + r.capturas.length +
                        ' item(ns) visível(is) na fonte.'
                    : 'Credencial OK, mas a fonte não devolveu ' +
                        'nenhum item com texto.',
            });
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

        const agora = Date.now();

        const automaticas = ((fontes || []) as Fonte[]).filter((f) => {
            const varre = f.tipo === 'INSTAGRAM_GRAPH' ||
                f.tipo === 'FACEBOOK_GRAPH' ||
                f.tipo === 'RSS';

            if (!varre) return false;

            // Circuit breaker: fonte suspensa por falhas
            // consecutivas fica de fora até o prazo vencer.
            const ate = f.suspensa_ate
                ? Date.parse(String(f.suspensa_ate))
                : NaN;

            return !(Number.isFinite(ate) && ate > agora);
        });

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

                await atualizarSaudeFonte(supabase, fonte, r);

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
                let duplicadas = 0;
                let erro: string | null = null;

                try {
                    const g = await gravarCapturas(
                        supabase,
                        fonte.id,
                        alvo.id,
                        filtradas,
                    );

                    gravadas = g.gravadas;
                    duplicadas = g.duplicadas;
                } catch (e) {
                    erro = (e as Error).message;
                }

                total += gravadas;

                // Descartados aqui são os cortados pelo pré-filtro,
                // antes de gastar token de IA.
                const preFiltrados = r.capturas.length - filtradas.length;

                await registrarExecucao(supabase, {
                    alvo_id: alvo.id,
                    fonte_id: fonte.id,
                    iniciado_em: inicio,
                    capturados: gravadas,
                    encontrados: r.capturas.length,
                    relevantes: filtradas.length,
                    duplicados: duplicadas,
                    descartados: preFiltrados,
                    status: erro ? 'ERRO' : 'OK',
                    erro,
                    trace_id: traceId,
                });

                resumo.push({
                    alvo: alvo.nome,
                    fonte: fonte.nome,
                    encontrados: r.capturas.length,
                    relevantes: filtradas.length,
                    duplicados: duplicadas,
                    pre_filtrados: preFiltrados,
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
