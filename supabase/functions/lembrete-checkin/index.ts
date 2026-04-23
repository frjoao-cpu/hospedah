// ============================================================
// HOSPEDAH — Edge Function: Lembrete de Check-in D-1
//
// Dispara mensagem WhatsApp para hóspedes com check-in amanhã.
// Acionada via pg_cron todos os dias às 12:00 UTC (09:00 BRT).
//
// Variáveis de ambiente necessárias:
//   SUPABASE_URL           → URL do projeto Supabase
//   SUPABASE_SERVICE_ROLE_KEY → Service Role Key (não a anon key)
//   ZAPI_INSTANCE_ID       → ID da instância Z-API
//   ZAPI_TOKEN             → Token da instância Z-API
//
// Obs: esta função pode ser chamada manualmente via:
//   curl -X POST https://<project>.supabase.co/functions/v1/lembrete-checkin \
//     -H "Authorization: Bearer <service_role_key>"
// ============================================================

import { serve }          from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient }   from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (_req: Request): Promise<Response> => {
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } },
    );

    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const amanhaStr = amanha.toISOString().split('T')[0];

    const { data: reservas, error } = await supabase
        .from('reservas_hospede')
        .select('*')
        .eq('data_entrada', amanhaStr)
        .eq('status', 'confirmada');

    if (error) {
        console.error('Erro ao buscar reservas:', error);
        return new Response(
            JSON.stringify({ ok: false, erro: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }

    const zapiId    = Deno.env.get('ZAPI_INSTANCE_ID');
    const zapiToken = Deno.env.get('ZAPI_TOKEN');
    const resultados: { id: string; status: number | string }[] = [];

    for (const reserva of reservas ?? []) {
        const fone = reserva.telefone?.replace(/\D/g, '');
        if (!fone || !zapiId || !zapiToken) {
            resultados.push({ id: reserva.id, status: 'sem_telefone_ou_zapi' });
            continue;
        }
        /* Evita duplo prefixo se o número já inclui o DDI 55 */
        const foneCompleto = fone.startsWith('55') ? fone : `55${fone}`;

        const msg = [
            `🌟 *Lembrete de Check-in — HOSPEDAH*`,
            '',
            `Olá, ${reserva.nome_hospede}!`,
            `Seu check-in no *${reserva.resort_nome ?? 'resort'}* é *amanhã* (${reserva.data_entrada}).`,
            '',
            `👥 Hóspedes: ${reserva.num_hospedes}`,
            '',
            `Em caso de dúvidas ou imprevistos, entre em contato conosco.`,
            `Boa viagem! 🏖️`,
            '',
            `🔗 https://hospedah.tur.br`,
        ].join('\n');

        const zapiRes = await fetch(
            `https://api.z-api.io/instances/${zapiId}/token/${zapiToken}/send-text`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: foneCompleto, message: msg }),
            },
        );
        resultados.push({ id: reserva.id, status: zapiRes.status });
    }

    return new Response(
        JSON.stringify({ ok: true, data: amanhaStr, enviados: resultados.length, resultados }),
        { headers: { 'Content-Type': 'application/json' } },
    );
});
