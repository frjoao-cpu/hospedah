// ============================================================
// HOSPEDAH — Edge Function: Nurturing por e-mail pós-captura
//
// Invocada pelo cron a cada hora (via supabase_cron.sql):
//   SELECT net.http_post(
//     url := '<project_url>/functions/v1/nurturing-email',
//     headers := '{"Authorization": "Bearer <anon_key>"}'::jsonb
//   );
//
// Ou manualmente via Supabase Dashboard → Edge Functions → Invoke.
//
// Variáveis de ambiente necessárias:
//   RESEND_API_KEY  → Chave da API Resend
//   RESEND_FROM     → Remetente (ex: HOSPEDAH <noreply@hospedah.tur.br>)
//   SUPABASE_URL    → URL do projeto Supabase
//   SUPABASE_SERVICE_ROLE_KEY → Service role key (acesso total à fila)
// ============================================================

import { serve }        from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Sequências de e-mail ─────────────────────────────────────
// Cada entrada: { diasAposAnterior, assunto, corpo }
const SEQUENCES: Record<string, EmailStep[]> = {
  orcamento: [
    {
      diasAposAnterior: 0,
      assunto: '🏨 Seu orçamento HOSPEDAH está sendo preparado!',
      corpo: (d: NurturingRecord) => `
<p>Olá, <strong>${d.nome || 'Viajante'}</strong>! 👋</p>
<p>Recebemos sua solicitação de orçamento para <strong>${d.resort || 'nossos resorts'}</strong>
${d.data_entrada ? `com check-in em <strong>${formatDate(d.data_entrada)}</strong>` : ''}.</p>
<p>Nossa equipe já está preparando as melhores opções para você.</p>
<p>Enquanto isso, explore nossos resorts disponíveis:</p>
<p style="text-align:center;">
  <a href="https://hospedah.tur.br/busca.html"
     style="display:inline-block;padding:12px 28px;background:#D4AF37;color:#0B1C3D;border-radius:10px;font-weight:700;text-decoration:none;">
    🔍 Ver todos os resorts
  </a>
</p>
<p>Em caso de dúvidas, responda este e-mail ou fale conosco pelo
<a href="https://wa.me/5517982006382">WhatsApp</a>.</p>`,
    },
    {
      diasAposAnterior: 1,
      assunto: '⭐ Veja o que incluem nossos resorts premium',
      corpo: (d: NurturingRecord) => `
<p>Olá, <strong>${d.nome || 'Viajante'}</strong>!</p>
<p>Você sabia que nossos resorts oferecem muito mais do que uma simples hospedagem?</p>
<ul>
  <li>🌊 Parques aquáticos e thermas</li>
  <li>🍽️ Gastronomia premium e café da manhã incluso</li>
  <li>💆 SPA e área de relaxamento</li>
  <li>👨‍👩‍👧 Programas para crianças e toda família</li>
  <li>🅿️ Estacionamento e Wi-Fi inclusos</li>
</ul>
<p>Veja avaliações reais de nossos hóspedes:</p>
<p style="text-align:center;">
  <a href="https://hospedah.tur.br/avaliacoes.html"
     style="display:inline-block;padding:12px 28px;background:#D4AF37;color:#0B1C3D;border-radius:10px;font-weight:700;text-decoration:none;">
    ⭐ Ver avaliações
  </a>
</p>`,
    },
    {
      diasAposAnterior: 2,
      assunto: '🏷️ Oferta especial para sua viagem',
      corpo: (d: NurturingRecord) => `
<p>Olá, <strong>${d.nome || 'Viajante'}</strong>!</p>
<p>Como você demonstrou interesse em ${d.resort ? `<strong>${d.resort}</strong>` : 'nossos resorts'},
preparamos uma proposta especial para você.</p>
<p>Entre em contato agora e garanta condições exclusivas:</p>
<p style="text-align:center;">
  <a href="https://wa.me/5517982006382?text=Ol%C3%A1%21+Tenho+interesse+no+or%C3%A7amento+para+${encodeURIComponent(d.resort || 'um resort')}"
     style="display:inline-block;padding:12px 28px;background:#25D366;color:#fff;border-radius:10px;font-weight:700;text-decoration:none;">
    💬 Falar agora no WhatsApp
  </a>
</p>
<p><small>💳 Parcelamos em até 12x no cartão &nbsp;|&nbsp; ⚡ PIX com confirmação imediata</small></p>`,
    },
    {
      diasAposAnterior: 4,
      assunto: '⏰ Sua viagem merece ser confirmada logo!',
      corpo: (d: NurturingRecord) => `
<p>Olá, <strong>${d.nome || 'Viajante'}</strong>!</p>
<p>As datas mais procuradas têm disponibilidade limitada.
${d.data_entrada ? `Seu check-in planejado para <strong>${formatDate(d.data_entrada)}</strong> se aproxima!` : 'Não deixe para a última hora!'}</p>
<p>Confirme sua reserva e garanta sua vaga:</p>
<p style="text-align:center;">
  <a href="https://hospedah.tur.br/reservas.html"
     style="display:inline-block;padding:12px 28px;background:#D4AF37;color:#0B1C3D;border-radius:10px;font-weight:700;text-decoration:none;">
    📅 Confirmar minha reserva
  </a>
</p>
<p><small>Se você já realizou sua reserva, ignore este e-mail. 😊</small></p>`,
    },
  ],

  reserva: [
    {
      diasAposAnterior: 0,
      assunto: '✅ Pré-reserva HOSPEDAH recebida!',
      corpo: (d: NurturingRecord) => `
<p>Olá, <strong>${d.nome || 'Hóspede'}</strong>! 🎉</p>
<p>Sua pré-reserva ${d.resort ? `em <strong>${d.resort}</strong>` : ''} foi recebida com sucesso!</p>
${d.data_entrada ? `<p>📅 Check-in: <strong>${formatDate(d.data_entrada)}</strong></p>` : ''}
<p>Nossa equipe confirma a disponibilidade e entra em contato em até <strong>2 horas úteis</strong>.</p>
<p>Acompanhe pelo painel:</p>
<p style="text-align:center;">
  <a href="https://hospedah.tur.br/painel.html"
     style="display:inline-block;padding:12px 28px;background:#D4AF37;color:#0B1C3D;border-radius:10px;font-weight:700;text-decoration:none;">
    📊 Meu Painel
  </a>
</p>`,
    },
    {
      diasAposAnterior: -1, // D-1 antes do check-in
      assunto: '🎒 Sua viagem começa amanhã! Dicas para aproveitar ao máximo',
      corpo: (d: NurturingRecord) => `
<p>Olá, <strong>${d.nome || 'Hóspede'}</strong>! Amanhã é o grande dia! 🎉</p>
<p>Aqui vão algumas dicas para sua chegada ${d.resort ? `ao <strong>${d.resort}</strong>` : ''}:</p>
<ul>
  <li>✅ Leve RG ou CNH de todos os hóspedes</li>
  <li>🕐 Check-in geralmente a partir das 15h</li>
  <li>🚗 Informe sua placa para o estacionamento</li>
  <li>📱 Salve nosso WhatsApp para qualquer dúvida: +55 17 98200-6382</li>
</ul>
<p>Boa viagem! 🏖️</p>`,
    },
    {
      diasAposAnterior: 2, // D+1 pós check-out
      assunto: '🌟 Como foi sua experiência na HOSPEDAH?',
      corpo: (d: NurturingRecord) => `
<p>Olá, <strong>${d.nome || 'Hóspede'}</strong>!</p>
<p>Esperamos que sua estadia ${d.resort ? `no <strong>${d.resort}</strong>` : ''} tenha sido incrível! 😊</p>
<p>Sua opinião é muito importante para nós e ajuda outros viajantes:</p>
<p style="text-align:center;">
  <a href="https://hospedah.tur.br/avaliacoes.html"
     style="display:inline-block;padding:12px 28px;background:#D4AF37;color:#0B1C3D;border-radius:10px;font-weight:700;text-decoration:none;">
    ⭐ Deixar minha avaliação
  </a>
</p>
<p>Além disso, <strong>indique amigos e ganhe pontos de fidelidade</strong>:</p>
<p style="text-align:center;">
  <a href="https://hospedah.tur.br/referral.html"
     style="display:inline-block;padding:10px 22px;background:transparent;color:#D4AF37;border:2px solid #D4AF37;border-radius:10px;font-weight:700;text-decoration:none;">
    🎁 Indicar e Ganhar
  </a>
</p>`,
    },
  ],
};

interface EmailStep {
  diasAposAnterior: number;
  assunto: string;
  corpo: (d: NurturingRecord) => string;
}

interface NurturingRecord {
  id: string;
  email: string;
  nome: string;
  resort: string | null;
  data_entrada: string | null;
  sequencia: string;
  etapa: number;
}

function formatDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

function buildEmail(record: NurturingRecord, step: EmailStep): string {
  return `<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${step.assunto}</title></head>
<body style="margin:0;padding:0;background:#0d1b2e;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1b2e;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" style="background:#10233c;border-radius:14px;overflow:hidden;max-width:100%;">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#0B1C3D,#142850);padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#D4AF37;font-size:1.5em;letter-spacing:.05em;">HOSPEDAH</h1>
          <p style="margin:4px 0 0;color:#aab4c4;font-size:.82em;">Resorts &amp; Experiências Exclusivas</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px 32px;color:#e8eaf0;font-size:.95em;line-height:1.65;">
          ${step.corpo(record)}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:18px 32px;background:#0B1C3D;text-align:center;font-size:.75em;color:#aab4c4;border-top:1px solid rgba(212,175,55,.12);">
          <p style="margin:0 0 8px;">© 2026 HOSPEDAH — Todos os direitos reservados.</p>
          <p style="margin:0;">
            <a href="https://hospedah.tur.br/privacidade.html" style="color:#D4AF37;">Política de Privacidade</a>
            &nbsp;|&nbsp;
            <a href="https://hospedah.tur.br" style="color:#D4AF37;">hospedah.tur.br</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (): Promise<Response> => {
  const supabaseUrl     = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendKey       = Deno.env.get('RESEND_API_KEY');
  const resendFrom      = Deno.env.get('RESEND_FROM') ?? 'HOSPEDAH <noreply@hospedah.tur.br>';

  if (!resendKey) {
    return new Response('RESEND_API_KEY não configurada', { status: 500 });
  }

  const sb = createClient(supabaseUrl, serviceRoleKey);

  // Busca até 20 registros pendentes com proxima_em <= now()
  const { data: pendentes, error } = await sb
    .from('email_nurturing_queue')
    .select('*')
    .eq('status', 'pendente')
    .lte('proxima_em', new Date().toISOString())
    .order('proxima_em', { ascending: true })
    .limit(20);

  if (error) {
    return new Response('Erro ao buscar fila: ' + error.message, { status: 500 });
  }

  const resultados: string[] = [];

  for (const rec of (pendentes ?? []) as NurturingRecord[]) {
    const seq   = SEQUENCES[rec.sequencia] ?? SEQUENCES['orcamento'];
    const step  = seq[rec.etapa - 1];

    if (!step) {
      // Sequência esgotada — marca como enviado
      await sb.from('email_nurturing_queue')
        .update({ status: 'enviado' })
        .eq('id', rec.id);
      resultados.push(`${rec.email}: sequência concluída`);
      continue;
    }

    const html = buildEmail(rec, step);

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    resendFrom,
        to:      [rec.email],
        subject: step.assunto,
        html,
      }),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      await sb.from('email_nurturing_queue')
        .update({ status: 'erro', ultimo_erro: err, tentativas: (rec as any).tentativas + 1 })
        .eq('id', rec.id);
      resultados.push(`${rec.email}: ERRO — ${err}`);
      continue;
    }

    // Calcula próxima etapa
    const nextStep = seq[rec.etapa]; // etapa é 1-based, então seq[etapa] é o próximo
    if (nextStep) {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + nextStep.diasAposAnterior);
      await sb.from('email_nurturing_queue')
        .update({
          status:    'pendente',
          etapa:     rec.etapa + 1,
          proxima_em: nextDate.toISOString(),
        })
        .eq('id', rec.id);
    } else {
      await sb.from('email_nurturing_queue')
        .update({ status: 'enviado' })
        .eq('id', rec.id);
    }

    resultados.push(`${rec.email}: etapa ${rec.etapa} enviada OK`);
  }

  return new Response(
    JSON.stringify({ processados: resultados.length, detalhes: resultados }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
