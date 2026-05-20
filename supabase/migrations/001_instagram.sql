-- ============================================================
-- HOSPEDAH — Tabelas para o Feed do Instagram
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/ydrmjoppjxtmnwtvtinb/sql
-- ============================================================

-- Cache de posts do Instagram (atualizado pela Edge Function)
create table if not exists instagram_cache (
    id            text        primary key,
    media_type    text        not null,
    media_url     text,
    thumbnail_url text,
    permalink     text        not null,
    caption       text,
    timestamp     timestamptz not null,
    cached_at     timestamptz not null default now()
);

-- Índice para busca por data de cache (usado no filtro de TTL)
create index if not exists instagram_cache_cached_at_idx
    on instagram_cache (cached_at desc);

-- Índice para ordenação por data do post
create index if not exists instagram_cache_timestamp_idx
    on instagram_cache (timestamp desc);

-- Configurações dinâmicas da integração Instagram
-- Usada para armazenar o token renovado automaticamente
create table if not exists instagram_config (
    key        text        primary key,
    value      text        not null,
    expires_at timestamptz,
    updated_at timestamptz not null default now()
);

-- Bloqueia acesso público às tabelas (somente service role pode ler/escrever)
alter table instagram_cache  enable row level security;
alter table instagram_config enable row level security;

-- Sem políticas RLS públicas: apenas a Edge Function (service role) acessa
