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

    throw new Error(
      "A IA não retornou um JSON válido"
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
        )!;


      // Chave legada SUPABASE_SERVICE_ROLE_KEY
      // descontinuada: usa SUPABASE_SECRET_KEYS
      // (JWT Signing Keys) com fallback legado.
      const SERVICE =
        getSupabaseSecretKey();


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
          .getUser(jwt);


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
        await req.json();


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
        "https://generativelanguage.googleapis.com" +
        "/v1beta/models/" +
        MODEL +
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

      try{

        gr =
          await chamarGemini(
            geminiUrl
          );

      }catch(err){

        if(
          err instanceof Error &&
          err.name === "AbortError"
        )

          throw new Error(
            "A IA demorou demais " +
            "para responder " +
            "(timeout). Tente novamente."
          );

        throw new Error(
          "Falha de rede ao chamar " +
          "a API do Gemini"
        );

      }


      const gd =
        await gr.json();


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

          throw new Error(
            "GEMINI_API_KEY inválida. " +
            "Revise o secret na Edge Function."
          );

        if(gr.status === 403)

          throw new Error(
            "API do Gemini sem permissão. " +
            "Verifique a GEMINI_API_KEY e se " +
            "a Generative Language API está ativa."
          );

        if(gr.status === 404 ||
          /not found|not supported/i
            .test(geminiMsg))

          throw new Error(
            "Modelo " + MODEL +
            " indisponível para esta chave. " +
            "Defina o secret GEMINI_MODEL " +
            "com um modelo válido (ex.: " +
            "gemini-2.0-flash) na Edge Function."
          );

        if(gr.status === 429)

          throw new Error(
            "Limite de uso da IA atingido. " +
            "Aguarde e tente novamente."
          );

        throw new Error(
          geminiMsg
        );

      }


      const text =
        gd.candidates?.[0]
          ?.content
          ?.parts?.[0]
          ?.text;


      if(!text){

        throw new Error(
          "A IA não retornou conteúdo"
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
          data: emps
        } = await supabase

          .from(
            "radar_empreendimentos"
          )

          .select(
            "nome,cidade,estado,aliases"
          )

          .eq("ativo", true);


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

        throw e1;


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
            MODEL,

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

      console.error(e);

      // Mensagens operacionais (criadas por
      // este arquivo) são seguras para o
      // cliente; qualquer outro erro interno
      // recebe mensagem genérica para não
      // expor stack trace/internals.
      const msg =
        e instanceof Error
          ? e.message
          : "";


      const segura =
        [
          "timeout",
          "Tente novamente",
          "GEMINI_API_KEY",
          "GEMINI_MODEL",
          "Gemini",
          "Limite de uso",
          "JSON válido",
          "não retornou conteúdo",
          "Falha de rede"
        ].some(
          (p) => msg.includes(p)
        );


      return json(

        {
          error:
            segura && msg
              ? msg
              : "Erro interno ao processar a análise"
        },

        500

      );

    }

  }
);
