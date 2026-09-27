-- ============================================================
-- HOSPEDAH — Radar IA
-- 015 — Fontes genéricas (motor aberto e configurável)
--
-- A Edge Function radar-captura passou a ter um motor por
-- FAMÍLIA de fonte (página pública, feed RSS/Atom, API JSON).
-- Adicionar um portal novo virou cadastro: tipo + config.url.
--
-- Esta migration só abre o CHECK de public.radar_fontes.tipo
-- para os novos tipos genéricos. Nenhuma tabela, coluna ou
-- dado é alterado — a configuração continua no campo `config`
-- que já existe.
--
-- Idempotente: pode rodar mais de uma vez.
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
      -- APIs oficiais da Meta (sem scraping).
      'INSTAGRAM_GRAPH',
      'FACEBOOK_GRAPH',
      -- Motor de página pública: config.url.
      'WEB',
      'WEB_PUBLICA',
      'SITE',
      'HTML',
      -- Motor de feed: config.url.
      'RSS',
      'ATOM',
      'FEED',
      -- Motor de API JSON: config.url + config.items_path.
      'API',
      'JSON_API',
      -- Entrada por webhook (ainda sem motor na captura).
      'EMAIL',
      'WHATSAPP',
      -- Alimentadas pelo operador.
      'MANUAL',
      'IMPORT'
    )
  );

  raise notice '015: radar_fontes.tipo aceita os tipos genéricos.';

end
$$;

-- Documentação viva da configuração por tipo de fonte.
comment on column public.radar_fontes.config is
  'Configuração da fonte em JSON. WEB/WEB_PUBLICA/SITE/HTML, '
  'RSS/ATOM/FEED e API/JSON_API usam {"url": "https://..."}; '
  'API aceita ainda {"items_path": "data"} para apontar a lista '
  'dentro do JSON. INSTAGRAM_GRAPH usa {"modo": "hashtag|usuario", '
  '"ig_user_id": "..."}. Nenhum site é codificado na Edge '
  'Function: fonte nova é cadastro, não alteração de código.';
