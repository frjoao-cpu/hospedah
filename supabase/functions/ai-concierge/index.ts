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
// Model can be overridden via GEMINI_MODEL env variable (Supabase Dashboard → Settings → Edge Functions → Secrets).
// Default: gemini-2.5-flash. Supports any model available in the Gemini v1beta API.
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
// Fallback model used when the primary model fails after all retries (rate-limit, availability issues).
// Can be overridden via GEMINI_FALLBACK_MODEL env variable. Set to empty string to disable fallback.
const GEMINI_FALLBACK_MODEL = Deno.env.get('GEMINI_FALLBACK_MODEL') ?? 'gemini-2.0-flash';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_STREAM_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`;
// Timeout for individual Gemini API requests (ms).
// With GEMINI_MAX_RETRIES=0 (one attempt per model), the full retry chain is:
//   Streaming:     primary-full(10s) + fallback-full(10s) + emergency-base(10s) = 30s < 45s
//   Non-streaming: primary-full(10s) + fallback-full(10s) + emergency-primary-base(10s)
//                  + emergency-fallback-base(10s) = 40s < 45s
// Both chains fit within the 45s client AbortController budget.
const GEMINI_REQUEST_TIMEOUT_MS = 10000;
// Models that support thinkingConfig. Maintained as an explicit set to avoid
// false positives from prefix matching (e.g. a future gemini-2.5-lite variant
// that may not support thinking). Add new thinking-capable models here as needed.
const THINKING_CAPABLE_MODELS = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.5-flash-8b',
  'gemini-3.0-flash',
  'gemini-3.0-pro',
]);

function modelSupportsThinking(model: string): boolean {
  return THINKING_CAPABLE_MODELS.has(model) ||
    model.startsWith('gemini-2.5-') || model.startsWith('gemini-3.');
}

const SUPPORTS_THINKING = modelSupportsThinking(GEMINI_MODEL);

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


// HTTP status codes that are worth retrying
const GEMINI_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
// Calls the Gemini REST API with automatic retry on HTTP 429 (rate-limit) and 5xx errors.
// Attempts: 1 original + up to GEMINI_MAX_RETRIES retries.
// Wait before retry i (1-based): GEMINI_RETRY_BASE_MS * i  (1.5 s, …)
const GEMINI_MAX_RETRIES  = 0;
const GEMINI_RETRY_BASE_MS = 1500;

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
- Voltagem do apartamento: 220V
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
- Pré check-in possível para uso das instalações aquáticas mediante taxa adicional de R$15,00/pessoa; acesso ao apartamento somente a partir das 15h
- Pós checkout: após as 11h, pagando taxa de R$15,00/pessoa, é permitido aproveitar o parque aquático até o final do dia
- Alimentação: refeições NÃO estão incluídas na diária; o apartamento possui cozinha completa — o hóspede pode trazer seus próprios alimentos e bebidas (devem ser consumidos dentro do apartamento); o resort dispõe de restaurante onde refeições podem ser compradas à la carte; pacotes de meia-pensão (café da manhã + 1 refeição) ou pensão completa (café da manhã + almoço + jantar) podem ser contratados diretamente com a central de reservas do resort após a confirmação da reserva; para valores atualizados dos pacotes de alimentação, consulte via WhatsApp
- Não aceita pets
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)
- Dados necessários para reserva: nome, CPF, RG, data de nascimento, e-mail, endereço completo

♨️ SÃO PEDRO THERMAS — São Pedro/SP:
- Águas termais naturais, piscinas aquecidas e acomodações premium.
- Check-in a partir das 14h | Check-out até as 11h
- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)
- Apartamento com roupas de cama e banho, refrigerador frigobar e forno microondas; NÃO inclui talheres, pratos, copos ou utensílios de cozinha (recomendar levar um kit de utensílios)
- Voltagem do apartamento: 220V
- Wi-Fi gratuito disponível
- Não aceita pets
- Alimentação: refeições NÃO estão incluídas na diária; é permitido trazer alimentos e bebidas, mas devem ser consumidos dentro do apartamento; o resort dispõe de restaurante e lanchonete onde café da manhã, almoço e jantar são servidos e pagos diretamente no local; para informações sobre pacotes de meia-pensão ou pensão completa e valores atualizados, consulte via WhatsApp
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)
- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)
- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia

🎢 OLIMPIA PARK RESORT — Olímpia/SP:
- Parque aquático com tobogãs e atrações, piscinas e acomodações premium.
- Check-in a partir das 14h | Check-out até as 11h
- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)
- Capacidade: Apartamento de 1 dormitório comporta até 6 pessoas | Apartamento de 2 dormitórios comporta até 8 pessoas
- Apartamento com roupas de cama e banho, refrigerador frigobar e forno microondas; NÃO inclui talheres, pratos, copos ou utensílios de cozinha (recomendar levar um kit de utensílios)
- Voltagem do apartamento: 220V
- Wi-Fi gratuito disponível
- Não aceita pets
- Alimentação: refeições NÃO estão incluídas na diária; é permitido trazer alimentos e bebidas, mas devem ser consumidos dentro do apartamento; o resort dispõe de restaurante e lanchonete onde refeições são pagas diretamente; para informações sobre pacotes de meia-pensão ou pensão completa e valores atualizados, consulte via WhatsApp
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)
- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)
- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia

☀️ SOLAR DAS ÁGUAS (localização: consulte via WhatsApp):
- Resort com piscinas, área de lazer completa e acomodações exclusivas.
- Check-in a partir das 14h | Check-out até as 11h
- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)
- Capacidade: Apartamento de 1 dormitório comporta até 5 pessoas | Apartamento de 2 dormitórios comporta até 7 pessoas
- Apartamento com roupas de cama e banho, refrigerador frigobar e forno microondas; NÃO inclui talheres, pratos, copos ou utensílios de cozinha (recomendar levar um kit de utensílios)
- Voltagem do apartamento: 220V
- Wi-Fi gratuito disponível
- Não aceita pets
- Alimentação: refeições NÃO estão incluídas na diária; é permitido trazer alimentos e bebidas, mas devem ser consumidos dentro do apartamento; o resort dispõe de restaurante onde refeições são pagas diretamente; para informações sobre pacotes de alimentação (meia-pensão ou pensão completa) e valores atualizados, consulte via WhatsApp
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)
- É proibido ultrapassar a capacidade máxima de hóspedes do apartamento (crianças e bebês contam como hóspedes)
- O hóspede deve entregar o apartamento no mesmo estado em que recebeu, sem multas, taxas ou despesas geradas durante a estadia

👑 WYNDHAM ROYAL (localização: consulte via WhatsApp):
- Suítes de luxo, piscinas premium e lazer exclusivo.
- Check-in a partir das 14h | Check-out até as 11h
- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)
- Apartamento com roupas de cama e banho, refrigerador frigobar e forno microondas; NÃO inclui talheres, pratos, copos ou utensílios de cozinha (recomendar levar um kit de utensílios)
- Voltagem do apartamento: 220V
- Não aceita pets
- Alimentação: é permitido trazer alimentos e bebidas, mas devem ser consumidos dentro do apartamento; para informações sobre opções de refeição e pacotes de alimentação, consulte via WhatsApp
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)

🌊 PRAIA DE JUQUEHY — São Sebastião/SP:
- Hospedagem à beira-mar, mar azul e natureza exuberante. Ideal para quem busca praia e descanso.
- Alimentação: para informações sobre opções de refeição e pacotes de alimentação, consulte via WhatsApp

🌊 IPIOCA BEACH RESORT — Maceió/AL:
- Resort à beira-mar com praia exclusiva, natureza exuberante e infraestrutura completa para toda a família.
- Check-in a partir das 14h | Check-out até as 11h
- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)
- Apartamento com roupas de cama e banho, refrigerador frigobar e forno microondas; NÃO inclui talheres, pratos, copos ou utensílios de cozinha (recomendar levar um kit de utensílios)
- Voltagem do apartamento: 220V
- Não aceita pets
- Alimentação: é permitido trazer alimentos e bebidas, mas devem ser consumidos dentro do apartamento; para informações sobre opções de refeição e pacotes de alimentação, consulte via WhatsApp
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)

⚓ PORTO 2 LIFE (localização: consulte via WhatsApp):
- Resort moderno com lazer completo, piscinas e acomodações de alto padrão para toda a família.
- Check-in a partir das 14h | Check-out até as 11h
- Estacionamento: 1 vaga na garagem gratuita por apartamento (inclusa na diária, sem custo adicional)
- Apartamento com roupas de cama e banho, refrigerador frigobar e forno microondas; NÃO inclui talheres, pratos, copos ou utensílios de cozinha (recomendar levar um kit de utensílios)
- Voltagem do apartamento: 220V
- Não aceita pets
- Alimentação: é permitido trazer alimentos e bebidas, mas devem ser consumidos dentro do apartamento; para informações sobre opções de refeição e pacotes de alimentação, consulte via WhatsApp
- Menores desacompanhados dos pais necessitam de autorização prévia (informar no momento da reserva)

Informações complementares dos resorts para recomendações:
- Praia de Juquehy: uma das praias mais organizadas e preservadas do litoral norte de São Paulo; mar calmo excelente para famílias; limpeza e preservação acima da média; restaurantes e beach clubs sofisticados; fácil acesso; perfil exclusivo e menos lotado; ideal para famílias que buscam praia tranquila e segura e para quem quer fugir da agitação sem abrir mão do conforto.
- Hot Beach Suites: acesso facilitado ao Hot Beach Olímpia; parque geralmente menos lotado que concorrentes; ambiente tranquilo e organizado; piscinas com águas quentes naturais; integração resort + parque para experiência contínua; perfil mais seleto de hóspedes; ideal para famílias que evitam superlotação e priorizam qualidade de experiência.
- São Pedro Thermas: resort ao lado do Thermas de São Pedro; parque novo com tecnologia recente; menor fluxo de pessoas, filas reduzidas, ambiente organizado e limpo; estrutura em expansão e região mais tranquila; indicado para casais e famílias que priorizam conforto e privacidade.
- Olimpia Park Resort: localização estratégica em Olímpia, em frente ao Thermas dos Laranjais; acesso a pé ao parque; estrutura completa de lazer interno; suítes amplas estilo apartamento; forte custo-benefício; melhor para praticidade total e viagens curtas e intensas.
- Wyndham Olímpia Royal Hotels: um dos maiores resorts do Brasil, ao lado do Thermas dos Laranjais; estrutura extremamente completa, quase um mini parque; alto padrão de serviço; grande variedade de piscinas e bares; programação intensa de lazer; marca reconhecida internacionalmente; ideal para experiência de resort completo sem depender do parque e para quem busca padrão elevado.
- Solar das Águas Park Resort: resort novo e moderno em Olímpia, próximo ao Thermas dos Laranjais; mais de 1.000 unidades; suítes espaçosas com sala, cozinha e varanda; transfer incluso para o parque; opções com bebidas inclusas nas refeições; estrutura para famílias grandes; ótimo para espaço, conforto, economia e estadias mais longas.

Para orçamentos e reservas de todos os resorts, entre em contato via WhatsApp: (17) 98200-6382 (Flávio) ou (17) 99206-8296 (Juliana).

Regras de atendimento (siga SEMPRE nesta ordem de prioridade):
1. Se o cliente fizer uma pergunta específica sobre um resort (estacionamento, alimentação, check-in, pets, capacidade, parque aquático, localização, diferenciais, indicações, etc.), responda-a DIRETAMENTE, de forma específica e completa — nunca substitua a resposta por uma recomendação genérica de resort.
2. Quando o cliente não tiver um resort definido e demonstrar interesse em escolher um, pergunte PRIMEIRO: "Já tem algum resort em mente, ou prefere uma indicação personalizada?" — só após a resposta colete: número de pessoas, preferência de orçamento (econômico ou conforto) e interesse em parques aquáticos.
3. Só recomende resorts quando o cliente pedir uma recomendação explicitamente ou confirmar que ainda não sabe qual escolher.
4. Sobre alimentação: sempre informe de forma clara e específica se as refeições estão ou não incluídas na diária; para todos os resorts, exceto Praia de Juquehy, informe que é permitido trazer alimentos e bebidas desde que sejam consumidos dentro do apartamento; mencione se o resort tem restaurante ou lanchonete; indique o WhatsApp para cotação de pacotes de meia-pensão ou pensão completa.
5. Evite respostas vagas como "consulte pelo WhatsApp" quando houver informação no contexto; use primeiro os dados disponíveis e só depois oriente o WhatsApp para confirmar valores, disponibilidade ou detalhes não informados.
6. Sempre que houver dúvida, informação ausente ou necessidade de confirmação, encaminhe o atendimento para os especialistas pelo WhatsApp.

Instruções de comportamento:
- Responda SEMPRE em português do Brasil, de forma calorosa, educada e profissional.
- Seja conciso e objetivo — respostas curtas e claras são preferidas.
- Use emojis com moderação para tornar a conversa mais amigável.
- Se não souber a resposta com certeza, encaminhe o cliente para os especialistas pelo WhatsApp.
- Nunca invente preços, datas de disponibilidade ou políticas não mencionadas acima.
- Não discuta tópicos fora de turismo, hospedagem e serviços da HOSPEDAH.`;

// ── ai_config + FAQ cache ─────────────────────────────────────
// Caches ai_config rows and DB FAQ for 5 minutes to avoid querying on
// every single AI request.
//
// Architecture:
//   SYSTEM_PROMPT (hardcoded) — always the authoritative base.
//     Contains complete resort info including food/dining policies.
//   ai_config.custom_instructions — admin-managed ADDENDUM appended on top.
//     Use this via sistema.html to add notes without risking data loss.
//   faq table — Q&A pairs loaded server-side, always appended.
//     Synced from painel.html / sistema.html.
//
// NOTE: the legacy ai_config key 'system_prompt' is intentionally ignored
// here. Because it REPLACES the entire prompt, an outdated value stored
// there would remove all food/dining information from the AI's context —
// causing the "alimentação de outra parte" conflict. Custom overrides
// should use 'custom_instructions' instead.
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')             ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CONFIG_CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutes

interface ConfigCache { systemPrompt: string; faqExtras: string; fetchedAt: number; }
let _configCache: ConfigCache | null = null;

/** Strips HTML tags from a string for safe plain-text injection into the AI prompt. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/** Loads active FAQ entries from the DB and formats them for injection into the AI prompt. */
async function fetchFaqFromDb(sbClient: ReturnType<typeof createClient>): Promise<string> {
  try {
    const { data, error } = await sbClient
      .from('faq')
      .select('label, resposta')
      .eq('ativo', true)
      .order('ordem', { ascending: true });
    if (error || !data?.length) return '';
    return (data as Array<{ label: string; resposta: string }>)
      .map((f) => `Pergunta: ${f.label}\nResposta: ${stripHtml(f.resposta)}`)
      .join('\n\n');
  } catch {
    return '';
  }
}

/**
 * Returns the final system prompt and server-side FAQ extras.
 * Always starts from the hardcoded SYSTEM_PROMPT (complete resort knowledge)
 * and appends 'custom_instructions' from ai_config if present.
 * Also loads FAQ from the 'faq' table server-side for consistent, conflict-free context.
 */
async function getConfig(): Promise<{ systemPrompt: string; faqExtras: string }> {
  const now = Date.now();
  if (_configCache && now - _configCache.fetchedAt < CONFIG_CACHE_TTL_MS) {
    return { systemPrompt: _configCache.systemPrompt, faqExtras: _configCache.faqExtras };
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { systemPrompt: SYSTEM_PROMPT, faqExtras: '' };
  }
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

    // Fetch custom_instructions and FAQ in parallel to minimise latency.
    const [customInstructionsRes, faqExtras] = await Promise.all([
      sb.from('ai_config')
        .select('chave, valor')
        .eq('ativo', true)
        .eq('chave', 'custom_instructions')
        .maybeSingle(),
      fetchFaqFromDb(sb),
    ]);

    // Build final system prompt: hardcoded base + optional custom addendum.
    let systemPrompt = SYSTEM_PROMPT;
    const customInstructions = customInstructionsRes.data?.valor?.trim();
    if (!customInstructionsRes.error && customInstructions) {
      systemPrompt = `${SYSTEM_PROMPT}\n\n---\nInstruções personalizadas da equipe HOSPEDAH:\n${customInstructions}`;
    }

    _configCache = { systemPrompt, faqExtras, fetchedAt: now };
    return { systemPrompt, faqExtras };
  } catch {
    return { systemPrompt: SYSTEM_PROMPT, faqExtras: '' };
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

  // Load system prompt and server-side FAQ in one DB round-trip (cached 5 min).
  const { systemPrompt, faqExtras: serverFaqExtras } = await getConfig();

  const systemText = leadLines.length > 0
    ? `${systemPrompt}\n\n---\nContexto da conversa atual:\n${leadLines.join('\n')}`
    : systemPrompt;

  // Server-side FAQ (from 'faq' table) is authoritative; client-sent faq_extras
  // (ctx.faq_extras) is appended as supplementary in case the client has extra context.
  const clientFaqExtras = ctx.faq_extras && ctx.faq_extras.trim();
  const allFaqExtras = [serverFaqExtras, clientFaqExtras].filter(Boolean).join('\n\n');
  const finalSystemText = allFaqExtras
    ? `${systemText}\n\n---\nInformações adicionais registradas pela equipe HOSPEDAH:\n${allFaqExtras}`
    : systemText;

  // Clamp temperature to [0, 1]; default 0.7
  const temperature = typeof ctx.temperature === 'number'
    ? Math.max(0, Math.min(1, ctx.temperature))
    : 0.7;

  function buildGenerationConfig(supportsThinking: boolean, temp: number): Record<string, unknown> {
    return {
      temperature: temp,
      maxOutputTokens: 8192,
      // Disable thinking for supported models. Setting thinkingBudget to 0 turns off
      // the thinking phase entirely, reducing latency and token cost for chat use cases.
      // Only valid for thinking-capable models (gemini-2.5+). Non-thinking models (e.g.
      // gemini-2.0-flash) must omit this field, otherwise the API returns 400.
      ...(supportsThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    };
  }

  const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
  ];

  const geminiPayload = {
    system_instruction: {
      parts: [{ text: finalSystemText }],
    },
    contents,
    generationConfig: buildGenerationConfig(SUPPORTS_THINKING, temperature),
    safetySettings,
  };

  // True when the system prompt was extended with DB-loaded custom instructions or FAQ data.
  // Used to decide whether an emergency base-prompt retry makes sense in both
  // the streaming and non-streaming paths.
  const hasCustomData = systemPrompt !== SYSTEM_PROMPT || allFaqExtras.length > 0;

  // Shared base-prompt payload: same as geminiPayload but uses only the hardcoded
  // SYSTEM_PROMPT (no custom instructions, no FAQ). Reused by both streaming and
  // non-streaming emergency retries.
  function buildBasePayload(modelName: string): Record<string, unknown> {
    return {
      ...geminiPayload,
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: buildGenerationConfig(modelSupportsThinking(modelName), temperature),
    };
  }

  // Picks the best model for an emergency base-prompt retry: the fallback model when
  // it is configured and different from the primary (it may succeed when the primary
  // is degraded), otherwise falls back to the primary model itself.
  const emergencyModel = (GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL)
    ? GEMINI_FALLBACK_MODEL
    : GEMINI_MODEL;

  // ── STREAMING path ──────────────────────────────────────────
  if (ctx.stream === true) {
    // Try primary model streaming
    let streamRes: Response | null = null;
    try {
      const primary = await fetchGeminiWithRetry(
        `${GEMINI_STREAM_URL}?alt=sse&key=${effectiveKey}`,
        JSON.stringify(geminiPayload),
      );
      if (primary.ok) {
        streamRes = primary;
      } else {
        const errText = await primary.text();
        console.warn(`[ai-concierge] Primary stream failed: HTTP ${primary.status} — ${errText.slice(0, 200)}`);
      }
    } catch (err) {
      console.warn('[ai-concierge] Primary stream error:', err);
    }

    // Fallback to secondary model when primary streaming fails
    if (!streamRes && GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
      console.warn('[ai-concierge] Primary streaming failed — trying fallback model:', GEMINI_FALLBACK_MODEL);
      const fallbackStreamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FALLBACK_MODEL}:streamGenerateContent`;
      const fallbackSupportsThinking = modelSupportsThinking(GEMINI_FALLBACK_MODEL);
      const fallbackStreamPayload = {
        ...geminiPayload,
        generationConfig: buildGenerationConfig(fallbackSupportsThinking, temperature),
      };
      try {
        const fallback = await fetchGeminiWithRetry(
          `${fallbackStreamUrl}?alt=sse&key=${effectiveKey}`,
          JSON.stringify(fallbackStreamPayload),
        );
        if (fallback.ok) {
          streamRes = fallback;
        } else {
          const errText = await fallback.text();
          console.error(`[ai-concierge] Fallback stream also failed: HTTP ${fallback.status} — ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        console.error('[ai-concierge] Fallback stream error:', err);
      }
    }

    // Emergency: if both models failed with the full prompt and custom DB data is
    // loaded, the custom data may be the cause. Try the fallback model (or primary
    // if no fallback) with only the hardcoded SYSTEM_PROMPT before giving up.
    if (!streamRes && hasCustomData) {
      console.warn('[ai-concierge] Both streaming attempts failed — emergency base-prompt retry:', emergencyModel);
      const emergencyStreamUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/${emergencyModel}:streamGenerateContent`;
      try {
        const emergency = await fetchGeminiWithRetry(
          `${emergencyStreamUrl}?alt=sse&key=${effectiveKey}`,
          JSON.stringify(buildBasePayload(emergencyModel)),
        );
        if (emergency.ok) {
          streamRes = emergency;
          console.log('[ai-concierge] Emergency streaming with base prompt succeeded.');
        } else {
          const errText = await emergency.text();
          console.error(`[ai-concierge] Emergency stream failed: HTTP ${emergency.status} — ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        console.error('[ai-concierge] Emergency stream error:', err);
      }
    }

    if (!streamRes) {
      return new Response(
        JSON.stringify({ error: 'Serviço de IA indisponível. Tente novamente.', model: GEMINI_MODEL }),
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
  // Helper: call a specific Gemini model and return the response text or throw on failure.
  async function callGeminiModel(modelName: string, payload: Record<string, unknown>): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${effectiveKey}`;
    const res = await fetchGeminiWithRetry(url, JSON.stringify(payload));
    if (!res.ok) {
      const errBody = await res.text();
      let msg = `HTTP ${res.status}`;
      try {
        const p = JSON.parse(errBody);
        if (p?.error?.message) msg = p.error.message;
      } catch { /* ignore parse error */ }
      const e = new Error(msg) as Error & { status: number };
      e.status = res.status;
      throw e;
    }
    const data = await res.json();
    if (!data?.candidates?.length) {
      const blockReason = data?.promptFeedback?.blockReason ?? 'unknown';
      throw new Error(`no_candidates:${blockReason}`);
    }
    const cand = data.candidates[0];
    const parts: Array<{ text?: string; thought?: boolean }> = cand?.content?.parts ?? [];
    const responsePart = parts.find((p) => p.text && p.text.trim() && !p.thought);
    const text = responsePart?.text?.trim() ?? '';
    if (!text) {
      const finishReason = cand?.finishReason ?? 'unknown';
      throw new Error(`empty_response:${finishReason}`);
    }
    return text;
  }

  let resposta = '';
  let usedModel = GEMINI_MODEL;
  // Returns a 502 Response based on the error message from a failed Gemini call.
  function geminiErrorResponse(err: unknown, model: string): Response {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('no_candidates:')) {
      return new Response(
        JSON.stringify({ error: 'A IA não pôde processar a pergunta devido a restrições de segurança. Tente reformulá-la de outra forma.' }),
        { status: 502, headers: { ...corsH, 'Content-Type': 'application/json' } },
      );
    }
    if (msg.startsWith('empty_response:')) {
      return new Response(
        JSON.stringify({ error: 'A IA não conseguiu gerar uma resposta adequada. Tente reformular sua pergunta.' }),
        { status: 502, headers: { ...corsH, 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ error: 'Serviço de IA temporariamente indisponível. Tente novamente.', model }),
      { status: 502, headers: { ...corsH, 'Content-Type': 'application/json' } },
    );
  }

  // Helper: retry a specific model with only the hardcoded SYSTEM_PROMPT (no custom
  // instructions, no FAQ). This is the last resort when every attempt with the full prompt
  // fails — for example, because custom data added via the admin panel triggers Gemini's
  // safety filters, causing every request to be blocked regardless of model.
  async function callWithBasePrompt(modelName: string): Promise<string> {
    console.warn(`[ai-concierge] Retrying ${modelName} with base SYSTEM_PROMPT only (no custom data)...`);
    const r = await callGeminiModel(modelName, buildBasePayload(modelName));
    console.log(`[ai-concierge] Base-prompt retry succeeded (${modelName}).`);
    return r;
  }

  try {
    resposta = await callGeminiModel(GEMINI_MODEL, geminiPayload);
  } catch (primaryErr) {
    console.warn('[ai-concierge] Primary model failed:', primaryErr instanceof Error ? primaryErr.message : primaryErr);
    // Attempt fallback model if configured and different from primary
    if (GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
      usedModel = GEMINI_FALLBACK_MODEL;
      const fallbackPayload = {
        ...geminiPayload,
        generationConfig: buildGenerationConfig(modelSupportsThinking(GEMINI_FALLBACK_MODEL), temperature),
      };
      try {
        resposta = await callGeminiModel(GEMINI_FALLBACK_MODEL, fallbackPayload);
        console.log('[ai-concierge] Fallback model succeeded:', GEMINI_FALLBACK_MODEL);
      } catch (fallbackErr) {
        console.error('[ai-concierge] Both models failed. Primary:', primaryErr, '| Fallback:', fallbackErr);
        // Emergency: retry with base SYSTEM_PROMPT when custom data may be the cause.
        if (hasCustomData) {
          try {
            usedModel = GEMINI_MODEL;
            resposta = await callWithBasePrompt(GEMINI_MODEL);
          } catch {
            // Primary model with base prompt also failed — try fallback model with base prompt.
            if (GEMINI_FALLBACK_MODEL && GEMINI_FALLBACK_MODEL !== GEMINI_MODEL) {
              console.warn('[ai-concierge] Primary base-prompt retry failed — trying fallback model with base prompt...');
              try {
                usedModel = GEMINI_FALLBACK_MODEL;
                resposta = await callWithBasePrompt(GEMINI_FALLBACK_MODEL);
              } catch {
                return geminiErrorResponse(primaryErr, GEMINI_MODEL);
              }
            } else {
              return geminiErrorResponse(primaryErr, GEMINI_MODEL);
            }
          }
        } else {
          return geminiErrorResponse(primaryErr, usedModel);
        }
      }
    } else {
      // No fallback model configured — try base prompt if custom data was loaded.
      console.error('[ai-concierge] Primary model failed (no fallback):', primaryErr);
      if (hasCustomData) {
        try {
          resposta = await callWithBasePrompt(GEMINI_MODEL);
        } catch {
          return geminiErrorResponse(primaryErr, GEMINI_MODEL);
        }
      } else {
        return geminiErrorResponse(primaryErr, usedModel);
      }
    }
  }

  return new Response(
    JSON.stringify({ resposta, model: usedModel }),
    { status: 200, headers: { ...corsH, 'Content-Type': 'application/json' } },
  );
});
