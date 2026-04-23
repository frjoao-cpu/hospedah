// ============================================================
// HOSPEDAH — Edge Function: Notificação automática de reserva
//
// Acionada via Database Webhook do Supabase quando um novo
// registro é inserido na tabela `reservas_hospede`.
//
// Variáveis de ambiente necessárias:
//   ZAPI_INSTANCE_ID       → ID da instância Z-API
//   ZAPI_TOKEN             → Token da instância Z-API
//   WHATSAPP_ADMIN_NUMBER  → Número do admin (ex: 5517982006382)
//   RESEND_API_KEY         → Chave da API Resend para e-mail
//   RESEND_FROM            → Remetente (ex: HOSPEDAH <noreply@hospedah.tur.br>)
//
// Como configurar o Webhook no Supabase:
//   Dashboard → Database → Webhooks → Create Webhook
//   Table: reservas_hospede | Events: INSERT
//   URL: https://<project>.supabase.co/functions/v1/notificacao-reserva
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

interface Reserva {
    id: string;
    nome_hospede: string;
    email_hospede: string;
    telefone?: string;
    resort_nome?: string;
    data_entrada: string;
    data_saida: string;
    num_hospedes: number;
    mensagem?: string;
}

serve(async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
        return new Response('Método não permitido', { status: 405 });
    }

    let payload: { record?: Reserva; type?: string };
    try {
        payload = await req.json();
    } catch {
        return new Response('Payload inválido', { status: 400 });
    }

    // Aceita tanto webhooks do Supabase quanto chamadas diretas com { record: ... }
    const record = payload?.record;
    if (!record) {
        return new Response('record ausente no payload', { status: 400 });
    }

    const zapiId    = Deno.env.get('ZAPI_INSTANCE_ID');
    const zapiToken = Deno.env.get('ZAPI_TOKEN');
    const adminPhone = Deno.env.get('WHATSAPP_ADMIN_NUMBER') ?? '5517982006382';
    const resendKey  = Deno.env.get('RESEND_API_KEY');
    const resendFrom = Deno.env.get('RESEND_FROM') ?? 'HOSPEDAH <noreply@hospedah.tur.br>';

    const results: string[] = [];

    // ── 1. WhatsApp para o admin via Z-API ──────────────────
    if (zapiId && zapiToken) {
        const msgAdmin = [
            '🏨 *Nova reserva recebida — HOSPEDAH*',
            '',
            `👤 *Hóspede:*  ${record.nome_hospede}`,
            `📱 *Telefone:* ${record.telefone ?? '—'}`,
            `📧 *E-mail:*   ${record.email_hospede}`,
            `🏖️ *Resort:*   ${record.resort_nome ?? '—'}`,
            `📅 *Check-in:* ${record.data_entrada}`,
            `📅 *Check-out:*${record.data_saida}`,
            `👥 *Hóspedes:* ${record.num_hospedes}`,
            `💬 *Mensagem:* ${record.mensagem ?? '—'}`,
            '',
            `🔗 Painel: https://hospedah.tur.br/painel.html`,
        ].join('\n');

        const zapiRes = await fetch(
            `https://api.z-api.io/instances/${zapiId}/token/${zapiToken}/send-text`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: adminPhone, message: msgAdmin }),
            },
        );
        results.push(`zapi_admin:${zapiRes.status}`);
    }

    // ── 2. WhatsApp de confirmação ao hóspede ───────────────
    if (zapiId && zapiToken && record.telefone) {
        const fone = record.telefone.replace(/\D/g, '');
        const msgHospede = [
            `✅ *Solicitação recebida — HOSPEDAH*`,
            '',
            `Olá, ${record.nome_hospede}! Recebemos sua solicitação de reserva no *${record.resort_nome ?? 'resort selecionado'}*.`,
            '',
            `📅 Check-in:  ${record.data_entrada}`,
            `📅 Check-out: ${record.data_saida}`,
            `👥 Hóspedes:  ${record.num_hospedes}`,
            '',
            `Nossa equipe entrará em contato em breve para confirmar os detalhes.`,
            `Dúvidas? Responda esta mensagem. 😊`,
        ].join('\n');

        const zapiHospede = await fetch(
            `https://api.z-api.io/instances/${zapiId}/token/${zapiToken}/send-text`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: `55${fone}`, message: msgHospede }),
            },
        );
        results.push(`zapi_hospede:${zapiHospede.status}`);
    }

    // ── 3. E-mail de confirmação ao hóspede via Resend ──────
    if (resendKey && record.email_hospede) {
        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: resendFrom,
                to:   [record.email_hospede],
                subject: `✅ Solicitação recebida — ${record.resort_nome ?? 'HOSPEDAH'}`,
                html: `
<!DOCTYPE html>
<html lang="pt-br">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px">
  <div style="max-width:600px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">
    <div style="background:#0B1C3D;padding:24px;text-align:center">
      <h1 style="color:#D4AF37;margin:0;font-size:28px">HOSPEDAH</h1>
      <p style="color:#aab4c4;margin:6px 0 0">Sua experiência começa aqui</p>
    </div>
    <div style="padding:24px">
      <h2 style="color:#0B1C3D">Olá, ${record.nome_hospede}! ✅</h2>
      <p>Recebemos sua solicitação de reserva. Nossa equipe entrará em contato em breve para confirmar os detalhes.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr style="background:#f9f9f9">
          <td style="padding:10px;font-weight:bold;border-bottom:1px solid #eee">Resort</td>
          <td style="padding:10px;border-bottom:1px solid #eee">${record.resort_nome ?? '—'}</td>
        </tr>
        <tr>
          <td style="padding:10px;font-weight:bold;border-bottom:1px solid #eee">Check-in</td>
          <td style="padding:10px;border-bottom:1px solid #eee">${record.data_entrada}</td>
        </tr>
        <tr style="background:#f9f9f9">
          <td style="padding:10px;font-weight:bold;border-bottom:1px solid #eee">Check-out</td>
          <td style="padding:10px;border-bottom:1px solid #eee">${record.data_saida}</td>
        </tr>
        <tr>
          <td style="padding:10px;font-weight:bold">Hóspedes</td>
          <td style="padding:10px">${record.num_hospedes}</td>
        </tr>
      </table>
      <p>Dúvidas? Fale conosco pelo WhatsApp:</p>
      <a href="https://wa.me/5517982006382"
         style="display:inline-block;background:#25D366;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
        💬 Falar pelo WhatsApp
      </a>
    </div>
    <div style="background:#f4f4f4;padding:16px;text-align:center;font-size:12px;color:#999">
      HOSPEDAH — <a href="https://hospedah.tur.br" style="color:#0B1C3D">hospedah.tur.br</a>
    </div>
  </div>
</body>
</html>
                `,
            }),
        });
        results.push(`resend:${emailRes.status}`);
    }

    return new Response(
        JSON.stringify({ ok: true, resultados: results }),
        { headers: { 'Content-Type': 'application/json' } },
    );
});
