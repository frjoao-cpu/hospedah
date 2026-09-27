// ============================================================
// HOSPEDAH — Motores genéricos de fonte do Radar IA
//
// Aqui vive o que o código PRECISA saber: COMO ler um tipo de
// fonte (página pública, feed RSS/Atom, API JSON). QUAL fonte
// ler e com QUAL configuração é assunto do banco
// (public.radar_fontes: tipo, identificador_externo, config).
//
// Adicionar um portal novo passa a ser cadastro, não código.
//
// Só funções puras: a Edge Function radar-captura faz o fetch
// (com timeout) e entrega o corpo já baixado para cá. Isso
// mantém os parsers testáveis por `deno test`.
// ============================================================

// Tipos aceitos no cadastro de fonte (salvar_fonte) — espelha
// o CHECK de public.radar_fontes.tipo.
export const TIPOS_FONTE = [
    'INSTAGRAM_GRAPH',
    'FACEBOOK_GRAPH',
    'WEB',
    'WEB_PUBLICA',
    'SITE',
    'HTML',
    'RSS',
    'ATOM',
    'FEED',
    'API',
    'JSON_API',
    'MANUAL',
    'IMPORT',
];

// Um motor por família de fonte, nunca um por site.
export const TIPOS_WEB = ['WEB', 'WEB_PUBLICA', 'SITE', 'HTML'];
export const TIPOS_FEED = ['RSS', 'ATOM', 'FEED'];
export const TIPOS_API = ['API', 'JSON_API'];

export type MotorFonte = 'INSTAGRAM' | 'FACEBOOK' | 'WEB' | 'FEED' | 'API';

// Qual motor atende o tipo cadastrado. MANUAL/IMPORT não têm
// motor: são alimentados pelo operador.
export function motorDaFonte(
    tipo: string | null | undefined,
): MotorFonte | null {
    const t = String(tipo || '').toUpperCase();

    if (t === 'INSTAGRAM_GRAPH') return 'INSTAGRAM';
    if (t === 'FACEBOOK_GRAPH') return 'FACEBOOK';
    if (TIPOS_WEB.includes(t)) return 'WEB';
    if (TIPOS_FEED.includes(t)) return 'FEED';
    if (TIPOS_API.includes(t)) return 'API';

    return null;
}

export interface ItemFonte {
    external_id: string | null;
    autor: string | null;
    permalink: string | null;
    texto: string;
    midia_url: string | null;
    midia_tipo: string | null;
    publicado_em: string | null;
    payload: Record<string, unknown>;
}

// Texto máximo guardado por captura: páginas inteiras podem
// vir com centenas de KB e a IA só lê o começo mesmo.
export const LIMITE_TEXTO = 20000;

function texto(v: unknown): string | null {
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v !== 'string') return null;

    const t = v.trim();

    return t ? t : null;
}

// ── URL da fonte ────────────────────────────────────────────

// A URL vem de config.url e, por compatibilidade, do
// identificador externo. Nenhum site é embutido no código.
export function urlDaFonte(fonte: {
    identificador_externo?: string | null;
    config?: Record<string, unknown> | null;
}): string | null {
    const config = (fonte.config || {}) as Record<string, unknown>;

    return texto(config.url) ||
        texto(config.feed_url) ||
        texto(config.endpoint) ||
        texto(fonte.identificador_externo);
}

// Hosts que nunca são fonte pública: barram SSRF para a rede
// interna do provedor a partir de uma config mal preenchida.
const HOSTS_INTERNOS =
    /^(localhost|127\.|0\.0\.0\.0|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|metadata\.)/i;

// Devolve a mensagem de erro, ou null quando a URL serve.
export function validarUrlFonte(valor: string | null): string | null {
    const bruto = (valor || '').trim();

    if (!bruto) {
        return 'Fonte não configurada: informe a URL em config.url.';
    }

    let url: URL;

    try {
        url = new URL(bruto);
    } catch {
        return 'URL inválida: ' + bruto;
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        return 'URL inválida: use http ou https.';
    }

    if (HOSTS_INTERNOS.test(url.hostname) || !url.hostname.includes('.')) {
        return 'URL inválida: endereços internos não são fontes ' +
            'públicas.';
    }

    return null;
}

// ── Entidades e limpeza de marcação ─────────────────────────

const ENTIDADES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    hellip: '…',
    mdash: '—',
    ndash: '–',
    laquo: '«',
    raquo: '»',
    aacute: 'á',
    eacute: 'é',
    iacute: 'í',
    oacute: 'ó',
    uacute: 'ú',
    atilde: 'ã',
    otilde: 'õ',
    ccedil: 'ç',
    acirc: 'â',
    ecirc: 'ê',
    ocirc: 'ô',
    agrave: 'à',
};

export function decodificarEntidades(bruto: string): string {
    return bruto
        .replace(/&#x([0-9a-f]+);/gi, (_, h) =>
            String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-z]+);/gi, (inteiro, nome: string) => {
            const v = ENTIDADES[nome.toLowerCase()];

            return v === undefined ? inteiro : v;
        });
}

// Remove marcação e devolve o texto útil. Serve tanto para
// HTML de página quanto para trechos de feed.
export function limparMarcacao(bruto: string): string {
    return decodificarEntidades(
        bruto
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/<!--[\s\S]*?-->/g, ' ')
            .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
            .replace(/<[^>]+>/g, ' '),
    )
        .replace(/[ \t\u00a0]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ── Motor WEB: página pública → uma captura ─────────────────

export function paginaParaItem(
    html: string,
    url: string,
    nomeFonte?: string | null,
): ItemFonte | null {
    const bruto = String(html || '');

    const titulo = bruto.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
        bruto.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
        null;

    const tituloLimpo = titulo ? limparMarcacao(titulo) : '';

    const corpo = limparMarcacao(
        bruto.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? bruto,
    );

    const conteudo = [tituloLimpo, corpo]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, LIMITE_TEXTO)
        .trim();

    if (!conteudo) return null;

    return {
        // A página é a mesma a cada varredura: o hash do texto
        // mantém o dedupe por (fonte_id, external_id) e ainda
        // permite recapturar quando o conteúdo muda.
        external_id: url + '#' + impressao(conteudo),
        autor: texto(nomeFonte),
        permalink: url,
        texto: conteudo,
        midia_url: imagemDaPagina(bruto, url),
        midia_tipo: null,
        publicado_em: null,
        payload: {
            origem: 'WEB',
            url,
            titulo: tituloLimpo || null,
        },
    };
}

function imagemDaPagina(html: string, url: string): string | null {
    const og = html.match(
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ?? null;

    if (!og) return null;

    try {
        return new URL(og, url).toString();
    } catch {
        return og;
    }
}

// Hash curto e estável (FNV-1a) do conteúdo — só para dedupe.
export function impressao(valor: string): string {
    let h = 0x811c9dc5;

    for (let i = 0; i < valor.length; i++) {
        h ^= valor.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }

    return h.toString(16).padStart(8, '0');
}

// ── Motor FEED: RSS / Atom ──────────────────────────────────

function tagDoBloco(bloco: string, nome: string): string | null {
    const m = bloco.match(
        new RegExp('<' + nome + '[^>]*>([\\s\\S]*?)</' + nome + '>', 'i'),
    );

    if (!m) return null;

    const t = limparMarcacao(m[1]);

    return t ? t : null;
}

export function dataISO(valor: string | null): string | null {
    if (!valor) return null;

    const t = Date.parse(valor);

    return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

export function feedParaItens(
    xml: string,
    url: string,
    limite: number,
): ItemFonte[] {
    const blocos = [
        ...String(xml || '').matchAll(/<(item|entry)[\s\S]*?<\/\1>/gi),
    ]
        .map((m) => m[0])
        .slice(0, limite);

    const itens: ItemFonte[] = [];

    for (const bloco of blocos) {
        const titulo = tagDoBloco(bloco, 'title');

        const descricao = tagDoBloco(bloco, 'description') ||
            tagDoBloco(bloco, 'summary') ||
            tagDoBloco(bloco, 'content:encoded') ||
            tagDoBloco(bloco, 'content');

        const conteudo = [titulo, descricao]
            .filter(Boolean)
            .join('\n\n')
            .slice(0, LIMITE_TEXTO)
            .trim();

        if (!conteudo) continue;

        const link = tagDoBloco(bloco, 'link') ||
            bloco.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ||
            null;

        const midia = bloco.match(/<enclosure[^>]+url=["']([^"']+)["']/i)
            ?.[1] ??
            bloco.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1] ??
            null;

        itens.push({
            external_id: tagDoBloco(bloco, 'guid') ||
                tagDoBloco(bloco, 'id') ||
                link,
            autor: tagDoBloco(bloco, 'author') ||
                tagDoBloco(bloco, 'dc:creator'),
            permalink: link,
            texto: conteudo,
            midia_url: midia,
            midia_tipo: null,
            publicado_em: dataISO(
                tagDoBloco(bloco, 'pubDate') ||
                    tagDoBloco(bloco, 'published') ||
                    tagDoBloco(bloco, 'updated'),
            ),
            payload: { origem: 'FEED', feed: url, titulo },
        });
    }

    return itens;
}

// ── Motor API: JSON genérico ────────────────────────────────

// Coleções comuns em APIs públicas. items_path na config
// resolve os casos fora dessa lista sem mexer no código.
const CAMINHOS_PADRAO = [
    'data',
    'items',
    'results',
    'posts',
    'entries',
    'records',
    'content',
    'list',
];

function porCaminho(raiz: unknown, caminho: string): unknown {
    let atual: unknown = raiz;

    for (const parte of caminho.split('.')) {
        const chave = parte.trim();

        if (!chave) continue;

        if (Array.isArray(atual) && /^\d+$/.test(chave)) {
            atual = atual[Number(chave)];

            continue;
        }

        if (!atual || typeof atual !== 'object') return undefined;

        atual = (atual as Record<string, unknown>)[chave];
    }

    return atual;
}

export function itensDoJson(
    raiz: unknown,
    itemsPath?: string | null,
): Record<string, unknown>[] {
    const caminhos = itemsPath
        ? [itemsPath, ...CAMINHOS_PADRAO]
        : CAMINHOS_PADRAO;

    if (Array.isArray(raiz)) {
        return raiz.filter((i) => i && typeof i === 'object') as Record<
            string,
            unknown
        >[];
    }

    for (const caminho of caminhos) {
        const valor = porCaminho(raiz, caminho);

        if (Array.isArray(valor)) {
            return valor.filter((i) => i && typeof i === 'object') as Record<
                string,
                unknown
            >[];
        }

        // Alguns envelopes aninham mais um nível: { data: { items: [] } }.
        if (valor && typeof valor === 'object') {
            for (const interno of CAMINHOS_PADRAO) {
                const lista = (valor as Record<string, unknown>)[interno];

                if (Array.isArray(lista)) {
                    return lista.filter(
                        (i) => i && typeof i === 'object',
                    ) as Record<string, unknown>[];
                }
            }
        }
    }

    return [];
}

function primeiro(
    item: Record<string, unknown>,
    chaves: string[],
): string | null {
    for (const chave of chaves) {
        const valor = porCaminho(item, chave);

        const t = texto(valor);

        if (t) return t;
    }

    return null;
}

export function jsonParaItem(
    item: Record<string, unknown>,
    url: string,
    nomeFonte?: string | null,
): ItemFonte | null {
    const titulo = primeiro(item, [
        'title',
        'titulo',
        'name',
        'nome',
        'headline',
        'subject',
    ]);

    const corpo = primeiro(item, [
        'text',
        'texto',
        'description',
        'descricao',
        'descrição',
        'content',
        'conteudo',
        'body',
        'message',
        'caption',
        'resumo',
        'summary',
        'excerpt',
        'content.rendered',
        'description.value',
    ]);

    const conteudo = [titulo, corpo]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, LIMITE_TEXTO)
        .trim();

    if (!conteudo) return null;

    const link = primeiro(item, [
        'permalink',
        'link',
        'url',
        'href',
        'page_url',
        'link.href',
    ]);

    const publicado = dataISO(
        primeiro(item, [
            'published_at',
            'publicado_em',
            'created_at',
            'createdAt',
            'pubDate',
            'date',
            'data',
            'timestamp',
            'updated_at',
        ]),
    );

    const midia = primeiro(item, [
        'image',
        'imagem',
        'image_url',
        'midia_url',
        'media_url',
        'thumbnail',
        'thumb',
        'foto',
        'cover',
        'image.url',
        'images.0.url',
    ]);

    return {
        external_id: primeiro(item, [
            'id',
            'guid',
            'uuid',
            '_id',
            'slug',
            'codigo',
            'external_id',
        ]) || link || (url + '#' + impressao(conteudo)),
        autor: primeiro(item, [
            'author',
            'autor',
            'username',
            'user',
            'anunciante',
            'author.name',
            'user.name',
            'owner.name',
        ]) || texto(nomeFonte),
        permalink: link,
        texto: conteudo,
        midia_url: midia,
        midia_tipo: null,
        publicado_em: publicado,
        payload: { origem: 'API', url, item },
    };
}

export function jsonParaItens(
    raiz: unknown,
    url: string,
    limite: number,
    itemsPath?: string | null,
    nomeFonte?: string | null,
): ItemFonte[] {
    return itensDoJson(raiz, itemsPath)
        .slice(0, limite)
        .map((i) => jsonParaItem(i, url, nomeFonte))
        .filter((i): i is ItemFonte => i !== null);
}
