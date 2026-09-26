-- ============================================================
-- HOSPEDAH · Radar IA — 012 VISÕES DE DIAGNÓSTICO (CONSERTO)
--
-- Por que este arquivo existe:
--   Ao rodar `select * from radar_capturas_estado;` o SQL
--   Editor responde
--     ERROR: 42P01: relation "radar_capturas_estado" does not exist
--   quando a 011 não chegou ao fim. A 011 faz saneamento de
--   dados ANTES de criar as visões; se qualquer passo anterior
--   falhar (duplicidade, índice, coluna ausente), o arquivo
--   inteiro é abortado e as visões nunca nascem.
--
--   Esta migration cria SOMENTE as visões de diagnóstico, cada
--   uma isolada num bloco próprio: nenhuma depende da outra e
--   nenhuma depende do saneamento da 011.
--
-- Pré-requisito: 008 aplicada (tabela public.radar_capturas).
-- Idempotente: pode ser executada quantas vezes for preciso.
-- ============================================================


-- ============================================================
-- 1. PRÉ-REQUISITO
-- ============================================================
do $$
begin

  if to_regclass('public.radar_capturas') is null then
    raise exception
      'radar_capturas não existe. Aplique 007 e 008 antes da 012.';
  end if;

end
$$;


-- ============================================================
-- 2. VISÕES
--    security_invoker (a visão respeita a RLS de quem lê) só
--    existe a partir do PostgreSQL 15; em bancos anteriores a
--    opção aborta o comando, então só é usada quando suportada.
--    Cada visão é criada em seu próprio bloco com tratamento
--    de erro: uma falha vira aviso e não impede as demais.
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
  begin
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
  exception
    when others then
      raise notice
        'radar_capturas_estado não criada: % (%)', sqlerrm, sqlstate;
  end;

  -- As falhas, agrupadas pela mensagem: mostra exatamente
  -- quantas e quais são (ex.: as 4 falhas de um lote).
  begin
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
  exception
    when others then
      raise notice
        'radar_capturas_falhas não criada: % (%)', sqlerrm, sqlstate;
  end;

  -- Capturas que a análise deveria ter tirado da fila e não
  -- tirou (pendentes antigas): sintoma do UPDATE que falhava.
  begin
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
  exception
    when others then
      raise notice
        'radar_capturas_travadas não criada: % (%)', sqlerrm, sqlstate;
  end;

end
$$;


-- ============================================================
-- 3. PERMISSÕES
--    Sem security_invoker (PostgreSQL 14) a visão roda com os
--    direitos do dono, então o revoke do anon é o que impede a
--    fila de vazar para quem não está autenticado.
-- ============================================================
do $$
declare
  v text;
begin

  foreach v in array array[
    'radar_capturas_estado',
    'radar_capturas_falhas',
    'radar_capturas_travadas'
  ]
  loop

    if to_regclass('public.' || v) is null then
      continue;
    end if;

    begin
      execute format('revoke all on public.%I from anon', v);
      execute format(
        'grant select on public.%I to authenticated', v);
      execute format(
        'grant select on public.%I to service_role', v);
    exception
      -- Banco sem os papéis do Supabase (ex.: cópia local).
      when undefined_object then
        raise notice
          'Papéis anon/authenticated/service_role ausentes.';
    end;

  end loop;

end
$$;


-- ============================================================
-- 4. SCHEMA CACHE — PostgREST
-- ============================================================
notify pgrst, 'reload schema';
