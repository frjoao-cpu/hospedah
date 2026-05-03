-- ============================================================
-- HOSPEDAH — pg_cron: Jobs agendados no banco de dados
--
-- Execute este script no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql
--
-- Pré-requisito: a extensão pg_cron deve estar habilitada.
-- Supabase habilita via: Dashboard → Database → Extensions → pg_cron
-- ============================================================

-- ── Ativar extensão (idempotente) ────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;  -- necessário para chamadas HTTP

GRANT USAGE ON SCHEMA cron TO postgres;

-- ============================================================
-- 1. LEMBRETE DE CHECK-IN — todo dia às 12:00 UTC (09:00 BRT)
--    Chama a Edge Function lembrete-checkin
--
-- IMPORTANTE: Substitua '<SERVICE_ROLE_KEY>' pela Service Role Key
-- do seu projeto Supabase antes de executar.
-- Encontre em: Dashboard → Settings → API → service_role key
-- ============================================================
SELECT cron.schedule(
    'lembrete-checkin-diario',
    '0 12 * * *',
    $$
    SELECT net.http_post(
        url     := 'https://ydrmjoppjxtmnwtvtinb.supabase.co/functions/v1/lembrete-checkin',
        headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
        body    := '{}'::jsonb
    );
    $$
) ON CONFLICT (jobname) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      command  = EXCLUDED.command;

-- ============================================================
-- 2. ATUALIZAÇÃO DE NÍVEL DE FIDELIDADE — todo domingo 03:00 UTC
--    Bronze → Prata (≥3 estadias) → Ouro (≥10 estadias)
-- ============================================================
SELECT cron.schedule(
    'atualizar-nivel-fidelidade',
    '0 3 * * 0',
    $$
    UPDATE fidelidade
    SET
        nivel = CASE
            WHEN total_estadias >= 10 THEN 'ouro'
            WHEN total_estadias >= 3  THEN 'prata'
            ELSE 'bronze'
        END,
        atualizado_em = now();
    $$
) ON CONFLICT (jobname) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      command  = EXCLUDED.command;

-- ============================================================
-- 3. LIMPEZA DE ABANDONOS ANTIGOS — toda segunda 02:00 UTC
--    Remove registros de abandono_reserva com mais de 30 dias
-- ============================================================
SELECT cron.schedule(
    'limpar-abandonos-antigos',
    '0 2 * * 1',
    $$
    DELETE FROM abandono_reserva
    WHERE criado_em < now() - INTERVAL '30 days';
    $$
) ON CONFLICT (jobname) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      command  = EXCLUDED.command;

-- ============================================================
-- 4. RELATÓRIO SEMANAL DE OCUPAÇÃO — toda segunda 08:00 UTC
--    Salva métricas na tabela hospeda_data para o dashboard admin
-- ============================================================
SELECT cron.schedule(
    'relatorio-ocupacao-semanal',
    '0 8 * * 1',
    $$
    INSERT INTO hospeda_data (user_id, chave, valor, atualizado_em)
    SELECT
        (SELECT id FROM auth.users
         WHERE raw_user_meta_data->>'role' = 'admin'
            OR id IN (SELECT id FROM profiles WHERE role = 'admin')
         LIMIT 1),
        'relatorio_ocupacao_' || to_char(now(), 'IYYY_IW'),
        jsonb_build_object(
            'semana',               to_char(now(), 'IYYY-IW'),
            'total_reservas_7d',    (SELECT COUNT(*)  FROM reservas_hospede WHERE criado_em  > now() - INTERVAL '7 days'),
            'confirmadas_7d',       (SELECT COUNT(*)  FROM reservas_hospede WHERE criado_em  > now() - INTERVAL '7 days' AND status = 'confirmada'),
            'pendentes_atual',      (SELECT COUNT(*)  FROM reservas_hospede WHERE status     = 'pendente'),
            'canceladas_7d',        (SELECT COUNT(*)  FROM reservas_hospede WHERE atualizado_em > now() - INTERVAL '7 days' AND status = 'cancelada'),
            'media_hospedes_7d',    (SELECT ROUND(AVG(num_hospedes)::numeric, 1) FROM reservas_hospede WHERE criado_em > now() - INTERVAL '7 days'),
            'avaliacoes_pendentes', (SELECT COUNT(*)  FROM avaliacoes WHERE aprovada = false),
            'mensagens_nao_lidas',  (SELECT COUNT(*)  FROM mensagens WHERE lida = false),
            'gerado_em',            now()
        ),
        now()
    ON CONFLICT (user_id, chave)
    DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now();
    $$
) ON CONFLICT (jobname) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      command  = EXCLUDED.command;

-- ============================================================
-- 5. FOLLOW-UP AUTOMÁTICO — todo dia 10:00 UTC (07:00 BRT)
--    Marca reservas pendentes com mais de 48h para follow-up
--    (cria registro em hospeda_data para alertar o admin)
-- ============================================================
SELECT cron.schedule(
    'followup-reservas-pendentes',
    '0 10 * * *',
    $$
    INSERT INTO hospeda_data (user_id, chave, valor, atualizado_em)
    SELECT
        (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
        'alerta_followup_' || to_char(now(), 'YYYY_MM_DD'),
        jsonb_build_object(
            'data',    now(),
            'reservas', (
                SELECT jsonb_agg(jsonb_build_object(
                    'id',           id,
                    'nome',         nome_hospede,
                    'telefone',     telefone,
                    'resort',       resort_nome,
                    'data_entrada', data_entrada,
                    'horas_pendente', ROUND(EXTRACT(EPOCH FROM (now() - criado_em)) / 3600)
                ))
                FROM reservas_hospede
                WHERE status = 'pendente'
                  AND criado_em < now() - INTERVAL '48 hours'
            )
        ),
        now()
    WHERE EXISTS (
        SELECT 1 FROM reservas_hospede
        WHERE status = 'pendente'
          AND criado_em < now() - INTERVAL '48 hours'
    )
    ON CONFLICT (user_id, chave)
    DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now();
    $$
) ON CONFLICT (jobname) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      command  = EXCLUDED.command;

-- ============================================================
-- 6. MANUTENÇÃO MENSAL — dia 28 de cada mês às 02:00 UTC
--    Cria partição do mês seguinte em reservas_hospede (se
--    particionada) e atualiza a materialized view dashboard_resumo.
-- ============================================================
SELECT cron.schedule(
    'manutencao-mensal-hospedah',
    '0 2 28 * *',
    $$
    SELECT manutencao_hospedah();
    $$
) ON CONFLICT (jobname) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      command  = EXCLUDED.command;

-- ============================================================
-- 7. REFRESH dashboard_resumo_global — a cada 15 minutos
--    Mantém os cards de totais globais do painel sempre frescos.
-- ============================================================
SELECT cron.schedule(
    'refresh-dashboard-global',
    '*/15 * * * *',
    $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_resumo_global;
    $$
) ON CONFLICT (jobname) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      command  = EXCLUDED.command;

-- ============================================================
-- 8. COBRANÇAS VENCIDAS — todo dia às 11:00 UTC (08:00 BRT)
--    Marca como 'vencido' toda cobrança cujo data_vencimento já passou
--    e que ainda não esteja paga, cancelada ou já marcada como vencida.
-- ============================================================
SELECT cron.schedule(
    'marcar-cobrancas-vencidas',
    '0 11 * * *',
    $$
    UPDATE cobrancas
    SET status_cobranca = 'vencido',
        atualizado_em   = now()
    WHERE data_vencimento < CURRENT_DATE
      AND status_cobranca NOT IN ('pago', 'cancelado', 'vencido');
    $$
) ON CONFLICT (jobname) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      command  = EXCLUDED.command;

-- ============================================================
-- 9. LEMBRETES DE COBRANÇA — todo dia às 12:00 UTC (09:00 BRT)
--    Dispara a Edge Function cobranca-automatica para cobranças
--    que vencem em 1 ou 3 dias (excluindo já pagas/canceladas).
-- ============================================================
SELECT cron.schedule(
    'lembretes-cobranca-diarios',
    '0 12 * * *',
    $$
    SELECT net.http_post(
        url     := 'https://ydrmjoppjxtmnwtvtinb.supabase.co/functions/v1/cobranca-automatica',
        headers := '{"Content-Type":"application/json","Authorization":"******"}'::jsonb,
        body    := '{}'::jsonb
    );
    $$
) ON CONFLICT (jobname) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      command  = EXCLUDED.command;

-- ============================================================
-- 10. RELATÓRIO SEMANAL DE INADIMPLÊNCIA — toda segunda 11:00 UTC
--     Salva em hospeda_data o resumo de cobranças vencidas e
--     com 3+ lembretes sem pagamento, para exibir no dashboard.
-- ============================================================
SELECT cron.schedule(
    'relatorio-inadimplencia-semanal',
    '0 11 * * 1',
    $$
    INSERT INTO hospeda_data (user_id, chave, valor, atualizado_em)
    SELECT
        (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1),
        'relatorio_inadimplencia_' || to_char(now(), 'IYYY_IW'),
        jsonb_build_object(
            'semana',            to_char(now(), 'IYYY-IW'),
            'total_vencidas',    (SELECT COUNT(*)   FROM cobrancas WHERE status_cobranca = 'vencido'),
            'valor_vencido',     (SELECT COALESCE(SUM(valor_aberto), 0) FROM cobrancas WHERE status_cobranca = 'vencido'),
            'inadimplentes',     (SELECT COUNT(*)   FROM cobrancas WHERE lembrete_count >= 3 AND status_cobranca != 'pago'),
            'pendentes_hoje',    (SELECT COUNT(*)   FROM cobrancas WHERE status_cobranca = 'pendente'),
            'pagas_semana',      (SELECT COUNT(*)   FROM cobrancas WHERE status_cobranca = 'pago'
                                   AND atualizado_em > now() - INTERVAL '7 days'),
            'gerado_em',         now()
        ),
        now()
    WHERE EXISTS (SELECT 1 FROM profiles WHERE role = 'admin' LIMIT 1)
    ON CONFLICT (user_id, chave)
    DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now();
    $$
) ON CONFLICT (jobname) DO UPDATE
  SET schedule = EXCLUDED.schedule,
      command  = EXCLUDED.command;

-- ============================================================
-- Verificar jobs agendados
-- ============================================================
-- SELECT jobid, jobname, schedule, command, active FROM cron.job ORDER BY jobname;
