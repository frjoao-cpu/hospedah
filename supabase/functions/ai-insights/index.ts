// ============================================================
// HOSPEDAH — Edge Function: Insights IA (Google Gemini 2.5 Flash)
//
// Variáveis de ambiente necessárias (Supabase Dashboard → Settings → Edge Functions):
//   GEMINI_API_KEY  → chave da API Google AI Studio (gratuita em aistudio.google.com)
//
// Payload esperado (POST JSON):
//   {
//     totalVenda: number,
//     totalCaptacao: number,
//     lucroTotal: number,
//     margemLucro: number | null,
//     ticketMedio: number,
//     reservasAtivas: number,
//     reservasComCaptacao: number,
//     rentabilidadeCaptacao: number | null,
//     avalMedia: string | null,
//     countAval: number,
//     canais: Array<{ nome: string, count: number, pct: number, receita: number, receitaPct: number, avalMedia: string | null }>,
//     lucro12meses: Array<{ mes: string, lucro: number }>
//   }
//
// Resposta:
//   { insights: string }   → em caso de sucesso
//   { error: string }      → em caso de falha
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin':  'https://hospedah.tur.br',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Vary': 'Origin',
};

const SYSTEM_PROMPT = `Você é um consultor especialista em agências de viagem e turismo no Brasil.
Sua tarefa é analisar métricas de desempenho de uma agência de viagens e fornecer insights acionáveis e recomendações práticas.

Instruções:
- Responda SEMPRE em português do Brasil, de forma profissional e objetiva.
- Use emojis com moderação para organizar visualmente os tópicos.
- Estruture sua resposta em tópicos curtos e diretos.
- Destaque pontos positivos, alertas e oportunidades de melhoria.
- Forneça no máximo 5 insights/recomendações práticas e concretas.
- Seja específico com base nos dados fornecidos — não invente informações.
- Foque em ações que o agente pode tomar para melhorar o desempenho.`;

interface CanalData {
  nome: string;
  count: number;
  pct: number;
  receita: number;
  receitaPct: number;
  avalMedia: string | null;
}

interface Lucro12Mes {
  mes: string;
  lucro: number;
}

interface InsightsPayload {
  totalVenda: number;
  totalCaptacao: number;
  lucroTotal: number;
  margemLucro: number | null;
  ticketMedio: number;
  reservasAtivas: number;
  reservasComCaptacao: number;
  rentabilidadeCaptacao: number | null;
  avalMedia: string | null;
  countAval: number;
  canais: CanalData[];
  lucro12meses: Lucro12Mes[];
}

function formatBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildUserPrompt(data: InsightsPayload): string {
  const linhas: string[] = [
    '## Dados de Desempenho da Agência HOSPEDAH\n',
    `**Resumo Financeiro:**`,
    `- Total de Vendas: ${formatBRL(data.totalVenda)}`,
    `- Total de Captação (custo): ${formatBRL(data.totalCaptacao)}`,
    `- Lucro Consolidado: ${formatBRL(data.lucroTotal)}`,
    data.margemLucro !== null
      ? `- Margem de Lucro: ${data.margemLucro.toFixed(1)}%`
      : '- Margem de Lucro: não calculável (sem dados suficientes)',
    `- Ticket Médio por Reserva: ${formatBRL(data.ticketMedio)}`,
    `- Reservas Ativas: ${data.reservasAtivas}`,
    `- Reservas com Captação registrada: ${data.reservasComCaptacao}`,
    data.rentabilidadeCaptacao !== null
      ? `- Rentabilidade sobre Captação: ${data.rentabilidadeCaptacao.toFixed(1)}%`
      : '',
    data.avalMedia
      ? `- Avaliação Média dos Hóspedes: ${data.avalMedia} ⭐ (${data.countAval} avaliações)`
      : '- Avaliações: nenhuma registrada ainda',
    '',
  ];

  if (data.canais && data.canais.length > 0) {
    linhas.push('**Canais de Venda:**');
    data.canais.forEach((c) => {
      const aval = c.avalMedia ? ` · Avaliação: ${c.avalMedia}⭐` : '';
      linhas.push(
        `- ${c.nome}: ${c.count} reservas (${c.pct}%) · Receita: ${formatBRL(c.receita)} (${c.receitaPct}%)${aval}`,
      );
    });
    linhas.push('');
  }

  if (data.lucro12meses && data.lucro12meses.length > 0) {
    linhas.push('**Lucro — Últimos 12 Meses:**');
    data.lucro12meses.forEach((m) => {
      linhas.push(`- ${m.mes}: ${formatBRL(m.lucro)}`);
    });
    linhas.push('');
  }

  linhas.push(
    'Com base nesses dados, forneça até 5 insights práticos e recomendações acionáveis para melhorar o desempenho da agência.',
  );

  return linhas.join('\n');
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

  let payload: InsightsPayload;
  try {
    payload = await req.json() as InsightsPayload;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Payload JSON inválido.' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  if (!payload || typeof payload.reservasAtivas !== 'number') {
    return new Response(
      JSON.stringify({ error: 'Dados de desempenho inválidos ou ausentes.' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  const userPrompt = buildUserPrompt(payload);

  const geminiPayload = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 768,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  let geminiRes: Response;
  try {
    geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
    });
  } catch (err) {
    console.error('[ai-insights] Erro ao chamar Gemini:', err);
    return new Response(
      JSON.stringify({ error: 'Falha de comunicação com a IA. Tente novamente.' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  if (!geminiRes.ok) {
    const errBody = await geminiRes.text();
    console.error('[ai-insights] Gemini retornou erro:', geminiRes.status, errBody);
    return new Response(
      JSON.stringify({ error: 'Serviço de IA indisponível. Tente mais tarde.' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  const geminiData = await geminiRes.json();
  const insights: string =
    geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

  if (!insights) {
    return new Response(
      JSON.stringify({ error: 'A IA não gerou insights. Tente novamente.' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({ insights }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});
