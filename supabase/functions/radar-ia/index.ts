import {
  createClient
} from "https://esm.sh/@supabase/supabase-js@2";


import {
  getSupabaseSecretKey
} from "../_shared/secret-key.ts";


const cors = {

  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type"

};


const headers = {

  ...cors,

  "Content-Type":
    "application/json"

};


// Modelo configurável via secret GEMINI_MODEL.
// Padrão: gemini-2.0-flash (estável e disponível
// no nível gratuito). gemini-2.5-flash pode não
// estar habilitado em todas as chaves/projetos.
const MODEL =
  Deno.env.get("GEMINI_MODEL") ||
  "gemini-2.0-flash";


// Modelos alternativos, tentados em
// ordem quando o principal retorna 404
// (indisponível para a chave). Configurável
// via secret GEMINI_FALLBACK_MODELS
// (separados por vírgula).
const FALLBACK_MODELS = (
  Deno.env.get("GEMINI_FALLBACK_MODELS") ||
  "gemini-2.0-flash," +
    "gemini-2.0-flash-lite," +
    "gemini-1.5-flash"
)
  .split(",")
  .map((m) => m.trim())
  .filter((m) => m && m !== MODEL);


// Timeout da chamada ao Gemini para evitar
// que a Edge Function trave indefinidamente
// e o browser aborte com "Failed to fetch".
const GEMINI_TIMEOUT_MS = 45000;


const TIPOS = [
  "VENDA_COTA",
  "VENDA_PERIODO",
  "ALUGUEL",
  "CESSAO",
  "TROCA",
  "PERMUTA",
  "DISPONIBILIDADE",
  "OUTRO"
];


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


// Erro operacional: mensagem já revisada e
// segura para exibir ao usuário final, com
// o status HTTP adequado. Qualquer erro que
// não seja AppError vira mensagem genérica.
class AppError extends Error {

  status: number;

  constructor(
    message: string,
    status = 500
  ){

    super(message);

    this.name = "AppError";

    this.status = status;

  }

}


// Traduz erros do PostgREST/Postgres em
// mensagens acionáveis (a causa mais comum
// do antigo "Erro interno" era a migration
// 007_radar_ia.sql não aplicada ou RLS).
function erroBanco(
  e: unknown,
  tabela: string
): AppError {

  const err =
    e as {
      code?: string;
      message?: string;
    };

  const code =
    String(err?.code || "");

  const msg =
    String(err?.message || "");


  if(
    code === "42P01" ||
    code === "PGRST205" ||
    /does not exist/i.test(msg)
  )

    return new AppError(
      "Tabela " + tabela +
      " não encontrada no banco. " +
      "Aplique a migration " +
      "supabase/migrations/007_radar_ia.sql.",
      500
    );


  if(code === "42703")

    return new AppError(
      "Estrutura da tabela " + tabela +
      " desatualizada (coluna ausente). " +
      "Reaplique a migration " +
      "supabase/migrations/007_radar_ia.sql.",
      500
    );


  if(
    code === "42501" ||
    code === "PGRST301" ||
    /row-level security|permission denied/i
      .test(msg)
  )

    return new AppError(
      "Sem permissão para gravar em " +
      tabela + " (RLS). Verifique as " +
      "policies da migration 007 e o secret " +
      "SUPABASE_SECRET_KEY da Edge Function.",
      500
    );


  return new AppError(
    "Falha ao gravar no banco (" +
    tabela + ")" +
    (code ? " — código " + code : "") +
    ".",
    500
  );

}


function json(
  body: unknown,
  status = 200
){

  return new Response(

    JSON.stringify(body),

    {
      status,
      headers
    }

  );

}


function asText(
  v: unknown
): string | null {

  if(typeof v !== "string")

    return null;

  const t = v.trim();

  return t ? t : null;

}


function asInt(
  v: unknown
): number | null {

  const n = Number(v);

  if(!Number.isFinite(n))

    return null;

  return Math.round(n);

}


function asNum(
  v: unknown
): number | null {

  const n = Number(v);

  if(!Number.isFinite(n))

    return null;

  return n;

}


function asScore(
  v: unknown
): number | null {

  const n = asInt(v);

  if(n === null)

    return null;

  return Math.min(
    100,
    Math.max(0, n)
  );

}


function asDate(
  v: unknown
): string | null {

  if(typeof v !== "string")

    return null;

  const t = v.trim();

  if(
    !/^\d{4}-\d{2}-\d{2}$/.test(t)
  )

    return null;

  if(
    isNaN(
      Date.parse(t + "T00:00:00Z")
    )
  )

    return null;

  return t;

}


function normalizar(
  s: string
): string {

  return s

    .normalize("NFD")
    .replace(
      /[̀-ͯ]/g,
      ""
    )

    .toLowerCase()

    .replace(
      /[^a-z0-9]+/g,
      " "
    )

    .trim();

}


function parseAiJson(
  text: string
): Record<string, unknown> {

  const cleaned = text

    .replace(
      /^```(?:json)?/i,
      ""
    )

    .replace(
      /```$/,
      ""
    )

    .trim();

  try{

    return JSON.parse(cleaned);

  }catch{

    const start =
      cleaned.indexOf("{");

    const end =
      cleaned.lastIndexOf("}");

    try{

      if(
        start >= 0 &&
        end > start
      ){

        return JSON.parse(
          cleaned.slice(
            start,
            end + 1
          )
        );

      }

    }catch{

      // Segue para o erro tratado abaixo.

    }

    throw new AppError(
      "A IA não retornou um JSON válido " +
      "(resposta possivelmente truncada). " +
      "Tente novamente com um texto menor.",
      502
    );

  }

}


Deno.serve(
  async (req) => {

    if(
      req.method === "OPTIONS"
    ){

      return new Response(
        "ok",
        {
          headers: cors
        }
      );

    }


    try{

      const auth =
        req.headers.get(
          "Authorization"
        );


      if(!auth){

        return json(
          {
            error:
              "Não autenticado"
          },
          401
        );

      }


      const SUPABASE_URL =
        Deno.env.get(
          "SUPABASE_URL"
        );


      // Chave legada SUPABASE_SERVICE_ROLE_KEY
      // descontinuada: usa SUPABASE_SECRET_KEYS
      // (JWT Signing Keys) com fallback legado.
      const SERVICE =
        getSupabaseSecretKey();


      if(!SUPABASE_URL || !SERVICE){

        return json(
          {
            error:
              "Edge Function sem credenciais " +
              "do Supabase. Defina os secrets " +
              "SUPABASE_URL e SUPABASE_SECRET_KEY."
          },
          500
        );

      }


      const GEMINI =
        Deno.env.get(
          "GEMINI_API_KEY"
        );


      if(!GEMINI){

        return json(
          {
            error:
              "IA não configurada. " +
              "Defina o secret GEMINI_API_KEY " +
              "na Edge Function."
          },
          500
        );

      }


      const supabase =
        createClient(
          SUPABASE_URL,
          SERVICE
        );


      // Valida o token do usuário
      // antes de qualquer operação.
      const jwt =
        auth.replace(
          /^Bearer\s+/i,
          ""
        );


      const {
        data: userData,
        error: authError
      } =
        await supabase.auth
          .getUser(jwt)
          .catch(
            () => ({
              data: null,
              error: {
                message: "network"
              }
            })
          ) as {
            data: { user?: unknown } | null;
            error: { message?: string } | null;
          };


      if(
        authError ||
        !userData?.user
      ){

        return json(
          {
            error:
              "Sessão inválida ou expirada"
          },
          401
        );

      }


      const body =
        await req.json()
          .catch(() => null);


      if(
        !body ||
        typeof body !== "object"
      ){

        return json(
          {
            error:
              "Corpo da requisição inválido " +
              "(esperado JSON)"
          },
          400
        );

      }


      if(
        !body.texto_original?.trim()
      ){

        return json(
          {
            error:
              "texto_original é obrigatório"
          },
          400
        );

      }


      const prompt =

        system +

        "\n\nFONTE: " +

        (
          body.fonte ||
          "Manual"
        ) +

        "\nURL: " +

        (
          body.url_original ||
          ""
        ) +

        "\n\nTEXTO:\n" +

        body.texto_original;


      const geminiUrl =
        (m: string) =>
          "https://generativelanguage.googleapis.com" +
          "/v1beta/models/" +
          m +
          ":generateContent?key=" +
          GEMINI;


      const geminiBody =
        JSON.stringify({

          contents: [
            {
              role: "user",

              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {

            temperature: 0.1,

            responseMimeType:
              "application/json"

          }

        });


      async function chamarGemini(
        modelUrl: string
      ){

        const ctrl =
          new AbortController();

        const timer =
          setTimeout(
            () => ctrl.abort(),
            GEMINI_TIMEOUT_MS
          );

        try{

          return await fetch(
            modelUrl,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body: geminiBody,

              signal: ctrl.signal
            }
          );

        }finally{

          clearTimeout(timer);

        }

      }


      let gr;
      let modeloUsado = MODEL;

      try{

        gr =
          await chamarGemini(
            geminiUrl(MODEL)
          );

        // Se o modelo principal estiver
        // indisponível para esta chave
        // (404), tenta os fallbacks em
        // ordem antes de desistir.
        if(
          gr.status === 404 &&
          FALLBACK_MODELS.length
        ){

          // Descarta o corpo antes de
          // reusar a conexão.
          await gr.text();

          for(const m of FALLBACK_MODELS){

            console.warn(
              "[radar-ia] Modelo " +
              modeloUsado +
              " indisponível (404) — " +
              "tentando " + m
            );

            gr =
              await chamarGemini(
                geminiUrl(m)
              );

            if(gr.status !== 404){

              modeloUsado = m;
              break;

            }

            await gr.text();

          }

        }

      }catch(err){

        if(
          err instanceof Error &&
          err.name === "AbortError"
        )

          throw new AppError(
            "A IA demorou demais " +
            "para responder " +
            "(timeout). Tente novamente.",
            504
          );

        throw new AppError(
          "Falha de rede ao chamar " +
          "a API do Gemini",
          502
        );

      }


      // O Gemini pode responder com HTML/texto
      // (proxy, 5xx, bloqueio) — nesse caso
      // gr.json() lançaria SyntaxError e viraria
      // "Erro interno". Lemos como texto primeiro.
      const rawGemini =
        await gr.text()
          .catch(() => "");


      let gd: any = null;

      try{

        gd =
          rawGemini
            ? JSON.parse(rawGemini)
            : null;

      }catch{

        throw new AppError(
          "A API do Gemini retornou uma " +
          "resposta inesperada (HTTP " +
          gr.status + "). Tente novamente " +
          "em instantes.",
          502
        );

      }


      if(!gd){

        throw new AppError(
          "A API do Gemini retornou uma " +
          "resposta vazia (HTTP " +
          gr.status + "). Tente novamente.",
          502
        );

      }


      if(!gr.ok){

        const geminiMsg =
          String(
            gd.error?.message ||
            "Erro Gemini"
          );


        // Mensagens acionáveis para os
        // erros de configuração mais comuns.
        if(gr.status === 400 &&
          /API key not valid|API_KEY_INVALID/i
            .test(geminiMsg))

          throw new AppError(
            "GEMINI_API_KEY inválida. " +
            "Revise o secret na Edge Function.",
            500
          );

        if(gr.status === 403)

          throw new AppError(
            "API do Gemini sem permissão. " +
            "Verifique a GEMINI_API_KEY e se " +
            "a Generative Language API está ativa.",
            500
          );

        if(gr.status === 404 ||
          /not found|not supported/i
            .test(geminiMsg))

          throw new AppError(
            "Modelo " + MODEL +
            " indisponível para esta chave" +
            (
              FALLBACK_MODELS.length
                ? " (tentei também: " +
                  FALLBACK_MODELS.join(", ") +
                  ")"
                : ""
            ) +
            ". Defina o secret GEMINI_MODEL " +
            "com um modelo válido (ex.: " +
            "gemini-1.5-flash) na Edge Function.",
            502
          );

        if(gr.status === 429)

          throw new AppError(
            "Limite de uso da IA atingido. " +
            "Aguarde e tente novamente.",
            429
          );

        throw new AppError(
          "Erro na API do Gemini: " +
          geminiMsg,
          502
        );

      }


      const text =
        gd.candidates?.[0]
          ?.content
          ?.parts?.[0]
          ?.text;


      if(!text){

        const motivo =
          String(
            gd.candidates?.[0]
              ?.finishReason ||
            gd.promptFeedback
              ?.blockReason ||
            ""
          );


        if(/MAX_TOKENS/i.test(motivo))

          throw new AppError(
            "A resposta da IA foi truncada. " +
            "Analise um texto menor.",
            502
          );


        if(/SAFETY|BLOCK|RECITATION/i
          .test(motivo))

          throw new AppError(
            "A IA bloqueou a análise deste " +
            "conteúdo (" + motivo + "). " +
            "Revise o texto colado.",
            502
          );


        throw new AppError(
          "A IA não retornou conteúdo" +
          (motivo ? " (" + motivo + ")" : "") +
          ".",
          502
        );

      }


      const ai =
        parseAiJson(text);


      // Normaliza o empreendimento
      // usando o cadastro + aliases.
      let empreendimento =
        asText(
          ai.empreendimento
        );

      let cidade =
        asText(ai.cidade);

      let estado =
        asText(ai.estado);


      if(empreendimento){

        const {
          data: emps,
          error: eEmp
        } = await supabase

          .from(
            "radar_empreendimentos"
          )

          .select(
            "nome,cidade,estado,aliases"
          )

          .eq("ativo", true);


        // Falha no cadastro auxiliar não
        // deve abortar a análise: apenas
        // segue sem normalizar o nome.
        if(eEmp)

          console.error(
            "[radar-ia] radar_empreendimentos:",
            eEmp
          );


        const alvo =
          normalizar(
            empreendimento
          );


        const match =
          (emps || []).find(
            (e: any) => {

              const nomes = [
                e.nome,
                ...(
                  e.aliases || []
                )
              ];

              return nomes.some(
                (n: string) =>
                  normalizar(
                    n
                  ) === alvo
              );

            }
          );


        if(match){

          empreendimento =
            match.nome;

          cidade =
            cidade ||
            match.cidade;

          estado =
            estado ||
            match.estado;

        }

      }


      // Whitelist: só campos que
      // existem na tabela entram
      // no insert.
      const record = {

        fonte:
          asText(body.fonte) ||
          "Manual",

        url_original:
          asText(
            body.url_original
          ),

        texto_original:
          body.texto_original,

        empreendimento,

        cidade,

        estado,

        tipo_oportunidade:
          TIPOS.includes(
            String(
              ai.tipo_oportunidade
            )
          )
            ? String(
                ai.tipo_oportunidade
              )
            : "OUTRO",

        periodo_inicio:
          asDate(
            ai.periodo_inicio
          ),

        periodo_fim:
          asDate(
            ai.periodo_fim
          ),

        numero_semana:
          asInt(
            ai.numero_semana
          ),

        dormitorios:
          asInt(
            ai.dormitorios
          ),

        capacidade_adultos:
          asInt(
            ai.capacidade_adultos
          ),

        capacidade_criancas:
          asInt(
            ai.capacidade_criancas
          ),

        valor_anunciado:
          asNum(
            ai.valor_anunciado
          ),

        situacao_cota:
          asText(
            ai.situacao_cota
          ),

        propriedade:
          asText(
            ai.propriedade
          ),

        nome_anunciante:
          asText(
            ai.nome_anunciante
          ),

        contato:
          asText(ai.contato),

        resumo_ia:
          asText(ai.resumo_ia),

        score_confianca:
          asScore(
            ai.score_confianca
          ),

        score_oportunidade:
          asScore(
            ai.score_oportunidade
          ),

        status:
          "VALIDAR"

      };


      const {
        data: opp,
        error: e1
      } = await supabase

        .from(
          "radar_oportunidades"
        )

        .insert(record)

        .select()

        .single();


      if(e1)

        throw erroBanco(
          e1,
          "radar_oportunidades"
        );


      if(!opp?.id)

        throw new AppError(
          "A oportunidade não pôde ser " +
          "gravada no banco.",
          500
        );


      const {
        error: e2
      } = await supabase

        .from(
          "radar_analises"
        )

        .insert({

          oportunidade_id:
            opp.id,

          modelo:
            modeloUsado,

          prompt_version:
            "1.1",

          resultado:
            ai

        });


      if(e2)

        console.error(e2);


      return json({

        ok: true,

        oportunidade:
          opp

      });


    }catch(e){

      // Id curto de rastreio: aparece no log
      // da função e na resposta, permitindo
      // correlacionar o erro visto pelo
      // usuário com o stack trace real.
      const traceId =
        crypto.randomUUID()
          .slice(0, 8);


      console.error(
        "[radar-ia]",
        traceId,
        e
      );


      if(e instanceof AppError)

        return json(
          {
            error: e.message,
            trace_id: traceId
          },
          e.status
        );


      // Erros inesperados não expõem
      // detalhes internos ao cliente.
      return json(
        {
          error:
            "Erro interno ao processar a " +
            "análise (ref. " + traceId + "). " +
            "Consulte os logs da Edge Function " +
            "radar-ia no Supabase.",
          trace_id: traceId
        },
        500
      );

    }

  }
);
