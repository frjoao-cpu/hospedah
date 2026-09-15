// ============================================================
// HOSPEDAH — Edge Function: radar-ia
//
// "A IA entende" e "o Radar seleciona" da Central de
// Monitoramento. Recebe texto (colado no painel ou capturado
// pelo robô em public.radar_capturas), extrai os dados com o
// Gemini, compara com os critérios do ALVO e grava a
// oportunidade em public.radar_oportunidades.
//
// Ações (POST JSON { acao: ... }):
//   analisar_texto      → analisa um texto (padrão; é o que a
//                         UI legada envia sem o campo "acao")
//   processar_pendentes → analisa capturas PENDENTE do robô
//   reavaliar           → reanalisa uma oportunidade existente
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getSupabaseSecretKey } from "../_shared/secret-key.ts";

import {
    Alvo,
    asDate,
    asInt,
    asNum,
    asScore,
    asText,
    Empreendimento,
    normalizar,
    selecionar,
    TIPOS,
} from "../_shared/radar.ts";


const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

const headers = {
    ...cors,
    "Content-Type": "application/json",
};


// Modelo configurável via secret GEMINI_MODEL.
// Padrão: gemini-2.5-flash. Os modelos
// gemini-2.0-flash e gemini-1.5-flash foram
// descontinuados pelo Google e podem retornar
// 404 para chaves/projetos novos.
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";


// Modelos alternativos, tentados em ordem quando o principal
// retorna 404 (indisponível para a chave). Configurável via
// secret GEMINI_FALLBACK_MODELS (separados por vírgula).
const FALLBACK_MODELS = (
    Deno.env.get("GEMINI_FALLBACK_MODELS") ||
    "gemini-2.5-flash-lite," +
        "gemini-2.0-flash," +
        "gemini-1.5-flash"
)
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m && m !== MODEL);


// Timeout da chamada ao Gemini para evitar que a Edge
// Function trave indefinidamente e o browser aborte
// com "Failed to fetch".
const GEMINI_TIMEOUT_MS = 45000;


// Máximo de capturas analisadas em uma chamada de
// processar_pendentes (protege o tempo limite da função).
const LOTE_MAXIMO = 15;


const system = `

Você é o Radar IA da HOSPEDAH,
especialista em multipropriedades,
cotas, semanas, períodos,
cessão, venda e aluguel
de hospedagens.

Extraia SOMENTE informações
presentes no texto.

Nunca invente datas,
valores, capacidade
ou empreendimento.

Se uma informação não estiver clara,
retorne null.

Datas devem ser YYYY-MM-DD
somente quando puderem ser
determinadas com segurança.

Classifique tipo_oportunidade em:

VENDA_COTA
VENDA_PERIODO
ALUGUEL
CESSAO
TROCA
PERMUTA
DISPONIBILIDADE
OUTRO

score_confianca:
0-100 para confiabilidade
dos dados extraídos.

score_oportunidade:
0-100 para potencial comercial
da oportunidade para a HOSPEDAH.

status inicial deve ser:

VALIDAR

Retorne SOMENTE JSON com:

empreendimento,
cidade,
estado,
tipo_oportunidade,
periodo_inicio,
periodo_fim,
numero_semana,
dormitorios,
capacidade_adultos,
capacidade_criancas,
valor_anunciado,
situacao_cota,
propriedade,
nome_anunciante,
contato,
resumo_ia,
score_confianca,
score_oportunidade,
status

`;


// Erro operacional: mensagem já revisada e segura para exibir
// ao usuário final, com o status HTTP adequado. Qualquer erro
// que não seja AppError vira mensagem genérica.
class AppError extends Error {
    status: number;

    constructor(message: string, status = 500) {
        super(message);
        this.name = "AppError";
        this.status = status;
    }
}


// Tabelas criadas pela migration 008 (Central de
// Monitoramento); as demais vêm da 007.
const TABELAS_008 = [
    "radar_alvos",
    "radar_fontes",
    "radar_alvo_fontes",
    "radar_capturas",
    "radar_execucoes",
];

function migrationDe(tabela: string): string {
    return TABELAS_008.includes(tabela)
        ? "supabase/migrations/008_radar_central_monitoramento.sql"
        : "supabase/migrations/007_radar_ia.sql";
}


// Traduz erros do PostgREST/Postgres em mensagens acionáveis
// (a causa mais comum do antigo "Erro interno" era a migration
// não aplicada ou RLS).
function erroBanco(e: unknown, tabela: string): AppError {
    const err = e as { code?: string; message?: string };

    const code = String(err?.code || "");
    const msg = String(err?.message || "");

    const migration = migrationDe(tabela);

    if (
        code === "42P01" ||
        code === "PGRST205" ||
        /does not exist/i.test(msg)
    ) {
        return new AppError(
            "Tabela " + tabela +
                " não encontrada no banco. " +
                "Aplique a migration " + migration + ".",
            500,
        );
    }

    if (code === "42703") {
        return new AppError(
            "Estrutura da tabela " + tabela +
                " desatualizada (coluna ausente). " +
                "Reaplique a migration " + migration + ".",
            500,
        );
    }

    if (
        code === "42501" ||
        code === "PGRST301" ||
        /row-level security|permission denied/i.test(msg)
    ) {
        return new AppError(
            "Sem permissão para gravar em " + tabela +
                " (RLS). Verifique as policies das migrations " +
                "007/008 e o secret SUPABASE_SECRET_KEY da " +
                "Edge Function.",
            500,
        );
    }

    return new AppError(
        "Falha ao gravar no banco (" + tabela + ")" +
            (code ? " — código " + code : "") + ".",
        500,
    );
}


function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers });
}


function parseAiJson(text: string): Record<string, unknown> {
    const cleaned = text
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch {
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");

        try {
            if (start >= 0 && end > start) {
                return JSON.parse(cleaned.slice(start, end + 1));
            }
        } catch {
            // Segue para o erro tratado abaixo.
        }

        throw new AppError(
            "A IA não retornou um JSON válido " +
                "(resposta possivelmente truncada). " +
                "Tente novamente com um texto menor.",
            502,
        );
    }
}


function montarPrompt(
    fonte: string | null,
    url: string | null,
    texto: string,
): string {
    return system +
        "\n\nFONTE: " + (fonte || "Manual") +
        "\nURL: " + (url || "") +
        "\n\nTEXTO:\n" + texto;
}


async function chamarGemini(
    modelUrl: string,
    corpo: string,
): Promise<Response> {
    const ctrl = new AbortController();

    const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);

    try {
        return await fetch(modelUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: corpo,
            signal: ctrl.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}


// Chama o Gemini (com fallback de modelo) e devolve o JSON
// estruturado da IA + o modelo efetivamente usado.
async function entenderComIA(
    chave: string,
    prompt: string,
): Promise<{ ai: Record<string, unknown>; modelo: string }> {
    const geminiUrl = (m: string) =>
        "https://generativelanguage.googleapis.com" +
        "/v1beta/models/" + m +
        ":generateContent?key=" + chave;

    const geminiBody = JSON.stringify({
        contents: [
            {
                role: "user",
                parts: [{ text: prompt }],
            },
        ],
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
        },
    });

    let gr: Response;
    let modeloUsado = MODEL;

    try {
        gr = await chamarGemini(geminiUrl(MODEL), geminiBody);

        // Se o modelo principal estiver indisponível para esta
        // chave (404), tenta os fallbacks em ordem antes de
        // desistir.
        if (gr.status === 404 && FALLBACK_MODELS.length) {
            // Descarta o corpo antes de reusar a conexão.
            await gr.text();

            for (const m of FALLBACK_MODELS) {
                console.warn(
                    "[radar-ia] Modelo " + modeloUsado +
                        " indisponível (404) — tentando " + m,
                );

                gr = await chamarGemini(geminiUrl(m), geminiBody);

                if (gr.status !== 404) {
                    modeloUsado = m;
                    break;
                }

                await gr.text();
            }
        }
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            throw new AppError(
                "A IA demorou demais para responder " +
                    "(timeout). Tente novamente.",
                504,
            );
        }

        throw new AppError(
            "Falha de rede ao chamar a API do Gemini",
            502,
        );
    }

    // O Gemini pode responder com HTML/texto (proxy, 5xx,
    // bloqueio) — nesse caso gr.json() lançaria SyntaxError e
    // viraria "Erro interno". Lemos como texto primeiro.
    const rawGemini = await gr.text().catch(() => "");

    // deno-lint-ignore no-explicit-any
    let gd: any = null;

    try {
        gd = rawGemini ? JSON.parse(rawGemini) : null;
    } catch {
        throw new AppError(
            "A API do Gemini retornou uma resposta inesperada " +
                "(HTTP " + gr.status + "). Tente novamente " +
                "em instantes.",
            502,
        );
    }

    if (!gr.ok) {
        const geminiMsg = String(gd?.error?.message || "Erro Gemini");

        // Mensagens acionáveis para os erros de configuração
        // mais comuns.
        if (
            gr.status === 400 &&
            /API key not valid|API_KEY_INVALID/i.test(geminiMsg)
        ) {
            throw new AppError(
                "GEMINI_API_KEY inválida. " +
                    "Revise o secret na Edge Function.",
                500,
            );
        }

        if (gr.status === 403) {
            throw new AppError(
                "API do Gemini sem permissão. " +
                    "Verifique a GEMINI_API_KEY e se a " +
                    "Generative Language API está ativa.",
                500,
            );
        }

        if (
            gr.status === 404 ||
            /not found|not supported/i.test(geminiMsg)
        ) {
            throw new AppError(
                "Modelo " + MODEL +
                    " indisponível para esta chave" +
                    (FALLBACK_MODELS.length
                        ? " (tentei também: " +
                            FALLBACK_MODELS.join(", ") + ")"
                        : "") +
                    ". Defina o secret GEMINI_MODEL com um " +
                    "modelo válido (ex.: gemini-2.5-flash) " +
                    "na Edge Function.",
                502,
            );
        }

        if (gr.status === 429) {
            throw new AppError(
                "Limite de uso da IA atingido. " +
                    "Aguarde e tente novamente.",
                429,
            );
        }

        throw new AppError(
            "Erro na API do Gemini: " + geminiMsg,
            502,
        );
    }

    if (!gd) {
        throw new AppError(
            "A API do Gemini retornou uma resposta vazia " +
                "(HTTP " + gr.status + "). Tente novamente.",
            502,
        );
    }

    const text = gd.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
        const motivo = String(
            gd.candidates?.[0]?.finishReason ||
                gd.promptFeedback?.blockReason ||
                "",
        );

        if (/MAX_TOKENS/i.test(motivo)) {
            throw new AppError(
                "A resposta da IA foi truncada. " +
                    "Analise um texto menor.",
                502,
            );
        }

        if (/SAFETY|BLOCK|RECITATION/i.test(motivo)) {
            throw new AppError(
                "A IA bloqueou a análise deste conteúdo (" +
                    motivo + "). Revise o texto colado.",
                502,
            );
        }

        throw new AppError(
            "A IA não retornou conteúdo" +
                (motivo ? " (" + motivo + ")" : "") + ".",
            502,
        );
    }

    return { ai: parseAiJson(text), modelo: modeloUsado };
}


type Cliente = ReturnType<typeof createClient>;


async function carregarEmpreendimentos(
    supabase: Cliente,
): Promise<Empreendimento[]> {
    const { data, error } = await supabase
        .from("radar_empreendimentos")
        .select("nome,cidade,estado,aliases")
        .eq("ativo", true);

    // Falha no cadastro auxiliar não deve abortar a análise:
    // apenas segue sem normalizar o nome.
    if (error) {
        console.error("[radar-ia] radar_empreendimentos:", error);
        return [];
    }

    return (data || []) as Empreendimento[];
}


// Normaliza o empreendimento usando o cadastro + aliases.
function normalizarEmpreendimento(
    ai: Record<string, unknown>,
    empreendimentos: Empreendimento[],
) {
    let empreendimento = asText(ai.empreendimento);
    let cidade = asText(ai.cidade);
    let estado = asText(ai.estado);

    if (empreendimento) {
        const alvo = normalizar(empreendimento);

        const match = empreendimentos.find((e) => {
            const nomes = [e.nome, ...(e.aliases || [])];
            return nomes.some((n) => normalizar(n) === alvo);
        });

        if (match) {
            empreendimento = match.nome;
            cidade = cidade || match.cidade || null;
            estado = estado || match.estado || null;
        }
    }

    return { empreendimento, cidade, estado };
}


// Whitelist: só campos que existem na tabela entram no insert.
function montarRegistro(
    ai: Record<string, unknown>,
    ctx: {
        fonte: string | null;
        url: string | null;
        texto: string;
        empreendimento: string | null;
        cidade: string | null;
        estado: string | null;
        alvoId: string | null;
        capturaId: string | null;
        motivo: string | null;
    },
) {
    return {
        fonte: ctx.fonte || "Manual",
        url_original: ctx.url,
        texto_original: ctx.texto,
        empreendimento: ctx.empreendimento,
        cidade: ctx.cidade,
        estado: ctx.estado,
        tipo_oportunidade: TIPOS.includes(String(ai.tipo_oportunidade))
            ? String(ai.tipo_oportunidade)
            : "OUTRO",
        periodo_inicio: asDate(ai.periodo_inicio),
        periodo_fim: asDate(ai.periodo_fim),
        numero_semana: asInt(ai.numero_semana),
        dormitorios: asInt(ai.dormitorios),
        capacidade_adultos: asInt(ai.capacidade_adultos),
        capacidade_criancas: asInt(ai.capacidade_criancas),
        valor_anunciado: asNum(ai.valor_anunciado),
        situacao_cota: asText(ai.situacao_cota),
        propriedade: asText(ai.propriedade),
        nome_anunciante: asText(ai.nome_anunciante),
        contato: asText(ai.contato),
        resumo_ia: asText(ai.resumo_ia),
        score_confianca: asScore(ai.score_confianca),
        score_oportunidade: asScore(ai.score_oportunidade),
        status: "VALIDAR",
        alvo_id: ctx.alvoId,
        captura_id: ctx.capturaId,
        motivo_selecao: ctx.motivo,
        negociacao_status: "NOVA",
    };
}


async function gravarOportunidade(
    supabase: Cliente,
    registro: Record<string, unknown>,
    ai: Record<string, unknown>,
    modelo: string,
) {
    const { data: opp, error: e1 } = await supabase
        .from("radar_oportunidades")
        .insert(registro)
        .select()
        .single();

    if (e1) throw erroBanco(e1, "radar_oportunidades");

    if (!opp?.id) {
        throw new AppError(
            "A oportunidade não pôde ser gravada no banco.",
            500,
        );
    }

    const { error: e2 } = await supabase
        .from("radar_analises")
        .insert({
            oportunidade_id: opp.id,
            modelo,
            prompt_version: "1.2",
            resultado: ai,
        });

    if (e2) console.error(e2);

    return opp;
}


async function carregarAlvo(
    supabase: Cliente,
    alvoId: string | null,
): Promise<Alvo | null> {
    if (!alvoId) return null;

    const { data, error } = await supabase
        .from("radar_alvos")
        .select("*")
        .eq("id", alvoId)
        .maybeSingle();

    if (error) {
        console.error("[radar-ia] radar_alvos:", error);
        return null;
    }

    return (data as Alvo) || null;
}


// Best-effort: se a migration 008 ainda não foi aplicada, a
// análise manual continua funcionando sem captura.
async function registrarCapturaManual(
    supabase: Cliente,
    dados: {
        fonte: string | null;
        url: string | null;
        texto: string;
        alvoId: string | null;
    },
): Promise<string | null> {
    const { data: fonte } = await supabase
        .from("radar_fontes")
        .select("id")
        .eq("tipo", "MANUAL")
        .eq("ativo", true)
        .limit(1)
        .maybeSingle();

    const { data, error } = await supabase
        .from("radar_capturas")
        .insert({
            fonte_id: fonte?.id ?? null,
            alvo_id: dados.alvoId,
            texto: dados.texto,
            permalink: dados.url,
            estado: "PENDENTE",
            payload: { origem: "MANUAL", fonte: dados.fonte },
        })
        .select("id")
        .single();

    if (error) {
        console.error("[radar-ia] radar_capturas:", error);
        return null;
    }

    return (data?.id as string) ?? null;
}


async function atualizarCaptura(
    supabase: Cliente,
    capturaId: string | null,
    campos: Record<string, unknown>,
) {
    if (!capturaId) return;

    const { error } = await supabase
        .from("radar_capturas")
        .update(campos)
        .eq("id", capturaId);

    if (error) console.error("[radar-ia] captura:", error);
}


// Analisa um texto, aplica a seleção do alvo e grava a
// oportunidade quando aprovada.
async function processarTexto(
    supabase: Cliente,
    chave: string,
    empreendimentos: Empreendimento[],
    entrada: {
        fonte: string | null;
        url: string | null;
        texto: string;
        alvo: Alvo | null;
        capturaId: string | null;
    },
) {
    const { ai, modelo } = await entenderComIA(
        chave,
        montarPrompt(entrada.fonte, entrada.url, entrada.texto),
    );

    const local = normalizarEmpreendimento(ai, empreendimentos);

    const selecao = selecionar(ai, entrada.alvo);

    if (!selecao.aprovado) {
        await atualizarCaptura(supabase, entrada.capturaId, {
            estado: "DESCARTADO",
            motivo: selecao.motivo,
        });

        return { ai, modelo, selecao, oportunidade: null };
    }

    const registro = montarRegistro(ai, {
        fonte: entrada.fonte,
        url: entrada.url,
        texto: entrada.texto,
        empreendimento: local.empreendimento,
        cidade: local.cidade,
        estado: local.estado,
        alvoId: entrada.alvo?.id ?? null,
        capturaId: entrada.capturaId,
        motivo: selecao.motivo,
    });

    const oportunidade = await gravarOportunidade(
        supabase,
        registro,
        ai,
        modelo,
    );

    await atualizarCaptura(supabase, entrada.capturaId, {
        estado: "ANALISADO",
        motivo: selecao.motivo,
        oportunidade_id: oportunidade.id,
        erro: null,
    });

    return { ai, modelo, selecao, oportunidade };
}


Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: cors });
    }

    // Id curto de rastreio: aparece no log da função e na
    // resposta, permitindo correlacionar o erro visto pelo
    // usuário com o stack trace real.
    const traceId = crypto.randomUUID().slice(0, 8);

    try {
        const auth = req.headers.get("Authorization");

        if (!auth) {
            return json({ error: "Não autenticado" }, 401);
        }

        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

        // Chave legada SUPABASE_SERVICE_ROLE_KEY descontinuada:
        // usa SUPABASE_SECRET_KEYS (JWT Signing Keys) com
        // fallback legado.
        const SERVICE = getSupabaseSecretKey();

        if (!SUPABASE_URL || !SERVICE) {
            return json({
                error: "Edge Function sem credenciais do Supabase. " +
                    "Defina os secrets SUPABASE_URL e " +
                    "SUPABASE_SECRET_KEY.",
            }, 500);
        }

        const GEMINI = Deno.env.get("GEMINI_API_KEY");

        if (!GEMINI) {
            return json({
                error: "IA não configurada. Defina o secret " +
                    "GEMINI_API_KEY na Edge Function.",
            }, 500);
        }

        const supabase = createClient(SUPABASE_URL, SERVICE);

        const jwt = auth.replace(/^Bearer\s+/i, "").trim();

        // O pg_cron chama com a chave de serviço; o painel
        // chama com o token do usuário autenticado.
        const robo = jwt === SERVICE;

        if (!robo) {
            // Valida o token do usuário antes de qualquer
            // operação.
            const { data: userData, error: authError } = await supabase.auth
                .getUser(jwt)
                .catch(() => ({
                    data: null,
                    error: { message: "network" },
                })) as {
                    data: { user?: unknown } | null;
                    error: { message?: string } | null;
                };

            if (authError || !userData?.user) {
                return json(
                    { error: "Sessão inválida ou expirada" },
                    401,
                );
            }
        }

        const body = await req.json().catch(() => null);

        if (!body || typeof body !== "object") {
            return json({
                error: "Corpo da requisição inválido (esperado JSON)",
            }, 400);
        }

        const acao = asText(body.acao) || "analisar_texto";

        const empreendimentos = await carregarEmpreendimentos(supabase);

        // ── processar_pendentes ─────────────────────────────
        if (acao === "processar_pendentes") {
            const limite = Math.min(
                LOTE_MAXIMO,
                Math.max(1, asInt(body.limite) ?? 5),
            );

            let q = supabase
                .from("radar_capturas")
                .select("*")
                .eq("estado", "PENDENTE")
                .order("capturado_em", { ascending: true })
                .limit(limite);

            const alvoFiltro = asText(body.alvo_id);

            if (alvoFiltro) q = q.eq("alvo_id", alvoFiltro);

            const { data: capturas, error: eCap } = await q;

            if (eCap) throw erroBanco(eCap, "radar_capturas");

            // Nome da fonte de cada captura (usado como "fonte"
            // da oportunidade e no prompt da IA).
            const { data: fontes } = await supabase
                .from("radar_fontes")
                .select("id,nome");

            const nomeFonte = new Map<string, string>(
                ((fontes || []) as { id: string; nome: string }[])
                    .map((f) => [f.id, f.nome]),
            );

            const iniciadoEm = new Date().toISOString();

            let analisados = 0;
            let aprovados = 0;
            let descartados = 0;
            let falhas = 0;

            const detalhes: Record<string, unknown>[] = [];

            // Cache de alvos para não recarregar a cada captura.
            const alvos = new Map<string, Alvo | null>();

            for (const captura of (capturas || [])) {
                const alvoId = (captura.alvo_id as string) || null;

                if (alvoId && !alvos.has(alvoId)) {
                    alvos.set(alvoId, await carregarAlvo(supabase, alvoId));
                }

                try {
                    const r = await processarTexto(
                        supabase,
                        GEMINI,
                        empreendimentos,
                        {
                            fonte: nomeFonte.get(
                                String(captura.fonte_id || ""),
                            ) || "Robô",
                            url: asText(captura.permalink),
                            texto: String(captura.texto || ""),
                            alvo: alvoId ? alvos.get(alvoId) ?? null : null,
                            capturaId: captura.id as string,
                        },
                    );

                    analisados++;

                    if (r.oportunidade) aprovados++;
                    else descartados++;

                    detalhes.push({
                        captura_id: captura.id,
                        selecionada: !!r.oportunidade,
                        motivo: r.selecao.motivo,
                    });
                } catch (e) {
                    // Erros por captura são isolados: uma falha
                    // não aborta o lote.
                    falhas++;

                    const msg = e instanceof AppError
                        ? e.message
                        : "Falha inesperada ao analisar a captura.";

                    console.error("[radar-ia]", traceId, captura.id, e);

                    await atualizarCaptura(supabase, captura.id as string, {
                        estado: "ERRO",
                        erro: msg,
                    });

                    detalhes.push({
                        captura_id: captura.id,
                        erro: msg,
                    });
                }
            }

            const { error: eExec } = await supabase
                .from("radar_execucoes")
                .insert({
                    origem: "ANALISE",
                    iniciado_em: iniciadoEm,
                    finalizado_em: new Date().toISOString(),
                    analisados,
                    aprovados,
                    descartados,
                    status: falhas
                        ? (analisados ? "PARCIAL" : "ERRO")
                        : "OK",
                    erro: falhas ? falhas + " captura(s) com erro." : null,
                    trace_id: traceId,
                });

            if (eExec) console.error("[radar-ia] execucao:", eExec);

            return json({
                ok: true,
                pendentes_lidas: (capturas || []).length,
                analisados,
                aprovados,
                descartados,
                falhas,
                detalhes,
                trace_id: traceId,
            });
        }

        // ── reavaliar ───────────────────────────────────────
        if (acao === "reavaliar") {
            const id = asText(body.oportunidade_id);

            if (!id) {
                return json(
                    { error: "oportunidade_id é obrigatório" },
                    400,
                );
            }

            const { data: atual, error: eOpp } = await supabase
                .from("radar_oportunidades")
                .select("*")
                .eq("id", id)
                .maybeSingle();

            if (eOpp) throw erroBanco(eOpp, "radar_oportunidades");

            if (!atual) {
                return json(
                    { error: "Oportunidade não encontrada" },
                    404,
                );
            }

            const { ai, modelo } = await entenderComIA(
                GEMINI,
                montarPrompt(
                    asText(atual.fonte),
                    asText(atual.url_original),
                    String(atual.texto_original || ""),
                ),
            );

            const local = normalizarEmpreendimento(ai, empreendimentos);

            const alvo = await carregarAlvo(
                supabase,
                asText(body.alvo_id) ||
                    (atual.alvo_id as string | null),
            );

            const selecao = selecionar(ai, alvo);

            const registro = montarRegistro(ai, {
                fonte: asText(atual.fonte),
                url: asText(atual.url_original),
                texto: String(atual.texto_original || ""),
                empreendimento: local.empreendimento,
                cidade: local.cidade,
                estado: local.estado,
                alvoId: alvo?.id ?? null,
                capturaId: (atual.captura_id as string | null) ?? null,
                motivo: selecao.motivo,
            }) as Record<string, unknown>;

            // Reavaliação não reabre o funil: preserva o status
            // de triagem e de negociação já definidos.
            delete registro.status;
            delete registro.negociacao_status;

            const { data: opp, error: eUp } = await supabase
                .from("radar_oportunidades")
                .update(registro)
                .eq("id", id)
                .select()
                .single();

            if (eUp) throw erroBanco(eUp, "radar_oportunidades");

            const { error: eAn } = await supabase
                .from("radar_analises")
                .insert({
                    oportunidade_id: id,
                    modelo,
                    prompt_version: "1.2",
                    resultado: ai,
                });

            if (eAn) console.error(eAn);

            return json({
                ok: true,
                oportunidade: opp,
                selecao,
            });
        }

        // ── analisar_texto (padrão, compatível com a UI) ────
        if (acao !== "analisar_texto") {
            return json({ error: "Ação desconhecida: " + acao }, 400);
        }

        const texto = asText(body.texto_original);

        if (!texto) {
            return json(
                { error: "texto_original é obrigatório" },
                400,
            );
        }

        const fonte = asText(body.fonte);
        const url = asText(body.url_original);
        const alvo = await carregarAlvo(supabase, asText(body.alvo_id));

        // A análise manual também passa pela camada de captura,
        // unificando o pipeline do robô e o do operador.
        const capturaId = asText(body.captura_id) ??
            await registrarCapturaManual(supabase, {
                fonte,
                url,
                texto,
                alvoId: alvo?.id ?? null,
            });

        const r = await processarTexto(supabase, GEMINI, empreendimentos, {
            fonte,
            url,
            texto,
            alvo,
            capturaId,
        });

        if (!r.oportunidade) {
            return json({
                ok: true,
                selecionada: false,
                motivo: r.selecao.motivo,
                analise: r.ai,
                captura_id: capturaId,
            });
        }

        return json({
            ok: true,
            selecionada: true,
            motivo: r.selecao.motivo,
            oportunidade: r.oportunidade,
            captura_id: capturaId,
        });
    } catch (e) {
        console.error("[radar-ia]", traceId, e);

        if (e instanceof AppError) {
            return json(
                { error: e.message, trace_id: traceId },
                e.status,
            );
        }

        // Erros inesperados não expõem detalhes internos
        // ao cliente.
        return json({
            error: "Erro interno ao processar a análise (ref. " +
                traceId + "). Consulte os logs da Edge Function " +
                "radar-ia no Supabase.",
            trace_id: traceId,
        }, 500);
    }
});
