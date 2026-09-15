create extension if not exists pgcrypto;


create table if not exists public.radar_empreendimentos (

 id uuid primary key default gen_random_uuid(),

 nome text unique not null,

 cidade text,

 estado text,

 aliases text[] default '{}',

 ativo boolean default true,

 criado_em timestamptz default now()

);


create table if not exists public.radar_oportunidades (

 id uuid primary key default gen_random_uuid(),

 fonte text,

 rede_social text,

 url_original text,

 texto_original text,

 empreendimento text,

 cidade text,

 estado text,

 tipo_oportunidade text,

 periodo_inicio date,

 periodo_fim date,

 numero_semana integer,

 dormitorios integer,

 capacidade_adultos integer,

 capacidade_criancas integer,

 valor_anunciado numeric,

 situacao_cota text,

 propriedade text,

 nome_anunciante text,

 contato text,

 resumo_ia text,

 score_confianca integer,

 score_oportunidade integer,

 status text default 'VALIDAR',

 criado_em timestamptz default now(),

 atualizado_em timestamptz default now()

);


create table if not exists public.radar_analises (

 id uuid primary key default gen_random_uuid(),

 oportunidade_id uuid
 references public.radar_oportunidades(id)
 on delete cascade,

 modelo text,

 prompt_version text,

 resultado jsonb,

 criado_em timestamptz default now()

);


create index if not exists radar_opp_status_idx

on public.radar_oportunidades(status);


create index if not exists radar_opp_periodo_idx

on public.radar_oportunidades(
 periodo_inicio,
 periodo_fim
);


create index if not exists radar_opp_score_idx

on public.radar_oportunidades(
 score_oportunidade desc
);


insert into public.radar_empreendimentos
(
 nome,
 cidade,
 estado,
 aliases
)
values

(
 'Hot Beach Suítes',
 'Olímpia',
 'SP',
 array[
   'Hot Beach Suites',
   'Hot Beach'
 ]
),

(
 'Thermas de São Pedro',
 'São Pedro',
 'SP',
 array[
   'São Pedro Thermas',
   'Thermas São Pedro'
 ]
),

(
 'Olímpia Park Resort',
 'Olímpia',
 'SP',
 array[
   'Olimpia Park'
 ]
),

(
 'Solar das Águas',
 'Olímpia',
 'SP',
 array[
   'Solar das Aguas'
 ]
),

(
 'Ipioca Beach Resort',
 'Maceió',
 'AL',
 array[
   'Ipioca Beach'
 ]
),

(
 'Wyndham Gramado Termas Resort',
 'Gramado',
 'RS',
 array[
   'Wyndham Gramado'
 ]
),

(
 'Golden Laghetto Resort',
 'Gramado',
 'RS',
 array[
   'Golden Laghetto'
 ]
),

(
 'Porto 2 Life',
 'Porto de Galinhas',
 'PE',
 array[
   'Porto2Life'
 ]
),

(
 'Juquehy',
 'São Sebastião',
 'SP',
 array[
   'Juquehy Resort'
 ]
),

(
 'Ondas Praia',
 'Porto Seguro',
 'BA',
 array[
   'Ondas Praia'
 ]
),

(
 'Barretos Country',
 'Barretos',
 'SP',
 array[
   'Barretos Country'
 ]
),

(
 'Ubatuba',
 'Ubatuba',
 'SP',
 array[
   'Ubatuba'
 ]
)

on conflict (nome)
do nothing;


alter table public.radar_oportunidades
enable row level security;


alter table public.radar_analises
enable row level security;


alter table public.radar_empreendimentos
enable row level security;


drop policy if exists
"radar authenticated select"
on public.radar_oportunidades;


drop policy if exists
"radar authenticated insert"
on public.radar_oportunidades;


drop policy if exists
"radar authenticated update"
on public.radar_oportunidades;


drop policy if exists
"radar authenticated delete"
on public.radar_oportunidades;


create policy
"radar authenticated select"

on public.radar_oportunidades

for select

to authenticated

using (true);


create policy
"radar authenticated insert"

on public.radar_oportunidades

for insert

to authenticated

with check (true);


create policy
"radar authenticated update"

on public.radar_oportunidades

for update

to authenticated

using (true);


create policy
"radar authenticated delete"

on public.radar_oportunidades

for delete

to authenticated

using (true);


create policy
"radar analyses select"

on public.radar_analises

for select

to authenticated

using (true);


create policy
"radar enterprises select"

on public.radar_empreendimentos

for select

to authenticated

using (true);


-- Mantém atualizado_em sempre atualizado a cada UPDATE
create or replace function
public.radar_touch_atualizado_em()

returns trigger

language plpgsql

as $$

begin

  new.atualizado_em = now();

  return new;

end;

$$;


drop trigger if exists
radar_oportunidades_touch
on public.radar_oportunidades;


create trigger
radar_oportunidades_touch

before update
on public.radar_oportunidades

for each row

execute function
public.radar_touch_atualizado_em();
