// ============================================================
// HOSPEDAH — Edge Function: Concierge IA (Google Gemini 2.0 Flash)
//
// Variáveis de ambiente (Supabase Dashboard → Settings → Edge Functions):
//   GEMINI_API_KEY  → chave da API Google AI Studio (aistudio.google.com)
//                     Se não estiver configurada, a Edge Function aceita a chave
//                     enviada pelo cliente no campo `gemini_key` do payload.
//
// Payload esperado (POST JSON):
//   {
//     lead: { nome: string, assunto: string },
//     conversa_id: string,
//     mensagens: Array<{ role: 'user' | 'assistant', content: string, ts: string }>,
//     timestamp_inicio: string,
//     gemini_key?: string   // fallback quando GEMINI_API_KEY não está no Supabase
//   }
//
// Resposta:
//   { resposta: string }  → em caso de sucesso
//   { error: string }     → em caso de falha
// ============================================================

import { serve }        from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_STREAM_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`;
// Timeout for individual Gemini API requests (ms)
const GEMINI_REQUEST_TIMEOUT_MS = 30000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
};

const ALLOWED_ORIGINS = [
  'https://hospedah.tur.br',
  'https://www.hospedah.tur.br',
  'https://frjoao-cpu.github.io',
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return { ...CORS_HEADERS, 'Access-Control-Allow-Origin': allowed, 'Vary': 'Origin' };
}

// Calls the Gemini REST API with automatic retry on HTTP 429 (rate-limit) and 5xx errors.
// Attempts: 1 original + up to GEMINI_MAX_RETRIES retries.
// Wait before retry i (1-based): GEMINI_RETRY_BASE_MS * i  (1.5 s, 3 s, …)
const GEMINI_MAX_RETRIES  = 2;
const GEMINI_RETRY_BASE_MS = 1500;
// HTTP status codes that are worth retrying
const GEMINI_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function fetchGeminiWithRetry(url: string, bodyStr: string): Promise<Response> {
  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, GEMINI_RETRY_BASE_MS * attempt));
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: bodyStr,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!GEMINI_RETRYABLE_STATUSES.has(res.status)) return res; // success or non-retryable error
      lastResponse = res;
      const remaining = GEMINI_MAX_RETRIES - attempt;
      if (remaining > 0) {
        console.warn(`[ai-concierge] Gemini ${res.status} (attempt ${attempt + 1}/${GEMINI_MAX_RETRIES + 1}) — retrying in ${GEMINI_RETRY_BASE_MS * (attempt + 1)} ms…`);
      } else {
        console.error(`[ai-concierge] Gemini ${res.status} — all ${GEMINI_MAX_RETRIES + 1} attempts exhausted.`);
      }
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err instanceof Error && err.name === 'AbortError';
      if (attempt === GEMINI_MAX_RETRIES) {
        console.error(`[ai-concierge] Gemini ${isTimeout ? 'timeout' : 'network error'} on final attempt (${attempt + 1}/${GEMINI_MAX_RETRIES + 1}):`, err);
        throw err;
      }
      console.warn(`[ai-concierge] Gemini ${isTimeout ? 'timeout' : 'network error'} on attempt ${attempt + 1}/${GEMINI_MAX_RETRIES + 1}:`, err);
    }
  }
  if (!lastResponse) throw new Error('[ai-concierge] Gemini: all retries exhausted with no response');
  return lastResponse;
}

// Fallback hardcoded — used when ai_config table is unreachable.
// The canonical value lives in the 'system_prompt' row of ai_config.
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
- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)
- Capacidade: Apartamento de 1 dormitório comporta até 6 pessoas | Apartamento de 2 dormitórios comporta até 8 pessoas
- Apartamento equipado com utensílios completos de cozinha (panelas, cafeteira, talheres, pratos, copos, etc.), cooktop, forno microondas, geladeira e varanda gourmet com tela de proteção
- É permitido trazer alimentos e bebidas; devem ser consumidos dentro do apartamento
- Roupas de cama e banho fornecidas pelo resort
- Acesso gratuito à Vila Guarani para hóspedes
- Wi-Fi gratuito no apartamento e áreas comuns
- Serviço de limpeza básica durante a estadia (retirada de lixo, arrumação das camas e troca de toalhas deixadas separadas pelo hóspede)
- Taxa de higienização da churrasqueira: R$40,00; o resort disponibiliza kit churrasco (1 tábua, 1 faca, 1 pegador, 1 garfo)
- Taxa do parque aquático — Apartamento de 1 dormitório: R$129,00/dia (acima de 2 dias), valor total independente do número de hóspedes (ex.: 6 pessoas = R$129,00/dia)
- Taxa do parque aquático — Apartamento de 2 dormitórios: R$169,00/dia (acima de 2 dias), valor total independente do número de hóspedes (ex.: 8 pessoas = R$169,00/dia); valores sujeitos a alterações
- A taxa do parque aquático é paga diretamente ao resort no momento do check-in
- Pré check-in possível para uso do parque aquático mediante taxa adicional de R$15,00/pessoa; acesso ao apartamento somente a partir das 15h
- Alimentação: refeições NÃO estão incluídas na diária; o apartamento possui cozinha completa — o hóspede pode trazer seus próprios alimentos e bebidas (devem ser consumidos dentro do apartamento); o resort dispõe de restaurante onde refeições podem ser compradas à la carte; pacotes de meia-pensão (café da manhã + 1 refeição) ou pensão completa (café da manhã + almoço + jantar) podem ser contratados diretamente com a central de reservas do resort após a confirmação da reserva; para valores atualizados dos pacotes de alimentação, consulte via WhatsApp
- Aceita pets: não informado — orientar o cliente a confirmar via WhatsApp
- Dados necessários para reserva: nome, CPF, RG, data de nascimento, e-mail, endereço completo

♨️ SÃO PEDRO THERMAS — São Pedro/SP:
- Águas termais naturais, piscinas aquecidas e acomodações premium.
- Check-in a partir das 14h | Check-out até as 11h
- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)
- Apartamento com roupas de cama e banho; NÃO inclui talheres, pratos, copos ou utensílios de cozinha
- Voltagem do apartamento: 220V
- Wi-Fi gratuito disponível
- Não aceita pets
- Alimentação: refeições NÃO estão incluídas na diária; o resort dispõe de restaurante e lanchonete onde café da manhã, almoço e jantar são servidos e pagos diretamente no local; não é permitido trazer alimentos de fora; para informações sobre pacotes de meia-pensão ou pensão completa e valores atualizados, consulte via WhatsApp
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)
- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)
- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia

🎢 OLIMPIA PARK RESORT — Olímpia/SP:
- Parque aquático com tobogãs e atrações, piscinas e acomodações premium.
- Check-in a partir das 14h | Check-out até as 11h
- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)
- Capacidade: Apartamento de 1 dormitório comporta até 6 pessoas | Apartamento de 2 dormitórios comporta até 8 pessoas
- Apartamento com roupas de cama e banho; NÃO inclui talheres, pratos, copos ou utensílios de cozinha
- Voltagem do apartamento: 220V
- Wi-Fi gratuito disponível
- Não aceita pets
- Alimentação: refeições NÃO estão incluídas na diária; o resort dispõe de restaurante e lanchonete onde refeições são pagas diretamente; para informações sobre pacotes de meia-pensão ou pensão completa e valores atualizados, consulte via WhatsApp
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)
- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)
- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia

☀️ SOLAR DAS ÁGUAS (localização: consulte via WhatsApp):
- Resort com piscinas, área de lazer completa e acomodações exclusivas.
- Check-in a partir das 14h | Check-out até as 11h
- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)
- Capacidade: Apartamento de 1 dormitório comporta até 5 pessoas | Apartamento de 2 dormitórios comporta até 7 pessoas
- Apartamento com roupas de cama e banho; NÃO inclui talheres, pratos, copos ou utensílios de cozinha
- Voltagem do apartamento: 220V
- Wi-Fi gratuito disponível
- Não aceita pets
- Alimentação: refeições NÃO estão incluídas na diária; o resort dispõe de restaurante onde refeições são pagas diretamente; para informações sobre pacotes de alimentação (meia-pensão ou pensão completa) e valores atualizados, consulte via WhatsApp
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)
- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)
- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia

👑 WYNDHAM ROYAL (localização: consulte via WhatsApp):
- Suítes de luxo, piscinas premium e lazer exclusivo.
- Alimentação: para informações sobre opções de refeição e pacotes de alimentação, consulte via WhatsApp

🌊 PRAIA DE JUQUEHY — São Sebastião/SP:
- Hospedagem à beira-mar, mar azul e natureza exuberante. Ideal para quem busca praia e descanso.
- Alimentação: para informações sobre opções de refeição e pacotes de alimentação, consulte via WhatsApp

🌊 IPIOCA BEACH RESORT — Maceió/AL:
- Resort à beira-mar com praia exclusiva, natureza exuberante e infraestrutura completa para toda a família.
- Alimentação: para informações sobre opções de refeição e pacotes de alimentação, consulte via WhatsApp

⚓ PORTO 2 LIFE (localização: consulte via WhatsApp):
- Resort moderno com lazer completo, piscinas e acomodações de alto padrão para toda a família.
- Alimentação: para informações sobre opções de refeição e pacotes de alimentação, consulte via WhatsApp

Para orçamentos e reservas de todos os resorts, entre em contato via WhatsApp: (17) 98200-6382 (Flávio) ou (17) 99206-8296 (Juliana).

Regras de atendimento (siga SEMPRE nesta ordem de prioridade):
1. Se o cliente fizer uma pergunta específica sobre um resort (estacionamento, alimentação, check-in, pets, capacidade, parque aquático, etc.), responda-a DIRETAMENTE e de forma completa — nunca substitua a resposta por uma recomendação de resort.
2. Quando o cliente não tiver um resort definido e demonstrar interesse em escolher um, pergunte PRIMEIRO: "Já tem algum resort em mente, ou prefere uma indicação personalizada?" — só após a resposta colete: número de pessoas, preferência de orçamento (econômico ou conforto) e interesse em parques aquáticos.
3. Só recomende resorts quando o cliente pedir uma recomendação explicitamente ou confirmar que ainda não sabe qual escolher.
4. Sobre alimentação: sempre informe de forma clara e específica se as refeições estão ou não incluídas na diária; mencione se o resort tem restaurante ou lanchonete; indique o WhatsApp para cotação de pacotes de meia-pensão ou pensão completa.

Instruções de comportamento:
- Responda SEMPRE em português do Brasil, de forma calorosa, educada e profissional.
- Seja conciso e objetivo — respostas curtas e claras são preferidas.
- Use emojis com moderação para tornar a conversa mais amigável.
- Se não souber a resposta com certeza, oriente o cliente a entrar em contato pelo WhatsApp ou acessar o site.
- Nunca invente preços, datas de disponibilidade ou políticas não mencionadas acima.
- Não discuta tópicos fora de turismo, hospedagem e serviços da HOSPEDAH.`;

// ── ai_config cache ──────────────────────────────────────────
// Caches the 'system_prompt' row from ai_config for 5 minutes so that
// the DB is not queried on every single AI request.
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')             ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CONFIG_CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutes

interface ConfigCache { value: string; fetchedAt: number; }
let _systemPromptCache: ConfigCache | null = null;

async function getSystemPrompt(): Promise<string> {
  const now = Date.now();
  if (_systemPromptCache && now - _systemPromptCache.fetchedAt < CONFIG_CACHE_TTL_MS) {
    return _systemPromptCache.value;
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return SYSTEM_PROMPT;
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from('ai_config')
      .select('valor')
      .eq('chave', 'system_prompt')
      .eq('ativo', true)
      .maybeSingle();
    if (error || !data?.valor?.trim()) return SYSTEM_PROMPT;
    _systemPromptCache = { value: data.valor, fetchedAt: now };
    return data.valor;
  } catch {
    return SYSTEM_PROMPT;
  }
}

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
  faq_extras?: string;
  /** Chave Gemini fornecida pelo cliente — usada como fallback quando a variável de
   *  ambiente GEMINI_API_KEY não estiver configurada no Supabase. */
  gemini_key?: string;
}

serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin');
  const corsH  = getCorsHeaders(origin);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsH });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método não permitido. Use POST.' }),
      { status: 405, headers: { ...corsH, 'Content-Type': 'application/json' } },
    );
  }

  let ctx: AiContext;
  try {
    ctx = await req.json() as AiContext;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Payload JSON inválido.' }),
      { status: 400, headers: { ...corsH, 'Content-Type': 'application/json' } },
    );
  }

  // Usar a chave Gemini da variável de ambiente (configurada no Supabase Dashboard).
  // ctx.gemini_key é mantido como fallback para compatibilidade, mas não é mais enviado
  // pelo cliente desde que a chave foi removida do browser (assets/ai-config.js).
  const effectiveKey = GEMINI_API_KEY || ctx.gemini_key;
  if (!effectiveKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY não configurada.' }),
      { status: 503, headers: { ...corsH, 'Content-Type': 'application/json' } },
    );
  }

  // Construir histórico de mensagens para o Gemini.
  // Gemini 2.0 Flash usa apenas texto simples nas partes — nenhum campo extra
  // (thought, etc.) deve ser incluído, caso contrário a API retorna 400.
  // content é convertido para string para evitar {"text":null} que também causa 400.
  type GeminiPart = { text: string };
  const rawContents = (ctx.mensagens ?? []).map((m) => {
    const text = (m.content != null) ? String(m.content) : '';
    if (m.role === 'assistant') {
      return { role: 'model' as const, parts: [{ text }] as GeminiPart[] };
    }
    return { role: 'user' as const, parts: [{ text }] as GeminiPart[] };
  });

  // Gemini exige que o primeiro item em contents tenha role 'user'.
  // Remover quaisquer mensagens 'model' no início do histórico.
  const firstUserIdx = rawContents.findIndex((c) => c.role === 'user');
  const trimmedContents = firstUserIdx >= 0 ? rawContents.slice(firstUserIdx) : [];

  // Mesclar mensagens consecutivas com o mesmo role e filtrar entradas com texto vazio.
  const contents: Array<{ role: string; parts: GeminiPart[] }> = [];
  for (const c of trimmedContents) {
    const cText = c.parts.length > 0 ? c.parts[0].text : '';
    if (!cText) continue; // pular turnos com conteúdo vazio
    if (contents.length > 0 && contents[contents.length - 1].role === c.role) {
      contents[contents.length - 1].parts[0].text += '\n' + cText;
    } else {
      contents.push({ role: c.role, parts: [{ text: cText }] });
    }
  }

  // Garantir que o histórico não esteja vazio antes de chamar a API
  if (contents.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Nenhuma mensagem do usuário no contexto.' }),
      { status: 400, headers: { ...corsH, 'Content-Type': 'application/json' } },
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
    ? `${await getSystemPrompt()}\n\n---\nContexto da conversa atual:\n${leadLines.join('\n')}`
    : await getSystemPrompt();

  const faqExtras = ctx.faq_extras && ctx.faq_extras.trim();
  const finalSystemText = faqExtras
    ? `${systemText}\n\n---\nInformações adicionais registradas pela equipe HOSPEDAH:\n${faqExtras}`
    : systemText;

  // Clamp temperature to [0, 1]; default 0.7
  const temperature = typeof ctx.temperature === 'number'
    ? Math.max(0, Math.min(1, ctx.temperature))
    : 0.7;

  const geminiPayload = {
    system_instruction: {
      parts: [{ text: finalSystemText }],
    },
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: 8192,
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
      streamRes = await fetchGeminiWithRetry(
        `${GEMINI_STREAM_URL}?alt=sse&key=${effectiveKey}`,
        JSON.stringify(geminiPayload),
      );
    } catch (err) {
      console.error('[ai-concierge] Erro ao chamar Gemini streaming:', err);
      return new Response(
        JSON.stringify({ error: 'Falha de comunicação com a IA. Tente novamente.' }),
        { status: 502, headers: { ...corsH, 'Content-Type': 'application/json' } },
      );
    }

    if (!streamRes.ok) {
      const errBody = await streamRes.text();
      console.error('[ai-concierge] Gemini streaming erro:', streamRes.status, errBody);
      return new Response(
        JSON.stringify({ error: 'Serviço de IA indisponível. Tente mais tarde.' }),
        { status: 502, headers: { ...corsH, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(streamRes.body, {
      status: 200,
      headers: {
        ...corsH,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // ── NON-STREAMING (default) path ────────────────────────────
  let geminiRes: Response;
  try {
    geminiRes = await fetchGeminiWithRetry(
      `${GEMINI_URL}?key=${effectiveKey}`,
      JSON.stringify(geminiPayload),
    );
  } catch (err) {
    console.error('[ai-concierge] Erro ao chamar Gemini:', err);
    return new Response(
      JSON.stringify({ error: 'Falha de comunicação com a IA. Tente novamente.' }),
      { status: 502, headers: { ...corsH, 'Content-Type': 'application/json' } },
    );
  }

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text();
    console.error('[ai-concierge] Gemini retornou erro:', geminiRes.status, errBody);
    return new Response(
      JSON.stringify({ error: 'Serviço de IA indisponível. Tente mais tarde.' }),
      { status: 502, headers: { ...corsH, 'Content-Type': 'application/json' } },
    );
  }

  const geminiData = await geminiRes.json();

  // Log diagnostic info when candidates are missing (e.g. safety block)
  if (!geminiData?.candidates?.length) {
    const blockReason = geminiData?.promptFeedback?.blockReason ?? 'unknown';
    console.error('[ai-concierge] Gemini retornou sem candidatos. blockReason:', blockReason);
    return new Response(
      JSON.stringify({ error: 'A IA não pôde processar a pergunta devido a restrições de segurança. Tente reformulá-la de outra forma.' }),
      { status: 502, headers: { ...corsH, 'Content-Type': 'application/json' } },
    );
  }

  const candidate = geminiData.candidates[0];
  const parts: Array<{ text?: string; thought?: boolean }> = candidate?.content?.parts ?? [];
  const responsePart = parts.find((p) => p.text && p.text.trim() && !p.thought);
  const resposta: string = responsePart?.text?.trim() ?? '';

  if (!resposta) {
    const finishReason = candidate?.finishReason ?? 'unknown';
    console.error('[ai-concierge] Resposta vazia. finishReason:', finishReason, 'parts count:', parts.length);
    return new Response(
      JSON.stringify({ error: 'A IA não conseguiu gerar uma resposta adequada. Tente reformular sua pergunta.' }),
      { status: 502, headers: { ...corsH, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ resposta }),
    { status: 200, headers: { ...corsH, 'Content-Type': 'application/json' } },
  );
});
