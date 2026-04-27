// ============================================================
// HOSPEDAH — Edge Function: Concierge IA (Google Gemini 2.5 Flash)
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
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const GEMINI_STREAM_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const SYSTEM_PROMPT = `Você é o Concierge IA da HOSPEDAH, uma agência de turismo especializada em resorts e hospedagens de luxo no Brasil.

Informações sobre a HOSPEDAH:
- Site: hospedah.tur.br
- WhatsApp Flávio: +55 17 98200-6382
- WhatsApp Juliana: +55 17 99206-8296
- Instagram: @julianasilvaoliveira.joao
- Atendimento humano: segunda a sábado, 8h–20h (horário de Brasília)

Política geral de reservas:
- Check-in: a partir das 14h (Hot Beach Suites: a partir das 15h) | Check-out: até as 11h
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

🏖️ HOT BEACH SUITES — Olímpia/SP:
- Piscinas termais, área de lazer completa e acomodações premium. Ideal para famílias e casais.
- Check-in a partir das 15h | Check-out até as 11h
- 1 vaga na garagem por apartamento
- Apartamento equipado com utensílios completos de cozinha (panelas, cafeteira, talheres, pratos, copos, etc.), cooktop, forno microondas, geladeira e varanda gourmet com tela de proteção
- É permitido trazer alimentos e bebidas; devem ser consumidos dentro do apartamento
- Roupas de cama e banho fornecidas pelo resort
- Acesso gratuito à Vila Guarani para hóspedes
- Serviço de limpeza básica durante a estadia (retirada de lixo, arrumação das camas e troca de toalhas deixadas separadas pelo hóspede)
- Taxa de higienização da churrasqueira: R$40,00; o resort disponibiliza kit churrasco (1 tábua, 1 faca, 1 pegador, 1 garfo)
- Taxa do parque aquático — Apartamento de 1 dormitório: R$129,00/dia (acima de 2 dias), valor total independente do número de hóspedes (ex.: 6 pessoas = R$129,00/dia)
- Taxa do parque aquático — Apartamento de 2 dormitórios: R$169,00/dia (acima de 2 dias), valor total independente do número de hóspedes (ex.: 8 pessoas = R$169,00/dia); valores sujeitos a alterações
- A taxa do parque aquático é paga diretamente ao resort no momento do check-in
- Pré check-in possível para uso do parque aquático mediante taxa adicional de R$15,00/pessoa; acesso ao apartamento somente a partir das 15h
- Alimentação paga à parte diretamente no restaurante; pacotes de meia-pensão ou pensão completa podem ser negociados com a central de reservas após a confirmação da reserva
- Dados necessários para reserva: nome, CPF, RG, data de nascimento, e-mail, endereço completo

♨️ SÃO PEDRO THERMAS — São Pedro/SP:
- Águas termais naturais, piscinas aquecidas e acomodações premium.
- Check-in a partir das 14h | Check-out até as 11h
- 1 vaga na garagem por apartamento
- Apartamento com roupas de cama e banho; NÃO inclui talheres, pratos, copos ou utensílios de cozinha
- Voltagem do apartamento: 220V
- Não aceita pets
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)
- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)
- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia

🎢 OLIMPIA PARK RESORT — Olímpia/SP:
- Parque aquático com tobogãs e atrações, piscinas e acomodações premium.
- Check-in a partir das 14h | Check-out até as 11h
- 1 vaga na garagem por apartamento
- Apartamento com roupas de cama e banho; NÃO inclui talheres, pratos, copos ou utensílios de cozinha
- Voltagem do apartamento: 220V
- Não aceita pets
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)
- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)
- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia

☀️ SOLAR DAS ÁGUAS (localização: consulte via WhatsApp):
- Resort com piscinas, área de lazer completa e acomodações exclusivas.
- Check-in a partir das 14h | Check-out até as 11h
- 1 vaga na garagem por apartamento
- Apartamento com roupas de cama e banho; NÃO inclui talheres, pratos, copos ou utensílios de cozinha
- Voltagem do apartamento: 220V
- Não aceita pets
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)
- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)
- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia

👑 WYNDHAM ROYAL (localização: consulte via WhatsApp):
- Suítes de luxo, piscinas premium e lazer exclusivo.

🌊 PRAIA DE JUQUEHY — São Sebastião/SP:
- Hospedagem à beira-mar, mar azul e natureza exuberante. Ideal para quem busca praia e descanso.

🌊 IPIOCA BEACH RESORT — Maceió/AL:
- Resort à beira-mar com praia exclusiva, natureza exuberante e infraestrutura completa para toda a família.

⚓ PORTO 2 LIFE (localização: consulte via WhatsApp):
- Resort moderno com lazer completo, piscinas e acomodações de alto padrão para toda a família.

Para orçamentos e reservas de todos os resorts, entre em contato via WhatsApp: (17) 98200-6382 (Flávio) ou (17) 99206-8296 (Juliana).

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

interface IntencaoContext {
  pagina_origem?: string;
  resort_interesse?: string;
  data_entrada?: string;
  data_saida?: string;
  num_hospedes?: number | null;
}

interface AiContext {
  lead: { nome: string; assunto: string };
  conversa_id: string;
  mensagens: AiMessage[];
  timestamp_inicio: string;
  contexto_intencao?: IntencaoContext;
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
  // pois o Gemini 2.5 aceita system_instruction como campo separado.
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

  // Construir contexto dinâmico do lead e intenção para injetar no system instruction
  const leadLines: string[] = [];
  if (ctx.lead?.nome) leadLines.push(`Nome do cliente: ${ctx.lead.nome}`);
  if (ctx.lead?.assunto) leadLines.push(`Assunto de interesse: ${ctx.lead.assunto}`);
  const intencao = ctx.contexto_intencao;
  if (intencao) {
    if (intencao.resort_interesse) leadLines.push(`Resort de interesse: ${intencao.resort_interesse}`);
    if (intencao.data_entrada)     leadLines.push(`Data de entrada desejada: ${intencao.data_entrada}`);
    if (intencao.data_saida)       leadLines.push(`Data de saída desejada: ${intencao.data_saida}`);
    if (intencao.num_hospedes != null)     leadLines.push(`Número de hóspedes: ${intencao.num_hospedes}`);
    if (intencao.pagina_origem && intencao.pagina_origem !== 'direto') {
      leadLines.push(`Página de origem: ${intencao.pagina_origem}`);
    }
  }

  const systemText = leadLines.length > 0
    ? `${SYSTEM_PROMPT}\n\n---\nContexto da conversa atual:\n${leadLines.join('\n')}`
    : SYSTEM_PROMPT;

  // Clamp temperature to [0, 1]; default 0.7
  const temperature = typeof ctx.temperature === 'number'
    ? Math.max(0, Math.min(1, ctx.temperature))
    : 0.7;

  const geminiPayload = {
    system_instruction: {
      parts: [{ text: systemText }],
    },
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: 1024,
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
