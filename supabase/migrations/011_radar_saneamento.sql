-- ============================================================
-- HOSPEDAH · Radar IA — 011 SANEAMENTO E DIAGNÓSTICO
--
-- Complementa as migrations 007/008/009/010. Roda no SQL
-- Editor do Supabase e é idempotente: pode ser executada
-- quantas vezes forem necessárias.
--
-- O que ela resolve:
--   1. Oportunidades duplicadas geradas pela MESMA captura
--      (quando o UPDATE de estado falhava, a captura voltava
--      para a fila e era analisada de novo).
--   2. Garantia no banco de que uma captura gera no máximo
--      uma oportunidade.
--   3. Índices que faltavam para o dedupe por hash/impressão.
--   4. Visões de diagnóstico: quanto está PENDENTE, ANALISADO,
--      DESCARTADO, ERRO ou ABANDONADO e qual foi o erro.
--   5. Função para devolver à fila as capturas travadas.
--
-- Pré-requisito: 007, 008, 009 e 010 já aplicadas. Os blocos
-- que dependem de colunas novas se auto-desligam se elas não
-- existirem, então nada quebra num banco atrasado.
-- ============================================================


-- ============================================================
-- 1. REPARO — oportunidades duplicadas pela mesma captura
--    Mantém a mais antiga (a que o funil já conhece), marca as
--    demais como DESCARTADA apontando para ela e soma as
--    ocorrências na sobrevivente.
-- ============================================================
do $$
declare
  tem_captura boolean;
  tem_duplicada boolean;
  tem_ocorrencias boolean;
begin

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'radar_oportunidades'
      and column_name = 'captura_id'
  ) into tem_captura;

  if not tem_captura then
    raise notice
      'radar_oportunidades.captura_id ausente: aplique a 008 antes.';
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'radar_oportunidades'
      and column_name = 'duplicada_de'
  ) into tem_duplicada;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'radar_oportunidades'
      and column_name = 'ocorrencias'
  ) into tem_ocorrencias;

  create temporary table radar_dup_tmp on commit drop as
  select
    o.id,
    first_value(o.id) over (
      partition by o.captura_id
      order by o.criado_em, o.id
    ) as principal
  from public.radar_oportunidades o
  where o.captura_id is not null;

  delete from radar_dup_tmp where id = principal;

  if not exists (select 1 from radar_dup_tmp) then
    raise notice 'Nenhuma oportunidade duplicada por captura.';
    return;
  end if;

  if tem_ocorrencias then
    execute $sql$
      update public.radar_oportunidades p
      set ocorrencias = coalesce(p.ocorrencias, 1) + d.extras
      from (
        select principal, count(*) as extras
        from radar_dup_tmp
        group by principal
      ) d
      where p.id = d.principal
    $sql$;
  end if;

  if tem_duplicada then
    execute $sql$
      update public.radar_oportunidades o
      set status = 'DESCARTADA',
          duplicada_de = d.principal,
          captura_id = null
      from radar_dup_tmp d
      where o.id = d.id
    $sql$;
  else
    execute $sql$
      update public.radar_oportunidades o
      set status = 'DESCARTADA',
          captura_id = null
      from radar_dup_tmp d
      where o.id = d.id
    $sql$;
  end if;

  raise notice
    'Oportunidades duplicadas saneadas: %',
    (select count(*) from radar_dup_tmp);

end
$$;


-- ============================================================
-- 2. GARANTIA — uma captura, uma oportunidade
--    Índice parcial (captura_id nulo continua livre: análises
--    antigas e manuais sem captura não conflitam).
-- ============================================================
do $$
begin

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'radar_oportunidades'
      and column_name = 'captura_id'
  ) then

    create unique index if not exists
    radar_opp_captura_unica_idx
    on public.radar_oportunidades(captura_id)
    where captura_id is not null;

  end if;

end
$$;


-- ============================================================
-- 3. ÍNDICES DO DEDUPE
--    O radar-ia procura duplicadas por hash exato e depois por
--    similaridade entre as recentes do mesmo empreendimento.
-- ============================================================
do $$
begin

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'radar_oportunidades'
      and column_name = 'hash_texto'
  ) then

    create index if not exists radar_opp_hash_idx
    on public.radar_oportunidades(hash_texto);

  end if;

end
$$;


create index if not exists radar_opp_emp_criado_idx
on public.radar_oportunidades(empreendimento, criado_em desc);


create index if not exists radar_capturas_oportunidade_idx
on public.radar_capturas(oportunidade_id);


-- ============================================================
-- 4. DIAGNÓSTICO — o que está PENDENTE / ANALISADO / ERRO
-- ============================================================

-- Uma linha por estado: é a resposta direta para
-- "conferir PENDENTE / ANALISADO / ERRO no SQL".
create or replace view public.radar_capturas_estado
with (security_invoker = true) as
select
  coalesce(estado, 'SEM_ESTADO')        as estado,
  count(*)                              as total,
  count(*) filter (where erro is not null) as com_erro,
  count(oportunidade_id)                as com_oportunidade,
  min(capturado_em)                     as mais_antiga,
  max(capturado_em)                     as mais_recente
from public.radar_capturas
group by 1;


-- As falhas, agrupadas pela mensagem: mostra exatamente
-- quantas e quais são (ex.: as 4 falhas de um lote).
create or replace view public.radar_capturas_falhas
with (security_invoker = true) as
select
  coalesce(erro, 'sem mensagem')  as erro,
  count(*)                        as capturas,
  min(capturado_em)               as mais_antiga,
  max(atualizado_em)              as ultima_ocorrencia,
  (array_agg(id order by atualizado_em desc))[1:5] as exemplos
from public.radar_capturas
where estado in ('ERRO', 'ABANDONADO')
group by 1;


-- Capturas que a análise deveria ter tirado da fila e não
-- tirou (pendentes antigas): sintoma do UPDATE que falhava.
create or replace view public.radar_capturas_travadas
with (security_invoker = true) as
select
  id,
  fonte_id,
  alvo_id,
  estado,
  erro,
  oportunidade_id,
  capturado_em,
  atualizado_em
from public.radar_capturas
where estado = 'PENDENTE'
  and capturado_em < now() - interval '2 hours'
order by capturado_em;


-- ============================================================
-- 5. REENFILEIRAR — devolve capturas travadas para a fila
--    Uso:
--      select public.radar_reenfileirar();               -- ERRO/ABANDONADO
--      select public.radar_reenfileirar('{uuid,uuid}');  -- escolhidas
-- ============================================================
create or replace function public.radar_reenfileirar(
  p_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  afetadas integer;
  tem_fila boolean;
begin

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'radar_capturas'
      and column_name = 'tentativas'
  ) into tem_fila;

  if tem_fila then

    update public.radar_capturas
    set estado = 'PENDENTE',
        erro = null,
        tentativas = 0,
        proxima_tentativa = null
    where (p_ids is null and estado in ('ERRO', 'ABANDONADO'))
       or (p_ids is not null and id = any (p_ids));

  else

    update public.radar_capturas
    set estado = 'PENDENTE',
        erro = null
    where (p_ids is null and estado in ('ERRO', 'ABANDONADO'))
       or (p_ids is not null and id = any (p_ids));

  end if;

  get diagnostics afetadas = row_count;

  return afetadas;

end
$$;


-- A função é operação de manutenção: só o painel autenticado
-- (e as Edge Functions, que ignoram RLS) podem chamar.
revoke all on function public.radar_reenfileirar(uuid[]) from public;
revoke all on function public.radar_reenfileirar(uuid[]) from anon;
grant execute on function public.radar_reenfileirar(uuid[]) to authenticated;
grant execute on function public.radar_reenfileirar(uuid[]) to service_role;


-- ============================================================
-- 6. PERMISSÕES DAS VISÕES
--    security_invoker: a visão respeita a RLS de quem lê, sem
--    abrir a fila para o anon.
-- ============================================================
grant select on public.radar_capturas_estado    to authenticated;
grant select on public.radar_capturas_falhas    to authenticated;
grant select on public.radar_capturas_travadas  to authenticated;


-- ============================================================
-- 7. SCHEMA CACHE — PostgREST
-- ============================================================
notify pgrst, 'reload schema';
