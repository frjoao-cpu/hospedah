-- ============================================================
-- HOSPEDAH — Radar IA → Central de Monitoramento
--
-- Migration ADITIVA: não altera nem substitui a
-- 007_radar_ia.sql (já aplicada em produção).
--
-- Fluxo alvo:
--   o robô encontra  → radar_capturas
--   a IA entende     → radar_analises
--   o Radar seleciona→ radar_oportunidades (alvo + motivo)
--   a HOSPEDAH negocia → negociacao_status
--
-- Execute no SQL Editor do Supabase DEPOIS da 007.
-- ============================================================

create extension if not exists pgcrypto;


-- ============================================================
-- 1. ALVOS — o que o robô deve procurar
-- ============================================================
create table if not exists public.radar_alvos (

  id uuid primary key default gen_random_uuid(),

  nome text not null,

  descricao text,

  -- Nomes de public.radar_empreendimentos (coluna única).
  -- Vazio = qualquer empreendimento.
  empreendimentos text[] default '{}',

  cidades text[] default '{}',

  estados text[] default '{}',

  -- Subconjunto dos TIPOS da Edge Function radar-ia.
  -- Vazio = qualquer tipo de negócio.
  tipos_negocio text[] default '{}',

  -- Janela de período: datas fixas e/ou "próximos N dias"
  -- e/ou semanas do ano (ISO).
  periodo_inicio date,

  periodo_fim date,

  janela_dias integer,

  semanas integer[] default '{}',

  valor_min numeric,

  valor_max numeric,

  dormitorios_min integer,

  capacidade_min integer,

  score_minimo integer default 60,

  prioridade integer default 3,

  ativo boolean default true,

  -- Cadência de varredura do robô, em minutos.
  cadencia_minutos integer default 360,

  ultima_varredura timestamptz,

  criado_por uuid,

  criado_em timestamptz default now(),

  atualizado_em timestamptz default now()

);


-- ============================================================
-- 2. FONTES — onde o robô deve procurar
-- ============================================================
create table if not exists public.radar_fontes (

  id uuid primary key default gen_random_uuid(),

  nome text unique not null,

  -- INSTAGRAM_GRAPH / FACEBOOK_GRAPH → APIs oficiais da Meta.
  -- MANUAL / IMPORT → conteúdo colado pelo operador.
  tipo text not null default 'MANUAL',

  -- Hashtag, ig-user-id, page-id, id do grupo, etc.
  identificador_externo text,

  config jsonb default '{}'::jsonb,

  -- NAO_CONFIGURADA | OK | ERRO | EXPIRADA
  credencial_status text default 'NAO_CONFIGURADA',

  credencial_mensagem text,

  ultimo_cursor text,

  ultima_sincronizacao timestamptz,

  ativo boolean default true,

  criado_em timestamptz default now(),

  atualizado_em timestamptz default now()

);


do $$
begin

  if not exists (
    select 1
    from pg_constraint
    where conname = 'radar_fontes_tipo_check'
  ) then

    alter table public.radar_fontes
    add constraint radar_fontes_tipo_check
    check (
      tipo in (
        'INSTAGRAM_GRAPH',
        'FACEBOOK_GRAPH',
        'MANUAL',
        'IMPORT'
      )
    );

  end if;


  if not exists (
    select 1
    from pg_constraint
    where conname = 'radar_fontes_credencial_check'
  ) then

    alter table public.radar_fontes
    add constraint radar_fontes_credencial_check
    check (
      credencial_status in (
        'NAO_CONFIGURADA',
        'OK',
        'ERRO',
        'EXPIRADA'
      )
    );

  end if;

end
$$;


insert into public.radar_fontes
(
  nome,
  tipo,
  credencial_status,
  credencial_mensagem
)
values

(
  'Manual',
  'MANUAL',
  'OK',
  'Conteúdo colado pelo operador no painel.'
),

(
  'Importação em lote',
  'IMPORT',
  'OK',
  'Lote de anúncios colado pelo operador.'
)

on conflict (nome)
do nothing;


-- ============================================================
-- 3. VÍNCULO ALVO ↔ FONTE
-- ============================================================
create table if not exists public.radar_alvo_fontes (

  alvo_id uuid not null
    references public.radar_alvos(id)
    on delete cascade,

  fonte_id uuid not null
    references public.radar_fontes(id)
    on delete cascade,

  criado_em timestamptz default now(),

  primary key (alvo_id, fonte_id)

);


-- ============================================================
-- 4. CAPTURAS — camada crua, antes da IA
-- ============================================================
create table if not exists public.radar_capturas (

  id uuid primary key default gen_random_uuid(),

  fonte_id uuid
    references public.radar_fontes(id)
    on delete set null,

  alvo_id uuid
    references public.radar_alvos(id)
    on delete set null,

  -- Id do post na API oficial — base do dedupe.
  external_id text,

  autor text,

  permalink text,

  texto text not null,

  midia_url text,

  midia_tipo text,

  publicado_em timestamptz,

  capturado_em timestamptz default now(),

  -- PENDENTE | ANALISADO | DESCARTADO | ERRO
  estado text default 'PENDENTE',

  motivo text,

  erro text,

  oportunidade_id uuid
    references public.radar_oportunidades(id)
    on delete set null,

  payload jsonb,

  atualizado_em timestamptz default now()

);


do $$
begin

  if not exists (
    select 1
    from pg_constraint
    where conname = 'radar_capturas_estado_check'
  ) then

    alter table public.radar_capturas
    add constraint radar_capturas_estado_check
    check (
      estado in (
        'PENDENTE',
        'ANALISADO',
        'DESCARTADO',
        'ERRO'
      )
    );

  end if;

end
$$;


-- ============================================================
-- 5. EXECUÇÕES — saúde do robô
-- ============================================================
create table if not exists public.radar_execucoes (

  id uuid primary key default gen_random_uuid(),

  alvo_id uuid
    references public.radar_alvos(id)
    on delete set null,

  fonte_id uuid
    references public.radar_fontes(id)
    on delete set null,

  -- CAPTURA | ANALISE
  origem text default 'CAPTURA',

  iniciado_em timestamptz default now(),

  finalizado_em timestamptz,

  capturados integer default 0,

  analisados integer default 0,

  aprovados integer default 0,

  descartados integer default 0,

  -- OK | PARCIAL | ERRO
  status text default 'OK',

  erro text,

  trace_id text,

  criado_em timestamptz default now()

);


-- ============================================================
-- 6. OPORTUNIDADES — colunas aditivas
--    (status legado permanece intacto)
-- ============================================================
alter table public.radar_oportunidades
add column if not exists alvo_id uuid
  references public.radar_alvos(id)
  on delete set null;


alter table public.radar_oportunidades
add column if not exists captura_id uuid
  references public.radar_capturas(id)
  on delete set null;


alter table public.radar_oportunidades
add column if not exists motivo_selecao text;


alter table public.radar_oportunidades
add column if not exists negociacao_status text
  default 'NOVA';


alter table public.radar_oportunidades
add column if not exists responsavel text;


update public.radar_oportunidades
set negociacao_status = 'NOVA'
where negociacao_status is null;


do $$
begin

  if not exists (
    select 1
    from pg_constraint
    where conname =
      'radar_oportunidades_negociacao_check'
  ) then

    alter table public.radar_oportunidades
    add constraint
      radar_oportunidades_negociacao_check
    check (
      negociacao_status in (
        'NOVA',
        'EM_NEGOCIACAO',
        'GANHA',
        'PERDIDA'
      )
    );

  end if;

end
$$;


-- ============================================================
-- 7. ÍNDICES
-- ============================================================
-- Índice unique TOTAL (sem WHERE): índice
-- parcial não é inferido pelo ON CONFLICT
-- (fonte_id, external_id) usado pelo upsert
-- do PostgREST. Linhas com external_id nulo
-- nunca conflitam entre si (NULL <> NULL),
-- então o comportamento é o mesmo.
create unique index if not exists
radar_capturas_dedupe_idx

on public.radar_capturas(
  fonte_id,
  external_id
);


create index if not exists radar_capturas_estado_idx
on public.radar_capturas(estado);


create index if not exists radar_capturas_alvo_idx
on public.radar_capturas(alvo_id);


create index if not exists radar_opp_alvo_idx
on public.radar_oportunidades(alvo_id);


create index if not exists radar_opp_negociacao_idx
on public.radar_oportunidades(negociacao_status);


create index if not exists radar_execucoes_criado_idx
on public.radar_execucoes(criado_em desc);


create index if not exists radar_alvos_ativo_idx
on public.radar_alvos(ativo);


-- ============================================================
-- 8. RLS
--    alvos e vínculos: CRUD para authenticated (é o painel).
--    fontes, capturas e execuções: leitura para authenticated,
--    escrita apenas pela service role (Edge Functions).
-- ============================================================
alter table public.radar_alvos
enable row level security;

alter table public.radar_alvo_fontes
enable row level security;

alter table public.radar_fontes
enable row level security;

alter table public.radar_capturas
enable row level security;

alter table public.radar_execucoes
enable row level security;


drop policy if exists
"radar alvos select" on public.radar_alvos;

drop policy if exists
"radar alvos insert" on public.radar_alvos;

drop policy if exists
"radar alvos update" on public.radar_alvos;

drop policy if exists
"radar alvos delete" on public.radar_alvos;


create policy "radar alvos select"
on public.radar_alvos
for select to authenticated
using (true);

create policy "radar alvos insert"
on public.radar_alvos
for insert to authenticated
with check (true);

create policy "radar alvos update"
on public.radar_alvos
for update to authenticated
using (true);

create policy "radar alvos delete"
on public.radar_alvos
for delete to authenticated
using (true);


drop policy if exists
"radar alvo fontes select"
on public.radar_alvo_fontes;

drop policy if exists
"radar alvo fontes insert"
on public.radar_alvo_fontes;

drop policy if exists
"radar alvo fontes delete"
on public.radar_alvo_fontes;


create policy "radar alvo fontes select"
on public.radar_alvo_fontes
for select to authenticated
using (true);

create policy "radar alvo fontes insert"
on public.radar_alvo_fontes
for insert to authenticated
with check (true);

create policy "radar alvo fontes delete"
on public.radar_alvo_fontes
for delete to authenticated
using (true);


drop policy if exists
"radar fontes select" on public.radar_fontes;

create policy "radar fontes select"
on public.radar_fontes
for select to authenticated
using (true);


drop policy if exists
"radar capturas select" on public.radar_capturas;

create policy "radar capturas select"
on public.radar_capturas
for select to authenticated
using (true);


drop policy if exists
"radar execucoes select"
on public.radar_execucoes;

create policy "radar execucoes select"
on public.radar_execucoes
for select to authenticated
using (true);


-- ============================================================
-- 9. TRIGGERS — reaproveita radar_touch_atualizado_em (007)
-- ============================================================
drop trigger if exists radar_alvos_touch
on public.radar_alvos;

create trigger radar_alvos_touch
before update on public.radar_alvos
for each row
execute function public.radar_touch_atualizado_em();


drop trigger if exists radar_fontes_touch
on public.radar_fontes;

create trigger radar_fontes_touch
before update on public.radar_fontes
for each row
execute function public.radar_touch_atualizado_em();


drop trigger if exists radar_capturas_touch
on public.radar_capturas;

create trigger radar_capturas_touch
before update on public.radar_capturas
for each row
execute function public.radar_touch_atualizado_em();


-- ============================================================
-- 10. SCHEMA CACHE — PostgREST
--     Sem o reload, as colunas novas continuam invisíveis
--     para a API e o insert falha com PGRST204
--     ("Could not find the 'x' column ... in the schema
--     cache").
-- ============================================================
notify pgrst, 'reload schema';
