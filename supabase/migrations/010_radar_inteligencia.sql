-- ============================================================
-- HOSPEDAH — Radar IA · inteligência, automação e custo
--
-- Complementa 008_radar_central_monitoramento.sql e
-- 009_radar_pipeline_robustez.sql.
--
-- O que esta migration habilita:
--   1. dedupe semântico  → a mesma cota anunciada em três
--      fontes vira UMA oportunidade;
--   2. cache de análise  → o mesmo texto não é pago duas
--      vezes à IA;
--   3. RAG de preços     → valor de referência e desconto
--      calculados sobre o histórico da própria HOSPEDAH;
--   4. sinais de negociação → urgência e risco de fraude;
--   5. aprendizado       → desfecho da negociação gravado
--      para recalibrar o score;
--   6. fila com retry    → capturas com falha voltam com
--      espera exponencial e viram dead-letter no limite;
--   7. observabilidade   → tokens, custo e saúde por fonte;
--   8. alertas           → trilha do que já foi avisado.
--
-- Todas as colunas são ADITIVAS: o pipeline continua
-- funcionando (regravando sem elas) se a migration ainda não
-- tiver sido aplicada.
-- ============================================================


-- ============================================================
-- 1. OPORTUNIDADES — memória, preço e sinais
-- ============================================================

-- Hash do texto analisado: chave do cache de análise.
alter table public.radar_oportunidades
add column if not exists hash_texto text;

-- Tokens significativos do anúncio: base do dedupe semântico
-- sem precisar reprocessar o texto inteiro.
alter table public.radar_oportunidades
add column if not exists impressao_digital text;

-- Oportunidade da qual esta é uma repetição em outra fonte.
alter table public.radar_oportunidades
add column if not exists duplicada_de uuid
  references public.radar_oportunidades(id)
  on delete set null;

-- Quantas vezes o mesmo negócio foi reanunciado.
alter table public.radar_oportunidades
add column if not exists ocorrencias integer default 1;

-- BAIXA | MEDIA | ALTA | IMEDIATA
alter table public.radar_oportunidades
add column if not exists urgencia text;

-- BAIXO | MEDIO | ALTO
alter table public.radar_oportunidades
add column if not exists risco_fraude text;

alter table public.radar_oportunidades
add column if not exists sinais_fraude jsonb;

-- Mediana já praticada para o mesmo empreendimento/tipo.
alter table public.radar_oportunidades
add column if not exists valor_referencia numeric;

-- Desconto (%) sobre a referência. Positivo = abaixo do
-- praticado.
alter table public.radar_oportunidades
add column if not exists desconto_pct numeric;

-- Score puro da IA, antes do ajuste por preço/urgência/risco.
alter table public.radar_oportunidades
add column if not exists score_base integer;

-- Aprendizado com feedback: desfecho real da negociação.
alter table public.radar_oportunidades
add column if not exists fechado_em timestamptz;

alter table public.radar_oportunidades
add column if not exists valor_fechado numeric;

alter table public.radar_oportunidades
add column if not exists motivo_desfecho text;

-- Momento em que o time foi alertado (evita alerta repetido).
alter table public.radar_oportunidades
add column if not exists alertado_em timestamptz;


do $$
begin

  if not exists (
    select 1
    from pg_constraint
    where conname = 'radar_opp_urgencia_check'
  ) then

    alter table public.radar_oportunidades
    add constraint radar_opp_urgencia_check
    check (
      urgencia is null
      or urgencia in ('BAIXA', 'MEDIA', 'ALTA', 'IMEDIATA')
    );

  end if;


  if not exists (
    select 1
    from pg_constraint
    where conname = 'radar_opp_risco_check'
  ) then

    alter table public.radar_oportunidades
    add constraint radar_opp_risco_check
    check (
      risco_fraude is null
      or risco_fraude in ('BAIXO', 'MEDIO', 'ALTO')
    );

  end if;

end
$$;


create index if not exists radar_opp_hash_idx
on public.radar_oportunidades(hash_texto);

create index if not exists radar_opp_duplicada_idx
on public.radar_oportunidades(duplicada_de);

create index if not exists radar_opp_criado_idx
on public.radar_oportunidades(criado_em desc);


-- ============================================================
-- 2. FILA — retry exponencial e dead-letter
-- ============================================================

alter table public.radar_capturas
add column if not exists tentativas integer default 0;

-- Enquanto for futura, a captura fica fora do lote.
alter table public.radar_capturas
add column if not exists proxima_tentativa timestamptz;

-- Estado final de quem estourou o limite de tentativas.
do $$
begin

  if exists (
    select 1
    from pg_constraint
    where conname = 'radar_capturas_estado_check'
  ) then

    alter table public.radar_capturas
    drop constraint radar_capturas_estado_check;

  end if;

  alter table public.radar_capturas
  add constraint radar_capturas_estado_check
  check (
    estado in (
      'PENDENTE',
      'ANALISADO',
      'DESCARTADO',
      'ERRO',
      'ABANDONADO'
    )
  );

end
$$;


create index if not exists radar_capturas_fila_idx
on public.radar_capturas(estado, proxima_tentativa);


-- ============================================================
-- 3. FONTES — novos adaptadores oficiais
--    RSS/Atom, e-mail e WhatsApp entram sem scraping:
--    feed público do portal, caixa de entrada própria e
--    webhook autorizado da Z-API.
-- ============================================================

do $$
begin

  if exists (
    select 1
    from pg_constraint
    where conname = 'radar_fontes_tipo_check'
  ) then

    alter table public.radar_fontes
    drop constraint radar_fontes_tipo_check;

  end if;

  alter table public.radar_fontes
  add constraint radar_fontes_tipo_check
  check (
    tipo in (
      'INSTAGRAM_GRAPH',
      'FACEBOOK_GRAPH',
      'RSS',
      'EMAIL',
      'WHATSAPP',
      'MANUAL',
      'IMPORT'
    )
  );

end
$$;


-- Limite de chamadas por varredura e circuit breaker simples.
alter table public.radar_fontes
add column if not exists falhas_consecutivas integer default 0;

-- Enquanto for futura, o robô pula a fonte.
alter table public.radar_fontes
add column if not exists suspensa_ate timestamptz;


-- ============================================================
-- 4. CACHE DE ANÁLISE — o mesmo texto não é pago duas vezes
-- ============================================================
create table if not exists public.radar_analise_cache (

  hash_texto text primary key,

  resultado jsonb not null,

  provedor text,

  modelo text,

  hits integer default 0,

  criado_em timestamptz default now(),

  usado_em timestamptz default now()

);


-- ============================================================
-- 5. USO DE IA — tokens, custo e orçamento
-- ============================================================
create table if not exists public.radar_ia_uso (

  id uuid primary key default gen_random_uuid(),

  acao text,

  provedor text,

  modelo text,

  tokens_entrada integer default 0,

  tokens_saida integer default 0,

  custo_usd numeric default 0,

  cache boolean default false,

  oportunidade_id uuid
    references public.radar_oportunidades(id)
    on delete set null,

  trace_id text,

  criado_em timestamptz default now()

);


create index if not exists radar_ia_uso_criado_idx
on public.radar_ia_uso(criado_em desc);


-- ============================================================
-- 6. ALERTAS — trilha do que foi avisado ao time
-- ============================================================
create table if not exists public.radar_alertas (

  id uuid primary key default gen_random_uuid(),

  oportunidade_id uuid
    references public.radar_oportunidades(id)
    on delete cascade,

  -- WHATSAPP | EMAIL | PAINEL
  canal text not null,

  destino text,

  -- ENVIADO | ERRO | IGNORADO
  status text default 'ENVIADO',

  erro text,

  criado_em timestamptz default now()

);


create index if not exists radar_alertas_opp_idx
on public.radar_alertas(oportunidade_id);


-- ============================================================
-- 7. VISÕES DE SAÚDE E CUSTO
-- ============================================================

-- Custo e volume de IA por dia.
create or replace view public.radar_custo_ia_diario as
select
  date_trunc('day', criado_em)::date as dia,
  provedor,
  count(*)                           as chamadas,
  count(*) filter (where cache)      as do_cache,
  sum(tokens_entrada)                as tokens_entrada,
  sum(tokens_saida)                  as tokens_saida,
  round(sum(custo_usd)::numeric, 4)  as custo_usd
from public.radar_ia_uso
group by 1, 2;


-- Saúde da fila de capturas.
create or replace view public.radar_fila as
select
  estado,
  count(*) as total,
  min(capturado_em) as mais_antiga,
  count(*) filter (
    where proxima_tentativa is not null
      and proxima_tentativa > now()
  ) as aguardando_retry
from public.radar_capturas
group by 1;


-- ============================================================
-- 8. RLS DAS NOVAS TABELAS
--    Leitura para o painel (authenticated); escrita apenas
--    pelas Edge Functions (service role ignora RLS).
-- ============================================================
alter table public.radar_analise_cache
enable row level security;

alter table public.radar_ia_uso
enable row level security;

alter table public.radar_alertas
enable row level security;


drop policy if exists
"radar ia uso select" on public.radar_ia_uso;

create policy "radar ia uso select"
on public.radar_ia_uso
for select to authenticated
using (true);


drop policy if exists
"radar alertas select" on public.radar_alertas;

create policy "radar alertas select"
on public.radar_alertas
for select to authenticated
using (true);


-- O cache guarda o conteúdo bruto analisado: fica restrito às
-- Edge Functions, sem policy de leitura para o painel.


-- ============================================================
-- 9. REALTIME — oportunidade nova aparece sem refresh
-- ============================================================
do $$
begin

  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'radar_oportunidades'
  ) then

    alter publication supabase_realtime
    add table public.radar_oportunidades;

  end if;

end
$$;


-- ============================================================
-- 10. SCHEMA CACHE — PostgREST
--     Sem o reload, as colunas novas continuam invisíveis
--     para a API e o insert falha com PGRST204.
-- ============================================================
notify pgrst, 'reload schema';
