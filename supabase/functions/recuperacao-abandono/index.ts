// ============================================================
// HOSPEDAH — Edge Function: Recuperação de abandono de reserva
//
// Acionada via Database Webhook quando um registro é inserido
// na tabela `abandono_reserva`.
// Agenda uma notificação push via OneSignal 30 min depois.
//
// Variáveis de ambiente necessárias:
//   ONESIGNAL_APP_ID   → App ID da conta OneSignal
//   ONESIGNAL_API_KEY  → REST API Key da conta OneSignal
//
// Como configurar o Webhook no Supabase:
//   Dashboard → Database → Webhooks → Create Webhook
//   Table: abandono_reserva | Events: INSERT
//   URL: https://<project>.supabase.co/functions/v1/recuperacao-abandono
// ============================================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

interface AbandonoRecord {
    id: string;
    session_id: string;
    resort_nome?: string;
    email_hospede?: string;
    data_entrada?: string;
    data_saida?: string;
    valor_estimado?: number;
}

serve(async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') {
        return new Response('Método não permitido', { status: 405 });
    }

    let payload: { record?: AbandonoRecord };
    try {
        payload = await req.json();
    } catch {
        return new Response('Payload inválido', { status: 400 });
    }

    const record = payload?.record;

    // Ignora se não há resort_nome (busca muito vaga para recuperar)
    if (!record?.resort_nome) {
        return new Response(
            JSON.stringify({ ok: true, ignorado: 'sem_resort_nome' }),
            { headers: { 'Content-Type': 'application/json' } },
        );
    }

    const appId  = Deno.env.get('ONESIGNAL_APP_ID');
    const apiKey = Deno.env.get('ONESIGNAL_API_KEY');

    if (!appId || !apiKey) {
        return new Response(
            JSON.stringify({ ok: false, motivo: 'OneSignal não configurado' }),
            { headers: { 'Content-Type': 'application/json' } },
        );
    }

    // Agenda o push para 30 minutos a partir de agora
    const sendAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // Monta URL de retorno com pré-seleção do resort
    const retornoUrl = [
        'https://hospedah.tur.br/reservas.html',
        `?resort=${encodeURIComponent(record.resort_nome)}`,
        record.data_entrada ? `&checkin=${record.data_entrada}` : '',
        record.data_saida   ? `&checkout=${record.data_saida}`  : '',
    ].join('');

    const corpo = record.data_entrada
        ? `${record.resort_nome} ainda tem vaga em ${record.data_entrada}! Finalize sua reserva agora.`
        : `${record.resort_nome} ainda tem disponibilidade! Conclua sua reserva com a HOSPEDAH.`;

    const pushRes = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            app_id: appId,
            included_segments: ['Subscribed Users'],
            send_after: sendAt,
            headings:  { pt: '🏨 Sua reserva está esperando por você!' },
            contents:  { pt: corpo },
            url:       retornoUrl,
            // Evita spam: um push por sessão de abandono
            web_push_topic: `abandono_${record.session_id}`,
        }),
    });

    return new Response(
        JSON.stringify({ ok: true, push_status: pushRes.status, agendado_para: sendAt }),
        { headers: { 'Content-Type': 'application/json' } },
    );
});
