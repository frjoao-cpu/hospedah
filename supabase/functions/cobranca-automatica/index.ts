// ============================================================
// HOSPEDAH — Edge Function: Cobrança Automática
//
// Dispara lembretes de cobrança via WhatsApp (Z-API) para
// cobranças vencendo em 1 ou 3 dias. Após 3 lembretes sem
// pagamento, cria alerta de inadimplência no dashboard admin.
//
// Acionada via pg_cron todos os dias às 12:00 UTC (09:00 BRT).
//
// Variáveis de ambiente necessárias:
//   SUPABASE_URL              → URL do projeto Supabase
//   SUPABASE_SERVICE_ROLE_KEY → Service Role Key
//   ZAPI_INSTANCE_ID          → ID da instância Z-API
//   ZAPI_TOKEN                → Token da instância Z-API
//
// Obs: esta função pode ser chamada manualmente via:
//   curl -X POST https://<project>.supabase.co/functions/v1/cobranca-automatica \
//     -H "Authorization: Bearer <service_role_key>"
// ============================================================

import { serve }        from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DIAS_LEMBRETE = [1, 3]; // dias antes do vencimento para enviar lembrete

serve(async (_req: Request): Promise<Response> => {
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        { auth: { persistSession: false } },
    );

    const zapiId    = Deno.env.get('ZAPI_INSTANCE_ID') ?? '';
    const zapiToken = Deno.env.get('ZAPI_TOKEN') ?? '';

    const hoje   = new Date();
    const hoje0  = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

    // ── 1. Buscar cobranças que vencem em 1 ou 3 dias ──────────────────────
    const alvos: string[] = DIAS_LEMBRETE.map((d) => {
        const dt = new Date(hoje0);
        dt.setDate(dt.getDate() + d);
        return dt.toISOString().split('T')[0];
    });

    const { data: cobrancas, error: errBusca } = await supabase
        .from('cobrancas')
        .select('*')
        .in('data_vencimento', alvos)
        .not('status_cobranca', 'in', '("pago","cancelado")');

    if (errBusca) {
        console.error('Erro ao buscar cobranças:', errBusca);
        return new Response(
            JSON.stringify({ ok: false, erro: errBusca.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
    }

    const lista = cobrancas ?? [];
    const resultados: { id: string; status: string | number }[] = [];

    // ── 2. Enviar lembrete via WhatsApp para cada cobrança ─────────────────
    for (const c of lista) {
        const fone = c.telefone_devedor?.replace(/\D/g, '') ?? '';
        const foneCompleto = fone.startsWith('55') ? fone : `55${fone}`;

        const vencimento = new Date(c.data_vencimento + 'T12:00:00Z');
        const diasRestantes = Math.round(
            (vencimento.getTime() - hoje0.getTime()) / 86_400_000,
        );

        const valorAberto = Number(c.valor_aberto ?? 0).toLocaleString('pt-BR', {
            style: 'currency', currency: 'BRL',
        });

        let msgWA = [
            `💰 *HOSPEDAH — Lembrete de Cobrança*`,
            '',
            `Olá, ${c.nome_devedor ?? 'Cliente'}!`,
            '',
            `📋 *${c.descricao}*`,
            `💵 Valor em aberto: *${valorAberto}*`,
            `📅 Vencimento: *${new Date(c.data_vencimento + 'T12:00:00Z').toLocaleDateString('pt-BR')}*`,
            diasRestantes === 1 ? `⚠️ Vence *amanhã*!` : `⏳ Vence em *${diasRestantes} dias*.`,
        ];

        if (c.codigo_pix) {
            msgWA = msgWA.concat([
                '',
                `⚡ *Código PIX (copia-e-cola):*`,
                c.codigo_pix,
            ]);
        }

        msgWA = msgWA.concat([
            '',
            `Em caso de dúvidas, entre em contato conosco.`,
            `🔗 https://hospedah.tur.br`,
        ]);

        // Enviar via Z-API se houver telefone e credenciais configuradas
        if (fone && zapiId && zapiToken) {
            try {
                const zapiRes = await fetch(
                    `https://api.z-api.io/instances/${zapiId}/token/${zapiToken}/send-text`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: foneCompleto, message: msgWA.join('\n') }),
                    },
                );
                resultados.push({ id: c.id, status: zapiRes.status });
            } catch (e) {
                console.error('Erro ao enviar WhatsApp para', c.id, e);
                resultados.push({ id: c.id, status: 'erro_envio' });
            }
        } else {
            resultados.push({ id: c.id, status: 'sem_telefone_ou_zapi' });
        }

        // Atualizar registro: incrementar lembrete_count e registrar data de envio
        const { error: errUpd } = await supabase
            .from('cobrancas')
            .update({
                lembrete_count:      (c.lembrete_count ?? 0) + 1,
                enviado_whatsapp_em: new Date().toISOString(),
                atualizado_em:       new Date().toISOString(),
            })
            .eq('id', c.id);

        if (errUpd) console.error('Erro ao atualizar lembrete_count:', errUpd);
    }

    // ── 3. Gerar alerta de inadimplência para cobranças com 3+ lembretes ───
    const { data: inadimplentes } = await supabase
        .from('cobrancas')
        .select('id, descricao, nome_devedor, valor_aberto, data_vencimento')
        .gte('lembrete_count', 3)
        .not('status_cobranca', 'in', '("pago","cancelado")');

    if (inadimplentes && inadimplentes.length > 0) {
        const { data: adminProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', 'admin')
            .limit(1)
            .maybeSingle();

        if (adminProfile?.id) {
            const chaveAlerta = 'alerta_inadimplencia_' + new Date().toISOString().slice(0, 10);
            await supabase.from('hospeda_data').upsert(
                {
                    user_id: adminProfile.id,
                    chave:   chaveAlerta,
                    valor:   {
                        data:          new Date().toISOString(),
                        total:         inadimplentes.length,
                        inadimplentes: inadimplentes.map((i) => ({
                            id:             i.id,
                            descricao:      i.descricao,
                            nome_devedor:   i.nome_devedor,
                            valor_aberto:   i.valor_aberto,
                            data_vencimento: i.data_vencimento,
                        })),
                    },
                    atualizado_em: new Date().toISOString(),
                },
                { onConflict: 'user_id,chave' },
            );
        }
    }

    return new Response(
        JSON.stringify({
            ok:            true,
            lembretes_enviados: resultados.length,
            inadimplentes: inadimplentes?.length ?? 0,
            resultados,
        }),
        { headers: { 'Content-Type': 'application/json' } },
    );
});
