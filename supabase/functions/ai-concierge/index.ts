// ============================================================
// HOSPEDAH — Edge Function: Concierge IA (Google Gemini 1.5 Flash)
//
// Variáveis de ambiente necessárias (Supabase Dashboard → Settings → Edge Functions):
//   GEMINI_API_KEY  → chave da API Google AI Studio (gratuita em aistudio.google.com)
//
// Payload esperado (POST JSON):
//   {
//     lead: { nome: string, assunto: string },
//     conversa_id: string,
//     mensagens: Array<{ role: 'user' | 'assistant', content: string, ts: string }>,
//     timestamp_inicio: string
//   }
//
// Resposta:
//   { resposta: string }          → em caso de sucesso
//   { error: string }             → em caso de falha
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent';
const GEMINI_STREAM_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  'https://hospedah.tur.br',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Vary': 'Origin',
};

const SYSTEM_PROMPT = `Você é o Concierge IA da HOSPEDAH, uma agência de turismo especializada em resorts e hospedagens de luxo no Brasil.

Informações sobre a HOSPEDAH:
- Site: hospedah.tur.br
- WhatsApp: +55 17 98200-6382
- Atendimento humano: segunda a sábado, 8h–20h (horário de Brasília)

Política de reservas e estadia:
- Check-in: a partir das 14h | Check-out: até as 11h
- Para horários especiais, solicitar com antecedência
- Cancelamento com mais de 7 dias: reembolso integral
- Cancelamento entre 3–7 dias: 50% de reembolso
- Cancelamento com menos de 3 dias: sem reembolso

Formas de pagamento aceitas:
- PIX (desconto de 5%)
- Cartão de crédito (em até 12x)
- Boleto bancário
- Transferência bancária

Resorts disponíveis (detalhes):
- Hot Beach Suites — Olímpia/SP: suítes premium, parque aquático com 20 atrações, spa, academia e restaurante gourmet. Ideal para famílias e casais. WhatsApp: (17) 98200-6382
- Hot Beach Resort — Olímpia/SP: all-inclusive premium, piscinas de água termal, 5 restaurantes, shows noturnos e kids club. WhatsApp: (17) 98200-6382
- Enjoy Olímpia Park — Olímpia/SP: resort temático, 8 tobogãs, tirolesa e chalés privê com banheira. WhatsApp: (17) 99206-8296
- Thermas dos Laranjais — Olímpia/SP: maior parque aquático termal da América Latina, mais de 70 atrações em 3,5 milhões de m². WhatsApp: (17) 99206-8296
- Mabu Thermas & Resort — Foz do Iguaçu/PR: termas naturais, transfer para Cataratas do Iguaçu, 3 piscinas. WhatsApp: (17) 99920-68296
- Porto Seguro Eco Bahia — Porto Seguro/BA: resort à beira-mar, praia privativa, esportes aquáticos, all-inclusive. WhatsApp: (17) 99920-68296
- Iberostar Bahia — Costa do Sauípe/BA: 5 estrelas, all-inclusive premium, golf, spa e 7 restaurantes. WhatsApp: (17) 98200-6382

Instruções de comportamento:
- Responda SEMPRE em português do Brasil, de forma calorosa, educada e profissional.
- Seja conciso e objetivo — respostas curtas e claras são preferidas.
- Use emojis com moderação para tornar a conversa mais amigável.
- Se não souber a resposta com certeza, oriente o cliente a entrar em contato pelo WhatsApp ou acessar o site.
- Nunca invente preços, datas de disponibilidade ou políticas não mencionadas acima.
- Não discuta tópicos fora de turismo, hospedagem e serviços da HOSPEDAH.`;

interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

interface AiContext {
  lead: { nome: string; assunto: string };
  conversa_id: string;
  mensagens: AiMessage[];
  timestamp_inicio: string;
  temperature?: number;
  stream?: boolean;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método não permitido. Use POST.' }),
      { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  if (!GEMINI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY não configurada.' }),
      { status: 503, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  let ctx: AiContext;
  try {
    ctx = await req.json() as AiContext;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Payload JSON inválido.' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // Construir histórico de mensagens para o Gemini
  // O system prompt é injetado como primeiro turno "user" seguido de "model" vazio,
  // pois o Gemini 1.5 aceita system_instruction como campo separado.
  const contents = (ctx.mensagens ?? []).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // Garantir que o histórico não esteja vazio antes de chamar a API
  if (contents.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Nenhuma mensagem no contexto.' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // Clamp temperature to [0, 1]; default 0.7
  const temperature = typeof ctx.temperature === 'number'
    ? Math.max(0, Math.min(1, ctx.temperature))
    : 0.7;

  const geminiPayload = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: 512,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  // ── STREAMING path ──────────────────────────────────────────
  if (ctx.stream === true) {
    let streamRes: Response;
    try {
      streamRes = await fetch(`${GEMINI_STREAM_URL}?alt=sse&key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload),
      });
    } catch (err) {
      console.error('[ai-concierge] Erro ao chamar Gemini streaming:', err);
      return new Response(
        JSON.stringify({ error: 'Falha de comunicação com a IA. Tente novamente.' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    if (!streamRes.ok) {
      const errBody = await streamRes.text();
      console.error('[ai-concierge] Gemini streaming erro:', streamRes.status, errBody);
      return new Response(
        JSON.stringify({ error: 'Serviço de IA indisponível. Tente mais tarde.' }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(streamRes.body, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // ── NON-STREAMING (default) path ────────────────────────────
  let geminiRes: Response;
  try {
    geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });
  } catch (err) {
    console.error('[ai-concierge] Erro ao chamar Gemini:', err);
    return new Response(
      JSON.stringify({ error: 'Falha de comunicação com a IA. Tente novamente.' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text();
    console.error('[ai-concierge] Gemini retornou erro:', geminiRes.status, errBody);
    return new Response(
      JSON.stringify({ error: 'Serviço de IA indisponível. Tente mais tarde.' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  const geminiData = await geminiRes.json();
  const resposta: string =
    geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

  if (!resposta) {
    return new Response(
      JSON.stringify({ error: 'A IA não gerou uma resposta. Tente novamente.' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ resposta }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});
