-- ============================================================
-- HOSPEDAH · Radar IA — 014 INTELIGÊNCIA AVANÇADA
--
-- Por que este arquivo existe:
--
--   1) DEDUPE SEMÂNTICO (pgvector)
--      Até aqui a duplicidade era medida por sobreposição de
--      palavras (Jaccard). O mesmo anúncio reescrito passava
--      como novo. Agora cada texto ganha um embedding e a
--      comparação é por significado.
--
--   2) INTELIGÊNCIA COMPETITIVA (grupos)
--      A mesma cota costuma aparecer em várias fontes e com
--      preços diferentes. O grupo reúne essas aparições e
--      mostra menor preço, variação e tempo em mercado.
--
--   3) SAÚDE OPERACIONAL (incidentes)
--      Fila travada, fonte falhando e custo de IA estourando
--      já eram visíveis nos dados, mas ninguém era avisado.
--      A tabela de incidentes evita repetir o mesmo alerta.
--
--   4) RLS DE MENOR PRIVILÉGIO
--      As políticas da 007 usavam "using (true)": qualquer
--      usuário autenticado lia e alterava tudo. Passam a exigir
--      papel admin/proprietário, no mesmo padrão da 002.
--
-- Pré-requisitos: 007, 008 e 010 aplicadas.
-- Idempotente: pode ser executada quantas vezes for preciso.
-- Cada passo é isolado: se um falhar, os outros continuam e a
-- causa aparece como NOTICE.
-- ============================================================


-- ============================================================
-- 1. PRÉ-REQUISITOS
-- ============================================================
do $$
begin

  if to_regclass('public.radar_oportunidades') is null then
    raise exception
      'radar_oportunidades não existe. Aplique a 007 antes da 014.';
  end if;

  if to_regclass('public.radar_capturas') is null then
    raise exception
      'radar_capturas não existe. Aplique a 008 antes da 014.';
  end if;

  raise notice 'Pré-requisitos OK.';

end
$$;


-- ============================================================
-- 2. EXTENSÃO pgvector
--
--   Sem ela o dedupe semântico simplesmente não liga: as Edge
--   Functions continuam usando a similaridade por palavras.
--   Por isso a falha aqui é apenas avisada, não fatal.
-- ============================================================
do $$
begin

  create extension if not exists vector;

  raise notice 'Extensão vector disponível.';

exception when others then
  raise notice
    'Não foi possível habilitar a extensão vector: %. '
    'O Radar continua funcionando com a similaridade por '
    'palavras (Jaccard).', sqlerrm;
end
$$;


-- ============================================================
-- 3. EMBEDDINGS
--
--   Guardados por hash do texto, não por oportunidade: o mesmo
--   anúncio capturado duas vezes reaproveita o vetor e não paga
--   a IA de novo. A dimensão padrão (768) acompanha os modelos
--   de embedding usados pela função (text-embedding-3-small
--   truncado e text-embedding-004 do Gemini).
-- ============================================================
do $$
begin

  if not exists (
    select 1 from pg_extension where extname = 'vector'
  ) then
    raise notice
      'Extensão vector ausente — passo 3 (embeddings) ignorado.';
    return;
  end if;

  create table if not exists public.radar_embeddings (

    hash_texto text primary key,

    embedding vector(768) not null,

    modelo text,

    provedor text,

    -- Última oportunidade que usou este vetor: serve para o
    -- dedupe devolver um alvo sem varrer a tabela inteira.
    oportunidade_id uuid
      references public.radar_oportunidades(id)
      on delete set null,

    empreendimento text,

    criado_em timestamptz default now(),

    usado_em timestamptz default now()

  );

  create index if not exists radar_embeddings_opp_idx
  on public.radar_embeddings(oportunidade_id);

  create index if not exists radar_embeddings_usado_idx
  on public.radar_embeddings(usado_em desc);

  raise notice 'Passo 3 OK: public.radar_embeddings.';

exception when others then
  raise notice 'Passo 3 (embeddings) falhou: %', sqlerrm;
end
$$;


-- Índice aproximado (HNSW) para a busca por similaridade.
-- Fica em bloco próprio porque exige pgvector recente; sem ele
-- a busca ainda funciona, só varre mais linhas.
do $$
begin

  if to_regclass('public.radar_embeddings') is null then
    raise notice 'Índice HNSW ignorado: tabela ausente.';
    return;
  end if;

  create index if not exists radar_embeddings_hnsw_idx
  on public.radar_embeddings
  using hnsw (embedding vector_cosine_ops);

  raise notice 'Índice HNSW OK.';

exception when others then
  raise notice
    'Índice HNSW indisponível (%). A busca vetorial continua '
    'funcionando por varredura sequencial.', sqlerrm;
end
$$;


-- ============================================================
-- 4. BUSCA VETORIAL
--
--   Função chamada pela Edge Function. SECURITY DEFINER para
--   que a busca funcione sem afrouxar o RLS da tabela.
-- ============================================================
do $$
begin

  if to_regclass('public.radar_embeddings') is null then
    raise notice 'Passo 4 (busca vetorial) ignorado: tabela ausente.';
    return;
  end if;

  execute $fn$
    create or replace function public.radar_buscar_semelhantes(
      p_embedding      vector(768),
      p_limiar         double precision default 0.88,
      p_limite         integer          default 5,
      p_empreendimento text             default null,
      p_desde          timestamptz      default null
    )
    returns table (
      oportunidade_id uuid,
      hash_texto      text,
      similaridade    double precision
    )
    language sql
    stable
    security definer
    set search_path = public
    as $corpo$
      select
        e.oportunidade_id,
        e.hash_texto,
        1 - (e.embedding <=> p_embedding) as similaridade
      from public.radar_embeddings e
      where e.oportunidade_id is not null
        and (
          p_empreendimento is null
          or e.empreendimento = p_empreendimento
        )
        and (p_desde is null or e.criado_em >= p_desde)
        and 1 - (e.embedding <=> p_embedding) >= p_limiar
      order by e.embedding <=> p_embedding
      limit greatest(1, least(50, p_limite));
    $corpo$;
  $fn$;

  raise notice 'Passo 4 OK: radar_buscar_semelhantes().';

exception when others then
  raise notice 'Passo 4 (busca vetorial) falhou: %', sqlerrm;
end
$$;


-- ============================================================
-- 5. INTELIGÊNCIA COMPETITIVA — grupos
--
--   Um grupo é "a mesma cota, vista em lugares diferentes".
--   A oportunidade aponta para o grupo; o grupo acumula o
--   menor e o maior preço vistos e quantas fontes distintas
--   anunciaram o mesmo negócio.
-- ============================================================
do $$
begin

  create table if not exists public.radar_grupos (

    id uuid primary key default gen_random_uuid(),

    empreendimento text,

    tipo_oportunidade text,

    -- Rótulo legível: "Golden Laghetto · VENDA_COTA · sem. 32".
    rotulo text,

    periodo_inicio date,

    periodo_fim date,

    numero_semana integer,

    anuncios integer default 1,

    fontes integer default 1,

    valor_minimo numeric,

    valor_maximo numeric,

    -- Primeiro e último anúncio: base do "tempo em mercado".
    primeiro_em timestamptz default now(),

    ultimo_em timestamptz default now(),

    criado_em timestamptz default now()

  );

  create index if not exists radar_grupos_emp_idx
  on public.radar_grupos(empreendimento, tipo_oportunidade);

  create index if not exists radar_grupos_ultimo_idx
  on public.radar_grupos(ultimo_em desc);

  raise notice 'Passo 5 OK: public.radar_grupos.';

exception when others then
  raise notice 'Passo 5 (grupos) falhou: %', sqlerrm;
end
$$;


do $$
begin

  alter table public.radar_oportunidades
  add column if not exists grupo_id uuid
    references public.radar_grupos(id)
    on delete set null;

  create index if not exists radar_opp_grupo_idx
  on public.radar_oportunidades(grupo_id);

  raise notice 'Passo 5.1 OK: radar_oportunidades.grupo_id.';

exception when others then
  raise notice 'Passo 5.1 (grupo_id) falhou: %', sqlerrm;
end
$$;


-- Visão de leitura do painel: preço, dispersão e tempo em
-- mercado de cada grupo com mais de um anúncio.
do $$
begin

  if to_regclass('public.radar_grupos') is null then
    raise notice 'Passo 5.2 ignorado: radar_grupos ausente.';
    return;
  end if;

  execute $v$
    create or replace view public.radar_grupos_resumo as
    select
      g.id,
      g.rotulo,
      g.empreendimento,
      g.tipo_oportunidade,
      g.anuncios,
      g.fontes,
      g.valor_minimo,
      g.valor_maximo,
      case
        when g.valor_minimo is null
          or g.valor_minimo = 0
          or g.valor_maximo is null
        then null
        else round(
          ((g.valor_maximo - g.valor_minimo) / g.valor_minimo)
          * 100
        )
      end as variacao_pct,
      g.primeiro_em,
      g.ultimo_em,
      greatest(
        0,
        extract(day from (g.ultimo_em - g.primeiro_em))::integer
      ) as dias_em_mercado
    from public.radar_grupos g
    where g.anuncios > 1
    order by g.ultimo_em desc;
  $v$;

  begin
    grant select on public.radar_grupos_resumo to authenticated;
  exception when others then
    raise notice 'grant de radar_grupos_resumo ignorado: %', sqlerrm;
  end;

  raise notice 'Passo 5.2 OK: radar_grupos_resumo.';

exception when others then
  raise notice 'Passo 5.2 (visão de grupos) falhou: %', sqlerrm;
end
$$;


-- ============================================================
-- 6. SAÚDE OPERACIONAL — incidentes
--
--   Sem isto, uma fila travada só aparecia se alguém abrisse o
--   painel. A tabela guarda o que já foi avisado para não
--   repetir o mesmo alerta a cada rodada do cron.
-- ============================================================
do $$
begin

  create table if not exists public.radar_incidentes (

    id uuid primary key default gen_random_uuid(),

    -- FILA_TRAVADA | FONTE_FALHANDO | CUSTO_ALTO |
    -- SEM_CAPTURA | DEAD_LETTER
    tipo text not null,

    -- Identifica o objeto afetado (id da fonte, 'global'…).
    alvo text not null default 'global',

    severidade text default 'AVISO',

    mensagem text,

    detalhes jsonb,

    -- ABERTO | RESOLVIDO
    estado text default 'ABERTO',

    notificado_em timestamptz,

    criado_em timestamptz default now(),

    atualizado_em timestamptz default now()

  );

  create index if not exists radar_incidentes_estado_idx
  on public.radar_incidentes(estado, criado_em desc);

  raise notice 'Passo 6 OK: public.radar_incidentes.';

exception when others then
  raise notice 'Passo 6 (incidentes) falhou: %', sqlerrm;
end
$$;


-- Um incidente ABERTO por tipo+alvo: a rodada seguinte
-- atualiza em vez de criar outro.
do $$
begin

  if to_regclass('public.radar_incidentes') is null then
    raise notice 'Passo 6.1 ignorado: tabela ausente.';
    return;
  end if;

  create unique index if not exists radar_incidentes_aberto_idx
  on public.radar_incidentes(tipo, alvo)
  where estado = 'ABERTO';

  raise notice 'Passo 6.1 OK: um incidente aberto por tipo+alvo.';

exception when others then
  raise notice 'Passo 6.1 (índice de incidentes) falhou: %', sqlerrm;
end
$$;


-- ============================================================
-- 7. RLS DE MENOR PRIVILÉGIO
--
--   A 007 liberava tudo para qualquer usuário autenticado.
--   Aqui o acesso passa a exigir papel admin/proprietário,
--   igual ao restante do sistema (migration 002).
--
--   Se a tabela public.profiles não existir nesta instalação,
--   o helper mantém o comportamento antigo e avisa: travar o
--   painel inteiro seria pior que o risco que se quer corrigir.
-- ============================================================
do $$
declare
  tem_profiles boolean;
begin

  tem_profiles := to_regclass('public.profiles') is not null;

  if tem_profiles then

    execute $fn$
      create or replace function public.radar_operador()
      returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $corpo$
        select
          auth.role() = 'service_role'
          or exists (
            select 1
            from public.profiles p
            where p.id = auth.uid()
              and p.role in ('admin', 'proprietario')
          );
      $corpo$;
    $fn$;

    raise notice
      'Passo 7 OK: radar_operador() exige papel '
      'admin/proprietario em public.profiles.';

  else

    execute $fn$
      create or replace function public.radar_operador()
      returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $corpo$
        select auth.uid() is not null
            or auth.role() = 'service_role';
      $corpo$;
    $fn$;

    raise notice
      'ATENÇÃO: public.profiles não existe nesta instalação. '
      'radar_operador() continua aceitando qualquer usuário '
      'autenticado. Crie profiles(id, role) e reaplique a 014 '
      'para restringir o Radar a admin/proprietario.';

  end if;

  begin
    grant execute on function public.radar_operador()
    to authenticated;
  exception when others then
    raise notice 'grant de radar_operador ignorado: %', sqlerrm;
  end;

exception when others then
  raise notice 'Passo 7 (helper de papel) falhou: %', sqlerrm;
end
$$;


-- Troca das políticas permissivas por políticas de papel.
do $$
declare
  alvo text;
  tabelas text[] := array[
    'radar_oportunidades',
    'radar_analises',
    'radar_alvos',
    'radar_fontes',
    'radar_capturas',
    'radar_execucoes',
    'radar_alertas',
    'radar_analise_cache',
    'radar_ia_uso',
    'radar_grupos',
    'radar_incidentes',
    'radar_embeddings'
  ];
begin

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'radar_operador'
      and n.nspname = 'public'
  ) then
    raise notice
      'Passo 7.1 ignorado: radar_operador() não foi criada.';
    return;
  end if;

  foreach alvo in array tabelas loop

    if to_regclass('public.' || alvo) is null then
      raise notice 'Tabela % ausente — ignorada.', alvo;
      continue;
    end if;

    begin

      execute format(
        'alter table public.%I enable row level security', alvo
      );

      -- Políticas permissivas conhecidas da 007/008/010.
      execute format(
        'drop policy if exists "radar authenticated select" '
        'on public.%I', alvo
      );

      execute format(
        'drop policy if exists "radar authenticated insert" '
        'on public.%I', alvo
      );

      execute format(
        'drop policy if exists "radar authenticated update" '
        'on public.%I', alvo
      );

      execute format(
        'drop policy if exists "radar authenticated delete" '
        'on public.%I', alvo
      );

      execute format(
        'drop policy if exists "radar analyses select" '
        'on public.%I', alvo
      );

      execute format(
        'drop policy if exists "radar central authenticated" '
        'on public.%I', alvo
      );

      execute format(
        'drop policy if exists "radar inteligencia authenticated" '
        'on public.%I', alvo
      );

      execute format(
        'drop policy if exists "radar operador" on public.%I', alvo
      );

      execute format(
        'create policy "radar operador" on public.%I '
        'for all to authenticated '
        'using (public.radar_operador()) '
        'with check (public.radar_operador())', alvo
      );

      raise notice 'RLS de % restrita a admin/proprietario.', alvo;

    exception when others then
      raise notice 'RLS de % não pôde ser ajustada: %', alvo, sqlerrm;
    end;

  end loop;

end
$$;


-- radar_empreendimentos continua legível por qualquer usuário
-- autenticado: é um catálogo de nomes de resort, não contém
-- dado sensível e o painel precisa dele para montar filtros.
do $$
begin

  if to_regclass('public.radar_empreendimentos') is null then
    raise notice 'radar_empreendimentos ausente — ignorada.';
    return;
  end if;

  drop policy if exists "radar enterprises write"
  on public.radar_empreendimentos;

  create policy "radar enterprises write"
  on public.radar_empreendimentos
  for all
  to authenticated
  using (public.radar_operador())
  with check (public.radar_operador());

  raise notice 'Escrita de radar_empreendimentos restrita.';

exception when others then
  raise notice 'Política de radar_empreendimentos falhou: %', sqlerrm;
end
$$;


-- ============================================================
-- 8. SCHEMA CACHE
--
--   Sem isto o PostgREST devolve PGRST204 nas colunas novas.
-- ============================================================
do $$
begin
  notify pgrst, 'reload schema';
  raise notice 'Schema cache do PostgREST recarregado.';
exception when others then
  raise notice 'notify pgrst ignorado: %', sqlerrm;
end
$$;


-- ============================================================
-- 9. CONFERÊNCIA
--
--   select count(*) from public.radar_embeddings;
--   select * from public.radar_grupos_resumo limit 10;
--   select * from public.radar_incidentes where estado='ABERTO';
--   select public.radar_operador();
--
--   Para promover um usuário do painel:
--     update public.profiles
--        set role = 'admin'
--      where id = '<uuid do usuário>';
-- ============================================================
