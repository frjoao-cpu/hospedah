// ============================================================
// HOSPEDAH — Cliente de IA compartilhado do Radar
//
// O Radar IA roda sobre a GPT Luna (API compatível com
// OpenAI). O Gemini permanece como provedor de contingência:
// se a chave da Luna não estiver configurada — ou se a
// chamada falhar — a análise continua pelo Gemini em vez de
// parar o pipeline.
//
// Responsabilidades concentradas aqui:
//   • saída estruturada por JSON Schema (fim do parse frágil);
//   • timeout e fallback de modelo;
//   • roteador de modelos (triagem barata × análise forte);
//   • contabilidade de tokens para o painel de custo.
//
// Secrets:
//   LUNA_API_KEY        → chave da GPT Luna (ou OPENAI_API_KEY)
//   LUNA_BASE_URL       → padrão https://api.openai.com/v1
//   LUNA_MODEL          → padrão gpt-luna
//   LUNA_MODEL_TRIAGEM  → modelo barato do roteador
//   GEMINI_API_KEY      → contingência
//   GEMINI_MODEL / GEMINI_FALLBACK_MODELS
// ============================================================

// Erro de IA com mensagem já revisada para o operador.
export class IAError extends Error {
    status: number;

    constructor(mensagem: string, status = 502) {
        super(mensagem);
        this.name = 'IAError';
        this.status = status;
    }
}

export interface Uso {
    entrada: number;
    saida: number;
}

export interface RespostaIA {
    dados: Record<string, unknown>;
    provedor: 'LUNA' | 'GEMINI';
    modelo: string;
    uso: Uso;
}

export interface OpcoesIA {
    // Schema JSON da resposta esperada. Ativa a saída
    // estruturada nos dois provedores.
    schema?: Record<string, unknown>;
    // Nome do schema (exigido pela API da Luna).
    schemaNome?: string;
    // true = tarefa de triagem, usa o modelo barato.
    triagem?: boolean;
    temperatura?: number;
    timeoutMs?: number;
}

const TIMEOUT_PADRAO_MS = 45000;

function env(nome: string): string | undefined {
    try {
        return Deno.env.get(nome) || undefined;
    } catch {
        return undefined;
    }
}

export function chaveLuna(): string | undefined {
    return env('LUNA_API_KEY') || env('OPENAI_API_KEY');
}

export function chaveGemini(): string | undefined {
    return env('GEMINI_API_KEY');
}

export function iaConfigurada(): boolean {
    return !!(chaveLuna() || chaveGemini());
}

function baseLuna(): string {
    const url = env('LUNA_BASE_URL') || 'https://api.openai.com/v1';
    return url.replace(/\/+$/, '');
}

export function modeloLuna(triagem = false): string {
    if (triagem) {
        return env('LUNA_MODEL_TRIAGEM') ||
            env('LUNA_MODEL') ||
            'gpt-luna-mini';
    }

    return env('LUNA_MODEL') || 'gpt-luna';
}

export function modeloGemini(): string {
    return env('GEMINI_MODEL') || 'gemini-2.5-flash';
}

export function fallbacksGemini(): string[] {
    const principal = modeloGemini();

    return (
        env('GEMINI_FALLBACK_MODELS') ||
        'gemini-2.5-flash-lite,gemini-2.0-flash,gemini-1.5-flash'
    )
        .split(',')
        .map((m) => m.trim())
        .filter((m) => m && m !== principal);
}

async function chamar(
    url: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Extrai o JSON da resposta. Com saída estruturada o texto já
// vem puro; o saneamento cobre modelos que insistem em cercar
// a resposta com crases.
export function parseJsonIA(texto: string): Record<string, unknown> {
    const limpo = texto
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim();

    try {
        return JSON.parse(limpo);
    } catch {
        const ini = limpo.indexOf('{');
        const fim = limpo.lastIndexOf('}');

        if (ini >= 0 && fim > ini) {
            try {
                return JSON.parse(limpo.slice(ini, fim + 1));
            } catch {
                // Cai no erro tratado abaixo.
            }
        }

        throw new IAError(
            'A IA não retornou um JSON válido ' +
                '(resposta possivelmente truncada). ' +
                'Tente novamente com um texto menor.',
        );
    }
}

// ── Provedor 1: GPT Luna (API compatível com OpenAI) ────────

async function pedirLuna(
    chave: string,
    system: string,
    usuario: string,
    op: OpcoesIA,
): Promise<RespostaIA> {
    const modelo = modeloLuna(op.triagem);

    const corpo: Record<string, unknown> = {
        model: modelo,
        temperature: op.temperatura ?? 0.1,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: usuario },
        ],
    };

    corpo.response_format = op.schema
        ? {
            type: 'json_schema',
            json_schema: {
                name: op.schemaNome || 'resposta',
                strict: false,
                schema: op.schema,
            },
        }
        : { type: 'json_object' };

    let r: Response;

    try {
        r = await chamar(
            baseLuna() + '/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + chave,
                },
                body: JSON.stringify(corpo),
            },
            op.timeoutMs ?? TIMEOUT_PADRAO_MS,
        );
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            throw new IAError(
                'A GPT Luna demorou demais para responder ' +
                    '(timeout). Tente novamente.',
                504,
            );
        }

        throw new IAError('Falha de rede ao chamar a GPT Luna.');
    }

    const bruto = await r.text().catch(() => '');

    // deno-lint-ignore no-explicit-any
    let dados: any = null;

    try {
        dados = bruto ? JSON.parse(bruto) : null;
    } catch {
        throw new IAError(
            'A GPT Luna retornou uma resposta inesperada ' +
                '(HTTP ' + r.status + ').',
        );
    }

    if (!r.ok) {
        const msg = String(dados?.error?.message || 'erro desconhecido');

        if (r.status === 401 || r.status === 403) {
            throw new IAError(
                'LUNA_API_KEY inválida ou sem permissão. ' +
                    'Revise o secret na Edge Function.',
                500,
            );
        }

        if (r.status === 404) {
            throw new IAError(
                'Modelo ' + modelo + ' indisponível para esta chave. ' +
                    'Defina o secret LUNA_MODEL com um modelo válido.',
            );
        }

        if (r.status === 429) {
            throw new IAError(
                'Limite de uso da GPT Luna atingido. ' +
                    'Aguarde e tente novamente.',
                429,
            );
        }

        throw new IAError('Erro na API da GPT Luna: ' + msg);
    }

    const texto = dados?.choices?.[0]?.message?.content;

    if (!texto) {
        throw new IAError('A GPT Luna não retornou conteúdo.');
    }

    return {
        dados: parseJsonIA(String(texto)),
        provedor: 'LUNA',
        modelo,
        uso: {
            entrada: Number(dados?.usage?.prompt_tokens) || 0,
            saida: Number(dados?.usage?.completion_tokens) || 0,
        },
    };
}

// ── Provedor 2: Gemini (contingência) ───────────────────────

// O Gemini não aceita as palavras-chave de validação do
// JSON Schema completo; mantém-se apenas o essencial.
function schemaGemini(
    schema: Record<string, unknown>,
): Record<string, unknown> {
    const proibidas = [
        'additionalProperties',
        '$schema',
        'strict',
        'default',
        'examples',
    ];

    const limpar = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(limpar);

        if (v && typeof v === 'object') {
            const saida: Record<string, unknown> = {};

            for (const [k, valor] of Object.entries(v)) {
                if (proibidas.includes(k)) continue;

                // Gemini não suporta união de tipos (["x","null"]).
                if (k === 'type' && Array.isArray(valor)) {
                    const tipo = valor.find((t) => t !== 'null');
                    saida[k] = tipo ?? 'string';
                    saida.nullable = valor.includes('null');
                    continue;
                }

                saida[k] = limpar(valor);
            }

            return saida;
        }

        return v;
    };

    return limpar(schema) as Record<string, unknown>;
}

async function pedirGemini(
    chave: string,
    system: string,
    usuario: string,
    op: OpcoesIA,
): Promise<RespostaIA> {
    const principal = modeloGemini();
    const alternativos = fallbacksGemini();

    const url = (m: string) =>
        'https://generativelanguage.googleapis.com' +
        '/v1beta/models/' + m + ':generateContent?key=' + chave;

    const generationConfig: Record<string, unknown> = {
        temperature: op.temperatura ?? 0.1,
        responseMimeType: 'application/json',
    };

    if (op.schema) {
        generationConfig.responseSchema = schemaGemini(op.schema);
    }

    const corpo = JSON.stringify({
        contents: [
            {
                role: 'user',
                parts: [{ text: system + '\n\n' + usuario }],
            },
        ],
        generationConfig,
    });

    const init: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: corpo,
    };

    const timeout = op.timeoutMs ?? TIMEOUT_PADRAO_MS;

    let r: Response;
    let modelo = principal;

    try {
        r = await chamar(url(principal), init, timeout);

        // Modelo indisponível para a chave: tenta os alternativos.
        if (r.status === 404 && alternativos.length) {
            await r.text();

            for (const m of alternativos) {
                console.warn(
                    '[ia] Gemini ' + modelo +
                        ' indisponível (404) — tentando ' + m,
                );

                r = await chamar(url(m), init, timeout);

                if (r.status !== 404) {
                    modelo = m;
                    break;
                }

                await r.text();
            }
        }
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
            throw new IAError(
                'A IA demorou demais para responder (timeout). ' +
                    'Tente novamente.',
                504,
            );
        }

        throw new IAError('Falha de rede ao chamar a API do Gemini.');
    }

    const bruto = await r.text().catch(() => '');

    // deno-lint-ignore no-explicit-any
    let dados: any = null;

    try {
        dados = bruto ? JSON.parse(bruto) : null;
    } catch {
        throw new IAError(
            'A API do Gemini retornou uma resposta inesperada ' +
                '(HTTP ' + r.status + '). Tente novamente ' +
                'em instantes.',
        );
    }

    if (!r.ok) {
        const msg = String(dados?.error?.message || 'Erro Gemini');

        if (
            r.status === 400 &&
            /API key not valid|API_KEY_INVALID/i.test(msg)
        ) {
            throw new IAError(
                'GEMINI_API_KEY inválida. ' +
                    'Revise o secret na Edge Function.',
                500,
            );
        }

        if (r.status === 403) {
            throw new IAError(
                'API do Gemini sem permissão. ' +
                    'Verifique a GEMINI_API_KEY e se a ' +
                    'Generative Language API está ativa.',
                500,
            );
        }

        if (r.status === 404 || /not found|not supported/i.test(msg)) {
            throw new IAError(
                'Modelo ' + principal +
                    ' indisponível para esta chave' +
                    (alternativos.length
                        ? ' (tentei também: ' +
                            alternativos.join(', ') + ')'
                        : '') +
                    '. Defina o secret GEMINI_MODEL com um ' +
                    'modelo válido (ex.: gemini-2.5-flash) ' +
                    'na Edge Function.',
            );
        }

        if (r.status === 429) {
            throw new IAError(
                'Limite de uso da IA atingido. ' +
                    'Aguarde e tente novamente.',
                429,
            );
        }

        throw new IAError('Erro na API do Gemini: ' + msg);
    }

    if (!dados) {
        throw new IAError(
            'A API do Gemini retornou uma resposta vazia ' +
                '(HTTP ' + r.status + '). Tente novamente.',
        );
    }

    const texto = dados.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!texto) {
        const motivo = String(
            dados.candidates?.[0]?.finishReason ||
                dados.promptFeedback?.blockReason ||
                '',
        );

        if (/MAX_TOKENS/i.test(motivo)) {
            throw new IAError(
                'A resposta da IA foi truncada. ' +
                    'Analise um texto menor.',
            );
        }

        if (/SAFETY|BLOCK|RECITATION/i.test(motivo)) {
            throw new IAError(
                'A IA bloqueou a análise deste conteúdo (' +
                    motivo + '). Revise o texto colado.',
            );
        }

        throw new IAError(
            'A IA não retornou conteúdo' +
                (motivo ? ' (' + motivo + ')' : '') + '.',
        );
    }

    const uso = dados.usageMetadata || {};

    return {
        dados: parseJsonIA(String(texto)),
        provedor: 'GEMINI',
        modelo,
        uso: {
            entrada: Number(uso.promptTokenCount) || 0,
            saida: Number(uso.candidatesTokenCount) || 0,
        },
    };
}

// ── Entrada única ───────────────────────────────────────────

// Executa a tarefa na GPT Luna e, em caso de indisponibilidade,
// recorre ao Gemini. Erros de conteúdo (JSON inválido, bloqueio
// de segurança) não disparam o fallback: trocar de provedor não
// resolveria e dobraria o custo.
export async function pensar(
    system: string,
    usuario: string,
    op: OpcoesIA = {},
): Promise<RespostaIA> {
    const luna = chaveLuna();
    const gemini = chaveGemini();

    if (!luna && !gemini) {
        throw new IAError(
            'IA não configurada. Defina o secret LUNA_API_KEY ' +
                '(GPT Luna) na Edge Function.',
            500,
        );
    }

    if (luna) {
        try {
            return await pedirLuna(luna, system, usuario, op);
        } catch (e) {
            const erro = e as IAError;

            const recuperavel = erro instanceof IAError &&
                (erro.status === 429 || erro.status === 504 ||
                    /indisponível|rede|inesperada|não retornou conteúdo/i
                        .test(erro.message));

            if (!gemini || !recuperavel) throw e;

            console.warn(
                '[ia] GPT Luna indisponível (' + erro.message +
                    ') — usando Gemini como contingência.',
            );
        }
    }

    return await pedirGemini(gemini as string, system, usuario, op);
}

// ── Custo ───────────────────────────────────────────────────

// Preço por milhão de tokens, configurável por secret para
// acompanhar a tabela do provedor sem redeploy.
function preco(nome: string, padrao: number): number {
    const v = Number(env(nome));
    return Number.isFinite(v) && v >= 0 ? v : padrao;
}

export function custoUSD(provedor: string, uso: Uso): number {
    const entrada = provedor === 'LUNA'
        ? preco('LUNA_PRECO_ENTRADA_MTOK', 0.15)
        : preco('GEMINI_PRECO_ENTRADA_MTOK', 0.075);

    const saida = provedor === 'LUNA'
        ? preco('LUNA_PRECO_SAIDA_MTOK', 0.6)
        : preco('GEMINI_PRECO_SAIDA_MTOK', 0.3);

    const total = (uso.entrada / 1_000_000) * entrada +
        (uso.saida / 1_000_000) * saida;

    return Math.round(total * 1_000_000) / 1_000_000;
}
