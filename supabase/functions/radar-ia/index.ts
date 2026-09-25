// ============================================================
// HOSPEDAH — Edge Function: radar-ia
//
// "A IA entende" e "o Radar seleciona" da Central de
// Monitoramento. Recebe texto (colado no painel ou capturado
// pelo robô em public.radar_capturas), extrai os dados com a
// GPT Luna (Gemini fica como contingência), compara com os
// critérios do ALVO e grava a oportunidade em
// public.radar_oportunidades.
//
// Além da extração, a função agora:
//   • reaproveita análises pelo hash do texto (cache);
//   • funde anúncios repetidos em uma única oportunidade;
//   • compara o valor com o histórico da própria HOSPEDAH;
//   • classifica urgência do vendedor e risco de fraude;
//   • alerta o time por WhatsApp/e-mail nos casos quentes;
//   • registra tokens e custo de cada chamada.
//
// Ações (POST JSON { acao: ... }):
//   analisar_texto      → analisa um texto (padrão; é o que a
//                         UI legada envia sem o campo "acao")
//   processar_pendentes → analisa capturas PENDENTE do robô
//   reavaliar           → reanalisa uma oportunidade existente
//   rascunho_abordagem  → gera a mensagem de abordagem
//   registrar_desfecho  → grava o resultado da negociação
//   saude               → fila, custo de IA e alertas recentes
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
    getSupabaseSecretKey,
    isSupabaseSecretKey,
} from "../_shared/secret-key.ts";

import {
    custoUSD,
    iaConfigurada,
    IAError,
    pensar,
    RespostaIA,
} from "../_shared/ia.ts";

import {
    acharDuplicada,
    ajustarScore,
    Alvo,
    asDate,
    asInt,
    asNum,
    asRisco,
    asScore,
    asText,
    asUrgencia,
    descontoPercentual,
    Empreendimento,
    hashTexto,
    impressaoDigital,
    MAX_TENTATIVAS,
    normalizar,
    proximaTentativa,
    Referencia,
    referenciaDePreco,
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


// Máximo de capturas analisadas em uma chamada de
// processar_pendentes (protege o tempo limite da função).
const LOTE_MAXIMO = 15;


const PROMPT_VERSAO = "2.0";


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

urgencia:
BAIXA, MEDIA, ALTA ou IMEDIATA,
conforme a pressa demonstrada pelo
anunciante (repasse urgente, dívida,
prazo curto, "aceito oferta").

risco_fraude:
BAIXO, MEDIO ou ALTO.
Considere ALTO quando houver pedido
de depósito antecipado, contato
evasivo, preço irreal ou promessa
incompatível com multipropriedade.

sinais_fraude:
lista curta dos trechos que
justificam o risco. Vazia quando
o risco for BAIXO.

status inicial deve ser:

VALIDAR

Retorne SOMENTE JSON no formato pedido.

`;


// Saída estruturada: o provedor devolve exatamente estes
// campos, eliminando o parse frágil de texto livre.
const ESQUEMA_ANALISE = {
    type: "object",
    properties: {
        empreendimento: { type: ["string", "null"] },
        cidade: { type: ["string", "null"] },
        estado: { type: ["string", "null"] },
        tipo_oportunidade: { type: "string", enum: TIPOS },
        periodo_inicio: { type: ["string", "null"] },
        periodo_fim: { type: ["string", "null"] },
        numero_semana: { type: ["integer", "null"] },
        dormitorios: { type: ["integer", "null"] },
        capacidade_adultos: { type: ["integer", "null"] },
        capacidade_criancas: { type: ["integer", "null"] },
        valor_anunciado: { type: ["number", "null"] },
        situacao_cota: { type: ["string", "null"] },
        propriedade: { type: ["string", "null"] },
        nome_anunciante: { type: ["string", "null"] },
        contato: { type: ["string", "null"] },
        resumo_ia: { type: ["string", "null"] },
        score_confianca: { type: "integer" },
        score_oportunidade: { type: "integer" },
        urgencia: {
            type: "string",
            enum: ["BAIXA", "MEDIA", "ALTA", "IMEDIATA"],
        },
        risco_fraude: {
            type: "string",
            enum: ["BAIXO", "MEDIO", "ALTO"],
        },
        sinais_fraude: {
            type: "array",
            items: { type: "string" },
        },
        status: { type: "string" },
    },
    required: [
        "tipo_oportunidade",
        "score_confianca",
        "score_oportunidade",
    ],
} as Record<string, unknown>;


// Prompt da mensagem de abordagem: a IA escreve, o operador
// revisa e envia. Nunca inventa condição comercial.
const systemAbordagem = `

Você é consultor da HOSPEDAH e escreve
a primeira mensagem para o anunciante
de uma multipropriedade.

Regras:
- português do Brasil, tom cordial e direto;
- no máximo 700 caracteres;
- cite apenas dados presentes na oportunidade;
- nunca prometa valor, prazo ou condição
  que não esteja no contexto;
- termine com uma pergunta objetiva;
- não use emoji em excesso (máximo um).

Retorne JSON com:
mensagem (texto pronto para envio),
canal_sugerido (WHATSAPP, EMAIL ou COMENTARIO),
pontos_de_atencao (lista curta).

`;


const ESQUEMA_ABORDAGEM = {
    type: "object",
    properties: {
        mensagem: { type: "string" },
        canal_sugerido: {
            type: "string",
            enum: ["WHATSAPP", "EMAIL", "COMENTARIO"],
        },
        pontos_de_atencao: {
            type: "array",
            items: { type: "string" },
        },
    },
    required: ["mensagem"],
} as Record<string, unknown>;



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


// Tabelas criadas pela migration 010 (inteligência).
const TABELAS_010 = [
    "radar_analise_cache",
    "radar_ia_uso",
    "radar_alertas",
];

function migrationDe(tabela: string): string {
    if (TABELAS_010.includes(tabela)) {
        return "supabase/migrations/010_radar_inteligencia.sql";
    }

    return TABELAS_008.includes(tabela)
        ? "supabase/migrations/008_radar_central_monitoramento.sql"
        : "supabase/migrations/007_radar_ia.sql";
}


// Colunas adicionadas pela migration 008 em
// radar_oportunidades. Se o banco ainda está na 007 (ou o
// schema cache do PostgREST não foi recarregado), a gravação
// é refeita sem elas em vez de falhar a análise inteira.
const COLUNAS_008_OPORTUNIDADES = [
    "alvo_id",
    "captura_id",
    "motivo_selecao",
    "negociacao_status",
];


// Colunas adicionadas pela migration 010. Mesma estratégia:
// o banco antigo continua recebendo a oportunidade, só sem
// os campos de inteligência.
const COLUNAS_010_OPORTUNIDADES = [
    "hash_texto",
    "impressao_digital",
    "duplicada_de",
    "ocorrencias",
    "urgencia",
    "risco_fraude",
    "sinais_fraude",
    "valor_referencia",
    "desconto_pct",
    "score_base",
    "fechado_em",
    "valor_fechado",
    "motivo_desfecho",
    "alertado_em",
];


// PGRST204: "Could not find the 'x' column of 'y' in the
// schema cache". 42703: 'column "x" of relation "y" does not
// exist'.
function ehColunaAusente(e: unknown): boolean {
    const err = e as { code?: string; message?: string };

    const code = String(err?.code || "");
    const msg = String(err?.message || "");

    return code === "42703" ||
        code === "PGRST204" ||
        /could not find the .+ column/i.test(msg) ||
        /column .+ does not exist/i.test(msg);
}


function colunaAusente(msg: string): string | null {
    const m = msg.match(/'([^']+)' column/i) ||
        msg.match(/column "([^"]+)"/i);

    return m ? m[1] : null;
}


// Cópia do registro sem as colunas das migrations 008/010.
function semColunasNovas(
    registro: Record<string, unknown>,
    colunas: string[] = [
        ...COLUNAS_008_OPORTUNIDADES,
        ...COLUNAS_010_OPORTUNIDADES,
    ],
): Record<string, unknown> {
    const copia = { ...registro };

    for (const coluna of colunas) {
        delete copia[coluna];
    }

    return copia;
}


// Só as colunas da 010: quando apenas a inteligência está
// faltando, as colunas da 008 continuam sendo gravadas.
function semColunas010(
    registro: Record<string, unknown>,
): Record<string, unknown> {
    return semColunasNovas(registro, COLUNAS_010_OPORTUNIDADES);
}


// Traduz erros do PostgREST/Postgres em mensagens acionáveis
// (a causa mais comum do antigo "Erro interno" era a migration
// não aplicada ou RLS).
function erroBanco(e: unknown, tabela: string): AppError {
    const err = e as { code?: string; message?: string };

    const code = String(err?.code || "");
    const msg = String(err?.message || "");

    const migration = migrationDe(tabela);

    // A checagem de coluna vem antes da de tabela: o erro 42703
    // ("column ... does not exist") também casa com /does not
    // exist/ e cairia na mensagem errada.
    if (ehColunaAusente(e)) {
        const coluna = colunaAusente(msg);

        return new AppError(
            "Estrutura da tabela " + tabela +
                " desatualizada" +
                (coluna ? " (coluna " + coluna + " ausente)" :
                    " (coluna ausente)") +
                ". Reaplique a migration " + migration +
                " e recarregue o schema cache do PostgREST " +
                "(notify pgrst, 'reload schema').",
            500,
        );
    }

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


function montarPrompt(
    fonte: string | null,
    url: string | null,
    texto: string,
    contexto: string | null = null,
): string {
    return "FONTE: " + (fonte || "Manual") +
        "\nURL: " + (url || "") +
        (contexto ? "\n\n" + contexto : "") +
        "\n\nTEXTO:\n" + texto;
}


// Converte o erro do cliente de IA no erro operacional da
// função, preservando o status e a mensagem já revisada.
function erroIA(e: unknown): AppError {
    if (e instanceof IAError) return new AppError(e.message, e.status);

    if (e instanceof AppError) return e;

    return new AppError("Falha inesperada ao consultar a IA.", 502);
}


// Chama a IA (GPT Luna, com Gemini de contingência) exigindo
// a saída estruturada da análise.
async function entenderComIA(prompt: string): Promise<RespostaIA> {
    try {
        return await pensar(system, prompt, {
            schema: ESQUEMA_ANALISE,
            schemaNome: "analise_radar",
        });
    } catch (e) {
        throw erroIA(e);
    }
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
        hash: string | null;
        impressao: string | null;
        duplicadaDe: string | null;
        referencia: Referencia | null;
        desconto: number | null;
        score: number | null;
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
        score_oportunidade: ctx.score ?? asScore(ai.score_oportunidade),
        status: "VALIDAR",
        alvo_id: ctx.alvoId,
        captura_id: ctx.capturaId,
        motivo_selecao: ctx.motivo,
        negociacao_status: "NOVA",
        hash_texto: ctx.hash,
        impressao_digital: ctx.impressao,
        duplicada_de: ctx.duplicadaDe,
        urgencia: asUrgencia(ai.urgencia),
        risco_fraude: asRisco(ai.risco_fraude),
        sinais_fraude: Array.isArray(ai.sinais_fraude)
            ? ai.sinais_fraude.slice(0, 5)
            : null,
        valor_referencia: ctx.referencia?.valor ?? null,
        desconto_pct: ctx.desconto,
        score_base: asScore(ai.score_oportunidade),
    };
}


async function gravarOportunidade(
    supabase: Cliente,
    registro: Record<string, unknown>,
    ai: Record<string, unknown>,
    ia: { provedor: string; modelo: string },
) {
    let { data: opp, error: e1 } = await supabase
        .from("radar_oportunidades")
        .insert(registro)
        .select()
        .single();

    // Banco ainda sem as colunas da 010: tenta de novo apenas
    // sem os campos de inteligência.
    if (e1 && ehColunaAusente(e1)) {
        console.error(
            "[radar-ia] coluna ausente em radar_oportunidades:",
            e1,
        );

        ({ data: opp, error: e1 } = await supabase
            .from("radar_oportunidades")
            .insert(semColunas010(registro))
            .select()
            .single());
    }

    // Ainda falha: banco na 007. Grava o essencial em vez de
    // perder a análise já paga à IA.
    if (e1 && ehColunaAusente(e1)) {
        ({ data: opp, error: e1 } = await supabase
            .from("radar_oportunidades")
            .insert(semColunasNovas(registro))
            .select()
            .single());
    }

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
            modelo: ia.provedor + ":" + ia.modelo,
            prompt_version: PROMPT_VERSAO,
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


// ── Cache de análise ────────────────────────────────────────

// Texto já analisado antes (mesmo hash) não volta para a IA:
// o resultado guardado é reaproveitado. Falha no cache nunca
// interrompe a análise — apenas paga a IA de novo.
async function lerCache(
    supabase: Cliente,
    hash: string,
): Promise<RespostaIA | null> {
    const { data, error } = await supabase
        .from("radar_analise_cache")
        .select("resultado,provedor,modelo,hits")
        .eq("hash_texto", hash)
        .maybeSingle();

    if (error || !data?.resultado) {
        if (error) console.error("[radar-ia] cache:", error);
        return null;
    }

    await supabase
        .from("radar_analise_cache")
        .update({
            hits: (asInt(data.hits) ?? 0) + 1,
            usado_em: new Date().toISOString(),
        })
        .eq("hash_texto", hash);

    return {
        dados: data.resultado as Record<string, unknown>,
        provedor: (asText(data.provedor) || "LUNA") as "LUNA" | "GEMINI",
        modelo: asText(data.modelo) || "cache",
        uso: { entrada: 0, saida: 0 },
    };
}


async function gravarCache(
    supabase: Cliente,
    hash: string,
    r: RespostaIA,
) {
    const { error } = await supabase
        .from("radar_analise_cache")
        .upsert({
            hash_texto: hash,
            resultado: r.dados,
            provedor: r.provedor,
            modelo: r.modelo,
            usado_em: new Date().toISOString(),
        }, { onConflict: "hash_texto" });

    if (error) console.error("[radar-ia] cache:", error);
}


// ── Custo ───────────────────────────────────────────────────

async function registrarUso(
    supabase: Cliente,
    dados: {
        acao: string;
        ia: RespostaIA;
        cache: boolean;
        oportunidadeId?: string | null;
        traceId: string;
    },
) {
    const { error } = await supabase
        .from("radar_ia_uso")
        .insert({
            acao: dados.acao,
            provedor: dados.ia.provedor,
            modelo: dados.ia.modelo,
            tokens_entrada: dados.ia.uso.entrada,
            tokens_saida: dados.ia.uso.saida,
            custo_usd: dados.cache
                ? 0
                : custoUSD(dados.ia.provedor, dados.ia.uso),
            cache: dados.cache,
            oportunidade_id: dados.oportunidadeId ?? null,
            trace_id: dados.traceId,
        });

    if (error) console.error("[radar-ia] uso:", error);
}


// ── RAG de preços sobre a base da própria HOSPEDAH ──────────

// Mediana já praticada para o mesmo empreendimento e tipo de
// negócio. Vira contexto do prompt e base do ajuste de score.
async function referenciaDoHistorico(
    supabase: Cliente,
    empreendimento: string | null,
    tipo: string | null,
): Promise<Referencia | null> {
    if (!empreendimento) return null;

    let q = supabase
        .from("radar_oportunidades")
        .select("valor_anunciado")
        .eq("empreendimento", empreendimento)
        .not("valor_anunciado", "is", null)
        .order("criado_em", { ascending: false })
        .limit(60);

    if (tipo) q = q.eq("tipo_oportunidade", tipo);

    const { data, error } = await q;

    if (error) {
        console.error("[radar-ia] historico:", error);
        return null;
    }

    return referenciaDePreco(
        (data || []) as { valor_anunciado?: number | null }[],
    );
}


// ── Dedupe semântico ────────────────────────────────────────

// Mesmo negócio anunciado em fontes diferentes vira UMA
// oportunidade: a repetição só incrementa o contador.
async function procurarDuplicada(
    supabase: Cliente,
    novo: {
        texto: string;
        hash: string;
        contato: string | null;
        empreendimento: string | null;
    },
) {
    // 1. Idêntica (mesmo hash) — atalho barato.
    const { data: iguais } = await supabase
        .from("radar_oportunidades")
        .select("id")
        .eq("hash_texto", novo.hash)
        .limit(1);

    if (iguais?.length) {
        return {
            id: iguais[0].id as string,
            similaridade: 1,
            motivo: "Texto idêntico a uma oportunidade já registrada.",
        };
    }

    // 2. Semelhante entre as recentes do mesmo empreendimento.
    const desde = new Date(Date.now() - 90 * 86400000).toISOString();

    let q = supabase
        .from("radar_oportunidades")
        .select(
            "id,impressao_digital,texto_original,contato," +
                "empreendimento,valor_anunciado",
        )
        .gte("criado_em", desde)
        .order("criado_em", { ascending: false })
        .limit(200);

    if (novo.empreendimento) {
        q = q.eq("empreendimento", novo.empreendimento);
    }

    const { data, error } = await q;

    if (error) {
        console.error("[radar-ia] dedupe:", error);
        return null;
    }

    return acharDuplicada(novo, (data || []) as never);
}


async function contabilizarRepeticao(
    supabase: Cliente,
    id: string,
) {
    const { data } = await supabase
        .from("radar_oportunidades")
        .select("ocorrencias")
        .eq("id", id)
        .maybeSingle();

    const { error } = await supabase
        .from("radar_oportunidades")
        .update({ ocorrencias: (asInt(data?.ocorrencias) ?? 1) + 1 })
        .eq("id", id);

    if (error) console.error("[radar-ia] ocorrencias:", error);
}


// ── Alertas ─────────────────────────────────────────────────

// Score a partir do qual o time é avisado na hora.
function scoreAlerta(): number {
    return asInt(Deno.env.get("RADAR_ALERTA_SCORE")) ?? 80;
}


function textoAlerta(o: Record<string, unknown>): string {
    const partes = [
        "🎯 HOSPEDAH Radar IA — oportunidade quente",
        "",
        asText(o.empreendimento) || "Empreendimento não identificado",
        "Tipo: " + (asText(o.tipo_oportunidade) || "OUTRO"),
        "Score: " + (asInt(o.score_oportunidade) ?? 0),
    ];

    const valor = asNum(o.valor_anunciado);

    if (valor !== null) {
        partes.push("Valor: R$ " + valor.toLocaleString("pt-BR"));
    }

    const desconto = asNum(o.desconto_pct);

    if (desconto !== null && desconto > 0) {
        partes.push(
            "Desconto sobre o praticado: " +
                Math.round(desconto) + "%",
        );
    }

    const urgencia = asText(o.urgencia);
    if (urgencia) partes.push("Urgência: " + urgencia);

    const risco = asText(o.risco_fraude);
    if (risco && risco !== "BAIXO") partes.push("⚠️ Risco: " + risco);

    const contato = asText(o.contato);
    if (contato) partes.push("Contato: " + contato);

    const resumo = asText(o.resumo_ia);
    if (resumo) partes.push("", resumo);

    return partes.join("\n");
}


// Envia o alerta por WhatsApp (Z-API) e e-mail (Resend),
// registrando o resultado de cada canal. Nunca derruba a
// análise: alerta é efeito colateral, não requisito.
async function alertar(
    supabase: Cliente,
    oportunidade: Record<string, unknown>,
) {
    const score = asInt(oportunidade.score_oportunidade) ?? 0;

    if (score < scoreAlerta()) return { enviados: [] as string[] };

    // Oportunidade de risco alto não vira alerta: entra na
    // fila de validação manual.
    if (asText(oportunidade.risco_fraude) === "ALTO") {
        return { enviados: [] as string[] };
    }

    const mensagem = textoAlerta(oportunidade);
    const enviados: string[] = [];

    const zapiId = Deno.env.get("ZAPI_INSTANCE_ID");
    const zapiToken = Deno.env.get("ZAPI_TOKEN");
    const zapiClient = Deno.env.get("ZAPI_CLIENT_TOKEN");

    const destinoWhats = Deno.env.get("RADAR_ALERTA_WHATSAPP") ||
        Deno.env.get("WHATSAPP_ADMIN_NUMBER");

    if (zapiId && zapiToken && destinoWhats) {
        const cabecalhos: Record<string, string> = {
            "Content-Type": "application/json",
        };

        if (zapiClient) cabecalhos["Client-Token"] = zapiClient;

        try {
            const r = await fetch(
                "https://api.z-api.io/instances/" + zapiId +
                    "/token/" + zapiToken + "/send-text",
                {
                    method: "POST",
                    headers: cabecalhos,
                    body: JSON.stringify({
                        phone: destinoWhats,
                        message: mensagem,
                    }),
                },
            );

            await supabase.from("radar_alertas").insert({
                oportunidade_id: oportunidade.id,
                canal: "WHATSAPP",
                destino: destinoWhats,
                status: r.ok ? "ENVIADO" : "ERRO",
                erro: r.ok ? null : "HTTP " + r.status,
            });

            if (r.ok) enviados.push("whatsapp");
        } catch (e) {
            console.error("[radar-ia] alerta whatsapp:", e);
        }
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    const destinoEmail = Deno.env.get("RADAR_ALERTA_EMAIL");

    if (resendKey && destinoEmail) {
        try {
            const r = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer " + resendKey,
                },
                body: JSON.stringify({
                    from: Deno.env.get("RESEND_FROM") ||
                        "HOSPEDAH <noreply@hospedah.tur.br>",
                    to: destinoEmail.split(",").map((e) => e.trim()),
                    subject: "Radar IA — oportunidade score " + score,
                    text: mensagem,
                }),
            });

            await supabase.from("radar_alertas").insert({
                oportunidade_id: oportunidade.id,
                canal: "EMAIL",
                destino: destinoEmail,
                status: r.ok ? "ENVIADO" : "ERRO",
                erro: r.ok ? null : "HTTP " + r.status,
            });

            if (r.ok) enviados.push("email");
        } catch (e) {
            console.error("[radar-ia] alerta email:", e);
        }
    }

    if (enviados.length) {
        await supabase
            .from("radar_oportunidades")
            .update({ alertado_em: new Date().toISOString() })
            .eq("id", oportunidade.id);
    }

    return { enviados };
}


// Analisa um texto, aplica a seleção do alvo e grava a
// oportunidade quando aprovada.
async function processarTexto(
    supabase: Cliente,
    empreendimentos: Empreendimento[],
    entrada: {
        fonte: string | null;
        url: string | null;
        texto: string;
        alvo: Alvo | null;
        capturaId: string | null;
        traceId: string;
    },
) {
    const hash = await hashTexto(entrada.texto);

    const cacheado = await lerCache(supabase, hash);

    const ia = cacheado ??
        await entenderComIA(
            montarPrompt(entrada.fonte, entrada.url, entrada.texto),
        );

    if (!cacheado) await gravarCache(supabase, hash, ia);

    await registrarUso(supabase, {
        acao: "analise",
        ia,
        cache: !!cacheado,
        traceId: entrada.traceId,
    });

    const ai = ia.dados;

    const local = normalizarEmpreendimento(ai, empreendimentos);

    const selecao = selecionar(ai, entrada.alvo);

    if (!selecao.aprovado) {
        await atualizarCaptura(supabase, entrada.capturaId, {
            estado: "DESCARTADO",
            motivo: selecao.motivo,
        });

        return { ai, ia, selecao, oportunidade: null, duplicada: null };
    }

    // Mesmo negócio já registrado: conta a repetição e não
    // duplica a oportunidade no funil.
    const duplicada = await procurarDuplicada(supabase, {
        texto: entrada.texto,
        hash,
        contato: asText(ai.contato),
        empreendimento: local.empreendimento,
    });

    if (duplicada) {
        await contabilizarRepeticao(supabase, duplicada.id);

        await atualizarCaptura(supabase, entrada.capturaId, {
            estado: "DESCARTADO",
            motivo: duplicada.motivo,
            oportunidade_id: duplicada.id,
        });

        return {
            ai,
            ia,
            selecao: { aprovado: false, motivo: duplicada.motivo },
            oportunidade: null,
            duplicada,
        };
    }

    const tipo = TIPOS.includes(String(ai.tipo_oportunidade))
        ? String(ai.tipo_oportunidade)
        : "OUTRO";

    const referencia = await referenciaDoHistorico(
        supabase,
        local.empreendimento,
        tipo,
    );

    const desconto = descontoPercentual(
        asNum(ai.valor_anunciado),
        referencia,
    );

    // O score deixa de depender só da leitura do texto: entra
    // o preço praticado pela HOSPEDAH, a pressa do vendedor e
    // os sinais de fraude.
    const ajuste = ajustarScore(asScore(ai.score_oportunidade) ?? 0, {
        desconto,
        urgencia: asUrgencia(ai.urgencia),
        risco: asRisco(ai.risco_fraude),
    });

    const motivo = ajuste.motivos.length
        ? selecao.motivo + " Ajuste de score: " +
            ajuste.motivos.join("; ") + "."
        : selecao.motivo;

    const registro = montarRegistro(ai, {
        fonte: entrada.fonte,
        url: entrada.url,
        texto: entrada.texto,
        empreendimento: local.empreendimento,
        cidade: local.cidade,
        estado: local.estado,
        alvoId: entrada.alvo?.id ?? null,
        capturaId: entrada.capturaId,
        motivo,
        hash,
        impressao: impressaoDigital(entrada.texto),
        duplicadaDe: null,
        referencia,
        desconto,
        score: ajuste.score,
    });

    const oportunidade = await gravarOportunidade(
        supabase,
        registro,
        ai,
        ia,
    );

    await atualizarCaptura(supabase, entrada.capturaId, {
        estado: "ANALISADO",
        motivo,
        oportunidade_id: oportunidade.id,
        erro: null,
    });

    const alerta = await alertar(supabase, oportunidade);

    return {
        ai,
        ia,
        selecao: { aprovado: true, motivo },
        oportunidade,
        duplicada: null,
        alerta,
    };
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

        if (!iaConfigurada()) {
            return json({
                error: "IA não configurada. Defina o secret " +
                    "LUNA_API_KEY (GPT Luna) na Edge Function. " +
                    "GEMINI_API_KEY continua aceita como " +
                    "contingência.",
            }, 500);
        }

        const supabase = createClient(SUPABASE_URL, SERVICE);

        const jwt = auth.replace(/^Bearer\s+/i, "").trim();

        // O pg_cron chama com a chave de serviço; o painel
        // chama com o token do usuário autenticado.
        const robo = isSupabaseSecretKey(jwt);

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

            const alvoFiltro = asText(body.alvo_id);

            const agora = new Date().toISOString();

            // Fila com retry: pega as pendentes e também as que
            // falharam e já cumpriram a espera exponencial.
            const fila = (comRetry: boolean) => {
                let q = supabase
                    .from("radar_capturas")
                    .select("*")
                    .order("capturado_em", { ascending: true })
                    .limit(limite);

                if (comRetry) {
                    q = q
                        .in("estado", ["PENDENTE", "ERRO"])
                        .or(
                            "proxima_tentativa.is.null," +
                                "proxima_tentativa.lte." + agora,
                        );
                } else {
                    q = q.eq("estado", "PENDENTE");
                }

                if (alvoFiltro) q = q.eq("alvo_id", alvoFiltro);

                return q;
            };

            let { data: capturas, error: eCap } = await fila(true);

            // Banco ainda sem as colunas de fila da 010.
            if (eCap && ehColunaAusente(eCap)) {
                ({ data: capturas, error: eCap } = await fila(false));
            }

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
                        empreendimentos,
                        {
                            fonte: nomeFonte.get(
                                String(captura.fonte_id || ""),
                            ) || "Robô",
                            url: asText(captura.permalink),
                            texto: String(captura.texto || ""),
                            alvo: alvoId ? alvos.get(alvoId) ?? null : null,
                            capturaId: captura.id as string,
                            traceId,
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

                    const tentativas = (asInt(captura.tentativas) ?? 0) + 1;

                    const desistiu = tentativas >= MAX_TENTATIVAS;

                    // Dead-letter: depois do limite a captura
                    // para de consumir a fila e fica visível
                    // como ABANDONADO no painel.
                    const campos: Record<string, unknown> = {
                        estado: desistiu ? "ABANDONADO" : "ERRO",
                        erro: msg,
                        tentativas,
                        proxima_tentativa: desistiu
                            ? null
                            : proximaTentativa(tentativas),
                    };

                    const { error: eRetry } = await supabase
                        .from("radar_capturas")
                        .update(campos)
                        .eq("id", captura.id as string);

                    // Banco sem as colunas de fila: mantém o
                    // comportamento antigo.
                    if (eRetry) {
                        await atualizarCaptura(
                            supabase,
                            captura.id as string,
                            { estado: "ERRO", erro: msg },
                        );
                    }

                    detalhes.push({
                        captura_id: captura.id,
                        erro: msg,
                        tentativas,
                        abandonada: desistiu,
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

            const texto = String(atual.texto_original || "");

            // Reavaliação ignora o cache de propósito: é o
            // botão de "pensar de novo".
            const ia = await entenderComIA(
                montarPrompt(
                    asText(atual.fonte),
                    asText(atual.url_original),
                    texto,
                ),
            );

            await registrarUso(supabase, {
                acao: "reavaliar",
                ia,
                cache: false,
                oportunidadeId: id,
                traceId,
            });

            const ai = ia.dados;

            const local = normalizarEmpreendimento(ai, empreendimentos);

            const alvo = await carregarAlvo(
                supabase,
                asText(body.alvo_id) ||
                    (atual.alvo_id as string | null),
            );

            const selecao = selecionar(ai, alvo);

            const tipo = TIPOS.includes(String(ai.tipo_oportunidade))
                ? String(ai.tipo_oportunidade)
                : "OUTRO";

            const referencia = await referenciaDoHistorico(
                supabase,
                local.empreendimento,
                tipo,
            );

            const desconto = descontoPercentual(
                asNum(ai.valor_anunciado),
                referencia,
            );

            const ajuste = ajustarScore(
                asScore(ai.score_oportunidade) ?? 0,
                {
                    desconto,
                    urgencia: asUrgencia(ai.urgencia),
                    risco: asRisco(ai.risco_fraude),
                },
            );

            const registro = montarRegistro(ai, {
                fonte: asText(atual.fonte),
                url: asText(atual.url_original),
                texto,
                empreendimento: local.empreendimento,
                cidade: local.cidade,
                estado: local.estado,
                alvoId: alvo?.id ?? null,
                capturaId: (atual.captura_id as string | null) ?? null,
                motivo: ajuste.motivos.length
                    ? selecao.motivo + " Ajuste de score: " +
                        ajuste.motivos.join("; ") + "."
                    : selecao.motivo,
                hash: await hashTexto(texto),
                impressao: impressaoDigital(texto),
                duplicadaDe: (atual.duplicada_de as string | null) ?? null,
                referencia,
                desconto,
                score: ajuste.score,
            }) as Record<string, unknown>;

            // Reavaliação não reabre o funil: preserva o status
            // de triagem e de negociação já definidos.
            delete registro.status;
            delete registro.negociacao_status;

            let { data: opp, error: eUp } = await supabase
                .from("radar_oportunidades")
                .update(registro)
                .eq("id", id)
                .select()
                .single();

            if (eUp && ehColunaAusente(eUp)) {
                console.error(
                    "[radar-ia] coluna ausente em " +
                        "radar_oportunidades:",
                    eUp,
                );

                ({ data: opp, error: eUp } = await supabase
                    .from("radar_oportunidades")
                    .update(semColunas010(registro))
                    .eq("id", id)
                    .select()
                    .single());
            }

            if (eUp && ehColunaAusente(eUp)) {
                ({ data: opp, error: eUp } = await supabase
                    .from("radar_oportunidades")
                    .update(semColunasNovas(registro))
                    .eq("id", id)
                    .select()
                    .single());
            }

            if (eUp) throw erroBanco(eUp, "radar_oportunidades");

            const { error: eAn } = await supabase
                .from("radar_analises")
                .insert({
                    oportunidade_id: id,
                    modelo: ia.provedor + ":" + ia.modelo,
                    prompt_version: PROMPT_VERSAO,
                    resultado: ai,
                });

            if (eAn) console.error(eAn);

            return json({
                ok: true,
                oportunidade: opp,
                selecao,
            });
        }

        // ── rascunho_abordagem ──────────────────────────────
        // A IA escreve a primeira mensagem; o operador revisa
        // e envia. Nada é disparado automaticamente aqui.
        if (acao === "rascunho_abordagem") {
            const id = asText(body.oportunidade_id);

            if (!id) {
                return json(
                    { error: "oportunidade_id é obrigatório" },
                    400,
                );
            }

            const { data: o, error: eOpp } = await supabase
                .from("radar_oportunidades")
                .select("*")
                .eq("id", id)
                .maybeSingle();

            if (eOpp) throw erroBanco(eOpp, "radar_oportunidades");

            if (!o) {
                return json(
                    { error: "Oportunidade não encontrada" },
                    404,
                );
            }

            const contexto = [
                "EMPREENDIMENTO: " +
                    (asText(o.empreendimento) || "não identificado"),
                "CIDADE/UF: " + (asText(o.cidade) || "?") + "/" +
                    (asText(o.estado) || "?"),
                "TIPO: " + (asText(o.tipo_oportunidade) || "OUTRO"),
                "PERÍODO: " + (asText(o.periodo_inicio) || "?") + " a " +
                    (asText(o.periodo_fim) || "?"),
                "VALOR ANUNCIADO: " +
                    (asNum(o.valor_anunciado) ?? "não informado"),
                "VALOR DE REFERÊNCIA HOSPEDAH: " +
                    (asNum(o.valor_referencia) ?? "sem histórico"),
                "URGÊNCIA: " + (asText(o.urgencia) || "não avaliada"),
                "ANUNCIANTE: " +
                    (asText(o.nome_anunciante) || "não informado"),
                "RESUMO: " + (asText(o.resumo_ia) || ""),
                "",
                "ANÚNCIO ORIGINAL:",
                String(o.texto_original || "").slice(0, 2000),
            ].join("\n");

            let ia: RespostaIA;

            try {
                ia = await pensar(systemAbordagem, contexto, {
                    schema: ESQUEMA_ABORDAGEM,
                    schemaNome: "abordagem_radar",
                    temperatura: 0.4,
                });
            } catch (e) {
                throw erroIA(e);
            }

            await registrarUso(supabase, {
                acao: "rascunho_abordagem",
                ia,
                cache: false,
                oportunidadeId: id,
                traceId,
            });

            return json({
                ok: true,
                rascunho: ia.dados,
                provedor: ia.provedor,
                modelo: ia.modelo,
            });
        }

        // ── registrar_desfecho ──────────────────────────────
        // Fecha o ciclo de aprendizado: o resultado real da
        // negociação fica gravado para calibrar o Radar.
        if (acao === "registrar_desfecho") {
            const id = asText(body.oportunidade_id);

            const resultado = (asText(body.resultado) || "")
                .toUpperCase();

            if (!id || !["GANHA", "PERDIDA"].includes(resultado)) {
                return json({
                    error: "Informe oportunidade_id e resultado " +
                        "(GANHA ou PERDIDA).",
                }, 400);
            }

            const registro: Record<string, unknown> = {
                negociacao_status: resultado,
                fechado_em: new Date().toISOString(),
                valor_fechado: asNum(body.valor_fechado),
                motivo_desfecho: asText(body.motivo),
            };

            let { data: opp, error: eUp } = await supabase
                .from("radar_oportunidades")
                .update(registro)
                .eq("id", id)
                .select()
                .single();

            if (eUp && ehColunaAusente(eUp)) {
                ({ data: opp, error: eUp } = await supabase
                    .from("radar_oportunidades")
                    .update({ negociacao_status: resultado })
                    .eq("id", id)
                    .select()
                    .single());
            }

            if (eUp) throw erroBanco(eUp, "radar_oportunidades");

            return json({ ok: true, oportunidade: opp });
        }

        // ── saude ───────────────────────────────────────────
        // Fila, custo de IA e alertas recentes em uma chamada,
        // para o painel de saúde do Radar.
        if (acao === "saude") {
            const desde = new Date(Date.now() - 30 * 86400000)
                .toISOString();

            const { data: fila } = await supabase
                .from("radar_fila")
                .select("*");

            const { data: custo } = await supabase
                .from("radar_custo_ia_diario")
                .select("*")
                .gte("dia", desde.slice(0, 10))
                .order("dia", { ascending: false })
                .limit(30);

            const { data: alertas } = await supabase
                .from("radar_alertas")
                .select("*")
                .order("criado_em", { ascending: false })
                .limit(20);

            return json({
                ok: true,
                fila: fila || [],
                custo: custo || [],
                alertas: alertas || [],
                alerta_score: scoreAlerta(),
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

        const r = await processarTexto(supabase, empreendimentos, {
            fonte,
            url,
            texto,
            alvo,
            capturaId,
            traceId,
        });

        if (!r.oportunidade) {
            return json({
                ok: true,
                selecionada: false,
                motivo: r.selecao.motivo,
                analise: r.ai,
                captura_id: capturaId,
                duplicada_de: r.duplicada?.id ?? null,
            });
        }

        return json({
            ok: true,
            selecionada: true,
            motivo: r.selecao.motivo,
            oportunidade: r.oportunidade,
            captura_id: capturaId,
            alerta: r.alerta?.enviados ?? [],
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
