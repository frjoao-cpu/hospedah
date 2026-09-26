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
-- 0. PRÉ-REQUISITO
--    Sem a 008 não existe fila de capturas: melhor parar aqui
--    com uma mensagem clara do que falhar no meio do arquivo.
-- ============================================================
do $$
begin

  if to_regclass('public.radar_capturas') is null then
    raise exception
      'radar_capturas não existe. Aplique 007 e 008 antes da 011.';
  end if;

  if to_regclass('public.radar_oportunidades') is null then
    raise exception
      'radar_oportunidades não existe. Aplique a 007 antes da 011.';
  end if;

end
$$;


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

  -- Fora de transação o ON COMMIT DROP não roda: a segunda
  -- execução na mesma sessão encontraria a tabela de pé.
  drop table if exists radar_dup_tmp;

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
declare
  duplicadas integer;
begin

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'radar_oportunidades'
      and column_name = 'captura_id'
  ) then
    return;
  end if;

  select count(*) into duplicadas
  from (
    select captura_id
    from public.radar_oportunidades
    where captura_id is not null
    group by captura_id
    having count(*) > 1
  ) d;

  -- Criar o índice com duplicidade pendente abortaria o
  -- arquivo inteiro (e as visões do passo 4 nem chegariam a
  -- ser criadas). Melhor avisar e seguir.
  if duplicadas > 0 then
    raise notice
      'Ainda há % captura(s) com mais de uma oportunidade: '
      'índice único não criado. Revise e rode a 011 de novo.',
      duplicadas;
    return;
  end if;

  create unique index if not exists
  radar_opp_captura_unica_idx
  on public.radar_oportunidades(captura_id)
  where captura_id is not null;

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
--    security_invoker (a visão respeita a RLS de quem lê) só
--    existe a partir do PostgreSQL 15. Em bancos anteriores a
--    opção aborta o arquivo inteiro — e era isso que deixava
--    as visões sem criar, com o erro 42P01 na hora de
--    consultá-las. Aqui a opção só é usada quando suportada.
-- ============================================================
do $$
declare
  opcao text := case
    when current_setting('server_version_num')::int >= 150000
      then ' with (security_invoker = true)'
    else ''
  end;
begin

  -- Uma linha por estado: é a resposta direta para
  -- "conferir PENDENTE / ANALISADO / ERRO no SQL".
  execute
    'create or replace view public.radar_capturas_estado' ||
    opcao || ' as
     select
       coalesce(estado, ''SEM_ESTADO'')          as estado,
       count(*)                                  as total,
       count(*) filter (where erro is not null)  as com_erro,
       count(oportunidade_id)                    as com_oportunidade,
       min(capturado_em)                         as mais_antiga,
       max(capturado_em)                         as mais_recente
     from public.radar_capturas
     group by 1';

  -- As falhas, agrupadas pela mensagem: mostra exatamente
  -- quantas e quais são (ex.: as 4 falhas de um lote).
  execute
    'create or replace view public.radar_capturas_falhas' ||
    opcao || ' as
     select
       coalesce(erro, ''sem mensagem'')  as erro,
       count(*)                          as capturas,
       min(capturado_em)                 as mais_antiga,
       max(atualizado_em)                as ultima_ocorrencia,
       (array_agg(id order by atualizado_em desc))[1:5] as exemplos
     from public.radar_capturas
     where estado in (''ERRO'', ''ABANDONADO'')
     group by 1';

  -- Capturas que a análise deveria ter tirado da fila e não
  -- tirou (pendentes antigas): sintoma do UPDATE que falhava.
  execute
    'create or replace view public.radar_capturas_travadas' ||
    opcao || ' as
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
     where estado = ''PENDENTE''
       and capturado_em < now() - interval ''2 hours''
     order by capturado_em';

end
$$;


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

do $$
begin

  revoke all on function public.radar_reenfileirar(uuid[]) from anon;
  grant execute on function public.radar_reenfileirar(uuid[])
    to authenticated;
  grant execute on function public.radar_reenfileirar(uuid[])
    to service_role;

exception
  -- Banco sem os papéis do Supabase (ex.: cópia local).
  when undefined_object then
    raise notice 'Papéis anon/authenticated/service_role ausentes.';
end
$$;


-- ============================================================
-- 6. PERMISSÕES DAS VISÕES
--    Sem security_invoker (PostgreSQL 14) a visão roda com os
--    direitos do dono, então o revoke do anon é o que impede a
--    fila de vazar para quem não está autenticado.
-- ============================================================
do $$
begin

  revoke all on public.radar_capturas_estado    from anon;
  revoke all on public.radar_capturas_falhas    from anon;
  revoke all on public.radar_capturas_travadas  from anon;

  grant select on public.radar_capturas_estado    to authenticated;
  grant select on public.radar_capturas_falhas    to authenticated;
  grant select on public.radar_capturas_travadas  to authenticated;

exception
  when undefined_object then
    raise notice 'Papéis anon/authenticated ausentes.';
end
$$;


-- ============================================================
-- 7. SCHEMA CACHE — PostgREST
-- ============================================================
notify pgrst, 'reload schema';
