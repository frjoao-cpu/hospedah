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
    return urlsDaFonte(fonte)[0] ?? null;
}

// Uma fonte pode apontar para várias páginas públicas
// (config.urls). Continua valendo config.url simples e o
// identificador externo, para as fontes já cadastradas.
export function urlsDaFonte(fonte: {
    identificador_externo?: string | null;
    config?: Record<string, unknown> | null;
}): string[] {
    const config = (fonte.config || {}) as Record<string, unknown>;

    const lista: string[] = [];

    const acrescentar = (valor: unknown) => {
        if (Array.isArray(valor)) {
            for (const item of valor) acrescentar(item);

            return;
        }

        const t = texto(valor);

        if (t && !lista.includes(t)) lista.push(t);
    };

    acrescentar(config.urls);
    acrescentar(config.feed_urls);
    acrescentar(config.endpoints);
    acrescentar(config.url);
    acrescentar(config.feed_url);
    acrescentar(config.endpoint);

    if (!lista.length) acrescentar(fonte.identificador_externo);

    return lista;
}

// Limite de itens por fonte: a config pode pedir menos que o
// teto do sistema, nunca mais.
export function limiteDaFonte(
    config: Record<string, unknown> | null | undefined,
    teto: number,
): number {
    const bruto = (config || {}).limit ?? (config || {}).limite;

    const n = typeof bruto === 'number' ? bruto : Number(texto(bruto));

    if (!Number.isFinite(n) || n <= 0) return teto;

    return Math.min(Math.floor(n), teto);
}

export interface RequisicaoFonte {
    method: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body: string | null;
}

// Cabeçalhos que o motor não deixa a config sobrescrever:
// evita que uma fonte forje credenciais da plataforma.
const HEADERS_BLOQUEADOS = ['host', 'content-length', 'cookie'];

// Como falar com a fonte: método, cabeçalhos e query string.
// Tudo opcional — uma fonte simples só precisa da URL.
export function requisicaoDaFonte(
    config: Record<string, unknown> | null | undefined,
): RequisicaoFonte {
    const c = (config || {}) as Record<string, unknown>;

    const metodo = (texto(c.method) || 'GET').toUpperCase();

    const headers: Record<string, string> = {};

    if (c.headers && typeof c.headers === 'object') {
        for (
            const [chave, valor] of Object.entries(
                c.headers as Record<string, unknown>,
            )
        ) {
            const nome = chave.trim();
            const v = texto(valor);

            if (!nome || !v) continue;

            if (HEADERS_BLOQUEADOS.includes(nome.toLowerCase())) continue;

            headers[nome] = v;
        }
    }

    const query: Record<string, string> = {};

    if (c.query && typeof c.query === 'object') {
        for (
            const [chave, valor] of Object.entries(
                c.query as Record<string, unknown>,
            )
        ) {
            const nome = chave.trim();
            const v = texto(valor);

            if (!nome || v === null) continue;

            query[nome] = v;
        }
    }

    const body = metodo === 'GET' || metodo === 'HEAD'
        ? null
        : typeof c.body === 'string'
        ? c.body
        : c.body && typeof c.body === 'object'
        ? JSON.stringify(c.body)
        : null;

    return { method: metodo, headers, query, body };
}

// Aplica a query da config (e a paginação) sobre a URL.
export function montarUrl(
    url: string,
    query: Record<string, string>,
): string {
    if (!Object.keys(query).length) return url;

    try {
        const u = new URL(url);

        for (const [chave, valor] of Object.entries(query)) {
            u.searchParams.set(chave, valor);
        }

        return u.toString();
    } catch {
        return url;
    }
}

// ── Paginação configurável ──────────────────────────────────

// Teto de páginas por fonte: a config pode pedir menos, nunca
// mais. Sem isto uma fonte mal configurada viraria loop.
export const MAX_PAGINAS = 5;

export interface Paginacao {
    ativa: boolean;
    modo: 'page' | 'offset' | 'cursor';
    parametro: string;
    inicio: number;
    passo: number;
    paginas: number;
    cursorPath: string | null;
    proximaPath: string | null;
}

export function paginacaoDaFonte(
    config: Record<string, unknown> | null | undefined,
): Paginacao {
    const bruta = ((config || {}).pagination ??
        (config || {}).paginacao) as Record<string, unknown> | undefined;

    const p = (bruta && typeof bruta === 'object' ? bruta : {}) as Record<
        string,
        unknown
    >;

    const modoBruto = (texto(p.mode) || texto(p.modo) || 'page')
        .toLowerCase();

    const modo: Paginacao['modo'] = modoBruto === 'offset'
        ? 'offset'
        : modoBruto === 'cursor' || modoBruto === 'next' ||
                modoBruto === 'next_url'
        ? 'cursor'
        : 'page';

    const numero = (valor: unknown, padrao: number): number => {
        const n = typeof valor === 'number' ? valor : Number(texto(valor));

        return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao;
    };

    const inicioBruto = p.start ?? p.inicio;

    const inicio = inicioBruto === undefined
        ? (modo === 'offset' ? 0 : 1)
        : numero(inicioBruto, modo === 'offset' ? 0 : 1);

    return {
        ativa: p.enabled === true || p.ativa === true,
        modo,
        parametro: texto(p.param) || texto(p.parametro) ||
            (modo === 'offset' ? 'offset' : 'page'),
        inicio: Number.isFinite(inicio) ? inicio : (modo === 'offset' ? 0 : 1),
        passo: numero(p.step ?? p.passo, modo === 'offset' ? 25 : 1),
        paginas: Math.min(numero(p.pages ?? p.paginas, MAX_PAGINAS), MAX_PAGINAS),
        cursorPath: texto(p.cursor_path) || texto(p.cursor),
        proximaPath: texto(p.next_path) || texto(p.next_url_path) ||
            texto(p.next_url),
    };
}

// Query extra da página n (0 = primeira). Cursor não usa
// contador: o valor vem da resposta anterior.
export function queryDaPagina(
    paginacao: Paginacao,
    indice: number,
): Record<string, string> {
    if (!paginacao.ativa || indice <= 0 || paginacao.modo === 'cursor') {
        return {};
    }

    return {
        [paginacao.parametro]: String(
            paginacao.inicio + indice * paginacao.passo,
        ),
    };
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

// ── Motor WEB: página com lista de itens (config.item_selector)

// Seletor simples e suficiente para páginas públicas:
//   tag, .classe, tag.classe, #id, [atributo], tag[atributo=x]
// Sites diferentes se resolvem no config da fonte, não no código.
interface Seletor {
    tag: string | null;
    classes: string[];
    id: string | null;
    atributos: { nome: string; valor: string | null }[];
}

export function interpretarSeletor(bruto: string): Seletor | null {
    const texto0 = String(bruto || '').trim();

    if (!texto0) return null;

    const sel: Seletor = { tag: null, classes: [], id: null, atributos: [] };

    const regex = /^([a-z][a-z0-9-]*)|\.([^.#\[\s]+)|#([^.#\[\s]+)|\[([^\]]+)\]/i;

    let resto = texto0;

    while (resto) {
        const m = resto.match(regex);

        if (!m) return null;

        if (m[1]) sel.tag = m[1].toLowerCase();
        else if (m[2]) sel.classes.push(m[2]);
        else if (m[3]) sel.id = m[3];
        else if (m[4]) {
            const [nome, ...valor] = m[4].split('=');

            sel.atributos.push({
                nome: nome.trim().toLowerCase(),
                valor: valor.length
                    ? valor.join('=').trim().replace(/^["']|["']$/g, '')
                    : null,
            });
        }

        resto = resto.slice(m[0].length);
    }

    return sel.tag || sel.classes.length || sel.id || sel.atributos.length
        ? sel
        : null;
}

function atributosDaTag(tag: string): Record<string, string> {
    const atributos: Record<string, string> = {};

    for (
        const m of tag.matchAll(
            /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g,
        )
    ) {
        atributos[m[1].toLowerCase()] = decodificarEntidades(
            m[3] ?? m[4] ?? m[5] ?? '',
        );
    }

    return atributos;
}

function casa(sel: Seletor, nomeTag: string, tagCompleta: string): boolean {
    if (sel.tag && sel.tag !== nomeTag) return false;

    const atributos = atributosDaTag(tagCompleta);

    if (sel.id && atributos.id !== sel.id) return false;

    if (sel.classes.length) {
        const classes = (atributos.class || '').split(/\s+/);

        for (const c of sel.classes) {
            if (!classes.includes(c)) return false;
        }
    }

    for (const a of sel.atributos) {
        const valor = atributos[a.nome];

        if (valor === undefined) return false;

        if (a.valor !== null && valor !== a.valor) return false;
    }

    return true;
}

const TAGS_VAZIAS = [
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'source',
    'track',
    'wbr',
];

export interface BlocoHtml {
    tag: string;
    abertura: string;
    interno: string;
    inteiro: string;
}

// Devolve os elementos que casam com o seletor, já com o
// conteúdo interno balanceado (aninhamento da mesma tag).
export function selecionarBlocos(
    html: string,
    seletor: string,
    limite = 200,
): BlocoHtml[] {
    const sel = interpretarSeletor(seletor);

    if (!sel) return [];

    const bruto = String(html || '');
    const blocos: BlocoHtml[] = [];

    const abre = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;

    let m: RegExpExecArray | null;

    while ((m = abre.exec(bruto)) !== null) {
        const nomeTag = m[1].toLowerCase();

        if (!casa(sel, nomeTag, m[0])) continue;

        const inicioInterno = m.index + m[0].length;

        if (TAGS_VAZIAS.includes(nomeTag) || m[0].endsWith('/>')) {
            blocos.push({
                tag: nomeTag,
                abertura: m[0],
                interno: '',
                inteiro: m[0],
            });
        } else {
            const fim = fimDoElemento(bruto, nomeTag, inicioInterno);

            blocos.push({
                tag: nomeTag,
                abertura: m[0],
                interno: bruto.slice(inicioInterno, fim.inicioFechamento),
                inteiro: bruto.slice(m.index, fim.fim),
            });

            // Não procura itens dentro de um item já selecionado.
            abre.lastIndex = fim.fim;
        }

        if (blocos.length >= limite) break;
    }

    return blocos;
}

function fimDoElemento(
    html: string,
    nomeTag: string,
    desde: number,
): { inicioFechamento: number; fim: number } {
    const marca = new RegExp(
        '<(/?)' + nomeTag + '(\\s[^>]*)?/?>',
        'gi',
    );

    marca.lastIndex = desde;

    let profundidade = 1;
    let m: RegExpExecArray | null;

    while ((m = marca.exec(html)) !== null) {
        if (m[0].endsWith('/>')) continue;

        profundidade += m[1] === '/' ? -1 : 1;

        if (profundidade === 0) {
            return { inicioFechamento: m.index, fim: m.index + m[0].length };
        }
    }

    return { inicioFechamento: html.length, fim: html.length };
}

// Campo da config: "a@href", ".preco", "@data-id" ou apenas
// texto do próprio item quando vazio.
export function valorDoCampo(
    bloco: BlocoHtml,
    spec: unknown,
    baseUrl: string,
): string | null {
    let seletor = '';
    let atributo: string | null = null;

    if (typeof spec === 'string') {
        const partes = spec.split('@');

        seletor = partes[0].trim();
        atributo = partes.length > 1 ? partes.slice(1).join('@').trim() : null;
    } else if (spec && typeof spec === 'object') {
        const o = spec as Record<string, unknown>;

        seletor = texto(o.selector) || texto(o.seletor) || '';
        atributo = texto(o.attr) || texto(o.atributo);
    } else {
        return null;
    }

    let alvo: BlocoHtml | null = bloco;

    if (seletor) {
        alvo = selecionarBlocos(bloco.inteiro, seletor, 1)[0] ?? null;

        // O seletor pode descrever o próprio item.
        if (!alvo) {
            const sel = interpretarSeletor(seletor);

            if (sel && casa(sel, bloco.tag, bloco.abertura)) alvo = bloco;
        }
    }

    if (!alvo) return null;

    if (atributo) {
        const valor = atributosDaTag(alvo.abertura)[atributo.toLowerCase()];

        if (!valor) return null;

        return /^(href|src|data-src|content|srcset)$/i.test(atributo)
            ? absoluta(valor, baseUrl)
            : valor;
    }

    const t = limparMarcacao(alvo.interno || alvo.inteiro);

    return t ? t : null;
}

function absoluta(valor: string, baseUrl: string): string {
    try {
        return new URL(valor, baseUrl).toString();
    } catch {
        return valor;
    }
}

// Página com lista de anúncios: cada bloco vira uma captura.
// Os seletores ficam no config da fonte — nenhum site é
// conhecido pelo código.
export function listaParaItens(
    html: string,
    url: string,
    config: Record<string, unknown> | null | undefined,
    limite: number,
    nomeFonte?: string | null,
): ItemFonte[] {
    const c = (config || {}) as Record<string, unknown>;

    const seletor = texto(c.item_selector) || texto(c.itemSelector) ||
        texto(c.seletor_item);

    if (!seletor) return [];

    const campos = (c.fields && typeof c.fields === 'object'
        ? c.fields
        : c.campos && typeof c.campos === 'object'
        ? c.campos
        : {}) as Record<string, unknown>;

    const itens: ItemFonte[] = [];

    for (const bloco of selecionarBlocos(html, seletor, limite)) {
        const titulo = valorDoCampo(bloco, campos.title ?? campos.titulo, url);

        const corpo = valorDoCampo(
            bloco,
            campos.text ?? campos.texto ?? campos.description ?? '',
            url,
        );

        const conteudo = [titulo, corpo]
            .filter(Boolean)
            .join('\n\n')
            .slice(0, LIMITE_TEXTO)
            .trim();

        if (!conteudo) continue;

        const link = valorDoCampo(
            bloco,
            campos.url ?? campos.link ?? campos.permalink ?? 'a@href',
            url,
        ) || url;

        const id = valorDoCampo(
            bloco,
            campos.external_id ?? campos.id ?? '',
            url,
        );

        itens.push({
            // Sem id da fonte, o dedupe usa link + impressão do
            // conteúdo: determinístico entre varreduras.
            external_id: id || (link + '#' + impressao(conteudo)),
            autor: valorDoCampo(bloco, campos.author ?? campos.autor ?? '', url) ||
                texto(nomeFonte),
            permalink: link,
            texto: conteudo,
            midia_url: valorDoCampo(
                bloco,
                campos.image ?? campos.imagem ?? campos.midia_url ?? 'img@src',
                url,
            ),
            midia_tipo: null,
            publicado_em: dataISO(
                valorDoCampo(
                    bloco,
                    campos.published_at ?? campos.publicado_em ?? campos.date ??
                        '',
                    url,
                ),
            ),
            payload: { origem: 'WEB', url, titulo },
        });

        if (itens.length >= limite) break;
    }

    return itens;
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

// Mapeamento opcional de campos vindo de config.fields:
// o caminho configurado tem prioridade sobre os nomes usuais.
function comConfig(
    campos: Record<string, unknown> | null | undefined,
    nomes: string[],
    padroes: string[],
): string[] {
    const c = (campos || {}) as Record<string, unknown>;

    const escolhidos: string[] = [];

    for (const nome of nomes) {
        const valor = texto(c[nome]);

        if (valor) escolhidos.push(valor);
    }

    return [...escolhidos, ...padroes];
}

export function jsonParaItem(
    item: Record<string, unknown>,
    url: string,
    nomeFonte?: string | null,
    campos?: Record<string, unknown> | null,
): ItemFonte | null {
    const titulo = primeiro(item, comConfig(campos, ['title', 'titulo'], [
        'title',
        'titulo',
        'name',
        'nome',
        'headline',
        'subject',
    ]));

    const corpo = primeiro(item, comConfig(campos, ['text', 'texto'], [
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
    ]));

    const conteudo = [titulo, corpo]
        .filter(Boolean)
        .join('\n\n')
        .slice(0, LIMITE_TEXTO)
        .trim();

    if (!conteudo) return null;

    const link = primeiro(item, comConfig(campos, [
        'permalink',
        'url',
        'link',
    ], [
        'permalink',
        'link',
        'url',
        'href',
        'page_url',
        'link.href',
    ]));

    const publicado = dataISO(
        primeiro(item, comConfig(campos, [
            'published_at',
            'publicado_em',
            'date',
        ], [
            'published_at',
            'publicado_em',
            'created_at',
            'createdAt',
            'pubDate',
            'date',
            'data',
            'timestamp',
            'updated_at',
        ])),
    );

    const midia = primeiro(item, comConfig(campos, [
        'midia_url',
        'image',
        'imagem',
    ], [
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
    ]));

    return {
        external_id: primeiro(item, comConfig(campos, [
            'external_id',
            'id',
        ], [
            'id',
            'guid',
            'uuid',
            '_id',
            'slug',
            'codigo',
            'external_id',
        ])) || link || (url + '#' + impressao(conteudo)),
        autor: primeiro(item, comConfig(campos, [
            'autor',
            'author',
        ], [
            'author',
            'autor',
            'username',
            'user',
            'anunciante',
            'author.name',
            'user.name',
            'owner.name',
        ])) || texto(nomeFonte),
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
    campos?: Record<string, unknown> | null,
): ItemFonte[] {
    return itensDoJson(raiz, itemsPath)
        .slice(0, limite)
        .map((i) => jsonParaItem(i, url, nomeFonte, campos))
        .filter((i): i is ItemFonte => i !== null);
}

// Próxima página de uma API: o caminho do cursor/next vem da
// config (pagination.next_path ou pagination.cursor_path).
export function proximaPaginaJson(
    raiz: unknown,
    paginacao: Paginacao,
    urlAtual: string,
): { url: string } | { cursor: string } | null {
    if (!paginacao.ativa) return null;

    if (paginacao.proximaPath) {
        const proxima = texto(porCaminho(raiz, paginacao.proximaPath));

        if (proxima) {
            try {
                return { url: new URL(proxima, urlAtual).toString() };
            } catch {
                return null;
            }
        }
    }

    if (paginacao.cursorPath) {
        const cursor = texto(porCaminho(raiz, paginacao.cursorPath));

        if (cursor) return { cursor };
    }

    return null;
}
