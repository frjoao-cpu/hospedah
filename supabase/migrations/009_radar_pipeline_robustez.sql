-- ============================================================
-- HOSPEDAH — Radar IA · robustez do pipeline de captura
--
-- Complementa 008_radar_central_monitoramento.sql.
--
-- Motivação: quando uma varredura terminava com
-- "0 capturas", o operador não conseguia distinguir os três
-- zeros possíveis:
--   1. a credencial da fonte falhou (nada foi buscado);
--   2. o pré-filtro cortou tudo antes da IA;
--   3. tudo já existia (dedupe por fonte_id + external_id).
--
-- Estas colunas são aditivas e opcionais: a Edge Function
-- radar-captura regrava a execução sem elas caso a migration
-- ainda não tenha sido aplicada (PGRST204).
-- ============================================================

-- Itens devolvidos pela fonte antes de qualquer filtro.
alter table public.radar_execucoes
add column if not exists encontrados integer default 0;


-- Itens que passaram no pré-filtro e seguiriam para a IA.
alter table public.radar_execucoes
add column if not exists relevantes integer default 0;


-- Itens ignorados por já existirem (dedupe).
alter table public.radar_execucoes
add column if not exists duplicados integer default 0;


-- ============================================================
-- SCHEMA CACHE — PostgREST
--     Sem o reload, as colunas novas continuam invisíveis
--     para a API e o insert falha com PGRST204.
-- ============================================================
notify pgrst, 'reload schema';
