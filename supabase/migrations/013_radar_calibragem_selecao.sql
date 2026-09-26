-- ============================================================
-- HOSPEDAH · Radar IA — 013 CALIBRAGEM DA SELEÇÃO
--
-- Por que este arquivo existe:
--   O funil fechou: "Lidas: 8 · Analisadas: 8 · Selecionadas: 0
--   · Descartadas: 8". Duas causas somadas.
--
--   1) A seleção comparava o nome devolvido pela IA com o nome
--      cadastrado no alvo por igualdade exata. "Golden Laghetto"
--      não batia com "Golden Laghetto Resort". Corrigido nas
--      Edge Functions (_shared/radar.ts), sem mudança de schema.
--
--   2) score_minimo nasce em 60 (migration 008). Somado a um
--      prompt deliberadamente conservador, quase todo anúncio
--      cai abaixo do corte. Esta migration baixa o PADRÃO para
--      45 — patamar que ainda filtra ruído sem sufocar o funil.
--
--   Alvos JÁ cadastrados não são alterados: o valor deles pode
--   ter sido escolhido de propósito. Para revisá-los, veja a
--   seção 3 (executar manualmente, se fizer sentido).
--
-- Pré-requisito: 008 aplicada (tabela public.radar_alvos).
-- Idempotente: pode ser executada quantas vezes for preciso.
-- ============================================================


-- ============================================================
-- 1. PRÉ-REQUISITO
-- ============================================================
do $$
begin

  if to_regclass('public.radar_alvos') is null then
    raise exception
      'radar_alvos não existe. Aplique 007 e 008 antes da 013.';
  end if;

  raise notice 'Pré-requisito OK: public.radar_alvos encontrada.';

end
$$;


-- ============================================================
-- 2. NOVO PADRÃO DE score_minimo PARA ALVOS NOVOS
-- ============================================================
do $$
begin

  alter table public.radar_alvos
  alter column score_minimo set default 45;

  raise notice
    'score_minimo padrão de novos alvos agora é 45 (era 60).';

end
$$;


-- ============================================================
-- 3. REVISÃO DOS ALVOS JÁ CADASTRADOS (MANUAL)
--
-- Esta migration NÃO mexe nos alvos existentes. Rode o SELECT
-- abaixo para ver quem está com o corte antigo e, se concordar,
-- rode o UPDATE.
--
--   select id, nome, score_minimo
--   from public.radar_alvos
--   where ativo and score_minimo >= 60
--   order by nome;
--
--   update public.radar_alvos
--   set score_minimo = 45
--   where ativo and score_minimo = 60;
--
-- Depois de baixar o corte, devolva as capturas descartadas
-- para a fila pelo botão REAVALIAR DESCARTADAS do painel (ou
-- pela ação reenfileirar_descartadas da função radar-ia). O
-- cache por hash do texto evita pagar a IA de novo por elas.
-- ============================================================


-- ============================================================
-- 4. DIAGNÓSTICO: POR QUE AS CAPTURAS FORAM DESCARTADAS
--
-- Agrupa o motivo gravado em radar_capturas.motivo pelo trecho
-- inicial, que identifica a regra que reprovou a captura.
-- ============================================================
do $$
begin

  execute $ddl$
    create or replace view public.radar_descartes_por_motivo as
    select
      case
        when motivo ilike 'Empreendimento não identificado%'
          then 'Empreendimento não identificado'
        when motivo ilike 'Empreendimento%'   then 'Empreendimento fora do alvo'
        when motivo ilike 'Tipo de negócio%'  then 'Tipo de negócio fora do alvo'
        when motivo ilike 'Score%'            then 'Score abaixo do mínimo'
        when motivo ilike 'Período%'          then 'Período fora da janela'
        when motivo ilike 'Semana%'           then 'Semana fora do alvo'
        when motivo ilike 'Valor%'            then 'Valor fora da faixa'
        when motivo ilike 'Dormitórios%'      then 'Dormitórios abaixo do mínimo'
        when motivo ilike 'Capacidade%'       then 'Capacidade abaixo do mínimo'
        when motivo ilike '%duplicad%'
          or motivo ilike '%já havia gerado%'
          or motivo ilike '%já registrada%'
          or motivo ilike 'Mesmo contato%'
          or motivo ilike 'Conteúdo equivalente%'
          or motivo ilike 'Texto idêntico%'
                                              then 'Duplicada'
        when motivo is null                   then 'Sem motivo gravado'
        else 'Outro'
      end as regra,
      count(*) as quantidade
    from public.radar_capturas
    where estado = 'DESCARTADO'
    group by 1
    order by 2 desc
  $ddl$;

  raise notice 'Visão public.radar_descartes_por_motivo criada.';

exception when others then
  raise notice
    'Não foi possível criar radar_descartes_por_motivo: %', sqlerrm;
end
$$;


do $$
begin

  -- Papéis do Supabase podem não existir num banco local:
  -- nenhum destes passos pode derrubar a migration.
  begin
    revoke all on public.radar_descartes_por_motivo from anon;
  exception when others then
    raise notice 'revoke de anon ignorado: %', sqlerrm;
  end;

  begin
    grant select on public.radar_descartes_por_motivo
    to authenticated;
  exception when others then
    raise notice 'grant para authenticated ignorado: %', sqlerrm;
  end;

end
$$;


-- ============================================================
-- 5. CONFERÊNCIA
--
--   select * from public.radar_descartes_por_motivo;
--
--   select column_default
--   from information_schema.columns
--   where table_name = 'radar_alvos'
--     and column_name = 'score_minimo';
-- ============================================================
